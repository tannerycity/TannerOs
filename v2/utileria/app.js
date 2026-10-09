/* UTILERÍA, estilo bodega bien llevada (rediseño 09/10/2026).
 *
 * Presidencia: "lo tenemos como si fuera un Excel". Era una tabla de siete
 * columnas, cinco pestañas y formularios largos; entregar algo pedía abrir un
 * asistente desde otra pestaña, y resolver un reporte era un select, un campo y
 * un botón por tarjeta. Resultado: cero entregas registradas.
 *
 * Ahora la pantalla contesta las tres preguntas de cualquier bodega:
 *
 *   #/bodega    QUÉ TENEMOS. Tarjetas con foto y el número grande de lo que
 *               hay en bodega; por categoría, con buscador. Tocar una abre su
 *               ficha: cuántos hay, quién los tiene, reportes, y Entregar.
 *   #/quien     QUIÉN LO TIENE. Una tarjeta por persona con lo que trae.
 *               "Devolvió" es un toque.
 *   #/reportes  QUÉ SE REPORTÓ. Abiertos primero; "En reparación",
 *               "Resuelto" o "Rechazar" son un toque.
 *
 * Entregar son tres toques: qué → a quién → confirmar.
 *
 * El profe (sin permiso de escritura) ve "Mi utilería": su material en
 * tarjetas y, al tocar una, qué pasó (dañado, roto, perdido, me falta) en dos
 * toques. "Pedir material" para lo que no tiene.
 *
 * El servidor no cambia: mismas funciones v2_equipment_*. Las reglas de dar de
 * baja viven en /v2/utileria-baja.js (scripts/qa-utileria-baja.mjs).
 */
import { createClient } from '/v2/supabase-client.js';
import { getSignedPhotoUrls } from '/v2/photo-cache.js';
import { encodeVariant, THUMB_MAX_SIDE, THUMB_MAX_BYTES, FULL_MAX_SIDE, FULL_MAX_BYTES, UPLOAD_CACHE_CONTROL } from '/v2/image-encode.js';
import { esBaja, contarBajas, estadoAlAlternar, textoDelBoton, estadoAlGuardar, puedeDarseDeBaja } from '/v2/utileria-baja.js';

const supabase = createClient(
  'https://pacnegivzgxpanphrnwp.supabase.co',
  'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',
  { auth: { persistSession: true, autoRefreshToken: true } }
);

const PHOTO_BUCKET = 'tanneros-private';
const $ = (id) => document.getElementById(id);
const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

let ctx = null;
let canWrite = false;
let items = [];
let assignments = [];
let coaches = [];
let reports = [];
let valor = [];
let myKit = [];
let myReports = [];
// Lo que se ve en "Qué tenemos": categoría elegida y búsqueda.
const filtro = { cat: '', q: '' };
let filtroReportes = 'abiertos';

function show(id) { ['loadingView', 'deniedView', 'view'].forEach((v) => $(v)?.classList.toggle('hidden', v !== id)); }
async function rpc(name, params = {}) { const { data, error } = await supabase.rpc(name, params); if (error) throw error; return data; }
function fecha(v) { if (!v) return '—'; return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(new Date(v)); }
function fechaHora(v) { if (!v) return '—'; return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(v)); }
const iniciales = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0] || '').join('').toUpperCase();

function friendly(error) {
  const message = String(error?.message || error || 'Ocurrió un error.');
  const map = {
    'Not authorized': 'No tienes permiso para hacer esto.',
    'Item name required': 'Escribe un nombre para el artículo.',
    'Inventory quantities cannot be negative': 'Las cantidades no pueden ser negativas.',
    'Unit cost cannot be negative': 'El costo no puede ser negativo.',
    'Quantity cannot be lower than currently assigned quantity': 'No puedes dejar menos de lo que ya está entregado.',
    'Equipment item not found': 'No encontramos ese artículo.',
    'Unit code required': 'Escribe un identificador para la pieza (ej. Balón #025).',
    'Equipment unit not available': 'Esa pieza ya está entregada o no está disponible.',
    'Assignment recipient required': 'Elige quién recibe el material.',
    'Equipment item unavailable': 'Ese artículo ya no está disponible.',
    'Not enough equipment available': 'No hay suficiente en bodega.',
    'Active assignment not found': 'Esa entrega ya estaba devuelta.',
    'Item or unit required': 'Elige un artículo.',
    'Report not found': 'No encontramos ese reporte.',
    'row-level security': 'No tienes permiso para hacer esto.',
  };
  for (const key in map) if (message.includes(key)) return map[key];
  return message;
}

/* ---------- Fotos (mismo patrón que Jugadores) ---------- */
function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No pudimos leer esa foto. Prueba con JPG, PNG o WebP.')); };
    img.src = url;
  });
}
async function uploadPhoto(pathPrefix, file) {
  if (!file) throw new Error('Selecciona una foto.');
  if (file.type && !String(file.type).startsWith('image/')) throw new Error('Selecciona una imagen válida.');
  const img = await loadImageFile(file);
  const full = await encodeVariant(img, FULL_MAX_SIDE, 0.82, FULL_MAX_BYTES);
  const thumb = await encodeVariant(img, THUMB_MAX_SIDE, 0.75, THUMB_MAX_BYTES);
  const stamp = Date.now();
  const path = `${pathPrefix}-${stamp}.${full.ext}`;
  const thumbPath = `${pathPrefix}-${stamp}-thumb.${thumb.ext}`;
  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    supabase.storage.from(PHOTO_BUCKET).upload(path, full.blob, { contentType: full.mime, cacheControl: UPLOAD_CACHE_CONTROL, upsert: false }),
    supabase.storage.from(PHOTO_BUCKET).upload(thumbPath, thumb.blob, { contentType: thumb.mime, cacheControl: UPLOAD_CACHE_CONTROL, upsert: false }),
  ]);
  if (e1 || e2) {
    await supabase.storage.from(PHOTO_BUCKET).remove([path, thumbPath]).catch(() => {});
    throw e1 || e2;
  }
  return { path, thumbPath };
}
// Fotos ya firmadas en esta visita: ruta -> url.
const fotos = new Map();
function foto(ruta, alt, clase = '') {
  const url = ruta && fotos.get(ruta);
  return `<div class="ut-foto ${clase}${ruta ? '' : ' vacia'}" ${ruta ? `data-ruta="${esc(ruta)}"` : ''}>`
    + (url ? `<img src="${esc(url)}" alt="${esc(alt || '')}">` : `<span>${esc(iniciales(alt))}</span>`) + '</div>';
}
async function firmaFotos(raiz) {
  const pendientes = [...new Set([...raiz.querySelectorAll('.ut-foto[data-ruta]')].map((d) => d.dataset.ruta).filter((r) => !fotos.has(r)))];
  if (pendientes.length) {
    try { Object.entries(await getSignedPhotoUrls(supabase, PHOTO_BUCKET, pendientes) || {}).forEach(([r, u]) => fotos.set(r, u)); } catch { /* se quedan las iniciales */ }
  }
  raiz.querySelectorAll('.ut-foto[data-ruta]').forEach((d) => {
    const u = fotos.get(d.dataset.ruta);
    if (u && !d.querySelector('img')) d.innerHTML = `<img src="${esc(u)}" alt="">`;
  });
}
const fotoDe = (i) => i?.photo_thumb_path || i?.photo_path || null;

