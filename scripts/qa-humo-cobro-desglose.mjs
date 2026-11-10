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
    { id:'c-rec', type:'late_fee', period:'2026-10-01', label:'Recargo oct', balance:100, sponsor:false, parent:{ due:'2026-10-05', balance:0, paidOn:'2026-10-06' } },
    { id:'c-pat', type:'monthly_fee', period:'2026-10-01', label:'Mensualidad oct', balance:500, sponsor:true }
  ],
  orders: [{ id:'o1', folio:'PED-0042', total:900, balance:350 }],
  tickets: { 'pay-1': { folio:7, ticket:'t7', parts:2 } },
  // h48: su mensualidad y qué meses ya tienen cargo. Noviembre no: se cobra por adelantado.
  today:'2026-10-28', monthly:{ fee:800, start:'2026-08-01', proration:'weekly_quarters', charged:['2026-08','2026-09','2026-10'] }
});
// Un Tanner que entra hoy (28): no debe nada y octubre aún no tiene cargo.
const COBRO_NUEVO = { canCollect:true, canOrders:true, prices:null, orders:[], tickets:{}, charges:[],
  today:'2026-10-28', monthly:{ fee:800, start:'2026-10-28', proration:'weekly_quarters', charged:[] } };
const COBRO_HERMANA = { canCollect:true, canOrders:true, prices:null, orders:[], tickets:{},
  charges: [{ id:'h-oct', type:'monthly_fee', period:'2026-10-01', label:'Mensualidad oct', balance:400, sponsor:false }] };

const revisiones = [], errores = [];
// FOTOS=<carpeta> guarda capturas para revisar el diseño a ojo.
const foto = async (p, n) => { if (process.env.FOTOS) await p.screenshot({ path:`${process.env.FOTOS}/${n}.png`, fullPage:false }); };
const revisa = (n, ok, d = '') => revisiones.push({ nombre:n, ok, detalle:d });
const nav = await chromium.launch({ executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });

async function abre(canCollect, ruta = '/v2/tanner/?id=p1', ancho = 390, usuario = { display_name:'Mich', role:'Presidencia' }, cobroDe = null) {
  const p = await nav.newPage({ viewport:{ width:ancho, height:844 } });
  p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
  await p.addInitScript(({ estado, cobro, hermana, usuario }) => {
    window.__llamadas = []; window.__fallaCobro = 1;
    window.tosConfirm = async () => { window.__confirmos = (window.__confirmos || 0) + 1; return true; };
    window.open = (u) => { window.__abierto = u; return null; };
    const m = ['cobranza','contabilidad','taquilla','jugadores','finanzas','tienda','estacionamiento'].map(c => ({ module_code:c, enabled:true, can_read:true, can_write:true }));
    const R = { v2_my_context:[{ user_id:'u1', display_name:usuario.display_name, organization_id:'o1', organization_name:'Tannery City FC', role:usuario.role, is_owner:true }],
                v2_my_navigation:m, v2_player_account_statement:estado, v2_player_change_history:[],
                // Parches (h78): Liam ya vivió su Iniciación y fue Campeón; falta entregar el de Campeón.
                v2_player_patches:{ canAward:true, canRevoke:true, types:[{ code:'iniciacion' }, { code:'campeones' }], awards:[
                  { id:'aw1', code:'iniciacion', name:'Parche de Iniciación Tanner', variant:'tanner', awardedOn:'2026-11-07', deliveredAt:'2026-11-07T20:00:00Z' },
                  { id:'aw2', code:'campeones', name:'Parche de Campeones', reason:'Copa León 2026', awardedOn:'2026-11-08', deliveredAt:null },
                  { id:'aw0', code:'campeones', name:'Parche de Campeones', reason:'Liga de Verano 2026', awardedOn:'2026-07-20', deliveredAt:'2026-07-20T20:00:00Z' }] },
                v2_mark_patch_delivered:{ id:'aw2', delivered:true },
                v2_player_family:[{ id:'p2', name:'Sofía Santos', birthDate:'2019-05-01', balance:400 }],
                v2_collect_ticket:{ ok:true, ticketId:'t9', folio:9, total:0, payments:['a','b','c'] },
                v2_waive_on_time_late_fees:{ waived:1, amount:100 },
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
  }, { estado:ESTADO, cobro:cobroDe || COBRO(canCollect), hermana:COBRO_HERMANA, usuario });
  await p.route('**/v2/supabase-client.js', r => r.fulfill({ status:200, contentType:'text/javascript', body:'export function createClient(){ return window.__fakeSupabase; }' }));
  await p.route('**/v2/photo-cache.js', r => r.fulfill({ status:200, contentType:'text/javascript',
    body:'export async function getSignedPhotoUrls(){return {};}export async function getSignedPhotoUrl(_c,_b,ruta){return String(ruta||"").includes("foto-prueba")?"data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22%3E%3Crect width=%2240%22 height=%2240%22 fill=%22%2330b45a%22/%3E%3C/svg%3E#"+ruta:null;}export async function getRawSignedPhotoUrl(){return null;}export async function clearPhotoCache(){}export function forgetPhoto(){}' }));
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PUERTO}${ruta}`, { waitUntil:'domcontentloaded' });
  return p;
}
const llamadas = (p, n) => p.evaluate(n => window.__llamadas.filter(l => l.n === n), n);
const texto = async (p, sel) => ((await p.textContent(sel)) || '').replace(/\s+/g, ' ');
const hoja = '#cobroSheet:not(.hidden) .cobro-form';
// "+ Agregar" abre la lista; de ahí se toca el concepto.
const abrePanel = async p => { if (!(await p.$('#cobroBody .cobro-panel'))) await p.click('#cobroBody [data-agregar]'); };
const agrega = async (p, k) => { await abrePanel(p); await p.click(`#cobroBody [data-chip="${k}"]`); };
const lineas = p => p.$$eval('#cobroBody [data-linea]', els => els.map(e => e.dataset.linea));

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
  const elegidos = await lineas(p);
  revisa('[hoja] propone todo lo que debe', JSON.stringify(elegidos) === JSON.stringify(['c:c-ago','c:c-oct','c:c-rec']), JSON.stringify(elegidos));
  revisa('[recargo] dice por qué: el mes ya está pagado, un día tarde', /Octubre ya está pagada \(pagó el 6, el límite era el 5\)/.test(await texto(p, '[data-linea="c:c-rec"]')), await texto(p, '[data-linea="c:c-rec"]'));
  await abrePanel(p); await foto(p, 'cobro-agregar');
  revisa('[agregar] el cargo de patrocinador no se ofrece', !(await p.$('[data-chip="c:c-pat"]')) && !(await p.$('[data-linea="c:c-pat"]')));
  revisa('[agregar] lo que ya va en el cobro no se repite en la lista', !(await p.$('.cobro-panel [data-chip="c:c-oct"]')));
  const nov = await texto(p, '[data-chip="m:p1:2026-11"]').catch(() => '');
  revisa('[agregar] ofrece noviembre por adelantado con su mensualidad', /Mensualidad nov/.test(nov) && /Por adelantado/.test(nov) && /\$800\.00/.test(nov), nov);
  revisa('[agregar] octubre ya tiene cargo: no se ofrece otra vez', !(await p.$('[data-chip="m:p1:2026-10"]')));
  revisa('[hoja] el total arranca en $1,100.00', /\$1,100\.00/.test(await texto(p, '#cobroTotal')));
  revisa('[hoja] ofrece el uniforme con su saldo', /Uniforme PED-0042.*\$350\.00/.test(await texto(p, '[data-chip="o:o1"]')));
  await p.click('#cobroBody [data-agregar]');
  revisa('[hoja] no pregunta quién cobra (cuenta personal)', !(await p.$('#cobroQuienNuevo')) && !(await p.$('.cobro-cobra')));
  revisa('[hoja] lo raro está escondido: sin nota ni referencia a la vista', !(await p.$('#cobroObs')) && !(await p.$('#cobroRef')));
  // La fecha va arriba, a la vista (08/11/2026): "me pagó el viernes en la noche".
  revisa('[fecha] arriba dice "Pagó Hoy"', /Pagó\s*Hoy/.test(await texto(p, '.cobro-fecha')) && await p.isVisible('#cobroFecha + *, .cobro-fecha'));
  // Un solo botón y un selector (08/11/2026): "menos botones, más Apple".
  revisa('[hoja] un solo botón que dice cuánto y cómo', (await p.$$('#cobroBody .pres-primary')).length === 1 && /Cobrar \$1,100\.00\s*en efectivo/.test(await texto(p, '#cobroEnviar')), await texto(p, '#cobroEnviar'));
  revisa('[hoja] sin ligas subrayadas: lo raro va en renglones', !(await p.$('#cobroBody .cobro-link')) && /Pagó con dos formas/.test(await texto(p, '.cobro-lista')) && /Referencia y nota/.test(await texto(p, '.cobro-lista')));
  await p.click('[data-metodo="transfer"]');
  revisa('[hoja] al elegir transferencia el botón lo dice', /en transferencia/.test(await texto(p, '#cobroEnviar')));
  await p.click('[data-metodo="cash"]');

  // Inscripción: Liam tiene 12 años, le toca Tanners ($800 en Costos).
  await agrega(p, 'reg:p1');
  revisa('[inscripción] propone $800 de Tanners por su edad', await p.inputValue('[data-total="reg:p1"]') === '800' && await p.inputValue('[data-monto="reg:p1"]') === '800');
  await p.click('[data-cat="baby"]');
  revisa('[inscripción] cambiar a Baby Tanners pone $500', await p.inputValue('[data-total="reg:p1"]') === '500');
  await p.click('[data-cat="tanner"]');
  await p.fill('[data-monto="reg:p1"]', '500');
  await agrega(p, 'arb');
  revisa('[inscripción] abonar dice cuánto queda a deber', /Queda a deber \$300\.00/.test(await texto(p, '[data-linea="reg:p1"]')));

  await p.click('#cobroEnviar');
  revisa('[validación] arbitraje sin monto no se manda', (await llamadas(p, 'v2_collect_ticket')).length === 0 && /arbitraje/i.test(await texto(p, '.pres-error')));
  await p.fill('[data-monto="arb"]', '150');
  revisa('[hoja] el total suma todo y los botones también: $1,750.00', /\$1,750\.00/.test(await texto(p, '#cobroTotal')) && /\$1,750\.00/.test(await texto(p, '#cobroEnviar')));

  // "Mensualidad" en Otro ingreso (10/11/2026): se cobra como la mensualidad
  // de verdad (aquí noviembre, porque ago y oct ya van), no como ingreso suelto.
  await agrega(p, 'otro');
  await p.fill('[data-monto="otro"]', '800');
  revisa('[otro] Mensualidad es la primera categoría', (await p.$$eval('[data-categoria="otro"] option', o => o.map(x => x.value)))[1] === 'Mensualidad');
  await p.selectOption('[data-categoria="otro"]', 'Mensualidad');
  await p.waitForSelector('[data-linea="m:p1:2026-11"]', { timeout:3000 });
  revisa('[otro] Mensualidad se vuelve la mensualidad de noviembre, con su monto', !(await p.$('[data-linea="otro"]')) && await p.inputValue('[data-monto="m:p1:2026-11"]') === '800' && /Se cobra como Mensualidad nov/.test(await texto(p, '.cobro-info')), await texto(p, '.cobro-info').catch(() => ''));
  await p.click('[data-quita="m:p1:2026-11"]');

  // Paga de más (08/11/2026): ya no se bloquea; se elige a dónde van.
  await p.fill('[data-monto="c:c-rec"]', '300');
  await p.press('[data-monto="c:c-rec"]', 'Tab');
  await p.waitForSelector('[data-linea="c:c-rec"] [data-extra]', { timeout:3000 });
  revisa('[de más] dice cuánto debe y cuánto es de más', /Debe \$100\.00 · \$200\.00 de más/.test(await texto(p, '[data-linea="c:c-rec"]')), await texto(p, '[data-linea="c:c-rec"]'));
  revisa('[de más] por omisión quedan a favor', await p.getAttribute('[data-linea="c:c-rec"] [data-extra="favor"]', 'aria-checked') === 'true');
  await p.click('[data-linea="c:c-rec"] [data-extra="otro"]');
  await p.click('#cobroEnviar');
  revisa('[de más] como otro concepto pide la categoría', (await llamadas(p, 'v2_collect_ticket')).length === 0 && /Elige a qué concepto van los \$200\.00 de más/.test(await texto(p, '.pres-error')), await texto(p, '.pres-error').catch(() => ''));
  await p.fill('[data-monto="c:c-rec"]', '100');
  await p.press('[data-monto="c:c-rec"]', 'Tab');
  revisa('[de más] al corregir el monto se va la pregunta', !(await p.$('[data-linea="c:c-rec"] [data-extra]')));

  // Hermana: un toque la agrega con lo que debe.
  await abrePanel(p);
  revisa('[hermanos] ofrece a la hermana con lo que debe', /Sofía.*\$400\.00/.test(await texto(p, '[data-hermano="p2"]')));
  await p.click('[data-hermano="p2"]');
  await p.waitForSelector('[data-linea="c:h-oct"]', { timeout:4000 });
  revisa('[hermanos] su mensualidad entra elegida y con su nombre', /Mensualidad oct · Sofía/.test(await texto(p, '[data-linea="c:h-oct"]')) && /Sofía Santos/.test(await texto(p, '#cobroBody')));
  revisa('[hermanos] el total ya la incluye: $2,150.00', /\$2,150\.00/.test(await texto(p, '#cobroTotal')));

  // Dos métodos: en "Más opciones"
  await p.click('#cobroBody [data-mas]');
  await p.click('[data-dos]');
  await p.fill('#cobroMonto1', '1000');
  revisa('[más] dos formas enseña el resto: $1,150.00 en transferencia', /\$1,150\.00/.test(await texto(p, '#cobroResto')) && await p.getAttribute('[data-metodo2="transfer"]', 'aria-pressed') === 'true');
  revisa('[más] el switch dice que está prendido', await p.getAttribute('[data-dos]', 'aria-checked') === 'true');
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
  const delMes = await lineas(p);
  revisa('[mes] tocar agosto abre el cobro sólo con agosto', JSON.stringify(delMes) === JSON.stringify(['c:c-ago']), JSON.stringify(delMes));
  await agrega(p, 'otro');
  await p.fill('[data-monto="otro"]', '200');
  await p.click('[data-metodo="transfer"]');
  await p.click('#cobroEnviar');
  revisa('[validación] otro ingreso pide categoría', /categoría/.test(await texto(p, '.pres-error')));
  await p.click('[data-quita="otro"]');
  await p.click('#cobroEnviar');
  await p.waitForSelector('.cobro-hecho', { timeout:4000 });
  const ult = (await llamadas(p, 'v2_collect_ticket')).at(-1).params;
  revisa('[mes] Transferencia + Cobrar cobra agosto por transferencia', JSON.stringify(ult.methods) === JSON.stringify([{ method:'transfer', amount:500, reference:null }]), JSON.stringify(ult.methods));
  await p.click('.cobro-listo');
  revisa('[cuenta] sin scroll horizontal', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await p.close();
}

/* ---------- Entra hoy (28/10/2026) ----------
   "Entra hoy y ya se acaba octubre: le cobro $200 de octubre, $800 de
   inscripción y ya paga noviembre." Tres toques y un folio. */
{
  const p = await abre(true, '/v2/tanner/?id=p1', 390, undefined, COBRO_NUEVO);
  await p.waitForSelector('.tan-balance [data-cobrar], .tan-balance', { timeout:8000 });
  await p.evaluate(async () => { const m = await import('/v2/cobro/hoja.js'); m.abrirCobro({ rpc: async (n, a) => (await window.__fakeSupabase.rpc(n, a)).data, org:'o1', playerId:'p1', nombre:'Martín Lozano', nacimiento:'2017-05-01' }); });
  await p.waitForSelector(hoja, { timeout:5000 });
  const arranca = await texto(p, '[data-linea="m:p1:2026-10"]').catch(() => '');
  revisa('[nuevo] arranca con octubre proporcional: entró el 28, 1 de 4 semanas, $200', await p.inputValue('[data-monto="m:p1:2026-10"]').catch(() => '') === '200' && /1 de 4 semanas/.test(arranca), arranca);
  await agrega(p, 'reg:p1');
  await agrega(p, 'm:p1:2026-11');
  revisa('[nuevo] noviembre entra completo, por adelantado', await p.inputValue('[data-monto="m:p1:2026-11"]') === '800');
  revisa('[nuevo] total $1,800.00 (200 + 800 + 800)', /\$1,800\.00/.test(await texto(p, '#cobroTotal')), await texto(p, '#cobroTotal'));
  await foto(p, 'cobro-nuevo');
  const cabe = await p.evaluate(() => document.getElementById('cobroSheet').scrollWidth <= document.getElementById('cobroSheet').clientWidth + 1);
  revisa('[nuevo] nada se sale a lo ancho', cabe);
  await p.click('#cobroEnviar');
  await p.waitForSelector('.cobro-hecho', { timeout:4000 });
  const it = (await llamadas(p, 'v2_collect_ticket')).at(-1).params.items;
  revisa('[nuevo] se manda octubre y noviembre como mensualidades nuevas, más la inscripción', JSON.stringify(it) === JSON.stringify([
    { kind:'month', player_id:'p1', period:'2026-10-01', total:200, amount:200 },
    { kind:'registration', player_id:'p1', total:800, amount:800 },
    { kind:'month', player_id:'p1', period:'2026-11-01', total:800, amount:800 }]), JSON.stringify(it));
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
  await p.click('#cobroEnviar');
  revisa('[compartida] sin elegir quién cobra no se manda', (await llamadas(p, 'v2_collect_ticket')).length === 0 && /quién está cobrando/.test(await texto(p, '.pres-error')));
  await p.fill('#cobroQuienNuevo', 'Crespo');
  await p.click('[data-quien-listo]');
  revisa('[compartida] ya dice quién cobra, con opción de cambiar', /Cobra Crespo/.test(await texto(p, '.cobro-cobra')));
  await p.click('#cobroEnviar');
  await p.waitForSelector('.pres-error', { timeout:4000 });
  await p.click('#cobroEnviar');
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
  await p.click('#cobroEnviar'); await p.waitForSelector('.pres-error', { timeout:4000 });
  await p.click('#cobroEnviar');
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
  revisa('[taquilla] "Cotizar" lleva a la calculadora en modo staff', (await p.getAttribute('#cobroRapido .cotizar-link', 'href')) === '/costos/?para=familia');
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
  revisa('[taquilla] escribir y tocar el nombre abre su hoja con lo que debe', /Liam Santos/.test(await texto(p, '#cobroTitle + p')) && (await lineas(p)).length === 3);
  await p.click('#cobroBody [data-cobro-cerrar]');
  revisa('[taquilla] el buscador queda limpio para el siguiente', await p.inputValue('#rapidoSearch') === '');

  await p.click('#openCollect');
  revisa('[taquilla] COBRAR abre "¿Qué vas a cobrar?": buscar al Tanner y tarjetas, sin botón de enviar', await p.isVisible('#collectPlayerSearch') && /¿Qué vas a cobrar\?/.test(await texto(p, '#collectTitle'))
    && !(await p.isVisible('#collectAmount')) && !(await p.isVisible('#saveCollect')) && !(await p.isVisible('#collectVolver')));
  await p.setViewportSize({ width:390, height:844 }); await p.waitForTimeout(250); await foto(p, 'cobrar-inicio'); await p.setViewportSize({ width:1280, height:844 });
  const tarjetas = await p.$$eval('.cobrar-opciones button', bs => bs.filter(b => b.offsetParent).map(b => b.querySelector('b').textContent));
  revisa('[taquilla] tarjetas: Tienda, Estacionamiento y Otro ingreso', JSON.stringify(tarjetas) === JSON.stringify(['Tienda','Estacionamiento','Otro ingreso']), JSON.stringify(tarjetas));
  await p.click('.cobrar-opciones [data-mode="general"]');
  revisa('[taquilla] una tarjeta abre su formulario con título y "‹"', /Otro ingreso/.test(await texto(p, '#collectTitle')) && await p.isVisible('#collectVolver') && await p.isVisible('#generalAmount') && !(await p.isVisible('.cobrar-opciones')));
  await p.click('#collectVolver');
  revisa('[taquilla] "‹" regresa a ¿Qué vas a cobrar?', /¿Qué vas a cobrar\?/.test(await texto(p, '#collectTitle')) && await p.isVisible('.cobrar-opciones'));
  revisa('[taquilla] sin campos que nadie usaba: método "Otro" e "Inscripción" en otro ingreso', !(await p.$('#collectMethod option[value="other"]')) && !(await p.$$eval('#generalCategory option', os => os.some(o => o.textContent === 'Inscripción'))));
  await p.fill('#collectPlayerSearch', 'Liam');
  await p.click('#collectPlayerResults .tsearch-opt');
  await p.waitForSelector(hoja, { timeout:5000 });
  revisa('[taquilla] elegir al Tanner abre su hoja y cierra el modal', !(await p.isVisible('#collectModal')));
  await p.click('#cobroBody [data-cobro-cerrar]');

  await p.click('#openCollect');
  await p.click('#collectSponsorLink');
  revisa('[taquilla] patrocinador: vuelve el formulario de siempre', await p.isVisible('#collectAmount') && await p.isVisible('#saveCollect') && await p.inputValue('#collectPayerType') === 'sponsor');
  revisa('[taquilla] cuenta personal: no se escribe quién cobró', !(await p.isVisible('#collectCollectedBy')));
  await p.click('#collectModal [data-close]');
  await p.click('#openExpense');
  revisa('[pagar] sin "Referencia" ni "¿Quién pagó?" a mano', !(await p.$('#expenseReference')) && !(await p.isVisible('#expensePaidBy')));
  await p.close();
}

/* ---------- Paga de más y otro día (08/11/2026) ----------
   "Me pagó 800 y sólo debe 500"; "me pagó el viernes en la noche". */
{
  const p = await abre(true);
  await p.waitForSelector('.tan-balance [data-cobrar]', { timeout:8000 });
  await p.click('.tan-balance [data-cobrar]');
  await p.waitForSelector(hoja, { timeout:5000 });
  await p.fill('#cobroFecha', '2026-11-06');
  await p.waitForFunction(() => !/Hoy/.test(document.querySelector('.cobro-fecha')?.textContent || ''), null, { timeout:3000 });
  revisa('[otro día] la fecha elegida se ve arriba y avisa del recargo', /6 de nov/.test(await texto(p, '.cobro-fecha')) && /recargo se quita solo/.test(await texto(p, '.cobro-fecha')), await texto(p, '.cobro-fecha'));
  await p.fill('[data-monto="c:c-oct"]', '800');
  await p.press('[data-monto="c:c-oct"]', 'Tab');
  await p.waitForSelector('[data-linea="c:c-oct"] [data-extra]', { timeout:3000 });
  await p.click('#cobroEnviar');
  await p.waitForSelector('.pres-error, .cobro-hecho', { timeout:4000 });
  if (await p.$('.pres-error')) await p.click('#cobroEnviar');
  await p.waitForSelector('.cobro-hecho', { timeout:4000 });
  const prm = (await llamadas(p, 'v2_collect_ticket')).at(-1)?.params || {};
  revisa('[de más] el cargo se cubre y lo demás queda a favor', JSON.stringify(prm.items.filter(i => i.charge_id === 'c-oct' || i.kind === 'abono')) === JSON.stringify([{ kind:'charge', player_id:'p1', charge_id:'c-oct', amount:500 }, { kind:'abono', player_id:'p1', amount:300 }]), JSON.stringify(prm.items));
  revisa('[otro día] se manda la fecha elegida', prm.payment_date === '2026-11-06', prm.payment_date);
  revisa('[recargo] después del cobro revisa si pagó a tiempo', (await llamadas(p, 'v2_waive_on_time_late_fees')).some(l => l.params.player_id === 'p1'));
  revisa('[recargo] el recibo dice que se quitó', /Se quitó el recargo de \$100\.00/.test(await texto(p, '.cobro-hecho')), await texto(p, '.cobro-hecho'));
  revisa('[recibo] separa lo cobrado de lo que queda a favor', /A favor/.test(await texto(p, '.cobro-recibo')), await texto(p, '.cobro-recibo'));
  await foto(p, 'cobro-de-mas');
  await p.close();
}

/* ---------- La cara del Tanner y un cobro que se entiende (09/11/2026) ----------
   Presidencia: "a veces siento que me cobran cosas que no entiendo" (el caso de
   Isabella: octubre abonado tarde, noviembre sin pagar, dos recargos), y "que
   salga una miniatura de la cara del Tanner... si le picas se pueda ver grande". */
{
  const ISA = { canCollect:true, canOrders:true, prices:null, orders:[], monthly:{ fee:550 }, charges:[
    { id:'i-oct', type:'monthly_fee', period:'2026-10-01', label:'Mensualidad oct', balance:350, amount:550, paid:200, paidOn:'2026-10-06', sponsor:false },
    { id:'i-roct', type:'late_fee', period:'2026-10-01', label:'Recargo oct', balance:100, sponsor:false, parent:{ due:'2026-10-05', balance:350, paidOn:'2026-10-06' } },
    { id:'i-nov', type:'monthly_fee', period:'2026-11-01', label:'Mensualidad nov', balance:550, sponsor:false },
    { id:'i-rnov', type:'late_fee', period:'2026-11-01', label:'Recargo nov', balance:100, sponsor:false, parent:{ due:'2026-11-05', balance:550, paidOn:null } } ] };
  const antes = { ...ESTADO.player };
  Object.assign(ESTADO.player, { photo_bucket:'tanneros-private', photo_path:'p1/foto-prueba-grande.jpg', photo_thumb_path:'p1/foto-prueba-chica.webp' });
  const p = await abre(true, '/v2/tanner/?id=p1', 390, undefined, ISA);
  ESTADO.player = antes;
  await p.waitForSelector('.tan-balance [data-cobrar]', { timeout:8000 });
  await p.click('.tan-balance [data-cobrar]');
  await p.waitForSelector(hoja, { timeout:5000 });
  await p.waitForSelector('#cobroBody .cobro-cara img', { timeout:4000 }).catch(() => {});
  revisa('[cara] la hoja enseña la cara del Tanner que paga', /foto-prueba-chica/.test(await p.getAttribute('#cobroBody .cobro-cara img', 'src').catch(() => '') || ''));
  const notas = await p.$$eval('#cobroBody .cobro-linea', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  revisa('[claro] el recargo de octubre dice qué pasó: abonó tarde y quedó saldo', notas.some(t => /Recargo oct/.test(t) && /Abonó el 6, después del día 5, y quedó saldo/.test(t)), JSON.stringify(notas));
  revisa('[claro] el de noviembre dice que no se pagó antes del día 5', notas.some(t => /Recargo nov/.test(t) && /Noviembre no se pagó antes del día 5/.test(t)), JSON.stringify(notas));
  revisa('[claro] el total separa mensualidades y recargos', /\$900\.00 \+ \$200\.00 de recargos/.test(await texto(p, '.cobro-total')) && /\$1,100\.00/.test(await texto(p, '.cobro-total')), await texto(p, '.cobro-total'));
  const grupos = await p.$$eval('#cobroBody .cobro-mes-tit', g => g.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  revisa('[mes] agrupado por mes, cada uno con lo que suma', JSON.stringify(grupos) === '["Octubre$450.00","Noviembre$650.00"]', JSON.stringify(grupos));
  revisa('[mes] octubre dice de cuánto era y cuánto ya abonó', notas.some(t => /Mensualidad oct/.test(t) && /De \$550\.00 · ya abonó \$200\.00 el 6 oct/.test(t)), JSON.stringify(notas));
  revisa('[mes] noviembre (sin abonos) no lleva esa nota', !notas.some(t => /Mensualidad nov/.test(t) && /ya abonó/.test(t)));
  await p.fill('[data-monto="c:i-oct"]', '200'); await p.press('[data-monto="c:i-oct"]', 'Tab');
  revisa('[mes] al cambiar un monto, el subtotal del mes cambia', /Octubre\$300\.00/.test((await texto(p, '#cobroBody .cobro-mes[data-mes="2026-10"] .cobro-mes-tit')).replace(/\s+/g, ' ')), await texto(p, '#cobroBody .cobro-mes[data-mes="2026-10"] .cobro-mes-tit'));
  await p.fill('[data-monto="c:i-oct"]', '350'); await p.press('[data-monto="c:i-oct"]', 'Tab');
  await p.click('[data-quita="c:i-rnov"]');
  revisa('[claro] al quitar un recargo el desglose se actualiza', /\$900\.00 \+ \$100\.00 de recargo(?!s)/.test(await texto(p, '.cobro-total')), await texto(p, '.cobro-total'));
  await foto(p, 'cobro-cara');
  await p.click('#cobroBody .cobro-cara');
  await p.waitForSelector('#cobroCaraGrande img', { timeout:3000 }).catch(() => {});
  revisa('[cara] al tocarla se ve grande, con la foto completa y su nombre', /foto-prueba-grande/.test(await p.getAttribute('#cobroCaraGrande img', 'src').catch(() => '') || '') && /Liam Santos/.test(await texto(p, '#cobroCaraGrande')));
  await foto(p, 'cobro-cara-grande');
  await p.click('#cobroCaraGrande');
  revisa('[cara] un toque la cierra y la hoja sigue abierta', !(await p.$('#cobroCaraGrande')) && !!(await p.$(hoja)));
  revisa('[cara] no pide la cuenta otra vez sólo por la foto (ya venía en la pantalla)', (await llamadas(p, 'v2_player_account_statement')).length === 1);
  await p.close();
}
{ // Sin foto: iniciales, y el botón no abre nada.
  const p = await abre(true, '/v2/tanner/?id=p1', 390);
  await p.waitForSelector('.tan-balance [data-cobrar]', { timeout:8000 });
  await p.click('.tan-balance [data-cobrar]');
  await p.waitForSelector(hoja, { timeout:5000 });
  revisa('[cara] sin foto se ven sus iniciales', (await texto(p, '#cobroBody .cobro-cara')).trim() === 'LS' && await p.$eval('#cobroBody .cobro-cara', b => b.disabled));
  await p.close();
}

{ // Parches en el perfil del Tanner (09/11/2026).
  const p = await abre(true);
  await p.waitForSelector('#tanParches .par-item', { timeout:8000 });
  const items = await p.$$eval('#tanParches .par-item', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  revisa('[parches] el perfil enseña sus parches con fecha y de qué fue', items.length === 3 && /Iniciación/.test(items[0]) && /Tanner · 7 nov 2026/.test(items[0]) && /Campeón/.test(items[1]) && /Copa León 2026/.test(items[1]), JSON.stringify(items));
  revisa('[parches] el de Campeón usa el arte oficial (sin número)', /campeon-azul-sin-numero\.png/.test(await p.getAttribute('#tanParches .par-item:nth-child(2) img', 'src') || ''));
  const nums = await p.$$eval('#tanParches .par-item', l => l.map(x => [x.querySelector('small')?.textContent || '', x.querySelector('.par-num')?.textContent || '']));
  revisa('[parches] el número va cambiando, como la Champions: Verano 2026 es el 1, Copa León el 2', nums.some(([t, n]) => /Liga de Verano/.test(t) && n === '1') && nums.some(([t, n]) => /Copa León/.test(t) && n === '2') && !nums.some(([t, n]) => /Tanner ·/.test(t) && n), JSON.stringify(nums));
  revisa('[parches] dice cuál falta entregar', /Entregado/.test(items[0]) && /Marcar entregado/.test(items[1]));
  await p.click('[data-par-entregar="aw2"]');
  await p.waitForTimeout(300);
  revisa('[parches] Marcar entregado lo registra', (await llamadas(p, 'v2_mark_patch_delivered')).some(l => l.params.award_id === 'aw2'));
  await foto(p, 'tanner-parches');
  await p.close();
}

await nav.close(); srv.close();
const fallas = revisiones.filter(r => !r.ok);
for (const r of revisiones) console.log(`${r.ok ? 'OK   ' : 'FALLA'} ${r.nombre}${r.ok || !r.detalle ? '' : ` · ${r.detalle}`}`);
for (const e of errores) console.log(`ERROR ${e}`);
console.log(`\n${revisiones.length - fallas.length}/${revisiones.length} revisiones${errores.length ? ` · ${errores.length} errores de página` : ''}`);
process.exit(fallas.length || errores.length ? 1 : 0);
