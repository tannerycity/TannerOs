/* Parches Tanner (PROP-FC-002 · decisión 5; h78 + h80, 09/11/2026).
 *
 * Presidencia: "Los parches que se dan son los de Campeones y la Iniciación".
 * "Campeones, para toda la categoría y desmarcamos quién no". Un parche dice
 * que el Tanner VIVIÓ una experiencia del club: no es un premio por repetir
 * ejercicios, no se compra y no se cuenta ni se compara.
 *
 *   · seccionParches(el, …): en el perfil del Tanner, su fila de parches.
 *     Quien otorga (Dirección/Presidencia) registra uno, marca "Entregado"
 *     y Presidencia revoca con motivo. Si no tiene ninguno, lo dice sin más.
 *   · hojaParchesGrupo(…): registrar a una categoría completa: todos
 *     marcados, se desmarca a quien no; quien ya lo tiene sale "Ya lo tiene".
 *     Al final, la lista "Por entregar" para la ceremonia.
 */
import { getSignedPhotoUrls } from '/v2/photo-cache.js';

// El diseño del parche de Campeones lo eligió Presidencia de entre tres
// (brand/parches/campeon-*.png). La Iniciación aún no tiene arte: se dibuja.
export const ARTE = { campeones: '/brand/parches/campeon-azul.png' };
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hoyMx = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const fechaBonita = f => f ? new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${String(f).slice(0, 10)}T12:00:00`)).replace('.', '') : '';
const iniciales = n => String(n || 'T').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase() || 'T';
const errorDe = e => String(e?.message || e || 'No se pudo').replace(/^.*?ERROR:\s*/, '');

function cargaEstilos() {
  if (document.querySelector('link[href^="/v2/parches/parches.css"]')) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/v2/parches/parches.css?v=20261109a'; document.head.appendChild(l);
}

// El parche dibujado: el arte oficial si existe; si no, un círculo con su nombre.
export function parcheHtml(code, { chico = false, titulo = '' } = {}) {
  const src = ARTE[code];
  const t = esc(titulo || (code === 'iniciacion' ? 'Iniciación' : code === 'campeones' ? 'Campeón' : code));
  return src ? `<img class="par-img${chico ? ' chico' : ''}" src="${esc(src)}" alt="${t}">`
    : `<span class="par-dibujo par-${esc(code)}${chico ? ' chico' : ''}" role="img" aria-label="${t}"><small>${code === 'iniciacion' ? 'INICIACIÓN' : t.toUpperCase()}</small><b>T</b></span>`;
}
const detalle = a => [a.code === 'iniciacion' ? (a.variant === 'baby' ? 'Baby' : 'Tanner') : a.reason, fechaBonita(a.awardedOn)].filter(Boolean).join(' · ');

/* ---------------- Perfil del Tanner ---------------- */
export async function seccionParches(el, { rpc, org, playerId, nombre = '' }) {
  if (!el) return; cargaEstilos();
  let d = null;
  try { d = await rpc('v2_player_patches', { organization_id: org, player_id: playerId }); } catch { el.innerHTML = ''; return; }  // sin permiso: no se enseña
  const vigentes = (d.awards || []).filter(a => !a.revokedAt), revocados = (d.awards || []).filter(a => a.revokedAt);
  el.innerHTML = `<section class="tan-section par-seccion"><div class="tan-section-head"><h2>Parches</h2><span>Lo que ha vivido en el club</span></div>
    ${vigentes.length ? `<div class="par-fila">${vigentes.map(a => `<div class="par-item">${parcheHtml(a.code, { titulo: a.name })}
        <b>${esc(a.code === 'campeones' ? 'Campeón' : 'Iniciación')}</b><small>${esc(detalle(a))}</small>
        ${a.deliveredAt ? '<span class="par-ok">Entregado</span>' : d.canAward ? `<button type="button" class="par-btn" data-par-entregar="${esc(a.id)}">Marcar entregado</button>` : '<span class="par-pend">Por entregar</span>'}
        ${d.canRevoke ? `<button type="button" class="par-link" data-par-revocar="${esc(a.id)}">Revocar</button>` : ''}</div>`).join('')}</div>`
      : '<p class="par-vacio">Todavía sin parches.</p>'}
    ${revocados.length ? `<details class="par-hist"><summary>Revocados (${revocados.length})</summary>${revocados.map(a => `<p>${esc(a.name)} · ${esc(detalle(a))} — ${esc(a.revokeReason || '')}</p>`).join('')}</details>` : ''}
    ${d.canAward ? `<div class="par-acciones">${(d.types || []).map(t => `<button type="button" class="par-btn" data-par-nuevo="${esc(t.code)}">Registrar ${esc(t.code === 'campeones' ? 'Campeón' : 'Iniciación')}</button>`).join('')}</div>` : ''}</section>`;
  el.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    const recarga = () => seccionParches(el, { rpc, org, playerId, nombre });
    try {
      if (b.dataset.parEntregar) { b.disabled = true; await rpc('v2_mark_patch_delivered', { organization_id: org, award_id: b.dataset.parEntregar }); return recarga(); }
      if (b.dataset.parRevocar) {
        const motivo = prompt('¿Por qué se revoca este parche? (queda registrado)');
        if (!motivo || !motivo.trim()) return;
        await rpc('v2_revoke_patch', { organization_id: org, award_id: b.dataset.parRevocar, reason: motivo.trim() }); return recarga();
      }
      if (b.dataset.parNuevo) hojaRegistrar({ rpc, org, code: b.dataset.parNuevo, jugadores: [{ id: playerId, name: nombre, patches: vigentes.map(a => ({ code: a.code, variant: a.variant, reason: a.reason })) }], alTerminar: recarga });
    } catch (err) { b.disabled = false; alert(errorDe(err)); }
  };
}

/* ---------------- Hoja: registrar (uno o una categoría) ---------------- */
function hoja(html) {
  cargaEstilos();
  document.getElementById('parHoja')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div id="parHoja" class="par-capa" role="dialog" aria-modal="true" aria-labelledby="parTitulo"><div class="par-sheet">${html}</div></div>`);
  const h = document.getElementById('parHoja');
  h.addEventListener('click', e => { if (e.target === h || e.target.closest('[data-par-cerrar]')) h.remove(); });
  return h;
}

