/* GUÍA DE TALLAS (25/10/2026), sin DOM (se prueba con node).
 *
 * Lo estampado no tiene cambio, así que la talla es la duda número uno de la
 * familia. Presidencia: "usa medidas estándar para poder comprobarlas
 * después". Son medidas de jersey de futbol de referencia, en centímetros,
 * medidas con la prenda extendida: ancho de pecho de axila a axila y largo
 * del hombro a la orilla. Cuando el proveedor confirme las suyas, se cambian
 * aquí y en ningún otro lado (MEDIDAS_CONFIRMADAS pasa a true).
 */
export const MEDIDAS_CONFIRMADAS = false;

export const GUIA_TALLAS = {
  nino: [
    { talla: '6', edad: '5 a 6 años', pecho: 36, largo: 50 },
    { talla: '8', edad: '7 a 8 años', pecho: 39, largo: 54 },
    { talla: '10', edad: '9 a 10 años', pecho: 42, largo: 58 },
    { talla: '12', edad: '11 a 12 años', pecho: 45, largo: 62 },
    { talla: '14', edad: '13 a 14 años', pecho: 47, largo: 65 },
    { talla: '16', edad: '15 a 16 años', pecho: 49, largo: 68 },
  ],
  adulto: [
    { talla: 'XS', pecho: 47, largo: 68 },
    { talla: 'S', pecho: 50, largo: 70 },
    { talla: 'M', pecho: 53, largo: 72 },
    { talla: 'L', pecho: 56, largo: 74 },
    { talla: 'XL', pecho: 59, largo: 76 },
    { talla: 'XXL', pecho: 62, largo: 78 },
  ],
};

export const CONSEJO_TALLA = 'Mide una playera que le quede bien, de axila a axila, y compárala. Si queda entre dos tallas, pide la más grande: lo estampado no tiene cambio.';

const norm = (t) => String(t ?? '').trim().toUpperCase();

/* Qué tablas enseñar según las tallas que tiene la prenda (o el kit): sólo
   las de niño, sólo las de adulto o las dos. Una prenda de talla única no
   necesita guía. */
export function tablasPara(tallas = []) {
  const set = new Set((tallas || []).map(norm));
  const nino = GUIA_TALLAS.nino.filter((f) => set.has(f.talla));
  const adulto = GUIA_TALLAS.adulto.filter((f) => set.has(f.talla));
  return { nino, adulto, hay: nino.length + adulto.length > 1 };
}

/* La talla que se sugiere para una edad: la del rango que la incluye; de 17
   en adelante, "adulto" (no se adivina S o M: depende de la complexión). */
export function tallaPorEdad(edad) {
  const e = Number(edad);
  if (!Number.isFinite(e) || e <= 0) return null;
  if (e >= 17) return 'adulto';
  const f = GUIA_TALLAS.nino.find((x) => { const [a, b] = x.edad.match(/\d+/g).map(Number); return e >= a && e <= b; });
  return f ? f.talla : e < 5 ? '6' : null;
}
