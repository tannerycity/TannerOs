/* Medición con permiso, de punta a punta en el navegador (29/10/2026).
 *
 * docs/medicion (QA, punto 10). Lo que se protege:
 *   TIENDA (Meta 1477125554314319 + GA4 de TannerOS)
 *   1. Sin respuesta: sale la barra y NO hay una sola petición a Google o Meta.
 *   2. "Solo lo necesario": nada carga, ni al recargar.
 *   3. "Aceptar" (desde "Cookies"): carga una vez cada etiqueta, la página que
 *      ve GA4 es fija (sin #, sin ?), y ni el nombre, ni el teléfono, ni el
 *      nombre del Tanner viajan. Levantar el pedido NO es purchase.
 *   4. Retirar el permiso: recarga, borra las cookies y ya no hay peticiones.
 *   5. Fuera del dominio oficial no hay barra ni etiquetas.
 *   STAFF (sólo GA4 de TannerOS, nunca Meta)
 *   6. Operaciones sin respuesta: barra, cero peticiones, y el conteo propio
 *      (v2_usage_ping) con el módulo del menú.
 *   7. Aceptado: page_view con página sintética /m/<módulo>, tanner_module_opened
 *      y sólo parámetros permitidos. Meta nunca.
 *   8. El rol Tanner: ni barra, ni etiquetas, ni conteo.
 * Hermética: nada sale de 127.0.0.1 (Google y Meta se contestan aquí).
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


const OFERTA = { products:[{ id:'p-calceta', name:'Par de calcetas', price:200, sizes:['Universal'], product_type:'socks' }], bundles:[] };
const TIENDA = () => `
  export function createClient(){return{
    auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}}},
    storage:{from:()=>({createSignedUrls:async()=>({data:[],error:null})})},
    functions:{invoke:async()=>({data:null,error:null})},
    rpc:async(n,p={})=>{const ok=d=>({data:d,error:null});
      if(n==='v2_public_offerings')return ok(${JSON.stringify(OFERTA)});
      if(n==='v2_public_payment_info')return ok({transfer:{bank:'Banco',clabe:'167210000079567650',holder:'Titular'},methods:['Transferencia'],whatsapp:'524792651338'});
      if(n==='v2_public_context')return ok({organizationId:'o1',brand:'Tannery City F.C.'});
      if(n==='v2_public_cart_order')return ok({id:'o-web',folio:'PED-2026-00099',total:200,items:1});
      return ok(null);}};}`;
const SHELL = role => `
  window.__shellRpc=[];
  export const supabase = { auth:{ getSession:async()=>({data:{session:{user:{id:'u1'}}}}), onAuthStateChange(){ return {data:{subscription:{unsubscribe(){}}}}; } },
    from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:null})})})}) };
  export async function rpc(name,params){ window.__shellRpc.push({name,params});
    if(name==='v2_my_context') return [{ user_id:'u1', display_name:'Zulema García', organization_id:'o1', organization_name:'Tannery City FC', role:${JSON.stringify(role)}, is_owner:false }];
    if(name==='v2_my_navigation') return [];
    return null; }
  export function renderShell(){ const p=document.querySelector('.tos-sidebar-bottom'); }
  export function moduleAccess(){ return true; } export function setShellHealth(){} export function navigationMap(){ return new Map(); }
  export async function bootstrapProtectedShell(){ return null; } export const shellIcon=()=>''; export const navItems=[]; export function setShellSearchItems(){}
  export function avisoSoloLectura(){} export function detenPulso(){}`;
const VISORIAS = `
  export function createClient(){return{ auth:{getSession:async()=>({data:{session:{user:{id:'u1'}}}}),onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}}},
    storage:{from:()=>({createSignedUrls:async()=>({data:[],error:null})})},
    rpc:async(n)=>{const ok=d=>({data:d,error:null});
      if(n==='v2_my_context')return ok([{user_id:'u1',organization_id:'o1',organization_name:'Tannery City FC',role:'Operaciones'}]);
      if(n==='v2_visoria_board')return ok({campaign:{id:'c1',slug:'v',title:'Visoría',capacity:30,open:true,signingOpen:false},canSeeContact:true,canWrite:true,items:[]});
      return ok(null);}};}`;

const nav = await chromium.launch({ executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
let fallos = 0, corridas = 0;
const revisa = (nombre, ok, detalle) => { corridas++; if (!ok) { fallos++; console.error(` - ${nombre}${detalle ? `\n   ${String(detalle).slice(0, 400)}` : ''}`); } };

async function contexto({ oficial = true, role = 'Operaciones' } = {}) {
  const ctx = await nav.newContext({ viewport:{ width:390, height:844 } });
  if (oficial) await ctx.addInitScript(() => { window.__tosMedicionHost = 'app.tannerycity.com'; });
  const terceros = [];
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await ctx.route(/googletagmanager\.com|google-analytics\.com|connect\.facebook\.net|facebook\.com\/tr/, r => { terceros.push(r.request().url()); r.fulfill({ status:200, contentType:'text/javascript', body:'' }); });
  await ctx.route('**esm.sh/libphonenumber-js**', r => r.fulfill({ status:200, contentType:'text/javascript', body:`
    export function AsYouType(){return{input:v=>v}} export function getCountries(){return['MX']} export function getCountryCallingCode(){return'52'}
    export function parsePhoneNumberFromString(v){const d=String(v).replace(/\\D/g,'');return{isValid:()=>d.length>=10,formatInternational:()=>'+52 '+d,number:'+52'+d};}` }));
  await ctx.route(/\/v2\/supabase-client\.js(\?.*)?$/, (r, q) => r.fulfill({ status:200, contentType:'text/javascript', body: q.url().includes('visorias') || r.request().frame()?.url().includes('/visorias/') ? VISORIAS : TIENDA() }));
  await ctx.route(/\/v2\/shell\.js(\?.*)?$/, r => r.fulfill({ status:200, contentType:'text/javascript', body:SHELL(role) }));
  await ctx.route(/\/v2\/branding\.js(\?.*)?$/, r => r.fulfill({ status:200, contentType:'text/javascript', body:'export async function loadAndApplyBranding(){}' }));
  return { ctx, terceros };
}
const capas = pg => pg.evaluate(() => JSON.stringify({ dl: (window.dataLayer || []).map(a => Array.from(a)), fb: (window.fbq?.queue || []).map(a => Array.from(a)) }));

// ---------- TIENDA ----------
{
  const { ctx, terceros } = await contexto();
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(BASE + '/pedido/', { waitUntil:'networkidle' });
  await pg.waitForSelector('#tcConsent', { timeout:6000 });
  revisa('1. sin respuesta: sale la barra con dos botones iguales', /Solo lo necesario/.test(await pg.textContent('#tcConsent')) && /Aceptar/.test(await pg.textContent('#tcConsent')));
  revisa('1. sin respuesta: cero peticiones a Google o Meta', terceros.length === 0 && await pg.evaluate(() => !window.gtag && !window.fbq), terceros.join(' '));
  await pg.click('#tcConsent [data-c="no"]');
  await pg.reload({ waitUntil:'networkidle' });
  revisa('2. "Solo lo necesario": nada carga, ni al recargar, y no vuelve a preguntar', terceros.length === 0 && !(await pg.$('#tcConsent')), terceros.join(' '));
  // Cambiar de opinión desde "Cookies".
  await pg.click('.st-pie a:has-text("Cookies")');
  await pg.click('#tcConsent [data-c="si"]');
  await pg.waitForTimeout(300);
  const g1 = terceros.filter(u => /googletagmanager\.com\/gtag\/js\?id=G-KJN3NJS2YJ/.test(u)).length, m1 = terceros.filter(u => /fbevents\.js/.test(u)).length;
  revisa('3. "Aceptar": carga una vez GA4 de TannerOS y Meta', g1 === 1 && m1 === 1, terceros.join(' '));
  revisa('3. no carga el GA4 de Marketing aquí', !terceros.some(u => /G-H485DE37EF/.test(u)));
  let c = JSON.parse(await capas(pg));
  const config = c.dl.find(a => a[0] === 'config');
  revisa('3. GA4 ve una página fija, sin señales de anuncios', config?.[1] === 'G-KJN3NJS2YJ' && config[2].page_location === 'https://app.tannerycity.com/tienda/' && config[2].allow_google_signals === false && config[2].send_page_view === false, JSON.stringify(config));
  revisa('3. Meta sin configuración automática (no lee botones ni formularios)', c.fb.some(a => a[0] === 'set' && a[1] === 'autoConfig' && a[2] === false) && c.fb.some(a => a[0] === 'init' && a[1] === '1477125554314319'));
  await pideCalcetas(pg);
  await pg.waitForTimeout(600);
  c = JSON.parse(await capas(pg)); const todo = JSON.stringify(c);
  revisa('3. viajan los eventos de la tienda', c.dl.some(a => a[0] === 'event' && a[1] === 'view_item') && c.dl.some(a => a[0] === 'event' && a[1] === 'add_to_cart') && c.dl.some(a => a[0] === 'event' && a[1] === 'store_order_placed'), todo.slice(0, 300));
  revisa('3. levantar el pedido NO es purchase', !c.dl.some(a => a[1] === 'purchase') && !c.fb.some(a => a[1] === 'Purchase'));
  revisa('3. ni nombre, ni teléfono, ni Tanner, ni folio', !/Ana|4771234567|Leo|PED-2026-00099|customer|phone/i.test(todo), todo.match(/Ana|4771234567|Leo|PED-2026-00099/i)?.[0]);
  revisa('3. nunca la URL real con #', !/#\//.test(todo));
  // Retirar el permiso.
  await pg.evaluate(() => { document.cookie = '_ga=GA1.1.123.456; path=/'; document.cookie = '_fbp=fb.1.123; path=/'; });
  await pg.goto(BASE + '/pedido/', { waitUntil:'networkidle' });
  const antes = terceros.length;
  await pg.click('.st-pie a:has-text("Cookies")');
  await Promise.all([pg.waitForNavigation({ waitUntil:'networkidle' }), pg.click('#tcConsent [data-c="no"]')]);
  await pg.waitForTimeout(400);
  revisa('4. retirar: recarga, borra _ga/_fbp y no hay nuevas peticiones', terceros.length === antes && !/_ga=|_fbp=/.test(await pg.evaluate(() => document.cookie)) && await pg.evaluate(() => !window.gtag && !window.fbq), `${antes}→${terceros.length} ${await pg.evaluate(() => document.cookie)}`);
  revisa('sin errores de página (tienda)', !errs.length, errs.join(' | '));
  await ctx.close();
}
{
  const { ctx, terceros } = await contexto({ oficial:false });
  const pg = await ctx.newPage();
  await pg.goto(BASE + '/pedido/', { waitUntil:'networkidle' }); await pg.waitForTimeout(300);
  revisa('5. fuera del dominio oficial: sin barra ni etiquetas', !(await pg.$('#tcConsent')) && terceros.length === 0 && !(await pg.$('.st-pie a:has-text("Cookies")')));
  await ctx.close();
}
// ---------- STAFF ----------
{
  const { ctx, terceros } = await contexto({ role:'Operaciones' });
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(BASE + '/v2/visorias/', { waitUntil:'networkidle' });
  await pg.waitForSelector('#tosUsoConsentimiento', { timeout:6000 });
  const ping = (await pg.evaluate(() => window.__shellRpc)).filter(x => x.name === 'v2_usage_ping');
  revisa('6. Operaciones: barra de analítica y cero peticiones', terceros.length === 0 && /Solo lo necesario/.test(await pg.textContent('#tosUsoConsentimiento')), terceros.join(' '));
  revisa('6. conteo propio con el módulo del menú (sin datos)', ping.length === 1 && JSON.stringify(ping[0].params) === '{"organization_id":"o1","module":"visorias"}', JSON.stringify(ping));
  await pg.click('#tosUsoConsentimiento [data-uso="si"]'); await pg.waitForTimeout(300);
  const c = JSON.parse(await capas(pg));
  const ev = c.dl.filter(a => a[0] === 'event');
  revisa('7. carga una vez GA4 de TannerOS; Meta nunca', terceros.filter(u => /gtag\/js\?id=G-KJN3NJS2YJ/.test(u)).length === 1 && !terceros.some(u => /facebook/.test(u)) && await pg.evaluate(() => !window.fbq), terceros.join(' '));
  revisa('7. page_view con página sintética y tanner_module_opened', ev.some(a => a[1] === 'page_view' && a[2].page_location === 'https://app.tannerycity.com/m/visorias') && ev.some(a => a[1] === 'tanner_module_opened' && a[2].module_name === 'visorias'), JSON.stringify(ev));
  const permitidos = { page_view:['page_location','page_title','page_referrer'], tanner_module_opened:['module_name'], tanner_navigation:['from_module','to_module'], tanner_screen_load:['module_name','load_ms'], tanner_error:['module_name','error_type'], tanner_feature_used:['module_name','feature'] };
  revisa('7. sólo parámetros permitidos y ningún dato de la persona', ev.every(a => permitidos[a[1]] && Object.keys(a[2] || {}).every(k => permitidos[a[1]].includes(k))) && !/Zulema|u1|o1|Operaciones/.test(JSON.stringify(c.dl)), JSON.stringify(c.dl).slice(0, 400));
  revisa('7. "Preferencias de analítica" en el menú para cambiar de opinión', !!(await pg.$('#tosUsoPreferencias')));
  revisa('sin errores de página (staff)', !errs.length, errs.join(' | '));
  await ctx.close();
}
{
  const { ctx, terceros } = await contexto({ role:'Tanner' });
  const pg = await ctx.newPage();
  await pg.goto(BASE + '/v2/visorias/', { waitUntil:'networkidle' }); await pg.waitForTimeout(500);
  revisa('8. rol Tanner: ni barra, ni etiquetas, ni conteo', !(await pg.$('#tosUsoConsentimiento')) && terceros.length === 0 && !(await pg.evaluate(() => window.__shellRpc)).some(x => x.name === 'v2_usage_ping'));
  await ctx.close();
}

await nav.close(); srv.close();
console.log(fallos ? `Medición humo FAILED · ${fallos} de ${corridas}` : `Medición humo OK · ${corridas} revisiones: nada sin permiso, retirar lo apaga, sin datos personales, staff sin Meta y Tanner fuera`);
process.exit(fallos ? 1 : 0);

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
