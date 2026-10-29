/* VISORÍAS (29/10/2026, h53).
 *
 * Presidencia: "que pueda iniciar mi campaña para saber cuántos se
 * inscribieron, que los visores puedan ver sus datos... con sus fotos".
 *
 *   Arriba   cuántos van de cuántos, la liga para compartir y de dónde
 *            llegaron (año de nacimiento y canal).
 *   Lista    cada niño con su foto, edad, posición y pierna. "Llegó" el día
 *            de la visoría y "Evaluar" con un toque (reporte de Scouting).
 *   Detalle  papá o mamá, WhatsApp, emergencia, salud y firma: sólo quien
 *            tiene Fichajes. El servidor no se lo manda a los visores.
 */
import { createClient } from '/v2/supabase-client.js';
import { getSignedPhotoUrls } from '/v2/photo-cache.js';
import { edad, filtra, porAnio, porCanal, PIERNA, DECISIONES, LIGA_PUBLICA, textoParaCompartir } from '/v2/visorias/visorias.js';

const supabase = createClient('https://pacnegivzgxpanphrnwp.supabase.co', 'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',
  { auth: { persistSession: true, autoRefreshToken: true } });
const PHOTO_BUCKET = 'tanneros-prospect-photos';
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const iniciales = x => `${(x.firstName || '?')[0]}${(x.lastName || '')[0] || ''}`.toUpperCase();
const hora = v => new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit' }).format(new Date(v));

let ctx = null, datos = null, fotos = {}, ver = 'todos', busca = '', evalua = null;
async function rpc(n, p) { const { data, error } = await supabase.rpc(n, p); if (error) throw error; return data; }
function muestra(id) { ['loadingView', 'deniedView', 'view'].forEach(v => $(v).classList.toggle('hidden', v !== id)); }
function aviso(t, tipo) { const m = $('vsMensaje'); m.textContent = t || ''; m.dataset.type = tipo || ''; m.classList.toggle('hidden', !t); }

function pintaCampana() {
  const c = datos.campaign || {}, items = datos.items || [], n = items.length, cupo = c.capacity, llegaron = items.filter(x => x.arrivedAt).length;
  const anios = porAnio(items), canales = porCanal(items);
  $('vsCampana').innerHTML = `
    <div class="vs-cab"><div><p class="vs-eyebrow">VISORÍA</p><h1>${esc(c.title || 'Visoría')}</h1><p class="vs-sub">${esc(c.datesLabel || '')}${c.location ? ` · ${esc(c.location)}` : ''}</p></div></div>
    <div class="vs-numeros">
      <div class="vs-num grande"><b>${n}${cupo ? `<small> de ${cupo}</small>` : ''}</b><span>inscritos</span>${cupo ? `<div class="vs-barra"><i style="width:${Math.min(100, Math.round(n / cupo * 100))}%"></i></div>` : ''}</div>
      <div class="vs-num"><b>${cupo ? Math.max(0, cupo - n) : '—'}</b><span>lugares libres</span></div>
      <div class="vs-num"><b>${llegaron}</b><span>llegaron</span></div>
    </div>
    <div class="vs-liga"><span>${esc(LIGA_PUBLICA.replace('https://', ''))}</span><button type="button" class="vs-boton sec" data-copia>Copiar liga</button><a class="vs-boton" href="https://wa.me/?text=${encodeURIComponent(textoParaCompartir(c))}" target="_blank" rel="noopener">Compartir</a></div>
    ${n ? `<div class="vs-desglose"><div><b>Por año</b>${anios.map(a => `<span>${a.anio} · ${a.n}</span>`).join('')}</div><div><b>Llegaron por</b>${canales.map(a => `<span>${esc(a.canal)} · ${a.n}</span>`).join('')}</div></div>` : ''}`;
}

function tarjeta(x) {
  const e = edad(x.birthDate), foto = fotos[x.photoThumbPath] || fotos[x.photoPath];
  const pos = x.type === 'goalkeeper' ? 'Portero' : (x.position || 'Jugador');
  return `<article class="vs-carta${x.arrivedAt ? ' llego' : ''}" data-id="${esc(x.id)}">
    <div class="vs-foto">${foto ? `<img src="${esc(foto)}" alt="" loading="lazy">` : `<span>${esc(iniciales(x))}</span>`}</div>
    <div class="vs-info">
      <b>${esc(`${x.firstName} ${x.lastName}`)}</b>
      <span>${e !== null ? `${e} años · ` : ''}${esc(String(x.birthDate || '').slice(0, 4))}${x.category ? ` · ${esc(x.category)}` : ''}</span>
      <span>${esc(pos)} · pierna ${esc((PIERNA[x.foot] || '—').toLowerCase())}</span>
      <small>${esc(x.folio || '')}${x.school ? ` · ${esc(x.school)}` : ''}</small>
      <div class="vs-etiquetas">${x.signed ? '<em class="ok">Firmó</em>' : '<em class="falta">Sin firma</em>'}${x.photoPath ? '' : '<em class="falta">Sin foto</em>'}${x.evaluations ? `<em class="eval">${esc(x.verdict || `${x.evaluations} evaluación`)}</em>` : ''}${x.arrivedAt ? `<em class="ok">Llegó ${esc(hora(x.arrivedAt))}</em>` : ''}</div>
    </div>
    <div class="vs-acc">
      ${datos.canWrite ? `<button type="button" class="vs-llego${x.arrivedAt ? ' si' : ''}" data-llego>${x.arrivedAt ? 'Llegó' : 'Marcar llegada'}</button><button type="button" class="vs-evalua" data-evalua>Evaluar</button>` : ''}
      ${datos.canSeeContact ? '<button type="button" class="vs-ver" data-ver-mas>Ver datos</button>' : ''}
    </div>
  </article>`;
}

