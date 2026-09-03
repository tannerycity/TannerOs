import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  'https://pacnegivzgxpanphrnwp.supabase.co',
  'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',
  { auth: { persistSession: true, autoRefreshToken: true } }
);

const PHOTO_BUCKET = 'tanneros-private';
const $ = (id) => document.getElementById(id);
const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let ctx = null;
let canWrite = false;
let items = [];
let assignments = [];
let coaches = [];
let reports = [];
let myKit = [];
let myReports = [];
let editingItemId = null;
let itemPhotoFile = null;
let reportPhotoFile = null;
let currentReportPreset = 'problema';

function show(id) { ['loadingView', 'deniedView', 'view'].forEach((v) => $(v)?.classList.toggle('hidden', v !== id)); }
function msg(id, text = '', type = 'error') { const e = $(id); if (!e) return; e.textContent = text; e.dataset.type = type; e.classList.toggle('hidden', !text); }
async function rpc(name, params = {}) { const { data, error } = await supabase.rpc(name, params); if (error) throw error; return data; }
function fmtDate(v) { if (!v) return '—'; return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(v)); }

function friendly(error) {
  const message = String(error?.message || error || 'Ocurrió un error.');
  const map = {
    'Not authorized': 'No tienes permiso para hacer esto.',
    'Item name required': 'Escribe un nombre para el artículo.',
    'Inventory quantities cannot be negative': 'Las cantidades no pueden ser negativas.',
    'Unit cost cannot be negative': 'El costo no puede ser negativo.',
    'Invalid equipment status': 'Estado de artículo inválido.',
    'Invalid control type': 'Tipo de control inválido.',
    'Quantity cannot be lower than currently assigned quantity': 'No puedes bajar la cantidad por debajo de lo ya asignado.',
    'Equipment item not found': 'No encontramos ese artículo.',
    'Item is not tracked as individual units': 'Ese artículo se maneja por cantidad, no por unidades.',
    'Unit code required': 'Escribe un identificador para la unidad (ej. Balón #025).',
    'Invalid unit status': 'Estado de unidad inválido.',
    'Use the assignment flow to assign a unit': 'Para asignar esta unidad, usa el formulario de Bodega.',
    'Equipment unit not found': 'No encontramos esa unidad.',
    'Equipment unit not available': 'Esa unidad ya está asignada o no está disponible.',
    'Assignment recipient required': 'Escribe o selecciona quién recibe el material.',
    'Equipment item unavailable': 'Ese artículo ya no está disponible.',
    'Not enough equipment available': 'No hay suficiente material disponible.',
    'Active assignment not found': 'No encontramos esa asignación activa.',
    'Invalid report type': 'Tipo de reporte inválido.',
    'Item or unit required': 'Selecciona un artículo.',
    'Invalid report status': 'Estado de reporte inválido.',
    'Report not found': 'No encontramos ese reporte.',
    'Invalid photo path': 'No pudimos validar la foto.',
    'row-level security': 'No tienes permiso para hacer esto.',
  };
  for (const key in map) if (message.includes(key)) return map[key];
  return message;
}

/* ---------- fotos (mismo patrón que Jugadores/Patrocinadores) ---------- */
function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No pudimos leer esa foto. Prueba con JPG, PNG o WebP.')); };
    img.src = url;
  });
}
function canvasBlobFrom(canvas, type, quality) { return new Promise((resolve) => canvas.toBlob(resolve, type, quality)); }
async function preparePhotoFile(file) {
  if (!file) throw new Error('Selecciona una foto.');
  if (file.type && !String(file.type).startsWith('image/')) throw new Error('Selecciona una imagen válida.');
  const img = await loadImageFile(file);
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  if (!width || !height) throw new Error('No pudimos leer el tamaño de esa foto.');
  const maxSide = 1200;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Tu navegador no pudo preparar la foto.');
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  let blob = await canvasBlobFrom(canvas, 'image/webp', 0.82);
  let ext = 'webp';
  if (!blob) { blob = await canvasBlobFrom(canvas, 'image/jpeg', 0.82); ext = 'jpg'; }
  if (blob && blob.size > 5 * 1024 * 1024) { blob = await canvasBlobFrom(canvas, 'image/jpeg', 0.65); ext = 'jpg'; }
  if (!blob || blob.size > 5 * 1024 * 1024) throw new Error('La foto es demasiado pesada. Prueba con una imagen más pequeña.');
  return { blob, ext, mime: blob.type || (ext === 'jpg' ? 'image/jpeg' : 'image/webp') };
}
async function uploadPhoto(pathPrefix, file) {
  const prepared = await preparePhotoFile(file);
  const path = `${pathPrefix}-${Date.now()}.${prepared.ext}`;
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, prepared.blob, { contentType: prepared.mime, cacheControl: '3600', upsert: false });
  if (error) throw error;
  return path;
}
async function signedPhoto(bucket, path) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(bucket || PHOTO_BUCKET).createSignedUrl(path, 600);
  if (error) return null;
  return data?.signedUrl || null;
}
function hydratePhoto(boxEl, bucket, path, alt) {
  if (!boxEl || !path) return;
  signedPhoto(bucket, path).then((url) => { if (url) boxEl.innerHTML = `<img src="${url}" alt="${esc(alt || '')}">`; });
}

