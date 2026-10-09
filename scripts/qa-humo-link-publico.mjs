/* LA TIENDA TANNER (el link que se pega en WhatsApp), probada como la usa un
 * desconocido en su teléfono.
 *
 * Es la única tienda del club que le habla a alguien sin cuenta y sin sesión.
 * Si aquí algo no se puede tocar, la persona cierra la pestaña y el club nunca
 * se entera.
 *
 * Lo que se protege (rediseño de 09/10/2026: tienda en línea con PLP y PDP):
 *
 *   1. La tienda se ve ANTES de pedir datos: kits primero, categorías arriba,
 *      tarjetas con foto (la miniatura) y el escudo donde no hay foto. Un kit
 *      bloqueado no se ofrece.
 *   2. Las categorías filtran: "Jerseys" sólo enseña jerseys.
 *   3. La ficha de una pieza pide la foto completa, exige talla (lo dice ahí
 *      mismo), acepta nombre, número y cantidad, y agrega al pedido.
 *   4. La ficha de un kit pide para quién es, una talla por UNIDAD (dos shorts
 *      son dos tallas) y señala la pieza que falta.
 *   5. Todo sale en UNA llamada con el formato del portal: el kit con sus
 *      piezas y su nombre/número, la pieza con su cantidad y talla.
 *   6. Sin autorizar el tratamiento de datos no se manda nada.
 *   7. Quitar un renglón no borra lo escrito; el carrito vacío regresa.
 *   8. Nada se sale de la pantalla a 390px: ni la tienda, ni las fichas, ni el
 *      pedido. (La ficha del kit se desbordaba con la fila de tallas.)
 *
 * Se espía la llamada RPC en vez de mirar pixeles: lo que importa no es cómo
 * se ve el botón, es QUÉ se le manda al club cuando se toca.
 */
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const T = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
            '.svg':'image/svg+xml','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2' };
