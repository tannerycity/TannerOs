/* El nombre de la plataforma que se vende a otros clubes (22/11/2026).
   Presidencia: "que no venga nada con los nombres de Tannery, ni TannerOS, ni
   Tanners... ya escogimos el nombre de nuestra plataforma... ahorita te lo
   digo". Y luego: "sí, se llama Mi Club FC". Es el nombre oficial. Cambiarlo
   es cambiar esta línea: todo lo que ve un club que no es Tannery (incluidos los clubes demo)
   sale de aquí. Tannery se sigue viendo como TannerOS. */
export const PLATAFORMA = Object.freeze({
  nombre: 'Mi Club FC',
  jugador: Object.freeze({ singular: 'Jugador', plural: 'Jugadores' }),
  // Dominios propios de Mi Club FC (sin "www."). Vacío hasta que Presidencia
  // compre el dominio: entonces se agrega aquí y la entrada sin ?club= deja de
  // verse como Tannery en ese dominio (v2/entrada-club.js).
  dominios: Object.freeze([])
});

// ¿Estamos en un dominio de la plataforma? (las pruebas lo fuerzan con
// window.__tosDominioPlataforma).
export const esDominioPlataforma = (host = globalThis.location?.hostname || '') =>
  !!globalThis.__tosDominioPlataforma || PLATAFORMA.dominios.includes(String(host).replace(/^www\./, ''));

// ¿Es Tannery? Por la marca guardada del club. Sin marca guardada no se sabe
// de quién es, y se deja como estaba (Tannery): los clubes demo y los nuevos sí
// la traen, porque el alta guarda su nombre.
export const esTannery = marca => { const t = String(marca?.brand || marca?.name || '').trim(); return !t || /tannery/i.test(t); };
