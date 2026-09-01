import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const supabase=createClient('https://pacnegivzgxpanphrnwp.supabase.co','sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:2});
const JERSEY_RE=/jersey|uniforme|playera/i;

let ctx=null,canWrite=false,bundles=[],products=[],cart=[];
let picking=null; // {kind:'bundle', bundle} | {kind:'product', product}

function show(id){['loadingView','deniedView','view'].forEach(v=>$(v)?.classList.toggle('hidden',v!==id));}
async function rpc(n,p={}){const {data,error}=await supabase.rpc(n,p);if(error)throw error;return data;}
function createMsg(t='',type='error'){const e=$('createMessage');e.textContent=t;e.dataset.type=type;e.classList.toggle('hidden',!t);}
function drawerMsg(t='',type='error'){const e=$('drawerMessage');if(!e)return;e.textContent=t;e.dataset.type=type;e.classList.toggle('hidden',!t);}

async function boot(){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session){location.href='/v2';return;}
  const rows=await rpc('v2_my_context');
  if(!rows?.length){$('deniedText').textContent='Sin organización.';show('deniedView');return;}
  ctx=rows[0];
  const mods=await rpc('v2_my_modules',{organization_id:ctx.organization_id});
  const mod=mods.find(m=>m.module_code==='commerce');
  canWrite=!!(mod?.enabled&&mod?.can_write);
  if(!canWrite){$('deniedText').textContent='Tu rol no puede levantar pedidos. Pide a Presidencia que te dé permiso de escritura en Comercio.';show('deniedView');return;}
  $('orgName').textContent=ctx.organization_name;
  $('roleBadge').textContent=ctx.is_owner?'Propietario':ctx.role;
  await load();
  show('view');
}

async function load(){
  const data=await rpc('v2_catalog',{organization_id:ctx.organization_id});
  bundles=(data?.bundles||[]).filter(b=>b.active&&!b.archived&&b.componentsResolved);
  products=(data?.products||[]).filter(p=>p.active&&!p.archived);
  renderBundleGrid();
  renderProductGrid();
}

function bundleCard(b){
  const btn=document.createElement('button');btn.type='button';btn.className='pick-card';
  const priceLine=[b.priceAdult?`Adulto ${money.format(Number(b.priceAdult))}`:null,b.priceKid?`Niño ${money.format(Number(b.priceKid))}`:null].filter(Boolean).join(' · ');
  btn.innerHTML=`<strong>${esc(b.name)}</strong><span>${b.components.length} pieza(s)</span><b>${esc(priceLine)}</b>`;
  btn.addEventListener('click',()=>openBundleDrawer(b));
  return btn;
}
function productCard(p){
  const btn=document.createElement('button');btn.type='button';btn.className='pick-card';
  btn.innerHTML=`<strong>${esc(p.name)}</strong><span>${esc(p.category||'Producto')}</span><b>${money.format(Number(p.price||0))}</b>`;
  btn.addEventListener('click',()=>openProductDrawer(p));
  return btn;
}
function renderBundleGrid(){const g=$('bundleGrid');g.innerHTML='';$('bundleEmpty').classList.toggle('hidden',bundles.length>0);bundles.forEach(b=>g.appendChild(bundleCard(b)));}
function renderProductGrid(){const g=$('productGrid');g.innerHTML='';$('productEmpty').classList.toggle('hidden',products.length>0);products.forEach(p=>g.appendChild(productCard(p)));}

/* ---------- Drawer: kit ---------- */
function bundleSlots(b){
  // Expande cada componente por su qty en "slots" individuales (una talla por unidad,
  // igual que espera v2_create_internal_order).
  const slots=[];
  b.components.forEach(c=>{for(let i=0;i<c.qty;i++)slots.push({productId:c.productId,name:c.name,talla:''});});
  return slots;
}
function openBundleDrawer(b){
  picking={kind:'bundle',bundle:b,tier:b.priceAdult?'Adulto':'Niño',slots:bundleSlots(b)};
  drawerMsg();
  $('drawerKicker').textContent='KIT';
  $('drawerTitle').textContent=b.name;
  $('bundleForm').classList.remove('hidden');
  $('productForm').classList.add('hidden');
  $('bfName').value='';$('bfNumber').value='';
  document.querySelectorAll('.tier-btn').forEach(btn=>{
    const t=btn.dataset.tier;
    btn.disabled=(t==='Adulto'&&!b.priceAdult)||(t==='Niño'&&!b.priceKid);
    btn.classList.toggle('active',t===picking.tier);
  });
  renderBundlePieces();
  openDrawer();
}
function renderBundlePieces(){
  $('bfPieces').innerHTML=picking.slots.map((s,i)=>`<div class="component-row"><span class="component-name">${esc(s.name)}</span><input class="bf-talla" data-idx="${i}" type="text" maxlength="40" placeholder="Talla" value="${esc(s.talla)}"></div>`).join('');
  $('bfPieces').querySelectorAll('.bf-talla').forEach(inp=>inp.addEventListener('input',e=>{picking.slots[Number(e.target.dataset.idx)].talla=e.target.value;}));
}
document.querySelectorAll('.tier-btn').forEach(btn=>btn.addEventListener('click',()=>{
  if(btn.disabled||!picking||picking.kind!=='bundle')return;
  picking.tier=btn.dataset.tier;
  document.querySelectorAll('.tier-btn').forEach(b=>b.classList.toggle('active',b===btn));
}));
function addBundleToCart(){
  const b=picking.bundle,tier=picking.tier;
  const missing=picking.slots.some(s=>!s.talla.trim());
  if(missing){drawerMsg('Falta la talla de alguna pieza.');return;}
  const total=tier==='Niño'&&b.priceKid?Number(b.priceKid):Number(b.priceAdult||b.priceKid);
  const name=$('bfName').value.trim(),number=$('bfNumber').value.trim();
  cart.push({
    kind:'bundle',bundleId:b.id,bundleName:b.name,tier,personalizationName:name||null,number:number||null,
    pieces:picking.slots.map(s=>({productId:s.productId,talla:s.talla.trim()})),
    total,
    label:`${b.name} (${tier})${name?` — ${name}${number?' #'+number:''}`:''}`
  });
  renderCart();
  drawerMsg(`Agregado. Puedes agregar otro ${b.name} para otro hermano, o cerrar.`,'success');
  $('bfName').value='';$('bfNumber').value='';
  picking.slots=bundleSlots(b);
  renderBundlePieces();
}
$('bfAdd').addEventListener('click',addBundleToCart);

