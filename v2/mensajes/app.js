import {bootstrapProtectedShell,rpc,$,setShellHealth,setAccionesDePantalla,supabase} from '/v2/shell.js';
import {problemaConArchivo,extensionDe,rutaDeArchivo,pesoLegible,puedeEditar,mencionEnCurso,candidatosDeMencion,insertaMencion,
  mencionados,resaltaMenciones,atajoEnCurso,filtraRapidas,atajoValido,RAPIDAS_SUGERIDAS,SILENCIOS,silencioHasta,validaProgramado,
  valorLocal,huellaDelHilo} from '/v2/mensajes/pro.js';
import {getSignedPhotoUrl,getRawSignedPhotoUrl} from '/v2/photo-cache.js';
import {UPLOAD_CACHE_CONTROL} from '/v2/image-encode.js';

// Vestidor: los mensajes internos del club. Pedido de Presidencia
// (05/10/2026): "estilo WhatsApp, con rediseño Apple, que nos ayuden a
// operar". Chats 1 a 1 y por área (cada rol tiene el suyo, más "Todo el
// club"), y Avisos con "visto por". Las familias no entran en esta fase.
//
// Todo pasa por funciones v2 con candado (k2): nadie lee un chat que no es
// suyo ni el de otra área. Lo nuevo se trae cada pocos segundos mientras la
// pantalla está a la vista; al celular llega por push si activaron avisos.
const boot=await bootstrapProtectedShell({active:'mensajes',title:'Mensajes'});
if(!boot)throw new Error('No access');
const {ctx}=boot;
const org=ctx.organization_id;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={tab:'chats',inbox:null,avisos:null,thread:null,threadId:null,busca:'',pending:[],timer:null,inboxTimer:null,
  respondiendo:null,editando:null,rapidas:null,huella:''};
const BUCKET='tanneros-private';
// Íconos de línea, nunca emojis (regla del club): mismo trazo que el menú.
const ICONO={
  club:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>',
  Operaciones:'<path d="m21 8-9 5-9-5 9-5 9 5Z"/><path d="m3 8 9 5 9-5v9l-9 5-9-5V8Z"/>',
  Taquilla:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h10"/><path d="M8 15h4"/>',
  Contabilidad:'<path d="M6 3h12v18H6z"/><path d="M9 7h6"/><path d="M9 11h6"/><path d="M9 15h4"/>',
  Formadores:'<circle cx="12" cy="12" r="9"/><path d="m12 7.5 4 2.9-1.5 4.6h-5L8 10.4Z"/>',
  Academia:'<path d="m3 10 9-5 9 5-9 5-9-5Z"/><path d="M7 12v5c3 2 7 2 10 0v-5"/>',
  Scouting:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  Marketing:'<path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1Z"/><path d="M16 9a4 4 0 0 1 0 6"/>',
  Presidencia:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9Z"/>',
  chat:'<path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.6L3 21l1.9-5.4A8.5 8.5 0 1 1 21 11.5Z"/>',
  reloj:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  clip:'<path d="m21 11-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l9-9a3.7 3.7 0 0 1 5.2 5.2l-9 9a1.8 1.8 0 0 1-2.6-2.6L15.5 6"/>',
  rayo:'<path d="M13 2 4 14h7l-1 8 9-12h-7Z"/>',
  lupa:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  campana:'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  mudo:'<path d="M6 8a6 6 0 0 1 9.3-5"/><path d="M18 8c0 7 3 9 3 9H9"/><path d="M6 8c0 7-3 9-3 9h3"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/><path d="m3 3 18 18"/>',
  pin:'<path d="M12 17v5"/><path d="M9 10.8V4h6v6.8l3 3.2v2H6v-2Z"/>',
  check:'<path d="m5 12 5 5 9-10"/>',
  x:'<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  archivo:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/>',
  responder:'<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v5"/>',
  copiar:'<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  lapiz:'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  basura:'<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
  mas:'<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>'
};
const svg=(k,cls='')=>`<svg${cls?` class="${cls}"`:''} viewBox="0 0 24 24" aria-hidden="true">${ICONO[k]||ICONO.chat}</svg>`;

