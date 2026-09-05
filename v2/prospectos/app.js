import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase=createClient(
  'https://pacnegivzgxpanphrnwp.supabase.co',
  'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',
  {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}
);

const PHOTO_BUCKET='tanneros-prospect-photos';
const $=id=>document.getElementById(id);
let ctx=null,prospects=[],filtered=[],current=null,moduleRows=[],categories=[],activeView='pipeline',viewMode='list';
const KANBAN_STAGES=[
  {key:'new',label:'Nuevo'},
  {key:'contacted',label:'Contactado'},
  {key:'trial_scheduled',label:'Prueba agendada'},
  {key:'trial_completed',label:'Prueba realizada'},
  {key:'converted',label:'Convertido'},
  {key:'not_continuing',label:'No continúa'}
];

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
function setActiveView(view){
  activeView=view;
  document.querySelectorAll('.pipeline-tab').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
}
function viewFiltered(){
  const rows=baseScoped();
  if(activeView==='pipeline')return rows.filter(p=>!terminalStatuses.has(p.status));
  if(activeView==='converted')return rows.filter(p=>p.status==='converted');
  if(activeView==='lost')return rows.filter(p=>p.status==='not_continuing');
  return rows;
}
function updateTabCounts(){
  const rows=baseScoped();
  const pipeline=rows.filter(p=>!terminalStatuses.has(p.status)).length,converted=rows.filter(p=>p.status==='converted').length,lost=rows.filter(p=>p.status==='not_continuing').length;
  $('tabCountPipeline').textContent=pipeline;
  $('tabCountConverted').textContent=converted;
  $('tabCountLost').textContent=lost;
  $('tabCountAll').textContent=rows.length;
}

