/* La visoría (29/10/2026, h53).
 *
 * Presidencia: "quiero que todos se me registren en TannerOS... que pueda
 * iniciar mi campaña para saber cuántos se inscribieron, que los visores
 * puedan ver sus datos, muy fácil con sus fotos, que firmen consentimientos".
 * Lo que se protege:
 *   1. La portada dice fechas, sin costo y cuántos lugares quedan; un botón.
 *   2. Paso 1: sin foto ni datos no avanza; con todo, sí.
 *   3. Paso 2: WhatsApp de 10 dígitos y contacto de emergencia obligatorios.
 *   4. Paso 3: sin firma con el dedo no inscribe; con firma, manda todo junto
 *      (niño, tutor, salud, emergencia, firma en PNG, uso de imagen).
 *   5. El pase trae el folio y WhatsApp para compartir; sube la foto.
 *   6. Cupo lleno: la portada lo dice y no deja inscribir.
 *   7. Staff ve cuántos van, la liga y cada niño con "Ver datos"; marca llegada
 *      y evalúa con un toque.
 *   8. Un visor (sólo Scouting) no ve teléfonos ni "Ver datos".
 *   Todo a 390px sin salirse de la pantalla.
 *
 * Hermética: nada sale de 127.0.0.1.
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

const INFO = (lleno) => ({ slug:'visoria-noviembre-2026', title:'Visoría Tannery City', datesLabel:'Viernes 13 y sábado 14 de noviembre', location:null,
  startsOn:'2026-11-13', capacity:30, spotsLeft: lleno ? 0 : 18, open: !lleno, closed:false,
  documents:{ visoria:{ title:'Términos para visorías', body:'Autorizo que mi hijo participe en visorías.\n\n• Una visoría no garantiza su selección.', version:1 },
              uso_de_imagen:{ title:'Uso de fotos y video', body:'Autorizo fotos y video.', version:1 } } });
const NINOS = [
  { id:'v1', folio:'TC-2026-00040', firstName:'Leo', lastName:'Ávila', birthDate:'2015-03-02', sex:'M', category:'T10', type:'player', foot:'right', school:'Colegio León',
    position:'Delantero', photoPath:'organizations/o1/prospects/v1/profile.webp', photoThumbPath:null, imageConsent:true, signed:true, arrivedAt:null, channel:'Instagram', evaluations:0, verdict:null,
    guardian:'Ana Ávila', phone:'+524771234567', email:null, salud:{ alergias:'Ninguna', seguro:'IMSS' }, emergencia:{ nombre:'Luis Ávila', telefono:'+524771234500' }, signedBy:'Ana Ávila', signedAt:'2026-10-29T18:00:00Z' },
  { id:'v2', folio:'TC-2026-00041', firstName:'Mateo', lastName:'Ruiz', birthDate:'2013-07-10', sex:'M', category:null, type:'goalkeeper', foot:'left', school:'Escuela 5',
    position:'Portero', photoPath:null, photoThumbPath:null, imageConsent:false, signed:true, arrivedAt:null, channel:'Recomendación', evaluations:0, verdict:null,
    guardian:'Rosa Ruiz', phone:'+524779876543', email:null, salud:{}, emergencia:{ nombre:'Pedro Ruiz', telefono:'+524779876500' }, signedBy:'Rosa Ruiz', signedAt:'2026-10-29T19:00:00Z' }];
const SIN_CONTACTO = ['guardian','phone','email','salud','emergencia','signedBy','signedAt'];

const CLIENTE = (modo) => `
  window.__rpc=[]; window.__subidas=[]; window.__abiertas=[]; window.open=(u)=>{window.__abiertas.push(u);return null;}; window.print=()=>{window.__impreso=true;};
  const MODO=${JSON.stringify(modo)};
  const ninos=${JSON.stringify(NINOS)};
  export function createClient(){return{
    auth:{getSession:async()=>({data:{session:{user:{id:'u1'},access_token:'x'}}}),onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}}},
    storage:{from:()=>({upload:async(ruta)=>{window.__subidas.push(ruta);return{data:{path:ruta},error:null};},
      createSignedUrls:async(paths)=>({data:[],error:null})})},
    rpc:async(n,p={})=>{
      window.__rpc.push({n,p:JSON.parse(JSON.stringify(p))});
      const ok=d=>({data:d,error:null});
      if(n==='v2_public_visoria')return ok(MODO==='lleno'?${JSON.stringify(INFO(true))}:${JSON.stringify(INFO(false))});
      if(n==='v2_public_context')return ok({organizationId:'o1',categories:['T8','T10','T12']});
      if(n==='v2_public_visoria_register')return ok({id:'p-nuevo',folio:'TC-2026-00042',existing:false});
      if(n==='v2_public_attach_prospect_photo')return ok(true);
      if(n==='v2_my_context')return ok([{user_id:'u1',display_name:'Zulema García',organization_id:'o1',organization_name:'Tannery City FC',role:'Operaciones',is_owner:false}]);
      if(n==='v2_visoria_board'){const todo=MODO!=='visor';
        return ok({campaign:${JSON.stringify({ slug:'visoria-noviembre-2026', title:'Visoría Tannery City', datesLabel:'Viernes 13 y sábado 14 de noviembre', location:null, startsOn:'2026-11-13', capacity:30, open:true })},
          canSeeContact:todo,canWrite:true,items:ninos.map(x=>{const y={...x};if(!todo)${JSON.stringify(SIN_CONTACTO)}.forEach(k=>delete y[k]);return y;})});}
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
const firma = async pg => {
  const c = await pg.$('#viLienzo'); const b = await c.boundingBox();
  await pg.mouse.move(b.x + 30, b.y + 60); await pg.mouse.down();
  for (let i = 1; i <= 8; i++) await pg.mouse.move(b.x + 30 + i * 25, b.y + 60 + (i % 2 ? 30 : -10));
  await pg.mouse.up();
};

// 1-5: una mamá inscribe a su hijo.
{
  const { pg, errs } = await abre('/visoria/');
  await pg.waitForSelector('[data-empieza]', { timeout:8000 });
  const portada = (await pg.textContent('#contenido')).replace(/\s+/g, ' ');
  if (process.env.SHOTS) await pg.screenshot({ path:`${process.env.SHOTS}/visoria-portada.png`, fullPage:true });
  revisa('1. la portada dice cuándo, sin costo y cuántos lugares quedan', /Viernes 13 y sábado 14 de noviembre/.test(portada) && /Sin costo/.test(portada) && /Quedan 18 de 30 lugares/.test(portada), portada);
  revisa('1. cabe a 390px', await cabe(pg));
  await pg.click('[data-empieza]');
  await pg.waitForSelector('#viNombre');
  revisa('2. dice qué es obligatorio', /Todo es obligatorio, salvo lo que dice opcional/.test(await pg.textContent('.vi-leyenda')) && await pg.evaluate(() => getComputedStyle(document.querySelector('label.vi-campo:not(.opc) > span'), '::after').content.includes('*')) && !!(await pg.$('label.vi-campo.opc')));
  await pg.click('[data-sigue]');
  revisa('2. sin foto no avanza', /Falta la foto/.test(await pg.textContent('#viAviso')));
  await pg.setInputFiles('#viGaleria', { name:'leo.png', mimeType:'image/png', buffer:PNG });
  await pg.fill('#viNombre', 'Leo'); await pg.fill('#viApellidos', 'Ávila'); await pg.fill('#viNacimiento', '2015-03-02');
  await pg.click('[data-campo="sex"] [data-v="M"]');
  await pg.selectOption('#viCategoria', 'T10');
  await pg.click('[data-campo="position"] [data-v="Delantero"]');
  await pg.click('[data-sigue]');
  revisa('2. sin pierna no avanza', /pierna/.test(await pg.textContent('#viAviso')));
  await pg.click('[data-campo="foot"] [data-v="right"]');
  await pg.fill('#viEscuela', 'Colegio León');
  if (process.env.SHOTS) await pg.screenshot({ path:`${process.env.SHOTS}/visoria-paso1.png`, fullPage:true });
  revisa('2. el paso 1 cabe a 390px', await cabe(pg));
  await pg.click('[data-sigue]');
  await pg.waitForSelector('#viTutor', { timeout:3000 });
  await pg.fill('#viTutor', 'Ana Ávila'); await pg.fill('#viTel', '477 123');
  await pg.click('[data-campo="channel"] [data-v="Instagram"]');
  await pg.click('[data-sigue]');
  revisa('3. WhatsApp de 10 dígitos', /10 dígitos/.test(await pg.textContent('#viAviso')));
  await pg.fill('#viTel', '477 123 4567');
  await pg.click('[data-sigue]');
  revisa('3. sin contacto de emergencia no avanza', /emergencia/.test(await pg.textContent('#viAviso')));
  await pg.fill('#viEmNombre', 'Luis Ávila'); await pg.fill('#viEmTel', '4771234500'); await pg.fill('#viAlergias', 'Ninguna');
  await pg.click('[data-campo="seguro"] [data-v="IMSS"]');
  await pg.click('[data-sigue]');
  await pg.waitForSelector('#viLienzo', { timeout:3000 });
  const doc = (await pg.textContent('.vi-doc')).replace(/\s+/g, ' ');
  revisa('4. enseña los términos de la visoría', /Términos para visorías/.test(doc) && /no garantiza su selección/.test(doc), doc);
  revisa('4. ya trae el nombre de quien firma', (await pg.inputValue('#viFirmante')) === 'Ana Ávila');
  await pg.check('#viAcepto');
  await pg.click('[data-inscribe]');
  revisa('4. sin firma no inscribe', /firma/.test(await pg.textContent('#viAviso')) && (await llamadas(pg, 'v2_public_visoria_register')).length === 0);
  await firma(pg);
  await pg.click('.vi-switch');
  if (process.env.SHOTS) await pg.screenshot({ path:`${process.env.SHOTS}/visoria-firma.png`, fullPage:true });
  await pg.click('[data-inscribe]');
  await pg.waitForSelector('.vi-pase', { timeout:8000 });
  const r = (await llamadas(pg, 'v2_public_visoria_register'))[0] || {};
  revisa('4. manda al niño completo', r.nino?.firstName === 'Leo' && r.nino?.birthDate === '2015-03-02' && r.nino?.foot === 'right' && r.nino?.position === 'Delantero' && r.nino?.category === 'T10' && r.nino?.sex === 'M', JSON.stringify(r.nino));
  revisa('4. manda tutor, emergencia y salud', r.tutor?.phone === '4771234567' && r.tutor?.channel === 'Instagram' && r.emergencia?.telefono === '4771234500' && r.salud?.seguro === 'IMSS', JSON.stringify([r.tutor, r.emergencia, r.salud]));
  revisa('4. manda la firma en PNG y su nombre', /^data:image\/png;base64,/.test(r.firma?.imagen || '') && r.firma?.nombre === 'Ana Ávila' && r.firma?.acepta === true);
  revisa('4. respeta "no" a fotos para redes', r.image_consent === false);
  const pase = (await pg.textContent('.vi-pase')).replace(/\s+/g, ' ');
  revisa('5. el pase trae su folio', /¡Leo está inscrito!/.test(pase) && /TC-2026-00042/.test(pase), pase);
  revisa('5. sube la foto y la liga al registro', (await pg.evaluate(() => window.__subidas)).some(x => /prospects\/p-nuevo\/profile\./.test(x)) && (await llamadas(pg, 'v2_public_attach_prospect_photo'))[0]?.prospect_id === 'p-nuevo');
  await pg.waitForSelector('#viPaseImg img', { timeout:8000 });
  revisa('5. el pase es la credencial del club en imagen', !!(await pg.$('#viPaseImg img')) && !!(await pg.$('#viImprime img')));
  if (process.env.SHOTS) await pg.screenshot({ path:`${process.env.SHOTS}/visoria-pase.png`, fullPage:true });
  await pg.evaluate(() => { navigator.canShare = () => false; });
  await pg.click('[data-al-club]');
  await pg.waitForTimeout(200);
  const wa = (await pg.evaluate(() => window.__abiertas))[0] || '';
  revisa('5. manda el pase al WhatsApp de Tannery City con su folio', /^https:\/\/wa\.me\/524792651338\?text=/.test(wa) && /TC-2026-00042/.test(decodeURIComponent(wa)) && /Leo/.test(decodeURIComponent(wa)), wa);
  await pg.click('[data-imprime]');
  revisa('5. imprimir el pase', await pg.evaluate(() => window.__impreso === true));
  revisa('5. el pase cabe a 390px', await cabe(pg));
  revisa('sin errores de página (familia)', !errs.length, errs.join(' | '));
  await pg.close();
}
// 6: cupo lleno.
{
  const { pg, errs } = await abre('/visoria/', 'lleno');
  await pg.waitForSelector('.vi-portada', { timeout:8000 });
  const t = (await pg.textContent('#contenido')).replace(/\s+/g, ' ');
  revisa('6. cupo lleno: lo dice y no deja inscribir', /Cupo lleno/.test(t) && !(await pg.$('[data-empieza]')) && /Avísame si se abre un lugar/.test(t), t);
  revisa('sin errores de página (lleno)', !errs.length, errs.join(' | '));
  await pg.close();
}
// 7: staff.
{
  const { pg, errs } = await abre('/v2/visorias/');
  await pg.waitForSelector('.vs-carta', { timeout:8000 });
  const cab = (await pg.textContent('#vsCampana')).replace(/\s+/g, ' ');
  if (process.env.SHOTS) await pg.screenshot({ path:`${process.env.SHOTS}/visorias-staff.png`, fullPage:true });
  revisa('7. cuántos van de cuántos y la liga', /2 de 30/.test(cab) && /28/.test(cab) && /app\.tannerycity\.com\/visoria/.test(cab), cab);
  revisa('7. por año y por canal', /2015 · 1/.test(cab) && /Instagram · 1/.test(cab), cab);
  const carta = (await pg.textContent('.vs-carta[data-id="v1"]')).replace(/\s+/g, ' ');
  revisa('7. cada niño con edad, posición y pierna', /Leo Ávila/.test(carta) && /Delantero · pierna derecha/.test(carta) && /Firmó/.test(carta), carta);
  revisa('7. sin foto lo marca', /Sin foto/.test(await pg.textContent('.vs-carta[data-id="v2"]')));
  await pg.click('.vs-carta[data-id="v1"] [data-ver-mas]');
  await pg.waitForSelector('#vsHoja .vs-datos', { timeout:3000 });
  const det = (await pg.textContent('#vsHoja')).replace(/\s+/g, ' ');
  revisa('7. staff ve tutor, WhatsApp, emergencia, salud y firma', /Ana Ávila/.test(det) && /\+524771234567/.test(det) && /Luis Ávila/.test(det) && /IMSS/.test(det) && /Firmó/.test(det), det);
  await pg.click('#vsHoja [data-cierra]');
  await pg.click('.vs-carta[data-id="v1"] [data-llego]');
  await pg.waitForTimeout(250);
  revisa('7. marcar llegada', (await llamadas(pg, 'v2_visoria_arrival'))[0]?.prospect_id === 'v1' && /Llegó/.test(await pg.textContent('.vs-carta[data-id="v1"] [data-llego]')));
  await pg.click('[data-ver="llegaron"]');
  revisa('7. filtro Llegaron', (await pg.$$('.vs-carta')).length === 1);
  await pg.click('[data-ver="todos"]');
  await pg.click('.vs-carta[data-id="v2"] [data-evalua]');
  await pg.waitForSelector('#vsHoja [data-guarda]', { timeout:3000 });
  await pg.click('[data-campo="technical"][data-nota="4"]');
  await pg.click('[data-campo="mental"][data-nota="5"]');
  await pg.click('[data-decision="invite"]');
  if (process.env.SHOTS) await pg.screenshot({ path:`${process.env.SHOTS}/visorias-evaluar.png` });
  await pg.click('[data-guarda]');
  await pg.waitForTimeout(300);
  const ev = (await llamadas(pg, 'v2_create_scouting_report'))[0] || {};
  revisa('7. evaluar con un toque queda ligado al niño', ev.prospect_id === 'v2' && ev.technical_score === 8 && ev.mental_score === 10 && ev.verdict === 'Invitar a prueba' && ev.player_position === 'Portero', JSON.stringify(ev));
  revisa('7. la carta dice la decisión', /Invitar a prueba/.test(await pg.textContent('.vs-carta[data-id="v2"]')));
  revisa('7. cabe a 390px', await cabe(pg));
  revisa('sin errores de página (staff)', !errs.length, errs.join(' | '));
  await pg.close();
}
// 8: visor.
{
  const { pg, errs } = await abre('/v2/visorias/', 'visor');
  await pg.waitForSelector('.vs-carta', { timeout:8000 });
  revisa('8. el visor no ve "Ver datos" ni teléfonos', !(await pg.$('[data-ver-mas]')) && !/\+52/.test(await pg.textContent('#vsLista')));
  revisa('8. pero sí marca llegada y evalúa', !!(await pg.$('[data-llego]')) && !!(await pg.$('[data-evalua]')));
  revisa('sin errores de página (visor)', !errs.length, errs.join(' | '));
  await pg.close();
}

await nav.close(); srv.close();
console.log(fallos ? `Visoría humo FAILED · ${fallos} de ${corridas}` : `Visoría humo OK · ${corridas} revisiones: portada con cupo, tres pasos con foto, firma con el dedo, pase con folio, cupo lleno, tablero del staff y lo que ve un visor`);
process.exit(fallos ? 1 : 0);
