import {bootstrapProtectedShell,rpc,$,setShellHealth} from '/v2/shell.js';
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';

// La pantalla del profesor de academia. Deliberadamente no hay nada de dinero:
// ni cuotas, ni adeudos, ni cobros. La RPC que la alimenta tampoco los devuelve,
// así que no hay forma de que se cuelen por un descuido de la vista.
const supabase=createClient('https://pacnegivzgxpanphrnwp.supabase.co','sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',{auth:{persistSession:true,autoRefreshToken:true}});
const boot=await bootstrapProtectedShell({active:'academias',title:'Mi academia'});
if(!boot)throw new Error('No access');
const {ctx}=boot;

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={data:null,vista:'inicio',academyId:null,jugador:null,sesion:null,marcas:{}};

const fFecha=new Intl.DateTimeFormat('es-MX',{weekday:'long',day:'numeric',month:'long'});
const fHora=new Intl.DateTimeFormat('es-MX',{hour:'numeric',minute:'2-digit'});
const fCorta=new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short'});
const dia=v=>{try{return fFecha.format(new Date(v));}catch{return'';}};
const hora=v=>{try{return fHora.format(new Date(v));}catch{return'';}};
const corta=v=>{try{return fCorta.format(new Date(String(v).length<=10?`${v}T12:00:00`:v));}catch{return'';}};
const mayus=s=>s?s[0].toUpperCase()+s.slice(1):'';
function edad(f){if(!f)return null;const b=new Date(`${f}T00:00:00`);if(isNaN(b))return null;
  const h=new Date();let a=h.getFullYear()-b.getFullYear();const m=h.getMonth()-b.getMonth();
  if(m<0||(m===0&&h.getDate()<b.getDate()))a--;return a;}
function saludo(){const h=new Date().getHours();return h<12?'Buenos días':h<19?'Buenas tardes':'Buenas noches';}
const iniciales=n=>String(n||'?').split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();

// Las fotos viven en un bucket privado: se firman por lote, una llamada por bucket.
async function firmarFotos(lista){
  try{
    const porBucket={};
    (lista||[]).forEach(p=>{if(p.photoPath){const b=p.photoBucket||'tanneros-private';(porBucket[b]=porBucket[b]||[]).push(p.photoPath);}});
    for(const b of Object.keys(porBucket)){
      const {data}=await supabase.storage.from(b).createSignedUrls(porBucket[b],3600);
      const mapa={};(data||[]).forEach(d=>{if(d?.signedUrl&&!d.error)mapa[d.path]=d.signedUrl;});
      (lista||[]).forEach(p=>{if(p.photoPath&&(p.photoBucket||'tanneros-private')===b&&mapa[p.photoPath])p._foto=mapa[p.photoPath];});
    }
  }catch(e){}
}

function avatar(p,clase='ca-avatar'){
  return p._foto?`<span class="${clase}"><img src="${esc(p._foto)}" alt="" loading="lazy" decoding="async"></span>`
                :`<span class="${clase}">${esc(iniciales(p.name))}</span>`;
}

async function cargar(academyId=null){
  try{state.data=await rpc('v2_coach_home',{organization_id:ctx.organization_id,academy_id:academyId});}
  catch(error){
    $('coachBody').innerHTML=`<div class="tos-empty">${esc(String(error?.message||error))}</div>`;
    return;
  }
  state.academyId=state.data?.academy?.id||null;
  await firmarFotos(state.data?.players||[]);
  render();
}

