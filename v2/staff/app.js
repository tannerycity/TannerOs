/* STAFF Y ORGANIGRAMA (Presidencia, 12-13/10/2026).
 *
 * "Una parte que diga Staff y que se vea el organigrama; incluso para que los
 * papás vean cuál es su entrenador." Decisiones: todo el staff ve el
 * organigrama; la familia ve foto, nombre y puesto (sin teléfono) en su portal.
 *
 * Quien contrata (Presidencia y Dirección deportiva) ve además teléfono, la
 * carta de no antecedentes y edita la ficha: puesto, nivel, a quién reporta,
 * categorías y foto. Las fichas salen de Candidatos (Contratado), de Utilería
 * (+ Nuevo profe) o de aquí mismo.
 */
import { bootstrapProtectedShell, rpc, supabase, $, setShellHealth } from '/v2/shell.js';
import { getSignedPhotoUrls } from '/v2/photo-cache.js';
import { encodeAmbas, UPLOAD_CACHE_CONTROL } from '/v2/image-encode.js';

const boot = await bootstrapProtectedShell({ active: 'staff', title: 'Staff' });
if (!boot) throw new Error('No access');
const ctx = boot.ctx, org = ctx.organization_id;
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const iniciales = n => String(n || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
function msg(t = '', tipo = 'error') { const e = $('stMensaje'); e.textContent = t; e.dataset.type = tipo; e.classList.toggle('hidden', !t); }

export const NIVELES = [
  { code: 'presidencia', label: 'Presidencia' },
  { code: 'direccion', label: 'Dirección deportiva' },
  { code: 'coordinacion', label: 'Coordinación' },
  { code: 'formador', label: 'Formadores' },
  { code: 'operacion', label: 'Operación' }
];
const BUCKET = 'tanneros-private';
let datos = { canEdit: false, members: [], categories: [], withoutCard: [] }, fotos = {}, ver = 'organigrama', abierta = null;

async function carga() {
  try { datos = await rpc('v2_staff_board', { organization_id: org }) || datos; }
  catch (e) { msg(e.message || 'No se pudo cargar el staff.'); return; }
  pinta();
  const rutas = (datos.members || []).map(m => m.photoThumbPath).filter(Boolean);
  if (rutas.length) { try { fotos = await getSignedPhotoUrls(supabase, BUCKET, rutas) || {}; pinta(); } catch (_) { /* se quedan las iniciales */ } }
}

const cara = (m, clase = '') => `<span class="st-cara ${clase}" aria-hidden="true">${fotos[m.photoThumbPath] ? `<img src="${esc(fotos[m.photoThumbPath])}" alt="">` : esc(iniciales(m.fullName))}</span>`;
const cats = m => (m.categories || []).map(c => `<span class="st-cat">${esc(c.name)}</span>`).join('');
const cartaPendiente = m => datos.canEdit && m.level === 'formador' && m.backgroundCheck !== 'entregada';

function tarjeta(m) {
  return `<button type="button" class="st-tarjeta${m.active ? '' : ' baja'}" data-id="${esc(m.id)}">${cara(m)}
    <span class="st-tarjeta-txt"><strong>${esc(m.fullName)}</strong><small>${esc(m.title)}</small>${(m.categories || []).length ? `<span class="st-cats">${cats(m)}</span>` : ''}</span>
    ${cartaPendiente(m) ? '<em class="st-alerta">Carta pendiente</em>' : ''}${m.active ? '' : '<em class="st-alerta gris">Baja</em>'}</button>`;
}

function pinta() {
  const vivos = (datos.members || []).filter(m => m.active);
  const formadores = vivos.filter(m => m.level === 'formador');
  const sinCat = formadores.filter(m => !(m.categories || []).length).length;
  const pendientes = vivos.filter(cartaPendiente).length;
  $('stResumen').textContent = `${vivos.length} ${vivos.length === 1 ? 'persona' : 'personas'} · ${formadores.length} ${formadores.length === 1 ? 'formador' : 'formadores'}`;
  $('stNuevo').classList.toggle('hidden', !datos.canEdit);
  $('stAvisos').innerHTML = [
    sinCat ? `<p class="st-aviso">${sinCat} ${sinCat === 1 ? 'formador sin categoría' : 'formadores sin categoría'}: asígnasela para que su familia lo vea.</p>` : '',
    pendientes ? `<p class="st-aviso rojo">${pendientes} sin carta de no antecedentes penales.</p>` : ''
  ].join('');
  document.querySelectorAll('.st-seg [data-ver]').forEach(b => { const on = b.dataset.ver === ver; b.classList.toggle('activo', on); b.setAttribute('aria-selected', String(on)); });
  $('stOrganigrama').classList.toggle('hidden', ver !== 'organigrama');
  $('stLista').classList.toggle('hidden', ver !== 'lista');

  // Organigrama: un escalón por nivel, de Presidencia a Operación.
  $('stOrganigrama').innerHTML = NIVELES.map(n => {
    const gente = vivos.filter(m => m.level === n.code);
    if (!gente.length) return '';
    return `<section class="st-nivel st-${n.code}"><h2>${esc(n.label)} <i>${gente.length}</i></h2><div class="st-nivel-gente">${gente.map(tarjeta).join('')}</div></section>`;
  }).join('') || `<div class="st-vacio"><b>Todavía no hay fichas</b>${datos.canEdit ? 'Toca "+ Agregar", o contrata desde Candidatos.' : 'Presidencia las está dando de alta.'}</div>`;

  // Lista: todos, con las bajas al final para quien edita.
  const lista = [...(datos.members || [])].sort((a, b) => (b.active - a.active) || String(a.fullName).localeCompare(String(b.fullName), 'es'));
  $('stLista').innerHTML = lista.map(tarjeta).join('') || '<div class="st-vacio"><b>Sin fichas</b></div>';

  // Con cuenta en TannerOS y sin ficha: un toque para agregarlos.
  const sin = datos.canEdit ? (datos.withoutCard || []) : [];
  $('stSinFicha').classList.toggle('hidden', !sin.length);
  $('stSinFicha').innerHTML = sin.length ? `<h2>Con cuenta, sin ficha</h2><p>Tienen acceso a TannerOS pero no salen en el organigrama.</p><div class="st-sin">${sin.map((u, k) =>
    `<button type="button" class="st-sin-btn" data-sin="${k}"><b>${esc(u.name)}</b><small>${esc(u.role || '')}</small><span>Agregar</span></button>`).join('')}</div>` : '';
  setShellHealth({ state: pendientes || sinCat ? 'attention' : 'ok', label: pendientes ? `${pendientes} sin carta` : sinCat ? `${sinCat} sin categoría` : 'Al día' });
}

/* ---- La ficha ---- */
function abreHoja(titulo, html) {
  $('stHojaTitulo').textContent = titulo; $('stHojaCuerpo').innerHTML = html;
  $('stHoja').classList.remove('hidden'); $('stFondo').classList.remove('hidden');
}
function cierraHoja() { $('stHoja').classList.add('hidden'); $('stFondo').classList.add('hidden'); abierta = null; }
$('stCerrar').addEventListener('click', cierraHoja);
$('stFondo').addEventListener('click', cierraHoja);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('stHoja').classList.contains('hidden')) cierraHoja(); });

