/* LA TIENDA TANNER: EL LINK QUE SE PEGA EN WHATSAPP.
 *
 * Quien abre esto no tiene cuenta ni sesión: le llegó un link. Es la vitrina
 * del club frente a alguien que muchas veces ni lo conoce.
 *
 * COMO ES (Presidencia, 09/10/2026: "entrar y ver literal una tienda en línea")
 *
 *   #/            La tienda (PLP): categorías arriba —Kits, Jerseys, Shorts,
 *                 Pants, Chamarras, Calcetas y las que el club dé de alta—
 *                 y tarjetas grandes con foto y precio.
 *   #/c/<clave>   Una sola categoría.
 *   #/p/<id>      La ficha de una pieza (PDP): foto grande, tallas en botones
 *                 (Niño / Adulto), nombre y número si es jersey, cantidad y
 *                 "Agregar al pedido" fijo abajo.
 *   #/k/<id>      La ficha de un kit: Niño o Adulto, lo que incluye con la
 *                 talla de cada pieza, nombre y número.
 *   #/pedido      Confirmar: los renglones, los datos y el consentimiento.
 *
 * Todo lo que se agrega va a UN carrito y sale en UN folio
 * (v2_public_cart_order, d3). Las reglas de cada línea —talla obligatoria, kit
 * completo, número de 1 a 3 dígitos— son las de /v2/tienda.js, las mismas del
 * portal de familias y del mostrador.
 *
 * LAS FOTOS
 *
 * Viven en el bucket privado. Desde e3, las de productos activos del
 * catálogo (y sólo ésas) se pueden firmar sin sesión. Las tarjetas piden la
 * miniatura y la ficha la foto completa, por el caché compartido
 * (/v2/photo-cache.js): una familia que vuelve no las baja otra vez. Un
 * producto sin foto sale con el escudo del club, no con un recuadro gris.
 */
import { createClient } from '/v2/supabase-client.js';
import { llaveDeLiga, propagaClub } from '/v2/club-publico.js';
import { instalaVocabulario } from '/v2/vocabulario.js';
import { AsYouType, getCountries, getCountryCallingCode, parsePhoneNumberFromString }
  from 'https://esm.sh/libphonenumber-js@1.11.20/max';
import { textoHasta, recargoDe, recargoPersDe, extraEstampadoKit, jerseysDeKit, llevaEstampado, llevaManga as tieneManga, precioDeProducto, precioDeEtiqueta, precioNinoDe, sugerenciasDeKit, textoSugerencia, quitaUnaPieza, preparaLinea, preparaKit, tiersDeKit, ranurasDeKit, ranuraElegida, nombreCorto, precioDeKit, aceptaPersonalizacion, llevaManga,
         tallasDe, tallaUnica, agregaAlCarrito, quitaDelCarrito, totalDelCarrito, piezasDelCarrito,
         admiteVariasTallas, preparaLineasPorTalla, cambiaCantidadDeTalla }
  from '/v2/tienda.js';
import { esc, dinero as money, normalizaOfertaPublica, lineaDelCarrito } from '/v2/vitrina.js';
import { getSignedPhotoUrls } from '/v2/photo-cache.js';
import { mockupJersey, coloresDePlayera } from '/v2/jersey-mockup.js';
import { datosDePago, mensajeComprobante, ligaWhatsApp } from '/v2/pedido-mensajes.js';
import { tablasPara, CONSEJO_TALLA, MEDIDAS_CONFIRMADAS } from '/v2/guia-tallas.js';
import { serializaCarrito, restauraCarrito, cambiaCantidadEnCarrito, cambiaCantidad, alternaGuardado, guardadosVivos } from '/pedido/carrito.js';
import { normalizaCodigo, codigoValido, descuentoDeCodigo, textoAplicado, ligaDeCompra } from '/v2/codigos.js';
import { seccionesDeTienda, fotosPorFirmar, fotosDeKit, precioDeTarjeta, gruposDeTallas, etiquetaDe, categoriaDe, sugerenciasAntesDePagar }
  from '/pedido/catalogo.js';

const supabase = createClient('https://pacnegivzgxpanphrnwp.supabase.co', 'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG');
// De qué club es esta tienda: ?club=<slug>; sin él, Tannery (v2/club-publico.js).
const CLUB_KEY = llaveDeLiga();
let clubNombre = '';
const PRIVACY_NOTICE_VERSION = '2026-08-19-v1';
const $ = id => document.getElementById(id);
const regions = new Intl.DisplayNames(['es-MX', 'es'], { type: 'region' });

let catalogo = { products: [], bundles: [] };
let secciones = [];
let phoneCountry = 'MX';
// Lo que se lleva elegido en cada ficha: si se va y regresa, sigue ahí.
const eligiendo = {};      // productId -> {talla, cantidad, nombre, numero, motivo}
const eligiendoKit = {};   // kitId -> {tier, tallas:{}, nombre, numero, manga, motivo, falta, reemplaza}
let carrito = {};
/* Código de la tienda (26/10/2026, h46). Llega escrito o en la liga del
   embajador (?codigo=CURTIBROTHER) y se aplica al pagar. */
let codigo = null;          // lo que respondió v2_public_check_code (ok o con motivo)
let codigoEscrito = (() => {
  const enLiga = normalizaCodigo(new URLSearchParams(location.search).get('codigo'));
  try {
    if (enLiga) sessionStorage.setItem('tiendaCodigo', enLiga);
    return enLiga || sessionStorage.getItem('tiendaCodigo') || '';
  } catch { return enLiga; }
})();
// Cómo pagar, el WhatsApp del club y el tiempo de entrega. Si no carga, la
// tienda funciona igual: sólo faltan esos textos.
let pagoInfo = null;
// Colores del club para la vista previa de la playera; si no llegan, los de siempre.
let coloresClub = {};
// Fotos ya firmadas en esta visita: ruta -> url.
const fotos = new Map();

async function rpc(n, p = {}) { const { data, error } = await supabase.rpc(n, p); if (error) throw error; return data; }
const acceptedAt = () => new Date().toISOString();

/* ---------- Teléfono ---------- */
function countryName(c) { try { return regions.of(c) || c } catch { return c } }
function countries() {
  return getCountries().map(code => ({ code, name: countryName(code), dial: `+${getCountryCallingCode(code)}` }))
    .sort((a, b) => {
      const pr = ['MX', 'US', 'AR'], aa = pr.indexOf(a.code), bb = pr.indexOf(b.code);
      if (aa >= 0 || bb >= 0) { if (aa < 0) return 1; if (bb < 0) return -1; return aa - bb; }
      return a.name.localeCompare(b.name, 'es-MX');
    });
}
function phoneMarkup() {
  return `<div class="phone-widget span-2"><div class="phone-label">Teléfono (WhatsApp) *</div>
    <div class="phone-control"><button id="countryBtn" class="country-trigger" type="button"></button>
    <input id="customerPhone" inputmode="tel" autocomplete="tel" required maxlength="28"></div>
    <div id="countryPicker" class="country-picker hidden"><div class="country-search-wrap">
    <input id="countrySearch" type="search" placeholder="Busca tu país" autocomplete="off"></div>
    <div id="countryList" class="country-list"></div></div>
    <div id="phoneHint" class="phone-hint"></div></div>`;
}
function renderCountryButton() {
  // Aquí salía "MX MX +52": una función flag() devolvía el código en mayúsculas
  // en lugar de una bandera, y al lado ya iba el código otra vez. Se queda el
  // código una sola vez, que es lo que de verdad identifica al país.
  $('countryBtn').innerHTML = `<b>${phoneCountry}</b><span>+${getCountryCallingCode(phoneCountry)}</span>`
    + `<i class="tos-icon tos-icon-chevron" aria-hidden="true"></i>`;
  $('customerPhone').placeholder = phoneCountry === 'MX' ? '477 123 4567' : 'Número local';
  $('phoneHint').textContent = `${countryName(phoneCountry)} · +${getCountryCallingCode(phoneCountry)}`;
  $('phoneHint').className = 'phone-hint';
}
function renderCountries(q = '') {
  const s = q.trim().toLocaleLowerCase('es-MX'), box = $('countryList');
  box.innerHTML = '';
  countries().filter(c => !s || `${c.name} ${c.code} ${c.dial}`.toLocaleLowerCase('es-MX').includes(s))
    .forEach(c => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'country-option';
      b.innerHTML = `<b>${esc(c.code)}</b><span class="country-name">${esc(c.name)}</span><span>${esc(c.dial)}</span>`;
      b.onclick = () => { phoneCountry = c.code; $('countryPicker').classList.add('hidden'); renderCountryButton(); };
      box.appendChild(b);
    });
}
function wirePhone() {
  renderCountryButton(); renderCountries();
  $('countryBtn').onclick = e => { e.stopPropagation(); $('countryPicker').classList.toggle('hidden'); $('countrySearch').value = ''; renderCountries(); };
  $('countrySearch').oninput = e => renderCountries(e.target.value);
  $('countryPicker').onclick = e => e.stopPropagation();
  $('customerPhone').oninput = e => { e.target.value = new AsYouType(phoneCountry).input(e.target.value); };
  document.addEventListener('click', () => $('countryPicker')?.classList.add('hidden'));
}
function validatePhone(throwOnError = true) {
  const raw = $('customerPhone').value.trim(), parsed = parsePhoneNumberFromString(raw, phoneCountry), hint = $('phoneHint');
  if (!parsed?.isValid()) {
    hint.textContent = `Número inválido para ${countryName(phoneCountry)}.`;
    hint.className = 'phone-hint bad';
    if (throwOnError) throw new Error('Escribe un teléfono válido.');
    return null;
  }
  hint.textContent = parsed.formatInternational(); hint.className = 'phone-hint';
  return parsed.number;
}

/* ---------- Fotos ----------
 * La imagen se pinta encima del escudo del club: mientras carga (o si no hay
 * foto) se ve el escudo, nunca un hueco. */
function medio(ruta, bucket, alt, clase = '') {
  return `<div class="st-media${clase ? ` ${clase}` : ''}${ruta ? '' : ' vacia'}">`
    + (ruta ? imagen(ruta, bucket, alt) : '') + '</div>';
}
function imagen(ruta, bucket, alt) {
  const url = fotos.get(ruta);
  return `<img data-ruta="${esc(ruta)}" data-bucket="${esc(bucket || 'tanneros-private')}" alt="${esc(alt || '')}" decoding="async"${url ? ` src="${esc(url)}" class="lista"` : ''}>`;
}
function medioProducto(p, completa = false) {
  const ruta = completa ? (p.photoPath || p.photoThumbPath) : (p.photoThumbPath || p.photoPath);
  return medio(ruta, p.photoBucket, p.name);
}
/* Varias fotos (14/10/2026): en la ficha se deslizan como en el App Store,
   con puntitos abajo. Con una sola foto se ve igual que siempre. */
function fotoMini(p) { return medio(p.photoThumbPath || p.photoPath, p.photoBucket, p.name, 'st-ag-foto'); }
function fotosDeProducto(p) {
  const l = Array.isArray(p.photos) ? p.photos.filter(f => f && f.path) : [];
  return l.length ? l : (p.photoPath || p.photoThumbPath ? [{ path: p.photoPath || p.photoThumbPath, thumbPath: p.photoThumbPath }] : []);
}
function galeria(p, actual = 0) {
  const l = fotosDeProducto(p);
  if (l.length < 2) return medioProducto(p, true);
  return `<div class="st-galeria" aria-roledescription="carrusel" aria-label="Fotos de ${esc(p.name)}">
    <div class="st-galeria-pista">${l.map((f, i) => `<div class="st-galeria-foto" aria-label="Foto ${i + 1} de ${l.length}">${medio(f.path, p.photoBucket, `${p.name}, foto ${i + 1}`)}</div>`).join('')}</div>
    <div class="st-puntos">${l.map((_, i) => `<button type="button" data-foto-i="${i}" aria-label="Ver foto ${i + 1}"${i === actual ? ' aria-current="true"' : ''}></button>`).join('')}</div></div>`;
}
// La ficha se repinta entera en cada toque: la galería recuerda en qué foto iba.
function cableaGaleria(e) {
  const g = $('content').querySelector('.st-galeria'); if (!g) return;
  const pista = g.querySelector('.st-galeria-pista'), puntos = [...g.querySelectorAll('[data-foto-i]')];
  const marca = i => puntos.forEach((b, k) => k === i ? b.setAttribute('aria-current', 'true') : b.removeAttribute('aria-current'));
  pista.scrollLeft = (e.foto || 0) * pista.clientWidth;
  pista.addEventListener('scroll', () => { const i = Math.round(pista.scrollLeft / Math.max(1, pista.clientWidth)); if (i !== e.foto) { e.foto = i; marca(i); } }, { passive: true });
  puntos.forEach((b, i) => b.addEventListener('click', ev => { ev.stopPropagation(); pista.scrollTo({ left: i * pista.clientWidth, behavior: 'smooth' }); }));
}
function medioKit(k, clase = '') {
  const f = fotosDeKit(k);
  if (!f.length) return medio(null, null, k.name, `kit ${clase}`.trim());
  return `<div class="st-media kit n${f.length} ${clase}">${f.map(x => imagen(x.ruta, x.bucket, x.nombre)).join('')}</div>`;
}
async function firmaFotos(raiz) {
  const pendientes = {};
  raiz.querySelectorAll('img[data-ruta]:not([src])').forEach(i => (pendientes[i.dataset.bucket] ||= new Set()).add(i.dataset.ruta));
  for (const [bucket, rutas] of Object.entries(pendientes)) {
    try {
      const mapa = await getSignedPhotoUrls(supabase, bucket, [...rutas]);
      for (const [r, u] of Object.entries(mapa || {})) fotos.set(r, u);
    } catch { /* sin foto se queda el escudo */ }
  }
  raiz.querySelectorAll('img[data-ruta]:not([src])').forEach(i => {
    const u = fotos.get(i.dataset.ruta);
    if (!u) { i.remove(); return; }
    i.addEventListener('load', () => i.classList.add('lista'), { once: true });
    i.addEventListener('error', () => i.remove(), { once: true });
    i.src = u;
  });
}