function setViewMode(mode){
  viewMode=mode;
  $('viewList').classList.toggle('active',mode==='list');
  $('viewKanban').classList.toggle('active',mode==='kanban');
  $('prospectList').classList.toggle('hidden',mode!=='list');
  $('kanbanBoard').classList.toggle('hidden',mode!=='kanban');
  $('pipelineTabs').classList.toggle('hidden',mode==='kanban');
  document.querySelector('.campaign-overview')?.classList.toggle('hidden',mode==='kanban');
  applyFilters();
  if(mode==='kanban')$('resultCount').textContent=`${kanbanRows().length} en el tablero`;
}
function kanbanRows(){
  const q=$('searchProspect').value.trim().toLocaleLowerCase('es-MX');
  return baseScoped().filter(p=>{
    if(!q)return true;
    const hay=[nameOf(p),p.phone,p.email,p.guardian_name,p.category_interest,p.school_name,p.source_campaign,p.source_channel,p.purpose,p.referral_name]
      .filter(Boolean).join(' ').toLocaleLowerCase('es-MX');
    return hay.includes(q);
  });
}
function buildKanbanCard(p){
  const card=document.createElement('div');
  card.className=`kanban-card st-${p.status} ${overdue(p)?'overdue':''}`;
  card.dataset.id=p.id;
  const photoHtml=p.photo_url?`<img src="${p.photo_url}" alt="">`:`<span>${initials(p)}</span>`;
  const flag=needsContact(p)?'<span class="lead-badge alert">Sin contactar</span>':overdue(p)?'<span class="lead-badge danger">Vencido</span>':'<span></span>';
  card.innerHTML=`<div class="kanban-card-top"><span class="kanban-avatar">${photoHtml}</span><div class="kanban-card-name"><strong>${safeHtml(nameOf(p)||'Sin nombre')}</strong><small>${safeHtml(p.category_interest||'Categoría por definir')}</small></div></div><div class="kanban-card-meta">${flag}<small>${p.next_action_at?fmtDateTime(p.next_action_at):fmtDate(p.created_at)}</small></div>`;
  card.addEventListener('click',()=>{if(card.dataset.dragged==='1'){card.dataset.dragged='0';return;}openProspect(p);});
  if(ctx.canProspectsWrite){
    const moveBtn=document.createElement('button');moveBtn.type='button';moveBtn.className='kanban-move-btn';moveBtn.textContent='⇄';moveBtn.setAttribute('aria-label',`Mover a ${nameOf(p)||'prospecto'} de etapa`);
    moveBtn.addEventListener('click',(e)=>{
      e.stopPropagation();
      closeAllKanbanMenus();
      const menu=document.createElement('div');menu.className='kanban-move-menu';
      KANBAN_STAGES.filter(st=>st.key!==p.status).forEach(st=>{
        const item=document.createElement('button');item.type='button';item.textContent=st.label;
        item.addEventListener('click',(ev)=>{ev.stopPropagation();menu.remove();moveProspectToStage(p,st.key);});
        menu.appendChild(item);
      });
      card.appendChild(menu);
      const closer=(ev)=>{if(!menu.contains(ev.target)){menu.remove();document.removeEventListener('pointerdown',closer,true);}};
      setTimeout(()=>document.addEventListener('pointerdown',closer,true),0);
    });
    card.querySelector('.kanban-card-top')?.appendChild(moveBtn);
    attachKanbanDrag(card,p);
  }
  return card;
}
function closeAllKanbanMenus(){document.querySelectorAll('.kanban-move-menu').forEach(m=>m.remove());}
function moveProspectToStage(p,newStage){
  if(newStage===p.status)return;
  if(newStage==='converted'){
    openProspect(p);
    setTimeout(()=>$('conversionSection')?.scrollIntoView({behavior:'smooth',block:'start'}),150);
  }else if(newStage==='not_continuing'){
    openProspect(p).then(()=>{$('prospectStatus').value='not_continuing';toggleLossReasonField();setTimeout(()=>$('lossReasonField')?.scrollIntoView({behavior:'smooth',block:'center'}),150);});
  }else{
    p.status=newStage;
    saveKanbanStatus(p,newStage);
  }
}
function renderKanban(){
  const board=$('kanbanBoard');if(!board)return;board.innerHTML='';
  const rows=kanbanRows();
  for(const stage of KANBAN_STAGES){
    const col=document.createElement('div');col.className='kanban-col';col.dataset.stage=stage.key;
    const stageRows=rows.filter(p=>p.status===stage.key);
    const head=document.createElement('div');head.className='kanban-col-head';head.innerHTML=`<strong>${stage.label}</strong><span class="kanban-col-count">${stageRows.length}</span>`;
    const body=document.createElement('div');body.className='kanban-col-body';body.dataset.stage=stage.key;
    for(const p of stageRows)body.appendChild(buildKanbanCard(p));
    col.append(head,body);board.appendChild(col);
  }
}
async function saveKanbanStatus(p,newStatus){
  try{
    await rpc('v2_update_prospect_followup',{organization_id:ctx.organization_id,prospect_id:p.id,status:newStatus,next_action_at:p.next_action_at||null,notes:p.notes||null,loss_reason:null});
    toast(`${nameOf(p)||'Prospecto'} → ${statusLabel[newStatus]||newStatus}`);
  }catch(e){toast(friendly(e));}
  finally{await loadProspects();}
}
function attachKanbanDrag(card,p){
  if(!ctx.canProspectsWrite)return;
  card.classList.add('draggable');
  let dragging=false,grabX=0,grabY=0,placeholder=null,originBody=null,startX=0,startY=0;
  function onMove(ev){
    const dx=ev.clientX-startX,dy=ev.clientY-startY;
    if(!dragging&&Math.hypot(dx,dy)>8){
      dragging=true;
      const rect=card.getBoundingClientRect();
      grabX=startX-rect.left;grabY=startY-rect.top;
      placeholder=document.createElement('div');placeholder.className='kanban-placeholder';placeholder.style.height=`${rect.height}px`;
      originBody=card.parentElement;
      originBody.insertBefore(placeholder,card);
      card.classList.add('dragging');
      card.style.width=`${rect.width}px`;
      card.style.position='fixed';card.style.zIndex='9995';
    }
    if(dragging){
      card.style.left=`${ev.clientX-grabX}px`;card.style.top=`${ev.clientY-grabY}px`;
      document.querySelectorAll('.kanban-col-body.drag-over').forEach(el=>el.classList.remove('drag-over'));
      const under=document.elementFromPoint(ev.clientX,ev.clientY);
      const col=under?.closest('.kanban-col-body');
      if(col)col.classList.add('drag-over');
    }
  }
  function onUp(ev){
    card.removeEventListener('pointermove',onMove);
    card.removeEventListener('pointerup',onUp);
    card.removeEventListener('pointercancel',onUp);
    if(!dragging)return;
    document.querySelectorAll('.kanban-col-body.drag-over').forEach(el=>el.classList.remove('drag-over'));
    card.classList.remove('dragging');
    card.style.position='';card.style.left='';card.style.top='';card.style.width='';card.style.zIndex='';
    card.dataset.dragged='1';
    const under=document.elementFromPoint(ev.clientX,ev.clientY);
    const col=under?.closest('.kanban-col-body');
    placeholder?.remove();
    if(col&&col.dataset.stage&&col.dataset.stage!==p.status){
      const newStage=col.dataset.stage;
      (newStage==='converted'||newStage==='not_continuing'?originBody:col).appendChild(card);
      moveProspectToStage(p,newStage);
    }else{
      originBody.appendChild(card);
    }
    setTimeout(()=>{card.dataset.dragged='0';},250);
  }
  card.addEventListener('pointerdown',(ev)=>{
    if(ev.pointerType==='mouse'&&ev.button!==0)return;
    startX=ev.clientX;startY=ev.clientY;dragging=false;
    try{card.setPointerCapture(ev.pointerId);}catch{}
    card.addEventListener('pointermove',onMove);
    card.addEventListener('pointerup',onUp);
    card.addEventListener('pointercancel',onUp);
  });
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
  for(const [label,count,value] of items){const b=document.createElement('button');b.type='button';b.className=`attention-chip ${count?'hot':''}`;b.innerHTML=`<span>${label}</span><strong>${count}</strong>`;b.addEventListener('click',()=>{setActiveView('pipeline');$('urgencyFilter').value=value;applyFilters();});box.appendChild(b);}
}

