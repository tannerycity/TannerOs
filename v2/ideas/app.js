/* BANCO DE IDEAS (22/10/2026).
 *
 * Presidencia: "vamos a crear un banco de ideas que sea tipo Notion, estilo
 * kanban, para darle seguimiento a tareas". Cuatro columnas (Ideas, Por
 * hacer, En proceso, Hecho); cada tarjeta trae área, responsable, fecha,
 * prioridad, notas y su lista de pendientes. En la compu se arrastra; en el
 * celular se cambia de columna desde la tarjeta. Lo decide el servidor
 * (h37): lo ve y lo mueve todo el staff; archivar, quien la creó, su
 * responsable o Presidencia.
 */
import { createClient } from '/v2/supabase-client.js';
import { COLUMNAS, AREAS, PRIORIDADES, filtra, porColumna, posicionEntre, vence, progreso, tonoDeArea, iniciales } from '/v2/ideas/ideas.js';

const supabase = createClient('https://pacnegivzgxpanphrnwp.supabase.co', 'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',
  { auth: { persistSession: true, autoRefreshToken: true } });
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fechaCorta = v => v ? new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(new Date(`${String(v).slice(0, 10)}T12:00:00`)).replace('.', '') : '';

let ctx = null, datos = { ideas: [], people: [], me: null, isPresidency: false }, mias = false, area = '', q = '', abierta = null, arrastrando = null;

async function rpc(name, args) { const { data, error } = await supabase.rpc(name, args); if (error) throw error; return data; }
function muestra(id) { ['loadingView', 'deniedView', 'view'].forEach(v => $(v).classList.toggle('hidden', v !== id)); }
function aviso(t) { const m = $('idMensaje'); m.textContent = t || ''; m.classList.toggle('hidden', !t); }

function tarjeta(i) {
  const v = vence(i.dueDate, hoy(), i.status), p = progreso(i.checklist);
  return `<article class="id-carta${i.priority === 'alta' ? ' alta' : ''}" draggable="true" data-id="${esc(i.id)}" tabindex="0" role="button" aria-label="Abrir ${esc(i.title)}">
    ${i.area ? `<span class="id-area" style="--tono:${tonoDeArea(i.area)}">${esc(i.area)}</span>` : ''}
    <strong>${esc(i.title)}</strong>
    <div class="id-carta-pie">
      ${i.dueDate ? `<span class="id-fecha${v ? ` ${v}` : ''}">${v === 'vencida' ? 'Venció ' : ''}${esc(fechaCorta(i.dueDate))}</span>` : ''}
      ${p.total ? `<span class="id-check${p.hechos === p.total ? ' completo' : ''}">${p.hechos}/${p.total}</span>` : ''}
      ${i.priority === 'alta' ? '<span class="id-prio">Alta</span>' : ''}
      ${i.ownerName ? `<span class="id-quien" title="${esc(i.ownerName)}">${esc(iniciales(i.ownerName))}</span>` : ''}
    </div></article>`;
}

function pinta() {
  const vis = filtra(datos.ideas, { q, mias, me: datos.me, area }), cols = porColumna(vis);
  const todas = porColumna(datos.ideas);
  $('idResumen').textContent = `${todas.doing.length} en proceso · ${todas.todo.length} por hacer · ${todas.idea.length} ideas`;
  $('idTablero').innerHTML = COLUMNAS.map(c => `<section class="id-col" data-col="${c.k}">
    <header><div><h2>${c.t}</h2><small>${c.sub}</small></div><span>${cols[c.k].length}</span></header>
    <div class="id-lista" data-lista="${c.k}">${cols[c.k].map(tarjeta).join('') || '<p class="id-vacia">Nada aquí</p>'}</div>
    <form class="id-rapida" data-rapida="${c.k}"><input name="t" maxlength="160" placeholder="+ Agregar a ${c.t.toLowerCase()}" aria-label="Agregar a ${c.t}"></form>
  </section>`).join('');
  const areas = [...new Set([...AREAS, ...datos.ideas.map(i => i.area).filter(Boolean)])];
  const sel = $('idArea'), antes = sel.value;
  sel.innerHTML = '<option value="">Todas las áreas</option>' + areas.map(a => `<option>${esc(a)}</option>`).join('');
  sel.value = antes;
}

async function carga() {
  try { datos = await rpc('v2_ideas', { organization_id: ctx.organization_id }) || datos; }
  catch (e) { if (/Not authorized/i.test(e.message || '')) { muestra('deniedView'); return; } aviso('No se pudo cargar el tablero.'); }
  pinta();
}
const reemplaza = r => { const k = datos.ideas.findIndex(x => x.id === r.id); if (r.status === 'archived') { if (k >= 0) datos.ideas.splice(k, 1); } else if (k >= 0) datos.ideas[k] = r; else datos.ideas.push(r); };

