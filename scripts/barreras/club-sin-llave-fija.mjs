// La llave pública de Tannery vive en un solo lugar
//
// Una barrera por archivo, a proposito: ver scripts/barreras/README.md.
//
// Las paginas publicas (registro, programas, academias, tienda, Centro
// Tanner, aviso de privacidad) tenian escrita la llave de Tannery. Con el
// portal de la plataforma (10/10/2026) entran otros clubes: una liga de
// registro de otro club habria inscrito a sus ninos en Tannery. La llave sale
// de la liga (?club=<slug>) con llaveDeLiga() de v2/club-publico.js, que es el
// unico archivo que puede nombrarla (para los QR viejos, sin ?club=).
import fs from 'node:fs';
import path from 'node:path';

const LLAVE = '1850TC1850';
const PERMITIDO = 'v2/club-publico.js';
const FUERA = new Set(['node_modules', 'dist', 'scripts', 'supabase', 'docs', '.git', '.github']);

function archivos(dir) {
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    if (FUERA.has(f) || f.startsWith('.')) continue;
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) out.push(...archivos(p));
    else if (/\.(js|html|ts)$/.test(f)) out.push(p);
  }
  return out;
}

export default function comprobar() {
  const errors = [];
  for (const f of archivos('.')) {
    const rel = f.split(path.sep).join('/').replace(/^\.\//, '');
    if (rel === PERMITIDO || rel.startsWith('v2/qa/')) continue;
    fs.readFileSync(f, 'utf8').split('\n').forEach((linea, i) => {
      if (linea.includes(LLAVE))
        errors.push(`Llave fija: ${rel}:${i + 1} trae la llave de Tannery. Usa llaveDeLiga() de ${PERMITIDO}`);
    });
  }
  return errors;
}
