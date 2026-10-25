/* PROPUESTA EN UN CLIC (25/10/2026).
 *
 * Zul elige activos en "Activos Tanner" y sale un PDF para la marca:
 * portada, cada activo con su foto, canal y unidad, la audiencia de las redes
 * involucradas y un cierre. Reglas del Excel de Presidencia:
 *   - Sólo se enseñan precios con estado 'aprobado'; lo demás dice "A cotizar".
 *   - Nunca salen notas internas, validaciones ni precios en propuesta.
 *   - Las métricas van con su red, periodo y fuente, y no se suman entre redes.
 * datosDePropuesta() y ultimasMetricas() no dibujan (se prueban con node).
 */

const C = { marca: [11, 61, 74], oro: [198, 172, 92], tinta: [11, 20, 24], gris: [110, 123, 128], suave: [244, 246, 245], linea: [223, 229, 228], blanco: [255, 255, 255] };
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fechaLarga = f => { if (!f) return ''; const [a, m, d] = String(f).slice(0, 10).split('-').map(Number); return `${d} de ${MESES[m - 1]} de ${a}`; };
const fechaCorta = f => { if (!f) return ''; const [, m, d] = String(f).slice(0, 10).split('-').map(Number); return `${d} ${MESES[m - 1].slice(0, 3)}`; };
// Los nombres de entidad los pone quien llama (el del club); estos son de respaldo.
const ENTIDAD = { TC: 'Club', TCP: 'Complejo deportivo', AMBOS: 'Club + complejo' };

export const ETIQUETA_METRICA = {
  reproducciones: 'Reproducciones', visualizaciones: 'Visualizaciones', alcance: 'Alcance', espectadores: 'Espectadores',
  interacciones: 'Interacciones', visitas: 'Visitas al perfil', seguidores_total: 'Seguidores', nuevos_seguidores_netos: 'Seguidores nuevos (netos)',
  seguimientos_nuevos: 'Seguidores nuevos', seguimientos_netos: 'Seguidores netos', conversaciones_iniciadas: 'Conversaciones iniciadas',
  proporcion_edad_25_44: 'Audiencia de 25 a 44 años', seguidores_leon: 'Seguidores en León', seguidores_mexico: 'Seguidores en México',
  seguidores_hombres: 'Seguidores hombres', seguidores_mujeres: 'Seguidoras mujeres', seguidores_edad_35_44: 'Seguidores de 35 a 44 años',
};

// La última foto de cada métrica por entidad y red (nunca una suma).
export function ultimasMetricas(metricas) {
  const out = new Map();
  for (const m of metricas || []) {
    const k = `${m.entity}|${m.channel}|${m.metric}`;
    const prev = out.get(k);
    if (!prev || String(m.periodEnd) > String(prev.periodEnd)) out.set(k, m);
  }
  return [...out.values()].sort((a, b) => `${a.entity}${a.channel}`.localeCompare(`${b.entity}${b.channel}`, 'es'));
}

export function precioPublico(a) {
  if (a.priceStatus !== 'aprobado' || a.price == null || a.price === '') return 'A cotizar';
  return `$${Math.round(Number(a.price)).toLocaleString('es-MX')}${a.unit === 'por mes' ? ' al mes' : a.unit ? ` por ${a.unit}` : ''}`;
}

export function datosDePropuesta({ marca, activos = [], metricas = [], hoy, entidades = ENTIDAD }) {
  const E = { ...ENTIDAD, ...entidades };
  const enUso = new Set(activos.flatMap(a => a.entity === 'AMBOS' ? ['TC', 'TCP'] : [a.entity]).filter(Boolean));
  const audiencia = ultimasMetricas(metricas)
    .filter(m => enUso.has(m.entity) && ['CONFIRMADO', 'APROXIMADO'].includes(m.validation))
    .map(m => ({ entidad: E[m.entity] || m.entity, red: m.channel, nombre: ETIQUETA_METRICA[m.metric] || String(m.metric).replace(/_/g, ' '),
      valor: `${m.validation === 'APROXIMADO' ? 'aprox. ' : ''}${Number(m.value).toLocaleString('es-MX')}${m.unit === 'porcentaje' ? '%' : ''}`,
      periodo: [m.window, m.periodStart ? `${fechaCorta(m.periodStart)} – ${fechaCorta(m.periodEnd)}` : `al ${fechaCorta(m.periodEnd)}`].filter(Boolean).join(' · '),
      fuente: m.source }));
  return {
    marca, fecha: fechaLarga(hoy),
    activos: activos.map(a => ({ id: a.id, nombre: a.name, entidad: E[a.entity] || '', canal: [a.channel, a.unit].filter(Boolean).join(' · '),
      descripcion: a.description || '', precio: precioPublico(a) })),
    audiencia,
  };
}

export function nombreDePropuesta(marca, hoy) {
  const limpio = String(marca || 'marca').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  return `Propuesta-${limpio}-${String(hoy).slice(0, 10)}.pdf`;
}

