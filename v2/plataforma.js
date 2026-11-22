/* El nombre de la plataforma que se vende a otros clubes (22/11/2026).
   Presidencia: "que no venga nada con los nombres de Tannery, ni TannerOS, ni
   Tanners... ya escogimos el nombre de nuestra plataforma... ahorita te lo
   digo". Mientras llega, "Mi Club FC". Cambiar el nombre es cambiar esta
   línea: todo lo que ve un club que no es Tannery (incluidos los clubes demo)
   sale de aquí. Tannery se sigue viendo como TannerOS. */
export const PLATAFORMA = Object.freeze({
  nombre: 'Mi Club FC',
  jugador: Object.freeze({ singular: 'Jugador', plural: 'Jugadores' })
});

// ¿Es Tannery? Por la marca guardada del club. Sin marca guardada no se sabe
// de quién es, y se deja como estaba (Tannery): los clubes demo y los nuevos sí
// la traen, porque el alta guarda su nombre.
export const esTannery = marca => { const t = String(marca?.brand || marca?.name || '').trim(); return !t || /tannery/i.test(t); };
