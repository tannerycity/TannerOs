/* El PDF del corte para el proveedor (22/10/2026).

   Presidencia, sobre la primera versión: "no sale bien... estaría más
   interesante que saliera la playera y salieran los pedidos que hay de esa
   playera. Los shorts que están ahí no son los correctos... esto lo tiene que
   entender cualquier persona que vea este corte: pespuntadores, toda la línea
   de producción".

   Así que la hoja se lee como se trabaja en el taller:
     1. Portada: el corte, el proveedor y cuántas piezas de cada prenda por
        talla. Es lo que mira quien corta.
     2. Una página por prenda, con su foto. En las que llevan nombre y número,
        una tarjeta por pieza con la espalda del jersey dibujada tal como se
        estampa (NOMBRE arriba, número grande), su talla, su manga y un cuadro
        para palomear. Las demás (short, calcetas) sólo por talla.

   Lo arma Producción y también la Tienda al mandar el corte del viernes, y se
   comparte por WhatsApp Business desde el teléfono. Sin pantalla: recibe la
   hoja (v2_production_batch_sheet) y las fotos ya listas, y regresa el PDF. */
import { hojaPorProducto, hojaProveedor, nombreDeArchivoHoja } from '/v2/produccion/hoja.js';
import { coloresDePlayera } from '/v2/jersey-mockup.js';

const C = { marca: [11, 61, 74], oro: [198, 172, 92], tinta: [11, 20, 24], gris: [110, 123, 128], suave: [244, 246, 245],
  linea: [223, 229, 228], blanco: [255, 255, 255], alerta: [178, 74, 20] };
const TIPO = { jersey: 'PLAYERA', short: 'SHORT', calcetas: 'CALCETAS', otra: 'PIEZA' };

function fecha(v, conHora = false) {
  if (!v) return '—';
  const raw = String(v), d = raw.length <= 10 ? new Date(`${raw}T12:00:00`) : new Date(raw);
  return new Intl.DateTimeFormat('es-MX', conHora ? { dateStyle: 'long', timeStyle: 'short' } : { dateStyle: 'long' }).format(d);
}

/* La espalda del jersey, en vectores: se ve igual en cualquier impresora.
   Puntos en unidades de la caja (0 a 1); con manga larga, la manga baja. */
const CORTA = [[.30, 0], [.40, 0], [.50, .07], [.60, 0], [.70, 0], [1, .17], [.90, .39], [.79, .33], [.79, 1], [.21, 1], [.21, .33], [.10, .39], [0, .17]];
const LARGA = [[.30, 0], [.40, 0], [.50, .07], [.60, 0], [.70, 0], [.97, .2], [1, .78], [.87, .79], [.81, .36], [.79, 1], [.21, 1], [.19, .36], [.13, .79], [0, .78], [.03, .2]];
// Del color de la playera pedida (Black, Pink Cantera, Wet Blue...), no del club.
const rgb = hex => { const h = String(hex || '').replace('#', ''); return h.length === 6 ? [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) : C.marca; };
function tonosDe(nombre) {
  const c = coloresDePlayera({ nombreProducto: nombre || '' });
  return { cuerpo: rgb(c.cuerpo), ribete: rgb(c.ribete), texto: rgb(c.texto) };
}
function jersey(doc, x, y, w, h, larga, tonos = tonosDe('')) {
  const pts = (larga ? LARGA : CORTA).map(([px, py]) => [x + px * w, y + py * h]);
  const deltas = pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]);
  doc.setFillColor(...tonos.cuerpo); doc.setDrawColor(...tonos.ribete); doc.setLineWidth(1.6);
  doc.lines(deltas, pts[0][0], pts[0][1], [1, 1], 'FD', true);
  // Cuello en el color del ribete, como la prenda real.
  doc.setLineWidth(2.2);
  doc.line(x + .40 * w, y, x + .50 * w, y + .07 * h); doc.line(x + .50 * w, y + .07 * h, x + .60 * w, y);
  doc.setLineWidth(.5);
}
// El texto más grande que quepa en un ancho, sin pasarse de un tope.
function cabe(doc, texto, ancho, tope, piso = 6) {
  let t = tope; doc.setFontSize(t);
  while (t > piso && doc.getTextWidth(texto) > ancho) { t -= .5; doc.setFontSize(t); }
  return t;
}
function cuadro(doc, x, y, lado = 11) {
  doc.setDrawColor(...C.tinta); doc.setLineWidth(1.1); doc.rect(x, y, lado, lado, 'S'); doc.setLineWidth(.5);
}
function pastilla(doc, texto, x, y, { fondo = C.suave, tinta = C.tinta, tam = 9 } = {}) {
  doc.setFont('helvetica', 'bold'); doc.setFontSize(tam);
  const w = doc.getTextWidth(texto) + 14;
  doc.setFillColor(...fondo); doc.roundedRect(x, y - tam - 3, w, tam + 8, 6, 6, 'F');
  doc.setTextColor(...tinta); doc.text(texto, x + 7, y);
  return w;
}

