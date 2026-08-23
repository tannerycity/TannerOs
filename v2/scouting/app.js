import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase=createClient(
  'https://pacnegivzgxpanphrnwp.supabase.co',
  'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',
  {auth:{persistSession:true,autoRefreshToken:true}}
);

const $=id=>document.getElementById(id);
let ctx=null,reports=[],current=null,canWrite=false,selectedQuality='',pendingPhoto=null,pendingPreviewUrl=null;
const DAY=86400000;
const PHOTO_BUCKET='tanneros-private',MAX_PHOTO_BYTES=5*1024*1024;

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
function initials(name){return String(name||'TC').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();}
function scoreWord(v){const n=Number(v);return n>=9?'Sobresale':n>=7?'Destaca':n>=5?'Cumple':n>0?'Por desarrollar':'Sin evaluar';}
function loadImage(file){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('No pudimos leer la foto.'));};img.src=url;});}
function canvasBlob(canvas,type,quality){return new Promise(resolve=>canvas.toBlob(resolve,type,quality));}
async function preparePhoto(file){if(!file||!String(file.type||'').startsWith('image/'))throw new Error('Selecciona una imagen válida.');const img=await loadImage(file),w=img.naturalWidth||img.width,h=img.naturalHeight||img.height,scale=Math.min(1,1600/Math.max(w,h)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));const c=canvas.getContext('2d');if(!c)throw new Error('No pudimos preparar la foto.');c.drawImage(img,0,0,canvas.width,canvas.height);let blob=await canvasBlob(canvas,'image/webp',.84),ext='webp';if(!blob){blob=await canvasBlob(canvas,'image/jpeg',.82);ext='jpg';}if(blob?.size>MAX_PHOTO_BYTES){blob=await canvasBlob(canvas,'image/jpeg',.66);ext='jpg';}if(!blob||blob.size>MAX_PHOTO_BYTES)throw new Error('La foto es demasiado pesada.');return{blob,ext,mime:blob.type||'image/jpeg'};}
async function uploadScoutPhoto(reportId,file){const prepared=await preparePhoto(file),path=`organizations/${ctx.organization_id}/scouting/${reportId}/profile-${Date.now()}.${prepared.ext}`,previousPath=reports.find(r=>r.id===reportId)?.photo_path;const {error}=await supabase.storage.from(PHOTO_BUCKET).upload(path,prepared.blob,{contentType:prepared.mime,cacheControl:'3600',upsert:false});if(error)throw error;try{await rpc('v2_set_scouting_photo',{organization_id:ctx.organization_id,report_id:reportId,photo_path:path});}catch(e){await supabase.storage.from(PHOTO_BUCKET).remove([path]);throw e;}if(previousPath&&previousPath!==path&&previousPath.startsWith(`organizations/${ctx.organization_id}/scouting/${reportId}/`))await supabase.storage.from(PHOTO_BUCKET).remove([previousPath]);return path;}
async function loadPhotos(){const rows=await rpc('v2_scouting_photos',{organization_id:ctx.organization_id})||[],byId=new Map(rows.map(x=>[x.report_id,x.photo_path]));await Promise.all(reports.map(async r=>{r.photo_path=byId.get(r.id)||null;r.photo_url=null;if(!r.photo_path)return;const {data}=await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(r.photo_path,600);r.photo_url=data?.signedUrl||null;}));}
function setPhotoPreview(file){pendingPhoto=file||null;if(pendingPreviewUrl)URL.revokeObjectURL(pendingPreviewUrl);pendingPreviewUrl=file?URL.createObjectURL(file):null;const box=$('scoutPhotoPreview');box.innerHTML=pendingPreviewUrl?`<img src="${safe(pendingPreviewUrl)}" alt="Vista previa del jugador">`:'<span class="tos-icon tos-icon-camera" aria-hidden="true"></span><strong>Agregar foto</strong><small>Cámara o galería</small>';}
function renderDetailPhoto(r){const box=$('detailPhoto');if(!box)return;box.innerHTML=r.photo_url?`<img src="${safe(r.photo_url)}" alt="Foto de ${safe(r.observed_name||'jugador')}">`:`<span>${safe(initials(r.observed_name))}</span>`;$('changeScoutPhoto').classList.toggle('hidden',!canWrite);}
function toast(text){const el=$('scoutToast');if(!el)return;el.textContent=text;el.classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('visible'),3200);}

