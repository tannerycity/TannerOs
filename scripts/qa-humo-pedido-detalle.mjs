/* DETALLE DEL PEDIDO ESTILO APPLE (25/10/2026) en Chromium.
 *
 * Presidencia: "lo de ver producción, negocio y estado se ve chafa", un botón
 * para decir que no está pagado y WhatsApp al proveedor; y que ningún número
 * sin confirmar llegue a Tremor. Se revisa:
 *   1. Ya no hay desglose "Ver producción, negocio…": lo raro va en "Más detalles".
 *   2. Arriba dice qué falta en palabras, con "Confirmar número" ahí mismo.
 *   3. WhatsApp al proveedor no sale con el número sin confirmar.
 *   4. Con todo listo, pide el WhatsApp del proveedor una vez y manda el pedido escrito.
 *   5. "No está pagado" pide el motivo y revierte los cobros.
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
  'o-kit':{ playerName:'Leo Ávila', source:'internal_capture', attendedBy:null, attendedName:null, attendedManual:false,
    items:[{ id:'ik', description:'Kit de entrenamiento', quantity:1, talla:'10', manga:null, nombre:null, numero:null, kit:null }] },
  'o-viejo':{ playerName:null, source:'internal_capture', attendedBy:'u-zul', attendedName:'Zul', attendedManual:false,
    items:[{ id:'i9', description:'Hoodie', quantity:1, talla:'L', manga:null, nombre:null, numero:null, kit:null }] }
};

const PEDIDOS = [
  { id:'o-nuevo', folio:'PED-2026-00031', customer_name:'Ana Sofía Ávila', customer_phone:'+524771234567', customer_email:null,
    subtotal:1450, discount:0, total:1450, status:'paid', source:'public_form', notes:null,
    created_at:'2026-10-08T18:00:00Z', delivered_at:null, paid_amount:1450, item_count:2 },
  { id:'o-viejo', folio:'PED-2026-00020', customer_name:'Abuelo Pérez', customer_phone:'+524779876543', customer_email:null,
    subtotal:699, discount:0, total:699, status:'paid', source:'public_form', notes:null,
    created_at:'2026-10-01T18:00:00Z', delivered_at:null, paid_amount:699, item_count:1 },
  // Premio por puntualidad (09/11/2026): el kit de agosto de un Tanner que pagó a tiempo de enero a mayo.
  { id:'o-kit', folio:'PED-2027-00101', customer_name:'Ana Sofía Ávila', customer_phone:'+524771234567', customer_email:null,
    subtotal:1500, discount:0, total:1500, status:'pending_payment', source:'internal_capture', notes:null, player_id:'t1',
    created_at:'2027-08-03T18:00:00Z', delivered_at:null, paid_amount:0, item_count:1 }
];
const detalle = id => {
  const o = PEDIDOS.find(x => x.id === id);
  return { order:{ ...o }, balance:o.total - o.paid_amount, paymentPlan:null, profitability:null,
    payments: id === 'o-nuevo' ? [{ id:'pay1', amount:1450, status:'posted', paymentDate:'2026-10-25', method:'transfer', payerType:'guardian', payerName:'Ana' }] : [],
    readiness: id === 'o-nuevo' ? { ok:false, missing:['número sin confirmar'], paidPercent:100, effectivePaymentRequirementPercent:100 } : { ok:true, missing:[], paidPercent:100 },
    items: id === 'o-nuevo'
      ? [{ id:'i1', productId:'p-home', description:'Jersey "Wet Blue" - Home Edition', quantity:1, unitPrice:1250, attributes:{ talla:'10', manga:'larga', nombrePers:'LEO', numero:'7' } },
         { id:'i2', description:'Par de calcetas', quantity:1, unitPrice:200, attributes:{ talla:'Universal' } }]
      : [{ id:'i3', description:'Hoodie', quantity:1, unitPrice:699, attributes:{ talla:'L' } }] };
};

// La foto de cada prenda (02/11/2026): del catálogo, por producto o por nombre.
const CATALOGO = { products:[
  { id:'p-home', name:'Jersey Wet Blue', photoThumbPath:'productos/home-mini.jpg', photoPath:'productos/home.jpg', photoBucket:'tanneros-private' },
  { id:'p-calceta', name:'Par de calcetas', photoThumbPath:null, photoPath:'productos/calcetas.jpg', photoBucket:'tanneros-private' },
  { id:'p-away', name:'Jersey Away', photoThumbPath:null, photoPath:null, photoBucket:null }], bundles:[] };
const GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

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
  window.__firmas=[];
  export function createClient(){return{
    auth:{getSession:async()=>({data:{session:{user:{id:'u1'},access_token:'x'}}}),
      onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}}},
    storage:{from:b=>({createSignedUrls:async ps=>{window.__firmas.push({b,ps});return{data:ps.map(p=>({path:p,signedUrl:'${GIF}'})),error:null};},
      createSignedUrl:async p=>({data:{signedUrl:'${GIF}'},error:null})})},
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
      if(n==='v2_catalog')return ok(${JSON.stringify(CATALOGO)});
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
      if(n==='v2_edit_order_item'||n==='v2_delete_order'||n==='v2_correct_order_payment')return ok({changed:true});
      if(n==='v2_link_order_player'){ligado=p.player_id;return ok(null);}
      if(n==='v2_punctuality_status')return ok(p.player_id==='t1'?{year:2027,kit:{state:'ganado',onTime:5,of:5,percent:20},december:{state:'en_curso',onTime:7,of:11,percent:50},
        kitCode:{code:'PUNTUAL27RTYE',startsOn:'2027-06-01',endsOn:'2027-08-31',used:false,expired:false,orderFolio:null}}:null);
      if(n==='v2_apply_order_code')return ok({ok:true,total:1200});
      return ok(null);}};}`;

const nav = await chromium.launch({ executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
let fallos = 0, corridas = 0;
const revisa = (nombre, ok, detalle) => { corridas++; if (!ok) { fallos++; console.error(` - ${nombre}${detalle ? `\n   ${detalle}` : ''}`); } };

async function abre(ruta, { pagoFalla = false, puedeCorregir = true } = {}) {
  const pg = await nav.newPage({ viewport:{ width:Number(process.env.ANCHO || 390), height:844 } });
  // Estas revisiones son de la vista Por paso (Todos es la vista inicial desde 01/11/2026).
  await pg.addInitScript(() => { try { localStorage.setItem('tos-pedidos-vista', 'pasos'); } catch {} });
  const errs = [];
  pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await pg.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await pg.route('**/vendor/libphonenumber-js.mjs*', r => r.fulfill({ status:200, contentType:'text/javascript', body:`
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
const texto = async (pg, sel) => (await pg.textContent(sel)).replace(/\s+/g, ' ').trim();
{
  const { pg, errs } = await abre('/v2/pedidos/');
  await pg.waitForSelector('.order-row[data-order-id="o-nuevo"]', { timeout:8000 });
  await pg.click('.order-row[data-order-id="o-nuevo"]');
  await pg.waitForSelector('#drawer:not(.hidden)', { timeout:5000 });
  await pg.waitForTimeout(300);
  if (process.env.SHOTS) await pg.screenshot({ path:`${process.env.SHOTS}/pedido-detalle.png`, fullPage:false });
  await pg.waitForSelector('#orderResumen .t-pieza-foto img', { timeout:4000 }).catch(() => {});
  await pg.waitForTimeout(200);
  const fotos = await pg.$$eval('#orderResumen .t-pieza-foto', es => es.map(e => `${e.dataset.fotoItem}:${e.querySelector('img') ? 'foto' : e.querySelector('svg') ? 'icono' : '-'}`));
  revisa('6. cada pieza trae la foto del catálogo (por producto o por nombre); sin foto, el ícono', JSON.stringify(fotos) === JSON.stringify(['i1:foto','i2:icono','i3:foto']), JSON.stringify(fotos));
  const firmas = await pg.evaluate(() => window.__firmas);
  revisa('6. firma la miniatura cuando existe y la foto grande si no hay miniatura, de una vez', firmas.length === 1 && JSON.stringify([...firmas[0].ps].sort()) === JSON.stringify(['productos/calcetas.jpg','productos/home-mini.jpg']), JSON.stringify(firmas));
  const caja = await pg.$eval('#orderResumen .t-pieza-foto', e => { const r = e.getBoundingClientRect(); return { w:Math.round(r.width), h:Math.round(r.height) }; });
  const lado = Number(process.env.ANCHO || 390) <= 520 ? 60 : 72;
  revisa(`6. la foto se ve (cuadro de ${lado} px)`, caja.w === lado && caja.h === lado, JSON.stringify(caja));
  revisa('1. ya no está "Ver producción, negocio y estado"', (await pg.$$('#toggleFullDetail')).length === 0 && !(await pg.evaluate(() => document.getElementById('masDetalles').open)));
  const listo = await texto(pg, '#readinessBox');
  revisa('2. arriba dice qué falta en palabras', /Antes de mandarlo al proveedor/.test(listo) && /Confirma el número con la familia/.test(listo), listo);
  revisa('2. con el botón para confirmarlo ahí', await pg.isVisible('#readinessBox [data-num-confirma]'));
  // Auditoría UX (11/11/2026): un solo "Confirmar número", botones de tamaño normal y la edición de piezas plegada.
  revisa('7. un solo "Confirmar número" a la vista', (await pg.$$eval('#drawer [data-num-confirma]', bs => bs.filter(b => b.offsetParent).length)) === 1);
  const altos = await pg.$$eval('#statusActions .status-btn', bs => bs.map(b => Math.round(b.getBoundingClientRect().height)));
  revisa('7. los botones de estado no son gigantes', altos.every(h => h >= 44 && h <= 64), JSON.stringify(altos));
  revisa('7. editar pieza va plegado', (await pg.$$eval('#itemList .item-edit', ds => ds.filter(d => !d.open).length)) >= 1 && !(await pg.isVisible('#itemList .save-item')));
  const chicos = await pg.$$eval('#drawer button, #drawer summary, #drawer select', bs => bs.filter(b => b.offsetParent && b.getBoundingClientRect().height < 44).map(b => b.textContent.replace(/\s+/g, ' ').trim().slice(0, 30)));
  revisa('7. todo lo que se toca mide 44 px o más', chicos.length === 0, JSON.stringify(chicos));
  await pg.click('#pasoAcciones [data-paso="proveedor"]');
  await pg.waitForSelector('.tosdlg', { timeout:3000 }).catch(() => {});
  revisa('3. WhatsApp al proveedor no sale sin confirmar el número', /Confirma el número primero/.test(await pg.evaluate(() => document.body.innerText)) && (await pg.evaluate(() => window.__abiertas.length)) === 0);
  await pg.click('.tosdlg-ok'); await pg.waitForTimeout(150);
  await pg.click('#readinessBox [data-num-confirma]');
  await pg.waitForTimeout(400);
  const c = (await llamadas(pg, 'v2_confirm_order_number'))[0];
  revisa('2. confirmar desde arriba manda la confirmación', c?.order_id === 'o-nuevo' && c?.confirmed === true, JSON.stringify(c));
  revisa('5. "No está pagado" aparece si hay cobros', await pg.isVisible('#noPagado'));
  await pg.click('#noPagado');
  await pg.waitForSelector('.tosdlg-field', { timeout:3000 }).catch(() => {});
  await pg.click('.tosdlg-ok');
  revisa('5. sin motivo no se quita nada', (await llamadas(pg, 'v2_correct_order_payment')).length === 0);
  await pg.fill('.tosdlg-field', 'La transferencia no llegó');
  await pg.click('.tosdlg-ok');
  await pg.waitForTimeout(400);
  const k = (await llamadas(pg, 'v2_correct_order_payment'))[0];
  revisa('5. revierte el cobro con el motivo', k?.payment_id === 'pay1' && k?.reason === 'La transferencia no llegó', JSON.stringify(k));
  revisa('sin errores de página', !errs.length, errs.join(' | '));
  await pg.close();
}
{
  const { pg, errs } = await abre('/v2/pedidos/');
  await pg.waitForSelector('.order-row', { timeout:8000 });
  await pg.evaluate(v => { const s = document.getElementById('statusFilter'); s.value = v; s.dispatchEvent(new Event('change')); }, '');
  await pg.waitForSelector('.order-row[data-order-id="o-viejo"]', { timeout:8000 });
  await pg.click('.order-row[data-order-id="o-viejo"]');
  await pg.waitForSelector('#drawer:not(.hidden)', { timeout:5000 });
  await pg.waitForTimeout(300);
  revisa('2. listo: lo dice en verde', /Listo para el proveedor/.test(await texto(pg, '#readinessBox')) && (await pg.getAttribute('#readinessBox', 'data-ready')) === 'true');
  revisa('5. sin cobros no aparece "No está pagado"', !(await pg.isVisible('#noPagado')));
  await pg.click('#pasoAcciones [data-paso="proveedor"]');
  await pg.waitForSelector('.tosdlg-field', { timeout:3000 }).catch(() => {});
  await pg.fill('.tosdlg-field', '477 111 2222');
  await pg.click('.tosdlg-ok');
  await pg.waitForTimeout(300);
  const url = await pg.evaluate(() => window.__abiertas.at(-1) || '');
  const msg = decodeURIComponent(url.split('text=')[1] || '');
  revisa('4. pide el WhatsApp del proveedor y abre el chat', url.startsWith('https://wa.me/524771112222?text='), url);
  revisa('4. el mensaje lleva el folio y la pieza con su talla', /PED-2026-00020/.test(msg) && /Hoodie \| Talla L/.test(msg), msg);
  await pg.click('#pasoAcciones [data-paso="proveedor"]');
  await pg.waitForTimeout(200);
  revisa('4. la segunda vez ya no lo vuelve a pedir', (await pg.evaluate(() => window.__abiertas.length)) === 2 && !(await pg.isVisible('.tosdlg-field')));
  await pg.evaluate(() => { document.getElementById('masDetalles').open = true; });
  revisa('4. en Más detalles se puede cambiar', /4771112222 · Cambiar/.test(await texto(pg, '#telProveedor')), await texto(pg, '#telProveedor'));
  revisa('sin errores de página', !errs.length, errs.join(' | '));
  await pg.close();
}
// Premio por puntualidad: 20% en el kit, con un toque (09/11/2026, TC-146).
{
  const { pg, errs } = await abre('/v2/pedidos/');
  await pg.waitForSelector('.order-row', { timeout:8000 });
  await pg.evaluate(v => { const s = document.getElementById('statusFilter'); s.value = v; s.dispatchEvent(new Event('change')); }, '');
  await pg.waitForSelector('.order-row[data-order-id="o-kit"]', { timeout:8000 });
  await pg.click('.order-row[data-order-id="o-kit"]');
  await pg.waitForSelector('#orderPremio:not(.hidden)', { timeout:5000 }).catch(() => {});
  revisa('6. el pedido dice el código del Tanner, su vigencia y que es de un uso', /Tiene su código de puntualidad: PUNTUAL27RTYE/.test(await texto(pg, '#orderPremio')) && /1 jun al 31 ago/.test(await texto(pg, '#orderPremio')) && /un solo uso/.test(await texto(pg, '#orderPremio')), await texto(pg, '#orderPremio'));
  const pz = await llamadas(pg, 'v2_punctuality_status');
  revisa('6. pregunta por el año del pedido', pz.at(-1)?.player_id === 't1' && pz.at(-1)?.year === 2027, JSON.stringify(pz.at(-1)));
  await pg.click('#orderPremio [data-premio-kit]');
  await pg.waitForTimeout(300);
  const ds = (await llamadas(pg, 'v2_apply_order_code'))[0];
  revisa('6. aplica SU código al pedido (mismo camino que la tienda: vigencia y un uso)', ds?.order_id === 'o-kit' && ds?.code === 'PUNTUAL27RTYE', JSON.stringify(ds));
  await pg.click('#drawer [data-close], #closeDrawer').catch(() => {});
  await pg.click('.order-row[data-order-id="o-viejo"]').catch(() => {});
  await pg.waitForTimeout(300);
  revisa('6. un pedido sin Tanner no ofrece premio', !(await pg.isVisible('#orderPremio')));
  revisa('sin errores de página', !errs.length, errs.join(' | '));
  await pg.close();
}
/* ===== EDITAR LA PRENDA EN SU TARJETA (13/11/2026) =====
   Presidencia: "no deja editar los datos desde aquí, quiero editar la talla".
   Antes sólo se podía hasta abajo de la hoja. Y "que se pueda poner que no
   aplica el número... ejemplo con un papá". */
{
  const { pg, errs } = await abre('/v2/pedidos/');
  await pg.waitForSelector('.order-row', { timeout:8000 });
  await pg.evaluate(v => { const s = document.getElementById('statusFilter'); s.value = v; s.dispatchEvent(new Event('change')); }, '');
  await pg.waitForSelector('.order-row[data-order-id="o-kit"]', { timeout:8000 });
  await pg.click('.order-row[data-order-id="o-kit"]');
  await pg.waitForSelector('#orderResumen [data-edita-pieza]', { timeout:5000 });
  revisa('8. cada prenda del resumen trae "Editar", arriba, sin bajar', (await pg.$$('#orderResumen [data-edita-pieza]')).length === 1 && !(await pg.$('#orderResumen .t-pieza-forma')));
  await pg.click('#orderResumen [data-edita-pieza="ik"]');
  await pg.waitForSelector('#orderResumen .t-pieza-forma');
  revisa('8. Editar abre la tarjeta con talla, nombre, número y nota, con la talla que traía', await pg.inputValue('.t-pieza-forma [name="talla"]') === '10' && await pg.isVisible('.t-pieza-forma [name="nombre"]') && await pg.isVisible('.t-pieza-forma [name="numero"]') && await pg.isVisible('.t-pieza-forma [name="nota"]'));
  revisa('8. todo lo de la tarjeta mide 44 px o más', await pg.$$eval('.t-pieza-forma input:not([type=checkbox]), .t-pieza-forma button', es => es.every(e => e.getBoundingClientRect().height >= 44)));
  await pg.type('.t-pieza-forma [name="numero"]', '1a2b345');
  revisa('8. el número sólo acepta dígitos y hasta tres', await pg.inputValue('.t-pieza-forma [name="numero"]') === '123');
  await pg.fill('.t-pieza-forma [name="talla"]', '12');
  await pg.fill('.t-pieza-forma [name="nombre"]', 'PAPÁ');
  await pg.check('.t-pieza-forma [name="sinNumero"]');
  revisa('8. "Sin número" borra y apaga el campo', await pg.inputValue('.t-pieza-forma [name="numero"]') === '' && await pg.isDisabled('.t-pieza-forma [name="numero"]'));
  if (process.env.SHOTS) await pg.screenshot({ path:`${process.env.SHOTS}/pedido-editar-prenda.png`, fullPage:false });
  await pg.click('.t-pieza-forma [type="submit"]'); await pg.waitForTimeout(400);
  const g = (await llamadas(pg, 'v2_update_order_item_fulfillment'))[0] || {};
  revisa('8. Guardar manda la talla nueva y el número vacío, sin pedir motivo (no tiene pagos)', g.order_item_id === 'ik' && g.size === '12' && g.personalization_name === 'PAPÁ' && g.number === null, JSON.stringify(g));
  await pg.click('#drawer [data-close], #closeDrawer').catch(() => {});
  // Con pagos: el mismo botón, pero pide el motivo y queda en la bitácora.
  await pg.click('.order-row[data-order-id="o-nuevo"]');
  await pg.waitForSelector('#orderResumen [data-edita-pieza="i1"]', { timeout:5000 });
  await pg.click('#orderResumen [data-edita-pieza="i1"]');
  await pg.fill('.t-pieza-forma [name="talla"]', '14');
  await pg.click('.t-pieza-forma [type="submit"]');
  await pg.waitForSelector('.tosdlg-backdrop', { timeout:3000 }).catch(() => {});
  revisa('8. con pagos, guardar pide el motivo', await pg.isVisible('.tosdlg-backdrop'));
  await pg.fill('.tosdlg-backdrop input, .tosdlg-backdrop textarea', 'La mamá pidió una talla más');
  await pg.click('.tosdlg-ok'); await pg.waitForTimeout(400);
  const m = (await llamadas(pg, 'v2_edit_order_item'))[0] || {};
  revisa('8. y el cambio va con su motivo, sin tocar lo demás de la prenda', m.order_item_id === 'i1' && m.size === '14' && m.number === '7' && m.personalization_name === 'LEO' && /talla más/.test(m.reason || ''), JSON.stringify(m));
  revisa('sin errores de página', !errs.length, errs.join(' | '));
  await pg.close();
}
await nav.close(); srv.close();
if (fallos) { console.error(`Detalle del pedido humo: ${fallos} de ${corridas} fallaron`); process.exit(1); }
console.log(`Detalle del pedido humo OK · ${corridas} revisiones: qué falta arriba, número confirmado, WhatsApp al proveedor y No está pagado y la foto de cada prenda`);
