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

export const ESTADOS = { draft: 'Borrador', sent: 'Enviada', accepted: 'Aceptada', rejected: 'No aceptó', expired: 'Vencida' };

/* Vencida (24/11/2026): la que no se cerró y ya pasó su "válida hasta". No se
   guarda en la base: se calcula con la fecha de hoy, así nunca se queda atrás. */
export function vencida(cot, hoy) {
  if (!cot?.validUntil || !hoy || !['draft', 'sent'].includes(cot.status)) return false;
  return String(cot.validUntil).slice(0, 10) < String(hoy).slice(0, 10);
}

// La etiqueta principal y lo que se puede hacer con una cotización.
export function accionesDe(cot, { esPresidencia = false, puedeEscribir = true, hoy = null } = {}) {
  const a = cot?.approvalStatus;
  if (!cot) return { etiqueta: '', tono: '', acciones: [] };
  if (cot.status === 'accepted') return { etiqueta: 'Aceptada', tono: 'ok', acciones: ['verMarca'] };
  const vence = vencida(cot, hoy) && a !== 'pending';
  if (!puedeEscribir) return { etiqueta: vence ? 'Vencida' : ESTADOS[cot.status] || cot.status, tono: vence ? 'mal' : '', acciones: [] };
  // Renovar es editarla: se le pone otra fecha y se vuelve a mandar.
  if (vence) return { etiqueta: 'Vencida', tono: 'mal', acciones: ['renovar', 'noAcepto', 'archivar'] };
  if (a === 'pending') return { etiqueta: 'Por autorizar', tono: 'espera', acciones: esPresidencia ? ['autorizar', 'noAutorizar', 'editar'] : ['editar'] };
  if (a === 'rejected') return { etiqueta: 'Descuento no autorizado', tono: 'mal', acciones: ['editar', 'archivar'] };
  if (cot.status === 'draft') return { etiqueta: 'Borrador', tono: '', acciones: ['enviar', 'editar', 'archivar'] };
  if (cot.status === 'sent') return { etiqueta: 'Enviada', tono: 'info', acciones: ['acepto', 'noAcepto', 'reenviar', 'editar'] };
  if (cot.status === 'rejected') return { etiqueta: 'No aceptó', tono: 'mal', acciones: ['borrador', 'archivar'] };
  return { etiqueta: ESTADOS[cot.status] || cot.status, tono: '', acciones: [] };
}

export const FILTROS_COT = [
  { k: 'all', t: 'Todas' }, { k: 'pending', t: 'Por autorizar' }, { k: 'draft', t: 'Borrador' },
  { k: 'sent', t: 'Enviadas' }, { k: 'expired', t: 'Vencidas' }, { k: 'accepted', t: 'Aceptadas' }, { k: 'rejected', t: 'No aceptó' },
];
export function filtraCotizaciones(lista, filtro = 'all', hoy = null) {
  return (lista || []).filter((c) => filtro === 'all' ? true
    : filtro === 'pending' ? c.approvalStatus === 'pending' && c.status !== 'accepted'
    : filtro === 'expired' ? vencida(c, hoy) && c.approvalStatus !== 'pending'
    : c.status === filtro && !(filtro === 'draft' && c.approvalStatus === 'pending') && !(vencida(c, hoy) && c.approvalStatus !== 'pending'));
}

/* POR MES (24/11/2026). Presidencia mandó el cotizador con paquete base,
   meses, IVA y total del contrato. El paquete es un activo con sus meses
   (mínimo y máximo); el resto de los renglones son extras por mes. Un precio
   en 0 es "Incluido". El servidor (h101) hace la misma cuenta y no deja
   guardar meses fuera del rango del paquete.
     sub = base + extras; desc = sub x desc%; iva = (sub - desc) x 16%;
     mensual = sub - desc + iva; contrato = mensual x meses */
