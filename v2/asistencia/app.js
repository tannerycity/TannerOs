import { createClient } from '/v2/supabase-client.js';
import { getSignedPhotoUrls } from '/v2/photo-cache.js';
import { PERIODOS, rangoDe, estadoDeAsistencia, metaDe, confianza, tendencia,
         etiquetaDeEstado, desgloseDeFaltas, textoDeContadorOpcional,
         barrasDeSemanas, etiquetaDeSemana, textoUltimaVez, coberturaDeListas,
         mensajeDeFaltas }
  from '/v2/asistencia/estadisticas.js';
import { ligaWhatsApp } from '/v2/pedido-mensajes.js';
const supabase=createClient('https://pacnegivzgxpanphrnwp.supabase.co','sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=id=>document.getElementById(id);let ctx=null,categories=[],sessions=[],currentSession=null,currentRoster=[],rosterQuery='';
let bajaTarget=null;const bajaReportados=new Set();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// v2_attendance_sessions devuelve la llave como "id". El módulo leía
// "session_id", que no viene en la respuesta, así que el id se perdía.
const sesionId=s=>s?.session_id||s?.id||null;
const pad=v=>String(v).padStart(2,'0'),nameOf=p=>p.player_name||'Tanner',statusOf=p=>p.attendance_status||p.status||'';
const sinAcentos=v=>String(v||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
function show(id){['loadingView','deniedView','attendanceView'].forEach(v=>$(v)?.classList.toggle('hidden',v!==id));}
function msg(id,text='',type='error'){const el=$(id);if(!el)return;el.textContent=text;el.dataset.type=type;el.classList.toggle('hidden',!text);}
async function rpc(name,params={}){const {data,error}=await supabase.rpc(name,params);if(error)throw error;return data;}
function isoLocalDate(d=new Date()){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}
function localTime(){const d=new Date();return `${pad(d.getHours())}:${pad(d.getMinutes())}`;}
function fmtDateTime(v){if(!v)return '—';return new Intl.DateTimeFormat('es-MX',{weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(new Date(v));}
function fmtHora(v){return new Intl.DateTimeFormat('es-MX',{hour:'numeric',minute:'2-digit'}).format(new Date(v));}
function friendly(e){const text=String(e?.message||e||'No pudimos completar la acción.');const map={'Not authorized':'Tu rol no tiene permiso para modificar la asistencia.','Category required':'Elige una categoría.','Session not found':'No encontramos esa sesión.','Player is not active':'Ese Tanner ya no está activo; probablemente ya lo dieron de baja.','Withdrawal reason required':'Escribe el motivo del reporte.'};return map[text]||text;}

/* Rediseño de Presidencia (09/10/2026): "que se vea futbolero" y que pasar
   lista cueste lo menos posible. Lo que les ha funcionado en cancha: todos
   vienen marcados como presentes y el profe sólo toca a los que faltaron.

   Inicio: un toque en la categoría abre la lista de hoy (o la crea). Las
   categorías del profe van primero; si no tiene ninguna asignada, ve todas. */
let detallesEditados=false;

async function boot(){const {data:{session}}=await supabase.auth.getSession();if(!session){location.href='/';return;}const rows=await rpc('v2_my_context');if(!rows?.length){$('deniedText').textContent='Tu cuenta no está vinculada a un club.';show('deniedView');return;}ctx=rows[0];const mods=await rpc('v2_my_modules',{organization_id:ctx.organization_id}),attendance=mods?.find(m=>m.module_code==='attendance');if(!attendance?.enabled||!attendance?.can_read){$('deniedText').textContent='Tu rol no tiene acceso a Asistencia.';show('deniedView');return;}ctx.canWrite=Boolean(attendance.can_write);$('orgName').textContent=ctx.organization_name||'Tannery City FC';$('roleBadge').textContent=ctx.is_owner?'Presidencia':ctx.role;$('allPresent').classList.toggle('hidden',!ctx.canWrite);$('saveAttendance').classList.toggle('hidden',!ctx.canWrite);await Promise.all([loadCategories(),loadSessions()]);show('attendanceView');}

async function loadCategories(){
  categories=await rpc('v2_attendance_categories',{organization_id:ctx.organization_id})||[];
  if(!$('sessionDate').value)$('sessionDate').value=isoLocalDate();
  if(!$('sessionTime').value)$('sessionTime').value=localTime();
  updateSessionSummary();
  pintaInicio();
}

// Quien administra el club no tiene "suyas" y "ajenas": mine viene en true
// para todas y el bloque de cubrir ni se asoma. Un profe sin categoría
// asignada ve todas por igual, sin el bloque de cubrir.
function pintaInicio(){
  const mias=categories.filter(c=>c.mine!==false),ajenas=categories.filter(c=>c.mine===false);
  const sinAsignar=!mias.length;
  $('catsTitulo').textContent=sinAsignar||!ajenas.length?'Categorías':'Mis categorías';
  pintaCategorias($('categoryCards'),sinAsignar?ajenas:mias);
  pintaCategorias($('coverCards'),sinAsignar?[]:ajenas);
  $('coverBlock')?.classList.toggle('hidden',sinAsignar||!ajenas.length);
}

/* La lista de esa categoría para el día elegido, si ya existe. */
function listaDelDia(categoryId){
  const dia=$('sessionDate').value;
  return sessions.filter(s=>s.category_id===categoryId&&s.starts_at&&isoLocalDate(new Date(s.starts_at))===dia)
    .sort((a,b)=>String(b.starts_at).localeCompare(String(a.starts_at)))[0]||null;
}

function pintaCategorias(box,lista){
  if(!box)return;box.innerHTML='';
  const esHoy=$('sessionDate').value===isoLocalDate();
  for(const c of lista){
    const hoy=listaDelDia(c.category_id);
    const total=Number(hoy?.roster_count||0),pres=Number(hoy?.present_count||0);
    const estado=hoy?(pres?`${esHoy?'Hoy':'Ese día'} ${pres}/${total||'—'}`:'Lista abierta'):'Pasar lista';
    const b=document.createElement('button');
    b.type='button';b.className=`category-choice as-equipo${hoy?(pres?' is-hecha':' is-abierta'):''}`;b.dataset.category=c.category_id;
    const nom=String(c.name||'Categoría');
    if(nom.length>7)b.classList.add('nom-largo');
    b.innerHTML=`<span class="as-equipo-nom">${esc(c.name||'Categoría')}</span><span class="as-equipo-n">${Number(c.active_players||0)} Tanners</span><span class="as-equipo-estado">${esc(estado)}<i aria-hidden="true">›</i></span>`;
    b.setAttribute('aria-label',`${c.name||'Categoría'}, ${Number(c.active_players||0)} Tanners. ${estado}`);
    b.onclick=()=>tocaCategoria(c,b);
    box.appendChild(b);
  }
}

async function tocaCategoria(c,boton){
  msg('sessionMessage');
  const hoy=detallesEditados?null:listaDelDia(c.category_id);
  if(hoy){await openRoster(hoy);return;}
  if(!ctx.canWrite){msg('sessionMessage','Todavía no hay lista de esta categoría para ese día.');return;}
  const date=$('sessionDate').value,time=$('sessionTime').value;
  if(!date||!time){msg('sessionMessage','Revisa la fecha y la hora.');abreDetalles(true);return;}
  const starts=new Date(`${date}T${time}:00`),duration=Number($('sessionDuration').value||90),ends=new Date(starts.getTime()+duration*60000);
  boton.disabled=true;boton.classList.add('is-cargando');
  try{
    const id=await rpc('v2_create_attendance_session',{organization_id:ctx.organization_id,category_id:c.category_id,starts_at:starts.toISOString(),ends_at:ends.toISOString(),title:$('sessionTitle').value.trim()||null,location:$('sessionLocation').value.trim()||null});
    detallesEditados=false;
    await loadSessions();
    const s=sessions.find(x=>sesionId(x)===id)||sessions[0];
    if(s)await openRoster(s);
  }catch(e){msg('sessionMessage',friendly(e));}
  finally{boton.disabled=false;boton.classList.remove('is-cargando');}
}

function updateSessionSummary(){
  const date=$('sessionDate').value,time=$('sessionTime').value,duration=$('sessionDuration').value;
  const d=date?new Date(`${date}T12:00:00`):new Date();
  const dia=new Intl.DateTimeFormat('es-MX',{weekday:'short',day:'numeric',month:'short'}).format(d).replace(/\./g,'');
  $('asDia').textContent=date===isoLocalDate()?`Hoy · ${dia}`:dia;
  $('sessionSummary').textContent=`${time||'Sin hora'} · ${duration} min`;
}
function abreDetalles(abrir){
  const det=$('sessionDetails'),ab=abrir??det.classList.contains('hidden');
  det.classList.toggle('hidden',!ab);
  $('asHorario').setAttribute('aria-expanded',String(ab));
}

async function loadSessions(){
  const sessionsSince=new Date(Date.now()-180*86400000).toISOString();
  sessions=await rpc('v2_attendance_sessions',{organization_id:ctx.organization_id,from_at:sessionsSince,to_at:null})||[];
  const list=$('sessionsList');list.innerHTML='';
  $('sessionsEmpty').classList.toggle('hidden',sessions.length>0);
  for(const s of sessions.slice(0,12)){
    const total=Number(s.roster_count||0),present=Number(s.present_count||0),pct=total?Math.round(present/total*100):0;
    const row=document.createElement('button');row.type='button';
    row.className=`session-row as-partido ${present?(pct>=80?'is-bien':'is-baja'):'is-pendiente'}`;
    if(s.covered)row.classList.add('is-covered');
    const f=new Date(s.starts_at);
    row.innerHTML=`<span class="as-fecha"><b>${f.getDate()}</b><small>${esc(f.toLocaleDateString('es-MX',{month:'short'}).replace('.',''))}</small></span>
      <span class="as-partido-txt"><strong>${esc(s.category_name||'Sin categoría')}</strong><small>${esc(s.title||'Entrenamiento')} · ${esc(fmtHora(s.starts_at))}${s.covered?` · cubrió ${esc(s.taken_by||'otro profe')}`:''}</small></span>
      <span class="as-score">${present?`<b>${present}<i>/</i>${total||'—'}</b><small>${pct}%</small>`:'<em>Pendiente</em>'}</span>`;
    row.addEventListener('click',()=>openRoster(s));
    list.appendChild(row);
  }
  if(categories.length)pintaInicio();
}

// === La lista ===
let preMarcada=false,sucio=false,guardada=false;
const tarjetas=new Map();
const ETIQUETA={present:'Presente',absent:'Falta',late:'Tarde',excused:'Justificada','':'Sin marcar'};
function partesDelNombre(full){const t=String(full||'').trim().split(/\s+/);return [t[0]||'Tanner',t[1]||''];}
function iniciales(full){return String(full||'').split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase()||'TC';}
function marca(p,s){p.attendance_status=s;p.status=s;sucio=true;guardada=false;}

async function openRoster(s){
  currentSession=s;rosterQuery='';$('rosterSearch').value='';msg('rosterMessage');
  currentRoster=await rosterConMiniaturas(sesionId(s));
  // Lo que ha funcionado en cancha: si la lista nunca se ha guardado, todos
  // vienen como presentes y el profe sólo toca a los que faltaron. Nada se
  // guarda hasta que él toca Guardar.
  preMarcada=false;sucio=false;guardada=false;
  if(ctx.canWrite&&currentRoster.length&&currentRoster.every(p=>!statusOf(p))){
    currentRoster.forEach(p=>{p.attendance_status='present';p.status='present';});
    preMarcada=true;sucio=true;
  }
  $('rosterTitle').textContent=s.category_name||s.title||'Entrenamiento';
  $('rosterMeta').textContent=`${s.title||'Entrenamiento'} · ${fmtDateTime(s.starts_at)}`;
  renderRoster();updatePhotoStatus(true);
  $('rosterBackdrop').classList.remove('hidden');$('rosterDrawer').classList.remove('hidden');$('rosterDrawer').setAttribute('aria-hidden','false');$('rosterDrawer').scrollTop=0;document.body.classList.add('drawer-open');
  const openedId=sesionId(s);
  signRosterPhotos(currentRoster).then(()=>{if(sesionId(currentSession)!==openedId)return;renderRoster();updatePhotoStatus(false);});
}

// Un aviso discreto, sólo para quien puede corregirlo: cuántos no tienen foto.
function updatePhotoStatus(loading){
  const el=$('rosterPhotoStatus');if(!el)return;
  const sinFoto=currentRoster.filter(p=>!p.photo_thumb_path).length;
  el.textContent=loading||!sinFoto||!ctx.canWrite?'':`${sinFoto} ${sinFoto===1?'Tanner':'Tanners'} sin foto en su expediente`;
}

function renderRoster(){
  const list=$('rosterList'),q=rosterQuery;
  const rows=currentRoster.filter(p=>!q||sinAcentos(`${nameOf(p)} ${p.code||p.player_code||''}`).includes(q));
  list.innerHTML='';tarjetas.clear();
  $('rosterEmpty').classList.toggle('hidden',rows.length>0);
  for(const p of rows){
    const full=nameOf(p),[nom,ape]=partesDelNombre(full);
    const card=document.createElement('article');
    card.className='roster-row as-estampa';card.dataset.id=p.player_id;
    card.innerHTML=`<button type="button" class="as-toque"${ctx.canWrite?'':' disabled'}>
        <span class="roster-avatar">${p._photoUrl?`<img src="${esc(p._photoUrl)}" alt="" loading="lazy">`:`<span class="as-ini">${esc(iniciales(full))}</span>`}</span>
        <span class="as-nombre"><strong>${esc(nom)}</strong><small>${esc(ape||p.code||'')}</small></span>
        <span class="as-estado"></span>
      </button>${ctx.canWrite?`<button type="button" class="as-mas" aria-label="Más opciones de ${esc(full)}"><i></i><i></i><i></i></button>`:''}`;
    const toque=card.querySelector('.as-toque');
    conToqueLargo(toque,()=>abrirOpciones(p),()=>alterna(p));
    card.querySelector('.as-mas')?.addEventListener('click',()=>abrirOpciones(p));
    tarjetas.set(p.player_id,card);
    pintaEstampa(p);
    list.appendChild(card);
  }
  updateRosterProgress();
}

/* Pinta una sola estampa: tocar no redibuja la lista ni recarga las fotos. */
function pintaEstampa(p){
  const card=tarjetas.get(p.player_id);if(!card)return;
  const s=statusOf(p),full=nameOf(p);
  card.className=`roster-row as-estampa st-${s||'none'}${s?' marked':''}`;
  const rep=bajaReportados.has(p.player_id);
  card.querySelector('.as-estado').textContent=rep?`${ETIQUETA[s]} · baja reportada`:ETIQUETA[s];
  const toque=card.querySelector('.as-toque');
  toque.setAttribute('aria-pressed',String(s==='present'||s==='late'));
  toque.setAttribute('aria-label',`${full}: ${ETIQUETA[s]}.${ctx.canWrite?` Toca para marcar ${s==='present'?'falta':'presente'}.`:''}`);
}

/* Un toque: presente <-> falta. Tarde y justificada, con toque largo o "···". */
function alterna(p){
  if(!ctx.canWrite)return;
  marca(p,statusOf(p)==='present'?'absent':'present');
  try{navigator.vibrate?.(8);}catch{}
  pintaEstampa(p);updateRosterProgress();
}

function conToqueLargo(el,largo,corto){
  let t=null,x=0,y=0,fueLargo=false;
  const quita=()=>{clearTimeout(t);t=null;};
  el.addEventListener('pointerdown',e=>{fueLargo=false;x=e.clientX;y=e.clientY;quita();t=setTimeout(()=>{fueLargo=true;t=null;try{navigator.vibrate?.(15);}catch{}largo();},480);});
  el.addEventListener('pointermove',e=>{if(t&&(Math.abs(e.clientX-x)>10||Math.abs(e.clientY-y)>10))quita();});
  ['pointerup','pointercancel','pointerleave'].forEach(n=>el.addEventListener(n,quita));
  el.addEventListener('contextmenu',e=>{e.preventDefault();if(!fueLargo&&ctx.canWrite){fueLargo=true;quita();largo();}});
  el.addEventListener('click',e=>{if(fueLargo){e.preventDefault();fueLargo=false;return;}corto();});
}

function updateRosterProgress(){
  const total=currentRoster.length,c={present:0,absent:0,late:0,excused:0,'':0};
  currentRoster.forEach(p=>{c[statusOf(p)]=(c[statusOf(p)]||0)+1;});
  $('mPresentes').textContent=c.present+c.late;
  $('mFaltas').textContent=c.absent+c.excused;
  $('mTarde').textContent=c.late;
  $('mSin').textContent=c[''];
  $('rosterProgress').classList.toggle('con-sin',c['']>0);
  const lbl=$('progressLabel');
  if(!ctx.canWrite)lbl.textContent='Sólo lectura: tu rol puede ver la lista, no marcarla.';
  else if(guardada)lbl.textContent='Lista guardada. Puedes cerrarla o seguir corrigiendo.';
  else if(c[''])lbl.textContent=`Faltan ${c['']} por marcar. Toca su foto.`;
  else if(preMarcada&&!c.absent&&!c.excused&&!c.late)lbl.textContent='Todos vienen como presentes. Toca a los que faltaron.';
  else lbl.textContent='Toca para cambiar. Mantén presionado: tarde o justificada.';
  const btn=$('saveAttendance');
  btn.classList.toggle('is-listo',guardada);
  btn.disabled=!ctx.canWrite||(!guardada&&!total);
  btn.textContent=guardada?'Listo':(sucio?`Guardar lista · ${c.present+c.late} de ${total}`:'Guardar lista');
  $('allPresent').disabled=!ctx.canWrite||!total||c.present===total;
}

function closeRoster(){
  if(sucio&&ctx?.canWrite&&!window.confirm('La lista no se ha guardado. ¿Salir sin guardar?'))return;
  cerrarOpciones();
  currentSession=null;currentRoster=[];sucio=false;guardada=false;tarjetas.clear();
  $('rosterBackdrop').classList.add('hidden');$('rosterDrawer').classList.add('hidden');$('rosterDrawer').setAttribute('aria-hidden','true');document.body.classList.remove('drawer-open');msg('rosterMessage');
}

async function saveAttendance(){
  if(guardada){closeRoster();return;}
  msg('rosterMessage');
  const marked=currentRoster.filter(p=>statusOf(p));
  if(!marked.length){msg('rosterMessage','Marca al menos un Tanner.');return;}
  const btn=$('saveAttendance');btn.disabled=true;btn.textContent='Guardando…';
  try{
    const payload=marked.map(p=>({player_id:p.player_id,status:statusOf(p),punctuality:statusOf(p)==='late'?'late':null,notes:null}));
    const count=await rpc('v2_save_attendance',{organization_id:ctx.organization_id,session_id:sesionId(currentSession),records:payload});
    // La lista recargada no trae las caras ya firmadas: se conservan.
    const antes=new Map(currentRoster.map(p=>[p.player_id,p]));
    const nueva=await rpc('v2_attendance_roster',{organization_id:ctx.organization_id,session_id:sesionId(currentSession)})||[];
    currentRoster=nueva.map(p=>{const a=antes.get(p.player_id);return a?{...p,photo_thumb_path:p.photo_thumb_path||a.photo_thumb_path,photo_bucket:p.photo_bucket||a.photo_bucket,_photoUrl:a._photoUrl}:p;});
    sucio=false;guardada=true;preMarcada=false;
    renderRoster();
    const n=currentRoster.filter(p=>['present','late'].includes(statusOf(p))).length;
    msg('rosterMessage',`${count} asistencias guardadas: ${n} presentes de ${currentRoster.length}.`,'success');
    await loadSessions();
  }catch(e){msg('rosterMessage',friendly(e));updateRosterProgress();}
}

// === Más opciones de un Tanner ===
let opcionesDe=null;
function abrirOpciones(p){
  if(!ctx.canWrite)return;
  opcionesDe=p;
  const full=nameOf(p);
  $('statusName').textContent=full;
  $('statusCode').textContent=p.code||p.player_code||'Tanner';
  $('statusFace').innerHTML=p._photoUrl?`<img src="${esc(p._photoUrl)}" alt="">`:esc(iniciales(full));
  $('statusSheet').querySelectorAll('[data-s]').forEach(b=>{const on=b.dataset.s===statusOf(p);b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
  const rep=bajaReportados.has(p.player_id);
  $('statusBaja').textContent=rep?'Baja ya reportada':'Reportar baja';
  $('statusBaja').disabled=rep;
  $('statusBackdrop').classList.remove('hidden');$('statusSheet').classList.remove('hidden');
}
function cerrarOpciones(){opcionesDe=null;$('statusBackdrop')?.classList.add('hidden');$('statusSheet')?.classList.add('hidden');}
$('statusSheet')?.querySelectorAll('[data-s]').forEach(b=>b.addEventListener('click',()=>{const p=opcionesDe;if(!p)return;marca(p,b.dataset.s);cerrarOpciones();pintaEstampa(p);updateRosterProgress();}));
$('statusBaja')?.addEventListener('click',()=>{const p=opcionesDe;cerrarOpciones();if(p)abrirBaja(p);});
$('statusCancel')?.addEventListener('click',cerrarOpciones);
$('statusBackdrop')?.addEventListener('click',cerrarOpciones);

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
    cerrarBaja();pintaEstampa(jugador);
    msg('rosterMessage',`Reporte enviado. ${nameOf(jugador)} sigue en la lista hasta que Presidencia lo confirme.`,'success');
  }catch(e){msg('bajaMessage',friendly(e));}
  finally{btn.disabled=false;btn.textContent='Enviar reporte';}
}
$('bajaCancel')?.addEventListener('click',cerrarBaja);
$('bajaBackdrop')?.addEventListener('click',cerrarBaja);
$('bajaConfirm')?.addEventListener('click',enviarBaja);
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  if(!$('bajaModal')?.classList.contains('hidden'))cerrarBaja();
  else if(!$('statusSheet')?.classList.contains('hidden'))cerrarOpciones();
});

['sessionDate','sessionTime','sessionDuration','sessionLocation','sessionTitle'].forEach(id=>$(id)?.addEventListener('change',()=>{
  // Cambiar la hora o el nombre es pedir una lista nueva; cambiar sólo el día
  // es ver (o abrir) las de ese día.
  if(id!=='sessionDate')detallesEditados=true;
  updateSessionSummary();pintaInicio();
}));
$('asHorario')?.addEventListener('click',()=>abreDetalles());
$('detailsDone')?.addEventListener('click',()=>abreDetalles(false));
$('refreshSessions')?.addEventListener('click',loadSessions);
$('closeRoster')?.addEventListener('click',closeRoster);
$('rosterBackdrop')?.addEventListener('click',closeRoster);
$('allPresent')?.addEventListener('click',()=>{if(!ctx.canWrite)return;currentRoster.forEach(p=>marca(p,'present'));currentRoster.forEach(pintaEstampa);updateRosterProgress();});
$('rosterSearch')?.addEventListener('input',e=>{rosterQuery=sinAcentos(e.target.value.trim());renderRoster();});
$('saveAttendance')?.addEventListener('click',saveAttendance);
boot().catch(e=>{$('deniedText').textContent=friendly(e);show('deniedView');});


// === Miniaturas de Tanners (sin descargar originales de varios MB en la lista) ===
/* La lista no traía la miniatura y los profes veían puras iniciales (Presidencia,
   07/10/2026). La miniatura llega aparte (v2_attendance_roster_thumbs, ~8 kB por
   niño) para no tocar la firma de la lista. Si esa llamada falla, la lista
   carga igual, con iniciales. */
async function rosterConMiniaturas(sessionId){
  const [lista,minis]=await Promise.all([
    rpc('v2_attendance_roster',{organization_id:ctx.organization_id,session_id:sessionId}),
    rpc('v2_attendance_roster_thumbs',{organization_id:ctx.organization_id,session_id:sessionId}).catch(()=>[])
  ]);
  const porTanner=new Map((Array.isArray(minis)?minis:[]).map(m=>[m.playerId,m]));
  return (lista||[]).map(p=>{const m=porTanner.get(p.player_id);return m&&!p.photo_thumb_path?{...p,photo_thumb_path:m.thumb,photo_bucket:m.bucket||p.photo_bucket}:p;});
}
async function signRosterPhotos(list){
  try{
    const byBucket={};
    (list||[]).forEach(p=>{if(p&&p.photo_thumb_path){const b=p.photo_bucket||'tanneros-private';(byBucket[b]=byBucket[b]||[]).push(p.photo_thumb_path);}});
    for(const b of Object.keys(byBucket)){
      const map=await getSignedPhotoUrls(supabase,b,byBucket[b]);
      (list||[]).forEach(p=>{if(p&&p.photo_thumb_path&&(p.photo_bucket||'tanneros-private')===b&&map[p.photo_thumb_path])p._photoUrl=map[p.photo_thumb_path];});
    }
  }catch(e){/* si falla, quedan las iniciales */}
}


// === Estadísticas ===
//
// Vive en la misma pantalla, detrás de una pestaña: tomar lista sigue siendo
// lo primero que ves al entrar. El criterio (metas, semáforo, rangos) está en
// estadisticas.js, que sí se puede probar sin navegador.

let statsPeriodo='mes', statsData=null, statsIniciado=false, statsQuery='';

function nivelChip(estado){
  return `<span class="lvl lvl-${estado.nivel}"><span class="lvl-icon" aria-hidden="true">${esc(estado.icono)}</span>${esc(estado.etiqueta)}</span>`;
}
const pctTexto=v=>(v===null||v===undefined)?'—':`${v}%`;

function cambiarPestana(cual){
  const esStats=cual==='stats';
  $('tabCapture')?.classList.toggle('active',!esStats);
  $('tabStats')?.classList.toggle('active',esStats);
  $('tabCapture')?.setAttribute('aria-selected',String(!esStats));
  $('tabStats')?.setAttribute('aria-selected',String(esStats));
  $('captureTab')?.classList.toggle('hidden',esStats);
  // La hora del entrenamiento sólo importa para pasar lista.
  $('asHorario')?.classList.toggle('hidden',esStats);
  $('statsTab')?.classList.toggle('hidden',!esStats);
  if(esStats&&!statsIniciado)iniciarStats();
}

function iniciarStats(){
  statsIniciado=true;
  const pills=$('periodPills');
  if(pills){
    pills.innerHTML='';
    for(const p of PERIODOS){
      const b=document.createElement('button');
      b.type='button';b.textContent=p.etiqueta;b.dataset.periodo=p.clave;
      b.classList.toggle('active',p.clave===statsPeriodo);
      b.addEventListener('click',()=>{statsPeriodo=p.clave;pills.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x.dataset.periodo===p.clave));cargarStats();});
      pills.appendChild(b);
    }
  }
  const sel=$('statsCategory');
  if(sel){
    sel.innerHTML='<option value="">Todas las categorías</option>';
    for(const c of categories){
      const o=document.createElement('option');
      o.value=c.category_id;o.textContent=c.name||c.code||'Categoría';
      sel.appendChild(o);
    }
    sel.addEventListener('change',cargarStats);
  }
  $('statsSearch')?.addEventListener('input',e=>{
    statsQuery=e.target.value.trim().normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
    pintarBajos();
  });
  cargarStats();
}

