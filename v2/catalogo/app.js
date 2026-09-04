import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const supabase=createClient('https://pacnegivzgxpanphrnwp.supabase.co','sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:2});
const pct=v=>v==null?'—':`${Number(v).toFixed(0)}%`;

let ctx=null,canManage=false,canFinance=true,products=[],bundles=[],showArchived=false;
let draft=null; // {mode:'bundle'|'product', id:string|null, components:[{productId,qty}]}

const ICONS={
  kit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 8h7v7H4V8Zm9 0h7v7h-7V8Z"/></svg>',
  product:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7l8-4 8 4v10l-8 4-8-4V7Z"/><path d="M4 7l8 4 8-4M12 11v10"/></svg>'
};

function show(id){['loadingView','deniedView','view'].forEach(v=>$(v)?.classList.toggle('hidden',v!==id));}
async function rpc(n,p={}){const {data,error}=await supabase.rpc(n,p);if(error)throw error;return data;}
function drawerMsg(t='',type='error'){const e=$('drawerMessage');if(!e)return;e.textContent=t;e.dataset.type=type;e.classList.toggle('hidden',!t);}

async function boot(){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session){location.href='/v2';return;}
  const rows=await rpc('v2_my_context');
  if(!rows?.length){$('deniedText').textContent='Sin organización.';show('deniedView');return;}
  ctx=rows[0];
  const mods=await rpc('v2_my_modules',{organization_id:ctx.organization_id});
  const mod=mods.find(m=>m.module_code==='catalogo');
  if(!mod?.enabled||!mod?.can_read){$('deniedText').textContent='Tu rol no tiene acceso a Catálogo.';show('deniedView');return;}
  const financeMod=mods.find(m=>m.module_code==='commerce_finance');
  canFinance=!!(financeMod?.enabled&&financeMod?.can_read);
  // Presidencia es la única que puede crear/editar el catálogo (lo exige también el backend).
  canManage=ctx.role==='Presidencia';
  $('newBundleBtn').classList.toggle('hidden',!canManage);
  $('newProductBtn').classList.toggle('hidden',!canManage);
  $('orgName').textContent=ctx.organization_name;
  $('roleBadge').textContent=ctx.is_owner?'Propietario':ctx.role;
  await load();
  show('view');
}

async function load(){
  const data=await rpc('v2_catalog',{organization_id:ctx.organization_id});
  products=data?.products||[];
  bundles=data?.bundles||[];
  renderKpis();
  renderBundles();
  renderProducts();
}

function renderKpis(){
  const activeBundles=bundles.filter(b=>!b.archived);
  const activeProducts=products.filter(p=>!p.archived);
  $('kpiBundles').textContent=activeBundles.length;
  $('kpiBundlesSub').textContent=`${bundles.filter(b=>b.archived).length} archivado(s)`;
  $('kpiProducts').textContent=activeProducts.length;
  $('kpiProductsSub').textContent=`${products.filter(p=>p.archived).length} archivado(s)`;
  const withMargin=activeBundles.filter(b=>b.marginAdultPercent!=null);
  $('kpiMargin').textContent=withMargin.length?pct(withMargin.reduce((s,b)=>s+Number(b.marginAdultPercent||0),0)/withMargin.length):'—';
  $('kpiNoCost').textContent=activeProducts.filter(p=>p.cost==null).length;
  $('kpiMargin').closest('article')?.classList.toggle('hidden',!canFinance);
  $('kpiNoCost').closest('article')?.classList.toggle('hidden',!canFinance);
}

