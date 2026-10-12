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
import { recomienda, bloquesDeSesion, faltaParaLista, resumenSemana } from '/v2/formacion/motor.js';

const boot = await bootstrapProtectedShell({ active: 'formacion', title: 'Formación' });
if (!boot) throw new Error('No access');
const { ctx, navigation } = boot, org = ctx.organization_id;
const esDireccion = moduleAccess(navigation, 'formacion_direccion', true);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let catalogo = { concepts: [], tasks: [] }, semana = null, tab = esDireccion ? 'semana' : 'sesiones', tz = 'America/Mexico_City';
let dataDir = null, dataMia = null, dataHoy = null, borrador = {}, filtroBanco = '';

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

/* ---------- Dirección: Semana Tanner ---------- */
function pintaSemana() {
  const d = dataDir; if (!d) return '';
  const cats = d.categories || [];
  const filas = cats.map(c => {
    const w = borrador[c.categoryId] || c.week || null;
    const publicada = c.week?.status === 'published' && !borrador[c.categoryId];
    const plan = !c.sessions ? 'Sin sesiones' : !c.coachId ? 'Sin Formador' : c.ready >= c.sessions ? 'Lista' : `Pendiente ${c.sessions - c.ready}`;
    const estadoPlan = plan === 'Lista' ? 'ok' : plan.startsWith('Pendiente') ? 'pendiente' : 'gris';
    return `<button type="button" class="fm-cat" data-cat="${esc(c.categoryId)}">
      <span class="fm-cat-izq"><span class="fm-cat-nom">${esc(c.category)}</span>
        <span class="fm-cat-reto">${w?.primary ? `<b>${esc(nombreReto(w.primary))}${w.secondary ? ` · ${esc(nombreReto(w.secondary))}` : ''}</b>${w.behavior ? `<small>${esc(w.behavior)}</small>` : ''}` : `<em>Elegir ${c.usesChallenges ? 'Reto' : 'mundo'}</em>`}</span></span>
      <span class="fm-cat-der"><span class="fm-pill ${publicada ? 'ok' : w?.primary ? 'borrador' : 'gris'}">${publicada ? 'Publicada' : w?.primary ? 'Sin publicar' : 'Por elegir'}</span>
        <span class="fm-pill ${estadoPlan}" title="Planeación de los Formadores">${esc(plan)}</span></span></button>`;
  }).join('');
  const porPublicar = cats.filter(c => (borrador[c.categoryId] || c.week)?.primary && (borrador[c.categoryId] || c.week?.status !== 'published')).length;
  const faltan = cats.filter(c => !(borrador[c.categoryId] || c.week)?.primary).map(c => c.category);
  return `<section class="fm-hero"><span>SEMANA TANNER · ${esc(rangoSemana(d.weekStart))}</span>
      <h1>${faltan.length ? `Falta ${esc(faltan.join(', '))}` : porPublicar ? 'Lista para publicar' : 'Semana publicada'}</h1>
      <p>Publica a más tardar el ${esc(fecha(d.publishBy, { weekday: 'long', day: 'numeric', month: 'short' }))} a las ${esc(hora(d.publishBy))}. Los Formadores cierran su planeación el ${esc(fecha(d.deadline, { weekday: 'long' }))} a las ${esc(hora(d.deadline))}.</p></section>
    ${cats.length ? `<div class="fm-lista">${filas}</div>` : '<p class="fm-vacio">Ninguna categoría tiene horario esa semana.</p>'}
    <div class="fm-acciones"><button type="button" id="fmPublicar" class="primary"${porPublicar ? '' : ' disabled'}>Publicar semana${porPublicar ? ` (${porPublicar})` : ''}</button></div>`;
}

