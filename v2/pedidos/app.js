import { createClient } from '/v2/supabase-client.js';
import { mensajeConfirmacion, ligaWhatsApp } from '/v2/pedido-mensajes.js';
import { abreVentas } from '/v2/pedidos/ventas.js';
import { abrirCobro, esCuentaCompartida } from '/v2/cobro/hoja.js';
import { hojaPdf, nombreDelPdf, compartePdf, cargaFotos } from '/v2/produccion/pdf.js';
const supabase=createClient('https://pacnegivzgxpanphrnwp.supabase.co','sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);let ctx=null,orders=[],current=null,canWrite=false,canManage=false,canCorrect=false,canViewFinance=true,metricsRun=0;const details=new Map();
/* Pedidos que llegaron por el link o el portal y nadie ha confirmado todavía
   (a3_pedidos_por_revisar). clubCfg trae el nombre del club y cómo pagar, para
   el mensaje de WhatsApp. */
let porRevisar=new Set(),clubCfg=null;
/* El pedido por etapas (22/10/2026, h34). Presidencia: "compran + llega a
   TannerOS + validamos la info y el número + los viernes se envían al
   proveedor + nos los entrega + se entregan al cliente". Cada pestaña es una
   etapa y arriba de la lista va lo que se hace en ella: mandar el corte del
   viernes con su PDF para WhatsApp, recibirlo, entregar. */
let etapas={};
const ETAPAS=[{k:'por_validar',t:'Por validar'},{k:'por_cobrar',t:'Por cobrar'},{k:'para_proveedor',t:'Para el proveedor'},{k:'con_proveedor',t:'Con el proveedor'},{k:'para_entregar',t:'Para entregar'},{k:'entregado',t:'Entregados'}];
// Si la base no contestó la etapa, se calcula con lo que ya hay.
function etapaDe(o){const e=etapas[o.id]?.stage;if(e)return e;
  if(!vigente(o))return 'cerrado';if(o.status==='delivered')return 'entregado';if(o.status==='ready')return 'para_entregar';if(o.status==='in_production')return 'con_proveedor';
  if(porAtender(o))return 'por_validar';if(saldoDe(o)>0.005||!['paid','partial_payment'].includes(o.status))return 'por_cobrar';return 'para_proveedor';}
/* Cobro único: quien cobra en Taquilla cobra el pedido con la misma hoja. */
let cobraConHoja=false,otroPagador=false;
/* El tablero (a5): por pedido, de qué niño es, qué piezas lleva con talla,
   manga, nombre y número, y si el número ya se confirmó. Es lo que se ve en la
   lista sin abrir nada. */
let tablero={};const money=new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:2});const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const DIACRITICS_RE=new RegExp(String.fromCharCode(91)+String.fromCharCode(0x300)+'-'+String.fromCharCode(0x36f)+String.fromCharCode(93),'g');
const labels={draft:'Borrador',pending_payment:'Pendiente pago',partial_payment:'Pago parcial',paid:'Pagado',in_production:'En producción',ready:'Listo',delivered:'Entregado',cancelled:'Cancelado',refunded:'Reembolsado'};
const payerLabels={guardian:'Familia / tutor',sponsor:'Patrocinador',player:'Jugador',organization:'Club',other:'Otro'};
async function confirmAction(o={}){
  if(!window.tosConfirm)return confirm(o.message||'¿Confirmar?');
  return window.tosConfirm({kicker:o.kicker||'CONFIRMAR',title:o.title||'¿Confirmar?',message:o.message||'',confirmText:o.confirmText||'Sí, confirmar',cancelText:o.cancelText||'Cancelar',danger:!!o.danger});
}
/* Recorrido del pedido estilo e-commerce (Amazon/Mercado Libre): 4 hitos fijos.
   "Pedido" cubre captura+cobro (se marca "hecho" en cuanto ya se pagó por completo).
   cancelled/refunded rompen el recorrido y muestran una nota en su lugar. */
const TRACK_STEPS=['Pedido','Pagado','Producción','Listo'];
const TRACK_CURRENT={draft:1,pending_payment:1,partial_payment:1,paid:2,in_production:2,ready:3,delivered:4};
/* paidFull: con anticipo (plan de pago < 100%) un pedido puede llegar a producción sin
   estar 100% pagado. En ese caso el paso "Pagado" NO se marca como hecho (sería engañoso);
   se muestra como "en curso" igual que producción, para no esconder que falta cobrar. */
function renderTracker(status,paidFull){
  const wrap=$('orderTracker');if(!wrap)return;
  if(status==='cancelled'||status==='refunded'){
    wrap.innerHTML=`<div class="order-tracker-alert ${esc(status)}">${status==='cancelled'?'Este pedido fue cancelado.':'Este pedido fue reembolsado.'}</div>`;
    return;
  }
  const cur=TRACK_CURRENT[status]??1;
  wrap.innerHTML=`<div class="order-tracker">${TRACK_STEPS.map((label,i)=>{
    let state=i<cur?'done':i===cur?'current':'pending';
    if(i===1&&state==='done'&&!paidFull)state='current';
    return `<div class="track-step ${state}"><span class="track-dot">${state==='done'?'✓':i+1}</span><span class="track-label">${esc(label)}</span></div>`;
  }).join('')}</div>`;
}
/* Placeholder visual por producto: hoy no existe columna de imagen en app.products
   ni una tabla de mockups de personalización, así que usamos un ícono por categoría
   (detectada por palabras clave en la descripción, igual que la validación de readiness).
   Cuando exista una foto real (ej. products.image_url o una vista previa del jersey
   personalizado), esta función es el único lugar a cambiar: basta con regresar
   `<img src="${esc(url)}" alt="">` en vez del ícono — el resto del layout no cambia. */
const ICONS={
  jersey:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 4 4 7l2 3 2-1v10h8V9l2 1 2-3-4-3-2 2h-2L8 4Z"/></svg>',
  shorts:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 4h14l1 7-2 9h-4l-1-7-1 7H8l-2-9 1-7Z"/></svg>',
  socks:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 3h6v9l4 5v2a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-1.6L11 15H9V3Z"/></svg>',
  kit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 8h7v7H4V8Zm9 0h7v7h-7V8Z"/></svg>',
  jacket:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 3 6 5 4 20h4l1-6 1 6h4l1-6 1 6h4L18 5l-3-2-3 2-3-2Z"/></svg>',
  default:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7l8-4 8 4v10l-8 4-8-4V7Z"/><path d="M4 7l8 4 8-4M12 11v10"/></svg>'
};
function itemThumb(i){const d=(i.description||'').toLowerCase();if(/jersey|playera|uniforme/.test(d))return ICONS.jersey;if(/short|pant/.test(d))return ICONS.shorts;if(/calcet|media|sock/.test(d))return ICONS.socks;if(/conjunto|kit|combo/.test(d))return ICONS.kit;if(/chamarra|sudadera|jacket|outerwear/.test(d))return ICONS.jacket;return ICONS.default;}
/* Mismo criterio que private.order_readiness en el backend: talla siempre requerida;
   nombre y número solo si la descripción suena a jersey/uniforme/playera. */
function itemComplete(i){const a=i.attributes||{},d=i.description||'';const jerseyish=/jersey|uniforme|playera/i.test(d);const hasSize=!!String(a.talla||a.size||'').trim();const hasNumber=!!String(a.numero||a.number||'').trim();if(!hasSize)return false;if(jerseyish&&!hasNumber)return false;return true;}
function itemChip(label,value){return value?`<span class="item-chip">${esc(label)}: ${esc(value)}</span>`:'';}
/* Transiciones reales que valida el backend (private.command_update_order_status).
   OJO: pending_payment/partial_payment también admiten saltar a "paid" manualmente,
   pero eso casi nunca hace falta porque un cobro que cubre el saldo ya lo hace solo —
   por eso no se ofrece como botón, para no confundir a quien está cobrando. */
function primaryNextStep(status,readyOk){const map={partial_payment:readyOk?{to:'in_production',label:'Enviar a producción'}:null,paid:{to:'in_production',label:'Enviar a producción'},in_production:{to:'ready',label:'Marcar listo'},ready:{to:'delivered',label:'Marcar entregado'}};return map[status]||null;}
function secondarySkip(status,readyOk){if(status==='paid')return{to:'ready',label:'Marcar listo (sin pasar por producción)'};if(status==='partial_payment'&&readyOk)return{to:'ready',label:'Marcar listo (sin pasar por producción)'};return null;}
function dangerAction(status){if(['draft','pending_payment'].includes(status))return{to:'cancelled',label:'Cancelar pedido'};if(['partial_payment','paid','in_production','ready','delivered'].includes(status))return{to:'refunded',label:'Reembolsar pedido'};return null;}
function waLink(phone){const d=String(phone||'').replace(/\D/g,'');return d?`https://wa.me/${d}`:null;}
const WA_ICON='<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2Zm5.4 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-1.6-.1a13 13 0 0 1-1.5-.6c-2.6-1.1-4.3-3.8-4.5-4-.1-.2-1-1.4-1-2.7s.6-1.9.9-2.2c.3-.3.6-.4.8-.4h.5c.2 0 .4 0 .5.4l.8 1.9c.1.2.1.4 0 .5l-.4.5c-.1.2-.2.3-.1.5.2.3.8 1.4 1.8 2.2 1.3 1 2.3 1.3 2.6 1.5.3.1.4.1.6-.1l.6-.7c.2-.3.4-.2.6-.1l1.7.8c.2.1.4.2.4.3.1.2.1.8-.1 1.4Z"/></svg>';
function show(id){['loadingView','deniedView','view'].forEach(v=>$(v)?.classList.toggle('hidden',v!==id));}
function msg(t='',type='error'){const e=$('statusMessage');e.textContent=t;e.dataset.type=type;e.classList.toggle('hidden',!t);}function payMsg(t='',type='error'){const e=$('paymentMessage');e.textContent=t;e.dataset.type=type;e.classList.toggle('hidden',!t);}
async function rpc(n,p={}){const {data,error}=await supabase.rpc(n,p);if(error)throw error;return data;}function fmt(v){return v?new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v)):'—';}function fmtDate(v){return v?new Intl.DateTimeFormat('es-MX',{dateStyle:'medium'}).format(new Date(`${v}T12:00:00`)):'—';}
function readinessText(r){const miss=Array.isArray(r?.missing)?r.missing:[];return r?.ok?'Listo para producción':miss.length?miss.join(' · '):'Pendiente de validar';}
function vigente(o){return !['cancelled','refunded'].includes(o.status);}
/* Las tres puertas de Tienda, según lo que el rol puede hacer.

   Levantar un pedido escribe; Catálogo y Producción también. Quien sólo lee
   la Tienda ve las tarjetas apagadas con el motivo, en vez de toparse con un
   "Sin acceso" después de haber dado el clic. */
// Ventas de la semana (13/10/2026): sólo Presidencia (la base también lo exige).
function veVentas(){return !!ctx&&(ctx.role==='Presidencia'||!!ctx.is_owner);}
function verVentas(){abreVentas({rpc,organizationId:ctx.organization_id,money,alAbrirPedido:id=>{const o=orders.find(x=>x.id===id);if(o)openOrder(o);}});}
function aplicaAccesos(){
  $('ventasAction')?.classList.toggle('hidden',!veVentas());
  const apaga=(el,motivo)=>{if(!el)return;el.classList.add('is-off');el.removeAttribute('href');el.title=motivo;el.setAttribute('aria-disabled','true');const sm=el.querySelector('small');if(sm)sm.textContent=motivo;};
  if(!canWrite)apaga($('newOrderAction'),'Tu rol no puede levantar pedidos');
  if(!canManage)apaga($('productionAction'),'Sólo quien administra la Tienda');
}
async function boot(){const {data:{session}}=await supabase.auth.getSession();if(!session){location.href='/v2';return;}const rows=await rpc('v2_my_context');if(!rows?.length){$('deniedText').textContent='Sin organización.';show('deniedView');return;}ctx=rows[0];const mods=await rpc('v2_my_modules',{organization_id:ctx.organization_id});const mod=mods.find(m=>m.module_code==='commerce');if(!mod?.enabled||!mod?.can_read){$('deniedText').textContent='Tu rol no tiene acceso a Tienda/Pedidos.';show('deniedView');return;}canWrite=!!mod.can_write;cobraConHoja=mods.some(m=>['taquilla','billing'].includes(m.module_code)&&m.enabled&&m.can_write);canManage=canWrite&&ctx.role!=='Taquilla';canCorrect=ctx.role==='Presidencia'||!!ctx.is_owner;rpc('v2_can_correct',{organization_id:ctx.organization_id}).then(v=>{canCorrect=!!v;muestraZona();}).catch(()=>{});const financeMod=mods.find(m=>m.module_code==='commerce_finance');canViewFinance=false;/* Costo y utilidad viven SÓLO en Catálogo › Costos (13/10/2026). */void financeMod;document.querySelector('.business-cockpit')?.classList.toggle('hidden',!canViewFinance);$('financeSection')?.classList.toggle('hidden',!canViewFinance);$('statusSection')?.classList.toggle('hidden',!canManage);aplicaAccesos();$('orgName').textContent=ctx.organization_name;$('roleBadge').textContent=ctx.is_owner?'Propietario':ctx.role;clubCfg=await rpc('v2_club_config',{organization_id:ctx.organization_id}).catch(()=>null);await load();show('view');abrePedidoDeLiga();$('ventasAction')?.addEventListener('click',verVentas);
  // El botón + de abajo: lo de la Tienda primero (13/10/2026).
  window.tosAccionesDePantalla=[canWrite?{label:'Nuevo pedido',sub:'Levantarlo en el mostrador',icon:'bag',href:'/captura/'}:null,{label:'Por atender',sub:'Nuevos y números por confirmar',icon:'check',run:()=>{$('statusFilter').value='__atender';render();renderReviewBanner();$('orderList')?.scrollIntoView({behavior:'smooth',block:'start'});}},canManage?{label:'Producción',sub:'Cortes y hoja para el proveedor',icon:'list',href:'/produccion/'}:null,veVentas()?{label:'Ventas de la semana',sub:'Vendido, cobrado y lo que más sale',icon:'chart',run:verVentas}:null].filter(Boolean);
  window.dispatchEvent(new Event('tos:acciones'));}
