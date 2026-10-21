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
 *
 * Mensajería pro (h20, 19/10/2026), "dale a todos":
 *   · responder citando y @mencionar en un chat de área (con sugerencias);
 *   · editar sólo lo propio dentro de 15 minutos, y eliminar para todos;
 *   · fijar un mensaje (barra arriba) y buscar dentro del chat;
 *   · mandar una foto: sube a organizations/<org>/chat/<hilo>/<uuid>.<ext>
 *     y se manda con esa ruta; un .exe se rechaza sin subir nada;
 *   · respuestas rápidas: sugeridas, guardar una y usarla con "/";
 *   · silenciar: el chat silenciado no cuenta en el globito, salvo menciones;
 *   · avisos: "Enterado", quién falta, fijar y programar.
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
await new Promise(r => srv.listen(4742, r));

// El reloj de la página se fija a mediodía de hoy: con Date.now() a secas, la
// prueba fallaba entre las 00:00 y las 00:30 (el primer mensaje, de hace 30
// minutos, caía en "Ayer" y el separador ya no decía "Hoy").
const MEDIODIA = new Date(); MEDIODIA.setUTCHours(12, 0, 0, 0);
const AHORA = MEDIODIA.getTime(), hace = m => new Date(AHORA - m * 60e3).toISOString();
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
    { id:'area-taq', kind:'area', areaRole:'Taquilla', title:'Taquilla', unread:0, last:null },
    // h20: silenciado con 4 sin leer, de los cuales 1 te menciona.
    { id:'dm-emma', kind:'direct', title:'Emmanuel', otherRole:'Academia', unread:4, mentions:1, muted:true,
      last:{ body:'Vamos con todo', senderName:'Emmanuel', mine:false, at:hace(240) } }
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
const AVISOS = { canPublish:true, avisos:[
  // h20: programado (sólo lo ve quien lo maneja) y uno que me toca confirmar.
  { id:'v4', title:'Foto de equipo', body:null, author:'Mich', audienceType:'club', publishedAt:hace(-600), scheduledFor:hace(-600),
    unread:false, canManage:true, reach:null },
  { id:'v5', title:'Junta el lunes 9:00', body:'Traigan su reporte.', author:'Zul Díaz', audienceType:'club', publishedAt:hace(150),
    unread:false, canAck:true, acked:false },
  { id:'v1', title:'El sábado no hay entrenamiento', body:'Por el torneo.', author:'Mich', canManage:true,
  audienceType:'club', publishedAt:hace(200), unread:false, reach:{ total:10, seen:3, acked:2 } },
  // d5: el aviso personal que llegó a tres juntos es UNA tarjeta.
  { id:'v2', title:'Nueva postulación de staff', body:'Oscar · Formador', author:'TannerOS', audienceType:'users', audienceValue:null,
    recipients:[{ userId:ME, name:'Presidencia' }, { userId:'u-brandon', name:'Brandon Andrade' }, { userId:'u-emma', name:'Emmanuel' }],
    publishedAt:hace(100), unread:true, reach:{ total:3, seen:1 } },
  // Fase 2 del portal (18/10/2026): avisos a familias, con su alcance en familias.
  { id:'v3', title:'Foto oficial el sábado', body:null, author:'Mich', audienceType:'categoria', audienceValue:'T10',
    publishedAt:hace(50), unread:false, reach:{ total:12, seen:5, familias:true } } ],
  categorias:['Baby Tanner','T10','T12'] };