async function boot(){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session){location.href='/';return;}
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
  await loadPhotos();
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
    card.innerHTML=`<span class="scout-avatar">${r.photo_url?`<img src="${safe(r.photo_url)}" alt="Foto de ${safe(r.observed_name||'jugador')}">`:safe(initials(r.observed_name))}</span><div class="scout-main"><strong>${safe(r.observed_name||'Sin nombre')}</strong><span>${safe([r.player_position,r.category,r.observed_location].filter(Boolean).join(' · ')||'Completar datos deportivos')}</span><small>${safe(next)}</small><div class="pipeline-badges">${badges(r)}</div></div><div class="scout-side"><span class="score-ring"><b>${avgText}</b><small>${avg.length?scoreWord(avgText):'Pendiente'}</small></span><span class="scout-chevron" aria-hidden="true">›</span></div>`;
    card.addEventListener('click',()=>openReport(r.id));list.appendChild(card);
  });
}

function openCreate(){
  current=null;
  $('drawerEyebrow').textContent='NUEVA VISORÍA';$('drawerName').textContent='Detectar talento';$('drawerMeta').textContent='Nueva observación en cancha';
  $('createSection').classList.remove('hidden');$('detailSection').classList.add('hidden');$('followupSection').classList.add('hidden');
  $('deleteSection')?.classList.add('hidden');
  ['observedName','observedLocation','playerPosition','category','technicalScore','physicalScore','tacticalScore','mentalScore','starQuality','createVerdict','createNotes'].forEach(id=>$(id).value='');
  selectedQuality='';document.querySelectorAll('[data-score],[data-quality],[data-decision]').forEach(b=>b.classList.remove('selected'));$('quickDecision').value='follow';$('createVerdict').value='Volver a observar';document.querySelector('[data-decision="follow"]')?.classList.add('selected');
  setPhotoPreview(null);
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
  $('deleteSection')?.classList.toggle('hidden',!canWrite);$('deleteConfirm')?.classList.add('hidden');$('deleteScout')?.classList.remove('hidden');
  scoreCards(r);facts(r);
  renderDetailPhoto(r);
  $('reportStatus').value=r.status||'open';$('interestLevel').value=['alto','medio','bajo'].includes(String(r.interest_level||'').toLowerCase())?String(r.interest_level).toLowerCase():'';
  $('nextActionAt').value=r.next_action_at?localInput(r.next_action_at):'';$('updateVerdict').value=r.verdict||'';$('updateNotes').value=r.notes||'';
  ['reportStatus','interestLevel','nextActionAt','updateVerdict','updateNotes','saveFollowup'].forEach(id=>$(id).disabled=!canWrite);
  message('followupMessage');openDrawer();
}

function openDrawer(){$('backdrop').classList.remove('hidden');$('drawer').classList.remove('hidden');$('drawer').setAttribute('aria-hidden','false');}
function closeDrawer(){current=null;$('backdrop').classList.add('hidden');$('drawer').classList.add('hidden');$('drawer').setAttribute('aria-hidden','true');message('createMessage');message('followupMessage');}

