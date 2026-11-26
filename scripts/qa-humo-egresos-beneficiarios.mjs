/* A QUIÉN SE LE PAGÓ Y LAS GRÁFICAS (25/11/2026, h102) en Chromium.
 * Presidencia: "que podamos escoger a quién se le está pagando... agregar
 * nuevo y que sea fácil... y así para que las gráficas salgan más chidas".
 *   1. En Taquilla (y Contabilidad), "A quién" abre la lista: Staff y
 *      proveedores; quien está de baja no sale.
 *   2. Escoger lo pone en el campo y el egreso se manda con ese nombre.
 *   3. "Otro" deja escribirlo a mano.
 *   4. "+ Agregar nuevo": del Staff con un toque, o un proveedor nuevo.
 *   5. Gráficas: lo que entró y salió, a quién se le paga más (con filtro),
 *      nómina por mes, proveedores con fechas, adeudos y la lista con
 *      "Dar de baja".
 *   6. En el celular nada se sale de la pantalla.
 */
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}`;

const PAYEES = [
  { id: 'b', name: 'Brandon Andrade', kind: 'staff', active: true, aliases: ['DT Brandon'], total: 25900, lastPaidOn: '2026-11-08' },
  { id: 'm', name: 'Maxi Ponce', kind: 'staff', active: false, aliases: [], total: 3800, lastPaidOn: '2026-09-30' },
  { id: 't', name: 'Tremor', kind: 'proveedor', active: true, aliases: [], total: 40060, lastPaidOn: '2026-09-01' },
  { id: 'c', name: 'Compras por internet', kind: 'proveedor', active: true, aliases: ['Amazon'], total: 3793, lastPaidOn: '2026-11-08' },
];
const ANALITICA = {
  ingresos: 269633, egresos: 175310, adeudo: 43388,
  porBeneficiario: [{ id: 't', name: 'Tremor', kind: 'proveedor', total: 40060, count: 5, last: '2026-09-01' }, { id: 'b', name: 'Brandon Andrade', kind: 'staff', total: 25900, count: 21, last: '2026-11-08' },
    { id: null, name: 'Otros (sin asignar)', kind: 'otro', total: 13657, count: 20, last: '2026-11-08' }],
  nominaPorMes: [{ name: 'Brandon Andrade', mes: '2026-10', total: 1600 }, { name: 'Brandon Andrade', mes: '2026-11', total: 800 }, { name: 'Checo Martínez', mes: '2026-11', total: 700 }],
  proveedores: [{ name: 'Tremor', total: 40060, pagos: [{ fecha: '2026-09-01', monto: 20000, concepto: 'Uniformes T10' }] }],
  egresosPorCategoria: [{ name: 'Proveedor', total: 41292 }], ingresosPorTipo: [{ name: 'Mensualidad', total: 136563 }, { name: 'Uniformes y tienda', total: 81915 }],
  ingresosPorCategoria: [{ name: 'T10', total: 83357 }], adeudoPorCategoria: [{ name: 'Baby Tanner', total: 13538, cargos: 47 }], adeudoPorTipo: [{ name: 'Mensualidad', total: 34138, cargos: 70 }],
  uniformes: { entro: 81915, pagadoProveedor: 40060 },
};
const FAKE = `
  window.__rpc=[];
  export function createClient(){return{auth:{getSession:async()=>({data:{session:{user:{id:'u1'}}}}),onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}}},
    rpc:async(n,p={})=>{window.__rpc.push({n,p:JSON.parse(JSON.stringify(p))});const ok=d=>({data:d,error:null});
      const L=window.__p||(window.__p=${JSON.stringify(PAYEES)});
      if(n==='v2_my_context')return ok([{organization_id:'o1',organization_name:'Tannery City FC',role:'Presidencia'}]);
      if(n==='v2_my_modules')return ok([{module_code:'accounting',enabled:true,can_read:true,can_write:true}]);
      if(n==='v2_expense_payees')return ok({payees:L,staffSinAlta:[{id:'s9',name:'Luis Felipe',title:'Formador'}]});
      if(n==='v2_save_expense_payee'){const name=p.name||'Luis Felipe';if(p.payee_id){const x=L.find(y=>y.id===p.payee_id);x.active=p.active;}else L.push({id:'n'+L.length,name,kind:p.kind,active:true,aliases:[],total:0});return ok({id:'n',name,kind:p.kind});}
      if(n==='v2_finance_analytics')return ok(${JSON.stringify(ANALITICA)});
      if(n==='v2_post_expense')return ok('e1');
      if(['v2_expenses','v2_billing_players','v2_open_receivables','v2_adjustment_authorizations','v2_unresolved_credit'].includes(n))return ok([]);
      return ok(null);}}}`;
const nav = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
let fallos = 0, corridas = 0;
const revisa = (n, ok, d) => { corridas++; if (!ok) { fallos++; console.error(` - ${n}${d ? `\n   ${d}` : ''}`); } };
async function abre(url, ancho) {
  const pg = await nav.newPage({ viewport: { width: ancho, height: 900 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.route(/^https?:\/\/(?!127)/, (r) => r.abort());
  await pg.route('**/v2/supabase-client.js', (r) => r.fulfill({ contentType: 'text/javascript', body: FAKE }));
  await pg.route('**/v2/branding-auto.js', (r) => r.fulfill({ contentType: 'text/javascript', body: '' }));
  await pg.goto(BASE + url, { waitUntil: 'networkidle' });
  await pg.waitForSelector('#view:not(.hidden)', { timeout: 8000 });
  return { pg, errs };
}
// Taquilla y Contabilidad usan el mismo campo.
const taq = fs.readFileSync('v2/taquilla/app.js', 'utf8'), con = fs.readFileSync('v2/contabilidad/app.js', 'utf8');
revisa('Taquilla pega la lista en "A quién"', /pegaSelector\(\$\('expenseWho'\)/.test(taq));
revisa('Contabilidad la pega al registrar y al editar', /pegaSelector\(\$\('who'\)/.test(con) && /pegaSelector\(document\.getElementById\(`eeWho-/.test(con));
const txt = async (pg, sel) => (await pg.textContent(sel)).replace(/\s+/g, ' ').trim();