function writeControls() {
  document.querySelectorAll('.write-only').forEach((el) => el.classList.toggle('hidden', !canWrite));
}

/* ---------- boot ---------- */
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
  writeControls();

  if (canWrite) {
    $('adminView').classList.remove('hidden');
    $('heroSubtitle').textContent = 'Qué tenemos, cuánto tenemos, dónde está y quién lo tiene.';
    bindAdminEvents();
    await loadAdmin();
  } else {
    $('coachView').classList.remove('hidden');
    $('heroTitle').textContent = 'Mi Utilería';
    $('heroSubtitle').textContent = 'Tu material asignado. Reporta un problema o pide lo que te falte.';
    bindCoachEvents();
    await loadCoach();
  }
  show('view');
}

/* =========================================================
   ADMIN
   ========================================================= */
async function loadAdmin() {
  [items, assignments, coaches, reports] = await Promise.all([
    rpc('v2_equipment_items', { organization_id: ctx.organization_id }),
    rpc('v2_equipment_assignments', { organization_id: ctx.organization_id, active_only: true }),
    rpc('v2_equipment_coaches', { organization_id: ctx.organization_id }),
    rpc('v2_equipment_reports', { organization_id: ctx.organization_id }),
  ]);
  items = Array.isArray(items) ? items : [];
  assignments = Array.isArray(assignments) ? assignments : [];
  coaches = Array.isArray(coaches) ? coaches : [];
  reports = Array.isArray(reports) ? reports : [];
  const value = await rpc('v2_equipment_inventory_value', { organization_id: ctx.organization_id }).catch(() => []);
  renderKpis(Array.isArray(value) ? value : []);
  renderCategoryDatalist();
  renderItemsTable();
  renderAssignSelects();
  renderBodega();
  renderKits();
  renderReports();
}

function renderKpis(value) {
  $('kpiItems').textContent = items.length;
  $('kpiUnits').textContent = items.reduce((s, i) => s + Number(i.quantity || 0), 0);
  $('kpiAssigned').textContent = items.reduce((s, i) => s + Number(i.assigned_quantity || 0), 0);
  const lowItems = items.filter((i) => i.needs_reorder);
  $('kpiLow').textContent = lowItems.length;
  const totalValue = value.reduce((s, v) => s + Number(v.estimated_value || 0), 0);
  $('kpiValue').textContent = money.format(totalValue);

  const reorderBox = $('reorderList');
  reorderBox.innerHTML = '';
  $('reorderEmpty').classList.toggle('hidden', lowItems.length > 0);
  lowItems.forEach((i) => {
    const row = document.createElement('div');
    row.className = 'mini-row';
    row.innerHTML = `<strong>${esc(i.name)}</strong><span>${Number(i.available_quantity || 0)} de ${Number(i.quantity || 0)} disponibles</span>`;
    reorderBox.appendChild(row);
  });

  const valueBox = $('valueList');
  valueBox.innerHTML = '';
  $('valueEmpty').classList.toggle('hidden', value.length > 0);
  value.forEach((v) => {
    const row = document.createElement('div');
    row.className = 'mini-row';
    row.innerHTML = `<strong>${esc(v.category)}</strong><span>${Number(v.units || 0)} unidades · ${money.format(Number(v.estimated_value || 0))}</span>`;
    valueBox.appendChild(row);
  });

  const pending = reports.filter((r) => r.status === 'pendiente' || r.status === 'en_reparacion').length;
  $('incidenciasBadge').textContent = pending;
  $('incidenciasBadge').classList.toggle('hidden', pending === 0);
}

