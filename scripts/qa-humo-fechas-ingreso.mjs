/* LAS DOS FECHAS DE INGRESO: A TANNEROS Y AL CLUB.
 *
 * Pedido así: "fecha de ingreso en TannerOS y fecha de ingreso al club. Esas
 * dos, no más. Los de migración que se las podamos poner nosotros, todas
 * editables, y que quede registro de quién lo hizo."
 *
 * Esta prueba levanta la pantalla REAL de Jugadores y revisa:
 *
 *   · Presidencia ve las dos fechas, habilitadas, y al guardar manda las dos.
 *   · Debajo sale de dónde vino el Tanner (link / migración) y quién movió
 *     cada fecha.
 *   · Un rol que no es Presidencia las ve deshabilitadas y NO las manda.
 *
 * El candado de verdad vive en la base (prueba 11); esto cuida que la
 * pantalla no le ofrezca a nadie un campo que se le va a ignorar.
 */
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const RAIZ = '/home/user/TannerOs';
const T = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
            '.svg':'image/svg+xml','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('no'); return; }
  r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
  r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(4711, r));

const fila = { id:'t1', code:'Tanner012', first_name:'Iker Joan', last_name:'Flores Procopio',
  category:'T12', status_value:'active', jersey_number:'9', player_position:'Delantero',
  data_consent:true, has_guardian_email:true, photo_path:null, docs_missing:0 };
const perfil = (origen, historia) => ({ id:'t1', code:'Tanner012', firstName:'Iker Joan', lastName:'Flores Procopio',
  birthDate:'2015-07-31', position:'Delantero', dominantFoot:'right', sex:'M', category:'T12', status:'active',
  registeredAt:'2026-07-02', joinedAt:null, admissionOrigin:origen, admissionHistory:historia });

const stub = (esPresidencia, origen, historia) => `export function createClient(){return{
 auth:{getSession:async()=>({data:{session:{user:{id:'u1'}}}}),getUser:async()=>({data:{user:{app_metadata:{}}}}),signOut:async()=>({}),onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}}},
 storage:{from:()=>({createSignedUrl:async()=>({data:null,error:null}),createSignedUrls:async(ps)=>({data:ps.map(p=>({path:p,signedUrl:null})),error:null})})},
 rpc:async(n,p)=>{
  if(n==='v2_my_context')return{data:[{organization_id:'o1',organization_name:'Tannery City FC',role:${JSON.stringify(esPresidencia?'Presidencia':'Operaciones')},is_owner:false}],error:null};
  if(n==='v2_my_modules')return{data:[{module_code:'players',enabled:true,can_read:true,can_write:true}],error:null};
  if(n==='v2_can_set_joined_at')return{data:${esPresidencia},error:null};
  if(n==='v2_players')return{data:[${JSON.stringify(fila)}],error:null};
  if(n==='v2_player_categories')return{data:[{id:'c1',name:'T12'}],error:null};
  if(n==='v2_player_profile')return{data:{player:${JSON.stringify(perfil(origen, historia))},guardians:[],activeEnrollment:null},error:null};
  if(n==='v2_save_player_profile'){window.__guardado=p;return{data:{player:${JSON.stringify(perfil(origen, historia))},guardians:[],activeEnrollment:null},error:null};}
  return {data:[],error:null};}};}`;

const nav = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
let fallos = 0, corridas = 0;
const revisa = (nombre, ok, detalle) => { corridas++; if (!ok) { fallos++; console.error(` - ${nombre}${detalle ? `\n   ${detalle}` : ''}`); } };

