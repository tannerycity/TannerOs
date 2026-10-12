/* CANDIDATOS A STAFF (Presidencia, 12/10/2026).
 *
 * "Fichajes de entrenadores / formadores por TannerOS: que se inscriban y
 * manden su CV, porque por WhatsApp a veces se van."
 *
 * Las postulaciones de /trabaja/ (t4). Las ven Presidencia y Dirección
 * deportiva: abren el CV, escriben por WhatsApp con el mensaje ya armado y las
 * mueven de estado, con una nota. Arriba, la liga para el flyer.
 */
import { bootstrapProtectedShell, rpc, supabase, $, setShellHealth } from '/v2/shell.js';
import { ligaWhatsApp } from '/v2/pedido-mensajes.js';
import { getSignedPhotoUrl } from '/v2/photo-cache.js';
import { ligaPublica } from '/v2/club-publico.js';
import { ESTADOS, FILTROS, etiquetaDe, filtra, cuenta, mensajeInicial } from '/v2/candidatos/candidatos.js';

const boot = await bootstrapProtectedShell({ active: 'candidatos', title: 'Candidatos' });
if (!boot) throw new Error('No access');
const ctx = boot.ctx, org = ctx.organization_id, club = ctx.organization_name || 'el club';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fecha = v => new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(new Date(v)).replace('.', '');
function msg(t = '', tipo = 'error') { const e = $('candMensaje'); e.textContent = t; e.dataset.type = tipo; e.classList.toggle('hidden', !t); }

let lista = [], filtro = 'activas';

// La liga corta del flyer: /unete (vercel.json la manda a /trabaja/).
const liga = ligaPublica('/unete', ctx);
$('candLiga').textContent = liga;
$('candCompartir').href = `https://wa.me/?text=${encodeURIComponent(`¿Te interesa ser formador en ${club}? Postúlate aquí: ${liga}`)}`;
$('candCopiar').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(liga); $('candCopiar').textContent = 'Copiada'; } catch { $('candCopiar').textContent = 'Selecciona y copia'; }
});

function pinta() {
  const n = cuenta(lista);
  $('candKpis').innerHTML = ESTADOS.slice(0, 4).map(e => `<article><b>${n[e.code]}</b><span>${esc(e.label)}</span></article>`).join('');
  $('candFiltros').innerHTML = FILTROS.map(f => `<button type="button" role="tab" data-filtro="${f.code}" aria-selected="${f.code === filtro}" class="${f.code === filtro ? 'activo' : ''}">${esc(f.label)}</button>`).join('');
  const vis = filtra(lista, filtro);
  $('candLista').innerHTML = vis.map(c => {
    const wa = ligaWhatsApp(c.phone, mensajeInicial(c, club));
    const datos = [c.age ? `${c.age} años` : '', c.city, c.experience ? `Experiencia: ${c.experience}` : ''].filter(Boolean).join(' · ');
    return `<article class="cand" data-id="${esc(c.id)}">
      <header><div><strong>${esc(c.fullName)}</strong><small>${esc(c.folio)} · ${esc(fecha(c.createdAt))}</small></div><span class="cand-estado cand-${esc(c.status)}">${esc(etiquetaDe(c.status))}</span></header>
      <p class="cand-puestos">${(c.positions || []).map(p => `<span>${esc(p)}</span>`).join('')}</p>
      ${datos ? `<p class="cand-datos">${esc(datos)}</p>` : ''}
      ${c.studies ? `<p class="cand-datos"><b>Estudios:</b> ${esc(c.studies)}</p>` : ''}
      ${(c.availability || []).length ? `<p class="cand-datos"><b>Puede:</b> ${esc(c.availability.join(', '))}</p>` : ''}
      ${c.about ? `<details><summary>Lo que contó</summary><p>${esc(c.about)}</p></details>` : ''}
      <div class="cand-acciones">
        ${wa ? `<a class="primary" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
        ${c.cvPath ? `<button type="button" class="secondary" data-cv="${esc(c.cvPath)}">Ver CV</button>` : '<span class="cand-sin-cv">Sin CV</span>'}
        <select data-estado aria-label="Estado de ${esc(c.fullName)}">${ESTADOS.map(e => `<option value="${e.code}" ${e.code === c.status ? 'selected' : ''}>${esc(e.label)}</option>`).join('')}</select>
      </div>
      <label class="cand-nota">Nota<textarea data-nota rows="2" maxlength="1000" placeholder="Ej. Entrevista martes 6 pm">${esc(c.notes || '')}</textarea></label>
    </article>`;
  }).join('') || `<p class="cand-vacio">${filtro === 'activas' ? 'No hay postulaciones pendientes. Comparte la liga de arriba para recibir más.' : 'Nada en este estado.'}</p>`;
  setShellHealth({ state: n.nueva ? 'attention' : 'ok', label: n.nueva ? `${n.nueva} nueva${n.nueva === 1 ? '' : 's'}` : 'Al día' });
}

async function carga() {
  try { lista = await rpc('v2_staff_applications', { organization_id: org }) || []; }
  catch (e) { $('candDenied').classList.remove('hidden'); setShellHealth({ state: 'attention', label: 'Sin permiso' }); return; }
  pinta();
}

async function guarda(id, cambios) {
  try {
    const r = await rpc('v2_update_staff_application', { organization_id: org, application_id: id, status: cambios.status ?? null, notes: cambios.notes ?? null });
    const c = lista.find(x => x.id === id); if (c) { c.status = r.status; c.notes = r.notes; }
    msg('Guardado.', 'success'); pinta();
  } catch (e) { msg(e.message || 'No se pudo guardar.'); }
}

$('candFiltros').addEventListener('click', e => { const b = e.target.closest('[data-filtro]'); if (!b) return; filtro = b.dataset.filtro; pinta(); });
$('candLista').addEventListener('change', e => {
  const card = e.target.closest('.cand'); if (!card) return;
  if (e.target.matches('[data-estado]')) guarda(card.dataset.id, { status: e.target.value });
  if (e.target.matches('[data-nota]')) guarda(card.dataset.id, { notes: e.target.value });
});
$('candLista').addEventListener('click', async e => {
  const b = e.target.closest('[data-cv]'); if (!b) return;
  // La ventana se abre en el mismo toque; si se abriera después de firmar,
  // el celular la bloquea como ventana emergente.
  const ventana = window.open('', '_blank'); if (ventana) ventana.opener = null;
  b.disabled = true;
  try {
    const url = await getSignedPhotoUrl(supabase, 'tanneros-private', b.dataset.cv);
    if (!url) throw new Error('No se pudo abrir el CV.');
    if (ventana) ventana.location.href = url; else location.href = url;
  } catch (err) { ventana?.close(); msg(err.message || 'No se pudo abrir el CV.'); }
  finally { b.disabled = false; }
});

await carga();