function renderCategoryDatalist() {
  const list = $('categoryOptions');
  const cats = [...new Set(items.map((i) => i.category).filter(Boolean))].sort();
  list.innerHTML = cats.map((c) => `<option value="${esc(c)}">`).join('');
}

function stateFor(i) {
  if (i.needs_reorder) return { label: 'Reponer', cls: 'low' };
  if (Number(i.available_quantity || 0) === 0) return { label: 'Sin disponible', cls: 'empty-stock' };
  return { label: 'OK', cls: 'ok' };
}

function renderItemsTable() {
  const body = $('itemsBody');
  body.innerHTML = '';
  const term = ($('itemSearch').value || '').trim().toLowerCase();
  const filtered = items.filter((i) => !term || String(i.name || '').toLowerCase().includes(term) || String(i.category || '').toLowerCase().includes(term));
  $('itemsEmpty').classList.toggle('hidden', items.length > 0);
  filtered.forEach((i) => {
    const state = stateFor(i);
    const meta = [i.category, i.location, i.unit_cost != null ? money.format(Number(i.unit_cost)) : null].filter(Boolean).map(esc).join(' · ');
    const tr = document.createElement('tr');
    tr.className = 'item-row';
    tr.dataset.id = i.id;
    tr.innerHTML = `
      <td class="thumb-cell"><div class="photo-box tiny" data-photo-for="${i.id}">${i.photo_path ? '' : '—'}</div></td>
      <td><strong>${esc(i.name || 'Artículo')}</strong><small>${meta}</small></td>
      <td><span class="control-badge ${i.control_type}">${i.control_type === 'individual' ? 'Individual' : 'Por cantidad'}</span></td>
      <td>${Number(i.quantity || 0)}</td>
      <td>${Number(i.assigned_quantity || 0)}</td>
      <td><strong>${Number(i.available_quantity || 0)}</strong></td>
      <td><span class="stock-state ${state.cls}">${state.label}</span></td>`;
    body.appendChild(tr);
    if (i.photo_path) hydratePhoto(tr.querySelector(`[data-photo-for="${i.id}"]`), i.photo_bucket, i.photo_path, i.name);
    if (canWrite) tr.addEventListener('click', () => toggleItemDetail(tr, i));
  });
}

async function toggleItemDetail(tr, item) {
  const next = tr.nextElementSibling;
  if (next && next.classList.contains('item-detail-row')) { next.remove(); return; }
  document.querySelectorAll('.item-detail-row').forEach((r) => r.remove());
  const detailTr = document.createElement('tr');
  detailTr.className = 'item-detail-row';
  const td = document.createElement('td');
  td.colSpan = 7;
  detailTr.appendChild(td);
  tr.after(detailTr);
  td.innerHTML = '<div class="detail-loading">Cargando…</div>';

  const actions = document.createElement('div');
  actions.className = 'detail-actions';
  actions.innerHTML = `<button class="secondary mini" data-act="edit">Editar artículo</button><button class="secondary mini" data-act="history">Ver historial</button>`;
  actions.querySelector('[data-act="edit"]').addEventListener('click', (e) => { e.stopPropagation(); startEditItem(item); });
  actions.querySelector('[data-act="history"]').addEventListener('click', async (e) => { e.stopPropagation(); await showItemHistory(td, item.id); });

  if (item.control_type === 'individual') {
    const units = await rpc('v2_equipment_units', { organization_id: ctx.organization_id, item_id: item.id }).catch(() => []);
    td.innerHTML = '';
    td.appendChild(actions);
    const wrap = document.createElement('div');
    wrap.className = 'units-wrap';
    wrap.innerHTML = `<div class="units-head">Unidades (${units.length})</div><div class="units-list"></div>
      <form class="unit-form">
        <input class="unit-code" maxlength="60" placeholder="Ej. Balón #025" required>
        <input class="unit-condition" maxlength="60" placeholder="Estado físico (opcional)">
        <button class="secondary mini" type="submit">+ Agregar unidad</button>
      </form>`;
    const list = wrap.querySelector('.units-list');
    units.forEach((u) => {
      const row = document.createElement('div');
      row.className = `unit-row status-${u.status}`;
      row.innerHTML = `<strong>${esc(u.code)}</strong><span class="unit-status">${unitStatusLabel(u.status)}</span><span>${esc(u.holder_name || '—')}</span>`;
      list.appendChild(row);
    });
    wrap.querySelector('.unit-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = wrap.querySelector('.unit-code').value.trim();
      const condition = wrap.querySelector('.unit-condition').value.trim();
      if (!code) return;
      try {
        await rpc('v2_upsert_equipment_unit', { organization_id: ctx.organization_id, unit_id: null, item_id: item.id, code, status: 'bodega', condition: condition || null, notes: null });
        await loadAdmin();
      } catch (err) { alert(friendly(err)); }
    });
    td.appendChild(wrap);
  } else {
    td.innerHTML = '';
    td.appendChild(actions);
    const note = document.createElement('div');
    note.className = 'muted tiny detail-note';
    note.textContent = 'Este artículo se controla por cantidad total, sin unidades individuales.';
    td.appendChild(note);
  }
}

