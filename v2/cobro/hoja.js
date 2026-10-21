// Hoja de cobro: un solo cobro con varios conceptos, y si hace falta, de
// varios hermanos.
//
// Pedido del club (21/10/2026): "nos pagan 1,500: 1,000 de inscripción y 500
// de mensualidad; nos cuesta un huevo registrarlo por separado". Y después:
// "que sea bien fácil, que no tengan que dar tantos clics, todos puedan
// cobrar ahí y tenga trazabilidad".
//
// Cómo queda:
//   · Se toca lo que paga (meses, recargo, inscripción, uniforme, arbitraje)
//     y, si tiene hermanos, se agregan con un toque: un solo folio.
//   · El último toque ya dice cómo pagó: "Efectivo $X" o "Transferencia $X".
//     Así el método nunca se queda mal elegido y no hace falta un doble check.
//   · Quién cobra sale del usuario con el que se entró. En una cuenta
//     compartida (iPad, Presidencia) se elige una vez en ese aparato.
//   · Lo que casi no se usa (otra fecha, nota, referencia, tarjeta, dos
//     métodos) vive en "Más opciones".
//
// La base hace el reparto en una sola transacción (v2_collect_ticket): o entra
// todo o nada. Cada parte es el pago de siempre, en la cuenta de su Tanner,
// ligado por folio: Conciliación y Contabilidad no cambian.
import { TARIFAS, aplicaPrecios } from '/costos/tarifas.js';

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 });
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const METODOS = [['cash', 'Efectivo'], ['transfer', 'Transferencia'], ['card', 'Tarjeta']];
const nombreMetodo = m => (METODOS.find(x => x[0] === m) || [m, 'Otro'])[1];
// Las mismas categorías que "Otro ingreso" de Taquilla, para que Contabilidad
// las agrupe igual. Uniforme no va aquí: se cobra contra su pedido.
const OTROS = ['Torneo', 'Curso de Verano', 'Academia · Academia de porteros', 'Renta de cancha', 'Patrocinio'];
const QUIEN = 'tos-cobro-quien', NOMBRES = 'tos-cobro-nombres';
const hoyLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const llave = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const leeLocal = k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const guardaLocal = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento: no pasa nada */ } };
// Un celular de 10 dígitos va con la lada de México; WhatsApp no lo abre sin ella.
const conLada = t => { const n = String(t || '').replace(/\D/g, ''); return n.length === 10 ? `52${n}` : n; };
export const folioTexto = n => `C-${String(n ?? '').padStart(4, '0')}`;
const num = v => { const n = Number(String(v ?? '').replace(/[^\d.]/g, '')); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; };
const primerNombre = n => String(n || '').trim().split(/\s+/)[0] || '';

// Una cuenta que usan varias personas no dice quién cobró: el iPad de
// taquilla. Ahí se pregunta una vez por aparato. La cuenta de Presidencia la
// usa una sola persona (Presidencia, 21/10/2026): no se le pregunta.
export function esCuentaCompartida(ctx) {
  return ctx?.role === 'Taquilla' || /^(ipad|taquilla|caja)$/i.test(String(ctx?.display_name || '').trim());
}

let s = null;

