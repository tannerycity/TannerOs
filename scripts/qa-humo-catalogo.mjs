/* El catálogo de administrador: comprobar que la foto quedó.
 *
 * El caso que da nombre a este archivo es real y ocurrió el 28 de septiembre
 * de 2026. Después de arreglar dos bugs seguidos para poder subir una foto
 * —la carpeta de Storage y el permiso de la función— Presidencia subió las
 * cuatro fotos de los jerseys del club, la base las guardó con original y
 * miniatura... y la pantalla siguió mostrando cuatro monitos idénticos.
 *
 * La lista del catálogo nunca leyó la miniatura. El RPC sí la devolvía
 * (photoThumbPath) y el panel de detalle sí la pintaba; la lista, no. Así que
 * quien acababa de subir cuatro jerseys parecidos no tenía forma de saber cuál
 * quedó en cuál —ni siquiera si se había guardado—.
 *
 * Y ESA es la razón por la que esta pantalla tiene que enseñarlas: es donde se
 * sube la foto, o sea que es donde hay que poder comprobarla. En la tienda de
 * las familias y en el mostrador de Taquilla ya se veían desde antes.
 */
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const RAIZ=path.resolve(new URL('..', import.meta.url).pathname);
const T={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png'};
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p.endsWith('/'))p+='index.html';
  const f=path.join(RAIZ,p);if(!f.startsWith(RAIZ)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);r.end('no');return;}
  r.writeHead(200,{'content-type':T[path.extname(f)]||'application/octet-stream'});r.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(4698,r));

const TALLAS=["6","8","10","12","14","16","XS","S","M","L","XL","XXL"];
const RUTA=id=>`organizations/o1/commerce/products/${id}/foto-1.webp`;
// Los cuatro jerseys reales del club, tres con foto y uno sin ella: el que no
// la tiene se queda con su icono, y la lista sigue sirviendo.
const CAT={products:[
  {id:'p1',name:'Jersey "Black Edition"',category:'jersey',price:799,active:true,archived:false,sizes:TALLAS,
   photoPath:RUTA('p1'),photoThumbPath:RUTA('p1')+'-thumb',photoBucket:'tanneros-private'},
  {id:'p2',name:'Jersey "Lechuguilla Edition"',category:'jersey',price:799,active:true,archived:false,sizes:TALLAS,
   photoPath:RUTA('p2'),photoThumbPath:RUTA('p2')+'-thumb',photoBucket:'tanneros-private'},
  {id:'p3',name:'Jersey "Wet Blue" - Home Edition',category:'jersey',price:799,active:true,archived:false,sizes:TALLAS,
   photoPath:RUTA('p3'),photoThumbPath:RUTA('p3')+'-thumb',photoBucket:'tanneros-private'},
  {id:'p4',name:'Par de calcetas',category:'socks',price:200,active:true,archived:false,sizes:['Universal'],
   photoPath:null,photoThumbPath:null,photoBucket:null},
  // Un archivado con foto: no debe aparecer mientras no se pidan los archivados.
  {id:'p5',name:'Producto legacy',category:null,price:0,active:false,archived:true,sizes:[],
   photoPath:RUTA('p5'),photoThumbPath:RUTA('p5')+'-thumb',photoBucket:'tanneros-private'}
],bundles:[{id:'b1',name:'Kit Tanner - Completo',priceAdult:1740,active:true,archived:false,components:[{productId:'p1',qty:1}],costComplete:false,componentsResolved:true}]};

const stubPara=(rol='Presidencia',puede=true)=>`
 export function createClient(){return{
  auth:{getSession:async()=>({data:{session:{user:{id:'u1'}}}}),getUser:async()=>({data:{user:{app_metadata:{}}}}),signOut:async()=>({}),onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}}},
  storage:{from:(b)=>({
    // Firma en lote, como el Storage real. Se anota para poder exigir que la
    // lista NO pida el original: una lista es una coleccion.
    createSignedUrls:async(paths)=>{window.__firmados=(window.__firmados||[]).concat(paths);
      return {data:paths.map(p=>({path:p,signedUrl:'/icon.svg?firmada='+encodeURIComponent(p)})),error:null};},
    createSignedUrl:async(p)=>{window.__firmados=(window.__firmados||[]).concat([p]);
      return {data:{signedUrl:'/icon.svg?firmada='+encodeURIComponent(p)},error:null};},
    upload:async(p)=>{window.__subidas=(window.__subidas||[]).concat([p]);return {data:{path:p},error:null};},
    remove:async(ps)=>{window.__borrados=(window.__borrados||[]).concat(ps);return {data:[],error:null};}
  })},
  rpc:async(n,p={})=>{
    window.__rpc=window.__rpc||[];window.__rpc.push({n,p});
    if(n==='v2_my_context')return{data:[{organization_id:'o1',organization_name:'Tannery City FC',role:'${rol}',is_owner:${rol==='Presidencia'}}],error:null};
    if(n==='v2_can_edit_catalog')return{data:${puede},error:null};
    if(n==='v2_my_modules')return{data:[{module_code:'catalogo',enabled:true,can_read:true,can_write:true},{module_code:'commerce_finance',enabled:true,can_read:true,can_write:true}],error:null};
    if(n==='v2_catalog')return{data:${JSON.stringify(CAT)},error:null};
    return {data:[],error:null};}};}`;

