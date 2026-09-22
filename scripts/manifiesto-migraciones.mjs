// Calcula la huella del historial de migraciones que vive en el repositorio.
//
// Sin argumentos la imprime. Con `--escribir` actualiza el manifiesto.
//
// Sirve para dos cosas:
//   1. `qa-static.mjs` la compara y falla si alguien edita o borra una
//      migración ya aplicada. El historial es historia: no se reescribe.
//   2. Se compara contra la huella que da la base de datos —la consulta está
//      en supabase/tests/99_el_repositorio_tiene_todas_las_migraciones.sql—
//      para saber si producción se adelantó al repositorio.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const DIR = 'supabase/migrations';
export function huellaDelHistorial() {
  const archivos = fs.readdirSync(DIR)
    .filter(f => /^\d{14}_.*\.sql$/.test(f))
    .sort();
  const h = crypto.createHash('md5');
  let bytes = 0;
  for (const f of archivos) {
    const b = fs.readFileSync(path.join(DIR, f));
    h.update(b);
    bytes += b.length;
  }
  return { migraciones: archivos.length, bytes, huella: h.digest('hex'),
           primera: archivos[0] || null, ultima: archivos.at(-1) || null };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = huellaDelHistorial();
  if (process.argv.includes('--escribir')) {
    fs.writeFileSync('supabase/migrations/MANIFIESTO.json',
      JSON.stringify({ ...r, verificadoContraLaBase: new Date().toISOString().slice(0,10) }, null, 2) + '\n');
    console.log('Manifiesto actualizado');
  }
  console.log(JSON.stringify(r, null, 2));
}
