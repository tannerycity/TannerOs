/* Pedido pagado: cambiar con motivo, y corregir con bitácora (22/10/2026).
 *
 * Presidencia: "cuando Zul está viendo el que nos pagaron... puede cambiar la
 * manga larga a corta y no dice el por qué... que deba ponerse en editar y que
 * diga por qué se cambió". Y: "quiero que Zul pueda editar o borrar los
 * pedidos y los cobros, pero que haya un registro para yo revisar".
 * Lo que se protege:
 *   1. En un pedido con pagos la manga se ve fija, con "Cambiar"; ya no hay
 *      botones de un toque.
 *   2. "Cambiar" pide el motivo; sin motivo no se guarda.
 *   3. Con motivo va por v2_edit_order_item (bitácora), nunca por el cambio
 *      de un toque.
 *   4. Eliminar el pedido pide motivo y lo manda.
 *   5. Sin el permiso de corregir, no aparece Eliminar.
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
    subtotal:1450, discount:0, total:1450, status:'paid', source:'public_form', notes:null,
    created_at:'2026-10-08T18:00:00Z', delivered_at:null, paid_amount:1450, item_count:2 },
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
const CLIENTE = (pagoFalla, puedeCorregir = true) => `
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
      if(n==='v2_can_correct')return ok(${puedeCorregir});
      if(n==='v2_edit_order_item'||n==='v2_delete_order')return ok({changed:true});
      if(n==='v2_link_order_player'){ligado=p.player_id;return ok(null);}
      return ok(null);}};}`;

const nav = await chromium.launch({ executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
let fallos = 0, corridas = 0;
const revisa = (nombre, ok, detalle) => { corridas++; if (!ok) { fallos++; console.error(` - ${nombre}${detalle ? `\n   ${detalle}` : ''}`); } };

async function abre(ruta, { pagoFalla = false, puedeCorregir = true } = {}) {
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
  await pg.route(/\/v2\/supabase-client\.js(\?.*)?$/, r => r.fulfill({ status:200, contentType:'text/javascript', body:CLIENTE(pagoFalla, puedeCorregir) }));
  await pg.route(/\/v2\/shell\.js(\?.*)?$/, r => r.fulfill({ status:200, contentType:'text/javascript', body:SHELL }));
  await pg.goto(BASE + ruta, { waitUntil:'networkidle' });
  return { pg, errs };
}



const llamadas = (pg, n) => pg.evaluate(x => window.__rpc.filter(r => r.n === x).map(r => r.p), n);
{
  const { pg, errs } = await abre('/v2/pedidos/');
  await pg.waitForSelector('.order-row[data-order-id="o-nuevo"]', { timeout:8000 });
  await pg.click('.order-row[data-order-id="o-nuevo"]');
  await pg.waitForSelector('#orderResumen .t-manga-fija', { timeout:5000 }).catch(() => {});
  revisa('1. pedido pagado: la manga se ve fija con Cambiar', (await pg.locator('#orderResumen .t-manga-fija button').count()) === 2
    && (await pg.locator('#orderResumen .t-seg.mini').count()) === 0);
  await pg.locator('#orderResumen .t-manga-fija button').first().click();
  await pg.waitForSelector('.tosdlg-field', { timeout:3000 }).catch(() => {});
  revisa('2. Cambiar pide el motivo', await pg.isVisible('.tosdlg-field'));
  await pg.click('.tosdlg-ok');
  revisa('2. sin motivo no se guarda', (await pg.isVisible('.tosdlg-field')) && (await llamadas(pg, 'v2_edit_order_item')).length === 0);
  await pg.fill('.tosdlg-field', 'La mamá pidió manga corta');
  await pg.click('.tosdlg-ok');
  await pg.waitForTimeout(400);
  const e = (await llamadas(pg, 'v2_edit_order_item'))[0];
  revisa('3. va por la edición con motivo', e?.reason === 'La mamá pidió manga corta' && e?.manga === 'corta' && e?.order_item_id === 'i1', JSON.stringify(e));
  revisa('3. y nunca por el cambio de un toque', (await llamadas(pg, 'v2_set_order_item_sleeve')).length === 0);
  await pg.waitForSelector('#dangerZone', { state:'attached', timeout:3000 }).catch(() => {});
  await pg.evaluate(() => { const d = document.getElementById('masDetalles'); if (d) d.open = true; document.getElementById('dangerZone')?.scrollIntoView(); });
  revisa('4. con permiso de corregir aparece Eliminar', await pg.isVisible('#deleteOrder'));
  await pg.click('#deleteOrder');
  await pg.waitForSelector('.tosdlg-field', { timeout:3000 }).catch(() => {});
  await pg.fill('.tosdlg-field', 'Pedido duplicado');
  await pg.click('.tosdlg-ok');
  await pg.waitForTimeout(400);
  const d = (await llamadas(pg, 'v2_delete_order'))[0];
  revisa('4. eliminar manda el motivo', d?.reason === 'Pedido duplicado' && d?.order_id === 'o-nuevo', JSON.stringify(d));
  revisa('sin errores de página', !errs.length, errs.join(' | '));
  await pg.close();
}
{
  const { pg, errs } = await abre('/v2/pedidos/', { puedeCorregir: false });
  await pg.waitForSelector('.order-row[data-order-id="o-nuevo"]', { timeout:8000 });
  await pg.click('.order-row[data-order-id="o-nuevo"]');
  await pg.waitForTimeout(800);
  revisa('5. sin permiso no aparece Eliminar', !(await pg.isVisible('#deleteOrder')));
  revisa('5. sin errores', !errs.length, errs.join(' | '));
  await pg.close();
}

await nav.close(); srv.close();
console.log(fallos ? `Pedido pagado humo FAILED · ${fallos} de ${corridas}` : `Pedido pagado humo OK · ${corridas} revisiones: se cambia con motivo y se corrige con bitácora`);
process.exit(fallos ? 1 : 0);
