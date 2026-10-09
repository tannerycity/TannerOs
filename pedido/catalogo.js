/* El catálogo de la tienda pública, sin DOM.
 *
 * Presidencia (09/10/2026): "entrar y ver literal una tienda en línea", con
 * fotos, separada por categorías (kits, jerseys, shorts, accesorios,
 * máscaras, calcomanías...). Aquí vive lo que decide QUÉ se ve y en qué
 * orden; app.js sólo lo dibuja. scripts/qa-tienda-publica.mjs lo prueba.
 *
 * Las categorías salen de los datos (products.category), no de una lista fija:
 * el día que el club dé de alta "calcomanías", la pestaña aparece sola. La
 * lista de abajo sólo pone nombre bonito y orden a las que ya conocemos.
 */
export const CATEGORIAS_TIENDA = [
  { clave: 'kits',        etiqueta: 'Kits',        patron: null },
  { clave: 'jersey',      etiqueta: 'Jerseys',     patron: /\b(jersey|jerseys|playera|uniforme)\b/ },
  { clave: 'shorts',      etiqueta: 'Shorts',      patron: /\b(short|shorts)\b/ },
  { clave: 'pants',       etiqueta: 'Pants',       patron: /\b(pants|pantalon)\b/ },
  { clave: 'outerwear',   etiqueta: 'Chamarras',   patron: /\b(outerwear|hoodie|sudadera|chamarra)\b/ },
  { clave: 'socks',       etiqueta: 'Calcetas',    patron: /\b(socks|sock|calceta|calcetas)\b/ },
  { clave: 'accesorios',  etiqueta: 'Accesorios',  patron: /\b(accesorio|accesorios|accessory|accessories|gorra|termo|mochila|balon)\b/ },
  { clave: 'mascaras',    etiqueta: 'Máscaras',    patron: /\b(mascara|mascaras|mask|masks)\b/ },
  { clave: 'calcomanias', etiqueta: 'Calcomanías', patron: /\b(calcomania|calcomanias|sticker|stickers)\b/ }
];

const normal = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/* La categoría de tienda de un producto. Lo que no se reconoce conserva su
   propio nombre (con mayúscula) en vez de esconderse en "Otros". */
export function categoriaDe(producto) {
  const c = normal(producto?.category);
  for (const k of CATEGORIAS_TIENDA) if (k.patron && c && k.patron.test(c)) return k.clave;
  if (!c) {
    const n = normal(producto?.name);
    for (const k of CATEGORIAS_TIENDA) if (k.patron && k.patron.test(n)) return k.clave;
    return 'otros';
  }
  return c.replace(/\s+/g, '-');
}

export function etiquetaDe(clave) {
  const k = CATEGORIAS_TIENDA.find(x => x.clave === clave);
  if (k) return k.etiqueta;
  if (clave === 'otros') return 'Más';
  const t = String(clave || '').replace(/-/g, ' ');
  return t.charAt(0).toLocaleUpperCase('es-MX') + t.slice(1);
}

/* Las secciones de la tienda, en orden: kits primero (es lo que el club
   vende), después las conocidas en su orden y al final las nuevas por nombre.
   Sólo salen las que tienen algo. */
export function seccionesDeTienda({ products = [], bundles = [] } = {}) {
  const grupos = new Map();
  if (bundles.length) grupos.set('kits', bundles.map(k => ({ tipo: 'kit', item: k })));
  for (const p of products) {
    const c = categoriaDe(p);
    if (!grupos.has(c)) grupos.set(c, []);
    grupos.get(c).push({ tipo: 'producto', item: p });
  }
  const orden = CATEGORIAS_TIENDA.map(k => k.clave);
  return [...grupos.entries()]
    .sort(([a], [b]) => {
      const ia = orden.indexOf(a), ib = orden.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || etiquetaDe(a).localeCompare(etiquetaDe(b), 'es-MX');
    })
    .map(([clave, items]) => ({ clave, etiqueta: etiquetaDe(clave), items }));
}

/* Las fotos que hay que firmar, agrupadas por bucket y sin repetir. Las
   tarjetas usan la miniatura; la ficha, la foto completa. */
export function fotosPorFirmar(productos = [], { completas = false } = {}) {
  const porBucket = {};
  for (const p of productos) {
    const ruta = completas ? (p.photoPath || p.photoThumbPath) : (p.photoThumbPath || p.photoPath);
    if (!ruta) continue;
    const b = p.photoBucket || 'tanneros-private';
    (porBucket[b] ||= new Set()).add(ruta);
  }
  return Object.fromEntries(Object.entries(porBucket).map(([b, s]) => [b, [...s]]));
}

/* Las fotos de un kit: las de sus piezas que tienen foto, sin repetir, hasta
   cuatro. Un kit no tiene foto propia; se ve con sus prendas. */
export function fotosDeKit(kit) {
  const vistas = new Set(), fotos = [];
  for (const p of kit?.pieces || []) {
    const ruta = p.photoThumbPath;
    if (!ruta || vistas.has(ruta)) continue;
    vistas.add(ruta);
    fotos.push({ ruta, bucket: p.photoBucket || 'tanneros-private', nombre: p.name });
    if (fotos.length === 4) break;
  }
  return fotos;
}

/* El precio que se anuncia en la tarjeta de un kit: el más bajo, con "Desde"
   si hay dos precios. */
export function precioDeTarjeta(kit) {
  const nino = Number(kit?.price_kid || 0), adulto = Number(kit?.price_adult || 0);
  if (nino > 0 && adulto > 0 && nino !== adulto) return { desde: true, monto: Math.min(nino, adulto) };
  return { desde: false, monto: adulto || nino };
}

/* Las tallas acomodadas como en una tienda: Niño y Adulto por separado, y lo
   que no cae en ninguna escala en "Otras". */
const NINO = ['2', '4', '6', '8', '10', '12', '14', '16'];
const ADULTO = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
export function gruposDeTallas(tallas = []) {
  const t = tallas.map(x => String(x).trim()).filter(Boolean);
  const grupos = [
    { etiqueta: 'Niño', tallas: NINO.filter(x => t.includes(x)) },
    { etiqueta: 'Adulto', tallas: ADULTO.filter(x => t.includes(x)) },
    { etiqueta: 'Otras', tallas: t.filter(x => !NINO.includes(x) && !ADULTO.includes(x)) }
  ].filter(g => g.tallas.length);
  // Si todo cae en un solo grupo, no hace falta título.
  if (grupos.length === 1) grupos[0].etiqueta = '';
  return grupos;
}