async function deleteScout(){
  if(!current||!canWrite)return;
  const report=current,button=$('confirmDeleteScout');button.disabled=true;button.textContent='Eliminando…';
  try{
    const result=await rpc('v2_delete_scouting_report',{organization_id:ctx.organization_id,report_id:report.id});
    closeDrawer();await load();
    if(result?.photoPath&&result?.photoBucket===PHOTO_BUCKET)await supabase.storage.from(PHOTO_BUCKET).remove([result.photoPath]);
    toast(`${report.observed_name||'La visoría'} se eliminó del radar.`);
  }catch(e){message('deleteMessage',e.message||'No pudimos eliminar la visoría.');}
  finally{button.disabled=false;button.textContent='Sí, eliminar visoría';}
}

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
    const decision=$('quickDecision').value,interest=decision==='invite'?'alto':decision==='follow'?'medio':'bajo',next=decision==='reject'?null:new Date(Date.now()+(decision==='invite'?2:7)*DAY).toISOString(),status=decision==='reject'?'closed':'open';
    await rpc('v2_update_scouting_report',{organization_id:ctx.organization_id,report_id:id,status,interest_level:interest,next_action_at:next,verdict:$('createVerdict').value.trim()||null,notes:$('createNotes').value.trim()||null});
    let photoWarning='';if(pendingPhoto){try{await uploadScoutPhoto(id,pendingPhoto);}catch(e){photoWarning='Talento guardado, pero la foto no pudo subirse. Puedes agregarla desde su ficha.';}}
    await load();closeDrawer();const created=reports.find(r=>r.id===id);if(created){openReport(created.id);if(photoWarning)message('followupMessage',photoWarning);}
  }catch(e){message('createMessage',e.message||'No se pudo guardar la visoría.');}finally{btn.disabled=!canWrite;}
}

async function saveFollowup(){
  if(!current||!canWrite)return;const btn=$('saveFollowup');btn.disabled=true;message('followupMessage');
  try{
    await rpc('v2_update_scouting_report',{organization_id:ctx.organization_id,report_id:current.id,status:$('reportStatus').value,interest_level:$('interestLevel').value||null,next_action_at:toIsoOrNull($('nextActionAt').value),verdict:$('updateVerdict').value.trim()||null,notes:$('updateNotes').value.trim()||null});
    const id=current.id;await load();current=reports.find(r=>r.id===id)||null;if(current){await openReport(id);message('followupMessage','Seguimiento guardado.','success');}else closeDrawer();
  }catch(e){message('followupMessage',e.message||'No se pudo guardar el seguimiento.');}finally{btn.disabled=!canWrite;}
}

