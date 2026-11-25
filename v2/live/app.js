import { bootstrapProtectedShell, rpc, $, moduleAccess, setShellHealth } from '/v2/shell.js';
import {
  esc, motivo, DIAS, REGLAS, REGLAS_VERSION, ESTADO_CAMARA, textoHorario, textoVentana, proximaVentana,
  validaGrabador, validaCamara, faltaParaEncender, NO_ENCIENDE, plantillaRtspDahua, limpiaSecretos,
  enlaceDe, mensajeWhatsApp, minutosHasta, DURACIONES
} from '/v2/live/live.js';
import { creaReproductor } from '/v2/live/reproductor.js';

// Tanner LIVE para el staff. Rediseño 25/11/2026 (Presidencia: "estilo Apple,
// fácil, como Real Madrid TV o MUTV; tenemos un chingo de botones").
//   Ver      — el reproductor grande, las cámaras como canales y UN botón rojo:
//              Transmitir (abre una hoja con dos preguntas).
//   Ajustes  — detrás del engrane: Cámaras, Diagnóstico, Accesos, Bitácora y
//              Pausar todo. Sólo administradores.
// Todo lo decide el servidor (v2_live_*).
const boot = await bootstrapProtectedShell({ active: 'live', title: 'Tanner LIVE' });
if (!boot) throw new Error('No access');
const { ctx, navigation } = boot;
const ORG = ctx.organization_id;
const ADMIN = moduleAccess(navigation, 'live', true);
const TZ = 'America/Mexico_City';
const state = { tab: 'ver', mis: null, panel: null, camara: null, accesosDe: null, accesos: null, bitacora: null, edita: null, error: null,
  tx: { camara: null, modo: 'enlace', dura: '120', titulo: '' } };
let reproductor = null;
const body = $('liveBody');
const fecha = v => v ? new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(v)) : '';
const hora = v => new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit', timeZone: TZ }).format(new Date(v));
const sinH101 = e => /could not find the function|does not exist|PGRST202/i.test(String(e?.message || e?.code || e));
const aviso = (titulo, message) => window.tosAlert({ kicker: 'TANNER LIVE', title: titulo, message });
const ICO = {
  engrane: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 9 19.36a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15 1.7 1.7 0 0 0 3.08 14H3v-4h.08A1.7 1.7 0 0 0 4.64 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63 1.7 1.7 0 0 0 10 3.08V3h4v.08A1.7 1.7 0 0 0 15 4.64a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9 1.7 1.7 0 0 0 20.92 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z"/></svg>',
  camara: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="6" width="13.5" height="12" rx="2.5"/><path d="m16 10.5 5.5-3v9l-5.5-3"/></svg>'
};
const transmisiones = () => state.panel?.transmisiones || [];
const transmisionDe = idCam => transmisiones().find(b => b.camara_id === idCam);

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

const TITULOS = { ajustes: 'Ajustes', camaras: 'Cámaras', diagnostico: 'Diagnóstico', accesos: 'Accesos', bitacora: 'Bitácora' };
function cabecera() {
  if (state.tab === 'ver') {
    const enVivo = transmisiones().length;
    return `<header class="tv-cab"><div class="tv-marca"><h1>Tanner <b>LIVE</b></h1>${enVivo ? `<span class="live-pill vivo">${enVivo} en vivo</span>` : ''}</div>
      ${ADMIN ? `<button type="button" class="tv-icono" data-ir="ajustes" aria-label="Ajustes">${ICO.engrane}</button>` : ''}</header>
      ${state.mis?.pausado ? `<p class="live-banda">Transmisiones en pausa${state.panel?.ajustes?.pausa_motivo ? `: ${esc(state.panel.ajustes.pausa_motivo)}` : ''}.</p>` : ''}`;
  }
  const atras = state.tab === 'ajustes' ? ['ver', 'Tanner LIVE'] : ['ajustes', 'Ajustes'];
  return `<header class="tv-cab"><button type="button" class="tv-volver" data-ir="${atras[0]}">‹ ${atras[1]}</button></header>
    <div class="tv-marca"><h1>${TITULOS[state.tab] || ''}</h1></div>`;
}

function ir(vista) {
  state.tab = vista; state.edita = null;
  reproductor?.detener(); reproductor = null;
  pinta();
  if (vista === 'bitacora') cargaBitacora();
  try { window.scrollTo({ top: 0 }); } catch (_) {}
}