/* ---------- Carrito en la cabecera y abajo ---------- */
// El carrito y los guardados viven en el teléfono (27/10/2026): recargar o
// volver mañana no los borra. Si el navegador no deja guardar, la tienda
// funciona igual, sólo no recuerda.
const LLAVE_CARRITO = `tiendaCarrito:${CLUB_KEY}`, LLAVE_GUARDADOS = `tiendaGuardados:${CLUB_KEY}`;
const lee = k => { try { return localStorage.getItem(k); } catch { return null; } };
const escribe = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin memoria */ } };
let guardados = (() => { try { return JSON.parse(lee(LLAVE_GUARDADOS) || '[]'); } catch { return []; } })();
let piezasAntes = 0;
function actualizaCarrito() {
  const n = piezasDelCarrito(carrito), badge = $('stCarritoN');
  escribe(LLAVE_CARRITO, serializaCarrito(carrito));
  badge.hidden = !n; badge.textContent = String(n);
  // La bolsita brinca cuando entra algo: se ve a dónde se fue.
  if (n > piezasAntes) { $('stCarrito').classList.remove('brinca'); void $('stCarrito').offsetWidth; $('stCarrito').classList.add('brinca'); }
  piezasAntes = n;
  if ($('stMini')) pintaMini();
  $('stCarrito').setAttribute('aria-label', n ? `Tu pedido, ${n} ${n === 1 ? 'artículo' : 'artículos'}` : 'Tu pedido');
}
function pintaBarra(visible) {
  document.getElementById('carritoBar')?.remove();
  const n = piezasDelCarrito(carrito);
  if (!visible || !n) return;
  const bar = document.createElement('div');
  bar.id = 'carritoBar'; bar.className = 'carrito-bar';
  bar.innerHTML = `<span><strong>${money.format(totalDelCarrito(carrito))}</strong>`
    + `<small>${n} ${n === 1 ? 'artículo' : 'artículos'} en tu pedido</small></span>`
    + `<button type="button" id="verCarrito">Ver pedido</button>`;
  document.body.appendChild(bar);
  bar.querySelector('#verCarrito').addEventListener('click', () => abreMini());
}
let avisoTimer = 0;
/* "Va en tu pedido" (26/10/2026). Presidencia: "no me gusta como se ve
   cuando metes cosas al carrito". En vez de una barra negra encima de la
   foto, una tarjeta como en las tiendas grandes: qué se agregó (foto,
   detalle y precio) y los dos caminos claros: seguir o ver el pedido. Abajo
   en el celular, arriba a la derecha en compu. */
function agregado({ foto = '', titulo, detalle = '', precio = null, otro = false }) {
  const el = $('stAviso');
  const n = piezasDelCarrito(carrito), total = totalDelCarrito(carrito);
  el.innerHTML = `<div class="st-ag" role="dialog" aria-label="Va en tu pedido">
    <div class="st-ag-cab"><span class="st-ag-ok" aria-hidden="true"><span class="tos-icon tos-icon-check"></span></span><b>Va en tu pedido</b>
      <button type="button" class="st-ag-x" data-ag-cierra aria-label="Cerrar">&times;</button></div>
    <div class="st-ag-item">${foto}<div class="st-ag-txt"><strong>${esc(titulo)}</strong>${detalle ? `<span>${esc(detalle)}</span>` : ''}</div>${precio != null ? `<b class="st-ag-precio">${money.format(precio)}</b>` : ''}</div>
    <div class="st-ag-acc">${otro ? '<button type="button" class="st-ag-sec" data-otro>Agregar otro</button>' : '<button type="button" class="st-ag-sec" data-ag-cierra>Seguir comprando</button>'}
      <a class="st-ag-ver" href="#/pedido">Ver pedido <small>${n} ${n === 1 ? 'artículo' : 'artículos'} · ${money.format(total)}</small></a></div></div>`;
  el.classList.add('tarjeta');
  el.hidden = false; el.classList.remove('sale'); void el.offsetWidth; el.classList.add('entra');
  firmaFotos(el);
  programaCierre(7000);
}
function programaCierre(ms) {
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => {
    const el = $('stAviso');
    if (el.matches(':hover') || el.contains(document.activeElement)) { programaCierre(2500); return; }
    el.classList.remove('entra'); el.classList.add('sale'); setTimeout(() => { el.hidden = true; }, 250);
  }, ms);
}
function aviso(texto, conAccion = false) {
  const el = $('stAviso');
  el.innerHTML = `<span>${esc(texto)}</span>${conAccion ? '<a href="#/pedido">Ver pedido</a>' : ''}`;
  el.classList.remove('tarjeta');
  el.hidden = false; el.classList.remove('sale'); void el.offsetWidth; el.classList.add('entra');
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => { el.classList.remove('entra'); el.classList.add('sale'); setTimeout(() => { el.hidden = true; }, 250); }, 3200);
}

/* ---------- Lo que se dice en cada ficha ---------- */
function infoDeCompra() {
  const metodos = (pagoInfo?.methods || []).map(m => String(m).toLocaleLowerCase('es-MX'));
  const pago = metodos.length > 1 ? `${metodos.slice(0, -1).join(', ')} o ${metodos.at(-1)}` : (metodos[0] || 'transferencia');
  return `<ul class="st-info">
    ${pagoInfo?.delivery ? `<li><b>Entrega</b><span>En ${esc(pagoInfo.delivery)}. Se produce sobre pedido.</span></li>` : ''}
    <li><b>Pago</b><span>Por ${esc(pago)}. Al confirmar ves la CLABE y tu referencia para transferir.</span></li>
    <li><b>Confirmación</b><span>Te escribimos por WhatsApp para revisar tallas y entrega.</span></li></ul>`;
}
/* La vista previa del kit (14/10/2026): "si le pones manga larga, ver la manga
   larga de cada uno de los jerseys y del color que es". Una playera por jersey
   elegido, con su diseño y su manga; sin jersey elegido, la genérica. */
function mockupsDeKit(k, e) {
  const jerseys = ranurasDeKit(k).map(r0 => ranuraElegida(r0, e.elegidos))
    .filter(r => (!r.pool || r.elegido) && tieneManga(r.producto || { name: r.nombre }));
  if (!jerseys.length) return vistaPrevia(e, k.name);
  return `<div class="st-mockup-varios n${Math.min(jerseys.length, 4)}">${jerseys.map(r => {
    const nombre = r.producto?.name || r.nombre, manga = (e.mangas || {})[r.id] || e.manga || 'corta';
    return `<div class="st-mockup-uno">${mockupJersey({ nombre: e.nombre, numero: e.numero, mangaLarga: manga === 'larga',
      colores: coloresDePlayera({ nombreProducto: nombre, primario: coloresClub.primary, acento: coloresClub.accent }) })}
      <span>${esc(nombreCorto(nombre))}<small>Manga ${esc(manga)}</small></span></div>`;
  }).join('')}</div>`;
}
function contenidoMockup(e, fig) {
  const k = fig?.dataset.kit && (catalogo.bundles || []).find(x => String(x.id) === fig.dataset.kit);
  return k ? mockupsDeKit(k, e) : vistaPrevia(e, fig?.dataset.producto || '');
}
function repintaMockup(e) {
  const fig = $('stMockup'), cuerpo = fig?.querySelector('.st-mockup-cuerpo');
  if (cuerpo) cuerpo.innerHTML = contenidoMockup(e, fig);
}
function vistaPrevia(e, nombreProducto) {
  return mockupJersey({ nombre: e.nombre, numero: e.numero, mangaLarga: e.manga === 'larga',
    colores: coloresDePlayera({ nombreProducto, primario: coloresClub.primary, acento: coloresClub.accent }) });
}
/* "Larga +$50": el cargo de manga larga se dice en el botón (14/10/2026). */
const etiquetaManga = (m, r) => m === 'larga' ? `Larga${r > 0 ? ` <small>+${money.format(r)}</small>` : ''}` : 'Corta';
function botonesManga(e, r, attr = 'data-manga', valor = e.manga) {
  return `<div class="st-tallas st-manga">${['corta', 'larga'].map(m => `<button type="button" class="st-talla${(valor || 'corta') === m ? ' activa' : ''}" ${attr}="${m}" aria-pressed="${(valor || 'corta') === m}">${etiquetaManga(m, r)}</button>`).join('')}</div>`;
}
/* "Opcional · +$100" (26/10/2026, h45): el cargo de nombre y número se dice
   antes de escribirlo; en un kit, por cada jersey que lo lleva. */
function textoCargoPers(rp, jerseys = 1) {
  if (!(rp > 0)) return 'Opcional';
  return jerseys > 1 ? `Opcional · +${money.format(rp)} por jersey (${jerseys})` : `Opcional · +${money.format(rp)}`;
}
function bloquePersonaliza(e, nombreProducto = '', r = 0, conManga = true, kit = null, rp = 0) {
  const jerseys = kit ? jerseysDeKit(kit, e.elegidos) : 1;
  return `<section class="st-bloque"><div class="st-bloque-cab"><h2>Personalízalo</h2><span class="st-pers-cargo">${esc(textoCargoPers(rp, jerseys))}</span></div>
    <figure class="st-mockup${kit ? ' kit' : ''}" id="stMockup" data-producto="${esc(nombreProducto)}"${kit ? ` data-kit="${esc(kit.id)}"` : ''}><div class="st-mockup-cuerpo">${kit ? mockupsDeKit(kit, e) : vistaPrevia(e, nombreProducto)}</div>
      <figcaption>${kit ? 'Así se verá la espalda de cada jersey' : 'Así se verá la espalda'}</figcaption></figure>
    <div class="st-perso">
      <label><span>Nombre en la espalda</span><input data-campo="nombre" maxlength="20" autocomplete="off" autocapitalize="characters" value="${esc(e.nombre || '')}" placeholder="LEO"></label>
      <label class="num"><span>Número</span><input data-campo="numero" inputmode="numeric" maxlength="3" autocomplete="off" value="${esc(e.numero || '')}" placeholder="10"></label>
    </div>
    ${conManga ? `<p class="st-manga-tit">Manga</p>${botonesManga(e, r)}` : ''}
    <p class="st-nota">Lo estampado es personal: no tiene cambio.</p></section>`;
}
// Jersey con "Lleva nombre y número" apagado: sólo la manga.
function bloqueManga(e, r = 0) {
  return `<section class="st-bloque"><div class="st-bloque-cab"><h2>Manga</h2></div>${botonesManga(e, r)}</section>`;
}
function barraAgregar(texto, motivo) {
  return `<div class="st-agregar"><p class="st-motivo" role="alert">${esc(motivo || '')}</p>
    <button type="button" id="stAgregar" class="st-cta">${esc(texto)}</button></div>`;
}
function botonesTalla(tallas, elegida, atributo) {
  return gruposDeTallas(tallas).map(g => `${g.etiqueta ? `<p class="st-grupo">${g.etiqueta}</p>` : ''}<div class="st-tallas">`
    + g.tallas.map(t => `<button type="button" class="st-talla${elegida === t ? ' activa' : ''}" ${atributo}="${esc(t)}" aria-pressed="${elegida === t}">${esc(t)}</button>`).join('')
    + '</div>').join('');
}