function mountPhotoUi(){
  if(!document.querySelector('link[href^="/v2/scouting/photos.css"]')){const link=document.createElement('link');link.rel='stylesheet';link.href='/v2/scouting/photos.css?v=20260823b';document.head.appendChild(link);}
  const identity=$('observedName')?.closest('.identity-grid');
  if(identity&&!$('scoutPhotoPreview')){
    const block=document.createElement('div');block.className='scout-photo-capture';block.innerHTML=`<button id="scoutPhotoPreview" class="scout-photo-preview" type="button"><span class="tos-icon tos-icon-camera" aria-hidden="true"></span><strong>Agregar foto</strong><small>Abrir cámara</small></button><div><strong>Foto del jugador</strong><small>Acércate lo suficiente para reconocerlo después.</small><button id="chooseScoutPhoto" class="secondary mini" type="button">Elegir de galería</button></div><input id="scoutPhotoCamera" type="file" accept="image/*" capture="environment" hidden><input id="scoutPhotoUpload" type="file" accept="image/*" hidden>`;identity.before(block);
  }
  const detail=$('detailSection');
  if(detail&&!$('detailPhoto')){
    const block=document.createElement('div');block.className='detail-photo-wrap';block.innerHTML=`<div id="detailPhoto" class="detail-photo"><span>TC</span></div><button id="changeScoutPhoto" class="secondary mini" type="button">Cambiar foto</button><input id="existingScoutPhoto" type="file" accept="image/*" capture="environment" hidden>`;detail.insertBefore(block,detail.querySelector('.eyebrow'));
  }
  const followup=$('followupSection');
  if(followup&&!$('deleteSection')){
    const section=document.createElement('section');section.id='deleteSection';section.className='drawer-section scouting-danger hidden';section.innerHTML=`<button id="deleteScout" class="delete-scout" type="button"><span class="tos-icon tos-icon-trash" aria-hidden="true"></span>Eliminar visoría</button><div id="deleteConfirm" class="delete-confirm hidden"><strong>¿Eliminar esta visoría?</strong><p>Se borrarán el registro y su foto. Si ya se convirtió en Tanner, su ficha de jugador no se eliminará.</p><div><button id="cancelDeleteScout" class="secondary" type="button">Cancelar</button><button id="confirmDeleteScout" class="danger-action" type="button">Sí, eliminar visoría</button></div><div id="deleteMessage" class="inline-message hidden"></div></div>`;followup.after(section);
  }
  if(!$('scoutToast')){const notice=document.createElement('div');notice.id='scoutToast';notice.className='scout-toast';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');document.body.appendChild(notice);}
}
mountPhotoUi();

$('deleteScout').addEventListener('click',()=>{$('deleteScout').classList.add('hidden');$('deleteConfirm').classList.remove('hidden');$('deleteConfirm').scrollIntoView({behavior:'smooth',block:'nearest'});message('deleteMessage');});$('cancelDeleteScout').addEventListener('click',()=>{$('deleteConfirm').classList.add('hidden');$('deleteScout').classList.remove('hidden');message('deleteMessage');});$('confirmDeleteScout').addEventListener('click',deleteScout);
$('newScout').addEventListener('click',openCreate);$('statusFilter').addEventListener('change',renderList);$('pipelineFilter').addEventListener('change',renderList);$('searchScout').addEventListener('input',renderList);document.querySelectorAll('[data-pipeline]').forEach(b=>b.addEventListener('click',()=>{$('pipelineFilter').value=b.dataset.pipeline;renderList();document.querySelector('.scout-list')?.scrollIntoView({behavior:'smooth',block:'start'});}));document.querySelectorAll('[data-score]').forEach(b=>b.addEventListener('click',()=>{const group=b.closest('[data-score-group]'),input=$(group.dataset.scoreGroup);input.value=b.dataset.score;group.querySelectorAll('[data-score]').forEach(x=>x.classList.toggle('selected',x===b));group.querySelector('.score-reading').textContent=scoreWord(b.dataset.score);}));document.querySelectorAll('[data-quality]').forEach(b=>b.addEventListener('click',()=>{selectedQuality=b.dataset.quality;$('starQuality').value=selectedQuality;document.querySelectorAll('[data-quality]').forEach(x=>x.classList.toggle('selected',x===b));}));document.querySelectorAll('[data-decision]').forEach(b=>b.addEventListener('click',()=>{$('quickDecision').value=b.dataset.decision;document.querySelectorAll('[data-decision]').forEach(x=>x.classList.toggle('selected',x===b));$('createVerdict').value=({follow:'Volver a observar',invite:'Invitar a prueba',reject:'No continuar'})[b.dataset.decision];}));$('scoutPhotoPreview').addEventListener('click',()=>$('scoutPhotoCamera').click());$('chooseScoutPhoto').addEventListener('click',()=>$('scoutPhotoUpload').click());['scoutPhotoCamera','scoutPhotoUpload'].forEach(id=>$(id).addEventListener('change',e=>{const file=e.target.files?.[0];if(file)setPhotoPreview(file);e.target.value='';}));$('changeScoutPhoto').addEventListener('click',()=>$('existingScoutPhoto').click());$('existingScoutPhoto').addEventListener('change',async e=>{const file=e.target.files?.[0],id=current?.id;e.target.value='';if(!file||!id)return;const btn=$('changeScoutPhoto');btn.disabled=true;btn.textContent='Subiendo…';try{await uploadScoutPhoto(id,file);await load();await openReport(id);message('followupMessage','Foto actualizada.','success');}catch(error){message('followupMessage',error.message||'No pudimos guardar la foto.');}finally{btn.disabled=false;btn.textContent='Cambiar foto';}});$('closeDrawer').addEventListener('click',closeDrawer);$('backdrop').addEventListener('click',closeDrawer);$('saveScout').addEventListener('click',saveScout);$('saveFollowup').addEventListener('click',saveFollowup);
boot().catch(e=>{$('deniedText').textContent=e.message||'No fue posible abrir Scouting.';show('deniedView');});
