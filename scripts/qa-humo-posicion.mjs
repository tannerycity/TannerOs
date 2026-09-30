/* CAMBIARLE LA POSICIÓN A UN TANNER LE BORRABA LA POSICIÓN.
 *
 * Reportado así: "no puedo cambiarle la posición a los jugadores que venían de
 * migración". Medido: pasaba con TODOS, no sólo con ésos.
 *
 * LA TRAMPA
 *
 * El carrusel de posiciones vivía dentro de un <label>:
 *
 *   <label>Posición
 *     <div id="positionRail">…siete botones…</div>
 *     <input id="position" type="hidden">
 *   </label>
 *
 * Un <label> etiqueta UN control. Al tocar cualquier cosa dentro de él, el
 * navegador reenvía la activación al control del label, y ese reenvío llega
 * como un SEGUNDO click —isTrusted:true, generado por el navegador— después de
 * que setPosicion ya reconstruyó el rail con innerHTML. El botón que tocaste
 * ya no existe, así que el reenvío aterriza en el primer chip del rail nuevo:
 * el vacío, "Por definir".
 *
 * Tocabas "Delantero", quedaba "Por definir", y al guardar se mandaba null.
 *
 * Por qué se notó en los de migración: 37 de los 62 Tanners activos tienen una
 * posición que no está en la lista estándar —20 "Por definir" y 17
 * "Mediocampista"— y a ésos se les pinta un chip rojo "capturado antes". Ver
 * que ese chip rojo no se quitaba era evidente. En los demás, quedarse en "Por
 * definir" parecía una opción legítima y nadie se daba cuenta de que se les
 * había borrado el dato.
 *
 * Esta prueba levanta la pantalla REAL y toca los chips como una persona. Si
 * alguien vuelve a meter el rail dentro de un label, o cualquier otro control
 * interactivo, truena aquí.
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
await new Promise(r => srv.listen(4710, r));

/* OJO con la forma de los datos: v2_players devuelve snake_case y filtra por
 * status_value, mientras que v2_player_profile devuelve camelCase. La primera
 * versión de este banco usó la forma equivocada y la lista salió vacía. */
const fila = pos => ({ id:'t1', code:'Tanner099', first_name:'Iker Joan', last_name:'Flores Procopio',
  category:'T12', status_value:'active', jersey_number:null, player_position:pos,
  data_consent:true, has_guardian_email:true, photo_path:null, docs_missing:0 });
const perfil = pos => ({ id:'t1', code:'Tanner099', firstName:'Iker Joan', lastName:'Flores Procopio',
  birthDate:'2015-07-31', position:pos, dominantFoot:'right', sex:'M', category:'T12', status:'active' });

const stub = pos => `export function createClient(){return{
 auth:{getSession:async()=>({data:{session:{user:{id:'u1'}}}}),getUser:async()=>({data:{user:{app_metadata:{}}}}),signOut:async()=>({}),onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}}},
 storage:{from:()=>({createSignedUrl:async()=>({data:null,error:null}),createSignedUrls:async(ps)=>({data:ps.map(p=>({path:p,signedUrl:null})),error:null})})},
 rpc:async(n,p)=>{
  if(n==='v2_my_context')return{data:[{organization_id:'o1',organization_name:'Tannery City FC',role:'Presidencia',is_owner:true}],error:null};
  if(n==='v2_my_modules')return{data:[{module_code:'players',enabled:true,can_read:true,can_write:true},
    {module_code:'jugadores_familia',enabled:true,can_read:true,can_write:true},
    {module_code:'jugadores_estado',enabled:true,can_read:true,can_write:true}],error:null};
  if(n==='v2_players')return{data:[${JSON.stringify(fila('__POS__')).replace('"__POS__"', JSON.stringify(pos))}],error:null};
  if(n==='v2_player_categories')return{data:[{id:'c1',name:'T12'}],error:null};
  if(n==='v2_player_profile')return{data:{player:${JSON.stringify(perfil('__POS__')).replace('"__POS__"', JSON.stringify(pos))},guardians:[],activeEnrollment:null},error:null};
  if(n==='v2_save_player_profile'){window.__guardado=p;return{data:{player:${JSON.stringify(perfil('__POS__')).replace('"__POS__"', JSON.stringify(pos))},guardians:[],activeEnrollment:null},error:null};}
  return {data:[],error:null};}};}`;

const nav = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
let fallos = 0, corridas = 0;
const revisa = (nombre, ok, detalle) => { corridas++; if (!ok) { fallos++; console.error(` - ${nombre}${detalle ? `\n   ${detalle}` : ''}`); } };

/* Abre la ficha, toca un chip y devuelve qué quedó seleccionado y qué se
   mandaría al guardar. Es el recorrido completo, no una función suelta. */
