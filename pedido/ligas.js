/* LIGAS FÁCILES DE LA TIENDA (28/10/2026)
 *
 * Presidencia: "subo a Instagram una foto de las gorras y necesito el link
 * directo para comprar... los links tienen que ser bien fáciles, memorables,
 * que se sepa qué estás comprando".
 *
 *   app.tannerycity.com/tienda/the-tanner-cap-wet-blue   una pieza
 *   app.tannerycity.com/tienda/kit-temporada             un kit
 *   app.tannerycity.com/tienda/gorras                    una categoría
 *
 * La pieza usa el nombre corto que ya tiene en la base (slug); el kit y la
 * categoría salen de su nombre. Por dentro la tienda sigue con sus rutas de
 * siempre (#/p/<id>): al abrir una liga bonita se traduce y listo.
 * Sin DOM: se prueba con node.
 */
import { CATEGORIAS_TIENDA } from './catalogo.js';

export const ORIGEN = 'https://app.tannerycity.com';

// "Jersey \"Black Edition\"" → "jersey-black-edition"
export function slugify(texto) {
  return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

export const slugDeProducto = p => (/^[a-z0-9][a-z0-9-]{0,79}$/.test(String(p?.slug || '')) ? p.slug : slugify(p?.name));
export const slugDeKit = k => slugify(k?.name);
// La categoría con su nombre de tienda: "Gorras" → gorras, "Ropa casual" → ropa-casual.
export const slugDeCategoria = clave => slugify((CATEGORIAS_TIENDA.find(c => c.clave === clave) || {}).etiqueta || clave);

/* De "/tienda/<algo>" a la ruta interna. Primero categorías (son pocas y
   fijas), luego piezas y kits. null si no existe: la tienda abre su portada. */
export function rutaDeLiga(pathname, catalogo = {}) {
  const m = String(pathname || '').match(/^\/tienda\/([^/?#]+)\/?$/);
  if (!m) return null;
  const s = slugify(decodeURIComponent(m[1]));
  if (!s) return null;
  const cat = CATEGORIAS_TIENDA.find(c => slugDeCategoria(c.clave) === s || c.clave === s);
  if (cat) return `#/c/${encodeURIComponent(cat.clave)}`;
  const p = (catalogo.products || []).find(x => slugDeProducto(x) === s);
  if (p) return `#/p/${encodeURIComponent(p.id)}`;
  const k = (catalogo.bundles || []).find(x => slugDeKit(x) === s);
  if (k) return `#/k/${encodeURIComponent(k.id)}`;
  return null;
}

/* La liga para compartir. Con origen (Instagram, WhatsApp…) lleva las
   etiquetas UTM para saber qué publicación vendió. Si la tienda es de otro
   club, se lleva su ?club=. */
export function ligaDe({ tipo, item, clave } = {}, { origen = ORIGEN, canal = '', campana = '', club = '' } = {}) {
  const slug = tipo === 'categoria' ? slugDeCategoria(clave) : tipo === 'kit' ? slugDeKit(item) : slugDeProducto(item);
  const q = new URLSearchParams();
  if (club) q.set('club', club);
  if (canal) {
    q.set('utm_source', canal);
    q.set('utm_medium', canal === 'whatsapp' ? 'mensaje' : 'social');
    q.set('utm_campaign', campana || slug);
  }
  const qs = q.toString();
  return `${origen}/tienda/${slug}${qs ? `?${qs}` : ''}`;
}
