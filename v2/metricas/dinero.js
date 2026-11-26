/* MÉTRICAS · DINERO (antes «Gráficas del dinero», 25/11/2026, h102 + h103).
 * Presidencia (26/11): "vamos a concentrar todo en una hoja": vive dentro
 * de Métricas (montaDinero). Los cálculos siguen en contabilidad/graficas/graficas.js.
 * Presidencia: "más animadas... que le piques y puedas desglosar... para que
 * llegues a todo". Todo lo que es número se puede picar:
 *   - Las cifras de arriba cuentan hacia arriba y llevan a su gráfica.
 *   - Cada barra crece al aparecer; al picarla se abre su desglose (con su
 *     mini gráfica por mes y cada renglón), y otra vez para cerrarlo.
 *   - En la nómina, cada celda abre los pagos de esa persona en ese mes.
 *   - Cada proveedor abre todos sus pagos.
 * Sin animación si el teléfono pide menos movimiento. */
import { rpc } from '/v2/shell.js';
import { PERIODOS, rangoDe, barras, tablaNomina, etiquetaMes, filtraTipo, ETIQUETA_TIPO, uniformes, esAdeudo, metodo, resumenDetalle, porMes, suaviza, semanasDePago, rangoAnterior, cambioPct, sumaMeses, mesAMes } from '/v2/contabilidad/graficas/graficas.js';
import { cargaBeneficiarios } from '/v2/beneficiarios.js';
import { segmentos } from '/v2/segmento.js';

const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fechaCorta = (f) => { if (!f) return ''; const [, m, d] = String(f).slice(0, 10).split('-').map(Number); return `${d} ${MES[m - 1]}`; };
const ERRORES = { 'Payee already exists': 'Ya está en la lista.', 'Payee needs a name': 'Escribe el nombre.', 'Not authorized': 'Tu cuenta no puede cambiar la lista.' };
const quieto = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let meses = null, antes = null, mesElegido = null, sinPermiso = false, ctx = null, canWrite = false, periodo = 'anio', tipo = 'todos', datos = null, lista = null, rango = null;

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

