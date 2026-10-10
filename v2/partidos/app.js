/* PARTIDOS (Presidencia, 09/10/2026).
 *
 * "Cuando juguemos partidos, que anoten quién jugó, quién asistió, quién
 * metió gol, quién dio asistencia, el marcador, contra quién y qué liga, con
 * un UX fácil para los profes."
 *
 * Mismo patrón que la lista de asistencia:
 *   · Nuevo partido: categoría, rival, tipo y local/visita. Cuatro toques.
 *   · Convocados: todos de entrada; se toca a quien no va.
 *   · Quién jugó: todos con "medio tiempo +" de entrada; un toque lo pasa a
 *     "poco" y otro a "no jugó". "No llegó" y tarjetas, en "···".
 *   · + Gol: quién lo metió y quién asistió, con sus caras. Tres toques.
 *   · Estadísticas: récord, goleadores, asistencias, quién juega poco y
 *     quién no ha jugado.
 *
 * El servidor (j3) guarda todo de un golpe: v2_save_match_sheet.
 */
import { createClient } from '/v2/supabase-client.js';
import { getSignedPhotoUrls } from '/v2/photo-cache.js';
import { TIPOS, TIEMPOS, jugo, siguienteTiempo, resultado, cuentaPorJugador, participaEnGoles,
         preparaPlantel, hojaParaGuardar, goleadores, juegaPoco, sinJugar } from '/v2/partidos/partido.js';