const iniciales=n=>String(n||'?').trim().split(/\s+/).slice(0,2).map(p=>p[0]||'').join('').toUpperCase()||'?';
// Un color estable por persona, de la paleta del club, para reconocerla de un vistazo.
const TONOS=['#0b6e7c','#1e7a45','#8a6413','#6b4fa0','#b4443a','#2f5d9b','#7a5c14'];
const tono=s=>{let h=0;for(const c of String(s||''))h=(h*31+c.charCodeAt(0))>>>0;return TONOS[h%TONOS.length];};
function avatar(t,grande=false){
  const cls=`ms-av${grande?' big':''}`;
  if(t.kind==='area')return `<span class="${cls} area" aria-hidden="true">${svg(t.areaRole==='*'?'club':t.areaRole)}</span>`;
  return `<span class="${cls}" style="background:${tono(t.title)}" aria-hidden="true">${esc(iniciales(t.title))}</span>`;
}
const hora=v=>new Intl.DateTimeFormat('es-MX',{hour:'numeric',minute:'2-digit'}).format(new Date(v));
function cuando(v){
  if(!v)return '';
  const d=new Date(v),hoy=new Date(),ayer=new Date();ayer.setDate(hoy.getDate()-1);
  if(d.toDateString()===hoy.toDateString())return hora(v);
  if(d.toDateString()===ayer.toDateString())return 'Ayer';
  const dias=(hoy-d)/864e5;
  if(dias<7)return new Intl.DateTimeFormat('es-MX',{weekday:'long'}).format(d);
  return new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short'}).format(d);
}
function dia(v){
  const d=new Date(v),hoy=new Date(),ayer=new Date();ayer.setDate(hoy.getDate()-1);
  if(d.toDateString()===hoy.toDateString())return 'Hoy';
  if(d.toDateString()===ayer.toDateString())return 'Ayer';
  return new Intl.DateTimeFormat('es-MX',{weekday:'long',day:'numeric',month:'long'}).format(d);
}
// Texto seguro con ligas y saltos de línea.
const texto=v=>esc(v).replace(/(https?:\/\/[^\s<]+)/g,'<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g,'<br>');
const llave=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
const esTactil=matchMedia('(pointer:coarse)').matches;

/* ---------- Datos ---------- */
async function cargaInbox(){
  try{state.inbox=await rpc('v2_chat_inbox',{organization_id:org});}
  catch(e){if(!state.inbox){$('msBody').innerHTML=`<div class="tos-empty">${esc(amable(e))}</div>`;}return;}
  pintaLista();
}
async function cargaAvisos(){
  try{state.avisos=await rpc('v2_avisos',{organization_id:org});}
  catch(e){state.avisos={avisos:[],canPublish:false,error:amable(e)};}
  if(state.tab==='avisos')pintaLista();
}
function amable(e){
  const raw=String(e?.message||e);
  if(/Could not find the function|schema cache/i.test(raw))return 'Mensajes todavía se está instalando. Intenta en un minuto.';
  if(/Not authorized/i.test(raw))return 'No tienes acceso a esta conversación.';
  if(/Failed to fetch|NetworkError|network/i.test(raw))return 'Sin conexión. Revisa el internet.';
  return raw;
}

/* ---------- Lista ---------- */
function pintaLista(){
  const app=$('msBody');
  if(!app.querySelector('.ms-list')){
    app.innerHTML=`<aside class="ms-list"><header class="ms-list-head"><h1>Mensajes</h1><button id="msNuevo" class="ms-icon-btn" type="button" aria-label="Nuevo chat" title="Nuevo chat"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button></header><nav class="ms-seg" role="tablist"><button type="button" role="tab" data-tab="chats">Chats<b class="ms-tab-n" id="msNChats" hidden></b></button><button type="button" role="tab" data-tab="avisos">Avisos<b class="ms-tab-n" id="msNAvisos" hidden></b></button></nav><label class="ms-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input id="msBusca" type="search" placeholder="Buscar" autocomplete="off" aria-label="Buscar chats"></label><div id="msPush"></div><div id="msItems" class="ms-items"></div></aside><section id="msChat" class="ms-chat"><div class="ms-chat-empty"><span aria-hidden="true">${svg('chat')}</span><strong>El vestidor del club</strong><small>Elige un chat o empieza uno nuevo. Lo que se diga aquí se queda en el club.</small></div></section>`;
    app.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>cambiaTab(b.dataset.tab)));
    $('msNuevo').addEventListener('click',()=>state.tab==='avisos'?hojaAviso():hojaNuevo());
    $('msBusca').addEventListener('input',e=>{state.busca=e.target.value;pintaItems();});
    $('msItems').addEventListener('click',e=>{
      const ack=e.target.closest('[data-ack]');if(ack){enterado(ack.dataset.ack,ack);return;}
      const det=e.target.closest('[data-detalle]');if(det){detalleAviso(det.dataset.detalle);return;}
      const ges=e.target.closest('[data-gestion]');if(ges){gestionAviso(ges.dataset.gestion);return;}
      const b=e.target.closest('[data-thread]');if(b)abreChat(b.dataset.thread);
    });
  }
  app.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===state.tab)));
  pintaConteos();
  $('msNuevo').setAttribute('aria-label',state.tab==='avisos'?'Nuevo aviso':'Nuevo chat');
  $('msNuevo').classList.toggle('hidden',state.tab==='avisos'&&!state.avisos?.canPublish);
  $('msBusca').closest('.ms-search').classList.toggle('hidden',state.tab==='avisos');
  pintaPush();
  pintaItems();
}
function pintaPush(){
  // La campana del shell ya sabe si este equipo puede recibir avisos y aún no
  // los activó; aquí sólo se ofrece el botón, más a la mano.
  const fila=$('tosBellSubscribeRow'),box=$('msPush');if(!box)return;
  const ofrecer=fila&&!fila.classList.contains('hidden');
  box.innerHTML=ofrecer?`<div class="ms-push"><span>Recibe los mensajes en tu celular aunque no tengas TannerOS abierto.</span><button type="button" id="msPushBtn">Activar</button></div>`:'';
  $('msPushBtn')?.addEventListener('click',()=>{$('tosEnablePush')?.click();setTimeout(pintaPush,4000);});
}
function pintaItems(){
  const box=$('msItems');if(!box)return;
  if(state.tab==='avisos'){pintaAvisos(box);return;}
  const q=state.busca.trim().toLowerCase();
  const lista=(state.inbox?.threads||[]).filter(t=>!q||String(t.title||'').toLowerCase().includes(q)||String(t.last?.body||'').toLowerCase().includes(q));
  const fila=t=>{
    const ult=t.last?`${t.last.mine?'Tú: ':t.kind==='area'?`${esc(String(t.last.senderName||'').split(/\s+/)[0])}: `:''}${esc(t.last.body)}`
      :`<i>${t.kind==='area'?(t.areaRole==='*'?'Todo el club en un chat':`Chat del área de ${esc(t.areaRole)}`):'Sin mensajes todavía'}</i>`;
    const n=Number(t.unread||0),arroba=Number(t.mentions||0);
    // Silenciado (h20): el contador se queda, en gris; una mención sí se marca.
    const marcas=`${t.muted?`<span class="ms-muted" title="Silenciado" aria-label="Silenciado">${svg('mudo')}</span>`:''}${arroba?'<b class="ms-at" title="Te mencionaron" aria-label="Te mencionaron">@</b>':''}${n?`<b class="ms-count${t.muted&&!arroba?' muted':''}">${n>99?'99+':n}</b>`:''}`;
    return `<button type="button" class="ms-item${t.id===state.threadId?' on':''}${n?' unread':''}${t.muted?' is-muted':''}" data-thread="${esc(t.id)}">${avatar(t)}<span class="ms-item-main"><span class="ms-item-top"><strong>${esc(t.title||'Chat')}</strong><time>${esc(cuando(t.last?.at))}</time></span><span class="ms-item-bottom"><span class="ms-prev">${ult}</span>${marcas}</span></span></button>`;
  };
  const directos=lista.filter(t=>t.kind==='direct'||t.last),areas=lista.filter(t=>t.kind==='area'&&!t.last);
  box.innerHTML=(directos.length?directos.map(fila).join(''):'')
    +(areas.length?`<p class="ms-sec">Áreas del club</p>${areas.map(fila).join('')}`:'')
    +(!lista.length?`<div class="ms-vacio">${q?'Nada con ese nombre.':'Sin chats todavía.'}</div>`:'');
}
/* De dónde viene lo nuevo (19/10/2026): "algunos son avisos y otros son
   chats… luego no sabes de dónde vienen". Cada pestaña lleva su globito azul
   con lo que tiene sin leer; la campana abre la pestaña donde está lo nuevo.
   Los números salen de lo que ya está en pantalla y, si aún no se carga, del
   pulso de la campana (v2_chat_pulse trae chats y avisos por separado). */
let pulsoConteos={chats:0,avisos:0};
function conteos(){
  // Lo silenciado no cuenta para el globito, salvo que te hayan mencionado.
  const chats=state.inbox?(state.inbox.threads||[]).reduce((n,t)=>n+(t.muted?Number(t.mentions||0):Number(t.unread||0)),0):Number(pulsoConteos.chats||0);
  const avisos=state.avisos?(state.avisos.avisos||[]).filter(a=>a.unread).length:Number(pulsoConteos.avisos||0);
  return {chats,avisos};
}
function pintaConteos(){
  const c=conteos();
  for(const [id,n,etq] of [['msNChats',c.chats,'chats'],['msNAvisos',c.avisos,'avisos']]){
    const el=$(id);if(!el)continue;
    el.hidden=!n;el.textContent=n>99?'99+':String(n);
    el.closest('[data-tab]')?.setAttribute('aria-label',n?`${etq==='chats'?'Chats':'Avisos'}, ${n} sin leer`:(etq==='chats'?'Chats':'Avisos'));
  }
}
// La pestaña donde está lo nuevo: chats primero (alguien espera respuesta).
function pestanaConNuevo(){const c=conteos();return c.chats?'chats':c.avisos?'avisos':state.tab;}

/* A quién iba el aviso. Los personales iguales llegan juntos (d5): "Para ti,
   Brandon y Emmanuel" en una sola tarjeta, no una por persona. */
