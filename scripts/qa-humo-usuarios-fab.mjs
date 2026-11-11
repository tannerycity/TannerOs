// Usuarios (/usuarios/): el "+" ofrece primero "Agregar nuevo usuario".
//
// Presidencia (11/11/2026): "cuando le pongas el botón de más, ahí le pongas
// agregar un nuevo usuario". Antes la acción dependía de que el botón de alta
// se viera en pantalla y en el celular no salía. Revisa:
//   · con permiso de escritura, el "+" trae "Agregar nuevo usuario" arriba;
//   · tocarla abre el asistente "Entregar una llave";
//   · sin permiso de escritura, no se ofrece.
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const T = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('no'); return; }
  r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}`;

const revisiones = [], errores = [];
const revisa = (n, ok, d = '') => revisiones.push({ nombre: n, ok, detalle: d });
const nav = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

async function abre({ escribe }) {
  const p = await nav.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
  await p.addInitScript(({ escribe }) => {
    const R = {
      v2_my_context: () => [{ user_id: 'u1', display_name: 'Mich', organization_id: 'o1', organization_name: 'Tannery City FC', organization_slug: 'tannery-city-fc', role: 'Presidencia', is_owner: false }],
      v2_my_modules: () => [{ module_code: 'users', enabled: true, can_read: true, can_write: escribe }],
      v2_my_navigation: () => ['inicio', 'usuarios'].map(c => ({ module_code: c, enabled: true, can_read: true, can_write: escribe })),
      v2_users_admin: () => ({ members: [{ membershipId: 'm1', userId: 'u2', displayName: 'Crespo', username: 'crespo', role: 'Contabilidad', active: true }], invitations: [] }),
      v2_guardian_access: () => [],
      v2_category_staff: () => ({ categories: [], byUser: {} }),
      v2_staff_without_account: () => [{ id: 'st-checo', fullName: 'Checo Martínez', title: 'Formador', level: 'formador' }],
      v2_link_staff_account: prm => ({ staffId: prm.staff_id, userId: prm.user_id }),
      v2_save_staff_member: () => ({ id: 'st-nuevo' })
    };
    window.__llamadas = [];
    window.__fakeSupabase = {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }), getUser: async () => ({ data: { user: { id: 'u1' } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
      rpc: async (n, prm) => { window.__llamadas.push({ n, prm }); return { data: R[n] ? R[n](prm) : null, error: null }; },
      functions: { invoke: async (fn, { body }) => { window.__llamadas.push({ n: fn, prm: body }); return { data: { user_id: 'u-checo', username: body.username, temporary_password: 'Tmp-1234' }, error: null }; } },
      from: () => ({ select() { return this; }, eq() { return this; }, then(r) { return Promise.resolve({ data: [], error: null }).then(r); } }),
      channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {}
    };
  }, { escribe });
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.route('**/v2/supabase-client.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'export function createClient(){ return window.__fakeSupabase; }' }));
  await p.route('**/v2/photo-cache.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'export async function getSignedPhotoUrls(){return {};}export async function getSignedPhotoUrl(){return null;}export async function clearPhotoCache(){}' }));
  await p.goto(BASE + '/v2/usuarios/', { waitUntil: 'domcontentloaded' });
  return p;
}

{ // Con permiso: el "+" trae "Agregar nuevo usuario" primero y abre el asistente.
  const p = await abre({ escribe: true });
  await p.waitForSelector('#tosFab:not([hidden])', { timeout: 8000 });
  await p.waitForFunction(() => Array.isArray(window.tosAccionesDePantalla) && window.tosAccionesDePantalla.length > 0, null, { timeout: 8000 });
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p.click('#tosFab');
  await p.waitForSelector('#tosFabMenu .tos-fab-item', { timeout: 4000 });
  const primera = (await p.textContent('#tosFabMenu .tos-fab-item')).replace(/\s+/g, ' ').trim();
  revisa('[+] la primera opción es "Agregar nuevo usuario"', /^Agregar nuevo usuario/.test(primera), primera);
  await p.click('#tosFabMenu .tos-fab-item');
  const abrio = await p.waitForSelector('#wizardModal:not(.hidden)', { timeout: 4000 }).then(() => true, () => false);
  revisa('[+] tocarla abre "Entregar una llave"', abrio);
  // Borrar el usuario sugerido no lo vuelve a poner (11/11/2026).
  await p.fill('#whoSearch', 'Sergio Martínez');
  await p.click('#whoResults [data-nuevo]');
  await p.click('#wizardModal [data-rol="Formadores"], #wizardModal .key-chip');
  await p.waitForSelector('#keyDetails:not(.hidden)', { timeout: 4000 });
  await p.evaluate(() => { document.getElementById('keyDetails').open = true; });
  const sugerido = await p.inputValue('#accessUsername');
  revisa('[llave] sugiere el usuario con su nombre', sugerido === 'sergio.martinez', sugerido);
  await p.fill('#accessUsername', '');
  await p.type('#accessUsername', 'x');
  await p.press('#accessUsername', 'Backspace');
  revisa('[llave] borrar todo el usuario no lo vuelve a poner', (await p.inputValue('#accessUsername')) === '', await p.inputValue('#accessUsername'));
  await p.type('#accessUsername', 'checo');
  revisa('[llave] lo que se escribe se queda', (await p.inputValue('#accessUsername')) === 'checo' && /usuario checo/.test(await p.textContent('#keySummary')));
  await p.close();
}
{ // Staff y llave conectados (h86): la ficha sin llave sale al buscar y queda conectada.
  const p = await abre({ escribe: true });
  await p.waitForFunction(() => Array.isArray(window.tosAccionesDePantalla) && window.tosAccionesDePantalla.length > 0, null, { timeout: 8000 });
  await p.click('#openCreateUser');
  await p.waitForSelector('#wizardModal:not(.hidden)');
  await p.fill('#whoSearch', 'Checo');
  await p.waitForSelector('#whoResults [data-pick="ficha:st-checo"]', { timeout: 3000 });
  revisa('[staff] la ficha sin llave sale al buscar', /en Staff, sin llave/.test(await p.textContent('#whoResults [data-pick="ficha:st-checo"]')));
  await p.click('#whoResults [data-pick="ficha:st-checo"]');
  revisa('[staff] propone Entrenador por ser formador y avisa que se conecta', (await p.getAttribute('#wizardModal [data-rol="coach"]', 'class') || '').includes('active') || (await p.getAttribute('#wizardModal [data-rol="coach"]', 'aria-pressed')) === 'true' || /activ|on|sel/.test(await p.getAttribute('#wizardModal [data-rol="coach"]', 'class') || ''), await p.getAttribute('#wizardModal [data-rol="coach"]', 'class'));
  revisa('[staff] dice que la llave queda conectada a su ficha', /conectada a su ficha de Staff/.test(await p.textContent('#whoPicked')));
  await p.click('#createAccess');
  await p.waitForFunction(() => window.__llamadas.some(x => x.n === 'v2_link_staff_account'), null, { timeout: 4000 }).catch(() => {});
  const ll = await p.evaluate(() => window.__llamadas.filter(x => x.n === 'v2_link_staff_account').map(x => x.prm));
  revisa('[staff] al entregar la llave la conecta con su ficha', ll.length === 1 && ll[0].staff_id === 'st-checo' && ll[0].user_id === 'u-checo', JSON.stringify(ll));
  await p.close();
}
{ // Alguien nuevo con llave de staff también queda en Staff (sin depender del orden).
  const p = await abre({ escribe: true });
  await p.waitForFunction(() => Array.isArray(window.tosAccionesDePantalla) && window.tosAccionesDePantalla.length > 0, null, { timeout: 8000 });
  await p.click('#openCreateUser');
  await p.waitForSelector('#wizardModal:not(.hidden)');
  await p.fill('#whoSearch', 'Pedro Gómez');
  await p.waitForSelector('#whoResults [data-nuevo]', { timeout: 3000 });
  await p.click('#whoResults [data-nuevo]');
  revisa('[nuevo] avisa que también queda en Staff', /también queda en Staff/.test(await p.textContent('#whoPicked')), await p.textContent('#whoPicked'));
  await p.click('#wizardModal [data-rol="coach"]');
  await p.click('#createAccess');
  await p.waitForFunction(() => window.__llamadas.some(x => x.n === 'v2_save_staff_member'), null, { timeout: 4000 }).catch(() => {});
  const fi = await p.evaluate(() => window.__llamadas.filter(x => x.n === 'v2_save_staff_member').map(x => x.prm));
  const m = fi[0]?.member || {};
  revisa('[nuevo] le hace su ficha de Staff conectada a la llave', fi.length === 1 && m.userId === 'u-checo' && m.fullName === 'Pedro Gómez' && m.level === 'formador' && m.title === 'Formador' && m.showToFamilies === true, JSON.stringify(fi));
  revisa('[nuevo] no la conecta a otra ficha', !(await p.evaluate(() => window.__llamadas.some(x => x.n === 'v2_link_staff_account'))));
  await p.close();
}
{ // Sin permiso de escritura: no se ofrece.
  const p = await abre({ escribe: false });
  await p.waitForSelector('#view:not(.hidden), #deniedView:not(.hidden)', { timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const ofrece = await p.evaluate(() => (window.tosAccionesDePantalla || []).some(a => /Agregar nuevo usuario/.test(a.label)));
  revisa('[+] sin permiso de escritura no ofrece agregar usuario', !ofrece);
  await p.close();
}

revisa('sin errores de página', errores.length === 0, errores.join('\n   '));
await nav.close(); srv.close();
const fallas = revisiones.filter(r => !r.ok);
for (const f of fallas) console.error(` - ${f.nombre}${f.detalle ? `\n   ${f.detalle}` : ''}`);
console.log(fallas.length ? `Usuarios "+" humo FAILED · ${fallas.length} de ${revisiones.length}`
  : `Usuarios "+" humo OK · ${revisiones.length} revisiones: agregar usuario primero, abre el asistente y sin permiso no sale`);
process.exit(fallas.length ? 1 : 0);
