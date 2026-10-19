/* BUSCADOR V2 Y BOTÓN FLOTANTE POR PANTALLA (auditoría ISTQB, 19/10/2026).
 *
 * Levanta pantallas REALES (Inicio y Estacionamiento, con shell.js de verdad)
 * con un Supabase falso y revisa lo que la auditoría encontró roto:
 *   · el buscador perdona errores de dedo, encuentra por categoría y por
 *     teléfono con +52, y encuentra ACCIONES ("nuevo gafete");
 *   · con una letra pide dos; vacío enseña lo reciente y qué hacer aquí;
 *   · es un combobox para lectores de pantalla y anuncia cuántos hay;
 *   · un solo texto de ayuda en todas las pantallas;
 *   · lo que se abre queda en Recientes (de esa persona);
 *   · el botón flotante de Estacionamiento trae Nuevo gafete y Pendientes,
 *     y presionarlos hace lo mismo que el botón de la pantalla;
 *   · ?accion=nuevo-gafete abre la hoja, y una clave inventada no hace nada;
 *   · quien no tiene Estacionamiento no encuentra sus acciones.
 */
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const T = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
            '.svg':'image/svg+xml','.json':'application/json','.png':'image/png' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('no'); return; }
  r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
  r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(4761, r));

const nav = (mods) => mods.map(([c, w]) => ({ module_code:c, enabled:true, can_read:true, can_write:w }));
const ROLES = {
  Presidencia: { yo:'u-mich', nav: nav([['jugadores',true],['prospectos',true],['taquilla',true],['cobranza',true],['contabilidad',true],['tienda',true],['estacionamiento',true],['asistencia',true]]) },
  Formadores:  { yo:'u-profe', nav: nav([['asistencia',true],['jugadores',false]]) }
};
const INDICE = [
  { id:'p1', name:'Rodrigo Torres Anda', jersey:'10', pos:'DEL', category:'T10', phones:'+524773979631', guardians:'Mayra Anda Ruiz' },
  { id:'p2', name:'José María Muñoz Gil', jersey:'8', pos:'MED', category:'T12', phones:'4771748014', guardians:'Ana Gil' }
];

const revisiones = []; const errores = [];
const revisa = (nombre, ok, detalle = '') => revisiones.push({ nombre, ok, detalle });
const navegador = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

async function abre(rol, ruta = '/', ancho = 1280) {
  const cfg = ROLES[rol];
  const pg = await navegador.newPage({ viewport: { width: ancho, height: 900 } });
  pg.on('pageerror', e => errores.push(`[${rol} ${ruta}] pageerror: ${e.message}`));
  pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(`[${rol} ${ruta}] console: ${m.text()}`); });
  await pg.addInitScript(({ rol, cfg, INDICE }) => {
    window.__llamadas = [];
    const R = {
      v2_my_context: [{ user_id: cfg.yo, display_name: rol, organization_id:'o1', organization_name:'Tannery City FC', role: rol, is_owner: rol === 'Presidencia' }],
      v2_my_navigation: cfg.nav,
      v2_search_index: INDICE,
      v2_birthdays: { today: '2026-10-19', myBirthDate: '1990-01-01', people: [] },
      v2_chat_inbox: { threads: [], people: [{ id:'u-zul', name:'Zul', role:'Operaciones' }] },
      v2_avisos: { avisos: [], canPublish: true, categorias: ['T6', 'T10'] },
      v2_parking_passes: { season:2026, price:200, prices:{tanner:200,vip:200}, summary:{requested:1,approved:0,issued:0,por_cobrar:0}, passes:[
        { id:'g2', status:'requested', season:2026, plate:'JAL-555-B', holder:'Dario Montalvo', holder_kind:'familia', pass_type:'tanner', balance:0 }] }
    };
    window.__fakeSupabase = {
      auth: {
        getSession: async () => ({ data: { session: { user: { id: cfg.yo } } } }),
        getUser: async () => ({ data: { user: { id: cfg.yo, app_metadata: {} } } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } })
      },
      rpc: async (name, params) => { window.__llamadas.push({ name, params }); return { data: R[name] ?? null, error: null }; },
      from: () => ({ select(){ return this; }, eq(){ return this; }, order(){ return this; }, limit(){ return this; }, then(r){ return Promise.resolve({ data: [], error: null }).then(r); } }),
      channel: () => ({ on(){ return this; }, subscribe(){ return this; } }), removeChannel(){}
    };
  }, { rol, cfg, INDICE });
  await pg.route('**/v2/supabase-client.js', r => r.fulfill({ status:200, contentType:'text/javascript', body:'export function createClient(){ return window.__fakeSupabase; }' }));
  await pg.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await pg.goto('http://127.0.0.1:4761' + ruta, { waitUntil: 'domcontentloaded' });
  await pg.waitForSelector('#shellSearch', { timeout: 8000 });
  await pg.waitForTimeout(500);
  return pg;
}
const textos = (pg) => pg.$$eval('#shellSearchResults .tos-res', e => e.map(x => x.innerText.replace(/\s+/g, ' ').trim()));
async function busca(pg, q) { await pg.fill('#shellSearch', q); await pg.waitForTimeout(250); return textos(pg); }