/* El PDF del proveedor, formato Tremor (11/11/2026). Presidencia: "así los
   llena Zul a mano... lo que quiero es que cuando ya haga el pedido, se
   desglose todo así para ya mandar". Una tabla por diseño de jersey, con su
   foto al lado; un renglón por playera: ID, NOMBRE, NÚMERO, talla de PLAYERA,
   talla de SHORT, PRODUCTO (UNIFORME = jersey + short + medias; JERSEY =
   sólo jersey), COMENTARIOS (manga larga) y STATUS para palomear. Al final,
   shorts y medias sueltos por talla. La talla nunca va escrita en
   comentarios: vive en su columna. */
const COLS = [
  { k: 'id', t: 'ID', w: 26, centro: true },
  { k: 'nombre', t: 'NOMBRE', w: 108 },
  { k: 'numero', t: 'NÚMERO', w: 50, centro: true },
  { k: 'tallaJersey', t: 'PLAYERA', w: 52, centro: true, grupo: 'TALLAS' },
  { k: 'tallaShort', t: 'SHORT', w: 48, centro: true, grupo: 'TALLAS' },
  { k: 'producto', t: 'PRODUCTO', w: 214 },
  { k: 'comentarios', t: 'COMENTARIOS', w: 104 },
  { k: 'status', t: 'STATUS', w: 44, centro: true }
];
export async function hojaPdf({ sheet, orgName, fotos = {}, jsPDF = null }) {
  const Doc = jsPDF || (await import('https://esm.sh/jspdf@2.5.2')).jsPDF;
  const doc = new Doc({ unit: 'pt', format: 'letter', orientation: 'landscape' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 28;
  const b = sheet?.batch || {}, h = hojaProveedor(sheet?.items || []), club = orgName || 'el club';
  const anchoTabla = COLS.reduce((n, c) => n + c.w, 0), xFoto = M + anchoTabla + 16, anchoFoto = W - M - xFoto;
  const ALTO = 18;

  // Encabezado: quién, qué corte y cómo se lee.
  const encabezado = () => {
    doc.setFillColor(...C.marca); doc.rect(0, 0, W, 56, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...C.oro); doc.text(club.toUpperCase(), M, 20);
    doc.setFontSize(16); doc.setTextColor(...C.blanco);
    doc.text(`Pedido al proveedor${b.supplierName ? ` · ${b.supplierName}` : ''}`, M, 40);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(214, 228, 230);
    doc.text(`Corte ${b.folio || 'borrador'} · ${fecha(b.submittedOn || new Date().toISOString())}`, W - M, 22, { align: 'right' });
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.blanco);
    doc.text(`${h.playeras} ${h.playeras === 1 ? 'playera' : 'playeras'} · ${h.uniformes} de uniforme`, W - M, 40, { align: 'right' });
    return 74;
  };
  let y = encabezado();
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...C.gris);
  doc.text('UNIFORME = jersey, short y medias.   JERSEY = sólo el jersey.   STATUS: palomea cuando la pieza esté lista.', M, y); y += 14;
  if (b.notes) { const n = doc.splitTextToSize(`Notas: ${String(b.notes)}`, W - 2 * M); doc.setTextColor(...C.alerta); doc.text(n, M, y); y += n.length * 11 + 4; }

  const cabezaTabla = () => {
    doc.setFillColor(...C.marca); doc.rect(M, y, anchoTabla, 28, 'F');
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.blanco); let x = M;
    const xT = M + COLS.slice(0, 3).reduce((n, c) => n + c.w, 0), wT = COLS[3].w + COLS[4].w;
    doc.setFontSize(7); doc.text('TALLAS', xT + wT / 2, y + 10, { align: 'center' });
    doc.setDrawColor(255, 255, 255); doc.setLineWidth(.4); doc.line(xT + 4, y + 13, xT + wT - 4, y + 13);
    for (const c of COLS) {
      doc.setFontSize(7.5);
      doc.text(c.t, c.centro ? x + c.w / 2 : x + 5, c.grupo ? y + 23 : y + 18, { align: c.centro ? 'center' : 'left' });
      x += c.w;
    }
    y += 28;
  };
  const celda = (texto, c, x, negrita = false) => {
    let t = String(texto ?? ''); doc.setFont('helvetica', negrita ? 'bold' : 'normal');
    doc.setFontSize(c.k === 'producto' ? 7.8 : 8.5); while (t && doc.getTextWidth(t) > c.w - 8) t = t.slice(0, -1);
    if (t !== String(texto ?? '') && t.length > 1) t = t.slice(0, -1) + '…';
    doc.text(t, c.centro ? x + c.w / 2 : x + 5, y + 12.5, { align: c.centro ? 'center' : 'left' });
  };

  const lado = Math.min(anchoFoto, 92);
  const rejilla = (y0, y1) => { doc.setDrawColor(...C.linea); doc.setLineWidth(.4); let xv = M;
    for (const c of COLS) { doc.line(xv, y0, xv, y1); xv += c.w; } doc.line(xv, y0, xv, y1); doc.line(M, y1, M + anchoTabla, y1); };
  for (const d of h.disenos) {
    const alto = 22 + 28 + Math.max(d.renglones.length, 1) * ALTO;
    const cabe = H - 34 - y, pagina = H - 34 - 74;
    // La tabla entera en una página si cabe; si no, al menos título y 3 renglones.
    if (alto > cabe && (alto <= pagina || 22 + 28 + 3 * ALTO > cabe)) { doc.addPage(); y = encabezado(); }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...C.tinta);
    doc.text(d.titulo, M, y + 14); y += 22;
    const yTabla = y;
    // La foto del diseño, a la derecha del título (misma página).
    if (anchoFoto > 60) {
      const foto = fotos[d.modelo];
      if (foto?.data) {
        const rr = Math.min(lado / foto.w, lado / foto.h), fw = foto.w * rr, fh = foto.h * rr;
        try { doc.addImage(foto.data, 'JPEG', xFoto + (anchoFoto - fw) / 2, yTabla, fw, fh); } catch { /* sin foto */ }
      } else jersey(doc, xFoto + (anchoFoto - lado * .8) / 2, yTabla + 4, lado * .8, lado * .72, false, tonosDe(d.modelo));
    }
    cabezaTabla();
    d.renglones.forEach((r, i) => {
      if (y + ALTO > H - 34) { doc.addPage(); y = encabezado(); cabezaTabla(); }
      if (i % 2) { doc.setFillColor(...C.suave); doc.rect(M, y, anchoTabla, ALTO, 'F'); }
      doc.setTextColor(...C.tinta); let x = M;
      const v = { id: i + 1, nombre: String(r.nombre || '').toUpperCase(), numero: r.numero, tallaJersey: r.tallaJersey, tallaShort: r.tallaShort,
        producto: r.producto, comentarios: r.comentarios, status: '' };
      for (const c of COLS) {
        if (c.k === 'comentarios' && /manga larga/i.test(v.comentarios || '')) doc.setTextColor(...C.alerta);
        celda(v[c.k], c, x, c.k === 'nombre' || c.k === 'numero' || (c.k === 'producto' && r.uniforme));
        doc.setTextColor(...C.tinta);
        if (c.k === 'status') cuadro(doc, x + c.w / 2 - 5, y + 4, 10);
        x += c.w;
      }
      rejilla(y, y + ALTO);
      y += ALTO;
    });
    y = Math.max(y, yTabla + (anchoFoto > 60 ? lado : 0)) + 16;
  }

  // Shorts, medias y demás que no van con una playera.
  if (h.sueltas.length) {
    if (y + 60 > H - 34) { doc.addPage(); y = encabezado(); }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...C.tinta); doc.text('SUELTOS (sin playera)', M, y + 14); y += 24;
    for (const sp of h.sueltas) {
      if (y + ALTO > H - 34) { doc.addPage(); y = encabezado(); }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.text(sp.prenda.toUpperCase(), M, y + 12);
      doc.setFont('helvetica', 'normal');
      doc.text(sp.tallas.map(t => `${t.talla}: ${t.cantidad}`).join('     '), M + 200, y + 12);
      cuadro(doc, M + anchoTabla - 22, y + 3, 10);
      y += ALTO;
    }
  }

  const total = doc.internal.getNumberOfPages(), hecho = fecha(new Date().toISOString(), true);
  for (let i = 1; i <= total; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(140, 155, 158);
    doc.text(`${club} · corte ${b.folio || 'borrador'} · generado el ${hecho}`, M, H - 14);
    doc.text(`Página ${i} de ${total}`, W - M, H - 14, { align: 'right' });
  }
  return doc;
}