function pinta() {
  if (state.error) {
    body.innerHTML = `<header class="tv-cab"><div class="tv-marca"><h1>Tanner <b>LIVE</b></h1></div></header>
      <section class="live-panel live-vacio"><h2>${state.error === 'pendiente' ? 'Falta activar Tanner LIVE en la base' : 'No pudimos cargar Tanner LIVE'}</h2>
      <p class="live-muted">${state.error === 'pendiente' ? 'Ver docs/tanner-live/README.md.' : 'Revisa tu conexión e intenta de nuevo.'}</p>
      ${state.error === 'pendiente' ? '' : '<button type="button" class="live-b primario" data-recarga>Reintentar</button>'}</section>`;
    body.querySelector('[data-recarga]')?.addEventListener('click', carga);
    return;
  }
  if (!state.mis) return;
  const vista = { ver: vistaVer, ajustes: vistaAjustes, camaras: vistaCamaras, diagnostico: vistaDiagnostico, accesos: vistaAccesos, bitacora: vistaBitacora }[state.tab] || vistaVer;
  body.innerHTML = `${cabecera()}<div class="live-vista">${vista()}</div>`;
  body.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => ir(b.dataset.ir));
  ({ ver: enlazaVer, ajustes: enlazaAjustes, camaras: enlazaCamaras, diagnostico: enlazaDiagnostico, accesos: enlazaAccesos, bitacora: () => {} }[state.tab] || enlazaVer)();
}

// ------------------------------------------------------------------- Ver ----
function vistaVer() {
  const cams = state.mis.camaras || [];
  if (!cams.length) return `<section class="live-panel live-vacio"><span class="live-poster-ico">${ICO.camara}</span><h2>Todavía no hay cámaras</h2>
    <p class="live-muted">${ADMIN ? 'Agrega la primera en Ajustes › Cámaras. Puedes hacerlo aunque todavía no conozcas el modelo del grabador.' : 'Cuando el club te asigne una cámara, aparecerá aquí.'}</p>
    ${ADMIN ? '<button type="button" class="live-b primario" data-ir="camaras">Agregar cámara</button>' : ''}</section>`;
  const c = cams.find(x => x.id === state.camara) || cams[0];
  const prox = proximaVentana(c.horario, new Date(), TZ);
  const suya = transmisionDe(c.id);
  const terminos = !state.mis.terminos?.aceptados && c.motivo === 'sin_terminos';
  return `<section class="tv-escenario">${terminos ? '' : '<div id="liveReproductor"></div>'}</section>
    <div class="tv-info"><div><h2>${esc(c.nombre)}</h2><p class="tv-sub">${esc([c.cancha !== c.nombre ? c.cancha : null, suya ? `En vivo hasta las ${hora(suya.termina)}` : textoVentana(prox)].filter(Boolean).join(' · '))}</p></div>
      ${ADMIN && !suya && (state.panel?.camaras || []).some(x => !x.sensible) ? '<button type="button" class="tv-transmitir" data-abrir-tx><i></i>Transmitir</button>' : ''}</div>
    ${terminos ? reglasHtml() : ''}
    ${ADMIN && transmisiones().length ? `<div class="live-activas">${transmisiones().map(activaHtml).join('')}</div>` : ''}
    ${cams.length > 1 ? `<section class="tv-seccion"><h3>Cámaras</h3><div class="tv-canales">${cams.map(canalHtml).join('')}</div></section>` : ''}`;
}
function canalHtml(x) {
  const vivo = transmisionDe(x.id) || (x.motivo === 'ok' && x.estado === 'online');
  const sub = transmisionDe(x.id) ? 'Transmitiendo' : x.motivo === 'ok' ? (ESTADO_CAMARA[x.estado] === 'En línea' ? 'En línea' : 'Lista') : motivo(x.motivo).titulo;
  return `<button type="button" class="tv-canal" data-cam="${esc(x.id)}" aria-current="${x.id === state.camara}">
    <div class="tv-canal-img">${vivo ? '<span class="tv-canal-vivo">EN VIVO</span>' : ''}${ICO.camara}</div>
    <strong>${esc(x.nombre)}</strong><small>${esc(sub)}</small></button>`;
}
function activaHtml(b) {
  return `<article class="live-activa"><span class="tv-punto" aria-hidden="true"></span>
    <div class="tv-que"><strong>${esc(b.titulo || b.camara)}</strong>
      <small>${esc([b.titulo ? b.camara : null, b.modo === 'enlace' ? 'Con enlace' : 'Sólo familias', `hasta las ${hora(b.termina)}`, `${Number(b.viendo || 0)} viendo`].filter(Boolean).join(' · '))}</small></div>
    <div class="live-acciones">${b.enlace ? `<button type="button" class="tv-mini" data-copia="${esc(b.id)}">Compartir</button>` : ''}
      <button type="button" class="tv-mini rojo" data-detener="${esc(b.id)}">Detener</button></div></article>`;
}
const reglasHtml = () => `<div class="live-reglas"><h3>Antes de ver</h3><ol>${REGLAS.map(r => `<li>${esc(r)}</li>`).join('')}</ol>
  <button type="button" class="tv-grande claro" data-acepta>Acepto las reglas</button></div>`;

