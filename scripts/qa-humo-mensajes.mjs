/* VESTIDOR · MENSAJES INTERNOS.
 *
 * Pedido (05/10/2026): mensajes "estilo WhatsApp, con rediseño Apple, que nos
 * ayuden a operar". Chats 1 a 1 y por área; avisos con "visto por"; sin
 * familias en esta fase.
 *
 * Esta prueba levanta la pantalla REAL y revisa:
 *   · que la lista ponga primero lo que tiene conversación, con su contador
 *     de no leídos, y las áreas sin mensajes aparte;
 *   · que en el teléfono la conversación se abra a pantalla completa, con
 *     burbujas mías/de otros, separador de día y palomitas de leído;
 *   · que enviar mande el texto recortado, con llave, y si falla deje
 *     "Reintentar" con la MISMA llave (no se duplica);
 *   · que en un chat de área se vea quién escribió y "Visto por N";
 *   · que un mensaje con HTML se enseñe como texto, no se ejecute;
 *   · "Nuevo chat" → elegir a alguien → abre el 1 a 1;
 *   · Avisos: "Visto por N de M", marcar como vistos y publicar a un rol;
 *   · en iPad, lista y conversación lado a lado.
 */
import { chromium } from 'playwright-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const RAIZ = '/home/user/TannerOs';
const T = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
            '.svg':'image/svg+xml','.json':'application/json','.png':'image/png' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(RAIZ, p);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('no'); return; }
  r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
  r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(4742, r));

const AHORA = Date.now(), hace = m => new Date(AHORA - m * 60e3).toISOString();
const ME = 'u-mich', ZUL = 'u-zul', BRANDON = 'u-brandon';
const INBOX = {
  me:{ userId:ME, name:'Mich', role:'Presidencia', presidency:true },
  people:[ { userId:ZUL, name:'Zul Díaz', role:'Operaciones' }, { userId:BRANDON, name:'Brandon Ruiz', role:'Operaciones' } ],
  threads:[
    { id:'dm-zul', kind:'direct', title:'Zul Díaz', otherRole:'Operaciones', unread:2,
      last:{ body:'Ya llegaron los jerseys 🙌', senderName:'Zul Díaz', mine:false, at:hace(3) } },
    { id:'area-ops', kind:'area', areaRole:'Operaciones', title:'Operaciones', unread:0,
      last:{ body:'Mañana llegan 20 balones', senderName:'Mich', mine:true, at:hace(60) } },
    { id:'area-club', kind:'area', areaRole:'*', title:'Todo el club', unread:0, last:null },
    { id:'area-taq', kind:'area', areaRole:'Taquilla', title:'Taquilla', unread:0, last:null }
  ]
};
const HILOS = {
  'dm-zul': { thread:{ id:'dm-zul', kind:'direct', title:'Zul Díaz', members:[
      { userId:ME, name:'Mich', role:'Presidencia', lastReadAt:hace(0) },
      { userId:ZUL, name:'Zul Díaz', role:'Operaciones', lastReadAt:hace(20) } ] },
    messages:[
      { id:'m1', senderId:ME, senderName:'Mich', body:'¿Ya llegaron los jerseys?', at:hace(30), mine:true },
      { id:'m2', senderId:ZUL, senderName:'Zul Díaz', body:'Ya llegaron los jerseys 🙌', at:hace(3), mine:false },
      { id:'m3', senderId:ZUL, senderName:'Zul Díaz', body:'<img src=x onerror="window.__xss=1">', at:hace(2), mine:false } ] },
  'area-ops': { thread:{ id:'area-ops', kind:'area', areaRole:'Operaciones', title:'Operaciones', members:[
      { userId:ME, name:'Mich', role:'Presidencia', lastReadAt:hace(0) },
      { userId:ZUL, name:'Zul Díaz', role:'Operaciones', lastReadAt:hace(10) },
      { userId:BRANDON, name:'Brandon Ruiz', role:'Operaciones', lastReadAt:hace(120) } ] },
    messages:[
      { id:'a1', senderId:BRANDON, senderName:'Brandon Ruiz', body:'¿Quién abre el sábado?', at:hace(90), mine:false },
      { id:'a2', senderId:ME, senderName:'Mich', body:'Mañana llegan 20 balones', at:hace(60), mine:true } ] }
};
const AVISOS = { canPublish:true, avisos:[ { id:'v1', title:'El sábado no hay entrenamiento', body:'Por el torneo.', author:'Mich',
  audienceType:'club', publishedAt:hace(200), unread:false, reach:{ total:10, seen:3 } } ] };

