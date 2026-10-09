/* Los textos del pedido: cómo pagar y la confirmación por WhatsApp.
 *
 * Pedido de Presidencia y Operaciones (08/10/2026): el pedido por link llegaba
 * sin decir a qué cuenta pagar, y el botón de WhatsApp de Pedidos abría un chat
 * vacío donde había que escribir todo a mano.
 *
 * Aquí vive el texto una sola vez: la tienda pública (lo que ve la familia) y
 * Pedidos (lo que se le manda por WhatsApp) dicen exactamente lo mismo. Los
 * datos de depósito vienen del club (organizations.settings.paymentInstructions),
 * nunca escritos aquí: cada club tiene su cuenta.
 *
 * Funciones puras, sin DOM: scripts/qa-pedido-mensajes.mjs las prueba.
 */
const dinero = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

function primerNombre(v) {
  const p = String(v || '').trim().split(/\s+/)[0] || '';
  return p ? p.charAt(0).toLocaleUpperCase('es-MX') + p.slice(1).toLocaleLowerCase('es-MX') : '';
}

/* Métodos que no son transferencia ("Efectivo", "Tarjeta") en una frase. */
function otrosMetodos(info) {
  const otros = (Array.isArray(info?.methods) ? info.methods : [])
    .map(m => String(m || '').trim()).filter(m => m && !/transfer/i.test(m))
    .map(m => m.toLocaleLowerCase('es-MX'));
  if (!otros.length) return '';
  const lista = otros.length === 1 ? otros[0] : `${otros.slice(0, -1).join(', ')} y ${otros.at(-1)}`;
  return `También aceptamos ${lista} en Taquilla.`;
}

/* Los datos para transferir, listos para pintar o para pegar en un mensaje. */
export function datosDePago(info, folio) {
  const t = info?.transfer || {};
  const filas = [];
  if (t.bank) filas.push(['Banco', String(t.bank)]);
  if (t.clabe) filas.push(['CLABE', String(t.clabe).replace(/\D/g, '')]);
  if (t.holder) filas.push(['A nombre de', String(t.holder)]);
  if (filas.length && folio) filas.push(['Referencia', String(folio)]);
  return { filas, otros: otrosMetodos(info) };
}

function lineaDePieza(i) {
  const a = i?.attributes || {};
  const talla = a.talla || a.size || '';
  const nombre = a.nombrePers || a.personalizationName || '';
  const numero = a.numero || a.number || '';
  const espalda = [nombre, numero ? `#${numero}` : ''].filter(Boolean).join(' ');
  const cant = Number(i?.quantity || 1);
  const partes = [`${cant > 1 ? `${cant} x ` : ''}${i?.description || 'Pieza'}`];
  if (talla) partes.push(`talla ${talla}`);
  if (espalda) partes.push(espalda);
  return `- ${partes.join(' · ')}`;
}

/* Lo que se le manda a la familia al confirmar su pedido. Siempre dice quién
   escribe: así lo pidió Presidencia para todos los mensajes del club. */
export function mensajeConfirmacion({ order, items = [], info, club = 'Tannery City', yo = '' }) {
  const hola = primerNombre(order?.customer_name);
  const quien = primerNombre(yo);
  const pago = datosDePago(info, order?.folio);
  const lineas = [
    `Hola${hola ? ` ${hola}` : ''}, ${quien ? `te saluda ${quien} de ${club}` : `te escribimos de ${club}`}.`,
    '',
    `Recibimos tu pedido ${order?.folio || ''}:`.replace(/ :$/, ':'),
    ...items.map(lineaDePieza),
    `Total: ${dinero.format(Number(order?.total || 0))}`,
  ];
  if (pago.filas.length) {
    lineas.push('', 'Para pagar por transferencia:', ...pago.filas.map(([k, v]) => `${k}: ${v}`));
  }
  if (pago.otros) lineas.push(pago.otros);
  // El tiempo de entrega (f3): lo que más preguntan después de pagar.
  if (info?.delivery) lineas.push('', `Entrega estimada: ${String(info.delivery).trim()}.`);
  lineas.push('', '¿Están bien las tallas, el nombre y el número?',
    'Cuando pagues, mándanos tu comprobante por aquí y lo registramos.');
  return lineas.join('\n');
}

/* Lo que la familia le manda al club con su comprobante. */
export function mensajeComprobante({ folio = '', total = 0, nombre = '' }) {
  const n = String(nombre || '').trim();
  return `Hola, ${n ? `soy ${n}. ` : ''}Te comparto el comprobante de pago de mi pedido ${folio} por ${dinero.format(Number(total || 0))}.`;
}

export function ligaWhatsApp(telefono, texto = '') {
  let d = String(telefono || '').replace(/\D/g, '');
  if (!d) return null;
  // Un celular de México capturado a 10 dígitos no abre en WhatsApp sin lada.
  if (d.length === 10) d = `52${d}`;
  return `https://wa.me/${d}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
}
