/* FORMACIÓN (Metodología Tannery City v1.1 · Fase 1, 12/10/2026).
 *
 * Una sola pantalla, lo que cada quien necesita para su siguiente decisión:
 *   · Dirección Deportiva: la Semana Tanner por categoría (Reto, secundario
 *     opcional, conducta) y cómo va la planeación de cada una. Publica.
 *   · Formador: "PRÓXIMA SEMANA · 3 sesiones · 2 listas · 1 pendiente" y
 *     TERMINAR PLANEACIÓN. Cada sesión: el Reto que publicó Dirección, 3
 *     tareas recomendadas por bloque, dificultad y espacio. Confirmar lista.
 *   · Todos: el Banco (36 Tanner + 24 Baby) con lo que se usa en cancha.
 * Simple arriba, inteligente abajo: el motor y el corte viven en el servidor
 * y en /v2/formacion/motor.js.
 */
import { bootstrapProtectedShell, rpc, $, setShellHealth, moduleAccess } from '/v2/shell.js';
import { recomienda, bloquesDeSesion, faltaParaLista, resumenSemana, pasosDeSemana, colorDeMundo, NIVEL_NUM, filtraAlbum, pasosDelFormador } from '/v2/formacion/motor.js?v=20261013b';

const boot = await bootstrapProtectedShell({ active: 'formacion', title: 'Formación' });
if (!boot) throw new Error('No access');
const { ctx, navigation } = boot, org = ctx.organization_id;
const esDireccion = moduleAccess(navigation, 'formacion_direccion', true);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let catalogo = { concepts: [], tasks: [] }, semana = null, tab = esDireccion ? 'semana' : 'sesiones', tz = 'America/Mexico_City';
let dataDir = null, dataMia = null, dataHoy = null, borrador = {};
const album = { banco: 'tanner', mundo: '', nivel: 0, busca: '' };

const concepto = (kind, code) => catalogo.concepts.find(c => c.kind === kind && c.code === code);
const nombreReto = code => concepto('reto', code)?.name || concepto('mundo_baby', code)?.name || code || '';
const tarea = id => catalogo.tasks.find(t => t.id === id);
const esBabyEtapa = etapa => String(etapa || '').startsWith('baby');
const fecha = (iso, op) => new Intl.DateTimeFormat('es-MX', { timeZone: tz, ...op }).format(new Date(iso));
const mayus = t => t ? t[0].toLocaleUpperCase('es-MX') + t.slice(1) : t;
const dia = iso => mayus(fecha(iso, { weekday: 'short', day: 'numeric' }).replace('.', ''));
const hora = iso => fecha(iso, { hour: '2-digit', minute: '2-digit', hour12: false });
const masDias = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const rangoSemana = ymd => {
  const a = new Date(ymd + 'T12:00:00Z'), b = new Date(masDias(ymd, 6) + 'T12:00:00Z');
  const m = d => new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', month: 'short' }).format(d).replace('.', '');
  return a.getUTCMonth() === b.getUTCMonth() ? `${a.getUTCDate()}–${b.getUTCDate()} ${m(b)}` : `${a.getUTCDate()} ${m(a)} – ${b.getUTCDate()} ${m(b)}`;
};
function aviso(t, tipo = 'ok') { const a = $('fmAviso'); a.textContent = t; a.dataset.tipo = tipo; a.classList.remove('hidden'); clearTimeout(aviso.t); aviso.t = setTimeout(() => a.classList.add('hidden'), 3200); }
const errorDe = e => String(e?.message || e || 'Algo falló').replace(/^.*?:\s*/, '');

