/* ENCUESTAS (Presidencia, 15/10/2026).
 *
 * "Que los papás Tanners y los que vinieron del Club León contesten cómo se
 * la pasaron... hagas unas gráficas y lo analicemos. Después vamos a hacer
 * más encuestas, deja todo listo."
 *
 * Arriba, las encuestas del club (una por evento). Se crea una nueva con su
 * nombre y el club visitante, y sale su liga y su QR (/encuesta/?e=slug).
 * Abajo, los resultados de la elegida: promedio por tema (Tanner contra
 * visitantes), NPS, lo más fuerte, lo que hay que atender y los comentarios.
 * Sólo Presidencia (v2_surveys / v2_survey_results lo exigen en la base).
 */
import { bootstrapProtectedShell, rpc, $, setShellHealth } from '/v2/shell.js';
import { ligaPublica } from '/v2/club-publico.js';
import { TIPOS, VISITAS, ENCUESTA_COMUNIDAD, resumen, semaforo, nps, mensajeDeEncuesta, csvDeComentarios } from '/v2/encuestas/encuestas.js';

const boot = await bootstrapProtectedShell({ active: 'encuestas', title: 'Encuestas' });
if (!boot) throw new Error('No access');
const ctx = boot.ctx, org = ctx.organization_id, club = ctx.organization_name || 'el club';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fecha = v => v ? new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(v)).replace('.', '') : '';
const uno = v => v == null ? '—' : Number(v).toFixed(1);
function msg(t = '', tipo = 'error') { const e = $('encMensaje'); e.textContent = t; e.dataset.type = tipo; e.classList.toggle('hidden', !t); }

const COLOR = { tanner: '#1f6fa3', visitante: '#b8791f', otro: '#8a5aa8' };
const nombreTipo = k => TIPOS.find(x => x.k === k)?.t || k;
const pide = new URLSearchParams(location.search);
let encuestas = [], elegida = pide.get('e') || '', resultado = null, filtroCom = 'todos';
// La de comunidad es la liga corta, sin ?e=.
const liga = slug => ligaPublica('/encuesta/', ctx, slug === ENCUESTA_COMUNIDAD ? {} : { e: slug });

async function pintaQr(canvas, texto, lado) {
  const { default: qrcode } = await import('/vendor/qrcode.mjs');
  const qr = qrcode(0, 'M'); qr.addData(texto); qr.make();
  const n = qr.getModuleCount(), quiet = 4, paso = lado / (n + quiet * 2), g = canvas.getContext('2d');
  canvas.width = lado; canvas.height = lado;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, lado, lado); g.fillStyle = '#07191e';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) g.fillRect(Math.floor((c + quiet) * paso), Math.floor((r + quiet) * paso), Math.ceil(paso), Math.ceil(paso));
}

function pintaLista() {
  $('encLista').innerHTML = encuestas.length ? encuestas.map(e => `
    <button type="button" role="tab" class="enc-tarjeta${e.slug === elegida ? ' activa' : ''}" data-slug="${esc(e.slug)}" aria-selected="${e.slug === elegida}">
      <span class="enc-tarjeta-tit">${esc(e.title)}</span>
      <span class="enc-tarjeta-meta"><b>${e.total}</b> ${e.total === 1 ? 'respuesta' : 'respuestas'}${e.nps != null ? ` · NPS ${e.nps > 0 ? '+' : ''}${e.nps}` : ''}</span>
      <span class="enc-estado ${e.open ? 'abierta' : 'cerrada'}">${e.open ? 'Abierta' : 'Cerrada'}</span>
    </button>`).join('')
    : '<p class="enc-vacio"><b>Aún no hay encuestas</b>Crea la primera con "Nueva encuesta".</p>';
}

// Barras horizontales: una por tipo de persona, de 0 a 5, con su número al lado.
function graficaTemas(r) {
  const filas = [...r.temas].sort((a, b) => (b.promedio ?? -1) - (a.promedio ?? -1));
  const leyenda = r.tipos.length > 1 ? `<div class="enc-leyenda">${r.tipos.map(k => `<span><i style="background:${COLOR[k]}"></i>${esc(nombreTipo(k))}</span>`).join('')}</div>` : '';
  return `${leyenda}<div class="enc-barras">${filas.map(t => {
    const s = semaforo(t.promedio);
    const barras = t.n ? r.tipos.filter(k => t.porTipo[k]).map(k => {
      const v = t.porTipo[k];
      return `<div class="enc-barra" tabindex="0" data-tip="${esc(nombreTipo(k))}: ${uno(v.promedio)} de 5 · ${v.n} ${v.n === 1 ? 'voto' : 'votos'}">
        <span class="enc-barra-pista"><span style="width:${(v.promedio / 5) * 100}%;background:${COLOR[k]}"></span></span><b>${uno(v.promedio)}</b></div>`;
    }).join('') : '<p class="enc-sin">Sin votos todavía</p>';
    return `<div class="enc-fila"><div class="enc-fila-cab"><span>${esc(t.t)}</span>${s ? `<em class="enc-sem ${s.k}">${uno(t.promedio)} · ${s.t}</em>` : ''}</div>${barras}</div>`;
  }).join('')}</div>`;
}

