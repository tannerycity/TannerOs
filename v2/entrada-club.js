/* La pantalla de entrada se pinta con el club de la liga.
   El dueño de un club nuevo recibe /?club=<slug>&alta=1 en su bienvenida: ve
   el nombre de SU club, no el escudo de Tannery, y la pestaña "Tengo
   invitación" ya abierta. Sin ?club= la entrada sigue igual (Tannery).
   El nombre sale de v2_public_context, que cualquiera puede leer: es el mismo
   dato que muestra el registro público del club. */
import { createClient } from '/v2/supabase-client.js';
import { clubDeLaLiga, propagaClub } from '/v2/club-publico.js';
import { PLATAFORMA, esDominioPlataforma } from '/v2/plataforma.js';

const supabase = createClient('https://pacnegivzgxpanphrnwp.supabase.co', 'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG');
const q = sel => document.querySelector(sel);

export function textosDeEntrada(nombre) {
  return {
    bajada: `Bienvenido a ${nombre}. ¿A dónde vas hoy?`,
    pie: `${PLATAFORMA.nombre} · el sistema de ${nombre}`,
    titulo: `${PLATAFORMA.nombre} · ${nombre}`
  };
}

async function pinta() {
  const club = clubDeLaLiga();
  const params = new URLSearchParams(location.search);
  // La app engancha sus pestañas después de cargar; se reintenta hasta que
  // "Tengo invitación" quede abierta.
  if (params.get('alta') === '1') {
    let intentos = 0;
    const abre = () => {
      const tab = q('#signUpTab');
      if (tab && !tab.classList.contains('active')) tab.click();
      if ((!tab || !tab.classList.contains('active')) && ++intentos < 40) setTimeout(abre, 100);
    };
    abre();
  }
  // Las salidas para familias llevan el club: su tienda, no la de Tannery.
  propagaClub(document.querySelector('.tc-familias') || undefined);
  // En el dominio de Mi Club FC y sin ?club=: la entrada de la plataforma, no
  // la de Tannery (22/11/2026). Sólo staff (cada club entra con su cuenta) y la
  // demo; las puertas de familias necesitan saber el club.
  if (!club && esDominioPlataforma()) return entradaDePlataforma();
  if (!club || club === 'tannery-city-fc') return;
  // /costos tiene los precios de Tannery: en la entrada de otro club no va.
  q('.tc-familias [data-familia="costos"]')?.remove();
  let ctx = null;
  try {
    const { data, error } = await supabase.rpc('v2_public_context', { club_key: club });
    if (error) throw error;
    ctx = data;
  } catch { return; }
  const nombre = String(ctx?.brand || ctx?.organizationName || '').trim();
  if (!nombre) return;
  const t = textosDeEntrada(nombre);
  // Fuera el escudo y la firma de Tannery; el nombre del club en su lugar.
  q('.tc-escudo')?.remove();
  q('.tc-hashtag')?.remove();
  const firma = q('.tc-wordmark');
  if (firma) {
    const h = document.createElement('p');
    h.className = 'tc-club-nombre';
    h.textContent = nombre;
    firma.replaceWith(h);
  }
  if (q('.tc-titular')) q('.tc-titular').textContent = 'Bienvenido.';
  if (q('.tc-bajada')) q('.tc-bajada').textContent = t.bajada;
  if (q('.tc-pie')) q('.tc-pie').textContent = t.pie;
  document.title = t.titulo;
  document.documentElement.dataset.club = club;
}

function entradaDePlataforma() {
  ['.tc-escudo', '.tc-hashtag', '.tc-trabaja'].forEach(s => q(s)?.remove());
  document.querySelectorAll('.tc-familias [data-familia]').forEach(a => a.remove());
  const firma = q('.tc-wordmark');
  if (firma) { const h = document.createElement('p'); h.className = 'tc-club-nombre'; h.textContent = PLATAFORMA.nombre; firma.replaceWith(h); }
  if (q('.tc-titular')) q('.tc-titular').textContent = 'La app de tu club.';
  if (q('.tc-bajada')) q('.tc-bajada').textContent = 'Cobranza, jugadores, asistencia, tienda y familias en un solo lugar.';
  const nav = q('.tc-familias');
  if (nav && !nav.querySelector('[data-puerta="demo"]')) {
    const demo = document.createElement('a');
    demo.className = 'tc-puerta principal'; demo.href = '/demo/'; demo.dataset.puerta = 'demo';
    demo.innerHTML = '<span class="tc-icono" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z"/></svg></span><span class="tc-puerta-txt"><b>Ver la demo</b><small>Entra sin registrarte</small></span><span class="tc-chevron" aria-hidden="true">›</span>';
    nav.prepend(demo);
  }
  if (q('.tc-pie')) q('.tc-pie').textContent = `${PLATAFORMA.nombre} · software para clubes y academias de fútbol`;
  document.title = `${PLATAFORMA.nombre} · La app de tu club de fútbol`;
  document.documentElement.dataset.plataforma = '1';
}

pinta();
