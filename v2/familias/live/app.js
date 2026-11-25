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
const top = '<header class="tv-cab"><a class="tv-volver" href="/familias/">‹ Portal</a></header><div class="tv-marca"><h1>Tanner <b>LIVE</b></h1></div>';
const hero = '';
const CAM = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="6" width="13.5" height="12" rx="2.5"/><path d="m16 10.5 5.5-3v9l-5.5-3"/></svg>';
const state = { datos: null, camara: null };
let reproductor = null;

const { data: { session } } = await supabase.auth.getSession();
if (!session) { location.href = '/familias/'; throw new Error('Sin sesión'); }

async function carga() {
  try {
    state.datos = await rpc('v2_live_mis_camaras', {}) || { camaras: [] };
  } catch (e) {
    body.innerHTML = `${top}${hero}<section class="live-panel live-vacio"><h2>Tanner LIVE no está disponible</h2><p class="live-muted">Tu club todavía no tiene transmisiones para tu cuenta.</p></section>`;
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
  body.innerHTML = `${top}
    <section class="tv-escenario">${reglas ? '' : '<div id="liveReproductor"></div>'}</section>
    <div class="tv-info"><div><h2>${esc(c.nombre)}</h2><p class="tv-sub">${esc([c.cancha !== c.nombre ? c.cancha : null, textoVentana(proximaVentana(c.horario, new Date(), TZ))].filter(Boolean).join(' · '))}</p></div></div>
    <p class="tv-nota" id="liveNota">Sólo familias autorizadas · sin audio · sin grabación.</p>
    ${reglas ? `<div class="live-reglas"><h3>Antes de ver</h3><ol>${REGLAS.map(r => `<li>${esc(r)}</li>`).join('')}</ol>
      <button type="button" class="tv-grande claro" data-acepta>Acepto las reglas</button></div>` : ''}
    ${cams.length > 1 ? `<section class="tv-seccion"><h3>Cámaras</h3><div class="tv-canales">${cams.map(x => `<button type="button" class="tv-canal" data-cam="${esc(x.id)}" aria-current="${x.id === c.id}"><div class="tv-canal-img">${x.motivo === 'ok' && x.estado === 'online' ? '<span class="tv-canal-vivo">EN VIVO</span>' : ''}${CAM}</div><strong>${esc(x.nombre)}</strong><small>${esc(x.cancha || textoHorario(x.horario))}</small></button>`).join('')}</div></section>` : ''}`;
  body.querySelectorAll('[data-cam]').forEach(b => b.onclick = () => { state.camara = b.dataset.cam; reproductor?.detener(); reproductor = null; pinta(); });
  body.querySelector('[data-acepta]')?.addEventListener('click', async () => {
    try { await rpc('v2_live_aceptar_terminos', { organization_id: null, version: d.terminos?.version || REGLAS_VERSION }); await carga(); }
    catch (_) { window.tosAlert({ kicker: 'TANNER LIVE', title: 'No se guardó', message: 'Intenta de nuevo en un momento.' }); }
  });
  const cont = document.getElementById('liveReproductor');
  if (!cont) return;
  reproductor = creaReproductor(cont, {
    titulo: c.nombre,
    pideTicket: () => rpc('v2_live_ticket', { camera_id: c.id }),
    alRechazo: r => reproductor.aviso(motivo(r?.motivo).texto)
  });
  reproductor.poster('', c.motivo === 'ok' && !d.pausado ? 'Toca play para ver.' : m.texto);
  cont.addEventListener('live:play', () => reproductor.arranca());
}

await carga();