/* ---------- Avisos y hoja ---------- */
let avisoTimer = 0;
function aviso(texto) {
  const el = $('utAviso');
  el.textContent = texto; el.hidden = false; el.classList.add('entra');
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => { el.classList.remove('entra'); setTimeout(() => { el.hidden = true; }, 220); }, 2600);
}
let hojaAtras = null;
function abreHoja(titulo, html, { atras = null } = {}) {
  $('utHojaTitulo').textContent = titulo;
  $('utHojaCuerpo').innerHTML = html;
  hojaAtras = atras;
  $('utHojaAtras').classList.toggle('hidden', !atras);
  $('utFondo').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  $('utHojaCuerpo').scrollTop = 0;
  firmaFotos($('utHojaCuerpo'));
  return $('utHojaCuerpo');
}
function cierraHoja() {
  $('utFondo').classList.add('hidden');
  document.body.style.overflow = '';
  hojaAtras = null;
}

/* ---------- Arranque ---------- */
async function boot() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { location.href = '/'; return; }
  const rows = await rpc('v2_my_context');
  if (!rows?.length) { $('deniedText').textContent = 'Tu cuenta no está vinculada a un club.'; show('deniedView'); return; }
  ctx = rows[0];
  const mods = await rpc('v2_my_modules', { organization_id: ctx.organization_id });
  const mod = mods.find((m) => m.module_code === 'equipment');
  if (!mod?.enabled || !mod?.can_read) { $('deniedText').textContent = 'Tu rol no tiene acceso a Utilería.'; show('deniedView'); return; }
  canWrite = !!mod.can_write;
  $('orgName').textContent = ctx.organization_name || 'Tannery City FC';
  $('roleBadge').textContent = ctx.is_owner ? 'Presidencia' : ctx.role;
  bindHoja();
  if (canWrite) {
    $('utSeg').classList.remove('hidden');
    $('utEntregar').classList.remove('hidden');
    $('utEntregar').addEventListener('click', () => entregar());
    await loadAdmin();
    window.addEventListener('hashchange', ruta);
    ruta();
  } else {
    $('utTitulo').textContent = 'Mi utilería';
    await loadCoach();
  }
  show('view');
}

function bindHoja() {
  $('utHojaCerrar').addEventListener('click', cierraHoja);
  $('utHojaAtras').addEventListener('click', () => hojaAtras?.());
  $('utFondo').addEventListener('click', (e) => { if (e.target === $('utFondo')) cierraHoja(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('utFondo').classList.contains('hidden')) cierraHoja(); });
}

/* =========================================================
   ADMINISTRACIÓN
   ========================================================= */
async function loadAdmin() {
  const [i, a, c, r, v] = await Promise.all([
    rpc('v2_equipment_items', { organization_id: ctx.organization_id }),
    rpc('v2_equipment_assignments', { organization_id: ctx.organization_id, active_only: true }),
    rpc('v2_equipment_coaches', { organization_id: ctx.organization_id }),
    rpc('v2_equipment_reports', { organization_id: ctx.organization_id }),
    rpc('v2_equipment_inventory_value', { organization_id: ctx.organization_id }).catch(() => []),
  ]);
  items = Array.isArray(i) ? i : [];
  assignments = Array.isArray(a) ? a : [];
  coaches = Array.isArray(c) ? c : [];
  reports = Array.isArray(r) ? r : [];
  valor = Array.isArray(v) ? v : [];
  pintaResumen();
}
const activos = () => items.filter((i) => !esBaja(i));
const enBodega = (i) => (i.control_type === 'individual' ? Number(i.units_bodega || 0) : Number(i.available_quantity || 0));
const ABIERTOS = ['pendiente', 'en_reparacion', 'aprobado'];
const abiertos = () => reports.filter((r) => ABIERTOS.includes(r.status));
function personas() {
  const g = new Map();
  for (const a of assignments) {
    const k = a.assigned_to_user_id || `label:${a.assigned_to_label || a.recipient_name || 'Sin nombre'}`;
    if (!g.has(k)) g.set(k, { clave: k, nombre: a.recipient_name || a.assigned_to_label || 'Sin nombre', filas: [] });
    g.get(k).filas.push(a);
  }
  return [...g.values()].sort((x, y) => x.nombre.localeCompare(y.nombre, 'es-MX'));
}
function pintaResumen() {
  const act = activos();
  const piezasBodega = act.reduce((s, i) => s + enBodega(i), 0);
  const entregadas = assignments.reduce((s, a) => s + Number(a.quantity || 0), 0);
  $('segBodega').textContent = act.length;
  $('segQuien').textContent = personas().length;
  $('segReportes').textContent = abiertos().length;
  $('segReportes').closest('a').classList.toggle('alerta', abiertos().length > 0);
  const total = valor.reduce((s, x) => s + Number(x.estimated_value || 0), 0);
  $('utResumen').textContent = [
    plural(piezasBodega, 'pieza en bodega', 'piezas en bodega'),
    entregadas ? plural(entregadas, 'entregada', 'entregadas') : null,
    total ? `${money.format(total)} en material` : null,
  ].filter(Boolean).join(' · ');
}

