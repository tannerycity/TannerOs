import { createClient } from '/v2/supabase-client.js';
const supabase=createClient('https://pacnegivzgxpanphrnwp.supabase.co','sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',{auth:{persistSession:true,autoRefreshToken:true}});
import { getSignedPhotoUrl, getSignedPhotoUrls } from '/v2/photo-cache.js';
import { ESCALA_NINOS, ESCALA_ADULTOS, ESCALA_CLUB, TALLA_UNICA, CATEGORIAS, categoriaCanonica, ordenaTallas, textoHasta, aceptaPersonalizacion } from '/v2/tienda.js';
import { margenesDe, mezclaDeVentas, margenPonderado } from '/v2/catalogo/costos.js';
import { normalizaCodigo, revisaCodigo, ESTADOS as ESTADOS_CODIGO, ligaDeCompra, ligaDelEmbajador, mensajeEmbajador } from '/v2/codigos.js';
import { textoDestino } from '/pedido/banners.js';
import { CATEGORIAS_TIENDA, categoriaDe } from '/pedido/catalogo.js';
import { encodeVariant, THUMB_MAX_SIDE, THUMB_MAX_BYTES, FULL_MAX_SIDE, FULL_MAX_BYTES, UPLOAD_CACHE_CONTROL} from '/v2/image-encode.js';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:2});
const pct=v=>v==null?'—':`${Number(v).toFixed(0)}%`;

let ctx=null,canManage=false,canPromos=false,canFinance=true,products=[],bundles=[],showArchived=false,ofertas=[];
let draft=null; // {mode:'bundle'|'product', id:string|null, components:[{productId,qty}]}
let cargoPers={activo:false,monto:100}; // Nombre y número (h45)
let codigos={codes:[],isPresidency:false,canPay:false}; // Códigos de la tienda (h46)
let vitrinaAdmin={banners:[]}; // Banners y franja de la tienda (h49)
// Una pieza de kit puede ser fija o "a elegir" (pool, Kit Dúo 14/10/2026).
// Lo que se manda al guardar conserva las dos formas.
const piezaAEnviar=c=>Array.isArray(c.pool)?{pool:c.pool,qty:c.qty||1,name:c.poolName||c.name||'Pieza a elegir'}:{productId:c.productId,qty:c.qty||1};
const kitIncluye=(b,pid)=>(b.components||[]).some(c=>Array.isArray(c.pool)?c.pool.includes(pid):c.productId===pid);

const ICONS={
  kit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 8h7v7H4V8Zm9 0h7v7h-7V8Z"/></svg>',
  product:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7l8-4 8 4v10l-8 4-8-4V7Z"/><path d="M4 7l8 4 8-4M12 11v10"/></svg>'
};

function show(id){['loadingView','deniedView','view'].forEach(v=>$(v)?.classList.toggle('hidden',v!==id));}
async function rpc(n,p={}){const {data,error}=await supabase.rpc(n,p);if(error)throw error;return data;}
/* Un aviso que no se ve no es un aviso.

   El aviso vive hasta arriba del panel y el boton de guardar hasta abajo, asi
   que en un panel con scroll —el de producto lo tiene— quien acaba de tocar
   "Guardar" esta mirando justo donde el aviso NO esta. Un error de Storage se
   escribia correctamente y el resultado en pantalla era: nada. Por eso el
   aviso se trae a la vista cuando dice algo. */
function drawerMsg(t='',type='error'){
  const e=$('drawerMessage');if(!e)return;
  e.textContent=t;e.dataset.type=type;e.classList.toggle('hidden',!t);
  if(t)e.scrollIntoView({behavior:'smooth',block:'nearest'});
}

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
  // Editan el catálogo Presidencia y quien tenga el ajuste especial de Catálogo
  // (14/10/2026: Zul). Lo decide el servidor, el mismo que lo exige al guardar.
  // Las promociones siguen siendo sólo de Presidencia.
  canPromos=ctx.role==='Presidencia';
  canManage=canPromos||!!(await rpc('v2_can_edit_catalog',{organization_id:ctx.organization_id}).catch(()=>false));
  $('newBundleBtn').classList.toggle('hidden',!canManage);
  $('newProductBtn').classList.toggle('hidden',!canManage);
  $('orgName').textContent=ctx.organization_name;
  $('roleBadge').textContent=ctx.is_owner?'Propietario':ctx.role;
  await load();
  show('view');
  window.tosAccionesDePantalla=accionesDelCatalogo();window.dispatchEvent(new Event('tos:acciones'));
  const nuevo=new URLSearchParams(location.search).get('nuevo');
  if(canManage&&nuevo==='producto')openProductDrawer(null);
  if(canManage&&nuevo==='kit'){ver='kits';pintaCabecera();openBundleDrawer(null);}
}

async function load(){
  const data=await rpc('v2_catalog',{organization_id:ctx.organization_id});
  products=data?.products||[];
  bundles=data?.bundles||[];
  $('recargoMangaCaja')?.classList.toggle('hidden',!canManage);
  if($('recargoManga')&&document.activeElement!==$('recargoManga'))$('recargoManga').value=Number(data?.recargoMangaLarga||0)||'';
  pintaCargoPers(data?.personalizacion);
  ofertas=canPromos?((await rpc('v2_promotions',{organization_id:ctx.organization_id}).catch(()=>[]))||[]):[];
  if(canManage){const r=await rpc('v2_store_codes',{organization_id:ctx.organization_id}).catch(()=>null);
    codigos={codes:Array.isArray(r?.codes)?r.codes:[],isPresidency:!!r?.isPresidency,canPay:!!r?.canPay};
    const bn=await rpc('v2_store_banners',{organization_id:ctx.organization_id}).catch(()=>null);
    vitrinaAdmin={banners:Array.isArray(bn?.banners)?bn.banners:[]};}
  renderPendientes();
  renderBundles();
  renderProducts();
}

/* Una pantalla no tiene por que decir lo que ya se ve.

   Aqui habia cuatro mosaicos: kits activos, productos activos, margen
   promedio y sin costo. Con tres kits y ocho productos listados justo abajo,
   los dos primeros contaban algo que el ojo cuenta solo, y el margen promedio
   de los kits no es una decision: nadie cambia un precio por ese numero.

   Queda lo unico que pide accion —lo que falta capturar— y en una sola linea
   que DESAPARECE cuando no hay nada pendiente. Un tablero que siempre dice
   algo deja de leerse; uno que habla poco se lee siempre. */
function renderPendientes(){
  const vivos=products.filter(p=>!p.archived&&p.active);
  const faltas=[];
  // El costo ya no se dice aquí: vive en la pestaña Costos (13/10/2026).
  const sinCosto=0;
  const sinFoto=vivos.filter(p=>!p.photoThumbPath&&!p.photoPath).length;
  // El costo primero: sin el, el margen de los kits es una cuenta incompleta.
  if(sinCosto)faltas.push(`${sinCosto} sin costo`);
  if(sinFoto)faltas.push(`${sinFoto} sin foto`);
  // Sin descripción la ficha no vende: tela, corte y para qué es (25/10/2026).
  const sinDesc=vivos.filter(p=>!String(p.description||'').trim()).length;
  if(sinDesc)faltas.push(`${sinDesc} sin descripción`);
  const linea=$('pendientes');
  if(!linea)return;
  linea.textContent=faltas.length?`Te falta capturar: ${faltas.join(' · ')}.`:'';
  linea.classList.toggle('hidden',!faltas.length);
}

function bundleCard(b){
  const btn=document.createElement('button');
  btn.type='button';
  btn.className='catalog-card'+(b.archived?' archived':'');
  const nombres=(b.components||[]).map(c=>{if(Array.isArray(c.pool))return `${c.qty}× ${(c.poolName||'a elegir').toLocaleLowerCase('es-MX')}`;const p=products.find(x=>x.id===c.productId);return p?`${c.qty>1?`${c.qty}× `:''}${p.name.replace(/^Jersey\s+/i,'').replace(/"/g,'')}`:null;}).filter(Boolean);
  // Diseño de tienda (19/10/2026): lo que trae el kit se lee en una línea
  // ("Black Edition + Short + 2× calcetas"); las etiquetas quedan sólo para
  // el estado, que es lo que tiene que llamar la atención.
  const piezas=nombres.length?nombres.join(' + '):`${b.components.length} pieza${b.components.length===1?'':'s'}`;
  const chips=[];
  if(b.archived)chips.push('<span class="cat-chip archived">Archivado</span>');
  else if(!b.active)chips.push('<span class="cat-chip warn">Inactivo</span>');
  if(!b.componentsResolved)chips.push('<span class="cat-chip warn">Pieza sin resolver</span>');
  /* Los dos precios van UNO ENCIMA DEL OTRO, no en un solo renglon.
     Juntos —"Adulto $3,500.00 · Niño $2,350.00"— son 33 caracteres en negritas
     que a 390px no caben, y la columna del precio no encoge: se le encimaba al
     nombre del kit y a los chips. Se vio en docs/evidencias/tienda-admin.jpg.
     Arriba el de adulto, que es el precio de lista; debajo el de niño. */
  const adulto=Number(b.priceAdult||0),nino=Number(b.priceKid||0);
  const precio=adulto?money.format(adulto):(nino?money.format(nino):'—');
  const bajoPrecio=[];
  // Si el kit SOLO tiene precio de niño, el numero grande es ese y hay que
  // decirlo: un precio sin etiqueta se lee como precio de adulto.
  if(adulto&&nino)bajoPrecio.push(`Niño ${money.format(nino)}`);
  else if(!adulto&&nino)bajoPrecio.push('Sólo niño');
  btn.innerHTML=`<span class="cat-thumb">${ICONS.kit}</span><span class="cat-body"><strong class="cat-title">${esc(b.name)}</strong><span class="cat-meta">${esc(piezas)}</span>${chips.length?`<span class="cat-chips">${chips.join('')}</span>`:''}</span><span class="cat-price-col"><strong class="cat-price">${esc(precio)}</strong>${bajoPrecio.map(t=>`<small class="cat-sub">${esc(t)}</small>`).join('')}</span>`;
  if(canManage)btn.addEventListener('click',()=>openBundleDrawer(b));
  else btn.disabled=true;
  return btn;
}

function productCard(p){
  const btn=document.createElement('button');
  btn.type='button';
  btn.className='catalog-card'+(p.archived?' archived':'');
  // Diseño de tienda (19/10/2026): una línea gris con qué es y su clave, una
  // línea verde con los kits donde va, y etiquetas sólo para el estado. Antes
  // eran 4 o 5 pastillas del mismo peso y nada destacaba.
  // La categoría en español aunque esté guardada en inglés ("socks" → Calcetas).
  const canon=categoriaCanonica(p.category),etiqueta=CATEGORIAS.find(c=>c.valor===canon)?.etiqueta||(p.category?String(p.category).charAt(0).toLocaleUpperCase('es-MX')+String(p.category).slice(1):'');
  const meta=[etiqueta,p.sku||''].filter(Boolean).join(' · ');
  const chips=[];
  if(p.archived)chips.push('<span class="cat-chip archived">Archivado</span>');
  else if(!p.active)chips.push('<span class="cat-chip warn">Inactivo</span>');
  // En qué kits va: así se ve de un vistazo que el jersey suelto es el mismo.
  const kits=bundles.filter(b=>!b.archived&&kitIncluye(b,p.id)).map(b=>b.name);
  btn.innerHTML=`<span class="cat-thumb" data-foto="${esc(p.id)}">${ICONS.product}</span><span class="cat-body"><strong class="cat-title">${esc(p.name)}</strong>${meta?`<span class="cat-meta">${esc(meta)}</span>`:''}${kits.length?`<span class="cat-kits">En ${esc(kits.join(' · '))}</span>`:''}${chips.length?`<span class="cat-chips">${chips.join('')}</span>`:''}</span><span class="cat-price-col"><strong class="cat-price">${money.format(Number(p.price||0))}</strong>${Number(p.priceKid||0)>0?`<small class="cat-sub">Niño ${esc(money.format(Number(p.priceKid)))}</small>`:''}</span>`;
  if(canManage)btn.addEventListener('click',()=>openProductDrawer(p));
  else btn.disabled=true;
  return btn;
}

