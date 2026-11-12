// Formación (/formacion/) en Chromium con Supabase falso.
//
// Metodología Tannery v1.1, Fase 1 (12/10/2026). Revisa:
//   · Formador: "3 sesiones · 1 lista · 2 pendientes", TERMINAR PLANEACIÓN
//     abre la primera pendiente, el Reto que publicó Dirección, 3 tareas
//     recomendadas del Reto, no deja "lista" sin tarea y guarda con ready;
//     no ve la pestaña de Dirección;
//   · Dirección: Semana Tanner por categoría; Baby elige entre los 4 mundos
//     (nunca los 9 Retos); publica las categorías elegidas;
//   · Álbum: cartas por mundo y nivel, modos, video próximamente y agregar a la sesión;
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
// Recursos del Futbolista (h76): de la semilla real.
const REC = lee('recursos-v0.1.json');
CATALOGO.concepts.push(
  ...REC.familias.map((f, i) => ({ kind: 'familia_recurso', code: f.code, name: f.name, question: null, phrase: f.precaucion, attrs: { retos: f.retos } })),
  ...REC.familias.flatMap(f => f.recursos.filter(([c]) => !CATALOGO.concepts.some(x => x.kind === 'recurso' && x.code === c)).map(([c, n]) => ({ kind: 'recurso', code: c, name: n, question: null, phrase: null, attrs: { familia: f.code } }))));
for (const t of CATALOGO.tasks) t.resources = t.id === 't10' ? [{ code: 'conduccion', relevance: 'principal', status: 'sugerida' }]
  : t.id === 't12' ? [{ code: 'conduccion', relevance: 'principal', status: 'aprobada' }] : [];
const SEMANA = '2026-12-07';
const ses = (id, cat, catId, stage, ini, fin, plan = null, week = { primary: '1v1', secondary: null, behavior: 'Que se atrevan a encarar' }) =>
  ({ sessionId: id, categoryId: catId, category: cat, stage, startsAt: ini, endsAt: fin, status: 'scheduled', origin: 'horario', plan, week });
const MIA = { weekStart: SEMANA, deadline: '2026-12-07T04:00:00Z', settings: { tz: 'America/Mexico_City' }, sessions: [
  ses('s1', 'T6', 'c6', 't6', '2026-12-07T23:00:00Z', '2026-12-08T00:00:00Z', { status: 'ready', challenge: '1v1', items: [{ block: 'tarea', taskId: 't05' }] }),
  ses('s2', 'T6', 'c6', 't6', '2026-12-09T23:00:00Z', '2026-12-10T00:00:00Z'),
  ses('s3', 'T10', 'c10', 't10', '2026-12-08T23:00:00Z', '2026-12-09T00:30:00Z', null, null)
] };
const HOY = { today: '2026-12-07', sessions: [ { sessionId: 'h1', categoryId: 'c6', category: 'T6', stage: 't6', startsAt: '2026-12-07T23:00:00Z', endsAt: '2026-12-08T00:00:00Z', status: 'scheduled', closure: null,
  week: { primary: '1v1', behavior: 'Que se atrevan a encarar' },
  plan: { status: 'ready', challenge: '1v1', items: [{ block: 'calentar', text: 'Calentamiento con balón' }, { block: 'tarea', taskId: 't06', difficulty: 'base' }, { block: 'jugar', text: 'Juego libre' }] } } ] };
const DIR = { weekStart: SEMANA, publishBy: '2026-12-05T04:00:00Z', deadline: '2026-12-07T04:00:00Z', categories: [
  { categoryId: 'cb', category: 'Baby Tanner', stage: 'baby_3_4', usesChallenges: false, coachId: 'u2', week: null, sessions: 2, ready: 0 },
  { categoryId: 'c6', category: 'T6', stage: 't6', usesChallenges: true, coachId: 'u2', week: null, sessions: 2, ready: 1 },
  { categoryId: 'c10', category: 'T10', stage: 't10', usesChallenges: true, coachId: null, week: { primary: 'gol', status: 'published', behavior: 'hola', lastBy: 'Mich', updatedAt: '2026-12-01T18:00:00Z' }, sessions: 3, ready: 0 },
  { categoryId: 'c12', category: 'T12', stage: 't12', usesChallenges: true, coachId: 'u3', week: null, sessions: 3, ready: 3 }
] };

const revisiones = [], errores = [];
const revisa = (n, ok, d = '') => revisiones.push({ nombre: n, ok, detalle: d });
const nav = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

