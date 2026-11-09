/* PORTAL DE BECADOS (Presidencia, 09/10/2026).
 *
 * "Dónde puedo ver todos los que están becados... para ver todo ese pedo."
 * Lo ven Presidencia y quien tenga Dirección; nadie más (lo decide el
 * servidor: v2_can_see_scholarships y v2_scholarship_portal).
 *
 * Contesta cuatro preguntas: cuántos becados hay y de qué tipo, quién no
 * está viniendo (meta 90%), qué beca está por vencer y qué familias pidieron
 * beca. Cada becado abre su expediente con un botón para escribirle a la
 * familia (mensaje de atención, firmado por el club, sin mencionar la beca).
 *
 * El aviso mensual (día 1) lo manda la base: private.avisa_becas_del_mes.
 */
import { createClient } from '/v2/supabase-client.js';
import { nombreDelClub } from '/v2/club.js';
import { getSignedPhotoUrls } from '/v2/photo-cache.js';
import { ligaWhatsApp } from '/v2/pedido-mensajes.js';
import { mensajeDeFaltas, rangoDe, textoUltimaVez } from '/v2/asistencia/estadisticas.js';
import { META_BECA, tipoDe, cuantoCubre, cumplimiento, vencimiento, FILTROS, resumen, ordena } from '/v2/becas/becas.js';

