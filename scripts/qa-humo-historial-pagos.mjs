/* HISTORIAL DE PAGOS POR TANNER.
 *
 * Pedido (06/10/2026): "si quiero ver qué ha pagado cada jugador... en su
 * ficha estaría de lujo y también en finanzas". Desde n2 el estado de cuenta
 * sólo lo contesta el RPC a Cobranza o Contabilidad (antes bastaba Jugadores
 * y un profe lo podía leer por la API).
 *
 * Esta prueba levanta las pantallas REALES con un Supabase falso y revisa:
 *   · Ficha del jugador (quien lleva dinero): sección Pagos con lo pagado, lo
 *     que debe, saldo a favor, los últimos 5 pagos (incluye tienda/otros) del
 *     más reciente al más viejo, método en español y enlace al historial;
 *   · Ficha del jugador (profe): la sección no sale y el RPC ni se llama;
 *   · Finanzas: el buscador encuentra sin acentos y enlaza a /tanner/?id=;
 *   · Finanzas con rol Taquilla: el buscador no sale.
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
await new Promise(r => srv.listen(4771, r));

const ESTADO = {
  player: { id:'p1', first_name:'Adan', last_name:'Ibarra' },
  summary: { balance: 800, paid_total: 3400, credit_available: 650, oldest_due: '2026-09-10' },
  ledger: [
    { date:'2026-10-05', kind:'payment', concept:'Mensualidad', amount:-550, method:'cash' },
    { date:'2026-10-01', kind:'charge', concept:'Mensualidad octubre', amount:800 },
    { date:'2026-09-05', kind:'payment', concept:'Mensualidad', amount:-800, method:'transfer' },
    { date:'2026-08-05', kind:'payment', concept:'Mensualidad', amount:-800, method:'card' },
    { date:'2026-07-05', kind:'payment', concept:'Inscripción <b>x</b>', amount:-650, method:'cash' }
  ],
  other_payments: [
    { date:'2026-09-20', amount:450, concept:'Pedido de tienda', method:'cash', status:'posted' },
    { date:'2026-06-01', amount:150, concept:'Torneo', method:'cash', status:'posted' }
  ]
};
// v2_my_navigation usa los códigos en español; v2_my_modules, los internos
// en inglés (players, billing, accounting). Se dan los dos, como en producción.
const MODS = {
  Presidencia: [['jugadores',true],['cobranza',true],['contabilidad',true],['finanzas',true],['players',true],['billing',true],['accounting',true]],
  Formadores:  [['jugadores',false],['players',false]],
  Taquilla:    [['taquilla',true],['cobranza',true],['finanzas',false],['billing',true]]
};

const revisiones = [], errores = [];
const revisa = (n, ok, d = '') => revisiones.push({ nombre:n, ok, detalle:d });
const nav = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });

async function abre(rol, ruta) {
  const p = await nav.newPage({ viewport:{ width:390, height:844 } });
  p.on('pageerror', e => errores.push(`[${rol} ${ruta}] pageerror: ${e.message}`));
  await p.addInitScript(({ rol, mods, ESTADO }) => {
    window.__llamadas = [];
    const m = mods.map(([c,w]) => ({ module_code:c, enabled:true, can_read:true, can_write:w }));
    const R = {
      v2_my_context:[{ user_id:'u1', display_name:'Mich', organization_id:'o1', organization_name:'Tannery City FC', role:rol, is_owner:rol==='Presidencia' }],
      v2_my_modules:m, v2_my_navigation:m,
      v2_players:[{ id:'p1', first_name:'Adan', last_name:'Ibarra', status:'active', category:'Sub-12' }],
      v2_player_profile:{ player:{ id:'p1', firstName:'Adan', lastName:'Ibarra', status:'active', category:'Sub-12' }, guardians:[] },
      v2_player_account_statement:ESTADO,
      v2_billing_players:[{ player_id:'p1', player_name:'Adán Ibarra', last_payment_date:'2026-10-05' },{ player_id:'p2', player_name:'Ana Sofía', last_payment_date:null }],
      v2_open_receivables:[], v2_search_index:[], v2_club_config:null, v2_collection_snapshot:null
    };
    window.__fakeSupabase = {
      auth:{ getSession:async()=>({data:{session:{user:{id:'u1'}}}}), getUser:async()=>({data:{user:{id:'u1',app_metadata:{}}}}), onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}) },
      rpc:async(n,params)=>{ window.__llamadas.push(n); return { data:R[n] ?? null, error:null }; },
      storage:{ from:()=>({ createSignedUrl:async()=>({data:null}), createSignedUrls:async()=>({data:[]}) }) },
      channel:()=>({ on(){return this;}, subscribe(){return this;} }), removeChannel(){}
    };
  }, { rol, mods:MODS[rol], ESTADO });
  await p.route('**/v2/supabase-client.js', r => r.fulfill({ status:200, contentType:'text/javascript', body:'export function createClient(){ return window.__fakeSupabase; }' }));
  await p.route('**/v2/photo-cache.js', r => r.fulfill({ status:200, contentType:'text/javascript',
    body:'export async function getSignedPhotoUrls(){return {};}export async function getSignedPhotoUrl(){return null;}export async function getRawSignedPhotoUrl(){return null;}export async function clearPhotoCache(){}export function forgetPhoto(){}' }));
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.goto(`http://127.0.0.1:4771${ruta}`, { waitUntil:'domcontentloaded' });
  return p;
}

