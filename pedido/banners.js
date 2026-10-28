/* BANNERS DE LA TIENDA (28/10/2026, h49)
 *
 * Presidencia: "unos banners publicitarios que estén scrolleando, como las
 * páginas de adidas, Puma, Nike, para que vean todo lo nuevo, si hay
 * promociones". Arriba de la tienda pasan solos; cada uno lleva a una pieza,
 * un kit, una categoría o la tienda. Arriba de todo, una franja de anuncio.
 *
 * Aquí sólo la parte sin DOM (a dónde lleva cada uno, cuáles se enseñan), para
 * probarla con node. El carrusel vive en pedido/app.js.
 */
import { CATEGORIAS_TIENDA } from './catalogo.js';

export const CADA_MS = 5000; // Cada cuánto pasa al siguiente.

/* A dónde lleva. Si la pieza o el kit ya no se vende, a la portada: un
   banner viejo nunca debe abrir una ficha vacía. */
export function destinoDe(b, catalogo = {}) {
  const v = String(b?.targetValue || '');
  if (b?.targetKind === 'producto' && (catalogo.products || []).some(p => String(p.id) === v)) return `#/p/${encodeURIComponent(v)}`;
  if (b?.targetKind === 'kit' && (catalogo.bundles || []).some(k => String(k.id) === v)) return `#/k/${encodeURIComponent(v)}`;
  if (b?.targetKind === 'categoria' && CATEGORIAS_TIENDA.some(c => c.clave === v)) return `#/c/${encodeURIComponent(v)}`;
  return '#/';
}

/* Los que se enseñan: con foto, en su orden, con su destino ya resuelto. */
export function bannersParaTienda(lista = [], catalogo = {}) {
  return (Array.isArray(lista) ? lista : [])
    .filter(b => b && b.imagePath && String(b.title || '').trim())
    .map(b => ({ ...b, href: destinoDe(b, catalogo) }));
}

/* Cómo se dice el destino en el Catálogo: "Abre: Jersey Black Edition". */
export function textoDestino(b, { products = [], bundles = [] } = {}) {
  if (b?.targetKind === 'producto') return products.find(p => String(p.id) === String(b.targetValue))?.name || 'Una pieza que ya no está';
  if (b?.targetKind === 'kit') return bundles.find(k => String(k.id) === String(b.targetValue))?.name || 'Un kit que ya no está';
  if (b?.targetKind === 'categoria') return CATEGORIAS_TIENDA.find(c => c.clave === b.targetValue)?.etiqueta || 'Una categoría';
  return 'La tienda';
}
