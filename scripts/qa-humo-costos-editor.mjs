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
      // Como la base: lo que se guarda es lo que se vuelve a leer.
      v2_public_prices: () => window.__guardado || null,
      v2_update_public_prices: prm => (window.__guardado = prm.prices)
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
  await p.waitForSelector('#costosCats [data-abre-cat]', { timeout: 8000 }).catch(() => {});
  return p;
}
const llamadas = (p, n) => p.evaluate(n => window.__llamadas.filter(x => x.n === n).map(x => x.prm), n);

{ // Presidencia edita, estilo Apple
  const p = await abre();
  const filas = await p.$$eval('#costosCats [data-abre-cat]', b => b.map(x => x.innerText.replace(/\s+/g, ' ').trim()));
  revisa('1. la lista dice todo en un renglón: Baby (2 opciones, desde $400) y Tanners (6 a 12 años · 3 días · $800)',
    filas.length === 2 && /Baby Tanners De 3 a 6 años · 2 opciones · desde \$400/.test(filas[0]) && /Tanners De 6 a 12 años · 3 días · \$800/.test(filas[1]), filas);
  revisa('1. "Guardar" empieza apagado: no hay cambios', await p.isDisabled('#saveCostos') && (await p.textContent('#saveCostos')) === 'Sin cambios');
  revisa('1. los paquetes se leen solos ("2 Tanners · $1,500 al mes")', /2 Tanners\s*\$1,500 al mes/.test(await p.innerText('#costosPaqs')));

  // 2. abrir Tanners: carrusel de edades y días, precio por clase al escribir
  await p.click('[data-abre-cat="1"]');
  revisa('2. tocar el renglón abre la hoja con el nombre', await p.isVisible('.ap-hoja') && (await p.inputValue('#hNombre')) === 'Tanners');
  revisa('2. las edades vienen marcadas en el carrusel (6 y 12)', (await p.getAttribute('[data-carrusel="edadMin"] .on', 'data-v')) === '6' && (await p.getAttribute('[data-carrusel="edadMax"] .on', 'data-v')) === '12');
  await p.click('[data-carrusel="edadMin"] [data-v="7"]');
  revisa('2. tocar 7 cambia las edades sin teclear ("De 7 a 12 años")', (await p.textContent('#hEdadTxt')) === 'De 7 a 12 años');
  await p.click('[data-carrusel="edadMax"] [data-v="5"]');
  revisa('2. si "hasta" queda abajo de "desde", se acomoda solo (5 a 5)', (await p.textContent('#hEdadTxt')) === '5 años');
  await p.click('[data-carrusel="edadMax"] [data-v="12"]'); await p.click('[data-carrusel="edadMin"] [data-v="6"]');
  await p.click('#hAddOp');
  revisa('2. "+ Otra opción" propone días que no se repiten', (await p.getAttribute('[data-carrusel="dias-1"] .on', 'data-v')) === '1');
  await p.click('[data-carrusel="dias-1"] [data-v="2"]');
  await p.fill('[data-precio="1"]', '$6O0 pesos');
  revisa('2. el precio sólo acepta números', (await p.inputValue('[data-precio="1"]')) === '60');
  await p.fill('[data-precio="1"]', '600');
  revisa('2. el precio por clase sale solo ($75)', (await p.textContent('[data-clase="1"]')) === '$75 por clase');
  await p.click('#apListo');
  revisa('2. "Listo" cierra la hoja y el renglón ya dice 2 opciones', !(await p.isVisible('.ap-hoja')) && /2 opciones · desde \$600/.test(await p.innerText('[data-abre-cat="1"]')));
  revisa('2. y ya se puede guardar', !(await p.isDisabled('#saveCostos')) && (await p.textContent('#saveCostos')) === 'Guardar cambios');

  // 3. agregar categoría Porteros
  await p.click('#costosAddCat');
  await p.click('#apListo');
  revisa('3. sin nombre no deja cerrar y lo dice', /nombre/.test(await p.textContent('#apHojaError')) && await p.isVisible('.ap-hoja'));
  await p.fill('#hNombre', 'Porteros');
  await p.click('[data-carrusel="edadMin"] [data-v="8"]'); await p.click('[data-carrusel="edadMax"] [data-v="14"]');
  await p.fill('#hInsc', '500');
  await p.click('[data-carrusel="dias-0"] [data-v="1"]');
  await p.fill('[data-precio="0"]', '300');
  await p.click('#apListo');
  revisa('3. la categoría nueva queda en la lista', /Porteros De 8 a 14 años · 1 día · \$300/.test((await p.innerText('#costosCats')).replace(/\s+/g, ' ')));

  // 4. paquete con − / +
  await p.click('#costosAddPaq');
  const steppers = await p.$$eval('.ap-stepper > span:first-child', s => s.map(x => x.textContent));
  revisa('4. el paquete pregunta cuántos de cada categoría', JSON.stringify(steppers) === '["Baby Tanners","Tanners","Porteros"]', steppers);
  revisa('4. "−" empieza apagado (no hay menos de 0)', await p.isDisabled('[data-menos="2"]'));
  await p.click('[data-mas="2"]'); await p.click('[data-mas="2"]');
  revisa('4. el nombre del paquete se arma solo ("2 Porteros")', /2 Porteros/.test(await p.textContent('.ap-hoja .ap-nota')));
  await p.fill('#hPaqPrecio', '500');
  await p.click('#apListo');
  await p.click('#cPaqOk', { force: true });

  // 5. guardar
  await p.click('#saveCostos'); await p.waitForTimeout(400);
  const g = (await llamadas(p, 'v2_update_public_prices'))[0]?.prices || {};
  const tan = g.categorias?.find(c => c.clave === 'tanner'), por = g.categorias?.find(c => c.nombre === 'Porteros');
  revisa('5. guarda Tanners con sus dos opciones y sus edades', tan?.edades === 'De 6 a 12 años' && JSON.stringify(tan.opciones) === JSON.stringify([{ clave:'tanner-3', dias:3, mensualidad:800 }, { clave:'tanner-2', dias:2, mensualidad:600 }]), tan);
  revisa('5. guarda Porteros con edades del carrusel', por?.clave === 'porteros' && por.edades === 'De 8 a 14 años' && por.inscripcion === 500 && por.opciones[0].mensualidad === 300, por);
  const paq = g.paquetes?.lista?.find(x => x.nombre === '2 Porteros');
  revisa('5. el paquete va con su nombre armado, por clave y confirmado', JSON.stringify(paq?.cantidades) === '{"porteros":2}' && paq.mensualidad === 500 && g.paquetes.confirmado === true, g.paquetes);
  revisa('5. avisa que ya sale en /costos y "Guardar" se apaga', /Ya salen en \/costos/.test(await p.textContent('#costosMessage')) && await p.isDisabled('#saveCostos'));

  // 6. eliminar Baby: los paquetes se recorren y los que eran sólo de Baby se van
  await p.click('[data-abre-cat="0"]');
  await p.click('#hBorrar');
  const paqs = await p.$$eval('#costosPaqs [data-abre-paq] b', b => b.map(x => x.textContent));
  revisa('6. al eliminar Baby, se van los paquetes que lo llevaban y los demás siguen bien', JSON.stringify(paqs) === JSON.stringify(['1 Tanner', '2 Tanners', '3 Tanners', '2 Porteros']), paqs);
  await p.keyboard.press('Escape');
  revisa('9. nada se sale a 390px', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await p.click('[data-abre-cat="0"]');
  if (process.env.SHOTS) { await p.waitForTimeout(400); await p.screenshot({ path: `${process.env.SHOTS}/costos-hoja.png` }); await p.keyboard.press('Escape'); await (await p.$('#costos')).screenshot({ path: `${process.env.SHOTS}/costos-editor.png` }); }
  await p.close();
}

{ // 7. sin permiso de escribir
  const p = await abre({ escribe: false });
  revisa('7. sin permiso: no hay "Agregar" y Guardar dice "Solo lectura"', !(await p.$('#costosAddCat')) && (await p.textContent('#saveCostos')) === 'Solo lectura' && await p.isDisabled('#cPaqOk'));
  await p.click('[data-abre-cat="1"]');
  revisa('7. se puede ver una categoría pero no cambiarla', await p.isDisabled('#hNombre') && !(await p.$('#apListo')) && await p.isDisabled('[data-carrusel="edadMin"] .ap-num'));
  await p.close();
}

await nav.close(); srv.close();
let mal = 0;
for (const r of revisiones) if (!r.ok) { mal++; console.error(` - ${r.nombre}${r.detalle ? ' :: ' + r.detalle : ''}`); }
for (const e of errores) { mal++; console.error(` - ${e}`); }
console.log(mal ? `Costos editor humo FAILED · ${mal}` : `Costos editor humo OK · ${revisiones.length} revisiones: categorías, opciones, precio por clase y paquetes`);
process.exit(mal ? 1 : 0);
