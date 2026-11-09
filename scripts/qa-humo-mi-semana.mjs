/* Humo: Mi semana (h65, 08/11/2026).
 *
 * Presidencia: "estilo gamification... una barrita de lo que le falta";
 * Director deportivo ve lo suyo y lo de sus profes; reconocimiento dentro de
 * la app. Se prueba la pieza que pinta (v2/mi-semana.js) con datos como los
 * que devuelven v2_my_week y v2_team_week:
 *   1. La tarjeta dice el % y cuántas cosas faltan; 3 a la vista y "Ver las N".
 *   2. Cada pendiente lleva a su pantalla.
 *   3. Al 100%: "Semana completa"; la racha se dice.
 *   4. El tablero ordena de menos a más y marca a los destacados.
 *   5. Sin secciones no sale nada (no estorba a quien no aplica).
 *   6. El aviso fijo de Mensajes resume lo primero que falta.
 *   7. Cabe en el teléfono sin scroll horizontal. */
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { htmlMiSemana, htmlEquipo, resumenCampana, estadoAvisos } from '../v2/mi-semana.js';

let corridas = 0, fallos = 0;
const revisa = (nombre, ok, detalle) => { corridas++; if (!ok) { fallos++; console.error(` - ${nombre}${detalle ? `\n   ${detalle}` : ''}`); } };

const PROFE = { percent: 45, streak: 0, roles: { profe: true }, sections: [
  { key: 'listas', title: 'Listas tomadas', done: 2, total: 4, href: '/asistencia/', items: [
    { text: 'Toma lista: Sub-10 · 04/11', href: '/asistencia/' }, { text: 'Toma lista: Sub-12 · 05/11', href: '/asistencia/' }] },
  { key: 'planeacion', title: 'Planeación de la próxima semana', done: 1, total: 3, href: '/formacion/', items: [
    { text: 'Planea: Sub-10 · 10/11', href: '/formacion/' }, { text: 'Planea: Sub-12 · 11/11', href: '/formacion/' }] },
  { key: 'partidos', title: 'Partidos registrados', done: 2, total: 2, href: '/partidos/', items: [] }] };
const COMPLETA = { percent: 100, streak: 3, roles: { marketing: true }, sections: [
  { key: 'ideas', title: 'Ideas de la semana', done: 3, total: 3, href: '/ideas/', items: [] },
  { key: 'patrocinadores', title: 'Patrocinadores contactados este mes', done: 3, total: 3, href: '/patrocinadores/', items: [] }] };
const EQUIPO = { people: [
  { name: 'Brandon', role: 'Operaciones', roles: { director: true }, percent: 0, lastWeekPercent: 40, streak: 0,
    sections: [{ title: 'Categorías con profe', done: 0, total: 3, items: [{ text: 'Asigna profe a T10' }] }] },
  { name: 'Profe Leo', role: 'Formadores', roles: { profe: true }, percent: 45, lastWeekPercent: 100, streak: 2, sections: PROFE.sections },
  { name: 'Ana', role: 'Marketing', roles: { marketing: true }, percent: 100, lastWeekPercent: 100, streak: 3, sections: COMPLETA.sections }] };

// 1-3, 5 y 6: el HTML, sin navegador.
const h = htmlMiSemana(PROFE);
revisa('1. dice el % y cuántas cosas faltan', /45%/.test(h) && /Te faltan 4 cosas/.test(h), h.slice(0, 200));
revisa('1. sólo 3 pendientes a la vista y "Ver las 4"', (h.match(/class="ms-faltan"/g) || []).length === 1 && (h.split('ms-faltan')[1].match(/<li>/g) || []).length === 3 && /Ver las 4/.test(h));
revisa('2. cada pendiente lleva a su pantalla', /href="\/asistencia\/">Toma lista: Sub-10/.test(h) && /href="\/formacion\/">Planea: Sub-10/.test(h));
revisa('1. las secciones dicen hecho/total', /Listas tomadas<\/span><b>2\/4/.test(h) && /Partidos registrados<\/span><b>2\/2/.test(h));
const c = htmlMiSemana(COMPLETA);
revisa('3. al 100%: "Semana completa" y la racha', /Semana completa/.test(c) && /3 semanas seguidas al 100%/.test(c) && /Todo al día/.test(c));
revisa('5. sin secciones no sale nada', htmlMiSemana({ sections: [] }) === '' && htmlMiSemana(null) === '' && htmlEquipo({ people: [] }) === '');
const e = htmlEquipo(EQUIPO);
revisa('4. destacados de la semana pasada', /Destacados de la semana pasada:<\/b> Profe Leo, Ana/.test(e));
revisa('4. el director dice que es Director deportivo', /Director deportivo/.test(e));
revisa('6. el aviso de Mensajes resume lo primero que falta', /Mi semana · 45%/.test(resumenCampana(PROFE)) && /Toma lista: Sub-10 · 04\/11 y 3 más/.test(resumenCampana(PROFE)));
revisa('6. sin secciones, sin aviso', resumenCampana({ sections: [] }) === '');
revisa('seguridad: escapa nombres', !/<script>/.test(htmlEquipo({ people: [{ name: '<script>x</script>', sections: [{ title: 't', done: 0, total: 1, items: [] }] }] })));

