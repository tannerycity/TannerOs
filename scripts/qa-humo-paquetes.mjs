/* Paquetes y porteros (h62, 04/11/2026).
 *
 * Presidencia: "un área de porteros... clic y ver todos los que son
 * porteros"; "en enero vamos a tener 6 paquetes... cambiarles costos de
 * todo"; "que las becas ya no sean informativas, que se descuenten solas".
 *
 * Levanta /v2/paquetes/ REAL con un Supabase falso y revisa:
 *   1. Porteros: los de Alexis y los que no están en la academia, con su
 *      paquete y su saldo; cada uno abre su estado de cuenta.
 *   2. Precios: los 6 paquetes por grupo, el precio de hoy y el que viene;
 *      Presidencia pone un precio desde enero (manda paquete, precio y mes).
 *   3. Asignar: los que quedan igual van solos; los que cambiarían de monto
 *      sólo si se marcan; los bloqueados no se mandan; pide motivo.
 *   4. Quien no es Presidencia no ve "Asignar" ni puede tocar precios.
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
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}`;

const revisiones = [], errores = [];
const revisa = (n, ok, d = '') => revisiones.push({ nombre:n, ok, detalle:d });
const nav = await chromium.launch({ executablePath:process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });

const PAQ = (canEdit) => ({ canEdit, packages:[
  { code:'tanner_4', name:'Tanner 4 días', audience:'tanner', days:4, goalkeeperDays:0, trainsWithCategory:true, price:800, nextPrice:800, upcoming:[{ fee:900, from:'2027-01-01' }], players:30 },
  { code:'tanner_2', name:'Tanner 2 días', audience:'tanner', days:2, goalkeeperDays:0, trainsWithCategory:true, price:null, nextPrice:null, upcoming:[], players:0 },
  { code:'baby_3', name:'Baby 3 días', audience:'baby', days:3, goalkeeperDays:0, trainsWithCategory:true, price:550, nextPrice:550, upcoming:[], players:20 },
  { code:'baby_2', name:'Baby 2 días', audience:'baby', days:2, goalkeeperDays:0, trainsWithCategory:true, price:null, nextPrice:null, upcoming:[], players:0 },
  { code:'porteros_4', name:'Porteros 4 días', audience:'porteros', days:4, goalkeeperDays:2, trainsWithCategory:true, price:800, nextPrice:800, upcoming:[], players:2 },
  { code:'porteros_2', name:'Porteros 2 días', audience:'porteros', days:2, goalkeeperDays:2, trainsWithCategory:false, price:500, nextPrice:500, upcoming:[], players:1 } ] });
const PORTEROS = [
  { id:'g1', name:'Iker Morales', category:'T12', package:'porteros_4', packageName:'Porteros 4 días', fee:800, inAcademy:true, academyFee:0, balance:0 },
  { id:'g2', name:'Maxi Aguirre', category:'T10', package:'porteros_2', packageName:'Porteros 2 días', fee:500, inAcademy:true, academyFee:0, balance:500 },
  { id:'g3', name:'Pepe Sin Academia', category:'T10', package:null, packageName:null, fee:800, inAcademy:false, academyFee:null, balance:0 } ];
const PROPUESTA = [
  { playerId:'a1', name:'Ana Igual', category:'T10', current:500, package:'tanner_4', packageName:'Tanner 4 días', price:800, discount:300, fee:500, alreadySet:false, blocked:null },
  { playerId:'a2', name:'Beto Igual', category:'T6', current:550, package:'baby_3', packageName:'Baby 3 días', price:550, discount:0, fee:550, alreadySet:false, blocked:null },
  { playerId:'a3', name:'Caro Sube', category:'T6', current:400, package:'baby_3', packageName:'Baby 3 días', price:550, discount:0, fee:550, alreadySet:false, blocked:null },
  { playerId:'a4', name:'Dani Baja', category:'T12', current:1300, package:'porteros_4', packageName:'Porteros 4 días', price:800, discount:0, fee:800, alreadySet:false, blocked:null },
  { playerId:'a5', name:'Eli Revision', category:'T10', current:0, package:'tanner_4', packageName:'Tanner 4 días', price:800, discount:0, fee:800, alreadySet:false, blocked:'Cobro en revisión' },
  { playerId:'a6', name:'Fer Ya', category:'T10', current:800, package:'tanner_4', packageName:'Tanner 4 días', price:800, discount:0, fee:800, alreadySet:true, blocked:null } ];

async function abre(ruta, { pres = true } = {}) {
  const p = await nav.newPage({ viewport:{ width:390, height:844 } });
  p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
  await p.addInitScript(({ pres, paq, porteros, propuesta }) => {
    window.__llamadas = [];
    const m = ['cobranza','contabilidad','taquilla','jugadores'].map(c => ({ module_code:c, enabled:true, can_read:true, can_write:true }));
    const R = { v2_my_context:[{ user_id:'u1', display_name:'Mich', organization_id:'o1', organization_name:'Tannery City FC', role:pres ? 'Presidencia' : 'Contabilidad', is_owner:pres }],
                v2_my_navigation:m, v2_goalkeepers:porteros, v2_club_packages:paq, v2_package_proposal:propuesta,
                v2_apply_package_proposal:{ applied:3 }, v2_set_package_price:paq };
    window.__fakeSupabase = {
      auth:{ getSession:async()=>({data:{session:{user:{id:'u1'}}}}), getUser:async()=>({data:{user:{id:'u1'}}}), onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}) },
      rpc:async(n, params)=>{ window.__llamadas.push({ n, params }); return { data:R[n] ?? null, error:null }; },
      channel:()=>({ on(){return this;}, subscribe(){return this;} }), removeChannel(){}
    };
  }, { pres, paq:PAQ(pres), porteros:PORTEROS, propuesta:PROPUESTA });
  await p.route('**/v2/supabase-client.js', r => r.fulfill({ status:200, contentType:'text/javascript', body:'export function createClient(){ return window.__fakeSupabase; }' }));
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(BASE + ruta, { waitUntil:'domcontentloaded' });
  await p.waitForSelector('.pq-tabs', { timeout:8000 });
  await p.waitForFunction(() => !document.querySelector('.pq-cuerpo .tos-empty') || !/Cargando|Armando/.test(document.querySelector('.pq-cuerpo .tos-empty').textContent), null, { timeout:8000 });
  return p;
}
const llamadas = (p, n) => p.evaluate(n => window.__llamadas.filter(l => l.n === n), n);
const texto = (p, s) => p.textContent(s).then(t => t.replace(/\s+/g, ' '));

