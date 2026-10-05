/* INICIO · CUMPLEAÑOS PARA TODOS Y BOTÓN DE ACCIONES RÁPIDAS.
 *
 * Pedido (05/10/2026): "que todos sepan al inicio si hay cumpleaños de
 * alguien", incluido el staff, y "un botón de acción flotante para cosas
 * rápidas" que cambie según el rol.
 *
 * Esta prueba levanta Inicio REAL (index.html + app.js + shell.js) con un
 * Supabase falso y revisa, por rol:
 *   · la franja sale bajo el saludo con los de hoy primero y los de la semana
 *     después; el de staff no enseña edad; el jugador enlaza a su ficha sólo
 *     si quien mira puede ver Jugadores;
 *   · a quien no ha dado su cumpleaños se le pregunta, se guarda con
 *     v2_set_my_birthday y "Ahora no" lo calla;
 *   · si nadie cumple y ya dio su fecha, la franja no ocupa lugar;
 *   · el botón flotante trae las acciones de su rol y sólo las que su
 *     permiso abre; se abre, se cierra con Escape y con el fondo;
 *   · nombres con HTML se enseñan como texto.
 */
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const RAIZ = '/home/user/TannerOs';
const T = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
            '.svg':'image/svg+xml','.json':'application/json','.png':'image/png' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('no'); return; }
  r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
  r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(4751, r));

const HOY = '2026-10-05';
const GENTE = [
  { kind:'player', id:'p1', firstName:'Adan', name:'Adan Ibarra', detail:'Sub-12', day:HOY, turns:11 },
  { kind:'staff', id:'u-zul', firstName:'Zul', name:'Zul', detail:'Operaciones', day:HOY, turns:null },
  { kind:'player', id:'p2', firstName:'Ana', name:'Ana <img src=x onerror="window.__xss=1">', detail:'Femenil', day:'2026-10-08', turns:9 }
];
const nav = (mods) => mods.map(([c, w]) => ({ module_code:c, enabled:true, can_read:true, can_write:w }));
const ROLES = {
  Presidencia: { yo:'u-mich', nav: nav([['jugadores',true],['prospectos',true],['taquilla',true],['cobranza',true],['contabilidad',true],['tienda',true],['estacionamiento',true]]),
                 espera:['Registrar jugador','Captación','Cobrar','Pagar','Tienda','Gafete de estacionamiento'] },
  Taquilla:    { yo:'u-ipad', nav: nav([['taquilla',true],['cobranza',true]]),
                 espera:['Cobrar','Pagar'] },
  Formadores:  { yo:'u-profe', nav: nav([['asistencia',true],['convocatoria',false],['jugadores',false]]),
                 espera:['Pasar asistencia','Convocatoria','Mensaje'] }
};

const revisiones = []; const errores = [];
function revisa(nombre, ok, detalle = '') { revisiones.push({ nombre, ok, detalle }); }
const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

async function abre(rol, { gente = GENTE, miFecha = null, ancho = 390 } = {}) {
  const cfg = ROLES[rol];
  const pagina = await navegador.newPage({ viewport: { width: ancho, height: 844 } });
  pagina.on('pageerror', e => errores.push(`[${rol}] pageerror: ${e.message}`));
  pagina.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(`[${rol}] console: ${m.text()}`); });
  await pagina.addInitScript(({ rol, cfg, gente, miFecha, HOY }) => {
    window.__llamadas = [];
    const R = {
      v2_my_context: [{ user_id: cfg.yo, display_name: rol === 'Presidencia' ? 'Mich' : 'Zul', organization_id:'o1', organization_name:'Tannery City FC', role: rol, is_owner: rol === 'Presidencia' }],
      v2_my_navigation: cfg.nav,
      v2_birthdays: { today: HOY, myBirthDate: miFecha, people: gente },
      v2_set_my_birthday: { ok: true }
    };
    window.__fakeSupabase = {
      auth: {
        getSession: async () => ({ data: { session: { user: { id: cfg.yo } } } }),
        getUser: async () => ({ data: { user: { id: cfg.yo, app_metadata: {} } } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } })
      },
      rpc: async (name, params) => {
        window.__llamadas.push({ name, params });
        if (name === 'v2_set_my_birthday') { R.v2_birthdays = { ...R.v2_birthdays, myBirthDate: params.birth_date }; }
        return { data: R[name] ?? null, error: null };
      },
      channel: () => ({ on(){ return this; }, subscribe(){ return this; } }), removeChannel(){}
    };
  }, { rol, cfg, gente, miFecha, HOY });
  await pagina.route('**/v2/supabase-client.js', r => r.fulfill({ status:200, contentType:'text/javascript',
    body:'export function createClient(){ return window.__fakeSupabase; }' }));
  await pagina.route('**/v2/photo-cache.js', r => r.fulfill({ status:200, contentType:'text/javascript',
    body:['export async function getSignedPhotoUrls(){ return {}; }','export async function getSignedPhotoUrl(){ return null; }',
          'export async function getRawSignedPhotoUrl(){ return null; }','export async function clearPhotoCache(){}','export function forgetPhoto(){}'].join('\n') }));
  await pagina.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await pagina.goto('http://127.0.0.1:4751/', { waitUntil: 'domcontentloaded' });
  await pagina.waitForSelector('#appView:not(.hidden)', { timeout: 8000 });
  await pagina.waitForFunction(() => window.__llamadas.some(l => l.name === 'v2_birthdays'), null, { timeout: 6000 });
  await pagina.waitForTimeout(250);
  return pagina;
}

