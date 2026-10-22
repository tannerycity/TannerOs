/* Inicio del portal de familias (fase 2, 18/10/2026): "tiene que ser bien
 * fácil hacer todo". Lo primero que ve la familia es lo que tiene que hacer
 * (pagar, firmar, la foto, documentos), los avisos del club y lo próximo.
 * Sin DOM, para probarlo en Node (qa-familias-inicio). */

const nombre = p => String(p?.first_name || '').trim().split(/\s+/)[0] || 'tu Tanner';

/* Lo pendiente de cada hijo, en el orden en que le importa a la familia.
   Cada uno dice a dónde lleva (pestaña y sección) para resolverlo. */
export function pendientesDe(players = [], statements = {}, paperwork = {}) {
  const out = [];
  for (const p of players) {
    const st = statements[p.id] || {}, pw = paperwork[p.id] || {};
    const saldo = Number(st.summary?.balance ?? p.balance ?? 0);
    if (saldo > 0.004) out.push({ tipo: 'pago', player: p.id, prioridad: 1, monto: saldo,
      titulo: `Saldo pendiente de ${nombre(p)}`, accion: 'Ver cómo pagar', tab: 'cuenta', ancla: 'famSaldo' });
    const firmar = (pw.consents || []).filter(d => d.code !== 'uso_de_imagen' && d.required && (!d.accepted_at || d.outdated));
    if (firmar.length) out.push({ tipo: 'firma', player: p.id, prioridad: 2,
      titulo: firmar.length === 1 ? `Firmar: ${firmar[0].title}` : `Firmar ${firmar.length} papeles del club`,
      detalle: nombre(p), accion: 'Leer y firmar', tab: 'cuenta', ancla: 'famPapeles' });
    if (pw.image_consent?.status === 'sin_preguntar') out.push({ tipo: 'fotos', player: p.id, prioridad: 3,
      titulo: `¿Podemos publicar fotos de ${nombre(p)}?`, accion: 'Responder', tab: 'cuenta', ancla: 'famFotos' });
    const docs = (st.documents || []).filter(d => !d.received);
    if (docs.length) out.push({ tipo: 'docs', player: p.id, prioridad: 4,
      titulo: `${docs.length === 1 ? 'Falta 1 documento' : `Faltan ${docs.length} documentos`} de ${nombre(p)}`,
      accion: 'Ver cuáles', tab: 'cuenta', ancla: 'famDocs' });
  }
  return out.sort((a, b) => a.prioridad - b.prioridad);
}

// Lo próximo del calendario: el primer entrenamiento o evento que no ha pasado.
export function proximoEvento(eventos = [], ahora = Date.now()) {
  return (eventos || []).filter(e => e.kind !== 'birthday' && new Date(e.ends_at || e.starts_at).getTime() >= ahora)
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))[0] || null;
}

// "Hoy", "Mañana", "sábado 25 oct": como lo diría alguien del club.
export function cuandoEs(fecha, ahora = new Date()) {
  const d = new Date(fecha), hoy = new Date(ahora); hoy.setHours(0, 0, 0, 0);
  const dia = new Date(d); dia.setHours(0, 0, 0, 0);
  const dif = Math.round((dia - hoy) / 864e5);
  const hora = new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit' }).format(d);
  if (dif === 0) return `Hoy · ${hora}`;
  if (dif === 1) return `Mañana · ${hora}`;
  const f = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'short' }).format(d).replace('.', '');
  return `${f} · ${hora}`;
}

// El saludo según la hora.
export function saludo(ahora = new Date()) {
  const h = ahora.getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

export const avisosSinLeer = (avisos = []) => (avisos || []).filter(a => a.unread).length;

/* Mi pedido (22/10/2026): en qué paso va el pedido de su hijo, con las etapas
   de la Tienda (v2_portal_orders). "Que todo el mundo disfrute hacer sus
   pedidos y sean orgullosos Tanners". */
export const PASOS_PEDIDO = ['Recibido', 'Confirmado', 'Con el proveedor', 'Listo', 'Entregado'];
export function avanceDePedido(p = {}) {
  const falta = Math.max(0, Number(p.total || 0) - Number(p.paid || 0));
  const pesos = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 });
  switch (p.stage) {
    case 'por_validar': return { paso: 0, titulo: 'Lo estamos revisando', detalle: 'Confirmamos tallas, nombre y número. Si falta algo te escribimos.' };
    case 'por_cobrar': return { paso: 1, titulo: falta > 0 ? `Falta pagar ${pesos.format(falta)}` : 'Falta tu pago', detalle: 'En cuanto quede pagado entra al siguiente envío al proveedor (los viernes).', pagar: true };
    case 'para_proveedor': return { paso: 1, titulo: 'Listo para producción', detalle: 'Sale con el proveedor el próximo viernes.' };
    case 'con_proveedor': return { paso: 2, titulo: 'En producción', detalle: 'El proveedor ya lo está haciendo. Te avisamos cuando llegue.' };
    case 'para_entregar': return { paso: 3, titulo: '¡Ya llegó! Pasa por él', detalle: 'Está en la tienda del club. Tienes 30 días para recogerlo; después el club ya no se hace responsable de la prenda.' };
    case 'entregado': return { paso: 4, titulo: 'Entregado', detalle: 'Que lo disfrute en la cancha.' };
    default: return { paso: 0, titulo: 'Recibido', detalle: '' };
  }
}
export function piezaTexto(i = {}) {
  const extra = [i.talla ? `Talla ${i.talla}` : null, i.manga === 'larga' ? 'manga larga' : null, i.nombre, i.numero ? `#${i.numero}` : null].filter(Boolean).join(' · ');
  return `${Number(i.quantity || 1) > 1 ? `${i.quantity} × ` : ''}${i.description || 'Pieza'}${extra ? ` · ${extra}` : ''}`;
}