/* ---------- Pestañas ---------- */
function pintaTabs() {
  const tabs = [...(esDireccion ? [['semana', 'Semana']] : []), ['sesiones', esDireccion ? 'Sesiones' : 'Próxima semana'], ['banco', 'Banco']];
  $('fmTabs').innerHTML = tabs.map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${tab === k}"${tab === k ? ' class="activa"' : ''}>${l}</button>`).join('');
  document.querySelector('.fm-semana-nav').classList.toggle('hidden', tab === 'banco');
}
$('fmTabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (!b) return; tab = b.dataset.tab; pinta(); });
$('fmPrev').addEventListener('click', () => { semana = masDias(semana, -7); carga(); });
$('fmNext').addEventListener('click', () => { semana = masDias(semana, 7); carga(); });

/* ---------- Dirección: Semana Tanner en 5 pasos (13/10/2026) ----------
   "Imagínate que eres un entrenador que no sabe de tecnología": la semana se
   arma en cinco pasos que siempre se ven, cada categoría dice qué le falta y
   se puede editar o quitar lo que salió mal. Todo cambio queda en el
   historial (quién y cuándo) para Presidencia y Dirección. */
const semanaDe = c => borrador[c.categoryId] || c.week || null;
const haceCuanto = iso => {
  if (!iso) return '';
  const min = Math.round((Date.now() - new Date(iso)) / 60000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  if (min < 60 * 24) return `hace ${Math.round(min / 60)} h`;
  return fecha(iso, { day: 'numeric', month: 'short' });
};
function pintaSemana() {
  const d = dataDir; if (!d) return '';
  const cats = d.categories || [];
  const st = pasosDeSemana(cats, borrador);
  const pasos = `<ol class="fm-pasos" aria-label="Tu semana en 5 pasos">${st.pasos.map(p => `<li class="${p.hecho ? 'hecho' : p.n === st.actual ? 'actual' : ''}">
      <span class="fm-paso-n" aria-hidden="true">${p.hecho ? '✓' : p.n}</span><span class="fm-paso-txt"><b>${esc(p.titulo)}</b><small>${esc(p.detalle)}</small></span></li>`).join('')}</ol>`;
  const tarjetas = cats.map(c => {
    const w = semanaDe(c), cambiada = !!borrador[c.categoryId];
    const publicada = c.week?.status === 'published' && !cambiada;
    const estado = !w?.primary ? ['gris', 'Sin Reto'] : publicada ? ['ok', 'Publicada'] : cambiada && c.week ? ['borrador', 'Cambios sin publicar'] : ['borrador', 'Sin publicar'];
    const plan = !c.sessions ? 'Sin sesiones esa semana' : !c.coachId ? 'Sin Formador asignado' : c.ready >= c.sessions ? `Formador: ${c.sessions}/${c.sessions} sesiones listas` : `Formador: ${c.ready}/${c.sessions} sesiones listas`;
    return `<article class="fm-cat2" data-catcard="${esc(c.categoryId)}">
      <header><span class="fm-cat2-nom">${esc(c.category)}</span><span class="fm-pill ${estado[0]}">${esc(estado[1])}</span></header>
      ${w?.primary ? `<button type="button" class="fm-cat2-reto" data-cat="${esc(c.categoryId)}"><span class="fm-cat2-eti">${c.usesChallenges ? 'RETO' : 'MUNDO'}</span>
          <b>${esc(nombreReto(w.primary))}${w.secondary ? `<i> + ${esc(nombreReto(w.secondary))}</i>` : ''}</b>
          ${String(w.behavior || '').trim() ? `<span class="fm-cat2-ver">Queremos ver: ${esc(w.behavior)}</span>` : '<span class="fm-cat2-falta">Falta decir qué quieres ver en la cancha</span>'}</button>`
        : `<button type="button" class="fm-cat2-elegir" data-cat="${esc(c.categoryId)}">+ Elegir ${c.usesChallenges ? 'Reto' : 'mundo'}</button>`}
      <footer><small>${esc(plan)}${c.week?.lastBy ? ` · Último cambio: ${esc(c.week.lastBy)}, ${esc(haceCuanto(c.week.updatedAt))}` : ''}</small>
        ${w?.primary ? `<span class="fm-cat2-acc"><button type="button" class="fm-link" data-cat="${esc(c.categoryId)}">Editar</button>${c.week ? `<button type="button" class="fm-link rojo" data-quitar="${esc(c.categoryId)}">Quitar</button>` : `<button type="button" class="fm-link rojo" data-descarta="${esc(c.categoryId)}">Descartar</button>`}</span>` : ''}</footer>
    </article>`;
  }).join('');
  const cta = st.sinPublicar
    ? `<button type="button" id="fmRevisar" class="primary">Revisar y publicar (${st.sinPublicar})</button>`
    : st.n && st.publicadas === st.n ? '<p class="fm-listo">Semana publicada. Tus Formadores ya la ven.</p>'
      : `<button type="button" class="primary" disabled>Elige los Retos para publicar</button>`;
  return `<section class="fm-hero2"><span>SEMANA TANNER · ${esc(rangoSemana(d.weekStart))}</span>
      <h1>${st.n ? (st.actual <= 5 ? `Paso ${st.actual}: ${esc(st.pasos[st.actual - 1].titulo)}` : 'Tu semana está lista') : 'Sin categorías esa semana'}</h1>
      <p>Publica a más tardar el ${esc(fecha(d.publishBy, { weekday: 'long', day: 'numeric', month: 'short' }))}, ${esc(hora(d.publishBy))}. Los Formadores cierran su planeación el ${esc(fecha(d.deadline, { weekday: 'long' }))}, ${esc(hora(d.deadline))}.</p></section>
    ${st.n ? pasos : ''}
    ${cats.length ? `<div class="fm-cats2">${tarjetas}</div>` : '<p class="fm-vacio">Ninguna categoría tiene horario esa semana.</p>'}
    <div class="fm-acciones">${cta}</div>`;
}

/* La hoja de una categoría: dos pasos (Reto y qué quieres ver), y abajo el
   historial y "Quitar". */
function hojaReto(c) {
  const w = { ...(semanaDe(c) || {}) };
  const kind = c.usesChallenges ? 'reto' : 'mundo_baby';
  const opciones = catalogo.concepts.filter(x => x.kind === kind);
  let paso = w.primary ? 2 : 1;
  const ejemplos = c.usesChallenges ? ['Que se atrevan a encarar', 'Que levanten la cabeza antes de pasar', 'Que presionen rápido al perderla'] : ['Que frenen sin caerse', 'Que conduzcan con la pelota cerca', 'Que se diviertan compartiendo'];
  const titulo = `${c.category} · ${rangoSemana(dataDir.weekStart)}`;
  const cuerpo = () => paso === 1
    ? `<p class="fm-paso-eti">PASO 1 DE 2</p><h3 class="fm-pregunta">¿Qué ${c.usesChallenges ? 'Reto' : 'mundo'} trabajamos esta semana?</h3>
       <p class="fm-ayuda">${c.usesChallenges ? 'El Reto vive toda la semana. Tú decides el QUÉ; el Formador, el CÓMO.' : 'Baby no usa los 9 Retos: elige su mundo de la semana.'}</p>
       <div class="fm-grid-retos" role="radiogroup">${opciones.map(o => `<button type="button" role="radio" data-reto="${esc(o.code)}" aria-checked="${w.primary === o.code}" class="${w.primary === o.code ? 'activa' : ''}"><b>${esc(o.name)}</b><small>${esc(o.question || o.phrase || '')}</small></button>`).join('')}</div>`
    : `<p class="fm-paso-eti">PASO 2 DE 2</p><button type="button" class="fm-elegido" data-paso="1"><span>${c.usesChallenges ? 'RETO' : 'MUNDO'}</span><b>${esc(nombreReto(w.primary))}</b><small>Cambiar</small></button>
       <h3 class="fm-pregunta">¿Qué quieres ver en la cancha?</h3>
       <label class="fm-campo"><span class="sr">Lo que queremos ver</span><input id="fmConducta" maxlength="140" value="${esc(w.behavior || '')}" placeholder="${esc(ejemplos[0])}"></label>
       <div class="fm-ejemplos">${ejemplos.map(x => `<button type="button" data-ejemplo="${esc(x)}">${esc(x)}</button>`).join('')}</div>
       ${c.usesChallenges ? `<details class="fm-mas"${w.secondary ? ' open' : ''}><summary>Agregar Reto secundario (opcional)</summary><select id="fmSec"><option value="">Ninguno</option>${opciones.filter(o => o.code !== w.primary).map(o => `<option value="${esc(o.code)}"${w.secondary === o.code ? ' selected' : ''}>${esc(o.name)}</option>`).join('')}</select></details>` : ''}
       <section class="fm-historia" id="fmHistoria"><h4>Historial</h4><p class="fm-ayuda">Cargando…</p></section>
       ${c.week ? `<button type="button" class="fm-quitar" data-quitar="${esc(c.categoryId)}">Quitar el ${c.usesChallenges ? 'Reto' : 'mundo'} de esta semana</button>` : ''}`;
  const pie = () => paso === 1 ? '' : `<button type="button" class="secondary" data-paso="1">Atrás</button><button type="button" class="primary" id="fmGuardaReto">Listo</button>`;
  const repinta = () => { $('fmHojaCuerpo').innerHTML = cuerpo(); $('fmHojaPie').innerHTML = pie(); if (paso === 2) cargaHistoria(c); };
  abreHoja(titulo, cuerpo(), pie());
  if (paso === 2) cargaHistoria(c);
  $('fmHoja').onclick = e => {
    if (e.target.id === 'fmHoja' || e.target.closest('[data-cerrar]')) return;
    const r = e.target.closest('[data-reto]');
    if (r) { w.primary = r.dataset.reto; if (w.secondary === w.primary) w.secondary = ''; paso = 2; repinta(); return; }
    const p = e.target.closest('[data-paso]');
    if (p) { w.behavior = $('fmConducta')?.value ?? w.behavior; w.secondary = $('fmSec')?.value ?? w.secondary; paso = +p.dataset.paso; repinta(); return; }
    const ej = e.target.closest('[data-ejemplo]');
    if (ej) { $('fmConducta').value = ej.dataset.ejemplo; $('fmConducta').focus(); return; }
    if (e.target.closest('#fmGuardaReto')) {
      const sec = $('fmSec')?.value || null;
      if (sec && sec === w.primary) { aviso('El secundario no puede ser el mismo Reto', 'error'); return; }
      borrador[c.categoryId] = { primary: w.primary, secondary: sec, behavior: $('fmConducta').value.trim() };
      cierraHoja(); pinta(); aviso('Listo. Falta publicar para que lo vea el Formador.');
      return;
    }
    const q = e.target.closest('[data-quitar]');
    if (q) quita(c);
  };
}

const ACCIONES = { creada: 'La guardó', guardada: 'La guardó', publicada: 'La publicó', editada: 'La cambió', quitada: 'La quitó' };
async function cargaHistoria(c) {
  const caja = $('fmHistoria'); if (!caja) return;
  try {
    const h = await rpc('v2_training_week_history', { organization_id: org, category_id: c.categoryId, week_start: dataDir.weekStart }) || [];
    if (!$('fmHistoria')) return;
    const desc = x => x ? `${nombreReto(x.primary)}${x.secondary ? ' + ' + nombreReto(x.secondary) : ''}${x.behavior ? ` · “${x.behavior}”` : ''}` : '';
    $('fmHistoria').innerHTML = `<h4>Historial</h4>${h.length ? `<ol>${h.map(x => `<li><b>${esc(x.by)}</b> ${esc((ACCIONES[x.action] || 'La cambió').toLowerCase())} <time>${esc(haceCuanto(x.at))}</time>
        ${x.action === 'editada' && x.before ? `<small>Antes: ${esc(desc(x.before))}</small>` : ''}${x.after ? `<small>${x.action === 'editada' ? 'Ahora' : 'Quedó'}: ${esc(desc(x.after))}</small>` : x.before ? `<small>Tenía: ${esc(desc(x.before))}</small>` : ''}</li>`).join('')}</ol>` : '<p class="fm-ayuda">Sin cambios todavía.</p>'}`;
  } catch { if ($('fmHistoria')) $('fmHistoria').innerHTML = '<h4>Historial</h4><p class="fm-ayuda">El historial lo ven Presidencia y Dirección.</p>'; }
}

async function quita(c) {
  const pregunta = { kicker: 'QUITAR', title: `¿Quitar el ${c.usesChallenges ? 'Reto' : 'mundo'} de ${c.category}?`, message: 'El Formador deja de verlo. Queda en el historial quién lo quitó y cuándo.', confirmText: 'Sí, quitar', cancelText: 'Cancelar', danger: true };
  const ok = window.tosConfirm ? await window.tosConfirm(pregunta) : confirm(pregunta.title);
  if (!ok) return;
  try {
    await rpc('v2_remove_training_week', { organization_id: org, category_id: c.categoryId, week_start: dataDir.weekStart });
    delete borrador[c.categoryId]; cierraHoja(); aviso(`Se quitó el Reto de ${c.category}`); await carga();
  } catch (e) { aviso(errorDe(e), 'error'); }
}

// Paso 4: revisar todo junto antes de publicar. Paso 5: publicar.
function hojaRevisar() {
  const cats = (dataDir?.categories || []);
  const filas = cats.map(c => {
    const w = semanaDe(c), cambia = !!borrador[c.categoryId] || (w?.primary && c.week?.status !== 'published');
    return `<li class="${w?.primary ? '' : 'falta'}"><b>${esc(c.category)}</b><span>${w?.primary ? `${esc(nombreReto(w.primary))}${w.secondary ? ' + ' + esc(nombreReto(w.secondary)) : ''}` : 'Sin Reto'}</span>
      <small>${w?.primary ? (String(w.behavior || '').trim() ? `Queremos ver: ${esc(w.behavior)}` : 'Sin “qué queremos ver”') : 'No se publica'}</small>
      <em class="fm-pill ${cambia ? 'borrador' : w?.primary ? 'ok' : 'gris'}">${cambia ? 'Se publica' : w?.primary ? 'Ya publicada' : '—'}</em></li>`;
  }).join('');
  abreHoja(`Paso 4 · Revisa tu semana · ${rangoSemana(dataDir.weekStart)}`, `<ul class="fm-revisa">${filas}</ul>
    <p class="fm-ayuda">Al publicar (paso 5), cada Formador ve el Reto de su categoría y planea sus sesiones antes del ${esc(fecha(dataDir.deadline, { weekday: 'long' }))}, ${esc(hora(dataDir.deadline))}.</p>`,
    `<button type="button" class="secondary" data-cerrar>Seguir editando</button><button type="button" class="primary" id="fmPublicar">Publicar semana</button>`);
  $('fmHoja').onclick = e => { if (e.target.closest('#fmPublicar')) publica(); };
}

async function publica() {
  const cats = (dataDir?.categories || []).filter(c => semanaDe(c)?.primary && (borrador[c.categoryId] || c.week?.status !== 'published'));
  const weeks = cats.map(c => { const w = semanaDe(c); return { categoryId: c.categoryId, weekStart: dataDir.weekStart, primary: w.primary, secondary: w.secondary || '', behavior: w.behavior || '' }; });
  if (!weeks.length) return;
  const b = $('fmPublicar'); if (b) { b.disabled = true; b.textContent = 'Publicando…'; }
  try { await rpc('v2_save_training_weeks', { organization_id: org, weeks, publish: true }); borrador = {}; cierraHoja(); aviso('Semana publicada: los Formadores ya la ven'); await carga(); }
  catch (e) { aviso(errorDe(e), 'error'); if (b) { b.disabled = false; b.textContent = 'Publicar semana'; } }
}

/* ---------- Formador: próxima semana ---------- */
function pintaSesiones() {
  const d = dataMia; if (!d) return '';
  const ses = d.sessions || [], r = resumenSemana(ses);
  const tarjetas = ses.map(s => {
    const lista = s.plan?.status === 'ready';
    const reto = s.plan?.challenge || s.week?.primary;
    return `<button type="button" class="fm-ses${lista ? ' lista' : ''}" data-ses="${esc(s.sessionId)}">
      <span class="fm-ses-dia">${esc(dia(s.startsAt))}</span>
      <span class="fm-ses-txt"><b>${esc(s.category)}</b><small>${esc(hora(s.startsAt))}–${esc(hora(s.endsAt))}${reto ? ` · ${esc(nombreReto(reto))}` : ''}</small></span>
      <span class="fm-pill ${lista ? 'ok' : 'pendiente'}">${lista ? 'Lista' : 'Pendiente'}</span></button>`;
  }).join('');
  return `${pintaHoy()}<section class="fm-hero ${r.completa ? 'completa' : ''}"><span>PRÓXIMA SEMANA · ${esc(rangoSemana(d.weekStart))}</span>
      <h1>${r.total ? (r.completa ? 'Próxima semana — lista' : `${r.total} ${r.total === 1 ? 'sesión' : 'sesiones'} · ${r.listas} ${r.listas === 1 ? 'lista' : 'listas'} · ${r.pendientes} ${r.pendientes === 1 ? 'pendiente' : 'pendientes'}`) : 'Sin sesiones esa semana'}</h1>
      <p>Corte: ${esc(fecha(d.deadline, { weekday: 'long', day: 'numeric', month: 'short' }))} a las ${esc(hora(d.deadline))}.</p>
      ${r.pendientes ? '<button type="button" id="fmTerminar" class="fm-cta">Terminar planeación</button>' : ''}</section>
    ${ses.length ? pintaPasosFormador(ses) : ''}
    ${ses.length ? `${bannerPractica()}<div class="fm-lista">${tarjetas}</div>` : vacioConPractica(d)}`;
}

/* ---------- Botones de juego (13/10/2026) ----------
   "Que sea como videojuego... que cualquier persona que sepa de fútbol pueda
   hacerlo." Dificultad como en un juego (Fácil verde, Normal amarillo, Difícil
   rojo) y el espacio con su cancha dibujada. Los valores no cambian (facil /
   base / dificil, completo / reducido); sólo cómo se ven y se dicen. */
const NIVELES_JUEGO = [['facil', 'Fácil', '¿Les cuesta?'], ['base', 'Normal', 'Como viene'], ['dificil', 'Difícil', '¿Ya les sale?']];
const NOMBRE_NIVEL = { facil: 'Fácil', base: 'Normal', dificil: 'Difícil' };
const ESPACIOS = [['completo', 'Cancha completa', 'Más correr y decidir'], ['reducido', 'Cancha chica', 'Más toques y duelos']];
const NOMBRE_ESPACIO = { completo: 'Cancha completa', reducido: 'Cancha chica' };
const CANCHA = {
  completo: '<svg viewBox="0 0 64 40" aria-hidden="true"><rect x="3" y="3" width="58" height="34" rx="3"/><path d="M32 3v34"/><circle cx="32" cy="20" r="6"/><path d="M3 13h8v14H3M61 13h-8v14h8"/></svg>',
  reducido: '<svg viewBox="0 0 64 40" aria-hidden="true"><rect x="3" y="3" width="58" height="34" rx="3" class="fuera"/><rect x="16" y="9" width="32" height="22" rx="2"/><path d="M32 9v22M16 16h4v8h-4M48 16h-4v8h4"/></svg>'
};
function botonesDificultad(attr, actual) {
  return `<div class="fm-juego" role="radiogroup" aria-label="Dificultad">${NIVELES_JUEGO.map(([k, l, sub]) =>
    `<button type="button" role="radio" aria-checked="${actual === k}" class="fm-jbtn fm-jbtn-${k}${actual === k ? ' activa' : ''}" ${attr(k)}><b>${l}</b><small>${sub}</small></button>`).join('')}</div>`;
}
function botonesEspacio(attr, actual) {
  return `<div class="fm-espacio" role="radiogroup" aria-label="Espacio">${ESPACIOS.map(([k, l, sub]) =>
    `<button type="button" role="radio" aria-checked="${actual === k}" class="fm-ebtn${actual === k ? ' activa' : ''}" ${attr(k)}>${CANCHA[k]}<b>${l}</b><small>${sub}</small></button>`).join('')}</div>`;
}
const ajustes = (attrDif, dif, attrEsp, esp) => `<div class="fm-ajustes"><p class="fm-ajuste-tit">Dificultad</p>${botonesDificultad(attrDif, dif)}<p class="fm-ajuste-tit">Espacio</p>${botonesEspacio(attrEsp, esp)}</div>`;

/* ---------- Práctica guiada (13/10/2026) ----------
   "Que haya un ejemplo, como un onboarding para que el formador sepa cómo,
   un demo pero sin decirle demo." Cinco pantallas con una sesión de ejemplo:
   el Reto, las partes de la sesión, elegir la jugada, ajustarla y dejarla
   lista. No guarda nada ni avisa a nadie. */
const inicioFormacion = () => dataMia?.settings?.inicio || null;
function vacioConPractica(d) {
  const ini = inicioFormacion();
  const antes = ini && d?.weekStart && d.weekStart < ini;
  return `<section class="fm-practica-card">
      <span class="fm-practica-eti">${antes ? 'MUY PRONTO' : 'SIN SESIONES ESTA SEMANA'}</span>
      <h2>${antes ? `Formación arranca el ${esc(fecha(ini + 'T12:00:00Z', { day: 'numeric', month: 'long' }))}` : (esDireccion ? 'No hay sesiones de esa semana' : 'No tienes sesiones esa semana')}</h2>
      <p>${antes ? 'Tus sesiones aparecen solas con el horario de cada categoría. Mientras, practica cómo se planea una: toma 1 minuto y no se guarda nada.'
        : esDireccion ? 'Las sesiones salen del horario de cada categoría. Mientras, puedes ver cómo planea un Formador.' : 'Si deberías tenerlas, avísale a Dirección. Mientras, practica cómo se planea una sesión.'}</p>
      <button type="button" class="fm-practica-btn" data-practica>Practicar cómo se planea · 1 min</button></section>`;
}
function bannerPractica() {
  let visto = false; try { visto = localStorage.getItem('tos:fm:practica') === '1'; } catch {}
  if (visto) return '';
  return `<div class="fm-practica-banner"><span><b>¿Primera vez?</b> Practica cómo se planea en 1 minuto.</span><button type="button" data-practica>Practicar</button><button type="button" class="fm-x" data-practica-cierra aria-label="Ya sé cómo">×</button></div>`;
}
function practica() {
  try { localStorage.setItem('tos:fm:practica', '1'); } catch {}
  const reto = catalogo.concepts.find(c => c.kind === 'reto' && c.code === '1v1') || catalogo.concepts.find(c => c.kind === 'reto');
  const recos = recomienda({ tareas: catalogo.tasks, etapa: 't10', reto: reto?.code, bloque: { escalon: 0 }, indiceSesion: 0, totalSesiones: 2 });
  const st = { paso: 1, tarea: null, dif: 'base', esp: 'completo' };
  const TOTAL = 5;
  const dots = () => `<div class="fm-pr-dots" aria-hidden="true">${Array.from({ length: TOTAL }, (_, i) => `<i class="${i + 1 <= st.paso ? 'on' : ''}"></i>`).join('')}</div>`;
  const tip = t => `<p class="fm-pr-tip"><span class="fm-pr-ico" aria-hidden="true">i</span><span>${t}</span></p>`;
  const t = () => st.tarea ? catalogo.tasks.find(x => x.id === st.tarea) : null;
  const pantallas = {
    1: () => `${dots()}<p class="fm-paso-eti">PASO 1 DE 5 · EL RETO</p><h3 class="fm-pregunta">Cada semana tiene un Reto</h3>
      <div class="fm-pr-reto"><span>RETO DE LA SEMANA</span><b>${esc(reto?.name || '1V1')}</b><p>${esc(reto?.question || '')}</p><p class="fm-conducta">Buscamos: que se atrevan a encarar</p></div>
      ${tip('Dirección decide el <b>qué</b> (el Reto). Tú decides el <b>cómo</b>: la jugada que vas a poner en la cancha.')}`,
    2: () => `${dots()}<p class="fm-paso-eti">PASO 2 DE 5 · TU SESIÓN</p><h3 class="fm-pregunta">Una sesión de 60 minutos tiene 3 partes</h3>
      <div class="fm-pr-partes"><div class="ya"><b>Calentar</b><small>Ya viene puesto</small><i style="flex:15"></i></div><div class="tu"><b>Tu jugada</b><small>Esto eliges tú</small><i style="flex:30"></i></div><div class="ya"><b>Jugar</b><small>Ya viene puesto</small><i style="flex:15"></i></div></div>
      ${tip('Sólo eliges <b>una</b> cosa: la jugada del centro. Calentar y jugar ya vienen listos (en 90 minutos son dos jugadas).')}`,
    3: () => `${dots()}<p class="fm-paso-eti">PASO 3 DE 5 · ELIGE TU JUGADA</p><h3 class="fm-pregunta">Te recomendamos 3. Toca una.</h3>
      <div class="fm-pr-recos">${recos.map(x => `<button type="button" data-pr-tarea="${esc(x.id)}" class="${st.tarea === x.id ? 'activa' : ''}"><b>${esc(x.name)}</b><small>${esc(x.buscamos || '')}</small></button>`).join('')}</div>
      ${tip('Están ordenadas para el Reto y para el día de la semana. Si quieres otra, en tu sesión real tienes <b>Ver más</b> y el <b>Álbum de jugadas</b>.')}`,
    4: () => `${dots()}<p class="fm-paso-eti">PASO 4 DE 5 · AJÚSTALA A TU GRUPO</p><h3 class="fm-pregunta">${esc(t()?.name || 'Tu jugada')}</h3>
      ${ajustes(k => `data-pr-dif="${k}"`, st.dif, k => `data-pr-esp="${k}"`, st.esp)}
      <p class="fm-modo fm-modo-${st.dif}">${st.dif === 'facil' ? `<b>Fácil:</b> ${esc(t()?.easier || '')}` : st.dif === 'dificil' ? `<b>Difícil:</b> ${esc(t()?.harder || '')}` : `<b>Normal:</b> ${esc(t()?.juega || '')}`}</p>
      ${tip('¿Tu grupo va adelantado o le está costando? Súbele o bájale. No hay respuesta mala: <b>tú conoces a tus Tanners</b>.')}`,
    5: () => `${dots()}<p class="fm-paso-eti">PASO 5 DE 5 · DÉJALA LISTA</p><h3 class="fm-pregunta">Así queda tu sesión</h3>
      <ol class="fm-pr-resumen"><li><span>15 min</span><b>Calentar</b></li><li class="tu"><span>30 min</span><b>${esc(t()?.name || '')}</b><small>${NOMBRE_NIVEL[st.dif]} · ${NOMBRE_ESPACIO[st.esp]}</small></li><li><span>15 min</span><b>Jugar</b></li></ol>
      ${tip('Toca <b>Confirmar lista</b> y listo. El día de la sesión, abre <b>Modo Cancha</b>: te dice qué decirles y qué observar.')}`,
    6: () => `<div class="fm-pr-fin"><div class="fm-pr-check" aria-hidden="true">✓</div><h3>¡Así se planea!</h3>
      <p>Reto → tu jugada → ajustarla → lista. Con tus sesiones reales son los mismos pasos: <b>3 toques por sesión</b>.</p>
      <p class="fm-ayuda">Esta fue una práctica: no se guardó nada.</p></div>`
  };
  const pie = () => st.paso === 6
    ? `<button type="button" class="secondary" data-pr-album>Ver el Álbum</button><button type="button" class="primary" data-cerrar>Ir a mis sesiones</button>`
    : `${st.paso > 1 ? '<button type="button" class="secondary" data-pr-atras>Atrás</button>' : ''}<button type="button" class="primary" data-pr-sig${st.paso === 3 && !st.tarea ? ' disabled' : ''}>${st.paso === 5 ? 'Confirmar lista' : 'Siguiente'}</button>`;
  const repinta = () => { $('fmHojaCuerpo').innerHTML = pantallas[st.paso](); $('fmHojaPie').innerHTML = pie(); };
  abreHoja('Práctica · Tu primera sesión', pantallas[1](), pie());
  $('fmHoja').classList.add('fm-hoja-practica');
  $('fmHoja').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.prTarea) { st.tarea = b.dataset.prTarea; repinta(); return; }
    if (b.dataset.prDif) { st.dif = b.dataset.prDif; repinta(); return; }
    if (b.dataset.prEsp) { st.esp = b.dataset.prEsp; repinta(); return; }
    if (b.hasAttribute('data-pr-sig')) { if (st.paso === 3 && !st.tarea) return; st.paso++; repinta(); return; }
    if (b.hasAttribute('data-pr-atras')) { st.paso = Math.max(1, st.paso - 1); repinta(); return; }
    if (b.hasAttribute('data-pr-album')) { cierraHoja(); tab = 'banco'; pinta(); }
  };
}