let tableroData=null;

async function cargarStats(){
  msg('statsMessage');
  const r=rangoDe(statsPeriodo);
  $('statsRange').textContent=`${r.etiqueta} · del ${r.desde} al ${r.hasta}`;
  $('heroPct').textContent='…';$('heroNivel').innerHTML='';$('heroDelta').textContent='Calculando…';$('heroListas').textContent='';
  const cat=$('statsCategory')?.value||null;
  try{
    // El tablero (g3) es aparte: si falla, el resto de las estadísticas sale igual.
    const [stats,tablero]=await Promise.all([
      rpc('v2_attendance_stats',{organization_id:ctx.organization_id,from_date:r.desde,to_date:r.hasta,category_id:cat,session_type:$('statsType')?.value||null}),
      rpc('v2_attendance_dashboard',{organization_id:ctx.organization_id,from_date:r.desde,to_date:r.hasta,category_id:cat}).catch(()=>null)
    ]);
    statsData=stats;tableroData=tablero;
    pintarStats();
  }catch(e){
    $('heroPct').textContent='—';$('heroDelta').textContent='';
    $('statsKpis').innerHTML='';
    msg('statsMessage',friendly(e));
  }
}

const nombreDelPeriodoAnterior={semana:'la semana pasada',mes:'el mes pasado',mesPasado:'el mes anterior',trimestre:'los 3 meses anteriores'};

