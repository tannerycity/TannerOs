import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase=createClient(
  'https://pacnegivzgxpanphrnwp.supabase.co',
  'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',
  {auth:{persistSession:true,autoRefreshToken:true}}
);

const $=id=>document.getElementById(id);
let ctx=null,reports=[],current=null,canWrite=false;
const DAY=86400000;

function show(id){['loadingView','deniedView','view'].forEach(v=>$(v)?.classList.toggle('hidden',v!==id));}
function message(id,text='',type='error'){const el=$(id);if(!el)return;el.textContent=text;el.dataset.type=type;el.classList.toggle('hidden',!text);}
async function rpc(name,params={}){const {data,error}=await supabase.rpc(name,params);if(error)throw error;return data;}
function localInput(date=new Date()){const d=new Date(date);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16);}
function toIsoOrNull(v){return v?new Date(v).toISOString():null;}
function fmtDate(v){if(!v)return '—';return new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v));}
function age(birth){if(!birth)return null;const b=new Date(`${birth}T12:00:00`),n=new Date();let a=n.getFullYear()-b.getFullYear();const m=n.getMonth()-b.getMonth();if(m<0||(m===0&&n.getDate()<b.getDate()))a--;return a>=0?a:null;}
function score(v){return v==null||v===''?null:Number(v);}
function safe(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function highInterest(v){return ['alto','alta','high'].includes(String(v||'').trim().toLocaleLowerCase('es-MX'));}
function open(r){return r.status==='open';}
function priority(r){return open(r)&&highInterest(r.interest_level);}
function overdue(r){return open(r)&&r.next_action_at&&new Date(r.next_action_at).getTime()<Date.now();}
function cooling(r){return open(r)&&!r.next_action_at&&r.observed_at&&(Date.now()-new Date(r.observed_at).getTime())>=10*DAY;}
function unplanned(r){return open(r)&&!r.next_action_at;}
function signed(r){return Boolean(r.player_id);}
function daysSince(v){if(!v)return null;return Math.max(0,Math.floor((Date.now()-new Date(v).getTime())/DAY));}
function pipelineMatch(r,value){if(!value)return true;return value==='priority'?priority(r):value==='overdue'?overdue(r):value==='cooling'?cooling(r):value==='unplanned'?unplanned(r):value==='signed'?signed(r):true;}
function pipelineRank(r){if(overdue(r))return 0;if(priority(r))return 1;if(cooling(r))return 2;if(open(r))return 3;if(signed(r))return 4;return 5;}

async function boot(){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session){location.href='/v2';return;}
  const rows=await rpc('v2_my_context');
  if(!rows?.length){$('deniedText').textContent='Tu cuenta no está vinculada a una organización.';show('deniedView');return;}
  ctx=rows[0];
  const modules=await rpc('v2_my_modules',{organization_id:ctx.organization_id});
  const mod=modules.find(m=>m.module_code==='scouting');
  if(!mod?.enabled||!mod?.can_read){$('deniedText').textContent='Tu rol no tiene acceso al módulo de Scouting.';show('deniedView');return;}
  canWrite=Boolean(mod.can_write);
  $('orgName').textContent=ctx.organization_name||'Tannery City FC';
  $('roleBadge').textContent=ctx.is_owner?'Propietario':(ctx.role||'Miembro');
  $('newScout').classList.toggle('hidden',!canWrite);
  await load();
  show('view');
}

async function load(){
  reports=await rpc('v2_scouting_reports',{organization_id:ctx.organization_id,prospect_id:null});
  reports=Array.isArray(reports)?reports:[];
  renderKpis();
  renderList();
}

function renderKpis(){
  const radar=reports.filter(open).length,priorities=reports.filter(priority).length,late=reports.filter(overdue).length,cold=reports.filter(cooling).length,players=reports.filter(signed).length;
  $('kpiRadar').textContent=radar;$('kpiPriority').textContent=priorities;$('kpiOverdue').textContent=late;$('kpiCooling').textContent=cold;$('kpiSigned').textContent=players;
  $('attentionOverdue').textContent=late;$('attentionCooling').textContent=cold;$('attentionPriority').textContent=priorities;
  const state=$('attentionState');state.textContent=late?`${late} vencido${late===1?'':'s'}`:cold?`${cold} enfriándose`:priorities?`${priorities} prioritario${priorities===1?'':'s'}`:'Radar al día';state.dataset.state=late?'danger':cold||priorities?'attention':'ok';
}