/* El aviso de "Pedido nuevo" (campana y push) trae ?pedido=<id>: se abre directo. */
function abrePedidoDeLiga(){const id=new URLSearchParams(location.search).get('pedido');const o=id&&orders.find(x=>x.id===id);if(o)openOrder(o);}
async function load(){const [lista,revisar,tab,pipe]=await Promise.all([rpc('v2_orders',{organization_id:ctx.organization_id,status_filter:null}),rpc('v2_orders_to_review',{organization_id:ctx.organization_id}).catch(()=>[]),rpc('v2_orders_board',{organization_id:ctx.organization_id}).catch(()=>({})),rpc('v2_orders_pipeline',{organization_id:ctx.organization_id}).catch(()=>({}))]);orders=lista||[];etapas=(pipe&&typeof pipe==='object')?pipe:{};tablero=(tab&&typeof tab==='object')?tab:{};porRevisar=new Set(Array.isArray(revisar)?revisar:[]);eligeEtapaInicial();render();renderKpis();renderReviewBanner();loadBusinessMetrics();}
/* Los filtros de arriba (segmentos tipo iOS). Cada uno trae su cuenta: los
   números que antes vivían en tarjetas aparte ahora dicen a dónde ir. */
// "Por cobrar" es Quién me debe: una tarjeta por familia con su WhatsApp.
const SEGMENTOS=[...ETAPAS.map(e=>e.k==='por_cobrar'?{f:'__cobrar',t:e.t}:{f:'@'+e.k,t:e.t}),{f:'',t:'Todos'}];
function porAtender(o){return vigente(o)&&(porRevisar.has(o.id)||numeroPorConfirmar(o));}
function cuentaDe(f){const v=orders.filter(vigente);if(f.startsWith('@'))return v.filter(o=>etapaDe(o)===f.slice(1)).length;if(f==='__atender')return v.filter(porAtender).length;if(f==='__cobrar')return v.filter(o=>saldoDe(o)>0.005).length;if(!f)return v.length;return v.filter(o=>o.status===f).length;}
/* Tienda fácil (29/10/2026). Presidencia: "Zul no sabe qué es el corte ni
   los lotes". Y luego: "menos clics, que cualquiera lo entienda... estilo
   Apple, toda la complejidad detrás, los botones por delante... como un
   diagrama". El flujo es un diagrama de cinco pasos con verbo (lo que tú
   haces), unidos por una línea; abajo, una tarjeta con UN botón grande para
   el paso que toca. Sin "corte" ni "lote": el nombre del proveedor (el último
   que se usó) y palabras de todos los días. */
const proveedor=()=>{try{return localStorage.getItem('tos-proveedor')||'';}catch{return '';}};
const piezasDe=lista=>lista.reduce((n,o)=>n+Number(o.item_count||0),0);
const PASOS=[{f:'@por_validar',t:'Revisar'},{f:'__cobrar',t:'Cobrar'},{f:'@para_proveedor',t:'Mandar'},{f:'@con_proveedor',t:'Recibir'},{f:'@para_entregar',t:'Entregar'}];
function renderReviewBanner(){const seg=$('tSeg');if(!seg)return;const actual=$('statusFilter').value;seg.className='t-flujo';
  seg.innerHTML=`<ol class="t-pasos">${PASOS.map(p=>{const n=cuentaDe(p.f);return `<li><button type="button" role="tab" data-f="${p.f}" aria-selected="${actual===p.f}" class="t-paso${actual===p.f?' activo':''}${n?' con':''}"><i>${n}</i><b>${p.t}</b></button></li>`;}).join('')}</ol>`
    +`<div class="t-cards-mas">${[['@entregado','Entregados'],['','Todos']].map(([f,t])=>`<button type="button" role="tab" data-f="${f}" aria-selected="${actual===f}" class="${actual===f?'activo':''}">${t} <i>${cuentaDe(f)}</i></button>`).join('')}</div>`;
  const sub=$('tResumen');if(sub){const v=orders.filter(vigente).length,a=cuentaDe('@por_validar'),l=cuentaDe('@para_proveedor');sub.textContent=`${v} ${v===1?'pedido vigente':'pedidos vigentes'}${l?` · ${l} listos para mandar`:''}${a?` · ${a} por revisar`:''}${!a&&!l?' · todo al día':''}`;}}
function filteredOrders(){const status=$('statusFilter').value,q=$('orderSearch').value.trim().normalize('NFD').replace(DIACRITICS_RE,'').toLowerCase();const pasa=o=>{if(status.startsWith('@'))return etapaDe(o)===status.slice(1);if(status==='__review')return porRevisar.has(o.id);if(status==='__numero')return numeroPorConfirmar(o)&&vigente(o);if(status==='__atender')return porAtender(o);if(status==='__cobrar')return vigente(o)&&saldoDe(o)>0.005;return !status||o.status===status;};return orders.filter(o=>pasa(o)&&(!q||`${o.folio||''} ${o.customer_name||''} ${o.customer_phone||''} ${o.customer_email||''} ${tablero[o.id]?.playerName||''} ${tablero[o.id]?.attendedName||''} ${(tablero[o.id]?.items||[]).map(i=>i.nombre||'').join(' ')}`.normalize('NFD').replace(DIACRITICS_RE,'').toLowerCase().includes(q)));}
function renderKpis(){const rows=orders.filter(vigente);const pon=(id,n)=>{const e=$(id);if(e)e.textContent=n;};pon('kpiOrders',rows.length);pon('kpiPending',rows.filter(o=>['pending_payment','partial_payment'].includes(o.status)).length);pon('kpiProduction',rows.filter(o=>o.status==='in_production').length);pon('kpiReady',rows.filter(o=>o.status==='ready').length);}
function textoMangaCorto(m){return m==='larga'?'Larga':m==='corta'?'Corta':'';}
const esJersey=d=>/jersey|playera|uniforme/i.test(d||'');
const iniciales=n=>String(n||'').split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase()||'?';
/* Cómo llegó el pedido y quién del club lo atendió, en palabras. */
const ORIGEN={public_form:'Compró en línea',portal_familias:'Compró desde su portal',internal_capture:'Se levantó en el club',legacy_import:'Del sistema anterior'};
function quienAtendio(t){const como=ORIGEN[t?.source]||'';const quien=t?.attendedName;if(t?.source==='internal_capture')return quien?`Lo levantó ${quien}`:como;return [como,quien?`atendió ${quien}`:null].filter(Boolean).join(' · ');}
/* Los números que pidió el pedido, sin repetir. */
function numerosDe(o){return [...new Set((tablero[o.id]?.items||[]).map(i=>String(i.numero||'').trim()).filter(Boolean))];}
function numeroPorConfirmar(o){return numerosDe(o).length>0&&!tablero[o.id]?.numberConfirmed;}
/* Una pieza en una línea: "Jersey · T8 · LEO #10" y la manga como etiqueta. */
function lineaDePieza(i){const partes=[i.talla?`Talla ${i.talla}`:null,[i.nombre,i.numero?`#${i.numero}`:null].filter(Boolean).join(' ')||null].filter(Boolean);const manga=i.manga?`<em class="t-manga ${i.manga==='larga'?'larga':''}">Manga ${esc(i.manga)}</em>`:esJersey(i.description)?'<em class="t-manga falta">Manga sin definir</em>':'';return `<li><span><b>${Number(i.quantity||1)>1?`${Number(i.quantity)}× `:''}${esc(i.description||'Pieza')}</b>${partes.length?` · ${esc(partes.join(' · '))}`:''}</span>${manga}${i.obs?`<small class="t-obs">${esc(i.obs)}</small>`:''}</li>`;}
function barraNumero(o){
  const nums=numerosDe(o);if(!nums.length||!vigente(o))return '';
  const conf=tablero[o.id]?.numberConfirmed,txt=nums.map(n=>`#${n}`).join(', ');
  if(conf)return `<div class="order-num ok"><span>Número ${esc(txt)} confirmado</span>${canWrite?`<button type="button" class="t-link" data-num-deshacer="${esc(o.id)}">Deshacer</button>`:''}</div>`;
  return `<div class="order-num pendiente"><span>Número ${esc(txt)} por confirmar</span>${canWrite?`<button type="button" class="t-pill-btn" data-num-confirma="${esc(o.id)}">Confirmar número</button>`:''}</div>`;
}
function render(){pintaEtapa();const rows=filteredOrders(),list=$('orderList');list.innerHTML='';$('empty').textContent='No hay pedidos aquí.';if($('statusFilter').value==='__cobrar'){renderDeudores(rows);return;}$('empty').classList.toggle('hidden',rows.length>0);rows.forEach(o=>{const d=details.get(o.id),balance=d?Number(d.balance||0):null,t=tablero[o.id]||{},items=t.items||[],quien=t.playerName||o.customer_name||'Sin nombre',b=document.createElement('article');b.dataset.orderId=o.id;b.className='order-row'+(vigente(o)?'':' apagado');b.tabIndex=0;b.setAttribute('role','button');b.setAttribute('aria-label',`Abrir pedido ${o.folio||''} de ${quien}`);
    const atendio=quienAtendio(t);
    const saldo=Math.max(0,Number(o.total||0)-Number(o.paid_amount||0));b.innerHTML=`<span class="t-avatar" aria-hidden="true">${esc(iniciales(quien))}</span><div class="order-main"><div class="order-who"><strong>${esc(quien)}</strong>${t.playerName&&(t.playerCategory||t.playerJersey)?`<span>${esc([t.playerCategory,t.playerJersey?`dorsal #${t.playerJersey}`:null].filter(Boolean).join(' · '))}</span>`:''}</div><span class="order-pidio">${t.playerName?`Pidió ${esc(o.customer_name||'—')}`:esc(o.folio||'')}${atendio?` · ${esc(atendio)}`:''}</span>${items.length?`<ul class="order-items">${items.slice(0,4).map(lineaDePieza).join('')}${items.length>4?`<li class="mas">+${items.length-4} pieza(s) más</li>`:''}</ul>`:`<small>${Number(o.item_count||0)} pieza(s)</small>`}${t.notes?`<p class="t-nota"><b>Nota</b>${esc(t.notes)}</p>`:''}<span class="t-meta">${t.playerName?`${esc(o.folio||'')} · `:''}${fmt(o.created_at)}${saldo>0.005&&vigente(o)?` · saldo ${money.format(saldo)}`:''}</span></div><div class="order-right">${porRevisar.has(o.id)?'<span class="order-review-tag">Por revisar</span>':''}<b>${money.format(Number(o.total||0))}</b>${vigente(o)&&o.status!=='delivered'?(saldo>0.005?`<span class="t-pago debe">Debe ${money.format(saldo)}</span>`:'<span class="t-pago ok">Pagado</span>'):''}${vigente(o)&&['pending_payment','partial_payment','paid'].includes(o.status)?'':`<span class="order-status ${esc(o.status)}">${labels[o.status]||esc(o.status)}</span>`}</div>${barraNumero(o)}${accionesDeFila(o,t)}`;
    b.addEventListener('click',ev=>{if(ev.target.closest('[data-avisa]')){ev.stopPropagation();return;}const en=ev.target.closest('[data-entregado]');if(en){ev.stopPropagation();entregaDeFila(o,en);return;}const c=ev.target.closest('[data-num-confirma],[data-num-deshacer]');if(c){ev.stopPropagation();confirmaNumero(o,!!c.dataset.numConfirma,c);return;}openOrder(o);});
    b.addEventListener('keydown',ev=>{if((ev.key==='Enter'||ev.key===' ')&&ev.target===b){ev.preventDefault();openOrder(o);}});
    list.appendChild(b);});}
