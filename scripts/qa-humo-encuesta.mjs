// Encuesta de experiencia en Chromium, con Supabase falso.
//
// Presidencia, 15/10/2026: "que los papás Tanners y los que vinieron del Club
// León contesten cómo se la pasaron... y luego hacer gráficas". Revisa:
//   /encuesta/?e=leon-oct26&vs=Club%20León
//     sin decir quién eres no se manda; el visitante trae su club de la liga;
//     las calificaciones 1–5 y "No lo usé" (que no se manda); NPS 0–10;
//     el WhatsApp sólo viaja si se pidió contacto; termina en gracias;
//     un error del servidor se muestra y deja reintentar; nada se sale a 390px;
//     el nombre del evento y el club salen de v2_public_survey; cerrada no deja.
//   /encuestas/ (Presidencia)
//     la lista de encuestas; crear una nueva saca su liga; resultados con
//     barras Tanner contra visitantes, NPS, conclusiones y comentarios;
//     cerrar la encuesta; quien no es Presidencia ve el aviso; cabe a 390px.
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
      v2_public_context: () => ({ organizationId: ORG, organizationName: 'Tannery City FC', slug: 'tannery-city-fc', categories: ['Baby Tanner', 'T6', 'T10', 'T12'] }),
      v2_public_survey: prm => prm.survey === 'leon-oct26' ? { found: true, title: 'Visita del Club León', visitorClub: 'Club León', open: !opts.cerrada } : prm.survey === 'comunidad' ? { found: true, title: 'Experiencia Tannery City', visitorClub: null, open: true } : { found: false, open: true },
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
  await p.waitForSelector(opts.cerrada ? '.en-titulo' : '#enForm', { timeout: 6000 });
  return p;
}
const envios = p => p.evaluate(() => window.__llamadas.filter(x => x.n === 'v2_public_submit_survey').map(x => x.prm));
const nota = (p, tema, v) => p.click(`[data-tema="${tema}"] input[value="${v}"] >> xpath=..`);

{ // El evento registrado trae su nombre y su club, sin &vs=
  const p = await abre('/encuesta/?e=leon-oct26');
  revisa('[evento] nombre del evento arriba', /Visita del Club León/i.test(await p.locator('.en-club').innerText()));
  revisa('[evento] el club visitante sale de la base', /Club León/.test(await p.locator('.en-carta').nth(1).innerText()));
  await p.close();
}

{ // Encuesta cerrada: no hay formulario
  const p = await abre('/encuesta/?e=leon-oct26', { cerrada: true });
  revisa('[cerrada] dice que ya cerró y no hay formulario', /ya cerró/i.test(await p.locator('.en-titulo').innerText()) && (await p.locator('#enForm').count()) === 0);
  await p.close();
}

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

{ // Comunidad: papá Tanner con dos hijos, sin contacto, y el servidor falla una vez
  const p = await abre('/encuesta/', { falla: 1 });
  revisa('[comunidad] sin ?e= es la de comunidad', /Experiencia Tannery City/i.test(await p.locator('.en-club').innerText()));
  revisa('[comunidad] categorías escondidas hasta elegir Tanner', !(await p.locator('#enCatCaja').isVisible()));
  await p.click('.en-carta:nth-child(1)');
  revisa('[tanner] no pide club y sí categoría', !(await p.locator('#enClubCaja').isVisible()) && await p.locator('#enCatCaja').isVisible());
  revisa('[tanner] las categorías del club', (await p.locator('#enCatCaja .en-chip').allInnerTexts()).join(',') === 'Baby Tanner,T6,T10,T12');
  await p.click('.en-n:has(input[value="3"])');
  await p.click('#enEnviar');
  revisa('[tanner] sin categoría no se manda', (await envios(p)).length === 0 && /categoría de tu hijo/.test(await p.locator('#formMessage').innerText()));
  await p.click('#enCatCaja .en-chip:has(input[value="Baby Tanner"])');
  await p.click('#enCatCaja .en-chip:has(input[value="T10"])');
  await p.click('.en-chip:has(input[value="partidos"])');
  await p.click('.en-chip:has(input[value="entrenamientos"])');
  await p.click('#enEnviar');
  await p.waitForFunction(() => !document.getElementById('enEnviar')?.disabled, null, { timeout: 4000 });
  revisa('[error] se muestra y deja reintentar', /Demasiados intentos/.test(await p.locator('#formMessage').innerText()) && /^enviar encuesta$/i.test(await p.locator('#enEnviar').innerText()));
  await p.click('#enEnviar');
  await p.waitForSelector('.en-gracias', { timeout: 4000 }).catch(() => {});
  const r = (await envios(p)).at(-1)?.response || {};
  revisa('[tanner] categorías y a qué vino', JSON.stringify(r.categories) === '["Baby Tanner","T10"]' && JSON.stringify(r.visit) === '["entrenamientos","partidos"]', JSON.stringify(r));
  revisa('[tanner] encuesta de comunidad, sin club ni contacto', r.survey === 'comunidad' && r.respondent === 'tanner' && r.club === null && r.contactName === null && r.contactPhone === null && r.consent?.contact === false, JSON.stringify(r));
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
  revisa('[otro] no manda categorías', JSON.stringify(r.categories) === '[]' && JSON.stringify(r.visit) === '[]', JSON.stringify(r));
  await p.close();
}

