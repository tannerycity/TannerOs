// Partidos (/partidos/) en Chromium a 390px, con un Supabase falso que guarda.
//
// Presidencia, 09/10/2026: quién jugó, quién asistió, quién metió gol y quién
// dio asistencia, el marcador, contra quién y qué liga; fácil para el profe.
// Revisa el flujo de punta a punta:
//   · nuevo partido en cuatro toques (categoría, rival, tipo, local/visita);
//   · todos convocados y con "medio tiempo +" de entrada;
//   · un toque cambia el tiempo; "···" marca no llegó y tarjetas;
//   · + Gol: quién lo metió y quién asistió, en tres toques;
//   · lo que se guarda es exactamente lo que se ve;
//   · no se puede quitar a alguien que tiene un gol;
//   · estadísticas: récord, goleadores, juegan poco y sin jugar;
//   · sólo lectura no deja capturar.
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
await new Promise(r => srv.listen(4805, r));

const revisiones = [], errores = [];
const revisa = (n, ok, d = '') => revisiones.push({ nombre: n, ok, detalle: d });
const nav = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

async function abre({ escribe = true } = {}) {
  const p = await nav.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error') errores.push(`console: ${m.text()}`); });
  await p.addInitScript(({ escribe }) => {
    const plantel = ['Damián López', 'Dario Montalvo', 'Iker Ramírez', 'Mateo Hernández'].map((n, i) => ({ playerId: 'p' + i, name: n, code: 'T0' + i, number: String(i + 7), thumb: i === 0 ? 't0-thumb.webp' : null, bucket: 'tanneros-private' }));
    const partidos = [{ id: 'm0', date: '2026-09-20', category: 'T10', opponent: 'Chivas Cantera', tournament: 'Liga Fit León', venue: 'visita', status: 'completed', goalsFor: 2, goalsAgainst: 2, called: 4, played: 4 }];
    const hojas = {};
    window.__guardados = [];
    const R = {
      v2_my_context: () => [{ organization_id: 'o1', organization_name: 'Tannery City FC', role: 'Formadores', is_owner: false }],
      v2_match_board: () => ({ canWrite: escribe, categories: [{ name: 'T10', mine: true, players: 4 }, { name: 'T12', mine: false, players: 9 }], opponents: ['Chivas Cantera'], matches: partidos }),
      v2_save_match_sheet: prm => {
        const s = prm.sheet; window.__guardados.push(JSON.parse(JSON.stringify(s)));
        const id = s.id || 'm' + (partidos.length);
        const fila = { id, date: s.date, category: s.category, opponent: s.opponent, tournament: s.tournament, venue: s.venue, status: s.status,
          goalsFor: s.goals.length, goalsAgainst: s.goalsAgainst, called: s.players.filter(x => x.called).length, played: 0 };
        const i = partidos.findIndex(x => x.id === id); if (i >= 0) partidos[i] = fila; else partidos.unshift(fila);
        hojas[id] = s; return id;
      },
      v2_match_sheet: prm => {
        const m = partidos.find(x => x.id === prm.match_id), s = hojas[prm.match_id];
        const saved = Boolean(s && s.players.length);
        return { canWrite: escribe, match: { ...m, goals: s?.goals || [], saved },
          roster: plantel.map(pl => { const x = s?.players.find(y => y.playerId === pl.playerId); return { ...pl, called: x ? x.called : false, tiempo: x?.tiempo || null, yellow: x?.yellow || 0, red: x?.red || 0 }; }) };
      },
      v2_archive_match: prm => { const i = partidos.findIndex(x => x.id === prm.match_id); if (i >= 0) partidos.splice(i, 1); window.__archivados = (window.__archivados || []).concat(prm.match_id); return null; },
      v2_match_stats: () => ({ record: { played: 3, won: 2, drawn: 1, lost: 0, goalsFor: 9, goalsAgainst: 3 },
        byCategory: [{ category: 'T10', played: 3, won: 2, drawn: 1, lost: 0, goalsFor: 9, goalsAgainst: 3 }],
        players: [
          { playerId: 'p0', name: 'Damián López', categoryName: 'T10', categoryMatches: 3, called: 3, played: 3, half: 3, noShow: 0, goals: 5, assists: 1 },
          { playerId: 'p1', name: 'Dario Montalvo', categoryName: 'T10', categoryMatches: 3, called: 3, played: 2, half: 0, noShow: 1, goals: 1, assists: 3 },
          { playerId: 'p2', name: 'Iker Ramírez', categoryName: 'T10', categoryMatches: 3, called: 0, played: 0, half: 0, noShow: 0, goals: 0, assists: 0 }] })
    };
    window.__fakeSupabase = {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'u' } } } }), getUser: async () => ({ data: { user: { id: 'u' } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
      rpc: async (n, prm) => ({ data: R[n] ? R[n](prm) : null, error: null }),
      channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {}
    };
  }, { escribe });
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.route('**/v2/supabase-client.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'export function createClient(){ return window.__fakeSupabase; }' }));
  await p.route('**/v2/photo-cache.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: [
    'export async function getSignedPhotoUrls(_s,b,paths){ const m={}; for(const x of paths) m[x]="/icon-512.png?"+x; return m; }',
    'export async function getSignedPhotoUrl(){ return null; }', 'export async function getRawSignedPhotoUrl(){ return null; }',
    'export function clearPhotoCache(){}', 'export function forgetPhoto(){}'].join('\n') }));
  await p.goto('http://127.0.0.1:4805/v2/partidos/', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#view:not(.hidden)', { timeout: 8000 });
  return p;
}
const estados = p => p.$$eval('#ppEstampas .pp-estado', e => e.map(x => x.textContent.trim()));

