/* REPORTE PARA EL PATROCINADOR (24/10/2026).
 *
 * "Esto hicimos por tu marca": lo que el patrocinador recibe para renovar.
 * No es el kit interno: aquí no hay "Pendiente" ni lo que falta cobrar. Va en
 * positivo, con las fotos de evidencia al frente:
 *   1. Portada: la marca, el periodo y cuánto se ha cumplido.
 *   2. Lo que hicimos: cada compromiso entregado con su foto.
 *   3. Lo que viene: lo que falta, como "próximamente".
 *   4. Tu impacto: lo que su apoyo hizo posible (lo recibido y los becados).
 *   5. Gracias, con quién lleva la cuenta.
 * datosDelReporte() no dibuja (se prueba con node); reportePdf() arma el PDF
 * con jsPDF (inyectable en las pruebas).
 */

const C = { marca: [11, 61, 74], oro: [198, 172, 92], tinta: [11, 20, 24], gris: [110, 123, 128], suave: [244, 246, 245], linea: [223, 229, 228], blanco: [255, 255, 255], verde: [29, 122, 70] };
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fechaLarga = f => { if (!f) return ''; const [a, m, d] = String(f).slice(0, 10).split('-').map(Number); return `${d} de ${MESES[m - 1]} de ${a}`; };
const cantidad = i => (i.quantity != null ? `${Number(i.quantity)} ${i.unit || ''}`.trim() : '');

export function datosDelReporte({ sponsor, agreements = [], items = [], evidence = [], becados = [], hoy }) {
  const acuerdos = agreements.filter(a => a.sponsorId === sponsor.id && a.status !== 'cancelled');
  const ids = new Set(acuerdos.map(a => a.id));
  const suyos = items.filter(i => ids.has(i.agreementId) && i.auditStatus !== 'venta_aparte').sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const fotosDe = id => evidence.filter(e => e.itemId === id && e.photoPath);
  const damos = suyos.filter(i => i.direction === 'give');
  const hechos = damos.filter(i => i.fulfilled).map(i => ({ id: i.id, texto: i.description, detalle: cantidad(i), cuando: i.fulfilledAt ? fechaLarga(i.fulfilledAt) : '', fotos: fotosDe(i.id) }))
    // Lo que tiene foto primero: es lo que convence.
    .sort((a, b) => b.fotos.length - a.fotos.length);
  const vienen = damos.filter(i => !i.fulfilled).map(i => ({ id: i.id, texto: i.description, detalle: cantidad(i) }));
  const recibido = suyos.filter(i => i.direction === 'receive' && i.fulfilled && i.type !== 'money').map(i => ({ texto: i.description, detalle: cantidad(i) }));
  const vigentes = acuerdos.filter(a => a.status === 'active');
  const base = vigentes.length ? vigentes : acuerdos;
  const inicio = base.map(a => a.startsOn).filter(Boolean).sort()[0] || null;
  const fin = base.map(a => a.endsOn).filter(Boolean).sort().at(-1) || null;
  return {
    marca: sponsor.name, contacto: sponsor.contactName || '', responsable: sponsor.ownerName || '',
    periodo: inicio ? `Del ${fechaLarga(inicio)} al ${fechaLarga(hoy)}` : `Al ${fechaLarga(hoy)}`,
    vigencia: fin ? `Acuerdo vigente hasta el ${fechaLarga(fin)}` : '',
    cumplidos: hechos.length, total: damos.length,
    fotos: hechos.reduce((n, h) => n + h.fotos.length, 0),
    hechos, vienen, recibido,
    becados: becados.map(b => ({ nombre: b.player_name || b.name || '', aporte: b.funding_mode === 'percentage' ? `${Number(b.sponsor_value)}% de su mensualidad` : `$${Math.round(Number(b.sponsor_value) || 0).toLocaleString('es-MX')} al mes` })).filter(b => b.nombre),
  };
}

export function nombreDelReporte(marca, hoy) {
  const limpio = String(marca || 'marca').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  return `Reporte-${limpio}-${String(hoy).slice(0, 10)}.pdf`;
}