export async function propuestaPdf({ marca, club, activos, metricas, fotos = {}, hoy, entidades, jsPDF = null }) {
  const datos = datosDePropuesta({ marca, activos, metricas, hoy, entidades });
  const Doc = jsPDF || (await import('https://esm.sh/jspdf@2.5.2')).jsPDF;
  const doc = new Doc({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 44;
  let y = M;
  const nueva = () => { doc.addPage(); y = M; };
  const cabe = alto => { if (y + alto > H - 54) nueva(); };

  /* Portada */
  doc.setFillColor(...C.marca); doc.rect(0, 0, W, 300, 'F');
  doc.setFillColor(...C.oro); doc.rect(0, 300, W, 6, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...C.oro); doc.text(String(club || '').toUpperCase(), M, 62);
  doc.setFontSize(14); doc.setTextColor(...C.blanco); doc.text('Propuesta de patrocinio para', M, 112);
  let t = 42; doc.setFontSize(t); while (t > 22 && doc.getTextWidth(datos.marca) > W - 2 * M) { t -= 2; doc.setFontSize(t); }
  doc.text(doc.splitTextToSize(datos.marca, W - 2 * M).slice(0, 2), M, 164);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(12); doc.setTextColor(220, 232, 234);
  doc.text(`${datos.activos.length} ${datos.activos.length === 1 ? 'espacio' : 'espacios'} para tu marca · ${datos.fecha}`, M, 240);
  y = 350;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(12); doc.setTextColor(58, 74, 80);
  doc.text(doc.splitTextToSize(`Gracias por considerar a ${club}. Elegimos estos espacios pensando en tu marca: tienen presencia en la cancha, en el día a día de las familias y en nuestras redes.`, W - 2 * M), M, y);

  /* Activos */
  nueva();
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...C.oro); doc.text('LO QUE TE PROPONEMOS', M, y);
  doc.setFontSize(20); doc.setTextColor(...C.tinta); doc.text('Espacios para tu marca', M, y + 24); y += 44;
  const alto = 120;
  datos.activos.forEach((a, i) => {
    cabe(alto + 12);
    doc.setDrawColor(...C.linea); doc.setLineWidth(.8); doc.roundedRect(M, y, W - 2 * M, alto, 12, 12, 'S');
    doc.setFillColor(...C.suave); doc.roundedRect(M + 8, y + 8, 140, alto - 16, 8, 8, 'F');
    const f = fotos[activos[i].id];
    if (f?.data) { const r = Math.min(132 / f.w, (alto - 24) / f.h), fw = f.w * r, fh = f.h * r; try { doc.addImage(f.data, 'JPEG', M + 8 + (140 - fw) / 2, y + 8 + (alto - 16 - fh) / 2, fw, fh); } catch { /* sin foto */ } }
    else { doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...C.gris); doc.text(a.entidad.toUpperCase(), M + 78, y + alto / 2 + 3, { align: 'center' }); }
    const x = M + 164, ancho = W - M - x - 14;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...C.oro); doc.text([a.entidad, a.canal].filter(Boolean).join(' · ').toUpperCase(), x, y + 24);
    doc.setFontSize(14); doc.setTextColor(...C.tinta); doc.text(doc.splitTextToSize(a.nombre, ancho)[0], x, y + 44);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(58, 74, 80); doc.text(doc.splitTextToSize(a.descripcion, ancho).slice(0, 2), x, y + 62);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...C.marca); doc.text(a.precio, x, y + alto - 16);
    y += alto + 12;
  });

  /* Audiencia */
  if (datos.audiencia.length) {
    nueva();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...C.oro); doc.text('QUIÉN NOS VE', M, y);
    doc.setFontSize(20); doc.setTextColor(...C.tinta); doc.text('Nuestra audiencia', M, y + 24); y += 40;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...C.gris);
    doc.text('Cada dato es de su red y su periodo; no se suman entre redes.', M, y); y += 20;
    let grupo = '';
    datos.audiencia.forEach(m => {
      const g = `${m.entidad} · ${m.red}`;
      if (g !== grupo) { cabe(46); grupo = g; y += 8; doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...C.marca); doc.text(g, M, y); y += 16; }
      cabe(30);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(...C.tinta); doc.text(m.nombre, M + 8, y);
      doc.setFont('helvetica', 'bold'); doc.text(m.valor, W - M - 8, y, { align: 'right' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...C.gris); doc.text(`${m.periodo} · ${m.fuente}`, M + 8, y + 11);
      doc.setDrawColor(...C.linea); doc.line(M, y + 17, W - M, y + 17);
      y += 26;
    });
  }

  /* Cierre */
  cabe(96); y += 14;
  doc.setFillColor(...C.marca); doc.roundedRect(M, y, W - 2 * M, 76, 14, 14, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...C.blanco); doc.text('¿Lo platicamos?', M + 22, y + 32);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(220, 232, 234);
  doc.text('Armamos el paquete a la medida de tu marca y te mandamos la cotización final.', M + 22, y + 54);

  const total = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(140, 155, 158);
    doc.text(`${club} · Propuesta para ${datos.marca}`, M, H - 22); doc.text(`${i} / ${total}`, W - M, H - 22, { align: 'right' });
  }
  return doc;
}
