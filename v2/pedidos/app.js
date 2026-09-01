import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const supabase=createClient('https://pacnegivzgxpanphrnwp.supabase.co','sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);let ctx=null,orders=[],current=null,canWrite=false,canManage=false,canCorrect=false,canViewFinance=true,metricsRun=0;const details=new Map();const money=new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:2});const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
function itemComplete(i){const a=i.attributes||{},d=i.description||'';const jerseyish=/jersey|uniforme|playera/i.test(d);const hasSize=!!String(a.talla||a.size||'').trim();const hasName=!!String(a.nombrePers||a.personalizationName||'').trim();const hasNumber=!!String(a.numero||a.number||'').trim();if(!hasSize)return false;if(jerseyish&&(!hasName||!hasNumber))return false;return true;}
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
async function boot(){const {data:{session}}=await supabase.auth.getSession();if(!session){location.href='/v2';return;}const rows=await rpc('v2_my_context');if(!rows?.length){$('deniedText').textContent='Sin organización.';show('deniedView');return;}ctx=rows[0];const mods=await rpc('v2_my_modules',{organization_id:ctx.organization_id});const mod=mods.find(m=>m.module_code==='commerce');if(!mod?.enabled||!mod?.can_read){$('deniedText').textContent='Tu rol no tiene acceso a Tienda/Pedidos.';show('deniedView');return;}canWrite=!!mod.can_write;canManage=canWrite&&ctx.role!=='Taquilla';canCorrect=ctx.role==='Presidencia';const financeMod=mods.find(m=>m.module_code==='commerce_finance');canViewFinance=!!(financeMod?.enabled&&financeMod?.can_read);document.querySelector('.business-cockpit')?.classList.toggle('hidden',!canViewFinance);$('financeSection')?.classList.toggle('hidden',!canViewFinance);$('statusSection')?.classList.toggle('hidden',!canManage);$('orgName').textContent=ctx.organization_name;$('roleBadge').textContent=ctx.is_owner?'Propietario':ctx.role;await load();show('view');}
async function load(){orders=await rpc('v2_orders',{organization_id:ctx.organization_id,status_filter:null})||[];render();renderKpis();loadBusinessMetrics();}
function filteredOrders(){const status=$('statusFilter').value,q=$('orderSearch').value.trim().normalize('NFD').replace(DIACRITICS_RE,'').toLowerCase();return orders.filter(o=>(!status||o.status===status)&&(!q||`${o.folio||''} ${o.customer_name||''} ${o.customer_phone||''} ${o.customer_email||''}`.normalize('NFD').replace(DIACRITICS_RE,'').toLowerCase().includes(q)));}
function renderKpis(){const rows=orders.filter(vigente);$('kpiOrders').textContent=rows.length;$('kpiPending').textContent=rows.filter(o=>['pending_payment','partial_payment'].includes(o.status)).length;$('kpiProduction').textContent=rows.filter(o=>o.status==='in_production').length;$('kpiReady').textContent=rows.filter(o=>o.status==='ready').length;}
function render(){const rows=filteredOrders(),list=$('orderList');list.innerHTML='';$('empty').classList.toggle('hidden',rows.length>0);rows.forEach(o=>{const d=details.get(o.id),balance=d?Number(d.balance||0):null,b=document.createElement('button');b.type='button';b.dataset.orderId=o.id;b.className='order-row';b.innerHTML=`<div><strong>${esc(o.folio)}</strong><span>${esc(o.customer_name)} · ${fmt(o.created_at)}</span><small>${Number(o.item_count||0)} pieza(s)${balance!=null&&balance>0?` · saldo ${money.format(balance)}`:''}</small></div><div class="order-right"><b>${money.format(Number(o.total||0))}</b><span class="order-status ${esc(o.status)}">${labels[o.status]||esc(o.status)}</span></div>`;b.addEventListener('click',()=>openOrder(o));list.appendChild(b);});}
async function fetchDetail(order){try{const d=await rpc('v2_order_detail',{organization_id:ctx.organization_id,order_id:order.id});details.set(order.id,d);return d;}catch{return null;}}
async function loadBusinessMetrics(){if(!canViewFinance)return;const run=++metricsRun,rows=orders.filter(vigente);$('metricsStatus').textContent='Calculando…';for(let i=0;i<rows.length;i+=8){const batch=rows.slice(i,i+8).filter(o=>!details.has(o.id));if(batch.length)await Promise.all(batch.map(fetchDetail));if(run!==metricsRun)return;}if(run!==metricsRun)return;renderBusinessMetrics(rows);render();}
function renderBusinessMetrics(rows){let sales=0,collected=0,receivable=0,cost=0,knownSales=0,profit=0,complete=0,resolved=0;rows.forEach(o=>{sales+=Number(o.total||0);const d=details.get(o.id);if(!d)return;resolved++;collected+=Number(d.paidAmount||0);receivable+=Math.max(0,Number(d.balance||0));if(d.costComplete){complete++;cost+=Number(d.costTotal||0);knownSales+=Number(d.order?.total??o.total??0);profit+=Number(d.grossProfitExpected||0);}});$('bizSales').textContent=money.format(sales);$('bizCollected').textContent=money.format(collected);$('bizReceivable').textContent=money.format(receivable);$('bizCost').textContent=complete?money.format(cost):'Pendiente';$('bizProfit').textContent=complete?money.format(profit):'Pendiente';$('bizProfit').dataset.state=profit<0?'negative':'normal';$('bizMargin').textContent=complete&&knownSales>0?`${(profit/knownSales*100).toFixed(0)}%`:'—';$('costCoverage').textContent=`${complete}/${rows.length} pedido(s) con costo completo`;const incomplete=rows.length-complete,failed=rows.length-resolved;$('metricsStatus').textContent=failed?'Lectura parcial':incomplete?`${incomplete} sin costo completo`:'Costos completos';$('metricsStatus').dataset.state=failed?'attention':incomplete?'attention':'ok';}
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
  $('paymentForm').classList.toggle('hidden',!canPay);$('paymentClosedNote').classList.toggle('hidden',canPay);
  if(canPay){$('paymentAmount').value=balance.toFixed(2);$('paymentAmount').max=balance.toFixed(2);$('paymentDate').value=new Date().toISOString().slice(0,10);$('paymentPayerType').value='guardian';$('paymentPayer').value=d.customer_name||'';}
  payMsg();
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
function renderReadiness(){const r=current?.readiness||{},box=$('readinessBox');box.dataset.ready=r.ok?'true':'false';$('readinessTitle').textContent=r.ok?'Listo para producción':'Aún no está listo';$('readinessText').textContent=readinessText(r);$('readinessPayment').textContent=`Pago ${Number(r.paidPercent||0).toFixed(0)}% · requerido ${Number(r.effectivePaymentRequirementPercent||100).toFixed(0)}%`;}
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
  if(!wrap.children.length){wrap.innerHTML='<p class="muted state-help">Este pedido ya no tiene más movimientos de estado.</p>';}
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
  if(!canOpen&&!mine.length){section.classList.add('hidden');return;}
  section.classList.remove('hidden');
  const body=$('warrantyBody');
  let html='';
  if(mine.length)html+=`<div class="warranty-list">${mine.map(w=>`<div class="warranty-row"><div><strong>${esc(w.folio)}</strong><span>${esc(w.reason)}</span></div><div class="warranty-row-side"><span class="payment-status">${WARRANTY_LABELS[w.status]||esc(w.status)}</span>${w.status==='ready'?`<button class="secondary mini deliver-warranty" data-id="${esc(w.id)}" type="button">Marcar entregada</button>`:''}</div></div>`).join('')}</div>`;
  if(canOpen)html+='<button id="openWarrantyBtn" class="secondary" type="button">Abrir garantía de una pieza</button><div id="warrantyForm" class="hidden"></div>';
  body.innerHTML=html;
  body.querySelectorAll('.deliver-warranty').forEach(b=>b.addEventListener('click',()=>deliverWarranty(b.dataset.id)));
  if(canOpen)$('openWarrantyBtn')?.addEventListener('click',toggleWarrantyForm);
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
  const chips=[itemChip('Talla',talla),itemChip('Nombre',nombre),itemChip('Número',numero)].filter(Boolean).join('');
  const complete=itemComplete(i),lineTotal=Number(i.quantity||0)*Number(i.unitPrice||0);
  return `<article class="item-row ${editable?'editable':''}" data-item-id="${esc(i.id)}">
    <div class="item-summary">
      <div class="item-thumb">${itemThumb(i)}</div>
      <div class="item-info">
        <strong>${esc(i.description)}</strong>
        <div class="item-chips">${chips||'<span class="item-chip muted">Sin variante capturada</span>'}</div>
        <span class="item-qty">${i.quantity} × ${money.format(Number(i.unitPrice||0))}${i.unitCost!=null?` · costo ${money.format(Number(i.unitCost))}`:''}</span>
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
  const chips=[itemChip('Talla',talla),itemChip('Nombre',nombre),itemChip('Número',numero)].filter(Boolean).join('');
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
        <div class="item-chips"><span class="item-chip bundle">${items.length} pieza${items.length===1?'':'s'}</span>${hasCost?`<span class="item-chip muted">Costo del kit ${money.format(cost)}</span>`:''}</div>
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
function collapseDrawerSections(){['paymentHistoryWrap','fullDetail'].forEach(id=>$(id)?.classList.add('hidden'));['togglePaymentHistory','toggleFullDetail'].forEach(id=>{const b=$(id);if(!b)return;b.setAttribute('aria-expanded','false');b.classList.remove('open');});}
async function openOrder(o){
  current=await rpc('v2_order_detail',{organization_id:ctx.organization_id,order_id:o.id});details.set(o.id,current);
  const d=current.order;
  $('orderFolio').textContent=d.folio;
  $('orderMeta').textContent=fmt(d.created_at);
  $('orderTotal').textContent=money.format(Number(d.total||0));
  $('orderStatusLabel').className='order-status '+esc(d.status);$('orderStatusLabel').textContent=labels[d.status]||d.status;
  renderTracker(d.status,Number(current.balance||0)<=0.005);
  $('customerName').textContent=d.customer_name||'Sin nombre';
  const wa=waLink(d.customer_phone);
  const contactBits=[d.customer_phone,d.customer_email].filter(Boolean).map(v=>`<span>${esc(v)}</span>`).join('<span class="dot">·</span>');
  $('customerContact').innerHTML=(contactBits||'<span class="muted">Sin contacto</span>')+(wa?`<a class="whatsapp-btn" href="${esc(wa)}" target="_blank" rel="noopener">${WA_ICON}WhatsApp</a>`:'');
  const items=$('itemList');items.innerHTML=renderItems(current.items||[],d);
  items.querySelectorAll('.save-item').forEach(b=>b.addEventListener('click',()=>saveItem(b.closest('[data-item-id]'))));
  renderProfitability();renderPaymentPlan(d);renderPayments(d);renderReadiness();renderStateActions(d);renderWarranty(d);
  renderBusinessMetrics(orders.filter(vigente));render();msg();collapseDrawerSections();
  $('backdrop').classList.remove('hidden');$('drawer').classList.remove('hidden');
}
function close(){current=null;$('backdrop').classList.add('hidden');$('drawer').classList.add('hidden');msg();payMsg();}async function refreshCurrent(orderId){details.delete(orderId);await load();const o=orders.find(x=>x.id===orderId);if(o)await openOrder(o);else close();}
async function saveItem(row){if(!current||!canManage||!row)return;const orderId=current.order.id,btn=row.querySelector('.save-item');btn.disabled=true;try{await rpc('v2_update_order_item_fulfillment',{organization_id:ctx.organization_id,order_item_id:row.dataset.itemId,size:row.querySelector('.item-size').value.trim()||null,personalization_name:row.querySelector('.item-name').value.trim()||null,number:row.querySelector('.item-number').value.trim()||null,notes:row.querySelector('.item-note').value.trim()||null});await refreshCurrent(orderId);msg('Datos de pieza actualizados y readiness recalculado.','success');}catch(e){msg(e.message||'No se pudo actualizar la pieza.');btn.disabled=false;}}
async function postPayment(){if(!current||!canWrite)return;const d=current.order,amount=Number($('paymentAmount').value||0),balance=Number(current.balance||0),payerType=$('paymentPayerType').value,payerName=$('paymentPayer').value.trim();if(!Number.isFinite(amount)||amount<=0){payMsg('Captura un monto mayor a cero.');return;}if(amount>balance+0.005){payMsg(`El pago excede el saldo de ${money.format(balance)}.`);return;}if(payerType==='sponsor'&&!payerName){payMsg('Indica el nombre del patrocinador.');return;}const btn=$('savePayment');btn.disabled=true;payMsg();try{await rpc('v2_post_order_payment_attributed',{organization_id:ctx.organization_id,order_id:d.id,amount,payment_date:$('paymentDate').value||new Date().toISOString().slice(0,10),method:$('paymentMethod').value||'other',reference:$('paymentReference').value.trim()||null,payer_type:payerType,payer_name:payerName||d.customer_name||null,idempotency_key:`order-${d.id}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`});await refreshCurrent(d.id);payMsg('Pago registrado con pagador y estado actualizado.','success');}catch(e){payMsg(e.message||'No se pudo registrar el pago.');}finally{btn.disabled=!canWrite;}}
function setupToggle(btnId,wrapId){const btn=$(btnId),wrap=$(wrapId);if(!btn||!wrap)return;btn.addEventListener('click',()=>{const nowHidden=wrap.classList.toggle('hidden');btn.setAttribute('aria-expanded',String(!nowHidden));btn.classList.toggle('open',!nowHidden);});}
setupToggle('togglePaymentHistory','paymentHistoryWrap');setupToggle('toggleFullDetail','fullDetail');
$('paymentPayerType').addEventListener('change',()=>{if($('paymentPayerType').value==='guardian'&&current)$('paymentPayer').value=current.order.customer_name||'';});$('statusFilter').addEventListener('change',render);$('orderSearch').addEventListener('input',render);$('closeDrawer').addEventListener('click',close);$('backdrop').addEventListener('click',close);$('savePayment').addEventListener('click',postPayment);boot().catch(e=>{$('deniedText').textContent=e.message;show('deniedView');});
// === Eliminar pedido — solo Presidencia (agregado) ===
(function(){
  function inject(){
    var drawer=$('drawer'); if(!drawer||$('dangerZone'))return;
    var sec=document.createElement('section');
    sec.className='drawer-section'; sec.id='dangerZone'; sec.style.display='none';
    sec.innerHTML='<div class="eyebrow">ZONA DE PRESIDENCIA</div><h3>Eliminar pedido</h3>'
      +'<p class="muted state-help">Quita el pedido de la lista. Solo Presidencia. Si tiene pagos registrados, primero cancélalo o reembólsalo.</p>'
      +'<button id="deleteOrder" type="button" style="color:#fff;background:#C0362C;border:1px solid #C0362C;border-radius:12px;padding:12px 16px;font-weight:700;cursor:pointer">Eliminar pedido</button>'
      +'<div id="deleteMessage" class="inline-message hidden" style="margin-top:8px"></div>';
    drawer.appendChild(sec);
    $('deleteOrder').addEventListener('click', async function(){
      if(!current) return;
      var ok = await confirmAction({kicker:'ZONA DE PRESIDENCIA',title:'Eliminar pedido',message:'Esto quita el pedido de la lista. Solo Presidencia puede hacerlo.',confirmText:'Sí, eliminar',danger:true});
      if(!ok) return;
      var b=$('deleteOrder'); b.disabled=true;
      try{
        await rpc('v2_delete_order',{organization_id:ctx.organization_id, order_id:current.order.id});
        close(); await load();
      }catch(e){
        var m=$('deleteMessage'); m.textContent=(e&&e.message)||'No se pudo eliminar el pedido'; m.classList.remove('hidden');
      }finally{ b.disabled=false; }
    });
  }
  var t=setInterval(function(){
    if(typeof ctx!=='undefined' && ctx){
      inject();
      if(ctx.role==='Presidencia'){ var z=$('dangerZone'); if(z) z.style.display=''; }
      clearInterval(t);
    }
  },300);
})();
