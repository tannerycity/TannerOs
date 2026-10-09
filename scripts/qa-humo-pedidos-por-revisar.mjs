/* El pedido de punta a punta: la familia pide por el link, sabe cómo pagar,
 * y el club lo ve "por revisar" y lo confirma por WhatsApp en un toque.
 *
 * Pedido de Presidencia y Operaciones (08/10/2026): "que sea bien fácil para
 * la persona que lo va a pedir y para nosotros no estar apuntando todo".
 *
 * Lo que se protege:
 *   LINK PÚBLICO
 *   1. Al terminar, la familia ve la CLABE, el titular y su folio como
 *      referencia, con un botón para copiar la CLABE.
 *   2. "Enviar comprobante por WhatsApp" va al WhatsApp DEL CLUB, con el folio
 *      y el total ya escritos.
 *   3. Si los datos de pago no cargan, el pedido se levanta igual.
 *   PEDIDOS (staff)
 *   4. Arriba sale cuántos pedidos hay por revisar, y el filtro los aísla.
 *   5. El pedido nuevo trae su etiqueta en la lista.
 *   6. La liga del aviso (?pedido=<id>) abre ese pedido directo.
 *   7. "Confirmar por WhatsApp" abre el chat de la FAMILIA con el pedido, las
 *      tallas, la CLABE y la firma de quien lo manda, y lo marca revisado.
 *   8. Un pedido ya revisado no muestra la sección.
 *   9. (D) El número pedido se revisa: si es de otro niño se dice en rojo; si
 *      está libre y el Tanner no tiene, se le asigna en un toque.
 *  10. El link ofrece "¿Ya eres familia Tanner? Entrar" hacia la tienda del
 *      portal; quien no tiene cuenta compra ahí mismo.
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
const OFERTA = { products:[{ id:'p-calceta', name:'Par de calcetas', price:200, sizes:['Universal'], product_type:'socks' }], bundles:[] };

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
      ? [{ id:'i1', description:'Jersey "Wet Blue" - Home Edition', quantity:1, unitPrice:1250, attributes:{ talla:'10', nombrePers:'LEO', numero:'7' } },
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
  let revisados=new Set(),asignados=new Set();
  export function createClient(){return{
    auth:{getSession:async()=>({data:{session:{user:{id:'u1'},access_token:'x'}}}),
      onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}}},
    rpc:async(n,p={})=>{
      window.__rpc.push({n,p:JSON.parse(JSON.stringify(p))});
      const ok=d=>({data:d,error:null});
      if(n==='v2_public_offerings')return ok(${JSON.stringify(OFERTA)});
      if(n==='v2_public_payment_info')return ${pagoFalla ? "({data:null,error:{message:'sin red'}})" : `ok(${JSON.stringify(PAGO)})`};
      if(n==='v2_public_order_enhanced')return ok({folio:'PED-2026-00032',total:200});
      if(n==='v2_my_context')return ok([{user_id:'u1',display_name:'Zulema García',organization_id:'o1',organization_name:'Tannery City FC',role:'Operaciones',is_owner:false}]);
      if(n==='v2_my_modules')return ok([{module_code:'commerce',enabled:true,can_read:true,can_write:true},{module_code:'commerce_finance',enabled:true,can_read:true,can_write:true}]);
      if(n==='v2_club_config')return ok({name:'Tannery City FC',whatsapp:'524792651338',paymentInstructions:${JSON.stringify({ transfer:PAGO.transfer, methods:PAGO.methods })}});
      if(n==='v2_orders')return ok(PEDIDOS);
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
      return ok(null);}};}`;

const nav = await chromium.launch({ executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
let fallos = 0, corridas = 0;
const revisa = (nombre, ok, detalle) => { corridas++; if (!ok) { fallos++; console.error(` - ${nombre}${detalle ? `\n   ${detalle}` : ''}`); } };

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
  await pg.route(/\/v2\/supabase-client\.js(\?.*)?$/, r => r.fulfill({ status:200, contentType:'text/javascript', body:CLIENTE(pagoFalla) }));
  await pg.route(/\/v2\/shell\.js(\?.*)?$/, r => r.fulfill({ status:200, contentType:'text/javascript', body:SHELL }));
  await pg.goto(BASE + ruta, { waitUntil:'networkidle' });
  return { pg, errs };
}

async function pideCalcetas(pg) {
  await pg.waitForSelector('.fam-prod [data-add]', { timeout:8000 });
  await pg.click('.fam-prod [data-add]');
  await pg.waitForSelector('#orderForm', { timeout:5000 });
  await pg.fill('#customerName', 'Ana Ávila');
  await pg.fill('#customerPhone', '4771234567');
  await pg.check('#orderDataConsent');
  await pg.click('#submitOrder');
  await pg.waitForSelector('.success', { timeout:5000 }).catch(() => {});
}

/* ===== LINK PÚBLICO ===== */
{
  const { pg, errs } = await abre('/pedido/');
  await pg.waitForSelector('.ya-familia', { timeout:8000 }).catch(() => {});
  revisa('10. "¿Ya eres familia Tanner?" lleva a la tienda del portal', (await pg.getAttribute('.ya-familia', 'href').catch(() => null)) === '/familias/?tab=tienda');
  await pideCalcetas(pg);
  const texto = await pg.textContent('#content');
  revisa('1. se ve la CLABE completa', texto.includes('167210000079567650'), texto.slice(0, 400));
  revisa('1. y a nombre de quién', texto.includes('Proyecto Leyenda SA de CV'));
  revisa('1. con el folio como referencia', /Referencia\s*PED-2026-00032/.test(texto.replace(/\s+/g, ' ')), texto.replace(/\s+/g, ' ').slice(0, 400));
  revisa('1. y los otros métodos', texto.includes('También aceptamos efectivo y tarjeta en Taquilla.'));
  revisa('1. la CLABE tiene botón de copiar', (await pg.$('[data-copiar="167210000079567650"]')) !== null);
  const wa = await pg.getAttribute('.pago-wa', 'href').catch(() => null);
  revisa('2. el comprobante va al WhatsApp del club', !!wa && wa.startsWith('https://wa.me/524792651338?text='), String(wa));
  const dice = wa ? decodeURIComponent(wa.split('?text=')[1]) : '';
  revisa('2. con folio y total ya escritos', dice.includes('PED-2026-00032') && dice.includes('$200.00') && dice.includes('Ana Ávila'), dice);
  revisa('link público sin errores', errs.length === 0, errs.join('\n'));
  await pg.close();
}
{
  const { pg, errs } = await abre('/pedido/', { pagoFalla:true });
  await pideCalcetas(pg);
  const texto = await pg.textContent('#content');
  revisa('3. sin datos de pago el pedido se levanta igual', texto.includes('Pedido recibido') && texto.includes('PED-2026-00032'), texto.slice(0, 300));
  revisa('3. y no inventa una cuenta', !texto.includes('CLABE') && (await pg.$('.pago-wa')) === null);
  revisa('link público (sin pago) sin errores', errs.length === 0, errs.join('\n'));
  await pg.close();
}

