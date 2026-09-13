import {bootstrapProtectedShell,rpc,$,setShellHealth} from '/v2/shell.js';
import { getSignedPhotoUrls } from '/v2/photo-cache.js';
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
// El profe no piensa en "jueves 10 de septiembre", piensa en "hoy" o "mañana".
const cuando=v=>{try{
  const h=new Date();h.setHours(0,0,0,0);const x=new Date(v);x.setHours(0,0,0,0);
  const dif=Math.round((x-h)/86400000);
  return dif===0?'Hoy':dif===1?'Mañana':mayus(fFecha.format(new Date(v)));
}catch{return'';}};
const hora=v=>{try{return fHora.format(new Date(v));}catch{return'';}};
const corta=v=>{try{return fCorta.format(new Date(String(v).length<=10?`${v}T12:00:00`:v));}catch{return'';}};
const mayus=s=>s?s[0].toUpperCase()+s.slice(1):'';
function edad(f){if(!f)return null;const b=new Date(`${f}T00:00:00`);if(isNaN(b))return null;
  const h=new Date();let a=h.getFullYear()-b.getFullYear();const m=h.getMonth()-b.getMonth();
  if(m<0||(m===0&&h.getDate()<b.getDate()))a--;return a;}
function saludo(){const h=new Date().getHours();return h<12?'Buenos días':h<19?'Buenas tardes':'Buenas noches';}
const iniciales=n=>String(n||'?').split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();
const METODOLOGIA='TC_1.0';
const ESCALA=[['1','Necesita apoyo'],['2','En proceso'],['3','Esperado'],['4','Sólido'],['5','Destacado'],['','Sin evidencia']];
const DIMENSIONES=[
  {key:'tecnica',name:'Técnica',claim:'Tengo herramientas',observe:'control, conducción, pase, golpeo y recursos técnicos'},
  {key:'inteligencia',name:'Juego',claim:'Entiendo y resuelvo',observe:'percepción, decisiones, ubicación, compañeros y uso del espacio'},
  {key:'intensidad',name:'Cuerpo',claim:'Puedo ejecutar',observe:'coordinación, movilidad, equilibrio, agilidad y control corporal'},
  {key:'mentalidad',name:'Mentalidad',claim:'No desaparezco',observe:'reacción al error, concentración, resiliencia, valentía y autonomía'},
  {key:'valores',name:'Espíritu',claim:'Represento algo más grande que yo',observe:'respeto, compañerismo, humildad, responsabilidad y pertenencia'}
];
const BABY_DIMENSIONES=[
  {key:'movimiento',name:'Movimiento',claim:'Descubro mi cuerpo',observe:'coordinación, equilibrio, desplazamientos y confianza'},
  {key:'balon',name:'Balón',claim:'Me relaciono con el balón',observe:'curiosidad, contacto, conducción y disfrute'},
  {key:'juego',name:'Juego',claim:'Exploro jugando',observe:'participación, atención y soluciones sencillas'},
  {key:'convivencia',name:'Convivencia',claim:'Juego con los demás',observe:'turnos, respeto, cooperación y pertenencia'}
];
const BABY_ESCALA=[['1','Descubriendo'],['2','En desarrollo'],['3','Avanza con seguridad'],['','Sin evidencia']];
const OPCIONES=['Técnica','Juego','Cuerpo','Mentalidad','Espíritu','Velocidad','Regate','Golpeo','Definición','Pase','Visión','Juego aéreo','1v1','Defensa','Liderazgo','Otro'];
const SUPERPODER=['Aún no identificado','Velocidad','Regate','Golpeo','Definición','Pase','Visión','Juego aéreo','1v1','Defensa','Liderazgo','Otro'];
const periodoActual=()=>new Intl.DateTimeFormat('es-MX',{month:'long',year:'numeric'}).format(new Date()).replace(/^./,x=>x.toUpperCase());
const esBaby=p=>/baby/i.test(p?.category||'');
const pendiente=p=>!p.lastEvaluationOn||(Date.now()-new Date(p.lastEvaluationOn).getTime())>80*86400000;
const EXPECTATIVAS={T8:{inteligencia:'empieza a levantar la cabeza, reconoce espacios, ayuda a compañeros y encuentra soluciones sencillas'},T10:{inteligencia:'identifica ventajas, se ofrece antes de recibir y decide con menor dependencia del profesor'},T12:{inteligencia:'interpreta cambios del juego, ocupa espacios con intención y conecta decisiones con el plan del equipo'}};
const contextoCategoria=(p,dim)=>EXPECTATIVAS[String(p.category||'').toUpperCase()]?.[dim.key]||`${dim.observe}; observa lo esperable para ${p.category||'su etapa'}`;
const draftKey=p=>`tanneros:evaluacion:${METODOLOGIA}:${state.academyId}:${p.id}`;
function leerBorrador(p){try{return JSON.parse(localStorage.getItem(draftKey(p))||'null')||{};}catch{return{};}}
function guardarBorradorLocal(p,form){const values={scores:{},period:form.evPeriod.value,fortaleza:form.evStrength.value,otraFortaleza:form.evStrengthOther.value,prioridad:form.evPriority.value,otraPrioridad:form.evPriorityOther.value,superpoder:form.evPower.value,otroPoder:form.evPowerOther.value,objetivo:form.evObj.value,nota:form.evNota.value};form.querySelectorAll('[data-eje]:checked').forEach(i=>{values.scores[i.dataset.eje]=i.value===''?null:Number(i.value);});const status=$('evDraftStatus');try{localStorage.setItem(draftKey(p),JSON.stringify(values));if(status)status.textContent='Borrador guardado en este dispositivo';}catch{if(status)status.textContent='No se pudo guardar el borrador local';}}
function opcionesSelect(items,value=''){return items.map(x=>`<option${x===value?' selected':''}>${esc(x)}</option>`).join('');}

