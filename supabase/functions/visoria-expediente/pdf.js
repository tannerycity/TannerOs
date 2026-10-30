/* El expediente de consentimiento de visoría en PDF (29/10/2026, h54).
 *
 * Paquete docs/visorias/00 §E: "PDF final legible e inmutable, con resumen de
 * elecciones, leyenda de firmado electrónicamente sin afirmar e.firma
 * avanzada ni NOM-151... No añadir datos sensibles de salud al PDF".
 *
 * Todo sale del expediente que guardó la base al firmar (texto exacto, hashes,
 * elecciones, firma, hora del servidor). Aquí no se decide nada: se dibuja.
 * pdf-lib entra por parámetro para que la misma función corra en Deno (la
 * función del servidor) y en node (la prueba).
 */

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const PARENTESCO = { madre: 'Madre', padre: 'Padre', tutor_legal: 'Tutor legal', otro: 'Otro (revisión de facultades)' };
const NAVY = [7 / 255, 25 / 255, 30 / 255], GRIS = [0.35, 0.37, 0.38], ORO = [0.66, 0.54, 0.35];

/* Helvetica estándar sólo trae WinAnsi: lo que no cabe se cambia por algo
 * legible en lugar de tronar al dibujar. */
export function limpia(t) {
  return String(t ?? '')
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
    .replace(/…/g, '...').replace(/ /g, ' ').replace(/\t/g, '  ')
    .replace(/[^\n\x20-\x7E¡-ÿ•]/g, '?');
}

export function fechaMexico(iso) {
  const d = new Date(iso);
  const p = Object.fromEntries(new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(d).map(x => [x.type, x.value]));
  return `${Number(p.day)} de ${MESES[Number(p.month) - 1]} de ${p.year}, ${p.hour}:${p.minute}:${p.second} (hora del centro de México)`;
}

const eleccion = v => (v === true ? 'SÍ' : v === false ? 'NO' : 'Sin respuesta');

