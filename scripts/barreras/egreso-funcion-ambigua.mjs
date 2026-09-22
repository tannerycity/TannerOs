// Llamadas a una funcion que vive duplicada en la base
//
// Una barrera por archivo, a proposito: ver scripts/barreras/README.md.
//
//
// public.v2_post_expense existe DOS veces: con 9 argumentos y con 10, y el
// decimo (supplier_name) tiene DEFAULT NULL. Llamarla sin ese argumento encaja
// con las dos y Postgres se niega:
//   "Could not choose the best candidate function between: ..."
//
// Taquilla llamaba sin el y registrar un egreso era imposible; Contabilidad si
// lo mandaba y por eso ahi si funcionaba. Mientras la duplicada siga en la
// base, mandarlo es obligatorio: no es un dato opcional, es lo que desambigua.
//
// Se mira DENTRO de la llamada, no en el archivo entero: la primera version de
// esta comprobacion contaba supplier_name en todo el fichero, se comia las
// ocurrencias de otras llamadas y no habria cazado nada.
//
// La limpieza de fondo —borrar la version de 9— queda propuesta y sin aplicar
// en supabase/propuestas/. En cuanto se aplique, esta comprobacion sobra.
import fs from 'node:fs';

export default function comprobar() {
  const errors = [];
  for (const archivo of ['v2/taquilla/app.js','v2/contabilidad/app.js']) {
    const fuente = fs.readFileSync(archivo,'utf8');
    let desde = 0;
    for (;;) {
      const i = fuente.indexOf("rpc('v2_post_expense'", desde);
      if (i < 0) break;
      const cierre = fuente.indexOf('});', i);
      const llamada = fuente.slice(i, cierre < 0 ? i + 800 : cierre);
      if (!/supplier_name\s*:/.test(llamada))
        errors.push(`${archivo}: llama a v2_post_expense sin supplier_name. `
          + 'La funcion esta duplicada en la base y la llamada sale ambigua');
      desde = i + 1;
    }
  }
  return errors;
}