function ruta() {
  const h = location.hash.replace(/^#\/?/, '') || 'bodega';
  const seg = ['bodega', 'quien', 'reportes'].includes(h) ? h : 'bodega';
  document.querySelectorAll('#utSeg a').forEach((a) => {
    const on = a.dataset.seg === seg;
    a.classList.toggle('activa', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  $('utTitulo').textContent = { bodega: 'Qué tenemos', quien: 'Quién lo tiene', reportes: 'Reportes' }[seg];
  if (seg === 'bodega') pintaBodega();
  else if (seg === 'quien') pintaQuien();
  else pintaReportes();
}
function repinta() { pintaResumen(); ruta(); }

/* ---------- Qué tenemos ---------- */
function categoriasConConteo() {
  const m = new Map();
  activos().forEach((i) => { const c = i.category || 'Sin categoría'; m.set(c, (m.get(c) || 0) + 1); });
  return [...m.entries()].sort(([a], [b]) => (a === 'Sin categoría') - (b === 'Sin categoría') || a.localeCompare(b, 'es-MX'));
}
function visiblesDeBodega() {
  const q = filtro.q.trim().toLocaleLowerCase('es-MX');
  let lista = filtro.cat === '__bajas' ? items.filter(esBaja) : activos();
  if (filtro.cat === '__reponer') lista = lista.filter((i) => i.needs_reorder || enBodega(i) === 0);
  else if (filtro.cat && filtro.cat !== '__bajas') lista = lista.filter((i) => (i.category || 'Sin categoría') === filtro.cat);
  if (q) lista = lista.filter((i) => `${i.name} ${i.category || ''} ${i.location || ''} ${i.sku || ''}`.toLocaleLowerCase('es-MX').includes(q));
  return lista.sort((a, b) => String(a.name).localeCompare(String(b.name), 'es-MX'));
}
function tarjetaArticulo(i) {
  const bodega = enBodega(i), fuera = Number(i.assigned_quantity || 0) || Number(i.units_asignado || 0);
  const estado = esBaja(i) ? '<em class="ut-pill gris">Baja</em>'
    : bodega === 0 ? '<em class="ut-pill rojo">Agotado</em>'
    : i.needs_reorder ? '<em class="ut-pill ambar">Reponer</em>' : '';
  return `<button type="button" class="ut-card" data-item="${esc(i.id)}">
    ${foto(fotoDe(i), i.name)}${estado}
    <span class="ut-card-txt"><strong>${esc(i.name)}</strong>
      <span class="ut-card-num"><b>${bodega}</b> en bodega</span>
      ${fuera ? `<small>${plural(fuera, 'entregado', 'entregados')}</small>` : `<small>${esc(i.category || 'Sin categoría')}</small>`}</span>
  </button>`;
}
function pintaBodega() {
  const cats = categoriasConConteo();
  const reponer = activos().filter((i) => i.needs_reorder || enBodega(i) === 0).length;
  const bajas = contarBajas(items);
  const lista = visiblesDeBodega();
  const chip = (val, texto, n) => `<button type="button" class="ut-chip${filtro.cat === val ? ' activa' : ''}" data-cat="${esc(val)}">${esc(texto)}${n != null ? ` <small>${n}</small>` : ''}</button>`;
  $('utPanel').innerHTML = `
    <div class="ut-barra">
      <label class="ut-buscar"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
        <input id="utBuscar" type="search" placeholder="Buscar balones, conos, casacas…" value="${esc(filtro.q)}" autocomplete="off"></label>
    </div>
    <div class="ut-chips" role="toolbar" aria-label="Filtrar por categoría">
      ${chip('', 'Todo', activos().length)}
      ${reponer ? chip('__reponer', 'Por reponer', reponer) : ''}
      ${cats.map(([c, n]) => chip(c, c, n)).join('')}
      ${bajas ? chip('__bajas', 'Dados de baja', bajas) : ''}
    </div>
    <div class="ut-grid">
      ${lista.map(tarjetaArticulo).join('')}
      ${canWrite && filtro.cat !== '__bajas' ? `<button type="button" class="ut-card nueva" id="utNuevo"><span class="ut-mas">+</span><strong>Nuevo artículo</strong></button>` : ''}
    </div>
    ${lista.length ? '' : `<p class="ut-vacio">${filtro.q ? 'Nada con ese nombre.' : 'No hay artículos aquí.'}</p>`}`;
  const panel = $('utPanel');
  panel.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => { filtro.cat = b.dataset.cat; pintaBodega(); }));
  panel.querySelectorAll('[data-item]').forEach((b) => b.addEventListener('click', () => fichaArticulo(b.dataset.item)));
  $('utNuevo')?.addEventListener('click', () => formArticulo(null));
  const buscar = $('utBuscar');
  buscar.addEventListener('input', () => {
    filtro.q = buscar.value;
    const grid = panel.querySelector('.ut-grid');
    const l = visiblesDeBodega();
    grid.querySelectorAll('[data-item]').forEach((c) => c.classList.toggle('hidden', !l.some((i) => i.id === c.dataset.item)));
  });
  firmaFotos(panel);
}

/* ---------- Ficha de un artículo ---------- */
function fichaArticulo(id) {
  const i = items.find((x) => x.id === id);
  if (!i) return;
  const quien = assignments.filter((a) => a.equipment_item_id === i.id);
  const reps = abiertos().filter((r) => r.equipment_item_id === i.id);
  const bodega = enBodega(i), fuera = quien.reduce((s, a) => s + Number(a.quantity || 0), 0);
  const cuerpo = abreHoja(i.name, `
    ${foto(i.photo_path || i.photo_thumb_path, i.name, 'grande')}
    <p class="ut-ficha-cat">${esc([i.category || 'Sin categoría', i.location].filter(Boolean).join(' · '))}</p>
    <div class="ut-stats">
      <div><strong>${bodega}</strong><span>En bodega</span></div>
      <div><strong>${fuera}</strong><span>Entregados</span></div>
      <div><strong>${Number(i.quantity || 0)}</strong><span>Total</span></div>
    </div>
    ${esBaja(i) ? '' : `<button type="button" class="ut-btn primario" data-accion="entregar" ${bodega ? '' : 'disabled'}>${bodega ? 'Entregar' : 'Sin piezas en bodega'}</button>`}
    <section class="ut-sec"><h3>Quién lo tiene</h3>
      ${quien.length ? quien.map(filaEntrega).join('') : '<p class="ut-nota">Todo está en bodega.</p>'}</section>
    ${reps.length ? `<section class="ut-sec"><h3>Reportes abiertos</h3>${reps.map((r) => `<p class="ut-nota"><b>${esc(TIPO[r.report_type] || r.report_type)}</b> · ${esc(r.reporter_name || '')} · ${esc(fecha(r.created_at))}</p>`).join('')}</section>` : ''}
    ${i.control_type === 'cantidad' && !esBaja(i) ? `<section class="ut-sec"><h3>Cantidad total</h3>
      <div class="ut-ajuste"><button type="button" data-ajuste="-1" aria-label="Uno menos">&minus;</button><output id="utCantidad">${Number(i.quantity || 0)}</output><button type="button" data-ajuste="1" aria-label="Uno más">+</button>
      <button type="button" class="ut-btn chico" id="utGuardaCantidad" hidden>Guardar</button></div>
      <p class="ut-nota">Llegó material o se perdió: ajústalo aquí. No puede quedar menos de lo entregado.</p></section>` : ''}
    ${i.control_type === 'individual' ? '<section class="ut-sec" id="utPiezas"><h3>Piezas</h3><p class="ut-nota">Cargando…</p></section>' : ''}
    <div class="ut-acciones">
      <button type="button" class="ut-btn" data-accion="editar">Editar</button>
      <button type="button" class="ut-btn" data-accion="historial">Historial</button>
      <button type="button" class="ut-btn peligro" data-accion="baja">${esc(textoDelBoton(i))}</button>
    </div>`);
  cuerpo.querySelector('[data-accion="entregar"]')?.addEventListener('click', () => entregar({ item: i, desde: () => fichaArticulo(id) }));
  cuerpo.querySelector('[data-accion="editar"]').addEventListener('click', () => formArticulo(i, () => fichaArticulo(id)));
  cuerpo.querySelector('[data-accion="historial"]').addEventListener('click', () => historial(i, () => fichaArticulo(id)));
  cuerpo.querySelector('[data-accion="baja"]').addEventListener('click', () => alternarBaja(i));
  cuerpo.querySelectorAll('[data-devuelve]').forEach((b) => b.addEventListener('click', () => devolver(assignments.find((a) => a.id === b.dataset.devuelve), () => fichaArticulo(id))));
  let cantidad = Number(i.quantity || 0);
  cuerpo.querySelectorAll('[data-ajuste]').forEach((b) => b.addEventListener('click', () => {
    cantidad = Math.max(fuera, cantidad + Number(b.dataset.ajuste));
    $('utCantidad').textContent = cantidad;
    $('utGuardaCantidad').hidden = cantidad === Number(i.quantity || 0);
  }));
  $('utGuardaCantidad')?.addEventListener('click', async () => {
    try { await guardaArticulo(i, { quantity: cantidad }); aviso(`${i.name}: ahora son ${cantidad}`); await loadAdmin(); repinta(); fichaArticulo(id); }
    catch (e) { aviso(friendly(e)); }
  });
  if (i.control_type === 'individual') pintaPiezas(i);
}
function filaEntrega(a) {
  return `<div class="ut-fila">
    <span class="ut-avatar">${esc(iniciales(a.recipient_name))}</span>
    <span class="ut-fila-txt"><strong>${esc(a.recipient_name || 'Sin nombre')}</strong>
      <small>${a.unit_code ? esc(a.unit_code) : plural(Number(a.quantity || 0), 'pieza', 'piezas')} · desde ${esc(fecha(a.assigned_at))}</small></span>
    <button type="button" class="ut-btn chico" data-devuelve="${esc(a.id)}">Devolvió</button></div>`;
}
async function pintaPiezas(i) {
  const box = $('utPiezas'); if (!box) return;
  const units = await rpc('v2_equipment_units', { organization_id: ctx.organization_id, item_id: i.id }).catch(() => []);
  const ETQ = { bodega: 'En bodega', asignado: 'Entregada', mantenimiento: 'En reparación', baja: 'Baja' };
  box.innerHTML = `<h3>Piezas · ${units.length}</h3>
    ${units.map((u) => `<div class="ut-fila"><span class="ut-fila-txt"><strong>${esc(u.code)}</strong><small>${esc(ETQ[u.status] || u.status)}${u.holder_name ? ` · ${esc(u.holder_name)}` : ''}${u.condition ? ` · ${esc(u.condition)}` : ''}</small></span></div>`).join('') || '<p class="ut-nota">Aún no hay piezas registradas.</p>'}
    <form class="ut-linea" id="utNuevaPieza"><input maxlength="60" placeholder="Ej. Balón #025" required aria-label="Identificador de la pieza"><button type="submit" class="ut-btn chico">Agregar</button></form>`;
  $('utNuevaPieza').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = e.target.querySelector('input').value.trim(); if (!code) return;
    try { await rpc('v2_upsert_equipment_unit', { organization_id: ctx.organization_id, unit_id: null, item_id: i.id, code, status: 'bodega', condition: null, notes: null }); await loadAdmin(); repinta(); fichaArticulo(i.id); }
    catch (err) { aviso(friendly(err)); }
  });
}
async function historial(i, atras) {
  const cuerpo = abreHoja(`Historial · ${i.name}`, '<p class="ut-nota">Cargando…</p>', { atras });
  const ETQ = { EquipmentItemCreated: 'Alta', EquipmentItemUpdated: 'Ajuste', EquipmentUnitCreated: 'Alta de pieza', EquipmentUnitUpdated: 'Cambio de pieza',
    EquipmentAssigned: 'Entrega', EquipmentReturned: 'Devolución', EquipmentIssueReported: 'Reporte', EquipmentReportResolved: 'Reporte resuelto' };
  const ev = await rpc('v2_equipment_history', { organization_id: ctx.organization_id, item_id: i.id, unit_id: null }).catch(() => []);
  cuerpo.innerHTML = (ev || []).map((e) => `<div class="ut-fila"><span class="ut-fila-txt"><strong>${esc(ETQ[e.event_type] || e.event_type)}</strong><small>${esc(e.actor_name || '—')} · ${esc(fechaHora(e.occurred_at))}</small></span></div>`).join('')
    || '<p class="ut-nota">Sin movimientos todavía.</p>';
}
async function alternarBaja(item) {
  const permiso = puedeDarseDeBaja(item);
  if (!permiso.ok) { await tosAlert({ kicker: 'UTILERÍA', title: 'Todavía no se puede dar de baja', message: permiso.motivo }); return; }
  const baja = esBaja(item);
  const ok = await tosConfirm({ kicker: 'UTILERÍA', title: baja ? `¿Reactivar ${item.name}?` : `¿Dar de baja ${item.name}?`,
    message: baja ? 'Vuelve a aparecer en la bodega.' : 'Sale de la bodega del día a día. No se borra: su historial se conserva y puedes reactivarlo.' });
  if (!ok) return;
  try { await guardaArticulo(item, { status: estadoAlAlternar(item) }); cierraHoja(); await loadAdmin(); repinta(); aviso(baja ? 'Reactivado' : 'Dado de baja'); }
  catch (err) { await tosAlert({ kicker: 'UTILERÍA', title: 'No se pudo guardar', message: friendly(err) }); }
}
/* La función del servidor es un upsert: un campo que no se manda se borra.
   Por eso siempre se parte del artículo completo y se cambia sólo lo pedido. */
