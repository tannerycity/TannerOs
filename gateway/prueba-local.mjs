// Tanner LIVE · prueba de punta a punta, en una sola máquina (24/11/2026).
//
// Arma la cadena completa con piezas de verdad y sólo simula el DVR:
//
//   ffmpeg (barras de prueba, H.264) → "DVR simulado" (MediaMTX con usuario y
//   clave, misma URL que Dahua: /cam/realmonitor?channel=8&subtype=1)
//   → MediaMTX de Tanner LIVE (gateway/mediamtx.yml, con TLS de prueba)
//   → puente (gateway/puente.mjs) → base local con h101
//   → Chromium abre /ver/#<enlace> como lo haría quien recibe el enlace.
//
// Comprueba: que se ve EN VIVO con cuadros reales, que un ticket inventado no
// entra, que el puente reporta la cámara en línea, y que "Detener" corta.
//
// NO toca producción: la base es un Postgres local con la réplica mínima.
// Requisitos: Postgres 16 local, ffmpeg con libx264, openssl, el binario de
// MediaMTX v1.21.4, Chromium y playwright-core. Ver gateway/README.md.
//
//   PG="-h /ruta/socket -p 5432 -U postgres" MEDIAMTX=/ruta/mediamtx \
//   CHROME_PATH=/ruta/chrome node gateway/prueba-local.mjs
import { spawn, execFileSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const TMP = fs.mkdtempSync(path.join(process.env.PRUEBA_TMP || os.tmpdir(), 'tanner-live-'));
const PG = (process.env.PG || '').split(' ').filter(Boolean);
const DB = 'tanner_live_e2e';
const MEDIAMTX = process.env.MEDIAMTX || 'mediamtx';
const CLAVE_SERVICIO = 'clave-de-servicio-solo-para-esta-prueba';
const DVR = { usuario: 'tannerlive', clave: 'clave-dvr-de-prueba', puerto: 8654 };
const PUERTOS = { puente: 9100, api: 9997, webrtc: 8889, hls: 8888 };
const procesos = [];
let fallos = 0, n = 0;
const revisa = (t, ok, d = '') => { n++; if (!ok) { fallos++; console.log(`✗ ${t}${d ? ` · ${d}` : ''}`); } else console.log(`✓ ${t}`); };
const espera = ms => new Promise(r => setTimeout(r, ms));

function psql(sql, db = DB) {
  return execFileSync('psql', [...PG, '-d', db, '-v', 'ON_ERROR_STOP=1', '-At', '-q', '-c', sql], { encoding: 'utf8' }).trim();
}
function psqlArchivo(f) { execFileSync('psql', [...PG, '-d', DB, '-v', 'ON_ERROR_STOP=1', '-q', '-f', f], { stdio: ['ignore', 'ignore', 'inherit'] }); }
const lit = v => v === null || v === undefined ? 'null' : `'${String(typeof v === 'object' ? JSON.stringify(v) : v).replace(/'/g, "''")}'`;
// Ejecuta una función como una persona (claims) o como un rol.
function comoQuien({ rol, sub }) {
  const claims = sub ? JSON.stringify({ sub, role: 'authenticated' }) : '';
  return `select set_config('request.jwt.claims', ${lit(claims)}, false), set_config('request.jwt.claim.sub', ${lit(sub || '')}, false); set role ${rol};`;
}
function llama(fn, params, quien) {
  const args = Object.entries(params || {}).map(([k, v]) => `${k} => ${lit(v)}`).join(', ');
  const out = psql(`${comoQuien(quien)} select public.${fn}(${args});`);
  return JSON.parse(out.split('\n').pop() || 'null');
}
function lanza(nombre, cmd, args, opts = {}) {
  const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  const bitacora = fs.createWriteStream(path.join(TMP, `${nombre}.log`));
  p.stdout.pipe(bitacora); p.stderr.pipe(bitacora);
  procesos.push(p);
  return p;
}
function limpia() { for (const p of procesos) { try { p.kill('SIGTERM'); } catch (_) {} } }
process.on('exit', limpia);

// --- 1. Base local con h101 -------------------------------------------------
console.log(`Carpeta de la prueba: ${TMP}`);
psql(`drop database if exists ${DB}`, 'postgres');
psql(`create database ${DB}`, 'postgres');
psqlArchivo(path.join(RAIZ, 'supabase/propuestas/h101_tanner_live_replica_local.sql'));
psqlArchivo(path.join(RAIZ, 'supabase/propuestas/h101_tanner_live.sql'));
const ORG = 'e2e00000-0000-0000-0000-00000000000a', PRESI = 'e2e00000-0000-0000-0000-000000000001';
psql(`insert into public.organizations(id, slug, name) values ('${ORG}', 'club-e2e', 'Club E2E');
  insert into public.organization_module_overrides(organization_id, module_code, enabled) values ('${ORG}', 'live', true);
  insert into public.role_module_permissions(organization_id, role, module_code, can_read, can_write) values ('${ORG}', 'Presidencia', 'live', true, true);
  insert into public.profiles(user_id, display_name) values ('${PRESI}', 'Presidencia E2E');
  insert into public.organization_memberships(organization_id, user_id, role) values ('${ORG}', '${PRESI}', 'Presidencia');`);
const yo = { rol: 'authenticated', sub: PRESI };
llama('v2_live_ajustes', { organization_id: ORG, datos: { gateway: `https://localhost:${PUERTOS.webrtc}` } }, yo);
const cam = llama('v2_live_guardar_camara', { organization_id: ORG, datos: { nombre: 'Cancha 1', cancha: 'Cancha 1', canal: 8, ruta: 'tc-cancha-1' } }, yo).id;
const tx = llama('v2_live_transmitir', { organization_id: ORG, camera_id: cam, modo: 'enlace', titulo: 'Prueba de punta a punta', minutos: 30 }, yo);
revisa('la base da un enlace al tocar Transmitir', /^[0-9a-f]{32}$/.test(tx?.enlace || ''), JSON.stringify(tx));

// --- 2. Certificado de prueba (el gateway real usa uno de verdad) -----------
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost',
  '-keyout', path.join(TMP, 'server.key'), '-out', path.join(TMP, 'server.crt')], { stdio: 'ignore' });

