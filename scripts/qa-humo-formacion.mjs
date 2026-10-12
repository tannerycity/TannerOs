// Formación (/formacion/) en Chromium con Supabase falso.
//
// Metodología Tannery v1.1, Fase 1 (12/10/2026). Revisa:
//   · Formador: "3 sesiones · 1 lista · 2 pendientes", TERMINAR PLANEACIÓN
//     abre la primera pendiente, el Reto que publicó Dirección, 3 tareas
//     recomendadas del Reto, no deja "lista" sin tarea y guarda con ready;
//     no ve la pestaña de Dirección;
//   · Dirección: Semana Tanner por categoría; Baby elige entre los 4 mundos
//     (nunca los 9 Retos); publica las categorías elegidas;
//   · Banco: filtra por Reto y despliega Más fácil;
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

const lee = f => JSON.parse(fs.readFileSync(path.join(RAIZ, 'supabase/semillas/formacion', f), 'utf8'));
const cat = lee('catalogo-v1.1.json').conceptos;
const CATALOGO = {
  concepts: cat.map(c => ({ kind: c.kind, code: c.code, name: c.name, question: c.question || null, phrase: c.phrase || null, attrs: c.attrs || {} })),
  tasks: [
    ...lee('banco-tanner-v1.0.json').tareas.map(t => ({ id: 't' + t.codigo, bank: 'tanner', code: t.codigo, name: t.nombre, primary: t.reto, level: t.nivel, related: [], stages: ['t6', 't8', 't10', 't12'],
      buscamos: t.buscamos, montaje: t.montaje, juega: t.juega, dile: t.dile, observa: t.observa, easier: t.mas_facil, harder: t.mas_dificil, space: t.espacio, videoGuide: t.video, status: 'oficial' })),
    ...lee('banco-baby-v1.0.json').tareas.map(t => ({ id: 'b' + t.codigo, bank: 'baby', code: t.codigo, name: t.nombre, primary: t.mundo, level: null, related: [], stages: ['baby_3_4', 'baby_5_6'],
      buscamos: t.buscamos, montaje: t.montaje, juega: t.juega, dile: t.dile, observa: t.observa, easier: t.mas_facil, harder: t.mas_dificil, adapta: t.adapta, videoGuide: t.video, status: 'oficial' }))
  ]
};
const SEMANA = '2026-12-07';
const ses = (id, cat, catId, stage, ini, fin, plan = null, week = { primary: '1v1', secondary: null, behavior: 'Que se atrevan a encarar' }) =>
  ({ sessionId: id, categoryId: catId, category: cat, stage, startsAt: ini, endsAt: fin, status: 'scheduled', origin: 'horario', plan, week });
const MIA = { weekStart: SEMANA, deadline: '2026-12-07T04:00:00Z', settings: { tz: 'America/Mexico_City' }, sessions: [
  ses('s1', 'T6', 'c6', 't6', '2026-12-07T23:00:00Z', '2026-12-08T00:00:00Z', { status: 'ready', challenge: '1v1', items: [{ block: 'tarea', taskId: 't05' }] }),
  ses('s2', 'T6', 'c6', 't6', '2026-12-09T23:00:00Z', '2026-12-10T00:00:00Z'),
  ses('s3', 'T10', 'c10', 't10', '2026-12-08T23:00:00Z', '2026-12-09T00:30:00Z', null, null)
] };
const DIR = { weekStart: SEMANA, publishBy: '2026-12-05T04:00:00Z', deadline: '2026-12-07T04:00:00Z', categories: [
  { categoryId: 'cb', category: 'Baby Tanner', stage: 'baby_3_4', usesChallenges: false, coachId: 'u2', week: null, sessions: 2, ready: 0 },
  { categoryId: 'c6', category: 'T6', stage: 't6', usesChallenges: true, coachId: 'u2', week: null, sessions: 2, ready: 1 },
  { categoryId: 'c10', category: 'T10', stage: 't10', usesChallenges: true, coachId: null, week: { primary: 'gol', status: 'published' }, sessions: 3, ready: 0 },
  { categoryId: 'c12', category: 'T12', stage: 't12', usesChallenges: true, coachId: 'u3', week: null, sessions: 3, ready: 3 }
] };

