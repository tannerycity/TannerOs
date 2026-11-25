/* Tanner LIVE · puente del servidor de video (24/11/2026).
 * Lo que el puente decide sin red: qué ticket trae cada conexión, cómo se
 * arma la URL del Dahua y qué cámaras acepta. La cadena completa (DVR →
 * MediaMTX → puente → base → navegador) la prueba gateway/prueba-local.mjs.
 */
import { ticketDe, urlDahua, leeCamaras } from '../gateway/puente.mjs';
import fs from 'node:fs';

let fallos = 0, n = 0;
const revisa = (t, ok, d = '') => { n++; if (!ok) { fallos++; console.error(` - ${t}${d ? ` · ${d}` : ''}`); } };
const T = 'a'.repeat(64);

// Ticket: WHEP (Bearer → token), HLS (?ticket=), y basura.
revisa('WHEP: el ticket llega como token', ticketDe({ token: T }) === T);
revisa('HLS: el ticket llega en la consulta', ticketDe({ query: `ticket=${T}` }) === T);
revisa('HLS con ? al inicio', ticketDe({ query: `?ticket=${T}&x=1` }) === T);
revisa('como contraseña (navegadores sin encabezado)', ticketDe({ user: 'x', password: T }) === T);
for (const malo of [{}, { token: 'abc' }, { token: T.slice(1) }, { token: T + 'a' }, { query: 'ticket=zzz' }, { token: T.toUpperCase().replace(/A/g, 'G') }])
  revisa(`ticket inválido no pasa: ${JSON.stringify(malo).slice(0, 30)}`, ticketDe(malo) === null);

// URL Dahua.
revisa('substream = subtype 1', urlDahua({ host: '192.168.100.57', puerto: 554, usuario: 'tannerlive', clave: 'x', canal: 9, perfil: 'sub' })
  === 'rtsp://tannerlive:x@192.168.100.57:554/cam/realmonitor?channel=9&subtype=1');
revisa('principal = subtype 0', /subtype=0$/.test(urlDahua({ host: 'h', puerto: 554, usuario: 'u', clave: 'c', canal: 1, perfil: 'main' })));
revisa('una clave con símbolos no rompe la URL', urlDahua({ host: 'h', puerto: 554, usuario: 'u', clave: 'a@b:c/d', canal: 1 }).includes('u:a%40b%3Ac%2Fd@h'));

// Cámaras.
revisa('cámaras válidas', leeCamaras('[{"ruta":"tc-cancha-1","canal":9}]')[0].perfil === 'sub');
for (const malo of ['[]', '[{"ruta":"Cancha 1","canal":9}]', '[{"ruta":"tc-cancha-1","canal":0}]', '[{"ruta":"tc-cancha-1","canal":300}]']) {
  let ok = false; try { leeCamaras(malo); } catch (_) { ok = true; }
  revisa(`cámaras inválidas se rechazan: ${malo}`, ok);
}

// El puente no imprime secretos: ninguna línea de log usa la URL ni la clave.
const src = fs.readFileSync(new URL('../gateway/puente.mjs', import.meta.url), 'utf8');
const logs = [...src.matchAll(/log\(([^;]*)\);/g)].map(m => m[1]).join('\n');
// El ticket sólo puede salir pasado por huella(); nunca ${ticket}, ${cuerpo.token}, la clave ni la URL.
revisa('ningún log imprime la clave, la URL RTSP ni el ticket', !/dvrClave|conf\.source|urlDahua|\$\{\s*(ticket|cuerpo\.token|cuerpo\.password|cuerpo\.query)\s*\}|\$\{\s*ticketDe\(/.test(logs));
revisa('la config de MediaMTX no trae claves', !/rtsp:\/\/[^\s]*:[^\s]*@/.test(fs.readFileSync(new URL('../gateway/mediamtx.yml', import.meta.url), 'utf8')));

console.log(`qa-puente · ${n - fallos}/${n}`);
if (fallos) process.exit(1);
