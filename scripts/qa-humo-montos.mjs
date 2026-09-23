// Montos de cobro en Taquilla: cuánto cobrarle a cada Tanner.
//
// Lo que este humo protege:
//   1. Que el panel sea visible para Taquilla. Hay una línea que des-oculta
//      todo .cashier-panel según canViewLedger; si alguien la toca sin
//      excluir #montosPanel, el panel se abre solo para los demás roles y se
//      esconde justo para quien lo pidió.
//   2. Que cuando la categoría no tiene tarifa, la pantalla lo DIGA en vez de
//      inventar un ordinario.
//   3. Que el PDF salga de lo filtrado y no lleve la nota interna.
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
await new Promise(r => server.listen(4603, r));

const revisiones = [];
const revisa = (nombre, ok, detalle = '') => revisiones.push({ nombre, ok, detalle });

// Se corre dos veces: como Taquilla (sin ledger, sin export) y como
// Presidencia (con todo).
async function corre(rol) {
  const errores = [];
  const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const pagina = await navegador.newPage({ viewport: { width: 390, height: 844 } });
  pagina.on('pageerror', e => errores.push(`[${rol}] pageerror: ${e.message}`));
  // Sin salida a internet, el CDN de supabase-js no se alcanza. Es limite del
  // entorno, no del producto: la pantalla bajo prueba no lo usa, porque
  // shell.js va sustituido. Se filtra ESE url por nombre; cualquier otro
  // fallo de red o de consola sigue tumbando la prueba.
  const ESPERADO = /esm\.sh\/@supabase/;
  pagina.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    // "Failed to load resource" no trae el url en el texto: viene en
    // location(). Se mira ahi, para no filtrar un 404 de verdad.
    const url = m.location()?.url || '';
    if (ESPERADO.test(t) || ESPERADO.test(url)) return;
    errores.push(`[${rol}] console: ${t} (${url})`);
  });
  pagina.on('requestfailed', r => {
    if (ESPERADO.test(r.url())) return;
    errores.push(`[${rol}] requestfailed: ${r.url()} :: ${r.failure()?.errorText}`);
  });

  await pagina.route('**/v2/shell.js', route => route.fulfill({
    status: 200, contentType: 'text/javascript',
    body: `
      const ROL = ${JSON.stringify(rol)};
      const esTaquilla = ROL === 'Taquilla';
      let MONTOS = {
        billingPeriod: '2026-09-01',
        canSeeBenefitDetail: !esTaquilla,
        rows: [
          { playerId:'p1', name:'Ana Sofia Enríquez Uc', code:'TC-1', categoryId:'c1', categoryName:'Baby Tanner',
            family:'Michel Enríquez', ordinaryFee:null, chargedFee:0, exempt:true, benefitTotal:null, feeSource:'beca',
            benefits:[{type:'scholarship_full',label:'Beca total',clubLabel:'Total',calculation:'full_waiver',affectsAmount:true,endsOn:null,
                       fixedAmount: esTaquilla?null:0, percentage: esTaquilla?null:100}],
            validityStatus:'sin_vencimiento', validUntil:null, toCollect:200, outstanding:200, collectionNote:null },
          { playerId:'p2', name:'Dario Montalvo Díaz', code:'TC-2', categoryId:'c2', categoryName:'T10',
            family:'Familia Montalvo', ordinaryFee:500, chargedFee:500, exempt:false, benefitTotal:0, feeSource:'beca',
            benefits:[{type:'sponsor_funded',label:'Patrocinado',clubLabel:'Parcial por Curtibrother Bruno',calculation:'fixed_amount',affectsAmount:true,endsOn:'2026-10-31'}],
            validityStatus:'por_vencer', validUntil:'2026-10-31', toCollect:0, outstanding:0,
            collectionNote:'Cobrar con el papá, no con la abuela' },
          { playerId:'p3', name:'Iker Joan Flores Procopio', code:'TC-3', categoryId:'c3', categoryName:'T12',
            family:'Familia Flores', ordinaryFee:800, chargedFee:750, exempt:false, benefitTotal:50, feeSource:'beca',
            benefits:[{type:'sibling_discount',label:'Hermanos Tanners',clubLabel:'Hermanos Tanner',calculation:'informational',affectsAmount:false,endsOn:null}],
            validityStatus:'sin_vencimiento', validUntil:null, toCollect:850, outstanding:1650, collectionNote:null },
          // Los dos casos que M1/M2 separaron. Antes los dos salían idénticos:
          // "beneficio de $400". Uno es un plan del club y el otro es un hueco.
          { playerId:'p4', name:'Emiliano Paz García', code:'TC-4', categoryId:'c3', categoryName:'T12',
            family:'Familia Paz', ordinaryFee:800, chargedFee:400, exempt:false, benefitTotal:null,
            feeSource:'plan', planId:'pl1', planName:'Un día', feeNote:null, benefits:[],
            validityStatus:'ordinaria', validUntil:null, toCollect:400, outstanding:0, collectionNote:null },
          { playerId:'p5', name:'Hugo Beltrán Serrano', code:'TC-5', categoryId:'c3', categoryName:'T12',
            family:'Familia Beltrán', ordinaryFee:800, chargedFee:400, exempt:false, benefitTotal:null,
            feeSource:'sin_motivo', planId:null, planName:null, feeNote:null, benefits:[],
            validityStatus:'ordinaria', validUntil:null, toCollect:400, outstanding:0, collectionNote:null }
        ],
        summary: { players:5, withBenefit:3, onPlan:1, byAgreement:0, withoutReason:1,
                   toCollect:1850, outstanding:1850,
                   expiringSoon:1, expired:0, categoriesWithoutFee:1 }
      };
      // Baby Tanner es el caso real: tarifa de lista 550, y diez Tanners
      // pagando 400 que no son ninguna beca.
      let PLANES = [
        { categoryId:'c1', categoryName:'Baby Tanner', ordinaryFee:550,
          plans:[{ planId:'pl0', name:'Completo', monthlyFee:550, isDefault:true, players:7 }],
          unnamedAmounts:[{ monthlyFee:400, players:10 }] },
        { categoryId:'c2', categoryName:'T10', ordinaryFee:500,
          plans:[{ planId:'pl2', name:'Completo', monthlyFee:500, isDefault:true, players:12 }],
          unnamedAmounts:[] }
      ];
      const TARIFAS = [
        { categoryId:'c1', code:'baby_tanner', name:'Baby Tanner', monthlyFee:null, setAt:null, activePlayers:19, suggested:400, feeSpread:4 },
        { categoryId:'c2', code:'t10', name:'T10', monthlyFee:500, setAt:'2026-09-23', activePlayers:12, suggested:500, feeSpread:4 }
      ];
      window.__rpc = [];
      export const supabase = { auth:{
        getSession:async()=>({data:{session:{user:{id:'u1'}}}}),
        getUser:async()=>({data:{user:{id:'u1',app_metadata:{}}}}),
        signOut:async()=>({}),
        onAuthStateChange(){ return {data:{subscription:{unsubscribe(){}}}}; } } };
      export const money = new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:2});
      export const $ = id => document.getElementById(id);
      export async function rpc(name, params={}){
        window.__rpc.push({name, params});
        if(name==='v2_collection_amounts') return MONTOS;
        if(name==='v2_category_fees') return TARIFAS;
        if(name==='v2_set_category_fee') return true;
        if(name==='v2_category_plans') return PLANES;
        if(name==='v2_set_player_fee_note'){
          MONTOS = { ...MONTOS,
            rows: MONTOS.rows.map(r => r.playerId !== params.player_id ? r
              : { ...r, feeSource:'acuerdo', feeNote: params.note }),
            summary: { ...MONTOS.summary, withoutReason:0, byAgreement:1 } };
          return true;
        }
        if(name==='v2_create_category_plan'){
          // El backend liga de un golpe a todos los que ya pagaban ese monto.
          PLANES = PLANES.map(c => c.categoryId !== params.category_id ? c : {
            ...c,
            plans: [...c.plans, { planId:'nuevo', name:params.name, monthlyFee:params.monthly_fee, isDefault:false, players:10 }],
            unnamedAmounts: c.unnamedAmounts.filter(u => Number(u.monthlyFee) !== Number(params.monthly_fee))
          });
          return { planId:'nuevo', assigned:10 };
        }
        if(name==='v2_cashier_snapshot') return { businessDate:'2026-09-23', incomeTotal:0, expenseTotal:0,
          netTotal:0, expectedCash:0, cashTodayNet:0, methods:[], movements:[], canViewLedger: !esTaquilla };
        if(name==='v2_billing_players') return [];
        if(name==='v2_open_receivables') return [];
        return null;
      }
      export function moduleAccess(rows, code, write=false){
        const m = { taquilla:{r:true,w:true},
                    cobranza:{ r: !esTaquilla, w: !esTaquilla },
                    contabilidad:{ r: ROL==='Contabilidad', w: ROL==='Contabilidad' } };
        const e = m[code]; if(!e) return false; return write ? e.w : e.r;
      }
      export function setShellHealth(){}
      export function navigationMap(){ return new Map(); }
      export async function bootstrapProtectedShell(){
        return { ctx:{ organization_id:'o1', organization_name:'Tannery City FC', role:ROL, is_owner: ROL==='Presidencia' },
                 navigation:[] };
      }
      export const shellIcon = () => '';
      export const navItems = [];
      export function setShellSearchItems(){}
      export function renderShell(){}
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
  // jsPDF no se descarga: se sustituye por un doble que graba lo que se le pide.
  await pagina.route('**esm.sh/jspdf**', route => route.fulfill({
    status: 200, contentType: 'text/javascript',
    body: `
      export class jsPDF {
        constructor(){ this.textos=[]; this.paginas=1;
          this.internal={ pageSize:{getWidth:()=>792,getHeight:()=>612}, getNumberOfPages:()=>this.paginas }; }
        setFont(){} setFontSize(){} setTextColor(){} setFillColor(){} setDrawColor(){}
        rect(){} line(){} addPage(){ this.paginas++; } setPage(){}
        splitTextToSize(t){ return [String(t)]; }
        text(t){ this.textos.push(String(t)); }
        save(nombre){ window.__pdf = { nombre, textos: this.textos }; }
      }
    `
  }));

  await pagina.goto('http://127.0.0.1:4603/v2/taquilla/', { waitUntil: 'networkidle' });
  try { await pagina.waitForSelector('[data-vista="montos"]', { timeout: 8000, state: 'attached' }); }
  catch (e) {
    console.error(`[${rol}] no apareció la pestaña Montos. Errores de la página:`); errores.forEach(x => console.error('   ' + x));
    const diag = await pagina.evaluate(() => ({
      tabs: document.getElementById('verTabs')?.innerText || null,
      clasesTabs: document.getElementById('verTabs')?.className || null,
      acciones: document.querySelectorAll('.cashier-actions .cashier-action').length,
      bodyClase: document.body.className,
      titulo: document.title,
      texto: document.body.innerText.slice(0, 300)
    }));
    console.error('   diagnóstico: ' + JSON.stringify(diag, null, 1));
    throw e; }

  // La simplificación que pidió el club: la pantalla arranca con DOS acciones
  // —entra dinero, sale dinero—. Lo que antes era el botón CUÁNTO COBRAR y la
  // barra de conciliación ahora es una pestaña más del selector "Ver".
  revisa(`[${rol}] la pantalla arranca con sólo dos acciones grandes`,
    (await pagina.$$('.cashier-actions .cashier-action')).length === 2);
  revisa(`[${rol}] ya no existe el botón CUÁNTO COBRAR`,
    (await pagina.$$('#openMontos')).length === 0);
  revisa(`[${rol}] ya no existe la barra de conciliación`,
    (await pagina.$$('#openConcilia')).length === 0);
  // Taquilla sólo puede ver una cosa (el padrón): con una sola vista no hay
  // nada que elegir, así que el selector se esconde y el panel sale directo.
  // Cero toques para llegar a lo único que ese rol necesita.
  if (rol === 'Taquilla') {
    revisa(`[${rol}] con una sola vista el selector no estorba`, await pagina.isHidden('#verTabs'));
    revisa(`[${rol}] el padrón sale sin tener que buscarlo`, await pagina.isVisible('#montosPanel'));
  } else {
    revisa(`[${rol}] el selector ofrece varias vistas`, await pagina.isVisible('#verTabs'));
    revisa(`[${rol}] arranca en Cobranza, no en el padrón`, await pagina.isHidden('#montosPanel'));
    await pagina.click('[data-vista="montos"]');
  }
  await pagina.waitForSelector('.monto-card', { timeout: 6000 });
  revisa(`[${rol}] la pestaña elegida queda marcada`,
    await pagina.getAttribute('[data-vista="montos"]', 'aria-selected') === 'true');

  const panel = (await pagina.textContent('#montosPanel')).replace(/\s+/g, ' ');
  revisa(`[${rol}] salen los 5 Tanners`, (await pagina.$$('.monto-card')).length === 5);
  revisa(`[${rol}] dice cuánto cobrarle a Iker (850, con recargo)`, /\$850/.test(panel), panel.slice(0, 200));

  // El caso central: sin tarifa de categoría no se inventa el ordinario.
  revisa(`[${rol}] avisa que falta capturar la mensualidad ordinaria`,
    /1 categoría sin mensualidad ordinaria capturada/.test(panel), panel.slice(0, 260));
  revisa(`[${rol}] en el Tanner sin tarifa pone el motivo, no un cero`,
    /La categoría todavía no tiene mensualidad ordinaria capturada/.test(panel), panel.slice(0, 400));
  revisa(`[${rol}] donde sí hay tarifa, muestra la resta`,
    /\$800\.00 ordinaria/.test(panel) && /\$50\.00 beneficio/.test(panel) && /\$750\.00 mensualidad/.test(panel),
    panel.slice(0, 600));

  // EL BUG QUE CERRÓ M2, visto en pantalla.
  // Emiliano y Hugo pagan lo mismo (400 con tarifa de 800). Antes los dos
  // salían con "beneficio de $400" que nadie autorizó. Ahora uno dice que es
  // un plan del club y el otro dice que nadie registró por qué.
  revisa(`[${rol}] el plan del club se nombra, no se disfraza de beca`,
    /Plan del club · Un día/.test(panel), panel.slice(0, 900));
  revisa(`[${rol}] al plan NO se le inventa una resta`,
    !/\$400\.00 beneficio/.test(panel), panel.slice(0, 900));
  revisa(`[${rol}] el que paga distinto sin explicación queda marcado`,
    /Sin motivo registrado/.test(panel) && /nadie registró por qué/.test(panel), panel.slice(0, 1200));

  // El aviso que el club no tenía: cuántos pagan algo que nadie explicó.
  const avisoTxt = (await pagina.textContent('#montosAviso')).replace(/\s+/g, ' ');
  revisa(`[${rol}] avisa de los Tanners sin motivo registrado`,
    /1 Tanner paga distinto a su categoría y nadie registró por qué/.test(avisoTxt), avisoTxt.slice(0, 300));
  revisa(`[${rol}] el aviso dice que ya no cuentan como beca`,
    /No es una beca: el sistema ya no lo cuenta como tal/.test(avisoTxt), avisoTxt.slice(0, 400));

  // El beneficio que es sólo etiqueta tiene que decirse.
  revisa(`[${rol}] avisa del beneficio que no descuenta nada`,
    /registrado como etiqueta: no descuenta nada/.test(panel), panel.slice(0, 700));

  // Etiquetas legibles, sin "Beca total · Total"
  revisa(`[${rol}] no repite "Beca total · Total"`, !/Beca total · Total/.test(panel));
  revisa(`[${rol}] conserva Curtibrother`, /Curtibrother/.test(panel));

  // La nota de cobranza sí se ve en pantalla
  revisa(`[${rol}] la nota autorizada se ve en pantalla`, /no con la abuela/.test(panel));

  // Buscador
  await pagina.fill('#montosSearch', 'curtibrother');
  await pagina.waitForTimeout(150);
  revisa(`[${rol}] el buscador encuentra por tipo de beneficio`, (await pagina.$$('.monto-card')).length === 1);
  await pagina.fill('#montosSearch', 'michel');
  await pagina.waitForTimeout(150);
  revisa(`[${rol}] el buscador encuentra por tutor`, (await pagina.$$('.monto-card')).length === 1);
  await pagina.click('#montosSearchClear');
  await pagina.waitForTimeout(150);
  revisa(`[${rol}] limpiar la búsqueda devuelve a todos`, (await pagina.$$('.monto-card')).length === 5);

  // Chips
  await pagina.click('[data-montos-filter="debt"]');
  await pagina.waitForTimeout(150);
  revisa(`[${rol}] el chip "Con saldo" filtra`, (await pagina.$$('.monto-card')).length === 2);
  await pagina.click('[data-montos-filter="expiring"]');
  await pagina.waitForTimeout(150);
  revisa(`[${rol}] el chip "Por vencer" filtra`, (await pagina.$$('.monto-card')).length === 1);
  await pagina.click('[data-montos-filter="all"]');
  await pagina.waitForTimeout(150);

  // Permisos de exportar y de fijar tarifas
  const vePdf = await pagina.isVisible('#montosPdf');
  const veTarifas = await pagina.isVisible('#montosTarifas');
  if (rol === 'Presidencia') {
    revisa(`[${rol}] puede exportar el PDF`, vePdf);
    revisa(`[${rol}] puede capturar tarifas`, veTarifas);

    await pagina.click('[data-montos-filter="debt"]');
    await pagina.waitForTimeout(150);
    await pagina.click('#montosPdf');
    await pagina.waitForFunction(() => window.__pdf, { timeout: 8000 });
    const pdf = await pagina.evaluate(() => window.__pdf);
    const texto = pdf.textos.join(' | ');
    revisa(`[${rol}] el PDF se llama por su periodo`, pdf.nombre === 'montos-de-cobro-2026-09.pdf', pdf.nombre);
    revisa(`[${rol}] el PDF va marcado como consulta interna`, /CONSULTA INTERNA/.test(texto));
    revisa(`[${rol}] el PDF dice con qué filtros se generó`, /Sólo con saldo/.test(texto), texto.slice(0, 300));
    revisa(`[${rol}] el PDF sólo trae lo filtrado (2 de 5)`,
      /Ana Sofia/.test(texto) && /Iker/.test(texto) && !/Dario/.test(texto), texto.slice(0, 400));
    revisa(`[${rol}] el PDF NO lleva la nota interna`, !/abuela/.test(texto));
    revisa(`[${rol}] el PDF avisa de la columna Ordinaria en blanco`,
      /sin mensualidad ordinaria capturada/.test(texto), texto.slice(-300));

    // LA OTRA MITAD: lo que se acuerda con UNA familia.
    // Un plan arregla a diez de un golpe; esto arregla al que está solo. Sin
    // las dos salidas, el padrón nunca llegaría a cero.
    await pagina.click('[data-montos-filter="sinmotivo"]');
    await pagina.waitForTimeout(150);
    revisa(`[${rol}] el chip "Sin motivo" deja sólo al que nadie explicó`,
      (await pagina.$$('.monto-card')).length === 1);
    revisa(`[${rol}] ese Tanner trae el botón para cerrarlo`,
      await pagina.isVisible('[data-acuerdo="p5"]'));

    await pagina.click('[data-acuerdo="p5"]');
    await pagina.fill('#acuerdo-p5', 'Paga la abuela los martes');
    await pagina.click('[data-guardaacuerdo="p5"]');
    await pagina.waitForTimeout(500);
    const acuerdos = await pagina.evaluate(() => window.__rpc.filter(r => r.name === 'v2_set_player_fee_note'));
    revisa(`[${rol}] guarda lo acordado sin tocarle la cuota`,
      acuerdos.length === 1 && acuerdos[0].params.note === 'Paga la abuela los martes'
        && acuerdos[0].params.monthly_fee === undefined,
      JSON.stringify(acuerdos));
    await pagina.click('[data-montos-filter="all"]');
    await pagina.waitForTimeout(200);
    const trasAcuerdo = (await pagina.textContent('#montosPanel')).replace(/\s+/g, ' ');
    revisa(`[${rol}] ahora dice lo que se acordó, no "sin motivo"`,
      /Acuerdo con la familia · Paga la abuela los martes/.test(trasAcuerdo)
        && !/Sin motivo registrado/.test(trasAcuerdo), trasAcuerdo.slice(0, 900));
    // El aviso NO desaparece entero: sigue faltando capturar una tarifa, que
    // es otro problema. Lo que se va es el renglón del hueco que se cerró.
    const aviso2 = (await pagina.textContent('#montosAviso')).replace(/\s+/g, ' ');
    revisa(`[${rol}] el aviso del hueco se va al cerrarlo`,
      !/nadie registró por qué/.test(aviso2), aviso2.slice(0, 300));
    revisa(`[${rol}] pero sigue avisando de la tarifa que falta`,
      /sin mensualidad ordinaria capturada/.test(aviso2), aviso2.slice(0, 300));

    // Tarifas
    await pagina.click('[data-montos-filter="all"]');
    await pagina.waitForTimeout(120);
    await pagina.click('#montosTarifas');
    await pagina.waitForSelector('.tarifa-row', { timeout: 6000 });
    const tar = (await pagina.textContent('#tarifasList')).replace(/\s+/g, ' ');
    revisa(`[${rol}] la tarifa propone la cuota más común`, /Usar la más común/.test(tar), tar.slice(0, 200));
    revisa(`[${rol}] la tarifa dice cuántas cuotas distintas hay hoy`, /4 cuotas distintas hoy/.test(tar), tar.slice(0, 200));
    await pagina.click('[data-sug="c1"]');
    revisa(`[${rol}] el botón de sugerencia llena el campo`,
      (await pagina.inputValue('#tarifa-c1')) === '400');
    await pagina.click('[data-guardar="c1"]');
    await pagina.waitForTimeout(400);
    const llamadas = await pagina.evaluate(() => window.__rpc.filter(r => r.name === 'v2_set_category_fee'));
    revisa(`[${rol}] guardar manda la tarifa al backend`,
      llamadas.length === 1 && Number(llamadas[0].params.monthly_fee) === 400,
      JSON.stringify(llamadas));
    const msg = await pagina.textContent('#tarifasMessage');
    revisa(`[${rol}] avisa que la tarifa no cambia lo que se cobra`,
      /No cambia lo que el sistema cobra/.test(msg), msg);
    // NOMBRAR UN MONTO SUELTO COMO PLAN DEL CLUB.
    // Los diez Baby Tanners que pagan 400 se arreglan con un nombre, no con
    // diez ediciones. Y no se les cambia el monto: se les pone de dónde sale.
    revisa(`[${rol}] los planes que ya existen se ven`, /Completo · \$550\.00 · 7/.test(tar), tar.slice(0, 400));
    revisa(`[${rol}] el monto sin nombre se enseña, no se esconde`,
      /10 Tanners sin plan ni beca/.test(tar), tar.slice(0, 500));

    await pagina.click('[data-nombrar="c1"]');
    await pagina.fill('#plannombre-c1-400', 'Un día');
    await pagina.click('[data-crear="c1"]');
    await pagina.waitForTimeout(400);
    const creadas = await pagina.evaluate(() => window.__rpc.filter(r => r.name === 'v2_create_category_plan'));
    revisa(`[${rol}] crear el plan manda nombre, monto y la liga en bloque`,
      creadas.length === 1 && creadas[0].params.name === 'Un día'
        && Number(creadas[0].params.monthly_fee) === 400
        && creadas[0].params.assign_matching === true,
      JSON.stringify(creadas));
    const msgPlan = await pagina.textContent('#tarifasMessage');
    revisa(`[${rol}] dice a cuántos ligó y que no les cambió el monto`,
      /10 Tanneres quedaron ligados/.test(msgPlan) && /No se les cambió el monto/.test(msgPlan), msgPlan);
    const tar2 = (await pagina.textContent('#tarifasList')).replace(/\s+/g, ' ');
    revisa(`[${rol}] el monto suelto ya no aparece como pendiente`,
      !/10 Tanners sin plan ni beca/.test(tar2) && /Un día · \$400\.00/.test(tar2), tar2.slice(0, 500));

    // Sin nombre no se crea nada: un plan sin nombre no explica nada.
    revisa(`[${rol}] no quedaron montos sueltos en T10`, !/data-nombrar="c2"/.test(await pagina.innerHTML('#tarifasList')));

    // La cruz tiene que cerrar: .close-modal no estaba conectado a nada.
    await pagina.click('#tarifasModal .close-modal');
    await pagina.waitForTimeout(200);
    revisa(`[${rol}] la cruz cierra el modal de tarifas`, await pagina.isHidden('#tarifasModal'));
  } else {
    revisa(`[${rol}] NO puede exportar el PDF`, !vePdf);
    revisa(`[${rol}] NO puede capturar tarifas`, !veTarifas);
    // Redacción: Taquilla no recibe ni ve el desglose económico de la beca.
    revisa(`[${rol}] no se le muestra el porcentaje de la beca`, !/100%/.test(panel), panel.slice(0, 300));
  }

  const desborde = await pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  revisa(`[${rol}] no hay scroll horizontal en iPhone`, !desborde);

  if (rol === 'Taquilla') {
    await pagina.screenshot({ path: path.join(RAIZ, 'docs/evidencias/taquilla-montos-de-cobro.png'), fullPage: true });
  }

  await navegador.close();
  return errores;
}

const errores = [...(await corre('Taquilla')), ...(await corre('Presidencia'))];
server.close();

let mal = 0;
for (const r of revisiones) { if (!r.ok) { mal++; console.error(` - ${r.nombre}${r.detalle ? ' :: ' + r.detalle : ''}`); } }
if (errores.length) { console.error('ERRORES DEL NAVEGADOR:'); errores.forEach(e => console.error('   ' + e)); }
if (mal || errores.length) { console.error(`Humo Montos FAILED · ${mal} de ${revisiones.length}, ${errores.length} errores`); process.exit(1); }
console.log(`Humo Montos OK · ${revisiones.length} revisiones en Chromium a 390px (Taquilla y Presidencia), 0 errores`);
