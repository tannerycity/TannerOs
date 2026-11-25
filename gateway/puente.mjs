// Tanner LIVE · puente del servidor de video (24/11/2026).
//
// Corre en el MISMO servidor que MediaMTX, junto a él, y hace cuatro cosas:
//   1. Da de alta en MediaMTX una ruta por cámara, con la URL RTSP del DVR.
//      La URL lleva usuario y clave: vive sólo en la memoria de este proceso
//      y de MediaMTX. No se escribe en archivos, ni en la base, ni en logs.
//   2. Autoriza cada conexión: MediaMTX (authMethod: http) le pregunta aquí,
//      y aquí se pregunta a la base (v2_live_gateway_autoriza). Responde 200
//      con {"expireAt"} — MediaMTX corta la sesión a esa hora — o 401.
//   3. Cada pocos segundos pide a la base qué sesiones cortar (pausa,
//      revocación, Detener, Nuevo enlace) y las expulsa con la API de control.
//   4. Reporta a la base si cada cámara está en línea.
//
// Sin dependencias: Node 22. Se configura con variables de entorno (ver
// gateway/README.md). Nunca imprime tokens, claves ni la URL RTSP.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';

const env = process.env;
const cfg = {
  supabaseUrl: (env.SUPABASE_URL || '').replace(/\/$/, ''),
  serviceKey: env.SUPABASE_SERVICE_ROLE_KEY || '',
  mtxApi: (env.MTX_API || 'http://127.0.0.1:9997').replace(/\/$/, ''),
  puerto: Number(env.PUENTE_PUERTO || 9100),
  host: env.PUENTE_HOST || '127.0.0.1',
  dvrHost: env.DVR_HOST || '',
  dvrPuerto: Number(env.DVR_PUERTO || 554),
  dvrUsuario: env.DVR_USUARIO || '',
  dvrClave: env.DVR_CLAVE || '',
  // [{"ruta":"tc-cancha-1","canal":9,"perfil":"sub"}] o una ruta a un .json
  camaras: env.CAMARAS || 'camaras.json',
  cadaCortes: Number(env.CADA_CORTES_MS || 5000),
  cadaEstado: Number(env.CADA_ESTADO_MS || 15000)
};

const log = (...a) => console.log(new Date().toISOString(), ...a);
// Para los logs: una huella corta, nunca el token.
const huella = t => t ? crypto.createHash('sha256').update(String(t)).digest('hex').slice(0, 8) : '-';

export function leeCamaras(valor) {
  const texto = String(valor || '').trim().startsWith('[') ? valor : fs.readFileSync(valor, 'utf8');
  const lista = JSON.parse(texto);
  if (!Array.isArray(lista) || !lista.length) throw new Error('CAMARAS vacío');
  for (const c of lista) {
    if (!/^[a-z0-9][a-z0-9_-]{2,62}$/.test(c.ruta || '')) throw new Error(`Ruta inválida: ${c.ruta}`);
    if (!(Number(c.canal) >= 1 && Number(c.canal) <= 256)) throw new Error(`Canal inválido en ${c.ruta}`);
  }
  return lista.map(c => ({ ruta: c.ruta, canal: Number(c.canal), perfil: c.perfil === 'main' ? 'main' : 'sub' }));
}

// Formato que documenta Dahua para NVR/XVR/DVR.
export function urlDahua({ host, puerto, usuario, clave, canal, perfil }) {
  const cred = usuario ? `${encodeURIComponent(usuario)}:${encodeURIComponent(clave)}@` : '';
  return `rtsp://${cred}${host}:${puerto}/cam/realmonitor?channel=${canal}&subtype=${perfil === 'main' ? 0 : 1}`;
}

// El ticket llega distinto según el protocolo: WHEP manda Authorization:
// Bearer (MediaMTX lo pasa como token); HLS no puede mandar encabezados y lo
// trae en la consulta (?ticket=).
export function ticketDe(cuerpo = {}) {
  const t = cuerpo.token || cuerpo.password || '';
  if (/^[0-9a-f]{64}$/.test(t)) return t;
  const q = new URLSearchParams(String(cuerpo.query || '').replace(/^\?/, ''));
  const enQuery = q.get('ticket') || q.get('jwt') || '';
  return /^[0-9a-f]{64}$/.test(enQuery) ? enQuery : null;
}

