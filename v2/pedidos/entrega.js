/* ENTREGA CON RECIBO (26/11/2026, h104).
 *
 * Presidencia: "no tenemos una opción sencilla de marcar de entregado... no
 * todo el pedido que nos manda Tremor, sino individualmente. Que sea bien
 * fácil, que ya se le entregó y que están aceptando que ya se le entregó...
 * un recibo de uniformes entregados y un botón para mandarlo por WhatsApp a la
 * persona que lo compró, para que allá ese sea el registro". Y después: "si no
 * se le llega a entregar algo... se queda abierto hasta que se le entrega todo
 * completo"; "no quiero que parezca un software, estilo Apple".
 *
 * Cómo es, en el mostrador, con la familia enfrente:
 *   · Todas las piezas pendientes vienen palomeadas (lo normal es que llegue
 *     todo). Se toca lo que NO llegó y se queda pendiente.
 *   · Quién lo recoge: nombre y si es quien compró, mamá, papá u otra persona.
 *   · "Revisó y recibe en buen estado": un interruptor. Sin firma (decidido
 *     el 26/11/2026): el registro es el recibo que le llega por WhatsApp.
 *   · Un botón: "Entregar 4 piezas" o "Entregar 2 de 4".
 * Si falta algo, el pedido se queda en Para entregar con lo pendiente; cuando
 * llega, se entrega lo que falta y cada entrega tiene su recibo.
 *
 * Lo puro no toca el DOM y se prueba con scripts/qa-entrega-recibo.mjs. Lo
 * guarda v2_deliver_order (h104).
 */

export const RELACIONES = [['titular', 'Quien compró'], ['mama', 'Mamá'], ['papa', 'Papá'], ['otro', 'Otra persona']];
const CORTAS = { titular: 'Quien compró', mama: 'Mamá', papa: 'Papá', familiar: 'Familiar', otro: 'Otro' };
export const etiquetaRelacion = k => (RELACIONES.find(r => r[0] === k) || [])[1] || (k === 'familiar' ? 'Familiar' : '');
export const DIAS_GARANTIA = 5; // La ventana de garantía del club, desde la entrega.

const dinero = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const limpia = t => String(t ?? '').trim().replace(/\s+/g, ' ');
const num = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/* Una pieza, venga del pedido (attributes) o de la entrega (plana). */
export function piezaDe(i = {}) {
  const a = i.attributes || {};
  const talla = limpia(i.talla ?? a.talla ?? a.size), nombre = limpia(i.nombre ?? a.nombrePers ?? a.personalizationName);
  const numero = limpia(i.numero ?? a.numero ?? a.number), manga = limpia(i.manga ?? a.manga);
  const espalda = [nombre, numero ? `#${numero}` : ''].filter(Boolean).join(' ');
  const detalle = [talla ? `Talla ${talla}` : '', manga ? `Manga ${manga.toLowerCase()}` : '', espalda].filter(Boolean).join(' · ');
  return { id: String(i.itemId ?? i.id ?? ''), nombre: limpia(i.description) || 'Pieza', detalle, cantidad: Math.max(1, Number(i.quantity || 1)) };
}
export const piezasDe = (items = []) => (Array.isArray(items) ? items : []).map(piezaDe);
export const totalPiezas = (items = []) => piezasDe(items).reduce((n, p) => n + p.cantidad, 0);

/* Las piezas del pedido con lo que ya se llevó y lo que falta. Sin h104, todo
   está pendiente. */