function paraQuien(a){
  if(a.audienceType==='club')return 'Todo el club';
  // Avisos a familias (18/10/2026): llegan a su portal y a su celular.
  if(a.audienceType==='familias')return 'Todas las familias';
  if(a.audienceType==='categoria')return `Familias de ${a.audienceValue||''}`;
  if(a.audienceType==='role')return a.audienceValue||'';
  const yo=state.inbox?.me?.userId;
  const nombres=(a.recipients||[{userId:a.audienceValue}]).map(r=>r.userId===yo?'ti':(r.name||(state.inbox?.people||[]).find(p=>p.userId===r.userId)?.name||'alguien del club'));
  const lista=nombres.length>1?`${nombres.slice(0,-1).join(', ')} y ${nombres[nombres.length-1]}`:nombres[0]||'';
  return `Para ${lista}`;
}
const fechaHora=v=>new Intl.DateTimeFormat('es-MX',{weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(new Date(v));
function alcance(a){
  if(!a.reach)return '';
  const r=a.reach,fam=r.familias,cuantos=`Visto por ${r.seen} de ${r.total}${fam?` ${r.total===1?'familia':'familias'}`:''}`;
  const ent=!fam&&r.acked!=null?` · ${r.acked} ${r.acked===1?'enterado':'enterados'}`:'';
  const titulo=fam?'Familias que ya lo vieron en su portal':'Personas que ya lo vieron';
  // El autor toca el número y ve quién falta (h20).
  return a.canManage?`<button type="button" class="ms-visto" data-detalle="${esc(a.id)}" title="${titulo}">${cuantos}${ent}</button>`
    :`<b class="ms-visto" title="${titulo}">${cuantos}${ent}</b>`;
}
function tarjetaAviso(a){
  const chips=`${a.pinned?`<span class="ms-chip pin">${svg('pin')}Fijado</span>`:''}${a.scheduledFor?`<span class="ms-chip prog">${svg('reloj')}Sale ${esc(fechaHora(a.scheduledFor))}</span>`:''}`;
  const enterado=a.canAck?(a.acked?`<span class="ms-acked">${svg('check')}Enterado</span>`
    :`<button type="button" class="ms-ack" data-ack="${esc(a.id)}">${svg('check')}Enterado</button>`):'';
  const gestion=a.canManage?`<button type="button" class="ms-gestion" data-gestion="${esc(a.id)}" aria-label="Opciones del aviso">${svg('mas')}</button>`:'';
  return `<article class="ms-aviso${a.unread?' unread':''}${a.pinned?' pinned':''}${a.scheduledFor?' scheduled':''}" data-aviso="${esc(a.id)}"><header><strong>${esc(a.title)}</strong><span class="ms-aviso-top"><time>${esc(a.scheduledFor?'Programado':cuando(a.publishedAt))}</time>${gestion}</span></header>${chips?`<div class="ms-chips">${chips}</div>`:''}${a.body?`<p>${texto(a.body)}</p>`:''}<footer><span>${esc(a.author||'')} · ${esc(paraQuien(a))}</span>${alcance(a)}</footer>${enterado?`<div class="ms-aviso-acciones">${enterado}</div>`:''}</article>`;
}
function pintaAvisos(box){
  const d=state.avisos;
  if(!d){box.innerHTML='<div class="ms-vacio">Cargando avisos…</div>';return;}
  const lista=d.avisos||[];
  box.innerHTML=(d.canPublish?`<button type="button" class="ms-aviso-nuevo" id="msAvisoNuevo">＋ Nuevo aviso para el club</button>`:'')
    +(lista.length?lista.map(tarjetaAviso).join('')
      :`<div class="ms-vacio">${esc(d.error||'Sin avisos. Cuando Presidencia publique uno, aparece aquí.')}</div>`);
  pintaConteos();
  $('msAvisoNuevo')?.addEventListener('click',hojaAviso);
}
const avisoPorId=id=>(state.avisos?.avisos||[]).find(a=>a.id===id);
// "Enterado" (h20): visto no es enterado. Se marca al momento y, si falla, se regresa.
async function enterado(id,btn){
  const a=avisoPorId(id);if(!a)return;
  a.acked=true;btn?.closest('.ms-aviso-acciones')?.replaceChildren(Object.assign(document.createElement('span'),{className:'ms-acked',innerHTML:`${svg('check')}Enterado`}));
  try{await rpc('v2_aviso_enterado',{organization_id:org,aviso_id:id});}
  catch(e){a.acked=false;pintaItems();await window.tosAlert?.({kicker:'AVISOS',title:'No se marcó',message:amable(e)});}
}
async function detalleAviso(id){
  const a=avisoPorId(id);if(!a)return;
  abreHoja(`<header class="ms-sheet-head"><h2 id="msSheetTitle">¿Quién lo vio?</h2><button type="button" class="ms-close" data-cerrar aria-label="Cerrar">✕</button></header><p class="ms-hint-sm">${esc(a.title)}</p><div id="msDetalle" class="ms-detalle"><div class="ms-vacio">Cargando…</div></div>`);
  let gente;
  try{gente=await rpc('v2_aviso_detalle',{organization_id:org,aviso_id:id});}
  catch(e){$('msDetalle').innerHTML=`<div class="ms-vacio">${esc(amable(e))}</div>`;return;}
  const fam=a.reach?.familias;
  const grupos=[['falta',fam?'Todavía no lo ven':'Faltan',g=>!g.seenAt&&!g.ackAt],
    ['visto',fam?'Ya lo vieron':'Lo vieron, sin "Enterado"',g=>g.seenAt&&!g.ackAt],
    ['ok','Enterados',g=>g.ackAt]].filter(([k])=>!(fam&&k==='ok'));
  $('msDetalle').innerHTML=grupos.map(([k,t,f])=>{const l=(gente||[]).filter(f);
    return `<section class="ms-grupo ${k}"><h3>${esc(t)} <b>${l.length}</b></h3>${l.length?`<ul>${l.map(g=>`<li><span class="ms-av" style="background:${tono(g.name)}" aria-hidden="true">${esc(iniciales(g.name))}</span><span><strong>${esc(g.name)}</strong><small>${esc(g.role||'')}${g.ackAt?` · ${esc(cuando(g.ackAt))}`:g.seenAt?` · lo vio ${esc(cuando(g.seenAt))}`:''}</small></span></li>`).join('')}</ul>`:'<p class="ms-hint-sm">Nadie.</p>'}</section>`;}).join('');
}
function gestionAviso(id){
  const a=avisoPorId(id);if(!a)return;
  abreHoja(`<header class="ms-sheet-head"><h2 id="msSheetTitle">Aviso</h2><button type="button" class="ms-close" data-cerrar aria-label="Cerrar">✕</button></header><div class="ms-acciones">
    <button type="button" data-op="fijar">${svg('pin')}${a.pinned?'Quitar de arriba':'Fijar arriba de la lista'}</button>
    ${a.reach?`<button type="button" data-op="detalle">${svg('check')}Ver quién falta</button>`:''}
    ${a.scheduledFor?`<button type="button" data-op="cancelar" class="peligro">${svg('x')}Cancelar el envío programado</button>`:''}</div>`);
  $('msSheetBody').querySelector('.ms-acciones').addEventListener('click',async e=>{
    const op=e.target.closest('[data-op]')?.dataset.op;if(!op)return;
    if(op==='detalle'){detalleAviso(id);return;}
    if(op==='cancelar'){
      const ok=await window.tosConfirm?.({kicker:'AVISOS',title:'¿Cancelar este aviso?',message:'No va a salir ni le llega a nadie.',confirmText:'Sí, cancelar',danger:true});
      if(!ok)return;
    }
    try{
      if(op==='fijar')await rpc('v2_aviso_fijar',{organization_id:org,aviso_id:id,fijo:!a.pinned});
      else await rpc('v2_aviso_cancelar',{organization_id:org,aviso_id:id});
      cierraHoja();await cargaAvisos();
    }catch(err){await window.tosAlert?.({kicker:'AVISOS',title:'No se pudo',message:amable(err)});}
  });
}
let avisosPorMarcar=false;
async function marcaAvisosVistos(){
  if(!avisosPorMarcar)return;avisosPorMarcar=false;
  try{await rpc('v2_mark_announcements_seen',{organization_id:org});}catch(_){return;}
  (state.avisos?.avisos||[]).forEach(a=>{a.unread=false;});pintaConteos();
}
addEventListener('pagehide',()=>{if(avisosPorMarcar)rpc('v2_mark_announcements_seen',{organization_id:org}).catch(()=>{});});
function cambiaTab(tab){
  if(state.tab==='avisos'&&tab!=='avisos')marcaAvisosVistos();
  state.tab=tab;pintaLista();
  if(tab==='avisos'){
    // Se marcan vistos al salir de la pestaña, no al entrar: así el que era
    // nuevo se ve resaltado mientras lo lees, y el globito se apaga después.
    cargaAvisos().then(()=>{avisosPorMarcar=true;});
  }
}

/* ---------- Conversación ---------- */
async function abreChat(id,{silencioso=false}={}){
  if(state.threadId!==id){state.thread=null;state.pending=[];state.respondiendo=null;state.editando=null;state.huella='';}
  state.threadId=id;
  $('msBody').dataset.view='chat';
  history.replaceState(null,'',`/mensajes/?chat=${encodeURIComponent(id)}`);
  pintaItems();
  if(!silencioso&&!state.thread)$('msChat').innerHTML='<div class="ms-chat-empty"><small>Cargando…</small></div>';
  await cargaChat(true);
  clearInterval(state.timer);
  state.timer=setInterval(()=>{if(document.visibilityState==='visible')cargaChat(false);},4000);
}
async function cargaChat(primera){
  const id=state.threadId;if(!id)return;
  let d;
  try{d=await rpc('v2_chat_thread',{organization_id:org,thread_id:id,before:null});}
  catch(e){if(primera)$('msChat').innerHTML=`<div class="ms-chat-empty"><small>${esc(amable(e))}</small></div>`;return;}
  if(state.threadId!==id)return;
  const ultimoAntes=state.thread?.messages?.at(-1)?.id;
  state.thread=d;
  const ultimo=d.messages.at(-1);
  const nuevos=primera||ultimo?.id!==ultimoAntes;
  // La huella cambia también si alguien editó, borró o fijó algo (h20).
  const huella=huellaDelHilo(d),cambio=huella!==state.huella;state.huella=huella;
  if(primera)pintaChat();else if(cambio){pintaMensajes(true);pintaFijado();pintaCabeza();}else pintaPalomitas();
  // Leí lo que había: se avisa al servidor y la lista se pone al día.
  if(nuevos&&ultimo&&!ultimo.mine||primera){
    rpc('v2_chat_mark_read',{organization_id:org,thread_id:id}).then(()=>{
      const t=(state.inbox?.threads||[]).find(x=>x.id===id);if(t){t.unread=0;t.mentions=0;pintaItems();pintaConteos();}
    }).catch(()=>{});
  }
}
function infoDe(){
  const t=state.thread?.thread;if(!t)return '';
  if(t.kind==='direct'){const o=(t.members||[]).find(m=>m.userId!==state.inbox?.me?.userId);return o?.role||'';}
  const n=(t.members||[]).length;return `${n} ${n===1?'persona':'personas'}`;
}
function pintaCabeza(){
  const t=state.thread?.thread;if(!t||!$('msInfo'))return;
  $('msInfo').textContent=t.mutedUntil?`${infoDe()} · silenciado`:infoDe();
  const b=$('msSilencio');if(b){b.innerHTML=svg(t.mutedUntil?'mudo':'campana');b.setAttribute('aria-label',t.mutedUntil?'Chat silenciado: activar sonido':'Silenciar chat');b.classList.toggle('on',!!t.mutedUntil);}
}
function pintaChat(){
  const t=state.thread.thread;
  $('msChat').innerHTML=`<header class="ms-chat-head"><button type="button" class="ms-back" id="msBack" aria-label="Regresar a los chats"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg><span>Chats</span></button>${avatar({...t,title:t.title})}<span class="ms-chat-title"><strong>${esc(t.title||'Chat')}</strong><small id="msInfo">${esc(infoDe())}</small></span><span class="ms-head-btns"><button type="button" class="ms-icon-btn sm" id="msLupa" aria-label="Buscar en este chat">${svg('lupa')}</button><button type="button" class="ms-icon-btn sm" id="msSilencio" aria-label="Silenciar chat">${svg('campana')}</button></span></header><div id="msFind" class="ms-find hidden"><label class="ms-search">${svg('lupa')}<input id="msBuscaHilo" type="search" placeholder="Buscar en este chat" autocomplete="off" aria-label="Buscar en este chat"></label><div id="msHallazgos" class="ms-hallazgos" aria-live="polite"></div></div><div id="msPin"></div><div class="ms-scroll" id="msScroll"><div class="ms-msgs" id="msMsgs"></div></div><div class="ms-bottom"><div id="msSugiere" class="ms-suggest hidden" role="listbox" aria-label="Sugerencias"></div><div id="msContexto"></div><form class="ms-composer" id="msForm"><button type="button" class="ms-tool" id="msAdjuntar" aria-label="Mandar foto o archivo">${svg('clip')}</button><input type="file" id="msArchivo" class="hidden" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,video/mp4,video/quicktime" tabindex="-1" aria-hidden="true"><textarea id="msTexto" rows="1" maxlength="4000" placeholder="${t.kind==='area'?'Mensaje · @ para mencionar':'Mensaje'}" aria-label="Escribe un mensaje" enterkeyhint="send"></textarea><button type="button" class="ms-tool" id="msRapidas" aria-label="Respuestas rápidas">${svg('rayo')}</button><button type="submit" id="msEnviar" class="ms-send" aria-label="Enviar" disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg></button></form></div>`;
  $('msBack').addEventListener('click',()=>{$('msBody').dataset.view='list';state.threadId=null;clearInterval(state.timer);history.replaceState(null,'','/mensajes/');pintaItems();cargaInbox();});
  const ta=$('msTexto'),btn=$('msEnviar');
  const crece=()=>{ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,140)+'px';btn.disabled=!ta.value.trim();};
  ta.addEventListener('input',()=>{crece();sugerencias();});
  ta.addEventListener('click',sugerencias);
  ta.addEventListener('keydown',e=>{
    const box=$('msSugiere');
    if(!box.classList.contains('hidden')&&['ArrowDown','ArrowUp','Enter','Tab','Escape'].includes(e.key)){
      const ops=[...box.querySelectorAll('[role=option]')],i=ops.findIndex(o=>o.getAttribute('aria-selected')==='true');
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cierraSugerencias();return;}
      if(e.key==='Enter'||e.key==='Tab'){if(i>=0){e.preventDefault();ops[i].click();return;}}
      else{e.preventDefault();const j=(i+(e.key==='ArrowDown'?1:-1)+ops.length)%ops.length;ops.forEach((o,k)=>o.setAttribute('aria-selected',String(k===j)));return;}
    }
    if(e.key==='Escape'&&(state.respondiendo||state.editando)){e.preventDefault();e.stopPropagation();cancelaContexto();return;}
    if(e.key==='Enter'&&!e.shiftKey&&!esTactil){e.preventDefault();$('msForm').requestSubmit();}
  });
  $('msForm').addEventListener('submit',e=>{e.preventDefault();
    if(state.editando)guardaEdicion(ta.value);else enviar(ta.value);
    ta.value='';crece();cierraSugerencias();ta.focus();});
  $('msAdjuntar').addEventListener('click',()=>$('msArchivo').click());
  $('msArchivo').addEventListener('change',e=>{const f=e.target.files?.[0];e.target.value='';if(f)adjunta(f);});
  $('msRapidas').addEventListener('click',hojaRapidas);
  $('msLupa').addEventListener('click',()=>{const f=$('msFind');f.classList.toggle('hidden');if(!f.classList.contains('hidden'))$('msBuscaHilo').focus();else $('msHallazgos').innerHTML='';});
  $('msSilencio').addEventListener('click',hojaSilencio);
  let tBusca;$('msBuscaHilo').addEventListener('input',e=>{clearTimeout(tBusca);tBusca=setTimeout(()=>buscaEnHilo(e.target.value),280);});
  $('msBuscaHilo').addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();$('msLupa').click();}});
  $('msMsgs').addEventListener('click',clicEnMensajes);
  $('msMsgs').addEventListener('contextmenu',e=>{const b=e.target.closest('.ms-bubble[data-msg]');if(b){e.preventDefault();hojaMensaje(b.dataset.msg);}});
  $('msPin').addEventListener('click',e=>{
    if(e.target.closest('[data-desfijar]')){fija(null);return;}
    const ir=e.target.closest('[data-ir]');if(ir)irAMensaje(ir.dataset.ir);
  });
  $('msHallazgos').addEventListener('click',e=>{const ir=e.target.closest('[data-ir]');if(ir){irAMensaje(ir.dataset.ir);}});
  pintaMensajes(false);pintaFijado();pintaContexto();pintaCabeza();
  if(!esTactil)ta.focus();
}
function leidoPor(m){
  const t=state.thread?.thread,me=state.inbox?.me?.userId;
  return (t?.members||[]).filter(x=>x.userId!==me&&x.lastReadAt&&new Date(x.lastReadAt)>=new Date(m.at));
}
function palomitas(m){
  if(m.estado==='enviando')return `<span class="ms-tick" title="Enviando">${svg('reloj','ms-clock')}</span>`;
  if(m.estado==='error'||m.deleted)return '';
  const t=state.thread?.thread;const lectores=leidoPor(m);
  if(t?.kind==='direct')return `<span class="ms-tick${lectores.length?' read':''}" title="${lectores.length?'Leído':'Enviado'}">✓✓</span>`;
  return `<span class="ms-tick${lectores.length?' read':''}">✓✓</span>`;
}
const nombresDelHilo=()=>(state.thread?.thread?.members||[]).map(m=>m.name);
const cuerpoHtml=m=>resaltaMenciones(texto(m.body),nombresDelHilo());
function citaHtml(r){
  if(!r)return '';
  const que=r.deleted?'<i>Mensaje eliminado</i>':r.body?esc(r.body):r.attachment?`${r.kind==='image'?'Foto':'Archivo'}: ${esc(r.attachment)}`:'';
  return `<button type="button" class="ms-quote" data-ir="${esc(r.id)}"><b style="color:${tono(r.senderName)}">${esc(r.senderName)}</b><span>${que}</span></button>`;
}
function adjuntoHtml(m){
  const a=m.attachment;if(!a)return '';
  if(a.kind==='image'){
    const prop=a.w&&a.h?` style="aspect-ratio:${Number(a.w)}/${Number(a.h)}"`:'';
    return `<button type="button" class="ms-foto" data-abrir="${esc(a.path||'')}" data-nombre="${esc(a.name)}" aria-label="Abrir foto"${prop}>${a.local?`<img src="${esc(a.local)}" alt="">`:`<img data-firmar="${esc(a.path)}" alt="Foto">`}</button>`;
  }
  return `<button type="button" class="ms-file" data-abrir="${esc(a.path||'')}" data-nombre="${esc(a.name)}">${svg('archivo')}<span><strong>${esc(a.name)}</strong><small>${esc(pesoLegible(a.size))}</small></span></button>`;
}
function pintaMensajes(conservarScroll){
  const box=$('msMsgs'),sc=$('msScroll');if(!box)return;
  const abajo=!conservarScroll||(sc.scrollHeight-sc.scrollTop-sc.clientHeight<80);
  const t=state.thread.thread,todos=[...state.thread.messages,...state.pending];
  if(!todos.length){
    box.innerHTML=`<div class="ms-hint">${t.kind==='area'?`Este es el chat de ${t.areaRole==='*'?'todo el club':`el área de ${esc(t.areaRole)}`}. Lo que escribas lo ven ${esc(infoDe())}.`:`Escríbele a ${esc(t.title)}. Sólo ustedes dos ven este chat.`}</div>`;
    return;
  }
  let html='',diaPrevio='',prev=null;
  todos.forEach((m,i)=>{
    const d=dia(m.at);
    if(d!==diaPrevio){html+=`<div class="ms-day"><span>${esc(d)}</span></div>`;diaPrevio=d;prev=null;}
    const sig=todos[i+1];
    const mismoQueAntes=prev&&prev.senderId===m.senderId&&(new Date(m.at)-new Date(prev.at))<5*60e3;
    const mismoQueSigue=sig&&sig.senderId===m.senderId&&dia(sig.at)===d&&(new Date(sig.at)-new Date(m.at))<5*60e3;
    const nombre=t.kind==='area'&&!m.mine&&!mismoQueAntes?`<b class="ms-from" style="color:${tono(m.senderName)}">${esc(m.senderName)}</b>`:'';
    const contenido=m.deleted?`<span class="ms-text ms-borrado">${svg('basura')}Se eliminó este mensaje</span>`
      :`${citaHtml(m.replyTo)}${adjuntoHtml(m)}${m.body?`<span class="ms-text">${cuerpoHtml(m)}</span>`:''}`;
    const editado=m.editedAt&&!m.deleted?'<i class="ms-edited">Editado</i>':'';
    html+=`<div class="ms-row ${m.mine?'mine':'theirs'}${mismoQueSigue?' tight':''}${m.mentionsMe?' mentioned':''}"><div class="ms-bubble${m.estado==='error'?' failed':''}${m.attachment&&!m.body?' solo-foto':''}"${m.id&&!m.deleted?` data-msg="${esc(m.id)}"`:''}${m.id?` id="msg-${esc(m.id)}"`:''}>${nombre}${contenido}<span class="ms-meta">${editado}${esc(hora(m.at))}${m.mine?palomitas(m):''}</span></div>${m.estado==='error'?`<button type="button" class="ms-retry" data-retry="${esc(m.clientKey)}">No se envió · Reintentar</button>`:''}</div>`;
    prev=m;
  });
  const mios=todos.filter(m=>m.mine&&!m.estado);
  const ultimoMio=mios.at(-1);
  if(t.kind==='area'&&ultimoMio&&ultimoMio===todos.at(-1)){
    const n=leidoPor(ultimoMio).length;
    if(n)html+=`<div class="ms-seen" id="msSeen">Visto por ${n}</div>`;
  }
  box.innerHTML=html;
  box.querySelectorAll('[data-retry]').forEach(b=>b.addEventListener('click',()=>{
    const p=state.pending.find(x=>x.clientKey===b.dataset.retry);if(p){p.estado='enviando';pintaMensajes(true);manda(p);}
  }));
  firmaFotos(box);
  if(abajo)sc.scrollTop=sc.scrollHeight;
}
function pintaPalomitas(){pintaMensajes(true);}

