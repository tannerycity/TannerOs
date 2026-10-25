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
 *   7. El reporte para la marca se arma y se comparte.
 *   8. Palomear ofrece la foto; "Lo que sigue" trae acciones a un toque.
 *   9. Acuerdos: el vigente arriba, borradores plegados; editor compacto.
 *  10-14. Meta en efectivo, seguimiento de entregables, venta aparte, descartar
 *      borrador, activos con filtros, propuesta sin precios internos y audiencia.
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
    { ...it('i7','a-tremor','give','social','Publicaciones en redes',false), quantity:20, deliveredQuantity:7, frequency:'anual', externalRef:'OBL-006' },
    { ...it('i8','a-tremor','give','other','Paquete audiovisual $8,000',false), auditStatus:'venta_aparte', externalRef:'OBL-014' },
  ],
  payments: [{ id:'p1', agreementId:'a-trapo', amount:7500, paidOn: new Date().toISOString().slice(0, 7) + '-02' }],
  assets: [
    { id:'as1', name:'Reel Instagram', category:'content', entity:'TC', channel:'Instagram', unit:'reel', family:'Contenido', validation:'CONFIGURABLE', price:2500, priceStatus:'aprobado', availability:'available', description:'Video vertical con marca', internalNotes:'NOTA SECRETA DEL CONTRATO' },
    { id:'as2', name:'Frente Españita 1', category:'park', entity:'TCP', channel:'Presencial', unit:'espacio', family:'Espacio físico', validation:'PENDIENTE', price:null, priceStatus:'por_cotizar', availability:'available', description:'Espacio físico' },
    { id:'as3', name:'Paquete Tanner Local', category:'other', entity:'AMBOS', channel:'Multicanal', unit:'por mes', family:'Paquete', validation:'PROPUESTO', price:3000, priceStatus:'propuesta', availability:'available', description:'Paquete físico + digital' },
  ],
  socialMetrics: [
    { id:'m1', entity:'TC', channel:'Instagram', metric:'reproducciones', value:146981, unit:'conteo', window:'90 días', periodStart:null, periodEnd:'2026-10-21', source:'Pantallas', validation:'CONFIRMADO', notes:'Reproducciones, no personas únicas' },
    { id:'m2', entity:'TCP', channel:'Facebook', metric:'visualizaciones', value:49800, unit:'aprox. conteo', window:'28 días', periodStart:'2026-09-26', periodEnd:'2026-10-23', source:'Meta Business Suite', validation:'APROXIMADO', notes:null },
  ],
  socialAccounts: [{ id:'c1', entity:'TC', platform:'TikTok', baseline:'Sin métricas reportadas', pending:'No inventar perfil' }],
  cashGoalMonthly: 30000,
  movements: [], itemEvidence: [],
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
// jsPDF de mentira: guarda lo que se escribe para revisar el reporte.
const JSPDF = `export class jsPDF{constructor(){window.__pdf=[];this.internal={pageSize:{getWidth:()=>612,getHeight:()=>792},getNumberOfPages:()=>1};}
  text(t){window.__pdf.push([].concat(t).join(' '));}getTextWidth(t){return String(t).length*6;}splitTextToSize(t){return [String(t)];}
  output(){return new Blob(['%PDF'],{type:'application/pdf'});}save(n){window.__guardado=n;}}
  for(const m of ['addPage','addImage','setFont','setFontSize','setTextColor','setFillColor','setDrawColor','setLineWidth','rect','roundedRect','circle','line','setPage'])jsPDF.prototype[m]=function(){};`;
