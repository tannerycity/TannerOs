// El nombre del club no se escribe a mano
//
// Una barrera por archivo, a proposito: ver scripts/barreras/README.md.
//
// TannerOS se vende a varios clubes (portal de la plataforma, 10/10/2026).
// Habia "Tannery City" escrito en mensajes a familias, PDFs, etiquetas y en el
// correo de invitacion: un club nuevo habria mandado WhatsApps firmados por
// otro club. El nombre sale del contexto con nombreDelClub() de v2/club.js, o
// de data-brand-name en el HTML.
//
// Excepciones, una por una y con su razon:
// - v2/index.html (y la raiz): la pantalla de entrada se ve antes de saber el
//   club; sigue con la marca de Tannery mientras la app viva en
//   app.tannerycity.com. Cuando haya dominio neutro se cambia y se quita de aqui.
// - v2/admin/centro-tanner/app.js: los ambitos tannery_city / tannery_city_park
//   son del Centro Tanner, el reglamento propio de Tannery.
// - Comentarios: describen la historia, no los ve nadie.
import fs from 'node:fs';
import path from 'node:path';

const PERMITIDOS = new Set(['v2/index.html', 'v2/admin/centro-tanner/app.js']);
const NOMBRE = /Tannery City|de Tannery\b/;

function archivos(dir) {
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { if (p !== path.join('v2', 'qa')) out.push(...archivos(p)); }
    else if (/\.(js|html)$/.test(f)) out.push(p);
  }
  return out;
}

export default function comprobar() {
  const errors = [];
  for (const f of archivos('v2')) {
    if (PERMITIDOS.has(f.split(path.sep).join('/'))) continue;
    // Quita comentarios de bloque (aunque abarquen varias lineas) y de linea
    // completa; lo que queda es lo que se pinta o se manda.
    const sinBloques = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
      .replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '));
    sinBloques.split('\n').forEach((linea, i) => {
      if (linea.trim().startsWith('//')) return;
      if (NOMBRE.test(linea))
        errors.push(`Nombre del club fijo: ${f}:${i + 1} trae "Tannery". Usa nombreDelClub(ctx) de v2/club.js o data-brand-name`);
    });
  }
  return errors;
}
