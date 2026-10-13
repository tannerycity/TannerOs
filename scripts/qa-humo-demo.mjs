// Demo pública con perfiles (/demo/) en Chromium, con Supabase falso.
//
// Presidencia, 12/10/2026: "un botón que diga entra, para que veas los
// distintos perfiles; una demo sin datos y otra con datos". Revisa:
//   · se elige el club (con datos / recién dado de alta) y el perfil;
//   · al tocar un perfil se pide la sesión a demo-login con ese perfil y club,
//     se guarda la sesión y se entra a donde dice el servidor;
//   · en el club nuevo no hay familias: el botón no se puede tocar;
//   · si el servidor falla se dice por qué y se puede volver a intentar;
//   · por ahora la entrada NO enlaza a la demo (13/10/2026); la demo sigue en /demo/; nada se sale a 390px.
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

async function abre(ruta, { falla = false } = {}) {
  const p = await nav.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(`console: ${m.text()}`); });
  const pedidos = [];
  await p.addInitScript(() => {
    window.__sesion = null;
    window.__fakeSupabase = {
      auth: { getSession: async () => ({ data: { session: null } }), signOut: async () => ({ error: null }),
        setSession: async s => { window.__sesion = s; return { data: { session: s }, error: null }; },
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
      rpc: async () => ({ data: null, error: null })
    };
  });
  await p.route('**/functions/v1/demo-login', async r => {
    const body = JSON.parse(r.request().postData() || '{}'); pedidos.push(body);
    if (falla) return r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'No hay club demo' }) });
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ access_token: 'tok-' + body.perfil, refresh_token: 'ref', landing: body.perfil === 'familia' ? '/familias/' : '/', club: 'demo-halcones' }) });
  });
  await p.route('**/v2/supabase-client.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'export function createClient(){ return window.__fakeSupabase; }' }));
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)(?!.*functions\/v1\/demo-login)/, r => r.abort());
  await p.goto(BASE + ruta, { waitUntil: 'domcontentloaded' });
  return { p, pedidos };
}

{
  const { p, pedidos } = await abre('/demo/');
  await p.waitForSelector('.dm-perfil');
  revisa('[demo] seis perfiles', (await p.$$('.dm-perfil')).length === 6);
  revisa('[demo] arranca en el club con datos', await p.$eval('[data-variante="datos"]', b => b.classList.contains('activa') && b.getAttribute('aria-checked') === 'true'));
  revisa('[demo] Familia se puede tocar con datos', !(await p.$eval('[data-perfil="familia"]', b => b.disabled)));
  await p.click('[data-variante="vacio"]');
  revisa('[demo] en el club nuevo no hay familias', await p.$eval('[data-perfil="familia"]', b => b.disabled && /no tiene familias/.test(b.title)));
  revisa('[sin desborde] la demo cabe a 390px', !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
  await Promise.all([p.waitForURL(u => new URL(u).pathname === '/', { timeout: 5000 }).catch(() => {}), p.click('[data-perfil="formador"]')]);
  revisa('[entrar] pide la sesión del perfil y club elegidos', JSON.stringify(pedidos[0]) === '{"perfil":"formador","variante":"vacio"}', JSON.stringify(pedidos));
  revisa('[entrar] y entra a donde dice el servidor', new URL(p.url()).pathname === '/', p.url());
  await p.close();
}

{
  const { p, pedidos } = await abre('/demo/');
  await p.waitForSelector('.dm-perfil');
  let sesion = null;
  p.on('framenavigated', async () => {});
  await p.exposeFunction('__guardaSesion', s => { sesion = s; });
  await p.evaluate(() => { const o = window.__fakeSupabase.auth.setSession; window.__fakeSupabase.auth.setSession = async s => { await window.__guardaSesion(s); return o(s); }; });
  await Promise.all([p.waitForURL('**/familias/', { timeout: 5000 }).catch(() => {}), p.click('[data-perfil="familia"]')]);
  revisa('[familia] guarda la sesión que dio el servidor', sesion?.access_token === 'tok-familia' && sesion.refresh_token === 'ref', JSON.stringify(sesion));
  revisa('[familia] y entra a su portal', /\/familias\/$/.test(p.url()) && pedidos[0]?.variante === 'datos', p.url());
  await p.close();
}

{
  const { p } = await abre('/demo/', { falla: true });
  await p.waitForSelector('.dm-perfil');
  await p.click('[data-perfil="presidencia"]');
  await p.waitForFunction(() => /No hay club demo/.test(document.getElementById('dmMsg').textContent), null, { timeout: 4000 }).catch(() => {});
  revisa('[error] dice por qué no abrió', /No hay club demo/.test(await p.textContent('#dmMsg')));
  revisa('[error] y se puede volver a intentar', !(await p.$eval('[data-perfil="presidencia"]', b => b.disabled)) && /\/demo\/$/.test(p.url()));
  await p.close();
}

{
  const { p } = await abre('/demo/?club=nuevo');
  await p.waitForSelector('.dm-perfil');
  revisa('[liga] /demo/?club=nuevo abre el club nuevo', await p.$eval('[data-variante="vacio"]', b => b.classList.contains('activa')));
  await p.close();
}

{
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8') + fs.readFileSync(path.join(RAIZ, 'v2/index.html'), 'utf8');
  revisa('[entrada] por ahora la entrada no enlaza a la demo', !/href="\/demo\//.test(html));
}

await nav.close(); srv.close();
let mal = 0;
for (const r of revisiones) if (!r.ok) { mal++; console.error(` - ${r.nombre}${r.detalle ? ' :: ' + r.detalle : ''}`); }
if (errores.length) { console.error('ERRORES DEL NAVEGADOR:'); errores.forEach(e => console.error('   ' + e)); }
if (mal || errores.length) { console.error(`Demo humo FAILED · ${mal} de ${revisiones.length}, ${errores.length} errores`); process.exit(1); }
console.log(`Demo humo OK · ${revisiones.length} revisiones: perfiles, club con y sin datos, sesión del servidor, errores y liga desde la entrada`);
