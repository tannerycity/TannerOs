/* MÉTRICAS DE MARKETING (Presidencia, 02/11/2026, h58).
 *
 * "La quiero con métricas y todo... también quiero que la vea Zul... que la
 * veas y puedas tomar decisiones."
 *
 * Arriba, qué negocio (Club o TCP) y qué periodo (7, 28 o 90 días). Luego:
 *   1. Para decidir: hasta cuatro recomendaciones, de reglas fijas.
 *   2. El embudo: de quién te ve en redes a quién se inscribe, y dónde se
 *      pierde la pista (lo que todavía no se mide).
 *   3. Los indicadores por canal, con su comparación contra el periodo
 *      anterior (sólo si hay datos completos) y su tendencia diaria.
 *   4. De dónde sale cada número y si está al día.
 * Lo ve Presidencia y quien tenga el permiso de Métricas (Zul, sólo lectura).
 * Lo cobrado sólo lo manda la base a Presidencia o Administración.
 * Sólo agregados: ningún nombre ni dato de personas.
 */
import { bootstrapProtectedShell, rpc, $ } from '/v2/shell.js';
import { PERIODOS, NEGOCIOS, GRUPOS, rango, hoyMexico, indicadores, embudo, recomendaciones, posicionGoogle, tasaFacebook, estadoFuente, suma, cambio } from '/v2/metricas/metricas.js';

const boot = await bootstrapProtectedShell({ active: 'metricas', title: 'Métricas' });
if (!boot) throw new Error('No access');
const org = boot.ctx.organization_id;
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = n => new Intl.NumberFormat('es-MX').format(Math.round(n));
const pesos = n => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n);
const cuando = v => v ? new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(v)).replace('.', '') : '';
const fechaCorta = d => new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(new Date(`${d}T12:00:00`)).replace('.', '');
const leer = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };
function msg(t = '') { const e = $('metMensaje'); e.textContent = t; e.classList.toggle('hidden', !t); }

