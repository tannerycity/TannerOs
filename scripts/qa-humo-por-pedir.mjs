/* Por pedir: confirmado con la familia, pagado o no (h59, 03/11/2026).
 *
 * Zul (Tienda): "quiero tener un apartado que sea por pedir aunque esté
 * pagado o no... que diga si está pagado o no, pero que me haga el PDF
 * completo de lo que le voy a mandar a mi proveedor... que se le pueda poner
 * que ya está confirmado por las personas en el grupo o en persona".
 * Presidencia: se pide todo lo confirmado aunque no esté pagado, y la
 * confirmación es obligatoria. Lo que se protege:
 *   1. El paso 3 se llama "Por pedir".
 *   2. Cada pedido abierto dice si ya se confirmó (en el grupo / en persona y
 *      cuándo) o si falta; si cambió después de confirmarlo, que se vuelva a
 *      confirmar. Lo ya pedido no lleva barra.
 *   3. "Confirmar" abre una hoja (no el pedido) con las piezas y si debe; se
 *      elige en el grupo o en persona y se manda a v2_confirm_order. Quitar
 *      pregunta antes.
 *   4. La tarjeta de Por pedir dice cuántos pagados y cuántos deben (y
 *      cuánto), marca a quien debe y avisa cuántos faltan por confirmar.
 *   5. "Ver el PDF antes de mandar" arma la hoja con v2_orders_sheet (no crea
 *      el envío) con el proveedor puesto.
 *   6. El detalle dice "Antes de pedirlo · Confirma con la familia" y trae el
 *      botón; ya no pide el pago para pedirlo.
 *   7. Si la base todavía no contesta "confirmado", todo queda como antes.
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

const hace = d => new Date(Date.now() - d * 864e5).toISOString();
const P = (id, nombre, status, total, pagado, extra = {}) => ({ id, folio:`PED-${id}`, customer_name:nombre,
  customer_phone:'+524770000000', customer_email:null, subtotal:total, discount:0, total, status, source:'internal_capture',
  notes:null, created_at:hace(2), delivered_at:null, paid_amount:pagado, item_count:1, ...extra });
const PEDIDOS = [
  P('a1', 'Ana Debe', 'pending_payment', 1000, 0),      // confirmada, debe: Por pedir
  P('b1', 'Beto Pagado', 'paid', 800, 800),              // confirmado, pagado: Por pedir
  P('c1', 'Caro Falta', 'paid', 700, 700),               // pagada sin confirmar: Revisar
  P('d1', 'Dani Cambio', 'partial_payment', 900, 300),   // confirmó y cambió: Revisar
  P('p1', 'Pepe Pedido', 'in_production', 600, 0),       // ya pedido, debe
];
const C = (via, vigente = true) => ({ via, at:hace(1), vigente });
const ETAPAS_H59 = {
  a1:{ stage:'para_proveedor', confirmado:C('grupo') }, b1:{ stage:'para_proveedor', confirmado:C('persona') },
  c1:{ stage:'por_validar', confirmado:null, missing:['Confirmar con la familia'] },
  d1:{ stage:'por_validar', confirmado:C('grupo', false), missing:['Volver a confirmar: el pedido cambió'] },
  p1:{ stage:'con_proveedor', confirmado:C('grupo'), batch:{ id:'b9', folio:'COR-9', status:'submitted', submittedOn:hace(1).slice(0,10), supplierName:'Tremor' } } };
// Antes de h59 la base no trae "confirmado".
const ETAPAS_VIEJAS = Object.fromEntries(Object.entries(ETAPAS_H59).map(([k, v]) => { const { confirmado, ...resto } = v; return [k, resto]; }));
const pieza = (id, desc, extra = {}) => ({ id, description:desc, quantity:1, talla:'10', manga:'corta', nombre:'LEO', numero:'7', kit:null, ...extra });
const TABLERO = Object.fromEntries(PEDIDOS.map(o => [o.id, { playerName:null, source:'internal_capture', items:[pieza('i-' + o.id, 'Jersey Black Edition')] }]));
const DET = Object.fromEntries(PEDIDOS.map(o => [o.id, { order:{ ...o }, balance:o.total - o.paid_amount, payments:[], paymentPlan:null, profitability:null,
  readiness:{ ok:false, missing:['pago incompleto'], paidPercent:Math.round(o.paid_amount / o.total * 100), effectivePaymentRequirementPercent:100 },
  items:[{ id:'i-' + o.id, productId:'pj', description:'Jersey Black Edition', quantity:1, unitPrice:o.total, attributes:{ talla:'10' } }] }]));

const ctx = { user_id:'u1', display_name:'Zul', organization_id:'o1', organization_name:'Tannery City FC', role:'Operaciones', is_owner:false };
const SHELL = `
  export const supabase = { auth:{ getSession:async()=>({data:{session:{user:{id:'u1'}}}}),
    getUser:async()=>({data:{user:{id:'u1',app_metadata:{}}}}), signOut:async()=>({}),
    onAuthStateChange(){ return {data:{subscription:{unsubscribe(){}}}}; } } };
  export async function rpc(name){ if(name==='v2_my_context') return [${JSON.stringify(ctx)}]; return null; }
  export function moduleAccess(){ return true; }
  export function setShellHealth(){}
  export function navigationMap(){ return new Map(); }
  export async function bootstrapProtectedShell(){ return { ctx:${JSON.stringify(ctx)}, navigation:[] }; }
  export const shellIcon = () => '';
  export const navItems = [];
  export function setShellSearchItems(){}
  export function renderShell(){}
`;
const CLIENTE = etapas => `
  window.__rpc=[];
  const ET=${JSON.stringify(etapas)};
  export function createClient(){return{
    auth:{getSession:async()=>({data:{session:{user:{id:'u1'},access_token:'x'}}}),onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}}},
    storage:{from:()=>({createSignedUrls:async ps=>({data:[],error:null})})},
    rpc:async(n,p={})=>{window.__rpc.push({n,p:JSON.parse(JSON.stringify(p))});const ok=d=>({data:d,error:null});
      if(n==='v2_my_context')return ok([${JSON.stringify(ctx)}]);
      if(n==='v2_my_modules')return ok([{module_code:'commerce',enabled:true,can_read:true,can_write:true}]);
      if(n==='v2_orders')return ok(${JSON.stringify(PEDIDOS)});
      if(n==='v2_orders_to_review')return ok([]);
      if(n==='v2_orders_board')return ok(${JSON.stringify(TABLERO)});
      if(n==='v2_orders_pipeline')return ok(JSON.parse(JSON.stringify(ET)));
      if(n==='v2_production_batches')return ok([]);
      if(n==='v2_warranties')return ok([]);
      if(n==='v2_catalog')return ok({products:[],bundles:[]});
      if(n==='v2_order_detail')return ok(${JSON.stringify(DET)}[p.order_id]);
      if(n==='v2_order_player')return ok({linked:null,canWrite:true,suggestions:[]});
      if(n==='v2_order_staff')return ok([]);
      if(n==='v2_order_confirm_link')return ok({token:'k'.repeat(64)});
      if(n==='v2_confirm_order'){ET[p.order_id]={...ET[p.order_id],stage:p.via?'para_proveedor':'por_validar',confirmado:p.via?{via:p.via,at:new Date().toISOString(),vigente:true}:null};return ok(ET[p.order_id]);}
      if(n==='v2_orders_sheet')return ok({batch:{id:null,folio:'BORRADOR',supplierName:null,submittedOn:'2026-11-03',status:'draft',notes:null},
        items:p.order_ids.map(id=>({itemId:'i-'+id,orderId:id,orderFolio:'PED-'+id,customerName:'x',description:'Jersey Black Edition',quantity:1,talla:'10',numero:'7',nombrePers:'LEO',manga:'corta',categoria:'jersey',productName:'Jersey Black Edition'}))});
      return ok(null);}};}`;

const nav = await chromium.launch({ executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
let fallos = 0, corridas = 0;
const revisa = (nombre, ok, detalle) => { corridas++; if (!ok) { fallos++; console.error(` - ${nombre}${detalle ? `\n   ${detalle}` : ''}`); } };

async function abre(etapas, vista = 'pasos') {
  const pg = await nav.newPage({ viewport:{ width:Number(process.env.ANCHO || 390), height:844 } });
  await pg.addInitScript(v => { try { localStorage.setItem('tos-pedidos-vista', v); localStorage.setItem('tos-proveedor', 'Tremor'); } catch {} }, vista);
  const errs = [];
  pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await pg.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  // jsPDF no se descarga: un doble que anota los textos.
  await pg.route('**/vendor/jspdf.mjs*', r => r.fulfill({ status:200, contentType:'text/javascript', body:`
    export class jsPDF { constructor(){ this.t=[]; this.internal={ pageSize:{ getWidth:()=>612, getHeight:()=>792 }, getNumberOfPages:()=>1 };
        return new Proxy(this,{ get(o,k){ return k in o ? o[k] : k === 'then' ? undefined : () => 0; } }); }
      splitTextToSize(x){ return [String(x)]; } text(x){ this.t.push(Array.isArray(x)?x.join(' '):String(x)); }
      output(){ window.__pdf={ textos:this.t }; return new Blob(['%PDF'],{type:'application/pdf'}); }
      save(n){ window.__pdf={ nombre:n, textos:this.t }; } }` }));
  await pg.route(/\/v2\/supabase-client\.js(\?.*)?$/, r => r.fulfill({ status:200, contentType:'text/javascript', body:CLIENTE(etapas) }));
  await pg.route(/\/v2\/shell\.js(\?.*)?$/, r => r.fulfill({ status:200, contentType:'text/javascript', body:SHELL }));
  await pg.goto(BASE + '/v2/pedidos/', { waitUntil:'networkidle' });
  await pg.waitForSelector('#tSeg .t-paso', { timeout:8000 });
  await pg.waitForTimeout(300);
  return { pg, errs };
}
const llamadas = (pg, n) => pg.evaluate(x => window.__rpc.filter(r => r.n === x).map(r => r.p), n);
const txt = async (pg, sel) => ((await pg.$(sel)) ? (await pg.innerText(sel)).replace(/\s+/g, ' ').trim() : '');
const vaA = async (pg, f) => { await pg.evaluate(v => { const s = document.getElementById('statusFilter'); s.value = v; s.dispatchEvent(new Event('change')); }, f); await pg.waitForTimeout(250); };
const barra = (pg, id) => pg.$eval(`.order-row[data-order-id="${id}"]`, r => { const b = r.querySelector('.order-num'); return b ? `${b.classList.contains('ok') ? 'ok' : 'falta'}|${b.querySelector('span').textContent}|${b.querySelector('button')?.textContent || ''}` : ''; });

{
  const { pg, errs } = await abre(ETAPAS_H59);
  const pasos = await pg.$$eval('#tSeg .t-paso b', bs => bs.map(b => b.textContent));
  revisa('1. el paso 3 se llama Por pedir', pasos[2] === 'Por pedir', JSON.stringify(pasos));

  // Por pedir.
  await vaA(pg, '@para_proveedor');
  if (process.env.SHOTS) await pg.screenshot({ path:`${process.env.SHOTS}/por-pedir.png`, fullPage:true });
  const tarjeta = await txt(pg, '#tEtapa');
  revisa('4. la tarjeta dice cuántos por pedir', /2 pedidos por pedir · 2 piezas/.test(tarjeta), tarjeta);
  revisa('4. pagados y quién debe, con cuánto', /Todos confirmados con la familia · 1 pagado · 1 debe \$1,000/.test(tarjeta), tarjeta);
  revisa('4. marca a quien debe', JSON.stringify(await pg.$$eval('#tEtapa .t-chips li', ls => ls.map(l => `${l.className}:${l.textContent}`))) === JSON.stringify(['debe:Ana Debe · debe', ':Beto Pagado']));
  revisa('4. avisa cuántos faltan por confirmar', /Faltan 2 por confirmar con la familia/.test(tarjeta), tarjeta);
  revisa('2. confirmado en el grupo / en persona, con su fecha', /^ok\|Confirmado en el grupo · \d+ \w+\.?\|Quitar$/.test(await barra(pg, 'a1')) && /^ok\|Confirmado en persona/.test(await barra(pg, 'b1')), `${await barra(pg, 'a1')} / ${await barra(pg, 'b1')}`);
  revisa('4. cada fila dice si debe o está pagado', /Debe \$1,000/.test(await txt(pg, '.order-row[data-order-id="a1"] .order-right')) && /Pagado/.test(await txt(pg, '.order-row[data-order-id="b1"] .order-right')));

  // 5. El PDF antes de mandar.
  // Tarjetas arriba (11/11/2026): el PDF a la vista, no sólo en el +.
  // Panel de arriba (11/11/2026): el PDF a la vista y los pendientes por paso.
  const pdfTxt = (await txt(pg, '#tAtajos [data-atajo="pdf"]')).replace(/\s+/g, ' ');
  // Jueves y viernes la tarjeta lleva además "Mañana/Hoy es el corte" (fase 4):
  // la prueba no puede depender del día en que corre.
  revisa('8. "PDF para el proveedor" a la vista con lo listo y "Descargar"', /PDF para el proveedor ?(?:(?:Hoy|Mañana) es el corte ?)?2 pedidos listos/.test(pdfTxt) && /Descargar/.test(pdfTxt), pdfTxt);
  const pasosHoy = await pg.$$eval('#tSeg .t-paso', bs => bs.map(b => `${b.querySelector('b').textContent}=${b.querySelector('i').textContent}`));
  revisa('8. "¿Qué toca hoy?": una tarjeta por paso con su número', pasosHoy.length === 5 && pasosHoy.includes('Por pedir=2'), JSON.stringify(pasosHoy));
  revisa('8. la tarjeta del paso en el que estás se marca', await pg.isVisible('#tSeg [data-f="@para_proveedor"].activo') && /Todos los pedidos/.test(await txt(pg, '#tSeg .t-volver')));
  revisa('8. ya no hay controles repetidos (Todos/Por paso)', !(await pg.isVisible('#tVista')));
  revisa('8. encabezado de tienda oficial con Nuevo pedido y Catálogo', /TIENDA OFICIAL/.test(await txt(pg, '.t-hero')) && await pg.isVisible('.t-hero #newOrderAction') && await pg.isVisible('.t-hero a[href="/catalogo/"]'));
  const fab = await pg.evaluate(() => (window.tosAccionesDePantalla || []).map(a => a.label));
  revisa('8. el + es corto: nuevo pedido, PDF y ventas', fab.length <= 3 && fab.includes('PDF para el proveedor') && !fab.includes('Por atender'), JSON.stringify(fab));
  const chicos = await pg.$$eval('#tAtajos button, .t-hero a, #tSeg button', bs => bs.filter(b => b.offsetParent && b.getBoundingClientRect().height < 44).map(b => b.textContent.trim().slice(0, 30)));
  revisa('8. todo lo de arriba se toca fácil (44 px o más)', chicos.length === 0, JSON.stringify(chicos));
  await pg.click('[data-borrador]');
  await pg.waitForSelector('.t-pdf-hoja', { timeout:5000 }).catch(() => {});
  const dlg = await txt(pg, '.t-pdf-hoja');
  revisa('5. el PDF borrador se arma y avisa que todavía no se manda nada', /El PDF está listo/.test(dlg) && /todavía no se manda nada/i.test(dlg), dlg);
  const hoja = (await llamadas(pg, 'v2_orders_sheet'))[0];
  revisa('5. la hoja lleva sólo lo de Por pedir', JSON.stringify(hoja?.order_ids) === JSON.stringify(['a1','b1']), JSON.stringify(hoja));
  revisa('5. no crea el envío', (await llamadas(pg, 'v2_create_production_batch')).length === 0);
  // Descargar de verdad (no sólo compartir): un archivo .pdf baja.
  revisa('9. la hoja trae "Descargar PDF" como botón principal', /Descargar PDF/.test(await txt(pg, '.t-pdf-btn.principal')));
  const bajada = pg.waitForEvent('download', { timeout:5000 }).catch(() => null);
  if (process.env.SHOTS) await pg.screenshot({ path:`${process.env.SHOTS}/hoja-pdf.png` });
  await pg.click('[data-pdfh="bajar"]');
  const dl = await bajada;
  revisa('9. se descarga el PDF', !!dl && /^Pedido-proveedor-\d{4}-\d\d-\d\d\.pdf$/.test(dl.suggestedFilename()), dl?.suggestedFilename());
  revisa('9. avisa dónde quedó', /quedó en Descargas/.test(await txt(pg, '.t-pdf-hoja')));
  const textos = await pg.evaluate(() => window.__pdf?.textos || []);
  await pg.click('[data-pdfh="cerrar"]'); await pg.waitForTimeout(150);
  revisa('9. Cerrar quita la hoja', !(await pg.$('.t-pdf-capa')));
  // La tarjeta abre el mismo PDF.
  await pg.click('[data-atajo="pdf"]');
  await pg.waitForSelector('.t-pdf-hoja', { timeout:5000 }).catch(() => {});
  revisa('8. la tarjeta del PDF abre la hoja para descargar', /El PDF está listo/.test(await txt(pg, '.t-pdf-hoja')));
  await pg.click('[data-pdfh="cerrar"]'); await pg.waitForTimeout(150);
  // Formato Tremor (11/11/2026): el corte y el proveedor van en el encabezado.
  revisa('5. el PDF dice BORRADOR y el proveedor', textos.some(t => /^Corte BORRADOR/.test(t)) && textos.some(t => /Pedido al proveedor · Tremor/.test(t)), JSON.stringify(textos.slice(0, 8)));
  revisa('5. el PDF es la tabla por diseño (JERSEY …, TALLAS, PRODUCTO, PAGO)', textos.some(t => /^JERSEY /.test(t)) && textos.includes('TALLAS') && textos.includes('PRODUCTO') && textos.includes('PAGO'), JSON.stringify(textos.slice(0, 20)));
  // PAGO en vez del cuadro para palomear (11/11/2026): Ana debe, Beto pagó; sin montos.
  revisa('5. el PDF dice PAGADO o PENDIENTE por playera', textos.includes('PAGADO') && textos.includes('PENDIENTE') && !textos.some(t => /\$/.test(t)), JSON.stringify(textos.filter(t => /PAG|PEND/.test(t))));
  revisa('5. arriba cuenta pagadas y pendientes', textos.some(t => /PAGO: 1 pagada · 1 pendiente/.test(t)), JSON.stringify(textos.slice(0, 6)));

  // Faltan por confirmar lleva a Revisar.
  await pg.click('[data-ir-paso="@por_validar"]'); await pg.waitForTimeout(250);
  revisa('4. "Faltan por confirmar" lleva a Revisar', await pg.$eval('#statusFilter', s => s.value) === '@por_validar');
  revisa('2. falta confirmar', await barra(pg, 'c1') === 'falta|Falta confirmar con la familia|Confirmar', await barra(pg, 'c1'));
  revisa('2. si cambió, a confirmar otra vez', await barra(pg, 'd1') === 'falta|Cambió el pedido: confírmalo otra vez|Confirmar', await barra(pg, 'd1'));

  // 3. Confirmar desde la fila: hoja, no el pedido.
  await pg.click('.order-row[data-order-id="d1"] [data-confirma-pedido]');
  await pg.waitForSelector('#confHoja', { timeout:3000 }).catch(() => {});
  revisa('3. abre la hoja de confirmar y no el pedido', await pg.isVisible('#confHoja') && !(await pg.isVisible('#drawer')));
  const h = await txt(pg, '#confHoja');
  revisa('3. la hoja enseña las piezas y que debe', /Jersey Black Edition/.test(h) && /Talla 10/.test(h) && /LEO #7/.test(h) && /Debe \$600/.test(h) && /se entrega hasta que pague/.test(h), h);
  if (process.env.SHOTS) await pg.screenshot({ path:`${process.env.SHOTS}/confirmar.png` });
  // El mensaje ya armado para la familia (11/11/2026).
  await pg.evaluate(() => { window.__abiertas = []; window.open = u => { window.__abiertas.push(u); return null; }; });
  await pg.click('#confHoja [data-conf-wa]');
  const wa = decodeURIComponent((await pg.evaluate(() => window.__abiertas[0] || '')).replace(/\+/g, ' '));
  revisa('3. "Mandar mensaje para confirmar" abre WhatsApp con la familia y los datos del pedido', /wa\.me\/524770000000/.test(wa) && /Jersey Black Edition · talla 10 · LEO #7/.test(wa) && /¿Están bien las tallas, el nombre y el número\?/.test(wa), wa.slice(0, 300));
  revisa('3. el mensaje lleva la liga para que la familia confirme en un toque', /Confírmalo aquí con un toque/.test(wa) && wa.includes('/tienda/#/confirma/' + 'k'.repeat(64)), wa.slice(-160));
  revisa('3. mandar el mensaje no confirma solo', (await llamadas(pg, 'v2_confirm_order')).length === 0 && await pg.isVisible('#confHoja'));
  await pg.click('#confHoja [data-conf-via="persona"]'); await pg.waitForTimeout(500);
  const c = (await llamadas(pg, 'v2_confirm_order'))[0];
  revisa('3. manda la confirmación en persona', c?.order_id === 'd1' && c?.via === 'persona', JSON.stringify(c));
  revisa('3. se cierra la hoja y avisa', !(await pg.$('#confHoja')) && /Confirmado en persona: Dani Cambio ya está en Por pedir/.test(await txt(pg, '#statusMessage')), await txt(pg, '#statusMessage'));
  revisa('3. el pedido pasa a Por pedir', !(await pg.$('.order-row[data-order-id="d1"]')));

  // 6. El detalle.
  await pg.click('.order-row[data-order-id="c1"]');
  await pg.waitForSelector('#drawer:not(.hidden)', { timeout:5000 }); await pg.waitForTimeout(300);
  const listo = await txt(pg, '#readinessBox');
  revisa('6. el detalle pide confirmar, no cobrar', /Antes de pedirlo/.test(listo) && /Confirma con la familia/.test(listo) && !/Falta cobrar/.test(listo), listo);
  revisa('6. con el botón ahí', await pg.isVisible('#readinessBox [data-confirma-pedido]'));
  revisa('6. y en el resumen', /Falta confirmar con la familia/.test(await txt(pg, '#orderResumen')));
  await pg.click('#readinessBox [data-confirma-pedido]');
  await pg.waitForSelector('#confHoja', { timeout:3000 }).catch(() => {});
  const z = await pg.evaluate(() => ({ hoja:+getComputedStyle(document.getElementById('confHoja')).zIndex, cajon:+getComputedStyle(document.getElementById('drawer')).zIndex }));
  revisa('6. la hoja queda encima del pedido abierto', z.hoja > z.cajon, JSON.stringify(z));
  await pg.click('#confHoja [data-conf-cierra]'); await pg.waitForTimeout(150);
  revisa('6. "Todavía no" cierra sin confirmar', !(await pg.$('#confHoja')) && (await llamadas(pg, 'v2_confirm_order')).length === 1);
  await pg.click('#closeDrawer'); await pg.waitForTimeout(200);

  // 3. Quitar pregunta antes.
  await vaA(pg, '@para_proveedor');
  await pg.click('.order-row[data-order-id="a1"] [data-desconfirma]');
  await pg.waitForSelector('.tosdlg', { timeout:3000 }).catch(() => {});
  revisa('3. quitar pregunta antes y no abre el pedido', /Quitar la confirmación/.test(await txt(pg, '.tosdlg')) && !(await pg.isVisible('#drawer')));
  await pg.click('.tosdlg-ok'); await pg.waitForTimeout(400);
  const q = (await llamadas(pg, 'v2_confirm_order')).at(-1);
  revisa('3. quitar manda via null', q?.order_id === 'a1' && q?.via === null, JSON.stringify(q));

  // 2. Lo ya pedido no lleva barra.
  await vaA(pg, '@con_proveedor');
  revisa('2. lo ya pedido no lleva barra de confirmar', await barra(pg, 'p1') === '');
  revisa('sin errores de página', !errs.length, errs.join(' | '));
  await pg.close();
}
{
  // 7. Antes de h59: como siempre.
  const { pg, errs } = await abre(ETAPAS_VIEJAS);
  await vaA(pg, '@por_validar');
  revisa('7. sin "confirmado" en la base, sigue el número por confirmar', /Número #7 por confirmar/.test(await barra(pg, 'c1')), await barra(pg, 'c1'));
  await vaA(pg, '@para_proveedor');
  const tarjeta = await txt(pg, '#tEtapa');
  revisa('7. sin borrador ni "por confirmar"', !(await pg.$('[data-borrador]')) && /Todos pagados y revisados/.test(tarjeta), tarjeta);
  revisa('sin errores de página (antes de h59)', !errs.length, errs.join(' | '));
  await pg.close();
}
await nav.close(); srv.close();
if (fallos) { console.error(`Por pedir humo: ${fallos} de ${corridas} fallaron`); process.exit(1); }
console.log(`Por pedir humo OK · ${corridas} revisiones: confirmado en el grupo o en persona, pagado o no, PDF borrador y lo de antes intacto`);