const revisiones = [], errores = [];
const revisa = (n, ok, d = '') => revisiones.push({ nombre: n, ok, detalle: d });
const nav = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

async function abre({ direccion }) {
  const p = await nav.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(`console: ${m.text()}`); });
  await p.addInitScript(({ direccion, CATALOGO, MIA, DIR }) => {
    window.__llamadas = [];
    const mia = JSON.parse(JSON.stringify(MIA));
    const mods = ['inicio', 'formacion', ...(direccion ? ['formacion_direccion'] : [])];
    const R = {
      v2_my_context: () => [{ user_id: 'u2', display_name: 'Max', organization_id: 'o1', organization_name: 'Tannery City FC', organization_slug: 'tannery-city-fc', role: direccion ? 'Operaciones' : 'Formadores', is_owner: false }],
      v2_my_navigation: () => mods.map(c => ({ module_code: c, enabled: true, can_read: true, can_write: true })),
      v2_formation_catalog: () => CATALOGO,
      v2_my_planning: () => mia,
      v2_direction_week: () => DIR,
      v2_save_training_weeks: () => 2,
      v2_save_session_plan: prm => { const s = mia.sessions.find(x => x.sessionId === prm.session_id); s.plan = { status: prm.plan.ready ? 'ready' : 'draft', challenge: prm.plan.challenge, items: prm.plan.items }; return { status: s.plan.status }; }
    };
    window.__fakeSupabase = {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'u2' } } } }), getUser: async () => ({ data: { user: { id: 'u2' } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
      rpc: async (n, prm) => { window.__llamadas.push({ n, prm: JSON.parse(JSON.stringify(prm || {})) }); return { data: R[n] ? R[n](prm) : null, error: null }; },
      from: () => ({ select() { return this; }, eq() { return this; }, then(r) { return Promise.resolve({ data: [], error: null }).then(r); } }),
      channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {}
    };
  }, { direccion, CATALOGO, MIA, DIR });
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.route('**/v2/supabase-client.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'export function createClient(){ return window.__fakeSupabase; }' }));
  await p.route('**/v2/photo-cache.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'export async function getSignedPhotoUrls(){return {};}export async function getSignedPhotoUrl(){return null;}export function clearPhotoCache(){}' }));
  await p.goto(BASE + '/v2/formacion/', { waitUntil: 'domcontentloaded' });
  return p;
}
const llamadas = (p, n) => p.evaluate(n => window.__llamadas.filter(x => x.n === n), n);
const cabe = async (p, donde) => revisa(`[${donde}] nada se sale a 390px`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), String(await p.evaluate(() => document.documentElement.scrollWidth)));

