/* MEGA MENÚ DE LA TIENDA (25/11/2026)
 *
 * Presidencia: "Mega menu on hover: 3 columns of links with icons and short
 * descriptions, plus a featured card with an image on the right."
 *
 * En la cabecera, "Comprar" abre un panel con tres columnas —Uniforme, Ropa
 * del club y Accesorios—; cada liga lleva icono, nombre y una línea que dice
 * qué hay ahí. A la derecha, una tarjeta destacada con foto: el primer banner
 * de la tienda, o si no hay, el primer kit (o pieza) con foto.
 *
 * Aquí sólo lo que decide QUÉ sale (sin DOM, se prueba con node:
 * scripts/qa-megamenu-tienda.mjs). Se dibuja en pedido/app.js.
 *
 * Igual que las pestañas: sólo salen las categorías que tienen algo, y una
 * categoría nueva que dé de alta el club cae en Accesorios con su nombre.
 */
import { CATEGORIAS_TIENDA, fotosDeKit } from './catalogo.js';
import { bannersParaTienda } from './banners.js';

export const COLUMNAS_MENU = [
  { clave: 'uniforme',   titulo: 'Uniforme',      cats: ['kits', 'jersey', 'shorts', 'socks'] },
  { clave: 'ropa',       titulo: 'Ropa del club', cats: ['outerwear', 'pants', 'casual'] },
  { clave: 'accesorios', titulo: 'Accesorios',    cats: ['gorras', 'accesorios', 'mascaras', 'calcomanias'] }
];

// Una línea por categoría: qué encuentra quien entra.
export const DESCRIPCIONES = {
  kits: 'Uniforme completo en un solo paso',
  jersey: 'Oficiales, con nombre y número',
  shorts: 'Para partido y entrenamiento',
  socks: 'Las del uniforme, todas las tallas',
  outerwear: 'Chamarras y sudaderas del club',
  pants: 'Para viajar y calentar',
  casual: 'Para traer los colores diario',
  gorras: 'Para la tribuna y la cancha',
  accesorios: 'Termos, mochilas y más',
  mascaras: 'Edición especial del club',
  calcomanias: 'Para el carro, la libreta o el termo',
  otros: 'Lo demás que vende el club'
};

// El nombre del icono (pedido/app.js tiene el dibujo de cada uno).
export const ICONOS = {
  kits: 'kit', jersey: 'jersey', shorts: 'shorts', socks: 'calceta',
  outerwear: 'chamarra', pants: 'pants', casual: 'playera',
  gorras: 'gorra', accesorios: 'mochila', mascaras: 'mascara', calcomanias: 'estrella'
};

const conocidas = new Set(CATEGORIAS_TIENDA.map(c => c.clave));

/* Las columnas con sus ligas. Sólo categorías con algo; una columna vacía no
   sale. Lo que no se reconoce va al final de Accesorios. */
export function columnasDelMenu(secciones = []) {
  const hay = new Map((secciones || []).filter(s => s?.items?.length).map(s => [s.clave, s]));
  const liga = s => ({
    clave: s.clave,
    etiqueta: s.etiqueta,
    descripcion: DESCRIPCIONES[s.clave] || `${s.items.length} ${s.items.length === 1 ? 'pieza' : 'piezas'}`,
    icono: ICONOS[s.clave] || 'estrella',
    href: `#/c/${encodeURIComponent(s.clave)}`,
    total: s.items.length
  });
  const extra = [...hay.values()].filter(s => !conocidas.has(s.clave));
  return COLUMNAS_MENU
    .map(c => ({
      clave: c.clave,
      titulo: c.titulo,
      ligas: [...c.cats.filter(k => hay.has(k)).map(k => liga(hay.get(k))), ...(c.clave === 'accesorios' ? extra.map(liga) : [])]
    }))
    .filter(c => c.ligas.length);
}

/* La tarjeta destacada. Orden: el primer banner con foto (es lo que el club
   quiere empujar), luego el primer kit con foto, luego la primera pieza con
   foto. Sin nada con foto, no hay tarjeta. `foto` es { ruta, bucket }. */
export function destacadoDelMenu({ banners = [], catalogo = {} } = {}) {
  const b = bannersParaTienda(banners, catalogo)[0];
  if (b) return {
    tipo: 'banner', titulo: String(b.title).trim(), texto: String(b.subtitle || '').trim(),
    cta: String(b.ctaLabel || '').trim() || 'Comprar', href: b.href,
    foto: { ruta: b.imageDesktopPath || b.imagePath, bucket: 'tanneros-private' }
  };
  for (const k of catalogo.bundles || []) {
    const f = fotosDeKit(k)[0];
    if (f) return { tipo: 'kit', titulo: k.name, texto: 'El uniforme completo, en un solo paso', cta: 'Ver el kit', href: `#/k/${encodeURIComponent(k.id)}`, foto: { ruta: f.ruta, bucket: f.bucket } };
  }
  for (const p of catalogo.products || []) {
    const ruta = p.photoPath || p.photoThumbPath;
    if (ruta) return { tipo: 'producto', titulo: p.name, texto: 'Lo nuevo de la tienda', cta: 'Ver la pieza', href: `#/p/${encodeURIComponent(p.id)}`, foto: { ruta, bucket: p.photoBucket || 'tanneros-private' } };
  }
  return null;
}