// NPS: promotores (9-10), pasivos (7-8) y detractores (0-6), general y por tipo.
function barraNps(x, nombre) {
  const n = Number(x?.n) || 0;
  if (!n) return '';
  const p = Number(x.promotores) || 0, d = Number(x.detractores) || 0, pa = n - p - d, pct = v => (100 * v / n);
  const seg = (v, k, t) => v ? `<span class="enc-nps-seg ${k}" style="width:${pct(v)}%" data-tip="${t}: ${v} (${Math.round(pct(v))}%)" tabindex="0">${pct(v) >= 12 ? v : ''}</span>` : '';
  const score = x.score ?? Math.round(100 * (p - d) / n);
  return `<div class="enc-nps-fila"><span class="enc-nps-nombre">${esc(nombre)}<b>${score > 0 ? '+' : ''}${score}</b></span>
    <div class="enc-nps-barra">${seg(d, 'det', 'Detractores (0 a 6)')}${seg(pa, 'pas', 'Pasivos (7 y 8)')}${seg(p, 'pro', 'Promotores (9 y 10)')}</div></div>`;
}

// Por categoría (Baby Tanner, T6...): cuántos contestaron, su promedio y su NPS.
// Una sola serie: un solo color; el semáforo lleva palabra.
function porCategoria(lista) {
  if (!lista?.length) return '';
  return `<section class="enc-panel"><h2>Por categoría</h2><p class="enc-ayuda">Papás Tanner según la categoría de su hijo. Quien tiene hijos en dos categorías cuenta en las dos.</p>
    <div class="enc-barras">${lista.map(c => {
      const s = semaforo(c.promedio), score = nps({ n: c.npsN, promotores: c.promotores, detractores: c.detractores });
      return `<div class="enc-fila"><div class="enc-fila-cab"><span>${esc(c.categoria)} <small class="enc-n">${c.n} ${c.n === 1 ? 'respuesta' : 'respuestas'}${score == null ? '' : ` · NPS ${score > 0 ? '+' : ''}${score}`}</small></span>${s ? `<em class="enc-sem ${s.k}">${uno(c.promedio)} · ${s.t}</em>` : ''}</div>
        ${c.promedio == null ? '<p class="enc-sin">Sin calificaciones</p>' : `<div class="enc-barra" tabindex="0" data-tip="${esc(c.categoria)}: ${uno(c.promedio)} de 5 en promedio"><span class="enc-barra-pista"><span style="width:${(c.promedio / 5) * 100}%;background:${COLOR.tanner}"></span></span><b>${uno(c.promedio)}</b></div>`}</div>`;
    }).join('')}</div></section>`;
}

function conclusiones(r) {
  const item = t => `<li><b>${esc(t.t)}</b><span>${uno(t.promedio)} de 5 · ${t.n} ${t.n === 1 ? 'voto' : 'votos'}</span></li>`;
  const brecha = b => `<li><b>${esc(b.t)}</b><span>Tanner ${uno(b.porTipo.tanner.promedio)} · Visitantes ${uno(b.porTipo.visitante.promedio)}</span></li>`;
  return `<div class="enc-concl">
    <article class="bien"><h3>Lo más fuerte</h3>${r.fuertes.length ? `<ol>${r.fuertes.map(item).join('')}</ol>` : '<p>Aún sin votos.</p>'}</article>
    <article class="mal"><h3>Lo que hay que atender</h3>${r.atender.length ? `<ol>${r.atender.map(item).join('')}</ol>` : '<p>Nada abajo de 4.3. Bien.</p>'}</article>
    ${r.brechas.length ? `<article class="brecha"><h3>Opinan distinto</h3><ol>${r.brechas.slice(0, 3).map(brecha).join('')}</ol></article>` : ''}
  </div>`;
}