export function estadoDePiezas(items = []) {
  return (Array.isArray(items) ? items : []).map(i => {
    const p = piezaDe(i), entregadas = Math.min(p.cantidad, Math.max(0, Number(i.delivered || 0)));
    return { ...p, entregadas, pendientes: i.pending != null ? Math.max(0, Number(i.pending)) : p.cantidad - entregadas };
  });
}
/* De entrada se lleva todo lo pendiente. */
export const seleccionInicial = estado => Object.fromEntries(estado.filter(p => p.pendientes > 0).map(p => [p.id, p.pendientes]));
export function resumen(estado, sel = {}) {
  const pendientes = estado.reduce((n, p) => n + p.pendientes, 0);
  const lleva = estado.reduce((n, p) => n + Math.min(p.pendientes, Math.max(0, Number(sel[p.id] || 0))), 0);
  return { lleva, pendientes, queda: pendientes - lleva, yaSeLlevo: estado.reduce((n, p) => n + p.entregadas, 0) };
}
export function textoBoton({ lleva, pendientes }) {
  if (!lleva) return 'Elige qué se lleva';
  return lleva === pendientes ? `Entregar ${num(lleva, 'pieza', 'piezas')}` : `Entregar ${lleva} de ${pendientes}`;
}
export const piezasParaGuardar = (sel = {}) => Object.entries(sel).filter(([, q]) => Number(q) > 0).map(([item_id, q]) => ({ item_id, quantity: Number(q) }));

/* Lo que falta para poder entregar. */
export function faltaParaEntregar({ lleva = 0, quien = '', acepta = false } = {}) {
  if (!lleva) return 'Elige al menos una pieza.';
  if (limpia(quien).length < 2) return 'Escribe quién lo recoge.';
  if (!acepta) return 'Confirma que revisó y recibe en buen estado.';
  return '';
}

export function fechaHora(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Mexico_City' }).format(d);
}
const fechaCorta = iso => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', timeZone: 'America/Mexico_City' }).format(d).replace('.', ''); };
export const primerNombre = t => limpia(t).split(' ')[0] || '';
const renglon = p => `${p.cantidad > 1 ? `${p.cantidad} × ` : ''}${p.nombre}${p.detalle ? ` (${p.detalle})` : ''}`;

/* El mensaje de WhatsApp para quien compró: es el registro de la entrega. */
export function textoWhatsApp(rec = {}, club = 'el club') {
  const lleva = piezasDe(rec.items), queda = piezasDe(rec.pending), n = totalPiezas(rec.items);
  const rel = rec.relation && rec.relation !== 'otro' ? ` (${(CORTAS[rec.relation] || '').toLowerCase()})` : '';
  const para = limpia(rec.playerName);
  return [
    `Hola${primerNombre(rec.customerName) ? ` ${primerNombre(rec.customerName)}` : ''}, te compartimos tu recibo de entrega de ${club}.`,
    '',
    `Recibo ${rec.receiptFolio || ''} · Pedido ${rec.folio || ''}`,
    `${queda.length ? 'Entrega parcial' : 'Entregado completo'}${para ? ` para ${para}` : ''}: ${num(n, 'pieza', 'piezas')}.`,
    ...lleva.map(p => `✓ ${renglon(p)}`),
    ...(queda.length ? ['', 'Queda pendiente (te avisamos en cuanto llegue):', ...queda.map(p => `· ${renglon(p)}`)] : []),
    '',
    `Recibió: ${limpia(rec.receivedBy)}${rel}, ${fechaHora(rec.deliveredAt)}.`,
    `Si alguna pieza trae un defecto de fábrica, avísanos en los próximos ${DIAS_GARANTIA} días. Lo estampado es personal y no tiene cambio.`,
    '',
    'Gracias por vestir los colores. #WeAreTanners'
  ].join('\n');
}
export const ligaWhatsApp = (tel, texto) => { const d = String(tel || '').replace(/\D/g, ''); return d ? `https://wa.me/${d.length === 10 ? `52${d}` : d}?text=${encodeURIComponent(texto)}` : null; };
export const nombreArchivo = rec => `Recibo-entrega-${String(rec.receiptFolio || rec.folio || 'pedido').replace(/[^A-Za-z0-9-]+/g, '')}.png`;

