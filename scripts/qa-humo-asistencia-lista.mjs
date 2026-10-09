// Pasar lista en tres toques (rediseño futbolero, 09/10/2026).
//
// Presidencia: "prefiero que ya estén todos marcados y que solo toquen a los
// que faltan; eso es lo que ha funcionado". Y: "el coach debe ver primero su
// categoría; si no tiene asignada, que vea todo por igual".
//
// Abre /v2/asistencia/ REAL con un Supabase falso y revisa:
//   · inicio: mis categorías primero; sin asignar, todas por igual;
//   · un toque en la categoría abre la lista de hoy o la crea;
//   · una lista nunca guardada llega con todos presentes, sin guardar nada;
//   · un toque = falta, otro toque = presente; tarde y justificada por "···"
//     o toque largo; reportar baja vive en esa hoja, no en cada fila;
//   · Guardar manda lo que se ve, y la lista guardada no pierde las caras;
//   · una lista ya guardada NO se vuelve a marcar sola;
//   · salir sin guardar pregunta; sólo lectura no deja marcar.
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
await new Promise(r => srv.listen(4801, r));

const revisiones = [], errores = [];
const revisa = (n, ok, d = '') => revisiones.push({ nombre: n, ok, detalle: d });
const nav = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

async function abre({ mias = true, escribe = true, guardada = false } = {}) {
  const p = await nav.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error') errores.push(`console: ${m.text()}`); });
  await p.addInitScript(({ mias, escribe, guardada }) => {
    const hoy = new Date(); hoy.setHours(18, 0, 0, 0);
    const nombres = ['Damián López Luna', 'Dario Montalvo Díaz', 'Iker Ramírez', 'Mateo Hernández'];
    let roster = nombres.map((n, i) => ({ player_id: 'p' + i, code: 'Tanner0' + (10 + i), player_name: n,
      status: guardada && i < 2 ? (i ? 'absent' : 'present') : null }));
    const sesiones = [{ id: 's1', category_id: 'c2', title: 'Entrenamiento', category_name: 'T10', starts_at: hoy.toISOString(), roster_count: 4, present_count: guardada ? 1 : 0 }];
    window.__llamadas = [];
    const R = {
      v2_my_context: () => [{ organization_id: 'o1', organization_name: 'Tannery City FC', role: 'Formadores', is_owner: false }],
      v2_my_modules: () => [{ module_code: 'attendance', enabled: true, can_read: true, can_write: escribe }],
      v2_attendance_categories: () => [
        { category_id: 'c1', code: 'MBT', name: 'Mini Baby Tanner', active_players: 4, mine: mias },
        { category_id: 'c2', code: 'T10', name: 'T10', active_players: 4, mine: mias },
        { category_id: 'c3', code: 'T12', name: 'T12', active_players: 4, mine: false }],
      v2_attendance_sessions: () => sesiones,
      v2_create_attendance_session: prm => { sesiones.unshift({ id: 's-nueva', category_id: prm.category_id, title: 'Entrenamiento', category_name: 'Mini Baby Tanner', starts_at: prm.starts_at, roster_count: 4, present_count: 0 }); return 's-nueva'; },
      v2_attendance_roster: () => roster.map(x => ({ ...x })),
      v2_attendance_roster_thumbs: () => roster.map(x => ({ playerId: x.player_id, thumb: `t/${x.player_id}-thumb.webp`, bucket: 'tanneros-private' })),
      v2_save_attendance: prm => { const m = new Map(prm.records.map(r => [r.player_id, r.status])); roster = roster.map(x => ({ ...x, status: m.get(x.player_id) || x.status })); return prm.records.length; },
      v2_request_player_withdrawal: () => true
    };
    window.__fakeSupabase = {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'profe' } } } }), getUser: async () => ({ data: { user: { id: 'profe' } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
      rpc: async (n, prm) => { window.__llamadas.push({ n, prm }); return { data: R[n] ? R[n](prm) : null, error: null }; },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {}
    };
  }, { mias, escribe, guardada });
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.route('**/v2/supabase-client.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'export function createClient(){ return window.__fakeSupabase; }' }));
  await p.route('**/v2/photo-cache.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: [
    'export async function getSignedPhotoUrls(_s,b,paths){ const m={}; for(const x of paths) m[x]="/icon-512.png?"+encodeURIComponent(x); return m; }',
    'export async function getSignedPhotoUrl(){ return null; }', 'export async function getRawSignedPhotoUrl(){ return null; }',
    'export function clearPhotoCache(){}', 'export function forgetPhoto(){}'].join('\n') }));
  await p.goto('http://127.0.0.1:4801/v2/asistencia/', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#attendanceView:not(.hidden)', { timeout: 8000 });
  await p.waitForSelector('#categoryCards .as-equipo', { timeout: 6000 });
  return p;
}
const llamadas = (p, n) => p.evaluate(n => window.__llamadas.filter(x => x.n === n), n);
const estados = p => p.$$eval('#rosterList .as-estado', e => e.map(x => x.textContent.trim()));
const marcador = p => p.evaluate(() => ['mPresentes', 'mFaltas', 'mTarde', 'mSin'].map(id => document.getElementById(id).textContent).join('/'));
async function abreLista(p, cat) {
  await p.click(`#categoryCards .as-equipo[data-category="${cat}"]`);
  await p.waitForSelector('#rosterList .roster-row', { timeout: 6000 });
  await p.waitForTimeout(300);
}

