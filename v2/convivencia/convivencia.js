/* Cultura y Convivencia Tanner (v1.0, 09/11/2026) y Bono Tanner OS (h81).
 *
 * Una pestaña dentro de Formación:
 *   · Todos: "Reportar algo" (hechos, acción protectora, nivel). Grave o
 *     urgente va directo a Presidencia. Quien reporta ve sólo lo suyo.
 *   · Formador: su código (leer y aceptar) y "Explica el código en 60 seg"
 *     por categoría, que deja constancia sin firma de niños.
 *   · Dirección Deportiva / Presidencia: los casos con su seguimiento, quién
 *     del staff aceptó el código y cuántas familias firmaron por categoría.
 * El Consejo de Familias NO ve expedientes: no hay nada de eso aquí.
 *
 * Bono Tanner OS: Presidencia ve el cumplimiento de planeación del mes por
 * Formador (del corte semanal) y aprueba o no, a mano, con nota.
 */
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const errorDe = e => String(e?.message || e || 'Algo falló').replace(/^.*?:\s*/, '');
const fechaCorta = ymd => ymd ? new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(String(ymd).slice(0, 10) + 'T12:00:00Z')).replace('.', '') : '';
const hoyMx = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());
const diasDesde = ymd => ymd ? Math.round((new Date(hoyMx() + 'T12:00:00Z') - new Date(String(ymd).slice(0, 10) + 'T12:00:00Z')) / 864e5) : null;

export const EXPLICACION_60 = 'Aquí venimos a jugar y a ser equipo. No insultamos, no ponemos apodos que lastiman, no hacemos burlas ni señas ofensivas y no golpeamos. Si alguien falla, lo ayudamos. Si alguien te molesta, díselo a tu profe o a un adulto seguro. Si te equivocas, reconoces lo que pasó y lo corriges. Compitamos fuerte, pero cuidándonos.';

export const NIVELES = {
  menor: { nombre: 'Menor', ayuda: 'Se atendió en el momento con una intervención educativa.', tono: 'gris' },
  reincidencia: { nombre: 'Reincidencia o daño', ayuda: 'Se repite o hubo daño. Va a Dirección Deportiva y se avisa al tutor.', tono: 'ambar' },
  grave: { nombre: 'Grave', ayuda: 'Medida protectora inmediata. Lo evalúa Presidencia.', tono: 'rojo' },
  urgente: { nombre: 'Urgente', ayuda: 'Abuso sospechado, agresión grave, amenaza creíble o peligro inmediato.', tono: 'rojo' }
};
const ESTADO = { abierto: 'Abierto', seguimiento: 'En seguimiento', resuelto: 'Resuelto' };
const TIPO_NOTA = { seguimiento: 'Seguimiento', aviso_familia: 'Aviso a la familia', escalado: 'Escalado a Presidencia', resolucion: 'Resolución' };

function cargaEstilos() {
  if (document.querySelector('link[href^="/v2/convivencia/convivencia.css"]')) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/v2/convivencia/convivencia.css?v=20261109a'; document.head.appendChild(l);
}

