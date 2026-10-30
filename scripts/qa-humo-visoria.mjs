/* La visoría con consentimiento informado (29/10/2026, h53 · h54).
 *
 * Paquete docs/visorias/ (00 a 03). Lo que se protege, en el navegador:
 *   1. Portada: fechas, sin costo, lugares, calzado; si la firma no está
 *      aprobada dice "Apartar su lugar".
 *   2. Tu hijo: foto y datos obligatorios marcados.
 *   3. Su familia: nombre y apellido, parentesco, WhatsApp, emergencia que
 *      sea otra persona. Apartar NO manda salud ni firma.
 *   4. Salud: cuatro preguntas, "Sí" pide cuál; nada se adelanta.
 *   5. Autorizaciones: el aviso de seguro va arriba y visible; hay que abrir
 *      los dos documentos; ninguna casilla viene marcada; fotos con Sí/No sin
 *      valor por defecto (TC-06).
 *   6. Firma: sin trazo no firma; manda cada decisión por separado, la huella
 *      del evento y la versión del documento; genera el expediente y no dice
 *      "listo" sin él (TC-14).
 *   7. Con la liga: la familia ve su estado, descarga su copia y retira el
 *      permiso de fotos (TC-07).
 *   8. Si el documento cambió mientras firmaba: lo dice y regresa (TC-11).
 *   9. Staff: estado de acceso por niño, la hoja de la puerta y el evento con
 *      sus aprobaciones; un visor no ve contacto ni salud.
 *   Todo a 390px sin salirse de la pantalla. Hermética: nada sale de 127.0.0.1.
 */
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const T = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
            '.svg':'image/svg+xml','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('no'); return; }
  r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
  r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}`;

const SHELL = `
  export const supabase = { auth:{ getSession:async()=>({data:{session:{user:{id:'u1'}}}}),
    getUser:async()=>({data:{user:{id:'u1',app_metadata:{}}}}), signOut:async()=>({}),
    onAuthStateChange(){ return {data:{subscription:{unsubscribe(){}}}}; } } };
  export async function rpc(name){
    if(name==='v2_my_context') return [{ user_id:'u1', display_name:'Zulema García', organization_id:'o1', organization_name:'Tannery City FC', role:'Operaciones', is_owner:false }];
    if(name==='v2_my_navigation') return [];
    return null;
  }
  export function moduleAccess(){ return true; }
  export function setShellHealth(){}
  export function navigationMap(){ return new Map(); }
  export async function bootstrapProtectedShell(){ return { ctx:{ organization_id:'o1', organization_name:'Tannery City FC', role:'Operaciones' }, navigation:[] }; }
  export const shellIcon = () => '';
  export const navItems = [];
  export function setShellSearchItems(){}
  export function renderShell(){}
