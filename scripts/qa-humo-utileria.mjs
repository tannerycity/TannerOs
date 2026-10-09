/* UTILERÍA (rediseño 09/10/2026), probada como la usa quien lleva la bodega y
 * como la usa un profe, en un teléfono de 390px.
 *
 * Presidencia: "lo tenemos como si fuera un Excel". Lo que se protege:
 *
 *   ADMINISTRACIÓN
 *   1. Arriba, las tres preguntas con su número: qué tenemos, quién lo tiene
 *      y reportes por atender.
 *   2. Qué tenemos: tarjetas con lo que hay en bodega; las categorías y el
 *      buscador filtran.
 *   3. Entregar en tres toques: qué → a quién → confirmar. Desde la ficha del
 *      artículo, el "qué" ya va puesto. "Otra persona" escribe el nombre.
 *   4. Ajustar la cantidad NO borra la foto ni nada más del artículo: la
 *      función del servidor reescribe todos los campos.
 *   5. Nuevo artículo: nombre, categoría con un toque, cantidad con +10.
 *   6. Quién lo tiene: una tarjeta por persona; "Devolvió" es un toque.
 *   7. Reportes: "Resuelto" es un toque; "Rechazar" pide el porqué.
 *   PROFE
 *   8. Mi utilería: su material; tocarlo → qué pasó → enviar.
 *   9. Pedir material sin artículo.
 *  10. Nada se sale de la pantalla a 390px.
 */
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const T = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png' };
const FOTO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#c46a2c"/></svg>';
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p.startsWith('/qa-foto/')) { r.writeHead(200, { 'content-type':'image/svg+xml' }); r.end(FOTO); return; }
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('no'); return; }
  r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}`;

const art = (id, name, category, quantity, assigned = 0, extra = {}) => ({ id, name, category, quantity, assigned_quantity: assigned,
  available_quantity: quantity - assigned, control_type: 'cantidad', status: 'active', min_stock: 0, needs_reorder: false, unit_cost: null,
  location: null, sku: null, notes: null, photo_path: null, photo_thumb_path: null, photo_bucket: null, units_bodega: 0, units_asignado: 0, ...extra });
const ITEMS = [
  art('b5', 'Balones del 5', 'Balones', 12, 2, { photo_path: 'org/equipment/items/b5/foto.webp', photo_thumb_path: 'org/equipment/items/b5/foto-thumb.webp', photo_bucket: 'tanneros-private', location: 'Bodega', unit_cost: 450, notes: 'Marca Voit' }),
  art('b4', 'Balones del 4', 'Balones', 7),
  art('conos', 'Conos', 'Conos', 10, 10),
  art('casacas', 'Casacas', 'Casacas', 10, 0, { needs_reorder: true, min_stock: 12 }),
  art('liga', 'Liga', null, 1),
  art('viejo', 'Balón Número 3', 'Balones', 10, 0, { status: 'retired' })
];
const ASIGN = [
  { id:'as1', equipment_item_id:'b5', item_name:'Balones del 5', assigned_to_user_id:'u-leo', recipient_name:'Leo Profe', quantity:2, assigned_at:'2026-10-01T15:00:00Z' },
  { id:'as2', equipment_item_id:'conos', item_name:'Conos', assigned_to_user_id:'u-leo', recipient_name:'Leo Profe', quantity:10, assigned_at:'2026-10-02T15:00:00Z' }
];
const COACHES = [{ user_id:'u-leo', display_name:'Leo Profe' }, { user_id:'u-ana', display_name:'Ana Formadora' }];
const REPORTS = [
  { id:'r1', equipment_item_id:'b5', item_name:'Balones del 5', report_type:'danado', quantity:1, reason:'Se ponchó', status:'pendiente', reporter_name:'Leo Profe', created_at:'2026-10-08T15:00:00Z' },
  { id:'r2', equipment_item_id:null, item_name:null, report_type:'material_adicional', quantity:2, reason:'2 petos', status:'pendiente', reporter_name:'Ana Formadora', created_at:'2026-10-07T15:00:00Z' },
  { id:'r3', equipment_item_id:'conos', item_name:'Conos', report_type:'perdido', quantity:1, status:'resuelto', reporter_name:'Leo Profe', created_at:'2026-09-01T15:00:00Z' }
];
const KIT = [{ id:'k1', equipment_item_id:'b5', item_name:'Balones del 5', quantity:2, assigned_at:'2026-10-01T15:00:00Z', item_photo_thumb_path:'org/equipment/items/b5/foto-thumb.webp' },
             { id:'k2', equipment_item_id:'conos', item_name:'Conos', quantity:10, assigned_at:'2026-10-02T15:00:00Z' }];

const nav = await chromium.launch({ executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
let fallos = 0, corridas = 0;
const revisa = (nombre, ok, detalle) => { corridas++; if (!ok) { fallos++; console.error(` - ${nombre}${detalle ? `\n   ${detalle}` : ''}`); } };

async function abre(puedeEscribir) {
  const pg = await nav.newPage({ viewport:{ width:390, height:844 } });
  const errs = [];
  pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await pg.addInitScript(({ ITEMS, ASIGN, COACHES, REPORTS, KIT, puedeEscribir }) => {
    const R = {
      v2_my_context:[{ user_id:'u1', display_name:'Zul', organization_id:'o1', organization_name:'Tannery City FC', role: puedeEscribir ? 'Operaciones' : 'Formadores', is_owner:false }],
      v2_my_modules:[{ module_code:'equipment', enabled:true, can_read:true, can_write:puedeEscribir }],
      v2_equipment_items:ITEMS, v2_equipment_assignments:ASIGN, v2_equipment_coaches:COACHES, v2_equipment_reports:REPORTS,
      v2_equipment_inventory_value:[{ category:'Balones', units:19, estimated_value:5400 }],
      v2_my_equipment_kit:KIT, v2_my_equipment_reports:[REPORTS[0]], v2_equipment_history:[], v2_equipment_units:[]
    };
    window.__llamadas = [];
    window.tosConfirm = async () => true;
    window.tosAlert = async (o) => { window.__alerta = o; };
    window.tosPrompt = async () => 'Ya se repuso';
    window.__fakeSupabase = {
      auth:{ getSession:async()=>({data:{session:{user:{id:'u1'}}}}), getUser:async()=>({data:{user:{id:'u1'}}}), onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}) },
      rpc:async (n, params) => { window.__llamadas.push({ n, params }); return { data: R[n] ?? null, error:null }; },
      storage:{ from:()=>({ createSignedUrls:async(ps)=>({ data:ps.map(p=>({ path:p, signedUrl:'/qa-foto/'+encodeURIComponent(p) })), error:null }), createSignedUrl:async()=>({data:null}) }) },
      channel:()=>({ on(){return this;}, subscribe(){return this;} }), removeChannel(){}
    };
  }, { ITEMS, ASIGN, COACHES, REPORTS, KIT, puedeEscribir });
  await pg.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await pg.route(/\/v2\/supabase-client\.js(\?.*)?$/, r => r.fulfill({ status:200, contentType:'text/javascript', body:'export function createClient(){ return window.__fakeSupabase; }' }));
  await pg.goto(`${BASE}/v2/utileria/`, { waitUntil:'domcontentloaded' });
  await pg.waitForSelector('#view:not(.hidden)', { timeout:8000 });
  return { pg, errs };
}
const llamadas = (pg, n) => pg.evaluate(n => window.__llamadas.filter(x => x.n === n).map(x => x.params), n);
const cabe = async (pg, donde) => revisa(`${donde}: nada se sale a 390px`, await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  String(await pg.evaluate(() => document.documentElement.scrollWidth)));

/* ===== ADMINISTRACIÓN ===== */
{
  const { pg, errs } = await abre(true);
  await pg.waitForSelector('.ut-card[data-item]', { timeout:6000 });
  const seg = await pg.$$eval('#utSeg a strong', s => s.map(x => x.textContent));
  revisa('1. arriba: 5 artículos, 1 persona con material, 2 reportes por atender', JSON.stringify(seg) === '["5","1","2"]', JSON.stringify(seg));
  revisa('1. los reportes por atender se marcan', await pg.$eval('#utSeg a[data-seg="reportes"]', a => a.classList.contains('alerta')));
  const tarjetas = await pg.$$eval('.ut-card[data-item]', c => c.map(x => x.dataset.item));
  revisa('2. sale lo activo, no lo dado de baja', tarjetas.length === 5 && !tarjetas.includes('viejo'), JSON.stringify(tarjetas));
  revisa('2. el número grande es lo que hay en bodega', /10\s*en bodega/.test(await pg.innerText('.ut-card[data-item="b5"]')));
  revisa('2. lo que no queda se marca "Agotado" y lo bajo "Reponer"',
    /Agotado/.test(await pg.innerText('.ut-card[data-item="conos"]')) && /Reponer/.test(await pg.innerText('.ut-card[data-item="casacas"]')));
  await pg.waitForFunction(() => document.querySelector('.ut-card[data-item="b5"] img'), null, { timeout:3000 }).catch(() => {});
  revisa('2. la tarjeta enseña la foto', (await pg.$('.ut-card[data-item="b5"] img')) !== null);
  await pg.click('.ut-chip[data-cat="Balones"]');
  revisa('2. la categoría filtra', JSON.stringify(await pg.$$eval('.ut-card[data-item]', c => c.map(x => x.dataset.item).sort())) === '["b4","b5"]');
  await pg.click('.ut-chip[data-cat=""]');
  await pg.fill('#utBuscar', 'cas');
  revisa('2. el buscador filtra', JSON.stringify(await pg.$$eval('.ut-card[data-item]:not(.hidden)', c => c.map(x => x.dataset.item))) === '["casacas"]');
  await pg.fill('#utBuscar', '');
  revisa('2. "Sin categoría" junta lo que no tiene', (await pg.$('.ut-chip[data-cat="Sin categoría"]')) !== null);
  await cabe(pg, 'qué tenemos');

  // 3. Entregar desde la ficha: el "qué" ya va.
  await pg.click('.ut-card[data-item="b5"]');
  await pg.waitForSelector('#utFondo:not(.hidden) .ut-stats');
  const stats = await pg.$$eval('.ut-stats strong', s => s.map(x => x.textContent));
  revisa('3. la ficha dice en bodega, entregados y total', JSON.stringify(stats) === '["10","2","12"]', JSON.stringify(stats));
  revisa('3. y quién lo tiene', /Leo Profe/.test(await pg.innerText('#utHojaCuerpo')));
  await cabe(pg, 'la ficha');
  await pg.click('[data-accion="entregar"]');
  await pg.waitForSelector('[data-coach="u-ana"]');
  await pg.click('[data-coach="u-ana"]');
  await pg.waitForSelector('#eConfirmar');
  await pg.click('[data-cq="1"]');
  await pg.click('#eConfirmar');
  await pg.waitForTimeout(300);
  let asig = await llamadas(pg, 'v2_assign_equipment');
  revisa('3. desde la ficha: a quién → confirmar, y se entrega', asig.length === 1 && asig[0].item_id === 'b5' && asig[0].assigned_to_user_id === 'u-ana' && asig[0].quantity === 2, JSON.stringify(asig));
  revisa('3. avisa que se entregó', /Entregado/.test(await pg.innerText('#utAviso')));

  // 3. Desde arriba: qué → a quién (otra persona) → confirmar.
  await pg.click('#utEntregar');
  await pg.waitForSelector('[data-eitem]');
  revisa('3. sólo ofrece lo que hay en bodega', !(await pg.$('[data-eitem="conos"]')));
  await pg.click('[data-eitem="b4"]');
  await pg.fill('#eOtro input', 'Papá de Mateo');
  await pg.click('#eOtro button');
  await pg.waitForSelector('#eConfirmar');
  await pg.click('#eConfirmar');
  await pg.waitForTimeout(300);
  asig = await llamadas(pg, 'v2_assign_equipment');
  revisa('3. "otra persona" va con su nombre', asig[1]?.item_id === 'b4' && asig[1]?.assigned_to_label === 'Papá de Mateo' && asig[1]?.assigned_to_user_id === null, JSON.stringify(asig[1]));

  // 4. Ajustar la cantidad sin perder nada.
  await pg.click('.ut-card[data-item="b5"]');
  await pg.waitForSelector('[data-ajuste="1"]');
  await pg.click('[data-ajuste="1"]');
  await pg.click('#utGuardaCantidad');
  await pg.waitForTimeout(300);
  const up = (await llamadas(pg, 'v2_upsert_equipment_item')).at(-1) || {};
  revisa('4. ajustar sube la cantidad', up.quantity === 13, JSON.stringify(up));
  revisa('4. y NO borra la foto, el costo, la ubicación ni las notas', up.photo_path === 'org/equipment/items/b5/foto.webp' && up.photo_thumb_path === 'org/equipment/items/b5/foto-thumb.webp'
    && up.unit_cost === 450 && up.location === 'Bodega' && up.notes === 'Marca Voit' && up.category === 'Balones', JSON.stringify(up));
  revisa('4. no deja bajar de lo entregado', await pg.evaluate(async () => {
    for (let i = 0; i < 20; i++) document.querySelector('[data-ajuste="-1"]')?.click();
    return document.querySelector('#utCantidad')?.textContent;
  }) === '2');
  await pg.click('#utHojaCerrar');

  // 5. Nuevo artículo.
  await pg.click('#utNuevo');
  await pg.waitForSelector('#utForm');
  await pg.fill('#fNombre', 'Petos');
  await pg.click('[data-fcat="Casacas"]');
  await pg.click('[data-fq="10"]'); await pg.click('[data-fq="1"]');
  await cabe(pg, 'nuevo artículo');
  await pg.click('#fGuardar');
  await pg.waitForTimeout(300);
  const nuevo = (await llamadas(pg, 'v2_upsert_equipment_item')).at(-1) || {};
  revisa('5. nuevo artículo con nombre, categoría y cantidad', nuevo.item_id === null && nuevo.name === 'Petos' && nuevo.category === 'Casacas' && nuevo.quantity === 11 && nuevo.control_type === 'cantidad', JSON.stringify(nuevo));

  // 6. Quién lo tiene.
  await pg.goto(`${BASE}/v2/utileria/#/quien`);
  await pg.waitForSelector('.ut-persona-card');
  revisa('6. una tarjeta por persona con lo que trae', (await pg.$$('.ut-persona-card')).length === 1 && (await pg.$$('.ut-persona-card [data-devuelve]')).length === 2);
  await pg.click('[data-devuelve="as2"]');
  await pg.waitForTimeout(300);
  const dev = await llamadas(pg, 'v2_return_equipment');
  revisa('6. "Devolvió" es un toque', dev.length === 1 && dev[0].assignment_id === 'as2', JSON.stringify(dev));
  await cabe(pg, 'quién lo tiene');

  // 7. Reportes.
  await pg.goto(`${BASE}/v2/utileria/#/reportes`);
  await pg.waitForSelector('.ut-reporte');
  revisa('7. primero lo que está por atender', (await pg.$$('.ut-reporte')).length === 2);
  await pg.click('[data-reporte="r1"] [data-estado="resuelto"]');
  await pg.waitForTimeout(300);
  await pg.click('[data-reporte="r2"] [data-estado="rechazado"]');
  await pg.waitForTimeout(300);
  const res = await llamadas(pg, 'v2_resolve_equipment_report');
  revisa('7. "Resuelto" es un toque', res[0]?.report_id === 'r1' && res[0]?.status === 'resuelto', JSON.stringify(res[0]));
  revisa('7. "Rechazar" pide el porqué', res[1]?.report_id === 'r2' && res[1]?.status === 'rechazado' && res[1]?.resolution_note === 'Ya se repuso', JSON.stringify(res[1]));
  await cabe(pg, 'reportes');
  revisa('administración sin errores', errs.length === 0, errs.join('\n'));
  await pg.close();
}

