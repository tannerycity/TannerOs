/* Banner de cookies de www.tannerycity.com (02/11/2026).
 *
 * El banner vive en GTM (GTM-5H8QT73B); su copia versionada es
 * docs/medicion/www/banner-cookies.html. Auditoría: "Sólo necesarias" debía
 * bloquear, el enlace permanente "Cookies" debía reabrir preferencias y
 * revocar debía borrar las cookies propias de GA. Lo que se protege:
 *   1. Primera visita: todo en denied, banner visible y con foco; nada concedido.
 *   2. "Aceptar" y "Sólo necesarias" con el mismo peso visual.
 *   3. Aceptar: analytics_storage granted y evento tc_cookies (GA4 lo escucha);
 *      la publicidad nunca se concede.
 *   4. El enlace "Cookies" del pie (y la dirección con #cookies) reabre.
 *   5. Revocar tras aceptar: borra _ga, _ga_* y _gid del dominio y del dominio
 *      padre, deja las demás cookies, recarga y queda en denied.
 *   6. "Sólo necesarias" desde el inicio: denied, sin recargar.
 *   7. El banner no pide nada a ningún servidor; es ES5 (GTM HTML).
 *
 * Hermética: un dominio de prueba resuelto a 127.0.0.1; nada sale a internet.
 */
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const html = fs.readFileSync(path.join(RAIZ, 'docs/medicion/www/banner-cookies.html'), 'utf8');
const SNIPPET = /^<script>[\s\S]*^<\/script>$/m.exec(html)[0]; // la etiqueta que se pega en GTM, sin el comentario
const AVISO = /var AVISO = '([^']+)'/.exec(SNIPPET)[1];
const PAGINA = `<!doctype html><html lang="es-MX"><head><meta charset="utf-8"><title>Tannery City</title>${SNIPPET}</head>
<body><main><h1>Tannery City</h1><a id="wa" href="https://wa.me/524792651338">Agenda por WhatsApp</a></main>
<footer><a id="pie-cookies" href="__BASE__/#cookies">Cookies</a></footer></body></html>`;

// Cualquier ruta sirve la misma página; el pie enlaza a la portada con #cookies, como lo hace GoDaddy.
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(PAGINA.replace('__BASE__', BASE)); });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const HOST = 'www.tannerycity.test', BASE = `http://${HOST}:${srv.address().port}`;

const nav = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', `--host-resolver-rules=MAP ${HOST} 127.0.0.1`] });
let fallos = 0, corridas = 0;
const revisa = (nombre, ok, detalle) => { corridas++; if (!ok) { fallos++; console.error(` - ${nombre}${detalle ? `\n   ${detalle}` : ''}`); } };

async function abre(ruta = '/') {
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  const errs = [], fuera = [];
  pg.on('pageerror', e => errs.push(e.message));
  await pg.route('**/*', r => { const u = new URL(r.request().url()); if (u.hostname === HOST) return r.continue(); fuera.push(u.href); return r.abort(); });
  await pg.goto(BASE + ruta, { waitUntil: 'load' });
  return { ctx, pg, errs, fuera };
}
// Lo que el banner mandó a la capa de datos: consentimientos y eventos.
const capa = pg => pg.evaluate(() => (window.dataLayer || []).map(x => {
  if (x && typeof x === 'object' && !Array.isArray(x) && 'event' in x) return { event: x.event, v: x.tc_cookies };
  const a = Array.from(x); return { tipo: a[0], modo: a[1], datos: a[2] };
}));
const concedio = c => c.some(x => x.tipo === 'consent' && Object.values(x.datos || {}).includes('granted'));
const visible = pg => pg.isVisible('#tc-cookies');

