/* ENTREGA CON RECIBO (26/11/2026, h104).
 *
 * Presidencia: "no tenemos una opción sencilla de marcar de entregado... no
 * todo el pedido que nos manda Tremor, sino individualmente. Que sea bien
 * fácil, que ya se le entregó y que están aceptando que ya se le entregó...
 * que puedas descargar un recibo de uniformes entregados y que tenga un botón
 * para mandarlo por WhatsApp a la persona que lo compró, para que allá ese sea
 * el registro de que se le entregó... como una notita de crédito".
 *
 * Cómo es, en el mostrador, con el papá enfrente:
 *   1. Revisan juntos cada pieza (talla, nombre, número) y la palomean.
 *   2. ¿Quién lo recoge? Nombre y si es quien compró, mamá, papá...
 *   3. Firma con el dedo en la pantalla y acepta que lo recibió completo.
 *   4. Sale el recibo con la marca del club: se descarga o se manda por
 *      WhatsApp a quien compró. Ese mensaje es el registro.
 *
 * Lo puro (textos, renglones, validación, trazo) no toca el DOM y se prueba
 * con scripts/qa-entrega-recibo.mjs. Lo guarda v2_deliver_order (h104).
 */

export const RELACIONES = [
  ['titular', 'Quien compró'], ['mama', 'Mamá'], ['papa', 'Papá'], ['familiar', 'Familiar'], ['otro', 'Otra persona']
];
export const etiquetaRelacion = k => (RELACIONES.find(r => r[0] === k) || [])[1] || '';
export const DIAS_GARANTIA = 5; // La ventana de garantía del club, desde la entrega.

const dinero = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const limpia = t => String(t ?? '').trim().replace(/\s+/g, ' ');

/* Una pieza, venga del pedido (attributes) o de la entrega guardada (plana). */
export function piezaDe(i = {}) {
  const a = i.attributes || {};
  const talla = limpia(i.talla ?? a.talla ?? a.size), nombre = limpia(i.nombre ?? a.nombrePers ?? a.personalizationName);
  const numero = limpia(i.numero ?? a.numero ?? a.number), manga = limpia(i.manga ?? a.manga);
  const espalda = [nombre, numero ? `#${numero}` : ''].filter(Boolean).join(' ');
  const detalle = [talla ? `Talla ${talla}` : '', manga ? `Manga ${manga.toLowerCase()}` : '', espalda].filter(Boolean).join(' · ');
  return { nombre: limpia(i.description) || 'Pieza', detalle, cantidad: Math.max(1, Number(i.quantity || 1)) };
}
export const piezasDe = (items = []) => (Array.isArray(items) ? items : []).map(piezaDe);
export const totalPiezas = (items = []) => piezasDe(items).reduce((n, p) => n + p.cantidad, 0);

/* Lo que falta para poder entregar, en el orden en que se llena la hoja. */
export function faltaParaEntregar({ revisadas = 0, piezas = 0, quien = '', firma = '', acepta = false } = {}) {
  if (piezas && revisadas < piezas) return `Palomea las ${piezas - revisadas === 1 ? 'pieza que falta' : `${piezas - revisadas} piezas que faltan`}.`;
  if (limpia(quien).length < 2) return 'Escribe quién recoge el pedido.';
  if (!firma) return 'Falta la firma de quien recibe.';
  if (!acepta) return 'Falta que acepte que recibió su pedido completo.';
  return '';
}

/* La firma: trazos en una caja de 600 × 200, en un path SVG corto. */
export const FIRMA_W = 600, FIRMA_H = 200;
export function trazoASvg(trazos = []) {
  const r = n => Math.round(Math.min(Math.max(n, 0), 9999));
  return trazos.filter(t => t.length).map(t => t.length === 1
    ? `M${r(t[0][0])} ${r(t[0][1])} L${r(t[0][0]) + 1} ${r(t[0][1])}`
    : `M${r(t[0][0])} ${r(t[0][1])} ${t.slice(1).map(p => `L${r(p[0])} ${r(p[1])}`).join(' ')}`).join(' ');
}

