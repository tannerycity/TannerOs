// Carga la pantalla de Asistencia en Chromium con las RPC simuladas y
// comprueba que la pestaña de Estadísticas pinta sin un solo error.
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const TIPOS = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.json':'application/json', '.png':'image/png' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'content-type': TIPOS[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
await new Promise(r => server.listen(4599, r));

const errores = [];
const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const pagina = await navegador.newPage({ viewport: { width: 390, height: 844 } }); // iPhone
pagina.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
pagina.on('console', m => { if (m.type() === 'error') errores.push(`console: ${m.text()}`); });

// El cliente de Supabase se sustituye por uno falso ANTES de que corra el módulo.
await pagina.addInitScript(() => {
  const CATS = [
    { category_id: 'c1', code: 'T8', name: 'T8', active_players: 12, mine: true },
    { category_id: 'c2', code: 'T10', name: 'T10', active_players: 9, mine: true }
  ];
  const STATS = {
    from: '2026-09-01', to: '2026-09-30',
    totals: { players: 21, sessions: 8, scheduled: 168, attended: 92, absences: 28, excused: 3, late: 2, unmarked: 48, marked: 120, pct: 76.7, lowPlayers: 4 },
    categories: [{
      categoryId: 'c1', code: 'T8', name: 'T8', activePlayers: 12, sessions: 5,
      scheduled: 60, attended: 40, absences: 12, excused: 1, late: 1, unmarked: 8, marked: 52,
      pct: 76.9, weeklyPct: 74.2, monthlyPct: 76.9,
      lowest: [{ playerId: 'p1', name: 'Tanner Uno', pct: 55.0, attended: 11, absences: 9, scheduled: 20, unmarked: 0, goal: 80, scholarship: false }]
    }],
    lowPlayers: [
      { playerId: 'p1', name: 'Tanner Uno', categoryId: 'c1', categoryName: 'T8', pct: 55.0, attended: 11, absences: 9, excused: 1, scheduled: 20, unmarked: 0, goal: 80, scholarship: false },
      { playerId: 'p2', name: 'Becado Dos', categoryId: 'c2', categoryName: 'T10', pct: 85.0, attended: 17, absences: 3, excused: 0, scheduled: 20, unmarked: 0, goal: 90, scholarship: true }
    ]
  };
  const JUGADOR = {
    from: '2026-09-01', to: '2026-09-30', previousFrom: '2026-08-02', previousTo: '2026-08-31',
    player: { playerId: 'p1', name: 'Tanner Uno', code: 'TC-001', categoryName: 'T8', scholarship: false, goal: 80 },
    current: { scheduled: 20, attended: 11, absences: 9, excused: 1, late: 0, unmarked: 0, marked: 20, pct: 55.0 },
    previous: { scheduled: 18, attended: 14, absences: 4, excused: 0, late: 0, unmarked: 0, marked: 18, pct: 77.8 },
    history: [
      { sessionId: 's1', date: '2026-09-04', startsAt: '2026-09-04T18:00:00Z', title: 'Entrenamiento', categoryName: 'T8', status: 'present' },
      { sessionId: 's2', date: '2026-09-06', startsAt: '2026-09-06T18:00:00Z', title: 'Entrenamiento', categoryName: 'T8', status: 'absent' },
      { sessionId: 's3', date: '2026-09-08', startsAt: '2026-09-08T18:00:00Z', title: 'Entrenamiento', categoryName: 'T8', status: 'excused' }
    ]
  };
  const RESPUESTAS = {
    v2_my_context: [{ organization_id: 'o1', organization_name: 'Tannery City FC', role: 'Presidencia', is_owner: true }],
    v2_my_modules: [{ module_code: 'attendance', enabled: true, can_read: true, can_write: true }],
    v2_attendance_categories: CATS,
    v2_attendance_sessions: [],
    v2_attendance_stats: STATS,
    v2_attendance_player: JUGADOR
  };
  window.__llamadas = [];
  const fakeSupabase = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
    rpc: async (name, params) => { window.__llamadas.push({ name, params }); return { data: RESPUESTAS[name] ?? null, error: null }; }
  };
  // Intercepta el módulo del cliente antes de que app.js lo importe.
  const realImport = window.__realImport;
  Object.defineProperty(window, '__fakeSupabase', { value: fakeSupabase });
});