/* Los pasos del Formador (13/10/2026): el mismo camino claro que la Semana
   Tanner de Dirección. Los dos últimos pasos pasan en la cancha. */
function pintaPasosFormador(ses) {
  const st = pasosDelFormador(ses);
  return `<ol class="fm-pasos" aria-label="Tu semana en 5 pasos">${st.pasos.map(p => `<li class="${p.hecho ? 'hecho' : p.n === st.actual ? 'actual' : p.info ? 'info' : ''}">
    <span class="fm-paso-n" aria-hidden="true">${p.hecho ? '✓' : p.n}</span><span class="fm-paso-txt"><b>${esc(p.titulo)}</b><small>${esc(p.detalle)}</small></span></li>`).join('')}</ol>`;
}

function hojaSesion(s, pre = '') {
  const ses = dataMia.sessions, indice = ses.filter(x => x.categoryId === s.categoryId).findIndex(x => x.sessionId === s.sessionId);
  const total = ses.filter(x => x.categoryId === s.categoryId).length;
  const minutos = (new Date(s.endsAt) - new Date(s.startsAt)) / 60000, esBaby = esBabyEtapa(s.stage);
  const bloques = bloquesDeSesion(minutos, esBaby);
  const reto = s.week?.primary || '', previo = s.plan?.items || [];
  // Lo ya usado en otras sesiones de la semana baja en la recomendación.
  const usos = {}; ses.filter(x => x.sessionId !== s.sessionId).forEach(x => (x.plan?.items || []).forEach(i => { if (i.taskId) usos[i.taskId] = (usos[i.taskId] || 0) + 1; }));
  const sel = bloques.map((b, i) => {
    const p = previo.find(x => x.block === b.key) || previo[i] && !previo[i].block && previo[i] || null;
    const base = b.juego ? (esBaby ? 'Partiditos 1v1, 2v2 o 3v3' : 'Juego libre') : b.principal ? '' : (esBaby ? 'Llegada activa con balón' : 'Calentamiento con balón');
    return { block: b.key, taskId: p?.taskId || '', text: p?.text || base, difficulty: p?.difficulty || 'base', space: p?.space || 'completo' };
  });
  // Desde el Álbum: la jugada entra en la primera tarea libre (o en la primera tarea).
  if (pre) {
    const libres = bloques.map((b, i) => b.principal && !sel[i].taskId && !sel[i].text ? i : -1).filter(i => i >= 0);
    const i = libres.length ? libres[0] : bloques.findIndex(b => b.principal);
    if (i >= 0) { sel[i].taskId = pre; sel[i].text = ''; }
  }
  const recos = b => recomienda({ tareas: catalogo.tasks, etapa: s.stage, esBaby, reto, secundario: s.week?.secondary, bloque: b, indiceSesion: indice, totalSesiones: total, usos });
  const todas = () => catalogo.tasks.filter(t => t.bank === (esBaby ? 'baby' : 'tanner') && (!s.stage || (t.stages || []).includes(s.stage)));
  const textoItem = it => it.taskId ? esc(tarea(it.taskId)?.name || 'Tarea') : esc(it.text || '');

  const cuerpo = () => `
    <div class="fm-reto-card">${reto ? `<span>${esBaby ? 'MUNDO' : 'RETO'}</span><b>${esc(nombreReto(reto))}</b>${s.week?.secondary ? `<small>Secundario: ${esc(nombreReto(s.week.secondary))}</small>` : ''}<p>${esc(concepto('reto', reto)?.question || concepto('mundo_baby', reto)?.phrase || '')}</p>${s.week?.behavior ? `<p class="fm-conducta">Buscamos: ${esc(s.week.behavior)}</p>` : ''}`
      : `<span>OBJETIVO</span><p class="fm-ayuda">Dirección aún no publica el Reto de esta semana. Escribe tu objetivo: cuenta igual.</p><input id="fmObjetivo" maxlength="140" value="${esc(s.plan?.objective || '')}" placeholder="Ej. que se atrevan a encarar">`}</div>
    ${bloques.map((b, i) => {
      const it = sel[i];
      return `<section class="fm-bloque" data-i="${i}"><header><b>${esc(b.nombre)}</b>${it.taskId || it.text ? `<button type="button" class="fm-link" data-cambiar="${i}">Cambiar</button>` : ''}</header>
        ${it.taskId || it.text ? `<p class="fm-elegida">${textoItem(it)}${it.taskId ? `<small>${esc(tarea(it.taskId)?.buscamos || '')}</small>` : ''}</p>`
          : `<div class="fm-recos">${recos(b).map(t => `<button type="button" data-elige="${i}" data-task="${esc(t.id)}"><b>${esc(t.name)}</b><small>${esc(t.buscamos)}</small></button>`).join('')}
             <button type="button" class="fm-link" data-mas="${i}">Ver más</button><button type="button" class="fm-link" data-escribe="${i}">Escribir otra</button></div>`}
        ${b.principal && (it.taskId || it.text) ? ajustes(k => `data-dif="${i}" data-v="${k}"`, it.difficulty, k => `data-esp="${i}" data-v="${k}"`, it.space) : ''}
      </section>`;
    }).join('')}
    <p id="fmFalta" class="fm-falta"></p>`;
  const repinta = () => { $('fmHojaCuerpo').innerHTML = cuerpo(); };
  abreHoja(`${dia(s.startsAt)} · ${s.category} · ${hora(s.startsAt)}–${hora(s.endsAt)}`, cuerpo(),
    `<button type="button" class="secondary" id="fmGuardar">Guardar</button><button type="button" class="primary" id="fmConfirmar">Confirmar lista</button>`);
  $('fmHojaCuerpo').onclick = e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.elige) { const it = sel[+t.dataset.elige]; it.taskId = t.dataset.task; it.text = ''; repinta(); }
    else if (t.dataset.cambiar) { const it = sel[+t.dataset.cambiar]; it.taskId = ''; it.text = ''; repinta(); }
    else if (t.dataset.mas) {
      const i = +t.dataset.mas, caja = t.closest('.fm-recos');
      caja.innerHTML = todas().map(x => `<button type="button" data-elige="${i}" data-task="${esc(x.id)}"><b>${esc(x.name)}</b><small>${esc(nombreReto(x.primary))}${x.level ? ' · ' + esc(concepto('nivel', x.level)?.name || '') : ''}</small></button>`).join('');
    } else if (t.dataset.escribe) {
      const i = +t.dataset.escribe;
      t.closest('.fm-recos').innerHTML = `<div class="fm-escribe"><input data-texto="${i}" maxlength="140" placeholder="¿Qué van a hacer?"><button type="button" class="primary" data-usa="${i}">Usar</button></div>`;
      $('fmHojaCuerpo').querySelector(`[data-texto="${i}"]`).focus();
    } else if (t.dataset.usa) {
      const i = +t.dataset.usa, txt = $('fmHojaCuerpo').querySelector(`[data-texto="${i}"]`).value.trim();
      if (txt) { sel[i].text = txt.slice(0, 140); sel[i].taskId = ''; repinta(); }
    } else if (t.dataset.dif) { sel[+t.dataset.dif].difficulty = t.dataset.v; repinta(); }
    else if (t.dataset.esp) { sel[+t.dataset.esp].space = t.dataset.v; repinta(); }
  };
  const guarda = async listo => {
    const objetivo = $('fmObjetivo')?.value.trim() || s.plan?.objective || '';
    const items = sel.filter(x => x.taskId || x.text).map(x => ({ block: x.block, taskId: x.taskId || '', text: x.taskId ? '' : x.text, difficulty: x.difficulty, space: x.space }));
    // El juego libre solo no hace una sesión: falta la tarea principal.
    const principales = bloques.map((b, i) => b.principal && (sel[i].taskId || sel[i].text)).filter(Boolean).length;
    const falta = faltaParaLista({ reto, objetivo, items: principales ? items : [] });
    if (listo && falta.length) { $('fmFalta').textContent = `Para dejarla lista falta ${falta.join(' y ')}.`; return; }
    const btn = listo ? $('fmConfirmar') : $('fmGuardar'); btn.disabled = true;
    try {
      await rpc('v2_save_session_plan', { organization_id: org, session_id: s.sessionId, plan: { challenge: reto, objective: objetivo, items, ready: listo } });
      cierraHoja(); aviso(listo ? 'Sesión lista' : 'Guardado'); await carga();
    } catch (e) { $('fmFalta').textContent = errorDe(e); btn.disabled = false; }
  };
  $('fmGuardar').onclick = () => guarda(false);
  $('fmConfirmar').onclick = () => guarda(true);
}