// fotos: { [photoPath]: { data, w, h } } en JPEG, ya cargadas.
export async function reportePdf({ datos, club, fotos = {}, jsPDF = null }) {
  const Doc = jsPDF || (await import('https://esm.sh/jspdf@2.5.2')).jsPDF;
  const doc = new Doc({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 44;
  let y = M;
  const nueva = () => { doc.addPage(); y = M; };
  const cabe = (alto) => { if (y + alto > H - 54) nueva(); };
  const titulo = (kicker, texto) => {
    cabe(60);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...C.oro); doc.text(kicker, M, y);
    doc.setFontSize(20); doc.setTextColor(...C.tinta); doc.text(texto, M, y + 24); y += 44;
  };
  const imagen = (f, x, yy, w, h) => {
    if (!f?.data) return false;
    const r = Math.min(w / f.w, h / f.h), fw = f.w * r, fh = f.h * r;
    try { doc.addImage(f.data, 'JPEG', x + (w - fw) / 2, yy + (h - fh) / 2, fw, fh); return true; } catch { return false; }
  };

  /* Portada */
  doc.setFillColor(...C.marca); doc.rect(0, 0, W, 300, 'F');
  doc.setFillColor(...C.oro); doc.rect(0, 300, W, 6, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...C.oro); doc.text(String(club || '').toUpperCase(), M, 62);
  doc.setFontSize(14); doc.setTextColor(...C.blanco); doc.text('Reporte de patrocinio', M, 112);
  let t = 44; doc.setFontSize(t); while (t > 22 && doc.getTextWidth(datos.marca) > W - 2 * M) { t -= 2; doc.setFontSize(t); }
  doc.text(doc.splitTextToSize(datos.marca, W - 2 * M).slice(0, 2), M, 164);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(12); doc.setTextColor(220, 232, 234);
  doc.text(datos.periodo, M, 236); if (datos.vigencia) doc.text(datos.vigencia, M, 254);

  // Tres números grandes.
  y = 350;
  const cajas = [
    [`${datos.cumplidos} de ${datos.total}`, 'compromisos cumplidos'],
    [String(datos.fotos), datos.fotos === 1 ? 'foto de evidencia' : 'fotos de evidencia'],
    [String(datos.becados.length || datos.recibido.length), datos.becados.length ? (datos.becados.length === 1 ? 'Tanner becado' : 'Tanners becados') : 'apoyos recibidos'],
  ];
  const cw = (W - 2 * M - 24) / 3;
  cajas.forEach(([n, l], i) => {
    const x = M + i * (cw + 12);
    doc.setFillColor(...C.suave); doc.roundedRect(x, y, cw, 92, 12, 12, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(28); doc.setTextColor(...(i === 0 ? C.verde : C.marca)); doc.text(n, x + 16, y + 46);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...C.gris); doc.text(l, x + 16, y + 70);
  });
  y += 124;
  if (datos.total) {
    const pct = datos.cumplidos / datos.total;
    doc.setFillColor(...C.linea); doc.roundedRect(M, y, W - 2 * M, 12, 6, 6, 'F');
    if (pct > 0) { doc.setFillColor(...C.verde); doc.roundedRect(M, y, Math.max(12, (W - 2 * M) * pct), 12, 6, 6, 'F'); }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...C.tinta);
    doc.text(`${Math.round(pct * 100)}% de lo acordado ya está entregado`, M, y + 34); y += 60;
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11.5); doc.setTextColor(58, 74, 80);
  const intro = `${datos.contacto ? `${datos.contacto}, gracias` : 'Gracias'} por creer en ${club}. Aquí está, con fotos, lo que hicimos juntos por ${datos.marca}.`;
  doc.text(doc.splitTextToSize(intro, W - 2 * M), M, y);

  /* Lo que hicimos */
  if (datos.hechos.length) {
    nueva(); titulo('LO QUE HICIMOS POR TU MARCA', 'Entregado');
    const conFoto = datos.hechos.filter(h => h.fotos.some(f => fotos[f.photoThumbPath || f.photoPath] || fotos[f.photoPath]));
    const sinFoto = datos.hechos.filter(h => !conFoto.includes(h));
    const gap = 14, cwf = (W - 2 * M - gap) / 2, alto = 236;
    conFoto.forEach((h, i) => {
      const col = i % 2;
      if (col === 0) cabe(alto + gap);
      const x = M + col * (cwf + gap);
      doc.setDrawColor(...C.linea); doc.setLineWidth(.8); doc.roundedRect(x, y, cwf, alto, 12, 12, 'S');
      doc.setFillColor(...C.suave); doc.roundedRect(x + 8, y + 8, cwf - 16, 158, 8, 8, 'F');
      const f = h.fotos.map(e => fotos[e.photoPath] || fotos[e.photoThumbPath]).find(Boolean);
      imagen(f, x + 8, y + 8, cwf - 16, 158);
      doc.setFillColor(...C.verde); doc.circle(x + 22, y + 186, 7, 'F');
      doc.setDrawColor(...C.blanco); doc.setLineWidth(1.6); doc.line(x + 18.5, y + 186, x + 21, y + 188.8); doc.line(x + 21, y + 188.8, x + 26, y + 182.8); doc.setLineWidth(.5);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(...C.tinta);
      doc.text(doc.splitTextToSize(h.texto, cwf - 50).slice(0, 2), x + 36, y + 190);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...C.gris);
      doc.text([h.detalle, h.cuando, h.fotos.length > 1 ? `${h.fotos.length} fotos` : ''].filter(Boolean).join(' · '), x + 36, y + 222);
      if (col === 1 || i === conFoto.length - 1) y += alto + gap;
    });
    sinFoto.forEach(h => {
      cabe(40);
      doc.setFillColor(...C.verde); doc.circle(M + 8, y + 2, 7, 'F');
      doc.setDrawColor(...C.blanco); doc.setLineWidth(1.6); doc.line(M + 4.5, y + 2, M + 7, y + 4.8); doc.line(M + 7, y + 4.8, M + 12, y - 1.2); doc.setLineWidth(.5);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...C.tinta); doc.text(doc.splitTextToSize(h.texto, W - 2 * M - 30)[0], M + 24, y + 6);
      const d = [h.detalle, h.cuando].filter(Boolean).join(' · ');
      if (d) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...C.gris); doc.text(d, M + 24, y + 20); }
      y += 36;
    });
  }

  /* Lo que viene */
  if (datos.vienen.length) {
    y += 10; titulo('LO QUE VIENE', 'Próximamente para tu marca');
    datos.vienen.forEach(v => {
      cabe(34);
      doc.setDrawColor(...C.oro); doc.setLineWidth(1.6); doc.circle(M + 8, y + 2, 7, 'S'); doc.setLineWidth(.5);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(12); doc.setTextColor(...C.tinta);
      doc.text(doc.splitTextToSize(v.texto + (v.detalle ? ` (${v.detalle})` : ''), W - 2 * M - 30)[0], M + 24, y + 6);
      y += 30;
    });
  }

  /* Tu impacto */
  if (datos.becados.length || datos.recibido.length) {
    y += 10; titulo('TU IMPACTO EN EL CLUB', 'Lo que tu apoyo hizo posible');
    datos.becados.forEach(b => {
      cabe(48);
      doc.setFillColor(...C.suave); doc.roundedRect(M, y - 14, W - 2 * M, 40, 10, 10, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...C.tinta); doc.text(b.nombre, M + 14, y + 4);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...C.gris); doc.text(`Entrena gracias a ti · ${b.aporte}`, M + 14, y + 18);
      y += 48;
    });
    datos.recibido.forEach(r => {
      cabe(26);
      doc.setFillColor(...C.oro); doc.circle(M + 6, y + 2, 3.5, 'F');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(11.5); doc.setTextColor(...C.tinta);
      doc.text(doc.splitTextToSize(r.texto + (r.detalle ? ` (${r.detalle})` : ''), W - 2 * M - 24)[0], M + 18, y + 6);
      y += 24;
    });
  }

  /* Gracias */
  cabe(84); y += 8;
  doc.setFillColor(...C.marca); doc.roundedRect(M, y, W - 2 * M, 72, 14, 14, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(...C.blanco); doc.text(`Gracias, ${datos.marca}.`, M + 22, y + 30);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(220, 232, 234);
  doc.text(datos.responsable ? `Tu contacto en ${club}: ${datos.responsable}` : `Seguimos construyendo ${club} contigo.`, M + 22, y + 52);

  const total = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(140, 155, 158);
    doc.text(`${club} · Reporte para ${datos.marca}`, M, H - 22); doc.text(`${i} / ${total}`, W - M, H - 22, { align: 'right' });
  }
  return doc;
}