/* ---------- Drawer: producto suelto ---------- */
function openProductDrawer(p){
  picking={kind:'product',product:p};
  drawerMsg();
  $('drawerKicker').textContent='PRODUCTO';
  $('drawerTitle').textContent=p.name;
  $('productForm').classList.remove('hidden');
  $('bundleForm').classList.add('hidden');
  $('pfTalla').value='';$('pfQty').value=1;$('pfName').value='';$('pfNumber').value='';
  $('pfPersonalization').classList.toggle('hidden',!JERSEY_RE.test(p.name));
  openDrawer();
}
function addProductToCart(){
  const p=picking.product;
  const talla=$('pfTalla').value.trim();
  const qty=Math.max(1,Math.min(20,Number($('pfQty').value)||1));
  if(!talla){drawerMsg('Captura la talla.');return;}
  const isJersey=JERSEY_RE.test(p.name);
  const name=isJersey?$('pfName').value.trim():'',number=isJersey?$('pfNumber').value.trim():'';
  cart.push({
    kind:'product',productId:p.id,talla,quantity:qty,personalizationName:name||null,number:number||null,
    total:Number(p.price||0)*qty,
    label:`${p.name} · ${talla}${qty>1?` ×${qty}`:''}${name?` — ${name}${number?' #'+number:''}`:''}`
  });
  renderCart();
  drawerMsg('Agregado al pedido.','success');
  $('pfTalla').value='';$('pfQty').value=1;$('pfName').value='';$('pfNumber').value='';
}
$('pfAdd').addEventListener('click',addProductToCart);

function openDrawer(){$('backdrop').classList.remove('hidden');$('drawer').classList.remove('hidden');}
function closeDrawerFn(){$('backdrop').classList.add('hidden');$('drawer').classList.add('hidden');picking=null;}
$('closeDrawer').addEventListener('click',closeDrawerFn);
$('backdrop').addEventListener('click',closeDrawerFn);

/* ---------- Carrito ---------- */
function renderCart(){
  const list=$('cartList');list.innerHTML='';
  $('cartEmpty').classList.toggle('hidden',cart.length>0);
  cart.forEach((item,idx)=>{
    const row=document.createElement('div');row.className='cart-row';
    row.innerHTML=`<span>${esc(item.label)}</span><b>${money.format(item.total)}</b><button type="button" class="cart-remove" data-idx="${idx}">✕</button>`;
    row.querySelector('.cart-remove').addEventListener('click',()=>{cart.splice(idx,1);renderCart();});
    list.appendChild(row);
  });
  $('cartTotal').textContent=money.format(cart.reduce((s,i)=>s+i.total,0));
}

/* ---------- Crear pedido ---------- */
async function createOrder(){
  const name=$('custName').value.trim(),phone=$('custPhone').value.trim(),email=$('custEmail').value.trim();
  if(name.length<2){createMsg('Captura el nombre del cliente.');return;}
  if(!phone){createMsg('Captura el teléfono.');return;}
  if(!cart.length){createMsg('Agrega al menos una pieza al pedido.');return;}
  const lines=cart.map(item=>item.kind==='bundle'
    ?{kind:'bundle',bundleId:item.bundleId,tier:item.tier,personalizationName:item.personalizationName,number:item.number,pieces:item.pieces}
    :{kind:'product',productId:item.productId,talla:item.talla,quantity:item.quantity,personalizationName:item.personalizationName,number:item.number});
  const btn=$('createOrder');btn.disabled=true;createMsg();
  try{
    const result=await rpc('v2_create_internal_order',{organization_id:ctx.organization_id,customer_name:name,customer_phone:phone,customer_email:email||null,notes:$('orderNotes').value.trim()||null,lines});
    $('confirmFolio').textContent=result.folio;
    $('confirmTotal').textContent=money.format(Number(result.total||0));
    $('captureView').classList.add('hidden');
    $('confirmView').classList.remove('hidden');
  }catch(e){createMsg(e.message||'No se pudo crear el pedido.');}
  finally{btn.disabled=false;}
}
$('createOrder').addEventListener('click',createOrder);

function resetCapture(){
  cart=[];$('custName').value='';$('custPhone').value='';$('custEmail').value='';$('orderNotes').value='';
  renderCart();createMsg();
  $('confirmView').classList.add('hidden');
  $('captureView').classList.remove('hidden');
}
$('confirmNew').addEventListener('click',resetCapture);

boot().catch(err=>{console.error(err);$('deniedText').textContent='No se pudo cargar la captura de pedidos.';show('deniedView');});
