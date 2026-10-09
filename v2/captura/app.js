import { createClient } from '/v2/supabase-client.js';
import { getSignedPhotoUrls } from '/v2/photo-cache.js';
import '/v2/smart-select.js';
import { elegirDorsal, tableroDorsales, libresDe, pintaChipsDorsal } from '/v2/dorsal.js';
const supabase=createClient('https://pacnegivzgxpanphrnwp.supabase.co','sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:2});
const JERSEY_RE=/jersey|uniforme|playera/i;

let ctx=null,canWrite=false,bundles=[],products=[],cart=[],tanners=[],tannerId='',externo=false;
let picking=null;
/* Viniendo de Taquilla (/v2/captura/?desde=taquilla&tanner=…): el Tanner ya
   viene elegido y, al crear el pedido, el siguiente paso es cobrar el
   anticipo allá mismo. Los uniformes se mandan a hacer y casi siempre se
   deja anticipo. */
const URLQ=new URLSearchParams(location.search);
const DESDE_TAQUILLA=URLQ.get('desde')==='taquilla';
let ultimoPedido=null; // {kind:'bundle', bundle} | {kind:'product', product}

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
  const [data,jug]=await Promise.all([
    rpc('v2_catalog',{organization_id:ctx.organization_id}),
    // Si el padrón no carga, el mostrador sigue vendiendo a mano: una tienda
    // que no puede cobrar porque falló una lista es peor que una sin atajo.
    rpc('v2_players',{organization_id:ctx.organization_id}).catch(e=>{console.warn('padrón',e);return [];})
  ]);
  tanners=(Array.isArray(jug)?jug:[]).filter(p=>p.status==='active');
  pintaTanners();
  const pre=URLQ.get('tanner');
  if(pre&&tanners.some(p=>String(p.id)===String(pre))){tannerId=pre;const sel=$('capPlayer');if(sel)sel.value=pre;pintaQuien();}
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
/* La tarjeta que se ve como tienda.

   Antes era tres renglones de texto. Una playera se elige con los ojos: el
   club tiene cuatro jerseys que se distinguen por color y corte, y leer
   "Jersey Pink Cantera - Away Edition" no es lo mismo que verla.

   La foto entra DESPUÉS, firmada, igual que en Jugadores: primero se pinta
   el monograma para que la cuadrícula no espere a la red, y la imagen cae
   encima cuando llega. Un producto sin foto se queda con su monograma y la
   tienda sigue sirviendo — no se rompe por un dato que falta. */
function productCard(p){
  const btn=document.createElement('button');btn.type='button';btn.className='pick-card pick-card-foto';
  const iniciales=String(p.name||'?').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase()||'T';
  const foto=p.photoThumbPath||p.photoPath;
  const attr=foto?` data-photo-path="${esc(foto)}" data-photo-bucket="${esc(p.photoBucket||'tanneros-private')}"`:'';
  const tallas=Array.isArray(p.sizes)?p.sizes.length:0;
  btn.innerHTML=`<span class="pick-foto"${attr}><b aria-hidden="true">${esc(iniciales)}</b></span>`
    +`<span class="pick-datos"><strong>${esc(p.name)}</strong>`
    +`<span>${esc(p.category||'Producto')}${tallas?` · ${tallas} tallas`:''}</span>`
    +`<b>${money.format(Number(p.price||0))}</b></span>`;
  btn.addEventListener('click',()=>openProductDrawer(p));
  return btn;
}
// Las URLs firmadas caducan, así que se piden al pintar y no se guardan.
async function firmaFotos(){
  const caras=[...document.querySelectorAll('.pick-foto[data-photo-path]')];
  if(!caras.length)return;
  const porBucket={};
  caras.forEach(el=>{const b=el.dataset.photoBucket||'tanneros-private';(porBucket[b]=porBucket[b]||[]).push(el.dataset.photoPath);});
  for(const bucket of Object.keys(porBucket)){
    try{
      const mapa=await getSignedPhotoUrls(supabase,bucket,porBucket[bucket]);
      caras.forEach(el=>{
        if((el.dataset.photoBucket||'tanneros-private')!==bucket)return;
        const url=mapa[el.dataset.photoPath];
        if(url)el.innerHTML=`<img src="${esc(url)}" alt="" loading="lazy" decoding="async">`;
      });
    }catch(e){/* sin foto se queda el monograma: la tienda no depende de ella */}
  }
}
function renderBundleGrid(){const g=$('bundleGrid');g.innerHTML='';$('bundleEmpty').classList.toggle('hidden',bundles.length>0);bundles.forEach(b=>g.appendChild(bundleCard(b)));}
function renderProductGrid(){const g=$('productGrid');g.innerHTML='';$('productEmpty').classList.toggle('hidden',products.length>0);products.forEach(p=>g.appendChild(productCard(p)));firmaFotos();}

/* ---------- Para quién es el pedido ----------

   El mostrador pedía nombre y teléfono tecleados. La familia que está
   enfrente casi siempre es la de un Tanner que ya está en el sistema, con su
   tutor, su teléfono, su nombre y su dorsal. Teclearlo otra vez cuesta
   tiempo con la gente esperando, y acaba con el mismo papá escrito de tres
   formas distintas.

   Ahora se elige al Tanner y el servidor completa lo demás desde su
   expediente (migración v1). Lo que se gana no es sólo rapidez: el pedido
   queda LIGADO al jugador, así que aparece en su estado de cuenta y la
   familia lo ve en su portal.

   El botón de captura a mano no es un adorno: el club también le vende a un
   abuelo, a un patrocinador o a alguien que pasó por el estadio, y ese
   pedido tiene que poder levantarse igual de rápido. */
function nombreDeTanner(p){
  return String(`${p.first_name||''} ${p.last_name||''}`).replace(/\s+/g,' ').trim()||'Sin nombre';
}
function tannerElegido(){ return tanners.find(p=>String(p.id)===String(tannerId))||null; }

/* Número de camiseta en un toque (Presidencia, 08/10/2026). "Elegir" abre los
   libres de la categoría del Tanner. Si el Tanner todavía no tiene número, el
   que se elige se le queda en su expediente (v2_assign_jersey): así no hay que
   ir a Jugadores. Si ya tiene, el pedido puede llevar otro, pero el del club no
   cambia desde aquí. */
function pistaNumero(pre,texto,tono){
  const el=$(`${pre}NumberHint`);if(!el)return;
  const t=tannerElegido();
  if(texto===undefined){
    texto=!t?'':t.jersey_number?`Su número en el club: #${t.jersey_number}`:'Aún no tiene número: elige uno y se le queda.';
    tono=t&&!t.jersey_number?'mal':'';
  }
  el.textContent=texto;el.className=`num-pista${tono?` ${tono}`:''}`;
  chipsNumero(pre);
}
/* A (Presidencia, 09/10/2026): si el Tanner no tiene número, sus libres salen
   ahí mismo en chips. Un toque y queda en el pedido y en su expediente. */
const chipsSeq={};
async function chipsNumero(pre){
  const box=$(`${pre}NumberChips`);if(!box)return;
  const t=tannerElegido(),seq=chipsSeq[pre]=(chipsSeq[pre]||0)+1;
  if(!t||t.jersey_number||!t.category){box.hidden=true;box.innerHTML='';return;}
  try{
    const {taken}=await tableroDorsales({rpc,organizationId:ctx.organization_id,category:t.category});
    if(chipsSeq[pre]!==seq||tannerElegido()!==t)return;
    box.hidden=false;
    pintaChipsDorsal(box,{libres:libresDe(taken,5),etiqueta:`Libres en ${t.category}:`,
      onPick:(n,b)=>{box.querySelectorAll('button').forEach(x=>x.disabled=true);asignaNumero(pre,n);},
      onOtro:()=>elegirNumero(pre)});
  }catch(_){if(chipsSeq[pre]===seq){box.hidden=true;box.innerHTML='';}}
}
async function elegirNumero(pre){
  const t=tannerElegido();
  const n=await elegirDorsal({rpc,organizationId:ctx.organization_id,category:t?.category||'',
    nombre:t?(t.first_name||'').split(/\s+/)[0]:'',actual:t?.jersey_number||$(`${pre}Number`).value});
  if(n)await asignaNumero(pre,n);
}
async function asignaNumero(pre,n){
  const t=tannerElegido();
  $(`${pre}Number`).value=n;
  if(!t){pistaNumero(pre,'');return;}
  if(t.jersey_number){
    pistaNumero(pre,String(t.jersey_number)===n?`Su número en el club: #${n}`:`Sólo en este pedido: su número en el club sigue siendo #${t.jersey_number}.`);
    return;
  }
  try{
    await rpc('v2_assign_jersey',{organization_id:ctx.organization_id,player_id:t.id,number:n});
    t.jersey_number=n;
    pistaNumero(pre,`Listo: el #${n} ya es de ${(t.first_name||'').split(/\s+/)[0]} en ${t.category}.`,'ok');
  }catch(e){
    $(`${pre}Number`).value='';
    // Alguien más lo tomó en ese momento: se avisa y los chips se recalculan.
    pistaNumero(pre,String(e?.message||'No se pudo guardar el número.'),'mal');
  }
}
function pintaTanners(){
  const sel=$('capPlayer');if(!sel)return;
  sel.innerHTML='<option value="">Selecciona al Tanner</option>'
    +tanners.map(p=>`<option value="${esc(p.id)}">${esc(nombreDeTanner(p))}${p.category?` · ${esc(p.category)}`:''}</option>`).join('');
  // Sin padrón no se ofrece el atajo: se captura a mano y se dice por qué.
  if(!tanners.length){ modoExterno(true,'No se pudo cargar el padrón. Captura los datos a mano.'); }
}
function pintaQuien(){
  const caja=$('capPlayerCard');if(!caja)return;
  const p=tannerElegido();
  if(!p||externo){caja.classList.add('hidden');caja.innerHTML='';return;}
  const dorsal=p.jersey_number?` · #${esc(p.jersey_number)}`:'';
  caja.classList.remove('hidden');
  caja.innerHTML=`<strong>${esc(nombreDeTanner(p))}</strong>`
    +`<span>${esc(p.category||'Sin categoría')}${dorsal}</span>`
    +`<small>Los datos de contacto salen de su expediente. El pedido queda en su estado de cuenta.</small>`;
}
function modoExterno(on,motivo){
  externo=Boolean(on);
  $('capManual')?.classList.toggle('hidden',!externo);
  $('capPlayer')?.closest('label')?.classList.toggle('hidden',externo);
  const btn=$('capExterno');
  if(btn)btn.textContent=externo?'Es un Tanner del club':'No es del club, capturar a mano';
  if(externo){tannerId='';const s=$('capPlayer');if(s)s.value='';}
  pintaQuien();
  if(motivo)createMsg(motivo,'error');
}
$('capExterno')?.addEventListener('click',()=>modoExterno(!externo));
$('capPlayer')?.addEventListener('change',e=>{
  tannerId=e.target.value||'';
  pintaQuien();
  createMsg();
});

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
  // El nombre y el número se proponen desde el expediente, igual que en una
  // prenda suelta: el kit es justo lo que más se pide y salía vacío.
  const tk=tannerElegido();
  $('bfName').value=tk?nombreDeTanner(tk):'';$('bfNumber').value=tk?.jersey_number?String(tk.jersey_number):'';
  pistaNumero('bf');
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
/* La talla se toca, no se teclea.

   El campo era texto libre, y en los pedidos reales del club acabaron
   conviviendo "12", "Mediana" y "Universal" para decir cosas parecidas. El
   proveedor recibe esa hoja y tiene que adivinar. Con el catálogo ya
   capturado, las tallas del producto salen como botones y lo que llega a la
   hoja de producción está escrito igual siempre.

   Si un producto todavía no tiene tallas capturadas se cae al campo de
   texto: más vale poder levantar el pedido que bloquearlo por un dato de
   catálogo que falta. */
function pintaTallas(p){
  const caja=$('pfTallas'),libre=$('pfTalla');
  const tallas=Array.isArray(p.sizes)?p.sizes.filter(Boolean):[];
  if(!caja)return;
  if(!tallas.length){
    caja.innerHTML='';caja.classList.add('hidden');
    libre.classList.remove('hidden');libre.value='';
    return;
  }
  libre.classList.add('hidden');libre.value='';
  caja.classList.remove('hidden');
  caja.innerHTML=tallas.map(t=>`<button type="button" class="talla-chip" data-talla="${esc(t)}">${esc(t)}</button>`).join('');
}
function tallaElegida(){
  const activo=$('pfTallas')?.querySelector('.talla-chip.activa');
  return activo?activo.dataset.talla:$('pfTalla').value.trim();
}
$('pfTallas')?.addEventListener('click',e=>{
  const b=e.target.closest?.('.talla-chip');if(!b)return;
  [...e.currentTarget.querySelectorAll('.talla-chip')].forEach(x=>x.classList.toggle('activa',x===b));
});
function openProductDrawer(p){
  picking={kind:'product',product:p};
  drawerMsg();
  $('drawerKicker').textContent='PRODUCTO';
  $('drawerTitle').textContent=p.name;
  $('productForm').classList.remove('hidden');
  $('bundleForm').classList.add('hidden');
  $('pfTalla').value='';$('pfQty').value=1;
  // El nombre y el dorsal se proponen desde el expediente del Tanner. No se
  // imponen: se pueden borrar. Pero teclearlos con la familia enfrente es
  // justo donde se cuela el error de dedo, y una playera mal estampada no se
  // devuelve.
  const t=tannerElegido();
  $('pfName').value=t?nombreDeTanner(t):'';
  $('pfNumber').value=t?.jersey_number?String(t.jersey_number):'';
  pistaNumero('pf');
  pintaTallas(p);
  $('pfPersonalization').classList.toggle('hidden',!JERSEY_RE.test(p.name));
  openDrawer();
}
function addProductToCart(){
  const p=picking.product;
  const talla=tallaElegida();
  const qty=Math.max(1,Math.min(20,Number($('pfQty').value)||1));
  if(!talla){drawerMsg('Elige la talla.');return;}
  const isJersey=JERSEY_RE.test(p.name);
  const name=isJersey?$('pfName').value.trim():'',number=isJersey?$('pfNumber').value.trim():'';
  cart.push({
    kind:'product',productId:p.id,talla,quantity:qty,personalizationName:name||null,number:number||null,
    total:Number(p.price||0)*qty,
    label:`${p.name} · ${talla}${qty>1?` ×${qty}`:''}${name?` — ${name}${number?' #'+number:''}`:''}`
  });
  renderCart();
  drawerMsg('Agregado al pedido.','success');
  $('pfTallas')?.querySelectorAll('.talla-chip.activa').forEach(x=>x.classList.remove('activa'));
  $('pfTalla').value='';$('pfQty').value=1;$('pfName').value='';$('pfNumber').value='';
}
$('pfAdd').addEventListener('click',addProductToCart);
$('pfPickNumber').addEventListener('click',()=>elegirNumero('pf'));
$('bfPickNumber').addEventListener('click',()=>elegirNumero('bf'));

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
  const p=tannerElegido();
  const name=$('custName').value.trim(),phone=$('custPhone').value.trim(),email=$('custEmail').value.trim();
  // Con un Tanner elegido, el servidor completa nombre y teléfono desde su
  // expediente: aquí no se exige teclear lo que el club ya sabe.
  if(!p&&!externo){createMsg('Elige al Tanner, o captura los datos a mano si no es del club.');return;}
  if(externo){
    if(name.length<2){createMsg('Captura el nombre del cliente.');return;}
    if(!phone){createMsg('Captura el teléfono.');return;}
  }
  if(!cart.length){createMsg('Agrega al menos una pieza al pedido.');return;}
  const lines=cart.map(item=>item.kind==='bundle'
    ?{kind:'bundle',bundleId:item.bundleId,tier:item.tier,personalizationName:item.personalizationName,number:item.number,pieces:item.pieces}
    :{kind:'product',productId:item.productId,talla:item.talla,quantity:item.quantity,personalizationName:item.personalizationName,number:item.number});
  const btn=$('createOrder');btn.disabled=true;createMsg();
  try{
    const result=await rpc('v2_create_internal_order',{organization_id:ctx.organization_id,customer_name:name||null,customer_phone:phone||null,customer_email:email||null,notes:$('orderNotes').value.trim()||null,lines,player_id:p?p.id:null});
    ultimoPedido={id:result.id,tanner:p?p.id:''};
    const cobrar=$('confirmCobrar');
    if(cobrar){
      cobrar.classList.toggle('hidden',!DESDE_TAQUILLA);
      cobrar.href=`/taquilla/?cobrar=tienda&pedido=${encodeURIComponent(result.id)}${p?`&tanner=${encodeURIComponent(p.id)}`:''}`;
    }
    const ver=$('confirmOpenLink');if(ver)ver.className=DESDE_TAQUILLA?'secondary':'primary';
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
  tannerId='';const selT=$('capPlayer');if(selT)selT.value='';
  if(externo)modoExterno(false);else pintaQuien();
  renderCart();createMsg();
  $('confirmView').classList.add('hidden');
  $('captureView').classList.remove('hidden');
}
$('confirmNew').addEventListener('click',resetCapture);

boot().catch(err=>{console.error(err);$('deniedText').textContent='No se pudo cargar la captura de pedidos.';show('deniedView');});