async function abre({ direccion, vacio = false, pasada = false, presidencia = false, url = '' }) {
  const p = await nav.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(`console: ${m.text()}`); });
  await p.addInitScript(({ direccion, vacio, pasada, presidencia, CATALOGO, MIA, DIR, HOY }) => {
    window.__llamadas = [];
    const mia = JSON.parse(JSON.stringify(MIA)), hoy = JSON.parse(JSON.stringify(HOY));
    if (vacio) { mia.sessions = []; mia.settings = { ...mia.settings, inicio: '2026-12-14' }; hoy.sessions = []; }
    if (pasada) mia.sessions.unshift({ sessionId: 'p1', categoryId: 'c6', category: 'T6', stage: 't6', startsAt: '2026-11-03T00:00:00Z', endsAt: '2026-11-03T01:00:00Z',
      status: 'completed', origin: 'horario', plan: { status: 'ready', challenge: '1v1', items: [{ block: 'tarea', taskId: 't05' }] }, week: { primary: '1v1', behavior: 'Que se atrevan a encarar' } });
    const cat = JSON.parse(JSON.stringify(CATALOGO));
    // Lo que el servidor manda (h76): el Formador sólo recibe etiquetas aprobadas.
    if (!direccion) for (const t of cat.tasks) t.resources = (t.resources || []).filter(r => r.status === 'aprobada');
    const obs = [];
    const mods = ['inicio', 'formacion', ...(direccion ? ['formacion_direccion'] : [])];
    const R = {
      v2_my_context: () => [{ user_id: 'u2', display_name: 'Max', organization_id: 'o1', organization_name: 'Tannery City FC', organization_slug: 'tannery-city-fc', role: presidencia ? 'Presidencia' : direccion ? 'Operaciones' : 'Formadores', is_owner: false }],
      v2_my_navigation: () => mods.map(c => ({ module_code: c, enabled: true, can_read: true, can_write: true })),
      v2_formation_catalog: () => cat,
      // Cultura y Convivencia (h81).
      v2_convivencia: () => ({ canFollow: direccion || presidencia, isPresidency: presidencia,
        myCode: { code: 'codigo_formador', version: 1, title: 'Código del Formador Tanner', body: 'Puede alzar la voz para ser escuchado; no para intimidar.', acceptedAt: window.__codigoOk || null },
        categories: [{ id: 'c6', name: 'T6', stage: 't6', lastExplained: null, families: direccion || presidencia ? { total: 15, accepted: 4 } : null },
          { id: 'cb', name: 'Baby Tanner', stage: 'baby_3_4', lastExplained: '2026-11-01', families: direccion || presidencia ? { total: 20, accepted: 20 } : null }],
        staff: direccion || presidencia ? [{ userId: 'u2', name: 'Max', role: 'Formadores', acceptedAt: null }, { userId: 'u3', name: 'Brandon', role: 'Operaciones', acceptedAt: '2026-11-09T18:00:00Z' }] : null,
        incidents: direccion || presidencia ? [{ id: 'i1', occurredOn: '2026-11-08', level: 'grave', status: 'abierto', escalatedTo: 'presidencia', category: 'T6', involvesStaff: false, players: [],
          whatHappened: 'Empujó a un compañero al piso.', protectiveAction: 'Los separé.', resolution: null, reportedBy: 'Max', mine: false, createdAt: '2026-11-08T23:00:00Z', entries: [] }] : [] }),
      v2_accept_staff_code: prm => { window.__codigoOk = '2026-11-09T20:00:00Z'; return { code: prm.code, version: 1 }; },
      v2_record_code_explanation: () => ({ id: 'e1', already: false }),
      v2_report_incident: prm => ({ id: 'i2', escalatedTo: ['grave', 'urgente'].includes(prm.incident.level) ? 'presidencia' : 'direccion' }),
      v2_incident_entry: prm => ({ id: prm.incident_id, kind: prm.kind }),
      v2_bonus_month: prm => ({ month: prm.month || '2026-11-01', people: [
        { userId: 'u2', name: 'Max', weeks: 4, met: 3, pendingReview: 0, pct: 75, review: null },
        { userId: 'u3', name: 'Lalo', weeks: 4, met: 4, pendingReview: 0, pct: 100, review: { decision: 'aprobado', note: null, at: '2026-11-02T18:00:00Z', by: 'Mich' } }] }),
      v2_decide_bonus: prm => ({ userId: prm.user_id, month: prm.month, decision: prm.decision, compliance: 75 }),
      v2_patch_roster: prm => ({ categories: [{ id: 'c12', name: 'T12', stage: 't12' }, { id: 'cb', name: 'Baby Tanner', stage: 'baby_3_4' }],
        players: prm.category_id === 'c12' ? [{ id: 'j1', name: 'Ana Ruiz', patches: [] }, { id: 'j2', name: 'Beto Sol', patches: [] },
          { id: 'j3', name: 'Ceci Paz', patches: [{ code: 'campeones', reason: 'Copa León 2026' }] }] : [] }),
      v2_award_patch: prm => ({ id: 'aw-' + prm.player_id, already: false }),
      v2_mark_patch_delivered: prm => ({ id: prm.award_id, delivered: true }),
      v2_set_task_resource: prm => { const t = cat.tasks.find(x => x.id === prm.task_id); t.resources = t.resources.filter(r => r.code !== prm.resource_code);
        if (prm.status !== 'descartada') t.resources.push({ code: prm.resource_code, relevance: prm.relevance, status: prm.status }); return { status: prm.status }; },
      v2_session_review: prm => ({ sessionId: prm.session_id, observations: obs.filter(o => o.session === prm.session_id) }),
      v2_add_session_observation: prm => { obs.push({ session: prm.session_id, id: 'o' + obs.length, checklist: prm.checklist, note: prm.note, at: '2026-11-03T02:00:00Z', by: 'Brandon' }); return { id: 'o' }; },
      v2_my_planning: () => mia,
      v2_direction_week: () => DIR,
      v2_save_training_weeks: () => 2,
      v2_remove_training_week: prm => ({ id: 'w10', removed: true }),
      v2_training_week_history: () => [
        { at: '2026-12-01T18:00:00Z', action: 'editada', by: 'Mich', before: { primary: 'gol', behavior: 'hola' }, after: { primary: 'gol', behavior: 'Que tiren a portería' } },
        { at: '2026-11-30T18:00:00Z', action: 'publicada', by: 'Brandon', before: null, after: { primary: 'gol', behavior: 'hola' } }],
      v2_my_today: () => hoy,
      v2_close_session: prm => { const s = hoy.sessions.find(x => x.sessionId === prm.session_id); s.closure = prm.closure; s.closureNote = prm.note; s.status = 'completed'; return { closure: prm.closure }; },
      v2_save_session_plan: prm => { const s = mia.sessions.find(x => x.sessionId === prm.session_id); s.plan = { status: prm.plan.ready ? 'ready' : 'draft', challenge: prm.plan.challenge, items: prm.plan.items }; return { status: s.plan.status }; }
    };
    window.__fakeSupabase = {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'u2' } } } }), getUser: async () => ({ data: { user: { id: 'u2' } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
      rpc: async (n, prm) => { window.__llamadas.push({ n, prm: JSON.parse(JSON.stringify(prm || {})) }); return { data: R[n] ? R[n](prm) : null, error: null }; },
      from: () => ({ select() { return this; }, eq() { return this; }, then(r) { return Promise.resolve({ data: [], error: null }).then(r); } }),
      channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {}
    };
  }, { direccion, vacio, pasada, presidencia, CATALOGO, MIA, DIR, HOY });
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.route('**/v2/supabase-client.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'export function createClient(){ return window.__fakeSupabase; }' }));
  await p.route('**/v2/photo-cache.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'export async function getSignedPhotoUrls(){return {};}export async function getSignedPhotoUrl(){return null;}export function clearPhotoCache(){}' }));
  await p.goto(BASE + '/v2/formacion/' + url, { waitUntil: 'domcontentloaded' });
  return p;
}
const llamadas = (p, n) => p.evaluate(n => window.__llamadas.filter(x => x.n === n), n);
const cabe = async (p, donde) => revisa(`[${donde}] nada se sale a 390px`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), String(await p.evaluate(() => document.documentElement.scrollWidth)));