function filtered(){
  const status=$('statusFilter').value,pipeline=$('pipelineFilter').value,q=$('searchScout').value.trim().toLocaleLowerCase('es-MX');
  return reports.filter(r=>{
    if(status&&r.status!==status)return false;
    if(!pipelineMatch(r,pipeline))return false;
    if(!q)return true;
    const hay=[r.observed_name,r.player_position,r.category,r.observed_location,r.verdict,r.interest_level,r.guardian_name,r.contact_phone,r.star_quality].filter(Boolean).join(' ').toLocaleLowerCase('es-MX');
    return hay.includes(q);
  }).sort((a,b)=>pipelineRank(a)-pipelineRank(b)||new Date(b.observed_at||0)-new Date(a.observed_at||0));
}

function badges(r){
  const out=[];
  if(signed(r))out.push('<em class="pipeline-badge signed">Fichado</em>');
  if(overdue(r))out.push('<em class="pipeline-badge overdue">Vencido</em>');
  else if(priority(r))out.push('<em class="pipeline-badge priority">Prioritario</em>');
  else if(cooling(r)){const d=daysSince(r.observed_at);out.push(`<em class="pipeline-badge cooling">${d??10}d sin próxima acción</em>`);}
  else if(unplanned(r))out.push('<em class="pipeline-badge unplanned">Sin próxima acción</em>');
  return out.join('');
}

function renderList(){
  const rows=filtered(),list=$('scoutList');list.innerHTML='';$('empty').classList.toggle('hidden',rows.length>0);
  rows.forEach(r=>{
    const avg=[r.technical_score,r.physical_score,r.tactical_score,r.mental_score].filter(v=>v!=null).map(Number);
    const avgText=avg.length?(avg.reduce((a,b)=>a+b,0)/avg.length).toFixed(1):'—';
    const next=r.next_action_at?`Próxima acción · ${fmtDate(r.next_action_at)}`:cooling(r)?`${daysSince(r.observed_at)} días desde la visoría · sin próxima acción`:'Sin próxima acción';
    const card=document.createElement('button');card.type='button';card.className=`scout-row ${overdue(r)?'needs-attention':cooling(r)?'cooling':''}`;card.dataset.reportId=r.id;
    card.innerHTML=`<div class="scout-main"><strong>${safe(r.observed_name||'Sin nombre')}</strong><span>${safe([r.player_position,r.category,r.observed_location].filter(Boolean).join(' · ')||'Sin datos deportivos')}</span><small>${safe(next)}</small><div class="pipeline-badges">${badges(r)}</div></div><div class="scout-side"><b>${avgText}</b><small>${avg.length?'promedio':'sin evaluar'}</small><span class="scout-status ${safe(r.status)}">${r.status==='open'?'Abierta':'Cerrada'}</span>${highInterest(r.interest_level)?'<em>Interés alto</em>':''}</div>`;
    card.addEventListener('click',()=>openReport(r.id));list.appendChild(card);
  });
}

function openCreate(){
  current=null;
  $('drawerEyebrow').textContent='NUEVA VISORÍA';$('drawerName').textContent='Detectar talento';$('drawerMeta').textContent='Registro independiente de Captación';
  $('createSection').classList.remove('hidden');$('detailSection').classList.add('hidden');$('followupSection').classList.add('hidden');
  ['observedName','observedLocation','playerPosition','category','technicalScore','physicalScore','tacticalScore','mentalScore','starQuality','createVerdict','createNotes'].forEach(id=>$(id).value='');
  $('observedAt').value=localInput();message('createMessage');openDrawer();
}

function scoreCards(r){
  const items=[['Técnico',r.technical_score],['Físico',r.physical_score],['Táctico',r.tactical_score],['Mental',r.mental_score]];
  $('scoreCards').innerHTML=items.map(([label,v])=>`<article><span>${label}</span><strong>${v==null?'—':Number(v).toFixed(1)}</strong><small>/ 10</small></article>`).join('');
}

function facts(r){
  const a=age(r.birth_date);
  const rows=[
    ['Contacto',r.contact_phone],['Tutor',r.guardian_name],['Edad',a==null?null:`${a} años`],['Posición',r.player_position],['Categoría',r.category],['Lugar',r.observed_location],['Calidad estrella',r.star_quality],['Origen',r.prospect_id?'Prospecto TannerOS':(r.source||'Visoría directa')],['Próxima acción',r.next_action_at?fmtDate(r.next_action_at):'Sin programar'],['Resultado',r.player_id?'Fichado como jugador':null]
  ].filter(([,v])=>v!=null&&String(v).trim()!=='');
  $('detailFacts').innerHTML=rows.length?rows.map(([k,v])=>`<div><span>${safe(k)}</span><strong>${safe(v)}</strong></div>`).join(''):'<p class="muted">Sin datos adicionales.</p>';
}

