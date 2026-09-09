import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const supabase=createClient('https://pacnegivzgxpanphrnwp.supabase.co','sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=id=>document.getElementById(id);let ctx=null,categories=[],sessions=[],currentSession=null,currentRoster=[],rosterQuery='';
let bajaTarget=null;const bajaReportados=new Set();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// v2_attendance_sessions devuelve la llave como "id". El módulo leía
// "session_id", que no viene en la respuesta, así que el id se perdía.
const sesionId=s=>s?.session_id||s?.id||null;
const pad=v=>String(v).padStart(2,'0'),nameOf=p=>p.player_name||'Tanner',statusOf=p=>p.attendance_status||p.status||'';
function show(id){['loadingView','deniedView','attendanceView'].forEach(v=>$(v)?.classList.toggle('hidden',v!==id));}
function msg(id,text='',type='error'){const el=$(id);if(!el)return;el.textContent=text;el.dataset.type=type;el.classList.toggle('hidden',!text);}
async function rpc(name,params={}){const {data,error}=await supabase.rpc(name,params);if(error)throw error;return data;}
function isoLocalDate(){const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}
function localTime(){const d=new Date();return `${pad(d.getHours())}:${pad(d.getMinutes())}`;}
function fmtDateTime(v){if(!v)return '—';return new Intl.DateTimeFormat('es-MX',{weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(new Date(v));}
function friendly(e){const text=String(e?.message||e||'No pudimos completar la acción.');const map={'Not authorized':'Tu rol no tiene permiso para modificar la asistencia.','Category required':'Elige una categoría.','Session not found':'No encontramos esa sesión.','Player is not active':'Ese Tanner ya no está activo; probablemente ya lo dieron de baja.','Withdrawal reason required':'Escribe el motivo del reporte.'};return map[text]||text;}
async function boot(){const {data:{session}}=await supabase.auth.getSession();if(!session){location.href='/';return;}const rows=await rpc('v2_my_context');if(!rows?.length){$('deniedText').textContent='Tu cuenta no está vinculada a un club.';show('deniedView');return;}ctx=rows[0];const mods=await rpc('v2_my_modules',{organization_id:ctx.organization_id}),attendance=mods?.find(m=>m.module_code==='attendance');if(!attendance?.enabled||!attendance?.can_read){$('deniedText').textContent='Tu rol no tiene acceso a Asistencia.';show('deniedView');return;}ctx.canWrite=Boolean(attendance.can_write);$('orgName').textContent=ctx.organization_name||'Tannery City FC';$('roleBadge').textContent=ctx.is_owner?'Presidencia':ctx.role;$('sessionForm').classList.toggle('read-only',!ctx.canWrite);$('createSession').disabled=!ctx.canWrite;await Promise.all([loadCategories(),loadSessions()]);show('attendanceView');}
async function loadCategories(){
  categories=await rpc('v2_attendance_categories',{organization_id:ctx.organization_id})||[];
  const sel=$('sessionCategory');
  sel.innerHTML='<option value="">Elige una categoría</option>';
  for(const c of categories){
    const o=document.createElement('option');
    o.value=c.category_id;o.textContent=`${c.name||'Categoría'} · ${Number(c.active_players||0)} Tanners`;
    sel.appendChild(o);
  }
  // Quien administra el club no tiene "suyas" y "ajenas": mine viene en true
  // para todas y el bloque de cubrir ni se asoma.
  const mias=categories.filter(c=>c.mine!==false),ajenas=categories.filter(c=>c.mine===false);
  pintaCategorias($('categoryCards'),mias);
  pintaCategorias($('coverCards'),ajenas);
  $('coverBlock')?.classList.toggle('hidden',ajenas.length===0);
  if(!mias.length&&ajenas.length)$('coverBlock')?.setAttribute('open','');
  if(!$('sessionDate').value)$('sessionDate').value=isoLocalDate();
  if(!$('sessionTime').value)$('sessionTime').value=localTime();
  updateSessionSummary();
}
function pintaCategorias(box,lista){
  if(!box)return;box.innerHTML='';
  for(const c of lista){
    const b=document.createElement('button');
    b.type='button';b.className='category-choice';b.dataset.category=c.category_id;
    b.innerHTML=`<span class="category-symbol"><span class="tos-icon tos-icon-user" aria-hidden="true"></span></span><strong>${esc(c.name||'Categoría')}</strong><small>${Number(c.active_players||0)} Tanners</small>`;
    b.onclick=()=>selectCategory(c.category_id);
    box.appendChild(b);
  }
}
function selectCategory(id){$('sessionCategory').value=id;document.querySelectorAll('.category-choice').forEach(b=>b.classList.toggle('selected',b.dataset.category===id));msg('sessionMessage');updateSessionSummary();$('createSession').focus({preventScroll:true});}
function updateSessionSummary(){const c=categories.find(x=>x.category_id===$('sessionCategory').value),date=$('sessionDate').value,time=$('sessionTime').value,duration=$('sessionDuration').value;$('sessionSummary').innerHTML=`<strong>${esc(c?.name||'Elige una categoría')}</strong><span>${date===isoLocalDate()?'Hoy':date||'Sin fecha'} · ${time||'Sin hora'} · ${duration} min</span>`;$('createSession').disabled=!ctx?.canWrite||!c;}
async function loadSessions(){const sessionsSince=new Date(Date.now()-180*86400000).toISOString();sessions=await rpc('v2_attendance_sessions',{organization_id:ctx.organization_id,from_at:sessionsSince,to_at:null})||[];const list=$('sessionsList');list.innerHTML='';$('sessionsEmpty').classList.toggle('hidden',sessions.length>0);for(const s of sessions.slice(0,12)){const total=Number(s.roster_count||0),present=Number(s.present_count||0),pct=total?Math.round(present/total*100):0,row=document.createElement('button');row.className='session-row';row.type='button';row.classList.add(total&&pct>=100?'is-complete':(total&&pct>0?'is-partial':'is-empty'));if(s.covered)row.classList.add('is-covered');row.innerHTML=`<span class="session-date"><b>${new Date(s.starts_at).getDate()}</b><small>${new Date(s.starts_at).toLocaleDateString('es-MX',{month:'short'})}</small></span><span class="session-copy"><strong>${esc(s.title||s.category_name||'Entrenamiento')}</strong><small>${esc(fmtDateTime(s.starts_at))} · ${esc(s.category_name||'Sin categoría')}${s.covered?` · cubrió ${esc(s.taken_by||'otro profe')}`:''}</small></span><span class="session-result"><b>${present}/${total||'—'}</b><small>${total?`${pct}% presentes`:'Abrir lista'}</small></span><span class="session-arrow" aria-hidden="true">›</span>`;row.addEventListener('click',()=>openRoster(s));list.appendChild(row);}}
async function createSession(ev){ev.preventDefault();msg('sessionMessage');if(!ctx.canWrite)return;const date=$('sessionDate').value,time=$('sessionTime').value,category=$('sessionCategory').value;if(!category){msg('sessionMessage','Elige la categoría para comenzar.');return;}if(!date||!time){msg('sessionMessage','Revisa la fecha y la hora.');return;}const starts=new Date(`${date}T${time}:00`),duration=Number($('sessionDuration').value||90),ends=new Date(starts.getTime()+duration*60000),btn=$('createSession');btn.disabled=true;btn.textContent='Preparando lista…';try{const id=await rpc('v2_create_attendance_session',{organization_id:ctx.organization_id,category_id:category,starts_at:starts.toISOString(),ends_at:ends.toISOString(),title:$('sessionTitle').value.trim()||null,location:$('sessionLocation').value.trim()||null});await loadSessions();const s=sessions.find(x=>sesionId(x)===id)||sessions[0];if(s)await openRoster(s);}catch(e){msg('sessionMessage',friendly(e));}finally{btn.textContent='Tomar asistencia';updateSessionSummary();}}
async function openRoster(s){currentSession=s;rosterQuery='';$('rosterSearch').value='';currentRoster=await rpc('v2_attendance_roster',{organization_id:ctx.organization_id,session_id:sesionId(s)})||[];await signRosterPhotos(currentRoster);$('rosterTitle').textContent=s.title||s.category_name||'Entrenamiento';$('rosterMeta').textContent=`${fmtDateTime(s.starts_at)} · ${s.category_name||'Sin categoría'}`;renderRoster();$('rosterBackdrop').classList.remove('hidden');$('rosterDrawer').classList.remove('hidden');$('rosterDrawer').setAttribute('aria-hidden','false');document.body.classList.add('drawer-open');}
function renderRoster(){const list=$('rosterList'),rows=currentRoster.filter(p=>!rosterQuery||`${nameOf(p)} ${p.code||p.player_code||''}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(rosterQuery));list.innerHTML='';$('rosterEmpty').classList.toggle('hidden',rows.length>0);for(const p of rows){const selected=statusOf(p),full=nameOf(p),initials=full.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase(),row=document.createElement('article');row.className=`roster-row st-${selected||'none'} ${selected?'marked':''}`;const reportado=bajaReportados.has(p.player_id);row.innerHTML=`<div class="roster-person"><span class="roster-avatar">${p._photoUrl?`<img src="${esc(p._photoUrl)}" alt="${esc(full)}" loading="lazy">`:esc(initials||'TC')}</span><span class="roster-name"><strong>${esc(full)}</strong><small>${esc(p.code||p.player_code||'Tanner')}</small></span>${ctx.canWrite?`<button type="button" class="roster-flag${reportado?' reportado':''}" data-baja="${esc(p.player_id)}" aria-label="Reportar baja de ${esc(full)}" title="${reportado?'Baja ya reportada':'Reportar baja'}">⚑</button>`:''}</div><div class="attendance-buttons" role="group" aria-label="Asistencia de ${esc(full)}"><button type="button" data-s="present" class="status-present ${selected==='present'?'active':''}" aria-pressed="${selected==='present'}"><span class="status-mark">✓</span><span>Presente</span></button><button type="button" data-s="late" class="status-late ${selected==='late'?'active':''}" aria-pressed="${selected==='late'}"><span class="status-mark">＋</span><span>Tarde</span></button><button type="button" data-s="excused" class="status-excused ${selected==='excused'?'active':''}" aria-pressed="${selected==='excused'}"><span class="status-mark">–</span><span>Justificado</span></button><button type="button" data-s="absent" class="status-absent ${selected==='absent'?'active':''}" aria-pressed="${selected==='absent'}"><span class="status-mark">×</span><span>Ausente</span></button></div>`;row.querySelectorAll('[data-s]').forEach(b=>{b.disabled=!ctx.canWrite;b.addEventListener('click',()=>{p.attendance_status=b.dataset.s;p.status=b.dataset.s;renderRoster();});});row.querySelector('[data-baja]')?.addEventListener('click',ev=>{ev.stopPropagation();abrirBaja(p);});const per=row.querySelector('.roster-person');if(per){per.style.cursor='pointer';per.addEventListener('click',ev=>{if(!ctx.canWrite||ev.target.closest('.roster-flag'))return;const now=statusOf(p);p.attendance_status=now==='present'?'absent':'present';p.status=p.attendance_status;renderRoster();});}list.appendChild(row);}updateRosterProgress();$('saveAttendance').disabled=!ctx.canWrite;}
function updateRosterProgress(){const total=currentRoster.length,marked=currentRoster.filter(p=>statusOf(p)).length,present=currentRoster.filter(p=>statusOf(p)==='present').length,late=currentRoster.filter(p=>statusOf(p)==='late').length,absent=currentRoster.filter(p=>['absent','excused'].includes(statusOf(p))).length,pct=total?Math.round(marked/total*100):0,complete=Boolean(total)&&marked===total;$('progressLabel').textContent=total&&marked<total?`Faltan ${total-marked} por marcar`:(total?`✓ Lista completa · ${total} de ${total}`:'Sin Tanners');$('progressBar').style.width=`${pct}%`;$('rosterCounts').innerHTML=`<span><b>${present}</b> presentes</span><span><b>${late}</b> tarde</span><span><b>${absent}</b> por revisar</span>`;$('saveAttendance').textContent=complete?`Guardar ${total} asistencias`:`Guardar avance (${marked}/${total})`;$('saveAttendance').classList.toggle('ready',complete);$('rosterProgress')?.classList.toggle('is-complete',complete);$('allPresent')?.classList.toggle('pulse-hint',total>0&&marked===0);}
function closeRoster(){currentSession=null;currentRoster=[];$('rosterBackdrop').classList.add('hidden');$('rosterDrawer').classList.add('hidden');$('rosterDrawer').setAttribute('aria-hidden','true');document.body.classList.remove('drawer-open');msg('rosterMessage');}
async function saveAttendance(){msg('rosterMessage');const marked=currentRoster.filter(p=>statusOf(p));if(!marked.length){msg('rosterMessage','Marca al menos un Tanner.');return;}const btn=$('saveAttendance');btn.disabled=true;btn.textContent='Guardando…';try{const payload=marked.map(p=>({player_id:p.player_id,status:statusOf(p),punctuality:statusOf(p)==='late'?'late':null,notes:null})),count=await rpc('v2_save_attendance',{organization_id:ctx.organization_id,session_id:sesionId(currentSession),records:payload});msg('rosterMessage',`${count} asistencias guardadas.`,'success');currentRoster=await rpc('v2_attendance_roster',{organization_id:ctx.organization_id,session_id:sesionId(currentSession)})||[];renderRoster();await loadSessions();}catch(e){msg('rosterMessage',friendly(e));renderRoster();}}
// === Reportar baja desde la lista ===
// Quien toma lista es quien se entera de que un niño ya no viene, pero Formadores y
// Academia no tienen permiso de alta y baja. Esto levanta un aviso para Presidencia
// sin darles a ellos el poder de ejecutar la baja.
function abrirBaja(p){
  if(!ctx.canWrite)return;
  bajaTarget=p;
  $('bajaTitle').textContent=`Reportar baja de ${nameOf(p)}`;
  $('bajaReason').value='';
  msg('bajaMessage');
  $('bajaBackdrop').classList.remove('hidden');
  $('bajaModal').classList.remove('hidden');
  setTimeout(()=>$('bajaReason').focus(),40);
}
function cerrarBaja(){bajaTarget=null;$('bajaBackdrop').classList.add('hidden');$('bajaModal').classList.add('hidden');}
async function enviarBaja(){
  if(!bajaTarget)return;
  const motivo=$('bajaReason').value.trim();
  if(motivo.length<4){msg('bajaMessage','Escribe el motivo para que Presidencia pueda revisarlo.');return;}
  const btn=$('bajaConfirm'),jugador=bajaTarget;
  btn.disabled=true;btn.textContent='Enviando…';
  try{
    await rpc('v2_request_player_withdrawal',{organization_id:ctx.organization_id,player_id:jugador.player_id,reason:motivo});
    bajaReportados.add(jugador.player_id);
    cerrarBaja();renderRoster();
    msg('rosterMessage',`Reporte enviado. ${nameOf(jugador)} sigue en la lista hasta que Presidencia lo confirme.`,'success');
  }catch(e){msg('bajaMessage',friendly(e));}
  finally{btn.disabled=false;btn.textContent='Enviar reporte';}
}
$('bajaCancel')?.addEventListener('click',cerrarBaja);
$('bajaBackdrop')?.addEventListener('click',cerrarBaja);
$('bajaConfirm')?.addEventListener('click',enviarBaja);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('bajaModal')?.classList.contains('hidden'))cerrarBaja();});

$('sessionForm')?.addEventListener('submit',createSession);['sessionCategory','sessionDate','sessionTime','sessionDuration'].forEach(id=>$(id)?.addEventListener('change',()=>{if(id==='sessionCategory')selectCategory($(id).value);else updateSessionSummary();}));$('refreshSessions')?.addEventListener('click',loadSessions);$('closeRoster')?.addEventListener('click',closeRoster);$('rosterBackdrop')?.addEventListener('click',closeRoster);$('allPresent')?.addEventListener('click',()=>{if(!ctx.canWrite)return;currentRoster.forEach(p=>{p.attendance_status='present';p.status='present';});renderRoster();});$('clearMarks')?.addEventListener('click',()=>{if(!ctx.canWrite)return;currentRoster.forEach(p=>{p.attendance_status='';p.status='';});renderRoster();});$('rosterSearch')?.addEventListener('input',e=>{rosterQuery=e.target.value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();renderRoster();});$('saveAttendance')?.addEventListener('click',saveAttendance);boot().catch(e=>{$('deniedText').textContent=friendly(e);show('deniedView');});


// === Fotos de Tanners en asistencia (URLs firmadas, 1 llamada por bucket) ===
async function signRosterPhotos(list){
  try{
    const byBucket={};
    (list||[]).forEach(p=>{if(p&&p.photo_path){const b=p.photo_bucket||'tanneros-private';(byBucket[b]=byBucket[b]||[]).push(p.photo_path);}});
    for(const b of Object.keys(byBucket)){
      const {data}=await supabase.storage.from(b).createSignedUrls(byBucket[b],3600);
      const map={};(data||[]).forEach(d=>{if(d&&d.signedUrl&&!d.error)map[d.path]=d.signedUrl;});
      (list||[]).forEach(p=>{if(p&&p.photo_path&&(p.photo_bucket||'tanneros-private')===b&&map[p.photo_path])p._photoUrl=map[p.photo_path];});
    }
  }catch(e){/* si falla, quedan las iniciales */}
}
