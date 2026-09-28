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

const RAIZ='/home/user/TannerOs';
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png'};
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
],bundles:[{id:'b1',name:'Kit Tanner - Completo',priceAdult:1740,active:true,archived:false,components:[],costComplete:false,componentsResolved:true}]};

const stub=`
 export function createClient(){return{
  auth:{getSession:async()=>({data:{session:{user:{id:'u1'}}}}),getUser:async()=>({data:{user:{app_metadata:{}}}}),signOut:async()=>({}),onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}}},
  storage:{from:(b)=>({
    // Firma en lote, como el Storage real. Se anota para poder exigir que la
    // lista NO pida el original: una lista es una coleccion.
    createSignedUrls:async(paths)=>{window.__firmados=(window.__firmados||[]).concat(paths);
      return {data:paths.map(p=>({path:p,signedUrl:'/icon.svg?firmada='+encodeURIComponent(p)})),error:null};},
    createSignedUrl:async(p)=>{window.__firmados=(window.__firmados||[]).concat([p]);
      return {data:{signedUrl:'/icon.svg?firmada='+encodeURIComponent(p)},error:null};}
  })},
  rpc:async(n,p={})=>{
    window.__rpc=window.__rpc||[];window.__rpc.push({n,p});
    if(n==='v2_my_context')return{data:[{organization_id:'o1',organization_name:'Tannery City FC',role:'Presidencia',is_owner:true}],error:null};
    if(n==='v2_my_modules')return{data:[{module_code:'catalogo',enabled:true,can_read:true,can_write:true},{module_code:'commerce_finance',enabled:true,can_read:true,can_write:true}],error:null};
    if(n==='v2_catalog')return{data:${JSON.stringify(CAT)},error:null};
    return {data:[],error:null};}};}`;

const nav=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
const pg=await nav.newPage({viewport:{width:390,height:844}});
const errs=[];pg.on('pageerror',e=>errs.push('pageerror: '+e.message));
pg.on('console',m=>{const u=m.location()?.url||'';if(m.type()==='error'&&!/esm\.sh|favicon/.test(m.text()+u))errs.push('console: '+m.text());});
await pg.route('**/v2/supabase-client.js',r=>r.fulfill({status:200,contentType:'text/javascript',body:stub}));
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
  await pg.click('#productList .catalog-card');
  await pg.waitForSelector('#productForm:not(.hidden)',{timeout:5000});
  return (await pg.inputValue('#pName')).length>0;
})());

revisa('sin errores de consola', errs.length===0, errs.join('\n   '));
revisa('sin scroll horizontal en un teléfono',
  await pg.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));

await nav.close(); srv.close();
console.log(fallos
  ? `Catálogo humo FAILED · ${fallos} de ${corridas}`
  : `Catálogo humo OK · ${corridas} revisiones, incluida la foto que se subió y no se veía`);
process.exit(fallos?1:0);