/* Fotos del chat: URL firmada por el caché compartido; Storage sólo la da a
   quien está en el chat (tanneros_chat_file_read). */
function firmaFotos(box){
  box.querySelectorAll('img[data-firmar]').forEach(img=>{
    const p=img.dataset.firmar;img.removeAttribute('data-firmar');
    getSignedPhotoUrl(supabase,BUCKET,p).then(u=>{if(u)img.src=u;else throw 0;}).catch(()=>{img.closest('.ms-foto')?.classList.add('rota');});
  });
}
async function abreAdjunto(path,nombre){
  if(!path)return;
  // La ventana se abre en el mismo toque (iPhone bloquea las que llegan después).
  const w=window.open('','_blank');
  try{const u=await getRawSignedPhotoUrl(supabase,BUCKET,path);if(!u)throw new Error('No tienes acceso a ese archivo.');if(w)w.location.href=u;else location.href=u;}
  catch(e){w?.close();await window.tosAlert?.({kicker:'MENSAJES',title:`No se pudo abrir ${nombre||'el archivo'}`,message:amable(e)});}
}
function clicEnMensajes(e){
  const ab=e.target.closest('[data-abrir]');if(ab){abreAdjunto(ab.dataset.abrir,ab.dataset.nombre);return;}
  const ir=e.target.closest('.ms-quote[data-ir]');if(ir){irAMensaje(ir.dataset.ir);return;}
  if(e.target.closest('a,button'))return;
  const b=e.target.closest('.ms-bubble[data-msg]');if(b)hojaMensaje(b.dataset.msg);
}
function irAMensaje(id){
  const el=document.getElementById(`msg-${id}`);
  if(!el){window.tosAlert?.({kicker:'MENSAJES',title:'Ese mensaje es más viejo',message:'Sólo se muestran los últimos 80 mensajes del chat.'});return;}
  el.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});
  el.classList.remove('flash');void el.offsetWidth;el.classList.add('flash');
}
const mensajePorId=id=>(state.thread?.messages||[]).find(m=>m.id===id);