/* ====================== Lo que sí toca la pantalla ====================== */

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12.5l4 4 8-9"/></svg>';

function capa(html, etiqueta) {
  const fondo = document.createElement('div');
  fondo.className = 'ent-capa';
  fondo.innerHTML = `<section class="ent-hoja" role="dialog" aria-modal="true" aria-label="${esc(etiqueta)}"><span class="ent-asa" aria-hidden="true"></span>${html}</section>`;
  document.body.appendChild(fondo); document.body.classList.add('ent-sin-scroll');
  requestAnimationFrame(() => fondo.classList.add('entra'));
  return fondo;
}
function cierraCapa(fondo) {
  fondo.classList.remove('entra');
  if (!document.querySelectorAll('.ent-capa.entra').length) document.body.classList.remove('ent-sin-scroll');
  setTimeout(() => fondo.remove(), 260);
}

/* La hoja de entregar. `items` trae lo que ya se llevó (delivered) y lo que
   falta (pending). Devuelve el recibo guardado, o null si se canceló. */
export function abreEntrega({ order, items = [], playerName = '', guarda }) {
  return new Promise(resolve => {
    const estado = estadoDePiezas(items), sel = seleccionInicial(estado);
    const pendientes = estado.filter(p => p.pendientes > 0), llevadas = estado.filter(p => p.entregadas > 0);
    const quien0 = limpia(order?.customer_name);
    let relacion = 'titular', ocupado = false;
    const fila = p => `<li class="ent-fila" data-pieza="${esc(p.id)}" role="checkbox" aria-checked="true" tabindex="0">
        <span class="ent-circulo">${CHECK}</span>
        <span class="ent-pieza"><strong>${esc(p.nombre)}</strong>${p.detalle ? `<small>${esc(p.detalle)}</small>` : ''}</span>
        ${p.pendientes > 1 ? `<span class="ent-paso-cant" data-cant><button type="button" data-menos aria-label="Una menos">−</button><output>${p.pendientes}</output><button type="button" data-mas aria-label="Una más">+</button></span>`
          : '<span class="ent-estado">Pendiente</span>'}</li>`;
    const fondo = capa(`
      <header class="ent-barra"><button type="button" class="ent-texto" data-cierra>Cancelar</button><b>Entregar</b><span></span></header>
      <div class="ent-cuerpo">
        <div class="ent-quien"><h2>${esc(playerName || quien0 || 'Pedido')}</h2><p>${esc(order?.folio || '')}${playerName && quien0 ? ` · pidió ${esc(quien0)}` : ''}</p></div>
        <p class="ent-seccion">Se lleva hoy</p>
        <ul class="ent-grupo">${pendientes.map(fila).join('')}</ul>
        <p class="ent-pie-grupo">Toca lo que no llegó y se queda pendiente.</p>
        ${llevadas.length ? `<p class="ent-seccion">Ya se llevó</p><ul class="ent-grupo apagado">${llevadas.map(p => `<li class="ent-fila"><span class="ent-circulo listo">${CHECK}</span>
          <span class="ent-pieza"><strong>${p.entregadas > 1 ? `${p.entregadas} × ` : ''}${esc(p.nombre)}</strong>${p.detalle ? `<small>${esc(p.detalle)}</small>` : ''}</span></li>`).join('')}</ul>` : ''}
        <p class="ent-seccion">Quién lo recoge</p>
        <div class="ent-grupo"><input id="entQuien" class="ent-campo" type="text" autocomplete="name" maxlength="120" value="${esc(quien0)}" placeholder="Nombre" aria-label="Nombre de quien recoge"></div>
        <div class="ent-segmento" role="radiogroup" aria-label="Quién es">${RELACIONES.map(([k, t]) => `<button type="button" role="radio" data-rel="${k}" aria-checked="${k === relacion}">${CORTAS[k]}</button>`).join('')}</div>
        <div class="ent-grupo ent-acepta-grupo"><label class="ent-fila ent-acepta" for="entAcepta"><span class="ent-pieza"><strong>Revisó y recibe en buen estado</strong></span>
          <input type="checkbox" id="entAcepta" class="ent-switch" role="switch"></label></div>
        <p class="ent-pie-grupo">Al entregar sale su recibo para mandárselo por WhatsApp.</p>
      </div>
      <footer class="ent-pie"><button type="button" class="ent-cta" id="entConfirma" disabled></button><p class="ent-falta" id="entFalta" aria-live="polite"></p></footer>`, 'Entregar pedido');
    const $ = s => fondo.querySelector(s);
    const termina = r => { cierraCapa(fondo); document.removeEventListener('keydown', tecla); resolve(r); };
    const tecla = e => { if (e.key === 'Escape' && !ocupado) termina(null); };
    document.addEventListener('keydown', tecla);

    function pinta() {
      for (const p of pendientes) {
        const li = fondo.querySelector(`[data-pieza="${CSS.escape(p.id)}"]`), q = Number(sel[p.id] || 0);
        li.setAttribute('aria-checked', String(q > 0)); li.classList.toggle('fuera', q === 0);
        const out = li.querySelector('output'); if (out) out.textContent = q ? `${q} de ${p.pendientes}` : `0 de ${p.pendientes}`;
        const est = li.querySelector('.ent-estado'); if (est) est.textContent = q ? '' : 'Pendiente';
      }
      const r = resumen(estado, sel), falta = faltaParaEntregar({ lleva: r.lleva, quien: $('#entQuien').value, acepta: $('#entAcepta').checked });
      const b = $('#entConfirma'); b.textContent = ocupado ? 'Entregando…' : textoBoton(r); b.disabled = !!falta || ocupado;
      $('#entFalta').textContent = r.lleva && r.queda ? `${num(r.queda, 'pieza se queda', 'piezas se quedan')} pendiente${r.queda === 1 ? '' : 's'}. ${falta}`.trim() : falta;
      return falta;
    }
    const alterna = li => { const p = pendientes.find(x => x.id === li.dataset.pieza); if (!p) return; sel[p.id] = Number(sel[p.id] || 0) > 0 ? 0 : p.pendientes; pinta(); };
    fondo.addEventListener('click', async e => {
      if (e.target === fondo || e.target.closest('[data-cierra]')) { if (!ocupado) termina(null); return; }
      const li = e.target.closest('[data-pieza]');
      if (li) {
        const p = pendientes.find(x => x.id === li.dataset.pieza);
        if (e.target.closest('[data-menos]')) { sel[p.id] = Math.max(0, Number(sel[p.id] || 0) - 1); pinta(); return; }
        if (e.target.closest('[data-mas]')) { sel[p.id] = Math.min(p.pendientes, Number(sel[p.id] || 0) + 1); pinta(); return; }
        alterna(li); return;
      }
      const r = e.target.closest('[data-rel]');
      if (r) {
        const antes = relacion; relacion = r.dataset.rel; fondo.querySelectorAll('[data-rel]').forEach(b => b.setAttribute('aria-checked', String(b === r)));
        // De "Quien compró" a otra persona: es otra persona, se escribe su nombre.
        const q = $('#entQuien');
        if (antes === 'titular' && relacion !== 'titular' && limpia(q.value) === quien0) { q.value = ''; q.focus(); }
        else if (antes !== 'titular' && relacion === 'titular' && !limpia(q.value)) q.value = quien0;
        pinta(); return;
      }
      if (e.target.closest('#entConfirma')) {
        if (pinta()) return;
        ocupado = true; pinta();
        try { termina(await guarda({ receivedBy: limpia($('#entQuien').value), relation: relacion, accepted: true, items: piezasParaGuardar(sel), completo: resumen(estado, sel).queda === 0 })); }
        catch (err) { ocupado = false; pinta(); $('#entFalta').textContent = err?.message || 'No se pudo entregar.'; }
      }
    });
    fondo.addEventListener('keydown', e => { const li = e.target.closest?.('[data-pieza]'); if (li && (e.key === ' ' || e.key === 'Enter') && e.target === li) { e.preventDefault(); alterna(li); } });
    $('#entQuien').addEventListener('input', pinta);
    $('#entAcepta').addEventListener('change', pinta);
    pinta();
  });
}