export async function armaExpediente(PDFLib, x) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const doc = await PDFDocument.create();
  doc.setTitle(limpia(`Expediente de consentimiento · ${x.folio || ''}`));
  doc.setAuthor('TannerOS');
  doc.setSubject('Consentimiento informado para visoría');
  doc.setCreationDate(new Date(x.signedAt));
  doc.setModificationDate(new Date(x.signedAt));
  doc.setProducer('TannerOS');
  doc.setCreator('TannerOS');
  const f = await doc.embedFont(StandardFonts.Helvetica), fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 612, H = 792, M = 50, ANCHO = W - 2 * M;
  let page, y, n = 0;
  const pie = () => {
    page.drawText(limpia(`Expediente ${x.consentId} · Huella de la evidencia SHA-256 ${x.evidenceHash}`), { x: M, y: 28, size: 6.5, font: f, color: rgb(...GRIS) });
    page.drawText(`Página ${n}`, { x: W - M - 40, y: 28, size: 7, font: f, color: rgb(...GRIS) });
  };
  const nueva = () => { if (page) pie(); page = doc.addPage([W, H]); n += 1; y = H - M; };
  const parte = (txt, font, size) => {
    const lineas = [];
    for (const parrafo of limpia(txt).split('\n')) {
      if (!parrafo.trim()) { lineas.push(''); continue; }
      let actual = '';
      for (const palabra of parrafo.split(/ +/)) {
        const prueba = actual ? `${actual} ${palabra}` : palabra;
        if (font.widthOfTextAtSize(prueba, size) <= ANCHO) actual = prueba;
        else { if (actual) lineas.push(actual); actual = palabra; }
      }
      lineas.push(actual);
    }
    return lineas;
  };
  const texto = (txt, { size = 9.5, bold = false, color = NAVY, gap = 2 } = {}) => {
    const font = bold ? fb : f;
    for (const l of parte(txt, font, size)) {
      if (y < M + 30) nueva();
      if (l) page.drawText(l, { x: M, y: y - size, size, font, color: rgb(...color) });
      y -= size + gap;
    }
  };
  const espacio = h => { y -= h; if (y < M + 30) nueva(); };
  const fila = (k, v) => texto(`${k}: ${v ?? ''}`, { size: 9 });

  nueva();
  texto('TANNERY CITY FC · TANNEROS', { size: 8, bold: true, color: ORO });
  texto('Expediente de consentimiento informado para visoría', { size: 16, bold: true });
  espacio(4);
  texto('Firmado electrónicamente mediante formulario en línea, firma manuscrita digitalizada y declaración del firmante. '
    + 'No constituye firma electrónica avanzada ni constancia de conservación conforme a la NOM-151-SCFI-2016.', { size: 8, color: GRIS });
  espacio(8);

  texto('Datos del expediente', { size: 11, bold: true });
  fila('Folio del participante', x.folio);
  fila('Menor', `${x.child?.name || ''} · nacido(a) el ${x.child?.birthDate || ''}`);
  fila('Evento', `${x.campaign?.title || ''} (${x.campaign?.slug || ''})`);
  fila('Organizador jurídico', x.campaign?.organizer);
  fila('Sede', x.campaign?.location);
  fila('Fecha y horario', x.campaign?.schedule || x.campaign?.dates);
  fila('Firmante', `${x.signer?.name || ''} · ${PARENTESCO[x.signer?.relationship] || x.signer?.relationship || ''}${x.signer?.relationshipDetail ? ` (${x.signer.relationshipDetail})` : ''}`);
  fila('Teléfono del firmante', x.signer?.phone);
  fila('Contacto de emergencia alterno', [x.emergency?.nombre, x.emergency?.telefono].filter(Boolean).join(' · '));
  if (x.pickup) fila('Personas autorizadas para recoger', x.pickup);
  fila('Hora del servidor al firmar', `${fechaMexico(x.signedAt)} · UTC ${new Date(x.signedAt).toISOString()}`);
  fila('Estado del seguro declarado por el organizador', x.insurance === 'sin_seguro_verificado' ? 'Sin seguro proporcionado por el organizador (verificado)'
    : x.insurance === 'con_seguro_verificado' ? 'Con seguro descrito en la cláusula 4 (verificado)' : x.insurance);
  fila('Cuestionario de salud', x.healthGiven ? 'Entregado. Su contenido es dato sensible y se conserva aparte, con acceso restringido; no se incluye en este documento.' : 'No entregado');
  espacio(8);

  texto('Decisiones registradas (cada una por separado)', { size: 11, bold: true });
  for (const [clave, c] of Object.entries(x.choices || {})) {
    texto(`[${eleccion(c?.value)}] ${c?.text || clave}`, { size: 9, bold: c?.required });
    texto(`${clave}${c?.required ? ' · obligatoria' : ' · opcional'}${c?.clientAt ? ` · marcada en el dispositivo: ${c.clientAt}` : ''}`, { size: 7, color: GRIS, gap: 6 });
  }
  espacio(6);

  texto('Firma', { size: 11, bold: true });
  if (x.signaturePng) {
    try {
      const png = await doc.embedPng(x.signaturePng);
      const esc = Math.min(220 / png.width, 80 / png.height);
      if (y - png.height * esc < M + 40) nueva();
      page.drawImage(png, { x: M, y: y - png.height * esc, width: png.width * esc, height: png.height * esc });
      y -= png.height * esc + 4;
    } catch { texto('(La imagen de la firma no se pudo dibujar; su huella está abajo.)', { size: 8, color: GRIS }); }
  }
  texto(`${x.signer?.name || ''}`, { size: 9, bold: true });
  espacio(8);

  texto('Integridad', { size: 11, bold: true });
  fila('Versión del consentimiento', x.consent?.version);
  fila('Huella SHA-256 del texto firmado', x.consent?.hash);
  fila('Huella SHA-256 del documento aprobado', x.consent?.templateHash);
  fila('Versión del aviso de privacidad', x.privacy?.version);
  fila('Huella SHA-256 del aviso de privacidad', x.privacy?.hash);
  fila('Huella SHA-256 de la firma', x.signatureHash);
  fila('Huella del evento al firmar', x.eventHash);
  fila('Huella SHA-256 de la evidencia', x.evidenceHash);
  texto('La identidad de quien firma la verifica el club por separado (WhatsApp registrado o identificación en persona) y queda en la bitácora del expediente.', { size: 8, color: GRIS });

  nueva();
  texto(x.consent?.title || 'Consentimiento', { size: 12, bold: true });
  texto('Texto íntegro firmado', { size: 8, color: GRIS, gap: 8 });
  texto(x.consent?.text || '', { size: 9 });

  nueva();
  texto(x.privacy?.title || 'Aviso de privacidad', { size: 12, bold: true });
  texto('Texto íntegro puesto a disposición antes de firmar', { size: 8, color: GRIS, gap: 8 });
  texto(x.privacy?.text || '', { size: 9 });
  pie();

  return doc.save({ useObjectStreams: false });
}