function guardaArticulo(i, cambios = {}) {
  const x = { ...i, ...cambios };
  return rpc('v2_upsert_equipment_item', {
    organization_id: ctx.organization_id, item_id: i?.id || null,
    sku: x.sku || null, name: x.name, category: x.category || null,
    quantity: Number(x.quantity || 0), min_stock: Number(x.min_stock || 0),
    unit_cost: x.unit_cost === '' || x.unit_cost == null ? null : Number(x.unit_cost), location: x.location || null,
    status: x.status || estadoAlGuardar(i?.id ? i : null), notes: x.notes || null,
    control_type: x.control_type || 'cantidad', photo_path: x.photo_path || null,
    photo_bucket: x.photo_path ? (x.photo_bucket || PHOTO_BUCKET) : null, photo_thumb_path: x.photo_thumb_path || null,
  });
}

/* ---------- Nuevo / editar artículo ---------- */
function formArticulo(i, atras = null) {
  const cats = [...new Set(activos().map((x) => x.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es-MX'));
  let cat = i?.category || '', cantidad = Number(i?.quantity || 0), archivo = null;
  const cuerpo = abreHoja(i ? 'Editar artículo' : 'Nuevo artículo', `
    <form id="utForm" class="ut-form">
      <label class="ut-subefoto" id="utSubeFoto">${foto(fotoDe(i), i?.name || '+', 'grande')}<span>${fotoDe(i) ? 'Cambiar foto' : 'Agregar foto'}</span>
        <input type="file" accept="image/*" id="utArchivo" hidden></label>
      <label class="ut-campo"><span>Nombre</span><input id="fNombre" required minlength="2" maxlength="120" value="${esc(i?.name || '')}" placeholder="Balones del 5"></label>
      <div class="ut-campo"><span>Categoría</span>
        <div class="ut-chips envuelve" id="fCats">${cats.map((c) => `<button type="button" class="ut-chip${c === cat ? ' activa' : ''}" data-fcat="${esc(c)}">${esc(c)}</button>`).join('')}
        <input id="fCatNueva" class="ut-chip-input" maxlength="80" placeholder="Otra…" value="${cats.includes(cat) ? '' : esc(cat)}"></div></div>
      <div class="ut-campo"><span>Cuántos hay</span>
        <div class="ut-ajuste"><button type="button" data-fq="-1" aria-label="Uno menos">&minus;</button><output id="fCantidad">${cantidad}</output><button type="button" data-fq="1" aria-label="Uno más">+</button>
        <button type="button" data-fq="10" class="ut-mas10">+10</button></div></div>
      <details class="ut-mas-opciones"><summary>Más opciones</summary>
        <label class="ut-campo"><span>Avisar para reponer cuando queden</span><input id="fMinimo" type="number" min="0" step="1" value="${Number(i?.min_stock || 0)}"></label>
        <label class="ut-campo"><span>Costo por pieza</span><input id="fCosto" type="number" min="0" step="0.01" value="${i?.unit_cost ?? ''}" placeholder="$0"></label>
        <label class="ut-campo"><span>Dónde se guarda</span><input id="fUbicacion" maxlength="120" value="${esc(i?.location || '')}" placeholder="Bodega, cancha 2…"></label>
        <label class="ut-campo"><span>Cómo se cuenta</span><select id="fControl" ${i?.id ? 'disabled' : ''}>
          <option value="cantidad"${i?.control_type !== 'individual' ? ' selected' : ''}>Por cantidad (conos, casacas)</option>
          <option value="individual"${i?.control_type === 'individual' ? ' selected' : ''}>Pieza por pieza (balones numerados)</option></select></label>
        <label class="ut-campo"><span>SKU</span><input id="fSku" maxlength="60" value="${esc(i?.sku || '')}"></label>
        <label class="ut-campo"><span>Notas</span><input id="fNotas" maxlength="500" value="${esc(i?.notes || '')}"></label>
      </details>
      <p class="ut-error" id="fError" role="alert"></p>
      <button type="submit" class="ut-btn primario" id="fGuardar">${i ? 'Guardar cambios' : 'Agregar a la bodega'}</button>
    </form>`, { atras });
  cuerpo.querySelectorAll('[data-fcat]').forEach((b) => b.addEventListener('click', () => {
    cat = cat === b.dataset.fcat ? '' : b.dataset.fcat; $('fCatNueva').value = '';
    cuerpo.querySelectorAll('[data-fcat]').forEach((x) => x.classList.toggle('activa', x.dataset.fcat === cat));
  }));
  $('fCatNueva').addEventListener('input', (e) => { cat = e.target.value.trim(); cuerpo.querySelectorAll('[data-fcat]').forEach((x) => x.classList.remove('activa')); });
  cuerpo.querySelectorAll('[data-fq]').forEach((b) => b.addEventListener('click', () => { cantidad = Math.max(0, cantidad + Number(b.dataset.fq)); $('fCantidad').textContent = cantidad; }));
  $('utArchivo').addEventListener('change', (e) => {
    archivo = e.target.files?.[0] || null;
    if (archivo) cuerpo.querySelector('#utSubeFoto .ut-foto').innerHTML = `<img src="${URL.createObjectURL(archivo)}" alt="">`;
  });
  $('utForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('fGuardar'); btn.disabled = true; $('fError').textContent = '';
    try {
      let fotoNueva = {};
      if (archivo) {
        const up = await uploadPhoto(`organizations/${ctx.organization_id}/equipment/items/${i?.id || 'new'}/foto`, archivo);
        fotoNueva = { photo_path: up.path, photo_thumb_path: up.thumbPath, photo_bucket: PHOTO_BUCKET };
      }
      await guardaArticulo(i || {}, {
        name: $('fNombre').value.trim(), category: cat || null, quantity: cantidad,
        min_stock: Number($('fMinimo').value || 0), unit_cost: $('fCosto').value, location: $('fUbicacion').value.trim(),
        control_type: $('fControl').value, sku: $('fSku').value.trim(), notes: $('fNotas').value.trim(), ...fotoNueva,
      });
      await loadAdmin(); repinta();
      aviso(i ? 'Cambios guardados' : 'Agregado a la bodega');
      if (i) fichaArticulo(i.id); else cierraHoja();
    } catch (err) { $('fError').textContent = friendly(err); btn.disabled = false; }
  });
}

/* ---------- Entregar: qué → a quién → confirmar ---------- */
function entregar({ item = null, unidad = null, persona = null, desde = null } = {}) {
  if (!item) return pasoQue(desde);
  if (item.control_type === 'individual' && !unidad) return pasoPieza(item, desde);
  if (!persona) return pasoQuien(item, unidad, desde);
  return pasoConfirma(item, unidad, persona, desde);
}
function pasoQue(desde) {
  const disponibles = activos().filter((i) => enBodega(i) > 0).sort((a, b) => a.name.localeCompare(b.name, 'es-MX'));
  const cuerpo = abreHoja('¿Qué vas a entregar?', `
    <p class="ut-paso">Paso 1 de 3</p>
    <label class="ut-buscar"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input id="eBuscar" type="search" placeholder="Buscar…" autocomplete="off"></label>
    <div class="ut-grid compacta">${disponibles.map((i) => `<button type="button" class="ut-card" data-eitem="${esc(i.id)}">${foto(fotoDe(i), i.name)}
      <span class="ut-card-txt"><strong>${esc(i.name)}</strong><span class="ut-card-num"><b>${enBodega(i)}</b> en bodega</span></span></button>`).join('')}</div>
    ${disponibles.length ? '' : '<p class="ut-vacio">No hay nada en bodega para entregar.</p>'}`, { atras: desde });
  cuerpo.querySelectorAll('[data-eitem]').forEach((b) => b.addEventListener('click', () => entregar({ item: items.find((i) => i.id === b.dataset.eitem), desde: () => pasoQue(desde) })));
  $('eBuscar').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLocaleLowerCase('es-MX');
    cuerpo.querySelectorAll('[data-eitem]').forEach((b) => b.classList.toggle('hidden', !!q && !b.textContent.toLocaleLowerCase('es-MX').includes(q)));
  });
}
async function pasoPieza(item, desde) {
  const cuerpo = abreHoja(`¿Cuál ${item.name}?`, '<p class="ut-nota">Cargando piezas…</p>', { atras: desde });
  const units = (await rpc('v2_equipment_units', { organization_id: ctx.organization_id, item_id: item.id }).catch(() => [])).filter((u) => u.status === 'bodega');
  cuerpo.innerHTML = `<p class="ut-paso">Paso 1 de 3</p><div class="ut-lista">${units.map((u) => `<button type="button" class="ut-opcion" data-unidad="${esc(u.id)}" data-code="${esc(u.code)}"><strong>${esc(u.code)}</strong>${u.condition ? `<small>${esc(u.condition)}</small>` : ''}</button>`).join('') || '<p class="ut-vacio">No hay piezas en bodega.</p>'}</div>`;
  cuerpo.querySelectorAll('[data-unidad]').forEach((b) => b.addEventListener('click', () => entregar({ item, unidad: { id: b.dataset.unidad, code: b.dataset.code }, desde: () => pasoPieza(item, desde) })));
}
function pasoQuien(item, unidad, desde) {
  // Quien ya trae material sale primero: a esa persona se le entrega más seguido.
  const conMaterial = new Set(assignments.map((a) => a.assigned_to_user_id).filter(Boolean));
  const lista = [...coaches].sort((a, b) => (conMaterial.has(b.user_id) - conMaterial.has(a.user_id)) || String(a.display_name).localeCompare(String(b.display_name), 'es-MX'));
  const cuerpo = abreHoja('¿A quién?', `
    <p class="ut-paso">Paso 2 de 3 · ${esc(unidad ? `${item.name} ${unidad.code}` : item.name)}</p>
    <div class="ut-personas">${lista.map((c) => `<button type="button" class="ut-persona" data-coach="${esc(c.user_id)}" data-nombre="${esc(c.display_name)}">
      <span class="ut-avatar grande">${esc(iniciales(c.display_name))}</span><strong>${esc(c.display_name || 'Sin nombre')}</strong></button>`).join('')}</div>
    <form class="ut-linea" id="eOtro"><input maxlength="120" placeholder="Otra persona (escribe su nombre)" aria-label="Otra persona"><button type="submit" class="ut-btn chico">Usar</button></form>`, { atras: desde });
  cuerpo.querySelectorAll('[data-coach]').forEach((b) => b.addEventListener('click', () =>
    entregar({ item, unidad, persona: { id: b.dataset.coach, nombre: b.dataset.nombre }, desde: () => pasoQuien(item, unidad, desde) })));
  $('eOtro').addEventListener('submit', (e) => {
    e.preventDefault(); const n = e.target.querySelector('input').value.trim(); if (!n) return;
    entregar({ item, unidad, persona: { id: null, nombre: n }, desde: () => pasoQuien(item, unidad, desde) });
  });
}
function pasoConfirma(item, unidad, persona, desde) {
  const max = unidad ? 1 : enBodega(item);
  let cantidad = 1;
  const cuerpo = abreHoja('Confirmar entrega', `
    <p class="ut-paso">Paso 3 de 3</p>
    <div class="ut-resumen-entrega">
      ${foto(fotoDe(item), item.name)}
      <div><strong>${esc(unidad ? `${item.name} · ${unidad.code}` : item.name)}</strong><span>para <b>${esc(persona.nombre)}</b></span></div>
    </div>
    ${unidad ? '' : `<div class="ut-campo"><span>Cuántos</span><div class="ut-ajuste"><button type="button" data-cq="-1" aria-label="Uno menos">&minus;</button><output id="eCantidad">1</output><button type="button" data-cq="1" aria-label="Uno más">+</button><small>de ${max} en bodega</small></div></div>`}
    <label class="ut-campo"><span>Nota <small>opcional</small></span><input id="eNota" maxlength="500" placeholder="Para el torneo del sábado"></label>
    <p class="ut-error" id="eError" role="alert"></p>
    <button type="button" class="ut-btn primario" id="eConfirmar">Entregar</button>`, { atras: desde });
  cuerpo.querySelectorAll('[data-cq]').forEach((b) => b.addEventListener('click', () => {
    cantidad = Math.min(max, Math.max(1, cantidad + Number(b.dataset.cq))); $('eCantidad').textContent = cantidad;
  }));
  $('eConfirmar').addEventListener('click', async () => {
    const btn = $('eConfirmar'); btn.disabled = true;
    try {
      await rpc('v2_assign_equipment', {
        organization_id: ctx.organization_id, item_id: item.id,
        assigned_to_user_id: persona.id || null, assigned_to_label: persona.id ? null : persona.nombre,
        quantity: unidad ? 1 : cantidad, notes: $('eNota').value.trim() || null, equipment_unit_id: unidad?.id || null,
      });
      cierraHoja(); await loadAdmin(); repinta();
      aviso(`Entregado: ${unidad ? unidad.code : `${cantidad} ${item.name}`} a ${persona.nombre}`);
    } catch (err) { $('eError').textContent = friendly(err); btn.disabled = false; }
  });
}

