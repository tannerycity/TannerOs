// Tanner LIVE en Chromium (23/11/2026): las dos pantallas, de verdad.
//
// Sólo se sustituye el cliente de Supabase (igual que qa-humo-navegador). Lo
// demás —shell, app.js, reproductor, CSS— es el código real. Comprueba lo que
// "no revienta" no prueba:
//   1. El reproductor no arranca solo, va sin audio y sin descarga.
//   2. Sin gateway, el administrador puede ver una SEÑAL DE PRUEBA rotulada, y
//      el sello nunca dice "En vivo".
//   3. La familia sin gateway ve "Cámara aún no conectada": jamás la prueba.
//   4. La familia que no ha aceptado las reglas ve las reglas, no el video.
//   5. A 390 px (iPhone) no hay scroll horizontal.
//   6. El panel no acepta una IP pública ni contraseñas en las notas, y no
//      llama a la base cuando el formulario es inválido.
//   7. Pausar todo pide motivo y llama a v2_live_pausa.
//   8. Un motivo del servidor (fuera de horario) se dice en palabras del club.
//
// Uso:  npm i playwright-core   &&   node scripts/qa-humo-live.mjs
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const T = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2' };
const STUB = `
const _u={id:'u-1',email:'qa@example.com',app_metadata:{},user_metadata:{}};
export const createClient=()=>({
  auth:{getUser:async()=>({data:{user:_u},error:null}),getSession:async()=>({data:{session:{user:_u,access_token:'x'}},error:null}),
    onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),refreshSession:async()=>({data:{session:null},error:null}),signOut:async()=>({error:null})},
  functions:{invoke:async()=>({data:{ok:true},error:null})},
  storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:''},error:null}),createSignedUrls:async()=>({data:[],error:null}),list:async()=>({data:[],error:null})})},
  from:()=>({select:()=>({eq:async()=>({data:[],error:null})})}),
  rpc:async(name,params)=>{window.__rpc.push({name,params});const f=window.__fixtures[name];
    if(f===undefined)return {data:null,error:null};return {data:typeof f==='function'?f(params):f,error:null};},
});`;
const s = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/v2/supabase-client.js') { r.writeHead(200, { 'Content-Type': 'text/javascript' }); r.end(STUB); return; }
  let f = path.join(ROOT, u === '/' ? 'index.html' : u);
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'text/plain' }); fs.createReadStream(f).pipe(r);
});
await new Promise(r => s.listen(0, r));
const BASE = 'http://localhost:' + s.address().port;

const NAV = ['inicio', 'live', 'jugadores'].map((c, i) => ({ module_code: c, module_name: c, can_read: true, can_write: true, enabled: true, customized: false, sort_order: i }));
const CAM = { id: 'cam-1', nombre: 'Cancha 1', cancha: 'Cancha 1', motivo: 'ok', estado: 'sin_configurar', horario: [{ dia: 2, de: '17:00', a: '19:00' }] };
const PANEL = {
  ajustes: { pausado: false, gateway: null, ticket_seg: 120, sesion_min: 90, terminos_version: 1 }, presidencia: true,
  grabadores: [{ id: 'rec-1', nombre: 'Grabador del parque', tipo: 'desconocido', puerto: 554, codec: 'desconocido', substream: null, conectividad: 'sin_verificar' }],
  camaras: [{ id: 'cam-1', grabador: 'rec-1', nombre: 'Cancha 1', cancha: 'Cancha 1', perfil: 'sub', activa: false, sensible: false, categorias: ['T10'], roles: [], horario: [], estado: 'sin_configurar', viendo: 0 }],
  bloqueos: [], diagnosticos: [], categorias: ['T10', 'T12'], roles: ['Formadores', 'Presidencia']
};
const staff = (extra = {}) => ({
  v2_my_context: [{ user_id: 'u-1', display_name: 'QA', organization_id: 'org-1', organization_name: 'Club QA', organization_slug: 'club-qa', role: 'Presidencia', is_owner: true }],
  v2_my_navigation: NAV, v2_my_modules: [], v2_search_index: [], v2_club_config: { name: 'Club QA', slug: 'club-qa' }, v2_organization_settings: {},
  v2_live_mis_camaras: { pausado: false, terminos: { version: 1, aceptados: true }, camaras: [CAM] },
  v2_live_panel: PANEL, v2_live_ticket: { ok: false, motivo: 'sin_gateway' }, v2_live_pausa: { ok: true, sesiones_cortadas: 2 }, ...extra
});

const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
let fallos = 0, n = 0;
const revisa = (t, ok, d = '') => { n++; if (!ok) { fallos++; console.log(`✗ ${t}${d ? ` · ${d}` : ''}`); } else console.log(`✓ ${t}`); };

