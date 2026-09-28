/* Las reglas de la credencial Tanner.
 *
 * Sin DOM y sin canvas: entran datos y salen datos, para poder probarlo sin
 * abrir un navegador. Quien dibuja es welcome-card.js.
 *
 * EL REPARTO QUE DA SENTIDO A ESTE ARCHIVO
 *
 * Del mismo registro salen DOS documentos, y tienen trabajos opuestos:
 *
 *   CREDENCIAL  la ve el club. Su trabajo es que alguien identifique al
 *               Tanner rapido: en la portería, en la cancha, en el sistema.
 *               Entre mas datos utiles, mejor.
 *
 *   REDES       la comparte la familia. Su trabajo es presumir. Entre MENOS
 *               datos, mejor: lo que se sube a una historia de Instagram lo
 *               puede ver cualquiera, y aqui estamos hablando de menores.
 *
 * Una sola ficha tratando de ser las dos termina llevando el folio a Instagram
 * y dejando al de la puerta sin saber la edad del niño. Por eso se separan, y
 * por eso la version de redes tiene un candado: el permiso de imagen. */

/* ---- Edad ----

   El dato mas pedido y el unico que la ficha no traia, aunque la fecha de
   nacimiento esta capturada en el 100% de los Tanners. Sirve para dos cosas a
   la vez: identificarlo de un vistazo, y ver si su categoria le corresponde.

   Se calcula con mes y dia, no restando años: un niño que cumple en diciembre
   no tiene la misma edad en enero que uno que cumplio en febrero, y en
   categorias infantiles ese año de diferencia es el jugador entero. */
export function edadDe(fechaNacimiento, hoy = new Date()) {
  if (!fechaNacimiento) return null;
  const n = fechaNacimiento instanceof Date ? fechaNacimiento : new Date(`${fechaNacimiento}T00:00:00`);
  if (Number.isNaN(n.getTime())) return null;
  let edad = hoy.getFullYear() - n.getFullYear();
  const mes = hoy.getMonth() - n.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < n.getDate())) edad--;
  // Una fecha en el futuro, o un tecleo de más, no produce una edad negativa
  // impresa en una credencial.
  return edad >= 0 && edad < 120 ? edad : null;
}

export function edadTexto(fechaNacimiento, hoy = new Date()) {
  const e = edadDe(fechaNacimiento, hoy);
  if (e === null) return null;
  return e === 1 ? '1 año' : `${e} años`;
}

/* ---- Pie dominante ----
   Se guarda en ingles por la migracion; en una credencial del club se lee en
   español. */
const PIES = { right: 'Derecho', left: 'Izquierdo', both: 'Ambos',
               derecho: 'Derecho', izquierdo: 'Izquierdo', ambos: 'Ambos' };
export function pieTexto(valor) {
  const v = String(valor ?? '').trim().toLowerCase();
  return PIES[v] || null;
}

/* ---- Que renglones lleva la credencial ----

   Devuelve solo los que tienen algo que decir. Un renglon con una raya ocupa
   el mismo lugar que uno con informacion y no sirve para nada: la credencial
   se lee de pie, con la familia enfrente. */
export function renglonesDeCredencial(d = {}) {
  // Sin 'Categoría': ya sale arriba, junto al nombre. Repetir un dato en la
  // misma cara gasta un lugar que otro dato necesitaba, y hace dudar de si son
  // dos cosas distintas.
  /* Sólo lo que el registro de verdad captura.
   *
   * Aquí hubo también 'Dorsal' y 'Posición', y estaban de más: quien acaba de
   * registrarse es un prospecto, no un Tanner todavía. No tiene dorsal porque
   * nadie se lo ha asignado, y el formulario público ni siquiera los pregunta.
   *
   * Dejar el soporte "por si acaso" no es gratis: hace creer que la credencial
   * los trae, y el día que alguien la mire vacía va a buscar el bug donde no
   * está. Cuando exista la credencial del Tanner ya inscrito —esa sí tiene
   * dorsal (50 de 64) y posición (57 de 64)— se agregan ahí, con quien se los
   * pase. */
  const filas = [
    ['Edad', edadTexto(d.birthDate, d.hoy)],
    ['Pie', pieTexto(d.dominantFoot)],
    ['Escuela', d.school ? String(d.school).trim() : null]
  ];
  return filas
    .filter(([, valor]) => valor)
    .map(([etiqueta, valor]) => ({ etiqueta, valor }));
}

/* ---- El candado de redes ----

   La version para compartir SOLO existe si la familia autorizo el uso de la
   imagen del menor. No es una preferencia de diseño: es la respuesta que el
   club guarda en image_consent, y la unica lectura segura es que sin un SI
   explicito, no se genera.

   Ojo con el booleano solo: `false` puede significar "dijo que no" o "nunca se
   le pregunto", y son cosas distintas para el club —a uno hay que respetarlo,
   al otro hay que preguntarle—. Para ESTA decision las dos llevan al mismo
   lado, asi que basta con exigir el true; el club distingue las dos en su
   propia pantalla. */
export function puedeCompartirse(d = {}) {
  return d.imageConsent === true;
}

export function motivoSinCompartir(d = {}) {
  if (d.imageConsent === true) return null;
  if (d.imageConsent === false && d.imageConsentAt)
    return 'La familia no autorizó el uso de la imagen.';
  return 'Falta que la familia autorice el uso de la imagen.';
}

/* ---- Que lleva la version de redes ----

   Lo minimo que se puede presumir. Lo que NO lleva es la lista importante:

     folio           es un numero interno, no le dice nada a nadie de fuera
     fecha exacta    ubica a un menor en el tiempo sin necesidad
     escuela         dice donde encontrarlo todos los dias
     telefono        nunca, en ningun caso

   Queda el nombre, la categoria y la marca. Es lo que hace bonita una historia
   y no le da a un extraño nada que usar. */
export function datosParaRedes(d = {}) {
  return {
    nombre: `${d.firstName || ''} ${d.lastName || ''}`.trim(),
    categoria: d.category || null,
    // La edad si entra: en un club infantil es parte del orgullo ("mi hijo de
    // 4 años ya es Tanner") y no ubica a nadie, a diferencia de la fecha.
    edad: edadTexto(d.birthDate, d.hoy),
    fotoUrl: d.photoUrl || null
  };
}

/* ---- El QR ----

   La credencial lleva un codigo que abre al Tanner en TannerOS. Ese es el
   "identificarlo en chinga": se escanea y sale su expediente, sin buscar y
   sin teclear un nombre que se escribe de tres formas.

   Se apunta al buscador con el folio y no a una pantalla concreta, porque el
   folio es lo unico que la credencial tiene garantizado y el buscador ya sabe
   encontrar prospectos, Tanners, papás y pedidos. Si mañana cambia dónde vive
   el expediente, el buscador sigue llevando ahi. */
export const HOST_TANNEROS = 'https://app.tannerycity.com';
export function ligaDeBusqueda(folio, host = HOST_TANNEROS) {
  const f = String(folio ?? '').trim();
  if (!f) return null;
  return `${host}/v2/?buscar=${encodeURIComponent(f)}`;
}
