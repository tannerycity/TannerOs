/* La entrada con la sesión abierta (04/11/2026).
 *
 * Presidencia: "siempre que estamos en el club, cuando ingresamos y queremos
 * tocar en el inicio, nos abre luego la aplicación porque ya tenemos nuestra
 * cuenta... hay ocasiones donde no queremos que eso pase... les sugiero que
 * entren en modo incógnito, pero no quiero que eso siga pasando".
 *
 * Lo que se protege (index.html + v2/app.js + v2/entrada-sesion.js REALES,
 * con un Supabase falso con sesión):
 *   1. Quien llega de fuera (escribió la dirección, una liga de WhatsApp) ve
 *      las puertas aunque tenga sesión. "Staff" dice "Entrar al vestidor" y
 *      no se pide contraseña.
 *   2. Un toque en "Entrar al vestidor" abre el vestidor, sin login, y la
 *      dirección queda en /?vestidor.
 *   3. Entra directo (como antes) si viene de dentro de la app o si
 *      la liga trae ?vestidor o #staff. La app instalada ya enseña las puertas.
 *   4. "¿No eres tú? Cerrar sesión" cierra la sesión y la puerta vuelve a
 *      ser "Staff".
 *   5. Sin sesión, todo como siempre.
 *   6. entraDirecto(), probada sola con cada caso.
 *   7. "Cerré la ventana y la volví a abrir y no deja entrar": si el service
 *      worker o la sesión guardada no contestan, en segundos se ven las
 *      puertas y "Staff" abre el login.
 */
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { entraDirecto } from '../v2/entrada-sesion.js';

let fallos = 0, corridas = 0;
const revisa = (nombre, ok, detalle) => { corridas++; if (!ok) { fallos++; console.error(` - ${nombre}${detalle ? `\n   ${detalle}` : ''}`); } };

