/* Gráficas del dinero (25/11/2026, h102). Ver graficas.js. */
import { createClient } from '/v2/supabase-client.js';
import { PERIODOS, rangoDe, barras, tablaNomina, etiquetaMes, filtraTipo, ETIQUETA_TIPO, uniformes } from '/v2/contabilidad/graficas/graficas.js';
import { cargaBeneficiarios } from '/v2/beneficiarios.js';

const supabase = createClient('https://pacnegivzgxpanphrnwp.supabase.co', 'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG', { auth: { persistSession: true, autoRefreshToken: true } });
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const rpc = async (n, p = {}) => { const { data, error } = await supabase.rpc(n, p); if (error) throw error; return data; };
const show = (id) => ['loadingView', 'deniedView', 'view'].forEach((v) => $(v)?.classList.toggle('hidden', v !== id));
const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fechaCorta = (f) => { if (!f) return ''; const [, m, d] = String(f).slice(0, 10).split('-').map(Number); return `${d} ${['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][m - 1]}`; };
const ERRORES = { 'Payee already exists': 'Ya está en la lista.', 'Payee needs a name': 'Escribe el nombre.', 'Not authorized': 'Tu cuenta no puede cambiar la lista.' };

let ctx = null, canWrite = false, periodo = 'anio', tipo = 'todos', datos = null, lista = null;

function pintaBarras(id, filas, { nota = null } = {}) {
  const b = barras(filas);
  $(id).innerHTML = !b.filas.length ? '<p class="gr-vacio">Sin movimientos en este periodo.</p>'
    : '<div class="gr-barras">' + b.filas.map((x) => '<div class="gr-fila"><b>' + esc(x.name) + (nota ? '<small>' + esc(nota(x)) + '</small>' : '') + '</b>' +
      '<span class="gr-carril" aria-hidden="true"><i style="width:' + x.pct + '%"></i></span><strong>' + money.format(x.total) + '</strong></div>').join('') + '</div>' +
      (b.resto ? '<p class="gr-resto">Y ' + b.resto.n + ' más: ' + money.format(b.resto.total) + '</p>' : '');
}

function pintaBenef() {
  $('filtroTipo').innerHTML = [['todos', 'Todos'], ['staff', 'Staff'], ['proveedor', 'Proveedores']].map(([k, t]) =>
    '<button type="button" data-tipo="' + k + '" aria-pressed="' + (tipo === k) + '">' + t + '</button>').join('');
  pintaBarras('grBenef', filtraTipo(datos.porBeneficiario, tipo), {
    nota: (x) => [ETIQUETA_TIPO[x.kind] || '', x.count + (x.count === 1 ? ' pago' : ' pagos'), x.last ? 'último ' + fechaCorta(x.last) : ''].filter(Boolean).join(' · ') });
}