export function nombreDelPdf(sheet) { return nombreDeArchivoHoja(sheet?.batch?.folio); }

/* Las fotos de cada prenda, listas para el PDF: firmadas como en el resto de
   la app y pasadas a JPEG (jsPDF no lee webp). Si una no carga, esa prenda
   sale con el dibujo; el PDF nunca se detiene por una foto. */
export async function cargaFotos(supabase, sheet) {
  const { getSignedPhotoUrls } = await import('/v2/photo-cache.js');
  const hoja = hojaPorProducto(sheet?.items || []), salida = {};
  const porBucket = new Map();
  for (const p of hoja.productos) if (p.foto?.path) { const l = porBucket.get(p.foto.bucket) || []; l.push(p); porBucket.set(p.foto.bucket, l); }
  for (const [bucket, prods] of porBucket) {
    let urls = {};
    try { urls = await getSignedPhotoUrls(supabase, bucket, prods.map(p => p.foto.path)); } catch { continue; }
    await Promise.all(prods.map(async p => {
      const url = urls[p.foto.path]; if (!url) return;
      try {
        const img = await new Promise((ok, mal) => { const i = new Image(); if (!url.startsWith('blob:')) i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = mal; i.src = url; });
        const lado = 600, r = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * r); c.height = Math.round(img.naturalHeight * r);
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        salida[p.nombre] = { data: c.toDataURL('image/jpeg', .86), w: c.width, h: c.height };
      } catch { /* sin foto */ }
    }));
  }
  return salida;
}

// Compartir el PDF: en el teléfono abre la hoja de compartir (WhatsApp
// Business sale ahí); en la compu lo descarga. Devuelve cómo se fue.
export async function compartePdf(doc, nombre, texto) {
  const blob = doc.output('blob'), archivo = new File([blob], nombre, { type: 'application/pdf' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [archivo] })) { await navigator.share({ files: [archivo], title: nombre, text: texto }); return 'compartido'; }
  } catch (e) { if (e?.name === 'AbortError') return 'cancelado'; }
  doc.save(nombre); return 'descargado';
}