/* ---------- HOY · Modo Cancha · Cierre ----------
   "El profe debe entender qué enseñar hoy en menos de 10 segundos" y cerrar
   en menos de 20. Modo Cancha: tarea, tiempo, DILE y 2–3 OBSERVA, Siguiente.
   Cierre: ¿Apareció lo que buscábamos? Sí / A veces / Todavía no. */
const CIERRE = { si: 'Sí', a_veces: 'A veces', todavia_no: 'Todavía no' };
function pintaHoy() {
  const hoy = (dataHoy?.sessions || []);
  if (!hoy.length) return '';
  return hoy.map(s => {
    const reto = s.plan?.challenge || s.week?.primary, busca = s.week?.behavior || s.plan?.objective;
    const frase = (s.plan?.items || []).map(i => tarea(i.taskId)).find(t => t?.dile?.length)?.dile[0];
    return `<button type="button" class="fm-hoy${s.closure ? ' cerrada' : ''}" data-hoy="${esc(s.sessionId)}">
      <span class="fm-hoy-eti">HOY · ${esc(s.category)} · ${esc(hora(s.startsAt))}</span>
      <b>${reto ? `${esBabyEtapa(s.stage) ? 'MUNDO' : 'RETO'}: ${esc(nombreReto(reto))}` : 'Sin Reto'}</b>
      ${busca ? `<span>Hoy buscamos: ${esc(busca)}</span>` : ''}${frase ? `<span class="fm-hoy-frase">“${esc(frase)}”</span>` : ''}
      <span class="fm-hoy-cta">${s.closure ? `Cerrada · ${esc(CIERRE[s.closure])}` : s.plan ? 'Ver mi sesión' : 'Sin plan · Cerrar al terminar'}</span></button>`;
  }).join('');
}
let reloj = null, wakeLock = null;
async function modoCancha(s) {
  const pasos = (s.plan?.items || []).map(i => ({ ...i, t: tarea(i.taskId) }));
  let paso = 0, inicio = Date.now();
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { wakeLock = null; }
  const observables = t => String(t?.observa || '').split(/,\s*|\s+y\s+/).map(x => mayus(x.trim())).filter(Boolean).slice(0, 3);
  const pinta = () => {
    const p = pasos[paso];
    $('fmHoja').classList.add('fm-cancha');
    if (!p) return cierre();
    abreHoja(`${s.category} · ${paso + 1} de ${pasos.length}`, `
      <div class="fm-cancha-paso"><span>${esc(String(p.block || '').replace(/\d$/, '').toUpperCase() || 'TAREA')}</span>
        <h3>${esc(p.t?.name || p.text || '')}</h3>
        <p class="fm-reloj" id="fmReloj">0:00</p>
        ${p.t?.dile?.length ? `<p class="fm-dile">${p.t.dile.map(f => `“${esc(f)}”`).join('<br>')}</p>` : ''}
        ${p.t ? `<ul class="fm-observa">${observables(p.t).map(o => `<li>${esc(o)}</li>`).join('')}</ul>` : ''}
        ${p.t ? `<div class="fm-juego dos"><button type="button" class="fm-jbtn fm-jbtn-facil" data-ver="facil"><b>Fácil</b><small>¿Les cuesta?</small></button><button type="button" class="fm-jbtn fm-jbtn-dificil" data-ver="dificil"><b>Difícil</b><small>¿Ya les sale?</small></button></div>
          <p class="fm-tarea-extra hidden" data-extra="facil">${esc(p.t.easier || '')}</p><p class="fm-tarea-extra hidden" data-extra="dificil">${esc(p.t.harder || '')}</p>` : ''}
      </div>`,
      `${paso ? '<button type="button" class="secondary" id="fmAtras">Atrás</button>' : '<a class="secondary fm-btn-link" href="/asistencia/">Pasar lista</a>'}<button type="button" class="primary" id="fmSiguiente">${paso === pasos.length - 1 ? 'Terminar' : 'Siguiente'}</button>`);
    inicio = Date.now(); clearInterval(reloj);
    reloj = setInterval(() => { const sgs = Math.floor((Date.now() - inicio) / 1000), r = $('fmReloj'); if (r) r.textContent = `${Math.floor(sgs / 60)}:${String(sgs % 60).padStart(2, '0')}`; }, 1000);
    $('fmHojaCuerpo').onclick = e => { const v = e.target.closest('[data-ver]'); if (v) $('fmHojaCuerpo').querySelector(`[data-extra="${v.dataset.ver}"]`).classList.toggle('hidden'); };
    $('fmSiguiente').onclick = () => { paso++; pinta(); };
    if ($('fmAtras')) $('fmAtras').onclick = () => { paso--; pinta(); };
  };
  const cierre = () => {
    clearInterval(reloj);
    const busca = s.week?.behavior || s.plan?.objective || (s.plan?.challenge ? nombreReto(s.plan.challenge) : 'lo que trabajamos');
    abreHoja(`${s.category} · Cierre`, `<div class="fm-cierre"><p>¿Apareció lo que buscábamos?</p><b>${esc(busca)}</b>
        <div class="fm-cierre-ops">${Object.entries(CIERRE).map(([k, l]) => `<button type="button" data-cierre="${k}" class="${s.closure === k ? 'activa' : ''}">${l}</button>`).join('')}</div>
        <label class="fm-campo">Nota (opcional)<input id="fmNota" maxlength="200" value="${esc(s.closureNote || '')}" placeholder="Algo que quieras recordar"></label>
        <p id="fmFalta" class="fm-falta"></p></div>`, '');
    $('fmHojaCuerpo').onclick = async e => {
      const b = e.target.closest('[data-cierre]'); if (!b) return;
      $('fmHojaCuerpo').querySelectorAll('[data-cierre]').forEach(x => { x.disabled = true; });
      try {
        await rpc('v2_close_session', { organization_id: org, session_id: s.sessionId, closure: b.dataset.cierre, note: $('fmNota').value.trim() || null });
        cierraHoja(); aviso('Sesión cerrada. ¡Gracias, profe!'); await carga();
      } catch (err) { $('fmFalta').textContent = errorDe(err); $('fmHojaCuerpo').querySelectorAll('[data-cierre]').forEach(x => { x.disabled = false; }); }
    };
  };
  pinta();
}

