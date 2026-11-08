/* Búsquedas recientes en cada buscador (05/11/2026).
 *
 * Presidencia: "que si buscaste algo se quede ahí guardado... busqué a tal
 * niño y no me acordé quién era... un buscador rápido".
 *
 * Revisa:
 *   1. La lógica sola: lo último primero, sin repetidos ni acentos dobles,
 *      sin los pedazos ("Dam" -> "Damián"), máximo 6, 30 días, sin teléfonos,
 *      llave por persona y por buscador, y "Salir" lo borra todo.
 *   2. En el navegador: escribir un nombre lo guarda (sin Enter); al volver a
 *      tocar el buscador vacío sale "Recientes"; un toque vuelve a buscar
 *      (dispara la búsqueda de la pantalla); "Borrar" los quita; un buscador
 *      que aparece después (una hoja) también recuerda; el buscador de arriba
 *      y los campos que no son de búsqueda no se tocan; sigue al recargar.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { agrega, vigentes, llave, borraTodo, normaliza, MAX } from '../v2/busquedas-recientes.js';

let fallos = 0, corridas = 0;
const revisa = (n, ok, d = '') => { corridas++; if (!ok) { fallos++; console.error(` - ${n}${d ? ' :: ' + d : ''}`); } };
const prueba = (n, f) => { try { f(); revisa(n, true); } catch (e) { revisa(n, false, e.message); } };

// 1. La lógica
const T0 = Date.UTC(2026, 10, 5);
prueba('lo último primero y sin repetidos (aunque cambien acentos y mayúsculas)', () => {
  let l = [];
  for (const t of ['Damián', 'Erick', 'damian']) l = agrega(l, t, T0);
  assert.deepEqual(l.map(x => x.t), ['damian', 'Erick']);
});
prueba('no guarda los pedazos que se tecleaban antes', () => {
  let l = agrega([], 'Dam', T0); l = agrega(l, 'Damián Ló', T0 + 1); l = agrega(l, 'Damián López', T0 + 2);
  assert.deepEqual(l.map(x => x.t), ['Damián López']);
});
prueba(`máximo ${MAX}`, () => {
  let l = []; for (const t of ['aa', 'bb', 'cc', 'dd', 'ee', 'ff', 'gg']) l = agrega(l, t, T0);
  assert.equal(l.length, MAX); assert.equal(l[0].t, 'gg');
});
prueba('menos de 2 letras no se guarda', () => assert.deepEqual(agrega([], ' a ', T0), []));
prueba('un teléfono tecleado no se guarda', () => assert.deepEqual(agrega([], '477 123 4567', T0), []));
prueba('a los 30 días se olvida', () => {
  const l = agrega([], 'Damián', T0);
  assert.equal(vigentes(l, T0 + 29 * 864e5).length, 1);
  assert.equal(vigentes(l, T0 + 31 * 864e5).length, 0);
});
prueba('la llave es de la persona y de cada buscador', () => {
  assert.notEqual(llave('o', 'a', '/jugadores/', 'q'), llave('o', 'b', '/jugadores/', 'q'));
  assert.notEqual(llave('o', 'a', '/jugadores/', 'q'), llave('o', 'a', '/taquilla/', 'q'));
});
prueba('"Salir" borra todos los recientes y nada más', () => {
  const m = new Map([['tos:recientes:o:a:/x:q', '[]'], ['tos:recientes:o:b:/y:q', '[]'], ['otra', '1']]);
  const s = { get length() { return m.size; }, key: i => [...m.keys()][i], removeItem: k => m.delete(k) };
  assert.equal(borraTodo(s), 2); assert.deepEqual([...m.keys()], ['otra']);
});
prueba('normaliza sin acentos ni espacios dobles', () => assert.equal(normaliza('  José   Ramírez '), 'jose ramirez'));

// 2. En el navegador
const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const srv = http.createServer((q, r) => {
  const p = decodeURIComponent(q.url.split('?')[0]);
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('no'); return; }
  r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html' }); r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}`;
const PAGINA = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
  <div class="tos-search-box"><input id="shellSearch" type="search" placeholder="Buscar en todo TannerOS"></div>
  <div class="tsearch"><div class="tsearch-field"><input id="playerSearch" type="search" placeholder="Buscar Tanner, familia o número"></div></div>
  <input id="nombre" type="text" placeholder="Nombre del tutor">
  <ul id="lista"></ul>
  <button id="abreHoja" type="button">Hoja</button>
  <script type="module">
    import { instala } from '/v2/busquedas-recientes.js';
    instala({ org: 'o1', usuario: 'u-mich' });
    // La pantalla busca con su propio "input", como Jugadores o Taquilla.
    window.__busquedas = [];
    document.getElementById('playerSearch').addEventListener('input', e => window.__busquedas.push(e.target.value));
    document.getElementById('abreHoja').addEventListener('click', () => {
      document.body.insertAdjacentHTML('beforeend', '<section id="hoja"><input id="invBusca" type="search" placeholder="Buscar por nombre o número"></section>');
    });
  </script></body></html>`;
const nav = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
const pg = await ctx.newPage();
const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.route(`${BASE}/prueba/`, r => r.fulfill({ status: 200, contentType: 'text/html', body: PAGINA }));
await pg.goto(`${BASE}/prueba/`); await pg.waitForTimeout(200);

revisa('el buscador vacío sin historial no enseña nada', !(await pg.isVisible('.tos-recientes')) && (await pg.click('#playerSearch'), !(await pg.isVisible('.tos-recientes'))));
await pg.fill('#playerSearch', 'Damián López');
await pg.waitForTimeout(1700);               // se guarda al dejar de teclear, sin Enter
await pg.fill('#playerSearch', 'Erick'); await pg.press('#playerSearch', 'Enter');
await pg.fill('#playerSearch', ''); await pg.click('#nombre'); await pg.click('#playerSearch');
const chips = await pg.$$eval('.tos-recientes [data-reciente]', b => b.map(x => x.textContent.trim()));
revisa('al tocar el buscador vacío salen sus recientes, lo último primero', chips.join('|') === 'Erick|Damián López', chips.join('|'));
if (process.env.SHOTS) await pg.screenshot({ path: `${process.env.SHOTS}/busquedas-recientes.png` });
await pg.evaluate(() => { window.__busquedas = []; });
await pg.click('.tos-recientes [data-reciente="Damián López"]');
revisa('un toque vuelve a buscar (la pantalla recibe la búsqueda)', (await pg.inputValue('#playerSearch')) === 'Damián López' && (await pg.evaluate(() => window.__busquedas)).includes('Damián López'));
revisa('con texto escrito la lista se esconde', !(await pg.isVisible('.tos-recientes')));
revisa('el buscador de arriba y un campo normal no se tocan', (await pg.$$('.tos-recientes')).length === 1);

await pg.reload(); await pg.waitForTimeout(200);
await pg.click('#playerSearch');
revisa('sigue ahí al cerrar y volver a abrir', (await pg.$$('.tos-recientes [data-reciente]')).length === 2);
await pg.click('.tos-recientes .tos-rec-borra');
await pg.click('#nombre'); await pg.click('#playerSearch');
revisa('"Borrar" los quita', !(await pg.isVisible('.tos-recientes')));

await pg.click('#abreHoja'); await pg.waitForTimeout(100);
await pg.fill('#invBusca', 'Leo Baby'); await pg.press('#invBusca', 'Enter');
await pg.fill('#invBusca', ''); await pg.click('#nombre'); await pg.click('#invBusca');
revisa('un buscador que aparece después (una hoja) también recuerda', (await pg.$$eval('#hoja + .tos-recientes [data-reciente], .tos-recientes [data-reciente]', b => b.map(x => x.textContent.trim()))).includes('Leo Baby'));
const llaves = await pg.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('tos:recientes:')));
revisa('cada buscador guarda aparte y por persona', llaves.length === 1 && /u-mich/.test(llaves[0]) && /invBusca/.test(llaves[0]), llaves.join(' | '));
revisa('sin scroll horizontal', await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
revisa('sin errores', !errs.length, errs.join(' | '));

await nav.close(); srv.close();
if (fallos) { console.error(`Búsquedas recientes FAILED · ${fallos} de ${corridas}`); process.exit(1); }
console.log(`Búsquedas recientes humo OK · ${corridas} revisiones: guarda sin Enter, un toque vuelve a buscar, sigue al reabrir, borrar, hojas y por persona`);
