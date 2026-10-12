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
$('candLiga').textContent = liga.replace(/^https?:\/\//, '');
$('candCompartir').href = `https://wa.me/?text=${encodeURIComponent(`¿Te interesa ser formador en ${club}? Postúlate aquí: ${liga}`)}`;
$('candCopiar').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(liga); $('candCopiar').textContent = 'Copiada'; } catch { $('candCopiar').textContent = 'Selecciona y copia'; }
});
// El QR para el flyer: el mismo generador que la credencial (vendor/qrcode.mjs).
async function pintaQr(canvas, texto, lado) {
  const { default: qrcode } = await import('/vendor/qrcode.mjs');
  const qr = qrcode(0, 'M'); qr.addData(texto); qr.make();
  const n = qr.getModuleCount(), quiet = 4, paso = lado / (n + quiet * 2), g = canvas.getContext('2d');
  canvas.width = lado; canvas.height = lado;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, lado, lado); g.fillStyle = '#07191e';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) g.fillRect(Math.floor((c + quiet) * paso), Math.floor((r + quiet) * paso), Math.ceil(paso), Math.ceil(paso));
}
pintaQr($('candQr'), liga, 264).catch(() => { $('candQr').classList.add('hidden'); });
$('candQrBajar').addEventListener('click', async () => {
  const c = document.createElement('canvas');
  try { await pintaQr(c, liga, 1200); } catch { msg('No se pudo generar el QR.'); return; }
  const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = `qr-unete-${ctx.organization_slug || 'club'}.png`; a.click();
});

const iniciales = n => String(n || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
const haceCuanto = v => {
  const min = Math.max(0, Math.round((Date.now() - new Date(v).getTime()) / 60000));
  if (min < 60) return min <= 1 ? 'hace un momento' : `hace ${min} min`;
  const h = Math.round(min / 60); if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24); return d === 1 ? 'ayer' : d < 7 ? `hace ${d} días` : fecha(v);
};

function pinta() {
  const n = cuenta(lista);
  $('candKpis').innerHTML = ESTADOS.slice(0, 4).map(e => `<article class="${e.code === 'nueva' && n.nueva ? 'alerta' : ''}"><b>${n[e.code]}</b><span>${esc(e.label)}</span></article>`).join('');
  const total = f => filtra(lista, f).length;
  $('candFiltros').innerHTML = FILTROS.map(f => `<button type="button" role="tab" data-filtro="${f.code}" aria-selected="${f.code === filtro}" class="${f.code === filtro ? 'activo' : ''}">${esc(f.label)}<i>${total(f.code)}</i></button>`).join('');
  const vis = filtra(lista, filtro);
  $('candLista').innerHTML = vis.map(c => {
    const wa = ligaWhatsApp(c.phone, mensajeInicial(c, club));
    const ficha = [['Edad', c.age ? `${c.age} años` : '—'], ['Experiencia', c.experience || '—'], ['Zona', c.city || '—']];
    return `<article class="cand" data-id="${esc(c.id)}">
      <header class="cand-cab"><span class="cand-avatar" aria-hidden="true">${esc(iniciales(c.fullName))}</span>
        <div><strong class="cand-nombre">${esc(c.fullName)}</strong><small>${esc(c.folio)} · ${esc(haceCuanto(c.createdAt))}</small></div>
        <span class="cand-estado cand-${esc(c.status)}">${esc(etiquetaDe(c.status))}</span></header>
      <p class="cand-puestos">${(c.positions || []).map(p => `<span>${esc(p)}</span>`).join('')}</p>
      <div class="cand-ficha">${ficha.map(([k, v]) => `<div><small>${k}</small><b>${esc(v)}</b></div>`).join('')}</div>
      ${c.studies ? `<p class="cand-datos"><b>Estudios:</b> ${esc(c.studies)}</p>` : ''}
      ${(c.availability || []).length ? `<p class="cand-datos"><b>Puede:</b> ${esc(c.availability.join(', '))}</p>` : ''}
      ${c.about ? `<details><summary>Lo que nos contó</summary><p>${esc(c.about)}</p></details>` : ''}
      <div class="cand-acciones">
        ${wa ? `<a class="cand-wa" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : '<span class="cand-sin-cv">Sin teléfono</span>'}
        ${c.cvPath ? `<button type="button" data-cv="${esc(c.cvPath)}">Ver CV</button>` : '<span class="cand-sin-cv">Sin CV</span>'}
      </div>
      <label class="cand-mover">Mover a<select data-estado aria-label="Estado de ${esc(c.fullName)}">${ESTADOS.map(e => `<option value="${e.code}" ${e.code === c.status ? 'selected' : ''}>${esc(e.label)}</option>`).join('')}</select></label>
      <label class="cand-nota">Nota<textarea data-nota rows="2" maxlength="1000" placeholder="Ej. Entrevista martes 6 pm">${esc(c.notes || '')}</textarea></label>
    </article>`;
  }).join('') || (filtro === 'activas'
    ? '<p class="cand-vacio"><b>Banca vacía</b>No hay postulaciones pendientes. Comparte la liga o el QR de arriba para recibir más.</p>'
    : '<p class="cand-vacio"><b>Nada aquí</b>No hay candidatos en este estado.</p>');
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