/* Contra el periodo anterior: sólo si antes hubo movimientos (h104). */
const TXT_ANTES = { mes: 'vs. mismo tramo del mes pasado', tres: 'vs. los 3 meses anteriores', anio: 'vs. mismo tramo del año pasado' };
function pintaDeltas() {
  const prev = Array.isArray(antes) && antes.length ? sumaMeses(antes) : null;
  const items = [['dIngresos', datos.ingresos, prev?.ingresos, true], ['dEgresos', datos.egresos, prev?.egresos, false],
    ['dQueda', (datos.ingresos || 0) - (datos.egresos || 0), prev ? prev.ingresos - prev.egresos : null, true]];
  for (const [id, ahora, entonces, subirEsBueno] of items) {
    const el = $(id); if (!el) continue;
    const c = prev && entonces > 0 ? cambioPct(ahora, entonces) : null;
    if (c == null) { el.hidden = true; continue; }
    const bueno = c === 0 ? null : (c > 0) === subirEsBueno;
    el.hidden = false;
    el.dataset.tono = bueno == null ? 'igual' : bueno ? 'bien' : 'mal';
    el.innerHTML = '<b>' + (c > 0 ? '+' : c < 0 ? '-' : '') + Math.abs(c) + '%</b> ' + esc(TXT_ANTES[periodo] || '');
  }
}
/* Mes a mes: dos columnas por mes; tocar un mes enseña cuánto quedó. */
function pintaMeses() {
  const panel = $('grMesPanel'); if (!panel) return;
  const xs = Array.isArray(meses) ? mesAMes(meses) : [];
  panel.hidden = xs.length < 2;
  if (panel.hidden) return;
  if (!xs.some((x) => x.mes === mesElegido)) mesElegido = xs[xs.length - 1].mes;
  $('grMes').innerHTML = xs.map((x, i) => '<button type="button" class="gr-mescol" data-mes="' + esc(x.mes) + '" aria-pressed="' + (x.mes === mesElegido) + '" style="--i:' + i + '" aria-label="' + esc(etiquetaMes(x.mes)) + ': entró ' + money.format(x.ingresos) + ', salió ' + money.format(x.egresos) + '">' +
    '<span class="gr-mescol-barras"><i class="ing" data-h="' + x.hIng + '"></i><i class="eg" data-h="' + x.hEg + '"></i></span><small>' + esc(etiquetaMes(x.mes).split(' ')[0]) + '</small></button>').join('');
  const crece = () => $('grMes').querySelectorAll('i[data-h]').forEach((b) => { b.style.height = b.dataset.h + '%'; });
  if (quieto()) crece(); else requestAnimationFrame(() => requestAnimationFrame(crece));
  pintaMesDetalle(xs);
}
function pintaMesDetalle(xs = mesAMes(meses || [])) {
  const x = xs.find((m) => m.mes === mesElegido); if (!x) return;
  $('grMesDetalle').innerHTML = '<b>' + esc(etiquetaMes(x.mes)) + '</b>' +
    '<span><small>Entró</small><strong>' + money.format(x.ingresos) + '</strong></span>' +
    '<span><small>Salió</small><strong>' + money.format(x.egresos) + '</strong></span>' +
    '<span class="' + (x.queda < 0 ? 'neg' : '') + '"><small>' + (x.queda < 0 ? 'Faltó' : 'Quedó') + '</small><strong>' + money.format(Math.abs(x.queda)) + '</strong></span>';
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

/* LA LISTA (26/11/2026). Presidencia: "hazla más interactiva y no que se
 * vea como texto... que no sea una fila larguísima". Filtros arriba (Todos,
 * Staff, Proveedores, De baja) con buscador; tarjetas con iniciales y lo
 * pagado; se ven 8 y el resto con "Ver todos". Al tocar una tarjeta se abre
 * su hoja: lo pagado, el último pago, sus pagos (y semana por semana si es
 * Staff) y, al final, dar de baja o volver a activar. */
const FILTROS_LISTA = [['todos', 'Todos'], ['staff', 'Staff'], ['proveedor', 'Proveedores'], ['baja', 'De baja']];
let filtroLista = 'todos', buscaLista = '', verTodaLista = false;
const VISIBLES_LISTA = 8;
const iniciales = (n) => String(n || '?').trim().split(/\s+/).filter((w) => /\p{L}/u.test(w[0] || '')).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
const sinAcentos = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function pintaLista() {
  const todos = lista?.payees || [];
  $('grAgregar').classList.toggle('hidden', !canWrite);
  const cuenta = { todos: todos.filter((p) => p.active).length, staff: todos.filter((p) => p.active && p.kind === 'staff').length, proveedor: todos.filter((p) => p.active && p.kind === 'proveedor').length, baja: todos.filter((p) => !p.active).length };
  $('grListaFiltro').innerHTML = FILTROS_LISTA.filter(([k]) => k !== 'baja' || cuenta.baja).map(([k, t]) => '<button type="button" data-filtro-lista="' + k + '" aria-pressed="' + (filtroLista === k) + '">' + t + ' <small>' + cuenta[k] + '</small></button>').join('');
  const q = sinAcentos(buscaLista).trim();
  const xs = todos.filter((p) => (filtroLista === 'baja' ? !p.active : p.active && (filtroLista === 'todos' || p.kind === filtroLista)))
    .filter((p) => !q || sinAcentos(p.name).includes(q) || (p.aliases || []).some((a) => sinAcentos(a).includes(q)))
    .sort((a, b) => (Number(b.total) || 0) - (Number(a.total) || 0) || a.name.localeCompare(b.name, 'es'));
  const box = $('grLista');
  if (!todos.length) { box.innerHTML = '<p class="gr-vacio">Todavía no hay nadie en la lista.</p>'; return; }
  if (!xs.length) { box.innerHTML = '<p class="gr-vacio">' + (q ? 'Nadie con ese nombre.' : 'Nadie en este grupo.') + '</p>'; return; }
  const mostrar = verTodaLista || q ? xs : xs.slice(0, VISIBLES_LISTA);
  box.innerHTML = '<div class="gr-personas">' + mostrar.map((p, i) => '<button type="button" class="gr-persona' + (p.active ? '' : ' baja') + '" data-persona="' + esc(p.id) + '" style="--i:' + Math.min(i, 12) + '">' +
    '<span class="gr-avatar ' + esc(p.kind) + '" aria-hidden="true">' + esc(iniciales(p.name)) + '</span>' +
    '<span class="gr-persona-txt"><b>' + esc(p.name) + '</b><small>' + esc(ETIQUETA_TIPO[p.kind] || '') + (p.active ? '' : ' · de baja') + '</small></span>' +
    '<strong>' + (Number(p.total) > 0 ? money.format(Number(p.total)) : '—') + '</strong>' +
    '<small class="gr-persona-ult">' + (p.lastPaidOn ? 'último ' + esc(fechaCorta(p.lastPaidOn)) : 'sin pagos') + '</small></button>').join('') + '</div>' +
    (mostrar.length < xs.length ? '<button type="button" class="gr-mas gr-ver-lista">Ver todos (' + xs.length + ')</button>' : '');
}
// La hoja de una persona o proveedor.
function cierraHojaPersona() { $('grHoja')?.remove(); $('grHojaFondo')?.remove(); document.body.style.overflow = ''; }
async function abreHojaPersona(id) {
  const p = (lista?.payees || []).find((x) => x.id === id); if (!p) return;
  cierraHojaPersona();
  document.body.insertAdjacentHTML('beforeend', '<div id="grHojaFondo" class="pres-backdrop"></div><section id="grHoja" class="pres-sheet gr-hoja" role="dialog" aria-modal="true" aria-labelledby="grHojaT"><div class="pres-grab" aria-hidden="true"></div>' +
    '<header class="gr-hoja-head"><span class="gr-avatar grande ' + esc(p.kind) + '" aria-hidden="true">' + esc(iniciales(p.name)) + '</span><div><h2 id="grHojaT">' + esc(p.name) + '</h2><p>' + esc(ETIQUETA_TIPO[p.kind] || '') + (p.active ? '' : ' · de baja') + ((p.aliases || []).length ? ' · también «' + esc(p.aliases.slice(0, 2).join('», «')) + '»' : '') + '</p></div><button type="button" class="pres-close" data-cierra-hoja aria-label="Cerrar">×</button></header>' +
    '<div class="gr-hoja-kpis"><span><small>Pagado en total</small><strong>' + money.format(Number(p.total) || 0) + '</strong></span><span><small>Último pago</small><strong>' + (p.lastPaidOn ? esc(fechaCorta(p.lastPaidOn)) : '—') + '</strong></span></div>' +
    '<div id="grHojaPagos" class="gr-desglose abierto"><div class="gr-cargando"><i></i><i></i><i></i></div></div>' +
    (canWrite ? '<button type="button" class="gr-hoja-baja' + (p.active ? '' : ' activa') + '" data-baja="' + esc(p.id) + '">' + (p.active ? 'Dar de baja' : 'Volver a activar') + '</button>' : '') + '</section>');
  document.body.style.overflow = 'hidden';
  $('grHojaFondo').addEventListener('click', cierraHojaPersona);
  $('grHoja').addEventListener('click', (e) => {
    if (e.target.closest('[data-cierra-hoja]')) return cierraHojaPersona();
    const mas = e.target.closest('.gr-mas'); if (mas) { $('grHoja').querySelectorAll('.gr-det li[hidden]').forEach((li) => { li.hidden = false; }); mas.remove(); }
    const b = e.target.closest('[data-baja]'); if (b) bajaPersona(b.dataset.baja);
  });
  try {
    const rows = await rpc('v2_finance_detail', { organization_id: ctx.organization_id, desde: rango.desde, hasta: rango.hasta, dimension: 'beneficiario', clave: p.id }) || [];
    if (!$('grHojaPagos')) return;
    $('grHojaPagos').innerHTML = rows.length ? htmlDesglose('beneficiario', 'Sus pagos · ' + (PERIODOS.find((x) => x.k === periodo)?.t || ''), rows, p.id) : '<p class="gr-vacio">Sin pagos en este periodo.</p>';
    creceBarras($('grHojaPagos'));
    $('grHojaPagos').querySelectorAll('.gr-mes i').forEach((i) => { requestAnimationFrame(() => requestAnimationFrame(() => { i.style.height = i.dataset.pct + '%'; })); });
  } catch { if ($('grHojaPagos')) $('grHojaPagos').innerHTML = '<p class="gr-vacio">No se pudieron traer sus pagos.</p>'; }
}
async function bajaPersona(id) {
  const p = (lista?.payees || []).find((x) => x.id === id); if (!p) return;
  if (p.active && !(await window.tosConfirm?.({ kicker: 'LA LISTA', title: '¿Dar de baja a ' + p.name + '?', message: 'Ya no sale para escoger. Sus pagos se quedan en las gráficas.', confirmText: 'Dar de baja' }))) return;
  cierraHojaPersona();
  guardaPayee({ payee_id: p.id, name: p.name, kind: p.kind, staff_member_id: null, active: !p.active });
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('grHoja')) cierraHojaPersona(); });