{ // Formador
  const p = await abre({ direccion: false });
  await p.waitForSelector('.fm-hero h1', { timeout: 6000 });
  const tabs = await p.$$eval('#fmTabs button', b => b.map(x => x.textContent));
  revisa('[formador] no ve la Semana Tanner de Dirección', JSON.stringify(tabs) === '["Próxima semana","Banco"]', JSON.stringify(tabs));
  revisa('[formador] "3 sesiones · 1 lista · 2 pendientes"', (await p.textContent('.fm-hero h1')) === '3 sesiones · 1 lista · 2 pendientes', await p.textContent('.fm-hero h1'));
  revisa('[formador] dice la semana', /7–13 dic/.test(await p.textContent('.fm-hero > span')), await p.textContent('.fm-hero > span'));
  await cabe(p, 'formador');
  if (process.env.QA_FOTO) await p.screenshot({ path: process.env.QA_FOTO + '-formador.png' });
  await p.click('#fmTerminar');
  await p.waitForSelector('#fmHoja:not(.hidden) .fm-reto-card');
  revisa('[sesión] Terminar abre la primera pendiente', /T6/.test(await p.textContent('#fmHojaTitulo')) && /mié/i.test(await p.textContent('#fmHojaTitulo')), await p.textContent('#fmHojaTitulo'));
  revisa('[sesión] trae el Reto que publicó Dirección y la conducta', /1V1/.test(await p.textContent('.fm-reto-card')) && /Que se atrevan a encarar/.test(await p.textContent('.fm-reto-card')));
  const recos = await p.$$eval('.fm-bloque[data-i="1"] [data-elige]', b => b.map(x => x.dataset.task));
  revisa('[sesión] 3 recomendadas, todas del Reto 1V1', recos.length === 3 && recos.every(t => ['t05', 't06', 't07', 't08'].includes(t)), JSON.stringify(recos));
  if (process.env.QA_FOTO) await p.screenshot({ path: process.env.QA_FOTO + '-sesion.png' });
  revisa('[sesión] la ya usada esta semana no va primero', recos[0] !== 't05', JSON.stringify(recos));
  revisa('[sesión] el juego ya viene ("se juega todos los días")', /Juego libre/.test(await p.textContent('.fm-bloque[data-i="2"]')));
  revisa('[sesión] calentar viene puesto y no compite con la tarea', /Calentamiento con balón/.test(await p.textContent('.fm-bloque[data-i="0"]')) && (await p.$$('.fm-bloque[data-i="0"] [data-elige]')).length === 0);
  await p.click('#fmConfirmar');
  revisa('[sesión] sin tarea no se confirma, y dice qué falta', /falta al menos una tarea/.test(await p.textContent('#fmFalta')) && (await llamadas(p, 'v2_save_session_plan')).length === 0, await p.textContent('#fmFalta'));
  await p.click(`.fm-bloque[data-i="1"] [data-elige="1"][data-task="${recos[0]}"]`);
  await p.click('.fm-bloque[data-i="1"] [data-dif="1"][data-v="facil"]');
  await p.click('#fmConfirmar');
  await p.waitForSelector('#fmHoja', { state: 'hidden' });
  const g = (await llamadas(p, 'v2_save_session_plan'))[0]?.prm;
  revisa('[sesión] se guarda lista, con su tarea y dificultad', g?.session_id === 's2' && g.plan.ready === true && g.plan.challenge === '1v1'
    && g.plan.items.some(i => i.block === 'tarea' && i.taskId === recos[0] && i.difficulty === 'facil'), JSON.stringify(g));
  await p.waitForFunction(() => /2 listas/.test(document.querySelector('.fm-hero h1')?.textContent || ''));
  revisa('[formador] el resumen se actualiza', (await p.textContent('.fm-hero h1')) === '3 sesiones · 2 listas · 1 pendiente');
  // T10 sin Semana publicada: escribe su objetivo.
  await p.click('[data-ses="s3"]');
  await p.waitForSelector('#fmObjetivo');
  revisa('[sesión] sin Reto publicado pide objetivo', /aún no publica/.test(await p.textContent('.fm-reto-card')));
  revisa('[sesión] 90 min: dos tareas y juego', (await p.$$('.fm-bloque')).length === 4);
  await cabe(p, 'hoja de sesión');
  await p.close();
}