/* ---------- Álbum de jugadas (13/10/2026) ----------
   "Que sea fácil ver el banco y ponerlo, más dinámico, como gamification que
   entiendan todos." Como un videojuego: cada Reto es un MUNDO con su color, la
   escalera es el NIVEL (1 Sin rival → 4 En juego) y cada tarea es una CARTA
   con su misión y su grito para los niños. Tocar la carta la abre; desde ahí
   va directo a la sesión. Video y foto: próximamente. */
const NIVEL_TXT = ['', 'Sin rival', 'Con rival', 'Con decisión', 'En juego'];
const usadasEnMiSemana = () => new Set((dataMia?.sessions || []).flatMap(x => (x.plan?.items || []).map(i => i.taskId)).filter(Boolean));
const barras = n => `<span class="fm-nivel" aria-label="Nivel ${n} de 4">${[1, 2, 3, 4].map(k => `<i class="${k <= n ? 'on' : ''}"></i>`).join('')}</span>`;
function cartaMini(t, usadas) {
  const n = NIVEL_NUM[t.level] || 0, color = colorDeMundo(t.primary, t.bank);
  return `<button type="button" class="fm-carta" data-carta="${esc(t.id)}" style="--mundo:${color}">
    <span class="fm-carta-banda"><span>${esc(nombreReto(t.primary))}</span>${n ? barras(n) : '<span class="fm-nivel-baby">Baby</span>'}</span>
    <span class="fm-carta-cuerpo"><b>${esc(t.name)}</b>
      <small class="fm-carta-mision">${esc(t.buscamos || '')}</small>
      ${t.dile?.[0] ? `<em class="fm-carta-grito">“${esc(t.dile[0])}”</em>` : ''}</span>
    <span class="fm-carta-pie">${n ? `Nivel ${n} · ${esc(NIVEL_TXT[n])}` : esc(t.bank === 'baby' ? 'Banco Baby' : '')}${usadas.has(t.id) ? '<i class="fm-carta-usada">En tu semana</i>' : ''}</span>
  </button>`;
}
function gridAlbum() {
  const lista = filtraAlbum(catalogo.tasks, album), usadas = usadasEnMiSemana();
  return lista.length ? lista.map(t => cartaMini(t, usadas)).join('') : '<p class="fm-vacio">No hay jugadas con ese filtro.</p>';
}
function pintaBanco() {
  const kind = album.banco === 'baby' ? 'mundo_baby' : 'reto';
  const mundos = catalogo.concepts.filter(c => c.kind === kind);
  const total = catalogo.tasks.filter(t => t.bank === album.banco).length;
  const usadas = usadasEnMiSemana();
  const mundo = mundos.find(m => m.code === album.mundo);
  return `<section class="fm-album-hero"><span>ÁLBUM DE JUGADAS</span><h1>${total} jugadas · ${mundos.length} mundos</h1>
      <p>${mundo ? `${esc(mundo.name)}: ${esc(mundo.question || mundo.phrase || '')}` : 'Elige un mundo, sube de nivel y toca una carta para llevarla a tu sesión.'}</p>
      ${usadas.size ? `<p class="fm-album-uso">Esta semana usas ${usadas.size} ${usadas.size === 1 ? 'jugada' : 'jugadas'}</p>` : ''}</section>
    <div class="fm-album-filtros">
      <div class="fm-seg" role="group" aria-label="Banco"><button type="button" data-banco="tanner" class="${album.banco === 'tanner' ? 'activa' : ''}">Tanner</button><button type="button" data-banco="baby" class="${album.banco === 'baby' ? 'activa' : ''}">Baby</button></div>
      <input type="search" id="fmBusca" placeholder="Buscar jugada…" value="${esc(album.busca)}" aria-label="Buscar jugada">
    </div>
    <nav class="fm-mundos" aria-label="Mundos"><button type="button" data-mundo=""${!album.mundo ? ' class="activa"' : ''}>Todos</button>${mundos.map(m => `<button type="button" data-mundo="${esc(m.code)}" style="--mundo:${colorDeMundo(m.code, album.banco)}"${album.mundo === m.code ? ' class="activa"' : ''}><i></i>${esc(m.name)}</button>`).join('')}</nav>
    ${album.banco === 'tanner' ? `<div class="fm-seg fm-niveles" role="group" aria-label="Nivel">${[0, 1, 2, 3, 4].map(n => `<button type="button" data-nivel="${n}" class="${Number(album.nivel) === n ? 'activa' : ''}">${n ? `${n} · ${NIVEL_TXT[n]}` : 'Todos los niveles'}</button>`).join('')}</div>` : ''}
    <div class="fm-album" id="fmAlbum">${gridAlbum()}</div>`;
}

