// Carga la pantalla de Asistencia en Chromium con las RPC simuladas y
// comprueba que la pestaña de Estadísticas pinta sin un solo error.
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const TIPOS = { '.html':'text/html', '.js':'text/javascript','.mjs':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.json':'application/json', '.png':'image/png' };

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
const navegador = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
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
    // g3: el tablero de Presidencia.
    v2_attendance_dashboard: {
      from: '2026-09-01', to: '2026-09-30', pct: 76.7, previousPct: 70.2, sessions: 10, sessionsTaken: 8,
      weeks: [
        { week: '2026-08-31', pct: null, sessions: 0, taken: 0 },
        { week: '2026-09-07', pct: 81.0, sessions: 3, taken: 3 },
        { week: '2026-09-14', pct: null, sessions: 2, taken: 0 },
        { week: '2026-09-21', pct: 72.5, sessions: 3, taken: 3 }
      ],
      streaks: [
        { playerId: 'p1', name: 'Tanner Uno', code: 'TC-001', categoryName: 'T8', streak: 4, lastSeen: null, thumb: null,
          scholarship: false, guardianName: 'Laura Pérez', phone: '5512345678' },
        { playerId: 'p2', name: 'Becado Dos', code: 'TC-002', categoryName: 'T10', streak: 3, lastSeen: null, thumb: null,
          scholarship: true, guardianName: null, phone: null }
      ],
      scholarsTotal: 6,
      scholars: [{ playerId: 'p2', name: 'Becado Dos', categoryName: 'T10', pct: 60.0, attended: 3, marked: 5, goal: 90, streak: 3,
                   lastSeen: null, thumb: null, guardianName: 'Marta', phone: '5598765432' }],
      categories: [
        { categoryId: 'c1', name: 'T8', pct: 76.9, previousPct: 80.0, sessions: 5, taken: 4 },
        { categoryId: 'c2', name: 'T10', pct: 90.0, previousPct: 85.0, sessions: 5, taken: 5 }
      ],
      pending: [
        { sessionId: 'x1', startsAt: '2026-09-16T00:00:00Z', categoryName: 'T8', coach: 'Profe Uno' },
        { sessionId: 'x2', startsAt: '2026-09-17T00:00:00Z', categoryName: 'T8', coach: null }
      ],
      coaches: [{ userId: 'u9', name: 'Profe Uno', categories: 'T8', sessions: 5, taken: 3, pending: 2 }]
    },
    v2_attendance_player: JUGADOR
  };
  window.__llamadas = [];
  const fakeSupabase = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
    rpc: async (name, params) => { window.__llamadas.push({ name, params });
      if (name === 'v2_attendance_dashboard' && window.__sinTablero) return { data: null, error: { message: 'boom' } };
      return { data: RESPUESTAS[name] ?? null, error: null }; }
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
await pagina.waitForSelector('#statsKpis .as-foco', { timeout: 6000 });

const kpis = await pagina.$$eval('#statsKpis .as-foco', els => els.map(e => e.innerText.replace(/\s+/g, ' ').trim()));
revisa('salen los 4 focos', kpis.length === 4, `salieron ${kpis.length}`);
revisa('[focos] racha, becados, meta y listas sin pasar con su número', /^2 En racha/.test(kpis[0]) && /^1 Becados faltando de 6 becados/.test(kpis[1]) && /^4 Debajo de su meta/.test(kpis[2]) && /^2 Listas sin pasar/.test(kpis[3]), kpis.join(' | '));
revisa('el porcentaje visible es 76.7%', (await pagina.textContent('#heroPct')).trim() === '76.7%', await pagina.textContent('#heroPct'));
const delta = (await pagina.textContent('#heroDelta')).replace(/\s+/g, ' ');
revisa('[marcador] dice cuánto subió contra el periodo anterior', /\+6\.5 pts/.test(delta) && /70\.2%/.test(delta), delta);
revisa('[marcador] dice cuántas listas se pasaron', /8 de 10 listas pasadas/.test(await pagina.textContent('#heroListas')), await pagina.textContent('#heroListas'));

const aviso = await pagina.textContent('#statsTrust');
revisa('avisa de las marcas sin registrar', /48 marcas sin registrar/.test(aviso), aviso.slice(0, 120));
revisa('explica que el % sale solo de lo marcado', /120/.test(aviso), aviso.slice(0, 120));

