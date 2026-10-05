// TannerOS no usa emojis
//
// Una barrera por archivo, a proposito: ver scripts/barreras/README.md.
//
// Regla del club (Presidencia, 05/10/2026): nada de emojis en la app. Se
// colaron en Mensajes (iconos de areas, ojo, campana), en los cumpleanos de
// Inicio y del portal, en Captacion, en la ficha del Tanner, en Taquilla y en
// el texto para compartir del registro. Cada uno se cambio por un icono de
// linea (el mismo trazo del menu) o por texto.
//
// Revisa todo lo que se sirve: v2/ completo y las paginas de la raiz que usa
// la app. Los dos tableros viejos tcfc-*.html no se sirven desde ninguna
// pantalla y quedan fuera. Simbolos de texto como ✓, ✕, →, ·, × no son emoji
// y se permiten.
import fs from 'node:fs';
import path from 'node:path';

const EMOJI = /\p{Extended_Pictographic}/u;
const RAIZ = ['index.html', 'public-form.js', 'public-form.css', 'polish.css', 'icons.css'];

function archivos(dir) {
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) out.push(...archivos(p));
    else if (/\.(js|html|css)$/.test(f)) out.push(p);
  }
  return out;
}

export default function comprobar() {
  const errors = [];
  const lista = [...archivos('v2'), ...RAIZ.filter(f => fs.existsSync(f))];
  for (const f of lista) {
    fs.readFileSync(f, 'utf8').split('\n').forEach((linea, i) => {
      const m = linea.match(EMOJI);
      if (m) errors.push(`Sin emojis: ${f}:${i + 1} trae "${m[0]}". Usa un icono de linea (SVG) o texto`);
    });
  }
  return errors;
}
