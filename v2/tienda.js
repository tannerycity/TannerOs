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
/* Desde el 13/10/2026 Presidencia lo fija por producto con la casilla "Lleva
   nombre y número" del catálogo: "no todos los jerseys o productos van a
   llevar eso". Si nadie la ha tocado (null), decide el nombre como siempre. */
export function aceptaPersonalizacion(producto) {
  if (typeof producto?.personalizable === 'boolean') return producto.personalizable;
  return PERSONALIZABLE.test(`${producto?.category || ''} ${producto?.name || ''}`);
}
/* La manga es de la prenda, no del estampado: un jersey sin nombre igual
   es corta o larga. Misma regla que el servidor (h5b). */
const PRENDA_CON_MANGA = /jersey|uniforme|playera/i;
export function llevaManga(producto) {
  return PRENDA_CON_MANGA.test(producto?.name || '');
}
/* Manga larga con cargo (14/10/2026: "se paga 50 pesos más por ser de manga
   larga"). El cargo lo fija el club y viaja con el catálogo (recargoManga en
   cada producto y kit). Igual que private.aplica_recargo_manga. */
export const recargoDe = x => Math.max(0, Number(x?.recargoManga || 0));
export function textoRecargo(r, fmt = n => `$${n}`) { return r > 0 ? `+${fmt(r)}` : ''; }
/* Le pone el cargo del club a productos y kits (lo hace quien carga el catálogo). */
export function conRecargo(catalogo, recargo) {
  const r = Math.max(0, Number(recargo || 0));
  if (!r) return catalogo;
  return { ...catalogo,
    products: (catalogo.products || []).map(p => ({ ...p, recargoManga: r })),
    bundles: (catalogo.bundles || []).map(k => ({ ...k, recargoManga: r })) };
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

/* La manga del jersey: corta salvo que pidan larga. El proveedor corta
   distinto cada una, así que viaja en el pedido y se ve en el admin. */
export function mangaValida(m) {
  return String(m || '').trim().toLowerCase() === 'larga' ? 'larga' : 'corta';
}

export function textoManga(m) {
  return m === 'larga' ? 'Manga larga' : m === 'corta' ? 'Manga corta' : '';
}

/* ---- ¿Se puede agregar? ----

   Devuelve la línea lista, o el motivo por el que todavía no. El motivo se
   escribe para leerse en la pantalla tal cual: quien compra no tiene por qué
   traducir un código de error. */
/* Precio de niño (14/10/2026): un producto puede tener precio de niño; las
   tallas de niño (2 a 16) cobran ése. Con oferta, lo que más le convenga a la
   familia: no se suman ("uno u otro"). Igual que private.precio_producto. */
const TALLAS_NINO = ['2', '4', '6', '8', '10', '12', '14', '16'];
export function precioNinoDe(producto) {
  const n = Number(producto?.price_kid ?? producto?.priceKid ?? 0);
  return n > 0 ? n : null;
}
export function precioDeProducto(producto, talla) {
  const base = Number(producto?.price || 0), nino = precioNinoDe(producto);
  return nino && TALLAS_NINO.includes(String(talla ?? '').trim()) ? Math.min(nino, base) : base;
}
/* Lo que dice la etiqueta antes de elegir talla: "Desde $599" si hay precio de niño. */
export function precioDeEtiqueta(producto, talla) {
  if (talla) return { desde: false, monto: precioDeProducto(producto, talla) };
  const nino = precioNinoDe(producto), base = Number(producto?.price || 0);
  return nino && nino < base ? { desde: true, monto: nino } : { desde: false, monto: base };
}

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
  const manga = (personaliza || llevaManga(producto)) ? mangaValida(opciones.manga) : null;

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
      personalizationName: nombre, numero, manga,
      precioUnitario: precioDeProducto(producto, talla) + (manga === 'larga' ? recargoDe(producto) : 0),
      total: (precioDeProducto(producto, talla) + (manga === 'larga' ? recargoDe(producto) : 0)) * cantidad
    }
  };
}

