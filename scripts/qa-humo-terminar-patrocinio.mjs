/* TERMINAR PATROCINIO.
 *
 * Pedido (06/10/2026, revisión de becas): un patrocinio (lo paga un
 * patrocinador) no se podía terminar; el servidor lo rechazaba como beca.
 * Caso real: Luis André Murillo dado de baja con Curtibrother activo, y el de
 * Dario Montalvo vence el 31 de octubre.
 *
 * Esta prueba levanta /v2/jugadores/ REAL con un Supabase falso y revisa que
 * el patrocinio tenga su botón "Terminar patrocinio", avise que la familia
 * pasa a pagar completo, exija motivo y llame a v2_end_sponsor_funding; y que
 * una beca normal siga usando v2_end_player_benefit.
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
await new Promise(r => srv.listen(4793, r));

const HOY = new Date().toISOString().slice(0,10);
const hace = d => new Date(Date.now() - d*86400000).toISOString().slice(0,10);
const ESTADO = {
  player:{ id:'p1', first_name:'Marcelo', last_name:'Pedroza' },
  summary:{ balance:1600, paid_total:3200, credit_available:0 },
  ledger:[
    { id:'c3', kind:'charge', subtype:'monthly_fee', period:hace(5).slice(0,8)+'01', date:hace(-5), amount:800, charge_balance:800 },
    { id:'c2', kind:'charge', subtype:'monthly_fee', period:hace(35).slice(0,8)+'01', date:hace(30), amount:800, charge_balance:800 },
    { id:'pay', kind:'payment', status:'posted', date:hace(60), amount:-800, method:'cash' },
    { id:'c1', kind:'charge', subtype:'monthly_fee', period:hace(65).slice(0,8)+'01', date:hace(60), amount:800, charge_balance:0 }
  ],
  other_payments:[], orders:[{ folio:'TC-0142', total:650, paid:400, status:'in_production' },{ folio:'TC-0100', total:300, paid:300, status:'delivered' }]
};
const MODS = {
  Presidencia:{ my:[['players',true],['billing',true],['accounting',true],['jugadores_familia',true],['jugadores_estado',true]],
                nav:[['jugadores',true],['cobranza',true],['contabilidad',true],['taquilla',true],['asistencia',true]] },
  Formadores:{ my:[['players',true]], nav:[['jugadores',true],['asistencia',true]] }
};

const revisiones = [], errores = [];
const revisa = (n, ok, d='') => revisiones.push({ nombre:n, ok, detalle:d });
const nav = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });

async function abre(rol, ancho=390) {
  const p = await nav.newPage({ viewport:{ width:ancho, height:844 } });
  p.on('pageerror', e => errores.push(`[${rol}] pageerror: ${e.message}`));
  await p.addInitScript(({ rol, m, ESTADO }) => {
    window.__llamadas = [];
    const mk = l => l.map(([c,w]) => ({ module_code:c, enabled:true, can_read:true, can_write:w }));
    const R = {
      v2_my_context:[{ user_id:'u1', display_name:'Mich', organization_id:'o1', organization_name:'Tannery City FC', role:rol, is_owner:rol==='Presidencia' }],
      v2_my_modules:mk(m.my), v2_my_navigation:mk(m.nav), v2_can_set_joined_at:false,
      v2_players:[{ id:'p1', first_name:'Marcelo', last_name:'Pedroza Ortiz', status:'active', category:'Mini Baby Tanner', code:'Tanner072' }],
      v2_categories:[], v2_withdrawal_requests:[], v2_benefit_requests:[],
      v2_player_profile:{ player:{ id:'p1', firstName:'Marcelo', lastName:'Pedroza Ortiz', status:'active', category:'Mini Baby Tanner', code:'Tanner072',
          position:null, dominantFoot:'Derecha', photoPath:'x.webp', dataConsent:true, dataConsentAt:'2026-08-23', imageConsent:false, imageConsentAt:'2026-08-23' },
        guardians:[{ name:'Laura Ortiz', phone:'4771112233', relationship:'Mamá', isPrimary:true, receivesBilling:true },{ name:'Pedro Pedroza', phone:null, relationship:'Papá', isPrimary:false }] },
      v2_player_account_statement:ESTADO,
      v2_player_benefits:[{ id:'b1', type:'scholarship_partial', percentage:50, sponsorName:'Don Trapo', endsOn:'2026-12-31', active:true },{ id:'b2', type:'sponsor_funded', sponsorName:'Curtibrother', amount:800, active:true }],
      v2_end_sponsor_funding:[{ id:'b1', type:'scholarship_partial', percentage:50, sponsorName:'Don Trapo', endsOn:'2026-12-31', active:true }],
      v2_end_player_benefit:[{ id:'b2', type:'sponsor_funded', sponsorName:'Curtibrother', amount:800, active:true }],
      v2_player_documents:[{ type:'birth_certificate', received:false },{ type:'curp', received:true, receivedAt:'2026-08-20' },{ type:'studies', received:true }],
      v2_player_sports:{ summary:{ played:0 }, evaluations:[] },
      v2_attendance_player:{ current:{ scheduled:14, attended:12, pct:85.7 } },
      v2_player_story:{ siblings:[{ id:'p2', name:'Milan Pedroza', category:'Baby Tanner', status:'active' }],
        timeline:[{ kind:'category', date:'2026-08-19', title:'Categoría Mini Baby Tanner' },{ kind:'joined', date:'2026-02-10', title:'Entró al club' }] }
    };
    window.__fakeSupabase = {
      auth:{ getSession:async()=>({data:{session:{user:{id:'u1'}}}}), getUser:async()=>({data:{user:{id:'u1'}}}), onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}) },
      rpc:async(n,params)=>{ window.__llamadas.push(n); (window.__params ||= {})[n]=params; return { data:R[n] ?? null, error:null }; },
      storage:{ from:()=>({ createSignedUrl:async()=>({data:null}), createSignedUrls:async()=>({data:[]}) }) },
      channel:()=>({ on(){return this;}, subscribe(){return this;} }), removeChannel(){}
    };
  }, { rol, m:MODS[rol], ESTADO });
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.route('**/v2/supabase-client.js', r => r.fulfill({ status:200, contentType:'text/javascript', body:'export function createClient(){ return window.__fakeSupabase; }' }));
  await p.route('**/v2/photo-cache.js', r => r.fulfill({ status:200, contentType:'text/javascript',
    body:'export async function getSignedPhotoUrls(){return {};}export async function getSignedPhotoUrl(){return "/icon-512.png";}export async function getRawSignedPhotoUrl(){return null;}export async function clearPhotoCache(){}export function forgetPhoto(){}' }));
  await p.goto('http://127.0.0.1:4793/v2/jugadores/?player=p1', { waitUntil:'domcontentloaded' });
  await p.waitForSelector('#fichaTabs button', { timeout:8000 });
  await p.waitForFunction(() => window.__llamadas.includes('v2_player_story') && window.__llamadas.includes('v2_player_documents'), null, { timeout:6000 });
  await p.waitForTimeout(500);
  return p;
}