/* Quién me debe (13/10/2026, "y después saber quién me debe"): una tarjeta
   por persona con lo que debe, de cuántos pedidos y desde cuándo; WhatsApp
   con el recordatorio ya escrito y Cobrar, que abre el pedido más viejo. */
const saldoDe=o=>Math.max(0,Number(o.total||0)-Number(o.paid_amount||0));
function renderDeudores(rows){
  const list=$('orderList'),grupos=new Map();
  rows.filter(o=>saldoDe(o)>0.005).forEach(o=>{
    const t=tablero[o.id]||{},llave=t.playerName?`j:${t.playerName}`:o.customer_phone?`t:${String(o.customer_phone).replace(/\D/g,'')}`:`n:${o.customer_name}`;
    const g=grupos.get(llave)||{nombre:t.playerName||o.customer_name||'Sin nombre',pidio:t.playerName?o.customer_name:null,tel:o.customer_phone,pedidos:[],debe:0};
    g.pedidos.push(o);g.debe+=saldoDe(o);if(!g.tel&&o.customer_phone)g.tel=o.customer_phone;grupos.set(llave,g);
  });
  const lista=[...grupos.values()].sort((a,b)=>b.debe-a.debe);
  const total=lista.reduce((n,g)=>n+g.debe,0),pedidos=lista.reduce((n,g)=>n+g.pedidos.length,0);
  $('empty').classList.toggle('hidden',lista.length>0);
  if(!lista.length){$('empty').textContent='Nadie te debe. Todo cobrado.';return;}
  const pago=clubCfg?.paymentInstructions?.transfer||{},club=clubCfg?.name||ctx.organization_name||'el club';
  const dias=o=>Math.max(0,Math.round((Date.now()-new Date(o.created_at).getTime())/864e5));
  list.innerHTML=`<div class="deuda-total"><span>Te deben</span><strong>${money.format(total)}</strong><small>${lista.length} ${lista.length===1?'persona':'personas'} · ${pedidos} ${pedidos===1?'pedido':'pedidos'}</small></div>`
    +lista.map((g,k)=>{
      const viejo=g.pedidos.reduce((a,o)=>new Date(o.created_at)<new Date(a.created_at)?o:a),d=dias(viejo);
      const folios=g.pedidos.map(o=>o.folio).join(', ');
      const texto=`Hola${g.pidio?` ${String(g.pidio).split(' ')[0]}`:''}, te escribimos de ${club}. Tienes pendiente ${money.format(g.debe)} del pedido ${folios}${g.pidio?` de ${g.nombre}`:''}.`
        +(pago.clabe?` Puedes transferir a ${pago.bank||'la cuenta del club'}, CLABE ${pago.clabe}${pago.holder?`, a nombre de ${pago.holder}`:''}, con el folio como referencia.`:'')+' También en Taquilla. ¡Gracias!';
      const wa=ligaWhatsApp(g.tel,texto);
      return `<article class="deudor"><span class="t-avatar" aria-hidden="true">${esc(iniciales(g.nombre))}</span><div class="deudor-main"><strong>${esc(g.nombre)}</strong><span>${g.pidio?`Pidió ${esc(g.pidio)} · `:''}${g.pedidos.length} ${g.pedidos.length===1?'pedido':'pedidos'} · ${d===0?'hoy':d===1?'desde ayer':`hace ${d} días`}</span></div><b class="deudor-monto${d>=14?' tarde':''}">${money.format(g.debe)}</b>
        <div class="deudor-acc">${wa?`<a class="deudor-wa" href="${esc(wa)}" target="_blank" rel="noopener">${WA_ICON} Recordar</a>`:'<span class="muted">Sin teléfono</span>'}<button type="button" class="deudor-cobrar" data-deudor="${k}">Cobrar</button></div></article>`;
    }).join('');
  list.querySelectorAll('[data-deudor]').forEach(b=>b.addEventListener('click',()=>{const g=lista[Number(b.dataset.deudor)];const o=g.pedidos.reduce((a,x)=>new Date(x.created_at)<new Date(a.created_at)?x:a);openOrder(o).then(()=>$('paymentSection')?.scrollIntoView({behavior:'smooth',block:'start'}));}));
}
/* Confirmar el número desde la lista, sin abrir el pedido: un toque. */
async function confirmaNumero(o,confirmar,btn){
  btn.disabled=true;
  try{
    await rpc('v2_confirm_order_number',{organization_id:ctx.organization_id,order_id:o.id,confirmed:confirmar});
    const t=tablero[o.id]||(tablero[o.id]={items:[]});
    t.numberConfirmed=confirmar?{numeros:numerosDe(o),at:new Date().toISOString()}:null;
    render();renderReviewBanner();if(current?.order?.id===o.id)await refreshCurrent(o.id);msg(confirmar?`Número confirmado en ${o.folio||'el pedido'}.`:'Se quitó la confirmación del número.','success');
  }catch(e){btn.disabled=false;msg(e.message||'No se pudo confirmar el número.');}
}
/* El resumen arriba del detalle: de quién es, quién lo pidió y quién lo
   atendió, la nota, y cada jersey con su manga para corregirla en un toque. */
