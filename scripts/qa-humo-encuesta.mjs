// Encuesta de experiencia en Chromium, con Supabase falso.
//
// Presidencia, 15/10/2026: "que los papás Tanners y los que vinieron del Club
// León contesten cómo se la pasaron... y luego hacer gráficas". Revisa:
//   /encuesta/?e=leon-oct26&vs=Club%20León
//     sin decir quién eres no se manda; el visitante trae su club de la liga;
//     las calificaciones 1–5 y "No lo usé" (que no se manda); NPS 0–10;
//     el WhatsApp sólo viaja si se pidió contacto; termina en gracias;
//     un error del servidor se muestra y deja reintentar; nada se sale a 390px.
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const T = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png','.woff2':'font/woff2' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('no'); return; }
  r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}`;

const revisiones = [], errores = [];
const revisa = (n, ok, d = '') => revisiones.push({ nombre: n, ok, detalle: d });
const nav = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const ORG = '3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8';

async function abre(ruta, opts = {}) {
  const p = await nav.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(`console: ${m.text()}`); });
  await p.addInitScript(({ opts, ORG }) => {
    window.__llamadas = []; let fallos = opts.falla || 0;
    const R = {
      v2_public_context: () => ({ organizationId: ORG, organizationName: 'Tannery City FC', slug: 'tannery-city-fc' }),
      v2_public_submit_survey: () => { if (fallos-- > 0) throw new Error('Demasiados intentos, espera un momento'); return { ok: true, id: 'x' }; }
    };
    window.__fakeSupabase = {
      auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
      rpc: async (n, prm) => { window.__llamadas.push({ n, prm: JSON.parse(JSON.stringify(prm || {})) }); try { return { data: R[n] ? R[n](prm) : null, error: null }; } catch (e) { return { data: null, error: { message: e.message } }; } }
    };
  }, { opts, ORG });
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.route('**/v2/supabase-client.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'export function createClient(){ return window.__fakeSupabase; }' }));
  await p.goto(BASE + ruta, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#enForm', { timeout: 6000 });
  return p;
}
const envios = p => p.evaluate(() => window.__llamadas.filter(x => x.n === 'v2_public_submit_survey').map(x => x.prm));
const nota = (p, tema, v) => p.click(`[data-tema="${tema}"] input[value="${v}"] >> xpath=..`);

{ // Visitante del Club León, con contacto
  const p = await abre('/encuesta/?e=leon-oct26&vs=Club%20Le%C3%B3n');
  if (process.env.QA_CAPTURA) await p.screenshot({ path: process.env.QA_CAPTURA, fullPage: true });
  revisa('[portada] título y 9 temas', (await p.locator('.en-tema').count()) === 9 && /pasaste/i.test(await p.locator('.en-titulo').innerText()));
  revisa('[portada] "No lo usé" sólo en estacionamiento, baños y tienda', (await p.locator('.en-na').count()) === 3
    && (await p.locator('[data-tema="estacionamiento"] .en-na, [data-tema="banos"] .en-na, [data-tema="tienda"] .en-na').count()) === 3);
  revisa('[portada] la tarjeta de visitante dice Club León', /Club León/.test(await p.locator('.en-carta').nth(1).innerText()));
  revisa('[sin desborde] /encuesta/ cabe a 390px', !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));

  await nota(p, 'ambiente', 5);
  await p.click('#enEnviar');
  revisa('[mínimo] sin decir quién eres no se manda', (await envios(p)).length === 0 && /quién eres/.test(await p.locator('#formMessage').innerText()));

  await p.click('.en-carta:nth-child(2)');
  revisa('[visitante] aparece su club, ya lleno', await p.locator('#enClubCaja').isVisible() && (await p.inputValue('#enClub')) === 'Club León');
  await p.waitForTimeout(300);
  revisa('[nota] marcar pinta el botón', await p.locator('[data-tema="ambiente"] .n5').evaluate(e => getComputedStyle(e).backgroundColor === 'rgb(47, 138, 79)'));
  await nota(p, 'banos', 2); await nota(p, 'tienda', '');
  await nota(p, 'papas', 4);
  await p.click('.en-n:has(input[value="9"])');
  await p.fill('#enGusto', '  La cancha y el ambiente  ');
  await p.fill('#enMejora', 'Más baños');
  await p.check('#enContacto');
  await p.fill('#enNombre', 'Pedro'); await p.fill('#enTel', '477 12');
  await p.click('#enEnviar');
  revisa('[contacto] WhatsApp corto no se manda', (await envios(p)).length === 0 && /WhatsApp/.test(await p.locator('#formMessage').innerText()));
  await p.fill('#enTel', '477 123 4567');
  await p.click('#enEnviar');
  await p.waitForSelector('.en-gracias', { timeout: 4000 }).catch(() => {});
  const [e] = await envios(p);
  const r = e?.response || {};
  revisa('[envío] llave del club y encuesta del evento', e?.club_key && r.survey === 'leon-oct26', JSON.stringify(e));
  revisa('[envío] visitante del Club León', r.respondent === 'visitante' && r.club === 'Club León', JSON.stringify(r));
  revisa('[envío] calificaciones; "No lo usé" no viaja', JSON.stringify(r.ratings) === JSON.stringify({ ambiente: 5, banos: 2, papas: 4 }), JSON.stringify(r.ratings));
  revisa('[envío] NPS 9 y textos limpios', r.nps === 9 && r.likes === 'La cancha y el ambiente' && r.improve === 'Más baños', JSON.stringify(r));
  revisa('[envío] contacto con consentimiento', r.contactName === 'Pedro' && r.contactPhone === '4771234567' && r.consent?.contact === true, JSON.stringify(r));
  revisa('[gracias] pantalla final', await p.locator('.en-gracias').isVisible());
  await p.close();
}

{ // Papá Tanner, sin contacto, y el servidor falla una vez
  const p = await abre('/encuesta/', { falla: 1 });
  await p.click('.en-carta:nth-child(1)');
  revisa('[tanner] no pide club', !(await p.locator('#enClubCaja').isVisible()));
  await p.click('.en-n:has(input[value="3"])');
  await p.click('#enEnviar');
  await p.waitForFunction(() => !document.getElementById('enEnviar')?.disabled, null, { timeout: 4000 });
  revisa('[error] se muestra y deja reintentar', /Demasiados intentos/.test(await p.locator('#formMessage').innerText()) && /^enviar encuesta$/i.test(await p.locator('#enEnviar').innerText()));
  await p.click('#enEnviar');
  await p.waitForSelector('.en-gracias', { timeout: 4000 }).catch(() => {});
  const r = (await envios(p)).at(-1)?.response || {};
  revisa('[tanner] encuesta general, sin club ni contacto', r.survey === 'general' && r.respondent === 'tanner' && r.club === null && r.contactName === null && r.contactPhone === null && r.consent?.contact === false, JSON.stringify(r));
  revisa('[tanner] sólo NPS cuenta como respuesta', r.nps === 3 && JSON.stringify(r.ratings) === '{}', JSON.stringify(r));
  revisa('[gracias] tras reintentar', await p.locator('.en-gracias').isVisible());
  await p.close();
}

{ // Sin nada calificado no se manda
  const p = await abre('/encuesta/?e=Leon%20Oct!');
  await p.click('.en-carta:nth-child(3)');
  await p.click('#enEnviar');
  revisa('[mínimo] sin calificaciones no se manda', (await envios(p)).length === 0 && /calificación/.test(await p.locator('#formMessage').innerText()));
  await nota(p, 'staff', 1);
  await p.click('#enEnviar');
  await p.waitForSelector('.en-gracias', { timeout: 4000 }).catch(() => {});
  const r = (await envios(p)).at(-1)?.response || {};
  revisa('[slug] el evento se limpia', r.survey === 'leonoct' && r.respondent === 'otro', JSON.stringify(r));
  await p.close();
}

await nav.close(); srv.close();
let mal = 0;
for (const r of revisiones) if (!r.ok) { mal++; console.error(` - ${r.nombre}${r.detalle ? ' :: ' + r.detalle : ''}`); }
if (errores.length) { console.error('ERRORES DEL NAVEGADOR:'); errores.forEach(e => console.error('   ' + e)); }
if (mal || errores.length) { console.error(`Encuesta humo FAILED · ${mal} de ${revisiones.length}, ${errores.length} errores`); process.exit(1); }
console.log(`Encuesta humo OK · ${revisiones.length} revisiones: quién contesta, calificaciones, NPS, contacto y envío`);