async function rpc(nombre, params) {
  const r = await fetch(`${cfg.supabaseUrl}/rest/v1/rpc/${nombre}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: cfg.serviceKey, Authorization: `Bearer ${cfg.serviceKey}` },
    body: JSON.stringify(params)
  });
  if (!r.ok) throw new Error(`rpc ${nombre}: ${r.status}`);
  return r.json();
}
async function mtx(metodo, ruta, cuerpo) {
  const r = await fetch(`${cfg.mtxApi}${ruta}`, { method: metodo, headers: cuerpo ? { 'Content-Type': 'application/json' } : {}, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  return r;
}

// 1. Rutas en MediaMTX.
async function registraCamaras(camaras) {
  for (const c of camaras) {
    const conf = {
      source: urlDahua({ host: cfg.dvrHost, puerto: cfg.dvrPuerto, usuario: cfg.dvrUsuario, clave: cfg.dvrClave, canal: c.canal, perfil: c.perfil }),
      sourceOnDemand: true, sourceOnDemandStartTimeout: '10s', sourceOnDemandCloseAfter: '10s', rtspTransport: 'tcp'
    };
    let r = await mtx('POST', `/v3/config/paths/add/${c.ruta}`, conf);
    if (r.status === 400) r = await mtx('POST', `/v3/config/paths/replace/${c.ruta}`, conf); // ya existía
    if (!r.ok) throw new Error(`No se pudo registrar ${c.ruta} en MediaMTX: ${r.status}`);
    log(`cámara ${c.ruta} → canal ${c.canal} (${c.perfil})`);
  }
}

// 2. Autorizar. Un "sí" se recuerda 20 s (HLS pregunta por cada pedazo).
const recordados = new Map();
async function autoriza(cuerpo) {
  if (cuerpo.action !== 'read') return { ok: false, motivo: 'accion' };
  const ticket = ticketDe(cuerpo);
  if (!ticket) return { ok: false, motivo: 'sin_ticket' };
  const llave = `${ticket}|${cuerpo.path}|${cuerpo.ip}`;
  const r0 = recordados.get(llave);
  if (r0 && r0.hasta > Date.now()) return r0.r;
  const r = await rpc('v2_live_gateway_autoriza', { token: ticket, path: cuerpo.path, accion: 'read', ip: cuerpo.ip || null, sesion: cuerpo.id || null });
  if (r?.ok) recordados.set(llave, { r, hasta: Date.now() + 20000 });
  return r;
}

function servidor() {
  return http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/autoriza') { res.writeHead(404); return res.end(); }
    let datos = '';
    req.on('data', d => { datos += d; if (datos.length > 16384) req.destroy(); });
    req.on('end', async () => {
      let cuerpo = {};
      try { cuerpo = JSON.parse(datos || '{}'); } catch (_) {}
      try {
        const r = await autoriza(cuerpo);
        log(`autoriza ${cuerpo.protocol || '?'} ${cuerpo.path || '?'} ticket:${huella(ticketDe(cuerpo))} → ${r?.ok ? 'sí' : `no (${r?.motivo})`}`);
        if (r?.ok) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ expireAt: r.expira })); }
      } catch (e) { log(`autoriza: error con la base (${e.message})`); }
      res.writeHead(401); res.end();
    });
  });
}

// 3. Cortes.
let desde = new Date(Date.now() - 60000).toISOString();
async function cortes() {
  const ahora = new Date().toISOString();
  try {
    const lista = await rpc('v2_live_gateway_cortes', { desde });
    for (const c of lista || []) {
      if (!c.sesion) continue;
      for (const tipo of ['webrtc/sessions', 'hls/sessions', 'rtsp/sessions']) {
        const r = await mtx('POST', `/v3/${tipo}/kick/${encodeURIComponent(c.sesion)}`);
        if (r.ok) { log(`sesión cortada (${c.motivo})`); break; }
      }
      for (const k of recordados.keys()) recordados.delete(k); // nada de "sí" recordados tras un corte
    }
    desde = ahora;
  } catch (e) { log(`cortes: ${e.message}`); }
}

// 4. Estado de cada cámara (sólo cuando cambia).
const ultimo = new Map();
async function estados(camaras) {
  try {
    const r = await mtx('GET', '/v3/paths/list?itemsPerPage=500');
    const items = r.ok ? (await r.json()).items || [] : [];
    for (const c of camaras) {
      const p = items.find(x => x.name === c.ruta);
      const lectores = (p?.readers || []).length;
      const estado = p?.ready ? 'online' : lectores ? 'conectando' : null; // sin nadie viendo, no se jala la cámara: no se reporta
      if (estado && ultimo.get(c.ruta) !== estado) {
        await rpc('v2_live_gateway_estado', { path: c.ruta, estado, error: null });
        ultimo.set(c.ruta, estado);
        log(`estado ${c.ruta}: ${estado}`);
      }
    }
  } catch (e) { log(`estado: ${e.message}`); }
}

export async function arranca() {
  for (const k of ['supabaseUrl', 'serviceKey', 'dvrHost']) if (!cfg[k]) throw new Error(`Falta configurar ${k}`);
  const camaras = leeCamaras(cfg.camaras);
  await registraCamaras(camaras);
  const s = servidor();
  await new Promise(r => s.listen(cfg.puerto, cfg.host, r));
  log(`puente escuchando en ${cfg.host}:${cfg.puerto} · ${camaras.length} cámara(s)`);
  const t1 = setInterval(cortes, cfg.cadaCortes);
  const t2 = setInterval(() => estados(camaras), cfg.cadaEstado);
  return { cierra: () => { clearInterval(t1); clearInterval(t2); s.close(); } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  arranca().catch(e => { console.error(e.message); process.exit(1); });
}
