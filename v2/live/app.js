import { bootstrapProtectedShell, rpc, $, moduleAccess, setShellHealth } from '/v2/shell.js';
import {
  esc, motivo, DIAS, DIAS_CORTOS, REGLAS, REGLAS_VERSION, ESTADO_CAMARA, textoHorario, textoVentana, proximaVentana,
  validaGrabador, validaCamara, faltaParaEncender, NO_ENCIENDE, plantillaRtspDahua, limpiaSecretos,
  enlaceDe, mensajeWhatsApp, minutosHasta, DURACIONES
} from '/v2/live/live.js';
import { creaReproductor } from '/v2/live/reproductor.js';

// Tanner LIVE para el staff (23/11/2026). Una sola pantalla:
//   Ver          — quien tiene el módulo (lectura) y está en la audiencia.
//   Cámaras      — administradores: grabadores, cámaras, quién ve y cuándo.
//   Diagnóstico  — datos técnicos (sin contraseñas) y pruebas registradas.
//   Accesos      — tutores con acceso a cada cámara; revocar y restituir.
//   Bitácora     — todo lo que pasó en Tanner LIVE.
// Todo lo decide el servidor (v2_live_*). Si la base todavía no tiene h101,
// la pantalla lo dice en vez de reventar.
const boot = await bootstrapProtectedShell({ active: 'live', title: 'Tanner LIVE' });
if (!boot) throw new Error('No access');
const { ctx, navigation } = boot;
const ORG = ctx.organization_id;
const ADMIN = moduleAccess(navigation, 'live', true);
const TZ = 'America/Mexico_City';
const TABS = ADMIN ? [['ver', 'Ver'], ['camaras', 'Cámaras'], ['diagnostico', 'Diagnóstico'], ['accesos', 'Accesos'], ['bitacora', 'Bitácora']] : [['ver', 'Ver']];
const tabGuardada = () => { try { const t = localStorage.getItem('tos.live.tab'); return TABS.some(x => x[0] === t) ? t : 'ver'; } catch (_) { return 'ver'; } };
const state = { tab: tabGuardada(), mis: null, panel: null, camara: null, accesosDe: null, accesos: null, bitacora: null, edita: null, error: null,
  tx: { camara: null, modo: 'enlace', dura: '120', titulo: '' } };
let reproductor = null;
const body = $('liveBody');
const fecha = v => v ? new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(v)) : '';
const sinH101 = e => /could not find the function|does not exist|PGRST202/i.test(String(e?.message || e?.code || e));
const aviso = (titulo, message) => window.tosAlert({ kicker: 'TANNER LIVE', title: titulo, message });

async function carga() {
  state.error = null;
  try {
    const [mis, panel] = await Promise.all([rpc('v2_live_mis_camaras', { organization_id: ORG }), ADMIN ? rpc('v2_live_panel', { organization_id: ORG }) : null]);
    state.mis = mis || { camaras: [], terminos: { version: REGLAS_VERSION, aceptados: false }, pausado: false };
    state.panel = panel;
    if (!state.camara || !(state.mis.camaras || []).some(c => c.id === state.camara)) state.camara = state.mis.camaras?.[0]?.id || null;
    setShellHealth(state.mis.pausado ? { state: 'warn', label: 'Transmisiones en pausa' } : { state: 'ok', label: 'Todo en orden' });
  } catch (e) {
    state.error = sinH101(e) ? 'pendiente' : 'fallo';
  }
  pinta();
}

