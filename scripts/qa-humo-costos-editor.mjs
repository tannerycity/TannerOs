// Club › Costos públicos en Chromium, con Supabase falso (h22-h23, 20/10/2026).
//
// Presidencia: "¿dónde puedo editar estos costos?" y "como opción 1, opción
// 2… cuántos días y el costo; que la otra empresa también lo pueda poner".
// Revisa el editor que usa Presidencia:
//   1. Sin nada guardado, enseña lo de costos/tarifas.js (Baby 1 y 2 días,
//      Tanners 3 días) con su precio por clase calculado.
//   2. + Agregar opción y + Agregar categoría; el precio por clase se ve al
//      escribir.
//   3. Paquetes por cantidad de alumnos de cada categoría.
//   4. Guardar manda la lista limpia (claves, pesos enteros) a la base.
//   5. Un error (8 días) se dice en palabras y no se manda nada.
//   6. Quitar una categoría recorre las cantidades de los paquetes.
//   7. Sin permiso de escribir: todo en solo lectura.
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const T = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('no'); return; }
  r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}`;

const revisiones = [], errores = [];
const revisa = (n, ok, d = '') => revisiones.push({ nombre: n, ok, detalle: typeof d === 'string' ? d : JSON.stringify(d) });
const nav = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const ORG = 'o-tannery';

async function abre({ escribe = true } = {}) {
  const p = await nav.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(`console: ${m.text()}`); });
  await p.addInitScript(({ escribe, ORG }) => {
    window.__llamadas = [];
    const R = {
      v2_my_context: () => [{ user_id:'u1', display_name:'Mich', organization_id:ORG, organization_name:'Tannery City FC', role:'Presidencia', is_owner:true }],
      v2_my_navigation: () => ['inicio', 'admin'].map(c => ({ module_code:c, enabled:true, can_read:true, can_write:escribe })),
      v2_organization_settings: () => ({ name:'Tannery City FC', slug:'tannery-city-fc', currency:'MXN', locale:'es-MX', timezone:'America/Mexico_City' }),
      v2_club_config: () => ({ paymentInstructions:{} }),
      v2_registration_notes: () => [],
      v2_public_prices: () => null,
      v2_update_public_prices: prm => prm.prices
    };
    window.__fakeSupabase = {
      auth: { getSession: async () => ({ data: { session: { user: { id:'u1' } } } }), getUser: async () => ({ data: { user: { id:'u1' } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
      rpc: async (n, prm) => { window.__llamadas.push({ n, prm: JSON.parse(JSON.stringify(prm || {})) }); try { return { data: R[n] ? R[n](prm) : null, error: null }; } catch (e) { return { data: null, error: { message: e.message } }; } },
      from: () => ({ select() { return this; }, eq() { return this; }, then(r) { return Promise.resolve({ data: [], error: null }).then(r); } }),
      storage: { from: () => ({ createSignedUrls: async ps => ({ data: ps.map(x => ({ path: x, signedUrl: null, error: null })), error: null }) }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {}
    };
  }, { escribe, ORG });
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.route('**/v2/supabase-client.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'export function createClient(){ return window.__fakeSupabase; }' }));
  await p.goto(BASE + '/v2/admin/club/#costos', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#costosCats .costos-cat', { timeout: 8000 }).catch(() => {});
  return p;
}
const llamadas = (p, n) => p.evaluate(n => window.__llamadas.filter(x => x.n === n).map(x => x.prm), n);
const cat = i => `#costosCats [data-cat="${i}"]`;

