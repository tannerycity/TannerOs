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
//
// O en la migracion que sigue (22/10/2026): un archivo aplicado no se edita
// (su texto tiene que ser identico a lo que corrio en la base). Si el cierre
// se hizo dentro de un ciclo (format('revoke ...')), la siguiente migracion
// lo deja escrito y cuenta.
//
// Y una que YA nacio cerrada (09/11/2026): `create or replace` sobre una
// funcion que existe conserva sus permisos (PostgreSQL no se los regresa a
// PUBLIC), asi que si una migracion anterior ya se la quito a public y anon y
// este archivo no la borra (drop function), sigue cerrada. Caso real: h74
// reescribio v2_punctuality_status (cerrada en h64) y v2_portal_punctuality
// (cerrada en h67); en la base anon sigue sin EXECUTE.
import fs from 'node:fs';

const DESDE = '20261008132336';

export default function comprobar() {
  const errors = [];
  const dir = 'supabase/migrations';
  const archivos = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  const textoDe = archivo => fs.readFileSync(`${dir}/${archivo}`, 'utf8').replace(/--[^\n]*/g, '');
  for (const [i, archivo] of archivos.entries()) {
    if (archivo.slice(0, 14) < DESDE) continue;
    const sql = textoDe(archivo);
    const creadas = [...sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.([a-z0-9_]+)\s*\(/gi)].map(m => m[1].toLowerCase());
    // Un revoke puede cerrar varias funciones a la vez:
    //   revoke all on function public.a(uuid), public.b(uuid, text) from public, anon;
    // Cuenta cada public.<nombre>( que aparezca en la lista de uno de esos revoke.
    const cerradas = new Set();
    const revocadas = texto => [...texto.matchAll(/revoke\s+(?:all|execute)(?:\s+privileges)?\s+on\s+function\s+([^;]*?)\s+from\s+public\s*,\s*anon/gi)]
      .flatMap(m => [...m[1].matchAll(/public\.([a-z0-9_]+)\s*\(/gi)].map(f => f[1].toLowerCase()));
    const borradas = new Set([...sql.matchAll(/drop\s+function\s+(?:if\s+exists\s+)?public\.([a-z0-9_]+)/gi)].map(m => m[1].toLowerCase()));
    for (const previo of archivos.slice(0, i))
      for (const n of revocadas(textoDe(previo))) if (!borradas.has(n)) cerradas.add(n);
    const siguiente = archivos[i + 1] ? textoDe(archivos[i + 1]) : '';
    for (const texto of [sql, siguiente])
      for (const m of texto.matchAll(/revoke\s+(?:all|execute)(?:\s+privileges)?\s+on\s+function\s+([^;]*?)\s+from\s+public\s*,\s*anon/gi))
        for (const f of m[1].matchAll(/public\.([a-z0-9_]+)\s*\(/gi)) cerradas.add(f[1].toLowerCase());
    for (const nombre of new Set(creadas)) {
      if (nombre.startsWith('v2_public')) continue;
      if (!cerradas.has(nombre))
        errors.push(`Seguridad: ${archivo} crea public.${nombre} y no se la quita a public y anon. `
          + `Agrega: revoke all on function public.${nombre}(...) from public, anon;`);
    }
  }
  return errors;
}