// En listas sólo se firman miniaturas; si faltan, se muestran iniciales.
async function firmarFotos(lista){
  try{
    const porBucket={};
    (lista||[]).forEach(p=>{if(p.photoThumbPath){const b=p.photoBucket||'tanneros-private';(porBucket[b]=porBucket[b]||[]).push(p.photoThumbPath);}});
    for(const b of Object.keys(porBucket)){
      const mapa=await getSignedPhotoUrls(supabase,b,porBucket[b]);
      (lista||[]).forEach(p=>{if(p.photoThumbPath&&(p.photoBucket||'tanneros-private')===b&&mapa[p.photoThumbPath])p._foto=mapa[p.photoThumbPath];});
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
    ? `<div class="ca-next"><div><span class="ca-next-when">${esc(cuando(prox.startsAt))}</span>
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
  const e=edad(p.birthDate),asis=p.sessionsTotal>0?`${Math.round(p.sessionsAttended/p.sessionsTotal*100)}% asistencia`:'sin sesiones aún';
  const ev=pendiente(p)?(p.lastEvaluationOn?'Evaluación trimestral pendiente':'Sin evaluar'):`Evaluado ${corta(p.lastEvaluationOn)}`;
  return `<article class="ca-jug${pendiente(p)?' is-pending':''}"><button type="button" class="ca-jug-main" data-jugador="${esc(p.id)}">
    ${avatar(p)}<span class="ca-jug-info"><strong>${esc(p.name)}</strong><span>${[p.category,e!=null?`${e} años`:null,p.position&&p.position!=='Por definir'?p.position:null].filter(Boolean).map(esc).join(' · ')}</span><small>${esc(asis)} · ${esc(ev)}</small></span></button>
    <button type="button" class="ca-eval-fast" data-evaluar="${esc(p.id)}">Evaluar</button></article>`;
}
function vistaJugadores(){
  const d=state.data;
  return `${cabecera('Mis jugadores',`${d.players.length} en ${d.academy.name}`)}
    <div class="ca-lista">${d.players.map(tarjetaJugador).join('')||'<div class="tos-empty">Todavía no hay jugadores inscritos.</div>'}</div>`;
}
function vistaEvaluaciones(){
  const d=state.data,sin=d.players.filter(pendiente),con=d.players.filter(p=>!pendiente(p)),total=d.players.length;
  return `${cabecera(`Evaluaciones ${periodoActual()}`,`${con.length} / ${total} completadas`)}
    <div class="ca-eval-progress"><i style="width:${total?Math.round(con.length/total*100):0}%"></i></div>
    ${sin.length?`<h2 class="ca-sub">Pendientes</h2><div class="ca-lista">${sin.map(tarjetaJugador).join('')}</div>`:'<div class="tos-empty">Evaluaciones trimestrales al día.</div>'}
    ${con.length?`<h2 class="ca-sub">Terminadas</h2><div class="ca-lista">${con.map(tarjetaJugador).join('')}</div>`:''}`;
}
// === Perfil deportivo ===
// Solo lo que sirve para entrenarlo: nada de cuotas, adeudos ni datos de la familia.
function formularioEvaluacion(p){
  const baby=esBaby(p),dims=baby?BABY_DIMENSIONES:DIMENSIONES,scale=baby?BABY_ESCALA:ESCALA,d=leerBorrador(p);
  return `<form id="evalForm" class="ca-eval" data-player="${esc(p.id)}">
    <label class="ca-eval-txt">Periodo<input id="evPeriod" value="${esc(d.period||periodoActual())}" maxlength="40"></label>
    ${dims.map(dim=>`<fieldset class="ca-dimension"><legend><strong>${esc(dim.name)}</strong><span>${esc(dim.claim)}</span></legend>
      <div class="ca-scale">${scale.map(([v,l])=>`<label class="ca-score${v===''?' no-evidence':''}"><input type="radio" name="score-${esc(dim.key)}" data-eje="${esc(dim.key)}" value="${v}"${Object.prototype.hasOwnProperty.call(d.scores||{},dim.key)&&String(d.scores[dim.key]??'')===v?' checked':''}><b>${v||'—'}</b><small>${esc(l)}</small></label>`).join('')}</div>
      <details class="ca-observe"><summary>ⓘ ¿Qué observar en ${esc(p.category||'su categoría')}?</summary><p>${esc(contextoCategoria(p,dim))}. No lo compares contra otros Tanners.</p></details></fieldset>`).join('')}
    <div class="ca-decisions"><label>Fortaleza principal<small>¿Qué está haciendo especialmente bien?</small><select id="evStrength"><option value="">Selecciona</option>${opcionesSelect(OPCIONES,d.fortaleza)}</select><input id="evStrengthOther" class="${d.fortaleza==='Otro'?'':'hidden'}" maxlength="60" value="${esc(d.otraFortaleza||'')}" placeholder="Escribe la fortaleza"></label>
    <label>Prioridad de desarrollo<small>¿Qué queremos ayudarle a mejorar?</small><select id="evPriority"><option value="">Selecciona</option>${opcionesSelect(OPCIONES,d.prioridad)}</select><input id="evPriorityOther" class="${d.prioridad==='Otro'?'':'hidden'}" maxlength="60" value="${esc(d.otraPrioridad||'')}" placeholder="Escribe la prioridad"></label>
    <label>Superpoder<small>No es una calificación. Puede no estar identificado.</small><select id="evPower">${opcionesSelect(SUPERPODER,d.superpoder||'Aún no identificado')}</select></label>
    <label id="powerOtherWrap" class="${d.superpoder==='Otro'?'':'hidden'}">¿Cuál?<input id="evPowerOther" maxlength="60" value="${esc(d.otroPoder||'')}" placeholder="Talento diferencial"></label></div>
    <details class="ca-optional"><summary>Objetivos y nota opcional</summary><label class="ca-eval-txt">Próximo objetivo deportivo<input id="evObj" maxlength="160" value="${esc(d.objetivo||'')}" placeholder="Una frase corta"></label><label class="ca-eval-txt">Nota interna del profesor<input id="evNota" maxlength="300" value="${esc(d.nota||'')}" placeholder="Opcional"></label></details>
    <div id="evMsg" class="inline-message hidden"></div><small id="evDraftStatus" class="ca-draft">Los cambios se guardan en este dispositivo</small>
    <div class="ca-save-row"><button class="ca-mini" id="saveDraft" type="button">Guardar borrador</button><button class="ca-cta" name="action" value="next" type="submit">Guardar y siguiente</button></div>
  </form>`;
}

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
    <section class="ca-card ca-method"><div class="ca-method-head"><div><span>METODOLOGÍA TANNERY CITY · ${METODOLOGIA}</span><h2>Perfil Tanner</h2></div><small>2–3 min</small></div>
      <p class="ca-hint">${p.lastEvaluationOn?`Última evaluación: ${esc(corta(p.lastEvaluationOn))}.`:'Primera evaluación de esta etapa.'}</p>
      ${formularioEvaluacion(p)}
    </section>`;
}

// === Asistencia ===
function vistaAsistencia(){
  const d=state.data,s=d.sessions.find(x=>x.id===state.sesion);
  const roster=state.roster||[];
  const opciones=[['present','Vino'],['late','Tarde'],['excused','Justificado'],['absent','Faltó']];
  return `${cabecera('Tomar asistencia',s?`${cuando(s.startsAt)} · ${hora(s.startsAt)}`:'')}
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
  const fila=s=>`<div class="ca-ses"><div><strong>${esc(cuando(s.startsAt))}</strong>
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
  b.querySelectorAll('[data-evaluar]').forEach(x=>x.addEventListener('click',()=>{state.jugador=x.dataset.evaluar;state.vista='jugador';render();window.scrollTo({top:0});}));
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
  const evalForm=$('evalForm');evalForm?.addEventListener('submit',guardarEvaluacion);evalForm?.addEventListener('input',()=>guardarBorradorLocal(state.data.players.find(p=>p.id===state.jugador),evalForm));$('saveDraft')?.addEventListener('click',()=>guardarBorradorLocal(state.data.players.find(p=>p.id===state.jugador),evalForm));$('evPower')?.addEventListener('change',e=>$('powerOtherWrap')?.classList.toggle('hidden',e.target.value!=='Otro'));$('evStrength')?.addEventListener('change',e=>$('evStrengthOther')?.classList.toggle('hidden',e.target.value!=='Otro'));$('evPriority')?.addEventListener('change',e=>$('evPriorityOther')?.classList.toggle('hidden',e.target.value!=='Otro'));
}

async function abrirLista(sessionId){
  state.sesion=sessionId;state.marcas={};
  try{
    const filas=await rpc('v2_attendance_roster',{organization_id:ctx.organization_id,session_id:sessionId})||[];
    state.roster=filas.map(r=>({id:r.player_id,name:r.player_name,photoThumbPath:r.photo_thumb_path,photoBucket:r.photo_bucket}));
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
  e.preventDefault();const form=e.target,p=state.data.players.find(x=>x.id===state.jugador),btn=e.submitter||form.querySelector('[type="submit"]'),caja=$('evMsg'),scores={};
  form.querySelectorAll('[data-eje]:checked').forEach(i=>{if(i.value!=='')scores[i.dataset.eje]=Number(i.value);});
  const expected=(esBaby(p)?BABY_DIMENSIONES:DIMENSIONES).map(x=>x.key);
  if(expected.some(k=>!form.querySelector(`[data-eje="${k}"]:checked`))){caja.textContent='Elige un nivel o “Sin evidencia” en cada dimensión.';caja.dataset.type='error';caja.classList.remove('hidden');return;}
  if(!$('evStrength').value||!$('evPriority').value){caja.textContent='Selecciona la fortaleza y la prioridad.';caja.dataset.type='error';caja.classList.remove('hidden');return;}
  if($('evPower').value==='Otro'&&!$('evPowerOther').value.trim()){caja.textContent='Escribe cuál es el superpoder.';caja.dataset.type='error';caja.classList.remove('hidden');return;}
  const meta={methodology_version:METODOLOGIA,category:p.category||null,period:$('evPeriod').value.trim(),strength:$('evStrength').value==='Otro'?$('evStrengthOther').value.trim():$('evStrength').value,priority:$('evPriority').value==='Otro'?$('evPriorityOther').value.trim():$('evPriority').value,superpower:$('evPower').value==='Otro'?$('evPowerOther').value.trim():$('evPower').value,baby:esBaby(p)};
  btn.disabled=true;caja.classList.add('hidden');
  try{await rpc('v2_save_academy_evaluation',{organization_id:ctx.organization_id,academy_id:state.academyId,player_id:state.jugador,scores,sports_objective:$('evObj').value.trim()||meta.priority,notes:`[${METODOLOGIA}] ${JSON.stringify(meta)}${$('evNota').value.trim()?`\n${$('evNota').value.trim()}`:''}`});localStorage.removeItem(draftKey(p));await cargar(state.academyId);const next=state.data.players.find(x=>x.id!==p.id&&pendiente(x));if(next){state.jugador=next.id;state.vista='jugador';render();window.scrollTo({top:0});}else{state.vista='evaluaciones';render();}await tosAlert({kicker:'PERFIL TANNER',title:'Evaluación guardada',message:next?`Sigue ${next.name}.`:'Evaluaciones trimestrales al día.'});}
  catch(err){caja.textContent=String(err?.message||err);caja.dataset.type='error';caja.classList.remove('hidden');btn.disabled=false;}
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
const jugadorSolicitado=new URLSearchParams(location.search).get('player');
if(jugadorSolicitado&&state.data?.players?.some(p=>String(p.id)===jugadorSolicitado)){state.jugador=jugadorSolicitado;state.vista='jugador';render();}