const supabase = createClient('https://pacnegivzgxpanphrnwp.supabase.co', 'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',
  { auth: { persistSession: true, autoRefreshToken: true } });
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dinero = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const fecha = v => v ? new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${String(v).slice(0, 10)}T12:00:00`)).replace('.', '') : '—';
const pctTexto = v => (v === null || v === undefined) ? '—' : `${Math.round(Number(v))}%`;
const iniciales = n => String(n || '').split(/\s+/).slice(0, 2).map(x => x[0] || '').join('').toUpperCase() || 'TC';
const sinAcentos = v => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

let ctx = null, datos = null, periodo = 'mes', filtro = 'todos', busqueda = '';
const caras = new Map();

const PERIODOS = [{ clave: 'mes', etiqueta: 'Este mes' }, { clave: 'mesPasado', etiqueta: 'Mes pasado' }, { clave: 'trimestre', etiqueta: '3 meses' }];

function show(id) { ['loadingView', 'deniedView', 'view'].forEach(v => $(v)?.classList.toggle('hidden', v !== id)); }
async function rpc(name, params = {}) { const { data, error } = await supabase.rpc(name, params); if (error) throw error; return data; }
function msg(text = '', tipo = 'error') { const el = $('bcMensaje'); el.textContent = text; el.dataset.type = tipo; el.classList.toggle('hidden', !text); }

async function boot() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { location.href = '/'; return; }
  const rows = await rpc('v2_my_context');
  if (!rows?.length) { show('deniedView'); return; }
  ctx = rows[0];
  if (!(await rpc('v2_can_see_scholarships', { organization_id: ctx.organization_id }))) { show('deniedView'); return; }
  $('orgName').textContent = ctx.organization_name||'';
  $('roleBadge').textContent = ctx.is_owner ? 'Presidencia' : ctx.role;
  pintaPeriodos(); pintaFiltros();
  show('view');
  setModo(modo);
  await carga();
}

function pintaPeriodos() {
  $('bcPeriodos').innerHTML = PERIODOS.map(p => `<button type="button" data-p="${p.clave}" class="${p.clave === periodo ? 'activo' : ''}">${p.etiqueta}</button>`).join('');
  $('bcPeriodos').querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => { periodo = b.dataset.p; pintaPeriodos(); carga(); }));
}

function pintaFiltros() {
  const r = datos ? resumen(datos.rows) : null;
  const cuenta = { todos: r?.total, debajo: r?.debajo, vencen: r?.vencen, scholarship_full: r?.totales, scholarship_partial: r?.parciales, sponsor_funded: r?.patrocinio };
  $('bcFiltros').innerHTML = FILTROS.filter(f => !r || f.clave === 'todos' || cuenta[f.clave])
    .map(f => `<button type="button" data-f="${f.clave}" class="${f.clave === filtro ? 'activo' : ''}">${f.etiqueta}${r ? ` <b>${cuenta[f.clave] ?? 0}</b>` : ''}</button>`).join('');
  $('bcFiltros').querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => { filtro = b.dataset.f; pintaFiltros(); pintaLista(); }));
}

async function carga() {
  msg();
  const r = rangoDe(periodo);
  $('bcPeriodo').textContent = r.etiqueta;
  try {
    datos = await rpc('v2_scholarship_portal', { organization_id: ctx.organization_id, from_date: r.desde, to_date: r.hasta });
  } catch (e) {
    if (/Not authorized/.test(e?.message || '')) { show('deniedView'); return; }
    msg('No pudimos abrir el padrón de becas.'); return;
  }
  const s = resumen(datos.rows);
  $('mTotal').textContent = s.total;
  $('mPct').textContent = pctTexto(s.pct);
  $('mTipos').textContent = `${s.totales} · ${s.parciales}`;
  const foco = (n, titulo, nota, nivel, f) => `<button type="button" class="bc-foco bc-foco-${n ? nivel : 'ok'}" data-ir="${f}"><b>${n}</b><strong>${titulo}</strong><small>${nota}</small></button>`;
  const sol = (datos.requests || []).length;
  $('bcFocos').innerHTML =
    foco(s.debajo, 'Debajo de 90%', `de ${s.total} becados`, 'bajo', 'debajo') +
    foco(s.vencen, 'Por vencer', 'en los próximos 60 días', 'atencion', 'vencen') +
    foco(sol, 'Solicitudes', 'esperando respuesta', 'atencion', 'solicitudes') +
    foco(s.sinMotivo, 'Sin motivo escrito', 'por qué se dio la beca', 'atencion', 'todos');
  $('bcFocos').querySelectorAll('[data-ir]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.ir === 'solicitudes') { $('bcSolicitudes').scrollIntoView({ behavior: 'smooth' }); return; }
    filtro = b.dataset.ir; pintaFiltros(); pintaLista(); $('bcFiltros').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  pintaSolicitudes();
  pintaFiltros();
  pintaLista();
  firmaCaras();
}

function pintaSolicitudes() {
  const l = datos?.requests || [];
  $('bcSolicitudes').classList.toggle('hidden', !l.length);
  $('bcSolicitudesLista').innerHTML = l.map(r => `<a class="bc-sol" href="/jugadores/?player=${encodeURIComponent(r.playerId)}">
    <span><strong>${esc(r.name)}</strong><small>${esc(r.guardian || 'Familia')} · ${esc(fecha(r.requestedAt))}</small><em>${esc(r.reason || '')}</em></span><i aria-hidden="true">›</i></a>`).join('');
}

function cara(b) {
  const u = caras.get(b.playerId);
  return `<span class="bc-cara" data-cara="${esc(b.playerId)}">${u ? `<img src="${esc(u)}" alt="" loading="lazy">` : esc(iniciales(b.name))}</span>`;
}

function pintaLista() {
  const f = FILTROS.find(x => x.clave === filtro) || FILTROS[0];
  const filas = ordena((datos?.rows || []).filter(b => f.pasa(b) && (!busqueda || sinAcentos(`${b.name} ${b.code || ''} ${b.categoryName || ''}`).includes(busqueda))));
  $('bcVacio').classList.toggle('hidden', filas.length > 0);
  $('bcLista').innerHTML = filas.map(b => {
    const c = cumplimiento(b.pct), v = vencimiento(b.daysLeft), t = tipoDe(b.type), cu = cuantoCubre(b);
    const ancho = b.pct === null || b.pct === undefined ? 0 : Math.max(3, Math.min(100, Number(b.pct)));
    return `<button type="button" class="bc-fila bc-${c.nivel}" data-id="${esc(b.playerId)}">
      ${cara(b)}
      <span class="bc-fila-txt">
        <strong>${esc(b.name)}</strong>
        <span class="bc-etq"><i class="bc-tipo bc-tipo-${esc(b.type)}">${esc(t.corta)}${cu ? ` · ${esc(cu)}` : ''}</i>${b.categoryName ? `<small>${esc(b.categoryName)}</small>` : ''}</span>
        <span class="bc-barra" aria-hidden="true"><i style="width:${ancho}%"></i><em></em></span>
        <small class="bc-venc bc-venc-${v.nivel}">${esc(v.texto)}</small>
      </span>
      <span class="bc-pct"><b>${esc(pctTexto(b.pct))}</b><small>${esc(c.texto)}</small></span>
    </button>`;
  }).join('');
  $('bcLista').querySelectorAll('[data-id]').forEach(x => x.addEventListener('click', () => abreFicha(x.dataset.id)));
}

// Sólo miniaturas, por el caché compartido.
async function firmaCaras() {
  const porBucket = {};
  (datos?.rows || []).forEach(b => { if (b.thumb && !caras.has(b.playerId)) (porBucket[b.bucket || 'tanneros-private'] ??= []).push(b); });
  try {
    for (const k of Object.keys(porBucket)) {
      const mapa = await getSignedPhotoUrls(supabase, k, porBucket[k].map(b => b.thumb));
      porBucket[k].forEach(b => { if (mapa[b.thumb]) caras.set(b.playerId, mapa[b.thumb]); });
    }
    document.querySelectorAll('[data-cara]').forEach(el => { const u = caras.get(el.dataset.cara); if (u) el.innerHTML = `<img src="${esc(u)}" alt="" loading="lazy">`; });
  } catch { /* quedan las iniciales */ }
}

let fichaActual = null;
function abreFicha(id) {
  const b = (datos?.rows || []).find(x => x.playerId === id);
  if (!b) return;
  fichaActual = b;
  const c = cumplimiento(b.pct), v = vencimiento(b.daysLeft), t = tipoDe(b.type), cu = cuantoCubre(b);
  const liga = ligaWhatsApp(b.phone, mensajeDeFaltas({ tanner: b.name, tutor: b.guardianName, categoria: b.categoryName,
    faltas: b.streak, pct: b.pct, asistio: b.attended, marcadas: b.marked, club: ctx?.organization_name||'el club' }));
  const dato = (k, val, extra = '') => `<div class="bc-dato${extra}"><span>${k}</span><b>${val}</b></div>`;
  $('bcHoja').innerHTML = `
    <div class="bc-hoja-quien">${cara(b)}<div><h2 id="bcHojaNombre">${esc(b.name)}</h2><p>${esc([b.code, b.categoryName].filter(Boolean).join(' · '))}</p></div></div>
    <div class="bc-hoja-pct bc-${c.nivel}">
      <div><b>${esc(pctTexto(b.pct))}</b><span>de asistencia · meta ${META_BECA}%</span></div>
      <small>${b.marked ? `Vino a ${Number(b.attended)} de ${Number(b.marked)} entrenamientos` : 'Sin listas en este periodo'}${Number(b.streak) >= 2 ? ` · ${Number(b.streak)} faltas seguidas` : ''} · ${esc(textoUltimaVez(b.lastSeen))}</small>
    </div>
    <div class="bc-datos">
      ${dato('Tipo', esc(t.etiqueta))}
      ${dato('Cubre', cu ? esc(cu) : '<i class="bc-falta">Falta anotar</i>')}
      ${dato('Cuota que paga', b.monthlyFee !== null && b.monthlyFee !== undefined ? esc(dinero.format(Number(b.monthlyFee))) : '—')}
      ${dato('Lo cubre', esc(b.fundingSource || 'El club'))}
      ${dato('Desde', esc(fecha(b.startsOn)))}
      ${dato('Hasta', `${esc(fecha(b.endsOn))}<small class="bc-venc bc-venc-${v.nivel}">${esc(v.texto)}</small>`)}
      ${dato('Motivo', b.notes ? esc(b.notes) : '<i class="bc-falta">Sin motivo escrito</i>', ' bc-dato-ancho')}
    </div>
    <div class="bc-acciones">
      ${liga ? `<a class="bc-familia" href="${esc(liga)}" target="_blank" rel="noopener">Escribir a la familia${b.guardianName ? ` · ${esc(String(b.guardianName).split(/\s+/)[0])}` : ''}</a>` : '<p class="bc-sin-tel">La familia no tiene teléfono registrado.</p>'}
      <a class="secondary bc-expediente" href="/jugadores/?player=${encodeURIComponent(b.playerId)}">Ver expediente y editar beca</a>
    </div>
    <div class="bc-cuidado">
      <div class="bc-cuidado-cab"><span class="sol-tit">Cuidado del beneficio</span>${b.warningsCount ? `<span class="sol-pastilla sol-pastilla-atencion">${b.warningsCount} advertencia${b.warningsCount === 1 ? '' : 's'}</span>` : ''}</div>
      <div id="bcAdvertenciasLista" class="sol-timeline">Cargando…</div>
      <div id="bcHojaMsg" class="inline-message hidden"></div>
      <div class="bc-acciones">
        <button type="button" class="secondary" data-abre-advertencia>+ Advertencia</button>
        ${ctx.is_owner ? '<button type="button" class="danger" data-abre-suspender>Suspender / cancelar beca</button>' : ''}
      </div>
      <form id="formAdvertencia" class="sol-form hidden">
        <label>Causa<select name="cause" required>${Object.entries(CAUSAS).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label>
        <label>Nota <span class="sol-opt">· opcional</span><textarea name="note" rows="2"></textarea></label>
        <button type="submit" class="primary">Registrar advertencia</button>
      </form>
      ${ctx.is_owner ? `<form id="formSuspender" class="sol-form hidden">
        <label>Causa<select name="cause" required>${Object.entries(CAUSAS).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label>
        <label>Motivo <span class="sol-opt">· mínimo 10 caracteres, queda en el expediente interno</span><textarea name="reason" rows="3" required minlength="10"></textarea></label>
        <button type="submit" class="danger">Confirmar suspensión/cancelación</button>
      </form>` : ''}
    </div>`;
  $('bcFondo').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  cargaAdvertencias(b.benefitId);
}
function cierraFicha() { $('bcFondo').classList.add('hidden'); document.body.style.overflow = ''; fichaActual = null; }

async function cargaAdvertencias(benefitId) {
  const box = $('bcAdvertenciasLista'); if (!box) return;
  try {
    const lista = await rpc('v2_scholarship_benefit_warnings', { organization_id: ctx.organization_id, benefit_id: benefitId }) || [];
    box.innerHTML = lista.length ? lista.map(w => `<li><b>${esc(CAUSAS[w.cause] || w.cause)}</b><small>${esc(fecha(w.createdAt))}</small>${w.note ? `<span>${esc(w.note)}</span>` : ''}</li>`).join('')
      : '<p class="bc-vacio">Sin advertencias.</p>';
  } catch { box.innerHTML = '<p class="bc-vacio">No se pudo cargar.</p>'; }
}

function exportaCsv() {
  const filas = ordena(datos?.rows || []);
  const head = ['Tanner', 'Código', 'Categoría', 'Tipo', 'Cubre', 'Cuota que paga', 'Lo cubre', 'Desde', 'Hasta', 'Asistencia %', 'Vino', 'Listas', 'Faltas seguidas', 'Motivo'];
  const rows = filas.map(b => [b.name, b.code || '', b.categoryName || '', tipoDe(b.type).etiqueta, cuantoCubre(b) || '', b.monthlyFee ?? '',
    b.fundingSource || 'El club', b.startsOn || '', b.endsOn || '', b.pct ?? '', b.attended, b.marked, b.streak, b.notes || '']);
  const celda = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = '﻿' + [head, ...rows].map(r => r.map(celda).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a'); a.href = url; a.download = `becados-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// =====================================================================
// SOLICITUDES · BECAS TANNERY CITY (04/11/2026). Pipeline de las 7
// modalidades: nominar/solicitar → revisión → comité → Presidencia dictamina.
// Vive en la misma pantalla ("un solo lugar para darle seguimiento") pero en
// su propia pestaña: nunca se mezcla con el padrón de ya-becados de arriba.
// =====================================================================
const MODALIDADES = { ingreso: 'Apoyo de Ingreso', apoyo_familiar: 'Beca de Apoyo Familiar', academica: 'Beca Académica',
  deportiva: 'Beca Deportiva', tanner: 'Beca Tanner', lealtad: 'Beca Lealtad Tanner', curtibrother: 'Curtibrother' };
// Causas de advertencia/suspensión (sección 8 del protocolo): mismas en el
// beneficio activo (becados) y al cancelarlo.
const CAUSAS = { falsedad_informacion: 'Falsedad de información', ausentismo: 'Ausentismo', indisciplina_grave: 'Indisciplina grave',
  incumplimiento_reiterado: 'Incumplimiento reiterado', baja_club: 'Baja del club', otro: 'Otro' };
const ESTADOS = { borrador: 'Borrador', pendiente_pago: 'Pendiente de pago', pago_recibido: 'Pago recibido', enviada: 'Enviada',
  en_revision_administrativa: 'En revisión', info_pendiente: 'Falta información', en_evaluacion: 'En evaluación',
  comite: 'En comité', presidencia: 'Con Presidencia', aprobada: 'Aprobada', no_aprobada: 'No aprobada', retirada: 'Retirada' };
const ESTADO_NIVEL = { aprobada: 'ok', no_aprobada: 'bajo', retirada: 'sindato', pendiente_pago: 'atencion', info_pendiente: 'atencion', presidencia: 'atencion' };
const ESTADOS_ABIERTOS = new Set(['borrador', 'pendiente_pago', 'pago_recibido', 'enviada', 'en_revision_administrativa', 'info_pendiente', 'en_evaluacion', 'comite', 'presidencia']);
const COBERTURAS = [['mensualidad', 'Mensualidad'], ['inscripcion', 'Inscripción'], ['academia', 'Academia'], ['uniforme', 'Uniforme'], ['arbitraje', 'Arbitraje']];
const EVENTO_TXT = { ScholarshipApplicationCreated: 'Solicitud enviada', ScholarshipNominated: 'Nominación creada',
  ScholarshipApplicationAdvanced: 'Cambio de etapa', ScholarshipFeePaid: 'Cuota pagada', ScholarshipFeeWaived: 'Cuota exentada',
  ScholarshipApproved: 'Aprobada', ScholarshipRejected: 'No aprobada', ScholarshipBenefitSuspended: 'Beca suspendida/cancelada' };
// Siguiente(s) paso(s) desde cada etapa. "nota" = pide un texto antes de avanzar.
const AVANCE = {
  enviada: [{ to: 'en_revision_administrativa', texto: 'Mover a revisión' }],
  en_revision_administrativa: [{ to: 'en_evaluacion', texto: 'Pasar a evaluación' }, { to: 'info_pendiente', texto: 'Pedir información', nota: true }],
  info_pendiente: [{ to: 'en_revision_administrativa', texto: 'Ya respondió: volver a revisión' }],
  en_evaluacion: [{ to: 'comite', texto: 'Enviar a comité', nota: true }],
  comite: [{ to: 'presidencia', texto: 'Enviar a Presidencia', nota: true }],
};
const SOL_FILTROS = [
  { clave: 'atender', etiqueta: 'Por atender', pasa: s => ESTADOS_ABIERTOS.has(s.status) },
  { clave: 'aprobada', etiqueta: 'Aprobadas', pasa: s => s.status === 'aprobada' },
  { clave: 'cerrada', etiqueta: 'No aprobadas / retiradas', pasa: s => s.status === 'no_aprobada' || s.status === 'retirada' },
  { clave: 'todas', etiqueta: 'Todas', pasa: () => true },
];
const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fechaHora = v => v ? new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(v)) : '—';
const primerNombreSol = n => String(n || '').trim().split(/\s+/)[0] || '';
// El protocolo pide notificar el resultado por WhatsApp en cada una de las 7
// modalidades (paso 6 de cada ruta): un toque con el mensaje ya armado.
function mensajeResultadoSol(d) {
  const club = nombreDelClub(ctx), nombre = primerNombreSol(d.playerName) || 'tu Tanner';
  const modalidad = MODALIDADES[d.modality] || 'beca';
  if (d.status === 'aprobada') {
    const cubre = (d.decidedCovers || []).map(c => (COBERTURAS.find(x => x[0] === c) || [null, c])[1]).join(', ');
    return `Hola, le escribimos de ${club} sobre la solicitud de ${modalidad} de ${nombre}.\n\n¡Buenas noticias! Se aprobó: ${pctTexto(d.decidedPercentage)}, a partir del ${fecha(d.decidedStartsOn)}${cubre ? ` (cubre ${cubre})` : ''}.\n\nCualquier duda, quedamos al pendiente.`;
  }
  return `Hola, le escribimos de ${club} sobre la solicitud de ${modalidad} de ${nombre}.\n\nPor ahora no fue posible otorgar este apoyo. Si quiere platicarlo, con gusto le explicamos a detalle.`;
}

