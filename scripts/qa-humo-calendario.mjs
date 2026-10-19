/* CALENDARIO: TOCAR UN DÍA PARA AGREGAR, Y LA CARA DEL CUMPLEAÑERO A LA VISTA.
 *
 * Pedido (19/10/2026, con captura de iPhone):
 *   · "Fíjate cómo se tapa todo el morrillo": en la tarjeta del cumpleaños el
 *     nombre iba ENCIMA de la foto y le tapaba la cara. Ahora la foto va arriba
 *     y el texto debajo, sin encimarse.
 *   · "Si hay que agregar algo al calendario, que se pueda uno meter": tocar un
 *     día enseña su agenda y un botón "+ Agregar el 19 oct" que abre el
 *     formulario con esa fecha ya puesta.
 * Levanta la pantalla REAL con un Supabase falso, a 390px.
 */
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
await new Promise(r => srv.listen(4771, r));

const hoy = new Date(); const Y = hoy.getFullYear(), M = hoy.getMonth();
const iso = (d, h = 18) => new Date(Y, M, d, h, 0).toISOString();
const pad = v => String(v).padStart(2, '0');
const DIA_VACIO = hoy.getDate() === 22 ? 23 : 22;   // un día sin nada, siempre de este mes
const ITEMS = [
  { source:'birthday', sourceId:'p1', startsAt: iso(11, 12), allDay:true, title:'Cumpleaños', detail:'Cumple 4' },
  { source:'match', sourceId:'m1', startsAt: iso(13, 17), title:'Mini Baby Tanner · vs MLK', detail:'Copa' },
  { source:'session', sourceId:'s1', startsAt: iso(13, 18), title:'Entrenamiento T10', location:'Cancha 1' }
];
const PLAYERS = [{ id:'p1', first_name:'Luis Alberto', last_name:'Reyes Hernandez', category:'Baby Tanner', birth_date:`2022-${pad(M + 1)}-11`, photo_thumb_path:'org/p1-thumb.webp', photo_bucket:'tanneros-private' }];

const nav = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const revisiones = [], errores = [];
const revisa = (n, ok, d = '') => revisiones.push({ n, ok, d });

async function abre(escribe = true) {
  const pg = await nav.newPage({ viewport: { width: 390, height: 844 } });
  pg.on('pageerror', e => errores.push('pageerror: ' + e.message));
  await pg.addInitScript(({ ITEMS, PLAYERS, escribe }) => {
    window.__rpc = [];
    const R = { v2_my_context: [{ organization_id:'o1', organization_name:'Tannery City FC', role:'Presidencia', is_owner:true }],
      v2_my_modules: [{ module_code:'calendar', enabled:true, can_read:true, can_write:escribe }],
      v2_players: PLAYERS, v2_calendar: ITEMS, v2_upsert_club_event_notify: { ok:true } };
    window.__fake = { auth: { getSession: async () => ({ data:{ session:{ user:{ id:'u1' } } } }), onAuthStateChange(){ return { data:{ subscription:{ unsubscribe(){} } } }; } },
      rpc: async (n, p) => { window.__rpc.push({ n, p }); return { data: R[n] ?? null, error: null }; } };
  }, { ITEMS, PLAYERS, escribe });
  await pg.route('**/v2/supabase-client.js', r => r.fulfill({ status:200, contentType:'text/javascript', body:'export function createClient(){ return window.__fake; }' }));
  await pg.route('**/v2/photo-cache.js', r => r.fulfill({ status:200, contentType:'text/javascript', body:'export async function getSignedPhotoUrls(_s,_b,paths){ const m={}; for(const p of paths) m[p]="/icon-512.png"; return m; }' }));
  await pg.route('**/v2/branding-auto.js', r => r.fulfill({ status:200, contentType:'text/javascript', body:'' }));
  await pg.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await pg.goto('http://127.0.0.1:4771/v2/calendario/', { waitUntil:'domcontentloaded' });
  await pg.waitForSelector('#view:not(.hidden)', { timeout: 8000 });
  await pg.waitForTimeout(300);
  return pg;
}