/* ===== EL PROFE ===== */
{
  const { pg, errs } = await abre(false);
  await pg.waitForSelector('.ut-card[data-kit]', { timeout:6000 });
  revisa('8. el profe ve "Mi utilería" y no las secciones de administración', (await pg.innerText('#utTitulo')) === 'Mi utilería' && await pg.$eval('#utSeg', s => s.classList.contains('hidden')) && await pg.$eval('#utEntregar', b => b.classList.contains('hidden')));
  revisa('8. su material en tarjetas', (await pg.$$('.ut-card[data-kit]')).length === 2);
  await pg.click('.ut-card[data-kit="k1"]');
  await pg.click('[data-tipo="roto"]');
  await pg.waitForSelector('#rForm');
  await pg.click('[data-rq="1"]');
  await pg.fill('#rMotivo', 'Se rompió en el partido');
  await pg.click('#rEnviar');
  await pg.waitForTimeout(300);
  const rep = await llamadas(pg, 'v2_report_equipment_issue');
  revisa('8. tocar → qué pasó → enviar', rep[0]?.item_id === 'b5' && rep[0]?.report_type === 'roto' && rep[0]?.quantity === 2 && rep[0]?.reason === 'Se rompió en el partido', JSON.stringify(rep[0]));
  await pg.click('#utPedir');
  await pg.waitForSelector('#rQue');
  await pg.click('#rEnviar');
  revisa('9. pedir material exige decir qué', (await llamadas(pg, 'v2_report_equipment_issue')).length === 1);
  await pg.fill('#rQue', '2 petos talla M');
  await pg.click('#rEnviar');
  await pg.waitForTimeout(300);
  const pedido = (await llamadas(pg, 'v2_report_equipment_issue'))[1];
  revisa('9. pedir material va sin artículo', pedido?.item_id === null && pedido?.report_type === 'material_adicional' && /2 petos talla M/.test(pedido?.reason || ''), JSON.stringify(pedido));
  await cabe(pg, 'mi utilería');
  revisa('profe sin errores', errs.length === 0, errs.join('\n'));
  await pg.close();
}

await nav.close(); srv.close();
if (fallos) { console.error(`Utilería humo FAILED · ${fallos} de ${corridas}`); process.exit(1); }
console.log(`Utilería humo OK · ${corridas} revisiones: qué tenemos, quién lo tiene y reportes; entregar en 3 toques, devolver y resolver en 1, y ajustar sin borrar la foto`);
