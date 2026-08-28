import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase=createClient(
  'https://pacnegivzgxpanphrnwp.supabase.co',
  'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',
  {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}
);

const PHOTO_BUCKET='tanneros-prospect-photos';
const $=id=>document.getElementById(id);
let ctx=null,prospects=[],filtered=[],current=null,moduleRows=[],categories=[];
let operationalView='attention',initialViewReady=false,managerCampaignCode='';

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
function toast(text){const el=$('prospectToast');if(!el)return;el.textContent=text;el.classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('visible'),3200);}
async function rpc(name,params={}){const {data,error}=await supabase.rpc(name,params);if(error)throw error;return data;}
function fmtDate(v){if(!v)return '—';return new Intl.DateTimeFormat('es-MX',{dateStyle:'medium'}).format(new Date(v));}
function fmtDateTime(v){if(!v)return '—';return new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v));}
function localDateTimeValue(v){const d=v?new Date(v):new Date();const z=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;}
function todayLocal(){const d=new Date(),z=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`;}
function nameOf(p){return [p.first_name,p.last_name].filter(Boolean).join(' ').trim();}
function ageOf(p){if(!p.birth_date)return null;const birth=new Date(`${p.birth_date}T12:00:00`),now=new Date();let age=now.getFullYear()-birth.getFullYear();const month=now.getMonth()-birth.getMonth();if(month<0||(month===0&&now.getDate()<birth.getDate()))age--;return age>=0?age:null;}
function initials(p){return nameOf(p).split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'TC';}
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
function friendly(e){const s=String(e?.message||e||'Ocurrió un error.');if(/possible duplicate player/i.test(s))return 'Ya existe un Tanner activo con el mismo nombre y fecha de nacimiento. Revisa antes de convertir.';if(/ux_players_active_category_jersey|duplicate key/i.test(s))return 'Ese número de camiseta ya está ocupado en la categoría seleccionada.';if(/only presidency can delete/i.test(s))return 'Sólo Presidencia puede eliminar prospectos.';if(/not authorized/i.test(s))return 'Tu rol no tiene permiso para realizar esta acción.';return s;}

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
  await loadProspectPhotos();
  populateFilterOptions();
  if(!initialViewReady){operationalView=prospects.some(p=>active(p)&&(needsContact(p)||overdue(p)||upcoming(p)))?'attention':'all';initialViewReady=true;}
  applyFilters();
}

async function loadProspectPhotos(){
  const paths=[...new Set(prospects.map(p=>p.photo_path).filter(Boolean))];
  prospects.forEach(p=>p.photo_url=null);
  if(!paths.length)return;
  const {data,error}=await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths,900);
  if(error)return;
  const urls=new Map((data||[]).filter(x=>x.signedUrl).map(x=>[x.path,x.signedUrl]));
  prospects.forEach(p=>{p.photo_url=urls.get(p.photo_path)||null;});
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

function campaignUniverse(){
  const type=$('typeFilter').value,source=$('sourceFilter').value;
  return prospects.filter(p=>(!type||p.registration_type===type)&&(!source||(p.source_channel||p.source)===source));
}

function campaignStats(rows){
  const groups=new Map();
  for(const p of rows){
    const code=p.source_campaign||'';
    if(!code)continue;
    if(!groups.has(code))groups.set(code,{code,label:campaignName(code),total:0,converted:0,active:0});
    const item=groups.get(code);item.total++;if(p.status==='converted')item.converted++;if(active(p))item.active++;
  }
  return [...groups.values()].map(item=>({...item,rate:item.total?Math.round(item.converted/item.total*100):0})).sort((a,b)=>b.converted-a.converted||b.rate-a.rate||b.total-a.total||a.label.localeCompare(b.label,'es-MX'));
}

function selectCampaign(code){
  $('campaignFilter').value=code||'';
  applyFilters();
  document.querySelector('.campaign-panel')?.scrollIntoView({behavior:'smooth',block:'start'});
}

function renderCampaignButtons(){
  const box=$('campaignButtons');box.innerHTML='';
  const rows=campaignUniverse(),stats=campaignStats(rows),selected=$('campaignFilter').value;
  const all={code:'',label:'Todas las campañas',total:rows.length,converted:rows.filter(p=>p.status==='converted').length};
  const makeButton=item=>{
    const rate=item.total?Math.round(item.converted/item.total*100):0;
    const button=document.createElement('button');button.type='button';button.className='campaign-button';button.dataset.campaign=item.code;button.setAttribute('aria-pressed',String(selected===item.code));
    const heading=document.createElement('span'),title=document.createElement('strong'),metric=document.createElement('b'),detail=document.createElement('small');
    title.textContent=item.label;metric.textContent=`${rate}%`;detail.textContent=`${item.total} captados · ${item.converted} altas`;heading.append(title,metric);button.append(heading,detail);
    button.addEventListener('click',()=>selectCampaign(item.code));return button;
  };
  box.appendChild(makeButton(all));for(const item of stats)box.appendChild(makeButton(item));
  $('campaignContext').textContent=selected?campaignName(selected):'Todas';
}

function actionRows(rows){return rows.filter(p=>active(p)&&(needsContact(p)||overdue(p)||upcoming(p)));}
function matchesOperationalView(p){
  if(operationalView==='attention')return active(p)&&(needsContact(p)||overdue(p)||upcoming(p));
  if(operationalView==='trials')return p.status==='trial_scheduled';
  if(operationalView==='ready')return p.status==='trial_completed';
  if(operationalView==='converted')return p.status==='converted';
  return true;
}

function renderStageTabs(rows){
  const counts={
    attention:rows.filter(p=>active(p)&&(needsContact(p)||overdue(p)||upcoming(p))).length,
    trials:rows.filter(p=>p.status==='trial_scheduled').length,
    ready:rows.filter(p=>p.status==='trial_completed').length,
    converted:rows.filter(p=>p.status==='converted').length,
    all:rows.length
  };
  $('stageAttentionCount').textContent=counts.attention;$('stageTrialsCount').textContent=counts.trials;$('stageReadyCount').textContent=counts.ready;$('stageConvertedCount').textContent=counts.converted;$('stageAllCount').textContent=counts.all;
  document.querySelectorAll('.stage-tab').forEach(button=>{const selected=button.dataset.view===operationalView;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));});
}

function renderManagerBoard(rows){
  const total=rows.length,converted=rows.filter(p=>p.status==='converted').length,actions=actionRows(rows);
  const overdueCount=actions.filter(overdue).length,newCount=actions.filter(p=>!overdue(p)&&needsContact(p)).length,upcomingCount=actions.filter(p=>!overdue(p)&&!needsContact(p)&&upcoming(p)).length;
  const rate=total?Math.round(converted/total*100):0;
  $('managerActionCount').textContent=String(actions.length);
  $('managerActionCopy').textContent=actions.length?[overdueCount?`${overdueCount} vencido${overdueCount===1?'':'s'}`:null,newCount?`${newCount} sin contacto`:null,upcomingCount?`${upcomingCount} próxim${upcomingCount===1?'a':'as'}`:null].filter(Boolean).join(' · '):'Todo al día';
  $('managerAttention').classList.toggle('is-clear',actions.length===0);
  $('managerConversion').textContent=`${rate}%`;$('managerConverted').textContent=`${converted} alta${converted===1?'':'s'}`;$('managerConversionCopy').textContent=`de ${total} captado${total===1?'':'s'}`;
  $('conversionRing').style.setProperty('--progress',`${rate*3.6}deg`);
  const top=campaignStats(campaignUniverse())[0];managerCampaignCode=top?.code||'';
  $('managerCampaignName').textContent=top?.label||'Sin datos';
  $('managerCampaignCopy').textContent=top?`${top.converted} altas · ${top.rate}% de conversión`:'Aún no hay campañas';
  $('managerCampaign').disabled=!top;
}

function applyFilters(){
  const status=$('statusFilter').value,q=$('searchProspect').value.trim().toLocaleLowerCase('es-MX'),urgency=$('urgencyFilter').value;
  filtered=baseScoped().filter(p=>{
    if(!matchesOperationalView(p))return false;
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
    const score=p=>overdue(p)?0:needsContact(p)?1:upcoming(p)?2:p.status==='trial_completed'?3:4;
    const s=score(a)-score(b);if(s)return s;
    const an=a.next_action_at?new Date(a.next_action_at).getTime():Infinity;
    const bn=b.next_action_at?new Date(b.next_action_at).getTime():Infinity;
    if(an!==bn)return an-bn;
    return new Date(b.created_at||0)-new Date(a.created_at||0);
  });
  const scoped=baseScoped();renderCampaignButtons();renderManagerBoard(scoped);renderStageTabs(scoped);renderList();
  $('resultCount').textContent=`${filtered.length} resultado${filtered.length===1?'':'s'}`;
  updateFilterButton();
}

function updateFilterButton(){const button=$('toggleProspectFilters');if(!button)return;const ids=['statusFilter','typeFilter','campaignFilter','sourceFilter','urgencyFilter'],count=ids.filter(id=>$(id).value).length;button.querySelector('span').textContent=count?`Filtros · ${count}`:'Más filtros';button.classList.toggle('active',count>0);}

function makeBadge(text,cls='neutral'){const span=document.createElement('span');span.className=`lead-badge ${cls}`;span.textContent=text;return span;}
function scoutingUrl(p){const params=new URLSearchParams({prospect:p.id,name:nameOf(p),category:p.category_interest||'',type:p.registration_type||''});return `/scouting/?${params}`;}
async function openForIntent(p,intent='view'){
  await openProspect(p);
  if(intent==='schedule'){
    $('prospectStatus').value='trial_scheduled';
    $('prospectStatus').closest('.drawer-section')?.scrollIntoView({behavior:'smooth',block:'start'});
    window.setTimeout(()=>$('nextAction').focus(),260);
  }else if(intent==='convert'){
    $('conversionSection')?.scrollIntoView({behavior:'smooth',block:'start'});
  }
}
async function markContacted(p,button){
  if(!ctx.canProspectsWrite)return;button.disabled=true;const original=button.textContent;button.textContent='Guardando…';
  try{
    await rpc('v2_update_prospect_followup',{organization_id:ctx.organization_id,prospect_id:p.id,status:'contacted',next_action_at:p.next_action_at||null,notes:p.notes||null});
    toast(`${nameOf(p)||'Prospecto'} quedó como contactado.`);await loadProspects();
  }catch(e){toast(friendly(e));button.disabled=false;button.textContent=original;}
}
function renderList(){
  const list=$('prospectList');list.innerHTML='';$('prospectEmpty').classList.toggle('hidden',filtered.length>0);
  for(const p of filtered){
    const card=document.createElement('article');card.className=`prospect-row ${overdue(p)?'overdue':''} ${needsContact(p)?'new-lead':''}`;
    const clickArea=document.createElement('button');clickArea.type='button';clickArea.className='prospect-open';
    const photo=document.createElement('span');photo.className=`prospect-card-photo ${p.photo_url?'has-photo':''}`;if(p.photo_url){const image=document.createElement('img');image.src=p.photo_url;image.alt=`Foto de ${nameOf(p)}`;photo.appendChild(image);}else{const mark=document.createElement('span'),missing=document.createElement('small');mark.textContent=initials(p);missing.textContent='Sin foto';photo.append(mark,missing);}
    const main=document.createElement('div');main.className='prospect-main';
    const heading=document.createElement('div');heading.className='prospect-heading';const strong=document.createElement('strong');strong.textContent=nameOf(p)||'Sin nombre';
    const pipe=document.createElement('span');pipe.className=`pipeline ${p.status}`;pipe.textContent=statusLabel[p.status]||p.status;heading.append(strong,pipe);
    const sporting=document.createElement('div');sporting.className='prospect-sporting';
    const category=document.createElement('b');category.textContent=p.category_interest||'Categoría por definir';
    const age=ageOf(p),profile=document.createElement('span');profile.textContent=[typeLabel[p.registration_type]||'Prospecto',age!=null?`${age} años`:null,footLabel[p.dominant_foot]].filter(Boolean).join(' · ');
    sporting.append(category,profile);
    const origin=document.createElement('div');origin.className='prospect-origin';origin.innerHTML='<span class="tos-icon tos-icon-target" aria-hidden="true"></span>';const originText=document.createElement('span');originText.textContent=[campaignName(p.source_campaign),p.source_channel||p.source].filter(Boolean).join(' · ');origin.appendChild(originText);
    const next=document.createElement('div');next.className=`prospect-next ${overdue(p)?'is-overdue':needsContact(p)?'needs-contact':upcoming(p)?'is-upcoming':''}`;
    const nextLabel=document.createElement('small'),nextValue=document.createElement('strong');
    if(overdue(p)){nextLabel.textContent='Atención';nextValue.textContent=`Seguimiento vencido · ${fmtDateTime(p.next_action_at)}`;}
    else if(needsContact(p)){nextLabel.textContent='Siguiente paso';nextValue.textContent='Contactar a la familia';}
    else if(p.status==='trial_completed'){nextLabel.textContent='Siguiente paso';nextValue.textContent='Dar de alta como Tanner';}
    else if(p.next_action_at){nextLabel.textContent='Próxima acción';nextValue.textContent=fmtDateTime(p.next_action_at);}
    else{nextLabel.textContent='Registro';nextValue.textContent=fmtDate(p.created_at);}
    next.append(nextLabel,nextValue);main.append(heading,sporting,origin,next);
    clickArea.append(photo,main);clickArea.addEventListener('click',()=>openForIntent(p));
    const actions=document.createElement('div');actions.className='lead-actions';
    const wa=waUrl(p.phone);
    if(p.status==='new'&&wa){const a=document.createElement('a');a.className='lead-primary whatsapp-action';a.href=wa;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Contactar';a.setAttribute('aria-label',`Contactar por WhatsApp a la familia de ${nameOf(p)}`);actions.appendChild(a);if(ctx.canProspectsWrite){const done=document.createElement('button');done.type='button';done.className='lead-secondary';done.textContent='Ya contacté';done.addEventListener('click',()=>markContacted(p,done));actions.appendChild(done);}}
    else if(p.status==='contacted'&&ctx.canProspectsWrite){const schedule=document.createElement('button');schedule.type='button';schedule.className='lead-primary';schedule.textContent='Agendar prueba';schedule.addEventListener('click',()=>openForIntent(p,'schedule'));actions.appendChild(schedule);}
    else if(p.status==='trial_scheduled'&&ctx.canScoutingWrite){const scout=document.createElement('a');scout.className='lead-primary';scout.href=scoutingUrl(p);scout.textContent='Evaluar jugador';actions.appendChild(scout);}
    else if(p.status==='trial_completed'&&ctx.canPlayersWrite&&ctx.canProspectsWrite){const convert=document.createElement('button');convert.type='button';convert.className='lead-primary convert-card-action';convert.textContent='Dar de alta';convert.addEventListener('click',()=>openForIntent(p,'convert'));actions.appendChild(convert);}
    const detail=document.createElement('button');detail.type='button';detail.className='lead-secondary';detail.textContent=p.status==='converted'?'Ver registro':'Ver ficha';detail.addEventListener('click',()=>openForIntent(p));actions.appendChild(detail);
    card.append(clickArea,actions);list.appendChild(card);
  }
}

function addDetail(container,label,value){const item=document.createElement('div');item.className='detail-item';const l=document.createElement('span');l.textContent=label;const v=document.createElement('strong');v.textContent=value||'—';item.append(l,v);container.appendChild(item);}
async function renderProspectPhoto(p){const box=$('prospectPhotoBox');box.innerHTML='';let url=p.photo_url;if(!url&&p.photo_path){const {data}=await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(p.photo_path,600);url=data?.signedUrl||null;}if(!url){const mark=document.createElement('strong'),label=document.createElement('small');mark.textContent=initials(p);label.textContent='Sin fotografía';box.append(mark,label);return;}const img=document.createElement('img');img.src=url;img.alt=`Foto de ${nameOf(p)}`;box.appendChild(img);}
function renderProspectDetails(p){
  const box=$('prospectDetails');box.innerHTML='';
  const age=ageOf(p);addDetail(box,'Categoría',p.category_interest);addDetail(box,'Edad',age==null?null:`${age} años`);
  addDetail(box,'Perfil',typeLabel[p.registration_type]||'Registro');addDetail(box,'¿A qué viene?',p.purpose);
  addDetail(box,'Pierna',footLabel[p.dominant_foot]||p.dominant_foot);addDetail(box,'Escuela',p.school_name);
  addDetail(box,'Tutor',p.guardian_name);addDetail(box,'WhatsApp',p.phone);addDetail(box,'Correo',p.email);
  addDetail(box,'Campaña',campaignName(p.source_campaign));
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
  $('saveFollowup').disabled=!ctx.canProspectsWrite;msg('followupMessage');renderProspectDetails(p);renderDrawerActions(p);prepareConversion(p);
  const scoutingLink=$('openProspectScouting');if(scoutingLink){const params=new URLSearchParams({prospect:p.id,name:nameOf(p),category:p.category_interest||'',type:p.registration_type||''});scoutingLink.href=`/scouting/?${params}`;scoutingLink.classList.toggle('hidden',!ctx.canScoutingWrite);}
  $('deleteProspectSection')?.classList.toggle('hidden',!ctx.is_owner);$('deleteProspectConfirm')?.classList.add('hidden');$('deleteProspect')?.classList.remove('hidden');msg('deleteProspectMessage');
  await Promise.all([renderProspectPhoto(p),loadScoutingHistory()]);
  $('prospectBackdrop').classList.remove('hidden');$('prospectDrawer').classList.remove('hidden');$('prospectDrawer').setAttribute('aria-hidden','false');
}
function closeProspect(){current=null;$('prospectBackdrop').classList.add('hidden');$('prospectDrawer').classList.add('hidden');$('prospectDrawer').setAttribute('aria-hidden','true');}

async function deleteProspect(){
  if(!current||!ctx.is_owner)return;
  const prospect=current,button=$('confirmDeleteProspect');button.disabled=true;button.textContent='Eliminando…';msg('deleteProspectMessage');
  try{
    const result=await rpc('v2_delete_prospect',{organization_id:ctx.organization_id,prospect_id:prospect.id});
    closeProspect();await loadProspects();
    if(result?.photoPath&&result?.photoBucket===PHOTO_BUCKET)await supabase.storage.from(PHOTO_BUCKET).remove([result.photoPath]);
    toast(`${nameOf(prospect)||'El prospecto'} se eliminó de Captación.`);
  }catch(e){msg('deleteProspectMessage',friendly(e));}
  finally{button.disabled=false;button.textContent='Sí, eliminar prospecto';}
}

async function saveFollowup(){if(!current||!ctx.canProspectsWrite)return;msg('followupMessage');const btn=$('saveFollowup');btn.disabled=true;try{const id=current.id;await rpc('v2_update_prospect_followup',{organization_id:ctx.organization_id,prospect_id:id,status:$('prospectStatus').value,next_action_at:$('nextAction').value?new Date($('nextAction').value).toISOString():null,notes:$('prospectNotes').value.trim()||null});msg('followupMessage','Seguimiento guardado.','success');await loadProspects();current=prospects.find(p=>p.id===id)||current;if(current)renderDrawerActions(current);}catch(e){msg('followupMessage',friendly(e));}finally{btn.disabled=!ctx.canProspectsWrite;}}
async function convertProspect(){if(!current||!ctx.canPlayersWrite||!ctx.canProspectsWrite)return;msg('convertMessage');const btn=$('convertProspect');const feeRaw=$('convertFee').value;const fee=feeRaw===''?null:Number(feeRaw);if(fee!==null&&(!Number.isFinite(fee)||fee<0)){msg('convertMessage','La cuota debe ser 0 o mayor.');return;}if(!(await window.tosConfirm({kicker:'CAPTACIÓN',title:'Convertir a Tanner',message:`Vas a convertir a ${nameOf(current)} en Tanner. Se conservan su foto, tutor, campaña y consentimientos.`,confirmText:'Sí, convertir',cancelText:'Cancelar'})))return;btn.disabled=true;btn.textContent='Convirtiendo…';try{const id=await rpc('v2_convert_prospect_to_player',{organization_id:ctx.organization_id,prospect_id:current.id,category_id:$('convertCategory').value||null,monthly_fee:fee,joined_at:$('convertDate').value||todayLocal(),jersey_number:$('convertJersey').value.trim()||null,player_position:$('convertPosition').value.trim()||null});msg('convertMessage',`Tanner creado correctamente · ${String(id).slice(0,8)}…`,'success');await loadProspects();const updated=prospects.find(p=>p.id===current.id);if(updated){current=updated;$('prospectStatus').value=updated.status;prepareConversion(updated);renderDrawerActions(updated);}}catch(e){msg('convertMessage',friendly(e));}finally{btn.disabled=false;btn.textContent='Convertir a Tanner';}}
async function loadScoutingHistory(){const box=$('scoutingHistory');box.innerHTML='';if(!ctx.canScoutingRead){box.innerHTML='<div class="empty">Sin acceso a Scouting.</div>';return;}const rows=await rpc('v2_scouting_reports',{organization_id:ctx.organization_id,prospect_id:current.id});if(!rows?.length){box.innerHTML='<div class="empty">Aún no tiene evaluaciones deportivas.</div>';return;}for(const r of rows){const values=[r.technical_score,r.physical_score,r.tactical_score,r.mental_score].filter(v=>v!=null).map(Number);const avg=values.length?values.reduce((a,b)=>a+b,0)/values.length:0;const card=document.createElement('article');card.className='scout-card';const left=document.createElement('div'),right=document.createElement('div');const when=document.createElement('strong');when.textContent=fmtDateTime(r.observed_at);const where=document.createElement('span');where.textContent=`${r.observed_location||'Sin lugar'} · ${r.player_position||'Sin posición'}`;left.append(when,where);const score=document.createElement('b');score.textContent=avg?avg.toFixed(1):'—';const verdict=document.createElement('span');verdict.textContent=r.verdict||'Sin veredicto';right.append(score,verdict);card.append(left,right);box.appendChild(card);}}

function mountCaptureUx(){
  const link=document.createElement('link');link.rel='stylesheet';link.href='/v2/prospectos/ux.css?v=20260828a';document.head.appendChild(link);
  const filters=document.querySelector('.campaign-filters'),head=document.querySelector('.campaign-panel-head');
  if(filters&&head&&!$('prospectSearchBar')){
    const toolbar=document.createElement('div');toolbar.className='prospect-tools';toolbar.innerHTML='<label id="prospectSearchBar" class="prospect-search-bar"><span class="tos-icon tos-icon-search" aria-hidden="true"></span></label><button id="toggleProspectFilters" class="prospect-filter-toggle" type="button"><span>Filtros</span><i class="tos-icon tos-icon-chevron" aria-hidden="true"></i></button>';
    toolbar.querySelector('label').appendChild($('searchProspect'));head.after(toolbar);toolbar.after(filters);
  }
  $('toggleProspectFilters')?.addEventListener('click',()=>{filters.classList.toggle('open');$('toggleProspectFilters').classList.toggle('open',filters.classList.contains('open'));});
  const profileSection=$('prospectPhotoBox')?.closest('.drawer-section'),conversion=$('conversionSection');
  if(profileSection&&conversion)profileSection.after(conversion);
  conversion?.classList.add('conversion-feature');
  const scoutingSection=$('saveScout')?.closest('.drawer-section');
  if(scoutingSection){scoutingSection.classList.add('scouting-bridge');scoutingSection.innerHTML='<div class="scouting-bridge-copy"><span class="tos-icon tos-icon-search" aria-hidden="true"></span><div><div class="eyebrow">EVALUACIÓN DEPORTIVA</div><h3>Visoría en Scouting</h3><p>Evalúa técnica, físico, táctica y mentalidad sin duplicar al prospecto.</p></div></div><a id="openProspectScouting" class="scouting-bridge-action" href="/scouting/">Evaluar en Scouting <span aria-hidden="true">›</span></a>';}
  const historySection=$('scoutingHistory')?.closest('.drawer-section');if(historySection){historySection.classList.add('scouting-history-compact');const title=historySection.querySelector('h3');if(title)title.textContent='Evaluaciones anteriores';}
  const drawer=$('prospectDrawer');
  if(drawer&&!$('deleteProspectSection')){
    const section=document.createElement('section');section.id='deleteProspectSection';section.className='drawer-section prospect-danger hidden';section.innerHTML='<button id="deleteProspect" class="delete-prospect" type="button"><span class="tos-icon tos-icon-trash" aria-hidden="true"></span>Eliminar prospecto</button><div id="deleteProspectConfirm" class="delete-prospect-confirm hidden"><strong>¿Eliminar este prospecto?</strong><p>Se borrarán el registro de Captación y su fotografía. Si ya se convirtió en Tanner, su ficha de jugador permanecerá.</p><div><button id="cancelDeleteProspect" class="secondary" type="button">Cancelar</button><button id="confirmDeleteProspect" class="danger-action" type="button">Sí, eliminar prospecto</button></div><div id="deleteProspectMessage" class="inline-message hidden"></div></div>';drawer.appendChild(section);
  }
  if(!$('prospectToast')){const notice=document.createElement('div');notice.id='prospectToast';notice.className='prospect-toast';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');document.body.appendChild(notice);}
  updateFilterButton();
}

mountCaptureUx();

$('deleteProspect').addEventListener('click',()=>{$('deleteProspect').classList.add('hidden');$('deleteProspectConfirm').classList.remove('hidden');$('deleteProspectConfirm').scrollIntoView({behavior:'smooth',block:'nearest'});msg('deleteProspectMessage');});$('cancelDeleteProspect').addEventListener('click',()=>{$('deleteProspectConfirm').classList.add('hidden');$('deleteProspect').classList.remove('hidden');msg('deleteProspectMessage');});$('confirmDeleteProspect').addEventListener('click',deleteProspect);
for(const id of ['typeFilter','campaignFilter','sourceFilter'])$(id).addEventListener('change',applyFilters);
for(const id of ['statusFilter','urgencyFilter'])$(id).addEventListener('change',()=>{operationalView='all';applyFilters();});
$('stageTabs').addEventListener('click',event=>{const button=event.target.closest('.stage-tab');if(!button)return;operationalView=button.dataset.view;$('statusFilter').value='';$('urgencyFilter').value='';applyFilters();});
$('managerAttention').addEventListener('click',()=>{operationalView='attention';$('statusFilter').value='';$('urgencyFilter').value='';applyFilters();document.querySelector('.campaign-panel')?.scrollIntoView({behavior:'smooth',block:'start'});});
$('managerCampaign').addEventListener('click',()=>{if(managerCampaignCode)selectCampaign(managerCampaignCode);});
$('searchProspect').addEventListener('input',applyFilters);
$('clearFilters').addEventListener('click',()=>{for(const id of ['statusFilter','typeFilter','campaignFilter','sourceFilter','urgencyFilter'])$(id).value='';$('searchProspect').value='';operationalView='all';applyFilters();});
$('refreshProspects').addEventListener('click',loadProspects);
$('closeProspect').addEventListener('click',closeProspect);$('prospectBackdrop').addEventListener('click',closeProspect);
$('saveFollowup').addEventListener('click',saveFollowup);$('convertProspect').addEventListener('click',convertProspect);
$('signOut').addEventListener('click',async()=>{await supabase.auth.signOut();location.href='/';});

boot().catch(e=>{$('deniedText').textContent=friendly(e)||'No pudimos abrir Prospectos.';show('deniedView');});
