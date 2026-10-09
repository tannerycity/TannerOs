/* LA VITRINA — cómo se dibuja la tienda del club, en un solo lugar.
 *
 * Las reglas de QUÉ se puede comprar viven en /v2/tienda.js. Esto es lo otro:
 * cómo se ve. Una tarjeta, un selector de talla plegado, la tarjeta del kit.
 *
 * POR QUÉ ESTÁ APARTE
 *
 * El club vende por tres mostradores y los tres enseñan lo mismo:
 *
 *   /v2/captura     Taquilla, cuando la familia está enfrente
 *   /v2/familias    el portal, con la sesión del papá
 *   /pedido         el link que se pega en WhatsApp, sin cuenta
 *
 * El último era un formulario con un menú desplegable: "Selecciona". Nadie
 * compra de un desplegable. Al convertirlo en tienda, la salida fácil era
 * copiar las funciones del portal — y copiarlas es como dos pantallas del
 * mismo club acaban viéndose distinto: alguien arregla el selector de tallas
 * en una y nadie se acuerda de la otra. Es el mismo riesgo que ya documenté al
 * duplicar el reparto de precio del kit entre el mostrador y el portal, sólo
 * que ahí el duplicado se pagó a propósito y se puso una prueba de peaje.
 * Aquí no hacía falta pagarlo.
 *
 * Sin DOM propio y sin estado: entran datos y sale HTML. Quien guarda lo que
 * el usuario va eligiendo es cada pantalla, y se lo pasa como argumento. Así
 * se puede probar sin abrir un navegador.
 */
import {
  tallasDe, tallaUnica, aceptaPersonalizacion,
  ESCALA_NINOS, ESCALA_ADULTOS,
  ranurasDeKit, precioDeKit, tiersDeKit
} from '/v2/tienda.js';

export const esc = v => String(v ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const dinero = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

/* Un producto sin foto no deja un hueco gris: deja sus iniciales. Cuatro de
   los ocho productos del club no tienen foto todavía.
 *
 * Se tiran las palabras que no son palabras. "Hoodie / Chamarra" daba "H/",
 * con la diagonal contando como segunda inicial, y "Par de calcetas" daba
 * "PD" por el "de". Un monograma que incluye un conector no dice nada: lo que
 * identifica la prenda es "HC" y "PC". */
const CONECTORES = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'a', 'con', 'para', 'por', 'en']);
export function inicialesDe(nombre) {
  const palabras = String(nombre || '')
    .split(/[\s/·,\-–—]+/)
    // Sólo lo que empieza con letra: fuera comillas, diagonales y números.
    .map(x => x.replace(/^[^\p{L}]+/u, ''))
    .filter(x => x && !CONECTORES.has(x.toLocaleLowerCase('es-MX')));
  return palabras.slice(0, 2).map(x => x[0]).join('').toLocaleUpperCase('es-MX') || '?';
}

/* La fila de talla, plegada.
 *
 * Antes se desplegaban las DOCE tallas en cada tarjeta, siempre. Ocho
 * productos median 5,650px de alto: scroll eterno para una tienda de ocho
 * cosas. Ningun comercio serio enseña 96 botones de talla a la vez.
 *
 * Ahora la tarjeta dice una linea —"Elige tu talla" o "Talla 12 · cambiar"— y
 * las tallas aparecen SOLO en la que se toco. Es el mismo numero de toques
 * para comprar y una quinta parte de pantalla. */