/* ---------- Quién lo tiene ---------- */
function pintaQuien() {
  const gente = personas();
  $('utPanel').innerHTML = gente.length ? `<div class="ut-gente">${gente.map((p) => `
    <article class="ut-persona-card">
      <header><span class="ut-avatar grande">${esc(iniciales(p.nombre))}</span>
        <div><strong>${esc(p.nombre)}</strong><small>${plural(p.filas.reduce((s, a) => s + Number(a.quantity || 0), 0), 'pieza', 'piezas')}</small></div>
        ${p.filas.length > 1 ? `<button type="button" class="ut-btn chico" data-todo="${esc(p.clave)}">Devolvió todo</button>` : ''}</header>
      ${p.filas.map((a) => { const it = items.find((i) => i.id === a.equipment_item_id);
        return `<div class="ut-fila">${foto(fotoDe(it), a.item_name, 'chica')}
          <span class="ut-fila-txt"><strong>${esc(a.item_name)}</strong><small>${a.unit_code ? esc(a.unit_code) : plural(Number(a.quantity || 0), 'pieza', 'piezas')} · desde ${esc(fecha(a.assigned_at))}${a.notes ? ` · ${esc(a.notes)}` : ''}</small></span>
          <button type="button" class="ut-btn chico" data-devuelve="${esc(a.id)}">Devolvió</button></div>`; }).join('')}
    </article>`).join('')}</div>`
    : `<div class="ut-vacio grande"><strong>Todo está en bodega</strong><p>Cuando entregues algo, aquí verás quién lo tiene.</p><button type="button" class="ut-btn primario" id="utVacioEntregar">Entregar algo</button></div>`;
  $('utVacioEntregar')?.addEventListener('click', () => entregar());
  $('utPanel').querySelectorAll('[data-devuelve]').forEach((b) => b.addEventListener('click', () => devolver(assignments.find((a) => a.id === b.dataset.devuelve))));
  $('utPanel').querySelectorAll('[data-todo]').forEach((b) => b.addEventListener('click', () => devolverTodo(gente.find((p) => p.clave === b.dataset.todo))));
  firmaFotos($('utPanel'));
}
async function devolver(a, despues = null) {
  if (!a) return;
  const ok = await tosConfirm({ kicker: 'UTILERÍA', title: '¿Ya lo devolvió?', message: `${a.unit_code || `${Number(a.quantity || 0)} × ${a.item_name}`} de ${a.recipient_name}. Regresa a la bodega.`, confirmText: 'Sí, lo devolvió' });
  if (!ok) return;
  try {
    await rpc('v2_return_equipment', { organization_id: ctx.organization_id, assignment_id: a.id, notes: 'Devolución registrada desde TannerOS' });
    await loadAdmin(); repinta(); aviso(`${a.item_name} regresó a la bodega`);
    if (despues) despues();
  } catch (err) { await tosAlert({ kicker: 'UTILERÍA', title: 'No se pudo registrar la devolución', message: friendly(err) }); }
}
async function devolverTodo(p) {
  if (!p) return;
  const ok = await tosConfirm({ kicker: 'UTILERÍA', title: `¿${p.nombre} devolvió todo?`, message: `${plural(p.filas.length, 'artículo regresa', 'artículos regresan')} a la bodega.`, confirmText: 'Sí, todo' });
  if (!ok) return;
  try {
    for (const a of p.filas) await rpc('v2_return_equipment', { organization_id: ctx.organization_id, assignment_id: a.id, notes: 'Devolución registrada desde TannerOS' });
    await loadAdmin(); repinta(); aviso(`Todo lo de ${p.nombre} regresó a la bodega`);
  } catch (err) { await loadAdmin(); repinta(); await tosAlert({ kicker: 'UTILERÍA', title: 'No se pudo registrar todo', message: friendly(err) }); }
}

