/* Costos por tipo de cliente (19/10/2026). Sin DOM, para probarlo en Node
 * (qa-costos).
 *
 * "Lo que más compran es el kit de niño… pero tú me das la utilidad del
 * adulto." La pestaña Costos calculaba el margen sólo con el precio de
 * adulto: el Kit Temporada se veía en 50% y de niño deja 30%. Aquí se calcula
 * cada uno y, con lo que de verdad se vendió, el margen real ponderado.
 *
 * El costo es el mismo para niño y adulto (así lo cobra el proveedor), así que
 * sólo cambia el precio. */

export const margenDe = (precio, costo) =>
  Number(precio) > 0 && costo != null && costo !== '' ? (Number(precio) - Number(costo)) / Number(precio) * 100 : null;

// Lo que deja cada versión de un producto o un kit, dado su costo.
export function margenesDe({ precioAdulto, precioNino, costo }) {
  const una = (precio) => {
    const p = Number(precio || 0);
    if (!(p > 0) || costo == null) return null;
    return { precio: p, margen: margenDe(p, costo), ganas: p - Number(costo) };
  };
  return { adulto: una(precioAdulto), nino: una(precioNino) };
}

// ¿Esta pieza de un pedido se vendió como de niño o de adulto?
// Los kits lo traen escrito (bundleTier); los pedidos migrados, en "tipo"; una
// pieza suelta se reconoce por el precio que se cobró.
export function tipoDeLinea(item, producto = null) {
  const a = item?.attributes || {};
  const dicho = String(a.bundleTier || a.tipo || '').toLowerCase();
  if (/ni[nñ]o/.test(dicho)) return 'nino';
  if (/adulto/.test(dicho)) return 'adulto';
  const kid = Number(producto?.priceKid || 0), adulto = Number(producto?.price || 0);
  const cobrado = Number(item?.unitPrice ?? item?.unit_price ?? 0);
  if (kid > 0 && adulto > kid && cobrado > 0) return Math.abs(cobrado - kid) <= Math.abs(cobrado - adulto) ? 'nino' : 'adulto';
  return null;   // pieza de un solo precio (calcetas, gorra): no cuenta para la mezcla
}

// De lo que se vendió con dos precios, qué parte fue de niño (por dinero).
export function mezclaDeVentas(lineas, productosPorId = {}) {
  let nino = 0, adulto = 0, piezas = 0;
  for (const it of lineas || []) {
    const tipo = tipoDeLinea(it, productosPorId[it?.productId || it?.product_id]);
    if (!tipo) continue;
    const venta = Number(it.unitPrice ?? it.unit_price ?? 0) * Number(it.quantity || 1);
    if (tipo === 'nino') nino += venta; else adulto += venta;
    piezas += Number(it.quantity || 1);
  }
  const total = nino + adulto;
  return { nino: total ? nino / total : null, piezas, venta: total };
}

// El margen real, pesado por lo que se vende. Sin mezcla, null: no se inventa.
export function margenPonderado(m, partNino) {
  if (partNino == null) return null;
  if (m.nino && m.adulto) return m.nino.margen * partNino + m.adulto.margen * (1 - partNino);
  return (m.nino || m.adulto)?.margen ?? null;
}

// El precio que deja cierto margen: costo ÷ (1 − margen).
export const precioParaMargen = (costo, margenPct) =>
  costo != null && margenPct < 100 ? Math.ceil(Number(costo) / (1 - margenPct / 100)) : null;