async function abre(ruta, fixtures, viewport = { width: 1280, height: 900 }) {
  const p = await b.newPage({ viewport });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).split('\n')[0]));
  await p.addInitScript(f => { window.__rpc = []; window.__fixtures = f; }, fixtures);
  await p.goto(BASE + ruta, { waitUntil: 'networkidle', timeout: 20000 });
  await p.waitForTimeout(500);
  return { p, errs };
}
const rpcs = p => p.evaluate(() => window.__rpc.map(x => x.name));
const sello = p => p.locator('.live-sello span').textContent();

// 1-2. Staff (administrador): reproductor y señal de prueba.
{
  const { p, errs } = await abre('/v2/live/', staff());
  revisa('staff: la pantalla abre sin errores', !errs.length, errs.join(' | '));
  const v = await p.evaluate(() => { const v = document.querySelector('.live-video video'); return v && { autoplay: v.autoplay || v.hasAttribute('autoplay'), muted: v.muted, pip: v.hasAttribute('disablepictureinpicture'), cl: v.getAttribute('controlslist') || '', paused: v.paused, src: v.currentSrc || '' }; });
  revisa('el video no arranca solo', v && !v.autoplay && v.paused && !v.src, JSON.stringify(v));
  revisa('el video va sin audio, sin descarga y sin imagen en imagen', v && v.muted && v.pip && /nodownload/.test(v.cl), JSON.stringify(v));
  revisa('al abrir no se pidió ningún ticket', !(await rpcs(p)).includes('v2_live_ticket'));
  revisa('el sello no dice "En vivo" al abrir', !/en vivo/i.test(await sello(p)));
  await p.click('.live-play');
  await p.waitForSelector('.tosdlg', { timeout: 5000 });
  revisa('sin gateway, al administrador se le ofrece la señal de prueba', /señal de prueba/i.test(await p.locator('.tosdlg').textContent()));
  await p.click('.tosdlg-ok');
  await p.waitForTimeout(400);
  const est = await p.locator('.live-video').getAttribute('data-estado');
  revisa('la señal de prueba se rotula como prueba', est === 'prueba' && /prueba/i.test(await sello(p)), `${est} / ${await sello(p)}`);
  revisa('la señal de prueba nunca dice "En vivo"', !/en vivo/i.test(await sello(p)));
  revisa('se pidió ticket sólo al tocar reproducir', (await rpcs(p)).filter(x => x === 'v2_live_ticket').length === 1);
  await p.click('.live-play');
  revisa('pausar la prueba deja el reproductor en pausa', await p.locator('.live-video').getAttribute('data-estado') === 'pausado');

  // 6. Panel: validación antes de llamar a la base.
  await p.click('[data-tab="camaras"]');
  await p.click('[data-nueva="grabador"]');
  await p.fill('[data-form="grabador"] [name=nombre]', 'Grabador QA');
  await p.fill('[data-form="grabador"] [name=ip]', '8.8.8.8');
  await p.fill('[data-form="grabador"] [name=notas]', 'rtsp://admin:1234@192.168.1.10');
  await p.click('[data-form="grabador"] button[type=submit]');
  const errTxt = await p.locator('[data-form="grabador"] .live-errores').textContent();
  revisa('el panel rechaza IP pública y credenciales en notas', /red local/.test(errTxt) && /contraseñas/.test(errTxt), errTxt);
  revisa('con datos inválidos no se llama a la base', !(await rpcs(p)).includes('v2_live_guardar_grabador'));
  await p.click('[data-cancela]');
  await p.click('[data-tab="diagnostico"]');
  const diag = await p.locator('.live-vista').textContent();
  revisa('diagnóstico: sin pruebas no se inventan resultados', /no se inventan resultados/i.test(diag) && /0 de 6 verificados/.test(diag), diag.slice(0, 200));
  revisa('diagnóstico: la plantilla RTSP no trae credenciales reales', /USUARIO:CLAVE@IP_DEL_GRABADOR/.test(diag));

  // 7. Pausar todo pide motivo.
  await p.click('[data-pausa]');
  await p.waitForSelector('.tosdlg-field');
  await p.click('.tosdlg-ok');
  revisa('pausar sin motivo no se permite', (await p.locator('.tosdlg-req').textContent()).length > 0 && !(await rpcs(p)).includes('v2_live_pausa'));
  await p.fill('.tosdlg-field', 'Prueba de botón de pánico');
  await p.click('.tosdlg-ok');
  await p.waitForTimeout(300);
  const pausa = await p.evaluate(() => window.__rpc.find(x => x.name === 'v2_live_pausa')?.params);
  revisa('pausar llama a v2_live_pausa con motivo', pausa?.pausar === true && /pánico/.test(pausa?.motivo || ''), JSON.stringify(pausa));
  await p.close();
}

