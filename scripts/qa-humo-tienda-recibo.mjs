/* El recibo Tanner de la tienda (29/10/2026).
 *
 * Presidencia: "que en esta pantalla tengas la opción de descargar la imagen
 * del pedido o que haya alguna forma de que puedan volver a entrar... que se
 * sienta Tanner". Lo que se protege:
 *   1. Al pedir sale el recibo con escudo, folio en boleto, total y lo que
 *      pidió; cómo pagar sigue igual (CLABE, referencia, WhatsApp del club).
 *   2. "Guardar imagen" arma un PNG real con la marca (navy, escudo, folio).
 *   3. "Mandármelo por WhatsApp" lleva folio, total, CLABE y la liga del recibo.
 *   4. El recibo queda en "Mis pedidos" (cabecera) y se vuelve a abrir
 *      después de recargar, sin teléfono ni correo guardados.
 *   5. Un folio que no está en este celular lo dice y manda al portal.
 *   Todo a 390px. Hermética: nada sale de 127.0.0.1.
 */
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const T = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
            '.svg':'image/svg+xml','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  if (p === '/pedidos/index.html') p = '/v2/pedidos/index.html';
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('no'); return; }
  r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
  r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}`;


const PAGO = { transfer:{ bank:'Banregio / Hey Banco', clabe:'167210000079567650', holder:'Proyecto Leyenda SA de CV' }, methods:['Transferencia','Efectivo'], whatsapp:'524792651338' };
const OFERTA = { products:[{ id:'p-calceta', name:'Par de calcetas', price:200, sizes:['Universal'], product_type:'socks' }], bundles:[] };
const CLIENTE = () => `
  window.__rpc=[]; window.__abiertas=[]; window.open=(u)=>{window.__abiertas.push(u);return null;};
  export function createClient(){return{
    auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}}},
    storage:{from:()=>({createSignedUrls:async()=>({data:[],error:null})})},
    functions:{invoke:async()=>({data:null,error:null})},
    rpc:async(n,p={})=>{
      window.__rpc.push({n,p:JSON.parse(JSON.stringify(p))});
      const ok=d=>({data:d,error:null});
      if(n==='v2_public_offerings')return ok(${JSON.stringify(OFERTA)});
      if(n==='v2_public_payment_info')return ok(${JSON.stringify(PAGO)});
      if(n==='v2_public_context')return ok({organizationId:'o1',brand:'Tannery City F.C.'});
      if(n==='v2_public_cart_order')return ok({id:'o-web',folio:'PED-2026-00014',total:200,items:1});
      return ok(null);}};}`;

const nav = await chromium.launch({ executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
let fallos = 0, corridas = 0;
const revisa = (nombre, ok, detalle) => { corridas++; if (!ok) { fallos++; console.error(` - ${nombre}${detalle ? `\n   ${detalle}` : ''}`); } };
const cabe = pg => pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function abre(ruta, { pagoFalla = false } = {}) {
  const pg = await nav.newPage({ viewport:{ width:390, height:844 } });
  const errs = [];
  pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await pg.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await pg.route('**esm.sh/libphonenumber-js**', r => r.fulfill({ status:200, contentType:'text/javascript', body:`
    export function AsYouType(){return{input:v=>v}}
    export function getCountries(){return['MX','US']}
    export function getCountryCallingCode(c){return c==='MX'?'52':'1'}
    export function parsePhoneNumberFromString(v){const d=String(v).replace(/\\D/g,'');
      return{isValid:()=>d.length>=10,formatInternational:()=>'+52 '+d,number:'+52'+d};}` }));
  await pg.route(/\/v2\/supabase-client\.js(\?.*)?$/, r => r.fulfill({ status:200, contentType:'text/javascript', body:CLIENTE() }));
  await pg.route(/\/v2\/shell\.js(\?.*)?$/, r => r.fulfill({ status:200, contentType:'text/javascript', body:SHELL }));
  await pg.goto(BASE + ruta, { waitUntil:'networkidle' });
  return { pg, errs };
}

async function pideCalcetas(pg) {
  // La tienda (09/10/2026): de la tarjeta a la ficha, agregar y abrir el pedido.
  await pg.waitForSelector('.st-card[data-prod]', { timeout:8000 });
  await pg.click('.st-card[data-prod]');
  await pg.waitForSelector('#stAgregar', { timeout:4000 });
  await pg.click('#stAgregar');
  await pg.click('#stCarrito');
  await pg.click('#stMini [data-mini-pagar]');
  await pg.waitForSelector('#orderForm', { timeout:5000 });
  await pg.fill('#tannerNombre', 'Leo Ávila');
  await pg.fill('#customerName', 'Ana Ávila');
  await pg.fill('#customerPhone', '4771234567');
  await pg.check('#orderDataConsent');
  await pg.check('#orderPickup').catch(() => {});
  await pg.click('#submitOrder');
}

const ctx = await nav.newContext({ viewport:{ width:390, height:844 }, acceptDownloads:true });
nav.newPage = opts => ctx.newPage(opts);
{
  const { pg, errs } = await abre('/pedido/');
  revisa('0. sin pedidos guardados no sale "Mis pedidos"', await pg.evaluate(() => document.getElementById('stMisPedidos').hidden));
  await pideCalcetas(pg);
  await pg.waitForSelector('.st-recibo', { timeout:6000 });
  const t = (await pg.textContent('#content')).replace(/\s+/g, ' ');
  if (process.env.SHOTS) await pg.screenshot({ path:`${process.env.SHOTS}/tienda-recibo.png`, fullPage:true });
  revisa('1. recibo con escudo, folio en boleto, total y gracias', !!(await pg.$('.st-recibo-hero .st-recibo-escudo')) && /PED-2026-00014/.test(await pg.textContent('.st-boleto')) && /Total: \$200/.test(t) && /Gracias por vestir los colores, Ana/.test(t), t.slice(0, 300));
  revisa('1. dice lo que pidió', /Par de calcetas/.test(await pg.textContent('.st-recibo-lineas')) && /Talla Universal/.test(await pg.textContent('.st-recibo-lineas')));
  revisa('1. cómo pagar sigue: CLABE, referencia y WhatsApp del club', /167210000079567650/.test(t) && /Referencia/.test(t) && !!(await pg.$('a.pago-wa[href*="524792651338"]')));
  revisa('1. el lema del club al pie', /Curtimos campeones del mundo/i.test(await pg.textContent('.st-lema')) && /#WeAreTanners/.test(await pg.textContent('.st-lema')));
  revisa('1. cabe a 390px', await cabe(pg));
  const descarga = pg.waitForEvent('download', { timeout:8000 });
  await pg.evaluate(() => { navigator.canShare = () => false; });
  await pg.click('[data-recibo-imagen]');
  const d = await descarga, ruta = await d.path(), png = (await import('node:fs')).readFileSync(ruta);
  const ancho = png.readUInt32BE(16), alto = png.readUInt32BE(20);
  revisa('2. "Guardar imagen" baja un PNG con la marca', d.suggestedFilename() === 'pedido-ped-2026-00014.png' && png.slice(1, 4).toString() === 'PNG' && ancho === 1080 && alto >= 1350 && png.length > 30000, `${d.suggestedFilename()} ${ancho}x${alto} ${png.length}`);
  await pg.click('[data-recibo-whats]');
  const wa = decodeURIComponent((await pg.evaluate(() => window.__abiertas)).find(u => /wa\.me\/\?text=/.test(u)) || '');
  revisa('3. "Mandármelo por WhatsApp" lleva folio, total, CLABE y la liga del recibo', /PED-2026-00014/.test(wa) && /\$200/.test(wa) && /167210000079567650/.test(wa) && /#\/recibo\/PED-2026-00014/.test(wa), wa);
  revisa('4. "Mis pedidos" aparece en la cabecera', !(await pg.evaluate(() => document.getElementById('stMisPedidos').hidden)));
  const guardado = await pg.evaluate(() => Object.entries(localStorage).find(([k]) => k.startsWith('tiendaMisPedidos:'))?.[1] || '');
  revisa('4. se guarda en el teléfono sin teléfono ni correo', /PED-2026-00014/.test(guardado) && !/4771234567|@/.test(guardado), guardado.slice(0, 200));
  await pg.reload({ waitUntil:'networkidle' });
  await pg.click('#stMisPedidos');
  await pg.waitForSelector('.st-mis-lista a', { timeout:4000 });
  if (process.env.SHOTS) await pg.screenshot({ path:`${process.env.SHOTS}/tienda-mis-pedidos.png`, fullPage:true });
  await pg.click('.st-mis-lista a');
  await pg.waitForSelector('.st-recibo', { timeout:4000 });
  revisa('4. después de recargar se vuelve a abrir el recibo con cómo pagar', /PED-2026-00014/.test(await pg.textContent('.st-boleto')) && /167210000079567650/.test(await pg.textContent('#content')));
  await pg.goto(`${BASE}/pedido/#/recibo/PED-2099-00001`, { waitUntil:'networkidle' });
  await pg.waitForTimeout(300);
  revisa('5. un folio que no está en este celular lo dice y manda al portal', /no está en este celular/.test(await pg.textContent('#content')) && !!(await pg.$('#content a[href="/familias/"]')));
  revisa('sin errores de página', !errs.length, errs.join(' | '));
  await pg.close();
}
await ctx.close(); await nav.close(); srv.close();
console.log(fallos ? `Tienda recibo FAILED · ${fallos} de ${corridas}` : `Tienda recibo OK · ${corridas} revisiones: recibo Tanner, imagen PNG, WhatsApp a uno mismo y Mis pedidos`);
process.exit(fallos ? 1 : 0);
