/* PATROCINIOS EN DOS MINUTOS (23/10/2026) en Chromium.
 *
 * Presidencia: "que Zul en dos minutos pueda ver todo". Se monta Patrocinios
 * con un Supabase falso (marcas parecidas a las reales) y se revisa:
 *   1. El marcador: marcas con nosotros, valor, falta cobrar y les debemos.
 *   2. "Hoy toca" pone arriba lo atrasado y lo que falta cobrar, y cada
 *      aviso lleva a donde se resuelve.
 *   3. El tablero: una tarjeta por marca con "Nos dan" y "Les damos".
 *   4. En la ficha se palomea lo entregado sin cambiar de pestaña.
 *   5. "Marcas" junta etapas y búsqueda; sólo salen etapas con marcas.
 *   6. En el celular no se sale la página.
 */
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const T = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/patrocinadores/') p = '/v2/patrocinadores/index.html'; if (p.endsWith('/')) p += 'index.html';
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}`;

const it = (id, ag, direction, type, description, fulfilled, estimatedValue = null) => ({ id, agreementId: ag, direction, type, description, fulfilled, estimatedValue });
const DATOS = {
  sponsors: [
    { id:'s-trapo', name:'Don Trapo', stage:'active', status:'active', relationshipType:'sponsorship', phone:'+524772408403', contactName:'Luis Escobedo', nextAction:'Cobro de la segunda parte', nextActionAt:'2020-08-11T18:00:00Z', ownerName:'Zul' },
    { id:'s-tremor', name:'Tremor', stage:'active', status:'active', relationshipType:'sponsorship', ownerName:'Zul' },
    { id:'s-dis', name:'Disonante', stage:'paused', status:'negotiation', relationshipType:'sponsorship', contactName:'Felipe Serdio' },
    { id:'s-cafe', name:'Café Central', stage:'talking', status:'negotiation', relationshipType:'exchange' },
  ],
  agreements: [
    { id:'a-trapo', sponsorId:'s-trapo', status:'active', monetaryValue:15000, startsOn:'2026-06-22', endsOn:'2099-12-31' },
    { id:'a-trapo2', sponsorId:'s-trapo', status:'draft', monetaryValue:15000 },
    { id:'a-trapo3', sponsorId:'s-trapo', status:'draft', monetaryValue:null },
    { id:'a-tremor', sponsorId:'s-tremor', status:'draft', monetaryValue:null },
    { id:'a-dis', sponsorId:'s-dis', status:'draft', monetaryValue:40000 },
  ],
  agreementItems: [
    it('i1','a-trapo2','receive','money','$15,000 pesos',false,15000),
    it('i2','a-trapo2','give','banner','Lona premium 3x2',true),
    it('i3','a-trapo2','give','activation','Activación en la Gran Final',false),
    it('i4','a-tremor','receive','product','40 jerseys',true),
    it('i5','a-tremor','receive','product','Sesión de fotos',false),
    it('i6','a-tremor','give','jersey','Presencia en jerseys',false),
  ],
  payments: [{ id:'p1', agreementId:'a-trapo', amount:7500 }],
  assets: [], movements: [], itemEvidence: [],
};
const FAKE = `
  window.__rpc=[];const D=${JSON.stringify(DATOS)};
  export function createClient(){return{auth:{getSession:async()=>({data:{session:{user:{id:'u-zul'}}}}),onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}}},
    storage:{from:()=>({createSignedUrls:async()=>({data:[],error:null}),createSignedUrl:async()=>({data:null,error:null})})},
    rpc:async(n,p={})=>{window.__rpc.push({n,p:JSON.parse(JSON.stringify(p))});const ok=d=>({data:d,error:null});
      if(n==='v2_my_context')return ok([{organization_id:'o1',organization_name:'Tannery City FC',role:'Operaciones'}]);
      if(n==='v2_my_modules')return ok([{module_code:'sponsors',enabled:true,can_read:true,can_write:true}]);
      if(n==='v2_sponsor_admin')return ok(D);
      if(n==='v2_set_sponsor_item_fulfillment'){const i=D.agreementItems.find(x=>x.id===p.item_id);if(i)i.fulfilled=p.fulfilled;return ok(true);}
      if(n==='v2_sponsor_funded_players'||n==='v2_club_people'||n==='v2_billing_players')return ok([]);
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
  await pg.goto(`${BASE}/patrocinadores/`, { waitUntil:'networkidle' });
  await pg.waitForSelector('#view:not(.hidden)', { timeout:8000 });
  return { pg, errs };
}
const txt = async (pg, sel) => (await pg.textContent(sel)).replace(/\s+/g, ' ').trim();

