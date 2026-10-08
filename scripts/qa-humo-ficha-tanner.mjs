/* FICHA TANNER, ESTILO APPLE Y MODO TANNERY CITY.
 *
 * Pedido (06/10/2026): la ficha tenía todo abierto a la vez y "te puedes
 * perder". Rediseño aprobado en prototipo: encabezado compacto, carta que se
 * abre al tocar la foto, acciones redondas, beca MUY visible, adeudo por
 * meses y pedidos arriba, perfil deportivo, pestañas por rol, familia
 * completa, documentos con avance, permiso de imagen editable con un toque
 * y línea de tiempo.
 *
 * Esta prueba levanta /v2/jugadores/ REAL con un Supabase falso y revisa:
 *   · la carta FIFA no ocupa la pantalla: se abre al tocar la foto y se cierra;
 *   · la beca sale en franja dorada con cuánto, quién y hasta cuándo;
 *   · "Debe 2 meses · $1,600" con los meses en color y el pedido activo;
 *   · Presidencia abre en Resumen; un profe en Deportivo y sin Pagos ni adeudo;
 *   · cada pestaña muestra sólo lo suyo (el formulario se reparte);
 *   · pendientes: permiso de imagen, documentos faltantes y evaluación;
 *   · tocar "No autoriza" abre el registro de permisos con el WhatsApp listo;
 *   · documentos "2 de 3" y pedir el que falta por WhatsApp;
 *   · hermanos en el club y línea de tiempo;
 *   · "Más" guarda los botones de siempre; Escape cierra.
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
await new Promise(r => srv.listen(4791, r));

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
const nav = await chromium.launch({ executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });

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
      v2_player_benefits:[{ id:'b1', type:'scholarship_partial', percentage:50, sponsorName:'Don Trapo', endsOn:'2026-12-31', active:true }],
      v2_player_documents:[{ type:'birth_certificate', received:false },{ type:'curp', received:true, receivedAt:'2026-08-20' },{ type:'studies', received:true }],
      v2_player_sports:{ summary:{ played:0 }, evaluations:[] },
      v2_attendance_player:{ current:{ scheduled:14, attended:12, pct:85.7 } },
      v2_player_story:{ siblings:[{ id:'p2', name:'Milan Pedroza', category:'Baby Tanner', status:'active' }],
        timeline:[{ kind:'category', date:'2026-08-19', title:'Categoría Mini Baby Tanner' },{ kind:'joined', date:'2026-02-10', title:'Entró al club' }] }
    };
    window.__fakeSupabase = {
      auth:{ getSession:async()=>({data:{session:{user:{id:'u1'}}}}), getUser:async()=>({data:{user:{id:'u1'}}}), onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}) },
      rpc:async(n,params)=>{ window.__llamadas.push(n); return { data:R[n] ?? null, error:null }; },
      storage:{ from:()=>({ createSignedUrl:async()=>({data:null}), createSignedUrls:async()=>({data:[]}) }) },
      channel:()=>({ on(){return this;}, subscribe(){return this;} }), removeChannel(){}
    };
  }, { rol, m:MODS[rol], ESTADO });
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.route('**/v2/supabase-client.js', r => r.fulfill({ status:200, contentType:'text/javascript', body:'export function createClient(){ return window.__fakeSupabase; }' }));
  await p.route('**/v2/photo-cache.js', r => r.fulfill({ status:200, contentType:'text/javascript',
    body:'export async function getSignedPhotoUrls(){return {};}export async function getSignedPhotoUrl(){return "/icon-512.png";}export async function getRawSignedPhotoUrl(){return null;}export async function clearPhotoCache(){}export function forgetPhoto(){}' }));
  await p.goto('http://127.0.0.1:4791/v2/jugadores/?player=p1', { waitUntil:'domcontentloaded' });
  await p.waitForSelector('#fichaTabs button', { timeout:8000 });
  await p.waitForFunction(() => window.__llamadas.includes('v2_player_story') && window.__llamadas.includes('v2_player_documents'), null, { timeout:6000 });
  await p.waitForTimeout(500);
  return p;
}
const visible = (p, sel) => p.isVisible(sel);
const texto = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g,' ');

