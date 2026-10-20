/* COSTOS PÚBLICOS · la página real en el navegador (/costos, 20/10/2026).
 *
 * Revisa lo que ve un papá sin cuenta:
 *   · /costos abre sin sesión y no le pide nada a Supabase;
 *   · los precios salen de la configuración central;
 *   · sin todas las respuestas no hay números de ejemplo;
 *   · 1, 2 y 3 hijos; Baby + Tanner; cambio de modalidad; nueva o ya inscrito;
 *   · cambiar la fecha recalcula (nunca se queda el importe anterior);
 *   · combinación sin paquete: "Solicitar cotización";
 *   · copiar la cotización y mandar por WhatsApp;
 *   · celular de 390 y 320 sin scroll de lado; "‹ Inicio" regresa.
 */
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { TARIFAS } from '../costos/tarifas.js';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const TIPOS = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.woff2':'font/woff2', '.jpg':'image/jpeg' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('no'); return; }
  r.writeHead(200, { 'content-type': TIPOS[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(4761, r));
const BASE = 'http://127.0.0.1:4761';
const nav = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
let fallos = 0, corridas = 0;
const revisa = (n, ok, d) => { corridas++; if (!ok) { fallos++; console.error(` - ${n}${d !== undefined ? `\n   ${typeof d === 'string' ? d : JSON.stringify(d)}` : ''}`); } };
const cap = async (pg, n) => { if (process.env.QA_CAPTURA) await pg.screenshot({ path: process.env.QA_CAPTURA.replace('.png', `-${n}.png`), fullPage: true }); };

// precios: lo que contesta v2_public_costos (null = nada guardado); 'cae' = sin red.
async function abre(viewport = { width: 390, height: 844 }, precios = null) {
  const ctx = await nav.newContext({ viewport, hasTouch: true, isMobile: viewport.width < 600, permissions: ['clipboard-read', 'clipboard-write'] });
  const pg = await ctx.newPage();
  const errs = [], ajenas = [];
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errs.push(m.text()); });
  pg.on('request', q => { if (!q.url().startsWith(BASE)) ajenas.push(q.url()); });
  await pg.route('**/rest/v1/rpc/v2_public_costos', r => precios === 'cae' ? r.abort()
    : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(precios) }));
  await pg.goto(`${BASE}/costos/`, { waitUntil: 'networkidle' });
  return { pg, ctx, errs, ajenas };
}
const total = pg => pg.textContent('#coTotal').catch(() => null);
// Se toca la tarjeta, como lo haría un papá (el radio va escondido adentro).
const elige = (pg, name, value) => pg.click(`label.co-op:has(> input[name="${name}"][value="${value}"])`);