/* ---------- Reportes ---------- */
const TIPO = { perdido: 'Perdido', danado: 'Dañado', roto: 'Roto', faltante: 'Me falta', reposicion: 'Reposición', material_adicional: 'Pide material' };
const ESTADO = { pendiente: 'Nuevo', aprobado: 'Aprobado', rechazado: 'Rechazado', en_reparacion: 'En reparación', resuelto: 'Resuelto', cerrado: 'Cerrado' };
function tarjetaReporte(r, conAcciones) {
  const it = items.find((i) => i.id === r.equipment_item_id);
  const titulo = r.item_name ? `${r.item_name}${r.unit_code ? ` · ${r.unit_code}` : ''}` : 'Solicitud de material';
  const abierto = ABIERTOS.includes(r.status);
  return `<article class="ut-reporte ${abierto ? 'abierto' : ''}" data-reporte="${esc(r.id)}">
    <header>${foto(r.photo_thumb_path || r.photo_path || fotoDe(it), titulo, 'chica')}
      <div><strong>${esc(titulo)}</strong><small>${esc(TIPO[r.report_type] || r.report_type)}${Number(r.quantity || 0) > 1 ? ` · ${r.quantity} piezas` : ''}</small></div>
      <em class="ut-pill ${{ pendiente: 'ambar', en_reparacion: 'azul', aprobado: 'azul', resuelto: 'verde', cerrado: 'gris', rechazado: 'gris' }[r.status] || 'gris'}">${esc(ESTADO[r.status] || r.status)}</em></header>
    ${r.reason ? `<p>${esc(r.reason)}</p>` : ''}${r.comment ? `<p class="ut-nota">${esc(r.comment)}</p>` : ''}
    <small class="ut-quien">${esc(r.reporter_name || '—')} · ${esc(fechaHora(r.created_at))}</small>
    ${r.resolution_note ? `<small class="ut-quien">Respuesta: ${esc(r.resolution_note)}</small>` : ''}
    ${conAcciones && abierto ? `<div class="ut-acciones-reporte">
      ${r.status !== 'en_reparacion' && ['danado', 'roto'].includes(r.report_type) ? '<button type="button" class="ut-btn chico" data-estado="en_reparacion">En reparación</button>' : ''}
      <button type="button" class="ut-btn chico verde" data-estado="resuelto">Resuelto</button>
      <button type="button" class="ut-btn chico" data-estado="rechazado">Rechazar</button></div>` : ''}
  </article>`;
}
function pintaReportes() {
  const lista = reports.filter((r) => (filtroReportes === 'abiertos' ? ABIERTOS.includes(r.status) : !ABIERTOS.includes(r.status)))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const nAb = abiertos().length, nCe = reports.length - nAb;
  $('utPanel').innerHTML = `
    <div class="ut-chips">
      <button type="button" class="ut-chip${filtroReportes === 'abiertos' ? ' activa' : ''}" data-fr="abiertos">Por atender <small>${nAb}</small></button>
      <button type="button" class="ut-chip${filtroReportes === 'cerrados' ? ' activa' : ''}" data-fr="cerrados">Atendidos <small>${nCe}</small></button>
    </div>
    ${lista.length ? `<div class="ut-reportes">${lista.map((r) => tarjetaReporte(r, true)).join('')}</div>`
      : `<div class="ut-vacio grande"><strong>${filtroReportes === 'abiertos' ? 'Nada pendiente' : 'Aún no hay reportes atendidos'}</strong><p>Los profes reportan desde su "Mi utilería" lo dañado, roto, perdido o lo que les falta.</p></div>`}`;
  $('utPanel').querySelectorAll('[data-fr]').forEach((b) => b.addEventListener('click', () => { filtroReportes = b.dataset.fr; pintaReportes(); }));
  $('utPanel').querySelectorAll('[data-estado]').forEach((b) => b.addEventListener('click', async () => {
    const id = b.closest('[data-reporte]').dataset.reporte, status = b.dataset.estado;
    let nota = null;
    if (status === 'rechazado') {
      nota = await (window.tosPrompt ? window.tosPrompt({ kicker: 'UTILERÍA', title: '¿Por qué se rechaza?', message: 'El profe lo verá en su reporte.', placeholder: 'Ej. Ya se repuso la semana pasada' }) : Promise.resolve(prompt('¿Por qué se rechaza?') || ''));
      if (nota === null) return;
    }
    b.disabled = true;
    try {
      await rpc('v2_resolve_equipment_report', { organization_id: ctx.organization_id, report_id: id, status, resolution_note: nota || null });
      await loadAdmin(); repinta(); aviso(`Reporte: ${ESTADO[status].toLocaleLowerCase('es-MX')}`);
    } catch (err) { b.disabled = false; await tosAlert({ kicker: 'UTILERÍA', title: 'No se pudo guardar', message: friendly(err) }); }
  }));
  firmaFotos($('utPanel'));
}

