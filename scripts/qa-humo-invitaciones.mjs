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
      v2_portal_home: () => ({ organization: { name: 'Tannery City FC', whatsapp: '524792651338' }, players: [{ id: 'p1', first_name: 'Jorge', last_name: 'Sánchez', category: 'T10' }] }),
      v2_portal_statement: () => ({ summary: { balance: 0 }, ledger: [] }),
      v2_portal_paperwork: () => ({})
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
  revisa('[login] dice el club y pide "Tu teléfono o usuario"', /Tannery City FC/.test(await p.textContent('#loginView')) && /Tu teléfono o usuario/.test(await p.textContent('#loginForm')));
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
  await p.click('#invSubmit');
  await p.waitForSelector('#appView:not(.hidden)', { timeout: 8000 }).catch(() => {});
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

await nav.close(); srv.close();
let mal = 0;
for (const r of revisiones) if (!r.ok) { mal++; console.error(` - ${r.nombre}${r.detalle ? ' :: ' + r.detalle : ''}`); }
if (errores.length) { console.error('ERRORES DEL NAVEGADOR:'); errores.forEach(e => console.error('   ' + e)); }
if (mal || errores.length) { console.error(`Invitaciones humo FAILED · ${mal} de ${revisiones.length}, ${errores.length} errores`); process.exit(1); }
console.log(`Invitaciones humo OK · ${revisiones.length} revisiones: invitar por WhatsApp, envío rápido, entrar con el teléfono, olvidé mi contraseña y la liga de invitación`);
