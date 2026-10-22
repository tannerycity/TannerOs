/* CAMBIOS (22/10/2026).
 *
 * Presidencia: "quiero que Zul pueda editar o borrar los pedidos y los
 * cobros, pero que haya un registro para yo revisar". Cada corrección pide
 * motivo y llega aquí con quién, cuándo, antes y después (h32). Presidencia
 * la marca como revisada. Lo decide el servidor: sólo Presidencia la ve.
 */
import { createClient } from '/v2/supabase-client.js';
import { TIPOS, diferencias, liga } from '/v2/cambios/cambios.js';

const supabase = createClient('https://pacnegivzgxpanphrnwp.supabase.co', 'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',
  { auth: { persistSession: true, autoRefreshToken: true } });
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cuando = v => new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(v)).replace('.', '');

let ctx = null, datos = null, ver = 'pendientes';
async function rpc(name, args) { const { data, error } = await supabase.rpc(name, args); if (error) throw error; return data; }
function muestra(id) { ['loadingView', 'deniedView', 'view'].forEach(v => $(v).classList.toggle('hidden', v !== id)); }
function aviso(t, tipo) { const m = $('caMensaje'); m.textContent = t || ''; m.dataset.type = tipo || ''; m.classList.toggle('hidden', !t); }

function pinta() {
  const filas = (datos?.rows || []).filter(f => ver === 'todos' || !f.reviewedAt), pend = Number(datos?.pending || 0);
  $('caResumen').textContent = pend ? `${pend} por revisar` : 'Todo revisado';
  $('caTodo').classList.toggle('hidden', !pend || ver !== 'pendientes');
  $('caVacio').classList.toggle('hidden', filas.length > 0);
  $('caVacio').textContent = ver === 'pendientes' ? 'Nada por revisar. Todo en orden.' : 'Todavía no hay cambios.';
  $('caLista').innerHTML = filas.map(f => {
    const dif = diferencias(f.before, f.after), url = liga(f);
    return `<article class="ca-carta${f.reviewedAt ? ' revisado' : ''}" data-id="${esc(f.id)}">
      <div class="ca-carta-cab"><span class="ca-tipo" data-kind="${esc(f.kind)}">${esc(TIPOS[f.kind] || f.kind)}</span><small>${esc(cuando(f.at))}</small></div>
      <h2>${url ? `<a href="${esc(url)}">${esc(f.label || '')}</a>` : esc(f.label || '')}</h2>
      <p class="ca-quien"><b>${esc(f.who || 'Alguien')}</b>${f.reason ? ` · “${esc(f.reason)}”` : ''}</p>
      ${dif.length ? `<ul class="ca-dif">${dif.map(d => `<li><span>${esc(d.campo)}</span><s>${esc(d.antes)}</s>${d.despues !== null ? `<b>${esc(d.despues)}</b>` : ''}</li>`).join('')}</ul>` : ''}
      ${f.reviewedAt ? `<p class="ca-visto">Revisado${f.reviewedBy ? ` por ${esc(f.reviewedBy)}` : ''}</p>` : '<button type="button" class="t-btn-sec ca-ok" data-ok>Revisado</button>'}
    </article>`;
  }).join('');
}

async function carga() {
  try { datos = await rpc('v2_change_log', { organization_id: ctx.organization_id, pending_only: false }) || { rows: [], pending: 0 }; }
  catch (e) { if (/Presidencia|Not authorized/i.test(e.message || '')) { muestra('deniedView'); return; } datos = { rows: [], pending: 0 }; aviso('No se pudo cargar la bitácora.'); }
  pinta();
}

async function revisa(ids) {
  try { await rpc('v2_mark_changes_reviewed', { organization_id: ctx.organization_id, ids }); await carga(); }
  catch (e) { aviso(e.message || 'No se pudo marcar.'); }
}

async function boot() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { location.href = '/'; return; }
  const filas = await rpc('v2_my_context');
  if (!filas?.length) { location.href = '/'; return; }
  ctx = filas[0];
  $('orgName').textContent = ctx.organization_name || '';
  $('caVer').addEventListener('click', e => {
    const b = e.target.closest('[data-ver]'); if (!b) return; ver = b.dataset.ver;
    $('caVer').querySelectorAll('[data-ver]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); pinta();
  });
  $('caLista').addEventListener('click', e => { const b = e.target.closest('[data-ok]'); if (b) { b.disabled = true; revisa([b.closest('[data-id]').dataset.id]); } });
  $('caTodo').addEventListener('click', () => revisa((datos?.rows || []).filter(f => !f.reviewedAt).map(f => f.id)));
  muestra('view'); await carga();
}
boot().catch(e => { console.error(e); $('deniedText').textContent = 'No se pudo abrir. Vuelve a intentar.'; muestra('deniedView'); });
