/* Gráficas del dinero (25/11/2026, h102 + h103). Ver graficas.js.
 * Presidencia: "más animadas... que le piques y puedas desglosar... para que
 * llegues a todo". Todo lo que es número se puede picar:
 *   - Las cifras de arriba cuentan hacia arriba y llevan a su gráfica.
 *   - Cada barra crece al aparecer; al picarla se abre su desglose (con su
 *     mini gráfica por mes y cada renglón), y otra vez para cerrarlo.
 *   - En la nómina, cada celda abre los pagos de esa persona en ese mes.
 *   - Cada proveedor abre todos sus pagos.
 * Sin animación si el teléfono pide menos movimiento. */
import { createClient } from '/v2/supabase-client.js';
import { PERIODOS, rangoDe, barras, tablaNomina, etiquetaMes, filtraTipo, ETIQUETA_TIPO, uniformes, esAdeudo, metodo, resumenDetalle, porMes, suaviza, semanasDePago } from '/v2/contabilidad/graficas/graficas.js';
import { cargaBeneficiarios } from '/v2/beneficiarios.js';
import { segmentos } from '/v2/segmento.js';

const supabase = createClient('https://pacnegivzgxpanphrnwp.supabase.co', 'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG', { auth: { persistSession: true, autoRefreshToken: true } });
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const rpc = async (n, p = {}) => { const { data, error } = await supabase.rpc(n, p); if (error) throw error; return data; };
const show = (id) => ['loadingView', 'deniedView', 'view'].forEach((v) => $(v)?.classList.toggle('hidden', v !== id));
const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fechaCorta = (f) => { if (!f) return ''; const [, m, d] = String(f).slice(0, 10).split('-').map(Number); return `${d} ${MES[m - 1]}`; };
const ERRORES = { 'Payee already exists': 'Ya está en la lista.', 'Payee needs a name': 'Escribe el nombre.', 'Not authorized': 'Tu cuenta no puede cambiar la lista.' };
const quieto = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let ctx = null, canWrite = false, periodo = 'anio', tipo = 'todos', datos = null, lista = null, rango = null;

/* Números que cuentan hacia arriba. */
function cuenta(el, valor) {
  const fin = Number(valor || 0), ini = Number(el.dataset.valor || 0);
  el.dataset.valor = String(fin);
  if (quieto() || ini === fin) { el.textContent = money.format(fin); return; }
  const t0 = performance.now(), dur = 900;
  const paso = (t) => { const k = suaviza((t - t0) / dur); el.textContent = money.format(Math.round(ini + (fin - ini) * k)); if (k < 1) requestAnimationFrame(paso); };
  requestAnimationFrame(paso);
}

/* Las barras: nacen en 0 y crecen escalonadas. Cada renglón es un botón. */
function filaHtml(x, i, { dim = null, clave = null, nota = null } = {}) {
  const abre = dim && clave != null;
  return '<div class="gr-renglon">' +
    '<' + (abre ? 'button type="button" aria-expanded="false" data-dim="' + esc(dim) + '" data-clave="' + esc(clave) + '" data-titulo="' + esc(x.name) + '"' : 'div') + ' class="gr-fila" style="--i:' + i + '">' +
    '<b>' + esc(x.name) + (nota ? '<small>' + esc(nota(x)) + '</small>' : '') + '</b>' +
    '<span class="gr-carril" aria-hidden="true"><i data-pct="' + x.pct + '"></i></span><strong>' + money.format(x.total) + '</strong>' +
    (abre ? '<span class="gr-chev" aria-hidden="true"></span></button><div class="gr-desglose" hidden></div>' : '</div>') + '</div>';
}
function creceBarras(raiz) {
  const is = raiz.querySelectorAll('.gr-carril i[data-pct]');
  if (quieto()) { is.forEach((i) => { i.style.width = i.dataset.pct + '%'; }); return; }
  requestAnimationFrame(() => requestAnimationFrame(() => is.forEach((i) => { i.style.width = i.dataset.pct + '%'; })));
}
function pintaBarras(id, filas, { dim = null, clave = (x) => x.name, nota = null } = {}) {
  const b = barras(filas);
  const caja = $(id);
  caja.innerHTML = !b.filas.length ? '<p class="gr-vacio">Sin movimientos en este periodo.</p>'
    : '<div class="gr-barras">' + b.filas.map((x, i) => filaHtml(x, i, { dim, clave: dim ? clave(x) : null, nota })).join('') + '</div>' +
      (b.resto ? '<p class="gr-resto">Y ' + b.resto.n + ' más: ' + money.format(b.resto.total) + '</p>' : '');
  creceBarras(caja);
}

