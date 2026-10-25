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
import { hojaPorProducto, nombreDeArchivoHoja } from '/v2/produccion/hoja.js';
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

export async function hojaPdf({ sheet, orgName, fotos = {}, jsPDF = null }) {
  const Doc = jsPDF || (await import('https://esm.sh/jspdf@2.5.2')).jsPDF;
  const doc = new Doc({ unit: 'pt', format: 'letter', orientation: 'portrait' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 36;
  const b = sheet?.batch || {}, hoja = hojaPorProducto(sheet?.items || []);
  const club = orgName || 'el club';

  /* ---------- Portada ---------- */
  doc.setFillColor(...C.marca); doc.rect(0, 0, W, 150, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...C.oro);
  doc.text(club.toUpperCase(), M, 42);
  doc.setFontSize(26); doc.setTextColor(...C.blanco); doc.text('Hoja de producción', M, 74);
  doc.setFontSize(15); doc.text(`Corte ${b.folio || ''}`, M, 98);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(214, 228, 230);
  doc.text(`Proveedor: ${b.supplierName || 'sin asignar'}`, M, 122);
  doc.text(`Enviado: ${fecha(b.submittedOn)}`, M, 137);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(40); doc.setTextColor(...C.blanco);
  doc.text(String(hoja.total), W - M, 92, { align: 'right' });
  doc.setFontSize(11); doc.setTextColor(...C.oro); doc.text(hoja.total === 1 ? 'pieza' : 'piezas', W - M, 110, { align: 'right' });

  let y = 186;
  doc.setTextColor(...C.tinta); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text('Qué hay que hacer', M, y); y += 8;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...C.gris);
  doc.text('Piezas de cada prenda por talla. Cada prenda tiene su página con foto, en el orden de esta tabla.', M, y + 12); y += 30;

  // La tabla de corte: prenda × talla.
  const tallas = hoja.tallas, colNombre = 190, colTotal = 54;
  const anchoTalla = Math.min(48, (W - 2 * M - colNombre - colTotal) / Math.max(1, tallas.length));
  const fila = (alto, rayada) => { if (rayada) { doc.setFillColor(...C.suave); doc.rect(M, y, W - 2 * M, alto, 'F'); } };
  // Cada columna dice "TALLA" arriba y la talla grande abajo: "16" solo se leía como cantidad.
  doc.setFillColor(...C.tinta); doc.rect(M, y, W - 2 * M, 34, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...C.blanco);
  doc.text('PRENDA', M + 10, y + 21);
  tallas.forEach((t, i) => {
    const cx = M + colNombre + anchoTalla * (i + .5);
    doc.setFontSize(6.5); doc.setTextColor(...C.oro); doc.text('TALLA', cx, y + 12, { align: 'center' });
    doc.setTextColor(...C.blanco); cabe(doc, String(t), anchoTalla - 6, 12, 7); doc.text(String(t), cx, y + 26, { align: 'center' });
  });
  doc.setFontSize(9); doc.text('TOTAL', W - M - colTotal / 2, y + 21, { align: 'center' });
  y += 34;
  hoja.productos.forEach((p, k) => {
    const nombre = doc.splitTextToSize(p.nombre, colNombre - 20), alto = Math.max(32, 14 + nombre.length * 12);
    fila(alto, k % 2 === 1);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...C.oro);
    doc.text(TIPO[p.tipo], M + 10, y + 12);
    doc.setFontSize(10.5); doc.setTextColor(...C.tinta); doc.text(nombre, M + 10, y + 24);
    const porTalla = new Map(p.tallas.map(t => [t.talla, t.cantidad]));
    doc.setFontSize(14);
    tallas.forEach((t, i) => {
      const n = porTalla.get(t);
      doc.setTextColor(...(n ? C.tinta : C.linea));
      doc.text(n ? String(n) : '·', M + colNombre + anchoTalla * (i + .5), y + alto / 2 + 5, { align: 'center' });
    });
    doc.setTextColor(...C.marca); doc.text(String(p.piezas), W - M - colTotal / 2, y + alto / 2 + 5, { align: 'center' });
    y += alto;
  });
  doc.setDrawColor(...C.linea); doc.line(M, y, W - M, y); y += 26;

  const largas = hoja.productos.reduce((n, p) => n + p.largas, 0);
  if (largas) { pastilla(doc, `Ojo: ${largas} ${largas === 1 ? 'pieza va' : 'piezas van'} de MANGA LARGA`, M, y, { fondo: [255, 236, 214], tinta: C.alerta, tam: 10 }); y += 26; }
  if (b.notes) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...C.tinta); doc.text('Notas del corte', M, y); y += 14;
    doc.setFont('helvetica', 'normal'); const n = doc.splitTextToSize(String(b.notes), W - 2 * M); doc.text(n, M, y); y += n.length * 12 + 10;
  }
  // Cómo se lee, para quien la ve por primera vez en el taller.
  y = Math.max(y, H - 170);
  doc.setFillColor(...C.suave); doc.roundedRect(M, y, W - 2 * M, 92, 10, 10, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...C.tinta); doc.text('Cómo leer esta hoja', M + 16, y + 22);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(58, 74, 80);
  ['Cada prenda tiene su página, con su foto.',
   'En las playeras, cada tarjeta es una pieza: estampa el NOMBRE y el NÚMERO tal cual el dibujo. Sin nombre = sólo número.',
   'La talla y la manga van debajo de cada tarjeta. Palomea el cuadro cuando la pieza esté lista.'].forEach((t, i) => doc.text(`${i + 1}.  ${t}`, M + 16, y + 42 + i * 15));

  /* ---------- Una página por prenda ---------- */
  for (const p of hoja.productos) {
    doc.addPage(); y = M;
    const foto = fotos[p.nombre];
    const lado = 118;
    doc.setFillColor(...C.suave); doc.roundedRect(M, y, lado, lado, 12, 12, 'F');
    if (foto?.data) {
      const r = Math.min((lado - 12) / foto.w, (lado - 12) / foto.h), fw = foto.w * r, fh = foto.h * r;
      try { doc.addImage(foto.data, 'JPEG', M + (lado - fw) / 2, y + (lado - fh) / 2, fw, fh); } catch { /* sin foto: queda el dibujo */ }
    } else if (p.tipo === 'jersey') jersey(doc, M + 24, y + 22, lado - 48, lado - 44, false, tonosDe(p.nombre));
    const x0 = M + lado + 20;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...C.oro); doc.text(TIPO[p.tipo], x0, y + 18);
    doc.setTextColor(...C.tinta);
    const t = doc.splitTextToSize(p.nombre, W - M - x0); cabe(doc, t[0] || '', W - M - x0, 22, 14);
    doc.text(doc.splitTextToSize(p.nombre, W - M - x0).slice(0, 2), x0, y + 44);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(...C.gris);
    doc.text(`${p.piezas} ${p.piezas === 1 ? 'pieza' : 'piezas'} · corte ${b.folio || ''}`, x0, y + 70);
    let px = x0;
    for (const s of p.tallas) { const w = pastilla(doc, `Talla ${s.talla}  ×${s.cantidad}`, px, y + 98, { tam: 10 }); px += w + 6; if (px > W - M - 90) break; }
    y += lado + 22;
    if (p.largas) { pastilla(doc, `${p.largas} de MANGA LARGA`, M, y, { fondo: [255, 236, 214], tinta: C.alerta, tam: 10 }); y += 22; }

    if (p.dorsales.length) {
      // Tarjetas de dorsal: tres por renglón.
      const gap = 12, cw = (W - 2 * M - gap * 2) / 3, ch = 212;
      p.dorsales.forEach((d, i) => {
        const col = i % 3;
        if (col === 0 && i > 0) y += ch + gap;
        if (y + ch > H - 40) { doc.addPage(); y = M; }
        const x = M + col * (cw + gap);
        const larga = d.manga === 'larga';
        doc.setDrawColor(...(larga ? C.alerta : C.linea)); doc.setLineWidth(larga ? 1.4 : .8); doc.roundedRect(x, y, cw, ch, 10, 10, 'S'); doc.setLineWidth(.5);
        const jw = 112, jh = 104, jx = x + (cw - jw) / 2, jy = y + 12;
        const tonos = tonosDe(p.nombre);
        jersey(doc, jx, jy, jw, jh, larga, tonos);
        doc.setFont('helvetica', 'bold'); doc.setTextColor(...tonos.texto);
        const nombre = String(d.nombre || '').toUpperCase();
        if (nombre) { cabe(doc, nombre, jw * .5, 10, 5); doc.text(nombre, jx + jw / 2, jy + jh * .27, { align: 'center' }); }
        if (d.numero) { cabe(doc, String(d.numero), jw * .5, 36, 18); doc.text(String(d.numero), jx + jw / 2, jy + jh * .72, { align: 'center' }); }
        let ty = jy + jh + 20;
        // "TALLA" chiquito y la talla grande debajo, como en la portada (25/10/2026).
        doc.setFontSize(7.5); doc.setTextColor(...C.gris); doc.text('TALLA', x + 12, ty - 6);
        doc.setTextColor(...C.tinta); doc.setFontSize(22); doc.text(String(d.talla || '—'), x + 12, ty + 14);
        cuadro(doc, x + cw - 26, ty - 2, 14);
        ty += 30; doc.setFontSize(9.5);
        if (larga) { doc.setTextColor(...C.alerta); doc.text('MANGA LARGA', x + 12, ty); }
        else { doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.gris); doc.text(d.manga === 'corta' ? 'Manga corta' : 'Manga sin indicar', x + 12, ty); }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...C.gris);
        if (!d.nombre && d.numero) { ty += 13; doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.tinta); doc.text('SIN NOMBRE: sólo número', x + 12, ty); doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.gris); }
        ty += 13; doc.text(doc.splitTextToSize(`${d.folio}${d.cantidad > 1 ? ` · ${d.cantidad} piezas` : ''}`, cw - 24)[0], x + 12, ty);
        if (d.nota) { ty += 11; doc.setTextColor(...C.alerta); doc.text(doc.splitTextToSize(d.nota, cw - 24).slice(0, 2), x + 12, ty); }
      });
      y += ch + 18;
      const sin = p.piezas - p.dorsales.reduce((n, d) => n + d.cantidad, 0);
      if (sin > 0) { if (y > H - 60) { doc.addPage(); y = M; } doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...C.tinta); doc.text(`Además: ${sin} ${sin === 1 ? 'pieza' : 'piezas'} sin nombre ni número (ver tallas arriba).`, M, y); }
    } else {
      // Sin personalizar: cuántas por talla, con su cuadro.
      doc.setFillColor(...C.tinta); doc.rect(M, y, W - 2 * M, 26, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...C.blanco);
      doc.text('TALLA', M + 14, y + 17); doc.text('PIEZAS', M + 220, y + 17); doc.text('LISTO', W - M - 60, y + 17);
      y += 26;
      p.tallas.forEach((s, k) => {
        if (k % 2) { doc.setFillColor(...C.suave); doc.rect(M, y, W - 2 * M, 36, 'F'); }
        doc.setTextColor(...C.tinta); doc.setFontSize(16); doc.text(String(s.talla), M + 14, y + 24);
        doc.text(String(s.cantidad), M + 220, y + 24); cuadro(doc, W - M - 52, y + 12, 13);
        y += 36;
      });
    }
  }

  // Pie: corte y página en todas.
  const total = doc.internal.getNumberOfPages(), hecho = fecha(new Date().toISOString(), true);
  for (let i = 1; i <= total; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(140, 155, 158);
    doc.text(`${club} · corte ${b.folio || ''} · generado el ${hecho}`, M, H - 16);
    doc.text(`Página ${i} de ${total}`, W - M, H - 16, { align: 'right' });
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