export function fechaHora(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Mexico_City' }).format(d);
}

export const primerNombre = t => limpia(t).split(' ')[0] || '';

/* El mensaje de WhatsApp para quien compró: es el registro de la entrega. */
export function textoWhatsApp(rec = {}, club = 'el club') {
  const n = totalPiezas(rec.items), quien = limpia(rec.receivedBy), rel = etiquetaRelacion(rec.relation);
  const para = limpia(rec.playerName);
  return [
    `Hola${primerNombre(rec.customerName) ? ` ${primerNombre(rec.customerName)}` : ''}, te compartimos tu recibo de entrega de ${club}.`,
    '',
    `Recibo ${rec.receiptFolio || ''} · Pedido ${rec.folio || ''}`,
    `${n} ${n === 1 ? 'pieza entregada' : 'piezas entregadas'}${para ? ` para ${para}` : ''}.`,
    `Recibió: ${quien}${rel && rec.relation !== 'otro' ? ` (${rel.toLowerCase()})` : ''}, ${fechaHora(rec.deliveredAt)}.`,
    `Pagado: ${dinero.format(Number(rec.paid || 0))}.`,
    '',
    `Si alguna pieza trae un defecto de fábrica, avísanos en los próximos ${DIAS_GARANTIA} días. Lo estampado es personal y no tiene cambio.`,
    '',
    'Gracias por vestir los colores. #WeAreTanners'
  ].join('\n');
}
export const ligaWhatsApp = (tel, texto) => { const d = String(tel || '').replace(/\D/g, ''); return d ? `https://wa.me/${d.length === 10 ? `52${d}` : d}?text=${encodeURIComponent(texto)}` : null; };
export const nombreArchivo = rec => `Recibo-entrega-${String(rec.receiptFolio || rec.folio || 'pedido').replace(/[^A-Za-z0-9-]+/g, '')}.png`;

/* ====================== Lo que sí toca la pantalla ====================== */

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const C = { navy: '#07191e', petroleo: '#0b3d4a', oro: '#c8ae62', oroClaro: '#e9d19c', oroOsc: '#a9895a', crema: '#f6f2e8', papel: '#fffdf8', gris: '#6b7a7e', linea: '#e6dfcd', ok: '#1d7a46' };

function capa(html, etiqueta) {
  const fondo = document.createElement('div');
  fondo.className = 'ent-capa';
  fondo.innerHTML = `<section class="ent-hoja" role="dialog" aria-modal="true" aria-label="${esc(etiqueta)}">${html}</section>`;
  document.body.appendChild(fondo); document.body.classList.add('ent-sin-scroll');
  requestAnimationFrame(() => fondo.classList.add('entra'));
  return fondo;
}
function cierraCapa(fondo) {
  fondo.classList.remove('entra'); document.body.classList.remove('ent-sin-scroll');
  setTimeout(() => fondo.remove(), 220);
}