/* Acciones de un mensaje: tocarlo (o clic derecho) abre la hoja. */
function hojaMensaje(id){
  const m=mensajePorId(id);if(!m||m.deleted)return;
  const fijado=state.thread?.thread?.pinned?.id===id;
  const ops=[['responder','responder','Responder'],m.body?['copiar','copiar','Copiar texto']:null,
    ['fijar','pin',fijado?'Quitar de fijado':'Fijar en el chat'],
    puedeEditar(m)?['editar','lapiz','Editar']:null,
    m.mine?['borrar','basura','Eliminar para todos']:null].filter(Boolean);
  abreHoja(`<header class="ms-sheet-head"><h2 id="msSheetTitle">Mensaje</h2><button type="button" class="ms-close" data-cerrar aria-label="Cerrar">✕</button></header><blockquote class="ms-preview">${m.body?esc(m.body.slice(0,200)):m.attachment?esc(m.attachment.name):''}</blockquote><div class="ms-acciones">${ops.map(([k,i,l])=>`<button type="button" data-op="${k}"${k==='borrar'?' class="peligro"':''}>${svg(i)}${l}</button>`).join('')}</div>`);
  $('msSheetBody').querySelector('.ms-acciones').addEventListener('click',async e=>{
    const op=e.target.closest('[data-op]')?.dataset.op;if(!op)return;
    if(op==='responder'){cierraHoja();state.editando=null;state.respondiendo=m;pintaContexto();$('msTexto')?.focus();return;}
    if(op==='copiar'){try{await navigator.clipboard.writeText(m.body);}catch(_){}cierraHoja();return;}
    if(op==='fijar'){cierraHoja();fija(fijado?null:id);return;}
    if(op==='editar'){cierraHoja();state.respondiendo=null;state.editando=m;const ta=$('msTexto');ta.value=m.body;ta.dispatchEvent(new Event('input'));pintaContexto();ta.focus();return;}
    if(op==='borrar'){
      const ok=await window.tosConfirm?.({kicker:'MENSAJES',title:'¿Eliminar para todos?',message:'Nadie del chat lo va a volver a ver.',confirmText:'Sí, eliminar',danger:true});
      if(!ok)return;cierraHoja();
      try{await rpc('v2_chat_delete',{organization_id:org,message_id:id});Object.assign(m,{deleted:true,body:'',attachment:null});pintaMensajes(true);cargaChat(false);}
      catch(err){await window.tosAlert?.({kicker:'MENSAJES',title:'No se eliminó',message:amable(err)});}
    }
  });
}
async function fija(id){
  try{await rpc('v2_chat_pin',{organization_id:org,thread_id:state.threadId,message_id:id});await cargaChat(false);pintaFijado();}
  catch(e){await window.tosAlert?.({kicker:'MENSAJES',title:'No se pudo fijar',message:amable(e)});}
}
function pintaFijado(){
  const box=$('msPin');if(!box)return;
  const p=state.thread?.thread?.pinned;
  box.innerHTML=p?`<div class="ms-pinbar"><button type="button" class="ms-pin-ir" data-ir="${esc(p.id)}">${svg('pin')}<span><b>Fijado${p.pinnedBy?` por ${esc(String(p.pinnedBy).split(/\s+/)[0])}`:''}</b><span>${p.body?esc(p.body):p.attachment?esc(p.attachment.name):''}</span></span></button><button type="button" class="ms-pin-x" data-desfijar aria-label="Quitar de fijado">${svg('x')}</button></div>`:'';
}

