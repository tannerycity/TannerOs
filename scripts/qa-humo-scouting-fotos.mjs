// Fotos en la lista de Scouting (/v2/scouting/) en Chromium, con Supabase falso.
//
// Presidencia, 12/10/2026: "en scouting no se ven las fotos en miniatura de
// los que guardan". Las fotos subidas antes del 28/08/2026 no tienen
// miniatura y la lista sólo pedía miniaturas. Revisa:
//   · un reporte con miniatura muestra su miniatura (y sólo ésa se firma);
//   · uno viejo, sin miniatura, muestra su foto en vez de las iniciales;
//   · y se repara solo: se sube su miniatura junto al original y se guarda;
//   · quien sólo puede ver no repara nada (no sube ni guarda).
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const T = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png' };
// Una foto real pequeña (PNG 2x2) para que el navegador la pueda decodificar.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mP8z8DwnwEIGBkZGRgYGAAt+wP9wVhbGgAAAABJRU5ErkJggg==', 'base64');
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p.startsWith('/firmada/')) { r.writeHead(200, { 'content-type': 'image/png', 'access-control-allow-origin': '*' }); r.end(PNG); return; }
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
const O = 'o1', P = `organizations/${O}/scouting`;

async function abre({ escribe = true } = {}) {
  const p = await nav.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(`console: ${m.text()}`); });
  await p.addInitScript(({ escribe, P, BASE }) => {
    window.__llamadas = { rpc: [], firma: [], upload: [] };
    const fotos = [
      { report_id: 'r-nuevo', photo_path: `${P}/r-nuevo/profile-1790000000000.webp`, photo_thumb_path: `${P}/r-nuevo/profile-1790000000000-thumb.webp` },
      { report_id: 'r-viejo', photo_path: `${P}/r-viejo/profile-1787809089954.webp`, photo_thumb_path: null }];
    const R = {
      v2_my_context: () => [{ user_id: 'u1', display_name: 'Ana', organization_id: 'o1', organization_name: 'Tannery City FC', role: 'Scouting', is_owner: false }],
      v2_my_navigation: () => ['scouting', 'inicio'].map(c => ({ module_code: c, enabled: true, can_read: true, can_write: escribe })),
      v2_my_modules: () => [{ module_code: 'scouting', enabled: true, can_read: true, can_write: escribe }],
      v2_scouting_reports: () => [
        { id: 'r-nuevo', observed_name: 'Joshua Hidrogo', status: 'observado', created_at: '2026-09-10T10:00:00Z' },
        { id: 'r-viejo', observed_name: 'Iker Sandoval', status: 'observado', created_at: '2026-08-27T10:00:00Z' },
        { id: 'r-sin', observed_name: 'Walter Olivares', status: 'observado', created_at: '2026-08-06T10:00:00Z' }],
      v2_scouting_photos: () => fotos,
      v2_set_scouting_photo: prm => { const f = fotos.find(x => x.report_id === prm.report_id); f.photo_thumb_path = prm.photo_thumb_path; return {}; }
    };
    const store = {
      createSignedUrls: async ps => { ps.forEach(x => window.__llamadas.firma.push(x)); return { data: ps.map(x => ({ path: x, signedUrl: `${BASE}/firmada/${encodeURIComponent(x)}`, error: null })), error: null }; },
      createSignedUrl: async x => { window.__llamadas.firma.push(x); return { data: { signedUrl: `${BASE}/firmada/${encodeURIComponent(x)}` }, error: null }; },
      upload: async (ruta, blob, o) => { window.__llamadas.upload.push({ ruta, tipo: blob?.type || '', bytes: blob?.size || 0, upsert: !!o?.upsert }); return { data: { path: ruta }, error: null }; },
      remove: async () => ({ data: [], error: null }), list: async () => ({ data: [], error: null }), download: async () => ({ data: null, error: null }),
      getPublicUrl: () => ({ data: { publicUrl: '' } })
    };
    window.__fakeSupabase = {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }), getUser: async () => ({ data: { user: { id: 'u1' } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
      rpc: async (n, prm) => { window.__llamadas.rpc.push({ n, prm: JSON.parse(JSON.stringify(prm || {})) }); return { data: R[n] ? R[n](prm) : null, error: null }; },
      from: () => ({ select() { return this; }, eq() { return this; }, then(r) { return Promise.resolve({ data: [], error: null }).then(r); } }),
      storage: { from: () => store },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {}
    };
  }, { escribe, P, BASE });
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.route('**/v2/supabase-client.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'export function createClient(){ return window.__fakeSupabase; }' }));
  await p.goto(BASE + '/v2/scouting/', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.querySelectorAll('.scout-avatar').length >= 3, null, { timeout: 8000 }).catch(() => {});
  return p;
}
const avatares = p => p.$$eval('.scout-avatar', a => a.map(x => ({ img: !!x.querySelector('img'), txt: x.textContent.trim() })));

{
  const p = await abre();
  const a = await avatares(p);
  revisa('[lista] los tres talentos', a.length === 3, JSON.stringify(a));
  revisa('[lista] el nuevo muestra su miniatura', a[0]?.img, JSON.stringify(a));
  revisa('[lista] el viejo, sin miniatura, muestra su foto (antes: iniciales)', a[1]?.img, JSON.stringify(a));
  revisa('[lista] el que no tiene foto sigue con iniciales', a[2] && !a[2].img && a[2].txt === 'WO', JSON.stringify(a));
  await p.waitForFunction(() => window.__llamadas.rpc.some(x => x.n === 'v2_set_scouting_photo'), null, { timeout: 6000 }).catch(() => {});
  const ll = await p.evaluate(() => window.__llamadas);
  const sub = ll.upload[0], guarda = ll.rpc.find(x => x.n === 'v2_set_scouting_photo')?.prm;
  revisa('[repara] sube la miniatura del viejo junto a su original, sin pisar nada', ll.upload.length === 1 && /\/r-viejo\/profile-1787809089954-thumb\.(webp|jpe?g)$/.test(sub.ruta) && sub.bytes > 0 && !sub.upsert, JSON.stringify(ll.upload));
  revisa('[repara] y la guarda en su reporte', guarda?.report_id === 'r-viejo' && guarda.photo_path.endsWith('profile-1787809089954.webp') && guarda.photo_thumb_path === sub?.ruta, JSON.stringify(guarda));
  revisa('[repara] no toca el que ya tenía miniatura', !ll.upload.some(u => /r-nuevo/.test(u.ruta)));
  const firmas = ll.firma;
  revisa('[lista] del nuevo sólo se firma la miniatura', firmas.some(f => /r-nuevo\/.*-thumb\./.test(f)) && !firmas.some(f => /r-nuevo\/profile-\d+\.webp$/.test(f)), JSON.stringify(firmas));
  await p.close();
}

{
  const p = await abre({ escribe: false });
  await p.waitForTimeout(800);
  const ll = await p.evaluate(() => window.__llamadas);
  revisa('[sólo ver] también ve la foto del viejo', (await avatares(p))[1]?.img);
  revisa('[sólo ver] pero no sube ni guarda nada', ll.upload.length === 0 && !ll.rpc.some(x => x.n === 'v2_set_scouting_photo'), JSON.stringify(ll.upload));
  await p.close();
}

await nav.close(); srv.close();
let mal = 0;
for (const r of revisiones) if (!r.ok) { mal++; console.error(` - ${r.nombre}${r.detalle ? ' :: ' + r.detalle : ''}`); }
if (errores.length) { console.error('ERRORES DEL NAVEGADOR:'); errores.forEach(e => console.error('   ' + e)); }
if (mal || errores.length) { console.error(`Scouting fotos humo FAILED · ${mal} de ${revisiones.length}, ${errores.length} errores`); process.exit(1); }
console.log(`Scouting fotos humo OK · ${revisiones.length} revisiones: miniaturas, fotos viejas sin miniatura y su reparación`);
