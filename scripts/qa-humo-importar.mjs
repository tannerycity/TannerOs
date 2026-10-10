// Importar jugadores desde Excel (/jugadores/importar/) en Chromium, con
// Supabase falso.
//
// Presidencia, 10/10/2026: todo club llega con su lista en Excel; si cargarla
// tarda, el club no se queda. Revisa:
//   · quien no puede dar de alta jugadores no ve el importador;
//   · pegar desde Excel detecta las columnas y parte el nombre completo;
//   · una columna mal detectada se corrige y la muestra cambia;
//   · "Revisar" pregunta al servidor SIN guardar (dry_run) y enseña, primero,
//     lo que no entra y lo que tiene avisos;
//   · "Importar" guarda (dry_run false) exactamente las mismas filas;
//   · un .xlsx se lee (SheetJS se baja sólo entonces) con fechas como número
//     de serie de Excel;
//   · nada se sale a 390px.
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const T = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('no'); return; }
  r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}`;

const revisiones = [], errores = [];
const revisa = (n, ok, d = '') => revisiones.push({ nombre: n, ok, detalle: d });
const nav = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

async function abre({ escribe = true } = {}) {
  const p = await nav.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(`console: ${m.text()}`); });
  await p.addInitScript(({ escribe }) => {
    window.__llamadas = [];
    // El servidor falso: revisa como el real (nombre obligatorio, duplicado
    // contra "Leo Pérez", aviso sin teléfono) y numera los nuevos.
    const revisar = (rows, dry) => {
      let n = 0; const filas = rows.map((f, i) => {
        const nombre = [f.firstName, f.lastName].filter(Boolean).join(' ');
        if (!f.firstName) return { fila: i + 1, estado: 'error', motivo: 'Falta el nombre', avisos: [], nombre };
        if (/^leo perez$/i.test(nombre.normalize('NFD').replace(/[̀-ͯ]/g, ''))) return { fila: i + 1, estado: 'duplicado', motivo: 'Ya está en el club', avisos: [], nombre };
        n++; return { fila: i + 1, estado: 'nuevo', motivo: null, avisos: f.phone ? [] : ['Sin teléfono del tutor'], nombre, categoria: f.category || null, codigo: dry ? null : `Jugador00${n}` };
      });
      const c = e => filas.filter(x => x.estado === e).length;
      return { guardado: !dry, resumen: { nuevos: c('nuevo'), duplicados: c('duplicado'), errores: c('error'), conAvisos: filas.filter(x => x.estado === 'nuevo' && x.avisos.length).length }, filas };
    };
    const R = {
      v2_my_context: () => [{ user_id: 'u1', display_name: 'Ana', organization_id: 'o9', organization_name: 'Halcones FC', organization_slug: 'halcones', role: 'Presidencia', is_owner: true }],
      v2_my_navigation: () => ['jugadores', 'inicio'].map(c => ({ module_code: c, enabled: true, can_read: true, can_write: escribe })),
      v2_import_players: prm => revisar(prm.rows, prm.dry_run)
    };
    window.__fakeSupabase = {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }), getUser: async () => ({ data: { user: { id: 'u1' } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
      rpc: async (n, prm) => { window.__llamadas.push({ n, prm: JSON.parse(JSON.stringify(prm || {})) }); return { data: R[n] ? R[n](prm) : null, error: null }; },
      from: () => ({ select() { return this; }, eq() { return this; }, then(r) { return Promise.resolve({ data: [], error: null }).then(r); } }),
      channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {}
    };
  }, { escribe });
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.route('**/v2/supabase-client.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'export function createClient(){ return window.__fakeSupabase; }' }));
  await p.route('**/v2/photo-cache.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'export async function getSignedPhotoUrls(){return {};}export async function getSignedPhotoUrl(){return null;}export function clearPhotoCache(){}' }));
  // SheetJS falso: lee el "xlsx" como la hoja que devolvería Excel, con la
  // fecha como número de serie.
  await p.route(/esm\.sh\/xlsx@0\.18\.5/, r => r.fulfill({ status: 200, contentType: 'text/javascript', body: `
    export function read(){ window.__xlsxLeido = true; return { SheetNames: ['Hoja1'], Sheets: { Hoja1: {} } }; }
    export const utils = { sheet_to_json: () => [['Nombre completo','Fecha de nacimiento','Categoría','Celular'],['Iker Ramírez Soto',42798,'Sub-8',4771112233]] };` }));
  await p.goto(BASE + '/v2/jugadores/importar/', { waitUntil: 'domcontentloaded' });
  return p;
}
const llamadas = (p, n) => p.evaluate(n => window.__llamadas.filter(x => x.n === n), n);

{ // Sin permiso de escritura
  const p = await abre({ escribe: false });
  await p.waitForSelector('#imDenied:not(.hidden)', { timeout: 5000 }).catch(() => {});
  revisa('[acceso] sin permiso no ve el importador', await p.isVisible('#imDenied') && !(await p.isVisible('#im')));
  await p.close();
}

{ // Pegar desde Excel, corregir, revisar e importar
  const p = await abre();
  await p.waitForSelector('#im:not(.hidden)', { timeout: 5000 });
  revisa('[plantilla] se puede bajar', (await p.getAttribute('#imPlantilla', 'href') || '').startsWith('blob:'));
  const pegado = ['Nombre completo\tFecha Nac.\tCategoría\tMamá\tCelular\tNotas',
    'Juan Carlos Pérez López\t04/03/2017\tSub-8\tAna López\t477 123 4567\tzurdo',
    'Leo Pérez\t01/01/2016\tSub-10\tRosa\t4779998877\t',
    '\t02/02/2016\tSub-10\t\t\t',
    'Mía Gómez\t15/06/2015\tSub-10\t\t\t'].join('\n');
  await p.fill('#imPegar', pegado);
  await p.click('#imLeer');
  await p.waitForSelector('#imPaso2:not(.hidden)');
  const sel = async campo => p.$eval(`#imMapa select[data-campo="${campo}"]`, s => s.options[s.selectedIndex].text);
  revisa('[columnas] detecta nombre completo, fecha, categoría, tutor y teléfono',
    (await sel('nombreCompleto')) === 'Nombre completo' && (await sel('birthDate')) === 'Fecha Nac.' && (await sel('category')) === 'Categoría'
    && (await sel('guardianName')) === 'Mamá' && (await sel('phone')) === 'Celular' && (await sel('position')) === 'No viene');
  const muestra = await p.innerText('#imMuestra');
  revisa('[columnas] la muestra parte el nombre y entiende la fecha', /4 filas/.test(muestra) && /Juan Carlos Pérez López/.test(muestra) && /2017-03-04 · Sub-8 · Ana López · 477 123 4567/.test(muestra), muestra);
  await p.selectOption('#imMapa select[data-campo="position"]', { label: 'Notas' });
  revisa('[columnas] una columna se puede corregir', (await sel('position')) === 'Notas');

  await p.click('#imRevisar');
  await p.waitForSelector('#imPaso3:not(.hidden)');
  const prev = await llamadas(p, 'v2_import_players');
  revisa('[revisar] pregunta al servidor sin guardar', prev.length === 1 && prev[0].prm.dry_run === true && prev[0].prm.organization_id === 'o9');
  const f0 = prev[0].prm.rows[0];
  revisa('[revisar] manda la fila limpia', f0.firstName === 'Juan Carlos' && f0.lastName === 'Pérez López' && f0.birthDate === '2017-03-04' && f0.category === 'Sub-8' && f0.guardianName === 'Ana López' && f0.position === 'zurdo', JSON.stringify(f0));
  const resumen = await p.innerText('#imResumen');
  revisa('[revisar] resumen: entran, con avisos, ya existen y no entran', /2 entran/.test(resumen) && /1 con algo por completar/.test(resumen) && /1 ya existe/.test(resumen) && /1 no entra/.test(resumen), resumen);
  const primera = await p.$eval('#imFilas .im-fila', e => e.className + ' ' + e.innerText);
  revisa('[revisar] lo que no entra va primero, con su motivo', /im-mal/.test(primera) && /Falta el nombre/.test(primera), primera);
  revisa('[revisar] el botón dice cuántos entran', (await p.textContent('#imGuardar')) === 'Importar 2 jugadores');
  if (process.env.QA_CAPTURA) await p.screenshot({ path: process.env.QA_CAPTURA, fullPage: true });
  revisa('[sin desborde] la revisión cabe a 390px', !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));

  await p.click('#imGuardar');
  await p.waitForSelector('#imPaso4:not(.hidden)');
  const todas = await llamadas(p, 'v2_import_players');
  revisa('[importar] guarda las mismas filas', todas.length === 2 && todas[1].prm.dry_run === false && JSON.stringify(todas[1].prm.rows) === JSON.stringify(todas[0].prm.rows));
  revisa('[importar] dice cuántos entraron y qué falta', /2 jugadores nuevos en el club/.test(await p.textContent('#imListoTitulo')) && /1 quedó con algo por completar/.test(await p.textContent('#imListoTexto')) && /1 ya existía/.test(await p.textContent('#imListoTexto')));
  revisa('[importar] liga a Jugadores', (await p.getAttribute('#imPaso4 a.im-cta', 'href')) === '/jugadores/');
  await p.click('#imOtra');
  revisa('[otra lista] regresa al paso 1 vacío', await p.isVisible('#imPaso1') && (await p.inputValue('#imPegar')) === '');
  await p.close();
}

