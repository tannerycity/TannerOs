/* NÚMERO DE CAMISETA EN UN TOQUE.
 *
 * Pedido (08/10/2026): "siempre que tengo que elegir el número de un jugador
 * es un pedo": entrar a Jugadores, ver cuáles están libres, regresar al pedido
 * y teclearlo. Medido: 17 de 64 Tanners sin número; el kit salía sin nombre ni
 * número; Fichar era un campo de texto.
 *
 * Esta prueba levanta las pantallas REALES con un Supabase falso y revisa:
 *   Levantar pedido (kit) para un Tanner SIN número:
 *     · el kit propone su nombre y avisa que no tiene número;
 *     · "Elegir" abre la hoja con sugeridos y la cancha 1-99;
 *     · un ocupado no se elige y dice quién lo trae;
 *     · un sugerido llena el campo y se le guarda al Tanner (v2_assign_jersey).
 *   Levantar pedido para un Tanner CON número:
 *     · propone su número; elegir otro NO cambia el del club.
 *   Subir de categoría con número ocupado: hoja con aviso, cancelar no
 *   guarda a medias y número libre se lleva sin preguntar.
 *   Fichar:
 *     · al elegir categoría salen los libres a un toque y llenan el campo.
 *
 * Y lo del 09/10/2026 ("le picas, números disponibles, este, este, pum"):
 *   A. Levantar pedido: un Tanner sin número trae sus libres en chips; un toque
 *      llena el pedido y su expediente. Si otro lo tomó, se avisa y se recalcula.
 *   B. Fichar: el primer libre ya va puesto; cambiar de categoría lo cambia,
 *      pero lo que eligió alguien no se pisa.
 *   C. Jugadores: "N Tanners sin número · Asignar" abre a todos por categoría;
 *      asignar uno lo quita de los chips de los demás y baja el contador.
 */
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const T = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('no'); return; }
  r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(4798, r));

const revisiones = [], errores = [];
const revisa = (n, ok, d='') => revisiones.push({ nombre:n, ok, detalle:d });
const nav = await chromium.launch({ executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });

const TABLERO = { category:'T10', taken:[{ number:'1', name:'Oscar Ortega' },{ number:'2', name:'Dario Montalvo' },{ number:'14', name:'Erick García' }], suggested:['3','4','5','6','7','8'] };

async function abre(url, extra = {}) {
  const p = await nav.newPage({ viewport:{ width:390, height:844 } });
  p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
  await p.addInitScript(({ TABLERO, extra }) => {
    const mk = l => l.map(([c,w]) => ({ module_code:c, enabled:true, can_read:true, can_write:w }));
    const R = Object.assign({
      v2_my_context:[{ user_id:'u1', display_name:'Zul', organization_id:'o1', organization_name:'Tannery City FC', role:'Operaciones', is_owner:false }],
      v2_my_modules:mk([['commerce',true],['prospects',true],['players',true]]),
      v2_my_navigation:mk([['tienda',true],['prospectos',true],['jugadores',true]]),
      v2_catalog:{ bundles:[{ id:'k1', name:'Uniforme completo', active:true, archived:false, componentsResolved:true, priceKid:900,
                    components:[{ productId:'j1', name:'Jersey', qty:1 },{ productId:'s1', name:'Short', qty:1 }] }],
                   products:[{ id:'j1', name:'Jersey local', active:true, archived:false, price:500, category:'Jersey' }] },
      v2_players:[
        { id:'p1', first_name:'Mateo', last_name:'Sin Número', status:'active', category:'T10', jersey_number:null },
        { id:'p2', first_name:'Erick', last_name:'García', status:'active', category:'T10', jersey_number:'14' }
      ],
      v2_jersey_board:TABLERO,
      v2_assign_jersey:{ changed:true },
      v2_prospects:[{ id:'x1', first_name:'Lionel', last_name:'Nuevo', status:'trial_completed', created_at:new Date().toISOString(), registration_type:'player', category_interest:'T10' }],
      v2_player_categories:[{ id:'c10', name:'T10' },{ id:'c12', name:'T12' }],
      v2_scouting_reports:[], v2_stale_prospects:[], v2_prospect_messages:[]
    }, extra);
    window.__llamadas = [];
    window.__fakeSupabase = {
      auth:{ getSession:async()=>({data:{session:{user:{id:'u1'}}}}), getUser:async()=>({data:{user:{id:'u1'}}}), onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}) },
      rpc:async (n, params) => { window.__llamadas.push({ n, params });
        if (n === 'v2_jersey_board' && R.__tableros) return { data:R.__tableros[params?.category] ?? TABLERO, error:null };
        const fallo = R.__fallos?.[n]?.[params?.player_id];
        if (fallo) return { data:null, error:{ message:fallo } };
        return { data:R[n] ?? null, error:null }; },
      storage:{ from:()=>({ createSignedUrl:async()=>({data:null}), createSignedUrls:async()=>({data:[]}) }) },
      channel:()=>({ on(){return this;}, subscribe(){return this;} }), removeChannel(){}
    };
  }, { TABLERO, extra });
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.route('**/v2/supabase-client.js', r => r.fulfill({ status:200, contentType:'text/javascript', body:'export function createClient(){ return window.__fakeSupabase; }' }));
  await p.route('**/v2/photo-cache.js', r => r.fulfill({ status:200, contentType:'text/javascript',
    body:'export async function getSignedPhotoUrls(){return {};}export async function getSignedPhotoUrl(){return null;}export async function getRawSignedPhotoUrl(){return null;}export async function clearPhotoCache(){}export function forgetPhoto(){}' }));
  await p.goto(`http://127.0.0.1:4798${url}`, { waitUntil:'domcontentloaded' });
  return p;
}
const llamadas = (p, n) => p.evaluate(n => window.__llamadas.filter(x => x.n === n).map(x => x.params), n);