export function filaDeTalla(id, tallas, elegida, abierto) {
  if (!tallas.length) return '';
  const cabeza = elegida
    ? `<button type="button" class="fam-talla-sel" data-abre="${esc(id)}"><b>Talla ${esc(elegida)}</b><span>cambiar</span></button>`
    : `<button type="button" class="fam-talla-sel vacia" data-abre="${esc(id)}"><b>Elige tu talla</b><span>${tallas.length} disponibles</span></button>`;
  if (!abierto) return cabeza;

  /* Las tallas abiertas van en UNA fila que se desliza, no en un bloque que se
     parte en seis renglones.
     Y separadas por quién es. Los jerseys del club traen las DOCE tallas
     —niños 6 a 16 y adultos XS a XXL— en el mismo producto, así que sin
     separar, un papá que busca la 10 de su hijo la encuentra entre puras
     tallas de adulto. Un grupo con su etiqueta se lee de un vistazo; doce
     botones seguidos hay que leerlos uno por uno. */
  const esNino = t => ESCALA_NINOS.includes(t);
  const ninos = tallas.filter(esNino);
  const adultos = tallas.filter(t => ESCALA_ADULTOS.includes(t));
  const otras = tallas.filter(t => !esNino(t) && !ESCALA_ADULTOS.includes(t));
  const chip = t => `<button type="button" class="fam-talla${elegida === t ? ' activa' : ''}" data-talla="${esc(t)}">${esc(t)}</button>`;
  const grupo = (titulo, lista) => lista.length
    ? `<div class="fam-grupo"><span>${titulo}</span><div class="fam-fila">${lista.map(chip).join('')}</div></div>` : '';
  // Sin las dos escalas conviviendo no hay nada que separar: una sola fila.
  const cuerpo = (ninos.length && adultos.length)
    ? grupo('Niño', ninos) + grupo('Adulto', adultos) + grupo('Otras', otras)
    : `<div class="fam-fila">${tallas.map(chip).join('')}</div>`;
  return cabeza + `<div class="fam-tallas" data-tallas="${esc(id)}">${cuerpo}</div>`;
}

/* La tarjeta de una pieza suelta. `elec` es lo que esta pantalla lleva elegido
   para ESTE producto: {talla, abierto, nombre, numero, motivo}. */
export function tarjetaProducto(p, elec = {}) {
  const tallas = tallasDe(p), unica = tallaUnica(p);
  const foto = `<span class="fam-shot" data-shot="${esc(p.id)}"><i class="fam-iniciales">${esc(inicialesDe(p.name))}</i></span>`;
  // Una talla unica no se ofrece: obligar a tocar "Universal" es un toque que
  // no informa. Se dice, y ya.
  const chips = unica
    ? `<span class="fam-talla-unica">Talla ${esc(unica)}</span>`
    : filaDeTalla(p.id, tallas, elec.talla, elec.abierto);
  // El nombre y el numero solo aparecen cuando ya hay talla: pedirlos antes
  // llena la tarjeta de campos que todavia no sirven de nada.
  const hayTalla = Boolean(unica || elec.talla);
  const pers = (aceptaPersonalizacion(p) && hayTalla)
    ? `<div class="fam-pers"><input type="text" maxlength="20" placeholder="Nombre en la espalda (opcional)" data-pnombre="${esc(p.id)}" value="${esc(elec.nombre || '')}">`
      + `<input type="text" inputmode="numeric" maxlength="3" placeholder="N°" data-pnumero="${esc(p.id)}" value="${esc(elec.numero || '')}"></div>`
    : '';
  const aviso = elec.motivo ? `<span class="fam-aviso">${esc(elec.motivo)}</span>` : '';
  return `<article class="fam-prod">${foto}<strong>${esc(p.name)}</strong>`
    + `<span class="fam-price">${dinero.format(Number(p.price || 0))}</span>`
    + `${p.description ? `<p>${esc(p.description)}</p>` : ''}${chips}${pers}${aviso}`
    + `<button type="button" class="fam-add" data-add="${esc(p.id)}">Agregar</button></article>`;
}

/* La tarjeta del kit.
 *
 * Va primero y en grande porque un club no vende piezas: vende el uniforme. Un
 * papa que acaba de inscribir a su hijo quiere "lo que necesita para
 * entrenar", no armarlo pieza por pieza adivinando cuales van juntas.
 *
 * Ocupa el ancho completo, dice QUE TRAE, y pide una talla por pieza —dos
 * shorts son dos tallas—. */