function pintaBenef() {
  $('filtroTipo').innerHTML = [['todos', 'Todos'], ['staff', 'Staff'], ['proveedor', 'Proveedores']].map(([k, t]) =>
    '<button type="button" data-tipo="' + k + '" aria-pressed="' + (tipo === k) + '">' + t + '</button>').join('');
  pintaBarras('grBenef', filtraTipo(datos.porBeneficiario, tipo), {
    dim: 'beneficiario', clave: (x) => x.id || 'otro',
    nota: (x) => [ETIQUETA_TIPO[x.kind] || '', x.count + (x.count === 1 ? ' pago' : ' pagos'), x.last ? 'último ' + fechaCorta(x.last) : ''].filter(Boolean).join(' · ') });
}

const idDe = (nombre) => (lista?.payees || []).find((p) => p.name === nombre)?.id || null;

function pinta() {
  const d = datos;
  cuenta($('kIngresos'), d.ingresos); cuenta($('kEgresos'), d.egresos); cuenta($('kQueda'), (d.ingresos || 0) - (d.egresos || 0)); cuenta($('kAdeudo'), d.adeudo);
  pintaBenef();
  const t = tablaNomina(d.nominaPorMes);
  const maxCelda = Math.max(0, ...t.filas.flatMap((f) => Object.values(f.valores)));
  $('grNomina').innerHTML = !t.filas.length ? '<p class="gr-vacio">Sin pagos a Staff en este periodo.</p>'
    : '<table class="gr-nomina"><thead><tr><th>Persona</th>' + t.meses.map((m) => '<th>' + esc(etiquetaMes(m)) + '</th>').join('') + '<th>Total</th></tr></thead><tbody>' +
      t.filas.map((f, i) => { const id = idDe(f.name); return '<tr style="--i:' + i + '"><td>' + (id ? '<button type="button" class="gr-celda nombre" data-dim="beneficiario" data-clave="' + esc(id) + '" data-titulo="' + esc(f.name) + '">' + esc(f.name) + '</button>' : esc(f.name)) + '</td>' +
        t.meses.map((m) => f.valores[m]
          ? '<td>' + (id ? '<button type="button" class="gr-celda" data-dim="beneficiario" data-clave="' + esc(id + '|' + m) + '" data-titulo="' + esc(f.name + ' · ' + etiquetaMes(m)) + '" style="--calor:' + (maxCelda ? (f.valores[m] / maxCelda).toFixed(2) : 0) + '">' + money.format(f.valores[m]) + '</button>' : money.format(f.valores[m])) + '</td>'
          : '<td class="cero">—</td>').join('') + '<td><b>' + money.format(f.total) + '</b></td></tr>'; }).join('') +
      '</tbody><tfoot><tr><td>Total</td>' + t.meses.map((m) => '<td>' + money.format(t.filas.reduce((s, f) => s + (f.valores[m] || 0), 0)) + '</td>').join('') +
      '<td>' + money.format(t.filas.reduce((s, f) => s + f.total, 0)) + '</td></tr></tfoot></table><div id="grNominaDesglose" class="gr-desglose" hidden></div>';
  pintaBarras('grIngTipo', d.ingresosPorTipo, { dim: 'ingresoTipo' });
  pintaBarras('grIngCat', d.ingresosPorCategoria, { dim: 'ingresoCategoria' });
  pintaBarras('grDeuCat', d.adeudoPorCategoria, { dim: 'adeudoCategoria', nota: (x) => x.cargos + (x.cargos === 1 ? ' cargo' : ' cargos') });
  pintaBarras('grDeuTipo', d.adeudoPorTipo, { dim: 'adeudoTipo', nota: (x) => x.cargos + (x.cargos === 1 ? ' cargo' : ' cargos') });
  pintaBarras('grEgCat', d.egresosPorCategoria, { dim: 'egresoCategoria' });
  const u = uniformes(d.uniformes), tremor = idDe('Tremor');
  const ub = barras([{ name: 'Entró (uniformes y tienda)', total: u.entro, dim: 'ingresoTipo', clave: 'Uniformes y tienda' }, { name: 'Pagado a Tremor', total: u.pagado, dim: tremor ? 'beneficiario' : null, clave: tremor }]);
  $('grUniformes').innerHTML = !u.entro && !u.pagado ? '<p class="gr-vacio">Sin uniformes en este periodo.</p>'
    : '<div class="gr-uni"><div class="gr-barras">' + ub.filas.map((x, i) => filaHtml(x, i, { dim: x.dim, clave: x.clave })).join('') + '</div>' +
      '<div class="gr-anillo" style="--p:' + (u.pctPagado == null ? 0 : Math.min(100, u.pctPagado)) + '"><span><b>' + (u.pctPagado == null ? '—' : u.pctPagado + '%') + '</b><small>pagado al proveedor</small></span></div>' +
      '<p>' + (u.queda >= 0 ? 'Quedan ' + money.format(u.queda) : 'Se ha pagado ' + money.format(-u.queda) + ' más de lo que entró') +
      (u.pctPagado != null ? ' · al proveedor se le ha pagado el ' + u.pctPagado + '% de lo que entró.' : '.') + '</p></div>';
  creceBarras($('grUniformes'));
  $('grProv').innerHTML = !(d.proveedores || []).length ? '<p class="gr-vacio">Sin pagos a proveedores en este periodo.</p>'
    : d.proveedores.map((p, i) => { const id = idDe(p.name); return '<article style="--i:' + i + '"><header><b>' + esc(p.name) + '</b><strong>' + money.format(p.total) + '</strong></header><ul>' +
      (p.pagos || []).map((x) => '<li><span>' + esc(fechaCorta(x.fecha)) + ' · ' + esc(x.concepto || '') + '</span><b>' + money.format(Number(x.monto || 0)) + '</b></li>').join('') + '</ul>' +
      (id ? '<button type="button" class="gr-ver-todo" data-dim="beneficiario" data-clave="' + esc(id) + '" data-titulo="' + esc(p.name) + '">Ver todos sus pagos</button><div class="gr-desglose" hidden></div>' : '') + '</article>'; }).join('');
  document.querySelectorAll('.gr-entra').forEach((e) => e.classList.remove('gr-entra'));
  void document.body.offsetWidth;
  document.querySelectorAll('.gr-grid > .panel').forEach((e) => e.classList.add('gr-entra'));
}