function unitStatusLabel(s) { return { bodega: 'En bodega', asignado: 'Asignado', mantenimiento: 'Mantenimiento', baja: 'Baja' }[s] || s; }

async function showItemHistory(td, itemId) {
  const events = await rpc('v2_equipment_history', { organization_id: ctx.organization_id, item_id: itemId, unit_id: null }).catch(() => []);
  const box = document.createElement('div');
  box.className = 'history-list';
  box.innerHTML = `<div class="units-head">Historial</div>` + (events.length ? events.map((e) => `<div class="history-row"><strong>${esc(historyLabel(e.event_type))}</strong><span>${esc(e.actor_name || '—')} · ${esc(fmtDate(e.occurred_at))}</span></div>`).join('') : '<div class="muted tiny">Sin movimientos todavía.</div>');
  td.appendChild(box);
}
function historyLabel(t) {
  return {
    EquipmentItemCreated: 'Alta de artículo', EquipmentItemUpdated: 'Ajuste de inventario',
    EquipmentUnitCreated: 'Alta de unidad', EquipmentUnitUpdated: 'Actualización de unidad',
    EquipmentAssigned: 'Entrega', EquipmentReturned: 'Devolución',
    EquipmentIssueReported: 'Incidencia reportada', EquipmentReportResolved: 'Incidencia resuelta',
  }[t] || t;
}