const shell = (falla) => `
  window.__rpc = []; window.__fallaEnvio = ${falla ? 1 : 0}; window.__subidas = []; window.__pin = null; window.__mios = [];
  window.__alertas = []; window.tosAlert = async a => { window.__alertas.push(a); }; window.tosConfirm = async () => true;
  const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  export const supabase = { storage: { from: () => ({
    upload: async (path, blob, opts) => { window.__subidas.push({ path, type: opts?.contentType, size: blob?.size }); return { data:{ path }, error:null }; },
    createSignedUrls: async paths => ({ data: paths.map(path => ({ path, signedUrl: PIXEL })), error:null }) }) } };
  export const $ = id => document.getElementById(id);
  export async function rpc(name, params={}){
    window.__rpc.push({name, params});
    if(name==='v2_chat_inbox') return JSON.parse(JSON.stringify(${JSON.stringify(INBOX)}));
    if(name==='v2_chat_thread'){
      const h = JSON.parse(JSON.stringify((${JSON.stringify(HILOS)})[params.thread_id] || {thread:{id:params.thread_id,kind:'direct',title:'Brandon Ruiz',members:[]},messages:[]}));
      h.messages.push(...window.__mios.filter(m => m.threadId === params.thread_id));
      h.messages.forEach(m => { if ((window.__borrados || []).includes(m.id)) Object.assign(m, { deleted:true, body:'', attachment:null }); });
      if (window.__pin && window.__pin.thread === params.thread_id) h.thread.pinned = h.messages.find(m => m.id === window.__pin.id) || null;
      if (window.__mudo) h.thread.mutedUntil = window.__mudo;
      return h;
    }
    if(name==='v2_chat_edit') return { id:params.message_id, senderId:'${ME}', senderName:'Mich', body:params.body, at:new Date().toISOString(), mine:true, editedAt:new Date().toISOString() };
    if(name==='v2_chat_delete'){ (window.__borrados = window.__borrados || []).push(params.message_id); return null; }
    if(name==='v2_chat_pin'){ window.__pin = params.message_id ? { thread:params.thread_id, id:params.message_id } : null; return null; }
    if(name==='v2_chat_mute'){ window.__mudo = params.until; return null; }
    if(name==='v2_chat_search') return [{ id:'a2', senderId:'${ME}', senderName:'Mich', body:'Mañana llegan 20 balones', at:new Date(Date.now()-3600e3).toISOString(), mine:true }];
    if(name==='v2_chat_quick_replies') return window.__rapidas || [];
    if(name==='v2_chat_quick_reply_save'){ window.__rapidas = [{ id:'q1', shortcut:params.shortcut, body:params.body }]; return 'q1'; }
    if(name==='v2_aviso_detalle') return [{ name:'Brandon Ruiz', role:'Operaciones', seenAt:null, ackAt:null },
      { name:'Zul Díaz', role:'Operaciones', seenAt:new Date().toISOString(), ackAt:null },
      { name:'Emmanuel', role:'Academia', seenAt:new Date().toISOString(), ackAt:new Date().toISOString() }];
    if(name==='v2_chat_enviar'){
      if(window.__fallaEnvio>0){ window.__fallaEnvio--; throw new Error('Failed to fetch'); }
      const m = { id:'nuevo-'+params.client_key, senderId:'${ME}', senderName:'Mich', body:params.body.trim(), at:new Date().toISOString(), mine:true,
        attachment: params.attachment ? { ...params.attachment, kind:String(params.attachment.mime).startsWith('image/') ? 'image' : 'file' } : null,
        mentions: params.mentions || [], replyTo: params.reply_to ? { id:params.reply_to, senderName:'Brandon Ruiz', body:'¿Quién abre el sábado?' } : null };
      window.__mios.push({ ...m, threadId: params.thread_id, mine:true });
      return m;
    }
    if(name==='v2_chat_open_direct') return 'dm-brandon';
    if(name==='v2_avisos') return ${JSON.stringify(AVISOS)};
    return null;
  }
  export function setShellHealth(){}
  export function setAccionesDePantalla(l){ window.__accionesPantalla = l; }
  export async function bootstrapProtectedShell(){ return { ctx:{ organization_id:'o1', role:'Presidencia' }, navigation:[] }; }
`;