function pintarStats(){
  const t=statsData?.totals||{},d=tableroData||{};
  const meta=80;
  const pct=d.pct??t.pct;
  const estado=estadoDeAsistencia(pct,meta);
  const tend=tendencia(pct,d.previousPct);
  const cob=coberturaDeListas(d.sessionsTaken,d.sessions);
  const rachas=Array.isArray(d.streaks)?d.streaks:[];
  const pendientes=Array.isArray(d.pending)?d.pending:[];
  const becados=Array.isArray(d.scholars)?d.scholars:[];

  // El marcador
  const hero=$('statsHero');hero.dataset.nivel=estado.nivel;
  $('heroPct').textContent=pctTexto(pct);
  $('heroNivel').innerHTML=nivelChip(estado);
  $('heroDelta').innerHTML=tend.direccion==='nueva'
    ?esc(tend.texto)
    :`<span class="as-delta as-delta-${tend.direccion}"><i aria-hidden="true">${esc(tend.icono)}</i>${tend.delta>0?'+':''}${esc(String(tend.delta))} pts</span> contra ${esc(nombreDelPeriodoAnterior[statsPeriodo]||'el periodo anterior')} (${esc(pctTexto(d.previousPct))})`;
  $('heroListas').textContent=d.sessions!=null?`${cob.texto} · ${Number(t.marked||0)} marcas · ${Number(t.players||0)} Tanners`:`${Number(t.marked||0)} marcas · ${Number(t.players||0)} Tanners`;

  // Los tres focos
  const foco=(id,n,titulo,nota,nivel,destino)=>`<button type="button" class="as-foco as-foco-${n?nivel:'ok'}" data-ir="${destino}" id="${id}"><b>${n}</b><strong>${titulo}</strong><small>${nota}</small></button>`;
  $('statsKpis').innerHTML=
    foco('focoRacha',rachas.length,'En racha de faltas','3 o más seguidas','bajo','streaksCard')+
    foco('focoBecados',becados.length,'Becados faltando',d.scholarsTotal!=null?`de ${Number(d.scholarsTotal||0)} becados`:'meta 90%','atencion','scholarsCard')+
    foco('focoMeta',Number(t.lowPlayers||0),'Debajo de su meta','80% · 90% con beca','atencion','lowCard')+
    foco('focoListas',pendientes.length,'Listas sin pasar',d.sessions!=null?`de ${Number(d.sessions||0)} entrenamientos`:'en el periodo','bajo','pendingCard');
  $('statsKpis').querySelectorAll('[data-ir]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.ir)?.scrollIntoView({behavior:'smooth',block:'start'})));

  const trust=$('statsTrust');
  const sinMarcar=Number(t.unmarked||0);
  trust.dataset.nivel=sinMarcar?confianza(t.marked,t.scheduled).nivel:'ok';
  trust.innerHTML=sinMarcar
    ?`<span><b>${sinMarcar} marcas sin registrar.</b> El porcentaje sale sólo de las ${Number(t.marked||0)} que sí se marcaron.</span>`
    :`<span><b>Todas las listas del periodo están completas.</b> El porcentaje sale de ${Number(t.marked||0)} marcas.</span>`;

  pintarTendencia(d.weeks||[]);
  pintarRachas(rachas);
  pintarBecados(becados,d.scholarsTotal);
  pintarCategorias(d.categories,statsData?.categories||[]);
  pintarPendientes(pendientes,d.coaches);
  pintarBajos();
}

/* Barras por semana: una sola serie, la línea de meta y la lectura al tocar. */
function pintarTendencia(semanas){
  const box=$('statsTrend');
  const {barras,yMeta,alto,ancho}=barrasDeSemanas(semanas,{ancho:320,alto:132});
  if(!barras.length){box.innerHTML='<p class="muted">Sin semanas para mostrar.</p>';$('statsTrendRead').textContent='';return;}
  const ult=[...barras].reverse().find(b=>b.estado==='dato');
  const lectura=b=>b.estado==='dato'
    ?`Semana del ${etiquetaDeSemana(b.semana)}: ${pctTexto(b.pct)} de asistencia · ${b.pasadas} de ${b.sesiones} listas pasadas`
    :(b.estado==='sinlista'?`Semana del ${etiquetaDeSemana(b.semana)}: ${b.sesiones} ${b.sesiones===1?'entrenamiento':'entrenamientos'} sin lista`:`Semana del ${etiquetaDeSemana(b.semana)}: sin entrenamientos`);
  box.innerHTML=`<svg viewBox="-2 -18 ${ancho+4} ${alto+40}" role="img" aria-label="Asistencia por semana, últimas ${barras.length} semanas">
    <line class="as-eje" x1="0" x2="${ancho}" y1="${alto}" y2="${alto}"/>
    <line class="as-meta" x1="0" x2="${ancho}" y1="${yMeta}" y2="${yMeta}"/>
    <text class="as-meta-txt" x="0" y="${yMeta-5}">Meta 80%</text>
    ${barras.map((b,i)=>`<g class="as-barra as-barra-${b.estado}${b.bajoMeta?' bajo':''}" data-i="${i}" tabindex="0" role="button" aria-label="${esc(lectura(b))}">
      <rect class="as-hit" x="${b.x-4}" y="-18" width="${b.w+8}" height="${alto+40}"/>
      ${b.estado==='dato'?`<path d="M${b.x},${alto} V${b.y+4} q0,-4 4,-4 h${b.w-8} q4,0 4,4 V${alto} Z"/>`:''}
      ${b.estado==='sinlista'?`<rect class="as-sinlista" x="${b.x}" y="${alto-6}" width="${b.w}" height="6" rx="2"/>`:''}
      ${(i%2===barras.length%2||i===barras.length-1)?`<text class="as-x" x="${b.cx}" y="${alto+16}">${esc(etiquetaDeSemana(b.semana))}</text>`:''}
    </g>`).join('')}
    ${ult?`<text class="as-valor" x="${ult.cx}" y="${Math.min(ult.y,yMeta)-7}">${esc(pctTexto(ult.pct))}</text>`:''}
  </svg>`;
  const read=$('statsTrendRead');
  read.textContent=ult?lectura(ult):'Ninguna semana tiene listas pasadas.';
  box.querySelectorAll('.as-barra').forEach(g=>{
    const b=barras[Number(g.dataset.i)];
    const marca=()=>{box.querySelectorAll('.as-barra').forEach(x=>x.classList.toggle('activa',x===g));read.textContent=lectura(b);};
    g.addEventListener('mouseenter',marca);g.addEventListener('click',marca);g.addEventListener('focus',marca);
  });
}

/* Botón de WhatsApp con el mensaje listo, firmado por el club. Sólo sale
   cuando el servidor manda el teléfono, y sólo lo manda a quien administra. */
function botonFamilia(t,{faltas,pct,asistio,marcadas,becado}){
  const liga=ligaWhatsApp(t.phone,mensajeDeFaltas({tanner:t.name,tutor:t.guardianName,categoria:t.categoryName,faltas,pct,asistio,marcadas,becado,club:ctx?.organization_name||'Tannery City'}));
  return liga?`<a class="as-familia" href="${esc(liga)}" target="_blank" rel="noopener">Escribir a la familia</a>`:'';
}
const sello='<span class="as-sello">Becado</span>';

function pintarRachas(rachas){
  const box=$('statsStreaks');
  if(!rachas.length){box.innerHTML='<p class="as-vacio">Nadie lleva 3 faltas seguidas. Bien ahí.</p>';return;}
  box.innerHTML=rachas.map(r=>`<div class="as-racha${r.scholarship?' es-becado':''}">
      <button type="button" class="as-racha-abre" data-player="${esc(r.playerId)}">
        <span class="as-racha-cara" data-thumb="${esc(r.thumb||'')}" data-bucket="${esc(r.bucket||'')}">${esc(iniciales(r.name))}</span>
        <span class="as-racha-txt"><strong>${esc(r.name||'Tanner')}</strong>${r.scholarship?sello:''}<small>${esc(r.categoryName||'')} · ${esc(textoUltimaVez(r.lastSeen))}</small></span>
        <span class="as-racha-n"><b>${Number(r.streak||0)}</b><small>faltas</small></span>
      </button>
      ${botonFamilia(r,{faltas:r.streak,becado:!!r.scholarship})}
    </div>`).join('');
  box.querySelectorAll('[data-player]').forEach(b=>b.addEventListener('click',()=>abrirJugador(b.dataset.player)));
  firmaCaras(box);
}

/* Becados que están faltando: debajo de 90% o con 2 faltas seguidas. */
function pintarBecados(becados,total){
  const box=$('statsScholars');
  $('scholarsResumen').textContent=total!=null?`${becados.length} de ${Number(total||0)} becados · meta 90%`:'Meta 90% de asistencia';
  if(!becados.length){box.innerHTML=`<p class="as-vacio">${Number(total||0)?'Todos los becados van en su meta. Bien ahí.':'No hay becados con entrenamientos en este periodo.'}</p>`;return;}
  box.innerHTML=becados.map(b=>{
    const e=estadoDeAsistencia(b.pct,90);
    return `<div class="as-racha es-becado">
      <button type="button" class="as-racha-abre" data-player="${esc(b.playerId)}">
        <span class="as-racha-cara" data-thumb="${esc(b.thumb||'')}" data-bucket="${esc(b.bucket||'')}">${esc(iniciales(b.name))}</span>
        <span class="as-racha-txt"><strong>${esc(b.name||'Tanner')}</strong>${sello}<small>${esc(b.categoryName||'')} · ${Number(b.attended||0)} de ${Number(b.marked||0)} entrenamientos${Number(b.streak||0)>=2?` · ${Number(b.streak)} faltas seguidas`:''}</small></span>
        <span class="as-beca-pct as-beca-${e.nivel}"><b>${esc(pctTexto(b.pct))}</b><small>de 90%</small></span>
      </button>
      ${botonFamilia(b,{faltas:b.streak,pct:b.pct,asistio:b.attended,marcadas:b.marked,becado:true})}
    </div>`;
  }).join('');
  box.querySelectorAll('[data-player]').forEach(x=>x.addEventListener('click',()=>abrirJugador(x.dataset.player)));
  firmaCaras(box);
}

// Las caras de la racha: sólo miniaturas, por el caché compartido.
async function firmaCaras(box){
  const porBucket={};
  box.querySelectorAll('[data-thumb]').forEach(el=>{if(el.dataset.thumb)(porBucket[el.dataset.bucket||'tanneros-private']??=[]).push(el.dataset.thumb);});
  try{
    for(const b of Object.keys(porBucket)){
      const mapa=await getSignedPhotoUrls(supabase,b,porBucket[b]);
      box.querySelectorAll('[data-thumb]').forEach(el=>{const u=mapa[el.dataset.thumb];if(u&&(el.dataset.bucket||'tanneros-private')===b)el.innerHTML=`<img src="${esc(u)}" alt="" loading="lazy">`;});
    }
  }catch{/* quedan las iniciales */}
}

function pintarCategorias(cats,detalle){
  const box=$('statsCats');
  const lista=Array.isArray(cats)&&cats.length?cats:(detalle||[]).map(c=>({categoryId:c.categoryId,name:c.name,pct:c.pct,previousPct:null,sessions:null,taken:null}));
  if(!lista.length){box.innerHTML='<p class="as-vacio">No hay entrenamientos en este periodo.</p>';return;}
  const orden=[...lista].sort((a,b)=>(b.pct??-1)-(a.pct??-1));
  box.innerHTML=orden.map(c=>{
    const e=estadoDeAsistencia(c.pct,80),tn=tendencia(c.pct,c.previousPct);
    const cob=c.sessions!=null?coberturaDeListas(c.taken,c.sessions):null;
    const ancho=c.pct==null?0:Math.max(2,Math.min(100,Number(c.pct)));
    return `<div class="as-cat as-cat-${e.nivel}">
      <div class="as-cat-cab"><strong>${esc(c.name||'Categoría')}</strong><b>${esc(pctTexto(c.pct))}</b></div>
      <div class="as-cat-barra" aria-hidden="true"><i style="width:${ancho}%"></i><em style="left:80%"></em></div>
      <div class="as-cat-pie">${nivelChip(e)}${tn.direccion==='nueva'?'':`<span class="as-delta as-delta-${tn.direccion}"><i aria-hidden="true">${esc(tn.icono)}</i>${tn.delta>0?'+':''}${esc(String(tn.delta))} pts</span>`}${cob?`<small class="as-cob as-cob-${cob.nivel}">${esc(cob.texto)}</small>`:''}</div>
    </div>`;
  }).join('');
}

function pintarPendientes(pendientes,profes){
  const tabla=$('statsCoaches');
  const conProfes=Array.isArray(profes)&&profes.length;
  tabla.innerHTML=conProfes?profes.map(p=>{
    const cob=coberturaDeListas(p.taken,p.sessions);
    return `<div class="as-profe as-profe-${cob.nivel}"><span class="as-profe-txt"><strong>${esc(p.name)}</strong><small>${esc(p.categories||'')}</small></span><span class="as-profe-n"><b>${Number(p.taken||0)}/${Number(p.sessions||0)}</b><small>listas</small></span></div>`;
  }).join(''):'';
  tabla.classList.toggle('hidden',!conProfes);
  const box=$('statsPending');
  if(!pendientes.length){box.innerHTML='<p class="as-vacio">Todas las listas del periodo están pasadas.</p>';return;}
  box.innerHTML=pendientes.map(s=>{const f=new Date(s.startsAt);return `<div class="as-pend">
    <span class="as-fecha"><b>${f.getDate()}</b><small>${esc(f.toLocaleDateString('es-MX',{month:'short'}).replace('.',''))}</small></span>
    <span class="as-pend-txt"><strong>${esc(s.categoryName||'Sin categoría')}</strong><small>${esc(fmtHora(s.startsAt))} · ${esc(s.coach||'Sin profe asignado')}</small></span>
  </div>`;}).join('');
}

function filaBajo(j){
  const e=estadoDeAsistencia(j.pct,j.goal);
  return `<button type="button" class="low-row" data-player="${esc(j.playerId)}">
    <span class="low-name"><strong>${esc(j.name||'Tanner')}</strong>
    <small>${esc(j.categoryName||'')}${j.categoryName?' · ':''}${Number(j.attended||0)} de ${Number(j.scheduled||0)} · meta ${j.goal}%${j.scholarship?' · con beca':''}</small></span>
    <span class="low-pct">${pctTexto(j.pct)}</span>${nivelChip(e)}
    <span class="low-arrow" aria-hidden="true">›</span></button>`;
}

function pintarBajos(){
  const todos=statsData?.lowPlayers||[];
  const rows=todos.filter(j=>!statsQuery||String(j.name||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().includes(statsQuery));
  $('statsLow').innerHTML=rows.map(filaBajo).join('');
  $('statsLowEmpty').textContent=todos.length?'Ningún Tanner coincide con esa búsqueda.':'Nadie está debajo de su objetivo. Bien ahí.';
  $('statsLowEmpty').classList.toggle('hidden',rows.length>0);
  $('statsLow').querySelectorAll('[data-player]').forEach(b=>b.addEventListener('click',()=>abrirJugador(b.dataset.player)));
}

async function abrirJugador(playerId){
  if(!playerId)return;
  const r=rangoDe(statsPeriodo);
  $('playerName').textContent='Cargando…';
  $('playerMeta').textContent='';
  $('playerBody').innerHTML='';
  $('playerBackdrop').classList.remove('hidden');
  $('playerDrawer').classList.remove('hidden');
  $('playerDrawer').setAttribute('aria-hidden','false');
  document.body.classList.add('drawer-open');
  try{
    const d=await rpc('v2_attendance_player',{organization_id:ctx.organization_id,player_id:playerId,from_date:r.desde,to_date:r.hasta});
    pintarJugador(d);
  }catch(e){
    $('playerName').textContent='No se pudo abrir';
    $('playerBody').innerHTML=`<p class="muted">${esc(friendly(e))}</p>`;
  }
}

function pintarJugador(d){
  const p=d?.player||{},c=d?.current||{},prev=d?.previous||{};
  const meta=Number(p.goal||metaDe(p.scholarship));
  const e=estadoDeAsistencia(c.pct,meta);
  const tend=tendencia(c.pct,prev.pct);
  const f=desgloseDeFaltas(c);
  $('playerName').textContent=p.name||'Tanner';
  $('playerMeta').textContent=`${p.categoryName||'Sin categoría'} · objetivo ${meta}%${p.scholarship?' (con beca)':''}`;
  $('playerBody').innerHTML=`
    <div class="stats-kpis">
      <article class="wide"><span class="kpi-label">Asistencia del periodo</span>
        <b class="kpi-value">${pctTexto(c.pct)}</b>
        <span class="kpi-note">${nivelChip(e)} ${esc(e.texto)}</span></article>
    </div>
    <div class="trend-line"><span class="lvl lvl-${tend.direccion==='sube'?'ok':(tend.direccion==='baja'?'bajo':'sindato')}"><span class="lvl-icon" aria-hidden="true">${esc(tend.icono)}</span>Tendencia</span><span>${esc(tend.texto)}</span></div>
    <div class="player-figures">
      <div><span>Programados</span><b>${Number(c.scheduled||0)}</b></div>
      <div><span>Asistencias</span><b>${Number(c.attended||0)}</b></div>
      <div><span>Faltas</span><b>${f.faltas}</b></div>
      <div><span>Justificadas</span><b class="${Number(c.excused||0)?'':'soft'}">${esc(textoDeContadorOpcional(c.excused,c.marked,'justificadas'))}</b></div>
      <div><span>Retardos</span><b class="${Number(c.late||0)?'':'soft'}">${esc(textoDeContadorOpcional(c.late,c.marked,'retardos'))}</b></div>
      <div><span>Sin marcar</span><b class="${Number(c.unmarked||0)?'':'soft'}">${Number(c.unmarked||0)||'0'}</b></div>
    </div>
    <div><div class="eyebrow">HISTORIAL DEL PERIODO</div>
    <div class="history-list">${(d?.history||[]).map(h=>{
      const et=etiquetaDeEstado(h.status);
      return `<div class="history-row"><span class="h-date">${esc(String(h.date||''))}</span>
        <span class="h-title">${esc(h.title||'Entrenamiento')}</span>
        <span class="lvl lvl-${et.nivel}"><span class="lvl-icon" aria-hidden="true">${esc(et.icono)}</span>${esc(et.texto)}</span></div>`;
    }).join('')||'<p class="muted">Sin entrenamientos en este periodo.</p>'}</div></div>`;
}

function cerrarJugador(){
  $('playerBackdrop').classList.add('hidden');
  $('playerDrawer').classList.add('hidden');
  $('playerDrawer').setAttribute('aria-hidden','true');
  document.body.classList.remove('drawer-open');
}

$('tabCapture')?.addEventListener('click',()=>cambiarPestana('capture'));
$('tabStats')?.addEventListener('click',()=>cambiarPestana('stats'));
$('closePlayer')?.addEventListener('click',cerrarJugador);
$('playerBackdrop')?.addEventListener('click',cerrarJugador);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('playerDrawer')?.classList.contains('hidden'))cerrarJugador();});
