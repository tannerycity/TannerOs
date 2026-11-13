/* Recibo de pago en PDF (13/11/2026).
 *
 * Presidencia: "cuando me pagan... me gustaría que tuviera un botón que
 * dijera ver recibo, descargar recibo, enviar recibo por WhatsApp, y ya un
 * PDF bien perrón, estilo Tannery City, para que lo vean y se quede el
 * registro".
 *
 * Media carta vertical, con la marca del club que esté abierto (nombre,
 * colores y escudo salen de su branding: aquí no hay nombres fijos).
 *
 * Lo puro (`datosDeRecibo`, `nombreDelRecibo`) se prueba sin navegador; el
 * dibujo recibe jsPDF por parámetro para lo mismo.
 */
const dinero = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const METODO = { cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta' };
const rgb = (hex, def) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim()); if (!m) return def; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const limpio = t => String(t ?? '').replace(/\s+/g, ' ').trim();

/* Lo que lleva el recibo, ya ordenado y sin nada de más: ni teléfono, ni
   correo, ni notas internas del cobro. */
export function datosDeRecibo({ club, folio, fecha, tanners = [], lineas = [], metodos = [], total, cobro = '', referencia = '' } = {}) {
  const conceptos = lineas.map(l => ({ concepto: limpio(l.label), monto: Number(l.amount) || 0 })).filter(l => l.concepto && l.monto > 0);
  const suma = Math.round(conceptos.reduce((n, l) => n + l.monto, 0) * 100) / 100;
  return {
    club: limpio(club) || 'El club',
    folio: limpio(folio),
    fecha: limpio(fecha),
    tanners: tanners.map(limpio).filter(Boolean),
    conceptos,
    total: Number.isFinite(Number(total)) && Number(total) > 0 ? Number(total) : suma,
    metodos: metodos.map(m => ({ nombre: METODO[m.method] || limpio(m.method) || 'Pago', monto: Number(m.amount) || 0 })).filter(m => m.monto > 0),
    cobro: limpio(cobro),
    referencia: limpio(referencia)
  };
}

export function nombreDelRecibo(d) {
  const quien = (d.tanners[0] || 'pago').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'pago';
  return `Recibo-${d.folio || 'pago'}-${quien}.pdf`;
}

