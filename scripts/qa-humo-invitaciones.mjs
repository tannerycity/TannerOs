// Portal de familias, fase 1, en Chromium con Supabase falso (18/10/2026).
//
// "Quiero que la gente ya empiece a meterse." Revisa:
//   /invitaciones/  el avance (con cuenta / total), los filtros, invitar por
//                   WhatsApp (liga personal + mensaje), el envío rápido una por
//                   una y que sin permiso se ve el aviso.
//   /familias/      entrar con el teléfono como venga escrito, "¿Olvidaste tu
//                   contraseña?", la liga de invitación (#i=token): ve de quién
//                   es tutora, crea su contraseña, entra y cae en su portal;
//                   una liga usada lo dice. Nada se sale a 390px.
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const T = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png','.woff2':'font/woff2','.webmanifest':'application/manifest+json' };
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
const TOKEN = '0123456789abcdef'.repeat(4);

async function abre(ruta, opts = {}) {
  const p = await nav.newPage({ viewport: { width: opts.ancho || 390, height: 844 } });
  p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(`console: ${m.text()}`); });
  await p.addInitScript(({ opts, ORG, TOKEN }) => {
    if (opts.conSesion) sessionStorage.setItem('__sesion', '1');
    const guarda = (n, prm) => { const l = JSON.parse(sessionStorage.getItem('__llamadas') || '[]'); l.push({ n, prm }); sessionStorage.setItem('__llamadas', JSON.stringify(l)); };
    window.__abiertas = [];
    window.open = () => { const w = { closed: false, location: { set href(v) { window.__abiertas.push(v); } }, close() { this.closed = true; } }; return w; };
    const tutores = [
      { id: 'g1', nombre: 'Adriana Elizabeth Sánchez', primerNombre: 'Adriana Elizabeth', telefono: '4773979631', hijos: [{ nombre: 'Jorge Alfonso', primerNombre: 'Jorge Alfonso', categoria: 'T10' }], tieneCuenta: false, invitada: null },
      { id: 'g2', nombre: 'Carlos Ruiz', primerNombre: 'Carlos', telefono: '4771112233', hijos: [{ nombre: 'Leo Ruiz', primerNombre: 'Leo', categoria: 'Baby Tanner' }], tieneCuenta: false, invitada: null },
      { id: 'g3', nombre: 'Laura Gómez', primerNombre: 'Laura', telefono: '4775556677', hijos: [{ nombre: 'Ana Gómez', primerNombre: 'Ana', categoria: 'T6' }], tieneCuenta: false, invitada: '2026-10-17T10:00:00Z' },
      { id: 'g4', nombre: 'Mich Enríquez', primerNombre: 'Mich', telefono: '4779998877', hijos: [{ nombre: 'Gianluca', primerNombre: 'Gianluca', categoria: 'T10' }], tieneCuenta: true, usuario: '4779998877', ultimaEntrada: new Date().toISOString() },
      { id: 'g5', nombre: 'Sin Tel', primerNombre: 'Sin', telefono: null, hijos: [{ nombre: 'Max', primerNombre: 'Max', categoria: 'T12' }], tieneCuenta: false }];
    const R = {
      v2_my_context: () => [{ user_id: 'u1', display_name: 'Mich', organization_id: ORG, organization_name: 'Tannery City FC', organization_slug: 'tannery-city-fc', role: opts.rol || 'Presidencia', is_owner: !opts.rol }],
      v2_my_navigation: () => ['inicio', 'usuarios'].map(c => ({ module_code: c, enabled: true, can_read: true, can_write: true })),
      v2_family_portal_overview: () => { if (opts.rol) throw new Error('Not authorized'); return { total: 5, conCuenta: 1, entraron30: 1, invitadas: 1, tutores: JSON.parse(JSON.stringify(tutores)) }; },
      v2_family_invite_link: prm => { const t = tutores.find(x => x.id === prm.guardian_id); return { token: TOKEN, purpose: t.tieneCuenta ? 'reset' : 'invite', telefono: t.telefono, usuario: t.usuario || t.telefono }; },
      v2_public_context: () => ({ organizationId: ORG, organizationName: 'Tannery City FC', slug: 'tannery-city-fc', whatsappNumber: '524792651338' }),
      v2_public_family_invite: () => opts.usada ? { valid: false, reason: 'used' } : { valid: true, purpose: 'invite', primerNombre: 'Adriana Elizabeth Sánchez Alvarado', club: 'Tannery City FC', usuario: '4773979631', hijos: [{ primerNombre: 'Adrian Mateo', categoria: 'T6' }, { primerNombre: 'Jorge Alfonso', categoria: 'T10' }] },
      v2_public_family_login: prm => ({ login: prm.contrasena === 'Buena-1850' ? '4773979631@familias.tanneros.invalid' : null }),
      v2_save_my_contact_email: prm => ({ ok: true, email: prm.email }),
      v2_portal_home: () => { if (opts.caido && !window.__reintento) throw new Error('Failed to fetch'); return { guardian: { name: 'Adriana Elizabeth Sánchez', phone: '+524773979631', email: null }, organization: { name: 'Tannery City FC', whatsapp: '524792651338' }, players: [{ id: 'p1', first_name: 'Jorge Alfonso', last_name: 'Sánchez', category: 'T10', jersey_number: '9' }] }; },
      v2_portal_statement: () => ({ summary: { balance: opts.debe ? 1250 : 0 }, ledger: [], documents: [] }),
      v2_portal_paperwork: () => opts.debe ? { image_consent: { status: 'sin_preguntar' }, consents: [{ code: 'reglamento', title: 'Reglamento del club', body: 'Texto', required: true, accepted_at: null }] } : {},
      v2_portal_avisos: () => [{ id: 'a1', title: 'No hay entrenamiento el lunes', body: 'Por el puente.', categoria: 'T10', author: 'Mich', publishedAt: new Date().toISOString(), unread: true },
                               { id: 'a2', title: 'Foto oficial', body: null, author: 'Mich', publishedAt: '2026-10-01T12:00:00Z', unread: false }],
      v2_portal_calendar: () => { const m = new Date(); m.setDate(m.getDate() + 1); m.setHours(17, 0, 0, 0); return [{ kind: 'session', title: 'Entrenamiento T10', starts_at: m.toISOString(), location: 'Cancha 1', category: 'T10' }]; },
      v2_portal_parking: () => ({ price: 500, season: 2026, passes: [] })
    };
    const sesion = () => sessionStorage.getItem('__sesion') ? { user: { id: 'u9', app_metadata: {} } } : (opts.staff ? { user: { id: 'u1' } } : null);
    window.__fakeSupabase = {
      auth: {
        getSession: async () => ({ data: { session: sesion() } }),
        getUser: async () => ({ data: { user: sesion()?.user || null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signInWithPassword: async prm => { guarda('signIn', prm); if (prm.password === 'mala') return { error: { message: 'Invalid login credentials' } }; sessionStorage.setItem('__sesion', '1'); return { data: {}, error: null }; },
        signOut: async () => { sessionStorage.removeItem('__sesion'); return {}; }, refreshSession: async () => ({})
      },
      functions: { invoke: async (n, o) => { guarda('fn:' + n, o.body); return { data: { ok: true, login: '4773979631@familias.tanneros.invalid', usuario: '4773979631' }, error: null }; } },
      rpc: async (n, prm) => { guarda(n, JSON.parse(JSON.stringify(prm || {}))); try { return { data: R[n] ? R[n](prm) : null, error: null }; } catch (e) { return { data: null, error: { message: e.message } }; } },
      from: () => ({ select() { return this; }, eq() { return this; }, then(r) { return Promise.resolve({ data: [], error: null }).then(r); } }),
      storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) }, channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {}
    };
  }, { opts, ORG, TOKEN });
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.route('**/v2/supabase-client.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'export function createClient(){ return window.__fakeSupabase; }' }));
  await p.goto(BASE + ruta, { waitUntil: 'domcontentloaded' });
  return p;
}
const llamadas = (p, n) => p.evaluate(n => JSON.parse(sessionStorage.getItem('__llamadas') || '[]').filter(x => x.n === n).map(x => x.prm), n);
const cabe = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

{ // Staff: invitar familias
  const p = await abre('/v2/invitaciones/index.html', { staff: true });
  await p.waitForSelector('.inv-fam', { timeout: 6000 });
  if (process.env.QA_CAPTURA) await p.screenshot({ path: process.env.QA_CAPTURA, fullPage: true });
  revisa('[staff] avance: 1 de 5 con cuenta', /1\s*de 5/.test(await p.textContent('#invAvance')), await p.textContent('#invAvance'));
  revisa('[staff] arranca en "Sin invitar" con las 2 que faltan', (await p.locator('.inv-fam').count()) === 2 && /Sin invitar\s*2/.test(await p.textContent('#invFiltros')));
  revisa('[staff] la tarjeta dice los hijos con su categoría', /Jorge \(T10\)/.test(await p.textContent('.inv-fam[data-id="g1"]')));
  await p.click('.inv-fam[data-id="g1"] [data-enviar]');
  await p.waitForFunction(() => window.__abiertas.length > 0, null, { timeout: 4000 });
  const url = (await p.evaluate(() => window.__abiertas))[0] || '';
  const texto = decodeURIComponent(url.split('text=')[1] || '');
  revisa('[staff] abre WhatsApp al teléfono del tutor', url.startsWith('https://wa.me/524773979631?text='), url.slice(0, 60));
  revisa('[staff] el mensaje saluda por su nombre y trae la liga personal', /^Hola Adriana, te saluda Tannery City FC/.test(texto) && texto.includes(`/familias/#i=${TOKEN}`) && /477 397 9631/.test(texto), texto);
  revisa('[staff] se pidió la liga de ese tutor', (await llamadas(p, 'v2_family_invite_link'))[0]?.guardian_id === 'g1');
  revisa('[staff] ya no aparece en "Sin invitar"', (await p.locator('.inv-fam').count()) === 1 && /Invitadas\s*2/.test(await p.textContent('#invFiltros')));
  // Envío rápido: la que queda.
  await p.click('#invRapido');
  await p.waitForSelector('.inv-envio-card [data-envio]');
  revisa('[rápido] una por una: 1 de 1 con su nombre', /1 de 1/.test(await p.textContent('.inv-envio-card')) && /Carlos Ruiz/.test(await p.textContent('.inv-envio-card')));
  await p.click('.inv-envio-card [data-envio]');
  await p.waitForSelector('.inv-envio-card [data-cerrar]:not(.inv-x)', { timeout: 4000 });
  revisa('[rápido] al terminar lo dice', /Ya les escribiste a 1 familia/.test(await p.textContent('.inv-envio-card')) && (await p.evaluate(() => window.__abiertas.length)) === 2);
  await p.click('.inv-envio-card [data-cerrar]');
  await p.click('[data-filtro="todas"]');
  revisa('[staff] a quien ya tiene cuenta se le manda la liga de contraseña', /Mandar liga de contraseña/.test(await p.textContent('.inv-fam[data-id="g4"]')));
  revisa('[staff] sin teléfono: copiar la liga', (await p.locator('.inv-fam[data-id="g5"] [data-copiar]').count()) === 1);
  revisa('[staff] cabe a 390px', await cabe(p));
  await p.close();
}

{ // Sin permiso
  const p = await abre('/v2/invitaciones/index.html', { staff: true, rol: 'Operaciones' });
  await p.waitForSelector('#invDenied:not(.hidden)', { timeout: 6000 }).catch(() => {});
  revisa('[acceso] sin permiso ve el aviso', await p.isVisible('#invDenied'));
  for (let i = errores.length - 1; i >= 0; i--) if (errores[i] === 'pageerror: No access') errores.splice(i, 1);
  await p.close();
}

{ // Portal: entrar con el teléfono, y "¿Olvidaste tu contraseña?"
  const p = await abre('/v2/familias/index.html');
  await p.waitForSelector('#loginView:not(.hidden)', { timeout: 6000 });
  await p.waitForFunction(() => /Tannery City FC/.test(document.querySelector('[data-club]')?.textContent || ''), null, { timeout: 4000 }).catch(() => {});
  if (process.env.QA_CAPTURA) await p.screenshot({ path: process.env.QA_CAPTURA.replace(/\.png$/, '-login.png'), fullPage: true });
  revisa('[login] dice el club y pide "Tu teléfono o correo"', /Tannery City FC/.test(await p.textContent('#loginView')) && /Tu teléfono o correo/.test(await p.textContent("#loginForm")));
  await p.fill('#email', '477 123 4567'); await p.fill('#password', 'mala');
  await p.click('[data-ver="password"]');
  revisa('[login] "Ver" enseña la contraseña', (await p.getAttribute('#password', 'type')) === 'text');
  await p.click('#loginSubmit');
  await p.waitForSelector('#loginMessage:not(.hidden)', { timeout: 4000 });
  revisa('[login] el teléfono como venga escrito se vuelve su usuario', (await llamadas(p, 'signIn'))[0]?.email === '4771234567@familias.tanneros.invalid', JSON.stringify(await llamadas(p, 'signIn')));
  revisa('[login] si falla, sugiere "¿Olvidaste tu contraseña?"', /Olvidaste/.test(await p.textContent('#loginMessage')));
  await p.click('#olvide');
  const wa = await p.getAttribute('#ayudaWa', 'href');
  revisa('[olvidé] WhatsApp al club con su teléfono', await p.isVisible('#ayudaAcceso') && wa.startsWith('https://wa.me/524792651338') && /477%20123%204567/.test(wa), wa);
  revisa('[primera vez] "Pedirla" abre WhatsApp al club', (await p.getAttribute('#pideLiga', 'href')).startsWith('https://wa.me/524792651338'));
  revisa('[login] cabe a 390px', await cabe(p));
  await p.close();
}

{ // Portal: la liga de invitación
  const p = await abre(`/v2/familias/index.html#i=${TOKEN}`);
  await p.waitForSelector('#inviteForm', { timeout: 6000 });
  if (process.env.QA_CAPTURA) await p.screenshot({ path: process.env.QA_CAPTURA.replace(/\.png$/, '-invitacion.png'), fullPage: true });
  revisa('[invitación] saluda con su primer nombre', /Hola, Adriana/.test(await p.textContent('#inviteCard')));
  revisa('[invitación] enseña a sus hijos con su categoría', JSON.stringify(await p.$$eval('.fam-inv-hijos li', l => l.map(x => x.innerText.replace(/\s+/g, ' ')))) === '["Adrian T6","Jorge T10"]');
  revisa('[invitación] su usuario es su teléfono', /477 397 9631/.test(await p.textContent('.fam-inv-usuario')) && /tu teléfono/.test(await p.textContent('.fam-inv-usuario')));
  await p.fill('#invPass', 'Tanner2026'); await p.fill('#invPass2', 'Tanner2027');
  await p.click('#invSubmit');
  revisa('[invitación] si no coinciden, lo dice', /no coinciden/.test(await p.textContent('#invMessage')) && (await llamadas(p, 'fn:family-access')).length === 0);
  await p.fill('#invPass2', 'Tanner2026');
  await p.fill('#invCorreo', 'adriana@');
  await p.click('#invSubmit');
  revisa('[invitación] un correo incompleto no envía', (await llamadas(p, 'fn:family-access')).length === 0);
  await p.fill('#invCorreo', ' Adriana@Correo.mx ');
  await p.click('#invSubmit');
  await p.waitForSelector('#appView:not(.hidden)', { timeout: 8000 }).catch(() => {});
  revisa('[invitación] guarda su correo (opcional) al entrar', (await llamadas(p, 'v2_save_my_contact_email'))[0]?.email === 'adriana@correo.mx', JSON.stringify(await llamadas(p, 'v2_save_my_contact_email')));
  const fn = (await llamadas(p, 'fn:family-access'))[0] || {};
  revisa('[invitación] manda el token y la contraseña', fn.action === 'claim' && fn.token === TOKEN && fn.password === 'Tanner2026', JSON.stringify(fn));
  revisa('[invitación] entra con el usuario que le dieron', (await llamadas(p, 'signIn')).at(-1)?.email === '4773979631@familias.tanneros.invalid');
  revisa('[invitación] cae en su portal y la liga sale de la barra', await p.isVisible('#appView') && !/#i=/.test(p.url()), p.url());
  await p.close();
}

{ // Una liga ya usada
  const p = await abre(`/v2/familias/index.html#i=${TOKEN}`, { usada: true });
  await p.waitForSelector('[data-ir-entrar]', { timeout: 6000 });
  revisa('[usada] dice que ya se usó y lleva a entrar', /ya se usó/.test(await p.textContent('#inviteCard')));
  await p.click('[data-ir-entrar]');
  await p.waitForSelector('#loginView:not(.hidden)', { timeout: 6000 }).catch(() => {});
  revisa('[usada] "Ir a entrar" abre el login', await p.isVisible('#loginView'));
  await p.close();
}

{ // Entrar con el correo: el servidor dice con qué cuenta (sólo si la contraseña es buena)
  const p = await abre('/v2/familias/index.html');
  await p.waitForSelector('#loginView:not(.hidden)', { timeout: 6000 });
  await p.fill('#email', ' Adriana@Correo.mx '); await p.fill('#password', 'Buena-1850');
  await p.click('#loginSubmit');
  await p.waitForSelector('#appView:not(.hidden)', { timeout: 6000 }).catch(() => {});
  revisa('[correo] pregunta al servidor con lo que escribió', (await llamadas(p, 'v2_public_family_login'))[0]?.identificador === ' Adriana@Correo.mx ');
  revisa('[correo] entra con la cuenta que le corresponde', (await llamadas(p, 'signIn'))[0]?.email === '4773979631@familias.tanneros.invalid', JSON.stringify(await llamadas(p, 'signIn')));
  revisa('[correo] cae en su portal', await p.isVisible('#appView'));
  await p.close();
}

{ // Sin señal: la sesión no se cierra, se reintenta
  const p = await abre('/v2/familias/index.html', { conSesion: true, caido: true });
  await p.waitForSelector('#famReintentar', { timeout: 6000 }).catch(() => {});
  revisa('[sin señal] dice que la sesión sigue abierta', /Tu sesión sigue abierta/.test(await p.textContent('#famBody')) && !(await p.isVisible('#loginView')));
  revisa('[sin señal] no cierra la sesión', await p.evaluate(() => !!sessionStorage.getItem('__sesion')));
  await p.close();
}

{ // Cuenta: Tu acceso, con qué entra y su correo
  const p = await abre('/v2/familias/index.html?tab=cuenta', { conSesion: true });
  await p.waitForSelector('#famAcceso', { timeout: 8000 });
  revisa('[acceso] dice que entra con su teléfono', /477 397 9631/.test(await p.textContent('#famAcceso')));
  revisa('[acceso] explica cuánto dura la sesión', /hasta que toques\s*Salir/.test(await p.textContent('#famAcceso')));
  await p.fill('#famCorreo', 'Adriana@Correo.mx'); await p.click('#famCorreoGuardar');
  await p.waitForFunction(() => /adriana@correo\.mx/.test(document.querySelector('#famAcceso')?.textContent || ''), null, { timeout: 4000 }).catch(() => {});
  revisa('[acceso] guarda el correo y ya entra con él', (await llamadas(p, 'v2_save_my_contact_email'))[0]?.email === 'adriana@correo.mx' && /tu correo\s*adriana@correo\.mx/.test(await p.textContent('#famAcceso')) && /Listo/.test(await p.textContent('#famCorreoMsg')));
  revisa('[acceso] cabe a 390px', await cabe(p));
  await p.close();
}

{ // Fase 2: Inicio con pendientes, avisos y lo próximo
  const p = await abre('/v2/familias/index.html', { conSesion: true, debe: true });
  await p.waitForSelector('.fam-pendientes', { timeout: 8000 });
  if (process.env.QA_CAPTURA) await p.screenshot({ path: process.env.QA_CAPTURA.replace(/\.png$/, '-inicio.png'), fullPage: true });
  revisa('[inicio] abre en Inicio y saluda a la tutora', await p.getAttribute('.fam-nav-item[data-tab="inicio"]', 'aria-current') === 'page' && /Adriana/.test(await p.textContent('.fam-inicio-hero')));
  revisa('[inicio] su hijo con categoría y número', /Jorge/.test(await p.textContent('.fam-hijo')) && /T10 · #9/.test(await p.textContent('.fam-hijo')));
  const pend = await p.$$eval('.fam-pend', b => b.map(x => x.dataset.tipo));
  revisa('[inicio] pendientes en orden: pagar, firmar, fotos', JSON.stringify(pend) === '["pago","firma","fotos"]', JSON.stringify(pend));
  revisa('[inicio] el pago dice cuánto', /\$1,250\.00/.test(await p.textContent('.fam-pend[data-tipo="pago"]')));
  revisa('[inicio] lo próximo: mañana, con lugar', /Mañana/.test(await p.textContent('.fam-prox')) && /Cancha 1/.test(await p.textContent('.fam-prox')));
  revisa('[avisos] el nuevo se marca y dice su categoría', /Nuevo/.test(await p.textContent('.fam-aviso-item.nuevo')) && /Para T10/.test(await p.textContent('.fam-aviso-item.nuevo')));
  await p.waitForTimeout(300);
  revisa('[avisos] abrir Inicio los marca como vistos', (await llamadas(p, 'v2_portal_avisos_vistos')).length === 1);
  revisa('[push] ofrece activar los avisos en el celular', await p.isVisible('.fam-push [data-push]'));
  revisa('[inicio] cabe a 390px', await cabe(p));
  await p.click('.fam-pend[data-tipo="pago"]');
  await p.waitForSelector('#famSaldo', { timeout: 4000 }).catch(() => {});
  revisa('[pendiente] "Ver cómo pagar" lleva a Cuenta, a su saldo', await p.getAttribute('.fam-nav-item[data-tab="cuenta"]', 'aria-current') === 'page' && await p.isVisible('#famSaldo'));
  await p.click('.fam-nav-item[data-tab="club"]');
  await p.waitForSelector('.fam-seg', { timeout: 4000 });
  revisa('[club] el calendario trae el entrenamiento', /Entrenamiento T10/.test(await p.textContent('#famBody')));
  await p.click('[data-club="gafete"]');
  await p.waitForSelector('#gafeteForm', { timeout: 4000 }).catch(() => {});
  revisa('[club] Estacionamiento en la misma pestaña', await p.isVisible('#gafeteForm') && await p.getAttribute('[data-club="gafete"]', 'aria-selected') === 'true');
  await p.close();
}

{ // Al día: sin pendientes lo dice
  const p = await abre('/v2/familias/index.html', { conSesion: true });
  await p.waitForSelector('.fam-pendientes', { timeout: 8000 });
  revisa('[inicio] sin pendientes dice "Todo al día"', /Todo al día/.test(await p.textContent('.fam-pendientes')) && (await p.locator('.fam-pend').count()) === 0);
  await p.close();
}

await nav.close(); srv.close();
let mal = 0;
for (const r of revisiones) if (!r.ok) { mal++; console.error(` - ${r.nombre}${r.detalle ? ' :: ' + r.detalle : ''}`); }
if (errores.length) { console.error('ERRORES DEL NAVEGADOR:'); errores.forEach(e => console.error('   ' + e)); }
if (mal || errores.length) { console.error(`Invitaciones humo FAILED · ${mal} de ${revisiones.length}, ${errores.length} errores`); process.exit(1); }
console.log(`Invitaciones humo OK · ${revisiones.length} revisiones: invitar por WhatsApp, envío rápido, entrar con el teléfono o el correo, sin señal sin cerrar sesión, Tu acceso, olvidé mi contraseña, la liga de invitación e Inicio con pendientes y avisos`);
