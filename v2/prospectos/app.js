import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase=createClient(
  'https://pacnegivzgxpanphrnwp.supabase.co',
  'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',
  {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}
);

const PHOTO_BUCKET='tanneros-prospect-photos';
const $=id=>document.getElementById(id);
let ctx=null,prospects=[],filtered=[],current=null,moduleRows=[],categories=[];

const statusLabel={
  new:'Nuevo',contacted:'Contactado',trial_scheduled:'Prueba agendada',
  trial_completed:'Prueba realizada',converted:'Convertido',
  not_continuing:'No continúa',archived:'Archivado'
};
const footLabel={right:'Derecha',left:'Izquierda',both:'Ambas'};
const typeLabel={player:'Jugador',goalkeeper:'Portero',program:'Programa',event:'Evento',general:'General'};
const terminalStatuses=new Set(['converted','not_continuing','archived']);

function show(id){['loadingView','deniedView','prospectsView'].forEach(v=>$(v)?.classList.toggle('hidden',v!==id));}
function msg(id,text='',type='error'){const el=$(id);if(!el)return;el.textContent=text;el.dataset.type=type;el.classList.toggle('hidden',!text);}
async function rpc(name,params={}){const {data,error}=await supabase.rpc(name,params);if(error)throw error;return data;}
function fmtDate(v){if(!v)return '—';return new Intl.DateTimeFormat('es-MX',{dateStyle:'medium'}).format(new Date(v));}
function fmtDateTime(v){if(!v)return '—';return new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v));}
function localDateTimeValue(v){const d=v?new Date(v):new Date();const z=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;}
function todayLocal(){const d=new Date(),z=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`;}
function nameOf(p){return [p.first_name,p.last_name].filter(Boolean).join(' ').trim();}
function active(p){return !terminalStatuses.has(p.status);}
function overdue(p){return active(p)&&p.next_action_at&&new Date(p.next_action_at).getTime()<Date.now();}
function upcoming(p){if(!active(p)||!p.next_action_at)return false;const t=new Date(p.next_action_at).getTime(),now=Date.now();return t>=now&&t<=now+48*60*60*1000;}
function needsContact(p){return p.status==='new';}
function campaignName(code){
  if(!code)return 'General';
  const known={captacion_porteros_2026:'Captación Porteros 2026',captacion_jugadores_2026:'Captación Jugadores 2026',registro_general_2026:'Registro general 2026'};
  return known[code]||String(code).replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
}
function sourceName(source){return source||'Sin origen';}
function waUrl(phone){const digits=String(phone||'').replace(/\D/g,'');return digits.length>=8?`https://wa.me/${digits}`:null;}
function friendly(e){const s=String(e?.message||e||'Ocurrió un error.');if(/possible duplicate player/i.test(s))return 'Ya existe un Tanner activo con el mismo nombre y fecha de nacimiento. Revisa antes de convertir.';if(/ux_players_active_category_jersey|duplicate key/i.test(s))return 'Ese número de camiseta ya está ocupado en la categoría seleccionada.';if(/not authorized/i.test(s))return 'Tu rol no tiene permiso para convertir prospectos.';return s;}

async function boot(){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session){location.href='/';return;}
  const rows=await rpc('v2_my_context');
  if(!rows?.length){$('deniedText').textContent='Tu cuenta no está vinculada a un club.';show('deniedView');return;}
  ctx=rows[0];
  moduleRows=await rpc('v2_my_modules',{organization_id:ctx.organization_id});
  const prospectsMod=moduleRows.find(m=>m.module_code==='prospects');
  const scoutingMod=moduleRows.find(m=>m.module_code==='scouting');
  const playersMod=moduleRows.find(m=>m.module_code==='players');
  if(!(prospectsMod?.enabled&&prospectsMod?.can_read)&&!(scoutingMod?.enabled&&scoutingMod?.can_read)){
    $('deniedText').textContent='Tu rol no tiene acceso a Prospectos ni Scouting.';show('deniedView');return;
  }
  ctx.canProspectsWrite=Boolean(prospectsMod?.enabled&&prospectsMod?.can_write);
  ctx.canScoutingRead=Boolean(scoutingMod?.enabled&&scoutingMod?.can_read);
  ctx.canScoutingWrite=Boolean(scoutingMod?.enabled&&scoutingMod?.can_write);
  ctx.canPlayersWrite=Boolean(playersMod?.enabled&&playersMod?.can_write);
  $('orgName').textContent=ctx.organization_name||'Tannery City FC';
  $('roleBadge').textContent=ctx.is_owner?'Propietario':ctx.role;
  await Promise.all([loadProspects(),loadCategories()]);
  show('prospectsView');
}