/* ---------- Ficha: Presidencia ---------- */
{
  const p = await abre('Presidencia', '/v2/jugadores/?player=p1');
  // Desde el rediseño de la ficha, los pagos viven en su pestaña.
  await p.waitForSelector('[data-ficha-tab="pagos"]', { timeout:8000 });
  await p.click('[data-ficha-tab="pagos"]');
  await p.waitForSelector('#pagosSnapshot .pagos-kpis', { timeout:8000 });
  const t = (await p.innerText('#pagosSnapshot')).replace(/\s+/g,' ');
  revisa('[ficha] sale la sección Pagos', await p.isVisible('#pagosSnapshot'));
  revisa('[ficha] dice cuánto ha pagado', /Ha pagado \$3,400\.00/i.test(t), t.slice(0,200));
  revisa('[ficha] dice cuánto debe y desde cuándo', /Debe \$800\.00 · desde 10 sept?\.? 2026/.test(t), t.slice(0,200));
  revisa('[ficha] saldo a favor', /Saldo a favor \$650\.00/i.test(t));
  const filas = await p.$$eval('#pagosSnapshot .pagos-fila', els => els.map(e => e.textContent.replace(/\s+/g,' ').trim()));
  revisa('[ficha] sólo los últimos 5 pagos', filas.length === 5, JSON.stringify(filas));
  revisa('[ficha] el más reciente primero', /Mensualidad.*5 oct\.? 2026.*Efectivo.*\$550\.00/.test(filas[0]||''), filas[0]);
  revisa('[ficha] incluye pagos de tienda', filas.some(f => /Pedido de tienda.*\$450\.00/.test(f)));
  revisa('[ficha] los cargos no se cuentan como pago', !filas.some(f => /octubre/.test(f)));
  revisa('[ficha] método en español', filas.some(f => /Transferencia/.test(f)) && filas.some(f => /Tarjeta/.test(f)));
  revisa('[ficha] un concepto con HTML sale como texto', !(await p.$('#pagosSnapshot .pagos-fila b b')));
  const href = await p.getAttribute('#pagosSnapshot .pagos-todo', 'href');
  revisa('[ficha] enlaza al historial completo', href === '/tanner/?id=p1', href);
  revisa('[ficha] avisa cuántos pagos hay en total', /\(6 pagos\)/.test(t), t.slice(-80));
  await p.close();
}

/* ---------- Ficha: profe ---------- */
{
  const p = await abre('Formadores', '/v2/jugadores/?player=p1');
  await p.waitForFunction(() => window.__llamadas.includes('v2_player_profile'), null, { timeout:8000 });
  await p.waitForTimeout(400);
  revisa('[profe] no ve la sección Pagos', await p.isHidden('#pagosSnapshot'));
  revisa('[profe] ni se pide el estado de cuenta', !(await p.evaluate(() => window.__llamadas.includes('v2_player_account_statement'))));
  await p.close();
}

/* ---------- Finanzas ---------- */
{
  const p = await abre('Presidencia', '/v2/finanzas/');
  await p.waitForSelector('#edoBusca', { timeout:8000 });
  revisa('[finanzas] está el buscador de estado de cuenta', await p.isVisible('#edoBusca'));
  await p.fill('#edoBusca', 'adan');
  const filas = await p.$$eval('#edoLista a', els => els.map(e => ({ t:e.textContent.replace(/\s+/g,' ').trim(), h:e.getAttribute('href') })));
  revisa('[finanzas] encuentra sin acentos', filas.length === 1 && /Adán Ibarra/.test(filas[0].t), JSON.stringify(filas));
  revisa('[finanzas] dice su último pago', /Último pago: 5 oct\.? 2026/.test(filas[0]?.t||''));
  revisa('[finanzas] abre su estado de cuenta', filas[0]?.h === '/tanner/?id=p1', filas[0]?.h);
  await p.fill('#edoBusca', 'zzz');
  revisa('[finanzas] sin coincidencias lo dice', /Ningún Tanner/.test(await p.textContent('#edoLista')));
  await p.close();
}
{
  const p = await abre('Taquilla', '/v2/finanzas/');
  await p.waitForFunction(() => document.getElementById('hubSubtitle')?.textContent !== 'Cargando...', null, { timeout:8000 });
  await p.waitForTimeout(400);
  revisa('[finanzas · Taquilla] la ventanilla no ve el buscador', (await p.$$('#edoBusca')).length === 0);
  await p.close();
}

await nav.close(); srv.close();
let mal = 0;
for (const r of revisiones) if (!r.ok) { mal++; console.error(` - ${r.nombre}${r.detalle ? ' :: ' + r.detalle : ''}`); }
if (errores.length) { console.error('ERRORES DEL NAVEGADOR:'); errores.forEach(e => console.error('   ' + e)); }
if (mal || errores.length) { console.error(`Historial de pagos humo FAILED · ${mal} de ${revisiones.length}, ${errores.length} errores`); process.exit(1); }
console.log(`Historial de pagos humo OK · ${revisiones.length} revisiones: ficha con pagos, profe sin dinero y buscador en Finanzas`);