function cargaEstilos() {
  if (document.querySelector('link[href^="/v2/cobro/hoja.css"]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = '/v2/cobro/hoja.css?v=20261021b';
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
  b.addEventListener('submit', e => { e.preventDefault(); envia(s?.metodo); });
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
  const t = aplicaPrecios(TARIFAS, principal()?.col?.prices || null);
  return (t.categorias || []).filter(c => Number(c.inscripcion) > 0).map(c => {
    const n = String(c.edades || '').match(/\d+/g)?.map(Number) || [];
    return { clave: c.clave, nombre: c.nombre, precio: Number(c.inscripcion), min: n[0] ?? 0, max: n[1] ?? n[0] ?? 99 };
  });
}
function inscripcionSugerida(nacimiento) {
  const cats = inscripciones(), a = edad(nacimiento);
  if (!cats.length) return null;
  const caben = a == null ? [] : cats.filter(c => a >= c.min && a <= c.max).sort((x, y) => y.min - x.min);
  return caben[0] || cats[0];
}

const principal = () => s?.cuentas.get(s.playerId);
const variasCuentas = () => s.cuentas.size > 1;
const etiqueta = (label, cuenta) => (variasCuentas() ? `${label} · ${primerNombre(cuenta.nombre)}` : label);

// Lo que se puede tocar de cada Tanner. Los cargos que paga un patrocinador no
// entran: se cobran aparte, con su nombre.
function opcionesDe(cuenta) {
  const col = cuenta.col || {};
  const cargos = (col.charges || []).filter(c => !c.sponsor).map(c => ({ key: `c:${c.id}`, kind: 'charge', id: c.id, player: cuenta.id,
    label: etiqueta(c.label, cuenta), max: Number(c.balance), period: String(c.period || '').slice(0, 7), type: c.type }));
  const pedidos = col.canOrders ? (col.orders || []).map(o => ({ key: `o:${o.id}`, kind: 'order', id: o.id, player: cuenta.id,
    label: etiqueta(`Uniforme ${o.folio}`, cuenta), max: Number(o.balance) })) : [];
  const reg = !cargos.some(c => c.type === 'registration') && inscripciones().length
    ? [{ key: `reg:${cuenta.id}`, kind: 'registration', player: cuenta.id, nacimiento: cuenta.nacimiento, label: etiqueta('Inscripción', cuenta) }] : [];
  return { cargos, pedidos, reg };
}
function extras() {
  const p = s.playerId;
  return [{ key: 'arb', kind: 'income', category: 'Arbitraje', label: 'Arbitraje', player: p },
          { key: 'otro', kind: 'income', category: '', label: 'Otro ingreso', player: p },
          { key: 'abono', kind: 'abono', label: 'Abono a cuenta', player: p }];
}
function todasLasOpciones() {
  const out = [];
  for (const c of s.cuentas.values()) { const o = opcionesDe(c); out.push(...o.cargos, ...o.pedidos, ...o.reg); }
  return [...out, ...extras()];
}

function agrega(o) {
  if (s.sel.has(o.key)) return;
  const item = { ...o };
  if (o.kind === 'charge' || o.kind === 'order') item.amount = o.max;
  else if (o.kind === 'registration') { const c = inscripcionSugerida(o.nacimiento); item.cat = c?.clave || ''; item.total = c?.precio || ''; item.amount = c?.precio || ''; }
  else item.amount = '';
  s.sel.set(o.key, item);
}

function total() { let t = 0; for (const i of s.sel.values()) t += num(i.amount); return Math.round(t * 100) / 100; }
const nombres = () => [...s.cuentas.values()].map(c => c.nombre).join(' y ');

function pinta() {
  const b = document.getElementById('cobroBody'); if (!b || !s) return;
  const cab = (t, sub) => `<header class="pres-head"><div><h2 id="cobroTitle">${esc(t)}</h2><p>${esc(sub)}</p></div><button type="button" class="pres-close" data-cobro-cerrar aria-label="Cerrar">×</button></header>`;
  if (s.cargando) { b.innerHTML = `${cab('Cobrar', s.nombre)}<p class="pres-nota">Cargando lo que debe…</p>`; return; }
  if (s.fallo) { b.innerHTML = `${cab('Cobrar', s.nombre)}<div class="pres-error" role="alert">${esc(s.fallo)}</div>`; return; }
  if (s.hecho) { b.innerHTML = cab('Cobro registrado', nombres()) + hechoHtml(); return; }
  const chip = o => `<button type="button" class="cobro-chip" data-chip="${esc(o.key)}" aria-pressed="${s.sel.has(o.key)}">${esc(o.label)}${o.max != null ? `<b>${money.format(o.max)}</b>` : '<i aria-hidden="true">+</i>'}</button>`;
  const bloques = [...s.cuentas.values()].map(c => {
    const o = opcionesDe(c), debe = [...o.cargos, ...o.pedidos];
    const titulo = variasCuentas() ? `<span class="cobro-quien-es">${esc(c.nombre)}</span>` : '';
    const lista = debe.length ? `<div class="cobro-chips">${debe.map(chip).join('')}</div>` : `<p class="cobro-vacio">${variasCuentas() ? `${esc(primerNombre(c.nombre))} no debe nada.` : 'No debe nada. Puedes cobrar inscripción, arbitraje o un adelanto.'}</p>`;
    return `${titulo}${lista}${o.reg.length && variasCuentas() ? `<div class="cobro-chips cobro-extra">${o.reg.map(chip).join('')}</div>` : ''}`;
  }).join('');
  const extraChips = [...(variasCuentas() ? [] : opcionesDe(principal()).reg), ...extras()].map(chip).join('');
  const hermanos = (s.familia || []).filter(h => !s.cuentas.has(h.id));
  const familia = hermanos.length ? `<div class="cobro-chips cobro-hermanos">${hermanos.map(h => `<button type="button" class="cobro-chip" data-hermano="${esc(h.id)}">+ ${esc(primerNombre(h.name))}${Number(h.balance) > 0 ? `<b>${money.format(Number(h.balance))}</b>` : '<i aria-hidden="true">hermano</i>'}</button>`).join('')}</div>` : '';
  const lineas = [...s.sel.values()].map(lineaHtml).join('');
  const t = total();
  const err = s.error ? `<div class="pres-error" role="alert">${esc(s.error)}</div>` : '';
  b.innerHTML = `${cab('Cobrar', nombres())}<form class="pres-form cobro-form" novalidate>
    ${quienHtml()}
    <div class="cobro-bloque"><span class="cobro-titulo">¿Qué paga? <small>toca para agregar</small></span>${bloques}
      <div class="cobro-chips cobro-extra">${extraChips}</div>${familia}</div>
    ${lineas ? `<div class="cobro-lineas">${lineas}</div>` : ''}
    <div class="cobro-total"><span>Total que recibes</span><strong id="cobroTotal">${money.format(t)}</strong></div>
    ${s.mas ? masHtml(t) : ''}
    ${err}${botonesHtml(t)}
  </form>`;
}

// Quién cobra. Con cuenta personal es el usuario y no se pregunta; con una
// cuenta compartida se elige una vez y el aparato lo recuerda.
function quienHtml() {
  if (!s.compartida) return '';
  if (s.quien && !s.cambiaQuien) return `<p class="cobro-cobra">Cobra <b>${esc(s.quien)}</b> <button type="button" class="cobro-link" data-cambia-quien>Cambiar</button></p>`;
  let vistos = [];
  try { vistos = JSON.parse(leeLocal(NOMBRES) || '[]'); } catch { vistos = []; }
  // Sólo los nombres que ya se eligieron en este aparato. Los del historial
  // tecleado traían basura ("Pago en Transferencia", "Michel" y "Michel
  // Enriquez" como dos personas): era el error que esto vino a quitar.
  const lista = [...new Set(vistos)].filter(Boolean).slice(0, 8);
  return `<div class="cobro-bloque cobro-quien"><span class="cobro-titulo">¿Quién está cobrando? <small>esta cuenta la usan varias personas</small></span>
    ${lista.length ? `<div class="cobro-chips">${lista.map(n => `<button type="button" class="cobro-chip" data-quien="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : ''}
    <div class="cobro-quien-fila"><input type="text" id="cobroQuienNuevo" maxlength="60" autocomplete="off" placeholder="Tu nombre"><button type="button" class="cobro-listo" data-quien-listo>Listo</button></div></div>`;
}

function lineaHtml(i) {
  const monto = () => `<span class="cobro-peso"><input type="text" inputmode="decimal" data-monto="${esc(i.key)}" value="${esc(String(i.amount ?? ''))}" placeholder="0" aria-label="Monto de ${esc(i.label)}"></span>`;
  const quita = `<button type="button" class="cobro-quita" data-quita="${esc(i.key)}" aria-label="Quitar ${esc(i.label)}">×</button>`;
  if (i.kind === 'registration') {
    const cats = inscripciones();
    const elige = cats.length > 1 ? `<div class="cobro-mini">${cats.map(c => `<button type="button" data-cat="${esc(c.clave)}" data-reg="${esc(i.key)}" aria-pressed="${i.cat === c.clave}">${esc(c.nombre)} ${money.format(c.precio)}</button>`).join('')}</div>` : '';
    const abono = num(i.amount) > 0 && num(i.total) > num(i.amount) ? `<small class="cobro-nota">Queda a deber ${money.format(num(i.total) - num(i.amount))} de inscripción.</small>` : '';
    return `<div class="cobro-linea" data-linea="${esc(i.key)}"><div class="cobro-linea-top"><strong>${esc(i.label)}</strong>${quita}</div>${elige}
      <div class="cobro-dos"><label>Precio<span class="cobro-peso"><input type="text" inputmode="decimal" data-total="${esc(i.key)}" value="${esc(String(i.total ?? ''))}" placeholder="0"></span></label>
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

// Lo que casi no se usa: otra fecha (17% de los cobros), nota (3%),
// referencia, tarjeta (1%) y dos métodos.
function masHtml(t) {
  const seg = `<div class="pres-seg" role="radiogroup" aria-label="Método">${METODOS.map(([v, l]) => `<button type="button" role="radio" aria-checked="${s.metodo === v}" data-metodo="${v}">${l}</button>`).join('')}</div>`;
  let dos = '';
  if (s.dos) {
    const m1 = num(s.monto1), resto = Math.max(0, Math.round((t - m1) * 100) / 100);
    dos = `<div class="cobro-dos"><label>En ${esc(nombreMetodo(s.metodo).toLowerCase())}<span class="cobro-peso"><input type="text" inputmode="decimal" id="cobroMonto1" value="${esc(s.monto1)}" placeholder="0"></span></label>
      <label><span>Y el resto, <b id="cobroResto">${money.format(resto)}</b>, en</span><select id="cobroMetodo2">${METODOS.filter(([v]) => v !== s.metodo).map(([v, l]) => `<option value="${v}"${v === s.metodo2 ? ' selected' : ''}>${l}</option>`).join('')}</select></label></div>`;
  }
  return `<div class="cobro-bloque cobro-mas"><span class="cobro-titulo">¿Cómo paga?</span>${seg}
    <button type="button" class="cobro-link" data-dos>${s.dos ? 'Pagó con un solo método' : 'Pagó con dos métodos'}</button>${dos}
    <label><span>Referencia <span class="cobro-opt">· opcional, el comprobante llega por WhatsApp</span></span><input id="cobroRef" type="text" maxlength="80" value="${esc(s.ref)}" placeholder="Folio SPEI, últimos 4 de la tarjeta…"></label>
    <div class="cobro-dos"><label>Fecha<input id="cobroFecha" type="date" value="${esc(s.fecha)}" max="${hoyLocal()}"></label>
      <label><span>Nota <span class="cobro-opt">· opcional</span></span><input id="cobroObs" type="text" maxlength="300" placeholder="Pagó la abuela…" value="${esc(s.obs)}"></label></div></div>`;
}

// El último toque ya dice cómo pagó.
function botonesHtml(t) {
  const listo = t > 0 && !s.enviando;
  const dis = listo ? '' : ' disabled';
  if (s.mas) return `<button type="submit" class="pres-primary" id="cobroEnviar"${dis}>${s.enviando ? 'Un momento…' : t > 0 ? `Cobrar ${money.format(t)}` : 'Elige qué paga'}</button>
    <button type="button" class="cobro-link cobro-menos" data-mas>Menos opciones</button>`;
  return `<div class="cobro-pagar">
    <button type="button" class="pres-primary cobro-pagar-btn" data-pagar="cash"${dis}><small>Efectivo</small> <span>${s.enviando && s.metodo === 'cash' ? 'Un momento…' : money.format(t)}</span></button>
    <button type="button" class="pres-primary cobro-pagar-btn" data-pagar="transfer"${dis}><small>Transferencia</small> <span>${s.enviando && s.metodo === 'transfer' ? 'Un momento…' : money.format(t)}</span></button>
  </div><button type="button" class="cobro-link cobro-menos" data-mas>Tarjeta, dos métodos, otra fecha o nota</button>`;
}

function hechoHtml() {
  const h = s.hecho;
  const partes = h.lineas.map(l => `<li><span>${esc(l.label)}</span><b>${money.format(l.amount)}</b></li>`).join('');
  const metodos = h.metodos.map(m => `${nombreMetodo(m.method)} ${money.format(m.amount)}`).join(' + ');
  const wa = s.telefono ? `<a class="pres-primary cobro-wa" target="_blank" rel="noopener" href="https://wa.me/${conLada(s.telefono)}?text=${encodeURIComponent(reciboTexto())}">Mandar recibo por WhatsApp</a>` : '';
  return `<div class="cobro-hecho"><div class="cobro-palomita" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></div>
    <strong>${money.format(h.total)}</strong><span>Folio ${esc(folioTexto(h.folio))} · ${esc(metodos)}${h.quien ? ` · cobró ${esc(h.quien)}` : ''}</span>
    <ul class="cobro-recibo">${partes}</ul>${wa}
    <button type="button" class="cobro-listo" data-cobro-cerrar>Listo</button></div>`;
}

export function reciboTexto() {
  const h = s?.hecho; if (!h) return '';
  const lineas = h.lineas.map(l => `• ${l.label}: ${money.format(l.amount)}`).join('\n');
  const metodos = h.metodos.map(m => `${nombreMetodo(m.method)} ${money.format(m.amount)}`).join(' + ');
  return `Hola, recibimos el pago de ${nombres()}. ¡Gracias!\n\n${lineas}\nTotal: ${money.format(h.total)} (${metodos})\nFolio ${folioTexto(h.folio)} · ${h.fecha}`;
}

function eligeQuien(nombre) {
  const n = String(nombre || '').trim(); if (!n) return;
  s.quien = n; s.cambiaQuien = false;
  guardaLocal(QUIEN, n);
  let vistos = [];
  try { vistos = JSON.parse(leeLocal(NOMBRES) || '[]'); } catch { vistos = []; }
  guardaLocal(NOMBRES, JSON.stringify([n, ...vistos.filter(x => x !== n)].slice(0, 8)));
  s.error = ''; pinta();
}

async function sumaHermano(id) {
  const h = (s.familia || []).find(x => x.id === id); if (!h || s.cuentas.has(id)) return;
  const yo = s;
  s.cuentas.set(id, { id, nombre: h.name, nacimiento: h.birthDate, col: null });
  pinta();
  let col = null;
  try { col = await s.rpc('v2_player_collection', { organization_id: s.org, player_id: id }); } catch { col = null; }
  if (s !== yo) return;
  if (!col) { s.cuentas.delete(id); s.error = `No pudimos cargar la cuenta de ${primerNombre(h.name)}.`; pinta(); return; }
  s.cuentas.get(id).col = col;
  for (const c of opcionesDe(s.cuentas.get(id)).cargos) agrega(c);
  pinta();
}

function alClic(e) {
  const t = e.target.closest('button,a'); if (!t || !s) return;
  if (t.matches('[data-cobro-cerrar]')) { if (!s.enviando) cierra(); return; }
  if (s.enviando) return;
  if (t.dataset.chip) {
    const o = todasLasOpciones().find(x => x.key === t.dataset.chip); if (!o) return;
    if (s.sel.has(o.key)) s.sel.delete(o.key); else agrega(o);
    s.error = ''; pinta();
    if (s.sel.has(o.key) && o.max == null) document.querySelector(`[data-linea="${CSS.escape(o.key)}"] input`)?.focus();
  } else if (t.dataset.hermano) sumaHermano(t.dataset.hermano);
  else if (t.dataset.quita) { s.sel.delete(t.dataset.quita); pinta(); }
  else if (t.dataset.cat) {
    const c = inscripciones().find(x => x.clave === t.dataset.cat), i = s.sel.get(t.dataset.reg);
    if (c && i) { i.cat = c.clave; i.total = c.precio; i.amount = c.precio; pinta(); }
  } else if (t.dataset.metodo) {
    s.metodo = t.dataset.metodo;
    if (s.metodo2 === s.metodo) s.metodo2 = METODOS.find(([v]) => v !== s.metodo)[0];
    pinta();
  } else if (t.hasAttribute('data-dos')) { s.dos = !s.dos; pinta(); }
  else if (t.hasAttribute('data-mas')) { s.mas = !s.mas; if (!s.mas) { s.dos = false; } pinta(); }
  else if (t.dataset.pagar) envia(t.dataset.pagar);
  else if (t.dataset.quien) eligeQuien(t.dataset.quien);
  else if (t.hasAttribute('data-quien-listo')) eligeQuien(document.getElementById('cobroQuienNuevo')?.value);
  else if (t.hasAttribute('data-cambia-quien')) { s.cambiaQuien = true; pinta(); }
}

function alEscribir(e) {
  const x = e.target; if (!s) return;
  if (x.dataset.monto) { const i = s.sel.get(x.dataset.monto); if (i) i.amount = x.value; }
  else if (x.dataset.total) { const i = s.sel.get(x.dataset.total); if (i) { i.total = x.value; i.cat = ''; } }
  else if (x.dataset.concepto) { const i = s.sel.get('otro'); if (i) i.concept = x.value; }
  else if (x.id === 'cobroMonto1') s.monto1 = x.value;
  else if (x.id === 'cobroRef') s.ref = x.value;
  else if (x.id === 'cobroObs') s.obs = x.value;
  else if (x.id === 'cobroFecha') s.fecha = x.value;
  else return;
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
  document.querySelectorAll('#cobroBody [data-pagar]').forEach(b => { b.disabled = t <= 0; b.querySelector('span').textContent = money.format(t); });
}

function valida() {
  if (s.compartida && !s.quien) return 'Elige quién está cobrando.';
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
    const a = num(i.amount), p = i.player || s.playerId;
    if (i.kind === 'charge') return { kind: 'charge', player_id: p, charge_id: i.id, amount: a };
    if (i.kind === 'order') return { kind: 'order', player_id: p, order_id: i.id, amount: a };
    if (i.kind === 'registration') return { kind: 'registration', player_id: p, total: num(i.total), amount: a };
    if (i.kind === 'income') return { kind: 'income', player_id: p, category: i.category, concept: (i.concept || '').trim() || i.category, amount: a };
    return { kind: 'abono', player_id: p, amount: a };
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

async function envia(metodo) {
  if (!s || s.enviando) return;
  if (metodo) s.metodo = metodo;
  s.error = valida();
  if (s.error) { pinta(); return; }
  const { items, metodos, t } = cuerpo();
  const etq = i => (i.key === 'otro' ? (i.category || 'Otro ingreso') : i.label);
  const lineas = [...s.sel.values()].map(i => ({ label: etq(i), amount: num(i.amount) }));
  s.enviando = true; pinta();
  try {
    const r = await s.rpc('v2_collect_ticket', { organization_id: s.org, player_id: s.playerId, payment_date: s.fecha, items, methods: metodos,
      collected_by_name: s.quien.trim() || null, observations: s.obs.trim() || null, idempotency_key: s.llave });
    s.hecho = { folio: r?.folio, ticketId: r?.ticketId, payments: r?.payments || [], total: t, lineas, metodos, quien: s.quien.trim(),
      fecha: new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${s.fecha}T12:00:00`)) };
    s.enviando = false; pinta();
  } catch (e) {
    if (!s) return;
    s.enviando = false; s.error = amable(e); pinta();
  }
}

// Abre la hoja.
//   preseleccion: 'todo' (lo que debe), 'YYYY-MM' (ese mes) o nada.
//   quien: el nombre del usuario (cuenta personal). compartida: si la cuenta
//   la usan varias personas, se pregunta quién cobra (una vez por aparato).
//   alTerminar(hecho): corre al cerrar, sólo si se cobró.
export async function abrirCobro({ rpc, org, playerId, nombre, telefono = '', nacimiento = null, preseleccion = null, alTerminar = null,
  quien = '', compartida = false }) {
  asegura();
  s = { rpc, org, playerId, nombre: nombre || 'este Tanner', telefono, alTerminar, cargando: true, fallo: '',
    cuentas: new Map([[playerId, { id: playerId, nombre: nombre || 'este Tanner', nacimiento, col: null }]]), familia: [], sel: new Map(),
    mas: false, metodo: 'cash', metodo2: 'transfer', dos: false, monto1: '', ref: '', fecha: hoyLocal(), obs: '',
    compartida, quien: compartida ? leeLocal(QUIEN) : String(quien || '').trim(), cambiaQuien: false,
    llave: llave(), enviando: false, error: '', hecho: null };
  const yo = s;
  pinta();
  document.getElementById('cobroSheet').classList.remove('hidden');
  document.getElementById('cobroBackdrop').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  let col = null;
  try {
    const [c, fam] = await Promise.all([
      rpc('v2_player_collection', { organization_id: org, player_id: playerId }),
      rpc('v2_player_family', { organization_id: org, player_id: playerId }).catch(() => [])
    ]);
    col = c; yo.familia = Array.isArray(fam) ? fam : [];
  } catch { yo.fallo = 'No pudimos cargar lo que debe. Revisa tus permisos o vuelve a intentar.'; }
  if (s !== yo) return;
  s.cargando = false;
  if (col) {
    principal().col = col;
    if (!col.canCollect) s.fallo = 'Tu usuario puede ver la cuenta, pero no cobrar.';
    for (const c of opcionesDe(principal()).cargos) if (preseleccion === 'todo' || (preseleccion && c.period === preseleccion)) agrega(c);
  }
  pinta();
  setTimeout(() => document.querySelector('#cobroBody [data-chip], #cobroBody #cobroQuienNuevo')?.focus(), 60);
}
