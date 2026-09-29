/* Las tres tiendas, capturadas para mirarlas.
 *
 * Una tienda se juzga con los ojos. Que un precio no se lea, que una foto
 * deforme un jersey, que dos botones compitan, que la mitad del anaquel sean
 * monogramas: nada de eso lo dice una asercion.
 *
 *   node scripts/vista-tiendas.mjs
 *
 * Los datos son los OCHO productos reales del club, con sus precios y con sus
 * cuatro fotos faltantes. No sirve de nada mirar un catalogo inventado en el
 * que todo tiene foto.
 *
 * Escribe en docs/evidencias/. No corre en CI.
 */
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const RAIZ = '/home/user/TannerOs';
const T = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
            '.svg':'image/svg+xml','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('no'); return; }
  r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
  r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(4703, r));

const TALLAS = ["6","8","10","12","14","16","XS","S","M","L","XL","XXL"];
const FOTO = n => `organizations/o1/commerce/products/${n}/foto-thumb`;
// Los ocho productos activos del club, tal como estan hoy.
const PRODUCTOS = [
  { id:'p1', name:'Jersey "Black Edition"', category:'jersey', price:799, active:true, archived:false, sizes:TALLAS, sku:'TC-JER-BLACK', photoThumbPath:FOTO('p1'), photoBucket:'tanneros-private', photo_thumb_path:FOTO('p1'), photo_bucket:'tanneros-private' },
  { id:'p2', name:'Jersey "Lechuguilla Edition"', category:'jersey', price:799, active:true, archived:false, sizes:TALLAS, sku:'TC-JER-LECHUGUILLA', photoThumbPath:FOTO('p2'), photoBucket:'tanneros-private', photo_thumb_path:FOTO('p2'), photo_bucket:'tanneros-private' },
  { id:'p3', name:'Jersey "Pink Cantera" - Away Edition', category:'jersey', price:699, active:true, archived:false, sizes:TALLAS, sku:'TC-JER-PINK-AWAY', cost:400, photoThumbPath:FOTO('p3'), photoBucket:'tanneros-private', photo_thumb_path:FOTO('p3'), photo_bucket:'tanneros-private' },
  { id:'p4', name:'Jersey "Wet Blue" - Home Edition', category:'jersey', price:699, active:true, archived:false, sizes:TALLAS, sku:'TC-JER-WETBLUE', cost:400, photoThumbPath:FOTO('p4'), photoBucket:'tanneros-private', photo_thumb_path:FOTO('p4'), photo_bucket:'tanneros-private' },
  // Los cuatro SIN foto: asi esta el anaquel hoy.
  { id:'p5', name:'Hoodie / Chamarra', category:'outerwear', price:999, cost:600, active:true, archived:false, sizes:TALLAS, sku:'TC-HOODIE' },
  { id:'p6', name:'Pants', category:'pants', price:999, cost:600, active:true, archived:false, sizes:TALLAS, sku:'TC-PANTS' },
  { id:'p7', name:'Par de calcetas', category:'socks', price:200, cost:90, active:true, archived:false, sizes:['Universal'], sku:'TC-SOCKS' },
  { id:'p8', name:'Short', category:'shorts', price:350, cost:180, active:true, archived:false, sizes:TALLAS, sku:'TC-SHORT' }
];
const KITS = [
  { id:'b1', name:'Kit Tanner - Completo', priceAdult:1740, priceKid:1600, active:true, archived:false, components:[], costComplete:false, componentsResolved:true },
  { id:'b2', name:'Kit Game', priceAdult:1200, priceKid:1100, active:true, archived:false, components:[], costComplete:false, componentsResolved:true },
  { id:'b3', name:'Kit Training', priceAdult:770, priceKid:700, active:true, archived:false, components:[], costComplete:false, componentsResolved:true }
];
// Los kits como los entrega portal_catalog: con sus piezas YA resueltas,
// porque la familia no puede elegir tallas de algo que no sabe que trae.
const KITS_PORTAL = [
  { id:'b1', name:'Kit Tanner - Completo', price_adult:3500, price_kid:2350, pieces:[
    { product_id:'p4', name:'Jersey "Wet Blue" - Home Edition', sizes:TALLAS, qty:1 },
    { product_id:'p3', name:'Jersey "Pink Cantera" - Away Edition', sizes:TALLAS, qty:1 },
    { product_id:'p8', name:'Short', sizes:TALLAS, qty:2 },
    { product_id:'p7', name:'Par de calcetas', sizes:['Universal'], qty:2 }]},
  { id:'b2', name:'Kit Game', price_adult:1500, price_kid:1299, pieces:[
    { product_id:'p4', name:'Jersey "Wet Blue" - Home Edition', sizes:TALLAS, qty:1 },
    { product_id:'p8', name:'Short', sizes:TALLAS, qty:1 },
    { product_id:'p7', name:'Par de calcetas', sizes:['Universal'], qty:1 }]}
];
const JUG = [
  { id:'t1', first_name:'Dario', last_name:'Montalvo Díaz', category:'T10', jersey_number:7, status:'active' },
  { id:'t2', first_name:'Erick', last_name:'García Medina', category:'T10', status:'active' }
];

