/* LA ENTRADA EN IPHONE: SIN NIEBLA GRIS ARRIBA (19/10/2026).
 *
 * Captura de iPhone: en "Bienvenido a casa, Tanner." la franja de la hora se
 * veía con un difuminado gris claro sobre el azul. iOS pinta esa franja con el
 * fondo de la PÁGINA (html/body), no con el de la sección, y la página era
 * gris claro. Con la franja simulada (47px) se revisa que, mientras se ve la
 * entrada, la página sea azul noche como theme-color, que el escudo quede
 * debajo de la hora y que nada se salga a 390px.
 */
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const T = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.webmanifest':'application/json' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('no'); return; }
  r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); });
await new Promise(r => srv.listen(4781, r));

const nav = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const revisiones = []; const revisa = (n, ok, d = '') => revisiones.push({ n, ok, d });
const pg = await nav.newPage({ viewport: { width: 390, height: 844 } });
const errores = []; pg.on('pageerror', e => errores.push(e.message));
await pg.addInitScript(() => { window.__fake = { auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange(){ return { data:{ subscription:{ unsubscribe(){} } } }; } }, rpc: async () => ({ data: null, error: null }) }; });
await pg.route('**/v2/supabase-client.js', r => r.fulfill({ status:200, contentType:'text/javascript', body:'export function createClient(){ return window.__fake; }' }));
await pg.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
const cdp = await pg.context().newCDPSession(pg);
let simulado = true;
try { await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 47, bottom: 34 } }); } catch (e) { simulado = false; }
await pg.goto('http://127.0.0.1:4781/', { waitUntil: 'networkidle' }).catch(() => {});
await pg.waitForSelector('.tc-entrada', { timeout: 8000 });
await pg.waitForTimeout(400);
const theme = await pg.getAttribute('meta[name="theme-color"]', 'content');
const m = await pg.evaluate(() => ({
  html: getComputedStyle(document.documentElement).backgroundColor, body: getComputedStyle(document.body).backgroundColor,
  escudo: Math.round(document.querySelector('.tc-escudo').getBoundingClientRect().top), ancho: document.documentElement.scrollWidth }));
const rgb = h => `rgb(${parseInt(h.slice(1,3),16)}, ${parseInt(h.slice(3,5),16)}, ${parseInt(h.slice(5,7),16)})`;
revisa('[entrada] la página detrás es azul noche, como theme-color (sin niebla gris)', m.html === rgb(theme) && m.body === rgb(theme), JSON.stringify({ theme, ...m }));
if (simulado) revisa('[entrada] el escudo queda debajo de la hora, con aire', m.escudo >= 47 + 12, JSON.stringify(m));
revisa('[entrada] nada se sale a 390px', m.ancho <= 391, JSON.stringify(m));
revisa('[entrada] sin errores', errores.length === 0, errores.join(' | '));
await nav.close(); srv.close();

let mal = 0; for (const r of revisiones) if (!r.ok) { mal++; console.error(` - ${r.n}${r.d ? ' :: ' + r.d : ''}`); }
if (mal) { console.error(`Entrada humo FAILED · ${mal} de ${revisiones.length}`); process.exit(1); }
console.log(`Entrada humo OK · ${revisiones.length} revisiones: la franja de la hora azul noche, sin niebla gris`);