async function cambiaPosicion(posInicial, aTocar) {
  const pg = await nav.newPage({ viewport:{ width:390, height:844 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  await pg.route('**/v2/supabase-client.js', r => r.fulfill({ status:200, contentType:'text/javascript', body:stub(posInicial) }));
  await pg.route('**/v2/branding-auto.js', r => r.fulfill({ status:200, contentType:'text/javascript', body:'' }));
  await pg.goto('http://127.0.0.1:4710/v2/jugadores/', { waitUntil:'networkidle' });

  const tarjetas = await pg.$$('.jcard');
  if (!tarjetas.length) { await pg.close(); return { error:'la lista salió vacía' }; }
  await tarjetas[0].click();
  await pg.waitForTimeout(700);

  const inicial = await pg.evaluate(() => ({
    chips: [...document.querySelectorAll('#positionRail .pos-chip')].map(c => c.dataset.pos),
    marcado: document.querySelector('#positionRail .pos-chip.on')?.dataset.pos ?? null,
    legacy: !!document.querySelector('#positionRail .pos-chip.legacy'),
    // La trampa: un radiogroup no puede vivir dentro de un <label>.
    dentroDeLabel: !!document.getElementById('positionRail').closest('label')
  }));

  const toco = await pg.evaluate(p => {
    const c = [...document.querySelectorAll('#positionRail .pos-chip')].find(x => x.dataset.pos === p);
    if (!c) return false;
    c.scrollIntoView(); c.click(); return true;
  }, aTocar);
  await pg.waitForTimeout(350);

  const final = await pg.evaluate(() => ({
    marcado: document.querySelector('#positionRail .pos-chip.on')?.dataset.pos ?? null,
    oculto: document.getElementById('position').value
  }));

  await pg.evaluate(() => document.getElementById('saveProfile').click());
  await pg.waitForTimeout(600);
  const guardado = await pg.evaluate(() => window.__guardado?.player_position ?? null);

  await pg.close();
  return { inicial, toco, final, guardado, errs };
}

/* ===== EL CASO REPORTADO: un Tanner de migración ===== */
const migrado = await cambiaPosicion('Por definir', 'Delantero');
revisa('la ficha de un Tanner de migración abre', !migrado.error, migrado.error);
if (!migrado.error) {
  revisa('su posición vieja sale como chip aparte, marcada',
    migrado.inicial.legacy && migrado.inicial.marcado === 'Por definir',
    JSON.stringify(migrado.inicial));
  // Ésta es la trampa que causaba todo.
  revisa('el carrusel NO vive dentro de un <label>',
    migrado.inicial.dentroDeLabel === false,
    'un <label> reenvía el click al primer control y borra lo que acabas de elegir');
  revisa('al tocar "Delantero", queda "Delantero"',
    migrado.final.marcado === 'Delantero', `quedó: ${migrado.final.marcado}`);
  revisa('y el campo que se guarda dice "Delantero"',
    migrado.final.oculto === 'Delantero', `dice: "${migrado.final.oculto}"`);
  // Aquí se veía el daño: se mandaba null y el Tanner se quedaba sin posición.
  revisa('al guardar se manda "Delantero", no null',
    migrado.guardado === 'Delantero', `se mandó: ${JSON.stringify(migrado.guardado)}`);
  revisa('y el chip rojo de "capturado antes" desaparece', migrado.final.marcado !== 'Por definir');
  revisa('sin errores de consola', migrado.errs.length === 0, migrado.errs.join(' | '));
}

/* ===== Y EL QUE NADIE REPORTÓ: uno con posición normal ===== */
const normal = await cambiaPosicion('Delantero', 'Portero');
revisa('la ficha de un Tanner con posición estándar abre', !normal.error, normal.error);
if (!normal.error) {
  revisa('no se le inventa un chip de "capturado antes"',
    normal.inicial.legacy === false, JSON.stringify(normal.inicial));
  revisa('cambiar de "Delantero" a "Portero" queda en Portero',
    normal.final.marcado === 'Portero', `quedó: ${normal.final.marcado}`);
  // Esto también estaba roto y nadie lo había visto.
  revisa('y se guarda "Portero", no null',
    normal.guardado === 'Portero', `se mandó: ${JSON.stringify(normal.guardado)}`);
}

/* ===== DEJARLO SIN POSICIÓN SIGUE SIENDO POSIBLE ===== */
const aVacio = await cambiaPosicion('Delantero', '');
if (!aVacio.error) {
  revisa('se puede volver a dejar "Por definir" a propósito',
    aVacio.final.marcado === '' && aVacio.guardado === null,
    `marcado: "${aVacio.final.marcado}" · guardado: ${JSON.stringify(aVacio.guardado)}`);
}

await nav.close(); srv.close();
console.log(fallos
  ? `Posición humo FAILED · ${fallos} de ${corridas}`
  : `Posición humo OK · ${corridas} revisiones, incluida la que impide que cambiar de posición borre la posición`);
process.exit(fallos ? 1 : 0);