/* ===== EL BUSCADOR (Presidencia, en Inicio) ===== */
{
  const pg = await abre('Presidencia', '/');
  revisa('un solo texto de ayuda', await pg.getAttribute('#shellSearch', 'placeholder') === 'Busca un Tanner, papá o acción');
  revisa('es un combobox con su lista', await pg.getAttribute('#shellSearch', 'role') === 'combobox' && await pg.getAttribute('#shellSearchResults', 'role') === 'listbox');
  await pg.focus('#shellSearch'); await pg.waitForTimeout(600);
  const vacio = (await pg.textContent('#shellSearchResults')) || '';
  revisa('vacío enseña qué hacer aquí', /Para hacer aquí/.test(vacio) && await pg.getAttribute('#shellSearch', 'aria-expanded') === 'true', vacio.slice(0, 160));
  revisa('con una letra pide dos', /al menos 2 letras/.test((await busca(pg, 'r')).join('') + await pg.textContent('#shellSearchResults')));
  revisa('error de dedo: "rodirgo" encuentra a Rodrigo', /Rodrigo Torres Anda/.test((await busca(pg, 'rodirgo'))[0] || ''), JSON.stringify(await textos(pg)));
  revisa('categoría: "T10" encuentra a los de T10', (await busca(pg, 'T10')).some(t => /Rodrigo/.test(t)) && !(await textos(pg)).some(t => /José María/.test(t)));
  revisa('teléfono con +52 encuentra al guardado sin lada', /José María Muñoz Gil/.test((await busca(pg, '+52 477 174 8014'))[0] || ''));
  const gafete = await busca(pg, 'nuevo gafete');
  revisa('acción: "nuevo gafete" sale primero', /Nuevo gafete/.test(gafete[0] || ''), JSON.stringify(gafete));
  const href = await pg.getAttribute('#shellSearchResults .tos-res', 'href');
  revisa('y lleva a Estacionamiento con su acción', href === '/estacionamiento/?accion=nuevo-gafete', href);
  revisa('sinónimo: "cobrar" encuentra la acción', (await busca(pg, 'cobrar')).some(t => /Cobrar/.test(t)));
  const estado = await pg.textContent('#shellSearchEstado');
  revisa('anuncia cuántos resultados hay', /\d+ resultados?/.test(estado), estado);
  await busca(pg, 'rodrigo'); await pg.keyboard.press('ArrowDown');
  const act = await pg.getAttribute('#shellSearch', 'aria-activedescendant');
  revisa('las flechas marcan la opción activa para el lector', !!act && await pg.getAttribute('#' + act, 'aria-selected') === 'true', act);
  await Promise.all([pg.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {}), pg.keyboard.press('Enter')]);
  await pg.waitForTimeout(300);
  const rec = await pg.evaluate(() => Object.keys(sessionStorage).filter(k => k.startsWith('tos:buscador:recientes:')).map(k => [k, sessionStorage.getItem(k)]));
  revisa('lo que abrió queda en Recientes, de esa persona', rec.length === 1 && /u-mich/.test(rec[0][0]) && /Rodrigo Torres Anda/.test(rec[0][1]), JSON.stringify(rec));
  await pg.close();
}

/* ===== PERMISOS: un profe no encuentra acciones de Estacionamiento ===== */
{
  const pg = await abre('Formadores', '/');
  const r = await busca(pg, 'gafete');
  revisa('sin permiso, "gafete" no ofrece Nuevo gafete', !r.some(t => /Nuevo gafete/.test(t)), JSON.stringify(r));
  await pg.close();
}

/* ===== BOTÓN FLOTANTE EN ESTACIONAMIENTO ===== */
{
  const pg = await abre('Presidencia', '/v2/estacionamiento/', 390);
  await pg.waitForSelector('#pkNuevo', { timeout: 6000 });
  await pg.waitForTimeout(1400);
  revisa('Estacionamiento ya tiene botón flotante', await pg.isVisible('#tosFab'));
  await pg.click('#tosFab'); await pg.waitForTimeout(200);
  const aqui = await pg.$$eval('#tosFabMenu .tos-fab-item.aqui strong', e => e.map(x => x.textContent));
  revisa('"En esta pantalla": Nuevo gafete y Gafetes pendientes', JSON.stringify(aqui) === '["Nuevo gafete","Gafetes pendientes"]', JSON.stringify(aqui));
  await pg.click('#tosFabMenu .tos-fab-item.aqui >> nth=0'); await pg.waitForTimeout(300);
  revisa('"Nuevo gafete" abre la misma hoja que el botón de la pantalla', await pg.isVisible('#pkSheet') && !(await pg.evaluate(() => document.body.classList.contains('tos-fab-open'))));
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
  await pg.click('#tosFab'); await pg.waitForTimeout(150);
  await pg.click('#tosFabMenu .tos-fab-item.aqui >> nth=1'); await pg.waitForTimeout(250);
  revisa('"Gafetes pendientes" cambia a esa pestaña', await pg.getAttribute('[data-tab="pendientes"]', 'aria-selected') === 'true');
  await pg.close();
}