// 3. Familia sin gateway: nunca la señal de prueba.
{
  const fx = { v2_live_mis_camaras: { pausado: false, terminos: { version: 1, aceptados: true }, camaras: [CAM] }, v2_live_ticket: { ok: false, motivo: 'sin_gateway' } };
  const { p, errs } = await abre('/v2/familias/live/', fx, { width: 390, height: 844 });
  revisa('familia: la pantalla abre sin errores', !errs.length, errs.join(' | '));
  await p.click('.live-play');
  await p.waitForTimeout(400);
  revisa('familia sin gateway: no hay diálogo de señal de prueba', await p.locator('.tosdlg').count() === 0);
  revisa('familia sin gateway: se le dice que la cámara no está conectada', /aún no conectada|todavía no está conectada/i.test(await p.locator('#liveBody').textContent()));
  revisa('familia: el sello nunca dice prueba ni en vivo', !/prueba|en vivo/i.test(await sello(p)), await sello(p));
  // 5. Móvil.
  const ancho = await p.evaluate(() => document.documentElement.scrollWidth);
  revisa('familia a 390 px: sin scroll horizontal', ancho <= 390, String(ancho));
  await p.close();
}

// 4. Familia sin aceptar reglas: reglas, no video.
{
  const fx = { v2_live_mis_camaras: { pausado: false, terminos: { version: 1, aceptados: false }, camaras: [{ ...CAM, motivo: 'sin_terminos' }] }, v2_live_aceptar_terminos: { ok: true, version: 1 } };
  const { p } = await abre('/v2/familias/live/', fx, { width: 390, height: 844 });
  revisa('sin reglas aceptadas: se muestran las reglas', await p.locator('.live-reglas').count() === 1);
  revisa('sin reglas aceptadas: no hay reproductor', await p.locator('.live-video').count() === 0);
  await p.click('[data-acepta]');
  await p.waitForTimeout(300);
  const acepta = await p.evaluate(() => window.__rpc.find(x => x.name === 'v2_live_aceptar_terminos')?.params);
  revisa('aceptar manda la versión de las reglas, no ids de jugador', acepta?.version === 1 && !('player_id' in (acepta || {})), JSON.stringify(acepta));
  await p.close();
}

// 8. Motivo del servidor en palabras del club.
{
  const fx = { v2_live_mis_camaras: { pausado: false, terminos: { version: 1, aceptados: true }, camaras: [{ ...CAM, motivo: 'fuera_de_horario' }] }, v2_live_ticket: { ok: false, motivo: 'fuera_de_horario' } };
  const { p } = await abre('/v2/familias/live/', fx, { width: 390, height: 844 });
  revisa('fuera de horario: se explica con palabras', /sólo transmite en el horario/i.test(await p.locator('#liveBody').textContent()));
  revisa('fuera de horario: dice cuándo es el siguiente', /Martes|Hoy|Mañana|Ahora/.test(await p.locator('.live-info p').textContent()));
  await p.close();
}

// 9. Botón Transmitir (24/11/2026).
const C = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
{
  const { p, errs } = await abre('/v2/live/', staff({ v2_live_transmitir: { ok: true, id: 'b-1', modo: 'enlace', enlace: C, termina: '2026-11-25T05:00:00Z' } }));
  revisa('Transmitir: el botón está en la pantalla', await p.locator('[data-transmitir]').count() === 1, errs.join(' | '));
  await p.click('[data-tx-dura="120"]');
  await p.fill('[data-tx-titulo]', 'Final Copa TCP');
  await p.click('[data-transmitir]');
  await p.waitForSelector('.tosdlg', { timeout: 5000 });
  const tx = await p.evaluate(() => window.__rpc.find(x => x.name === 'v2_live_transmitir')?.params);
  revisa('Transmitir manda cámara, modo enlace, 120 min y nombre', tx?.camera_id === 'cam-1' && tx?.modo === 'enlace' && tx?.minutos === 120 && tx?.titulo === 'Final Copa TCP', JSON.stringify(tx));
  const dlg = await p.locator('.tosdlg').textContent();
  const campo = await p.locator('.tosdlg-field').count() ? await p.locator('.tosdlg-field').inputValue() : '';
  revisa('Transmitir entrega el enlace para compartir', /Enlace copiado/.test(dlg) || campo.endsWith(`/ver/#${C}`), dlg + ' ' + campo);
  await p.close();
}
{
  const activa = { id: 'b-1', camara_id: 'cam-1', camara: 'Cancha 1', modo: 'enlace', titulo: 'Final Copa TCP', enlace: C, desde: '2026-11-25T03:00:00Z', termina: '2026-11-25T05:00:00Z', viendo: 7 };
  const { p } = await abre('/v2/live/', staff({ v2_live_panel: { ...PANEL, transmisiones: [activa] }, v2_live_detener: { ok: true, sesiones_cortadas: 7 } }));
  const txt = await p.locator('.live-activa').textContent();
  revisa('la transmisión activa dice qué es, cuánta gente y el enlace', /Final Copa TCP/.test(txt) && /7 viendo/.test(txt) && txt.includes(`/ver/#${C}`), txt);
  const wa = await p.locator('.live-activa a').getAttribute('href');
  revisa('WhatsApp lleva el enlace', wa.startsWith('https://wa.me/?text=') && decodeURIComponent(wa).includes(`/ver/#${C}`), wa);
  revisa('una cámara que ya transmite no se ofrece otra vez', await p.locator('[data-tx-cam="cam-1"]').count() === 0);
  await p.click('[data-detener]');
  await p.waitForSelector('.tosdlg');
  await p.click('.tosdlg-ok');
  await p.waitForTimeout(300);
  revisa('Detener llama a v2_live_detener', (await p.evaluate(() => window.__rpc.find(x => x.name === 'v2_live_detener')?.params?.broadcast_id)) === 'b-1');
  await p.close();
}