// 6. La regla, sola.
const L = (ruta) => new URL(`https://app.tannerycity.com${ruta}`);
revisa('6. escribió la dirección: puertas', entraDirecto({ loc: L('/'), referrer: '' }) === false);
revisa('6. liga de WhatsApp: puertas', entraDirecto({ loc: L('/'), referrer: 'https://wa.me/' }) === false);
revisa('6. www.tannerycity.com no cuenta como "dentro": puertas', entraDirecto({ loc: L('/'), referrer: 'https://www.tannerycity.com/' }) === false);
revisa('6. desde dentro de la app: directo', entraDirecto({ loc: L('/'), referrer: 'https://app.tannerycity.com/v2/pedidos/' }) === true);
revisa('6. app instalada al abrirla: puertas (Centro Tanner e Inscripción a la mano)', entraDirecto({ loc: L('/'), referrer: '' }) === false);
revisa('6. ?vestidor: directo', entraDirecto({ loc: L('/?vestidor'), referrer: '' }) === true);
revisa('6. #staff: directo', entraDirecto({ loc: L('/#staff'), referrer: '' }) === true);
revisa('6. referrer roto: puertas', entraDirecto({ loc: L('/'), referrer: 'no es url' }) === false);

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const T = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png','.woff2':'font/woff2' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('no'); return; }
  r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
  r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}`;
const nav = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

async function abre(ruta, { sesion = true, referer, instalada = false, colgado = false } = {}) {
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  await pg.addInitScript(({ sesion, instalada, colgado }) => {
    if (colgado && navigator.serviceWorker) { const nunca = () => new Promise(() => {}); navigator.serviceWorker.getRegistrations = nunca; navigator.serviceWorker.register = nunca; }
    window.__salio = false; window.__oyentes = [];
    if (instalada) { const mm = window.matchMedia.bind(window); window.matchMedia = q => /display-mode: standalone/.test(q) ? { matches: true, media: q, addEventListener(){}, removeEventListener(){} } : mm(q); }
    const R = {
      v2_my_context: [{ user_id: 'u-mich', display_name: 'Mich', organization_id: 'o1', organization_name: 'Tannery City FC', role: 'Presidencia', is_owner: true }],
      v2_my_navigation: [], v2_birthdays: { today: '2026-11-04', myBirthDate: '1990-01-01', people: [] }, v2_ideas: { me: 'u-mich', ideas: [] }
    };
    let s = sesion ? { user: { id: 'u-mich', user_metadata: { full_name: 'Michel Enríquez' } } } : null;
    window.__fakeSupabase = {
      auth: {
        getSession: colgado ? () => new Promise(() => {}) : async () => ({ data: { session: s } }),
        getUser: async () => ({ data: { user: s ? { id: 'u-mich', app_metadata: {} } : null } }),
        onAuthStateChange: (cb) => { window.__oyentes.push(cb); return { data: { subscription: { unsubscribe(){} } } }; },
        signInWithPassword: async () => { window.__entro = true; return { data: {}, error: null }; },
        signOut: async () => { window.__salio = true; s = null; window.__oyentes.forEach(cb => cb('SIGNED_OUT', null)); return { error: null }; }
      },
      rpc: async (name) => ({ data: R[name] ?? null, error: null }),
      channel: () => ({ on(){ return this; }, subscribe(){ return this; } }), removeChannel(){}
    };
  }, { sesion, instalada, colgado });
  await pg.route('**/v2/supabase-client.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'export function createClient(){ return window.__fakeSupabase; }' }));
  await pg.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await pg.goto(BASE + ruta, { waitUntil: 'domcontentloaded', ...(referer ? { referer } : {}) });
  await pg.waitForTimeout(900);
  return { ctx, pg, errs };
}
const enVestidor = pg => pg.isVisible('#appView');
const enPuertas = pg => pg.isVisible('.tc-puertas');
const staff = pg => pg.$eval('#abreStaff', b => `${b.querySelector('b').textContent}|${b.querySelector('small').textContent}`);

// 1 y 2. De fuera con sesión: puertas; un toque entra.
{
  const { ctx, pg, errs } = await abre('/');
  if (process.env.SHOTS) await pg.screenshot({ path: `${process.env.SHOTS}/entrada-con-sesion.png`, fullPage: true });
  revisa('1. de fuera con sesión: se ven las puertas, no el vestidor', await enPuertas(pg) && !(await enVestidor(pg)));
  revisa('1. "Staff" dice "Entrar al vestidor" con el nombre', /^Entrar al vestidor\|Sesión abierta: Michel\. Un toque y entras$/.test(await staff(pg)), await staff(pg));
  revisa('1. sale "¿No eres tú? Cerrar sesión"', await pg.isVisible('.tc-sesion-salir'));
  revisa('1. las demás puertas siguen ahí (Familias, Tienda, Inscribe, Centro Tanner)', (await pg.$$eval('.tc-puerta b', b => b.map(x => x.textContent))).slice(0, 4).join() === 'Familias,Tienda,Inscribe a tu hijo,Centro Tanner');
  await pg.click('#abreStaff');
  await pg.waitForSelector('#appView:not(.hidden)', { timeout: 6000 }).catch(() => {});
  revisa('2. un toque entra al vestidor sin pedir contraseña', await enVestidor(pg) && !(await pg.isVisible('#authForm')));
  revisa('2. la dirección queda en /?vestidor', new URL(pg.url()).search === '?vestidor', pg.url());
  revisa('sin errores (de fuera)', !errs.length, errs.join(' | '));
  await ctx.close();
}
// 3. Entra directo.
for (const [nombre, ruta, op] of [['?vestidor', '/?vestidor', {}], ['#staff', '/#staff', {}], ['desde dentro de la app', '/', { referer: `${BASE}/v2/pedidos/` }]]) {
  const { ctx, pg, errs } = await abre(ruta, op);
  await pg.waitForSelector('#appView:not(.hidden)', { timeout: 6000 }).catch(() => {});
  revisa(`3. ${nombre}: entra directo al vestidor`, await enVestidor(pg) && !(await enPuertas(pg)));
  revisa(`sin errores (${nombre})`, !errs.length, errs.join(' | '));
  await ctx.close();
}
// 3b. App instalada (08/11/2026): al abrirla, puertas; el vestidor a un toque.
{
  const { ctx, pg, errs } = await abre('/', { instalada: true });
  revisa('3b. app instalada: se ven las puertas con Centro Tanner e Inscribe', await enPuertas(pg) && !(await enVestidor(pg)) && /Centro Tanner/.test(await pg.textContent('.tc-puertas')) && /Inscribe/.test(await pg.textContent('.tc-puertas')));
  revisa('3b. app instalada: "Entrar al vestidor" con un toque', /^Entrar al vestidor/.test(await staff(pg)));
  await pg.click('#abreStaff');
  await pg.waitForSelector('#appView:not(.hidden)', { timeout: 6000 }).catch(() => {});
  revisa('3b. app instalada: entra sin contraseña', await enVestidor(pg) && !(await pg.isVisible('#authForm')));
  revisa('sin errores (app instalada)', !errs.length, errs.join(' | '));
  await ctx.close();
}
// 4. Cerrar sesión desde las puertas.
{
  const { ctx, pg, errs } = await abre('/');
  await pg.click('.tc-sesion-salir');
  await pg.waitForTimeout(400);
  revisa('4. "Cerrar sesión" cierra la sesión', await pg.evaluate(() => window.__salio));
  revisa('4. la puerta vuelve a ser "Staff" y no queda la nota', (await staff(pg)) === 'Staff|Acceso del equipo del club' && !(await pg.$('.tc-sesion-nota')));
  await pg.click('#abreStaff');
  revisa('4. y "Staff" abre el login', await pg.isVisible('#authForm'));
  revisa('sin errores (cerrar sesión)', !errs.length, errs.join(' | '));
  await ctx.close();
}
// 5. Sin sesión: como siempre.
{
  const { ctx, pg, errs } = await abre('/', { sesion: false });
  revisa('5. sin sesión: puertas con "Staff"', await enPuertas(pg) && (await staff(pg)) === 'Staff|Acceso del equipo del club' && !(await pg.$('.tc-sesion-nota')));
  await pg.click('#abreStaff');
  revisa('5. "Staff" abre el login', await pg.isVisible('#authForm'));
  revisa('sin errores (sin sesión)', !errs.length, errs.join(' | '));
  await ctx.close();
}
// 7. El iPhone no contesta al reabrir: no se queda trabado.
{
  const { ctx, pg, errs } = await abre('/', { colgado: true });
  await pg.waitForTimeout(6500);
  revisa('7. con el service worker y la sesión colgados, se ven las puertas', await enPuertas(pg));
  await pg.click('#abreStaff');
  revisa('7. y "Staff" abre el login', await pg.isVisible('#authForm'));
  await pg.fill('#email', 'mich@tannerycity.com'); await pg.fill('#password', 'contrasena-larga');
  await pg.press('#password', 'Enter');
  await pg.waitForTimeout(800);
  revisa('7. y "Entrar" sí intenta entrar (antes se quedaba trabado)', await pg.evaluate(() => window.__entro === true));
  revisa('sin errores (colgado)', !errs.length, errs.join(' | '));
  await ctx.close();
}
await nav.close(); srv.close();
if (fallos) { console.error(`Entrada con sesión humo: ${fallos} de ${corridas} fallaron`); process.exit(1); }
console.log(`Entrada con sesión humo OK · ${corridas} revisiones: puertas aunque haya sesión, entrar en un toque, directo desde dentro, puertas en la app instalada, cerrar sesión`);
