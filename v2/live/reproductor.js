// Tanner LIVE · reproductor. Sin librerías: WebRTC (WHEP) es nativo en
// Safari de iPhone/iPad, Chrome de Android y navegadores de escritorio. HLS
// sólo se usa donde el navegador lo reproduce solo (Safari).
//
// Reglas que este archivo no rompe (las vigila scripts/barreras/live-privado.mjs):
//   * Nunca arranca solo: no hay autoplay. Se reproduce cuando la persona toca.
//   * Sin audio, sin descarga, sin imagen en imagen.
//   * "En vivo" sólo cuando hay cuadros reales de un gateway. La señal de
//     prueba se rotula como prueba y nunca como en vivo.
//   * El ticket viaja en el encabezado Authorization (WHEP). Nunca se guarda.
import { puedeDecirEnVivo, ESTADOS } from '/v2/live/live.js';

const ESPERA_ICE_MS = 2500;

// alRechazo(r): el servidor dijo que no (terminó, pausa, fuera de horario…).
// Se llama al tocar Reproducir y también en cada reintento automático.
// Iconos de línea (mismo trazo del menú). Sin emojis.
const ICONO = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/></svg>',
  pausa: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" stroke="none"/><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" stroke="none"/></svg>',
  completa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5"/><path d="M20 9V4h-5"/><path d="M4 15v5h5"/><path d="M20 15v5h-5"/></svg>',
  camara: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="6" width="13.5" height="12" rx="2.5"/><path d="m16 10.5 5.5-3v9l-5.5-3"/></svg>'
};