for (const ancho of [1280, 390]) {
  const n = ancho === 390 ? ' (celular)' : '';
  // El campo "A quién" tal como lo pega Taquilla (una página mínima con el
  // mismo módulo y la misma función del servidor, de mentira).
  const pg = await nav.newPage({ viewport: { width: ancho, height: 900 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.route(/^https?:\/\/(?!127)/, (r) => r.abort());
  await pg.route('**/__benef.html', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:16px;font-family:sans-serif"><form id="f"><label>A quién<input id="who" style="width:100%;box-sizing:border-box"></label><input id="concept"><button id="save">Guardar</button></form>' +
    '<script type="module">' + FAKE.replace('export function createClient', 'function createClient') + ';const c=createClient();const rpc=async(n,p)=>{const {data,error}=await c.rpc(n,p);if(error)throw error;return data;};' +
    'const {pegaSelector}=await import("/v2/beneficiarios.js");pegaSelector(document.getElementById("who"),{rpc,org:"o1"});' +
    'document.getElementById("f").addEventListener("submit",e=>{e.preventDefault();window.__enviado=document.getElementById("who").value;});window.__listo=1;</script>' }));
  await pg.goto(BASE + '/__benef.html');
  await pg.waitForFunction(() => window.__listo === 1);
  await pg.click('#who');
  await pg.waitForSelector('.benef-hoja', { timeout: 3000 });
  const hoja = await txt(pg, '.benef-hoja');
  revisa('1. abre la lista con Staff y Proveedores' + n, /Staff/.test(hoja) && /Proveedores/.test(hoja) && /Brandon Andrade/.test(hoja) && /Tremor/.test(hoja), hoja);
  revisa('1. quien está de baja no sale' + n, !/Maxi Ponce/.test(hoja));
  await pg.fill('.benef-buscar', 'amazon');
  revisa('1. busca por alias' + n, /Compras por internet/.test(await txt(pg, '.benef-cuerpo')) && !/Tremor/.test(await txt(pg, '.benef-cuerpo')));
  await pg.fill('.benef-buscar', '');
  await pg.click('.benef-op[data-pon="Brandon Andrade"]');
  revisa('2. escoger lo pone en el campo' + n, await pg.inputValue('#who') === 'Brandon Andrade' && !(await pg.$('.benef-hoja')) && /Staff/.test(await txt(pg, '.benef-ligado')));
  await pg.click('#save');
  revisa('2. se guarda con ese nombre' + n, await pg.evaluate(() => window.__enviado) === 'Brandon Andrade');
  await pg.click('#who'); await pg.waitForSelector('.benef-hoja');
  await pg.click('[data-otro]');
  await pg.fill('#who', 'Juan');
  revisa('3. Otro deja escribirlo a mano' + n, await pg.inputValue('#who') === 'Juan' && !(await pg.$('.benef-hoja')));
  await pg.click('#concept'); await pg.waitForTimeout(100);
  revisa('3. y dice que es Otro' + n, /Otro/.test(await txt(pg, '.benef-ligado')));
  await pg.evaluate(() => { const i = document.getElementById('who'); i.value = ''; i.dataset.libre = ''; });
  await pg.click('#who'); await pg.waitForSelector('.benef-hoja');
  await pg.click('[data-nuevo]');
  revisa('4. agregar muestra el Staff que falta' + n, /Luis Felipe/.test(await txt(pg, '.benef-nuevo')));
  await pg.click('[data-staff="s9"]'); await pg.waitForTimeout(250);
  const sp = await pg.evaluate(() => window.__rpc.filter((x) => x.n === 'v2_save_expense_payee').pop()?.p);
  revisa('4. del Staff con un toque y queda escogido' + n, sp?.staff_member_id === 's9' && sp?.kind === 'staff' && await pg.inputValue('#who') === 'Luis Felipe', JSON.stringify(sp));
  await pg.evaluate(() => { const i = document.getElementById('who'); i.value = ''; });
  await pg.click('#who'); await pg.waitForSelector('.benef-hoja');
  await pg.click('[data-nuevo]');
  await pg.click('[data-tipo="proveedor"]');
  await pg.fill('.benef-nuevo input', 'Imprenta del Centro');
  await pg.click('[data-guardar]'); await pg.waitForTimeout(250);
  const pp = await pg.evaluate(() => window.__rpc.filter((x) => x.n === 'v2_save_expense_payee').pop()?.p);
  revisa('4. un proveedor nuevo' + n, pp?.name === 'Imprenta del Centro' && pp?.kind === 'proveedor' && await pg.inputValue('#who') === 'Imprenta del Centro', JSON.stringify(pp));
  await pg.click('#who'); await pg.waitForSelector('.benef-hoja');
  if (process.env.SHOTS) await pg.screenshot({ path: `${process.env.SHOTS}/a-quien${ancho === 390 ? '-cel' : ''}.png` });
  revisa('6. la hoja no se sale' + n, await pg.evaluate(() => document.documentElement.scrollWidth) <= ancho);
  await pg.keyboard.press('Escape');
  revisa('la hoja se cierra con Escape' + n, !(await pg.$('.benef-hoja')));
  revisa('sin errores en la hoja' + n, errs.length === 0, errs.join(' | '));
  await pg.close();

  // Gráficas
  const g = await abre('/v2/contabilidad/graficas/', ancho);
  await g.pg.waitForFunction(() => document.getElementById('kIngresos').textContent !== '—', null, { timeout: 5000 });
  revisa('5. entró, salió, quedó y nos deben' + n, /269,633/.test(await txt(g.pg, '#kIngresos')) && /175,310/.test(await txt(g.pg, '#kEgresos')) && /94,323/.test(await txt(g.pg, '#kQueda')) && /43,388/.test(await txt(g.pg, '#kAdeudo')));
  const benef = await txt(g.pg, '#grBenef');
  revisa('5. a quién se le paga más, con cuántos pagos y el último' + n, /Tremor.*Proveedor · 5 pagos · último 1 sep/.test(benef) && /Brandon Andrade/.test(benef), benef);
  await g.pg.click('#filtroTipo [data-tipo="staff"]');
  revisa('5. filtro Staff' + n, /Brandon/.test(await txt(g.pg, '#grBenef')) && !/Tremor/.test(await txt(g.pg, '#grBenef')));
  revisa('5. nómina por mes con totales' + n, /Oct 26.*Nov 26/.test(await txt(g.pg, '#grNomina thead')) && /\$2,400/.test(await txt(g.pg, '#grNomina tbody')) && /\$3,100/.test(await txt(g.pg, '#grNomina tfoot')), await txt(g.pg, '#grNomina'));
  revisa('5. proveedores con fecha y concepto' + n, /1 sep · Uniformes T10/.test(await txt(g.pg, '#grProv')));
  revisa('5. adeudo por categoría con cargos' + n, /Baby Tanner.*47 cargos/.test(await txt(g.pg, '#grDeuCat')));
  revisa('5. uniformes: queda y % pagado' + n, /Quedan \$41,855/.test(await txt(g.pg, '#grUniformes')) && /49%/.test(await txt(g.pg, '#grUniformes')));
  revisa('5. la lista con quien está de baja' + n, /Maxi Ponce.*De baja/.test(await txt(g.pg, '#grLista')));
  await g.pg.click('#grLista [data-baja="t"]');
  await g.pg.waitForSelector('.tosdlg', { timeout: 3000 });
  await g.pg.click('.tosdlg-btn:not(.tosdlg-cancel)'); await g.pg.waitForTimeout(300);
  const bj = await g.pg.evaluate(() => window.__rpc.filter((x) => x.n === 'v2_save_expense_payee').pop()?.p);
  revisa('5. dar de baja manda active=false' + n, bj?.payee_id === 't' && bj?.active === false, JSON.stringify(bj));
  if (process.env.SHOTS) await g.pg.screenshot({ path: `${process.env.SHOTS}/graficas-dinero${ancho === 390 ? '-cel' : ''}.png`, fullPage: true });
  revisa('6. Gráficas no se sale' + n, await g.pg.evaluate(() => document.documentElement.scrollWidth) <= ancho);
  revisa('sin errores en Gráficas' + n, g.errs.length === 0, g.errs.join(' | '));
  await g.pg.close();
}
await nav.close(); srv.close();
if (fallos) { console.error(`Egresos y gráficas humo: ${fallos} de ${corridas} fallaron`); process.exit(1); }
console.log(`Egresos y gráficas humo OK · ${corridas} revisiones: escoger, otro, agregar, gráficas, dar de baja y celular`);