function verFicha(m) {
  abierta = m;
  const jefe = (datos.members || []).find(x => x.id === m.reportsTo);
  if (!datos.canEdit) {
    abreHoja(m.fullName, `<div class="st-ficha-cab">${cara(m, 'grande')}<div><strong>${esc(m.fullName)}</strong><span>${esc(m.title)}</span></div></div>
      ${(m.categories || []).length ? `<p class="st-dato"><b>Categorías</b><span class="st-cats">${cats(m)}</span></p>` : ''}
      ${jefe ? `<p class="st-dato"><b>Reporta a</b><span>${esc(jefe.fullName)}</span></p>` : ''}`);
    return;
  }
  const otros = (datos.members || []).filter(x => x.id !== m.id && x.active);
  abreHoja(m.fullName, `
    <div class="st-ficha-cab"><label class="st-foto-btn" title="Cambiar foto">${cara(m, 'grande')}<input type="file" accept="image/*" id="fFoto" hidden><small>Cambiar foto</small></label>
      <div><strong>${esc(m.fullName)}</strong><span>${esc(m.title)}${m.hasAccount ? ' · con cuenta' : ''}</span></div></div>
    <form id="fFicha" class="st-form">
      <label><span>Nombre</span><input id="fNombre" required minlength="2" maxlength="120" value="${esc(m.fullName)}"></label>
      <label><span>Puesto</span><input id="fPuesto" required minlength="2" maxlength="80" value="${esc(m.title)}" placeholder="Formador T10"></label>
      <div class="st-campo"><span>Nivel</span><div class="st-chips" id="fNivel">${NIVELES.map(n => `<button type="button" class="st-chip${m.level === n.code ? ' activo' : ''}" data-nivel="${n.code}">${esc(n.label)}</button>`).join('')}</div></div>
      <label><span>Reporta a</span><select id="fJefe"><option value="">Nadie</option>${otros.map(x => `<option value="${esc(x.id)}"${x.id === m.reportsTo ? ' selected' : ''}>${esc(x.fullName)} · ${esc(x.title)}</option>`).join('')}</select></label>
      <div class="st-campo"><span>Categorías</span><div class="st-chips" id="fCats">${(datos.categories || []).map(c => `<button type="button" class="st-chip${(m.categories || []).some(x => x.id === c.id) ? ' activo' : ''}" data-cat="${esc(c.id)}">${esc(c.name)}</button>`).join('') || '<small>Sin categorías activas.</small>'}</div></div>
      <label><span>WhatsApp</span><input id="fTel" inputmode="tel" maxlength="20" value="${esc(m.phone || '')}"></label>
      <div class="st-campo"><span>Carta de no antecedentes penales</span><div class="st-chips" id="fCarta">
        <button type="button" class="st-chip${m.backgroundCheck !== 'entregada' ? ' activo' : ''}" data-carta="pendiente">Pendiente</button>
        <button type="button" class="st-chip${m.backgroundCheck === 'entregada' ? ' activo' : ''}" data-carta="entregada">Entregada</button></div>
        <label class="st-vence"><span>Vence</span><input id="fVence" type="date" value="${esc(m.backgroundValidUntil || '')}"></label></div>
      <label class="st-check"><input id="fFamilias" type="checkbox"${m.showToFamilies ? ' checked' : ''}> Las familias lo ven en su portal (foto, nombre y puesto)</label>
      <p id="fMsg" class="st-form-msg" role="alert"></p>
      <button type="submit" class="st-btn grande">Guardar</button>
      <button type="button" id="fBaja" class="st-baja">${m.active ? 'Dar de baja' : 'Reactivar'}</button>
    </form>`);
  const marca = (id, attr) => $(id).addEventListener('click', e => { const b = e.target.closest(`[${attr}]`); if (!b) return;
    if (attr === 'data-cat') { b.classList.toggle('activo'); return; }
    $(id).querySelectorAll(`[${attr}]`).forEach(x => x.classList.toggle('activo', x === b)); });
  marca('fNivel', 'data-nivel'); marca('fCats', 'data-cat'); marca('fCarta', 'data-carta');
  $('fFicha').addEventListener('submit', e => { e.preventDefault(); guarda(m, {
    fullName: $('fNombre').value.trim(), title: $('fPuesto').value.trim(),
    level: $('fNivel').querySelector('.activo')?.dataset.nivel || m.level,
    reportsTo: $('fJefe').value || null,
    categoryIds: [...$('fCats').querySelectorAll('.activo')].map(b => b.dataset.cat),
    phone: $('fTel').value.trim(), backgroundCheck: $('fCarta').querySelector('.activo')?.dataset.carta || 'pendiente',
    backgroundValidUntil: $('fVence').value || null, showToFamilies: $('fFamilias').checked }); });
  $('fBaja').addEventListener('click', () => guarda(m, { active: !m.active }));
  $('fFoto').addEventListener('change', e => { const f = e.target.files?.[0]; if (f) subeFoto(m, f); });
}

