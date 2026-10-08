/* EL LINK QUE SE PEGA EN WHATSAPP, probado como lo usa un desconocido.
 *
 * Esta es la única tienda del club que le habla a alguien sin cuenta y sin
 * sesión. Si aquí algo no se puede tocar, no hay a quién reclamarle: la
 * persona cierra la pestaña y el club nunca se entera.
 *
 * Lo que se protege:
 *
 *   1. Que la tienda se vea ANTES de pedir datos. Era un formulario que pedía
 *      nombre y teléfono antes de enseñar qué hay.
 *   2. Que los tres kits salgan. Dos de tres estaban bloqueados por apuntar a
 *      productos archivados hasta la migración x1.
 *   3. Que un kit se pueda comprar completo, con una talla por unidad —dos
 *      shorts son dos tallas— y que la llamada lleve el id legacy que
 *      v2_public_bundle_order espera.
 *   4. Que el nombre estampado y el número lleguen en la llamada.
 *   5. Que no se pueda confirmar sin autorizar el tratamiento de datos.
 *
 * Se espía la llamada RPC en vez de mirar pixeles: lo que importa no es cómo
 * se ve el botón, es QUÉ se le manda al club cuando se toca.
 */
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const T = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
            '.svg':'image/svg+xml','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('no'); return; }
  r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
  r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(4705, r));

const TALLAS = ['6','8','10','12','14','16','XS','S','M','L','XL','XXL'];
/* Los tres kits reales del club, con sus precios y sus piezas de hoy —seis,
 * cuatro y tres— y con el id legacy que traen de verdad. */
const OFERTA = {
  products: [
    { id:'p-jersey', name:'Jersey "Wet Blue" - Home Edition', price:699, sizes:TALLAS, product_type:'jersey' },
    { id:'p-hoodie', name:'Hoodie / Chamarra', price:999, sizes:TALLAS, product_type:'outerwear' },
    { id:'p-calceta', name:'Par de calcetas', price:200, sizes:['Universal'], product_type:'socks' }
  ],
  bundles: [
    { id:'k-completo', kind:'bundle', name:'Kit Tanner - Completo', priceAdult:3500, priceKid:2350,
      available:true, blockedReason:null, components:[
        { productId:'p-jersey', legacyProductId:'prod_mqjiv4gq_blvgdn', name:'Jersey "Wet Blue" - Home Edition', sizes:TALLAS, qty:1 },
        { productId:'p-short', legacyProductId:'pro_mrr0dhtr_a6w6yr', name:'Short', sizes:TALLAS, qty:2 },
        { productId:'p-calceta', legacyProductId:'pro_mrr0dhu7_qvh0ex', name:'Par de calcetas', sizes:['Universal'], qty:2 } ] },
    { id:'k-game', kind:'bundle', name:'Kit Game', priceAdult:1500, priceKid:1299,
      available:true, blockedReason:null, components:[
        { productId:'p-jersey', legacyProductId:'prod_mqjiv4gq_blvgdn', name:'Jersey "Wet Blue" - Home Edition', sizes:TALLAS, qty:1 },
        { productId:'p-calceta', legacyProductId:'pro_mrr0dhu7_qvh0ex', name:'Par de calcetas', sizes:['Universal'], qty:1 } ] },
    { id:'k-training', kind:'bundle', name:'Kit Training', priceAdult:1500, priceKid:1299,
      available:true, blockedReason:null, components:[
        { productId:'p-jersey', legacyProductId:'prod_mqjiv4gq_blvgdn', name:'Jersey "Wet Blue" - Home Edition', sizes:TALLAS, qty:1 } ] },
    /* Un kit bloqueado, para comprobar que NO se ofrece. Antes de x1 así
     * estaban dos de los tres reales. */
    { id:'k-roto', kind:'bundle', name:'Kit Roto', priceAdult:999, priceKid:0,
      available:false, blockedReason:'Incluye una prenda fuera del catálogo V2', components:[] }
  ]
};

// Lo que la página le manda al club. Es lo que de verdad se está probando.
const llamadas = [];