/* Varias tallas a la vez (18/10/2026): cada talla tocada queda marcada con su
   cantidad, y abajo una fila por talla con − y +. */
function botonesTallaVarias(tallas, cantidades) {
  return gruposDeTallas(tallas).map(g => `${g.etiqueta ? `<p class="st-grupo">${g.etiqueta}</p>` : ''}<div class="st-tallas">`
    + g.tallas.map(t => { const n = Number(cantidades[t]) || 0;
      return `<button type="button" class="st-talla${n ? ' activa' : ''}" data-talla="${esc(t)}" aria-pressed="${n > 0}">${esc(t)}${n > 1 ? `<small class="st-talla-n">×${n}</small>` : ''}</button>`; }).join('')
    + '</div>').join('');
}
function filasDeVarias(p, cantidades, manga) {
  const elegidas = tallasDe(p).filter(t => Number(cantidades[t]) > 0);
  if (!elegidas.length) return '';
  const extra = manga === 'larga' && llevaManga(p) ? recargoDe(p) : 0;
  return `<ul class="st-varias">${elegidas.map(t => `<li data-varia="${esc(t)}"><span><b>Talla ${esc(t)}</b><small>${money.format(precioDeProducto(p, t) + extra)} c/u</small></span>
    <div class="st-cantidad mini"><button type="button" data-varia-cant="-1" aria-label="Una menos de talla ${esc(t)}">&minus;</button><output>${cantidades[t]}</output>
    <button type="button" data-varia-cant="1" aria-label="Una más de talla ${esc(t)}">+</button></div></li>`).join('')}</ul>`;
}

/* ---------- Guardados (27/10/2026) ----------
   "¿Tenemos algún wishlist?": el corazón de cada producto lo guarda para
   después, en el mismo teléfono; se ven en la bolsita, pestaña Guardados. */
const ICONO_CORAZON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z"/></svg>';
function corazon(id, nombre) {
  const on = guardados.includes(id);
  return `<button type="button" class="st-fav" data-fav="${esc(id)}" aria-pressed="${on}" aria-label="${on ? 'Quitar de guardados' : 'Guardar para después'}: ${esc(nombre)}">${ICONO_CORAZON}</button>`;
}
function alternaFav(id) {
  guardados = alternaGuardado(guardados, id);
  escribe(LLAVE_GUARDADOS, JSON.stringify(guardados));
  const on = guardados.includes(id);
  document.querySelectorAll(`[data-fav="${CSS.escape(id)}"]`).forEach(b => {
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', (on ? 'Quitar de guardados' : 'Guardar para después') + b.getAttribute('aria-label').replace(/^[^:]*/, ''));
    if (on) { b.classList.remove('late'); void b.offsetWidth; b.classList.add('late'); }
  });
  if ($('stMini')) pintaMini();
  aviso(on ? 'Guardado para después: lo ves en la bolsita' : 'Quitado de guardados');
}

/* ---------- La bolsita (27/10/2026) ----------
   "Cuando se agrega el producto al carrito ya no puedo volver a verlo": la
   bolsita de arriba abre el pedido ahí mismo, sin salir de donde estás. Se
   cambia la cantidad, se quita, se ve el total y se va a pagar. Abajo en el
   celular, a la derecha en compu. */
