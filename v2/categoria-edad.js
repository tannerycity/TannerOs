/* Categoría sugerida por la edad (19/11/2026, carga cognitiva fase 3).
 * Presidencia dio las edades: Baby Tanner 3-4, T6 5-6, T10 7-10, T12 11-12
 * (app.categories.min_age / max_age, que el registro recibe en categoryAges).
 * Edad cumplida al día de hoy: el niño que cumple 7 mañana todavía tiene 6. */
export function edadEnAnios(fecha, hoy = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(fecha || ''));
  if (!m) return null;
  const mes = Number(m[2]), dia = Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  let a = hoy.getFullYear() - Number(m[1]);
  if (hoy.getMonth() + 1 < mes || (hoy.getMonth() + 1 === mes && hoy.getDate() < dia)) a--;
  return a >= 0 ? a : null;
}
/* La primera categoría (en el orden del club) cuyo rango incluye la edad.
 * Un rango sin sus dos edades no cuenta. */
export function categoriaParaEdad(edad, rangos = []) {
  if (edad == null || !Number.isFinite(Number(edad))) return null;
  const r = (rangos || []).find(x => x && x.minAge != null && x.maxAge != null
    && Number.isFinite(Number(x.minAge)) && Number.isFinite(Number(x.maxAge))
    && edad >= Number(x.minAge) && edad <= Number(x.maxAge));
  return r ? r.name : null;
}