const nav=await chromium.launch({executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
const pg=await nav.newPage({viewport:{width:390,height:844}});
const errs=[];pg.on('pageerror',e=>errs.push('pageerror: '+e.message));
pg.on('console',m=>{const u=m.location()?.url||'';if(m.type()==='error'&&!/esm\.sh|favicon/.test(m.text()+u))errs.push('console: '+m.text());});
await pg.route('**/v2/supabase-client.js',r=>r.fulfill({status:200,contentType:'text/javascript',body:stubPara()}));
await pg.route('**/v2/branding-auto.js',r=>r.fulfill({status:200,contentType:'text/javascript',body:''}));
await pg.goto('http://127.0.0.1:4698/v2/catalogo/',{waitUntil:'networkidle'});
await pg.waitForSelector('#productList .catalog-card',{timeout:8000});

let fallos=0,corridas=0;
const revisa=(nombre,ok,detalle)=>{corridas++;if(!ok){fallos++;console.error(` - ${nombre}${detalle?`\n   ${detalle}`:''}`);}};

/* ===== EL BUG QUE ESTE ARCHIVO EXISTE PARA QUE NO VUELVA ===== */
await pg.waitForFunction(()=>document.querySelectorAll('#productList .cat-thumb img').length>0,{timeout:6000})
  .catch(()=>{});
const conFoto=await pg.$$eval('#productList .cat-thumb img',n=>n.length);
revisa('la foto que se acaba de subir SE VE en la lista, no un icono',
  conFoto===3, `miniaturas pintadas: ${conFoto} (se esperaban 3)`);

// Que cada foto caiga en SU tarjeta: tres jerseys parecidos mal ordenados son
// peor que ninguna foto, porque se ven bien y dicen mentira.
//
// La ruta no se puede leer del src: el cache compartido descarga los bytes y
// entrega un blob: (docs/MEDIA_EGRESS_ARCHITECTURE.md). Lo que si prueba el
// emparejamiento es el alt, porque el alt y la ruta salen del MISMO registro y
// la caja se elige por el id de ESE registro. Si el selector apuntara a otra
// tarjeta, el alt no cuadraria con su titulo.
const pares=await pg.$$eval('#productList .catalog-card',n=>n.map(c=>({
  titulo:c.querySelector('.cat-title')?.textContent.trim()||'',
  alt:c.querySelector('.cat-thumb img')?.getAttribute('alt')??null,
  tieneFoto:!!c.querySelector('.cat-thumb img')})));
const conImagen=pares.filter(x=>x.tieneFoto);
revisa('cada jersey trae SU foto, no la del de al lado',
  conImagen.length===3 && conImagen.every(x=>x.alt===x.titulo),
  JSON.stringify(conImagen));

// Un producto sin foto no se queda en blanco ni rompe la lista.
const calcetas=pares.find(x=>/calcetas/i.test(x.titulo||''));
revisa('un producto sin foto conserva su icono y la lista sigue sirviendo',
  !!calcetas && calcetas.tieneFoto===false, JSON.stringify(calcetas));
revisa('el icono sigue ahí para el que no tiene foto',
  (await pg.$$eval('#productList .cat-thumb svg',n=>n.length))>=1);

/* ===== La regla del egreso: miniatura, nunca el original ===== */
const firmados=await pg.evaluate(()=>window.__firmados||[]);
revisa('la lista firma SÓLO miniaturas, nunca el original',
  firmados.length>0 && firmados.every(p=>/-thumb$/.test(p)), firmados.join(' | '));
revisa('y no firma la foto de un archivado que nadie pidió ver',
  !firmados.some(p=>/products\/p5\//.test(p)), firmados.join(' | '));
// En lote: firmar de una en una multiplica las llamadas a Storage.
const llamadas=await pg.evaluate(()=>window.__firmados?.length||0);
revisa('las tres se firman juntas, no de una en una', llamadas===3, `rutas firmadas: ${llamadas}`);

/* ===== Que enseñar la foto no rompa lo que ya funcionaba ===== */
revisa('los kits siguen listándose', (await pg.$$eval('#bundleList .catalog-card',n=>n.length))===1);
revisa('el archivado sigue escondido mientras no se pida',
  (await pg.$$eval('#productList .catalog-card',n=>n.length))===4,
  `tarjetas: ${await pg.$$eval('#productList .catalog-card',n=>n.length)}`);
// Y al pedirlos, se repinta y se vuelve a firmar: la foto no se queda pegada
// de la vuelta anterior.
await pg.check('#showArchived');
await pg.waitForTimeout(400);
revisa('al ver archivados aparecen, y con su foto',
  (await pg.$$eval('#productList .catalog-card',n=>n.length))===5
  && (await pg.$$eval('#productList .cat-thumb img',n=>n.length))===4);

revisa('abrir un producto sigue funcionando', await (async()=>{
  await pg.click('.cat-seg [data-ver="productos"]');
  await pg.click('#productList .catalog-card');
  await pg.waitForSelector('#productForm:not(.hidden)',{timeout:5000});
  return (await pg.inputValue('#pName')).length>0;
})());


/* ===== La pantalla simple: lo que se quito y lo que quedo =====
 *
 * "No tantos botones, solo lo necesario." La regla no es quitar por gusto: se
 * midio que campo estaba vacio en la realidad y se quito ese. Descripcion del
 * kit y Vigente hasta estaban en 0 de 3 kits; SKU en 8 de 8, y se quedo.
 */
// La revision anterior dejo el panel abierto, y un panel abierto tapa la lista.
if(await pg.isVisible('#drawer'))await pg.click('#closeDrawer');

revisa('se fueron los cuatro mosaicos de KPI',
  (await pg.$$eval('.kpis article',n=>n.length))===0);
revisa('y la pastilla que decia "Informacion actualizada"',
  (await pg.$$eval('.health',n=>n.length))===0);
// Con 3 productos sin costo y 1 sin foto, la linea tiene algo que decir.
const pend=(await pg.textContent('#pendientes'))||'';
revisa('la linea de pendientes dice lo que falta capturar',
  /sin costo|sin foto/.test(pend), pend);

// El formulario de producto
await pg.click('.cat-seg [data-ver="productos"]');
  await pg.click('#productList .catalog-card');
await pg.waitForSelector('#productForm:not(.hidden)',{timeout:5000});
revisa('la categoria ya no se teclea: se toca',
  (await pg.$$eval('#pCatChips .chip',n=>n.length))===6,
  `chips de categoria: ${await pg.$$eval('#pCatChips .chip',n=>n.length)}`);
revisa('el jersey abre con SU categoria ya prendida',
  (await pg.$eval('#pCatChips .chip.on',n=>n.textContent.trim()))==='Jersey',
  await pg.$eval('#pCatChips .chip.on',n=>n.textContent.trim()).catch(()=>'ninguna'));
revisa('las tallas tampoco se teclean',
  (await pg.$$eval('#pSizeChips .chip',n=>n.length))===13);
revisa('y el jersey abre con sus doce prendidas',
  (await pg.$$eval('#pSizeChips .chip.on',n=>n.length))===12);

// El atajo que evita teclear doce valores producto por producto.
await pg.click('[data-escala="ninos"]');
revisa('"Solo ninos" deja seis tallas de un toque',
  (await pg.$$eval('#pSizeChips .chip.on',n=>n.length))===6);
await pg.click('[data-escala="unica"]');
revisa('"Talla unica" es excluyente: no deja doce tallas y ademas Universal',
  (await pg.$$eval('#pSizeChips .chip.on',n=>n.length))===1
  && (await pg.$eval('#pSizeChips .chip.on',n=>n.textContent.trim()))==='Universal');
await pg.click('[data-escala="club"]');
revisa('"Escala del club" las regresa todas',
  (await pg.$$eval('#pSizeChips .chip.on',n=>n.length))===12);

// Y tocando Universal directo, no solo por el atajo: un producto de talla
// unica con doce tallas ademas es un producto que miente en la tienda.
await pg.click('#pSizeChips .chip[data-talla="Universal"]');
revisa('tocar Universal apaga las doce: es excluyente',
  (await pg.$$eval('#pSizeChips .chip.on',n=>n.length))===1,
  `prendidas: ${await pg.$$eval('#pSizeChips .chip.on',n=>n.map(x=>x.textContent.trim()).join(','))}`);
// Y al reves: tocar una talla normal quita Universal.
await pg.click('#pSizeChips .chip[data-talla="12"]');
revisa('tocar una talla normal quita Universal',
  (await pg.$$eval('#pSizeChips .chip.on',n=>n.map(x=>x.textContent.trim()).join(',')))==='12');
await pg.click('[data-escala="club"]');

// 44px es el minimo para el dedo, y esto se usa de pie en el mostrador.
const alto=await pg.$eval('#pSizeChips .chip',n=>Math.round(n.getBoundingClientRect().height));
revisa('los botones miden al menos 44px para el dedo', alto>=44, `alto=${alto}px`);

// Hay dos formularios en el panel: se cuenta el del producto, no los dos.
revisa('archivar dejo de ser hermano de Guardar',
  (await pg.$$eval('#productForm .drawer-actions button',n=>n.length))===1
  && await pg.isVisible('#pArchiveToggle')
  && (await pg.$eval('#pArchiveToggle',n=>n.className)).includes('accion-menor'),
  await pg.$eval('#pArchiveToggle',n=>n.className));

// Costo y margen ya no se ven en la ficha (13/10/2026): viven en Costos.
revisa('la ficha del producto no muestra costo ni margen',
  (await pg.getAttribute('#pCost','type'))==='hidden' && await pg.isHidden('#pMargenCaja'));

// El kit perdio los dos campos que nadie lleno nunca.
await pg.click('#closeDrawer');
await pg.click('.cat-seg [data-ver="kits"]');
await pg.click('#bundleList .catalog-card');
await pg.waitForSelector('#bundleForm:not(.hidden)',{timeout:5000});
revisa('el kit ya no pide descripcion', (await pg.$$('#bDescription')).length===0);
revisa('ni fecha de vigencia', (await pg.$$('#bValidUntil')).length===0);
revisa('pero sigue pidiendo precio de nino, que si se usa en los tres kits',
  await pg.isVisible('#bPriceKid'));
await pg.click('#closeDrawer');

// Piezas del kit (13/10/2026): la lista de productos para tocar, con − / +.
await pg.click('.cat-seg [data-ver="kits"]');
await pg.click('#bundleList .catalog-card');
await pg.waitForSelector('#bComponents .kit-pieza',{timeout:5000});
// El kit como receta (14/10/2026): "Siempre incluye" enseña sólo lo que trae;
// lo demás, tras "+ Agregar pieza".
const piezasKit=(await pg.$$eval('#bComponents .kit-pieza-nombre b',bs=>bs.map(b=>b.textContent))).join('|');
revisa('"Siempre incluye" enseña sólo lo que el kit trae', piezasKit==='Jersey "Black Edition"',piezasKit);
revisa('arriba, el kit en una frase con su precio', /Black Edition/.test(await pg.textContent('#bVista'))&&/Adulto \$1,740/.test(await pg.textContent('#bVista')), await pg.textContent('#bVista'));
revisa('la lista para agregar empieza cerrada en un kit que ya existe', await pg.isHidden('#bCatalogoFijas'));
await pg.click('#bAgregarFija');
const paraAgregar=(await pg.$$eval('#bCatalogoFijas .kit-pieza-nombre b',bs=>bs.map(b=>b.textContent))).join('|');
revisa('"+ Agregar pieza" ofrece lo que falta, sin el archivado', paraAgregar==='Jersey "Lechuguilla Edition"|Jersey "Wet Blue" - Home Edition|Par de calcetas',paraAgregar);
await pg.click('#bCatalogoFijas [data-agrega="p2"]');
await pg.click('#bCatalogoFijas [data-agrega="p4"]');
await pg.click('.kit-pieza[data-pid="p4"] [data-q="1"]');
revisa('la frase de arriba se arma sola', /Black Edition \+ Lechuguilla Edition \+ 2 Par de calcetas/.test((await pg.textContent('#bVista')).replace(/\s+/g,' ')), await pg.textContent('#bVista'));
if(process.env.SHOTS)await pg.screenshot({path:`${process.env.SHOTS}/kit.png`});
const resumen=(await pg.textContent('#bResumen')).replace(/\s+/g,' ');
revisa('dice cuántas piezas, cuánto cuestan sueltas y cuánto se ahorra en kit',
  /4 piezas/.test(resumen)&&/por separado \$1,998\.00/.test(resumen)&&/ahorran \$258\.00/.test(resumen),resumen);
await pg.click('#bSave');
await pg.waitForTimeout(300);
const guardado=await pg.evaluate(()=>window.__rpc.filter(x=>x.n==='v2_upsert_bundle').map(x=>x.p.components));
revisa('guarda las piezas con su cantidad',JSON.stringify(guardado[0])==='[{"productId":"p1","qty":1},{"productId":"p2","qty":1},{"productId":"p4","qty":2}]',JSON.stringify(guardado));
if(await pg.isVisible('#drawer'))await pg.click('#closeDrawer');
revisa('el jersey dice en qué kit va', /En Kit Tanner - Completo/.test(await pg.textContent('#productList')));

// Alta de producto (13/10/2026, "bien fácil"): foto, qué es, nombre, precio;
// las tallas se prenden solas según lo que es.
if(await pg.isVisible('#drawer'))await pg.click('#closeDrawer');
if(process.env.SHOTS)await pg.screenshot({path:`${process.env.SHOTS}/catalogo.png`});
// Diseño de tienda (19/10/2026, captura de iPhone: "no se ve bien").
{
  if(!(await pg.isVisible('#productsPanel')))await pg.click('.cat-seg [data-ver="productos"]');
  await pg.waitForTimeout(200);
  const d=await pg.evaluate(()=>({doc:document.documentElement.scrollWidth,w:innerWidth,
    tabs:[...document.querySelectorAll('.cat-seg button:not(.hidden)')].filter(b=>b.scrollWidth>b.clientWidth+1).map(b=>b.innerText),
    panel:getComputedStyle(document.getElementById('productsPanel')).backgroundColor,
    sw:(r=>[Math.round(r.width),Math.round(r.height)])(document.getElementById('showArchived').getBoundingClientRect()),
    meta:[...document.querySelectorAll('#productList .cat-meta')].map(e=>e.textContent),
    chips:[...document.querySelectorAll('#productList .cat-chip')].map(e=>e.textContent).filter(t=>!/^(Archivado|Inactivo)$/.test(t))}));
  revisa('[diseño] nada se sale a 390px y ninguna pestaña se corta',d.doc<=d.w+1&&!d.tabs.length,JSON.stringify(d));
  revisa('[diseño] la lista no va dentro de otra tarjeta',/rgba\(0, 0, 0, 0\)|transparent/.test(d.panel),d.panel);
  revisa('[diseño] "Archivados" es un interruptor, no una casilla grande',d.sw[0]===40&&d.sw[1]===24,JSON.stringify(d.sw));
  revisa('[diseño] la categoría se lee en español ("socks" → Calcetas)',d.meta.some(t=>/^Calcetas/.test(t))&&!d.meta.some(t=>/socks/i.test(t)),JSON.stringify(d.meta));
  revisa('[diseño] sin pastillas de clave ni categoría: sólo de estado',d.chips.length===0,JSON.stringify(d.chips));
}
revisa('arriba: Productos | Kits con su cuenta', /Productos\s*4/.test(await pg.textContent('.cat-seg'))&&/Kits\s*1/.test(await pg.textContent('.cat-seg')), await pg.textContent('.cat-seg'));
await pg.fill('#catBuscar','calcetas');
revisa('el buscador filtra', (await pg.$$eval('#productList .catalog-card',n=>n.length))===1);
await pg.fill('#catBuscar','');
await pg.click('#newProductBtn');
await pg.waitForSelector('#productForm:not(.hidden)',{timeout:5000});
const orden=await pg.$$eval('#productForm > *',n=>n.map(x=>x.id||x.className).slice(0,3));
revisa('el alta empieza por las fotos y "¿Qué es?"', orden[0].includes('fotos-campo')&&orden[1].includes('campo-toques'), JSON.stringify(orden));
revisa('SKU y "se vende" van guardados en Más opciones', await pg.isHidden('#pSku'));
await pg.click('#pCatChips [data-cat="socks"]');
revisa('calcetas: talla única sola', JSON.stringify(await pg.$$eval('#pSizeChips .chip.on',n=>n.map(x=>x.textContent.trim())))==='["Universal"]');
await pg.click('#pCatChips [data-cat="jersey"]');
revisa('jersey: la escala del club sola', (await pg.$$eval('#pSizeChips .chip.on',n=>n.length))===12);
revisa('un jersey prende solo "Lleva nombre y número"', await pg.isChecked('#pPers'));
await pg.click('#pCatChips [data-cat="socks"]');
revisa('unas calcetas lo apagan', !(await pg.isChecked('#pPers')));
await pg.click('#pCatChips [data-cat="jersey"]');
await pg.fill('#pName','Jersey Portero');
await pg.fill('#pPrice','899');
await pg.fill('#pDesc','Jersey de portero en tela ligera.');
if(process.env.SHOTS)await pg.screenshot({path:`${process.env.SHOTS}/alta.png`});
await pg.click('#pSave');
await pg.waitForTimeout(300);
const alta=await pg.evaluate(()=>window.__rpc.filter(x=>x.n==='v2_upsert_product').map(x=>x.p).pop());
revisa('se guarda con categoría, precio y sus doce tallas', alta?.name==='Jersey Portero'&&alta?.category==='jersey'&&alta?.price===899&&alta?.sizes?.length===12, JSON.stringify(alta));
revisa('la descripción se escribe aquí y sale en la tienda', alta?.description==='Jersey de portero en tela ligera.', JSON.stringify(alta?.description));
// Costos (13/10/2026): sólo en su pestaña, con margen y el costo editable.
if(await pg.isVisible('#drawer'))await pg.click('#closeDrawer');
revisa('las tarjetas no dicen costo ni margen', !/Margen|Costo|Sin costo/.test(await pg.textContent('#productList')+await pg.textContent('#bundleList')));
await pg.click('#catTabCostos');
await pg.waitForSelector('#costosProductos .costo-fila',{timeout:4000}).catch(()=>{});
revisa('la pestaña Costos lista los productos con su costo', (await pg.$$('#costosProductos .costo-fila')).length===4);
await pg.fill('[data-costo="p4"]','80');
await pg.dispatchEvent('[data-costo="p4"]','change');
await pg.waitForTimeout(300);
const conCosto=await pg.evaluate(()=>window.__rpc.filter(x=>x.n==='v2_upsert_product').map(x=>x.p).pop());
revisa('capturar el costo lo guarda sin tocar lo demás', conCosto?.id==='p4'&&conCosto?.cost===80&&conCosto?.price===200&&conCosto?.name==='Par de calcetas', JSON.stringify(conCosto));
revisa('y el margen sale solo', /60%/.test(await pg.textContent('.costo-fila[data-cid="p4"] .costo-margen')), await pg.textContent('.costo-fila[data-cid="p4"] .costo-margen'));
revisa('el kit dice qué pieza no tiene costo', /Falta costo de/.test(await pg.textContent('#costosKits')), await pg.textContent('#costosKits'));
// "Lleva nombre y número" (13/10/2026): se prende a mano y se guarda.
await pg.click('.cat-seg [data-ver="productos"]');
await pg.click('#productList .catalog-card:has-text("Par de calcetas")');
await pg.waitForSelector('#productForm:not(.hidden)',{timeout:4000});
revisa('las calcetas llegan con la casilla apagada', !(await pg.isChecked('#pPers')));
await pg.click('.switch-fila[for="pPers"]');
await pg.click('#pSave');
await pg.waitForTimeout(400);
const pers=await pg.evaluate(()=>window.__rpc.filter(x=>x.n==='v2_set_product_personalizable').map(x=>x.p).pop());
revisa('prenderla guarda la decisión en el producto', pers?.product_id==='p4'&&pers?.value===true, JSON.stringify(pers));
if(await pg.isVisible('#drawer'))await pg.click('#closeDrawer');
// Ligar a kits desde la pieza.
await pg.click('.cat-seg [data-ver="productos"]');
await pg.click('#productList .catalog-card[data-pid="p3"], #productList .catalog-card >> nth=2').catch(()=>{});
await pg.waitForSelector('#pKits [data-kit-liga]',{timeout:4000}).catch(()=>{});
await pg.click('#pKits [data-kit-liga="b1"]');
await pg.waitForTimeout(300);
const liga=await pg.evaluate(()=>window.__rpc.filter(x=>x.n==='v2_upsert_bundle').map(x=>x.p).pop());
revisa('desde la pieza se mete al kit en un toque, conservando lo demás', liga?.id==='b1'&&liga?.components?.length===2&&liga?.price_adult===1740, JSON.stringify(liga));
// Ofertas (13/10/2026): ¿a qué?, ¿cómo?, ¿hasta cuándo? y listo.
if(await pg.isVisible('#drawer'))await pg.click('#closeDrawer');
await pg.click('#catTabOfertas');
revisa('la pestaña Ofertas arranca vacía y dice cómo', /Sin ofertas/.test(await pg.textContent('#ofertasLista')));
await pg.click('#nuevaOferta');
await pg.waitForSelector('#promoForm:not(.hidden)',{timeout:4000}).catch(()=>{});
await pg.selectOption('#ofCual','p1');
await pg.fill('#ofValor','599');
const vista=(await pg.textContent('#ofVista')).replace(/\s+/g,' ');
revisa('la vista previa dice antes y después', /\$799\.00/.test(vista)&&/\$599\.00/.test(vista)&&/Hasta el/.test(vista), vista);
await pg.fill('#ofNombre','Buen Fin');
await pg.click('#ofGuardar');
await pg.waitForTimeout(300);
const oferta=await pg.evaluate(()=>window.__rpc.filter(x=>x.n==='v2_save_promotion').map(x=>x.p.promotion).pop());
revisa('guarda la oferta: producto, precio, nombre y fecha de fin', oferta?.targetType==='product'&&oferta?.targetId==='p1'&&oferta?.kind==='precio'&&oferta?.value===599&&oferta?.name==='Buen Fin'&&/^\d{4}-\d{2}-\d{2}$/.test(oferta?.endsOn||''), JSON.stringify(oferta));
await pg.click('#nuevaOferta');
await pg.click('#ofQue [data-que="todo"]');
revisa('para toda la tienda sólo hay porcentaje', await pg.isDisabled('#ofComo [data-como="precio"]'));
await pg.fill('#ofValor','150');
await pg.click('#ofGuardar');
revisa('un descuento de 100% o más no pasa', /de 1 a 99%/.test(await pg.textContent('#drawerMessage')));
if(await pg.isVisible('#drawer'))await pg.click('#closeDrawer');
// Varias fotos (14/10/2026): la primera es la portada.
await pg.click('.cat-seg [data-ver="productos"]');
await pg.click('#productList .catalog-card:has-text("Black Edition")');
await pg.waitForSelector('#productForm:not(.hidden)',{timeout:4000});
await pg.waitForSelector('#pFotos .foto-item img',{timeout:4000}).catch(()=>{});
revisa('[fotos] el producto abre con su foto de portada', (await pg.$$('#pFotos .foto-item')).length===1 && await pg.isVisible('#pFotos .foto-item.portada .foto-tag'));
await pg.setInputFiles('#pPhotoInput',[path.join(RAIZ,'icon-180.png'),path.join(RAIZ,'brand/crest-navy.png')]);
await pg.waitForFunction(()=>document.querySelectorAll('#pFotos .foto-item').length===3,{timeout:4000}).catch(()=>{});
revisa('[fotos] se agregan varias de un jalón', (await pg.$$('#pFotos .foto-item')).length===3 && /3 de 8/.test(await pg.textContent('#pFotosCuenta')));
await pg.click('#pFotos [data-portada="1"]');
revisa('[fotos] tocar otra la vuelve portada', (await pg.$$eval('#pFotos .foto-item',n=>n.findIndex(x=>x.classList.contains('portada'))))===0 && /blob:/.test(await pg.getAttribute('#pFotos .foto-item.portada img','src')));
if(process.env.SHOTS)await pg.screenshot({path:`${process.env.SHOTS}/fotos.png`});
await pg.click('#pFotos [data-quita="1"]');
revisa('[fotos] la equis la quita', (await pg.$$('#pFotos .foto-item')).length===2);
await pg.click('#pSave');
await pg.waitForTimeout(600);
const fotosG=await pg.evaluate(()=>window.__rpc.filter(x=>x.n==='v2_set_product_photos').map(x=>x.p).pop());
const subidas=await pg.evaluate(()=>window.__subidas||[]);
revisa('[fotos] se guardan en orden: la nueva de portada y la otra nueva detrás', fotosG?.product_id==='p1'&&fotosG?.photos?.length===2&&fotosG.photos[0].path===subidas[0]&&/products\/p1\/foto-\d+\./.test(fotosG.photos[0].path)&&fotosG.photos[1].path===subidas[2], JSON.stringify({fotosG,subidas}));
const borrados=await pg.evaluate(()=>window.__borrados||[]);
revisa('[fotos] la que se quitó se borra del bucket', borrados.includes(RUTA('p1'))&&borrados.includes(RUTA('p1')+'-thumb'), JSON.stringify(borrados));
if(await pg.isVisible('#drawer'))await pg.click('#closeDrawer');
// Kit con piezas a elegir (14/10/2026, Kit Dúo): short fijo + 2 jerseys a elegir.
await pg.click('.cat-seg [data-ver="kits"]').catch(()=>{});
await pg.click('#newBundleBtn');
await pg.waitForSelector('#bundleForm:not(.hidden)',{timeout:4000});
await pg.fill('#bName','Kit Dúo');
await pg.fill('#bPriceAdult','1500');
await pg.fill('#bPriceKid','1299');
await pg.click('#bCatalogoFijas [data-agrega="p4"]');
revisa('[dúo] "El papá escoge" empieza apagado', await pg.isHidden('#bPool'));
await pg.click('.switch-fila[for="bPoolOn"]');
revisa('[dúo] prendido: "Escoge 2 de estas" con los jerseys primero', /Escoge\s*−?\s*2\s*\+?\s*de estas/.test((await pg.textContent('#bPool')).replace(/\s+/g,' ')) && (await pg.textContent('#bPool .kit-pool-tit'))==='Jerseys', (await pg.textContent('#bPool')).replace(/\s+/g,' '));
revisa('[dúo] la pieza fija no sale como opción a elegir', (await pg.$('#bPool [data-pool-pid="p4"]'))===null);
await pg.click('#bPool [data-pool-pid="p1"]');
await pg.click('#bSave');
revisa('[dúo] con una sola opción no se guarda', /al menos 2 opciones/.test(await pg.textContent('#drawerMessage')), await pg.textContent('#drawerMessage'));
await pg.click('#bPool [data-pool-pid="p2"]');
await pg.click('#bPool [data-pool-pid="p3"]');
revisa('[dúo] dice cuántas elige entre cuántas', /escoge 2 entre 3/.test(await pg.textContent('#bPool')), await pg.textContent('#bPool'));
if(process.env.SHOTS)await pg.locator('#drawer').screenshot({path:`${process.env.SHOTS}/kit-duo.png`});
if(process.env.SHOTS){await pg.$eval('#drawer',d=>d.scrollTop=0);await pg.screenshot({path:`${process.env.SHOTS}/kit-duo-arriba.png`});}
await pg.click('#bSave');
await pg.waitForTimeout(300);
const duo=await pg.evaluate(()=>window.__rpc.filter(x=>x.n==='v2_upsert_bundle').map(x=>x.p).pop());
revisa('[dúo] se guarda la pieza fija y las 2 a elegir con sus opciones', duo?.name==='Kit Dúo'&&JSON.stringify(duo.components)===JSON.stringify([{productId:'p4',qty:1},{pool:['p1','p2','p3'],qty:2,name:'Jersey a elegir'}]), JSON.stringify(duo?.components));
if(await pg.isVisible('#drawer'))await pg.click('#closeDrawer');
// Precio de niño (14/10/2026): casilla y segundo precio.
await pg.click('.cat-seg [data-ver="productos"]');
await pg.click('#productList .catalog-card:has-text("Lechuguilla")');
await pg.waitForSelector('#productForm:not(.hidden)',{timeout:4000});
revisa('[niño] apagado: un solo precio, "Precio de venta"', !(await pg.isChecked('#pKid')) && await pg.isHidden('#pPriceKidCampo') && (await pg.textContent('#pPriceTit'))==='Precio de venta');
await pg.click('.switch-fila[for="pKid"]');
revisa('[niño] prendido: aparece el precio niño y el otro dice "Precio adulto"', await pg.isVisible('#pPriceKid') && (await pg.textContent('#pPriceTit'))==='Precio adulto');
await pg.click('#pSave');
revisa('[niño] sin el precio no se guarda y lo dice', /precio de niño/.test(await pg.textContent('#drawerMessage')), await pg.textContent('#drawerMessage'));
await pg.fill('#pPriceKid','599');
await pg.click('#pSave');
await pg.waitForTimeout(400);
const nino=await pg.evaluate(()=>window.__rpc.filter(x=>x.n==='v2_set_product_price_kid').map(x=>x.p).pop());
revisa('[niño] se guarda el precio de niño del producto', nino?.product_id==='p2'&&nino?.price_kid===599, JSON.stringify(nino));
if(await pg.isVisible('#drawer'))await pg.click('#closeDrawer');
// Manga larga con cargo (14/10/2026): se fija arriba de los productos.
await pg.click('.cat-seg [data-ver="productos"]');
revisa('[manga] arriba de los productos: "Manga larga + $"', await pg.isVisible('#recargoManga'));
await pg.fill('#recargoManga','50');
await pg.dispatchEvent('#recargoManga','change');
await pg.waitForTimeout(300);
const rec=await pg.evaluate(()=>window.__rpc.filter(x=>x.n==='v2_set_recargo_manga').map(x=>x.p).pop());
revisa('[manga] guardar el cargo', rec?.monto===50, JSON.stringify(rec));
revisa('sin errores de consola', errs.length===0, errs.join('\n   '));
revisa('sin scroll horizontal en un teléfono',
  await pg.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));

// Quién edita (14/10/2026): Presidencia y quien tenga el ajuste especial (Zul).
for(const [rol,puede,edita] of [['Operaciones',true,true],['Operaciones',false,false]]){
  const pz=await nav.newPage({viewport:{width:390,height:844}});
  await pz.route('**/v2/supabase-client.js',r=>r.fulfill({status:200,contentType:'text/javascript',body:stubPara(rol,puede)}));
  await pz.route('**/v2/branding-auto.js',r=>r.fulfill({status:200,contentType:'text/javascript',body:''}));
  await pz.goto('http://127.0.0.1:4698/v2/catalogo/',{waitUntil:'networkidle'});
  await pz.waitForSelector('#productList .catalog-card',{timeout:8000});
  revisa(`[permiso] ${rol} ${puede?'con':'sin'} ajuste especial ${edita?'sí':'no'} edita`, (await pz.isVisible('#newProductBtn'))===edita);
  if(edita)revisa('[permiso] pero las ofertas siguen siendo de Presidencia', await pz.isHidden('#catTabOfertas'));
  await pz.close();
}
await nav.close(); srv.close();
console.log(fallos
  ? `Catálogo humo FAILED · ${fallos} de ${corridas}`
  : `Catálogo humo OK · ${corridas} revisiones, incluida la foto que no se veía y la pantalla que se podó con evidencia`);
process.exit(fallos?1:0);