/* El recibo: uno o varios (si se entregó por partes, del más nuevo al más viejo). */
export async function muestraRecibo(recs, { club = 'el club', alMandar } = {}) {
  const lista = (Array.isArray(recs) ? recs : [recs]).filter(Boolean);
  if (!lista.length) return;
  let i = 0, url = '', archivo = null;
  const fondo = capa(`
    <header class="ent-barra"><span></span><b id="entRecTitulo"></b><button type="button" class="ent-texto fuerte" data-cierra>Listo</button></header>
    <div class="ent-cuerpo centro">
      <div class="ent-hecho"><span class="ent-hecho-ico">${CHECK}</span><h2 id="entRecEstado"></h2><p id="entRecSub"></p></div>
      ${lista.length > 1 ? `<div class="ent-segmento" role="tablist" aria-label="Entregas">${lista.map((r, k) => `<button type="button" role="tab" data-rec="${k}" aria-checked="${k === 0}">Entrega ${r.number || lista.length - k}</button>`).join('')}</div>` : ''}
      <img class="ent-recibo" id="entRecImg" alt="">
      <p class="ent-pie-grupo" id="entRecNota"></p>
    </div>
    <footer class="ent-pie"><button type="button" class="ent-cta" data-wa>Mandar por WhatsApp</button><button type="button" class="ent-texto ancho" data-baja>Guardar imagen</button></footer>`, 'Recibo de entrega');
  const $ = s => fondo.querySelector(s);
  async function muestra(k) {
    i = k; const rec = lista[k];
    fondo.querySelectorAll('[data-rec]').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.rec) === k)));
    const queda = totalPiezas(rec.pending);
    $('#entRecTitulo').textContent = rec.receiptFolio || 'Recibo';
    $('#entRecEstado').textContent = queda ? 'Entrega parcial' : 'Entregado';
    $('#entRecSub').textContent = `${num(totalPiezas(rec.items), 'pieza', 'piezas')}${queda ? ` · ${queda} pendiente${queda === 1 ? '' : 's'}` : ''} · ${fechaHora(rec.deliveredAt)}`;
    $('#entRecNota').textContent = rec._sinGuardar ? 'Quién recogió no quedó guardado en la base (falta activar h104). Mándale el recibo por WhatsApp para que quede el registro.'
      : rec.sentWhatsappAt ? `Se mandó por WhatsApp el ${fechaCorta(rec.sentWhatsappAt)}.` : (rec.customerPhone ? '' : 'Este pedido no tiene teléfono: guarda la imagen y mándala tú.');
    $('[data-wa]').disabled = !rec.customerPhone && !navigator.canShare;
    if (url) URL.revokeObjectURL(url);
    const blob = await dibujaReciboEntrega(rec, { club });
    url = URL.createObjectURL(blob); archivo = new File([blob], nombreArchivo(rec), { type: 'image/png' });
    const img = $('#entRecImg'); img.src = url; img.alt = `Recibo ${rec.receiptFolio || ''}: ${textoWhatsApp(rec, club).split('\n').slice(3, 4).join('')}`;
  }
  const baja = () => { const a = document.createElement('a'); a.href = url; a.download = archivo.name; document.body.appendChild(a); a.click(); a.remove(); };
  await muestra(0);
  return new Promise(resolve => {
    const termina = () => { cierraCapa(fondo); document.removeEventListener('keydown', tecla); setTimeout(() => URL.revokeObjectURL(url), 60000); resolve(); };
    const tecla = e => { if (e.key === 'Escape') termina(); };
    document.addEventListener('keydown', tecla);
    fondo.addEventListener('click', async e => {
      if (e.target === fondo || e.target.closest('[data-cierra]')) { termina(); return; }
      const t = e.target.closest('[data-rec]'); if (t) { await muestra(Number(t.dataset.rec)); return; }
      if (e.target.closest('[data-baja]')) { baja(); return; }
      if (e.target.closest('[data-wa]')) {
        // En el teléfono, la imagen va directo a WhatsApp con el mensaje; en la
        // compu, se guarda la imagen y se abre el chat con el texto.
        const rec = lista[i], texto = textoWhatsApp(rec, club), wa = ligaWhatsApp(rec.customerPhone, texto);
        let como = '';
        try { if (navigator.canShare?.({ files: [archivo] })) { await navigator.share({ files: [archivo], text: texto }); como = 'compartido'; } }
        catch (err) { if (err?.name === 'AbortError') return; }
        if (!como && wa) { baja(); window.open(wa, '_blank', 'noopener'); como = 'liga'; }
        if (como) alMandar?.(rec, como);
      }
    });
  });
}