const nav = await chromium.launch({ executablePath:process.env.CHROME_PATH||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
let fallos = 0, corridas = 0;
const revisa = (nombre, ok, detalle) => { corridas++; if (!ok) { fallos++; console.error(` - ${nombre}${detalle ? `\n   ${detalle}` : ''}`); } };
async function abre({ viewport = { width:390, height:844 }, falla = false, ruta = '/v2/mensajes/' } = {}) {
  const pg = await nav.newPage({ viewport, hasTouch:true, isMobile:viewport.width < 600 });
  await pg.clock.setFixedTime(AHORA);
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
  const env = await llamadas(pg, 'v2_chat_enviar');
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
  const env = await llamadas(pg, 'v2_chat_enviar');
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
  // De dónde viene lo nuevo (19/10/2026): cada pestaña con su globito azul.
  await pg.waitForTimeout(300);
  const globos = await pg.evaluate(() => ({ chats: document.getElementById('msNChats')?.hidden ? '' : document.getElementById('msNChats')?.textContent,
    avisos: document.getElementById('msNAvisos')?.hidden ? '' : document.getElementById('msNAvisos')?.textContent,
    color: getComputedStyle(document.getElementById('msNChats')).backgroundColor }));
  // El chat silenciado (4 sin leer) sólo suma su mención: 2 + 1 = 3.
  revisa('[origen] Chats cuenta lo no leído sin lo silenciado, salvo menciones (3), y Avisos (1)', globos.chats === '3' && globos.avisos === '1', JSON.stringify(globos));
  revisa('[origen] el globito es azul', globos.color === 'rgb(10, 132, 255)', globos.color);
  await pg.click('[data-tab="avisos"]'); await pg.waitForTimeout(300);
  const nuevo = await pg.$$eval('.ms-aviso.unread', as => as.map(a => a.textContent));
  revisa('[origen] el aviso nuevo se ve resaltado mientras lo lees', nuevo.length === 1 && /postulación/.test(nuevo[0]), JSON.stringify(nuevo));
  revisa('[origen] no se marca visto al entrar (si no, el resaltado se apaga antes de leerlo)', (await llamadas(pg, 'v2_mark_announcements_seen')).length === 0);
  await pg.click('[data-tab="chats"]'); await pg.waitForTimeout(300);
  revisa('salir de Avisos los marca como vistos y apaga su globito', (await llamadas(pg, 'v2_mark_announcements_seen')).length === 1 && await pg.isHidden('#msNAvisos'));
  // La campana lleva a donde está lo nuevo: con chats sin leer, a Chats.
  await pg.click('[data-tab="avisos"]'); await pg.waitForTimeout(150);
  await pg.evaluate(() => window.dispatchEvent(new CustomEvent('tos:campana'))); await pg.waitForTimeout(250);
  revisa('[origen] la campana abre la pestaña donde está lo nuevo (Chats)', await pg.getAttribute('[data-tab="chats"]', 'aria-selected') === 'true');
  await pg.click('[data-tab="avisos"]'); await pg.waitForTimeout(300);
  revisa('el aviso dice cuántos lo han visto', /Visto por 3 de 10 · 2 enterados/.test(await pg.textContent('[data-aviso="v1"]')));
  const post = await pg.$$eval('.ms-aviso', as => as.filter(a => /postulación/.test(a.textContent)).map(a => a.querySelector('footer').innerText));
  revisa('el aviso para varios sale una vez y dice para quiénes', post.length === 1 && /Para ti, Brandon Andrade y Emmanuel/.test(post[0]) && /Visto por 1 de 3/.test(post[0]), JSON.stringify(post));
  await cap(pg, 'avisos');
  await pg.click('#msAvisoNuevo'); await pg.waitForTimeout(150);
  await pg.fill('#msAvTitulo', 'Junta de staff');
  await pg.selectOption('#msAvPara', 'role:Operaciones');
  await pg.click('#msAvisoForm button[type=submit]'); await pg.waitForTimeout(300);
  const pub = (await llamadas(pg, 'v2_publish_announcement'))[0] || {};
  revisa('publicar un aviso a un área', pub.title === 'Junta de staff' && pub.audience_type === 'role' && pub.audience_value === 'Operaciones', JSON.stringify(pub));
  // Desde l2 también a UNA persona.
  await pg.click('#msNuevo'); await pg.waitForTimeout(150);
  await pg.fill('#msAvTitulo', 'Cobra a Don Trapo');
  await pg.selectOption('#msAvPara', 'user:u-brandon');
  await pg.click('#msAvisoForm button[type=submit]'); await pg.waitForTimeout(300);
  const uno = (await llamadas(pg, 'v2_publish_announcement'))[1] || {};
  revisa('publicar un aviso a UNA persona', uno.audience_type === 'user' && uno.audience_value === 'u-brandon', JSON.stringify(uno));
  // Avisos a familias: todas o por categoría, y su alcance se cuenta en familias.
  const fam = await pg.$$eval('.ms-aviso', as => as.filter(a => /Foto oficial/.test(a.textContent)).map(a => a.querySelector('footer').innerText));
  revisa('el aviso a familias dice a quién y cuántas familias lo vieron', fam.length === 1 && /Familias de T10/.test(fam[0]) && /Visto por 5 de 12 familias/.test(fam[0]), JSON.stringify(fam));
  await pg.click('#msNuevo'); await pg.waitForTimeout(150);
  revisa('"Para" ofrece todas las familias y cada categoría', await pg.$$eval('#msAvPara option', o => o.map(x => x.value)).then(v => v.includes('familias') && v.includes('categoria:T10') && v.includes('categoria:Baby Tanner')));
  await pg.fill('#msAvTitulo', 'No hay entrenamiento el lunes');
  await pg.selectOption('#msAvPara', 'categoria:Baby Tanner');
  revisa('al elegir familias explica que llega a su portal y celular', /portal/.test(await pg.textContent('#msAvHint')));
  await pg.click('#msAvisoForm button[type=submit]'); await pg.waitForTimeout(300);
  const cat = (await llamadas(pg, 'v2_publish_announcement'))[2] || {};
  revisa('publicar a las familias de una categoría', cat.audience_type === 'categoria' && cat.audience_value === 'Baby Tanner', JSON.stringify(cat));
  await pg.click('#msNuevo'); await pg.waitForTimeout(150);
  await pg.fill('#msAvTitulo', 'Torneo de fin de año');
  await pg.selectOption('#msAvPara', 'familias');
  await pg.click('#msAvisoForm button[type=submit]'); await pg.waitForTimeout(300);
  const todas = (await llamadas(pg, 'v2_publish_announcement'))[3] || {};
  revisa('publicar a todas las familias', todas.audience_type === 'familias' && todas.audience_value === null, JSON.stringify(todas));
  await pg.close();
}

/* ===== MENSAJERÍA PRO (h20): citar, mencionar, editar, borrar, fijar, buscar ===== */
{
  const { pg, errs } = await abre();
  const lista = await pg.$eval('[data-thread="dm-emma"]', e => ({ mudo: !!e.querySelector('.ms-muted'), at: !!e.querySelector('.ms-at'),
    gris: getComputedStyle(e.querySelector('.ms-count')).backgroundColor }));
  // Con una mención pendiente el contador se queda azul; sin ella iría en gris.
  revisa('[pro] el chat silenciado lleva su campana tachada, la @ de la mención y el contador azul por la mención',
    lista.mudo && lista.at && lista.gris === 'rgb(10, 132, 255)', JSON.stringify(lista));

  await pg.click('[data-thread="area-ops"]'); await pg.waitForTimeout(300);
  // Responder citando: tocar la burbuja de Brandon.
  await pg.click('[data-msg="a1"]'); await pg.waitForTimeout(150);
  const ops = await pg.$$eval('.ms-acciones [data-op]', b => b.map(x => x.dataset.op));
  revisa('[pro] el mensaje de otro se puede responder, copiar y fijar, pero no editar ni borrar',
    ops.includes('responder') && ops.includes('fijar') && !ops.includes('editar') && !ops.includes('borrar'), JSON.stringify(ops));
  await pg.click('[data-op="responder"]'); await pg.waitForTimeout(100);
  revisa('[pro] arriba de la caja dice a quién respondes', /Respondiendo a Brandon Ruiz/.test(await pg.textContent('#msContexto')));
  // @mencionar con sugerencias.
  await pg.click('#msTexto'); await pg.keyboard.type('Yo abro, @bra');
  await pg.waitForTimeout(150);
  const sug = await pg.$$eval('#msSugiere [role=option]', b => b.map(x => x.innerText));
  revisa('[pro] al escribir @bra sugiere a Brandon', sug.length === 1 && /Brandon Ruiz/.test(sug[0]), JSON.stringify(sug));
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(100);
  revisa('[pro] Enter elige la sugerencia (no envía) y deja "@Brandon Ruiz "', await pg.inputValue('#msTexto') === 'Yo abro, @Brandon Ruiz ' &&
    (await llamadas(pg, 'v2_chat_enviar')).length === 0, await pg.inputValue('#msTexto'));
  await pg.keyboard.type('nos vemos'); await pg.click('#msEnviar'); await pg.waitForTimeout(300);
  const env = (await llamadas(pg, 'v2_chat_enviar'))[0] || {};
  revisa('[pro] se manda citando el mensaje y con la mención', env.reply_to === 'a1' && JSON.stringify(env.mentions) === JSON.stringify([BRANDON]), JSON.stringify(env));
  const burbuja = await pg.$$eval('.ms-row.mine .ms-bubble', b => { const x = b.at(-1); return { cita: x.querySelector('.ms-quote')?.innerText, men: x.querySelector('.ms-mention')?.textContent }; });
  revisa('[pro] la burbuja enseña la cita y la mención resaltada', /Brandon Ruiz/.test(burbuja.cita || '') && burbuja.men === '@Brandon Ruiz', JSON.stringify(burbuja));
  revisa('[pro] después de mandar, ya no dice "Respondiendo"', (await pg.textContent('#msContexto')).trim() === '');

  // Editar: el viejo (hace 60 min) ya no; el recién mandado sí.
  await pg.click('[data-msg="a2"]'); await pg.waitForTimeout(150);
  const viejo = await pg.$$eval('.ms-acciones [data-op]', b => b.map(x => x.dataset.op));
  revisa('[pro] un mensaje mío de hace una hora se borra pero ya no se edita', viejo.includes('borrar') && !viejo.includes('editar'), JSON.stringify(viejo));
  await pg.click('[data-cerrar]');
  const nuevoId = env.client_key ? 'nuevo-' + env.client_key : '';
  await pg.click(`[data-msg="${nuevoId}"] .ms-text`); await pg.waitForTimeout(150);
  await pg.click('[data-op="editar"]'); await pg.waitForTimeout(100);
  revisa('[pro] al editar, la caja trae el texto y avisa los 15 minutos', /Editando/.test(await pg.textContent('#msContexto')) && /nos vemos/.test(await pg.inputValue('#msTexto')));
  await pg.fill('#msTexto', 'Yo abro, @Brandon Ruiz a las 8'); await pg.click('#msEnviar'); await pg.waitForTimeout(300);
  const ed = (await llamadas(pg, 'v2_chat_edit'))[0] || {};
  revisa('[pro] editar manda el texto nuevo a ese mensaje, sin enviar otro', ed.message_id === nuevoId && /a las 8/.test(ed.body) && (await llamadas(pg, 'v2_chat_enviar')).length === 1, JSON.stringify(ed));
  revisa('[pro] y la burbuja dice "Editado"', /Editado/.test(await pg.textContent(`#msg-${nuevoId}`)));

  // Fijar.
  await pg.click('[data-msg="a1"]'); await pg.waitForTimeout(150);
  await pg.click('[data-op="fijar"]'); await pg.waitForTimeout(300);
  revisa('[pro] fijar manda el mensaje y aparece la barra arriba', (await llamadas(pg, 'v2_chat_pin'))[0]?.message_id === 'a1' && /Quién abre el sábado/.test(await pg.textContent('#msPin')));
  await pg.click('[data-desfijar]'); await pg.waitForTimeout(300);
  revisa('[pro] la X quita el fijado', (await llamadas(pg, 'v2_chat_pin'))[1]?.message_id === null && (await pg.textContent('#msPin')).trim() === '');

  // Eliminar para todos.
  await pg.click('[data-msg="a2"]'); await pg.waitForTimeout(150);
  await pg.click('[data-op="borrar"]'); await pg.waitForTimeout(300);
  revisa('[pro] eliminar pregunta, borra y deja "Se eliminó este mensaje"', (await llamadas(pg, 'v2_chat_delete'))[0]?.message_id === 'a2' && /Se eliminó este mensaje/.test(await pg.textContent('#msMsgs')));

  // Buscar dentro.
  await pg.click('#msLupa'); await pg.fill('#msBuscaHilo', 'balones'); await pg.waitForTimeout(500);
  revisa('[pro] buscar dentro del chat pregunta al servidor y enseña lo que encontró', (await llamadas(pg, 'v2_chat_search'))[0]?.q === 'balones' && /20 balones/.test(await pg.textContent('#msHallazgos')));

  // Silenciar.
  await pg.click('#msSilencio'); await pg.waitForTimeout(150);
  await pg.click('[data-silencio="8h"]'); await pg.waitForTimeout(200);
  const mute = (await llamadas(pg, 'v2_chat_mute'))[0] || {};
  const horas = (new Date(mute.until) - AHORA) / 3600e3;
  revisa('[pro] silenciar 8 horas manda la hora correcta y lo dice en el encabezado', Math.abs(horas - 8) < .01 && /silenciado/.test(await pg.textContent('#msInfo')), JSON.stringify(mute));
  await cap(pg, 'pro-chat');
  revisa('[pro] sin errores de consola', errs.length === 0, errs.join(' | '));
  await pg.close();
}

/* ===== FOTOS Y ARCHIVOS + RESPUESTAS RÁPIDAS ===== */
{
  const { pg, errs } = await abre();
  await pg.click('[data-thread="area-ops"]'); await pg.waitForTimeout(300);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mNk+M9QzwAEjDAGACCDAv8cI7IoAAAAAElFTkSuQmCC', 'base64');
  await pg.setInputFiles('#msArchivo', { name:'cancha.png', mimeType:'image/png', buffer:png }); await pg.waitForTimeout(800);
  const sub = await pg.evaluate(() => window.__subidas);
  const env = (await llamadas(pg, 'v2_chat_enviar')).at(-1) || {};
  revisa('[archivo] la foto sube a la carpeta del chat con nombre que no se adivina',
    sub.length === 1 && /^organizations\/o1\/chat\/area-ops\/[0-9a-f-]{36}\.(webp|jpg|png)$/.test(sub[0].path), JSON.stringify(sub));
  revisa('[archivo] y se manda con esa misma ruta, su nombre y sin texto', env.attachment?.path === sub[0]?.path && env.attachment?.name === 'cancha.png' && env.body === '', JSON.stringify(env));
  revisa('[archivo] la burbuja enseña la foto', await pg.$$eval('.ms-row.mine .ms-foto img', i => i.length >= 1));
  await pg.setInputFiles('#msArchivo', { name:'virus.exe', mimeType:'application/octet-stream', buffer:Buffer.from('MZ') }); await pg.waitForTimeout(300);
  const al = await pg.evaluate(() => window.__alertas.map(a => a.message));
  revisa('[archivo] un .exe se rechaza con explicación y no sube nada', (await pg.evaluate(() => window.__subidas.length)) === 1 && al.some(m => /tipo de archivo/.test(m)), JSON.stringify(al));

  // Respuestas rápidas.
  await pg.click('#msRapidas'); await pg.waitForTimeout(250);
  revisa('[rápidas] sin guardadas, ofrece sugeridas', /enterado/.test(await pg.textContent('#msListaRapidas')));
  await pg.click('[data-guarda="0"]'); await pg.waitForTimeout(100);
  revisa('[rápidas] "Guardar" llena el formulario con esa respuesta', await pg.inputValue('#msRapAtajo') === 'enterado');
  await pg.fill('#msRapAtajo', 'con espacio');
  await pg.click('#msRapidaForm button[type=submit]'); await pg.waitForTimeout(150);
  revisa('[rápidas] un atajo con espacios se rechaza antes de mandar', await pg.isVisible('#msRapError') && (await llamadas(pg, 'v2_chat_quick_reply_save')).length === 0);
  await pg.fill('#msRapAtajo', '/Enterado');
  await pg.click('#msRapidaForm button[type=submit]'); await pg.waitForTimeout(300);
  const qr = (await llamadas(pg, 'v2_chat_quick_reply_save'))[0] || {};
  revisa('[rápidas] se guarda en minúsculas y sin la diagonal', qr.shortcut === 'enterado' && qr.body === 'Enterado, gracias.', JSON.stringify(qr));
  await pg.click('[data-cerrar]');
  await pg.click('#msTexto'); await pg.keyboard.type('/ent'); await pg.waitForTimeout(250);
  revisa('[rápidas] "/ent" en la caja la sugiere', /Enterado, gracias/.test(await pg.textContent('#msSugiere')));
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(100);
  revisa('[rápidas] elegirla pone el texto completo', await pg.inputValue('#msTexto') === 'Enterado, gracias.');
  revisa('[archivo/rápidas] sin errores de consola', errs.length === 0, errs.join(' | '));
  await pg.close();
}

/* ===== AVISOS PRO: Enterado, quién falta, fijar y programar ===== */
{
  const { pg, errs } = await abre();
  await pg.click('[data-tab="avisos"]'); await pg.waitForTimeout(300);
  revisa('[avisos] el programado dice cuándo sale', /Sale/.test(await pg.textContent('[data-aviso="v4"]')));
  revisa('[avisos] al que me toca confirmar le sale "Enterado"', await pg.isVisible('[data-ack="v5"]'));
  await pg.click('[data-ack="v5"]'); await pg.waitForTimeout(250);
  revisa('[avisos] tocar "Enterado" lo confirma y queda marcado', (await llamadas(pg, 'v2_aviso_enterado'))[0]?.aviso_id === 'v5' &&
    !(await pg.isVisible('[data-ack="v5"]')) && /Enterado/.test(await pg.textContent('[data-aviso="v5"] .ms-acked')));
  await pg.click('[data-detalle="v1"]'); await pg.waitForTimeout(250);
  const grupos = await pg.$$eval('.ms-grupo h3', h => h.map(x => x.textContent.replace(/\s+/g, ' ')));
  revisa('[avisos] el autor ve quién falta, quién lo vio y quién dijo Enterado', grupos.length === 3 && /Faltan 1/.test(grupos[0]) && /Enterados 1/.test(grupos[2]), JSON.stringify(grupos));
  await pg.click('[data-cerrar]');
  await pg.click('[data-gestion="v1"]'); await pg.waitForTimeout(150);
  await pg.click('[data-op="fijar"]'); await pg.waitForTimeout(250);
  revisa('[avisos] fijar un aviso lo manda arriba', JSON.stringify((await llamadas(pg, 'v2_aviso_fijar'))[0]) === JSON.stringify({ organization_id:'o1', aviso_id:'v1', fijo:true }));
  await pg.click('[data-gestion="v4"]'); await pg.waitForTimeout(150);
  await pg.click('[data-op="cancelar"]'); await pg.waitForTimeout(250);
  revisa('[avisos] un programado se puede cancelar', (await llamadas(pg, 'v2_aviso_cancelar'))[0]?.aviso_id === 'v4');
  // Programar.
  await pg.click('#msAvisoNuevo'); await pg.waitForTimeout(150);
  await pg.fill('#msAvTitulo', 'Entrenamiento a las 7');
  revisa('[programar] la fecha no aparece si es "Ahora"', !(await pg.isVisible('#msAvFecha')));
  await pg.check('[name=msAvCuando][value=programar]'); await pg.waitForTimeout(100);
  revisa('[programar] al elegir "Programar" aparece la fecha y el botón cambia', await pg.isVisible('#msAvFecha') && /Programar aviso/.test(await pg.textContent('#msAvisoForm button[type=submit]')));
  const pronto = await pg.evaluate(() => { const d = new Date(Date.now() + 60e3), p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; });
  await pg.fill('#msAvFecha', pronto);
  await pg.click('#msAvisoForm button[type=submit]'); await pg.waitForTimeout(200);
  revisa('[programar] dentro de 1 minuto se rechaza', /5 minutos/.test(await pg.textContent('#msAvError')) && (await llamadas(pg, 'v2_publish_announcement')).length === 0);
  const manana = await pg.evaluate(() => { const d = new Date(Date.now() + 864e5); d.setHours(7, 0, 0, 0); const p = n => String(n).padStart(2, '0');
    return { local:`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T07:00`, iso:d.toISOString() }; });
  await pg.fill('#msAvFecha', manana.local);
  await pg.click('#msAvisoForm button[type=submit]'); await pg.waitForTimeout(300);
  const prog = (await llamadas(pg, 'v2_publish_announcement'))[0] || {};
  revisa('[programar] se publica con la hora elegida', prog.starts_at === manana.iso && prog.title === 'Entrenamiento a las 7', JSON.stringify(prog));
  await cap(pg, 'pro-avisos');
  revisa('[avisos pro] sin errores de consola', errs.length === 0, errs.join(' | '));
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