/* =========================================================
   EL PROFE — "Mi utilería"
   ========================================================= */
async function loadCoach() {
  const [k, r] = await Promise.all([
    rpc('v2_my_equipment_kit', { organization_id: ctx.organization_id }),
    rpc('v2_my_equipment_reports', { organization_id: ctx.organization_id }),
  ]);
  myKit = Array.isArray(k) ? k : [];
  myReports = Array.isArray(r) ? r : [];
  pintaCoach();
}
const fotoKit = (k) => k.unit_photo_thumb_path || k.unit_photo_path || k.item_photo_thumb_path || k.item_photo_path || null;
function pintaCoach() {
  $('utResumen').textContent = myKit.length ? `${plural(myKit.reduce((s, k) => s + Number(k.quantity || 0), 0), 'pieza', 'piezas')} a tu cargo` : 'No tienes material a tu cargo';
  $('utPanel').innerHTML = `
    <div class="ut-grid">${myKit.map((k) => `<button type="button" class="ut-card" data-kit="${esc(k.id)}">${foto(fotoKit(k), k.item_name)}
      <span class="ut-card-txt"><strong>${esc(k.item_name)}</strong><span class="ut-card-num">${k.unit_code ? esc(k.unit_code) : `<b>${Number(k.quantity || 0)}</b> contigo`}</span><small>Toca si algo pasó</small></span></button>`).join('')}
      <button type="button" class="ut-card nueva" id="utPedir"><span class="ut-mas">+</span><strong>Pedir material</strong></button></div>
    ${myReports.length ? `<h2 class="ut-subtitulo">Mis reportes</h2><div class="ut-reportes">${myReports.map((r) => tarjetaReporte(r, false)).join('')}</div>` : ''}`;
  $('utPanel').querySelectorAll('[data-kit]').forEach((b) => b.addEventListener('click', () => reportar(myKit.find((k) => k.id === b.dataset.kit))));
  $('utPedir').addEventListener('click', () => pedirMaterial());
  firmaFotos($('utPanel'));
}
function reportar(k) {
  const cuerpo = abreHoja(k.item_name, `
    <p class="ut-paso">¿Qué pasó?</p>
    <div class="ut-motivos">
      ${[['danado', 'Se dañó'], ['roto', 'Se rompió'], ['perdido', 'Se perdió'], ['faltante', 'Me falta'], ['reposicion', 'Necesito reposición']].map(([t, l]) =>
        `<button type="button" class="ut-opcion grande" data-tipo="${t}"><strong>${l}</strong></button>`).join('')}
    </div>`);
  cuerpo.querySelectorAll('[data-tipo]').forEach((b) => b.addEventListener('click', () => detalleReporte(k, b.dataset.tipo)));
}
function detalleReporte(k, tipo, libre = false) {
  let cantidad = 1, archivo = null;
  const cuerpo = abreHoja(libre ? 'Pedir material' : `${TIPO[tipo]} · ${k.item_name}`, `
    <form id="rForm" class="ut-form">
      ${libre ? '<label class="ut-campo"><span>¿Qué necesitas?</span><input id="rQue" required maxlength="160" placeholder="2 conos, un peto talla M…"></label>' : ''}
      <div class="ut-campo"><span>Cuántos</span><div class="ut-ajuste"><button type="button" data-rq="-1" aria-label="Uno menos">&minus;</button><output id="rCantidad">1</output><button type="button" data-rq="1" aria-label="Uno más">+</button></div></div>
      <label class="ut-campo"><span>Cuéntanos <small>opcional</small></span><input id="rMotivo" maxlength="300" placeholder="${libre ? 'Para el entrenamiento de T10' : 'Se ponchó en el entrenamiento'}"></label>
      <label class="ut-subefoto chica"><span>Agregar foto <small>opcional</small></span><input type="file" accept="image/*" id="rFoto"></label>
      <p class="ut-error" id="rError" role="alert"></p>
      <button type="submit" class="ut-btn primario" id="rEnviar">Enviar</button>
    </form>`, { atras: libre ? null : () => reportar(k) });
  cuerpo.querySelectorAll('[data-rq]').forEach((b) => b.addEventListener('click', () => { cantidad = Math.max(1, cantidad + Number(b.dataset.rq)); $('rCantidad').textContent = cantidad; }));
  $('rFoto').addEventListener('change', (e) => { archivo = e.target.files?.[0] || null; });
  $('rForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('rEnviar'); btn.disabled = true; $('rError').textContent = '';
    try {
      let f = {};
      if (archivo) { const up = await uploadPhoto(`organizations/${ctx.organization_id}/equipment/reports/reporte-${Date.now()}`, archivo); f = { photo_path: up.path, photo_thumb_path: up.thumbPath, photo_bucket: PHOTO_BUCKET }; }
      const motivo = $('rMotivo').value.trim();
      await rpc('v2_report_equipment_issue', {
        organization_id: ctx.organization_id, item_id: libre ? null : k.equipment_item_id, unit_id: libre ? null : (k.equipment_unit_id || null),
        report_type: tipo, quantity: cantidad, reason: libre ? [$('rQue').value.trim(), motivo].filter(Boolean).join(' — ') : (motivo || null),
        photo_path: f.photo_path || null, photo_bucket: f.photo_bucket || null, comment: null, photo_thumb_path: f.photo_thumb_path || null,
      });
      cierraHoja(); await loadCoach(); aviso('Enviado. Administración lo va a revisar.');
    } catch (err) { $('rError').textContent = friendly(err); btn.disabled = false; }
  });
}
function pedirMaterial() { detalleReporte({}, 'material_adicional', true); }

boot().catch((e) => { $('deniedText').textContent = friendly(e); show('deniedView'); });