function enlazaVer() {
  body.querySelectorAll('[data-cam]').forEach(b => b.onclick = () => { state.camara = b.dataset.cam; reproductor?.detener(); reproductor = null; pinta(); });
  body.querySelector('[data-acepta]')?.addEventListener('click', async () => {
    try { await rpc('v2_live_aceptar_terminos', { organization_id: ORG, version: state.mis.terminos?.version || REGLAS_VERSION }); await carga(); }
    catch (_) { aviso('No se guardó', 'No pudimos registrar tu aceptación. Intenta de nuevo.'); }
  });
  body.querySelector('[data-abrir-tx]')?.addEventListener('click', () => hojaTransmitir());
  body.querySelectorAll('[data-copia]').forEach(b => b.onclick = () => { const t = transmisiones().find(x => x.id === b.dataset.copia); if (t) hojaCompartir(t); });
  body.querySelectorAll('[data-detener]').forEach(b => b.onclick = () => detener(b.dataset.detener));
  const cont = $('liveReproductor');
  if (!cont) return;
  const cam = (state.mis.camaras || []).find(x => x.id === state.camara) || state.mis.camaras[0];
  reproductor = creaReproductor(cont, {
    titulo: cam.nombre,
    pideTicket: () => rpc('v2_live_ticket', { camera_id: cam.id }),
    alRechazo: async r => {
      const m = motivo(r?.motivo);
      // Sólo el administrador puede revisar el reproductor con una señal de
      // prueba mientras no hay servidor de video. La familia nunca la ve.
      if (r?.motivo === 'sin_gateway' && ADMIN) {
        reproductor.aviso('Esta cámara aún no está conectada al servidor de video.');
        const ok = await window.tosConfirm({ kicker: 'SIN SERVIDOR DE VIDEO', title: 'Ver señal de prueba', message: 'Todavía no hay servidor de video. ¿Revisas el reproductor con una señal de prueba? Se verá rotulada como prueba, nunca como en vivo.', confirmText: 'Ver prueba' });
        if (ok) reproductor.arranca({ modoPrueba: true });
      } else reproductor.aviso(m.texto);
    }
  });
  reproductor.poster('', cam.motivo === 'ok' ? 'Toca play para ver.' : motivo(cam.motivo).texto);
  cont.addEventListener('live:play', () => reproductor.arranca());
}

// ---------------------------------------------------------- Hojas (sheets) ----
function abreHoja(html, enlazar) {
  cierraHoja();
  const fondo = document.createElement('div');
  fondo.className = 'tv-hoja-fondo live-page';
  fondo.style.cssText = 'padding:0;border-radius:0;background:rgba(0,0,0,.55);display:flex;gap:0';
  fondo.innerHTML = `<div class="tv-hoja" role="dialog" aria-modal="true"><div class="tv-agarre" aria-hidden="true"></div>${html}</div>`;
  fondo.addEventListener('click', ev => { if (ev.target === fondo) cierraHoja(); });
  fondo.querySelectorAll('[data-cerrar]').forEach(b => b.onclick = cierraHoja);
  document.body.appendChild(fondo);
  document.addEventListener('keydown', escHoja);
  enlazar?.(fondo.querySelector('.tv-hoja'));
  fondo.querySelector('button, input')?.focus();
}
function cierraHoja() { document.querySelector('.tv-hoja-fondo')?.remove(); document.removeEventListener('keydown', escHoja); }
function escHoja(ev) { if (ev.key === 'Escape') cierraHoja(); }

