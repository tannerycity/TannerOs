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