/* ---------- Presidencia termina un patrocinio ---------- */
{
  const p = await abre('Presidencia');
  await p.click('[data-ficha-tab="pagos"]');
  await p.waitForSelector('#benefitsList [data-benend="b2"]', { timeout:6000 });
  const botones = await p.$$eval('#benefitsList [data-benend]', b => b.map(x => x.dataset.benend + '=' + x.textContent.trim()));
  revisa('[botón] el patrocinio dice "Terminar patrocinio" y la beca "Terminar"', botones.includes('b2=Terminar patrocinio') && botones.includes('b1=Terminar'), JSON.stringify(botones));

  await p.click('#benefitsList [data-benend="b2"]');
  await p.waitForSelector('.tosdlg', { timeout:3000 });
  const dlg = (await p.innerText('.tosdlg')).replace(/\s+/g,' ');
  revisa('[aviso] avisa que la familia paga completa y quién dejaba de cubrir', /PATROCINIO/.test(dlg) && /la familia paga la mensualidad completa/.test(dlg) && /Curtibrother deja de cubrirla/.test(dlg), dlg);
  revisa('[aviso] el botón rojo dice Terminar patrocinio', (await p.innerText('.tosdlg-ok.danger')).trim() === 'Terminar patrocinio');
  await p.click('.tosdlg-ok');
  revisa('[motivo] sin motivo no avanza', await p.isVisible('.tosdlg') && /Escribe por qué termina/.test(await p.innerText('.tosdlg-req')));
  await p.fill('.tosdlg-field', 'El Tanner se dio de baja');
  await p.click('.tosdlg-ok');
  await p.waitForFunction(() => window.__llamadas.includes('v2_end_sponsor_funding'), null, { timeout:4000 }).catch(()=>{});
  const prm = await p.evaluate(() => window.__params?.v2_end_sponsor_funding);
  revisa('[servidor] usa v2_end_sponsor_funding con motivo', prm?.benefit_id === 'b2' && prm?.player_id === 'p1' && prm?.reason === 'El Tanner se dio de baja', JSON.stringify(prm));
  revisa('[servidor] no usa la función de becas', !(await p.evaluate(() => window.__llamadas.includes('v2_end_player_benefit'))));
  await p.waitForTimeout(300);
  revisa('[lista] el patrocinio ya no sale activo', !(await p.$('#benefitsList [data-benend="b2"]')));

  // Una beca normal sigue por su camino de siempre.
  await p.click('#benefitsList [data-benend="b1"]');
  await p.waitForSelector('.tosdlg', { timeout:3000 });
  revisa('[beca] la beca sigue diciendo Terminar apoyo', (await p.innerText('.tosdlg-ok')).trim() === 'Terminar apoyo');
  await p.fill('.tosdlg-field', 'Cambió la situación');
  await p.click('.tosdlg-ok');
  await p.waitForFunction(() => window.__llamadas.includes('v2_end_player_benefit'), null, { timeout:4000 }).catch(()=>{});
  revisa('[beca] usa v2_end_player_benefit', await p.evaluate(() => window.__params?.v2_end_player_benefit?.benefit_id === 'b1'));
  await p.close();
}

await nav.close(); srv.close();
let mal = 0;
for (const r of revisiones) if (!r.ok) { mal++; console.error(` - ${r.nombre}${r.detalle ? ' :: ' + r.detalle : ''}`); }
if (errores.length) { console.error('ERRORES DEL NAVEGADOR:'); errores.forEach(e => console.error('   ' + e)); }
if (mal || errores.length) { console.error(`Terminar patrocinio humo FAILED · ${mal} de ${revisiones.length}, ${errores.length} errores`); process.exit(1); }
console.log(`Terminar patrocinio humo OK · ${revisiones.length} revisiones: botón propio, aviso a la familia, motivo obligatorio y función correcta`);