const FOTO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#2c6fb3"/></svg>';
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p.startsWith('/qa-foto/')) { r.writeHead(200, { 'content-type':'image/svg+xml' }); r.end(FOTO); return; }
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('no'); return; }
  r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
  r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}`;

const TALLAS = ['6','8','10','12','14','16','XS','S','M','L','XL','XXL'];
const foto = id => ({ photoPath: `org/products/${id}/foto.webp`, photoThumbPath: `org/products/${id}/foto-thumb.webp`, photoBucket: 'tanneros-private' });
const OFERTA = {
  products: [
    { id:'p-jersey', name:'Jersey "Wet Blue" - Home Edition', price:699, sizes:TALLAS, category:'jersey', ...foto('p-jersey') },
    { id:'p-black', name:'Jersey "Black Edition"', price:799, sizes:TALLAS, category:'jersey', ...foto('p-black') },
    { id:'p-hoodie', name:'Hoodie / Chamarra', price:999, sizes:TALLAS, category:'outerwear' },
    { id:'p-short', name:'Short', price:350, sizes:TALLAS, category:'shorts' },
    { id:'p-calceta', name:'Par de calcetas', price:200, sizes:['Universal'], category:'socks' }
  ],
  bundles: [
    { id:'k-completo', name:'Kit Tanner - Completo', priceAdult:3500, priceKid:2350, available:true, components:[
      { productId:'p-jersey', name:'Jersey "Wet Blue" - Home Edition', sizes:TALLAS, qty:1, ...foto('p-jersey') },
      { productId:'p-short', name:'Short', sizes:TALLAS, qty:2 },
      { productId:'p-calceta', name:'Par de calcetas', sizes:['Universal'], qty:2 } ] },
    { id:'k-game', name:'Kit Game', priceAdult:1500, priceKid:1299, available:true, components:[
      { productId:'p-jersey', name:'Jersey "Wet Blue" - Home Edition', sizes:TALLAS, qty:1, ...foto('p-jersey') },
      { productId:'p-calceta', name:'Par de calcetas', sizes:['Universal'], qty:1 } ] },
    // Un kit bloqueado, para comprobar que NO se ofrece.
    { id:'k-roto', name:'Kit Roto', priceAdult:999, priceKid:0, available:false, blockedReason:'Incluye una prenda fuera del catálogo V2', components:[] }
  ]
};
const PAGO = { transfer:{ bank:'Banregio / Hey Banco', clabe:'167210000079567650', holder:'Proyecto Leyenda SA de CV' },
  methods:['Transferencia','Efectivo','Tarjeta'], delivery:'3 a 4 semanas', whatsapp:'524792651338' };

const llamadas = [], firmas = [];
const nav = await chromium.launch({ executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
const pg = await nav.newPage({ viewport:{ width:390, height:844 } });
const errs = [];
pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
pg.on('console', m => { if (m.type()==='error' && !/favicon/.test(m.text())) errs.push('console: ' + m.text()); });
await pg.exposeFunction('__anota', (n, p) => { llamadas.push({ n, p }); });
await pg.exposeFunction('__firma', ps => { firmas.push(...ps); });
await pg.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
await pg.route(/\/v2\/supabase-client\.js(\?.*)?$/, r => r.fulfill({ status:200, contentType:'text/javascript', body:`
  export function createClient(){return{
    auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}}},
    storage:{from:()=>({createSignedUrls:async(ps)=>{await window.__firma(ps);return{data:ps.map(p=>({path:p,signedUrl:'/qa-foto/'+encodeURIComponent(p)})),error:null};}})},
    rpc:async(n,p={})=>{
      await window.__anota(n, JSON.parse(JSON.stringify(p)));
      if(n==='v2_public_offerings')return{data:${JSON.stringify(OFERTA)},error:null};
      if(n==='v2_public_payment_info')return{data:${JSON.stringify(PAGO)},error:null};
      if(n==='v2_public_cart_order')return{data:{id:'o-qa',folio:'PED-QA-1',total:3500+699*2},error:null};
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
const cabe = async donde => revisa(`${donde}: nada se sale de la pantalla a 390px`,
  await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  String(await pg.evaluate(() => document.documentElement.scrollWidth)));
const badge = () => pg.$eval('#stCarritoN', b => b.hidden ? '0' : b.textContent);

/* ===== 1. La tienda ===== */
await pg.goto(BASE + '/pedido/', { waitUntil:'networkidle' });
await pg.waitForSelector('.st-card', { timeout: 8000 });
const secciones = await pg.$$eval('.st-seccion', s => s.map(x => x.dataset.seccion));
revisa('los kits van primero y luego las categorías en su orden',
  JSON.stringify(secciones) === '["kits","jersey","shorts","outerwear","socks"]', JSON.stringify(secciones));
const cats = await pg.$$eval('.st-cats a', a => a.map(x => x.textContent.trim()));
revisa('las categorías arriba, en español', JSON.stringify(cats) === '["Todo","Kits","Jerseys","Shorts","Chamarras","Calcetas"]', JSON.stringify(cats));
const kits = await pg.$$eval('.st-card.kit strong', s => s.map(x => x.textContent));
revisa('un kit bloqueado NO se ofrece', kits.length === 2 && !kits.includes('Kit Roto'), JSON.stringify(kits));
revisa('el kit anuncia "Desde" su precio de niño', /Desde\s*\$2,350/.test(await pg.innerText('[data-kit="k-completo"]')));
revisa('NO se piden datos antes de elegir', (await pg.$('#customerName')) === null);
await pg.waitForFunction(() => document.querySelector('[data-prod="p-jersey"] img')?.getAttribute('src'), null, { timeout: 4000 }).catch(() => {});
revisa('la tarjeta enseña la foto del producto', !!(await pg.getAttribute('[data-prod="p-jersey"] img', 'src').catch(() => null)));
revisa('las tarjetas piden la miniatura, no la foto completa', firmas.length > 0 && firmas.every(f => /-thumb\.webp$/.test(f)), JSON.stringify(firmas));
revisa('un producto sin foto sale con el escudo, no con un hueco', (await pg.$('[data-prod="p-hoodie"] .st-media.vacia')) !== null);
revisa('dice el tiempo de entrega', /3 a 4 semanas/.test(await pg.innerText('.st-hero')));
revisa('ofrece entrar a quien ya es familia', (await pg.getAttribute('.ya-familia', 'href')) === '/familias/?tab=tienda');
await cabe('la tienda');

/* ===== 2. Una categoría ===== */
await pg.click('.st-cats a[data-cat="jersey"]');
await pg.waitForFunction(() => location.hash === '#/c/jersey');
// El hash cambia antes de que la categoría se pinte: se espera a que la pestaña
// activa ya sea "Jerseys" (se pinta en el mismo golpe que las tarjetas).
await pg.waitForSelector('.st-cats a.activa[data-cat="jersey"]', { timeout: 4000 });
const soloJerseys = await pg.$$eval('.st-card', c => c.map(x => x.dataset.prod || x.dataset.kit));
revisa('"Jerseys" sólo enseña jerseys', JSON.stringify([...soloJerseys].sort()) === '["p-black","p-jersey"]', JSON.stringify(soloJerseys));
revisa('y su pestaña queda marcada', (await pg.getAttribute('.st-cats a[data-cat="jersey"]', 'aria-current')) === 'page');

/* ===== 3. La ficha de una pieza ===== */
firmas.length = 0;
await pg.click('[data-prod="p-jersey"]');
await pg.waitForSelector('.st-pdp', { timeout: 4000 });
await pg.waitForTimeout(200);
revisa('la ficha pide la foto completa', firmas.includes('org/products/p-jersey/foto.webp'), JSON.stringify(firmas));
revisa('las tallas van en Niño y Adulto', JSON.stringify(await pg.$$eval('.st-grupo', g => g.map(x => x.textContent))) === '["Niño","Adulto"]');
await pg.click('#stAgregar');
revisa('sin talla no se agrega, y se dice ahí mismo', /Elige la talla/.test(await pg.innerText('.st-motivo')) && (await badge()) === '0');
revisa('y la sección de talla se marca', (await pg.$('#stBloqueTalla.falta')) !== null);
await pg.click('[data-talla="10"]');
revisa('la talla elegida queda marcada', (await pg.getAttribute('[data-talla="10"]', 'aria-pressed')) === 'true');
await pg.fill('[data-campo="nombre"]', 'LEO');
await pg.fill('[data-campo="numero"]', '7');
await pg.click('[data-cantidad="1"]');
revisa('la cantidad sube y el botón dice el total', /\$1,398/.test(await pg.innerText('#stAgregar')), await pg.innerText('#stAgregar'));
await pg.click('#stAgregar');
revisa('agregado: el carrito de arriba cuenta 2', (await badge()) === '2', await badge());
revisa('y avisa con "Ver pedido"', await pg.isVisible('#stAviso a[href="#/pedido"]'));
await cabe('la ficha de una pieza');

/* ===== 4. La ficha de un kit ===== */
await pg.goto(BASE + '/pedido/#/k/k-completo');
await pg.waitForSelector('.st-incluye', { timeout: 4000 });
const piezas = await pg.$$eval('.st-pieza strong', s => s.map(x => x.textContent));
revisa('el kit pide una talla por UNIDAD: dos shorts son dos', piezas.filter(x => /^Short/.test(x)).length === 2, JSON.stringify(piezas));
revisa('la pieza de talla única no pide nada', (await pg.$$('.st-pieza')).length === 5 && /Talla Universal/.test(await pg.innerText('.st-incluye')));
await pg.click('#stAgregar');
revisa('sin decir para quién es, no se agrega', /adulto o para niño/.test(await pg.innerText('.st-motivo')), await pg.innerText('.st-motivo'));
await pg.click('[data-tier="Adulto"]');
revisa('el precio cambia al de adulto', /\$3,500/.test(await pg.innerText('.st-pdp-precio')));
await pg.click('#stAgregar');
revisa('falta una talla: se marca esa pieza', (await pg.$('.st-pieza.falta')) !== null && /Elige la talla de/.test(await pg.innerText('.st-motivo')));
for (let i = 0; i < 5; i++) {
  const b = await pg.$(`.st-pieza:nth-child(${i + 1}) [data-pieza-talla="M"]`);
  if (b) await b.click();
}
await pg.fill('[data-campo="nombre"]', 'MAURICIO');
await pg.fill('[data-campo="numero"]', '10');
await cabe('la ficha del kit');
await pg.click('#stAgregar');
revisa('el kit completo se agrega', (await badge()) === '3', await badge());

/* ===== 5. El pedido: un solo envío ===== */
await pg.goto(BASE + '/pedido/#/');
await pg.waitForSelector('#carritoBar', { timeout: 4000 });
revisa('en la tienda, la barra dice el total', /\$4,898/.test(await pg.innerText('#carritoBar')), await pg.innerText('#carritoBar'));
await pg.click('#verCarrito');
await pg.waitForSelector('#orderForm', { timeout: 5000 });
const renglones = await pg.$$eval('#resumenCarrito .fam-mov', e => e.length);
revisa('el pedido trae los dos renglones', renglones === 2, String(renglones));
await cabe('el pedido');
await pg.fill('#customerName', 'Ana Ávila');
await pg.fill('#customerPhone', '4771234567');
await pg.click('#submitOrder');
await pg.waitForTimeout(300);
revisa('6. sin autorizar el tratamiento de datos, NO se manda', !llamadas.some(c => c.n === 'v2_public_cart_order'));
await pg.check('#orderDataConsent');
await pg.click('#submitOrder');
await pg.waitForTimeout(600);
const envios = llamadas.filter(c => c.n === 'v2_public_cart_order');
revisa('todo va en UNA llamada', envios.length === 1, JSON.stringify(llamadas.map(c => c.n)));
const items = envios[0]?.p?.items || [];
const kit = items.find(x => x.kind === 'bundle'), pieza = items.find(x => x.kind === 'product');
revisa('el kit va con su tipo y sus 5 piezas con talla', kit?.bundleId === 'k-completo' && kit?.tier === 'Adulto'
  && kit?.pieces?.length === 5 && kit.pieces.every(p => p.productId && p.talla), JSON.stringify(kit));
revisa('los dos shorts van como dos piezas', kit?.pieces?.filter(p => p.productId === 'p-short').length === 2);
revisa('con el nombre y número del kit', kit?.personalizationName === 'MAURICIO' && kit?.number === '10', JSON.stringify(kit && [kit.personalizationName, kit.number]));
revisa('la pieza va con cantidad, talla, nombre y número', pieza?.productId === 'p-jersey' && pieza?.quantity === 2
  && pieza?.talla === '10' && pieza?.personalizationName === 'LEO' && pieza?.number === '7', JSON.stringify(pieza));
revisa('con el consentimiento y su versión', envios[0]?.p?.consent?.dataAccepted === true && !!envios[0]?.p?.consent?.privacyNoticeVersion);
const final = await pg.textContent('#content').catch(() => '');
revisa('se confirma con su folio y cómo pagar', /PED-QA-1/.test(final) && /167210000079567650/.test(final));
revisa('y el carrito queda vacío', (await badge()) === '0');

/* ===== 7. Quitar renglones ===== */
await pg.goto(BASE + '/pedido/#/p/p-black');
await pg.waitForSelector('[data-talla="M"]');
await pg.click('[data-talla="M"]'); await pg.click('#stAgregar');
await pg.goto(BASE + '/pedido/#/p/p-calceta');
await pg.waitForSelector('#stAgregar');
revisa('la pieza de talla única no pide talla', /Talla Universal/.test(await pg.innerText('.st-pdp')));
await pg.click('#stAgregar');
await pg.goto(BASE + '/pedido/#/pedido');
await pg.waitForSelector('#orderForm', { timeout: 5000 });
await pg.fill('#customerName', 'Ana Ávila');
await pg.click('#resumenCarrito [data-quita]');
revisa('quitar un renglón deja el otro', (await pg.$$('#resumenCarrito .fam-mov')).length === 1);
revisa('y no borra lo que ya se escribió', (await pg.inputValue('#customerName')) === 'Ana Ávila');
await pg.click('#resumenCarrito [data-quita]');
await pg.waitForTimeout(300);
revisa('con el carrito vacío se regresa a la tienda', (await pg.$('#orderForm')) === null && (await pg.$('.st-card')) !== null);

revisa('sin errores de consola', errs.length === 0, errs.join('\n   '));
await nav.close(); srv.close();
console.log(fallos
  ? `Link público humo FAILED · ${fallos} de ${corridas}`
  : `Link público humo OK · ${corridas} revisiones: tienda con categorías y fotos, fichas de pieza y de kit, un solo folio y nada se sale a 390px`);
process.exit(fallos ? 1 : 0);