// Gráfica por semana
const barras = await pagina.$$eval('#statsTrend .as-barra', els => els.map(e => e.getAttribute('class')));
revisa('[gráfica] una barra por semana', barras.length === 4, String(barras.length));
revisa('[gráfica] la semana con entrenamientos sin lista no se pinta como 0%', /as-barra-sinlista/.test(barras[2]) && /as-barra-vacia/.test(barras[0]), JSON.stringify(barras));
revisa('[gráfica] la semana debajo de la meta se distingue', /bajo/.test(barras[3]) && !/bajo/.test(barras[1]));
revisa('[gráfica] lee la última semana con datos', /Semana del 21 sep: 72\.5%/.test(await pagina.textContent('#statsTrendRead')), await pagina.textContent('#statsTrendRead'));
await pagina.click('#statsTrend .as-barra[data-i="2"]');
revisa('[gráfica] tocar una barra explica esa semana', /2 entrenamientos sin lista/.test(await pagina.textContent('#statsTrendRead')), await pagina.textContent('#statsTrendRead'));

// Racha, categorías y listas sin pasar
const racha = (await pagina.innerText('#statsStreaks')).replace(/\s+/g, ' ');
revisa('[racha] sale el Tanner con 4 faltas seguidas', /Tanner Uno/.test(racha) && /4\s*faltas/i.test(racha) && /No ha venido en los últimos 60 días/.test(racha), racha);
// Becados y escribir a la familia
const filasRacha = await pagina.$$eval('#statsStreaks .as-racha', els => els.map(e => ({ becado: !!e.querySelector('.as-sello'), wa: e.querySelector('.as-familia')?.href || null })));
revisa('[racha] el becado trae su sello y el que no, no', filasRacha[0]?.becado === false && filasRacha[1]?.becado === true, JSON.stringify(filasRacha));
revisa('[familia] sin teléfono no hay botón', filasRacha[1]?.wa === null);
const msjRacha = decodeURIComponent((filasRacha[0]?.wa || '').split('?text=')[1] || '');
revisa('[familia] el botón abre WhatsApp al tutor con lada', /^https:\/\/wa\.me\/525512345678\?text=/.test(filasRacha[0]?.wa || ''), filasRacha[0]?.wa);
revisa('[familia] el mensaje va firmado por el club, no por una persona', /^Hola Laura, te escribimos de Tannery City FC\./.test(msjRacha) && /Saludos,\nTannery City FC$/.test(msjRacha) && !/te saluda/.test(msjRacha), msjRacha);
revisa('[familia] dice cuántas faltas lleva', /Tanner no ha venido a sus últimos 4 entrenamientos de T8/.test(msjRacha), msjRacha);
const beca = (await pagina.innerText('#scholarsCard')).replace(/\s+/g, ' ');
revisa('[becados] dice cuántos de cuántos', /1 de 6 becados/.test(beca), beca.slice(0, 160));
revisa('[becados] el becado faltando sale con su % contra 90', /Becado Dos/.test(beca) && /60%/.test(beca) && /de 90%/i.test(beca), beca);
const waBeca = await pagina.getAttribute('#statsScholars .as-familia', 'href');
const msjBeca = decodeURIComponent((waBeca || '').split('?text=')[1] || '');
revisa('[becados] al becado se le recuerda la meta de su beca', /conservar su beca se pide 90% de asistencia/.test(msjBeca), msjBeca);

const cats = await pagina.$$eval('#statsCats .as-cat strong', els => els.map(e => e.textContent));
revisa('[categorías] ordenadas de mejor a peor', JSON.stringify(cats) === '["T10","T8"]', JSON.stringify(cats));
revisa('[categorías] con su cambio y sus listas', /-3\.1 pts/.test(await pagina.textContent('#statsCats')) && /4 de 5 listas pasadas/.test(await pagina.textContent('#statsCats')));
const pend = (await pagina.textContent('#pendingCard')).replace(/\s+/g, ' ');
revisa('[pendientes] dice de qué profe es cada lista sin pasar', /Profe Uno/.test(pend) && /Sin profe asignado/.test(pend) && /3\/5/.test(pend), pend.slice(0, 200));

const chips = await pagina.$$eval('#statsTab .lvl', els => els.map(e => e.textContent.trim()));
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

// Si el tablero falla, las estadísticas salen igual con lo de siempre.
await pagina.click('#closePlayer');
await pagina.waitForTimeout(150);
await pagina.evaluate(() => { window.__sinTablero = true; });
await pagina.click('#periodPills button[data-periodo="semana"]');
await pagina.waitForTimeout(300);
revisa('[falla] sin tablero, el porcentaje sale igual', (await pagina.textContent('#heroPct')).trim() === '76.7%', await pagina.textContent('#heroPct'));
revisa('[falla] y la lista de debajo de su meta también', (await pagina.$$('#statsLow .low-row')).length === 2);
revisa('[falla] sin mensaje de error para Presidencia', await pagina.isHidden('#statsMessage'));
await pagina.evaluate(() => { window.__sinTablero = false; });
await pagina.click('#periodPills button[data-periodo="mes"]');
await pagina.waitForTimeout(300);

// Móvil: nada se desborda a lo ancho
const desborde = await pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
revisa('no hay scroll horizontal en iPhone', !desborde);

// Evidencias visuales
const EV = path.join(RAIZ, 'docs/evidencias');
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