let modo = (() => { try { const m = localStorage.getItem('becasModo'); return m === 'solicitudes' || m === 'publicas' ? m : 'becados'; } catch { return 'becados'; } })();
let solicitudes = [], solEstado = 'atender', solBusqueda = '', solCargado = false, solActualId = null, ajustes = null, todosJugadores = null, fondo = null;
let publicas = [], pubEstado = 'nueva', pubBusqueda = '', pubCargado = false, pubActualId = null;

function setModo(m) {
  modo = m === 'solicitudes' ? 'solicitudes' : m === 'publicas' ? 'publicas' : 'becados';
  try { localStorage.setItem('becasModo', modo); } catch { /* sin almacenamiento: no pasa nada */ }
  document.querySelectorAll('.bc-modo-btn').forEach(b => { const on = b.dataset.modo === modo; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); });
  $('bcTabBecados').classList.toggle('hidden', modo !== 'becados');
  $('bcTabSolicitudes').classList.toggle('hidden', modo !== 'solicitudes');
  $('bcTabPublicas').classList.toggle('hidden', modo !== 'publicas');
  if (modo === 'solicitudes' && !solCargado) cargaSolicitudes();
  if (modo === 'publicas' && !pubCargado) cargaPublicas();
}

async function cargaSolicitudes() {
  try {
    solicitudes = await rpc('v2_scholarship_applications', { organization_id: ctx.organization_id, status_filter: null }) || [];
    solCargado = true;
  } catch { msg(`No pudimos abrir las solicitudes de Becas ${nombreDelClub(ctx)}.`); return; }
  if (ctx.is_owner && !ajustes) { try { ajustes = await rpc('v2_scholarship_settings_get', { organization_id: ctx.organization_id }); } catch { ajustes = null; } }
  try { fondo = await rpc('v2_scholarship_internal_fund', { organization_id: ctx.organization_id }); } catch { fondo = null; }
  $('solAjustesBtn').classList.toggle('hidden', !ctx.is_owner);
  $('solNominarBtn').classList.remove('hidden');
  pintaSolMarcador(); pintaSolEstados(); pintaSolLista(); pintaFondo();
}