/* Responder citando / editando: la barrita arriba de la caja. */
function pintaContexto(){
  const box=$('msContexto');if(!box)return;
  const r=state.respondiendo,ed=state.editando;
  box.innerHTML=r?`<div class="ms-ctx">${svg('responder')}<span><b>Respondiendo a ${esc(r.mine?'ti':r.senderName)}</b><span>${r.body?esc(r.body.slice(0,120)):r.attachment?esc(r.attachment.name):''}</span></span><button type="button" data-cancela aria-label="Cancelar respuesta">${svg('x')}</button></div>`
    :ed?`<div class="ms-ctx edit">${svg('lapiz')}<span><b>Editando tu mensaje</b><span>Tienes 15 minutos desde que lo mandaste</span></span><button type="button" data-cancela aria-label="Cancelar edición">${svg('x')}</button></div>`:'';
  box.querySelector('[data-cancela]')?.addEventListener('click',cancelaContexto);
}
function cancelaContexto(){
  const eraEdicion=!!state.editando;state.respondiendo=null;state.editando=null;pintaContexto();
  if(eraEdicion){const ta=$('msTexto');ta.value='';ta.dispatchEvent(new Event('input'));}
}
async function guardaEdicion(cuerpo){
  const m=state.editando;state.editando=null;pintaContexto();
  const body=String(cuerpo||'').trim();if(!m||!body||body===m.body)return;
  const antes=m.body;Object.assign(m,{body,editedAt:new Date().toISOString()});pintaMensajes(true);
  try{const n=await rpc('v2_chat_edit',{organization_id:org,message_id:m.id,body});Object.assign(m,n);pintaMensajes(true);}
  catch(e){m.body=antes;m.editedAt=null;pintaMensajes(true);await window.tosAlert?.({kicker:'MENSAJES',title:'No se editó',message:amable(e)});}
}

/* Sugerencias: "@" en un chat de área y "/" para respuestas rápidas. */
function cierraSugerencias(){const b=$('msSugiere');if(b){b.classList.add('hidden');b.innerHTML='';}}
function muestraSugerencias(items,elige){
  const box=$('msSugiere');if(!items.length){cierraSugerencias();return;}
  box.innerHTML=items.map((it,i)=>`<button type="button" role="option" aria-selected="${i===0}" data-i="${i}">${it.html}</button>`).join('');
  box.classList.remove('hidden');
  box.onclick=e=>{const b=e.target.closest('[data-i]');if(b){elige(items[Number(b.dataset.i)]);cierraSugerencias();}};
  box.onmousedown=e=>e.preventDefault();
}
async function sugerencias(){
  const ta=$('msTexto'),t=state.thread?.thread;if(!ta||!t)return;
  const q=atajoEnCurso(ta.value);
  if(q!=null){
    const lista=filtraRapidas(await rapidas(),q);
    muestraSugerencias(lista.map(r=>({...r,html:`<b>/${esc(r.shortcut)}</b><span>${esc(r.body)}</span>`})),r=>{ta.value=r.body;ta.dispatchEvent(new Event('input'));ta.focus();});
    return;
  }
  const en=t.kind==='area'?mencionEnCurso(ta.value,ta.selectionStart):null;
  if(en){
    const lista=candidatosDeMencion(t.members,en.q,state.inbox?.me?.userId);
    muestraSugerencias(lista.map(p=>({...p,html:`<span class="ms-av" style="background:${tono(p.name)}" aria-hidden="true">${esc(iniciales(p.name))}</span><span><strong>${esc(p.name)}</strong><small>${esc(p.role||'')}</small></span>`})),p=>{
      const r=insertaMencion(ta.value,ta.selectionStart,p.name);ta.value=r.texto;ta.focus();ta.setSelectionRange(r.cursor,r.cursor);ta.dispatchEvent(new Event('input'));cierraSugerencias();});
    return;
  }
  cierraSugerencias();
}

/* Respuestas rápidas: las tuyas, o unas sugeridas si aún no guardas ninguna. */
async function rapidas(){
  if(state.rapidas)return state.rapidas;
  try{state.rapidas=await rpc('v2_chat_quick_replies',{organization_id:org})||[];}catch(_){state.rapidas=[];}
  return state.rapidas;
}
async function hojaRapidas(){
  const mias=await rapidas(),sugeridas=!mias.length;
  const lista=sugeridas?RAPIDAS_SUGERIDAS:mias;
  abreHoja(`<header class="ms-sheet-head"><h2 id="msSheetTitle">Respuestas rápidas</h2><button type="button" class="ms-close" data-cerrar aria-label="Cerrar">✕</button></header><p class="ms-hint-sm">${sugeridas?'Todavía no guardas ninguna: estas son sugeridas. Tócala para usarla o guárdala como tuya.':'Tócala para usarla. En el chat también puedes escribir / y el atajo.'}</p><div class="ms-rapidas" id="msListaRapidas">${lista.map((r,i)=>`<div class="ms-rapida"><button type="button" class="ms-rapida-usa" data-usa="${i}"><b>/${esc(r.shortcut)}</b><span>${esc(r.body)}</span></button>${sugeridas?`<button type="button" class="ms-mini" data-guarda="${i}">Guardar</button>`:`<button type="button" class="ms-mini" data-edita="${i}">Editar</button>`}</div>`).join('')}</div><form id="msRapidaForm" class="ms-form ms-rapida-form"><input type="hidden" id="msRapId"><label>Atajo<input id="msRapAtajo" maxlength="25" placeholder="gracias" autocapitalize="off" autocomplete="off" required></label><label>Respuesta<textarea id="msRapCuerpo" rows="3" maxlength="1000" required></textarea></label><div id="msRapError" class="ms-error hidden" role="alert"></div><div class="ms-fila"><button type="submit" class="ms-primary">Guardar respuesta</button><button type="button" id="msRapBorrar" class="ms-secundario peligro hidden">Eliminar</button></div></form>`);
  const ta=$('msTexto');
  $('msListaRapidas').addEventListener('click',e=>{
    const u=e.target.closest('[data-usa]');if(u){const r=lista[Number(u.dataset.usa)];cierraHoja();if(ta){ta.value=r.body;ta.dispatchEvent(new Event('input'));ta.focus();}return;}
    const g=e.target.closest('[data-guarda],[data-edita]');if(!g)return;
    const r=lista[Number(g.dataset.guarda??g.dataset.edita)];
    $('msRapId').value=g.dataset.edita!=null?r.id:'';$('msRapAtajo').value=r.shortcut;$('msRapCuerpo').value=r.body;
    $('msRapBorrar').classList.toggle('hidden',g.dataset.edita==null);$('msRapAtajo').focus();
  });
  $('msRapBorrar').addEventListener('click',async()=>{
    try{await rpc('v2_chat_quick_reply_delete',{organization_id:org,id:$('msRapId').value});state.rapidas=null;hojaRapidas();}
    catch(err){$('msRapError').textContent=amable(err);$('msRapError').classList.remove('hidden');}
  });
  $('msRapidaForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const atajo=$('msRapAtajo').value.trim().toLowerCase().replace(/^\//,''),cuerpo=$('msRapCuerpo').value.trim();
    if(!atajoValido(atajo)){$('msRapError').textContent='El atajo va en minúsculas, sin espacios ni acentos (ej. gracias).';$('msRapError').classList.remove('hidden');return;}
    try{await rpc('v2_chat_quick_reply_save',{organization_id:org,id:$('msRapId').value||null,shortcut:atajo,body:cuerpo});state.rapidas=null;hojaRapidas();}
    catch(err){$('msRapError').textContent=amable(err);$('msRapError').classList.remove('hidden');}
  });
}

