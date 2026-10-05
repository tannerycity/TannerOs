import {bootstrapProtectedShell,rpc,$,setShellHealth} from '/v2/shell.js';

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
const state={tab:'chats',inbox:null,avisos:null,thread:null,threadId:null,busca:'',pending:[],timer:null,inboxTimer:null};
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
  reloj:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
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
    app.innerHTML=`<aside class="ms-list"><header class="ms-list-head"><h1>Mensajes</h1><button id="msNuevo" class="ms-icon-btn" type="button" aria-label="Nuevo chat" title="Nuevo chat"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button></header><nav class="ms-seg" role="tablist"><button type="button" role="tab" data-tab="chats">Chats</button><button type="button" role="tab" data-tab="avisos">Avisos</button></nav><label class="ms-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input id="msBusca" type="search" placeholder="Buscar" autocomplete="off" aria-label="Buscar chats"></label><div id="msPush"></div><div id="msItems" class="ms-items"></div></aside><section id="msChat" class="ms-chat"><div class="ms-chat-empty"><span aria-hidden="true">${svg('chat')}</span><strong>El vestidor del club</strong><small>Elige un chat o empieza uno nuevo. Lo que se diga aquí se queda en el club.</small></div></section>`;
    app.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>cambiaTab(b.dataset.tab)));
    $('msNuevo').addEventListener('click',()=>state.tab==='avisos'?hojaAviso():hojaNuevo());
    $('msBusca').addEventListener('input',e=>{state.busca=e.target.value;pintaItems();});
    $('msItems').addEventListener('click',e=>{
      const b=e.target.closest('[data-thread]');if(b)abreChat(b.dataset.thread);
    });
  }
  app.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===state.tab)));
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
    const n=Number(t.unread||0);
    return `<button type="button" class="ms-item${t.id===state.threadId?' on':''}${n?' unread':''}" data-thread="${esc(t.id)}">${avatar(t)}<span class="ms-item-main"><span class="ms-item-top"><strong>${esc(t.title||'Chat')}</strong><time>${esc(cuando(t.last?.at))}</time></span><span class="ms-item-bottom"><span class="ms-prev">${ult}</span>${n?`<b class="ms-count">${n>99?'99+':n}</b>`:''}</span></span></button>`;
  };
  const directos=lista.filter(t=>t.kind==='direct'||t.last),areas=lista.filter(t=>t.kind==='area'&&!t.last);
  box.innerHTML=(directos.length?directos.map(fila).join(''):'')
    +(areas.length?`<p class="ms-sec">Áreas del club</p>${areas.map(fila).join('')}`:'')
    +(!lista.length?`<div class="ms-vacio">${q?'Nada con ese nombre.':'Sin chats todavía.'}</div>`:'');
}
function pintaAvisos(box){
  const d=state.avisos;
  if(!d){box.innerHTML='<div class="ms-vacio">Cargando avisos…</div>';return;}
  const lista=d.avisos||[];
  box.innerHTML=(d.canPublish?`<button type="button" class="ms-aviso-nuevo" id="msAvisoNuevo">＋ Nuevo aviso para el club</button>`:'')
    +(lista.length?lista.map(a=>`<article class="ms-aviso${a.unread?' unread':''}"><header><strong>${esc(a.title)}</strong><time>${esc(cuando(a.publishedAt))}</time></header>${a.body?`<p>${texto(a.body)}</p>`:''}<footer><span>${esc(a.author||'')} · ${a.audienceType==='club'?'Todo el club':a.audienceType==='role'?esc(a.audienceValue):`Para ${esc((state.inbox?.people||[]).find(p=>p.userId===a.audienceValue)?.name||'ti')}`}</span>${a.reach?`<b class="ms-visto" title="Personas que ya lo vieron">Visto por ${a.reach.seen} de ${a.reach.total}</b>`:''}</footer></article>`).join('')
      :`<div class="ms-vacio">${esc(d.error||'Sin avisos. Cuando Presidencia publique uno, aparece aquí.')}</div>`);
  $('msAvisoNuevo')?.addEventListener('click',hojaAviso);
}
function cambiaTab(tab){
  state.tab=tab;pintaLista();
  if(tab==='avisos'){
    cargaAvisos().then(()=>rpc('v2_mark_announcements_seen',{organization_id:org}).catch(()=>{}));
  }
}

