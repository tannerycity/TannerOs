/* GESTOS DE TODA LA APP (25/11/2026) en Chromium, con toques de dedo reales.
 * Presidencia: "pull-to-refresh con un loader animado... en toda la app...
 * sí pon la T del club" y "segmented control... con el fondo que se desliza".
 *   1. Jalar poquito no actualiza; la burbuja regresa.
 *   2. Jalar lo suficiente: la T crece, el aro se llena, al soltar gira y la
 *      pantalla se actualiza una sola vez; luego la burbuja se va.
 *   3. Con la página bajada, o con una hoja abierta, jalar no hace nada.
 *   4. El selector deslizante: la pastilla va al elegido y se mueve al cambiar,
 *      también si la pantalla vuelve a pintar los botones.
 *   5. La lógica (resistencia del jalón y posición de la pastilla) sin navegador.
 */
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { progresoDe, UMBRAL, MAXIMO } from '../v2/jalar.js';
import { posicionDe } from '../v2/segmento.js';

let fallos = 0, corridas = 0;
const revisa = (n, ok, d) => { corridas++; if (!ok) { fallos++; console.error(` - ${n}${d ? `\n   ${d}` : ''}`); } };

// 5. Sin navegador.
revisa('5. sin jalar no hay nada', progresoDe(0).y === 0 && progresoDe(-30).p === 0 && !progresoDe(0).listo);
revisa('5. jalar poquito no alcanza', !progresoDe(40).listo && progresoDe(40).p < 1);
revisa('5. jalar lo suficiente sí', progresoDe(140).listo && progresoDe(140).p === 1);
revisa('5. con resistencia: nunca pasa del máximo', progresoDe(5000).y <= MAXIMO && progresoDe(5000).y > UMBRAL);
revisa('5. más jalón, más baja (sin brincos)', progresoDe(60).y < progresoDe(80).y && progresoDe(80).y < progresoDe(120).y);
const pp = posicionDe({ left: 10, top: 5, width: 300, height: 40 }, { left: 110, top: 8, width: 90, height: 34 });
revisa('5. la pastilla se mide contra su grupo', pp.x === 100 && pp.w === 90 && pp.y === 3 && pp.h === 34, JSON.stringify(pp));
revisa('5. sin botón no hay pastilla', posicionDe(null, {}) === null);

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const PAGINA = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;font-family:sans-serif">
<div style="padding:16px"><div id="seg" data-segmento role="group"><button aria-pressed="true" data-k="a">Mes</button><button aria-pressed="false" data-k="b">Tres meses</button><button aria-pressed="false" data-k="c">Año</button></div></div>
<div style="height:3000px;padding:16px">Lista larga</div>
<script>window.__tosJalarSiempre=true;window.__veces=0;window.tosAlActualizar=()=>new Promise(r=>{window.__veces++;setTimeout(r,400);});</script>
<script type="module">import {jalarParaActualizar} from '/v2/jalar.js';import {segmentos} from '/v2/segmento.js';jalarParaActualizar();segmentos();
document.getElementById('seg').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;document.querySelectorAll('#seg button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));});window.__listo=1;</script>`;
const srv = http.createServer((q, r) => {
  const p = decodeURIComponent(q.url.split('?')[0]);
  if (p === '/__gestos.html') { r.writeHead(200, { 'content-type': 'text/html' }); r.end(PAGINA); return; }
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : 'text/plain' }); r.end(fs.readFileSync(f));
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const nav = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const ctxNav = await nav.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
const pg = await ctxNav.newPage();
const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
await pg.goto(`http://127.0.0.1:${srv.address().port}/__gestos.html`);
await pg.waitForFunction(() => window.__listo === 1);
const cdp = await ctxNav.newCDPSession(pg);
const toque = (type, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 195, y }] });
async function jala(dy, { soltar = true } = {}) {
  await toque('touchStart', 200);
  for (let i = 1; i <= 10; i++) { await toque('touchMove', 200 + (dy * i) / 10); await pg.waitForTimeout(16); }
  if (soltar) await toque('touchEnd', 200 + dy);
}
const burbuja = () => pg.evaluate(() => { const b = document.querySelector('.tos-jalar'); return b ? { op: b.style.opacity, tr: b.style.transform, gira: b.classList.contains('girando'), lleno: document.querySelector('.tos-jalar .lleno').style.strokeDashoffset, t: document.querySelector('.tos-jalar .t').style.transform } : null; });