// === Inicio ===
function vistaInicio(){
  const d=state.data,a=d.academy,prox=d.nextSession;
  const nombre=(ctx.display_name||'').split(' ')[0]||'profe';
  const jugadores=d.players.length;
  const cambia=d.academies.length>1
    ? `<div class="ca-switch">${d.academies.map(x=>`<button type="button" class="ca-switch-b${x.id===a.id?' on':''}" data-academia="${esc(x.id)}">${esc(x.name)}</button>`).join('')}</div>`
    : '';
  const proxCard=prox
    ? `<div class="ca-next"><div><span class="ca-next-when">${esc(mayus(dia(prox.startsAt)))}</span>
        <strong>${esc(hora(prox.startsAt))}${prox.endsAt?` – ${esc(hora(prox.endsAt))}`:''}</strong>
        ${prox.location?`<small>${esc(prox.location)}</small>`:''}</div>
        <button class="ca-cta" type="button" data-lista="${esc(prox.id)}">${prox.taken?'Revisar lista':'Tomar asistencia'}</button></div>`
    : `<div class="ca-next ca-next-vacio"><div><span class="ca-next-when">Sin entrenamiento programado</span>
        <small>Agenda uno para poder tomar lista.</small></div>
        <button class="ca-cta" type="button" data-nuevo="1">Agendar entrenamiento</button></div>`;

  const cumples=d.birthdays.length
    ? `<section class="ca-card"><h2>Cumpleaños</h2>${d.birthdays.map(b=>
        `<div class="ca-line"><span>${esc(b.name)}</span><b>${esc(corta(b.day))} · ${esc(String(b.turns))} años</b></div>`).join('')}</section>`
    : '';
  const anuncios=d.announcements.length
    ? `<section class="ca-card"><h2>Anuncios</h2>${d.announcements.slice(0,4).map(an=>
        `<div class="ca-anuncio"><strong>${esc(an.title)}</strong>${an.body?`<span>${esc(an.body)}</span>`:''}</div>`).join('')}</section>`
    : '';

  return `<header class="ca-hero">
      <span class="ca-eyebrow">${esc(a.name)}</span>
      <h1>${esc(saludo())}, ${esc(nombre)}.</h1>
      <p>${jugadores} jugador${jugadores===1?'':'es'} en tu academia.</p>
      ${cambia}
    </header>
    ${proxCard}
    <nav class="ca-acciones">
      <button type="button" data-ir="jugadores"><b>Mis jugadores</b><small>${jugadores}</small></button>
      <button type="button" data-ir="calendario"><b>Calendario</b><small>${d.sessions.length} sesiones</small></button>
      <button type="button" data-ir="evaluaciones"><b>Evaluaciones</b><small>${d.pendingEvaluations} por hacer</small></button>
      <button type="button" data-compartir="1"><b>Compartir inscripción</b><small>Copiar link</small></button>
    </nav>
    ${cumples}${anuncios}`;
}

// === Mis jugadores ===
function tarjetaJugador(p){
  const e=edad(p.birthDate);
  const asis=p.sessionsTotal>0?`${Math.round(p.sessionsAttended/p.sessionsTotal*100)}% asistencia`:'sin sesiones aún';
  const ev=p.lastEvaluationOn?`Evaluado ${corta(p.lastEvaluationOn)}`:'Sin evaluar';
  return `<button type="button" class="ca-jug" data-jugador="${esc(p.id)}">
    ${avatar(p)}
    <span class="ca-jug-info"><strong>${esc(p.name)}</strong>
      <span>${[p.category,e!=null?`${e} años`:null,p.position&&p.position!=='Por definir'?p.position:null].filter(Boolean).map(esc).join(' · ')}</span>
      <small>${esc(asis)} · ${esc(ev)}</small></span>
    <span class="ca-chevron" aria-hidden="true">›</span></button>`;
}
function vistaJugadores(){
  const d=state.data;
  return `${cabecera('Mis jugadores',`${d.players.length} en ${d.academy.name}`)}
    <div class="ca-lista">${d.players.map(tarjetaJugador).join('')||'<div class="tos-empty">Todavía no hay jugadores inscritos.</div>'}</div>`;
}
function vistaEvaluaciones(){
  const d=state.data;
  const sin=d.players.filter(p=>!p.lastEvaluationOn),con=d.players.filter(p=>p.lastEvaluationOn);
  return `${cabecera('Evaluaciones',`${sin.length} por hacer`)}
    ${sin.length?`<div class="ca-lista">${sin.map(tarjetaJugador).join('')}</div>`:'<div class="tos-empty">Ya evaluaste a todos.</div>'}
    ${con.length?`<h2 class="ca-sub">Ya evaluados</h2><div class="ca-lista">${con.map(tarjetaJugador).join('')}</div>`:''}`;
}

