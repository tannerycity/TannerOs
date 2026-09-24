// Validación y conciliación de pagos, en el navegador.
//
// Lo que este humo protege:
//   1. Que sólo Presidencia vea los botones de aprobar / rechazar / aclarar.
//   2. Que a un pago en efectivo no se le llame "conciliación bancaria".
//   3. Que los 322 pagos anteriores no se presenten como revisados.
//   4. Que rechazar avise que la deuda vuelve, y exija motivo.
//   5. Que Taquilla vea la barra sólo cuando tiene algo que responder.
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const TIPOS = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.json':'application/json', '.png':'image/png' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'content-type': TIPOS[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
await new Promise(r => server.listen(4605, r));

const revisiones = [];
const revisa = (nombre, ok, detalle = '') => revisiones.push({ nombre, ok, detalle });

async function corre(rol) {
  const errores = [];
  const ESPERADO = /esm\.sh\/@supabase/;
  const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const pagina = await navegador.newPage({ viewport: { width: 390, height: 844 } });
  pagina.on('pageerror', e => errores.push(`[${rol}] pageerror: ${e.message}`));
  pagina.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text(), url = m.location()?.url || '';
    if (ESPERADO.test(t) || ESPERADO.test(url)) return;
    errores.push(`[${rol}] console: ${t} (${url})`);
  });
  pagina.on('requestfailed', r => { if (!ESPERADO.test(r.url())) errores.push(`[${rol}] requestfailed: ${r.url()}`); });

  await pagina.route('**/v2/shell.js', route => route.fulfill({
    status: 200, contentType: 'text/javascript',
    body: `
      const ROL = ${JSON.stringify(rol)};
      const esPres = ROL === 'Presidencia';
      const YO = esPres ? 'u-pres' : 'u-taq';
      const BASE = [
        { paymentId:'x1', date:'2026-09-22', createdAt:'2026-09-22T18:00:00Z', playerId:'p1',
          playerName:'Iker Flores', family:'Familia Flores', concept:'Mensualidad', period:'2026-09',
          amount:450, expectedAmount:500, difference:-50, method:'Transferencia', validationKind:'banco',
          reference:'BBVA-1120', receiptPath:null, observations:'Quedó a deber 50',
          registeredBy:'Ana de Taquilla', registeredByIsAccount:false, registeredByUserId:'u-taq',
          status:'pending', reconciledAt:null, reconciledBy:null, reconciliationNote:null,
          reconciliationReference:null, legacyApproved:false,
          history:[{at:'2026-09-22T18:00:00Z',from:null,to:'pending',reason:null,by:'Ana de Taquilla',selfApproved:false}] },
        { paymentId:'x2', date:'2026-09-21', createdAt:'2026-09-21T17:00:00Z', playerId:'p2',
          playerName:'Leonardo Preciado', family:'Familia Preciado', concept:'Mensualidad', period:'2026-09',
          amount:500, expectedAmount:500, difference:0, method:'Efectivo', validationKind:'corte_de_caja',
          reference:null, receiptPath:null, observations:null,
          registeredBy:'iPad', registeredByIsAccount:true, registeredByUserId:'u-taq',
          status:'clarification', reconciledAt:'2026-09-22T09:00:00Z', reconciledBy:'Michel Enríquez',
          reconciliationNote:'¿Ese efectivo entró al corte del lunes?', reconciliationReference:null,
          legacyApproved:false,
          history:[{at:'2026-09-22T09:00:00Z',from:'pending',to:'clarification',reason:'¿Ese efectivo entró al corte del lunes?',by:'Michel Enríquez',selfApproved:false}] },
        { paymentId:'x3', date:'2026-07-04', createdAt:'2026-07-04T12:00:00Z', playerId:'p3',
          playerName:'Ana Sofía Enríquez', family:'Familia Enríquez', concept:'Mensualidad', period:'2026-07',
          amount:400, expectedAmount:null, difference:null, method:'Efectivo', validationKind:'corte_de_caja',
          reference:null, receiptPath:null, observations:null,
          registeredBy:'Presidencia', registeredByIsAccount:true, registeredByUserId:'u-pres',
          status:'approved', reconciledAt:null, reconciledBy:null, reconciliationNote:null,
          reconciliationReference:null, legacyApproved:true, history:[] }
      ];
      const BANDEJA = {
        canApprove: esPres,
        seesEverything: esPres,
        rows: esPres ? BASE : BASE.filter(r => r.registeredByUserId === YO),
        summary: { pending: esPres?1:1, pendingAmount: 450, clarification: 1, rejected: 0,
                   approvedToday: 0, withDifference: 1, differenceTotal: -50, total: esPres?3:2 }
      };
      window.__rpc = [];
      export const supabase = { auth:{
        getSession:async()=>({data:{session:{user:{id:YO}}}}),
        getUser:async()=>({data:{user:{id:YO,app_metadata:{}}}}),
        signOut:async()=>({}),
        onAuthStateChange(){ return {data:{subscription:{unsubscribe(){}}}}; } } };
      export const money = new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:2});
      export const $ = id => document.getElementById(id);
      export async function rpc(name, params={}){
        window.__rpc.push({name, params});
        if(name==='v2_payments_to_reconcile') return BANDEJA;
        if(name==='v2_reconcile_payment') return { status:'approved', allocationsReversed:0, selfApproved:false };
        if(name==='v2_resubmit_payment') return true;
        if(name==='v2_collection_amounts') return { billingPeriod:'2026-09-01', canSeeBenefitDetail:esPres, rows:[], summary:{categoriesWithoutFee:0} };
        if(name==='v2_category_fees') return [];
        if(name==='v2_movement_audit') return { kind:'expense', date:'2026-09-23', amount:600,
          concept:'5 balones', status:'posted',
          declared:{ label:'Pagó', name:'Michel', counterparty:'Dani amigo Brandon' },
          audited:{ account:'iPad', role:'Taquilla', at:'2026-09-24T02:00:35Z', source:'cashier' },
          declaredDiffersFromAccount:true };
        if(name==='v2_cashier_snapshot') return { businessDate:'2026-09-23', incomeTotal:0, expenseTotal:0,
          netTotal:0, expectedCash:0, cashTodayNet:0, methods:[],
          // El egreso real que destapó esto: dice "Pagó: Michel" y lo capturó
          // la cuenta iPad.
          movements:[{ id:'mv1', type:'expense', date:'2026-09-23', createdAt:'2026-09-24T02:00:35Z',
            category:'Utilería', concept:'5 balones', who:'Dani amigo Brandon', playerName:null,
            method:'Efectivo', amount:600, status:'posted', source:'cashier', reference:null,
            playerId:null, registeredBy:'Michel', registeredByIsAccount:false }],
          canViewLedger: esPres };
        if(name==='v2_billing_players') return [];
        if(name==='v2_open_receivables') return [];
        return null;
      }
      export function moduleAccess(rows, code, write=false){
        const m = { taquilla:{r:true,w:true}, cobranza:{r:esPres,w:esPres}, contabilidad:{r:false,w:false} };
        const e = m[code]; if(!e) return false; return write ? e.w : e.r;
      }
      export function setShellHealth(){}
      export function navigationMap(){ return new Map(); }
      export function setShellSearchItems(){}
      export function renderShell(){}
      export async function bootstrapProtectedShell(){
        return { ctx:{ user_id:YO, organization_id:'o1', organization_name:'Tannery City FC',
                       role:ROL, is_owner:esPres }, navigation:[] };
      }
      export const shellIcon = () => '';
      export const navItems = [];
    `
  }));
  await pagina.route('**/v2/photo-cache.js', route => route.fulfill({
    status: 200, contentType: 'text/javascript',
    body: ['export async function getSignedPhotoUrls(){ return {}; }',
           'export async function getSignedPhotoUrl(){ return null; }',
           'export async function getRawSignedPhotoUrl(){ return null; }',
           'export function clearPhotoCache(){}',
           'export function forgetPhoto(){}'].join('\n')
  }));

  await pagina.goto('http://127.0.0.1:4605/v2/taquilla/', { waitUntil: 'networkidle' });
  // La barra "Validación y conciliación de pagos" desapareció: era una quinta
  // puerta en una pantalla que ya tenía cuatro. Ahora es una pestaña más del
  // selector "Ver", y el contador de pendientes viaja como globo encima.
  await pagina.waitForSelector('[data-vista="concilia"]', { timeout: 8000, state: 'attached' });
  revisa(`[${rol}] ya no hay una barra aparte para conciliar`,
    (await pagina.$$('#openConcilia')).length === 0);
  revisa(`[${rol}] el globo cuenta 2 (pendiente + aclaración)`,
    (await pagina.textContent('[data-vista="concilia"] .ver-badge')).trim() === '2');

  await pagina.click('[data-vista="concilia"]');
  await pagina.waitForSelector('.concilia-card', { timeout: 6000 });

  // Arranca en Pendientes
  revisa(`[${rol}] arranca filtrado en pendientes`, (await pagina.$$('.concilia-card')).length === 1);

  const kpis = (await pagina.textContent('#conciliaKpis')).replace(/\s+/g, ' ');
  revisa(`[${rol}] muestra el monto pendiente`, /\$450\.00/.test(kpis), kpis.slice(0, 200));
  revisa(`[${rol}] muestra la diferencia contra lo esperado`, /-\$50\.00/.test(kpis), kpis.slice(0, 220));

  const tarjeta = (await pagina.textContent('.concilia-card')).replace(/\s+/g, ' ');
  revisa(`[${rol}] la tarjeta dice el periodo`, /periodo 2026-09/.test(tarjeta), tarjeta.slice(0, 160));
  revisa(`[${rol}] a una transferencia le llama conciliación bancaria`, /Conciliación bancaria/.test(tarjeta));
  revisa(`[${rol}] señala el faltante`, /Faltaron \$50\.00/.test(tarjeta), tarjeta.slice(0, 300));
  revisa(`[${rol}] no repite el monto en el faltante`, !/Faltaron 50/.test(tarjeta), tarjeta.slice(0, 300));
  revisa(`[${rol}] dice quién cobró`, /Ana de Taquilla/.test(tarjeta));

  // Efectivo: NO conciliación bancaria
  await pagina.click('[data-concilia-filter="clarification"]');
  await pagina.waitForTimeout(150);
  const efectivo = (await pagina.textContent('.concilia-card')).replace(/\s+/g, ' ');
  revisa(`[${rol}] a un pago en efectivo NO le llama conciliación bancaria`,
    /corte de caja/i.test(efectivo) && !/Conciliación bancaria/.test(efectivo), efectivo.slice(0, 260));
  revisa(`[${rol}] una cuenta compartida no se hace pasar por persona`,
    /Desde iPad · sin nombre/.test(efectivo), efectivo.slice(0, 260));

  if (rol === 'Presidencia') {
    // El pago viejo no se presenta como revisado
    await pagina.click('[data-concilia-filter="approved"]');
    await pagina.waitForTimeout(150);
    const viejo = (await pagina.textContent('.concilia-card')).replace(/\s+/g, ' ');
    revisa(`[${rol}] un pago anterior dice "Del sistema anterior"`, /Del sistema anterior/.test(viejo), viejo.slice(0, 200));
    revisa(`[${rol}] un pago anterior no ofrece acciones`,
      (await pagina.$$('.concilia-card .concilia-acciones button')).length === 0);

    // Acciones sobre el pendiente
    await pagina.click('[data-concilia-filter="pending"]');
    await pagina.waitForTimeout(150);
    const botones = await pagina.$$eval('.concilia-card .concilia-acciones button', b => b.map(x => x.textContent.trim()));
    revisa(`[${rol}] puede aprobar, aclarar y rechazar`,
      botones.includes('Aprobar') && botones.includes('Solicitar aclaración') && botones.includes('Rechazar'),
      botones.join(' | '));

    // Rechazar exige motivo y avisa de la deuda
    await pagina.click('.concilia-card button[data-accion="reject"]');
    await pagina.waitForSelector('#conciliaModal:not(.hidden)', { timeout: 4000 });
    const aviso = (await pagina.textContent('#conciliaModalWhat')).replace(/\s+/g, ' ');
    revisa(`[${rol}] al rechazar avisa que la deuda vuelve`, /la deuda de ese periodo vuelve a aparecer/.test(aviso), aviso);
    revisa(`[${rol}] al rechazar no pide referencia de conciliación`,
      await pagina.isHidden('#conciliaRefWrap'));
    await pagina.click('#conciliaConfirm');
    await pagina.waitForTimeout(250);
    const msg = await pagina.textContent('#conciliaModalMessage');
    revisa(`[${rol}] rechazar sin motivo no pasa`, /Escribe el motivo/.test(msg), msg);
    const llamadasRechazo = await pagina.evaluate(() => window.__rpc.filter(r => r.name === 'v2_reconcile_payment'));
    revisa(`[${rol}] no se mandó nada al backend sin motivo`, llamadasRechazo.length === 0, JSON.stringify(llamadasRechazo));

    // Con motivo sí pasa
    await pagina.fill('#conciliaReason', 'El depósito nunca entró al banco');
    await pagina.click('#conciliaConfirm');
    await pagina.waitForTimeout(400);
    const enviado = await pagina.evaluate(() => window.__rpc.filter(r => r.name === 'v2_reconcile_payment'));
    revisa(`[${rol}] con motivo sí manda el rechazo`,
      enviado.length === 1 && enviado[0].params.action === 'reject'
      && /nunca entró al banco/.test(enviado[0].params.reason), JSON.stringify(enviado).slice(0, 250));

    // Aprobar sí pide referencia
    await pagina.click('[data-concilia-filter="pending"]');
    await pagina.waitForTimeout(200);
    await pagina.click('.concilia-card button[data-accion="approve"]');
    await pagina.waitForSelector('#conciliaModal:not(.hidden)', { timeout: 4000 });
    revisa(`[${rol}] al aprobar sí pide la referencia de conciliación`,
      await pagina.isVisible('#conciliaRefWrap'));
    await pagina.click('#conciliaModal .close-modal');
    await pagina.waitForTimeout(200);
    // La cruz tiene que cerrar de verdad: antes .close-modal no estaba
    // conectado a nada en esta pantalla y el modal se quedaba encima.
    revisa(`[${rol}] la cruz cierra el modal`, await pagina.isHidden('#conciliaModal'));
    revisa(`[${rol}] y quita el fondo oscuro`, await pagina.isHidden('#modalBackdrop'));
    // La captura se toma con la bandeja a la vista, sin modal encima.
    await pagina.click('[data-concilia-filter=""]');
    await pagina.waitForTimeout(250);

    // La casilla de registrar y aprobar es sólo de Presidencia
    revisa(`[${rol}] ve la casilla de registrar y aprobar`,
      !(await pagina.getAttribute('#collectApproveWrap', 'class')).includes('hidden'));

    await pagina.screenshot({ path: path.join(RAIZ, 'docs/evidencias/taquilla-conciliacion.png'), fullPage: true });
  } else {
    // Taquilla: ni un solo botón de Presidencia
    await pagina.click('[data-concilia-filter="pending"]');
    await pagina.waitForTimeout(150);
    const botones = await pagina.$$eval('.concilia-card .concilia-acciones button', b => b.map(x => x.textContent.trim()));
    revisa(`[${rol}] NO puede aprobar ni rechazar`,
      !botones.includes('Aprobar') && !botones.includes('Rechazar') && !botones.includes('Solicitar aclaración'),
      botones.join(' | '));

    // Pero sí responde su aclaración
    await pagina.click('[data-concilia-filter="clarification"]');
    await pagina.waitForTimeout(150);
    const suyos = await pagina.$$eval('.concilia-card .concilia-acciones button', b => b.map(x => x.textContent.trim()));
    revisa(`[${rol}] sí puede responder su aclaración`, suyos.includes('Responder aclaración'), suyos.join(' | '));

    revisa(`[${rol}] NO ve la casilla de registrar y aprobar`,
      (await pagina.getAttribute('#collectApproveWrap', 'class')).includes('hidden'));

    // Sólo ve sus propios cobros
    await pagina.click('[data-concilia-filter=""]');
    await pagina.waitForTimeout(150);
    const nombres = await pagina.$$eval('.concilia-card .concilia-quien strong', e => e.map(x => x.textContent.trim()));
    revisa(`[${rol}] no ve los cobros de otras cuentas`, !nombres.includes('Ana Sofía Enríquez'), nombres.join(' | '));
  }

  /* ¿QUIÉN REGISTRÓ ESTE MOVIMIENTO, DE VERDAD?
     El club reportó un egreso de $600 que decía "Pagó: Michel" y lo había
     capturado la cuenta iPad. El nombre tecleado tapaba a la cuenta real.
     Se vigila que el texto escrito ya no se presente como prueba y que el
     dato duro esté a un toque. */
  if (rol === 'Presidencia') {
    await pagina.click('[data-vista="caja"]');
    await pagina.waitForSelector('[data-audit="mv1"]', { timeout: 6000 });
    const fila = (await pagina.textContent('#movementRows')).replace(/\s+/g, ' ');
    revisa(`[${rol}] el nombre tecleado se marca como escrito, no como prueba`,
      /Pagó: Michel \(escrito\)/.test(fila), fila.slice(0, 220));

    await pagina.click('[data-audit="mv1"]');
    await pagina.waitForSelector('#auditModal:not(.hidden)', { timeout: 6000 });
    const audit = (await pagina.textContent('#auditBody')).replace(/\s+/g, ' ');
    revisa(`[${rol}] dice desde qué cuenta se guardó`, /iPad · Taquilla/.test(audit), audit.slice(0, 260));
    revisa(`[${rol}] separa lo escrito a mano de lo auditado`,
      /texto escrito a mano/.test(audit) && /Michel/.test(audit), audit.slice(0, 320));
    revisa(`[${rol}] avisa cuando el nombre escrito no es la cuenta`,
      /El nombre escrito no es la cuenta que lo guardó/.test(audit), audit.slice(0, 420));
    revisa(`[${rol}] advierte que una cuenta compartida no dice la persona`,
      /Una cuenta por persona/.test(audit), audit.slice(-200));

    await pagina.click('#auditModal .close-modal');
    await pagina.waitForTimeout(200);
    revisa(`[${rol}] la cruz cierra el detalle`, await pagina.isHidden('#auditModal'));
  }

  const desborde = await pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  revisa(`[${rol}] no hay scroll horizontal en iPhone`, !desborde);

  await navegador.close();
  return errores;
}

const errores = [...(await corre('Presidencia')), ...(await corre('Taquilla'))];
server.close();

let mal = 0;
for (const r of revisiones) { if (!r.ok) { mal++; console.error(` - ${r.nombre}${r.detalle ? ' :: ' + r.detalle : ''}`); } }
if (errores.length) { console.error('ERRORES DEL NAVEGADOR:'); errores.forEach(e => console.error('   ' + e)); }
if (mal || errores.length) { console.error(`Humo Conciliación FAILED · ${mal} de ${revisiones.length}, ${errores.length} errores`); process.exit(1); }
console.log(`Humo Conciliación OK · ${revisiones.length} revisiones en Chromium a 390px (Presidencia y Taquilla), 0 errores`);
