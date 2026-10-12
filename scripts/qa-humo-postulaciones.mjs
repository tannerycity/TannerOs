// Postulaciones de staff en Chromium, con Supabase falso.
//
// Presidencia, 12/10/2026: "fichajes de formadores por TannerOS: que se
// inscriban y manden su CV, porque por WhatsApp a veces se van". Revisa:
//   /trabaja/      la convocatoria del club (puestos, requisitos, qué ofrece);
//                  sin lo mínimo no se manda; con CV se sube a su ruta y se
//                  liga; termina con folio; convocatoria cerrada no deja.
//   /candidatos/   la lista con su estado; filtros; WhatsApp con el mensaje
//                  armado; ver CV; cambiar estado y nota; quien no contrata
//                  ve el aviso; nada se sale a 390px.
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const T = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p.startsWith('/firmada/')) { r.writeHead(200, { 'content-type': 'application/pdf' }); r.end('%PDF-1.4 cv'); return; }
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
  await p.addInitScript(({ opts, ORG, BASE }) => {
    window.__llamadas = [];
    const apps = [
      { id: 'a1', folio: 'ST-2026-0002', fullName: 'Ana Ruiz Soto', phone: '4771112233', age: 22, city: 'León', positions: ['Formador Baby Tanners (3–6 años)'], experience: '1 a 2 años', studies: 'Ciencias del Deporte', availability: ['Lunes a jueves por la tarde'], about: 'Entrené en escuela de fútbol.', cvPath: `organizations/${ORG}/staff/a1/cv.pdf`, status: 'nueva', notes: null, createdAt: '2026-10-12T15:00:00Z' },
      { id: 'a2', folio: 'ST-2026-0001', fullName: 'Luis Pérez', phone: '4774445566', positions: ['Formador Tanners (T8–T15)'], availability: [], cvPath: null, status: 'contratado', notes: 'Empieza el lunes', createdAt: '2026-10-10T15:00:00Z' }];
    const R = {
      v2_public_context: () => ({ organizationId: ORG, organizationName: 'Tannery City FC', slug: 'tannery-city-fc' }),
      v2_public_staff_call: () => ({ club: 'Tannery City FC', open: opts.cerrada ? false : true, intro: 'Buscamos formadores.', positions: ['Formador Baby Tanners (3–6 años)', 'Formador Tanners (T8–T15)'],
        requirements: ['Experiencia con niños', 'Mayor de edad'], offer: 'Contrato de 1 año mínimo · bonos · uniformes' }),
      v2_public_apply_staff: () => ({ applicationId: '0a0a0a0a-1111-4222-8333-444455556666', folio: 'ST-2026-0003' }),
      v2_public_attach_staff_cv: () => true,
      v2_my_context: () => [{ user_id: 'u1', display_name: 'Mich', organization_id: ORG, organization_name: 'Tannery City FC', organization_slug: 'tannery-city-fc', role: opts.rol || 'Presidencia', is_owner: true }],
      v2_my_navigation: () => (opts.rol === 'Taquilla' ? ['taquilla', 'inicio'] : ['usuarios', 'inicio', 'jugadores']).map(c => ({ module_code: c, enabled: true, can_read: true, can_write: true })),
      v2_staff_applications: () => { if (opts.rol === 'Taquilla') throw new Error('Not authorized'); return JSON.parse(JSON.stringify(apps)); },
      v2_update_staff_application: prm => { const a = apps.find(x => x.id === prm.application_id); if (prm.status) a.status = prm.status; if (prm.notes !== null) a.notes = prm.notes; return { id: a.id, status: a.status, notes: a.notes }; }
    };
    const store = {
      upload: async (ruta, archivo, o) => { window.__llamadas.push({ n: 'upload', prm: { ruta, tipo: o?.contentType, upsert: !!o?.upsert } }); return { data: { path: ruta }, error: null }; },
      createSignedUrls: async ps => ({ data: ps.map(x => ({ path: x, signedUrl: `${BASE}/firmada/${encodeURIComponent(x)}`, error: null })), error: null }),
      createSignedUrl: async x => ({ data: { signedUrl: `${BASE}/firmada/${encodeURIComponent(x)}` }, error: null })
    };
    window.__fakeSupabase = {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }), getUser: async () => ({ data: { user: { id: 'u1' } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
      rpc: async (n, prm) => { window.__llamadas.push({ n, prm: JSON.parse(JSON.stringify(prm || {})) }); try { return { data: R[n] ? R[n](prm) : null, error: null }; } catch (e) { return { data: null, error: { message: e.message } }; } },
      from: () => ({ select() { return this; }, eq() { return this; }, then(r) { return Promise.resolve({ data: [], error: null }).then(r); } }),
      storage: { from: () => store }, channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {}
    };
  }, { opts, ORG, BASE });
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.route('**/v2/supabase-client.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'export function createClient(){ return window.__fakeSupabase; }' }));
  await p.goto(BASE + ruta, { waitUntil: 'domcontentloaded' });
  return p;
}
const llamadas = (p, n) => p.evaluate(n => window.__llamadas.filter(x => x.n === n).map(x => x.prm), n);

{ // /trabaja/
  const p = await abre('/trabaja/');
  await p.waitForSelector('#tjForm', { timeout: 6000 });
  if (process.env.QA_CAPTURA) await p.screenshot({ path: process.env.QA_CAPTURA, fullPage: true });
  const conv = await p.innerText('.tj-convocatoria');
  revisa('[convocatoria] puestos, requisitos y qué ofrece', /Formador Baby Tanners/.test(conv) && /Mayor de edad/.test(conv) && /Contrato de 1 año/.test(conv), conv);
  revisa('[convocatoria] el nombre del club arriba', (await p.textContent('#clubName')) === 'TANNERY CITY FC');
  await p.click('#tjEnviar');
  revisa('[validación] sin lo mínimo no se manda y dice qué falta', /nombre completo/.test(await p.textContent('#formMessage')) && /al menos un puesto/.test(await p.textContent('#formMessage')) && (await llamadas(p, 'v2_public_apply_staff')).length === 0);
  await p.fill('#tjNombre', '  Ana   Ruiz Soto '); await p.fill('#tjTel', '477 111 2233'); await p.fill('#tjEdad', '22');
  await p.click('label[for="tjPuesto0"], #tjPuesto0 + span');
  await p.click('#tjDisp0 + span');
  await p.selectOption('#tjExp', '1 a 2 años');
  await p.setInputFiles('#tjCv', { name: 'CV Ana.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 hola') });
  await p.click('#tjEnviar');
  revisa('[validación] sin aceptar el aviso tampoco', /aviso de privacidad/.test(await p.textContent('#formMessage')));
  await p.check('#tjAviso');
  await p.click('#tjEnviar');
  await p.waitForSelector('.success', { timeout: 6000 }).catch(() => {});
  const alta = (await llamadas(p, 'v2_public_apply_staff'))[0]?.application;
  revisa('[envío] datos limpios al servidor', alta?.fullName === 'Ana Ruiz Soto' && alta.phone === '4771112233' && alta.age === 22 && JSON.stringify(alta.positions) === '["Formador Baby Tanners (3–6 años)"]'
    && JSON.stringify(alta.availability) === '["Lunes a jueves por la tarde"]' && alta.experience === '1 a 2 años' && alta.consent?.dataAccepted === true, JSON.stringify(alta));
  const sube = (await llamadas(p, 'upload'))[0], liga = (await llamadas(p, 'v2_public_attach_staff_cv'))[0];
  revisa('[CV] se sube a la ruta de su postulación, sin pisar', sube?.ruta === `organizations/${ORG}/staff/0a0a0a0a-1111-4222-8333-444455556666/cv.pdf` && sube.tipo === 'application/pdf' && !sube.upsert, JSON.stringify(sube));
  revisa('[CV] y se liga con su nombre', liga?.cv_path === sube?.ruta && liga.cv_name === 'CV Ana.pdf', JSON.stringify(liga));
  const ok = await p.innerText('.success');
  revisa('[fin] gracias con su nombre y folio', /Gracias, Ana/.test(ok) && /ST-2026-0003/.test(ok) && /4771112233/.test(ok), ok);
  revisa('[sin desborde] /trabaja/ cabe a 390px', !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
  await p.close();
}

{ // convocatoria cerrada
  const p = await abre('/trabaja/', { cerrada: true });
  await p.waitForSelector('.empty-state', { timeout: 6000 }).catch(() => {});
  revisa('[cerrada] dice que no hay vacantes y no hay formulario', /no hay vacantes/i.test(await p.textContent('#content')) && !(await p.$('#tjForm')));
  await p.close();
}

{ // /candidatos/
  const p = await abre('/v2/candidatos/');
  await p.waitForSelector('.cand', { timeout: 6000 });
  revisa('[lista] arranca en activas: sólo la nueva', (await p.$$('.cand')).length === 1 && /Ana Ruiz Soto/.test(await p.textContent('.cand')));
  revisa('[lista] los conteos por estado', (await p.innerText('#candKpis')).replace(/\s+/g, ' ').includes('1 Nueva'));
  revisa('[liga] la liga para el flyer es la del club', /\/trabaja\/\?club=tannery-city-fc$/.test(await p.textContent('#candLiga')));
  const wa = await p.getAttribute('.cand a.primary', 'href');
  revisa('[WhatsApp] con lada y el mensaje armado', /^https:\/\/wa\.me\/524771112233\?text=/.test(wa) && /Hola Ana, te escribimos de Tannery City FC/.test(decodeURIComponent(wa)) && /ST-2026-0002/.test(decodeURIComponent(wa)), wa);
  const [popup] = await Promise.all([p.waitForEvent('popup', { timeout: 5000 }).catch(() => null), p.click('[data-cv]')]);
  await popup?.waitForURL(u => !String(u).startsWith('about:'), { timeout: 5000 }).catch(() => {});
  revisa('[CV] se abre en otra pestaña', !!popup && /^(blob:|http)/.test(popup.url()), popup?.url());
  await popup?.close();
  await p.selectOption('.cand [data-estado]', 'entrevista');
  await p.waitForFunction(() => window.__llamadas.some(x => x.n === 'v2_update_staff_application'), null, { timeout: 4000 }).catch(() => {});
  const cambio = (await llamadas(p, 'v2_update_staff_application'))[0];
  revisa('[estado] se guarda', cambio?.application_id === 'a1' && cambio.status === 'entrevista' && cambio.notes === null, JSON.stringify(cambio));
  await p.fill('.cand [data-nota]', 'Entrevista martes 6 pm'); await p.dispatchEvent('.cand [data-nota]', 'change');
  await p.waitForFunction(() => window.__llamadas.filter(x => x.n === 'v2_update_staff_application').length >= 2, null, { timeout: 4000 }).catch(() => {});
  const nota = (await llamadas(p, 'v2_update_staff_application'))[1];
  revisa('[nota] se guarda sin tocar el estado', nota?.notes === 'Entrevista martes 6 pm' && nota.status === null, JSON.stringify(nota));
  await p.click('[data-filtro="contratado"]');
  revisa('[filtro] contratados muestra a Luis, sin CV', (await p.$$('.cand')).length === 1 && /Luis Pérez/.test(await p.textContent('.cand')) && /Sin CV/.test(await p.textContent('.cand')));
  revisa('[sin desborde] /candidatos/ cabe a 390px', !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
  await p.close();
}

{ // quien no contrata
  const p = await abre('/v2/candidatos/', { rol: 'Taquilla' });
  await p.waitForTimeout(1200);
  // El shell manda a la entrada y la pantalla corta con "No access": es lo esperado.
  for (let i = errores.length - 1; i >= 0; i--) if (errores[i] === 'pageerror: No access') errores.splice(i, 1);
  revisa('[acceso] sin Usuarios ni Dirección deportiva no entra', !(await p.$('.cand')) && !/candidatos/.test(new URL(p.url()).pathname), p.url());
  await p.close();
}

await nav.close(); srv.close();
let mal = 0;
for (const r of revisiones) if (!r.ok) { mal++; console.error(` - ${r.nombre}${r.detalle ? ' :: ' + r.detalle : ''}`); }
if (errores.length) { console.error('ERRORES DEL NAVEGADOR:'); errores.forEach(e => console.error('   ' + e)); }
if (mal || errores.length) { console.error(`Postulaciones humo FAILED · ${mal} de ${revisiones.length}, ${errores.length} errores`); process.exit(1); }
console.log(`Postulaciones humo OK · ${revisiones.length} revisiones: convocatoria, postulación con CV, candidatos, estados y acceso`);