/* El desglose: se abre debajo de lo que picaste, con su mini gráfica. */
async function abreDesglose(boton) {
  const dim = boton.dataset.dim, clave = boton.dataset.clave, titulo = boton.dataset.titulo || '';
  let caja = boton.nextElementSibling?.classList.contains('gr-desglose') ? boton.nextElementSibling : null;
  if (boton.classList.contains('gr-celda')) caja = $('grNominaDesglose');
  if (!caja) return;
  const abierto = boton.getAttribute('aria-expanded') === 'true';
  // Uno abierto a la vez por gráfica.
  boton.closest('.panel')?.querySelectorAll('[aria-expanded="true"]').forEach((b) => { if (b !== boton) cierra(b); });
  if (abierto) return cierra(boton);
  boton.setAttribute('aria-expanded', 'true');
  caja.hidden = false; caja.dataset.de = clave;
  caja.innerHTML = '<div class="gr-cargando"><i></i><i></i><i></i></div>';
  requestAnimationFrame(() => caja.classList.add('abierto'));
  let rows = [];
  try { rows = await rpc('v2_finance_detail', { organization_id: ctx.organization_id, desde: esAdeudo(dim) ? null : rango.desde, hasta: esAdeudo(dim) ? null : rango.hasta, dimension: dim, clave }) || []; }
  catch { caja.innerHTML = '<p class="gr-vacio">No se pudo abrir el desglose.</p>'; return; }
  if (caja.dataset.de !== clave) return;
  caja.innerHTML = htmlDesglose(dim, titulo, rows, clave);
  creceBarras(caja);
  caja.querySelectorAll('.gr-mes i').forEach((i) => { requestAnimationFrame(() => requestAnimationFrame(() => { i.style.height = i.dataset.pct + '%'; })); });
  caja.querySelector('.gr-mas')?.addEventListener('click', (e) => { e.stopPropagation(); caja.querySelectorAll('.gr-det li[hidden]').forEach((li) => { li.hidden = false; }); e.target.remove(); });
}
function cierra(boton) {
  boton.setAttribute('aria-expanded', 'false');
  const caja = boton.classList.contains('gr-celda') ? $('grNominaDesglose') : boton.nextElementSibling;
  if (!caja?.classList.contains('gr-desglose')) return;
  caja.classList.remove('abierto');
  setTimeout(() => { if (!caja.classList.contains('abierto')) { caja.hidden = true; caja.innerHTML = ''; } }, quieto() ? 0 : 260);
}
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const conDia = (f) => { if (!f) return ''; const [a, m, d] = String(f).slice(0, 10).split('-').map(Number); return DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()] + ' ' + fechaCorta(f); };
const rangoSemana = (s) => { const [, m1, d1] = s.lunes.split('-').map(Number), [, m2, d2] = s.domingo.split('-').map(Number); return m1 === m2 ? d1 + '–' + d2 + ' ' + MES[m1 - 1] : d1 + ' ' + MES[m1 - 1] + '–' + d2 + ' ' + MES[m2 - 1]; };
// Sólo el staff cobra por semana: a ellos se les revisa semana por semana.
const esStaff = (clave) => (lista?.payees || []).some((p) => p.id === String(clave).split('|')[0] && p.kind === 'staff');
function htmlSemanas(rows, clave) {
  const mes = String(clave).split('|')[1];
  const desde = mes ? mes + '-01' : rango.desde, hasta = mes ? mes + '-' + String(new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7), 0)).getUTCDate()).padStart(2, '0') : rango.hasta;
  const w = semanasDePago(rows, { desde, hasta, hoy: hoy() });
  if (w.semanas.length < 2) return '';
  const aviso = w.faltan.length
    ? '<p class="gr-sem-aviso falta">' + (w.faltan.length === 1 ? 'Una semana sin pago: ' : w.faltan.length + ' semanas sin pago: ') + esc(w.faltan.map(rangoSemana).join(', ')) + '</p>'
    : '<p class="gr-sem-aviso">Todas las semanas tienen pago.</p>';
  const dobles = w.dobles.length ? '<p class="gr-sem-aviso doble">' + (w.dobles.length === 1 ? 'Una semana con dos pagos o más: ' : w.dobles.length + ' semanas con dos pagos o más: ') + esc(w.dobles.map(rangoSemana).join(', ')) + ' (revisa si fue doble o si se pagó una atrasada).</p>' : '';
  return '<div class="gr-semanas"><b class="gr-sem-titulo">Semana por semana</b>' + aviso + dobles + '<ol class="gr-sem-lista">' + w.semanas.slice().reverse().map((s, i) => '<li style="--i:' + Math.min(i, 12) + '" class="' + (s.pagos.length ? (s.pagos.length > 1 ? 'doble' : 'pagada') : (s.enCurso ? 'curso' : 'falta')) + '"><span>' + esc(rangoSemana(s)) + '</span><small>' +
    (s.pagos.length ? esc(s.pagos.map((p) => 'pagado el ' + conDia(p.fecha)).join(' y ')) : (s.enCurso ? 'semana en curso' : 'sin pago')) + '</small><strong>' + (s.pagos.length ? money.format(s.total) : '—') + '</strong></li>').join('') + '</ol></div>';
}
function htmlDesglose(dim, titulo, rows, clave = '') {
  const r = resumenDetalle(rows, dim);
  if (!rows.length) return '<p class="gr-vacio">Sin renglones.</p>';
  const cabeza = '<div class="gr-det-cabeza"><b>' + esc(titulo) + '</b><span>' + r.n + (esAdeudo(dim) ? (r.n === 1 ? ' jugador' : ' jugadores') : (r.n === 1 ? ' movimiento' : ' movimientos')) +
    ' · ' + money.format(r.total) + (r.n > 1 ? ' · promedio ' + money.format(r.promedio) : '') + '</span></div>';
  const meses = esAdeudo(dim) ? [] : porMes(rows);
  const mini = meses.length > 1 ? '<div class="gr-meses" aria-hidden="true">' + meses.map((m) => '<div class="gr-mes"><i data-pct="' + m.pct + '"></i><small>' + esc(etiquetaMes(m.mes).split(' ')[0]) + '</small></div>').join('') + '</div>' : '';
  const semanas = dim === 'beneficiario' && esStaff(clave) ? htmlSemanas(rows, clave) : '';
  const VISIBLES = 8;
  const li = (x, i) => '<li style="--i:' + Math.min(i, 12) + '"' + (i >= VISIBLES ? ' hidden' : '') + '>' + (esAdeudo(dim)
    ? '<div><b>' + esc(x.jugador) + '</b><small>' + esc([x.categoria, x.cargos + (x.cargos === 1 ? ' cargo' : ' cargos'), x.desde ? 'desde ' + fechaCorta(x.desde) : '', ...(x.conceptos || []).slice(0, 2)].filter(Boolean).join(' · ')) + '</small></div><strong>' + money.format(Number(x.saldo || 0)) + '</strong>'
    : '<div><b>' + esc(x.concepto || x.categoria || 'Movimiento') + '</b><small>' + esc([(dim === 'beneficiario' || dim === 'egresoCategoria' ? 'Pagado el ' : '') + conDia(x.fecha), x.jugador || x.quien, x.categoria, metodo(x.metodo)].filter(Boolean).join(' · ')) + '</small></div><strong>' + money.format(Number(x.monto || 0)) + '</strong>') + '</li>';
  return cabeza + mini + semanas + '<ul class="gr-det">' + rows.map(li).join('') + '</ul>' + (rows.length > VISIBLES ? '<button type="button" class="gr-mas">Ver los ' + rows.length + '</button>' : '');
}