function hojaCarta(t) {
  const n = NIVEL_NUM[t.level] || 0, color = colorDeMundo(t.primary, t.bank);
  const mias = (dataMia?.sessions || []).filter(x => (t.bank === 'baby') === esBabyEtapa(x.stage) && (!(t.stages || []).length || !x.stage || t.stages.includes(x.stage)));
  abreHoja(t.name, `<div class="fm-carta-grande" style="--mundo:${color}">
      <div class="fm-carta-banda"><span>${esc(nombreReto(t.primary))}</span>${n ? `${barras(n)}<small>Nivel ${n} · ${esc(NIVEL_TXT[n])}</small>` : '<small>Banco Baby</small>'}</div>
      <section><h4>Misión</h4><p>${esc(t.buscamos || '')}</p></section>
      ${t.dile?.length ? `<section class="fm-grito"><h4>Grito para los niños</h4>${t.dile.map(f => `<p>“${esc(f)}”</p>`).join('')}</section>` : ''}
      <section><h4>Cómo se juega</h4><p>${esc(t.juega || '')}</p></section>
      ${t.montaje ? `<section><h4>Montaje</h4><p>${esc(t.montaje)}</p></section>` : ''}
      ${t.observa ? `<section><h4>Observa</h4><p>${esc(t.observa)}</p></section>` : ''}
      <div class="fm-juego dos"><button type="button" class="fm-jbtn fm-jbtn-facil" data-modo="facil"><b>Fácil</b><small>¿Les cuesta?</small></button><button type="button" class="fm-jbtn fm-jbtn-dificil" data-modo="dificil"><b>Difícil</b><small>¿Ya les sale?</small></button></div>
      <p class="fm-modo fm-modo-facil hidden" data-ver-modo="facil"><b>Fácil:</b> ${esc(t.easier || '')}</p>
      <p class="fm-modo fm-modo-dificil hidden" data-ver-modo="dificil"><b>Difícil:</b> ${esc(t.harder || '')}</p>
      ${t.space ? `<p class="fm-ayuda"><b>Espacio:</b> ${esc(t.space)}</p>` : ''}${t.adapta ? `<p class="fm-ayuda"><b>Adapta:</b> ${esc(t.adapta)}</p>` : ''}
      <div class="fm-media"><button type="button" data-media="video"><span class="fm-media-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z"/></svg></span><span><b>Ver video</b><small>Próximamente</small></span></button>
        <button type="button" data-media="foto"><span class="fm-media-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><circle cx="9" cy="10.5" r="1.8"/><path d="m20.5 16-5-4.5-7.5 7"/></svg></span><span><b>Ver foto del montaje</b><small>Próximamente</small></span></button></div>
      <p class="fm-media-nota hidden" id="fmMediaNota">${t.videoGuide ? `Así se verá: ${esc(t.videoGuide)}` : 'Muy pronto verás aquí el video y la foto de esta jugada.'}</p>
    </div>`,
    mias.length ? `<button type="button" class="secondary" data-cerrar>Cerrar</button><button type="button" class="primary" id="fmAgregar">Agregar a mi sesión</button>` : `<button type="button" class="secondary" data-cerrar>Cerrar</button>`);
  $('fmHoja').onclick = e => {
    const m = e.target.closest('[data-modo]');
    if (m) { const p = $('fmHojaCuerpo').querySelector(`[data-ver-modo="${m.dataset.modo}"]`); p.classList.toggle('hidden'); m.classList.toggle('activa', !p.classList.contains('hidden')); return; }
    if (e.target.closest('[data-media]')) { $('fmMediaNota').classList.remove('hidden'); return; }
    if (e.target.closest('#fmAgregar')) { eligeSesion(t, mias); }
  };
}
function eligeSesion(t, mias) {
  if (mias.length === 1) { cierraHoja(); hojaSesion(mias[0], t.id); return; }
  abreHoja(`¿A qué sesión va “${t.name}”?`, `<div class="fm-lista">${mias.map(x => `<button type="button" class="fm-ses${x.plan?.status === 'ready' ? ' lista' : ''}" data-va="${esc(x.sessionId)}">
      <span class="fm-ses-dia">${esc(dia(x.startsAt))}</span><span class="fm-ses-txt"><b>${esc(x.category)}</b><small>${esc(hora(x.startsAt))}–${esc(hora(x.endsAt))}</small></span>
      <span class="fm-pill ${x.plan?.status === 'ready' ? 'ok' : 'pendiente'}">${x.plan?.status === 'ready' ? 'Lista' : 'Pendiente'}</span></button>`).join('')}</div>`, '<button type="button" class="secondary" data-cerrar>Cancelar</button>');
  $('fmHoja').onclick = e => { const b = e.target.closest('[data-va]'); if (!b) return; const ses = mias.find(x => x.sessionId === b.dataset.va); cierraHoja(); hojaSesion(ses, t.id); };
}

