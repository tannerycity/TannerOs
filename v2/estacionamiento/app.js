import {bootstrapProtectedShell,rpc,money,$,moduleAccess,setShellHealth} from '/v2/shell.js';

// Estacionamiento como app de caseta. Pedido del club (05/10/2026): que
// cualquiera de administración, sin saber de tecnología, dé un gafete en tres
// toques; primero se paga y luego se entrega, y sin costo sólo con motivo.
//
// Tres pestañas: Caseta (buscar una placa y dar gafetes), Pendientes (lo que
// pidieron las familias desde el portal) y Padrón (la lista completa, filtros,
// impresión y bitácora). El alta, el cobro y la entrega van en un solo
// movimiento del servidor (v2_parking_express): si algo falla no queda nada a
// medias, y el pago se aplica a ESTE gafete, no al adeudo más viejo.
const boot=await bootstrapProtectedShell({active:'estacionamiento',title:'Estacionamiento'});
if(!boot)throw new Error('No access');
const {ctx,navigation}=boot;
const puedeEscribir=moduleAccess(navigation,'estacionamiento',true)||moduleAccess(navigation,'contabilidad',true)||moduleAccess(navigation,'cobranza',true);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TABS=['caseta','pendientes','padron'];
const tabInicial=()=>{try{const t=localStorage.getItem('tos.park.tab');return TABS.includes(t)?t:'caseta';}catch(e){return 'caseta';}};
const state={data:null,tab:tabInicial(),filtro:'vigentes',busca:'',caseta:'',tanners:null,hoja:null};
const TIPO={tanner:'Tanner Pass',vip:'VIP'};
const PORTADOR={familia:'Familia',coach:'Profe',scout:'Visor',staff:'Staff',
  sponsor:'Patrocinador',vendor:'Proveedor',other:'Otro'};
const METODO={cash:'Efectivo',transfer:'Transferencia',card:'Tarjeta'};
const MOTIVOS=['Patrocinio','Staff del club','Profe','Proveedor'];

const ESTADO={requested:'Solicitado',approved:'Autorizado',issued:'Entregado',
  rejected:'Rechazado',revoked:'Cancelado',lost:'Perdido',expired:'Vencido'};
const EVENTO={requested:'Solicitado',approved:'Autorizado',courtesy:'Autorizado como cortesía',
  paid:'Pagado',issued:'Gafete entregado',rejected:'Solicitud rechazada',revoked:'Gafete cancelado',
  lost:'Reportado perdido',expired:'Vencido por temporada'};
const ACTOR={familia:'desde el portal',staff:'por el club',sistema:'automático'};

