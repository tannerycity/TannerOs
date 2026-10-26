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
    { id:'p-black', name:'Jersey "Black Edition"', price:799, sizes:TALLAS, category:'jersey', ...foto('p-black'),
      photos: [1, 2, 3].map(n => ({ path: `org/products/p-black/foto-${n}.webp`, thumbPath: `org/products/p-black/foto-${n}-thumb.webp` })) },
    { id:'p-hoodie', name:'Hoodie / Chamarra', price:999, sizes:TALLAS, category:'outerwear' },
    { id:'p-short', name:'Short', price:350, sizes:TALLAS, category:'shorts' },
    { id:'p-calceta', name:'Par de calcetas', price:200, sizes:['Universal'], category:'socks' },
    { id:'p-gorra', name:'The Tanner Cap', price:550, sizes:['Universal'], category:'Gorra' }
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
      if(n==='v2_public_context')return{data:{organizationId:'org-qa',brand:'Club QA'},error:null};
      if(n==='v2_public_branding_by_org')return{data:{colors:{primary:'#184159',accent:'#9A9169'}},error:null};
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
  JSON.stringify(secciones) === '["kits","jersey","shorts","outerwear","socks","gorras"]', JSON.stringify(secciones));
const cats = await pg.$$eval('.st-cats a', a => a.map(x => x.textContent.trim()));
revisa('las categorías arriba, en español', JSON.stringify(cats) === '["Todo","Kits","Jerseys","Shorts","Chamarras","Calcetas","Gorras"]', JSON.stringify(cats));
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
const mock = sel => pg.$eval(`#stMockup [data-mockup="${sel}"]`, t => ({ txt: t.textContent, op: t.getAttribute('opacity'), fill: t.getAttribute('fill'), len: t.getAttribute('textLength') }));
revisa('la vista previa sale vacía, con "TU NOMBRE" tenue', (await mock('nombre')).txt === 'TU NOMBRE' && (await mock('nombre')).op === '0.4');
revisa('el Wet Blue sale con su diseño (cuerpo gris perla)', (await pg.getAttribute('#stMockup svg path', 'fill')) === '#E1E7EA', await pg.getAttribute('#stMockup svg path', 'fill'));
await pg.type('[data-campo="nombre"]', 'leo');
revisa('el nombre aparece mientras se escribe, en mayúsculas', (await mock('nombre')).txt === 'LEO' && (await mock('nombre')).op === '1', JSON.stringify(await mock('nombre')));
revisa('y el estampado en azul marino', (await mock('nombre')).fill === '#1F3A52');
await pg.fill('[data-campo="nombre"]', 'MAXIMILIANO JR');
revisa('un nombre largo se ajusta a la espalda', (await mock('nombre')).len === '104');
await pg.fill('[data-campo="nombre"]', 'LEO');
await pg.fill('[data-campo="numero"]', '7');
revisa('el número también', (await mock('numero')).txt === '7');
await pg.click('[data-cantidad="1"]');
if (process.env.QA_FOTO) await pg.locator('.st-bloque', { has: pg.locator('#stMockup') }).screenshot({ path: process.env.QA_FOTO });
revisa('la vista previa sobrevive al repintado', (await mock('nombre')).txt === 'LEO' && (await mock('numero')).txt === '7');
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
// Guía de tallas y una talla para todo el kit (25/10/2026).
revisa('[guía] junto a las tallas del kit sale "¿Qué talla es?"', await pg.isVisible('.st-incluye-cab [data-guia], [data-guia]'));
await pg.click('[data-guia] >> nth=0');
await pg.waitForSelector('#stGuia', { timeout: 3000 });
const guia = await pg.innerText('#stGuia');
if (process.env.SHOTS) await pg.screenshot({ path: `${process.env.SHOTS}/tienda-guia-tallas.png` });
revisa('[guía] con el kit de adulto enseña la tabla de adulto, cómo medir y el consejo', /Adulto/.test(guia) && /XXL/.test(guia) && /axila a axila/.test(guia) && /no tiene cambio/.test(guia) && !/años/.test(guia), guia.slice(0, 300));
await pg.click('#stGuia [data-guia-cerrar] >> nth=0');
revisa('[guía] se cierra', (await pg.$('#stGuia')) === null);
await pg.click('[data-kit-talla="M"]');
if (process.env.SHOTS) await pg.screenshot({ path: `${process.env.SHOTS}/tienda-kit-una-talla.png`, fullPage: true });
const conM = await pg.$$eval('.st-pieza .st-pieza-cab span', s => s.map(x => x.textContent.trim()));
revisa('[kit] una talla para todo: todas las piezas quedan en M y plegadas', conM.filter(t => t === 'Talla M').length === 3 && (await pg.$$('.st-pieza.plegada')).length === 3 && conM.filter(t => t === 'Talla Universal').length === 2 && (await pg.$$('[data-pieza-talla]')).length === 0, JSON.stringify(conM));
await pg.click('.st-pieza.plegada >> nth=0 >> [data-pieza-abre]');
revisa('[kit] "Cambiar" abre sólo esa pieza', (await pg.$$('.st-pieza.plegada')).length === 2 && (await pg.$$('[data-pieza-talla]')).length > 0);
for (let i = 0; i < 5; i++) {
  const b = await pg.$(`.st-pieza:nth-child(${i + 1}) [data-pieza-talla="M"]`);
  if (b) await b.click();
}
await pg.fill('[data-campo="nombre"]', 'MAURICIO');
await pg.fill('[data-campo="numero"]', '10');
revisa('el kit también enseña la vista previa', (await mock('nombre')).txt === 'MAURICIO' && (await mock('numero')).txt === '10');
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
// ¿Le agregas algo más? (25/10/2026)
const extras = await pg.$$eval('#stExtras [data-extra]', e => e.map(x => x.dataset.extra));
revisa('[extra] antes de pagar sugiere lo de la tienda que no va: gorra primero, jersey al final; nada de lo que ya va', JSON.stringify(extras) === '["p-gorra","p-hoodie","p-black"]', JSON.stringify(extras));
revisa('[extra] el jersey abre su ficha para la talla y el nombre', (await pg.getAttribute('#stExtras [data-extra="p-black"] a', 'href')) === '#/p/p-black');
if (process.env.SHOTS) await pg.screenshot({ path: `${process.env.SHOTS}/tienda-agrega-algo-mas.png`, fullPage: true });
await pg.click('#stExtras [data-extra="p-gorra"] [data-extra-agrega]');
revisa('[extra] un toque y va en el pedido', /The Tanner Cap/.test(await pg.innerText('#resumenCarrito')) && /\$5,448/.test(await pg.innerText('.carrito-total')) && !(await pg.$('#stExtras [data-extra="p-gorra"]')), await pg.innerText('.carrito-total'));
await pg.click('#stExtras [data-extra="p-hoodie"] [data-extra-agrega]');
revisa('[extra] lo que tiene tallas pide la talla ahí mismo', (await pg.$('#stExtras [data-extra="p-hoodie"] select.falta')) !== null && !/Hoodie/.test(await pg.innerText('#resumenCarrito')));
await pg.selectOption('#stExtras [data-extra="p-hoodie"] select', 'M');
await pg.click('#stExtras [data-extra="p-hoodie"] [data-extra-agrega]');
revisa('[extra] con la talla elegida, se agrega', /Hoodie/.test(await pg.innerText('#resumenCarrito')) && /\$6,447/.test(await pg.innerText('.carrito-total')), await pg.innerText('.carrito-total'));
await pg.fill('#customerName', 'Ana Ávila');
await pg.fill('#customerPhone', '4771234567');
await pg.click('#submitOrder');
await pg.waitForTimeout(300);
revisa('6. sin autorizar el tratamiento de datos, NO se manda', !llamadas.some(c => c.n === 'v2_public_cart_order'));
await pg.check('#orderDataConsent');
// Plazo para recoger (22/10/2026): sin aceptar los 30 días, tampoco se manda.
revisa('el pedido dice los 30 días para recoger', /30 días/.test(await pg.textContent('.st-plazo').catch(() => '')));
await pg.click('#submitOrder');
await pg.waitForTimeout(300);
revisa('sin aceptar el plazo para recoger, NO se manda', !llamadas.some(c => c.n === 'v2_public_cart_order'));
await pg.check('#orderPickup');
await pg.click('#submitOrder');
await pg.waitForTimeout(600);
const envios = llamadas.filter(c => c.n === 'v2_public_cart_order');
revisa('y el pedido guarda que aceptó el plazo', envios[0]?.p?.consent?.pickupAccepted === true && envios[0]?.p?.consent?.pickupDays === 30, JSON.stringify(envios[0]?.p?.consent));
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
if (process.env.SHOTS) await pg.screenshot({ path: `${process.env.SHOTS}/tienda-pago.png`, fullPage: true });
revisa('el pago dice que la transferencia no tiene comisión y se copian CLABE y referencia', /sin comisión/.test(final) && (await pg.$$('#content [data-copiar]')).length === 2, final.slice(0, 400));
revisa('y el carrito queda vacío', (await badge()) === '0');