/* ---------- Presidencia, teléfono ---------- */
{
  const p = await abre('Presidencia');
  // "La foto es lo que nos ayuda a ver quién es": grande y sin encimarse.
  const foto = await p.evaluate(() => { const a = document.getElementById('fichaAvatar').getBoundingClientRect(), n = document.getElementById('profileName').getBoundingClientRect();
    return { w: Math.round(a.width), img: !!document.querySelector('#fichaAvatar img'), encima: a.right > n.left + 1 }; });
  revisa('[foto] la foto sale grande (≥140px en teléfono) y es la del Tanner', foto.w >= 140 && foto.img, JSON.stringify(foto));
  revisa('[foto] no se encima con el nombre', !foto.encima, JSON.stringify(foto));
  revisa('[foto] con foto, la caja para subir no estorba', await p.isHidden('#photoEditor'));
  // Foto vertical (caso real: Mauro Contreras, 06/10/2026). Crecía a su alto
  // natural, salía ovalada y tapaba los botones. Debe quedar cuadrada.
  const vertical = await p.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 300; c.height = 520;
    const g = c.getContext('2d'); g.fillStyle = '#0a6'; g.fillRect(0, 0, 300, 520);
    const img = document.querySelector('#fichaAvatar img'); img.src = c.toDataURL();
    await new Promise(r => img.complete ? r() : img.addEventListener('load', r, { once:true }));
    const a = document.getElementById('fichaAvatar').getBoundingClientRect(), i = img.getBoundingClientRect();
    const acc = document.getElementById('fichaAcciones').getBoundingClientRect();
    return { a:[Math.round(a.width), Math.round(a.height)], i:[Math.round(i.width), Math.round(i.height)], tapa: i.bottom > acc.top + 1,
             radio: getComputedStyle(document.getElementById('fichaAvatar')).borderRadius };
  });
  revisa('[foto] una foto vertical queda cuadrada dentro del marco', vertical.a[0] === vertical.a[1] && vertical.i[0] === vertical.a[0] && vertical.i[1] === vertical.a[1], JSON.stringify(vertical));
  revisa('[foto] no tapa los botones de acción', !vertical.tapa, JSON.stringify(vertical));
  revisa('[foto] marco cuadrado con esquinas redondeadas, no círculo', vertical.radio !== '50%', JSON.stringify(vertical));
  revisa('[pres] la carta FIFA no ocupa la pantalla', await p.isHidden('#tannerCard'));
  await p.click('#fichaAvatar');
  revisa('[pres] tocar la foto abre la Carta Tanner', await visible(p, '#tannerCard'));
  await p.keyboard.press('Escape');
  revisa('[pres] Escape cierra la carta', await p.isHidden('#tannerCard'));
  const beca = await texto(p, '#fichaBeca');
  revisa('[beca] franja dorada visible', await visible(p, '#fichaBeca'));
  revisa('[beca] dice cuánto, quién y hasta cuándo', /Beca parcial · 50% de la mensualidad/.test(beca) && /Lo cubre Don Trapo/.test(beca) && /hasta 31 dic/.test(beca), beca);
  const cuenta = await texto(p, '#fichaCuenta');
  revisa('[cuenta] debe 2 meses y cuánto', /Debe 2 meses/.test(cuenta) && /\$1,600/.test(cuenta), cuenta.slice(0,160));
  revisa('[cuenta] meses en color', (await p.$$('#fichaCuenta .ficha-mes.vencido')).length >= 1 && (await p.$$('#fichaCuenta .ficha-mes.pagado')).length === 1, cuenta);
  revisa('[cuenta] último pago', /Último pago .* Efectivo/.test(cuenta));
  revisa('[cuenta] pedido activo y lo que falta (no el entregado)', /Pedido activo · TC-0142/.test(cuenta) && /faltan \$250/.test(cuenta) && !/TC-0100/.test(cuenta), cuenta);
  const perfil = await texto(p, '#fichaPerfil');
  revisa('[perfil] se llama Perfil deportivo Tanner', /PERFIL DEPORTIVO TANNER/.test(perfil));
  revisa('[perfil] asistencia de 30 días', /86%/.test(perfil) && /12 de 14/.test(perfil), perfil);
  revisa('[perfil] sin evaluación lo dice', /Sin evaluar/.test(perfil));
  const tabs = await p.$$eval('#fichaTabs button', b => b.map(x => x.textContent + (x.getAttribute('aria-selected')==='true'?'*':'')));
  revisa('[tabs] Presidencia abre en Resumen y ve Pagos', JSON.stringify(tabs) === JSON.stringify(['Resumen*','Deportivo','Pagos','Familia','Expediente']), JSON.stringify(tabs));
  revisa('[tabs] en Resumen no se ve el formulario', await p.isHidden('#firstName') && await p.isHidden('#sportsSnapshot'));
  const res = await texto(p, '#fichaResumen');
  revisa('[resumen] pendientes: permiso, documento y evaluación', /Registrar permiso de imagen/.test(res) && /Falta 1 documento/.test(res) && /Acta de nacimiento/.test(res) && /Evaluación del ciclo/.test(res), res.slice(0,300));
  revisa('[resumen] familia en el club', /Milan Pedroza/.test(res));
  revisa('[resumen] su historia en el club', /SU HISTORIA EN EL CLUB/.test(res) && /Entró al club/.test(res));
  const chips = await texto(p, '#fichaChips');
  revisa('[chips] faltan documentos y hermanos', /Falta 1 documento/.test(chips) && /1 hermano en el club/.test(chips), chips);

  // Permiso de imagen con un toque
  await p.click('#privacyBadges [class*="img-"]');
  revisa('[imagen] tocar el aviso abre el registro de permisos', await visible(p, '#consentBox'));
  const wa = await p.getAttribute('#consentBox .consent-wa', 'href');
  revisa('[imagen] trae el WhatsApp para pedir el permiso', (wa||'').startsWith('https://wa.me/524771112233?text='), wa);

  // Pestañas
  await p.click('[data-ficha-tab="familia"]');
  const fam = await texto(p, '#fichaFamilia');
  revisa('[familia] tutores con quién paga y hermanos', /Laura Ortiz/.test(fam) && /paga la mensualidad/.test(fam) && /HERMANOS EN EL CLUB/.test(fam) && /Milan Pedroza/.test(fam), fam.slice(0,240));
  revisa('[familia] aquí sí está el formulario del tutor', await visible(p, '#guardianName') && await p.isHidden('#firstName'));
  await p.click('[data-ficha-tab="expediente"]');
  revisa('[expediente] datos y documentos', await visible(p, '#firstName') && await visible(p, '#documentChecklist'));
  const docs = await texto(p, '#docsProgreso');
  revisa('[docs] 2 de 3 entregados', /2 de 3 entregados/.test(docs), docs);
  const dwa = await p.getAttribute('#docsProgreso .docs-wa', 'href');
  revisa('[docs] pedir lo que falta por WhatsApp', /Acta%20de%20nacimiento/.test(dwa||''), dwa);
  await p.click('[data-ficha-tab="pagos"]');
  revisa('[pagos] pagos y beca', await visible(p, '#pagosSnapshot') && await visible(p, '#benefitsPanel'));
  await p.click('#fichaBeca');
  revisa('[beca] tocar la franja lleva a Pagos', (await p.getAttribute('[data-ficha-tab="pagos"]', 'aria-selected')) === 'true');

  // Más
  await p.click('[data-ficha-mas]');
  revisa('[más] abre la hoja con los botones de siempre', await visible(p, '#fichaMas') && await visible(p, '#credencialTanner'));
  await p.click('#fichaMas >> text=Editar expediente');
  revisa('[más] "Editar expediente" lleva a Expediente', (await p.getAttribute('[data-ficha-tab="expediente"]', 'aria-selected')) === 'true' && await p.isHidden('#fichaMas'));
  const acc = await p.$$eval('#fichaAcciones .ficha-accion', a => a.map(x => x.textContent.trim()));
  revisa('[acciones] WhatsApp, Llamar, Cobrar, Evaluar, Más', JSON.stringify(acc) === JSON.stringify(['WhatsApp','Llamar','Cobrar','Evaluar','Más']), JSON.stringify(acc));
  const cob = await p.getAttribute('#fichaAcciones a.principal', 'href');
  revisa('[acciones] Cobrar lleva el monto que debe', /action=cobrar&player=p1&amount=1600/.test(cob||''), cob);
  revisa('[pres] sin scroll horizontal', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await p.click('[data-ficha-tab="resumen"]');
  await p.screenshot({ path: path.join(RAIZ, 'docs/evidencias/ficha-tanner-telefono.png') });
  await p.close();
}