function hoja(html) {
  cargaEstilos();
  document.getElementById('cvHoja')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div id="cvHoja" class="cv-capa" role="dialog" aria-modal="true" aria-labelledby="cvTitulo"><div class="cv-sheet">${html}</div></div>`);
  const h = document.getElementById('cvHoja');
  h.addEventListener('click', e => { if (e.target === h || e.target.closest('[data-cv-cerrar]')) h.remove(); });
  return h;
}
const cabeza = t => `<header class="cv-head"><h2 id="cvTitulo">${esc(t)}</h2><button type="button" class="cv-x" data-cv-cerrar aria-label="Cerrar">×</button></header>`;
function avisa(t, malo = false) {
  cargaEstilos();
  let a = document.getElementById('cvAviso');
  if (!a) { document.body.insertAdjacentHTML('beforeend', '<div id="cvAviso" class="cv-aviso" role="status"></div>'); a = document.getElementById('cvAviso'); }
  a.textContent = t; a.dataset.malo = malo ? '1' : ''; a.classList.add('ver');
  clearTimeout(avisa.t); avisa.t = setTimeout(() => a.classList.remove('ver'), 3200);
}

/* ---------------- Convivencia ---------------- */
export async function montaConvivencia(el, { rpc, org, abrirReporte = false }) {
  cargaEstilos();
  el.innerHTML = '<p class="cv-cargando">Cargando…</p>';
  let d;
  try { d = await rpc('v2_convivencia', { organization_id: org }); }
  catch (e) { el.innerHTML = `<p class="cv-vacio">No se pudo cargar: ${esc(errorDe(e))}</p>`; return null; }
  const recarga = () => montaConvivencia(el, { rpc, org });
  el.innerHTML = pintaConvivencia(d);
  el.onclick = e => {
    if (e.target.closest('[data-cv-reportar]')) return hojaReporte({ rpc, org, d, alTerminar: recarga });
    if (e.target.closest('[data-cv-codigo]')) return hojaCodigo({ rpc, org, d, alTerminar: recarga });
    const ex = e.target.closest('[data-cv-explicar]');
    if (ex) return hojaExplicar({ rpc, org, cat: d.categories.find(c => c.id === ex.dataset.cvExplicar), alTerminar: recarga });
    const inc = e.target.closest('[data-cv-caso]');
    if (inc) return hojaCaso({ rpc, org, d, i: d.incidents.find(x => x.id === inc.dataset.cvCaso), alTerminar: recarga });
    if (e.target.closest('[data-cv-staff]')) return hojaStaff(d);
  };
  if (abrirReporte) hojaReporte({ rpc, org, d, alTerminar: recarga });
  return d;
}

export function pintaConvivencia(d) {
  const code = d.myCode;
  const abiertos = (d.incidents || []).filter(i => i.status !== 'resuelto');
  const codigoHtml = !code ? '' : code.acceptedAt
    ? `<p class="cv-ok-linea"><span aria-hidden="true">✓</span> Aceptaste el Código del Formador v${esc(code.version)} el ${esc(fechaCorta(code.acceptedAt))}. <button type="button" class="cv-link" data-cv-codigo>Volver a leer</button></p>`
    : `<button type="button" class="cv-banner" data-cv-codigo><span><b>Acepta tu Código del Formador</b><small>2 minutos. Es parte de tu habilitación.</small></span><i aria-hidden="true">›</i></button>`;
  const cats = (d.categories || []).map(c => {
    const n = diasDesde(c.lastExplained);
    const cuando = n == null ? 'Aún no se explica' : n === 0 ? 'Explicado hoy' : n === 1 ? 'Explicado ayer' : `Explicado hace ${n} días`;
    const fam = c.families && c.families.total ? `<small class="cv-fam${c.families.accepted >= c.families.total ? ' ok' : ''}">Familias: ${c.families.accepted}/${c.families.total} firmaron</small>` : '';
    return `<li class="cv-cat"><span><b>${esc(c.name)}</b><small class="${n == null ? 'cv-falta' : ''}">${esc(cuando)}</small>${fam}</span>
      <button type="button" class="cv-btn" data-cv-explicar="${esc(c.id)}">Explicar (60 seg)</button></li>`;
  }).join('');
  const casos = (d.incidents || []).map(i => {
    const nv = NIVELES[i.level] || NIVELES.menor;
    return `<li><button type="button" class="cv-caso${i.status === 'resuelto' ? ' resuelto' : ''}" data-cv-caso="${esc(i.id)}">
      <span class="cv-pill ${nv.tono}">${esc(nv.nombre)}</span>
      <span class="cv-caso-txt"><b>${esc(i.category || 'Sin categoría')} · ${esc(fechaCorta(i.occurredOn))}</b><small>${esc(ESTADO[i.status] || i.status)} · ${i.escalatedTo === 'presidencia' ? 'Presidencia' : 'Dirección Deportiva'}${d.canFollow && i.reportedBy ? ` · Reportó ${esc(i.reportedBy)}` : ''}</small></span><i aria-hidden="true">›</i></button></li>`;
  }).join('');
  const staff = d.staff || null;
  const staffOk = staff ? staff.filter(s => s.acceptedAt).length : 0;
  return `<section class="cv-hero"><span>CULTURA Y CONVIVENCIA</span><h1>Respetamos. Competimos. Nos cuidamos.</h1>
      <p>La familia acompaña. El profesor enseña. El Tanner piensa, resuelve y respeta.</p>
      <button type="button" class="cv-primario" data-cv-reportar>Reportar algo</button></section>
    ${codigoHtml}
    <section class="cv-card"><div class="cv-card-head"><h2>Explica el código a tus Tanners</h2><span>sin firma de niños</span></div>
      <p class="cv-ayuda">Léelo en voz alta al iniciar. Queda registrado por categoría y fecha.</p>
      ${cats ? `<ul class="cv-cats">${cats}</ul>` : '<p class="cv-vacio">No hay categorías activas.</p>'}</section>
    <section class="cv-card"><div class="cv-card-head"><h2>${d.canFollow ? 'Casos' : 'Mis reportes'}</h2><span>${abiertos.length ? `${abiertos.length} abierto${abiertos.length === 1 ? '' : 's'}` : 'sin pendientes'}</span></div>
      ${casos ? `<ul class="cv-casos">${casos}</ul>` : `<p class="cv-vacio">${d.canFollow ? 'Sin reportes.' : 'No has reportado nada. Si ves algo, repórtalo.'}</p>`}
      <p class="cv-ayuda cv-privado">Sólo lo ven quien reporta, Dirección Deportiva y Presidencia. No se comparte en chats ni con el Consejo de Familias.</p></section>
    ${staff ? `<button type="button" class="cv-banner neutro" data-cv-staff><span><b>Código del Formador: ${staffOk}/${staff.length} aceptaron</b><small>Ver quién falta</small></span><i aria-hidden="true">›</i></button>` : ''}`;
}

function hojaCodigo({ rpc, org, d, alTerminar }) {
  const c = d.myCode;
  const h = hoja(`${cabeza(c.title || 'Código del Formador')}
    <p class="cv-lema">EXIGIMOS MUCHO. RESPETAMOS SIEMPRE.</p>
    <div class="cv-texto">${esc(c.body).replace(/\n/g, '<br>')}</div>
    ${c.acceptedAt ? `<p class="cv-ok-linea">Aceptado el ${esc(fechaCorta(c.acceptedAt))} · v${esc(c.version)}</p><button type="button" class="cv-primario" data-cv-cerrar>Listo</button>`
      : '<button type="button" class="cv-primario" id="cvAcepto">Leí y acepto</button>'}`);
  h.querySelector('#cvAcepto')?.addEventListener('click', async ev => {
    ev.currentTarget.disabled = true;
    try { await rpc('v2_accept_staff_code', { organization_id: org, code: c.code }); h.remove(); avisa('Código aceptado. Gracias.'); alTerminar?.(); }
    catch (e) { ev.currentTarget.disabled = false; avisa(errorDe(e), true); }
  });
}

function hojaExplicar({ rpc, org, cat, alTerminar }) {
  if (!cat) return;
  const h = hoja(`${cabeza(`Explícalo a ${cat.name}`)}
    <p class="cv-ayuda">Reúnelos en círculo y léelo en voz alta (60 segundos).</p>
    <blockquote class="cv-60">“${esc(EXPLICACION_60)}”</blockquote>
    <p class="cv-trifuerza"><b>CUERPO</b> no lastimo · <b>MENTE</b> pienso antes de actuar · <b>ESPÍRITU</b> respeto y ayudo</p>
    <label class="cv-campo">Nota (opcional)<input id="cvNotaEx" maxlength="200" placeholder="Ej. Preguntaron qué es un adulto seguro"></label>
    <button type="button" class="cv-primario" id="cvExplicado">Ya se los expliqué</button>`);
  h.querySelector('#cvExplicado').addEventListener('click', async ev => {
    ev.currentTarget.disabled = true;
    try {
      const r = await rpc('v2_record_code_explanation', { organization_id: org, category_id: cat.id, note: h.querySelector('#cvNotaEx').value || null });
      h.remove(); avisa(r?.already ? 'Ya estaba registrado hoy.' : `Listo: ${cat.name} queda registrado hoy.`); alTerminar?.();
    } catch (e) { ev.currentTarget.disabled = false; avisa(errorDe(e), true); }
  });
}

function hojaReporte({ rpc, org, d, alTerminar }) {
  const st = { level: '' };
  const h = hoja(`${cabeza('Reportar algo')}
    <p class="cv-ayuda">Primero protege. Luego escribe sólo hechos: qué viste u oíste, sin calificativos.</p>
    <p class="cv-eti">¿Qué tan serio es?</p>
    <div class="cv-niveles" role="radiogroup">${Object.entries(NIVELES).map(([k, n]) => `<button type="button" role="radio" aria-checked="false" data-cv-nivel="${k}" class="cv-nivel ${n.tono}"><b>${esc(n.nombre)}</b><small>${esc(n.ayuda)}</small></button>`).join('')}</div>
    <div id="cvUrgente" class="cv-urgente hidden" role="alert"><b>No esperes los escalones.</b> Separa al niño del riesgo, llama ya a Dirección Deportiva o Presidencia y, si hay peligro, a servicios o autoridades. No hagas una investigación por tu cuenta.</div>
    <label class="cv-campo">Categoría<select id="cvCat"><option value="">Sin categoría</option>${(d.categories || []).map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label>
    <label class="cv-campo">¿Cuándo pasó?<input id="cvFecha" type="date" max="${hoyMx()}" value="${hoyMx()}"></label>
    <label class="cv-campo">¿Qué pasó? (hechos)<textarea id="cvQue" rows="3" maxlength="1500" placeholder="Ej. En el ejercicio de 3v3, un jugador empujó a otro al piso después de perder el balón."></textarea></label>
    <label class="cv-campo">¿Qué hiciste para proteger?<textarea id="cvAccion" rows="2" maxlength="800" placeholder="Ej. Detuve el juego, los separé y hablé con cada uno por separado."></textarea></label>
    <label class="cv-check"><input type="checkbox" id="cvStaff"> Hay un adulto del club involucrado</label>
    <p class="cv-ayuda">No escribas nombres en chats ni grupos. Aquí sólo lo ven Dirección Deportiva y Presidencia.</p>
    <button type="button" class="cv-primario" id="cvEnviar" disabled>Elige qué tan serio es</button>`);
  const btn = h.querySelector('#cvEnviar');
  h.querySelector('.cv-niveles').addEventListener('click', e => {
    const b = e.target.closest('[data-cv-nivel]'); if (!b) return;
    st.level = b.dataset.cvNivel;
    h.querySelectorAll('[data-cv-nivel]').forEach(x => x.setAttribute('aria-checked', String(x === b)));
    h.querySelector('#cvUrgente').classList.toggle('hidden', st.level !== 'urgente');
    btn.disabled = false;
    btn.textContent = st.level === 'grave' || st.level === 'urgente' ? 'Enviar a Presidencia' : 'Enviar a Dirección Deportiva';
  });
  btn.addEventListener('click', async () => {
    const que = h.querySelector('#cvQue').value.trim();
    if (!que) { avisa('Describe lo que pasó.', true); h.querySelector('#cvQue').focus(); return; }
    btn.disabled = true;
    try {
      const r = await rpc('v2_report_incident', { organization_id: org, incident: {
        level: st.level, whatHappened: que, protectiveAction: h.querySelector('#cvAccion').value.trim() || null,
        categoryId: h.querySelector('#cvCat').value || null, occurredOn: h.querySelector('#cvFecha').value || null,
        involvesStaff: h.querySelector('#cvStaff').checked, playerIds: [] } });
      h.remove(); avisa(r?.escalatedTo === 'presidencia' ? 'Reporte enviado a Presidencia.' : 'Reporte enviado a Dirección Deportiva.'); alTerminar?.();
    } catch (e) { btn.disabled = false; avisa(errorDe(e), true); }
  });
}

function hojaCaso({ rpc, org, d, i, alTerminar }) {
  if (!i) return;
  const nv = NIVELES[i.level] || NIVELES.menor;
  const puedeResolver = d.canFollow && i.status !== 'resuelto' && (i.escalatedTo !== 'presidencia' || d.isPresidency);
  const acciones = d.canFollow && i.status !== 'resuelto' ? [
    ['seguimiento', 'Seguimiento'], ['aviso_familia', 'Avisé a la familia'],
    ...(i.escalatedTo === 'direccion' ? [['escalado', 'Escalar a Presidencia']] : []),
    ...(puedeResolver ? [['resolucion', 'Resolver']] : [])] : [];
  const h = hoja(`${cabeza(`${i.category || 'Sin categoría'} · ${fechaCorta(i.occurredOn)}`)}
    <p><span class="cv-pill ${nv.tono}">${esc(nv.nombre)}</span> <span class="cv-pill gris">${esc(ESTADO[i.status] || i.status)}</span>${i.involvesStaff ? ' <span class="cv-pill ambar">Adulto del club involucrado</span>' : ''}</p>
    <dl class="cv-dl"><dt>Qué pasó</dt><dd>${esc(i.whatHappened)}</dd>
      ${i.protectiveAction ? `<dt>Acción protectora</dt><dd>${esc(i.protectiveAction)}</dd>` : ''}
      ${(i.players || []).length ? `<dt>Jugadores</dt><dd>${esc(i.players.join(', '))}</dd>` : ''}
      <dt>Lo lleva</dt><dd>${i.escalatedTo === 'presidencia' ? 'Presidencia' : 'Dirección Deportiva'}${i.reportedBy ? ` · Reportó ${esc(i.reportedBy)}` : ''}</dd>
      ${i.resolution ? `<dt>Resolución</dt><dd>${esc(i.resolution)}</dd>` : ''}</dl>
    ${(i.entries || []).length ? `<ol class="cv-hist">${i.entries.map(x => `<li><b>${esc(TIPO_NOTA[x.kind] || x.kind)}</b> · ${esc(x.by || '')} · ${esc(fechaCorta(x.at))}<br>${esc(x.note)}</li>`).join('')}</ol>` : ''}
    ${acciones.length ? `<div class="cv-seg" role="radiogroup">${acciones.map(([k, l], n) => `<button type="button" role="radio" data-cv-tipo="${k}" aria-checked="${n === 0}">${esc(l)}</button>`).join('')}</div>
      <label class="cv-campo"><span id="cvNotaEti">Nota</span><textarea id="cvNota" rows="3" maxlength="1000"></textarea></label>
      <button type="button" class="cv-primario" id="cvGuardaNota">Guardar</button>`
      : d.canFollow && i.status !== 'resuelto' ? '' : i.status === 'resuelto' ? '' : '<p class="cv-ayuda">Dirección Deportiva ya lo tiene. Si algo cambia, repórtalo de nuevo o habla con ellos.</p>'}
    ${d.canFollow && i.status !== 'resuelto' && !puedeResolver ? '<p class="cv-ayuda">Este caso lo resuelve Presidencia.</p>' : ''}`);
  let tipo = acciones[0]?.[0];
  h.querySelector('.cv-seg')?.addEventListener('click', e => {
    const b = e.target.closest('[data-cv-tipo]'); if (!b) return; tipo = b.dataset.cvTipo;
    h.querySelectorAll('[data-cv-tipo]').forEach(x => x.setAttribute('aria-checked', String(x === b)));
    h.querySelector('#cvNotaEti').textContent = tipo === 'resolucion' ? 'Cómo se resolvió (medidas y acuerdos)' : tipo === 'escalado' ? 'Por qué lo escalas' : 'Nota';
  });
  h.querySelector('#cvGuardaNota')?.addEventListener('click', async ev => {
    const note = h.querySelector('#cvNota').value.trim();
    if (!note) { avisa('Escribe la nota.', true); return; }
    ev.currentTarget.disabled = true;
    try { await rpc('v2_incident_entry', { organization_id: org, incident_id: i.id, kind: tipo, note }); h.remove(); avisa(tipo === 'resolucion' ? 'Caso resuelto.' : 'Guardado.'); alTerminar?.(); }
    catch (e) { ev.currentTarget.disabled = false; avisa(errorDe(e), true); }
  });
}

function hojaStaff(d) {
  const lista = [...(d.staff || [])].sort((a, b) => (!!a.acceptedAt) - (!!b.acceptedAt));
  hoja(`${cabeza('Código del Formador')}
    <ul class="cv-staff">${lista.map(s => `<li><span><b>${esc(s.name)}</b><small>${esc(s.role || '')}</small></span>${s.acceptedAt ? `<span class="cv-pill verde">Aceptó ${esc(fechaCorta(s.acceptedAt))}</span>` : '<span class="cv-pill ambar">Falta</span>'}</li>`).join('')}</ul>
    <button type="button" class="cv-primario" data-cv-cerrar>Listo</button>`);
}

/* ---------------- Bono Tanner OS ---------------- */
const MES = ymd => { const t = new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(ymd + 'T12:00:00Z')); return t[0].toUpperCase() + t.slice(1); };
const masMes = (ymd, n) => { const x = new Date(ymd + 'T12:00:00Z'); x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10); };

export async function montaBono(el, { rpc, org, mes = null }) {
  cargaEstilos();
  el.innerHTML = '<p class="cv-cargando">Cargando…</p>';
  let d;
  try { d = await rpc('v2_bonus_month', { organization_id: org, month: mes }); }
  catch (e) { el.innerHTML = `<p class="cv-vacio">No se pudo cargar: ${esc(errorDe(e))}</p>`; return; }
  const m = String(d.month).slice(0, 10);
  const actual = hoyMx().slice(0, 8) + '01';
  const gente = d.people || [];
  const filas = gente.map(p => {
    const r = p.review;
    const pct = p.pct == null ? '—' : `${Math.round(p.pct)}%`;
    return `<li class="cv-bono" data-cv-persona="${esc(p.userId)}">
      <div class="cv-bono-top"><span><b>${esc(p.name)}</b><small>${p.met}/${p.weeks - p.pendingReview} semanas a tiempo${p.pendingReview ? ` · ${p.pendingReview} en revisión` : ''}</small></span><strong class="cv-pct${p.pct >= 90 ? ' ok' : p.pct != null && p.pct < 70 ? ' bajo' : ''}">${pct}</strong></div>
      <span class="cv-barra" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, p.pct || 0))}%"></i></span>
      ${r ? `<p class="cv-decidido ${r.decision === 'aprobado' ? 'ok' : 'no'}">${r.decision === 'aprobado' ? 'Aprobado' : 'No aprobado'} · ${esc(r.by || '')} · ${esc(fechaCorta(r.at))}${r.note ? ` · “${esc(r.note)}”` : ''} <button type="button" class="cv-link" data-cv-decidir="${esc(p.userId)}">Cambiar</button></p>`
        : `<div class="cv-bono-acc"><button type="button" class="cv-btn ok" data-cv-decidir="${esc(p.userId)}" data-cv-dec="aprobado">Aprobar</button><button type="button" class="cv-btn" data-cv-decidir="${esc(p.userId)}" data-cv-dec="no_aprobado">No aprobar</button></div>`}
    </li>`;
  }).join('');
  el.innerHTML = `<section class="cv-hero bono"><span>BONO TANNER OS</span><h1>${esc(MES(m))}</h1>
      <p>Planeación cerrada a tiempo, según el corte semanal. Tú decides; el sistema sólo te da el dato.</p></section>
    <div class="cv-mes"><button type="button" class="cv-flecha" data-cv-mes="-1" aria-label="Mes anterior">‹</button><b>${esc(MES(m))}</b><button type="button" class="cv-flecha" data-cv-mes="1" aria-label="Mes siguiente"${m >= actual ? ' disabled' : ''}>›</button></div>
    ${filas ? `<ul class="cv-bonos">${filas}</ul>` : '<p class="cv-vacio">Todavía no hay cortes de planeación este mes. Aparecen cuando cierra la primera semana.</p>'}
    <p class="cv-ayuda">Las semanas en revisión no cuentan en el porcentaje hasta que se resuelvan.</p>`;
  el.onclick = e => {
    const mb = e.target.closest('[data-cv-mes]');
    if (mb && !mb.disabled) return montaBono(el, { rpc, org, mes: masMes(m, +mb.dataset.cvMes) });
    const b = e.target.closest('[data-cv-decidir]'); if (!b) return;
    const p = gente.find(x => x.userId === b.dataset.cvDecidir);
    hojaBono({ rpc, org, p, mes: m, decision: b.dataset.cvDec || p.review?.decision || 'aprobado', alTerminar: () => montaBono(el, { rpc, org, mes: m }) });
  };
}

function hojaBono({ rpc, org, p, mes, decision, alTerminar }) {
  let dec = decision;
  const h = hoja(`${cabeza(`${p.name} · ${MES(mes)}`)}
    <p class="cv-ayuda">${p.pct == null ? 'Sin porcentaje todavía' : `${Math.round(p.pct)}% de cumplimiento`} · ${p.met}/${p.weeks - p.pendingReview} semanas a tiempo${p.pendingReview ? ` · ${p.pendingReview} en revisión` : ''}</p>
    <div class="cv-seg" role="radiogroup"><button type="button" role="radio" data-cv-d="aprobado" aria-checked="${dec === 'aprobado'}">Aprobar</button><button type="button" role="radio" data-cv-d="no_aprobado" aria-checked="${dec !== 'aprobado'}">No aprobar</button></div>
    <label class="cv-campo">Nota (opcional)<input id="cvNotaBono" maxlength="300" value="${esc(p.review?.note || '')}" placeholder="Ej. Dos semanas tarde por torneo; se aprueba"></label>
    <button type="button" class="cv-primario" id="cvDecide">Guardar decisión</button>`);
  h.querySelector('.cv-seg').addEventListener('click', e => {
    const b = e.target.closest('[data-cv-d]'); if (!b) return; dec = b.dataset.cvD;
    h.querySelectorAll('[data-cv-d]').forEach(x => x.setAttribute('aria-checked', String(x === b)));
  });
  h.querySelector('#cvDecide').addEventListener('click', async ev => {
    ev.currentTarget.disabled = true;
    try { await rpc('v2_decide_bonus', { organization_id: org, user_id: p.userId, month: mes, decision: dec, note: h.querySelector('#cvNotaBono').value.trim() || null }); h.remove(); avisa('Decisión guardada.'); alTerminar?.(); }
    catch (e) { ev.currentTarget.disabled = false; avisa(errorDe(e), true); }
  });
}