// Desde Formación (Dirección): elige parche y categoría.
export async function hojaParchesGrupo({ rpc, org }) {
  let base;
  try { base = await rpc('v2_patch_roster', { organization_id: org }); } catch (e) { alert(errorDe(e)); return; }
  const h = hoja(`<header class="par-head"><h2 id="parTitulo">Registrar parches</h2><button type="button" class="par-x" data-par-cerrar aria-label="Cerrar">×</button></header>
    <p class="par-ayuda">Elige el parche y la categoría: salen todos marcados y desmarcas a quien no.</p>
    <div class="par-elige">${['campeones', 'iniciacion'].map((c, i) => `<button type="button" class="par-op${i ? '' : ' activa'}" data-par-code="${c}" aria-pressed="${!i}">${parcheHtml(c, { chico: true })}<b>${c === 'campeones' ? 'Campeón' : 'Iniciación'}</b></button>`).join('')}</div>
    <label class="par-campo">Categoría<select id="parCat"><option value="">Elige…</option>${(base.categories || []).map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label>
    <div id="parLista"><p class="par-ayuda">Elige la categoría para ver a sus Tanners.</p></div>`);
  let code = 'campeones';
  h.querySelector('.par-elige').onclick = e => { const b = e.target.closest('[data-par-code]'); if (!b) return; code = b.dataset.parCode; h.querySelectorAll('[data-par-code]').forEach(x => { x.classList.toggle('activa', x === b); x.setAttribute('aria-pressed', String(x === b)); }); carga(); };
  const carga = async () => {
    const cat = h.querySelector('#parCat').value; if (!cat) return;
    const lista = h.querySelector('#parLista'); lista.innerHTML = '<p class="par-ayuda">Cargando…</p>';
    let r; try { r = await rpc('v2_patch_roster', { organization_id: org, category_id: cat }); } catch (e) { lista.innerHTML = `<p class="par-error">${esc(errorDe(e))}</p>`; return; }
    const catInfo = (base.categories || []).find(c => c.id === cat);
    formularioGrupo(lista, { rpc, org, code, jugadores: r.players || [], categoria: catInfo, alTerminar: () => {} });
  };
  h.querySelector('#parCat').onchange = carga;
}