// 8. "Activa tus avisos" (09/11/2026): cuándo se ofrece.
const docCon = oculta => ({ getElementById: id => id === 'tosBellSubscribeRow' ? { classList: { contains: c => c === 'hidden' && oculta } } : null });
const winDe = (ua, extra = {}) => ({ navigator: { userAgent: ua, ...extra }, matchMedia: () => ({ matches: false }) });
revisa('8. se ofrece cuando el shell dice que aún no se activan', estadoAvisos({ doc: docCon(false), win: winDe('Chrome') }) === 'ofrecer');
revisa('8. ya activados: no sale nada', estadoAvisos({ doc: docCon(true), win: { ...winDe('Chrome'), PushManager: function () {} } }) === 'nada');
revisa('8. iPhone sin instalar: dice cómo instalarla', estadoAvisos({ doc: docCon(true), win: winDe('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)') }) === 'instalar');
revisa('8. iPhone ya instalado: no insiste', estadoAvisos({ doc: docCon(true), win: winDe('Mozilla/5.0 (iPhone)', { standalone: true }) }) === 'nada');

// 4 y 7: en el navegador, a 390 px.
const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const T = { '.html':'text/html','.js':'text/javascript','.css':'text/css' };
const srv = http.createServer((q, r) => {
  const p = decodeURIComponent(q.url.split('?')[0]);
  if (p === '/prueba.html') { r.writeHead(200, { 'content-type': 'text/html' }); r.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/v2/styles.css"><link rel="stylesheet" href="/v2/shell.css"></head><body style="padding:16px;background:#f4f6f5"><div class="hidden"><div id="tosBellSubscribeRow"><button id="tosEnablePush" onclick="window.__activo=1"></button></div></div><section id="activaAvisos" class="ms-avisos hidden"></section><section id="miSemana" class="tos-panel ms-semana hidden"></section><section id="equipoSemana" class="tos-panel hidden" style="margin-top:16px"></section><script type="module">
    import { pintaMiSemana, pintaEquipo, pintaActivarAvisos } from '/v2/mi-semana.js';
    const datos = { v2_my_week: ${JSON.stringify(PROFE)}, v2_team_week: ${JSON.stringify(EQUIPO)} };
    const rpc = async n => datos[n];
    const ctx = { organization_id: 'o1' };
    await pintaMiSemana({ rpc, ctx }); await pintaEquipo({ rpc, ctx }); pintaActivarAvisos(); window.__listo = true;
  </script></body></html>`); return; }
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('no'); return; }
  r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const nav = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const pg = await nav.newPage({ viewport: { width: 390, height: 844 } });
const errs = []; pg.on('pageerror', x => errs.push(String(x)));
await pg.goto(`http://127.0.0.1:${srv.address().port}/prueba.html`);
await pg.waitForFunction(() => window.__listo, null, { timeout: 5000 });
revisa('7. la tarjeta se ve', await pg.isVisible('#miSemana .ms-pct'));
await pg.waitForSelector('#activaAvisos [data-activa-avisos]', { timeout: 4000 });
await pg.click('#activaAvisos [data-activa-avisos]');
revisa('8. "Activar" en Inicio usa el mismo botón del shell', await pg.evaluate(() => window.__activo === 1));
await pg.click('[data-ms-vertodo]');
revisa('1. "Ver las 4" enseña todo', (await pg.$$('#miSemana .ms-faltan li')).length === 4);
const orden = await pg.$$eval('#equipoSemana .ms-quien strong', s => s.map(x => x.textContent));
revisa('4. el tablero trae a los 3', orden.join() === 'Brandon,Profe Leo,Ana', orden.join());
await pg.click('#equipoSemana .ms-persona summary');
revisa('4. tocar a alguien enseña lo que le falta', await pg.isVisible('#equipoSemana .ms-persona[open] .ms-faltan'));
revisa('7. sin scroll horizontal', await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
if (process.env.SHOTS) await pg.screenshot({ path: `${process.env.SHOTS}/mi-semana.png`, fullPage: true });
revisa('sin errores de página', !errs.length, errs.join(' | '));
await nav.close(); srv.close();

if (fallos) { console.error(`Mi semana humo: ${fallos} de ${corridas} fallaron`); process.exit(1); }
console.log(`Mi semana humo OK · ${corridas} revisiones: barra y pendientes, ver todo, semana completa y racha, tablero con destacados, aviso de Mensajes, teléfono`);
