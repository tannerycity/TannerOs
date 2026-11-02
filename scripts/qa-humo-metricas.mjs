// Métricas de marketing en Chromium, con Supabase falso (02/11/2026, h58).
//
// Presidencia: "la quiero con métricas y todo... también quiero que la vea
// Zul... que la veas y puedas tomar decisiones". Revisa:
//   - Presidencia: recomendaciones (máx. 4, con su tipo en palabra), embudo
//     del club con dónde se pierde la pista, indicadores, lo cobrado, fuentes.
//   - Lo que no se mide dice "Sin medir", nunca un cero.
//   - TCP: su embudo y su alerta de Facebook; sin lo cobrado.
//   - Periodo: pide la serie del rango nuevo y se recuerda.
//   - Zul (Operaciones con el permiso): ve todo menos lo cobrado; el menú trae Métricas.
//   - Sin permiso: el aviso, sin números.
//   - Tendencia con el día y el valor al pasar el dedo; cabe a 390 px; nada sale a internet.
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { hoyMexico } from '../v2/metricas/metricas.js';

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
const ORG = '3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8';

// Fechas relativas a hoy (México), como las manda la base.
const HOY = hoyMexico();
const dia = n => new Date(Date.parse(`${HOY}T12:00:00Z`) - n * 864e5).toISOString().slice(0, 10);
const F = (fuente, negocio, metrica, d, valor) => ({ fuente, negocio, metrica, dia: d, valor });
const SEMANA = [7, 6, 5, 4, 3, 2, 1].map(dia);
const SERIE = {
  filas: [
    ...SEMANA.map((d, i) => F('instagram', 'club', 'alcance', d, 200 + i * 20)), F('instagram', 'club', 'nuevos_seguidores', dia(3), 8),
    F('instagram', 'club', 'seguidores', HOY, 992), F('instagram', 'tcp', 'seguidores', HOY, 360), ...SEMANA.map(d => F('instagram', 'tcp', 'alcance', d, 64)),
    ...SEMANA.map(d => F('facebook', 'club', 'visualizaciones', d, 250)), ...SEMANA.map(d => F('facebook', 'club', 'interacciones', d, 26)), F('facebook', 'club', 'seguidores', HOY, 460),
    ...SEMANA.map(d => F('facebook', 'tcp', 'visualizaciones', d, 56)), F('facebook', 'tcp', 'interacciones', dia(3), 1), F('facebook', 'tcp', 'seguidores', HOY, 427),
    F('search_console', 'club', 'clics', dia(4), 7), F('search_console', 'club', 'impresiones', dia(4), 29), F('search_console', 'club', 'posicion_ponderada', dia(4), 56)
  ],
  cuentas: [['facebook', 'club'], ['facebook', 'tcp'], ['instagram', 'club'], ['instagram', 'tcp'], ['search_console', 'compartido'], ['ga4', 'club'], ['ga4', 'compartido'], ['meta_ads', 'compartido'], ['gbp', 'club']].map(([fuente, negocio]) => ({ fuente, negocio })),
  sincronizaciones: [{ fuente: 'facebook', estado: 'ok', cuando: `${HOY}T12:15:00Z` }, { fuente: 'instagram', estado: 'ok', cuando: `${HOY}T12:15:00Z` },
    { fuente: 'search_console', estado: 'ok', cuando: `${HOY}T12:15:00Z` }, { fuente: 'ga4', estado: 'ok', cuando: `${HOY}T12:15:00Z` },
    { fuente: 'meta_ads', estado: 'ok', cuando: `${HOY}T12:15:00Z` }, { fuente: 'gbp', estado: 'bloqueada', cuando: `${HOY}T12:15:00Z`, detalle: 'Requiere acceso aprobado por Google' }],
  prospectos: [{ dia: dia(3), n: 2 }], inscripciones: [{ dia: dia(2), n: 1 }]
};
const TABLERO = kpis => ({ kpis });
const KPIS_PRES = [{ negocio: 'club', kpi: 'prospectos', valor: 2, anterior: 1 }, { negocio: 'club', kpi: 'inscripciones', valor: 1, anterior: 0 },
  { negocio: 'club', kpi: 'cobrado', valor: 18500, anterior: 15000 }, { negocio: 'club', kpi: 'costo_por_prospecto', valor: null, estado: 'no_disponible', nota: 'Sin gasto de campañas con prefijo CLUB- en el periodo.' }];