{ // Presidencia edita
  const p = await abre();
  const cats = await p.$$eval('#costosCats .costos-cat [data-f="nombre"]', i => i.map(x => x.value));
  revisa('1. sin nada guardado, enseña Baby Tanners y Tanners', JSON.stringify(cats) === '["Baby Tanners","Tanners"]', cats);
  const clases = await p.$$eval('[data-clase]', s => s.map(x => x.textContent.trim()));
  revisa('1. cada opción con su precio por clase ($100, $69 y $67)', JSON.stringify(clases) === JSON.stringify(['= $100 por clase', '= $69 por clase', '= $67 por clase']), clases);
  revisa('1. los paquetes cuentan alumnos de cada categoría (2 Tanners = 2 en Tanners)',
    (await p.inputValue('#costosPaqs [data-paq="1"] [data-pc="1"]')) === '2' && (await p.inputValue('#costosPaqs [data-paq="1"] [data-pc="0"]')) === '');

  // 2. + opción a Tanners (2 días, $600) y + categoría Porteros
  await p.click(`${cat(1)} [data-add-op]`);
  await p.fill(`${cat(1)} [data-op="1"] [data-o="dias"]`, '2');
  await p.fill(`${cat(1)} [data-op="1"] [data-o="mensualidad"]`, '600');
  revisa('2. al escribir, el precio por clase se calcula solo ($75)', /\$75 por clase/.test(await p.textContent(`${cat(1)} [data-op="1"] [data-clase]`)));
  await p.click('#costosAddCat');
  await p.fill(`${cat(2)} [data-f="nombre"]`, 'Porteros');
  await p.fill(`${cat(2)} [data-f="edades"]`, 'De 8 a 14 años');
  await p.fill(`${cat(2)} [data-f="inscripcion"]`, '500');
  await p.fill(`${cat(2)} [data-op="0"] [data-o="dias"]`, '1');
  await p.fill(`${cat(2)} [data-op="0"] [data-o="mensualidad"]`, '300');
  revisa('2. la categoría nueva sale como columna en los paquetes', /Porteros/.test(await p.textContent('#costosPaqs [data-paq="0"]')));

  // 3. paquete nuevo: 2 Porteros $500
  await p.click('#costosAddPaq');
  const k = (await p.$$('#costosPaqs [data-paq]')).length - 1;
  await p.fill(`#costosPaqs [data-paq="${k}"] [data-p="nombre"]`, '2 Porteros');
  await p.fill(`#costosPaqs [data-paq="${k}"] [data-pc="2"]`, '2');
  await p.fill(`#costosPaqs [data-paq="${k}"] [data-p="mensualidad"]`, '500');
  await p.check('#cPaqOk');

  // 5. error antes de guardar: 8 días
  await p.fill(`${cat(0)} [data-op="0"] [data-o="dias"]`, '8');
  await p.click('#saveCostos'); await p.waitForTimeout(200);
  revisa('5. 8 días por semana se explica y no se manda nada', /de 1 a 7/.test(await p.textContent('#costosMessage')) && (await llamadas(p, 'v2_update_public_prices')).length === 0, await p.textContent('#costosMessage'));
  await p.fill(`${cat(0)} [data-op="0"] [data-o="dias"]`, '1');

  // 4. guardar
  await p.click('#saveCostos'); await p.waitForTimeout(400);
  const g = (await llamadas(p, 'v2_update_public_prices'))[0]?.prices || {};
  const tan = g.categorias?.find(c => c.clave === 'tanner'), por = g.categorias?.find(c => c.nombre === 'Porteros');
  revisa('4. guarda Tanners con sus dos opciones', JSON.stringify(tan?.opciones) === JSON.stringify([{ clave:'tanner-3', dias:3, mensualidad:800 }, { clave:'tanner-2', dias:2, mensualidad:600 }]), tan);
  revisa('4. guarda la categoría nueva con su clave', por?.clave === 'porteros' && por.inscripcion === 500 && por.edades === 'De 8 a 14 años' && por.opciones[0].mensualidad === 300, por);
  const paq = g.paquetes?.lista?.find(x => x.nombre === '2 Porteros');
  revisa('4. el paquete va por clave de categoría y confirmado', JSON.stringify(paq?.cantidades) === '{"porteros":2}' && g.paquetes.confirmado === true, g.paquetes);
  revisa('4. avisa que ya sale en /costos', /Ya salen en \/costos/.test(await p.textContent('#costosMessage')));

  // 6. quitar Baby: los paquetes recorren sus cantidades
  await p.click(`${cat(0)} [data-quita-cat]`);
  revisa('6. al quitar una categoría, los paquetes siguen apuntando a la correcta (2 Tanners → Tanners)',
    (await p.inputValue('#costosPaqs [data-paq="1"] [data-pc="0"]')) === '2', await p.inputValue('#costosPaqs [data-paq="1"] [data-pc="0"]'));
  revisa('9. nada se sale a 390px', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  if (process.env.SHOTS) await (await p.$('#costos')).screenshot({ path: `${process.env.SHOTS}/costos-editor.png` });
  await p.close();
}

{ // 7. sin permiso de escribir
  const p = await abre({ escribe: false });
  revisa('7. sin permiso: todo deshabilitado y "Solo lectura"', await p.isDisabled(`${cat(0)} [data-f="nombre"]`) && await p.isDisabled('#costosAddCat')
    && (await p.textContent('#saveCostos')) === 'Solo lectura' && !(await p.$('[data-add-op]')));
  await p.close();
}

await nav.close(); srv.close();
let mal = 0;
for (const r of revisiones) if (!r.ok) { mal++; console.error(` - ${r.nombre}${r.detalle ? ' :: ' + r.detalle : ''}`); }
for (const e of errores) { mal++; console.error(` - ${e}`); }
console.log(mal ? `Costos editor humo FAILED · ${mal}` : `Costos editor humo OK · ${revisiones.length} revisiones: categorías, opciones, precio por clase y paquetes`);
process.exit(mal ? 1 : 0);