function hojaReto(c) {
  const w = borrador[c.categoryId] || c.week || {};
  const kind = c.usesChallenges ? 'reto' : 'mundo_baby';
  const opciones = catalogo.concepts.filter(x => x.kind === kind);
  abreHoja(`${c.category} · ${rangoSemana(dataDir.weekStart)}`, `
    <p class="fm-ayuda">${c.usesChallenges ? 'El Reto vive toda la semana. Tú decides el QUÉ; el Formador, el CÓMO.' : 'Baby no usa los 9 Retos: elige su mundo de la semana.'}</p>
    <div class="fm-grid-retos" role="radiogroup">${opciones.map(o => `<button type="button" role="radio" data-reto="${esc(o.code)}" aria-checked="${w.primary === o.code}" class="${w.primary === o.code ? 'activa' : ''}"><b>${esc(o.name)}</b><small>${esc(o.question || o.phrase || '')}</small></button>`).join('')}</div>
    ${c.usesChallenges ? `<label class="fm-campo">Reto secundario (opcional)<select id="fmSec"><option value="">Ninguno</option>${opciones.map(o => `<option value="${esc(o.code)}"${w.secondary === o.code ? ' selected' : ''}>${esc(o.name)}</option>`).join('')}</select></label>` : ''}
    <label class="fm-campo">Esta semana queremos que aparezca…<input id="fmConducta" maxlength="140" value="${esc(w.behavior || '')}" placeholder="${c.usesChallenges ? 'Que se atrevan a encarar cuando hay espacio' : 'Que frenen sin caerse'}"></label>`,
    `<button type="button" class="primary" id="fmGuardaReto">Listo</button>`);
  let elegido = w.primary || '';
  $('fmHojaCuerpo').querySelector('.fm-grid-retos').addEventListener('click', e => {
    const b = e.target.closest('[data-reto]'); if (!b) return; elegido = b.dataset.reto;
    $('fmHojaCuerpo').querySelectorAll('[data-reto]').forEach(x => { const on = x === b; x.classList.toggle('activa', on); x.setAttribute('aria-checked', on); });
  });
  $('fmGuardaReto').addEventListener('click', () => {
    if (!elegido) { aviso('Elige el Reto', 'error'); return; }
    const sec = $('fmSec')?.value || null;
    if (sec && sec === elegido) { aviso('El secundario no puede ser el mismo Reto', 'error'); return; }
    borrador[c.categoryId] = { primary: elegido, secondary: sec, behavior: $('fmConducta').value.trim() };
    cierraHoja(); pinta();
  });
}