// ---------- /encuestas/ (Presidencia) ----------
const RES = {
  encuesta: { slug: 'leon-oct26', title: 'Visita del Club León', visitorClub: 'Club León', open: true },
  total: 6, porTipo: { tanner: 4, visitante: 2 },
  temas: [
    { tema: 'ambiente', tipo: 'tanner', promedio: 5, n: 4 }, { tema: 'ambiente', tipo: 'visitante', promedio: 4.5, n: 2 },
    { tema: 'banos', tipo: 'tanner', promedio: 4, n: 3 }, { tema: 'banos', tipo: 'visitante', promedio: 2, n: 2 },
    { tema: 'estacionamiento', tipo: 'tanner', promedio: 3, n: 4 }, { tema: 'tienda', tipo: 'tanner', promedio: 4.5, n: 2 }],
  distribucion: [], nps: { n: 5, promotores: 3, detractores: 1 },
  npsPorTipo: { tanner: { n: 4, promotores: 3, detractores: 0 }, visitante: { n: 1, promotores: 0, detractores: 1 } },
  comentarios: [
    { tipo: 'visitante', club: 'Club León', gusto: 'La cancha', mejorar: 'Más baños', nps: 6, fecha: '2026-10-15T18:00:00Z', contacto: 'Pedro', telefono: '4771234567' },
    { tipo: 'tanner', categorias: ['Baby Tanner'], club: null, gusto: 'El ambiente', mejorar: null, nps: 10, fecha: '2026-10-15T17:00:00Z', contacto: null, telefono: null }],
  porCategoria: [{ categoria: 'Baby Tanner', n: 3, promedio: 4.6, npsN: 3, promotores: 3, detractores: 0 }, { categoria: 'T6', n: 1, promedio: 3.2, npsN: 1, promotores: 0, detractores: 1 }],
  porVisita: { partidos: 4, entrenamientos: 2 }
};
async function abrePanel(opts = {}) {
  const p = await nav.newPage({ viewport: { width: opts.ancho || 1280, height: 900 } });
  p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(`console: ${m.text()}`); });
  await p.addInitScript(({ opts, ORG, RES }) => {
    window.__llamadas = [];
    const lista = [
      { slug: 'leon-oct26', title: 'Visita del Club León', visitorClub: 'Club León', open: true, registrada: true, total: 6, tanner: 4, visitante: 2, nps: 40, ultima: '2026-10-15T18:00:00Z' },
      { slug: 'torneo-relampago', title: 'Torneo relámpago', visitorClub: null, open: true, registrada: true, total: 0, tanner: 0, visitante: 0, nps: null, ultima: null }];
    const R = {
      v2_my_context: () => [{ user_id: 'u1', display_name: 'Mich', organization_id: ORG, organization_name: 'Tannery City FC', organization_slug: 'tannery-city-fc', role: opts.rol || 'Presidencia', is_owner: !opts.rol }],
      v2_my_navigation: () => (opts.rol ? ['inicio', 'direccion'] : ['inicio', 'direccion', 'usuarios']).map(c => ({ module_code: c, enabled: true, can_read: true, can_write: true })),
      v2_surveys: () => { if (opts.rol) throw new Error('Sólo Presidencia ve las encuestas'); return JSON.parse(JSON.stringify(lista)); },
      v2_survey_results: prm => prm.survey === 'leon-oct26' ? JSON.parse(JSON.stringify(RES)) : { total: 0, porTipo: {}, temas: [], nps: { n: 0, promotores: 0, detractores: 0 }, npsPorTipo: {}, comentarios: [] },
      v2_create_survey: prm => { const slug = 'partido-vs-atlas'; lista.unshift({ slug, title: prm.title, visitorClub: prm.visitor_club, open: true, registrada: true, total: 0, tanner: 0, visitante: 0, nps: null, ultima: null }); return { id: 'n', slug }; },
      v2_set_survey_open: prm => { lista.find(x => x.slug === prm.survey).open = prm.open; return { slug: prm.survey, open: prm.open }; }
    };
    window.__fakeSupabase = {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }), getUser: async () => ({ data: { user: { id: 'u1' } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
      rpc: async (n, prm) => { window.__llamadas.push({ n, prm: JSON.parse(JSON.stringify(prm || {})) }); try { return { data: R[n] ? R[n](prm) : null, error: null }; } catch (e) { return { data: null, error: { message: e.message } }; } },
      from: () => ({ select() { return this; }, eq() { return this; }, then(r) { return Promise.resolve({ data: [], error: null }).then(r); } }),
      storage: { from: () => ({}) }, channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {}
    };
  }, { opts, ORG, RES });
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.route('**/v2/supabase-client.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'export function createClient(){ return window.__fakeSupabase; }' }));
  await p.goto(BASE + (opts.ruta || '/v2/encuestas/index.html'), { waitUntil: 'domcontentloaded' });
  return p;
}
const llamadasPanel = (p, n) => p.evaluate(n => window.__llamadas.filter(x => x.n === n).map(x => x.prm), n);

{ // Resultados de la de León
  const p = await abrePanel();
  await p.waitForSelector('.enc-barras', { timeout: 6000 });
  if (process.env.QA_CAPTURA_PANEL) await p.screenshot({ path: process.env.QA_CAPTURA_PANEL, fullPage: true });
  revisa('[panel] dos encuestas en la lista, la primera elegida', (await p.locator('.enc-tarjeta').count()) === 2 && /León/i.test(await p.locator('.enc-tarjeta.activa').innerText()));
  revisa('[panel] la liga lleva el evento y el club', /\/encuesta\/\?club=tannery-city-fc&e=leon-oct26/.test(await p.locator('.enc-liga strong').innerText()), await p.locator('.enc-liga strong').innerText());
  revisa('[panel] KPIs: 6 respuestas y NPS +40', /6/.test(await p.locator('.enc-kpis article').first().innerText()) && /\+40/.test(await p.locator('.enc-kpis').innerText()));
  const filas = await p.locator('.enc-panel', { hasText: 'Calificación por tema' }).locator('.enc-fila-cab span').allInnerTexts();
  revisa('[gráfica] temas ordenados de mejor a peor, sin votos al final', filas[0] === 'Ambiente general' && filas.indexOf('Baños') < filas.indexOf('Seguridad para los niños') && filas.length === 9, filas.join(' | '));
  revisa('[gráfica] baños: barra Tanner 4.0 y visitantes 2.0', await p.locator('.enc-fila', { hasText: 'Baños' }).locator('.enc-barra b').allInnerTexts().then(v => v.join(',') === '4.0,2.0'));
  revisa('[gráfica] leyenda con los dos tipos', (await p.locator('.enc-leyenda span').allInnerTexts()).join(',') === 'Tanner,Visitantes');
  revisa('[gráfica] tooltip con votos', /Visitantes: 2.0 de 5 · 2 votos/.test(await p.locator('.enc-fila', { hasText: 'Baños' }).locator('.enc-barra').nth(1).getAttribute('data-tip')));
  revisa('[semáforo] baños 3.2 dice Atender', /3.2 · Atender/.test(await p.locator('.enc-fila', { hasText: 'Baños' }).locator('.enc-sem').innerText()));
  revisa('[conclusiones] fuertes, atender y brecha en baños', /Ambiente general/.test(await p.locator('.enc-concl .bien').innerText()) && /Estacionamiento/.test(await p.locator('.enc-concl .mal').innerText()) && /Baños/.test(await p.locator('.enc-concl .mal').innerText()) && !/Baños/.test(await p.locator('.enc-concl .bien').innerText()) && /Baños/.test(await p.locator('.enc-concl .brecha').innerText()));
  revisa('[nps] tres barras: todos, Tanner y visitantes', (await p.locator('.enc-nps-fila').count()) === 3 && /\+75/.test(await p.locator('.enc-nps-fila').nth(1).innerText()) && /-100/.test(await p.locator('.enc-nps-fila').nth(2).innerText()));
  revisa('[aviso] menos de 20 respuestas avisa', await p.locator('.enc-aviso').isVisible());
  revisa('[comentarios] dos y el contacto con WhatsApp', (await p.locator('.enc-com').count()) === 2 && /wa\.me\/524771234567/.test(await p.locator('.enc-wa').getAttribute('href')));
  await p.click('[data-com="visitante"]');
  revisa('[comentarios] filtro por visitantes', (await p.locator('.enc-com').count()) === 1);
  await p.click('[data-com="tanner"]');
  revisa('[comentarios] el de Tanner dice su categoría', /Baby Tanner/.test(await p.locator('.enc-com .enc-chip').innerText()));
  const cats = p.locator('.enc-panel', { hasText: 'Por categoría' });
  revisa('[categoría] Baby Tanner fuerte y T6 a atender', /4.6 · Fuerte/.test(await cats.locator('.enc-fila').nth(0).innerText()) && /3.2 · Atender/.test(await cats.locator('.enc-fila').nth(1).innerText()));
  revisa('[categoría] respuestas y NPS por categoría', /3 respuestas · NPS \+100/.test(await cats.locator('.enc-fila').nth(0).innerText()), await cats.locator('.enc-fila').nth(0).innerText());
  revisa('[visita] a qué vinieron, en orden', /Entrenamientos 2[\s\S]*Partidos 4/.test(await p.locator('.enc-visita').innerText()), await p.locator('.enc-visita').innerText());
  revisa('[tabla] la tabla tiene los 9 temas', (await p.locator('.enc-tabla tbody tr').count()) === 9);
  await p.click('#encAbrir');
  await p.waitForFunction(() => /abrir/i.test(document.getElementById('encAbrir')?.textContent || ''), null, { timeout: 3000 }).catch(() => {});
  revisa('[cerrar] cierra y la tarjeta dice Cerrada', (await llamadasPanel(p, 'v2_set_survey_open'))[0]?.open === false && /Cerrada/i.test(await p.locator('.enc-tarjeta.activa').innerText()));
  await p.click('.enc-tarjeta:nth-child(2)');
  await p.waitForSelector('.enc-vacio', { timeout: 3000 }).catch(() => {});
  revisa('[vacía] encuesta sin respuestas lo dice', /Todavía no hay respuestas/.test(await p.locator('.enc-detalle').innerText()) && /e=torneo-relampago/.test(p.url()));
  await p.close();
}

{ // Nueva encuesta desde el botón + (?nueva=1), a 390px
  const p = await abrePanel({ ancho: 390, ruta: '/v2/encuestas/index.html?nueva=1' });
  await p.waitForSelector('#encNueva:not(.hidden)', { timeout: 6000 });
  await p.click('#encCrear');
  revisa('[nueva] sin nombre no se crea', (await llamadasPanel(p, 'v2_create_survey')).length === 0);
  await p.fill('#encTitulo', 'Partido vs Atlas'); await p.fill('#encVisita', 'Atlas');
  await p.click('#encCrear');
  await p.waitForFunction(() => /partido-vs-atlas/.test(document.querySelector('.enc-liga strong')?.textContent || ''), null, { timeout: 4000 }).catch(() => {});
  const c = (await llamadasPanel(p, 'v2_create_survey'))[0];
  revisa('[nueva] manda nombre y club', c?.title === 'Partido vs Atlas' && c?.visitor_club === 'Atlas', JSON.stringify(c));
  revisa('[nueva] queda elegida con su liga', /e=partido-vs-atlas/.test(await p.locator('.enc-liga strong').innerText()) && await p.locator('#encNueva').isHidden());
  revisa('[sin desborde] /encuestas/ cabe a 390px', !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
  await p.close();
}

{ // Quien no es Presidencia ve el aviso
  const p = await abrePanel({ rol: 'Operaciones' });
  await p.waitForSelector('#encDenied:not(.hidden)', { timeout: 6000 }).catch(() => {});
  revisa('[acceso] no Presidencia ve el aviso', await p.locator('#encDenied').isVisible() && await p.locator('#encNuevaBtn').isHidden());
  for (let i = errores.length - 1; i >= 0; i--) if (errores[i] === 'pageerror: No access') errores.splice(i, 1);
  await p.close();
}

await nav.close(); srv.close();
let mal = 0;
for (const r of revisiones) if (!r.ok) { mal++; console.error(` - ${r.nombre}${r.detalle ? ' :: ' + r.detalle : ''}`); }
if (errores.length) { console.error('ERRORES DEL NAVEGADOR:'); errores.forEach(e => console.error('   ' + e)); }
if (mal || errores.length) { console.error(`Encuesta humo FAILED · ${mal} de ${revisiones.length}, ${errores.length} errores`); process.exit(1); }
console.log(`Encuesta humo OK · ${revisiones.length} revisiones: quién contesta, calificaciones, NPS, contacto, envío, encuesta cerrada y panel de resultados`);
