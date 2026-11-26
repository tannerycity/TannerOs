/* Gráficas del dinero (25/11/2026, h102), sin pantalla: se prueba con node.
 * Presidencia: "saber a quién se le pagó más... deudas por categorías,
 * ingresos por categorías, uniformes, cuándo se le pagó a tales proveedores".
 * Reglas: sin datos no hay número inventado; las barras van contra el mayor
 * de su lista; el adeudo es el de hoy (no depende del periodo). */

export const PERIODOS = Object.freeze([
  { k: 'mes', t: 'Este mes' }, { k: 'tres', t: '3 meses' }, { k: 'anio', t: 'Este año' }, { k: 'todo', t: 'Todo' },
]);

const pad = (n) => String(n).padStart(2, '0');
export function rangoDe(k, hoyIso) {
  const [a, m] = String(hoyIso).slice(0, 10).split('-').map(Number);
  const hasta = String(hoyIso).slice(0, 10);
  if (k === 'mes') return { desde: `${a}-${pad(m)}-01`, hasta };
  if (k === 'tres') { const d = new Date(Date.UTC(a, m - 3, 1)); return { desde: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`, hasta }; }
  if (k === 'anio') return { desde: `${a}-01-01`, hasta };
  return { desde: null, hasta };
}

// Cada renglón con su % contra el mayor (para el ancho de la barra).
export function barras(lista, { tope = 12 } = {}) {
  const xs = (lista || []).map((x) => ({ ...x, total: Number(x.total || 0) })).filter((x) => x.total > 0).sort((a, b) => b.total - a.total);
  const max = xs[0]?.total || 0;
  const vis = xs.slice(0, tope).map((x) => ({ ...x, pct: max ? Math.max(2, Math.round((x.total / max) * 100)) : 0 }));
  const resto = xs.slice(tope);
  return { filas: vis, resto: resto.length ? { n: resto.length, total: resto.reduce((s, x) => s + x.total, 0) } : null, suma: xs.reduce((s, x) => s + x.total, 0) };
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
export const etiquetaMes = (ym) => { const [a, m] = String(ym).split('-').map(Number); return MESES[m - 1] ? `${MESES[m - 1]} ${String(a).slice(2)}` : String(ym); };

// Nómina: una fila por persona, una columna por mes, ordenada por lo pagado.
export function tablaNomina(rows) {
  const meses = [...new Set((rows || []).map((r) => r.mes))].sort();
  const por = new Map();
  for (const r of rows || []) {
    const f = por.get(r.name) || { name: r.name, valores: {}, total: 0 };
    f.valores[r.mes] = (f.valores[r.mes] || 0) + Number(r.total || 0);
    f.total += Number(r.total || 0);
    por.set(r.name, f);
  }
  return { meses, filas: [...por.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'es')) };
}

export const filtraTipo = (lista, tipo) => (lista || []).filter((x) => tipo === 'todos' || x.kind === tipo);
export const ETIQUETA_TIPO = { staff: 'Staff', proveedor: 'Proveedor', otro: 'Otro' };

// Uniformes: lo que entró contra lo que se le pagó al proveedor.
export function uniformes(u) {
  const entro = Number(u?.entro || 0), pagado = Number(u?.pagadoProveedor || 0);
  return { entro, pagado, queda: entro - pagado, pctPagado: entro ? Math.round((pagado / entro) * 100) : null };
}

/* Desglose (h103): al picarle a una barra se ven sus renglones. */
export const DIMENSIONES = Object.freeze({
  grBenef: 'beneficiario', grEgCat: 'egresoCategoria', grIngTipo: 'ingresoTipo', grIngCat: 'ingresoCategoria',
  grDeuCat: 'adeudoCategoria', grDeuTipo: 'adeudoTipo',
});
export const esAdeudo = (dim) => dim === 'adeudoCategoria' || dim === 'adeudoTipo';
const METODOS = { cash: 'Efectivo', efectivo: 'Efectivo', transfer: 'Transferencia', transferencia: 'Transferencia', card: 'Tarjeta', tarjeta: 'Tarjeta', other: 'Otro', otro: 'Otro' };
export const metodo = (m) => METODOS[String(m || '').toLowerCase()] || (m ? String(m) : '');

// Lo que va arriba del desglose: cuántos, total y promedio.
export function resumenDetalle(rows, dim) {
  const xs = rows || [];
  const total = xs.reduce((s, r) => s + (Number(esAdeudo(dim) ? r.saldo : r.monto) || 0), 0);
  return { n: xs.length, total, promedio: xs.length ? Math.round(total / xs.length) : 0 };
}

// Los renglones por mes, para la mini gráfica del desglose (en orden).
export function porMes(rows) {
  const m = new Map();
  for (const r of rows || []) { const k = String(r.fecha || '').slice(0, 7); if (k) m.set(k, (m.get(k) || 0) + Number(r.monto || 0)); }
  const xs = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([mes, total]) => ({ mes, total }));
  const max = Math.max(0, ...xs.map((x) => x.total));
  return xs.map((x) => ({ ...x, pct: max ? Math.max(4, Math.round((x.total / max) * 100)) : 0 }));
}

// Contar hacia arriba con freno al final (para los números grandes).
export const suaviza = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/* SEMANA POR SEMANA (25/11/2026). Presidencia: "que en los pagos viniera la
 * fecha de pago, así nos damos cuenta si nos faltó pagarle una semana".
 * Semanas de lunes a domingo, desde la primera con pago (o el inicio del
 * periodo, si es posterior) hasta la semana pasada: la semana en curso
 * todavía no cuenta como faltante. Una semana con dos pagos se marca para
 * revisar (puede ser un pago doble o una semana atrasada). */
const DIA = 86400000;
const aDia = (iso) => { const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number); return Date.UTC(a, m - 1, d); };
const aIso = (t) => new Date(t).toISOString().slice(0, 10);
export const lunesDe = (iso) => { const t = aDia(iso); const dow = (new Date(t).getUTCDay() + 6) % 7; return aIso(t - dow * DIA); };
export function semanasDePago(rows, { desde = null, hasta = null, hoy = null } = {}) {
  const pagos = (rows || []).filter((r) => r.fecha).map((r) => ({ fecha: String(r.fecha).slice(0, 10), monto: Number(r.monto || 0), concepto: r.concepto || '' }));
  if (!pagos.length) return { semanas: [], faltan: [], dobles: [] };
  const primera = pagos.reduce((m, p) => (p.fecha < m ? p.fecha : m), pagos[0].fecha);
  const ini = lunesDe(desde && desde > primera ? desde : primera);
  const tope = [hasta, hoy].filter(Boolean).sort()[0] || pagos.reduce((m, p) => (p.fecha > m ? p.fecha : m), primera);
  const enCurso = hoy ? lunesDe(hoy) : null;
  const semanas = [];
  for (let t = aDia(ini); t <= aDia(tope) && semanas.length < 60; t += 7 * DIA) {
    const lunes = aIso(t), domingo = aIso(t + 6 * DIA);
    const deLa = pagos.filter((p) => p.fecha >= lunes && p.fecha <= domingo).sort((a, b) => a.fecha.localeCompare(b.fecha));
    semanas.push({ lunes, domingo, pagos: deLa, total: deLa.reduce((s, p) => s + p.monto, 0), enCurso: lunes === enCurso });
  }
  return { semanas, faltan: semanas.filter((s) => !s.pagos.length && !s.enCurso), dobles: semanas.filter((s) => s.pagos.length > 1) };
}