{ // Formador
  const p = await abre({ direccion: false });
  await p.waitForSelector('.fm-hero h1', { timeout: 6000 });
  const tabs = await p.$$eval('#fmTabs button', b => b.map(x => x.textContent));
  revisa('[formador] no ve la Semana Tanner de Dirección', JSON.stringify(tabs) === '["Próxima semana","Banco","Convivencia"]', JSON.stringify(tabs));
  revisa('[formador] "3 sesiones · 1 lista · 2 pendientes"', (await p.textContent('.fm-hero h1')) === '3 sesiones · 1 lista · 2 pendientes', await p.textContent('.fm-hero h1'));
  revisa('[formador] dice la semana', /7–13 dic/.test(await p.textContent('.fm-hero > span')), await p.textContent('.fm-hero > span'));
  // Los pasos del Formador (13/10/2026): mismo camino que Dirección.
  const pasosF = await p.$$eval('.fm-pasos li', l => l.map(x => [x.className, x.querySelector('b').textContent, x.querySelector('small').textContent]));
  revisa('[formador] sus 5 pasos: Reto, jugadas, confirmar, cancha y cierre', pasosF.length === 5 && pasosF[1][1] === 'Elige tus jugadas' && pasosF[1][2] === '1 de 3 sesiones'
    && pasosF[0][2] === '2 de 3' && pasosF[2][2] === '1 de 3 listas' && pasosF[3][0] === 'info', JSON.stringify(pasosF));
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
  await p.click('#fmHoja [data-cerrar]');
  // HOY · Modo Cancha · Cierre
  const hoyTxt = await p.textContent('[data-hoy="h1"]');
  revisa('[hoy] en 10 segundos: categoría, Reto, qué buscamos y la frase', /HOY · T6/.test(hoyTxt) && /RETO: 1V1/.test(hoyTxt) && /Hoy buscamos: Que se atrevan a encarar/.test(hoyTxt) && /“Gánale a tu rival.”/.test(hoyTxt), hoyTxt);
  await p.click('[data-hoy="h1"]');
  await p.waitForSelector('#fmHoja.fm-cancha .fm-cancha-paso');
  revisa('[cancha] empieza en el calentamiento, con la lista a la mano', /Calentamiento con balón/.test(await p.textContent('.fm-cancha-paso h3')) && (await p.getAttribute('#fmHojaPie a', 'href')) === '/asistencia/');
  await p.click('#fmSiguiente');
  revisa('[cancha] la tarea: nombre, DILE y 2–3 observables', (await p.textContent('.fm-cancha-paso h3')) === 'Cruza la Línea' && /Gánale a tu rival/.test(await p.textContent('.fm-dile'))
    && (await p.$$('.fm-observa li')).length >= 2 && (await p.$$('.fm-observa li')).length <= 3, await p.textContent('.fm-cancha-paso'));
  revisa('[cancha] hay reloj', /^\d+:\d\d$/.test(await p.textContent('#fmReloj')));
  await cabe(p, 'modo cancha');
  if (process.env.QA_FOTO) await p.screenshot({ path: process.env.QA_FOTO + '-cancha.png' });
  await p.click('#fmSiguiente'); await p.click('#fmSiguiente');
  await p.waitForSelector('.fm-cierre');
  revisa('[cierre] pregunta por lo que buscábamos', /¿Apareció lo que buscábamos\?/.test(await p.textContent('.fm-cierre')) && /Que se atrevan a encarar/.test(await p.textContent('.fm-cierre b')));
  revisa('[cierre] tres respuestas: Sí, A veces, Todavía no', JSON.stringify(await p.$$eval('[data-cierre]', b => b.map(x => x.textContent))) === '["Sí","A veces","Todavía no"]');
  if (process.env.QA_FOTO) await p.screenshot({ path: process.env.QA_FOTO + '-cierre.png' });
  await p.fill('#fmNota', 'Les costó mirar antes');
  await p.click('[data-cierre="a_veces"]');
  await p.waitForSelector('#fmHoja', { state: 'hidden' });
  const cierre = (await llamadas(p, 'v2_close_session'))[0]?.prm;
  revisa('[cierre] un toque y se guarda, con su nota', cierre?.session_id === 'h1' && cierre.closure === 'a_veces' && cierre.note === 'Les costó mirar antes', JSON.stringify(cierre));
  await p.waitForFunction(() => /Cerrada · A veces/.test(document.querySelector('[data-hoy="h1"]')?.textContent || ''));
  revisa('[hoy] queda "Cerrada · A veces"', true);
  await p.close();
}

{ // PROP-FC-002 (09/11/2026): Tarjetas o Calendario, y el porqué de cada tarea.
  const p = await abre({ direccion: false });
  await p.waitForSelector('.fm-hero h1', { timeout: 6000 });
  revisa('[fc-002] abre en Tarjetas', (await p.getAttribute('[data-vista="tarjetas"]', 'aria-selected')) === 'true' && (await p.$$('.fm-lista .fm-ses')).length === 3);
  await p.click('[data-vista="calendario"]');
  await p.waitForSelector('.fm-cal');
  const dias = await p.$$eval('.fm-cal-dia', d => d.map(x => [x.querySelector('.fm-cal-fecha').textContent.trim(), [...x.querySelectorAll('[data-ses]')].map(b => b.dataset.ses).join()]));
  revisa('[fc-002] calendario: 7 días, cada sesión en su día local', dias.length === 7 && dias[0][1] === 's1' && dias[1][1] === 's3' && dias[2][1] === 's2' && dias.slice(3).every(d => !d[1]), JSON.stringify(dias));
  revisa('[fc-002] calendario y tarjetas: las mismas 3 sesiones', (await p.$$('.fm-cal [data-ses]')).length === 3);
  revisa('[fc-002] el estado se ve igual en las dos vistas', /Lista/.test(await p.textContent('.fm-cal [data-ses="s1"]')) && /Pendiente/.test(await p.textContent('.fm-cal [data-ses="s2"]')));
  await cabe(p, 'calendario');
  if (process.env.QA_FOTO) await p.screenshot({ path: process.env.QA_FOTO + '-calendario.png' });
  revisa('[fc-002] recuerda la vista al volver', await p.evaluate(() => localStorage.getItem('tos:fm:vista')) === 'calendario');
  await p.click('.fm-cal [data-ses="s2"]');
  await p.waitForSelector('#fmHoja:not(.hidden) .fm-bloque[data-i="1"] .fm-porque');
  const porque = await p.$$eval('.fm-bloque[data-i="1"] [data-elige] .fm-porque', x => x.map(e => e.textContent));
  revisa('[fc-002] desde el calendario abre la misma sesión, con 3 tareas y su porqué', porque.length === 3 && porque.every(t => /Reto de la semana: 1V1/.test(t)), JSON.stringify(porque));
  revisa('[fc-002] el porqué dice si ya se usó esta semana', porque.some(t => /Ya la usaste 1 vez esta semana/.test(t)) || porque.every(t => /No la has usado/.test(t)), JSON.stringify(porque));
  if (process.env.QA_FOTO) await p.screenshot({ path: process.env.QA_FOTO + '-porque.png' });
  const mostradas = await p.$$eval('.fm-bloque[data-i="1"] [data-elige]', b => b.map(x => x.dataset.task));
  await p.click('.fm-bloque[data-i="1"] [data-mas="1"]');
  const grupos = await p.$$eval('.fm-bloque[data-i="1"] .fm-recos-grupo', g => g.map(x => x.textContent));
  const resto = await p.$$eval('.fm-bloque[data-i="1"] [data-elige]', b => b.map(x => x.dataset.task));
  revisa('[fc-002] Ver más: primero el Reto de la semana, luego los demás', grupos[0] === 'Del Reto 1V1' && grupos.at(-1) === 'Otros', JSON.stringify(grupos));
  revisa('[fc-002] Ver más no repite las 3 ya mostradas y deja sustituir', resto.length === 33 && !resto.some(t => mostradas.includes(t)) && resto[0] === ['t05', 't06', 't07', 't08'].find(t => !mostradas.includes(t)), JSON.stringify(resto.slice(0, 3)));
  await p.click(`.fm-bloque[data-i="1"] [data-elige][data-task="${resto.at(-1)}"]`);
  revisa('[fc-002] el profe puede elegir una de otro Reto', /Partido sin Pausa|Protege la Casa|Gana Terreno/.test(await p.textContent('.fm-bloque[data-i="1"] .fm-elegida')), await p.textContent('.fm-bloque[data-i="1"] .fm-elegida'));
  await cabe(p, 'ver más');
  await p.close();
}