/* Arriba (13/10/2026): Productos | Kits con su cuenta, y un buscador. */
let ver='productos',busca='';
const coincide=t=>!busca||String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(busca);
function pintaCabecera(){
  const np=products.filter(p=>!p.archived).length,nk=bundles.filter(b=>!b.archived).length;
  if($('catNumProd'))$('catNumProd').textContent=np;if($('catNumKits'))$('catNumKits').textContent=nk;
  if($('catResumen'))$('catResumen').textContent=`${np} producto${np===1?'':'s'} · ${nk} kit${nk===1?'':'s'}`;
  document.querySelectorAll('.cat-seg [data-ver]').forEach(b=>{const on=b.dataset.ver===ver;b.classList.toggle('activo',on);b.setAttribute('aria-selected',String(on));});
  $('productsPanel')?.classList.toggle('hidden',ver!=='productos');
  $('bundlesPanel')?.classList.toggle('hidden',ver!=='kits');
  $('costosPanel')?.classList.toggle('hidden',ver!=='costos');
  $('ofertasPanel')?.classList.toggle('hidden',ver!=='ofertas');
  $('codigosPanel')?.classList.toggle('hidden',ver!=='codigos');
  $('catTabCodigos')?.classList.toggle('hidden',!canManage);
  if($('catNumCodigos'))$('catNumCodigos').textContent=codigos.codes.filter(c=>c.estado==='activo').length||'';
  if(ver==='codigos')renderCodigos();
  $('bannersPanel')?.classList.toggle('hidden',ver!=='banners');
  $('catTabBanners')?.classList.toggle('hidden',!canManage);
  if($('catNumBanners'))$('catNumBanners').textContent=vitrinaAdmin.banners.filter(b=>b.estado==='activo'&&b.kind==='banner').length||'';
  if(ver==='banners')renderBanners();
  $('catTabOfertas')?.classList.toggle('hidden',!canPromos);
  const activas=ofertas.filter(o=>o.estado==='activa').length;
  if($('catNumOfertas'))$('catNumOfertas').textContent=activas||'';
  if(ver==='ofertas')renderOfertas();
  $('catTabCostos')?.classList.toggle('hidden',!canFinance);
  // Buscar y "pendientes" son de productos y kits, no de costos.
  $('catBuscar')?.classList.toggle('hidden',ver==='costos'||ver==='ofertas'||ver==='codigos'||ver==='banners');
  $('pendientes')?.classList.toggle('hidden',ver==='costos'||ver==='ofertas'||ver==='codigos'||ver==='banners'||!$('pendientes').textContent);
}
function renderBundles(){
  pintaCabecera();
  const list=$('bundleList');list.innerHTML='';
  const rows=bundles.filter(b=>(showArchived||!b.archived)&&coincide(b.name));
  $('bundleEmpty').classList.toggle('hidden',rows.length>0);
  rows.forEach(b=>list.appendChild(bundleCard(b)));
}
function renderProducts(){
  pintaCabecera();
  const list=$('productList');list.innerHTML='';
  const rows=products.filter(p=>(showArchived||!p.archived)&&coincide(`${p.name} ${p.sku||''}`));
  $('productEmpty').classList.toggle('hidden',rows.length>0);
  rows.forEach(p=>list.appendChild(productCard(p)));
  firmaMiniaturas(rows);
}

/* La foto entra despues de pintar la lista, firmada y en lote.

   Esta pantalla es donde se sube la foto, asi que es donde hay que poder
   comprobar que quedo bien: sin esto, quien acaba de subir cuatro jerseys ve
   cuatro monitos identicos y no tiene forma de saber cual quedo en cual —ni
   siquiera si se guardo—. Las fotos SI se estaban guardando; esta lista nunca
   las leyo.

   Miniatura, nunca el original: una lista es una coleccion, y el original se
   reserva para el detalle (docs/MEDIA_EGRESS_ARCHITECTURE.md). En lote y por
   bucket, para no firmar de una en una. Un producto sin foto se queda con su
   icono y la lista sigue sirviendo. */
let miniaturaSeq=0;
async function firmaMiniaturas(rows){
  const seq=++miniaturaSeq, porBucket={};
  for(const p of rows){
    const path=p.photoThumbPath;
    if(!path)continue;
    const b=p.photoBucket||PHOTO_BUCKET;
    (porBucket[b]=porBucket[b]||[]).push({id:p.id,path,name:p.name});
  }
  for(const b of Object.keys(porBucket)){
    try{
      const mapa=await getSignedPhotoUrls(supabase,b,porBucket[b].map(x=>x.path));
      if(seq!==miniaturaSeq)return;   // se volvio a pintar: estas firmas ya no son
      for(const x of porBucket[b]){
        const url=mapa[x.path];if(!url)continue;
        const caja=document.querySelector(`[data-foto="${CSS.escape(String(x.id))}"]`);
        if(caja)caja.innerHTML=`<img src="${esc(url)}" alt="${esc(x.name||'Producto')}" loading="lazy">`;
      }
    }catch(e){/* la foto es opcional: la lista no se rompe por una firma */}
  }
}

/* ---------- Drawer: kit ---------- */
function openBundleDrawer(b){
  const pool=(b?.components||[]).find(c=>Array.isArray(c.pool));
  draft={mode:'bundle',id:b?.id||null,components:(b?.components||[]).filter(c=>!Array.isArray(c.pool)).map(c=>({productId:c.productId,qty:c.qty})),
    pool:{on:!!pool,ids:pool?pool.pool.map(String):[],qty:pool?.qty||2,name:pool?.poolName||'Jersey a elegir'}};
  drawerMsg();
  $('drawerKicker').textContent='KIT';
  $('drawerTitle').textContent=b?b.name:'Nuevo kit';
  $('bundleForm').classList.remove('hidden');
  $('productForm').classList.add('hidden');
  $('promoForm')?.classList.add('hidden');$('codeForm')?.classList.add('hidden');$('payForm')?.classList.add('hidden');
  $('bName').value=b?.name||'';
  $('bPriceAdult').value=b?.priceAdult??'';
  $('bPriceKid').value=b?.priceKid??'';
  $('bActive').checked=b?b.active:true;
  $('bArchiveToggle').classList.toggle('hidden',!b);
  $('bArchiveToggle').textContent=b?.archived?'Restaurar kit':'Archivar kit';
  // Un kit nuevo abre con la lista para agregar; uno existente, cerrada.
  $('bCatalogoFijas').classList.toggle('hidden',!!b);$('bAgregarFija').textContent=b?'+ Agregar pieza':'Listo';
  renderComponents();
  openDrawer();
}
/* Las piezas del kit (13/10/2026, "¿cómo ligo el mismo jersey? más fácil").

   Antes: un select, un número y "Agregar pieza", y el kit sólo decía los
   nombres que ya llevaba. Ahora es la lista de productos del club, uno por
   renglón: se toca para meterlo o sacarlo, y con − / + se dice cuántos. Es el
   MISMO producto que se vende suelto (no una copia), y por eso la tienda puede
   ofrecer "conviértelo en kit". */
function renderComponents(){
  const wrap=$('bComponents');
  const orden=['jersey','shorts','socks'];
  const ordena=xs=>xs.sort((a,b)=>{const ia=orden.indexOf(a.category),ib=orden.indexOf(b.category);return (ia<0?9:ia)-(ib<0?9:ib)||String(a.name).localeCompare(String(b.name),'es');});
  // Paso 2: sólo lo que el kit trae; lo demás vive tras "+ Agregar pieza".
  wrap.innerHTML=draft.components.map(c=>{
    const p=products.find(x=>x.id===c.productId);
    if(!p)return `<div class="kit-pieza en huerfana" data-pid="${esc(c.productId)}"><span class="kit-pieza-nombre"><b>Pieza que ya no existe</b><small>Quítala</small></span><button type="button" class="kit-quita" data-quita aria-label="Quitar">×</button></div>`;
    return `<div class="kit-pieza en" data-pid="${esc(p.id)}"><span class="kit-pieza-nombre"><b>${esc(p.name)}</b><small>${money.format(Number(p.price||0))} suelto</small></span>
      <span class="kit-qty"><button type="button" data-q="-1" aria-label="Uno menos">−</button><b>${c.qty}</b><button type="button" data-q="1" aria-label="Uno más">+</button></span>
      <button type="button" class="kit-quita" data-quita aria-label="Quitar ${esc(p.name)}">×</button></div>`;
  }).join('')||'<p class="muted mini-empty">Todavía nada. Toca "+ Agregar pieza".</p>';
  const enPool=new Set(draft.pool?.on?draft.pool.ids:[]);
  const libres=ordena(products.filter(p=>!p.archived&&!draft.components.some(c=>c.productId===p.id)&&!enPool.has(p.id)));
  $('bCatalogoFijas').innerHTML=libres.map(p=>`<button type="button" class="kit-elegir" data-agrega="${esc(p.id)}"><span class="kit-pieza-nombre"><b>${esc(p.name)}</b><small>${money.format(Number(p.price||0))} suelto</small></span><span class="kit-mas">+</span></button>`).join('')||'<p class="muted mini-empty">Ya están todas.</p>';
  renderPool();
  recomputeBundlePreview();
}
$('bComponents')?.addEventListener('click',e=>{
  const row=e.target.closest('[data-pid]');if(!row||!draft)return;
  const pid=row.dataset.pid,c=draft.components.find(x=>x.productId===pid);
  if(e.target.closest('[data-quita]')){draft.components=draft.components.filter(x=>x.productId!==pid);renderComponents();return;}
  const q=e.target.closest('[data-q]');
  if(q&&c){c.qty=Math.max(1,Math.min(20,c.qty+Number(q.dataset.q)));renderComponents();}
});
$('bAgregarFija')?.addEventListener('click',()=>{
  const l=$('bCatalogoFijas'),abre=l.classList.contains('hidden');
  l.classList.toggle('hidden',!abre);$('bAgregarFija').textContent=abre?'Listo':'+ Agregar pieza';
});
$('bCatalogoFijas')?.addEventListener('click',e=>{
  const b=e.target.closest('[data-agrega]');if(!b||!draft)return;
  draft.components.push({productId:b.dataset.agrega,qty:1});
  draft.pool.ids=draft.pool.ids.filter(x=>x!==b.dataset.agrega);
  renderComponents();
});
/* Paso 3: el papá escoge. Las opciones van por categoría, jerseys primero;
   una pieza fija no puede ser también a elegir (el servidor lo rechaza igual). */
