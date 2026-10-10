/* La pantalla de entrada se pinta con el club de la liga.
   El dueño de un club nuevo recibe /?club=<slug>&alta=1 en su bienvenida: ve
   el nombre de SU club, no el escudo de Tannery, y la pestaña "Tengo
   invitación" ya abierta. Sin ?club= la entrada sigue igual (Tannery).
   El nombre sale de v2_public_context, que cualquiera puede leer: es el mismo
   dato que muestra el registro público del club. */
import { createClient } from '/v2/supabase-client.js';
import { clubDeLaLiga } from '/v2/club-publico.js';

const supabase = createClient('https://pacnegivzgxpanphrnwp.supabase.co', 'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG');
const q = sel => document.querySelector(sel);

export function textosDeEntrada(nombre) {
  return {
    bajada: `Jugadores, cobros, tienda y entrenamientos de ${nombre}, en un solo lugar.`,
    pie: `TannerOS · el sistema de ${nombre}`,
    titulo: `TannerOS · ${nombre}`
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
  if (!club || club === 'tannery-city-fc') return;
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
  if (q('.tc-bajada')) q('.tc-bajada').textContent = t.bajada;
  if (q('.tc-pie')) q('.tc-pie').textContent = t.pie;
  document.title = t.titulo;
  document.documentElement.dataset.club = club;
}

pinta();
