/* TAQUILLA COBRA LOS PEDIDOS DE LA TIENDA.
 *
 * Pedido así: "cuando cobramos en Taquilla le ponemos Otro ingreso ·
 * Uniforme… que esté conectado con la tienda, que sea muy fácil". Los
 * uniformes se mandan a hacer y se aceptan anticipos.
 *
 * Medido el 02/10/2026: 9 cobros de "Otro ingreso · Uniforme" en TannerOS,
 * $10,318, ninguno ligado a un pedido. El pedido nunca se enteraba del
 * anticipo y la hoja de producción no veía la talla.
 *
 * Esta prueba levanta la Taquilla REAL y revisa:
 *   · que la pestaña "Tienda / uniformes" enseñe los pedidos con saldo, con
 *     lo que llevan (talla, nombre y número);
 *   · que elegir al Tanner deje su pedido listo y el monto en lo que falta;
 *   · que "Mitad" sirva para el anticipo y que el cobro vaya LIGADO al pedido,
 *     con quién de Tannery cobró;
 *   · que no se pueda cobrar más de lo que falta;
 *   · que "Otro ingreso · Uniforme" avise y mande a la pestaña correcta;
 *   · que "Nuevo pedido" abra el mostrador con el Tanner ya elegido;
 *   · que el regreso del mostrador abra el cobro con el pedido elegido;
 *   · que quien no puede escribir en Tienda no vea la pestaña.
 */
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const T = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
            '.svg':'image/svg+xml','.json':'application/json','.png':'image/png' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('no'); return; }
  r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
  r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(4740, r));

const PEDIDOS = [
  { id:'o1', folio:'PED-2026-0002', status:'ready', playerId:'p1', playerName:'Matías Campos Rizo', category:'T10',
    customerName:'Matías Campos Rizo', total:2350, paid:1500, balance:850,
    items:[{ description:'Jersey "Black" Edition', quantity:1, talla:'12', nombre:'Matías', numero:'11', kit:null },
           { description:'Short', quantity:1, talla:'14', nombre:null, numero:null, kit:null }] },
  { id:'o2', folio:'PED-2026-0007', status:'pending_payment', playerId:null, playerName:null, category:null,
    customerName:'Abuelo Pérez', total:699, paid:0, balance:699,
    items:[{ description:'Jersey "Wet Blue"', quantity:1, talla:'L', nombre:null, numero:null, kit:null }] }
];

