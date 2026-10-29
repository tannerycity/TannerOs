/* VISORÍAS (29/10/2026, h53 · h54).
 *
 * Presidencia: "que pueda iniciar mi campaña para saber cuántos se
 * inscribieron, que los visores puedan ver sus datos... con sus fotos". Y
 * luego (h54): "que cada menor cuente con una autorización válida,
 * verificable y auditable antes de entrar a una visoría".
 *
 *   Inscritos   cuántos van, la liga, cada niño con su foto, su estado de
 *               acceso, "Llegó" y "Evaluar".
 *   Acceso      la hoja de la puerta: Autorizado, Pendiente, Revisión médica,
 *               Sin consentimiento, No apto. Sólo pasa Autorizado.
 *   Evento      lo legal del evento, el seguro real, las tres aprobaciones,
 *               los documentos y la bitácora. Sin eso la firma no abre.
 *   Incidentes  hechos, no culpas; nada se reescribe, se agrega.
 *
 * Detalle de cada niño: contacto, emergencia, quién firmó y cómo se verificó
 * (Fichajes). La ficha de salud sólo con el permiso "Visoría · Salud", con
 * motivo, y queda en la bitácora. El servidor no se la manda a nadie más.
 */
import { createClient } from '/v2/supabase-client.js';
import { getSignedPhotoUrls } from '/v2/photo-cache.js';
import { nombreDelClub } from '/v2/club.js';
import { edad, filtra, porAnio, porCanal, PIERNA, DECISIONES, LIGA_PUBLICA, textoParaCompartir,
  ACCESO, estadoDe, resumenAcceso, ordenaPorAcceso, PARENTESCO, VERIFICACION, CAMPOS_LEGALES, SEGURO, APROBACIONES, faltante } from '/v2/visorias/visorias.js';

const supabase = createClient('https://pacnegivzgxpanphrnwp.supabase.co', 'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',
  { auth: { persistSession: true, autoRefreshToken: true } });
const PHOTO_BUCKET = 'tanneros-prospect-photos';
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const iniciales = x => `${(x.firstName || '?')[0]}${(x.lastName || '')[0] || ''}`.toUpperCase();
const hora = v => new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit' }).format(new Date(v));
const fecha = v => v ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City' }).format(new Date(v)) : '';