{
  const p = await abre();
  revisa('[lista] el resultado anterior sale con su marcador', /2-2/.test((await p.innerText('#ptJugados')).replace(/\s/g, '')) && /Chivas Cantera/.test(await p.innerText('#ptJugados')));

  // Nuevo partido
  await p.click('#ptNuevo');
  revisa('[nuevo] el profe con una sola categoría ya la tiene elegida', await p.$eval('#nvCat [data-v="T10"]', b => b.classList.contains('activo')));
  revisa('[nuevo] Liga Fit León y Local vienen de entrada', await p.$eval('#nvTipo [data-v="Liga Fit León"]', b => b.classList.contains('activo')) && await p.$eval('#nvSede [data-v="local"]', b => b.classList.contains('activo')));
  await p.click('#nvCrear');
  revisa('[nuevo] sin rival no deja crear', /contra quién/.test(await p.innerText('#nvMsg')));
  await p.fill('#nvRival', 'Atlético Azteca');
  await p.click('#nvTipo [data-v="Amistoso"]');
  await p.click('#nvCrear');
  await p.waitForSelector('#ptPartido:not(.hidden)');
  const g0 = await p.evaluate(() => window.__guardados[0]);
  revisa('[nuevo] se crea con categoría, rival, tipo y sede', g0?.category === 'T10' && g0.opponent === 'Atlético Azteca' && g0.tournament === 'Amistoso' && g0.venue === 'local' && g0.status === 'scheduled', JSON.stringify(g0));
  revisa('[partido] el título dice quién contra quién', /T10 vs Atlético Azteca/i.test(await p.textContent('#ppTitulo')));

  // Convocados: todos de entrada
  revisa('[convocados] todos van de entrada', (await estados(p)).every(x => x === 'Convocado') && (await p.textContent('#ppNConv')) === '4', JSON.stringify(await estados(p)));
  await p.click('#ppEstampas .pp-toque[data-id="p3"]');
  revisa('[convocados] un toque quita a quien no va', (await estados(p))[3] === 'No va' && (await p.textContent('#ppNConv')) === '3');

  // Quién jugó
  await p.click('#ppTabJuego');
  revisa('[jugó] sólo salen los convocados, con medio tiempo + de entrada', JSON.stringify(await estados(p)) === '["Medio +","Medio +","Medio +"]', JSON.stringify(await estados(p)));
  await p.click('#ppEstampas .pp-toque[data-id="p1"]');
  revisa('[jugó] un toque: menos de medio tiempo', (await estados(p))[1] === 'Poco');
  await p.click('#ppEstampas [data-mas="p2"]');
  await p.click('#hjCuerpo [data-t="no_llego"]');
  revisa('[jugó] "···" marca que no llegó', (await estados(p))[2] === 'No llegó' && (await p.textContent('#ppNJugo')) === '2');
  await p.click('#ppEstampas [data-mas="p0"]');
  await p.click('#hjCuerpo [data-am="1"]');
  await p.click('#hjListo');
  revisa('[tarjetas] la amarilla se ve en su estampa', /1 TA/.test(await p.innerText('#ppEstampas .pp-estampa:nth-child(1)')));

  // Goles
  await p.click('#ppGol');
  const opciones = await p.$$eval('#hjCuerpo .hj-caras [data-p]', e => e.map(x => x.dataset.p));
  revisa('[gol] sólo se puede elegir a quien jugó', JSON.stringify(opciones) === '["p0","p1"]', JSON.stringify(opciones));
  await p.click('#hjCuerpo .hj-caras [data-p="p0"]');
  revisa('[gol] la asistencia no ofrece al que metió el gol', JSON.stringify(await p.$$eval('#hjCuerpo .hj-caras [data-p]', e => e.map(x => x.dataset.p))) === '["p1"]');
  await p.click('#hjCuerpo .hj-caras [data-p="p1"]');
  await p.click('#ppGol'); await p.click('#hjCuerpo .hj-caras [data-p="p0"]'); await p.click('#hjCuerpo .hj-sin');
  await p.click('#ppGAmas');
  revisa('[marcador] Tannery 2, rival 1', (await p.textContent('#ppGF')) === '2' && (await p.textContent('#ppGA')) === '1');
  const chips = (await p.innerText('#ppGoles')).replace(/\s+/g, ' ');
  revisa('[marcador] los goles dicen quién y quién asistió', /Damián asist\. Dario/i.test(chips), chips);
  revisa('[estampa] goles y asistencias en la estampa', /2 G/.test(await p.innerText('#ppEstampas .pp-estampa:nth-child(1)')) && /1 A/.test(await p.innerText('#ppEstampas .pp-estampa:nth-child(2)')));

  // No se puede quitar a quien tiene goles
  await p.click('#ppEstampas .pp-toque[data-id="p1"]');
  revisa('[cuidado] no deja pasar a "no jugó" a quien dio una asistencia', (await estados(p))[1] === 'Poco' && /Quítalos primero/.test(await p.textContent('#ppMensaje')));
  await p.click('#ppTabConv');
  await p.click('#ppEstampas .pp-toque[data-id="p0"]');
  revisa('[cuidado] ni quitarlo de los convocados', (await estados(p))[0] === 'Convocado');

  await p.screenshot({ path: path.join(RAIZ, 'docs/evidencias/partido.png') });

  // Terminar
  await p.click('#ppTerminar');
  await p.waitForFunction(() => /Ganamos/.test(document.getElementById('ppMensaje').textContent), null, { timeout: 4000 });
  const g = await p.evaluate(() => window.__guardados.at(-1));
  revisa('[guardar] se cierra como terminado con el marcador', g.status === 'completed' && g.goals.length === 2 && g.goalsAgainst === 1, JSON.stringify({ s: g.status, g: g.goals.length, a: g.goalsAgainst }));
  revisa('[guardar] los goles con quién y quién asistió', JSON.stringify(g.goals) === '[{"scorer":"p0","assist":"p1"},{"scorer":"p0","assist":null}]', JSON.stringify(g.goals));
  const jug = g.players.map(x => `${x.playerId}:${x.called ? x.tiempo : 'no va'}:${x.yellow}`).join(',');
  revisa('[guardar] cada Tanner con su tiempo y tarjetas', jug === 'p0:medio:1,p1:poco:0,p2:no_llego:0,p3:no va:0', jug);
  revisa('[guardar] confirma el resultado', /Ganamos 2-1/.test(await p.textContent('#ppMensaje')));
  await p.click('#ppCerrar');
  revisa('[lista] el partido ya sale en resultados con 2-1', /2-1/.test((await p.innerText('#ptJugados')).replace(/\s/g, '')));
  revisa('[sin desborde] nada se sale a 390px', !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));

  // Editar datos: el rival y la fecha, sin perder goles ni jugadores.
  await p.click('#ptJugados .pt-partido-fila');
  await p.waitForSelector('#ptPartido:not(.hidden)');
  await p.click('#ppMenu');
  await p.click('#mnEditar');
  revisa('[editar] el formulario llega con los datos del partido', (await p.inputValue('#nvRival')) === 'Atlético Azteca' && await p.$eval('#nvTipo [data-v="Amistoso"]', b => b.classList.contains('activo')));
  await p.fill('#nvRival', 'Atlético Azteca B');
  await p.click('#nvSede [data-v="visita"]');
  await p.click('#nvCrear');
  await p.waitForFunction(() => /actualizados/.test(document.getElementById('ppMensaje').textContent), null, { timeout: 4000 });
  const ge = await p.evaluate(() => window.__guardados.at(-1));
  revisa('[editar] se guarda el nuevo rival y la sede', ge.opponent === 'Atlético Azteca B' && ge.venue === 'visita', JSON.stringify({ o: ge.opponent, v: ge.venue }));
  revisa('[editar] sin perder goles, jugadores ni resultado', ge.goals.length === 2 && ge.goalsAgainst === 1 && ge.status === 'completed' && ge.players.filter(x => x.called).length === 3, JSON.stringify({ g: ge.goals.length, a: ge.goalsAgainst, s: ge.status }));
  revisa('[editar] el título ya dice el nuevo rival', /Atlético Azteca B/i.test(await p.textContent('#ppTitulo')));

  // Eliminar: pide confirmación; si se cancela, no pasa nada.
  await p.click('#ppMenu');
  p.once('dialog', d => d.dismiss());
  await p.click('#mnEliminar');
  await p.waitForTimeout(150);
  revisa('[eliminar] si se cancela, no se elimina', !(await p.evaluate(() => (window.__archivados || []).length)));
  p.once('dialog', d => d.accept());
  await p.click('#mnEliminar');
  await p.waitForFunction(() => /Partido eliminado/.test(document.getElementById('ptMensaje').textContent), null, { timeout: 4000 });
  revisa('[eliminar] se archiva y sale de la lista', (await p.evaluate(() => window.__archivados.length)) === 1 && !/Azteca B/.test(await p.innerText('#ptLista')) && await p.isHidden('#ptPartido'));

  // Estadísticas
  await p.click('#tabStats');
  await p.waitForFunction(() => document.getElementById('stJugados').textContent === '3');
  revisa('[stats] récord G-E-P y goles', (await p.textContent('#stG')) === '2' && (await p.textContent('#stE')) === '1' && (await p.textContent('#stP')) === '0' && (await p.textContent('#stGoles')) === '9:3');
  const gol = (await p.innerText('#stGoleadores')).replace(/\s+/g, ' ');
  revisa('[stats] goleadores de más a menos', gol.indexOf('Damián') < gol.indexOf('Dario') && /5/.test(gol), gol);
  revisa('[stats] juegan poco: Dario, 0 de 2 con medio tiempo', /Dario Montalvo.*0\/2/.test((await p.innerText('#stPoco')).replace(/\s+/g, ' ')));
  revisa('[stats] sin jugar: Iker', /Iker Ramírez/.test(await p.innerText('#stSin')));
  await p.screenshot({ path: path.join(RAIZ, 'docs/evidencias/partidos-estadisticas.png'), fullPage: true });
  await p.close();
}

