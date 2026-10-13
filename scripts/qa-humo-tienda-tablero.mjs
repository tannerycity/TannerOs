/* La Tienda en tres toques: quién pidió, qué pidió, si es manga larga, y el
 * número confirmado.
 *
 * Pedido de Presidencia (13/10/2026): "en 3 clicks, quien pidio, que pidio,
 * si es manga larga ... corroborar el numero, y que no sean tantos clicks".
 * Y: "que se viera el nombre del jugador en el pedido, pero abajo el papá".
 *
 * Lo que se protege:
 *   TIENDA (link público)
 *   1. Un jersey trae Manga corta / larga; corta por omisión.
 *   2. La manga elegida se ve en el carrito y viaja en el pedido (sleeve).
 *   ADMIN (Pedidos)
 *   3. La fila dice el JUGADOR grande y abajo "Pidió: <papá/mamá>".
 *   4. Sin jugador ligado, la fila dice quién pidió (no queda vacía).
 *   5. Las piezas se leen en la fila: talla, manga larga, nombre y #número.
 *   6. "Número #7 por confirmar" con su botón; un toque lo confirma SIN
 *      abrir el pedido, y se puede deshacer.
 *   7. El filtro "Número por confirmar" deja sólo esos pedidos.
 *   8. Se busca por nombre del jugador.
 *   9. El detalle trae el chip de Manga.
 *  10. Se dice cómo llegó (en línea, portal, mostrador) y quién lo atendió.
 *  11. La nota del pedido se ve en la fila.
 *  12. Los filtros de arriba traen su cuenta; "Por atender" junta lo nuevo
 *      y los números por confirmar.
 *  13. El detalle abre con un resumen: jugador, quién pidió, cómo llegó, nota.
 *  14. La manga de cada jersey se corrige en un toque.
 *  15. Se elige quién del club atendió el pedido (ayudó Zul, ayudó Mich).
 *  16. Un jersey suelto que viene en un kit pregunta si se convierte: el kit
 *      abre lleno y reemplaza al jersey.
 *
 * Hermética: nada sale de 127.0.0.1.
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

const PAGO = { transfer:{ bank:'Banregio / Hey Banco', clabe:'167210000079567650', holder:'Proyecto Leyenda SA de CV' },
  methods:['Transferencia','Efectivo','Tarjeta'], whatsapp:'524792651338' };
const OFERTA = { products:[{ id:'p-jersey', name:'Jersey Home', price:850, sizes:['8','10'], product_type:'jersey' }],
  // Kit Training (13/10/2026): trae el mismo jersey, short y calcetas.
  bundles:[{ id:'k-train', name:'Kit Training', priceAdult:1300, priceKid:1100, available:true, components:[
    { productId:'p-jersey', name:'Jersey Home', sizes:['8','10'], qty:1, category:'jersey' },
    { productId:'p-short', name:'Short', sizes:['8','10'], qty:1, category:'shorts' },
    { productId:'p-calceta', name:'Calcetas', sizes:['Universal'], qty:1, category:'socks' }] }] };
// a5: el tablero que la lista pinta sin abrir el pedido.
const TABLERO = {
  'o-nuevo':{ playerName:'Leo Ávila', playerCategory:'T10', playerJersey:'7', numberConfirmed:null,
    source:'public_form', notes:'Las dos de manga larga', attendedBy:null, attendedName:null, attendedManual:false,
    items:[{ id:'i1', description:'Jersey Home', quantity:1, talla:'10', manga:'larga', nombre:'LEO', numero:'7', kit:null },
           { id:'i2', description:'Jersey Away', quantity:1, talla:'10', manga:null, nombre:'LEO', numero:'7', kit:null },
           { id:'i3', description:'Par de calcetas', quantity:1, talla:'Universal', manga:null, nombre:null, numero:null, kit:null }] },
  'o-viejo':{ playerName:null, source:'internal_capture', attendedBy:'u-zul', attendedName:'Zul', attendedManual:false,
    items:[{ id:'i9', description:'Hoodie', quantity:1, talla:'L', manga:null, nombre:null, numero:null, kit:null }] }
};

const PEDIDOS = [
  { id:'o-nuevo', folio:'PED-2026-00031', customer_name:'Ana Sofía Ávila', customer_phone:'+524771234567', customer_email:null,
    subtotal:1450, discount:0, total:1450, status:'pending_payment', source:'public_form', notes:null,
    created_at:'2026-10-08T18:00:00Z', delivered_at:null, paid_amount:0, item_count:2 },
  { id:'o-viejo', folio:'PED-2026-00020', customer_name:'Abuelo Pérez', customer_phone:'+524779876543', customer_email:null,
    subtotal:699, discount:0, total:699, status:'paid', source:'public_form', notes:null,
    created_at:'2026-10-01T18:00:00Z', delivered_at:null, paid_amount:699, item_count:1 }
];
const detalle = id => {
  const o = PEDIDOS.find(x => x.id === id);
  return { order:{ ...o }, balance:o.total - o.paid_amount, payments:[], paymentPlan:null,
    readiness:{ ok:true, missing:[] }, profitability:null,
    items: id === 'o-nuevo'
      ? [{ id:'i1', description:'Jersey "Wet Blue" - Home Edition', quantity:1, unitPrice:1250, attributes:{ talla:'10', manga:'larga', nombrePers:'LEO', numero:'7' } },
         { id:'i2', description:'Par de calcetas', quantity:1, unitPrice:200, attributes:{ talla:'Universal' } }]
      : [{ id:'i3', description:'Hoodie', quantity:1, unitPrice:699, attributes:{ talla:'L' } }] };
};

const SHELL = `
  export const supabase = { auth:{ getSession:async()=>({data:{session:{user:{id:'u1'}}}}),
    getUser:async()=>({data:{user:{id:'u1',app_metadata:{}}}}), signOut:async()=>({}),
    onAuthStateChange(){ return {data:{subscription:{unsubscribe(){}}}}; } } };
  export async function rpc(name){
    if(name==='v2_my_context') return [{ user_id:'u1', display_name:'Zulema García', organization_id:'o1', organization_name:'Tannery City FC', role:'Operaciones', is_owner:false }];
    if(name==='v2_my_navigation') return [];
    return null;
  }
  export function moduleAccess(){ return true; }
  export function setShellHealth(){}
  export function navigationMap(){ return new Map(); }
  export async function bootstrapProtectedShell(){ return { ctx:{ organization_id:'o1', organization_name:'Tannery City FC', role:'Operaciones' }, navigation:[] }; }
  export const shellIcon = () => '';
  export const navItems = [];
  export function setShellSearchItems(){}
  export function renderShell(){}
`;

// El cliente de Supabase falso: contesta lo de las dos pantallas y anota
// cada llamada, que es lo que de verdad se prueba.
const CLIENTE = (pagoFalla) => `
  const PEDIDOS=${JSON.stringify(PEDIDOS)};
  const DET=${JSON.stringify(Object.fromEntries(PEDIDOS.map(o => [o.id, detalle(o.id)])))};
  window.__rpc=[]; window.__abiertas=[];
  window.open=(u)=>{window.__abiertas.push(u);return null;};
  let revisados=new Set(),asignados=new Set(),ligado=null;
  const TAB=${JSON.stringify(TABLERO)};
  export function createClient(){return{
    auth:{getSession:async()=>({data:{session:{user:{id:'u1'},access_token:'x'}}}),
      onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}}},
    rpc:async(n,p={})=>{
      window.__rpc.push({n,p:JSON.parse(JSON.stringify(p))});
      const ok=d=>({data:d,error:null});
      if(n==='v2_public_offerings')return ok(${JSON.stringify(OFERTA)});
      if(n==='v2_public_payment_info')return ${pagoFalla ? "({data:null,error:{message:'sin red'}})" : `ok(${JSON.stringify(PAGO)})`};
      if(n==='v2_public_cart_order')return ok({id:'o-web',folio:'PED-2026-00032',total:850,items:1});
      if(n==='v2_my_context')return ok([{user_id:'u1',display_name:'Zulema García',organization_id:'o1',organization_name:'Tannery City FC',role:'Operaciones',is_owner:false}]);
      if(n==='v2_my_modules')return ok([{module_code:'commerce',enabled:true,can_read:true,can_write:true},{module_code:'commerce_finance',enabled:true,can_read:true,can_write:true}]);
      if(n==='v2_club_config')return ok({name:'Tannery City FC',whatsapp:'524792651338',paymentInstructions:${JSON.stringify({ transfer:PAGO.transfer, methods:PAGO.methods })}});
      if(n==='v2_orders')return ok(PEDIDOS);
      if(n==='v2_orders_board')return ok(TAB);
      if(n==='v2_order_staff')return ok([{userId:'u-zul',name:'Zul'},{userId:'u-mich',name:'Mich'}]);
      if(n==='v2_set_order_item_sleeve'){for(const t of Object.values(TAB))for(const i of t.items)if(i.id===p.order_item_id)i.manga=p.manga;return ok({manga:p.manga});}
      if(n==='v2_set_order_attendant'){TAB[p.order_id].attendedBy=p.user_id;TAB[p.order_id].attendedManual=!!p.user_id;return ok({});}
      if(n==='v2_confirm_order_number'){TAB[p.order_id].numberConfirmed=p.confirmed?{numeros:['7']}:null;return ok({ok:true});}
      if(n==='v2_orders_to_review')return ok(['o-nuevo'].filter(x=>!revisados.has(x)));
      if(n==='v2_order_detail')return ok(DET[p.order_id]);
      if(n==='v2_mark_order_reviewed'){revisados.add(p.order_id);return ok({orderId:p.order_id});}
      if(n==='v2_warranties')return ok([]);
      if(n==='v2_order_number_check')return ok(asignados.has('t1')
        ?{tanners:[{id:'t1',firstName:'Leo',category:'T10',jersey:'7'}],avisos:[{itemId:'i1',numero:'7',nivel:'ok',playerId:'t1',texto:'#7 es el número de Leo en el club.'}]}
        :{tanners:[{id:'t1',firstName:'Leo',category:'T10',jersey:null}],avisos:[
          {itemId:'i1',numero:'7',nivel:'ok',playerId:'t1',asignable:true,texto:'El #7 está libre en T10 y Leo aún no tiene número.'},
          {itemId:'i2',numero:'14',nivel:'mal',playerId:'t1',texto:'El #14 ya es de Erick García en T10. Pídele a la familia otro número.'}]});
      if(n==='v2_assign_jersey'){asignados.add(p.player_id);return ok({changed:true});}
      if(n==='v2_order_player'){const L={t1:{id:'t1',name:'Leo Ávila',category:'T10'},t9:{id:'t9',name:'Leonardo Ruiz',category:'T6'}};
        if(p.query)return ok({linked:ligado?L[ligado]:null,canWrite:true,suggestions:[L.t9]});
        return ok({linked:ligado?L[ligado]:null,canWrite:true,suggestions:ligado?[]:[{...L.t1,reason:'mismo teléfono que su tutor · nombre del jersey'}]});}
      if(n==='v2_link_order_player'){ligado=p.player_id;return ok(null);}
      return ok(null);}};}`;

const nav = await chromium.launch({ executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
let fallos = 0, corridas = 0;
const revisa = (nombre, ok, detalle) => { corridas++; if (!ok) { fallos++; console.error(` - ${nombre}${detalle ? `\n   ${detalle}` : ''}`); } };

async function abre(ruta, { pagoFalla = false } = {}) {
  const pg = await nav.newPage({ viewport:{ width:Number(process.env.ANCHO || 390), height:844 } });
  const errs = [];
  pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await pg.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await pg.route('**esm.sh/libphonenumber-js**', r => r.fulfill({ status:200, contentType:'text/javascript', body:`
    export function AsYouType(){return{input:v=>v}}
    export function getCountries(){return['MX','US']}
    export function getCountryCallingCode(c){return c==='MX'?'52':'1'}
    export function parsePhoneNumberFromString(v){const d=String(v).replace(/\\D/g,'');
      return{isValid:()=>d.length>=10,formatInternational:()=>'+52 '+d,number:'+52'+d};}` }));
  await pg.route(/\/v2\/supabase-client\.js(\?.*)?$/, r => r.fulfill({ status:200, contentType:'text/javascript', body:CLIENTE(pagoFalla) }));
  await pg.route(/\/v2\/shell\.js(\?.*)?$/, r => r.fulfill({ status:200, contentType:'text/javascript', body:SHELL }));
  await pg.goto(BASE + ruta, { waitUntil:'networkidle' });
  return { pg, errs };
}


/* ===== 1-2. TIENDA ===== */
{
  const { pg, errs } = await abre('/pedido/');
  await pg.waitForSelector('.st-card[data-prod]', { timeout:8000 });
  await pg.click('.st-card[data-prod]');
  await pg.waitForSelector('[data-manga]', { timeout:4000 }).catch(() => {});
  const activa = await pg.$$eval('[data-manga]', bs => bs.map(b => [b.dataset.manga, b.getAttribute('aria-pressed')]));
  revisa('1. el jersey ofrece manga corta y larga, corta por omisión', JSON.stringify(activa) === '[["corta","true"],["larga","false"]]', JSON.stringify(activa));
  await pg.click('[data-talla="10"]');
  await pg.click('[data-manga="larga"]');
  revisa('1. se marca larga', (await pg.getAttribute('[data-manga="larga"]', 'aria-pressed')) === 'true');
  await pg.fill('[data-campo="nombre"]', 'LEO');
  await pg.fill('[data-campo="numero"]', '7');
  await pg.click('#stAgregar');
  await pg.click('#stCarrito');
  await pg.waitForSelector('#orderForm', { timeout:5000 });
  const carrito = await pg.textContent('#content');
  revisa('2. el carrito dice Manga larga', carrito.includes('Manga larga'), carrito.replace(/\s+/g, ' ').slice(0, 300));
  // 16. ¿Lo conviertes en kit?
  const sug = (await pg.textContent('.st-sugiere').catch(() => '')).replace(/\s+/g, ' ');
  revisa('16. el jersey suelto sugiere su kit, con qué incluye y cuánto más', /Kit Training/.test(sug) && /short, calcetas/.test(sug) && /\$1,100\.00/.test(sug) && /\$250\.00 más/.test(sug), sug);
  await pg.click('[data-convierte]');
  await pg.waitForSelector('.st-convierte', { timeout:4000 }).catch(() => {});
  const lleno = await pg.$$eval('.st-pieza .st-pieza-cab span', ss => ss.map(x => x.textContent));
  revisa('16. el kit abre lleno: jersey y short en talla 10, calcetas únicas', JSON.stringify(lleno) === '["Talla 10","Talla 10","Talla Universal"]', JSON.stringify(lleno));
  revisa('16. con su nombre, número y manga', (await pg.inputValue('[data-campo="nombre"]')) === 'LEO' && (await pg.getAttribute('[data-manga="larga"]', 'aria-pressed')) === 'true');
  await pg.click('#stAgregar');
  await pg.waitForSelector('#orderForm', { timeout:5000 }).catch(() => {});
  const ahora = (await pg.textContent('#resumenCarrito').catch(() => '')).replace(/\s+/g, ' ');
  revisa('16. el jersey suelto se cambió por el kit', /Kit Training/.test(ahora) && !/Jersey Home \$/.test(ahora) && /\$1,100\.00/.test(ahora) && !(await pg.$('.st-sugiere')), ahora);
  await pg.fill('#customerName', 'Ana Ávila');
  await pg.fill('#customerPhone', '4771234567');
  await pg.check('#orderDataConsent');
  await pg.click('#submitOrder');
  await pg.waitForSelector('.success', { timeout:5000 }).catch(() => {});
  const items = await pg.evaluate(() => (window.__rpc.find(c => c.n === 'v2_public_cart_order')?.p.items) || []);
  revisa('2. el pedido manda el kit con sleeve "larga", nombre y número', items.length === 1 && items[0].kind === 'bundle' && items[0].sleeve === 'larga' && items[0].personalizationName === 'LEO' && items[0].number === '7', JSON.stringify(items));
  revisa('tienda sin errores', errs.length === 0, errs.join('\n'));
  await pg.close();
}