function bundleCard(b){
  const btn=document.createElement('button');
  btn.type='button';
  btn.className='catalog-card'+(b.archived?' archived':'');
  const chips=[`<span class="cat-chip">${b.components.length} pieza(s)</span>`];
  if(b.archived)chips.push('<span class="cat-chip archived">Archivado</span>');
  else if(!b.active)chips.push('<span class="cat-chip warn">Inactivo</span>');
  if(!b.componentsResolved)chips.push('<span class="cat-chip warn">Pieza sin resolver</span>');
  if(canFinance&&b.costComplete)chips.push(`<span class="cat-chip">Costo ${money.format(Number(b.costTotal||0))}</span>`);
  else if(canFinance)chips.push('<span class="cat-chip warn">Costo incompleto</span>');
  const priceLine=[b.priceAdult?`Adulto ${money.format(Number(b.priceAdult))}`:null,b.priceKid?`Niño ${money.format(Number(b.priceKid))}`:null].filter(Boolean).join(' · ');
  btn.innerHTML=`<span class="cat-thumb">${ICONS.kit}</span><span class="cat-body"><strong class="cat-title">${esc(b.name)}</strong><span class="cat-chips">${chips.join('')}</span></span><span class="cat-price-col"><strong class="cat-price">${esc(priceLine||'—')}</strong>${canFinance&&b.marginAdultPercent!=null?`<small class="cat-sub">Margen ${pct(b.marginAdultPercent)}</small>`:''}</span>`;
  if(canManage)btn.addEventListener('click',()=>openBundleDrawer(b));
  else btn.disabled=true;
  return btn;
}

function productCard(p){
  const btn=document.createElement('button');
  btn.type='button';
  btn.className='catalog-card'+(p.archived?' archived':'');
  const chips=[];
  if(p.sku)chips.push(`<span class="cat-chip">${esc(p.sku)}</span>`);
  if(p.category)chips.push(`<span class="cat-chip">${esc(p.category)}</span>`);
  if(p.archived)chips.push('<span class="cat-chip archived">Archivado</span>');
  else if(!p.active)chips.push('<span class="cat-chip warn">Inactivo</span>');
  if(canFinance&&p.cost==null)chips.push('<span class="cat-chip warn">Sin costo</span>');
  btn.innerHTML=`<span class="cat-thumb">${ICONS.product}</span><span class="cat-body"><strong class="cat-title">${esc(p.name)}</strong><span class="cat-chips">${chips.join('')}</span></span><span class="cat-price-col"><strong class="cat-price">${money.format(Number(p.price||0))}</strong>${canFinance&&p.marginPercent!=null?`<small class="cat-sub">Margen ${pct(p.marginPercent)}</small>`:''}</span>`;
  if(canManage)btn.addEventListener('click',()=>openProductDrawer(p));
  else btn.disabled=true;
  return btn;
}

function renderBundles(){
  const list=$('bundleList');list.innerHTML='';
  const rows=bundles.filter(b=>showArchived||!b.archived);
  $('bundleEmpty').classList.toggle('hidden',rows.length>0);
  rows.forEach(b=>list.appendChild(bundleCard(b)));
}
function renderProducts(){
  const list=$('productList');list.innerHTML='';
  const rows=products.filter(p=>showArchived||!p.archived);
  $('productEmpty').classList.toggle('hidden',rows.length>0);
  rows.forEach(p=>list.appendChild(productCard(p)));
}