/* ===== 7. Quitar renglones ===== */
await pg.goto(BASE + '/pedido/#/p/p-black');
await pg.waitForSelector('[data-talla="M"]');
// Varias fotos (14/10/2026): se deslizan, con puntitos, y no se pierde la que se veía al repintar.
revisa('[galería] con 3 fotos la ficha se desliza con 3 puntitos', (await pg.$$('.st-galeria-foto')).length === 3 && (await pg.$$('.st-puntos button')).length === 3);
await pg.click('.st-puntos button >> nth=2');
await pg.waitForTimeout(700);
revisa('[galería] tocar un puntito lleva a esa foto', (await pg.getAttribute('.st-puntos button >> nth=2', 'aria-current')) === 'true');
// Manga larga (14/10/2026): la vista previa le extiende la manga hasta el puño.
await pg.click('[data-manga="larga"]');
if (process.env.QA_FOTO) await pg.locator('.st-galeria').screenshot({ path: process.env.QA_FOTO.replace(/\.png$/, '-galeria.png') });
revisa('[manga] con manga larga la playera la enseña larga', (await pg.$('#stMockup [data-mockup="manga-larga"]')) !== null);
revisa('[galería] y la galería sigue en la foto 3 tras repintar', (await pg.getAttribute('.st-puntos button >> nth=2', 'aria-current')) === 'true');
await pg.click('[data-manga="corta"]');
revisa('[manga] y corta otra vez', (await pg.$('#stMockup [data-mockup="manga-larga"]')) === null);
await pg.click('[data-talla="M"]'); await pg.click('#stAgregar');
revisa('la Black Edition se ve negra', (await pg.getAttribute('#stMockup svg path', 'fill').catch(() => null)) === '#1F1A19');
await pg.goto(BASE + '/pedido/#/p/p-calceta');
await pg.waitForSelector('#stAgregar');
revisa('lo que no se personaliza no enseña playera', (await pg.$('#stMockup')) === null);
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

