import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase=createClient(
  'https://pacnegivzgxpanphrnwp.supabase.co',
  'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',
  {auth:{persistSession:true,autoRefreshToken:true}}
);

const $=id=>document.getElementById(id);
let ctx=null,reports=[],current=null,canWrite=false,selectedQuality='',pendingPhoto=null,pendingPreviewUrl=null,createProspect=null,editQualities=[];
const linkedProspect=(()=>{const q=new URLSearchParams(location.search),id=q.get('prospect');return id?{id,name:q.get('name')||'',category:q.get('category')||'',type:q.get('type')||''}:null;})();
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
  if(linkedProspect&&canWrite)openCreate(linkedProspect);
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

function openCreate(prospect=null){
  current=null;createProspect=prospect&&prospect.id?prospect:null;
  $('drawerEyebrow').textContent='NUEVA VISORÍA';$('drawerName').textContent='Detectar talento';$('drawerMeta').textContent='Nueva observación en cancha';
  $('createSection').classList.remove('hidden');$('detailSection').classList.add('hidden');$('followupSection').classList.add('hidden');
  $('deleteSection')?.classList.add('hidden');
  ['observedName','observedLocation','playerPosition','category','technicalScore','physicalScore','tacticalScore','mentalScore','starQuality','createVerdict','createNotes','birthDate','dominantFoot','heightCm','guardianName','contactPhone'].forEach(id=>$(id).value='');
  selectedQualities=[];document.querySelectorAll('[data-score],[data-quality],[data-decision]').forEach(b=>b.classList.remove('selected'));$('quickDecision').value='follow';$('createVerdict').value='Volver a observar';document.querySelector('[data-decision="follow"]')?.classList.add('selected');
  if(createProspect){$('observedName').value=createProspect.name;$('category').value=createProspect.category;$('playerPosition').value=createProspect.type==='goalkeeper'?'Portero':'';$('drawerName').textContent=createProspect.name||'Evaluar prospecto';$('drawerMeta').textContent='Prospecto vinculado desde Captación';}
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
    ['Contacto',r.contact_phone],['Tutor',r.guardian_name],['Edad',a==null?null:`${a} años`],['Pie hábil',r.dominant_foot],['Estatura',r.height_cm==null?null:`${Number(r.height_cm)} cm`],['Posición',r.player_position],['Categoría',r.category],['Lugar',r.observed_location],['Diferenciadores',r.star_quality],['Origen',r.prospect_id?'Prospecto TannerOS':(r.source||'Visoría directa')],['Próxima acción',r.next_action_at?fmtDate(r.next_action_at):'Sin programar'],['Resultado',r.player_id?'Fichado como jugador':null]
  ].filter(([,v])=>v!=null&&String(v).trim()!=='');
  $('detailFacts').innerHTML=rows.length?rows.map(([k,v])=>`<div><span>${safe(k)}</span><strong>${safe(v)}</strong></div>`).join(''):'<p class="muted">Sin datos adicionales.</p>';
}

async function openReport(id){
  const r=reports.find(x=>x.id===id);if(!r)return;
  try{const detail=await rpc('v2_scouting_report_detail',{organization_id:ctx.organization_id,report_id:id});if(detail&&typeof detail==='object')Object.assign(r,detail);}catch(error){console.warn('No fue posible cargar el detalle completo de Scouting.',error);}
  current=r;
  $('drawerEyebrow').textContent='VISORÍA';$('drawerName').textContent=r.observed_name||'Sin nombre';$('drawerMeta').textContent=`${fmtDate(r.observed_at)} · ${r.status==='open'?'Abierta':'Cerrada'}`;
  $('createSection').classList.add('hidden');$('editSection')?.classList.add('hidden');$('detailSection').classList.remove('hidden');$('followupSection').classList.remove('hidden');
  $('deleteSection')?.classList.toggle('hidden',!canWrite);$('deleteConfirm')?.classList.add('hidden');$('deleteScout')?.classList.remove('hidden');
  scoreCards(r);facts(r);
  renderDetailPhoto(r);
  $('editScout')?.classList.toggle('hidden',!canWrite);
  $('reportStatus').value=r.status||'open';$('interestLevel').value=['alto','medio','bajo'].includes(String(r.interest_level||'').toLowerCase())?String(r.interest_level).toLowerCase():'';
  $('nextActionAt').value=r.next_action_at?localInput(r.next_action_at):'';$('updateVerdict').value=r.verdict||'';$('updateNotes').value=r.notes||'';
  ['reportStatus','interestLevel','nextActionAt','updateVerdict','updateNotes','saveFollowup'].forEach(id=>$(id).disabled=!canWrite);
  message('followupMessage');openDrawer();
}

