/* EL CARRITO QUE NO SE PIERDE (27/10/2026), sin DOM (se prueba con node).
 *
 * Presidencia: "cuando se agrega el producto al carrito ya no puedo volver a
 * verlo, hasta que agregue otro producto... que sea bien dinámico". Y la
 * pregunta: "¿tenemos algún wishlist?". No había: el carrito vivía sólo en
 * la memoria de la pestaña (recargar lo borraba) y no había dónde guardar
 * algo para después.
 *   - El carrito se guarda en el teléfono y regresa al volver, pero sólo con
 *     lo que la tienda todavía vende.
 *   - La cantidad se cambia desde el carrito, sin regresar a la ficha.
 *   - "Guardados": el corazón de cada producto, para comprarlo después.
 */
const MAX_DIAS = 14;

export function serializaCarrito(carrito, ahora = Date.now()) {
  return JSON.stringify({ v: 1, at: ahora, lineas: carrito || {} });
}

/* Regresa el carrito guardado, sin lo que ya no existe en la tienda y sin
   carritos viejos (dos semanas: los precios pudieron cambiar). */
export function restauraCarrito(texto, catalogo, ahora = Date.now()) {
  let d;
  try { d = JSON.parse(texto || ''); } catch { return {}; }
  if (!d || d.v !== 1 || typeof d.lineas !== 'object' || !d.lineas) return {};
  if (!(ahora - Number(d.at || 0) < MAX_DIAS * 86400000)) return {};
  const productos = new Set((catalogo?.products || []).map(p => String(p.id)));
  const kits = new Set((catalogo?.bundles || []).map(k => String(k.id)));
  const fuera = {};
  for (const [llave, l] of Object.entries(d.lineas)) {
    if (!l || typeof l !== 'object') continue;
    const vive = l.kind === 'bundle' ? kits.has(String(l.bundleId)) : productos.has(String(l.productId));
    if (vive && Number(l.cantidad) > 0 && Number.isFinite(Number(l.precioUnitario))) fuera[llave] = l;
  }
  return fuera;
}

/* + y − desde el carrito. Llegar a 0 lo quita; el tope es 20, como al
   agregar. Un kit no cambia de cantidad: son las tallas de una persona. */
export function cambiaCantidadEnCarrito(carrito, llave, delta) {
  const l = carrito?.[llave];
  if (!l) return carrito;
  const copia = { ...carrito };
  const nueva = Math.min(20, Number(l.cantidad || 1) + Number(delta || 0));
  if (nueva <= 0) { delete copia[llave]; return copia; }
  copia[llave] = { ...l, cantidad: nueva, total: Math.round(Number(l.precioUnitario || 0) * nueva * 100) / 100 };
  return copia;
}
export const cambiaCantidad = (l) => !!l && l.kind !== 'bundle';

/* Guardados: una lista corta de ids ("p:<id>" o "k:<id>"), lo más nuevo
   primero. */
export function alternaGuardado(lista, id) {
  const l = Array.isArray(lista) ? lista.filter(Boolean).map(String) : [];
  const k = String(id);
  return l.includes(k) ? l.filter(x => x !== k) : [k, ...l].slice(0, 40);
}
export function guardadosVivos(lista, catalogo) {
  const productos = new Map((catalogo?.products || []).map(p => [`p:${p.id}`, { tipo: 'p', item: p }]));
  const kits = new Map((catalogo?.bundles || []).map(k => [`k:${k.id}`, { tipo: 'k', item: k }]));
  return (Array.isArray(lista) ? lista : []).map(id => productos.get(String(id)) || kits.get(String(id))).filter(Boolean);
}