{ // Recursos del Futbolista y Observación de Dirección (PROP-FC-002, h76/h77, 09/11/2026)
  const p = await abre({ direccion: true, pasada: true });
  await p.waitForSelector('#fmTabs', { timeout: 6000 });
  await p.click('[data-tab="banco"]');
  await p.click('[data-carta="t10"]');
  await p.waitForSelector('#fmRecursos');
  revisa('[recursos] Dirección ve la sugerida con Aprobar y Descartar', /Conducción/.test(await p.textContent('#fmRecursos')) && /sugerido/.test(await p.textContent('#fmRecursos'))
    && !!(await p.$('#fmRecursos [data-rec-accion="aprobada"]')) && !!(await p.$('#fmRecursos [data-rec-accion="descartada"]')), await p.textContent('#fmRecursos'));
  await p.click('#fmRecursos [data-rec-accion="aprobada"]');
  await p.waitForFunction(() => !/sugerido/.test(document.querySelector('#fmRecursos')?.textContent || ''));
  const ap = (await llamadas(p, 'v2_set_task_resource'))[0]?.prm;
  revisa('[recursos] Aprobar manda la etiqueta como aprobada', ap?.task_id === 't10' && ap.resource_code === 'conduccion' && ap.relevance === 'principal' && ap.status === 'aprobada', JSON.stringify(ap));
  await p.click('#fmRecursos [data-rec-agregar]');
  const grupos = await p.$$eval('#fmRecursos > .fm-recos-grupo', g => g.map(x => x.textContent));
  revisa('[recursos] al agregar, primero las familias que el mapa liga al Reto (Jugar juntos)', grupos.join('|') === 'Pase y recepción|Ubicación y apoyo|Reinicios', JSON.stringify(grupos));
  revisa('[recursos] no ofrece otra vez el que ya tiene', !(await p.$('#fmRecursos [data-rec-elige="conduccion"]')));
  await p.click('#fmRecursos [data-rec-elige="pared"]');
  await p.click('#fmRecursos [data-rec-accion="aprobada"][data-rel="complementaria"]');
  await p.waitForFunction(() => /Pared/.test(document.querySelector('#fmRecursos')?.textContent || ''));
  const ag = (await llamadas(p, 'v2_set_task_resource'))[1]?.prm;
  revisa('[recursos] agrega Pared como complementario', ag?.resource_code === 'pared' && ag.relevance === 'complementaria' && ag.status === 'aprobada', JSON.stringify(ag));
  await cabe(p, 'recursos');
  if (process.env.QA_FOTO) await p.screenshot({ path: process.env.QA_FOTO + '-recursos.png' });
  await p.click('#fmHoja [data-cerrar]');
  await p.click('[data-banco="baby"]');
  await p.click('[data-carta="bB01"]');
  revisa('[recursos] las tareas Baby no llevan recursos (sus 4 mundos)', !(await p.$('#fmRecursos')));
  await p.click('#fmHoja [data-cerrar]');
  // Observación: sólo en una sesión que ya pasó.
  await p.click('[data-tab="sesiones"]');
  await p.click('[data-vista="tarjetas"]').catch(() => {});
  await p.click('[data-ses="p1"]');
  await p.waitForSelector('#fmObservar');
  await p.click('#fmObservar');
  await p.waitForSelector('.fm-obs-fila');
  revisa('[observar] los 5 puntos con Sí / A veces / Todavía no', JSON.stringify(await p.$$eval('.fm-obs-fila > b', b => b.map(x => x.textContent))) === '["Aprendizaje","Participación","Seguridad","Adaptación","Convivencia"]'
    && (await p.$$('.fm-obs-ops button')).length === 15);
  await p.click('#fmObsGuardar');
  revisa('[observar] vacía no se guarda', /Marca al menos un punto/.test(await p.textContent('#fmObsFalta')) && !(await llamadas(p, 'v2_add_session_observation')).length);
  await p.click('[data-obs="aprendizaje"][data-v="a_veces"]');
  await p.click('[data-obs="seguridad"][data-v="si"]');
  await p.fill('#fmObsNota', 'Faltó acelerar después del engaño');
  if (process.env.QA_FOTO) await p.screenshot({ path: process.env.QA_FOTO + '-observar.png' });
  await p.click('#fmObsGuardar');
  await p.waitForSelector('#fmHoja', { state: 'hidden' });
  const ob = (await llamadas(p, 'v2_add_session_observation'))[0]?.prm;
  revisa('[observar] guarda los puntos marcados y la nota, sin calificar niños', ob?.session_id === 'p1' && JSON.stringify(ob.checklist) === '{"aprendizaje":"a_veces","seguridad":"si"}' && ob.note === 'Faltó acelerar después del engaño', JSON.stringify(ob));
  revisa('[observar] una sesión que no ha pasado no ofrece Observar', await (async () => { await p.click('[data-ses="s2"]'); await p.waitForSelector('#fmHoja:not(.hidden)'); const no = !(await p.$('#fmObservar')); await p.click('#fmHoja [data-cerrar]'); return no; })());
  await p.close();
}
{ // El Formador: sólo recursos aprobados, y lee la observación de Dirección en su sesión.
  const p = await abre({ direccion: false, pasada: true });
  await p.waitForSelector('.fm-hero h1', { timeout: 6000 });
  await p.click('[data-tab="banco"]');
  await p.click('[data-carta="t10"]');
  revisa('[formador] no ve recursos sugeridos ni botones de Dirección', !(await p.$('#fmRecursos')) || !/Conducción/.test(await p.textContent('#fmRecursos')));
  await p.click('#fmHoja [data-cerrar]');
  await p.click('[data-carta="t12"]');
  revisa('[formador] ve el aprobado, sin poder decidir', /Conducción/.test(await p.textContent('#fmRecursos')) && /Principal/.test(await p.textContent('#fmRecursos')) && !(await p.$('#fmRecursos [data-rec-accion]')) && !(await p.$('[data-rec-agregar]')));
  await p.click('#fmHoja [data-cerrar]');
  await p.evaluate(() => window.__fakeSupabase.rpc('v2_add_session_observation', { session_id: 'p1', checklist: { convivencia: 'todavia_no' }, note: 'Hubo burlas al portero' }));
  await p.click('[data-tab="sesiones"]');
  await p.click('[data-ses="p1"]');
  await p.waitForSelector('.fm-obs-leida', { timeout: 4000 }).catch(() => {});
  revisa('[formador] lee la observación de Dirección en su sesión', /Convivencia: Todavía no/.test(await p.textContent('#fmHojaCuerpo')) && /Hubo burlas al portero/.test(await p.textContent('#fmHojaCuerpo')) && /Brandon/.test(await p.textContent('#fmHojaCuerpo')), (await p.textContent('#fmHojaCuerpo')).slice(0, 200));
  revisa('[formador] no puede observar (eso es de Dirección)', !(await p.$('#fmObservar')));
  await p.close();
}