async function publica() {
  const cats = (dataDir?.categories || []).filter(c => (borrador[c.categoryId] || c.week)?.primary);
  const weeks = cats.map(c => { const w = borrador[c.categoryId] || c.week; return { categoryId: c.categoryId, weekStart: dataDir.weekStart, primary: w.primary, secondary: w.secondary || '', behavior: w.behavior || '' }; });
  if (!weeks.length) return;
  const b = $('fmPublicar'); b.disabled = true; b.textContent = 'Publicando…';
  try { await rpc('v2_save_training_weeks', { organization_id: org, weeks, publish: true }); borrador = {}; aviso('Semana publicada: los Formadores ya la ven'); await carga(); }
  catch (e) { aviso(errorDe(e), 'error'); b.disabled = false; b.textContent = 'Publicar semana'; }
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
    ${ses.length ? `<div class="fm-lista">${tarjetas}</div>` : `<p class="fm-vacio">${esDireccion ? 'No hay sesiones de esa semana.' : 'No tienes sesiones asignadas esa semana. Si deberías tenerlas, avísale a Dirección.'}</p>`}`;
}

function hojaSesion(s) {
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
        ${b.principal && (it.taskId || it.text) ? `<div class="fm-toggles"><span role="group" aria-label="Dificultad">${['facil', 'base', 'dificil'].map(x => `<button type="button" data-dif="${i}" data-v="${x}" class="${it.difficulty === x ? 'activa' : ''}">${{ facil: 'Más fácil', base: 'Base', dificil: 'Más difícil' }[x]}</button>`).join('')}</span>
          <span role="group" aria-label="Espacio">${['completo', 'reducido'].map(x => `<button type="button" data-esp="${i}" data-v="${x}" class="${it.space === x ? 'activa' : ''}">${x === 'completo' ? 'Completo' : 'Reducido'}</button>`).join('')}</span></div>` : ''}
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
        ${p.t ? `<div class="fm-tarea-mas"><button type="button" data-ver="facil">Más fácil</button><button type="button" data-ver="dificil">Más difícil</button></div>
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

/* ---------- Banco ---------- */
function pintaBanco() {
  const grupos = [...catalogo.concepts.filter(c => c.kind === 'reto'), ...catalogo.concepts.filter(c => c.kind === 'mundo_baby').map(c => ({ ...c, baby: true }))];
  const lista = catalogo.tasks.filter(t => !filtroBanco || `${t.bank}:${t.primary}` === filtroBanco);
  return `<nav class="fm-chips"><button type="button" data-filtro=""${!filtroBanco ? ' class="activa"' : ''}>Todo</button>${grupos.map(g => {
      const k = `${g.baby ? 'baby' : 'tanner'}:${g.code}`;
      return `<button type="button" data-filtro="${esc(k)}"${filtroBanco === k ? ' class="activa"' : ''}>${g.baby ? 'Baby · ' : ''}${esc(g.name)}</button>`;
    }).join('')}</nav>
    <div class="fm-banco">${lista.map(t => `<article class="fm-tarea" data-tarea="${esc(t.id)}">
      <header><span>${t.bank === 'baby' ? 'BABY · ' : ''}${esc(nombreReto(t.primary))}${t.level ? ' · ' + esc(concepto('nivel', t.level)?.name || '') : ''}</span><h3>${esc(t.name)}</h3></header>
      <dl><dt>Buscamos</dt><dd>${esc(t.buscamos)}</dd><dt>Juega</dt><dd>${esc(t.juega)}</dd>
      <dt>Dile</dt><dd>${(t.dile || []).map(f => `“${esc(f)}”`).join(' ')}</dd><dt>Observa</dt><dd>${esc(t.observa)}</dd></dl>
      <div class="fm-tarea-mas"><button type="button" data-ver="facil">Más fácil</button><button type="button" data-ver="dificil">Más difícil</button><button type="button" data-ver="detalle">Detalles</button></div>
      <p class="fm-tarea-extra hidden" data-extra="facil">${esc(t.easier || '')}</p>
      <p class="fm-tarea-extra hidden" data-extra="dificil">${esc(t.harder || '')}</p>
      <div class="fm-tarea-extra hidden" data-extra="detalle">${t.montaje ? `<p><b>Montaje:</b> ${esc(t.montaje)}</p>` : ''}${t.space ? `<p><b>Espacio:</b> ${esc(t.space)}</p>` : ''}${t.adapta ? `<p><b>Adapta:</b> ${esc(t.adapta)}</p>` : ''}${t.videoGuide ? `<p><b>Video:</b> ${esc(t.videoGuide)}</p>` : ''}</div>
    </article>`).join('')}</div>`;
}

/* ---------- Hoja inferior ---------- */
function abreHoja(titulo, cuerpo, pie) { $('fmHojaTitulo').textContent = titulo; $('fmHojaCuerpo').innerHTML = cuerpo; $('fmHojaPie').innerHTML = pie || ''; $('fmHoja').classList.remove('hidden'); document.body.classList.add('fm-sin-scroll'); }
function cierraHoja() { clearInterval(reloj); try { wakeLock?.release(); } catch {} wakeLock = null; $('fmHoja').classList.remove('fm-cancha'); $('fmHoja').classList.add('hidden'); $('fmHojaCuerpo').onclick = null; document.body.classList.remove('fm-sin-scroll'); }
$('fmHoja').addEventListener('click', e => { if (e.target.id === 'fmHoja' || e.target.closest('[data-cerrar]')) cierraHoja(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') cierraHoja(); });

/* ---------- Pintar y cargar ---------- */
function pinta() {
  pintaTabs();
  $('fmSemana').textContent = semana ? rangoSemana(semana) : 'Próxima semana';
  const v = $('fmVista');
  v.innerHTML = tab === 'semana' ? pintaSemana() : tab === 'banco' ? pintaBanco() : pintaSesiones();
}
$('fmVista').addEventListener('click', e => {
  const cat = e.target.closest('[data-cat]'); if (cat) { hojaReto(dataDir.categories.find(c => c.categoryId === cat.dataset.cat)); return; }
  if (e.target.closest('#fmPublicar')) { publica(); return; }
  const hoy = e.target.closest('[data-hoy]'); if (hoy) { modoCancha(dataHoy.sessions.find(s => s.sessionId === hoy.dataset.hoy)); return; }
  const ses = e.target.closest('[data-ses]'); if (ses) { hojaSesion(dataMia.sessions.find(s => s.sessionId === ses.dataset.ses)); return; }
  if (e.target.closest('#fmTerminar')) { const p = dataMia.sessions.find(s => s.plan?.status !== 'ready'); if (p) hojaSesion(p); return; }
  const f = e.target.closest('[data-filtro]'); if (f) { filtroBanco = f.dataset.filtro; pinta(); return; }
  const ver = e.target.closest('[data-ver]'); if (ver) { ver.closest('.fm-tarea').querySelector(`[data-extra="${ver.dataset.ver}"]`).classList.toggle('hidden'); }
});

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
