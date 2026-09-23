import {bootstrapProtectedShell,rpc,money,$,moduleAccess,setShellHealth,supabase} from '/v2/shell.js';
import {getSignedPhotoUrls} from '/v2/photo-cache.js';
import {etiquetaCondicion,condicionDeFila,estadoVigencia,desglose,aCobrarHoy,
        tiposDeBeneficio,filtra,totales,beneficiosSoloEtiqueta,
        COLUMNAS_REPORTE,filaDeReporte,resumenDeReporte,textoDeFiltros,
        nombreDeArchivo} from '/v2/taquilla/montos.js';

const boot=await bootstrapProtectedShell({active:'taquilla',title:'Taquilla'});
if(!boot)throw new Error('No access');
const {ctx,navigation}=boot;
const org=ctx.organization_id;
const canCashWrite=moduleAccess(navigation,'taquilla',true)||moduleAccess(navigation,'cobranza',true);
const canAccountingWrite=moduleAccess(navigation,'contabilidad',true);
// Pagar ya no depende exclusivamente de Contabilidad: quien opera esta caja (Taquilla RW) también puede pagar.
const canPayWrite=canCashWrite||canAccountingWrite;
// Cobranza es información sensible del club: solo Presidencia la ve en
// Taquilla, aunque el módulo 'cobranza' (adeudos al buscar un Tanner para
// cobrar) siga habilitado para el rol Taquilla como hasta ahora.
const canViewCollections=moduleAccess(navigation,'cobranza',false)&&ctx.role==='Presidencia';
let snapshot=null,billingPlayers=[],collectMode='player',canViewLedger=true,receivables=[],collectionsFilter='all',collectionsExpanded=false;
const COLLECTIONS_COLLAPSED_LIMIT=6;