/* Silenciar: deja de sonar en el celular; una @mención sí te llega. */
function hojaSilencio(){
  const t=state.thread?.thread;if(!t)return;
  const hasta=t.mutedUntil&&new Date(t.mutedUntil).getFullYear()<9000?` hasta ${fechaHora(t.mutedUntil)}`:'';
  abreHoja(`<header class="ms-sheet-head"><h2 id="msSheetTitle">${t.mutedUntil?'Chat silenciado':'Silenciar chat'}</h2><button type="button" class="ms-close" data-cerrar aria-label="Cerrar">✕</button></header><p class="ms-hint-sm">${t.mutedUntil?`No te suena${esc(hasta)}. Si alguien te menciona con @, sí te llega.`:'No te sonará el celular con este chat. Si alguien te menciona con @, sí te llega.'}</p><div class="ms-acciones">${t.mutedUntil?`<button type="button" data-silencio="">${svg('campana')}Activar sonido</button>`:SILENCIOS.map(o=>`<button type="button" data-silencio="${o.clave}">${svg('mudo')}${o.label}</button>`).join('')}</div>`);
  $('msSheetBody').querySelector('.ms-acciones').addEventListener('click',async e=>{
    const b=e.target.closest('[data-silencio]');if(!b)return;
    const until=b.dataset.silencio?silencioHasta(b.dataset.silencio):null;
    try{await rpc('v2_chat_mute',{organization_id:org,thread_id:state.threadId,until});
      t.mutedUntil=until;cierraHoja();pintaCabeza();
      const fila=(state.inbox?.threads||[]).find(x=>x.id===state.threadId);if(fila){fila.muted=!!until;pintaItems();pintaConteos();}}
    catch(err){await window.tosAlert?.({kicker:'MENSAJES',title:'No se pudo',message:amable(err)});}
  });
}

/* Buscar dentro del chat. */
async function buscaEnHilo(q){
  const box=$('msHallazgos');if(!box)return;
  if(String(q).trim().length<2){box.innerHTML='';return;}
  let r;try{r=await rpc('v2_chat_search',{organization_id:org,thread_id:state.threadId,q});}
  catch(e){box.innerHTML=`<p class="ms-hint-sm">${esc(amable(e))}</p>`;return;}
  box.innerHTML=r.length?r.map(m=>`<button type="button" class="ms-hallazgo" data-ir="${esc(m.id)}"><span><b>${esc(m.mine?'Tú':m.senderName)}</b><time>${esc(cuando(m.at))}</time></span><span>${m.body?esc(m.body.slice(0,140)):m.attachment?esc(m.attachment.name):''}</span></button>`).join('')
    :'<p class="ms-hint-sm">Nada con eso en este chat.</p>';
}

