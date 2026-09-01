import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const supabase=createClient('https://pacnegivzgxpanphrnwp.supabase.co','sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);let ctx=null,orders=[],current=null,canWrite=false,canManage=false,canViewFinance=true,metricsRun=0;const details=new Map();const money=new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:2});const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={draft:'Borrador',pending_payment:'Pendiente pago',partial_payment:'Pago parcial',paid:'Pagado',in_production:'En producción',ready:'Listo',delivered:'Entregado',cancelled:'Cancelado',refunded:'Reembolsado'};
const payerLabels={guardian:'Familia / tutor',sponsor:'Patrocinador',player:'Jugador',organization:'Club',other:'Otro'};
const sourceLabels={legacy_import:'Importado del sistema anterior',online:'En línea',pos:'Mostrador',manual:'Registro manual',whatsapp:'WhatsApp'};
function sourceLabel(v){if(!v)return'Interno';return sourceLabels[v]||v.replace(/_/g,' ').replace(/^./,c=>c.toUpperCase());}
/* Recorrido del pedido estilo e-commerce (Amazon/Mercado Libre): 4 hitos fijos.
   "Pedido" cubre captura+cobro (se marca "hecho" en cuanto ya se pagó por completo).
   cancelled/refunded rompen el recorrido y muestran una nota en su lugar. */
const TRACK_STEPS=['Pedido','Pagado','Producción','Listo'];
const TRACK_CURRENT={draft:1,pending_payment:1,partial_payment:1,paid:2,in_production:2,ready:3,delivered:4};
function renderTracker(status){
  const wrap=$('orderTracker');if(!wrap)return;
  if(status==='cancelled'||status==='refunded'){
    wrap.innerHTML=`<div class="order-tracker-alert ${esc(status)}">${status==='cancelled'?'Este pedido fue cancelado.':'Este pedido fue reembolsado.'}</div>`;
    return;
  }
  const cur=TRACK_CURRENT[status]??1;
  wrap.innerHTML=`<div class="order-tracker">${TRACK_STEPS.map((label,i)=>{
    const state=i<cur?'done':i===cur?'current':'pending';
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
const transitions={draft:['pending_payment','cancelled'],pending_payment:['cancelled'],partial_payment:['cancelled','refunded'],paid:['in_production','ready','refunded'],in_production:['ready','refunded'],ready:['delivered','refunded'],delivered:['refunded'],cancelled:['cancelled'],refunded:['refunded']};
function show(id){['loadingView','deniedView','view'].forEach(v=>$(v)?.classList.toggle('hidden',v!==id));}
function msg(t='',type='error'){const e=$('statusMessage');e.textContent=t;e.dataset.type=type;e.classList.toggle('hidden',!t);}function payMsg(t='',type='error'){const e=$('paymentMessage');e.textContent=t;e.dataset.type=type;e.classList.toggle('hidden',!t);}
async function rpc(n,p={}){const {data,error}=await supabase.rpc(n,p);if(error)throw error;return data;}function fmt(v){return v?new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v)):'—';}function fmtDate(v){return v?new Intl.DateTimeFormat('es-MX',{dateStyle:'medium'}).format(new Date(`${v}T12:00:00`)):'—';}
function readinessText(r){const miss=Array.isArray(r?.missing)?r.missing:[];return r?.ok?'Listo para producción':miss.length?miss.join(' · '):'Pendiente de validar';}
function vigente(o){return !['cancelled','refunded'].includes(o.status);}
async function boot(){const {data:{session}}=await supabase.auth.getSession();if(!session){location.href='/v2';return;}const rows=await rpc('v2_my_context');if(!rows?.length){$('deniedText').textContent='Sin organización.';show('deniedView');return;}ctx=rows[0];const mods=await rpc('v2_my_modules',{organization_id:ctx.organization_id});const mod=mods.find(m=>m.module_code==='commerce');if(!mod?.enabled||!mod?.can_read){$('deniedText').textContent='Tu rol no tiene acceso a Tienda/Pedidos.';show('deniedView');return;}canWrite=!!mod.can_write;canManage=canWrite&&ctx.role!=='Taquilla';const financeMod=mods.find(m=>m.module_code==='commerce_finance');canViewFinance=!!(financeMod?.enabled&&financeMod?.can_read);document.querySelector('.business-cockpit')?.classList.toggle('hidden',!canViewFinance);$('financeSection')?.classList.toggle('hidden',!canViewFinance);$('statusSection')?.classList.toggle('hidden',!canManage);$('orgName').textContent=ctx.organization_name;$('roleBadge').textContent=ctx.is_owner?'Propietario':ctx.role;await load();show('view');}
async function load(){orders=await rpc('v2_orders',{organization_id:ctx.organization_id,status_filter:null})||[];render();renderKpis();loadBusinessMetrics();}
function filteredOrders(){const status=$('statusFilter').value,q=$('orderSearch').value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();return orders.filter(o=>(!status||o.status===status)&&(!q||`${o.folio||''} ${o.customer_name||''} ${o.customer_phone||''} ${o.customer_email||''}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q)));}
function renderKpis(){const rows=orders.filter(vigente);$('kpiOrders').textContent=rows.length;$('kpiPending').textContent=rows.filter(o=>['pending_payment','partial_payment'].includes(o.status)).length;$('kpiProduction').textContent=rows.filter(o=>o.status==='in_production').length;$('kpiReady').textContent=rows.filter(o=>o.status==='ready').length;}
function render(){const rows=filteredOrders(),list=$('orderList');list.innerHTML='';$('empty').classList.toggle('hidden',rows.length>0);rows.forEach(o=>{const d=details.get(o.id),balance=d?Number(d.balance||0):null,b=document.createElement('button');b.type='button';b.dataset.orderId=o.id;b.className='order-row';b.innerHTML=`<div><strong>${esc(o.folio)}</strong><span>${esc(o.customer_name)} · ${fmt(o.created_at)}</span><small>${Number(o.item_count||0)} pieza(s)${balance!=null&&balance>0?` · saldo ${money.format(balance)}`:''}</small></div><div class="order-right"><b>${money.format(Number(o.total||0))}</b><span class="order-status ${esc(o.status)}">${labels[o.status]||esc(o.status)}</span></div>`;b.addEventListener('click',()=>openOrder(o));list.appendChild(b);});}
async function fetchDetail(order){try{const d=await rpc('v2_order_detail',{organization_id:ctx.organization_id,order_id:order.id});details.set(order.id,d);return d;}catch{return null;}}
async function loadBusinessMetrics(){if(!canViewFinance)return;const run=++metricsRun,rows=orders.filter(vigente);$('metricsStatus').textContent='Calculando…';for(let i=0;i<rows.length;i+=8){const batch=rows.slice(i,i+8).filter(o=>!details.has(o.id));if(batch.length)await Promise.all(batch.map(fetchDetail));if(run!==metricsRun)return;}if(run!==metricsRun)return;renderBusinessMetrics(rows);render();}
function renderBusinessMetrics(rows){let sales=0,collected=0,receivable=0,cost=0,knownSales=0,profit=0,complete=0,resolved=0;rows.forEach(o=>{sales+=Number(o.total||0);const d=details.get(o.id);if(!d)return;resolved++;collected+=Number(d.paidAmount||0);receivable+=Math.max(0,Number(d.balance||0));if(d.costComplete){complete++;cost+=Number(d.costTotal||0);knownSales+=Number(d.order?.total??o.total??0);profit+=Number(d.grossProfitExpected||0);}});$('bizSales').textContent=money.format(sales);$('bizCollected').textContent=money.format(collected);$('bizReceivable').textContent=money.format(receivable);$('bizCost').textContent=complete?money.format(cost):'Pendiente';$('bizProfit').textContent=complete?money.format(profit):'Pendiente';$('bizProfit').dataset.state=profit<0?'negative':'normal';$('bizMargin').textContent=complete&&knownSales>0?`${(profit/knownSales*100).toFixed(0)}%`:'—';$('costCoverage').textContent=`${complete}/${rows.length} pedido(s) con costo completo`;const incomplete=rows.length-complete,failed=rows.length-resolved;$('metricsStatus').textContent=failed?'Lectura parcial':incomplete?`${incomplete} sin costo completo`:'Costos completos';$('metricsStatus').dataset.state=failed?'attention':incomplete?'attention':'ok';}
function renderProfitability(){if(!canViewFinance)return;const cost=current?.costComplete?Number(current.costTotal||0):null,profit=current?.costComplete?Number(current.grossProfitExpected||0):null;$('orderCost').textContent=cost==null?'Pendiente':money.format(cost);$('orderProfit').textContent=profit==null?'Pendiente':money.format(profit);$('orderProfit').dataset.state=profit!=null&&profit<0?'negative':'normal';}
function renderPayments(d){const paid=Number(current?.paidAmount||0),balance=Number(current?.balance||0);$('orderPaid').textContent=money.format(paid);$('orderBalance').textContent=money.format(balance);const hist=$('paymentList');hist.innerHTML='';const rows=current?.payments||[];$('paymentEmpty').classList.toggle('hidden',rows.length>0);rows.forEach(p=>{const who=[payerLabels[p.payerType]||p.payerType,p.payerName].filter(Boolean).join(' · ');const row=document.createElement('article');row.className='payment-row';row.innerHTML=`<div><strong>${money.format(Number(p.amount||0))}</strong><span>${fmtDate(p.paymentDate)} · ${esc(p.method||'otro')}${p.reference?` · ${esc(p.reference)}`:''}</span><small>${esc(who||'Pagador no especificado')}</small></div><span class="payment-status ${esc(p.status)}">${p.status==='posted'?'Cobrado':esc(p.status)}</span>`;hist.appendChild(row);});const open=['pending_payment','partial_payment'].includes(d.status)&&balance>0;const canPay=open&&canWrite;$('paymentForm').classList.toggle('hidden',!canPay);$('paymentClosedNote').classList.toggle('hidden',canPay);if(canPay){$('paymentAmount').value=balance.toFixed(2);$('paymentAmount').max=balance.toFixed(2);$('paymentDate').value=new Date().toISOString().slice(0,10);$('paymentPayerType').value='guardian';$('paymentPayer').value=d.customer_name||'';}payMsg();}
function renderReadiness(){const r=current?.readiness||{},box=$('readinessBox');box.dataset.ready=r.ok?'true':'false';$('readinessTitle').textContent=r.ok?'Listo para producción':'Aún no está listo';$('readinessText').textContent=readinessText(r);$('readinessPayment').textContent=`Pago ${Number(r.paidPercent||0).toFixed(0)}% · requerido ${Number(r.effectivePaymentRequirementPercent||100).toFixed(0)}%`;}
function renderStateActions(d){if(!canManage)return;const s=$('nextStatus');s.innerHTML='';const opts=transitions[d.status]||[];opts.forEach(v=>{const op=document.createElement('option');op.value=v;op.textContent=labels[v]||v;s.appendChild(op);});const hasAction=opts.some(v=>v!==d.status);$('statusActions').classList.toggle('hidden',!hasAction);$('saveStatus').disabled=!canManage||!hasAction;}
function itemEditor(i,d){
  const a=i.attributes||{},editable=canManage&&['draft','pending_payment','partial_payment','paid'].includes(d.status);
  const talla=a.talla||a.size||'',nombre=a.nombrePers||a.personalizationName||'',numero=a.numero||a.number||'';
  const bundle=a.bundleName?`<span class="item-chip bundle">${esc(a.bundleName)}${a.bundleTier?` · ${esc(a.bundleTier)}`:''}</span>`:'';
  const chips=[bundle,itemChip('Talla',talla),itemChip('Nombre',nombre),itemChip('Número',numero)].filter(Boolean).join('');
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
function collapseDrawerSections(){['paymentHistoryWrap','fullDetail'].forEach(id=>$(id)?.classList.add('hidden'));['togglePaymentHistory','toggleFullDetail'].forEach(id=>{const b=$(id);if(!b)return;b.setAttribute('aria-expanded','false');b.classList.remove('open');});}
async function openOrder(o){current=await rpc('v2_order_detail',{organization_id:ctx.organization_id,order_id:o.id});details.set(o.id,current);const d=current.order;$('orderFolio').textContent=d.folio;$('orderMeta').textContent=`${fmt(d.created_at)} · ${sourceLabel(d.source)}`;$('orderTotal').textContent=money.format(Number(d.total||0));$('orderStatusLabel').className='order-status '+esc(d.status);$('orderStatusLabel').textContent=labels[d.status]||d.status;renderTracker(d.status);$('customerName').textContent=d.customer_name||'Sin nombre';$('customerContact').textContent=[d.customer_phone,d.customer_email].filter(Boolean).join(' · ')||'Sin contacto';const items=$('itemList');items.innerHTML=(current.items||[]).map(i=>itemEditor(i,d)).join('');items.querySelectorAll('.save-item').forEach(b=>b.addEventListener('click',()=>saveItem(b.closest('.item-row'))));renderProfitability();renderPayments(d);renderReadiness();renderStateActions(d);renderBusinessMetrics(orders.filter(vigente));render();msg();collapseDrawerSections();$('backdrop').classList.remove('hidden');$('drawer').classList.remove('hidden');}
function close(){current=null;$('backdrop').classList.add('hidden');$('drawer').classList.add('hidden');msg();payMsg();}async function refreshCurrent(orderId){details.delete(orderId);await load();const o=orders.find(x=>x.id===orderId);if(o)await openOrder(o);else close();}
async function saveItem(row){if(!current||!canManage||!row)return;const orderId=current.order.id,btn=row.querySelector('.save-item');btn.disabled=true;try{await rpc('v2_update_order_item_fulfillment',{organization_id:ctx.organization_id,order_item_id:row.dataset.itemId,size:row.querySelector('.item-size').value.trim()||null,personalization_name:row.querySelector('.item-name').value.trim()||null,number:row.querySelector('.item-number').value.trim()||null,notes:row.querySelector('.item-note').value.trim()||null});await refreshCurrent(orderId);msg('Datos de pieza actualizados y readiness recalculado.','success');}catch(e){msg(e.message||'No se pudo actualizar la pieza.');btn.disabled=false;}}
async function postPayment(){if(!current||!canWrite)return;const d=current.order,amount=Number($('paymentAmount').value||0),balance=Number(current.balance||0),payerType=$('paymentPayerType').value,payerName=$('paymentPayer').value.trim();if(!Number.isFinite(amount)||amount<=0){payMsg('Captura un monto mayor a cero.');return;}if(amount>balance+0.005){payMsg(`El pago excede el saldo de ${money.format(balance)}.`);return;}if(payerType==='sponsor'&&!payerName){payMsg('Indica el nombre del patrocinador.');return;}const btn=$('savePayment');btn.disabled=true;payMsg();try{await rpc('v2_post_order_payment_attributed',{organization_id:ctx.organization_id,order_id:d.id,amount,payment_date:$('paymentDate').value||new Date().toISOString().slice(0,10),method:$('paymentMethod').value||'other',reference:$('paymentReference').value.trim()||null,payer_type:payerType,payer_name:payerName||d.customer_name||null,idempotency_key:`order-${d.id}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`});await refreshCurrent(d.id);payMsg('Pago registrado con pagador y estado actualizado.','success');}catch(e){payMsg(e.message||'No se pudo registrar el pago.');}finally{btn.disabled=!canWrite;}}
async function saveStatus(){if(!current||!canManage)return;const btn=$('saveStatus'),id=current.order.id;btn.disabled=true;try{await rpc('v2_update_order_status',{organization_id:ctx.organization_id,order_id:id,new_status:$('nextStatus').value});await refreshCurrent(id);msg('Estado actualizado.','success');}catch(e){msg(e.message||'No se pudo actualizar.');}finally{btn.disabled=!canManage;}}
function setupToggle(btnId,wrapId){const btn=$(btnId),wrap=$(wrapId);if(!btn||!wrap)return;btn.addEventListener('click',()=>{const nowHidden=wrap.classList.toggle('hidden');btn.setAttribute('aria-expanded',String(!nowHidden));btn.classList.toggle('open',!nowHidden);});}
setupToggle('togglePaymentHistory','paymentHistoryWrap');setupToggle('toggleFullDetail','fullDetail');
$('paymentPayerType').addEventListener('change',()=>{if($('paymentPayerType').value==='guardian'&&current)$('paymentPayer').value=current.order.customer_name||'';});$('statusFilter').addEventListener('change',render);$('orderSearch').addEventListener('input',render);$('closeDrawer').addEventListener('click',close);$('backdrop').addEventListener('click',close);$('saveStatus').addEventListener('click',saveStatus);$('savePayment').addEventListener('click',postPayment);boot().catch(e=>{$('deniedText').textContent=e.message;show('deniedView');});
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
      if(!confirm('¿Eliminar este pedido? Solo Presidencia puede hacerlo.')) return;
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