`;

const TOKEN = 'a'.repeat(48);
const INFO = (modo) => ({ slug:'visoria-noviembre-2026', title:'Visoría Tannery City', datesLabel:'Viernes 13 y sábado 14 de noviembre', location:null,
  startsOn:'2026-11-13', capacity:30, spotsLeft: modo === 'lleno' ? 0 : 18, open: modo !== 'lleno', closed:false, signingOpen: modo !== 'cerrada', documents:{} });
const DECL = [
  { key:'accept_participation', required:true, text:'He leído los términos y autorizo la participación del menor. Entiendo los riesgos propios del fútbol.' },
  { key:'ack_no_insurance', required:true, text:'Entiendo que esta visoría no incluye seguro médico ni de accidentes proporcionado por el organizador.' },
  { key:'ack_health_and_emergency', required:true, text:'He informado las condiciones relevantes de salud y autorizo la activación de servicios de emergencia.' },
  { key:'consent_sensitive_data', required:true, text:'Otorgo mi consentimiento expreso para el tratamiento limitado de datos de salud del menor.' },
  { key:'guardian_authority', required:true, text:'Declaro estar legalmente facultado(a) para otorgar esta autorización.' },
  { key:'media_publication', required:false, choice:true, text:'Autorizo la captación y publicación institucional de mi hijo(a) en fotografías o videos.' }];
const LEGAL = { organizer:'Organizador QA S.C.', schedule:'Viernes 13, 16:00 a 19:00', coordinator:'Coordinador QA', insurance:'sin_seguro_verificado', evaluator:null,
  eventHash:'e'.repeat(64), declarations:DECL,
  consent:{ id:'doc-c1', version:'CONSENTIMIENTO visoria-noviembre-2026-v1', title:'Consentimiento informado', hash:'c'.repeat(64),
    body:'1. Identificación\nYo, {{firmante}}, en mi carácter de {{parentesco}} de {{menor}}, nacido(a) el {{nacimiento}}.\n4. ESTA VISORÍA NO INCLUYE SEGURO MÉDICO.' },
  privacy:{ id:'doc-p1', version:'AVISO visoria-noviembre-2026-v1', title:'Aviso de privacidad', hash:'p'.repeat(64), body:'Aviso de privacidad. Derechos ARCO.' } };
const PROSPECTO = { firstName:'Leo', lastName:'Ávila', birthDate:'2015-03-02', folio:'TC-2026-00042', category:'T10', guardian:'Ana Ávila', relationship:'madre',
  type:'player', position:'Delantero', foot:'right', emergencia:{ nombre:'Luis Ávila', telefono:'4771234500' }, recoge:null, imageConsent:false };
const NINOS = [
  { id:'v1', folio:'TC-2026-00040', firstName:'Leo', lastName:'Ávila', birthDate:'2015-03-02', sex:'M', category:'T10', type:'player', foot:'right', school:'Colegio León',
    position:'Delantero', photoPath:'organizations/o1/prospects/v1/profile.webp', photoThumbPath:null, imageConsent:true, signed:true, arrivedAt:null, channel:'Instagram', evaluations:0, verdict:null,
    access:{ status:'PENDIENTE', reason:'Verificar la identidad de quien firmó.', consentId:'k1', consentStatus:'pending_verification', healthReview:'no_requiere' },
    guardian:'Ana Ávila', phone:'+524771234567', email:null, relationship:'madre', emergencia:{ nombre:'Luis Ávila', telefono:'+524771234500' }, signedBy:'Ana Ávila',
    signedRelationship:'madre', signedAt:'2026-10-29T18:00:00Z', hasCopy:true },
  { id:'v2', folio:'TC-2026-00041', firstName:'Mateo', lastName:'Ruiz', birthDate:'2013-07-10', sex:'M', category:null, type:'goalkeeper', foot:'left', school:'Escuela 5',
    position:'Portero', photoPath:null, photoThumbPath:null, imageConsent:false, signed:false, arrivedAt:null, channel:'Recomendación', evaluations:0, verdict:null,
    access:{ status:'SIN_CONSENTIMIENTO', reason:'Falta firmar el consentimiento.' },
    guardian:'Rosa Ruiz', phone:'+524779876543', email:null, relationship:'madre', emergencia:{ nombre:'Pedro Ruiz', telefono:'+524779876500' } }];
const SIN_CONTACTO = ['guardian','phone','email','emergencia','signedBy','signedAt','relationship','signedRelationship','hasCopy'];
const SETUP = { campaign:{ id:'c1', slug:'visoria-noviembre-2026', title:'Visoría Tannery City', location:'Tannery City Park', legal:{ organizador_domicilio:'Españita 1305' },
  insurance:'sin_verificar', insuranceDetail:null }, required:[], missing:['campo:organizador_legal','seguro','aprobacion:legal','aprobacion:operativa','aprobacion:seguridad'],
  eventHash:'e'.repeat(64), canAdmin:true, approvals:[], documents:[{ id:'t1', kind:'consentimiento', version:'plantilla-1.0', title:'Consentimiento informado', status:'plantilla', hash:'h'.repeat(64), campaign:false, body:'Texto' }],
  counts:{ consents:1, signed:0 }, audit:[{ at:'2026-10-29T18:00:00Z', action:'firma', result:'rechazado', kind:'familia', reason:'Signature required' }] };

const CLIENTE = (modo) => `
  window.__rpc=[]; window.__subidas=[]; window.__abiertas=[]; window.__fn=[]; window.open=(u)=>{window.__abiertas.push(u);return null;};
  window.confirm=()=>true; window.alert=()=>{}; window.prompt=()=>'Referencia de prueba QA';
  const MODO=${JSON.stringify(modo)};
  const ninos=${JSON.stringify(NINOS)};
  let firmo = MODO==='liga';
  const contexto=()=>({ prospect:${JSON.stringify(PROSPECTO)}, campaign:{ slug:'visoria-noviembre-2026', title:'Visoría Tannery City', datesLabel:'Viernes 13 y sábado 14 de noviembre', location:'Tannery City Park' },
    access:{ status: firmo ? (MODO==='liga' ? 'AUTORIZADO' : 'PENDIENTE') : 'SIN_CONSENTIMIENTO' },
    consent: firmo ? { id:'k1', status: MODO==='liga' ? 'signed' : 'pending_verification', hasCopy:true, outdated:false, media: MODO==='liga' } : null,
    signingOpen: MODO!=='cerrada', legal: MODO==='cerrada' ? null : ${JSON.stringify(LEGAL)} });
  export function createClient(){return{
    auth:{getSession:async()=>({data:{session:{user:{id:'u1'},access_token:'x'}}}),onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}}},
    storage:{from:()=>({upload:async(ruta)=>{window.__subidas.push(ruta);return{data:{path:ruta},error:null};},
      createSignedUrls:async(paths)=>({data:[],error:null})})},
    functions:{invoke:async(n,o)=>{window.__fn.push({n,body:o.body});return{data:o.body.action==='copy'?{ok:true,url:'https://almacen.invalid/expediente.pdf'}:{ok:true,status:'pending_verification'},error:null};}},
    rpc:async(n,p={})=>{
      window.__rpc.push({n,p:JSON.parse(JSON.stringify(p))});
      const ok=d=>({data:d,error:null});
      if(n==='v2_public_visoria')return ok(MODO==='lleno'?${JSON.stringify(INFO('lleno'))}:MODO==='cerrada'?${JSON.stringify(INFO('cerrada'))}:${JSON.stringify(INFO(''))});
      if(n==='v2_public_context')return ok({organizationId:'o1',categories:['T8','T10','T12']});
      if(n==='v2_public_visoria_reserve')return ok({id:'p-nuevo',folio:'TC-2026-00042',existing:false,token:'${TOKEN}'});
      if(n==='v2_public_visoria_sign_context')return ok(contexto());
      if(n==='v2_public_visoria_sign'){ if(MODO==='version') return ok({error:'Document version changed'}); firmo=true; return ok({consentId:'k1',status:'pending_artifact',existing:false}); }
      if(n==='v2_public_visoria_media_revoke')return ok({imageConsent:false});
      if(n==='v2_public_attach_prospect_photo')return ok(true);
      if(n==='v2_my_context')return ok([{user_id:'u1',display_name:'Zulema García',organization_id:'o1',organization_name:'Tannery City FC',role:'Operaciones',is_owner:false}]);
      if(n==='v2_visoria_board'){const todo=MODO!=='visor';
        return ok({campaign:{ id:'c1', slug:'visoria-noviembre-2026', title:'Visoría Tannery City', datesLabel:'Viernes 13 y sábado 14 de noviembre', location:null, startsOn:'2026-11-13', capacity:30, open:true, signingOpen:false },
          canSeeContact:todo,canWrite:true,canHealth:false,canAdmin:todo,items:ninos.map(x=>{const y={...x};if(!todo){${JSON.stringify(SIN_CONTACTO)}.forEach(k=>delete y[k]);y.access={status:y.access.status==='AUTORIZADO'?'AUTORIZADO':'NO_AUTORIZADO'};}return y;})});}
      if(n==='v2_visoria_setup')return ok(${JSON.stringify(SETUP)});
      if(n==='v2_visoria_verify')return ok({status:'signed'});
      if(n==='v2_visoria_sign_link')return ok({token:'${'b'.repeat(48)}',phone:'4779876543',guardian:'Rosa Ruiz',firstName:'Mateo'});
      if(n==='v2_visoria_arrival')return ok({arrivedAt:p.value?'2026-11-13T16:05:00Z':null});
      if(n==='v2_create_scouting_report')return ok('r1');
      return ok(null);}};}`;

const nav = await chromium.launch({ executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
let fallos = 0, corridas = 0;
const revisa = (nombre, ok, detalle) => { corridas++; if (!ok) { fallos++; console.error(` - ${nombre}${detalle ? `\n   ${detalle}` : ''}`); } };
const llamadas = (pg, n) => pg.evaluate(x => window.__rpc.filter(r => r.n === x).map(r => r.p), n);
// Un PNG de 2x2: lo que el teléfono manda como foto.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mNk+M9Qz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC', 'base64');

async function abre(ruta, modo = '') {
  const pg = await nav.newPage({ viewport:{ width:Number(process.env.ANCHO || 390), height:844 } });
  const errs = [];
  pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await pg.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await pg.route(/\/v2\/supabase-client\.js(\?.*)?$/, r => r.fulfill({ status:200, contentType:'text/javascript', body:CLIENTE(modo) }));
  await pg.route(/\/v2\/shell\.js(\?.*)?$/, r => r.fulfill({ status:200, contentType:'text/javascript', body:SHELL }));
  await pg.goto(BASE + ruta, { waitUntil:'networkidle' });
  return { pg, errs };
}
const cabe = pg => pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const texto = async (pg, sel) => (await pg.textContent(sel)).replace(/\s+/g, ' ');
const firma = async pg => {
  const c = await pg.$('#viLienzo'); const b = await c.boundingBox();
  await pg.mouse.move(b.x + 30, b.y + 40); await pg.mouse.down();
  for (let i = 1; i <= 24; i++) await pg.mouse.move(b.x + 30 + i * 10, b.y + 40 + (i % 2 ? 30 : 0));
  await pg.mouse.up();
};
async function ninoYFamilia(pg) {
  await pg.waitForSelector('[data-empieza]', { timeout:8000 });
  await pg.click('[data-empieza]');
  await pg.waitForSelector('#viNombre');
  await pg.setInputFiles('#viGaleria', { name:'leo.png', mimeType:'image/png', buffer:PNG });
  await pg.fill('#viNombre', 'Leo'); await pg.fill('#viApellidos', 'Ávila'); await pg.fill('#viNacimiento', '2015-03-02');
  await pg.click('[data-campo="sex"] [data-v="M"]'); await pg.selectOption('#viCategoria', 'T10');
  await pg.click('[data-campo="position"] [data-v="Delantero"]'); await pg.click('[data-campo="foot"] [data-v="right"]');
  await pg.fill('#viEscuela', 'Colegio León');
  await pg.click('[data-sigue]');
  await pg.waitForSelector('#viTutor', { timeout:3000 });
}

// 1-7: firma abierta, una mamá inscribe a su hijo de punta a punta.
{
  const { pg, errs } = await abre('/visoria/');
  await pg.waitForSelector('[data-empieza]', { timeout:8000 });
  const portada = await texto(pg, '#contenido');
  if (process.env.SHOTS) await pg.screenshot({ path:`${process.env.SHOTS}/visoria-portada.png`, fullPage:true });
  revisa('1. la portada dice cuándo, sin costo y cuántos lugares quedan', /Viernes 13 y sábado 14 de noviembre/.test(portada) && /Sin costo/.test(portada) && /Quedan 18 de 30 lugares/.test(portada), portada);
  revisa('1. la portada avisa que los tachones están prohibidos', /Prohibidos los tachones/.test(portada) && /multitacos o tenis deportivos/.test(portada));
  revisa('1. con la firma abierta dice "Inscribir a mi hijo"', /Inscribir a mi hijo/.test(portada));
  revisa('1. cabe a 390px', await cabe(pg));
  await pg.click('[data-empieza]');
  await pg.waitForSelector('#viNombre');
  revisa('2. dice qué es obligatorio y en qué paso va (1 de 5)', /Todo es obligatorio, salvo lo que dice opcional/.test(await pg.textContent('.vi-leyenda')) && /Paso 1 de 5/.test(await pg.textContent('.vi-tope'))
    && await pg.evaluate(() => getComputedStyle(document.querySelector('label.vi-campo:not(.opc) > span'), '::after').content.includes('*')));
  await pg.click('[data-sigue]');
  revisa('2. sin foto no avanza', /Falta la foto/.test(await pg.textContent('#viAviso')));
  await pg.goBack().catch(() => {}); await pg.close();
}
{
  const { pg, errs } = await abre('/visoria/');
  await ninoYFamilia(pg);
  await pg.fill('#viTutor', 'Ana'); await pg.fill('#viTel', '477 123 4567');
  await pg.click('[data-campo="channel"] [data-v="Instagram"]');
  await pg.click('[data-aparta]');
  revisa('3. pide nombre y apellido', /nombre y apellido/.test(await pg.textContent('#viAviso')));
  await pg.fill('#viTutor', 'Ana Ávila');
  await pg.click('[data-aparta]');
  revisa('3. pide parentesco', /mamá, papá o tutor/.test(await pg.textContent('#viAviso')));
  await pg.click('[data-campo="relationship"] [data-v="madre"]');
  await pg.fill('#viEmNombre', 'Luis Ávila'); await pg.fill('#viEmTel', '477 123 4567');
  await pg.click('[data-aparta]');
  revisa('3. la emergencia tiene que ser otra persona', /otra persona/.test(await pg.textContent('#viAviso')));
  await pg.fill('#viEmTel', '4771234500');
  revisa('3. el paso Familia cabe a 390px', await cabe(pg));
  await pg.click('[data-aparta]');
  await pg.waitForSelector('[data-pregunta="condicion"]', { timeout:8000 });
  const r = (await llamadas(pg, 'v2_public_visoria_reserve'))[0] || {};
  revisa('3. aparta con niño, tutor, parentesco y emergencia', r.nino?.firstName === 'Leo' && r.tutor?.relationship === 'madre' && r.tutor?.phone === '4771234567' && r.emergencia?.telefono === '4771234500', JSON.stringify(r));
  revisa('3. apartar NO manda salud ni firma', !('salud' in r) && !('firma' in r) && !JSON.stringify(r).includes('alergia'));
  revisa('3. sube la foto y la liga al registro', (await pg.evaluate(() => window.__subidas)).some(x => /prospects\/p-nuevo\/profile\./.test(x)));
  revisa('3. guarda la liga de la familia en la dirección', (await pg.evaluate(() => location.hash)) === `#firmar=${TOKEN}`);

  // 4. Salud.
  revisa('4. salud: dice que es dato sensible y no un certificado', /dato sensible/.test(await texto(pg, '.vi-paso')) && /no sustituye una valoración médica/.test(await texto(pg, '.vi-paso')));
  revisa('4. ninguna respuesta viene marcada', await pg.evaluate(() => !document.querySelector('[data-pregunta] [aria-checked="true"]')));
  await pg.click('[data-sigue]');
  revisa('4. sin contestar no avanza', /cuatro preguntas/.test(await pg.textContent('#viAviso')));
  for (const q of ['condicion', 'restriccion', 'atencion']) await pg.click(`[data-campo="salud:${q}"] [data-v="ninguna"]`);
  await pg.click('[data-campo="salud:alergias"] [data-v="si"]');
  await pg.click('[data-sigue]');
  revisa('4. "Sí" pide cuál', /cuál/.test(await pg.textContent('#viAviso')));
  await pg.fill('#viSalud_alergias', 'Penicilina');
  if (process.env.SHOTS) await pg.screenshot({ path:`${process.env.SHOTS}/visoria-salud.png`, fullPage:true });
  revisa('4. Salud cabe a 390px', await cabe(pg));
  await pg.click('[data-sigue]');
  await pg.waitForSelector('.vi-seguro', { timeout:3000 });

  // 5. Autorizaciones.
  const seguro = await texto(pg, '.vi-seguro');
  revisa('5. el aviso de seguro sale tal cual y antes de las casillas', /IMPORTANTE: ESTA VISORÍA NO INCLUYE SEGURO MÉDICO NI DE ACCIDENTES PROPORCIONADO POR TANNERY CITY FC/.test(seguro)
    && await pg.evaluate(() => !!(document.querySelector('.vi-seguro').compareDocumentPosition(document.querySelector('[data-declara]')) & Node.DOCUMENT_POSITION_FOLLOWING)), seguro);
  revisa('5. organizador, fecha, sede y versión a la vista', /Organizador QA S\.C\./.test(await texto(pg, '.vi-evento')) && /CONSENTIMIENTO visoria-noviembre-2026-v1/.test(await texto(pg, '.vi-evento')));
  revisa('5. ninguna casilla viene marcada', await pg.evaluate(() => [...document.querySelectorAll('[data-declara]')].every(i => !i.checked) && !document.querySelector('[data-decision] [aria-checked="true"]')));
  revisa('5. la autorización de fotos dice que es opcional y no afecta', /no afecta su participación/.test(await texto(pg, '[data-decision="media_publication"]')));
  await pg.click('[data-sigue]');
  revisa('5. hay que abrir el consentimiento completo antes', /lee el consentimiento completo/.test(await pg.textContent('#viAviso')));
  await pg.click('[data-doc="consentimiento"]');
  await pg.waitForSelector('#viHoja');
  const doc = await texto(pg, '#viHoja');
  revisa('5. el documento completo se lee con quien firma y el menor ya puestos', /Yo, Ana Ávila, en mi carácter de MADRE de Leo Ávila, nacido\(a\) el 02\/03\/2015/.test(doc) && !/\{\{/.test(doc), doc);
  revisa('5. el documento se puede descargar', !!(await pg.$('#viHoja [data-descarga="consentimiento"]')));
  if (process.env.SHOTS) await pg.screenshot({ path:`${process.env.SHOTS}/visoria-documento.png` });
  await pg.click('#viHoja footer [data-cierra]');
  await pg.click('[data-doc="privacidad"]'); await pg.waitForSelector('#viHoja'); await pg.click('#viHoja footer [data-cierra]');
  await pg.click('[data-sigue]');
  revisa('5. sin palomear la participación no avanza', /autorización de participación/.test(await pg.textContent('#viAviso')));
  for (const k of ['accept_participation', 'ack_no_insurance', 'ack_health_and_emergency', 'consent_sensitive_data']) await pg.check(`[data-declara="${k}"]`);
  await pg.click('[data-sigue]');
  revisa('5. fotos: hay que contestar Sí o No (TC-06)', /fotos y video/.test(await pg.textContent('#viAviso')));
  await pg.click('[data-campo="decision:media_publication"] [data-v="no"]');
  if (process.env.SHOTS) await pg.screenshot({ path:`${process.env.SHOTS}/visoria-autorizaciones.png`, fullPage:true });
  revisa('5. Autorizaciones cabe a 390px', await cabe(pg));
  await pg.click('[data-sigue]');
  await pg.waitForSelector('#viLienzo', { timeout:3000 });

  // 6. Firma.
  revisa('6. quien firma ya trae el nombre y el WhatsApp del tutor', (await pg.inputValue('#viFirmante')) === 'Ana Ávila' && (await pg.inputValue('#viFirmaTel')) === '477 123 4567');
  revisa('6. el lienzo es nítido en pantallas de alta densidad', await pg.evaluate(() => { const c = document.getElementById('viLienzo'); return c.width >= Math.round(c.getBoundingClientRect().width * (window.devicePixelRatio || 1)) - 1; }));
  await pg.click('[data-firma]');
  revisa('6. sin trazo no firma', /Falta tu firma/.test(await pg.textContent('#viAviso')) && (await llamadas(pg, 'v2_public_visoria_sign')).length === 0);
  await firma(pg);
  await pg.click('[data-firma]');
  revisa('6. sin declararse facultado no firma', /facultado/.test(await pg.textContent('#viAviso')) && (await llamadas(pg, 'v2_public_visoria_sign')).length === 0);
  await pg.check('#viAutoridad');
  if (process.env.SHOTS) await pg.screenshot({ path:`${process.env.SHOTS}/visoria-firma.png`, fullPage:true });
  await pg.click('[data-firma]');
  await pg.waitForSelector('.vi-estado', { timeout:8000 });
  const s = (await llamadas(pg, 'v2_public_visoria_sign'))[0] || {}, pay = s.payload || {};
  revisa('6. firma con la liga, la huella del evento y los documentos exactos', s.token === TOKEN && pay.eventHash === 'e'.repeat(64) && pay.consentDocumentId === 'doc-c1' && pay.privacyDocumentId === 'doc-p1', JSON.stringify(s).slice(0, 300));
  revisa('6. cada decisión por separado, con su hora, y el No de fotos', ['accept_participation', 'ack_no_insurance', 'ack_health_and_emergency', 'consent_sensitive_data', 'guardian_authority'].every(k => pay.choices?.[k]?.value === true && pay.choices[k].at)
    && pay.choices?.media_publication?.value === false, JSON.stringify(pay.choices));
  revisa('6. manda la salud mínima y el trazo con sus medidas', pay.salud?.alergias?.respuesta === 'si' && pay.salud.alergias.detalle === 'Penicilina' && /^data:image\/png;base64,/.test(pay.firma?.imagen || '') && pay.firma.puntos >= 15 && pay.firma.ancho >= 40, JSON.stringify(pay.firma?.puntos));
  revisa('6. quien firma: nombre, parentesco, WhatsApp y emergencia distinta', pay.signer?.name === 'Ana Ávila' && pay.signer.relationship === 'madre' && pay.signer.phone === '4771234567' && pay.emergencia?.telefono === '4771234500');
  revisa('6. una llave para no duplicar si se reintenta', /^[a-z0-9-]{16,80}$/i.test(pay.idempotencyKey || ''));
  revisa('6. genera el expediente en el servidor con la liga', (await pg.evaluate(() => window.__fn))[0]?.body?.action === 'build' && (await pg.evaluate(() => window.__fn))[0]?.body?.token === TOKEN);
  const est = await texto(pg, '.vi-estado');
  revisa('6. no dice "listo": falta verificar identidad y dice cómo', /falta verificar que eres tú/.test(est) && /WhatsApp del club/.test(est), est);
  revisa('6. la salud ya no se queda en la página', await pg.evaluate(() => !document.body.innerHTML.includes('Penicilina')));
  // La liga firmada del PDF baja como archivo: la página se queda donde está.
  await pg.route(/almacen\.invalid/, r => r.fulfill({ status:200, contentType:'application/pdf', headers:{ 'content-disposition':'attachment; filename="expediente.pdf"' }, body:'%PDF-1.7' }));
  await pg.click('[data-copia]');
  await pg.waitForTimeout(400);
  revisa('6. descarga su copia en PDF', (await pg.evaluate(() => window.__fn)).some(f => f.body.action === 'copy' && f.body.token));
  await pg.waitForSelector('#viPaseImg img', { timeout:8000 });
  if (process.env.SHOTS) await pg.screenshot({ path:`${process.env.SHOTS}/visoria-pase.png`, fullPage:true });
  await pg.evaluate(() => { navigator.canShare = () => false; });
  await pg.click('[data-al-club]');
  await pg.waitForTimeout(200);
  const wa = (await pg.evaluate(() => window.__abiertas)).find(u => /wa\.me\/524792651338/.test(u)) || '';
  revisa('7. manda el pase al WhatsApp de Tannery City con su folio', /TC-2026-00042/.test(decodeURIComponent(wa)) && /Leo/.test(decodeURIComponent(wa)), wa);
  revisa('7. el pase va en el celular, sin hojas', /Llévalo en tu celular/.test(await pg.textContent('.vi-pase')) && !!(await pg.$('[data-guarda]')));
  revisa('7. cabe a 390px', await cabe(pg));
  revisa('sin errores de página (familia)', !errs.length, errs.join(' | '));
  await pg.close();
}
// Firma cerrada: sólo se aparta el lugar.
{
  const { pg, errs } = await abre('/visoria/', 'cerrada');
  await pg.waitForSelector('[data-empieza]', { timeout:8000 });
  revisa('8. sin aprobaciones: "Apartar su lugar" y avisa del consentimiento', /Apartar su lugar/.test(await texto(pg, '#contenido')) && /consentimiento/.test(await texto(pg, '#contenido')));
  await ninoYFamilia(pg);
  revisa('8. son dos pasos', /Paso 2 de 2/.test(await pg.textContent('.vi-tope')));
  await pg.fill('#viTutor', 'Ana Ávila'); await pg.fill('#viTel', '4771234567'); await pg.click('[data-campo="relationship"] [data-v="madre"]');
  await pg.click('[data-campo="channel"] [data-v="Instagram"]'); await pg.fill('#viEmNombre', 'Luis Ávila'); await pg.fill('#viEmTel', '4771234500');
  await pg.click('[data-aparta]');
  await pg.waitForSelector('.vi-estado', { timeout:8000 });
  const t = await texto(pg, '.vi-pase');
  revisa('8. lugar apartado, falta firmar y sin firma no entra', /Lugar apartado/.test(t) && /Falta firmar el consentimiento/.test(t) && /no puede entrar a la cancha/.test(t), t);
  revisa('8. nunca se enseñó un texto legal sin aprobar ni se pidió salud', !(await pg.$('[data-pregunta]')) && (await llamadas(pg, 'v2_public_visoria_sign')).length === 0);
  revisa('sin errores de página (cerrada)', !errs.length, errs.join(' | '));
  await pg.close();
}
// La familia regresa con su liga: ya firmó y quita el permiso de fotos.
{
  const { pg, errs } = await abre(`/visoria/#firmar=${TOKEN}`, 'liga');
  await pg.waitForSelector('.vi-estado', { timeout:8000 });
  revisa('9. con su liga ve su estado firmado y verificado', /firmado y verificado/.test(await texto(pg, '.vi-estado')));
  await pg.click('[data-quita-fotos]');
  await pg.waitForTimeout(250);
  revisa('9. retira el permiso de fotos (TC-07)', (await llamadas(pg, 'v2_public_visoria_media_revoke'))[0]?.token === TOKEN);
  revisa('sin errores de página (liga)', !errs.length, errs.join(' | '));
  await pg.close();
}
// El documento cambió mientras firmaba.
{
  const { pg, errs } = await abre('/visoria/', 'version');
  await ninoYFamilia(pg);
  await pg.fill('#viTutor', 'Ana Ávila'); await pg.fill('#viTel', '4771234567'); await pg.click('[data-campo="relationship"] [data-v="madre"]');
  await pg.click('[data-campo="channel"] [data-v="Instagram"]'); await pg.fill('#viEmNombre', 'Luis Ávila'); await pg.fill('#viEmTel', '4771234500');
  await pg.click('[data-aparta]'); await pg.waitForSelector('[data-pregunta]');
  for (const q of ['condicion', 'alergias', 'restriccion', 'atencion']) await pg.click(`[data-campo="salud:${q}"] [data-v="ninguna"]`);
  await pg.click('[data-sigue]'); await pg.waitForSelector('[data-doc]');
  await pg.click('[data-doc="consentimiento"]'); await pg.click('#viHoja footer [data-cierra]'); await pg.click('[data-doc="privacidad"]'); await pg.click('#viHoja footer [data-cierra]');
  for (const k of ['accept_participation', 'ack_no_insurance', 'ack_health_and_emergency', 'consent_sensitive_data']) await pg.check(`[data-declara="${k}"]`);
  await pg.click('[data-campo="decision:media_publication"] [data-v="si"]');
  await pg.click('[data-sigue]'); await pg.waitForSelector('#viLienzo');
  await firma(pg); await pg.check('#viAutoridad'); await pg.click('[data-firma]');
  await pg.waitForSelector('[data-doc]', { timeout:5000 });
  revisa('10. si el documento cambió: lo dice y pide leer la versión vigente (TC-11)', /cambió/.test(await pg.textContent('#viAviso')) && !(await pg.evaluate(() => window.__fn.length)));
  revisa('sin errores de página (versión)', !errs.length, errs.join(' | '));
  await pg.close();
}
// Cupo lleno.
{
  const { pg, errs } = await abre('/visoria/', 'lleno');
  await pg.waitForSelector('.vi-portada', { timeout:8000 });
  const t = await texto(pg, '#contenido');
  revisa('11. cupo lleno: lo dice y no deja inscribir', /Cupo lleno/.test(t) && !(await pg.$('[data-empieza]')) && /Avísame si se abre un lugar/.test(t), t);
  revisa('sin errores de página (lleno)', !errs.length, errs.join(' | '));
  await pg.close();
}
// Staff.
{
  const { pg, errs } = await abre('/v2/visorias/');
  await pg.waitForSelector('.vs-carta', { timeout:8000 });
  const cab = await texto(pg, '#vsCampana');
  if (process.env.SHOTS) await pg.screenshot({ path:`${process.env.SHOTS}/visorias-staff.png`, fullPage:true });
  revisa('12. cuántos van, autorizados y la liga', /2 de 30/.test(cab) && /autorizados/.test(cab) && /app\.tannerycity\.com\/visoria/.test(cab), cab);
  revisa('12. avisa que la firma está cerrada y lleva a Evento', /La firma del consentimiento está cerrada/.test(cab) && !!(await pg.$('[data-vista-ir="evento"]')));
  revisa('12. cada niño con su estado de acceso', /Pendiente/.test(await texto(pg, '.vs-carta[data-id="v1"]')) && /Sin consentimiento/.test(await texto(pg, '.vs-carta[data-id="v2"]')));
  await pg.click('.vs-carta[data-id="v1"] [data-ver-mas]');
  await pg.waitForSelector('#vsHoja .vs-datos', { timeout:3000 });
  const det = await texto(pg, '#vsHoja');
  revisa('12. staff ve tutor, emergencia, quién firmó y qué falta; nada de salud', /Ana Ávila/.test(det) && /Luis Ávila/.test(det) && /Verificar la identidad/.test(det) && !/alergia|Penicilina|IMSS/i.test(det), det);
  await pg.fill('#vsRef', 'El pase llegó del WhatsApp registrado');
  await pg.click('[data-verifica]');
  await pg.waitForTimeout(250);
  const v = (await llamadas(pg, 'v2_visoria_verify'))[0] || {};
  revisa('12. verificar identidad con método y referencia', v.consent_id === 'k1' && v.method === 'whatsapp_club' && /WhatsApp/.test(v.reference), JSON.stringify(v));
  await pg.click('.vs-carta[data-id="v2"] [data-ver-mas]');
  await pg.waitForSelector('#vsHoja [data-manda-liga]', { timeout:3000 });
  await pg.click('[data-manda-liga]');
  await pg.waitForTimeout(250);
  const liga = (await pg.evaluate(() => window.__abiertas)).find(u => /wa\.me\/524779876543/.test(u)) || '';
  revisa('12. manda la liga personal para firmar por WhatsApp a la familia', /firmar=b{48}/.test(decodeURIComponent(liga)), liga);
  await pg.click('#vsHoja [data-cierra]');
  await pg.click('.vs-carta[data-id="v2"] [data-llego]');
  await pg.waitForTimeout(250);
  revisa('12. marcar llegada de alguien sin consentimiento avisa que NO entra', /NO está autorizado/.test(await pg.textContent('#vsMensaje')));
  await pg.click('[data-vista="acceso"]');
  await pg.waitForSelector('.vs-puerta li', { timeout:3000 });
  const puerta = await texto(pg, '#vsAcceso');
  if (process.env.SHOTS) await pg.screenshot({ path:`${process.env.SHOTS}/visorias-acceso.png`, fullPage:true });
  revisa('12. la hoja de la puerta: primero quien no puede entrar, con su motivo', (await pg.$$eval('.vs-puerta li', l => l.map(x => x.dataset.id)))[0] === 'v2' && /Falta firmar el consentimiento/.test(puerta) && /no sustituye la revisión de la cancha/.test(puerta), puerta);
  await pg.click('[data-vista="evento"]');
  await pg.waitForSelector('.vs-aprob', { timeout:3000 });
  const ev = await texto(pg, '#vsEvento');
  if (process.env.SHOTS) await pg.screenshot({ path:`${process.env.SHOTS}/visorias-evento.png`, fullPage:true });
  revisa('12. Evento dice qué falta para abrir la firma', /La firma está cerrada/.test(ev) && /Organizador jurídico/.test(ev) && /verificar el estado real del seguro/.test(ev) && /aprobación legal/.test(ev), ev);
  revisa('12. tres aprobaciones y la bitácora con los rechazos', (await pg.$$('[data-aprueba]')).length === 3 && /rechazado/.test(ev));
  revisa('12. cabe a 390px', await cabe(pg));
  revisa('sin errores de página (staff)', !errs.length, errs.join(' | '));
  await pg.close();
}
// Visor.
{
  const { pg, errs } = await abre('/v2/visorias/', 'visor');
  await pg.waitForSelector('.vs-carta', { timeout:8000 });
  revisa('13. el visor no ve "Ver datos", teléfonos ni la pestaña Evento', !(await pg.$('[data-ver-mas]')) && !/\+52/.test(await pg.textContent('#vsLista')) && await pg.evaluate(() => document.getElementById('vsTabEvento').classList.contains('hidden')));
  revisa('13. sólo ve Autorizado o No autorizado', /No autorizado/.test(await texto(pg, '#vsLista')) && !/Sin consentimiento|Pendiente|Revisión médica/.test(await texto(pg, '#vsLista')));
  revisa('13. pero sí marca llegada y evalúa', !!(await pg.$('[data-llego]')) && !!(await pg.$('[data-evalua]')));
  revisa('sin errores de página (visor)', !errs.length, errs.join(' | '));
  await pg.close();
}

await nav.close(); srv.close();
console.log(fallos ? `Visoría humo FAILED · ${fallos} de ${corridas}` : `Visoría humo OK · ${corridas} revisiones: apartar, salud, autorizaciones sin nada marcado, aviso de seguro, firma con expediente, liga de la familia, versión cambiada, puerta del staff y lo que ve un visor`);
process.exit(fallos ? 1 : 0);
