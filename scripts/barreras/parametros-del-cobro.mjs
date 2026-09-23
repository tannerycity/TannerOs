// Los parametros del cobro y del pago no se pierden en un merge
//
// Una barrera por archivo, a proposito: ver scripts/barreras/README.md.
//
//
// Dos ramas distintas le agregaron campos a la MISMA llamada: una
// collected_by_name (quien del club cobro), la otra expected_amount y
// observations (el monto esperado y las notas). Al resolver ese conflicto es
// facilisimo quedarse con un solo lado.
//
// Y ahi esta el problema: quedarse con un lado NO falla nada. La pantalla
// sigue cobrando, el pago se guarda, y lo unico que pasa es que el dato del
// lado perdido deja de escribirse. En silencio. Para siempre. Nadie se entera
// hasta que alguien pregunta "y quien cobro esto" seis meses despues.
//
// La funcion en la base acepta todos estos parametros. Si la llamada manda
// uno menos, ese dato ya no existe.
//
// Se mira DENTRO de cada llamada, no en el archivo entero: contar en todo el
// fichero dejaria que otra llamada tape justo la que se rompio.
import fs from 'node:fs';

const VIGILADAS = [
  { archivo: 'v2/taquilla/app.js', rpc: 'v2_post_payment',
    exigidos: ['collected_by_name', 'expected_amount', 'observations', 'idempotency_key'] },
  { archivo: 'v2/taquilla/app.js', rpc: 'v2_post_expense',
    exigidos: ['supplier_name', 'paid_by_name', 'idempotency_key'] },
  { archivo: 'v2/contabilidad/app.js', rpc: 'v2_post_expense',
    exigidos: ['supplier_name', 'idempotency_key'] }
];

export default function comprobar() {
  const errors = [];
  for (const v of VIGILADAS) {
    if (!fs.existsSync(v.archivo)) {
      errors.push(`Cobro: falta ${v.archivo}`);
      continue;
    }
    const fuente = fs.readFileSync(v.archivo, 'utf8');
    const marca = `rpc('${v.rpc}'`;
    const desde = fuente.indexOf(marca);
    if (desde < 0) {
      errors.push(`Cobro: ${v.archivo} ya no llama a ${v.rpc}`);
      continue;
    }
    const cierre = fuente.indexOf('});', desde);
    const llamada = fuente.slice(desde, cierre < 0 ? desde + 1200 : cierre);
    for (const param of v.exigidos) {
      if (!llamada.includes(`${param}:`))
        errors.push(`Cobro: la llamada a ${v.rpc} en ${v.archivo} ya no manda ${param}. `
          + 'Ese dato deja de guardarse sin que nada falle');
    }
  }
  return errors;
}
