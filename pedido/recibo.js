/* El recibo Tanner (29/10/2026).
 *
 * Presidencia: "que en esta pantalla tengas la opción de descargar la imagen
 * del pedido o que haya alguna forma de que puedan volver a entrar... después
 * de que no lo vi". Y: "que se sienta Tanner... super minimalista, sigue el
 * brandbook".
 *
 * Tres salidas para que el pedido no se pierda:
 *   1. Mis pedidos: el recibo se guarda en este celular (sin teléfono ni
 *      correo) y se vuelve a abrir desde el ícono de la cabecera.
 *   2. Imagen del recibo: navy, dorado y escudo, con folio, piezas, total y
 *      cómo pagar. Se comparte o se guarda en la galería.
 *   3. Mandármelo por WhatsApp: el folio, el total y la CLABE en un mensaje
 *      que la familia se manda a sí misma.
 *
 * Lo puro (guardar, buscar, textos) no toca el DOM: scripts/qa-tienda-recibo.mjs.
 */
export const MAX_RECIBOS = 12;
export const llaveRecibos = club => `tiendaMisPedidos:${club || 'club'}`;

const dinero = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

/* Lo que se pidió, en renglones para el recibo. */
export function lineasDeRecibo(carrito = {}) {
  return Object.values(carrito || {}).map(l => {
    const espalda = [l.personalizationName, l.numero ? `#${l.numero}` : ''].filter(Boolean).join(' ');
    const detalle = [l.kind === 'bundle' ? (l.tier ? `Kit ${String(l.tier).toLowerCase()}` : 'Kit') : (l.talla ? `Talla ${l.talla}` : ''),
      l.manga ? `Manga ${String(l.manga).toLowerCase()}` : '', espalda].filter(Boolean).join(' · ');
    const cantidad = Number(l.cantidad || 1);
    return { nombre: String(l.nombreProducto || 'Pieza'), detalle, cantidad, importe: Number(l.precioUnitario || 0) * cantidad };
  });
}

/* El recibo que se guarda en el teléfono. Sin teléfono ni correo. */
export function reciboDe(result = {}, { nombre = '', lineas = [], ahora = new Date() } = {}) {
  return {
    folio: String(result.folio || ''), id: result.id || null, total: Number(result.total || 0), descuento: Number(result.discount || 0),
    nombre: String(nombre || '').trim().replace(/\s+/g, ' '), fecha: ahora.toISOString(), lineas: lineas.slice(0, 30)
  };
}

export function guardaRecibo(lista = [], recibo) {
  if (!recibo?.folio) return lista;
  return [recibo, ...lista.filter(r => r.folio !== recibo.folio)].slice(0, MAX_RECIBOS);
}
export const primerNombre = r => String(r?.nombre || '').split(' ')[0] || '';
export const buscaRecibo = (lista = [], folio = '') => lista.find(r => r.folio === folio) || null;

export function leeRecibos(texto) {
  try { const v = JSON.parse(texto || '[]'); return Array.isArray(v) ? v.filter(r => r && r.folio) : []; } catch { return []; }
}