const nav = await chromium.launch({ executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
let fallos = 0, corridas = 0;
const revisa = (n, ok, d) => { corridas++; if (!ok) { fallos++; console.error(` - ${n}${d ? `\n   ${d}` : ''}`); } };
async function abre(ancho) {
  const pg = await nav.newPage({ viewport:{ width:ancho, height:900 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.route(/^https?:\/\/(?!127)/, r => r.abort());
  await pg.route('**/v2/supabase-client.js', r => r.fulfill({ contentType:'text/javascript', body:FAKE }));
  await pg.route('**/v2/branding-auto.js', r => r.fulfill({ contentType:'text/javascript', body:'' }));
  await pg.route(/esm\.sh\/jspdf/, r => r.fulfill({ contentType:'text/javascript', body:JSPDF }));
  await pg.goto(`${BASE}/patrocinadores/`, { waitUntil:'networkidle' });
  await pg.waitForSelector('#view:not(.hidden)', { timeout:8000 });
  return { pg, errs };
}
const txt = async (pg, sel) => (await pg.textContent(sel)).replace(/\s+/g, ' ').trim();

{
  const { pg, errs } = await abre(1280);
  if (process.env.SHOTS) await pg.screenshot({ path:`${process.env.SHOTS}/patrocinios-hoy.png`, fullPage:true });
  revisa('1. efectivo del mes contra la meta de $30,000', await txt(pg, '#ptEfectivo') === '$7,500' && /meta \$30,000 · faltan \$22,500/.test(await txt(pg, '#ptEfectivoSub')), await txt(pg, '#ptEfectivoSub'));
  revisa('1. la especie va aparte y no cuenta para la meta', await txt(pg, '#ptEspecie') === '1 de 2' && /no cuenta para la meta/.test(await txt(pg, '#ptEspecieSub')), await txt(pg, '#ptEspecie'));
  revisa('1. marcas con nosotros: 2 (la pausada y la de plática no)', /2 con nosotros/.test(await txt(pg, '#ptMarcasSub')), await txt(pg, '#ptMarcasSub'));
  revisa('1. falta cobrar lo que no se ha pagado', await txt(pg, '#ptPorCobrar') === '$7,500', await txt(pg, '#ptPorCobrar'));
  revisa('1. les debemos 3 compromisos (la venta aparte no cuenta)', await txt(pg, '#ptDebemos') === '3', await txt(pg, '#ptDebemos'));
  revisa('2. muestra 6 y deja ver todos', (await pg.$$('#nextList .pt-aviso')).length === 6 && /Ver los 7/.test(await txt(pg, '#ptVerTodo')), await txt(pg, '#ptVerTodo'));
  await pg.click('#ptVerTodo');
  const avisos = await pg.$$eval('#nextList .pt-aviso', xs => xs.map(x => x.className.match(/nivel-\w+/)[0] + '|' + x.textContent.replace(/\s+/g, ' ')));
  revisa('2. lo atrasado y lo por cobrar salen arriba', /nivel-alta/.test(avisos[0]) && /nivel-alta/.test(avisos[1]) && avisos.slice(0, 2).some(a => /atrasado desde el 11 ago/.test(a)) && avisos.slice(0, 2).some(a => /Falta cobrar \$7,500/.test(a)), JSON.stringify(avisos));
  revisa('2. avisa del borrador y de la marca sin siguiente paso', avisos.some(a => /Tremor.*Borrador/.test(a)) && avisos.some(a => /Café Central.*siguiente paso/.test(a)), JSON.stringify(avisos));
  revisa('2. lo atrasado trae WhatsApp', (await pg.$$('#nextList .pt-aviso.nivel-alta .next-wa-btn')).length >= 1);
  const cartas = await pg.$$eval('#ptTablero .pt-marca', xs => xs.map(x => x.querySelector('strong').textContent));
  revisa('3. el tablero pone primero las marcas con nosotros', cartas[0] === 'Don Trapo' && cartas[1] === 'Tremor' && cartas.length === 4, JSON.stringify(cartas));
  const tremor = await txt(pg, '#ptTablero .pt-marca[data-sponsor-id="s-tremor"]');
  revisa('3. la tarjeta dice cuánto nos dan y cuánto les damos', /Nos dan\s*1 de 2/.test(tremor) && /Les damos\s*0 de 2/.test(tremor) && /Intercambio en especie/.test(tremor), tremor);
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
  await pg.waitForFunction(() => /Le subes una foto/.test(document.body.innerText), null, { timeout:4000 }).catch(() => {});
  revisa('8. al entregar algo a la marca, ofrece subir la foto', /Le subes una foto/.test(await pg.evaluate(() => document.body.innerText)));
  await pg.click('.tosdlg-cancel');
  await pg.waitForTimeout(150);
  revisa('8. y el renglón queda con su botón "+ Foto"', (await pg.$$('#brandExchangeSummary [data-foto-item="i6"]')).length === 1);
  const r = await pg.evaluate(() => window.__rpc.filter(x => x.n === 'v2_set_sponsor_item_fulfillment').pop()?.p);
  revisa('4. palomear manda el cumplimiento', r?.item_id === 'i6' && r?.fulfilled === true, JSON.stringify(r));
  revisa('4. y el marcador baja a 2 compromisos', await txt(pg, '#ptDebemos') === '2', await txt(pg, '#ptDebemos'));
  const damos = await txt(pg, '#brandExchangeSummary');
  revisa('10. la venta aparte no está en "Les damos" y se aclara abajo', !/Paquete audiovisual \$8,000Pendiente/.test(damos) && /Fuera del patrocinio \(venta aparte\): Paquete audiovisual/.test(damos), damos);
  revisa('10. el entregable dice cuánto va: 7 de 20', /7 de 20 · anual/.test(damos), damos);
  await pg.click('#brandExchangeSummary [data-track-item="i7"]');
  await pg.waitForSelector('#trackModal:not(.hidden)', { timeout:3000 });
  await pg.waitForFunction(() => document.getElementById('trackItemId').value === 'i7');
  await pg.fill('#trackDelivered', '8');
  await pg.fill('#trackUrl', 'https://instagram.com/p/abc');
  const antes = await pg.evaluate(() => [document.getElementById('trackUrl').value, document.getElementById('trackDelivered').value]);
  await pg.click('#saveTrack');
  await pg.waitForTimeout(300);
  const tr = await pg.evaluate(() => window.__rpc.filter(x => x.n === 'v2_set_sponsor_item_tracking').pop()?.p);
  revisa('10. el seguimiento guarda entregado y link', tr?.item_id === 'i7' && tr?.delivered_quantity === 8 && tr?.evidence_url === 'https://instagram.com/p/abc', JSON.stringify(tr) + ' antes=' + JSON.stringify(antes));
  revisa('8. "Lo que sigue" trae acciones a un toque', await pg.isVisible('#brandSummaryBody [data-rapida="avance"]'));
  await pg.click('#brandSummaryBody [data-rapida="avance"]');
  revisa('8. "Definir qué sigue" abre el registro de avance', await pg.isVisible('#movementModal'));
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(100);
  // Reporte para la marca (24/10/2026): se arma y ofrece compartir.
  await pg.click('#sponsorReportButton');
  await pg.waitForFunction(() => /Reporte listo/.test(document.body.innerText), null, { timeout:6000 }).catch(() => {});
  const pdf = await pg.evaluate(() => (window.__pdf || []).join(' | '));
  revisa('7. el reporte trae la marca y lo entregado', /Tremor/.test(pdf) && /Entregado/.test(pdf) && /Presencia en jerseys/.test(pdf), pdf.slice(0, 300));
  revisa('7. y nunca dice Pendiente', !/Pendiente/.test(pdf), pdf);
  revisa('7. pide un toque para compartir', /Reporte listo/.test(await pg.evaluate(() => document.body.innerText)));
  await pg.evaluate(() => { navigator.canShare = undefined; });
  await pg.click('.tosdlg-btn:not(.tosdlg-cancel)');
  await pg.waitForTimeout(200);
  revisa('7. sin compartir nativo, lo descarga con su nombre', await pg.evaluate(() => window.__guardado) === 'Reporte-Tremor-' + new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10) + '.pdf', await pg.evaluate(() => window.__guardado));
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(100);
  await pg.click('#ptTablero .pt-marca[data-sponsor-id="s-trapo"]');
  await pg.click('[data-drawer-view="brand-agreement"]');
  revisa('9. acuerdos: el vigente y los borradores plegados', (await pg.$$('#brandAgreementList .agreement-card')).length === 1 && /Ver 2 acuerdos más/.test(await txt(pg, '#brandAgreementList')), await txt(pg, '#brandAgreementList'));
  await pg.click('.pt-mas-acuerdos');
  revisa('9. y se despliegan al tocar', (await pg.$$('#brandAgreementList .agreement-card')).length === 3);
  await pg.click('#brandAgreementList [data-descartar="a-trapo2"]');
  await pg.waitForSelector('.tosdlg', { timeout:3000 });
  await pg.click('.tosdlg-btn:not(.tosdlg-cancel)');
  await pg.waitForTimeout(300);
  const ds = await pg.evaluate(() => window.__rpc.filter(x => x.n === 'v2_save_sponsor_agreement').pop()?.p);
  revisa('11. descartar el borrador lo cancela sin perder sus elementos', ds?.agreement_id === 'a-trapo2' && ds?.status === 'cancelled' && ds?.given_items?.map(i => i.id).join() === 'i2,i3' && ds?.received_items?.[0]?.id === 'i1', JSON.stringify(ds));
  await pg.click('.edit-agreement-button >> nth=0');
  revisa('9. cada elemento del acuerdo es compacto: qué es, arriba', (await pg.$$('#agreementModal .item-editor-head .item-description')).length >= 1 && (await pg.$$('#agreementModal .pt-item-mas')).length >= 1);
  await pg.keyboard.press('Escape'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(100);
  await pg.click('.module-nav [data-view="assets"]');
  const filtros = await pg.$$eval('#assetFilters [data-filtro]', xs => xs.map(x => x.dataset.filtro));
  revisa('12. activos con filtros por entidad, físicos y paquetes', JSON.stringify(filtros) === '["all","TC","TCP","fisicos","paquetes"]', JSON.stringify(filtros));
  revisa('12. el precio interno dice su estado', /\$3,000\/mes · propuesta/.test(await txt(pg, '#assetList')) && /Por cotizar/.test(await txt(pg, '#assetList')));
  await pg.click('#proposalButton');
  await pg.click('#assetList [data-asset-id="as1"]');
  await pg.click('#assetList [data-asset-id="as3"]');
  revisa('13. propuesta: se eligen activos', /2 activos elegidos/.test(await txt(pg, '#proposalCount')));
  await pg.click('#proposalMake');
  await pg.waitForSelector('.tosdlg-field', { timeout:3000 });
  await pg.fill('.tosdlg-field', 'Ferretería del Centro');
  await pg.click('.tosdlg-btn:not(.tosdlg-cancel)');
  await pg.waitForFunction(() => /Propuesta lista/.test(document.body.innerText), null, { timeout:6000 }).catch(() => {});
  const prop = await pg.evaluate(() => (window.__pdf || []).join(' | '));
  revisa('13. sólo sale el precio aprobado; lo demás "A cotizar"', /\$2,500 por reel/.test(prop) && /A cotizar/.test(prop) && !/3,000/.test(prop), prop.slice(0, 400));
  revisa('13. nunca salen las notas internas', !/NOTA SECRETA/.test(prop));
  revisa('13. la audiencia va con su periodo y fuente, sin sumar', /Reproducciones/.test(prop) && /aprox\. 49,800/.test(prop) && /Meta Business Suite/.test(prop), prop);
  await pg.click('.tosdlg-cancel'); await pg.waitForTimeout(150);
  await pg.click('.module-nav [data-view="audience"]');
  const aud = await txt(pg, '#audienceList');
  revisa('14. audiencia por entidad y red con validación', /Tannery City FC/.test(aud) && /Instagram/.test(aud) && /CONFIRMADO/.test(aud) && /APROXIMADO/.test(aud) && /Sin datos todavía/.test(aud), aud);
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