/* ---------- Conversación ---------- */
async function abreChat(id,{silencioso=false}={}){
  if(state.threadId!==id){state.thread=null;state.pending=[];}
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
  const antes=state.thread?.messages?.length||0,ultimoAntes=state.thread?.messages?.at(-1)?.id;
  state.thread=d;
  const ultimo=d.messages.at(-1);
  const nuevos=primera||ultimo?.id!==ultimoAntes;
  if(primera)pintaChat();else if(nuevos||d.messages.length!==antes)pintaMensajes(true);else pintaPalomitas();
  // Leí lo que había: se avisa al servidor y la lista se pone al día.
  if(nuevos&&ultimo&&!ultimo.mine||primera){
    rpc('v2_chat_mark_read',{organization_id:org,thread_id:id}).then(()=>{
      const t=(state.inbox?.threads||[]).find(x=>x.id===id);if(t){t.unread=0;pintaItems();}
    }).catch(()=>{});
  }
}
function infoDe(){
  const t=state.thread?.thread;if(!t)return '';
  if(t.kind==='direct'){const o=(t.members||[]).find(m=>m.userId!==state.inbox?.me?.userId);return o?.role||'';}
  const n=(t.members||[]).length;return `${n} ${n===1?'persona':'personas'}`;
}
function pintaChat(){
  const t=state.thread.thread;
  $('msChat').innerHTML=`<header class="ms-chat-head"><button type="button" class="ms-back" id="msBack" aria-label="Regresar a los chats"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg><span>Chats</span></button>${avatar({...t,title:t.title})}<span class="ms-chat-title"><strong>${esc(t.title||'Chat')}</strong><small id="msInfo">${esc(infoDe())}</small></span></header><div class="ms-scroll" id="msScroll"><div class="ms-msgs" id="msMsgs"></div></div><form class="ms-composer" id="msForm"><textarea id="msTexto" rows="1" maxlength="4000" placeholder="Mensaje" aria-label="Escribe un mensaje" enterkeyhint="send"></textarea><button type="submit" id="msEnviar" class="ms-send" aria-label="Enviar" disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg></button></form>`;
  $('msBack').addEventListener('click',()=>{$('msBody').dataset.view='list';state.threadId=null;clearInterval(state.timer);history.replaceState(null,'','/mensajes/');pintaItems();cargaInbox();});
  const ta=$('msTexto'),btn=$('msEnviar');
  const crece=()=>{ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,140)+'px';btn.disabled=!ta.value.trim();};
  ta.addEventListener('input',crece);
  ta.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!esTactil){e.preventDefault();$('msForm').requestSubmit();}});
  $('msForm').addEventListener('submit',e=>{e.preventDefault();enviar(ta.value);ta.value='';crece();ta.focus();});
  pintaMensajes(false);
  if(!esTactil)ta.focus();
}
function leidoPor(m){
  const t=state.thread?.thread,me=state.inbox?.me?.userId;
  return (t?.members||[]).filter(x=>x.userId!==me&&x.lastReadAt&&new Date(x.lastReadAt)>=new Date(m.at));
}
function palomitas(m){
  if(m.estado==='enviando')return `<span class="ms-tick" title="Enviando">${svg('reloj','ms-clock')}</span>`;
  if(m.estado==='error')return '';
  const t=state.thread?.thread;const lectores=leidoPor(m);
  if(t?.kind==='direct')return `<span class="ms-tick${lectores.length?' read':''}" title="${lectores.length?'Leído':'Enviado'}">✓✓</span>`;
  return `<span class="ms-tick${lectores.length?' read':''}">✓✓</span>`;
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
    html+=`<div class="ms-row ${m.mine?'mine':'theirs'}${mismoQueSigue?' tight':''}"><div class="ms-bubble${m.estado==='error'?' failed':''}">${nombre}<span class="ms-text">${texto(m.body)}</span><span class="ms-meta">${esc(hora(m.at))}${m.mine?palomitas(m):''}</span></div>${m.estado==='error'?`<button type="button" class="ms-retry" data-retry="${esc(m.clientKey)}">No se envió · Reintentar</button>`:''}</div>`;
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
  if(abajo)sc.scrollTop=sc.scrollHeight;
}
function pintaPalomitas(){pintaMensajes(true);}

