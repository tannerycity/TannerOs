// Hoja de cobro con desglose: un solo cobro con varios conceptos.
//
// Pedido del club (21/10/2026): "nos pagan 1,500: 1,000 de inscripción y 500
// de mensualidad; nos cuesta un huevo registrarlo por separado". Aquí se toca
// lo que paga (meses, recargo, inscripción, uniforme, arbitraje...) y se cobra
// una vez. Hasta dos métodos (efectivo + transferencia).
//
// La base hace el reparto en una sola transacción (v2_collect_ticket): o entra
// todo o nada. Por debajo cada parte es el pago de siempre, ligado por folio,
// así que Conciliación y Contabilidad no cambian.
//
// La usan el estado de cuenta del Tanner y Taquilla. Quien la abre pasa rpc y
// el Tanner; la hoja carga lo demás (v2_player_collection).
import { TARIFAS, aplicaPrecios } from '/costos/tarifas.js';

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 });
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const METODOS = [['cash', 'Efectivo'], ['transfer', 'Transferencia'], ['card', 'Tarjeta']];
const nombreMetodo = m => (METODOS.find(x => x[0] === m) || [m, 'Otro'])[1];
// Las mismas categorías que "Otro ingreso" de Taquilla, para que Contabilidad
// las agrupe igual. Uniforme no va aquí: se cobra contra su pedido.
const OTROS = ['Torneo', 'Curso de Verano', 'Academia · Academia de porteros', 'Renta de cancha', 'Patrocinio'];
const QUIEN = 'tos-cobro-quien';
const hoyLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const llave = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const leeLocal = k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const guardaLocal = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento: no pasa nada */ } };
// Un celular de 10 dígitos va con la lada de México; WhatsApp no lo abre sin ella.
const conLada = t => { const n = String(t || '').replace(/\D/g, ''); return n.length === 10 ? `52${n}` : n; };
export const folioTexto = n => `C-${String(n ?? '').padStart(4, '0')}`;
const num = v => { const n = Number(String(v ?? '').replace(/[^\d.]/g, '')); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; };

let s = null;

