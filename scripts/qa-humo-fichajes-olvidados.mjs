/* FICHAJES OLVIDADOS.
 *
 * Pedido (07/10/2026): "el aviso de prospectos olvidados" y que a Zul
 * (Operaciones) le salga "Registrar jugador" en el botón flotante.
 * Medido: 29 prospectos abiertos con más de 7 días sin seguimiento.
 *
 * Esta prueba levanta /v2/prospectos/ REAL con un Supabase falso y revisa:
 *   · el resumen trae "Olvidados +7 días" con el conteo que da el servidor;
 *   · el olvidado sale primero, con "Olvidado · 12 días" en rojo;
 *   · un fichado nunca cuenta como olvidado aunque el servidor lo mande;
 *   · tocar el resumen filtra sólo a los olvidados;
 *   · si v2_stale_prospects falla, Fichajes carga igual;
 *   · Operaciones tiene "Registrar jugador" en el botón flotante.
 */
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const RAIZ = '/home/user/TannerOs';
const T = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('no'); return; }
  r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(4796, r));

const hace = d => new Date(Date.now() - d*86400000).toISOString();
const PROSPECTOS = [
  { id:'p2', first_name:'Mateo', last_name:'Reciente', status:'contacted', created_at:hace(2), registration_type:'player', category_interest:'T10' },
  { id:'p1', first_name:'Lionel', last_name:'Olvidado', status:'new', created_at:hace(12), registration_type:'player', category_interest:'T8' },
  { id:'p3', first_name:'Iker', last_name:'Fichado', status:'converted', created_at:hace(40), registration_type:'player', category_interest:'T12' }
];
const revisiones = [], errores = [];
const revisa = (n, ok, d='') => revisiones.push({ nombre:n, ok, detalle:d });
const nav = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });

async function abre({ falla=false } = {}) {
  const p = await nav.newPage({ viewport:{ width:390, height:844 } });
  p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
  await p.addInitScript(({ PROSPECTOS, falla }) => {
    const mk = l => l.map(([c,w]) => ({ module_code:c, enabled:true, can_read:true, can_write:w }));
    const R = {
      v2_my_context:[{ user_id:'zul', display_name:'Zul', organization_id:'o1', organization_name:'Tannery City FC', role:'Operaciones', is_owner:false }],
      v2_my_modules:mk([['prospects',true],['players',true]]),
      v2_my_navigation:mk([['prospectos',true],['jugadores',true],['taquilla',true],['cobranza',true],['tienda',true],['estacionamiento',true],['contabilidad',false]]),
      v2_prospects:PROSPECTOS, v2_player_categories:[], v2_scouting_reports:[],
      v2_stale_prospects:[{ id:'p1', days:12 },{ id:'p3', days:40 }]
    };
    window.__fakeSupabase = {
      auth:{ getSession:async()=>({data:{session:{user:{id:'zul'}}}}), getUser:async()=>({data:{user:{id:'zul'}}}), onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}) },
      rpc:async n => (falla && n==='v2_stale_prospects') ? { data:null, error:{ message:'boom' } } : { data:R[n] ?? null, error:null },
      storage:{ from:()=>({ createSignedUrl:async()=>({data:null}), createSignedUrls:async()=>({data:[]}) }) },
      channel:()=>({ on(){return this;}, subscribe(){return this;} }), removeChannel(){}
    };
  }, { PROSPECTOS, falla });
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.route('**/v2/supabase-client.js', r => r.fulfill({ status:200, contentType:'text/javascript', body:'export function createClient(){ return window.__fakeSupabase; }' }));
  await p.route('**/v2/photo-cache.js', r => r.fulfill({ status:200, contentType:'text/javascript',
    body:'export async function getSignedPhotoUrls(){return {};}export async function getSignedPhotoUrl(){return null;}export async function getRawSignedPhotoUrl(){return null;}export async function clearPhotoCache(){}export function forgetPhoto(){}' }));
  await p.goto('http://127.0.0.1:4796/v2/prospectos/', { waitUntil:'domcontentloaded' });
  await p.waitForSelector('#prospectList .prospect-row', { timeout:8000 });
  await p.waitForTimeout(300);
  return p;
}
const filas = p => p.$$eval('#prospectList .prospect-row', r => r.map(x => x.innerText.replace(/\s+/g,' ')));

{
  const p = await abre();
  const kpi = (await p.innerText('.campaign-kpis .kpi-card:first-child')).replace(/\s+/g,' ').trim();
  revisa('[resumen] la primera tarjeta es "Olvidados" con 1 (el fichado no cuenta)', /^Olvidados 1 /.test(kpi), kpi);
  revisa('[resumen] se ve en el teléfono', await p.isVisible('#kpiForgotten'));
  const chips = await p.$$eval('#attentionSummary .attention-chip', b => b.map(x => x.textContent.replace(/\s+/g,' ').trim()));
  revisa('[resumen] Atención (computadora) también lo trae', chips[0] === 'Olvidados +7 días1', JSON.stringify(chips));
  const f = await filas(p);
  revisa('[lista] el olvidado sale primero', /Lionel Olvidado/.test(f[0]||''), JSON.stringify(f));
  revisa('[lista] con "Olvidado · 12 días"', /Olvidado · 12 días/.test(f[0]||''), f[0]);
  revisa('[lista] el reciente no dice olvidado', f.some(x => /Mateo Reciente/.test(x) && !/Olvidado/.test(x)), JSON.stringify(f));
  await p.click('.campaign-kpis .kpi-card:first-child');
  const g = await filas(p);
  revisa('[filtro] tocar la tarjeta deja sólo a los olvidados', g.length === 1 && /Lionel Olvidado/.test(g[0]), JSON.stringify(g));
  await p.click('#tosFab');
  const acciones = await p.$$eval('#tosFabMenu .tos-fab-item strong', s => s.map(x => x.textContent));
  revisa('[fab] Operaciones tiene "Registrar jugador" primero', acciones[0] === 'Registrar jugador', JSON.stringify(acciones));
  await p.close();
}
{
  const p = await abre({ falla:true });
  const f = await filas(p);
  revisa('[falla] si el servidor no responde, Fichajes carga igual', f.length === 2 && !f.some(x => /Olvidado ·/.test(x)), JSON.stringify(f));
  await p.close();
}

await nav.close(); srv.close();
let mal = 0;
for (const r of revisiones) if (!r.ok) { mal++; console.error(` - ${r.nombre}${r.detalle ? ' :: ' + r.detalle : ''}`); }
if (errores.length) { console.error('ERRORES DEL NAVEGADOR:'); errores.forEach(e => console.error('   ' + e)); }
if (mal || errores.length) { console.error(`Fichajes olvidados humo FAILED · ${mal} de ${revisiones.length}, ${errores.length} errores`); process.exit(1); }
console.log(`Fichajes olvidados humo OK · ${revisiones.length} revisiones: resumen, etiqueta, orden, filtro, falla del servidor y botón de Operaciones`);