/* La hoja de entregar. Devuelve el recibo guardado, o null si se cerró. */
export function abreEntrega({ order, items = [], playerName = '', club = 'el club', guarda }) {
  return new Promise(resolve => {
    const piezas = piezasDe(items), revisadas = new Set(), trazos = [];
    let relacion = 'titular', ocupado = false;
    const quien0 = limpia(order?.customer_name);
    const fondo = capa(`
      <header class="ent-cab"><div><small>Entregar pedido · ${esc(order?.folio || '')}</small><h2>${esc(playerName || quien0 || 'Pedido')}</h2></div>
        <button type="button" class="ent-x" data-cierra aria-label="Cerrar">&times;</button></header>
      <div class="ent-cuerpo">
        <section class="ent-paso"><h3><b>1</b>Revisen juntos cada pieza</h3>
          <ul class="ent-piezas">${piezas.map((p, i) => `<li><label><input type="checkbox" data-pieza="${i}"><span class="ent-check" aria-hidden="true"></span>
            <span class="ent-pieza"><strong>${p.cantidad > 1 ? `${p.cantidad} × ` : ''}${esc(p.nombre)}</strong>${p.detalle ? `<small>${esc(p.detalle)}</small>` : ''}</span></label></li>`).join('')}</ul>
          ${piezas.length > 1 ? '<button type="button" class="ent-link" data-todas>Están todas bien</button>' : ''}</section>
        <section class="ent-paso"><h3><b>2</b>¿Quién lo recoge?</h3>
          <input id="entQuien" class="ent-input" type="text" autocomplete="name" maxlength="120" value="${esc(quien0)}" placeholder="Nombre completo">
          <div class="ent-chips" role="radiogroup" aria-label="Relación">${RELACIONES.map(([k, t]) => `<button type="button" role="radio" data-rel="${k}" aria-checked="${k === relacion}">${t}</button>`).join('')}</div></section>
        <section class="ent-paso"><h3><b>3</b>Firma de recibido</h3>
          <div class="ent-firma"><canvas id="entFirma" aria-label="Firma con el dedo aquí"></canvas><span class="ent-firma-guia">Firma aquí</span>
            <button type="button" class="ent-link ent-borra" data-borra>Borrar</button></div>
          <label class="ent-acepta"><input type="checkbox" id="entAcepta"><span class="ent-check" aria-hidden="true"></span>
            <span id="entAceptaTxt">${esc(quien0 || 'Quien recoge')} recibió el pedido completo y en buen estado.</span></label></section>
      </div>
      <footer class="ent-pie"><p class="ent-falta" id="entFalta" role="alert"></p>
        <button type="button" class="ent-cta" id="entConfirma">Confirmar entrega</button></footer>`, 'Entregar pedido');
    const $ = s => fondo.querySelector(s);
    const firma = $('#entFirma'), g = firma.getContext('2d');
    const termina = r => { cierraCapa(fondo); document.removeEventListener('keydown', tecla); resolve(r); };
    const tecla = e => { if (e.key === 'Escape' && !ocupado) termina(null); };
    document.addEventListener('keydown', tecla);

    // La firma con el dedo (o el mouse), en coordenadas de 600 × 200.
    const ajusta = () => {
      const r = firma.getBoundingClientRect(), d = Math.min(3, devicePixelRatio || 1);
      firma.width = Math.round(r.width * d); firma.height = Math.round(r.height * d);
      g.setTransform(firma.width / FIRMA_W, 0, 0, firma.height / FIRMA_H, 0, 0); repinta();
    };
    const repinta = () => {
      g.clearRect(0, 0, FIRMA_W, FIRMA_H); g.strokeStyle = C.navy; g.lineWidth = 3.2; g.lineCap = 'round'; g.lineJoin = 'round';
      for (const t of trazos) { g.beginPath(); t.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); if (t.length === 1) g.lineTo(t[0][0] + 1, t[0][1]); g.stroke(); }
      $('.ent-firma').classList.toggle('con-firma', trazos.length > 0); valida();
    };
    const punto = e => { const r = firma.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * FIRMA_W, (e.clientY - r.top) / r.height * FIRMA_H]; };
    let actual = null;
    firma.addEventListener('pointerdown', e => { e.preventDefault(); firma.setPointerCapture(e.pointerId); actual = [punto(e)]; trazos.push(actual); repinta(); });
    firma.addEventListener('pointermove', e => { if (!actual) return; e.preventDefault(); actual.push(punto(e)); repinta(); });
    ['pointerup', 'pointercancel'].forEach(t => firma.addEventListener(t, () => { actual = null; }));
    requestAnimationFrame(ajusta); addEventListener('resize', ajusta);

    function valida() {
      const falta = faltaParaEntregar({ revisadas: revisadas.size, piezas: piezas.length, quien: $('#entQuien').value, firma: trazos.length ? 'si' : '', acepta: $('#entAcepta').checked });
      $('#entConfirma').disabled = !!falta || ocupado; $('#entFalta').textContent = falta; return falta;
    }
    fondo.addEventListener('change', e => {
      const p = e.target.dataset.pieza; if (p != null) { e.target.checked ? revisadas.add(p) : revisadas.delete(p); }
      valida();
    });
    $('#entQuien').addEventListener('input', () => { $('#entAceptaTxt').textContent = `${limpia($('#entQuien').value) || 'Quien recoge'} recibió el pedido completo y en buen estado.`; valida(); });
    fondo.addEventListener('click', async e => {
      if (e.target === fondo || e.target.closest('[data-cierra]')) { if (!ocupado) termina(null); return; }
      if (e.target.closest('[data-todas]')) { fondo.querySelectorAll('[data-pieza]').forEach(c => { c.checked = true; revisadas.add(c.dataset.pieza); }); valida(); return; }
      if (e.target.closest('[data-borra]')) { trazos.length = 0; repinta(); return; }
      const r = e.target.closest('[data-rel]');
      if (r) {
        const antes = relacion; relacion = r.dataset.rel; fondo.querySelectorAll('[data-rel]').forEach(b => b.setAttribute('aria-checked', String(b === r)));
        // Al cambiar de "Quien compró" a otra persona se limpia el nombre (es otra persona); nunca al tocar el mismo.
        const q = $('#entQuien'); if (antes === 'titular' && relacion !== 'titular' && limpia(q.value) === quien0) { q.value = ''; q.focus(); $('#entAceptaTxt').textContent = 'Quien recoge recibió el pedido completo y en buen estado.'; }
        else if (antes !== 'titular' && relacion === 'titular' && !limpia(q.value)) { q.value = quien0; q.dispatchEvent(new Event('input')); }
        valida(); return;
      }
      if (e.target.closest('#entConfirma')) {
        if (valida()) return;
        ocupado = true; const b = $('#entConfirma'); b.disabled = true; b.textContent = 'Guardando…';
        try {
          const rec = await guarda({ receivedBy: limpia($('#entQuien').value), relation: relacion, accepted: true, signature: trazoASvg(trazos) });
          termina(rec);
        } catch (err) {
          ocupado = false; b.textContent = 'Confirmar entrega'; valida();
          $('#entFalta').textContent = err?.message || 'No se pudo guardar la entrega.';
        }
      }
    });
    valida();
  });
}

