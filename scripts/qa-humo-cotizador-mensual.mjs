/* COTIZADOR POR MES (24/11/2026) en Chromium.
 *
 * Presidencia mandó el diseño del cotizador: "ahí está todo para cotizar
 * patrocinadores... metámoslo en patrocinadores". Se monta Patrocinios con un
 * Supabase falso y se revisa, de punta a punta:
 *   1. "Nueva cotización" abre con el paquete Patrocinador oficial, 12 meses,
 *      IVA y vigencia de 15 días, sin tener que llenar el carrito primero.
 *   2. Los totales: base, extras, IVA, total mensual y total del contrato.
 *   3. Meses fuera del paquete avisan y no dejan guardar; Aliado integral es
 *      sólo de 12.
 *   4. Un extra en 0 dice "Incluido" y sí deja guardar.
 *   5. Lo que se manda al servidor: meses, IVA, paquete y contacto.
 *   6. En la lista sale el mensual y el contrato; la vencida dice Vencida y
 *      se puede renovar (vuelve a correr la vigencia).
 *   7. El PDF de la hoja carta: folio, totales y sólo el WhatsApp de la academia.
 *   8. En el celular no se sale la página.
 */
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const T = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/patrocinadores/') p = '/v2/patrocinadores/index.html'; if (p.endsWith('/')) p += 'index.html';
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}`;

const hoy = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const DATOS = {
  sponsors: [{ id:'s1', name:'Ferretería Centro', stage:'negotiation', status:'negotiation', contactName:'Ana López' }],
  agreements: [], agreementItems: [], payments: [], movements: [], itemEvidence: [], socialMetrics: [], socialAccounts: [], archivedSponsors: [],
  cashGoalMonthly: 30000, isPresidency: true,
  assets: [
    { id:'p1', name:'Presencia local', category:'other', family:'Paquete', unit:'por mes', price:1000, priceStatus:'aprobado', availability:'available', description:'Desde $1,000/mes · mínimo 6 meses' },
    { id:'p2', name:'Patrocinador oficial', category:'other', family:'Paquete', unit:'por mes', price:3000, priceStatus:'aprobado', availability:'available', description:'Desde $3,000/mes · mínimo 6 meses' },
    { id:'p3', name:'Aliado integral TC + TCP', category:'other', family:'Paquete', unit:'por mes', price:5000, priceStatus:'aprobado', availability:'available', description:'$5,000/mes · sólo contratos de 12 meses' },
    { id:'c1', name:'Cancha Chavicos', category:'park', family:'Lonas', unit:'por mes', price:null, priceStatus:'por_cotizar', availability:'available', description:'Lonas alrededor de la cancha principal' },
    { id:'u1', name:'Logo en pecho', category:'uniforms', family:'Uniforme', unit:'temporada', price:20000, priceStatus:'aprobado', availability:'available', description:'Logo' },
  ],
};
const EXTRAS = [
  { id:'p1', paquete:{ clave:'local', min:6, max:12, orden:1 } }, { id:'p2', paquete:{ clave:'oficial', min:6, max:12, orden:2 } },
  { id:'p3', paquete:{ clave:'integral', min:12, max:12, orden:3 } }, { id:'c1', foto:'/brand/patrocinios/chavicos.jpg', piezas:12 },
];
const VENCIDA = { id:'qv', folio:'TC-2026-001', sponsorId:'s1', sponsorName:'Ferretería Centro', status:'sent', approvalStatus:'none', subtotal:3000, discountAmount:0, discountPct:0,
  total:36000, months:12, ivaPct:16, ivaAmount:480, monthlyTotal:3480, contractTotal:41760, packageAssetId:'p2', packageName:'Patrocinador oficial', contactName:'Ana',
  validUntil:'2020-01-01', sentAt:'2019-12-20T12:00:00Z', items:[{ assetId:'p2', description:'Patrocinador oficial', unitPrice:3000, quantity:1, unit:'por mes' }] };
const FAKE = `
  window.__rpc=[];const D=${JSON.stringify(DATOS)};
  export function createClient(){return{auth:{getSession:async()=>({data:{session:{user:{id:'u-pres'}}}}),onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}}},
    storage:{from:()=>({createSignedUrls:async(ps)=>({data:[],error:null}),createSignedUrl:async()=>({data:null,error:null}),upload:async(p)=>({data:{path:p},error:null}),remove:async()=>({data:[],error:null})})},
    rpc:async(n,p={})=>{window.__rpc.push({n,p:JSON.parse(JSON.stringify(p))});const ok=d=>({data:d,error:null});
      const Q=window.__q||(window.__q=[${JSON.stringify(VENCIDA)}]);
      if(n==='v2_sponsor_quotes')return ok({discountCapPct:10,isPresidency:true,whatsapp:'524792651338',assetExtras:${JSON.stringify(EXTRAS)},quotes:Q});
      if(n==='v2_save_sponsor_quote'){const sub=p.items.reduce((a,i)=>a+i.unitPrice*i.quantity,0);const m=p.plan&&p.plan.months;const iva=Math.round(sub*(p.plan.ivaPct||0))/100;
        const q={id:'q'+(Q.length+1),folio:'TC-2026-00'+(Q.length+1),sponsorId:p.sponsor_id,sponsorName:'Ferretería Centro',status:'draft',approvalStatus:'none',subtotal:sub,discountAmount:0,discountPct:0,
          total:m?sub*m:sub,months:m,ivaPct:p.plan.ivaPct,ivaAmount:iva,monthlyTotal:m?sub+iva:null,contractTotal:m?(sub+iva)*m:sub+iva,packageAssetId:p.plan.packageAssetId,packageName:'Patrocinador oficial',
          contactName:p.plan.contactName,validUntil:p.valid_until,items:p.items};Q.unshift(q);return ok(q);}
      if(n==='v2_set_sponsor_quote_status'){const q=Q.find(x=>x.id===p.quote_id);q.status=p.status;return ok(q);}
      if(n==='v2_my_context')return ok([{organization_id:'o1',organization_name:'Tannery City FC',role:'Presidencia'}]);
      if(n==='v2_my_modules')return ok([{module_code:'sponsors',enabled:true,can_read:true,can_write:true}]);
      if(n==='v2_sponsor_admin')return ok(D);
      if(n==='v2_sponsor_funded_players'||n==='v2_club_people'||n==='v2_billing_players')return ok([]);
      return ok(null);}}}`;
// jsPDF de mentira: guarda lo que se escribe para revisar la hoja.
const JSPDF = `export class jsPDF{constructor(){window.__pdf=[];window.__imgs=0;this.internal={pageSize:{getWidth:()=>612,getHeight:()=>792},getNumberOfPages:()=>1};}
  text(t){window.__pdf.push([].concat(t).join(' '));}getTextWidth(t){return String(t).length*6;}splitTextToSize(t){return [String(t)];}
  addImage(){window.__imgs++;}output(){return new Blob(['%PDF'],{type:'application/pdf'});}save(n){window.__guardado=n;}}
  for(const m of ['addPage','setFont','setFontSize','setTextColor','setFillColor','setDrawColor','setLineWidth','rect','roundedRect','line','setPage'])jsPDF.prototype[m]=function(){};`;
const nav = await chromium.launch({ executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
let fallos = 0, corridas = 0;
const revisa = (n, ok, d) => { corridas++; if (!ok) { fallos++; console.error(` - ${n}${d ? `\n   ${d}` : ''}`); } };
async function abre(ancho) {
  const pg = await nav.newPage({ viewport:{ width:ancho, height:900 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.route(/^https?:\/\/(?!127)/, r => r.abort());
  await pg.route('**/v2/supabase-client.js', r => r.fulfill({ contentType:'text/javascript', body:FAKE }));
  await pg.route('**/v2/branding-auto.js', r => r.fulfill({ contentType:'text/javascript', body:'' }));
  await pg.route(/\/vendor\/jspdf\.mjs/, r => r.fulfill({ contentType:'text/javascript', body:JSPDF }));
  await pg.goto(`${BASE}/patrocinadores/`, { waitUntil:'networkidle' });
  await pg.waitForSelector('#view:not(.hidden)', { timeout:8000 });
  return { pg, errs };
}
const txt = async (pg, sel) => (await pg.textContent(sel)).replace(/\s+/g, ' ').trim();
const masDias = (d) => new Date(Date.parse(hoy + 'T12:00:00Z') + d * 86400000).toISOString().slice(0, 10);

for (const ancho of [1280, 390]) {
  const { pg, errs } = await abre(ancho);
  const n = ancho === 390 ? ' (celular)' : '';
  await pg.click('.module-nav [data-view="quotes"]');
  // 6. La vencida.
  revisa('6. la que pasó su vigencia dice Vencida' + n, /Vencida/.test(await txt(pg, '#quoteList [data-cot="qv"]')) && /Vencidas 1/.test(await txt(pg, '#quoteFilters')), await txt(pg, '#quoteList'));
  revisa('6. en la lista sale el mensual y el contrato' + n, /\$3,480 al mes/.test(await txt(pg, '#quoteList [data-cot="qv"]')) && /12 meses · \$41,760 el contrato con IVA/.test(await txt(pg, '#quoteList [data-cot="qv"]')), await txt(pg, '#quoteList [data-cot="qv"]'));
  await pg.click('#quoteList [data-cot="qv"] [data-cot-accion="renovar"]');
  await pg.waitForSelector('#quoteModal:not(.hidden)', { timeout:3000 });
  revisa('6. renovar abre con su paquete, meses, IVA y contacto' + n, /Renovar TC-2026-001/.test(await txt(pg, '#quoteTitle')) && await pg.inputValue('#quoteMonths') === '12' && await pg.isChecked('#quoteIva') && await pg.inputValue('#quoteContact') === 'Ana'
    && await pg.getAttribute('#quotePackages [data-paquete="p2"]', 'aria-checked') === 'true', await txt(pg, '#quoteTitle'));
  revisa('6. y la vigencia vuelve a correr 15 días' + n, await pg.inputValue('#quoteValid') === masDias(15), await pg.inputValue('#quoteValid'));
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);

  // 1. Nueva cotización sin carrito.
  await pg.click('#newQuoteButton');
  await pg.waitForSelector('#quoteModal:not(.hidden)', { timeout:3000 });
  revisa('1. abre con los tres paquetes y Patrocinador oficial elegido' + n, (await pg.$$('#quotePackages [data-paquete]')).length === 4 && await pg.getAttribute('#quotePackages [data-paquete="p2"]', 'aria-checked') === 'true', await txt(pg, '#quotePackages'));
  revisa('1. 12 meses, IVA y 15 días de vigencia' + n, await pg.inputValue('#quoteMonths') === '12' && await pg.isChecked('#quoteIva') && await pg.inputValue('#quoteValid') === masDias(15));
  revisa('1. el paquete entra como primer renglón' + n, /Patrocinador oficial/.test(await txt(pg, '#quoteLines [data-linea="0"]')));
  // 2. Totales.
  const tot = await txt(pg, '#quoteTotals');
  revisa('2. base, extras, IVA, mensual y contrato' + n, /Base \$3,000/.test(tot) && /Activos extra \$0/.test(tot) && /IVA 16% \$480/.test(tot) && /Total mensual \$3,480/.test(tot) && /Total contrato · 12 meses \$41,760/.test(tot), tot);
  await pg.uncheck('#quoteIva');
  revisa('2. sin IVA el mensual es la base' + n, /Total mensual \$3,000/.test(await txt(pg, '#quoteTotals')) && /\$36,000/.test(await txt(pg, '#quoteTotals')), await txt(pg, '#quoteTotals'));
  await pg.check('#quoteIva');
  // 3. Meses fuera del paquete.
  await pg.fill('#quoteMonths', '5');
  revisa('3. 5 meses: pide mínimo 6' + n, await pg.isVisible('#quotePlanWarn') && /mínimo 6 meses/.test(await txt(pg, '#quotePlanWarn')));
  await pg.selectOption('#quoteSponsor', 's1');
  await pg.click('#saveQuote'); await pg.waitForTimeout(150);
  revisa('3. y no deja guardar' + n, /mínimo 6 meses/.test(await txt(pg, '#quoteMessage')) && !(await pg.evaluate(() => window.__rpc.some(x => x.n === 'v2_save_sponsor_quote'))));
  await pg.click('#quotePackages [data-paquete="p3"]');
  revisa('3. Aliado integral sube los meses a 12' + n, await pg.inputValue('#quoteMonths') === '12' && await pg.isHidden('#quotePlanWarn') && /Aliado integral/.test(await txt(pg, '#quoteLines [data-linea="0"]')) && (await pg.$$('#quoteLines [data-linea]')).length === 1);
  await pg.fill('#quoteMonths', '11');
  revisa('3. Aliado integral con 11: sólo de 12' + n, /sólo de 12 meses/.test(await txt(pg, '#quotePlanWarn')));
  await pg.click('#quotePackages [data-paquete="p2"]');
  revisa('3. regresar a oficial deja 11 meses' + n, await pg.inputValue('#quoteMonths') === '11' && await pg.isHidden('#quotePlanWarn'));
  await pg.fill('#quoteMonths', '12');
  // 4. Extra en 0 = Incluido.
  await pg.click('#quoteAddMore'); await pg.waitForTimeout(150);
  await pg.click('#assetList [data-carrito="c1"]');
  await pg.click('#cartQuote');
  await pg.waitForSelector('#quoteModal:not(.hidden)', { timeout:3000 });
  revisa('4. el extra sin precio dice Incluido' + n, await pg.getAttribute('#quoteLines [data-linea="1"] [data-campo="unitPrice"]', 'placeholder') === 'Incluido' && await pg.getAttribute('#quotePackages [data-paquete="p2"]', 'aria-checked') === 'true');
  await pg.fill('#quoteLines [data-linea="1"] [data-campo="unitPrice"]', '2000');
  revisa('4. y suma como extra' + n, /Activos extra \$2,000/.test(await txt(pg, '#quoteTotals')) && /Total mensual \$5,800/.test(await txt(pg, '#quoteTotals')), await txt(pg, '#quoteTotals'));
  await pg.fill('#quoteLines [data-linea="1"] [data-campo="unitPrice"]', '0');
  await pg.fill('#quoteContact', 'Ana López');
  await pg.selectOption('#quoteSponsor', 's1');
  if (process.env.SHOTS) await pg.screenshot({ path:`${process.env.SHOTS}/cotizador-mensual${ancho === 390 ? '-cel' : ''}.png`, fullPage:true });
  revisa('8. en el celular no se sale la página' + n, await pg.evaluate(() => document.documentElement.scrollWidth) <= ancho);
  await pg.click('#saveQuote');
  await pg.waitForSelector('.tosdlg', { timeout:4000 });
  // 5. Lo que se manda.
  const sq = await pg.evaluate(() => window.__rpc.filter(x => x.n === 'v2_save_sponsor_quote').pop()?.p);
  revisa('5. manda meses, IVA, paquete y contacto' + n, sq?.plan?.months === 12 && sq.plan.ivaPct === 16 && sq.plan.packageAssetId === 'p2' && sq.plan.contactName === 'Ana López', JSON.stringify(sq?.plan));
  revisa('5. el paquete primero y el Incluido en 0' + n, sq?.items?.[0]?.assetId === 'p2' && sq.items[0].unitPrice === 3000 && sq.items[1]?.assetId === 'c1' && sq.items[1].unitPrice === 0 && sq.valid_until === masDias(15), JSON.stringify(sq?.items));
  revisa('5. la pregunta dice cuánto al mes' + n, /\$3,480 al mes/.test(await txt(pg, '.tosdlg')), await txt(pg, '.tosdlg'));
  await pg.click('.tosdlg-btn:not(.tosdlg-cancel)');
  // 7. El PDF.
  await pg.waitForFunction(() => /PDF listo/.test(document.body.innerText), null, { timeout:8000 }).catch(() => {});
  const pdf = await pg.evaluate(() => (window.__pdf || []).join(' | '));
  revisa('7. la hoja lleva folio, paquete y totales' + n, /TC-2026-002/.test(pdf) && /Patrocinador oficial/.test(pdf) && /\$3,480/.test(pdf) && /\$41,760/.test(pdf) && /TOTAL CONTRATO · 12 MESES/.test(pdf), pdf.slice(0, 600));
  revisa('7. el Incluido y las 12 lonas' + n, /Incluido/.test(pdf) && /Cancha Chavicos/.test(pdf) && /12 ESPACIOS/.test(pdf), pdf.slice(0, 600));
  revisa('7. el pie sólo con el WhatsApp de la academia' + n, /WhatsApp academia 479 265 1338/.test(pdf) && !/477 246 4659/.test(pdf));
  revisa('7. con el logo y la foto de la cancha' + n, await pg.evaluate(() => window.__imgs) >= 3, String(await pg.evaluate(() => window.__imgs)));
  await pg.evaluate(() => { navigator.canShare = undefined; });
  await pg.click('.tosdlg-btn:not(.tosdlg-cancel)');
  await pg.waitForTimeout(300);
  revisa('7. se guarda con el folio y queda Enviada' + n, /^Propuesta-TC-2026-002-Ferreteria-Centro\.pdf$/.test(await pg.evaluate(() => window.__guardado) || '') && (await pg.evaluate(() => window.__rpc.filter(x => x.n === 'v2_set_sponsor_quote_status').pop()?.p?.status)) === 'sent', await pg.evaluate(() => window.__guardado));
  revisa('sin errores' + n, errs.length === 0, errs.join(' | '));
  await pg.close();
}
await nav.close(); srv.close();
if (fallos) { console.error(`Cotizador por mes humo: ${fallos} de ${corridas} fallaron`); process.exit(1); }
console.log(`Cotizador por mes humo OK · ${corridas} revisiones: paquete, meses, IVA, Incluido, vencida y renovar, hoja carta y celular`);
