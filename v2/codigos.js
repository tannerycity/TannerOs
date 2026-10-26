/* CÓDIGOS DE LA TIENDA (26/10/2026, h46), sin DOM (se prueba con node).
 *
 * Presidencia: "que otras cosas puedo crear con códigos en la tienda... dale
 * con los códigos". Del embajador: "las dos" (que vea sus ventas y que gane
 * algo).
 *   - Lo que el código descuenta en el carrito, para decirlo ANTES de pedir.
 *     Quien cobra es el servidor (private.aplica_codigo); aquí se calcula
 *     igual para que lo que ve la familia sea lo que paga.
 *   - Las reglas del formulario de Catálogo, con el mismo tope que el
 *     servidor (10% de la compra; arriba, Presidencia).
 *   - Las ligas: la de compra (?codigo=) y la privada del embajador.
 */
export const TOPE_PCT = 10;

export const normalizaCodigo = (v) => String(v ?? '').replace(/\s+/g, '').toUpperCase();
export const codigoValido = (v) => /^[A-Z0-9]{3,20}$/.test(normalizaCodigo(v));

const redondea = (n) => Math.round(Number(n || 0) * 100) / 100;

/* Lo que se descuenta del carrito con un código ya validado (info viene de
   v2_public_check_code). La personalización gratis devuelve lo que costó el
   nombre y número de cada línea (recargoPers). */
export function descuentoDeCodigo(info, carrito = {}, subtotal = null) {
  if (!info?.ok) return 0;
  const lineas = Object.values(carrito || {});
  const total = subtotal ?? lineas.reduce((s, l) => s + Number(l.total || 0), 0);
  if (info.kind === 'descuento') {
    const v = Number(info.discountValue || 0);
    return info.discountType === 'pct' ? redondea(total * v / 100) : Math.min(v, total);
  }
  if (info.kind === 'personalizacion') {
    return redondea(lineas.reduce((s, l) => s + Number(l.recargoPers || 0) * Number(l.cantidad || 1), 0));
  }
  return 0;
}

/* Lo que dice la caja del código en el carrito, ya aplicado. */
export function textoAplicado(info, descuento, fmt = (n) => `$${n}`) {
  if (!info?.ok) return '';
  if (info.kind === 'regalo') return `${info.giftName || 'Regalo'} de regalo en tu pedido`;
  if (info.kind === 'personalizacion' && !(descuento > 0)) return 'Nombre y número gratis: agrégale nombre o número a tu jersey';
  return `${info.label}: −${fmt(descuento)}`;
}

/* ---- Catálogo: el formulario ---- */
export const TIPOS = [
  { k: 'descuento', t: 'Descuento', sub: '% o $ menos en la compra' },
  { k: 'regalo', t: 'Regalo', sub: 'Una pieza gratis con la compra' },
  { k: 'personalizacion', t: 'Nombre y número gratis', sub: 'No se cobra el estampado' },
];

/* Cuánto pesa el código sobre la compra, en %, para el tope. */
export function pesoDelCodigo(c, precioRegalo = 0) {
  const min = Number(c.minPurchase || 0), v = Number(c.discountValue || 0);
  if (c.kind === 'descuento') return c.discountType === 'pct' ? v : (min > 0 ? v / min * 100 : 100);
  if (c.kind === 'regalo') return min > 0 ? Number(precioRegalo || 0) / min * 100 : 100;
  return 0;
}

/* El motivo por el que no se puede guardar, o null. Mismo orden y mismas
   palabras que private.command_save_store_code. */
export function revisaCodigo(c, { esPresidencia = false, precioRegalo = 0, tallasRegalo = 0 } = {}) {
  if (!codigoValido(c.code)) return 'El código lleva de 3 a 20 letras o números, sin espacios ni acentos.';
  if (!TIPOS.some((t) => t.k === c.kind)) return 'Elige qué hace el código.';
  const reward = Number(c.rewardPct || 0);
  if (Number(c.minPurchase || 0) < 0 || reward < 0 || reward > 30) return 'Revisa la compra mínima y el premio (de 0 a 30%).';
  if (c.kind === 'descuento') {
    if (!['pct', 'amount'].includes(c.discountType) || !(Number(c.discountValue) > 0)) return 'Escribe cuánto descuenta.';
    if (c.discountType === 'pct' && Number(c.discountValue) > 90) return 'El descuento va de 1 a 90%.';
  }
  if (c.kind === 'regalo') {
    if (!c.giftProductId) return 'Elige el regalo.';
    if (tallasRegalo > 1) return 'El regalo tiene que ser de talla única (una gorra, unas calcetas universales).';
  }
  if (!esPresidencia && pesoDelCodigo(c, precioRegalo) > TOPE_PCT) return 'Arriba del 10% de la compra lo autoriza Presidencia. Sube la compra mínima o baja el descuento.';
  if (!esPresidencia && reward > TOPE_PCT) return 'Un premio arriba del 10% lo autoriza Presidencia.';
  if (c.startsOn && c.endsOn && c.endsOn < c.startsOn) return 'La fecha de fin va después de la de inicio.';
  return null;
}

export const ESTADOS = {
  activo: { t: 'Activo', tono: 'ok' }, pausado: { t: 'Pausado', tono: '' },
  programado: { t: 'Empieza pronto', tono: 'info' }, vencido: { t: 'Vencido', tono: 'mal' }, agotado: { t: 'Se terminó', tono: 'mal' },
};

/* ---- Ligas ---- */
export function ligaDeCompra(origen, code, club = '') {
  const q = new URLSearchParams();
  if (club) q.set('club', club);
  q.set('codigo', normalizaCodigo(code));
  return `${String(origen).replace(/\/$/, '')}/tienda/?${q}`;
}
export function ligaDelEmbajador(origen, token) {
  return `${String(origen).replace(/\/$/, '')}/tienda/#/embajador/${encodeURIComponent(token)}`;
}
/* Lo que se le manda al embajador por WhatsApp: su código, su liga para
   compartir y la de sus ventas. */
export function mensajeEmbajador(c, { compra, ventas, club = 'el club', fmt = (n) => `$${n}` } = {}) {
  const premio = Number(c.rewardPct || 0) > 0
    ? ` Por cada compra pagada ganas ${Number(c.rewardPct)}%${c.rewardKind === 'credito' ? ' en crédito para la tienda' : ''}.` : '';
  return `Hola${c.ambassadorName ? ` ${c.ambassadorName}` : ''}, ya tienes tu código de la tienda de ${club}: ${c.code} (${c.label}).${premio}`
    + `\n\nCompártelo con esta liga, el código ya va puesto: ${compra}`
    + `\n\nAquí ves tus ventas${Number(c.rewardPct || 0) > 0 ? ' y tu premio' : ''}: ${ventas}`;
}
