/* UN SOLO COBRO CON VARIOS CONCEPTOS, EN 3 TOQUES.
 *
 * Pedidos (21/10/2026): "nos pagan 1,500: 1,000 de inscripción y 500 de
 * mensualidad; nos cuesta un huevo registrarlo por separado". Y: "que no
 * tengan que dar tantos clics, todos puedan cobrar ahí y tenga trazabilidad".
 *
 * Esta prueba levanta /tanner/ y /taquilla/ REALES con un Supabase falso y
 * revisa:
 *   · "Cobrar" abre la hoja aquí mismo con todo lo que debe elegido; tocar un
 *     mes que se debe abre sólo ese mes;
 *   · Inscripción propone el precio de Costos según la edad, deja cambiar de
 *     categoría y abonar;
 *   · el último toque dice el método ("Efectivo" / "Transferencia"): sin
 *     doble check y sin escribir quién cobró (sale del usuario);
 *   · lo raro (tarjeta, dos métodos, fecha, nota, referencia) vive en "Más";
 *   · hermanos: se agregan con un toque y cada concepto lleva su Tanner;
 *   · no deja cobrar más de lo que se debe; el reintento usa la misma llave;
 *   · cuenta compartida (iPad): pregunta quién cobra una vez y lo recuerda;
 *   · folio, recibo por WhatsApp, y el folio en los movimientos;
 *   · quien no puede cobrar no ve el botón ni los meses como botón;
 *   · Taquilla: "¿A quién le cobras?" y COBRAR › Tanner abren la misma hoja;
 *     el formulario de siempre queda sólo para un patrocinador.
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
            guardians:[{ name:'Víctor Mejía', relationship:'guardian', phone:'+524771234567', primary:true }] },
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
const COBRO_HERMANA = { canCollect:true, canOrders:true, prices:null, orders:[], tickets:{},
  charges: [{ id:'h-oct', type:'monthly_fee', period:'2026-10-01', label:'Mensualidad oct', balance:400, sponsor:false }] };

const revisiones = [], errores = [];
// FOTOS=<carpeta> guarda capturas para revisar el diseño a ojo.
const foto = async (p, n) => { if (process.env.FOTOS) await p.screenshot({ path:`${process.env.FOTOS}/${n}.png`, fullPage:false }); };
const revisa = (n, ok, d = '') => revisiones.push({ nombre:n, ok, detalle:d });
const nav = await chromium.launch({ executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });

async function abre(canCollect, ruta = '/v2/tanner/?id=p1', ancho = 390, usuario = { display_name:'Mich', role:'Presidencia' }) {
  const p = await nav.newPage({ viewport:{ width:ancho, height:844 } });
  p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
  await p.addInitScript(({ estado, cobro, hermana, usuario }) => {
    window.__llamadas = []; window.__fallaCobro = 1;
    window.tosConfirm = async () => { window.__confirmos = (window.__confirmos || 0) + 1; return true; };
    window.open = (u) => { window.__abierto = u; return null; };
    const m = ['cobranza','contabilidad','taquilla','jugadores','finanzas'].map(c => ({ module_code:c, enabled:true, can_read:true, can_write:true }));
    const R = { v2_my_context:[{ user_id:'u1', display_name:usuario.display_name, organization_id:'o1', organization_name:'Tannery City FC', role:usuario.role, is_owner:true }],
                v2_my_navigation:m, v2_player_account_statement:estado, v2_player_change_history:[],
                v2_player_family:[{ id:'p2', name:'Sofía Santos', birthDate:'2019-05-01', balance:400 }],
                v2_collect_ticket:{ ok:true, ticketId:'t9', folio:9, total:0, payments:['a','b','c'] },
                v2_cashier_snapshot:{ businessDate:'2026-10-21', incomeTotal:0, expenseTotal:0, netTotal:0, expectedCash:0, cashTodayNet:0, methods:[], canViewLedger:true,
                  movements:[{ id:'m1', type:'income', status:'posted', amount:500, registeredBy:'Zul', registeredByIsAccount:false }] },
                v2_billing_players:[{ player_id:'p1', player_name:'Liam Santos', base_monthly_fee:500, billing_status:'active' }],
                v2_open_receivables:[], v2_orders_to_collect:[], v2_payments_to_reconcile:[], v2_agreements_overview:[],
                // La fecha de hoy del navegador: la prueba no caduca mañana.
                v2_expected_today:[{ playerId:'p1', name:'Liam Santos Hernández', state:'active', amount:600,
                                     due:(d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)(new Date()) },
                                   { playerId:'p1', name:'Liam Santos', state:'broken', due:'2026-10-10', amount:300 }],
                v2_my_cash_day:{ date:'2026-10-21', rows:[{ who:'Mich', kind:'in', method:'cash', count:2, total:1500 },
                  { who:'Mich', kind:'in', method:'transfer', count:1, total:800 }, { who:'Mich', kind:'out', method:'cash', count:1, total:200 }] } };
    window.__fakeSupabase = {
      auth:{ getSession:async()=>({data:{session:{user:{id:'u1'}}}}), getUser:async()=>({data:{user:{id:'u1'}}}), onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}) },
      rpc:async(n, params)=>{
        window.__llamadas.push({ n, params });
        if (n==='v2_collect_ticket' && window.__fallaCobro>0) { window.__fallaCobro--; return { data:null, error:{ message:'Failed to fetch' } }; }
        if (n==='v2_player_collection') return { data: params.player_id === 'p2' ? hermana : cobro, error:null };
        return { data:R[n] ?? null, error:null };
      },
      from:()=>({ select(){return this;}, eq(){return this;}, order(){return this;}, limit(){return Promise.resolve({data:[],error:null});}, then(r){return Promise.resolve({data:[],error:null}).then(r);} }),
      channel:()=>({ on(){return this;}, subscribe(){return this;} }), removeChannel(){}
    };
  }, { estado:ESTADO, cobro:COBRO(canCollect), hermana:COBRO_HERMANA, usuario });
  await p.route('**/v2/supabase-client.js', r => r.fulfill({ status:200, contentType:'text/javascript', body:'export function createClient(){ return window.__fakeSupabase; }' }));
  await p.route('**/v2/photo-cache.js', r => r.fulfill({ status:200, contentType:'text/javascript',
    body:'export async function getSignedPhotoUrls(){return {};}export async function getSignedPhotoUrl(){return null;}export async function getRawSignedPhotoUrl(){return null;}export async function clearPhotoCache(){}export function forgetPhoto(){}' }));
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PUERTO}${ruta}`, { waitUntil:'domcontentloaded' });
  return p;
}
const llamadas = (p, n) => p.evaluate(n => window.__llamadas.filter(l => l.n === n), n);
const texto = async (p, sel) => ((await p.textContent(sel)) || '').replace(/\s+/g, ' ');
const hoja = '#cobroSheet:not(.hidden) .cobro-form';

/* ---------- Estado de cuenta: cobrar aquí mismo ---------- */
{
  const p = await abre(true);
  await p.waitForSelector('.tan-balance [data-cobrar]', { timeout:8000 });
  revisa('[cuenta] "Cobrar $1,100.00" abre la hoja aquí mismo', await p.$eval('.tan-balance [data-cobrar]', b => b.tagName === 'BUTTON' && /Cobrar \$1,100\.00/.test(b.textContent)));
  const meses = await p.$$eval('.tan-meses [data-cobrar]', els => els.map(e => e.dataset.cobrar));
  revisa('[cuenta] los meses que se deben son botones; el pagado no', JSON.stringify(meses) === JSON.stringify(['2026-10','2026-08']), JSON.stringify(meses));
  await foto(p, 'cuenta');
  await p.$eval('.tan-contacto', e => e.scrollIntoView({ block:'center' })); await foto(p, 'contacto');
  const contacto = await texto(p, '.tan-contacto');
  revisa('[contacto] el tutor se lee "Tutor · principal · 477 123 4567", sin "guardian"', /Tutor · principal · 477 123 4567/.test(contacto) && !/guardian|\+52/.test(contacto), contacto);
  revisa('[contacto] WhatsApp y Llamar con un toque', await p.getAttribute('.tan-contacto [data-kind="wa"]', 'href') === 'https://wa.me/524771234567' && await p.getAttribute('.tan-contacto a[href^="tel:"]', 'href') === 'tel:+524771234567');
  revisa('[cuenta] el pago cobrado junto con otros lleva su folio', /Folio C-0007 \(2 partes\)/.test(await texto(p, '.tan-ledger')));

  await p.click('.tan-balance [data-cobrar]');
  await p.waitForSelector(hoja, { timeout:5000 });
  await p.waitForTimeout(300); await foto(p, 'cobro-hoja-arriba');
  const elegidos = await p.$$eval('[data-chip][aria-pressed="true"]', els => els.map(e => e.dataset.chip));
  revisa('[hoja] propone todo lo que debe', JSON.stringify(elegidos) === JSON.stringify(['c:c-ago','c:c-oct','c:c-rec']), JSON.stringify(elegidos));
  revisa('[hoja] el cargo de patrocinador no se ofrece', !(await p.$('[data-chip="c:c-pat"]')));
  revisa('[hoja] el total arranca en $1,100.00', /\$1,100\.00/.test(await texto(p, '#cobroTotal')));
  revisa('[hoja] ofrece el uniforme con su saldo', /Uniforme PED-0042\s*\$350\.00/.test(await texto(p, '[data-chip="o:o1"]')));
  revisa('[hoja] no pregunta quién cobra (cuenta personal)', !(await p.$('#cobroQuienNuevo')) && !(await p.$('.cobro-cobra')));
  revisa('[hoja] lo raro está escondido: sin fecha, nota ni referencia a la vista', !(await p.$('#cobroFecha')) && !(await p.$('#cobroObs')) && !(await p.$('#cobroRef')));
  const botones = await p.$$eval('[data-pagar]', els => els.map(e => `${e.dataset.pagar}:${e.textContent.replace(/\s+/g, ' ').trim()}`));
  revisa('[hoja] el último toque dice el método y el total', JSON.stringify(botones) === JSON.stringify(['cash:Efectivo $1,100.00','transfer:Transferencia $1,100.00']), JSON.stringify(botones));

  // Inscripción: Liam tiene 12 años, le toca Tanners ($800 en Costos).
  await p.click('[data-chip="reg:p1"]');
  revisa('[inscripción] propone $800 de Tanners por su edad', await p.inputValue('[data-total="reg:p1"]') === '800' && await p.inputValue('[data-monto="reg:p1"]') === '800');
  await p.click('[data-cat="baby"]');
  revisa('[inscripción] cambiar a Baby Tanners pone $500', await p.inputValue('[data-total="reg:p1"]') === '500');
  await p.click('[data-cat="tanner"]');
  await p.fill('[data-monto="reg:p1"]', '500');
  await p.click('[data-chip="arb"]');
  revisa('[inscripción] abonar dice cuánto queda a deber', /Queda a deber \$300\.00/.test(await texto(p, '[data-linea="reg:p1"]')));

  await p.click('[data-pagar="cash"]');
  revisa('[validación] arbitraje sin monto no se manda', (await llamadas(p, 'v2_collect_ticket')).length === 0 && /arbitraje/i.test(await texto(p, '.pres-error')));
  await p.fill('[data-monto="arb"]', '150');
  revisa('[hoja] el total suma todo y los botones también: $1,750.00', /\$1,750\.00/.test(await texto(p, '#cobroTotal')) && /\$1,750\.00/.test(await texto(p, '[data-pagar="transfer"]')));

  await p.fill('[data-monto="c:c-rec"]', '300');
  await p.click('[data-pagar="cash"]');
  revisa('[validación] no deja cobrar más de lo que debe el recargo', (await llamadas(p, 'v2_collect_ticket')).length === 0 && /Recargo oct sólo debe \$100\.00/.test(await texto(p, '.pres-error')));
  await p.fill('[data-monto="c:c-rec"]', '100');
  revisa('[validación] al corregir el monto se quita el aviso', !(await p.$('#cobroBody .pres-error')));

  // Hermana: un toque la agrega con lo que debe.
  revisa('[hermanos] ofrece a la hermana con lo que debe', /Sofía\s*\$400\.00/.test(await texto(p, '[data-hermano="p2"]')));
  await p.click('[data-hermano="p2"]');
  await p.waitForSelector('[data-chip="c:h-oct"][aria-pressed="true"]', { timeout:4000 });
  revisa('[hermanos] su mensualidad entra elegida y con su nombre', /Mensualidad oct · Sofía/.test(await texto(p, '[data-chip="c:h-oct"]')) && /Sofía Santos/.test(await texto(p, '#cobroBody')));
  revisa('[hermanos] el total ya la incluye: $2,150.00', /\$2,150\.00/.test(await texto(p, '#cobroTotal')));

  // Dos métodos: en "Más opciones"
  await p.click('#cobroBody [data-mas]');
  await p.click('[data-dos]');
  await p.fill('#cobroMonto1', '1000');
  revisa('[más] dos métodos enseña el resto: $1,150.00 en transferencia', /\$1,150\.00/.test(await texto(p, '#cobroResto')) && await p.inputValue('#cobroMetodo2') === 'transfer');
  await p.fill('#cobroRef', 'SPEI 4455');
  const cabe = await p.evaluate(() => { const r = document.getElementById('cobroSheet').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1; });
  revisa('[hoja] en el teléfono cabe a lo ancho', cabe);
  await p.evaluate(() => document.getElementById('cobroSheet').scrollTo(0, 99999)); await foto(p, 'cobro-hoja-abajo');

  await p.click('#cobroEnviar');
  await p.waitForSelector('.pres-error', { timeout:4000 });
  revisa('[red] si falla, lo dice y deja reintentar', /Failed to fetch|No se pudo/.test(await texto(p, '.pres-error')));
  await p.click('#cobroEnviar');
  await p.waitForSelector('.cobro-hecho', { timeout:4000 });
  const c = await llamadas(p, 'v2_collect_ticket');
  const prm = c[1]?.params || {};
  revisa('[red] el reintento usa la misma llave', c.length === 2 && c[0].params.idempotency_key === prm.idempotency_key && String(prm.idempotency_key).length >= 8);
  const esperado = [
    { kind:'charge', player_id:'p1', charge_id:'c-ago', amount:500 }, { kind:'charge', player_id:'p1', charge_id:'c-oct', amount:500 },
    { kind:'charge', player_id:'p1', charge_id:'c-rec', amount:100 }, { kind:'registration', player_id:'p1', total:800, amount:500 },
    { kind:'income', player_id:'p1', category:'Arbitraje', concept:'Arbitraje', amount:150 }, { kind:'charge', player_id:'p2', charge_id:'h-oct', amount:400 }];
  revisa('[envío] cada concepto con su Tanner y su monto', JSON.stringify(prm.items) === JSON.stringify(esperado), JSON.stringify(prm.items));
  revisa('[envío] dos métodos que cuadran con el total', JSON.stringify(prm.methods) === JSON.stringify([{ method:'cash', amount:1000, reference:null }, { method:'transfer', amount:1150, reference:'SPEI 4455' }]), JSON.stringify(prm.methods));
  revisa('[envío] quién cobró sale del usuario, sin escribirlo', prm.player_id === 'p1' && prm.collected_by_name === 'Mich' && /^\d{4}-\d{2}-\d{2}$/.test(prm.payment_date), JSON.stringify({ q:prm.collected_by_name }));
  revisa('[envío] sin doble check: el botón ya dice cómo pagó', !(await p.evaluate(() => window.__confirmos)));

  await p.waitForTimeout(300); await foto(p, 'cobro-hecho');
  const hecho = await texto(p, '.cobro-hecho');
  revisa('[hecho] enseña total, folio y quién cobró', /\$2,150\.00/.test(hecho) && /Folio C-0009/.test(hecho) && /cobró Mich/.test(hecho), hecho.slice(0, 200));
  const wa = await p.getAttribute('.cobro-wa', 'href');
  revisa('[hecho] recibo por WhatsApp con lada y el desglose de los dos', wa.startsWith('https://wa.me/524771234567?text=') && /Liam%20Santos%20y%20Sof%C3%ADa%20Santos/.test(wa) && /Folio%20C-0009/.test(wa), wa.slice(0, 90));
  await p.click('.cobro-listo');
  await p.waitForSelector('#cobroSheet.hidden', { state:'attached', timeout:4000 });
  revisa('[hecho] al cerrar vuelve a pedir la cuenta y avisa el folio', (await llamadas(p, 'v2_player_account_statement')).length === 2 && /Folio C-0009/.test(await texto(p, '#cobroToast')));

  // Tocar un mes abre sólo ese mes, y se cobra en 1 toque más.
  await p.click('.tan-meses [data-cobrar="2026-08"]');
  await p.waitForSelector(hoja, { timeout:5000 });
  const delMes = await p.$$eval('[data-chip][aria-pressed="true"]', els => els.map(e => e.dataset.chip));
  revisa('[mes] tocar agosto abre el cobro sólo con agosto', JSON.stringify(delMes) === JSON.stringify(['c:c-ago']), JSON.stringify(delMes));
  await p.click('[data-chip="otro"]');
  await p.fill('[data-monto="otro"]', '200');
  await p.click('[data-pagar="transfer"]');
  revisa('[validación] otro ingreso pide categoría', /categoría/.test(await texto(p, '.pres-error')));
  await p.click('[data-quita="otro"]');
  await p.click('[data-pagar="transfer"]');
  await p.waitForSelector('.cobro-hecho', { timeout:4000 });
  const ult = (await llamadas(p, 'v2_collect_ticket')).at(-1).params;
  revisa('[mes] un toque en "Transferencia" cobra agosto por transferencia', JSON.stringify(ult.methods) === JSON.stringify([{ method:'transfer', amount:500, reference:null }]), JSON.stringify(ult.methods));
  await p.click('.cobro-listo');
  revisa('[cuenta] sin scroll horizontal', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await p.close();
}

/* ---------- Cuenta compartida (iPad) ---------- */
{
  const p = await abre(true, '/v2/tanner/?id=p1', 390, { display_name:'iPad', role:'Taquilla' });
  await p.waitForSelector('.tan-balance [data-cobrar]', { timeout:8000 });
  await p.click('.tan-balance [data-cobrar]');
  await p.waitForSelector(hoja, { timeout:5000 });
  revisa('[compartida] pregunta quién está cobrando', await p.isVisible('#cobroQuienNuevo'));
  revisa('[compartida] no sugiere nombres tecleados en el historial', !(await p.$('[data-quien]')));
  await p.click('[data-pagar="cash"]');
  revisa('[compartida] sin elegir quién cobra no se manda', (await llamadas(p, 'v2_collect_ticket')).length === 0 && /quién está cobrando/.test(await texto(p, '.pres-error')));
  await p.fill('#cobroQuienNuevo', 'Crespo');
  await p.click('[data-quien-listo]');
  revisa('[compartida] ya dice quién cobra, con opción de cambiar', /Cobra Crespo/.test(await texto(p, '.cobro-cobra')));
  await p.click('[data-pagar="cash"]');
  await p.waitForSelector('.pres-error', { timeout:4000 });
  await p.click('[data-pagar="cash"]');
  await p.waitForSelector('.cobro-hecho', { timeout:4000 });
  revisa('[compartida] el cobro lleva a Crespo', (await llamadas(p, 'v2_collect_ticket')).at(-1).params.collected_by_name === 'Crespo');
  await p.click('.cobro-listo');
  await p.click('.tan-balance [data-cobrar]');
  await p.waitForSelector(hoja, { timeout:5000 });
  revisa('[compartida] el aparato lo recuerda: ya no pregunta', !(await p.$('#cobroQuienNuevo')) && /Cobra Crespo/.test(await texto(p, '.cobro-cobra')));
  await p.close();
}

/* ---------- La cuenta de Presidencia la usa una sola persona ---------- */
{
  const p = await abre(true, '/v2/tanner/?id=p1', 390, { display_name:'Presidencia', role:'Presidencia' });
  await p.waitForSelector('.tan-balance [data-cobrar]', { timeout:8000 });
  await p.click('.tan-balance [data-cobrar]');
  await p.waitForSelector(hoja, { timeout:5000 });
  revisa('[presidencia] no pregunta quién cobra', !(await p.$('#cobroQuienNuevo')) && !(await p.$('.cobro-cobra')));
  await p.click('[data-pagar="cash"]'); await p.waitForSelector('.pres-error', { timeout:4000 });
  await p.click('[data-pagar="cash"]');
  await p.waitForSelector('.cobro-hecho', { timeout:4000 });
  revisa('[presidencia] el cobro queda a nombre de la cuenta', (await llamadas(p, 'v2_collect_ticket')).at(-1).params.collected_by_name === 'Presidencia');
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
  await p.waitForSelector('#cobroRapido:not(.hidden) #rapidoSearch', { timeout:8000 });
  revisa('[taquilla] lo primero es "¿A quién le cobras?"', /¿A quién le cobras\?/.test(await texto(p, '#cobroRapido')));
  await p.waitForSelector('#hoyEsperamos:not(.hidden) .hoy-chip', { timeout:5000 });
  const chips = await p.$$eval('#hoyEsperamos .hoy-chip', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  revisa('[hoy] "Hoy esperamos" con monto y cuándo (vencido incluido)', JSON.stringify(chips) === JSON.stringify(['Liam Santos$600.00 · hoy','Liam Santos$300.00 · vencido']), JSON.stringify(chips));
  const corte = await texto(p, '#miCorte');
  revisa('[corte] Mi corte de hoy: cobrado por método y efectivo a entregar', /Cobró \$2,300\.00/.test(corte) && /efectivo \$1,500\.00/.test(corte) && /\$1,300\.00\s*efectivo a entregar/.test(corte), corte);
  await foto(p, 'taquilla-arriba');
  await p.click('#hoyEsperamos .hoy-chip');
  await p.waitForSelector(hoja, { timeout:5000 });
  revisa('[hoy] tocar a quien esperamos abre su cobro', /Liam/.test(await texto(p, '#cobroTitle + p')));
  await p.click('#cobroBody [data-cobro-cerrar]');
  await p.fill('#rapidoSearch', 'Liam');
  await p.click('#rapidoResults .tsearch-opt');
  await p.waitForSelector(hoja, { timeout:5000 });
  revisa('[taquilla] escribir y tocar el nombre abre su hoja con lo que debe', /Liam Santos/.test(await texto(p, '#cobroTitle + p')) && (await p.$$('[data-chip][aria-pressed="true"]')).length === 3);
  await p.click('#cobroBody [data-cobro-cerrar]');
  revisa('[taquilla] el buscador queda limpio para el siguiente', await p.inputValue('#rapidoSearch') === '');

  await p.click('#openCollect');
  revisa('[taquilla] COBRAR › Tanner sólo pide el nombre', await p.isVisible('#collectPlayerSearch') && !(await p.isVisible('#collectAmount')) && !(await p.isVisible('#saveCollect')));
  revisa('[taquilla] sin campos que nadie usaba: método "Otro" e "Inscripción" en otro ingreso', !(await p.$('#collectMethod option[value="other"]')) && !(await p.$$eval('#generalCategory option', os => os.some(o => o.textContent === 'Inscripción'))));
  await p.fill('#collectPlayerSearch', 'Liam');
  await p.click('#collectPlayerResults .tsearch-opt');
  await p.waitForSelector(hoja, { timeout:5000 });
  revisa('[taquilla] elegir al Tanner abre su hoja y cierra el modal', !(await p.isVisible('#collectModal')));
  await p.click('#cobroBody [data-cobro-cerrar]');

  await p.click('#openCollect');
  await p.check('#collectSponsorMode');
  revisa('[taquilla] patrocinador: vuelve el formulario de siempre', await p.isVisible('#collectAmount') && await p.isVisible('#saveCollect') && await p.inputValue('#collectPayerType') === 'sponsor');
  revisa('[taquilla] cuenta personal: no se escribe quién cobró', !(await p.isVisible('#collectCollectedBy')));
  await p.click('#collectModal [data-close]');
  await p.click('#openExpense');
  revisa('[pagar] sin "Referencia" ni "¿Quién pagó?" a mano', !(await p.$('#expenseReference')) && !(await p.isVisible('#expensePaidBy')));
  await p.close();
}

await nav.close(); srv.close();
const fallas = revisiones.filter(r => !r.ok);
for (const r of revisiones) console.log(`${r.ok ? 'OK   ' : 'FALLA'} ${r.nombre}${r.ok || !r.detalle ? '' : ` · ${r.detalle}`}`);
for (const e of errores) console.log(`ERROR ${e}`);
console.log(`\n${revisiones.length - fallas.length}/${revisiones.length} revisiones${errores.length ? ` · ${errores.length} errores de página` : ''}`);
process.exit(fallas.length || errores.length ? 1 : 0);