function pintaLista() {
  const xs = (lista?.payees || []).slice().sort((a, b) => (b.active - a.active) || a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, 'es'));
  $('grAgregar').classList.toggle('hidden', !canWrite);
  $('grLista').innerHTML = !xs.length ? '<p class="gr-vacio">Todavía no hay nadie en la lista.</p>'
    : '<div class="gr-lista">' + xs.map((p) => '<div class="gr-item' + (p.active ? '' : ' baja') + '"><div><b>' + esc(p.name) + '<span class="gr-tag">' + esc(ETIQUETA_TIPO[p.kind]) + '</span>' + (p.active ? '' : '<span class="gr-tag">De baja</span>') + '</b>' +
      '<small>' + (Number(p.total) > 0 ? money.format(Number(p.total)) + ' pagado en total' + (p.lastPaidOn ? ' · último ' + esc(fechaCorta(p.lastPaidOn)) : '') : 'Sin pagos todavía') + '</small></div>' +
      (canWrite ? '<button type="button" class="secondary mini" data-baja="' + esc(p.id) + '">' + (p.active ? 'Dar de baja' : 'Volver a activar') + '</button>' : '') + '</div>').join('') + '</div>';
}

async function carga() {
  $('grMensaje').classList.add('hidden');
  $('periodos').innerHTML = PERIODOS.map((p) => '<button type="button" data-periodo="' + p.k + '" aria-pressed="' + (periodo === p.k) + '">' + p.t + '</button>').join('');
  rango = rangoDe(periodo, hoy());
  document.body.classList.add('gr-ocupado');
  try {
    [datos, lista] = await Promise.all([
      rpc('v2_finance_analytics', { organization_id: ctx.organization_id, desde: rango.desde, hasta: rango.hasta }),
      cargaBeneficiarios(rpc, ctx.organization_id, { fresco: true }),
    ]);
    pinta(); pintaLista();
  } catch (e) {
    $('grMensaje').textContent = 'No se pudieron cargar las gráficas. Vuelve a intentar.';
    $('grMensaje').classList.remove('hidden');
  } finally { document.body.classList.remove('gr-ocupado'); }
}
// Jalar para actualizar (v2/jalar.js) vuelve a pedir las gráficas sin recargar.
window.tosAlActualizar = () => carga();