async function guarda(m, cambios) {
  const out = $('fMsg'); if (out) out.textContent = '';
  try {
    await rpc('v2_save_staff_member', { organization_id: org, member: { id: m.id, ...cambios } });
    cierraHoja(); msg('Ficha guardada.', 'success'); await carga();
  } catch (e) {
    // Guardar fichas se activa con un SQL que Presidencia corre en Supabase.
    const falta = /v2_save_staff_member|function .* does not exist|Could not find/i.test(e.message || '');
    if (out) out.textContent = falta ? 'Guardar fichas todavía no está activado: falta correr el SQL de Staff en Supabase.' : (e.message || 'No se pudo guardar.');
  }
}

async function subeFoto(m, archivo) {
  const out = $('fMsg'); if (out) out.textContent = 'Subiendo foto…';
  try {
    const img = await new Promise((ok, mal) => { const url = URL.createObjectURL(archivo), i = new Image(); i.onload = () => { URL.revokeObjectURL(url); ok(i); }; i.onerror = () => { URL.revokeObjectURL(url); mal(new Error('No pudimos leer esa foto.')); }; i.src = url; });
    const { full, thumb } = await encodeAmbas(img), t = Date.now();
    const base = `organizations/${org}/staff/${m.id}/foto-${t}`, path = `${base}.${full.ext}`, thumbPath = `${base}-thumb.${thumb.ext}`;
    const sube = (r, v) => supabase.storage.from(BUCKET).upload(r, v.blob, { contentType: v.mime, cacheControl: UPLOAD_CACHE_CONTROL, upsert: false });
    const [a, b] = await Promise.all([sube(path, full), sube(thumbPath, thumb)]);
    if (a.error) throw a.error;
    await rpc('v2_set_staff_photo', { organization_id: org, member_id: m.id, photo_path: path, photo_thumb_path: b.error ? null : thumbPath });
    if (out) out.textContent = '';
    cierraHoja(); msg('Foto lista.', 'success'); await carga();
  } catch (e) { if (out) out.textContent = e.message || 'No se pudo subir la foto.'; }
}