async function loadCategories(){
  try{categories=await rpc('v2_player_categories',{organization_id:ctx.organization_id})||[];}catch{categories=[];}
  renderConvertCategories();
}
function renderConvertCategories(){const sel=$('convertCategory');if(!sel)return;const currentValue=sel.value;sel.innerHTML='<option value="">Por definir</option>';for(const c of categories){const o=document.createElement('option');o.value=c.id;o.textContent=c.name;sel.appendChild(o);}if(currentValue&&categories.some(c=>c.id===currentValue))sel.value=currentValue;}

async function loadProspects(){
  prospects=await rpc('v2_prospects',{organization_id:ctx.organization_id,status_filter:null});
  prospects=Array.isArray(prospects)?prospects:[];
  populateFilterOptions();
  applyFilters();
}

function populateFilterOptions(){
  const campaign=$('campaignFilter'),source=$('sourceFilter');
  const keepCampaign=campaign.value,keepSource=source.value;
  const campaigns=[...new Set(prospects.map(p=>p.source_campaign).filter(Boolean))].sort((a,b)=>campaignName(a).localeCompare(campaignName(b),'es-MX'));
  const sources=[...new Set(prospects.map(p=>p.source_channel||p.source).filter(Boolean))].sort((a,b)=>sourceName(a).localeCompare(sourceName(b),'es-MX'));
  campaign.innerHTML='<option value="">Todas las campañas</option>';
  for(const c of campaigns){const o=document.createElement('option');o.value=c;o.textContent=campaignName(c);campaign.appendChild(o);}
  source.innerHTML='<option value="">Todos los orígenes</option>';
  for(const s of sources){const o=document.createElement('option');o.value=s;o.textContent=sourceName(s);source.appendChild(o);}
  if(campaigns.includes(keepCampaign))campaign.value=keepCampaign;
  if(sources.includes(keepSource))source.value=keepSource;
}

function baseScoped(){
  const type=$('typeFilter').value,campaign=$('campaignFilter').value,source=$('sourceFilter').value;
  return prospects.filter(p=>(!type||p.registration_type===type)&&(!campaign||p.source_campaign===campaign)&&(!source||(p.source_channel||p.source)===source));
}

function renderKpis(){
  const scoped=baseScoped();
  const total=scoped.length;
  const newCount=scoped.filter(needsContact).length;
  const trial=scoped.filter(p=>['trial_scheduled','trial_completed'].includes(p.status)).length;
  const converted=scoped.filter(p=>p.status==='converted').length;
  const overdueCount=scoped.filter(overdue).length;
  $('kpiCaptured').textContent=total;
  $('kpiNew').textContent=newCount;
  $('kpiTrial').textContent=trial;
  $('kpiConverted').textContent=converted;
  $('kpiConversion').textContent=total?`${Math.round((converted/total)*100)}%`:'0%';
  $('kpiOverdue').textContent=overdueCount;

  const stages={
    new:scoped.filter(p=>p.status==='new').length,
    contacted:scoped.filter(p=>p.status==='contacted').length,
    trial:scoped.filter(p=>['trial_scheduled','trial_completed'].includes(p.status)).length,
    converted
  };
  $('funnelNew').textContent=stages.new;
  $('funnelContacted').textContent=stages.contacted;
  $('funnelTrial').textContent=stages.trial;
  $('funnelConverted').textContent=stages.converted;
  renderSourceBreakdown(scoped);
  renderAttentionSummary(scoped);
}

