/* CÓDIGOS Y NOMBRE Y NÚMERO CON CARGO (26/10/2026, h45 y h46), en la tienda
 * como la usa una familia en su teléfono y en la liga del embajador.
 *
 * Lo que se protege:
 *   1. Con el cargo prendido, el nombre y número dice "+$100" antes de
 *      escribirlo y el precio sube al escribir (jersey suelto y kit).
 *   2. La liga del embajador (?codigo=) deja el código listo y se aplica solo
 *      en el pedido: se ve el descuento y el total que se va a pagar.
 *   3. Un código que no sirve dice por qué; quitarlo regresa el total.
 *   4. El código viaja al servidor como una línea {kind:'code'}.
 *   5. La liga del embajador enseña sus ventas y su premio, sin clientes.
 *   6. Nada se sale de la pantalla a 390px.
 */
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const T = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
            '.svg':'image/svg+xml','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('no'); return; }
  r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
  r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}`;

const TALLAS = ['6','8','10','12','14','16','XS','S','M','L','XL','XXL'];
const OFERTA = {
  recargoMangaLarga: 50, recargoPersonalizacion: 100,
  products: [
    { id:'p-black', name:'Jersey "Black Edition"', price:799, sizes:TALLAS, category:'jersey' },
    { id:'p-short', name:'Short', price:350, sizes:TALLAS, category:'shorts' },
    { id:'p-gorra', name:'The Tanner Cap', price:550, sizes:['Universal'], category:'Gorra' }
  ],
  bundles: [
    { id:'k-game', name:'Kit Game', priceAdult:1500, priceKid:1299, available:true, components:[
      { productId:'p-black', name:'Jersey "Black Edition"', sizes:TALLAS, qty:1 },
      { productId:'p-short', name:'Short', sizes:TALLAS, qty:1 } ] }
  ]
};
const CODIGO = { ok:true, code:'CURTI10', kind:'descuento', label:'10% de descuento', discountType:'pct', discountValue:10, minPurchase:0 };
const STATS = { code:'CURTI10', ambassador:'Curti', label:'10% de descuento', club:'Club QA', active:true, endsOn:null, rewardPct:5, rewardKind:'dinero',
  stats:{ uses:3, paidOrders:2, sold:2700, pendingSales:809.1, discountGiven:300, rewardEarned:135, rewardPaid:50, rewardOwed:85 },
  recent:[{ date:'2026-10-25', total:1350, paid:true, reward:67.5 }, { date:'2026-10-24', total:809.1, paid:false, reward:40.46 }] };

const llamadas = [];
const nav = await chromium.launch({ executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
const pg = await nav.newPage({ viewport:{ width:390, height:844 } });
const errs = [];
pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
pg.on('console', m => { if (m.type()==='error' && !/favicon/.test(m.text())) errs.push('console: ' + m.text()); });
await pg.exposeFunction('__anota', (n, p) => { llamadas.push({ n, p }); });
await pg.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
await pg.route(/\/v2\/supabase-client\.js(\?.*)?$/, r => r.fulfill({ status:200, contentType:'text/javascript', body:`
  export function createClient(){return{
    auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}}},
    storage:{from:()=>({createSignedUrls:async(ps)=>({data:ps.map(p=>({path:p,signedUrl:''})),error:null})})},
    rpc:async(n,p={})=>{
      await window.__anota(n, JSON.parse(JSON.stringify(p)));
      if(n==='v2_public_offerings')return{data:${JSON.stringify(OFERTA)},error:null};
      if(n==='v2_public_payment_info')return{data:{transfer:{bank:'Banco',clabe:'167210000079567650',holder:'Club'},whatsapp:'524790000000'},error:null};
      if(n==='v2_public_context')return{data:{organizationId:'org-qa',brand:'Club QA'},error:null};
      if(n==='v2_public_check_code')return{data:p.code==='CURTI10'?${JSON.stringify(CODIGO)}:{ok:false,motivo:'Ese código no existe. Revisa cómo se escribe.'},error:null};
      if(n==='v2_public_code_stats')return p.token==='tok123'?{data:${JSON.stringify(STATS)},error:null}:{data:null,error:{message:'Esta liga ya no existe.'}};
      if(n==='v2_public_cart_order')return{data:{id:'o-qa',folio:'PED-QA-1',total:809.1,discount:89.9,code:'CURTI10'},error:null};
      return {data:null,error:null};}};}` }));
await pg.route('**esm.sh/libphonenumber-js**', r => r.fulfill({ status:200, contentType:'text/javascript', body:`
  export function AsYouType(){return{input:v=>v}}
  export function getCountries(){return['MX','US']}
  export function getCountryCallingCode(c){return c==='MX'?'52':'1'}
  export function parsePhoneNumberFromString(v){const d=String(v).replace(/\\D/g,'');
    return{isValid:()=>d.length>=10,formatInternational:()=>'+52 '+d,number:'+52'+d};}` }));

let fallos = 0, corridas = 0;
const revisa = (nombre, ok, detalle) => { corridas++; if (!ok) { fallos++; console.error(` - ${nombre}${detalle ? `\n   ${detalle}` : ''}`); } };
const cabe = async donde => revisa(`${donde}: nada se sale de la pantalla a 390px`,
  await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

/* ===== La liga del embajador deja el código listo ===== */
await pg.goto(BASE + '/pedido/?codigo=curti10', { waitUntil:'networkidle' });
await pg.waitForSelector('.st-card', { timeout: 8000 });
revisa('la tienda dice que el código ya va', /Código CURTI10 listo/.test(await pg.innerText('.st-hero')), await pg.innerText('.st-hero'));

/* ===== La bolsita y los guardados (27/10/2026) ===== */
await pg.click('[data-prod="p-gorra"] [data-fav]');
revisa('[bolsita] el corazón guarda sin abrir la ficha', (await pg.getAttribute('[data-prod="p-gorra"] [data-fav]', 'aria-pressed')) === 'true' && !/#\/p\//.test(pg.url()));
await pg.click('#stCarrito');
await pg.waitForSelector('#stMini .st-mini-linea', { timeout: 3000 });
revisa('[bolsita] con el pedido vacío abre en Guardados', /The Tanner Cap/.test(await pg.innerText('#stMini')) && (await pg.getAttribute('[data-mini-tab="guardados"]', 'aria-selected')) === 'true');
await pg.click('#stMini [data-mini-cierra]');
revisa('[bolsita] se cierra', !(await pg.$('#stMini')));

/* ===== 1. Nombre y número con cargo ===== */
await pg.goto(BASE + '/pedido/?codigo=curti10#/p/p-black');
await pg.waitForSelector('[data-talla="M"]', { timeout: 4000 });
revisa('el cargo se dice antes de escribir', /Opcional · \+\$100/.test(await pg.innerText('.st-pers-cargo')), await pg.innerText('.st-pers-cargo'));
await pg.click('[data-talla="M"]');
revisa('sin nombre, el precio del jersey', /\$799/.test(await pg.innerText('#stAgregar')), await pg.innerText('#stAgregar'));
await pg.fill('[data-campo="nombre"]', 'LEO');
revisa('al escribir el nombre, sube $100', /\$899/.test(await pg.innerText('#stAgregar')), await pg.innerText('#stAgregar'));
revisa('y el campo no pierde el foco', await pg.evaluate(() => document.activeElement?.dataset?.campo === 'nombre'));
await pg.fill('[data-campo="nombre"]', '');
revisa('borrarlo regresa el precio', /\$799/.test(await pg.innerText('#stAgregar')));
await pg.fill('[data-campo="nombre"]', 'LEO');
await pg.click('#stAgregar');
await pg.waitForTimeout(150);
// La bolsita: el pedido se ve otra vez, la cantidad se cambia ahí mismo y
// recargar no lo borra.
await pg.click('#stCarrito');
await pg.waitForSelector('#stMini [data-mini-linea]', { timeout: 3000 });
const mini = await pg.innerText('#stMini');
revisa('[bolsita] enseña lo agregado con su talla y su nombre', /Jersey "Black Edition"/.test(mini) && /Talla M/.test(mini) && /LEO/.test(mini) && /Ir a pagar · \$899/.test(mini), mini);
await pg.click('#stMini [data-mini-cant="1"]');
revisa('[bolsita] + suma y el total cambia', /Ir a pagar · \$1,798/.test(await pg.innerText('#stMini')) && (await pg.textContent('#stCarritoN')) === '2');
await pg.click('#stMini [data-mini-cant="-1"]');
revisa('[bolsita] − regresa', /Ir a pagar · \$899/.test(await pg.innerText('#stMini')));
await cabe('la bolsita');
await pg.click('#stMini [data-mini-cierra]');
await pg.reload(); await pg.waitForSelector('.st-pdp, .st-card', { timeout: 6000 });
revisa('[bolsita] recargar no borra el pedido', (await pg.textContent('#stCarritoN')) === '1');

await pg.goto(BASE + '/pedido/?codigo=curti10#/k/k-game');
await pg.waitForSelector('[data-tier="Adulto"]', { timeout: 4000 });
await pg.click('[data-tier="Adulto"]');
revisa('el kit dice el cargo por jersey', /\+\$100/.test(await pg.innerText('.st-pers-cargo')));
const antes = await pg.innerText('#stPrecioKit');
await pg.fill('[data-campo="numero"]', '7');
// 29/10/2026 ("me salen dos precios"): el precio grande es el del kit, como
// en la ficha de una pieza; lo que se suma va abajo con el total del botón.
revisa('en el kit, el número suma $100 por su jersey y lo dice', /\$1,500/.test(antes) && /\$1,500/.test(await pg.innerText('#stPrecioKit')) && /nombre y número \+\$100/.test(await pg.innerText('#stExtrasKit')) && /total \$1,600/.test(await pg.innerText('#stExtrasKit')) && /\$1,600/.test(await pg.innerText('#stAgregar')), `${antes} -> ${await pg.innerText('#stExtrasKit').catch(() => '')}`);
await cabe('la ficha del kit');

/* ===== 2. El código en el pedido ===== */
await pg.goto(BASE + '/pedido/?codigo=curti10#/pedido');
await pg.waitForSelector('.st-codigo.aplicado', { timeout: 4000 });
const check = llamadas.filter(c => c.n === 'v2_public_check_code').at(-1);
revisa('se valida con el total del carrito', check?.p?.code === 'CURTI10' && check?.p?.subtotal === 899, JSON.stringify(check?.p));
revisa('dice qué hace el código', /10% de descuento: −\$89\.90/.test(await pg.innerText('.st-codigo')), await pg.innerText('.st-codigo'));
revisa('el resumen enseña subtotal, descuento y total', /\$899/.test(await pg.innerText('.carrito-sub')) && /−\$89\.90/.test(await pg.innerText('.carrito-desc')) && /\$809\.10/.test(await pg.innerText('.carrito-total')), await pg.innerText('#resumenCarrito'));

/* ===== 3. Uno que no sirve, y quitarlo ===== */
await pg.click('[data-codigo-quita]');
await pg.waitForSelector('#stCodigo', { timeout: 3000 });
revisa('quitarlo regresa el total', /\$899/.test(await pg.innerText('.carrito-total')) && !(await pg.$('.carrito-desc')));
await pg.fill('#stCodigo', 'novale');
await pg.click('[data-codigo-aplica]');
await pg.waitForSelector('.st-codigo-mal', { timeout: 3000 });
revisa('uno que no sirve dice por qué', /no existe/.test(await pg.innerText('.st-codigo-mal')) && /\$899/.test(await pg.innerText('.carrito-total')));
await pg.fill('#stCodigo', 'curti10');
await pg.press('#stCodigo', 'Enter');
await pg.waitForSelector('.st-codigo.aplicado', { timeout: 3000 });
revisa('con Enter también se aplica', /\$809\.10/.test(await pg.innerText('.carrito-total')));
await cabe('el pedido con código');

/* ===== 4. Viaja al servidor ===== */
await pg.fill('#customerName', 'Ana Ávila');
await pg.fill('#customerPhone', '4771234567');
await pg.check('#orderDataConsent');
await pg.check('#orderPickup');
await pg.click('#submitOrder');
await pg.waitForSelector('.success', { timeout: 4000 });
const envio = llamadas.find(c => c.n === 'v2_public_cart_order');
const items = envio?.p?.items || [];
revisa('el código va como una línea {kind:"code"}', JSON.stringify(items.at(-1)) === '{"kind":"code","code":"CURTI10"}', JSON.stringify(items));
revisa('y el jersey con su nombre', items.some(x => x.productId === 'p-black' && x.personalizationName === 'LEO'));
revisa('la confirmación dice el descuento', /Ya con \$89\.90 de descuento/.test(await pg.innerText('.success')), await pg.innerText('.success'));
revisa('el cliente nunca lee "comisión" ni "premio"', !/comisi[oó]n|premio/i.test(await pg.innerText('body')));

/* ===== 5. La liga del embajador ===== */
await pg.goto(BASE + '/pedido/#/embajador/tok123');
await pg.waitForSelector('.st-emb', { timeout: 4000 });
const emb = await pg.innerText('.st-emb');
revisa('saluda al embajador con su código', /Hola, Curti/.test(emb) && /CURTI10/.test(emb), emb);
revisa('enseña ventas pagadas, por pagar, su premio y lo que se le debe', /\$2,700/.test(emb) && /\$809\.10/.test(emb) && /\$135/.test(emb) && /\$85/.test(emb), emb);
revisa('lista sus compras sin nombres de clientes', (await pg.$$('.st-emb-lista li')).length === 2 && !/Ana/.test(emb));
const wa = await pg.getAttribute('.st-emb-acciones a', 'href');
revisa('"Compartir mi código" lleva la liga con el código puesto', /wa\.me/.test(wa) && decodeURIComponent(wa).includes('/tienda/?codigo=CURTI10'), wa);
revisa('lo que comparte no habla de su premio', !/premio|5%/.test(decodeURIComponent(wa)));
await cabe('la liga del embajador');
await pg.goto(BASE + '/pedido/#/embajador/otro');
await pg.waitForSelector('.empty-state', { timeout: 4000 });
revisa('una liga que no existe lo dice', /ya no existe/.test(await pg.innerText('.empty-state')));

/* ===== 7. Catálogo: el interruptor y la pestaña Códigos (Zul, no Presidencia) ===== */
const CAT = { products: [
    { id:'p1', name:'Jersey "Black Edition"', category:'jersey', price:799, active:true, archived:false, sizes:TALLAS },
    { id:'pg', name:'The Tanner Cap', category:'gorras', price:550, active:true, archived:false, sizes:['Universal'] } ],
  bundles: [], recargoMangaLarga: 50, personalizacion: { activo:false, monto:100 } };
const CODES = { isPresidency:false, canPay:false, cap:10, codes:[{ id:'c1', code:'CURTI10', kind:'descuento', discountType:'pct', discountValue:10, minPurchase:0,
  ambassadorName:'Curti', ambassadorPhone:'4771234567', rewardPct:5, rewardKind:'dinero', active:true, estado:'activo', shareToken:'tok123', label:'10% de descuento',
  maxUsesPerCustomer:1, stats:{ uses:3, sold:2700, rewardOwed:85, rewardEarned:135, rewardPaid:50 }, payouts:[] }] };
const adm = await nav.newPage({ viewport:{ width:390, height:844 } });
const llamadasAdm = [];
adm.on('pageerror', e => errs.push('admin pageerror: ' + e.message));
await adm.exposeFunction('__anota', (n, p) => { llamadasAdm.push({ n, p }); });
await adm.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
await adm.route('**/v2/branding-auto.js', r => r.fulfill({ status:200, contentType:'text/javascript', body:'' }));
await adm.route(/\/v2\/supabase-client\.js(\?.*)?$/, r => r.fulfill({ status:200, contentType:'text/javascript', body:`
  export function createClient(){return{
    auth:{getSession:async()=>({data:{session:{user:{id:'u1'}}}}),getUser:async()=>({data:{user:{app_metadata:{}}}}),signOut:async()=>({}),onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}}},
    storage:{from:()=>({createSignedUrls:async(ps)=>({data:ps.map(p=>({path:p,signedUrl:''})),error:null}),createSignedUrl:async()=>({data:{signedUrl:''},error:null})})},
    from:()=>({select(){return this},eq(){return this},order(){return this},limit(){return this},maybeSingle:async()=>({data:null,error:null}),then:r=>r({data:[],error:null})}),
    rpc:async(n,p={})=>{
      await window.__anota(n, JSON.parse(JSON.stringify(p)));
      if(n==='v2_my_context')return{data:[{organization_id:'o1',organization_name:'Club QA',role:'Operaciones',is_owner:false}],error:null};
      if(n==='v2_can_edit_catalog')return{data:true,error:null};
      if(n==='v2_my_modules')return{data:[{module_code:'catalogo',enabled:true,can_read:true,can_write:true}],error:null};
      if(n==='v2_catalog')return{data:${JSON.stringify(CAT)},error:null};
      if(n==='v2_store_codes')return{data:${JSON.stringify(CODES)},error:null};
      if(n==='v2_set_recargo_personalizacion')return{data:{activo:p.activo,monto:p.monto},error:null};
      return {data:[],error:null};}};}` }));
await adm.goto(BASE + '/v2/catalogo/', { waitUntil:'networkidle' });
await adm.waitForSelector('#productList .catalog-card', { timeout: 8000 });
revisa('[catálogo] el cargo de nombre y número se ve apagado, con su monto', (await adm.isVisible('#recargoPersCaja')) && !(await adm.isChecked('#cobraPers')) && (await adm.inputValue('#recargoPers')) === '100' && /Gratis/.test(await adm.innerText('#cobraPersTxt')));
await adm.click('#recargoPersCaja .cat-switch');
await adm.waitForTimeout(200);
const sw = llamadasAdm.find(c => c.n === 'v2_set_recargo_personalizacion');
revisa('[catálogo] prenderlo lo guarda con su monto', sw?.p?.activo === true && sw?.p?.monto === 100, JSON.stringify(sw?.p));
revisa('[catálogo] y dice que ya se cobra', /Se cobra/.test(await adm.innerText('#cobraPersTxt')));
await adm.click('[data-ver="codigos"]');
await adm.waitForSelector('.codigo', { timeout: 3000 });
const card = await adm.innerText('.codigo');
revisa('[códigos] la tarjeta dice qué hace, del embajador y lo que se le debe', /CURTI10/.test(card) && /10% de descuento/.test(card) && /Curti/.test(card) && /\$85/.test(card), card);
revisa('[códigos] sin permiso de Finanzas no aparece "Pagar premio"', !(await adm.$('[data-cd-acc="pagar"]')));
await adm.click('#nuevoCodigo');
await adm.waitForSelector('#codeForm:not(.hidden)', { timeout: 3000 });
revisa('[códigos] nace con "una vez por cliente"', await adm.isChecked('#cdUnaVez'));
await adm.fill('#cdCode', 'park 26');
await adm.click('#cdComo [data-como="amount"]');
await adm.fill('#cdValor', '200');
revisa('[códigos] $200 sin compra mínima avisa que es de Presidencia', /Presidencia/.test(await adm.innerText('#cdVista')), await adm.innerText('#cdVista'));
await adm.click('#cdGuardar');
await adm.waitForTimeout(200);
revisa('[códigos] y no se manda', !llamadasAdm.some(c => c.n === 'v2_save_store_code'));
await adm.fill('#cdMin', '2500');
revisa('[códigos] con compra mínima de $2,500 ya pasa', !/Presidencia/.test(await adm.innerText('#cdVista')) && /PARK26/.test(await adm.innerText('#cdVista')));
await adm.click('#cdGuardar');
await adm.waitForTimeout(300);
const guardado = llamadasAdm.find(c => c.n === 'v2_save_store_code')?.p?.store_code;
revisa('[códigos] se guarda normalizado con sus reglas', guardado?.code === 'PARK26' && guardado?.kind === 'descuento' && guardado?.discountType === 'amount' && guardado?.discountValue === 200 && guardado?.minPurchase === 2500 && guardado?.maxUsesPerCustomer === 1 && !('_regalo' in guardado), JSON.stringify(guardado));
await adm.waitForSelector('.codigo', { timeout: 3000 });
await adm.click('.codigo [data-cd-acc="pausar"]');
await adm.waitForTimeout(200);
const pausa = llamadasAdm.find(c => c.n === 'v2_set_store_code');
revisa('[códigos] "Pausar" lo pausa', pausa?.p?.code_id === 'c1' && pausa?.p?.action === 'pausar', JSON.stringify(pausa?.p));
revisa('[códigos] nada se sale a 390px', await adm.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await adm.close();

revisa('sin errores de consola', errs.filter(e => !/Esta liga ya no existe/.test(e)).length === 0, errs.join('\n   '));
await nav.close(); srv.close();
console.log(fallos
  ? `Códigos humo FAILED · ${fallos} de ${corridas}`
  : `Códigos humo OK · ${corridas} revisiones: nombre y número con cargo, código desde la liga, descuento antes de pagar y la liga del embajador`);
process.exit(fallos ? 1 : 0);