const NOMBRE_FUENTE = { ga4: 'Google Analytics', search_console: 'Google Search Console', meta_ads: 'Anuncios de Meta', facebook: 'Facebook', instagram: 'Instagram', gbp: 'Perfil de Google (Maps)' };
const ICONO = {
  alerta: '<path d="M12 4 2.5 20h19L12 4Z"/><path d="M12 10v4.5M12 17.5v.01"/>',
  oportunidad: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z"/>',
  bien: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.7 2.7L16.5 9.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5v.01"/>',
  sube: '<path d="M7 14l5-5 5 5"/>', baja: '<path d="M7 10l5 5 5-5"/>'
};
const svg = (k, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONO[k]}</svg>`;
const TONO = { alerta: 'Atención', oportunidad: 'Oportunidad', bien: 'Va bien', info: 'Dato' };

let negocio = NEGOCIOS.some(n => n.k === leer('tos-metricas-negocio')) ? leer('tos-metricas-negocio') : 'club';
let dias = PERIODOS.some(p => String(p.k) === leer('tos-metricas-periodo')) ? Number(leer('tos-metricas-periodo')) : 28;
let datos = null, tablero = null, r = null;

function pintaControles() {
  $('metNegocio').innerHTML = NEGOCIOS.map(n => `<button type="button" data-negocio="${n.k}" aria-pressed="${n.k === negocio}">${n.t}</button>`).join('');
  $('metPeriodo').innerHTML = PERIODOS.map(p => `<button type="button" data-periodo="${p.k}" aria-pressed="${p.k === dias}">${p.t}</button>`).join('');
}

/* Tendencia diaria: línea delgada, huecos donde no hay dato, punto final. */
function sparkline(serie, etiqueta) {
  // Empieza en el primer día con dato: si la medición es reciente, la línea
  // no queda apachurrada contra la orilla.
  const primero = serie.findIndex(p => p.valor != null);
  if (primero < 0) return '';
  const tramo = serie.slice(primero), pts = tramo.map((p, i) => ({ ...p, i })).filter(p => p.valor != null);
  if (pts.length < 3) return '';
  const W = 240, H = 44, n = tramo.length - 1 || 1, max = Math.max(...pts.map(p => p.valor)), min = Math.min(0, ...pts.map(p => p.valor));
  const x = i => (i / n) * (W - 8) + 4, y = v => H - 4 - ((v - min) / ((max - min) || 1)) * (H - 10);
  let d = '', antes = null;
  for (const p of pts) { d += `${antes != null && p.i === antes + 1 ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.valor).toFixed(1)}`; antes = p.i; }
  const fin = pts.at(-1);
  const datosPuntos = esc(JSON.stringify(pts.map(p => [p.dia, p.valor, +x(p.i).toFixed(1), +y(p.valor).toFixed(1)])));
  return `<div class="met-spark" data-puntos="${datosPuntos}"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(etiqueta)}: tendencia diaria">
    <path d="${d}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${x(fin.i).toFixed(1)}" cy="${y(fin.valor).toFixed(1)}" r="3" fill="currentColor"/></svg><span class="met-spark-tip" hidden></span>
    <small class="met-spark-pie">Por día desde el ${esc(fechaCorta(tramo[0].dia))}</small></div>`;
}

function chipCambio(valor, alReves = false) {
  if (valor == null) return '';
  const bueno = alReves ? valor < 0 : valor > 0, plano = valor === 0;
  const cls = plano ? 'plano' : bueno ? 'sube' : 'baja';
  return `<span class="met-cambio ${cls}">${plano ? '' : svg(valor > 0 ? 'sube' : 'baja')}${valor > 0 ? '+' : ''}${valor}% <small>vs ${dias} días antes</small></span>`;
}

function tarjeta({ titulo, ayuda, valor, texto, cambioHtml = '', extra = '', spark = '', estado = null }) {
  const sinMedir = valor == null;
  return `<article class="met-kpi${sinMedir ? ' sin' : ''}">
    <header><h3>${esc(titulo)}</h3>${ayuda ? `<p>${esc(ayuda)}</p>` : ''}</header>
    <strong class="met-valor">${sinMedir ? 'Sin medir' : texto}</strong>
    ${cambioHtml}${extra}${spark}
    ${estado && estado.estado !== 'ok' ? `<p class="met-kpi-estado">${esc(estado.texto)}${estado.detalle ? `: ${esc(estado.detalle)}` : ''}</p>` : ''}
  </article>`;
}

function pinta() {
  r = rango(dias, hoyMexico());
  const kpis = indicadores(datos, negocio, r);
  const nombreNegocio = negocio === 'tcp' ? 'TCP' : (boot.ctx.organization_name || 'El club');
  // Recomendaciones.
  const ideas = recomendaciones(datos, negocio, r, kpis);
  $('metIdeas').innerHTML = ideas.length ? ideas.map(i => `<article class="met-idea ${i.tono}">
      <span class="met-idea-icono">${svg(i.tono)}</span>
      <div><p class="met-idea-tono">${TONO[i.tono]}</p><h3>${esc(i.titulo)}</h3><p>${esc(i.texto)}</p><small>Fuente: ${esc(i.fuente)}</small></div>
    </article>`).join('') : '<p class="met-vacio">Sin recomendaciones por ahora: falta conectar fuentes para este negocio.</p>';
  // Embudo.
  const pasos = embudo(datos, negocio, r, kpis);
  const corte = pasos.findIndex(p => p.valor == null);
  $('metEmbudoSub').textContent = `${nombreNegocio} · ${fechaCorta(r.desde)} al ${fechaCorta(r.hasta)}` + (corte > 0 ? ` · Hoy se pierde la pista en «${pasos[corte].t}».` : '');
  $('metEmbudo').innerHTML = pasos.map((p, i) => `<li class="${p.valor == null ? 'sin' : ''}${i === corte ? ' corte' : ''}">
      <span class="met-paso-n">${i + 1}</span><div><p>${esc(p.t)}</p><strong>${p.valor == null ? 'Sin medir' : num(p.valor)}</strong><small>${esc(p.nota)}</small></div></li>`).join('');
  // Indicadores por canal.
  const derivados = {
    redes: (() => { const t = tasaFacebook(datos, negocio, r.desde, r.hasta); if (t == null) return '';
      const ta = tasaFacebook(datos, negocio, r.antesDesde, r.antesHasta), dA = suma(datos.filas, 'facebook', negocio, 'visualizaciones', r.antesDesde, r.antesHasta).dias;
      return tarjeta({ titulo: 'Tasa de interacción en Facebook', ayuda: 'Interacciones por cada 100 visualizaciones', valor: t, texto: `${t}%`, cambioHtml: chipCambio(cambio(t, ta, dA, r.dias)) }); })(),
    google: (() => { const p = posicionGoogle(datos, negocio, r.desde, r.hasta); if (p == null) return '';
      const pa = posicionGoogle(datos, negocio, r.antesDesde, r.antesHasta), dA = suma(datos.filas, 'search_console', negocio, 'impresiones', r.antesDesde, r.antesHasta).dias;
      return tarjeta({ titulo: 'Posición promedio en Google', ayuda: 'Más bajo es mejor: 1 es el primer resultado', valor: p, texto: String(p), cambioHtml: chipCambio(cambio(p, pa, dA, r.dias), true) }); })()
  };
  $('metGrupos').innerHTML = GRUPOS.map(g => {
    const propios = kpis.filter(k => k.grupo === g.k);
    if (!propios.length && !derivados[g.k]) return '';
    const tarjetas = propios.map(k => tarjeta({
      titulo: k.t, ayuda: k.ayuda, valor: k.valor, estado: k.fuenteEstado,
      texto: k.dinero ? pesos(k.valor) : num(k.valor ?? 0),
      cambioHtml: k.tipo === 'ultimo' ? '' : chipCambio(k.cambio),
      extra: k.tipo === 'ultimo' && k.valor != null ? `<p class="met-kpi-nota">${k.diferencia != null ? `${k.diferencia >= 0 ? '+' : ''}${num(k.diferencia)} desde hace ${dias} días` : `Al ${fechaCorta(k.dia)} · el historial empieza a contar hoy`}</p>`
        : k.valor != null && k.cambio == null && k.anterior == null ? '<p class="met-kpi-nota">Sin periodo anterior para comparar</p>' : '',
      spark: k.tipo === 'suma' ? sparkline(k.serie, k.t) : ''
    })).join('') + (derivados[g.k] || '');
    return `<section class="met-bloque" aria-label="${esc(g.t)}"><h2>${esc(g.t)}</h2><p class="met-bloque-sub">${esc(g.sub)}</p><div class="met-kpis">${tarjetas}</div></section>`;
  }).join('') + pintaNegocio();
  // Fuentes.
  $('metFuentes').innerHTML = Object.keys(NOMBRE_FUENTE).map(f => { const e = estadoFuente(datos, f);
    return `<li><span class="met-fuente-estado ${e.estado}">${svg(e.estado === 'ok' ? 'bien' : e.estado === 'sin_conectar' ? 'info' : 'alerta')}${esc(e.texto)}</span>
      <strong>${esc(NOMBRE_FUENTE[f])}</strong><small>${e.cuando ? `Última lectura: ${esc(cuando(e.cuando))}` : ''}${e.detalle ? ` · ${esc(e.detalle)}` : ''}</small></li>`; }).join('');
  const ultima = (datos.sincronizaciones || []).map(s => s.cuando).sort().at(-1);
  $('metActualizado').textContent = ultima ? `Actualizado el ${cuando(ultima)}` : '';
}

/* Lo del negocio que viene de TannerOS (prospectos, inscritos y, para
   Presidencia, lo cobrado). TCP todavía no tiene su base conectada. */
function pintaNegocio() {
  if (negocio === 'tcp') return `<section class="met-bloque" aria-label="Negocio"><h2>Negocio</h2><p class="met-bloque-sub">Reservas, torneos e ingresos de TCP</p>
    <div class="met-kpis">${tarjeta({ titulo: 'Operación de TCP', ayuda: 'Falta conectar la base de TCP', valor: null })}</div></section>`;
  const k = c => (tablero?.kpis || []).find(x => x.kpi === c && x.negocio === 'club');
  const cuadro = (c, titulo, ayuda, fmt) => { const x = k(c); if (!x) return '';
    return tarjeta({ titulo, ayuda, valor: x.valor ?? null, texto: fmt(x.valor ?? 0), cambioHtml: chipCambio(cambio(x.valor, x.anterior)) }); };
  const html = cuadro('prospectos', 'Prospectos', 'Fichajes registrados', num) + cuadro('inscripciones', 'Inscripciones', 'Jugadores dados de alta', num)
    + cuadro('cobrado', 'Cobrado', 'Pagos registrados en Taquilla', pesos)
    + (() => { const x = k('costo_por_prospecto'); return x ? tarjeta({ titulo: 'Costo por prospecto', ayuda: x.nota || 'Gasto CLUB- entre prospectos', valor: x.valor ?? null, texto: pesos(x.valor ?? 0) }) : ''; })();
  return html ? `<section class="met-bloque" aria-label="Negocio"><h2>Negocio</h2><p class="met-bloque-sub">Lo que pasa dentro del club, desde TannerOS</p><div class="met-kpis">${html}</div></section>` : '';
}

async function carga() {
  msg('');
  r = rango(dias, hoyMexico());
  try {
    [datos, tablero] = await Promise.all([
      rpc('v2_bi_serie', { organization_id: org, desde: r.antesDesde, hasta: r.hoy }),
      rpc('v2_bi_tablero', { organization_id: org, desde: r.desde, hasta: r.hasta }).catch(() => null)
    ]);
    pinta();
  } catch (e) {
    if (/not authorized/i.test(e?.message || '')) { $('metDenied').classList.remove('hidden'); document.querySelectorAll('.met-bloque,.met-hero,#metGrupos').forEach(x => x.classList.add('hidden')); return; }
    msg('No se pudieron cargar las métricas. Intenta de nuevo en un momento.');
  }
}

$('metNegocio').addEventListener('click', e => { const b = e.target.closest('[data-negocio]'); if (!b || b.dataset.negocio === negocio) return;
  negocio = b.dataset.negocio; guardar('tos-metricas-negocio', negocio); pintaControles(); if (datos) pinta(); });
$('metPeriodo').addEventListener('click', e => { const b = e.target.closest('[data-periodo]'); if (!b || Number(b.dataset.periodo) === dias) return;
  dias = Number(b.dataset.periodo); guardar('tos-metricas-periodo', String(dias)); pintaControles(); carga(); });
// Al pasar el dedo o el mouse por una tendencia: el día y su valor.
document.addEventListener('pointermove', e => {
  const box = e.target.closest?.('.met-spark'); document.querySelectorAll('.met-spark-tip:not([hidden])').forEach(t => { if (!box || !box.contains(t)) t.hidden = true; });
  if (!box) return;
  const pts = JSON.parse(box.dataset.puntos), rect = box.getBoundingClientRect(), xRel = ((e.clientX - rect.left) / rect.width) * 240;
  const p = pts.reduce((a, b) => Math.abs(b[2] - xRel) < Math.abs(a[2] - xRel) ? b : a), tip = box.querySelector('.met-spark-tip');
  tip.textContent = `${fechaCorta(p[0])}: ${num(p[1])}`; tip.style.left = `${(p[2] / 240) * 100}%`; tip.hidden = false;
});
pintaControles();
carga();