export function fechaCorta(iso) {
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* El mensaje que la familia se manda a sí misma: con eso ya no se pierde. */
export function textoParaMi({ recibo, pago, liga = '', club = 'Tannery City' }) {
  const filas = (pago?.filas || []).map(([k, v]) => `${k}: ${v}`).join('\n');
  return [`Mi pedido en la tienda de ${club}`, `Folio: ${recibo.folio}`, `Total: ${dinero.format(recibo.total)}`,
    filas ? `\nPara pagar por transferencia:\n${filas}` : '', liga ? `\nVer mi pedido: ${liga}` : ''].filter(Boolean).join('\n');
}

/* ---------- La imagen (sólo en el navegador) ---------- */
const C = { navy: '#07191e', navy2: '#0f2b32', oro: '#c8ae62', oroClaro: '#e9d19c', oroOsc: '#a9895a', crema: '#f6f2e8', papel: '#fffdf8', gris: '#5c6a63', linea: '#e7dfc8' };
const W = 1080;

function cargaImagen(src) {
  return new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
}
function espaciado(g, texto, x, y, sep, alinea = 'center') {
  const letras = [...texto], ancho = letras.reduce((a, l) => a + g.measureText(l).width, 0) + sep * (letras.length - 1);
  let cx = alinea === 'center' ? x - ancho / 2 : x;
  g.textAlign = 'left';
  for (const l of letras) { g.fillText(l, cx, y); cx += g.measureText(l).width + sep; }
}
function corta(g, texto, max) {
  if (g.measureText(texto).width <= max) return texto;
  let t = texto; while (t.length > 1 && g.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

export async function dibujaRecibo(recibo, { pago = { filas: [] }, club = 'Tannery City' } = {}) {
  try { await Promise.all(['800 90px "Barlow Condensed"', '700 40px "Barlow Condensed"', '400 26px Inter', '600 26px Inter', '800 26px Inter'].map(f => document.fonts.load(f))); } catch { /* sin fuente, la del sistema */ }
  const lineas = recibo.lineas || [], filas = pago.filas || [];
  const H = 900 + lineas.length * 96 + (recibo.descuento > 0 ? 50 : 0) + (filas.length ? 140 + filas.length * 70 : 0) + 260;
  const c = document.createElement('canvas'); c.width = W; c.height = Math.max(1350, H);
  const g = c.getContext('2d');
  g.fillStyle = C.crema; g.fillRect(0, 0, W, c.height);

  // Arriba: navy con el escudo dorado.
  const alto = 470;
  const fondo = g.createRadialGradient(W / 2, 0, 40, W / 2, 0, 900); fondo.addColorStop(0, '#14363e'); fondo.addColorStop(.65, C.navy);
  g.fillStyle = fondo; g.fillRect(0, 0, W, alto);
  g.save(); g.globalAlpha = .06; g.strokeStyle = C.oro; g.lineWidth = 2;
  for (let x = -alto; x < W; x += 30) { g.beginPath(); g.moveTo(x, alto); g.lineTo(x + alto, 0); g.stroke(); }
  g.restore();
  const escudo = await cargaImagen('/brand/crest-gold.png');
  if (escudo) { const h = 130, w = escudo.width * h / escudo.height; g.drawImage(escudo, W / 2 - w / 2, 56, w, h); }
  g.fillStyle = C.oroClaro; g.font = '800 24px Inter'; espaciado(g, 'TIENDA TANNER', W / 2, 236, 7);
  g.fillStyle = '#fff'; g.font = '800 104px "Barlow Condensed"'; g.textAlign = 'center'; g.fillText('PEDIDO RECIBIDO', W / 2, 340);
  g.fillStyle = '#c9d4d6'; g.font = '400 28px Inter';
  g.fillText(recibo.nombre ? `Gracias por vestir los colores, ${primerNombre(recibo)}.` : 'Gracias por vestir los colores.', W / 2, 396);

  // El boleto: folio grande, con muescas.
  let y = alto - 60;
  const bx = 90, bw = W - 180, bh = 210;
  g.fillStyle = C.papel; g.beginPath(); g.roundRect(bx, y, bw, bh, 28); g.fill();
  g.strokeStyle = C.oro; g.lineWidth = 3; g.stroke();
  g.fillStyle = C.crema; [y + bh / 2].forEach(cy => { g.beginPath(); g.arc(bx, cy, 22, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(bx + bw, cy, 22, 0, Math.PI * 2); g.fill(); });
  g.fillStyle = C.oroOsc; g.font = '800 22px Inter'; espaciado(g, 'FOLIO', W / 2, y + 56, 6);
  g.fillStyle = C.navy; g.font = '800 92px "Barlow Condensed"'; g.textAlign = 'center'; g.fillText(recibo.folio || '', W / 2, y + 146);
  g.fillStyle = C.gris; g.font = '400 24px Inter'; g.fillText(fechaCorta(recibo.fecha), W / 2, y + 186);
  y += bh + 70;

  // Lo que pediste.
  g.textAlign = 'left'; g.fillStyle = C.oroOsc; g.font = '800 22px Inter'; espaciado(g, 'LO QUE PEDISTE', 90, y, 5, 'left'); y += 30;
  for (const l of lineas) {
    y += 46; g.fillStyle = C.navy; g.font = '600 32px Inter'; g.textAlign = 'left';
    g.fillText(corta(g, `${l.cantidad > 1 ? `${l.cantidad} × ` : ''}${l.nombre}`, 640), 90, y);
    g.textAlign = 'right'; g.font = '600 32px Inter'; g.fillText(dinero.format(l.importe), W - 90, y);
    if (l.detalle) { y += 36; g.textAlign = 'left'; g.fillStyle = C.gris; g.font = '400 24px Inter'; g.fillText(corta(g, l.detalle, 820), 90, y); }
    y += 14; g.strokeStyle = C.linea; g.lineWidth = 2; g.beginPath(); g.moveTo(90, y); g.lineTo(W - 90, y); g.stroke();
  }
  if (recibo.descuento > 0) { y += 46; g.textAlign = 'left'; g.fillStyle = C.gris; g.font = '400 26px Inter'; g.fillText('Descuento por tu código', 90, y); g.textAlign = 'right'; g.fillText(`−${dinero.format(recibo.descuento)}`, W - 90, y); }
  y += 84; g.textAlign = 'left'; g.fillStyle = C.navy; g.font = '700 44px "Barlow Condensed"'; g.fillText('TOTAL', 90, y);
  g.textAlign = 'right'; g.font = '800 72px "Barlow Condensed"'; g.fillText(dinero.format(recibo.total), W - 90, y + 6);

  // Cómo pagar.
  if (filas.length) {
    y += 60; const ph = 90 + filas.length * 70;
    g.fillStyle = C.papel; g.beginPath(); g.roundRect(70, y, W - 140, ph, 24); g.fill(); g.strokeStyle = C.linea; g.lineWidth = 2; g.stroke();
    g.textAlign = 'left'; g.fillStyle = C.oroOsc; g.font = '800 22px Inter'; espaciado(g, 'CÓMO PAGAR · TRANSFERENCIA', 104, y + 54, 5, 'left');
    let fy = y + 54;
    for (const [k, v] of filas) {
      fy += 70; g.fillStyle = C.gris; g.font = '400 24px Inter'; g.textAlign = 'left'; g.fillText(k, 104, fy - 24);
      g.fillStyle = C.navy; g.font = k === 'CLABE' ? '800 34px Inter' : '600 30px Inter'; g.fillText(k === 'CLABE' ? String(v).replace(/(\d{3})(?=\d)/g, '$1 ') : corta(g, String(v), 820), 104, fy + 10);
    }
    y += ph;
  }

  // Abajo: el lema del club.
  const pie = c.height - 170;
  g.fillStyle = C.navy; g.fillRect(0, pie, W, 170);
  g.fillStyle = C.oro; g.font = '600 22px Inter'; espaciado(g, 'CURTIMOS CAMPEONES DEL MUNDO', W / 2, pie + 70, 6);
  g.fillStyle = '#fff'; g.font = '800 48px "Barlow Condensed"'; g.textAlign = 'center'; g.fillText('#WeAreTanners', W / 2, pie + 128);
  g.fillStyle = C.oroOsc; g.font = '400 20px Inter'; g.fillText(club, W / 2, pie - 26);
  return await new Promise(ok => c.toBlob(ok, 'image/png'));
}