/* ---------- Drawer: kit ---------- */
function openBundleDrawer(b){
  draft={mode:'bundle',id:b?.id||null,components:(b?.components||[]).map(c=>({productId:c.productId,qty:c.qty}))};
  drawerMsg();
  $('drawerKicker').textContent='KIT';
  $('drawerTitle').textContent=b?b.name:'Nuevo kit';
  $('bundleForm').classList.remove('hidden');
  $('productForm').classList.add('hidden');
  $('bName').value=b?.name||'';
  $('bDescription').value=b?.description||'';
  $('bPriceAdult').value=b?.priceAdult??'';
  $('bPriceKid').value=b?.priceKid??'';
  $('bValidUntil').value=b?.validUntil||'';
  $('bActive').checked=b?b.active:true;
  const addSel=$('bAddProduct');
  addSel.innerHTML=products.filter(p=>!p.archived).map(p=>`<option value="${esc(p.id)}">${esc(p.name)}${p.sku?' · '+esc(p.sku):''}</option>`).join('')||'<option value="">Sin productos disponibles</option>';
  $('bAddQty').value=1;
  $('bArchiveToggle').classList.toggle('hidden',!b);
  $('bArchiveToggle').textContent=b?.archived?'Restaurar kit':'Archivar kit';
  renderComponents();
  openDrawer();
}
function renderComponents(){
  const wrap=$('bComponents');
  if(!draft.components.length){wrap.innerHTML='<p class="muted mini-empty">Agrega al menos una pieza.</p>';recomputeBundlePreview();return;}
  wrap.innerHTML=draft.components.map(c=>{
    const p=products.find(x=>x.id===c.productId);
    const name=p?p.name:'(producto no encontrado)';
    const priceInfo=canFinance&&p?`<small class="cat-sub">${p.cost!=null?money.format(p.cost)+' c/u':'sin costo'}</small>`:'';
    return `<div class="component-row" data-pid="${esc(c.productId)}"><span class="component-name">${esc(name)}${priceInfo}</span><input type="number" class="component-qty" min="1" max="20" step="1" value="${c.qty}"><button class="secondary mini component-remove" type="button">Quitar</button></div>`;
  }).join('');
  wrap.querySelectorAll('.component-row').forEach(row=>{
    const pid=row.dataset.pid;
    row.querySelector('.component-qty').addEventListener('input',e=>{
      const q=Math.max(1,Math.min(20,Number(e.target.value)||1));
      const c=draft.components.find(x=>x.productId===pid);if(c)c.qty=q;
      recomputeBundlePreview();
    });
    row.querySelector('.component-remove').addEventListener('click',()=>{
      draft.components=draft.components.filter(x=>x.productId!==pid);
      renderComponents();
    });
  });
  recomputeBundlePreview();
}
function recomputeBundlePreview(){
  let cost=0,complete=true;
  draft.components.forEach(c=>{
    const p=products.find(x=>x.id===c.productId);
    if(!p||p.cost==null)complete=false;else cost+=Number(p.cost)*c.qty;
  });
  $('bCostPreview').textContent=canFinance?(complete&&draft.components.length?money.format(cost):'Pendiente'):'—';
  const priceAdult=Number($('bPriceAdult').value||0),priceKid=Number($('bPriceKid').value||0);
  $('bMarginAdultPreview').textContent=canFinance&&complete&&priceAdult>0?pct((priceAdult-cost)/priceAdult*100):'—';
  $('bMarginKidPreview').textContent=canFinance&&complete&&priceKid>0?pct((priceKid-cost)/priceKid*100):'—';
}
$('bAddBtn')?.addEventListener('click',()=>{
  const pid=$('bAddProduct').value;if(!pid)return;
  const qty=Math.max(1,Math.min(20,Number($('bAddQty').value)||1));
  const existing=draft.components.find(c=>c.productId===pid);
  if(existing)existing.qty=Math.min(20,existing.qty+qty);
  else draft.components.push({productId:pid,qty});
  renderComponents();
});
['bPriceAdult','bPriceKid'].forEach(id=>$(id)?.addEventListener('input',recomputeBundlePreview));
async function saveBundle(){
  const name=$('bName').value.trim();
  if(name.length<2){drawerMsg('El nombre del kit es obligatorio.');return;}
  const priceAdult=Number($('bPriceAdult').value||0),priceKid=Number($('bPriceKid').value||0);
  if(priceAdult<=0&&priceKid<=0){drawerMsg('Captura al menos un precio (adulto o niño).');return;}
  if(!draft.components.length){drawerMsg('El kit necesita al menos una pieza.');return;}
  const current=draft.id?bundles.find(b=>b.id===draft.id):null;
  const btn=$('bSave');btn.disabled=true;
  try{
    await rpc('v2_upsert_bundle',{
      organization_id:ctx.organization_id,
      id:draft.id,
      name,
      description:$('bDescription').value.trim()||null,
      price_adult:priceAdult||null,
      price_kid:priceKid||null,
      components:draft.components.map(c=>({productId:c.productId,qty:c.qty})),
      active:$('bActive').checked,
      valid_until:$('bValidUntil').value||null,
      notes:current?.notes??null
    });
    await load();
    closeDrawerFn();
  }catch(e){drawerMsg(e.message||'No se pudo guardar el kit.');}
  finally{btn.disabled=false;}
}
async function toggleBundleArchive(){
  if(!draft?.id)return;
  const b=bundles.find(x=>x.id===draft.id);if(!b)return;
  const btn=$('bArchiveToggle');btn.disabled=true;
  try{
    await rpc('v2_set_bundle_archived',{organization_id:ctx.organization_id,id:b.id,archived:!b.archived});
    await load();
    closeDrawerFn();
  }catch(e){drawerMsg(e.message||'No se pudo actualizar el kit.');}
  finally{btn.disabled=false;}
}

