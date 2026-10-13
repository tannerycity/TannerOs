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
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mP8z8DwnwEIGBkZGRgYGAAt+wP9wVhbGgAAAABJRU5ErkJggg==', 'base64');

async function abre(ruta, opts = {}) {
  const p = await nav.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(`console: ${m.text()}`); });
  await p.addInitScript(({ opts, ORG, BASE }) => {
    window.__llamadas = [];
    const apps = [
      { id: 'a1', folio: 'ST-2026-0002', fullName: 'Ana Ruiz Soto', phone: '4771112233', age: 22, city: 'León', positions: ['Formador Baby Tanners (3–6 años)'], experience: '1 a 2 años', studies: 'Ciencias del Deporte', availability: ['Lunes a jueves por la tarde'], about: 'Entrené en escuela de fútbol.', cvPath: `organizations/${ORG}/staff/a1/cv.pdf`, photoThumbPath: `organizations/${ORG}/staff/a1/foto-thumb.webp`, status: 'nueva', notes: null, createdAt: '2026-10-12T15:00:00Z', updatedAt: '2026-10-12T15:00:00Z' },
      { id: 'a2', folio: 'ST-2026-0001', fullName: 'Luis Pérez', phone: '4774445566', positions: ['Formador Tanners (T6–T12)'], availability: [], cvPath: null, status: 'contratado', notes: 'Empieza el lunes', createdAt: '2026-10-10T15:00:00Z', updatedAt: '2026-10-11T15:00:00Z' },
      { id: 'a3', folio: 'ST-2026-0003', fullName: 'Carla Gómez', phone: '4777778899', positions: ['Formador Tanners (T6–T12)'], availability: [], status: 'revision', notes: 'Muy buena actitud', createdAt: '2026-10-01T15:00:00Z', updatedAt: '2026-10-02T15:00:00Z' }];
    const R = {
      v2_public_context: () => ({ organizationId: ORG, organizationName: 'Tannery City FC', slug: 'tannery-city-fc' }),
      v2_public_staff_call: () => ({ club: 'Tannery City FC', open: opts.cerrada ? false : true, intro: 'En Tannery City formamos personas antes que futbolistas. Buscamos formadores con hambre de crecer: aquí trabajas con metodología propia, acompañamiento y un club que invierte en su staff.', positions: ['Formador Baby Tanners (3–6 años)', 'Formador Tanners (T6–T12)'],
        requirements: ['Experiencia con niños', 'Licencia o curso de entrenador', 'Estudiante o egresado de Ciencias del Deporte', 'Disponibilidad lunes a jueves por la tarde', 'Disponibilidad sábados (partidos)', 'Mayor de edad'], offer: 'Contrato de 1 año mínimo · Bonos por desempeño · Uniformes oficiales · Capacitación en la Metodología Tannery · Capacitaciones externas · Crecimiento dentro del club' }),
      v2_public_apply_staff: () => ({ applicationId: '0a0a0a0a-1111-4222-8333-444455556666', folio: 'ST-2026-0003' }),
      v2_public_attach_staff_cv: () => true,
      v2_public_attach_staff_photo: () => true,
      v2_my_context: () => [{ user_id: 'u1', display_name: 'Mich', organization_id: ORG, organization_name: 'Tannery City FC', organization_slug: 'tannery-city-fc', role: opts.rol || 'Presidencia', is_owner: true }],
      v2_my_navigation: () => (opts.rol === 'Taquilla' ? ['taquilla', 'inicio'] : ['usuarios', 'inicio', 'jugadores']).map(c => ({ module_code: c, enabled: true, can_read: true, can_write: true })),
      v2_staff_applications: () => { if (opts.rol === 'Taquilla') throw new Error('Not authorized'); return JSON.parse(JSON.stringify(apps)); },
      v2_delete_staff_application: prm => { const i = apps.findIndex(x => x.id === prm.application_id); const a = apps.splice(i, 1)[0]; return { id: a.id, paths: [a.cvPath, a.photoThumbPath].filter(Boolean) }; },
      v2_update_staff_application: prm => { const a = apps.find(x => x.id === prm.application_id); if (prm.status) a.status = prm.status; if (prm.notes !== null) a.notes = prm.notes; a.updatedAt = new Date().toISOString(); return { id: a.id, status: a.status, notes: a.notes, updatedAt: a.updatedAt }; }
    };
    const store = {
      upload: async (ruta, archivo, o) => { window.__llamadas.push({ n: 'upload', prm: { ruta, tipo: o?.contentType, upsert: !!o?.upsert } }); return { data: { path: ruta }, error: null }; },
      createSignedUrls: async ps => ({ data: ps.map(x => ({ path: x, signedUrl: `${BASE}/firmada/${encodeURIComponent(x)}`, error: null })), error: null }),
      remove: async ps => { window.__llamadas.push({ n: 'remove', prm: ps }); return { data: [], error: null }; },
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
  await p.context().route(/^https:\/\/wa\.me\//, r => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>wa</p>' }));
  await p.route('**/v2/supabase-client.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'export function createClient(){ return window.__fakeSupabase; }' }));
  await p.goto(BASE + ruta, { waitUntil: 'domcontentloaded' });
  return p;
}
const llamadas = (p, n) => p.evaluate(n => window.__llamadas.filter(x => x.n === n).map(x => x.prm), n);

{ // /trabaja/
  const p = await abre('/trabaja/');
  await p.waitForSelector('#tjForm', { timeout: 6000 });
  if (process.env.QA_CAPTURA) await p.screenshot({ path: process.env.QA_CAPTURA, fullPage: true });
  if (process.env.QA_CAPTURA) await p.screenshot({ path: process.env.QA_CAPTURA.replace('.png', '-portada.png') });
  const conv = await p.innerText('.tj-convocatoria');
  revisa('[convocatoria] puestos, requisitos y qué ofrece', /Formador Baby Tanners/.test(conv) && /Mayor de edad/.test(conv) && /Contrato de 1 año/.test(conv), conv);
  revisa('[convocatoria] el club y su escudo arriba', /Tannery City FC/.test(await p.textContent('.un-club')) && !!(await p.$('.un-escudo img[src="/brand/crest-gold.png"]')));
  revisa('[convocatoria] lo que ofrece, una tarjeta por cosa', (await p.$$('.un-ofrece li')).length === 6, String((await p.$$('.un-ofrece li')).length));
  revisa('[convocatoria] el botón lleva a la ficha', (await p.getAttribute('.un-hero .un-cta', 'href')) === '#ficha');
  await p.click('#tjEnviar');
  revisa('[validación] sin lo mínimo no se manda y dice qué falta', /nombre completo/.test(await p.textContent('#formMessage')) && /al menos un puesto/.test(await p.textContent('#formMessage')) && (await llamadas(p, 'v2_public_apply_staff')).length === 0);
  await p.fill('#tjNombre', '  Ana   Ruiz Soto '); await p.fill('#tjTel', '477 111 2233'); await p.fill('#tjEdad', '22');
  await p.click('label[for="tjPuesto0"], #tjPuesto0 + span');
  await p.click('#tjDisp0 + span');
  await p.selectOption('#tjExp', '1 a 2 años');
  await p.click('#tjEnviar');
  revisa('[validación] sin CV ni lo de la carta de antecedentes no se manda', /tu CV/.test(await p.textContent('#formMessage')) && /carta de no antecedentes penales/.test(await p.textContent('#formMessage')) && (await llamadas(p, 'v2_public_apply_staff')).length === 0, await p.textContent('#formMessage'));
  await p.setInputFiles('#tjCv', { name: 'CV Ana.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 hola') });
  await p.check('#tjAntecedentes');
  await p.click('#tjEnviar');
  revisa('[validación] sin foto ni aviso no se manda', /tu foto/.test(await p.textContent('#formMessage')) && /aviso de privacidad/.test(await p.textContent('#formMessage')));
  await p.setInputFiles('#tjFoto', { name: 'ana.png', mimeType: 'image/png', buffer: PNG });
  revisa('[foto] se ve la vista previa', /Foto lista/.test(await p.textContent('#tjFotoTexto')) && /url\(/.test(await p.$eval('#tjFotoVista', e => e.style.backgroundImage)));
  await p.check('#tjAviso');
  await p.click('#tjEnviar');
  await p.waitForSelector('.success', { timeout: 6000 }).catch(() => {});
  const alta = (await llamadas(p, 'v2_public_apply_staff'))[0]?.application;
  revisa('[envío] datos limpios al servidor', alta?.fullName === 'Ana Ruiz Soto' && alta.phone === '4771112233' && alta.age === 22 && JSON.stringify(alta.positions) === '["Formador Baby Tanners (3–6 años)"]'
    && JSON.stringify(alta.availability) === '["Lunes a jueves por la tarde"]' && alta.experience === '1 a 2 años' && alta.consent?.dataAccepted === true && alta.consent?.backgroundCheck === true, JSON.stringify(alta));
  const subidas = await llamadas(p, 'upload'), sube = subidas.find(x => /\/cv\./.test(x.ruta)), liga = (await llamadas(p, 'v2_public_attach_staff_cv'))[0];
  const fotos = subidas.filter(x => /\/foto/.test(x.ruta)), ligaFoto = (await llamadas(p, 'v2_public_attach_staff_photo'))[0];
  revisa('[foto] se sube chica, en dos tamaños, a la ruta de su postulación', fotos.length === 2 && fotos.some(x => /\/0a0a0a0a-1111-4222-8333-444455556666\/foto\.(webp|jpg)$/.test(x.ruta)) && fotos.some(x => /foto-thumb\.(webp|jpg)$/.test(x.ruta)) && fotos.every(x => /^image\/(webp|jpeg)$/.test(x.tipo) && !x.upsert), JSON.stringify(fotos));
  revisa('[foto] y se liga con su miniatura', ligaFoto && /foto\./.test(ligaFoto.photo_path) && /foto-thumb\./.test(ligaFoto.photo_thumb_path), JSON.stringify(ligaFoto));
  revisa('[CV] se sube a la ruta de su postulación, sin pisar', sube?.ruta === `organizations/${ORG}/staff/0a0a0a0a-1111-4222-8333-444455556666/cv.pdf` && sube.tipo === 'application/pdf' && !sube.upsert, JSON.stringify(sube));
  revisa('[CV] y se liga con su nombre', liga?.cv_path === sube?.ruta && liga.cv_name === 'CV Ana.pdf', JSON.stringify(liga));
  const ok = await p.innerText('.success');
  if (process.env.QA_CAPTURA) { await p.waitForTimeout(700); await p.screenshot({ path: process.env.QA_CAPTURA.replace('.png', '-final.png'), fullPage: true }); }
  revisa('[fin] la credencial trae su foto', !!(await p.$('.un-cred-quien img')));
  revisa('[fin] credencial de solicitud con su posición', /Solicitud de fichaje/i.test(ok) && /Formador Baby Tanners/i.test(ok) && /#WeAreTanners/i.test(ok), ok);
  revisa('[fin] invita a compartir la convocatoria', /^https:\/\/wa\.me\/\?text=.*unete%3Fclub%3Dtannery-city-fc/.test(await p.getAttribute('.un-comparte', 'href')));
  revisa('[fin] gracias con su nombre y folio', /Gracias, Ana/.test(ok) && /ST-2026-0003/.test(ok) && /4771112233/.test(ok), ok);
  revisa('[sin desborde] /trabaja/ cabe a 390px', !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
  await p.close();
}

{ // convocatoria cerrada
  const p = await abre('/trabaja/', { cerrada: true });
  await p.waitForSelector('.un-titulo', { timeout: 6000 }).catch(() => {});
  revisa('[cerrada] dice que no hay vacantes y no hay formulario', /no hay vacantes/i.test(await p.textContent('#content')) && !(await p.$('#tjForm')));
  await p.close();
}

{ // /candidatos/
  const p = await abre('/v2/candidatos/');
  await p.waitForSelector('.cand', { timeout: 6000 });
  const nombres = await p.$$eval('.cand .cand-nombre', e => e.map(x => x.textContent));
  revisa('[por atender] la nueva primero, luego la contactada; el contratado no', JSON.stringify(nombres) === '["Ana Ruiz Soto","Carla Gómez"]', JSON.stringify(nombres));
  revisa('[lista] los conteos por estado', /1\s*Nueva/i.test(await p.innerText('#candKpis')) && /1\s*Contactado/i.test(await p.innerText('#candKpis')), await p.innerText('#candKpis'));
  revisa('[liga] la liga para el flyer es la del club', /\/unete\?club=tannery-city-fc$/.test(await p.textContent('#candLiga')));
  revisa('[liga] el QR del flyer se dibuja', await p.$eval('#candQr', c => c.width === 264 && !c.classList.contains('hidden')));
  revisa('[guía] explica los 5 pasos', (await p.$$('.cand-guia li')).length === 5);
  await p.waitForFunction(() => document.querySelector('.cand[data-id="a1"] .cand-avatar img'), null, { timeout: 4000 }).catch(() => {});
  revisa('[foto] la tarjeta muestra la miniatura', !!(await p.$('.cand[data-id="a1"] .cand-avatar img')));
  const ana = '.cand[data-id="a1"]', carla = '.cand[data-id="a3"]';
  revisa('[camino] Ana va en Nueva; Carla en Contactado', await p.$eval(`${ana} .cand-camino li.actual`, e => e.textContent) === 'Nueva' && await p.$eval(`${carla} .cand-camino li.actual`, e => e.textContent) === 'Contactado');
  revisa('[seguimiento] Carla lleva días sin moverse y se avisa', /días sin moverse/.test(await p.textContent(`${carla} .cand-tarde`).catch(() => '')));
  revisa('[qué sigue] Ana: escribirle por WhatsApp', /Escríbele/.test(await p.textContent(`${ana} .cand-paso p`)) && /Escribirle por WhatsApp/.test(await p.textContent(`${ana} .cand-paso-btn.principal`)));
  if (process.env.QA_CAPTURA) await p.screenshot({ path: process.env.QA_CAPTURA.replace('.png', '-candidatos.png'), fullPage: true });
  const [wa1] = await Promise.all([p.waitForEvent('popup', { timeout: 5000 }).catch(() => null), p.click(`${ana} [data-accion="contactar"]`)]);
  await wa1?.close().catch(() => {});
  await p.waitForFunction(() => window.__llamadas.some(x => x.n === 'v2_update_staff_application'), null, { timeout: 4000 }).catch(() => {});
  const paso1 = (await llamadas(p, 'v2_update_staff_application'))[0];
  revisa('[un toque] abre WhatsApp y pasa a Contactado', !!wa1 && paso1?.application_id === 'a1' && paso1.status === 'revision', JSON.stringify(paso1));
  revisa('[un toque] y dice qué pasó', /pasó a: Contactado/.test(await p.textContent('#candMensaje')));
  await p.click('[data-filtro="todos"]');
  await p.click(`${ana} [data-accion="agendar"]`);
  await p.fill(`${ana} [data-fecha]`, '2026-10-14T18:00');
  const [wa2] = await Promise.all([p.waitForEvent('popup', { timeout: 5000 }).catch(() => null), p.click(`${ana} [data-confirma-fecha]`)]);
  await wa2?.waitForURL(/wa\.me/, { timeout: 4000 }).catch(() => {});
  const textoWa = decodeURIComponent(wa2?.url() || '');
  await wa2?.close().catch(() => {});
  await p.waitForFunction(() => window.__llamadas.filter(x => x.n === 'v2_update_staff_application').length >= 2, null, { timeout: 4000 }).catch(() => {});
  const paso2 = (await llamadas(p, 'v2_update_staff_application'))[1];
  revisa('[entrevista] guarda estado y la fecha en la nota', paso2?.status === 'entrevista' && /^Entrevista: miércoles, 14 de octubre/.test(paso2.notes || ''), JSON.stringify(paso2));
  revisa('[entrevista] y le avisa por WhatsApp con el día', /quedó tu entrevista con Tannery City FC el miércoles, 14 de octubre/.test(textoWa), textoWa.slice(0, 160));
  revisa('[entrevista] ahora pregunta cómo le fue', /Cómo le fue en la entrevista/.test(await p.textContent(`${ana} .cand-paso p`)));
  const [popup] = await Promise.all([p.waitForEvent('popup', { timeout: 5000 }).catch(() => null), p.click(`${ana} [data-cv]`)]);
  await popup?.waitForURL(u => !String(u).startsWith('about:'), { timeout: 5000 }).catch(() => {});
  revisa('[CV] se abre en otra pestaña', !!popup && /^(blob:|http)/.test(popup.url()), popup?.url());
  await popup?.close();
  await p.fill(`${ana} [data-nota]`, 'Entrevista martes 6 pm'); await p.dispatchEvent(`${ana} [data-nota]`, 'change');
  await p.waitForFunction(() => window.__llamadas.filter(x => x.n === 'v2_update_staff_application').length >= 3, null, { timeout: 4000 }).catch(() => {});
  const nota = (await llamadas(p, 'v2_update_staff_application'))[2];
  revisa('[nota] se guarda sin tocar el estado', nota?.notes === 'Entrevista martes 6 pm' && nota.status === null, JSON.stringify(nota));
  await p.fill('#candBuscar', 'luis');
  revisa('[banco] buscar encuentra a Luis', (await p.$$('.cand')).length === 1 && /Luis Pérez/.test(await p.textContent('.cand')));
  await p.fill('#candBuscar', '');
  // Eliminar (b5): escondido en "Cambiar estado a mano"; borra renglón y archivos.
  const borrada = '.cand[data-id="a3"]';
  await p.click('[data-filtro="todos"]').catch(() => {});
  await p.click(`${borrada} .cand-mas summary`);
  p.once('dialog', d => d.accept());
  await p.evaluate(() => { window.tosConfirm = async () => true; });
  await p.click(`${borrada} [data-elimina]`);
  await p.waitForFunction(() => !document.querySelector('.cand[data-id="a3"]'), null, { timeout: 4000 }).catch(() => {});
  const borra = await llamadas(p, 'v2_delete_staff_application');
  revisa('[eliminar] borra la postulación y la quita de la lista', JSON.stringify(borra) === JSON.stringify([{ organization_id: ORG, application_id: 'a3' }]) && !(await p.$(borrada)), JSON.stringify(borra));
  await p.click('[data-filtro="contratado"]');
  revisa('[eliminar] un contratado no trae el botón', !(await p.$('.cand [data-elimina]')));
  revisa('[filtro] contratados muestra a Luis, sin CV y con su siguiente paso', (await p.$$('.cand')).length === 1 && /Sin CV/.test(await p.textContent('.cand')) && /Dar acceso a TannerOS/.test(await p.textContent('.cand')));
  revisa('[contratado] lo primero es pedirle la carta de no antecedentes penales', /carta de no antecedentes penales/.test(await p.textContent('.cand .cand-paso p')) && /Pedirle la carta/.test(await p.textContent('.cand .cand-paso-btn.principal')));
  revisa('[sin desborde] /candidatos/ cabe a 390px', !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
  await p.close();
}

{ // quien no contrata
  const p = await abre('/v2/candidatos/', { rol: 'Taquilla' });
  await p.waitForTimeout(1200);
  // El shell manda a la entrada y la pantalla corta con "No access": es lo esperado.
  // Chromium además aborta la transición entre páginas (v2/experience.css) de
  // esa redirección; sólo aquí, donde la redirección es lo que se prueba.
  for (let i = errores.length - 1; i >= 0; i--) if (errores[i] === 'pageerror: No access' || /^pageerror: Transition was aborted/.test(errores[i])) errores.splice(i, 1);
  revisa('[acceso] sin Usuarios ni Dirección deportiva no entra', !(await p.$('.cand')) && !/candidatos/.test(new URL(p.url()).pathname), p.url());
  await p.close();
}

{ // La liga corta del flyer
  const v = JSON.parse(fs.readFileSync(path.join(RAIZ, 'vercel.json'), 'utf8'));
  const r = (v.redirects || []).filter(x => /^\/unete\/?$/.test(x.source));
  revisa('[liga] /unete y /unete/ llevan a /trabaja/', r.length === 2 && r.every(x => x.destination === '/trabaja/'), JSON.stringify(r));
}

await nav.close(); srv.close();
let mal = 0;
for (const r of revisiones) if (!r.ok) { mal++; console.error(` - ${r.nombre}${r.detalle ? ' :: ' + r.detalle : ''}`); }
if (errores.length) { console.error('ERRORES DEL NAVEGADOR:'); errores.forEach(e => console.error('   ' + e)); }
if (mal || errores.length) { console.error(`Postulaciones humo FAILED · ${mal} de ${revisiones.length}, ${errores.length} errores`); process.exit(1); }
console.log(`Postulaciones humo OK · ${revisiones.length} revisiones: convocatoria, postulación con CV, candidatos, estados y acceso`);
