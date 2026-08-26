import {bootstrapProtectedShell,rpc,money,$,moduleAccess,setShellHealth} from '/v2/shell.js';

const boot=await bootstrapProtectedShell({active:'taquilla',title:'Taquilla'});
if(!boot)throw new Error('No access');
const {ctx,navigation}=boot;
const org=ctx.organization_id;
const canCashWrite=moduleAccess(navigation,'taquilla',true)||moduleAccess(navigation,'cobranza',true);
const canAccountingWrite=moduleAccess(navigation,'contabilidad',true);
let snapshot=null,billingPlayers=[],collectMode='player';

const isoToday=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key=prefix=>globalThis.crypto?.randomUUID?`${prefix}:${org}:${crypto.randomUUID()}`:`${prefix}:${org}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
const methodLabel=v=>({cash:'Efectivo',efectivo:'Efectivo',transfer:'Transferencia',transferencia:'Transferencia',card:'Tarjeta',tarjeta:'Tarjeta'}[String(v||'').toLowerCase()]||v||'Otro');

function message(id,text='',type='error'){const el=$(id);if(!el)return;el.textContent=text;el.dataset.type=type;el.classList.toggle('hidden',!text);}
function modal(id,open){$('modalBackdrop').classList.toggle('hidden',!open);$(id).classList.toggle('hidden',!open);document.body.classList.toggle('cashier-modal-open',open);}
function closeModals(){['collectModal','expenseModal'].forEach(id=>$(id).classList.add('hidden'));$('modalBackdrop').classList.add('hidden');document.body.classList.remove('cashier-modal-open');message('collectMessage');message('expenseMessage');}

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
  rows.forEach(m=>{const income=m.type==='income',tr=document.createElement('tr');tr.className=m.status!=='posted'?'is-void':'';const vtan=income&&m.playerId,vk=vtan?'refund':(income?'void-income':'void-expense'),vlabel=vtan?'Reembolsar':'Borrar';const vbtn=(m.status==='posted'&&ctx.role==='Presidencia')?('<button class="void-income'+(vtan?' is-refund':'')+'" data-void="'+esc(m.id)+'" data-kind="'+vk+'" data-amt="'+Number(m.amount||0)+'" data-method="'+esc(m.method||'')+'" data-sum="'+esc((income?'Cobro':'Pago')+' · '+(m.category||'—')+' · '+money.format(Number(m.amount||0)))+'">'+vlabel+'</button>'):'';tr.innerHTML=`<td data-label="Fecha">${esc(m.date||'')}</td><td data-label="Movimiento"><span class="movement-pill ${income?'income':'expense'}">${income?'Cobro':'Pago'}</span></td><td data-label="Categoría">${esc(m.category||'—')}</td><td data-label="Concepto">${esc(m.concept||'—')}</td><td data-label="Quién">${esc(m.who||'—')}</td><td data-label="Método">${esc(methodLabel(m.method))}</td><td data-label="Monto" class="${income?'money-in':'money-out'}">${income?'+':'−'} ${money.format(Number(m.amount||0))}</td><td data-label="Estado"><span class="status-pill ${esc(m.status)}">${m.status==='posted'?'Publicado':m.status==='void'?'Anulado':m.status==='refunded'?'Reembolsado':esc(m.status)}</span>${vbtn}</td>`;body.appendChild(tr);});
}
function render(){
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
  const sel=$('collectPlayer');const _opts=billingPlayers.slice().sort((a,b)=>String(a.player_name).localeCompare(String(b.player_name),'es-MX')).map(p=>`<option value="${p.player_id}" data-fee="${p.base_monthly_fee??''}">${esc(p.player_name)}${p.billing_status==='review'?' · revisar cuota':''}</option>`).join('');sel.innerHTML='<option value="">Selecciona un Tanner</option>'+_opts;const _gp=$('generalPlayer');if(_gp)_gp.innerHTML='<option value="">Sin Tanner (ingreso general)</option>'+_opts;
}
function setCollectMode(mode){
  collectMode=mode;document.querySelectorAll('.cashier-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
  $('playerFields').classList.toggle('hidden',mode!=='player');$('generalFields').classList.toggle('hidden',mode!=='general');
  $('saveCollect').textContent=mode==='player'?'Registrar cobro':'Registrar ingreso';message('collectMessage');
}
async function postCollect(){
  const btn=$('saveCollect');btn.disabled=true;message('collectMessage');
  try{
    if(collectMode==='player'){
      const player=$('collectPlayer').value,amount=Number($('collectAmount').value),date=$('collectDate').value;
      if(!player||!Number.isFinite(amount)||amount<=0||!date)throw new Error('Completa Tanner, monto y fecha.');
      if($('collectPayerType').value==='sponsor'&&!$('collectPayerName').value.trim())throw new Error('Indica el patrocinador.');
      await rpc('v2_post_payment',{organization_id:org,player_id:player,amount,payment_date:date,method:$('collectMethod').value,reference:$('collectReference').value.trim()||null,concept:'Mensualidad',payer_type:$('collectPayerType').value,payer_name:$('collectPayerName').value.trim()||null,idempotency_key:key('cashier-payment')});
    }else{
      const amount=Number($('generalAmount').value),date=$('generalDate').value,category=(($('generalCategory').value==='__otra__')?($('generalCategoryOther')?.value||''):$('generalCategory').value).trim(),concept=$('generalConcept').value.trim();
      if(!Number.isFinite(amount)||amount<=0||!date||!category||!concept)throw new Error('Completa monto, fecha, categoría y concepto.');
      await rpc('v2_post_general_income',{organization_id:org,amount,payment_date:date,method:$('generalMethod').value,category,concept,payer_name:$('generalPayer').value.trim()||null,reference:$('generalReference').value.trim()||null,idempotency_key:key('cashier-income'),player_id:$('generalPlayer').value||null});
    }
    closeModals();await load();
  }catch(e){message('collectMessage',e.message||'No se pudo registrar.');}finally{btn.disabled=false;}
}
async function postExpense(){
  const btn=$('saveExpense');btn.disabled=true;message('expenseMessage');
  try{
    const amount=Number($('expenseAmount').value),date=$('expenseDate').value,category=(($('expenseCategory').value==='__otra__')?($('expenseCategoryOther')?.value||''):$('expenseCategory').value).trim(),concept=$('expenseConcept').value.trim(),who=$('expenseWho').value.trim();
    if(!Number.isFinite(amount)||amount<=0||!date||!category||!concept)throw new Error('Completa monto, fecha, categoría y concepto.');
    await rpc('v2_post_expense',{organization_id:org,amount,expense_date:date,category,method:$('expenseMethod').value,reference:$('expenseReference').value.trim()||null,concept,metadata:who?{who}: {},idempotency_key:key('cashier-expense')});
    closeModals();await load();
  }catch(e){message('expenseMessage',e.message||'No se pudo registrar el egreso.');}finally{btn.disabled=false;}
}

$('businessDate').value=isoToday();$('collectDate').value=isoToday();$('generalDate').value=isoToday();$('expenseDate').value=isoToday();
$('businessDate').addEventListener('change',load);$('movementStatus').addEventListener('change',renderMovements);
$('openCollect').disabled=!canCashWrite;$('openCollect').addEventListener('click',()=>{if(canCashWrite)modal('collectModal',true);});
if(!canAccountingWrite){$('openExpense').classList.add('disabled');$('openExpense').setAttribute('aria-disabled','true');$('paySubtitle').textContent='Requiere permiso de Contabilidad';}
$('openExpense').addEventListener('click',()=>{if(canAccountingWrite)modal('expenseModal',true);});
$('modalBackdrop').addEventListener('click',closeModals);document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',closeModals));
document.querySelectorAll('.cashier-tabs button').forEach(b=>b.addEventListener('click',()=>setCollectMode(b.dataset.mode)));
$('collectPlayer').addEventListener('change',()=>{const op=$('collectPlayer').selectedOptions?.[0];if(op?.dataset?.fee&&!$('collectAmount').value)$('collectAmount').value=Number(op.dataset.fee)||'';});
$('collectForm').addEventListener('submit',e=>{e.preventDefault();postCollect();});$('expenseForm').addEventListener('submit',e=>{e.preventDefault();postExpense();});
$('printClose').addEventListener('click',()=>window.print());$('countedCash')?.addEventListener('input',renderReconcile);
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModals();});
const action=new URLSearchParams(location.search).get('action');if(action==='cobrar'&&canCashWrite)setTimeout(()=>modal('collectModal',true),150);
await Promise.all([loadPlayers(),load()]);


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
    closeVoid();await load();
  }catch(e){msg.textContent=(e&&e.message)||'No se pudo completar.';msg.classList.remove('hidden');}
  finally{btn.disabled=false;}
}
document.addEventListener('click',e=>{const b=e.target.closest?.('.void-income');if(b&&b.dataset.void){openVoid({id:b.dataset.void,kind:b.dataset.kind,amount:Number(b.dataset.amt||0),method:b.dataset.method||'',sum:b.dataset.sum});}if(e.target.closest?.('[data-close-void]'))closeVoid();});
$('voidConfirm')?.addEventListener('click',confirmVoid);
$('generalCategory')?.addEventListener('change',e=>$('generalCategoryOtherWrap')?.classList.toggle('hidden',e.target.value!=='__otra__'));
$('expenseCategory')?.addEventListener('change',e=>$('expenseCategoryOtherWrap')?.classList.toggle('hidden',e.target.value!=='__otra__'));
