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
 *
 * Mensajes de seguimiento (07/10/2026), cadencia de 3 por WhatsApp:
 *   · el botón "Enviar mensaje 1 de 3" abre WhatsApp con el texto armado:
 *     tutor, niño, clase muestra sin costo, pregunta abierta y firma de quien
 *     lo envía;
 *   · inscripción y niña cambian el texto ("inscribir", "traerla");
 *   · al confirmar "Sí, lo envié" se registra el paso en el servidor;
 *   · el segundo mensaje y el tercero; con 3 enviados ya no hay botón.
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
  { id:'p2', first_name:'Mateo', last_name:'Reciente', status:'contacted', created_at:hace(2), registration_type:'player', category_interest:'T10',
    guardian_name:'Rosa Pérez', phone:'524770000002', purpose:'Clase muestra', sex:'M' },
  { id:'p1', first_name:'LIONEL andrés', last_name:'Olvidado', status:'new', created_at:hace(12), registration_type:'player', category_interest:'T8',
    guardian_name:'LAURA Ortiz', phone:'+52 477 111 2233', purpose:'Clase muestra', sex:'M' },
  { id:'p4', first_name:'Iñigo', last_name:'Tres Mensajes', status:'contacted', created_at:hace(5), registration_type:'player', category_interest:'T12',
    guardian_name:'Ana Ruiz', phone:'524770000004', purpose:'Clase muestra', sex:'M' },
  { id:'p5', first_name:'Sofía', last_name:'Inscripción', status:'new', created_at:hace(1), registration_type:'player', category_interest:'Baby Tanner',
    guardian_name:'Marta Gil', phone:'524770000005', purpose:'Inscripción a la academia', sex:'F' },
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
  revisa('[lista] el olvidado sale primero', /LIONEL andrés Olvidado/.test(f[0]||''), JSON.stringify(f));
  revisa('[mensajes] la lista dice cuántos mensajes lleva', f.some(x => /Mateo Reciente/.test(x) && /Mensaje 1 de 3/.test(x)) && f.some(x => /Tres Mensajes/.test(x) && /3 mensajes sin respuesta/.test(x)), JSON.stringify(f));
  revisa('[lista] con "Olvidado · 12 días"', /Olvidado · 12 días/.test(f[0]||''), f[0]);
  revisa('[lista] el reciente no dice olvidado', f.some(x => /Mateo Reciente/.test(x) && !/Olvidado/.test(x)), JSON.stringify(f));
  await p.click('.campaign-kpis .kpi-card:first-child');
  const g = await filas(p);
  revisa('[filtro] tocar la tarjeta deja sólo a los olvidados', g.length === 1 && /LIONEL andrés Olvidado/.test(g[0]), JSON.stringify(g));

  // Mensaje 1 al olvidado
  await p.click('#prospectList .prospect-row >> text=Ver ficha');
  await p.waitForSelector('#drawerQuickActions [data-seguimiento]', { timeout:4000 });
  revisa('[mensaje 1] el botón dice "Enviar mensaje 1 de 3"', (await p.innerText('#drawerQuickActions [data-seguimiento]')).trim() === 'Enviar mensaje 1 de 3');
  await p.click('#drawerQuickActions [data-seguimiento]');
  await p.waitForSelector('.tosdlg', { timeout:3000 });
  const url = (await p.evaluate(() => window.__abiertos))[0] || '';
  const texto = decodeURIComponent(url.split('?text=')[1] || '');
  revisa('[mensaje 1] abre el WhatsApp de la familia', url.startsWith('https://wa.me/524771112233?text='), url.slice(0, 60));
  revisa('[mensaje 1] saluda al tutor y firma quien lo envía', texto.startsWith('Hola Laura, soy Zul de Tannery City FC.'), texto.slice(0, 80));
  revisa('[mensaje 1] habla del niño, su clase muestra sin costo y la familia Tanner', /registraste a Lionel para su clase muestra en T8/.test(texto) && /sin costo/.test(texto) && /familia Tanner/.test(texto), texto);
  revisa('[mensaje 1] cierra con la pregunta abierta', /¿Qué día de esta semana te queda mejor para traerlo\?$/.test(texto), texto.slice(-80));
  await p.click('.tosdlg-ok');
  await p.waitForTimeout(300);
  const logs = await p.evaluate(() => window.__logs);
  revisa('[mensaje 1] "Sí, lo envié" registra el paso 1', logs.length === 1 && logs[0].prospect_id === 'p1' && logs[0].step === 1, JSON.stringify(logs));
  await p.click('#closeProspect');

  // Mensaje 2 a quien ya lleva 1; y el de 3 ya no tiene botón
  await p.evaluate(() => document.getElementById('clearFilters').click());
  await p.click('#prospectList .prospect-row:has-text("Mateo Reciente") >> text=Ver ficha');
  await p.waitForSelector('#drawerQuickActions [data-seguimiento]', { timeout:4000 });
  revisa('[mensaje 2] el botón dice "Enviar mensaje 2 de 3"', (await p.innerText('#drawerQuickActions [data-seguimiento]')).trim() === 'Enviar mensaje 2 de 3');
  await p.click('#drawerQuickActions [data-seguimiento]');
  await p.waitForSelector('.tosdlg', { timeout:3000 });
  const t2 = decodeURIComponent(((await p.evaluate(() => window.__abiertos))[1] || '').split('?text=')[1] || '');
  revisa('[mensaje 2] es el recordatorio corto', /por si se te pasó mi mensaje/.test(t2) && /Mateo/.test(t2), t2);
  await p.click('.tosdlg-cancel');
  revisa('[mensaje 2] "Todavía no" no registra nada', (await p.evaluate(() => window.__logs.length)) === 1);
  await p.click('#closeProspect');
  await p.click('#prospectList .prospect-row:has-text("Tres Mensajes") >> text=Ver ficha');
  await p.waitForTimeout(300);
  revisa('[mensaje 3] con 3 enviados ya no hay botón y sugiere "No continúa"', !(await p.$('#drawerQuickActions [data-seguimiento]')) && /No continúa/.test(await p.innerText('#drawerQuickActions')));
  await p.click('#closeProspect');

  // Inscripción y niña
  await p.click('#prospectList .prospect-row:has-text("Sofía Inscripción") >> text=Ver ficha');
  await p.waitForSelector('#drawerQuickActions [data-seguimiento]', { timeout:4000 });
  await p.click('#drawerQuickActions [data-seguimiento]');
  await p.waitForSelector('.tosdlg', { timeout:3000 });
  const t5 = decodeURIComponent(((await p.evaluate(() => window.__abiertos))[2] || '').split('?text=')[1] || '');
  revisa('[inscripción] habla de inscribirla y usa "traerla"', /quieres inscribir a Sofía en Baby Tanner/.test(t5) && /traerla\?$/.test(t5), t5);
  await p.click('.tosdlg-cancel');
  await p.click('#closeProspect');
  await p.click('#tosFab');
  const acciones = await p.$$eval('#tosFabMenu .tos-fab-item strong', s => s.map(x => x.textContent));
  revisa('[fab] Operaciones tiene "Registrar jugador" primero', acciones[0] === 'Registrar jugador', JSON.stringify(acciones));
  await p.close();
}
{
  const p = await abre({ falla:true });
  const f = await filas(p);
  revisa('[falla] si el servidor no responde, Fichajes carga igual', f.length === 4 && !f.some(x => /Olvidado ·/.test(x)), JSON.stringify(f));
  await p.close();
}

await nav.close(); srv.close();
let mal = 0;
for (const r of revisiones) if (!r.ok) { mal++; console.error(` - ${r.nombre}${r.detalle ? ' :: ' + r.detalle : ''}`); }
if (errores.length) { console.error('ERRORES DEL NAVEGADOR:'); errores.forEach(e => console.error('   ' + e)); }
if (mal || errores.length) { console.error(`Fichajes olvidados humo FAILED · ${mal} de ${revisiones.length}, ${errores.length} errores`); process.exit(1); }
console.log(`Fichajes olvidados humo OK · ${revisiones.length} revisiones: resumen, etiqueta, orden, filtro, mensajes de seguimiento 1-2-3, falla del servidor y botón de Operaciones`);