async function carga() {
  $('grMensaje').classList.add('hidden');
  $('periodos').innerHTML = PERIODOS.map((p) => '<button type="button" data-periodo="' + p.k + '" aria-pressed="' + (periodo === p.k) + '">' + p.t + '</button>').join('');
  rango = rangoDe(periodo, hoy());
  document.body.classList.add('gr-ocupado');
  try {
    const previo = rangoAnterior(periodo, hoy());
    [datos, lista, meses, antes] = await Promise.all([
      rpc('v2_finance_analytics', { organization_id: ctx.organization_id, desde: rango.desde, hasta: rango.hasta }),
      cargaBeneficiarios(rpc, ctx.organization_id, { fresco: true }),
      // Mes a mes (h104). Si la base todavía no lo tiene, la gráfica no sale.
      rpc('v2_finance_monthly', { organization_id: ctx.organization_id, desde: rango.desde, hasta: rango.hasta }).catch(() => null),
      previo ? rpc('v2_finance_monthly', { organization_id: ctx.organization_id, desde: previo.desde, hasta: previo.hasta }).catch(() => null) : null,
    ]);
    pinta(); pintaLista(); pintaMeses(); pintaDeltas();
  } catch (e) {
    if (/not authorized/i.test(e?.message || '')) { sinPermiso = true; return; }
    $('grMensaje').textContent = 'No se pudieron cargar las gráficas. Vuelve a intentar.';
    $('grMensaje').classList.remove('hidden');
  } finally { document.body.classList.remove('gr-ocupado'); }
}
// Jalar para actualizar (v2/jalar.js) vuelve a pedir las gráficas sin recargar.

