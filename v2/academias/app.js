import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase=createClient('https://pacnegivzgxpanphrnwp.supabase.co','sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);
const money=new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0});
const longDate=new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',year:'numeric'});
const typeLabels={general:'General',goalkeeper:'Porteros',forwards:'Delanteros',tactical:'Táctica'};
let ctx=null,academies=[],enrollments=[],staff=[],staffOptions=[],pending=[],receivables=[];
let currentAcademy=null,currentStep='datos',canWrite=false,canMoney=false;
let convertingProspect=null,payingReceivable=null;

function show(id){['loadingView','deniedView','view'].forEach(v=>$(v)?.classList.toggle('hidden',v!==id));}
function safe(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function message(id,text='',type='error'){const e=$(id);if(!e)return;e.textContent=text;e.dataset.type=type;e.classList.toggle('hidden',!text);}
async function rpc(name,params={}){const {data,error}=await supabase.rpc(name,params);if(error)throw error;return data;}
function asNum(v){if(v==null||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;}
function asInt(v){const n=asNum(v);return n==null?null:Math.trunc(n);}
function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function dateFmt(v){if(!v)return '—';const d=new Date(`${String(v).slice(0,10)}T12:00:00`);return Number.isNaN(d.getTime())?'—':longDate.format(d);}
function slugify(v){return String(v||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,120);}
function publicUrl(a=currentAcademy){return a?`${location.origin}/academias/?academia=${encodeURIComponent(a.slug)}`:`${location.origin}/academias/`;}
function toast(text){let el=document.getElementById('academyToast');if(!el){el=document.createElement('div');el.id='academyToast';el.style.cssText='position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:220;background:#07191e;color:#fff;padding:11px 15px;border-radius:12px;font:800 12px Inter,system-ui;box-shadow:0 12px 32px rgba(0,0,0,.25)';document.body.appendChild(el);}el.textContent=text;el.classList.remove('hidden');clearTimeout(el._timer);el._timer=setTimeout(()=>el.classList.add('hidden'),2300);}
async function copyText(text,success='Link copiado'){try{await navigator.clipboard.writeText(text);toast(success);}catch{prompt('Copia el enlace:',text);}}

async function boot(){
  const {data:{session}}=await supabase.auth.getSession();if(!session){location.href='/';return;}
  const rows=await rpc('v2_my_context');if(!rows?.length){$('deniedText').textContent='Tu cuenta no está vinculada a una organización.';show('deniedView');return;}
  ctx=rows[0];const modules=await rpc('v2_my_modules',{organization_id:ctx.organization_id});const mod=modules.find(m=>m.module_code==='academies');
  if(!mod?.enabled||!mod?.can_read){$('deniedText').textContent='Tu rol no tiene acceso a Academias.';show('deniedView');return;}
  $('orgName').textContent=ctx.organization_name||'Tannery City FC';$('roleBadge').textContent=ctx.is_owner?'Presidencia':(ctx.role||'Miembro');
  $('convertStartsOn').value=today();$('paymentDate').value=today();
  await load();show('view');
}

async function load(){
  const currentId=currentAcademy?.id||null;const data=await rpc('v2_academy_admin',{organization_id:ctx.organization_id});
  academies=Array.isArray(data?.academies)?data.academies:[];enrollments=Array.isArray(data?.enrollments)?data.enrollments:[];
  staff=Array.isArray(data?.staff)?data.staff:[];staffOptions=Array.isArray(data?.staffOptions)?data.staffOptions:[];
  pending=Array.isArray(data?.pendingRegistrations)?data.pendingRegistrations:[];receivables=Array.isArray(data?.openReceivables)?data.openReceivables:[];
  const caps=data?.capabilities||{};canWrite=Boolean(caps.canWrite);canMoney=Boolean(caps.canMoney);
  $('newAcademy').classList.toggle('hidden',!canWrite);
  renderBoard();
  if(currentId){currentAcademy=academies.find(a=>a.id===currentId)||null;if(currentAcademy)renderDrawer();}
}

function academyEnrollments(id){return enrollments.filter(e=>e.academyId===id&&e.status==='active');}
function academyStaff(id){return staff.filter(s=>s.academyId===id);}
function academyPending(a){return pending.filter(p=>p.sourceCampaign===`academia:${a.slug}`);}
function academyReceivables(id){const playerIds=new Set(academyEnrollments(id).map(e=>e.playerId));return receivables.filter(r=>playerIds.has(r.playerId));}

function renderBoard(){
  const box=$('academyList');box.innerHTML='';$('empty').classList.toggle('hidden',academies.length>0);
  academies.forEach(a=>{
    const people=academyEnrollments(a.id);const capacity=Number(a.capacity||0);const percent=capacity?Math.min(100,Math.round(people.length/capacity*100)):0;const staffCount=academyStaff(a.id).length;const pendingCount=academyPending(a).length;
    const card=document.createElement('button');card.type='button';card.className='academy-card';card.innerHTML=`
      <div class="academy-card-head"><div><span class="academy-kind">${safe(typeLabels[a.academyType]||a.academyType||'Academia')}</span><h3>${safe(a.name)}</h3></div><span class="academy-staff-flag ${staffCount?'assigned':'unassigned'}">${staffCount?`${staffCount} profesor${staffCount===1?'':'es'}`:'sin profesor'}</span></div>
      <div class="academy-meta"><span><span class="tos-icon tos-icon-pin" aria-hidden="true"></span>${safe(a.location||'Sede por definir')}</span><span><span class="tos-icon tos-icon-ball" aria-hidden="true"></span>${money.format(Number(a.monthlyFee||0))}/mes</span></div>
      <div class="academy-numbers"><div class="academy-number"><span>Inscritos</span><strong>${people.length}${capacity?` / ${capacity}`:''}</strong><small>${capacity?`${percent}% ocupado`:'sin límite'}</small></div><div class="academy-number"><span>Link público</span><strong>${pendingCount}</strong><small>por confirmar</small></div><div class="academy-number"><span>Cobrar</span><strong>${academyReceivables(a.id).length}</strong><small>abiertos</small></div></div>`;
    card.addEventListener('click',()=>openAcademy(a.id));box.appendChild(card);
  });
}

function openDrawer(){$('backdrop').classList.remove('hidden');$('drawer').classList.remove('hidden');$('drawer').setAttribute('aria-hidden','false');document.body.style.overflow='hidden';}
function closeDrawer(){currentAcademy=null;$('backdrop').classList.add('hidden');$('drawer').classList.add('hidden');$('drawer').setAttribute('aria-hidden','true');document.body.style.overflow='';closeConvert();closePayment();message('academyMessage');}
function setStep(name){currentStep=name;document.querySelectorAll('.operation-pane').forEach(el=>el.classList.toggle('hidden',el.id!==`${name}Step`));document.querySelectorAll('#stepTabs .operation-tab').forEach(el=>el.classList.toggle('active',el.dataset.step===name));if(name==='staff')renderStaffStep();if(name==='cobro')renderCobroStep();}

function openAcademy(id){const a=academies.find(x=>x.id===id);if(!a)return;currentAcademy=a;populateAcademy(a);$('operationActions').classList.remove('hidden');document.querySelectorAll('#stepTabs .operation-tab').forEach(b=>b.disabled=false);setStep('staff');openDrawer();}
function renderDrawer(){if(!currentAcademy)return;populateAcademy(currentAcademy);if(currentStep!=='datos')setStep(currentStep);}

function selectType(type){$('academyType').value=type;document.querySelectorAll('.type-card').forEach(b=>b.classList.toggle('active',b.dataset.type===type));}
function setFormDisabled(disabled){['academyName','academySlug','academyFee','academyCapacity','academyLocation','academyDescription','saveAcademy'].forEach(id=>$(id).disabled=disabled);document.querySelectorAll('.type-card').forEach(b=>b.disabled=disabled);}

function clearAcademy(){
  currentAcademy=null;['academyName','academySlug','academyFee','academyCapacity','academyLocation','academyDescription'].forEach(id=>$(id).value='');$('academyCapacity').value='0';selectType('general');
  $('drawerEyebrow').textContent='NUEVA ACADEMIA';$('drawerTitle').textContent='Crear academia';$('drawerMeta').textContent='Nombre, tipo y cuota mensual';$('drawerStatus').classList.add('hidden');$('operationActions').classList.add('hidden');
  document.querySelectorAll('#stepTabs .operation-tab').forEach(b=>{b.disabled=b.dataset.step!=='datos';});setFormDisabled(!canWrite);setStep('datos');message('academyMessage');openDrawer();
}
function populateAcademy(a){
  $('academyName').value=a.name||'';$('academySlug').value=a.slug||'';$('academyFee').value=a.monthlyFee??'';$('academyCapacity').value=a.capacity??0;$('academyLocation').value=a.location||'';$('academyDescription').value=a.description||'';selectType(a.academyType||'general');setFormDisabled(!canWrite);
  $('drawerEyebrow').textContent=(typeLabels[a.academyType]||'ACADEMIA').toUpperCase();$('drawerTitle').textContent=a.name;$('drawerMeta').textContent=`${money.format(Number(a.monthlyFee||0))}/mes · ${a.location||'Sede por definir'}`;$('drawerStatus').textContent=a.status==='active'?'Activa':(a.status||'—');$('drawerStatus').className=`status-badge ${a.status==='active'?'active':''}`;$('drawerStatus').classList.remove('hidden');
}
async function saveAcademy(e){
  e.preventDefault();if(!canWrite)return;const btn=$('saveAcademy');btn.disabled=true;message('academyMessage');
  try{
    const name=$('academyName').value.trim();if(name.length<2)throw new Error('Escribe el nombre de la academia.');
    const slug=$('academySlug').value.trim()||slugify(name);if(slug.length<2)throw new Error('Escribe un nombre válido para el enlace.');
    const id=await rpc('v2_upsert_academy_enhanced',{organization_id:ctx.organization_id,academy_id:currentAcademy?.id||null,slug,name,academy_type:$('academyType').value,description:$('academyDescription').value.trim()||null,status:'active',monthly_fee:asNum($('academyFee').value),hourly_rate:null,schedule:[],location:$('academyLocation').value.trim()||null,capacity:asInt($('academyCapacity').value)||0});
    await load();openAcademy(id);toast('Academia guardada');
  }catch(err){message('academyMessage',err.message||'No se pudo guardar la academia.');}finally{btn.disabled=false;}
}

function renderStaffStep(){
  if(!currentAcademy)return;const a=currentAcademy,assigned=academyStaff(a.id);
  $('staffChips').innerHTML=assigned.length?assigned.map(s=>`<span class="staff-chip">${safe(s.displayName)}${canWrite?`<button data-unassign="${safe(s.userId)}" type="button" aria-label="Quitar">×</button>`:''}</span>`).join(''):'<span class="mini-empty">Sin profesor asignado todavía.</span>';
  $('staffChips').querySelectorAll('[data-unassign]').forEach(b=>b.addEventListener('click',()=>unassignStaff(b.dataset.unassign)));
  const assignedIds=new Set(assigned.map(s=>s.userId));const options=staffOptions.filter(o=>!assignedIds.has(o.userId));
  $('staffPicker').innerHTML='<option value="">Selecciona un profesor…</option>'+options.map(o=>`<option value="${safe(o.userId)}">${safe(o.displayName)} · ${safe(o.role)}</option>`).join('');
  $('staffPicker').closest('.staff-add-row').classList.toggle('hidden',!canWrite);

  const people=academyEnrollments(a.id),elist=$('enrollmentList');elist.innerHTML='';$('enrollmentEmpty').classList.toggle('hidden',people.length>0);
  people.forEach(p=>{const row=document.createElement('div');row.className='enrollment-row';row.innerHTML=`<div class="participant-avatar">${safe((p.playerName||'?').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase())}</div><div class="participant-main"><strong>${safe(p.playerName)}</strong><span>${safe(p.playerCode||'')}</span><small>Desde ${dateFmt(p.startsOn)} · ${money.format(Number(p.agreedFee||a.monthlyFee||0))}/mes</small></div><div class="participant-state"><span>Activo</span></div>`;elist.appendChild(row);});

  const pend=academyPending(a),plist=$('pendingList');plist.innerHTML='';$('pendingEmpty').classList.toggle('hidden',pend.length>0);
  pend.forEach(p=>{const row=document.createElement('div');row.className='enrollment-row';row.innerHTML=`<div class="participant-avatar">${safe((p.firstName||'?')[0]||'?').toUpperCase()}</div><div class="participant-main"><strong>${safe([p.firstName,p.lastName].filter(Boolean).join(' '))}</strong><span>${safe(p.guardianName||'')}</span><small>${safe(p.phone||'')} · registrado ${dateFmt(p.createdAt)}</small></div><div class="participant-state">${canWrite?`<button class="collect-button" data-convert="${safe(p.id)}" type="button">Convertir</button>`:'<span>Pendiente</span>'}</div>`;plist.appendChild(row);});
  plist.querySelectorAll('[data-convert]').forEach(b=>b.addEventListener('click',()=>openConvert(b.dataset.convert)));
}
async function assignStaff(){if(!currentAcademy||!canWrite)return;const userId=$('staffPicker').value;if(!userId)return;message('staffMessage');try{await rpc('v2_assign_academy_staff',{organization_id:ctx.organization_id,academy_id:currentAcademy.id,user_id:userId});await load();renderStaffStep();toast('Profesor asignado');}catch(err){message('staffMessage',err.message||'No se pudo asignar.');}}
async function unassignStaff(userId){if(!currentAcademy||!canWrite)return;try{await rpc('v2_unassign_academy_staff',{organization_id:ctx.organization_id,academy_id:currentAcademy.id,user_id:userId});await load();renderStaffStep();toast('Profesor removido');}catch(err){toast(err.message||'No se pudo quitar al profesor.');}}

function openConvert(prospectId){const p=pending.find(x=>x.id===prospectId);if(!p||!canWrite)return;convertingProspect=p;$('convertName').textContent=[p.firstName,p.lastName].filter(Boolean).join(' ');$('convertStartsOn').value=today();$('convertFee').value=currentAcademy?.monthlyFee??'';message('convertMessage');$('convertBackdrop').classList.remove('hidden');$('convertModal').classList.remove('hidden');$('convertModal').setAttribute('aria-hidden','false');}
function closeConvert(){convertingProspect=null;$('convertBackdrop').classList.add('hidden');$('convertModal').classList.add('hidden');$('convertModal').setAttribute('aria-hidden','true');message('convertMessage');}
async function saveConvert(e){e.preventDefault();if(!convertingProspect||!currentAcademy)return;const btn=$('convertSubmit');btn.disabled=true;try{await rpc('v2_convert_and_enroll_academy_prospect',{organization_id:ctx.organization_id,prospect_id:convertingProspect.id,academy_id:currentAcademy.id,starts_on:$('convertStartsOn').value||today(),agreed_fee:asNum($('convertFee').value)});await load();closeConvert();setStep('staff');toast('Tanner inscrito');}catch(err){message('convertMessage',err.message||'No se pudo inscribir.');}finally{btn.disabled=false;}}

function renderCobroStep(){
  if(!currentAcademy)return;$('cobroDenied').classList.toggle('hidden',canMoney);
  const rows=canMoney?academyReceivables(currentAcademy.id):[],box=$('receivablesList');box.innerHTML='';$('receivablesEmpty').classList.toggle('hidden',!canMoney||rows.length>0);
  rows.forEach(r=>{const row=document.createElement('article');row.className='payment-row';row.innerHTML=`<div class="participant-main"><strong>${safe(r.playerName)}</strong><span>${safe(r.concept||'')}</span></div><div class="payment-amounts"><strong>${money.format(Number(r.balanceDue||0))} pendiente</strong><small>vence ${dateFmt(r.dueDate)}</small></div><button class="collect-button" data-pay="${safe(r.chargeId)}" type="button">Cobrar</button>`;row.querySelector('[data-pay]').addEventListener('click',()=>openPayment(r));box.appendChild(row);});
}
function openPayment(r){payingReceivable=r;$('paymentParticipantName').textContent=r.playerName;$('paymentBalance').textContent=`Saldo pendiente: ${money.format(Number(r.balanceDue||0))} · ${r.concept||''}`;$('paymentAmount').value=Number(r.balanceDue||0);$('paymentDate').value=today();$('paymentReference').value='';message('paymentMessage');$('paymentBackdrop').classList.remove('hidden');$('paymentModal').classList.remove('hidden');$('paymentModal').setAttribute('aria-hidden','false');}
function closePayment(){payingReceivable=null;$('paymentBackdrop').classList.add('hidden');$('paymentModal').classList.add('hidden');$('paymentModal').setAttribute('aria-hidden','true');message('paymentMessage');}
async function savePayment(e){e.preventDefault();if(!payingReceivable)return;const btn=$('savePayment');btn.disabled=true;try{await rpc('v2_post_payment',{organization_id:ctx.organization_id,player_id:payingReceivable.playerId,amount:asNum($('paymentAmount').value),payment_date:$('paymentDate').value,method:$('paymentMethod').value,reference:$('paymentReference').value.trim()||null,concept:payingReceivable.concept||'Academia',payer_type:'guardian',payer_name:null,idempotency_key:crypto.randomUUID()});await load();closePayment();setStep('cobro');toast('Pago registrado');}catch(err){message('paymentMessage',err.message||'No se pudo registrar el pago.');}finally{btn.disabled=false;}}

function shareWhatsapp(){if(!currentAcademy)return;const text=`${currentAcademy.name}\n${money.format(Number(currentAcademy.monthlyFee||0))}/mes${currentAcademy.location?` · ${currentAcademy.location}`:''}\nInscríbete: ${publicUrl(currentAcademy)}`;window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,'_blank','noopener');}

$('newAcademy').addEventListener('click',clearAcademy);$('closeDrawer').addEventListener('click',closeDrawer);$('backdrop').addEventListener('click',closeDrawer);
$('copyAcademyLink').addEventListener('click',()=>copyText(publicUrl()));$('shareAcademyWhatsapp').addEventListener('click',shareWhatsapp);
document.querySelectorAll('#stepTabs .operation-tab').forEach(b=>b.addEventListener('click',()=>{if(!b.disabled)setStep(b.dataset.step);}));
document.querySelectorAll('.type-card').forEach(b=>b.addEventListener('click',()=>{if(!b.disabled)selectType(b.dataset.type);}));
$('academyForm').addEventListener('submit',saveAcademy);$('academyName').addEventListener('blur',()=>{if(!currentAcademy&&!$('academySlug').value.trim())$('academySlug').value=slugify($('academyName').value);});
$('addStaff').addEventListener('click',assignStaff);
$('closeConvert').addEventListener('click',closeConvert);$('convertBackdrop').addEventListener('click',closeConvert);$('convertForm').addEventListener('submit',saveConvert);
$('closePayment').addEventListener('click',closePayment);$('paymentBackdrop').addEventListener('click',closePayment);$('paymentForm').addEventListener('submit',savePayment);
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(!$('paymentModal').classList.contains('hidden'))closePayment();else if(!$('convertModal').classList.contains('hidden'))closeConvert();else if(!$('drawer').classList.contains('hidden'))closeDrawer();});

boot().catch(e=>{$('deniedText').textContent=e.message||'No fue posible abrir Academias.';show('deniedView');});