async function guardaPayee(params) {
  try {
    await rpc('v2_save_expense_payee', { organization_id: ctx.organization_id, ...params });
    await carga();
  } catch (e) { await window.tosAlert?.({ kicker: 'LA LISTA', title: 'No se pudo', message: ERRORES[String(e?.message || '')] || 'Vuelve a intentar.' }); }
}

$('periodos').addEventListener('click', (e) => { const b = e.target.closest('[data-periodo]'); if (!b || b.dataset.periodo === periodo) return; periodo = b.dataset.periodo; carga(); });
$('filtroTipo').addEventListener('click', (e) => { const b = e.target.closest('[data-tipo]'); if (!b || !datos) return; tipo = b.dataset.tipo; pintaBenef(); });
document.querySelector('.gr-kpis')?.addEventListener('click', (e) => {
  const b = e.target.closest('[data-ir]'); if (!b) return;
  const destino = $(b.dataset.ir)?.closest('.panel'); if (!destino) return;
  destino.scrollIntoView({ behavior: quieto() ? 'auto' : 'smooth', block: 'start' });
  destino.classList.remove('gr-brilla'); void destino.offsetWidth; destino.classList.add('gr-brilla');
});
document.querySelector('.gr-grid').addEventListener('click', (e) => {
  const b = e.target.closest('[data-dim][data-clave]'); if (!b) return;
  abreDesglose(b);
});
$('grLista').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-baja]'); if (!b) return;
  const p = (lista?.payees || []).find((x) => x.id === b.dataset.baja); if (!p) return;
  if (p.active && !(await window.tosConfirm?.({ kicker: 'LA LISTA', title: '¿Dar de baja a ' + p.name + '?', message: 'Ya no sale para escoger. Sus pagos se quedan en las gráficas.', confirmText: 'Dar de baja' }))) return;
  guardaPayee({ payee_id: p.id, name: p.name, kind: p.kind, staff_member_id: null, active: !p.active });
});
// Agregar: un formulario corto arriba de la lista (nombre y si es Staff o proveedor).
let tipoNuevo = 'staff';
$('grAgregar').addEventListener('click', () => {
  if ($('grNuevo')) { $('grNuevo').remove(); return; }
  $('grLista').insertAdjacentHTML('afterbegin', '<form id="grNuevo" class="gr-nuevo form-grid"><label class="span-2">Nombre<input id="grNuevoNombre" maxlength="120" required placeholder="Ej. DT Juan Pérez o Imprenta del Centro"></label>' +
    '<div class="gr-chips chico span-2" data-segmento role="group" aria-label="Tipo"><button type="button" data-nuevo-tipo="staff" aria-pressed="true">Staff</button><button type="button" data-nuevo-tipo="proveedor" aria-pressed="false">Proveedor</button></div>' +
    '<button class="primary span-2" type="submit">Agregar a la lista</button></form>');
  tipoNuevo = 'staff';
  $('grNuevoNombre').focus();
});
$('grLista').addEventListener('click', (e) => {
  const t = e.target.closest('[data-nuevo-tipo]'); if (!t) return;
  tipoNuevo = t.dataset.nuevoTipo;
  document.querySelectorAll('[data-nuevo-tipo]').forEach((x) => x.setAttribute('aria-pressed', String(x === t)));
});
$('grLista').addEventListener('submit', (e) => {
  if (e.target.id !== 'grNuevo') return;
  e.preventDefault();
  const nombre = $('grNuevoNombre').value.trim(); if (nombre.length < 2) return;
  guardaPayee({ payee_id: null, name: nombre, kind: tipoNuevo, staff_member_id: null, active: true });
});

(async function boot() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { location.href = '/v2'; return; }
  const rows = await rpc('v2_my_context');
  if (!rows?.length) { $('deniedText').textContent = 'Sin organización.'; show('deniedView'); return; }
  ctx = rows[0];
  const mods = await rpc('v2_my_modules', { organization_id: ctx.organization_id }), mod = mods.find((m) => m.module_code === 'accounting');
  if (!mod?.enabled || !mod?.can_read) { $('deniedText').textContent = 'Tu rol no tiene acceso a Contabilidad.'; show('deniedView'); return; }
  canWrite = !!mod.can_write;
  $('orgName').textContent = ctx.organization_name || '';
  show('view');
  segmentos();
  carga();
})();