{
  const { pg, errs } = await abre(1280);
  if (process.env.SHOTS) await pg.screenshot({ path:`${process.env.SHOTS}/patrocinios-hoy.png`, fullPage:true });
  revisa('1. marcas con nosotros: 2 (la pausada y la de plática no)', await txt(pg, '#ptMarcas') === '2', await txt(pg, '#ptMarcas'));
  revisa('1. valor sin contar dos veces el borrador repetido', await txt(pg, '#ptValor') === '$15,000', await txt(pg, '#ptValor'));
  revisa('1. falta cobrar lo que no se ha pagado', await txt(pg, '#ptPorCobrar') === '$7,500', await txt(pg, '#ptPorCobrar'));
  revisa('1. les debemos 2 compromisos', await txt(pg, '#ptDebemos') === '2', await txt(pg, '#ptDebemos'));
  revisa('2. muestra 6 y deja ver todos', (await pg.$$('#nextList .pt-aviso')).length === 6 && /Ver los 7/.test(await txt(pg, '#ptVerTodo')), await txt(pg, '#ptVerTodo'));
  await pg.click('#ptVerTodo');
  const avisos = await pg.$$eval('#nextList .pt-aviso', xs => xs.map(x => x.className.match(/nivel-\w+/)[0] + '|' + x.textContent.replace(/\s+/g, ' ')));
  revisa('2. lo atrasado y lo por cobrar salen arriba', /nivel-alta/.test(avisos[0]) && /nivel-alta/.test(avisos[1]) && avisos.slice(0, 2).some(a => /atrasado desde el 11 ago/.test(a)) && avisos.slice(0, 2).some(a => /Falta cobrar \$7,500/.test(a)), JSON.stringify(avisos));
  revisa('2. avisa del borrador y de la marca sin siguiente paso', avisos.some(a => /Tremor.*Borrador/.test(a)) && avisos.some(a => /Café Central.*siguiente paso/.test(a)), JSON.stringify(avisos));
  revisa('2. lo atrasado trae WhatsApp', (await pg.$$('#nextList .pt-aviso.nivel-alta .next-wa-btn')).length >= 1);
  const cartas = await pg.$$eval('#ptTablero .pt-marca', xs => xs.map(x => x.querySelector('strong').textContent));
  revisa('3. el tablero pone primero las marcas con nosotros', cartas[0] === 'Don Trapo' && cartas[1] === 'Tremor' && cartas.length === 4, JSON.stringify(cartas));
  const tremor = await txt(pg, '#ptTablero .pt-marca[data-sponsor-id="s-tremor"]');
  revisa('3. la tarjeta dice cuánto nos dan y cuánto les damos', /Nos dan\s*1 de 2/.test(tremor) && /Les damos\s*0 de 1/.test(tremor) && /Intercambio en especie/.test(tremor), tremor);
  // Aviso de cobrar abre la ficha en el acuerdo con sus pagos.
  await pg.click('#nextList .pt-aviso-main:has-text("Falta cobrar")');
  await pg.waitForTimeout(200);
  revisa('2. "Registrar pago" abre los pagos de esa marca', await pg.isVisible('#paymentsModal') && await pg.isVisible('#brandDrawer'));
  await pg.keyboard.press('Escape'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(100);
  // Palomear desde la ficha.
  await pg.click('#ptTablero .pt-marca[data-sponsor-id="s-tremor"]');
  await pg.waitForSelector('#brandDrawer:not(.hidden)');
  revisa('4. la ficha abre con lo que sigue y lo que nos dan / les damos', await pg.isVisible('#brandExchangeSummary .fulfillment-toggle') && /Lo que sigue/.test(await txt(pg, '#brandSummaryBody')));
  await pg.check('#brandExchangeSummary .fulfillment-toggle[data-item-id="i6"]');
  await pg.waitForTimeout(250);
  const r = await pg.evaluate(() => window.__rpc.filter(x => x.n === 'v2_set_sponsor_item_fulfillment').pop()?.p);
  revisa('4. palomear manda el cumplimiento', r?.item_id === 'i6' && r?.fulfilled === true, JSON.stringify(r));
  revisa('4. y el marcador baja a 1 compromiso', await txt(pg, '#ptDebemos') === '1', await txt(pg, '#ptDebemos'));
  await pg.keyboard.press('Escape');
  await pg.click('.module-nav [data-view="route"]');
  const etapas = await pg.$$eval('#stageRail [data-stage]', xs => xs.map(x => x.dataset.stage));
  revisa('5. sólo las etapas con marcas', JSON.stringify(etapas) === '["all","talking","active","paused"]', JSON.stringify(etapas));
  await pg.fill('#brandSearch', 'felipe');
  revisa('5. la búsqueda filtra por contacto', (await pg.$$eval('#routeList .brand-card', xs => xs.map(x => x.dataset.sponsorId))).join() === 's-dis');
  revisa('sin errores en escritorio', errs.length === 0, errs.join(' | '));
  await pg.close();
}
{
  const { pg, errs } = await abre(390);
  if (process.env.SHOTS) await pg.screenshot({ path:`${process.env.SHOTS}/patrocinios-hoy-cel.png`, fullPage:true });
  const ancho = await pg.evaluate(() => document.documentElement.scrollWidth);
  revisa('6. en el celular no se sale la página', ancho <= 390, String(ancho));
  revisa('sin errores en celular', errs.length === 0, errs.join(' | '));
}
await nav.close(); srv.close();
if (fallos) { console.error(`Patrocinios Hoy humo: ${fallos} de ${corridas} fallaron`); process.exit(1); }
console.log(`Patrocinios Hoy humo OK · ${corridas} revisiones: marcador, Hoy toca, tablero por marca, palomear y Marcas`);
