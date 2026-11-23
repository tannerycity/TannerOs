// Tanner LIVE es privado: que el código no lo vuelva público (23/11/2026)
//
// Una barrera por archivo, a proposito: ver scripts/barreras/README.md.
//
// Se transmiten entrenamientos de menores. Lo que decide quién ve vive en la
// base (h101) y el gateway lo revisa otra vez; esto vigila que el NAVEGADOR
// tampoco abra huecos:
//   1. El <video> nunca arranca solo (sin autoplay), va sin audio (muted), sin
//      descarga (controlslist nodownload) y sin imagen en imagen.
//   2. Ninguna pantalla de Tanner LIVE trae una URL RTSP con usuario:clave@,
//      ni lee un secreto de un NEXT_PUBLIC_* o similar.
//   3. El ticket viaja en Authorization (WHEP) y no se guarda en el
//      navegador (ni localStorage ni sessionStorage).
//   4. La señal de prueba nunca se anuncia "En vivo": la decisión pasa por
//      puedeDecirEnVivo, que excluye al proveedor 'prueba'.
//   5. La pantalla de familias no ofrece la señal de prueba.
import fs from 'node:fs';
import path from 'node:path';

const DIRS = ['v2/live', 'v2/familias/live'];
const listar = d => fs.existsSync(d) ? fs.readdirSync(d).map(f => path.join(d, f)).filter(f => /\.(js|html)$/.test(f)) : [];

export default function comprobar() {
  const errors = [];
  const archivos = DIRS.flatMap(listar);
  if (!archivos.length) return ['Tanner LIVE: no se encontraron las pantallas en v2/live ni v2/familias/live'];
  const rep = 'v2/live/reproductor.js';
  if (!fs.existsSync(rep)) return [`Tanner LIVE: falta ${rep}`];
  const r = fs.readFileSync(rep, 'utf8');
  const video = (r.match(/<video[^>]*>/) || [''])[0];
  if (!video) errors.push('Tanner LIVE: el reproductor no declara su <video>');
  if (/\bautoplay\b/i.test(video)) errors.push('Tanner LIVE: el <video> trae autoplay; la transmisión sólo arranca cuando la persona toca');
  for (const attr of ['playsinline', 'muted', 'disablepictureinpicture', 'nodownload'])
    if (!new RegExp(`\\b${attr}\\b`, 'i').test(video)) errors.push(`Tanner LIVE: al <video> le falta ${attr}`);
  if (!/video\.autoplay\s*=\s*false/.test(r)) errors.push('Tanner LIVE: el reproductor debe dejar video.autoplay = false');
  if (/addTransceiver\(\s*['"]audio/.test(r)) errors.push('Tanner LIVE: el reproductor pide audio; por defecto va sin audio');
  if (!/Authorization:\s*`Bearer \$\{ticket\}`/.test(r)) errors.push('Tanner LIVE: el ticket debe ir en Authorization: Bearer (WHEP)');
  if (!/puedeDecirEnVivo\(/.test(r)) errors.push('Tanner LIVE: "En vivo" debe decidirse con puedeDecirEnVivo (la prueba nunca es en vivo)');
  const logica = fs.readFileSync('v2/live/live.js', 'utf8');
  if (!/proveedor\s*!==\s*'prueba'/.test(logica)) errors.push('Tanner LIVE: puedeDecirEnVivo dejó de excluir la señal de prueba');
  for (const f of archivos) {
    const t = fs.readFileSync(f, 'utf8');
    if (/rtsp:\/\/[a-z0-9._%-]+:[^@\s'"`]+@(?!\$\{host\})/i.test(t.replace(/USUARIO:CLAVE@/g, ''))) errors.push(`Tanner LIVE: ${f} trae una URL RTSP con credenciales`);
    if (/NEXT_PUBLIC_|import\.meta\.env|process\.env/.test(t)) errors.push(`Tanner LIVE: ${f} lee variables de entorno en el navegador; los secretos viven sólo en el servidor`);
    if (/(localStorage|sessionStorage)[^;\n]*ticket/i.test(t)) errors.push(`Tanner LIVE: ${f} guarda el ticket en el navegador`);
  }
  const familia = listar('v2/familias/live').map(f => fs.readFileSync(f, 'utf8')).join('\n');
  if (/modoPrueba\s*:\s*true/.test(familia)) errors.push('Tanner LIVE: la pantalla de familias no debe ofrecer la señal de prueba');
  return errors;
}