// 10. El enlace (/ver/), sin cuenta.
{
  const fx = { v2_live_publico: { ok: true, motivo: 'ok', titulo: 'Final Copa TCP', camara: 'Cancha 1', termina: '2026-11-25T05:00:00Z' }, v2_live_publico_ticket: { ok: false, motivo: 'sin_gateway' } };
  const { p, errs } = await abre(`/v2/ver/#${C}`, fx, { width: 390, height: 844 });
  revisa('enlace: abre sin errores', !errs.length, errs.join(' | '));
  revisa('enlace: dice qué se transmite', /Final Copa TCP/.test(await p.locator('#liveBody').textContent()));
  revisa('enlace: la hora es la del club (11 pm), no la del teléfono', /hasta las 11:00/i.test(await p.locator('#liveBody').textContent()), await p.locator('.live-hero p:last-child').textContent());
  revisa('enlace: no pide sesión del staff', !(await rpcs(p)).some(n => /v2_my_context|v2_live_mis_camaras/.test(n)));
  revisa('enlace: manda el código, no otra cosa', (await p.evaluate(() => window.__rpc.find(x => x.name === 'v2_live_publico')?.params?.enlace)) === C);
  const v = await p.evaluate(() => { const v = document.querySelector('video'); return v && { auto: v.autoplay, muted: v.muted, paused: v.paused }; });
  revisa('enlace: el video no arranca solo y va sin audio', v && !v.auto && v.muted && v.paused, JSON.stringify(v));
  await p.click('.live-play');
  await p.waitForTimeout(400);
  revisa('enlace sin gateway: nunca señal de prueba', await p.locator('.tosdlg').count() === 0 && !/prueba|en vivo/i.test(await sello(p)));
  revisa('enlace sin gateway: lo dice con palabras', /aún no conectada|todavía no está conectada/i.test(await p.locator('#liveBody').textContent()));
  const ancho = await p.evaluate(() => document.documentElement.scrollWidth);
  revisa('enlace a 390 px: sin scroll horizontal', ancho <= 390, String(ancho));
  await p.close();
}
{
  const { p } = await abre('/v2/ver/', { v2_live_publico: { ok: true } }, { width: 390, height: 844 });
  revisa('enlace sin código: lo dice y no llama a la base', /incompleto/i.test(await p.locator('#liveBody').textContent()) && !(await rpcs(p)).length);
  await p.close();
}
{
  const { p } = await abre(`/v2/ver/#${C}`, { v2_live_publico: { ok: false, motivo: 'terminada' } }, { width: 390, height: 844 });
  revisa('enlace terminado: lo dice y no enseña reproductor', /terminó/i.test(await p.locator('#liveBody').textContent()) && await p.locator('.live-video').count() === 0);
  await p.close();
}

// Staff a 390 px.
{
  const { p } = await abre('/v2/live/', staff(), { width: 390, height: 844 });
  const ancho = await p.evaluate(() => document.documentElement.scrollWidth);
  revisa('staff a 390 px: sin scroll horizontal', ancho <= 390, String(ancho));
  await p.close();
}

await b.close(); s.close();
console.log(`\nTanner LIVE en navegador · ${n - fallos}/${n}`);
if (fallos) process.exit(1);