// Sirve un supabase-client.js falso en lugar del real.
await pagina.route('**/v2/supabase-client.js', route => route.fulfill({
  status: 200, contentType: 'text/javascript',
  body: 'export function createClient(){ return window.__fakeSupabase; }'
}));
await pagina.route('**/v2/photo-cache.js', route => route.fulfill({
  status: 200, contentType: 'text/javascript',
  body: ['export async function getSignedPhotoUrls(){ return {}; }',
         'export async function getSignedPhotoUrl(){ return null; }',
         'export async function getRawSignedPhotoUrl(){ return null; }',
         'export function clearPhotoCache(){}',
         'export function forgetPhoto(){}'].join('\n')
}));

await pagina.goto('http://127.0.0.1:4599/v2/asistencia/', { waitUntil: 'networkidle' });
await pagina.waitForSelector('#attendanceView:not(.hidden)', { timeout: 8000 });

const revisiones = [];
function revisa(nombre, ok, detalle = '') { revisiones.push({ nombre, ok, detalle }); }

revisa('la pestaña Tomar lista sigue siendo la primera', await pagina.isVisible('#captureTab') && await pagina.isHidden('#statsTab'));

await pagina.click('#tabStats');
await pagina.waitForSelector('#statsKpis article', { timeout: 6000 });

const kpis = await pagina.$$eval('#statsKpis article', els => els.map(e => e.textContent.trim()));
revisa('salen los 5 indicadores', kpis.length === 5, `salieron ${kpis.length}`);
revisa('el porcentaje visible es 76.7%', kpis.some(t => t.includes('76.7%')), kpis.join(' | ').slice(0, 160));

const aviso = await pagina.textContent('#statsTrust');
revisa('avisa de las listas sin marcar', /48 listas sin marcar/.test(aviso), aviso.slice(0, 120));
revisa('explica que el % sale solo de lo marcado', /120/.test(aviso), aviso.slice(0, 120));

const chips = await pagina.$$eval('.lvl', els => els.map(e => e.textContent.trim()));
revisa('ningún semáforo va sin texto', chips.every(t => t.length > 2), chips.join(' | ').slice(0, 140));

// El becado al 85% tiene que salir marcado, el ordinario al 85% no saldría.
const bajos = await pagina.$$eval('#statsLow .low-row', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
revisa('el becado al 85% aparece como debajo de objetivo', bajos.some(t => /Becado Dos/.test(t) && /meta 90%/.test(t)), bajos.join(' || ').slice(0, 200));

// Buscador
await pagina.fill('#statsSearch', 'becado');
await pagina.waitForTimeout(120);
const trasBuscar = await pagina.$$eval('#statsLow .low-row', els => els.length);
revisa('el buscador filtra', trasBuscar === 1, `quedaron ${trasBuscar}`);
await pagina.fill('#statsSearch', '');
await pagina.waitForTimeout(120);

// Cajón individual
await pagina.click('#statsLow .low-row');
await pagina.waitForSelector('#playerDrawer:not(.hidden)', { timeout: 6000 });
const cuerpo = (await pagina.textContent('#playerBody')).replace(/\s+/g, ' ');
revisa('el individual muestra la tendencia contra el periodo anterior', /22\.8 puntos peor/.test(cuerpo), cuerpo.slice(0, 200));
revisa('la justificada se identifica aparte', /Justificadas/.test(cuerpo) && /1/.test(cuerpo));
revisa('los retardos en cero explican que nadie los registra', /aún no se registran retardos/.test(cuerpo), cuerpo.slice(0, 260));
revisa('el historial distingue justificada de falta', /Falta justificada/.test(cuerpo) && /Presente/.test(cuerpo));

// Móvil: nada se desborda a lo ancho
const desborde = await pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
revisa('no hay scroll horizontal en iPhone', !desborde);

// Evidencias visuales
const EV = path.join(RAIZ, 'docs/evidencias');
await pagina.click('#closePlayer');
await pagina.waitForTimeout(150);
await pagina.screenshot({ path: EV + '/asistencia-estadisticas.png', fullPage: true });
await pagina.click('#statsLow .low-row');
await pagina.waitForSelector('#playerDrawer:not(.hidden)');
await pagina.waitForTimeout(200);
await pagina.screenshot({ path: EV + '/asistencia-tanner.png', fullPage: false });

await navegador.close();
server.close();

let mal = 0;
for (const r of revisiones) { if (!r.ok) { mal++; console.error(` - ${r.nombre}${r.detalle ? ' :: ' + r.detalle : ''}`); } }
if (errores.length) { console.error('ERRORES DEL NAVEGADOR:'); errores.forEach(e => console.error('   ' + e)); }
if (mal || errores.length) { console.error(`Humo Asistencia FAILED · ${mal} de ${revisiones.length} revisiones, ${errores.length} errores`); process.exit(1); }
console.log(`Humo Asistencia OK · ${revisiones.length} revisiones en Chromium a 390px, 0 errores de consola`);
