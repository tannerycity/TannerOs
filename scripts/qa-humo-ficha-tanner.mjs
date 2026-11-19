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
 *   · separación total: la ficha no trae dinero; "Más" lleva a su cuenta en
 *     Taquilla y a "Beca y apoyos"; la beca es un dato de Familia;
 *   · "Atrasado · debe 2 meses · $1,600" (el semáforo de Taquilla) con los meses en color y el pedido activo;
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
// Meses por aritmetica de calendario, no restando dias: cerca del dia 1-5 del
// mes, "hace(35)" y "hace(5)" pueden caer en el mismo mes y los dos cargos
// pendientes se fusionan en uno (el test esperaba "Debe 2 meses").
const mesHace = n => { const d=new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth()-n); return d.toISOString().slice(0,10); };
const ESTADO = {
  player:{ id:'p1', first_name:'Marcelo', last_name:'Pedroza' },
  summary:{ balance:1600, paid_total:3200, credit_available:0 },
  ledger:[
    { id:'c3', kind:'charge', subtype:'monthly_fee', period:mesHace(0), date:hace(-5), amount:800, charge_balance:800 },
    { id:'c2', kind:'charge', subtype:'monthly_fee', period:mesHace(1), date:hace(30), amount:800, charge_balance:800 },
    { id:'pay', kind:'payment', status:'posted', date:hace(60), amount:-800, method:'cash' },
    { id:'c1', kind:'charge', subtype:'monthly_fee', period:mesHace(2), date:hace(60), amount:800, charge_balance:0 }
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
      // Portero + su categoría (13/11/2026): Marcelo entrena también con la academia.
      v2_goalkeepers:[{ id:'p1', name:'Marcelo Pedroza Ortiz', category:'Mini Baby Tanner', inAcademy:true }],
      v2_academies:[{ id:'a-gk', name:'Academia de porteros', academy_type:'goalkeeper', status:'active', schedule:{ days:'Martes', time:'5:00 a 6:00 pm' } }],
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
  await p.waitForSelector('#fichaTabs button', { timeout:8000, state:'attached' });
  await p.waitForFunction(() => window.__llamadas.includes('v2_player_story') && window.__llamadas.includes('v2_player_documents'), null, { timeout:6000 });
  await p.waitForTimeout(500);
  return p;
}
const visible = (p, sel) => p.isVisible(sel);
const texto = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g,' ');
// Fase B: las secciones se abren desde la lista; dentro, "‹ Nombre" regresa.
async function seccion(p, k) {
  if (await p.isVisible('#fichaBarra [data-ficha-tab="resumen"]')) await p.click('#fichaBarra [data-ficha-tab="resumen"]');
  if (k !== 'resumen') await p.click(`#fichaTabs [data-ficha-tab="${k}"]`);
}