async function guardaPayee(params) {
  try {
    await rpc('v2_save_expense_payee', { organization_id: ctx.organization_id, ...params });
    await carga();
  } catch (e) { await window.tosAlert?.({ kicker: 'LA LISTA', title: 'No se pudo', message: ERRORES[String(e?.message || '')] || 'Vuelve a intentar.' }); }
}

$('grMes')?.addEventListener('click', (e) => {
  const b = e.target.closest('[data-mes]'); if (!b) return;
  mesElegido = b.dataset.mes;
  $('grMes').querySelectorAll('[data-mes]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  pintaMesDetalle();
});
$('periodos').addEventListener('click', (e) => { const b = e.target.closest('[data-periodo]'); if (!b || b.dataset.periodo === periodo) return; periodo = b.dataset.periodo; carga(); });
$('filtroTipo').addEventListener('click', (e) => { const b = e.target.closest('[data-tipo]'); if (!b || !datos) return; tipo = b.dataset.tipo; pintaBenef(); });
document.querySelector('.gr-kpis')?.addEventListener('click', (e) => {
  const b = e.target.closest('[data-ir]'); if (!b) return;
  const destino = $(b.dataset.ir)?.closest('.panel'); if (!destino) return;
  // Si su gráfica está en otra sección escondida, Métricas la enseña primero.
  if (destino.closest('[hidden]')) window.tosMetricasMuestra?.(destino);
  destino.scrollIntoView({ behavior: quieto() ? 'auto' : 'smooth', block: 'start' });
  destino.classList.remove('gr-brilla'); void destino.offsetWidth; destino.classList.add('gr-brilla');
});
// Las barras viven en Dinero y en Cobranza (los adeudos): las dos abren desglose.
document.querySelectorAll('.gr-grid').forEach((g) => g.addEventListener('click', (e) => {
  const b = e.target.closest('[data-dim][data-clave]'); if (!b) return;
  abreDesglose(b);
}));
$('grLista').addEventListener('click', (e) => {
  const c = e.target.closest('[data-persona]'); if (c) return abreHojaPersona(c.dataset.persona);
  if (e.target.closest('.gr-ver-lista')) { verTodaLista = true; pintaLista(); }
});
$('grListaFiltro').addEventListener('click', (e) => {
  const b = e.target.closest('[data-filtro-lista]'); if (!b || b.dataset.filtroLista === filtroLista) return;
  filtroLista = b.dataset.filtroLista; verTodaLista = false; pintaLista();
});
$('grListaBusca').addEventListener('input', (e) => { buscaLista = e.target.value; pintaLista(); });
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

/* Lo monta Métricas. Regresa false si la cuenta no puede ver el dinero
 * (la base dice Not authorized): entonces la sección no se enseña. */
export async function montaDinero({ ctx: c, canWrite: w = false }) {
  ctx = c; canWrite = !!w;
  await carga();
  return !sinPermiso;
}
export const recargaDinero = () => carga();