const nombreDe=p=>p?.player||p?.holder||PORTADOR[p?.holder_kind]||'Sin nombre';
const normPlaca=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const precio=t=>Number(((state.data||{}).prices||{})[t||'tanner']??(state.data||{}).price??0);
const pases=()=>(state.data?.passes||[]);
const llave=()=>`park-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
const quienCobra=()=>($('sidebarName')?.textContent||'').trim()||null;

function fmtFecha(v){
  if(!v)return '';
  const d=new Date(v);
  return Number.isNaN(d.getTime())?String(v)
    :new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(d);
}
const esHoy=v=>{if(!v)return false;const d=new Date(v),h=new Date();return d.toDateString()===h.toDateString();};

// Hoja para el de la caseta: se imprime lo mismo que estás viendo en el
// Padrón, agrupado por tipo de pase y ordenado por placa.
function hojaImpresa(lista,etiqueta,season){
  const hoy=new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'long',year:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date());
  const grupos=Object.keys(TIPO).map(t=>[t,lista.filter(p=>(p.pass_type||'tanner')===t)
    .sort((a,b)=>String(a.plate||'').localeCompare(String(b.plate||''),'es'))]).filter(([,f])=>f.length);
  const bloques=grupos.map(([t,f])=>`<h2>${esc(TIPO[t])} <small>${f.length} ${f.length===1?'gafete':'gafetes'}</small></h2><table class="park-print-table"><thead><tr><th>Placas</th><th>Vehículo</th><th>Portador</th><th>Folio</th><th>Estado</th></tr></thead><tbody>${
    f.map(p=>`<tr><td class="pp-plate">${esc(p.plate||'—')}</td><td>${esc(p.vehicle||'—')}</td><td>${esc(nombreDe(p))}${p.category?`<small> · ${esc(p.category)}</small>`:''}${p.guardian?`<br><small>tutor: ${esc(p.guardian)}</small>`:''}</td><td>${esc(p.folio||'—')}</td><td>${esc(ESTADO[p.status]||p.status||'')}${p.is_courtesy?' · cortesía':''}</td></tr>`).join('')
  }</tbody></table>`).join('');
  return `<header class="park-print-head"><div><strong>Tannery City · Gafetes de estacionamiento</strong><small>${esc(etiqueta)}${season?` · temporada ${esc(String(season))}`:''}</small></div><div class="park-print-meta"><small>${esc(hoy)}</small><small>${lista.length} ${lista.length===1?'gafete':'gafetes'} en la lista</small></div></header>${
    bloques||'<p class="park-print-empty">No hay gafetes en esta lista.</p>'
  }<footer class="park-print-foot">El gafete es personal e intransferible: solo entra el vehículo con estas placas. Si las placas no coinciden con la lista, no se autoriza el acceso.</footer>`;
}

async function load(){
  try{state.data=await rpc('v2_parking_passes',{organization_id:ctx.organization_id,status_filter:null});}
  catch(error){
    $('parkBody').innerHTML=`<div class="tos-empty">${esc(String(error?.message||error))}</div>`;
    return;
  }
  render();
}

/* ---------- Piezas ---------- */
const placa=(v,grande=false)=>`<span class="pk-plate${grande?' big':''}">${esc(v||'SIN PLACAS')}</span>`;
const vigente=p=>['issued','approved'].includes(p.status);
function tarjeta(p,{accion=true}={}){
  const saldo=Number(p.balance||0);
  const sub=[p.holder_kind!=='familia'&&PORTADOR[p.holder_kind],p.category,p.vehicle,p.folio].filter(Boolean).join(' · ');
  const tono=p.status==='issued'?'ok':['requested','approved'].includes(p.status)?'wait':'off';
  const etiqueta=p.status==='issued'?`Vigente${p.is_courtesy?' · sin costo':''}`:p.status==='requested'?'Por cobrar y entregar':p.status==='approved'?(saldo>0?`Debe ${money.format(saldo)}`:'Listo para entregar'):(ESTADO[p.status]||p.status);
  const boton=accion&&puedeEscribir&&['requested','approved'].includes(p.status)
    ?`<button class="pk-go" type="button" data-cobrar="${esc(p.id)}">${p.is_courtesy||(p.status==='approved'&&saldo<=0)?'Entregar':`Cobrar ${esc(money.format(p.status==='approved'?saldo:precio(p.pass_type)))}`}</button>`:'';
  return `<article class="pk-card" data-tone="${tono}"><button class="pk-card-main" type="button" data-detail="${esc(p.id)}">${placa(p.plate)}<span class="pk-who"><strong>${esc(nombreDe(p))}</strong><small>${esc(sub||TIPO[p.pass_type]||'')}</small></span><span class="pk-pill" data-tone="${tono}">${esc(etiqueta)}</span></button>${boton}</article>`;
}

/* ---------- Pestañas ---------- */
function vistaCaseta(){
  const q=state.caseta.trim(),nq=normPlaca(q),lq=q.toLowerCase();
  const pend=pases().filter(p=>['requested','approved'].includes(p.status));
  const hoy=pases().filter(p=>p.status==='issued'&&esHoy(p.issued_at));
  let resultados='';
  if(q){
    const hits=pases().filter(p=>(nq.length>=2&&normPlaca(p.plate).includes(nq))
      ||[nombreDe(p),p.guardian,p.folio].filter(Boolean).some(v=>String(v).toLowerCase().includes(lq)))
      .sort((a,b)=>Number(vigente(b))-Number(vigente(a)));
    resultados=hits.length?`<div class="pk-list">${hits.slice(0,8).map(p=>tarjeta(p)).join('')}</div>`
      :`<div class="pk-nohit"><span class="pk-x" aria-hidden="true">✕</span><div><strong>${nq.length>=5?`${esc(q.toUpperCase())} no tiene gafete`:'Sin resultados'}</strong><small>${nq.length>=5?'Ese vehículo no está en el padrón de esta temporada.':'Prueba con la placa o el nombre.'}</small></div>${puedeEscribir?`<button class="pk-go" type="button" data-nuevo-placa="${esc(q.toUpperCase())}">Darle gafete</button>`:''}</div>`;
  }
  return `<section class="pk-caseta"><div class="pk-col"><label class="pk-search"><span class="tos-icon tos-icon-search" aria-hidden="true"></span><input id="pkBusca" type="search" inputmode="search" autocomplete="off" autocapitalize="characters" placeholder="Placa o nombre" value="${esc(state.caseta)}" aria-label="Buscar placa o nombre"></label>${resultados}${puedeEscribir?`<button id="pkNuevo" class="pk-primary" type="button"><span aria-hidden="true">＋</span> Nuevo gafete</button>`:''}<p class="pk-hoy">Hoy: <b>${hoy.length}</b> ${hoy.length===1?'gafete entregado':'gafetes entregados'} · Temporada ${esc(String(state.data?.season||''))}</p></div><div class="pk-col">${pend.length?`<div class="pk-section-head"><h2>Pendientes</h2><button class="pk-link" type="button" data-tab="pendientes">Ver todos</button></div><div class="pk-list">${pend.slice(0,4).map(p=>tarjeta(p)).join('')}</div>`:`<div class="pk-calm"><span aria-hidden="true">✓</span><strong>Nada pendiente</strong><small>Cuando una familia pida gafete desde el portal, aparece aquí.</small></div>`}</div></section>`;
}

function vistaPendientes(){
  const req=pases().filter(p=>p.status==='requested'),apr=pases().filter(p=>p.status==='approved');
  const bloque=(t,sub,l)=>l.length?`<div class="pk-section-head"><h2>${t}</h2><small>${sub}</small></div><div class="pk-list">${l.map(p=>`${tarjeta(p)}${p.status==='requested'&&puedeEscribir?`<div class="pk-under"><button class="pk-link danger" type="button" data-reject="${esc(p.id)}">Rechazar solicitud</button></div>`:''}`).join('')}</div>`:'';
  const cuerpo=bloque('Pidieron desde el portal','Cobra y entrega en un toque',req)+bloque('Autorizados sin entregar','De antes del cambio: cobra lo que falte y entrega',apr);
  return cuerpo||`<div class="pk-calm"><span aria-hidden="true">✓</span><strong>Todo al día</strong><small>No hay gafetes por cobrar ni por entregar.</small></div>`;
}

function filtrados(){
  const q=state.busca.trim().toLowerCase(),nq=normPlaca(state.busca);
  const vivos=['requested','approved','issued'];
  return pases().filter(p=>{
    const ok=state.filtro==='todos'?true
      :state.filtro==='vigentes'?vivos.includes(p.status)
      :state.filtro==='cancelados'?['rejected','revoked','lost','expired'].includes(p.status)
      :state.filtro==='por_cobrar'?Number(p.balance||0)>0
      :state.filtro==='cortesias'?p.is_courtesy
      :p.status===state.filtro;
    if(!ok)return false;
    if(!q)return true;
    return (nq.length>=2&&normPlaca(p.plate).includes(nq))||[nombreDe(p),p.guardian,p.folio,p.vehicle].filter(Boolean).some(v=>String(v).toLowerCase().includes(q));
  });
}
const ETIQUETA={issued:'Entregados',vigentes:'Vigentes',por_cobrar:'Por cobrar',cortesias:'Sin costo',cancelados:'Cancelados',todos:'Todos'};
function vistaPadron(){
  const s=state.data?.summary||{};
  const resumen=`<div class="pk-stats"><div><b>${s.issued||0}</b><small>Entregados</small></div><div><b>${(s.requested||0)+(s.approved||0)}</b><small>Pendientes</small></div><div${Number(s.por_cobrar||0)>0?' class="due"':''}><b>${esc(money.format(Number(s.por_cobrar||0)))}</b><small>Por cobrar</small></div><div><b>${s.cortesias||0}</b><small>Sin costo · ${esc(money.format(Number(s.cortesia_valor||0)))}</small></div></div>`;
  const chips=Object.entries(ETIQUETA).map(([k,l])=>`<button class="pk-chip" type="button" data-f="${k}" aria-pressed="${state.filtro===k}">${l}</button>`).join('');
  const lista=filtrados();
  return `${resumen}<div class="pk-toolbar"><label class="pk-search small"><span class="tos-icon tos-icon-search" aria-hidden="true"></span><input id="pkPadronBusca" type="search" placeholder="Placa, nombre, tutor o folio" value="${esc(state.busca)}" aria-label="Buscar en el padrón"></label><button id="parkPrintBtn" class="pk-ghost" type="button">Imprimir / PDF</button></div><div class="pk-chips">${chips}</div><div class="pk-list">${lista.map(p=>tarjeta(p,{accion:false})).join('')||'<div class="tos-empty">No hay gafetes con ese filtro.</div>'}</div>`;
}

function render(){
  const s=state.data?.summary||{},pend=Number(s.requested||0)+Number(s.approved||0);
  const tabs=[['caseta','Caseta'],['pendientes',`Pendientes${pend?` <i>${pend}</i>`:''}`],['padron','Padrón']]
    .map(([k,l])=>`<button type="button" role="tab" data-tab="${k}" aria-selected="${state.tab===k}">${l}</button>`).join('');
  const cuerpo=state.tab==='pendientes'?vistaPendientes():state.tab==='padron'?vistaPadron():vistaCaseta();
  $('parkBody').innerHTML=`<div class="pk-app"><nav class="pk-tabs" role="tablist" aria-label="Secciones de estacionamiento">${tabs}</nav><div class="pk-view">${cuerpo}</div></div>`;

  $('parkPrint').innerHTML=hojaImpresa(filtrados(),state.busca?`${ETIQUETA[state.filtro]||'Gafetes'} · filtro "${state.busca}"`:(ETIQUETA[state.filtro]||'Gafetes'),state.data?.season);
  const body=$('parkBody');
  body.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{
    state.tab=b.dataset.tab;try{localStorage.setItem('tos.park.tab',state.tab);}catch(e){/* modo privado */}render();}));
  body.querySelectorAll('[data-f]').forEach(b=>b.addEventListener('click',()=>{state.filtro=b.dataset.f;render();}));
  body.querySelectorAll('[data-detail]').forEach(b=>b.addEventListener('click',()=>verHistorial(b.dataset.detail)));
  body.querySelectorAll('[data-cobrar]').forEach(b=>b.addEventListener('click',()=>abrirHoja({pase:pases().find(p=>p.id===b.dataset.cobrar)})));
  body.querySelectorAll('[data-reject]').forEach(b=>b.addEventListener('click',()=>cerrar(b.dataset.reject,'rejected','Motivo del rechazo:')));
  body.querySelector('[data-nuevo-placa]')?.addEventListener('click',e=>abrirHoja({placa:e.currentTarget.dataset.nuevoPlaca}));
  $('pkNuevo')?.addEventListener('click',()=>abrirHoja({}));
  $('parkPrintBtn')?.addEventListener('click',()=>window.print());
  const vivo=(id,clave)=>{const el=$(id);if(!el)return;el.addEventListener('input',e=>{state[clave]=e.target.value;render();
    const n=$(id);if(n){n.focus();n.setSelectionRange(n.value.length,n.value.length);}});};
  vivo('pkBusca','caseta');vivo('pkPadronBusca','busca');

  setShellHealth(pend>0?{state:'attention',label:`${pend} por entregar`}:{state:'ok',label:'Sin pendientes'});
}

/* ---------- La hoja: alta + cobro + entrega ---------- */
async function cargarTanners(){
  if(state.tanners)return state.tanners;
  try{state.tanners=(await rpc('v2_players',{organization_id:ctx.organization_id,status_filter:'active'})||[])
    .map(p=>({id:p.id,nombre:[p.first_name,p.last_name].filter(Boolean).join(' '),cat:p.category||''}));}
  catch(e){state.tanners=[];}
  return state.tanners;
}

function abrirHoja({pase=null,placa:placaInicial=''}){
  state.hoja={pase,quien:pase?'existente':'tanner',tanner:null,busca:'',kind:'coach',nombre:'',tel:'',
    placa:placaInicial,vehiculo:'',tipo:pase?.pass_type||'tanner',
    pago:pase?.is_courtesy?'free':'cash',motivo:pase?.courtesy_reason||'',ref:'',llave:llave(),enviando:false,error:'',listo:null};
  $('pkSheet').classList.remove('hidden');$('pkSheetBackdrop').classList.remove('hidden');
  document.body.classList.add('pk-locked');
  pintarHoja();
  if(!pase)cargarTanners().then(()=>{if(state.hoja&&!state.hoja.listo)pintarHoja();});
  setTimeout(()=>$(pase?'pkPay':'pkTannerBusca')?.focus?.(),60);
}
function cerrarHoja(){
  state.hoja=null;$('pkSheet').classList.add('hidden');$('pkSheetBackdrop').classList.add('hidden');
  document.body.classList.remove('pk-locked');
}

const seg=(name,opciones,actual)=>`<div class="pk-seg" role="radiogroup">${opciones.map(([k,l])=>`<button type="button" role="radio" data-${name}="${k}" aria-checked="${actual===k}">${l}</button>`).join('')}</div>`;

function cuanto(h){
  if(h.pago==='free')return 0;
  if(h.pase&&h.pase.status==='approved')return Number(h.pase.balance||0);
  return precio(h.tipo);
}
function faltante(h){
  if(!h.pase){
    if(h.quien==='tanner'&&!h.tanner)return 'Elige al Tanner';
    if(h.quien==='otro'&&!h.nombre.trim())return 'Escribe el nombre';
    if(normPlaca(h.placa).length<5)return 'Escribe las placas';
  }
  if(h.pago==='free'&&!h.motivo.trim())return 'Elige el motivo';
  return '';
}

function pintarHoja(){
  const h=state.hoja;if(!h)return;
  const box=$('pkSheetBody');
  if(h.listo){
    const r=h.listo;
    box.innerHTML=`<div class="pk-done"><span class="pk-check" aria-hidden="true">✓</span><small>${r.courtesy?'Gafete sin costo':`Cobrado ${esc(money.format(Number(r.paid||0)))}${r.method?` · ${esc(METODO[r.method]||r.method)}`:''}`}</small><h2>Entrega el gafete</h2><div class="pk-folio">${esc(r.folio||'—')}</div><p>a <b>${esc(r.nombre)}</b> · ${placa(r.placa)}</p><button id="pkListo" class="pk-primary" type="button">Listo, ya lo entregué</button></div>`;
    $('pkListo').addEventListener('click',cerrarHoja);
    $('pkListo').focus();
    return;
  }
  const monto=cuanto(h),falta=faltante(h);
  let quien='';
  if(h.pase){
    quien=`<div class="pk-who-fixed">${placa(h.pase.plate,true)}<div><strong>${esc(nombreDe(h.pase))}</strong><small>${esc([h.pase.category,h.pase.guardian&&`Tutor: ${h.pase.guardian}`,h.pase.status==='requested'?'Lo pidió desde el portal':null].filter(Boolean).join(' · '))}</small></div></div>`;
  }else{
    const lq=h.busca.trim().toLowerCase();
    const lista=(state.tanners||[]).filter(t=>!lq||t.nombre.toLowerCase().includes(lq)||t.cat.toLowerCase().includes(lq)).slice(0,6);
    const elegido=h.tanner?`<div class="pk-picked"><span><strong>${esc(h.tanner.nombre)}</strong><small>${esc(h.tanner.cat)}</small></span><button type="button" class="pk-link" id="pkCambiar">Cambiar</button></div>`
      :`<label class="pk-field"><span>¿Quién?</span><input id="pkTannerBusca" type="search" autocomplete="off" placeholder="Escribe el nombre del Tanner" value="${esc(h.busca)}"></label><div class="pk-results">${state.tanners?lista.map(t=>`<button type="button" data-tanner="${esc(t.id)}"><strong>${esc(t.nombre)}</strong><small>${esc(t.cat)}</small></button>`).join('')||'<p class="pk-hint">No encontré a nadie con ese nombre.</p>':'<p class="pk-hint">Cargando Tanners…</p>'}</div>`;
    const otro=`<div class="pk-chips tight">${Object.entries(PORTADOR).filter(([k])=>k!=='familia').map(([k,l])=>`<button class="pk-chip" type="button" data-kind="${k}" aria-pressed="${h.kind===k}">${l}</button>`).join('')}</div><label class="pk-field"><span>Nombre</span><input id="pkNombre" maxlength="80" autocomplete="off" placeholder="Carlos Méndez" value="${esc(h.nombre)}"></label>`;
    quien=`${seg('quien',[['tanner','Familia de un Tanner'],['otro','Otra persona']],h.quien)}${h.quien==='tanner'?elegido:otro}<div class="pk-row2"><label class="pk-field"><span>Placas</span><input id="pkPlaca" class="pk-plate-input" maxlength="15" autocomplete="off" autocapitalize="characters" placeholder="ABC-123-X" value="${esc(h.placa)}"></label><label class="pk-field"><span>Vehículo <i>(opcional)</i></span><input id="pkVehiculo" maxlength="60" autocomplete="off" placeholder="Tsuru blanco" value="${esc(h.vehiculo)}"></label></div>`;
  }
  const tipo=h.pase&&h.pase.status!=='requested'?'':`<div class="pk-field"><span>Tipo de pase</span>${seg('tipo',[['tanner',`Tanner Pass · ${money.format(precio('tanner'))}`],['vip',`VIP · ${money.format(precio('vip'))}`]],h.tipo)}</div>`;
  const yaPagado=h.pase&&h.pase.status==='approved'&&(h.pase.is_courtesy||Number(h.pase.balance||0)<=0);
  const pago=yaPagado?`<p class="pk-paid">${h.pase.is_courtesy?'Autorizado sin costo':'Ya está pagado'}: sólo falta entregarlo.</p>`
    :`<div class="pk-field"><span>¿Cómo pagó?</span>${seg('pago',[['cash','Efectivo'],['transfer','Transferencia'],['card','Tarjeta'],['free','Sin costo']],h.pago)}</div>${
      h.pago==='transfer'||h.pago==='card'?`<label class="pk-field"><span>Referencia <i>(opcional)</i></span><input id="pkRef" maxlength="60" autocomplete="off" value="${esc(h.ref)}"></label>`:''}${
      h.pago==='free'?`<div class="pk-field"><span>¿Por qué sin costo?</span><div class="pk-chips tight">${MOTIVOS.map(m=>`<button class="pk-chip" type="button" data-motivo="${esc(m)}" aria-pressed="${h.motivo===m}">${esc(m)}</button>`).join('')}</div><input id="pkMotivo" maxlength="120" autocomplete="off" placeholder="O escribe el motivo" value="${esc(MOTIVOS.includes(h.motivo)?'':h.motivo)}"><small class="pk-hint">Queda registrado con tu nombre.</small></div>`:''}`;
  const texto=yaPagado||h.pago==='free'?'Entregar gafete':`Cobrar ${money.format(monto)} y entregar`;
  box.innerHTML=`<header class="pk-sheet-head"><h2>${h.pase?'Cobrar y entregar':'Nuevo gafete'}</h2><button id="pkCerrar" class="pk-close" type="button" aria-label="Cerrar">✕</button></header>${quien}${tipo}${pago}${h.error?`<div class="pk-error" role="alert">${esc(h.error)}</div>`:''}<button id="pkPay" class="pk-primary" type="button"${falta||h.enviando?' disabled':''}>${h.enviando?'Un momento…':esc(falta||texto)}</button>`;

  $('pkCerrar').addEventListener('click',cerrarHoja);
  const re=(fn)=>e=>{fn(e);h.error='';pintarHoja();};
  box.querySelectorAll('[data-quien]').forEach(b=>b.addEventListener('click',re(()=>{h.quien=b.dataset.quien;})));
  box.querySelectorAll('[data-tipo]').forEach(b=>b.addEventListener('click',re(()=>{h.tipo=b.dataset.tipo;})));
  box.querySelectorAll('[data-pago]').forEach(b=>b.addEventListener('click',re(()=>{h.pago=b.dataset.pago;})));
  box.querySelectorAll('[data-kind]').forEach(b=>b.addEventListener('click',re(()=>{h.kind=b.dataset.kind;})));
  box.querySelectorAll('[data-motivo]').forEach(b=>b.addEventListener('click',re(()=>{h.motivo=b.dataset.motivo;})));
  box.querySelectorAll('[data-tanner]').forEach(b=>b.addEventListener('click',()=>{
    h.tanner=state.tanners.find(t=>t.id===b.dataset.tanner)||null;pintarHoja();
    if(!h.placa)$('pkPlaca')?.focus();}));
  $('pkCambiar')?.addEventListener('click',()=>{h.tanner=null;pintarHoja();$('pkTannerBusca')?.focus();});
  // Lo que se escribe no repinta toda la hoja (perdería el teclado), sólo el botón.
  const campo=(id,clave)=>$(id)?.addEventListener('input',e=>{h[clave]=e.target.value;
    if(clave==='busca'){pintarHoja();const n=$(id);if(n){n.focus();n.setSelectionRange(n.value.length,n.value.length);}return;}
    const f=faltante(h),b=$('pkPay');if(b&&!h.enviando){b.disabled=!!f;b.textContent=f||texto;}});
  campo('pkTannerBusca','busca');campo('pkNombre','nombre');campo('pkPlaca','placa');campo('pkVehiculo','vehiculo');campo('pkRef','ref');
  $('pkMotivo')?.addEventListener('input',e=>{h.motivo=e.target.value;box.querySelectorAll('[data-motivo]').forEach(c=>c.setAttribute('aria-pressed','false'));
    const f=faltante(h),b=$('pkPay');if(b&&!h.enviando){b.disabled=!!f;b.textContent=f||texto;}});
  $('pkPay').addEventListener('click',()=>enviar(yaPagado));
}

async function enviar(yaPagado){
  const h=state.hoja;if(!h||h.enviando||faltante(h))return;
  h.enviando=true;h.error='';pintarHoja();
  const p=h.pase,gratis=h.pago==='free';
  try{
    let r;
    if(yaPagado){
      r=await rpc('v2_issue_parking',{organization_id:ctx.organization_id,pass_id:p.id,folio:null});
      r={...r,courtesy:p.is_courtesy,paid:0};
    }else{
      r=await rpc('v2_parking_express',{organization_id:ctx.organization_id,pass_id:p?.id||null,
        holder_kind:p?null:(h.quien==='tanner'?'familia':h.kind),player_id:p?null:(h.quien==='tanner'?h.tanner.id:null),
        holder_name:p||h.quien==='tanner'?null:h.nombre.trim(),holder_phone:null,
        plate:p?null:h.placa.trim().toUpperCase(),vehicle:p?null:(h.vehiculo.trim()||null),
        pass_type:h.tipo,courtesy:gratis,courtesy_reason:gratis?h.motivo.trim():null,
        method:gratis?null:h.pago,reference:h.ref.trim()||null,collected_by_name:quienCobra(),idempotency_key:h.llave});
    }
    h.listo={...r,nombre:p?nombreDe(p):(h.quien==='tanner'?h.tanner.nombre:h.nombre.trim()),placa:p?p.plate:h.placa.trim().toUpperCase()};
    h.enviando=false;state.caseta='';pintarHoja();
    load();
  }catch(error){
    h.enviando=false;h.error=amable(error);pintarHoja();
  }
}
function amable(error){
  const raw=String(error?.message||error);
  if(/Could not find the function|schema cache/i.test(raw))return 'La actualización todavía no llega a producción. No se cobró nada.';
  if(/Not authorized/i.test(raw))return 'Tu usuario no tiene permiso para esto. No se cobró nada.';
  if(/Failed to fetch|NetworkError|network/i.test(raw))return 'Sin conexión. Revisa el internet y vuelve a tocar el botón: no se cobra dos veces.';
  return raw;
}

/* ---------- Detalle, rechazo y cierre (sin cambios de fondo) ---------- */
const portadorDe=id=>nombreDe(pases().find(p=>p.id===id))||'este gafete';

// Cerrar nunca cancela el cargo: condonar es una decisión aparte, y pasa por
// Contabilidad con su propia autorización.
async function cerrar(id,estado,pregunta){
  const motivo=await tosPrompt({kicker:'ESTACIONAMIENTO',title:pregunta,
    message:`Gafete de ${portadorDe(id)}.`,
    hint:'Queda registrado con tu nombre y la fecha.',
    required:true,requiredText:'Escribe el motivo.',maxlength:200,
    confirmText:'Confirmar',danger:estado!=='lost'});
  if(motivo===null)return;
  try{
    const r=await rpc('v2_close_parking',{organization_id:ctx.organization_id,pass_id:id,new_status:estado,reason:motivo});
    cerrarDrawer();await load();
    if(r?.charge_pendiente)await tosAlert({kicker:'ESTACIONAMIENTO',title:'Listo, pero ojo con el cargo',
      message:'El cargo del gafete sigue en su estado de cuenta. Si lo vas a condonar, hazlo en Contabilidad › Ajustes.'});
  }catch(error){await tosAlert({kicker:'ESTACIONAMIENTO',title:'No se pudo cerrar',message:String(error?.message||error)});}
}

function cerrarDrawer(){
  $('parkDrawer').classList.add('hidden');$('parkBackdrop').classList.add('hidden');
}
async function verHistorial(id){
  $('parkDrawerBody').innerHTML='<div class="tos-empty">Cargando…</div>';
  $('parkDrawer').classList.remove('hidden');$('parkBackdrop').classList.remove('hidden');
  let d;
  try{d=await rpc('v2_parking_pass_detail',{organization_id:ctx.organization_id,pass_id:id});}
  catch(error){$('parkDrawerBody').innerHTML=`<div class="tos-empty">${esc(String(error?.message||error))}</div>`;return;}
  $('parkDrawerTitle').textContent='Detalle del gafete';
  const saldo=Number(d.balance||0),nombre=nombreDe(d);
  const datos=[['Portador',nombre],['Tutor',d.guardian],['Vehículo',d.vehicle],['Tipo',TIPO[d.pass_type]],['Folio',d.folio],
    ['Temporada',d.season],['Vence',d.expires_on],['Estado',ESTADO[d.status]||d.status],
    ['Cobro',d.is_courtesy?`Sin costo${d.courtesy_reason?` · ${d.courtesy_reason}`:''}`:saldo>0?`${money.format(saldo)} pendiente`:'Cubierto'],['Motivo',d.close_reason]]
    .filter(([,v])=>v!=null&&v!=='')
    .map(([k,v])=>`<div class="park-fact"><span>${esc(k)}</span><strong>${esc(String(v))}</strong></div>`).join('');
  const eventos=(d.events||[]).map(e=>{
    const quien=[ACTOR[e.actor_kind]||e.actor_kind,e.actor].filter(Boolean).join(' · ');
    return `<div class="park-ev"><span class="park-ev-dot"></span><span><strong>${esc(EVENTO[e.event]||e.event)}</strong><span>${esc(fmtFecha(e.at))} · ${esc(quien)}${e.note?` · ${esc(e.note)}`:''}</span></span></div>`;
  }).join('');
  const terminal=['rejected','revoked','lost','expired'].includes(d.status);
  const accion=puedeEscribir&&['requested','approved'].includes(d.status)?`<button class="pk-primary" type="button" data-drawer-cobrar="${esc(id)}">${d.status==='approved'&&(d.is_courtesy||saldo<=0)?'Entregar gafete':'Cobrar y entregar'}</button>`:'';
  const cierres=puedeEscribir&&d.status==='issued'?`<div class="pk-drawer-more"><button class="pk-ghost" type="button" data-lost="${esc(id)}">Se perdió</button><button class="pk-ghost danger" type="button" data-revoke="${esc(id)}">Cancelar gafete</button></div>`:'';
  const eliminar=ctx.role==='Presidencia'&&terminal?`<button class="park-delete" type="button" data-delete-pass="${esc(id)}">Eliminar registro definitivamente</button>`:'';
  $('parkDrawerBody').innerHTML=`<section class="park-detail-hero"><span class="park-detail-plate">${esc(d.plate||'Sin placas')}</span><div><strong>${esc(nombre)}</strong><small>${esc([d.category,d.guardian&&`Tutor: ${d.guardian}`].filter(Boolean).join(' · ')||PORTADOR[d.holder_kind]||'')}</small></div><span class="park-state" data-s="${esc(d.status)}">${esc(ESTADO[d.status]||d.status)}</span></section>${accion}<section class="park-detail-section"><h3>Datos del gafete</h3><div class="park-facts">${datos}</div></section><section class="park-detail-section"><h3>Historial</h3><div class="park-log">${eventos||'<div class="tos-empty">Sin movimientos.</div>'}</div></section>${cierres}${eliminar}`;
  const b=$('parkDrawerBody');
  b.querySelector('[data-drawer-cobrar]')?.addEventListener('click',()=>{const p=pases().find(x=>x.id===id);cerrarDrawer();if(p)abrirHoja({pase:p});});
  b.querySelector('[data-lost]')?.addEventListener('click',()=>cerrar(id,'lost','¿Qué reportó la familia?'));
  b.querySelector('[data-revoke]')?.addEventListener('click',()=>cerrar(id,'revoked','Motivo de la cancelación:'));
  b.querySelector('[data-delete-pass]')?.addEventListener('click',()=>eliminarRegistro(id,d));
}

async function eliminarRegistro(id,pass){
  const ok=await tosConfirm({kicker:'SOLO PRESIDENCIA',title:'¿Eliminar este registro?',message:`${nombreDe(pass)} · ${pass.plate||'sin placas'}. Se eliminará también su historial. Esta acción no se puede deshacer.`,confirmText:'Eliminar definitivamente',danger:true});
  if(!ok)return;
  try{await rpc('v2_delete_parking_pass',{organization_id:ctx.organization_id,pass_id:id});cerrarDrawer();await load();await tosAlert({kicker:'ESTACIONAMIENTO',title:'Registro eliminado',message:'El gafete y su historial ya no aparecen en el padrón.'});}
  catch(error){const raw=String(error?.message||error),message=/Could not find the function|schema cache/i.test(raw)?'La actualización segura de base de datos todavía no llegó a producción. No se eliminó nada; el equipo técnico debe desplegar la migración pendiente.':/related records/i.test(raw)?'Este gafete tiene movimientos relacionados que deben conservarse. Cancela o ajusta primero esos movimientos.':raw;await tosAlert({kicker:'ESTACIONAMIENTO',title:'No se pudo eliminar',message});}
}

$('parkClose').addEventListener('click',cerrarDrawer);
$('parkBackdrop').addEventListener('click',cerrarDrawer);
$('pkSheetBackdrop').addEventListener('click',()=>{if(!state.hoja?.enviando)cerrarHoja();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.hoja&&!state.hoja.enviando)cerrarHoja();});
await load();