// Fondo interno (sección 7): techo en % del ingreso proyectado por
// mensualidades (precio de lista por categoría), sólo para becas que paga
// el club mismo — Curtibrother/patrocinio no cuenta aquí.
function pintaFondo() {
  const box = $('fondoInterno'); if (!box) return;
  if (!fondo) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  const pct = Number(fondo.usedPct) || 0, sobre = Number(fondo.used) > Number(fondo.capAmount);
  $('fondoBarraFill').style.width = `${Math.max(2, Math.min(100, pct))}%`;
  $('fondoBarraFill').classList.toggle('fondo-sobre', sobre);
  $('fondoSub').textContent = `${esc(fondo.capPct)}% del ingreso proyectado`;
  $('fondoTexto').innerHTML = `<b>${esc(dinero.format(Number(fondo.used)))}</b> de <b>${esc(dinero.format(Number(fondo.capAmount)))}</b> disponibles para becas internas · ${esc(pct)}%${sobre ? ' <strong class="fondo-aviso">· por encima del tope</strong>' : ''}`;
}

function pintaSolMarcador() {
  $('solTotal').textContent = solicitudes.filter(s => ESTADOS_ABIERTOS.has(s.status)).length;
  $('solPresidencia').textContent = solicitudes.filter(s => s.status === 'presidencia').length;
  $('solAprobadas').textContent = solicitudes.filter(s => s.status === 'aprobada').length;
  const porAtender = solicitudes.filter(s => ESTADOS_ABIERTOS.has(s.status)).length;
  $('bcSolBadge').textContent = porAtender;
  $('bcSolBadge').classList.toggle('hidden', !porAtender);
}

function pintaSolEstados() {
  $('solEstados').innerHTML = SOL_FILTROS.map(f => `<button type="button" data-f="${f.clave}" class="${f.clave === solEstado ? 'activo' : ''}">${f.etiqueta} <b>${solicitudes.filter(f.pasa).length}</b></button>`).join('');
  $('solEstados').querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => { solEstado = b.dataset.f; pintaSolEstados(); pintaSolLista(); }));
}

function pintaSolLista() {
  const f = SOL_FILTROS.find(x => x.clave === solEstado) || SOL_FILTROS[0];
  const filas = solicitudes.filter(f.pasa).filter(s => !solBusqueda || sinAcentos(s.playerName).includes(solBusqueda))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  $('solVacio').classList.toggle('hidden', filas.length > 0);
  $('solLista').innerHTML = filas.map(s => {
    const nivel = ESTADO_NIVEL[s.status] || '';
    return `<button type="button" class="bc-fila${nivel ? ` bc-${nivel}` : ''}" data-id="${esc(s.id)}">
      <span class="bc-cara">${esc(iniciales(s.playerName))}</span>
      <span class="bc-fila-txt">
        <strong>${esc(s.playerName)}</strong>
        <span class="bc-etq"><i class="bc-tipo">${esc(MODALIDADES[s.modality] || s.modality)}</i>${s.category ? `<small>${esc(s.category)}</small>` : ''}</span>
        <small class="bc-venc">${esc(fecha(s.createdAt))}${s.feeStatus === 'pending' ? ' · cuota pendiente' : ''}</small>
      </span>
      <span class="sol-pastilla sol-pastilla-${nivel || 'base'}">${esc(ESTADOS[s.status] || s.status)}</span>
    </button>`;
  }).join('');
  $('solLista').querySelectorAll('[data-id]').forEach(x => x.addEventListener('click', () => abreSolicitud(x.dataset.id)));
}

function solMsg(t) { const m = $('solHojaMsg'); if (!m) return; m.textContent = t || ''; m.classList.toggle('hidden', !t); }

async function abreSolicitud(id) {
  solActualId = id;
  $('solHoja').innerHTML = '<p class="bc-vacio">Abriendo…</p>';
  $('solFondo').classList.remove('hidden'); document.body.style.overflow = 'hidden';
  try { pintaSolHoja(await rpc('v2_scholarship_application_detail', { organization_id: ctx.organization_id, id })); }
  catch (e) { $('solHoja').innerHTML = `<p class="bc-vacio">${esc(e.message || 'No se pudo abrir.')}</p>`; }
}
function cierraSolicitud() { $('solFondo').classList.add('hidden'); document.body.style.overflow = ''; solActualId = null; }

function dictamenHtml() {
  const min = ajustes?.minPercentage ?? 10;
  const fondoNota = fondo ? `<p class="sol-opt fondo-nota">Fondo interno: ${esc(dinero.format(Number(fondo.used)))} de ${esc(dinero.format(Number(fondo.capAmount)))} (${esc(fondo.usedPct)}%)${Number(fondo.used) > Number(fondo.capAmount) ? ' · ya está por encima del tope' : ''}</p>` : '';
  return `<div class="sol-dictamen">
    <span class="sol-tit">Dictamen de Presidencia</span>
    ${fondoNota}
    <div class="bc-acciones sol-dictamen-botones">
      <button type="button" class="primary" data-dictamen="aprobar">Aprobar</button>
      <button type="button" class="danger" data-dictamen="no_aprobar">No aprobar</button>
    </div>
    <form id="formAprobar" class="sol-form hidden">
      <label>Porcentaje que otorga ${esc(nombreDelClub(ctx))} <span class="sol-opt">· desde ${min}%</span><input type="number" name="percentage" min="${min}" max="100" step="1" required placeholder="${min}"></label>
      <div class="sol-dos">
        <label>Empieza<input type="date" name="starts_on" required value="${hoyISO()}"></label>
        <label>Duración (meses) <span class="sol-opt">· opcional</span><input type="number" name="duration_months" min="1" max="36"></label>
      </div>
      <label>Termina <span class="sol-opt">· opcional, vacío = indefinida</span><input type="date" name="ends_on"></label>
      <fieldset class="sol-cobertura"><legend>Cubre</legend>${COBERTURAS.map(([v, l]) => `<label class="sol-check"><input type="checkbox" name="covers" value="${v}"> ${esc(l)}</label>`).join('')}</fieldset>
      <label>Nota <span class="sol-opt">· opcional, queda en el expediente interno</span><textarea name="note" rows="2"></textarea></label>
      <button type="submit" class="primary">Confirmar aprobación</button>
    </form>
    <form id="formNoAprobar" class="sol-form hidden">
      <label>Motivo <span class="sol-opt">· queda en el expediente interno, la familia no lo ve</span><textarea name="note" rows="3" required minlength="5"></textarea></label>
      <button type="submit" class="danger">Confirmar que no se aprueba</button>
    </form>
  </div>`;
}