const shell = (falla) => `
  window.__rpc = []; window.__fallaEnvio = ${falla ? 1 : 0};
  export const supabase = {};
  export const $ = id => document.getElementById(id);
  export async function rpc(name, params={}){
    window.__rpc.push({name, params});
    if(name==='v2_chat_inbox') return JSON.parse(JSON.stringify(${JSON.stringify(INBOX)}));
    if(name==='v2_chat_thread') return JSON.parse(JSON.stringify((${JSON.stringify(HILOS)})[params.thread_id] || {thread:{id:params.thread_id,kind:'direct',title:'Brandon Ruiz',members:[]},messages:[]}));
    if(name==='v2_chat_send'){
      if(window.__fallaEnvio>0){ window.__fallaEnvio--; throw new Error('Failed to fetch'); }
      return { id:'nuevo-'+params.client_key, senderId:'${ME}', senderName:'Mich', body:params.body.trim(), at:new Date().toISOString(), mine:true };
    }
    if(name==='v2_chat_open_direct') return 'dm-brandon';
    if(name==='v2_avisos') return ${JSON.stringify(AVISOS)};
    return null;
  }
  export function setShellHealth(){}
  export async function bootstrapProtectedShell(){ return { ctx:{ organization_id:'o1', role:'Presidencia' }, navigation:[] }; }
`;

const nav = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
let fallos = 0, corridas = 0;
const revisa = (nombre, ok, detalle) => { corridas++; if (!ok) { fallos++; console.error(` - ${nombre}${detalle ? `\n   ${detalle}` : ''}`); } };
async function abre({ viewport = { width:390, height:844 }, falla = false, ruta = '/v2/mensajes/' } = {}) {
  const pg = await nav.newPage({ viewport, hasTouch:true, isMobile:viewport.width < 600 });
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  await pg.route('**/v2/shell.js', r => r.fulfill({ status:200, contentType:'text/javascript', body:shell(falla) }));
  await pg.route('**/v2/branding-auto.js', r => r.fulfill({ status:200, contentType:'text/javascript', body:'' }));
  await pg.goto('http://127.0.0.1:4742' + ruta, { waitUntil:'networkidle' });
  await pg.waitForTimeout(300);
  return { pg, errs };
}
const llamadas = (pg, n) => pg.evaluate(n => window.__rpc.filter(c => c.name === n).map(c => c.params), n);
const cap = async (pg, nombre) => { if (process.env.QA_CAPTURA) await pg.screenshot({ path: process.env.QA_CAPTURA.replace('.png', `-${nombre}.png`) }); };

/* ===== TELÉFONO: lista, conversación y envío ===== */
{
  const { pg, errs } = await abre();
  const items = await pg.$$eval('.ms-item', e => e.map(x => ({ t:x.innerText, unread:x.classList.contains('unread') })));
  revisa('el chat con mensajes nuevos va primero y marcado', /Zul Díaz/.test(items[0]?.t) && items[0]?.unread && /\b2\b/.test(items[0]?.t), JSON.stringify(items[0]));
  revisa('el último mensaje propio dice "Tú:"', items.some(i => /Operaciones/.test(i.t) && /Tú: Mañana llegan/.test(i.t)), JSON.stringify(items));
  revisa('las áreas sin mensajes van aparte', await pg.isVisible('.ms-sec') && /Áreas del club/.test(await pg.textContent('.ms-sec')));
  const ancho = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  revisa('sin scroll horizontal en teléfono', ancho <= 0, `sobran ${ancho}px`);
  await cap(pg, 'lista');

  await pg.click('[data-thread="dm-zul"]'); await pg.waitForTimeout(300);
  const caja = await pg.$eval('#msChat', e => { const r = e.getBoundingClientRect(); return { top:r.top, h:r.height, pos:getComputedStyle(e).position }; });
  revisa('en el teléfono el chat se abre a pantalla completa', caja.pos === 'fixed' && caja.top === 0 && caja.h >= 840, JSON.stringify(caja));
  revisa('la lista se esconde', !(await pg.isVisible('.ms-list')));
  const filas = await pg.$$eval('.ms-row', e => e.map(x => x.className));
  revisa('burbujas mías a la derecha y de Zul a la izquierda', filas[0]?.includes('mine') && filas[1]?.includes('theirs'), JSON.stringify(filas));
  revisa('hay separador de día', /Hoy/.test(await pg.textContent('.ms-day')));
  revisa('mi mensaje que Zul ya leyó lleva palomitas azules', await pg.$eval('.ms-row.mine .ms-tick', e => e.classList.contains('read')));
  revisa('el HTML de un mensaje se enseña como texto', await pg.evaluate(() => !window.__xss && !document.querySelector('.ms-msgs img')));
  revisa('al abrir se marca como leído', (await llamadas(pg, 'v2_chat_mark_read')).some(p => p.thread_id === 'dm-zul'));
  revisa('el botón de enviar empieza apagado', await pg.isDisabled('#msEnviar'));
  await pg.fill('#msTexto', '  Perfecto, mañana los repartimos  ');
  revisa('al escribir se prende', !(await pg.isDisabled('#msEnviar')));
  await cap(pg, 'chat');
  await pg.click('#msEnviar'); await pg.waitForTimeout(300);
  const env = await llamadas(pg, 'v2_chat_send');
  revisa('envía al chat abierto, con llave', env.length === 1 && env[0].thread_id === 'dm-zul' && String(env[0].client_key || '').length >= 8, JSON.stringify(env));
  const ultimo = await pg.$$eval('.ms-row.mine .ms-text', e => e.at(-1)?.textContent);
  revisa('la burbuja nueva aparece con el texto recortado', ultimo === 'Perfecto, mañana los repartimos', ultimo);
  revisa('la caja de texto queda vacía', await pg.inputValue('#msTexto') === '');
  await pg.click('#msBack'); await pg.waitForTimeout(200);
  revisa('"Chats" regresa a la lista', await pg.isVisible('.ms-list'));
  revisa('sin errores de consola (teléfono)', errs.length === 0, errs.join(' | '));
  await pg.close();
}