async function openReport(id){
  const r=reports.find(x=>x.id===id);if(!r)return;current=r;
  $('drawerEyebrow').textContent='VISORÍA';$('drawerName').textContent=r.observed_name||'Sin nombre';$('drawerMeta').textContent=`${fmtDate(r.observed_at)} · ${r.status==='open'?'Abierta':'Cerrada'}`;
  $('createSection').classList.add('hidden');$('detailSection').classList.remove('hidden');$('followupSection').classList.remove('hidden');
  scoreCards(r);facts(r);
  $('reportStatus').value=r.status||'open';$('interestLevel').value=['alto','medio','bajo'].includes(String(r.interest_level||'').toLowerCase())?String(r.interest_level).toLowerCase():'';
  $('nextActionAt').value=r.next_action_at?localInput(r.next_action_at):'';$('updateVerdict').value=r.verdict||'';$('updateNotes').value=r.notes||'';
  ['reportStatus','interestLevel','nextActionAt','updateVerdict','updateNotes','saveFollowup'].forEach(id=>$(id).disabled=!canWrite);
  message('followupMessage');openDrawer();
}

function openDrawer(){$('backdrop').classList.remove('hidden');$('drawer').classList.remove('hidden');$('drawer').setAttribute('aria-hidden','false');}
function closeDrawer(){current=null;$('backdrop').classList.add('hidden');$('drawer').classList.add('hidden');$('drawer').setAttribute('aria-hidden','true');message('createMessage');message('followupMessage');}

async function saveScout(){
  if(!canWrite)return;
  const name=$('observedName').value.trim();if(!name){message('createMessage','Escribe el nombre del jugador.');return;}
  const scores=['technicalScore','physicalScore','tacticalScore','mentalScore'].map(id=>score($(id).value));
  if(scores.some(v=>v!=null&&(!Number.isFinite(v)||v<0||v>10))){message('createMessage','Los cuatro pilares deben estar entre 0 y 10.');return;}
  const btn=$('saveScout');btn.disabled=true;message('createMessage');
  try{
    const id=await rpc('v2_create_scouting_report',{
      organization_id:ctx.organization_id,prospect_id:null,observed_name:name,observed_at:toIsoOrNull($('observedAt').value),observed_location:$('observedLocation').value.trim()||null,
      player_position:$('playerPosition').value.trim()||null,category:$('category').value.trim()||null,technical_score:scores[0],physical_score:scores[1],tactical_score:scores[2],mental_score:scores[3],
      star_quality:$('starQuality').value.trim()||null,verdict:$('createVerdict').value.trim()||null,notes:$('createNotes').value.trim()||null
    });
    await load();closeDrawer();const created=reports.find(r=>r.id===id);if(created)openReport(created.id);
  }catch(e){message('createMessage',e.message||'No se pudo guardar la visoría.');}finally{btn.disabled=!canWrite;}
}

async function saveFollowup(){
  if(!current||!canWrite)return;const btn=$('saveFollowup');btn.disabled=true;message('followupMessage');
  try{
    await rpc('v2_update_scouting_report',{organization_id:ctx.organization_id,report_id:current.id,status:$('reportStatus').value,interest_level:$('interestLevel').value||null,next_action_at:toIsoOrNull($('nextActionAt').value),verdict:$('updateVerdict').value.trim()||null,notes:$('updateNotes').value.trim()||null});
    const id=current.id;await load();current=reports.find(r=>r.id===id)||null;if(current){await openReport(id);message('followupMessage','Seguimiento guardado.','success');}else closeDrawer();
  }catch(e){message('followupMessage',e.message||'No se pudo guardar el seguimiento.');}finally{btn.disabled=!canWrite;}
}

$('newScout').addEventListener('click',openCreate);$('statusFilter').addEventListener('change',renderList);$('pipelineFilter').addEventListener('change',renderList);$('searchScout').addEventListener('input',renderList);document.querySelectorAll('[data-pipeline]').forEach(b=>b.addEventListener('click',()=>{$('pipelineFilter').value=b.dataset.pipeline;renderList();document.querySelector('.scout-list')?.scrollIntoView({behavior:'smooth',block:'start'});}));$('closeDrawer').addEventListener('click',closeDrawer);$('backdrop').addEventListener('click',closeDrawer);$('saveScout').addEventListener('click',saveScout);$('saveFollowup').addEventListener('click',saveFollowup);
boot().catch(e=>{$('deniedText').textContent=e.message||'No fue posible abrir Scouting.';show('deniedView');});