/* ===== Kit Dúo (14/10/2026): "2 jerseys, los que quieras, + short" ===== */
{
  const OFERTA2 = { recargoMangaLarga: 50, products: OFERTA.products.map(p => p.id === 'p-black' ? { ...p, priceKid: 599 } : p), bundles: [{ id:'k-duo', name:'Kit Dúo', priceAdult:1500, priceKid:1299, available:true, components:[
    { productId:'p-short', name:'Short', sizes:TALLAS, qty:1, pool:null },
    { productId:'p-jersey', name:'Jersey "Wet Blue" - Home Edition', sizes:TALLAS, qty:2, pool:['p-jersey','p-black'], poolName:'Jersey a elegir' }] }] };
  const p2 = await nav.newPage({ viewport:{ width:390, height:844 } });
  p2.on('pageerror', e => errs.push('duo: ' + e.message));
  await p2.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p2.route('**esm.sh/libphonenumber-js**', r => r.fulfill({ status:200, contentType:'text/javascript', body:'export function AsYouType(){return{input:v=>v}} export function getCountries(){return["MX"]} export function getCountryCallingCode(){return "52"} export function parsePhoneNumberFromString(v){return{isValid:()=>true,formatInternational:()=>v,number:v}}' }));
  await p2.route(/\/v2\/supabase-client\.js(\?.*)?$/, r => r.fulfill({ status:200, contentType:'text/javascript', body:`
    export function createClient(){return{
      auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}}},
      storage:{from:()=>({createSignedUrls:async(ps)=>({data:ps.map(p=>({path:p,signedUrl:'/qa-foto/x'})),error:null})})},
      rpc:async(n,p={})=>{
        if(n==='v2_public_offerings')return{data:${JSON.stringify(OFERTA2)},error:null};
        if(n==='v2_public_payment_info')return{data:${JSON.stringify(PAGO)},error:null};
        if(n==='v2_public_context')return{data:{organizationId:'org-qa',brand:'Club QA'},error:null};
        return {data:null,error:null};}};}` }));
  await p2.goto(BASE + '/pedido/#/k/k-duo');
  await p2.waitForSelector('.st-pieza', { timeout:5000 });
  revisa('[dúo] la ficha pide el short y 2 jerseys a elegir', (await p2.$$('.st-pieza')).length === 3 && (await p2.$$('.st-pieza.elige')).length === 2);
  revisa('[dúo] cada espacio enseña sólo las opciones del kit', JSON.stringify(await p2.$$eval('.st-pieza.elige >> nth=0', x => [...x[0].querySelectorAll('[data-pieza-elige]')].map(b => b.textContent))) === '["Wet Blue","Black"]');
  await p2.click('[data-tier="Niño"]');
  await p2.click('[data-ranura="p-short#0"] [data-pieza-talla="12"]');
  await p2.click('#stAgregar');
  revisa('[dúo] sin elegir el jersey no se agrega y dice qué falta', /Elige jersey a elegir/i.test(await p2.innerText('.st-motivo')), await p2.innerText('.st-motivo'));
  await p2.click('.st-pieza.elige >> nth=0 >> [data-pieza-elige="p-black"]');
  await p2.click('.st-pieza.elige >> nth=0 >> [data-pieza-elige="p-jersey"]');
  revisa('[dúo] elegido el jersey, salen sus tallas', (await p2.$$('[data-ranura="elige1#0"] [data-pieza-talla]')).length === 12 && /Black/.test(await p2.textContent('[data-ranura="elige1#0"] strong')));
  for (const r of ['elige1#0', 'elige1#1']) await p2.click(`[data-ranura="${r}"] [data-pieza-talla="12"]`);
  // Manga por jersey con cargo (14/10/2026).
  revisa('[manga] cada jersey del kit trae su manga, con "+$50" en larga', (await p2.$$('[data-ranura="elige1#0"] [data-pieza-manga]')).length === 2 && /Larga\s*\+\$50/.test(await p2.textContent('[data-ranura="elige1#0"] [data-pieza-manga="larga"]')) && (await p2.$('[data-ranura="p-short#0"] [data-pieza-manga]')) === null);
  await p2.click('[data-ranura="elige1#0"] [data-pieza-manga="larga"]');
  revisa('[manga] el precio del kit sube $50 y lo dice', /\$1,349(?!\.\d)/.test(await p2.textContent('#stAgregar')) && /1 manga larga/.test(await p2.textContent('.st-pdp-precio')), await p2.textContent('#stAgregar'));
  revisa('[manga] la manga general del kit ya no sale', (await p2.$('.st-manga-tit')) === null);
  // La espalda de cada jersey elegido, con su diseño y su manga (14/10/2026).
  const espaldas = await p2.$$eval('#stMockup .st-mockup-uno', xs => xs.map(x => [x.querySelector('span').firstChild.textContent, !!x.querySelector('[data-mockup="manga-larga"]')]));
  revisa('[vista] una playera por jersey elegido: Black de manga larga y Wet Blue corta', JSON.stringify(espaldas) === '[["Black",true],["Wet Blue",false]]', JSON.stringify(espaldas));
  revisa('[vista] cada una con su diseño (Black negro)', (await p2.getAttribute('#stMockup .st-mockup-uno >> nth=0 >> svg path >> nth=1', 'fill').catch(() => '')) === '#1F1A19' || /#1F1A19/.test(await p2.innerHTML('#stMockup .st-mockup-uno >> nth=0')));
  await p2.fill('[data-campo="nombre"]', 'MICHEL');
  revisa('[vista] el nombre se escribe en las dos', (await p2.$$eval('#stMockup [data-mockup="nombre"]', xs => xs.map(x => x.textContent))).join() === 'MICHEL,MICHEL');
  if (process.env.QA_FOTO) await p2.locator('#stMockup').screenshot({ path: process.env.QA_FOTO.replace(/\.png$/, '-espaldas.png') });
  if (process.env.QA_FOTO) await p2.locator('.st-incluye').screenshot({ path: process.env.QA_FOTO.replace(/\.png$/, '-duo.png') });
  await p2.click('#stAgregar');
  await p2.waitForTimeout(300);
  revisa('[dúo] se agrega al pedido', (await p2.$eval('#stCarritoN', b => b.hidden ? '0' : b.textContent)) === '1');
  await p2.goto(BASE + '/pedido/#/pedido');
  await p2.waitForSelector('#resumenCarrito', { timeout:4000 }).catch(() => {});
  const resumenDuo = (await p2.textContent('#resumenCarrito').catch(() => '')).replace(/\s+/g, ' ');
  revisa('[dúo] con el Black, el Wet Blue y el short, a precio Niño', /Kit Dúo/.test(resumenDuo) && /1,349/.test(resumenDuo) && /Black 12 manga larga/.test(resumenDuo) && /Black/.test(resumenDuo) && /Wet Blue/.test(resumenDuo) && /Short/.test(resumenDuo), resumenDuo);
  // Precio de niño (14/10/2026): el Black cuesta $599 en tallas de niño.
  await p2.goto(BASE + '/pedido/#/c/jersey');
  await p2.waitForSelector('[data-prod="p-black"]', { timeout:4000 });
  revisa('[niño] la tarjeta dice "Desde $599"', /Desde\s*\$599/.test(await p2.textContent('[data-prod="p-black"] .st-precio')), await p2.textContent('[data-prod="p-black"] .st-precio'));
  await p2.goto(BASE + '/pedido/#/p/p-black');
  await p2.waitForSelector('[data-talla="12"]', { timeout:4000 });
  revisa('[niño] la ficha dice los dos precios', /Niño \(6 a 16\) \$599(?!\.\d) · Adulto \$799(?!\.\d)/.test(await p2.textContent('.st-precios-nino')));
  await p2.click('[data-talla="12"]');
  revisa('[niño] talla 12 cobra $599', /\$599(?!\.\d)/.test(await p2.textContent('#stAgregar')) && /\$599/.test(await p2.textContent('.st-pdp-precio')));
  await p2.click('[data-talla="M"]');
  revisa('[niño] talla M cobra $799', /\$799(?!\.\d)/.test(await p2.textContent('#stAgregar')));
  await p2.close();
}

/* ===== Varias tallas a la vez y "Agregar otro" (18/10/2026) =====
   "Se meten a pedir la Japanese y dicen, yo quiero una chica y una grande." */
{
  const p3 = await nav.newPage({ viewport:{ width:390, height:844 } });
  p3.on('pageerror', e => errs.push('varias: ' + e.message));
  await p3.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p3.route('**esm.sh/libphonenumber-js**', r => r.fulfill({ status:200, contentType:'text/javascript', body:'export function AsYouType(){return{input:v=>v}} export function getCountries(){return["MX"]} export function getCountryCallingCode(){return "52"} export function parsePhoneNumberFromString(v){return{isValid:()=>true,formatInternational:()=>v,number:v}}' }));
  await p3.route(/\/v2\/supabase-client\.js(\?.*)?$/, r => r.fulfill({ status:200, contentType:'text/javascript', body:`
    export function createClient(){return{
      auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}}},
      storage:{from:()=>({createSignedUrls:async(ps)=>({data:ps.map(p=>({path:p,signedUrl:'/qa-foto/x'})),error:null})})},
      rpc:async(n,p={})=>{
        if(n==='v2_public_offerings')return{data:${JSON.stringify(OFERTA)},error:null};
        if(n==='v2_public_payment_info')return{data:${JSON.stringify(PAGO)},error:null};
        if(n==='v2_public_context')return{data:{organizationId:'org-qa',brand:'Club QA'},error:null};
        return {data:null,error:null};}};}` }));
  const n3 = () => p3.$eval('#stCarritoN', b => b.hidden ? '0' : b.textContent);
  await p3.goto(BASE + '/pedido/#/p/p-short');
  await p3.waitForSelector('[data-talla="S"]', { timeout:5000 });
  revisa('[varias] una pieza sin estampado dice "Elige una o varias" y no pide cantidad aparte', /Elige una o varias/.test(await p3.textContent('#stBloqueTalla')) && (await p3.$('[data-cantidad]')) === null);
  await p3.click('#stAgregar');
  revisa('[varias] sin talla no se agrega', /Elige al menos una talla/.test(await p3.innerText('.st-motivo')) && (await n3()) === '0');
  await p3.click('[data-talla="S"]'); await p3.click('[data-talla="L"]');
  await p3.click('[data-varia="L"] [data-varia-cant="1"]');
  if (process.env.QA_FOTO_VARIAS) await p3.locator('#stBloqueTalla').screenshot({ path: process.env.QA_FOTO_VARIAS });
  revisa('[varias] dos tallas marcadas, una fila por talla', (await p3.$$('.st-varias li')).length === 2 && (await p3.getAttribute('[data-talla="S"]', 'aria-pressed')) === 'true');
  revisa('[varias] la L dice ×2 y el botón suma 3 piezas', /×2/.test(await p3.textContent('[data-talla="L"]')) && /Agregar 3 piezas · \$1,050(?!\.\d)/.test(await p3.innerText('#stAgregar')), await p3.innerText('#stAgregar'));
  await p3.click('[data-talla="S"]');
  revisa('[varias] tocar otra vez una talla la quita', (await p3.$$('.st-varias li')).length === 1 && /Agregar 2 piezas · \$700(?!\.\d)/.test(await p3.innerText('#stAgregar')));
  await p3.click('[data-talla="S"]');
  await p3.click('#stAgregar');
  revisa('[varias] se agregan las 3 piezas de un toque', (await n3()) === '3', await n3());
  revisa('[otro] queda dicho arriba qué se agregó', /3 piezas · S, 2 L/.test(await p3.textContent('.st-recien')), await p3.textContent('.st-recien').catch(() => ''));
  revisa('[varias] y las tallas quedan limpias para otra', (await p3.$$('.st-varias li')).length === 0);
  await p3.goto(BASE + '/pedido/#/pedido');
  await p3.waitForSelector('#resumenCarrito', { timeout:4000 }).catch(() => {});
  const res3 = (await p3.textContent('#resumenCarrito').catch(() => '')).replace(/\s+/g, ' ');
  revisa('[varias] el pedido trae un renglón por talla', /Short/.test(res3) && /\$1,050/.test(res3), res3);
  // "Agregar otro" después de un jersey personalizado: el del hermano.
  await p3.goto(BASE + '/pedido/#/p/p-jersey');
  await p3.waitForSelector('[data-talla="10"]', { timeout:4000 });
  revisa('[varias] el jersey personalizable sigue con una talla a la vez', (await p3.$('[data-cantidad]')) !== null && (await p3.$('.st-varias')) === null);
  await p3.click('[data-talla="10"]');
  await p3.fill('[data-campo="nombre"]', 'LEO'); await p3.fill('[data-campo="numero"]', '7');
  await p3.click('#stAgregar');
  revisa('[otro] el jersey agregado se dice con nombre y talla', /LEO 7 · talla 10/.test(await p3.textContent('.st-recien')), await p3.textContent('.st-recien').catch(() => ''));
  if (process.env.QA_FOTO_VARIAS) await p3.locator('.st-recien').screenshot({ path: process.env.QA_FOTO_VARIAS.replace(/\.png$/, '-otro.png') });
  await p3.click('[data-otro]');
  revisa('[otro] "Agregar otro" deja la ficha lista para el siguiente', (await p3.$('.st-recien')) === null && (await p3.inputValue('[data-campo="nombre"]')) === '');
  revisa('[varias] nada se sale a 390px', await p3.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await p3.close();
}

revisa('sin errores de consola', errs.length === 0, errs.join('\n   '));
await nav.close(); srv.close();
console.log(fallos
  ? `Link público humo FAILED · ${fallos} de ${corridas}`
  : `Link público humo OK · ${corridas} revisiones: tienda con categorías y fotos, fichas de pieza y de kit, un solo folio y nada se sale a 390px`);
process.exit(fallos ? 1 : 0);