/* ---------- Presidencia en el teléfono ---------- */
{
  const p = await abre('Presidencia');
  revisa('[Presidencia] la franja sale', await p.isVisible('#cumpleStrip'));
  const orden = await p.evaluate(() => {
    const w = document.querySelector('.tos-welcome'), s = document.getElementById('cumpleStrip');
    return w && s && (w.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING) && w.nextElementSibling === s;
  });
  revisa('[Presidencia] va justo debajo del saludo', Boolean(orden));
  const titulo = (await p.textContent('#cumpleStrip .tcs-head strong')).trim();
  revisa('[Presidencia] dice cuántos cumplen hoy', titulo === 'Hoy hay 2 cumpleaños', titulo);
  revisa('[Presidencia] el filo dorado de "hoy" se enciende', await p.getAttribute('#cumpleStrip', 'data-hoy') === '1');
  const chips = await p.$$eval('#cumpleStrip .tcs-chip', els => els.map(e => ({ tag:e.tagName, hoy:e.dataset.hoy, txt:e.textContent.replace(/\s+/g,' ').trim(), href:e.getAttribute('href') })));
  revisa('[Presidencia] hoy primero, la semana después', chips.length === 3 && chips[0].hoy === '1' && chips[1].hoy === '1' && chips[2].hoy === '0', JSON.stringify(chips));
  revisa('[Presidencia] el jugador dice cuántos cumple', /Sub-12 · cumple 11/.test(chips[0]?.txt || ''), chips[0]?.txt);
  revisa('[Presidencia] el jugador enlaza a su ficha', chips[0]?.href === '/jugadores/?player=p1', chips[0]?.href);
  revisa('[Presidencia] el staff no enseña edad', /Operaciones/.test(chips[1]?.txt || '') && !/cumple/.test(chips[1]?.txt || ''), chips[1]?.txt);
  revisa('[Presidencia] el staff no es enlace', chips[1]?.tag === 'SPAN');
  revisa('[Presidencia] el de la semana dice el día', /Jueves 8/i.test(chips[2]?.txt || ''), chips[2]?.txt);
  revisa('[Presidencia] un nombre con HTML se enseña como texto', /<img src=x/.test(chips[2]?.txt || '') && !(await p.evaluate(() => window.__xss)));

  // Le falta su fecha: se le pregunta y se guarda.
  revisa('[Presidencia] se le pregunta su cumpleaños', await p.isVisible('#cumpleAsk'));
  await p.fill('#cumpleMio', '1990-03-14');
  await p.click('#cumpleAsk .tcs-save');
  await p.waitForFunction(() => window.__llamadas.some(l => l.name === 'v2_set_my_birthday'), null, { timeout: 4000 });
  const guardo = await p.evaluate(() => window.__llamadas.find(l => l.name === 'v2_set_my_birthday').params);
  revisa('[Presidencia] guarda su fecha', guardo.birth_date === '1990-03-14' && guardo.organization_id === 'o1', JSON.stringify(guardo));
  await p.waitForSelector('#cumpleAsk', { state: 'detached', timeout: 4000 });
  revisa('[Presidencia] ya no se le vuelve a preguntar', (await p.$$('#cumpleAsk')).length === 0);

  // Botón flotante.
  revisa('[Presidencia] hay botón de acciones rápidas', await p.isVisible('#tosFab'));
  revisa('[Presidencia] el menú arranca cerrado', await p.isHidden('#tosFabMenu'));
  await p.click('#tosFab');
  await p.waitForTimeout(260);
  revisa('[Presidencia] el botón abre el menú', await p.isVisible('#tosFabMenu'));
  revisa('[Presidencia] aria-expanded dice que está abierto', await p.getAttribute('#tosFab', 'aria-expanded') === 'true');
  const acciones = await p.$$eval('#tosFabMenu .tos-fab-item strong', els => els.map(e => e.textContent.trim()));
  revisa('[Presidencia] trae sus 6 acciones en orden', JSON.stringify(acciones) === JSON.stringify(ROLES.Presidencia.espera), JSON.stringify(acciones));
  const hrefs = await p.$$eval('#tosFabMenu .tos-fab-item', els => els.map(e => e.getAttribute('href')));
  revisa('[Presidencia] cobrar y pagar van a Taquilla con la acción abierta', hrefs.includes('/taquilla/?action=cobrar') && hrefs.includes('/taquilla/?action=pagar'));
  revisa('[Presidencia] gafete abre la hoja de nuevo gafete', hrefs.includes('/estacionamiento/?nuevo=1'));
  revisa('[Presidencia] registrar jugador va al formulario de ingreso', hrefs.includes('/registro/jugadores/'));
  const enPantalla = await p.evaluate(() => { const r = document.getElementById('tosFabMenu').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; });
  revisa('[Presidencia] en el teléfono el menú cabe en la pantalla', enPantalla);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(260);
  revisa('[Presidencia] Escape lo cierra', await p.isHidden('#tosFabMenu'));
  await p.click('#tosFab'); await p.waitForTimeout(260);
  await p.mouse.click(30, 200); await p.waitForTimeout(260);
  revisa('[Presidencia] tocar el fondo lo cierra', await p.isHidden('#tosFabMenu'));
  const scroll = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  revisa('[Presidencia] sin scroll horizontal', scroll);
  await p.close();
}

