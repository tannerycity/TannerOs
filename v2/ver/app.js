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
  const nombre = info.titulo || info.camara || 'En vivo';
  body.innerHTML = `<header class="tv-cab"><div class="tv-marca"><h1>Tanner <b>LIVE</b></h1></div></header>
    <section class="tv-escenario"><div id="liveReproductor"></div></section>
    <div class="tv-info"><div><h2 class="live-pub-tit">${esc(nombre)}</h2>
      <p class="tv-sub">${esc([info.cancha || (info.titulo ? info.camara : ''), info.termina ? `hasta las ${hora(info.termina)}` : ''].filter(Boolean).join(' · '))}</p></div></div>
    <p class="tv-nota" id="liveNota">Sin audio. No grabes ni compartas la transmisión; el enlace deja de servir cuando termina.</p>`;
  reproductor = creaReproductor(document.getElementById('liveReproductor'), {
    titulo: nombre,
    pideTicket: () => rpc('v2_live_publico_ticket', { enlace: codigo }),
    alRechazo: r => {
      const mm = motivo(r?.motivo);
      if (['terminada', 'no_existe'].includes(r?.motivo)) return aviso(mm.titulo, mm.texto);
      reproductor.aviso(mm.texto);
    }
  });
  reproductor.poster('', info.ok ? 'Toca play para ver.' : m.texto);
  document.getElementById('liveReproductor').addEventListener('live:play', () => reproductor.arranca());
}

window.addEventListener('hashchange', () => location.reload());
await abre();
