import { supabase, rpc } from '/v2/shell.js';
import { esc, motivo, REGLAS, REGLAS_VERSION, textoVentana, proximaVentana, textoHorario } from '/v2/live/live.js';
import { creaReproductor } from '/v2/live/reproductor.js';

// Tanner LIVE para familias (23/11/2026). Igual que el portal, no usa el shell
// del staff: el tutor sólo ve las cámaras que el servidor le resuelve por
// auth.uid() (v2_live_mis_camaras). Esta página no recibe ni manda ids de
// club o de jugador, y nunca ve una URL RTSP: sólo un ticket de minutos.
//
// La familia NUNCA ve la señal de prueba: sin servidor de video, se le dice
// que la cámara todavía no está conectada.
const TZ = 'America/Mexico_City';
const body = document.getElementById('liveBody');
const top = '<div class="live-familia-top"><a href="/familias/">Volver al portal</a></div>';
const hero = `<section class="live-hero"><div><p class="live-eyebrow">Entrenamientos en vivo · privado</p><h1>Tanner LIVE</h1>
  <p>Sólo tú y las familias autorizadas. Sin audio, sin grabación y sólo en horario de entrenamiento.</p></div></section>`;
const state = { datos: null, camara: null };
let reproductor = null;

const { data: { session } } = await supabase.auth.getSession();
if (!session) { location.href = '/familias/'; throw new Error('Sin sesión'); }

async function carga() {
  try {
    state.datos = await rpc('v2_live_mis_camaras', {}) || { camaras: [] };
  } catch (e) {
    body.innerHTML = `${top}${hero}<section class="live-panel"><h2>Tanner LIVE no está disponible</h2><p class="live-muted">Tu club todavía no tiene transmisiones para tu cuenta.</p></section>`;
    return;
  }
  const cams = state.datos.camaras || [];
  if (!cams.some(c => c.id === state.camara)) state.camara = cams[0]?.id || null;
  pinta();
}

function pinta() {
  const d = state.datos, cams = d.camaras || [];
  if (!cams.length) {
    body.innerHTML = `${top}${hero}<section class="live-panel live-vacio"><h2>Sin transmisiones para ti</h2><p class="live-muted">Cuando el club active la cámara de la categoría de tu Tanner, aparecerá aquí.</p></section>`;
    return;
  }
  const c = cams.find(x => x.id === state.camara) || cams[0];
  const m = motivo(d.pausado ? 'pausado' : c.motivo);
  const reglas = !d.terminos?.aceptados;
  body.innerHTML = `${top}${hero}
    ${cams.length > 1 ? `<div class="live-lista">${cams.map(x => `<button type="button" class="live-chip${x.id === c.id ? ' activa' : ''}" data-cam="${esc(x.id)}"><strong>${esc(x.nombre)}</strong><small>${esc(x.cancha || textoHorario(x.horario))}</small></button>`).join('')}</div>` : ''}
    <section class="live-panel live-escenario">
      ${reglas ? '' : '<div id="liveReproductor"></div>'}
      <div class="live-info"><div><h2>${esc(c.nombre)}</h2><p>${esc([c.cancha, textoVentana(proximaVentana(c.horario, new Date(), TZ))].filter(Boolean).join(' · '))}</p></div>
        <span class="live-pill ${m.tono}">${esc(m.titulo)}</span></div>
      <p class="live-nota" id="liveNota">${esc(c.motivo === 'ok' ? 'La transmisión no arranca sola: toca Reproducir.' : m.texto)}</p>
      ${reglas ? `<div class="live-reglas"><h3>Antes de ver: reglas de Tanner LIVE</h3><ol>${REGLAS.map(r => `<li>${esc(r)}</li>`).join('')}</ol>
        <button type="button" class="live-b primario" data-acepta>Acepto las reglas</button></div>` : ''}
    </section>`;
  body.querySelectorAll('[data-cam]').forEach(b => b.onclick = () => { state.camara = b.dataset.cam; reproductor?.detener(); reproductor = null; pinta(); });
  body.querySelector('[data-acepta]')?.addEventListener('click', async () => {
    try { await rpc('v2_live_aceptar_terminos', { organization_id: null, version: d.terminos?.version || REGLAS_VERSION }); await carga(); }
    catch (_) { window.tosAlert({ kicker: 'TANNER LIVE', title: 'No se guardó', message: 'Intenta de nuevo en un momento.' }); }
  });
  const cont = document.getElementById('liveReproductor');
  if (!cont) return;
  reproductor = creaReproductor(cont, {
    pideTicket: () => rpc('v2_live_ticket', { camera_id: c.id }),
    alRechazo: r => { const mm = motivo(r?.motivo); document.getElementById('liveNota').textContent = mm.texto; reproductor.aviso(mm.titulo); }
  });
  cont.addEventListener('live:play', () => reproductor.arranca());
}

await carga();
