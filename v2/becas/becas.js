/* Portal de becados: el criterio, sin DOM (scripts/qa-becas.mjs lo prueba).
 *
 * Presidencia (09/10/2026): "dónde puedo ver todos los que están becados".
 * Aquí se decide qué es una beca para la pantalla, cómo se nombra cada tipo,
 * el semáforo de asistencia contra 90% y qué beca está por vencer.
 */
export const META_BECA = 90;
export const DIAS_POR_VENCER = 60;

export const TIPOS = {
  scholarship_full: { etiqueta: 'Beca total', corta: 'Total' },
  scholarship_partial: { etiqueta: 'Beca parcial', corta: 'Parcial' },
  sponsor_funded: { etiqueta: 'Patrocinio', corta: 'Patrocinio' }
};
export const tipoDe = t => TIPOS[t] || { etiqueta: 'Apoyo', corta: 'Apoyo' };

const dinero = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

// Qué tanto cubre: 100%, 50%, $800 o "falta anotar".
export function cuantoCubre(b) {
  if (b?.calculation === 'full_waiver') return '100%';
  if (b?.percentage !== null && b?.percentage !== undefined) return `${Number(b.percentage)}%`;
  if (b?.fixedAmount !== null && b?.fixedAmount !== undefined) return dinero.format(Number(b.fixedAmount));
  return null;
}

// Semáforo contra 90%. Sin listas marcadas no hay dato: nunca se pinta rojo
// a quien nadie le ha pasado lista.
export function cumplimiento(pct, meta = META_BECA) {
  if (pct === null || pct === undefined) return { nivel: 'sindato', texto: 'Sin listas' };
  const v = Number(pct);
  if (v >= meta) return { nivel: 'ok', texto: 'Cumple' };
  if (v >= meta - 15) return { nivel: 'atencion', texto: 'Cerca' };
  return { nivel: 'bajo', texto: 'Debajo' };
}

export function vencimiento(diasRestantes) {
  if (diasRestantes === null || diasRestantes === undefined) return { nivel: 'sindato', texto: 'Sin fecha de fin' };
  const d = Number(diasRestantes);
  if (d < 0) return { nivel: 'bajo', texto: 'Vencida' };
  if (d === 0) return { nivel: 'bajo', texto: 'Vence hoy' };
  if (d <= 30) return { nivel: 'bajo', texto: `Vence en ${d} ${d === 1 ? 'día' : 'días'}` };
  if (d <= DIAS_POR_VENCER) return { nivel: 'atencion', texto: `Vence en ${d} días` };
  return { nivel: 'ok', texto: `Vence en ${d} días` };
}

export const porVencer = b => b?.daysLeft !== null && b?.daysLeft !== undefined && Number(b.daysLeft) <= DIAS_POR_VENCER;
export const debajoDeMeta = b => b?.pct !== null && b?.pct !== undefined && Number(b.pct) < META_BECA;

export const FILTROS = [
  { clave: 'todos', etiqueta: 'Todos', pasa: () => true },
  { clave: 'debajo', etiqueta: 'Debajo de 90%', pasa: debajoDeMeta },
  { clave: 'vencen', etiqueta: 'Por vencer', pasa: porVencer },
  { clave: 'scholarship_full', etiqueta: 'Total', pasa: b => b.type === 'scholarship_full' },
  { clave: 'scholarship_partial', etiqueta: 'Parcial', pasa: b => b.type === 'scholarship_partial' },
  { clave: 'sponsor_funded', etiqueta: 'Patrocinio', pasa: b => b.type === 'sponsor_funded' }
];

export function resumen(filas) {
  const l = Array.isArray(filas) ? filas : [];
  const conDato = l.filter(b => b.pct !== null && b.pct !== undefined);
  const marcadas = conDato.reduce((s, b) => s + Number(b.marked || 0), 0);
  const asistio = conDato.reduce((s, b) => s + Number(b.attended || 0), 0);
  return {
    total: l.length,
    totales: l.filter(b => b.type === 'scholarship_full').length,
    parciales: l.filter(b => b.type === 'scholarship_partial').length,
    patrocinio: l.filter(b => b.type === 'sponsor_funded').length,
    debajo: l.filter(debajoDeMeta).length,
    vencen: l.filter(porVencer).length,
    sinMotivo: l.filter(b => !b.notes).length,
    pct: marcadas ? Math.round((asistio / marcadas) * 1000) / 10 : null
  };
}

// Primero lo que hay que atender: debajo de meta (el más bajo arriba),
// luego por vencer, luego el resto por nombre.
export function ordena(filas) {
  const peso = b => (debajoDeMeta(b) ? 0 : porVencer(b) ? 1 : 2);
  return [...(filas || [])].sort((a, b) => peso(a) - peso(b)
    || (peso(a) === 0 ? Number(a.pct) - Number(b.pct) : 0)
    || (peso(a) === 1 ? Number(a.daysLeft) - Number(b.daysLeft) : 0)
    || String(a.name || '').localeCompare(String(b.name || ''), 'es'));
}