let ctx = null, datos = null, fotos = {}, ver = 'todos', busca = '', evalua = null, vista = 'inscritos', evento = null, incidentes = null, verAcceso = 'todos';
async function rpc(n, p) { const { data, error } = await supabase.rpc(n, p); if (error) throw error; return data; }
function muestra(id) { ['loadingView', 'deniedView', 'view'].forEach(v => $(v).classList.toggle('hidden', v !== id)); }
function aviso(t, tipo) { const m = $('vsMensaje'); m.textContent = t || ''; m.dataset.type = tipo || ''; m.classList.toggle('hidden', !t); if (t) m.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
const chip = x => { const k = estadoDe(x), a = ACCESO[k] || ACCESO.SIN_CONSENTIMIENTO; return `<em class="acc-${a.tono}" title="${esc(x.access?.reason || '')}">${esc(a.t)}</em>`; };

function pintaCampana() {
  const c = datos.campaign || {}, items = datos.items || [], n = items.length, cupo = c.capacity, llegaron = items.filter(x => x.arrivedAt).length;
  const anios = porAnio(items), canales = porCanal(items), r = resumenAcceso(items);
  $('vsCampana').innerHTML = `
    <div class="vs-cab"><div><p class="vs-eyebrow">VISORÍA</p><h1>${esc(c.title || 'Visoría')}</h1><p class="vs-sub">${esc(c.datesLabel || '')}${c.location ? ` · ${esc(c.location)}` : ''}</p></div></div>
    ${c.signingOpen ? '' : `<div class="vs-alerta" role="status"><b>La firma del consentimiento está cerrada.</b> Las familias sólo pueden apartar lugar. ${datos.canSeeContact ? 'Completa el evento y sus tres aprobaciones en <button type="button" class="vs-enlace" data-vista-ir="evento">Evento</button>.' : ''}</div>`}
    <div class="vs-numeros">
      <div class="vs-num grande"><b>${n}${cupo ? `<small> de ${cupo}</small>` : ''}</b><span>inscritos</span>${cupo ? `<div class="vs-barra"><i style="width:${Math.min(100, Math.round(n / cupo * 100))}%"></i></div>` : ''}</div>
      <div class="vs-num"><b>${r.AUTORIZADO}</b><span>autorizados</span></div>
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
      <div class="vs-etiquetas">${chip(x)}${x.photoPath ? '' : '<em class="falta">Sin foto</em>'}${x.evaluations ? `<em class="eval">${esc(x.verdict || `${x.evaluations} evaluación`)}</em>` : ''}${x.arrivedAt ? `<em class="ok">Llegó ${esc(hora(x.arrivedAt))}</em>` : ''}</div>
    </div>
    <div class="vs-acc">
      ${datos.canWrite ? `<button type="button" class="vs-llego${x.arrivedAt ? ' si' : ''}" data-llego>${x.arrivedAt ? 'Llegó' : 'Marcar llegada'}</button><button type="button" class="vs-evalua" data-evalua>Evaluar</button>` : ''}
      ${datos.canSeeContact ? '<button type="button" class="vs-ver" data-ver-mas>Ver datos y consentimiento</button>' : ''}
    </div>
  </article>`;
}

function pintaLista() {
  const items = filtra(datos.items || [], { ver, busca });
  $('vsLista').innerHTML = items.map(tarjeta).join('');
  const vacio = $('vsVacio'); vacio.classList.toggle('hidden', items.length > 0);
  vacio.textContent = (datos.items || []).length ? 'Nadie con ese filtro.' : 'Todavía no se inscribe nadie. Comparte la liga.';
}

/* La hoja de la puerta. Sólo AUTORIZADO entra; el motivo dice qué falta. */
function pintaAcceso() {
  const todos = datos.items || [], r = resumenAcceso(todos);
  const items = ordenaPorAcceso(todos).filter(x => verAcceso === 'todos' || estadoDe(x) === verAcceso)
    .filter(x => !busca || `${x.firstName} ${x.lastName} ${x.folio}`.toLowerCase().includes(busca.toLowerCase()));
  const boton = (k, t) => `<button type="button" data-acceso="${k}" aria-pressed="${verAcceso === k}">${t}${k === 'todos' ? '' : ` · ${r[k] || 0}`}</button>`;
  $('vsAcceso').innerHTML = `
    <p class="vs-recuerda">Un consentimiento firmado no sustituye la revisión de la cancha, la hidratación, la supervisión, el botiquín, el contacto de emergencias ni el protocolo de protección infantil.</p>
    <div class="vs-seg vs-seg-acceso" role="group" aria-label="Estado">${boton('todos', 'Todos')}${boton('AUTORIZADO', 'Autorizados')}${boton('PENDIENTE', 'Pendientes')}${boton('REVISION_MEDICA', 'Revisión médica')}${boton('SIN_CONSENTIMIENTO', 'Sin consentimiento')}${boton('NO_APTO', 'No aptos')}</div>
    <ol class="vs-puerta">${items.map(x => `<li data-id="${esc(x.id)}" class="acc-${(ACCESO[estadoDe(x)] || {}).tono || 'falta'}">
      <div><b>${esc(`${x.firstName} ${x.lastName}`)}</b><small>${esc(x.folio || '')} · ${edad(x.birthDate) ?? '—'} años</small></div>
      <div class="vs-puerta-estado">${chip(x)}${x.access?.reason ? `<small>${esc(x.access.reason)}</small>` : ''}</div>
      ${datos.canSeeContact ? '<button type="button" class="vs-boton sec" data-ver-mas>Abrir</button>' : ''}</li>`).join('') || '<li class="vs-vacio">Nadie en este estado.</li>'}</ol>`;
}

function pinta() {
  pintaCampana();
  ['inscritos', 'acceso', 'evento', 'incidentes'].forEach(v => $(`vsVista_${v}`).classList.toggle('hidden', v !== vista));
  document.querySelectorAll('[data-vista]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.vista === vista)));
  $('vsTabEvento').classList.toggle('hidden', !datos.canSeeContact);
  document.querySelector('.vs-filtros').classList.toggle('hidden', vista === 'evento' || vista === 'incidentes');
  $('vsVer').classList.toggle('hidden', vista !== 'inscritos');
  if (vista === 'inscritos') pintaLista();
  if (vista === 'acceso') pintaAcceso();
  if (vista === 'evento') pintaEvento();
  if (vista === 'incidentes') pintaIncidentes();
}

async function cargaFotos() {
  const rutas = (datos.items || []).map(x => x.photoThumbPath || x.photoPath).filter(Boolean);
  if (!rutas.length) return;
  try { fotos = { ...fotos, ...(await getSignedPhotoUrls(supabase, PHOTO_BUCKET, rutas)) }; if (vista === 'inscritos') pintaLista(); } catch { /* sin fotos se ven las iniciales */ }
}

async function carga() {
  datos = await rpc('v2_visoria_board', { organization_id: ctx.organization_id, slug: null });
  if (!datos?.campaign) { $('vsCampana').innerHTML = '<div class="vs-cab"><h1>Visorías</h1><p class="vs-sub">Todavía no hay una visoría abierta.</p></div>'; $('vsLista').innerHTML = ''; return; }
  pinta(); cargaFotos();
}

/* ---------- Hoja de cada niño ---------- */
function abreHoja(etiqueta) {
  cierraHoja();
  document.body.insertAdjacentHTML('beforeend', `<div id="vsFondo" class="vs-fondo"></div><section id="vsHoja" class="vs-hoja" role="dialog" aria-modal="true" aria-label="${esc(etiqueta)}"></section>`);
  document.body.style.overflow = 'hidden';
  $('vsFondo').onclick = cierraHoja;
  return $('vsHoja');
}
function cierraHoja() { evalua = null; $('vsHoja')?.remove(); $('vsFondo')?.remove(); document.body.style.overflow = ''; }

function verDatos(x) {
  const h = abreHoja('Datos y consentimiento'), em = x.emergencia || {}, wa = String(x.phone || '').replace(/\D/g, '');
  const fila = (t, v) => v ? `<div><dt>${t}</dt><dd>${esc(v)}</dd></div>` : '';
  const k = x.access?.consentId, st = x.access?.consentStatus, a = estadoDe(x);
  h.innerHTML = `<header class="vs-ev-cab"><div><h2>${esc(`${x.firstName} ${x.lastName}`)}</h2><p>${esc(x.folio || '')}</p></div><button type="button" class="vs-cierra" data-cierra aria-label="Cerrar">×</button></header>
    <div class="vs-estado-acceso acc-${(ACCESO[a] || {}).tono}"><b>${esc((ACCESO[a] || {}).t || a)}</b>${x.access?.reason ? `<span>${esc(x.access.reason)}</span>` : ''}</div>
    <dl class="vs-datos">${fila('Papá, mamá o tutor', x.guardian)}${fila('Parentesco declarado', PARENTESCO[x.relationship] || '')}${fila('WhatsApp', x.phone)}${fila('Correo', x.email)}
      ${fila('Emergencia', [em.nombre, em.telefono].filter(Boolean).join(' · '))}${fila('Puede recogerlo', x.recoge)}
      ${fila('Firmó', x.signedBy ? `${x.signedBy} · ${PARENTESCO[x.signedRelationship] || ''} · ${fecha(x.signedAt)}` : '')}
      ${fila('Identidad', x.verifiedAt ? `${VERIFICACION[x.verification] || x.verification} · ${fecha(x.verifiedAt)}` : (k ? 'Sin verificar' : ''))}
      ${fila('Revisión de facultades', x.reviewReason || '')}${fila('Fotos para redes', x.imageConsent ? 'Sí autorizó' : 'No autorizó')}
      ${x.transfer === true || x.transfer === false ? fila('Datos al evaluador', x.transfer ? 'Sí autorizó' : 'No autorizó') : ''}
      ${fila('Alerta operativa', x.alert ? (x.alertNote || 'Sí') : '')}</dl>
    ${datos.canWrite || datos.canSeeContact ? `<div class="vs-acciones">
      ${k && st !== 'signed' && !x.verifiedAt ? `<div class="vs-bloque"><b>Verificar identidad de quien firmó</b>
        <div class="vs-seg" role="group">${Object.entries(VERIFICACION).map(([m, t], i) => `<button type="button" data-metodo="${m}" aria-pressed="${i === 0}">${t}</button>`).join('')}</div>
        <input id="vsRef" maxlength="200" placeholder="Referencia: 'el pase llegó del 477…', 'INE vista en la entrada'">
        <button type="button" class="vs-guarda" data-verifica="${esc(k)}">Verificar identidad</button></div>` : ''}
      ${k && st === 'requires_review' ? `<div class="vs-bloque"><b>Facultades de quien firmó</b><textarea id="vsRevNota" rows="2" placeholder="Qué revisaste (documento de tutela, acuerdo, etc.)"></textarea>
        <div class="vs-dos"><button type="button" class="vs-guarda" data-revisa="si">Tiene facultades</button><button type="button" class="vs-guarda rojo" data-revisa="no">No tiene: anular</button></div></div>` : ''}
      ${k && datos.canHealth ? '<button type="button" class="vs-boton sec" data-salud>Ficha de salud (restringida)</button>' : ''}
      ${k && x.hasCopy ? '<button type="button" class="vs-boton sec" data-expediente>Descargar expediente (PDF)</button>' : ''}
      ${k && !x.hasCopy ? '<button type="button" class="vs-boton sec" data-genera>Generar expediente</button>' : ''}
      ${a !== 'AUTORIZADO' || !k ? `<button type="button" class="vs-boton" data-manda-liga>Mandar liga para firmar por WhatsApp</button>` : ''}
      <button type="button" class="vs-boton sec" data-alerta>${x.alert ? 'Quitar alerta operativa' : 'Poner alerta operativa'}</button>
      ${x.imageConsent ? '<button type="button" class="vs-boton sec" data-quita-imagen>La familia retira el permiso de fotos</button>' : ''}
      ${k ? '<button type="button" class="vs-boton sec rojo" data-anula>Anular consentimiento</button>' : ''}
    </div>` : ''}
    ${wa ? `<a class="vs-guarda" href="https://wa.me/${wa}" target="_blank" rel="noopener">WhatsApp a ${esc(x.guardian || 'la familia')}</a>` : ''}`;
  h.onclick = e => accionHoja(e, x);
}

async function accionHoja(e, x) {
  const t = e.target, h = $('vsHoja'), k = x.access?.consentId;
  if (t.closest('[data-cierra]')) return cierraHoja();
  const m = t.closest('[data-metodo]');
  if (m) { h.querySelectorAll('[data-metodo]').forEach(b => b.setAttribute('aria-pressed', String(b === m))); return; }
  const corre = async (btn, fn, ok) => {
    btn.disabled = true;
    try { const r = await fn(); if (r?.error) throw new Error(r.error); cierraHoja(); aviso(ok, 'success'); await carga(); }
    catch (err) { btn.disabled = false; aviso(err.message || 'No se pudo.'); }
  };
  const v = t.closest('[data-verifica]');
  if (v) {
    const metodo = h.querySelector('[data-metodo][aria-pressed="true"]')?.dataset.metodo, ref = $('vsRef').value.trim();
    if (ref.length < 3) return aviso('Escribe la referencia de cómo verificaste.');
    return corre(v, () => rpc('v2_visoria_verify', { organization_id: ctx.organization_id, consent_id: k, method: metodo, reference: ref }), `Identidad verificada para ${x.firstName}.`);
  }
  const rv = t.closest('[data-revisa]');
  if (rv) {
    const nota = $('vsRevNota').value.trim(); if (nota.length < 5) return aviso('Escribe qué revisaste.');
    return corre(rv, () => rpc('v2_visoria_review', { organization_id: ctx.organization_id, consent_id: k, approve: rv.dataset.revisa === 'si', note: nota }), 'Revisión guardada.');
  }
  const an = t.closest('[data-anula]');
  if (an) {
    const motivo = prompt('¿Por qué se anula? Queda en la bitácora y la familia tendrá que firmar de nuevo.'); if (!motivo || motivo.trim().length < 5) return;
    return corre(an, () => rpc('v2_visoria_invalidate', { organization_id: ctx.organization_id, consent_id: k, reason: motivo.trim() }), 'Consentimiento anulado.');
  }
  const al = t.closest('[data-alerta]');
  if (al) {
    let nota = null;
    if (!x.alert) { nota = prompt('¿Cuál es la alerta? (sin datos médicos: "revisar con coordinador", "falta autorización de recogida"...)'); if (!nota || nota.trim().length < 3) return; }
    return corre(al, () => rpc('v2_visoria_alert', { organization_id: ctx.organization_id, prospect_id: x.id, value: !x.alert, note: nota }), x.alert ? 'Alerta retirada.' : 'Alerta puesta: no entra a la cancha.');
  }
  const qi = t.closest('[data-quita-imagen]');
  if (qi) {
    const fuente = prompt('¿Cómo lo pidió la familia? (Ej. "WhatsApp de la mamá 29/10")'); if (!fuente || fuente.trim().length < 3) return;
    return corre(qi, () => rpc('v2_visoria_media', { organization_id: ctx.organization_id, prospect_id: x.id, value: false, source: fuente.trim() }), 'Permiso de fotos retirado desde hoy.');
  }
  const ml = t.closest('[data-manda-liga]');
  if (ml) {
    ml.disabled = true;
    try {
      const r = await rpc('v2_visoria_sign_link', { organization_id: ctx.organization_id, prospect_id: x.id });
      const url = `${LIGA_PUBLICA}/#firmar=${r.token}`, wa = String(r.phone || '').replace(/\D/g, '').replace(/^(\d{10})$/, '52$1');
      const txt = `Hola ${r.guardian || ''}. Para que ${r.firstName} entre a la visoría de ${nombreDelClub(ctx)} falta firmar el consentimiento. Es tu liga personal (no la compartas): ${url}`;
      window.open(`https://wa.me/${wa}?text=${encodeURIComponent(txt)}`, '_blank', 'noopener');
    } catch (err) { aviso(err.message || 'No se pudo crear la liga.'); }
    ml.disabled = false; return;
  }
  const ex = t.closest('[data-expediente],[data-genera]');
  if (ex) {
    ex.disabled = true;
    try {
      const { data, error } = await supabase.functions.invoke('visoria-expediente', { body: { action: ex.dataset.genera !== undefined ? 'build' : 'copy', consentId: k } });
      if (error || data?.error) throw new Error(data?.error || 'No se pudo.');
      if (data.url) window.open(data.url, '_blank', 'noopener'); else { cierraHoja(); aviso('Expediente generado.', 'success'); await carga(); }
    } catch (err) { aviso(err.message || 'No se pudo.'); }
    ex.disabled = false; return;
  }
  if (t.closest('[data-salud]')) return verSalud(x);
}

/* Ficha de salud: con motivo, auditada, y sólo con el permiso de salud. */
async function verSalud(x) {
  const motivo = prompt('¿Para qué la abres? Queda en la bitácora. (Ej. "revisión médica previa al evento")');
  if (!motivo || motivo.trim().length < 3) return;
  try {
    const r = await rpc('v2_visoria_health', { organization_id: ctx.organization_id, consent_id: x.access.consentId, reason: motivo.trim() });
    if (r?.error) throw new Error('Tu perfil no tiene permiso para ver datos de salud.');
    const h = abreHoja('Ficha de salud'), R = { ninguna: 'Ninguna conocida', privado: 'Lo dirá en privado al coordinador', si: 'Sí' };
    const P = { condicion: 'Lesión o condición actual', alergias: 'Alergias', restriccion: 'Restricción médica', atencion: 'Atención o medicamento' };
    h.innerHTML = `<header class="vs-ev-cab"><div><h2>Salud · ${esc(x.firstName)}</h2><p>Dato sensible. No lo compartas ni lo copies a chats.</p></div><button type="button" class="vs-cierra" data-cierra aria-label="Cerrar">×</button></header>
      <dl class="vs-datos">${Object.entries(P).map(([q, t]) => `<div><dt>${t}</dt><dd>${esc(R[r.answers?.[q]?.respuesta] || '—')}${r.answers?.[q]?.detalle ? `: ${esc(r.answers[q].detalle)}` : ''}</dd></div>`).join('')}
        <div><dt>Revisión</dt><dd>${esc({ no_requiere: 'No requiere', pendiente: 'Pendiente', apto: 'Apto', no_apto: 'No apto' }[r.reviewStatus] || r.reviewStatus)}${r.reviewNote ? ` · ${esc(r.reviewNote)}` : ''}</dd></div></dl>
      <textarea id="vsSaludNota" rows="2" placeholder="Nota de la revisión (qué se acordó con la familia)"></textarea>
      <div class="vs-dos"><button type="button" class="vs-guarda" data-apto="apto">Apto para participar</button><button type="button" class="vs-guarda rojo" data-apto="no_apto">No apto</button></div>`;
    h.onclick = async e => {
      if (e.target.closest('[data-cierra]')) return cierraHoja();
      const b = e.target.closest('[data-apto]'); if (!b) return;
      const nota = $('vsSaludNota').value.trim(); if (nota.length < 5) return aviso('Escribe la nota de la revisión.');
      b.disabled = true;
      try { await rpc('v2_visoria_health_review', { organization_id: ctx.organization_id, consent_id: x.access.consentId, decision: b.dataset.apto, note: nota }); cierraHoja(); aviso('Revisión médica guardada.', 'success'); await carga(); }
      catch (err) { b.disabled = false; aviso(err.message || 'No se pudo.'); }
    };
  } catch (e) { aviso(e.message || 'No se pudo abrir la ficha.'); }
}

/* ---------- Evento: lo legal, el seguro y las aprobaciones ---------- */
async function cargaEvento() {
  evento = await rpc('v2_visoria_setup', { organization_id: ctx.organization_id, slug: datos.campaign.slug });
}
function pintaEvento() {
  const box = $('vsEvento');
  if (!evento) { box.innerHTML = '<p class="vs-vacio">Cargando el evento…</p>'; cargaEvento().then(pintaEvento).catch(e => { box.innerHTML = `<p class="vs-vacio">${esc(e.message || 'No se pudo abrir.')}</p>`; }); return; }
  const c = evento.campaign, puede = evento.canAdmin, l = c.legal || {};
  const vigente = g => (evento.approvals || []).find(a => a.gate === g && a.current);
  const docs = evento.documents || [];
  box.innerHTML = `
    <div class="vs-bloque ${evento.missing.length ? 'falta' : 'ok'}"><b>${evento.missing.length ? 'La firma está cerrada' : 'La firma está abierta'}</b>
      ${evento.missing.length ? `<ul>${evento.missing.map(m => `<li>${esc(faltante(m))}</li>`).join('')}</ul>` : '<span>Todo aprobado para esta versión del evento.</span>'}
      <small>Huella del evento: ${esc(String(evento.eventHash).slice(0, 16))}… Si cambia algo importante (sede, organizador, seguro, evaluador, textos), las aprobaciones y las firmas anteriores dejan de valer solas.</small></div>
    <h3 class="vs-h3">Aprobaciones</h3>
    <div class="vs-aprob">${APROBACIONES.map(a => { const v = vigente(a.k); return `<div class="${v ? 'ok' : ''}"><b>${a.t}</b><small>${esc(a.ayuda)}</small>
      ${v ? `<span>Aprobada ${esc(fecha(v.approvedAt))} · ${esc(v.note)}</span>${puede ? `<button type="button" class="vs-boton sec" data-retira="${a.k}">Retirar</button>` : ''}` : (puede ? `<textarea data-nota-aprob="${a.k}" rows="2" placeholder="Quién revisó y cuándo (Ej. Lic. ..., 30/10/2026)"></textarea><button type="button" class="vs-boton" data-aprueba="${a.k}">Aprobar ${a.t.toLowerCase()}</button>` : '<span>Pendiente</span>')}</div>`; }).join('')}</div>
    <h3 class="vs-h3">Seguro</h3>
    <div class="vs-form">
      <div class="vs-seg vs-seg-col" role="radiogroup">${Object.entries(SEGURO).map(([k, t]) => `<button type="button" data-seguro="${k}" aria-pressed="${c.insurance === k}"${puede ? '' : ' disabled'}>${t}</button>`).join('')}</div>
      <label><span>Si hay seguro: aseguradora, póliza, qué cubre y límites</span><textarea id="vsSeguroDetalle" rows="3"${puede ? '' : ' disabled'}>${esc(c.insuranceDetail || '')}</textarea></label>
      <small>No se puede afirmar "sin seguro" ni "con seguro" sin verificarlo para este evento.</small></div>
    <h3 class="vs-h3">Datos legales del evento</h3>
    <div class="vs-form">
      <label><span>Sede (domicilio completo)</span><input id="vsSede" value="${esc(c.location || '')}"${puede ? '' : ' disabled'}></label>
      ${CAMPOS_LEGALES.map(f => `<label><span>${esc(f.t)}${f.opcional ? ' <em>opcional</em>' : ''}</span>${f.largo ? `<textarea data-legal="${f.k}" rows="3"${puede ? '' : ' disabled'}>${esc(l[f.k] || '')}</textarea>` : `<input data-legal="${f.k}" value="${esc(l[f.k] || '')}"${puede ? '' : ' disabled'}>`}${f.ayuda ? `<small>${esc(f.ayuda)}</small>` : ''}</label>`).join('')}
      ${puede ? '<button type="button" class="vs-guarda" data-guarda-evento>Guardar datos del evento</button>' : '<small>Sólo Presidencia edita y aprueba.</small>'}</div>
    <h3 class="vs-h3">Documentos</h3>
    <ul class="vs-docs">${docs.map(d => `<li><div><b>${esc(d.title)}</b><small>${esc(d.version)} · ${esc({ plantilla: 'Plantilla vigente', aprobado: 'Aprobado para esta visoría', reemplazado: 'Reemplazado', retirada: 'Retirada' }[d.status] || d.status)} · SHA-256 ${esc(String(d.hash).slice(0, 12))}…</small></div>
      <button type="button" class="vs-boton sec" data-doc="${esc(d.id)}">Ver</button>${puede && !d.campaign ? `<button type="button" class="vs-boton sec" data-nueva-version="${esc(d.kind)}">Nueva versión</button>` : ''}</li>`).join('')}</ul>
    <h3 class="vs-h3">Bitácora</h3>
    <ol class="vs-bitacora">${(evento.audit || []).map(a => `<li class="${a.result === 'rechazado' ? 'rechazo' : ''}"><time>${esc(fecha(a.at))}</time><span>${esc(a.action.replace(/_/g, ' '))}${a.result === 'rechazado' ? ' · rechazado' : ''}${a.reason ? ` · ${esc(a.reason)}` : ''}</span><small>${esc(a.kind)}</small></li>`).join('') || '<li>Sin movimientos.</li>'}</ol>`;
}

async function accionEvento(e) {
  const t = e.target, c = evento?.campaign;
  if (!c) return;
  const s = t.closest('[data-seguro]');
  if (s) { $('vsEvento').querySelectorAll('[data-seguro]').forEach(b => b.setAttribute('aria-pressed', String(b === s))); return; }
  const corre = async (btn, fn, ok) => {
    btn.disabled = true;
    try { const r = await fn(); if (r?.error) throw new Error(r.error); await cargaEvento(); await carga(); aviso(ok, 'success'); }
    catch (err) { btn.disabled = false; aviso(traduceError(err.message)); }
  };
  if (t.closest('[data-guarda-evento]')) {
    const legal = {}; $('vsEvento').querySelectorAll('[data-legal]').forEach(i => { legal[i.dataset.legal] = i.value.trim(); });
    const seguro = $('vsEvento').querySelector('[data-seguro][aria-pressed="true"]')?.dataset.seguro || c.insurance;
    return corre(t.closest('[data-guarda-evento]'), async () => {
      const r = await rpc('v2_visoria_setup_update', { organization_id: ctx.organization_id, campaign_id: c.id,
        changes: { legal, location: $('vsSede').value.trim(), insurance: seguro, insuranceDetail: $('vsSeguroDetalle').value.trim() } });
      if (r?.materialChange) setTimeout(() => aviso('Cambió algo importante: hay que aprobar de nuevo y las familias que ya firmaron firmarán la versión nueva.'), 50);
      return r;
    }, 'Datos del evento guardados.');
  }
  const ap = t.closest('[data-aprueba]');
  if (ap) {
    const nota = $('vsEvento').querySelector(`[data-nota-aprob="${ap.dataset.aprueba}"]`).value.trim();
    if (nota.length < 15) return aviso('Escribe quién revisó y cuándo (mínimo 15 letras).');
    return corre(ap, () => rpc('v2_visoria_approve', { organization_id: ctx.organization_id, campaign_id: c.id, gate: ap.dataset.aprueba, note: nota }), 'Aprobación registrada.');
  }
  const re = t.closest('[data-retira]');
  if (re) {
    const motivo = prompt('¿Por qué se retira la aprobación? La firma se cierra de inmediato.'); if (!motivo || motivo.trim().length < 5) return;
    return corre(re, () => rpc('v2_visoria_revoke_approval', { organization_id: ctx.organization_id, campaign_id: c.id, gate: re.dataset.retira, reason: motivo.trim() }), 'Aprobación retirada.');
  }
  const d = t.closest('[data-doc]');
  if (d) {
    const doc = (evento.documents || []).find(x => x.id === d.dataset.doc); if (!doc) return;
    const h = abreHoja(doc.title);
    h.innerHTML = `<header class="vs-ev-cab"><div><h2>${esc(doc.title)}</h2><p>${esc(doc.version)} · SHA-256 ${esc(doc.hash)}</p></div><button type="button" class="vs-cierra" data-cierra aria-label="Cerrar">×</button></header><div class="vs-doc-texto">${esc(doc.body).replace(/\n/g, '<br>')}</div>`;
    h.onclick = ev => { if (ev.target.closest('[data-cierra]')) cierraHoja(); };
    return;
  }
  const nv = t.closest('[data-nueva-version]');
  if (nv) {
    const actual = (evento.documents || []).find(x => !x.campaign && x.kind === nv.dataset.nuevaVersion);
    const h = abreHoja('Nueva versión');
    h.innerHTML = `<header class="vs-ev-cab"><div><h2>Nueva versión</h2><p>La anterior se retira, no se borra. Requiere aprobar de nuevo y que las familias firmen otra vez.</p></div><button type="button" class="vs-cierra" data-cierra aria-label="Cerrar">×</button></header>
      <label class="vs-form"><span>Versión</span><input id="vsDocVer" value="${esc(actual?.version || '')}"></label>
      <label class="vs-form"><span>Título</span><input id="vsDocTit" value="${esc(actual?.title || '')}"></label>
      <textarea id="vsDocTexto" rows="14">${esc(actual?.body || '')}</textarea>
      <button type="button" class="vs-guarda" data-guarda-doc>Guardar como versión nueva</button>`;
    h.onclick = async ev => {
      if (ev.target.closest('[data-cierra]')) return cierraHoja();
      const b = ev.target.closest('[data-guarda-doc]'); if (!b) return;
      if ($('vsDocVer').value.trim() === actual?.version) return aviso('Usa un número de versión distinto.');
      b.disabled = true;
      try { await rpc('v2_visoria_template', { organization_id: ctx.organization_id, kind: nv.dataset.nuevaVersion, title: $('vsDocTit').value, body: $('vsDocTexto').value, version: $('vsDocVer').value }); cierraHoja(); await cargaEvento(); await carga(); aviso('Versión nueva guardada. Hay que aprobarla.', 'success'); }
      catch (err) { b.disabled = false; aviso(err.message || 'No se pudo.'); }
    };
  }
}
function traduceError(m = '') {
  if (/Event setup incomplete/.test(m)) return 'Faltan datos del evento antes de aprobar.';
  if (/Unresolved/.test(m)) return `Quedan campos sin llenar en los documentos: ${m.replace(/^.*: /, '')}`;
  if (/Approval note required/.test(m)) return 'Escribe quién revisó y cuándo.';
  if (/Not authorized/.test(m)) return 'Tu perfil no puede hacer esto.';
  return m || 'No se pudo.';
}

/* ---------- Incidentes ---------- */
async function pintaIncidentes() {
  const box = $('vsIncidentes');
  if (!incidentes) { box.innerHTML = '<p class="vs-vacio">Cargando…</p>'; try { incidentes = await rpc('v2_visoria_incidents', { organization_id: ctx.organization_id, campaign_id: datos.campaign.id }); } catch (e) { box.innerHTML = `<p class="vs-vacio">${esc(e.message || 'No se pudo abrir.')}</p>`; return; } }
  box.innerHTML = `<p class="vs-recuerda">Se registran hechos, no culpas. Nada se reescribe: se agrega seguimiento. No mandes datos médicos a grupos de WhatsApp.</p>
    ${datos.canWrite ? '<button type="button" class="vs-guarda" data-nuevo-incidente>Registrar un incidente</button>' : ''}
    <ul class="vs-incidentes">${incidentes.map(i => `<li data-incidente="${esc(i.id)}" class="${i.closed ? 'cerrado' : ''}"><div><b>${esc(fecha(i.occurredAt))} · ${esc(i.place)}</b>${i.child ? `<small>${esc(i.child)}</small>` : ''}</div>
      <p>${esc(i.facts)}</p>${i.firstAid ? `<small>Primeros auxilios: ${esc(i.firstAid)}</small>` : ''}${i.emergencyCalled ? '<small>Se llamó a emergencias.</small>' : ''}${i.transfer ? `<small>Traslado: ${esc(i.transfer)}</small>` : ''}
      ${(i.entries || []).map(n => `<small class="vs-seguim">${esc(fecha(n.at))} · ${esc(n.kind)}: ${esc(n.note)}</small>`).join('')}
      <button type="button" class="vs-boton sec" data-seguimiento="${esc(i.id)}">Agregar seguimiento</button>${i.closed ? '' : `<button type="button" class="vs-boton sec" data-cierra-incidente="${esc(i.id)}">Cerrar</button>`}</li>`).join('') || '<li class="vs-vacio">Sin incidentes registrados.</li>'}</ul>`;
}
async function accionIncidentes(e) {
  const t = e.target;
  if (t.closest('[data-nuevo-incidente]')) {
    const h = abreHoja('Registrar incidente'), ahora = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    h.innerHTML = `<header class="vs-ev-cab"><div><h2>Registrar incidente</h2><p>Hechos objetivos: qué, cuándo, dónde, quién estaba, qué se hizo.</p></div><button type="button" class="vs-cierra" data-cierra aria-label="Cerrar">×</button></header>
      <div class="vs-form">
        <label><span>Cuándo</span><input id="viIncCuando" type="datetime-local" value="${ahora}"></label>
        <label><span>Dónde</span><input id="viIncDonde" maxlength="200" placeholder="Cancha 2, zona de calentamiento"></label>
        <label><span>Actividad</span><input id="viIncAct" maxlength="200"></label>
        <label><span>Niño o niña <em>opcional</em></span><select id="viIncNino"><option value="">—</option>${(datos.items || []).map(x => `<option value="${esc(x.id)}">${esc(`${x.firstName} ${x.lastName}`)}</option>`).join('')}</select></label>
        <label><span>Qué pasó</span><textarea id="viIncHechos" rows="4" maxlength="4000"></textarea></label>
        <label><span>Personas presentes</span><input id="viIncGente" maxlength="1000"></label>
        <label><span>Primeros auxilios</span><input id="viIncAux" maxlength="2000"></label>
        <label class="vs-check"><input id="viInc911" type="checkbox"> Se llamó al 911 / ambulancia</label>
        <label><span>Hora en que se avisó al tutor</span><input id="viIncTutor" type="datetime-local"></label>
        <label><span>Traslado <em>opcional</em></span><input id="viIncTraslado" maxlength="1000"></label>
        <button type="button" class="vs-guarda" data-guarda-incidente>Registrar</button></div>`;
    h.onclick = async ev => {
      if (ev.target.closest('[data-cierra]')) return cierraHoja();
      const b = ev.target.closest('[data-guarda-incidente]'); if (!b) return;
      const hechos = $('viIncHechos').value.trim(), donde = $('viIncDonde').value.trim();
      if (hechos.length < 10 || donde.length < 3) return aviso('Escribe dónde y qué pasó.');
      b.disabled = true;
      try {
        await rpc('v2_visoria_incident', { organization_id: ctx.organization_id, campaign_id: datos.campaign.id, payload: {
          occurredAt: new Date($('viIncCuando').value).toISOString(), place: donde, activity: $('viIncAct').value.trim(), prospectId: $('viIncNino').value || null,
          facts: hechos, peoplePresent: $('viIncGente').value.trim(), firstAid: $('viIncAux').value.trim(), emergencyCalled: $('viInc911').checked,
          guardianContactedAt: $('viIncTutor').value ? new Date($('viIncTutor').value).toISOString() : null, transfer: $('viIncTraslado').value.trim() } });
        cierraHoja(); incidentes = null; aviso('Incidente registrado.', 'success'); pintaIncidentes();
      } catch (err) { b.disabled = false; aviso(err.message || 'No se pudo.'); }
    };
    return;
  }
  const sg = t.closest('[data-seguimiento],[data-cierra-incidente]');
  if (sg) {
    const cierra = sg.dataset.cierraIncidente !== undefined, id = sg.dataset.seguimiento || sg.dataset.cierraIncidente;
    const nota = prompt(cierra ? '¿Cómo se cerró? (seguimiento hecho, responsables operativos)' : 'Seguimiento:'); if (!nota || nota.trim().length < 3) return;
    try { await rpc('v2_visoria_incident_entry', { organization_id: ctx.organization_id, incident_id: id, kind: cierra ? 'cierre' : 'seguimiento', note: nota.trim() }); incidentes = null; pintaIncidentes(); }
    catch (err) { aviso(err.message || 'No se pudo.'); }
  }
}

/* ---------- Llegada y evaluación (h53) ---------- */
async function marcaLlegada(x, btn) {
  btn.disabled = true;
  try { const r = await rpc('v2_visoria_arrival', { organization_id: ctx.organization_id, prospect_id: x.id, value: !x.arrivedAt }); x.arrivedAt = r?.arrivedAt || null; pinta(); }
  catch (e) { btn.disabled = false; aviso(e.message || 'No se pudo marcar.'); }
  if (!x.arrivedAt) return;
  if (estadoDe(x) !== 'AUTORIZADO') aviso(`${x.firstName} llegó, pero NO está autorizado para entrar a la cancha: ${(ACCESO[estadoDe(x)] || {}).t}. ${x.access?.reason || ''}`);
}

/* Evaluar: cuatro calificaciones de un toque, la decisión y una nota. */
function abreEvaluacion(x) {
  const h = abreHoja('Evaluar');
  evalua = { x, notas: { technical: null, physical: null, tactical: null, mental: null }, decision: 'follow', guardando: false };
  h.onclick = e => {
    if (e.target.closest('[data-cierra]')) return cierraHoja();
    const n = e.target.closest('[data-nota]'); if (n) { evalua.notas[n.dataset.campo] = Number(n.dataset.nota); return pintaEvaluacion(); }
    const d = e.target.closest('[data-decision]'); if (d) { evalua.decision = d.dataset.decision; return pintaEvaluacion(); }
    if (e.target.closest('[data-guarda]')) guardaEvaluacion();
  };
  pintaEvaluacion();
}
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
    cierraHoja(); pintaLista(); aviso(`Evaluación de ${x.firstName} guardada.`, 'success');
  } catch (e) { if (evalua) { evalua.guardando = false; pintaEvaluacion(); } aviso(e.message || 'No se pudo guardar la evaluación.'); }
}