/* ---------- Levantar pedido: Tanner sin número ---------- */
{
  const p = await abre('/v2/captura/?tanner=p1');
  await p.waitForSelector('#bundleGrid .pick-card', { timeout:8000 });
  await p.click('#bundleGrid .pick-card');
  revisa('[kit] propone el nombre del Tanner', (await p.inputValue('#bfName')) === 'Mateo Sin Número', await p.inputValue('#bfName'));
  revisa('[kit] avisa que aún no tiene número', /Aún no tiene número/.test(await p.innerText('#bfNumberHint')));
  await p.click('#bfPickNumber');
  await p.waitForSelector('.dorsal-sug', { timeout:4000 });
  const sug = await p.$$eval('.dorsal-sug', b => b.map(x => x.textContent));
  revisa('[hoja] sugiere los libres más bajos', JSON.stringify(sug) === '["3","4","5","6","7","8"]', JSON.stringify(sug));
  revisa('[hoja] la cancha va del 1 al 99 con 3 ocupados', (await p.$$('.dorsal-num')).length === 99 && (await p.$$('.dorsal-num.ocupado')).length === 3);
  await p.click('.dorsal-num[data-n="14"]', { force:true });
  revisa('[hoja] un ocupado no se elige y dice quién lo trae', /El #14 ya es de Erick García/.test(await p.innerText('.dorsal-quien')) && await p.isVisible('.dorsal-hoja'));
  // Valores límite (hallazgo de QA 08/10/2026): "014" es el 14 y el 0 no es número.
  await p.fill('.dorsal-otro input', '014'); await p.click('.dorsal-otro button');
  revisa('[límites] "014" es el 14 y dice quién lo trae', /El #14 ya es de Erick García/.test(await p.innerText('.dorsal-aviso')), await p.innerText('.dorsal-aviso'));
  await p.fill('.dorsal-otro input', '0'); await p.click('.dorsal-otro button');
  revisa('[límites] el 0 no es número', /del 1 al 999/.test(await p.innerText('.dorsal-aviso')) && await p.isVisible('.dorsal-hoja'));
  await p.click('.dorsal-sug[data-n="3"]');
  await p.waitForTimeout(200);
  revisa('[kit] el número elegido llena el campo', (await p.inputValue('#bfNumber')) === '3');
  const asig = await llamadas(p, 'v2_assign_jersey');
  revisa('[kit] se le guarda al Tanner en su expediente', asig.length === 1 && asig[0].player_id === 'p1' && asig[0].number === '3', JSON.stringify(asig));
  revisa('[kit] confirma "Listo: el #3 ya es de Mateo"', /Listo: el #3 ya es de Mateo en T10/.test(await p.innerText('#bfNumberHint')), await p.innerText('#bfNumberHint'));
  revisa('[hoja] pide el tablero de SU categoría', (await llamadas(p, 'v2_jersey_board'))[0]?.category === 'T10');
  await p.close();
}

/* ---------- Levantar pedido: Tanner con número ---------- */
{
  const p = await abre('/v2/captura/?tanner=p2');
  await p.waitForSelector('#productGrid .pick-card', { timeout:8000 });
  await p.click('#productGrid .pick-card');
  revisa('[prenda] propone su número del club', (await p.inputValue('#pfNumber')) === '14' && /Su número en el club: #14/.test(await p.innerText('#pfNumberHint')));
  await p.click('#pfPickNumber');
  await p.waitForSelector('.dorsal-sug', { timeout:4000 });
  revisa('[hoja] su propio número sale marcado, no tachado', await p.$eval('.dorsal-num[data-n="14"]', b => b.classList.contains('actual') && !b.classList.contains('ocupado')));
  await p.click('.dorsal-sug[data-n="5"]');
  await p.waitForTimeout(200);
  revisa('[prenda] otro número sólo va en este pedido', (await p.inputValue('#pfNumber')) === '5' && /Sólo en este pedido/.test(await p.innerText('#pfNumberHint')));
  revisa('[prenda] y NO cambia el número del club', (await llamadas(p, 'v2_assign_jersey')).length === 0);
  await p.close();
}

/* ---------- Fichar ---------- */
{
  const p = await abre('/v2/prospectos/');
  await p.waitForSelector('#prospectList .prospect-row', { timeout:8000 });
  await p.click('#prospectList .prospect-row >> text=Ver ficha');
  await p.waitForSelector('#conversionSection:not(.hidden)', { timeout:4000 });
  await p.waitForFunction(() => document.querySelectorAll('#convertJerseySug button').length > 0, null, { timeout:4000 }).catch(()=>{});
  const chips = await p.$$eval('#convertJerseySug button', b => b.map(x => x.textContent));
  revisa('[fichar] con la categoría de su registro ya salen los libres', JSON.stringify(chips) === '["#3","#4","#5","#6","#7"]', JSON.stringify(chips));
  await p.click('#convertJerseySug button:nth-of-type(2)');
  revisa('[fichar] un toque llena el número', (await p.inputValue('#convertJersey')) === '4');
  await p.click('#convertPickJersey');
  await p.waitForSelector('.dorsal-sug', { timeout:4000 });
  await p.click('.dorsal-num[data-n="9"]');
  revisa('[fichar] "Elegir" abre la cancha y llena el número', (await p.inputValue('#convertJersey')) === '9');
  revisa('[fichar] no guarda nada antes de fichar', (await llamadas(p, 'v2_assign_jersey')).length === 0);
  await p.close();
}


/* ---------- A. Levantar pedido: chips de libres en un toque ---------- */
{
  const p = await abre('/v2/captura/?tanner=p1');
  await p.waitForSelector('#bundleGrid .pick-card', { timeout:8000 });
  await p.click('#bundleGrid .pick-card');
  await p.waitForSelector('#bfNumberChips [data-num]', { timeout:4000 }).catch(()=>{});
  const chips = await p.$$eval('#bfNumberChips [data-num]', b => b.map(x => x.textContent));
  revisa('[A] sin número, sus libres salen ahí mismo', JSON.stringify(chips) === '["#3","#4","#5","#6","#7"]', JSON.stringify(chips));
  revisa('[A] y "Otro" para la cancha completa', (await p.$('#bfNumberChips [data-otro]')) !== null);
  await p.click('#bfNumberChips [data-num="5"]');
  await p.waitForTimeout(250);
  const asig = await llamadas(p, 'v2_assign_jersey');
  revisa('[A] un toque: llena el pedido', (await p.inputValue('#bfNumber')) === '5');
  revisa('[A] y se queda en su expediente', asig.length === 1 && asig[0].player_id === 'p1' && asig[0].number === '5', JSON.stringify(asig));
  revisa('[A] con número ya no hay chips', await p.$eval('#bfNumberChips', b => b.hidden));
  await p.close();
}
{
  const p = await abre('/v2/captura/?tanner=p1', { __fallos:{ v2_assign_jersey:{ p1:'El #3 ya es de Leo Paz en T10' } } });
  await p.waitForSelector('#bundleGrid .pick-card', { timeout:8000 });
  await p.click('#bundleGrid .pick-card');
  await p.waitForSelector('#bfNumberChips [data-num]', { timeout:4000 });
  const tablerosAntes = (await llamadas(p, 'v2_jersey_board')).length;
  await p.click('#bfNumberChips [data-num="3"]');
  await p.waitForTimeout(300);
  revisa('[A] si otro lo tomó en ese momento, dice quién', /El #3 ya es de Leo Paz/.test(await p.innerText('#bfNumberHint')), await p.innerText('#bfNumberHint'));
  revisa('[A] no deja el número a medias en el pedido', (await p.inputValue('#bfNumber')) === '');
  revisa('[A] y vuelve a leer los libres', (await llamadas(p, 'v2_jersey_board')).length > tablerosAntes && !(await p.$eval('#bfNumberChips', b => b.hidden)));
  await p.close();
}
{
  const p = await abre('/v2/captura/?tanner=p2');
  await p.waitForSelector('#productGrid .pick-card', { timeout:8000 });
  await p.click('#productGrid .pick-card');
  await p.waitForTimeout(250);
  revisa('[A] un Tanner con número no trae chips', await p.$eval('#pfNumberChips', b => b.hidden));
  await p.close();
}

/* ---------- B. Fichar: el primer libre ya va puesto ---------- */
{
  const p = await abre('/v2/prospectos/', { __tableros:{ T10:TABLERO, T12:{ category:'T12', taken:[{ number:'1', name:'X' },{ number:'2', name:'Y' },{ number:'3', name:'Z' }] } } });
  await p.waitForSelector('#prospectList .prospect-row', { timeout:8000 });
  await p.click('#prospectList .prospect-row >> text=Ver ficha');
  await p.waitForSelector('#conversionSection:not(.hidden)', { timeout:4000 });
  await p.waitForFunction(() => document.querySelectorAll('#convertJerseySug [data-num]').length > 0, null, { timeout:4000 }).catch(()=>{});
  revisa('[B] el primer libre ya va en el campo', (await p.inputValue('#convertJersey')) === '3', await p.inputValue('#convertJersey'));
  revisa('[B] marcado y dicho', await p.$eval('#convertJerseySug [data-num="3"]', b => b.classList.contains('activo')) && /va el #3/.test(await p.innerText('#convertJerseySug')));
  await p.selectOption('#convertCategory', 'c12');
  await p.waitForFunction(() => document.querySelector('#convertJersey').value === '4', null, { timeout:4000 }).catch(()=>{});
  revisa('[B] cambiar de categoría cambia el sugerido', (await p.inputValue('#convertJersey')) === '4', await p.inputValue('#convertJersey'));
  await p.click('#convertJerseySug [data-num="6"]');
  await p.selectOption('#convertCategory', 'c10');
  await p.waitForTimeout(400);
  revisa('[B] pero lo que alguien eligió no se pisa', (await p.inputValue('#convertJersey')) === '6', await p.inputValue('#convertJersey'));
  await p.close();
}

/* ---------- C. Jugadores: todos los sin número de un jalón ---------- */
const PLANTEL = {
  v2_players:[
    { id:'p1', first_name:'Mateo', last_name:'Ruiz', status_value:'active', category:'T10', jersey_number:null },
    { id:'p4', first_name:'Ángel', last_name:'Soto', status_value:'active', category:'T10', jersey_number:'' },
    { id:'p5', first_name:'Sofía', last_name:'Luna', status_value:'active', category:'Baby Tanner', jersey_number:null },
    { id:'p2', first_name:'Erick', last_name:'García', status_value:'active', category:'T10', jersey_number:'14' },
    { id:'p9', first_name:'Baja', last_name:'Ejemplo', status_value:'withdrawn', category:'T10', jersey_number:null }
  ],
  __tableros:{ T10:TABLERO, 'Baby Tanner':{ category:'Baby Tanner', taken:[{ number:'1', name:'Iker' }] } },
  v2_withdrawal_requests:[], v2_can_set_joined_at:false,
  v2_my_context:[{ user_id:'u1', display_name:'Mich', organization_id:'o1', organization_name:'Tannery City FC', role:'Presidencia', is_owner:true }]
};
{
  const p = await abre('/v2/jugadores/', PLANTEL);
  await p.waitForSelector('#sinNumero .sinnum-banner', { timeout:8000 }).catch(()=>{});
  revisa('[C] aviso con los activos sin número (no las bajas)', /3 Tanners sin número/.test(await p.innerText('#sinNumero').catch(()=> '')), await p.innerText('#sinNumero').catch(()=> ''));
  await p.click('#abrirSinNumero');
  await p.waitForSelector('.sinnum-fila [data-num]', { timeout:4000 });
  const cats = await p.$$eval('.sinnum-cat', e => e.map(x => x.textContent));
  revisa('[C] agrupados por categoría', JSON.stringify(cats) === '["Baby Tanner · 1","T10 · 2"]', JSON.stringify(cats));
  const chipsDe = id => p.$$eval(`.sinnum-fila[data-id="${id}"] [data-num]`, b => b.map(x => x.dataset.num));
  revisa('[C] cada uno con los libres de SU categoría', JSON.stringify(await chipsDe('p1')) === '["3","4","5","6"]' && JSON.stringify(await chipsDe('p5')) === '["2","3","4","5"]');
  await p.click('.sinnum-fila[data-id="p1"] [data-num="3"]');
  await p.waitForSelector('.sinnum-fila[data-id="p1"].listo', { timeout:4000 }).catch(()=>{});
  const asig = await llamadas(p, 'v2_assign_jersey');
  revisa('[C] un toque lo asigna', asig.length === 1 && asig[0].player_id === 'p1' && asig[0].number === '3', JSON.stringify(asig));
  revisa('[C] la fila dice "Listo: #3"', /Listo: #3/.test(await p.innerText('.sinnum-fila[data-id="p1"]')));
  revisa('[C] el #3 sale de los chips del otro de T10', JSON.stringify(await chipsDe('p4')) === '["4","5","6","7"]', JSON.stringify(await chipsDe('p4')));
  revisa('[C] pero no de otra categoría', JSON.stringify(await chipsDe('p5')) === '["2","3","4","5"]');
  revisa('[C] el contador baja', /2 Tanners sin número/.test(await p.innerText('#sinNumero')), await p.innerText('#sinNumero'));
  const antes = (await llamadas(p, 'v2_players')).length;
  await p.click('.dorsal-hoja .dorsal-cerrar');
  await p.waitForTimeout(300);
  revisa('[C] al cerrar, la lista se recarga', (await llamadas(p, 'v2_players')).length > antes);
  await p.close();
}
{
  const p = await abre('/v2/jugadores/', Object.assign({}, PLANTEL, { __fallos:{ v2_assign_jersey:{ p5:'El #2 ya es de Iker en Baby Tanner' } } }));
  await p.waitForSelector('#abrirSinNumero', { timeout:8000 });
  await p.click('#abrirSinNumero');
  await p.waitForSelector('.sinnum-fila[data-id="p5"] [data-num]', { timeout:4000 });
  await p.click('.sinnum-fila[data-id="p5"] [data-num="2"]');
  await p.waitForTimeout(300);
  revisa('[C] si otro lo tomó, se dice en la fila', /El #2 ya es de Iker/.test(await p.innerText('.sinnum-fila[data-id="p5"]')));
  revisa('[C] y sigue pendiente con chips', !(await p.$eval('.sinnum-fila[data-id="p5"]', f => f.classList.contains('listo'))) && (await chipsDe2(p, 'p5')).length === 4);
  await p.close();
}
async function chipsDe2(p, id) { return p.$$eval(`.sinnum-fila[data-id="${id}"] [data-num]`, b => b.map(x => x.dataset.num)); }
{
  const mk = l => l.map(([c,w]) => ({ module_code:c, enabled:true, can_read:true, can_write:w }));
  const p = await abre('/v2/jugadores/', Object.assign({}, PLANTEL, { v2_my_modules:mk([['players',false]]) }));
  await p.waitForSelector('#playerList .jcard', { timeout:8000 }).catch(()=>{});
  revisa('[C] quien sólo lee Jugadores no ve el aviso', await p.$eval('#sinNumero', b => b.hidden));
  await p.close();
}

/* ---------- Subir de categoría con número ocupado (opción A) ---------- */
// Caso real (08/10/2026): Hugo Beltrán, Baby Tanner #14, sube a T10 donde el #14
// es de Oscar. Antes el guardado tronaba con "duplicate key".
const HUGO = {
  v2_players:[{ id:'h1', first_name:'Hugo', last_name:'Beltrán', status:'active', category:'Baby Tanner', jersey_number:'14', code:'Tanner050' }],
  v2_player_categories:[{ id:'cb', name:'Baby Tanner' },{ id:'c10', name:'T10' }],
  v2_player_profile:{ player:{ id:'h1', firstName:'Hugo', lastName:'Beltrán', status:'active', category:'Baby Tanner', jerseyNumber:'14', code:'Tanner050', dataConsent:true, imageConsent:true },
    guardians:[{ name:'Ana Serrano', phone:'4771112233', isPrimary:true }], activeEnrollment:{ categoryId:'cb' } },
  v2_jersey_board:{ category:'T10', taken:[{ number:'14', name:'Oscar Ortega', playerId:'o1' },{ number:'1', name:'Iker Morales', playerId:'o2' }], suggested:['2','3','4','5','6','7'] },
  v2_save_player_profile:{ player:{ id:'h1', firstName:'Hugo', lastName:'Beltrán', status:'active', category:'T10', jerseyNumber:'3' }, guardians:[] },
  v2_categories:[], v2_withdrawal_requests:[], v2_benefit_requests:[], v2_player_benefits:[], v2_player_documents:[],
  v2_player_sports:{ summary:{ played:0 }, evaluations:[] }, v2_attendance_player:{ current:{ scheduled:0, attended:0 } },
  v2_player_story:{ siblings:[], timeline:[] }, v2_can_set_joined_at:false,
  v2_my_context:[{ user_id:'u1', display_name:'Mich', organization_id:'o1', organization_name:'Tannery City FC', role:'Presidencia', is_owner:true }]
};
async function subeHugo(extra = {}) {
  const p = await abre('/v2/jugadores/?player=h1', Object.assign({}, HUGO, extra));
  await p.waitForSelector('#fichaTabs button', { timeout:8000 });
  await p.click('[data-ficha-tab="expediente"]');
  await p.selectOption('#categoryId', 'c10');
  await p.click('#saveProfile');
  return p;
}
{
  const p = await subeHugo();
  await p.waitForSelector('.dorsal-hoja', { timeout:4000 });
  const motivo = await p.innerText('.dorsal-motivo');
  revisa('[subir] avisa quién trae su número en la nueva categoría', /El #14 ya es de Oscar Ortega en T10/.test(motivo), motivo);
  revisa('[subir] no guarda nada antes de elegir', (await llamadas(p, 'v2_save_player_profile')).length === 0);
  revisa('[subir] su #14 sale tachado, no como suyo', await p.$eval('.dorsal-num[data-n="14"]', b => b.classList.contains('ocupado')));
  await p.click('.dorsal-sug[data-n="3"]');
  await p.waitForFunction(() => window.__llamadas.some(x => x.n === 'v2_save_player_profile'), null, { timeout:4000 }).catch(()=>{});
  const g = await llamadas(p, 'v2_save_player_profile');
  revisa('[subir] guarda la categoría nueva con el número elegido', g.length === 1 && g[0].category_id === 'c10' && g[0].jersey_number === '3', JSON.stringify(g.map(x => [x.category_id, x.jersey_number])));
  await p.close();
}
{
  const p = await subeHugo();
  await p.waitForSelector('.dorsal-hoja', { timeout:4000 });
  await p.click('.dorsal-cerrar');
  await p.waitForTimeout(300);
  revisa('[subir] cerrar la hoja cancela: no se guarda a medias', (await llamadas(p, 'v2_save_player_profile')).length === 0);
  revisa('[subir] y dice por qué no se guardó', /No se guardó: elige el nuevo número de Hugo en T10/.test(await p.innerText('#profileMessage').catch(()=> '')), await p.innerText('#profileMessage').catch(()=> ''));
  await p.close();
}
{
  const p = await subeHugo({ v2_jersey_board:{ category:'T10', taken:[{ number:'1', name:'Iker Morales', playerId:'o2' }], suggested:['2','3'] } });
  await p.waitForFunction(() => window.__llamadas.some(x => x.n === 'v2_save_player_profile'), null, { timeout:4000 }).catch(()=>{});
  const g = await llamadas(p, 'v2_save_player_profile');
  revisa('[subir] si su número está libre allá, se lo lleva sin preguntar', !(await p.$('.dorsal-hoja')) && g.length === 1 && g[0].jersey_number === '14', JSON.stringify(g.map(x => x.jersey_number)));
  await p.close();
}

await nav.close(); srv.close();
let mal = 0;
for (const r of revisiones) if (!r.ok) { mal++; console.error(` - ${r.nombre}${r.detalle ? ' :: ' + r.detalle : ''}`); }
if (errores.length) { console.error('ERRORES DEL NAVEGADOR:'); errores.forEach(e => console.error('   ' + e)); }
if (mal || errores.length) { console.error(`Números humo FAILED · ${mal} de ${revisiones.length}, ${errores.length} errores`); process.exit(1); }
console.log(`Números humo OK · ${revisiones.length} revisiones: chips de libres en el pedido, fichar con el número ya puesto, y los sin número de un jalón`);
