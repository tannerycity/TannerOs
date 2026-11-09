/* PRESIDENCIA AJUSTA SALDOS DESDE EL ESTADO DE CUENTA.
 *
 * Pedido (06/10/2026): "cuando nos metamos a los saldos de las personas,
 * poder editarlo en Presidencia, no ir hasta Taquilla o Contabilidad". Un
 * saldo nunca se sobrescribe: cada acción es un movimiento con motivo.
 *
 * Esta prueba levanta /tanner/ REAL con un Supabase falso y revisa:
 *   · Presidencia ve "Ajustar saldo", "Agregar cargo", "Aplicar a favor", y
 *     en los renglones "Ajustar" (sólo cargos con saldo) y "Corregir" (pagos);
 *   · sin motivo no se manda nada; el ajuste no deja escribir 0;
 *   · el ajuste manda cargo, tipo, monto, motivo y llave; si la red falla, el
 *     reintento usa la MISMA llave (no se duplica);
 *   · agregar cargo, corregir pago y aplicar saldo a favor llaman al RPC
 *     correcto y después se vuelve a pedir el estado de cuenta;
 *   · quien no es Presidencia (canAdjust=false) no ve ningún botón de ajuste;
 *   · "Cambios al saldo" enseña quién, cuándo y el motivo; el PDF para la
 *     familia lleva saldo y movimientos y NO lleva motivos, ni quién, ni el
 *     historial de cambios; sin hoja de compartir, abre WhatsApp con resumen;
 *   · Finanzas: cargo a varios Tanners por categoría, quitando a uno, con el
 *     total antes de guardar; reintentar usa la misma llave.
 *   · Estilo Apple (04/11/2026): arriba sólo Cobrar y WhatsApp; lo demás en
 *     renglones. Planes con la mensualidad que Presidencia ajusta ahí mismo
 *     (con motivo, v2_set_player_fee_note), Salud (sangre, alergias,
 *     emergencia) y Familia; quien no es Presidencia ve la cuota sin poder
 *     tocarla.
 *   · Paquetes (h62): el renglón dice el paquete y cuánto paga; cada beca
 *     con su motivo y cuándo vence; "Renovar" cuando faltan 30 días o menos;
 *     la hoja deja elegir paquete, enseña cuánto pagaría y pide motivo.
 *     Movimientos van plegados y se abren con un toque.
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
await new Promise(r => srv.listen(4781, r));

const ESTADO = (canAdjust) => ({
  canAdjust,
  player: { id:'p1', first_name:'Adan', last_name:'Ibarra', status:'active', category:'Sub-12', base_monthly_fee:800, billing_day:5, benefits:[{ source:'Beca deportiva', percentage:25 }], guardians:[{ name:'Mamá', phone:'4771234567', primary:true }] },
  summary: { balance: 1300, paid_total: 800, credit_available: 200, credit_held: 0, by_type:[{type:'monthly_fee',pending:800},{type:'other',pending:500}] },
  ledger: [
    { id:'c-oct', date:'2026-10-01', kind:'charge', subtype:'monthly_fee', concept:'Mensualidad', amount:800, charge_balance:800, period:'2026-10-01', running_balance:1300 },
    { id:'c-tor', date:'2026-09-20', kind:'charge', subtype:'other', concept:'Torneo', amount:500, charge_balance:500, period:'2026-09-01', running_balance:500 },
    { id:'pay-1', date:'2026-09-05', kind:'payment', amount:-800, status:'posted', method:'cash', running_balance:0 },
    { id:'c-sep', date:'2026-09-01', kind:'charge', subtype:'monthly_fee', concept:'Mensualidad', amount:800, charge_balance:0, allocated:800, period:'2026-09-01', running_balance:800 }
  ],
  other_payments: [], documents: [], orders: [], academies: [{ starts_on:'2026-08-01', fee:400, status:'active' }]
});

const revisiones = [], errores = [];
const revisa = (n, ok, d = '') => revisiones.push({ nombre:n, ok, detalle:d });
const nav = await chromium.launch({ executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });

async function abre(canAdjust, ancho = 390, ruta = '/v2/tanner/?id=p1', rol = 'Presidencia', conPaquete = false) {
  const p = await nav.newPage({ viewport:{ width:ancho, height:844 } });
  p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
  await p.addInitScript(({ estado, rol, conPaquete }) => {
    window.__conPaquete = conPaquete;
    window.__llamadas = []; window.__fallaAjuste = 1;
    const m = ['cobranza','contabilidad','taquilla','jugadores','finanzas'].map(c => ({ module_code:c, enabled:true, can_read:true, can_write:true }));
    const R = { v2_player_change_history:[
                  { kind:'adjustment', type:'waiver', amount:100, reason:'MOTIVO-SECRETO beca', at:'2026-10-05T18:00:00Z', concept:'Mensualidad', chargeType:'monthly_fee', by:'Mich' },
                  { kind:'charge_added', amount:500, concept:'Torneo', reason:'inscripción', at:'2026-09-20T18:00:00Z', by:'Mich' } ],
                v2_players:[{ id:'p1', first_name:'Adan', last_name:'Ibarra', category:'Sub-12' },{ id:'p2', first_name:'Beto', last_name:'Ruiz', category:'Sub-12' },{ id:'p3', first_name:'Caro', last_name:'Paz', category:'Sub-14' }],
                v2_presidency_bulk_charge:{ ok:true, players:1, total:350 },
                v2_my_context:[{ user_id:'u1', display_name:'Mich', organization_id:'o1', organization_name:'Tannery City FC', role:rol, is_owner:rol === 'Presidencia' }],
                v2_player_package: window.__conPaquete ? {
                  hasPackages:true, canEdit:rol === 'Presidencia', canRenew:rol === 'Presidencia', category:'T12', group:'tanner', period:'2026-12-01',
                  package:{ code:'tanner_4', name:'Tanner 4 días', audience:'tanner', days:4, goalkeeperDays:0, trainsWithCategory:true },
                  price:800, discount:300, fee:500, upcoming:[{ fee:900, from:'2027-01-01' }],
                  benefits:[{ id:'b1', type:'scholarship_partial', calculation:'fixed_amount', fixed:300, reason:'Beca deportiva por desempeño', endsOn:'2026-11-20', daysLeft:16, counts:true },
                            { id:'b2', type:'sibling_discount', calculation:'percentage', percentage:10, reason:'Hermanos Tanner', endsOn:'2027-02-28', daysLeft:116, counts:true }],
                  options:[{ code:'tanner_4', name:'Tanner 4 días', audience:'tanner', days:4, goalkeeperDays:0, trainsWithCategory:true, price:800 },
                           { code:'tanner_2', name:'Tanner 2 días', audience:'tanner', days:2, goalkeeperDays:0, trainsWithCategory:true, price:null },
                           { code:'porteros_4', name:'Porteros 4 días', audience:'porteros', days:4, goalkeeperDays:2, trainsWithCategory:true, price:800 },
                           { code:'porteros_2', name:'Porteros 2 días', audience:'porteros', days:2, goalkeeperDays:2, trainsWithCategory:false, price:500 }] } : null,
                v2_set_player_package:{ package:'porteros_4', packageName:'Porteros 4 días', price:800, fee:420, from:'2026-12-01' },
                v2_renew_benefit:{ benefitId:'b1', endsOn:'2027-02-28' },
                v2_player_profile:{ player:{ id:'p1', bloodType:'O+', allergies:'Asma: trae inhalador', emergencyContactName:'Laura Ibarra', emergencyContactPhone:'4779998877' } }, v2_set_player_fee_note:true,
                v2_my_navigation:m, v2_player_account_statement:estado,
                v2_presidency_adjust_charge:{ ok:true }, v2_presidency_add_charge:{ ok:true }, v2_correct_tanner_payment:null, v2_apply_player_credit:200,
                v2_set_charge_amount:{ ok:true }, v2_punctuality_status:{ year:2027, onTime:7, december:{ state:'en_curso', onTime:7, of:11, percent:50 }, kit:{ state:'ganado', onTime:5, of:5, percent:20 } }, v2_edit_payment:{ ok:true, lateFeesWaived:1, lateFeesAmount:100 } };
    window.__fakeSupabase = {
      auth:{ getSession:async()=>({data:{session:{user:{id:'u1'}}}}), getUser:async()=>({data:{user:{id:'u1'}}}), onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}) },
      rpc:async(n, params)=>{
        window.__llamadas.push({ n, params });
        if ((n==='v2_presidency_adjust_charge'||n==='v2_presidency_bulk_charge') && window.__fallaAjuste>0) { window.__fallaAjuste--; return { data:null, error:{ message:'Failed to fetch' } }; }
        return { data:R[n] ?? null, error:null };
      },
      channel:()=>({ on(){return this;}, subscribe(){return this;} }), removeChannel(){}
    };
  }, { estado:ESTADO(canAdjust), rol, conPaquete });
  await p.route('**/v2/supabase-client.js', r => r.fulfill({ status:200, contentType:'text/javascript', body:'export function createClient(){ return window.__fakeSupabase; }' }));
  await p.route('**/v2/photo-cache.js', r => r.fulfill({ status:200, contentType:'text/javascript',
    body:'export async function getSignedPhotoUrls(){return {};}export async function getSignedPhotoUrl(){return null;}export async function getRawSignedPhotoUrl(){return null;}export async function clearPhotoCache(){}export function forgetPhoto(){}' }));
  // Playwright prueba las rutas de la última registrada a la primera: el
  // bloqueo de internet va antes que el doble de jsPDF para no taparlo.
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  // jsPDF no se descarga: un doble que graba el texto y el nombre del archivo.
  await p.route('**esm.sh/jspdf**', r => r.fulfill({ status:200, contentType:'text/javascript', body:`
    export class jsPDF { constructor(){ this.t=[]; this.internal={ pageSize:{ getWidth:()=>612, getHeight:()=>792 } }; }
      setFont(){} setFontSize(){} setTextColor(){} setFillColor(){} rect(){} roundedRect(){} addPage(){}
      splitTextToSize(x){ return [String(x)]; } text(x){ this.t.push(Array.isArray(x)?x.join(' '):String(x)); }
      output(){ window.__pdf={ textos:this.t }; return new Blob(['%PDF'],{type:'application/pdf'}); }
      save(n){ window.__pdf={ nombre:n, textos:this.t }; } }` }));
  await p.addInitScript(() => { window.open = (u) => { window.__abierto = u; return null; }; });
  await p.goto(`http://127.0.0.1:4781${ruta}`, { waitUntil:'domcontentloaded' });
  if (ruta.includes('tanner')) await p.waitForSelector('.tan-balance', { timeout:8000 });
  return p;
}
const llamadas = (p, n) => p.evaluate(n => window.__llamadas.filter(l => l.n === n), n);