let staffDelClub=null;
async function pintaResumen(){
  const box=$('orderResumen');if(!box||!current)return;
  const d=current.order,t=tablero[d.id]||{},items=t.items||[],editable=canWrite&&['draft','pending_payment','partial_payment','paid'].includes(d.status);
  const quien=t.playerName||d.customer_name||'Sin nombre';
  if(canWrite&&!staffDelClub){try{staffDelClub=await rpc('v2_order_staff',{organization_id:ctx.organization_id})||[];}catch{staffDelClub=[];}}
  const opciones=(staffDelClub||[]).map(s=>`<option value="${esc(s.userId)}" ${s.userId===t.attendedBy?'selected':''}>${esc(s.name)}</option>`).join('');
  const piezas=items.map(i=>{const jersey=esJersey(i.description);const m=i.manga;
    const control=jersey?(editable&&tienePagos()?`<span class="t-manga-fija"><em class="t-manga ${m==='larga'?'larga':m?'':'falta'}">${m?`Manga ${esc(m)}`:'Manga sin definir'}</em><button type="button" class="t-link" data-manga-item="${esc(i.id)}" data-m="${m==='larga'?'corta':'larga'}">Cambiar</button></span>`:editable?`<div class="t-seg mini" role="group" aria-label="Manga">${['corta','larga'].map(v=>`<button type="button" data-manga-item="${esc(i.id)}" data-m="${v}" class="${m===v?'activo':''}" aria-pressed="${m===v}">${v==='larga'?'Larga':'Corta'}</button>`).join('')}</div>`:`<em class="t-manga ${m==='larga'?'larga':m?'':'falta'}">${m?`Manga ${esc(m)}`:'Manga sin definir'}</em>`):'';
    return `<li><div><b>${esc(i.description||'Pieza')}</b><span>${esc([i.talla?`Talla ${i.talla}`:null,i.nombre,i.numero?`#${i.numero}`:null].filter(Boolean).join(' · ')||'Sin variante')}</span>${i.obs?`<small class="t-obs">${esc(i.obs)}</small>`:''}</div>${control}</li>`;}).join('');
  box.innerHTML=`<div class="t-res-quien"><span class="t-avatar grande" aria-hidden="true">${esc(iniciales(quien))}</span><div><strong>${esc(quien)}</strong><span>${t.playerName?`Pidió ${esc(d.customer_name||'—')}`:'Sin jugador ligado'}${t.playerCategory?` · ${esc(t.playerCategory)}`:''}</span></div></div>
    <dl class="t-res-datos"><div><dt>Cómo llegó</dt><dd>${esc(ORIGEN[t.source]||'—')}</dd></div><div><dt>Atendió</dt><dd>${canWrite?`<select id="tAtendio" aria-label="Quién del club atendió"><option value="">${t.attendedName&&!t.attendedManual?`${esc(t.attendedName)} (automático)`:'Nadie todavía'}</option>${opciones}</select>`:esc(t.attendedName||'—')}</dd></div></dl>
    ${t.notes?`<p class="t-nota"><b>Nota del pedido</b>${esc(t.notes)}</p>`:''}
    ${piezas?`<ul class="t-res-piezas">${piezas}</ul>`:''}
    ${barraNumero(d)}`;
  if(canWrite){const sel=$('tAtendio');if(sel&&t.attendedManual)sel.value=t.attendedBy||'';}
}
/* Pedido con pagos (22/10/2026): ya no se cambia de un toque. "Que deba
   ponerse en editar y que diga por qué se cambió": se edita con motivo y
   queda en la bitácora de Presidencia (v2_edit_order_item). */
/* La primera vez abre en la etapa que pide algo: validar, mandar al
   proveedor, recibir o entregar. Si nada pide, en Todos. */
let etapaElegida=false;
function eligeEtapaInicial(){
  if(etapaElegida||new URLSearchParams(location.search).get('pedido'))return;etapaElegida=true;
  const k=['@por_validar','@para_proveedor','@para_entregar','@con_proveedor'].find(k=>cuentaDe(k)>0);
  if(k)$('statusFilter').value=k;
}
const fechaCorta=v=>v?new Intl.DateTimeFormat('es-MX',{weekday:'short',day:'numeric',month:'short'}).format(new Date(String(v).length<=10?`${v}T12:00:00`:v)).replace('.',''):'';
// Lo que se hace en cada etapa, arriba de la lista.
const PALOMITA='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
let editaProv=false;
const ahora=(tono,paso,titulo,sub,resto='')=>`<div class="t-ahora ${tono}"><small>Paso ${paso} de 5</small><h2>${titulo}</h2>${sub?`<p>${sub}</p>`:''}${resto}</div>`;
const nadaPorHacer=(titulo,sub)=>`<div class="t-ahora vacio"><span class="t-ahora-ok">${PALOMITA}</span><h2>${titulo}</h2><p>${sub}</p></div>`;
function pintaEtapa(){
  const box=$('tEtapa');if(!box)return;const f=$('statusFilter').value,k=f==='__cobrar'?'cobrar':f.startsWith('@')?f.slice(1):'';
  const lista=orders.filter(o=>vigente(o)&&etapaDe(o)===k);let html='';
  if(k==='por_validar')html=lista.length?ahora('naranja',1,`${lista.length} por revisar`,'Confirma con la familia talla, nombre y número. Ya revisado y pagado, pasa solo a Mandar.','<button type="button" class="t-grande" data-revisa>Revisar ahora</button>'):nadaPorHacer('Nada por revisar','Los pedidos nuevos aparecen aquí.');
  else if(k==='cobrar'){const debe=orders.filter(o=>vigente(o)&&saldoDe(o)>0.005),total=debe.reduce((n,o)=>n+saldoDe(o),0);
    html=debe.length?ahora('rojo',2,`Faltan ${money.format(total)}`,`${debe.length} ${debe.length===1?'pedido sin pagar completo':'pedidos sin pagar completo'}. Mándales recordatorio por WhatsApp; al pagar, pasan solos a Mandar.`):nadaPorHacer('Nadie debe','Todo está pagado.');}
  else if(k==='para_proveedor'){
    if(!lista.length)html=nadaPorHacer('Nada por mandar','Cuando un pedido esté revisado y pagado, aparece aquí.');
    else{const prov=proveedor(),nombres=lista.map(o=>tablero[o.id]?.playerName||o.customer_name||'Sin nombre');
      const chips=`<ul class="t-chips">${nombres.slice(0,8).map(n=>`<li>${esc(n)}</li>`).join('')}${nombres.length>8?`<li class="mas">+${nombres.length-8}</li>`:''}</ul>`;
      const campo=(!prov||editaProv)?`<label class="t-prov-campo"><span>¿A quién se lo mandas?</span><input id="heroProv" maxlength="80" value="${esc(prov)}" placeholder="Ej. Tremor" autocomplete="off" enterkeyhint="send"></label>`:`<p class="t-prov">Proveedor: <b>${esc(prov)}</b> <button type="button" class="t-link-mini" data-cambia-prov>Cambiar</button></p>`;
      const boton=canManage?`<button type="button" class="t-grande verde" data-mandar>${prov&&!editaProv?`Mandar a ${esc(prov)}`:'Mandar al proveedor'}</button><p class="t-ahora-pie">Se arma el PDF y lo mandas por WhatsApp.</p>`:'<p class="t-ahora-pie">Sólo quien administra la Tienda puede mandarlo.</p>';
      html=ahora('verde',3,`${lista.length} ${lista.length===1?'pedido listo':'pedidos listos'} · ${piezasDe(lista)} piezas`,'Todos pagados y revisados.',chips+(canManage?campo:'')+boton);}
  }else if(k==='con_proveedor'){
    if(!lista.length)html=nadaPorHacer('Nada en camino','Lo que mandes al proveedor aparece aquí hasta que llegue.');
    else{const envios=new Map();
      lista.forEach(o=>{const b=etapas[o.id]?.batch;const key=b?.id||'sin';if(!envios.has(key))envios.set(key,{b,n:0});envios.get(key).n++;});
      const filas=[...envios.values()].map(c=>c.b?`<div class="t-envio"><div><b>${esc(c.b.supplierName||'Proveedor')}</b><span>Enviado el ${esc(fechaCorta(c.b.submittedOn))} · ${c.n} ${c.n===1?'pedido':'pedidos'} · folio ${esc(c.b.folio)}</span></div><div class="t-envio-acc">${canManage?`<button type="button" class="t-grande azul" data-llego="${esc(c.b.id)}">Ya llegó</button>`:''}<button type="button" class="t-link-mini" data-pdf="${esc(c.b.id)}">Ver PDF</button></div></div>`:`<div class="t-envio"><div><b>Sin envío</b><span>${c.n} marcado${c.n===1?'':'s'} a mano. Si fue por error, ábrelo y toca "Regresar un paso".</span></div></div>`).join('');
      html=ahora('azul',4,envios.size===1&&[...envios.values()][0].b?.supplierName?`¿Ya llegó lo de ${esc([...envios.values()][0].b.supplierName)}?`:'¿Ya llegó?','Cuando llegue al club, tócalo. Luego avisas a cada familia.',filas);}
  }else if(k==='para_entregar')html=lista.length?ahora('oro',5,`${lista.length} ${lista.length===1?'pedido':'pedidos'} en el club`,'Avisa a la familia y márcalo entregado cuando se lo lleve. Los botones están en cada pedido.'):nadaPorHacer('Nada por entregar','Lo que llegue del proveedor aparece aquí.');
  box.innerHTML=html;box.classList.toggle('hidden',!html);
  const inp=$('heroProv');if(inp)inp.addEventListener('input',()=>{const b=box.querySelector('[data-mandar]');if(b)b.textContent=inp.value.trim()?`Mandar a ${inp.value.trim()}`:'Mandar al proveedor';});
}
/* Mandar (29/10/2026, ronda 2): un toque. La lista de abajo y los nombres de
   la tarjeta ya dicen qué va; al tocar "Mandar a Tremor" se arma el envío y el
   PDF, y sube una hoja con dos botones grandes: WhatsApp y Descargar. */
let envio=null;
function cierraEnvio(){envio=null;$('envioHoja')?.remove();$('envioFondo')?.remove();document.body.style.overflow='';}
function pintaEnvio(){
  const h=$('envioHoja');if(!h||!envio)return;
  const cierra='<button type="button" class="pres-close" data-envio-cierra aria-label="Cerrar">×</button>';
  if(envio.enviando){h.innerHTML=`<div class="envio-listo"><span class="envio-gira" aria-hidden="true"></span><h2>Mandando a ${esc(envio.prov)}…</h2><p>Armando el PDF con ${envio.lista.length} ${envio.lista.length===1?'pedido':'pedidos'}.</p></div>`;return;}
  if(envio.listo){const b=envio.listo;
    h.innerHTML=`<div class="envio-tope">${cierra}</div><div class="envio-listo"><div class="envio-palomita">${PALOMITA}</div><h2>Listo, va con ${esc(envio.prov)}</h2>
        <p>${envio.lista.length===1?'1 pedido':`${envio.lista.length} pedidos`} · ${piezasDe(envio.lista)} piezas · folio <b>${esc(b.folio||'')}</b></p></div>
      <button type="button" class="pres-primary envio-btn" data-envio-wa>Mandar PDF por WhatsApp</button>
      <button type="button" class="envio-sec" data-envio-pdf>Descargar PDF</button>
      ${envio.error?`<div class="pres-error" role="alert">${esc(envio.error)}</div>`:''}
      <button type="button" class="envio-link" data-envio-cierra>Listo</button>`;
    return;}
  h.innerHTML=`<div class="envio-tope">${cierra}</div><div class="envio-listo"><h2>No se pudo mandar</h2></div><div class="pres-error" role="alert">${esc(envio.error||'Intenta otra vez.')}</div>
    <button type="button" class="pres-primary envio-btn" data-envio-manda>Intentar otra vez</button>
    <button type="button" class="envio-link" data-envio-cierra>Cerrar</button>`;
}
function mandarAlProveedor(){
  const lista=orders.filter(o=>vigente(o)&&etapaDe(o)==='para_proveedor');if(!lista.length)return;
  const inp=$('heroProv'),prov=(inp?inp.value:proveedor()).trim();
  if(!prov){inp?.classList.add('falta');inp?.focus();return;}
  try{localStorage.setItem('tos-proveedor',prov);}catch{}editaProv=false;
  envio={lista,prov,enviando:false,error:'',listo:null,doc:null,nombre:''};
  document.body.insertAdjacentHTML('beforeend','<div id="envioFondo" class="pres-backdrop"></div><section id="envioHoja" class="pres-sheet envio-hoja" role="dialog" aria-modal="true" aria-label="Mandar al proveedor"></section>');
  document.body.style.overflow='hidden';
  $('envioFondo').addEventListener('click',()=>{if(!envio?.enviando)cierraEnvio();});
  $('envioHoja').addEventListener('click',async e=>{
    if(!envio)return;
    if(e.target.closest('[data-envio-cierra]')){if(!envio.enviando)cierraEnvio();return;}
    if(e.target.closest('[data-envio-manda]'))return mandaEnvio();
    // Compartir necesita un toque fresco: por eso es un botón aquí, no después de esperar.
    if(e.target.closest('[data-envio-wa]')){try{const como=await compartePdf(envio.doc,envio.nombre,`Pedido ${envio.listo?.folio||''} · ${ctx.organization_name||''}`);if(como==='descargado'){envio.error='En la compu se descarga: adjúntalo en WhatsApp Web o Business.';pintaEnvio();}}catch(err){envio.error=err.message||'No se pudo compartir.';pintaEnvio();}return;}
    if(e.target.closest('[data-envio-pdf]')){envio.doc?.save(envio.nombre);return;}
  });
  mandaEnvio();
}
async function mandaEnvio(){
  if(!envio||envio.enviando)return;
  envio.enviando=true;envio.error='';pintaEnvio();
  try{
    // Si ya se creó el envío y falló el PDF, no se crea otro.
    if(!envio.batchId){const r=await rpc('v2_create_production_batch',{organization_id:ctx.organization_id,order_ids:envio.lista.map(o=>o.id),supplier_name:envio.prov,notes:null});envio.batchId=r?.id||r?.batchId||r?.batch_id||r;}
    const sheet=await rpc('v2_production_batch_sheet',{organization_id:ctx.organization_id,batch_id:envio.batchId});
    const fotos=await cargaFotos(supabase,sheet).catch(()=>({}));
    envio.doc=await hojaPdf({sheet,orgName:ctx.organization_name,fotos});envio.nombre=nombreDelPdf(sheet);
    envio.listo={id:envio.batchId,folio:sheet?.batch?.folio||''};envio.enviando=false;
    $('statusFilter').value='@con_proveedor';await load();pintaEnvio();
  }catch(e){if(!envio)return;envio.enviando=false;envio.error=e.message||String(e);if(envio.batchId)await load().catch(()=>{});pintaEnvio();}
}
async function compartirCorte(batchId,recien){
  try{
    const sheet=await rpc('v2_production_batch_sheet',{organization_id:ctx.organization_id,batch_id:batchId});
    const fotos=await cargaFotos(supabase,sheet).catch(()=>({}));
    const doc=await hojaPdf({sheet,orgName:ctx.organization_name,fotos});
    const nombre=nombreDelPdf(sheet),texto=`Hoja de producción ${sheet?.batch?.folio||''} · ${ctx.organization_name||''}`;
    // Compartir necesita un toque fresco (el teléfono no deja compartir
    // después de esperar a la base y al PDF): por eso se pregunta aquí.
    const ok=await window.tosConfirm({kicker:recien?'CORTE LISTO':'PDF DEL CORTE',title:recien?`Corte ${sheet?.batch?.folio||''} enviado`:`Corte ${sheet?.batch?.folio||''}`,message:recien?'Ya está en "Con el proveedor". ¿Compartimos el PDF por WhatsApp?':'El PDF está listo para mandarlo al proveedor.',confirmText:'Compartir PDF',cancelText:recien?'Después':'Cerrar'});
    if(!ok)return;
    const como=await compartePdf(doc,nombre,texto);
    if(como==='descargado')await window.tosAlert({kicker:'PDF',title:'PDF descargado',message:'Desde la compu se descarga: adjúntalo en WhatsApp Business. En el teléfono se abre directo para compartir.'});
  }catch(e){await window.tosAlert({kicker:'PDF',title:'No se pudo armar el PDF',message:e.message||String(e)});}
}
async function yaLlego(batchId,btn){
  const ok=await window.tosConfirm({kicker:'LLEGÓ EL CORTE',title:'¿Ya llegó a la tienda?',message:'Sus pedidos pasan a "Para entregar" para avisar a cada familia.',confirmText:'Sí, ya llegó'});
  if(!ok)return;btn.disabled=true;
  try{await rpc('v2_receive_production_batch',{organization_id:ctx.organization_id,batch_id:batchId});$('statusFilter').value='@para_entregar';await load();}
  catch(e){btn.disabled=false;await window.tosAlert({kicker:'LLEGÓ EL CORTE',title:'No se pudo marcar',message:e.message||String(e)});}
}
$('tEtapa')?.addEventListener('click',e=>{
  const m=e.target.closest('[data-mandar]');if(m){mandarAlProveedor();return;}
  if(e.target.closest('[data-cambia-prov]')){editaProv=true;pintaEtapa();$('heroProv')?.select();return;}
  if(e.target.closest('[data-revisa]')){const o=filteredOrders()[0];if(o)openOrder(o);return;}
  const p=e.target.closest('[data-pdf]');if(p){p.disabled=true;compartirCorte(p.dataset.pdf,false).finally(()=>{p.disabled=false;});return;}
  const l=e.target.closest('[data-llego]');if(l)yaLlego(l.dataset.llego,l);
});
$('tEtapa')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='heroProv'){e.preventDefault();mandarAlProveedor();}});
/* En "Entregar", cada pedido trae sus dos botones a la vista: avisar por
   WhatsApp y Entregado. Sin abrir el pedido (29/10/2026). */
function ligaAviso(d){const quien=tablero[d.id]?.playerName||'tu pedido';
  const texto=`Hola, ya llegó el pedido ${d.folio} de ${quien} a la tienda de ${clubCfg?.name||ctx.organization_name||'el club'}. Puedes pasar por él cuando gustes. Recuerda que tienes 30 días para recogerlo; después el club ya no se hace responsable de la prenda.`;
  return `${waLink(d.customer_phone)}?text=${encodeURIComponent(texto)}`;}
function accionesDeFila(o){
  if(!vigente(o)||etapaDe(o)!=='para_entregar')return '';
  const wa=canWrite&&waLink(o.customer_phone),ent=canManage;if(!wa&&!ent)return '';
  return `<div class="t-fila-acc">${wa?`<a class="t-fila-btn wa" data-avisa href="${esc(ligaAviso(o))}" target="_blank" rel="noopener">Avisar por WhatsApp</a>`:''}${ent?'<button type="button" class="t-fila-btn" data-entregado>Entregado</button>':''}</div>`;}
async function entregaDeFila(o,btn){
  const quien=tablero[o.id]?.playerName||o.customer_name||o.folio;
  const ok=await window.tosConfirm({kicker:'ENTREGAR',title:`¿Ya se lo llevaron?`,message:`El pedido de ${quien} queda como entregado.`,confirmText:'Sí, entregado'});
  if(!ok)return;btn.disabled=true;
  try{await rpc('v2_update_order_status',{organization_id:ctx.organization_id,order_id:o.id,new_status:'delivered'});await load();}
  catch(e){btn.disabled=false;await window.tosAlert({kicker:'ENTREGAR',title:'No se pudo marcar',message:e.message||String(e)});}
}
/* Lo que sigue con este pedido, a la vista (22/10/2026). "Regresar un paso"
   pide el motivo y queda en la bitácora: es lo que faltó cuando se marcó
   Listo para sacar el PDF del proveedor. */