const EMPTY_MESSAGES={pipeline:'🎉 Sin pendientes: no hay prospectos activos con estos filtros.',converted:'Aún no hay convertidos con estos filtros.',lost:'Nadie marcado como "No continúa" con estos filtros.',all:'No hay prospectos con estos filtros.'};
function applyFilters(){
  const status=$('statusFilter').value,q=$('searchProspect').value.trim().toLocaleLowerCase('es-MX'),urgency=$('urgencyFilter').value;
  filtered=viewFiltered().filter(p=>{
    if(status==='trial'){if(!['trial_scheduled','trial_completed'].includes(p.status))return false;}
    else if(status&&p.status!==status)return false;
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
  renderKpis();renderList();updateTabCounts();
  if(viewMode==='list'){
    $('resultCount').textContent=`${filtered.length} resultado${filtered.length===1?'':'s'}`;
    $('prospectEmpty').textContent=EMPTY_MESSAGES[activeView]||EMPTY_MESSAGES.all;
  }
  if(viewMode==='kanban')renderKanban();
  updateFilterButton();
}

function updateFilterButton(){
  const ids=['statusFilter','typeFilter','campaignFilter','sourceFilter','urgencyFilter'];
  ids.forEach(id=>{const el=$(id);if(el)el.classList.toggle('has-value',!!el.value);});
  document.querySelectorAll('.pill-group').forEach(group=>{const sel=$(group.dataset.for);if(!sel)return;group.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.value===sel.value));});
  const button=$('toggleProspectFilters');if(!button)return;
  const count=ids.filter(id=>$(id).value).length;
  button.querySelector('span').textContent=count?`Filtros · ${count}`:'Filtros';
  button.classList.toggle('active',count>0);
}