function hojaRegistrar({ rpc, org, code, jugadores, alTerminar }) {
  const h = hoja(`<header class="par-head"><h2 id="parTitulo">Registrar ${code === 'campeones' ? 'Campeón' : 'Iniciación'}</h2><button type="button" class="par-x" data-par-cerrar aria-label="Cerrar">×</button></header><div id="parLista"></div>`);
  formularioGrupo(h.querySelector('#parLista'), { rpc, org, code, jugadores, alTerminar });
}

function yaLoTiene(j, code, variant, reason) {
  return (j.patches || []).some(p => p.code === code && (code !== 'iniciacion' || p.variant === variant)
    && (code !== 'campeones' || String(p.reason || '').trim().toLowerCase() === String(reason || '').trim().toLowerCase()));
}

function formularioGrupo(cont, { rpc, org, code, jugadores, categoria = null, alTerminar }) {
  const st = { variant: String(categoria?.stage || '').startsWith('baby') ? 'baby' : 'tanner', reason: '', fecha: hoyMx(), fuera: new Set(), enviando: false };
  const pinta = () => {
    const quien = jugadores.filter(j => !st.fuera.has(j.id) && !yaLoTiene(j, code, st.variant, st.reason));
    cont.innerHTML = `
      ${code === 'iniciacion' ? `<div class="par-seg" role="radiogroup" aria-label="Versión">${['baby', 'tanner'].map(v => `<button type="button" role="radio" aria-checked="${st.variant === v}" data-par-var="${v}">${v === 'baby' ? 'Baby' : 'Tanner'}</button>`).join('')}</div>`
        : `<label class="par-campo">¿De qué fueron campeones?<input id="parMotivo" maxlength="140" placeholder="Ej. Campeones Copa León 2026" value="${esc(st.reason)}"></label>`}
      <label class="par-campo">Fecha<input id="parFecha" type="date" max="${hoyMx()}" value="${esc(st.fecha)}"></label>
      <ul class="par-jug">${jugadores.map(j => { const ya = yaLoTiene(j, code, st.variant, st.reason);
        return `<li><label class="${ya ? 'ya' : ''}"><input type="checkbox" data-par-j="${esc(j.id)}" ${ya ? 'disabled' : st.fuera.has(j.id) ? '' : 'checked'}>
          <span class="par-cara" data-foto="${esc(j.photoThumbPath || '')}" data-bucket="${esc(j.photoBucket || 'tanneros-private')}"><b>${esc(iniciales(j.name))}</b></span>
          <span>${esc(j.name)}${ya ? '<small>Ya lo tiene</small>' : ''}</span></label></li>`; }).join('') || '<li class="par-ayuda">No hay Tanners activos en esta categoría.</li>'}</ul>
      <p id="parFalta" class="par-error"></p>
      <button type="button" class="par-primario" id="parGuardar" ${quien.length ? '' : 'disabled'}>${st.enviando ? 'Un momento…' : quien.length ? `Registrar a ${quien.length} ${quien.length === 1 ? 'Tanner' : 'Tanners'}` : 'Nadie seleccionado'}</button>`;
    fotos(cont);
  };
  cont.onclick = async e => {
    const v = e.target.closest('[data-par-var]'); if (v) { st.variant = v.dataset.parVar; pinta(); return; }
    if (!e.target.closest('#parGuardar') || st.enviando) return;
    st.reason = cont.querySelector('#parMotivo')?.value.trim() || st.reason; st.fecha = cont.querySelector('#parFecha').value || hoyMx();
    if (code === 'campeones' && !st.reason) { cont.querySelector('#parFalta').textContent = 'Escribe de qué fueron campeones.'; return; }
    const quien = jugadores.filter(j => !st.fuera.has(j.id) && !yaLoTiene(j, code, st.variant, st.reason));
    st.enviando = true; pinta();
    const hechos = [], fallas = [];
    for (const j of quien) {
      try { const r = await rpc('v2_award_patch', { organization_id: org, player_id: j.id, code, award: { variant: code === 'iniciacion' ? st.variant : null, reason: code === 'campeones' ? st.reason : null, awardedOn: st.fecha, categoryId: categoria?.id || null } });
        hechos.push({ ...j, awardId: r?.id }); }
      catch (err) { fallas.push(`${j.name}: ${errorDe(err)}`); }
    }
    porEntregar(cont, { rpc, org, code, hechos, fallas, st, alTerminar });
  };
  cont.onchange = e => {
    const c = e.target.closest('[data-par-j]');
    if (c) { c.checked ? st.fuera.delete(c.dataset.parJ) : st.fuera.add(c.dataset.parJ); const n = jugadores.filter(j => !st.fuera.has(j.id) && !yaLoTiene(j, code, st.variant, st.reason)).length;
      const b = cont.querySelector('#parGuardar'); b.disabled = !n; b.textContent = n ? `Registrar a ${n} ${n === 1 ? 'Tanner' : 'Tanners'}` : 'Nadie seleccionado'; }
  };
  cont.oninput = e => { if (e.target.id === 'parMotivo') st.reason = e.target.value; if (e.target.id === 'parFecha') st.fecha = e.target.value; };
  pinta();
}

