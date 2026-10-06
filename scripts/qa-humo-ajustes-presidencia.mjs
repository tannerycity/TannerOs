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
 *   · quien no es Presidencia (canAdjust=false) no ve ningún botón de ajuste.
 */
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const RAIZ = '/home/user/TannerOs';
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
  player: { id:'p1', first_name:'Adan', last_name:'Ibarra', status:'active', category:'Sub-12', guardians:[] },
  summary: { balance: 1300, paid_total: 800, credit_available: 200, credit_held: 0, by_type:[{type:'monthly_fee',pending:800},{type:'other',pending:500}] },
  ledger: [
    { id:'c-oct', date:'2026-10-01', kind:'charge', subtype:'monthly_fee', concept:'Mensualidad', amount:800, charge_balance:800, period:'2026-10-01', running_balance:1300 },
    { id:'c-tor', date:'2026-09-20', kind:'charge', subtype:'other', concept:'Torneo', amount:500, charge_balance:500, period:'2026-09-01', running_balance:500 },
    { id:'pay-1', date:'2026-09-05', kind:'payment', amount:-800, status:'posted', method:'cash', running_balance:0 },
    { id:'c-sep', date:'2026-09-01', kind:'charge', subtype:'monthly_fee', concept:'Mensualidad', amount:800, charge_balance:0, period:'2026-09-01', running_balance:800 }
  ],
  other_payments: [], documents: [], orders: [], academies: []
});

const revisiones = [], errores = [];
const revisa = (n, ok, d = '') => revisiones.push({ nombre:n, ok, detalle:d });
const nav = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });

async function abre(canAdjust, ancho = 390) {
  const p = await nav.newPage({ viewport:{ width:ancho, height:844 } });
  p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
  await p.addInitScript(({ estado }) => {
    window.__llamadas = []; window.__fallaAjuste = 1;
    const m = ['cobranza','contabilidad','taquilla','jugadores'].map(c => ({ module_code:c, enabled:true, can_read:true, can_write:true }));
    const R = { v2_my_context:[{ user_id:'u1', display_name:'Mich', organization_id:'o1', organization_name:'Tannery City FC', role:'Presidencia', is_owner:true }],
                v2_my_navigation:m, v2_player_account_statement:estado,
                v2_presidency_adjust_charge:{ ok:true }, v2_presidency_add_charge:{ ok:true }, v2_correct_tanner_payment:null, v2_apply_player_credit:200 };
    window.__fakeSupabase = {
      auth:{ getSession:async()=>({data:{session:{user:{id:'u1'}}}}), getUser:async()=>({data:{user:{id:'u1'}}}), onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}) },
      rpc:async(n, params)=>{
        window.__llamadas.push({ n, params });
        if (n==='v2_presidency_adjust_charge' && window.__fallaAjuste>0) { window.__fallaAjuste--; return { data:null, error:{ message:'Failed to fetch' } }; }
        return { data:R[n] ?? null, error:null };
      },
      channel:()=>({ on(){return this;}, subscribe(){return this;} }), removeChannel(){}
    };
  }, { estado:ESTADO(canAdjust) });
  await p.route('**/v2/supabase-client.js', r => r.fulfill({ status:200, contentType:'text/javascript', body:'export function createClient(){ return window.__fakeSupabase; }' }));
  await p.route('**/v2/photo-cache.js', r => r.fulfill({ status:200, contentType:'text/javascript',
    body:'export async function getSignedPhotoUrls(){return {};}export async function getSignedPhotoUrl(){return null;}export async function getRawSignedPhotoUrl(){return null;}export async function clearPhotoCache(){}export function forgetPhoto(){}' }));
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto('http://127.0.0.1:4781/v2/tanner/?id=p1', { waitUntil:'domcontentloaded' });
  await p.waitForSelector('.tan-balance', { timeout:8000 });
  return p;
}
const llamadas = (p, n) => p.evaluate(n => window.__llamadas.filter(l => l.n === n), n);

/* ---------- Presidencia ---------- */
{
  const p = await abre(true);
  revisa('[pres] ve "Ajustar saldo"', await p.isVisible('.tan-balance [data-pres="ajustar"]'));
  revisa('[pres] ve "Agregar cargo"', await p.isVisible('.tan-balance [data-pres="cargo"]'));
  revisa('[pres] ve "Aplicar $200.00 a favor"', /Aplicar \$200\.00 a favor/.test(await p.textContent('.tan-balance [data-pres="favor"]')));
  const enRenglones = await p.$$eval('.tan-ledger [data-pres]', els => els.map(e => e.dataset.pres + ':' + (e.dataset.charge || e.dataset.payment)));
  revisa('[pres] "Ajustar" sólo en cargos con saldo y "Corregir" en el pago', JSON.stringify(enRenglones) === JSON.stringify(['ajustar:c-oct','ajustar:c-tor','corregir:pay-1']), JSON.stringify(enRenglones));

  // Ajustar desde el renglón del torneo
  await p.click('.tan-ledger [data-charge="c-tor"]');
  await p.waitForSelector('#presSheet:not(.hidden)');
  revisa('[ajuste] abre con el cargo del renglón elegido', await p.inputValue('#presCargo') === 'c-tor');
  revisa('[ajuste] propone quitar todo lo que se debe', await p.inputValue('#presMonto') === '500');
  const enPantalla = await p.evaluate(() => { const r = document.getElementById('presSheet').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; });
  revisa('[ajuste] en el teléfono la hoja cabe', enPantalla);
  await p.click('#presForm .pres-primary');
  revisa('[ajuste] sin motivo no se manda', (await llamadas(p, 'v2_presidency_adjust_charge')).length === 0 && /motivo/i.test(await p.textContent('.pres-error')));
  await p.click('[data-ajuste="waiver"]');
  await p.fill('#presMonto', '200');
  revisa('[ajuste] dice en cuánto queda', /\$300\.00/.test(await p.textContent('#presQueda')));
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

  // Corregir pago
  await p.click('.tan-ledger [data-payment="pay-1"]');
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
console.log(`Ajustes de Presidencia humo OK · ${revisiones.length} revisiones: ajustar, agregar cargo, corregir pago y aplicar a favor desde el estado de cuenta`);