/* ---------- Drawer: producto ---------- */
function openProductDrawer(p){
  draft={mode:'product',id:p?.id||null,components:[]};
  drawerMsg();
  $('drawerKicker').textContent='PRODUCTO';
  $('drawerTitle').textContent=p?p.name:'Nuevo producto';
  $('productForm').classList.remove('hidden');
  $('bundleForm').classList.add('hidden');
  $('pName').value=p?.name||'';
  $('pSku').value=p?.sku||'';
  $('pCategory').value=p?.category||'';
  $('pPrice').value=p?.price??'';
  $('pCost').value=p?.cost??'';
  $('pSizes').value=Array.isArray(p?.sizes)?p.sizes.join(', '):'';
  $('pActive').checked=p?p.active:true;
  $('pArchiveToggle').classList.toggle('hidden',!p);
  $('pArchiveToggle').textContent=p?.archived?'Restaurar producto':'Archivar producto';
  recomputeProductPreview();
  openDrawer();
}
function recomputeProductPreview(){
  const price=Number($('pPrice').value||0),cost=$('pCost').value===''?null:Number($('pCost').value);
  $('pMarginPreview').textContent=canFinance&&price>0&&cost!=null?pct((price-cost)/price*100):'—';
}
['pPrice','pCost'].forEach(id=>$(id)?.addEventListener('input',recomputeProductPreview));
async function saveProduct(){
  const name=$('pName').value.trim();
  if(name.length<2){drawerMsg('El nombre del producto es obligatorio.');return;}
  const price=$('pPrice').value===''?null:Number($('pPrice').value);
  if(price==null||price<0){drawerMsg('El precio debe ser mayor o igual a 0.');return;}
  const cost=$('pCost').value===''?null:Number($('pCost').value);
  if(cost!=null&&cost<0){drawerMsg('El costo no puede ser negativo.');return;}
  const sizes=$('pSizes').value.split(',').map(s=>s.trim()).filter(Boolean);
  const current=draft.id?products.find(x=>x.id===draft.id):null;
  const btn=$('pSave');btn.disabled=true;
  try{
    await rpc('v2_upsert_product',{
      organization_id:ctx.organization_id,
      id:draft.id,
      name,
      sku:$('pSku').value.trim()||null,
      category:$('pCategory').value.trim()||null,
      price,
      cost,
      sizes,
      active:$('pActive').checked,
      description:current?.description??null,
      lead_days:current?.leadDays??null
    });
    await load();
    closeDrawerFn();
  }catch(e){drawerMsg(e.message||'No se pudo guardar el producto.');}
  finally{btn.disabled=false;}
}
async function toggleProductArchive(){
  if(!draft?.id)return;
  const p=products.find(x=>x.id===draft.id);if(!p)return;
  const btn=$('pArchiveToggle');btn.disabled=true;
  try{
    await rpc('v2_set_product_archived',{organization_id:ctx.organization_id,id:p.id,archived:!p.archived});
    await load();
    closeDrawerFn();
  }catch(e){drawerMsg(e.message||'No se pudo actualizar el producto.');}
  finally{btn.disabled=false;}
}

/* ---------- Drawer genérico ---------- */
function openDrawer(){$('backdrop').classList.remove('hidden');$('drawer').classList.remove('hidden');}
function closeDrawerFn(){$('backdrop').classList.add('hidden');$('drawer').classList.add('hidden');draft=null;}
$('closeDrawer')?.addEventListener('click',closeDrawerFn);
$('backdrop')?.addEventListener('click',closeDrawerFn);
$('bSave')?.addEventListener('click',saveBundle);
$('bArchiveToggle')?.addEventListener('click',toggleBundleArchive);
$('pSave')?.addEventListener('click',saveProduct);
$('pArchiveToggle')?.addEventListener('click',toggleProductArchive);
$('newBundleBtn')?.addEventListener('click',()=>openBundleDrawer(null));
$('newProductBtn')?.addEventListener('click',()=>openProductDrawer(null));
$('showArchived')?.addEventListener('change',e=>{showArchived=e.target.checked;renderBundles();renderProducts();});

boot().catch(err=>{console.error(err);$('deniedText').textContent='No se pudo cargar el catálogo.';show('deniedView');});