{ // Parches (h78/h80, 09/11/2026): "Campeones, para toda la categoría y desmarcamos quién no".
  const p = await abre({ direccion: true });
  await p.waitForSelector('[data-parches]', { timeout: 6000 });
  await p.click('[data-parches]');
  await p.waitForSelector('#parHoja #parCat');
  revisa('[parches] dos parches: Campeón (con su arte) e Iniciación', (await p.$$('#parHoja [data-par-code]')).length === 2 && /campeon-azul-sin-numero\.png/.test(await p.getAttribute('#parHoja [data-par-code="campeones"] img', 'src') || ''));
  await p.selectOption('#parCat', 'c12');
  await p.waitForSelector('#parHoja [data-par-j="j1"]');
  revisa('[parches] toda la categoría sale marcada', await p.isChecked('[data-par-j="j1"]') && await p.isChecked('[data-par-j="j2"]'));
  await p.fill('#parMotivo', 'Copa León 2026');
  await p.click('[data-par-j="j2"]');
  await p.click('#parGuardar');
  await p.waitForSelector('#parHoja .par-hecho', { timeout: 5000 });
  const aw = await llamadas(p, 'v2_award_patch');
  revisa('[parches] registra sólo a los marcados y no repite a quien ya lo tiene', aw.length === 1 && aw[0].prm.player_id === 'j1' && aw[0].prm.code === 'campeones' && aw[0].prm.award.reason === 'Copa León 2026' && aw[0].prm.award.categoryId === 'c12', JSON.stringify(aw.map(x => x.prm)));
  revisa('[parches] dice cuántos y deja la lista Por entregar', /1 parche registrado/.test(await p.textContent('#parHoja .par-hecho')) && !!(await p.$('[data-par-entrega="aw-j1"]')));
  revisa('[parches] dice qué número lleva el parche de cada quien (su primer título: 1)', /Parche con el 1/.test(await p.textContent('#parHoja .par-jug')) && (await p.textContent('#parHoja .par-jug .par-num')) === '1');
  await p.click('[data-par-entrega="aw-j1"]');
  await p.waitForTimeout(200);
  revisa('[parches] palomear lo marca entregado', (await llamadas(p, 'v2_mark_patch_delivered')).some(x => x.prm.award_id === 'aw-j1'));
  await cabe(p, 'parches');
  if (process.env.QA_FOTO) await p.screenshot({ path: process.env.QA_FOTO + '-parches.png' });
  await p.click('#parHoja .par-primario');
  revisa('[parches] Listo cierra la hoja', !(await p.$('#parHoja')));
  // Iniciación: Baby o Tanner; la categoría Baby arranca en Baby.
  await p.click('[data-parches]');
  await p.waitForSelector('#parHoja #parCat');
  await p.click('#parHoja [data-par-code="iniciacion"]');
  await p.selectOption('#parCat', 'c12');
  await p.waitForSelector('#parHoja [data-par-var]');
  revisa('[parches] Iniciación pide versión Baby o Tanner (T12 arranca en Tanner) y no pide motivo', (await p.getAttribute('[data-par-var="tanner"]', 'aria-checked')) === 'true' && !(await p.$('#parMotivo')));
  await p.close();
}
{ // El Formador no ve el botón de parches.
  const p = await abre({ direccion: false });
  await p.waitForSelector('.fm-hero h1', { timeout: 6000 });
  revisa('[parches] el Formador no registra parches', !(await p.$('[data-parches]')));
  await p.close();
}

{ // Convivencia (h81, 09/11/2026): Formador acepta su código, explica en 60 seg y reporta.
  const p = await abre({ direccion: false });
  await p.waitForSelector('.fm-hero h1', { timeout: 6000 });
  await p.click('#fmTabs [data-tab="convivencia"]');
  await p.waitForSelector('.cv-hero');
  revisa('[convivencia] el lema y "Reportar algo"', /Respetamos\. Competimos\. Nos cuidamos\./.test(await p.textContent('.cv-hero h1')) && !!(await p.$('[data-cv-reportar]')));
  revisa('[convivencia] el Formador no ve casos ajenos ni el staff', !(await p.$('[data-cv-staff]')) && /Mis reportes/.test(await p.textContent('#fmVista')) && !/Familias:/.test(await p.textContent('#fmVista')));
  await p.click('[data-cv-codigo]');
  await p.waitForSelector('#cvAcepto');
  await p.click('#cvAcepto');
  await p.waitForSelector('.cv-ok-linea', { timeout: 4000 });
  revisa('[convivencia] acepta su código y queda la constancia', (await llamadas(p, 'v2_accept_staff_code')).some(x => x.prm.code === 'codigo_formador') && /Aceptaste el Código/.test(await p.textContent('.cv-ok-linea')));
  revisa('[convivencia] dice qué categoría aún no se explica', /Aún no se explica/.test(await p.textContent('.cv-cats')));
  await p.click('[data-cv-explicar="c6"]');
  await p.waitForSelector('.cv-60');
  revisa('[convivencia] el texto oficial de 60 segundos', /Compitamos fuerte, pero cuidándonos/.test(await p.textContent('.cv-60')));
  await p.click('#cvExplicado');
  await p.waitForTimeout(200);
  revisa('[convivencia] "Ya se los expliqué" registra la categoría', (await llamadas(p, 'v2_record_code_explanation')).some(x => x.prm.category_id === 'c6'));
  await p.click('[data-cv-reportar]');
  await p.waitForSelector('#cvEnviar');
  revisa('[reporte] no deja enviar sin nivel', await p.isDisabled('#cvEnviar'));
  await p.click('[data-cv-nivel="urgente"]');
  revisa('[reporte] urgente muestra qué hacer primero y va a Presidencia', await p.isVisible('#cvUrgente') && /Presidencia/.test(await p.textContent('#cvEnviar')));
  await p.click('[data-cv-nivel="menor"]');
  revisa('[reporte] menor va a Dirección Deportiva', !(await p.isVisible('#cvUrgente')) && /Dirección Deportiva/.test(await p.textContent('#cvEnviar')));
  await p.selectOption('#cvCat', 'c6');
  await p.fill('#cvQue', 'Se burló de un compañero que falló el pase.');
  await p.fill('#cvAccion', 'Detuve el juego y hablé con él.');
  await cabe(p, 'reporte');
  if (process.env.QA_FOTO) await p.screenshot({ path: process.env.QA_FOTO + '-reporte.png' });
  await p.click('#cvEnviar');
  await p.waitForTimeout(300);
  const rep = await llamadas(p, 'v2_report_incident');
  revisa('[reporte] manda hechos, acción, nivel y categoría', rep.length === 1 && rep[0].prm.incident.level === 'menor' && rep[0].prm.incident.categoryId === 'c6' && /burló/.test(rep[0].prm.incident.whatHappened) && !(await p.$('#cvHoja')), JSON.stringify(rep.map(x => x.prm)));
  await cabe(p, 'convivencia');
  await p.close();
}
{ // Dirección: casos, familias y staff; un caso grave lo resuelve Presidencia.
  const p = await abre({ direccion: true, url: '?tab=convivencia' });
  await p.waitForSelector('.cv-hero', { timeout: 6000 });
  revisa('[convivencia] ?tab=convivencia abre directo (el aviso push)', (await p.getAttribute('#fmTabs [data-tab="convivencia"]', 'aria-selected')) === 'true');
  revisa('[convivencia] Dirección ve familias firmadas y el staff', /Familias: 4\/15 firmaron/.test(await p.textContent('.cv-cats')) && /1\/2 aceptaron/.test(await p.textContent('[data-cv-staff]')));
  await p.click('[data-cv-caso="i1"]');
  await p.waitForSelector('#cvHoja .cv-dl');
  const tipos = await p.$$eval('#cvHoja [data-cv-tipo]', b => b.map(x => x.dataset.cvTipo));
  revisa('[caso] Dirección da seguimiento pero no resuelve un grave', JSON.stringify(tipos) === '["seguimiento","aviso_familia"]' && /lo resuelve Presidencia/.test(await p.textContent('#cvHoja')), JSON.stringify(tipos));
  await p.click('[data-cv-tipo="aviso_familia"]');
  await p.fill('#cvNota', 'Llamé a la mamá el domingo.');
  await p.click('#cvGuardaNota');
  await p.waitForTimeout(200);
  revisa('[caso] guarda el aviso a la familia', (await llamadas(p, 'v2_incident_entry')).some(x => x.prm.kind === 'aviso_familia' && x.prm.incident_id === 'i1'));
  revisa('[bono] Dirección no ve el Bono', !(await p.$('#fmTabs [data-tab="bono"]')));
  await p.close();
}
{ // Presidencia: resuelve el grave y decide el Bono Tanner OS del mes.
  const p = await abre({ direccion: true, presidencia: true, url: '?tab=bono' });
  await p.waitForSelector('.cv-bonos', { timeout: 6000 });
  revisa('[bono] por Formador: % y semanas a tiempo', /75%/.test(await p.textContent('[data-cv-persona="u2"]')) && /3\/4 semanas a tiempo/.test(await p.textContent('[data-cv-persona="u2"]')));
  revisa('[bono] lo ya decidido dice quién y cuándo', /Aprobado · Mich/.test(await p.textContent('[data-cv-persona="u3"]')));
  await p.click('[data-cv-persona="u2"] [data-cv-dec="no_aprobado"]');
  await p.waitForSelector('#cvDecide');
  await p.fill('#cvNotaBono', 'Una semana tarde sin aviso');
  await p.click('#cvDecide');
  await p.waitForTimeout(300);
  const dec = await llamadas(p, 'v2_decide_bonus');
  revisa('[bono] Presidencia decide a mano con nota', dec.length === 1 && dec[0].prm.decision === 'no_aprobado' && dec[0].prm.user_id === 'u2' && dec[0].prm.month === '2026-11-01' && /tarde/.test(dec[0].prm.note), JSON.stringify(dec.map(x => x.prm)));
  await cabe(p, 'bono');
  if (process.env.QA_FOTO) await p.screenshot({ path: process.env.QA_FOTO + '-bono.png' });
  await p.click('#fmTabs [data-tab="convivencia"]');
  await p.waitForSelector('[data-cv-caso="i1"]');
  await p.click('[data-cv-caso="i1"]');
  await p.waitForSelector('#cvHoja .cv-dl');
  revisa('[caso] Presidencia sí puede resolver el grave', !!(await p.$('#cvHoja [data-cv-tipo="resolucion"]')));
  await p.close();
}