let fallos = 0, corridas = 0;
const revisa = (n, ok, d = '') => { corridas++; if (!ok) { fallos++; console.error(` - ${n}${d ? `\n   ${d}` : ''}`); } };
const nav = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

async function abre(opts = {}) {
  const ctx = opts.ctx || await nav.newContext({ viewport: { width: opts.ancho || 1280, height: 900 } });
  const p = await ctx.newPage();
  const errs = [], fuera = [];
  p.on('pageerror', e => errs.push(`pageerror: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(`console: ${m.text()}`); });
  await p.addInitScript(({ opts, ORG, SERIE, KPIS }) => {
    window.__llamadas = [];
    const R = {
      v2_my_context: () => [{ user_id: 'u1', display_name: opts.rol ? 'Zul' : 'Mich', organization_id: ORG, organization_name: 'Tannery City FC', organization_slug: 'tannery-city-fc', role: opts.rol || 'Presidencia', is_owner: !opts.rol }],
      v2_my_navigation: () => (opts.sinModulo ? ['inicio', 'tienda'] : opts.sinPermiso ? ['inicio', 'tienda', 'metricas'] : opts.rol ? ['inicio', 'tienda', 'metricas'] : ['inicio', 'direccion', 'metricas', 'patrocinadores', 'usuarios']).map(c => ({ module_code: c, enabled: true, can_read: true, can_write: !opts.rol })),
      v2_bi_serie: () => { if (opts.sinPermiso) throw new Error('Not authorized'); return JSON.parse(JSON.stringify(SERIE)); },
      v2_bi_tablero: () => { if (opts.sinPermiso) throw new Error('Not authorized'); return { kpis: JSON.parse(JSON.stringify(KPIS)).filter(k => !(opts.rol && k.kpi === 'cobrado')) }; }
    };
    window.__fakeSupabase = {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }), getUser: async () => ({ data: { user: { id: 'u1' } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
      rpc: async (n, prm) => { window.__llamadas.push({ n, prm: JSON.parse(JSON.stringify(prm || {})) }); try { return { data: R[n] ? R[n](prm) : null, error: null }; } catch (e) { return { data: null, error: { message: e.message } }; } },
      from: () => ({ select() { return this; }, eq() { return this; }, then(r) { return Promise.resolve({ data: [], error: null }).then(r); } }),
      storage: { from: () => ({}) }, channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {}
    };
  }, { opts, ORG, SERIE, KPIS: KPIS_PRES });
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => { fuera.push(r.request().url()); return r.abort(); });
  await p.route('**/v2/supabase-client.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'export function createClient(){ return window.__fakeSupabase; }' }));
  await p.goto(BASE + '/v2/metricas/index.html', { waitUntil: 'domcontentloaded' });
  if (opts.sinModulo) await p.waitForURL(u => new URL(u).pathname === '/', { timeout: 8000 });
  else if (!opts.sinPermiso) await p.waitForSelector('.met-idea', { timeout: 8000 });
  else await p.waitForSelector('#metDenied:not(.hidden)', { timeout: 8000 });
  return { p, ctx, errs, fuera };
}
const textos = (p, sel) => p.$$eval(sel, xs => xs.map(x => x.innerText.replace(/\s+/g, ' ').trim()));
const llamadas = (p, n) => p.evaluate(n => window.__llamadas.filter(x => x.n === n).map(x => x.prm), n);

// Presidencia, club
{
  const { p, ctx, errs, fuera } = await abre();
  if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/metricas-club.png`, fullPage: true });
  const ideas = await textos(p, '.met-idea');
  revisa('1. recomendaciones: entre 1 y 4, cada una dice su tipo en palabra', ideas.length >= 1 && ideas.length <= 4 && ideas.every(t => /^(Atención|Oportunidad|Va bien|Dato)/i.test(t)), JSON.stringify(ideas));
  revisa('1. club: el sitio sin medir sale como oportunidad', ideas.some(t => /^Oportunidad Tu sitio todavía no mide visitas/i.test(t)), JSON.stringify(ideas));
  const pasos = await textos(p, '#metEmbudo li');
  revisa('2. embudo del club: seis pasos de "te ven" a "inscritos"', pasos.length === 6 && /Te ven en redes/.test(pasos[0]) && /Inscritos/.test(pasos[5]), JSON.stringify(pasos));
  revisa('2. el embudo suma lo que te ven en redes (alcance IG + vistas FB)', /3,570/.test(pasos[0]), pasos[0]);
  revisa('2. el embudo marca dónde se pierde la pista', /se pierde la pista en «Entran a tus sitios»/.test(await p.innerText('#metEmbudoSub')) && (await p.$$('#metEmbudo li.corte')).length === 1);
  revisa('2. prospectos e inscritos del periodo', /Prospectos 2/.test(pasos[4]) && /Inscritos 1/.test(pasos[5]), JSON.stringify(pasos.slice(4)));
  const kpis = await textos(p, '.met-kpi');
  const kpi = t => kpis.find(x => x.startsWith(t)) || '';
  revisa('3. seguidores de Instagram = último valor (992)', /992/.test(kpi('Seguidores en Instagram')), kpi('Seguidores en Instagram'));
  revisa('3. lo que no se mide dice "Sin medir", nunca 0', /Sin medir/.test(kpi('Visitas a tus sitios')) && !/^Visitas a tus sitios.*\b0\b/.test(kpi('Visitas a tus sitios')), kpi('Visitas a tus sitios'));
  revisa('3. sin semana anterior no se inventa la flecha', !/vs 28 días antes/.test(kpi('Alcance en Instagram')) && /Sin periodo anterior/.test(kpi('Alcance en Instagram')), kpi('Alcance en Instagram'));
  revisa('3. posición de Google con su ayuda (más bajo es mejor)', /Posición promedio en Google.*1 es el primer resultado.*1\.9/.test(kpi('Posición promedio en Google')), kpi('Posición promedio en Google'));
  revisa('3. Presidencia ve lo cobrado', /Cobrado.*18,500/.test(kpi('Cobrado')), kpi('Cobrado'));
  revisa('3. sin anuncios: gasto en $0 real (la fuente está al día)', /\$0/.test(kpi('Gasto en anuncios')), kpi('Gasto en anuncios'));
  const fuentes = await textos(p, '#metFuentes li');
  revisa('4. fuentes: al día y la bloqueada con su motivo', fuentes.some(t => /Al día Instagram/.test(t)) && fuentes.some(t => /Bloqueada Perfil de Google.*acceso aprobado/.test(t)), JSON.stringify(fuentes));
  revisa('4. dice cuándo se actualizó', /Actualizado/.test(await p.innerText('#metActualizado')));
  // Tendencia: el día y el valor al pasar el mouse.
  const sp = await p.$('.met-kpi .met-spark');
  await sp.scrollIntoViewIfNeeded();
  const box = await sp.boundingBox();
  await p.mouse.move(box.x + box.width - 2, box.y + box.height / 2);
  const tip = await p.$eval('.met-kpi .met-spark .met-spark-tip', t => ({ visible: !t.hidden, texto: t.textContent }));
  revisa('5. tendencia: al pasar el mouse dice el día y el valor', tip.visible && /: \d/.test(tip.texto), JSON.stringify(tip));
  revisa('6. el menú trae Métricas en Marketing', (await p.$$eval('#sidebarNav a', as => as.map(a => a.textContent.trim()))).some(t => /Métricas/.test(t)));

  // TCP
  await p.click('#metNegocio [data-negocio="tcp"]');
  const ideasT = await textos(p, '.met-idea');
  revisa('7. TCP: lo primero es que Facebook casi no conversa', /^Atención Facebook de TCP casi no conversa/i.test(ideasT[0] || ''), JSON.stringify(ideasT));
  const pasosT = await textos(p, '#metEmbudo li');
  revisa('7. TCP: el embudo termina en reservas sin conectar', /Quieren reservar Sin medir/.test(pasosT.at(-1) || ''), JSON.stringify(pasosT));
  revisa('7. TCP: sin lo cobrado del club y con su operación sin conectar', !(await textos(p, '.met-kpi')).some(t => /^Cobrado/.test(t)) && (await textos(p, '.met-kpi')).some(t => /Operación de TCP.*Sin medir/.test(t)));

  // Periodo
  const antes = (await llamadas(p, 'v2_bi_serie')).length;
  await p.click('#metPeriodo [data-periodo="7"]');
  await p.waitForFunction(n => window.__llamadas.filter(x => x.n === 'v2_bi_serie').length > n, antes);
  const ult = (await llamadas(p, 'v2_bi_serie')).at(-1);
  const esperado = new Date(Date.parse(`${HOY}T12:00:00Z`) - 14 * 864e5).toISOString().slice(0, 10);
  revisa('8. 7 días: pide la serie desde el inicio del periodo anterior hasta hoy', ult.desde === esperado && ult.hasta === HOY && ult.organization_id === ORG, JSON.stringify(ult));
  const pagina2 = await ctx.newPage();
  await pagina2.close();
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForSelector('.met-idea');
  revisa('8. se recuerdan el negocio y el periodo', await p.getAttribute('#metNegocio [data-negocio="tcp"]', 'aria-pressed') === 'true' && await p.getAttribute('#metPeriodo [data-periodo="7"]', 'aria-pressed') === 'true');
  revisa('9. sólo agregados: nada de personas en lo que se pidió', (await llamadas(p, 'v2_bi_serie')).every(x => Object.keys(x).sort().join() === 'desde,hasta,organization_id'));
  revisa('sin errores de página (Presidencia)', !errs.length, errs.join(' | '));
  revisa('nada sale a internet', !fuera.length, fuera.join(' '));
  await ctx.close();
}

