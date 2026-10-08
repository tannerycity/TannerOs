// Una funcion interna nueva nace cerrada al visitante sin sesion
//
// Una barrera por archivo, a proposito: ver scripts/barreras/README.md.
//
// Hallazgo de QA S-01 (08/10/2026): 33 funciones internas de public las podia
// llamar el rol anon. Todas rechazaban por dentro, pero era una sola capa. La
// causa: PostgreSQL le da EXECUTE a PUBLIC (y anon lo hereda) en cada funcion
// nueva, y esas migraciones nunca se lo quitaron. La migracion
// z2_anon_fuera_de_funciones_internas cerro las 33.
//
// Quitarle EXECUTE a PUBLIC de forma global tambien cerraria las funciones de
// private que usan las politicas de fotos, asi que la regla vive aqui: toda
// migracion nueva que cree una funcion en public que NO sea un formulario
// publico (v2_public_*) tiene que quitarsela a public y anon en el mismo
// archivo. Las migraciones anteriores a z2 ya quedaron corregidas en la base.
import fs from 'node:fs';

const DESDE = '20261008132336';

export default function comprobar() {
  const errors = [];
  const dir = 'supabase/migrations';
  for (const archivo of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    if (archivo.slice(0, 14) < DESDE) continue;
    const sql = fs.readFileSync(`${dir}/${archivo}`, 'utf8').replace(/--[^\n]*/g, '');
    const creadas = [...sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.([a-z0-9_]+)\s*\(/gi)].map(m => m[1].toLowerCase());
    for (const nombre of new Set(creadas)) {
      if (nombre.startsWith('v2_public')) continue;
      const cerrada = new RegExp(`revoke\\s+(?:all|execute)(?:\\s+privileges)?\\s+on\\s+function\\s+public\\.${nombre}\\s*\\([^;]*\\)\\s+from\\s+public\\s*,\\s*anon`, 'i');
      if (!cerrada.test(sql))
        errors.push(`Seguridad: ${archivo} crea public.${nombre} y no se la quita a public y anon. `
          + `Agrega: revoke all on function public.${nombre}(...) from public, anon;`);
    }
  }
  return errors;
}
