/* Las reglas de comprar en el club.

   Las comparten las tres tiendas —el mostrador de Taquilla, el portal de las
   familias y lo que ve Presidencia— porque comprar un jersey es lo mismo en
   las tres: qué talla, para quién, cuántos y con qué nombre. Lo que cambia es
   la pantalla, no la regla.

   Sin DOM y sin llamadas: entran datos y salen datos, para poder probarlo sin
   abrir un navegador. */

/* ---- Talla ----

   La regla más importante de este archivo, y la que costó un susto.

   El portal de las familias ofrecía la talla en un <select>. Un <select>
   nace con su primera opción seleccionada, así que mientras el catálogo no
   tuvo tallas capturadas no pasaba nada: no había selector y la talla viajaba
   vacía, y alguien del club la preguntaba por WhatsApp.

   El día que se capturaron las doce tallas, ese mismo <select> empezó a salir
   con "6" puesto. Un papá de un Tanner de catorce años que tocara "Agregar"
   sin abrir el selector pedía un jersey talla 6 — y el pedido se veía
   perfectamente normal, con su talla y todo, hasta que llegaba la caja.

   Por eso aquí una talla no elegida NO es la primera de la lista: es nada, y
   la pantalla tiene que pedirla. Un hueco se ve; una talla equivocada, no. */
export function tallaValida(producto, elegida) {
  const tallas = tallasDe(producto);
  const valor = String(elegida ?? '').trim();
  if (!tallas.length) return valor || null;   // sin catálogo de tallas, lo que escriban
  return tallas.includes(valor) ? valor : null;
}
export function tallasDe(producto) {
  const t = producto?.sizes;
  return Array.isArray(t) ? t.map(x => String(x ?? '').trim()).filter(Boolean) : [];
}
/* Un producto de talla única no tiene por qué hacer que nadie elija nada: las
   calcetas del club son "Universal" y pedirle al papá que la toque es un clic
   que no informa. */
export function tallaUnica(producto) {
  const t = tallasDe(producto);
  return t.length === 1 ? t[0] : null;
}

/* ---- Personalización ----

   El nombre y el número son lo que hace que una playera valga lo que vale, y
   son también lo que no se puede devolver: una vez estampada, esa prenda es
   de esa persona. Por eso sólo se ofrecen donde el club de verdad las estampa
   —jerseys y uniformes— y nunca en unas calcetas. */
/* El kit entra aquí, y es lo que la prueba encontró: un "Kit Tanner
   Completo" lleva jersey, y el jersey lleva el nombre del Tanner. Dejarlo
   fuera significaba que el producto estrella del club —el que más se vende
   al inscribirse— era el único que no se podía personalizar.

   Ofrecer el campo de más no hace daño: el nombre y el número son
   opcionales y quien no los quiere los deja en blanco. No ofrecerlos donde
   sí aplican sí lo hace: la familia no tiene cómo pedir lo que quiere. */
const PERSONALIZABLE = /\b(jersey|playera|uniforme|conjunto|kit)\b/i;
export function aceptaPersonalizacion(producto) {
  return PERSONALIZABLE.test(`${producto?.category || ''} ${producto?.name || ''}`);
}
export function numeroValido(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  // Un dorsal es de uno a tres dígitos. "007" se respeta: si la familia lo
  // pide así, así se estampa.
  return /^\d{1,3}$/.test(s) ? s : null;
}
export function nombreValido(v) {
  const s = String(v ?? '').trim().replace(/\s+/g, ' ');
  if (!s) return null;
  return s.slice(0, 20);   // lo que cabe en una espalda
}

/* ---- Cantidad ---- */
export function cantidadValida(v) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 20);
}

/* ---- ¿Se puede agregar? ----

   Devuelve la línea lista, o el motivo por el que todavía no. El motivo se
   escribe para leerse en la pantalla tal cual: quien compra no tiene por qué
   traducir un código de error. */
export function preparaLinea(producto, opciones = {}) {
  if (!producto?.id) return { ok: false, motivo: 'Ese producto ya no está disponible.' };

  const unica = tallaUnica(producto);
  const talla = unica || tallaValida(producto, opciones.talla);
  if (!talla && tallasDe(producto).length) {
    return { ok: false, motivo: 'Elige la talla.', falta: 'talla' };
  }

  const cantidad = cantidadValida(opciones.cantidad);
  const personaliza = aceptaPersonalizacion(producto);
  const nombre = personaliza ? nombreValido(opciones.nombre) : null;
  const numeroCrudo = String(opciones.numero ?? '').trim();
  const numero = personaliza ? numeroValido(numeroCrudo) : null;

  // Un número que no es número se dice, en vez de estamparse mal o perderse
  // en silencio.
  if (personaliza && numeroCrudo && !numero) {
    return { ok: false, motivo: 'El número va de 1 a 3 dígitos.', falta: 'numero' };
  }

  return {
    ok: true,
    linea: {
      productId: producto.id, nombreProducto: producto.name || 'Producto',
      talla, cantidad,
      personalizationName: nombre, numero,
      precioUnitario: Number(producto.price || 0),
      total: Number(producto.price || 0) * cantidad
    }
  };
}

/* La llave de una línea del carrito.

   Dos jerseys del mismo modelo en tallas distintas son dos renglones, no uno
   con cantidad dos: el proveedor corta por talla. Y dos con el mismo nombre y
   número distinto también, porque son dos hermanos. */
export function llaveDeLinea(l) {
  return [l.productId, l.talla || '', l.personalizationName || '', l.numero || ''].join('|');
}