/* ===== ?accion= SÓLO CORRE CLAVES PERMITIDAS ===== */
{
  const pg = await abre('Presidencia', '/v2/estacionamiento/?accion=nuevo-gafete', 390);
  await pg.waitForSelector('#pkSheet:not(.hidden)', { timeout: 6000 }).catch(() => {});
  revisa('?accion=nuevo-gafete abre la hoja al llegar', await pg.isVisible('#pkSheet'));
  revisa('y la clave sale de la barra de direcciones', !/accion=/.test(pg.url()), pg.url());
  await pg.close();
  const pg2 = await abre('Presidencia', '/v2/estacionamiento/?accion=pkNuevo', 390);
  await pg2.waitForTimeout(1500);
  revisa('una clave inventada (aunque sea un id real) no hace nada', !(await pg2.isVisible('#pkSheet')));
  await pg2.close();
}

/* ===== MENSAJES: EL AVISO ABRE CON EL DESTINATARIO ELEGIDO ===== */
{
  const pg = await abre('Presidencia', '/v2/mensajes/', 390);
  await pg.waitForTimeout(1500);
  await pg.click('#tosFab'); await pg.waitForTimeout(200);
  const aqui = await pg.$$eval('#tosFabMenu .tos-fab-item.aqui strong', e => e.map(x => x.textContent));
  revisa('Mensajes: aviso a familias, a una categoría y al staff', JSON.stringify(aqui) === '["Aviso a todas las familias","Aviso a una categoría","Mensaje al staff"]', JSON.stringify(aqui));
  await pg.click('#tosFabMenu .tos-fab-item.aqui >> nth=0'); await pg.waitForTimeout(250);
  revisa('"Aviso a todas las familias" abre el aviso ya para familias', await pg.inputValue('#msAvPara').catch(() => '') === 'familias');
  await pg.close();
  const pg2 = await abre('Presidencia', '/v2/mensajes/?accion=aviso-categoria', 390);
  await pg2.waitForSelector('#msAvPara', { timeout: 6000 }).catch(() => {});
  revisa('desde el buscador, "Aviso a una categoría" llega con la categoría elegida', /^categoria:/.test(await pg2.inputValue('#msAvPara').catch(() => '')));
  await pg2.close();
}

/* ===== CADA `clic` EXISTE EN SU PANTALLA =====
   Si alguien renombra un botón, la acción dejaría de aparecer sin avisar
   (el shell no ofrece botones que no ve). Esto lo detecta antes. */
{
  const shell = fs.readFileSync(path.join(RAIZ, 'v2/shell.js'), 'utf8');
  const bloque = shell.slice(shell.indexOf('const ACCIONES_POR_RUTA=['), shell.indexOf('ACCIONES_POR_RUTA.push('));
  const rutas = [...bloque.matchAll(/\['(\/[a-z-]+)',\[(.*?)\]\]/gs)];
  let revisados = 0;
  for (const [, ruta, cuerpo] of rutas) {
    const dir = path.join(RAIZ, 'v2', ruta.slice(1));
    const fuente = ['index.html', 'app.js'].map(f => path.join(dir, f)).filter(f => fs.existsSync(f)).map(f => fs.readFileSync(f, 'utf8')).join('\n');
    for (const [, sel] of cuerpo.matchAll(/clic:'([^']+)'/g)) {
      revisados++;
      const id = sel.match(/#([\w-]+)/)?.[1], attr = sel.match(/\[([\w-]+)="([^"]+)"\]/);
      const ok = (!id || new RegExp(`id=["']${id}["']`).test(fuente)) && (!attr || fuente.includes(`${attr[1]}="`));
      revisa(`${ruta}: el botón ${sel} existe`, ok);
    }
  }
  revisa('se revisaron todos los botones del catálogo', revisados >= 9, String(revisados));
}

await navegador.close(); srv.close();
let mal = 0;
for (const r of revisiones) if (!r.ok) { mal++; console.error(` - ${r.nombre}${r.detalle ? ' :: ' + r.detalle : ''}`); }
if (errores.length) { console.error('ERRORES DEL NAVEGADOR:'); errores.forEach(e => console.error('   ' + e)); }
if (mal || errores.length) { console.error(`Buscador y acciones humo FAILED · ${mal} de ${revisiones.length}, ${errores.length} errores`); process.exit(1); }
console.log(`Buscador y acciones humo OK · ${revisiones.length} revisiones: errores de dedo, T10, +52, acciones, recientes, lector de pantalla y botón flotante por pantalla`);