/* ---------- Enviar ---------- */
async function enviar(cuerpo){
  const body=String(cuerpo||'').trim();if(!body||!state.threadId)return;
  const t=state.thread?.thread,yo=state.inbox?.me?.userId;
  const r=state.respondiendo;state.respondiendo=null;pintaContexto();
  const p={clientKey:llave(),body,at:new Date().toISOString(),mine:true,senderId:yo,estado:'enviando',threadId:state.threadId,
    replyTo:r?{id:r.id,senderName:r.senderName,body:r.body,attachment:r.attachment?.name,kind:r.attachment?.kind}:null,
    mentions:t?.kind==='area'?mencionados(body,t.members,yo):[]};
  state.pending.push(p);pintaMensajes(false);
  manda(p);
}
// Fotos y archivos (h20): la foto se achica antes de subir; el resto va tal cual.
async function adjunta(file){
  const problema=problemaConArchivo(file);
  if(problema){await window.tosAlert?.({kicker:'MENSAJES',title:'No se puede mandar',message:problema});return;}
  const r=state.respondiendo;state.respondiendo=null;pintaContexto();
  const p={clientKey:llave(),body:'',at:new Date().toISOString(),mine:true,senderId:state.inbox?.me?.userId,estado:'enviando',threadId:state.threadId,
    file,replyTo:r?{id:r.id,senderName:r.senderName,body:r.body}:null,mentions:[],
    attachment:{name:file.name,size:file.size,kind:/^image\//.test(file.type)?'image':'file',local:/^image\//.test(file.type)?URL.createObjectURL(file):null}};
  state.pending.push(p);pintaMensajes(false);
  manda(p);
}
async function preparaArchivo(file){
  if(/^image\/(jpeg|png|webp|heic)$/.test(file.type)){
    try{
      const {encodeVariant}=await import('/v2/image-encode.js');
      const img=await new Promise((ok,no)=>{const u=URL.createObjectURL(file),i=new Image();i.onload=()=>{URL.revokeObjectURL(u);ok(i);};i.onerror=()=>{URL.revokeObjectURL(u);no(new Error('foto'));};i.src=u;});
      const v=await encodeVariant(img,1600,.82,1200*1024);
      return {blob:v.blob,ext:v.ext,mime:v.mime,w:img.naturalWidth,h:img.naturalHeight};
    }catch(_){/* si el navegador no la puede leer, va el original */}
  }
  return {blob:file,ext:extensionDe(file.name,file.type),mime:file.type||'application/octet-stream'};
}
async function sube(p){
  if(p.subido)return p.subido;
  const prep=await preparaArchivo(p.file);
  const path=rutaDeArchivo(org,p.threadId,llave(),prep.ext);
  const {error}=await supabase.storage.from(BUCKET).upload(path,prep.blob,{contentType:prep.mime,upsert:false,cacheControl:UPLOAD_CACHE_CONTROL});
  if(error)throw error;
  p.subido={path,name:p.file.name,mime:prep.mime,size:prep.blob.size,w:prep.w||null,h:prep.h||null};
  return p.subido;
}
async function manda(p){
  try{
    const attachment=p.file?await sube(p):null;
    const m=await rpc('v2_chat_enviar',{organization_id:org,thread_id:p.threadId,body:p.body,client_key:p.clientKey,
      reply_to:p.replyTo?.id||null,attachment,mentions:p.mentions?.length?p.mentions:null});
    state.pending=state.pending.filter(x=>x!==p);
    if(p.attachment?.local)setTimeout(()=>URL.revokeObjectURL(p.attachment.local),60e3);
    if(state.threadId===p.threadId&&state.thread){
      if(!state.thread.messages.some(x=>x.id===m.id))state.thread.messages.push(m);
      state.huella=huellaDelHilo(state.thread);
      pintaMensajes(true);
    }
    const t=(state.inbox?.threads||[]).find(x=>x.id===p.threadId);
    if(t){t.last={body:m.body||(m.attachment?.kind==='image'?'Foto':`Archivo: ${m.attachment?.name||''}`),mine:true,at:m.at,senderName:m.senderName};
      state.inbox.threads=[t,...state.inbox.threads.filter(x=>x!==t)];pintaItems();}
  }catch(e){
    p.estado='error';p.error=amable(e);
    if(state.threadId===p.threadId)pintaMensajes(true);
  }
}

/* ---------- Hojas: nuevo chat y nuevo aviso ---------- */
function abreHoja(html){
  $('msSheetBody').innerHTML=html;
  $('msSheet').classList.remove('hidden');$('msSheetBackdrop').classList.remove('hidden');
  $('msSheetBody').querySelector('[data-cerrar]')?.addEventListener('click',cierraHoja);
}
function cierraHoja(){$('msSheet').classList.add('hidden');$('msSheetBackdrop').classList.add('hidden');}
function hojaNuevo(){
  const gente=state.inbox?.people||[];
  const pinta=q=>gente.filter(p=>!q||`${p.name} ${p.role}`.toLowerCase().includes(q.toLowerCase()))
    .map(p=>`<button type="button" class="ms-person" data-user="${esc(p.userId)}"><span class="ms-av" style="background:${tono(p.name)}" aria-hidden="true">${esc(iniciales(p.name))}</span><span><strong>${esc(p.name)}</strong><small>${esc(p.role||'')}</small></span></button>`).join('')||'<div class="ms-vacio">No encontré a nadie.</div>';
  abreHoja(`<header class="ms-sheet-head"><h2 id="msSheetTitle">Nuevo chat</h2><button type="button" class="ms-close" data-cerrar aria-label="Cerrar">✕</button></header><label class="ms-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input id="msGente" type="search" placeholder="¿Con quién?" autocomplete="off"></label><div class="ms-people" id="msPeople">${pinta('')}</div>`);
  const box=$('msPeople');
  $('msGente').addEventListener('input',e=>{box.innerHTML=pinta(e.target.value);});
  box.addEventListener('click',async e=>{
    const b=e.target.closest('[data-user]');if(!b)return;
    b.disabled=true;
    try{
      const id=await rpc('v2_chat_open_direct',{organization_id:org,user_id:b.dataset.user});
      cierraHoja();await cargaInbox();await abreChat(id);
    }catch(err){b.disabled=false;await window.tosAlert?.({kicker:'MENSAJES',title:'No se pudo abrir el chat',message:amable(err)});}
  });
  if(!esTactil)$('msGente').focus();
}
function hojaAviso(){
  const roles=[...new Set((state.inbox?.people||[]).map(p=>p.role).filter(Boolean))].sort();
  abreHoja(`<header class="ms-sheet-head"><h2 id="msSheetTitle">Nuevo aviso</h2><button type="button" class="ms-close" data-cerrar aria-label="Cerrar">✕</button></header><form id="msAvisoForm" class="ms-form"><label>Título<input id="msAvTitulo" maxlength="140" required placeholder="El sábado no hay entrenamiento"></label><label>Mensaje <i>(opcional)</i><textarea id="msAvCuerpo" rows="4" maxlength="1000"></textarea></label><label>Para<select id="msAvPara"><option value="club">Todo el staff del club</option><optgroup label="Familias (portal y celular)"><option value="familias">Todas las familias</option>${(state.avisos?.categorias||[]).map(c=>`<option value="categoria:${esc(c)}">Familias de ${esc(c)}</option>`).join('')}</optgroup><optgroup label="Un área">${roles.map(r=>`<option value="role:${esc(r)}">${esc(r)}</option>`).join('')}</optgroup><optgroup label="Una persona">${(state.inbox?.people||[]).map(p=>`<option value="user:${esc(p.userId)}">${esc(p.name)}${p.role?` · ${esc(p.role)}`:''}</option>`).join('')}</optgroup></select></label><fieldset class="ms-cuando"><legend>Cuándo</legend><label class="ms-opcion"><input type="radio" name="msAvCuando" value="ahora" checked> Ahora</label><label class="ms-opcion"><input type="radio" name="msAvCuando" value="programar"> Programar</label><input id="msAvFecha" type="datetime-local" class="hidden" aria-label="Día y hora en que sale el aviso"></fieldset><p class="ms-hint-sm" id="msAvHint">Lo verán en Mensajes › Avisos y en su celular si activaron notificaciones. Tú verás cuántos ya lo vieron.</p><div id="msAvError" class="ms-error hidden" role="alert"></div><button type="submit" class="ms-primary">Publicar aviso</button></form>`);
  // Programar (h20): sale a la hora elegida; antes sólo lo ves tú (y Presidencia).
  const fecha=$('msAvFecha'),boton=()=>$('msAvisoForm').querySelector('button[type=submit]');
  $('msAvisoForm').querySelectorAll('[name=msAvCuando]').forEach(r=>r.addEventListener('change',()=>{
    const prog=$('msAvisoForm').querySelector('[name=msAvCuando]:checked').value==='programar';
    fecha.classList.toggle('hidden',!prog);
    if(prog&&!fecha.value){const d=new Date(Date.now()+864e5);d.setHours(8,0,0,0);fecha.value=valorLocal(d);}
    boton().textContent=prog?'Programar aviso':'Publicar aviso';
  }));
  $('msAvPara').addEventListener('change',()=>{const f=/^(familias|categoria:)/.test($('msAvPara').value);
    $('msAvHint').textContent=f?'Lo verán las familias en el Inicio de su portal y en su celular si activaron avisos. Tú verás cuántas ya lo vieron.':'Lo verán en Mensajes › Avisos y en su celular si activaron notificaciones. Tú verás cuántos ya lo vieron.';});
  $('msAvisoForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const btn=e.submitter||$('msAvisoForm').querySelector('button[type=submit]');btn.disabled=true;
    const para=$('msAvPara').value;
    let starts=null;
    if($('msAvisoForm').querySelector('[name=msAvCuando]:checked')?.value==='programar'){
      const v=validaProgramado(fecha.value);
      if(v.error){$('msAvError').textContent=v.error;$('msAvError').classList.remove('hidden');btn.disabled=false;return;}
      starts=v.iso;
    }
    try{
      await rpc('v2_publish_announcement',{organization_id:org,title:$('msAvTitulo').value.trim(),body:$('msAvCuerpo').value.trim()||null,starts_at:starts,
        audience_type:para==='club'?'club':para==='familias'?'familias':para.startsWith('categoria:')?'categoria':para.startsWith('user:')?'user':'role',
        audience_value:para==='club'||para==='familias'?null:para.slice(para.indexOf(':')+1)});
      cierraHoja();state.tab='avisos';await cargaAvisos();pintaLista();
    }catch(err){$('msAvError').textContent=amable(err);$('msAvError').classList.remove('hidden');btn.disabled=false;}
  });
}
$('msSheetBackdrop').addEventListener('click',cierraHoja);
document.addEventListener('keydown',e=>{if(e.key==='Escape')cierraHoja();});

/* ---------- Arranque ---------- */
await cargaInbox();
// Botón flotante (19/10/2026): el aviso ya abre con el destinatario elegido.
// Los avisos sólo se ofrecen a quien puede publicarlos.
function avisoPara(elige){
  hojaAviso();
  const sel=$('msAvPara');if(!sel)return;
  const op=[...sel.options].find(elige);
  if(op){sel.value=op.value;sel.dispatchEvent(new Event('change'));}
  (op&&op.value.startsWith('categoria:')?sel:$('msAvTitulo'))?.focus();
}
const avisosListos=cargaAvisos();
avisosListos.then(()=>{
  const puede=!!state.avisos?.canPublish;
  setAccionesDePantalla([
    ...(puede?[{clave:'aviso-familias',label:'Aviso a todas las familias',sub:'Les llega al portal y al celular',icon:'chat',run:()=>avisoPara(o=>o.value==='familias')},
               {clave:'aviso-categoria',label:'Aviso a una categoría',sub:'Sólo a las familias de esa categoría',icon:'chat',run:()=>avisoPara(o=>o.value.startsWith('categoria:'))}]:[]),
    {clave:'mensaje-staff',label:'Mensaje al staff',sub:'Un chat con alguien del club',icon:'chat',run:hojaNuevo}
  ]);
});
setShellHealth({state:'ok',label:'Vestidor'});
const pedido=new URLSearchParams(location.search).get('chat');
{const t=new URLSearchParams(location.search).get('tab');
 if(t==='avisos'||t==='chats')cambiaTab(t);
 else if(!pedido)avisosListos.then(()=>{if(state.tab==='chats'&&!conteos().chats&&conteos().avisos)cambiaTab('avisos');else pintaConteos();});}
if(pedido&&(state.inbox?.threads||[]).some(t=>t.id===pedido))abreChat(pedido);
state.inboxTimer=setInterval(()=>{if(document.visibilityState==='visible')cargaInbox();},12000);
// La campana abre la pestaña donde está lo nuevo (antes, siempre Avisos).
window.addEventListener('tos:campana',()=>{$('msBody').dataset.view='list';cambiaTab(pestanaConNuevo());});
window.addEventListener('tos:pulso',e=>{pulsoConteos={chats:Number(e.detail?.chats||0),avisos:Number(e.detail?.avisos||0)};
  if(state.tab==='chats')cargaInbox();
  if(Number(e.detail?.avisos||0)>conteos().avisos&&state.tab!=='avisos')cargaAvisos();
  pintaConteos();});