/* 1. Porteros */
{
  const p = await abre('/v2/paquetes/?ver=porteros');
  if (process.env.SHOTS) await p.screenshot({ path:`${process.env.SHOTS}/paquetes-porteros.png`, fullPage:true });
  const t = await texto(p, '.pq-cuerpo');
  revisa('[porteros] resumen: 3 porteros, 2 con Alexis, 1 debe', /3\s*porteros/.test(t) && /2\s*con Alexis/.test(t) && /1\s*debe\b/.test(t), t.slice(0, 200));
  revisa('[porteros] con Alexis: su paquete y su saldo', /Iker Morales/.test(t) && /Porteros 4 días/.test(t) && /Maxi Aguirre/.test(t) && /Debe \$500\.00/.test(t), t);
  revisa('[porteros] los que no están en la academia, aparte', /Porteros sin academia · 1/.test(t) && /Pepe Sin Academia/.test(t) && /No está con Alexis/.test(t), t);
  revisa('[porteros] cada uno abre su estado de cuenta', await p.getAttribute('a.tan-fila[href*="g3"]', 'href') === '/tanner/?id=g3');
  revisa('[porteros] sin scroll horizontal', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await p.close();
}
/* 2. Precios */
{
  const p = await abre('/v2/paquetes/?ver=precios');
  if (process.env.SHOTS) await p.screenshot({ path:`${process.env.SHOTS}/paquetes-precios.png`, fullPage:true });
  const grupos = await p.$$eval('.tan-grupo-tit', h => h.map(x => x.textContent));
  revisa('[precios] por grupo: Tanners, Baby Tanner y T6, Porteros', grupos.join('|') === 'Tanners|Baby Tanner y T6|Porteros', grupos.join('|'));
  const t = await texto(p, '.pq-cuerpo');
  revisa('[precios] precio de hoy, el de enero y cuántos Tanners', /Tanner 4 días/.test(t) && /\$800\.00\/mes/.test(t) && /Desde enero de 2027: \$900\.00/.test(t) && /30 Tanners/.test(t), t.slice(0, 300));
  revisa('[precios] los de 2 días dicen "Sin precio"', (t.match(/Sin precio/g) || []).length === 2);
  revisa('[precios] porteros 2 días: no entrena con su categoría', /2 días con Alexis \(no entrena con su categoría\)/.test(t));
  await p.click('[data-precio="tanner_4"]');
  await p.waitForSelector('#presSheet:not(.hidden)');
  revisa('[precio] propone enero', /enero/.test(await p.$eval('#pqDesde', s => s.selectedOptions[0].textContent)));
  await p.click('#pqForm .pres-primary');
  revisa('[precio] sin precio no se manda', (await llamadas(p, 'v2_set_package_price')).length === 0 && await p.isVisible('.pres-error'));
  await p.fill('#pqPrecio', '900');
  await p.click('#pqForm .pres-primary');
  await p.waitForSelector('#presSheet.hidden', { state:'attached', timeout:4000 });
  const sp = (await llamadas(p, 'v2_set_package_price'))[0]?.params || {};
  revisa('[precio] manda paquete, precio y mes', sp.package_code === 'tanner_4' && sp.monthly_fee === 900 && /^\d{4}-01-01$/.test(sp.effective_from), JSON.stringify(sp));
  revisa('[precio] avisa', /Tanner 4 días: \$900\.00 desde enero/.test(await p.textContent('#presToast')));
  await p.close();
}
/* 3. Asignar */
{
  const p = await abre('/v2/paquetes/?ver=asignar');
  await p.waitForSelector('#pqAplicar', { timeout:6000 });
  if (process.env.SHOTS) await p.screenshot({ path:`${process.env.SHOTS}/paquetes-asignar.png`, fullPage:true });
  const t = await texto(p, '.pq-cuerpo');
  revisa('[asignar] quedan igual: 2; cambiarían: 2; no se pueden: 1; ya tienen: 1', /Quedan igual · 2/.test(t) && /Cambiaría lo que pagan · 2/.test(t) && /No se pueden todavía · 1/.test(t) && /1 ya tienen paquete/.test(t), t.slice(0, 400));
  revisa('[asignar] enseña hoy y después', /\$1,300\.00 \$800\.00/.test(t) && /\$400\.00 \$550\.00/.test(t), t);
  revisa('[asignar] el botón cuenta sólo los que quedan igual', /a 2 Tanners/.test(await p.textContent('#pqAplicar')));
  await p.check('[data-elige="a4"]');
  revisa('[asignar] marcar uno lo suma', /a 3 Tanners/.test(await p.textContent('#pqAplicar')));
  await p.click('#pqAplicar');
  revisa('[asignar] sin motivo no se manda', (await llamadas(p, 'v2_apply_package_proposal')).length === 0 && await p.isVisible('#pqError'));
  await p.fill('#pqMotivo', 'Paquetes 2026');
  await p.click('#pqAplicar');
  await p.waitForFunction(() => window.__llamadas.some(l => l.n === 'v2_apply_package_proposal'), null, { timeout:4000 });
  const ap = (await llamadas(p, 'v2_apply_package_proposal'))[0]?.params || {};
  const ids = (ap.items || []).map(x => `${x.playerId}:${x.package}`).sort().join();
  revisa('[asignar] manda los iguales y el marcado; no el que sube ni el bloqueado ni el que ya tiene', ids === 'a1:tanner_4,a2:baby_3,a4:porteros_4' && ap.reason === 'Paquetes 2026', ids);
  revisa('[asignar] sin scroll horizontal', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await p.close();
}
/* 4. Sin Presidencia */
{
  const p = await abre('/v2/paquetes/?ver=asignar', { pres:false });
  const tabs = await p.$$eval('[data-vista]', b => b.map(x => x.dataset.vista));
  revisa('[no pres] sin pestaña "Asignar"', tabs.join() === 'porteros,precios', tabs.join());
  await p.click('[data-vista="precios"]');
  revisa('[no pres] los precios no se pueden tocar', !(await p.$('[data-precio]')));
  revisa('[no pres] nunca pide la propuesta', (await llamadas(p, 'v2_package_proposal')).length === 0);
  await p.close();
}

await nav.close(); srv.close();
let mal = 0;
for (const r of revisiones) if (!r.ok) { mal++; console.error(` - ${r.nombre}${r.detalle ? ' :: ' + r.detalle : ''}`); }
if (errores.length) { console.error('ERRORES DEL NAVEGADOR:'); errores.forEach(e => console.error('   ' + e)); }
if (mal || errores.length) { console.error(`Paquetes humo FAILED · ${mal} de ${revisiones.length}, ${errores.length} errores`); process.exit(1); }
console.log(`Paquetes humo OK · ${revisiones.length} revisiones: porteros, precios desde enero y asignar paquetes`);