// Una foto de verdad para las que si la tienen: se sirve el escudo, que basta
// para ver como se acomoda una imagen en la tarjeta.
const stubStorage = `storage:{from:()=>({
  createSignedUrls:async(paths)=>({data:paths.map(p=>({path:p,signedUrl:'/brand/crest-navy.png'})),error:null}),
  createSignedUrl:async()=>({data:{signedUrl:'/brand/crest-navy.png'},error:null})})},`;

const stub = (rpcs) => `
 export function createClient(){return{
  auth:{getSession:async()=>({data:{session:{user:{id:'u1'}}}}),getUser:async()=>({data:{user:{app_metadata:{}}}}),signOut:async()=>({}),onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}}},
  ${stubStorage}
  rpc:async(n,p={})=>{ ${rpcs} return {data:[],error:null};}};}`;

const COMUN = `
  if(n==='v2_my_context')return{data:[{organization_id:'o1',organization_name:'Tannery City FC',role:'Presidencia',is_owner:true}],error:null};
  if(n==='v2_my_modules')return{data:[{module_code:'catalogo',enabled:true,can_read:true,can_write:true},{module_code:'commerce',enabled:true,can_read:true,can_write:true},{module_code:'commerce_finance',enabled:true,can_read:true,can_write:true}],error:null};
  if(n==='v2_catalog')return{data:${JSON.stringify({ products: PRODUCTOS, bundles: KITS })},error:null};
  if(n==='v2_players')return{data:${JSON.stringify(JUG)},error:null};`;

const PANTALLAS = [
  ['tienda-admin', '/v2/catalogo/', stub(COMUN), '#productList .catalog-card'],
  ['tienda-taquilla', '/v2/captura/', stub(COMUN), '.pick-card-foto, #productGrid button'],
  // El portal arranca con v2_portal_home, no con portal_me: la primera version
  // de este banco uso la forma equivocada y capturo la pantalla de "sin Tanner
  // ligado" creyendo que era la tienda.
  ['tienda-familias', '/v2/familias/', stub(`
    if(n==='v2_portal_home')return{data:{organization:{name:'Tannery City FC'},guardian:{id:'g1',firstName:'Ana',lastName:'Ávila'},players:[{id:'t1',firstName:'Mauricio',lastName:'Torres Avila',category:'Baby Tanner',balance:0}],account:{balance:0}},error:null};
    if(n==='v2_portal_catalog')return{data:${JSON.stringify({products: PRODUCTOS.map(p => ({ ...p, photo_thumb_path: p.photoThumbPath || null })),bundles: KITS_PORTAL })},error:null};
    ${COMUN}`), '[data-tab="tienda"]', '[data-tab="tienda"]', '.fam-prod .fam-talla-sel']
];

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
fs.mkdirSync(path.join(RAIZ, 'docs/evidencias'), { recursive: true });

for (const [nombre, ruta, codigo, espera, tocar, abrirTalla] of PANTALLAS) {
  const pg = await nav.newPage({ viewport: { width: 390, height: 1100 }, deviceScaleFactor: 2 });
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  await pg.route('**/v2/supabase-client.js', r => r.fulfill({ status:200, contentType:'text/javascript', body:codigo }));
  await pg.route('**/v2/branding-auto.js', r => r.fulfill({ status:200, contentType:'text/javascript', body:'' }));
  try {
    await pg.goto(`http://127.0.0.1:4703${ruta}`, { waitUntil:'networkidle' });
    await pg.waitForSelector(espera, { timeout: 8000 }).catch(() => {});
    if (tocar) { await pg.click(tocar).catch(() => {}); await pg.waitForTimeout(700); }
    // Abre un selector de talla: el estado cerrado ya se ve, el que hay que
    // revisar es el abierto.
    if (abrirTalla) {
      await pg.click(abrirTalla).catch(() => {});
      await pg.waitForTimeout(500);
      // Un primer plano de la tarjeta abierta: el estado cerrado ya se ve en
      // la captura entera, el que hay que revisar de cerca es este.
      const card = await pg.$(abrirTalla.split(' ')[0]);
      if (card) {
        const cerca = `docs/evidencias/${nombre}-talla-abierta.jpg`;
        await card.screenshot({ path: path.join(RAIZ, cerca), type:'jpeg', quality:88 }).catch(()=>{});
        console.log(`${cerca}`);
      }
    }
    await pg.waitForTimeout(900);
    const destino = `docs/evidencias/${nombre}.jpg`;
    await pg.screenshot({ path: path.join(RAIZ, destino), type:'jpeg', quality:82, fullPage:true });
    const alto = await pg.evaluate(() => document.documentElement.scrollHeight);
    const ancho = await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    console.log(`${destino} · alto ${alto}px · sin scroll horizontal: ${ancho}${errs.length ? ` · ERRORES: ${errs.join(' | ')}` : ''}`);
  } catch (e) {
    console.log(`${nombre}: NO SE PUDO · ${e.message.split('\n')[0]}`);
  }
  await pg.close();
}
await nav.close(); srv.close();