/* ===== Un hijo, paso a paso ===== */
{
  const { pg, ctx, errs, ajenas } = await abre();
  revisa('/costos abre sin sesión y se ve la página', await pg.isVisible('.co-titulo') && !(await pg.isVisible('#cargando')));
  revisa('sólo pregunta los precios públicos (una llamada, sin sesión)', ajenas.length === 1 && /\/rest\/v1\/rpc\/v2_public_costos$/.test(ajenas[0]), ajenas);
  const precios = await pg.textContent('.co-planes');
  const esperados = ['$400', '$550', '$800', '$1,000'];
  revisa('los precios de la configuración aparecen en las tarjetas', esperados.every(x => precios.includes(x)) && /3 a 6 años/.test(precios) && /6 a 12 años/.test(precios), precios);
  revisa('la inscripción dice qué incluye', /seguro anual y gafete/i.test(precios));
  revisa('los paquetes familiares dicen "Por confirmar"', await pg.isVisible('#coPaqAviso') && (await pg.$$eval('.co-tabla .co-pill', p => p.length)) === TARIFAS.paquetes.lista.length);
  revisa('antes de responder no hay ningún total de ejemplo', !(await pg.$('#coTotal')) && /Tu cotización aparece aquí/.test(await pg.textContent('#coResultado')));

  revisa('la nota "sólo nuevo ingreso" se ve junto a los precios', /únicamente para alumnos de nuevo ingreso/.test(await pg.textContent('#coImportante')));
  await elige(pg, 'coN', '1');
  await elige(pg, 'coCat0', 'tanner');
  revisa('falta decir si es nuevo ingreso: todavía sin total ni fecha', !(await pg.$('#coTotal')) && /nuevo ingreso/.test(await pg.textContent('#coResultado')) && !(await pg.isVisible('#coFecha')));
  await elige(pg, 'coNueva', 'si');
  revisa('nuevo ingreso: aparece la fecha', await pg.isVisible('#coFecha'));
  await pg.fill('#coFecha', '2026-10-19');
  revisa('Tanner nuevo el 19 de octubre: $1,400 de primer pago', await total(pg) === '$1,400', await total(pg));
  revisa('y $800 MXN desde noviembre', /noviembre 2026/.test(await pg.textContent('.co-regular')) && (await pg.textContent('#coRegular')) === '$800 MXN');
  revisa('el desglose dice que es proporcional, 2 de 4 semanas', /2 de 4 semanas/.test(await pg.textContent('.co-desglose')));
  revisa('la fecha se lee completa', /19 de octubre de 2026/.test(await pg.textContent('#coFechaTxt')));
  revisa('la cotización trae la nota de nuevo ingreso', /únicamente para alumnos de nuevo ingreso/.test(await pg.textContent('[data-importante]')));
  await pg.fill('#coFecha', '2026-10-01');
  revisa('cambiar la fecha al día 1 recalcula: mes completo, $1,800', await total(pg) === '$1,800' && /Mes completo/.test(await pg.textContent('.co-desglose')), await total(pg));
  await pg.fill('#coFecha', '2026-10-31');
  revisa('el último día del mes: 1 de 4 semanas, $1,200', await total(pg) === '$1,200', await total(pg));
  await pg.fill('#coFecha', '');
  revisa('sin fecha no queda el importe anterior', !(await pg.$('#coTotal')));
  await pg.fill('#coFecha', '2026-10-31');
  await elige(pg, 'coNueva', 'no');
  revisa('ya inscrito: mensualidad completa ($800) aunque la fecha diga 31, sin inscripción', await total(pg) === '$800' && !/Inscripción/.test(await pg.textContent('.co-desglose')), await total(pg));
  revisa('ya inscrito: se esconde la fecha y dice "cada mes"', !(await pg.isVisible('#coFecha')) && /Total a pagar cada mes/.test(await pg.textContent('.co-desglose tfoot')) && /Alumno ya inscrito/.test(await pg.textContent('.co-fecha-r')));
  await elige(pg, 'coNueva', 'si');
  await pg.fill('#coFecha', '2026-10-19');
  await elige(pg, 'coCat0', 'baby');
  revisa('al cambiar a Baby pide los días y no deja un total viejo', !(await pg.$('#coTotal')) && await pg.isVisible('[name="coMod0"]'));
  await elige(pg, 'coMod0', '1d');
  const uno = await total(pg);
  await elige(pg, 'coMod0', '2d');
  const dos = await total(pg);
  revisa('Baby 1 día $1,200 y 2 días $1,275 (550 x 2/4 = 275)', uno === '$1,200' && dos === '$1,275', [uno, dos]);

  // Copiar
  await pg.click('#coCopiar'); await pg.waitForTimeout(200);
  const copiado = await pg.evaluate(() => navigator.clipboard.readText());
  revisa('"Copiar mi cotización" copia conceptos y totales', /Mi cotización Tannery City/.test(copiado) && /Total del primer pago: \$1,275 MXN/.test(copiado) && /Baby Tanners, 2 días por semana/.test(copiado), copiado);
  revisa('y avisa que se copió', /copiada/.test(await pg.textContent('#coCopiado')));
  const wa = await pg.getAttribute('#coWhats', 'href');
  revisa('WhatsApp va al 479 265 1338 con la cotización ya escrita', wa.startsWith('https://wa.me/524792651338?text=') && /Total del primer pago: \$1,275/.test(decodeURIComponent(wa)), wa.slice(0, 90));
  revisa('el botón de WhatsApp abre en otra pestaña', (await pg.getAttribute('#coWhats', 'target')) === '_blank');
  const ancho = await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  revisa('sin scroll de lado en iPhone (390)', ancho <= 0, `sobran ${ancho}px`);
  const btn = await pg.$eval('#coCopiar', b => b.getBoundingClientRect().height);
  revisa('botones de al menos 44px', btn >= 44, btn);
  await cap(pg, 'uno');
  revisa('sin errores de consola (un hijo)', errs.length === 0, errs);
  await pg.click('.co-volver'); await pg.waitForURL(`${BASE}/`).catch(() => {});
  revisa('"‹ Inicio" regresa a la entrada', new URL(pg.url()).pathname === '/');
  await ctx.close();
}