// Presidencia (24/11/2026): "un botón de transmitir y ya, y veo a quién le doy
// acceso". Dos preguntas: quién la ve y cuánto dura. Se apaga sola.
function hojaTransmitir(error = '') {
  const tx = state.tx;
  const libres = (state.panel?.camaras || []).filter(c => !c.sensible && !transmisionDe(c.id));
  if (!libres.some(c => c.id === tx.camara)) tx.camara = libres.find(c => c.id === state.camara)?.id || libres[0]?.id || null;
  const seg = (attr, ops, val) => ops.map(([k, t]) => `<button type="button" role="radio" aria-checked="${val === k}" data-${attr}="${esc(k)}">${esc(t)}</button>`).join('');
  abreHoja(`<h2>Transmitir</h2>
    ${libres.length > 1 ? `<div class="tv-campo"><span>Cámara</span><div class="tv-seg envuelve" role="radiogroup">${seg('tx-cam', libres.map(c => [c.id, c.nombre]), tx.camara)}</div></div>` : ''}
    <div class="tv-campo"><span>¿Quién la ve?</span><div class="tv-seg" role="radiogroup">${seg('tx-modo', [['enlace', 'Con enlace'], ['familias', 'Familias']], tx.modo)}</div>
      <p>${tx.modo === 'enlace' ? 'Cualquiera con el enlace, sin cuenta. Para rentas y finales.' : 'Sólo las familias de la academia, con su cuenta.'}</p></div>
    <div class="tv-campo"><span>¿Cuánto tiempo?</span><div class="tv-seg" role="radiogroup">${seg('tx-dura', DURACIONES.map(([k, t]) => [k, t.replace(/ horas?$/, ' h').replace('Hasta las ', 'Hasta ')]), tx.dura)}</div></div>
    <label class="tv-campo"><span>Nombre (opcional)</span><input data-tx-titulo maxlength="80" placeholder="Final Copa TCP" value="${esc(tx.titulo)}"></label>
    ${error ? `<p class="live-errores" role="alert">${esc(error)}</p>` : ''}
    <button type="button" class="tv-grande" data-transmitir>Empezar transmisión</button>
    <button type="button" class="tv-texto" data-cerrar>Cancelar</button>`, h => {
    h.querySelectorAll('[data-tx-cam]').forEach(b => b.onclick = () => { tx.camara = b.dataset.txCam; hojaTransmitir(); });
    h.querySelectorAll('[data-tx-modo]').forEach(b => b.onclick = () => { tx.modo = b.dataset.txModo; hojaTransmitir(); });
    h.querySelectorAll('[data-tx-dura]').forEach(b => b.onclick = () => { tx.dura = b.dataset.txDura; hojaTransmitir(); });
    h.querySelector('[data-tx-titulo]').addEventListener('input', ev => { tx.titulo = ev.target.value; });
    h.querySelector('[data-transmitir]').addEventListener('click', async ev => {
      ev.currentTarget.disabled = true;
      const minutos = tx.dura === 'hasta-23' ? minutosHasta('23:00', new Date(), TZ) : Number(tx.dura);
      let r;
      try { r = await rpc('v2_live_transmitir', { organization_id: ORG, camera_id: tx.camara, modo: tx.modo, titulo: tx.titulo || null, minutos }); }
      catch (_) { return hojaTransmitir('No se pudo transmitir. Intenta de nuevo.'); }
      if (r && !r.ok) return hojaTransmitir(NO_ENCIENDE[r.motivo] || motivo(r.motivo).texto);
      tx.titulo = '';
      await carga();
      const cam = (state.panel?.camaras || []).find(c => c.id === tx.camara);
      const nueva = { id: r.id, enlace: r.enlace, termina: r.termina, titulo: null, camara: cam?.nombre || '', modo: r.modo || tx.modo };
      if (r.enlace) hojaCompartir(nueva, r.recortada_por_academia ? 'Se apagará sola cuando empiece el horario de la academia en esa cámara.' : '');
      else abreHoja(`<h2>Ya están en vivo</h2><p>Las familias de la academia ya pueden verla en su portal hasta las ${esc(hora(r.termina))}.</p>
        <button type="button" class="tv-grande claro" data-cerrar>Listo</button>`);
    });
  });
}