function renderSourceBreakdown(rows){
  const box=$('sourceBreakdown');box.innerHTML='';
  const counts=new Map();
  for(const p of rows){const key=sourceName(p.source_channel||p.source);counts.set(key,(counts.get(key)||0)+1);}
  const ranked=[...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6);
  if(!ranked.length){const empty=document.createElement('span');empty.className='muted tiny';empty.textContent='Sin datos de origen.';box.appendChild(empty);return;}
  for(const [label,count] of ranked){
    const chip=document.createElement('button');chip.type='button';chip.className='source-chip';
    const name=document.createElement('span');name.textContent=label;
    const total=document.createElement('strong');total.textContent=String(count);
    chip.append(name,total);
    chip.addEventListener('click',()=>{const source=$('sourceFilter');const option=[...source.options].find(o=>o.value===label);if(option){source.value=label;applyFilters();}});
    box.appendChild(chip);
  }
}

function renderAttentionSummary(rows){
  const box=$('attentionSummary');box.innerHTML='';
  const items=[
    ['Sin contactar',rows.filter(needsContact).length,'needs_contact'],
    ['Seguimiento vencido',rows.filter(overdue).length,'overdue'],
    ['Próximas 48 h',rows.filter(upcoming).length,'upcoming']
  ];
  for(const [label,count,value] of items){const b=document.createElement('button');b.type='button';b.className=`attention-chip ${count?'hot':''}`;b.innerHTML=`<span>${label}</span><strong>${count}</strong>`;b.addEventListener('click',()=>{$('urgencyFilter').value=value;applyFilters();});box.appendChild(b);}
}

function applyFilters(){
  const status=$('statusFilter').value,q=$('searchProspect').value.trim().toLocaleLowerCase('es-MX'),urgency=$('urgencyFilter').value;
  filtered=baseScoped().filter(p=>{
    if(status&&p.status!==status)return false;
    if(urgency==='needs_contact'&&!needsContact(p))return false;
    if(urgency==='overdue'&&!overdue(p))return false;
    if(urgency==='upcoming'&&!upcoming(p))return false;
    if(!q)return true;
    const hay=[nameOf(p),p.phone,p.email,p.guardian_name,p.category_interest,p.school_name,p.source_campaign,p.source_channel,p.purpose,p.referral_name]
      .filter(Boolean).join(' ').toLocaleLowerCase('es-MX');
    return hay.includes(q);
  });
  filtered.sort((a,b)=>{
    const score=p=>needsContact(p)?0:overdue(p)?1:upcoming(p)?2:3;
    const s=score(a)-score(b);if(s)return s;
    const an=a.next_action_at?new Date(a.next_action_at).getTime():Infinity;
    const bn=b.next_action_at?new Date(b.next_action_at).getTime():Infinity;
    if(an!==bn)return an-bn;
    return new Date(b.created_at||0)-new Date(a.created_at||0);
  });
  renderKpis();renderList();
  $('resultCount').textContent=`${filtered.length} resultado${filtered.length===1?'':'s'}`;
}

