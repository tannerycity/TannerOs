/* UN SOLO COBRO CON VARIOS CONCEPTOS.
 *
 * Pedido (21/10/2026): "nos pagan 1,500: 1,000 de inscripción y 500 de
 * mensualidad; nos cuesta un huevo registrarlo por separado". Y: "quiero que
 * la cobranza ahí (en el estado de cuenta) sea rápida".
 *
 * Esta prueba levanta /tanner/ y /taquilla/ REALES con un Supabase falso y
 * revisa:
 *   · "Cobrar" abre la hoja aquí mismo (ya no manda a Taquilla) con todo lo
 *     que debe elegido; tocar un mes que se debe abre sólo ese mes;
 *   · Inscripción propone el precio de Costos según la edad, deja cambiar de
 *     categoría y abonar (dice cuánto queda a deber);
 *   · arbitraje, uniforme y dos métodos (efectivo + transferencia) en un solo
 *     cobro, con el total y el resto a la vista;
 *   · no deja cobrar más de lo que se debe, ni sin categoría en otro ingreso;
 *   · lo que se manda a v2_collect_ticket cuadra; si la red falla, el
 *     reintento usa la MISMA llave;
 *   · al terminar enseña el folio y el recibo por WhatsApp, y la cuenta se
 *     vuelve a pedir; el folio aparece en los movimientos;
 *   · quien no puede cobrar no ve el botón ni los meses como botón;
 *   · Taquilla: elegir al Tanner deja "Paga varios conceptos", que abre la
 *     misma hoja.
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
const PUERTO = srv.address().port;

const ESTADO = {
  canAdjust: true,
  player: { id:'p1', first_name:'Liam', last_name:'Santos', status:'active', category:'T12', birth_date:'2014-03-02',
            guardians:[{ name:'Mamá', phone:'4771234567', primary:true }] },
  summary: { balance: 1100, paid_total: 500, credit_available: 0, credit_held: 0, by_type:[{type:'monthly_fee',pending:1000},{type:'late_fee',pending:100}] },
  ledger: [
    { id:'c-rec', date:'2026-10-06', kind:'charge', subtype:'late_fee', amount:100, charge_balance:100, period:'2026-10-01', running_balance:1100 },
    { id:'c-oct', date:'2026-10-05', kind:'charge', subtype:'monthly_fee', amount:500, charge_balance:500, period:'2026-10-01', running_balance:1000 },
    { id:'pay-1', date:'2026-09-20', kind:'payment', amount:-500, status:'posted', method:'cash', running_balance:500 },
    { id:'c-sep', date:'2026-09-05', kind:'charge', subtype:'monthly_fee', amount:500, charge_balance:0, period:'2026-09-01', running_balance:1000 },
    { id:'c-ago', date:'2026-08-05', kind:'charge', subtype:'monthly_fee', amount:500, charge_balance:500, period:'2026-08-01', running_balance:500 }
  ],
  other_payments: [], documents: [], orders: [], academies: []
};
const COBRO = (canCollect) => ({
  canCollect, canOrders: true, prices: null,
  charges: [
    { id:'c-ago', type:'monthly_fee', period:'2026-08-01', label:'Mensualidad ago', balance:500, sponsor:false },
    { id:'c-oct', type:'monthly_fee', period:'2026-10-01', label:'Mensualidad oct', balance:500, sponsor:false },
    { id:'c-rec', type:'late_fee', period:'2026-10-01', label:'Recargo oct', balance:100, sponsor:false },
    { id:'c-pat', type:'monthly_fee', period:'2026-10-01', label:'Mensualidad oct', balance:500, sponsor:true }
  ],
  orders: [{ id:'o1', folio:'PED-0042', total:900, balance:350 }],
  tickets: { 'pay-1': { folio:7, ticket:'t7', parts:2 } }
});

const revisiones = [], errores = [];
// FOTOS=<carpeta> guarda capturas para revisar el diseño a ojo.
const foto = async (p, n) => { if (process.env.FOTOS) await p.screenshot({ path:`${process.env.FOTOS}/${n}.png`, fullPage:false }); };
const revisa = (n, ok, d = '') => revisiones.push({ nombre:n, ok, detalle:d });
const nav = await chromium.launch({ executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });

async function abre(canCollect, ruta = '/v2/tanner/?id=p1', ancho = 390) {
  const p = await nav.newPage({ viewport:{ width:ancho, height:844 } });
  p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
  await p.addInitScript(({ estado, cobro }) => {
    window.__llamadas = []; window.__fallaCobro = 1;
    window.tosConfirm = async (o) => { window.__confirmo = o; return true; };
    window.open = (u) => { window.__abierto = u; return null; };
    const m = ['cobranza','contabilidad','taquilla','jugadores','finanzas'].map(c => ({ module_code:c, enabled:true, can_read:true, can_write:true }));
    const R = { v2_my_context:[{ user_id:'u1', display_name:'Mich', organization_id:'o1', organization_name:'Tannery City FC', role:'Presidencia', is_owner:true }],
                v2_my_navigation:m, v2_player_account_statement:estado, v2_player_collection:cobro, v2_player_change_history:[],
                v2_collect_ticket:{ ok:true, ticketId:'t9', folio:9, total:0, payments:['a','b','c'] },
                v2_cashier_snapshot:{ businessDate:'2026-10-21', incomeTotal:0, expenseTotal:0, netTotal:0, expectedCash:0, cashTodayNet:0, methods:[], movements:[], canViewLedger:true },
                v2_billing_players:[{ player_id:'p1', player_name:'Liam Santos', base_monthly_fee:500, billing_status:'active' }],
                v2_open_receivables:[], v2_orders_to_collect:[], v2_payments_to_reconcile:[] };
    window.__fakeSupabase = {
      auth:{ getSession:async()=>({data:{session:{user:{id:'u1'}}}}), getUser:async()=>({data:{user:{id:'u1'}}}), onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}) },
      rpc:async(n, params)=>{
        window.__llamadas.push({ n, params });
        if (n==='v2_collect_ticket' && window.__fallaCobro>0) { window.__fallaCobro--; return { data:null, error:{ message:'Failed to fetch' } }; }
        return { data:R[n] ?? null, error:null };
      },
      from:()=>({ select(){return this;}, eq(){return this;}, order(){return this;}, limit(){return Promise.resolve({data:[],error:null});}, then(r){return Promise.resolve({data:[],error:null}).then(r);} }),
      channel:()=>({ on(){return this;}, subscribe(){return this;} }), removeChannel(){}
    };
  }, { estado:ESTADO, cobro:COBRO(canCollect) });
  await p.route('**/v2/supabase-client.js', r => r.fulfill({ status:200, contentType:'text/javascript', body:'export function createClient(){ return window.__fakeSupabase; }' }));
  await p.route('**/v2/photo-cache.js', r => r.fulfill({ status:200, contentType:'text/javascript',
    body:'export async function getSignedPhotoUrls(){return {};}export async function getSignedPhotoUrl(){return null;}export async function getRawSignedPhotoUrl(){return null;}export async function clearPhotoCache(){}export function forgetPhoto(){}' }));
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PUERTO}${ruta}`, { waitUntil:'domcontentloaded' });
  return p;
}
const llamadas = (p, n) => p.evaluate(n => window.__llamadas.filter(l => l.n === n), n);
const texto = async (p, sel) => ((await p.textContent(sel)) || '').replace(/\s+/g, ' ');

/* ---------- Estado de cuenta: cobrar aquí mismo ---------- */
{
  const p = await abre(true);
  await p.waitForSelector('.tan-balance [data-cobrar]', { timeout:8000 });
  revisa('[cuenta] "Cobrar $1,100.00" ya no es un enlace a Taquilla', await p.$eval('.tan-balance [data-cobrar]', b => b.tagName === 'BUTTON' && /Cobrar \$1,100\.00/.test(b.textContent)));
  const meses = await p.$$eval('.tan-meses [data-cobrar]', els => els.map(e => e.dataset.cobrar));
  revisa('[cuenta] los meses que se deben son botones; el pagado no', JSON.stringify(meses) === JSON.stringify(['2026-10','2026-08']), JSON.stringify(meses));
  await foto(p, 'cuenta');
  revisa('[cuenta] el pago cobrado junto con otros lleva su folio', /Folio C-0007 \(2 partes\)/.test(await texto(p, '.tan-ledger')));

  await p.click('.tan-balance [data-cobrar]');
  await p.waitForSelector('#cobroSheet:not(.hidden) .cobro-form', { timeout:5000 });
  await p.waitForTimeout(300); await foto(p, 'cobro-hoja-arriba');
  const elegidos = await p.$$eval('[data-chip][aria-pressed="true"]', els => els.map(e => e.dataset.chip));
  revisa('[hoja] propone todo lo que debe', JSON.stringify(elegidos) === JSON.stringify(['c:c-ago','c:c-oct','c:c-rec']), JSON.stringify(elegidos));
  revisa('[hoja] el cargo de patrocinador no se ofrece', !(await p.$('[data-chip="c:c-pat"]')));
  revisa('[hoja] el total arranca en $1,100.00', /\$1,100\.00/.test(await texto(p, '#cobroTotal')));
  revisa('[hoja] ofrece el uniforme con su saldo', /Uniforme PED-0042\s*\$350\.00/.test(await texto(p, '[data-chip="o:o1"]')));

  // Inscripción: Liam tiene 12 años, le toca Tanners ($800 en Costos).
  await p.click('[data-chip="reg"]');
  revisa('[inscripción] propone $800 de Tanners por su edad', await p.inputValue('[data-total="reg"]') === '800' && await p.inputValue('[data-monto="reg"]') === '800');
  await p.click('[data-cat="baby"]');
  revisa('[inscripción] cambiar a Baby Tanners pone $500', await p.inputValue('[data-total="reg"]') === '500');
  await p.click('[data-cat="tanner"]');
  await p.fill('[data-monto="reg"]', '500');
  await p.click('[data-chip="arb"]');
  revisa('[inscripción] abonar dice cuánto queda a deber', /Queda a deber \$300\.00/.test(await texto(p, '[data-linea="reg"]')));

  // Arbitraje sin monto no se manda
  await p.click('#cobroEnviar');
  revisa('[validación] arbitraje sin monto no se manda', (await llamadas(p, 'v2_collect_ticket')).length === 0 && /arbitraje/i.test(await texto(p, '.pres-error')));
  await p.fill('[data-monto="arb"]', '150');
  revisa('[hoja] el total suma todo: $1,750.00', /\$1,750\.00/.test(await texto(p, '#cobroTotal')));

  // Más de lo que se debe
  await p.fill('[data-monto="c:c-rec"]', '300');
  await p.click('#cobroEnviar');
  revisa('[validación] no deja cobrar más de lo que debe el recargo', (await llamadas(p, 'v2_collect_ticket')).length === 0 && /Recargo oct sólo debe \$100\.00/.test(await texto(p, '.pres-error')));
  await p.fill('[data-monto="c:c-rec"]', '100');
  revisa('[validación] al corregir el monto se quita el aviso', !(await p.$('#cobroBody .pres-error')));

  // Dos métodos
  await p.click('[data-dos]');
  await p.fill('#cobroMonto1', '1000');
  revisa('[métodos] enseña el resto: $750.00 en transferencia', /\$750\.00/.test(await texto(p, '#cobroResto')) && await p.inputValue('#cobroMetodo2') === 'transfer');
  await p.fill('#cobroRef', 'SPEI 4455');
  await p.fill('#cobroQuien', 'Zul');
  const cabe = await p.evaluate(() => { const r = document.getElementById('cobroSheet').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1; });
  revisa('[hoja] en el teléfono cabe a lo ancho', cabe);
  await foto(p, 'cobro-hoja');
  await p.evaluate(() => document.getElementById('cobroSheet').scrollTo(0, 99999));
  await foto(p, 'cobro-hoja-abajo');

  await p.click('#cobroEnviar');
  await p.waitForSelector('.pres-error', { timeout:4000 });
  revisa('[red] si falla, lo dice y deja reintentar', /Failed to fetch|No se pudo/.test(await texto(p, '.pres-error')));
  await p.click('#cobroEnviar');
  await p.waitForSelector('.cobro-hecho', { timeout:4000 });
  const c = await llamadas(p, 'v2_collect_ticket');
  const prm = c[1]?.params || {};
  revisa('[red] el reintento usa la misma llave', c.length === 2 && c[0].params.idempotency_key === prm.idempotency_key && String(prm.idempotency_key).length >= 8);
  const it = prm.items || [];
  const esperado = [
    { kind:'charge', charge_id:'c-ago', amount:500 }, { kind:'charge', charge_id:'c-oct', amount:500 }, { kind:'charge', charge_id:'c-rec', amount:100 },
    { kind:'registration', total:800, amount:500 }, { kind:'income', category:'Arbitraje', concept:'Arbitraje', amount:150 }];
  revisa('[envío] manda cada concepto con su monto', JSON.stringify(it) === JSON.stringify(esperado), JSON.stringify(it));
  revisa('[envío] dos métodos que cuadran con el total', JSON.stringify(prm.methods) === JSON.stringify([{ method:'cash', amount:1000, reference:null }, { method:'transfer', amount:750, reference:'SPEI 4455' }]), JSON.stringify(prm.methods));
  revisa('[envío] manda Tanner, fecha y quién cobró', prm.player_id === 'p1' && /^\d{4}-\d{2}-\d{2}$/.test(prm.payment_date) && prm.collected_by_name === 'Zul');
  revisa('[confirmación] el doble check dice el desglose', /Inscripción \$500\.00/.test(await p.evaluate(() => window.__confirmo?.message || '')) && /Efectivo \$1,000\.00 \+ Transferencia \$750\.00/.test(await p.evaluate(() => window.__confirmo?.message || '')));

  await p.waitForTimeout(300); await foto(p, 'cobro-hecho');
  const hecho = await texto(p, '.cobro-hecho');
  revisa('[hecho] enseña el total y el folio', /\$1,750\.00/.test(hecho) && /Folio C-0009/.test(hecho), hecho.slice(0, 160));
  const wa = await p.getAttribute('.cobro-wa', 'href');
  revisa('[hecho] recibo por WhatsApp a la familia con el desglose', wa.startsWith('https://wa.me/524771234567?text=') && /Inscripci%C3%B3n%3A%20%24500\.00/.test(wa) && /Folio%20C-0009/.test(wa), wa.slice(0, 80));
  await p.click('.cobro-listo');
  await p.waitForSelector('#cobroSheet.hidden', { state:'attached', timeout:4000 });
  revisa('[hecho] al cerrar vuelve a pedir la cuenta', (await llamadas(p, 'v2_player_account_statement')).length === 2);
  revisa('[hecho] avisa el folio', /Folio C-0009/.test(await texto(p, '#cobroToast')));

  // Tocar un mes abre sólo ese mes
  await p.click('.tan-meses [data-cobrar="2026-08"]');
  await p.waitForSelector('#cobroSheet:not(.hidden) .cobro-form', { timeout:5000 });
  const delMes = await p.$$eval('[data-chip][aria-pressed="true"]', els => els.map(e => e.dataset.chip));
  revisa('[mes] tocar agosto abre el cobro sólo con agosto', JSON.stringify(delMes) === JSON.stringify(['c:c-ago']), JSON.stringify(delMes));
  await p.click('[data-chip="otro"]');
  await p.fill('[data-monto="otro"]', '200');
  await p.click('#cobroEnviar');
  revisa('[validación] otro ingreso pide categoría', /categoría/.test(await texto(p, '.pres-error')));
  revisa('[cuenta] sin scroll horizontal', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await p.close();
}

/* ---------- Quien no puede cobrar ---------- */
{
  const p = await abre(false);
  await p.waitForSelector('.tan-balance', { timeout:8000 });
  revisa('[sin permiso] no ve "Cobrar"', !(await p.$('.tan-balance [data-cobrar]')));
  revisa('[sin permiso] los meses no son botones', (await p.$$('.tan-meses [data-cobrar]')).length === 0);
  await p.close();
}

/* ---------- Taquilla ---------- */
{
  const p = await abre(true, '/v2/taquilla/', 1280);
  await p.waitForSelector('#openCollect:not([disabled])', { timeout:8000 });
  await p.click('#openCollect');
  revisa('[taquilla] sin Tanner no aparece "Paga varios conceptos"', !(await p.isVisible('#collectDesglose')));
  await p.fill('#collectPlayerSearch', 'Liam');
  await p.waitForSelector('#collectPlayerResults:not(.hidden) button, #collectPlayerResults:not(.hidden) [data-id]', { timeout:5000 });
  await p.click('#collectPlayerResults button, #collectPlayerResults [data-id]');
  await p.waitForSelector('#collectDesglose:not(.hidden)', { timeout:3000 });
  revisa('[taquilla] al elegir al Tanner aparece "Paga varios conceptos"', await p.isVisible('#collectDesglose'));
  await p.click('#collectDesglose');
  await p.waitForSelector('#cobroSheet:not(.hidden) .cobro-form', { timeout:5000 });
  revisa('[taquilla] abre la misma hoja con su Tanner', /Liam Santos/.test(await texto(p, '#cobroTitle + p')) && (await p.$$('[data-chip][aria-pressed="true"]')).length === 3);
  revisa('[taquilla] el modal de cobro se cerró', !(await p.isVisible('#collectModal')));
  await p.close();
}

await nav.close(); srv.close();
const fallas = revisiones.filter(r => !r.ok);
for (const r of revisiones) console.log(`${r.ok ? 'OK   ' : 'FALLA'} ${r.nombre}${r.ok || !r.detalle ? '' : ` · ${r.detalle}`}`);
for (const e of errores) console.log(`ERROR ${e}`);
console.log(`\n${revisiones.length - fallas.length}/${revisiones.length} revisiones${errores.length ? ` · ${errores.length} errores de página` : ''}`);
process.exit(fallas.length || errores.length ? 1 : 0);