// Después de registrar: la lista para la ceremonia. Se palomea al entregar.
function porEntregar(cont, { rpc, org, code, hechos, fallas, st, alTerminar }) {
  cont.innerHTML = `<div class="par-hecho">${parcheHtml(code)}<h3>${hechos.length} ${hechos.length === 1 ? 'parche registrado' : 'parches registrados'}</h3>
      <p>${esc(code === 'campeones' ? st.reason : `Iniciación ${st.variant === 'baby' ? 'Baby' : 'Tanner'}`)} · ${esc(fechaBonita(st.fecha))}</p></div>
    ${fallas.length ? `<p class="par-error">No se pudo con: ${esc(fallas.join(' · '))}</p>` : ''}
    ${hechos.length ? `<h4 class="par-sub">Por entregar</h4><p class="par-ayuda">Palomea conforme lo entregas en la ceremonia.</p>
      <ul class="par-jug">${hechos.map(j => `<li><label><input type="checkbox" data-par-entrega="${esc(j.awardId || '')}"><span class="par-cara" data-foto="${esc(j.photoThumbPath || '')}" data-bucket="${esc(j.photoBucket || 'tanneros-private')}"><b>${esc(iniciales(j.name))}</b></span><span>${esc(j.name)}</span></label></li>`).join('')}</ul>` : ''}
    <button type="button" class="par-primario" data-par-cerrar>Listo</button>`;
  fotos(cont);
  cont.onclick = e => { if (e.target.closest('[data-par-cerrar]')) { document.getElementById('parHoja')?.remove(); alTerminar?.(); } };
  cont.onchange = async e => {
    const c = e.target.closest('[data-par-entrega]'); if (!c || !c.checked || !c.dataset.parEntrega) return;
    c.disabled = true;
    try { await rpc('v2_mark_patch_delivered', { organization_id: org, award_id: c.dataset.parEntrega }); c.closest('li').classList.add('entregado'); }
    catch (err) { c.checked = false; c.disabled = false; alert(errorDe(err)); }
  };
}

// Las caras: primero iniciales, la foto entra cuando llega (URL firmada de una hora).
async function fotos(cont) {
  const caras = [...cont.querySelectorAll('.par-cara[data-foto]:not([data-foto=""])')];
  if (!caras.length) return;
  const porBucket = {};
  caras.forEach(el => (porBucket[el.dataset.bucket] = porBucket[el.dataset.bucket] || []).push(el.dataset.foto));
  let supabase = null;
  try { ({ supabase } = await import('/v2/shell.js')); } catch { return; }
  for (const b of Object.keys(porBucket)) {
    try { const m = await getSignedPhotoUrls(supabase, b, porBucket[b]) || {};
      caras.forEach(el => { if (el.dataset.bucket === b && m[el.dataset.foto]) el.innerHTML = `<img src="${esc(m[el.dataset.foto])}" alt="">`; }); } catch { /* se quedan las iniciales */ }
  }
}