/* El recibo ya hecho: vista previa, WhatsApp y descargar. */
export async function muestraRecibo(rec, { club = 'el club', alMandar } = {}) {
  const blob = await dibujaReciboEntrega(rec, { club });
  const url = URL.createObjectURL(blob), archivo = new File([blob], nombreArchivo(rec), { type: 'image/png' });
  const texto = textoWhatsApp(rec, club), wa = ligaWhatsApp(rec.customerPhone, texto);
  const fondo = capa(`
    <header class="ent-cab ok"><div><small>${esc(rec.receiptFolio || '')} · ${esc(fechaHora(rec.deliveredAt))}</small><h2>Uniforme entregado</h2></div>
      <button type="button" class="ent-x" data-cierra aria-label="Cerrar">&times;</button></header>
    <div class="ent-cuerpo"><img class="ent-recibo" src="${url}" alt="Recibo de entrega ${esc(rec.receiptFolio || '')} con las piezas, quién recibió y su firma">
      ${rec.sentWhatsappAt ? `<p class="ent-nota">Ya se mandó por WhatsApp el ${esc(fechaHora(rec.sentWhatsappAt))}.</p>` : ''}
      ${rec._sinGuardar ? '<p class="ent-nota alerta">El pedido quedó entregado, pero la firma y quién recibió no se guardaron en la base: falta activar h104. Descarga el recibo y mándalo por WhatsApp para que quede el registro.</p>' : ''}</div>
    <footer class="ent-pie dos">
      <button type="button" class="ent-cta wa" data-wa${wa || navigator.canShare ? '' : ' disabled'}>Mandar por WhatsApp</button>
      <button type="button" class="ent-sec" data-baja>Descargar recibo</button>
      ${wa ? '' : '<p class="ent-nota">Este pedido no tiene teléfono: descarga el recibo y mándalo tú.</p>'}</footer>`, 'Recibo de entrega');
  const baja = () => { const a = document.createElement('a'); a.href = url; a.download = archivo.name; document.body.appendChild(a); a.click(); a.remove(); };
  return new Promise(resolve => {
    const termina = () => { cierraCapa(fondo); document.removeEventListener('keydown', tecla); setTimeout(() => URL.revokeObjectURL(url), 60000); resolve(); };
    const tecla = e => { if (e.key === 'Escape') termina(); };
    document.addEventListener('keydown', tecla);
    fondo.addEventListener('click', async e => {
      if (e.target === fondo || e.target.closest('[data-cierra]')) { termina(); return; }
      if (e.target.closest('[data-baja]')) { baja(); return; }
      if (e.target.closest('[data-wa]')) {
        // En el teléfono, la imagen va directo a WhatsApp con el mensaje; en la
        // compu, se descarga la imagen y se abre el chat con el texto.
        let como = '';
        try { if (navigator.canShare?.({ files: [archivo] })) { await navigator.share({ files: [archivo], text: texto }); como = 'compartido'; } }
        catch (err) { if (err?.name === 'AbortError') return; }
        if (!como && wa) { baja(); window.open(wa, '_blank', 'noopener'); como = 'liga'; }
        if (como) alMandar?.(como);
      }
    });
  });
}