/* ---------- Presidencia ---------- */
{
  const p = await abre(true);
  revisa('[pres] ve "Cambiar lo que debe"', /Cambiar lo que debe/.test(await p.textContent('.tan-balance [data-pres="ajustar"]')));
  revisa('[pres] ve "Agregar cargo"', await p.isVisible('.tan-balance [data-pres="cargo"]'));
  revisa('[pres] ve "Aplicar $200.00 a favor"', /Aplicar \$200\.00 a favor/.test(await p.textContent('.tan-balance [data-pres="favor"]')));
  revisa('[apple] movimientos plegados al abrir', !(await p.isVisible('.tan-ledger')));
  await p.click('#detMovs > summary');
  const enRenglones = await p.$$eval('.tan-ledger [data-pres]', els => els.map(e => e.dataset.pres + ':' + (e.dataset.charge || e.dataset.payment)));
  revisa('[pres] "Cambiar monto" en cada cargo y "Editar" en el pago', JSON.stringify(enRenglones) === JSON.stringify(['ajustar:c-oct','ajustar:c-tor','editar:pay-1','ajustar:c-sep']), JSON.stringify(enRenglones));

  // Ajustar desde el renglón del torneo
  await p.click('.tan-ledger [data-charge="c-tor"]');
  await p.waitForSelector('#presSheet:not(.hidden)');
  revisa('[ajuste] abre con el cargo del renglón elegido', await p.inputValue('#presCargo') === 'c-tor');
  revisa('[ajuste] arranca en lo que debe hoy', await p.inputValue('#presMonto') === '500');
  const enPantalla = await p.evaluate(() => { const r = document.getElementById('presSheet').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; });
  revisa('[ajuste] en el teléfono la hoja cabe', enPantalla);
  await p.click('#presForm .pres-primary');
  revisa('[ajuste] sin motivo no se manda', (await llamadas(p, 'v2_presidency_adjust_charge')).length === 0 && /motivo/i.test(await p.textContent('.pres-error')));
  revisa('[ajuste] sin cambiar el monto no se manda', /motivo|mismo/i.test(await p.textContent('.pres-error')));
  await p.fill('#presMonto', '300');
  await p.click('[data-ajuste="waiver"]');
  revisa('[ajuste] dice cuánto se quita y en cuánto queda', /Se quitan \$200\.00 y queda debiendo \$300\.00/.test(await p.textContent('#presCambio')), await p.textContent('#presCambio'));
  await p.fill('#presMotivo', 'Beca de torneo por buen desempeño');
  await p.click('#presForm .pres-primary');
  await p.waitForSelector('.pres-error', { timeout:4000 });
  revisa('[ajuste] si la red falla, lo dice y deja reintentar', await p.isVisible('#presSheet'));
  await p.click('#presForm .pres-primary');
  await p.waitForSelector('#presSheet.hidden', { state:'attached', timeout:4000 });
  const aj = await llamadas(p, 'v2_presidency_adjust_charge');
  revisa('[ajuste] manda cargo, tipo, monto y motivo', aj.length === 2 && aj[1].params.charge_id === 'c-tor' && aj[1].params.adjustment_type === 'waiver' && aj[1].params.amount === 200 && /Beca/.test(aj[1].params.reason), JSON.stringify(aj[1]?.params));
  revisa('[ajuste] el reintento usa la misma llave', aj.length === 2 && aj[0].params.idempotency_key === aj[1].params.idempotency_key && aj[0].params.idempotency_key.length >= 8);
  revisa('[ajuste] después vuelve a pedir el estado de cuenta', (await llamadas(p, 'v2_player_account_statement')).length === 2);
  revisa('[ajuste] avisa lo que hizo', /se quitaron \$200\.00/.test(await p.textContent('#presToast')));

  // Agregar cargo
  await p.click('.tan-balance [data-pres="cargo"]');
  await p.fill('#presConcepto', 'Torneo de Navidad');
  await p.fill('#presMonto', '350');
  await p.fill('#presFecha', '2026-12-10');
  await p.fill('#presMotivo', 'Inscripción al torneo');
  await p.click('#presForm .pres-primary');
  await p.waitForSelector('#presSheet.hidden', { state:'attached', timeout:4000 });
  const cg = (await llamadas(p, 'v2_presidency_add_charge'))[0]?.params || {};
  revisa('[cargo] manda Tanner, concepto, monto, fecha y motivo', cg.player_id === 'p1' && cg.concept === 'Torneo de Navidad' && cg.amount === 350 && cg.due_date === '2026-12-10' && cg.reason === 'Inscripción al torneo' && cg.idempotency_key, JSON.stringify(cg));

  // Subir lo que debe (08/11/2026): "son 500 y tiene que pagar 800".
  await p.click('.tan-ledger [data-charge="c-oct"]');
  await p.fill('#presMonto', '1100');
  revisa('[subir] dice cuánto sube y en cuánto queda el cargo', /Sube \$300\.00: el cargo queda en \$1,100\.00/.test(await p.textContent('#presCambio')), await p.textContent('#presCambio'));
  revisa('[subir] al subir no pregunta descuento o condonación', !(await p.$('#presCambio [data-ajuste]')));
  await p.fill('#presMotivo', 'Paga también el torneo de octubre');
  await p.click('#presForm .pres-primary');
  await p.waitForSelector('#presSheet.hidden', { state:'attached', timeout:4000 });
  const sb = (await llamadas(p, 'v2_set_charge_amount'))[0]?.params || {};
  revisa('[subir] manda el cargo con su monto nuevo', sb.charge_id === 'c-oct' && sb.new_amount === 1100 && /torneo/.test(sb.reason) && sb.idempotency_key, JSON.stringify(sb));
  revisa('[subir] avisa lo que hizo', /subió \$300\.00/.test(await p.textContent('#presToast')));

  // Un cargo ya pagado también se puede subir: dice lo que ya pagó.
  await p.click('.tan-ledger [data-charge="c-sep"]');
  revisa('[liquidado] dice el cargo y lo que ya pagó', /Cargo de \$800\.00 · pagó \$800\.00/.test(await p.textContent('.pres-cuota')) && await p.inputValue('#presMonto') === '0');
  await p.click('[data-pres-cerrar]');

  // Editar el pago: fecha, método y referencia (08/11/2026).
  await p.click('.tan-ledger [data-payment="pay-1"]');
  await p.waitForSelector('#presSheet:not(.hidden)');
  revisa('[editar] trae la fecha y el método del pago', await p.inputValue('#presFecha') === '2026-09-05' && /true/.test(await p.getAttribute('[data-metodo-ed="cash"]', 'aria-checked')));
  if (process.env.SHOTS) await p.screenshot({ path:`${process.env.SHOTS}/tanner-editar-pago.png` });
  await p.fill('#presFecha', '2026-09-04');
  await p.click('[data-metodo-ed="transfer"]');
  await p.fill('#presRef', 'SPEI 4471');
  await p.fill('#presMotivo', 'Pagó el viernes en la noche');
  await p.click('#presForm .pres-primary');
  // Si la hoja no se cierra, que diga por qué (CI lento o un aviso en la hoja).
  const cerro = await p.waitForSelector('#presSheet.hidden', { state:'attached', timeout:8000 }).then(() => true, () => false);
  revisa('[editar] guarda y cierra la hoja', cerro, cerro ? '' : 'sigue abierta: ' + ((await p.textContent('#presSheet').catch(() => '')) || '').replace(/\s+/g, ' ').slice(0, 300));
  const ed = (await llamadas(p, 'v2_edit_payment'))[0]?.params || {};
  revisa('[editar] manda fecha, método, referencia y motivo', ed.payment_id === 'pay-1' && ed.payment_date === '2026-09-04' && ed.method === 'transfer' && ed.reference === 'SPEI 4471' && /viernes/.test(ed.reason), JSON.stringify(ed));
  revisa('[editar] avisa que se quitó el recargo', /quitó el recargo de \$100\.00/.test(await p.textContent('#presToast')));

  // Revertir sigue ahí, abajo de Editar.
  await p.click('.tan-ledger [data-payment="pay-1"]');
  await p.click('[data-revertir]');
  await p.fill('#presMotivo', 'Se capturó dos veces');
  await p.click('#presForm .pres-primary');
  await p.waitForSelector('#presSheet.hidden', { state:'attached', timeout:4000 });
  const cp = (await llamadas(p, 'v2_correct_tanner_payment'))[0]?.params || {};
  revisa('[corregir] revierte el pago con su motivo', cp.payment_id === 'pay-1' && cp.reason === 'Se capturó dos veces', JSON.stringify(cp));

  // Aplicar a favor
  await p.click('.tan-balance [data-pres="favor"]');
  await p.click('#presForm .pres-primary');
  await p.waitForSelector('#presSheet.hidden', { state:'attached', timeout:4000 });
  revisa('[a favor] aplica el saldo a favor', (await llamadas(p, 'v2_apply_player_credit')).length === 1);
  revisa('[a favor] avisa cuánto aplicó', /Se aplicaron \$200\.00/.test(await p.textContent('#presToast')));
  revisa('[pres] sin scroll horizontal', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await p.close();
}

/* ---------- Historial de cambios y PDF para la familia ---------- */
{
  const p = await abre(true);
  await p.waitForSelector('#detMovs', { timeout:5000 });
  await p.click('#detMovs > summary');
  await p.waitForSelector('.tan-cambios', { timeout:5000 });
  const c = (await p.textContent('.tan-cambios')).replace(/\s+/g,' ');
  revisa('[cambios] dice qué, quién y el motivo', /Condonación · Mensualidad/.test(c) && /Mich/.test(c) && /MOTIVO-SECRETO beca/.test(c), c.slice(0,240));
  revisa('[cambios] avisa que es interno', /no sale en el PDF/.test(c));
  await p.click('[data-enviar-edo]');
  await p.waitForFunction(() => window.__pdf, null, { timeout:6000 });
  const pdf = await p.evaluate(() => window.__pdf);
  const t = pdf.textos.join(' | ');
  revisa('[pdf] se llama con el nombre del Tanner', pdf.nombre === 'estado-de-cuenta-adan-ibarra.pdf', pdf.nombre);
  revisa('[pdf] lleva el saldo y lo pendiente', /\$1,300\.00/.test(t) && /Pendiente de pago/.test(t) && /Torneo/.test(t), t.slice(0,300));
  revisa('[pdf] lleva los movimientos', /Movimientos/.test(t) && /Pago · Efectivo/.test(t));
  revisa('[pdf] NO lleva el historial de cambios ni motivos', !/MOTIVO-SECRETO|Cambios al saldo|Condonación|inscripción/.test(t));
  revisa('[pdf] NO dice quién cobró ni quién ajustó', !/Mich|quién lo cobró/.test(t));
  const wa = await p.evaluate(() => window.__abierto || '');
  revisa('[whatsapp] abre el chat de la familia con lada', wa.startsWith('https://wa.me/524771234567?text='), wa.slice(0,60));
  revisa('[whatsapp] el resumen dice el saldo', /Saldo%20pendiente%3A%20%241%2C300\.00/.test(wa));
  await p.close();
}

/* ---------- Finanzas: cargo a varios Tanners ---------- */
{
  const p = await abre(true, 390, '/v2/finanzas/');
  await p.waitForSelector('#abrirCargoMasivo', { timeout:8000 });
  await p.evaluate(() => { window.__fallaAjuste = 1; });
  await p.click('#abrirCargoMasivo');
  await p.waitForSelector('[data-cat="Sub-12"]', { timeout:5000 });
  await p.fill('#mConcepto', 'Torneo de Navidad');
  await p.fill('#mMonto', '350');
  await p.click('[data-cat="Sub-12"]');
  revisa('[masivo] la categoría trae a sus 2 Tanners', (await p.$$('[data-jug]')).length === 2);
  revisa('[masivo] dice cuánto suma antes de guardar', /350\.00 a 2 Tanners = \$700\.00/.test(await p.textContent('#mResumen')));
  await p.uncheck('[data-jug="p2"]');
  revisa('[masivo] quitar a uno ajusta el total', /a 1 Tanner = \$350\.00/.test(await p.textContent('#mResumen')));
  await p.click('#mForm .pres-primary');
  revisa('[masivo] sin motivo no se manda', (await llamadas(p, 'v2_presidency_bulk_charge')).length === 0 && await p.isVisible('.pres-error'));
  await p.fill('#mMotivo', 'Torneo de fin de año');
  await p.click('#mForm .pres-primary');
  await p.waitForSelector('.pres-error', { timeout:4000 });
  await p.click('#mForm .pres-primary');
  await p.waitForSelector('#presSheet.hidden', { state:'attached', timeout:4000 });
  const bc = await llamadas(p, 'v2_presidency_bulk_charge');
  revisa('[masivo] manda sólo a los elegidos, con concepto, monto y motivo', bc.length === 2 && JSON.stringify(bc[1].params.player_ids) === '["p1"]' && bc[1].params.concept === 'Torneo de Navidad' && bc[1].params.amount === 350 && bc[1].params.reason === 'Torneo de fin de año', JSON.stringify(bc[1]?.params));
  revisa('[masivo] el reintento usa la misma llave', bc.length === 2 && bc[0].params.idempotency_key === bc[1].params.idempotency_key);
  revisa('[masivo] avisa lo que hizo', /Torneo de Navidad a 1 Tanners por \$350\.00/.test(await p.textContent('#presToast')));
  await p.close();
}

/* ---------- Estilo Apple: renglones, Planes, Salud y Familia ---------- */
{
  const p = await abre(true);
  if (process.env.SHOTS) await p.screenshot({ path:`${process.env.SHOTS}/tanner-apple.png`, fullPage:true });
  const grandes = await p.$$eval('.tan-balance .tan-actions .tan-btn', b => b.map(x => x.matches('[data-cobrar],[data-wa-menu]')));
  revisa('[apple] arriba sólo Cobrar y WhatsApp (botones grandes)', grandes.every(Boolean), JSON.stringify(grandes));
  revisa('[apple] lo demás son renglones (ajustar, cargo, favor, enviar, ficha)',
    (await p.$$eval('.tan-balance .tan-lista .tan-fila strong', s => s.map(x => x.textContent))).join('|') === 'Cambiar lo que debe|Agregar cargo|Aplicar $200.00 a favor|Enviar estado de cuenta|Ver ficha completa');
  const grupos = await p.$$eval('.tan-grupo-tit', h => h.map(x => x.textContent));
  revisa('[apple] Planes, Salud y Familia antes de los meses', grupos.slice(0, 3).join() === 'Planes,Salud,Familia', grupos.join());
  const planes = await p.textContent('.tan-grupo:has(.tan-fila[data-cuota])');
  revisa('[planes] mensualidad, academia y beca', /Mensualidad/.test(planes) && /\$800\.00\/mes/.test(planes) && /día 5/.test(planes) && /Academia/.test(planes) && /\$400\.00\/mes/.test(planes) && /Beca deportiva/.test(planes) && /−25%/.test(planes), planes);
  const salud = await p.evaluate(() => [...document.querySelectorAll('.tan-grupo')].find(g => g.querySelector('.tan-grupo-tit').textContent === 'Salud')?.textContent || '');
  const premio = await p.textContent('.tan-grupo:has(.tan-fila[data-cuota])');
  revisa('[puntualidad] dice cuántos meses a tiempo y los dos premios', /Premio por puntualidad/.test(premio) && /7 de 11 meses a tiempo/.test(premio) && /Kit de agosto: 20% ganado/.test(premio) && /7\/11/.test(premio), premio);
  revisa('[salud] sangre, alergias y emergencia', /O\+/.test(salud) && /Asma: trae inhalador/.test(salud) && /Laura Ibarra/.test(salud) && /477\s999\s8877/.test(salud), salud);
  revisa('[salud] emergencia con WhatsApp y Llamar', await p.getAttribute('.tan-grupo a[aria-label="Llamar al contacto de emergencia"]', 'href') === 'tel:+524779998877');
  revisa('[apple] sin scroll horizontal', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

  // Ajustar la mensualidad ahí mismo
  await p.click('.tan-fila[data-cuota]');
  await p.waitForSelector('#presSheet:not(.hidden)');
  revisa('[cuota] la hoja dice cuánto paga hoy', /\$800\.00/.test(await p.textContent('.pres-cuota')) && await p.inputValue('#presMonto') === '800');
  await p.fill('#presMonto', '650');
  await p.click('#presForm .pres-primary');
  revisa('[cuota] sin motivo no se manda', (await llamadas(p, 'v2_set_player_fee_note')).length === 0 && /motivo/i.test(await p.textContent('.pres-error')));
  await p.fill('#presMotivo', 'Hermanos: descuento acordado');
  await p.click('#presForm .pres-primary');
  await p.waitForSelector('#presSheet.hidden', { state:'attached', timeout:4000 });
  const fee = await llamadas(p, 'v2_set_player_fee_note');
  revisa('[cuota] manda monto y motivo como nota', fee.length === 1 && fee[0].params.monthly_fee === 650 && fee[0].params.note === 'Hermanos: descuento acordado' && fee[0].params.player_id === 'p1', JSON.stringify(fee[0]?.params));
  revisa('[cuota] avisa y recarga', /\$650\.00 al mes/.test(await p.textContent('#presToast')) && (await llamadas(p, 'v2_player_account_statement')).length === 2);
  await p.close();
}
/* ---------- Paquete y becas (h62) ---------- */
{
  const p = await abre(true, 390, '/v2/tanner/?id=p1', 'Presidencia', true);
  if (process.env.SHOTS) await p.screenshot({ path:`${process.env.SHOTS}/tanner-paquete.png`, fullPage:true });
  const grupo = await p.evaluate(() => [...document.querySelectorAll('.tan-grupo')].find(g => g.querySelector('.tan-grupo-tit').textContent === 'Paquete')?.textContent || '');
  revisa('[paquete] dice paquete, precio menos becas y cuánto paga', /Tanner 4 días/.test(grupo) && /\$800\.00 − becas \$300\.00/.test(grupo) && /\$500\.00\/mes/.test(grupo), grupo);
  revisa('[paquete] cada beca con su motivo y cuándo vence', /Beca parcial −\$300\.00/.test(grupo) && /Beca deportiva por desempeño/.test(grupo) && /faltan 16 días/.test(grupo) && /Hermanos −10%/.test(grupo), grupo);
  revisa('[paquete] avisa el precio de enero', /Desde enero el paquete cuesta \$900\.00/.test(grupo), grupo);
  revisa('[paquete] el encabezado dice el paquete', /Tanner 4 días/.test(await p.textContent('.tan-head')));
  revisa('[becas] "Renovar" sólo en la que vence pronto', (await p.$$eval('[data-renovar]', b => b.map(x => x.dataset.renovar))).join() === 'b1');
  revisa('[paquete] sin "Planes" (lo reemplaza Paquete)', !(await p.$('[data-cuota]')));
  revisa('[paquete] botones de renglón de 44 px', await p.$eval('[data-renovar]', b => b.getBoundingClientRect().height >= 44));

  await p.click('.tan-fila[data-paquete]');
  await p.waitForSelector('#presSheet:not(.hidden)');
  revisa('[hoja] marca el paquete actual', await p.getAttribute('[data-pq="tanner_4"]', 'aria-checked') === 'true');
  revisa('[hoja] un paquete sin precio no se puede elegir', await p.isDisabled('[data-pq="tanner_2"]'));
  await p.click('[data-pq="porteros_4"]');
  revisa('[hoja] enseña cuánto pagaría con sus becas', /\$420\.00/.test(await p.textContent('#pqResumen')) && /diciembre/.test(await p.textContent('#pqResumen')), await p.textContent('#pqResumen'));
  await p.click('#presForm .pres-primary');
  revisa('[hoja] sin motivo no se manda', (await llamadas(p, 'v2_set_player_package')).length === 0 && /motivo/i.test(await p.textContent('.pres-error')));
  await p.fill('#presMotivo', 'Entrena con Alexis');
  await p.click('#presForm .pres-primary');
  await p.waitForSelector('#presSheet.hidden', { state:'attached', timeout:4000 });
  const sp = (await llamadas(p, 'v2_set_player_package'))[0]?.params || {};
  revisa('[hoja] manda paquete y motivo', sp.package_code === 'porteros_4' && sp.reason === 'Entrena con Alexis' && sp.player_id === 'p1', JSON.stringify(sp));
  revisa('[hoja] avisa desde cuándo', /Porteros 4 días, \$420\.00 al mes desde diciembre/.test(await p.textContent('#presToast')));

  await p.click('[data-renovar="b1"]');
  await p.waitForSelector('#presSheet:not(.hidden)');
  revisa('[renovar] dice hasta cuándo queda', /vence el 31 ene 2027/.test(await p.textContent('#presSheet')), await p.textContent('#presSheet'));
  await p.click('#presForm .pres-primary');
  await p.waitForSelector('#presSheet.hidden', { state:'attached', timeout:4000 });
  revisa('[renovar] renueva esa beca', (await llamadas(p, 'v2_renew_benefit'))[0]?.params?.benefit_id === 'b1');
  revisa('[paquete] sin scroll horizontal', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await p.close();
}
{
  const p = await abre(true, 390, '/v2/tanner/?id=p1', 'Contabilidad', true);
  revisa('[paquete] quien no es Presidencia ve el paquete pero no lo cambia', /Tanner 4 días/.test(await p.textContent('.tan-grid')) && !(await p.$('.tan-fila[data-paquete]')) && !(await p.$('[data-renovar]')));
  await p.close();
}

/* ---------- Quien no es Presidencia ve la cuota, no la cambia ---------- */
{
  const p = await abre(true, 390, '/v2/tanner/?id=p1', 'Contabilidad');
  revisa('[no pres] ve la mensualidad', /\$800\.00\/mes/.test(await p.textContent('.tan-grid')));
  revisa('[no pres] no puede abrir el ajuste de mensualidad', !(await p.$('[data-cuota]')));
  await p.close();
}

/* ---------- Escape cierra; iPad centrado ---------- */
{
  const p = await abre(true, 1024);
  await p.click('.tan-balance [data-pres="cargo"]');
  const centro = await p.evaluate(() => { const r = document.getElementById('presSheet').getBoundingClientRect(); return Math.abs((r.left + r.right) / 2 - innerWidth / 2) < 4 && r.width < 500; });
  revisa('[iPad] la hoja va centrada', centro);
  await p.keyboard.press('Escape');
  revisa('[iPad] Escape la cierra', await p.isHidden('#presSheet'));
  await p.close();
}

/* ---------- Sin permiso de ajustar ---------- */
{
  const p = await abre(false);
  revisa('[no pres] no ve ningún botón de ajuste', (await p.$$('[data-pres]')).length === 0);
  await p.close();
}

await nav.close(); srv.close();
let mal = 0;
for (const r of revisiones) if (!r.ok) { mal++; console.error(` - ${r.nombre}${r.detalle ? ' :: ' + r.detalle : ''}`); }
if (errores.length) { console.error('ERRORES DEL NAVEGADOR:'); errores.forEach(e => console.error('   ' + e)); }
if (mal || errores.length) { console.error(`Ajustes de Presidencia humo FAILED · ${mal} de ${revisiones.length}, ${errores.length} errores`); process.exit(1); }
console.log(`Ajustes de Presidencia humo OK · ${revisiones.length} revisiones: ajustes, historial de cambios, PDF para la familia y cargo a varios Tanners`);