// --- 3. DVR simulado: pide usuario y clave, como el Dahua --------------------
fs.writeFileSync(path.join(TMP, 'dvr.yml'), `logLevel: info
rtsp: true
rtspAddress: 127.0.0.1:${DVR.puerto}
rtspTransports: [tcp]
rtmp: false
srt: false
moq: false
webrtc: false
hls: false
api: false
authInternalUsers:
  - user: ${DVR.usuario}
    pass: ${DVR.clave}
    permissions:
      - action: read
  - user: any
    ips: ['127.0.0.1']
    permissions:
      - action: publish
paths:
  all_others: {}
`);
lanza('dvr', MEDIAMTX, [path.join(TMP, 'dvr.yml')]);
await espera(1000);
lanza('ffmpeg', 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-re', '-f', 'lavfi', '-i', 'testsrc2=size=704x480:rate=15',
  '-c:v', 'libx264', '-profile:v', 'baseline', '-tune', 'zerolatency', '-g', '15', '-pix_fmt', 'yuv420p', '-b:v', '512k',
  '-f', 'rtsp', '-rtsp_transport', 'tcp', `rtsp://127.0.0.1:${DVR.puerto}/cam/realmonitor`]);

// --- 4. Servidor web + "PostgREST" mínimo ------------------------------------
// Sirve el repositorio tal cual. Sólo cambia el cliente de Supabase: sus rpc
// van a este mismo servidor, que las corre en la base local con el rol que
// corresponde (anon para la página; service_role para el puente).
const STUB = `export const createClient=()=>({
  auth:{getSession:async()=>({data:{session:null},error:null}),getUser:async()=>({data:{user:null},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
  rpc:async(name,params)=>{const r=await fetch('/rest/v1/rpc/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(params||{})});
    const j=await r.json();return r.ok?{data:j,error:null}:{data:null,error:{message:j.message||'error'}};}
});`;
const TIPOS = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const web = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (q.method === 'POST' && u.startsWith('/rest/v1/rpc/')) {
    let cuerpo = ''; q.on('data', d => cuerpo += d); q.on('end', () => {
      const fn = u.slice('/rest/v1/rpc/'.length);
      if (!/^v2_live_[a-z_]+$/.test(fn)) { r.writeHead(404); return r.end('{}'); }
      const servicio = q.headers.authorization === `Bearer ${CLAVE_SERVICIO}`;
      try { const d = llama(fn, JSON.parse(cuerpo || '{}'), { rol: servicio ? 'service_role' : 'anon' }); r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify(d)); }
      catch (e) { r.writeHead(400, { 'Content-Type': 'application/json' }); r.end(JSON.stringify({ message: String(e.stderr || e.message).slice(0, 300) })); }
    });
    return;
  }
  if (u === '/v2/supabase-client.js') { r.writeHead(200, { 'Content-Type': 'text/javascript' }); return r.end(STUB); }
  let f = path.join(RAIZ, u);
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!f.startsWith(RAIZ) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'text/plain' }); fs.createReadStream(f).pipe(r);
});
await new Promise(r => web.listen(0, '127.0.0.1', r));
const WEB = `http://localhost:${web.address().port}`;