{ // Dirección: la Semana Tanner en 5 pasos (13/10/2026)
  const p = await abre({ direccion: true });
  await p.waitForSelector('.fm-cat2', { timeout: 6000 });
  revisa('[dirección] abre en la Semana', (await p.textContent('#fmTabs .activa')) === 'Semana');
  const pasos = await p.$$eval('.fm-pasos li', l => l.map(x => [x.className, x.querySelector('b').textContent, x.querySelector('small').textContent]));
  revisa('[pasos] los 5 pasos, con el 1 hecho y el 2 en curso', pasos.length === 5 && pasos[0][0] === 'hecho' && pasos[1][0] === 'actual' && pasos[1][2] === '1 de 4'
    && pasos.map(x => x[1]).join('|') === 'Elige la semana|Ponle Reto a cada categoría|Di qué quieres ver en la cancha|Revisa tu semana|Publica', JSON.stringify(pasos));
  revisa('[pasos] el título dice el paso que sigue', /Paso 2: Ponle Reto a cada categoría/.test(await p.textContent('.fm-hero2 h1')), await p.textContent('.fm-hero2 h1'));
  const pies = await p.$$eval('.fm-cat2 footer small', s => s.map(x => x.textContent));
  revisa('[dirección] cada categoría dice cómo va su Formador', /1\/2 sesiones listas/.test(pies[1]) && /Sin Formador asignado/.test(pies[2]) && /3\/3/.test(pies[3]), JSON.stringify(pies));
  revisa('[trazabilidad] la tarjeta dice quién la tocó al último', /Último cambio: Mich/.test(pies[2]), pies[2]);
  revisa('[editar] la publicada trae Editar y Quitar a la mano', !!(await p.$('[data-catcard="c10"] [data-quitar="c10"]')) && /Editar/.test(await p.textContent('[data-catcard="c10"] footer')));
  // Baby: paso 1 Reto, paso 2 qué queremos ver.
  await p.click('[data-catcard="cb"] .fm-cat2-elegir');
  await p.waitForSelector('.fm-grid-retos');
  const babyOps = await p.$$eval('[data-reto]', b => b.map(x => x.dataset.reto));
  revisa('[dirección] Baby elige entre los 4 mundos, nunca los 9 Retos', JSON.stringify(babyOps) === '["movimiento","balon","juego","convivencia"]', JSON.stringify(babyOps));
  await p.click('[data-reto="movimiento"]');
  await p.waitForSelector('#fmConducta');
  revisa('[hoja] al elegir pasa sola al paso 2: qué quieres ver', /PASO 2 DE 2/.test(await p.textContent('#fmHojaCuerpo')) && /¿Qué quieres ver en la cancha\?/.test(await p.textContent('#fmHojaCuerpo')));
  revisa('[dirección] Baby no tiene secundario', (await p.$('#fmSec')) === null);
  await p.click('[data-ejemplo]');
  revisa('[hoja] un ejemplo llena la frase de un toque', (await p.inputValue('#fmConducta')) === 'Que frenen sin caerse');
  await p.click('#fmGuardaReto');
  // T6 con secundario.
  await p.click('[data-catcard="c6"] .fm-cat2-elegir');
  await p.waitForSelector('.fm-grid-retos');
  revisa('[dirección] T6 elige entre los 9 Retos', (await p.$$('[data-reto]')).length === 9);
  await p.click('[data-reto="1v1"]');
  await p.click('.fm-mas summary');
  const secs = await p.$$eval('#fmSec option', o => o.map(x => x.value));
  revisa('[dirección] el secundario no ofrece el mismo Reto', !secs.includes('1v1') && secs.length === 9, JSON.stringify(secs));
  await p.selectOption('#fmSec', 'avanzar'); await p.fill('#fmConducta', 'Que se atrevan a encarar'); await p.click('#fmGuardaReto');
  // Editar la publicada: ve el historial y la corrige.
  await p.click('[data-catcard="c10"] .fm-cat2-reto');
  await p.waitForSelector('#fmHistoria li');
  const hist = await p.textContent('#fmHistoria');
  revisa('[trazabilidad] el historial dice quién, qué hizo y el antes', /Mich/.test(hist) && /la cambió/.test(hist) && /Antes: Gol · “hola”/.test(hist) && /Brandon/.test(hist) && /la publicó/.test(hist), hist);
  await p.fill('#fmConducta', 'Que tiren a portería'); await p.click('#fmGuardaReto');
  revisa('[editar] la corregida dice "Cambios sin publicar"', /Cambios sin publicar/.test(await p.textContent('[data-catcard="c10"] header')));
  await cabe(p, 'dirección');
  if (process.env.QA_FOTO) await p.screenshot({ path: process.env.QA_FOTO + '-direccion.png', fullPage: true });
  // Paso 4: revisar. Paso 5: publicar.
  revisa('[pasos] el botón dice cuántas se publican', /Revisar y publicar \(3\)/.test(await p.textContent('#fmRevisar')), await p.textContent('#fmRevisar'));
  await p.click('#fmRevisar');
  await p.waitForSelector('.fm-revisa');
  const rev = await p.$$eval('.fm-revisa li', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  revisa('[revisar] la semana completa antes de publicar', rev.length === 4 && /T12\s*Sin Reto/.test(rev[3]) && /Se publica/.test(rev[0]), JSON.stringify(rev));
  await p.click('#fmPublicar');
  await p.waitForFunction(() => window.__llamadas.some(x => x.n === 'v2_save_training_weeks'));
  const pub = (await llamadas(p, 'v2_save_training_weeks'))[0].prm;
  const por = Object.fromEntries(pub.weeks.map(w => [w.categoryId, w]));
  revisa('[publicar] publica lo nuevo y lo corregido, sin re-publicar lo intacto', pub.publish === true && por.cb?.primary === 'movimiento' && por.cb?.behavior === 'Que frenen sin caerse'
    && por.c6?.primary === '1v1' && por.c6?.secondary === 'avanzar' && por.c10?.behavior === 'Que tiren a portería' && !por.c12 && pub.weeks.every(w => w.weekStart === '2026-12-07'), JSON.stringify(pub));
  // Plan del mes (h90, 12/11/2026): 4 semanas de una vez, con el Reto que sigue.
  {
    const antes = (await llamadas(p, 'v2_save_training_weeks')).length;
    await p.waitForSelector('#fmPlanMes');
    await p.click('#fmPlanMes');
    await p.waitForSelector('.fm-mes-cat select');
    if (process.env.QA_FOTO) await p.screenshot({ path: process.env.QA_FOTO + '-plan-mes.png' });
    const mes = await p.evaluate(() => ({ cats: document.querySelectorAll('.fm-mes-cat').length, sel: document.querySelectorAll('.fm-mes-cat select').length,
      libres: document.querySelectorAll('.fm-mes-cat select:not([disabled])').length, boton: document.getElementById('fmPublicarMes')?.textContent.trim(),
      ancho: document.documentElement.scrollWidth <= window.innerWidth + 1 }));
    revisa('[mes] cada categoría con sus 4 semanas', mes.cats === 4 && mes.sel === 16, JSON.stringify(mes));
    revisa('[mes] el botón dice cuántas semanas publica y cabe en 390px', new RegExp(`Publicar ${mes.libres} semanas`).test(mes.boton || '') && mes.libres > 0 && mes.ancho, JSON.stringify(mes));
    await p.click('#fmPublicarMes');
    await p.waitForFunction(n => window.__llamadas.filter(x => x.n === 'v2_save_training_weeks').length > n, antes);
    const pm = (await llamadas(p, 'v2_save_training_weeks')).at(-1).prm;
    revisa('[mes] publica todas las semanas abiertas, cada una con su lunes y su Reto', pm.publish === true && pm.weeks.length === mes.libres
      && new Set(pm.weeks.map(w => w.weekStart)).size === 4 && pm.weeks.every(w => w.primary && /^\d{4}-\d{2}-\d{2}$/.test(w.weekStart) && new Date(w.weekStart + 'T12:00:00Z').getUTCDay() === 1), JSON.stringify(pm).slice(0, 400));
    await p.waitForSelector('#fmHoja.hidden', { state: 'attached', timeout: 4000 }).catch(() => {});
  }
  // Quitar con confirmación.
  await p.waitForSelector('#fmHoja', { state: 'hidden' });
  await p.click('[data-catcard="c10"] [data-quitar]');
  await p.waitForSelector('.tosdlg-ok');
  revisa('[quitar] pregunta antes y avisa que queda en el historial', /historial/.test(await p.textContent('.tosdlg-ok').then(() => p.evaluate(() => document.body.textContent))));
  await p.click('.tosdlg-ok');
  await p.waitForFunction(() => window.__llamadas.some(x => x.n === 'v2_remove_training_week'));
  const q = (await llamadas(p, 'v2_remove_training_week'))[0].prm;
  revisa('[quitar] quita el Reto de esa categoría y esa semana', q.category_id === 'c10' && q.week_start === '2026-12-07', JSON.stringify(q));
  // Álbum de jugadas (13/10/2026): cartas por mundo y nivel.
  await p.click('[data-tab="banco"]');
  await p.waitForSelector('.fm-carta');
  if (process.env.QA_FOTO) await p.screenshot({ path: process.env.QA_FOTO + '-album.png' });
  revisa('[álbum] 36 cartas Tanner', (await p.$$('.fm-carta')).length === 36 && /36 jugadas · 9 mundos/.test(await p.textContent('.fm-album-hero h1')));
  await p.click('[data-banco="baby"]');
  revisa('[álbum] 24 cartas Baby con sus 4 mundos', (await p.$$('.fm-carta')).length === 24 && (await p.$$('[data-mundo]')).length === 5);
  await p.click('[data-banco="tanner"]');
  await p.click('[data-mundo="1v1"]');
  const nombres = await p.$$eval('.fm-carta b', h => h.map(x => x.textContent));
  revisa('[álbum] filtrar por mundo, de nivel 1 a 4', nombres.length === 4 && nombres.includes('Engaña y Sal') && nombres.includes('Duelos que dan Gol'), JSON.stringify(nombres));
  revisa('[álbum] cada mundo trae su ícono', await p.$$eval('.fm-mundos [data-mundo]:not([data-mundo=""])', bs => bs.length > 0 && bs.every(b => b.querySelector('.fm-mico svg'))));
  revisa('[álbum] cada carta lleva el ícono de su mundo', await p.$$eval('.fm-carta', c => c.every(x => x.querySelector('.fm-carta-banda .fm-mico svg path, .fm-carta-banda .fm-mico svg circle'))));
  revisa('[álbum] el mundo elegido se pinta arriba con su ícono', await p.isVisible('.fm-album-hero.con-mundo > .fm-mico'));
  if (process.env.QA_FOTO) await p.screenshot({ path: process.env.QA_FOTO + '-mundo.png' });
  const niveles = await p.$$eval('.fm-carta', c => c.map(x => x.querySelectorAll('.fm-nivel i.on').length));
  revisa('[álbum] cada carta dice su nivel con barras, ordenadas', JSON.stringify(niveles) === '[1,2,3,4]', JSON.stringify(niveles));
  await p.click('[data-nivel="2"]');
  revisa('[álbum] filtrar por nivel', (await p.$$('.fm-carta')).length === 1);
  await p.click('[data-nivel="0"]'); await p.click('[data-mundo=""]');
  await p.fill('#fmBusca', 'duelo');
  revisa('[álbum] buscar sin acentos ni mayúsculas, sin perder el teclado', (await p.$$('.fm-carta')).length >= 1 && await p.evaluate(() => document.activeElement?.id === 'fmBusca'));
  await p.fill('#fmBusca', '');
  await p.click('[data-mundo="balon"]');
  await p.click('.fm-carta >> nth=0');
  await p.waitForSelector('.fm-carta-grande');
  const carta = await p.textContent('.fm-carta-grande');
  revisa('[carta] misión, grito para los niños y cómo se juega', /Misión/.test(carta) && /Grito para los niños/.test(carta) && /Cómo se juega/.test(carta), carta.slice(0, 200));
  await p.click('[data-modo="facil"]');
  revisa('[carta] Modo fácil se despliega', await p.isVisible('[data-ver-modo="facil"]'));
  revisa('[carta] video y foto marcados "Próximamente"', (await p.$$eval('.fm-media small', s => s.map(x => x.textContent))).join('|') === 'Próximamente|Próximamente');
  await p.click('[data-media="video"]');
  if (process.env.QA_FOTO) await p.screenshot({ path: process.env.QA_FOTO + '-carta.png' });
  revisa('[carta] el video dice cómo se verá', /Así se verá/.test(await p.textContent('#fmMediaNota')));
  await p.click('#fmAgregar');
  await p.waitForSelector('[data-va]');
  await p.click('[data-va="s2"]');
  await p.waitForSelector('.fm-bloque');
  const elegida = await p.textContent('.fm-bloque[data-i="1"] .fm-elegida').catch(() => '');
  revisa('[carta] "Agregar a mi sesión" la pone en la tarea libre', /Balón Vivo/.test(elegida), elegida);
  await p.click('[data-cerrar]');
  await cabe(p, 'banco');
  await p.close();
}

{ // Práctica guiada (13/10/2026): un ejemplo para aprender a planear, sin guardar nada.
  const p = await abre({ direccion: false, vacio: true });
  await p.waitForSelector('.fm-practica-card', { timeout: 6000 });
  const card = await p.textContent('.fm-practica-card');
  revisa('[práctica] sin sesiones dice cuándo arranca y ofrece practicar', /Formación arranca el 14 de diciembre/.test(card) && /Practicar cómo se planea/.test(card), card.slice(0, 160));
  const acciones = await p.evaluate(() => (window.tosAccionesDePantalla || []).map(a => a.label));
  revisa('[botón +] Formación trae sus propias acciones', acciones.includes('Practicar cómo se planea') && acciones.includes('Álbum de jugadas'), JSON.stringify(acciones));
  await p.click('[data-practica]');
  await p.waitForSelector('.fm-pr-reto');
  revisa('[práctica] paso 1: el Reto de la semana', /PASO 1 DE 5/.test(await p.textContent('#fmHojaCuerpo')) && /1V1/i.test(await p.textContent('.fm-pr-reto')));
  revisa('[práctica] no dice "demo"', !/demo/i.test(await p.textContent('#fmHoja')));
  await p.click('[data-pr-sig]');
  revisa('[práctica] paso 2: las 3 partes y cuál eliges tú', (await p.$$('.fm-pr-partes > div')).length === 3 && /Esto eliges tú/.test(await p.textContent('.fm-pr-partes')));
  await p.click('[data-pr-sig]');
  revisa('[práctica] paso 3: 3 jugadas recomendadas', (await p.$$('[data-pr-tarea]')).length === 3);
  revisa('[práctica] no avanza sin elegir', await p.isDisabled('[data-pr-sig]'));
  await p.click('[data-pr-tarea] >> nth=0');
  const elegida = await p.textContent('[data-pr-tarea].activa b');
  await p.click('[data-pr-sig]');
  revisa('[práctica] paso 4: ajusta la jugada elegida', (await p.textContent('.fm-pregunta')) === elegida);
  await p.click('[data-pr-dif="facil"]');
  revisa('[práctica] dificultad con los nombres de PROP-FC-002: Más fácil, Base, Más difícil', (await p.$$eval('.fm-juego .fm-jbtn b', bs => bs.map(b => b.textContent).join('|'))) === 'Más fácil|Base|Más difícil');
  revisa('[práctica] el espacio es una canchita que se ve', (await p.$$('.fm-espacio .fm-ebtn svg')).length === 2);
  revisa('[práctica] el elegido queda marcado', await p.getAttribute('[data-pr-dif="facil"]', 'aria-checked') === 'true');
  revisa('[práctica] Más fácil explica qué cambia', /Más fácil:/.test(await p.textContent('.fm-modo')));
  if (process.env.QA_FOTO) await p.screenshot({ path: process.env.QA_FOTO + '-juego.png' });
  await p.click('[data-pr-sig]');
  revisa('[práctica] paso 5: el resumen con su jugada', (await p.textContent('.fm-pr-resumen')).includes(elegida) && /Más fácil/.test(await p.textContent('.fm-pr-resumen')));
  if (process.env.QA_FOTO) await p.screenshot({ path: process.env.QA_FOTO + '-practica.png' });
  await p.click('[data-pr-sig]');
  revisa('[práctica] termina con "¡Así se planea!"', /Así se planea/.test(await p.textContent('.fm-pr-fin')));
  const guardo = (await p.evaluate(() => window.__llamadas.filter(x => /save|close|publish|remove/.test(x.n)).length));
  revisa('[práctica] no guardó nada', guardo === 0, String(guardo));
  await p.click('#fmHojaPie [data-cerrar]');
  await cabe(p, 'práctica');
  await p.close();
}
{ // Con sesiones: el aviso "¿Primera vez?" una vez, y se puede quitar.
  const p = await abre({ direccion: false });
  await p.waitForSelector('.fm-practica-banner', { timeout: 6000 });
  revisa('[práctica] con sesiones, aviso discreto "¿Primera vez?"', /Primera vez/.test(await p.textContent('.fm-practica-banner')));
  await p.click('[data-practica-cierra]');
  revisa('[práctica] "Ya sé cómo" lo quita', (await p.$('.fm-practica-banner')) === null);
  const acc = await p.evaluate(() => (window.tosAccionesDePantalla || []).map(a => a.label));
  revisa('[botón +] con pendientes, lo primero es planear su sesión', acc[0] === 'Planear mi sesión', JSON.stringify(acc));
  await p.close();
}

revisa('sin errores de consola', errores.length === 0, errores.join('\n   '));
await nav.close(); srv.close();
const fallas = revisiones.filter(r => !r.ok);
for (const f of fallas) console.error(` - ${f.nombre}${f.detalle ? `\n   ${f.detalle}` : ''}`);
console.log(fallas.length ? `Formación humo FAILED · ${fallas.length} de ${revisiones.length}`
  : `Formación humo OK · ${revisiones.length} revisiones: próxima semana del Formador, Semana Tanner de Dirección, Baby con sus mundos y el Banco`);
process.exit(fallas.length ? 1 : 0);