function pintaLista() {
  const items = filtra(datos.items || [], { ver, busca });
  $('vsLista').innerHTML = items.map(tarjeta).join('');
  const vacio = $('vsVacio'); vacio.classList.toggle('hidden', items.length > 0);
  vacio.textContent = (datos.items || []).length ? 'Nadie con ese filtro.' : 'Todavía no se inscribe nadie. Comparte la liga.';
}
function pinta() { pintaCampana(); pintaLista(); }

async function cargaFotos() {
  const rutas = (datos.items || []).map(x => x.photoThumbPath || x.photoPath).filter(Boolean);
  if (!rutas.length) return;
  try { fotos = { ...fotos, ...(await getSignedPhotoUrls(supabase, PHOTO_BUCKET, rutas)) }; pintaLista(); } catch { /* sin fotos se ven las iniciales */ }
}

async function carga() {
  datos = await rpc('v2_visoria_board', { organization_id: ctx.organization_id, slug: null });
  if (!datos?.campaign) { $('vsCampana').innerHTML = '<div class="vs-cab"><h1>Visorías</h1><p class="vs-sub">Todavía no hay una visoría abierta.</p></div>'; $('vsLista').innerHTML = ''; return; }
  pinta(); cargaFotos();
}

/* Datos de la familia: sólo llega si el servidor lo mandó (Fichajes). */
function verDatos(x) {
  const s = x.salud || {}, em = x.emergencia || {}, wa = String(x.phone || '').replace(/\D/g, '');
  const fila = (t, v) => v ? `<div><dt>${t}</dt><dd>${esc(v)}</dd></div>` : '';
  document.body.insertAdjacentHTML('beforeend', '<div id="vsFondo" class="vs-fondo"></div><section id="vsHoja" class="vs-hoja" role="dialog" aria-modal="true" aria-label="Datos"></section>');
  document.body.style.overflow = 'hidden';
  $('vsHoja').innerHTML = `<header class="vs-ev-cab"><div><h2>${esc(`${x.firstName} ${x.lastName}`)}</h2><p>${esc(x.folio || '')}</p></div><button type="button" class="vs-cierra" data-cierra aria-label="Cerrar">×</button></header>
    <dl class="vs-datos">${fila('Papá, mamá o tutor', x.guardian)}${fila('WhatsApp', x.phone)}${fila('Correo', x.email)}
      ${fila('Emergencia', [em.nombre, em.telefono].filter(Boolean).join(' · '))}${fila('Alergias', s.alergias)}${fila('Lesiones', s.lesiones)}${fila('Medicamentos', s.medicamentos)}${fila('Seguro', s.seguro)}
      ${fila('Firmó', x.signedBy ? `${x.signedBy}${x.signedAt ? ` · ${new Date(x.signedAt).toLocaleString('es-MX')}` : ''}` : '')}${fila('Fotos para redes', x.imageConsent ? 'Sí autorizó' : 'No autorizó')}</dl>
    ${wa ? `<a class="vs-guarda" href="https://wa.me/${wa}" target="_blank" rel="noopener">WhatsApp a ${esc(x.guardian || 'la familia')}</a>` : ''}`;
  $('vsFondo').onclick = cierraEvaluacion;
  $('vsHoja').onclick = e => { if (e.target.closest('[data-cierra]')) cierraEvaluacion(); };
}

async function marcaLlegada(x, btn) {
  btn.disabled = true;
  try { const r = await rpc('v2_visoria_arrival', { organization_id: ctx.organization_id, prospect_id: x.id, value: !x.arrivedAt }); x.arrivedAt = r?.arrivedAt || null; pinta(); }
  catch (e) { btn.disabled = false; aviso(e.message || 'No se pudo marcar.'); }
}