async function enviar(cuerpo){
  const body=String(cuerpo||'').trim();if(!body||!state.threadId)return;
  const p={clientKey:llave(),body,at:new Date().toISOString(),mine:true,senderId:state.inbox?.me?.userId,estado:'enviando',threadId:state.threadId};
  state.pending.push(p);pintaMensajes(false);
  manda(p);
}
async function manda(p){
  try{
    const m=await rpc('v2_chat_send',{organization_id:org,thread_id:p.threadId,body:p.body,client_key:p.clientKey});
    state.pending=state.pending.filter(x=>x!==p);
    if(state.threadId===p.threadId&&state.thread){
      if(!state.thread.messages.some(x=>x.id===m.id))state.thread.messages.push(m);
      pintaMensajes(true);
    }
    const t=(state.inbox?.threads||[]).find(x=>x.id===p.threadId);
    if(t){t.last={body:m.body,mine:true,at:m.at,senderName:m.senderName};
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
  abreHoja(`<header class="ms-sheet-head"><h2 id="msSheetTitle">Nuevo aviso</h2><button type="button" class="ms-close" data-cerrar aria-label="Cerrar">✕</button></header><form id="msAvisoForm" class="ms-form"><label>Título<input id="msAvTitulo" maxlength="140" required placeholder="El sábado no hay entrenamiento"></label><label>Mensaje <i>(opcional)</i><textarea id="msAvCuerpo" rows="4" maxlength="1000"></textarea></label><label>Para<select id="msAvPara"><option value="club">Todo el club</option><optgroup label="Un área">${roles.map(r=>`<option value="role:${esc(r)}">${esc(r)}</option>`).join('')}</optgroup><optgroup label="Una persona">${(state.inbox?.people||[]).map(p=>`<option value="user:${esc(p.userId)}">${esc(p.name)}${p.role?` · ${esc(p.role)}`:''}</option>`).join('')}</optgroup></select></label><p class="ms-hint-sm">Lo verán en Mensajes › Avisos y en su celular si activaron notificaciones. Tú verás cuántos ya lo vieron.</p><div id="msAvError" class="ms-error hidden" role="alert"></div><button type="submit" class="ms-primary">Publicar aviso</button></form>`);
  $('msAvisoForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const btn=e.submitter||$('msAvisoForm').querySelector('button[type=submit]');btn.disabled=true;
    const para=$('msAvPara').value;
    try{
      await rpc('v2_publish_announcement',{organization_id:org,title:$('msAvTitulo').value.trim(),body:$('msAvCuerpo').value.trim()||null,
        audience_type:para==='club'?'club':para.startsWith('user:')?'user':'role',audience_value:para==='club'?null:para.slice(5)});
      cierraHoja();state.tab='avisos';await cargaAvisos();pintaLista();
    }catch(err){$('msAvError').textContent=amable(err);$('msAvError').classList.remove('hidden');btn.disabled=false;}
  });
}
$('msSheetBackdrop').addEventListener('click',cierraHoja);
document.addEventListener('keydown',e=>{if(e.key==='Escape')cierraHoja();});

/* ---------- Arranque ---------- */
await cargaInbox();
cargaAvisos();
setShellHealth({state:'ok',label:'Vestidor'});
const pedido=new URLSearchParams(location.search).get('chat');
if(pedido&&(state.inbox?.threads||[]).some(t=>t.id===pedido))abreChat(pedido);
state.inboxTimer=setInterval(()=>{if(document.visibilityState==='visible')cargaInbox();},12000);
window.addEventListener('tos:campana',()=>{$('msBody').dataset.view='list';cambiaTab('avisos');});
window.addEventListener('tos:pulso',()=>{if(state.tab==='chats')cargaInbox();});