revisa('la burbuja con la T del club existe', !!(await pg.$('.tos-jalar img.t[src="/brand/crest-navy.png"]')));
// 1. Poquito
await jala(50, { soltar: false });
const poco = await burbuja();
revisa('1. jalando se ve la burbuja y la T crece', poco.op === '1' && /scale\(0\.[6-9]/.test(poco.t), JSON.stringify(poco));
await toque('touchEnd', 250); await pg.waitForTimeout(500);
revisa('1. poquito no actualiza y la burbuja regresa', (await pg.evaluate(() => window.__veces)) === 0 && (await burbuja()).op === '0');
// 2. Suficiente
await jala(260, { soltar: false });
const lleno = await burbuja();
revisa('2. el aro se llena y la T queda completa', Number(lleno.lleno) === 0 && /scale\(1\)/.test(lleno.t), JSON.stringify(lleno));
await toque('touchEnd', 460); await pg.waitForTimeout(80);
revisa('2. al soltar gira mientras actualiza', (await burbuja()).gira && (await pg.evaluate(() => window.__veces)) === 1);
await pg.waitForTimeout(900);
revisa('2. termina: una sola actualización y la burbuja se va', (await pg.evaluate(() => window.__veces)) === 1 && !(await burbuja()).gira && (await burbuja()).op === '0');
// 3. Bajado / hoja abierta
await pg.evaluate(() => window.scrollTo(0, 600)); await pg.waitForTimeout(100);
await jala(260); await pg.waitForTimeout(500);
revisa('3. con la página bajada no actualiza', (await pg.evaluate(() => window.__veces)) === 1);
await pg.evaluate(() => { window.scrollTo(0, 0); const d = document.createElement('div'); d.className = 'tosdlg'; d.style.cssText = 'position:fixed;inset:0'; document.body.appendChild(d); });
await jala(260); await pg.waitForTimeout(500);
revisa('3. con una hoja abierta no actualiza', (await pg.evaluate(() => window.__veces)) === 1);
await pg.evaluate(() => document.querySelector('.tosdlg').remove());
// 4. Selector
const pas = () => pg.$eval('#seg .tos-seg-pastilla', (e) => ({ tr: e.style.transform, w: parseFloat(e.style.width) }));
revisa('4. el grupo se vuelve selector con pastilla', await pg.$eval('#seg', (e) => e.classList.contains('tos-seg')) && (await pas()).w > 0);
const a1 = await pas();
await pg.tap('#seg [data-k="c"]'); await pg.waitForTimeout(450);
const a2 = await pas();
const btnC = await pg.$eval('#seg [data-k="c"]', (b) => b.getBoundingClientRect().width);
revisa('4. la pastilla se mueve y toma el ancho del elegido', a2.tr !== a1.tr && Math.abs(a2.w - btnC) < 1, JSON.stringify([a1, a2, btnC]));
await pg.evaluate(() => { document.getElementById('seg').insertAdjacentHTML('beforeend', ''); const s = document.getElementById('seg'); [...s.querySelectorAll('button')].forEach((b) => b.remove()); s.insertAdjacentHTML('beforeend', '<button aria-pressed="false" data-k="x">Uno</button><button aria-pressed="true" data-k="y">Dos</button>'); });
await pg.waitForTimeout(450);
const a3 = await pas(), btnY = await pg.$eval('#seg [data-k="y"]', (b) => b.getBoundingClientRect().width);
revisa('4. si la pantalla repinta los botones, la pastilla se acomoda', Math.abs(a3.w - btnY) < 1, JSON.stringify([a3, btnY]));
revisa('sin errores', errs.length === 0, errs.join(' | '));
await nav.close(); srv.close();
if (fallos) { console.error(`Gestos humo: ${fallos} de ${corridas} fallaron`); process.exit(1); }
console.log(`Gestos humo OK · ${corridas} revisiones: jalar para actualizar con la T, burbuja, sin falsos jalones y selector deslizante`);