/* Evaluar: cuatro calificaciones de un toque, la decisión y una nota. */
function abreEvaluacion(x) {
  evalua = { x, notas: { technical: null, physical: null, tactical: null, mental: null }, decision: 'follow', guardando: false };
  document.body.insertAdjacentHTML('beforeend', '<div id="vsFondo" class="vs-fondo"></div><section id="vsHoja" class="vs-hoja" role="dialog" aria-modal="true" aria-label="Evaluar"></section>');
  document.body.style.overflow = 'hidden';
  $('vsFondo').onclick = cierraEvaluacion;
  $('vsHoja').onclick = e => {
    if (e.target.closest('[data-cierra]')) return cierraEvaluacion();
    const n = e.target.closest('[data-nota]'); if (n) { evalua.notas[n.dataset.campo] = Number(n.dataset.nota); return pintaEvaluacion(); }
    const d = e.target.closest('[data-decision]'); if (d) { evalua.decision = d.dataset.decision; return pintaEvaluacion(); }
    if (e.target.closest('[data-guarda]')) guardaEvaluacion();
  };
  pintaEvaluacion();
}
function cierraEvaluacion() { evalua = null; $('vsHoja')?.remove(); $('vsFondo')?.remove(); document.body.style.overflow = ''; }
function pintaEvaluacion() {
  const h = $('vsHoja'); if (!h || !evalua) return; const { x, notas, decision } = evalua;
  const fila = (k, t) => `<div class="vs-ev-fila"><span>${t}</span><div>${[1, 2, 3, 4, 5].map(v => `<button type="button" data-campo="${k}" data-nota="${v}" aria-pressed="${notas[k] === v}">${v}</button>`).join('')}</div></div>`;
  const nota = h.querySelector('#vsNota')?.value || '';
  h.innerHTML = `<header class="vs-ev-cab"><div><h2>${esc(`${x.firstName} ${x.lastName}`)}</h2><p>${esc(x.folio || '')} · ${edad(x.birthDate) ?? '—'} años</p></div><button type="button" class="vs-cierra" data-cierra aria-label="Cerrar">×</button></header>
    ${fila('technical', 'Técnica')}${fila('physical', 'Físico')}${fila('tactical', 'Táctica')}${fila('mental', 'Actitud')}
    <div class="vs-ev-decision">${DECISIONES.map(d => `<button type="button" data-decision="${d.k}" aria-pressed="${decision === d.k}">${d.t}</button>`).join('')}</div>
    <textarea id="vsNota" rows="3" maxlength="2000" placeholder="Nota (opcional)">${esc(nota)}</textarea>
    <button type="button" class="vs-guarda" data-guarda${evalua.guardando ? ' disabled' : ''}>${evalua.guardando ? 'Guardando…' : 'Guardar evaluación'}</button>`;
}
async function guardaEvaluacion() {
  if (!evalua || evalua.guardando) return;
  const { x, notas, decision } = evalua, d = DECISIONES.find(v => v.k === decision), c = datos.campaign || {};
  const nota = $('vsNota').value.trim();
  evalua.guardando = true; pintaEvaluacion(); $('vsNota').value = nota;
  try {
    await rpc('v2_create_scouting_report', {
      organization_id: ctx.organization_id, prospect_id: x.id, observed_name: `${x.firstName} ${x.lastName}`, observed_at: new Date().toISOString(),
      observed_location: c.location || c.title || 'Visoría', player_position: x.type === 'goalkeeper' ? 'Portero' : (x.position || null), category: x.category || null,
      technical_score: notas.technical ? notas.technical * 2 : null, physical_score: notas.physical ? notas.physical * 2 : null,
      tactical_score: notas.tactical ? notas.tactical * 2 : null, mental_score: notas.mental ? notas.mental * 2 : null,
      star_quality: null, verdict: d.verdict, notes: nota || null, birth_date: x.birthDate || null, dominant_foot: PIERNA[x.foot] || null });
    x.evaluations = Number(x.evaluations || 0) + 1; x.verdict = d.verdict;
    cierraEvaluacion(); pintaLista(); aviso(`Evaluación de ${x.firstName} guardada.`, 'success');
  } catch (e) { if (evalua) { evalua.guardando = false; pintaEvaluacion(); } aviso(e.message || 'No se pudo guardar la evaluación.'); }
}

$('vsLista').addEventListener('click', e => {
  const carta = e.target.closest('.vs-carta'); if (!carta) return;
  const x = (datos.items || []).find(i => i.id === carta.dataset.id); if (!x) return;
  const ll = e.target.closest('[data-llego]'); if (ll) return marcaLlegada(x, ll);
  if (e.target.closest('[data-evalua]')) return abreEvaluacion(x);
  if (e.target.closest('[data-ver-mas]')) return verDatos(x);
});
$('vsVer').addEventListener('click', e => { const b = e.target.closest('[data-ver]'); if (!b) return; ver = b.dataset.ver; $('vsVer').querySelectorAll('[data-ver]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); pintaLista(); });
$('vsBusca').addEventListener('input', e => { busca = e.target.value; pintaLista(); });
$('vsCampana').addEventListener('click', async e => {
  if (!e.target.closest('[data-copia]')) return;
  try { await navigator.clipboard.writeText(LIGA_PUBLICA); aviso('Liga copiada.', 'success'); } catch { aviso(LIGA_PUBLICA); }
});

async function arranca() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { location.href = '/v2'; return; }
  const rows = await rpc('v2_my_context'); ctx = rows?.[0];
  if (!ctx) { muestra('deniedView'); return; }
  $('orgName').textContent = ctx.organization_name || '';
  try { await carga(); muestra('view'); }
  catch (e) { $('deniedText').textContent = /Not authorized/i.test(e?.message || '') ? 'Las visorías las ven Fichajes y Scouting.' : (e.message || 'No se pudo abrir.'); muestra('deniedView'); }
}
arranca();