/* ---------- El recibo en imagen: marino, oro y escudo ---------- */
const C = { navy: '#07191e', oro: '#c8ae62', oroClaro: '#e9d19c', oroOsc: '#a9895a', crema: '#f6f2e8', papel: '#fffdf8', gris: '#6b7a7e', linea: '#e6dfcd', ok: '#1d7a46', pendiente: '#b07d12' };
const W = 1080;
const cargaImagen = src => new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
function espaciado(g, texto, x, y, sp, alinea = 'center') {
  const letras = [...texto], ancho = letras.reduce((n, l) => n + g.measureText(l).width, 0) + sp * (letras.length - 1);
  let cx = alinea === 'center' ? x - ancho / 2 : alinea === 'right' ? x - ancho : x;
  g.textAlign = 'left'; for (const l of letras) { g.fillText(l, cx, y); cx += g.measureText(l).width + sp; }
}
function parrafo(g, t, x, y, max, alto) {
  let linea = '', n = 0;
  for (const p of String(t).split(' ')) { const prueba = linea ? `${linea} ${p}` : p; if (g.measureText(prueba).width > max && linea) { g.fillText(linea, x, y + n * alto); n++; linea = p; } else linea = prueba; }
  if (linea) { g.fillText(linea, x, y + n * alto); n++; }
  return n * alto;
}
function corta(g, t, max) { if (g.measureText(t).width <= max) return t; while (t.length > 1 && g.measureText(`${t}…`).width > max) t = t.slice(0, -1); return `${t}…`; }
function piezaEnRecibo(g, p, y, color, marca) {
  g.fillStyle = color; g.beginPath(); g.arc(104, y - 11, 14, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 3.5; g.lineCap = 'round'; g.beginPath();
  if (marca === 'check') { g.moveTo(97, y - 11); g.lineTo(102, y - 6); g.lineTo(111, y - 16); } else { g.moveTo(98, y - 11); g.lineTo(110, y - 11); }
  g.stroke();
  g.fillStyle = C.navy; g.font = '600 32px Inter'; g.textAlign = 'left'; g.fillText(corta(g, `${p.cantidad > 1 ? `${p.cantidad} × ` : ''}${p.nombre}`, 820), 134, y);
  if (p.detalle) { y += 36; g.fillStyle = C.gris; g.font = '400 24px Inter'; g.fillText(corta(g, p.detalle, 820), 134, y); }
  y += 16; g.strokeStyle = C.linea; g.lineWidth = 2; g.beginPath(); g.moveTo(90, y); g.lineTo(W - 90, y); g.stroke();
  return y;
}

export async function dibujaReciboEntrega(rec, { club = 'el club' } = {}) {
  try { await Promise.all(['800 90px "Barlow Condensed"', '700 40px "Barlow Condensed"', '400 26px Inter', '600 26px Inter', '800 26px Inter'].map(f => document.fonts.load(f))); } catch { /* fuente del sistema */ }
  const lleva = piezasDe(rec.items), queda = piezasDe(rec.pending), parcial = queda.length > 0;
  const c = document.createElement('canvas'); c.width = W; c.height = 2000 + (lleva.length + queda.length) * 100;
  const g = c.getContext('2d');
  g.fillStyle = C.crema; g.fillRect(0, 0, W, c.height);

  // Arriba: marino con el escudo.
  const alto = 440;
  const fondo = g.createRadialGradient(W / 2, 0, 40, W / 2, 0, 900); fondo.addColorStop(0, '#14363e'); fondo.addColorStop(.65, C.navy);
  g.fillStyle = fondo; g.fillRect(0, 0, W, alto);
  g.save(); g.globalAlpha = .06; g.strokeStyle = C.oro; g.lineWidth = 2;
  for (let x = -alto; x < W; x += 30) { g.beginPath(); g.moveTo(x, alto); g.lineTo(x + alto, 0); g.stroke(); }
  g.restore();
  const escudo = await cargaImagen('/brand/crest-gold.png');
  if (escudo) { const h = 120, w = escudo.width * h / escudo.height; g.drawImage(escudo, W / 2 - w / 2, 50, w, h); }
  g.fillStyle = C.oroClaro; g.font = '800 24px Inter'; espaciado(g, 'TIENDA OFICIAL · RECIBO DE ENTREGA', W / 2, 220, 5);
  g.fillStyle = '#fff'; g.font = '800 100px "Barlow Condensed"'; g.textAlign = 'center'; g.fillText(parcial ? 'ENTREGA PARCIAL' : 'UNIFORME ENTREGADO', W / 2, 320);
  g.fillStyle = '#c9d4d6'; g.font = '400 28px Inter';
  g.fillText(rec.playerName ? `Para ${limpia(rec.playerName)}${rec.playerCategory ? ` · ${limpia(rec.playerCategory)}` : ''}` : 'Gracias por vestir los colores.', W / 2, 374);

  // El boleto.
  let y = alto - 50; const bx = 90, bw = W - 180, bh = 200;
  g.fillStyle = C.papel; g.beginPath(); g.roundRect(bx, y, bw, bh, 28); g.fill(); g.strokeStyle = C.oro; g.lineWidth = 3; g.stroke();
  g.fillStyle = C.crema; [bx, bx + bw].forEach(cx => { g.beginPath(); g.arc(cx, y + bh / 2, 22, 0, Math.PI * 2); g.fill(); });
  g.fillStyle = C.oroOsc; g.font = '800 22px Inter'; espaciado(g, `RECIBO · PEDIDO ${rec.folio || ''}`, W / 2, y + 54, 5);
  g.fillStyle = C.navy; g.font = '800 84px "Barlow Condensed"'; g.textAlign = 'center'; g.fillText(rec.receiptFolio || '', W / 2, y + 140);
  g.fillStyle = C.gris; g.font = '400 24px Inter'; g.fillText(fechaHora(rec.deliveredAt), W / 2, y + 180);
  y += bh + 70;

  // Lo que se llevó y, si aplica, lo que queda pendiente.
  g.textAlign = 'left'; g.fillStyle = C.oroOsc; g.font = '800 22px Inter';
  espaciado(g, `${parcial ? 'SE LLEVÓ HOY' : 'LO QUE SE ENTREGÓ'} · ${totalPiezas(rec.items)} ${totalPiezas(rec.items) === 1 ? 'PIEZA' : 'PIEZAS'}`, 90, y, 5, 'left'); y += 20;
  for (const p of lleva) y = piezaEnRecibo(g, p, y + 52, C.ok, 'check');
  if (parcial) {
    y += 70; g.fillStyle = C.pendiente; g.font = '800 22px Inter'; espaciado(g, `QUEDA PENDIENTE · ${totalPiezas(rec.pending)} · TE AVISAMOS EN CUANTO LLEGUE`, 90, y, 4, 'left'); y += 20;
    for (const p of queda) y = piezaEnRecibo(g, p, y + 52, C.pendiente, 'raya');
  }
  const total = Number(rec.total || 0), pagado = Number(rec.paid || 0);
  y += 64; g.fillStyle = C.navy; g.font = '700 40px "Barlow Condensed"'; g.textAlign = 'left'; g.fillText('PAGADO', 90, y);
  g.textAlign = 'right'; g.font = '800 64px "Barlow Condensed"'; g.fillText(dinero.format(pagado), W - 90, y + 4);
  y += 38; g.font = '400 24px Inter'; g.fillStyle = pagado + 0.005 >= total ? C.ok : C.gris;
  g.fillText(pagado + 0.005 >= total ? `Pagado completo · total ${dinero.format(total)}` : `Total ${dinero.format(total)}`, W - 90, y);

  // Quién recibió y quién entregó.
  y += 50; const cajaY = y;
  const legal = [`Revisó y recibió en buen estado lo que se llevó hoy.${rec.deliveredByName ? ` Entregó: ${limpia(rec.deliveredByName)}.` : ''}`,
    `Garantía por defecto de fábrica: ${DIAS_GARANTIA} días desde hoy. Lo estampado es personal y no tiene cambio.`];
  g.font = '400 24px Inter';
  const altoLegal = legal.reduce((n, t) => n + Math.ceil(g.measureText(t).width / (W - 210)) * 34 + 10, 0);
  const fh = 170 + altoLegal;
  g.fillStyle = C.papel; g.beginPath(); g.roundRect(70, y, W - 140, fh, 24); g.fill(); g.strokeStyle = C.linea; g.lineWidth = 2; g.stroke();
  g.textAlign = 'left'; g.fillStyle = C.oroOsc; g.font = '800 22px Inter'; espaciado(g, 'RECIBIÓ', 104, y + 52, 5, 'left');
  g.fillStyle = C.navy; g.font = '700 44px "Barlow Condensed"'; g.fillText(corta(g, limpia(rec.receivedBy).toUpperCase(), 620), 104, y + 104);
  const rel = CORTAS[rec.relation]; if (rel && rec.relation !== 'otro') { g.textAlign = 'right'; g.fillStyle = C.gris; g.font = '400 26px Inter'; g.fillText(rel, W - 104, y + 102); }
  g.textAlign = 'left'; g.fillStyle = C.gris; g.font = '400 24px Inter';
  let ly = cajaY + 156;
  for (const t of legal) ly += parrafo(g, t, 104, ly, W - 210, 34) + 10;

  // Abajo: el lema del club, justo después de lo dibujado.
  const pie = cajaY + fh + 90;
  const fin = document.createElement('canvas'); fin.width = W; fin.height = pie + 170;
  const f = fin.getContext('2d'); f.drawImage(c, 0, 0); c.width = 0;
  f.fillStyle = C.navy; f.fillRect(0, pie, W, 170);
  f.fillStyle = C.oro; f.font = '600 22px Inter'; espaciado(f, 'CURTIMOS CAMPEONES DEL MUNDO', W / 2, pie + 70, 6);
  f.fillStyle = '#fff'; f.font = '800 48px "Barlow Condensed"'; f.textAlign = 'center'; f.fillText('#WeAreTanners', W / 2, pie + 128);
  f.fillStyle = C.oroOsc; f.font = '400 20px Inter'; f.fillText(club, W / 2, pie - 26);
  return await new Promise(ok => fin.toBlob(ok, 'image/png'));
}