function openDrawer(){$('backdrop').classList.remove('hidden');$('drawer').classList.remove('hidden');$('drawer').setAttribute('aria-hidden','false');}
function closeDrawer(){current=null;$('backdrop').classList.add('hidden');$('drawer').classList.add('hidden');$('drawer').setAttribute('aria-hidden','true');$('editSection')?.classList.add('hidden');message('createMessage');message('followupMessage');message('editMessage');}

function setEditScore(inputId,value){
  const input=$(inputId),group=document.querySelector(`[data-edit-score-group="${inputId}"]`),numeric=score(value);
  if(input)input.value=numeric==null?'':String(numeric);
  if(!group)return;
  group.querySelectorAll('[data-edit-score]').forEach(button=>button.classList.toggle('selected',numeric!=null&&Number(button.dataset.editScore)===numeric));
  const reading=group.closest('article')?.querySelector('.score-reading');if(reading)reading.textContent=numeric==null?'Sin evaluar':scoreWord(numeric);
}

function renderEditQualities(value=''){
  editQualities=String(value||'').split(',').map(item=>item.trim()).filter(Boolean).slice(0,3);
  document.querySelectorAll('[data-edit-quality]').forEach(button=>button.classList.toggle('selected',editQualities.includes(button.dataset.editQuality)));
  $('editStarQuality').value=editQualities.join(', ');
}

function openEdit(){
  if(!current||!canWrite)return;
  const r=current;
  $('detailSection').classList.add('hidden');$('followupSection').classList.add('hidden');$('deleteSection')?.classList.add('hidden');$('editSection').classList.remove('hidden');
  $('drawerEyebrow').textContent='EDITAR VISORÍA';$('drawerName').textContent=r.observed_name||'Sin nombre';$('drawerMeta').textContent='Corrige cualquier dato operativo de esta observación';
  $('editObservedName').value=r.observed_name||'';$('editObservedAt').value=r.observed_at?localInput(r.observed_at):'';$('editObservedLocation').value=r.observed_location||'';
  $('editPlayerPosition').value=r.player_position||'';$('editCategory').value=r.category||'';$('editBirthDate').value=r.birth_date||'';$('editDominantFoot').value=r.dominant_foot||'';$('editHeightCm').value=r.height_cm??'';
  $('editGuardianName').value=r.guardian_name||'';$('editContactPhone').value=r.contact_phone||'';
  setEditScore('editTechnicalScore',r.technical_score);setEditScore('editPhysicalScore',r.physical_score);setEditScore('editTacticalScore',r.tactical_score);setEditScore('editMentalScore',r.mental_score);renderEditQualities(r.star_quality);
  $('editStatus').value=r.status||'open';$('editInterestLevel').value=['alto','medio','bajo'].includes(String(r.interest_level||'').toLowerCase())?String(r.interest_level).toLowerCase():'';
  $('editNextActionAt').value=r.next_action_at?localInput(r.next_action_at):'';$('editVerdict').value=r.verdict||'';$('editNotes').value=r.notes||'';
  message('editMessage');$('drawer').scrollTo({top:0,behavior:'smooth'});
}

function cancelEdit(){
  if(!current)return;
  $('editSection').classList.add('hidden');$('detailSection').classList.remove('hidden');$('followupSection').classList.remove('hidden');$('deleteSection')?.classList.toggle('hidden',!canWrite);
  $('drawerEyebrow').textContent='VISORÍA';$('drawerName').textContent=current.observed_name||'Sin nombre';$('drawerMeta').textContent=`${fmtDate(current.observed_at)} · ${current.status==='open'?'Abierta':'Cerrada'}`;
  message('editMessage');$('drawer').scrollTo({top:0,behavior:'smooth'});
}