function comentarios(lista) {
  const vis = lista.filter(c => filtroCom === 'todos' || c.tipo === filtroCom);
  const tabs = ['todos', ...new Set(lista.map(c => c.tipo))].map(k => `<button type="button" data-com="${k}" class="${filtroCom === k ? 'activo' : ''}">${k === 'todos' ? 'Todos' : esc(nombreTipo(k))}<i>${k === 'todos' ? lista.length : lista.filter(c => c.tipo === k).length}</i></button>`).join('');
  return `<div class="enc-com-cab"><div class="enc-com-tabs">${tabs}</div>${lista.length ? '<button type="button" id="encCsv" class="enc-link">Descargar CSV</button>' : ''}</div>
    <div class="enc-coms">${vis.length ? vis.map(c => `<article class="enc-com">
      <header><span class="enc-chip" style="--c:${COLOR[c.tipo] || '#5c6a63'}">${esc(nombreTipo(c.tipo))}${c.club ? ` · ${esc(c.club)}` : ''}${(c.categorias || []).length ? ` · ${esc(c.categorias.join(', '))}` : ''}</span>${c.nps != null ? `<span class="enc-com-nps">NPS ${c.nps}</span>` : ''}<time>${esc(fecha(c.fecha))}</time></header>
      ${c.gusto ? `<p><small>Le gustó</small>${esc(c.gusto)}</p>` : ''}
      ${c.mejorar ? `<p><small>Mejoraría</small>${esc(c.mejorar)}</p>` : ''}
      ${c.telefono ? `<a class="enc-wa" target="_blank" rel="noopener" href="https://wa.me/52${esc(String(c.telefono).replace(/\D/g, '').slice(-10))}?text=${encodeURIComponent(`Hola${c.contacto ? ` ${c.contacto}` : ''}, gracias por tu comentario en la encuesta de ${club}.`)}">Pidió que lo contacten${c.contacto ? `: ${esc(c.contacto)}` : ''}</a>` : ''}
    </article>`).join('') : '<p class="enc-sin">Todavía no hay comentarios.</p>'}</div>`;
}

function pintaDetalle() {
  const e = encuestas.find(x => x.slug === elegida);
  if (!e) { $('encDetalle').innerHTML = ''; return; }
  const url = liga(e.slug), r = resultado ? resumen(resultado) : null;
  const kpi = (v, t, extra = '') => `<article${extra}><b>${v}</b><span>${t}</span></article>`;
  $('encDetalle').innerHTML = `
  <section class="enc-liga">
    <canvas id="encQr" width="132" height="132" aria-label="Código QR de la encuesta"></canvas>
    <div class="enc-liga-txt"><small>${e.visitorClub ? `${esc(e.title)} · ${esc(e.visitorClub)}` : esc(e.title)}</small><strong>${esc(url.replace(/^https?:\/\//, ''))}</strong>
      <div class="enc-liga-btns"><button type="button" id="encCopiar">Copiar liga</button>
        <a target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(mensajeDeEncuesta(club, e.title, url))}">WhatsApp</a>
        <button type="button" id="encQrBajar">Bajar QR</button><a href="${esc(url)}" target="_blank" rel="noopener">Ver encuesta</a>
        ${e.registrada ? `<button type="button" id="encAbrir" class="sec">${e.open ? 'Cerrar encuesta' : 'Volver a abrir'}</button>` : ''}</div>
    </div>
  </section>
  ${!r ? '<p class="enc-cargando">Cargando resultados…</p>' : !r.total ? `<section class="enc-panel enc-vacio"><b>Todavía no hay respuestas</b>Comparte la liga o imprime el QR para la mesa de la tienda y la salida. Los resultados aparecen aquí solos.</section>` : `
  <div class="enc-kpis">
    ${kpi(r.total, 'Respuestas')}
    ${r.tipos.map(k => kpi(resultado.porTipo[k], esc(nombreTipo(k)), ` style="--c:${COLOR[k]}" class="tipo"`)).join('')}
    ${kpi(r.general == null ? '—' : uno(r.general), 'Promedio general')}
    ${kpi(r.nps.score == null ? '—' : `${r.nps.score > 0 ? '+' : ''}${r.nps.score}`, 'NPS')}
  </div>
  ${Object.keys(resultado.porVisita || {}).length ? `<p class="enc-visita"><b>Vinieron a:</b> ${VISITAS.filter(v => resultado.porVisita[v.k]).map(v => `<span>${esc(v.t)} <i>${resultado.porVisita[v.k]}</i></span>`).join('')}</p>` : ''}
  ${r.total < 20 ? `<p class="enc-aviso">Con ${r.total} ${r.total === 1 ? 'respuesta' : 'respuestas'} todavía es temprano: con menos de 20 por grupo, una sola opinión mueve mucho el promedio.</p>` : ''}
  ${conclusiones(r)}
  <section class="enc-panel"><h2>Calificación por tema</h2><p class="enc-ayuda">Promedio de 1 (muy mal) a 5 (excelente). Toca una barra para ver cuántos votaron.</p>${graficaTemas(r)}
    <details class="enc-tabla"><summary>Ver como tabla</summary><table><thead><tr><th>Tema</th><th>General</th>${r.tipos.map(k => `<th>${esc(nombreTipo(k))}</th>`).join('')}<th>Votos</th></tr></thead>
      <tbody>${r.temas.map(t => `<tr><td>${esc(t.t)}</td><td>${uno(t.promedio)}</td>${r.tipos.map(k => `<td>${uno(t.porTipo[k]?.promedio)}</td>`).join('')}<td>${t.n}</td></tr>`).join('')}</tbody></table></details>
  </section>
  ${porCategoria(resultado.porCategoria)}
  <section class="enc-panel"><h2>¿Nos recomendarían?</h2><p class="enc-ayuda">NPS: % de promotores (9 y 10) menos % de detractores (0 a 6). Arriba de +50 es excelente.</p>
    <div class="enc-nps-ley"><span><i class="det"></i>Detractores 0–6</span><span><i class="pas"></i>Pasivos 7–8</span><span><i class="pro"></i>Promotores 9–10</span></div>
    ${barraNps(r.nps, 'Todos')}${r.tipos.length > 1 ? r.tipos.map(k => barraNps(r.npsPorTipo[k], nombreTipo(k))).join('') : ''}
  </section>
  <section class="enc-panel"><h2>Lo que dijeron</h2>${comentarios(resultado.comentarios || [])}</section>`}`;
  pintaQr($('encQr'), url, 264).catch(() => $('encQr').classList.add('hidden'));
  $('encCopiar').onclick = async () => { try { await navigator.clipboard.writeText(url); $('encCopiar').textContent = 'Copiada'; } catch { $('encCopiar').textContent = 'Selecciona y copia'; } };
  $('encQrBajar').onclick = async () => {
    const c = document.createElement('canvas');
    try { await pintaQr(c, url, 1200); } catch { msg('No se pudo generar el QR.'); return; }
    const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = `qr-encuesta-${e.slug}.png`; a.click();
  };
  if ($('encAbrir')) $('encAbrir').onclick = async () => {
    try { await rpc('v2_set_survey_open', { organization_id: org, survey: e.slug, open: !e.open }); e.open = !e.open; pintaLista(); pintaDetalle(); msg(e.open ? 'La encuesta vuelve a recibir respuestas.' : 'Encuesta cerrada: ya no recibe respuestas.', 'success'); }
    catch (err) { msg(err.message || 'No se pudo cambiar.'); }
  };
  if ($('encCsv')) $('encCsv').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csvDeComentarios(resultado.comentarios)], { type: 'text/csv;charset=utf-8' }));
    a.download = `encuesta-${e.slug}-comentarios.csv`; a.click();
  };
}