/* ---------- Presidencia, teléfono ---------- */
{
  const p = await abre('Presidencia');
  // "La foto es lo que nos ayuda a ver quién es": grande y sin encimarse.
  const foto = await p.evaluate(() => { const a = document.getElementById('fichaAvatar').getBoundingClientRect(), n = document.getElementById('profileName').getBoundingClientRect();
    return { w: Math.round(a.width), img: !!document.querySelector('#fichaAvatar img'), encima: a.right > n.left + 1 && a.bottom > n.top + 1 && a.left < n.right - 1 && a.top < n.bottom - 1 }; });
  revisa('[foto] la foto sale grande (≥140px en teléfono) y es la del Tanner', foto.w >= 140 && foto.img, JSON.stringify(foto));
  revisa('[foto] no se encima con el nombre', !foto.encima, JSON.stringify(foto));
  revisa('[foto] con foto, la caja para subir no estorba', await p.isHidden('#photoEditor'));
  // Cambiar la foto a la mano (13/11/2026). Presidencia: "no está accesible la
  // opción de cambiar la fotografía": vivía dentro de "Más".
  revisa('[foto] quien puede cambiarla ve una cámara sobre la foto y lo dice el lector', await p.getAttribute('#fichaAvatar', 'aria-label') === 'Ver o cambiar la foto' && !!(await p.$('#fichaAvatar i svg circle[r="3.5"]')));
  await p.click('#fichaAvatar');
  await p.waitForSelector('#fichaFotoVisor:not([hidden])', { timeout: 3000 }).catch(() => {});
  revisa('[foto] al tocarla se ve en grande y el primer botón es "Cambiar foto"', await p.isVisible('#fichaFotoVisor [data-visor-cambiar]') && (await p.textContent('#fichaFotoVisor .ficha-visor-acciones button:not([hidden])')).trim() === 'Cambiar foto');
  await p.click('#fichaFotoVisor [data-visor-cambiar]');
  await p.waitForTimeout(300);
  revisa('[foto] "Cambiar foto" cierra la foto y abre la caja para tomarla o elegirla', await p.isHidden('#fichaFotoVisor') && await p.isVisible('#photoEditor'));
  await p.evaluate(() => document.querySelector('#profileView')?.classList.remove('ficha-foto-abierta'));
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
  // La foto en grande (19/10/2026): "que se haga grande" para guardarla y
  // hacer la felicitación. Tocar la foto la abre completa, sin recortar.
  await p.click('#fichaAvatar');
  await p.waitForSelector('#fichaFotoVisor:not([hidden])', { timeout: 3000 }).catch(() => {});
  const visor = await p.evaluate(() => { const i = document.getElementById('fichaVisorImg'), b = document.querySelector('#photoBox img');
    return { abierto: !document.getElementById('fichaFotoVisor').hidden, misma: !!i && !!b && i.src === b.src, ajuste: i && getComputedStyle(i).objectFit, carta: !document.getElementById('tannerCard') || getComputedStyle(document.getElementById('tannerCard')).display === 'none' || document.getElementById('tannerCard').offsetParent === null }; });
  revisa('[foto] tocar la foto la abre en grande (la original, sin recortar)', visor.abierto && visor.misma && visor.ajuste === 'contain', JSON.stringify(visor));
  revisa('[foto] el visor trae "Guardar foto" y la Carta a un toque', await visible(p, '[data-visor-guardar]') && await visible(p, '[data-visor-carta]'));
  await p.keyboard.press('Escape');
  revisa('[foto] Escape cierra la foto', await p.isHidden('#fichaFotoVisor'));
  await p.click('#fichaAvatar'); await p.click('[data-visor-carta]');
  revisa('[pres] desde la foto se abre la Carta Tanner', await visible(p, '#tannerCard'));
  await p.keyboard.press('Escape');
  revisa('[pres] Escape cierra la carta', await p.isHidden('#tannerCard'));
  // Fase B estilo Apple: sin pestañas; una lista de secciones con su dato ya escrito.
  const filas = await p.$$eval('#fichaTabs .ficha-seccion', b => b.map(x => x.innerText.replace(/\s+/g, ' ').trim()));
  revisa('[apple B] la ficha abre en el inicio, con la lista de secciones', !(await p.isVisible('#fichaBarra')) && filas.length === 4, JSON.stringify(filas));
  revisa('[apple B] Deportivo ya dice asistencia y evaluación', /^Deportivo 86% asistencia · sin evaluar/.test(filas[0] || ''), filas[0]);
  revisa('[separación] la ficha no tiene sección de Pagos: el dinero vive en Taquilla', !filas.some(f => /^Pagos/.test(f)), filas);
  revisa('[apple B] Familia ya dice quién y cuántos hermanos', /^Familia Laura · 1 hermano/.test(filas[1] || ''), filas[1]);
  revisa('[apple B] Expediente dice qué falta, con globito', /^Expediente Falta acta de nacimiento · No autorizan fotos 2/.test(filas[2] || ''), filas[2]);
  revisa('[apple B] Historia dice desde cuándo', /^Historia desde/.test(filas[3] || ''), filas[3]);
  revisa('[apple B] en el inicio no se ven cuenta, beca, perfil ni formularios', await p.isHidden('#fichaCuenta') && await p.isHidden('#fichaBeca') && await p.isHidden('#fichaPerfil') && await p.isHidden('#firstName') && await p.isHidden('#sportsSnapshot'));
  revisa('[apple B] cada renglón mide lo que un dedo', await p.$$eval('#fichaTabs .ficha-seccion', b => b.every(x => x.getBoundingClientRect().height >= 44)));

  // Separación total (19/11/2026): sin dinero en la ficha.
  revisa('[separación] no se ve la cuenta ni el historial de pagos', await p.isHidden('#fichaCuenta') && await p.isHidden('#pagosSnapshot'));
  await seccion(p, 'familia');
  const beca = await texto(p, '#fichaBeca');
  revisa('[beca] la beca es un dato de Familia: qué es, quién la cubre y hasta cuándo', await visible(p, '#fichaBeca') && /Beca parcial/.test(beca) && /Lo cubre Don Trapo/.test(beca) && /hasta 31 dic/.test(beca), beca);
  await p.click('#fichaBeca');
  revisa('[beca] tocarla abre "Beca y apoyos" (quien maneja dinero)', /Beca y apoyos/.test(await texto(p, '#fichaBarra strong')) && await visible(p, '#benefitsPanel'));
  await seccion(p, 'resumen');

  await seccion(p, 'deportivo');
  const perfil = await texto(p, '#fichaPerfil');
  revisa('[perfil] en Deportivo: Perfil deportivo Tanner', /PERFIL DEPORTIVO TANNER/.test(perfil) && await visible(p, '#sportsSnapshot'));
  revisa('[perfil] asistencia de 30 días', /86%/.test(perfil) && /12 de 14/.test(perfil), perfil);
  revisa('[perfil] sin evaluación lo dice', /Sin evaluar/.test(perfil));
  revisa('[perfil] dos datos, sin posición ni objetivo', (await p.$$('#fichaPerfil .ficha-perfil-grid > div')).length === 2 && !/Objetivo actual/.test(perfil));
  revisa('[apple] sin degradados', await p.evaluate(() => ['#fichaBeca', '#fichaPerfil'].every(s => !/gradient/.test(getComputedStyle(document.querySelector(s)).backgroundImage))));

  await seccion(p, 'historia');
  const res = await texto(p, '#fichaResumen');
  revisa('[historia] su historia en el club, en su pantalla', /SU HISTORIA EN EL CLUB/.test(res) && /Entró al club/.test(res) && /Historia en el club/.test(await texto(p, '#fichaBarra strong')), res.slice(0, 200));
  await seccion(p, 'resumen');
  revisa('[apple B] "‹ Marcelo" regresa al inicio', await p.isVisible('#profileName') && !(await p.isVisible('#fichaBarra')));
  // Botón atrás del celular: en una sección regresa a la ficha; en la ficha, la cierra y deja la lista.
  await seccion(p, 'familia');
  await p.goBack(); await p.waitForTimeout(300);
  revisa('[atrás] desde una sección, atrás regresa a la ficha', await p.isVisible('#profileName') && !(await p.isVisible('#fichaBarra')) && await p.evaluate(() => document.getElementById('profilePanel').classList.contains('open')));
  await seccion(p, 'familia'); await seccion(p, 'resumen');
  revisa('[atrás] "‹ Marcelo" no deja entradas de más en el historial', await p.evaluate(() => history.state?.ficha === 'abierta'), await p.evaluate(() => JSON.stringify(history.state)));
  // Avisos como globito rojo en su renglón (19/11/2026): ya no hay un grupo de
  // avisos aparte. Portero va en Deportivo; documentos y fotos, en Expediente.
  const ap = await p.evaluate(() => {
    const fila = k => document.querySelector(`#fichaTabs [data-ficha-tab="${k}"]`);
    const r = el => el.getBoundingClientRect();
    return { avisosArriba: !!(document.querySelector('#fichaChips')?.offsetParent || document.querySelector('.player-profile-hero #privacyBadges')?.offsetParent),
      deportivo: fila('deportivo')?.innerText.replace(/\s+/g, ' ') || '', expediente: fila('expediente')?.innerText.replace(/\s+/g, ' ') || '',
      globo: fila('expediente')?.querySelector('.ficha-globo')?.textContent || '', globosOtros: document.querySelectorAll('#fichaTabs .ficha-globo').length,
      accionesBajoNombre: r(document.getElementById('fichaAcciones')).top >= r(document.getElementById('profileName')).bottom - 1 && r(document.getElementById('fichaAcciones')).bottom <= r(document.getElementById('fichaTabs')).top + 1,
      evaluar: document.querySelectorAll('#profileView [data-ficha-evaluar]').length };
  });
  revisa('[globos] ya no hay grupo de avisos arriba: la ficha es una sola lista', !ap.avisosArriba, ap);
  revisa('[globos] Expediente: globito con 2 y dice qué falta (acta y fotos)', ap.globo === '2' && /Falta acta de nacimiento/.test(ap.expediente) && /No autorizan fotos/.test(ap.expediente), ap);
  revisa('[globos] sólo Expediente trae globito', ap.globosOtros === 1, ap);
  revisa('[globos] la ficha dice que es portero y cuándo entrena con la academia (en Deportivo)', /Portero · con la academia · Martes 5:00 a 6:00 pm/.test(ap.deportivo), ap.deportivo);
  revisa('[apple] los botones redondos quedan justo debajo del nombre, antes de la lista', ap.accionesBajoNombre, ap);
  revisa('[apple] un solo botón Evaluar en toda la ficha', ap.evaluar === 1, ap);

  // Permiso de imagen: vive en Expediente, arriba de los datos.
  await seccion(p, 'expediente');
  revisa('[imagen] en Expediente están los permisos', await visible(p, '#fichaPermisos #privacyBadges [class*="img-"]'));
  await p.click('#privacyBadges [class*="img-"]');
  revisa('[imagen] tocar el aviso abre el registro de permisos', await visible(p, '#consentBox'));
  const wa = await p.getAttribute('#consentBox .consent-wa', 'href');
  revisa('[imagen] trae el WhatsApp para pedir el permiso', (wa||'').startsWith('https://wa.me/524771112233?text='), wa);
  await seccion(p, 'resumen');

  // Secciones
  await seccion(p, 'familia');
  const fam = await texto(p, '#fichaFamilia');
  revisa('[familia] tutores con quién paga y hermanos', /Laura Ortiz/.test(fam) && /paga la mensualidad/.test(fam) && /HERMANOS EN EL CLUB/.test(fam) && /Milan Pedroza/.test(fam), fam.slice(0,240));
  revisa('[familia] aquí sí está el formulario del tutor', await visible(p, '#guardianName') && await p.isHidden('#firstName'));
  await seccion(p, 'expediente');
  revisa('[expediente] datos y documentos', await visible(p, '#firstName') && await visible(p, '#documentChecklist'));
  const docs = await texto(p, '#docsProgreso');
  revisa('[docs] 2 de 3 entregados', /2 de 3 entregados/.test(docs), docs);
  const dwa = await p.getAttribute('#docsProgreso .docs-wa', 'href');
  revisa('[docs] pedir lo que falta por WhatsApp', /Acta%20de%20nacimiento/.test(dwa||''), dwa);
  await seccion(p, 'resumen');

  // Más
  await p.click('[data-ficha-mas]');
  revisa('[más] abre la hoja con los botones de siempre', await visible(p, '#fichaMas') && await visible(p, '#credencialTanner'));
  await p.click('#fichaMas >> text=Editar expediente');
  revisa('[más] "Editar expediente" lleva a Expediente', (await p.getAttribute('[data-ficha-tab="expediente"]', 'aria-selected')) === 'true' && await p.isHidden('#fichaMas'));
  const acc = await p.$$eval('#fichaAcciones .ficha-accion', a => a.map(x => x.textContent.trim()));
  revisa('[acciones] WhatsApp, Llamar, Evaluar, Más (sin Cobrar)', JSON.stringify(acc) === JSON.stringify(['WhatsApp','Llamar','Evaluar','Más']), JSON.stringify(acc));
  await seccion(p, 'resumen');
  await p.click('[data-ficha-mas]');
  const puente = await p.$$eval('#fichaMas .ficha-mas-dinero', els => els.map(e => e.textContent.trim() + (e.getAttribute('href') ? ' ' + e.getAttribute('href') : '')));
  revisa('[separación] "Más" es el único puente: su cuenta en Taquilla y Beca y apoyos', JSON.stringify(puente) === JSON.stringify(['Ver su cuenta en Taquilla /tanner/?id=p1', 'Beca y apoyos']), JSON.stringify(puente));
  await p.click('#fichaMas [data-ficha-ir="apoyos"]');
  revisa('[separación] "Beca y apoyos" abre su pantalla y cierra "Más"', await visible(p, '#benefitsPanel') && await p.isHidden('#fichaMas'));
  await seccion(p, 'resumen');
  revisa('[pres] sin scroll horizontal', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await seccion(p, 'resumen');
  await p.screenshot({ path: path.join(RAIZ, 'docs/evidencias/ficha-tanner-telefono.png') });
  await p.goBack(); await p.waitForTimeout(300);
  revisa('[atrás] en la ficha, atrás la cierra y te deja en Jugadores', !(await p.evaluate(() => document.getElementById('profilePanel').classList.contains('open'))) && /\/v2\/jugadores\//.test(p.url()), p.url());
  await p.close();
}

/* ---------- Profe ---------- */
{
  const p = await abre('Formadores');
  revisa('[profe] entra directo a Deportivo, con "‹ Marcelo" para la ficha completa', await visible(p, '#sportsSnapshot') && /Deportivo/.test(await texto(p, '#fichaBarra strong')));
  await p.goBack(); await p.waitForTimeout(300);
  revisa('[profe] atrás del celular lo lleva a la ficha completa, no la cierra', await p.isVisible('#profileName') && await p.evaluate(() => document.getElementById('profilePanel').classList.contains('open')));
  const secs = await p.$$eval('#fichaTabs .ficha-seccion', b => b.map(x => x.dataset.fichaTab));
  revisa('[profe] su lista: Deportivo primero y sin Pagos', secs[0] === 'deportivo' && !secs.includes('pagos'), JSON.stringify(secs));
  revisa('[profe] no ve adeudo ni pedidos', await p.isHidden('#fichaCuenta'));
  revisa('[profe] la beca es dato de Familia, sin monto ni enlace a apoyos', await p.getAttribute('#fichaBeca', 'data-ficha') === 'familia' && !(await p.getAttribute('#fichaBeca', 'data-ficha-ir')) && !/50%/.test(await p.textContent('#fichaBeca')));
  const acc = await p.$$eval('#fichaAcciones .ficha-accion', a => a.map(x => x.textContent.trim()));
  revisa('[profe] su botón principal es Evaluar, sin Cobrar', !acc.includes('Cobrar') && acc.includes('Evaluar'), JSON.stringify(acc));
  // El profe toma las fotos en cancha: con permiso de Jugadores también ve la cámara.
  revisa('[profe] con permiso de Jugadores también puede cambiar la foto desde la ficha', await p.getAttribute('#fichaAvatar', 'aria-label') === 'Ver o cambiar la foto');
  await p.close();
}

/* ---------- Computadora ---------- */
{
  const p = await abre('Presidencia', 1280);
  revisa('[compu] foto grande de 208px', await p.evaluate(() => Math.round(document.getElementById('fichaAvatar').getBoundingClientRect().width) === 208));
  await seccion(p, 'deportivo');
  revisa('[compu] perfil deportivo en 2 columnas (dos datos)', await p.evaluate(() => getComputedStyle(document.querySelector('.ficha-perfil-grid')).gridTemplateColumns.split(' ').length === 2));
  await seccion(p, 'resumen');
  await p.screenshot({ path: path.join(RAIZ, 'docs/evidencias/ficha-tanner-compu.png') });
  await p.close();
}

await nav.close(); srv.close();
let mal = 0;
for (const r of revisiones) if (!r.ok) { mal++; console.error(` - ${r.nombre}${r.detalle ? ' :: ' + r.detalle : ''}`); }
if (errores.length) { console.error('ERRORES DEL NAVEGADOR:'); errores.forEach(e => console.error('   ' + e)); }
if (mal || errores.length) { console.error(`Ficha Tanner humo FAILED · ${mal} de ${revisiones.length}, ${errores.length} errores`); process.exit(1); }
console.log(`Ficha Tanner humo OK · ${revisiones.length} revisiones: encabezado compacto, beca visible, adeudo y pedidos, pestañas por rol, familia, documentos e historia`);