function pintaPaso(){
  const box=$('pasoAcciones');if(!box||!current)return;const d=current.order,b=etapas[d.id]?.batch;
  const atras=canManage&&(d.status==='delivered'||d.status==='ready'||(d.status==='in_production'&&!(b&&b.status==='submitted')));
  const wa=d.status==='ready'&&canWrite&&waLink(d.customer_phone);
  const entrega=d.status==='ready'&&canManage;
  const prov=canWrite&&['paid','partial_payment','in_production'].includes(d.status);
  box.innerHTML=`${prov?'<button type="button" class="t-btn wa" data-paso="proveedor">WhatsApp al proveedor</button>':''}${wa?'<button type="button" class="t-btn wa" data-paso="avisar">Avisar que ya llegó</button>':''}${entrega?'<button type="button" class="t-btn" data-paso="entregar">Entregado</button>':''}${atras?'<button type="button" class="t-link" data-paso="atras">Regresar un paso</button>':''}`;
  box.classList.toggle('hidden',!box.innerHTML);
}
async function accionPaso(k,btn){
  const d=current?.order;if(!d)return;
  if(k==='avisar'){
    window.open(ligaAviso(d),'_blank','noopener');return;
  }
  if(k==='entregar'){await changeStatus('delivered','Marcar entregado');return;}
  if(k==='proveedor'){await waProveedor();return;}
  if(k==='atras'){
    const motivo=await window.tosPrompt({kicker:'REGRESAR UN PASO',title:`Regresar ${d.folio}`,message:'Queda en la bitácora con tu nombre.',placeholder:'¿Por qué? Ej. lo marcamos listo por error',required:true,requiredText:'Escribe el motivo.',confirmText:'Regresar',maxlength:200});
    if(!motivo)return;btn.disabled=true;
    try{const r=await rpc('v2_order_step_back',{organization_id:ctx.organization_id,order_id:d.id,reason:motivo});await refreshCurrent(d.id);msg(`Regresó a "${labels[r?.to]||r?.to||'el paso anterior'}".`,'success');}
    catch(e){btn.disabled=false;msg(e.message||'No se pudo regresar.');}
  }
}
$('pasoAcciones')?.addEventListener('click',e=>{const b=e.target.closest('[data-paso]');if(b)accionPaso(b.dataset.paso,b);});
/* WhatsApp al proveedor (25/10/2026): el pedido escrito tal cual va a la
   prenda. Nunca sale con el número sin confirmar. El teléfono del proveedor se
   recuerda en este equipo. */