function pintaSolHoja(d) {
  const abierta = ESTADOS_ABIERTOS.has(d.status);
  const avances = AVANCE[d.status] || [];
  const avanceHtml = avances.map(a => a.nota
    ? `<div class="sol-avance-nota"><button type="button" class="secondary" data-abre-nota="${esc(a.to)}">${esc(a.texto)}</button>
        <form class="sol-form hidden" data-avanza-form="${esc(a.to)}"><textarea name="note" rows="2" required minlength="5" placeholder="Explica brevemente…"></textarea><button type="submit" class="primary mini">Confirmar</button></form></div>`
    : `<button type="button" class="secondary" data-avanza="${esc(a.to)}">${esc(a.texto)}</button>`).join('');
  const cuotaHtml = d.status === 'pendiente_pago' ? `<div class="sol-cuota">
      <p>Cuota de evaluación: <b>${esc(dinero.format(Number(d.feeAmount || 0)))}</b> <span class="sol-pastilla sol-pastilla-atencion">Pendiente</span></p>
      <div class="bc-acciones">
        <button type="button" class="primary" data-pagar-cuota>Marcar pagada</button>
        ${ctx.is_owner ? '<button type="button" class="secondary" data-exentar-cuota>Exentar · Presidencia</button>' : ''}
      </div>
      <form id="formExentar" class="sol-form hidden"><textarea name="reason" rows="2" required minlength="10" placeholder="Motivo de la excepción (mínimo 10 caracteres)…"></textarea><button type="submit" class="danger">Confirmar excepción</button></form>
    </div>` : '';
  $('solHoja').innerHTML = `
    <div id="solHojaMsg" class="inline-message hidden"></div>
    <div class="bc-hoja-quien"><span class="bc-cara">${esc(iniciales(d.playerName))}</span><div><h2 id="solHojaNombre">${esc(d.playerName)}</h2><p>${esc(MODALIDADES[d.modality] || d.modality)}${d.category ? ` · ${esc(d.category)}` : ''}</p></div></div>
    <div class="sol-pastilla-grande sol-pastilla-${ESTADO_NIVEL[d.status] || 'base'}">${esc(ESTADOS[d.status] || d.status)}</div>
    <div class="bc-datos">
      <div class="bc-dato"><span>Pedida por</span><b>${d.origin === 'family_request' ? 'La familia' : 'El club (nominación)'}</b></div>
      <div class="bc-dato"><span>Desde</span><b>${esc(fecha(d.createdAt))}</b></div>
      ${d.reason ? `<div class="bc-dato bc-dato-ancho"><span>Motivo</span><b>${esc(d.reason)}</b></div>` : ''}
      ${d.evidenceNote ? `<div class="bc-dato bc-dato-ancho"><span>Evidencia / nota</span><b>${esc(d.evidenceNote)}</b></div>` : ''}
      ${d.infoRequestedNote && d.status === 'info_pendiente' ? `<div class="bc-dato bc-dato-ancho"><span>Qué se pidió</span><b>${esc(d.infoRequestedNote)}</b></div>` : ''}
      ${d.committeeNote ? `<div class="bc-dato bc-dato-ancho"><span>Nota de comité</span><b>${esc(d.committeeNote)}</b></div>` : ''}
      ${d.status === 'aprobada' ? `
        <div class="bc-dato"><span>Porcentaje otorgado</span><b>${esc(pctTexto(d.decidedPercentage))}</b></div>
        <div class="bc-dato"><span>Vigencia</span><b>${esc(fecha(d.decidedStartsOn))} — ${d.decidedEndsOn ? esc(fecha(d.decidedEndsOn)) : 'indefinida'}</b></div>
        ${d.decidedCovers?.length ? `<div class="bc-dato bc-dato-ancho"><span>Cubre</span><b>${d.decidedCovers.map(c => esc((COBERTURAS.find(x => x[0] === c) || [null, c])[1])).join(', ')}</b></div>` : ''}` : ''}
      ${d.status === 'no_aprobada' && d.decisionNote ? `<div class="bc-dato bc-dato-ancho"><span>Motivo</span><b>${esc(d.decisionNote)}</b></div>` : ''}
    </div>
    ${cuotaHtml}
    ${avances.length ? `<div class="bc-acciones sol-avances">${avanceHtml}</div>` : ''}
    ${d.status === 'presidencia' ? (ctx.is_owner ? dictamenHtml() : '<p class="bc-vacio">Esperando dictamen de Presidencia.</p>') : ''}
    ${(d.status === 'aprobada' || d.status === 'no_aprobada') ? (ligaWhatsApp(d.guardianPhone, '') ? `<a class="bc-familia" href="${esc(ligaWhatsApp(d.guardianPhone, mensajeResultadoSol(d)))}" target="_blank" rel="noopener">Notificar resultado por WhatsApp</a>` : '<p class="sol-opt">La familia no tiene teléfono registrado para notificar por WhatsApp.</p>') : ''}
    ${abierta ? '<button type="button" class="sol-link sol-retirar" data-retirar>Retirar esta solicitud</button>' : ''}
    ${(d.events || []).length ? `<div class="bc-dato-ancho"><span class="sol-tit">Seguimiento</span><ul class="sol-timeline">${d.events.map(ev => `<li><b>${esc(EVENTO_TXT[ev.type] || ev.type)}</b><small>${esc(fechaHora(ev.occurredAt))}</small></li>`).join('')}</ul></div>` : ''}`;
}

