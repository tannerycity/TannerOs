/* ACUERDOS DE PAGO Y SEGUIMIENTO EN EL ESTADO DE CUENTA.
 *
 * Pedido (21/10/2026): "que ahí mismo en esa pantalla podamos llegar a los
 * acuerdos de pago, que la cobranza ahí sea rápida". Sólo Presidencia pacta;
 * mientras se cumple no hay recargo.
 *
 * Esta prueba levanta /tanner/ REAL con un Supabase falso y revisa:
 *   · Presidencia ve "Acuerdo de pago" si debe y no tiene uno vigente;
 *   · la hoja propone el saldo en 3 pagos cada 15 días, se puede cambiar a
 *     una fecha, a menos pagos o a cada mes; si los pagos no suman el total
 *     no se manda; lo que se manda lleva fechas, montos, nota y llave;
 *   · al guardar ofrece mandarlo por WhatsApp y queda anotado;
 *   · acuerdo activo: avance, cada pago con su estado, "sin recargo"; rehacer
 *     manda replace_open; cancelar pide motivo;
 *   · acuerdo incumplido: lo dice y avisa por WhatsApp que se venció;
 *   · WhatsApp: mensajes listos con lada 52 y cada envío queda anotado;
 *   · seguimiento: anotar llamada / en persona / nota con un toque;
 *   · quien no es Presidencia no pacta ni cancela, pero sí anota.
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
  player: { id:'p1', first_name:'Liam', last_name:'Santos', status:'active', category:'T12', guardians:[{ name:'Mamá', phone:'477 123 4567', primary:true }] },
  summary: { balance: 1100, paid_total: 0, credit_available: 0, credit_held: 0, by_type:[{type:'monthly_fee',pending:1100}] },
  ledger: [{ id:'c-oct', date:'2026-10-05', kind:'charge', subtype:'monthly_fee', amount:1100, charge_balance:1100, period:'2026-10-01', running_balance:1100 }],
  other_payments: [], documents: [], orders: [], academies: []
};
const ACUERDO = (state) => ({ id:'a1', state, total:1600, paid:600, remaining:1000, note:'Paga en quincenas', createdAt:'2026-10-21T15:00:00Z', createdBy:'Mich',
  installments:[{ seq:1, due:'2026-10-26', amount:600, state:'paid' }, { seq:2, due:'2026-11-10', amount:1000, state: state === 'broken' ? 'late' : 'pending' }],
  next:{ seq:2, due:'2026-11-10', amount:1000 } });
const COBRO = ({ canAgree = true, canNote = true, agreement = null, notes = [] } = {}) => ({
  canCollect:true, canOrders:true, canAgree, canNote, today:'2026-10-21', prices:null, tickets:{}, orders:[],
  charges:[{ id:'c-oct', type:'monthly_fee', period:'2026-10-01', label:'Mensualidad oct', balance:1100, sponsor:false }],
  agreement, notes });

const revisiones = [], errores = [];
// FOTOS=<carpeta> guarda capturas para revisar el diseño a ojo.
const foto = async (p, n) => { if (process.env.FOTOS) await p.screenshot({ path:`${process.env.FOTOS}/${n}.png`, fullPage:false }); };
const revisa = (n, ok, d = '') => revisiones.push({ nombre:n, ok, detalle:d });
const nav = await chromium.launch({ executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });

async function abre(cobro, acuerdoAlGuardar = null, ruta = '/v2/tanner/?id=p1', ancho = 390) {
  const p = await nav.newPage({ viewport:{ width:ancho, height:844 } });
  p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
  await p.addInitScript(({ estado, cobro, acuerdoAlGuardar }) => {
    window.__llamadas = []; window.__cobro = cobro; window.__abiertos = [];
    window.open = (u) => { window.__abiertos.push(u); return null; };
    const m = ['cobranza','contabilidad','taquilla','jugadores'].map(c => ({ module_code:c, enabled:true, can_read:true, can_write:true }));
    const R = { v2_my_context:[{ user_id:'u1', display_name:'Mich', organization_id:'o1', organization_name:'Tannery City FC', role:'Presidencia', is_owner:true }],
                v2_my_navigation:m, v2_player_account_statement:estado, v2_player_change_history:[],
                v2_cashier_snapshot:{ businessDate:'2026-10-21', incomeTotal:0, expenseTotal:0, netTotal:0, expectedCash:0, cashTodayNet:0, methods:[], movements:[], canViewLedger:true },
                v2_billing_players:[{ player_id:'p1', player_name:'Liam Santos', base_monthly_fee:500 }, { player_id:'p2', player_name:'Ana Ruiz', base_monthly_fee:500 }, { player_id:'p3', player_name:'Beto Paz', base_monthly_fee:500 }],
                v2_agreements_overview:[{ playerId:'p1', state:'active', paid:600, total:1600, nextDue:'2026-11-10', nextAmount:1000 }, { playerId:'p2', state:'broken', paid:0, total:900, nextDue:'2026-10-15', nextAmount:450 }],
                v2_open_receivables:[], v2_orders_to_collect:[], v2_payments_to_reconcile:[] };
    window.__fakeSupabase = {
      auth:{ getSession:async()=>({data:{session:{user:{id:'u1'}}}}), getUser:async()=>({data:{user:{id:'u1'}}}), onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}) },
      rpc:async(n, params)=>{
        window.__llamadas.push({ n, params });
        if (n === 'v2_player_collection') return { data:window.__cobro, error:null };
        if (n === 'v2_create_payment_agreement') { if (acuerdoAlGuardar) window.__cobro = { ...window.__cobro, agreement:acuerdoAlGuardar }; return { data:{ ok:true, agreementId:'a9' }, error:null }; }
        if (n === 'v2_add_collection_note') { window.__cobro = { ...window.__cobro, notes:[{ id:'n'+Date.now(), kind:params.kind, body:params.body, by:'Mich', at:new Date().toISOString() }, ...(window.__cobro.notes||[])] }; return { data:{ ok:true }, error:null }; }
        if (n === 'v2_cancel_payment_agreement') return { data:{ ok:true }, error:null };
        return { data:R[n] ?? null, error:null };
      },
      channel:()=>({ on(){return this;}, subscribe(){return this;} }), removeChannel(){}
    };
  }, { estado:ESTADO, cobro, acuerdoAlGuardar });
  await p.route('**/v2/supabase-client.js', r => r.fulfill({ status:200, contentType:'text/javascript', body:'export function createClient(){ return window.__fakeSupabase; }' }));
  await p.route('**/v2/photo-cache.js', r => r.fulfill({ status:200, contentType:'text/javascript',
    body:'export async function getSignedPhotoUrls(){return {};}export async function getSignedPhotoUrl(){return null;}export async function getRawSignedPhotoUrl(){return null;}export async function clearPhotoCache(){}export function forgetPhoto(){}' }));
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:${PUERTO}${ruta}`, { waitUntil:'domcontentloaded' });
  if (ruta.includes('tanner')) await p.waitForSelector('.tan-balance', { timeout:8000 });
  return p;
}
const llamadas = (p, n) => p.evaluate(n => window.__llamadas.filter(l => l.n === n), n);
const texto = async (p, sel) => ((await p.textContent(sel)) || '').replace(/\s+/g, ' ');
const filas = p => p.$$eval('.cb-fila', els => els.map(e => `${e.querySelector('[data-fila-fecha]').value}=${e.querySelector('[data-fila-monto]').value}`));

/* ---------- Pactar un acuerdo ---------- */
{
  const p = await abre(COBRO(), ACUERDO('active'));
  revisa('[pactar] Presidencia ve "Acuerdo de pago"', await p.isVisible('.tan-balance [data-acuerdo="nuevo"]'));
  revisa('[pactar] sin acuerdo no hay tarjeta de acuerdo', !(await p.$('.tan-acuerdo')));
  await p.click('.tan-balance [data-acuerdo="nuevo"]');
  await p.waitForSelector('#cbSheet:not(.hidden) .cb-form');
  revisa('[hoja] propone el saldo en 3 pagos cada 15 días, el primero en una semana',
    JSON.stringify(await filas(p)) === JSON.stringify(['2026-10-28=366.66','2026-11-12=366.66','2026-11-27=366.68']), JSON.stringify(await filas(p)));
  await p.waitForTimeout(300); await foto(p, 'acuerdo-hoja');
  await p.click('[data-n="-1"]');
  revisa('[hoja] con un pago menos: 2 de $550', JSON.stringify(await filas(p)) === JSON.stringify(['2026-10-28=550','2026-11-12=550']), JSON.stringify(await filas(p)));
  await p.selectOption('[data-campo="frecuencia"]', 'mensual');
  revisa('[hoja] cada mes', JSON.stringify(await filas(p)) === JSON.stringify(['2026-10-28=550','2026-11-28=550']), JSON.stringify(await filas(p)));
  await p.click('[data-modo="fecha"]');
  revisa('[hoja] "Paga en una fecha" deja un solo pago por todo', JSON.stringify(await filas(p)) === JSON.stringify(['2026-10-28=1100']), JSON.stringify(await filas(p)));
  await p.click('[data-modo="pagos"]');
  await p.fill('[data-fila-monto="1"]', '500');
  revisa('[hoja] avisa que no cuadra', /no cuadra con \$1,100\.00/.test(await texto(p, '#cbSuma')));
  await p.click('#cbBody .pres-primary');
  revisa('[validación] si no suman el total no se manda', (await llamadas(p, 'v2_create_payment_agreement')).length === 0 && /suman \$1,050\.00/.test(await texto(p, '.pres-error')));
  await p.fill('[data-fila-monto="1"]', '550');
  await p.fill('[data-fila-fecha="1"]', '2026-10-20');
  await p.click('#cbBody .pres-primary');
  revisa('[validación] no deja fechas que ya pasaron', (await llamadas(p, 'v2_create_payment_agreement')).length === 0 && /ya pasó/.test(await texto(p, '.pres-error')));
  await p.fill('[data-fila-fecha="1"]', '2026-11-28');
  await p.fill('[data-campo="nota"]', 'Paga en quincenas');
  await p.click('#cbBody .pres-primary');
  await p.waitForSelector('#cbBody .cobro-hecho', { timeout:4000 });
  const c = (await llamadas(p, 'v2_create_payment_agreement'))[0]?.params || {};
  revisa('[envío] fechas, montos, nota y llave', JSON.stringify(c.installments) === JSON.stringify([{ due_date:'2026-10-28', amount:550 }, { due_date:'2026-11-28', amount:550 }])
    && c.note === 'Paga en quincenas' && c.replace_open === false && String(c.idempotency_key).length >= 8 && c.player_id === 'p1', JSON.stringify(c));
  await p.click('#cbBody [data-wa-clave="acuerdo"]');
  const wa = await p.evaluate(() => window.__abiertos.at(-1) || '');
  revisa('[hecho] lo manda por WhatsApp con lada y los pagos', wa.startsWith('https://wa.me/524771234567?text=') && /confirmamos%20el%20acuerdo/.test(wa) && /10%20nov/.test(wa), wa.slice(0, 90));
  await p.waitForTimeout(200);
  const nota = (await llamadas(p, 'v2_add_collection_note'))[0]?.params || {};
  revisa('[hecho] el envío queda anotado en el seguimiento', nota.kind === 'whatsapp' && nota.body === 'WhatsApp: Confirmar el acuerdo', JSON.stringify(nota));
  await p.waitForSelector('.tan-acuerdo', { timeout:4000 });
  revisa('[hecho] la tarjeta del acuerdo aparece sin recargar a mano', /Acuerdo activo/.test(await texto(p, '.tan-acuerdo')));
  revisa('[pactar] sin scroll horizontal', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await p.close();
}

/* ---------- Acuerdo activo ---------- */
{
  const p = await abre(COBRO({ agreement:ACUERDO('active'), notes:[{ id:'n1', kind:'call', body:'Llamé a la mamá, paga el viernes', by:'Zul', at:'2026-10-20T18:00:00Z' }] }));
  await p.$eval('.tan-acuerdo', e => e.scrollIntoView()); await foto(p, 'acuerdo-activo');
  await p.$eval('.tan-seguimiento', e => e.scrollIntoView()); await foto(p, 'seguimiento');
  const t = await texto(p, '.tan-acuerdo');
  revisa('[activo] avance y próximo pago', /\$600\.00 de \$1,600\.00/.test(t) && /Próximo pago: \$1,000\.00 el 10 nov/.test(t) && /Sin recargo mientras cumpla/.test(t), t.slice(0, 200));
  revisa('[activo] cada pago con su estado', JSON.stringify(await p.$$eval('.tan-pagos li', els => els.map(e => e.dataset.state))) === JSON.stringify(['paid','pending']));
  revisa('[activo] quién lo pactó y la nota', /Pactado por Mich/.test(t) && /Paga en quincenas/.test(t));
  revisa('[activo] ya no ofrece "Acuerdo de pago" (hay uno vigente)', !(await p.$('.tan-balance [data-acuerdo="nuevo"]')));
  revisa('[seguimiento] enseña la llamada con quién', /Llamé a la mamá, paga el viernes/.test(await texto(p, '.tan-seguimiento')) && /Zul/.test(await texto(p, '.tan-seguimiento')));

  await p.click('.tan-acuerdo [data-acuerdo="rehacer"]');
  await p.waitForSelector('#cbSheet:not(.hidden) .cb-form');
  revisa('[rehacer] la hoja dice "Rehacer acuerdo"', /Rehacer acuerdo/.test(await texto(p, '#cbTitle')));
  await p.click('#cbBody .pres-primary');
  await p.waitForSelector('#cbBody .cobro-hecho', { timeout:4000 });
  revisa('[rehacer] manda replace_open', (await llamadas(p, 'v2_create_payment_agreement'))[0]?.params.replace_open === true);
  await p.click('#cbBody .cobro-listo');

  await p.click('.tan-acuerdo [data-acuerdo="cancelar"]');
  await p.click('#cbBody .pres-primary');
  revisa('[cancelar] sin motivo no se manda', (await llamadas(p, 'v2_cancel_payment_agreement')).length === 0 && await p.isVisible('#cbBody .pres-error'));
  await p.fill('[data-campo="motivo"]', 'La familia pagó todo junto');
  await p.click('#cbBody .pres-primary');
  await p.waitForSelector('#cbSheet.hidden', { state:'attached', timeout:4000 });
  const cc = (await llamadas(p, 'v2_cancel_payment_agreement'))[0]?.params || {};
  revisa('[cancelar] manda el acuerdo y el motivo', cc.agreement_id === 'a1' && cc.reason === 'La familia pagó todo junto', JSON.stringify(cc));

  // WhatsApp: mensajes listos
  await p.click('.tan-balance [data-wa-menu]');
  await p.waitForSelector('#cbBody .cb-mensaje');
  await p.waitForTimeout(300); await foto(p, 'whatsapp-menu');
  const titulos = await p.$$eval('#cbBody .cb-mensaje strong', els => els.map(e => e.textContent));
  revisa('[whatsapp] recordatorio, acuerdo y próximo pago', JSON.stringify(titulos) === JSON.stringify(['Recordatorio de pago','Confirmar el acuerdo','Avisar el próximo pago']), JSON.stringify(titulos));
  await p.click('#cbBody [data-wa-clave="recordatorio"]');
  const wa = await p.evaluate(() => window.__abiertos.at(-1) || '');
  revisa('[whatsapp] el recordatorio dice el saldo y el club', /saldo%20pendiente%20de%20%241%2C100\.00/.test(wa) && /Tannery/.test(wa), wa.slice(0, 120));
  await p.waitForTimeout(200);
  revisa('[whatsapp] queda anotado', (await llamadas(p, 'v2_add_collection_note')).some(l => l.params.body === 'WhatsApp: Recordatorio de pago'));

  // Seguimiento: en persona
  await p.click('.tan-seguimiento [data-nota-tipo="visit"]');
  await p.click('.tan-seguimiento button[type="submit"]');
  revisa('[seguimiento] vacío no se manda', !(await llamadas(p, 'v2_add_collection_note')).some(l => l.params.kind === 'visit'));
  await p.fill('[data-nota-texto]', 'Vino el papá, paga el 10');
  await p.click('.tan-seguimiento button[type="submit"]');
  await p.waitForFunction(() => /Vino el papá/.test(document.querySelector('.tan-seguimiento')?.textContent || ''), null, { timeout:4000 });
  const v = (await llamadas(p, 'v2_add_collection_note')).find(l => l.params.kind === 'visit')?.params || {};
  revisa('[seguimiento] anota "en persona" con el texto', v.body === 'Vino el papá, paga el 10', JSON.stringify(v));
  await p.close();
}

/* ---------- Acuerdo incumplido ---------- */
{
  const p = await abre(COBRO({ agreement:ACUERDO('broken') }));
  const t = await texto(p, '.tan-acuerdo');
  revisa('[incumplido] lo dice y avisa que vuelve el recargo', /Acuerdo incumplido/.test(t) && /El recargo vuelve a aplicar/.test(t), t.slice(0, 160));
  revisa('[incumplido] el pago vencido se marca', JSON.stringify(await p.$$eval('.tan-pagos li', els => els.map(e => e.dataset.state))) === JSON.stringify(['paid','late']));
  await p.click('.tan-acuerdo [data-wa-clave="incumplido"]');
  const wa = await p.evaluate(() => window.__abiertos.at(-1) || '');
  revisa('[incumplido] avisa por WhatsApp que quedó pendiente', /qued%C3%B3%20pendiente/.test(wa), wa.slice(0, 120));
  await p.close();
}

/* ---------- Quien no es Presidencia ---------- */
{
  const p = await abre(COBRO({ canAgree:false, agreement:ACUERDO('active') }));
  revisa('[sin permiso] no ve rehacer ni cancelar', !(await p.$('[data-acuerdo]')));
  revisa('[sin permiso] sí puede anotar', await p.isVisible('.tan-seguimiento [data-nota-texto]'));
  await p.close();
  const q = await abre(COBRO({ canAgree:false, canNote:false }));
  revisa('[sin permiso] sin acuerdo no ve "Acuerdo de pago"', !(await q.$('[data-acuerdo="nuevo"]')));
  revisa('[sin permiso] sin notas ni permiso, no hay seguimiento', !(await q.$('.tan-seguimiento')));
  await q.close();
}

/* ---------- Taquilla › Cobranza ---------- */
{
  const p = await abre(COBRO(), null, '/v2/taquilla/', 1280);
  await p.waitForSelector('#verTabs button', { timeout:8000 });
  const tab = await p.$('#verTabs [data-ver="cobranza"], #verTabs button:has-text("Cobranza")');
  if (tab) await tab.click();
  await p.waitForSelector('#collectionsList .collections-row', { timeout:6000 });
  const chips = await p.$$eval('#collectionsList .collections-row', els => els.map(e => e.querySelector('.collections-acuerdo')?.textContent || ''));
  revisa('[cobranza] cada Tanner con acuerdo lo enseña', chips.includes('Acuerdo · 10 nov $1,000.00') && chips.includes('Acuerdo incumplido') && chips.filter(Boolean).length === 2, JSON.stringify(chips));
  await p.click('[data-collections-filter="agreement"]');
  const conAcuerdo = await p.$$eval('#collectionsList .collections-row strong', els => els.map(e => e.textContent));
  revisa('[cobranza] el filtro "Con acuerdo" deja sólo a esos', JSON.stringify(conAcuerdo.sort()) === JSON.stringify(['Ana Ruiz','Liam Santos']), JSON.stringify(conAcuerdo));
  await p.close();
}

await nav.close(); srv.close();
const fallas = revisiones.filter(r => !r.ok);
for (const r of revisiones) console.log(`${r.ok ? 'OK   ' : 'FALLA'} ${r.nombre}${r.ok || !r.detalle ? '' : ` · ${r.detalle}`}`);
for (const e of errores) console.log(`ERROR ${e}`);
console.log(`\n${revisiones.length - fallas.length}/${revisiones.length} revisiones${errores.length ? ` · ${errores.length} errores de página` : ''}`);
process.exit(fallas.length || errores.length ? 1 : 0);