/* ---------- Taquilla: ve cumpleaños, botón sólo con lo suyo ---------- */
{
  const p = await abre('Taquilla', { miFecha: '1995-01-01' });
  revisa('[Taquilla] también ve la franja de cumpleaños', await p.isVisible('#cumpleStrip'));
  const chips = await p.$$eval('#cumpleStrip .tcs-chip', els => els.map(e => e.tagName));
  revisa('[Taquilla] sin permiso de Jugadores, nadie es enlace', chips.length === 3 && chips.every(t => t === 'SPAN'), JSON.stringify(chips));
  revisa('[Taquilla] con su fecha dada no se le pregunta', (await p.$$('#cumpleAsk')).length === 0);
  await p.click('#tosFab'); await p.waitForTimeout(260);
  const acciones = await p.$$eval('#tosFabMenu .tos-fab-item strong', els => els.map(e => e.textContent.trim()));
  revisa('[Taquilla] sin permiso de Tienda ni Estacionamiento, sólo cobrar y pagar', JSON.stringify(acciones) === JSON.stringify(ROLES.Taquilla.espera), JSON.stringify(acciones));
  await p.close();
}

/* ---------- Profe: nadie cumple, ya dio su fecha ---------- */
{
  const p = await abre('Formadores', { gente: [], miFecha: '1988-06-02', ancho: 1180 });
  revisa('[Formadores] si nadie cumple, la franja no ocupa lugar', await p.isHidden('#cumpleStrip'));
  await p.click('#tosFab'); await p.waitForTimeout(260);
  const acciones = await p.$$eval('#tosFabMenu .tos-fab-item strong', els => els.map(e => e.textContent.trim()));
  revisa('[Formadores] asistencia, convocatoria y mensaje', JSON.stringify(acciones) === JSON.stringify(ROLES.Formadores.espera), JSON.stringify(acciones));
  const pos = await p.evaluate(() => { const m = document.getElementById('tosFabMenu').getBoundingClientRect(), b = document.getElementById('tosFab').getBoundingClientRect(); return { flota: m.width < 400, encima: m.bottom <= b.top + 1 }; });
  revisa('[Formadores] en iPad/compu el menú flota sobre el botón', pos.flota && pos.encima, JSON.stringify(pos));
  await p.screenshot({ path: path.join(RAIZ, 'docs/evidencias/inicio-boton-rapido.png') });
  await p.close();
}

/* ---------- "Ahora no" calla la pregunta ---------- */
{
  const p = await abre('Taquilla', { gente: [] });
  revisa('[Ahora no] sin cumpleaños pero sin fecha, sólo sale la pregunta', await p.isVisible('#cumpleAsk') && (await p.$$('#cumpleStrip .tcs-chip')).length === 0);
  await p.click('#cumpleLuego'); await p.waitForTimeout(100);
  revisa('[Ahora no] la franja se va', await p.isHidden('#cumpleStrip'));
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#appView:not(.hidden)', { timeout: 8000 });
  await p.waitForFunction(() => window.__llamadas.some(l => l.name === 'v2_birthdays'), null, { timeout: 6000 });
  await p.waitForTimeout(250);
  revisa('[Ahora no] al recargar ya no pregunta', await p.isHidden('#cumpleStrip'));
  await p.close();
}

await navegador.close(); srv.close();
let mal = 0;
for (const r of revisiones) { if (!r.ok) { mal++; console.error(` - ${r.nombre}${r.detalle ? ' :: ' + r.detalle : ''}`); } }
if (errores.length) { console.error('ERRORES DEL NAVEGADOR:'); errores.forEach(e => console.error('   ' + e)); }
if (mal || errores.length) { console.error(`Inicio humo FAILED · ${mal} de ${revisiones.length}, ${errores.length} errores`); process.exit(1); }
console.log(`Inicio humo OK · ${revisiones.length} revisiones: cumpleaños para todo el club y botón de acciones rápidas por rol`);