/* ---------- Hoja inferior ---------- */
function abreHoja(titulo, cuerpo, pie) { $('fmHojaTitulo').textContent = titulo; $('fmHojaCuerpo').innerHTML = cuerpo; $('fmHojaPie').innerHTML = pie || ''; $('fmHoja').classList.remove('hidden'); document.body.classList.add('fm-sin-scroll'); }
function cierraHoja() { $('fmHoja').onclick = null; $('fmHoja').classList.remove('fm-hoja-practica'); clearInterval(reloj); try { wakeLock?.release(); } catch {} wakeLock = null; $('fmHoja').classList.remove('fm-cancha'); $('fmHoja').classList.add('hidden'); $('fmHojaCuerpo').onclick = null; document.body.classList.remove('fm-sin-scroll'); }
$('fmHoja').addEventListener('click', e => { if (e.target.id === 'fmHoja' || e.target.closest('[data-cerrar]')) cierraHoja(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') cierraHoja(); });

/* ---------- Pintar y cargar ---------- */
/* El botón flotante en Formación (13/10/2026): primero lo de esta pantalla. */
function accionesDeFormacion() {
  const pend = (dataMia?.sessions || []).find(x => x.plan?.status !== 'ready');
  window.tosAccionesDePantalla = [
    pend ? { label: 'Planear mi sesión', sub: `${pend.category} · ${dia(pend.startsAt)}`, icon: 'check', run: () => hojaSesion(pend) } : null,
    esDireccion ? { label: 'Semana Tanner', sub: 'Elegir y publicar los Retos', icon: 'calendar', run: () => { tab = 'semana'; pinta(); } } : null,
    { label: 'Practicar cómo se planea', sub: '1 minuto, no se guarda nada', icon: 'spark', run: practica },
    { label: 'Álbum de jugadas', sub: 'Las 60 jugadas por mundo y nivel', icon: 'book', run: () => { tab = 'banco'; pinta(); } }
  ].filter(Boolean);
  window.dispatchEvent(new Event('tos:acciones'));
}
function pinta() {
  accionesDeFormacion();
  pintaTabs();
  $('fmSemana').textContent = semana ? rangoSemana(semana) : 'Próxima semana';
  const v = $('fmVista');
  v.innerHTML = tab === 'semana' ? pintaSemana() : tab === 'banco' ? pintaBanco() : pintaSesiones();
}
$('fmVista').addEventListener('click', e => {
  const cat = e.target.closest('[data-cat]'); if (cat) { hojaReto(dataDir.categories.find(c => c.categoryId === cat.dataset.cat)); return; }
  const qu = e.target.closest('[data-quitar]'); if (qu) { quita(dataDir.categories.find(c => c.categoryId === qu.dataset.quitar)); return; }
  const de = e.target.closest('[data-descarta]'); if (de) { delete borrador[de.dataset.descarta]; pinta(); return; }
  if (e.target.closest('#fmRevisar')) { hojaRevisar(); return; }
  const hoy = e.target.closest('[data-hoy]'); if (hoy) { modoCancha(dataHoy.sessions.find(s => s.sessionId === hoy.dataset.hoy)); return; }
  const ses = e.target.closest('[data-ses]'); if (ses) { hojaSesion(dataMia.sessions.find(s => s.sessionId === ses.dataset.ses)); return; }
  if (e.target.closest('#fmTerminar')) { const p = dataMia.sessions.find(s => s.plan?.status !== 'ready'); if (p) hojaSesion(p); return; }
  if (e.target.closest('[data-practica]')) { practica(); return; }
  if (e.target.closest('[data-practica-cierra]')) { try { localStorage.setItem('tos:fm:practica', '1'); } catch {} pinta(); return; }
  const bn = e.target.closest('[data-banco]'); if (bn) { album.banco = bn.dataset.banco; album.mundo = ''; album.nivel = 0; pinta(); return; }
  const mu = e.target.closest('[data-mundo]'); if (mu) { album.mundo = mu.dataset.mundo; pinta(); return; }
  const ni = e.target.closest('[data-nivel]'); if (ni) { album.nivel = +ni.dataset.nivel; pinta(); return; }
  const ca = e.target.closest('[data-carta]'); if (ca) { hojaCarta(catalogo.tasks.find(t => t.id === ca.dataset.carta)); return; }
});
// Buscar sin perder el teclado: sólo se repinta la cuadrícula.
$('fmVista').addEventListener('input', e => { if (e.target.id !== 'fmBusca') return; album.busca = e.target.value; const g = $('fmAlbum'); if (g) g.innerHTML = gridAlbum(); });

async function carga() {
  try {
    const [mia, dir, hoy] = await Promise.all([
      rpc('v2_my_planning', { organization_id: org, week_start: semana }),
      esDireccion ? rpc('v2_direction_week', { organization_id: org, week_start: semana }) : Promise.resolve(null),
      rpc('v2_my_today', { organization_id: org }).catch(() => null)
    ]);
    dataMia = mia; dataDir = dir; dataHoy = hoy; tz = mia?.settings?.tz || tz; semana = mia?.weekStart || semana;
    const r = resumenSemana(mia?.sessions || []);
    setShellHealth(esDireccion
      ? { state: (dir?.categories || []).every(c => c.week?.status === 'published') ? 'ok' : 'attention', label: 'Semana Tanner' }
      : { state: r.completa || !r.total ? 'ok' : 'attention', label: r.total ? `${r.listas}/${r.total} listas` : 'Sin sesiones' });
    pinta();
  } catch (e) { $('fmVista').innerHTML = `<p class="fm-vacio">No se pudo cargar: ${esc(errorDe(e))}</p>`; setShellHealth({ state: 'attention', label: 'Sin conexión' }); }
}

catalogo = await rpc('v2_formation_catalog', { organization_id: org }).catch(() => ({ concepts: [], tasks: [] }));
await carga();
// Si todas sus sesiones son de Baby, el Álbum abre en Baby.
if ((dataMia?.sessions || []).length && dataMia.sessions.every(x => esBabyEtapa(x.stage))) album.banco = 'baby';
