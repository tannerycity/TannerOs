/* JUGADORES: LISTA ESTILO CONTACTOS Y DESLIZAR PARA COBRAR (19/11/2026).
 *
 * Presidencia: "dale con A más B".
 *   A · Cada Tanner es un renglón: foto chiquita, nombre, número y posición, y
 *       un punto rojo si le falta algo, con qué es en la línea de abajo. Las
 *       tarjetas con foto siguen a un toque ("Tarjetas") y se recuerda.
 *   B · Deslizar un renglón a la izquierda enseña WhatsApp sin abrir
 *       la ficha. El teléfono del tutor se pide hasta tocar WhatsApp.
 *
 * Levanta /v2/jugadores/ REAL con un Supabase falso y revisa, como
 * Presidencia y como profe:
 *   1. La lista es la vista por defecto, con renglones de 44 px o más.
 *   2. Punto rojo y motivo sólo para quien tiene avisos; el profe no los ve.
 *   3. "Tarjetas" vuelve a las tarjetas con foto y se recuerda al recargar.
 *   4. Deslizar enseña WhatsApp; soltar a medias no. Separación total
 *      (19/11/2026): en Jugadores no se cobra ni se ve dinero (vive en Taquilla).
 *   5. Después de deslizar, el toque no abre la ficha; un toque normal sí.
 *   6. WhatsApp abre el chat del tutor con el mensaje del club.
 *   7. Nadie ve Cobrar en Jugadores.
 *
 * TÉCNICAS (ISTQB, nivel Foundation):
 *   · Tabla de decisión (quién ve qué). Condiciones: ve dinero (billing o
 *     accounting) × ve expediente (jugadores_estado).
 *       R1 Presidencia  sí/sí  → motivo por expediente; sin dinero ni Cobrar.
 *       R2 Taquilla     sí/no  → sin motivos (aunque la lista traiga saldo), sin Cobrar.
 *       R3 Profe        no/no  → sin motivos, sin Cobrar; WhatsApp sí.
 *   · Valores frontera del deslizar: el umbral es la mitad del ancho de las
 *     acciones. Se prueba umbral − 12 px (no abre) y umbral + 12 px (abre).
 *   · Transición de estados del renglón: cerrado → abierto (deslizar) →
 *     cerrado (tocar fuera); abierto A + deslizar B → A cerrado, B abierto.
 *   · Partición de equivalencia de la posición: portero, defensa, lateral,
 *     medio, extremo, delantero y una clase inválida (texto libre) → placa.
 *   · Adivinación de errores: sin dorsal ("–"), tutor sin teléfono
 *     ("Sin teléfono"), saldo en la lista que no debe enseñarse.
 */
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

const MODS = {
  Presidencia:{ my:[['players',true],['billing',true],['accounting',true],['jugadores_familia',true],['jugadores_estado',true]],
                nav:[['jugadores',true],['cobranza',true],['contabilidad',true],['taquilla',true]] },
  Formadores:{ my:[['players',true]], nav:[['jugadores',true],['asistencia',true]] },
  Taquilla:{ my:[['players',false],['billing',true]], nav:[['jugadores',true],['taquilla',true]] }
};
// R2 + h96: la lista ya trae saldo y teléfono. Posiciones para la partición.
const JUG_H96 = [
  { id:'t1', first_name:'Leo', last_name:'Ríos', status:'active', status_value:'active', category:'T10', jersey_number:'1', player_position:'Portero', docs_missing:2, data_consent:false, image_consent_status:'sin_preguntar', balance_due:1600, guardian_phone:'4775550001' },
  { id:'t2', first_name:'Sara', last_name:'Paz', status:'active', status_value:'active', category:'T10', jersey_number:'3', player_position:'Defensa central', docs_missing:0, data_consent:true, image_consent_status:'autoriza', balance_due:0.01 },
  { id:'t3', first_name:'Hugo', last_name:'Sol', status:'active', status_value:'active', category:'T10', jersey_number:'2', player_position:'Lateral derecho', docs_missing:0, data_consent:true, image_consent_status:'autoriza', balance_due:0 },
  { id:'t4', first_name:'Iván', last_name:'Mar', status:'active', status_value:'active', category:'T10', jersey_number:'8', player_position:'Medio', docs_missing:0, data_consent:true, image_consent_status:'autoriza', balance_due:null },
  { id:'t5', first_name:'Eva', last_name:'Luz', status:'active', status_value:'active', category:'T10', jersey_number:'11', player_position:'Extremo', docs_missing:0, data_consent:true, image_consent_status:'autoriza' },
  { id:'t6', first_name:'Noé', last_name:'Gil', status:'active', status_value:'active', category:'T10', jersey_number:'', player_position:'Libero', docs_missing:0, data_consent:true, image_consent_status:'autoriza' }
];
const JUGADORES = [
  { id:'p1', first_name:'Marcelo', last_name:'Pedroza Ortiz', status:'active', status_value:'active', category:'T10', jersey_number:'7', player_position:'Portero', docs_missing:1, data_consent:true, image_consent:false, image_consent_status:'no_autoriza' },
  { id:'p2', first_name:'Ana', last_name:'Luna', status:'active', status_value:'active', category:'T10', jersey_number:'10', player_position:'Delantera', docs_missing:0, data_consent:true, image_consent:true, image_consent_status:'autoriza' },
  { id:'p3', first_name:'Iker', last_name:'Flores', status:'active', status_value:'active', category:'T12', jersey_number:'4', docs_missing:0, data_consent:true, image_consent:true, image_consent_status:'autoriza', needs_review:true }
];