async function recargaSolActual() {
  const id = solActualId;
  solicitudes = await rpc('v2_scholarship_applications', { organization_id: ctx.organization_id, status_filter: null }) || [];
  try { fondo = await rpc('v2_scholarship_internal_fund', { organization_id: ctx.organization_id }); } catch { /* se queda el valor anterior */ }
  pintaSolMarcador(); pintaSolEstados(); pintaSolLista(); pintaFondo();
  if (id) pintaSolHoja(await rpc('v2_scholarship_application_detail', { organization_id: ctx.organization_id, id }));
}
async function avanzar(nuevoEstado, nota) {
  if (!solActualId) return;
  try { await rpc('v2_scholarship_application_advance', { organization_id: ctx.organization_id, id: solActualId, new_status: nuevoEstado, note: nota || null }); await recargaSolActual(); }
  catch (e) { solMsg(e.message || 'No se pudo mover de etapa.'); }
}
async function decidir(decision, form) {
  if (!solActualId) return;
  const fd = new FormData(form);
  const covers = [...form.querySelectorAll('[name="covers"]:checked')].map(c => c.value);
  try {
    const r = await rpc('v2_scholarship_application_decide', {
      organization_id: ctx.organization_id, id: solActualId, decision,
      percentage: decision === 'aprobada' ? Number(fd.get('percentage')) : null,
      duration_months: decision === 'aprobada' && fd.get('duration_months') ? Number(fd.get('duration_months')) : null,
      starts_on: decision === 'aprobada' ? fd.get('starts_on') : null,
      ends_on: decision === 'aprobada' && fd.get('ends_on') ? fd.get('ends_on') : null,
      covers: decision === 'aprobada' && covers.length ? covers : null,
      note: fd.get('note')?.trim() || null,
    });
    await recargaSolActual();
    if (r?.capExceeded) solMsg('Se registró, pero ya se pasó el tope de becas al 100% configurado en Ajustes.');
  } catch (e) { solMsg(e.message || 'No se pudo registrar el dictamen.'); }
}
async function marcarPagada() {
  if (!solActualId) return;
  try { await rpc('v2_scholarship_fee_mark_paid', { organization_id: ctx.organization_id, id: solActualId }); await recargaSolActual(); }
  catch (e) { solMsg(e.message || 'No se pudo marcar como pagada.'); }
}
async function exentarCuota(motivo) {
  if (!solActualId) return;
  try { await rpc('v2_scholarship_fee_waive', { organization_id: ctx.organization_id, id: solActualId, reason: motivo }); await recargaSolActual(); }
  catch (e) { solMsg(e.message || 'No se pudo exentar la cuota.'); }
}

$('solHoja')?.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.avanza) avanzar(t.dataset.avanza, null);
  else if (t.dataset.abreNota) $('solHoja').querySelector(`[data-avanza-form="${CSS.escape(t.dataset.abreNota)}"]`)?.classList.toggle('hidden');
  else if (t.hasAttribute('data-retirar')) { if (confirm('¿Retirar esta solicitud? No se puede deshacer.')) avanzar('retirada', null); }
  else if (t.dataset.dictamen === 'aprobar') { $('formAprobar')?.classList.remove('hidden'); $('formNoAprobar')?.classList.add('hidden'); }
  else if (t.dataset.dictamen === 'no_aprobar') { $('formNoAprobar')?.classList.remove('hidden'); $('formAprobar')?.classList.add('hidden'); }
  else if (t.hasAttribute('data-pagar-cuota')) { if (confirm('¿Ya se pagó la cuota de evaluación?')) marcarPagada(); }
  else if (t.hasAttribute('data-exentar-cuota')) $('formExentar')?.classList.toggle('hidden');
});
$('solHoja')?.addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target;
  if (f.dataset.avanzaForm) { avanzar(f.dataset.avanzaForm, f.note.value.trim()); return; }
  if (f.id === 'formAprobar') { decidir('aprobada', f); return; }
  if (f.id === 'formNoAprobar') { decidir('no_aprobada', f); return; }
  if (f.id === 'formExentar') exentarCuota(f.reason.value.trim());
});

// --- Pedidas desde Centro Tanner (09/11/2026): sin sesión, sin jugador
// todavía. Presidencia las ve aquí, opcionalmente las vincula a un jugador
// ya existente (si la familia ya estaba inscrita) y responde. ---
const PUB_ESTADOS = { nueva: 'Nueva', contactada: 'Contactada', vinculada: 'Vinculada', rechazada: 'Rechazada' };
const PUB_NIVEL = { nueva: 'atencion', contactada: 'atencion', vinculada: 'ok', rechazada: 'sindato' };
const PUB_FILTROS = [
  { clave: 'nueva', etiqueta: 'Nuevas', pasa: s => s.status === 'nueva' },
  { clave: 'contactada', etiqueta: 'Contactadas', pasa: s => s.status === 'contactada' },
  { clave: 'cerrada', etiqueta: 'Vinculadas / rechazadas', pasa: s => s.status === 'vinculada' || s.status === 'rechazada' },
  { clave: 'todas', etiqueta: 'Todas', pasa: () => true },
];

async function cargaPublicas() {
  try { publicas = await rpc('v2_scholarship_public_requests', { organization_id: ctx.organization_id, status_filter: null }) || []; pubCargado = true; }
  catch { msg('No pudimos abrir las solicitudes públicas.'); return; }
  pintaPubMarcador(); pintaPubEstados(); pintaPubLista();
}
function pintaPubMarcador() {
  const nuevas = publicas.filter(s => s.status === 'nueva').length;
  $('bcPubBadge').textContent = nuevas;
  $('bcPubBadge').classList.toggle('hidden', !nuevas);
}
function pintaPubEstados() {
  $('pubEstados').innerHTML = PUB_FILTROS.map(f => `<button type="button" data-f="${f.clave}" class="${f.clave === pubEstado ? 'activo' : ''}">${f.etiqueta} <b>${publicas.filter(f.pasa).length}</b></button>`).join('');
  $('pubEstados').querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => { pubEstado = b.dataset.f; pintaPubEstados(); pintaPubLista(); }));
}
function pintaPubLista() {
  const f = PUB_FILTROS.find(x => x.clave === pubEstado) || PUB_FILTROS[0];
  const filas = publicas.filter(f.pasa).filter(s => !pubBusqueda || sinAcentos(s.guardianName).includes(pubBusqueda) || sinAcentos(s.childName).includes(pubBusqueda) || s.folio.toLowerCase().includes(pubBusqueda))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  $('pubVacio').classList.toggle('hidden', filas.length > 0);
  $('pubLista').innerHTML = filas.map(s => {
    const nivel = PUB_NIVEL[s.status] || '';
    return `<button type="button" class="bc-fila${nivel ? ` bc-${nivel}` : ''}" data-id="${esc(s.id)}">
      <span class="bc-fila-txt">
        <strong>${esc(s.childName)}</strong>
        <span class="bc-etq"><i class="bc-tipo">${esc(MODALIDADES[s.modality] || s.modality)}</i><small>${esc(s.folio)} · ${esc(s.guardianName)}</small></span>
        <small class="bc-venc">${esc(fechaHora(s.createdAt))}${s.childStatus === 'inscrito' ? ' · ya inscrito' : ' · aún no se inscribe'}</small>
      </span>
      <span class="sol-pastilla sol-pastilla-${nivel || 'base'}">${esc(PUB_ESTADOS[s.status] || s.status)}</span>
    </button>`;
  }).join('');
  $('pubLista').querySelectorAll('[data-id]').forEach(x => x.addEventListener('click', () => abrePublica(x.dataset.id)));
}
function pubMsg(t) { const m = $('pubHojaMsg'); if (!m) return; m.textContent = t || ''; m.classList.toggle('hidden', !t); }

function abrePublica(id) {
  pubActualId = id;
  const s = publicas.find(x => x.id === id);
  if (!s) return;
  pintaPubHoja(s);
  $('pubFondo').classList.remove('hidden'); document.body.style.overflow = 'hidden';
}
function cierraPublica() { $('pubFondo').classList.add('hidden'); document.body.style.overflow = ''; pubActualId = null; }