// --- Inicio: mis categorías primero ---
{
  const p = await abre();
  const mias = await p.$$eval('#categoryCards .as-equipo', e => e.map(x => x.dataset.category));
  revisa('[inicio] mis categorías arriba, la ajena no', JSON.stringify(mias) === '["c1","c2"]', JSON.stringify(mias));
  revisa('[inicio] la ajena queda en "Cubrir otra categoría"', await p.isVisible('#coverBlock') && (await p.$$eval('#coverCards .as-equipo', e => e.length)) === 1);
  revisa('[inicio] se titula "Mis categorías"', (await p.textContent('#catsTitulo')).trim() === 'Mis categorías');
  const t10 = (await p.textContent('#categoryCards .as-equipo[data-category="c2"]')).replace(/\s+/g, ' ');
  revisa('[inicio] la categoría con lista de hoy lo dice', /Lista abierta/.test(t10), t10);
  revisa('[inicio] no hay scroll horizontal', !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));

  // Un toque abre la lista que ya existe: no crea otra.
  await abreLista(p, 'c2');
  revisa('[toque] la lista de hoy se abre sin crear otra sesión', (await llamadas(p, 'v2_create_attendance_session')).length === 0);
  const est = await estados(p);
  revisa('[todos presentes] una lista nunca guardada llega con todos presentes', est.length === 4 && est.every(x => x === 'Presente'), JSON.stringify(est));
  revisa('[todos presentes] pero nada se guarda sólo por abrirla', (await llamadas(p, 'v2_save_attendance')).length === 0);
  revisa('[marcador] 4 presentes, 0 faltas', (await marcador(p)) === '4/0/0/0', await marcador(p));
  revisa('[guardar] el botón dice cuántos vienen', /Guardar lista · 4 de 4/.test(await p.textContent('#saveAttendance')), await p.textContent('#saveAttendance'));
  revisa('[limpio] ya no hay bandera de baja en cada fila', (await p.$$('#rosterList .roster-flag')).length === 0);
  revisa('[limpio] ya no hay cuatro botones por niño', (await p.$$('#rosterList [data-s]')).length === 0);
  revisa('[caras] salen las fotos', (await p.$$('#rosterList .roster-avatar img')).length === 4);

  // Un toque: falta. Otro: presente otra vez.
  const toques = await p.$$('#rosterList .as-toque');
  await toques[1].click(); await p.waitForTimeout(80);
  revisa('[toque] tocar a un Tanner lo marca como falta', (await estados(p))[1] === 'Falta', JSON.stringify(await estados(p)));
  revisa('[marcador] sube a 1 falta', (await marcador(p)) === '3/1/0/0', await marcador(p));
  await toques[1].click(); await p.waitForTimeout(80);
  revisa('[toque] otro toque lo regresa a presente', (await estados(p))[1] === 'Presente');
  await toques[1].click(); await p.waitForTimeout(80);

  // "···": tarde.
  await p.click('#rosterList .roster-row:nth-child(3) .as-mas');
  await p.waitForSelector('#statusSheet:not(.hidden)');
  revisa('[opciones] la hoja marca el estado actual', await p.$eval('#statusSheet [data-s="present"]', b => b.classList.contains('active')));
  await p.click('#statusSheet [data-s="late"]');
  await p.waitForTimeout(80);
  revisa('[opciones] "Llegó tarde" queda marcado', (await estados(p))[2] === 'Tarde' && await p.isHidden('#statusSheet'), JSON.stringify(await estados(p)));
  revisa('[marcador] tarde cuenta como presente y aparte', (await marcador(p)) === '3/1/1/0', await marcador(p));

  // Toque largo: abre la hoja, no alterna.
  const caja = await (await p.$('#rosterList .roster-row:nth-child(4) .as-toque')).boundingBox();
  await p.mouse.move(caja.x + caja.width / 2, caja.y + 30);
  await p.mouse.down(); await p.waitForTimeout(650); await p.mouse.up();
  await p.waitForTimeout(120);
  revisa('[toque largo] abre las opciones', await p.isVisible('#statusSheet'));
  revisa('[toque largo] y no cambia al Tanner', (await estados(p))[3] === 'Presente', JSON.stringify(await estados(p)));
  await p.click('#statusSheet [data-s="excused"]');
  await p.waitForTimeout(80);

  // Reportar baja vive en la hoja.
  await p.click('#rosterList .roster-row:nth-child(1) .as-mas');
  await p.click('#statusBaja');
  revisa('[baja] "Reportar baja" abre el reporte para Presidencia', await p.isVisible('#bajaModal') && /Damián/.test(await p.textContent('#bajaTitle')));
  await p.click('#bajaCancel');

  // Salir sin guardar pregunta.
  let pregunto = '';
  p.once('dialog', d => { pregunto = d.message(); d.dismiss(); });
  await p.click('#closeRoster'); await p.waitForTimeout(120);
  revisa('[salir] sin guardar, pregunta antes de cerrar', /sin guardar/.test(pregunto) && await p.isVisible('#rosterDrawer'), pregunto);

  // Guardar manda exactamente lo que se ve.
  await p.click('#saveAttendance');
  await p.waitForFunction(() => document.getElementById('saveAttendance').textContent === 'Listo', null, { timeout: 4000 });
  const [g] = await llamadas(p, 'v2_save_attendance');
  const mandado = (g?.prm?.records || []).map(r => `${r.player_id}:${r.status}${r.punctuality ? ':' + r.punctuality : ''}`).join(',');
  revisa('[guardar] manda presente, falta, tarde y justificada tal cual', mandado === 'p0:present,p1:absent,p2:late:late,p3:excused', mandado);
  revisa('[guardar] confirma con números', /4 asistencias guardadas: 2 presentes de 4/.test(await p.textContent('#rosterMessage')), await p.textContent('#rosterMessage'));
  revisa('[guardar] la lista guardada no pierde las caras', (await p.$$('#rosterList .roster-avatar img')).length === 4);
  await p.click('#saveAttendance'); await p.waitForTimeout(150);
  revisa('[listo] "Listo" cierra sin preguntar', await p.isHidden('#rosterDrawer'));
  await p.screenshot({ path: path.join(RAIZ, 'docs/evidencias/asistencia-inicio.png'), fullPage: true });
  await p.close();
}