// Sólo lectura
{
  const p = await abre({ escribe: false });
  revisa('[lectura] sin botón de nuevo partido', await p.isHidden('#ptNuevo'));
  await p.click('#ptJugados .pt-partido-fila');
  await p.waitForSelector('#ptPartido:not(.hidden)');
  revisa('[lectura] sin + Gol ni Terminar', await p.isHidden('#ppGol') && await p.isHidden('#ppTerminar'));
  revisa('[lectura] sin menú para editar o eliminar', await p.isHidden('#ppMenu'));
  revisa('[lectura] las estampas no se tocan', await p.$eval('#ppEstampas .pp-toque', b => b.disabled).catch(() => true));
  await p.close();
}

await nav.close(); srv.close();
let mal = 0;
for (const r of revisiones) if (!r.ok) { mal++; console.error(` - ${r.nombre}${r.detalle ? ' :: ' + r.detalle : ''}`); }
if (errores.length) { console.error('ERRORES DEL NAVEGADOR:'); errores.forEach(e => console.error('   ' + e)); }
if (mal || errores.length) { console.error(`Partidos humo FAILED · ${mal} de ${revisiones.length}, ${errores.length} errores`); process.exit(1); }
console.log(`Partidos humo OK · ${revisiones.length} revisiones: nuevo partido, convocados, quién jugó, goles con asistencia, guardar y estadísticas`);