export function agregaAlCarrito(carrito, linea) {
  const k = llaveDeLinea(linea);
  const copia = { ...carrito };
  if (copia[k]) {
    const cantidad = cantidadValida(copia[k].cantidad + linea.cantidad);
    copia[k] = { ...copia[k], cantidad, total: copia[k].precioUnitario * cantidad };
  } else {
    copia[k] = { ...linea };
  }
  return copia;
}
export function quitaDelCarrito(carrito, llave) {
  const copia = { ...carrito };
  delete copia[llave];
  return copia;
}
export function totalDelCarrito(carrito) {
  return Object.values(carrito || {}).reduce((s, l) => s + Number(l.total || 0), 0);
}
export function piezasDelCarrito(carrito) {
  return Object.values(carrito || {}).reduce((s, l) => s + Number(l.cantidad || 0), 0);
}

/* ---- Cómo se acomoda la vitrina ----

   Un club no vende piezas sueltas: vende el uniforme. Un papá que acaba de
   inscribir a su hijo quiere "lo que necesita para entrenar", no armar un
   jersey más un short más calcetas y esperar que combinen.

   Por eso los kits van primero y en grande, y las piezas después. No es
   decoración: es lo que sube lo que se lleva cada familia y lo que le quita
   decisiones a quien no sabe qué comprar. */
const ORDEN = ['kit', 'jersey', 'shorts', 'socks', 'outerwear', 'pants'];
export function ordenDeVitrina(producto) {
  const c = String(producto?.category || '').toLowerCase();
  const i = ORDEN.findIndex(x => c.includes(x));
  return i < 0 ? ORDEN.length : i;
}
export function acomodaVitrina(productos = []) {
  return [...(Array.isArray(productos) ? productos : [])]
    .sort((a, b) => ordenDeVitrina(a) - ordenDeVitrina(b)
      || String(a?.name || '').localeCompare(String(b?.name || ''), 'es'));
}

/* ---- La escala de tallas del club ----

   Confirmada por Presidencia: niños de 6 a 16, adultos de XS a XXL. Vive aquí
   y no en la pantalla porque la usan las tres tiendas y el formulario que las
   captura: si cada una escribe su propia lista, vuelven a convivir "12",
   "Mediana" y "Universal" para decir cosas parecidas, y el proveedor recibe
   esa hoja y adivina. */
export const ESCALA_NINOS = ['6', '8', '10', '12', '14', '16'];
export const ESCALA_ADULTOS = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
export const ESCALA_CLUB = [...ESCALA_NINOS, ...ESCALA_ADULTOS];
export const TALLA_UNICA = 'Universal';

/* Ordena unas tallas como las ordena el club, no como las ordena el alfabeto.
   Alfabéticamente la 10 va antes que la 8 y la S antes que la XS: en una hoja
   de corte eso se lee mal y se corta peor. */
export function ordenaTallas(tallas = []) {
  const pos = t => {
    const i = ESCALA_CLUB.indexOf(String(t).trim());
    return i < 0 ? ESCALA_CLUB.length : i;
  };
  return [...tallas].sort((a, b) => pos(a) - pos(b) || String(a).localeCompare(String(b), 'es'));
}

/* ---- Qué es cada producto ----

   La categoría no es una etiqueta decorativa: la hoja de producción la lee
   para saber si una pieza es playera, short o calcetas, y con eso decide en
   qué columna cae su talla. Escrita a mano acabaron conviviendo cinco formas
   distintas para ocho productos —"Jersey / Playera", "jersey", "Jersey",
   "Short", "shorts"—, así que aquí está la lista cerrada.

   El valor es el que se guarda; la etiqueta es la que se toca. Cambiar un
   valor de esta lista rompe la hoja de producción: v2/produccion/hoja.js tiene
   que seguir clasificándolos bien, y scripts/qa-tienda.mjs lo comprueba. */
/* Sin 'kit' a proposito. Un kit no es una pieza: se arma en el panel de KITS
   escogiendo las piezas que lo forman. Ofrecerlo tambien como categoria de
   producto abre un segundo camino para lo mismo —y el segundo camino es el
   que produce un "producto" llamado Kit que ningun kit conoce—. Lo encontro
   la prueba: la hoja de produccion no sabia que hacer con el. */
export const CATEGORIAS = [
  { valor: 'jersey',    etiqueta: 'Jersey' },
  { valor: 'shorts',    etiqueta: 'Short' },
  { valor: 'socks',     etiqueta: 'Calcetas' },
  { valor: 'outerwear', etiqueta: 'Sudadera' },
  { valor: 'pants',     etiqueta: 'Pants' }
];

/* Traduce lo que ya está guardado a uno de los valores de arriba, para que al
   abrir un producto viejo se le prenda su botón en vez de mandarlo a "Otro" y
   hacer creer que no tiene categoría. */
export function categoriaCanonica(texto) {
  const c = String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!c) return null;
  if (/\bkit\b|\bpaquete\b/.test(c)) return 'kit';
  if (/\bjersey\b|\bplayera\b|\buniforme\b|\bconjunto\b/.test(c)) return 'jersey';
  if (/\bshort\b|\bshorts\b/.test(c)) return 'shorts';
  if (/\bsock\b|\bsocks\b|\bcalceta\b|\bcalcetas\b/.test(c)) return 'socks';
  if (/\bhoodie\b|\bsudadera\b|\bchamarra\b|\bouterwear\b/.test(c)) return 'outerwear';
  if (/\bpants\b|\bpantalon\b/.test(c)) return 'pants';
  return null;   // no se fuerza: lo que no cuadra se queda como lo escribieron
}