function pintaPubHoja(s) {
  const yaVinculada = !!s.linkedPlayerId;
  $('pubHoja').innerHTML = `
    <h2 id="pubHojaNombre">${esc(s.childName)}</h2>
    <p class="muted tiny">${esc(s.folio)} · ${esc(MODALIDADES[s.modality] || s.modality)} · ${esc(fechaHora(s.createdAt))}</p>
    <div class="sol-dictamen">
      <p><b>${esc(s.guardianName)}</b> · <a href="${esc(ligaWhatsApp(s.phone, ''))}" target="_blank">${esc(s.phone)}</a>${s.email ? ` · ${esc(s.email)}` : ''}</p>
      <p>${s.childStatus === 'inscrito' ? 'Dice que ya está inscrito en el club.' : 'Todavía no se inscribe.'}</p>
      <p class="sol-opt">${esc(s.reason)}</p>
    </div>
    <div class="bc-acciones">
      <button type="button" class="secondary" data-pub-estado="contactada" ${s.status === 'contactada' ? 'disabled' : ''}>Marcar contactada</button>
      <button type="button" class="danger" data-pub-estado="rechazada">Rechazar</button>
    </div>
    <div class="sol-dictamen">
      <span class="sol-tit">Vincular a un jugador</span>
      <p class="sol-opt">${yaVinculada ? 'Ya está vinculada a un jugador del club.' : 'Si la familia ya está inscrita, búscala aquí para vincular la solicitud a su ficha.'}</p>
      ${yaVinculada ? `<a class="secondary mini" href="/jugadores/?player=${encodeURIComponent(s.linkedPlayerId)}">Ver ficha del jugador →</a>` : `
      <label>Buscar Tanner<input type="search" id="pubBuscarJugador" placeholder="Nombre del jugador" autocomplete="off"></label>
      <div id="pubResultados" class="sol-resultados"></div>`}
    </div>
    <label>Notas internas<textarea id="pubNotas" rows="3" placeholder="Para el equipo, no la ve la familia">${esc(s.notes || '')}</textarea></label>
    <button type="button" class="secondary" id="pubGuardarNotas">Guardar notas</button>
    <div id="pubHojaMsg" class="inline-message hidden"></div>`;
  $('pubBuscarJugador')?.addEventListener('input', e => buscaJugadoresPub(e.target.value.trim()));
}
async function buscaJugadoresPub(q) {
  if (!todosJugadores) { try { todosJugadores = await rpc('v2_players', { organization_id: ctx.organization_id, status_filter: 'active' }) || []; } catch { todosJugadores = []; } }
  const qq = sinAcentos(q);
  const res = qq.length < 2 ? [] : todosJugadores.filter(p => sinAcentos(`${p.first_name} ${p.last_name}`).includes(qq)).slice(0, 8);
  $('pubResultados').innerHTML = res.map(p => `<button type="button" class="sol-resultado" data-pid="${esc(p.id)}" data-pname="${esc(`${p.first_name} ${p.last_name}`)}">
    <strong>${esc(p.first_name)} ${esc(p.last_name)}</strong>${p.category ? `<small>${esc(p.category)}</small>` : ''}</button>`).join('');
}
async function actualizaPublica(payload) {
  if (!pubActualId) return;
  try {
    await rpc('v2_scholarship_public_request_update', { organization_id: ctx.organization_id, id: pubActualId, ...payload });
    publicas = await rpc('v2_scholarship_public_requests', { organization_id: ctx.organization_id, status_filter: null }) || [];
    pintaPubMarcador(); pintaPubEstados(); pintaPubLista();
    const actual = publicas.find(x => x.id === pubActualId);
    if (actual) pintaPubHoja(actual);
  } catch (e) { pubMsg(e.message || 'No se pudo guardar.'); }
}
$('pubHoja')?.addEventListener('click', e => {
  const pid = e.target.closest('[data-pid]');
  if (pid) { actualizaPublica({ link_player_id: pid.dataset.pid, status: 'vinculada' }); return; }
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.pubEstado === 'rechazada') { if (confirm('¿Rechazar esta solicitud?')) actualizaPublica({ status: 'rechazada' }); }
  else if (t.dataset.pubEstado) actualizaPublica({ status: t.dataset.pubEstado });
  else if (t.id === 'pubGuardarNotas') actualizaPublica({ notes: $('pubNotas').value.trim() });
});

// --- Nominar (Beca Deportiva / Beca Tanner) ---
function abreNominar() {
  $('nomHoja').innerHTML = `
    <h2 id="nomHojaTitulo">Nominar a un Tanner</h2>
    <p class="muted tiny">Para Beca Deportiva o Beca Tanner. El resto de las modalidades las pide la familia desde su Portal.</p>
    <label>Buscar Tanner<input type="search" id="nomBuscar" placeholder="Nombre del jugador" autocomplete="off"></label>
    <div id="nomResultados" class="sol-resultados"></div>
    <form id="formNominar" class="sol-form hidden">
      <p>Nominando a <b id="nomElegido"></b></p>
      <input type="hidden" name="player_id">
      <label>Modalidad<select name="modality" required><option value="deportiva">Beca Deportiva</option><option value="tanner">Beca Tanner</option></select></label>
      <label>Nota <span class="sol-opt">· por qué se nomina</span><textarea name="note" rows="3" required minlength="5"></textarea></label>
      <button type="submit" class="primary">Nominar</button>
    </form>
    <div id="nomMsg" class="inline-message hidden"></div>`;
  $('nomFondo').classList.remove('hidden'); document.body.style.overflow = 'hidden';
  $('nomBuscar').focus();
}
function cierraNominar() { $('nomFondo').classList.add('hidden'); document.body.style.overflow = ''; }
async function buscaJugadores(q) {
  if (!todosJugadores) { try { todosJugadores = await rpc('v2_players', { organization_id: ctx.organization_id, status_filter: 'active' }) || []; } catch { todosJugadores = []; } }
  const qq = sinAcentos(q);
  const res = qq.length < 2 ? [] : todosJugadores.filter(p => sinAcentos(`${p.first_name} ${p.last_name}`).includes(qq)).slice(0, 8);
  $('nomResultados').innerHTML = res.map(p => `<button type="button" class="sol-resultado" data-pid="${esc(p.id)}" data-pname="${esc(`${p.first_name} ${p.last_name}`)}">
    <strong>${esc(p.first_name)} ${esc(p.last_name)}</strong>${p.benefit_active ? '<small class="sol-aviso">Ya tiene un apoyo activo</small>' : ''}</button>`).join('');
}
$('nomHoja')?.addEventListener('input', e => { if (e.target.id === 'nomBuscar') buscaJugadores(e.target.value.trim()); });
$('nomHoja')?.addEventListener('click', e => {
  const t = e.target.closest('[data-pid]'); if (!t) return;
  $('formNominar').classList.remove('hidden');
  $('formNominar').querySelector('[name="player_id"]').value = t.dataset.pid;
  $('nomElegido').textContent = t.dataset.pname;
  $('nomResultados').innerHTML = ''; $('nomBuscar').value = t.dataset.pname;
});
$('nomHoja')?.addEventListener('submit', async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await rpc('v2_scholarship_nominate', { organization_id: ctx.organization_id, player_id: fd.get('player_id'), modality: fd.get('modality'), note: fd.get('note') });
    cierraNominar(); await cargaSolicitudes();
  } catch (err) { const m = $('nomMsg'); m.textContent = err.message || 'No se pudo nominar.'; m.classList.remove('hidden'); }
});