// Zul: Operaciones con el permiso de Métricas
{
  const { p, ctx, errs } = await abre({ rol: 'Operaciones' });
  revisa('10. Zul ve las métricas', (await p.$$('.met-kpi')).length > 5);
  revisa('10. Zul no ve lo cobrado', !(await textos(p, '.met-kpi')).some(t => /^Cobrado/.test(t)));
  revisa('10. a Zul el menú le muestra Métricas', (await p.$$eval('#sidebarNav a', as => as.map(a => a.textContent.trim()))).some(t => /Métricas/.test(t)));
  revisa('sin errores de página (Zul)', !errs.length, errs.join(' | '));
  await ctx.close();
}

// Sin el módulo: el shell lo regresa a Inicio. Con el módulo en el menú pero
// sin permiso en la base (por ejemplo, se lo quitaron): el aviso, sin números.
{
  const { p, ctx } = await abre({ rol: 'Taquilla', sinModulo: true });
  revisa('11. sin el módulo: regresa a Inicio', new URL(p.url()).pathname === '/');
  await ctx.close();
  const b = await abre({ rol: 'Taquilla', sinPermiso: true });
  revisa('11. la base niega: el aviso y ningún número', await b.p.isVisible('#metDenied') && !(await b.p.$$('.met-kpi')).length);
  await b.ctx.close();
}

// Teléfono
{
  const { p, ctx, errs } = await abre({ ancho: 390 });
  if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/metricas-390.png`, fullPage: true });
  const ancho = await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  revisa('12. cabe a 390 px sin scroll horizontal', ancho);
  revisa('sin errores de página (390 px)', !errs.length, errs.join(' | '));
  await ctx.close();
}

await nav.close(); srv.close();
console.log(fallos ? `Métricas humo FAILED · ${fallos} de ${corridas}` : `Métricas humo OK · ${corridas} revisiones: recomendaciones, embudo, sin ceros inventados, TCP, periodo, Zul sin lo cobrado, sin permiso, 390 px`);
process.exit(fallos ? 1 : 0);