async function saveScoutEdit(){
  if(!current||!canWrite)return;
  const name=$('editObservedName').value.trim(),observedAt=$('editObservedAt').value,scores=['editTechnicalScore','editPhysicalScore','editTacticalScore','editMentalScore'].map(id=>score($(id).value)),height=score($('editHeightCm').value);
  if(!name){message('editMessage','Escribe el nombre del jugador.');$('editObservedName').focus();return;}
  if(!observedAt){message('editMessage','Selecciona la fecha de la visoría.');$('editObservedAt').focus();return;}
  if(scores.some(value=>value!=null&&(!Number.isFinite(value)||value<0||value>10))){message('editMessage','Las calificaciones deben estar entre 0 y 10.');return;}
  if(height!=null&&(!Number.isFinite(height)||height<0||height>230)){message('editMessage','La estatura debe estar entre 0 y 230 cm.');$('editHeightCm').focus();return;}
  const id=current.id,button=$('saveScoutEdit');button.disabled=true;button.textContent='Guardando cambios…';message('editMessage');
  try{
    await rpc('v2_edit_scouting_report',{
      organization_id:ctx.organization_id,report_id:id,observed_name:name,observed_at:toIsoOrNull(observedAt),observed_location:$('editObservedLocation').value.trim()||null,
      player_position:$('editPlayerPosition').value||null,category:$('editCategory').value.trim()||null,technical_score:scores[0],physical_score:scores[1],tactical_score:scores[2],mental_score:scores[3],
      star_quality:$('editStarQuality').value||null,verdict:$('editVerdict').value.trim()||null,notes:$('editNotes').value.trim()||null,status:$('editStatus').value,interest_level:$('editInterestLevel').value||null,next_action_at:toIsoOrNull($('editNextActionAt').value),
      birth_date:$('editBirthDate').value||null,contact_phone:$('editContactPhone').value.trim()||null,guardian_name:$('editGuardianName').value.trim()||null,dominant_foot:$('editDominantFoot').value||null,height_cm:height
    });
    await load();await openReport(id);toast('La ficha de Scouting quedó actualizada.');
  }catch(error){message('editMessage',error.message||'No pudimos guardar los cambios.');}
  finally{button.disabled=false;button.textContent='Guardar todos los cambios';}
}

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
      organization_id:ctx.organization_id,prospect_id:createProspect?.id||null,observed_name:name,observed_at:toIsoOrNull($('observedAt').value),observed_location:$('observedLocation').value.trim()||null,
      player_position:$('playerPosition').value.trim()||null,category:$('category').value.trim()||null,technical_score:scores[0],physical_score:scores[1],tactical_score:scores[2],mental_score:scores[3],
      star_quality:$('starQuality').value.trim()||null,verdict:$('createVerdict').value.trim()||null,notes:$('createNotes').value.trim()||null,birth_date:$('birthDate').value||null,contact_phone:$('contactPhone').value.trim()||null,guardian_name:$('guardianName').value.trim()||null,dominant_foot:$('dominantFoot').value||null,height_cm:$('heightCm').value?Number($('heightCm').value):null
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
  if(!document.querySelector('link[href^="/v2/scouting/editor.css"]')){const link=document.createElement('link');link.rel='stylesheet';link.href='/v2/scouting/editor.css?v=20260828a';document.head.appendChild(link);}
  const identity=$('observedName')?.closest('.identity-grid');
  if(identity&&!$('scoutPhotoPreview')){
    const block=document.createElement('div');block.className='scout-photo-capture';block.innerHTML=`<button id="scoutPhotoPreview" class="scout-photo-preview" type="button"><span class="tos-icon tos-icon-camera" aria-hidden="true"></span><strong>Agregar foto</strong><small>Abrir cámara</small></button><div><strong>Foto del jugador</strong><small>Acércate lo suficiente para reconocerlo después.</small><button id="chooseScoutPhoto" class="secondary mini" type="button">Elegir de galería</button></div><input id="scoutPhotoCamera" type="file" accept="image/*" capture="environment" hidden><input id="scoutPhotoUpload" type="file" accept="image/*" hidden>`;identity.before(block);
  }
  const detail=$('detailSection');
  if(detail&&!$('detailPhoto')){
    const block=document.createElement('div');block.className='detail-photo-wrap';block.innerHTML=`<div id="detailPhoto" class="detail-photo"><span>TC</span></div><div class="detail-photo-actions"><button id="changeScoutPhoto" class="secondary mini" type="button">Cambiar foto</button><button id="editScout" class="primary mini" type="button">Editar ficha</button></div><input id="existingScoutPhoto" type="file" accept="image/*" capture="environment" hidden>`;detail.insertBefore(block,detail.querySelector('.eyebrow'));
  }
  if(detail&&!$('editSection')){
    const section=document.createElement('section');section.id='editSection';section.className='drawer-section scouting-editor hidden';section.innerHTML=`
      <div class="editor-head"><div><div class="eyebrow">EDICIÓN COMPLETA</div><h3>Datos de la visoría</h3></div><button id="cancelEditScout" class="secondary mini" type="button">Cancelar</button></div>
      <p class="editor-note">Los cambios aplican a esta visoría. Los vínculos con Captación o la ficha Tanner permanecen protegidos.</p>
      <div class="form-grid editor-grid">
        <label class="span-2">Nombre del jugador<input id="editObservedName" type="text" maxlength="160" autocomplete="off"></label>
        <label>Fecha y hora<input id="editObservedAt" type="datetime-local"></label>
        <label>Lugar<input id="editObservedLocation" type="text" maxlength="160" placeholder="Cancha, torneo o escuela"></label>
        <label>Posición<input id="editPlayerPosition" type="text" maxlength="80" list="scoutingPositions" placeholder="Ej. Extremo"></label>
        <label>Categoría<input id="editCategory" type="text" maxlength="80" list="scoutingCategories" placeholder="Ej. T10"></label>
        <label>Fecha de nacimiento<input id="editBirthDate" type="date"></label>
        <label>Pie hábil<input id="editDominantFoot" type="text" maxlength="40" list="scoutingFeet" placeholder="Por definir"></label>
        <label>Estatura (cm)<input id="editHeightCm" type="number" min="0" max="230" step="0.1" inputmode="decimal"></label>
        <label>Nombre del tutor<input id="editGuardianName" type="text" maxlength="120"></label>
        <label class="span-2">Teléfono del tutor<input id="editContactPhone" type="tel" maxlength="20" inputmode="tel"></label>
      </div>
      <datalist id="scoutingPositions"><option value="Portero"><option value="Lateral"><option value="Defensa central"><option value="Mediocentro"><option value="Extremo"><option value="Delantero"></datalist>
      <datalist id="scoutingCategories"><option value="Baby Tanners"><option value="T6"><option value="T8"><option value="T10"><option value="T12"><option value="Juvenil"></datalist>
      <datalist id="scoutingFeet"><option value="Derecho"><option value="Izquierdo"><option value="Ambos"></datalist>
      <div class="editor-block"><div class="editor-block-title"><strong>Los cuatro pilares</strong><small>Toca otra vez una calificación para dejarla pendiente.</small></div><div class="quick-scores edit-scores">
        <article><div><strong>Técnica</strong><small class="score-reading">Sin evaluar</small></div><div class="score-buttons" data-edit-score-group="editTechnicalScore"><button type="button" data-edit-score="2">1</button><button type="button" data-edit-score="4">2</button><button type="button" data-edit-score="6">3</button><button type="button" data-edit-score="8">4</button><button type="button" data-edit-score="10">5</button><input id="editTechnicalScore" type="hidden"></div></article>
        <article><div><strong>Físico</strong><small class="score-reading">Sin evaluar</small></div><div class="score-buttons" data-edit-score-group="editPhysicalScore"><button type="button" data-edit-score="2">1</button><button type="button" data-edit-score="4">2</button><button type="button" data-edit-score="6">3</button><button type="button" data-edit-score="8">4</button><button type="button" data-edit-score="10">5</button><input id="editPhysicalScore" type="hidden"></div></article>
        <article><div><strong>Lectura de juego</strong><small class="score-reading">Sin evaluar</small></div><div class="score-buttons" data-edit-score-group="editTacticalScore"><button type="button" data-edit-score="2">1</button><button type="button" data-edit-score="4">2</button><button type="button" data-edit-score="6">3</button><button type="button" data-edit-score="8">4</button><button type="button" data-edit-score="10">5</button><input id="editTacticalScore" type="hidden"></div></article>
        <article><div><strong>Mentalidad</strong><small class="score-reading">Sin evaluar</small></div><div class="score-buttons" data-edit-score-group="editMentalScore"><button type="button" data-edit-score="2">1</button><button type="button" data-edit-score="4">2</button><button type="button" data-edit-score="6">3</button><button type="button" data-edit-score="8">4</button><button type="button" data-edit-score="10">5</button><input id="editMentalScore" type="hidden"></div></article>
      </div></div>
      <div class="editor-block"><div class="editor-block-title"><strong>¿Qué lo hace diferente?</strong><small>Elige hasta tres cualidades.</small></div><div class="quality-chips edit-quality-chips"><button type="button" data-edit-quality="Técnica">Técnica</button><button type="button" data-edit-quality="Velocidad">Velocidad</button><button type="button" data-edit-quality="Visión">Visión</button><button type="button" data-edit-quality="Físico">Físico</button><button type="button" data-edit-quality="Mentalidad">Mentalidad</button><button type="button" data-edit-quality="Reflejos">Reflejos</button></div><input id="editStarQuality" type="hidden"></div>
      <div class="editor-block"><div class="editor-block-title"><strong>Decisión y seguimiento</strong><small>Deja claro qué debe pasar después.</small></div><div class="form-grid editor-grid">
        <label>Estado<select id="editStatus"><option value="open">En seguimiento</option><option value="closed">Cerrado</option></select></label>
        <label>Interés<select id="editInterestLevel"><option value="">Sin definir</option><option value="alto">Alto</option><option value="medio">Medio</option><option value="bajo">Bajo</option></select></label>
        <label class="span-2">Próxima acción<input id="editNextActionAt" type="datetime-local"></label>
        <label class="span-2">Decisión<input id="editVerdict" type="text" maxlength="160"></label>
        <label class="span-2">Notas<textarea id="editNotes" rows="5" maxlength="2000"></textarea></label>
      </div></div>
      <button id="saveScoutEdit" class="primary full sticky-action" type="button">Guardar todos los cambios</button><div id="editMessage" class="inline-message hidden"></div>`;
    detail.after(section);
  }
  const followup=$('followupSection');
  if(followup&&!$('deleteSection')){
    const section=document.createElement('section');section.id='deleteSection';section.className='drawer-section scouting-danger hidden';section.innerHTML=`<button id="deleteScout" class="delete-scout" type="button"><span class="tos-icon tos-icon-trash" aria-hidden="true"></span>Eliminar visoría</button><div id="deleteConfirm" class="delete-confirm hidden"><strong>¿Eliminar esta visoría?</strong><p>Se borrarán el registro y su foto. Si ya se convirtió en Tanner, su ficha de jugador no se eliminará.</p><div><button id="cancelDeleteScout" class="secondary" type="button">Cancelar</button><button id="confirmDeleteScout" class="danger-action" type="button">Sí, eliminar visoría</button></div><div id="deleteMessage" class="inline-message hidden"></div></div>`;followup.after(section);
  }
  if(!$('scoutToast')){const notice=document.createElement('div');notice.id='scoutToast';notice.className='scout-toast';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');document.body.appendChild(notice);}
}
mountPhotoUi();