function makeBadge(text,cls='neutral'){const span=document.createElement('span');span.className=`lead-badge ${cls}`;span.textContent=text;return span;}
function renderList(){
  const list=$('prospectList');list.innerHTML='';$('prospectEmpty').classList.toggle('hidden',viewMode!=='list'||filtered.length>0);
  for(const p of filtered){
    const card=document.createElement('article');card.className=`prospect-row st-${p.status} ${overdue(p)?'overdue':''} ${needsContact(p)?'new-lead':''}`;
    const clickArea=document.createElement('button');clickArea.type='button';clickArea.className='prospect-open';
    const photo=document.createElement('span');photo.className=`prospect-card-photo ${p.photo_url?'has-photo':''}`;if(p.photo_url){const image=document.createElement('img');image.src=p.photo_url;image.alt=`Foto de ${nameOf(p)}`;photo.appendChild(image);}else{const mark=document.createElement('span'),missing=document.createElement('small');mark.textContent=initials(p);missing.textContent='Sin foto';photo.append(mark,missing);}
    const main=document.createElement('div');main.className='prospect-main';
    const strong=document.createElement('strong');strong.textContent=nameOf(p)||'Sin nombre';
    const sporting=document.createElement('div');sporting.className='prospect-sporting';
    const category=document.createElement('b');category.textContent=p.category_interest||'Categoría por definir';
    const age=ageOf(p),profile=document.createElement('span');profile.textContent=[typeLabel[p.registration_type]||'Prospecto',age!=null?`${age} años`:null,footLabel[p.dominant_foot]].filter(Boolean).join(' · ');
    sporting.append(category,profile);
    const contact=document.createElement('small');contact.textContent=[p.guardian_name,p.phone||p.email].filter(Boolean).join(' · ')||'Contacto pendiente';
    const badges=document.createElement('div');badges.className='lead-badges';
    badges.append(makeBadge(campaignName(p.source_campaign),'campaign'));
    if(p.source_channel||p.source)badges.append(makeBadge(sourceName(p.source_channel||p.source),'source'));
    if(needsContact(p))badges.append(makeBadge('Sin contactar','alert'));
    else if(overdue(p))badges.append(makeBadge('Seguimiento vencido','danger'));
    else if(upcoming(p))badges.append(makeBadge('Próxima acción','warning'));
    main.append(strong,sporting,contact,badges);
    const meta=document.createElement('div');meta.className='prospect-meta';
    const pipe=document.createElement('span');pipe.className=`pipeline ${p.status}`;pipe.textContent=statusLabel[p.status]||p.status;
    const small=document.createElement('small');small.textContent=p.next_action_at?`Siguiente: ${fmtDateTime(p.next_action_at)}`:`Alta: ${fmtDate(p.created_at)}`;
    meta.append(pipe,small);
    clickArea.append(photo,main,meta);clickArea.addEventListener('click',()=>openProspect(p));
    const actions=document.createElement('div');actions.className='lead-actions';
    const wa=waUrl(p.phone);
    if(wa){const a=document.createElement('a');a.className='whatsapp-action';a.href=wa;a.target='_blank';a.rel='noopener noreferrer';a.textContent='WhatsApp';a.setAttribute('aria-label',`Abrir WhatsApp de ${nameOf(p)}`);actions.appendChild(a);}
    if(ctx.canPlayersWrite&&ctx.canProspectsWrite&&p.status==='trial_completed'){const convert=document.createElement('button');convert.type='button';convert.className='convert-card-action';convert.textContent='Dar de alta';convert.addEventListener('click',async()=>{await openProspect(p);$('conversionSection')?.scrollIntoView({behavior:'smooth',block:'start'});});actions.appendChild(convert);}
    const detail=document.createElement('button');detail.type='button';detail.className='secondary mini';detail.textContent='Ver ficha';detail.addEventListener('click',()=>openProspect(p));actions.appendChild(detail);
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
  if(p.status==='not_continuing'&&p.loss_reason)addDetail(box,'Motivo',p.loss_reason);
  if(p.assigned_user_name)addDetail(box,'Responsable',p.assigned_user_name);
  const badges=$('consentBadges');badges.innerHTML='';
  const data=document.createElement('span');data.className=`consent-badge ${p.data_consent?'ok':'warn'}`;data.textContent=p.data_consent?'Datos autorizados':'Consentimiento pendiente';
  const image=document.createElement('span');image.className=`consent-badge ${p.image_consent?'ok':'neutral'}`;image.textContent=p.image_consent?'Imagen autorizada':'Imagen solo control interno';
  const version=document.createElement('span');version.className='consent-badge neutral';version.textContent=p.privacy_notice_version?`Aviso ${p.privacy_notice_version}`:'Registro anterior';
  badges.append(data,image,version);
}
function renderDrawerActions(p){const wrap=$('drawerQuickActions');wrap.innerHTML='';const wa=waUrl(p.phone);if(wa){const a=document.createElement('a');a.className='whatsapp-action drawer-wa';a.href=wa;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Abrir WhatsApp';wrap.appendChild(a);}const campaign=document.createElement('span');campaign.className='lead-badge campaign';campaign.textContent=campaignName(p.source_campaign);wrap.appendChild(campaign);if(overdue(p))wrap.appendChild(makeBadge('Seguimiento vencido','danger'));else if(needsContact(p))wrap.appendChild(makeBadge('Sin contactar','alert'));}
const KNOWN_LOSS_REASONS=['Precio / costo','Distancia / ubicación','Se fue a otro club','Horarios no le acomodan','No contestó / se enfrió'];
function toggleLossReasonField(){
  const show=$('prospectStatus').value==='not_continuing';
  $('lossReasonField')?.classList.toggle('hidden',!show);
}
function setLossReasonValue(reason){
  const sel=$('lossReasonSelect'),custom=$('lossReasonCustom');if(!sel||!custom)return;
  if(reason&&KNOWN_LOSS_REASONS.includes(reason)){sel.value=reason;custom.classList.add('hidden');custom.value='';}
  else if(reason){sel.value='custom';custom.classList.remove('hidden');custom.value=reason;}
  else{sel.value='';custom.classList.add('hidden');custom.value='';}
}
function currentLossReasonValue(){
  const sel=$('lossReasonSelect'),custom=$('lossReasonCustom');if(!sel)return null;
  if(sel.value==='custom')return custom.value.trim()||null;
  return sel.value||null;
}
function prepareConversion(p){const section=$('conversionSection');const allowed=ctx.canPlayersWrite&&ctx.canProspectsWrite&&p.status!=='converted';section.classList.toggle('hidden',!allowed);msg('convertMessage');if(!allowed)return;renderConvertCategories();const match=categories.find(c=>String(c.name||'').toLocaleLowerCase('es-MX')===String(p.category_interest||'').toLocaleLowerCase('es-MX'));$('convertCategory').value=match?.id||'';$('convertFee').value='';$('convertDate').value=todayLocal();$('convertJersey').value='';$('convertPosition').value=p.registration_type==='goalkeeper'?'Portero':'';}
async function openProspect(p){
  current=p;$('prospectName').textContent=nameOf(p)||'Prospecto';$('prospectMeta').textContent=`${typeLabel[p.registration_type]||p.category_interest||'Prospecto'} · alta ${fmtDate(p.created_at)}`;
  $('prospectStatus').value=p.status||'new';$('nextAction').value=p.next_action_at?localDateTimeValue(p.next_action_at):'';$('prospectNotes').value=p.notes||'';
  setLossReasonValue(p.loss_reason||null);toggleLossReasonField();
  $('saveFollowup').disabled=!ctx.canProspectsWrite;msg('followupMessage');renderProspectDetails(p);renderDrawerActions(p);prepareConversion(p);
  const scoutingLink=$('openProspectScouting');if(scoutingLink){const params=new URLSearchParams({prospect:p.id,name:nameOf(p),category:p.category_interest||'',type:p.registration_type||''});scoutingLink.href=`/scouting/?${params}`;scoutingLink.classList.toggle('hidden',!ctx.canScoutingWrite);}
  $('deleteProspectSection')?.classList.toggle('hidden',!ctx.is_owner);$('deleteProspectConfirm')?.classList.add('hidden');$('deleteProspect')?.classList.remove('hidden');msg('deleteProspectMessage');
  await Promise.all([renderProspectPhoto(p),loadScoutingHistory()]);
  $('prospectBackdrop').classList.remove('hidden');$('prospectDrawer').classList.remove('hidden');$('prospectDrawer').setAttribute('aria-hidden','false');
}
function closeProspect(){current=null;$('prospectBackdrop').classList.add('hidden');$('prospectDrawer').classList.add('hidden');$('prospectDrawer').setAttribute('aria-hidden','true');}

/* Reporte de conversión: se calcula en el navegador sobre los prospectos ya cargados
   (todas las etapas, sin filtro de fecha por ahora) — no hace falta un RPC nuevo porque
   v2_prospects ya trae status, loss_reason y assigned_user_name. */
function groupConversionStats(list,keyFn){
  const map=new Map();
  for(const p of list){
    const key=keyFn(p)||'Sin especificar';
    if(!map.has(key))map.set(key,{key,total:0,converted:0,lost:0,active:0});
    const g=map.get(key);g.total++;
    if(p.status==='converted')g.converted++;
    else if(p.status==='not_continuing')g.lost++;
    else g.active++;
  }
  return [...map.values()].map(g=>({...g,rate:g.total?Math.round((g.converted/g.total)*100):0})).sort((a,b)=>b.total-a.total);
}
function lossReasonStats(list){
  const lost=list.filter(p=>p.status==='not_continuing'),total=lost.length,map=new Map();
  for(const p of lost){const key=p.loss_reason||'Sin especificar';map.set(key,(map.get(key)||0)+1);}
  return [...map.entries()].map(([reason,count])=>({reason,count,pct:total?Math.round((count/total)*100):0})).sort((a,b)=>b.count-a.count);
}
function renderConversionTable(boxId,rows){
  const box=$(boxId);if(!box)return;
  box.innerHTML=rows.length?rows.map(r=>`<tr><td>${safeHtml(r.key)}</td><td>${r.total}</td><td>${r.converted}</td><td>${r.lost}</td><td>${r.rate}%</td></tr>`).join(''):'<tr><td colspan="5" class="mini-empty">Sin datos.</td></tr>';
}
function safeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function openReport(){
  const summary=$('reportSummary');
  const total=prospects.length,converted=prospects.filter(p=>p.status==='converted').length,lost=prospects.filter(p=>p.status==='not_continuing').length,active=total-converted-lost;
  const rate=total?Math.round((converted/total)*100):0;
  summary.innerHTML=`<article><span>Total</span><strong>${total}</strong></article><article class="success"><span>Convertidos</span><strong>${converted}</strong></article><article class="danger"><span>No continúa</span><strong>${lost}</strong></article><article><span>En proceso</span><strong>${active}</strong></article><article class="attention"><span>Tasa de conversión</span><strong>${rate}%</strong></article>`;
  renderConversionTable('reportByChannel',groupConversionStats(prospects,p=>sourceName(p.source_channel||p.source)));
  renderConversionTable('reportByCampaign',groupConversionStats(prospects,p=>campaignName(p.source_campaign)));
  renderConversionTable('reportByScout',groupConversionStats(prospects,p=>p.assigned_user_name||'Sin asignar'));
  const reasons=lossReasonStats(prospects),reasonsBox=$('reportLossReasons');
  reasonsBox.innerHTML=reasons.length?`<table><thead><tr><th>Motivo</th><th>Prospectos</th><th>% de "no continúa"</th></tr></thead><tbody>${reasons.map(r=>`<tr><td>${safeHtml(r.reason)}</td><td>${r.count}</td><td>${r.pct}%</td></tr>`).join('')}</tbody></table>`:'<p class="mini-empty">Aún no hay prospectos marcados como "No continúa".</p>';
  $('reportBackdrop').classList.remove('hidden');$('reportDrawer').classList.remove('hidden');$('reportDrawer').setAttribute('aria-hidden','false');
}
function closeReport(){$('reportBackdrop').classList.add('hidden');$('reportDrawer').classList.add('hidden');$('reportDrawer').setAttribute('aria-hidden','true');}

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

async function saveFollowup(){
  if(!current||!ctx.canProspectsWrite)return;msg('followupMessage');
  const status=$('prospectStatus').value,lossReason=currentLossReasonValue();
  if(status==='not_continuing'&&!lossReason){msg('followupMessage','Selecciona el motivo por el que no continúa.');return;}
  const btn=$('saveFollowup');btn.disabled=true;
  try{const id=current.id;await rpc('v2_update_prospect_followup',{organization_id:ctx.organization_id,prospect_id:id,status,next_action_at:$('nextAction').value?new Date($('nextAction').value).toISOString():null,notes:$('prospectNotes').value.trim()||null,loss_reason:status==='not_continuing'?lossReason:null});msg('followupMessage','Seguimiento guardado.','success');await loadProspects();current=prospects.find(p=>p.id===id)||current;if(current){renderDrawerActions(current);renderProspectDetails(current);}}catch(e){msg('followupMessage',friendly(e));}finally{btn.disabled=!ctx.canProspectsWrite;}
}
async function convertProspect(){if(!current||!ctx.canPlayersWrite||!ctx.canProspectsWrite)return;msg('convertMessage');const btn=$('convertProspect');const feeRaw=$('convertFee').value;const fee=feeRaw===''?null:Number(feeRaw);if(fee!==null&&(!Number.isFinite(fee)||fee<0)){msg('convertMessage','La cuota debe ser 0 o mayor.');return;}if(!(await window.tosConfirm({kicker:'CAPTACIÓN',title:'Convertir a Tanner',message:`Vas a convertir a ${nameOf(current)} en Tanner. Se conservan su foto, tutor, campaña y consentimientos.`,confirmText:'Sí, convertir',cancelText:'Cancelar'})))return;btn.disabled=true;btn.textContent='Convirtiendo…';try{const id=await rpc('v2_convert_prospect_to_player',{organization_id:ctx.organization_id,prospect_id:current.id,category_id:$('convertCategory').value||null,monthly_fee:fee,joined_at:$('convertDate').value||todayLocal(),jersey_number:$('convertJersey').value.trim()||null,player_position:$('convertPosition').value.trim()||null});msg('convertMessage',`Tanner creado correctamente · ${String(id).slice(0,8)}…`,'success');await loadProspects();const updated=prospects.find(p=>p.id===current.id);if(updated){current=updated;$('prospectStatus').value=updated.status;prepareConversion(updated);renderDrawerActions(updated);}}catch(e){msg('convertMessage',friendly(e));}finally{btn.disabled=false;btn.textContent='Convertir a Tanner';}}
async function loadScoutingHistory(){const box=$('scoutingHistory');box.innerHTML='';if(!ctx.canScoutingRead){box.innerHTML='<div class="empty">Sin acceso a Scouting.</div>';return;}const rows=await rpc('v2_scouting_reports',{organization_id:ctx.organization_id,prospect_id:current.id});if(!rows?.length){box.innerHTML='<div class="empty">Aún no tiene evaluaciones deportivas.</div>';return;}for(const r of rows){const values=[r.technical_score,r.physical_score,r.tactical_score,r.mental_score].filter(v=>v!=null).map(Number);const avg=values.length?values.reduce((a,b)=>a+b,0)/values.length:0;const card=document.createElement('article');card.className='scout-card';const left=document.createElement('div'),right=document.createElement('div');const when=document.createElement('strong');when.textContent=fmtDateTime(r.observed_at);const where=document.createElement('span');where.textContent=`${r.observed_location||'Sin lugar'} · ${r.player_position||'Sin posición'}`;left.append(when,where);const score=document.createElement('b');score.textContent=avg?avg.toFixed(1):'—';const verdict=document.createElement('span');verdict.textContent=r.verdict||'Sin veredicto';right.append(score,verdict);card.append(left,right);box.appendChild(card);}}

function mountCaptureUx(){
  const link=document.createElement('link');link.rel='stylesheet';link.href='/v2/prospectos/ux.css?v=20260905d';document.head.appendChild(link);
  const filters=document.querySelector('.campaign-filters'),head=document.querySelector('.campaign-panel-head');
  if(filters&&head&&!$('prospectSearchBar')){
    const toolbar=document.createElement('div');toolbar.className='prospect-tools';toolbar.innerHTML='<label id="prospectSearchBar" class="prospect-search-bar"><span class="tos-icon tos-icon-search" aria-hidden="true"></span></label><button id="toggleProspectFilters" class="prospect-filter-toggle" type="button"><span>Filtros</span><i class="tos-icon tos-icon-chevron" aria-hidden="true"></i></button>';
    toolbar.querySelector('label').appendChild($('searchProspect'));head.after(toolbar);toolbar.after(filters);
    $('toggleProspectFilters').addEventListener('click',()=>{filters.classList.toggle('open');$('toggleProspectFilters').classList.toggle('open',filters.classList.contains('open'));});
  }
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
$('statusFilter').addEventListener('change',()=>{
  const v=$('statusFilter').value;
  if(v==='converted')setActiveView('converted');
  else if(v==='not_continuing')setActiveView('lost');
  else if(v&&activeView!=='all')setActiveView('pipeline');
  applyFilters();
});
$('urgencyFilter').addEventListener('change',()=>{if($('urgencyFilter').value)setActiveView('pipeline');applyFilters();});
document.querySelectorAll('.pill-group button').forEach(b=>{
  b.addEventListener('click',()=>{
    const group=b.closest('.pill-group'),sel=group&&$(group.dataset.for);
    if(!sel||sel.value===b.dataset.value)return;
    sel.value=b.dataset.value;
    if(sel.id==='urgencyFilter'&&b.dataset.value)setActiveView('pipeline');
    applyFilters();
  });
});
$('searchProspect').addEventListener('input',applyFilters);
$('clearFilters').addEventListener('click',()=>{for(const id of ['statusFilter','typeFilter','campaignFilter','sourceFilter','urgencyFilter'])$(id).value='';$('searchProspect').value='';setActiveView('pipeline');applyFilters();});
document.querySelectorAll('.pipeline-tab').forEach(btn=>btn.addEventListener('click',()=>{setActiveView(btn.dataset.view);applyFilters();}));
$('viewList').addEventListener('click',()=>setViewMode('list'));
$('viewKanban').addEventListener('click',()=>setViewMode('kanban'));
document.querySelectorAll('.funnel-stage').forEach(btn=>btn.addEventListener('click',()=>{
  const stage=btn.dataset.stage;
  if(stage==='converted'){setActiveView('converted');$('statusFilter').value='';}
  else{setActiveView('pipeline');$('statusFilter').value=stage;}
  applyFilters();
}));
document.querySelectorAll('.kpi-card').forEach(btn=>btn.addEventListener('click',()=>{
  const kind=btn.dataset.kpi;$('statusFilter').value='';$('urgencyFilter').value='';
  if(kind==='needs_contact'){setActiveView('pipeline');$('urgencyFilter').value='needs_contact';}
  else if(kind==='overdue'){setActiveView('pipeline');$('urgencyFilter').value='overdue';}
  else if(kind==='trial'){setActiveView('all');$('statusFilter').value='trial';}
  else if(kind==='converted'){setActiveView('converted');}
  else{setActiveView('all');}
  applyFilters();
}));
$('refreshProspects').addEventListener('click',loadProspects);
$('closeProspect').addEventListener('click',closeProspect);$('prospectBackdrop').addEventListener('click',closeProspect);
$('saveFollowup').addEventListener('click',saveFollowup);$('convertProspect').addEventListener('click',convertProspect);
$('openReport').addEventListener('click',openReport);$('closeReport').addEventListener('click',closeReport);$('reportBackdrop').addEventListener('click',closeReport);
$('prospectStatus').addEventListener('change',toggleLossReasonField);
$('lossReasonSelect')?.addEventListener('change',()=>{$('lossReasonCustom').classList.toggle('hidden',$('lossReasonSelect').value!=='custom');});
$('signOut').addEventListener('click',async()=>{await supabase.auth.signOut();location.href='/';});

boot().catch(e=>{$('deniedText').textContent=friendly(e)||'No pudimos abrir Prospectos.';show('deniedView');});