function hojaCompartir(b, nota = '') {
  const enlace = enlaceDe(b.enlace, location.origin);
  const wa = `https://wa.me/?text=${encodeURIComponent(mensajeWhatsApp({ titulo: b.titulo, camara: b.camara, enlace, termina: b.termina }))}`;
  abreHoja(`<h2>Estás en vivo</h2>
    <p>Comparte este enlace con quien quieras que lo vea. Se apaga sola a las ${esc(hora(b.termina))}${nota ? ` ${esc(nota)}` : ''}</p>
    <code class="live-hoja-enlace">${esc(enlace)}</code>
    <div class="tv-botones"><button type="button" class="tv-grande claro" data-copiar>Copiar</button>
      <a class="tv-grande" style="display:grid;place-items:center;text-decoration:none" target="_blank" rel="noopener" href="${esc(wa)}">WhatsApp</a></div>
    ${navigator.share ? '<button type="button" class="tv-texto" data-compartir>Compartir en otras apps</button>' : ''}
    <button type="button" class="tv-texto" data-nuevo-enlace="${esc(b.id)}">Cambiar el enlace</button>
    <button type="button" class="tv-texto" data-cerrar>Listo</button>`, h => {
    h.querySelector('[data-copiar]').onclick = async ev => {
      const btn = ev.currentTarget;
      try { await navigator.clipboard.writeText(enlace); btn.textContent = 'Copiado'; }
      catch (_) { const r = document.createRange(); r.selectNodeContents(h.querySelector('.live-hoja-enlace')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); btn.textContent = 'Selecciónalo y cópialo'; }
    };
    h.querySelector('[data-compartir]')?.addEventListener('click', () => navigator.share({ title: 'Tanner LIVE', text: mensajeWhatsApp({ titulo: b.titulo, camara: b.camara, enlace, termina: b.termina }) }).catch(() => {}));
    h.querySelector('[data-nuevo-enlace]').onclick = async () => {
      if (!await window.tosConfirm({ kicker: 'ENLACE', title: 'Cambiar el enlace', message: 'El enlace anterior deja de servir y se corta a quien lo estaba usando. Útil si se compartió de más.', confirmText: 'Cambiar enlace' })) return;
      try { const r = await rpc('v2_live_nuevo_enlace', { organization_id: ORG, broadcast_id: b.id }); await carga(); if (r?.enlace) hojaCompartir({ ...b, enlace: r.enlace }); }
      catch (_) { aviso('No se pudo', 'No pudimos cambiar el enlace.'); }
    };
  });
}

async function detener(id) {
  if (!await window.tosConfirm({ kicker: 'TRANSMISIÓN', title: 'Detener transmisión', message: 'Se corta para todos los que la están viendo y el enlace deja de servir.', confirmText: 'Detener', danger: true })) return;
  try { await rpc('v2_live_detener', { organization_id: ORG, broadcast_id: id }); } catch (_) { aviso('No se pudo', 'No pudimos detenerla.'); }
  await carga();
}

// --------------------------------------------------------------- Ajustes ----
function vistaAjustes() {
  const p = state.panel || {};
  const n = (p.camaras || []).length, pausado = state.mis?.pausado;
  return `<div class="tv-lista">
      <button type="button" class="tv-fila" data-ir="camaras"><span>Cámaras</span><small>${n}</small><em>›</em></button>
      <button type="button" class="tv-fila" data-ir="diagnostico"><span>Diagnóstico del grabador</span><em>›</em></button>
      <button type="button" class="tv-fila" data-ir="accesos"><span>Accesos de familias</span><em>›</em></button>
      <button type="button" class="tv-fila" data-ir="bitacora"><span>Bitácora</span><em>›</em></button>
    </div>
    <div class="tv-lista"><button type="button" class="tv-fila ${pausado ? 'oro' : 'rojo'}" data-pausa><span>${pausado ? 'Reanudar transmisiones' : 'Pausar todas las transmisiones'}</span></button></div>
    <p class="tv-pie">${pausado ? 'Las cámaras encendidas vuelven a transmitir en su horario.' : 'Corta al instante a todos los que estén viendo. Úsalo si algo no debe verse.'}</p>`;
}
function enlazaAjustes() { body.querySelector('[data-pausa]')?.addEventListener('click', alternaPausa); }

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
  return `<section class="live-panel">${!b ? '<p class="live-muted">Cargando…</p>' : b.length ? `<ul class="live-log">${b.map(e => `<li><div><strong>${esc(EVENTOS[e.tipo] || e.tipo)}</strong><small>${esc([e.quien || 'Sistema', fecha(e.al), e.datos?.motivo].filter(Boolean).join(' · '))}</small></div></li>`).join('')}</ul>` : '<p class="live-muted">Sin movimientos todavía.</p>'}</section>`;
}
async function cargaBitacora() {
  try { state.bitacora = await rpc('v2_live_bitacora', { organization_id: ORG, limite: 150 }) || []; } catch (_) { state.bitacora = []; }
  if (state.tab === 'bitacora') pinta();
}

await carga();
if (state.tab === 'bitacora') cargaBitacora();
