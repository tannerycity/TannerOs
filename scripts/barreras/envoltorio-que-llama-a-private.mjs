// Un envoltorio public.v2_* que llama a private.* corre como definer
//
// Una barrera por archivo, a proposito: ver scripts/barreras/README.md.
//
// Caso real (09/11/2026, h82): "No pudimos abrir las solicitudes publicas."
// v2_scholarship_public_requests y v2_scholarship_public_request_update
// nacieron como `language sql` sin `security definer` y llaman a funciones de
// private que authenticated no puede ejecutar (revoke ... from authenticated).
// Resultado: "permission denied for function scholarship_public_requests_list"
// y Presidencia sin ver las becas pedidas desde Centro Tanner.
//
// El patron de la casa: el envoltorio corre como definer y la funcion privada
// revisa el permiso. Las migraciones anteriores ya estan revisadas contra la
// base (consulta en h82: ningun otro v2_* tiene el hueco), asi que la regla
// cuenta desde la migracion que lo trajo. Vale la ultima definicion: si una
// migracion posterior la corrige, ya no falla.
import fs from 'node:fs';

const DESDE = '20261109000000';

export default function comprobar() {
  const errors = [];
  const dir = 'supabase/migrations';
  const ultima = new Map();
  for (const archivo of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    if (archivo.slice(0, 14) < DESDE) continue;
    const sql = fs.readFileSync(`${dir}/${archivo}`, 'utf8').replace(/--[^\n]*/g, '');
    const re = /create\s+(?:or\s+replace\s+)?function\s+public\.([a-z0-9_]+)\s*\(([\s\S]*?)\$(\w*)\$([\s\S]*?)\$\3\$/gi;
    for (const m of sql.matchAll(re)) ultima.set(m[1].toLowerCase(), { archivo, cabeza: m[2], cuerpo: m[4] });
  }
  for (const [nombre, d] of ultima) {
    if (/security\s+definer/i.test(d.cabeza)) continue;
    const llama = [...new Set([...d.cuerpo.matchAll(/private\.([a-z0-9_]+)\s*\(/gi)].map(x => x[1]))];
    if (llama.length) errors.push(`Envoltorio sin definer: public.${nombre} (${d.archivo}) llama a private.${llama.join(', private.')} sin "security definer"; authenticated no puede ejecutar private y la pantalla falla con "permission denied"`);
  }
  return errors;
}