function encabezado() {
  const pausado = state.mis?.pausado;
  return `<section class="live-hero">
    <div><p class="live-eyebrow">Entrenamientos en vivo · privado</p><h1>Tanner LIVE</h1>
    <p>Sólo para tutores y staff autorizados. Sin audio, sin grabación y sólo en horario de entrenamiento.</p></div>
    ${ADMIN ? `<button type="button" class="live-panico${pausado ? ' reanuda' : ''}" data-pausa>${pausado ? 'Reanudar transmisiones' : 'Pausar todo'}</button>` : ''}
  </section>
  ${pausado ? `<p class="live-banda aviso">Todas las transmisiones están en pausa${state.panel?.ajustes?.pausa_motivo ? `: ${esc(state.panel.ajustes.pausa_motivo)}` : ''}.</p>` : ''}
  ${TABS.length > 1 ? `<nav class="live-tabs" role="tablist">${TABS.map(([k, t]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${state.tab === k}">${t}</button>`).join('')}</nav>` : ''}`;
}

function pinta() {
  if (state.error === 'pendiente') {
    body.innerHTML = `${encabezadoSimple()}<section class="live-panel"><h2>Falta activar Tanner LIVE en la base</h2>
      <p>La pantalla está lista, pero la migración <b>h101</b> todavía no se aplica. Ver <code>docs/tanner-live/README.md</code>.</p></section>`;
    return;
  }
  if (state.error) { body.innerHTML = `${encabezadoSimple()}<section class="live-panel"><h2>No pudimos cargar Tanner LIVE</h2><p>Revisa tu conexión e intenta de nuevo.</p><button type="button" class="live-b" data-recarga>Reintentar</button></section>`; body.querySelector('[data-recarga]').onclick = carga; return; }
  if (!state.mis) return;
  const vista = { ver: vistaVer, camaras: vistaCamaras, diagnostico: vistaDiagnostico, accesos: vistaAccesos, bitacora: vistaBitacora }[state.tab] || vistaVer;
  body.innerHTML = encabezado() + `<div class="live-vista">${state.tab === 'ver' && ADMIN ? transmitirHtml() : ''}${vista()}</div>`;
  body.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { state.tab = b.dataset.tab; try { localStorage.setItem('tos.live.tab', state.tab); } catch (_) {} reproductor?.detener(); reproductor = null; pinta(); if (state.tab === 'bitacora') cargaBitacora(); });
  body.querySelector('[data-pausa]')?.addEventListener('click', alternaPausa);
  if (state.tab === 'ver' && ADMIN) enlazaTransmitir();
  ({ ver: enlazaVer, camaras: enlazaCamaras, diagnostico: enlazaDiagnostico, accesos: enlazaAccesos, bitacora: () => {} }[state.tab] || enlazaVer)();
}
const encabezadoSimple = () => `<section class="live-hero"><div><p class="live-eyebrow">Entrenamientos en vivo · privado</p><h1>Tanner LIVE</h1></div></section>`;

// ------------------------------------------------------------------- Ver ----
// -------------------------------------------------------------- Transmitir ----
// Presidencia (24/11/2026): "un botón de transmitir y ya, y veo a quién le doy
// acceso". Elige cámara, quién la ve y cuánto dura. Sale el enlace para
// compartir. Se apaga sola al terminar el tiempo.
function transmitirHtml() {
  const p = state.panel || {};
  const cams = (p.camaras || []).filter(c => !c.sensible);
  const activas = p.transmisiones || [];
  const tx = state.tx;
  if (!tx.camara || !cams.some(c => c.id === tx.camara)) tx.camara = cams[0]?.id || null;
  const enVivo = activas.length ? `<div class="live-activas">${activas.map(b => {
    const enlace = b.enlace ? enlaceDe(b.enlace, location.origin) : null;
    return `<article class="live-activa"><div><strong>${esc(b.titulo || b.camara)}</strong>
      <small>${esc([b.camara, b.modo === 'enlace' ? 'Con enlace' : 'Sólo familias', `hasta las ${new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit', timeZone: TZ }).format(new Date(b.termina))}`, `${Number(b.viendo || 0)} viendo`].join(' · '))}</small>
      ${enlace ? `<code class="live-code">${esc(enlace)}</code>` : ''}</div>
      <div class="live-acciones">${enlace ? `<button type="button" class="live-b primario" data-copia="${esc(b.id)}">Copiar enlace</button>
        <a class="live-b" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(mensajeWhatsApp({ titulo: b.titulo, camara: b.camara, enlace, termina: b.termina }))}">WhatsApp</a>
        <button type="button" class="live-b sutil" data-nuevo-enlace="${esc(b.id)}">Nuevo enlace</button>` : ''}
        <button type="button" class="live-b peligro" data-detener="${esc(b.id)}">Detener</button></div></article>`;
  }).join('')}</div>` : '';
  if (!cams.length) return enVivo;
  const libres = cams.filter(c => !activas.some(b => b.camara_id === c.id));
  return `<section class="live-panel live-transmitir">
    <div class="live-cab"><h2>Transmitir</h2>${activas.length ? `<span class="live-pill vivo">${activas.length} en vivo</span>` : ''}</div>
    ${enVivo}
    ${libres.length ? `<div class="live-tx">
      <div class="live-opciones" role="radiogroup" aria-label="Cámara">${libres.map(c => `<button type="button" role="radio" aria-checked="${tx.camara === c.id}" data-tx-cam="${esc(c.id)}">${esc(c.nombre)}</button>`).join('')}</div>
      <div class="live-opciones" role="radiogroup" aria-label="Quién la ve">
        <button type="button" role="radio" aria-checked="${tx.modo === 'enlace'}" data-tx-modo="enlace">Cualquiera con el enlace</button>
        <button type="button" role="radio" aria-checked="${tx.modo === 'familias'}" data-tx-modo="familias">Sólo familias de la academia</button></div>
      <div class="live-opciones" role="radiogroup" aria-label="Cuánto tiempo">${DURACIONES.map(([k, t]) => `<button type="button" role="radio" aria-checked="${tx.dura === k}" data-tx-dura="${k}">${t}</button>`).join('')}</div>
      <label class="live-form">Nombre (opcional)<input data-tx-titulo maxlength="80" placeholder="Final Copa TCP · Renta 8 pm" value="${esc(tx.titulo)}"></label>
      <button type="button" class="live-transmitir-btn" data-transmitir>Transmitir</button>
    </div>` : ''}
  </section>`;
}

function enlazaTransmitir() {
  const tx = state.tx;
  body.querySelectorAll('[data-tx-cam]').forEach(b => b.onclick = () => { tx.camara = b.dataset.txCam; pinta(); });
  body.querySelectorAll('[data-tx-modo]').forEach(b => b.onclick = () => { tx.modo = b.dataset.txModo; pinta(); });
  body.querySelectorAll('[data-tx-dura]').forEach(b => b.onclick = () => { tx.dura = b.dataset.txDura; pinta(); });
  body.querySelector('[data-tx-titulo]')?.addEventListener('input', ev => { tx.titulo = ev.target.value; });
  body.querySelector('[data-transmitir]')?.addEventListener('click', async ev => {
    ev.currentTarget.disabled = true;
    const minutos = tx.dura === 'hasta-23' ? minutosHasta('23:00', new Date(), TZ) : Number(tx.dura);
    try {
      const r = await rpc('v2_live_transmitir', { organization_id: ORG, camera_id: tx.camara, modo: tx.modo, titulo: tx.titulo || null, minutos });
      if (r && !r.ok) { await aviso('No se pudo transmitir', NO_ENCIENDE[r.motivo] || motivo(r.motivo).texto); }
      else {
        tx.titulo = '';
        if (r?.recortada_por_academia) await aviso('Se apaga antes', 'La transmisión se apagará sola cuando empiece el horario de la academia en esa cámara.');
        if (r?.enlace) { await copia(enlaceDe(r.enlace, location.origin)); }
      }
    } catch (_) { await aviso('No se pudo transmitir', 'Intenta de nuevo.'); }
    await carga();
  });
  const buscaTx = id => (state.panel?.transmisiones || []).find(b => b.id === id);
  body.querySelectorAll('[data-copia]').forEach(b => b.onclick = () => { const t = buscaTx(b.dataset.copia); if (t?.enlace) copia(enlaceDe(t.enlace, location.origin)); });
  body.querySelectorAll('[data-detener]').forEach(b => b.onclick = async () => {
    if (!await window.tosConfirm({ kicker: 'TRANSMISIÓN', title: 'Detener transmisión', message: 'Se corta para todos los que la están viendo y el enlace deja de servir.', confirmText: 'Detener', danger: true })) return;
    try { await rpc('v2_live_detener', { organization_id: ORG, broadcast_id: b.dataset.detener }); } catch (_) { aviso('No se pudo', 'No pudimos detenerla.'); }
    await carga();
  });
  body.querySelectorAll('[data-nuevo-enlace]').forEach(b => b.onclick = async () => {
    if (!await window.tosConfirm({ kicker: 'ENLACE', title: 'Cambiar el enlace', message: 'El enlace anterior deja de servir y se corta a quien lo estaba usando. Útil si se compartió de más.', confirmText: 'Cambiar enlace' })) return;
    try { const r = await rpc('v2_live_nuevo_enlace', { organization_id: ORG, broadcast_id: b.dataset.nuevoEnlace }); if (r?.enlace) await copia(enlaceDe(r.enlace, location.origin)); }
    catch (_) { aviso('No se pudo', 'No pudimos cambiar el enlace.'); }
    await carga();
  });
}
async function copia(texto) {
  try { await navigator.clipboard.writeText(texto); await aviso('Enlace copiado', 'Pégalo en WhatsApp a quien quieras que lo vea. Se apaga solo al terminar el tiempo.'); }
  catch (_) { await window.tosPrompt({ kicker: 'ENLACE', title: 'Copia el enlace', value: texto, maxlength: 400, confirmText: 'Listo' }); }
}

function vistaVer() {
  const cams = state.mis.camaras || [];
  if (!cams.length) return `<section class="live-panel live-vacio"><h2>Sin cámaras para ti</h2><p>${ADMIN ? 'Registra la primera cámara en la pestaña Cámaras. Puedes hacerlo aunque todavía no conozcas el modelo del grabador.' : 'Cuando el club te asigne una cámara, aparecerá aquí.'}</p></section>`;
  const c = cams.find(x => x.id === state.camara) || cams[0];
  const m = motivo(c.motivo);
  const prox = proximaVentana(c.horario, new Date(), TZ);
  const terminos = !state.mis.terminos?.aceptados && c.motivo === 'sin_terminos';
  return `<div class="live-ver">
    <div class="live-lista" role="list">${cams.map(x => `<button type="button" role="listitem" class="live-chip${x.id === c.id ? ' activa' : ''}" data-cam="${esc(x.id)}"><strong>${esc(x.nombre)}</strong><small>${esc(x.cancha || textoHorario(x.horario))}</small></button>`).join('')}</div>
    <section class="live-escenario">
      <div id="liveReproductor"></div>
      <div class="live-info"><div><h2>${esc(c.nombre)}</h2><p>${esc([c.cancha, textoVentana(prox)].filter(Boolean).join(' · '))}</p></div>
        <span class="live-pill ${m.tono}">${esc(c.motivo === 'ok' ? (ESTADO_CAMARA[c.estado] || 'Lista') : m.titulo)}</span></div>
      <p class="live-nota" id="liveNota">${esc(c.motivo === 'ok' ? 'La transmisión no arranca sola: toca Reproducir.' : m.texto)}</p>
      ${terminos ? reglasHtml() : ''}
    </section></div>`;
}
const reglasHtml = () => `<div class="live-reglas"><h3>Reglas de Tanner LIVE</h3><ol>${REGLAS.map(r => `<li>${esc(r)}</li>`).join('')}</ol>
  <button type="button" class="live-b primario" data-acepta>Acepto las reglas</button></div>`;

function enlazaVer() {
  body.querySelectorAll('[data-cam]').forEach(b => b.onclick = () => { state.camara = b.dataset.cam; reproductor?.detener(); reproductor = null; pinta(); });
  body.querySelector('[data-acepta]')?.addEventListener('click', async () => {
    try { await rpc('v2_live_aceptar_terminos', { organization_id: ORG, version: state.mis.terminos?.version || REGLAS_VERSION }); await carga(); }
    catch (_) { aviso('No se guardó', 'No pudimos registrar tu aceptación. Intenta de nuevo.'); }
  });
  const cont = $('liveReproductor');
  if (!cont) return;
  const cam = (state.mis.camaras || []).find(x => x.id === state.camara) || state.mis.camaras[0];
  reproductor = creaReproductor(cont, {
    pideTicket: () => rpc('v2_live_ticket', { camera_id: cam.id }),
    alCambiar: () => {}
  });
  cont.addEventListener('live:play', async () => {
    const r = await reproductor.arranca();
    if (r && !r.ok) {
      const m = motivo(r.motivo);
      $('liveNota').textContent = m.texto;
      // Sólo el administrador puede revisar la pantalla con una señal de prueba
      // mientras no hay gateway. La familia nunca la ve.
      if (r.motivo === 'sin_gateway' && ADMIN) {
        reproductor.aviso('Cámara aún no conectada al servidor de video.');
        const ok = await window.tosConfirm({ kicker: 'SIN GATEWAY', title: 'Ver señal de prueba', message: 'Todavía no hay servidor de video. ¿Quieres revisar el reproductor con una señal de prueba? Se verá rotulada como prueba, nunca como en vivo.', confirmText: 'Ver prueba' });
        if (ok) reproductor.arranca({ modoPrueba: true });
      } else reproductor.aviso(m.titulo);
    }
  });
}

async function alternaPausa() {
  const pausado = state.mis?.pausado;
  let m = null;
  if (!pausado) {
    m = await window.tosPrompt({ kicker: 'PAUSA GENERAL', title: 'Pausar todas las transmisiones', message: 'Se cortan al instante todas las sesiones abiertas. Nadie podrá ver hasta que reanudes.', placeholder: 'Motivo (queda en la bitácora)', required: true, requiredText: 'Escribe el motivo', maxlength: 300, confirmText: 'Pausar ahora', danger: true });
    if (!m) return;
  } else if (!await window.tosConfirm({ kicker: 'TANNER LIVE', title: 'Reanudar transmisiones', message: 'Las cámaras encendidas volverán a transmitir en su horario.', confirmText: 'Reanudar' })) return;
  try { const r = await rpc('v2_live_pausa', { organization_id: ORG, pausar: !pausado, motivo: m || 'Reanudado' }); reproductor?.detener(); if (!pausado) aviso('Transmisiones en pausa', `Se cortaron ${r?.sesiones_cortadas || 0} sesiones.`); await carga(); }
  catch (_) { aviso('No se pudo', 'No pudimos cambiar la pausa. Intenta de nuevo.'); }
}

// --------------------------------------------------------------- Cámaras ----
function vistaCamaras() {
  const p = state.panel || {};
  const grab = p.grabadores || [], cams = p.camaras || [];
  if (state.edita) return formulario();
  return `<section class="live-panel"><div class="live-cab"><h2>Cámaras</h2><button type="button" class="live-b primario" data-nueva="camara">Agregar cámara</button></div>
    ${cams.length ? cams.map(c => {
      const falta = faltaParaEncender(c);
      return `<article class="live-card${c.activa ? ' encendida' : ''}">
        <header><div><strong>${esc(c.nombre)}</strong><small>${esc([c.cancha, c.canal ? `Canal ${c.canal}` : 'Canal por confirmar', c.perfil === 'main' ? 'Stream principal' : 'Substream'].filter(Boolean).join(' · '))}</small></div>
          <span class="live-pill ${c.activa ? 'ok' : 'neutro'}">${c.sensible ? 'Sensible · nunca se transmite' : c.activa ? 'Encendida' : 'Apagada'}</span></header>
        <dl class="live-datos">
          <div><dt>Quién ve</dt><dd>${esc([...(c.categorias || []), ...(c.roles || [])].join(', ') || 'Nadie todavía')}</dd></div>
          <div><dt>Horario</dt><dd>${esc(textoHorario(c.horario))}</dd></div>
          <div><dt>Gateway</dt><dd>${esc(ESTADO_CAMARA[c.estado] || c.estado)}${c.estado_al ? ` · ${esc(fecha(c.estado_al))}` : ''}${c.error ? ` · ${esc(limpiaSecretos(c.error))}` : ''}</dd></div>
          <div><dt>Permisos de imagen</dt><dd>${c.consentimiento_al ? `Revisados ${esc(fecha(c.consentimiento_al))}` : 'Sin revisar'}</dd></div>
          <div><dt>Viendo ahora</dt><dd>${Number(c.viendo || 0)}</dd></div>
        </dl>
        ${!c.activa && falta.length ? `<ul class="live-falta">${falta.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
        <div class="live-acciones">
          <button type="button" class="live-b" data-edita-cam="${esc(c.id)}">Editar</button>
          ${c.sensible ? '' : `<button type="button" class="live-b" data-consent="${esc(c.id)}">Revisar permisos de imagen</button>
          <button type="button" class="live-b ${c.activa ? 'peligro' : 'primario'}" data-activa="${esc(c.id)}" data-on="${c.activa ? '0' : '1'}">${c.activa ? 'Apagar transmisión' : 'Encender'}</button>`}
          <button type="button" class="live-b sutil" data-archiva="camara" data-id="${esc(c.id)}">Archivar</button>
        </div></article>`;
    }).join('') : '<p class="live-muted">Aún no hay cámaras. Puedes registrar una sólo con su nombre; el canal y la ruta se completan cuando se confirme el grabador.</p>'}
  </section>
  <section class="live-panel"><div class="live-cab"><h2>Grabadores</h2><button type="button" class="live-b" data-nueva="grabador">Agregar grabador</button></div>
    ${grab.length ? grab.map(g => `<article class="live-card"><header><div><strong>${esc(g.nombre)}</strong><small>${esc([g.tipo?.toUpperCase(), g.modelo || 'Modelo por confirmar', g.ip ? `${g.ip}:${g.puerto}` : 'IP por confirmar'].filter(Boolean).join(' · '))}</small></div>
      <span class="live-pill ${g.conectividad === 'alcanzable' ? 'ok' : g.conectividad === 'sin_verificar' ? 'neutro' : 'aviso'}">${esc({ sin_verificar: 'Sin verificar', alcanzable: 'Alcanzable', inalcanzable: 'Inalcanzable', error: 'Error' }[g.conectividad] || g.conectividad)}</span></header>
      <div class="live-acciones"><button type="button" class="live-b" data-edita-grab="${esc(g.id)}">Editar</button><button type="button" class="live-b sutil" data-archiva="grabador" data-id="${esc(g.id)}">Archivar</button></div></article>`).join('')
      : '<p class="live-muted">Registra el grabador Dahua aunque no conozcas su modelo. Lo completas cuando vayas al parque.</p>'}
  </section>
  ${ajustesHtml()}`;
}

function ajustesHtml() {
  const a = state.panel?.ajustes || {};
  const presi = state.panel?.presidencia;
  return `<section class="live-panel"><h2>Servidor de video</h2>
    <p class="live-muted">Dirección pública del gateway (MediaMTX con TLS). Sin gateway, ninguna cámara transmite: la pantalla lo dice tal cual.</p>
    <form class="live-form" data-ajustes>
      <label>Gateway (https)<input name="gateway" type="url" inputmode="url" placeholder="https://live.tannerycity.com" value="${esc(a.gateway || '')}" ${presi ? '' : 'disabled'}><small>${presi ? 'Sólo el origen, sin rutas ni contraseñas.' : 'Sólo Presidencia lo cambia.'}</small></label>
      <div class="live-fila"><label>Ticket para empezar (seg)<input name="ticket_seg" type="number" min="30" max="600" value="${Number(a.ticket_seg || 120)}"></label>
      <label>Sesión máxima (min)<input name="sesion_min" type="number" min="5" max="240" value="${Number(a.sesion_min || 90)}"></label></div>
      <button type="submit" class="live-b">Guardar ajustes</button>
    </form></section>`;
}

function formulario() {
  const e = state.edita, p = state.panel || {};
  if (e.tipo === 'grabador') {
    const g = e.datos || {};
    return `<section class="live-panel"><h2>${g.id ? 'Editar grabador' : 'Nuevo grabador'}</h2>
      <p class="live-muted">Sólo datos técnicos no sensibles. El usuario y la contraseña del grabador NO se escriben aquí: viven únicamente en el servidor de video.</p>
      <form class="live-form" data-form="grabador">
        <label>Nombre<input name="nombre" required maxlength="80" value="${esc(g.nombre || '')}" placeholder="Grabador del parque"></label>
        <div class="live-fila"><label>Tipo<select name="tipo">${['desconocido', 'nvr', 'xvr', 'dvr', 'ipc'].map(t => `<option value="${t}"${(g.tipo || 'desconocido') === t ? ' selected' : ''}>${{ desconocido: 'No sé todavía', nvr: 'NVR', xvr: 'XVR', dvr: 'DVR', ipc: 'Cámara IP' }[t]}</option>`).join('')}</select></label>
        <label>Modelo<input name="modelo" maxlength="80" value="${esc(g.modelo || '')}" placeholder="Ej. NVR4108HS-4KS2"></label></div>
        <div class="live-fila"><label>IP local<input name="ip" inputmode="decimal" value="${esc(g.ip || '')}" placeholder="192.168.1.108"></label>
        <label>Puerto RTSP<input name="puerto" type="number" min="1" max="65535" value="${esc(g.puerto || 554)}"></label>
        <label>Canales<input name="canales" type="number" min="1" max="256" value="${esc(g.canales || '')}"></label></div>
        <div class="live-fila"><label>Códec<select name="codec">${['desconocido', 'h264', 'h265'].map(t => `<option value="${t}"${(g.codec || 'desconocido') === t ? ' selected' : ''}>${{ desconocido: 'No sé todavía', h264: 'H.264', h265: 'H.265' }[t]}</option>`).join('')}</select></label>
        <label>Substream<select name="substream"><option value=""${g.substream == null ? ' selected' : ''}>Sin verificar</option><option value="true"${g.substream === true ? ' selected' : ''}>Disponible</option><option value="false"${g.substream === false ? ' selected' : ''}>No disponible</option></select></label>
        <label>Firmware<input name="firmware" maxlength="80" value="${esc(g.firmware || '')}"></label></div>
        <label>Notas<textarea name="notas" maxlength="500" rows="2" placeholder="Ubicación del equipo, quién lo instaló…">${esc(g.notas || '')}</textarea></label>
        <p class="live-errores" role="alert"></p>
        <div class="live-acciones"><button type="button" class="live-b" data-cancela>Cancelar</button><button type="submit" class="live-b primario">Guardar</button></div>
      </form></section>`;
  }
  const c = e.datos || { perfil: 'sub', categorias: [], roles: [], horario: [] };
  const cats = [...new Set([...(p.categorias || []), ...(c.categorias || [])])];
  const roles = [...new Set([...(p.roles || []), ...(c.roles || [])])].filter(r => r !== 'Presidencia');
  return `<section class="live-panel"><h2>${c.id ? 'Editar cámara' : 'Nueva cámara'}</h2>
    <form class="live-form" data-form="camara">
      <div class="live-fila"><label>Nombre<input name="nombre" required maxlength="60" value="${esc(c.nombre || '')}" placeholder="Cancha 1"></label>
      <label>Cancha o zona<input name="cancha" maxlength="60" value="${esc(c.cancha || '')}" placeholder="Cancha 1 · Parque"></label></div>
      <div class="live-fila"><label>Grabador<select name="grabador"><option value="">Sin asignar</option>${(p.grabadores || []).map(g => `<option value="${esc(g.id)}"${c.grabador === g.id ? ' selected' : ''}>${esc(g.nombre)}</option>`).join('')}</select></label>
      <label>Canal<input name="canal" type="number" min="1" max="256" value="${esc(c.canal || '')}" placeholder="Por confirmar"></label>
      <label>Stream<select name="perfil"><option value="sub"${c.perfil !== 'main' ? ' selected' : ''}>Substream (recomendado)</option><option value="main"${c.perfil === 'main' ? ' selected' : ''}>Principal</option></select></label></div>
      <div class="live-fila"><label>Ruta en el gateway<input name="ruta" maxlength="63" value="${esc(c.ruta || '')}" placeholder="tc-cancha-1"><small>La define quien configura el servidor de video.</small></label>
      <label>Resolución<input name="resolucion" maxlength="9" value="${esc(c.resolucion || '')}" placeholder="704x480"></label>
      <label>Códec<select name="codec">${['desconocido', 'h264', 'h265'].map(t => `<option value="${t}"${(c.codec || 'desconocido') === t ? ' selected' : ''}>${{ desconocido: 'No sé todavía', h264: 'H.264', h265: 'H.265' }[t]}</option>`).join('')}</select></label></div>
      <fieldset><legend>Quién la puede ver</legend>
        <p class="live-muted">Categorías: los tutores de esos jugadores. Roles: el staff con Tanner LIVE. Presidencia siempre puede revisar.</p>
        <div class="live-checks">${cats.map(v => `<label class="live-check"><input type="checkbox" name="categorias" value="${esc(v)}"${(c.categorias || []).includes(v) ? ' checked' : ''}>${esc(v)}</label>`).join('') || '<span class="live-muted">No hay categorías con jugadores.</span>'}</div>
        <div class="live-checks">${roles.map(v => `<label class="live-check"><input type="checkbox" name="roles" value="${esc(v)}"${(c.roles || []).includes(v) ? ' checked' : ''}>${esc(v)}</label>`).join('')}</div>
      </fieldset>
      <fieldset><legend>Horario de transmisión</legend>
        <div id="liveVentanas">${(c.horario || []).map(ventanaHtml).join('')}</div>
        <button type="button" class="live-b" data-ventana>Agregar horario</button>
      </fieldset>
      <label class="live-check"><input type="checkbox" name="sensible"${c.sensible ? ' checked' : ''}>Cámara sensible (vestidores, baños, oficinas): nunca se transmite</label>
      ${p.presidencia ? `<label class="live-check"><input type="checkbox" name="audio"${c.audio ? ' checked' : ''}>Con audio (sólo Presidencia; por defecto, sin audio)</label>` : ''}
      <p class="live-errores" role="alert"></p>
      <div class="live-acciones"><button type="button" class="live-b" data-cancela>Cancelar</button><button type="submit" class="live-b primario">Guardar</button></div>
    </form></section>`;
}
const ventanaHtml = (v = { dia: 1, de: '17:00', a: '19:00' }) => `<div class="live-ventana"><select name="dia" aria-label="Día">${DIAS.slice(1).map((d, i) => `<option value="${i + 1}"${Number(v.dia) === i + 1 ? ' selected' : ''}>${d}</option>`).join('')}</select>
  <input type="time" name="de" value="${esc(v.de)}" aria-label="Desde"><span>a</span><input type="time" name="a" value="${esc(v.a)}" aria-label="Hasta">
  <button type="button" class="live-b sutil" data-quita-ventana aria-label="Quitar horario">Quitar</button></div>`;

function leeForm(form) {
  const fd = new FormData(form), d = {};
  for (const [k, v] of fd.entries()) { if (k === 'categorias' || k === 'roles') (d[k] ||= []).push(v); else if (!['dia', 'de', 'a'].includes(k)) d[k] = typeof v === 'string' ? v.trim() : v; }
  return d;
}

function enlazaCamaras() {
  body.querySelectorAll('[data-nueva]').forEach(b => b.onclick = () => { state.edita = { tipo: b.dataset.nueva, datos: null }; pinta(); });
  body.querySelectorAll('[data-edita-cam]').forEach(b => b.onclick = () => { state.edita = { tipo: 'camara', datos: state.panel.camaras.find(c => c.id === b.dataset.editaCam) }; pinta(); });
  body.querySelectorAll('[data-edita-grab]').forEach(b => b.onclick = () => { state.edita = { tipo: 'grabador', datos: state.panel.grabadores.find(g => g.id === b.dataset.editaGrab) }; pinta(); });
  body.querySelector('[data-cancela]')?.addEventListener('click', () => { state.edita = null; pinta(); });
  body.querySelector('[data-ventana]')?.addEventListener('click', () => { $('liveVentanas').insertAdjacentHTML('beforeend', ventanaHtml()); });
  $('liveVentanas')?.addEventListener('click', ev => { if (ev.target.matches('[data-quita-ventana]')) ev.target.closest('.live-ventana').remove(); });

  body.querySelector('[data-form="grabador"]')?.addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = ev.currentTarget, d = leeForm(f);
    const err = validaGrabador(d);
    if (err.length) { f.querySelector('.live-errores').textContent = err.join(' '); return; }
    const datos = { ...d, id: state.edita?.datos?.id || null, substream: d.substream === '' ? null : d.substream === 'true' };
    try { await rpc('v2_live_guardar_grabador', { organization_id: ORG, datos }); state.edita = null; await carga(); }
    catch (e) { f.querySelector('.live-errores').textContent = 'No se guardó. Revisa los datos (IP privada, sin contraseñas).'; }
  });
  body.querySelector('[data-form="camara"]')?.addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = ev.currentTarget, d = leeForm(f);
    d.horario = [...f.querySelectorAll('.live-ventana')].map(w => ({ dia: Number(w.querySelector('[name=dia]').value), de: w.querySelector('[name=de]').value, a: w.querySelector('[name=a]').value }));
    d.sensible = f.querySelector('[name=sensible]').checked; d.audio = Boolean(f.querySelector('[name=audio]')?.checked);
    d.categorias ||= []; d.roles ||= [];
    const err = validaCamara(d);
    if (err.length) { f.querySelector('.live-errores').textContent = err.join(' '); return; }
    try {
      const r = await rpc('v2_live_guardar_camara', { organization_id: ORG, datos: { ...d, id: state.edita?.datos?.id || null } });
      state.edita = null; await carga();
      if (r?.apagada_por_cambio) aviso('Cámara apagada', 'Cambiaste quién la puede ver: se apagó y hay que revisar de nuevo los permisos de imagen antes de encenderla.');
    } catch (e) { f.querySelector('.live-errores').textContent = 'No se guardó. Revisa la ruta (única) y los horarios.'; }
  });
  body.querySelector('[data-ajustes]')?.addEventListener('submit', async ev => {
    ev.preventDefault();
    const d = leeForm(ev.currentTarget);
    const datos = { ticket_seg: Number(d.ticket_seg), sesion_min: Number(d.sesion_min) };
    if (state.panel?.presidencia) datos.gateway = d.gateway || '';
    try { await rpc('v2_live_ajustes', { organization_id: ORG, datos }); await carga(); aviso('Guardado', 'Ajustes del servidor de video actualizados.'); }
    catch (_) { aviso('No se guardó', 'El gateway debe empezar con https:// y no llevar rutas ni contraseñas.'); }
  });
  body.querySelectorAll('[data-consent]').forEach(b => b.onclick = async () => {
    try {
      const r = await rpc('v2_live_revisar_consentimiento', { organization_id: ORG, camera_id: b.dataset.consent });
      await carga();
      aviso('Permisos de imagen revisados', Number(r?.sin_permiso) > 0
        ? `${r.sin_permiso} de ${r.jugadores} jugadores de esta audiencia NO tienen permiso de imagen. Sólo Presidencia puede encender la cámara, y debe escribir por qué.`
        : `Los ${r?.jugadores || 0} jugadores de esta audiencia tienen permiso de imagen.`);
    } catch (_) { aviso('No se pudo', 'No pudimos revisar los permisos.'); }
  });
  body.querySelectorAll('[data-activa]').forEach(b => b.onclick = async () => {
    const on = b.dataset.on === '1';
    let m = null;
    if (!on) {
      m = await window.tosPrompt({ kicker: 'APAGAR', title: 'Apagar transmisión', message: 'Se cortan al instante las sesiones abiertas de esta cámara.', placeholder: 'Motivo', maxlength: 300, confirmText: 'Apagar', danger: true });
      if (m === null) return;
    }
    try {
      let r = await rpc('v2_live_activar', { organization_id: ORG, camera_id: b.dataset.activa, activa: on, motivo: m });
      if (on && r?.motivo === 'falta_justificacion') {
        m = await window.tosPrompt({ kicker: 'PERMISOS DE IMAGEN', title: 'Justifica la transmisión', message: `${r.sin_permiso} jugador(es) de la audiencia no tienen permiso de imagen. Escribe por qué se autoriza; queda en la bitácora.`, required: true, multiline: true, maxlength: 300, confirmText: 'Encender' });
        if (!m) return;
        r = await rpc('v2_live_activar', { organization_id: ORG, camera_id: b.dataset.activa, activa: true, motivo: m });
      }
      if (r && !r.ok) return aviso('Todavía no se puede encender', NO_ENCIENDE[r.motivo] || 'Revisa los requisitos de la cámara.');
      await carga();
    } catch (_) { aviso('No se pudo', 'No pudimos cambiar la transmisión.'); }
  });
  body.querySelectorAll('[data-archiva]').forEach(b => b.onclick = async () => {
    if (!await window.tosConfirm({ kicker: 'ARCHIVAR', title: `Archivar ${b.dataset.archiva}`, message: 'Deja de aparecer y, si es cámara, se apaga. Su historial se conserva.', confirmText: 'Archivar', danger: true })) return;
    try { await rpc('v2_live_archivar', { organization_id: ORG, tipo: b.dataset.archiva, id: b.dataset.id }); await carga(); }
    catch (_) { aviso('No se pudo', 'No pudimos archivar.'); }
  });
}

// ----------------------------------------------------------- Diagnóstico ----
const PASOS = [
  ['Modelo y tipo de grabador', g => g.modelo && g.tipo !== 'desconocido'],
  ['IP local del grabador', g => Boolean(g.ip)],
  // 554 es sólo el valor por defecto de Dahua: no cuenta hasta tener la IP.
  ['Puerto RTSP', g => Boolean(g.ip && g.puerto)],
  ['Códec (H.264 recomendado)', g => g.codec !== 'desconocido'],
  ['Substream disponible', g => g.substream === true],
  ['Conectividad desde el gateway o agente', g => g.conectividad === 'alcanzable']
];
function vistaDiagnostico() {
  const p = state.panel || {};
  const grab = p.grabadores || [], diags = p.diagnosticos || [];
  const nombreCam = id => (p.camaras || []).find(c => c.id === id)?.nombre || '';
  return `<section class="live-panel"><h2>Modo diagnóstico Dahua</h2>
    <p class="live-muted">Las pruebas de red se hacen sólo desde el servidor de video o un agente autorizado dentro de la red del parque. Este navegador no se conecta al grabador ni escanea la red. Aquí se registra y se ve lo que esas pruebas reportan, sin contraseñas.</p>
    ${grab.length ? grab.map(g => {
      const hechos = PASOS.filter(([, ok]) => ok(g)).length;
      const cam = (p.camaras || []).find(c => c.grabador === g.id);
      return `<article class="live-card"><header><div><strong>${esc(g.nombre)}</strong><small>${hechos} de ${PASOS.length} verificados</small></div></header>
        <ol class="live-pasos">${PASOS.map(([t, ok]) => `<li class="${ok(g) ? 'hecho' : ''}"><span aria-hidden="true"></span>${esc(t)}</li>`).join('')}</ol>
        <p class="live-muted">Plantilla de prueba (sin credenciales reales). Úsala en VLC dentro de la red del parque, nunca la publiques:</p>
        <code class="live-code">${esc(plantillaRtspDahua({ ip: g.ip, puerto: g.puerto, canal: cam?.canal || 1, perfil: cam?.perfil || 'sub' }))}</code>
        <div class="live-acciones"><button type="button" class="live-b" data-prueba="${esc(g.id)}">Registrar prueba manual</button><button type="button" class="live-b sutil" data-edita-grab-d="${esc(g.id)}">Completar datos</button></div>
      </article>`;
    }).join('') : '<p class="live-muted">Registra primero el grabador en la pestaña Cámaras.</p>'}
  </section>
  <section class="live-panel"><h2>Resultados</h2>
    ${diags.length ? `<ul class="live-log">${diags.map(d => `<li><span class="live-pill ${d.resultado === 'ok' ? 'ok' : 'aviso'}">${esc({ ok: 'OK', falla: 'Falla', tiempo_agotado: 'Sin respuesta', no_autorizado: 'No autorizado', no_probado: 'No probado' }[d.resultado] || d.resultado)}</span>
      <div><strong>${esc({ registro_manual: 'Prueba manual', tcp_rtsp: 'Puerto RTSP', rtsp_describe: 'Respuesta RTSP', sondeo_stream: 'Sondeo del video', gateway_estado: 'Estado del gateway' }[d.prueba] || d.prueba)}${d.camara ? ` · ${esc(nombreCam(d.camara))}` : ''}</strong>
      <small>${esc({ admin: 'Registrado por una persona', agente: 'Agente en la red del parque', gateway: 'Servidor de video' }[d.fuente] || d.fuente)} · ${esc(fecha(d.al))}${d.latencia_ms != null ? ` · ${Number(d.latencia_ms)} ms` : ''}</small>
      ${Object.keys(d.detalle || {}).length ? `<small>${esc(limpiaSecretos(Object.entries(d.detalle).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ')))}</small>` : ''}</div></li>`).join('')}</ul>`
      : '<p class="live-muted">Todavía no hay pruebas. No se inventan resultados: sin prueba, el estado es "sin verificar".</p>'}
  </section>`;
}
function enlazaDiagnostico() {
  body.querySelectorAll('[data-edita-grab-d]').forEach(b => b.onclick = () => { state.tab = 'camaras'; state.edita = { tipo: 'grabador', datos: state.panel.grabadores.find(g => g.id === b.dataset.editaGrabD) }; pinta(); });
  body.querySelectorAll('[data-prueba]').forEach(b => b.onclick = async () => {
    const ok = await window.tosConfirm({ kicker: 'PRUEBA MANUAL', title: '¿Se vio la imagen?', message: 'Registra lo que comprobaste en persona (por ejemplo, VLC dentro de la red del parque). Queda como prueba hecha por una persona.', confirmText: 'Sí, se vio', cancelText: 'No se vio' });
    const nota = await window.tosPrompt({ kicker: 'PRUEBA MANUAL', title: 'Detalle', message: 'Qué usaste y qué viste. No escribas contraseñas.', placeholder: 'VLC, canal 1, substream, 704x480', maxlength: 300, multiline: true, confirmText: 'Registrar' });
    if (nota === null) return;
    try { await rpc('v2_live_prueba_manual', { organization_id: ORG, recorder_id: b.dataset.prueba, camera_id: null, resultado: ok ? 'ok' : 'falla', nota, datos: {} }); await carga(); }
    catch (_) { aviso('No se registró', 'No pudimos guardar la prueba.'); }
  });
}

// --------------------------------------------------------------- Accesos ----
function vistaAccesos() {
  const p = state.panel || {};
  const cams = (p.camaras || []).filter(c => !c.sensible);
  const sel = state.accesosDe || cams[0]?.id;
  return `<section class="live-panel"><h2>Accesos por cámara</h2>
    ${cams.length ? `<label class="live-form">Cámara<select data-acc-cam>${cams.map(c => `<option value="${esc(c.id)}"${c.id === sel ? ' selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></label>
    <div id="liveAccesos">${state.accesos ? accesosHtml() : '<p class="live-muted">Cargando…</p>'}</div>` : '<p class="live-muted">No hay cámaras.</p>'}
  </section>
  <section class="live-panel"><h2>Accesos revocados</h2>
    ${(p.bloqueos || []).length ? `<ul class="live-log">${p.bloqueos.map(b => `<li><div><strong>${esc(b.tutor || 'Usuario')}</strong><small>${esc(b.camara || 'Todas las cámaras')} · ${esc(b.motivo)} · ${esc(fecha(b.desde))}</small></div><button type="button" class="live-b" data-restituye="${esc(b.id)}">Restituir</button></li>`).join('')}</ul>` : '<p class="live-muted">Nadie tiene el acceso revocado.</p>'}
  </section>`;
}
const accesosHtml = () => state.accesos.length ? `<ul class="live-log">${state.accesos.map(a => `<li><div><strong>${esc(a.tutor || 'Tutor')}</strong>
    <small>${esc([(a.jugadores || []).join(', '), a.telefono, a.con_cuenta ? (a.reglas_aceptadas ? 'Aceptó las reglas' : 'No ha aceptado las reglas') : 'Sin cuenta en el portal'].filter(Boolean).join(' · '))}</small></div>
    ${a.bloqueado ? '<span class="live-pill aviso">Revocado</span>' : `<button type="button" class="live-b peligro" data-revoca="${esc(a.tutor_id)}">Revocar</button>`}</li>`).join('')}</ul>`
  : '<p class="live-muted">Ningún tutor tiene acceso a esta cámara todavía (revisa sus categorías).</p>';

async function cargaAccesos() {
  const cams = (state.panel?.camaras || []).filter(c => !c.sensible);
  state.accesosDe ||= cams[0]?.id;
  if (!state.accesosDe) return;
  try { state.accesos = await rpc('v2_live_accesos', { organization_id: ORG, camera_id: state.accesosDe }) || []; }
  catch (_) { state.accesos = []; }
  if (state.tab === 'accesos' && $('liveAccesos')) { $('liveAccesos').innerHTML = accesosHtml(); enlazaRevocar(); }
}
function enlazaAccesos() {
  body.querySelector('[data-acc-cam]')?.addEventListener('change', ev => { state.accesosDe = ev.target.value; state.accesos = null; pinta(); });
  if (!state.accesos) cargaAccesos(); else enlazaRevocar();
  body.querySelectorAll('[data-restituye]').forEach(b => b.onclick = async () => {
    if (!await window.tosConfirm({ kicker: 'ACCESO', title: 'Restituir acceso', message: 'Podrá volver a ver en los horarios de su cámara.', confirmText: 'Restituir' })) return;
    try { await rpc('v2_live_desbloquear', { organization_id: ORG, block_id: b.dataset.restituye }); state.accesos = null; await carga(); }
    catch (_) { aviso('No se pudo', 'No pudimos restituir el acceso.'); }
  });
}
function enlazaRevocar() {
  body.querySelectorAll('[data-revoca]').forEach(b => b.onclick = async () => {
    const m = await window.tosPrompt({ kicker: 'REVOCAR ACCESO', title: 'Revocar acceso a esta cámara', message: 'Se corta al instante si está viendo.', placeholder: 'Motivo (queda en la bitácora)', required: true, maxlength: 300, confirmText: 'Revocar', danger: true });
    if (!m) return;
    try { await rpc('v2_live_bloquear', { organization_id: ORG, guardian_id: b.dataset.revoca, camera_id: state.accesosDe, motivo: m }); state.accesos = null; await carga(); }
    catch (_) { aviso('No se pudo', 'No pudimos revocar el acceso.'); }
  });
}

// -------------------------------------------------------------- Bitácora ----
const EVENTOS = {
  'live.ticket': 'Abrió una transmisión', 'live.terminos_aceptados': 'Aceptó las reglas', 'live.camara_creada': 'Registró una cámara',
  'live.camara_editada': 'Editó una cámara', 'live.camara_encendida': 'Encendió una cámara', 'live.camara_apagada': 'Apagó una cámara',
  'live.consentimiento_revisado': 'Revisó permisos de imagen', 'live.pausa_general': 'Pausó todas las transmisiones', 'live.pausa_levantada': 'Reanudó las transmisiones',
  'live.acceso_revocado': 'Revocó un acceso', 'live.acceso_restituido': 'Restituyó un acceso', 'live.grabador_creado': 'Registró un grabador',
  'live.grabador_editado': 'Editó un grabador', 'live.prueba_manual': 'Registró una prueba manual', 'live.ajustes': 'Cambió ajustes del servidor de video',
  'live.camara_archivado': 'Archivó una cámara', 'live.grabador_archivado': 'Archivó un grabador'
};
function vistaBitacora() {
  const b = state.bitacora;
  return `<section class="live-panel"><h2>Bitácora</h2>${!b ? '<p class="live-muted">Cargando…</p>' : b.length ? `<ul class="live-log">${b.map(e => `<li><div><strong>${esc(EVENTOS[e.tipo] || e.tipo)}</strong><small>${esc([e.quien || 'Sistema', fecha(e.al), e.datos?.motivo].filter(Boolean).join(' · '))}</small></div></li>`).join('')}</ul>` : '<p class="live-muted">Sin movimientos todavía.</p>'}</section>`;
}
async function cargaBitacora() {
  try { state.bitacora = await rpc('v2_live_bitacora', { organization_id: ORG, limite: 150 }) || []; } catch (_) { state.bitacora = []; }
  if (state.tab === 'bitacora') pinta();
}

await carga();
if (state.tab === 'bitacora') cargaBitacora();
