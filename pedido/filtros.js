/* FILTROS DE LA TIENDA (25/11/2026), sin DOM.
 *
 * Presidencia: "Faceted filters sidebar: collapsible groups for size, color
 * swatches and a price range slider, with active filters as removable chips."
 *
 * Talla, color y precio. Las opciones salen de lo que hay en la vista (sólo
 * las tallas y colores que existen; el rango va del más barato al más caro).
 * Quien llama pasa cómo leer el precio y las tallas de cada tarjeta (pieza o
 * kit), porque eso vive en /v2/tienda.js. Se prueba con
 * scripts/qa-filtros-tienda.mjs.
 */
import { gruposDeTallas } from './catalogo.js';

/* Los colores del club, por su nombre. Un producto sin campo de color se
   reconoce por su nombre ("Jersey Black Edition" es negro). Lo que no se
   reconoce no tiene color: sale con cualquier filtro de talla o precio, pero
   no cuando se filtra por color. */
export const COLORES = [
  { clave: 'negro',   etiqueta: 'Negro',   hex: '#1f1a19', patron: /\b(black|negr[oa]s?)\b/ },
  { clave: 'blanco',  etiqueta: 'Blanco',  hex: '#f4f4f2', patron: /\b(white|blanc[oa]s?)\b/ },
  { clave: 'marino',  etiqueta: 'Marino',  hex: '#0b3d4a', patron: /\b(navy|marino|petroleo)\b/ },
  { clave: 'azul',    etiqueta: 'Azul',    hex: '#7fb3c2', patron: /\b(blue|azul(es)?|celeste)\b/ },
  { clave: 'verde',   etiqueta: 'Verde',   hex: '#5ac0b0', patron: /\b(green|verdes?|lechuguilla)\b/ },
  { clave: 'rosa',    etiqueta: 'Rosa',    hex: '#bf8f96', patron: /\b(pink|rosas?|cantera)\b/ },
  { clave: 'dorado',  etiqueta: 'Dorado',  hex: '#c8ae62', patron: /\b(gold|dorad[oa]s?|oro)\b/ },
  { clave: 'gris',    etiqueta: 'Gris',    hex: '#9aa3a6', patron: /\b(gr[ae]y|gris(es)?)\b/ },
  { clave: 'rojo',    etiqueta: 'Rojo',    hex: '#b13d34', patron: /\b(red|roj[oa]s?)\b/ }
];

const normal = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/* Los colores de una pieza o kit: su campo `color`/`colors` si lo trae, si
   no, lo que diga su nombre (y, en un kit, el de sus piezas). */
export function coloresDe(item) {
  const explicitos = [item?.color, ...(Array.isArray(item?.colors) ? item.colors : [])].filter(Boolean).map(normal);
  const texto = explicitos.length ? explicitos.join(' ') : normal([item?.name, ...(item?.pieces || []).map(p => p?.name)].join(' '));
  return COLORES.filter(c => c.patron.test(texto)).map(c => c.clave);
}

export const vacios = () => ({ tallas: [], colores: [], min: null, max: null });
export const hayFiltros = f => !!(f && (f.tallas.length || f.colores.length || f.min != null || f.max != null));

// Precio redondeado hacia afuera a múltiplos de 50: el deslizador camina en pasos de $50.
const PASO = 50;

/* Lo que se puede elegir con lo que hay en la vista. */
export function opcionesDeFiltros(items = [], { precio, tallas }) {
  const ts = new Set(), cs = new Map();
  let min = Infinity, max = -Infinity;
  for (const it of items) {
    (tallas(it) || []).forEach(t => ts.add(String(t)));
    coloresDe(it.item).forEach(c => cs.set(c, (cs.get(c) || 0) + 1));
    const p = Number(precio(it));
    if (p > 0) { min = Math.min(min, p); max = Math.max(max, p); }
  }
  return {
    tallas: gruposDeTallas([...ts]),
    colores: COLORES.filter(c => cs.has(c.clave)).map(({ clave, etiqueta, hex }) => ({ clave, etiqueta, hex, total: cs.get(clave) })),
    min: Number.isFinite(min) ? Math.floor(min / PASO) * PASO : 0,
    max: Number.isFinite(max) ? Math.ceil(max / PASO) * PASO : 0,
    paso: PASO
  };
}

/* Lo que pasa los filtros. Dentro de un grupo es "o" (talla M o L); entre
   grupos es "y" (talla M y color negro y hasta $800). */
export function aplicaFiltros(items = [], f, { precio, tallas }) {
  if (!hayFiltros(f)) return items;
  return items.filter(it => {
    if (f.tallas.length && !(tallas(it) || []).some(t => f.tallas.includes(String(t)))) return false;
    if (f.colores.length && !coloresDe(it.item).some(c => f.colores.includes(c))) return false;
    const p = Number(precio(it));
    if (f.min != null && p < f.min) return false;
    if (f.max != null && p > f.max) return false;
    return true;
  });
}

/* Los chips de lo que está puesto, en orden: tallas, colores, precio. */
export function chipsDe(f, { dinero = n => `$${n}` } = {}) {
  if (!f) return [];
  const precio = f.min != null && f.max != null ? `${dinero(f.min)} – ${dinero(f.max)}`
    : f.min != null ? `Desde ${dinero(f.min)}` : f.max != null ? `Hasta ${dinero(f.max)}` : null;
  return [
    ...f.tallas.map(t => ({ tipo: 'talla', valor: t, texto: `Talla ${t}` })),
    ...f.colores.map(c => ({ tipo: 'color', valor: c, texto: COLORES.find(x => x.clave === c)?.etiqueta || c })),
    ...(precio ? [{ tipo: 'precio', valor: '', texto: precio }] : [])
  ];
}

/* Quita un chip; devuelve filtros nuevos (no toca los de antes). */
export function quitaFiltro(f, { tipo, valor }) {
  const n = { ...f, tallas: [...f.tallas], colores: [...f.colores] };
  if (tipo === 'talla') n.tallas = n.tallas.filter(t => t !== valor);
  if (tipo === 'color') n.colores = n.colores.filter(c => c !== valor);
  if (tipo === 'precio') { n.min = null; n.max = null; }
  return n;
}

/* El rango elegido, acomodado al de la vista: si cubre todo, no es filtro. */
export function ajustaRango(f, min, max, op) {
  const a = Math.max(op.min, Math.min(Number(min), Number(max)));
  const b = Math.min(op.max, Math.max(Number(min), Number(max)));
  return { ...f, min: a <= op.min ? null : a, max: b >= op.max ? null : b };
}
