/* SIN SEÑAL, EL INICIO NO SALE "EN CRUDO" (19/11/2026).
 *
 * Presidencia mandó captura del inicio con letras con serif, el logo con
 * signo de interrogación e íconos gigantes. Con señal mala, sw.js servía el
 * HTML guardado del inicio, pero sus estilos, fuentes e imágenes no estaban
 * guardados y también dependían de la red.
 *
 * Esta prueba construye el sitio (dist/), lo sirve en 127.0.0.1, abre el
 * inicio con el service worker real, corta la red y recarga:
 *   1. El inicio sale con sus estilos (fondo azul de la entrada, sin serif).
 *   2. El escudo y el wordmark cargan (no el signo de interrogación).
 *   3. Los archivos con huella se guardaron en su propia caché.
 *   4. Con red, nada cambia: el HTML sigue viniendo de la red.
 */
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { execFileSync } from 'node:child_process';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
execFileSync(process.execPath, [path.join(RAIZ, 'scripts/construir.mjs')], { stdio: 'ignore' });
const DIST = path.join(RAIZ, 'dist');
const T = { '.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png','.woff2':'font/woff2','.webmanifest':'application/manifest+json' };
let pedidosHtml = 0, apagado = false;
const srv = http.createServer((q, r) => {
  // "Sin señal": el servidor no contesta (setOffline de Chromium no corta las
  // peticiones del service worker, así que se apaga la red de verdad).
  if (apagado) { q.socket.destroy(); return; }
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(DIST, p);
  if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('no'); return; }
  if (p.endsWith('.html')) pedidosHtml++;
  r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}`;

let fallos = 0, corridas = 0;
const revisa = (n, ok, d) => { corridas++; if (!ok) { fallos++; console.error(` - ${n}${d !== undefined ? `\n   ${typeof d === 'string' ? d : JSON.stringify(d)}` : ''}`); } };

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
// Nada sale de 127.0.0.1 (Supabase y analítica no se alcanzan, a propósito).
await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
const pg = await ctx.newPage();

const estado = () => pg.evaluate(() => {
  const h = document.querySelector('.tc-titular'), esc = document.querySelector('.tc-escudo'), wm = document.querySelector('.tc-wordmark');
  const ent = document.querySelector('.tc-entrada');
  return {
    fuente: h ? getComputedStyle(h).fontFamily : '',
    fondo: ent ? getComputedStyle(ent).backgroundImage : '',
    escudo: esc ? esc.complete && esc.naturalWidth > 0 : false,
    wordmark: wm ? wm.complete && wm.naturalWidth > 0 : false,
    icono: (() => { const s = document.querySelector('.tc-icono svg'); return s ? Math.round(s.getBoundingClientRect().width) : 0; })()
  };
});

await pg.goto(`${BASE}/`, { waitUntil: 'load' });
// Espera a que el service worker tome la página y guarde los archivos.
await pg.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => {});
if (!(await pg.evaluate(() => !!navigator.serviceWorker.controller))) { await pg.reload({ waitUntil: 'load' }); await pg.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => {}); }
revisa('el service worker controla el inicio', await pg.evaluate(() => !!navigator.serviceWorker.controller));
// Una recarga con el service worker al mando: así guarda el inicio y sus archivos.
await pg.reload({ waitUntil: 'load' });
await pg.waitForFunction(async () => { const c = await caches.open('tanneros-archivos-v1'); const k = await c.keys(); return k.some(r => r.url.includes('entrada.css')) && k.some(r => r.url.includes('crest-gold.png')); }, null, { timeout: 15000 }).catch(() => {});
const guardados = await pg.evaluate(async () => (await (await caches.open('tanneros-archivos-v1')).keys()).map(r => new URL(r.url).pathname));
revisa('3. se guardaron los estilos, fuentes e imágenes del inicio', ['/v2/entrada.css', '/v2/styles.css', '/brand/crest-gold.png', '/brand/wordmark-gold.png'].every(u => guardados.includes(u)), guardados.slice(0, 20));
const conRed = await estado();
revisa('con red: el inicio sale con su estilo', !/serif/i.test(conRed.fuente.replace(/sans-serif/gi, '')) && /gradient/.test(conRed.fondo), conRed);

/* ---------- Sin señal ---------- */
const htmlAntes = pedidosHtml;
apagado = true;
await pg.reload({ waitUntil: 'load' }).catch(() => {});
await pg.waitForTimeout(600);
const sinRed = await estado();
revisa('1. sin señal, el inicio sale con sus estilos (fondo azul, sin serif)', /gradient/.test(sinRed.fondo) && !/serif/i.test(sinRed.fuente.replace(/sans-serif/gi, '')), sinRed);
revisa('2. sin señal, el escudo y el wordmark cargan', sinRed.escudo && sinRed.wordmark, sinRed);
revisa('1. los íconos de las puertas miden lo de siempre (no gigantes)', sinRed.icono > 0 && sinRed.icono <= 32, sinRed.icono);
revisa('sin señal, el HTML viene del guardado (no llegó al servidor)', pedidosHtml === htmlAntes, { antes: htmlAntes, despues: pedidosHtml });

/* ---------- Con red otra vez ---------- */
apagado = false;
await pg.reload({ waitUntil: 'load' });
revisa('4. con red, el HTML vuelve a venir del servidor', pedidosHtml > htmlAntes);

await browser.close(); srv.close();
console.log(fallos ? `Sin señal FAILED · ${fallos} de ${corridas}` : `Sin señal OK · ${corridas} revisiones: el inicio guardado trae sus estilos, fuentes e imágenes; con red, todo viene del servidor`);
process.exit(fallos ? 1 : 0);