let miniTab = 'pedido';
function fotoDeLinea(l) {
  if (l.kind === 'bundle') { const k = (catalogo.bundles || []).find(x => String(x.id) === String(l.bundleId)); return k ? medioKit(k, 'st-mini-foto') : medio(null, null, l.nombreProducto, 'st-mini-foto'); }
  const p = (catalogo.products || []).find(x => String(x.id) === String(l.productId));
  return medio(p?.photoThumbPath || p?.photoPath, p?.photoBucket, l.nombreProducto, 'st-mini-foto');
}
function detalleDeLinea(l) {
  return [l.kind === 'bundle' ? l.tier : (l.talla ? `Talla ${l.talla}` : null), l.manga === 'larga' ? 'Manga larga' : null,
    [l.personalizationName, l.numero ? `#${l.numero}` : null].filter(Boolean).join(' ') || null].filter(Boolean).join(' · ');
}
function pintaMini() {
  const capa = $('stMini'); if (!capa) return;
  const lineas = Object.entries(carrito), n = piezasDelCarrito(carrito), g = guardadosVivos(guardados, catalogo);
  const cuerpo = miniTab === 'guardados'
    ? (g.length ? `<ul class="st-mini-lista">${g.map(({ tipo, item }) => `<li class="st-mini-linea">
        <a href="#/${tipo}/${esc(item.id)}" data-mini-ir>${tipo === 'k' ? medioKit(item, 'st-mini-foto') : medio(item.photoThumbPath || item.photoPath, item.photoBucket, item.name, 'st-mini-foto')}</a>
        <div class="st-mini-txt"><a href="#/${tipo}/${esc(item.id)}" data-mini-ir><strong>${esc(item.name)}</strong></a>
          <span>${tipo === 'k' ? (pr => `${pr.desde ? 'Desde ' : ''}${money.format(pr.monto)}`)(precioDeTarjeta(item)) : (et => `${et.desde ? 'Desde ' : ''}${money.format(et.monto)}`)(precioDeEtiqueta(item))}</span>
          <div class="st-mini-acc"><a class="st-mini-elegir" href="#/${tipo}/${esc(item.id)}" data-mini-ir>Elegir y agregar</a><button type="button" class="st-mini-quita" data-fav="${esc(`${tipo}:${item.id}`)}">Quitar</button></div></div></li>`).join('')}</ul>`
      : '<div class="st-mini-vacio"><b>Nada guardado todavía</b><span>Toca el corazón de un producto para guardarlo y comprarlo después.</span></div>')
    : (lineas.length ? `<ul class="st-mini-lista">${lineas.map(([k, l]) => `<li class="st-mini-linea" data-mini-linea="${esc(k)}">${fotoDeLinea(l)}
        <div class="st-mini-txt"><strong>${esc(l.nombreProducto)}</strong>${detalleDeLinea(l) ? `<span>${esc(detalleDeLinea(l))}</span>` : ''}
          <div class="st-mini-acc">${cambiaCantidad(l) ? `<div class="st-cantidad mini"><button type="button" data-mini-cant="-1" aria-label="Uno menos">&minus;</button><output>${l.cantidad}</output><button type="button" data-mini-cant="1" aria-label="Uno más">+</button></div>` : ''}
          <button type="button" class="st-mini-quita" data-mini-quita>Quitar</button></div></div>
        <b class="st-mini-precio">${money.format(Number(l.total || 0))}</b></li>`).join('')}</ul>`
      : `<div class="st-mini-vacio"><b>Tu pedido está vacío</b><span>Agrega algo de la tienda${g.length ? ' o revisa tus guardados' : ''}.</span></div>`);
  capa.querySelector('.st-mini-cuerpo').innerHTML = cuerpo;
  capa.querySelector('[data-mini-tab="pedido"]').innerHTML = `Pedido${n ? ` <i>${n}</i>` : ''}`;
  capa.querySelector('[data-mini-tab="guardados"]').innerHTML = `Guardados${g.length ? ` <i>${g.length}</i>` : ''}`;
  capa.querySelectorAll('[data-mini-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.miniTab === miniTab)));
  const pie = capa.querySelector('.st-mini-pie');
  pie.hidden = miniTab !== 'pedido' || !lineas.length;
  pie.querySelector('.st-mini-total b').textContent = money.format(totalDelCarrito(carrito));
  pie.querySelector('[data-mini-pagar]').textContent = `Ir a pagar · ${money.format(totalDelCarrito(carrito))}`;
  firmaFotos(capa);
}
function abreMini(tab = 'pedido') {
  miniTab = tab;
  cierraAviso();
  if (!$('stMini')) {
    const capa = document.createElement('div');
    capa.id = 'stMini'; capa.className = 'st-mini-capa';
    capa.innerHTML = `<aside class="st-mini" role="dialog" aria-modal="true" aria-labelledby="stMiniTit">
      <header class="st-mini-cab"><h2 id="stMiniTit">Tu pedido</h2><button type="button" class="st-guia-cerrar" data-mini-cierra aria-label="Cerrar">&times;</button></header>
      <div class="st-mini-tabs" role="tablist"><button type="button" role="tab" data-mini-tab="pedido"></button><button type="button" role="tab" data-mini-tab="guardados"></button></div>
      <div class="st-mini-cuerpo"></div>
      <footer class="st-mini-pie"><div class="st-mini-total"><span>Total</span><b></b></div>
        <a class="st-cta st-mini-pagar" href="#/pedido" data-mini-pagar></a>
        <button type="button" class="st-mini-seguir" data-mini-cierra>Seguir comprando</button></footer></aside>`;
    document.body.appendChild(capa);
    document.body.classList.add('st-sin-scroll');
    capa.addEventListener('click', ev => {
      if (ev.target === capa || ev.target.closest('[data-mini-cierra]')) { cierraMini(); return; }
      if (ev.target.closest('[data-mini-ir], [data-mini-pagar]')) { cierraMini(); return; }
      const t = ev.target.closest('[data-mini-tab]'); if (t) { miniTab = t.dataset.miniTab; pintaMini(); return; }
      const f = ev.target.closest('[data-fav]'); if (f) { alternaFav(f.dataset.fav); return; }
      const linea = ev.target.closest('[data-mini-linea]')?.dataset.miniLinea; if (!linea) return;
      const c = ev.target.closest('[data-mini-cant]');
      if (c) carrito = cambiaCantidadEnCarrito(carrito, linea, Number(c.dataset.miniCant));
      else if (ev.target.closest('[data-mini-quita]')) carrito = quitaDelCarrito(carrito, linea);
      else return;
      actualizaCarrito(); trasCambioDeCarrito();
    });
    document.addEventListener('keydown', escMini);
    requestAnimationFrame(() => capa.classList.add('abierta'));
  }
  pintaMini();
  $('stMini').querySelector('[data-mini-cierra]')?.focus();
}
function escMini(ev) { if (ev.key === 'Escape') cierraMini(); }
function cierraMini() {
  const capa = $('stMini'); if (!capa) return;
  document.removeEventListener('keydown', escMini);
  document.body.classList.remove('st-sin-scroll');
  capa.remove();
}
// Si se cambió el carrito desde la bolsita estando en el pedido o en la tienda.
function trasCambioDeCarrito() {
  if (location.hash.startsWith('#/pedido')) {
    if (!piezasDelCarrito(carrito)) { cierraMini(); location.hash = '#/'; return; }
    refrescaResumen();
    if ($('stExtras')) { $('stExtras').innerHTML = extrasAntesDePagar(); firmaFotos($('stExtras')); }
    if (codigo) aplicaCodigo(codigo.code || codigoEscrito, { silencio: true });
  } else if (document.querySelector('.st-seccion')) pintaBarra(true);
}

/* ---------- La tienda (PLP) ---------- */
function tarjeta({ tipo, item }) {
  if (tipo === 'kit') {
    const pr = precioDeTarjeta(item), n = ranurasDeKit(item).length;
    return `<a class="st-card kit" href="#/k/${esc(item.id)}" data-kit="${esc(item.id)}">${corazon(`k:${item.id}`, item.name)}${medioKit(item)}
      <div class="st-card-txt"><span class="st-tag">Uniforme completo</span><strong>${esc(item.name)}</strong>
      <span class="st-precio">${pr.desde ? '<small>Desde</small> ' : ''}${money.format(pr.monto)}</span>${item.ofertaHasta ? `<span class="st-oferta">Oferta · ${esc(textoHasta(item.ofertaHasta))}</span>` : ''}
      <span class="st-sub">${n} ${n === 1 ? 'pieza' : 'piezas'}</span></div></a>`;
  }
  return `<a class="st-card" href="#/p/${esc(item.id)}" data-prod="${esc(item.id)}">${corazon(`p:${item.id}`, item.name)}${medioProducto(item)}
    <div class="st-card-txt">${aceptaPersonalizacion(item) ? '<span class="st-tag">Personalizable</span>' : ''}
    <strong>${esc(item.name)}</strong><span class="st-precio">${item.precioAntes ? `<s>${money.format(item.precioAntes)}</s> ` : ''}${(et => `${et.desde ? '<small>Desde</small> ' : ''}${money.format(et.monto)}`)(precioDeEtiqueta(item))}</span>${item.ofertaHasta ? `<span class="st-oferta">${esc(textoHasta(item.ofertaHasta))}</span>` : ''}</div></a>`;
}
/* Plazo para recoger (22/10/2026). Presidencia: "tienen un mes para pasar
   por su uniforme; si no, ya no nos hacemos responsables". Se acepta al
   comprar y se recuerda al avisar que llegó. */
const DIAS_PARA_RECOGER = 30;
/* Así funciona (22/10/2026): el papá sabe desde el principio qué sigue, sin
   preguntar por WhatsApp. Son los pasos reales de la Tienda del club. */
const PASOS_TIENDA = `<ol class="st-pasos" aria-label="Así funciona">
  <li><b>1</b><span><strong>Pide y paga</strong><small>Aquí mismo, con nombre y número</small></span></li>
  <li><b>2</b><span><strong>Lo revisamos</strong><small>Tallas, nombre y número</small></span></li>
  <li><b>3</b><span><strong>Se hace</strong><small>Sale al proveedor los viernes</small></span></li>
  <li><b>4</b><span><strong>Te avisamos</strong><small>Tienes ${DIAS_PARA_RECOGER} días para recogerlo</small></span></li></ol>`;
function renderTienda(clave = '') {
  const activa = secciones.some(s => s.clave === clave) ? clave : '';
  const visibles = activa ? secciones.filter(s => s.clave === activa) : secciones;
  document.title = activa ? `${etiquetaDe(activa)} · Tienda Tanner` : (clubNombre ? `Tienda · ${clubNombre}` : 'Tienda');
  if (!secciones.length) {
    $('content').innerHTML = `<div class="empty-state"><h2>La tienda está vacía</h2>
      <p class="muted">Todavía no hay nada publicado. Escríbenos y te decimos qué sigue.</p></div>`;
    return;
  }
  /* Dos caminos (09/10/2026): la familia con cuenta entra y ya trae sus datos
     y su Tanner; quien no tiene cuenta compra aquí mismo. */
  $('content').innerHTML = `
    <section class="st-hero${activa ? '' : ' portada'}">
      ${activa ? '' : '<img class="st-hero-escudo" src="/brand/crest-navy.png" alt="" width="120" height="120">'}
      <p class="st-eyebrow">${esc(clubNombre)}</p>
      <h1>${activa ? esc(etiquetaDe(activa)) : 'Tienda oficial'}</h1>
      <p>${activa ? '' : 'El uniforme que se usa con orgullo. '}Pídelo desde tu celular${pagoInfo?.delivery ? ` y recíbelo en ${esc(pagoInfo.delivery)}` : ''}.</p>
      ${activa ? '' : PASOS_TIENDA}
      ${codigoEscrito ? `<p class="st-codigo-chip">Código <b>${esc(codigoEscrito)}</b> listo: se aplica al pagar.</p>` : ''}
    </section>
    <nav class="st-cats" aria-label="Categorías">
      <a href="#/"${activa ? '' : ' class="activa" aria-current="page"'}>Todo</a>
      ${secciones.map(s => `<a href="#/c/${esc(s.clave)}" data-cat="${esc(s.clave)}"${s.clave === activa ? ' class="activa" aria-current="page"' : ''}>${esc(s.etiqueta)}</a>`).join('')}
    </nav>
    ${visibles.map(s => `<section class="st-seccion" data-seccion="${esc(s.clave)}">
      ${activa ? '' : `<div class="st-seccion-cab"><h2>${esc(s.etiqueta)}</h2>${s.items.length > 4 ? `<a href="#/c/${esc(s.clave)}">Ver todo</a>` : ''}</div>`}
      <div class="st-grid${s.clave === 'kits' ? ' kits' : ''}">${s.items.map(tarjeta).join('')}</div></section>`).join('')}
    <a class="ya-familia" href="/familias/?tab=tienda">
      <span><strong>¿Ya eres familia Tanner?</strong><small>Entra y tus datos y tu Tanner ya van cargados.</small></span><b>Entrar</b></a>`;
  pintaBarra(true);
  firmaFotos($('content'));
}

/* ---------- La ficha de una pieza (PDP) ---------- */
function renderProducto(id) {
  const p = (catalogo.products || []).find(x => String(x.id) === String(id));
  if (!p) { location.replace('#/'); return; }
  const e = (eligiendo[p.id] ||= { cantidad: 1 });
  const cat = categoriaDe(p), unica = tallaUnica(p), tallas = tallasDe(p);
  const varias = admiteVariasTallas(p), cants = e.cantidades || {};
  const multi = varias ? preparaLineasPorTalla(p, { cantidades: cants, manga: e.manga }) : null;
  document.title = `${p.name} · Tienda Tanner`;
  $('content').innerHTML = `
    <a class="st-volver" href="#/c/${esc(cat)}">‹ ${esc(etiquetaDe(cat))}</a>
    <article class="st-pdp" data-ficha="${esc(p.id)}">
      ${galeria(p, e.foto || 0)}
      <div class="st-pdp-info">
        <p class="st-eyebrow">${esc(etiquetaDe(cat))}</p>
        <div class="st-pdp-tit"><h1>${esc(p.name)}</h1>${corazon(`p:${p.id}`, p.name)}</div>
        <p class="st-pdp-precio">${p.precioAntes ? `<s>${money.format(p.precioAntes)}</s> ` : ''}${(et => `${et.desde ? '<small>Desde</small> ' : ''}${money.format(et.monto)}`)(precioDeEtiqueta(p, e.talla || unica))}</p>
        ${precioNinoDe(p) && !(e.talla || unica) ? `<p class="st-precios-nino">Niño (6 a 16) ${money.format(precioDeProducto(p, '10'))} · Adulto ${money.format(Number(p.price || 0))}</p>` : ''}
        ${p.ofertaHasta ? `<p class="st-oferta grande">${esc(p.ofertaNombre || 'Oferta')} · ${esc(textoHasta(p.ofertaHasta))}</p>` : ''}
        ${p.description ? `<p class="st-desc">${esc(p.description)}</p>` : ''}
        <section class="st-bloque${e.falta === 'talla' ? ' falta' : ''}" id="stBloqueTalla">
          ${varias ? `<div class="st-bloque-cab"><h2>Tallas</h2><span>Elige una o varias${botonGuia(tallas)}</span></div>
          ${botonesTallaVarias(tallas, cants)}${filasDeVarias(p, cants, e.manga)}` : `<div class="st-bloque-cab"><h2>Talla</h2><span>${esc(e.talla || unica || '')}${unica ? '' : botonGuia(tallas)}</span></div>
          ${unica ? `<p class="st-unica">Talla ${esc(unica)}: le queda a todos.</p>` : botonesTalla(tallas, e.talla, 'data-talla')}`}
        </section>
        ${aceptaPersonalizacion(p) ? bloquePersonaliza(e, p.name, recargoDe(p), true, null, recargoPersDe(p)) : llevaManga(p) ? bloqueManga(e, recargoDe(p)) : ''}
        ${varias ? '' : `<section class="st-bloque"><div class="st-bloque-cab"><h2>Cantidad</h2></div>
          <div class="st-cantidad"><button type="button" data-cantidad="-1" aria-label="Uno menos">&minus;</button>
          <output>${e.cantidad}</output><button type="button" data-cantidad="1" aria-label="Uno más">+</button></div></section>`}
        ${infoDeCompra()}
      </div>
    </article>
    ${barraAgregar(varias
      ? (multi.ok ? `Agregar ${multi.piezas} ${multi.piezas === 1 ? 'pieza' : 'piezas'} · ${money.format(multi.total)}` : 'Agregar al pedido')
      : textoAgregarProducto(p, e), e.motivo)}`;
  pintaBarra(false);
  cableaGaleria(e);
  firmaFotos($('content'));
}

// El precio de la barra con manga y nombre y número; se repinta al escribir.
function textoAgregarProducto(p, e) {
  const extraManga = e.manga === 'larga' && llevaManga(p) ? recargoDe(p) : 0;
  const extraPers = aceptaPersonalizacion(p) && llevaEstampado(e) ? recargoPersDe(p) : 0;
  return `Agregar al pedido · ${money.format((precioDeProducto(p, e.talla || tallaUnica(p)) + extraManga + extraPers) * e.cantidad)}`;
}

/* ---------- La ficha de un kit ---------- */
// Cuántos jerseys del kit van de manga larga (para el precio que se ve).
function largasDeKit(k, e) {
  return ranurasDeKit(k).map(r0 => ranuraElegida(r0, e.elegidos))
    .filter(r => tieneManga(r.producto || { name: r.nombre }) && ((e.mangas || {})[r.id] || e.manga) === 'larga').length;
}
function precioDeFichaKit(k, e) {
  return precioDeKit(k, e.tier) + largasDeKit(k, e) * recargoDe(k) + extraEstampadoKit(k, e);
}
function textoAgregarKit(k, e) {
  return `Agregar al pedido${e.tier ? ` · ${money.format(precioDeFichaKit(k, e))}` : ''}`;
}
function renderKit(id) {
  const k = (catalogo.bundles || []).find(x => String(x.id) === String(id));
  if (!k) { location.replace('#/'); return; }
  const e = (eligiendoKit[k.id] ||= { tallas: {} });
  const tiers = tiersDeKit(k);
  if (!e.tier && tiers.length === 1) e.tier = tiers[0];
  const pr = precioDeTarjeta(k);
  document.title = `${k.name} · Tienda Tanner`;
  const ranuras = ranurasDeKit(k);
  $('content').innerHTML = `
    <a class="st-volver" href="#/c/kits">‹ Kits</a>
    <article class="st-pdp" data-ficha="${esc(k.id)}">
      ${medioKit(k, 'grande')}
      <div class="st-pdp-info">
        ${e.reemplaza ? '<p class="st-convierte">Convirtiendo en kit: revisa las tallas y agrega. Los jerseys sueltos se quitan del pedido.</p>' : ''}
        <p class="st-eyebrow">Uniforme completo · ${ranuras.length} piezas</p>
        <div class="st-pdp-tit"><h1>${esc(k.name)}</h1>${corazon(`k:${k.id}`, k.name)}</div>
        <p class="st-pdp-precio" id="stPrecioKit">${e.tier ? money.format(precioDeFichaKit(k, e)) : `${pr.desde ? '<small>Desde</small> ' : ''}${money.format(pr.monto)}`}${e.tier && largasDeKit(k, e) && recargoDe(k) ? ` <small class="st-recargo">incluye ${largasDeKit(k, e)} manga larga</small>` : ''}</p>
        ${k.description ? `<p class="st-desc">${esc(k.description)}</p>` : ''}
        ${tiers.length > 1 ? `<section class="st-bloque${e.falta === 'tier' ? ' falta' : ''}" id="stBloqueTier"><div class="st-bloque-cab"><h2>¿Para quién es?</h2></div>
          <div class="st-segmento" role="radiogroup" aria-label="Para quién es">${tiers.map(t => `<button type="button" role="radio" aria-checked="${e.tier === t}" data-tier="${esc(t)}"${e.tier === t ? ' class="activa"' : ''}>
            <strong>${esc(t)}</strong><small>${money.format(precioDeKit(k, t))}</small></button>`).join('')}</div></section>` : ''}
        ${bloqueTallaKit(k, e)}
        <section class="st-bloque"><div class="st-bloque-cab"><h2>Incluye</h2><span>${e.tallaKit ? `Todo talla ${esc(e.tallaKit)} · cambia la que quieras` : 'Elige la talla de cada pieza'}${tallasDelKit(k, e.tier).length > 1 ? botonGuia(tallasDelKit(k, e.tier)) : ''}</span></div>
          <ul class="st-incluye">${ranuras.map(r0 => {
            // Pieza a elegir (Kit Dúo, 14/10/2026): primero cuál, luego su talla.
            const r = ranuraElegida(r0, e.elegidos);
            if (r0.pool && !r.elegido) return `<li class="st-pieza elige${e.falta === r0.id ? ' falta' : ''}" data-ranura="${esc(r0.id)}">
              <div class="st-pieza-cab">${medio(null, null, r0.nombre, 'mini')}<strong>${esc(r0.nombre)}</strong><span>Elige cuál</span></div>
              <div class="st-tallas fila st-opciones">${(r0.opciones || []).map(o => `<button type="button" class="st-talla" data-pieza-elige="${esc(String(o.id ?? o.product_id))}">${esc(nombreCorto(o.name))}</button>`).join('')}</div></li>`;
            const elegida = r.unica || e.tallas[r.id] || '';
            // Con su talla ya puesta, la pieza se pliega: una línea y "Cambiar".
            const plegada = elegida && !r.unica && !(e.abiertas || {})[r.id];
            return `<li class="st-pieza${e.falta === r.id ? ' falta' : ''}${plegada ? ' plegada' : ''}" data-ranura="${esc(r.id)}">
              <div class="st-pieza-cab">${medio(r.producto?.photoThumbPath, r.producto?.photoBucket, r.nombre, 'mini')}
                <strong>${r0.pool ? `${esc(nombreCorto(r.elegido.name))} <button type="button" class="st-cambia" data-pieza-cambia="1">Cambiar</button>` : esc(r.nombre)}</strong><span class="${elegida ? 'ok' : ''}">${elegida ? `Talla ${esc(elegida)}` : 'Elige talla'}</span>${plegada ? '<button type="button" class="st-cambia st-cambia-talla" data-pieza-abre="1">Cambiar</button>' : ''}</div>
              ${r.unica || !r.tallas.length || plegada ? '' : `<div class="st-tallas fila">${tallasDePieza(r.tallas, e.tier).map(t =>
                `<button type="button" class="st-talla${elegida === t ? ' activa' : ''}" data-pieza-talla="${esc(t)}" aria-pressed="${elegida === t}">${esc(t)}</button>`).join('')}</div>`}
              ${tieneManga(r.producto || { name: r.nombre }) ? `<div class="st-pieza-manga">${botonesManga(e, recargoDe(k), 'data-pieza-manga', (e.mangas || {})[r.id] || e.manga)}</div>` : ''}
            </li>`; }).join('')}</ul></section>
        ${bloquePersonaliza(e, k.name, recargoDe(k), false, k, recargoPersDe(k))}
        ${infoDeCompra()}
      </div>
    </article>
    ${barraAgregar(textoAgregarKit(k, e), e.motivo)}`;
  pintaBarra(false);
  firmaFotos($('content'));
}

/* Guía de tallas (25/10/2026): "¿Qué talla es?" junto a las tallas abre las
   medidas de niño y/o adulto que tenga la prenda. */
function botonGuia(tallas) {
  return tablasPara(tallas).hay ? ' <button type="button" class="st-guia-btn" data-guia>¿Qué talla es?</button>' : '';
}
function abreGuia(tallas) {
  const t = tablasPara(tallas);
  if (!t.hay) return;
  const tabla = (titulo, filas, conEdad) => filas.length ? `<h3>${titulo}</h3><table class="st-guia-tabla"><thead><tr><th>Talla</th>${conEdad ? '<th>Edad aprox.</th>' : ''}<th>Pecho</th><th>Largo</th></tr></thead>
    <tbody>${filas.map(f => `<tr><td><b>${esc(f.talla)}</b></td>${conEdad ? `<td>${esc(f.edad)}</td>` : ''}<td>${f.pecho} cm</td><td>${f.largo} cm</td></tr>`).join('')}</tbody></table>` : '';
  document.getElementById('stGuia')?.remove();
  const capa = document.createElement('div');
  capa.id = 'stGuia'; capa.className = 'st-guia-capa';
  capa.innerHTML = `<div class="st-guia" role="dialog" aria-modal="true" aria-labelledby="stGuiaTit">
    <div class="st-guia-cab"><h2 id="stGuiaTit">¿Qué talla es?</h2><button type="button" class="st-guia-cerrar" data-guia-cerrar aria-label="Cerrar">&times;</button></div>
    <p class="st-guia-como"><b>Cómo medir:</b> con la prenda extendida, <b>pecho</b> de axila a axila y <b>largo</b> del hombro a la orilla.</p>
    ${tabla('Niño', t.nino, true)}${tabla('Adulto', t.adulto, false)}
    <p class="st-guia-tip">${esc(CONSEJO_TALLA)}</p>
    ${MEDIDAS_CONFIRMADAS ? '' : '<p class="st-guia-nota">Medidas aproximadas. Si tienes duda, escríbenos y te ayudamos.</p>'}
    <button type="button" class="st-cta" data-guia-cerrar>Entendido</button></div>`;
  document.body.appendChild(capa);
  const cierra = () => { capa.remove(); document.removeEventListener('keydown', esc_); };
  const esc_ = ev => { if (ev.key === 'Escape') cierra(); };
  capa.addEventListener('click', ev => { if (ev.target === capa || ev.target.closest('[data-guia-cerrar]')) cierra(); });
  document.addEventListener('keydown', esc_);
  capa.querySelector('.st-guia-cerrar').focus();
}
/* Una talla para todo el kit (25/10/2026): casi todas las familias piden la
   misma talla en todas las piezas. Se elige una vez y se pone en cada pieza
   que la tenga; luego se cambia la que haga falta. */
function tallasDelKit(k, tier) {
  const todas = new Set();
  ranurasDeKit(k).forEach(r0 => (r0.tallas || []).forEach(t => todas.add(t)));
  (ranurasDeKit(k).flatMap(r0 => r0.opciones || [])).forEach(o => tallasDe(o).forEach(t => todas.add(t)));
  const g = gruposDeTallas([...todas]);
  const tipo = tier === 'Adulto' ? 'Adulto' : tier ? 'Niño' : null;
  return (tipo && g.some(x => x.etiqueta === tipo) ? g.filter(x => x.etiqueta === tipo) : g).flatMap(x => x.tallas);
}
function bloqueTallaKit(k, e) {
  const conTalla = ranurasDeKit(k).filter(r0 => { const r = ranuraElegida(r0, e.elegidos); return !r.unica && (r.tallas?.length || r0.pool); });
  const tallas = tallasDelKit(k, e.tier);
  if (conTalla.length < 2 || tallas.length < 2) return '';
  return `<section class="st-bloque st-talla-kit"><div class="st-bloque-cab"><h2>Talla para todo el kit</h2><span>Un toque y listo</span></div>
    <div class="st-tallas">${tallas.map(t => `<button type="button" class="st-talla${e.tallaKit === t ? ' activa' : ''}" data-kit-talla="${esc(t)}" aria-pressed="${e.tallaKit === t}">${esc(t)}</button>`).join('')}</div></section>`;
}
function ponTallaKit(k, e, talla) {
  e.tallaKit = talla;
  const tallas = { ...(e.tallas || {}) };
  ranurasDeKit(k).forEach(r0 => {
    const r = ranuraElegida(r0, e.elegidos);
    if (!r.unica && (r.tallas || []).includes(talla)) tallas[r.id] = talla;
  });
  e.tallas = tallas; e.abiertas = {};
  if (e.falta && tallas[e.falta]) { e.falta = null; e.motivo = null; }
}

/* Las tallas de una pieza del kit: primero las del tipo elegido (un kit de
   niño casi siempre lleva tallas de niño), luego las demás. */
function tallasDePieza(tallas, tier) {
  const g = gruposDeTallas(tallas);
  const primero = tier === 'Adulto' ? 'Adulto' : 'Niño';
  return [...g.filter(x => x.etiqueta === primero), ...g.filter(x => x.etiqueta !== primero)].flatMap(x => x.tallas);
}

/* Repinta la misma ficha sin brincar arriba. */
function repinta(fn, id) { const y = window.scrollY; fn(id); window.scrollTo(0, y); }

/* Un solo manejador para todo: las fichas se repintan enteras en cada toque. */
function cablea() {
  const raiz = $('content');
  raiz.addEventListener('click', ev => {
    const ficha = raiz.querySelector('[data-ficha]')?.dataset.ficha;
    const esKit = !!(ficha && (catalogo.bundles || []).some(k => String(k.id) === ficha));
    const t = ev.target;
    if (t.closest('[data-guia]')) {
      if (esKit) { const k = (catalogo.bundles || []).find(x => String(x.id) === ficha); abreGuia(tallasDelKit(k, eligiendoKit[ficha]?.tier)); }
      else abreGuia(tallasDe((catalogo.products || []).find(x => String(x.id) === ficha)));
      return;
    }
    const tk = t.closest('[data-kit-talla]');
    if (tk && ficha) { const k = (catalogo.bundles || []).find(x => String(x.id) === ficha); ponTallaKit(k, eligiendoKit[ficha], tk.dataset.kitTalla); repinta(renderKit, ficha); return; }
    const abre = t.closest('[data-pieza-abre]');
    if (abre && ficha) { const e = eligiendoKit[ficha], r = abre.closest('[data-ranura]').dataset.ranura; e.abiertas = { ...(e.abiertas || {}), [r]: true }; repinta(renderKit, ficha); return; }
    const talla = t.closest('[data-talla]');
    if (talla && ficha) {
      const e = eligiendo[ficha], p = (catalogo.products || []).find(x => String(x.id) === ficha);
      if (admiteVariasTallas(p)) e.cantidades = cambiaCantidadDeTalla(e.cantidades, talla.dataset.talla);
      else e.talla = talla.dataset.talla;
      e.motivo = null; e.falta = null; e.recien = null; repinta(renderProducto, ficha); return;
    }
    const varia = t.closest('[data-varia-cant]');
    if (varia && ficha) {
      const e = eligiendo[ficha];
      e.cantidades = cambiaCantidadDeTalla(e.cantidades, varia.closest('[data-varia]').dataset.varia, Number(varia.dataset.variaCant));
      repinta(renderProducto, ficha); return;
    }
    if (t.closest('[data-otro]') && ficha) {
      const e = esKit ? eligiendoKit[ficha] : eligiendo[ficha];
      e.recien = null;
      repinta(esKit ? renderKit : renderProducto, ficha);
      (esKit ? document.querySelector('[data-ranura]') : $('stBloqueTalla'))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const cant = t.closest('[data-cantidad]');
    if (cant && ficha) { const e = eligiendo[ficha]; e.cantidad = Math.max(1, Math.min(20, (e.cantidad || 1) + Number(cant.dataset.cantidad))); repinta(renderProducto, ficha); return; }
    const manga = t.closest('[data-manga]');
    if (manga && ficha) {
      const e = esKit ? eligiendoKit[ficha] : eligiendo[ficha];
      e.manga = manga.dataset.manga;
      repinta(esKit ? renderKit : renderProducto, ficha); return;
    }
    const tier = t.closest('[data-tier]');
    if (tier && ficha) {
      const e = eligiendoKit[ficha]; e.tier = tier.dataset.tier; e.motivo = null; e.falta = null;
      // Cambiar de niño a adulto deja de tener sentido la talla de todo el kit.
      const k = (catalogo.bundles || []).find(x => String(x.id) === ficha);
      if (e.tallaKit && !tallasDelKit(k, e.tier).includes(e.tallaKit)) { e.tallaKit = null; e.tallas = {}; e.abiertas = {}; }
      repinta(renderKit, ficha); return;
    }
    const pm = t.closest('[data-pieza-manga]');
    if (pm && ficha) {
      const e = eligiendoKit[ficha], r = pm.closest('[data-ranura]').dataset.ranura;
      e.mangas = { ...(e.mangas || {}), [r]: pm.dataset.piezaManga };
      repinta(renderKit, ficha); return;
    }
    const elige = t.closest('[data-pieza-elige]'), cambia = t.closest('[data-pieza-cambia]');
    if ((elige || cambia) && ficha) {
      const e = eligiendoKit[ficha], r = (elige || cambia).closest('[data-ranura]').dataset.ranura;
      const elegidos = { ...(e.elegidos || {}) };
      if (elige) elegidos[r] = elige.dataset.piezaElige; else delete elegidos[r];
      const kit = (catalogo.bundles || []).find(x => String(x.id) === ficha);
      const nueva = ranuraElegida(ranurasDeKit(kit).find(x => x.id === r), elegidos);
      const tallas = { ...(e.tallas || {}) };
      if (tallas[r] && !(nueva.tallas || []).includes(tallas[r])) delete tallas[r];
      if (elige && e.tallaKit && (nueva.tallas || []).includes(e.tallaKit)) tallas[r] = e.tallaKit;
      Object.assign(e, { elegidos, tallas });
      if (e.falta === r) { e.falta = null; e.motivo = null; }
      repinta(renderKit, ficha); return;
    }
    const pieza = t.closest('[data-pieza-talla]');
    if (pieza && ficha) {
      const e = eligiendoKit[ficha], r = pieza.closest('[data-ranura]').dataset.ranura;
      e.tallas = { ...e.tallas, [r]: pieza.dataset.piezaTalla };
      e.abiertas = { ...(e.abiertas || {}), [r]: false };
      if (e.falta === r) { e.falta = null; e.motivo = null; }
      repinta(renderKit, ficha); return;
    }
    if (t.closest('#stAgregar') && ficha) { esKit ? agregaKit(ficha) : agregaProducto(ficha); return; }
  });
  // Lo que se escribe se guarda al vuelo: si se toca Agregar sin salir del
  // campo, el nombre ya está.
  raiz.addEventListener('input', ev => {
    const campo = ev.target.dataset?.campo, ficha = raiz.querySelector('[data-ficha]')?.dataset.ficha;
    if (!campo || !ficha) return;
    const e = eligiendo[ficha] || eligiendoKit[ficha];
    if (e) e[campo] = ev.target.value;
    // La playera se redibuja con cada letra.
    if (e && (campo === 'nombre' || campo === 'numero')) { repintaMockup(e); repintaPrecio(ficha); }
  });
}

// Con cargo de nombre y número el precio cambia al escribir: sólo el texto,
// sin repintar la ficha (se perdería el foco del campo).
function repintaPrecio(ficha) {
  const p = (catalogo.products || []).find(x => String(x.id) === String(ficha));
  const k = p ? null : (catalogo.bundles || []).find(x => String(x.id) === String(ficha));
  const boton = $('stAgregar');
  if (p && boton && !admiteVariasTallas(p)) boton.textContent = textoAgregarProducto(p, eligiendo[ficha]);
  if (k && boton) {
    const e = eligiendoKit[ficha];
    boton.textContent = textoAgregarKit(k, e);
    const precio = $('stPrecioKit');
    if (precio && e.tier) precio.firstChild.textContent = money.format(precioDeFichaKit(k, e));
  }
}

function falla(e, r, render, id) {
  e.motivo = r.motivo; e.falta = r.falta || null;
  repinta(render, id);
  const objetivo = e.falta === 'talla' ? $('stBloqueTalla') : e.falta === 'tier' ? $('stBloqueTier')
    : e.falta ? document.querySelector(`[data-ranura="${CSS.escape(e.falta)}"]`) : null;
  objetivo?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function agregaProducto(id) {
  const p = (catalogo.products || []).find(x => String(x.id) === String(id));
  if (!p) return;
  const e = eligiendo[id];
  if (admiteVariasTallas(p)) {
    const m = preparaLineasPorTalla(p, { cantidades: e.cantidades, manga: e.manga });
    if (!m.ok) { falla(e, m, renderProducto, id); return; }
    for (const l of m.lineas) carrito = agregaAlCarrito(carrito, l);
    const texto = `${m.piezas} ${m.piezas === 1 ? 'pieza' : 'piezas'} · ${m.lineas.map(l => `${l.cantidad > 1 ? `${l.cantidad} ` : ''}${l.talla}`).join(', ')}`;
    eligiendo[id] = { cantidad: 1, recien: texto };
    actualizaCarrito();
    repinta(renderProducto, id);
    agregado({ foto: fotoMini(p), titulo: p.name, detalle: texto, precio: m.total });
    return;
  }
  const r = preparaLinea(p, { talla: e.talla, cantidad: e.cantidad || 1, nombre: e.nombre, numero: e.numero, manga: e.manga });
  if (!r.ok) { falla(e, r, renderProducto, id); return; }
  carrito = agregaAlCarrito(carrito, r.linea);
  const l = r.linea, quien = [l.personalizationName, l.numero].filter(Boolean).join(' ');
  eligiendo[id] = { cantidad: 1, recien: [quien, l.talla && `talla ${l.talla}`, l.manga === 'larga' && 'manga larga', l.cantidad > 1 && `${l.cantidad} piezas`].filter(Boolean).join(' · ') || p.name };
  actualizaCarrito();
  repinta(renderProducto, id);
  // "Agregar otro" sólo donde tiene sentido: lo que lleva nombre (el del hermano).
  agregado({ foto: fotoMini(p), titulo: p.name, detalle: eligiendo[id].recien === p.name ? '' : eligiendo[id].recien, precio: l.total, otro: aceptaPersonalizacion(p) });
}
function agregaKit(id) {
  const k = (catalogo.bundles || []).find(x => String(x.id) === String(id));
  if (!k) return;
  const e = eligiendoKit[id];
  const r = preparaKit(k, { tier: e.tier, tallas: e.tallas || {}, elegidos: e.elegidos || {}, mangas: e.mangas || {}, nombre: e.nombre, numero: e.numero, manga: e.manga });
  if (!r.ok) { falla(e, r, renderKit, id); return; }
  // Convertir: el jersey suelto deja el carrito y se vuelve al pedido.
  const reemplaza = (Array.isArray(e.reemplaza) ? e.reemplaza : e.reemplaza ? [e.reemplaza] : []).filter(k => carrito[k]);
  for (const k of reemplaza) carrito = quitaUnaPieza(carrito, k);
  carrito = agregaAlCarrito(carrito, r.linea);
  eligiendoKit[id] = { tallas: {}, tier: e.tier,
    recien: [k.name, [r.linea.personalizationName, r.linea.numero].filter(Boolean).join(' '), r.linea.tier.toLocaleLowerCase('es-MX')].filter(Boolean).join(' · ') };
  actualizaCarrito();
  if (reemplaza.length) { location.hash = '#/pedido'; setTimeout(() => aviso(`Listo: ahora es ${k.name}`, true), 60); return; }
  repinta(renderKit, id);
  const quien = [r.linea.personalizationName, r.linea.numero].filter(Boolean).join(' ');
  agregado({ foto: medioKit(k, 'st-ag-foto'), titulo: k.name, detalle: [r.linea.tier, quien].filter(Boolean).join(' · '), precio: r.linea.total, otro: true });
}

/* ---------- Confirmar ----------
 * Aquí sí se piden los datos, y sólo aquí: ya hay algo que comprar. */
function resumen() {
  const lineas = Object.entries(carrito);
  const sub = totalDelCarrito(carrito), desc = codigo?.ok ? descuentoDeCodigo(codigo, carrito, sub) : 0;
  const regalo = codigo?.ok && codigo.kind === 'regalo'
    ? `<div class="carrito-regalo"><span>${esc(codigo.giftName || 'Regalo')} <small>de regalo · código ${esc(codigo.code)}</small></span><strong>$0</strong></div>` : '';
  const menos = desc > 0 ? `<div class="carrito-sub"><span>Subtotal</span><span>${money.format(sub)}</span></div>
    <div class="carrito-desc"><span>Código ${esc(codigo.code)}</span><span>−${money.format(desc)}</span></div>` : '';
  return `<section class="carrito-lista">${lineas.map(([k, l]) => lineaDelCarrito(k, l)).join('')}${regalo}
    ${menos}<div class="carrito-total"><span>Total</span><strong>${money.format(Math.max(0, sub - desc))}</strong></div></section>${sugiereKits()}`;
}
/* "¿Tienes un código?": se escribe, se valida con el servidor y dice qué hace
   (o por qué no). Si cambia el carrito se vuelve a validar: la compra mínima
   puede dejar de cumplirse. */
function cajaCodigo() {
  const ok = codigo?.ok;
  const desc = ok ? descuentoDeCodigo(codigo, carrito) : 0;
  return `<section class="st-codigo${ok ? ' aplicado' : ''}" aria-label="Código">
    ${ok ? `<p class="st-codigo-ok"><b>${esc(codigo.code)}</b><span>${esc(textoAplicado(codigo, desc, n => money.format(n)))}</span></p>
      <button type="button" class="st-codigo-quita" data-codigo-quita>Quitar</button>`
    : `<label class="st-codigo-campo"><span>¿Tienes un código?</span>
        <span class="st-codigo-fila"><input id="stCodigo" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="24" value="${esc(codigoEscrito)}" placeholder="CÓDIGO">
        <button type="button" data-codigo-aplica>Aplicar</button></span></label>
      ${codigo && !codigo.ok ? `<p class="st-codigo-mal" role="alert">${esc(codigo.motivo || 'Ese código no se puede usar.')}</p>` : ''}`}
  </section>`;
}
async function aplicaCodigo(texto, { silencio = false } = {}) {
  const code = normalizaCodigo(texto);
  codigoEscrito = code;
  try { code ? sessionStorage.setItem('tiendaCodigo', code) : sessionStorage.removeItem('tiendaCodigo'); } catch {}
  if (!code) { codigo = null; return pintaCodigo(); }
  if (!codigoValido(code)) { codigo = { ok: false, motivo: 'Ese código no existe. Revisa cómo se escribe.' }; return pintaCodigo(); }
  try {
    codigo = await rpc('v2_public_check_code', { club_key: CLUB_KEY, code, subtotal: totalDelCarrito(carrito) });
  } catch (err) {
    codigo = silencio ? null : { ok: false, motivo: /too many/i.test(err?.message || '') ? 'Demasiados intentos. Espera un rato.' : 'No se pudo revisar el código.' };
  }
  pintaCodigo();
}
function pintaCodigo() {
  if ($('stCodigoCaja')) $('stCodigoCaja').innerHTML = cajaCodigo();
  refrescaResumen();
}
// Lo que se va a pagar, ya con el código.
function totalAPagar() {
  const sub = totalDelCarrito(carrito);
  return Math.max(0, sub - (codigo?.ok ? descuentoDeCodigo(codigo, carrito, sub) : 0));
}
function textoConfirmar() { return `Confirmar pedido · ${money.format(totalAPagar())}`; }
function refrescaResumen() {
  if ($('resumenCarrito')) $('resumenCarrito').innerHTML = resumen();
  const b = $('submitOrder'); if (b && !b.disabled) b.textContent = textoConfirmar();
}
/* ¿Lo conviertes en kit? Un jersey suelto que también viene en un kit lo
   dice: qué más incluye y cuánto más cuesta. Convertir abre el kit ya lleno. */
function sugiereKits() {
  const s = sugerenciasDeKit(carrito, catalogo.bundles || []);
  if (!s.length) return '';
  return `<section class="st-sugiere" aria-label="Conviértelo en kit">${s.map(x => `<article class="st-sugiere-kit${x.diferencia < 0 ? ' ahorro' : ''}">
      <div><strong>${x.linea.personalizationName ? `${esc(x.linea.personalizationName)}${x.linea.numero ? ` #${esc(x.linea.numero)}` : ''}` : 'Arma el kit'}</strong>
      <span>${esc(textoSugerencia(x, n => money.format(n)))}</span></div>
      <button type="button" class="st-sugiere-btn" data-convierte="${esc(x.llave)}" data-kit-id="${esc(x.kit.id)}">Convertir en kit</button></article>`).join('')}</section>`;
}
function convierteEnKit(llave, kitId) {
  const x = sugerenciasDeKit(carrito, catalogo.bundles || []).find(v => v.llave === llave && String(v.kit.id) === String(kitId));
  if (!x) return;
  eligiendoKit[x.kit.id] = { ...x.opciones, tallas: { ...x.opciones.tallas }, reemplaza: x.llaves };
  location.hash = `#/k/${encodeURIComponent(x.kit.id)}`;
}

/* ¿Le agregas algo más? Justo antes de los datos: ya decidió comprar.
   Carrusel (26/10/2026). Presidencia: "se ve distinto porque se ve lo de
   escoge talla... yo haría un carrusel que se viera más chido". Todas las
   tarjetas son iguales: foto, nombre, precio y UN botón. Lo de talla única
   entra de un toque; lo que tiene tallas abre un panel con las tallas como
   botones grandes; lo que lleva nombre va a su ficha. */
function extrasAntesDePagar() {
  const l = sugerenciasAntesDePagar(catalogo.products || [], carrito, { max: 8 });
  if (!l.length) return '';
  return `<section class="st-extra" aria-label="Agrega algo más"><div class="st-extra-cab"><div><h2>¿Le agregas algo más?</h2><span>Va en el mismo pedido</span></div>
    ${l.length > 2 ? '<div class="st-extra-flechas"><button type="button" data-extra-mueve="-1" aria-label="Ver anteriores">&lsaquo;</button><button type="button" data-extra-mueve="1" aria-label="Ver siguientes">&rsaquo;</button></div>' : ''}</div>
    <div class="st-extra-fila">${l.map(p => {
      // Un solo camino para todo (27/10/2026): "si queremos agregar el de
      // la cabra te manda a escoger la talla, y en los jerseys no... haz que
      // sean iguales". Lo que pide algo (talla, nombre) abre el mismo panel.
      const pide = (!tallaUnica(p) && tallasDe(p).length > 0) || aceptaPersonalizacion(p);
      const boton = `<button type="button" class="st-extra-btn" data-extra-agrega>${pide ? 'Elegir talla' : 'Agregar'}</button>`;
      return `<article class="st-extra-card" data-extra="${esc(p.id)}">${medioProducto(p)}
        <div class="st-extra-txt"><strong>${esc(p.name)}</strong><span class="st-precio">${(et => `${et.desde ? '<small>Desde</small> ' : ''}${money.format(et.monto)}`)(precioDeEtiqueta(p))}</span>${boton}</div></article>`;
    }).join('')}</div></section>`;
}
function agregaExtra(card) {
  const p = (catalogo.products || []).find(x => String(x.id) === card.dataset.extra);
  if (!p) return;
  if ((!tallaUnica(p) && tallasDe(p).length) || aceptaPersonalizacion(p)) { abreTallaRapida(p); return; }
  sumaExtra(p, {});
}
function sumaExtra(p, opciones) {
  const r = preparaLinea(p, { ...opciones, cantidad: 1 });
  if (!r.ok) return r;
  carrito = agregaAlCarrito(carrito, r.linea);
  actualizaCarrito();
  refrescaResumen();
  $('stExtras').innerHTML = extrasAntesDePagar();
  firmaFotos($('stExtras'));
  if (codigo) aplicaCodigo(codigo.code || codigoEscrito, { silencio: true });
  aviso(`Agregado · ${p.name}${r.linea.talla && !tallaUnica(p) ? ` talla ${r.linea.talla}` : ''}`);
  return r;
}
/* El panel del carrusel: la talla en botones grandes y, si la prenda lo
   lleva, nombre, número y manga, con el precio que cambia al elegir. Lo
   mismo para una playera que para un jersey: un solo camino. */
function abreTallaRapida(p) {
  document.getElementById('stTallaRapida')?.remove();
  const tallas = tallasDe(p), unica = tallaUnica(p), pers = aceptaPersonalizacion(p), manga = llevaManga(p);
  const e = { talla: unica || null, nombre: '', numero: '', manga: 'corta' };
  const capa = document.createElement('div');
  capa.id = 'stTallaRapida'; capa.className = 'st-guia-capa';
  const precio = () => precioDeProducto(p, e.talla || unica) + (manga && e.manga === 'larga' ? recargoDe(p) : 0)
    + (pers && llevaEstampado(e) ? recargoPersDe(p) : 0);
  const pinta = () => {
    capa.innerHTML = `<div class="st-guia st-talla-rapida" role="dialog" aria-modal="true" aria-labelledby="stTallaTit">
      <div class="st-guia-cab"><h2 id="stTallaTit">${pers ? 'Arma tu jersey' : 'Elige la talla'}</h2><button type="button" class="st-guia-cerrar" data-tr-cerrar aria-label="Cerrar">&times;</button></div>
      <div class="st-tr-prod">${medioProducto(p)}<div><strong>${esc(p.name)}</strong><span>${precioNinoDe(p) ? `Niño ${money.format(precioDeProducto(p, '10'))} · Adulto ${money.format(Number(p.price || 0))}` : money.format(Number(p.price || 0))}</span></div></div>
      ${unica ? '' : `<div class="st-tr-tit"><b>Talla</b>${tablasPara(tallas).hay ? '<button type="button" class="st-guia-btn" data-tr-guia>¿Qué talla es?</button>' : ''}</div>
      ${botonesTalla(tallas, e.talla, 'data-talla-rapida')}`}
      ${pers ? `<div class="st-tr-tit"><b>Nombre y número</b><span>${esc(recargoPersDe(p) ? `Opcional · +${money.format(recargoPersDe(p))}` : 'Opcional')}</span></div>
        <div class="st-perso"><label><span>Nombre en la espalda</span><input data-tr-campo="nombre" maxlength="20" autocomplete="off" autocapitalize="characters" value="${esc(e.nombre)}" placeholder="LEO"></label>
        <label class="num"><span>Número</span><input data-tr-campo="numero" inputmode="numeric" maxlength="3" autocomplete="off" value="${esc(e.numero)}" placeholder="10"></label></div>` : ''}
      ${manga ? `<div class="st-tr-tit"><b>Manga</b></div>${botonesManga(e, recargoDe(p), 'data-tr-manga')}` : ''}
      <p class="st-motivo" role="alert">${esc(e.motivo || '')}</p>
      <button type="button" class="st-cta" data-tr-agrega>${e.talla || unica ? `Agregar · ${money.format(precio())}` : 'Elige la talla'}</button></div>`;
    firmaFotos(capa);
  };
  const precioEnBoton = () => { const b = capa.querySelector('[data-tr-agrega]'); if (b && (e.talla || unica)) b.textContent = `Agregar · ${money.format(precio())}`; };
  pinta();
  document.body.appendChild(capa);
  const cierra = () => { capa.remove(); document.removeEventListener('keydown', esc_); };
  const esc_ = ev => { if (ev.key === 'Escape') cierra(); };
  capa.addEventListener('click', ev => {
    if (ev.target === capa || ev.target.closest('[data-tr-cerrar]')) { cierra(); return; }
    if (ev.target.closest('[data-tr-guia]')) { abreGuia(tallas); return; }
    const t = ev.target.closest('[data-talla-rapida]');
    if (t) { e.talla = t.dataset.tallaRapida; e.motivo = ''; pinta(); return; }
    const m = ev.target.closest('[data-tr-manga]');
    if (m) { e.manga = m.dataset.trManga; pinta(); return; }
    if (ev.target.closest('[data-tr-agrega]')) {
      if (!e.talla && !unica) { e.motivo = 'Elige la talla.'; pinta(); return; }
      const r = sumaExtra(p, { talla: e.talla, nombre: e.nombre, numero: e.numero, manga: e.manga });
      if (r && !r.ok) { e.motivo = r.motivo; pinta(); return; }
      cierra();
    }
  });
  capa.addEventListener('input', ev => {
    const c = ev.target.dataset?.trCampo; if (!c) return;
    e[c] = ev.target.value; precioEnBoton();
  });
  document.addEventListener('keydown', esc_);
  capa.querySelector('[data-talla-rapida], [data-tr-agrega]')?.focus();
}
function cableaExtras() {
  $('stExtras').addEventListener('click', e => {
    const b = e.target.closest('[data-extra-agrega]'); if (b) { agregaExtra(b.closest('[data-extra]')); return; }
    const m = e.target.closest('[data-extra-mueve]');
    if (m) { const fila = $('stExtras').querySelector('.st-extra-fila'); fila?.scrollBy({ left: Number(m.dataset.extraMueve) * fila.clientWidth * 0.8, behavior: 'smooth' }); }
  });
}

function renderCheckout() {
  if (!piezasDelCarrito(carrito)) { location.replace('#/'); return; }
  pintaBarra(false);
  document.title = 'Tu pedido · Tienda Tanner';
  /* El pedido (27/10/2026). Presidencia: "estos checkbox están horribles...
     rediséñalo como un experto en UX". En compu, dos columnas: a la
     izquierda lo que se llena (algo más, tus datos, aceptar) y a la derecha
     el resumen fijo con el código y el total. En el celular, una sola
     columna: el resumen arriba y la letra chica hasta abajo. El botón dice
     el total, para que nadie confirme a ciegas. */
  $('content').innerHTML = `<a class="st-volver" href="#/" id="volver">‹ Seguir comprando</a>
    <h1 class="st-titulo">Tu pedido</h1>
    <div class="st-co">
      <aside class="st-co-lado">
        <section class="st-co-card st-co-resumen" aria-label="Resumen"><h2 class="st-co-tit">Resumen</h2>
          <div id="resumenCarrito">${resumen()}</div>
          <div id="stCodigoCaja">${cajaCodigo()}</div></section>
        <div class="st-co-info">${infoDeCompra()}</div>
      </aside>
      <div class="st-co-main">
        <div id="stExtras">${extrasAntesDePagar()}</div>
        <form id="orderForm" class="st-form st-co-form" novalidate>
          <section class="st-co-card"><h2 class="st-co-tit">Tus datos<small>Te avisamos por WhatsApp cuando esté listo.</small></h2>
            <div class="st-co-campos">
              <label class="st-campo"><span>Nombre de quien recibe</span><input id="customerName" minlength="2" maxlength="120" required autocomplete="name" placeholder="Nombre y apellido"></label>
              ${phoneMarkup()}
              <label class="st-campo"><span>Correo <em>opcional</em></span><input id="customerEmail" type="email" autocomplete="email" maxlength="254" placeholder="tu@correo.com"></label>
              <details class="st-co-nota"><summary>Agregar un comentario</summary>
                <textarea id="orderNotes" rows="2" maxlength="500" placeholder="Algo que debamos saber (opcional)"></textarea></details>
            </div></section>
          <fieldset class="st-co-card st-acepto"><legend class="st-co-tit">Antes de confirmar</legend>
            <label class="st-check"><input id="orderDataConsent" type="checkbox" required>
              <span>Acepto el <a href="/aviso-de-privacidad/" target="_blank" rel="noopener">aviso de privacidad</a>: ${esc(clubNombre || 'el club')} usa mis datos sólo para mi pedido, el pago y la entrega.</span></label>
            <label class="st-check st-plazo"><input id="orderPickup" type="checkbox" required>
              <span>Tengo <b>${DIAS_PARA_RECOGER} días</b> para recoger mi pedido desde que me avisen que llegó. Después, el club ya no se hace responsable de la prenda.</span></label>
            <small class="st-acepto-version">Aviso de privacidad ${PRIVACY_NOTICE_VERSION}</small>
          </fieldset>
          <div id="formMessage" class="message hidden"></div>
          <button id="submitOrder" class="st-cta st-co-confirmar" type="submit">${textoConfirmar()}</button>
          <p class="st-co-seguro">Al confirmar ves la CLABE y tu referencia para pagar.</p>
        </form>
      </div>
    </div>`;
  wirePhone();
  // Quitar un renglón no borra lo que ya se escribió en el formulario.
  $('resumenCarrito').onclick = e => {
    const cv = e.target.closest('[data-convierte]');
    if (cv) { convierteEnKit(cv.dataset.convierte, cv.dataset.kitId); return; }
    const q = e.target.closest('[data-quita]'); if (!q) return;
    carrito = quitaDelCarrito(carrito, q.dataset.quita);
    actualizaCarrito();
    if (!piezasDelCarrito(carrito)) { location.hash = '#/'; return; }
    refrescaResumen();
    $('stExtras').innerHTML = extrasAntesDePagar();
    firmaFotos($('stExtras'));
    if (codigo) aplicaCodigo(codigo.code || codigoEscrito, { silencio: true });
  };
  $('orderForm').addEventListener('submit', submit);
  $('stCodigoCaja').addEventListener('click', e => {
    if (e.target.closest('[data-codigo-aplica]')) aplicaCodigo($('stCodigo')?.value);
    if (e.target.closest('[data-codigo-quita]')) { codigo = null; aplicaCodigo(''); }
  });
  $('stCodigoCaja').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.id === 'stCodigo') { e.preventDefault(); aplicaCodigo(e.target.value); }
  });
  // Llegó con la liga del embajador: el código ya va puesto.
  if (codigoEscrito && !codigo) aplicaCodigo(codigoEscrito, { silencio: true });
  else if (codigo) aplicaCodigo(codigo.code || codigoEscrito, { silencio: true });
  cableaExtras();
  firmaFotos($('stExtras'));
}

/* ---------- Rutas ---------- */
let rutaPrevia = '';
function ruta() {
  const h = location.hash.replace(/^#\/?/, '');
  const [a, b] = h.split('/');
  const cambia = h !== rutaPrevia; rutaPrevia = h;
  if (a === 'embajador' && b) renderEmbajador(decodeURIComponent(b));
  else if (a === 'p' && b) renderProducto(decodeURIComponent(b));
  else if (a === 'k' && b) renderKit(decodeURIComponent(b));
  else if (a === 'pedido') renderCheckout();
  else renderTienda(a === 'c' ? decodeURIComponent(b || '') : '');
  if (cambia) { window.scrollTo(0, 0); cierraAviso(); cierraMini(); }
}
function cierraAviso() { clearTimeout(avisoTimer); const el = $('stAviso'); el.classList.remove('entra'); el.hidden = true; }

function setMessage(t = '', type = 'error') {
  const e = $('formMessage'); if (!e) return;
  e.textContent = t; e.dataset.type = type; e.classList.toggle('hidden', !t);
  if (t) e.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function submit(e) {
  e.preventDefault();
  setMessage();
  // Lo que falta se dice y se señala ahí mismo, en orden de arriba abajo.
  document.querySelectorAll('.st-falta').forEach(x => x.classList.remove('st-falta'));
  const falta = (el, t) => { el?.closest('.st-campo, .st-check, .phone-widget')?.classList.add('st-falta'); el?.focus?.({ preventScroll: true }); el?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return setMessage(t); };
  if ($('customerName').value.trim().length < 2) return falta($('customerName'), 'Escribe el nombre de quien recibe.');
  if (!$('orderDataConsent').checked) return falta($('orderDataConsent'), 'Necesitamos tu autorización de datos para gestionar el pedido.');
  if (!$('orderPickup').checked) return falta($('orderPickup'), `Confirma que tienes ${DIAS_PARA_RECOGER} días para recoger tu pedido.`);
  const btn = $('submitOrder');
  let phone;
  try { phone = validatePhone(true); } catch (err) { return falta($('customerPhone'), err.message); }
  btn.disabled = true; btn.textContent = 'Guardando…';
  const consent = { dataAccepted: true, privacyNoticeVersion: PRIVACY_NOTICE_VERSION, acceptedAt: acceptedAt(), source: 'public-web', pickupDays: DIAS_PARA_RECOGER, pickupAccepted: true };
  const comun = {
    club_key: CLUB_KEY,
    customer_name: $('customerName').value.trim(),
    customer_phone: phone,
    customer_email: $('customerEmail').value.trim() || null,
    notes: $('orderNotes').value.trim() || null,
    consent
  };
  // El mismo formato de línea que el portal de familias (portal_place_order).
  const items = Object.values(carrito).map(l => l.kind === 'bundle'
    ? { kind: 'bundle', bundleId: l.bundleId, tier: l.tier,
        personalizationName: l.personalizationName || null, number: l.numero || null, sleeve: l.manga || null,
        pieces: (l.piezas || []).map(pz => ({ productId: pz.productId, talla: pz.talla || null, ...(pz.manga ? { sleeve: pz.manga } : {}) })) }
    : { kind: 'product', productId: l.productId, quantity: l.cantidad || 1, talla: l.talla || null,
        personalizationName: l.personalizationName || null, number: l.numero || null, sleeve: l.manga || null });
  // El código viaja como una línea más; el servidor lo vuelve a validar.
  if (codigo?.ok) items.push({ kind: 'code', code: codigo.code });
  try {
    const result = await rpc('v2_public_cart_order', { ...comun, items });
    carrito = {};
    codigo = null; codigoEscrito = '';
    try { sessionStorage.removeItem('tiendaCodigo'); } catch {}
    actualizaCarrito();
    renderListo(result, comun.customer_name);
  } catch (err) {
    setMessage(err.message || 'No se pudo enviar el pedido.');
    btn.disabled = false; btn.textContent = textoConfirmar();
  }
}

/* ---------- Pedido recibido ----------
 * Antes terminaba en "te contactamos por WhatsApp para el pago": la familia
 * se quedaba esperando sin saber a qué cuenta pagar. Ahora sale cómo pagar,
 * con el folio como referencia, y un botón que le manda el comprobante al
 * club por WhatsApp. */
/* ---------- La liga del embajador (26/10/2026, h46) ----------
 * "Que vea sus ventas y que gane algo": cuántas compras con su código, cuánto
 * va y su premio, sin nombres de clientes. Y el botón para compartirlo. */
async function renderEmbajador(token) {
  pintaBarra(false);
  document.title = 'Mis ventas · Tienda Tanner';
  $('content').innerHTML = '<p class="muted st-emb-cargando">Cargando tus ventas…</p>';
  let d;
  try { d = await rpc('v2_public_code_stats', { token }); }
  catch {
    $('content').innerHTML = `<div class="empty-state"><h2>Esta liga ya no existe</h2>
      <p class="muted">Pídele al club tu liga nueva.</p><a class="st-cta" href="#/">Ir a la tienda</a></div>`;
    return;
  }
  const st = d.stats || {}, conPremio = Number(d.rewardPct || 0) > 0;
  const compra = ligaDeCompra(location.origin, d.code, new URLSearchParams(location.search).get('club') || '');
  const texto = `Usa mi código ${d.code} en la tienda de ${d.club || 'el club'}: ${d.label}. ${compra}`;
  const tile = (t, v, sub = '', clase = '') => `<div class="st-emb-tile ${clase}"><span>${esc(t)}</span><b>${esc(v)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
  $('content').innerHTML = `<section class="st-emb">
    <p class="st-eyebrow">${esc(d.club || '')} · Embajador</p>
    <h1>${d.ambassador ? `Hola, ${esc(d.ambassador)}` : 'Tus ventas'}</h1>
    <div class="st-emb-codigo"><b>${esc(d.code)}</b><span>${esc(d.label)}</span>
      <em class="${d.active ? 'ok' : 'mal'}">${d.active ? 'Activo' : 'Ya no está activo'}${d.active && d.endsOn ? ` · ${esc(textoHasta(d.endsOn))}` : ''}</em></div>
    <div class="st-emb-tiles">
      ${tile('Compras pagadas', String(st.paidOrders || 0), money.format(Number(st.sold || 0)))}
      ${tile('Esperando pago', money.format(Number(st.pendingSales || 0)), 'Cuentan cuando se paguen')}
      ${conPremio ? tile('Tu premio', money.format(Number(st.rewardEarned || 0)), `${Number(d.rewardPct)}% de lo pagado${d.rewardKind === 'credito' ? ', en crédito' : ''}`, 'clave') : ''}
      ${conPremio ? tile('Te debemos', money.format(Number(st.rewardOwed || 0)), `Ya te pagamos ${money.format(Number(st.rewardPaid || 0))}`) : ''}
    </div>
    <div class="st-emb-acciones">
      <a class="st-cta" href="https://wa.me/?text=${encodeURIComponent(texto)}" target="_blank" rel="noopener">Compartir mi código</a>
      <button type="button" class="st-emb-copia" data-copiar="${esc(compra)}">Copiar mi liga</button>
    </div>
    <h2 class="st-emb-tit">Últimas compras</h2>
    ${(d.recent || []).length ? `<ul class="st-emb-lista">${d.recent.map(x => `<li><span>${esc(new Date(`${x.date}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }))}</span>
      <b>${money.format(Number(x.total || 0))}</b><em class="${x.paid ? 'ok' : ''}">${x.paid ? 'Pagada' : 'Por pagar'}</em>${conPremio && x.paid ? `<small>+${money.format(Number(x.reward || 0))}</small>` : ''}</li>`).join('')}</ul>`
      : '<p class="muted">Todavía nadie compra con tu código. Compártelo.</p>'}
  </section>`;
  $('content').querySelector('[data-copiar]')?.addEventListener('click', async e => {
    const b = e.currentTarget;
    try { await navigator.clipboard.writeText(b.dataset.copiar); b.textContent = 'Copiada'; }
    catch { b.textContent = compra; }
  });
}

function renderListo(result, nombre) {
  const folio = result?.folio || '', total = Number(result?.total || 0);
  const pago = datosDePago(pagoInfo, folio);
  const wa = ligaWhatsApp(pagoInfo?.whatsapp, mensajeComprobante({ folio, total, nombre }));
  const filas = pago.filas.map(([k, v]) => `<div class="pago-fila"><span>${esc(k)}</span>`
    + `<strong${k === 'CLABE' ? ' class="pago-clabe"' : ''}>${esc(v)}</strong>`
    + `${k === 'CLABE' || k === 'Referencia' ? `<button type="button" class="pago-copiar" data-copiar="${esc(v)}">Copiar</button>` : ''}</div>`).join('');
  $('content').innerHTML = `<div class="success"><div class="success-mark">
      <span class="tos-icon tos-icon-check" aria-hidden="true"></span></div>
      <h2>Pedido recibido</h2>
      ${folio ? `<div class="folio">${esc(folio)}</div>` : ''}
      <p><strong>Total:</strong> ${money.format(total)}</p>
      ${Number(result?.discount || 0) > 0 ? `<p class="muted">Ya con ${money.format(Number(result.discount))} de descuento por tu código.</p>` : ''}</div>
    ${filas ? `<section class="pago-card" aria-label="Cómo pagar">
      <h3>Cómo pagar</h3>
      <p class="muted">Transferencia SPEI. Pon tu folio como referencia o concepto:</p>
      <div class="pago-filas">${filas}</div>
      ${pago.otros ? `<p class="muted pago-otros">${esc(pago.otros)}</p>` : ''}
    </section>` : ''}
    ${wa ? `<a class="primary pago-wa" href="${esc(wa)}" target="_blank" rel="noopener">Enviar comprobante por WhatsApp</a>
      <p class="muted pago-nota">Al pagar, adjunta la foto o captura del comprobante en el chat.</p>`
      : '<p class="muted pago-nota">Te contactamos por WhatsApp para confirmar tu pedido.</p>'}
    <section class="st-sigue" aria-label="Así sigue tu pedido">
      <h3>Así sigue tu pedido</h3>
      ${PASOS_TIENDA}
      <p class="st-sigue-plazo">Importante: tienes <b>${DIAS_PARA_RECOGER} días</b> para recoger tu pedido desde que te avisemos que llegó. Después de ese plazo el club ya no se hace responsable de la prenda.</p>
      <a class="st-sigue-portal" href="/familias/">Síguelo paso a paso en tu portal de familia</a>
    </section>`;
  $('content').querySelectorAll('[data-copiar]').forEach(btn => btn.addEventListener('click', async e => {
    const b = e.currentTarget;
    try { await navigator.clipboard.writeText(b.dataset.copiar); b.textContent = 'Copiado'; }
    catch { b.textContent = 'Mantén presionado para copiar'; }
  }));
  document.title = 'Pedido recibido · Tienda Tanner';
  window.scrollTo(0, 0);
}

/* ---------- Arranque ---------- */
// La tarjeta "Va en tu pedido": cerrar, o armar otro (el del hermano).
$('stAviso').addEventListener('click', e => {
  const cierra = () => { clearTimeout(avisoTimer); cierraAviso(); };
  if (e.target.closest('[data-ag-cierra]')) { cierra(); return; }
  if (e.target.closest('[data-otro]')) {
    cierra();
    const esKit = !!document.querySelector('[data-ficha]') && location.hash.startsWith('#/k/');
    (esKit ? document.querySelector('[data-ranura], #stBloqueTier') : $('stBloqueTalla'))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
});
$('stCarrito').addEventListener('click', () => abreMini(piezasDelCarrito(carrito) || !guardados.length ? 'pedido' : 'guardados'));
// El corazón vive dentro de la tarjeta (que es un enlace): guarda sin abrir la ficha.
document.addEventListener('click', e => {
  const f = e.target.closest('[data-fav]');
  if (!f || f.closest('#stMini')) return;
  e.preventDefault(); e.stopPropagation(); alternaFav(f.dataset.fav);
}, true);
cablea();
try {
  // El catálogo manda; cómo pagar es un extra que no detiene la tienda.
  const [oferta, pago, club] = await Promise.allSettled([
    rpc('v2_public_offerings', { club_key: CLUB_KEY }),
    rpc('v2_public_payment_info', { club_key: CLUB_KEY }),
    rpc('v2_public_context', { club_key: CLUB_KEY })
  ]);
  if (oferta.status !== 'fulfilled') throw oferta.reason;
  if (club.status === 'fulfilled') clubNombre = String(club.value?.brand || club.value?.organizationName || '').trim();
  if (club.status === 'fulfilled') instalaVocabulario(club.value?.playerNoun);
  // Los colores sólo visten la vista previa: si fallan, la tienda sigue.
  if (club.status === 'fulfilled' && club.value?.organizationId) {
    rpc('v2_public_branding_by_org', { organization_id: club.value.organizationId })
      .then(b => {
        coloresClub = b?.colors || {};
        const ficha = document.querySelector('[data-ficha]')?.dataset.ficha;
        repintaMockup(eligiendo[ficha] || eligiendoKit[ficha] || {});
      }).catch(() => {});
  }
  document.querySelectorAll('[data-club-nombre]').forEach(el => { el.textContent = clubNombre; });
  // Las ligas propias (Centro Tanner, privacidad, familias) se llevan el club.
  new MutationObserver(() => propagaClub()).observe(document.body, { childList: true, subtree: true });
  propagaClub();
  pagoInfo = pago.status === 'fulfilled' ? pago.value : null;
  catalogo = normalizaOfertaPublica(oferta.value);
  secciones = seccionesDeTienda(catalogo);
  // El carrito de la visita anterior, con lo que la tienda todavía vende.
  carrito = restauraCarrito(lee(LLAVE_CARRITO), catalogo);
  piezasAntes = piezasDelCarrito(carrito);
  actualizaCarrito();
  $('loading').classList.add('hidden');
  $('content').classList.remove('hidden');
  window.addEventListener('hashchange', ruta);
  ruta();
} catch (err) {
  $('loading').classList.add('hidden');
  $('content').classList.remove('hidden');
  $('content').innerHTML = `<div class="empty-state"><h2>No pudimos cargar la tienda</h2>
    <p class="muted">${esc(err?.message || 'Intenta nuevamente.')}</p></div>`;
}