/* El PDF. `marca` = { primario, secundario, acento, escudo (dataURL o nada) }. */
export async function reciboPdf(datos, { marca = {}, jsPDF = null } = {}) {
  const Doc = jsPDF || (await import('/vendor/jspdf.mjs')).jsPDF;
  const d = datos.conceptos ? datos : datosDeRecibo(datos);
  const doc = new Doc({ unit: 'pt', format: [396, 612], orientation: 'portrait' });
  const W = 396, H = 612, M = 28;
  const C = { marca: rgb(marca.primario, [1, 42, 58]), teal: rgb(marca.secundario, [8, 125, 142]), oro: rgb(marca.acento, [198, 172, 92]),
    tinta: [26, 26, 26], gris: [102, 115, 122], linea: [222, 219, 208], marfil: [245, 243, 235], blanco: [255, 255, 255] };
  const cabe = (texto, ancho, tope, piso = 7) => { let t = tope; doc.setFontSize(t); while (t > piso && doc.getTextWidth(texto) > ancho) { t -= .5; doc.setFontSize(t); } return t; };

  // Encabezado: escudo, club, y el folio a la derecha.
  doc.setFillColor(...C.marca); doc.rect(0, 0, W, 104, 'F');
  doc.setFillColor(...C.oro); doc.rect(0, 104, W, 3, 'F');
  let x = M;
  if (marca.escudo) { try { doc.addImage(marca.escudo, 'PNG', M, 24, 56, 56, undefined, 'FAST'); x = M + 68; } catch { x = M; } }
  doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.oro);
  cabe(d.club.toUpperCase(), W - x - M - 96, 11); doc.text(d.club.toUpperCase(), x, 46, { charSpace: 1 });
  doc.setTextColor(...C.blanco); doc.setFontSize(20); doc.text('Recibo de pago', x, 70);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(214, 228, 230);
  doc.text('FOLIO', W - M, 40, { align: 'right' });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...C.blanco); doc.text(d.folio || '—', W - M, 60, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(214, 228, 230); doc.text(d.fecha, W - M, 76, { align: 'right' });

  // De quién es el pago.
  let y = 136;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...C.teal); doc.text('RECIBIMOS EL PAGO DE', M, y, { charSpace: .8 });
  y += 20; doc.setTextColor(...C.tinta);
  const quien = d.tanners.join(' y ') || 'Familia';
  cabe(quien, W - 2 * M, 17, 10); doc.text(quien, M, y);

  // Conceptos.
  y += 26;
  doc.setDrawColor(...C.linea); doc.setLineWidth(.8); doc.line(M, y, W - M, y);
  y += 16; doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...C.gris);
  doc.text('CONCEPTO', M, y, { charSpace: .8 }); doc.text('IMPORTE', W - M, y, { align: 'right' });
  y += 8;
  for (const l of d.conceptos) {
    const renglones = doc.setFont('helvetica', 'normal').setFontSize(11).splitTextToSize(l.concepto, W - 2 * M - 96);
    const alto = 12 + renglones.length * 13;
    if (y + alto > H - 190) { doc.addPage(); y = 40; }
    doc.setTextColor(...C.tinta); doc.text(renglones, M, y + 16);
    doc.setFont('helvetica', 'bold'); doc.text(dinero.format(l.monto), W - M, y + 16, { align: 'right' });
    y += alto; doc.setDrawColor(...C.linea); doc.setLineWidth(.5); doc.line(M, y, W - M, y);
  }

  // Total.
  y += 14;
  doc.setFillColor(...C.marfil); doc.roundedRect(M, y, W - 2 * M, 54, 8, 8, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...C.teal); doc.text('TOTAL PAGADO', M + 14, y + 22, { charSpace: .8 });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...C.gris);
  const como = d.metodos.length > 1 ? d.metodos.map(m => `${m.nombre} ${dinero.format(m.monto)}`).join(' + ') : (d.metodos[0]?.nombre || '');
  if (como) { cabe(como, W - 2 * M - 150, 9, 6.5); doc.text(como, M + 14, y + 39); }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(...C.marca); doc.text(dinero.format(d.total), W - M - 14, y + 35, { align: 'right' });
  y += 76;

  // Datos del cobro.
  const datos2 = [d.cobro && ['Recibió', d.cobro], d.referencia && ['Referencia', d.referencia]].filter(Boolean);
  for (const [k, v] of datos2) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...C.gris); doc.text(k.toUpperCase(), M, y, { charSpace: .8 });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...C.tinta); cabe(v, W - 2 * M - 80, 10, 7); doc.text(v, M + 80, y);
    y += 17;
  }

  // Pie.
  doc.setDrawColor(...C.oro); doc.setLineWidth(1.2); doc.line(M, H - 70, M + 36, H - 70);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...C.marca); doc.text('¡Gracias por tu pago!', M, H - 50);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...C.gris);
  doc.text(`Comprobante de pago de ${d.club}. Guárdalo: con el folio ${d.folio || ''} lo encontramos rápido.`.replace(/\s+\./, '.'), M, H - 34, { maxWidth: W - 2 * M });
  doc.text('No es un comprobante fiscal.', M, H - 22);
  return doc;
}

/* La marca del club que está abierto, tal como la cargó su branding. El escudo
   se baja una vez; si no se puede, el recibo sale sin él. */
export async function marcaDelClub(branding = globalThis.__tosBranding, urlDe = null) {
  const c = branding?.colors || {}, a = branding?.assets || {};
  const marca = { nombre: String(branding?.brand || '').trim(), primario: c.primary, secundario: c.secondary, acento: c.accent, escudo: null };
  const ruta = a.mark || a.logoDark || a.logo;
  if (ruta && typeof fetch === 'function' && typeof createImageBitmap === 'function') {
    try {
      const url = urlDe ? urlDe(ruta) : (await import('/v2/branding.js')).brandingAssetUrl(ruta);
      marca.escudo = await aPng(await (await fetch(url, { cache: 'force-cache' })).blob());
    } catch { /* sin escudo */ }
  }
  return marca;
}
async function aPng(blob) {
  const bmp = await createImageBitmap(blob);
  const lado = 224, c = document.createElement('canvas'); c.width = lado; c.height = lado;
  const k = Math.min(lado / bmp.width, lado / bmp.height), w = bmp.width * k, h = bmp.height * k;
  c.getContext('2d').drawImage(bmp, (lado - w) / 2, (lado - h) / 2, w, h);
  return c.toDataURL('image/png');
}