async function abre(esPresidencia, origen, historia, captura) {
  const pg = await nav.newPage({ viewport:{ width:390, height:844 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  await pg.route('**/v2/supabase-client.js', r => r.fulfill({ status:200, contentType:'text/javascript', body:stub(esPresidencia, origen, historia) }));
  await pg.route('**/v2/branding-auto.js', r => r.fulfill({ status:200, contentType:'text/javascript', body:'' }));
  await pg.goto('http://127.0.0.1:4711/v2/jugadores/', { waitUntil:'networkidle' });
  const tarjetas = await pg.$$('.jcard');
  if (!tarjetas.length) { await pg.close(); return { error:'la lista salió vacía' }; }
  await tarjetas[0].click();
  await pg.waitForTimeout(700);

  const antes = await pg.evaluate(() => ({
    reg: document.getElementById('registeredAt')?.value ?? null,
    regOff: document.getElementById('registeredAt')?.disabled ?? null,
    club: document.getElementById('joinedAt')?.value ?? null,
    clubOff: document.getElementById('joinedAt')?.disabled ?? null,
    etiquetas: [...document.querySelectorAll('#profileForm label')].map(l => l.firstChild?.textContent?.trim()).filter(t => /ingreso/i.test(t || '')),
    rastro: document.getElementById('admissionTrail')?.innerText ?? '',
    rastroVisible: !document.getElementById('admissionTrail')?.classList.contains('hidden')
  }));

  if (captura) {
    await pg.evaluate(() => document.getElementById('registeredAt').scrollIntoView({ block:'start' }));
    await pg.waitForTimeout(200);
    await pg.screenshot({ path: captura });
  }

  await pg.evaluate(() => {
    const c = document.getElementById('joinedAt'); if (!c.disabled) c.value = '2024-08-15';
    const r = document.getElementById('registeredAt'); if (!r.disabled) r.value = '2026-06-30';
    document.getElementById('saveProfile').click();
  });
  await pg.waitForTimeout(600);
  const guardado = await pg.evaluate(() => window.__guardado ? { club: window.__guardado.joined_at, reg: window.__guardado.registered_at } : null);
  await pg.close();
  return { antes, guardado, errs };
}

const historia = [
  { field:'joinedAt', from:null, to:'2024-08-15', at:'2026-09-30T18:05:00Z', by:'Mich Enríquez' },
  { field:'registeredAt', from:'2026-08-19', to:'2026-07-02', at:'2026-09-30T18:04:00Z', by:'Mich Enríquez' }
];

/* ===== PRESIDENCIA, TANNER DE MIGRACIÓN ===== */
const captura = process.env.QA_CAPTURA || null;
const pres = await abre(true, 'migracion', historia, captura);
revisa('la ficha abre', !pres.error, pres.error);
if (!pres.error) {
  revisa('salen exactamente las dos fechas de ingreso',
    JSON.stringify(pres.antes.etiquetas) === JSON.stringify(['Fecha de ingreso a TannerOS', 'Fecha de ingreso al club']),
    JSON.stringify(pres.antes.etiquetas));
  revisa('la de TannerOS viene llena', pres.antes.reg === '2026-07-02', `trae: "${pres.antes.reg}"`);
  revisa('la del club, vacía en un migrado', pres.antes.club === '', `trae: "${pres.antes.club}"`);
  revisa('Presidencia puede mover las dos', pres.antes.regOff === false && pres.antes.clubOff === false,
    JSON.stringify(pres.antes));
  revisa('el rastro dice que viene de la migración', /migración/i.test(pres.antes.rastro), pres.antes.rastro);
  revisa('y quién movió cada fecha',
    pres.antes.rastroVisible && /Mich Enríquez cambió ingreso al club/.test(pres.antes.rastro)
      && /Mich Enríquez cambió ingreso a TannerOS de 19\/08\/2026 a 02\/07\/2026/.test(pres.antes.rastro),
    pres.antes.rastro);
  revisa('al guardar manda las dos fechas',
    pres.guardado?.club === '2024-08-15' && pres.guardado?.reg === '2026-06-30', JSON.stringify(pres.guardado));
  revisa('sin errores de consola', pres.errs.length === 0, pres.errs.join(' | '));
}

/* ===== OTRO ROL, TANNER QUE LLEGÓ POR EL LINK ===== */
const otro = await abre(false, 'link', [], null);
revisa('la ficha abre para otro rol', !otro.error, otro.error);
if (!otro.error) {
  revisa('las ve, pero deshabilitadas', otro.antes.regOff === true && otro.antes.clubOff === true, JSON.stringify(otro.antes));
  revisa('el rastro dice que llegó por el link', /link de registro/.test(otro.antes.rastro), otro.antes.rastro);
  revisa('y no manda ninguna al guardar',
    otro.guardado && otro.guardado.club === null && otro.guardado.reg === null, JSON.stringify(otro.guardado));
  revisa('sin errores de consola (otro rol)', otro.errs.length === 0, otro.errs.join(' | '));
}

await nav.close(); srv.close();
console.log(fallos
  ? `Fechas de ingreso humo FAILED · ${fallos} de ${corridas}`
  : `Fechas de ingreso humo OK · ${corridas} revisiones: las dos fechas, quién las mueve y quién las movió`);
process.exit(fallos ? 1 : 0);