{
  const { ctx, pg, errs, fuera } = await abre();
  const c = await capa(pg);
  const def = c.find(x => x.tipo === 'consent' && x.modo === 'default');
  revisa('1. primera visita: los cuatro consentimientos en denied', def && ['analytics_storage', 'ad_storage', 'ad_user_data', 'ad_personalization'].every(k => def.datos[k] === 'denied'), JSON.stringify(def));
  revisa('1. primera visita: nada concedido ni evento tc_cookies', !concedio(c) && !c.some(x => x.event === 'tc_cookies'), JSON.stringify(c));
  revisa('1. el banner se ve y recibe el foco', await visible(pg) && await pg.evaluate(() => document.activeElement?.id) === 'tc-cookies');
  revisa('1. el banner enlaza al aviso de privacidad', await pg.getAttribute('#tc-cookies a', 'href') === AVISO);
  const estilo = await pg.$$eval('#tc-cookies button', bs => bs.map(b => { const s = getComputedStyle(b), r = b.getBoundingClientRect();
    return { bg: s.backgroundColor, color: s.color, peso: s.fontWeight, tam: s.fontSize, alto: Math.round(r.height), ancho: Math.round(r.width) }; }));
  revisa('2. Aceptar y Sólo necesarias con el mismo peso visual', estilo.length === 2 && JSON.stringify(estilo[0]) === JSON.stringify(estilo[1]), JSON.stringify(estilo));

  await pg.click('#tc-cookies [data-v="si"]');
  const c2 = await capa(pg);
  revisa('3. Aceptar concede sólo analítica y avisa con tc_cookies', c2.some(x => x.tipo === 'consent' && x.modo === 'update' && x.datos.analytics_storage === 'granted')
    && c2.some(x => x.event === 'tc_cookies' && x.v === 'si') && !c2.some(x => x.tipo === 'consent' && (x.datos.ad_storage === 'granted' || x.datos.ad_user_data === 'granted' || x.datos.ad_personalization === 'granted')), JSON.stringify(c2));
  revisa('3. Aceptar cierra el banner y lo recuerda', !(await visible(pg)) && await pg.evaluate(() => localStorage.getItem('tc_cookies_v1')) === 'si');

  await pg.reload({ waitUntil: 'load' });
  const c3 = await capa(pg);
  revisa('3. al volver, sin banner y con analítica concedida desde el inicio', !(await visible(pg)) && c3.some(x => x.event === 'tc_cookies' && x.v === 'si') && concedio(c3));

  await pg.goto(BASE + '/contacto', { waitUntil: 'load' });
  await pg.click('#pie-cookies');
  await pg.waitForTimeout(300);
  revisa('4. el enlace Cookies del pie reabre el banner sin sacarte de la página donde estás', await visible(pg) && new URL(pg.url()).pathname === '/contacto', pg.url());

  // GA4 ya dejó sus cookies: en el dominio padre (como GA real) y en el host.
  await ctx.addCookies([
    { name: '_ga', value: 'GA1.1.111.222', domain: '.tannerycity.test', path: '/' },
    { name: '_ga_H485DE37EF', value: 'GS1.1.333', domain: '.tannerycity.test', path: '/' },
    { name: '_gid', value: 'GA1.1.444', domain: HOST, path: '/' },
    { name: 'otra', value: 'se-queda', domain: '.tannerycity.test', path: '/' }]);
  await Promise.all([pg.waitForEvent('load'), pg.click('#tc-cookies [data-v="no"]')]);
  const nombres = (await ctx.cookies(BASE)).map(k => k.name);
  revisa('5. revocar borra _ga, _ga_* y _gid (dominio padre y host)', !nombres.some(n => n === '_ga' || n === '_gid' || n.startsWith('_ga_')), nombres.join(','));
  revisa('5. revocar no toca las demás cookies', nombres.includes('otra'), nombres.join(','));
  const c4 = await capa(pg);
  revisa('5. tras revocar: recarga en denied, sin conceder nada y sin banner', !concedio(c4) && c4.some(x => x.event === 'tc_cookies' && x.v === 'no') && !(await visible(pg))
    && await pg.evaluate(() => localStorage.getItem('tc_cookies_v1')) === 'no', JSON.stringify(c4));
  revisa('7. el banner no pidió nada fuera del sitio', !fuera.length, fuera.join(' '));
  revisa('sin errores de página (aceptar y revocar)', !errs.length, errs.join(' | '));
  await ctx.close();
}

{
  const { ctx, pg, errs } = await abre('/#cookies');
  revisa('4. la dirección con #cookies abre el banner', await visible(pg));
  await pg.click('#tc-cookies [data-v="no"]');
  await pg.waitForTimeout(300);
  const c = await capa(pg);
  revisa('6. Sólo necesarias desde el inicio: denied y tc_cookies "no"', !concedio(c) && c.some(x => x.event === 'tc_cookies' && x.v === 'no'), JSON.stringify(c));
  revisa('6. sin recargar y sin #cookies en la dirección', !(await visible(pg)) && !pg.url().includes('#cookies'));
  await pg.goto(BASE + '/#cookies', { waitUntil: 'load' });
  revisa('4. se puede volver a abrir cuantas veces haga falta', await visible(pg));
  revisa('sin errores de página (sólo necesarias)', !errs.length, errs.join(' | '));
  await ctx.close();
}

const codigo = SNIPPET.replace(/<\/?script>/g, '');
revisa('7. el banner es ES5 (sin =>, let, const, ni plantillas)', !/=>|\blet\s|\bconst\s|`/.test(codigo));
revisa('7. el banner no carga scripts ni pide URLs', !/fetch\(|XMLHttpRequest|createElement\(['"]script|sendBeacon|new Image/.test(codigo));

await nav.close(); srv.close();
console.log(fallos ? `Banner www humo FAILED · ${fallos} de ${corridas}` : `Banner www humo OK · ${corridas} revisiones: denied al inicio, mismo peso, aceptar, enlace Cookies, revocar borra _ga y recarga, sólo necesarias`);
process.exit(fallos ? 1 : 0);