const shell = (puedeTienda, veCobranza = true) => `
  window.__rpc = [];
  window.tosConfirm = async () => true;
  window.tosAlert = async (o) => { window.__alerta = o; };
  export const supabase = { auth:{ getSession:async()=>({data:{session:{user:{id:'u1'}}}}),
    getUser:async()=>({data:{user:{id:'u1',app_metadata:{}}}}), signOut:async()=>({}),
    onAuthStateChange(){ return {data:{subscription:{unsubscribe(){}}}}; } } };
  export const money = new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:2});
  export const $ = id => document.getElementById(id);
  export async function rpc(name, params={}){
    window.__rpc.push({name, params});
    if(name==='v2_cashier_snapshot') return { businessDate:'2026-10-02', incomeTotal:0, expenseTotal:0, netTotal:0,
      expectedCash:0, cashTodayNet:0, methods:[], movements:[], canViewLedger:false };
    if(name==='v2_billing_players') return [{player_id:'p1',player_name:'Matías Campos Rizo',base_monthly_fee:500,billing_status:'active'},
                                            {player_id:'p2',player_name:'Dario Montalvo Díaz',base_monthly_fee:500,billing_status:'active'}];
    if(name==='v2_open_receivables') return [];
    if(name==='v2_players') return [{id:'p1',first_name:'Matías',last_name:'Campos Rizo',status_value:'active'},
                                    {id:'p9',first_name:'Baja',last_name:'Ejemplo',status_value:'withdrawn'}];
    if(name==='v2_orders_to_collect') return ${JSON.stringify(PEDIDOS)};
    if(name==='v2_post_order_payment_at_cashier') return 'pago-1';
    if(name==='v2_parking_passes') return { season:2026, price:200, prices:{tanner:200,vip:200}, passes:[
      { id:'g2', status:'requested', plate:'JAL-555-B', holder:'Dario Montalvo Díaz', player_id:'p2', category:'T10', pass_type:'tanner', is_courtesy:false, balance:0 },
      { id:'g4', status:'requested', plate:'QRO-111-X', holder:'Staff Gratis', player_id:null, pass_type:'tanner', is_courtesy:true, balance:0 },
      { id:'g1', status:'issued', plate:'GTO-123-A', holder:'Matías Campos Rizo', player_id:'p1', pass_type:'tanner', is_courtesy:false, balance:0 } ] };
    if(name==='v2_parking_express') return { ok:true, folio:'TC009', paid:200, method:params.method };
    return null;
  }
  export function moduleAccess(rows, code, write=false){
    const m = { taquilla:{r:true,w:true}, tienda:{r:${puedeTienda},w:${puedeTienda}},
                cobranza:{r:${veCobranza},w:${veCobranza}}, jugadores:{r:true,w:true},
                estacionamiento:{r:true,w:${puedeTienda}} };
    const e = m[code]; if(!e) return false; return write ? e.w : e.r;
  }
  export function setShellHealth(){}
  export function navigationMap(){ return new Map(); }
  export async function bootstrapProtectedShell(){
    return { ctx:{ organization_id:'o1', organization_name:'Tannery City FC', role:'Taquilla', is_owner:false }, navigation:[] };
  }
  export const shellIcon = () => '';
  export const navItems = [];
  export function setShellSearchItems(){}
  export function renderShell(){}
`;

