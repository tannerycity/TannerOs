/* BANCO DE IDEAS (22/10/2026) en Chromium.
 *
 * Presidencia: "un banco de ideas tipo Notion, estilo kanban, para darle
 * seguimiento a tareas". Se monta la pantalla real con un Supabase falso y se
 * revisa:
 *   1. Las cuatro columnas con su cuenta; la tarjeta dice área, fecha
 *      vencida, pendientes y quién la tiene.
 *   2. Agregar rápido en una columna crea la idea ahí.
 *   3. La hoja de la idea: cambiar de columna, agregar un pendiente y guardar.
 *   4. Arrastrar una tarjeta a En proceso la mueve.
 *   5. Archivar pide confirmación y se manda.
 *   6. En el celular el tablero se desliza sin que la página se salga.
 */
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const T = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/ideas/') p = '/v2/ideas/index.html'; if (p.endsWith('/')) p += 'index.html';
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}`;

const DATOS = { me:'u-zul', isPresidency:false, people:[{ id:'u-zul', name:'Zul' }, { id:'u-mich', name:'Mich Enríquez' }], ideas:[
  { id:'i1', title:'Jerseys navideños', area:'Marketing', status:'idea', priority:'alta', position:0, ownerId:'u-mich', ownerName:'Mich Enríquez', dueDate:'2020-01-10',
    checklist:[{ text:'Diseño', done:true }, { text:'Precio', done:false }], createdBy:'u-zul', createdByName:'Zul' },
  { id:'i2', title:'Torneo relámpago', area:'Eventos', status:'todo', priority:'media', position:0, checklist:[], createdBy:'u-mich' }] };
const FAKE = `
  window.__rpc=[];const D=${JSON.stringify(DATOS)};
  export function createClient(){return{auth:{getSession:async()=>({data:{session:{user:{id:'u-zul'}}}}),onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}}},
    rpc:async(n,p={})=>{window.__rpc.push({n,p:JSON.parse(JSON.stringify(p))});const ok=d=>({data:d,error:null});
      if(n==='v2_my_context')return ok([{organization_id:'o1',organization_name:'Tannery City FC',role:'Operaciones',display_name:'Zul'}]);
      if(n==='v2_ideas')return ok(D);
      if(n==='v2_save_idea'){const i=p.idea;return ok({...i,id:i.id||'nueva-'+window.__rpc.length,createdBy:'u-zul',position:-1,checklist:i.checklist||[]});}
      if(n==='v2_move_idea'){const i=D.ideas.find(x=>x.id===p.idea_id);return ok({...i,status:p.status,position:p.pos});}
      if(n==='v2_archive_idea'){const i=D.ideas.find(x=>x.id===p.idea_id);return ok({...i,status:'archived'});}
      return ok(null);}}}`;
const nav = await chromium.launch({ executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
let fallos = 0, corridas = 0;
const revisa = (n, ok, d) => { corridas++; if (!ok) { fallos++; console.error(` - ${n}${d ? `\n   ${d}` : ''}`); } };
async function abre(ancho) {
  const pg = await nav.newPage({ viewport:{ width:ancho, height:900 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.route(/^https?:\/\/(?!127)/, r => r.abort());
  await pg.route('**/v2/supabase-client.js', r => r.fulfill({ contentType:'text/javascript', body:FAKE }));
  await pg.route('**/v2/branding-auto.js', r => r.fulfill({ contentType:'text/javascript', body:'' }));
  await pg.goto(`${BASE}/ideas/`, { waitUntil:'networkidle' });
  await pg.waitForSelector('.id-col', { timeout:8000 });
  return { pg, errs };
}
const llamadas = (pg, n) => pg.evaluate(x => window.__rpc.filter(r => r.n === x).map(r => r.p), n);

{
  const { pg, errs } = await abre(1280);
  const cols = await pg.$$eval('.id-col', cs => cs.map(c => c.querySelector('h2').textContent + c.querySelector('header>span').textContent));
  revisa('1. cuatro columnas con su cuenta', JSON.stringify(cols) === '["Ideas1","Por hacer1","En proceso0","Hecho0"]', JSON.stringify(cols));
  const carta = (await pg.textContent('.id-carta[data-id="i1"]')).replace(/\s+/g, ' ');
  revisa('1. la tarjeta dice área, vencida, pendientes y quién', /Marketing/.test(carta) && /Venció/.test(carta) && /1\/2/.test(carta) && /ME/.test(carta), carta);
  await pg.fill('[data-rapida="todo"] input', 'Pintar la banca');
  await pg.press('[data-rapida="todo"] input', 'Enter');
  await pg.waitForTimeout(200);
  const r = (await llamadas(pg, 'v2_save_idea'))[0];
  revisa('2. agregar rápido crea la idea en su columna', r?.idea?.title === 'Pintar la banca' && r?.idea?.status === 'todo', JSON.stringify(r));
  revisa('2. y aparece en Por hacer', /Pintar la banca/.test(await pg.textContent('.id-col[data-col="todo"]')));
  await pg.click('.id-carta[data-id="i1"]');
  await pg.waitForSelector('#idHoja:not(.hidden)');
  await pg.click('#idHoja [data-st="doing"]');
  await pg.fill('#hNuevoPend input', 'Mandar a Tremor'); await pg.press('#hNuevoPend input', 'Enter');
  await pg.fill('#hNotas', 'Lanzar en diciembre');
  await pg.click('[data-guardar]');
  await pg.waitForTimeout(200);
  const g = (await llamadas(pg, 'v2_save_idea'))[1]?.idea;
  revisa('3. la hoja guarda columna, pendientes y notas', g?.id === 'i1' && g?.status === 'doing' && g?.checklist?.length === 3 && g?.notes === 'Lanzar en diciembre' && g?.ownerId === 'u-mich', JSON.stringify(g));
  revisa('3. y la tarjeta pasa a En proceso', /Jerseys navideños/.test(await pg.textContent('.id-col[data-col="doing"]')));
  await pg.dragAndDrop('.id-carta[data-id="i2"]', '.id-col[data-col="done"]');
  await pg.waitForTimeout(250);
  const m = (await llamadas(pg, 'v2_move_idea'))[0];
  revisa('4. arrastrar a Hecho la mueve', m?.idea_id === 'i2' && m?.status === 'done', JSON.stringify(m));
  await pg.click('.id-carta[data-id="i1"]');
  await pg.click('[data-archivar]');
  await pg.waitForSelector('.tosdlg-ok', { timeout:3000 }); await pg.click('.tosdlg-ok');
  await pg.waitForTimeout(250);
  revisa('5. archivar se confirma y se manda', (await llamadas(pg, 'v2_archive_idea'))[0]?.idea_id === 'i1');
  revisa('5. y sale del tablero', (await pg.$('.id-carta[data-id="i1"]')) === null);
  revisa('sin errores de página', !errs.length, errs.join(' | '));
  if (process.env.SHOTS) await pg.screenshot({ path:`${process.env.SHOTS}/ideas-pc.png` });
  await pg.close();
}
{
  const { pg, errs } = await abre(390);
  revisa('6. en el celular la página no se sale', !(await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
  revisa('6. y el tablero se desliza', await pg.$eval('.id-tablero', t => t.scrollWidth > t.clientWidth));
  if (process.env.SHOTS) { await pg.screenshot({ path:`${process.env.SHOTS}/ideas-cel.png` }); await pg.click('.id-carta[data-id="i1"]'); await pg.waitForTimeout(200); await pg.screenshot({ path:`${process.env.SHOTS}/ideas-hoja.png` }); }
  revisa('6. sin errores', !errs.length, errs.join(' | '));
  await pg.close();
}
await nav.close(); srv.close();
console.log(fallos ? `Ideas humo FAILED · ${fallos} de ${corridas}` : `Ideas humo OK · ${corridas} revisiones: columnas, agregar rápido, hoja, arrastrar, archivar y celular`);
process.exit(fallos ? 1 : 0);
