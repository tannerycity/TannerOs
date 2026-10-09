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
  $('orgName').textContent = ctx.organization_name || 'Tannery City FC';
  $('roleBadge').textContent = ctx.is_owner ? 'Presidencia' : ctx.role;
  pintaPeriodos(); pintaFiltros();
  show('view');
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

function abreFicha(id) {
  const b = (datos?.rows || []).find(x => x.playerId === id);
  if (!b) return;
  const c = cumplimiento(b.pct), v = vencimiento(b.daysLeft), t = tipoDe(b.type), cu = cuantoCubre(b);
  const liga = ligaWhatsApp(b.phone, mensajeDeFaltas({ tanner: b.name, tutor: b.guardianName, categoria: b.categoryName,
    faltas: b.streak, pct: b.pct, asistio: b.attended, marcadas: b.marked, club: ctx?.organization_name || 'Tannery City' }));
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
    </div>`;
  $('bcFondo').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
function cierraFicha() { $('bcFondo').classList.add('hidden'); document.body.style.overflow = ''; }

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

$('bcBuscar')?.addEventListener('input', e => { busqueda = sinAcentos(e.target.value.trim()); pintaLista(); });
$('bcCsv')?.addEventListener('click', exportaCsv);
$('bcCerrar')?.addEventListener('click', cierraFicha);
$('bcFondo')?.addEventListener('click', e => { if (e.target.id === 'bcFondo') cierraFicha(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('bcFondo').classList.contains('hidden')) cierraFicha(); });
boot().catch(() => show('deniedView'));