const nav = await chromium.launch({ executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
let fallos = 0, corridas = 0;
const revisa = (nombre, ok, detalle) => { corridas++; if (!ok) { fallos++; console.error(` - ${nombre}${detalle ? `\n   ${detalle}` : ''}`); } };

async function abre(puedeTienda, ruta = '/v2/taquilla/', veCobranza = true) {
  const pg = await nav.newPage({ viewport:{ width:430, height:900 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  await pg.route('**/v2/shell.js', r => r.fulfill({ status:200, contentType:'text/javascript', body:shell(puedeTienda, veCobranza) }));
  await pg.route('**/v2/photo-cache.js', r => r.fulfill({ status:200, contentType:'text/javascript',
    body:'export async function getSignedPhotoUrls(){return {};}export async function getSignedPhotoUrl(){return null;}export async function getRawSignedPhotoUrl(){return null;}export function forgetPhoto(){}export function clearPhotoCache(){}' }));
  await pg.route('**esm.sh/jspdf**', r => r.fulfill({ status:200, contentType:'text/javascript', body:'export class jsPDF{}' }));
  await pg.goto('http://127.0.0.1:4740' + ruta, { waitUntil:'networkidle' });
  await pg.waitForTimeout(400);
  return { pg, errs };
}

/* ===== EL CAMINO NORMAL: buscar al Tanner y cobrar el anticipo ===== */
{
  const { pg, errs } = await abre(true);
  await pg.click('#openCollect');
  revisa('la pestaña Tienda / uniformes existe para Taquilla', await pg.isVisible('#tabTienda'));
  await pg.click('#tabTienda'); await pg.waitForTimeout(300);
  const lista = await pg.$$eval('.tienda-pedido', e => e.map(x => x.innerText));
  revisa('sin Tanner elegido se ven todos los pedidos con saldo', lista.length === 2, JSON.stringify(lista));
  revisa('cada pedido dice qué lleva: talla, nombre y número',
    /T\. 12 · MATÍAS #11/.test(lista[0] || ''), lista[0]);
  revisa('y cuánto falta', /Falta\s*\$850/.test(lista[0] || ''), lista[0]);

  await pg.fill('#tiendaPlayerSearch', 'matias');
  await pg.click('#tiendaPlayerResults .tsearch-opt');
  await pg.waitForTimeout(200);
  const tras = await pg.evaluate(() => ({
    pedidos: document.querySelectorAll('.tienda-pedido').length,
    elegido: document.querySelector('.tienda-pedido.on')?.dataset.pedido,
    monto: document.getElementById('tiendaAmount').value,
    nuevo: document.getElementById('tiendaNuevo').getAttribute('href'),
    boton: !document.getElementById('saveCollect').classList.contains('hidden')
  }));
  revisa('al elegir al Tanner sólo quedan sus pedidos', tras.pedidos === 1, JSON.stringify(tras));
  const escrito = await pg.inputValue('#tiendaPlayerSearch');
  revisa('el buscador queda con el nombre y no con "Sin adeudo" pegado', escrito === 'Matías Campos Rizo', escrito);
  revisa('si tiene uno solo, ya queda elegido', tras.elegido === 'o1', JSON.stringify(tras));
  revisa('el monto arranca en lo que falta', tras.monto === '850', tras.monto);
  revisa('"Nuevo pedido" abre el mostrador con el Tanner elegido',
    tras.nuevo === '/v2/captura/?desde=taquilla&tanner=p1', tras.nuevo);
  revisa('aparece el botón de cobrar', tras.boton);

  await pg.click('.tienda-atajos [data-parte="0.5"]');
  revisa('"Mitad" deja el anticipo', await pg.inputValue('#tiendaAmount') === '425');
  if (process.env.QA_CAPTURA) await pg.screenshot({ path: process.env.QA_CAPTURA, fullPage: true });
  await pg.fill('#tiendaCollectedBy', 'Zul');
  await pg.click('#saveCollect'); await pg.waitForTimeout(400);
  const cobro = await pg.evaluate(() => window.__rpc.find(c => c.name === 'v2_post_order_payment_at_cashier')?.params || null);
  revisa('el cobro va LIGADO al pedido', cobro?.order_id === 'o1', JSON.stringify(cobro));
  revisa('por el anticipo, no por el total', cobro?.amount === 425, JSON.stringify(cobro));
  revisa('con quién de Tannery cobró', cobro?.collected_by_name === 'Zul', JSON.stringify(cobro));
  revisa('y con llave contra el doble clic', /^cashier-order:/.test(cobro?.idempotency_key || ''), cobro?.idempotency_key);
  revisa('nada se cobra como Otro ingreso', !(await pg.evaluate(() => window.__rpc.some(c => c.name === 'v2_post_general_income'))));
  revisa('sin errores de consola', errs.length === 0, errs.join(' | '));
  await pg.close();
}

/* ===== NO SE COBRA DE MÁS ===== */
{
  const { pg } = await abre(true);
  await pg.click('#openCollect'); await pg.click('#tabTienda'); await pg.waitForTimeout(300);
  await pg.click('.tienda-pedido[data-pedido="o2"]');
  await pg.fill('#tiendaAmount', '900');
  await pg.click('#saveCollect'); await pg.waitForTimeout(300);
  const msg = await pg.textContent('#collectMessage');
  revisa('no deja cobrar más de lo que falta', /sólo le faltan/.test(msg || ''), msg);
  revisa('y no llama al cobro', !(await pg.evaluate(() => window.__rpc.some(c => c.name === 'v2_post_order_payment_at_cashier'))));
  await pg.close();
}

/* ===== OTRO INGRESO · UNIFORME AVISA ===== */
{
  const { pg } = await abre(true);
  await pg.click('#openCollect');
  await pg.click('.cashier-tabs [data-mode="general"]');
  await pg.selectOption('#generalCategory', 'Uniforme');
  revisa('elegir Uniforme en Otro ingreso avisa', await pg.isVisible('#generalTiendaAviso'));
  await pg.click('#irATienda'); await pg.waitForTimeout(300);
  revisa('y el aviso lleva a Tienda / uniformes', await pg.isVisible('#tiendaFields'));
  await pg.close();
}

/* ===== DE REGRESO DEL MOSTRADOR ===== */
{
  const { pg } = await abre(true, '/v2/taquilla/?cobrar=tienda&tanner=p1&pedido=o1');
  await pg.waitForTimeout(400);
  const r = await pg.evaluate(() => ({
    abierto: !document.getElementById('collectModal').classList.contains('hidden'),
    tienda: !document.getElementById('tiendaFields').classList.contains('hidden'),
    elegido: document.querySelector('.tienda-pedido.on')?.dataset.pedido, url: location.search
  }));
  revisa('el regreso del mostrador abre el cobro en Tienda con el pedido elegido',
    r.abierto && r.tienda && r.elegido === 'o1', JSON.stringify(r));
  revisa('y limpia la dirección para que recargar no vuelva a abrirlo', r.url === '', r.url);
  await pg.close();
}

/* ===== OPERACIONES: COBRA LA TIENDA SIN VER COBRANZA =====
   El buscador de Taquilla salía de v2_billing_players, que pide Cobranza.
   Zul (Operaciones) cobra sin ver Cobranza: para la tienda basta el padrón. */
{
  const { pg, errs } = await abre(true, '/v2/taquilla/', false);
  await pg.click('#openCollect'); await pg.click('#tabTienda'); await pg.waitForTimeout(400);
  await pg.fill('#tiendaPlayerSearch', 'matias'); await pg.waitForTimeout(200);
  const opciones = await pg.$$eval('#tiendaPlayerResults .tsearch-opt', e => e.map(x => x.textContent));
  revisa('sin Cobranza, el buscador de la tienda encuentra al Tanner por el padrón', opciones.length === 1, JSON.stringify(opciones));
  await pg.fill('#tiendaPlayerSearch', 'baja'); await pg.waitForTimeout(200);
  revisa('y no ofrece Tanners dados de baja', (await pg.$$('#tiendaPlayerResults .tsearch-opt')).length === 0);
  // Y la mensualidad: desde i2 Operaciones cobra mensualidades con permiso de
  // Taquilla, así que su buscador tampoco puede salir vacío.
  await pg.click('.cashier-tabs [data-mode="player"]');
  await pg.fill('#collectPlayerSearch', 'matias'); await pg.waitForTimeout(200);
  revisa('sin Cobranza, el buscador de mensualidad también encuentra al Tanner',
    (await pg.$$('#collectPlayerResults .tsearch-opt')).length === 1);
  revisa('sin errores de consola (Operaciones)', errs.length === 0, errs.join(' | '));
  await pg.close();
}

/* ===== ESTACIONAMIENTO: "en Taquilla se puede cobrar todo" ===== */
{
  const { pg, errs } = await abre(true);
  await pg.click('#openCollect');
  revisa('la pestaña Estacionamiento existe en Taquilla', await pg.isVisible('#tabGafete'));
  await pg.click('#tabGafete'); await pg.waitForTimeout(300);
  const lista = await pg.$$eval('.gafete-item', e => e.map(x => x.innerText));
  revisa('enseña los gafetes por cobrar, no los entregados ni los sin costo',
    lista.length === 1 && /JAL-555-B/.test(lista[0]) && /Cobrar \$200/.test(lista[0]), JSON.stringify(lista));
  revisa('sin elegir nada no deja cobrar', !(await pg.isVisible('#saveCollect')));
  await pg.click('[data-gafete="g2"]');
  if (process.env.QA_GAFETE) await pg.screenshot({ path: process.env.QA_GAFETE });
  const boton = await pg.textContent('#saveCollect');
  revisa('elegida la solicitud, el botón dice cuánto y que entrega', /Cobrar \$200(\.00)? y entregar/.test(boton), boton);
  await pg.selectOption('#gafeteMethod', 'transfer');
  await pg.fill('#gafeteCollectedBy', 'Zul');
  await pg.click('#saveCollect'); await pg.waitForTimeout(400);
  const env = await pg.evaluate(() => window.__rpc.filter(c => c.name === 'v2_parking_express').map(c => c.params));
  const p = env[0] || {};
  revisa('el gafete se cobra con el movimiento único, ligado a la solicitud',
    env.length === 1 && p.pass_id === 'g2' && p.method === 'transfer' && p.courtesy === false, JSON.stringify(env));
  revisa('con quién de Tannery cobró', p.collected_by_name === 'Zul', p.collected_by_name);
  const alerta = await pg.evaluate(() => window.__alerta);
  revisa('al terminar dice qué folio entregar', /TC009/.test(alerta?.title || ''), JSON.stringify(alerta));

  // Gafete nuevo para un Tanner que no lo ha pedido.
  await pg.click('#openCollect'); await pg.click('#tabGafete'); await pg.waitForTimeout(200);
  await pg.fill('#gafetePlayerSearch', 'matias');
  await pg.click('#gafetePlayerResults .tsearch-opt'); await pg.waitForTimeout(200);
  revisa('si el Tanner no tiene gafete pedido, se abre el alta solo', await pg.isVisible('#gafetePlaca'));
  revisa('sin placas no deja cobrar', !(await pg.isVisible('#saveCollect')));
  await pg.fill('#gafetePlaca', 'gto-777-z');
  await pg.click('#saveCollect'); await pg.waitForTimeout(400);
  const n = (await pg.evaluate(() => window.__rpc.filter(c => c.name === 'v2_parking_express').map(c => c.params)))[1] || {};
  revisa('el gafete nuevo va para ese Tanner, con placas en mayúsculas y en efectivo',
    n.pass_id === null && n.player_id === 'p1' && n.holder_kind === 'familia' && n.plate === 'GTO-777-Z' && n.method === 'cash', JSON.stringify(n));
  revisa('cada cobro lleva su propia llave', n.idempotency_key && n.idempotency_key !== p.idempotency_key);

  // Otro ingreso · Estacionamiento manda a la pestaña correcta.
  await pg.click('#openCollect');
  await pg.click('.cashier-tabs [data-mode="general"]');
  await pg.selectOption('#generalCategory', 'Estacionamiento');
  revisa('"Otro ingreso · Estacionamiento" avisa que el gafete no se enteraría', await pg.isVisible('#generalGafeteAviso'));
  await pg.click('#irAGafete');
  revisa('y "Cobrarlo ahí" lleva a la pestaña Estacionamiento', await pg.isVisible('#gafeteFields'));
  revisa('sin errores de consola (estacionamiento)', errs.length === 0, errs.join(' | '));
  await pg.close();
}

/* ===== SIN PERMISO DE TIENDA ===== */
{
  const { pg } = await abre(false);
  await pg.click('#openCollect');
  revisa('quien no escribe en Tienda no ve la pestaña', !(await pg.isVisible('#tabTienda')));
  await pg.click('.cashier-tabs [data-mode="general"]');
  await pg.selectOption('#generalCategory', 'Uniforme');
  revisa('ni el aviso que manda a ella', !(await pg.isVisible('#generalTiendaAviso')));
  revisa('quien no escribe en Estacionamiento no ve esa pestaña', !(await pg.isVisible('#tabGafete')));
  await pg.close();
}

await nav.close(); srv.close();
console.log(fallos
  ? `Taquilla · Tienda humo FAILED · ${fallos} de ${corridas}`
  : `Taquilla · Tienda humo OK · ${corridas} revisiones: el anticipo va ligado al pedido y el gafete se cobra y entrega desde Taquilla`);
process.exit(fallos ? 1 : 0);