const nav = await chromium.launch({ executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
const pg = await nav.newPage({ viewport:{ width:390, height:844 } });
const errs = [];
pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
pg.on('console', m => { if (m.type()==='error' && !/favicon/.test(m.text())) errs.push('console: ' + m.text()); });

await pg.exposeFunction('__anota', (n, p) => { llamadas.push({ n, p }); });
await pg.route('**/v2/supabase-client.js', r => r.fulfill({ status:200, contentType:'text/javascript', body:`
  export function createClient(){return{
    auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}}},
    rpc:async(n,p={})=>{
      await window.__anota(n, JSON.parse(JSON.stringify(p)));
      if(n==='v2_public_offerings')return{data:${JSON.stringify(OFERTA)},error:null};
      if(n==='v2_public_bundle_order')return{data:{folio:'PED-QA-1',total:3500},error:null};
      if(n==='v2_public_order_enhanced')return{data:{folio:'PED-QA-2',total:699},error:null};
      return {data:null,error:null};}};}` }));
// Sin salida a internet, el import de esm.sh se cuelga y la página nunca arranca.
await pg.route('**esm.sh/libphonenumber-js**', r => r.fulfill({ status:200, contentType:'text/javascript', body:`
  export function AsYouType(){return{input:v=>v}}
  export function getCountries(){return['MX','US']}
  export function getCountryCallingCode(c){return c==='MX'?'52':'1'}
  export function parsePhoneNumberFromString(v){const d=String(v).replace(/\\D/g,'');
    return{isValid:()=>d.length>=10,formatInternational:()=>'+52 '+d,number:'+52'+d};}` }));

let fallos = 0, corridas = 0;
const revisa = (nombre, ok, detalle) => { corridas++; if (!ok) { fallos++; console.error(` - ${nombre}${detalle ? `\n   ${detalle}` : ''}`); } };

await pg.goto('http://127.0.0.1:4705/pedido/', { waitUntil:'networkidle' });
await pg.waitForSelector('.fam-kit', { timeout: 8000 }).catch(() => {});

/* ===== 1. La tienda se ve, y se ve ANTES de pedir datos ===== */
const kits = await pg.$$eval('.fam-kit .fam-kit-head strong', ns => ns.map(n => n.textContent));
revisa('los tres kits vendibles salen en la vitrina',
  kits.length === 3 && kits.includes('Kit Tanner - Completo'), JSON.stringify(kits));
revisa('un kit bloqueado NO se ofrece con un botón muerto',
  !kits.includes('Kit Roto'), JSON.stringify(kits));
revisa('y el kit va primero: un club vende el uniforme, no las piezas',
  await pg.evaluate(() => {
    const k = document.querySelector('.fam-kit'), p = document.querySelector('.fam-prod');
    return !!k && !!p && k.compareDocumentPosition(p) === Node.DOCUMENT_POSITION_FOLLOWING;
  }));
revisa('las piezas sueltas también están',
  (await pg.$$('.fam-prod')).length === 3);
// Era un formulario que pedía nombre y teléfono antes de enseñar nada.
revisa('NO se piden los datos antes de elegir qué comprar',
  (await pg.$('#customerName')) === null && (await pg.$('#customerPhone')) === null);

/* ===== 2. El monograma no incluye conectores ===== */
const monos = await pg.$$eval('.fam-iniciales', ns => ns.map(n => n.textContent));
revisa('"Hoodie / Chamarra" da HC, no "H/"', monos.includes('HC'), JSON.stringify(monos));
revisa('"Par de calcetas" da PC, no "PD"', monos.includes('PC'), JSON.stringify(monos));

/* ===== 3. Comprar el kit completo ===== */
// Dos shorts son DOS tallas: una ranura por unidad.
const ranuras = await pg.$$eval('.fam-kit:first-of-type .fam-pieza', ns => ns.map(n => n.querySelector('span')?.textContent));
revisa('el kit pide una talla por UNIDAD, no por tipo de pieza',
  ranuras.filter(x => /^Short/.test(x)).length === 2, JSON.stringify(ranuras));
revisa('y una pieza de talla única no cuesta un toque',
  await pg.$eval('.fam-kit:first-of-type', k => [...k.querySelectorAll('.fam-pieza')]
    .some(p => /Par de calcetas/.test(p.textContent) && /Talla Universal/.test(p.textContent))));

// Se elige adulto y se llenan las tallas, una por una, como lo haría alguien.
await pg.click('.fam-kit:first-of-type [data-quien="Adulto"]');
for (let i = 0; i < 3; i++) {
  const abre = await pg.$('.fam-kit:first-of-type .fam-talla-sel.vacia');
  if (!abre) break;
  await abre.click();
  await pg.click('.fam-kit:first-of-type .fam-tallas .fam-talla');
}
revisa('quedan las tres tallas que el kit pedía',
  (await pg.$$('.fam-kit:first-of-type .fam-talla-sel.vacia')).length === 0);

await pg.fill('.fam-kit:first-of-type [data-knombre]', 'MAURICIO');
await pg.fill('.fam-kit:first-of-type [data-knumero]', '10');
await pg.click('.fam-kit:first-of-type [data-addkit]');
await pg.waitForSelector('#orderForm', { timeout: 5000 }).catch(() => {});
revisa('al agregar el kit se pasa a confirmar', (await pg.$('#orderForm')) !== null);
revisa('y ahí sí se piden los datos', (await pg.$('#customerName')) !== null);
revisa('con la opción de volver sin perder lo elegido', (await pg.$('#vitVolverPresente, #volver')) !== null);

// El candado del aviso de privacidad, antes de llenar nada más.
await pg.fill('#customerName', 'Ana Ávila');
await pg.fill('#customerPhone', '4771234567');
await pg.click('#submitOrder');
await pg.waitForTimeout(300);
revisa('sin autorizar el tratamiento de datos, el pedido NO se manda',
  llamadas.filter(c => c.n === 'v2_public_bundle_order').length === 0,
  JSON.stringify(llamadas.map(c => c.n)));

await pg.check('#orderDataConsent');
await pg.click('#submitOrder');
await pg.waitForTimeout(600);

const pedido = llamadas.find(c => c.n === 'v2_public_bundle_order');
revisa('con la autorización sí se manda', !!pedido, JSON.stringify(llamadas.map(c => c.n)));
if (pedido) {
  const p = pedido.p;
  revisa('lleva el kit y el tipo', p.bundle_id === 'k-completo' && p.tier === 'adult',
    `${p.bundle_id} / ${p.tier}`);
  // Cinco unidades: 1 jersey + 2 shorts + 2 calcetas.
  revisa('lleva una pieza por unidad, no una por tipo',
    Array.isArray(p.pieces) && p.pieces.length === 5, `piezas: ${p.pieces?.length}`);
  // v2_public_bundle_order resuelve por legacyProductId: mandarle el uuid
  // haría que no encontrara la pieza.
  revisa('cada pieza va con el id legacy que el RPC sabe resolver',
    p.pieces.every(x => /^pro/.test(String(x.legacyProductId || ''))),
    JSON.stringify(p.pieces.map(x => x.legacyProductId)));
  revisa('todas con su talla', p.pieces.every(x => x.size), JSON.stringify(p.pieces));
  // Los dos shorts van numerados: el proveedor corta dos, no uno.
  revisa('las dos unidades del mismo producto van en ranuras distintas',
    new Set(p.pieces.filter(x => x.legacyProductId === 'pro_mrr0dhtr_a6w6yr').map(x => x.slot)).size === 2,
    JSON.stringify(p.pieces.filter(x => x.legacyProductId === 'pro_mrr0dhtr_a6w6yr')));
  // Esto es lo que se perdía entre el pedido y el taller.
  revisa('el nombre estampado llega al club',
    p.personalization_name === 'MAURICIO', String(p.personalization_name));
  revisa('y el número también', p.number === '10', String(p.number));
  revisa('con el consentimiento y su versión',
    p.consent?.dataAccepted === true && !!p.consent?.privacyNoticeVersion, JSON.stringify(p.consent));
}
revisa('y se confirma con su folio',
  /PED-QA-1/.test(await pg.textContent('#content').catch(() => '')));

/* ===== 4. Comprar una pieza suelta ===== */
await pg.goto('http://127.0.0.1:4705/pedido/', { waitUntil:'networkidle' });
await pg.waitForSelector('.fam-prod', { timeout: 8000 });
llamadas.length = 0;

// Sin talla, no deja pasar: lo dice ahí mismo, no en una alerta.
await pg.click('.fam-prod:first-of-type [data-add]');
await pg.waitForTimeout(200);
revisa('una pieza sin talla no pasa, y el motivo se ve en la tarjeta',
  (await pg.$('#orderForm')) === null && (await pg.$('.fam-prod .fam-aviso')) !== null);

await pg.click('.fam-prod:first-of-type [data-abre]');
await pg.click('.fam-prod:first-of-type .fam-tallas .fam-talla');
/* Cuál producto es la primera tarjeta lo decide acomodaVitrina, que pone el
   kit y los jerseys primero. Se lee del DOM en vez de darlo por hecho: la
   primera versión de esta prueba supuso el jersey, y la vitrina tenía razón. */
const compradoId = await pg.$eval('.fam-prod:first-of-type [data-add]', b => b.dataset.add);
await pg.click('.fam-prod:first-of-type [data-add]');
await pg.waitForSelector('#orderForm', { timeout: 5000 });
await pg.fill('#customerName', 'Ana Ávila');
await pg.fill('#customerPhone', '4771234567');
await pg.check('#orderDataConsent');
await pg.click('#submitOrder');
await pg.waitForTimeout(600);

const suelta = llamadas.find(c => c.n === 'v2_public_order_enhanced');
revisa('la pieza suelta se manda', !!suelta, JSON.stringify(llamadas.map(c => c.n)));
if (suelta) {
  const it = suelta.p.items?.[0];
  revisa('se manda EL producto que se tocó, con su talla',
    it?.product_id === compradoId && !!it?.attributes?.talla,
    `se tocó ${compradoId} · se mandó ${JSON.stringify(it)}`);
  // La hoja de producción lee 'talla' y 'nombrePers': son esas llaves o nada.
  revisa('y con las llaves que la hoja de producción sabe leer',
    'talla' in (it?.attributes || {}) && 'nombrePers' in (it?.attributes || {}),
    JSON.stringify(it?.attributes));
}

/* ===== 5. Sin scroll horizontal a 390px ===== */
revisa('la tienda cabe en un teléfono',
  await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

revisa('sin errores de consola', errs.length === 0, errs.join('\n   '));

await nav.close(); srv.close();
console.log(fallos
  ? `Link público humo FAILED · ${fallos} de ${corridas}`
  : `Link público humo OK · ${corridas} revisiones, incluidas los dos shorts que son dos tallas y el nombre estampado que llega al club`);
process.exit(fallos ? 1 : 0);