{ // Dirección
  const p = await abre({ direccion: true });
  await p.waitForSelector('.fm-cat', { timeout: 6000 });
  revisa('[dirección] abre en la Semana', (await p.textContent('#fmTabs .activa')) === 'Semana');
  revisa('[dirección] dice qué falta', /Falta Baby Tanner, T6, T12/.test(await p.textContent('.fm-hero h1')), await p.textContent('.fm-hero h1'));
  const pills = await p.$$eval('.fm-cat', c => c.map(x => [...x.querySelectorAll('.fm-pill')].map(y => y.textContent).join('|')));
  revisa('[dirección] planeación por categoría: Lista / Pendiente / Sin Formador', pills[1].endsWith('Pendiente 1') && pills[2] === 'Publicada|Sin Formador' && pills[3].endsWith('Lista'), JSON.stringify(pills));
  await p.click('[data-cat="cb"]');
  await p.waitForSelector('.fm-grid-retos');
  const babyOps = await p.$$eval('[data-reto]', b => b.map(x => x.dataset.reto));
  revisa('[dirección] Baby elige entre los 4 mundos, nunca los 9 Retos', JSON.stringify(babyOps) === '["movimiento","balon","juego","convivencia"]', JSON.stringify(babyOps));
  revisa('[dirección] Baby no tiene secundario', (await p.$('#fmSec')) === null);
  await p.click('[data-reto="movimiento"]'); await p.fill('#fmConducta', 'Que frenen sin caerse'); await p.click('#fmGuardaReto');
  await p.click('[data-cat="c6"]');
  await p.waitForSelector('.fm-grid-retos');
  revisa('[dirección] T6 elige entre los 9 Retos', (await p.$$('[data-reto]')).length === 9);
  await p.click('[data-reto="1v1"]'); await p.selectOption('#fmSec', '1v1'); await p.click('#fmGuardaReto');
  revisa('[dirección] el secundario no puede ser el mismo Reto', /no puede ser el mismo/.test(await p.textContent('#fmAviso')));
  await p.selectOption('#fmSec', 'avanzar'); await p.click('#fmGuardaReto');
  await cabe(p, 'dirección');
  if (process.env.QA_FOTO) await p.screenshot({ path: process.env.QA_FOTO + '-direccion.png' });
  await p.click('#fmPublicar');
  await p.waitForFunction(() => window.__llamadas.some(x => x.n === 'v2_save_training_weeks'));
  const pub = (await llamadas(p, 'v2_save_training_weeks'))[0].prm;
  const por = Object.fromEntries(pub.weeks.map(w => [w.categoryId, w]));
  revisa('[dirección] publica lo elegido (y lo ya publicado)', pub.publish === true && por.cb?.primary === 'movimiento' && por.cb?.behavior === 'Que frenen sin caerse'
    && por.c6?.primary === '1v1' && por.c6?.secondary === 'avanzar' && por.c10?.primary === 'gol' && !por.c12 && pub.weeks.every(w => w.weekStart === '2026-12-07'), JSON.stringify(pub));
  // Banco
  await p.click('[data-tab="banco"]');
  await p.waitForSelector('.fm-tarea');
  revisa('[banco] 60 tareas: 36 Tanner y 24 Baby', (await p.$$('.fm-tarea')).length === 60);
  await p.click('[data-filtro="tanner:1v1"]');
  const nombres = await p.$$eval('.fm-tarea h3', h => h.map(x => x.textContent));
  revisa('[banco] filtrar por Reto', JSON.stringify(nombres) === '["Engaña y Sal","Cruza la Línea","Dos Salidas","Duelos que dan Gol"]', JSON.stringify(nombres));
  await p.click('.fm-tarea:first-child [data-ver="facil"]');
  revisa('[banco] Más fácil se despliega', await p.isVisible('.fm-tarea:first-child [data-extra="facil"]') && /baja velocidad/.test(await p.textContent('.fm-tarea:first-child [data-extra="facil"]')));
  await cabe(p, 'banco');
  await p.close();
}

revisa('sin errores de consola', errores.length === 0, errores.join('\n   '));
await nav.close(); srv.close();
const fallas = revisiones.filter(r => !r.ok);
for (const f of fallas) console.error(` - ${f.nombre}${f.detalle ? `\n   ${f.detalle}` : ''}`);
console.log(fallas.length ? `Formación humo FAILED · ${fallas.length} de ${revisiones.length}`
  : `Formación humo OK · ${revisiones.length} revisiones: próxima semana del Formador, Semana Tanner de Dirección, Baby con sus mundos y el Banco`);
process.exit(fallas.length ? 1 : 0);