$('deleteScout').addEventListener('click',()=>{$('deleteScout').classList.add('hidden');$('deleteConfirm').classList.remove('hidden');$('deleteConfirm').scrollIntoView({behavior:'smooth',block:'nearest'});message('deleteMessage');});
$('cancelDeleteScout').addEventListener('click',()=>{$('deleteConfirm').classList.add('hidden');$('deleteScout').classList.remove('hidden');message('deleteMessage');});
$('confirmDeleteScout').addEventListener('click',deleteScout);
$('newScout').addEventListener('click',openCreate);
$('statusFilter').addEventListener('change',renderList);
$('pipelineFilter').addEventListener('change',renderList);
$('searchScout').addEventListener('input',renderList);
document.querySelectorAll('[data-pipeline]').forEach(button=>button.addEventListener('click',()=>{$('pipelineFilter').value=button.dataset.pipeline;renderList();document.querySelector('.scout-list')?.scrollIntoView({behavior:'smooth',block:'start'});}));
document.querySelectorAll('[data-score]').forEach(button=>button.addEventListener('click',()=>{const group=button.closest('[data-score-group]'),input=$(group.dataset.scoreGroup);input.value=button.dataset.score;group.querySelectorAll('[data-score]').forEach(item=>item.classList.toggle('selected',item===button));const reading=group.closest('article')?.querySelector('.score-reading');if(reading)reading.textContent=scoreWord(button.dataset.score);}));
let selectedQualities=[];
document.querySelectorAll('[data-quality]').forEach(button=>button.addEventListener('click',()=>{const quality=button.dataset.quality,index=selectedQualities.indexOf(quality);if(index>=0)selectedQualities.splice(index,1);else{if(selectedQualities.length>=3)return;selectedQualities.push(quality);}button.classList.toggle('selected',selectedQualities.includes(quality));$('starQuality').value=selectedQualities.join(', ');}));
document.querySelectorAll('[data-decision]').forEach(button=>button.addEventListener('click',()=>{$('quickDecision').value=button.dataset.decision;document.querySelectorAll('[data-decision]').forEach(item=>item.classList.toggle('selected',item===button));$('createVerdict').value=({follow:'Volver a observar',invite:'Invitar a prueba',reject:'No continuar'})[button.dataset.decision];}));
document.querySelectorAll('[data-edit-score]').forEach(button=>button.addEventListener('click',()=>{const group=button.closest('[data-edit-score-group]'),inputId=group.dataset.editScoreGroup,isSelected=button.classList.contains('selected');setEditScore(inputId,isSelected?null:Number(button.dataset.editScore));}));
document.querySelectorAll('[data-edit-quality]').forEach(button=>button.addEventListener('click',()=>{const quality=button.dataset.editQuality,index=editQualities.indexOf(quality);if(index>=0)editQualities.splice(index,1);else{if(editQualities.length>=3){message('editMessage','Puedes elegir hasta tres cualidades.');return;}editQualities.push(quality);}renderEditQualities(editQualities.join(', '));message('editMessage');}));
$('scoutPhotoPreview').addEventListener('click',()=>$('scoutPhotoCamera').click());
$('chooseScoutPhoto').addEventListener('click',()=>$('scoutPhotoUpload').click());
['scoutPhotoCamera','scoutPhotoUpload'].forEach(id=>$(id).addEventListener('change',event=>{const file=event.target.files?.[0];if(file)setPhotoPreview(file);event.target.value='';}));
$('changeScoutPhoto').addEventListener('click',()=>$('existingScoutPhoto').click());
$('existingScoutPhoto').addEventListener('change',async event=>{const file=event.target.files?.[0],id=current?.id;event.target.value='';if(!file||!id)return;const button=$('changeScoutPhoto');button.disabled=true;button.textContent='Subiendo…';try{await uploadScoutPhoto(id,file);await load();await openReport(id);message('followupMessage','Foto actualizada.','success');}catch(error){message('followupMessage',error.message||'No pudimos guardar la foto.');}finally{button.disabled=false;button.textContent='Cambiar foto';}});
$('editScout').addEventListener('click',openEdit);
$('cancelEditScout').addEventListener('click',cancelEdit);
$('saveScoutEdit').addEventListener('click',saveScoutEdit);
$('closeDrawer').addEventListener('click',closeDrawer);
$('backdrop').addEventListener('click',closeDrawer);
$('saveScout').addEventListener('click',saveScout);
$('saveFollowup').addEventListener('click',saveFollowup);
boot().catch(e=>{$('deniedText').textContent=e.message||'No fue posible abrir Scouting.';show('deniedView');});