function cargaEstilos() {
  if (document.querySelector('link[data-cobro-css]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = '/v2/cobro/hoja.css?v=20261021a'; l.dataset.cobroCss = '1';
  document.head.appendChild(l);
}

function asegura() {
  cargaEstilos();
  if (document.getElementById('cobroSheet')) return;
  document.body.insertAdjacentHTML('beforeend', '<div id="cobroBackdrop" class="pres-backdrop hidden"></div><section id="cobroSheet" class="pres-sheet cobro-sheet hidden" role="dialog" aria-modal="true" aria-labelledby="cobroTitle"><div class="pres-grab" aria-hidden="true"></div><div id="cobroBody"></div></section>');
  document.getElementById('cobroBackdrop').addEventListener('click', () => { if (!s?.enviando) cierra(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && s && !s.enviando) cierra(); });
  const b = document.getElementById('cobroBody');
  b.addEventListener('click', alClic);
  b.addEventListener('input', alEscribir);
  b.addEventListener('change', alCambiar);
  b.addEventListener('submit', e => { e.preventDefault(); envia(); });
}

function cierra() {
  const hecho = s?.hecho, fin = s?.alTerminar;
  s = null;
  document.getElementById('cobroSheet')?.classList.add('hidden');
  document.getElementById('cobroBackdrop')?.classList.add('hidden');
  document.body.style.overflow = '';
  if (hecho) aviso(`Cobro registrado · Folio ${folioTexto(hecho.folio)}`);
  if (hecho && fin) fin(hecho);
}
function aviso(t) {
  let el = document.getElementById('cobroToast');
  if (!el) { document.body.insertAdjacentHTML('beforeend', '<div id="cobroToast" class="pres-toast" role="status"></div>'); el = document.getElementById('cobroToast'); }
  el.textContent = t; el.classList.add('visible');
  clearTimeout(aviso.t); aviso.t = setTimeout(() => el.classList.remove('visible'), 3800);
}

// Edad cumplida a hoy; null si no hay fecha.
function edad(fecha) {
  if (!fecha) return null;
  const n = new Date(`${String(fecha).slice(0, 10)}T12:00:00`), h = new Date();
  if (Number.isNaN(n.getTime())) return null;
  let a = h.getFullYear() - n.getFullYear();
  if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) a--;
  return a;
}
// Las categorías de Costos con su inscripción. Se propone la que corresponde
// a la edad del Tanner; si no se sabe, la primera. Siempre se puede cambiar.
function inscripciones() {
  const t = aplicaPrecios(TARIFAS, s.col?.prices || null);
  return (t.categorias || []).filter(c => Number(c.inscripcion) > 0).map(c => {
    const n = String(c.edades || '').match(/\d+/g)?.map(Number) || [];
    return { clave: c.clave, nombre: c.nombre, precio: Number(c.inscripcion), min: n[0] ?? 0, max: n[1] ?? n[0] ?? 99 };
  });
}
function inscripcionSugerida() {
  const cats = inscripciones(), a = edad(s.nacimiento);
  if (!cats.length) return null;
  const caben = a == null ? [] : cats.filter(c => a >= c.min && a <= c.max).sort((x, y) => y.min - x.min);
  return caben[0] || cats[0];
}

// Lo que se puede tocar. Los cargos que paga un patrocinador no entran: se
// cobran aparte, con su nombre.
function opciones() {
  const cargos = (s.col?.charges || []).filter(c => !c.sponsor).map(c => ({ key: `c:${c.id}`, kind: 'charge', id: c.id, label: c.label, max: Number(c.balance), period: String(c.period || '').slice(0, 7), type: c.type }));
  const pedidos = s.col?.canOrders ? (s.col?.orders || []).map(o => ({ key: `o:${o.id}`, kind: 'order', id: o.id, label: `Uniforme ${o.folio}`, max: Number(o.balance) })) : [];
  const yaInscripcion = cargos.some(c => c.type === 'registration');
  const extra = [];
  if (!yaInscripcion && inscripciones().length) extra.push({ key: 'reg', kind: 'registration', label: 'Inscripción' });
  extra.push({ key: 'arb', kind: 'income', category: 'Arbitraje', label: 'Arbitraje' });
  extra.push({ key: 'otro', kind: 'income', category: '', label: 'Otro ingreso' });
  extra.push({ key: 'abono', kind: 'abono', label: 'Abono a cuenta' });
  return { cargos, pedidos, extra };
}

function agrega(o) {
  if (s.sel.has(o.key)) return;
  const item = { ...o };
  if (o.kind === 'charge' || o.kind === 'order') item.amount = o.max;
  else if (o.kind === 'registration') { const c = inscripcionSugerida(); item.cat = c?.clave || ''; item.total = c?.precio || ''; item.amount = c?.precio || ''; }
  else item.amount = '';
  s.sel.set(o.key, item);
}

function total() { let t = 0; for (const i of s.sel.values()) t += num(i.amount); return Math.round(t * 100) / 100; }

function pinta() {
  const b = document.getElementById('cobroBody'); if (!b || !s) return;
  const cab = (t, sub) => `<header class="pres-head"><div><h2 id="cobroTitle">${esc(t)}</h2><p>${esc(sub)}</p></div><button type="button" class="pres-close" data-cobro-cerrar aria-label="Cerrar">×</button></header>`;
  if (s.cargando) { b.innerHTML = `${cab('Cobrar', s.nombre)}<p class="pres-nota">Cargando lo que debe…</p>`; return; }
  if (s.fallo) { b.innerHTML = `${cab('Cobrar', s.nombre)}<div class="pres-error" role="alert">${esc(s.fallo)}</div>`; return; }
  if (s.hecho) { b.innerHTML = cab('Cobro registrado', s.nombre) + hechoHtml(); return; }
  const { cargos, pedidos, extra } = opciones();
  const chip = o => `<button type="button" class="cobro-chip" data-chip="${esc(o.key)}" aria-pressed="${s.sel.has(o.key)}">${esc(o.label)}${o.max != null ? `<b>${money.format(o.max)}</b>` : '<i aria-hidden="true">+</i>'}</button>`;
  const debe = cargos.length || pedidos.length
    ? `<div class="cobro-chips">${[...cargos, ...pedidos].map(chip).join('')}</div>`
    : '<p class="cobro-vacio">No debe nada. Puedes cobrar inscripción, arbitraje o un adelanto.</p>';
  const lineas = [...s.sel.values()].map(lineaHtml).join('');
  const t = total();
  const err = s.error ? `<div class="pres-error" role="alert">${esc(s.error)}</div>` : '';
  b.innerHTML = `${cab('Cobrar', s.nombre)}<form class="pres-form cobro-form" novalidate>
    <div class="cobro-bloque"><span class="cobro-titulo">¿Qué paga? <small>toca para agregar</small></span>${debe}
      <div class="cobro-chips cobro-extra">${extra.map(chip).join('')}</div></div>
    ${lineas ? `<div class="cobro-lineas">${lineas}</div>` : ''}
    <div class="cobro-total"><span>Total que recibes</span><strong id="cobroTotal">${money.format(t)}</strong></div>
    ${metodosHtml(t)}
    <div class="pres-row"><label>¿Quién cobró?<input id="cobroQuien" type="text" maxlength="60" autocomplete="off" placeholder="Tu nombre" value="${esc(s.quien)}"></label>
      <label>Fecha<input id="cobroFecha" type="date" value="${esc(s.fecha)}" max="${hoyLocal()}"></label></div>
    <label><span>Observaciones <span class="cobro-opt">· opcional</span></span><input id="cobroObs" type="text" maxlength="300" placeholder="Pagó la abuela, quedó a deber..." value="${esc(s.obs)}"></label>
    ${err}<button type="submit" class="pres-primary" id="cobroEnviar"${s.enviando || t <= 0 ? ' disabled' : ''}>${s.enviando ? 'Un momento…' : t > 0 ? `Cobrar ${money.format(t)}` : 'Elige qué paga'}</button>
  </form>`;
}

function lineaHtml(i) {
  const monto = (v, extra = '') => `<span class="cobro-peso"><input type="text" inputmode="decimal" data-monto="${esc(i.key)}" value="${esc(String(i.amount ?? ''))}" placeholder="0" aria-label="Monto de ${esc(i.label)}"${extra}></span>`;
  const quita = `<button type="button" class="cobro-quita" data-quita="${esc(i.key)}" aria-label="Quitar ${esc(i.label)}">×</button>`;
  if (i.kind === 'registration') {
    const cats = inscripciones();
    const elige = cats.length > 1 ? `<div class="cobro-mini">${cats.map(c => `<button type="button" data-cat="${esc(c.clave)}" aria-pressed="${i.cat === c.clave}">${esc(c.nombre)} ${money.format(c.precio)}</button>`).join('')}</div>` : '';
    const abono = num(i.amount) > 0 && num(i.total) > num(i.amount) ? `<small class="cobro-nota">Queda a deber ${money.format(num(i.total) - num(i.amount))} de inscripción.</small>` : '';
    return `<div class="cobro-linea" data-linea="${esc(i.key)}"><div class="cobro-linea-top"><strong>Inscripción</strong>${quita}</div>${elige}
      <div class="cobro-dos"><label>Precio<span class="cobro-peso"><input type="text" inputmode="decimal" data-total="reg" value="${esc(String(i.total ?? ''))}" placeholder="0"></span></label>
      <label>Paga hoy${monto()}</label></div>${abono}</div>`;
  }
  if (i.kind === 'income' && i.key === 'otro') {
    const opts = ['', ...OTROS].map(c => `<option value="${esc(c)}"${c === i.category ? ' selected' : ''}>${c ? esc(c) : 'Elige…'}</option>`).join('');
    return `<div class="cobro-linea" data-linea="otro"><div class="cobro-linea-top"><strong>Otro ingreso</strong>${quita}</div>
      <div class="cobro-dos"><label>Categoría<select data-categoria="otro">${opts}</select></label><label>Monto${monto()}</label></div>
      <label><span>Concepto <span class="cobro-opt">· opcional</span></span><input type="text" data-concepto="otro" maxlength="80" value="${esc(i.concept || '')}" placeholder="Ej. Torneo de Navidad"></label></div>`;
  }
  const tope = i.max != null ? `<small class="cobro-nota">Debe ${money.format(i.max)}${num(i.amount) > 0 && num(i.amount) < i.max ? ` · queda ${money.format(i.max - num(i.amount))}` : ''}</small>` : i.kind === 'abono' ? '<small class="cobro-nota">Se aplica a lo más antiguo; si sobra, queda a favor.</small>' : '';
  return `<div class="cobro-linea" data-linea="${esc(i.key)}"><div class="cobro-linea-top"><strong>${esc(i.label)}</strong>${monto()}${quita}</div>${tope}</div>`;
}

function metodosHtml(t) {
  const seg = (sel, attr) => `<div class="pres-seg" role="radiogroup" aria-label="Método">${METODOS.map(([v, l]) => `<button type="button" role="radio" aria-checked="${sel === v}" ${attr}="${v}">${l}</button>`).join('')}</div>`;
  const usaRef = s.metodo !== 'cash' || (s.dos && s.metodo2 !== 'cash');
  let dos = '';
  if (s.dos) {
    const m1 = num(s.monto1), resto = Math.max(0, Math.round((t - m1) * 100) / 100);
    dos = `<div class="cobro-dos"><label>En ${esc(nombreMetodo(s.metodo).toLowerCase())}<span class="cobro-peso"><input type="text" inputmode="decimal" id="cobroMonto1" value="${esc(s.monto1)}" placeholder="0"></span></label>
      <label><span>Y el resto, <b id="cobroResto">${money.format(resto)}</b>, en</span><select id="cobroMetodo2">${METODOS.filter(([v]) => v !== s.metodo).map(([v, l]) => `<option value="${v}"${v === s.metodo2 ? ' selected' : ''}>${l}</option>`).join('')}</select></label></div>`;
  }
  return `<div class="cobro-bloque"><span class="cobro-titulo">¿Cómo paga?</span>${seg(s.metodo, 'data-metodo')}
    <button type="button" class="cobro-link" data-dos>${s.dos ? 'Pagó con un solo método' : 'Pagó con dos métodos'}</button>${dos}
    ${usaRef ? `<label><span>Referencia <span class="cobro-opt">· transferencia o terminal</span></span><input id="cobroRef" type="text" maxlength="80" value="${esc(s.ref)}" placeholder="Folio SPEI, últimos 4 de la tarjeta…"></label>` : ''}</div>`;
}

function hechoHtml() {
  const h = s.hecho;
  const partes = h.lineas.map(l => `<li><span>${esc(l.label)}</span><b>${money.format(l.amount)}</b></li>`).join('');
  const metodos = h.metodos.map(m => `${nombreMetodo(m.method)} ${money.format(m.amount)}`).join(' + ');
  const wa = s.telefono ? `<a class="pres-primary cobro-wa" target="_blank" rel="noopener" href="https://wa.me/${conLada(s.telefono)}?text=${encodeURIComponent(reciboTexto())}">Mandar recibo por WhatsApp</a>` : '';
  return `<div class="cobro-hecho"><div class="cobro-palomita" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></div>
    <strong>${money.format(h.total)}</strong><span>Folio ${esc(folioTexto(h.folio))} · ${esc(metodos)}</span>
    <ul class="cobro-recibo">${partes}</ul>${wa}
    <button type="button" class="cobro-listo" data-cobro-cerrar>Listo</button></div>`;
}

export function reciboTexto() {
  const h = s?.hecho; if (!h) return '';
  const lineas = h.lineas.map(l => `• ${l.label}: ${money.format(l.amount)}`).join('\n');
  const metodos = h.metodos.map(m => `${nombreMetodo(m.method)} ${money.format(m.amount)}`).join(' + ');
  return `Hola, recibimos el pago de ${s.nombre}. ¡Gracias!\n\n${lineas}\nTotal: ${money.format(h.total)} (${metodos})\nFolio ${folioTexto(h.folio)} · ${h.fecha}`;
}

function alClic(e) {
  const t = e.target.closest('button,a'); if (!t || !s) return;
  if (t.matches('[data-cobro-cerrar]')) { if (!s.enviando) cierra(); return; }
  if (s.enviando) return;
  const { cargos, pedidos, extra } = opciones();
  if (t.dataset.chip) {
    const o = [...cargos, ...pedidos, ...extra].find(x => x.key === t.dataset.chip); if (!o) return;
    if (s.sel.has(o.key)) s.sel.delete(o.key); else agrega(o);
    s.error = ''; pinta();
    if (s.sel.has(o.key) && o.max == null) document.querySelector(`[data-linea="${CSS.escape(o.key)}"] input`)?.focus();
  } else if (t.dataset.quita) { s.sel.delete(t.dataset.quita); pinta(); }
  else if (t.dataset.cat) {
    const c = inscripciones().find(x => x.clave === t.dataset.cat), i = s.sel.get('reg');
    if (c && i) { i.cat = c.clave; i.total = c.precio; i.amount = c.precio; pinta(); }
  } else if (t.dataset.metodo) {
    s.metodo = t.dataset.metodo;
    if (s.metodo2 === s.metodo) s.metodo2 = METODOS.find(([v]) => v !== s.metodo)[0];
    pinta();
  } else if (t.hasAttribute('data-dos')) { s.dos = !s.dos; pinta(); }
}

function alEscribir(e) {
  const x = e.target; if (!s) return;
  if (x.dataset.monto) { const i = s.sel.get(x.dataset.monto); if (i) i.amount = x.value; }
  else if (x.dataset.total) { const i = s.sel.get('reg'); if (i) { i.total = x.value; i.cat = ''; } }
  else if (x.dataset.concepto) { const i = s.sel.get('otro'); if (i) i.concept = x.value; }
  else if (x.id === 'cobroMonto1') s.monto1 = x.value;
  else if (x.id === 'cobroQuien') s.quien = x.value;
  else if (x.id === 'cobroRef') s.ref = x.value;
  else if (x.id === 'cobroObs') s.obs = x.value;
  else if (x.id === 'cobroFecha') s.fecha = x.value;
  recalcula();
}
function alCambiar(e) {
  const x = e.target; if (!s) return;
  if (x.dataset.categoria) { const i = s.sel.get('otro'); if (i) i.category = x.value; }
  else if (x.id === 'cobroMetodo2') s.metodo2 = x.value;
  else if (x.id === 'cobroFecha') s.fecha = x.value;
}
// Al teclear no se repinta la hoja (se perdería el cursor): sólo las cifras.
function recalcula() {
  const t = total();
  // El aviso de error era de lo que estaba escrito antes: al corregir se va.
  if (s.error) { s.error = ''; document.querySelector('#cobroBody .pres-error')?.remove(); }
  const el = document.getElementById('cobroTotal'); if (el) el.textContent = money.format(t);
  const r = document.getElementById('cobroResto'); if (r) r.textContent = money.format(Math.max(0, Math.round((t - num(s.monto1)) * 100) / 100));
  const btn = document.getElementById('cobroEnviar');
  if (btn && !s.enviando) { btn.disabled = t <= 0; btn.textContent = t > 0 ? `Cobrar ${money.format(t)}` : 'Elige qué paga'; }
}

function valida() {
  const items = [...s.sel.values()];
  if (!items.length) return 'Toca lo que paga.';
  for (const i of items) {
    const a = num(i.amount);
    if (!(a > 0)) return `Escribe cuánto paga de ${i.kind === 'income' && i.key === 'otro' ? 'otro ingreso' : i.label.toLowerCase()}.`;
    if (i.max != null && a > i.max + 0.004) return `${i.label} sólo debe ${money.format(i.max)}.`;
    if (i.kind === 'registration' && !(num(i.total) >= a)) return 'Lo que paga hoy no puede ser más que el precio de la inscripción.';
    if (i.key === 'otro' && !i.category) return 'Elige la categoría del otro ingreso.';
  }
  const t = total();
  if (s.dos) {
    const m1 = num(s.monto1);
    if (!(m1 > 0) || m1 >= t) return `Escribe cuánto pagó en ${nombreMetodo(s.metodo).toLowerCase()} (menos de ${money.format(t)}).`;
  }
  if (!s.fecha) return 'Falta la fecha.';
  return '';
}

function cuerpo() {
  const t = total();
  const items = [...s.sel.values()].map(i => {
    const a = num(i.amount);
    if (i.kind === 'charge') return { kind: 'charge', charge_id: i.id, amount: a };
    if (i.kind === 'order') return { kind: 'order', order_id: i.id, amount: a };
    if (i.kind === 'registration') return { kind: 'registration', total: num(i.total), amount: a };
    if (i.kind === 'income') return { kind: 'income', category: i.category, concept: (i.concept || '').trim() || i.category, amount: a };
    return { kind: 'abono', amount: a };
  });
  const ref = s.ref.trim() || null;
  const metodos = s.dos
    ? [{ method: s.metodo, amount: num(s.monto1), reference: s.metodo === 'cash' ? null : ref },
       { method: s.metodo2, amount: Math.round((t - num(s.monto1)) * 100) / 100, reference: s.metodo2 === 'cash' ? null : ref }]
    : [{ method: s.metodo, amount: t, reference: s.metodo === 'cash' ? null : ref }];
  return { items, metodos, t };
}

const ERRORES = {
  'Not authorized': 'Tu usuario no puede cobrar. Pídeselo a Presidencia.',
  'Payment exceeds order balance': 'El abono es mayor a lo que falta del uniforme.',
  'Order is not open for payment': 'Ese pedido ya no acepta pagos.'
};
const amable = e => { const m = String(e?.message || e || ''); return ERRORES[m] || m.replace(/^.*?:\s*/, '') || 'No se pudo cobrar. Intenta de nuevo.'; };

async function envia() {
  if (!s || s.enviando) return;
  s.error = valida();
  if (s.error) { pinta(); return; }
  const { items, metodos, t } = cuerpo();
  const etiqueta = i => (i.key === 'otro' ? (i.category || 'Otro ingreso') : i.label);
  const lineas = [...s.sel.values()].map(i => ({ label: etiqueta(i), amount: num(i.amount) }));
  const pregunta = `Vas a cobrar ${money.format(t)} a ${s.nombre}: ${lineas.map(l => `${l.label} ${money.format(l.amount)}`).join(' · ')}. Pagó con ${metodos.map(m => `${nombreMetodo(m.method)} ${money.format(m.amount)}`).join(' + ')}.`;
  const ok = window.tosConfirm
    ? await window.tosConfirm({ kicker: 'DOBLE CHECK', title: 'Confirma el cobro', message: pregunta, confirmText: 'Sí, cobrar', cancelText: 'Revisar' })
    : window.confirm(pregunta);
  if (!ok || !s) return;
  s.enviando = true; pinta();
  guardaLocal(QUIEN, s.quien.trim());
  try {
    const r = await s.rpc('v2_collect_ticket', { organization_id: s.org, player_id: s.playerId, payment_date: s.fecha, items, methods: metodos,
      collected_by_name: s.quien.trim() || null, observations: s.obs.trim() || null, idempotency_key: s.llave });
    s.hecho = { folio: r?.folio, ticketId: r?.ticketId, payments: r?.payments || [], total: t, lineas, metodos,
      fecha: new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${s.fecha}T12:00:00`)) };
    s.enviando = false; pinta();
  } catch (e) {
    if (!s) return;
    s.enviando = false; s.error = amable(e); pinta();
  }
}

// Abre la hoja. `preseleccion`: 'todo' (lo que debe), 'YYYY-MM' (ese mes) o
// nada. `alTerminar(hecho)` corre al cerrar, sólo si se cobró.
export async function abrirCobro({ rpc, org, playerId, nombre, telefono = '', nacimiento = null, preseleccion = null, alTerminar = null }) {
  asegura();
  s = { rpc, org, playerId, nombre: nombre || 'este Tanner', telefono, nacimiento, alTerminar, cargando: true, col: null, sel: new Map(),
    metodo: 'cash', metodo2: 'transfer', dos: false, monto1: '', ref: '', quien: leeLocal(QUIEN), fecha: hoyLocal(), obs: '',
    llave: llave(), enviando: false, error: '', hecho: null, fallo: '' };
  const yo = s;
  pinta();
  document.getElementById('cobroSheet').classList.remove('hidden');
  document.getElementById('cobroBackdrop').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  try { yo.col = await rpc('v2_player_collection', { organization_id: org, player_id: playerId }); }
  catch (e) { yo.fallo = 'No pudimos cargar lo que debe. Revisa tus permisos o vuelve a intentar.'; }
  if (s !== yo) return;
  s.cargando = false;
  if (s.col && !s.col.canCollect) s.fallo = 'Tu usuario puede ver la cuenta, pero no cobrar.';
  if (s.col) {
    const { cargos } = opciones();
    for (const c of cargos) if (preseleccion === 'todo' || (preseleccion && c.period === preseleccion)) agrega(c);
  }
  pinta();
  setTimeout(() => document.querySelector('#cobroBody [data-chip]')?.focus(), 60);
}