function startEditItem(item) {
  editingItemId = item.id;
  $('itemForm').classList.remove('hidden');
  $('toggleItemForm').textContent = 'Cerrar formulario';
  $('itemId').value = item.id;
  $('itemName').value = item.name || '';
  $('itemSku').value = item.sku || '';
  $('itemCategory').value = item.category || '';
  $('itemControlType').value = item.control_type || 'cantidad';
  $('itemQuantity').value = item.quantity || 0;
  $('itemMinStock').value = item.min_stock || 0;
  $('itemCost').value = item.unit_cost ?? '';
  $('itemLocation').value = item.location || '';
  $('itemNotes').value = item.notes || '';
  itemPhotoFile = null;
  $('itemPhotoBox').innerHTML = 'Sin foto';
  if (item.photo_path) hydratePhoto($('itemPhotoBox'), item.photo_bucket, item.photo_path, item.name);
  $('itemForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function resetItemForm() {
  editingItemId = null;
  itemPhotoFile = null;
  $('itemForm').reset();
  $('itemId').value = '';
  $('itemQuantity').value = '0';
  $('itemMinStock').value = '0';
  $('itemPhotoBox').innerHTML = 'Sin foto';
}

function renderAssignSelects() {
  const itemSel = $('assignItem');
  const current = itemSel.value;
  itemSel.innerHTML = '<option value="">Selecciona</option>';
  items.filter((i) => i.status === 'active' && (i.control_type === 'individual' ? Number(i.units_bodega || 0) > 0 : Number(i.available_quantity || 0) > 0)).forEach((i) => {
    const avail = i.control_type === 'individual' ? Number(i.units_bodega || 0) : Number(i.available_quantity || 0);
    const o = document.createElement('option');
    o.value = i.id;
    o.dataset.control = i.control_type;
    o.textContent = `${i.name || 'Artículo'} · ${avail} disponibles`;
    itemSel.appendChild(o);
  });
  if (current && items.some((i) => i.id === current)) itemSel.value = current;

  const coachSel = $('assignCoach');
  const currentCoach = coachSel.value;
  coachSel.innerHTML = '<option value="">Selecciona un entrenador…</option><option value="__other__">Otro (escribir nombre)</option>';
  coaches.forEach((c) => {
    const o = document.createElement('option');
    o.value = c.user_id;
    o.textContent = c.display_name || 'Sin nombre';
    coachSel.appendChild(o);
  });
  if (currentCoach) coachSel.value = currentCoach;

  updateAssignUnitField();
}

async function updateAssignUnitField() {
  const itemSel = $('assignItem');
  const opt = itemSel.selectedOptions[0];
  const isIndividual = opt && opt.dataset.control === 'individual';
  $('assignUnitField').classList.toggle('hidden', !isIndividual);
  $('assignQuantityField').classList.toggle('hidden', isIndividual);
  const unitSel = $('assignUnit');
  unitSel.innerHTML = '<option value="">Selecciona una unidad</option>';
  if (isIndividual && itemSel.value) {
    const units = await rpc('v2_equipment_units', { organization_id: ctx.organization_id, item_id: itemSel.value }).catch(() => []);
    units.filter((u) => u.status === 'bodega').forEach((u) => {
      const o = document.createElement('option');
      o.value = u.id;
      o.textContent = u.code;
      unitSel.appendChild(o);
    });
  }
}

function renderBodega() {
  const box = $('bodegaList');
  box.innerHTML = '';
  const stocked = items.filter((i) => i.status === 'active' && (i.control_type === 'individual' ? Number(i.units_bodega || 0) > 0 : Number(i.available_quantity || 0) > 0));
  $('bodegaEmpty').classList.toggle('hidden', stocked.length > 0);
  stocked.forEach((i) => {
    const avail = i.control_type === 'individual' ? Number(i.units_bodega || 0) : Number(i.available_quantity || 0);
    const card = document.createElement('article');
    card.className = 'bodega-card';
    card.innerHTML = `<div class="photo-box small" data-photo-for="bodega-${i.id}">${i.photo_path ? '' : (i.name || '?').slice(0, 1)}</div>
      <div><strong>${esc(i.name)}</strong><span>${avail} disponible${avail === 1 ? '' : 's'} · ${i.control_type === 'individual' ? 'Individual' : 'Por cantidad'}</span></div>
      <button class="secondary mini" type="button">Entregar</button>`;
    card.querySelector('button').addEventListener('click', () => { $('assignItem').value = i.id; updateAssignUnitField(); document.querySelector('[data-tab="bodega"]').click(); $('assignForm').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
    box.appendChild(card);
    if (i.photo_path) hydratePhoto(card.querySelector(`[data-photo-for="bodega-${i.id}"]`), i.photo_bucket, i.photo_path, i.name);
  });
}

function renderKits() {
  const box = $('kitsList');
  box.innerHTML = '';
  const groups = new Map();
  assignments.forEach((a) => {
    const key = a.assigned_to_user_id || `label:${a.assigned_to_label || 'Sin responsable'}`;
    if (!groups.has(key)) groups.set(key, { name: a.recipient_name || 'Sin responsable', rows: [] });
    groups.get(key).rows.push(a);
  });
  $('kitsEmpty').classList.toggle('hidden', groups.size > 0);
  groups.forEach((group) => {
    const card = document.createElement('article');
    card.className = 'kit-card';
    const rowsHtml = group.rows.map((a) => `
      <div class="kit-row" data-assignment="${a.id}">
        <div><strong>${esc(a.item_name)}</strong><span>${a.unit_code ? esc(a.unit_code) : `${Number(a.quantity || 0)} unidad${Number(a.quantity) === 1 ? '' : 'es'}`} · ${esc(fmtDate(a.assigned_at))}</span>${a.notes ? `<small>${esc(a.notes)}</small>` : ''}</div>
        <button class="secondary mini return-btn" type="button">Devolución</button>
      </div>`).join('');
    card.innerHTML = `<div class="kit-card-head"><strong>${esc(group.name)}</strong><span>${group.rows.length} artículo${group.rows.length === 1 ? '' : 's'}</span></div>${rowsHtml}`;
    card.querySelectorAll('.return-btn').forEach((btn, idx) => btn.addEventListener('click', () => returnAssignment(group.rows[idx])));
    box.appendChild(card);
  });
}

async function returnAssignment(a) {
  if (!canWrite) return;
  if (!confirm(`¿Registrar devolución de ${a.unit_code || `${Number(a.quantity || 0)} × ${a.item_name}`} de ${a.recipient_name}?`)) return;
  try { await rpc('v2_return_equipment', { organization_id: ctx.organization_id, assignment_id: a.id, notes: 'Devolución registrada desde TannerOS' }); await loadAdmin(); }
  catch (err) { alert(friendly(err)); }
}

const REPORT_TYPE_LABEL = { perdido: 'Perdido', danado: 'Dañado', roto: 'Roto', faltante: 'Faltante', reposicion: 'Reposición', material_adicional: 'Material adicional' };
const REPORT_STATUS_LABEL = { pendiente: 'Pendiente', aprobado: 'Aprobado', rechazado: 'Rechazado', en_reparacion: 'En reparación', resuelto: 'Resuelto', cerrado: 'Cerrado' };

function renderReports() {
  const box = $('reportsList');
  box.innerHTML = '';
  const filterVal = $('reportStatusFilter').value;
  const filtered = reports.filter((r) => !filterVal || r.status === filterVal);
  $('reportsEmpty').classList.toggle('hidden', reports.length > 0);
  filtered.forEach((r) => {
    const card = document.createElement('article');
    card.className = `report-card status-${r.status}`;
    const target = r.item_name ? `${esc(r.item_name)}${r.unit_code ? ` · ${esc(r.unit_code)}` : ''}` : 'Solicitud general';
    card.innerHTML = `
      <div class="report-head">
        <div><strong>${target}</strong><span class="report-type-badge">${REPORT_TYPE_LABEL[r.report_type] || r.report_type}</span></div>
        <span class="report-status-badge status-${r.status}">${REPORT_STATUS_LABEL[r.status] || r.status}</span>
      </div>
      <div class="report-body">
        ${r.reason ? `<p>${esc(r.reason)}</p>` : ''}
        ${r.comment ? `<p class="muted tiny">${esc(r.comment)}</p>` : ''}
        <div class="photo-box tiny report-photo hidden"></div>
        <small class="muted">Reportado por ${esc(r.reporter_name || '—')} · ${esc(fmtDate(r.created_at))}</small>
        ${r.resolution_note ? `<small class="muted">Resolución: ${esc(r.resolution_note)}</small>` : ''}
      </div>
      <div class="report-actions write-only">
        <select class="resolve-status">${Object.entries(REPORT_STATUS_LABEL).map(([v, l]) => `<option value="${v}" ${v === r.status ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <input class="resolve-note" maxlength="300" placeholder="Nota (opcional)">
        <button class="secondary mini" type="button">Guardar</button>
      </div>`;
    if (r.photo_path) {
      const photoBox = card.querySelector('.report-photo');
      photoBox.classList.remove('hidden');
      hydratePhoto(photoBox, r.photo_bucket, r.photo_path, 'Evidencia');
    }
    card.querySelector('.report-actions button')?.addEventListener('click', async () => {
      const status = card.querySelector('.resolve-status').value;
      const note = card.querySelector('.resolve-note').value.trim();
      try { await rpc('v2_resolve_equipment_report', { organization_id: ctx.organization_id, report_id: r.id, status, resolution_note: note || null }); await loadAdmin(); }
      catch (err) { alert(friendly(err)); }
    });
    box.appendChild(card);
  });
  writeControls();
}

async function saveItem(e) {
  e.preventDefault();
  msg('itemMessage');
  const btn = $('saveItem');
  btn.disabled = true;
  try {
    let photoPath = null, photoBucket = null;
    if (itemPhotoFile) {
      const targetId = editingItemId || 'new';
      photoPath = await uploadPhoto(`organizations/${ctx.organization_id}/equipment/items/${targetId}/foto`, itemPhotoFile);
      photoBucket = PHOTO_BUCKET;
    }
    await rpc('v2_upsert_equipment_item', {
      organization_id: ctx.organization_id, item_id: editingItemId,
      sku: $('itemSku').value.trim() || null, name: $('itemName').value.trim(),
      category: $('itemCategory').value.trim() || null, quantity: Number($('itemQuantity').value || 0),
      min_stock: Number($('itemMinStock').value || 0), unit_cost: $('itemCost').value === '' ? null : Number($('itemCost').value),
      location: $('itemLocation').value.trim() || null, status: 'active', notes: $('itemNotes').value.trim() || null,
      control_type: $('itemControlType').value, photo_path: photoPath, photo_bucket: photoBucket,
    });
    msg('itemMessage', 'Artículo guardado.', 'success');
    resetItemForm();
    $('itemForm').classList.add('hidden');
    $('toggleItemForm').textContent = '+ Nuevo artículo';
    await loadAdmin();
  } catch (err) { msg('itemMessage', friendly(err)); }
  finally { btn.disabled = !canWrite; }
}

async function saveAssignment(e) {
  e.preventDefault();
  msg('assignMessage');
  const btn = $('saveAssignment');
  btn.disabled = true;
  try {
    const coachVal = $('assignCoach').value;
    const assignedUserId = coachVal && coachVal !== '__other__' ? coachVal : null;
    const assignedLabel = coachVal === '__other__' ? $('assignLabel').value.trim() : null;
    const unitId = $('assignUnitField').classList.contains('hidden') ? null : ($('assignUnit').value || null);
    await rpc('v2_assign_equipment', {
      organization_id: ctx.organization_id, item_id: $('assignItem').value,
      assigned_to_user_id: assignedUserId, assigned_to_label: assignedLabel,
      quantity: Number($('assignQuantity').value || 1), notes: $('assignNotes').value.trim() || null,
      equipment_unit_id: unitId,
    });
    msg('assignMessage', 'Material entregado.', 'success');
    e.target.reset();
    $('assignQuantity').value = '1';
    $('assignLabelField').classList.add('hidden');
    await loadAdmin();
  } catch (err) { msg('assignMessage', friendly(err)); }
  finally { btn.disabled = !canWrite; }
}

function bindAdminEvents() {
  document.querySelectorAll('#adminTabs .tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#adminTabs .tab').forEach((t) => t.classList.toggle('active', t === tab));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== tab.dataset.tab));
    });
  });
  $('toggleItemForm').addEventListener('click', () => {
    const hidden = $('itemForm').classList.toggle('hidden');
    $('toggleItemForm').textContent = hidden ? '+ Nuevo artículo' : 'Cerrar formulario';
    if (hidden) resetItemForm();
  });
  $('cancelItemEdit').addEventListener('click', () => { resetItemForm(); $('itemForm').classList.add('hidden'); $('toggleItemForm').textContent = '+ Nuevo artículo'; });
  $('itemForm').addEventListener('submit', saveItem);
  $('itemPhotoInput').addEventListener('change', (e) => {
    itemPhotoFile = e.target.files?.[0] || null;
    if (itemPhotoFile) { const url = URL.createObjectURL(itemPhotoFile); $('itemPhotoBox').innerHTML = `<img src="${url}" alt="">`; }
  });
  $('itemSearch').addEventListener('input', renderItemsTable);
  $('refreshInventory').addEventListener('click', loadAdmin);
  $('assignForm').addEventListener('submit', saveAssignment);
  $('assignItem').addEventListener('change', updateAssignUnitField);
  $('assignCoach').addEventListener('change', () => $('assignLabelField').classList.toggle('hidden', $('assignCoach').value !== '__other__'));
  $('reportStatusFilter').addEventListener('change', renderReports);
}

/* =========================================================
   ENTRENADOR — "Mi Utilería"
   ========================================================= */
async function loadCoach() {
  [myKit, myReports] = await Promise.all([
    rpc('v2_my_equipment_kit', { organization_id: ctx.organization_id }),
    rpc('v2_my_equipment_reports', { organization_id: ctx.organization_id }),
  ]);
  myKit = Array.isArray(myKit) ? myKit : [];
  myReports = Array.isArray(myReports) ? myReports : [];
  renderMyKit();
  renderMyReports();
  renderReportItemOptions();
}

function renderMyKit() {
  const box = $('myKitList');
  box.innerHTML = '';
  $('myKitEmpty').classList.toggle('hidden', myKit.length > 0);
  myKit.forEach((k) => {
    const card = document.createElement('article');
    card.className = 'kit-card';
    const photoPath = k.unit_photo_path || k.item_photo_path;
    const photoBucket = k.unit_photo_path ? k.unit_photo_bucket : k.item_photo_bucket;
    card.innerHTML = `<div class="kit-row">
        <div class="photo-box small" data-photo-for="mykit-${k.id}">${photoPath ? '' : (k.item_name || '?').slice(0, 1)}</div>
        <div><strong>${esc(k.item_name)}</strong><span>${k.unit_code ? esc(k.unit_code) : `${Number(k.quantity || 0)} unidad${Number(k.quantity) === 1 ? '' : 'es'}`} · desde ${esc(fmtDate(k.assigned_at))}</span></div>
      </div>`;
    box.appendChild(card);
    if (photoPath) hydratePhoto(card.querySelector(`[data-photo-for="mykit-${k.id}"]`), photoBucket, photoPath, k.item_name);
  });
}

function renderReportItemOptions() {
  const sel = $('reportItem');
  sel.innerHTML = '<option value="">Selecciona…</option>';
  myKit.forEach((k) => {
    const o = document.createElement('option');
    o.value = JSON.stringify({ itemId: k.equipment_item_id, unitId: k.equipment_unit_id || null });
    o.textContent = `${k.item_name}${k.unit_code ? ` · ${k.unit_code}` : ''}`;
    sel.appendChild(o);
  });
}

function renderMyReports() {
  const box = $('myReportsList');
  box.innerHTML = '';
  $('myReportsEmpty').classList.toggle('hidden', myReports.length > 0);
  myReports.forEach((r) => {
    const card = document.createElement('article');
    card.className = `report-card status-${r.status}`;
    card.innerHTML = `
      <div class="report-head">
        <div><strong>${esc(r.item_name || 'Solicitud general')}</strong><span class="report-type-badge">${REPORT_TYPE_LABEL[r.report_type] || r.report_type}</span></div>
        <span class="report-status-badge status-${r.status}">${REPORT_STATUS_LABEL[r.status] || r.status}</span>
      </div>
      <div class="report-body">
        ${r.reason ? `<p>${esc(r.reason)}</p>` : ''}
        <small class="muted">${esc(fmtDate(r.created_at))}</small>
        ${r.resolution_note ? `<small class="muted">Respuesta: ${esc(r.resolution_note)}</small>` : ''}
      </div>`;
    box.appendChild(card);
  });
}

function openReportForm(preset) {
  currentReportPreset = preset;
  $('reportForm').classList.remove('hidden');
  const isFreeRequest = preset === 'material_adicional';
  $('reportItemField').classList.toggle('hidden', isFreeRequest);
  $('reportFreeTextField').classList.toggle('hidden', !isFreeRequest);
  $('reportTypeField').classList.toggle('hidden', preset !== 'problema');
  if (preset === 'reposicion') $('reportType').value = 'faltante';
  if (preset === 'problema') $('reportType').value = 'danado';
  $('reportForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function saveReport(e) {
  e.preventDefault();
  msg('reportMessage');
  const btn = $('saveReport');
  btn.disabled = true;
  try {
    let itemId = null, unitId = null;
    const isFreeRequest = currentReportPreset === 'material_adicional';
    if (!isFreeRequest) {
      const sel = $('reportItem').value;
      if (!sel) throw new Error('Selecciona un artículo de tu kit.');
      const parsed = JSON.parse(sel);
      itemId = parsed.itemId; unitId = parsed.unitId;
    }
    const reportType = currentReportPreset === 'reposicion' ? 'reposicion' : (currentReportPreset === 'material_adicional' ? 'material_adicional' : $('reportType').value);
    const reasonBase = $('reportReason').value.trim();
    const freeText = $('reportFreeText').value.trim();
    const reason = isFreeRequest ? [freeText, reasonBase].filter(Boolean).join(' — ') : reasonBase;
    if (isFreeRequest && !freeText) throw new Error('Escribe qué material necesitas.');

    let photoPath = null, photoBucket = null;
    if (reportPhotoFile) {
      photoPath = await uploadPhoto(`organizations/${ctx.organization_id}/equipment/reports/reporte-${Date.now()}`, reportPhotoFile);
      photoBucket = PHOTO_BUCKET;
    }
    await rpc('v2_report_equipment_issue', {
      organization_id: ctx.organization_id, item_id: itemId, unit_id: unitId, report_type: reportType,
      quantity: Number($('reportQuantity').value || 1), reason: reason || null,
      photo_path: photoPath, photo_bucket: photoBucket, comment: $('reportComment').value.trim() || null,
    });
    msg('reportMessage', 'Reporte enviado. Administración lo va a revisar.', 'success');
    e.target.reset();
    reportPhotoFile = null;
    $('reportForm').classList.add('hidden');
    await loadCoach();
  } catch (err) { msg('reportMessage', friendly(err)); }
  finally { btn.disabled = false; }
}

function bindCoachEvents() {
  document.querySelectorAll('.report-trigger').forEach((btn) => btn.addEventListener('click', () => openReportForm(btn.dataset.preset)));
  $('cancelReport').addEventListener('click', () => { $('reportForm').classList.add('hidden'); $('reportForm').reset(); });
  $('reportForm').addEventListener('submit', saveReport);
  $('reportPhotoInput').addEventListener('change', (e) => { reportPhotoFile = e.target.files?.[0] || null; });
}

boot().catch((e) => { $('deniedText').textContent = friendly(e); show('deniedView'); });