function textoProveedor(){
  const d=current.order,club=clubCfg?.name||ctx.organization_name||'el club';
  const lineas=(current.items||[]).map(i=>{const a=i.attributes||{},talla=a.talla||a.size||'',nom=a.nombrePers||a.personalizationName||'',num=a.numero||a.number||'',q=Number(i.quantity||1);
    return '- '+[`${q>1?`${q} x `:''}${i.description||'Pieza'}`,talla?`Talla ${talla}`:null,a.manga==='larga'?'MANGA LARGA':a.manga==='corta'?'Manga corta':null,
      num||nom?`Espalda: ${nom?nom.toUpperCase():'SIN NOMBRE'}${num?` #${num}`:''}`:null,a.obs?`Nota: ${a.obs}`:null].filter(Boolean).join(' | ');});
  return `Pedido ${d.folio} · ${club}\n\n${lineas.join('\n')}\n\nEn la espalda va exactamente lo que dice aquí. Gracias.`;
}
const telProveedor=()=>{try{return localStorage.getItem('tos-proveedor-tel')||'';}catch{return '';}};
async function cambiaTelProveedor(){
  const v=await window.tosPrompt({kicker:'PROVEEDOR',title:'WhatsApp del proveedor',message:'Se guarda en este equipo para la próxima.',placeholder:'10 dígitos',value:telProveedor().replace(/^52/,''),required:true,requiredText:'Escribe el número.',confirmText:'Guardar',maxlength:16});
  if(!v)return '';let t=String(v).replace(/\D/g,'');if(t.length===10)t='52'+t;
  try{localStorage.setItem('tos-proveedor-tel',t);}catch{}pintaTelProveedor();return t;
}
async function waProveedor(){
  const falta=current?.readiness?.missing||[];
  if(falta.includes('número sin confirmar')){await window.tosAlert({kicker:'PROVEEDOR',title:'Confirma el número primero',message:'Este pedido trae un número que el club no ha confirmado con la familia. Confírmalo y luego lo mandas.'});return;}
  const tel=telProveedor()||await cambiaTelProveedor();if(!tel)return;
  window.open(`https://wa.me/${tel}?text=${encodeURIComponent(textoProveedor())}`,'_blank','noopener');
}
function pintaTelProveedor(){const b=$('telProveedor');if(!b)return;const t=telProveedor();b.textContent=t?`WhatsApp del proveedor: ${t.replace(/^52/,'')} · Cambiar`:'Guardar el WhatsApp del proveedor';}
/* "No está pagado" (25/10/2026): si se marcó un cobro que no llegó, se
   revierten sus cobros con el motivo, y queda en la bitácora. */
function pintaNoPagado(){
  const b=$('noPagado');if(!b)return;const pagos=(current?.payments||[]).filter(p=>p.status==='posted');
  // Cancelado o reembolsado ya no tiene cobro que corregir (h47).
  const st=current?.order?.status;
  b.classList.toggle('hidden',!(canCorrect&&pagos.length&&!['cancelled','refunded','draft'].includes(st)));
}
async function noPagado(){
  const pagos=(current?.payments||[]).filter(p=>p.status==='posted');if(!pagos.length)return;
  const total=pagos.reduce((n,p)=>n+Number(p.amount||0),0);
  /* En producción, listo o entregado (27/10/2026, h47): el uniforme ya se
     mandó a hacer, así que el pedido se queda en su etapa y sólo queda con
     saldo por cobrar. Antes aquí salía un error y no había cómo decirlo. */
  const st=current?.order?.status,avanzado=['in_production','ready','delivered'].includes(st);
  const queda=avanzado?`El pedido se queda en "${labels[st]||st}" (ya se mandó a hacer) y queda con ${money.format(total)} por cobrar.`:'El pedido vuelve a "por cobrar".';
  const motivo=await window.tosPrompt({kicker:'COBRO',title:'¿No está pagado?',message:`Se quitan ${pagos.length===1?'el cobro':`los ${pagos.length} cobros`} por ${money.format(total)}. ${queda} Queda en la bitácora con tu nombre.`,placeholder:'¿Qué pasó? Ej. la transferencia no llegó',required:true,requiredText:'Escribe el motivo.',confirmText:'Sí, no está pagado',danger:true,maxlength:200});
  if(!motivo)return;const b=$('noPagado');b.disabled=true;
  try{for(const p of pagos)await rpc('v2_correct_order_payment',{organization_id:ctx.organization_id,payment_id:p.id,reason:motivo});
    await refreshCurrent(current.order.id);payMsg(avanzado?`Listo: quedan ${money.format(total)} por cobrar y el pedido sigue en su etapa.`:'Listo: el pedido quedó sin pago. El saldo ya se actualizó.','success');}
  catch(e){payMsg(e.message||'No se pudo quitar el pago.');b.disabled=false;}
}
function muestraZona(){const z=$('dangerZone');if(z)z.style.display=canCorrect?'':'none';}
const tienePagos=()=>!!current&&Number(current.order?.total||0)-Number(current.balance||0)>0.004;
async function editaConMotivo(itemId,cambios,titulo){
  const motivo=await window.tosPrompt({kicker:'PEDIDO PAGADO',title:titulo,message:'Este pedido ya tiene pagos. El cambio queda en la bitácora con tu nombre.',placeholder:'¿Por qué se cambia? Ej. la mamá pidió manga larga',required:true,requiredText:'Escribe el motivo.',confirmText:'Guardar cambio',maxlength:200});
  if(!motivo)return false;
  const di=(current.items||[]).find(x=>x.id===itemId),a=di?.attributes||{};
  const base={size:a.talla||a.size||null,manga:a.manga||null,personalization_name:a.nombrePers||a.personalizationName||null,number:a.numero||a.number||null,notes:a.obs||null};
  await rpc('v2_edit_order_item',{organization_id:ctx.organization_id,order_item_id:itemId,...base,...cambios,reason:motivo});
  return true;
}
async function cambiaManga(itemId,manga,btn){
  if(tienePagos()){
    try{if(await editaConMotivo(itemId,{manga},`Cambiar a manga ${manga}`)){await refreshCurrent(current.order.id);msg(`Manga ${manga} guardada con su motivo.`,'success');}}
    catch(e){msg(e.message||'No se pudo guardar la manga.');}
    return;
  }
  btn.disabled=true;
  try{await rpc('v2_set_order_item_sleeve',{organization_id:ctx.organization_id,order_item_id:itemId,manga});
    const t=tablero[current.order.id];const it=(t?.items||[]).find(x=>x.id===itemId);if(it)it.manga=manga;
    const di=(current.items||[]).find(x=>x.id===itemId);if(di)di.attributes={...(di.attributes||{}),manga};
    pintaResumen();render();msg(`Manga ${manga} guardada.`,'success');}
  catch(e){btn.disabled=false;msg(e.message||'No se pudo guardar la manga.');}
}
async function cambiaAtendio(userId){
  try{await rpc('v2_set_order_attendant',{organization_id:ctx.organization_id,order_id:current.order.id,user_id:userId||null});
    const t=tablero[current.order.id]||(tablero[current.order.id]={items:[]});const s=(staffDelClub||[]).find(x=>x.userId===userId);
    t.attendedManual=!!userId;if(userId){t.attendedBy=userId;t.attendedName=s?.name||t.attendedName;}
    render();msg(userId?`Quedó: lo atendió ${s?.name||'esa persona'}.`:'Se quitó quién lo atendió.','success');}
  catch(e){msg(e.message||'No se pudo guardar quién lo atendió.');}
}
async function fetchDetail(order){try{const d=await rpc('v2_order_detail',{organization_id:ctx.organization_id,order_id:order.id});details.set(order.id,d);return d;}catch{return null;}}
async function loadBusinessMetrics(){if(!canViewFinance)return;const run=++metricsRun,rows=orders.filter(vigente);$('metricsStatus').textContent='Calculando…';for(let i=0;i<rows.length;i+=8){const batch=rows.slice(i,i+8).filter(o=>!details.has(o.id));if(batch.length)await Promise.all(batch.map(fetchDetail));if(run!==metricsRun)return;}if(run!==metricsRun)return;renderBusinessMetrics(rows);render();}
function renderBusinessMetrics(rows){if(!canViewFinance||!$('bizSales'))return;let sales=0,collected=0,receivable=0,cost=0,knownSales=0,profit=0,complete=0,resolved=0;rows.forEach(o=>{sales+=Number(o.total||0);const d=details.get(o.id);if(!d)return;resolved++;collected+=Number(d.paidAmount||0);receivable+=Math.max(0,Number(d.balance||0));if(d.costComplete){complete++;cost+=Number(d.costTotal||0);knownSales+=Number(d.order?.total??o.total??0);profit+=Number(d.grossProfitExpected||0);}});$('bizSales').textContent=money.format(sales);$('bizCollected').textContent=money.format(collected);$('bizReceivable').textContent=money.format(receivable);$('bizCost').textContent=complete?money.format(cost):'Pendiente';$('bizProfit').textContent=complete?money.format(profit):'Pendiente';$('bizProfit').dataset.state=profit<0?'negative':'normal';$('bizMargin').textContent=complete&&knownSales>0?`${(profit/knownSales*100).toFixed(0)}%`:'—';$('costCoverage').textContent=`${complete}/${rows.length} pedido(s) con costo completo`;const incomplete=rows.length-complete,failed=rows.length-resolved;$('metricsStatus').textContent=failed?'Lectura parcial':incomplete?`${incomplete} sin costo completo`:'Costos completos';$('metricsStatus').dataset.state=failed?'attention':incomplete?'attention':'ok';}
function renderProfitability(){if(!canViewFinance)return;const cost=current?.costComplete?Number(current.costTotal||0):null,profit=current?.costComplete?Number(current.grossProfitExpected||0):null;$('orderCost').textContent=cost==null?'Pendiente':money.format(cost);$('orderProfit').textContent=profit==null?'Pendiente':money.format(profit);$('orderProfit').dataset.state=profit!=null&&profit<0?'negative':'normal';}
function renderPayments(d){
  const paid=Number(current?.paidAmount||0),balance=Number(current?.balance||0);
  $('orderPaid').textContent=money.format(paid);$('orderBalance').textContent=money.format(balance);
  const hist=$('paymentList');hist.innerHTML='';
  const rows=current?.payments||[];
  $('paymentEmpty').classList.toggle('hidden',rows.length>0);
  rows.forEach(p=>{
    const who=[payerLabels[p.payerType]||p.payerType,p.payerName].filter(Boolean).join(' · ');
    const canFix=canCorrect&&p.status==='posted';
    const statusLabel=p.status==='posted'?'Cobrado':p.status==='refunded'?'Corregido':esc(p.status);
    const row=document.createElement('article');row.className='payment-row';
    row.innerHTML=`<div class="payment-row-main"><div><strong>${money.format(Number(p.amount||0))}</strong><span>${fmtDate(p.paymentDate)} · ${esc(p.method||'otro')}${p.reference?` · ${esc(p.reference)}`:''}</span><small>${esc(who||'Pagador no especificado')}</small></div><div class="payment-row-side"><span class="payment-status ${esc(p.status)}">${statusLabel}</span>${canFix?'<button class="link-toggle correct-payment" type="button">Corregir</button>':''}</div></div>${canFix?'<div class="correct-form hidden"><textarea class="correct-reason" maxlength="200" placeholder="¿Por qué se corrige este cobro? (obligatorio, queda en la bitácora)"></textarea><div class="correct-actions"><button class="secondary mini cancel-correct" type="button">Cancelar</button><button class="danger mini confirm-correct" type="button">Confirmar corrección</button></div></div>':''}`;
    if(canFix){
      row.querySelector('.correct-payment').addEventListener('click',()=>row.querySelector('.correct-form').classList.toggle('hidden'));
      row.querySelector('.cancel-correct').addEventListener('click',()=>row.querySelector('.correct-form').classList.add('hidden'));
      row.querySelector('.confirm-correct').addEventListener('click',()=>correctPayment(p.id,row));
    }
    hist.appendChild(row);
  });
  const open=['pending_payment','partial_payment','in_production','ready'].includes(d.status)&&balance>0;const canPay=open&&canWrite;
  current.canPay=canPay;pintaCobro();pintaNoPagado();$('paymentClosedNote').classList.toggle('hidden',canPay);
  if(canPay){$('paymentAmount').value=balance.toFixed(2);$('paymentAmount').max=balance.toFixed(2);$('paymentDate').value=new Date().toISOString().slice(0,10);$('paymentPayerType').value='guardian';$('paymentPayer').value=d.customer_name||'';}
  payMsg();
}
/* El pedido de un niño se cobra con la hoja de Taquilla; sin niño ligado, o si lo
   paga un patrocinador, con el formulario de siempre. */
function pintaCobro(){
  const c=current;if(!c)return;const nino=c.linked,hoja=c.canPay&&cobraConHoja&&!!nino&&!otroPagador;
  $('cobroUnico').classList.toggle('hidden',!hoja);
  $('paymentForm').classList.toggle('hidden',!c.canPay||hoja);
  if(hoja)$('cobrarPedido').textContent=`Cobrar ${money.format(Number(c.balance||0))}`;
}
function cobrarConHoja(){
  const c=current;if(!c?.linked)return;const id=c.order.id;
  abrirCobro({rpc,org:ctx.organization_id,playerId:c.linked.id,nombre:c.linked.name,telefono:c.order.customer_phone||'',
    preseleccion:`o:${id}`,quien:ctx.display_name||'',compartida:esCuentaCompartida(ctx),alTerminar:()=>refreshCurrent(id)});
}
async function correctPayment(paymentId,row){
  const reason=row.querySelector('.correct-reason').value.trim();
  if(reason.length<3){payMsg('Escribe el motivo de la corrección (mínimo 3 caracteres).');return;}
  const ok=await confirmAction({kicker:'CORREGIR COBRO',title:'¿Corregir este cobro?',message:`Se revierte el monto y el saldo del pedido se recalcula. Motivo: "${reason}".`,confirmText:'Sí, corregir',danger:true});
  if(!ok)return;
  const btn=row.querySelector('.confirm-correct');btn.disabled=true;
  try{
    await rpc('v2_correct_order_payment',{organization_id:ctx.organization_id,payment_id:paymentId,reason});
    await refreshCurrent(current.order.id);
    payMsg('Cobro corregido. El saldo del pedido ya se actualizó.','success');
  }catch(e){payMsg(e.message||'No se pudo corregir el cobro.');btn.disabled=false;}
}
/* Qué falta, en palabras y con su botón (25/10/2026). Sólo antes de mandarlo:
   ya con el proveedor no hay nada que validar. */
const FALTA_TXT={'falta talla':'Falta la talla','falta número':'Falta el número','número sin confirmar':'Confirma el número con la familia','pago incompleto':'Falta cobrar','sin piezas':'No tiene piezas'};
function renderReadiness(){
  const r=current?.readiness||{},box=$('readinessBox'),d=current?.order;if(!box||!d)return;
  const antes=['draft','pending_payment','partial_payment','paid'].includes(d.status);
  box.classList.toggle('hidden',!antes);if(!antes)return;
  const falta=Array.isArray(r.missing)?r.missing:[],pct=Number(r.effectivePaymentRequirementPercent||100);
  box.dataset.ready=r.ok?'true':'false';
  $('readinessTitle').textContent=r.ok?'Listo para el proveedor':'Antes de mandarlo al proveedor';
  $('readinessText').innerHTML=r.ok?'Pagado, con tallas y número confirmado.'
    :falta.map(f=>`<span>${esc(f==='pago incompleto'&&pct<100?`Falta el anticipo del ${pct.toFixed(0)}%`:FALTA_TXT[f]||f)}</span>`).join('');
  $('readinessPayment').innerHTML=falta.includes('número sin confirmar')&&canWrite?`<button type="button" class="t-pill-btn" data-num-confirma="${esc(d.id)}">Confirmar número</button>`:`Pagado ${Number(r.paidPercent||0).toFixed(0)}%`;
}
/* Plan de pago por pedido: por defecto exige 100% antes de producción; Presidencia/Comercio
   puede bajarlo (ej. 50% anticipo) mientras el pedido no haya entrado a producción todavía.
   El saldo restante siempre se puede seguir cobrando en COBRANZA, y "Marcar entregado" exige
   el pago completo sin importar el plan (el plan solo adelanta cuándo empieza la producción). */
function renderPaymentPlan(d){
  const box=$('paymentPlanBox');if(!box)return;
  if(!canManage){box.classList.add('hidden');box.innerHTML='';return;}
  const pct=Number(current?.readiness?.effectivePaymentRequirementPercent||100);
  const editable=['draft','pending_payment','partial_payment','paid'].includes(d.status);
  box.classList.remove('hidden');
  box.innerHTML=`<div class="payment-plan-row"><span>${pct<100?`Plan de pago: anticipo ${pct.toFixed(0)}% para producción, resto a la entrega`:'Plan de pago: pago completo antes de producción'}</span>${editable?'<button id="editPaymentPlan" class="link-toggle" type="button">Editar</button>':''}</div><div id="paymentPlanForm" class="payment-plan-form hidden"></div>`;
  if(editable)$('editPaymentPlan').addEventListener('click',togglePaymentPlanForm);
}
function togglePaymentPlanForm(){
  const wrap=$('paymentPlanForm');if(!wrap)return;
  if(!wrap.classList.contains('hidden')){wrap.classList.add('hidden');wrap.innerHTML='';return;}
  const cur=Number(current?.readiness?.effectivePaymentRequirementPercent||100);
  wrap.innerHTML=`<label><span>Anticipo requerido para producción</span><select id="planPercent"><option value="100">100% (pago completo)</option><option value="50">50% (mitad ahora, mitad a la entrega)</option><option value="custom">Otro porcentaje…</option></select></label><input id="planPercentCustom" type="number" min="1" max="100" step="1" class="hidden" placeholder="% requerido"><button id="savePaymentPlan" class="primary mini" type="button">Guardar plan de pago</button><div id="paymentPlanMessage" class="inline-message hidden"></div>`;
  wrap.classList.remove('hidden');
  const sel=$('planPercent'),custom=$('planPercentCustom');
  sel.value=cur===100?'100':cur===50?'50':'custom';
  custom.classList.toggle('hidden',sel.value!=='custom');
  if(sel.value==='custom')custom.value=cur;
  sel.addEventListener('change',()=>custom.classList.toggle('hidden',sel.value!=='custom'));
  $('savePaymentPlan').addEventListener('click',savePaymentPlan);
}
async function savePaymentPlan(){
  const sel=$('planPercent').value;
  const pct=sel==='custom'?Number($('planPercentCustom').value):Number(sel);
  const pm=$('paymentPlanMessage');const setPm=(t,type='error')=>{if(!pm)return;pm.textContent=t;pm.dataset.type=type;pm.classList.toggle('hidden',!t);};
  if(!Number.isFinite(pct)||pct<=0||pct>100){setPm('Captura un porcentaje entre 1 y 100.');return;}
  const ok=await confirmAction({kicker:'PLAN DE PAGO',title:'¿Actualizar plan de pago?',message:pct>=100?`${current.order.folio} volverá a requerir el pago completo antes de producción.`:`${current.order.folio} podrá enviarse a producción con ${pct}% pagado. El resto se cobra antes de entregar.`,confirmText:'Sí, guardar'});
  if(!ok)return;
  const btn=$('savePaymentPlan');btn.disabled=true;
  try{await rpc('v2_set_order_payment_plan',{organization_id:ctx.organization_id,order_id:current.order.id,required_percent:pct>=100?null:pct});await refreshCurrent(current.order.id);}
  catch(e){setPm(e.message||'No se pudo actualizar el plan de pago.');btn.disabled=false;}
}
function renderStateActions(d){
  const wrap=$('statusActions');if(!wrap)return;wrap.innerHTML='';
  if(!canManage)return;
  const readyOk=!!current?.readiness?.ok,balance=Number(current?.balance||0);
  const primary=primaryNextStep(d.status,readyOk),skip=secondarySkip(d.status,readyOk),danger=dangerAction(d.status);
  const heldByBalance=!!primary&&primary.to==='delivered'&&balance>0.005;
  if(heldByBalance){
    const p=document.createElement('p');p.className='muted state-help';p.textContent=`Falta cobrar ${money.format(balance)} antes de poder entregar. Registra el cobro en COBRANZA.`;wrap.appendChild(p);
  }else if(primary){
    const b=document.createElement('button');b.type='button';b.className='primary status-btn';b.textContent=primary.label;b.addEventListener('click',()=>changeStatus(primary.to,primary.label,false));wrap.appendChild(b);
  }
  if(!heldByBalance&&skip){const b=document.createElement('button');b.type='button';b.className='secondary status-btn';b.textContent=skip.label;b.addEventListener('click',()=>changeStatus(skip.to,skip.label,false));wrap.appendChild(b);}
  if(d.status==='partial_payment'&&!primary){
    const p=document.createElement('p');p.className='muted state-help';p.textContent=`Aún no se puede enviar a producción: ${readinessText(current.readiness)}.`;wrap.appendChild(p);
  }
  if(danger){const b=document.createElement('button');b.type='button';b.className='danger status-btn';b.textContent=danger.label;b.addEventListener('click',()=>changeStatus(danger.to,danger.label,true));wrap.appendChild(b);}
  // Sin movimientos no se enseña nada: el paso ya lo dice el tracker.
  $('statusSection')?.classList.toggle('hidden',!wrap.children.length);
}
async function changeStatus(newStatus,label,danger){
  if(!current||!canManage)return;
  const ok=await confirmAction({kicker:'CAMBIAR ESTADO',title:label,message:`El pedido ${current.order.folio} pasará a "${labels[newStatus]||newStatus}". ¿Confirmas?`,confirmText:'Sí, confirmar',danger:!!danger});
  if(!ok)return;
  msg();
  try{await rpc('v2_update_order_status',{organization_id:ctx.organization_id,order_id:current.order.id,new_status:newStatus});await refreshCurrent(current.order.id);msg('Estado actualizado.','success');}
  catch(e){msg(e.message||'No se pudo actualizar el estado.');}
}
const WARRANTY_LABELS={opened:'Abierta',in_repair:'En reparación / reposición',ready:'Lista para entregar',delivered:'Entregada'};
async function renderWarranty(d){
  const section=$('warrantySection');if(!section)return;
  if(!canManage){section.classList.add('hidden');return;}
  let list=[];try{list=await rpc('v2_warranties',{organization_id:ctx.organization_id})||[];}catch{list=[];}
  if(!current||current.order.id!==d.id)return; // el usuario ya cambió de pedido mientras cargaba
  const mine=list.filter(w=>w.order_id===d.id);
  const canOpen=d.status==='delivered';
  let warrantyExpired=false,warrantyDaysLeft=null;
  if(canOpen&&d.delivered_at){
    const msLeft=new Date(d.delivered_at).getTime()+5*24*60*60*1000-Date.now();
    warrantyExpired=msLeft<=0;
    warrantyDaysLeft=Math.max(0,Math.ceil(msLeft/(24*60*60*1000)));
  }
  const canOpenNow=canOpen&&!warrantyExpired;
  if(!canOpen&&!mine.length){section.classList.add('hidden');return;}
  section.classList.remove('hidden');
  const body=$('warrantyBody');
  let html='';
  if(mine.length)html+=`<div class="warranty-list">${mine.map(w=>`<div class="warranty-row"><div><strong>${esc(w.folio)}</strong><span>${esc(w.reason)}</span></div><div class="warranty-row-side"><span class="payment-status">${WARRANTY_LABELS[w.status]||esc(w.status)}</span>${w.status==='ready'?`<button class="secondary mini deliver-warranty" data-id="${esc(w.id)}" type="button">Marcar entregada</button>`:''}</div></div>`).join('')}</div>`;
  if(canOpenNow){
    html+='<button id="openWarrantyBtn" class="secondary" type="button">Abrir garantía de una pieza</button><div id="warrantyForm" class="hidden"></div>';
    if(warrantyDaysLeft!==null)html+=`<p class="muted state-help">Quedan ${warrantyDaysLeft} día(s) para abrir garantía sobre este pedido.</p>`;
  }else if(canOpen&&warrantyExpired){
    html+='<p class="muted state-help">La ventana de garantía (5 días desde la entrega) ya venció para este pedido.</p>';
  }
  body.innerHTML=html;
  body.querySelectorAll('.deliver-warranty').forEach(b=>b.addEventListener('click',()=>deliverWarranty(b.dataset.id)));
  if(canOpenNow)$('openWarrantyBtn')?.addEventListener('click',toggleWarrantyForm);
}
function toggleWarrantyForm(){
  const wrap=$('warrantyForm');if(!wrap)return;
  if(!wrap.classList.contains('hidden')){wrap.classList.add('hidden');wrap.innerHTML='';return;}
  const items=current?.items||[];
  wrap.innerHTML=`<div class="warranty-items">${items.map(i=>`<label class="warranty-item-pick"><input type="checkbox" value="${esc(i.id)}"> ${esc(i.description)}</label>`).join('')}</div><textarea id="warrantyReason" maxlength="200" placeholder="¿Qué falló? (obligatorio)"></textarea><button id="submitWarranty" class="primary" type="button">Registrar garantía</button><div id="warrantyMessage" class="inline-message hidden"></div>`;
  wrap.classList.remove('hidden');
  $('submitWarranty').addEventListener('click',submitWarranty);
}
async function submitWarranty(){
  const reason=$('warrantyReason').value.trim();
  const picked=[...document.querySelectorAll('.warranty-item-pick input:checked')].map(i=>({order_item_id:i.value}));
  const wm=$('warrantyMessage');const setWm=(t,type='error')=>{if(!wm)return;wm.textContent=t;wm.dataset.type=type;wm.classList.toggle('hidden',!t);};
  if(reason.length<3){setWm('Escribe qué falló.');return;}
  if(!picked.length){setWm('Selecciona al menos una pieza.');return;}
  const ok=await confirmAction({kicker:'GARANTÍA',title:'Abrir garantía',message:`Se abrirá una garantía para ${picked.length} pieza(s) de ${current.order.folio}.`,confirmText:'Sí, abrir'});
  if(!ok)return;
  const btn=$('submitWarranty');btn.disabled=true;
  try{await rpc('v2_open_warranty',{organization_id:ctx.organization_id,order_id:current.order.id,reason,items:picked});await refreshCurrent(current.order.id);}
  catch(e){setWm(e.message||'No se pudo abrir la garantía.');btn.disabled=false;}
}
async function deliverWarranty(id){
  const ok=await confirmAction({kicker:'GARANTÍA',title:'Marcar entregada',message:'¿Confirmas que ya se entregó la pieza de reposición al Tanner?',confirmText:'Sí, entregada'});
  if(!ok)return;
  try{await rpc('v2_deliver_warranty',{organization_id:ctx.organization_id,warranty_id:id});await refreshCurrent(current.order.id);}
  catch(e){msg(e.message||'No se pudo marcar como entregada.');}
}
function itemEditor(i,d){
  const a=i.attributes||{},editable=canManage&&['draft','pending_payment','partial_payment','paid'].includes(d.status);
  const talla=a.talla||a.size||'',nombre=a.nombrePers||a.personalizationName||'',numero=a.numero||a.number||'';
  const chips=[itemChip('Talla',talla),itemChip('Manga',textoMangaCorto(a.manga)),itemChip('Nombre',nombre),itemChip('Número',numero)].filter(Boolean).join('');
  const complete=itemComplete(i),lineTotal=Number(i.quantity||0)*Number(i.unitPrice||0);
  return `<article class="item-row ${editable?'editable':''}" data-item-id="${esc(i.id)}">
    <div class="item-summary">
      <div class="item-thumb">${itemThumb(i)}</div>
      <div class="item-info">
        <strong>${esc(i.description)}</strong>
        <div class="item-chips">${chips||'<span class="item-chip muted">Sin variante capturada</span>'}</div>
        <span class="item-qty">${i.quantity} × ${money.format(Number(i.unitPrice||0))}</span>
      </div>
      <div class="item-price"><b>${money.format(lineTotal)}</b><span class="item-badge ${complete?'ok':'warn'}">${complete?'Completo':'Falta info'}</span></div>
    </div>
    ${editable?`<div class="item-editor"><label>Talla / medida<input class="item-size" value="${esc(talla)}" maxlength="40"></label><label>Nombre<input class="item-name" value="${esc(nombre)}" maxlength="80" placeholder="Si aplica"></label><label>Número<input class="item-number" value="${esc(numero)}" maxlength="4" inputmode="numeric" placeholder="Si aplica"></label><label>Observación<input class="item-note" value="${esc(a.obs||'')}" maxlength="200"></label><button class="secondary save-item" type="button">Guardar pieza</button></div>`:''}
  </article>`;
}
/* Agrupación de kits/paquetes: cuando un pedido viene de un kit (app.product_bundles), el
   backend reparte el precio del kit entre varias filas de order_items (una por prenda) para
   que producción y finanzas tengan costo/talla por pieza. Mostrar esas filas sueltas con su
   precio "derivado" confunde — el cliente compró UN kit a UN precio, no N prendas sueltas.
   Detectamos el grupo por 'kitInstanceId' (pedidos migrados del sistema anterior) o 'bundleId'
   (pedidos nuevos desde la tienda pública); el nombre visible sale de 'esPaquete' o 'bundleName'.
   Las piezas se siguen editando una por una (cada una puede tener su propia talla). */
function kitKey(i){const a=i.attributes||{};return a.bundleId||a.kitInstanceId||null;}
function kitLabel(i){const a=i.attributes||{};return a.bundleName||a.esPaquete||'Kit';}
function kitPieceRow(i,d){
  const a=i.attributes||{},editable=canManage&&['draft','pending_payment','partial_payment','paid'].includes(d.status);
  const talla=a.talla||a.size||'',nombre=a.nombrePers||a.personalizationName||'',numero=a.numero||a.number||'';
  const chips=[itemChip('Talla',talla),itemChip('Manga',textoMangaCorto(a.manga)),itemChip('Nombre',nombre),itemChip('Número',numero)].filter(Boolean).join('');
  const complete=itemComplete(i);
  return `<div class="kit-piece" data-item-id="${esc(i.id)}">
    <div class="kit-piece-head"><span>${esc(i.description)}</span><span class="item-badge ${complete?'ok':'warn'}">${complete?'Completo':'Falta info'}</span></div>
    <div class="item-chips">${chips||'<span class="item-chip muted">Sin variante capturada</span>'}</div>
    ${editable?`<div class="item-editor"><label>Talla / medida<input class="item-size" value="${esc(talla)}" maxlength="40"></label><label>Nombre<input class="item-name" value="${esc(nombre)}" maxlength="80" placeholder="Si aplica"></label><label>Número<input class="item-number" value="${esc(numero)}" maxlength="4" inputmode="numeric" placeholder="Si aplica"></label><label>Observación<input class="item-note" value="${esc(a.obs||'')}" maxlength="200"></label><button class="secondary save-item" type="button">Guardar pieza</button></div>`:''}
  </div>`;
}
function kitCard(items,d){
  const label=kitLabel(items[0]);
  const total=items.reduce((s,i)=>s+Number(i.quantity||0)*Number(i.unitPrice||0),0);
  const cost=items.reduce((s,i)=>s+(i.unitCost!=null?Number(i.quantity||0)*Number(i.unitCost):0),0);
  const hasCost=canManage&&items.every(i=>i.unitCost!=null);
  const complete=items.every(itemComplete);
  return `<article class="item-row kit-row">
    <div class="item-summary">
      <div class="item-thumb">${ICONS.kit}</div>
      <div class="item-info">
        <strong>${esc(label)}</strong>
        <div class="item-chips"><span class="item-chip bundle">${items.length} pieza${items.length===1?'':'s'}</span></div>
      </div>
      <div class="item-price"><b>${money.format(total)}</b><span class="item-badge ${complete?'ok':'warn'}">${complete?'Completo':'Falta info'}</span></div>
    </div>
    <div class="kit-pieces">${items.map(i=>kitPieceRow(i,d)).join('')}</div>
  </article>`;
}
function renderItems(items,d){
  const seen=new Set(),html=[];
  (items||[]).forEach(i=>{
    const key=kitKey(i);
    if(key){
      if(seen.has(key))return;
      seen.add(key);
      html.push(kitCard(items.filter(x=>kitKey(x)===key),d));
    }else{
      html.push(itemEditor(i,d));
    }
  });
  return html.join('');
}
function collapseDrawerSections(){['paymentHistoryWrap'].forEach(id=>$(id)?.classList.add('hidden'));if($('masDetalles'))$('masDetalles').open=false;['togglePaymentHistory'].forEach(id=>{const b=$(id);if(!b)return;b.setAttribute('aria-expanded','false');b.classList.remove('open');});}
async function openOrder(o){
  current=await rpc('v2_order_detail',{organization_id:ctx.organization_id,order_id:o.id});details.set(o.id,current);otroPagador=false;
  const d=current.order;
  $('orderFolio').textContent=d.folio;
  $('orderMeta').textContent=fmt(d.created_at);
  $('orderTotal').textContent=money.format(Number(d.total||0));
  // Código de la tienda (h46): con cuál se pidió y cuánto descontó.
  const conCodigo=Number(d.discount||0)>0||d.store_code_id;
  $('orderCodigo')?.classList.toggle('hidden',!conCodigo);
  if(conCodigo&&$('orderCodigo'))$('orderCodigo').textContent=`${d.discount_reason||'Descuento'}${Number(d.discount||0)>0?` · −${money.format(Number(d.discount))} (antes ${money.format(Number(d.subtotal||0))})`:' · con regalo'}`;
  $('orderStatusLabel').className='order-status '+esc(d.status);$('orderStatusLabel').textContent=labels[d.status]||d.status;
  renderTracker(d.status,Number(current.balance||0)<=0.005);pintaPaso();
  $('customerName').textContent=d.customer_name||'Sin nombre';
  const wa=waLink(d.customer_phone);
  const contactBits=[d.customer_phone,d.customer_email].filter(Boolean).map(v=>`<span>${esc(v)}</span>`).join('<span class="dot">·</span>');
  $('customerContact').innerHTML=(contactBits||'<span class="muted">Sin contacto</span>')+(wa?`<a class="whatsapp-btn" href="${esc(wa)}" target="_blank" rel="noopener">${WA_ICON}WhatsApp</a>`:'');
  const items=$('itemList');items.innerHTML=renderItems(current.items||[],d);
  items.querySelectorAll('.save-item').forEach(b=>b.addEventListener('click',()=>saveItem(b.closest('[data-item-id]'))));
  renderReview(d);
  pintaResumen();
  pintaJugadorDelPedido(d);
  renderProfitability();renderPaymentPlan(d);renderPayments(d);renderReadiness();renderStateActions(d);renderWarranty(d);
  renderBusinessMetrics(orders.filter(vigente));render();msg();collapseDrawerSections();
  $('backdrop').classList.remove('hidden');$('drawer').classList.remove('hidden');
}
/* ¿De qué niño es? (Presidencia, 11/10/2026: "que pidan sin cuenta y ya
   después nosotros se lo apuntamos a su hijo"). Sugiere por el teléfono del
   tutor, el nombre del jersey y el apellido; se liga en un toque. */
let jugadorBusca=0;
async function pintaJugadorDelPedido(d,q=''){
  const box=$('orderPlayer');if(!box)return;const id=d.id,turno=++jugadorBusca;
  if(!q)box.innerHTML='<p class="muted op-cargando">Buscando de quién es…</p>';
  let r;try{r=await rpc('v2_order_player',{organization_id:ctx.organization_id,order_id:id,query:q||null});}catch{r=null;}
  if(!r){box.innerHTML='';return;}
  if(turno!==jugadorBusca||current?.order?.id!==id)return;
  if(!q){current.linked=r.linked||null;pintaCobro();}
  const puede=r.canWrite&&canWrite;
  const opcion=s=>`<li><span><b>${esc(s.name)}</b><small>${esc([s.category,s.reason].filter(Boolean).join(' · '))}</small></span>${puede?`<button type="button" class="secondary mini" data-liga="${esc(s.id)}">Ligar</button>`:''}</li>`;
  if(r.linked&&!q){
    box.innerHTML=`<div class="op-ligado"><span>Para <b>${esc(r.linked.name)}</b>${r.linked.category?` · ${esc(r.linked.category)}`:''}</span>${puede?'<button type="button" class="op-link" data-cambia>Cambiar</button>':''}</div><div class="op-cambio hidden"></div>`;
    box.querySelector('[data-cambia]')?.addEventListener('click',()=>{const c=box.querySelector('.op-cambio');c.classList.remove('hidden');c.innerHTML=buscador();cablea(box,d);});
    return;
  }
  const sug=r.suggestions||[];
  box.innerHTML=`<div class="op-sin"><b>Sin niño ligado</b><span>${q?'Resultados':sug.length?'¿Es alguno de ellos?':'No encontramos a quién es por el teléfono ni por el nombre.'}</span></div>
    ${sug.length?`<ul class="op-sugerencias">${sug.map(opcion).join('')}</ul>`:''}${puede?buscador(q):''}`;
  cablea(box,d);
  function buscador(v=''){return `<input class="op-buscar" type="search" placeholder="Buscar al niño por nombre" value="${esc(v)}" autocomplete="off">`;}
}
function cablea(box,d){
  const inp=box.querySelector('.op-buscar');let t=0;
  inp?.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(()=>pintaJugadorDelPedido(d,inp.value.trim()),250);});
  box.onclick=async e=>{const b=e.target.closest('[data-liga]');if(!b)return;b.disabled=true;
    try{await rpc('v2_link_order_player',{organization_id:ctx.organization_id,order_id:d.id,player_id:b.dataset.liga});msg('Pedido ligado al niño.','success');await pintaJugadorDelPedido(d);}
    catch(err){b.disabled=false;msg(err.message||'No se pudo ligar.');}};
}
function reviewMsg(t='',type='error'){const e=$('reviewMessage');if(!e)return;e.textContent=t;e.dataset.type=type;e.classList.toggle('hidden',!t);}
function renderReview(d){const sec=$('reviewSection');if(!sec)return;const pendiente=porRevisar.has(d.id);sec.classList.toggle('hidden',!pendiente);reviewMsg();if(!pendiente)return;const tel=ligaWhatsApp(d.customer_phone);$('confirmWhatsApp').disabled=!tel||!canWrite;$('markReviewed').disabled=!canWrite;if(!tel)reviewMsg('Este pedido no trae teléfono: confírmalo por otro medio y márcalo revisado.');else if(!canWrite)reviewMsg('Tu rol puede ver la Tienda pero no confirmar pedidos.');revisaNumeros(d);}
/* D (Presidencia, 09/10/2026): el número que pidió la familia se revisa antes
   de confirmar. El servidor busca al Tanner (por el pedido o por el teléfono
   del tutor) y dice si el número es suyo, es de otro niño de su categoría o
   está libre; si está libre y el Tanner no tiene, se le asigna en un toque. */
const NIVEL_NUM={ok:'ok',atencion:'atencion',mal:'mal'};
let numerosSeq=0;
async function revisaNumeros(d){
  const ul=$('reviewNumeros');if(!ul)return;const seq=++numerosSeq;
  ul.classList.add('hidden');ul.innerHTML='';
  let r=null;try{r=await rpc('v2_order_number_check',{organization_id:ctx.organization_id,order_id:d.id});}catch{return;}
  if(seq!==numerosSeq||current?.order?.id!==d.id)return;
  const avisos=Array.isArray(r?.avisos)?r.avisos:[];if(!avisos.length)return;
  const tanner=id=>(r.tanners||[]).find(t=>t.id===id);
  ul.innerHTML=avisos.map(a=>{const t=tanner(a.playerId);const asignar=a.asignable&&canWrite&&t&&!t.jersey;
    return `<li class="review-num ${NIVEL_NUM[a.nivel]||'atencion'}"><span>${esc(a.texto)}</span>${asignar?`<button type="button" class="secondary mini" data-asigna="${esc(a.playerId)}" data-num="${esc(a.numero)}">Asignar #${esc(a.numero)} a ${esc(t.firstName||'')}</button>`:''}</li>`;}).join('');
  ul.classList.remove('hidden');
  ul.querySelectorAll('[data-asigna]').forEach(b=>b.addEventListener('click',async()=>{b.disabled=true;
    try{await rpc('v2_assign_jersey',{organization_id:ctx.organization_id,player_id:b.dataset.asigna,number:b.dataset.num});revisaNumeros(d);}
    catch(e){b.disabled=false;reviewMsg(e.message||'No se pudo asignar el número.');}}));
}
async function markReviewed(){if(!current||!canWrite)return;const id=current.order.id;try{await rpc('v2_mark_order_reviewed',{organization_id:ctx.organization_id,order_id:id});porRevisar.delete(id);await refreshCurrent(id);msg('Pedido confirmado.','success');}catch(e){reviewMsg(e.message||'No se pudo marcar como revisado.');}}
/* La ventana de WhatsApp se abre en el mismo toque (si no, el navegador del
   teléfono la bloquea) y después se marca revisado. */
function confirmWhatsApp(){if(!current||!canWrite)return;const d=current.order;const texto=mensajeConfirmacion({order:d,items:current.items||[],info:clubCfg?.paymentInstructions,club:clubCfg?.name||ctx.organization_name||'el club',yo:ctx.display_name});const url=ligaWhatsApp(d.customer_phone,texto);if(!url)return;window.open(url,'_blank','noopener');markReviewed();}
function close(){current=null;$('backdrop').classList.add('hidden');$('drawer').classList.add('hidden');msg();payMsg();}async function refreshCurrent(orderId){details.delete(orderId);await load();const o=orders.find(x=>x.id===orderId);if(o)await openOrder(o);else close();}
async function saveItem(row){if(!current||!canManage||!row)return;
  if(tienePagos()){const v=c=>row.querySelector(c).value.trim()||null;
    try{if(await editaConMotivo(row.dataset.itemId,{size:v('.item-size'),personalization_name:v('.item-name'),number:v('.item-number'),notes:v('.item-note')},'Guardar cambio de la pieza')){await refreshCurrent(current.order.id);msg('Pieza actualizada con su motivo.','success');}}
    catch(e){msg(e.message||'No se pudo actualizar la pieza.');}
    return;}const orderId=current.order.id,btn=row.querySelector('.save-item');btn.disabled=true;try{await rpc('v2_update_order_item_fulfillment',{organization_id:ctx.organization_id,order_item_id:row.dataset.itemId,size:row.querySelector('.item-size').value.trim()||null,personalization_name:row.querySelector('.item-name').value.trim()||null,number:row.querySelector('.item-number').value.trim()||null,notes:row.querySelector('.item-note').value.trim()||null});await refreshCurrent(orderId);msg('Datos de pieza actualizados y readiness recalculado.','success');}catch(e){msg(e.message||'No se pudo actualizar la pieza.');btn.disabled=false;}}
async function postPayment(){if(!current||!canWrite)return;const d=current.order,amount=Number($('paymentAmount').value||0),balance=Number(current.balance||0),payerType=$('paymentPayerType').value,payerName=$('paymentPayer').value.trim();if(!Number.isFinite(amount)||amount<=0){payMsg('Captura un monto mayor a cero.');return;}if(amount>balance+0.005){payMsg(`El pago excede el saldo de ${money.format(balance)}.`);return;}if(payerType==='sponsor'&&!payerName){payMsg('Indica el nombre del patrocinador.');return;}const btn=$('savePayment');btn.disabled=true;payMsg();try{await rpc('v2_post_order_payment_attributed',{organization_id:ctx.organization_id,order_id:d.id,amount,payment_date:$('paymentDate').value||new Date().toISOString().slice(0,10),method:$('paymentMethod').value||'other',reference:$('paymentReference').value.trim()||null,payer_type:payerType,payer_name:payerName||d.customer_name||null,idempotency_key:`order-${d.id}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`});await refreshCurrent(d.id);payMsg('Pago registrado con pagador y estado actualizado.','success');}catch(e){payMsg(e.message||'No se pudo registrar el pago.');}finally{btn.disabled=!canWrite;}}
function setupToggle(btnId,wrapId){const btn=$(btnId),wrap=$(wrapId);if(!btn||!wrap)return;btn.addEventListener('click',()=>{const nowHidden=wrap.classList.toggle('hidden');btn.setAttribute('aria-expanded',String(!nowHidden));btn.classList.toggle('open',!nowHidden);});}
setupToggle('togglePaymentHistory','paymentHistoryWrap');
$('paymentPayerType').addEventListener('change',()=>{if($('paymentPayerType').value==='guardian'&&current)$('paymentPayer').value=current.order.customer_name||'';});$('statusFilter').addEventListener('change',render);$('tSeg')?.addEventListener('click',e=>{const b=e.target.closest('[data-f]');if(!b)return;$('statusFilter').value=b.dataset.f;render();renderReviewBanner();});$('orderResumen')?.addEventListener('click',e=>{const m=e.target.closest('[data-manga-item]');if(m){cambiaManga(m.dataset.mangaItem,m.dataset.m,m);return;}const c=e.target.closest('[data-num-confirma],[data-num-deshacer]');if(c&&current){const o=orders.find(x=>x.id===current.order.id);if(o)confirmaNumero(o,!!c.dataset.numConfirma,c);}});$('orderResumen')?.addEventListener('change',e=>{if(e.target.id==='tAtendio')cambiaAtendio(e.target.value);});$('orderSearch').addEventListener('input',render);$('closeDrawer').addEventListener('click',close);$('backdrop').addEventListener('click',close);$('savePayment').addEventListener('click',postPayment);$('noPagado')?.addEventListener('click',noPagado);$('telProveedor')?.addEventListener('click',cambiaTelProveedor);pintaTelProveedor();$('readinessBox')?.addEventListener('click',e=>{const c=e.target.closest('[data-num-confirma]');if(c&&current){const o=orders.find(x=>x.id===current.order.id);if(o)confirmaNumero(o,true,c);}});$('cobrarPedido').addEventListener('click',cobrarConHoja);$('otroPagador').addEventListener('click',()=>{otroPagador=true;pintaCobro();});$('confirmWhatsApp')?.addEventListener('click',confirmWhatsApp);$('markReviewed')?.addEventListener('click',markReviewed);$('statusFilter').addEventListener('change',renderReviewBanner);boot().catch(e=>{$('deniedText').textContent=e.message;show('deniedView');});
// === Eliminar pedido — solo Presidencia (agregado) ===
(function(){
  function inject(){
    var drawer=$('masDetalles')||$('drawer'); if(!drawer||$('dangerZone'))return;
    var sec=document.createElement('section');
    sec.className='drawer-section'; sec.id='dangerZone'; sec.style.display='none';
    sec.innerHTML='<div class="eyebrow">CORRECCIONES</div><h3>Eliminar pedido</h3>'
      +'<p class="muted state-help">Quita el pedido de la lista. Pide el motivo y queda en la bitácora de Presidencia. Si tiene pagos registrados, primero cancélalo o reembólsalo.</p>'
      +'<button id="deleteOrder" type="button" class="t-peligro">Eliminar pedido</button>'
      +'<div id="deleteMessage" class="inline-message hidden" style="margin-top:8px"></div>';
    drawer.appendChild(sec);
    $('deleteOrder').addEventListener('click', async function(){
      if(!current) return;
      var motivo = await window.tosPrompt({kicker:'CORRECCIONES',title:'Eliminar pedido',message:'Esto quita el pedido de la lista y queda en la bitácora con tu nombre.',placeholder:'¿Por qué se elimina?',required:true,requiredText:'Escribe el motivo.',confirmText:'Sí, eliminar',danger:true,maxlength:200});
      if(!motivo) return;
      var b=$('deleteOrder'); b.disabled=true;
      try{
        await rpc('v2_delete_order',{organization_id:ctx.organization_id, order_id:current.order.id, reason:motivo});
        close(); await load();
      }catch(e){
        var m=$('deleteMessage'); m.textContent=(e&&e.message)||'No se pudo eliminar el pedido'; m.classList.remove('hidden');
      }finally{ b.disabled=false; }
    });
  }
  var t=setInterval(function(){
    if(typeof ctx!=='undefined' && ctx){
      inject();
      muestraZona();
      clearInterval(t);
    }
  },300);
})();
 
