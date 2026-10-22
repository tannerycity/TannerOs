// Cómo se lee un cambio de la bitácora (v2_change_log), sin pantalla.

export const TIPOS = {
  order_item_edited: 'Pieza de pedido pagado',
  order_payment_corrected: 'Cobro de pedido corregido',
  tanner_payment_refunded: 'Cobro de Tanner reembolsado',
  income_voided: 'Ingreso borrado',
  payment_edited: 'Movimiento editado',
  order_deleted: 'Pedido eliminado'
};
const CAMPOS = {
  talla: 'Talla', manga: 'Manga', nombre: 'Nombre', numero: 'Número', nota: 'Nota',
  amount: 'Monto', method: 'Método', date: 'Fecha', concept: 'Concepto', category: 'Categoría',
  payerName: 'Quién pagó', reference: 'Referencia', player: 'Tanner', status: 'Estado', total: 'Total', customer: 'Cliente', folio: 'Folio'
};
const METODOS = { cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta', other: 'Otro' };
const dinero = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 });

export function valor(campo, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (campo === 'amount' || campo === 'total') return dinero.format(Number(v));
  if (campo === 'method') return METODOS[v] || v;
  if (campo === 'numero') return `#${v}`;
  return String(v);
}

// Lo que cambió, campo por campo. Si no hay "después" (se borró o se
// reembolsó), se enseña lo que había.
export function diferencias(antes, despues) {
  const a = antes || {}, d = despues;
  if (!d) return Object.keys(CAMPOS).filter(k => a[k] !== undefined && a[k] !== null && a[k] !== '')
    .map(k => ({ campo: CAMPOS[k], antes: valor(k, a[k]), despues: null }));
  return Object.keys(CAMPOS).filter(k => (k in a || k in d) && String(a[k] ?? '') !== String(d[k] ?? ''))
    .map(k => ({ campo: CAMPOS[k], antes: valor(k, a[k]), despues: valor(k, d[k]) }));
}

export function liga(fila) {
  if (fila.orderId && fila.kind !== 'order_deleted') return `/pedidos/?pedido=${encodeURIComponent(fila.orderId)}`;
  if (fila.playerId) return `/tanner/?id=${encodeURIComponent(fila.playerId)}`;
  return null;
}