{
  const pg = await abre();
  const tarjeta = await pg.evaluate(() => {
    const c = document.querySelector('.rail-card.source-birthday.has-photo'); if (!c) return null;
    const foto = c.querySelector('.rail-foto').getBoundingClientRect(), nombre = c.querySelector('.rail-pie strong').getBoundingClientRect();
    return { encima: nombre.top < foto.bottom - 1, nombre: c.querySelector('.rail-pie strong').textContent };
  });
  revisa('[cumple] la foto va arriba y el nombre debajo, sin taparle la cara', tarjeta && !tarjeta.encima && /Luis Alberto/.test(tarjeta.nombre), JSON.stringify(tarjeta));
  revisa('[día] sin elegir día no hay botón de agregar en el día', await pg.isHidden('#addOnDay'));
  if (process.env.QA_CAPTURA) await pg.screenshot({ path: process.env.QA_CAPTURA.replace('.png', '-mes.png'), fullPage: true });

  // Un día con cosas: su agenda en lista y el botón con esa fecha.
  await pg.click(`.day:not(.blank) >> text="13"`);
  await pg.waitForTimeout(200);
  revisa('[día] el título dice el día elegido', /13/.test(await pg.textContent('#agendaTitle')), await pg.textContent('#agendaTitle'));
  const cab = await pg.evaluate(() => { const t = document.getElementById('agendaTitle').getBoundingClientRect(), b = document.getElementById('addOnDay').getBoundingClientRect(); return { x: Math.round(t.left), hueco: Math.round(b.top - t.bottom) }; });
  revisa('[día] el título va a la izquierda y el botón justo debajo (sin hueco)', cab.x < 50 && cab.hueco >= 0 && cab.hueco < 40, JSON.stringify(cab));
  revisa('[día] su agenda: el partido y el entrenamiento, en lista', (await pg.$$('#agendaRail.dia .rail-card')).length === 2);
  if (process.env.QA_CAPTURA) await pg.screenshot({ path: process.env.QA_CAPTURA.replace('.png', '-dia.png'), fullPage: true });
  revisa('[día] botón "+ Agregar el 13 …"', /\+ Agregar el 13/.test(await pg.textContent('#addOnDay')) && await pg.isVisible('#addOnDay'), await pg.textContent('#addOnDay'));

  // Un día vacío: dice que no hay nada y deja agregar con la fecha puesta.
  await pg.click(`.day:not(.blank) >> text="${DIA_VACIO}"`);
  await pg.waitForTimeout(200);
  revisa('[día vacío] invita a agregar', /Toca "\+ Agregar"/.test(await pg.textContent('#empty')) && await pg.isVisible('#empty'));
  await pg.click('#addOnDay');
  await pg.waitForSelector('#eventModal:not(.hidden)', { timeout: 3000 }).catch(() => {});
  const fecha = await pg.inputValue('#eventDate');
  revisa('[agregar] abre el formulario con la fecha de ese día, 6 pm', fecha === `${Y}-${pad(M + 1)}-${pad(DIA_VACIO)}T18:00`, fecha);
  await pg.fill('#eventTitle', 'Junta de papás');
  await pg.click('#saveEvent');
  await pg.waitForTimeout(400);
  const guardado = await pg.evaluate(() => window.__rpc.filter(x => x.n === 'v2_upsert_club_event_notify').map(x => x.p)[0]);
  revisa('[agregar] se guarda en esa fecha', guardado && guardado.title === 'Junta de papás' && new Date(guardado.starts_at).getDate() === new Date(`${fecha}`).getDate(), JSON.stringify(guardado));
  revisa('[todo] nada se sale a 390px', await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  if (process.env.QA_CAPTURA) await pg.screenshot({ path: process.env.QA_CAPTURA, fullPage: true });
  await pg.close();
}
{
  const pg = await abre(false);
  await pg.click(`.day:not(.blank) >> text="13"`); await pg.waitForTimeout(200);
  revisa('[permiso] quien sólo lee no ve "+ Agregar"', await pg.isHidden('#addOnDay'));
  await pg.close();
}

await nav.close(); srv.close();
let mal = 0; for (const r of revisiones) if (!r.ok) { mal++; console.error(` - ${r.n}${r.d ? ' :: ' + r.d : ''}`); }
if (errores.length) { console.error('ERRORES:'); errores.forEach(e => console.error('   ' + e)); }
if (mal || errores.length) { console.error(`Calendario humo FAILED · ${mal} de ${revisiones.length}, ${errores.length} errores`); process.exit(1); }
console.log(`Calendario humo OK · ${revisiones.length} revisiones: la cara del cumpleañero a la vista y tocar un día para agregar`);