export const esPaquete = (a) => !!(a?.paquete && Number(a.paquete.min) > 0);
export function paquetesDe(activos) {
  return (activos || []).filter(esPaquete).sort((a, b) => Number(a.paquete.orden || 0) - Number(b.paquete.orden || 0) || Number(a.price || 0) - Number(b.price || 0));
}
export function totalesDePlan(renglones, { tipo = null, valor = 0, meses = null, ivaPct = 0, paqueteId = null } = {}, tope = 10) {
  const t = totales(renglones, { tipo, valor }, tope);
  const base = redondea((renglones || []).filter((r) => paqueteId && r.assetId === paqueteId).reduce((s, r) => s + Number(r.unitPrice || 0) * Number(r.quantity || 1), 0));
  const m = Number(meses) > 0 ? Math.round(Number(meses)) : null;
  const iva = redondea(t.total * (Number(ivaPct) === 16 ? 16 : 0) / 100);
  return { ...t, base, extras: redondea(t.subtotal - base), iva, meses: m,
    mensual: m ? redondea(t.total + iva) : null,
    contrato: m ? redondea((t.total + iva) * m) : redondea(t.total + iva),
    // Lo que entra al club sin IVA: pasa al acuerdo cuando la marca acepta.
    totalSinIva: m ? redondea(t.total * m) : t.total };
}
// El aviso del paquete: los meses fuera de rango no dejan guardar; el precio
// abajo del de lista sólo avisa.
export function avisoDePlan(paquete, meses, base) {
  if (!esPaquete(paquete)) return { texto: '', bloquea: false };
  const { min, max } = paquete.paquete, m = Number(meses) || 0;
  if (m < min || m > max) return { bloquea: true, texto: Number(min) === Number(max) ? 'Este paquete es sólo de ' + min + ' meses.' : m < min ? 'Este paquete pide mínimo ' + min + ' meses.' : 'Este paquete es de máximo ' + max + ' meses.' };
  if (Number(paquete.price) > 0 && Number(base) < Number(paquete.price)) return { bloquea: false, texto: 'El precio base está abajo del de lista (' + dinero(paquete.price) + '/mes).' };
  return { texto: '', bloquea: false };
}
const dinero = (n) => '$' + Math.round(Number(n || 0)).toLocaleString('es-MX');

// Un mensaje corto para acompañar el PDF por WhatsApp.
export function mensajeWhatsApp(cot, club) {
  if (Number(cot?.months) > 0) {
    return 'Hola, te comparto la propuesta ' + cot.folio + ' de ' + club + ' para ' + (cot.sponsorName || 'tu marca') + ': ' +
      (cot.packageName ? cot.packageName + ', ' : '') + dinero(cot.monthlyTotal) + ' al mes por ' + cot.months + ' meses (' + dinero(cot.contractTotal) + ' el contrato' +
      (Number(cot.ivaPct) > 0 ? ', IVA incluido' : '') + '). ¿Lo platicamos?';
  }
  return 'Hola, te comparto la cotización ' + cot.folio + ' de ' + club + ' para ' + (cot.sponsorName || 'tu marca') + ': ' +
    (cot.items || []).length + ' ' + ((cot.items || []).length === 1 ? 'espacio' : 'espacios') + ' por ' + dinero(cot.total) +
    (cot.discountAmount > 0 ? ' (ya con ' + dinero(cot.discountAmount) + ' de descuento)' : '') + '. ¿Lo platicamos?';
}

/* Seguimiento de cotizaciones (25/10/2026): lo que cierra ventas es volver a
   escribir. Enviada hace 5 días o más sin respuesta, o que vence en 3 días o
   menos, sale en "Hoy toca". Lo que espera a Presidencia también. */
const dias = (a, b) => Math.round((new Date(String(a).slice(0, 10) + 'T12:00:00') - new Date(String(b).slice(0, 10) + 'T12:00:00')) / 86400000);
export function avisosDeCotizaciones(lista, hoy, { esPresidencia = false } = {}) {
  const out = [];
  for (const q of lista || []) {
    const base = { tipo: 'cotizacion', accion: 'cotizacion', cotId: q.id, marcaId: q.sponsorId || null, marca: q.sponsorName || 'Marca' };
    if (q.status === 'accepted' || q.status === 'rejected') continue;
    if (q.approvalStatus === 'pending') {
      if (esPresidencia) out.push({ ...base, nivel: 'alta', texto: q.folio + ': autoriza el descuento de ' + q.discountPct + '%' });
      continue;
    }
    if (q.status !== 'sent') continue;
    const vence = q.validUntil ? dias(q.validUntil, hoy) : null;
    const desde = q.sentAt ? dias(hoy, q.sentAt) : null;
    if (vence !== null && vence < 0) out.push({ ...base, nivel: 'media', texto: q.folio + ' venció: renuévala o márcala' });
    else if (vence !== null && vence <= 3) out.push({ ...base, nivel: 'alta', texto: q.folio + ' vence ' + (vence === 0 ? 'hoy' : vence === 1 ? 'mañana' : 'en ' + vence + ' días') + ': escríbele' });
    else if (desde !== null && desde >= 5) out.push({ ...base, nivel: 'media', texto: q.folio + ' enviada hace ' + desde + ' días sin respuesta: escríbele' });
  }
  return out;
}
