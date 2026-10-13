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

async function abre({ direccion }) {
  const p = await nav.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(`console: ${m.text()}`); });
  await p.addInitScript(({ direccion, CATALOGO, MIA, DIR, HOY }) => {
    window.__llamadas = [];
    const mia = JSON.parse(JSON.stringify(MIA)), hoy = JSON.parse(JSON.stringify(HOY));
    const mods = ['inicio', 'formacion', ...(direccion ? ['formacion_direccion'] : [])];
    const R = {
      v2_my_context: () => [{ user_id: 'u2', display_name: 'Max', organization_id: 'o1', organization_name: 'Tannery City FC', organization_slug: 'tannery-city-fc', role: direccion ? 'Operaciones' : 'Formadores', is_owner: false }],
      v2_my_navigation: () => mods.map(c => ({ module_code: c, enabled: true, can_read: true, can_write: true })),
      v2_formation_catalog: () => CATALOGO,
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
  }, { direccion, CATALOGO, MIA, DIR, HOY });
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

revisa('sin errores de consola', errores.length === 0, errores.join('\n   '));
await nav.close(); srv.close();
const fallas = revisiones.filter(r => !r.ok);
for (const f of fallas) console.error(` - ${f.nombre}${f.detalle ? `\n   ${f.detalle}` : ''}`);
console.log(fallas.length ? `Formación humo FAILED · ${fallas.length} de ${revisiones.length}`
  : `Formación humo OK · ${revisiones.length} revisiones: próxima semana del Formador, Semana Tanner de Dirección, Baby con sus mundos y el Banco`);
process.exit(fallas.length ? 1 : 0);