const niñoDe = el => (datos.items || []).find(i => i.id === el.closest('[data-id]')?.dataset.id);
$('vsLista').addEventListener('click', e => {
  const x = niñoDe(e.target); if (!x) return;
  const ll = e.target.closest('[data-llego]'); if (ll) return marcaLlegada(x, ll);
  if (e.target.closest('[data-evalua]')) return abreEvaluacion(x);
  if (e.target.closest('[data-ver-mas]')) return verDatos(x);
});
$('vsAcceso').addEventListener('click', e => {
  const f = e.target.closest('[data-acceso]'); if (f) { verAcceso = f.dataset.acceso; return pintaAcceso(); }
  const x = niñoDe(e.target); if (x && e.target.closest('[data-ver-mas]')) verDatos(x);
});
$('vsEvento').addEventListener('click', accionEvento);
$('vsIncidentes').addEventListener('click', accionIncidentes);
$('vsVer').addEventListener('click', e => { const b = e.target.closest('[data-ver]'); if (!b) return; ver = b.dataset.ver; $('vsVer').querySelectorAll('[data-ver]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); pintaLista(); });
$('vsBusca').addEventListener('input', e => { busca = e.target.value; if (vista === 'acceso') pintaAcceso(); else pintaLista(); });
document.addEventListener('click', e => { const v = e.target.closest('[data-vista],[data-vista-ir]'); if (!v) return; vista = v.dataset.vista || v.dataset.vistaIr; pinta(); });
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