// --- 5. MediaMTX de Tanner LIVE: el mismo gateway/mediamtx.yml ---------------
// Cambios sólo para la prueba: TLS con el certificado de arriba, cualquier
// origen (la página corre en localhost) y sin STUN (no sale a internet).
let conf = fs.readFileSync(path.join(RAIZ, 'gateway/mediamtx.yml'), 'utf8')
  .replace(/webrtcAllowOrigins:.*/, "webrtcAllowOrigins: ['*']")
  .replace(/hlsAllowOrigins:.*/, "hlsAllowOrigins: ['*']")
  .replace(/webrtcAdditionalHosts:.*/, 'webrtcAdditionalHosts: []')
  .replace(/webrtcICEServers2:\n  - url: .*/, 'webrtcICEServers2: []')
  .replace('webrtc: true', `webrtc: true\nwebrtcEncryption: true\nwebrtcServerKey: ${path.join(TMP, 'server.key')}\nwebrtcServerCert: ${path.join(TMP, 'server.crt')}`);
fs.writeFileSync(path.join(TMP, 'gateway.yml'), conf);
lanza('gateway', MEDIAMTX, [path.join(TMP, 'gateway.yml')]);
await espera(1200);

// --- 6. Puente --------------------------------------------------------------
Object.assign(process.env, {
  SUPABASE_URL: WEB, SUPABASE_SERVICE_ROLE_KEY: CLAVE_SERVICIO,
  DVR_HOST: '127.0.0.1', DVR_PUERTO: String(DVR.puerto), DVR_USUARIO: DVR.usuario, DVR_CLAVE: DVR.clave,
  CAMARAS: JSON.stringify([{ ruta: 'tc-cancha-1', canal: 8, perfil: 'sub' }]), CADA_CORTES_MS: '1500', CADA_ESTADO_MS: '2000'
});
const salidaPuente = [];
const logOriginal = console.log;
console.log = (...a) => { const t = a.join(' '); if (/^\d{4}-\d\d-\d\dT/.test(t)) { salidaPuente.push(t); fs.appendFileSync(path.join(TMP, 'puente.log'), t + '\n'); } else logOriginal(...a); };
const { arranca } = await import('./puente.mjs');
const puente = await arranca();