// --- Ajustes del programa (sólo Presidencia) ---
function abreAjustes() {
  const s = ajustes || {}; const v = (k, d) => (s[k] === null || s[k] === undefined) ? d : s[k];
  $('cfgHoja').innerHTML = `
    <h2 id="cfgHojaTitulo">Ajustes de Becas ${esc(nombreDelClub(ctx))}</h2>
    <form id="formAjustes" class="sol-form">
      <label>Porcentaje mínimo de apoyo <span class="sol-opt">· %</span><input type="number" name="min_percentage" min="0" max="100" value="${esc(v('minPercentage', 10))}" required></label>
      <label>Cuota de evaluación <span class="sol-opt">· $ MXN</span><input type="number" name="application_fee" min="0" value="${esc(v('applicationFee', 200))}" required></label>
      <div class="sol-dos">
        <label>Tope de becas al 100% <span class="sol-opt">· activas a la vez</span><input type="number" name="max_full_scholarships" min="0" value="${esc(v('maxFullScholarships', 3))}" required></label>
        <label>Días de respuesta <span class="sol-opt">· meta</span><input type="number" name="response_days" min="1" value="${esc(v('responseDays', 7))}" required></label>
      </div>
      <div class="sol-dos">
        <label>Meta de asistencia <span class="sol-opt">· %</span><input type="number" name="attendance_target_pct" min="0" max="100" value="${esc(v('attendanceTargetPct', 90))}" required></label>
        <label>Tope del fondo interno <span class="sol-opt">· % opcional</span><input type="number" name="internal_fund_cap_pct" min="0" max="100" value="${esc(v('internalFundCapPct', ''))}"></label>
      </div>
      <div class="sol-dos">
        <label>Referidos por trimestre <span class="sol-opt">· Tanner por Tanner</span><input type="number" name="referrals_per_quarter" min="0" value="${esc(v('referralsPerQuarter', 2))}" required></label>
        <label>Contactos comerciales <span class="sol-opt">· por trimestre</span><input type="number" name="commercial_contacts_per_quarter" min="0" value="${esc(v('commercialContactsPerQuarter', 1))}" required></label>
      </div>
      <label>Advertencias antes de revisión formal <span class="sol-opt">· salvo faltas graves</span><input type="number" name="max_warnings" min="0" value="${esc(v('maxWarnings', 3))}" required></label>
      <button type="submit" class="primary">Guardar ajustes</button>
    </form>
    <div id="cfgMsg" class="inline-message hidden"></div>`;
  $('cfgFondo').classList.remove('hidden'); document.body.style.overflow = 'hidden';
}
function cierraAjustes() { $('cfgFondo').classList.add('hidden'); document.body.style.overflow = ''; }
$('cfgHoja')?.addEventListener('submit', async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const n = k => fd.get(k) === '' ? null : Number(fd.get(k));
  try {
    await rpc('v2_scholarship_settings_update', { organization_id: ctx.organization_id,
      min_percentage: n('min_percentage'), application_fee: n('application_fee'), internal_fund_cap_pct: n('internal_fund_cap_pct'),
      max_full_scholarships: n('max_full_scholarships'), response_days: n('response_days'), attendance_target_pct: n('attendance_target_pct'),
      referrals_per_quarter: n('referrals_per_quarter'), commercial_contacts_per_quarter: n('commercial_contacts_per_quarter'), max_warnings: n('max_warnings') });
    ajustes = await rpc('v2_scholarship_settings_get', { organization_id: ctx.organization_id });
    cierraAjustes();
  } catch (err) { const m = $('cfgMsg'); m.textContent = err.message || 'No se pudo guardar.'; m.classList.remove('hidden'); }
});

document.querySelectorAll('.bc-modo-btn').forEach(b => b.addEventListener('click', () => setModo(b.dataset.modo)));
$('solBuscar')?.addEventListener('input', e => { solBusqueda = sinAcentos(e.target.value.trim()); pintaSolLista(); });
$('solCerrar')?.addEventListener('click', cierraSolicitud);
$('solFondo')?.addEventListener('click', e => { if (e.target.id === 'solFondo') cierraSolicitud(); });
$('solNominarBtn')?.addEventListener('click', abreNominar);
$('nomCerrar')?.addEventListener('click', cierraNominar);
$('nomFondo')?.addEventListener('click', e => { if (e.target.id === 'nomFondo') cierraNominar(); });
$('pubBuscar')?.addEventListener('input', e => { pubBusqueda = sinAcentos(e.target.value.trim()); pintaPubLista(); });
$('pubCerrar')?.addEventListener('click', cierraPublica);
$('pubFondo')?.addEventListener('click', e => { if (e.target.id === 'pubFondo') cierraPublica(); });
$('solAjustesBtn')?.addEventListener('click', abreAjustes);
$('cfgCerrar')?.addEventListener('click', cierraAjustes);
$('cfgFondo')?.addEventListener('click', e => { if (e.target.id === 'cfgFondo') cierraAjustes(); });

$('bcBuscar')?.addEventListener('input', e => { busqueda = sinAcentos(e.target.value.trim()); pintaLista(); });
$('bcCsv')?.addEventListener('click', exportaCsv);
$('bcCerrar')?.addEventListener('click', cierraFicha);
$('bcFondo')?.addEventListener('click', e => { if (e.target.id === 'bcFondo') cierraFicha(); });

function fichaMsg(t) { const m = $('bcHojaMsg'); if (!m) return; m.textContent = t || ''; m.classList.toggle('hidden', !t); }
$('bcHoja')?.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.hasAttribute('data-abre-advertencia')) $('formAdvertencia')?.classList.toggle('hidden');
  else if (t.hasAttribute('data-abre-suspender')) $('formSuspender')?.classList.toggle('hidden');
});
$('bcHoja')?.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, fd = new FormData(f);
  if (f.id === 'formAdvertencia') {
    if (!fichaActual) return;
    try {
      await rpc('v2_scholarship_warning_add', { organization_id: ctx.organization_id, benefit_id: fichaActual.benefitId, cause: fd.get('cause'), note: fd.get('note')?.trim() || null });
      await carga(); abreFicha(fichaActual.playerId);
    } catch (err) { fichaMsg(err.message || 'No se pudo registrar la advertencia.'); }
  } else if (f.id === 'formSuspender') {
    if (!fichaActual) return;
    if (!confirm('¿Confirmas suspender/cancelar esta beca? No se puede deshacer.')) return;
    try {
      await rpc('v2_scholarship_benefit_suspend', { organization_id: ctx.organization_id, benefit_id: fichaActual.benefitId, cause: fd.get('cause'), reason: fd.get('reason').trim() });
      cierraFicha(); await carga();
    } catch (err) { fichaMsg(err.message || 'No se pudo suspender la beca.'); }
  }
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!$('bcFondo').classList.contains('hidden')) cierraFicha();
  else if (!$('solFondo').classList.contains('hidden')) cierraSolicitud();
  else if (!$('pubFondo').classList.contains('hidden')) cierraPublica();
  else if (!$('nomFondo').classList.contains('hidden')) cierraNominar();
  else if (!$('cfgFondo').classList.contains('hidden')) cierraAjustes();
});
boot().catch(() => show('deniedView'));