// --- Categoría sin lista de hoy: un toque la crea y la abre ---
{
  const p = await abre();
  await abreLista(p, 'c1');
  const [c] = await llamadas(p, 'v2_create_attendance_session');
  revisa('[crear] un toque crea la lista de esa categoría', c?.prm?.category_id === 'c1', JSON.stringify(c?.prm || null));
  revisa('[crear] y la abre con todos presentes', (await estados(p)).every(x => x === 'Presente'));
  await p.screenshot({ path: path.join(RAIZ, 'docs/evidencias/asistencia-lista.png') });
  await p.close();
}

// --- Lista ya guardada: no se vuelve a marcar sola ---
{
  const p = await abre({ guardada: true });
  await abreLista(p, 'c2');
  const est = await estados(p);
  revisa('[guardada] respeta lo guardado y deja sin marcar a los nuevos', JSON.stringify(est) === '["Presente","Falta","Sin marcar","Sin marcar"]', JSON.stringify(est));
  revisa('[guardada] el marcador muestra los sin marcar', (await marcador(p)) === '1/1/0/2' && await p.isVisible('.as-gol.is-sin'), await marcador(p));
  revisa('[guardada] pide marcar a los que faltan', /Faltan 2 por marcar/.test(await p.textContent('#progressLabel')));
  await p.close();
}

// --- Profe sin categoría asignada: ve todas por igual ---
{
  const p = await abre({ mias: false });
  const todas = await p.$$eval('#categoryCards .as-equipo', e => e.map(x => x.dataset.category));
  revisa('[sin asignar] ve todas las categorías juntas', JSON.stringify(todas) === '["c1","c2","c3"]', JSON.stringify(todas));
  revisa('[sin asignar] sin bloque de cubrir y con título "Categorías"', await p.isHidden('#coverBlock') && (await p.textContent('#catsTitulo')).trim() === 'Categorías');
  await p.close();
}

// --- Sólo lectura ---
{
  const p = await abre({ escribe: false });
  await abreLista(p, 'c2');
  revisa('[lectura] no se marca a nadie solo', (await estados(p)).every(x => x === 'Sin marcar'), JSON.stringify(await estados(p)));
  revisa('[lectura] sin "···", sin "Todos presentes" y sin Guardar', (await p.$$('#rosterList .as-mas')).length === 0 && await p.isHidden('#allPresent') && await p.isHidden('#saveAttendance'));
  revisa('[lectura] las estampas no se pueden tocar', await p.$eval('#rosterList .as-toque', b => b.disabled));
  await p.close();
}

await nav.close(); srv.close();
let mal = 0;
for (const r of revisiones) if (!r.ok) { mal++; console.error(` - ${r.nombre}${r.detalle ? ' :: ' + r.detalle : ''}`); }
if (errores.length) { console.error('ERRORES DEL NAVEGADOR:'); errores.forEach(e => console.error('   ' + e)); }
if (mal || errores.length) { console.error(`Lista de asistencia humo FAILED · ${mal} de ${revisiones.length}, ${errores.length} errores`); process.exit(1); }
console.log(`Lista de asistencia humo OK · ${revisiones.length} revisiones: todos presentes, toque, opciones, guardar, mis categorías y sólo lectura`);