/* ===== PEDIDOS (staff) ===== */
{
  const { pg, errs } = await abre('/v2/pedidos/');
  await pg.waitForSelector('#orderList .order-row', { timeout:8000 }).catch(() => {});
  const banner = await pg.textContent('#reviewBanner').catch(() => '');
  revisa('4. arriba dice cuántos hay por revisar', await pg.isVisible('#reviewBanner') && /1 pedido nuevo por revisar/.test(banner), banner);
  const etiquetas = await pg.$$eval('.order-row', rs => rs.map(r => [r.dataset.orderId, !!r.querySelector('.order-review-tag')]));
  revisa('5. el nuevo trae etiqueta y el viejo no', JSON.stringify(etiquetas) === JSON.stringify([['o-nuevo', true], ['o-viejo', false]]), JSON.stringify(etiquetas));
  await pg.click('#reviewBanner');
  const filas = await pg.$$eval('.order-row', rs => rs.map(r => r.dataset.orderId));
  revisa('4. el aviso filtra sólo los por revisar', JSON.stringify(filas) === '["o-nuevo"]', JSON.stringify(filas));

  await pg.click('.order-row[data-order-id="o-nuevo"]');
  await pg.waitForSelector('#drawer:not(.hidden)', { timeout:5000 }).catch(() => {});
  revisa('7. el pedido nuevo abre con su sección de revisar', await pg.isVisible('#reviewSection'));
  await pg.waitForSelector('#reviewNumeros .review-num', { timeout:4000 }).catch(() => {});
  const nums = await pg.$$eval('#reviewNumeros .review-num', e => e.map(x => [x.className.split(' ')[1], x.innerText]));
  revisa('9. el número ocupado sale en rojo y dice de quién es', nums.some(([c, t]) => c === 'mal' && /El #14 ya es de Erick García/.test(t)), JSON.stringify(nums));
  revisa('9. el libre trae botón para asignárselo', await pg.isVisible('#reviewNumeros [data-asigna="t1"][data-num="7"]'));
  await pg.click('#reviewNumeros [data-asigna="t1"]');
  await pg.waitForFunction(() => /es el número de Leo/.test(document.querySelector('#reviewNumeros')?.innerText || ''), null, { timeout:4000 }).catch(() => {});
  const asig = await pg.evaluate(() => window.__rpc.filter(c => c.n === 'v2_assign_jersey').map(c => [c.p.player_id, c.p.number]));
  revisa('9. un toque lo asigna y se vuelve a revisar', JSON.stringify(asig) === '[["t1","7"]]' && /#7 es el número de Leo/.test(await pg.innerText('#reviewNumeros')), JSON.stringify(asig));
  await pg.click('#confirmWhatsApp');
  await pg.waitForTimeout(500);
  const abiertas = await pg.evaluate(() => window.__abiertas);
  const url = abiertas[0] || '';
  revisa('7. abre el chat de la familia', url.startsWith('https://wa.me/524771234567?text='), url);
  const m = url ? decodeURIComponent(url.split('?text=')[1] || '') : '';
  revisa('7. firmado por quien lo manda', m.startsWith('Hola Ana, te saluda Zulema de Tannery City FC.'), m.split('\n')[0]);
  revisa('7. con piezas, tallas, nombre y número', m.includes('talla 10 · LEO #7') && m.includes('Par de calcetas · talla Universal'), m);
  revisa('7. con la CLABE y el folio como referencia', m.includes('CLABE: 167210000079567650') && m.includes('Referencia: PED-2026-00031'), m);
  const marcado = await pg.evaluate(() => window.__rpc.filter(c => c.n === 'v2_mark_order_reviewed').map(c => c.p.order_id));
  revisa('7. y lo marca revisado', JSON.stringify(marcado) === '["o-nuevo"]', JSON.stringify(marcado));
  revisa('7. ya no queda por revisar', !(await pg.isVisible('#reviewSection')) && !(await pg.isVisible('#reviewBanner')));
  revisa('Pedidos sin errores', errs.length === 0, errs.join('\n'));
  await pg.close();
}
{
  const { pg, errs } = await abre('/v2/pedidos/?pedido=o-viejo');
  await pg.waitForSelector('#drawer:not(.hidden)', { timeout:8000 }).catch(() => {});
  revisa('6. la liga del aviso abre ese pedido', (await pg.textContent('#orderFolio').catch(() => '')) === 'PED-2026-00020');
  revisa('8. un pedido ya revisado no muestra la sección', !(await pg.isVisible('#reviewSection')));
  revisa('Pedidos (liga) sin errores', errs.length === 0, errs.join('\n'));
  await pg.close();
}

await nav.close(); srv.close();
if (fallos) { console.error(`Pedidos por revisar humo FALLA · ${fallos} de ${corridas}`); process.exit(1); }
console.log(`Pedidos por revisar humo OK · ${corridas} revisiones: CLABE con folio, comprobante al club, aviso de por revisar y confirmación por WhatsApp firmada`);