// Estilo de TV del club: póster con el nombre de la cámara, un solo botón de
// play al centro y, ya reproduciendo, controles discretos abajo.
export function creaReproductor(contenedor, { titulo = '', pideTicket, alCambiar = () => {}, alRechazo = () => {} } = {}) {
  contenedor.innerHTML = `
    <div class="live-video" data-estado="inactivo">
      <video playsinline muted disablepictureinpicture controlslist="nodownload noplaybackrate noremoteplayback" disableremoteplayback></video>
      <canvas class="live-prueba hidden" width="640" height="360" aria-hidden="true"></canvas>
      <div class="live-poster"><span class="live-poster-ico">${ICONO.camara}</span><strong class="live-poster-tit"></strong><p class="live-msg"></p></div>
      <div class="live-sello" aria-live="polite"><i></i><span>Listo</span></div>
      <button type="button" class="live-play" aria-label="Reproducir"><span class="ico-play">${ICONO.play}</span><span class="ico-pausa">${ICONO.pausa}</span></button>
      <div class="live-controles"><button type="button" class="live-btn live-full" aria-label="Pantalla completa">${ICONO.completa}</button></div>
    </div>`;
  const caja = contenedor.querySelector('.live-video');
  const video = caja.querySelector('video');
  const lienzo = caja.querySelector('canvas');
  const sello = caja.querySelector('.live-sello span');
  const msg = caja.querySelector('.live-msg');
  const posterTit = caja.querySelector('.live-poster-tit');
  posterTit.textContent = titulo;
  const btnPlay = caja.querySelector('.live-play');
  const btnFull = caja.querySelector('.live-full');
  video.muted = true; video.defaultMuted = true; video.autoplay = false; video.controls = false;
  video.addEventListener('contextmenu', e => e.preventDefault());

  let pc = null, recurso = null, ticket = null, proveedor = null, animacion = 0, intentos = 0, vivo = false, reintento = 0, desconexion = 0;
  let estado = 'inactivo';

  function pon(nuevo, texto = '') {
    estado = nuevo;
    caja.dataset.estado = nuevo;
    sello.textContent = ESTADOS[nuevo]?.etiqueta || nuevo;
    msg.textContent = texto;
    const corriendo = nuevo === 'en_vivo' || nuevo === 'conectando' || nuevo === 'prueba';
    btnPlay.setAttribute('aria-label', corriendo ? 'Pausar' : 'Reproducir');
    alCambiar(nuevo);
  }

  function confirmaVivo() {
    const cuadros = video.getVideoPlaybackQuality?.().totalVideoFrames ?? (video.videoWidth > 0 ? 1 : 0);
    if (puedeDecirEnVivo({ proveedor, reproduciendo: !video.paused, cuadros })) { vivo = true; intentos = 0; pon('en_vivo'); }
  }
  video.addEventListener('playing', () => setTimeout(confirmaVivo, 300));
  video.addEventListener('waiting', () => { if (vivo) pon('conectando', 'Recuperando la señal…'); });
  video.addEventListener('stalled', () => { if (vivo) pon('conectando', 'Recuperando la señal…'); });
  video.addEventListener('error', () => { if (proveedor === 'hls') falla('No se pudo reproducir la transmisión.'); });

  async function detenTodo() {
    cancelAnimationFrame(animacion); animacion = 0; clearTimeout(reintento); clearTimeout(desconexion);
    lienzo.classList.add('hidden');
    try { video.pause(); } catch (_) {}
    if (video.srcObject) { video.srcObject.getTracks?.().forEach(t => t.stop()); video.srcObject = null; }
    if (video.getAttribute('src')) { video.removeAttribute('src'); video.load(); }
    if (pc) { try { pc.close(); } catch (_) {} pc = null; }
    // WHEP: avisar al gateway que la sesión terminó.
    if (recurso && ticket) { fetch(recurso, { method: 'DELETE', headers: { Authorization: `Bearer ${ticket}` } }).catch(() => {}); }
    recurso = null; ticket = null; vivo = false;
  }

  function falla(texto) {
    detenTodo();
    // Reconexión: hasta 3 intentos con espera creciente, siempre con ticket nuevo.
    if (intentos < 3) {
      intentos++;
      pon('sin_senal', `${texto} Reintentando (${intentos} de 3)…`);
      reintento = setTimeout(() => arranca(), 1500 * intentos);
    } else {
      intentos = 0;
      pon('sin_senal', `${texto} Toca reproducir para intentar de nuevo.`);
    }
  }

  async function whep(url) {
    pc = new RTCPeerConnection({ bundlePolicy: 'max-bundle' });
    pc.addTransceiver('video', { direction: 'recvonly' });   // sin audio
    pc.ontrack = ev => { video.srcObject = ev.streams[0] || new MediaStream([ev.track]); video.play().catch(() => {}); };
    pc.onconnectionstatechange = () => {
      if (!pc) return;
      if (pc.connectionState === 'failed') falla('Se perdió la conexión.');
      // Desconectado más de 4 s (p. ej. el club detuvo la transmisión): se
      // pide un ticket nuevo, y el servidor dice si sigue o ya terminó.
      if (pc.connectionState === 'disconnected') { pon('conectando', 'Recuperando la señal…'); clearTimeout(desconexion); desconexion = setTimeout(() => { if (pc?.connectionState !== 'connected') falla('Se perdió la conexión.'); }, 4000); }
      if (pc.connectionState === 'connected') { clearTimeout(desconexion); if (vivo) pon('en_vivo'); }
    };
    const oferta = await pc.createOffer();
    await pc.setLocalDescription(oferta);
    await new Promise(r => {
      if (pc.iceGatheringState === 'complete') return r();
      const t = setTimeout(r, ESPERA_ICE_MS);
      pc.addEventListener('icegatheringstatechange', () => { if (pc?.iceGatheringState === 'complete') { clearTimeout(t); r(); } });
    });
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/sdp', Authorization: `Bearer ${ticket}` }, body: pc.localDescription.sdp });
    if (res.status === 401 || res.status === 403) throw Object.assign(new Error('no_autorizado'), { definitivo: true });
    if (!res.ok) throw new Error(`gateway ${res.status}`);
    const loc = res.headers.get('Location');
    if (loc) recurso = new URL(loc, url).toString();
    await pc.setRemoteDescription({ type: 'answer', sdp: await res.text() });
  }

  // Señal de prueba: un dibujo de cancha generado aquí mismo, rotulado. Sirve
  // para revisar la pantalla sin cámara. No pasa por red ni finge ser real.
  function prueba() {
    proveedor = 'prueba';
    lienzo.classList.remove('hidden');
    const g = lienzo.getContext('2d');
    const t0 = performance.now();
    const pinta = () => {
      const t = (performance.now() - t0) / 1000, w = lienzo.width, h = lienzo.height;
      g.fillStyle = '#0b2a33'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(233,209,156,.55)'; g.lineWidth = 3;
      g.strokeRect(30, 30, w - 60, h - 60); g.beginPath(); g.moveTo(w / 2, 30); g.lineTo(w / 2, h - 30); g.stroke();
      g.beginPath(); g.arc(w / 2, h / 2, 48, 0, Math.PI * 2); g.stroke();
      const x = w / 2 + Math.sin(t * 1.3) * (w / 2 - 80), y = h / 2 + Math.cos(t * 0.9) * (h / 2 - 70);
      g.fillStyle = '#c6ac5c'; g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffffff'; g.font = '800 22px Inter, sans-serif'; g.textAlign = 'center';
      g.fillText('SEÑAL DE PRUEBA', w / 2, 70);
      g.font = '600 15px Inter, sans-serif'; g.fillText('No es una cámara real · sólo revisa la pantalla', w / 2, h - 50);
      animacion = requestAnimationFrame(pinta);
    };
    pinta();
    pon('prueba', '');
  }

  async function arranca({ modoPrueba = false } = {}) {
    await detenTodo();
    if (modoPrueba) return prueba();
    pon('conectando', 'Conectando con la cámara…');
    let r;
    try { r = await pideTicket(); }
    catch (e) { return falla('No pudimos pedir acceso a la cámara.'); }
    if (!r?.ok) { intentos = 0; pon('inactivo', ''); try { alRechazo(r); } catch (_) {} return r; }
    ticket = r.ticket;
    try {
      if (window.RTCPeerConnection && r.whep) { proveedor = 'whep'; await whep(r.whep); }
      else if (r.hls && video.canPlayType('application/vnd.apple.mpegurl')) {
        // Respaldo HLS (Safari): el ticket va en la consulta porque <video> no
        // manda encabezados. Vence en minutos y sólo sirve en este dispositivo.
        proveedor = 'hls';
        video.src = `${r.hls}?ticket=${encodeURIComponent(ticket)}`;
        await video.play();
      } else {
        pon('error', 'Este navegador no puede reproducir la transmisión. Actualiza Safari o Chrome.');
      }
    } catch (e) {
      if (e?.definitivo) { await detenTodo(); intentos = 0; pon('error', 'El acceso ya no es válido. Toca reproducir para pedir uno nuevo.'); }
      else falla('La cámara no respondió.');
    }
    return r;
  }

  btnPlay.addEventListener('click', () => {
    if (estado === 'en_vivo' || estado === 'conectando' || estado === 'prueba') { detenTodo(); intentos = 0; pon('pausado', 'Transmisión en pausa.'); }
    else caja.dispatchEvent(new CustomEvent('live:play', { bubbles: true }));
  });
  btnFull.addEventListener('click', () => {
    if (document.fullscreenElement) return document.exitFullscreen?.();
    if (caja.requestFullscreen) return caja.requestFullscreen().catch(() => video.webkitEnterFullscreen?.());
    if (video.webkitEnterFullscreen) return video.webkitEnterFullscreen(); // iPhone
  });
  // Si la pestaña se oculta mucho tiempo, se suelta la conexión.
  let ocultoDesde = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) ocultoDesde = Date.now();
    else if (ocultoDesde && Date.now() - ocultoDesde > 5 * 60 * 1000 && (estado === 'en_vivo' || estado === 'conectando')) { detenTodo(); pon('pausado', 'Pausamos la transmisión mientras no la veías.'); }
  });
  window.addEventListener('pagehide', () => { detenTodo(); });

  return {
    arranca, detener: async (texto = '') => { await detenTodo(); intentos = 0; pon('inactivo', texto); },
    get estado() { return estado; }, aviso: (texto) => { msg.textContent = texto; },
    // Lo que dice el póster cuando no hay video (nombre de la cámara y motivo).
    poster: (t, texto = '') => { posterTit.textContent = t || ''; msg.textContent = texto; }
  };
}