// --- 7. Chromium abre el enlace ---------------------------------------------
const { chromium } = await import('playwright-core');
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--ignore-certificate-errors'] });
const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
const errores = [];
p.on('pageerror', e => errores.push(String(e)));
await p.goto(`${WEB}/v2/ver/#${tx.enlace}`, { waitUntil: 'networkidle' });
revisa('la página del enlace abre sin errores', !errores.length, errores.join(' | '));
await p.click('.live-play');
let estado = '';
for (let i = 0; i < 40 && estado !== 'en_vivo'; i++) { await espera(500); estado = await p.locator('.live-video').getAttribute('data-estado'); }
const vid = await p.evaluate(() => { const v = document.querySelector('video'); return { w: v.videoWidth, h: v.videoHeight, cuadros: v.getVideoPlaybackQuality?.().totalVideoFrames || 0, muted: v.muted }; });
revisa('el enlace se ve EN VIVO con cuadros reales del DVR simulado', estado === 'en_vivo' && vid.w > 0 && vid.cuadros > 0, `${estado} ${JSON.stringify(vid)}`);
revisa('el video llega a 704x480 (el substream recomendado)', vid.w === 704 && vid.h === 480, JSON.stringify(vid));
revisa('sin audio', vid.muted);
// Los pixeles de verdad: se copia un cuadro del video a un canvas y se mide
// cuánto color trae (las barras de prueba son de colores; negro = no llegó).
const pix = await p.evaluate(() => { const v = document.querySelector('video'); const c = document.createElement('canvas'); c.width = 64; c.height = 48;
  const g = c.getContext('2d'); g.drawImage(v, 0, 0, 64, 48); const d = g.getImageData(0, 0, 64, 48).data; let color = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 60) color++; return color / (d.length / 4); });
revisa('el cuadro del video trae imagen (no está en negro)', pix > 0.5, `${Math.round(pix * 100)}% con color`);
await p.screenshot({ path: path.join(TMP, 'en-vivo.png') });

// Un ticket inventado no entra (lo pregunta MediaMTX al puente, y la base dice que no).
const falso = await p.evaluate(async url => (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/sdp', Authorization: `Bearer ${'0'.repeat(64)}` }, body: 'v=0' })).status,
  `https://localhost:${PUERTOS.webrtc}/tc-cancha-1/whep`);
revisa('un ticket inventado: el servidor de video lo rechaza', falso === 401 || falso === 403, String(falso));
const sinTicket = await p.evaluate(async url => (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: 'v=0' })).status,
  `https://localhost:${PUERTOS.webrtc}/tc-cancha-1/whep`);
revisa('sin ticket: el servidor de video lo rechaza', sinTicket === 401 || sinTicket === 403, String(sinTicket));

await espera(3000);
const estadoBase = psql(`select stream_state from app.live_cameras where id = '${cam}'`, DB);
revisa('el puente reporta la cámara en línea en la base', estadoBase === 'online', estadoBase);
revisa('el puente nunca escribe la clave del DVR ni tokens en su bitácora', !salidaPuente.join('\n').includes(DVR.clave) && !/[0-9a-f]{64}/.test(salidaPuente.join('\n')));

// --- 8. "Detener" corta a quien está viendo ----------------------------------
llama('v2_live_detener', { organization_id: ORG, broadcast_id: tx.id }, yo);
let cortado = false;
for (let i = 0; i < 24 && !cortado; i++) { await espera(500); cortado = (await p.locator('.live-video').getAttribute('data-estado')) !== 'en_vivo'; }
revisa('al tocar Detener, el video se corta en segundos', cortado);
let final = '';
for (let i = 0; i < 30 && !/terminó/i.test(final); i++) { await espera(500); final = await p.locator('#liveBody').textContent(); }
revisa('y la página dice que la transmisión terminó', /terminó/i.test(final), final.slice(0, 160));

await b.close(); puente.cierra(); web.close(); limpia();
console.log = logOriginal;
console.log(`\nPrueba de punta a punta · ${n - fallos}/${n} · bitácoras y captura en ${TMP}`);
process.exit(fallos ? 1 : 0);
