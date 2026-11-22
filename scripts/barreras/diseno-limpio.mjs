// Diseño limpio: que no se vuelva a ensuciar (22/11/2026)
//
// Una barrera por archivo, a proposito: ver scripts/barreras/README.md.
//
// Presidencia: "que el diseño sea impecable... estilo Apple", y antes: "no me
// gusta que se vean pinches botones así verdes". La Fase 1 subio 761 letras
// chiquitas a 12 px y cambio 111 verdes de sistema por el azul noche del club.
// Esto vigila que no regresen, y que lo demas solo pueda bajar:
//   1. Ninguna letra por debajo de 11 px en v2/ ni en la visoria publica.
//   2. Ningun verde brillante de sistema (los de boton). El verde de WhatsApp
//      (#25d366) y los verdes oscuros de texto de "Pagado" si se permiten.
//   3. Ventanitas del navegador (prompt/confirm/alert): el numero solo baja.
//      La meta es cero: hojas del club con el motivo ya escrito.
//   4. Colores distintos en los estilos: el numero solo baja. Hoy hay
//      demasiados; cada PR que limpie, que baje este tope.
import fs from 'node:fs';
import path from 'node:path';

const MAX_VENTANITAS = 7;
const MAX_COLORES = 488;
// Dibujos en miniatura (el parche y la playera chica de la ficha): ahi la letra
// es parte del dibujo, no texto para leer.
const DIBUJOS = /par-dibujo\.chico small|profile-row-card small/;
const VERDES = /#(169b4b|15964a|128c4a|159c4c|1f9d55|34c759|30b45a|16a36f|1f9d5b|30d158|16a34a|22c55e)\b/i;

function archivos(dir, ext, fuera = []) {
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n), s = fs.statSync(p);
    if (s.isDirectory()) archivos(p, ext, fuera); else if (ext.test(n)) fuera.push(p);
  }
  return fuera;
}

export default function comprobar() {
  const errors = [];
  const estilos = [...archivos('v2', /\.css$/), ...archivos('visoria', /\.css$/)];
  const codigo = [...archivos('v2', /\.js$/), ...archivos('visoria', /\.js$/)];
  const colores = new Set();
  let ventanitas = 0;

  for (const f of [...estilos, ...codigo]) {
    const t = fs.readFileSync(f, 'utf8');
    for (const m of t.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) {
      if (DIBUJOS.test(t.slice(Math.max(0, m.index - 80), m.index))) continue;
      if (Number(m[1]) < 11) errors.push(`Diseño: letra de ${m[1]} px en ${f} (minimo 11, mejor 12)`);
    }
    const v = t.match(VERDES);
    if (v) errors.push(`Diseño: verde de sistema ${v[0]} en ${f}; usa el azul noche del club (#0b2a33)`);
    if (f.endsWith('.css')) for (const m of t.matchAll(/#([0-9a-f]{6})\b/gi)) colores.add(m[1].toLowerCase());
    if (f.endsWith('.js') && f.startsWith('v2')) ventanitas += (t.match(/(^|[^a-zA-Z.$_])(prompt|confirm|alert)\(/g) || []).length;
  }
  if (ventanitas > MAX_VENTANITAS)
    errors.push(`Diseño: ${ventanitas} ventanitas del navegador (prompt/confirm/alert), el tope es ${MAX_VENTANITAS}; usa tosConfirm/tosPrompt`);
  if (colores.size > MAX_COLORES)
    errors.push(`Diseño: ${colores.size} colores distintos en los estilos, el tope es ${MAX_COLORES}; reutiliza los del club`);
  return errors;
}