function makeBadge(text,cls='neutral'){const span=document.createElement('span');span.className=`lead-badge ${cls}`;span.textContent=text;return span;}
function renderList(){
  const list=$('prospectList');list.innerHTML='';$('prospectEmpty').classList.toggle('hidden',filtered.length>0);
  for(const p of filtered){
    const card=document.createElement('article');card.className=`prospect-row ${overdue(p)?'overdue':''} ${needsContact(p)?'new-lead':''}`;
    const clickArea=document.createElement('button');clickArea.type='button';clickArea.className='prospect-open';
    const main=document.createElement('div');main.className='prospect-main';
    const strong=document.createElement('strong');strong.textContent=nameOf(p)||'Sin nombre';
    const sub=document.createElement('span');sub.textContent=`${typeLabel[p.registration_type]||p.category_interest||'Prospecto'} · ${p.category_interest||'Sin categoría'} · ${p.phone||p.email||'Sin contacto'}`;
    const badges=document.createElement('div');badges.className='lead-badges';
    badges.append(makeBadge(campaignName(p.source_campaign),'campaign'));
    if(p.source_channel||p.source)badges.append(makeBadge(sourceName(p.source_channel||p.source),'source'));
    if(needsContact(p))badges.append(makeBadge('Sin contactar','alert'));
    else if(overdue(p))badges.append(makeBadge('Seguimiento vencido','danger'));
    else if(upcoming(p))badges.append(makeBadge('Próxima acción','warning'));
    main.append(strong,sub,badges);
    const meta=document.createElement('div');meta.className='prospect-meta';
    const pipe=document.createElement('span');pipe.className=`pipeline ${p.status}`;pipe.textContent=statusLabel[p.status]||p.status;
    const small=document.createElement('small');small.textContent=p.next_action_at?`Siguiente: ${fmtDateTime(p.next_action_at)}`:`Alta: ${fmtDate(p.created_at)}`;
    meta.append(pipe,small);
    clickArea.append(main,meta);clickArea.addEventListener('click',()=>openProspect(p));
    const actions=document.createElement('div');actions.className='lead-actions';
    const wa=waUrl(p.phone);
    if(wa){const a=document.createElement('a');a.className='whatsapp-action';a.href=wa;a.target='_blank';a.rel='noopener noreferrer';a.textContent='WhatsApp';a.setAttribute('aria-label',`Abrir WhatsApp de ${nameOf(p)}`);actions.appendChild(a);}
    const detail=document.createElement('button');detail.type='button';detail.className='secondary mini';detail.textContent='Abrir';detail.addEventListener('click',()=>openProspect(p));actions.appendChild(detail);
    card.append(clickArea,actions);list.appendChild(card);
  }
}

