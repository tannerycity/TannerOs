import { createClient } from '/v2/supabase-client.js';
import { esc, motivo, codigoDeEnlace } from '/v2/live/live.js';
import { creaReproductor } from '/v2/live/reproductor.js';

// Tanner LIVE · el enlace (24/11/2026). Lo abre quien recibió el enlace por
// WhatsApp, sin cuenta: la renta de TCP, la final del torneo.
//
// Entra SIEMPRE como visitante anónimo (persistSession:false), aunque en ese
// navegador haya una sesión del staff: ver scripts/barreras/formulario-publico-sin-sesion.mjs.
// El código va después de # y nunca sale en la URL que ve el servidor. Sólo
// sirve mientras la transmisión siga; el club la puede detener o cambiar el
// enlace cuando quiera. Aquí nunca hay señal de prueba.
const supabase = createClient('https://pacnegivzgxpanphrnwp.supabase.co', 'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG',
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const rpc = async (name, params) => { const { data, error } = await supabase.rpc(name, params); if (error) throw error; return data; };
const body = document.getElementById('liveBody');
const codigo = codigoDeEnlace(location.hash);
const hora = v => new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Mexico_City' }).format(new Date(v));
let reproductor = null;

function aviso(titulo, texto) {
  body.innerHTML = `<section class="live-panel live-vacio"><h1 class="live-pub-tit">${esc(titulo)}</h1><p class="live-muted">${esc(texto)}</p></section>`;
}

async function abre() {
  if (!codigo) return aviso('Enlace incompleto', 'Abre el enlace completo que te mandaron, tal cual.');
  let info;
  try { info = await rpc('v2_live_publico', { enlace: codigo }); }
  catch (_) { return aviso('No pudimos abrir la transmisión', 'Revisa tu conexión e intenta de nuevo.'); }
  if (!info) return aviso('No pudimos abrir la transmisión', 'Revisa tu conexión e intenta de nuevo.');
  const m = motivo(info.motivo);
  if (!info.ok && ['no_existe', 'terminada', 'modulo_apagado', 'sensible'].includes(info.motivo)) return aviso(m.titulo, m.texto);
  body.innerHTML = `<section class="live-hero live-pub-hero"><div><p class="live-eyebrow">Transmisión en vivo · sin audio</p>
      <h1>${esc(info.titulo || info.camara || 'En vivo')}</h1>
      <p>${esc([info.cancha || info.camara, info.termina ? `hasta las ${hora(info.termina)}` : ''].filter(Boolean).join(' · '))}</p></div></section>
    <section class="live-panel live-escenario"><div id="liveReproductor"></div>
      <p class="live-nota" id="liveNota">${esc(info.ok ? 'Toca Reproducir para ver.' : m.texto)}</p>
      <p class="live-muted">No grabes ni compartas la transmisión. Este enlace deja de servir cuando termina.</p></section>`;
  reproductor = creaReproductor(document.getElementById('liveReproductor'), { pideTicket: () => rpc('v2_live_publico_ticket', { enlace: codigo }) });
  document.getElementById('liveReproductor').addEventListener('live:play', async () => {
    const r = await reproductor.arranca();
    if (r && !r.ok) { const mm = motivo(r.motivo); document.getElementById('liveNota').textContent = mm.texto; reproductor.aviso(mm.titulo); }
  });
}

window.addEventListener('hashchange', () => location.reload());
await abre();