const NOMBRE_CAT={jersey:'Jerseys',shorts:'Shorts',socks:'Calcetas',hoodie:'Sudaderas',pants:'Pants'};
function renderPool(){
  const box=$('bPool');if(!box||!draft?.pool)return;
  const pool=draft.pool;
  $('bPoolOn').checked=!!pool.on;
  box.classList.toggle('hidden',!pool.on);
  if(!pool.on)return;
  const fijos=new Set(draft.components.map(c=>c.productId));
  const candidatos=products.filter(p=>!p.archived&&!fijos.has(p.id));
  const grupos=new Map();
  for(const p of candidatos){const k=p.category||'otro';if(!grupos.has(k))grupos.set(k,[]);grupos.get(k).push(p);}
  const orden=[...grupos.keys()].sort((a,b)=>(b==='jersey')-(a==='jersey')||String(NOMBRE_CAT[a]||'Otros').localeCompare(NOMBRE_CAT[b]||'Otros','es'));
  const corto=n=>String(n).replace(/^Jersey\s+/i,'').replace(/"/g,'').replace(/\s+-\s+.*$/,'').replace(/\s+Edition$/i,'');
  box.innerHTML=`<div class="kit-pool-cab"><span>Escoge</span><span class="kit-qty"><button type="button" data-pool-q="-1" aria-label="Una menos">−</button><b>${pool.qty}</b><button type="button" data-pool-q="1" aria-label="Una más">+</button></span><span>de estas:</span></div>
    ${orden.map(k=>`<div class="kit-pool-grupo"><span class="kit-pool-tit">${esc(NOMBRE_CAT[k]||'Otros')}</span><div class="chips kit-pool-ops">${grupos.get(k).map(p=>{const on=pool.ids.includes(p.id);return `<button type="button" class="chip${on?' on':''}" data-pool-pid="${esc(p.id)}" aria-pressed="${on}">${on?'✓ ':''}${esc(corto(p.name))}</button>`;}).join('')}</div></div>`).join('')}
    <p class="kit-pool-nota${pool.ids.length===1?' falta':''}">${pool.ids.length>=2?`El papá escoge ${pool.qty} entre ${pool.ids.length} opciones. Puede repetir.`:pool.ids.length===1?'Marca al menos 2 opciones.':'Marca las opciones que puede escoger.'}</p>`;
}
$('bPoolOn')?.addEventListener('change',()=>{if(!draft?.pool)return;draft.pool.on=$('bPoolOn').checked;if(draft.pool.on&&!draft.pool.qty)draft.pool.qty=2;renderComponents();});
$('bPool')?.addEventListener('click',e=>{
  if(!draft?.pool)return;
  const q=e.target.closest('[data-pool-q]');
  if(q){draft.pool.qty=Math.max(1,Math.min(6,draft.pool.qty+Number(q.dataset.poolQ)));renderPool();recomputeBundlePreview();return;}
  const b=e.target.closest('[data-pool-pid]');if(!b)return;
  const id=b.dataset.poolPid,i=draft.pool.ids.indexOf(id);
  if(i>=0)draft.pool.ids.splice(i,1);else draft.pool.ids.push(id);
  renderComponents();
});
/* La tarjeta de arriba: el kit dicho en una frase, como lo va a ver la familia. */
function pintaVistaKit(){
  const v=$('bVista');if(!v||!draft)return;
  const nombre=$('bName').value.trim()||'Tu kit';
  const corto=n=>String(n).replace(/^Jersey\s+/i,'').replace(/"/g,'').replace(/\s+-\s+.*$/,'');
  const fijas=draft.components.map(c=>{const p=products.find(x=>x.id===c.productId);return p?`${c.qty>1?`${c.qty} `:''}${corto(p.name)}`:null;}).filter(Boolean);
  const pool=draft.pool?.on&&draft.pool.ids.length>=2?draft.pool:null;
  const catPool=pool?(()=>{const cs=[...new Set(pool.ids.map(id=>products.find(p=>p.id===id)?.category))];return cs.length===1&&cs[0]==='jersey'?(pool.qty===1?'jersey':'jerseys'):(pool.qty===1?'pieza':'piezas');})():'';
  const partes=[...fijas,...(pool?[`${pool.qty} ${catPool} a elegir`]:[])];
  const pa=Number($('bPriceAdult').value||0),pk=Number($('bPriceKid').value||0);
  const opciones=pool?pool.ids.map(id=>products.find(p=>p.id===id)).filter(Boolean).map(p=>corto(p.name)):[];
  v.innerHTML=`<span class="kit-vista-tag">Así se ve en la tienda</span><strong>${esc(nombre)}</strong>
    <p class="kit-vista-frase">${partes.length?partes.map(esc).join(' <i>+</i> '):'Agrega las piezas abajo'}</p>
    ${opciones.length?`<p class="kit-vista-ops">A elegir: ${esc(opciones.join(', '))}</p>`:''}
    <p class="kit-vista-precio">${pa?`Adulto <b>${esc(money.format(pa))}</b>`:''}${pa&&pk?' · ':''}${pk?`Niño <b>${esc(money.format(pk))}</b>`:''}${!pa&&!pk?'Sin precio todavía':''}</p>`;
}
['bName','bPriceAdult','bPriceKid'].forEach(id=>$(id)?.addEventListener('input',pintaVistaKit));
const componentesDelDraft=()=>[...draft.components.map(c=>({productId:c.productId,qty:c.qty})),
  ...(draft.pool?.on&&draft.pool.ids.length>=2?[{pool:draft.pool.ids,qty:draft.pool.qty,name:draft.pool.name}]:[])];
function recomputeBundlePreview(){
  // Por separado vs. en kit: es lo que convence en el mostrador.
  pintaVistaKit();
  const opcion=Math.max(0,...(draft.pool?.on?draft.pool.ids:[]).map(id=>Number(products.find(x=>x.id===id)?.price||0)));
  const enPool=draft.pool?.on&&draft.pool.ids.length>=2?draft.pool.qty:0;
  const sueltos=draft.components.reduce((n,c)=>{const p=products.find(x=>x.id===c.productId);return n+(p?Number(p.price||0)*c.qty:0);},0)+opcion*enPool;
  const pa=Number($('bPriceAdult').value||0),res=$('bResumen');
  if(res){res.classList.toggle('hidden',!draft.components.length&&!enPool);
    const piezas=draft.components.reduce((n,c)=>n+c.qty,0)+enPool;
    res.innerHTML=draft.components.length||enPool?`<b>${piezas} pieza${piezas===1?'':'s'}</b> · por separado ${money.format(sueltos)}${pa>0&&sueltos>pa?` · <em>en kit se ahorran ${enPool?'hasta ':''}${money.format(sueltos-pa)}</em>`:''}`:'';}
  let cost=0,complete=true;
  draft.components.forEach(c=>{
    const p=products.find(x=>x.id===c.productId);
    if(!p||p.cost==null)complete=false;else cost+=Number(p.cost)*c.qty;
  });
  // Tres renglones diciendo "—" son tres renglones que no dicen nada. La caja
  // entera aparece cuando el costo de todas las piezas esta capturado; si
  // falta uno, en su lugar va una frase que SI acciona.
  const priceAdult=Number($('bPriceAdult').value||0),priceKid=Number($('bPriceKid').value||0);
  // Costo y margen viven en la pestaña Costos (13/10/2026): aquí nunca.
  const puede=false;
  $('bMargenCaja')?.classList.toggle('hidden',!puede);
  const aviso=$('bSinCosto');
  if(aviso){
    const falta=false;
    aviso.classList.toggle('hidden',!falta);
    if(falta)aviso.textContent='Falta el costo de alguna pieza, por eso no se puede calcular el margen.';
  }
  if(!puede)return;
  $('bCostPreview').textContent=money.format(cost);
  $('bMarginAdultPreview').textContent=priceAdult>0?pct((priceAdult-cost)/priceAdult*100):'—';
  $('bMarginKidPreview').textContent=priceKid>0?pct((priceKid-cost)/priceKid*100):'—';
}
['bPriceAdult','bPriceKid'].forEach(id=>$(id)?.addEventListener('input',recomputeBundlePreview));
async function saveBundle(){
  const name=$('bName').value.trim();
  if(name.length<2){drawerMsg('El nombre del kit es obligatorio.');return;}
  const priceAdult=Number($('bPriceAdult').value||0),priceKid=Number($('bPriceKid').value||0);
  if(priceAdult<=0&&priceKid<=0){drawerMsg('Captura al menos un precio (adulto o niño).');return;}
  if(draft.pool?.on&&draft.pool.ids.length<2){drawerMsg('En "El papá escoge" marca al menos 2 opciones, o apágalo.');return;}
  if(!componentesDelDraft().length){drawerMsg('El kit necesita al menos una pieza.');return;}
  const current=draft.id?bundles.find(b=>b.id===draft.id):null;
  const btn=$('bSave');btn.disabled=true;
  try{
    await rpc('v2_upsert_bundle',{
      organization_id:ctx.organization_id,
      id:draft.id,
      name,
      description:current?.description??null,   // ya no se edita aqui: se conserva
      price_adult:priceAdult||null,
      price_kid:priceKid||null,
      components:componentesDelDraft(),
      active:$('bActive').checked,
      valid_until:current?.validUntil??null,    // idem
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

/* ---------- Fotos (mismo patrón que Utilería y Jugadores) ---------- */
const PHOTO_BUCKET='tanneros-private';
/* La carpeta NO es decoracion: es el permiso.

   El candado del bucket no mira quien sube, mira DONDE. La politica de INSERT
   de tanneros-private llama a private.storage_module_code(name), que toma el
   tercer segmento de la ruta y lo traduce a un modulo del club:

     organizations/<org>/<CARPETA>/...  ->  players, equipment, commerce, ...

   Una carpeta que no esta en esa lista devuelve null, y la politica exige que
   no lo sea. Este archivo subia a .../products/... —que no es un modulo— asi
   que Storage rechazaba TODAS las fotos de producto, siempre, desde el primer
   dia: 0 de 89 productos tenian foto guardada. El catalogo es comercio.

   Si algun dia se agrega una carpeta nueva aqui, tiene que existir tambien en
   private.storage_module_code o las fotos se pierden en silencio. La regla de
   scripts/qa-static.mjs vigila exactamente eso. */
const CARPETA_MODULO='commerce';
/* Varias fotos (14/10/2026): "que los productos pudieran tener una o más
   fotos". La tira guarda el orden; la primera es la portada. Una foto ya
   guardada trae su ruta; una nueva trae el archivo y se sube al guardar. */
const MAX_FOTOS=8;
let fotosEdit=[],fotosTocadas=false,photoSeq=0;
function loadImageFile(file){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file),img=new Image();
    img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('No pudimos leer esa foto. Prueba con JPG, PNG o WebP.'));};
    img.src=url;
  });
}
async function preparePhotoFile(file){
  if(!file)throw new Error('Selecciona una foto.');
  if(file.type&&!String(file.type).startsWith('image/'))throw new Error('Selecciona una imagen válida.');
  const img=await loadImageFile(file);
  if(!(img.naturalWidth||img.width))throw new Error('No pudimos leer el tamaño de esa foto.');
  return {full:await encodeVariant(img,FULL_MAX_SIDE,0.82,FULL_MAX_BYTES),thumb:await encodeVariant(img,THUMB_MAX_SIDE,0.75,THUMB_MAX_BYTES)};
}
// Si una de las dos subidas falla se borran las dos: media foto en el bucket es
// basura que nadie vuelve a mirar.
async function uploadPhoto(prefix,file){
  const prepared=await preparePhotoFile(file),stamp=Date.now();
  const path=`${prefix}-${stamp}.${prepared.full.ext}`,thumbPath=`${prefix}-${stamp}-thumb.${prepared.thumb.ext}`;
  const [{error:e1},{error:e2}]=await Promise.all([
    supabase.storage.from(PHOTO_BUCKET).upload(path,prepared.full.blob,{contentType:prepared.full.mime,cacheControl: UPLOAD_CACHE_CONTROL,upsert:false}),
    supabase.storage.from(PHOTO_BUCKET).upload(thumbPath,prepared.thumb.blob,{contentType:prepared.thumb.mime,cacheControl: UPLOAD_CACHE_CONTROL,upsert:false})
  ]);
  if(e1||e2){
    await Promise.all([
      supabase.storage.from(PHOTO_BUCKET).remove([path]).catch(()=>{}),
      supabase.storage.from(PHOTO_BUCKET).remove([thumbPath]).catch(()=>{})
    ]);
    throw e1||e2;
  }
  return {path,thumbPath};
}
function pintaFotos(){
  const tira=$('pFotos');if(!tira)return;
  const alt=$('pName')?.value||'Producto';
  tira.innerHTML=fotosEdit.map((f,i)=>`<div class="foto-item${i===0?' portada':''}">
      <button type="button" class="foto-ver" data-portada="${i}" aria-label="${i===0?'Portada':'Poner de portada'}">${f.url?`<img src="${esc(f.url)}" alt="${esc(alt)}">`:'<span class="foto-cargando"></span>'}</button>
      ${i===0?'<span class="foto-tag">Portada</span>':''}
      <button type="button" class="foto-quita" data-quita="${i}" aria-label="Quitar foto">&times;</button></div>`).join('')
    +(fotosEdit.length<MAX_FOTOS?`<label class="foto-agregar" for="pPhotoInput"><span aria-hidden="true">+</span><small>${fotosEdit.length?'Agregar':'Agregar foto'}</small></label>`:'');
  const c=$('pFotosCuenta');if(c)c.textContent=fotosEdit.length?`${fotosEdit.length} de ${MAX_FOTOS}`:'';
}
function fotosDelProducto(p){
  const lista=Array.isArray(p?.photos)&&p.photos.length?p.photos:(p?.photoPath?[{path:p.photoPath,thumbPath:p.photoThumbPath||p.photoPath}]:[]);
  return lista.filter(f=>f?.path).map(f=>({path:f.path,thumbPath:f.thumbPath||f.path,url:''}));
}
async function pintaFotoGuardada(p){
  // El drawer firma miniaturas (la tira mide 76px), en lote y por el caché
  // compartido (docs/MEDIA_EGRESS_ARCHITECTURE.md).
  const seq=++photoSeq;
  fotosEdit=fotosDelProducto(p);fotosTocadas=false;pintaFotos();
  if(!fotosEdit.length)return;
  try{
    const mapa=await getSignedPhotoUrls(supabase,p.photoBucket||PHOTO_BUCKET,fotosEdit.map(f=>f.thumbPath));
    if(seq!==photoSeq)return;
    fotosEdit.forEach(f=>{if(!f.file)f.url=mapa?.[f.thumbPath]||'';});
    pintaFotos();
  }catch(e){/* la foto es opcional: no rompe el drawer */}
}
$('pPhotoInput')?.addEventListener('change',async e=>{
  const files=[...(e.target.files||[])];e.target.value='';
  if(!files.length)return;
  const lugar=MAX_FOTOS-fotosEdit.length;
  for(const file of files.slice(0,lugar)){
    try{
      await preparePhotoFile(file);           // valida antes de prometerle nada al usuario
      fotosEdit.push({file,url:URL.createObjectURL(file)});fotosTocadas=true;
    }catch(err){drawerMsg(err.message||'No pudimos usar esa foto.');return;}
  }
  pintaFotos();
  drawerMsg(files.length>lugar?`Caben ${MAX_FOTOS} fotos por producto: entraron ${lugar}.`:'Las fotos se suben al guardar el producto.','success');
});
$('pFotos')?.addEventListener('click',e=>{
  const q=e.target.closest('[data-quita]');
  if(q){fotosEdit.splice(Number(q.dataset.quita),1);fotosTocadas=true;pintaFotos();drawerMsg('La foto se quita al guardar el producto.','success');return;}
  const v=e.target.closest('[data-portada]');
  if(v&&Number(v.dataset.portada)>0){const [f]=fotosEdit.splice(Number(v.dataset.portada),1);fotosEdit.unshift(f);fotosTocadas=true;pintaFotos();drawerMsg('Lista la nueva portada. Se guarda con el producto.','success');}
});
// Sube las nuevas (en orden) y devuelve la lista final para el servidor.
async function subeFotos(prodId){
  const lista=[];
  for(const f of fotosEdit){
    if(f.file){
      const subida=await uploadPhoto(`organizations/${ctx.organization_id}/${CARPETA_MODULO}/products/${prodId}/foto`,f.file);
      Object.assign(f,{path:subida.path,thumbPath:subida.thumbPath,file:null});
    }
    lista.push({path:f.path,thumbPath:f.thumbPath});
  }
  return lista;
}


/* ---- Lo que se toca en vez de teclearse ----

   Dos campos del formulario eran texto libre, y los dos producian basura que
   sale cara mas adelante:

     La CATEGORIA la lee la hoja de produccion para saber si una pieza es
     playera, short o calcetas, y con eso decide en que columna cae su talla.
     Escrita a mano acabaron conviviendo cinco formas para ocho productos.

     Las TALLAS eran doce valores tecleados con coma. Es el campo mas tedioso
     de la pantalla y el que hizo que en los pedidos reales convivieran "12",
     "Mediana" y "Universal" para decir cosas parecidas.

   Los dos siguen aceptando algo fuera de catalogo —un producto raro no puede
   quedar sin poder capturarse— pero el camino normal es un toque. */
let catElegida=null, tallasElegidas=[];

function pintaCategoria(){
  const cont=$('pCatChips');if(!cont)return;
  cont.innerHTML=CATEGORIAS.map(c=>
    `<button type="button" class="chip${catElegida===c.valor?' on':''}" data-cat="${esc(c.valor)}">${esc(c.etiqueta)}</button>`).join('')
    +`<button type="button" class="chip${catElegida==='__otro'?' on':''}" data-cat="__otro">Otro</button>`;
  $('pCategory').classList.toggle('hidden',catElegida!=='__otro');
}
// Las tallas se prenden solas según lo que es, mientras no se hayan tocado:
// un jersey o un short lleva la escala del club; las calcetas, talla única.
let tallasAuto=true;
const TALLAS_DE={jersey:'club',shorts:'club',outerwear:'club',pants:'club',socks:'unica'};
$('pCatChips')?.addEventListener('click',e=>{
  const b=e.target.closest('[data-cat]');if(!b)return;
  catElegida=b.dataset.cat;
  if(tallasAuto&&TALLAS_DE[catElegida]){tallasElegidas=TALLAS_DE[catElegida]==='unica'?[TALLA_UNICA]:[...ESCALA_CLUB];pintaTallas();}
  if(catElegida==='__otro')setTimeout(()=>$('pCategory').focus(),0);
  pintaCategoria();
  if(!persTocado&&$('pPers')?.dataset.fijo==='')$('pPers').checked=persAuto();
});
function categoriaDelFormulario(){
  if(catElegida==='__otro')return $('pCategory').value.trim()||null;
  return catElegida||null;
}

function pintaTallas(){
  const cont=$('pSizeChips');if(!cont)return;
  cont.innerHTML=[...ESCALA_CLUB,TALLA_UNICA].map(t=>
    `<button type="button" class="chip${tallasElegidas.includes(t)?' on':''}" data-talla="${esc(t)}">${esc(t)}</button>`).join('');
  const n=tallasElegidas.length;
  $('pSizesCount').textContent=n?`· ${n}`:'· ninguna';
}
$('pSizeChips')?.addEventListener('click',e=>{
  const b=e.target.closest('[data-talla]');if(!b)return;
  const t=b.dataset.talla;
  // Universal es excluyente: un producto de talla unica no tiene doce tallas.
  if(t===TALLA_UNICA)tallasElegidas=tallasElegidas.includes(t)?[]:[TALLA_UNICA];
  else tallasElegidas=ordenaTallas(
    tallasElegidas.filter(x=>x!==TALLA_UNICA).includes(t)
      ? tallasElegidas.filter(x=>x!==t)
      : [...tallasElegidas.filter(x=>x!==TALLA_UNICA),t]);
  pintaTallas();
});
// Capturar doce tallas a mano, producto por producto, es donde se abandona.
document.querySelectorAll('[data-escala]').forEach(b=>b.addEventListener('click',()=>{
  const cual=b.dataset.escala;tallasAuto=false;
  tallasElegidas = cual==='club'?[...ESCALA_CLUB]
    : cual==='ninos'?[...ESCALA_NINOS]
    : cual==='adultos'?[...ESCALA_ADULTOS]
    : cual==='unica'?[TALLA_UNICA] : [];
  pintaTallas();
}));

/* ---------- En qué kits va el producto ----------
   Ligar desde la pieza, no sólo desde el kit: "voy a agregar un producto y que
   lo pueda ligar a que sea ya un kit". Un toque mete o saca la pieza del kit y
   se guarda al momento; el kit conserva todo lo demás. */
function pintaKitsDelProducto(p){
  const box=$('pKits'),campo=$('pKitsCampo');if(!box||!campo)return;
  const kits=bundles.filter(b=>!b.archived);
  campo.classList.toggle('hidden',!p||!kits.length);
  if(!p)return;
  box.innerHTML=kits.map(b=>{const en=kitIncluye(b,p.id);
    return `<button type="button" class="chip${en?' on':''}" data-kit-liga="${esc(b.id)}" aria-pressed="${en}">${en?'✓ ':''}${esc(b.name)}</button>`;}).join('');
}
$('pKits')?.addEventListener('click',async e=>{
  const btn=e.target.closest('[data-kit-liga]');if(!btn||!draft?.id)return;
  const b=bundles.find(x=>x.id===btn.dataset.kitLiga),pid=draft.id;if(!b)return;
  const en=kitIncluye(b,pid);
  // En un kit con piezas a elegir, sacar una opción la quita de la lista.
  const piezas=en?(b.components||[]).map(c=>Array.isArray(c.pool)?{...c,pool:c.pool.filter(x=>x!==pid)}:c).filter(c=>Array.isArray(c.pool)?true:c.productId!==pid)
    :[...(b.components||[]),{productId:pid,qty:1}];
  if(piezas.some(c=>Array.isArray(c.pool)&&c.pool.length<2)){drawerMsg('Las piezas a elegir necesitan al menos 2 opciones: abre el kit para cambiarlas.');return;}
  if(!piezas.length){drawerMsg('Un kit necesita al menos una pieza: agrega otra antes de sacar ésta.');return;}
  btn.disabled=true;
  try{
    await rpc('v2_upsert_bundle',{organization_id:ctx.organization_id,id:b.id,name:b.name,description:b.description??null,
      price_adult:b.priceAdult||null,price_kid:b.priceKid||null,components:piezas.map(piezaAEnviar),
      active:!!b.active,valid_until:b.validUntil??null,notes:b.notes??null});
    b.components=piezas;pintaKitsDelProducto(products.find(x=>x.id===pid));renderBundles();renderProducts();
    drawerMsg(en?`Se sacó de ${b.name}.`:`Ahora va en ${b.name}.`,'success');
  }catch(err){btn.disabled=false;drawerMsg(err.message||'No se pudo actualizar el kit.');}
});

/* ---------- Drawer: producto ---------- */
function openProductDrawer(p){
  draft={mode:'product',id:p?.id||null,components:[]};
  drawerMsg();
  $('drawerKicker').textContent='PRODUCTO';
  $('drawerTitle').textContent=p?p.name:'Nuevo producto';
  $('productForm').classList.remove('hidden');
  $('bundleForm').classList.add('hidden');
  $('promoForm')?.classList.add('hidden');$('codeForm')?.classList.add('hidden');$('payForm')?.classList.add('hidden');
  $('pPonerOferta')?.classList.toggle('hidden',!p||!canPromos);
  $('pName').value=p?.name||'';
  if($('pDesc'))$('pDesc').value=p?.description||'';
  $('pSku').value=p?.sku||'';
  $('pPrice').value=p?.price??'';
  $('pKid').checked=Number(p?.priceKid||0)>0;$('pPriceKid').value=p?.priceKid??'';pintaPrecioNino();
  $('pCost').value=p?.cost??'';
  // Una categoria vieja se traduce a su boton en vez de mandarla a "Otro": si
  // no, abrir un producto migrado parece que no tuviera categoria.
  const canon=categoriaCanonica(p?.category);
  catElegida=canon||(p?.category?'__otro':null);
  $('pCategory').value=canon?'':(p?.category||'');
  tallasElegidas=ordenaTallas(Array.isArray(p?.sizes)?p.sizes.map(x=>String(x).trim()).filter(Boolean):[]);
  tallasAuto=!tallasElegidas.length;
  pintaCategoria();pintaTallas();
  $('pActive').checked=p?p.active:true;
  persTocado=false;pintaPers(p);
  $('pArchiveToggle').classList.toggle('hidden',!p);
  $('pArchiveToggle').textContent=p?.archived?'Restaurar producto':'Archivar producto';
  pintaFotoGuardada(p);
  pintaKitsDelProducto(p);
  recomputeProductPreview();
  openDrawer();
}
/* "Lleva nombre y número": mientras nadie lo toque, sigue al nombre y la
   categoría (un jersey sí, unas calcetas no); en cuanto Presidencia lo toca,
   manda su decisión y se guarda en el producto. */
let persTocado=false;
function persAuto(){return aceptaPersonalizacion({category:categoriaDelFormulario()||'',name:$('pName').value});}
function pintaPers(p){
  const fijo=typeof p?.personalizable==='boolean'?p.personalizable:null;
  $('pPers').checked=fijo??persAuto();
  $('pPers').dataset.fijo=fijo==null?'':String(fijo);
}
$('pPers')?.addEventListener('change',()=>{persTocado=true;});
$('pName')?.addEventListener('input',()=>{if(!persTocado&&$('pPers').dataset.fijo==='')$('pPers').checked=persAuto();});
/* El margen en "—" es un renglon que ocupa lugar para decir que no sabe. Se
   muestra cuando puede decir un numero, y si no, no esta. */
function recomputeProductPreview(){
  const price=Number($('pPrice').value||0),cost=$('pCost').value===''?null:Number($('pCost').value);
  const puede=false; // el margen se ve en la pestaña Costos
  $('pMargenCaja')?.classList.toggle('hidden',!puede);
  if(puede)$('pMarginPreview').textContent=pct((price-cost)/price*100);
}
['pPrice','pCost'].forEach(id=>$(id)?.addEventListener('input',recomputeProductPreview));
/* Precio de niño (14/10/2026): la casilla enseña el segundo precio y el
   primero pasa a decir "Precio adulto". */
function pintaPrecioNino(){
  const on=$('pKid')?.checked;
  $('pPriceKidCampo')?.classList.toggle('hidden',!on);
  const t=$('pPriceTit');if(t)t.textContent=on?'Precio adulto':'Precio de venta';
}
$('pKid')?.addEventListener('change',()=>{pintaPrecioNino();if($('pKid').checked)$('pPriceKid').focus();});
$('recargoManga')?.addEventListener('change',async e=>{
  const monto=Math.max(0,Math.round(Number(e.target.value||0)));
  try{await rpc('v2_set_recargo_manga',{organization_id:ctx.organization_id,monto});e.target.value=monto||'';e.target.closest('.recargo-manga').classList.add('guardado');setTimeout(()=>e.target.closest('.recargo-manga')?.classList.remove('guardado'),1500);}
  catch(err){alert(err.message||'No se pudo guardar el cargo.');}
});
/* Nombre y número (h45): el interruptor cobra o regala; el monto se queda
   guardado aunque esté apagado, para volver a prenderlo igual. */
function pintaCargoPers(p){
  if(p)cargoPers={activo:!!p.activo,monto:Number(p.monto||0)};
  $('recargoPersCaja')?.classList.toggle('hidden',!canManage);
  $('recargoPersCaja')?.classList.toggle('apagado',!cargoPers.activo);
  if($('cobraPers'))$('cobraPers').checked=cargoPers.activo;
  if($('cobraPersTxt'))$('cobraPersTxt').textContent=cargoPers.activo?'Se cobra':'Gratis';
  if($('recargoPers')&&document.activeElement!==$('recargoPers'))$('recargoPers').value=cargoPers.monto||'';
  if($('recargoPersNota'))$('recargoPersNota').textContent=cargoPers.activo
    ?'Se suma a cada jersey que lleva nombre o número, suelto o en kit.'
    :'Apagado: el nombre y número no cuesta. Préndelo para cobrarlo.';
}
async function guardaPers(cambio){
  const antes={...cargoPers};
  cargoPers={...cargoPers,...cambio};pintaCargoPers();
  try{
    const r=await rpc('v2_set_recargo_personalizacion',{organization_id:ctx.organization_id,activo:cargoPers.activo,monto:cargoPers.monto});
    pintaCargoPers(r);
    $('recargoPersCaja').classList.add('guardado');setTimeout(()=>$('recargoPersCaja')?.classList.remove('guardado'),1500);
  }catch(err){cargoPers=antes;pintaCargoPers();alert(err.message||'No se pudo guardar el cargo.');}
}
$('cobraPers')?.addEventListener('change',e=>{
  if(e.target.checked&&!(cargoPers.monto>0)){e.target.checked=false;alert('Primero escribe cuánto cuesta.');$('recargoPers')?.focus();return;}
  guardaPers({activo:e.target.checked});
});
$('recargoPers')?.addEventListener('change',e=>guardaPers({monto:Math.max(0,Math.min(5000,Math.round(Number(e.target.value||0))))}));
async function saveProduct(){
  const name=$('pName').value.trim();
  if(name.length<2){drawerMsg('El nombre del producto es obligatorio.');return;}
  const price=$('pPrice').value===''?null:Number($('pPrice').value);
  if(price==null||price<0){drawerMsg('El precio debe ser mayor o igual a 0.');return;}
  const cost=$('pCost').value===''?null:Number($('pCost').value);
  if(cost!=null&&cost<0){drawerMsg('El costo no puede ser negativo.');return;}
  const priceKid=$('pKid').checked?Number($('pPriceKid').value||0):null;
  if($('pKid').checked&&!(priceKid>0)){drawerMsg('Escribe el precio de niño, o apaga la casilla.');$('pPriceKid').focus();return;}
  const sizes=[...tallasElegidas];
  const current=draft.id?products.find(x=>x.id===draft.id):null;
  const btn=$('pSave');btn.disabled=true;
  let guardado=false;
  try{
    await rpc('v2_upsert_product',{
      organization_id:ctx.organization_id,
      id:draft.id,
      name,
      sku:$('pSku').value.trim()||null,
      category:categoriaDelFormulario(),
      price,
      cost,
      sizes,
      active:$('pActive').checked,
      description:$('pDesc')?($('pDesc').value.trim()||null):(current?.description??null),
      lead_days:current?.leadDays??null
    });
    // La foto va despues del upsert: un producto nuevo no tiene id hasta aqui.
    // De aqui en adelante el producto YA esta guardado, asi que lo que falle
    // no puede decir "no se pudo guardar el producto": seria mentira, y quien
    // la lea va a volver a teclear un precio que ya estaba bien.
    guardado=true;
    const antesNino=current?(Number(current.priceKid||0)||null):null;
    if(priceKid!==antesNino){
      await load();
      const prodK=draft.id?products.find(x=>x.id===draft.id):products.find(x=>x.name===name);
      if(prodK)await rpc('v2_set_product_price_kid',{organization_id:ctx.organization_id,product_id:prodK.id,price_kid:priceKid});
    }
    if(persTocado){
      await load();
      const prodP=draft.id?products.find(x=>x.id===draft.id):products.find(x=>x.name===name);
      if(prodP)await rpc('v2_set_product_personalizable',{organization_id:ctx.organization_id,product_id:prodP.id,value:$('pPers').checked});
    }
    if(fotosTocadas){
      await load();
      const prod=draft.id?products.find(x=>x.id===draft.id):products.find(x=>x.name===name);
      // Sin producto reencontrado la foto se perdia en silencio y el papa veia
      // la tienda sin imagen sin que nadie le hubiera dicho nada.
      if(!prod)throw new Error('No pudimos ligarle las fotos. Abre el producto otra vez y vuelve a elegirlas.');
      const antes=fotosDelProducto(prod);
      const lista=await subeFotos(prod.id);
      await rpc('v2_set_product_photos',{organization_id:ctx.organization_id,product_id:prod.id,photos:lista});
      // Lo que se quitó se borra del bucket: una foto que nadie ve es basura.
      const quedan=new Set(lista.flatMap(f=>[f.path,f.thumbPath]));
      const fuera=antes.flatMap(f=>[f.path,f.thumbPath]).filter(r=>r&&!quedan.has(r));
      if(fuera.length)supabase.storage.from(PHOTO_BUCKET).remove(fuera).catch(()=>{});
    }
    await load();
    closeDrawerFn();
  }catch(e){
    const detalle=e?.message||'';
    drawerMsg(guardado
      ? `Los datos del producto SI se guardaron. Las fotos no: ${detalle||'Storage las rechazo.'}`
      : (detalle||'No se pudo guardar el producto.'));
    if(guardado)await load();   // que la lista muestre lo que si quedo
  }
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
function openDrawer(){if(draft?.mode!=='banner')$('bannerForm')?.classList.add('hidden');$('backdrop').classList.remove('hidden');$('drawer').classList.remove('hidden');}
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
document.querySelector('.cat-seg')?.addEventListener('click',e=>{const b=e.target.closest('[data-ver]');if(!b)return;if(b.dataset.ver==='costos'&&!canFinance)return;ver=b.dataset.ver;pintaCabecera();if(ver==='costos')renderCostos();});

/* ---------- Ofertas (13/10/2026) ----------
   "Que sea bien fácil ponerles promociones." ¿A qué? ¿Cómo? ¿Hasta cuándo?
   y listo: la base cobra la oferta en todos lados y al vencer se va sola. */
const ETQ_ESTADO={activa:'Activa',programada:'Programada',vencida:'Vencida',terminada:'Terminada'};
function textoValor(o){return o.kind==='porcentaje'?`−${Number(o.value)}%`:money.format(Number(o.value))+(o.valueKid?` · niño ${money.format(Number(o.valueKid))}`:'');}
function renderOfertas(){
  const box=$('ofertasLista');if(!box)return;
  box.innerHTML=ofertas.map(o=>`<article class="oferta ${o.estado}"><div class="oferta-main"><strong>${esc(o.name)}</strong><span>${esc(o.targetName||'')}</span>
      <small>${esc(ETQ_ESTADO[o.estado]||o.estado)}${o.estado==='activa'||o.estado==='programada'?` · ${esc(textoHasta(o.endsOn))}`:''}</small></div>
      <b class="oferta-valor">${esc(textoValor(o))}</b>
      ${o.estado==='activa'||o.estado==='programada'?`<button type="button" class="oferta-fin" data-termina="${esc(o.id)}">Terminar</button>`:''}</article>`).join('')
    ||'<div class="ofertas-vacio"><b>Sin ofertas</b>Toca "+ Oferta": eliges qué, cuánto y hasta cuándo.</div>';
}
const hoyMx=()=>new Date(new Date().toLocaleString('en-US',{timeZone:'America/Mexico_City'}));
const ymd=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function fechaDe(clave){
  const d=hoyMx();
  if(clave==='domingo'){d.setDate(d.getDate()+((7-d.getDay())%7));return ymd(d);}
  if(clave==='mes')return ymd(new Date(d.getFullYear(),d.getMonth()+1,0));
  if(clave==='otra')return $('ofFecha').value||'';
  d.setDate(d.getDate()+7);return ymd(d);
}
const elegido=id=>$(id)?.querySelector('.chip.on');
function marcaChip(id,b){$(id).querySelectorAll('.chip').forEach(x=>x.classList.toggle('on',x===b));}
function pintaCual(){
  const que=elegido('ofQue')?.dataset.que,sel=$('ofCual');
  const op=que==='product'?products.filter(p=>!p.archived).map(p=>[p.id,`${p.name} · ${money.format(Number(p.price||0))}`])
    :que==='bundle'?bundles.filter(b=>!b.archived).map(b=>[b.id,`${b.name} · ${money.format(Number(b.priceAdult||0))}`])
    :que==='category'?CATEGORIAS.filter(c=>products.some(p=>!p.archived&&categoriaCanonica(p.category)===c.valor)).map(c=>[c.valor,c.etiqueta]):[];
  sel.classList.toggle('hidden',que==='todo');
  sel.innerHTML=op.map(([v,t])=>`<option value="${esc(v)}">${esc(t)}</option>`).join('');
  if(draft?.preId){sel.value=draft.preId;draft.preId=null;}
  // Para toda la tienda sólo hay porcentaje.
  const precioBtn=$('ofComo').querySelector('[data-como="precio"]');
  precioBtn.disabled=que==='todo';
  if(que==='todo')marcaChip('ofComo',$('ofComo').querySelector('[data-como="porcentaje"]'));
  pintaVista();
}
function pintaVista(){
  const que=elegido('ofQue')?.dataset.que,como=elegido('ofComo')?.dataset.como,v=Number($('ofValor').value||0),id=$('ofCual').value;
  $('ofValorTit').textContent=como==='porcentaje'?'Descuento (%)':que==='bundle'?'Precio adulto de oferta':'Precio de oferta';
  $('ofNinoCampo').classList.toggle('hidden',!(que==='bundle'&&como==='precio'));
  $('ofFecha').classList.toggle('hidden',elegido('ofHasta')?.dataset.hasta!=='otra');
  let base=null,nombre='';
  if(que==='product'){const p=products.find(x=>x.id===id);base=Number(p?.price||0);nombre=p?.name||'';}
  if(que==='bundle'){const b=bundles.find(x=>x.id===id);base=Number(b?.priceAdult||0);nombre=b?.name||'';}
  const nuevo=base&&v>0?(como==='porcentaje'?base*(1-v/100):v):null;
  const hasta=fechaDe(elegido('ofHasta')?.dataset.hasta);
  $('ofVista').innerHTML=nuevo!=null?`${esc(nombre)}: <s>${money.format(base)}</s> → <b>${money.format(nuevo)}</b>${hasta?` · ${esc(textoHasta(hasta))}`:''}`
    :(v>0&&como==='porcentaje'?`−${v}% en ${que==='todo'?'toda la tienda':'la categoría'}${hasta?` · ${esc(textoHasta(hasta))}`:''}`:'');
}
function abreOferta(pre={}){
  draft={mode:'promo',preId:pre.id||null};
  drawerMsg();
  $('drawerKicker').textContent='OFERTA';$('drawerTitle').textContent='Nueva oferta';
  $('bundleForm').classList.add('hidden');$('productForm').classList.add('hidden');$('codeForm').classList.add('hidden');$('payForm').classList.add('hidden');$('promoForm').classList.remove('hidden');
  marcaChip('ofQue',$('ofQue').querySelector(`[data-que="${pre.que||'product'}"]`));
  marcaChip('ofComo',$('ofComo').querySelector('[data-como="precio"]'));
  marcaChip('ofHasta',$('ofHasta').querySelector('[data-hasta="7"]'));
  $('ofValor').value='';$('ofNino').value='';$('ofNombre').value='';$('ofFecha').value='';
  pintaCual();openDrawer();
}
['ofQue','ofComo','ofHasta'].forEach(id=>$(id)?.addEventListener('click',e=>{const b=e.target.closest('.chip');if(!b||b.disabled)return;marcaChip(id,b);id==='ofQue'?pintaCual():pintaVista();}));
['ofCual','ofValor','ofFecha'].forEach(id=>$(id)?.addEventListener('input',pintaVista));
$('ofCual')?.addEventListener('change',pintaVista);
$('nuevaOferta')?.addEventListener('click',()=>abreOferta());
$('pPonerOferta')?.addEventListener('click',()=>{const id=draft?.id;if(id)abreOferta({que:'product',id});});
$('ofGuardar')?.addEventListener('click',async()=>{
  const que=elegido('ofQue')?.dataset.que,como=elegido('ofComo')?.dataset.como,valor=Number($('ofValor').value||0),hasta=fechaDe(elegido('ofHasta')?.dataset.hasta);
  if(!(valor>0)){drawerMsg(como==='porcentaje'?'Escribe el % de descuento.':'Escribe el precio de oferta.');return;}
  if(como==='porcentaje'&&valor>=100){drawerMsg('El descuento va de 1 a 99%.');return;}
  if(!hasta){drawerMsg('Elige hasta cuándo.');return;}
  const id=$('ofCual').value;
  if(que==='product'){const p=products.find(x=>x.id===id);if(como==='precio'&&p&&valor>=Number(p.price)){drawerMsg('El precio de oferta tiene que ser menor que el normal.');return;}}
  const cual=que==='todo'?'Toda la tienda':$('ofCual').selectedOptions[0]?.textContent.split(' · ')[0]||'';
  const nombre=$('ofNombre').value.trim()||`Oferta ${cual}`.slice(0,80);
  const btn=$('ofGuardar');btn.disabled=true;
  try{
    await rpc('v2_save_promotion',{organization_id:ctx.organization_id,promotion:{name:nombre,kind:como,targetType:que,
      targetId:que==='product'||que==='bundle'?id:null,category:que==='category'?id:null,value:valor,valueKid:Number($('ofNino').value||0)||null,endsOn:hasta}});
    await load();closeDrawerFn();ver='ofertas';pintaCabecera();
  }catch(e){drawerMsg(e.message||'No se pudo guardar la oferta.');}
  finally{btn.disabled=false;}
});
$('ofertasLista')?.addEventListener('click',async e=>{
  const b=e.target.closest('[data-termina]');if(!b)return;
  const o=ofertas.find(x=>x.id===b.dataset.termina);
  if(window.tosConfirm&&!(await window.tosConfirm({kicker:'OFERTA',title:`¿Terminar "${o?.name||'la oferta'}"?`,message:'Regresa el precio normal desde ya.',confirmText:'Sí, terminar',cancelText:'Cancelar'})))return;
  b.disabled=true;
  try{await rpc('v2_end_promotion',{organization_id:ctx.organization_id,promotion_id:b.dataset.termina});await load();pintaCabecera();}
  catch(err){b.disabled=false;alert(err.message||'No se pudo terminar.');}
});

/* ---------- Códigos (26/10/2026, h46) ----------
   "Que otras cosas puedo crear con códigos en la tienda... dale con los
   códigos". Cada tarjeta dice qué hace, cómo va y, si tiene embajador,
   cuánto se le debe; desde aquí se comparte, se pausa y se paga el premio. */
const tallasDeProd=p=>Array.isArray(p?.sizes)?p.sizes.length:0;
const regalables=()=>products.filter(p=>!p.archived&&p.active&&tallasDeProd(p)<=1);
function renderCodigos(){
  const box=$('codigosLista');if(!box)return;
  box.innerHTML=codigos.codes.map(c=>{
    const e=ESTADOS_CODIGO[c.estado]||{t:c.estado,tono:''},st=c.stats||{},premio=Number(c.rewardPct||0)>0;
    return `<article class="codigo ${esc(c.estado)}" data-cd="${esc(c.id)}">
      <div class="codigo-cab"><b class="codigo-txt">${esc(c.code)}</b><span class="codigo-estado ${e.tono}">${esc(e.t)}</span></div>
      <p class="codigo-que">${esc(c.label)}${c.endsOn&&c.estado!=='vencido'?` · ${esc(textoHasta(c.endsOn))}`:''}</p>
      ${c.ambassadorName?`<p class="codigo-emb">Embajador: <b>${esc(c.ambassadorName)}</b>${premio?` · premio ${Number(c.rewardPct)}%${c.rewardKind==='credito'?' en crédito':''}`:''}</p>`:''}
      <div class="codigo-nums"><span><b>${st.uses||0}</b>${(st.uses||0)===1?'uso':'usos'}${c.maxUses?` de ${c.maxUses}`:''}</span><span><b>${money.format(Number(st.sold||0))}</b>vendido</span>
        ${premio?`<span class="${Number(st.rewardOwed||0)>0?'debe':''}"><b>${money.format(Number(st.rewardOwed||0))}</b>se le debe</span>`:`<span><b>${money.format(Number(st.discountGiven||0))}</b>descontado</span>`}</div>
      <div class="codigo-acc">
        ${c.ambassadorName||c.ambassadorPhone?'<button type="button" data-cd-acc="enviar">Mandar al embajador</button>':''}
        <button type="button" data-cd-acc="liga">Copiar liga de compra</button>
        ${codigos.canPay&&premio&&(Number(st.rewardOwed||0)>0||(c.payouts||[]).length)?'<button type="button" data-cd-acc="pagar">Pagar premio</button>':''}
        <button type="button" data-cd-acc="editar">Editar</button>
        <button type="button" data-cd-acc="${c.active?'pausar':'activar'}">${c.active?'Pausar':'Activar'}</button>
        <button type="button" class="codigo-quita" data-cd-acc="archivar">Archivar</button>
      </div></article>`;}).join('')
    ||'<div class="ofertas-vacio"><b>Sin códigos</b>Toca "+ Código": un descuento, un regalo o un código para un embajador.</div>';
}
function marcaChipDe(id,attr,valor){const b=$(id)?.querySelector(`[${attr}="${valor}"]`);if(b)marcaChip(id,b);}
function abreCodigo(c){
  draft={mode:'code',id:c?.id||null};
  drawerMsg();
  $('drawerKicker').textContent='CÓDIGO';$('drawerTitle').textContent=c?c.code:'Nuevo código';
  ['bundleForm','productForm','promoForm','payForm'].forEach(id=>$(id)?.classList.add('hidden'));$('codeForm').classList.remove('hidden');
  $('cdCode').value=c?.code||'';
  marcaChipDe('cdTipo','data-tipo',c?.kind||'descuento');
  marcaChipDe('cdComo','data-como',c?.discountType||'pct');
  $('cdValor').value=c?.kind==='descuento'?Number(c.discountValue):'';
  $('cdRegalo').innerHTML=regalables().map(p=>`<option value="${esc(p.id)}">${esc(p.name)} · ${money.format(Number(p.price||0))}</option>`).join('')||'<option value="">No hay piezas de talla única</option>';
  if(c?.giftProductId)$('cdRegalo').value=c.giftProductId;
  $('cdMin').value=Number(c?.minPurchase||0)||'';
  $('cdFin').value=c?.endsOn||'';
  $('cdUsos').value=c?.maxUses||'';
  $('cdUnaVez').checked=c?Number(c.maxUsesPerCustomer||0)===1:true;
  $('cdEmbNombre').value=c?.ambassadorName||'';$('cdEmbTel').value=c?.ambassadorPhone||'';
  $('cdPremio').value=Number(c?.rewardPct||0)||'';
  marcaChipDe('cdPremioTipo','data-premio',c?.rewardKind||'dinero');
  $('cdEmbajador').open=!!(c?.ambassadorName||Number(c?.rewardPct||0));
  $('cdNota').value=c?.note||'';
  pintaCodigoForm();openDrawer();
}
function codigoDelForm(){
  const tipo=elegido('cdTipo')?.dataset.tipo,regalo=products.find(p=>p.id===$('cdRegalo').value);
  return {id:draft?.id||null,code:normalizaCodigo($('cdCode').value),kind:tipo,
    discountType:tipo==='descuento'?elegido('cdComo')?.dataset.como:null,discountValue:tipo==='descuento'?Number($('cdValor').value||0):0,
    giftProductId:tipo==='regalo'?(regalo?.id||null):null,minPurchase:Number($('cdMin').value||0),endsOn:$('cdFin').value||null,
    maxUses:Number($('cdUsos').value||0)||null,maxUsesPerCustomer:$('cdUnaVez').checked?1:null,
    ambassadorName:$('cdEmbNombre').value.trim()||null,ambassadorPhone:$('cdEmbTel').value.replace(/\D/g,'')||null,
    rewardPct:Number($('cdPremio').value||0),rewardKind:elegido('cdPremioTipo')?.dataset.premio||'dinero',note:$('cdNota').value.trim()||null,
    _regalo:regalo};
}
function pintaCodigoForm(){
  const c=codigoDelForm();
  $('cdDescuento').classList.toggle('hidden',c.kind!=='descuento');
  $('cdRegaloCaja').classList.toggle('hidden',c.kind!=='regalo');
  $('cdValorTit').textContent=c.discountType==='amount'?'Descuento ($)':'Descuento (%)';
  const que=c.kind==='descuento'?(c.discountValue>0?(c.discountType==='pct'?`${c.discountValue}% de descuento`:`${money.format(c.discountValue)} de descuento`):'')
    :c.kind==='regalo'?(c._regalo?`${c._regalo.name} de regalo`:''):'Nombre y número gratis';
  const motivo=c.code?revisaCodigo(c,{esPresidencia:codigos.isPresidency,precioRegalo:Number(c._regalo?.price||0),tallasRegalo:tallasDeProd(c._regalo)}):null;
  $('cdVista').innerHTML=(c.code&&que?`<b>${esc(c.code)}</b>: ${esc(que)}${c.minPurchase>0?` en compras desde ${esc(money.format(c.minPurchase))}`:''}`:'')
    +(motivo?`<span class="cd-aviso">${esc(motivo)}</span>`:'');
}
['cdTipo','cdComo','cdPremioTipo'].forEach(id=>$(id)?.addEventListener('click',e=>{const b=e.target.closest('.chip');if(!b)return;marcaChip(id,b);pintaCodigoForm();}));
['cdCode','cdValor','cdMin','cdPremio','cdRegalo','cdFin'].forEach(id=>$(id)?.addEventListener('input',pintaCodigoForm));
$('nuevoCodigo')?.addEventListener('click',()=>abreCodigo(null));
$('cdGuardar')?.addEventListener('click',async()=>{
  const c=codigoDelForm();
  const motivo=revisaCodigo(c,{esPresidencia:codigos.isPresidency,precioRegalo:Number(c._regalo?.price||0),tallasRegalo:tallasDeProd(c._regalo)});
  if(motivo){drawerMsg(motivo);return;}
  const {_regalo,...store_code}=c;
  const btn=$('cdGuardar');btn.disabled=true;
  try{
    await rpc('v2_save_store_code',{organization_id:ctx.organization_id,store_code});
    await load();closeDrawerFn();ver='codigos';pintaCabecera();
  }catch(e){drawerMsg(e.message||'No se pudo guardar el código.');}
  finally{btn.disabled=false;}
});
async function copia(texto,boton,listo='Copiada'){
  try{await navigator.clipboard.writeText(texto);if(boton){const t=boton.textContent;boton.textContent=listo;setTimeout(()=>{boton.textContent=t;},1500);}}
  catch{window.prompt('Cópiala:',texto);}
}
function abrePago(c){
  draft={mode:'pay',id:c.id};
  drawerMsg();
  $('drawerKicker').textContent='PREMIO';$('drawerTitle').textContent=`${c.ambassadorName||c.code}`;
  ['bundleForm','productForm','promoForm','codeForm'].forEach(id=>$(id)?.classList.add('hidden'));$('payForm').classList.remove('hidden');
  const st=c.stats||{};
  $('payResumen').innerHTML=`Ganó <b>${money.format(Number(st.rewardEarned||0))}</b> (${Number(c.rewardPct)}% de ${money.format(Number(st.sold||0))} pagado). Ya se le pagó ${money.format(Number(st.rewardPaid||0))}. <b>Se le debe ${money.format(Number(st.rewardOwed||0))}.</b>`;
  $('payMonto').value=Number(st.rewardOwed||0)||'';$('payNota').value='';
  marcaChipDe('payComo','data-como',c.rewardKind==='credito'?'credito':'efectivo');
  $('payHistorial').innerHTML=(c.payouts||[]).length?`<h3 class="costos-sub">Pagos anotados</h3>${c.payouts.map(y=>`<div class="cd-pago"><span>${esc(new Date(`${y.paidOn}T12:00:00`).toLocaleDateString('es-MX',{day:'numeric',month:'short'}))} · ${esc({efectivo:'Efectivo',transferencia:'Transferencia',credito:'Crédito'}[y.method]||y.method)}${y.note?` · ${esc(y.note)}`:''}</span><b>${money.format(Number(y.amount))}</b><button type="button" data-pago-quita="${esc(y.id)}">Quitar</button></div>`).join('')}`:'';
  $('payGuardar').disabled=!(Number(st.rewardOwed||0)>0);
  openDrawer();
}
$('payComo')?.addEventListener('click',e=>{const b=e.target.closest('.chip');if(b)marcaChip('payComo',b);});
$('payGuardar')?.addEventListener('click',async()=>{
  const monto=Number($('payMonto').value||0);if(!(monto>0)){drawerMsg('Escribe cuánto se pagó.');return;}
  const btn=$('payGuardar');btn.disabled=true;
  try{
    await rpc('v2_store_code_payout',{organization_id:ctx.organization_id,code_id:draft.id,amount:monto,method:elegido('payComo')?.dataset.como||'efectivo',note:$('payNota').value.trim()||null});
    await load();closeDrawerFn();ver='codigos';pintaCabecera();
  }catch(e){drawerMsg(e.message||'No se pudo anotar el pago.');btn.disabled=false;}
});
$('payHistorial')?.addEventListener('click',async e=>{
  const b=e.target.closest('[data-pago-quita]');if(!b)return;
  if(window.tosConfirm&&!(await window.tosConfirm({kicker:'PREMIO',title:'¿Quitar este pago?',message:'Vuelve a contar como deuda con el embajador.',confirmText:'Sí, quitar',cancelText:'Cancelar'})))return;
  b.disabled=true;
  try{await rpc('v2_void_store_code_payout',{organization_id:ctx.organization_id,payout_id:b.dataset.pagoQuita});await load();const c=codigos.codes.find(x=>x.id===draft?.id);if(c)abrePago(c);else closeDrawerFn();pintaCabecera();}
  catch(err){b.disabled=false;alert(err.message||'No se pudo quitar.');}
});
$('codigosLista')?.addEventListener('click',async e=>{
  const b=e.target.closest('[data-cd-acc]');if(!b)return;
  const c=codigos.codes.find(x=>x.id===b.closest('[data-cd]')?.dataset.cd);if(!c)return;
  const acc=b.dataset.cdAcc,compra=ligaDeCompra(location.origin,c.code),ventas=ligaDelEmbajador(location.origin,c.shareToken);
  if(acc==='editar')return abreCodigo(c);
  if(acc==='pagar')return abrePago(c);
  if(acc==='liga')return copia(compra,b);
  if(acc==='enviar'){
    const texto=mensajeEmbajador(c,{compra,ventas,club:ctx.organization_name||'el club',fmt:n=>money.format(n)});
    const tel=String(c.ambassadorPhone||'').replace(/\D/g,'');
    window.open(`https://wa.me/${tel?(tel.length===10?`52${tel}`:tel):''}?text=${encodeURIComponent(texto)}`,'_blank','noopener');
    return;
  }
  if(acc==='archivar'&&window.tosConfirm&&!(await window.tosConfirm({kicker:'CÓDIGO',title:`¿Archivar ${c.code}?`,message:'Deja de funcionar en la tienda. Lo vendido y los premios se quedan en el historial.',confirmText:'Sí, archivar',cancelText:'Cancelar'})))return;
  b.disabled=true;
  try{await rpc('v2_set_store_code',{organization_id:ctx.organization_id,code_id:c.id,action:acc});await load();pintaCabecera();}
  catch(err){b.disabled=false;alert(err.message||'No se pudo cambiar.');}
});

/* ---------- Costos (13/10/2026) ----------
   "Los costos no quiero que le salgan a nadie... que tenga una pestañita para
   ver los costos". Aquí se captura el costo de cada pieza, se ve el margen de
   productos y kits, y la utilidad de la Tienda. En ningún otro lado. */
const tonoMargen=m=>m==null?'':m<20?'bajo':m<40?'medio':'bien';
function costoDeKit(b){
  let costo=0,falta=[];
  (b.components||[]).forEach(c=>{const p=products.find(x=>x.id===c.productId);if(!p||p.cost==null)falta.push(p?.name||'pieza');else costo+=Number(p.cost)*Number(c.qty||1);});
  return {costo,falta};
}
/* Niño y adulto (19/10/2026): "lo que más compran es el kit de niño, pero
   tú me das la utilidad del adulto". Cada fila dice lo que deja cada uno, con
   el de niño primero cuando existe, y —cuando ya hay ventas— el margen real
   con la mezcla que se vende. El costo es el mismo para los dos. */
let mezcla=null;
const lineaMargen=(etq,x,clase='')=>x?`<span class="costo-tipo ${clase} ${tonoMargen(x.margen)}"><i>${etq}</i><b>${pct(x.margen)}</b><small>ganas ${money.format(x.ganas)}</small></span>`:'';
function bloqueMargenes(m){
  const real=margenPonderado(m,mezcla?.nino??null);
  return `<span class="costo-margen">${lineaMargen(m.nino&&m.adulto?'Niño':'',m.nino||m.adulto,'principal')}${m.nino&&m.adulto?lineaMargen('Adulto',m.adulto):''}${real!=null&&m.nino&&m.adulto?`<span class="costo-real ${tonoMargen(real)}">Real con tus ventas: <b>${pct(real)}</b></span>`:''}</span>`;
}
function renderCostos(){
  if(!canFinance)return;
  const vivos=products.filter(p=>!p.archived);
  $('costosProductos').innerHTML=vivos.map(p=>{const costo=p.cost==null?null:Number(p.cost);
    const m=margenesDe({precioAdulto:p.price,precioNino:p.priceKid,costo});
    const precios=Number(p.priceKid||0)>0?`Adulto ${money.format(Number(p.price||0))} · Niño ${money.format(Number(p.priceKid))}`:`Precio ${money.format(Number(p.price||0))}`;
    return `<div class="costo-fila" data-cid="${esc(p.id)}"><span class="costo-nombre"><b>${esc(p.name)}</b><small>${precios}</small></span>
      <label class="costo-input"><span>Costo</span><input type="number" min="0" step="0.01" inputmode="decimal" value="${p.cost??''}" placeholder="—" data-costo="${esc(p.id)}"${canManage?'':' disabled'}></label>
      ${costo==null?'<span class="costo-margen"><span class="costo-tipo principal"><b>Sin costo</b></span></span>':bloqueMargenes(m)}</div>`;}).join('')||'<p class="muted">Sin productos.</p>';
  $('costosKits').innerHTML=bundles.filter(b=>!b.archived).map(b=>{const {costo,falta}=costoDeKit(b);
    const m=falta.length?{adulto:null,nino:null}:margenesDe({precioAdulto:b.priceAdult,precioNino:b.priceKid,costo});
    const pa=Number(b.priceAdult||0),pk=Number(b.priceKid||0);
    return `<div class="costo-fila kit" data-kid="${esc(b.id)}"><span class="costo-nombre"><b>${esc(b.name)}</b><small>${[pa&&`Adulto ${money.format(pa)}`,pk&&`Niño ${money.format(pk)}`].filter(Boolean).join(' · ')}</small></span>
      <span class="costo-total">${falta.length?`<em>Falta costo de ${esc(falta[0])}${falta.length>1?` y ${falta.length-1} más`:''}</em>`:`Costo ${money.format(costo)}`}</span>
      ${falta.length?'<span class="costo-margen"><span class="costo-tipo principal"><b>—</b></span></span>':bloqueMargenes(m)}</div>`;}).join('')||'<p class="muted">Sin kits.</p>';
  pintaNegocio();
}
$('costosProductos')?.addEventListener('change',async e=>{
  const inp=e.target.closest('[data-costo]');if(!inp||!canManage)return;
  const p=products.find(x=>x.id===inp.dataset.costo);if(!p)return;
  const valor=inp.value===''?null:Number(inp.value);
  if(valor!=null&&(!(valor>=0)))return;
  inp.disabled=true;
  try{
    await rpc('v2_upsert_product',{organization_id:ctx.organization_id,id:p.id,name:p.name,sku:p.sku||null,category:p.category||null,price:Number(p.price||0),cost:valor,sizes:Array.isArray(p.sizes)?p.sizes:[],active:!!p.active,description:p.description??null,lead_days:p.leadDays??null});
    p.cost=valor;renderCostos();
  }catch(err){inp.disabled=false;alert(err.message||'No se pudo guardar el costo.');}
});
/* La utilidad de la Tienda: lo que estaba arriba de Pedidos, ahora aquí. */
let negocio=null,negocioCorrida=0;
async function pintaNegocio(){
  const box=$('costosNegocio');if(!box)return;
  if(negocio){box.innerHTML=negocio;return;}
  box.innerHTML='<p class="muted">Calculando la utilidad…</p>';
  const corrida=++negocioCorrida;
  try{
    const ordenes=((await rpc('v2_orders',{organization_id:ctx.organization_id,status_filter:null}))||[]).filter(o=>!['cancelled','refunded'].includes(o.status));
    let venta=0,cobrado=0,porCobrar=0,costo=0,utilidad=0,ventaConCosto=0,completos=0;const lineas=[];
    for(let i=0;i<ordenes.length;i+=8){
      const lote=await Promise.all(ordenes.slice(i,i+8).map(o=>rpc('v2_order_detail',{organization_id:ctx.organization_id,order_id:o.id}).catch(()=>null)));
      if(corrida!==negocioCorrida)return;
      lote.forEach((d,k)=>{const o=ordenes[i+k];venta+=Number(o.total||0);if(!d)return;lineas.push(...(d.items||[]));cobrado+=Number(d.paidAmount||0);porCobrar+=Math.max(0,Number(d.balance||0));
        if(d.costComplete){completos++;costo+=Number(d.costTotal||0);utilidad+=Number(d.grossProfitExpected||0);ventaConCosto+=Number(d.order?.total??o.total??0);}});
    }
    const margen=ventaConCosto>0?utilidad/ventaConCosto*100:null;
    const porId=Object.fromEntries(products.map(p=>[p.id,p]));
    const mz=mezclaDeVentas(lineas,porId);
    mezcla=mz.nino==null?null:mz;
    negocio=`<div class="negocio-grid"><div><span>Venta</span><b>${money.format(venta)}</b></div><div><span>Cobrado</span><b>${money.format(cobrado)}</b></div><div><span>Por cobrar</span><b>${money.format(porCobrar)}</b></div>
      <div><span>Costo</span><b>${completos?money.format(costo):'—'}</b></div><div class="clave"><span>Utilidad</span><b>${completos?money.format(utilidad):'—'}</b></div><div><span>Margen</span><b>${margen==null?'—':pct(margen)}</b></div></div>
      ${mezcla?`<p class="negocio-mezcla"><b>${Math.round(mezcla.nino*100)}% de lo que vendes es de niño</b> (${mezcla.piezas} pieza${mezcla.piezas===1?'':'s'} con precio de niño y de adulto). Con eso sale el "Real con tus ventas" de cada fila.</p>`:'<p class="negocio-mezcla">Todavía no hay ventas con precio de niño y de adulto: cuando las haya, cada fila dirá su margen real.</p>'}
      <p class="muted negocio-nota">${completos}/${ordenes.length} pedidos con costo completo. Sin cancelados ni reembolsados.</p>`;
    box.innerHTML=negocio;
    // Con la mezcla ya calculada, las filas pueden decir su margen real.
    if(mezcla)renderCostos();
  }catch(err){box.innerHTML=`<p class="muted">No se pudo calcular: ${esc(err.message||'')}</p>`;}
}
$('catBuscar')?.addEventListener('input',e=>{busca=e.target.value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();renderBundles();renderProducts();});
/* El botón + de abajo: lo de esta pantalla primero. */
function accionesDelCatalogo(){
  if(!canManage)return [];
  return [{label:'Nuevo producto',sub:'Foto, nombre, precio y tallas',icon:'plus',run:()=>{ver='productos';pintaCabecera();openProductDrawer(null);}},
          {label:'Nuevo kit',sub:'Junta piezas con su precio',icon:'bag',run:()=>{ver='kits';pintaCabecera();openBundleDrawer(null);}},
          ...(canPromos?[{label:'Nueva oferta',sub:'Precio especial con fecha',icon:'star',run:()=>{ver='ofertas';pintaCabecera();abreOferta();}}]:[]),
          {label:'Nuevo código',sub:'Descuento, regalo o embajador',icon:'star',run:()=>{ver='codigos';pintaCabecera();abreCodigo(null);}},
          {label:'Nuevo banner',sub:'Foto grande arriba de la tienda',icon:'star',run:()=>{ver='banners';pintaCabecera();abreBanner(null,'banner');}}];
}

boot().catch(err=>{console.error(err);$('deniedText').textContent='No se pudo cargar el catálogo.';show('deniedView');});


/* ---------- Banners de la tienda (28/10/2026, h49) ----------
   "Como las páginas de adidas, Puma, Nike": la foto grande de arriba de la
   tienda. Se sube la foto de celular (la principal) y, si se tiene, la de
   compu; título, frase y botón van encima en letra real. Con fechas se
   prende y se apaga solo. La franja es el aviso de una línea de hasta arriba. */
const fechaCortaBn=f=>f?new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short'}).format(new Date(`${f}T12:00:00`)).replace('.',''):'';
function textoFechas(b){
  if(b.startsOn&&b.endsOn)return ` · del ${fechaCortaBn(b.startsOn)} al ${fechaCortaBn(b.endsOn)}`;
  if(b.endsOn)return ` · hasta el ${fechaCortaBn(b.endsOn)}`;
  if(b.startsOn)return ` · desde el ${fechaCortaBn(b.startsOn)}`;
  return '';
}
function renderBanners(){
  const box=$('bannersLista');if(!box)return;
  const lista=vitrinaAdmin.banners;
  box.innerHTML=lista.map(b=>{
    const e=ESTADOS_CODIGO[b.estado]||{t:b.estado,tono:''},mismos=lista.filter(x=>x.kind===b.kind),pos=mismos.indexOf(b);
    return `<article class="codigo bn-item ${esc(b.estado)}" data-bn="${esc(b.id)}">
      ${b.kind==='banner'?`<div class="bn-mini">${b.imagePath?`<img data-bn-foto="${esc(b.imagePath)}" alt="">`:''}</div>`:'<div class="bn-mini franja">Franja</div>'}
      <div class="bn-info"><div class="codigo-cab"><b class="bn-titulo">${esc(b.title)}</b><span class="codigo-estado ${e.tono}">${esc(e.t)}</span></div>
        <p class="codigo-que">Abre: ${esc(textoDestino(b,{products,bundles}))}${esc(textoFechas(b))}</p>
        <div class="codigo-acc"><button type="button" data-bn-acc="editar">Editar</button>
          ${pos>0?'<button type="button" data-bn-acc="subir">Subir</button>':''}${pos<mismos.length-1?'<button type="button" data-bn-acc="bajar">Bajar</button>':''}
          <button type="button" data-bn-acc="${b.active?'pausar':'activar'}">${b.active?'Pausar':'Activar'}</button>
          <button type="button" class="codigo-quita" data-bn-acc="archivar">Archivar</button></div></div></article>`;}).join('')
    ||'<div class="ofertas-vacio"><b>Sin banners</b>Toca "+ Banner" y sube la foto: es lo primero que ve quien entra a la tienda.</div>';
  const rutas=[...box.querySelectorAll('img[data-bn-foto]')].map(i=>i.dataset.bnFoto);
  if(rutas.length)getSignedPhotoUrls(supabase,PHOTO_BUCKET,rutas).then(m=>{box.querySelectorAll('img[data-bn-foto]').forEach(i=>{const u=m?.[i.dataset.bnFoto];if(u)i.src=u;});}).catch(()=>{});
}
function opcionesDestino(tipo){
  if(tipo==='producto')return products.filter(p=>!p.archived&&p.active!==false).map(p=>[p.id,p.name]);
  if(tipo==='kit')return bundles.filter(b=>!b.archived&&b.active!==false).map(b=>[b.id,b.name]);
  if(tipo==='categoria'){
    const hay=new Set(products.filter(p=>!p.archived&&p.active!==false).map(p=>categoriaDe(p)));
    if(bundles.some(b=>!b.archived))hay.add('kits');
    return CATEGORIAS_TIENDA.filter(c=>hay.has(c.clave)).map(c=>[c.clave,c.etiqueta]);
  }
  return [];
}
function pintaDestino(valor){
  const tipo=elegido('bnDestino')?.dataset.destino||'tienda',sel=$('bnDestinoValor');
  sel.classList.toggle('hidden',tipo==='tienda');
  if(tipo==='tienda'){sel.innerHTML='';return;}
  const ops=opcionesDestino(tipo);
  sel.innerHTML=ops.map(([v,t])=>`<option value="${esc(v)}">${esc(t)}</option>`).join('')||'<option value="">No hay nada publicado</option>';
  if(valor&&ops.some(([v])=>String(v)===String(valor)))sel.value=valor;
}
async function pintaVistaBanner(){
  const pon=async(id,file,ruta)=>{
    const caja=$(id);if(!caja)return;
    let url=file?URL.createObjectURL(file):'';
    if(!url&&ruta){try{url=await getSignedPhotoUrl(supabase,PHOTO_BUCKET,ruta);}catch{url='';}}
    caja.innerHTML=url?`<img src="${esc(url)}" alt="">`:'<span>Sin foto</span>';
  };
  await Promise.all([pon('bnVistaMovil',draft?.file,draft?.img),pon('bnVistaCompu',draft?.file2,draft?.img2)]);
  $('bnQuitaCompu')?.classList.toggle('hidden',!(draft?.file2||draft?.img2));
}
function pintaBannerForm(){
  const franja=elegido('bnTipo')?.dataset.tipo==='franja';
  $('bnFotos').classList.toggle('hidden',franja);
  $('bnFraseCaja').classList.toggle('hidden',franja);
  $('drawerKicker').textContent=franja?'FRANJA':'BANNER';
  $('bnGuardar').textContent=franja?'Guardar franja':'Guardar banner';
  $('bnTitulo').placeholder=franja?'Ej. Nombre y número GRATIS con el código TANNER':'Ej. Black Edition ya llegó';
}
function abreBanner(b,kind='banner'){
  draft={mode:'banner',id:b?.id||null,carpeta:b?.id||(crypto.randomUUID?crypto.randomUUID():null),img:b?.imagePath||null,img2:b?.imageDesktopPath||null,file:null,file2:null};
  drawerMsg();
  ['bundleForm','productForm','promoForm','codeForm','payForm'].forEach(id=>$(id)?.classList.add('hidden'));$('bannerForm').classList.remove('hidden');
  $('drawerTitle').textContent=b?b.title:(kind==='franja'?'Nueva franja':'Nuevo banner');
  marcaChipDe('bnTipo','data-tipo',b?.kind||kind);
  $('bnTitulo').value=b?.title||'';$('bnFrase').value=b?.subtitle||'';$('bnBoton').value=b?.ctaLabel||'';
  marcaChipDe('bnDestino','data-destino',b?.targetKind||'tienda');pintaDestino(b?.targetValue);
  $('bnDesde').value=b?.startsOn||'';$('bnHasta').value=b?.endsOn||'';
  $('bnFotoMovil').value='';$('bnFotoCompu').value='';
  pintaBannerForm();pintaVistaBanner();openDrawer();
}
// La foto se achica en el teléfono antes de subirla: 1350 px de alto en
// celular y 1920 de ancho en compu, en WebP. Así carga rápido con datos.
async function subeFotoBanner(lado,file){
  if(file.type&&!String(file.type).startsWith('image/'))throw new Error('Elige una imagen (JPG, PNG o WebP).');
  if(!draft?.carpeta)throw new Error('Este navegador no puede subir la foto. Prueba en otro.');
  const img=await loadImageFile(file);
  const enc=await encodeVariant(img,lado==='movil'?1350:1920,0.85,lado==='movil'?460*1024:620*1024);
  const ruta=`organizations/${ctx.organization_id}/commerce/banners/${draft.carpeta}/${lado}-${Date.now()}.${enc.ext}`;
  const {error}=await supabase.storage.from(PHOTO_BUCKET).upload(ruta,enc.blob,{contentType:enc.mime,cacheControl:UPLOAD_CACHE_CONTROL,upsert:false});
  if(error)throw new Error('No se pudo subir la foto. Revisa tu conexión e intenta otra vez.');
  return ruta;
}
['bnTipo','bnDestino'].forEach(id=>$(id)?.addEventListener('click',e=>{const b=e.target.closest('.chip');if(!b)return;marcaChip(id,b);id==='bnTipo'?pintaBannerForm():pintaDestino();}));
$('bnFotoMovil')?.addEventListener('change',e=>{if(draft?.mode!=='banner')return;draft.file=e.target.files?.[0]||null;pintaVistaBanner();});
$('bnFotoCompu')?.addEventListener('change',e=>{if(draft?.mode!=='banner')return;draft.file2=e.target.files?.[0]||null;pintaVistaBanner();});
$('bnQuitaCompu')?.addEventListener('click',()=>{if(draft?.mode!=='banner')return;draft.file2=null;draft.img2=null;$('bnFotoCompu').value='';pintaVistaBanner();});
$('nuevoBanner')?.addEventListener('click',()=>abreBanner(null,'banner'));
$('nuevaFranja')?.addEventListener('click',()=>abreBanner(null,'franja'));
$('bnGuardar')?.addEventListener('click',async()=>{
  if(draft?.mode!=='banner')return;
  const btn=$('bnGuardar'),antes=btn.textContent;btn.disabled=true;drawerMsg();
  try{
    const kind=elegido('bnTipo')?.dataset.tipo||'banner',titulo=$('bnTitulo').value.trim(),destino=elegido('bnDestino')?.dataset.destino||'tienda';
    const valor=destino==='tienda'?null:($('bnDestinoValor').value||null);
    if(!titulo)throw new Error('Escribe el título.');
    if(kind==='banner'&&!draft.file&&!draft.img)throw new Error('Sube la foto para celular.');
    if(destino!=='tienda'&&!valor)throw new Error('Elige qué abre al tocarlo.');
    if($('bnDesde').value&&$('bnHasta').value&&$('bnHasta').value<$('bnDesde').value)throw new Error('La fecha de fin va después del inicio.');
    if(kind==='banner'&&(draft.file||draft.file2)){
      btn.textContent='Subiendo fotos…';
      if(draft.file){draft.img=await subeFotoBanner('movil',draft.file);draft.file=null;}
      if(draft.file2){draft.img2=await subeFotoBanner('compu',draft.file2);draft.file2=null;}
    }
    btn.textContent='Guardando…';
    await rpc('v2_save_store_banner',{organization_id:ctx.organization_id,banner:{id:draft.id,kind,title:titulo,
      subtitle:kind==='banner'?$('bnFrase').value.trim()||null:null,ctaLabel:$('bnBoton').value.trim()||null,targetKind:destino,targetValue:valor,
      imagePath:kind==='banner'?draft.img:null,imageDesktopPath:kind==='banner'?draft.img2:null,startsOn:$('bnDesde').value||null,endsOn:$('bnHasta').value||null}});
    await load();closeDrawerFn();ver='banners';pintaCabecera();
  }catch(e){drawerMsg(e.message||'No se pudo guardar.');}
  finally{btn.disabled=false;btn.textContent=antes;}
});
$('bannersLista')?.addEventListener('click',async e=>{
  const b=e.target.closest('[data-bn-acc]');if(!b)return;
  const bn=vitrinaAdmin.banners.find(x=>x.id===b.closest('[data-bn]')?.dataset.bn);if(!bn)return;
  const acc=b.dataset.bnAcc;
  if(acc==='editar')return abreBanner(bn);
  b.disabled=true;
  try{
    if(acc==='subir'||acc==='bajar'){
      const ids=vitrinaAdmin.banners.filter(x=>x.kind===bn.kind).map(x=>x.id),i=ids.indexOf(bn.id),j=acc==='subir'?i-1:i+1;
      if(j<0||j>=ids.length)return;
      [ids[i],ids[j]]=[ids[j],ids[i]];
      await rpc('v2_order_store_banners',{organization_id:ctx.organization_id,banner_ids:ids});
    }else{
      if(acc==='archivar'&&window.tosConfirm&&!(await window.tosConfirm({kicker:'BANNER',title:`¿Archivar "${bn.title}"?`,message:'Deja de salir en la tienda. Lo puedes volver a crear cuando quieras.',confirmText:'Sí, archivar',cancelText:'Cancelar'})))return;
      await rpc('v2_set_store_banner',{organization_id:ctx.organization_id,banner_id:bn.id,action:acc});
    }
    await load();pintaCabecera();
  }catch(err){alert(err.message||'No se pudo cambiar.');}
  finally{b.disabled=false;}
});