/* ---------- El recibo en imagen: marino, oro y escudo ---------- */
const W = 1080;
const cargaImagen = src => new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
function espaciado(g, texto, x, y, sp, alinea = 'center') {
  const letras = [...texto], ancho = letras.reduce((n, l) => n + g.measureText(l).width, 0) + sp * (letras.length - 1);
  let cx = alinea === 'center' ? x - ancho / 2 : alinea === 'right' ? x - ancho : x;
  g.textAlign = 'left'; for (const l of letras) { g.fillText(l, cx, y); cx += g.measureText(l).width + sp; }
}
function parrafo(g, t, x, y, max, alto) {
  const palabras = String(t).split(' '); let linea = '', n = 0;
  for (const p of palabras) { const prueba = linea ? `${linea} ${p}` : p; if (g.measureText(prueba).width > max && linea) { g.fillText(linea, x, y + n * alto); n++; linea = p; } else linea = prueba; }
  if (linea) { g.fillText(linea, x, y + n * alto); n++; }
  return n * alto;
}
function corta(g, t, max) { if (g.measureText(t).width <= max) return t; while (t.length > 1 && g.measureText(`${t}…`).width > max) t = t.slice(0, -1); return `${t}…`; }

export async function dibujaReciboEntrega(rec, { club = 'el club' } = {}) {
  try { await Promise.all(['800 90px "Barlow Condensed"', '700 40px "Barlow Condensed"', '400 26px Inter', '600 26px Inter', '800 26px Inter'].map(f => document.fonts.load(f))); } catch { /* fuente del sistema */ }
  const piezas = piezasDe(rec.items), conDetalle = piezas.filter(p => p.detalle).length;
  const H = 1900 + piezas.length * 60 + conDetalle * 36; // Se recorta al final a lo que se usó.
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = C.crema; g.fillRect(0, 0, W, H);

  // Arriba: marino con el escudo y el sello de entregado.
  const alto = 440;
  const fondo = g.createRadialGradient(W / 2, 0, 40, W / 2, 0, 900); fondo.addColorStop(0, '#14363e'); fondo.addColorStop(.65, C.navy);
  g.fillStyle = fondo; g.fillRect(0, 0, W, alto);
  g.save(); g.globalAlpha = .06; g.strokeStyle = C.oro; g.lineWidth = 2;
  for (let x = -alto; x < W; x += 30) { g.beginPath(); g.moveTo(x, alto); g.lineTo(x + alto, 0); g.stroke(); }
  g.restore();
  const escudo = await cargaImagen('/brand/crest-gold.png');
  if (escudo) { const h = 120, w = escudo.width * h / escudo.height; g.drawImage(escudo, W / 2 - w / 2, 50, w, h); }
  g.fillStyle = C.oroClaro; g.font = '800 24px Inter'; espaciado(g, 'TIENDA OFICIAL · RECIBO DE ENTREGA', W / 2, 220, 5);
  g.fillStyle = '#fff'; g.font = '800 100px "Barlow Condensed"'; g.textAlign = 'center'; g.fillText('UNIFORME ENTREGADO', W / 2, 320);
  g.fillStyle = '#c9d4d6'; g.font = '400 28px Inter';
  g.fillText(rec.playerName ? `Para ${limpia(rec.playerName)}${rec.playerCategory ? ` · ${limpia(rec.playerCategory)}` : ''}` : 'Gracias por vestir los colores.', W / 2, 374);

  // El boleto: folio del recibo y del pedido.
  let y = alto - 50; const bx = 90, bw = W - 180, bh = 200;
  g.fillStyle = C.papel; g.beginPath(); g.roundRect(bx, y, bw, bh, 28); g.fill(); g.strokeStyle = C.oro; g.lineWidth = 3; g.stroke();
  g.fillStyle = C.crema; [bx, bx + bw].forEach(cx => { g.beginPath(); g.arc(cx, y + bh / 2, 22, 0, Math.PI * 2); g.fill(); });
  g.fillStyle = C.oroOsc; g.font = '800 22px Inter'; espaciado(g, `RECIBO · PEDIDO ${rec.folio || ''}`, W / 2, y + 54, 5);
  g.fillStyle = C.navy; g.font = '800 88px "Barlow Condensed"'; g.textAlign = 'center'; g.fillText(rec.receiptFolio || '', W / 2, y + 140);
  g.fillStyle = C.gris; g.font = '400 24px Inter'; g.fillText(fechaHora(rec.deliveredAt), W / 2, y + 180);
  y += bh + 70;

  // Lo que se entregó.
  g.textAlign = 'left'; g.fillStyle = C.oroOsc; g.font = '800 22px Inter'; espaciado(g, `LO QUE SE ENTREGÓ · ${totalPiezas(rec.items)} ${totalPiezas(rec.items) === 1 ? 'PIEZA' : 'PIEZAS'}`, 90, y, 5, 'left'); y += 20;
  for (const p of piezas) {
    y += 52;
    g.fillStyle = C.ok; g.beginPath(); g.arc(104, y - 11, 14, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 3.5; g.lineCap = 'round'; g.beginPath(); g.moveTo(97, y - 11); g.lineTo(102, y - 6); g.lineTo(111, y - 16); g.stroke();
    g.fillStyle = C.navy; g.font = '600 32px Inter'; g.textAlign = 'left'; g.fillText(corta(g, `${p.cantidad > 1 ? `${p.cantidad} × ` : ''}${p.nombre}`, 820), 134, y);
    if (p.detalle) { y += 36; g.fillStyle = C.gris; g.font = '400 24px Inter'; g.fillText(corta(g, p.detalle, 820), 134, y); }
    y += 16; g.strokeStyle = C.linea; g.lineWidth = 2; g.beginPath(); g.moveTo(90, y); g.lineTo(W - 90, y); g.stroke();
  }
  const total = Number(rec.total || 0), pagado = Number(rec.paid || 0);
  y += 64; g.fillStyle = C.navy; g.font = '700 40px "Barlow Condensed"'; g.textAlign = 'left'; g.fillText('PAGADO', 90, y);
  g.textAlign = 'right'; g.font = '800 64px "Barlow Condensed"'; g.fillText(dinero.format(pagado), W - 90, y + 4);
  y += 38; g.font = '400 24px Inter'; g.fillStyle = pagado + 0.005 >= total ? C.ok : C.gris; g.fillText(pagado + 0.005 >= total ? `Pagado completo · total ${dinero.format(total)}` : `Total ${dinero.format(total)}`, W - 90, y);

  // Recibió (con su firma) y entregó. La caja se dibuja al final, ya medida.
  y += 50; const cajaY = y;
  const textoLegal = [`Recibió su pedido completo y en buen estado.${rec.deliveredByName ? ` Entregó: ${limpia(rec.deliveredByName)}.` : ''}`,
    `Garantía por defecto de fábrica: ${DIAS_GARANTIA} días desde hoy. Lo estampado es personal y no tiene cambio.`];
  g.font = '400 24px Inter';
  const altoLegal = textoLegal.reduce((n, t) => n + Math.ceil(g.measureText(t).width / (W - 210)) * 34 + 10, 0);
  const fh = 250 + altoLegal;
  g.fillStyle = C.papel; g.beginPath(); g.roundRect(70, y, W - 140, fh, 24); g.fill(); g.strokeStyle = C.linea; g.lineWidth = 2; g.stroke();
  g.textAlign = 'left'; g.fillStyle = C.oroOsc; g.font = '800 22px Inter'; espaciado(g, 'RECIBIÓ DE CONFORMIDAD', 104, y + 52, 5, 'left');
  g.fillStyle = C.navy; g.font = '700 44px "Barlow Condensed"'; g.fillText(corta(g, limpia(rec.receivedBy).toUpperCase(), 600), 104, y + 104);
  const rel = etiquetaRelacion(rec.relation); if (rel) { g.fillStyle = C.gris; g.font = '400 24px Inter'; g.fillText(rel, 104, y + 140); }
  if (rec.signature) {
    try {
      const sx = W - 104 - 420, sy = y + 40, sw = 420, sh = 140;
      g.save(); g.translate(sx, sy); g.scale(sw / FIRMA_W, sh / FIRMA_H);
      g.strokeStyle = C.navy; g.lineWidth = 4; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(new Path2D(rec.signature)); g.restore();
      g.strokeStyle = C.oro; g.lineWidth = 2; g.beginPath(); g.moveTo(sx, sy + sh + 8); g.lineTo(sx + sw, sy + sh + 8); g.stroke();
      g.fillStyle = C.gris; g.font = '400 20px Inter'; g.textAlign = 'center'; g.fillText('Firma', sx + sw / 2, sy + sh + 36);
    } catch { /* sin firma dibujable */ }
  }
  g.textAlign = 'left'; g.fillStyle = C.gris; g.font = '400 24px Inter';
  let ly = cajaY + 250;
  for (const t of textoLegal) ly += parrafo(g, t, 104, ly, W - 210, 34) + 10;

  // Abajo: el lema del club, justo después de lo dibujado.
  const pie = cajaY + fh + 90, alto2 = pie + 170;
  const fin = document.createElement('canvas'); fin.width = W; fin.height = alto2;
  const f = fin.getContext('2d'); f.drawImage(c, 0, 0); g.canvas.width = 0;
  return await pintaPie(f, pie, club, fin);
}
async function pintaPie(g, pie, club, c) {
  g.fillStyle = C.navy; g.fillRect(0, pie, W, 170);
  g.fillStyle = C.oro; g.font = '600 22px Inter'; espaciado(g, 'CURTIMOS CAMPEONES DEL MUNDO', W / 2, pie + 70, 6);
  g.fillStyle = '#fff'; g.font = '800 48px "Barlow Condensed"'; g.textAlign = 'center'; g.fillText('#WeAreTanners', W / 2, pie + 128);
  g.fillStyle = C.oroOsc; g.font = '400 20px Inter'; g.fillText(club, W / 2, pie - 26);
  return await new Promise(ok => c.toBlob(ok, 'image/png'));
}