/* ===== Dos y tres hijos ===== */
{
  const { pg, ctx, errs } = await abre();
  await elige(pg, 'coN', '2');
  revisa('2 hijos: una tarjeta por hijo', (await pg.$$eval('.co-hijo', h => h.length)) === 2);
  await elige(pg, 'coCat0', 'tanner'); await elige(pg, 'coCat1', 'tanner');
  await elige(pg, 'coNueva', 'si'); await pg.fill('#coFecha', '2026-10-01');
  revisa('2 Tanners: sin paquete confirmado se cobra $1,600 + 2 inscripciones = $3,600', await total(pg) === '$3,600', await total(pg));
  revisa('y enseña el paquete de $1,500 como "por confirmar", sin sumarlo', /2 Tanners: \$1,500 al mes, por confirmar/.test(await pg.textContent('[data-paquete="referencia"]')));
  revisa('se marca como estimación', /Estimación/.test(await pg.textContent('.co-nota')));
  await elige(pg, 'coCat1', 'baby'); await elige(pg, 'coMod1', '2d');
  revisa('Tanner + Baby: referencia de $1,200', /1 Tanner \+ 1 Baby Tanner: \$1,200/.test(await pg.textContent('[data-paquete="referencia"]')));
  await elige(pg, 'coN', '3');
  revisa('al pasar a 3 se conservan los dos primeros', (await pg.isChecked('[name="coCat0"][value="tanner"]')) && (await pg.isChecked('[name="coMod1"][value="2d"]')));
  revisa('el tercero sin categoría: no hay total', !(await pg.$('#coTotal')));
  await elige(pg, 'coCat2', 'tanner');
  revisa('2 Tanners + 1 Baby: "Solicitar cotización"', /solicitar cotización/i.test(await pg.textContent('[data-paquete="sin_tarifa"]')));
  revisa('3 hijos: $800 + $800 + $550 + 3 inscripciones = $5,150', await total(pg) === '$5,150', await total(pg));
  await elige(pg, 'coN', '1');
  revisa('regresar a 1 hijo quita a los demás', (await pg.$$eval('.co-hijo', h => h.length)) === 1 && await total(pg) === '$1,800', await total(pg));
  await cap(pg, 'tres');
  revisa('sin errores de consola (varios hijos)', errs.length === 0, errs);
  await ctx.close();
}

/* ===== Precios editados en Club (h22) y red caída ===== */
{
  const { pg, ctx, errs } = await abre(undefined, { tanner: { mensualidad: 850, inscripcion: 1200 }, baby: { mensualidad1d: 450 }, paquetes: { confirmado: true, t2: 1600 } });
  const precios = await pg.textContent('.co-planes');
  revisa('[editables] la página enseña los precios guardados en Club', /\$850/.test(precios) && /\$1,200/.test(precios) && /\$450/.test(precios) && /\$550/.test(precios), precios);
  revisa('[editables] con paquetes confirmados ya no dice "Por confirmar"', !(await pg.isVisible('#coPaqAviso')) && (await pg.$$eval('.co-tabla .co-pill', p => p.length)) === 0);
  await elige(pg, 'coN', '2'); await elige(pg, 'coCat0', 'tanner'); await elige(pg, 'coCat1', 'tanner'); await elige(pg, 'coNueva', 'no');
  revisa('[editables] la calculadora cobra el paquete confirmado ($1,600)', await total(pg) === '$1,600', await total(pg));
  revisa('[editables] sin errores', errs.length === 0, errs);
  await ctx.close();
}
{
  const { pg, ctx, errs } = await abre(undefined, 'cae');
  revisa('[sin red] la página sale igual con los precios del archivo', await pg.isVisible('.co-titulo') && /\$800/.test(await pg.textContent('.co-planes')));
  revisa('[sin red] sin errores en la página', errs.filter(e => !/ERR_FAILED|Failed to load/.test(e)).length === 0, errs);
  await ctx.close();
}

/* ===== Celular chico y escritorio ===== */
for (const vp of [{ width: 320, height: 640 }, { width: 1280, height: 900 }]) {
  const { pg, ctx, errs } = await abre(vp);
  await elige(pg, 'coN', '2'); await elige(pg, 'coCat0', 'baby'); await elige(pg, 'coMod0', '1d'); await elige(pg, 'coCat1', 'tanner'); await elige(pg, 'coNueva', 'si');
  const ancho = await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  revisa(`sin scroll de lado a ${vp.width}px`, ancho <= 0, `sobran ${ancho}px`);
  revisa(`a ${vp.width}px el total se ve`, await pg.isVisible('#coTotal'));
  revisa(`sin errores (${vp.width}px)`, errs.length === 0, errs);
  await cap(pg, String(vp.width));
  await ctx.close();
}

await nav.close(); srv.close();
console.log(fallos ? `Costos humo FAILED · ${fallos} de ${corridas}` : `Costos humo OK · ${corridas} revisiones: precios públicos, calculadora de 1 a 3 hijos, copiar y WhatsApp`);
process.exit(fallos ? 1 : 0);