/* Varias tallas a la vez (18/10/2026): "se meten a pedir la Japanese y dicen,
   yo quiero una chica y una grande". Sólo piezas sin estampado y con más de
   una talla: lo estampado es personal y se arma una por una. */
export function admiteVariasTallas(producto) {
  return !!producto?.id && !aceptaPersonalizacion(producto) && !tallaUnica(producto) && tallasDe(producto).length > 1;
}
// {talla: cantidad} -> una línea por talla, en el orden del catálogo.
export function preparaLineasPorTalla(producto, opciones = {}) {
  const cantidades = opciones.cantidades || {};
  const tallas = tallasDe(producto).filter(t => Number(cantidades[t]) > 0);
  if (!tallas.length) return { ok: false, motivo: 'Elige al menos una talla.', falta: 'talla' };
  const lineas = [];
  for (const talla of tallas) {
    const r = preparaLinea(producto, { talla, cantidad: cantidades[talla], manga: opciones.manga });
    if (!r.ok) return r;
    lineas.push(r.linea);
  }
  return { ok: true, lineas, piezas: lineas.reduce((s, l) => s + l.cantidad, 0), total: lineas.reduce((s, l) => s + l.total, 0) };
}
// Tocar una talla la agrega con 1 o la quita; los botones − y + mueven la cantidad.
export function cambiaCantidadDeTalla(cantidades = {}, talla, delta = null) {
  const copia = { ...cantidades };
  const actual = Number(copia[talla]) || 0;
  const nueva = delta === null ? (actual ? 0 : 1) : Math.max(0, Math.min(20, actual + Number(delta)));
  if (nueva) copia[talla] = nueva; else delete copia[talla];
  return copia;
}

/* La llave de una línea del carrito.

   Dos jerseys del mismo modelo en tallas distintas son dos renglones, no uno
   con cantidad dos: el proveedor corta por talla. Y dos con el mismo nombre y
   número distinto también, porque son dos hermanos. */
export function llaveDeLinea(l) {
  return [l.productId, l.talla || '', l.personalizationName || '', l.numero || '', l.manga || ''].join('|');
}