/* ===== SI FALLA LA RED: reintentar con la misma llave ===== */
{
  const { pg } = await abre({ falla:true });
  await pg.click('[data-thread="dm-zul"]'); await pg.waitForTimeout(250);
  await pg.fill('#msTexto', 'Hola'); await pg.click('#msEnviar'); await pg.waitForTimeout(300);
  revisa('si no se envía, lo dice y ofrece reintentar', await pg.isVisible('.ms-retry') && /Reintentar/.test(await pg.textContent('.ms-retry')));
  await pg.click('.ms-retry'); await pg.waitForTimeout(300);
  const env = await llamadas(pg, 'v2_chat_send');
  revisa('el reintento usa la MISMA llave (no se duplica)', env.length === 2 && env[0].client_key === env[1].client_key, JSON.stringify(env));
  revisa('y ya no queda en rojo', !(await pg.isVisible('.ms-retry')));
  await pg.close();
}

/* ===== CHAT DE ÁREA ===== */
{
  const { pg } = await abre();
  await pg.click('[data-thread="area-ops"]'); await pg.waitForTimeout(300);
  revisa('en el área se ve quién escribió', /Brandon Ruiz/.test(await pg.textContent('.ms-from')));
  revisa('el encabezado dice cuántas personas lo ven', /3 personas/.test(await pg.textContent('#msInfo')));
  revisa('mi último mensaje dice "Visto por 1"', /Visto por 1/.test(await pg.textContent('#msSeen').catch(() => '')));
  await pg.close();
}

/* ===== NUEVO CHAT 1 A 1 ===== */
{
  const { pg } = await abre();
  await pg.click('#msNuevo'); await pg.waitForTimeout(150);
  await pg.fill('#msGente', 'brand');
  const gente = await pg.$$eval('.ms-person', e => e.map(x => x.innerText));
  revisa('el buscador de personas filtra', gente.length === 1 && /Brandon Ruiz/.test(gente[0]), JSON.stringify(gente));
  await pg.click('.ms-person'); await pg.waitForTimeout(300);
  revisa('elegir a alguien abre el chat 1 a 1', (await llamadas(pg, 'v2_chat_open_direct'))[0]?.user_id === BRANDON && await pg.isVisible('#msTexto'));
  revisa('un chat nuevo explica quién lo ve', /Sólo ustedes dos/.test(await pg.textContent('.ms-hint')));
  await pg.close();
}

/* ===== AVISOS ===== */
{
  const { pg } = await abre();
  await pg.click('[data-tab="avisos"]'); await pg.waitForTimeout(300);
  revisa('el aviso dice cuántos lo han visto', /Visto por 3 de 10/.test(await pg.textContent('.ms-aviso')));
  revisa('abrir Avisos los marca como vistos', (await llamadas(pg, 'v2_mark_announcements_seen')).length === 1);
  await cap(pg, 'avisos');
  await pg.click('#msAvisoNuevo'); await pg.waitForTimeout(150);
  await pg.fill('#msAvTitulo', 'Junta de staff');
  await pg.selectOption('#msAvPara', 'role:Operaciones');
  await pg.click('#msAvisoForm button[type=submit]'); await pg.waitForTimeout(300);
  const pub = (await llamadas(pg, 'v2_publish_announcement'))[0] || {};
  revisa('publicar un aviso a un área', pub.title === 'Junta de staff' && pub.audience_type === 'role' && pub.audience_value === 'Operaciones', JSON.stringify(pub));
  await pg.close();
}

/* ===== iPAD: lado a lado, y abrir desde la notificación ===== */
{
  const { pg, errs } = await abre({ viewport:{ width:1024, height:1366 }, ruta:'/v2/mensajes/?chat=area-ops' });
  await pg.waitForTimeout(300);
  revisa('en iPad se ven la lista y la conversación a la vez', await pg.isVisible('.ms-list') && await pg.isVisible('#msTexto'));
  revisa('el link de la notificación abre ese chat', /Operaciones/.test(await pg.textContent('.ms-chat-title')));
  revisa('y lo marca en la lista', await pg.$eval('[data-thread="area-ops"]', e => e.classList.contains('on')));
  await cap(pg, 'ipad');
  revisa('sin errores de consola (iPad)', errs.length === 0, errs.join(' | '));
  await pg.close();
}

await nav.close(); srv.close();
console.log(fallos
  ? `Mensajes humo FAILED · ${fallos} de ${corridas}`
  : `Mensajes humo OK · ${corridas} revisiones: chats 1 a 1 y por área, palomitas, reintento sin duplicar y avisos con "visto por"`);
process.exit(fallos ? 1 : 0);