async function elige(slug) {
  elegida = slug; resultado = null; filtroCom = 'todos';
  history.replaceState(null, '', slug ? `?e=${encodeURIComponent(slug)}` : location.pathname);
  pintaLista(); pintaDetalle();
  try { resultado = await rpc('v2_survey_results', { organization_id: org, survey: slug }); }
  catch (err) { msg(err.message || 'No se pudieron leer los resultados.'); return; }
  if (slug === elegida) pintaDetalle();
}

async function carga(slug) {
  try { encuestas = await rpc('v2_surveys', { organization_id: org }) || []; }
  catch (e) { $('encDenied').classList.remove('hidden'); $('encNuevaBtn').classList.add('hidden'); setShellHealth({ state: 'attention', label: 'Sin permiso' }); return; }
  setShellHealth({ state: 'ok', label: `${encuestas.length} ${encuestas.length === 1 ? 'encuesta' : 'encuestas'}` });
  const destino = slug || (encuestas.some(x => x.slug === elegida) ? elegida : encuestas[0]?.slug || '');
  if (destino) await elige(destino); else { pintaLista(); pintaDetalle(); }
}

$('encLista').addEventListener('click', e => { const b = e.target.closest('[data-slug]'); if (b && b.dataset.slug !== elegida) elige(b.dataset.slug); });
$('encDetalle').addEventListener('click', e => { const b = e.target.closest('[data-com]'); if (b) { filtroCom = b.dataset.com; pintaDetalle(); } });
$('encNuevaBtn').addEventListener('click', () => { $('encNueva').classList.remove('hidden'); $('encTitulo').focus(); });
$('encCancelar').addEventListener('click', () => $('encNueva').classList.add('hidden'));
$('encNueva').addEventListener('submit', async e => {
  e.preventDefault(); msg();
  const title = $('encTitulo').value.trim();
  if (!title) { msg('Ponle nombre a la encuesta.'); return; }
  const btn = $('encCrear'); btn.disabled = true;
  try {
    const r = await rpc('v2_create_survey', { organization_id: org, title, visitor_club: $('encVisita').value.trim() || null });
    $('encNueva').reset(); $('encNueva').classList.add('hidden');
    await carga(r.slug);
    msg('Lista. Comparte la liga o baja el QR.', 'success');
  } catch (err) { msg(err.message || 'No se pudo crear.'); }
  finally { btn.disabled = false; }
});

await carga();
// El botón + del menú llega con ?nueva=1.
if (pide.has('nueva')) $('encNuevaBtn').click();