export function agregaAlCarrito(carrito, linea) {
  // llaveDeCarrito y no llaveDeLinea: la de pieza mira productId y talla, que
  // un kit no tiene, asi que DOS kits distintos caian en la misma llave y se
  // fundian en un renglon. Se vio al probar dos hermanos con el mismo dorsal y
  // distinta talla.
  const k = llaveDeCarrito(linea);
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

/* ---- Los kits ----

   Un club no vende piezas: vende el uniforme. El kit es el producto estrella
   —el que más se vende al inscribirse— y hasta hoy el portal de las familias
   no lo ofrecía: la familia veía ocho piezas sueltas y tenía que armar el
   uniforme de cabeza, adivinando cuáles van juntas.

   Un kit NO es un producto con más cosas: tiene precio de adulto y de niño,
   trae piezas que cada una pide su talla, y su precio no es la suma de las
   partes. Por eso sus reglas viven aparte. */

/* Cuántas veces hay que pedir talla.

   Si el kit trae dos shorts, se preguntan DOS tallas y no una: son para dos
   personas distintas, o son dos tallas del mismo Tanner que crece. Devuelve
   una ranura por unidad, con su etiqueta ya numerada cuando hay más de una. */
export function ranurasDeKit(kit) {
  const piezas = Array.isArray(kit?.pieces) ? kit.pieces : [];
  const ranuras = [];
  piezas.forEach((pieza, k) => {
    const veces = Math.max(1, Math.min(20, Number(pieza?.qty) || 1));
    // Pieza a elegir (Kit Dúo, 14/10/2026): "2 jerseys, los que quieras".
    // La ranura no trae producto: lo trae lo que se elija entre sus opciones.
    const pool = Array.isArray(pieza?.pool) && pieza.pool.length ? pieza.pool.map(String) : null;
    const nombre = pool ? (pieza.poolName || pieza.pool_name || 'Pieza a elegir') : pieza.name;
    for (let i = 0; i < veces; i++) {
      ranuras.push(pool ? {
        id: `elige${k}#${i}`, pool, productId: null, base: nombre,
        nombre: veces > 1 ? `${nombre} ${i + 1}` : nombre,
        opciones: Array.isArray(pieza.opciones) ? pieza.opciones : [],
        producto: null, tallas: [], unica: null
      } : {
        id: `${pieza.product_id}#${i}`,
        productId: pieza.product_id,
        nombre: veces > 1 ? `${pieza.name} ${i + 1}` : pieza.name,
        producto: pieza,
        // Una pieza sin catálogo de tallas no pide talla: las calcetas
        // Universal no tienen por qué costar un toque.
        tallas: tallasDe(pieza),
        unica: tallaUnica(pieza)
      });
    }
  });
  return ranuras;
}
/* La ranura a elegir ya con su producto: de ahí salen sus tallas. */
export function ranuraElegida(r, elegidos = {}) {
  if (!r?.pool) return r;
  const id = elegidos?.[r.id];
  const p = id && r.pool.includes(String(id)) ? (r.opciones || []).find(o => String(o.id ?? o.product_id) === String(id)) : null;
  if (!p) return r;
  return { ...r, productId: String(p.id ?? p.product_id), producto: p, elegido: p, tallas: tallasDe(p), unica: tallaUnica(p) };
}
/* "Jersey "Wet Blue" - Home Edition" -> "Wet Blue": para botones chicos. */
export function nombreCorto(n) {
  const t = String(n || '').replace(/^jersey\s+/i, '').replace(/["“”]/g, '').split(' - ')[0].replace(/\s+edition$/i, '').trim();
  return t || String(n || '');
}
/* Las opciones de cada pieza a elegir salen del catálogo de la tienda: sólo
   las que se venden hoy. */
export function conOpcionesDeKit(kit, productos = []) {
  if (!Array.isArray(kit?.pieces) || !kit.pieces.some(p => Array.isArray(p?.pool))) return kit;
  const porId = new Map(productos.map(p => [String(p.id ?? p.product_id), p]));
  return { ...kit, pieces: kit.pieces.map(p => Array.isArray(p?.pool)
    ? { ...p, opciones: p.pool.map(id => porId.get(String(id))).filter(Boolean) } : p) };
}

export const TIER_ADULTO = 'Adulto';
export const TIER_NINO = 'Niño';

/* El precio según a quién es. Si el kit no tiene precio de niño, el de adulto
   manda: es lo que hace el mostrador, y dos tiendas del mismo club no pueden
   cobrar distinto por lo mismo. */
export function precioDeKit(kit, tier) {
  const nino = Number(kit?.price_kid || 0);
  if (tier === TIER_NINO && nino > 0) return nino;
  return Number(kit?.price_adult || 0);
}

export function tiersDeKit(kit) {
  const t = [TIER_ADULTO];
  if (Number(kit?.price_kid || 0) > 0) t.unshift(TIER_NINO);
  return t;
}

/* ¿Se puede agregar el kit?

   Devuelve la línea lista o el motivo. Igual que preparaLinea: el motivo se
   escribe para leerse en pantalla, y dice QUÉ falta para poder señalarlo. */
export function preparaKit(kit, opciones = {}) {
  if (!kit?.id) return { ok: false, motivo: 'Ese kit ya no está disponible.' };
  const tiers = tiersDeKit(kit);
  const tier = tiers.includes(opciones.tier) ? opciones.tier : (tiers.length === 1 ? tiers[0] : null);
  if (!tier) return { ok: false, motivo: '¿Es para adulto o para niño?', falta: 'tier' };

  const precio = precioDeKit(kit, tier);
  if (!(precio > 0)) return { ok: false, motivo: 'Ese kit todavía no tiene precio.' };

  const ranuras = ranurasDeKit(kit);
  if (!ranuras.length) return { ok: false, motivo: 'Ese kit no tiene piezas configuradas.' };

  const elegidas = opciones.tallas || {};
  const piezas = [];
  for (const r0 of ranuras) {
    const r = ranuraElegida(r0, opciones.elegidos);
    if (r.pool && !r.productId) return { ok: false, motivo: `Elige ${r.nombre.replace(/^\w/, c => c.toLowerCase())}.`, falta: r.id };
    const talla = r.unica || tallaValida(r.producto, elegidas[r.id]);
    // Una pieza sin catálogo de tallas viaja sin talla; una CON catálogo y sin
    // elegir no pasa. Un kit a medias es un pedido que el proveedor no puede
    // cortar y que revienta al guardarse, con la familia enfrente.
    if (!talla && r.tallas.length) {
      return { ok: false, motivo: `Elige la talla de ${r.nombre}.`, falta: r.id };
    }
    // Manga por jersey (14/10/2026): cada jersey del kit puede ir de manga
    // larga o corta; sin elegir, la del kit.
    const conManga = llevaManga(r.producto || { name: r.nombre });
    const mangaPieza = conManga ? mangaValida(opciones.mangas?.[r.id] || opciones.manga) : null;
    piezas.push({ productId: r.productId, talla: talla || null, nombre: r.elegido ? nombreCorto(r.elegido.name) : r.nombre, ...(mangaPieza ? { manga: mangaPieza } : {}) });
  }

  const nombre = nombreValido(opciones.nombre);
  const numeroCrudo = String(opciones.numero ?? '').trim();
  const numero = numeroValido(numeroCrudo);
  const manga = mangaValida(opciones.manga);
  const largas = piezas.filter(p => p.manga === 'larga').length;
  const total = precio + largas * recargoDe(kit);
  if (numeroCrudo && !numero) {
    return { ok: false, motivo: 'El número va de 1 a 3 dígitos.', falta: 'numero' };
  }

  return {
    ok: true,
    linea: {
      kind: 'bundle',
      bundleId: kit.id, nombreProducto: kit.name || 'Kit', tier,
      piezas, cantidad: 1, conEleccion: ranuras.some(r => r.pool) || undefined,
      personalizationName: nombre, numero, manga,
      precioUnitario: total, total, largas: largas || undefined
    }
  };
}

/* La llave de un kit en el carrito.

   Dos kits del mismo modelo con tallas distintas son dos renglones: son para
   dos hermanos. La llave lleva las tallas dentro, igual que la de una pieza
   suelta lleva la suya. */
export function llaveDeKit(l) {
  return ['kit', l.bundleId, l.tier,
    (l.piezas || []).map(p => `${p.productId}:${p.talla || ''}${p.manga ? `:${p.manga}` : ''}`).join(','),
    l.personalizationName || '', l.numero || '', l.manga || ''].join('|');
}

/* Una sola llave para el carrito, sea pieza o kit: quien agrega no tiene por
   qué saber de qué tipo es lo que agrega. */
export function llaveDeCarrito(l) {
  return l?.kind === 'bundle' ? llaveDeKit(l) : llaveDeLinea(l);
}

/* ---- ¿Lo conviertes en kit? (13/10/2026) ----

   "Los porteros me piden dos uniformes distintos, uno del kit entrenamiento y
   otro del kit game... si pido dos jerseys, que pregunte si quieren el kit,
   que les incluye un short, y si lo quieres convertir".

   Para un jersey suelto del carrito: el kit que lo trae, a qué precio y qué
   más incluye, con el kit ya lleno (talla del jersey, nombre, número, manga y
   las demás piezas en la misma talla cuando existe). Quien compra sólo
   confirma. */
function tierPorTalla(kit, talla) {
  const tiers = tiersDeKit(kit);
  if (tiers.length === 1) return tiers[0];
  return ESCALA_NINOS.includes(String(talla || '')) ? TIER_NINO : TIER_ADULTO;
}

const esJerseySuelto = l => !!l && l.kind !== 'bundle' && !!l.productId
  && (!!l.manga || PERSONALIZABLE.test(l.nombreProducto || ''));

/* Arma la sugerencia de UN kit a partir de un jersey ancla y los demás
   jerseys sueltos que llenan otras ranuras del mismo kit (los kits del club
   traen dos jerseys: Training = Black + Lechuguilla). Para no mezclar
   personas, el compañero tiene que llevar el mismo nombre en la espalda. */
function sugerenciaDe(kit, ancla, libres) {
  const ranuras = ranurasDeKit(kit);
  if (ranuras.length < 2) return null;
  const tomadas = new Map(); // ranura.id -> [llave, linea]
  const usar = (llave, l) => {
    const r = ranuras.find(x => !x.pool && String(x.productId) === String(l.productId) && !tomadas.has(x.id))
      || ranuras.find(x => x.pool && x.pool.includes(String(l.productId)) && !tomadas.has(x.id));
    if (!r) return false;
    tomadas.set(r.id, [llave, l]); return true;
  };
  if (!usar(ancla[0], ancla[1])) return null;
  const quien = String(ancla[1].personalizationName || '').trim().toLowerCase();
  for (const [llave, l] of libres) {
    if (llave === ancla[0]) continue;
    if (String(l.personalizationName || '').trim().toLowerCase() !== quien) continue;
    usar(llave, l);
  }
  const talla = ancla[1].talla;
  const tier = tierPorTalla(kit, talla);
  let precio = precioDeKit(kit, tier);
  if (!(precio > 0)) return null;
  const tallas = {}, elegidos = {}, mangas = {};
  for (const r of ranuras) {
    const t = tomadas.get(r.id);
    if (t && r.pool) elegidos[r.id] = String(t[1].productId);
    if (t && t[1].manga) mangas[r.id] = t[1].manga;
    if (r.unica) continue;
    if (t) { if (t[1].talla) tallas[r.id] = t[1].talla; continue; }
    // Lo que falta (el short, el otro jersey), en la misma talla si existe.
    if (talla && r.tallas.includes(talla)) tallas[r.id] = talla;
  }
  const cubiertas = [...tomadas.values()];
  const sueltos = cubiertas.reduce((n, [, l]) => n + Number(l.precioUnitario || 0), 0);
  // Los jerseys de manga larga llevan su cargo también dentro del kit.
  precio += cubiertas.filter(([, l]) => l.manga === 'larga').length * recargoDe(kit);
  const a = ancla[1];
  return {
    kit, tier, precio, sueltos,
    diferencia: Math.round((precio - sueltos) * 100) / 100,
    llaves: cubiertas.map(([k]) => k),
    cubre: cubiertas.map(([, l]) => l.nombreProducto),
    // "+ otro jersey a elegir y short": la pieza a elegir no tiene nombre propio.
    incluye: ranuras.filter(r => !tomadas.has(r.id)).map(r => r.pool ? `otro ${String(r.base || r.nombre).toLocaleLowerCase('es-MX')}` : r.nombre),
    opciones: { tier, tallas, elegidos, mangas, nombre: a.personalizationName || '', numero: a.numero || '', manga: a.manga || 'corta' }
  };
}

export function kitParaLinea(linea, kits = []) {
  if (!esJerseySuelto(linea)) return null;
  for (const kit of Array.isArray(kits) ? kits : []) {
    const s = sugerenciaDe(kit, ['ancla', linea], []);
    if (s) return s;
  }
  return null;
}

/* Una sugerencia por kit y por persona: si en el carrito están el Black y el
   Lechuguilla de LEO, es UN Kit Training que reemplaza a los dos, y casi
   siempre sale más barato que sueltos. */
export function sugerenciasDeKit(carrito = {}, kits = []) {
  const libres = Object.entries(carrito || {}).filter(([, l]) => esJerseySuelto(l));
  const usadas = new Set(), out = [];
  for (const ancla of libres) {
    if (usadas.has(ancla[0])) continue;
    const resto = libres.filter(([k]) => !usadas.has(k));
    for (const kit of Array.isArray(kits) ? kits : []) {
      const s = sugerenciaDe(kit, ancla, resto);
      if (!s) continue;
      s.llaves.forEach(k => usadas.add(k));
      out.push({ llave: ancla[0], linea: ancla[1], ...s });
      break;
    }
  }
  return out;
}

/* El texto de la sugerencia, igual en la tienda, el portal y el mostrador. */
export function textoSugerencia(s, formato = n => `$${n}`) {
  const lista = xs => xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}` : (xs[0] || '');
  const extra = s.incluye.length ? ` + ${lista(s.incluye).toLocaleLowerCase('es-MX')}` : '';
  const cuenta = s.diferencia < 0 ? `Te ahorras ${formato(-s.diferencia)}.` : s.diferencia > 0 ? `Sólo ${formato(s.diferencia)} más.` : 'Al mismo precio.';
  return s.cubre.length > 1
    ? `Tus ${lista(s.cubre)}${extra} = ${s.kit.name} por ${formato(s.precio)}. ${cuenta}`
    : `Tu ${s.cubre[0]} viene en el ${s.kit.name}${extra} por ${formato(s.precio)}. ${cuenta}`;
}

/* Al convertir, el jersey suelto deja el carrito: una pieza menos, o el
   renglón entero si era la única. */
export function quitaUnaPieza(carrito, llave) {
  const l = carrito?.[llave];
  if (!l) return carrito;
  if (Number(l.cantidad || 1) > 1) {
    const cantidad = Number(l.cantidad) - 1;
    return { ...carrito, [llave]: { ...l, cantidad, total: Number(l.precioUnitario || 0) * cantidad } };
  }
  return quitaDelCarrito(carrito, llave);
}

/* ---- Ofertas (g5, 13/10/2026) ----

   La base manda la oferta vigente junto al producto o kit ('oferta'), y es la
   base la que cobra ese precio. Aquí sólo se pone el precio de oferta como
   precio, y se guarda el de antes para tacharlo: así el carrito suma lo mismo
   que va a cobrar el servidor. */
export function conOferta(p) {
  const o = p?.oferta, precio = Number(o?.price);
  if (!o || !(precio > 0) || !(precio < Number(p.price || 0))) return p;
  return { ...p, price: precio, precioAntes: Number(p.price), ofertaHasta: o.endsOn || null, ofertaNombre: o.name || null };
}
export function kitConOferta(k) {
  const o = k?.oferta;
  if (!o) return k;
  const out = { ...k, ofertaHasta: o.endsOn || null, ofertaNombre: o.name || null };
  const pone = (llaveSnake, llaveCamel, nuevo) => {
    if (!(Number(nuevo) > 0)) return;
    const antes = Number(k[llaveSnake] ?? k[llaveCamel] ?? 0);
    if (!(Number(nuevo) < antes)) return;
    if (llaveSnake in k) out[llaveSnake] = Number(nuevo);
    if (llaveCamel in k) out[llaveCamel] = Number(nuevo);
    out[llaveSnake === 'price_adult' ? 'antesAdulto' : 'antesNino'] = antes;
  };
  pone('price_adult', 'priceAdult', o.priceAdult);
  pone('price_kid', 'priceKid', o.priceKid);
  return out;
}
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function textoHasta(fecha) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(fecha || ''));
  return m ? `Hasta el ${Number(m[3])} ${MESES_CORTOS[Number(m[2]) - 1]}` : '';
}

/* ---- Comprar otra vez (13/10/2026) ----
 * Del último pedido del Tanner (v2_portal_last_order) a líneas de carrito,
 * con el catálogo de HOY: precio vigente, oferta incluida. Lo que ya no se
 * vende, o la talla que ya no existe, se dice en `faltan` en vez de perderse
 * en silencio. Las piezas de un kit se vuelven a juntar en su kit. */
export function armaRecompra(pedido, productos = [], kits = []) {
  const items = Array.isArray(pedido?.items) ? pedido.items : [];
  const lineas = [], faltan = [];
  const porId = new Map(productos.map(p => [String(p.id), p]));
  const kitPorId = new Map(kits.map(k => [String(k.id), k]));
  const sueltas = items.filter(i => !i.bundleId);
  for (const i of sueltas) {
    const p = porId.get(String(i.productId));
    if (!p) { faltan.push('Una pieza que ya no está en la tienda'); continue; }
    const r = preparaLinea(p, { talla: i.talla, cantidad: i.quantity, nombre: i.nombre, numero: i.numero, manga: i.manga });
    if (r.ok) lineas.push(r.linea); else faltan.push(`${p.name}: ${r.motivo}`);
  }
  // Un pedido puede traer el mismo kit dos veces (dos hermanos): se arma kit
  // por kit, tomando para cada ranura la primera pieza libre de ese producto.
  // El nombre sólo viaja en el jersey, así que no sirve para separar kits.
  const grupos = new Map();
  for (const i of items.filter(i => i.bundleId)) {
    const llave = `${i.bundleId}|${i.bundleTier || ''}`;
    if (!grupos.has(llave)) grupos.set(llave, []);
    grupos.get(llave).push(i);
  }
  for (const piezas of grupos.values()) {
    const base = piezas[0];
    const kit = kitPorId.get(String(base.bundleId));
    if (!kit) { faltan.push('Un kit que ya no está en la tienda'); continue; }
    const tier = /ni/i.test(base.bundleTier || '') ? 'Niño' : /adul/i.test(base.bundleTier || '') ? 'Adulto' : undefined;
    const usadas = new Set();
    for (let vuelta = 0; vuelta < 20 && usadas.size < piezas.length; vuelta++) {
      const tallas = {}, elegidos = {}, mangas = {}, deEste = [];
      for (const ranura of ranurasDeKit(kit)) {
        const vale = x => ranura.pool ? ranura.pool.includes(String(x.productId)) : String(x.productId) === String(ranura.productId);
        const k = piezas.findIndex((x, n) => !usadas.has(n) && vale(x));
        if (k >= 0) { usadas.add(k); deEste.push(piezas[k]); if (ranura.pool) elegidos[ranura.id] = String(piezas[k].productId); if (piezas[k].talla) tallas[ranura.id] = piezas[k].talla; if (piezas[k].manga) mangas[ranura.id] = piezas[k].manga; }
      }
      if (!deEste.length) break;
      const con = deEste.find(x => x.nombre || x.numero) || {};
      const manga = (deEste.find(x => x.manga) || {}).manga;
      const r = preparaKit(kit, { tier, tallas, elegidos, mangas, nombre: con.nombre, numero: con.numero, manga });
      if (r.ok) lineas.push(r.linea); else faltan.push(`${kit.name}: ${r.motivo}`);
    }
  }
  return { lineas, faltan };
}
/* Meses desde el último pedido: a partir de 6, la talla merece una revisada. */
export function mesesDesde(fecha, hoy = new Date()) {
  const f = new Date(fecha);
  if (Number.isNaN(f.getTime())) return 0;
  return Math.max(0, (hoy.getFullYear() - f.getFullYear()) * 12 + (hoy.getMonth() - f.getMonth()));
}
