/* FICHAJES: ORDEN, FILTROS Y "¿CÓMO NOS CONOCIERON?".
 *
 * Presidencia, 11/10/2026: "quiero ver los últimos que se registraron",
 * "los filtros están feos", "una pantalla se salía" y "ver quién lo
 * recomendó, con una gráfica". Revisa:
 *   · la lista abre con el último registro arriba y dice "Se registró hace…";
 *   · "Por atender" vuelve al orden por urgencia y se recuerda;
 *   · con los filtros abiertos nada se sale de la pantalla a 390px;
 *   · la gráfica junta "Michel", "michel enriquez" y "Michel Enríquez",
 *     dice cuántos se ficharon y deja "Sin nombre" al final;
 *   · tocar una barra deja en la lista sólo a esos registros, con un chip
 *     para quitar el filtro; "Por medio" cuenta redes, Facebook, etc.
 */
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const T = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('no'); return; }
  r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(4798, r));

const hace = d => new Date(Date.now() - d*86400000).toISOString();
const PROSPECTOS = [
  { id:'p2', first_name:'Mateo', last_name:'Reciente', status:'contacted', created_at:hace(2), registration_type:'player', category_interest:'T10',
    guardian_name:'Rosa Pérez', phone:'524770000002', purpose:'Clase muestra', sex:'M' },
  { id:'p1', first_name:'LIONEL andrés', last_name:'Olvidado', status:'new', created_at:hace(12), registration_type:'player', category_interest:'T8',
    guardian_name:'LAURA Ortiz', phone:'+52 477 111 2233', purpose:'Clase muestra', sex:'M' },
  { id:'p4', first_name:'Iñigo', last_name:'Tres Mensajes', status:'contacted', created_at:hace(5), registration_type:'player', category_interest:'T12',
    guardian_name:'Ana Ruiz', phone:'524770000004', purpose:'Clase muestra', sex:'M' },
  { id:'p5', first_name:'Sofía', last_name:'Inscripción', status:'new', created_at:hace(1), registration_type:'player', category_interest:'Baby Tanner',
    guardian_name:'Marta Gil', phone:'524770000005', purpose:'Inscripción a la academia', sex:'F' },
  { id:'p3', first_name:'Iker', last_name:'Fichado', status:'converted', created_at:hace(40), registration_type:'player', category_interest:'T12' },
  { id:'r1', first_name:'Ana', last_name:'Nueva', status:'new', created_at:hace(0.05), registration_type:'player', source_channel:'Recomendación', referral_name:'Michel' },
  { id:'r2', first_name:'Bruno', last_name:'Fichado', status:'converted', created_at:hace(3), registration_type:'player', source_channel:'Recomendación', referral_name:'michel enriquez' },
  { id:'r3', first_name:'Ciro', last_name:'Tres', status:'new', created_at:hace(4), registration_type:'player', source_channel:'Recomendación', referral_name:'Michel Enríquez' },
  { id:'r4', first_name:'Dana', last_name:'Crespo', status:'contacted', created_at:hace(6), registration_type:'player', source_channel:'Recomendación', referral_name:'Crespo' },
  { id:'r5', first_name:'Elio', last_name:'Sin Nombre', status:'new', created_at:hace(7), registration_type:'player', source_channel:'Recomendación' },
  { id:'r6', first_name:'Fer', last_name:'Redes', status:'new', created_at:hace(8), registration_type:'player', source_channel:'Redes sociales' }
];
const revisiones = [], errores = [];
const revisa = (n, ok, d='') => revisiones.push({ nombre:n, ok, detalle:d });
const nav = await chromium.launch({ executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });

async function abre({ falla=false } = {}) {
  const p = await nav.newPage({ viewport:{ width:390, height:844 } });
  p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
  await p.addInitScript(({ PROSPECTOS, falla }) => {
    const mk = l => l.map(([c,w]) => ({ module_code:c, enabled:true, can_read:true, can_write:w }));
    const R = {
      v2_my_context:[{ user_id:'zul', display_name:'Zul Hernández', organization_id:'o1', organization_name:'Tannery City FC', role:'Operaciones', is_owner:false }],
      v2_my_modules:mk([['prospects',true],['players',true]]),
      v2_my_navigation:mk([['prospectos',true],['jugadores',true],['taquilla',true],['cobranza',true],['tienda',true],['estacionamiento',true],['contabilidad',false]]),
      v2_prospects:PROSPECTOS, v2_player_categories:[], v2_scouting_reports:[],
      v2_stale_prospects:[{ id:'p1', days:12 },{ id:'p3', days:40 }],
      v2_prospect_messages:[{ id:'p2', sent:1 },{ id:'p4', sent:3 }],
      v2_log_prospect_message:{ sent:1 }
    };
    window.__abiertos = []; window.__logs = [];
    window.open = (u) => { window.__abiertos.push(u); return null; };
    window.__fakeSupabase = {
      auth:{ getSession:async()=>({data:{session:{user:{id:'zul'}}}}), getUser:async()=>({data:{user:{id:'zul'}}}), onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}) },
      rpc:async (n, params) => { if (n==='v2_log_prospect_message') window.__logs.push(params); return (falla && n==='v2_stale_prospects') ? { data:null, error:{ message:'boom' } } : { data:R[n] ?? null, error:null }; },
      storage:{ from:()=>({ createSignedUrl:async()=>({data:null}), createSignedUrls:async()=>({data:[]}) }) },
      channel:()=>({ on(){return this;}, subscribe(){return this;} }), removeChannel(){}
    };
  }, { PROSPECTOS, falla });
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.route('**/v2/supabase-client.js', r => r.fulfill({ status:200, contentType:'text/javascript', body:'export function createClient(){ return window.__fakeSupabase; }' }));
  await p.route('**/v2/photo-cache.js', r => r.fulfill({ status:200, contentType:'text/javascript',
    body:'export async function getSignedPhotoUrls(){return {};}export async function getSignedPhotoUrl(){return null;}export async function getRawSignedPhotoUrl(){return null;}export async function clearPhotoCache(){}export function forgetPhoto(){}' }));
  await p.goto('http://127.0.0.1:4798/v2/prospectos/', { waitUntil:'domcontentloaded' });
  await p.waitForSelector('#prospectList .prospect-row', { timeout:8000 });
  await p.waitForTimeout(300);
  return p;
}
const filas = p => p.$$eval('#prospectList .prospect-row', r => r.map(x => x.innerText.replace(/\s+/g,' ')));
const nombres = p => p.$$eval('#prospectList .prospect-row strong', r => r.map(x => x.textContent.trim()));
const barras = p => p.$$eval('#origenBarras .origen-fila', r => r.map(x => x.innerText.replace(/\s+/g,' ').trim()));
const ancho = p => p.evaluate(() => document.documentElement.scrollWidth);

{
  const p = await abre();
  const f = await filas(p);
  revisa('[orden] el último registro va arriba', /Ana Nueva/.test(f[0]||''), JSON.stringify(f.slice(0,3)));
  revisa('[orden] y dice hace cuánto se registró', /Se registró hace (un momento|\d+ (min|h))/.test(f[0]||''), f[0]);
  revisa('[orden] los demás van de más nuevo a más viejo', JSON.stringify((await nombres(p)).slice(0,3)) === JSON.stringify(['Ana Nueva','Sofía Inscripción','Mateo Reciente']), JSON.stringify(await nombres(p)));
  await p.click('#ordenLista [data-orden="atender"]');
  revisa('[orden] "Por atender" pone primero al olvidado', /LIONEL andrés Olvidado/.test((await filas(p))[0]||''));

  await p.click('#toggleProspectFilters');
  await p.waitForTimeout(200);
  revisa('[pantalla] con los filtros abiertos nada se sale a 390px', (await ancho(p)) <= 390, String(await ancho(p)));
  const chips = await p.$$eval('.pill-group[data-for="urgencyFilter"] button', b => b.map(x => { const r = x.getBoundingClientRect(); return r.right; }));
  revisa('[filtros] todos los chips de prioridad se ven', chips.every(r => r <= 390), JSON.stringify(chips));
  await p.click('#toggleProspectFilters');

  const b = await barras(p);
  revisa('[origen] junta los "Michel" escritos distinto y dice cuántos se ficharon', /^Michel Enriquez 3 1 fichado$/.test(b[0]||''), JSON.stringify(b));
  revisa('[origen] Crespo aparte y "Sin nombre" al final', /^Crespo 1$/.test(b[1]||'') && /^Sin nombre 1$/.test(b.at(-1)||''), JSON.stringify(b));
  await p.click('#origenBarras .origen-fila:first-child');
  const conMichel = await nombres(p);
  revisa('[origen] tocar la barra deja sólo a los que recomendó Michel (incluido el fichado)', conMichel.length === 3 && conMichel.includes('Bruno Fichado'), JSON.stringify(conMichel));
  revisa('[origen] con un chip que dice el filtro', /Recomendó: Michel Enriquez/.test(await p.textContent('#origenChip')));
  await p.click('#origenChip');
  revisa('[origen] el chip quita el filtro', (await nombres(p)).length > 3 && !(await p.$('#origenChip')));
  await p.click('.origen-tabs [data-origen="medio"]');
  const m = await barras(p);
  revisa('[origen] "Por medio" cuenta recomendaciones, redes y sin dato', /^Recomendación 5 1 fichado$/.test(m[0]||'') && m.some(x => /^Redes Sociales 1$/.test(x)), JSON.stringify(m));
  revisa('[pantalla] la lista y la gráfica caben a 390px', (await ancho(p)) <= 390, String(await ancho(p)));
  await p.close();
}

await nav.close(); srv.close();
let mal = 0;
for (const r of revisiones) if (!r.ok) { mal++; console.error(` - ${r.nombre}${r.detalle ? ' :: ' + r.detalle : ''}`); }
if (errores.length) { console.error('ERRORES DEL NAVEGADOR:'); errores.forEach(e => console.error('   ' + e)); }
if (mal || errores.length) { console.error(`Fichajes origen humo FAILED · ${mal} de ${revisiones.length}, ${errores.length} errores`); process.exit(1); }
console.log(`Fichajes origen humo OK · ${revisiones.length} revisiones: más recientes arriba, filtros sin desborde y quién recomienda`);