/* ---------- La hoja de una idea: todo se edita aquí ---------- */
function abre(idea) {
  abierta = idea ? JSON.parse(JSON.stringify(idea)) : { title: '', status: 'idea', priority: 'media', checklist: [], area: '', notes: '' };
  const a = abierta, puedeArchivar = a.id && (a.createdBy === datos.me || a.ownerId === datos.me || datos.isPresidency);
  $('idHoja').innerHTML = `
    <div class="id-hoja-cab"><span>${a.id ? 'IDEA' : 'NUEVA IDEA'}</span><button type="button" class="id-cerrar" data-cerrar aria-label="Cerrar">&times;</button></div>
    <textarea id="hTitulo" class="id-titulo" rows="1" maxlength="160" placeholder="¿Cuál es la idea?">${esc(a.title)}</textarea>
    <div class="id-seg id-cols" role="group" aria-label="Columna">${COLUMNAS.map(c => `<button type="button" data-st="${c.k}" aria-pressed="${a.status === c.k}">${c.t}</button>`).join('')}</div>
    <div class="id-props">
      <label>Área<input id="hArea" list="hAreas" maxlength="40" value="${esc(a.area || '')}" placeholder="Marketing, Redes…"><datalist id="hAreas">${AREAS.map(x => `<option value="${esc(x)}">`).join('')}</datalist></label>
      <label>Responsable<select id="hQuien"><option value="">Nadie todavía</option>${datos.people.map(p => `<option value="${esc(p.id)}"${p.id === a.ownerId ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <label>Fecha<input id="hFecha" type="date" value="${esc(a.dueDate || '')}"></label>
      <label>Prioridad<select id="hPrio">${PRIORIDADES.map(p => `<option value="${p.k}"${p.k === a.priority ? ' selected' : ''}>${p.t}</option>`).join('')}</select></label>
    </div>
    <label class="id-notas">Notas<textarea id="hNotas" rows="5" maxlength="8000" placeholder="Detalles, links, a quién contactar…">${esc(a.notes || '')}</textarea></label>
    <div class="id-pend"><h3>Pendientes</h3><ul id="hLista"></ul>
      <form id="hNuevoPend" class="id-pend-nuevo"><input maxlength="200" placeholder="+ Agregar pendiente" aria-label="Agregar pendiente"></form></div>
    <p id="hMsg" class="id-hoja-msg hidden"></p>
    <div class="id-hoja-pie">
      ${puedeArchivar ? '<button type="button" class="id-link" data-archivar>Archivar</button>' : '<span></span>'}
      <button type="button" class="id-btn" data-guardar>${a.id ? 'Guardar' : 'Crear idea'}</button>
    </div>
    ${a.id ? `<p class="id-hoja-meta">Creó ${esc(a.createdByName || '—')}${a.updatedAt ? ` · último cambio ${esc(fechaCorta(a.updatedAt))}` : ''}</p>` : ''}`;
  pintaPendientes();
  $('idFondo').classList.remove('hidden'); $('idHoja').classList.remove('hidden');
  setTimeout(() => { if (!a.id) $('hTitulo').focus(); }, 50);
}
function pintaPendientes() {
  $('hLista').innerHTML = (abierta.checklist || []).map((x, n) => `<li><label><input type="checkbox" data-pend="${n}"${x.done ? ' checked' : ''}><span>${esc(x.text)}</span></label><button type="button" data-quita="${n}" aria-label="Quitar">&times;</button></li>`).join('');
}
function cierra() { abierta = null; $('idFondo').classList.add('hidden'); $('idHoja').classList.add('hidden'); }
function lee() {
  Object.assign(abierta, { title: $('hTitulo').value.trim(), area: $('hArea').value.trim(), ownerId: $('hQuien').value || null,
    dueDate: $('hFecha').value || null, priority: $('hPrio').value, notes: $('hNotas').value });
}
async function guarda(btn) {
  lee(); const m = $('hMsg');
  if (!abierta.title) { m.textContent = 'Ponle un título a la idea.'; m.classList.remove('hidden'); $('hTitulo').focus(); return; }
  btn.disabled = true;
  try { const r = await rpc('v2_save_idea', { organization_id: ctx.organization_id, idea: abierta }); reemplaza(r); cierra(); pinta(); }
  catch (e) { m.textContent = e.message || 'No se pudo guardar.'; m.classList.remove('hidden'); btn.disabled = false; }
}

/* ---------- Arrastrar (compu) ---------- */
async function mueve(id, col, antesDe) {
  const lista = porColumna(datos.ideas)[col].filter(x => x.id !== id);
  const k = antesDe ? lista.findIndex(x => x.id === antesDe) : lista.length;
  const pos = posicionEntre(lista[k - 1]?.position, lista[k]?.position);
  const i = datos.ideas.find(x => x.id === id); if (!i) return;
  const previo = { status: i.status, position: i.position };
  Object.assign(i, { status: col, position: pos }); pinta();
  try { reemplaza(await rpc('v2_move_idea', { organization_id: ctx.organization_id, idea_id: id, status: col, pos })); pinta(); }
  catch (e) { Object.assign(i, previo); pinta(); aviso(e.message || 'No se pudo mover.'); }
}

function cablea() {
  $('idNueva').addEventListener('click', () => abre(null));
  $('idQuien').addEventListener('click', e => { const b = e.target.closest('[data-mias]'); if (!b) return; mias = b.dataset.mias === '1';
    $('idQuien').querySelectorAll('[data-mias]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); pinta(); });
  $('idArea').addEventListener('change', e => { area = e.target.value; pinta(); });
  $('idBuscar').addEventListener('input', e => { q = e.target.value; pinta(); });
  const tab = $('idTablero');
  tab.addEventListener('click', e => { const c = e.target.closest('.id-carta'); if (c) abre(datos.ideas.find(x => x.id === c.dataset.id)); });
  tab.addEventListener('keydown', e => { const c = e.target.closest('.id-carta'); if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abre(datos.ideas.find(x => x.id === c.dataset.id)); } });
  tab.addEventListener('submit', async e => {
    const f = e.target.closest('[data-rapida]'); if (!f) return; e.preventDefault();
    const t = f.t.value.trim(); if (!t) return; f.t.disabled = true;
    try { reemplaza(await rpc('v2_save_idea', { organization_id: ctx.organization_id, idea: { title: t, status: f.dataset.rapida } })); pinta();
      $('idTablero').querySelector(`[data-rapida="${f.dataset.rapida}"] input`)?.focus(); }
    catch (err) { aviso(err.message || 'No se pudo agregar.'); f.t.disabled = false; }
  });
  tab.addEventListener('dragstart', e => { const c = e.target.closest('.id-carta'); if (!c) return; arrastrando = c.dataset.id; c.classList.add('arrastrando'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', arrastrando); });
  tab.addEventListener('dragend', () => { arrastrando = null; tab.querySelectorAll('.arrastrando,.sobre').forEach(x => x.classList.remove('arrastrando', 'sobre')); });
  tab.addEventListener('dragover', e => { const l = e.target.closest('.id-col'); if (!l || !arrastrando) return; e.preventDefault(); tab.querySelectorAll('.sobre').forEach(x => x !== l && x.classList.remove('sobre')); l.classList.add('sobre'); });
  tab.addEventListener('drop', e => {
    const col = e.target.closest('.id-col'); if (!col || !arrastrando) return; e.preventDefault();
    const tarjetas = [...col.querySelectorAll('.id-carta:not(.arrastrando)')];
    const antes = tarjetas.find(t => { const r = t.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
    mueve(arrastrando, col.dataset.col, antes?.dataset.id || null);
  });
  const hoja = $('idHoja');
  $('idFondo').addEventListener('click', cierra);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && abierta) cierra(); });
  hoja.addEventListener('click', e => {
    if (e.target.closest('[data-cerrar]')) { cierra(); return; }
    const st = e.target.closest('[data-st]'); if (st) { abierta.status = st.dataset.st; hoja.querySelectorAll('[data-st]').forEach(x => x.setAttribute('aria-pressed', String(x === st))); return; }
    const qu = e.target.closest('[data-quita]'); if (qu) { lee(); abierta.checklist.splice(Number(qu.dataset.quita), 1); pintaPendientes(); return; }
    const g = e.target.closest('[data-guardar]'); if (g) { guarda(g); return; }
    const ar = e.target.closest('[data-archivar]');
    if (ar) (async () => {
      const ok = await window.tosConfirm({ kicker: 'IDEAS', title: 'Archivar esta idea', message: 'Sale del tablero; no se borra.', confirmText: 'Archivar' });
      if (!ok) return;
      try { reemplaza(await rpc('v2_archive_idea', { organization_id: ctx.organization_id, idea_id: abierta.id, archived: true })); cierra(); pinta(); }
      catch (err) { const m = $('hMsg'); m.textContent = err.message || 'No se pudo archivar.'; m.classList.remove('hidden'); }
    })();
  });
  hoja.addEventListener('change', e => { const c = e.target.closest('[data-pend]'); if (c) abierta.checklist[Number(c.dataset.pend)].done = c.checked; });
  hoja.addEventListener('submit', e => {
    if (e.target.id !== 'hNuevoPend') return; e.preventDefault();
    const inp = e.target.querySelector('input'), t = inp.value.trim(); if (!t) return;
    lee(); abierta.checklist.push({ text: t, done: false }); inp.value = ''; pintaPendientes(); inp.focus();
  });
}

async function boot() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { location.href = '/'; return; }
  const filas = await rpc('v2_my_context');
  if (!filas?.length) { location.href = '/'; return; }
  ctx = filas[0];
  $('orgName').textContent = ctx.organization_name || '';
  if (ctx.role === 'Tanner') { muestra('deniedView'); return; }
  cablea(); muestra('view'); await carga();
  const abrir = new URLSearchParams(location.search).get('idea');
  if (abrir) { const i = datos.ideas.find(x => x.id === abrir); if (i) abre(i); }
}
boot().catch(e => { console.error(e); $('deniedText').textContent = 'No se pudo abrir. Vuelve a intentar.'; muestra('deniedView'); });
