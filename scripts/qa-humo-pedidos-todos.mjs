/* Todos los pedidos en una lista (01/11/2026).
 *
 * La tienda: "quiero ver todos los pedidos en un solo lugar... está padre la
 * división para saber exactamente cuál es el lugar de cada uno, pero también
 * me gustaría ver en una sola lista todos para que no se me vaya ninguno".
 * Lo que se protege:
 *   1. Dos vistas a un toque: Todos y Por paso. La primera vez abre en Todos
 *      para cualquier rol (quien lleva la tienda); se recuerda la última;
 *      ?paso= manda.
 *   2. Todos es una sola lista agrupada por paso (Revisar, Cobrar, Mandar,
 *      Recibir, Entregar) con su cuenta, lo más viejo arriba.
 *   3. Cada pedido dice dónde va: etiqueta del paso y cinco puntos.
 *   4. Se marca atrasado: Cobrar > 7 días, Con el proveedor > 14 desde que se
 *      mandó, Entregar > 3 desde que llegó. Sin fecha segura no se marca.
 *   5. Cancelados y reembolsados no estorban: van en su filtro, igual que los
 *      entregados. La búsqueda cruza todos los grupos.
 *   6. "Ir al paso" lleva a la vista de siempre en ese paso. Por paso no cambia.
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
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('no'); return; }
  r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
  r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}`;

// Fechas relativas a hoy para que los días de atraso no dependan del calendario.
const hace = d => new Date(Date.now() - d * 864e5 - 3600e3).toISOString();
const dia = d => hace(d).slice(0, 10);
const P = (id, nombre, status, total, pagado, dias, extra = {}) => ({ id, folio:`PED-${id}`, customer_name:nombre,
  customer_phone:'+524770000000', customer_email:null, subtotal:total, discount:0, total, status, source:'public_form',
  notes:null, created_at:hace(dias), delivered_at:null, paid_amount:pagado, item_count:1, ...extra });
const PEDIDOS = [
  P('r1', 'Rita Revisar', 'paid', 800, 800, 1),
  P('c2', 'Carla Nueva', 'pending_payment', 900, 0, 2),
  P('c1', 'Carlos Debe', 'partial_payment', 1000, 300, 10),
  P('m1', 'Mario Mandar', 'paid', 700, 700, 4),
  P('p1', 'Pablo Tarde', 'in_production', 600, 600, 30),
  P('p2', 'Paula Lima', 'in_production', 600, 600, 30),
  P('e1', 'Elena Entregar', 'ready', 500, 500, 25),
  P('d1', 'Diego Listo', 'delivered', 400, 400, 40, { delivered_at:hace(3) }),
  P('x1', 'Ximena Cancelo', 'cancelled', 300, 0, 5),
  P('x2', 'Xavier Reembolso', 'refunded', 300, 300, 6),
];
const ETAPAS = { r1:{ stage:'por_validar' }, c1:{ stage:'por_cobrar' }, c2:{ stage:'por_cobrar' }, m1:{ stage:'para_proveedor' },
  p1:{ stage:'con_proveedor', batch:{ id:'b1', folio:'C-0002', status:'submitted', submittedOn:dia(20) } },
  p2:{ stage:'con_proveedor' },
  e1:{ stage:'para_entregar', batch:{ id:'b0', folio:'C-0001', status:'received', submittedOn:dia(12) } },
  d1:{ stage:'entregado' },
  // La base puede contestar etapa aunque esté cancelado: el cancelado no debe colarse en Cobrar.
  x1:{ stage:'por_cobrar' } };
const ENVIOS = [
  { id:'b1', folio:'C-0002', batch_type:'orders', status:'submitted', supplier_name:'Tremor', order_count:1, warranty_count:0, submitted_on:dia(20) },
  { id:'b0', folio:'C-0001', batch_type:'orders', status:'received', supplier_name:'Tremor', order_count:1, warranty_count:0, submitted_on:dia(12), received_at:hace(5) }];
const DET = Object.fromEntries(PEDIDOS.map(o => [o.id, { order:{ ...o }, balance:o.total - o.paid_amount, payments:[], paymentPlan:null,
  readiness:{ ok:true, missing:[] }, profitability:null, items:[{ id:'i-' + o.id, description:'Jersey Home', quantity:1, unitPrice:o.total, attributes:{ talla:'10' } }] }]));

const ctxDe = rol => ({ user_id:'u1', display_name:'Prueba', organization_id:'o1', organization_name:'Tannery City FC', role:rol, is_owner:false });
const SHELL = rol => `
  export const supabase = { auth:{ getSession:async()=>({data:{session:{user:{id:'u1'}}}}),
    getUser:async()=>({data:{user:{id:'u1',app_metadata:{}}}}), signOut:async()=>({}),
    onAuthStateChange(){ return {data:{subscription:{unsubscribe(){}}}}; } } };
  export async function rpc(name){ if(name==='v2_my_context') return [${JSON.stringify(ctxDe(rol))}]; return null; }
  export function moduleAccess(){ return true; }
  export function setShellHealth(){}
  export function navigationMap(){ return new Map(); }
  export async function bootstrapProtectedShell(){ return { ctx:${JSON.stringify(ctxDe(rol))}, navigation:[] }; }
  export const shellIcon = () => '';
  export const navItems = [];
  export function setShellSearchItems(){}
  export function renderShell(){}
`;
const CLIENTE = rol => `
  window.__rpc=[];
  export function createClient(){return{
    auth:{getSession:async()=>({data:{session:{user:{id:'u1'},access_token:'x'}}}),onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}}},
    rpc:async(n,p={})=>{window.__rpc.push({n,p:JSON.parse(JSON.stringify(p))});const ok=d=>({data:d,error:null});
      if(n==='v2_my_context')return ok([${JSON.stringify(ctxDe(rol))}]);
      if(n==='v2_my_modules')return ok([{module_code:'commerce',enabled:true,can_read:true,can_write:true}]);
      if(n==='v2_orders')return ok(${JSON.stringify(PEDIDOS)});
      if(n==='v2_orders_to_review')return ok(['r1']);
      if(n==='v2_orders_board')return ok({});
      if(n==='v2_orders_pipeline')return ok(${JSON.stringify(ETAPAS)});
      if(n==='v2_production_batches')return ok(${JSON.stringify(ENVIOS)});
      if(n==='v2_warranties')return ok([]);
      if(n==='v2_order_detail')return ok(${JSON.stringify(DET)}[p.order_id]);
      if(n==='v2_order_player')return ok({linked:null,canWrite:true,suggestions:[]});
      if(n==='v2_order_staff')return ok([]);
      return ok(null);}};}`;

const nav = await chromium.launch({ executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
let fallos = 0, corridas = 0;
const revisa = (nombre, ok, detalle) => { corridas++; if (!ok) { fallos++; console.error(` - ${nombre}${detalle ? `\n   ${detalle}` : ''}`); } };

async function abre(ruta, rol) {
  const pg = await nav.newPage({ viewport:{ width:Number(process.env.ANCHO || 390), height:844 } });
  const errs = [];
  pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await pg.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await pg.route(/\/v2\/supabase-client\.js(\?.*)?$/, r => r.fulfill({ status:200, contentType:'text/javascript', body:CLIENTE(rol) }));
  await pg.route(/\/v2\/shell\.js(\?.*)?$/, r => r.fulfill({ status:200, contentType:'text/javascript', body:SHELL(rol) }));
  await pg.goto(BASE + ruta, { waitUntil:'networkidle' });
  await pg.waitForSelector('#tVista button', { timeout:8000 });
  await pg.waitForTimeout(300);
  return { pg, errs };
}
const vistaActiva = pg => pg.$eval('#tVista [aria-pressed="true"]', b => b.dataset.vista).catch(() => '');
const grupos = pg => pg.$$eval('#orderList .t-grupo-caja', cs => cs.map(c => `${c.querySelector('h3').childNodes[0].textContent.trim()}=${c.querySelector('h3 i').textContent}`));
const ids = (pg, sel = '#orderList') => pg.$$eval(`${sel} .order-row`, rs => rs.map(r => r.dataset.orderId));
const fila = (pg, id) => pg.$eval(`.order-row[data-order-id="${id}"]`, r => ({
  etq:r.querySelector('.t-donde .t-etq')?.textContent || '',
  puntos:[...r.querySelectorAll('.t-puntos i')].map(i => i.className || '-').join(','),
  paso:r.querySelector('.t-puntos')?.getAttribute('aria-label') || '',
  tarde:r.querySelector('.t-donde .t-tarde')?.textContent.trim() || '' }));

// Presidencia: abre en Todos, una sola lista agrupada por paso.
{
  const { pg, errs } = await abre('/v2/pedidos/', 'Presidencia');
  if (process.env.SHOTS) await pg.screenshot({ path:`${process.env.SHOTS}/pedidos-todos.png`, fullPage:true });
  revisa('1. Presidencia abre en Todos', await vistaActiva(pg) === 'todos');
  const tv = (await pg.innerText('#tVista')).replace(/\s+/g, ' ').trim();
  revisa('1. el botón Todos trae la cuenta de vivos (sin entregados ni cancelados)', /^Todos 7\b/.test(tv) && /Por paso/.test(tv), tv);
  revisa('1. en Todos no está el diagrama de pasos ni la tarjeta del paso', !(await pg.$('#tSeg .t-pasos')) && !(await pg.isVisible('#tEtapa')));
  const g = await grupos(pg);
  revisa('2. grupos en el orden del flujo con su cuenta', JSON.stringify(g) === JSON.stringify(['Revisar=1','Cobrar=2','Mandar=1','Recibir=2','Entregar=1']), JSON.stringify(g));
  const todos = await ids(pg);
  revisa('2. cada pedido vivo aparece una vez y ninguno se pierde', todos.length === 7 && new Set(todos).size === 7, JSON.stringify(todos));
  revisa('5. cancelados, reembolsados y entregados no estorban en Vivos', !todos.some(i => ['x1','x2','d1'].includes(i)));
  revisa('2. lo más viejo arriba en Cobrar', JSON.stringify(await ids(pg, '[data-grupo="por_cobrar"]')) === JSON.stringify(['c1','c2']));
  const c1 = await fila(pg, 'c1');
  revisa('3. cada pedido dice su paso con etiqueta y cinco puntos', c1.etq === 'Cobrar' && c1.puntos === 'hecho,aqui,-,-,-' && c1.paso === 'Paso 2 de 5', JSON.stringify(c1));
  const e1 = await fila(pg, 'e1');
  revisa('3. Entregar es el paso 5', e1.etq === 'Entregar' && e1.puntos === 'hecho,hecho,hecho,hecho,aqui', JSON.stringify(e1));
  revisa('4. Cobrar con 10 días se marca atrasado', /Atrasado · 10 días/.test(c1.tarde), JSON.stringify(c1));
  revisa('4. Cobrar con 2 días no', !(await fila(pg, 'c2')).tarde);
  revisa('4. con el proveedor desde hace 20 días se marca atrasado', /Atrasado · 20 días/.test((await fila(pg, 'p1')).tarde));
  revisa('4. sin fecha de envío no se marca (mejor callar que asustar)', !(await fila(pg, 'p2')).tarde);
  revisa('4. llegó hace 5 días y no se ha entregado: atrasado', /Atrasado · 5 días/.test(e1.tarde), JSON.stringify(e1));
  revisa('4. Revisar y Mandar no se marcan', !(await fila(pg, 'r1')).tarde && !(await fila(pg, 'm1')).tarde);
  const cab = (await pg.innerText('[data-grupo="por_cobrar"] .t-grupo')).replace(/\s+/g, ' ');
  revisa('4. la cabecera cuenta los atrasados', /1 atrasado\b/.test(cab), cab);
  const filtros = (await pg.$$eval('#tSeg [data-todos-f]', bs => bs.map(b => b.textContent.replace(/\s+/g, ' ').trim())));
  revisa('5. filtro Vivos / Entregados / Cancelados con su cuenta', JSON.stringify(filtros) === JSON.stringify(['Vivos 7','Entregados 1','Cancelados 2']), JSON.stringify(filtros));
  revisa('el filtro de estado (de Por paso) no se muestra en Todos', !(await pg.isVisible('#statusFilter')));

  await pg.click('#tSeg [data-todos-f="cancelados"]');
  revisa('5. Cancelados muestra cancelados y reembolsados', JSON.stringify((await ids(pg)).sort()) === JSON.stringify(['x1','x2']));
  revisa('5. y dice cuál fue reembolsado', (await fila(pg, 'x2')).etq === 'Reembolsado' && (await fila(pg, 'x1')).etq === 'Cancelado');
  await pg.click('#tSeg [data-todos-f="entregados"]');
  const d1 = await fila(pg, 'd1');
  revisa('5. Entregados con los cinco puntos hechos', JSON.stringify(await ids(pg)) === '["d1"]' && d1.etq === 'Entregado' && d1.puntos === 'hecho,hecho,hecho,hecho,hecho', JSON.stringify(d1));
  await pg.click('#tSeg [data-todos-f="vivos"]');

  await pg.fill('#orderSearch', 'lima');
  await pg.waitForTimeout(150);
  revisa('5. la búsqueda cruza todos los grupos', JSON.stringify(await ids(pg)) === '["p2"]' && JSON.stringify(await grupos(pg)) === '["Recibir=1"]');
  await pg.fill('#orderSearch', '');
  await pg.waitForTimeout(150);

  const ancho = await pg.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  revisa('sin scroll horizontal a lo ancho del teléfono', ancho);

  await pg.click('.order-row[data-order-id="m1"] .order-who');
  await pg.waitForTimeout(400);
  revisa('tocar un pedido en Todos lo abre', (await pg.evaluate(() => window.__rpc.filter(r => r.n === 'v2_order_detail').map(r => r.p.order_id))).includes('m1'));
  await pg.click('#closeDrawer').catch(() => {});
  await pg.waitForTimeout(200);

  await pg.click('[data-grupo="por_cobrar"] [data-ir-paso]');
  await pg.waitForTimeout(200);
  const activo = await pg.$eval('#tSeg .t-paso.activo b', b => b.textContent).catch(() => '');
  revisa('6. "Ir al paso" lleva a Por paso en Cobrar', await vistaActiva(pg) === 'pasos' && activo === 'Cobrar', activo);
  revisa('6. y la vista se recuerda', await pg.evaluate(() => localStorage.getItem('tos-pedidos-vista')) === 'pasos');
  await pg.reload({ waitUntil:'networkidle' });
  await pg.waitForSelector('#tVista button', { timeout:8000 });
  revisa('1. al volver abre en la última vista usada', await vistaActiva(pg) === 'pasos' && !!(await pg.$('#tSeg .t-pasos')));
  await pg.click('#tVista [data-vista="todos"]');
  revisa('1. un toque regresa a Todos y se guarda', await vistaActiva(pg) === 'todos' && (await grupos(pg)).length === 5 && await pg.evaluate(() => localStorage.getItem('tos-pedidos-vista')) === 'todos');
  revisa('sin errores de página (Presidencia)', !errs.length, errs.join(' | '));
  await pg.close();
}

// Quien lleva la tienda (Zul, rol Operaciones) también abre en Todos; Por paso
// queda a un toque y no cambia.
{
  const { pg, errs } = await abre('/v2/pedidos/', 'Operaciones');
  revisa('1. quien lleva la tienda abre en Todos', await vistaActiva(pg) === 'todos' && (await grupos(pg)).length === 5);
  await pg.click('#tVista [data-vista="pasos"]');
  await pg.waitForTimeout(200);
  const pasos = await pg.$$eval('#tSeg .t-paso', bs => bs.map(b => `${b.querySelector('b').textContent}=${b.querySelector('i').textContent}`));
  revisa('6. Por paso no cambia: el diagrama de cinco verbos con su cuenta', JSON.stringify(pasos) === JSON.stringify(['Revisar=1','Cobrar=2','Mandar=1','Recibir=2','Entregar=1']), JSON.stringify(pasos));
  revisa('6. y abre en el paso que pide algo', await pg.$eval('#tSeg .t-paso.activo b', b => b.textContent) === 'Revisar');
  revisa('6. en Por paso no se pintan grupos ni etiquetas de Todos', !(await pg.$('.t-grupo-caja')) && !(await pg.$('.t-donde')));
  revisa('sin errores de página (Operaciones)', !errs.length, errs.join(' | '));
  await pg.close();
}

// Una liga con ?paso= manda aunque seas Presidencia.
{
  const { pg, errs } = await abre('/v2/pedidos/?paso=cobrar', 'Presidencia');
  revisa('1. ?paso= abre en Por paso en ese paso', await vistaActiva(pg) === 'pasos' && await pg.$eval('#tSeg .t-paso.activo b', b => b.textContent).catch(() => '') === 'Cobrar');
  revisa('sin errores de página (?paso=)', !errs.length, errs.join(' | '));
  await pg.close();
}

await nav.close(); srv.close();
console.log(fallos ? `Pedidos Todos humo FAILED · ${fallos} de ${corridas}` : `Pedidos Todos humo OK · ${corridas} revisiones: dos vistas a un toque, una lista agrupada por paso, dónde va cada pedido, atrasados, cancelados aparte y Por paso intacto`);
process.exit(fallos ? 1 : 0);