function nuevo() {
  abreHoja('Agregar al staff', `<form id="nForm" class="st-form">
    <label><span>Nombre</span><input id="nNombre" required minlength="2" maxlength="120" placeholder="Juan Ruiz" autocomplete="off"></label>
    <label><span>WhatsApp <small>opcional</small></span><input id="nTel" inputmode="tel" maxlength="20" placeholder="477 123 4567"></label>
    <div class="st-campo"><span>Puesto</span><div class="st-chips" id="nNivel">${[['formador', 'Formador'], ['coordinacion', 'Coordinación'], ['direccion', 'Dirección deportiva'], ['operacion', 'Operación']].map(([v, t], k) => `<button type="button" class="st-chip${k === 0 ? ' activo' : ''}" data-nivel="${v}">${t}</button>`).join('')}</div></div>
    <p id="fMsg" class="st-form-msg" role="alert"></p>
    <button type="submit" class="st-btn grande">Agregar</button></form>`);
  $('nNivel').addEventListener('click', e => { const b = e.target.closest('[data-nivel]'); if (!b) return; $('nNivel').querySelectorAll('[data-nivel]').forEach(x => x.classList.toggle('activo', x === b)); });
  $('nForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await rpc('v2_quick_add_staff', { organization_id: org, full_name: $('nNombre').value.trim(), phone: $('nTel').value.trim() || null, level: $('nNivel').querySelector('.activo')?.dataset.nivel || 'formador' });
      cierraHoja(); msg('Agregado al staff. Tócalo para completar su ficha.', 'success'); await carga();
    } catch (err) { $('fMsg').textContent = err.message || 'No se pudo agregar.'; }
  });
}

$('stNuevo').addEventListener('click', nuevo);
document.querySelector('.st-seg').addEventListener('click', e => { const b = e.target.closest('[data-ver]'); if (!b) return; ver = b.dataset.ver; pinta(); });
document.querySelector('main').addEventListener('click', e => {
  const t = e.target.closest('.st-tarjeta[data-id]');
  if (t) { const m = (datos.members || []).find(x => x.id === t.dataset.id); if (m) verFicha(m); return; }
  const s = e.target.closest('[data-sin]');
  if (s) {
    const u = (datos.withoutCard || [])[Number(s.dataset.sin)]; if (!u) return;
    s.disabled = true;
    rpc('v2_save_staff_member', { organization_id: org, member: { userId: u.userId, fullName: u.name, title: u.role || 'Staff', level: u.role === 'Presidencia' ? 'presidencia' : u.role === 'Operaciones' ? 'operacion' : 'formador' } })
      .then(() => { msg(`${u.name} ya está en el staff.`, 'success'); return carga(); })
      .catch(err => { s.disabled = false; msg(/v2_save_staff_member|does not exist|Could not find/i.test(err.message || '') ? 'Agregar con cuenta todavía no está activado: falta correr el SQL de Staff en Supabase.' : (err.message || 'No se pudo agregar.')); });
  }
});
// El botón + de abajo: lo de esta pantalla primero.
window.tosAccionesDePantalla = [{ label: 'Agregar al staff', sub: 'Nombre, WhatsApp y puesto', icon: 'plus', run: () => datos.canEdit ? nuevo() : msg('Sólo Presidencia y Operaciones agregan staff.') }];
window.dispatchEvent(new Event('tos:acciones'));

await carga();