/* ===== 3-12. ADMIN ===== */
{
  const { pg, errs } = await abre('/v2/pedidos/');
  await pg.waitForSelector('#orderList .order-row .order-items', { timeout:8000 }).catch(() => {});
  const fila = s => `.order-row[data-order-id="${s}"]`;
  const quien = await pg.textContent(`${fila('o-nuevo')} .order-who strong`).catch(() => '');
  revisa('3. el jugador va grande', quien === 'Leo Ávila', quien);
  const pidio = await pg.textContent(`${fila('o-nuevo')} .order-pidio`).catch(() => '');
  revisa('3. y abajo quién lo pidió y cómo llegó', pidio === 'Pidió Ana Sofía Ávila · Compró en línea', pidio);
  const viejo = await pg.textContent(`${fila('o-viejo')} .order-who strong`).catch(() => '');
  revisa('4. sin jugador, la fila dice quién pidió', viejo === 'Abuelo Pérez', viejo);
  revisa('10. el del mostrador dice quién lo levantó', /Lo levantó Zul/.test(await pg.textContent(`${fila('o-viejo')} .order-pidio`).catch(() => '')));
  const piezas = await pg.$$eval(`${fila('o-nuevo')} .order-items li`, ls => ls.map(l => l.innerText.replace(/\s+/g, ' ').trim()));
  revisa('5. las piezas se leen en la fila con manga y número', piezas[0] === 'Jersey Home · Talla 10 · LEO #7 Manga larga' && piezas.length === 3, JSON.stringify(piezas));
  revisa('5. un jersey sin manga lo dice en rojo', /Manga sin definir/.test(piezas[1] || '') && !!(await pg.$(`${fila('o-nuevo')} .t-manga.falta`)), JSON.stringify(piezas));
  revisa('11. la nota del pedido se ve en la fila', /Las dos de manga larga/.test(await pg.textContent(`${fila('o-nuevo')} .t-nota`).catch(() => '')));
  const barra = await pg.textContent(`${fila('o-nuevo')} .order-num`).catch(() => '');
  revisa('6. dice "Número #7 por confirmar"', /Número #7 por confirmar/.test(barra), barra);
  revisa('6. el pedido sin número no trae barra', (await pg.$(`${fila('o-viejo')} .order-num`)) === null);

  const segs = await pg.$$eval('#tSeg [data-f]', bs => bs.map(b => [b.dataset.f, b.querySelector('i').textContent]));
  revisa('12. los filtros traen su cuenta', JSON.stringify(segs) === JSON.stringify([['','2'],['__atender','1'],['__cobrar','1'],['in_production','0'],['ready','0']]), JSON.stringify(segs));
  await pg.click('#tSeg [data-f="__atender"]');
  const solo = await pg.$$eval('.order-row', rs => rs.map(r => r.dataset.orderId));
  revisa('7. "Por atender" deja sólo lo pendiente', JSON.stringify(solo) === '["o-nuevo"]', JSON.stringify(solo));
  await pg.selectOption('#statusFilter', '__numero');
  revisa('7. el filtro "Número por confirmar" sigue', JSON.stringify(await pg.$$eval('.order-row', rs => rs.map(r => r.dataset.orderId))) === '["o-nuevo"]');
  await pg.click('#tSeg [data-f=""]');

  await pg.click(`${fila('o-nuevo')} [data-num-confirma]`);
  await pg.waitForSelector(`${fila('o-nuevo')} .order-num.ok`, { timeout:4000 }).catch(() => {});
  const conf = await pg.evaluate(() => window.__rpc.filter(c => c.n === 'v2_confirm_order_number').map(c => [c.p.order_id, c.p.confirmed]));
  revisa('6. un toque confirma el número', JSON.stringify(conf) === '[["o-nuevo",true]]', JSON.stringify(conf));
  revisa('6. y la fila lo dice', /Número #7 confirmado/.test(await pg.textContent(`${fila('o-nuevo')} .order-num`).catch(() => '')));
  revisa('6. sin abrir el pedido', !(await pg.isVisible('#drawer')));
  await pg.click(`${fila('o-nuevo')} [data-num-deshacer]`);
  await pg.waitForSelector(`${fila('o-nuevo')} .order-num.pendiente`, { timeout:4000 }).catch(() => {});
  const des = await pg.evaluate(() => window.__rpc.filter(c => c.n === 'v2_confirm_order_number').map(c => c.p.confirmed));
  revisa('6. y se puede deshacer', JSON.stringify(des) === '[true,false]', JSON.stringify(des));

  await pg.fill('#orderSearch', 'leo avila');
  const busca = await pg.$$eval('.order-row', rs => rs.map(r => r.dataset.orderId));
  revisa('8. se busca por el nombre del jugador', JSON.stringify(busca) === '["o-nuevo"]', JSON.stringify(busca));
  await pg.fill('#orderSearch', 'zul');
  revisa('8. y por quién lo atendió', JSON.stringify(await pg.$$eval('.order-row', rs => rs.map(r => r.dataset.orderId))) === '["o-viejo"]');
  await pg.fill('#orderSearch', '');

  if (process.env.SHOTS) await pg.screenshot({ path: `${process.env.SHOTS}/lista.png`, fullPage: true });
  await pg.click(`${fila('o-nuevo')} .order-who`);
  await pg.waitForSelector('#drawer:not(.hidden) #orderResumen .t-res-quien', { timeout:5000 }).catch(() => {});
  revisa('3 clics: tocar la fila abre el pedido', await pg.isVisible('#drawer'));
  const res = (await pg.innerText('#orderResumen').catch(() => '')).replace(/\s+/g, ' ');
  revisa('13. el detalle abre con quién, cómo llegó y la nota', /Leo Ávila/.test(res) && /Pidió Ana Sofía Ávila/.test(res) && /Compró en línea/.test(res) && /Las dos de manga larga/.test(res), res);
  revisa('9. el detalle trae el chip de Manga', /Manga: Larga/.test(await pg.innerText('#itemList').catch(() => '')));
  await pg.click('#orderResumen [data-manga-item="i2"][data-m="larga"]');
  await pg.waitForSelector('#orderResumen [data-manga-item="i2"][data-m="larga"].activo', { timeout:4000 }).catch(() => {});
  const mangas = await pg.evaluate(() => window.__rpc.filter(c => c.n === 'v2_set_order_item_sleeve').map(c => [c.p.order_item_id, c.p.manga]));
  revisa('14. la manga se corrige en un toque', JSON.stringify(mangas) === '[["i2","larga"]]', JSON.stringify(mangas));
  await pg.selectOption('#tAtendio', 'u-mich');
  await pg.waitForFunction(() => window.__rpc.some(c => c.n === 'v2_set_order_attendant'), null, { timeout:4000 }).catch(() => {});
  const at = await pg.evaluate(() => window.__rpc.filter(c => c.n === 'v2_set_order_attendant').map(c => [c.p.order_id, c.p.user_id]));
  revisa('15. se marca quién del club lo atendió', JSON.stringify(at) === '[["o-nuevo","u-mich"]]', JSON.stringify(at));
  revisa('15. y la fila lo dice', /atendió Mich/.test(await pg.textContent(`${fila('o-nuevo')} .order-pidio`).catch(() => '')));
  if (process.env.SHOTS) { await pg.evaluate(() => { document.getElementById('drawer').scrollTop = 0; }); await pg.screenshot({ path: `${process.env.SHOTS}/detalle.png` }); }
  revisa('nada se sale a 390px', !(await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
  revisa('admin sin errores', errs.length === 0, errs.join('\n'));
  await pg.close();
}

/* ===== tienda.js: la manga en la línea y en la llave ===== */
{
  const t = await import(path.join(RAIZ, 'v2/tienda.js'));
  const jersey = { id:'j', name:'Jersey Home', price:850, sizes:['10'] };
  const a = t.preparaLinea(jersey, { talla:'10', manga:'larga' }), b = t.preparaLinea(jersey, { talla:'10' });
  revisa('manga larga se guarda; sin elegir es corta', a.linea?.manga === 'larga' && b.linea?.manga === 'corta', JSON.stringify([a, b]));
  revisa('larga y corta son dos renglones', t.llaveDeLinea(a.linea) !== t.llaveDeLinea(b.linea));
  const calceta = t.preparaLinea({ id:'c', name:'Par de calcetas', price:200, sizes:['U'] }, { talla:'U', manga:'larga' });
  revisa('lo que no es jersey no lleva manga', calceta.linea?.manga === null, JSON.stringify(calceta));
}

await nav.close(); srv.close();
console.log(`qa-humo-tienda-tablero: ${corridas - fallos}/${corridas}`);
process.exit(fallos ? 1 : 0);