export function tarjetaKit(k, elec = {}) {
  const tiers = tiersDeKit(k);
  const tier = tiers.includes(elec.tier) ? elec.tier : (tiers.length === 1 ? tiers[0] : null);
  const precio = tier ? precioDeKit(k, tier) : Number(k.price_adult || 0);
  const ranuras = ranurasDeKit(k);
  const tallasElegidas = elec.tallas || {};

  const quien = tiers.length > 1
    ? `<div class="fam-tier" data-tier="${esc(k.id)}">${tiers.map(t =>
        `<button type="button" class="fam-talla${tier === t ? ' activa' : ''}" data-quien="${esc(t)}">${esc(t)} ${dinero.format(precioDeKit(k, t))}</button>`).join('')}</div>`
    : '';

  const piezas = ranuras.map(r => {
    if (r.unica) return `<div class="fam-pieza"><span>${esc(r.nombre)}</span><em>Talla ${esc(r.unica)}</em></div>`;
    if (!r.tallas.length) return `<div class="fam-pieza"><span>${esc(r.nombre)}</span><em>Incluido</em></div>`;
    return `<div class="fam-pieza"><span>${esc(r.nombre)}</span>`
      + filaDeTalla(`${k.id}::${r.id}`, r.tallas, tallasElegidas[r.id], elec.abierto === r.id) + `</div>`;
  }).join('');

  const pers = `<div class="fam-pers"><input type="text" maxlength="20" placeholder="Nombre en la espalda (opcional)" data-knombre="${esc(k.id)}" value="${esc(elec.nombre || '')}">`
    + `<input type="text" inputmode="numeric" maxlength="3" placeholder="N°" data-knumero="${esc(k.id)}" value="${esc(elec.numero || '')}"></div>`;
  const aviso = elec.motivo ? `<span class="fam-aviso">${esc(elec.motivo)}</span>` : '';

  return `<article class="fam-kit"><div class="fam-kit-head"><span class="fam-kit-tag">EL UNIFORME COMPLETO</span>`
    + `<strong>${esc(k.name)}</strong><span class="fam-price">${dinero.format(precio)}</span></div>`
    + `${k.description ? `<p>${esc(k.description)}</p>` : ''}${quien}`
    + `<div class="fam-piezas">${piezas}</div>${pers}${aviso}`
    + `<button type="button" class="fam-add" data-addkit="${esc(k.id)}">Agregar el kit</button></article>`;
}

export function lineaDelCarrito(llave, l) {
  const detalle = [l.talla, l.personalizationName, l.numero ? `#${l.numero}` : null].filter(Boolean).join(' · ');
  return `<div class="fam-mov"><span><strong>${esc(l.nombreProducto)}${l.cantidad > 1 ? ` ×${l.cantidad}` : ''}</strong>`
    + `<span>${esc(detalle || 'Sin detalle')}</span></span>`
    + `<span class="fam-linea-fin"><b>${dinero.format(Number(l.total || 0))}</b>`
    + `<button type="button" class="fam-quita" data-quita="${esc(llave)}" aria-label="Quitar">✕</button></span></div>`;
}

/* ---- El adaptador del link público ----
 *
 * v2_public_offerings y portal_catalog describen el MISMO kit con nombres
 * distintos: uno dice components/productId/priceAdult y el otro
 * pieces/product_id/price_adult. Son dos funciones escritas con meses de
 * diferencia, no dos conceptos.
 *
 * Se traduce aquí, en la orilla, y hacia adentro existe una sola forma. La
 * alternativa era que ranurasDeKit y precioDeKit entendieran las dos, y
 * entonces CADA función que toque un kit tendría que entender las dos para
 * siempre. */
export function normalizaOfertaPublica(oferta) {
  const productos = (oferta?.products || []).map(p => ({
    ...p,
    price: Number(p.price ?? p.priceAdult ?? 0)
  }));
  const kits = (oferta?.bundles || [])
    // Un kit bloqueado no se ofrece. El motivo lo explica la pantalla aparte;
    // ponerlo en la vitrina con un botón muerto es peor que no ponerlo.
    .filter(b => b.available !== false)
    .map(b => ({
      id: b.id,
      name: b.name,
      description: b.description || null,
      price_adult: Number(b.priceAdult ?? b.price_adult ?? 0),
      price_kid: Number(b.priceKid ?? b.price_kid ?? 0),
      pieces: (b.components || b.pieces || []).map(c => ({
        product_id: c.productId ?? c.product_id,
        // El pedido público se manda con el id legacy de la pieza, que es lo
        // que v2_public_bundle_order espera; se conserva para no perderlo.
        legacy_product_id: c.legacyProductId ?? c.legacy_product_id ?? null,
        name: c.name,
        sizes: c.sizes || [],
        qty: Math.max(1, Math.min(20, Number(c.qty) || 1)),
        // Con qué foto se ve el kit en la tienda pública (e3).
        category: c.category ?? null,
        photoThumbPath: c.photoThumbPath ?? null,
        photoBucket: c.photoBucket ?? null
      }))
    }));
  return { products: productos, bundles: kits };
}