const isoToday=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key=prefix=>globalThis.crypto?.randomUUID?`${prefix}:${org}:${crypto.randomUUID()}`:`${prefix}:${org}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
const methodLabel=v=>({cash:'Efectivo',efectivo:'Efectivo',transfer:'Transferencia',transferencia:'Transferencia',card:'Tarjeta',tarjeta:'Tarjeta'}[String(v||'').toLowerCase()]||v||'Otro');
const safe=(p,fallback=null)=>p.catch(e=>{console.warn('cobranza widget',e);return fallback;});

function message(id,text='',type='error'){const el=$(id);if(!el)return;el.textContent=text;el.dataset.type=type;el.classList.toggle('hidden',!text);}
function modal(id,open){$('modalBackdrop').classList.toggle('hidden',!open);$(id).classList.toggle('hidden',!open);document.body.classList.toggle('cashier-modal-open',open);}
function closeModals(){['collectModal','expenseModal'].forEach(id=>$(id).classList.add('hidden'));$('modalBackdrop').classList.add('hidden');document.body.classList.remove('cashier-modal-open');resetCollectForm();resetExpenseForm();}
function resetCollectForm(){
  $('collectForm').reset();
  $('collectPlayer').value='';$('collectPlayerSearch').value='';
  $('collectPlayerClear')?.classList.add('hidden');$('collectPlayerResults')?.classList.add('hidden');$('collectPlayerResults').innerHTML='';
  $('collectDate').value=isoToday();
  $('generalPlayer').value='';$('generalPlayerSearch').value='';
  $('generalPlayerClear')?.classList.add('hidden');$('generalPlayerResults')?.classList.add('hidden');$('generalPlayerResults').innerHTML='';
  $('generalDate').value=isoToday();
  $('generalCategoryOtherWrap')?.classList.add('hidden');
  setCollectMode('player');
  message('collectMessage');
}
function resetExpenseForm(){
  $('expenseForm').reset();
  $('expenseDate').value=isoToday();
  $('expenseCategoryOtherWrap')?.classList.add('hidden');
  message('expenseMessage');
}

function uniqueCategories(type){
  const rows=(snapshot?.movements||[]).filter(m=>m.type===type&&m.category&&m.status==='posted');
  return [...new Set(rows.map(m=>m.category))].sort((a,b)=>a.localeCompare(b,'es-MX'));
}
function renderCategoryLists(){
  if($('incomeCategories'))$('incomeCategories').innerHTML=uniqueCategories('income').map(v=>`<option value="${esc(v)}"></option>`).join('');if($('expenseCategories'))$('expenseCategories').innerHTML=uniqueCategories('expense').map(v=>`<option value="${esc(v)}"></option>`).join('');
}
function renderMethods(){
  const rows=snapshot?.methods||[],body=$('methodRows');body.innerHTML='';
  $('methodsEmpty').classList.toggle('hidden',rows.length>0);
  rows.forEach(r=>{const tr=document.createElement('tr');const net=Number(r.net||0);tr.innerHTML=`<td>${esc(r.method)}</td><td class="money-in">${money.format(Number(r.income||0))}</td><td class="money-out">${Number(r.expense||0)?money.format(Number(r.expense||0)):'—'}</td><td class="${net<0?'money-out':''}">${money.format(net)}</td>`;body.appendChild(tr);});
}
function renderMovements(){
  const status=$('movementStatus').value,rows=(snapshot?.movements||[]).filter(m=>status==='all'||m.status===status),body=$('movementRows');body.innerHTML='';
  $('movementsEmpty').classList.toggle('hidden',rows.length>0);
  rows.forEach(m=>{const income=m.type==='income',tr=document.createElement('tr');tr.className=m.status!=='posted'?'is-void':'';const vtan=income&&m.playerId,vk=vtan?'refund':(income?'void-income':'void-expense'),vlabel=vtan?'Reembolsar':'Borrar';const ebtn=(m.status==='posted'&&ctx.role==='Presidencia')?('<button class="edit-move" data-edit="'+esc(m.id)+'">Editar</button>'):'';const vbtn=(m.status==='posted'&&ctx.role==='Presidencia')?('<button class="void-income'+(vtan?' is-refund':'')+'" data-void="'+esc(m.id)+'" data-kind="'+vk+'" data-amt="'+Number(m.amount||0)+'" data-method="'+esc(m.method||'')+'" data-sum="'+esc((income?'Cobro':'Pago')+' · '+(m.category||'—')+' · '+money.format(Number(m.amount||0)))+'">'+vlabel+'</button>'):'';
    const payerDiffers=m.playerName&&m.who&&m.who!=='—'&&m.who!==m.playerName;
    const whoCell=m.playerName?`<div class="movement-who"><strong>${esc(m.playerName)}</strong>${payerDiffers?`<span class="movement-payer">Pagó: ${esc(m.who)}</span>`:''}</div>`:esc(m.who||'—');
    tr.innerHTML=`<td data-label="Fecha">${esc(m.date||'')}</td><td data-label="Movimiento"><span class="movement-pill ${income?'income':'expense'}">${income?'Cobro':'Pago'}</span></td><td data-label="Categoría">${esc(m.category||'—')}</td><td data-label="Concepto">${esc(m.concept||'—')}</td><td data-label="Quién">${whoCell}</td><td data-label="Método">${esc(methodLabel(m.method))}</td><td data-label="Monto" class="${income?'money-in':'money-out'}">${income?'+':'−'} ${money.format(Number(m.amount||0))}</td><td data-label="Estado"><span class="status-pill ${esc(m.status)}">${m.status==='posted'?'Publicado':m.status==='void'?'Anulado':m.status==='refunded'?'Reembolsado':esc(m.status)}</span>${ebtn}${vbtn}</td>`;body.appendChild(tr);});
}
function applyLedgerVisibility(){
  document.querySelector('.cashier-kpis')?.classList.toggle('hidden',!canViewLedger);
  document.querySelectorAll('.cashier-cash-card:not(#cashTodayCard)').forEach(el=>el.classList.toggle('hidden',!canViewLedger));
  // Cobranza no es el libro contable: Taquilla (rol simple, sin ver caja completa)
  // también necesita saber a quién cobrarle, así que no se apaga con el resto.
  // #montosPanel se excluye a proposito: su visibilidad la manda su propio
  // boton, y quien mas lo necesita es justo Taquilla, que es quien NO ve el
  // ledger. Sin esta exclusion, el panel se abriria solo para todos los demas
  // y quedaria escondido para el unico rol que lo pidio.
  document.querySelectorAll('.cashier-panel:not(#collectionsPanel):not(#montosPanel)').forEach(el=>el.classList.toggle('hidden',!canViewLedger));
  const actions=document.querySelector('.cashier-head-actions');if(actions)actions.classList.toggle('hidden',!canViewLedger);
  $('cashTodayCard')?.classList.toggle('hidden',canViewLedger);
}

// El concepto que emite el motor viene largo ("Academia Academia de porteros ·
// 2026-09"). En una lista se muestra lo que distingue un cargo de otro. Usado
// por el buscador de Tanners y por Cobranza.
const TIPO_CARGO={monthly_fee:'Mensualidad',monthly_fee_sponsor:'Mensualidad · patrocinio',
  academy_fee:'Academia',academy_day:'Día de academia',late_fee:'Recargo',
  product:'Tienda',equipment:'Uniforme',parking:'Estacionamiento',parking_pass:'Gafete'};
function conceptoCorto(r){
  const base=TIPO_CARGO[r.charge_type]||r.concept||'Cargo';
  const mes=r.billing_period
    ? new Intl.DateTimeFormat('es-MX',{month:'short',year:'2-digit'}).format(new Date(`${String(r.billing_period).slice(0,10)}T12:00:00`))
    : '';
  return mes?`${base} ${mes}`:base;
}

// === Cobranza: estado por jugador (quién debe, quién está al corriente) con
// una acción directa de cobro — reusa el mismo modal de COBRAR (quickCollect),
// no inventa un segundo flujo para registrar pagos. ===
function playerReceivables(playerId){return (receivables||[]).filter(r=>r.player_id===playerId&&Number(r.balance_due||0)>0);}
function fmtLastPayment(d){
  if(!d)return 'Sin pagos registrados';
  return new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',year:'numeric'}).format(new Date(`${String(d).slice(0,10)}T12:00:00`));
}
const DIACRITICS_RE=new RegExp(String.fromCharCode(0x5b)+String.fromCharCode(0x300)+'-'+String.fromCharCode(0x36f)+String.fromCharCode(0x5d),'g');
const normSearch=s=>String(s||'').toLowerCase().normalize('NFD').replace(DIACRITICS_RE,'');
async function renderCollections(){
  const panel=$('collectionsPanel');if(!panel)return;
  panel.classList.toggle('hidden',!canViewCollections);
  if(!canViewCollections)return;
  const q=normSearch($('collectionsSearch')?.value).trim();
  const rows=(billingPlayers||[])
    .filter(p=>!q||normSearch(p.player_name).includes(q))
    .filter(p=>{
      if(collectionsFilter==='all')return true;
      const pending=playerReceivables(p.player_id).length>0;
      return collectionsFilter==='pending'?pending:!pending;
    })
    .sort((a,b)=>{
      const pa=playerReceivables(a.player_id).length>0,pb=playerReceivables(b.player_id).length>0;
      if(pa!==pb)return pa?-1:1;
      return String(a.player_name||'').localeCompare(String(b.player_name||''),'es-MX');
    });
  const list=$('collectionsList');if(!list)return;
  $('collectionsEmpty').classList.toggle('hidden',rows.length>0);
  const visibleRows=collectionsExpanded?rows:rows.slice(0,COLLECTIONS_COLLAPSED_LIMIT);
  const toggle=$('collectionsToggle');
  if(toggle){
    toggle.classList.toggle('hidden',rows.length<=COLLECTIONS_COLLAPSED_LIMIT);
    toggle.textContent=collectionsExpanded?'Ver menos':`Ver todos (${rows.length})`;
  }
  list.innerHTML=visibleRows.map(p=>{
    const pend=playerReceivables(p.player_id),isPending=pend.length>0;
    const total=pend.reduce((sum,r)=>sum+Number(r.balance_due||0),0);
    const concept=isPending?pend.slice(0,2).map(conceptoCorto).join(' · ')+(pend.length>2?' …':''):'Sin adeudos pendientes';
    const amount=Math.round(isPending?total:Number(p.base_monthly_fee||0));
    const initials=String(p.player_name||'T').trim().split(/\s+/).map(part=>part[0]||'').join('').toUpperCase().slice(0,2)||'T';
    const photoAttrs=p.photo_thumb_path?` data-photo-path="${esc(p.photo_thumb_path)}" data-photo-bucket="${esc(p.photo_bucket||'tanneros-private')}"`:'';
    return `<div class="collections-row">
      <span class="collections-face"${photoAttrs}><b aria-hidden="true">${esc(initials)}</b></span>
      <div class="collections-info"><strong>${esc(p.player_name)}</strong><span class="collections-concept">${esc(concept)}</span></div>
      <div class="collections-status"><span class="status-pill ${isPending?'pending':'current'}">${isPending?'Pendiente':'Al corriente'}</span><small class="collections-last">${esc(fmtLastPayment(p.last_payment_date))}</small></div>
      ${canCashWrite?`<button type="button" class="collections-collect" data-quick-collect="${esc(p.player_id)}" data-name="${esc(p.player_name||'')}" data-amount="${amount>0?amount:''}">Registrar</button>`:''}
    </div>`;
  }).join('');
  signCollectionsPhotos();
}
// Igual que signBirthdayPhotos en el home: primero pintan las iniciales (no
// bloquea la lista) y la foto entra encima cuando llega la URL firmada.
async function signCollectionsPhotos(){
  const faces=[...document.querySelectorAll('#collectionsList .collections-face[data-photo-path]')];
  if(!faces.length)return;
  const byBucket={};
  faces.forEach(el=>{const bucket=el.dataset.photoBucket||'tanneros-private';(byBucket[bucket]=byBucket[bucket]||[]).push(el.dataset.photoPath);});
  for(const bucket of Object.keys(byBucket)){
    try{
      const map=await getSignedPhotoUrls(supabase,bucket,byBucket[bucket]);
      faces.forEach(el=>{if((el.dataset.photoBucket||'tanneros-private')===bucket&&map[el.dataset.photoPath])el.innerHTML=`<img src="${esc(map[el.dataset.photoPath])}" alt="" loading="lazy">`;});
    }catch{/* sin foto se queda el monograma */}
  }
}
function render(){
  canViewLedger=snapshot?.canViewLedger!==false;
  applyLedgerVisibility();
  if(!canViewLedger){
    $('cashTodayNet').textContent=money.format(Number(snapshot?.cashTodayNet||0));
    renderCategoryLists();setShellHealth({state:'ok',label:'Listo para cobrar'});return;
  }
  const _inc=Number(snapshot?.incomeTotal||0),_exp=Number(snapshot?.expenseTotal||0),_net=Number(snapshot?.netTotal||0);
  $('incomeDay').textContent=money.format(_inc);$('incomeDay').className=_inc>0?'sem-ok':'sem-neutral';
  $('expenseDay').textContent=money.format(_exp);$('expenseDay').className='sem-neutral';
  $('netDay').textContent=money.format(_net);$('netDay').className=_net>=0?'sem-ok':(_net>-1000?'sem-warn':'sem-alert');
  $('expectedCash').textContent=money.format(Number(snapshot?.expectedCash||0));renderReconcile();
  renderMethods();renderMovements();renderCategoryLists();
  const hasMovement=Number(snapshot?.incomeTotal||0)||Number(snapshot?.expenseTotal||0);setShellHealth(hasMovement?{state:'ok',label:'Caja actualizada'}:{state:'ok',label:'Sin movimientos hoy'});
}
function renderReconcile(){
  const exp=Number(snapshot?.expectedCash||0),box=$('reconcileResult');if(!box)return;
  const raw=$('countedCash')?.value;
  if(raw===''||raw==null){box.className='reconcile-result hidden';box.textContent='';return;}
  const counted=Number(raw);if(!Number.isFinite(counted)){box.className='reconcile-result hidden';return;}
  const diff=counted-exp,abs=Math.abs(diff);let cls,txt;
  if(abs<1){cls='sem-ok';txt='Caja cuadra exacto.';}
  else if(abs<=50){cls='sem-warn';txt=(diff>0?'Sobran ':'Faltan ')+money.format(abs)+' · diferencia menor.';}
  else{cls='sem-alert';txt=(diff>0?'Sobran ':'Faltan ')+money.format(abs)+' · revisa la caja.';}
  box.className='reconcile-result '+cls;box.textContent=txt;
}
async function load(){
  snapshot=await rpc('v2_cashier_snapshot',{organization_id:org,business_date:$('businessDate').value||isoToday()});
  render();
}
async function loadPlayers(){
  if(!moduleAccess(navigation,'cobranza',false))return;
  try{billingPlayers=await rpc('v2_billing_players',{organization_id:org});}catch(e){console.warn('billing players',e);billingPlayers=[];}

}
const BILLING_ENGINE_START='2026-09-01';
// Los adeudos abiertos se siguen cargando: el buscador de cobro los muestra
// junto a cada Tanner para no tener que adivinar qué se le cobra. Lo que ya no
// vive aquí es el panel de cartera y morosidad — eso es Dirección, no caja.
async function loadReceivables(){
  const recv=await safe(rpc('v2_open_receivables',{organization_id:org}),[]);
  receivables=Array.isArray(recv)?recv:[];
}
function quickCollect(playerId,name,amount){
  if(!canCashWrite)return;
  resetCollectForm();
  $('collectPlayer').value=playerId;$('collectPlayerSearch').value=name||'';
  if(name)$('collectPlayerClear')?.classList.remove('hidden');
  if(amount)$('collectAmount').value=amount;
  modal('collectModal',true);
}
document.addEventListener('click',e=>{const b=e.target.closest?.('[data-quick-collect]');if(b)quickCollect(b.dataset.quickCollect,b.dataset.name,b.dataset.amount);});
function setCollectMode(mode){
  collectMode=mode;document.querySelectorAll('.cashier-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
  $('playerFields').classList.toggle('hidden',mode!=='player');$('generalFields').classList.toggle('hidden',mode!=='general');
  $('saveCollect').textContent=mode==='player'?'Registrar cobro':'Registrar ingreso';message('collectMessage');
}
async function confirmDoubleCheck(o){
  if(!window.tosConfirm)return true;
  return window.tosConfirm({kicker:'DOBLE CHECK',title:o.title,message:o.message,confirmText:o.confirmText||'Sí, confirmar',cancelText:'Revisar'});
}
async function postCollect(){
  const btn=$('saveCollect');btn.disabled=true;message('collectMessage');
  try{
    if(collectMode==='player'){
      const player=$('collectPlayer').value,playerName=$('collectPlayerSearch').value.trim(),amount=Math.round(Number($('collectAmount').value)),date=$('collectDate').value;
      if(!player||!Number.isFinite(amount)||amount<=0||!date)throw new Error('Completa Tanner, monto y fecha.');
      if($('collectPayerType').value==='sponsor'&&!$('collectPayerName').value.trim())throw new Error('Indica el patrocinador.');
      const okDbl=await confirmDoubleCheck({title:'Confirma el cobro',message:`Vas a registrar un cobro de ${money.format(amount)} a ${playerName||'este Tanner'} · ${methodLabel($('collectMethod').value)}. ¿Es correcto?`,confirmText:'Sí, cobrar'});
      if(!okDbl){btn.disabled=false;return;}
      await rpc('v2_post_payment',{organization_id:org,player_id:player,amount,payment_date:date,method:$('collectMethod').value,reference:$('collectReference').value.trim()||null,concept:'Mensualidad',payer_type:$('collectPayerType').value,payer_name:$('collectPayerName').value.trim()||null,idempotency_key:key('cashier-payment')});
    }else{
      const amount=Math.round(Number($('generalAmount').value)),date=$('generalDate').value,category=(($('generalCategory').value==='__otra__')?($('generalCategoryOther')?.value||''):$('generalCategory').value).trim(),concept=$('generalConcept').value.trim();
      if(!Number.isFinite(amount)||amount<=0||!date||!category||!concept)throw new Error('Completa monto, fecha, categoría y concepto.');
      const okDbl=await confirmDoubleCheck({title:'Confirma el ingreso',message:`Vas a registrar un ingreso de ${money.format(amount)} · ${concept} (${category}) · ${methodLabel($('generalMethod').value)}. ¿Es correcto?`,confirmText:'Sí, registrar'});
      if(!okDbl){btn.disabled=false;return;}
      await rpc('v2_post_general_income',{organization_id:org,amount,payment_date:date,method:$('generalMethod').value,category,concept,payer_name:$('generalPayer').value.trim()||null,reference:$('generalReference').value.trim()||null,idempotency_key:key('cashier-income'),player_id:$('generalPlayer').value||null});
    }
    closeModals();await Promise.all([load(),loadReceivables()]);renderCollections();
  }catch(e){message('collectMessage',e.message||'No se pudo registrar.');}finally{btn.disabled=false;}
}
async function postExpense(){
  const btn=$('saveExpense');btn.disabled=true;message('expenseMessage');
  try{
    const amount=Math.round(Number($('expenseAmount').value)),date=$('expenseDate').value,category=(($('expenseCategory').value==='__otra__')?($('expenseCategoryOther')?.value||''):$('expenseCategory').value).trim(),concept=$('expenseConcept').value.trim(),who=$('expenseWho').value.trim();
    if(!Number.isFinite(amount)||amount<=0||!date||!category||!concept)throw new Error('Completa monto, fecha, categoría y concepto.');
    const okDbl=await confirmDoubleCheck({title:'Confirma el pago',message:`Vas a registrar un pago de ${money.format(amount)} a ${who||concept} · ${category} · ${methodLabel($('expenseMethod').value)}. ¿Es correcto?`,confirmText:'Sí, pagar'});
    if(!okDbl){btn.disabled=false;return;}
    await rpc('v2_post_expense',{organization_id:org,amount,expense_date:date,category,method:$('expenseMethod').value,reference:$('expenseReference').value.trim()||null,concept,metadata:who?{who}: {},supplier_name:who||null,idempotency_key:key('cashier-expense')});
    closeModals();await load();
  }catch(e){message('expenseMessage',e.message||'No se pudo registrar el egreso.');}finally{btn.disabled=false;}
}

$('businessDate').value=isoToday();$('collectDate').value=isoToday();$('generalDate').value=isoToday();$('expenseDate').value=isoToday();
$('businessDate').addEventListener('change',load);$('movementStatus').addEventListener('change',renderMovements);
$('openCollect').disabled=!canCashWrite;$('openCollect').addEventListener('click',()=>{if(canCashWrite){resetCollectForm();modal('collectModal',true);}});
if(!canPayWrite){$('openExpense').classList.add('disabled');$('openExpense').setAttribute('aria-disabled','true');$('paySubtitle').textContent='Sin permiso para pagar';}
$('openExpense').addEventListener('click',()=>{if(canPayWrite){resetExpenseForm();modal('expenseModal',true);}});
$('modalBackdrop').addEventListener('click',closeModals);document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',closeModals));
document.querySelectorAll('.cashier-tabs button').forEach(b=>b.addEventListener('click',()=>setCollectMode(b.dataset.mode)));

$('collectForm').addEventListener('submit',e=>{e.preventDefault();postCollect();});$('expenseForm').addEventListener('submit',e=>{e.preventDefault();postExpense();});
$('printClose').addEventListener('click',()=>window.print());$('countedCash')?.addEventListener('input',renderReconcile);
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModals();});
const _params=new URLSearchParams(location.search);const action=_params.get('action');
if(action==='cobrar'&&canCashWrite)setTimeout(()=>{modal('collectModal',true);try{const pid=_params.get('player'),amt=_params.get('amount'),pnm=_params.get('name');if(pid){if(typeof setCollectMode==='function')setCollectMode('player');const hp=$('collectPlayer');if(hp)hp.value=pid;const sp=$('collectPlayerSearch');if(sp&&pnm)sp.value=decodeURIComponent(pnm);const cc=$('collectPlayerClear');if(cc)cc.classList.remove('hidden');}if(amt&&$('collectAmount'))$('collectAmount').value=amt;}catch(e){}},150);
if(action==='pagar'&&canPayWrite)setTimeout(()=>{modal('expenseModal',true);},150);
let collectionsSearchTimer=null;
$('collectionsSearch')?.addEventListener('input',()=>{
  $('collectionsSearchClear')?.classList.toggle('hidden',!$('collectionsSearch').value);
  collectionsExpanded=false;
  clearTimeout(collectionsSearchTimer);collectionsSearchTimer=setTimeout(renderCollections,120);
});
$('collectionsSearchClear')?.addEventListener('click',()=>{$('collectionsSearch').value='';$('collectionsSearchClear').classList.add('hidden');collectionsExpanded=false;renderCollections();});
document.querySelectorAll('.collections-filters button').forEach(b=>b.addEventListener('click',()=>{
  collectionsFilter=b.dataset.collectionsFilter;collectionsExpanded=false;
  document.querySelectorAll('.collections-filters button').forEach(x=>x.classList.toggle('active',x===b));
  renderCollections();
}));
$('collectionsToggle')?.addEventListener('click',()=>{collectionsExpanded=!collectionsExpanded;renderCollections();});

await Promise.all([loadPlayers(),load(),loadReceivables()]);renderCollections();


// === Corregir movimiento (VAR · solo Presidencia): Borrar o Reembolsar ===
let pendingVoid=null;
function openVoid(o){
  pendingVoid=o;const refund=o.kind==='refund';
  $('voidKicker').textContent=refund?'COBRO DE TANNER':(o.kind==='void-income'?'COBRO':'PAGO');
  $('voidTitle').textContent=refund?'Reembolsar cobro':'Borrar movimiento';
  $('voidSummary').textContent=o.sum||'';
  const hint=$('voidHint');if(hint){hint.textContent=refund?'Devuelve el dinero y regresa el saldo del Tanner. Su cuenta no se descuadra.':'';hint.classList.toggle('hidden',!refund);}
  const cta=$('voidConfirm');cta.textContent=refund?'Reembolsar':'Sí, borrar';cta.classList.toggle('refund-mode',refund);
  $('voidReason').value='';$('voidMessage').classList.add('hidden');
  $('voidModal').classList.remove('hidden');$('modalBackdrop').classList.remove('hidden');
  setTimeout(()=>$('voidReason').focus(),60);
}
function closeVoid(){pendingVoid=null;$('voidModal').classList.add('hidden');$('modalBackdrop').classList.add('hidden');}
async function confirmVoid(){
  if(!pendingVoid)return;
  const reason=($('voidReason').value||'').trim(),msg=$('voidMessage');
  if(!reason){msg.textContent='Escribe el motivo (queda en el VAR).';msg.classList.remove('hidden');return;}
  const btn=$('voidConfirm');btn.disabled=true;
  try{
    if(pendingVoid.kind==='refund'){await rpc('v2_correct_tanner_payment',{organization_id:org,payment_id:pendingVoid.id,reason});}
    else if(pendingVoid.kind==='void-income'){await rpc('v2_void_income',{organization_id:org,payment_id:pendingVoid.id,reason});}
    else{await rpc('v2_void_expense',{organization_id:org,expense_id:pendingVoid.id,reason});}
    closeVoid();await Promise.all([load(),loadReceivables()]);renderCollections();
  }catch(e){msg.textContent=(e&&e.message)||'No se pudo completar.';msg.classList.remove('hidden');}
  finally{btn.disabled=false;}
}
document.addEventListener('click',e=>{const b=e.target.closest?.('.void-income');if(b&&b.dataset.void){openVoid({id:b.dataset.void,kind:b.dataset.kind,amount:Number(b.dataset.amt||0),method:b.dataset.method||'',sum:b.dataset.sum});}if(e.target.closest?.('[data-close-void]'))closeVoid();});
$('voidConfirm')?.addEventListener('click',confirmVoid);
$('generalCategory')?.addEventListener('change',e=>$('generalCategoryOtherWrap')?.classList.toggle('hidden',e.target.value!=='__otra__'));
$('expenseCategory')?.addEventListener('change',e=>$('expenseCategoryOtherWrap')?.classList.toggle('hidden',e.target.value!=='__otra__'));


// === Buscador inteligente de Tanners (por cualquier nombre, sin acentos) ===
function tannerSearchInit(boxId,searchId,hiddenId,resultsId,clearId,onSelect){
  const inp=$(searchId),hid=$(hiddenId),res=$(resultsId),clr=$(clearId);
  if(!inp||!hid||!res)return;
  const DIACRITICS=new RegExp(String.fromCharCode(0x5b)+String.fromCharCode(0x300)+'-'+String.fromCharCode(0x36f)+String.fromCharCode(0x5d),'g');
  const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(DIACRITICS,'');
  function render(q){
    const nq=norm(q).trim();
    if(!nq){res.classList.add('hidden');res.innerHTML='';return;}
    const toks=nq.split(/\s+/);
    const matches=(billingPlayers||[]).filter(p=>{const n=norm(p.player_name);return toks.every(t=>n.includes(t));}).slice(0,25);
    // Los conceptos abiertos de cada Tanner, para no tener que adivinar qué se le cobra.
    const pend={};
    (receivables||[]).forEach(r=>{if(r.player_id)(pend[r.player_id]=pend[r.player_id]||[]).push(r);});
    const detalle=p=>{
      const filas=(pend[p.player_id]||[]).slice(0,3);
      if(!filas.length)return '<small class="tsearch-none">Sin adeudo</small>';
      return `<small class="tsearch-conc">${filas.map(r=>
        `${esc(conceptoCorto(r))} · ${money.format(Number(r.balance_due||0))}`).join(' — ')}${
        (pend[p.player_id]||[]).length>3?' — …':''}</small>`;
    };
    res.innerHTML=matches.length?matches.map(p=>
      `<button type="button" class="tsearch-opt" data-id="${p.player_id}"><span>${esc(p.player_name)}</span>${detalle(p)}</button>`
    ).join(''):'<div class="tsearch-empty">Sin coincidencias</div>';
    res.classList.remove('hidden');
  }
  inp.addEventListener('input',()=>{hid.value='';if(clr)clr.classList.toggle('hidden',!inp.value);render(inp.value);});
  inp.addEventListener('focus',()=>{if(inp.value)render(inp.value);});
  res.addEventListener('click',e=>{const b=e.target.closest('.tsearch-opt');if(!b)return;hid.value=b.dataset.id;inp.value=b.textContent;res.classList.add('hidden');if(clr)clr.classList.remove('hidden');if(typeof onSelect==='function'){const pl=(billingPlayers||[]).find(x=>String(x.player_id)===String(b.dataset.id));onSelect(pl);}});
  if(clr)clr.addEventListener('click',()=>{hid.value='';inp.value='';res.classList.add('hidden');clr.classList.add('hidden');inp.focus();});
  document.addEventListener('click',e=>{if(!e.target.closest('#'+boxId))res.classList.add('hidden');});
}
tannerSearchInit('generalPlayerBox','generalPlayerSearch','generalPlayer','generalPlayerResults','generalPlayerClear');
// Si el Tanner ya tiene recargo generado (después del día 5, TC-004), se
// prellena la suma de todo lo pendiente — no solo la mensualidad — para que
// Taquilla no tenga que hacer la cuenta a mano ni se le olvide el recargo.
tannerSearchInit('collectPlayerBox','collectPlayerSearch','collectPlayer','collectPlayerResults','collectPlayerClear',(pl)=>{
  if(!pl||$('collectAmount').value)return;
  const pendiente=(receivables||[]).filter(r=>r.player_id===pl.player_id).reduce((sum,r)=>sum+Number(r.balance_due||0),0);
  const sugerido=pendiente>0?pendiente:Number(pl.base_monthly_fee||0);
  $('collectAmount').value=sugerido>0?Math.round(sugerido):'';
});


// === Editar movimiento (solo Presidencia) ===
const _METHOD_VAL={'Efectivo':'cash','Transferencia':'transfer','Tarjeta':'card','Otro':'other'};
let pendingEdit=null;
function openEditMove(m){
  if(!m)return;pendingEdit=m;const income=m.type==='income';
  $('editKicker').textContent=income?'COBRO':'PAGO';
  $('editAmount').value=Math.round(Number(m.amount||0));
  $('editDate').value=m.date||isoToday();
  $('editMethod').value=_METHOD_VAL[m.method]||'other';
  $('editCategory').value=m.category&&m.category!=='—'?m.category:'';
  $('editConcept').value=m.concept&&m.concept!=='—'?m.concept:'';
  $('editWho').value=(m.who&&m.who!=='—')?m.who:'';
  $('editPlayerBox').classList.toggle('hidden',!income);
  if(income){$('editPlayer').value=m.playerId||'';$('editPlayerSearch').value=m.playerId?(m.playerName||''):'';$('editPlayerClear').classList.toggle('hidden',!m.playerId);}
  $('editMessage').classList.add('hidden');
  $('editModal').classList.remove('hidden');$('modalBackdrop').classList.remove('hidden');
}
function closeEditMove(){pendingEdit=null;$('editModal').classList.add('hidden');$('modalBackdrop').classList.add('hidden');}
async function saveEditMove(){
  if(!pendingEdit)return;const m=pendingEdit,income=m.type==='income',msg=$('editMessage');
  const amount=Math.round(Number($('editAmount').value));
  if(!Number.isFinite(amount)||amount<=0){msg.textContent='El monto debe ser mayor a cero.';msg.classList.remove('hidden');return;}
  const btn=$('editSave');btn.disabled=true;
  try{
    if(income){
      await rpc('v2_update_payment',{organization_id:org,payment_id:m.id,amount,method:$('editMethod').value,category:$('editCategory').value.trim(),concept:$('editConcept').value.trim(),payer_name:$('editWho').value.trim()||null,payment_date:$('editDate').value||null,reference:m.reference||null,player_id:$('editPlayer').value||null});
    }else{
      await rpc('v2_update_expense',{organization_id:org,expense_id:m.id,amount,method:$('editMethod').value,category:$('editCategory').value.trim(),concept:$('editConcept').value.trim(),supplier_name:$('editWho').value.trim()||null,expense_date:$('editDate').value||null,reference:m.reference||null});
    }
    closeEditMove();await load();
  }catch(e){msg.textContent=(e&&e.message)||'No se pudo guardar.';msg.classList.remove('hidden');}
  finally{btn.disabled=false;}
}
document.addEventListener('click',e=>{
  const b=e.target.closest?.('.edit-move');
  if(b&&b.dataset.edit){openEditMove((snapshot?.movements||[]).find(x=>x.id===b.dataset.edit));return;}
  if(e.target.closest?.('[data-close-edit]'))closeEditMove();
});
$('editSave')?.addEventListener('click',saveEditMove);
tannerSearchInit('editPlayerBox','editPlayerSearch','editPlayer','editPlayerResults','editPlayerClear');


/* ===== Montos de cobro =====
   Quien está en la ventanilla con el papá enfrente necesita una sola cosa:
   cuánto le cobro. El criterio de lectura vive en montos.js, que sí se puede
   probar sin navegador; aquí sólo se pinta y se filtra. */

const canViewMontos=moduleAccess(navigation,'taquilla',false)
  ||moduleAccess(navigation,'cobranza',false)
  ||moduleAccess(navigation,'contabilidad',false);
// Sólo Presidencia y Contabilidad exportan el reporte y fijan las tarifas.
const canExportMontos=ctx.role==='Presidencia'||moduleAccess(navigation,'contabilidad',false);
const canSetTarifas=ctx.role==='Presidencia';

let montosData=null,montosFiltro='all',montosQuery='',tarifas=[];

const mesActual=()=>new Date().toISOString().slice(0,7);
const periodoDeMes=m=>`${m||mesActual()}-01`;

function abreMontos(){
  $('montosPanel').classList.remove('hidden');
  $('collectionsPanel')?.classList.add('hidden');
  if(!$('montosPeriod').value)$('montosPeriod').value=mesActual();
  $('montosTarifas').classList.toggle('hidden',!canSetTarifas);
  $('montosPdf').classList.toggle('hidden',!canExportMontos);
  $('montosPanel').scrollIntoView({behavior:'smooth',block:'start'});
  cargaMontos();
}
function cierraMontos(){
  $('montosPanel').classList.add('hidden');
  if(canViewCollections)$('collectionsPanel')?.classList.remove('hidden');
}

async function cargaMontos(){
  message('montosMessage');
  $('montosList').innerHTML='<p class="cashier-help">Calculando…</p>';
  try{
    montosData=await rpc('v2_collection_amounts',{organization_id:org,billing_period:periodoDeMes($('montosPeriod').value)});
  }catch(e){
    $('montosList').innerHTML='';
    message('montosMessage',friendlyMontos(e));
    return;
  }
  llenaSelectoresMontos();
  pintaMontos();
}

function friendlyMontos(e){
  const t=String(e?.message||e||'');
  if(/Not authorized/i.test(t))return 'Tu rol no tiene acceso a los montos de cobro.';
  return t||'No pudimos cargar los montos.';
}

function llenaSelectoresMontos(){
  const filas=montosData?.rows||[];
  const cat=$('montosCategory'),tipo=$('montosType');
  const catSel=cat.value,tipoSel=tipo.value;
  const cats=new Map();
  filas.forEach(f=>{if(f.categoryId&&!cats.has(f.categoryId))cats.set(f.categoryId,f.categoryName||'Categoría');});
  cat.innerHTML='<option value="">Todas las categorías</option>'+
    [...cats].sort((a,b)=>String(a[1]).localeCompare(String(b[1]),'es'))
      .map(([id,n])=>`<option value="${esc(id)}">${esc(n)}</option>`).join('');
  cat.value=catSel;
  tipo.innerHTML='<option value="">Todos los beneficios</option>'+
    tiposDeBeneficio(filas).map(t=>`<option value="${esc(t.valor)}">${esc(t.etiqueta)}</option>`).join('');
  tipo.value=tipoSel;
}

function filtrosActuales(){
  return {
    texto:montosQuery,
    categoria:$('montosCategory')?.value||'',
    tipo:$('montosType')?.value||'',
    soloConBeneficio:montosFiltro==='benefit',
    soloConSaldo:montosFiltro==='debt',
    soloPorVencer:montosFiltro==='expiring'
  };
}

function pintaMontos(){
  const todas=montosData?.rows||[];
  const filas=filtra(todas,filtrosActuales());
  const t=totales(filas);
  const resumen=montosData?.summary||{};

  $('montosSub').textContent=`Periodo ${montosData?.billingPeriod||'—'} · la fuente es la misma que ya cobra el club.`;

  $('montosKpis').innerHTML=`
    <article><span>Tanners</span><strong>${t.tanners}</strong><small>de ${todas.length} en el padrón</small></article>
    <article><span>Por cobrar del mes</span><strong>${money.format(t.aCobrar)}</strong><small>mensualidad y recargos abiertos</small></article>
    <article><span>Adeudo total</span><strong>${money.format(t.adeudo)}</strong><small>incluye meses anteriores</small></article>
    <article><span>Con beneficio</span><strong>${t.conBeneficio}</strong><small>${t.porVencer} por vencer · ${t.vencidos} vencido${t.vencidos===1?'':'s'}</small></article>`;

  // El aviso más importante de la pantalla: sin tarifa de categoría no se
  // puede mostrar la resta, y hay que decirlo en vez de inventar el ordinario.
  const sinTarifa=Number(resumen.categoriesWithoutFee||0);
  const aviso=$('montosAviso');
  if(sinTarifa){
    aviso.classList.remove('hidden');
    aviso.innerHTML=`<b>${sinTarifa} categoría${sinTarifa===1?'':'s'} sin mensualidad ordinaria capturada.</b>
      Mientras falte, se muestra el monto final a cobrar pero no el desglose
      «ordinario − beneficio». El club nunca guardó ese número: el descuento venía
      metido a mano dentro de la cuota de cada Tanner.
      ${canSetTarifas?'<button type="button" id="avisoTarifas">Capturar tarifas</button>':''}`;
    $('avisoTarifas')?.addEventListener('click',abreTarifas);
  }else{
    aviso.classList.add('hidden');aviso.innerHTML='';
  }

  $('montosList').innerHTML=filas.map(tarjetaMonto).join('');
  $('montosEmpty').classList.toggle('hidden',filas.length>0);
}

function tarjetaMonto(f){
  const d=desglose(f);
  const v=estadoVigencia(f);
  const cobrar=aCobrarHoy(f);
  const soloEtiqueta=beneficiosSoloEtiqueta(f);

  const lineaDesglose=d.completo
    ? `<div class="monto-desglose${d.inconsistente?' rara':''}">
         <b>${money.format(d.ordinaria)}</b> ordinaria −
         <b>${money.format(d.beneficio)}</b> beneficio =
         <b>${money.format(d.final)}</b> mensualidad
         ${d.inconsistente?'<br>Paga más que la tarifa de su categoría. Revisar el dato.':''}
       </div>`
    : `<div class="monto-desglose parcial">Mensualidad: <b>${money.format(d.final)}</b>. ${esc(d.motivo)}</div>`;

  const nota=f.collectionNote?`<div class="monto-nota">${esc(f.collectionNote)}</div>`:'';
  const etiquetas=soloEtiqueta.length
    ? `<div class="monto-nota">${soloEtiqueta.length===1?'Este beneficio está':'Estos beneficios están'} registrado${soloEtiqueta.length===1?'':'s'} como etiqueta: no descuenta${soloEtiqueta.length===1?'':'n'} nada por su cuenta. El monto de arriba ya es el que se cobra.</div>`
    : '';
  const saldo=Number(f.outstanding||0);

  return `<article class="monto-card">
    <div class="monto-top">
      <span class="monto-quien"><strong>${esc(f.name||'Tanner')}</strong>
        <small>${esc(f.categoryName||'Sin categoría')}${f.family?` · ${esc(f.family)}`:''}</small></span>
      <span class="monto-cobrar${cobrar?'':' cero'}"><b>${money.format(cobrar)}</b><span>A cobrar</span></span>
    </div>
    <div class="monto-cond">
      <span class="cond-chip">${esc(condicionDeFila(f))}</span>
      <span class="vig vig-${v.nivel}"><i aria-hidden="true">${esc(v.icono)}</i>${esc(v.texto)}</span>
    </div>
    ${lineaDesglose}
    ${etiquetas}
    ${nota}
    <div class="monto-saldo${saldo>0?'':' limpio'}">${saldo>0?`Adeudo total ${money.format(saldo)}`:'Sin adeudo'}</div>
  </article>`;
}

/* ----- Tarifas por categoría (Presidencia) ----- */
async function abreTarifas(){
  if(!canSetTarifas)return;
  modal('tarifasModal',true);
  message('tarifasMessage');
  $('tarifasList').innerHTML='<p class="cashier-help">Cargando…</p>';
  try{ tarifas=await rpc('v2_category_fees',{organization_id:org})||[]; }
  catch(e){ $('tarifasList').innerHTML=''; message('tarifasMessage',friendlyMontos(e)); return; }
  pintaTarifas();
}

function pintaTarifas(){
  $('tarifasList').innerHTML=tarifas.map(c=>{
    const sug=c.suggested==null?null:Number(c.suggested);
    return `<div class="tarifa-row">
      <div><strong>${esc(c.name||c.code||'Categoría')}</strong>
        <small>${Number(c.activePlayers||0)} activos · ${Number(c.feeSpread||0)} cuota${Number(c.feeSpread||0)===1?'':'s'} distinta${Number(c.feeSpread||0)===1?'':'s'} hoy</small>
        ${sug!=null&&Number(c.monthlyFee||0)!==sug?`<button type="button" class="sug" data-sug="${esc(c.categoryId)}" data-valor="${sug}">Usar la más común: ${money.format(sug)}</button>`:''}
      </div>
      <div><input type="number" min="0" step="10" id="tarifa-${esc(c.categoryId)}" value="${c.monthlyFee==null?'':Number(c.monthlyFee)}" placeholder="—">
        <button type="button" data-guardar="${esc(c.categoryId)}">Guardar</button></div>
    </div>`;
  }).join('');
  $('tarifasList').querySelectorAll('[data-sug]').forEach(b=>b.addEventListener('click',()=>{
    const input=$(`tarifa-${b.dataset.sug}`); if(input)input.value=b.dataset.valor;
  }));
  $('tarifasList').querySelectorAll('[data-guardar]').forEach(b=>b.addEventListener('click',()=>guardaTarifa(b.dataset.guardar,b)));
}

async function guardaTarifa(categoryId,btn){
  message('tarifasMessage');
  const input=$(`tarifa-${categoryId}`);
  const crudo=String(input?.value??'').trim();
  const valor=crudo===''?null:Number(crudo);
  if(valor!==null&&(!Number.isFinite(valor)||valor<0)){
    message('tarifasMessage','La mensualidad no puede ser negativa.');return;
  }
  btn.disabled=true;const antes=btn.textContent;btn.textContent='…';
  try{
    await rpc('v2_set_category_fee',{organization_id:org,category_id:categoryId,monthly_fee:valor});
    tarifas=await rpc('v2_category_fees',{organization_id:org})||[];
    pintaTarifas();
    message('tarifasMessage','Tarifa guardada. No cambia lo que el sistema cobra: sólo el desglose.','success');
    if(!$('montosPanel').classList.contains('hidden'))cargaMontos();
  }catch(e){ message('tarifasMessage',friendlyMontos(e)); }
  finally{ btn.disabled=false;btn.textContent=antes; }
}

$('openMontos')?.addEventListener('click',abreMontos);
$('closeMontos')?.addEventListener('click',cierraMontos);
$('montosTarifas')?.addEventListener('click',abreTarifas);
$('montosPeriod')?.addEventListener('change',cargaMontos);
$('montosCategory')?.addEventListener('change',pintaMontos);
$('montosType')?.addEventListener('change',pintaMontos);
$('montosSearch')?.addEventListener('input',e=>{
  montosQuery=e.target.value;
  $('montosSearchClear')?.classList.toggle('hidden',!montosQuery);
  pintaMontos();
});
$('montosSearchClear')?.addEventListener('click',()=>{
  $('montosSearch').value='';montosQuery='';
  $('montosSearchClear').classList.add('hidden');pintaMontos();
});
$('montosChips')?.querySelectorAll('[data-montos-filter]').forEach(b=>b.addEventListener('click',()=>{
  montosFiltro=b.dataset.montosFilter;
  $('montosChips').querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));
  pintaMontos();
}));
$('openMontos')?.classList.toggle('hidden',!canViewMontos);

/* ----- Reporte de montos de cobro en PDF -----
   Sale de las MISMAS filas que se están viendo, ya filtradas. Si el papel
   dijera otra cosa que la pantalla, alguien iba a cobrar de más. */
async function exportaMontosPdf(){
  if(!canExportMontos)return;
  const btn=$('montosPdf');
  const antes=btn.textContent;
  btn.disabled=true;btn.textContent='Generando…';
  message('montosMessage');
  try{
    const f=filtrosActuales();
    const filas=filtra(montosData?.rows||[],f);
    if(!filas.length){message('montosMessage','No hay Tanners que coincidan con esos filtros.');return;}

    const catalogo={
      categorias:Object.fromEntries([...$('montosCategory').options].map(o=>[o.value,o.textContent])),
      tipos:Object.fromEntries([...$('montosType').options].map(o=>[o.value,o.textContent]))
    };
    const {jsPDF}=await import('https://esm.sh/jspdf@2.5.2');
    const doc=new jsPDF({unit:'pt',format:'letter',orientation:'landscape'});
    const ancho=doc.internal.pageSize.getWidth();
    const alto=doc.internal.pageSize.getHeight();
    const margen=32;
    let y=margen;

    const pesos=v=>money.format(Number(v||0));
    const hoy=new Intl.DateTimeFormat('es-MX',{dateStyle:'long',timeStyle:'short'}).format(new Date());

    function cabecera(){
      doc.setFont('helvetica','bold');doc.setFontSize(15);doc.setTextColor(7,25,30);
      doc.text('Reporte de montos de cobro',margen,y);y+=17;
      doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(100,118,123);
      doc.text(`${ctx.organization_name||'Tannery City FC'} · generado el ${hoy}`,margen,y);y+=12;
      doc.text(textoDeFiltros({...f,periodo:$('montosPeriod').value},catalogo),margen,y,{maxWidth:ancho-margen*2});y+=12;
      // Marca de uso interno: este papel trae montos de becas del club.
      doc.setTextColor(163,41,32);
      doc.text('DOCUMENTO DE CONSULTA INTERNA · no compartir fuera del club',margen,y);y+=14;
      doc.setTextColor(7,25,30);
      filaCabecera();
    }
    function filaCabecera(){
      doc.setFillColor(238,242,241);doc.rect(margen,y-9,ancho-margen*2,16,'F');
      doc.setFont('helvetica','bold');doc.setFontSize(8);doc.setTextColor(60,80,86);
      let x=margen+4;
      for(const c of COLUMNAS_REPORTE){
        doc.text(c.titulo,c.derecha?x+c.ancho-8:x,y+2,{align:c.derecha?'right':'left'});
        x+=c.ancho;
      }
      y+=18;doc.setTextColor(7,25,30);
    }
    function espacio(n){ if(y+n>alto-margen-26){doc.addPage();y=margen;filaCabecera();} }

    cabecera();
    doc.setFont('helvetica','normal');doc.setFontSize(8.5);
    let rayado=false;
    for(const fila of filas){
      espacio(15);
      const r=filaDeReporte(fila,pesos);
      if(rayado){doc.setFillColor(249,251,250);doc.rect(margen,y-9,ancho-margen*2,14,'F');}
      rayado=!rayado;
      let x=margen+4;
      for(const c of COLUMNAS_REPORTE){
        const txt=doc.splitTextToSize(String(r[c.clave]??'—'),c.ancho-8)[0]||'';
        doc.text(txt,c.derecha?x+c.ancho-8:x,y,{align:c.derecha?'right':'left'});
        x+=c.ancho;
      }
      y+=14;
    }

    const res=resumenDeReporte(filas,pesos);
    espacio(48);
    y+=6;
    doc.setDrawColor(220,229,227);doc.line(margen,y,ancho-margen,y);y+=15;
    doc.setFont('helvetica','bold');doc.setFontSize(9.5);
    doc.text(`${res.tanners} Tanners · Por cobrar ${res.aCobrar} · Adeudo total ${res.adeudo} · Con beneficio ${res.conBeneficio}`,margen,y);
    if(res.sinTarifa){
      y+=13;doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(122,90,18);
      doc.text(`${res.sinTarifa} Tanner${res.sinTarifa===1?'':'s'} sin mensualidad ordinaria capturada en su categoría: su columna "Ordinaria" sale en blanco.`,margen,y);
    }

    const paginas=doc.internal.getNumberOfPages();
    for(let i=1;i<=paginas;i++){
      doc.setPage(i);doc.setFont('helvetica','normal');doc.setFontSize(7.5);doc.setTextColor(140,155,158);
      doc.text(`Página ${i} de ${paginas} · TannerOS`,ancho-margen,alto-18,{align:'right'});
    }
    doc.save(nombreDeArchivo($('montosPeriod').value));
    message('montosMessage',`Reporte generado con ${filas.length} Tanners.`,'success');
  }catch(e){
    message('montosMessage',`No pudimos generar el PDF: ${String(e?.message||e)}`);
  }finally{ btn.disabled=false;btn.textContent=antes; }
}
$('montosPdf')?.addEventListener('click',exportaMontosPdf);