// === Perfil deportivo ===
// Solo lo que sirve para entrenarlo: nada de cuotas, adeudos ni datos de la familia.
function vistaJugador(){
  const p=state.data.players.find(x=>x.id===state.jugador);
  if(!p)return vistaJugadores();
  const e=edad(p.birthDate);
  const pie={right:'Derecha',left:'Izquierda',both:'Ambas'}[p.dominantFoot]||'Por definir';
  const dato=(k,v)=>`<article><span>${esc(k)}</span><strong>${esc(v??'—')}</strong></article>`;
  return `${cabecera(p.name,state.data.academy.name)}
    <div class="ca-perfil">${avatar(p,'ca-avatar ca-avatar-xl')}
      <div class="ca-perfil-datos">
        ${dato('Categoría',p.category)}${dato('Edad',e!=null?`${e} años`:null)}
        ${dato('Posición',p.position)}${dato('Pierna',pie)}
        ${dato('Dorsal',p.jersey?`#${p.jersey}`:null)}
        ${dato('Asistencia',p.sessionsTotal>0?`${p.sessionsAttended} de ${p.sessionsTotal}`:'Sin sesiones')}
      </div>
    </div>
    <section class="ca-card"><h2>Evaluación</h2>
      <p class="ca-hint">${p.lastEvaluationOn?`La última fue el ${esc(corta(p.lastEvaluationOn))}.`:'Todavía no lo evalúas.'}</p>
      <form id="evalForm" class="ca-eval">
        ${state.data.academy.axes.map(([k,l])=>`<label class="ca-eval-row"><span>${esc(l)}</span>
          <input type="number" min="0" max="10" step="1" inputmode="numeric" data-eje="${esc(k)}" placeholder="—"></label>`).join('')}
        <label class="ca-eval-txt">En qué enfocarse<input id="evObj" maxlength="160" placeholder="Salida rápida, achique…"></label>
        <label class="ca-eval-txt">Observaciones<input id="evNota" maxlength="300" placeholder="Cómo lo viste hoy"></label>
        <div id="evMsg" class="inline-message hidden"></div>
        <button class="ca-cta ca-cta-full" type="submit">Guardar evaluación</button>
      </form>
    </section>`;
}

// === Asistencia ===
function vistaAsistencia(){
  const d=state.data,s=d.sessions.find(x=>x.id===state.sesion);
  const roster=state.roster||[];
  const opciones=[['present','Vino'],['late','Tarde'],['excused','Justificado'],['absent','Faltó']];
  return `${cabecera('Tomar asistencia',s?`${mayus(dia(s.startsAt))} · ${hora(s.startsAt)}`:'')}
    <div class="ca-lista ca-lista-asis">${roster.map(p=>`
      <div class="ca-asis"><div class="ca-asis-top">${avatar(p,'ca-avatar ca-avatar-sm')}<strong>${esc(p.name)}</strong></div>
        <div class="ca-marcas">${opciones.map(([v,l])=>
          `<button type="button" class="ca-marca${state.marcas[p.id]===v?' on':''}" data-marca="${esc(p.id)}" data-valor="${v}">${l}</button>`).join('')}</div>
      </div>`).join('')||'<div class="tos-empty">No hay jugadores inscritos para este entrenamiento.</div>'}</div>
    <div id="asisMsg" class="inline-message hidden"></div>
    ${roster.length?`<button class="ca-cta ca-cta-full ca-guardar" type="button" id="guardarAsis">Guardar asistencia</button>`:''}`;
}

// === Calendario ===
function vistaCalendario(){
  const d=state.data,hoy=new Date();
  const prox=d.sessions.filter(s=>new Date(s.startsAt)>=hoy).sort((a,b)=>new Date(a.startsAt)-new Date(b.startsAt));
  const pasadas=d.sessions.filter(s=>new Date(s.startsAt)<hoy);
  const fila=s=>`<div class="ca-ses"><div><strong>${esc(mayus(dia(s.startsAt)))}</strong>
      <span>${esc(hora(s.startsAt))}${s.endsAt?` – ${esc(hora(s.endsAt))}`:''}${s.location?` · ${esc(s.location)}`:''}</span></div>
      <button type="button" class="ca-mini" data-lista="${esc(s.id)}">${s.taken?`${s.present} presentes`:'Tomar lista'}</button></div>`;
  return `${cabecera('Calendario',d.academy.name)}
    <button class="ca-cta ca-cta-full" type="button" data-nuevo="1">Agendar entrenamiento</button>
    <h2 class="ca-sub">Próximos</h2>
    <div class="ca-lista">${prox.map(fila).join('')||'<div class="tos-empty">No hay entrenamientos agendados.</div>'}</div>
    ${pasadas.length?`<h2 class="ca-sub">Anteriores</h2><div class="ca-lista">${pasadas.map(fila).join('')}</div>`:''}`;
}

function cabecera(titulo,sub=''){
  return `<div class="ca-head"><button type="button" class="ca-back" data-ir="inicio" aria-label="Volver">‹</button>
    <div><h1>${esc(titulo)}</h1>${sub?`<p>${esc(sub)}</p>`:''}</div></div>`;
}

function render(){
  const d=state.data;
  if(!d||!d.academy){
    $('coachBody').innerHTML='<div class="tos-empty">No tienes ninguna academia asignada. Pídele a Presidencia que te asigne una.</div>';
    return;
  }
  const vistas={inicio:vistaInicio,jugadores:vistaJugadores,jugador:vistaJugador,
    evaluaciones:vistaEvaluaciones,asistencia:vistaAsistencia,calendario:vistaCalendario};
  $('coachBody').innerHTML=`<div class="ca-wrap">${(vistas[state.vista]||vistaInicio)()}</div>`;
  enganchar();
  setShellHealth(d.pendingEvaluations>0
    ? {state:'attention',label:`${d.pendingEvaluations} por evaluar`}
    : {state:'ok',label:'Al día'});
}

function enganchar(){
  const b=$('coachBody');
  b.querySelectorAll('[data-ir]').forEach(x=>x.addEventListener('click',()=>{state.vista=x.dataset.ir;render();window.scrollTo({top:0});}));
  b.querySelectorAll('[data-academia]').forEach(x=>x.addEventListener('click',()=>cargar(x.dataset.academia)));
  b.querySelectorAll('[data-jugador]').forEach(x=>x.addEventListener('click',()=>{state.jugador=x.dataset.jugador;state.vista='jugador';render();window.scrollTo({top:0});}));
  b.querySelectorAll('[data-lista]').forEach(x=>x.addEventListener('click',()=>abrirLista(x.dataset.lista)));
  b.querySelectorAll('[data-nuevo]').forEach(x=>x.addEventListener('click',agendar));
  b.querySelectorAll('[data-compartir]').forEach(x=>x.addEventListener('click',compartir));
  b.querySelectorAll('[data-marca]').forEach(x=>x.addEventListener('click',()=>{
    const id=x.dataset.marca;
    state.marcas[id]=x.dataset.valor;
    b.querySelectorAll(`[data-marca="${CSS.escape(id)}"]`).forEach(o=>o.classList.toggle('on',o===x));
    $('asisMsg')?.classList.add('hidden');
  }));
  $('guardarAsis')?.addEventListener('click',guardarAsistencia);
  $('evalForm')?.addEventListener('submit',guardarEvaluacion);
}

async function abrirLista(sessionId){
  state.sesion=sessionId;state.marcas={};
  try{
    const filas=await rpc('v2_attendance_roster',{organization_id:ctx.organization_id,session_id:sessionId})||[];
    state.roster=filas.map(r=>({id:r.player_id,name:r.player_name,photoPath:r.photo_path,photoBucket:r.photo_bucket}));
    filas.forEach(r=>{if(r.status)state.marcas[r.player_id]=r.status;});
    await firmarFotos(state.roster);
  }catch(e){await tosAlert({kicker:'ASISTENCIA',title:'No se pudo abrir la lista',message:String(e?.message||e)});return;}
  state.vista='asistencia';render();window.scrollTo({top:0});
}

async function guardarAsistencia(){
  const btn=$('guardarAsis'),caja=$('asisMsg');
  const registros=(state.roster||[]).filter(p=>state.marcas[p.id])
    .map(p=>({player_id:p.id,status:state.marcas[p.id]}));
  if(!registros.length){
    caja.textContent='Marca al menos a un jugador antes de guardar.';
    caja.dataset.type='error';caja.classList.remove('hidden');return;
  }
  btn.disabled=true;caja.classList.add('hidden');
  try{
    await rpc('v2_save_attendance',{organization_id:ctx.organization_id,session_id:state.sesion,records:registros});
    await cargar(state.academyId);
    state.vista='inicio';render();
    await tosAlert({kicker:'ASISTENCIA',title:'Lista guardada',message:`${registros.length} jugador${registros.length===1?'':'es'} registrado${registros.length===1?'':'s'}.`});
  }catch(e){
    caja.textContent=String(e?.message||e);caja.dataset.type='error';caja.classList.remove('hidden');
    btn.disabled=false;
  }
}

async function guardarEvaluacion(e){
  e.preventDefault();
  const btn=e.target.querySelector('[type="submit"]'),caja=$('evMsg');
  const scores={};
  e.target.querySelectorAll('[data-eje]').forEach(i=>{if(i.value!=='')scores[i.dataset.eje]=Number(i.value);});
  if(!Object.keys(scores).length){
    caja.textContent='Califica al menos un criterio.';caja.dataset.type='error';caja.classList.remove('hidden');return;
  }
  btn.disabled=true;caja.classList.add('hidden');
  try{
    await rpc('v2_save_academy_evaluation',{organization_id:ctx.organization_id,
      academy_id:state.academyId,player_id:state.jugador,scores,
      sports_objective:$('evObj').value.trim()||null,notes:$('evNota').value.trim()||null});
    await cargar(state.academyId);
    state.vista='jugadores';render();
    await tosAlert({kicker:'EVALUACIÓN',title:'Evaluación guardada',message:'Quedó con tu nombre, la fecha y la academia.'});
  }catch(err){
    caja.textContent=String(err?.message||err);caja.dataset.type='error';caja.classList.remove('hidden');
    btn.disabled=false;
  }
}

async function agendar(){
  const cuando=await tosPrompt({kicker:'CALENDARIO',title:'¿Cuándo es el entrenamiento?',
    message:state.data.academy.name,hint:'Escribe la fecha y la hora, por ejemplo 2026-09-12 17:00',
    value:sugerencia(),placeholder:'2026-09-12 17:00',required:true,
    requiredText:'Escribe la fecha y la hora.',maxlength:20,confirmText:'Continuar'});
  if(cuando===null)return;
  const inicio=new Date(cuando.replace(' ','T'));
  if(Number.isNaN(inicio.getTime())){
    await tosAlert({kicker:'CALENDARIO',title:'No entendí la fecha',message:'Usa el formato 2026-09-12 17:00.'});
    return;
  }
  const lugar=await tosPrompt({kicker:'CALENDARIO',title:'¿Dónde?',
    value:state.data.nextSession?.location||'',placeholder:'Cancha 2',maxlength:120,confirmText:'Agendar'});
  if(lugar===null)return;
  try{
    await rpc('v2_create_academy_session',{organization_id:ctx.organization_id,academy_id:state.academyId,
      starts_at:inicio.toISOString(),ends_at:new Date(inicio.getTime()+60*60*1000).toISOString(),
      title:null,location:lugar||null,session_type:'training'});
    await cargar(state.academyId);
    state.vista='calendario';render();
  }catch(e){await tosAlert({kicker:'CALENDARIO',title:'No se pudo agendar',message:String(e?.message||e)});}
}
// La próxima hora en punto, para no escribir la fecha desde cero.
function sugerencia(){
  const d=new Date();d.setHours(d.getHours()+1,0,0,0);
  const p=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:00`;
}

async function compartir(){
  const url=`${location.origin}/academias/?academia=${encodeURIComponent(state.data.academy.slug)}`;
  try{
    if(navigator.share){await navigator.share({title:state.data.academy.name,url});return;}
    await navigator.clipboard.writeText(url);
    await tosAlert({kicker:'INSCRIPCIÓN',title:'Link copiado',message:'Ya lo puedes pegar en WhatsApp.'});
  }catch{
    await tosPrompt({kicker:'INSCRIPCIÓN',title:'Copia el link',value:url,maxlength:300,confirmText:'Listo'});
  }
}

await cargar();
