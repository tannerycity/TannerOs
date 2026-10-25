/* VENDER Y COTIZAR (25/10/2026), sin pantalla (se prueba con node).
 *
 * Presidencia: "lo voy a dejar súper ultra mega sencillo para que cotice,
 * para que vea, para que suba fotos, para vender sobre todo".
 *   - Cinco categorías en vez de trece familias (la familia queda de
 *     subcategoría).
 *   - El carrito suma los espacios; el descuento es % o $, con tope de 10%.
 *     Arriba del tope la cotización pide autorización de Presidencia (lo
 *     decide también el servidor, h44; aquí sólo se avisa antes de guardar).
 *   - Qué se puede hacer con cada cotización según su estado.
 */

// El orden es el del catálogo. 'content' se junta con 'digital' (h44).
export const CATEGORIAS = [
  { k: 'uniforms', t: 'Uniforme' },
  { k: 'park', t: 'Complejo' },
  { k: 'digital', t: 'Redes y contenido' },
  { k: 'sports', t: 'Eventos y transmisiones' },
  { k: 'other', t: 'Paquetes' },
];
export function categoriaDe(activo) {
  const c = activo?.category;
  if (c === 'content') return 'digital';
  return CATEGORIAS.some((x) => x.k === c) ? c : 'other';
}
export const nombreCategoria = (k) => CATEGORIAS.find((x) => x.k === k)?.t || 'Paquetes';

const sinAcentos = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function filtraCatalogo(activos, { categoria = 'all', q = '' } = {}) {
  const busca = sinAcentos(q).trim();
  return (activos || []).filter((a) => (categoria === 'all' || categoriaDe(a) === categoria)
    && (!busca || sinAcentos([a.name, a.family, a.channel, a.description].join(' ')).includes(busca)));
}

const redondea = (n) => Math.round(Number(n || 0) * 100) / 100;

// El precio con el que entra al carrito: el del catálogo si tiene; si no, 0
// y la cotización pide escribirlo.
export function renglonDe(activo, cantidad = 1) {
  return {
    assetId: activo.id, description: activo.name, unit: activo.unit || null,
    unitPrice: activo.price != null && activo.price !== '' ? Number(activo.price) : 0,
    quantity: Math.max(1, Number(cantidad) || 1), sinPrecio: activo.price == null || activo.price === '',
  };
}

export function totales(renglones, { tipo = null, valor = 0 } = {}, tope = 10) {
  const subtotal = redondea((renglones || []).reduce((s, r) => s + Number(r.unitPrice || 0) * Number(r.quantity || 1), 0));
  const v = Math.max(0, Number(valor) || 0);
  const descuento = tipo === 'pct' ? redondea(subtotal * Math.min(v, 100) / 100) : tipo === 'amount' ? Math.min(v, subtotal) : 0;
  const pct = subtotal > 0 ? redondea(descuento / subtotal * 100) : 0;
  return { subtotal, descuento, pct, total: redondea(subtotal - descuento), pideAutorizacion: pct > Number(tope) };
}

export const ESTADOS = { draft: 'Borrador', sent: 'Enviada', accepted: 'Aceptada', rejected: 'No aceptó' };

// La etiqueta principal y lo que se puede hacer con una cotización.
export function accionesDe(cot, { esPresidencia = false, puedeEscribir = true } = {}) {
  const a = cot?.approvalStatus;
  if (!cot) return { etiqueta: '', tono: '', acciones: [] };
  if (cot.status === 'accepted') return { etiqueta: 'Aceptada', tono: 'ok', acciones: ['verMarca'] };
  if (!puedeEscribir) return { etiqueta: ESTADOS[cot.status] || cot.status, tono: '', acciones: [] };
  if (a === 'pending') return { etiqueta: 'Por autorizar', tono: 'espera', acciones: esPresidencia ? ['autorizar', 'noAutorizar', 'editar'] : ['editar'] };
  if (a === 'rejected') return { etiqueta: 'Descuento no autorizado', tono: 'mal', acciones: ['editar', 'archivar'] };
  if (cot.status === 'draft') return { etiqueta: 'Borrador', tono: '', acciones: ['enviar', 'editar', 'archivar'] };
  if (cot.status === 'sent') return { etiqueta: 'Enviada', tono: 'info', acciones: ['acepto', 'noAcepto', 'reenviar', 'editar'] };
  if (cot.status === 'rejected') return { etiqueta: 'No aceptó', tono: 'mal', acciones: ['borrador', 'archivar'] };
  return { etiqueta: ESTADOS[cot.status] || cot.status, tono: '', acciones: [] };
}

export const FILTROS_COT = [
  { k: 'all', t: 'Todas' }, { k: 'pending', t: 'Por autorizar' }, { k: 'draft', t: 'Borrador' },
  { k: 'sent', t: 'Enviadas' }, { k: 'accepted', t: 'Aceptadas' }, { k: 'rejected', t: 'No aceptó' },
];
export function filtraCotizaciones(lista, filtro = 'all') {
  return (lista || []).filter((c) => filtro === 'all' ? true
    : filtro === 'pending' ? c.approvalStatus === 'pending' && c.status !== 'accepted'
    : c.status === filtro && !(filtro === 'draft' && c.approvalStatus === 'pending'));
}

// Un mensaje corto para acompañar el PDF por WhatsApp.
export function mensajeWhatsApp(cot, club) {
  const dinero = (n) => '$' + Math.round(Number(n || 0)).toLocaleString('es-MX');
  return 'Hola, te comparto la cotización ' + cot.folio + ' de ' + club + ' para ' + (cot.sponsorName || 'tu marca') + ': ' +
    (cot.items || []).length + ' ' + ((cot.items || []).length === 1 ? 'espacio' : 'espacios') + ' por ' + dinero(cot.total) +
    (cot.discountAmount > 0 ? ' (ya con ' + dinero(cot.discountAmount) + ' de descuento)' : '') + '. ¿Lo platicamos?';
}