{ // Un .xlsx
  const p = await abre();
  await p.waitForSelector('#im:not(.hidden)', { timeout: 5000 });
  await p.setInputFiles('#imArchivo', { name: 'jugadores.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('PK falso') });
  await p.waitForSelector('#imPaso2:not(.hidden)', { timeout: 5000 }).catch(() => {});
  const m = await p.innerText('#imMuestra').catch(() => '');
  revisa('[xlsx] se lee con la fecha de serie de Excel', (await p.evaluate(() => window.__xlsxLeido === true)) && /Iker Ramírez Soto/.test(m) && /2017-03-04 · Sub-8 · 4771112233/.test(m), m);
  await p.close();
}

await nav.close(); srv.close();
let mal = 0;
for (const r of revisiones) if (!r.ok) { mal++; console.error(` - ${r.nombre}${r.detalle ? ' :: ' + r.detalle : ''}`); }
if (errores.length) { console.error('ERRORES DEL NAVEGADOR:'); errores.forEach(e => console.error('   ' + e)); }
if (mal || errores.length) { console.error(`Importar humo FAILED · ${mal} de ${revisiones.length}, ${errores.length} errores`); process.exit(1); }
console.log(`Importar humo OK · ${revisiones.length} revisiones: permiso, pegar de Excel, columnas, revisión sin guardar, importar y .xlsx`);
