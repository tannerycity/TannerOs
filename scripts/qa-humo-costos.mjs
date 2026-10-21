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
// Puerto libre al azar: con uno fijo chocaba con otra suite corriendo a la vez.
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}`;
const nav = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
let fallos = 0, corridas = 0;
const revisa = (n, ok, d) => { corridas++; if (!ok) { fallos++; console.error(` - ${n}${d !== undefined ? `\n   ${typeof d === 'string' ? d : JSON.stringify(d)}` : ''}`); } };
const cap = async (pg, n) => { if (process.env.QA_CAPTURA) await pg.screenshot({ path: process.env.QA_CAPTURA.replace('.png', `-${n}.png`), fullPage: true }); };

// precios: lo que contesta v2_public_costos (null = nada guardado); 'cae' = sin red.
async function abre(viewport = { width: 390, height: 844 }, precios = null, ruta = '/costos/') {
  const ctx = await nav.newContext({ viewport, hasTouch: true, isMobile: viewport.width < 600, permissions: ['clipboard-read', 'clipboard-write'] });
  const pg = await ctx.newPage();
  const errs = [], ajenas = [];
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errs.push(m.text()); });
  pg.on('request', q => { if (!q.url().startsWith(BASE)) ajenas.push(q.url()); });
  await pg.route('**/rest/v1/rpc/v2_public_costos', r => precios === 'cae' ? r.abort()
    : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(precios) }));
  await pg.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle' });
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
  // Costos oficiales del cartel (21/10/2026).
  const esperados = ['$400', '$550', '$800', '$500'];
  revisa('los precios del cartel aparecen en las tarjetas (inscripción Tanner $800, Baby $500)', esperados.every(x => precios.includes(x)) && /3 a 6 años/.test(precios) && /6 a 12 años/.test(precios) && !/\$1,000/.test(precios), precios);
  revisa('Tanners va primero, como en el cartel', (await pg.$$eval('.co-plan h3', h => h.map(x => x.textContent))).join() === 'Tanners,Baby Tanners');
  revisa('la inscripción ya no promete seguro ni gafete', !/seguro|gafete/i.test(await pg.textContent('main')));
  revisa('los paquetes oficiales ya no dicen "Por confirmar"', !(await pg.isVisible('#coPaqAviso')) && (await pg.$$eval('.co-tabla .co-pill', p => p.length)) === 0);
  revisa('la tabla de hermanos trae los del cartel', /2 Tanners\s*\$1,500/.test(await pg.textContent('.co-tabla')) && /1 Tanner \+ 1 Baby Tanner\s*\$1,200/.test(await pg.textContent('.co-tabla')) && /2 Tanners \+ 1 Baby Tanner\s*\$1,900/.test(await pg.textContent('.co-tabla')) && /2 Baby Tanners\s*\$800/.test(await pg.textContent('.co-tabla')));
  revisa('el recargo se ve como importante junto a los precios', /después del día 5 se cobra un recargo de \$100/i.test(await pg.textContent("#coRecargoNota")));
  revisa('antes de responder no hay ningún total de ejemplo', !(await pg.$('#coTotal')) && /Tu cotización aparece aquí/.test(await pg.textContent('#coResultado')));

  revisa('la nota "sólo nuevo ingreso" se ve junto a los precios', /únicamente para alumnos de nuevo ingreso/.test(await pg.textContent('#coImportante')));
  await elige(pg, 'coN', '1');
  await elige(pg, 'coCat0', 'tanner');
  revisa('falta decir si es nuevo ingreso: todavía sin total ni fecha', !(await pg.$('#coTotal')) && /nuevo ingreso/.test(await pg.textContent('#coResultado')) && !(await pg.isVisible('#coFecha')));
  await elige(pg, 'coNueva', 'si');
  revisa('nuevo ingreso: aparece la fecha', await pg.isVisible('#coFecha'));
  await pg.fill('#coFecha', '2026-10-19');
  revisa('Tanner nuevo el 19 de octubre: $400 + inscripción $800 = $1,200', await total(pg) === '$1,200', await total(pg));
  revisa('y $800 MXN desde noviembre', /noviembre 2026/.test(await pg.textContent('.co-regular')) && (await pg.textContent('#coRegular')) === '$800 MXN');
  revisa('el desglose dice que es proporcional, 2 de 4 semanas', /2 de 4 semanas/.test(await pg.textContent('.co-desglose')));
  revisa('la fecha se lee completa', /19 de octubre de 2026/.test(await pg.textContent('#coFechaTxt')));
  revisa('la cotización trae la nota de nuevo ingreso', /únicamente para alumnos de nuevo ingreso/.test(await pg.textContent('[data-importante]')));
  await pg.fill('#coFecha', '2026-10-01');
  revisa('cambiar la fecha al día 1 recalcula: mes completo, $1,600', await total(pg) === '$1,600' && /Mes completo/.test(await pg.textContent('.co-desglose')), await total(pg));
  await pg.fill('#coFecha', '2026-10-31');
  revisa('el último día del mes: 1 de 4 semanas, $200 + $800 = $1,000', await total(pg) === '$1,000', await total(pg));
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
  await elige(pg, 'coMod0', 'baby-1');
  const uno = await total(pg);
  await elige(pg, 'coMod0', 'baby-2');
  const dos = await total(pg);
  revisa('Baby 1 día $700 y 2 días $775 (550 x 2/4 = 275, inscripción $500)', uno === '$700' && dos === '$775', [uno, dos]);
  revisa('simulación del recargo: $550 + $100 = $650 si paga después del día 5', (await pg.textContent('#coConRecargo')) === '$650' && /después del día 5/.test(await pg.textContent('[data-recargo]')));

  // Copiar
  await pg.click('#coCopiar'); await pg.waitForTimeout(200);
  const copiado = await pg.evaluate(() => navigator.clipboard.readText());
  revisa('"Copiar mi cotización" copia conceptos y totales', /Mi cotización Tannery City/.test(copiado) && /Total del primer pago: \$775 MXN/.test(copiado) && /recargo/.test(copiado) && /Baby Tanners, 2 días por semana/.test(copiado), copiado);
  revisa('y avisa que se copió', /copiada/.test(await pg.textContent('#coCopiado')));
  const wa = await pg.getAttribute('#coWhats', 'href');
  revisa('WhatsApp va al 479 265 1338 con la cotización ya escrita', wa.startsWith('https://wa.me/524792651338?text=') && /Total del primer pago: \$775/.test(decodeURIComponent(wa)), wa.slice(0, 90));
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
  revisa('2 Tanners nuevos: paquete $1,500 + 2 inscripciones de $800 = $3,100', await total(pg) === '$3,100', await total(pg));
  revisa('el desglose enseña el ajuste familiar del paquete', /Ajuste familiar/.test(await pg.textContent('.co-desglose')) && (await pg.textContent('#coRegular')) === '$1,500 MXN');
  revisa('con costos oficiales no se marca como estimación', !/Estimación/.test(await pg.textContent('.co-nota')));
  revisa('el recargo es por hijo: $1,500 + $200 = $1,700', (await pg.textContent('#coConRecargo')) === '$1,700' && /\$100 por cada hijo/.test(await pg.textContent('[data-recargo]')));
  await elige(pg, 'coCat1', 'baby'); await elige(pg, 'coMod1', 'baby-2');
  revisa('Tanner + Baby: paquete mixto $1,200 (cartel)', (await pg.textContent('#coRegular')) === '$1,200 MXN');
  await elige(pg, 'coN', '3');
  revisa('al pasar a 3 se conservan los dos primeros', (await pg.isChecked('[name="coCat0"][value="tanner"]')) && (await pg.isChecked('[name="coMod1"][value="baby-2"]')));
  revisa('el tercero sin categoría: no hay total', !(await pg.$('#coTotal')));
  await elige(pg, 'coCat2', 'tanner');
  revisa('2 Tanners + 1 Baby: $1,900 (cartel)', (await pg.textContent('#coRegular')) === '$1,900 MXN');
  revisa('3 hijos nuevos: $1,900 + inscripciones $800 + $500 + $800 = $4,000', await total(pg) === '$4,000', await total(pg));
  await elige(pg, 'coN', '1');
  revisa('regresar a 1 hijo quita a los demás', (await pg.$$eval('.co-hijo', h => h.length)) === 1 && await total(pg) === '$1,600', await total(pg));
  await cap(pg, 'tres');
  revisa('sin errores de consola (varios hijos)', errs.length === 0, errs);
  await ctx.close();
}

/* ===== Un club con paquetes "por confirmar" ===== */
{
  const sinConfirmar = { categorias: TARIFAS.categorias, paquetes: { confirmado: false, lista: TARIFAS.paquetes.lista } };
  const { pg, ctx, errs } = await abre(undefined, sinConfirmar);
  revisa('[por confirmar] la tabla avisa "Por confirmar"', await pg.isVisible('#coPaqAviso') && (await pg.$$eval('.co-tabla .co-pill', p => p.length)) === TARIFAS.paquetes.lista.length);
  await elige(pg, 'coN', '2'); await elige(pg, 'coCat0', 'tanner'); await elige(pg, 'coCat1', 'tanner'); await elige(pg, 'coNueva', 'no');
  revisa('[por confirmar] se cobra sin paquete ($1,600) y enseña el de $1,500 sin sumarlo', await total(pg) === '$1,600' && /2 Tanners: \$1,500 al mes, por confirmar/.test(await pg.textContent('[data-paquete="referencia"]')));
  revisa('[por confirmar] se marca como estimación', /Estimación/.test(await pg.textContent('.co-nota')));
  revisa('[por confirmar] sin errores', errs.length === 0, errs);
  await ctx.close();
}

/* ===== Precios editados en Club (h22) y red caída ===== */
{
  const { pg, ctx, errs } = await abre(undefined, { categorias: [
      { clave: 'baby', nombre: 'Baby Tanners', edades: 'De 3 a 6 años', inscripcion: 1000, opciones: [{ clave: 'baby-1', dias: 1, mensualidad: 450 }, { clave: 'baby-2', dias: 2, mensualidad: 550 }] },
      { clave: 'tanner', nombre: 'Tanners', edades: 'De 6 a 12 años', inscripcion: 1200, opciones: [{ clave: 'tanner-3', dias: 3, mensualidad: 850 }] },
      { clave: 'porteros', nombre: 'Porteros', edades: 'De 8 a 14 años', inscripcion: 500, opciones: [{ clave: 'porteros-1', dias: 1, mensualidad: 300 }] }],
    paquetes: { confirmado: true, lista: [{ clave: 'paq-1', nombre: '2 Tanners', cantidades: { tanner: 2 }, mensualidad: 1600 }] } });
  const precios = await pg.textContent('.co-planes');
  revisa('[editables] la página enseña los precios guardados en Club', /\$850/.test(precios) && /\$1,200/.test(precios) && /\$450/.test(precios) && /\$550/.test(precios), precios);
  revisa('[editables] una categoría nueva (Porteros) sale con su precio por clase', /Porteros/.test(precios) && /\$300/.test(precios) && /\$75 por clase/.test(precios), precios);
  revisa('[editables] cada opción dice días y precio por clase (Tanners 3 días: $71)', /3 días por semana/.test(precios) && /\$71 por clase/.test(precios));
  await elige(pg, 'coN', '1');
  revisa('[editables] en la calculadora se puede elegir Porteros', (await pg.$$eval('[name="coCat0"]', i => i.map(x => x.value))).join() === 'baby,tanner,porteros');
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

/* ===== Modo staff: cotizar a una familia (21/10/2026) =====
   "A veces no estoy o no está quien dice los costos": cualquiera del club
   cotiza y se lo manda al papá con el link de registro. No se guarda nada. */
{
  const { pg, ctx, errs, ajenas } = await abre(undefined, null, '/costos/?para=familia');
  revisa('[staff] regresa a Taquilla', (await pg.getAttribute('.co-volver', 'href')) === '/taquilla/' && /Taquilla/.test(await pg.textContent('.co-volver')));
  await elige(pg, 'coN', '1'); await elige(pg, 'coCat0', 'tanner'); await elige(pg, 'coNueva', 'si');
  await pg.waitForSelector('#coTelPapa');
  revisa('[staff] sin número del papá no se puede mandar', (await pg.getAttribute('#coWhats', 'aria-disabled')) === 'true');
  await pg.fill('#coTelPapa', '477 123 4567');
  const wa = await pg.getAttribute('#coWhats', 'href');
  revisa('[staff] se manda al WhatsApp del papá, no al del club', wa.startsWith('https://wa.me/524771234567?text=') && !wa.includes('524792651338'), wa.slice(0, 60));
  revisa('[staff] el mensaje lleva la cotización y el link de registro', /Total%20del%20primer%20pago/.test(wa) && /%2Fregistro%2F/.test(wa), wa.slice(0, 200));
  revisa('[staff] no le pide nada más al servidor (no se guarda)', ajenas.length === 1, ajenas);
  revisa('[staff] sin errores', errs.length === 0, errs);
  await ctx.close();
}

/* ===== Celular chico y escritorio ===== */
for (const vp of [{ width: 320, height: 640 }, { width: 1280, height: 900 }]) {
  const { pg, ctx, errs } = await abre(vp);
  await elige(pg, 'coN', '2'); await elige(pg, 'coCat0', 'baby'); await elige(pg, 'coMod0', 'baby-1'); await elige(pg, 'coCat1', 'tanner'); await elige(pg, 'coNueva', 'si');
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