function addDetail(container,label,value){const item=document.createElement('div');item.className='detail-item';const l=document.createElement('span');l.textContent=label;const v=document.createElement('strong');v.textContent=value||'—';item.append(l,v);container.appendChild(item);}
async function renderProspectPhoto(p){const box=$('prospectPhotoBox');box.innerHTML='';if(!p.photo_path){const s=document.createElement('span');s.textContent='Sin foto';box.appendChild(s);return;}const {data,error}=await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(p.photo_path,600);if(error||!data?.signedUrl){const s=document.createElement('span');s.textContent='Foto protegida';box.appendChild(s);return;}const img=document.createElement('img');img.src=data.signedUrl;img.alt=`Foto de ${nameOf(p)}`;box.appendChild(img);}
function renderProspectDetails(p){
  const box=$('prospectDetails');box.innerHTML='';
  addDetail(box,'Tipo',typeLabel[p.registration_type]||'Registro');
  addDetail(box,'Campaña',campaignName(p.source_campaign));
  addDetail(box,'¿A qué viene?',p.purpose);addDetail(box,'Pierna',footLabel[p.dominant_foot]||p.dominant_foot);
  addDetail(box,'Escuela',p.school_name);addDetail(box,'Tutor',p.guardian_name);addDetail(box,'WhatsApp',p.phone);addDetail(box,'Correo',p.email);
  addDetail(box,'Origen',p.source_channel||p.source);if(p.referral_name)addDetail(box,'Recomendó',p.referral_name);if(p.public_message)addDetail(box,'Mensaje',p.public_message);
  const badges=$('consentBadges');badges.innerHTML='';
  const data=document.createElement('span');data.className=`consent-badge ${p.data_consent?'ok':'warn'}`;data.textContent=p.data_consent?'Datos autorizados':'Consentimiento pendiente';
  const image=document.createElement('span');image.className=`consent-badge ${p.image_consent?'ok':'neutral'}`;image.textContent=p.image_consent?'Imagen autorizada':'Imagen solo control interno';
  const version=document.createElement('span');version.className='consent-badge neutral';version.textContent=p.privacy_notice_version?`Aviso ${p.privacy_notice_version}`:'Registro anterior';
  badges.append(data,image,version);
}
function renderDrawerActions(p){const wrap=$('drawerQuickActions');wrap.innerHTML='';const wa=waUrl(p.phone);if(wa){const a=document.createElement('a');a.className='whatsapp-action drawer-wa';a.href=wa;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Abrir WhatsApp';wrap.appendChild(a);}const campaign=document.createElement('span');campaign.className='lead-badge campaign';campaign.textContent=campaignName(p.source_campaign);wrap.appendChild(campaign);if(overdue(p))wrap.appendChild(makeBadge('Seguimiento vencido','danger'));else if(needsContact(p))wrap.appendChild(makeBadge('Sin contactar','alert'));}
function prepareConversion(p){const section=$('conversionSection');const allowed=ctx.canPlayersWrite&&ctx.canProspectsWrite&&p.status!=='converted';section.classList.toggle('hidden',!allowed);msg('convertMessage');if(!allowed)return;renderConvertCategories();const match=categories.find(c=>String(c.name||'').toLocaleLowerCase('es-MX')===String(p.category_interest||'').toLocaleLowerCase('es-MX'));$('convertCategory').value=match?.id||'';$('convertFee').value='';$('convertDate').value=todayLocal();$('convertJersey').value='';$('convertPosition').value=p.registration_type==='goalkeeper'?'Portero':'';}
async function openProspect(p){
  current=p;$('prospectName').textContent=nameOf(p)||'Prospecto';$('prospectMeta').textContent=`${typeLabel[p.registration_type]||p.category_interest||'Prospecto'} · alta ${fmtDate(p.created_at)}`;
  $('prospectStatus').value=p.status||'new';$('nextAction').value=p.next_action_at?localDateTimeValue(p.next_action_at):'';$('prospectNotes').value=p.notes||'';
  $('saveFollowup').disabled=!ctx.canProspectsWrite;$('saveScout').disabled=!ctx.canScoutingWrite;$('scoutCategory').value=p.category_interest||'';$('scoutPosition').value=p.registration_type==='goalkeeper'?'Portero':'';$('scoutDate').value=localDateTimeValue();
  msg('followupMessage');msg('scoutMessage');renderProspectDetails(p);renderDrawerActions(p);prepareConversion(p);
  await Promise.all([renderProspectPhoto(p),loadScoutingHistory()]);
  $('prospectBackdrop').classList.remove('hidden');$('prospectDrawer').classList.remove('hidden');$('prospectDrawer').setAttribute('aria-hidden','false');
}
function closeProspect(){current=null;$('prospectBackdrop').classList.add('hidden');$('prospectDrawer').classList.add('hidden');$('prospectDrawer').setAttribute('aria-hidden','true');}

async function saveFollowup(){if(!current||!ctx.canProspectsWrite)return;msg('followupMessage');const btn=$('saveFollowup');btn.disabled=true;try{const id=current.id;await rpc('v2_update_prospect_followup',{organization_id:ctx.organization_id,prospect_id:id,status:$('prospectStatus').value,next_action_at:$('nextAction').value?new Date($('nextAction').value).toISOString():null,notes:$('prospectNotes').value.trim()||null});msg('followupMessage','Seguimiento guardado.','success');await loadProspects();current=prospects.find(p=>p.id===id)||current;if(current)renderDrawerActions(current);}catch(e){msg('followupMessage',friendly(e));}finally{btn.disabled=!ctx.canProspectsWrite;}}
async function convertProspect(){if(!current||!ctx.canPlayersWrite||!ctx.canProspectsWrite)return;msg('convertMessage');const btn=$('convertProspect');const feeRaw=$('convertFee').value;const fee=feeRaw===''?null:Number(feeRaw);if(fee!==null&&(!Number.isFinite(fee)||fee<0)){msg('convertMessage','La cuota debe ser 0 o mayor.');return;}if(!confirm(`¿Convertir a ${nameOf(current)} en Tanner? Se conservarán foto, tutor, campaña y consentimientos.`))return;btn.disabled=true;btn.textContent='Convirtiendo…';try{const id=await rpc('v2_convert_prospect_to_player',{organization_id:ctx.organization_id,prospect_id:current.id,category_id:$('convertCategory').value||null,monthly_fee:fee,joined_at:$('convertDate').value||todayLocal(),jersey_number:$('convertJersey').value.trim()||null,player_position:$('convertPosition').value.trim()||null});msg('convertMessage',`Tanner creado correctamente · ${String(id).slice(0,8)}…`,'success');await loadProspects();const updated=prospects.find(p=>p.id===current.id);if(updated){current=updated;$('prospectStatus').value=updated.status;prepareConversion(updated);renderDrawerActions(updated);}}catch(e){msg('convertMessage',friendly(e));}finally{btn.disabled=false;btn.textContent='Convertir a Tanner';}}
function num(id){const v=$(id).value;return v===''?null:Number(v);}
async function saveScout(){if(!current||!ctx.canScoutingWrite)return;msg('scoutMessage');const btn=$('saveScout');btn.disabled=true;try{await rpc('v2_create_scouting_report',{organization_id:ctx.organization_id,prospect_id:current.id,observed_name:null,observed_at:$('scoutDate').value?new Date($('scoutDate').value).toISOString():new Date().toISOString(),observed_location:$('scoutLocation').value.trim()||null,player_position:$('scoutPosition').value.trim()||null,category:$('scoutCategory').value.trim()||null,technical_score:num('scoreTechnical'),physical_score:num('scorePhysical'),tactical_score:num('scoreTactical'),mental_score:num('scoreMental'),star_quality:$('starQuality').value.trim()||null,verdict:$('scoutVerdict').value.trim()||null,notes:$('scoutNotes').value.trim()||null});msg('scoutMessage','Visoría guardada.','success');['scoutPosition','scoutLocation','scoreTechnical','scorePhysical','scoreTactical','scoreMental','starQuality','scoutVerdict','scoutNotes'].forEach(id=>$(id).value='');await Promise.all([loadScoutingHistory(),loadProspects()]);}catch(e){msg('scoutMessage',friendly(e));}finally{btn.disabled=!ctx.canScoutingWrite;}}
async function loadScoutingHistory(){const box=$('scoutingHistory');box.innerHTML='';if(!ctx.canScoutingRead){box.innerHTML='<div class="empty">Sin acceso a Scouting.</div>';return;}const rows=await rpc('v2_scouting_reports',{organization_id:ctx.organization_id,prospect_id:current.id});if(!rows?.length){box.innerHTML='<div class="empty">Sin visorías todavía.</div>';return;}for(const r of rows){const values=[r.technical_score,r.physical_score,r.tactical_score,r.mental_score].filter(v=>v!=null).map(Number);const avg=values.length?values.reduce((a,b)=>a+b,0)/values.length:0;const card=document.createElement('article');card.className='scout-card';const left=document.createElement('div'),right=document.createElement('div');const when=document.createElement('strong');when.textContent=fmtDateTime(r.observed_at);const where=document.createElement('span');where.textContent=`${r.observed_location||'Sin lugar'} · ${r.player_position||'Sin posición'}`;left.append(when,where);const score=document.createElement('b');score.textContent=avg?avg.toFixed(1):'—';const verdict=document.createElement('span');verdict.textContent=r.verdict||'Sin veredicto';right.append(score,verdict);card.append(left,right);box.appendChild(card);}}

for(const id of ['statusFilter','typeFilter','campaignFilter','sourceFilter','urgencyFilter'])$(id).addEventListener('change',applyFilters);
$('searchProspect').addEventListener('input',applyFilters);
$('clearFilters').addEventListener('click',()=>{for(const id of ['statusFilter','typeFilter','campaignFilter','sourceFilter','urgencyFilter'])$(id).value='';$('searchProspect').value='';applyFilters();});
$('refreshProspects').addEventListener('click',loadProspects);
$('closeProspect').addEventListener('click',closeProspect);$('prospectBackdrop').addEventListener('click',closeProspect);
$('saveFollowup').addEventListener('click',saveFollowup);$('convertProspect').addEventListener('click',convertProspect);$('saveScout').addEventListener('click',saveScout);
$('signOut').addEventListener('click',async()=>{await supabase.auth.signOut();location.href='/';});

boot().catch(e=>{$('deniedText').textContent=friendly(e)||'No pudimos abrir Prospectos.';show('deniedView');});