function pinta() {
  const d = datos;
  $('kIngresos').textContent = money.format(d.ingresos || 0);
  $('kEgresos').textContent = money.format(d.egresos || 0);
  $('kQueda').textContent = money.format((d.ingresos || 0) - (d.egresos || 0));
  $('kAdeudo').textContent = money.format(d.adeudo || 0);
  pintaBenef();
  const t = tablaNomina(d.nominaPorMes);
  $('grNomina').innerHTML = !t.filas.length ? '<p class="gr-vacio">Sin pagos a Staff en este periodo.</p>'
    : '<table class="gr-nomina"><thead><tr><th>Persona</th>' + t.meses.map((m) => '<th>' + esc(etiquetaMes(m)) + '</th>').join('') + '<th>Total</th></tr></thead><tbody>' +
      t.filas.map((f) => '<tr><td>' + esc(f.name) + '</td>' + t.meses.map((m) => f.valores[m] ? '<td>' + money.format(f.valores[m]) + '</td>' : '<td class="cero">—</td>').join('') + '<td><b>' + money.format(f.total) + '</b></td></tr>').join('') +
      '</tbody><tfoot><tr><td>Total</td>' + t.meses.map((m) => '<td>' + money.format(t.filas.reduce((s, f) => s + (f.valores[m] || 0), 0)) + '</td>').join('') +
      '<td>' + money.format(t.filas.reduce((s, f) => s + f.total, 0)) + '</td></tr></tfoot></table>';
  pintaBarras('grIngTipo', d.ingresosPorTipo);
  pintaBarras('grIngCat', d.ingresosPorCategoria);
  pintaBarras('grDeuCat', d.adeudoPorCategoria, { nota: (x) => x.cargos + (x.cargos === 1 ? ' cargo' : ' cargos') });
  pintaBarras('grDeuTipo', d.adeudoPorTipo, { nota: (x) => x.cargos + (x.cargos === 1 ? ' cargo' : ' cargos') });
  pintaBarras('grEgCat', d.egresosPorCategoria);
  const u = uniformes(d.uniformes);
  $('grUniformes').innerHTML = !u.entro && !u.pagado ? '<p class="gr-vacio">Sin uniformes en este periodo.</p>'
    : '<div class="gr-uni">' + barrasHtml([{ name: 'Entró (uniformes y tienda)', total: u.entro }, { name: 'Pagado a Tremor', total: u.pagado }]) +
      '<p>' + (u.queda >= 0 ? 'Quedan ' + money.format(u.queda) : 'Se ha pagado ' + money.format(-u.queda) + ' más de lo que entró') +
      (u.pctPagado != null ? ' · al proveedor se le ha pagado el ' + u.pctPagado + '% de lo que entró.' : '.') + '</p></div>';
  $('grProv').innerHTML = !(d.proveedores || []).length ? '<p class="gr-vacio">Sin pagos a proveedores en este periodo.</p>'
    : d.proveedores.map((p) => '<article><header><b>' + esc(p.name) + '</b><strong>' + money.format(p.total) + '</strong></header><ul>' +
      (p.pagos || []).map((x) => '<li><span>' + esc(fechaCorta(x.fecha)) + ' · ' + esc(x.concepto || '') + '</span><b>' + money.format(Number(x.monto || 0)) + '</b></li>').join('') + '</ul></article>').join('');
}
function barrasHtml(filas) {
  const b = barras(filas);
  return '<div class="gr-barras">' + b.filas.map((x) => '<div class="gr-fila"><b>' + esc(x.name) + '</b><span class="gr-carril" aria-hidden="true"><i style="width:' + x.pct + '%"></i></span><strong>' + money.format(x.total) + '</strong></div>').join('') + '</div>';
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
  const r = rangoDe(periodo, hoy());
  try {
    [datos, lista] = await Promise.all([
      rpc('v2_finance_analytics', { organization_id: ctx.organization_id, desde: r.desde, hasta: r.hasta }),
      cargaBeneficiarios(rpc, ctx.organization_id, { fresco: true }),
    ]);
    pinta(); pintaLista();
  } catch (e) {
    $('grMensaje').textContent = 'No se pudieron cargar las gráficas. Vuelve a intentar.';
    $('grMensaje').classList.remove('hidden');
  }
}

async function guardaPayee(params) {
  try {
    await rpc('v2_save_expense_payee', { organization_id: ctx.organization_id, ...params });
    await carga();
  } catch (e) { await window.tosAlert?.({ kicker: 'LA LISTA', title: 'No se pudo', message: ERRORES[String(e?.message || '')] || 'Vuelve a intentar.' }); }
}

$('periodos').addEventListener('click', (e) => { const b = e.target.closest('[data-periodo]'); if (!b) return; periodo = b.dataset.periodo; carga(); });
$('filtroTipo').addEventListener('click', (e) => { const b = e.target.closest('[data-tipo]'); if (!b || !datos) return; tipo = b.dataset.tipo; pintaBenef(); });
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
    '<div class="gr-chips chico span-2" role="group" aria-label="Tipo"><button type="button" data-nuevo-tipo="staff" aria-pressed="true">Staff</button><button type="button" data-nuevo-tipo="proveedor" aria-pressed="false">Proveedor</button></div>' +
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
  carga();
})();