let fallos = 0, corridas = 0;
const revisa = (n, ok, d) => { corridas++; if (!ok) { fallos++; console.error(` - ${n}${d !== undefined ? `\n   ${typeof d === 'string' ? d : JSON.stringify(d)}` : ''}`); } };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const errores = [];

async function abre(rol, ctx, jug = JUGADORES) {
  const p = await ctx.newPage();
  p.on('pageerror', e => errores.push(`[${rol}] ${e.message}`));
  await p.addInitScript(({ rol, m, JUG }) => {
    window.__llamadas = [];
    const mk = l => l.map(([c, w]) => ({ module_code: c, enabled: true, can_read: true, can_write: w }));
    const R = {
      v2_my_context: [{ user_id: 'u1', display_name: 'Mich', organization_id: 'o1', organization_name: 'Tannery City FC', role: rol, is_owner: rol === 'Presidencia' }],
      v2_my_modules: mk(m.my), v2_my_navigation: mk(m.nav), v2_can_set_joined_at: false,
      v2_players: JUG, v2_categories: [], v2_withdrawal_requests: [], v2_benefit_requests: [],
      v2_player_profile: { player: { id: 'p2', firstName: 'Ana', lastName: 'Luna', status: 'active', category: 'T10' },
        guardians: [{ firstName: 'Laura', lastName: 'Luna', name: 'Laura Luna', phone: '4771112233', isPrimary: true }] }
    };
    window.__fakeSupabase = {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }), getUser: async () => ({ data: { user: { id: 'u1' } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
      rpc: async (n, params) => { window.__llamadas.push({ n, params }); return { data: R[n] ?? null, error: null }; },
      storage: { from: () => ({ createSignedUrl: async () => ({ data: null }), createSignedUrls: async () => ({ data: [] }) }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {}
    };
  }, { rol, m: MODS[rol], JUG: jug });
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.route('https://wa.me/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>wa</p>' }));
  await p.route('**/v2/supabase-client.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'export function createClient(){ return window.__fakeSupabase; }' }));
  await p.route('**/v2/photo-cache.js', r => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: 'export async function getSignedPhotoUrls(){return {};}export async function getSignedPhotoUrl(){return null;}export async function getRawSignedPhotoUrl(){return null;}export async function clearPhotoCache(){}export function forgetPhoto(){}' }));
  await p.goto(`${BASE}/v2/jugadores/`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#playerList .jcard', { timeout: 8000 });
  await p.waitForTimeout(300);
  return p;
}
async function desliza(p, id, cuanto) {
  const b = await p.$(`.jrow[data-player-id="${id}"]`);
  await b.evaluate(el => el.scrollIntoView({ block: 'center' })); await p.waitForTimeout(150);
  const r = await b.boundingBox();
  const y = r.y + r.height / 2, x = r.x + r.width - 30;
  await p.mouse.move(x, y); await p.mouse.down();
  for (let i = 1; i <= 8; i++) await p.mouse.move(x - (cuanto * i / 8), y);
  await p.mouse.up(); await p.waitForTimeout(300);
}
const abierto = (p, id) => p.$eval(`.jrow[data-player-id="${id}"]`, b => b.parentElement.classList.contains('abierto'));

/* ---------- Presidencia ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await abre('Presidencia', ctx);
  const filas = await p.$$eval('#playerList .jrow', bs => bs.map(b => ({ id: b.dataset.playerId, txt: b.innerText.replace(/\s+/g, ' ').trim(), alto: b.getBoundingClientRect().height, punto: !!b.querySelector('.jrow-txt small.falta') })));
  revisa('1. la lista es la vista por defecto: un renglón por Tanner', filas.length === 3 && await p.isVisible('#vistaJugadores [data-vista-jug="lista"][aria-pressed="true"]'), filas);
  revisa('1. cada renglón mide lo que un dedo', filas.every(f => f.alto >= 44), filas.map(f => f.alto));
  const m = filas.find(f => f.id === 'p1'), a = filas.find(f => f.id === 'p2'), i = filas.find(f => f.id === 'p3');
  revisa('A. dorsal, nombre y posición en placa (como el FIFA)', /^7\b/.test(m?.txt) && /MARCELO PEDROZA ORTIZ/i.test(m?.txt) && /\bPOR\b/.test(m?.txt) && /\bDEL\b/.test(a?.txt || ''), { m, a });
  revisa('2. el motivo para quien le falta algo del expediente', m?.punto && /Falta 1 documento/.test(m?.txt), m);
  revisa('separación: el cobro sin configurar no sale en Jugadores (es de Taquilla)', i && !i.punto && !/Cobro sin configurar/.test(i.txt), i);
  revisa('2. sin punto para quien está completa', a && !a.punto, a);

  // B · Deslizar
  const umbral = await p.$eval('.jrow[data-player-id="p2"]', b => b.parentElement.querySelector('.jrow-acciones').getBoundingClientRect().width / 2);
  await desliza(p, 'p2', umbral - 12);
  revisa('frontera: umbral − 12 px no abre', !(await abierto(p, 'p2')), umbral);
  await desliza(p, 'p2', umbral + 12);
  revisa('frontera: umbral + 12 px abre', await abierto(p, 'p2'), umbral);
  await p.click('.cat-head h3');
  await desliza(p, 'p2', 40);
  revisa('4. soltar a medias no deja abierto', !(await abierto(p, 'p2')));
  await desliza(p, 'p2', 220);
  revisa('4. deslizar a la izquierda enseña WhatsApp', await abierto(p, 'p2') && await p.isVisible('.jrow-wrap.abierto .jrow-acc.wa'));
  revisa('7. separación: Presidencia tampoco ve Cobrar en Jugadores', !(await p.$('.jrow-acc.cobrar')));
  revisa('5. después de deslizar, la ficha no se abrió', !(await p.evaluate(() => document.getElementById('profilePanel')?.classList.contains('open'))));
  await desliza(p, 'p1', 220);
  revisa('4. abrir otro renglón cierra el anterior', await abierto(p, 'p1') && !(await abierto(p, 'p2')));
  await p.click('.cat-head h3');
  revisa('4. tocar fuera cierra el renglón abierto', !(await abierto(p, 'p1')));

  // 6 · WhatsApp
  await desliza(p, 'p2', 220);
  await Promise.all([p.waitForURL(/wa\.me/, { timeout: 5000 }).catch(() => {}), p.click('.jrow-wrap.abierto .jrow-acc.wa')]);
  const url = decodeURIComponent(p.url());
  revisa('6. WhatsApp abre el chat del tutor con el mensaje del club', /^https:\/\/wa\.me\/524771112233\?text=Hola Laura, le escribimos de Tannery City FC sobre Ana\./.test(url), url);

  // 5 · Toque normal abre la ficha; 3 · Tarjetas
  await p.goto(`${BASE}/v2/jugadores/`, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('#playerList .jrow', { timeout: 8000 });
  await p.click('.jrow[data-player-id="p2"]');
  await p.waitForFunction(() => window.__llamadas.some(l => l.n === 'v2_player_profile'), null, { timeout: 4000 }).catch(() => {});
  revisa('5. un toque normal abre la ficha', await p.evaluate(() => window.__llamadas.some(l => l.n === 'v2_player_profile' && l.params.player_id === 'p2')));
  await p.goto(`${BASE}/v2/jugadores/`, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('#playerList .jrow', { timeout: 8000 });
  await p.click('[data-vista-jug="tarjetas"]');
  revisa('3. "Tarjetas" vuelve a las tarjetas con foto', (await p.$$('#playerList .jrow')).length === 0 && (await p.$$('#playerList .jcard')).length === 3);
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForSelector('#playerList .jcard', { timeout: 8000 });
  revisa('3. y se recuerda al volver', (await p.$$('#playerList .jrow')).length === 0 && await p.isVisible('[data-vista-jug="tarjetas"][aria-pressed="true"]'));
  await p.click('[data-vista-jug="lista"]');
  revisa('3. "Lista" regresa a los renglones', (await p.$$('#playerList .jrow')).length === 3);
  revisa('sin scroll horizontal', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await ctx.close();
}

/* ---------- Profe ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await abre('Formadores', ctx);
  revisa('2. el profe no ve puntos de expediente', (await p.$$('#playerList .jrow-txt small.falta')).length === 0 && (await p.$$('#playerList .jrow')).length === 3);
  await desliza(p, 'p2', 220);
  revisa('7. el profe desliza y ve WhatsApp, sin Cobrar', await abierto(p, 'p2') && !(await p.$('.jrow-wrap.abierto .jrow-acc.cobrar')) && await p.isVisible('.jrow-wrap.abierto .jrow-acc.wa'));
  await ctx.close();
}

/* ---------- R2 Taquilla (la lista trae saldo y teléfono) ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await abre('Taquilla', ctx, JUG_H96);
  const f = await p.$$eval('#playerList .jrow', bs => Object.fromEntries(bs.map(b => [b.dataset.playerId, { txt: b.innerText.replace(/\s+/g, ' ').trim(), punto: !!b.querySelector('.jrow-txt small.falta'), pos: b.querySelector('.jrow-pos')?.textContent || '', num: b.querySelector('.jrow-num')?.textContent || '', motivo: b.querySelector('.jrow-txt small')?.textContent || '' }])));
  revisa('R2 + separación: aunque la lista traiga saldo, Jugadores no enseña dinero', Object.values(f).every(x => !x.punto && !/Debe|\$/.test(x.txt)), f);
  revisa('partición de posición: POR, DEF, LAT, MED, EXT y texto libre (LIB)', f.t1?.pos === 'POR' && f.t2?.pos === 'DEF' && f.t3?.pos === 'LAT' && f.t4?.pos === 'MED' && f.t5?.pos === 'EXT' && f.t6?.pos === 'LIB', Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.pos])));
  revisa('error típico: sin dorsal sale "–", no un hueco', f.t6?.num === '–', f.t6);
  await desliza(p, 't1', 220);
  revisa('R2: Taquilla desliza y ve WhatsApp, sin Cobrar', await p.isVisible('.jrow-wrap.abierto .jrow-acc.wa') && !(await p.$('.jrow-acc.cobrar')));
  await Promise.all([p.waitForURL(/wa\.me/, { timeout: 5000 }).catch(() => {}), p.click('.jrow-wrap.abierto .jrow-acc.wa')]);
  revisa('h96: con el teléfono en la lista, WhatsApp abre sin pedir la ficha', /wa\.me\/524775550001/.test(p.url()) && !(await p.evaluate(() => (window.__llamadas || []).some(l => l.n === 'v2_player_profile')).catch(() => true)), p.url());
  await ctx.close();
}
/* ---------- Error típico: tutor sin teléfono ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await abre('Formadores', ctx);
  await p.evaluate(() => { const r = window.__fakeSupabase.rpc; window.__fakeSupabase.rpc = async (n, params) => n === 'v2_player_profile' ? { data: { player: { firstName: 'Ana' }, guardians: [{ phone: null, isPrimary: true }] }, error: null } : r(n, params); });
  await desliza(p, 'p2', 220);
  await p.click('.jrow-wrap.abierto .jrow-acc.wa');
  await p.waitForTimeout(400);
  revisa('error típico: sin teléfono, el botón lo dice y no abre nada', /Sin teléfono/.test(await p.textContent('.jrow-wrap.abierto .jrow-acc.wa')) && !/wa\.me/.test(p.url()));
  await ctx.close();
}

revisa('sin errores de página', !errores.length, errores.join(' | '));
await browser.close(); srv.close();
console.log(fallos ? `Jugadores lista FAILED · ${fallos} de ${corridas}` : `Jugadores lista OK · ${corridas} revisiones: tabla de decisión por rol, frontera del deslizar, separación del dinero, estados del renglón, posiciones y errores típicos`);
process.exit(fallos ? 1 : 0);
