/* MENÚ POR SECCIONES (21/10/2026).
 *
 * Presidencia: "dale con todo ... simplificar cosas estilo Apple". El menú
 * pasó de ~29 entradas a secciones; cada pantalla vive dentro de la suya.
 *
 * Esta prueba monta el shell REAL (shell.js) con un Supabase falso y revisa:
 *   1. Presidencia ve sólo secciones arriba: Inicio, Mensajes, Jugadores,
 *      Partidos, Formación, Fichajes, Staff, Taquilla, Finanzas, Tienda,
 *      Utilería, Administración.
 *   2. Estando en Asistencia, Jugadores queda marcada y debajo salen sus
 *      pantallas (Asistencia, Becas); las de otras secciones no.
 *   3. Arriba de la pantalla salen las pestañas de la sección, con la actual
 *      marcada.
 *   4. Quien no ve la sección conserva su pantalla suelta (Formador con
 *      Asistencia sin Jugadores; Taquilla sin Finanzas conserva Contabilidad).
 *   5. Una sección de una sola pantalla no pinta pestañas.
 *   6. La Tienda trae sus propias pestañas: no se duplican.
 */
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const T = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json' };
const PAGINA = (active, extra = '') => `<!doctype html><html lang="es-MX"><head><meta charset="utf-8"></head><body>
<nav id="sidebarNav"></nav><main class="tos-content">${extra}<h1>Pantalla</h1></main>
<script type="module">
  import { renderShell } from '/v2/shell.js';
  renderShell({ ctx: window.__ctx, navigation: window.__nav, active: ${JSON.stringify(active)}, title: 'x' });
  window.__listo = true;
</script></body></html>`;
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  if (u.pathname === '/prueba.html') { r.writeHead(200, { 'content-type':'text/html' }); r.end(PAGINA(u.searchParams.get('active'), u.searchParams.get('tienda') ? '<nav class="tienda-tabs"></nav>' : '')); return; }
  let p = decodeURIComponent(u.pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('no'); return; }
  r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
  r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}`;

const mods = list => list.map(c => ({ module_code:c, enabled:true, can_read:true, can_write:true }));
const TODO = mods(['direccion','club','finanzas','taquilla','contabilidad','jugadores','asistencia','partidos','calendario','centro_tanner',
  'academias','formacion','prospectos','scouting','cursosVerano','tienda','catalogo','utileria','estacionamiento','patrocinadores','usuarios','admin','qa','encuestas']);
const ROLES = {
  Presidencia:{ ctx:{ organization_id:'o1', organization_slug:'tannery-city-fc', role:'Presidencia', is_owner:true, display_name:'Mich' }, nav:TODO },
  Formadores:{ ctx:{ organization_id:'o1', organization_slug:'tannery-city-fc', role:'Formadores', display_name:'Profe' }, nav:mods(['asistencia','partidos']) },
  Taquilla:{ ctx:{ organization_id:'o1', organization_slug:'tannery-city-fc', role:'Taquilla', display_name:'iPad' }, nav:mods(['taquilla','finanzas','contabilidad','estacionamiento']) }
};
const FAKE = `export function createClient(){return{auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}},signOut:async()=>({})},
  rpc:async()=>({data:null,error:null}),from(){const q={select(){return q},eq(){return q},order(){return q},limit(){return q},then(r){r({data:[],error:null})}};return q},
  channel(){const c={on(){return c},subscribe(){return c}};return c},removeChannel(){},storage:{from(){return{createSignedUrls:async()=>({data:[]})}}}}}`;

const browser = await chromium.launch({ executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
let fallos = 0, corridas = 0;
const revisa = (n, ok, d) => { corridas++; if (!ok) { fallos++; console.error(` - ${n}${d ? `\n   ${d}` : ''}`); } };

async function menu(rol, active, opts = '') {
  const pg = await browser.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await pg.route('**/v2/supabase-client.js', r => r.fulfill({ status:200, contentType:'text/javascript', body:FAKE }));
  await pg.addInitScript(([c, n]) => { window.__ctx = c; window.__nav = n; }, [ROLES[rol].ctx, ROLES[rol].nav]);
  await pg.goto(`${BASE}/prueba.html?active=${active}${opts}`, { waitUntil:'domcontentloaded' });
  await pg.waitForFunction(() => window.__listo, null, { timeout:8000 }).catch(() => {});
  const r = await pg.evaluate(() => ({
    arriba: [...document.querySelectorAll('#sidebarNav .tos-nav-item:not(.tos-nav-sub)')].map(a => a.textContent.trim()),
    sub: [...document.querySelectorAll('#sidebarNav .tos-nav-sub')].map(a => a.textContent.trim()),
    activa: [...document.querySelectorAll('#sidebarNav .tos-nav-item.active')].map(a => a.textContent.trim()),
    tabs: [...document.querySelectorAll('#tosSeccion a')].map(a => a.textContent.trim()),
    actual: document.querySelector('#tosSeccion a[aria-current="page"]')?.textContent.trim() || null
  }));
  await pg.close();
  return { ...r, errs };
}

{
  const m = await menu('Presidencia', 'asistencia');
  const espera = ['Inicio','Mensajes','Jugadores','Partidos','Formación','Fichajes','Staff','Taquilla','Finanzas','Tienda','Utilería','Administración'];
  revisa('1. Presidencia ve 12 secciones, no ~29 entradas', JSON.stringify(m.arriba) === JSON.stringify(espera), JSON.stringify(m.arriba));
  revisa('2. en Asistencia, Jugadores queda marcada', m.activa.includes('Jugadores') && m.activa.includes('Asistencia'), JSON.stringify(m.activa));
  revisa('2. y debajo sólo sus pantallas', JSON.stringify(m.sub) === '["Asistencia","Becas"]', JSON.stringify(m.sub));
  revisa('3. pestañas de la sección arriba', JSON.stringify(m.tabs) === '["Jugadores","Asistencia","Becas"]' && m.actual === 'Asistencia', JSON.stringify(m));
  revisa('sin errores', !m.errs.length, m.errs.join(' | '));
}
{
  const m = await menu('Presidencia', 'inicio');
  revisa('Inicio: Resumen, Dirección, Club y Encuestas', JSON.stringify(m.tabs) === '["Resumen","Club","Dirección","Encuestas"]' && m.actual === 'Resumen', JSON.stringify(m.tabs));
  const s = await menu('Presidencia', 'scouting');
  revisa('Fichajes trae Scouting', JSON.stringify(s.tabs) === '["Fichajes","Scouting"]' && s.actual === 'Scouting' && s.activa.includes('Fichajes'), JSON.stringify(s));
  const st = await menu('Presidencia', 'candidatos');
  revisa('Staff trae Candidatos', JSON.stringify(st.tabs) === '["Staff","Candidatos"]', JSON.stringify(st.tabs));
  const ad = await menu('Presidencia', 'usuarios');
  revisa('Administración trae Usuarios, Familias en el portal, Cambios y QA', JSON.stringify(ad.tabs) === '["Administración","Usuarios","Familias en el portal","Cambios","QA"]', JSON.stringify(ad.tabs));
}
{
  const m = await menu('Formadores', 'asistencia');
  revisa('4. el Formador sin Jugadores conserva Asistencia suelta', m.arriba.includes('Asistencia') && m.arriba.includes('Partidos') && !m.arriba.includes('Jugadores'), JSON.stringify(m.arriba));
  revisa('5. sección de una pantalla: sin pestañas', m.tabs.length === 0, JSON.stringify(m.tabs));
  const t = await menu('Taquilla', 'taquilla');
  revisa('4. Taquilla sin Finanzas conserva Contabilidad', t.arriba.includes('Contabilidad') && !t.arriba.includes('Finanzas'), JSON.stringify(t.arriba));
  revisa('4. y Estacionamiento sale debajo de Taquilla', JSON.stringify(t.sub) === '["Estacionamiento"]', JSON.stringify(t.sub));
}
{
  const m = await menu('Presidencia', 'catalogo', '&tienda=1');
  revisa('6. la Tienda no duplica pestañas', m.tabs.length === 0 && m.activa.includes('Tienda'), JSON.stringify(m));
}

await browser.close(); srv.close();
console.log(fallos ? `Menú por secciones FAILED · ${fallos} de ${corridas}` : `Menú por secciones OK · ${corridas} revisiones: secciones arriba, sus pantallas debajo y pestañas`);
process.exit(fallos ? 1 : 0);