const supabase = createClient('https://pacnegivzgxpanphrnwp.supabase.co', 'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',
  { auth: { persistSession: true, autoRefreshToken: true } });
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const hoyIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const fechaCorta = iso => new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${iso}T12:00:00`)).replace(/\./g, '');
const primerNombre = n => String(n || '').trim().split(/\s+/)[0] || 'Tanner';
const iniciales = n => String(n || '').split(/\s+/).slice(0, 2).map(x => x[0] || '').join('').toUpperCase() || 'TC';
const ERRORES = {
  'Not authorized': 'Tu rol no puede capturar partidos.', 'Opponent required': 'Escribe contra quién juegan.',
  'Category required': 'Elige la categoría.', 'Goal by a player who did not play': 'Un gol quedó a nombre de alguien que no jugó.',
  'Scorer cannot assist himself': 'El que metió el gol no puede dar su propia asistencia.', 'Match not found': 'No encontramos ese partido.'
};
const amable = e => ERRORES[String(e?.message || e)] || String(e?.message || 'No pudimos guardar.');

let ctx = null, tablero = null, tab = 'partidos';
let P = null; // el partido abierto: {partido, plantel, goles, golesContra, vista, sucio, canWrite}
const caras = new Map();

function show(id) { ['loadingView', 'deniedView', 'view'].forEach(v => $(v)?.classList.toggle('hidden', v !== id)); }
async function rpc(name, params = {}) { const { data, error } = await supabase.rpc(name, params); if (error) throw error; return data; }
function msg(id, t = '', tipo = 'error') { const e = $(id); if (!e) return; e.textContent = t; e.dataset.type = tipo; e.classList.toggle('hidden', !t); }

async function boot() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { location.href = '/'; return; }
  const rows = await rpc('v2_my_context');
  if (!rows?.length) { show('deniedView'); return; }
  ctx = rows[0];
  $('orgName').textContent = ctx.organization_name || 'Tannery City FC';
  $('roleBadge').textContent = ctx.is_owner ? 'Presidencia' : ctx.role;
  try { tablero = await rpc('v2_match_board', { organization_id: ctx.organization_id }); }
  catch (e) { show('deniedView'); return; }
  $('ptNuevo').classList.toggle('hidden', !tablero.canWrite);
  show('view');
  pintaLista();
}

async function recarga() { tablero = await rpc('v2_match_board', { organization_id: ctx.organization_id }); pintaLista(); }

// === Lista de partidos ===
function tarjetaPartido(m) {
  const fin = m.status === 'completed', r = resultado(m.goalsFor, m.goalsAgainst);
  const f = new Date(`${m.date}T12:00:00`);
  return `<button type="button" class="pt-partido-fila${fin ? ' fin' : ''}" data-id="${esc(m.id)}">
    <span class="pt-fecha"><b>${f.getDate()}</b><small>${esc(f.toLocaleDateString('es-MX', { month: 'short' }).replace('.', ''))}</small></span>
    <span class="pt-fila-txt"><strong>${esc(m.category || '')} <i>vs</i> ${esc(m.opponent || '')}</strong>
      <small>${esc([m.tournament, m.venue === 'local' ? 'Local' : m.venue === 'visita' ? 'Visita' : null].filter(Boolean).join(' · ') || 'Partido')}</small></span>
    ${fin ? `<span class="pt-score pt-${r.nivel}"><b>${Number(m.goalsFor || 0)}<i>-</i>${Number(m.goalsAgainst || 0)}</b><small>${r.letra}</small></span>`
          : `<span class="pt-pend">${Number(m.called) ? `${Number(m.called)} convocados` : 'Por jugar'}</span>`}
  </button>`;
}
function pintaLista() {
  const ms = tablero?.matches || [];
  const prox = ms.filter(m => m.status === 'scheduled').sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const jug = ms.filter(m => m.status === 'completed');
  $('ptProximosBloque').classList.toggle('hidden', !prox.length);
  $('ptProximos').innerHTML = prox.map(tarjetaPartido).join('');
  $('ptJugados').innerHTML = jug.map(tarjetaPartido).join('') || '<p class="pt-vacio">Aún no hay resultados.</p>';
  $('ptVacio').classList.toggle('hidden', ms.length > 0);
  document.querySelectorAll('.pt-partido-fila').forEach(b => b.addEventListener('click', () => abrePartido(b.dataset.id)));
}

// === Hojas (nuevo partido, gol, opciones) ===
function abreHoja(titulo, html) {
  $('hjTitulo').textContent = titulo; $('hjCuerpo').innerHTML = html;
  $('hjFondo').classList.remove('hidden'); $('hjHoja').classList.remove('hidden');
}
function cierraHoja() { $('hjFondo').classList.add('hidden'); $('hjHoja').classList.add('hidden'); }

/* El formulario de datos del partido: el mismo para crear y para editar. */
function formularioPartido(previo) {
  const editar = Boolean(previo);
  const cats = [...(tablero?.categories || [])].sort((a, b) => Number(b.mine) - Number(a.mine));
  const mias = cats.filter(c => c.mine);
  const tipoPrevio = previo?.tournament || '';
  const esOtra = editar && tipoPrevio && !TIPOS.includes(tipoPrevio);
  const sel = editar
    ? { category: previo.category || '', tournament: esOtra ? '__otra' : (tipoPrevio || TIPOS[0]), venue: previo.venue || 'local' }
    : { category: mias.length === 1 ? mias[0].name : '', tournament: TIPOS[0], venue: 'local' };
  abreHoja(editar ? 'Editar partido' : 'Nuevo partido', `
    <p class="hj-et">Categoría</p><div class="hj-chips" id="nvCat">${cats.map(c => `<button type="button" data-v="${esc(c.name)}">${esc(c.name)}</button>`).join('')}</div>
    <label class="hj-campo">Contra quién<input id="nvRival" list="nvRivales" maxlength="80" placeholder="Nombre del rival" autocomplete="off" value="${esc(previo?.opponent || '')}"></label>
    <datalist id="nvRivales">${(tablero?.opponents || []).map(o => `<option value="${esc(o)}">`).join('')}</datalist>
    <p class="hj-et">Tipo de partido</p><div class="hj-chips" id="nvTipo">${TIPOS.map(t => `<button type="button" data-v="${esc(t)}">${esc(t)}</button>`).join('')}<button type="button" data-v="__otra">Otra</button></div>
    <input id="nvOtra" class="hj-otra${esOtra ? '' : ' hidden'}" maxlength="60" placeholder="¿Cuál?" value="${esc(esOtra ? tipoPrevio : '')}">
    <div class="hj-dos">
      <div><p class="hj-et">Dónde</p><div class="hj-chips" id="nvSede"><button type="button" data-v="local">Local</button><button type="button" data-v="visita">Visita</button></div></div>
      <label class="hj-campo">Fecha<input id="nvFecha" type="date" value="${esc(previo?.date || hoyIso())}"></label>
    </div>
    <div id="nvMsg" class="inline-message hidden"></div>
    <button type="button" id="nvCrear" class="pt-terminar-hoja">${editar ? 'Guardar cambios' : 'Crear partido'}</button>`);
  const marca = (box, v) => $(box).querySelectorAll('[data-v]').forEach(b => b.classList.toggle('activo', b.dataset.v === v));
  marca('nvCat', sel.category); marca('nvTipo', sel.tournament); marca('nvSede', sel.venue);
  $('nvCat').onclick = e => { const b = e.target.closest('[data-v]'); if (b) { sel.category = b.dataset.v; marca('nvCat', sel.category); } };
  $('nvSede').onclick = e => { const b = e.target.closest('[data-v]'); if (b) { sel.venue = b.dataset.v; marca('nvSede', sel.venue); } };
  $('nvTipo').onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; sel.tournament = b.dataset.v; marca('nvTipo', sel.tournament); $('nvOtra').classList.toggle('hidden', sel.tournament !== '__otra'); if (sel.tournament === '__otra') $('nvOtra').focus(); };
  $('nvCrear').onclick = async () => {
    const rival = $('nvRival').value.trim(), tipo = sel.tournament === '__otra' ? $('nvOtra').value.trim() : sel.tournament;
    if (!sel.category) { msg('nvMsg', 'Elige la categoría.'); return; }
    if (rival.length < 2) { msg('nvMsg', 'Escribe contra quién juegan.'); return; }
    const datos = { date: $('nvFecha').value || hoyIso(), category: sel.category, opponent: rival, tournament: tipo || null, venue: sel.venue };
    if (editar) { await guardaDatos(datos); return; }
    $('nvCrear').disabled = true; $('nvCrear').textContent = 'Creando…';
    try {
      const id = await rpc('v2_save_match_sheet', { organization_id: ctx.organization_id, sheet: { ...datos, status: 'scheduled', goalsAgainst: 0, goals: [], players: [] } });
      cierraHoja(); await recarga(); await abrePartido(id);
    } catch (e) { msg('nvMsg', amable(e)); $('nvCrear').disabled = false; $('nvCrear').textContent = 'Crear partido'; }
  };
}
const nuevoPartido = () => formularioPartido(null);

/* Editar los datos de un partido ya creado. Cambiar de categoría deja la
   convocatoria y los goles en blanco: eran de otros Tanners. */
async function guardaDatos(datos) {
  const cambiaCat = String(datos.category).toLowerCase() !== String(P.partido.category).toLowerCase();
  const conAlgo = P.goles.length || P.plantel.some(p => p.called) && P.partido.saved;
  if (cambiaCat && conAlgo && !window.confirm(`Al cambiar a ${datos.category} se borran los convocados y los goles de este partido. ¿Seguir?`)) return;
  const btn = $('nvCrear'); btn.disabled = true; btn.textContent = 'Guardando…';
  try {
    const partido = { ...P.partido, ...datos };
    const plantel = cambiaCat ? P.plantel.map(p => ({ ...p, called: false })) : P.plantel;
    const goles = cambiaCat ? [] : P.goles;
    const sheet = hojaParaGuardar({ partido, plantel, goles, golesContra: cambiaCat ? 0 : P.golesContra, estado: P.partido.status });
    // Si el partido nunca se ha guardado con convocados, no se manda la lista:
    // así no se guarda una convocatoria que nadie ha revisado.
    if (!P.partido.saved && !cambiaCat) sheet.players = [];
    await rpc('v2_save_match_sheet', { organization_id: ctx.organization_id, sheet });
    cierraHoja();
    await recarga();
    await abrePartido(P.partido.id);
    msg('ppMensaje', 'Datos del partido actualizados.', 'success');
  } catch (e) { msg('nvMsg', amable(e)); btn.disabled = false; btn.textContent = 'Guardar cambios'; }
}

/* "···" del partido: editar datos o eliminarlo. */
function menuPartido() {
  if (!P?.canWrite) return;
  abreHoja(`${P.partido.category} vs ${P.partido.opponent}`, `
    <button type="button" id="mnEditar" class="hj-accion">Editar datos del partido<small>Rival, tipo, local o visita, fecha y categoría</small></button>
    <button type="button" id="mnEliminar" class="hj-accion hj-peligro">Eliminar partido<small>Se quita de la lista y de las estadísticas</small></button>
    <button type="button" id="mnCancelar" class="secondary hj-listo">Cancelar</button>`);
  $('mnEditar').onclick = () => formularioPartido(P.partido);
  $('mnCancelar').onclick = cierraHoja;
  $('mnEliminar').onclick = async () => {
    const m = P.partido;
    if (!window.confirm(`¿Eliminar ${m.category} vs ${m.opponent} (${fechaCorta(m.date)})? Se quita de la lista y de las estadísticas.`)) return;
    try {
      await rpc('v2_archive_match', { organization_id: ctx.organization_id, match_id: m.id });
      cierraHoja(); cierraPartido(true); await recarga();
      msg('ptMensaje', `Partido eliminado: ${m.category} vs ${m.opponent}.`, 'success');
    } catch (e) { cierraHoja(); msg('ppMensaje', amable(e)); }
  };
}

// === El partido ===
async function abrePartido(id) {
  msg('ptMensaje');
  let d;
  try { d = await rpc('v2_match_sheet', { organization_id: ctx.organization_id, match_id: id }); }
  catch (e) { msg('ptMensaje', amable(e)); return; }
  const m = d.match;
  P = { partido: m, plantel: preparaPlantel(d.roster, m.saved), goles: [...(m.goals || [])], golesContra: Number(m.goalsAgainst || 0),
        vista: m.saved ? 'juego' : 'conv', sucio: !m.saved && d.canWrite, canWrite: Boolean(d.canWrite) };
  $('ppTitulo').textContent = `${m.category} vs ${m.opponent}`;
  $('ppMeta').textContent = [fechaCorta(m.date), m.tournament, m.venue === 'local' ? 'Local' : m.venue === 'visita' ? 'Visita' : null].filter(Boolean).join(' · ');
  $('ppRival').textContent = m.opponent;
  ['ppGol', 'ppGAmas', 'ppGAmenos', 'ppGuardar', 'ppTerminar', 'ppMenu'].forEach(x => $(x).classList.toggle('hidden', !P.canWrite));
  $('ppHerr').classList.toggle('hidden', !P.canWrite);
  msg('ppMensaje');
  $('ptFondo').classList.remove('hidden'); $('ptPartido').classList.remove('hidden'); $('ptPartido').setAttribute('aria-hidden', 'false');
  document.body.classList.add('drawer-open');
  pintaPartido();
  firmaCaras(P.plantel).then(() => P && pintaEstampas());
}

function cierraPartido(forzar = false) {
  if (!forzar && P?.sucio && P.canWrite && !window.confirm('El partido no se ha guardado. ¿Salir sin guardar?')) return;
  P = null; cierraHoja();
  $('ptFondo').classList.add('hidden'); $('ptPartido').classList.add('hidden'); $('ptPartido').setAttribute('aria-hidden', 'true');
  document.body.classList.remove('drawer-open');
}

const cambia = () => { P.sucio = true; pintaPartido(); };

function pintaPartido() {
  if (!P) return;
  $('ppGF').textContent = P.goles.length;
  $('ppGA').textContent = P.golesContra;
  const porId = new Map(P.plantel.map(p => [p.playerId, p]));
  $('ppGoles').innerHTML = P.goles.map((g, i) => `<span class="pp-golchip">${esc(g.scorer ? primerNombre(porId.get(g.scorer)?.name) : 'Sin dato')}${g.assist ? `<small>asist. ${esc(primerNombre(porId.get(g.assist)?.name))}</small>` : ''}${P.canWrite ? `<button type="button" data-quita="${i}" aria-label="Quitar gol">&times;</button>` : ''}</span>`).join('');
  $('ppGoles').querySelectorAll('[data-quita]').forEach(b => b.addEventListener('click', () => { P.goles.splice(Number(b.dataset.quita), 1); cambia(); }));
  const conv = P.plantel.filter(p => p.called);
  $('ppNConv').textContent = conv.length;
  $('ppNJugo').textContent = conv.filter(p => jugo(p.tiempo)).length;
  $('ppTabConv').classList.toggle('activo', P.vista === 'conv');
  $('ppTabJuego').classList.toggle('activo', P.vista === 'juego');
  $('ppHerr').classList.toggle('hidden', !P.canWrite || P.vista !== 'conv');
  $('ppAyuda').textContent = !P.canWrite ? 'Sólo lectura.'
    : P.vista === 'conv' ? 'Toca a quien no va al partido.'
    : 'Todos jugaron medio tiempo o más. Toca para cambiar; "···" para no llegó y tarjetas.';
  const fin = P.partido.status === 'completed';
  $('ppTerminar').textContent = fin ? 'Guardar resultado' : 'Terminar partido';
  $('ppGuardar').classList.toggle('hidden', !P.canWrite || fin);
  pintaEstampas();
}

function pintaEstampas() {
  if (!P) return;
  const cuenta = cuentaPorJugador(P.goles);
  const lista = P.vista === 'conv' ? P.plantel : P.plantel.filter(p => p.called);
  $('ppEstampas').innerHTML = lista.map(p => {
    const u = caras.get(p.playerId), c = cuenta.get(p.playerId);
    const estado = P.vista === 'conv' ? (p.called ? 'va' : 'nova') : p.tiempo;
    const etq = P.vista === 'conv' ? (p.called ? 'Convocado' : 'No va') : TIEMPOS[p.tiempo]?.corta;
    const extras = [c?.goles ? `${c.goles} G` : '', c?.asist ? `${c.asist} A` : '', Number(p.yellow) ? `${p.yellow} TA` : '', Number(p.red) ? 'TR' : ''].filter(Boolean).join(' · ');
    return `<article class="pp-estampa st-${esc(estado)}">
      <button type="button" class="pp-toque" data-id="${esc(p.playerId)}"${P.canWrite ? '' : ' disabled'}>
        <span class="pp-cara">${u ? `<img src="${esc(u)}" alt="" loading="lazy">` : `<span>${esc(iniciales(p.name))}</span>`}${p.number ? `<em>${esc(p.number)}</em>` : ''}</span>
        <span class="pp-nombre"><strong>${esc(primerNombre(p.name))}</strong><small>${esc(String(p.name).split(/\s+/)[1] || '')}</small></span>
        ${extras ? `<span class="pp-extras">${esc(extras)}</span>` : ''}
        <span class="pp-estado">${esc(etq)}</span>
      </button>
      ${P.canWrite && P.vista === 'juego' ? `<button type="button" class="pp-mas" data-mas="${esc(p.playerId)}" aria-label="Más opciones de ${esc(p.name)}"><i></i><i></i><i></i></button>` : ''}
    </article>`;
  }).join('') || '<p class="pt-vacio">Nadie convocado todavía.</p>';
  $('ppEstampas').querySelectorAll('.pp-toque').forEach(b => b.addEventListener('click', () => tocaJugador(b.dataset.id)));
  $('ppEstampas').querySelectorAll('[data-mas]').forEach(b => b.addEventListener('click', () => opcionesJugador(b.dataset.mas)));
}

function tocaJugador(id) {
  if (!P?.canWrite) return;
  const p = P.plantel.find(x => x.playerId === id); if (!p) return;
  if (P.vista === 'conv') {
    if (p.called && participaEnGoles(P.goles, id)) { msg('ppMensaje', `${primerNombre(p.name)} tiene goles o asistencias. Quítalos primero.`); return; }
    p.called = !p.called; if (p.called) p.tiempo = 'medio';
  } else {
    const sig = siguienteTiempo(p.tiempo);
    if (!jugo(sig) && participaEnGoles(P.goles, id)) { msg('ppMensaje', `${primerNombre(p.name)} tiene goles o asistencias. Quítalos primero.`); return; }
    p.tiempo = sig;
  }
  msg('ppMensaje');
  try { navigator.vibrate?.(8); } catch {}
  cambia();
}

function opcionesJugador(id) {
  const p = P.plantel.find(x => x.playerId === id); if (!p) return;
  abreHoja(p.name, `
    <div class="hj-opciones">${Object.entries(TIEMPOS).map(([k, t]) => `<button type="button" data-t="${k}" class="op-${k}${p.tiempo === k ? ' activo' : ''}"><i></i>${esc(t.etiqueta)}</button>`).join('')}</div>
    <div class="hj-tarjetas">
      <div><span>Amarillas</span><button type="button" data-am="-1" aria-label="Quitar amarilla">−</button><b id="hjAm">${Number(p.yellow || 0)}</b><button type="button" data-am="1" aria-label="Agregar amarilla">+</button></div>
      <button type="button" id="hjRoja" class="hj-roja${Number(p.red) ? ' activo' : ''}">Roja</button>
    </div>
    <div id="hjMsg" class="inline-message hidden"></div>
    <button type="button" id="hjListo" class="secondary hj-listo">Listo</button>`);
  $('hjCuerpo').querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => {
    if (!jugo(b.dataset.t) && participaEnGoles(P.goles, id)) { msg('hjMsg', 'Tiene goles o asistencias. Quítalos primero.'); return; }
    p.tiempo = b.dataset.t; cierraHoja(); cambia();
  }));
  $('hjCuerpo').querySelectorAll('[data-am]').forEach(b => b.addEventListener('click', () => { p.yellow = Math.max(0, Math.min(2, Number(p.yellow || 0) + Number(b.dataset.am))); $('hjAm').textContent = p.yellow; P.sucio = true; }));
  $('hjRoja').addEventListener('click', () => { p.red = Number(p.red) ? 0 : 1; $('hjRoja').classList.toggle('activo', Boolean(p.red)); P.sucio = true; });
  $('hjListo').addEventListener('click', () => { cierraHoja(); pintaPartido(); });
}

// + Gol: quién lo metió, luego quién asistió. Tres toques.
function rejillaCaras(lista, extra) {
  return `<div class="hj-caras">${lista.map(p => { const u = caras.get(p.playerId); return `<button type="button" data-p="${esc(p.playerId)}"><span class="pp-cara">${u ? `<img src="${esc(u)}" alt="">` : `<span>${esc(iniciales(p.name))}</span>`}</span><small>${esc(primerNombre(p.name))}</small></button>`; }).join('')}</div>
    <button type="button" class="secondary hj-sin" data-p="">${esc(extra)}</button>`;
}
function golNuestro() {
  const jugaron = P.plantel.filter(p => p.called && jugo(p.tiempo));
  abreHoja('¿Quién metió el gol?', rejillaCaras(jugaron, 'Sin dato o autogol del rival'));
  $('hjCuerpo').querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => {
    const scorer = b.dataset.p || null;
    if (!scorer) { P.goles.push({ scorer: null, assist: null }); cierraHoja(); cambia(); return; }
    abreHoja('¿Quién dio la asistencia?', rejillaCaras(jugaron.filter(p => p.playerId !== scorer), 'Sin asistencia'));
    $('hjCuerpo').querySelectorAll('[data-p]').forEach(x => x.addEventListener('click', () => {
      P.goles.push({ scorer, assist: x.dataset.p || null }); cierraHoja(); cambia();
    }));
  }));
}

async function guardar(estado) {
  if (!P?.canWrite) return;
  msg('ppMensaje');
  const sheet = hojaParaGuardar({ partido: P.partido, plantel: P.plantel, goles: P.goles, golesContra: P.golesContra, estado });
  const btn = estado === 'completed' ? $('ppTerminar') : $('ppGuardar'), txt = btn.textContent;
  btn.disabled = true; btn.textContent = 'Guardando…';
  try {
    await rpc('v2_save_match_sheet', { organization_id: ctx.organization_id, sheet });
    P.partido.status = estado; P.sucio = false;
    await recarga();
    if (estado === 'completed') {
      const r = resultado(P.goles.length, P.golesContra);
      msg('ppMensaje', `${r.texto} ${P.goles.length}-${P.golesContra}. Quedó guardado.`, 'success');
    } else msg('ppMensaje', 'Guardado.', 'success');
    pintaPartido();
  } catch (e) { msg('ppMensaje', amable(e)); }
  finally { btn.disabled = false; if (btn.textContent === 'Guardando…') btn.textContent = txt; pintaPartido(); }
}

async function firmaCaras(lista) {
  const porBucket = {};
  (lista || []).forEach(p => { if (p.thumb && !caras.has(p.playerId)) (porBucket[p.bucket || 'tanneros-private'] ??= []).push(p); });
  try {
    for (const b of Object.keys(porBucket)) {
      const mapa = await getSignedPhotoUrls(supabase, b, porBucket[b].map(p => p.thumb));
      porBucket[b].forEach(p => { if (mapa[p.thumb]) caras.set(p.playerId, mapa[p.thumb]); });
    }
  } catch { /* quedan las iniciales */ }
}

// === Estadísticas ===
const PERIODOS = [
  { clave: 'mes', etiqueta: 'Este mes', desde: () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`; } },
  { clave: 'tres', etiqueta: '3 meses', desde: () => { const d = new Date(); d.setMonth(d.getMonth() - 2, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`; } },
  { clave: 'anio', etiqueta: 'Este año', desde: () => `${new Date().getFullYear()}-01-01` }
];
let stPeriodo = 'anio', stCat = '';
function pintaFiltrosStats() {
  $('stPeriodos').innerHTML = PERIODOS.map(p => `<button type="button" data-p="${p.clave}" class="${p.clave === stPeriodo ? 'activo' : ''}">${p.etiqueta}</button>`).join('');
  $('stCats').innerHTML = [{ name: '' }, ...(tablero?.categories || [])].map(c => `<button type="button" data-c="${esc(c.name)}" class="${c.name === stCat ? 'activo' : ''}">${esc(c.name || 'Todas')}</button>`).join('');
  $('stPeriodos').querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => { stPeriodo = b.dataset.p; pintaFiltrosStats(); cargaStats(); }));
  $('stCats').querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => { stCat = b.dataset.c; pintaFiltrosStats(); cargaStats(); }));
}
async function cargaStats() {
  const desde = PERIODOS.find(p => p.clave === stPeriodo).desde();
  let d;
  try { d = await rpc('v2_match_stats', { organization_id: ctx.organization_id, from_date: desde, to_date: hoyIso(), category: stCat || null }); }
  catch (e) { msg('ptMensaje', amable(e)); return; }
  const r = d.record || {};
  $('stJugados').textContent = Number(r.played || 0);
  $('stG').textContent = Number(r.won || 0); $('stE').textContent = Number(r.drawn || 0); $('stP').textContent = Number(r.lost || 0);
  $('stGoles').textContent = `${Number(r.goalsFor || 0)}:${Number(r.goalsAgainst || 0)}`;
  const js = d.players || [];
  await firmaCaras(js.map(j => ({ ...j, playerId: j.playerId })));
  const fila = (j, valor, nota) => { const u = caras.get(j.playerId); return `<div class="pt-top-fila"><span class="pp-cara">${u ? `<img src="${esc(u)}" alt="">` : `<span>${esc(iniciales(j.name))}</span>`}</span><span class="pt-top-txt"><strong>${esc(j.name)}</strong><small>${esc(j.categoryName || '')}${nota ? ` · ${esc(nota)}` : ''}</small></span><b>${esc(valor)}</b></div>`; };
  const vacio = t => `<p class="pt-vacio">${t}</p>`;
  $('stGoleadores').innerHTML = goleadores(js).map(j => fila(j, j.goals, `${j.played} partidos`)).join('') || vacio('Sin goles registrados todavía.');
  $('stAsist').innerHTML = goleadores(js, 'assists').map(j => fila(j, j.assists, `${j.played} partidos`)).join('') || vacio('Sin asistencias registradas todavía.');
  $('stPoco').innerHTML = juegaPoco(js).map(j => fila(j, `${j.half}/${j.llego}`, 'medio tiempo')).join('') || vacio('Todos están jugando medio tiempo o más.');
  const sin = sinJugar(js);
  $('stSin').innerHTML = sin.length ? sin.map(j => `<span>${esc(j.name)}<small>${esc(j.categoryName || '')}</small></span>`).join('') : vacio('Todos han jugado.');
  $('stPorCat').innerHTML = (d.byCategory || []).map(c => `<div><strong>${esc(c.category)}</strong><span>${c.played} PJ · <b class="g">${c.won}G</b> <b class="e">${c.drawn}E</b> <b class="p">${c.lost}P</b> · ${c.goalsFor}:${c.goalsAgainst}</span></div>`).join('') || vacio('Sin partidos en este periodo.');
}

function cambiaTab(t) {
  tab = t;
  $('tabPartidos').classList.toggle('activo', t === 'partidos'); $('tabStats').classList.toggle('activo', t === 'stats');
  $('tabPartidos').setAttribute('aria-selected', String(t === 'partidos')); $('tabStats').setAttribute('aria-selected', String(t === 'stats'));
  $('ptLista').classList.toggle('hidden', t !== 'partidos'); $('ptStats').classList.toggle('hidden', t !== 'stats');
  if (t === 'stats') { pintaFiltrosStats(); cargaStats(); }
}

$('tabPartidos').addEventListener('click', () => cambiaTab('partidos'));
$('tabStats').addEventListener('click', () => cambiaTab('stats'));
$('ptNuevo').addEventListener('click', nuevoPartido);
$('ppCerrar').addEventListener('click', () => cierraPartido());
$('ppMenu').addEventListener('click', menuPartido);
$('ptFondo').addEventListener('click', () => cierraPartido());
$('ppTabConv').addEventListener('click', () => { P.vista = 'conv'; pintaPartido(); });
$('ppTabJuego').addEventListener('click', () => { P.vista = 'juego'; pintaPartido(); });
$('ppTodos').addEventListener('click', () => { P.plantel.forEach(p => { if (!p.called) { p.called = true; p.tiempo = 'medio'; } }); cambia(); });
$('ppNinguno').addEventListener('click', () => { P.plantel.forEach(p => { if (!participaEnGoles(P.goles, p.playerId)) p.called = false; }); cambia(); });
$('ppGol').addEventListener('click', golNuestro);
$('ppGAmas').addEventListener('click', () => { P.golesContra = Math.min(99, P.golesContra + 1); cambia(); });
$('ppGAmenos').addEventListener('click', () => { P.golesContra = Math.max(0, P.golesContra - 1); cambia(); });
$('ppGuardar').addEventListener('click', () => guardar('scheduled'));
$('ppTerminar').addEventListener('click', () => guardar('completed'));
$('hjFondo').addEventListener('click', cierraHoja);
document.addEventListener('keydown', e => { if (e.key !== 'Escape') return; if (!$('hjHoja').classList.contains('hidden')) cierraHoja(); else if (P) cierraPartido(); });
boot().catch(() => show('deniedView'));