/* ---------- Profe ---------- */
{
  const p = await abre('Formadores');
  const tabs = await p.$$eval('#fichaTabs button', b => b.map(x => x.textContent + (x.getAttribute('aria-selected')==='true'?'*':'')));
  revisa('[profe] abre en Deportivo y sin Pagos', JSON.stringify(tabs) === JSON.stringify(['Resumen','Deportivo*','Familia','Expediente']), JSON.stringify(tabs));
  revisa('[profe] no ve adeudo ni pedidos', await p.isHidden('#fichaCuenta'));
  revisa('[profe] ve el perfil deportivo', await visible(p, '#sportsSnapshot'));
  const acc = await p.$$eval('#fichaAcciones .ficha-accion', a => a.map(x => x.textContent.trim()));
  revisa('[profe] su botón principal es Evaluar, sin Cobrar', !acc.includes('Cobrar') && acc.includes('Evaluar'), JSON.stringify(acc));
  await p.close();
}

/* ---------- Computadora ---------- */
{
  const p = await abre('Presidencia', 1280);
  revisa('[compu] foto grande de 208px', await p.evaluate(() => Math.round(document.getElementById('fichaAvatar').getBoundingClientRect().width) === 208));
  revisa('[compu] perfil deportivo en 4 columnas', await p.evaluate(() => getComputedStyle(document.querySelector('.ficha-perfil-grid')).gridTemplateColumns.split(' ').length === 4));
  await p.screenshot({ path: path.join(RAIZ, 'docs/evidencias/ficha-tanner-compu.png') });
  await p.close();
}

await nav.close(); srv.close();
let mal = 0;
for (const r of revisiones) if (!r.ok) { mal++; console.error(` - ${r.nombre}${r.detalle ? ' :: ' + r.detalle : ''}`); }
if (errores.length) { console.error('ERRORES DEL NAVEGADOR:'); errores.forEach(e => console.error('   ' + e)); }
if (mal || errores.length) { console.error(`Ficha Tanner humo FAILED · ${mal} de ${revisiones.length}, ${errores.length} errores`); process.exit(1); }
console.log(`Ficha Tanner humo OK · ${revisiones.length} revisiones: encabezado compacto, beca visible, adeudo y pedidos, pestañas por rol, familia, documentos e historia`);
