/* De qué club es una página pública.
   Las páginas que se abren sin sesión (registro, programas, academias,
   tienda, Centro Tanner, aviso de privacidad) dicen su club en la liga:
   ?club=<slug>. Sin ese dato van a Tannery, el primer club, para que los
   QR y ligas que ya están impresos sigan funcionando.

   Es el único lugar donde vive la llave de Tannery: la barrera
   club-sin-llave-fija no deja escribirla en otro archivo. */

export const LLAVE_POR_OMISION = '1850TC1850';
const VALIDA = /^[a-z0-9][a-z0-9-]{1,63}$/i;

export function clubDeLaLiga(search = globalThis.location?.search || '') {
  const c = new URLSearchParams(search).get('club');
  return c && VALIDA.test(c.trim()) ? c.trim().toLowerCase() : '';
}

// La llave que se manda a los RPC públicos (club_key).
export function llaveDeLiga(search) {
  return clubDeLaLiga(search) || LLAVE_POR_OMISION;
}

// Agrega ?club= a una ruta propia, sin tocar ligas externas ni anclas. Si la
// página se abrió sin club, la deja igual: así las de Tannery no cambian.
export function conClub(href, club = clubDeLaLiga()) {
  if (!club || !href || /^(?:[a-z]+:|\/\/|#)/i.test(href) || !href.startsWith('/')) return href;
  const [ruta, ancla = ''] = href.split('#');
  const [camino, query = ''] = ruta.split('?');
  const q = new URLSearchParams(query);
  q.set('club', club);
  return `${camino}?${q.toString()}${ancla ? `#${ancla}` : ''}`;
}

// Pasa el club a todas las ligas propias dentro de root: navegar entre
// páginas públicas no debe regresar a nadie a Tannery.
export function propagaClub(root = globalThis.document, club = clubDeLaLiga()) {
  if (!club || !root?.querySelectorAll) return;
  root.querySelectorAll('a[href^="/"]').forEach(a => { a.setAttribute('href', conClub(a.getAttribute('href'), club)); });
}

// La liga pública que comparte el staff desde la app: siempre con el club de
// quien la genera. ruta = '/programas/', params = { program: 'visoria' }.
export function ligaPublica(ruta, ctx, params = {}, origen = globalThis.location?.origin || '') {
  const q = new URLSearchParams();
  const slug = String(ctx?.organization_slug || '').trim();
  if (slug) q.set('club', slug);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, v);
  const s = q.toString();
  return `${origen}${ruta}${s ? `?${s}` : ''}`;
}
