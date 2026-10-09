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
import { AsYouType, getCountries, getCountryCallingCode, parsePhoneNumberFromString }
  from 'https://esm.sh/libphonenumber-js@1.11.20/max';
import { preparaLinea, preparaKit, tiersDeKit, ranurasDeKit, precioDeKit, aceptaPersonalizacion,
         tallasDe, tallaUnica, agregaAlCarrito, quitaDelCarrito, totalDelCarrito, piezasDelCarrito }
  from '/v2/tienda.js';
import { esc, dinero as money, normalizaOfertaPublica, lineaDelCarrito } from '/v2/vitrina.js';
import { getSignedPhotoUrls } from '/v2/photo-cache.js';
import { datosDePago, mensajeComprobante, ligaWhatsApp } from '/v2/pedido-mensajes.js';
import { seccionesDeTienda, fotosPorFirmar, fotosDeKit, precioDeTarjeta, gruposDeTallas, etiquetaDe, categoriaDe }
  from '/pedido/catalogo.js';

const supabase = createClient('https://pacnegivzgxpanphrnwp.supabase.co', 'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG');
const CLUB_KEY = '1850TC1850';
const PRIVACY_NOTICE_VERSION = '2026-08-19-v1';
const $ = id => document.getElementById(id);
const regions = new Intl.DisplayNames(['es-MX', 'es'], { type: 'region' });

let catalogo = { products: [], bundles: [] };
let secciones = [];
let phoneCountry = 'MX';
// Lo que se lleva elegido en cada ficha: si se va y regresa, sigue ahí.
const eligiendo = {};      // productId -> {talla, cantidad, nombre, numero, motivo}
const eligiendoKit = {};   // kitId -> {tier, tallas:{}, nombre, numero, motivo, falta}
let carrito = {};
// Cómo pagar, el WhatsApp del club y el tiempo de entrega. Si no carga, la
// tienda funciona igual: sólo faltan esos textos.
let pagoInfo = null;
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
function actualizaCarrito() {
  const n = piezasDelCarrito(carrito), badge = $('stCarritoN');
  badge.hidden = !n; badge.textContent = String(n);
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
  bar.querySelector('#verCarrito').addEventListener('click', () => { location.hash = '#/pedido'; });
}
let avisoTimer = 0;
function aviso(texto, conAccion = false) {
  const el = $('stAviso');
  el.innerHTML = `<span>${esc(texto)}</span>${conAccion ? '<a href="#/pedido">Ver pedido</a>' : ''}`;
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
    <li><b>Pago</b><span>Por ${esc(pago)}. Te damos los datos al confirmar.</span></li>
    <li><b>Confirmación</b><span>Te escribimos por WhatsApp para revisar tallas y entrega.</span></li></ul>`;
}
function bloquePersonaliza(e) {
  return `<section class="st-bloque"><div class="st-bloque-cab"><h2>Personalízalo</h2><span>Opcional</span></div>
    <div class="st-perso">
      <label><span>Nombre en la espalda</span><input data-campo="nombre" maxlength="20" autocomplete="off" autocapitalize="characters" value="${esc(e.nombre || '')}" placeholder="LEO"></label>
      <label class="num"><span>Número</span><input data-campo="numero" inputmode="numeric" maxlength="3" autocomplete="off" value="${esc(e.numero || '')}" placeholder="10"></label>
    </div>
    <p class="st-nota">Lo estampado es personal: no tiene cambio.</p></section>`;
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

/* ---------- La tienda (PLP) ---------- */
function tarjeta({ tipo, item }) {
  if (tipo === 'kit') {
    const pr = precioDeTarjeta(item), n = ranurasDeKit(item).length;
    return `<a class="st-card kit" href="#/k/${esc(item.id)}" data-kit="${esc(item.id)}">${medioKit(item)}
      <div class="st-card-txt"><span class="st-tag">Uniforme completo</span><strong>${esc(item.name)}</strong>
      <span class="st-precio">${pr.desde ? '<small>Desde</small> ' : ''}${money.format(pr.monto)}</span>
      <span class="st-sub">${n} ${n === 1 ? 'pieza' : 'piezas'}</span></div></a>`;
  }
  return `<a class="st-card" href="#/p/${esc(item.id)}" data-prod="${esc(item.id)}">${medioProducto(item)}
    <div class="st-card-txt">${aceptaPersonalizacion(item) ? '<span class="st-tag">Personalizable</span>' : ''}
    <strong>${esc(item.name)}</strong><span class="st-precio">${money.format(Number(item.price || 0))}</span></div></a>`;
}
function renderTienda(clave = '') {
  const activa = secciones.some(s => s.clave === clave) ? clave : '';
  const visibles = activa ? secciones.filter(s => s.clave === activa) : secciones;
  document.title = activa ? `${etiquetaDe(activa)} · Tienda Tanner` : 'Tienda Tanner · Tannery City';
  if (!secciones.length) {
    $('content').innerHTML = `<div class="empty-state"><h2>La tienda está vacía</h2>
      <p class="muted">Todavía no hay nada publicado. Escríbenos y te decimos qué sigue.</p></div>`;
    return;
  }
  /* Dos caminos (09/10/2026): la familia con cuenta entra y ya trae sus datos
     y su Tanner; quien no tiene cuenta compra aquí mismo. */
  $('content').innerHTML = `
    <section class="st-hero">
      <p class="st-eyebrow">Tannery City F.C.</p>
      <h1>${activa ? esc(etiquetaDe(activa)) : 'Tienda'}</h1>
      <p>${activa ? '' : 'El uniforme oficial del club. '}Pídelo desde tu celular${pagoInfo?.delivery ? ` y recíbelo en ${esc(pagoInfo.delivery)}` : ''}.</p>
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
  document.title = `${p.name} · Tienda Tanner`;
  $('content').innerHTML = `
    <a class="st-volver" href="#/c/${esc(cat)}">‹ ${esc(etiquetaDe(cat))}</a>
    <article class="st-pdp" data-ficha="${esc(p.id)}">
      ${medioProducto(p, true)}
      <div class="st-pdp-info">
        <p class="st-eyebrow">${esc(etiquetaDe(cat))}</p>
        <h1>${esc(p.name)}</h1>
        <p class="st-pdp-precio">${money.format(Number(p.price || 0))}</p>
        ${p.description ? `<p class="st-desc">${esc(p.description)}</p>` : ''}
        <section class="st-bloque${e.falta === 'talla' ? ' falta' : ''}" id="stBloqueTalla">
          <div class="st-bloque-cab"><h2>Talla</h2><span>${esc(e.talla || unica || '')}</span></div>
          ${unica ? `<p class="st-unica">Talla ${esc(unica)}: le queda a todos.</p>` : botonesTalla(tallas, e.talla, 'data-talla')}
        </section>
        ${aceptaPersonalizacion(p) ? bloquePersonaliza(e) : ''}
        <section class="st-bloque"><div class="st-bloque-cab"><h2>Cantidad</h2></div>
          <div class="st-cantidad"><button type="button" data-cantidad="-1" aria-label="Uno menos">&minus;</button>
          <output>${e.cantidad}</output><button type="button" data-cantidad="1" aria-label="Uno más">+</button></div></section>
        ${infoDeCompra()}
      </div>
    </article>
    ${barraAgregar(`Agregar al pedido · ${money.format(Number(p.price || 0) * e.cantidad)}`, e.motivo)}`;
  pintaBarra(false);
  firmaFotos($('content'));
}

/* ---------- La ficha de un kit ---------- */
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
        <p class="st-eyebrow">Uniforme completo · ${ranuras.length} piezas</p>
        <h1>${esc(k.name)}</h1>
        <p class="st-pdp-precio">${e.tier ? money.format(precioDeKit(k, e.tier)) : `${pr.desde ? '<small>Desde</small> ' : ''}${money.format(pr.monto)}`}</p>
        ${k.description ? `<p class="st-desc">${esc(k.description)}</p>` : ''}
        ${tiers.length > 1 ? `<section class="st-bloque${e.falta === 'tier' ? ' falta' : ''}" id="stBloqueTier"><div class="st-bloque-cab"><h2>¿Para quién es?</h2></div>
          <div class="st-segmento" role="radiogroup" aria-label="Para quién es">${tiers.map(t => `<button type="button" role="radio" aria-checked="${e.tier === t}" data-tier="${esc(t)}"${e.tier === t ? ' class="activa"' : ''}>
            <strong>${esc(t)}</strong><small>${money.format(precioDeKit(k, t))}</small></button>`).join('')}</div></section>` : ''}
        <section class="st-bloque"><div class="st-bloque-cab"><h2>Incluye</h2><span>Elige la talla de cada pieza</span></div>
          <ul class="st-incluye">${ranuras.map(r => {
            const elegida = r.unica || e.tallas[r.id] || '';
            return `<li class="st-pieza${e.falta === r.id ? ' falta' : ''}" data-ranura="${esc(r.id)}">
              <div class="st-pieza-cab">${medio(r.producto?.photoThumbPath, r.producto?.photoBucket, r.nombre, 'mini')}
                <strong>${esc(r.nombre)}</strong><span class="${elegida ? 'ok' : ''}">${elegida ? `Talla ${esc(elegida)}` : 'Elige talla'}</span></div>
              ${r.unica || !r.tallas.length ? '' : `<div class="st-tallas fila">${tallasDePieza(r.tallas, e.tier).map(t =>
                `<button type="button" class="st-talla${elegida === t ? ' activa' : ''}" data-pieza-talla="${esc(t)}" aria-pressed="${elegida === t}">${esc(t)}</button>`).join('')}</div>`}
            </li>`; }).join('')}</ul></section>
        ${bloquePersonaliza(e)}
        ${infoDeCompra()}
      </div>
    </article>
    ${barraAgregar(`Agregar al pedido${e.tier ? ` · ${money.format(precioDeKit(k, e.tier))}` : ''}`, e.motivo)}`;
  pintaBarra(false);
  firmaFotos($('content'));
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
    const talla = t.closest('[data-talla]');
    if (talla && ficha) { const e = eligiendo[ficha]; e.talla = talla.dataset.talla; e.motivo = null; e.falta = null; repinta(renderProducto, ficha); return; }
    const cant = t.closest('[data-cantidad]');
    if (cant && ficha) { const e = eligiendo[ficha]; e.cantidad = Math.max(1, Math.min(20, (e.cantidad || 1) + Number(cant.dataset.cantidad))); repinta(renderProducto, ficha); return; }
    const tier = t.closest('[data-tier]');
    if (tier && ficha) { const e = eligiendoKit[ficha]; e.tier = tier.dataset.tier; e.motivo = null; e.falta = null; repinta(renderKit, ficha); return; }
    const pieza = t.closest('[data-pieza-talla]');
    if (pieza && ficha) {
      const e = eligiendoKit[ficha], r = pieza.closest('[data-ranura]').dataset.ranura;
      e.tallas = { ...e.tallas, [r]: pieza.dataset.piezaTalla };
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
  });
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
  const r = preparaLinea(p, { talla: e.talla, cantidad: e.cantidad || 1, nombre: e.nombre, numero: e.numero });
  if (!r.ok) { falla(e, r, renderProducto, id); return; }
  carrito = agregaAlCarrito(carrito, r.linea);
  eligiendo[id] = { cantidad: 1 };
  actualizaCarrito();
  repinta(renderProducto, id);
  aviso(`Agregado${r.linea.talla ? ` · talla ${r.linea.talla}` : ''}${r.linea.cantidad > 1 ? ` · ${r.linea.cantidad} piezas` : ''}`, true);
}
function agregaKit(id) {
  const k = (catalogo.bundles || []).find(x => String(x.id) === String(id));
  if (!k) return;
  const e = eligiendoKit[id];
  const r = preparaKit(k, { tier: e.tier, tallas: e.tallas || {}, nombre: e.nombre, numero: e.numero });
  if (!r.ok) { falla(e, r, renderKit, id); return; }
  carrito = agregaAlCarrito(carrito, r.linea);
  eligiendoKit[id] = { tallas: {}, tier: e.tier };
  actualizaCarrito();
  repinta(renderKit, id);
  aviso(`Agregado · ${k.name}, ${r.linea.tier.toLocaleLowerCase('es-MX')}`, true);
}

/* ---------- Confirmar ----------
 * Aquí sí se piden los datos, y sólo aquí: ya hay algo que comprar. */
function resumen() {
  const lineas = Object.entries(carrito);
  return `<section class="carrito-lista">${lineas.map(([k, l]) => lineaDelCarrito(k, l)).join('')}
    <div class="carrito-total"><span>Total</span><strong>${money.format(totalDelCarrito(carrito))}</strong></div></section>`;
}

function renderCheckout() {
  if (!piezasDelCarrito(carrito)) { location.replace('#/'); return; }
  pintaBarra(false);
  document.title = 'Tu pedido · Tienda Tanner';
  $('content').innerHTML = `<a class="st-volver" href="#/" id="volver">‹ Seguir comprando</a>
    <h1 class="st-titulo">Tu pedido</h1>
    <div id="resumenCarrito">${resumen()}</div>
    ${pagoInfo?.delivery ? `<p class="st-nota">Entrega en ${esc(pagoInfo.delivery)}. Al confirmar te damos los datos para pagar.</p>` : ''}
    <form id="orderForm" class="form-grid order-form st-form">
      <h2 class="span-2">Tus datos</h2>
      <label class="span-2">Nombre de quien recibe *<input id="customerName" minlength="2" maxlength="120" required autocomplete="name"></label>
      ${phoneMarkup()}
      <label class="span-2">Correo<input id="customerEmail" type="email" autocomplete="email" maxlength="254"></label>
      <label class="span-2">Comentarios<textarea id="orderNotes" rows="2" maxlength="500" placeholder="Algo que debamos considerar"></textarea></label>
      <div class="privacy-box span-2"><details><summary>Ver aviso de privacidad</summary>
        <p>Tannery City FC usa tus datos para administrar el pedido, pago y entrega. Puedes ejercer tus derechos escribiendo a <strong>tannery.city.1850@gmail.com</strong>.</p></details>
        <label class="check consent-line"><input id="orderDataConsent" type="checkbox" required>
        <span>Autorizo el tratamiento de mis datos para gestionar este pedido. <b>*</b></span></label>
        <div class="privacy-version">Aviso de privacidad ${PRIVACY_NOTICE_VERSION}</div></div>
      <div id="formMessage" class="message hidden span-2"></div>
      <button id="submitOrder" class="primary span-2 st-cta" type="submit">Confirmar pedido</button>
    </form>`;
  wirePhone();
  // Quitar un renglón no borra lo que ya se escribió en el formulario.
  $('resumenCarrito').onclick = e => {
    const q = e.target.closest('[data-quita]'); if (!q) return;
    carrito = quitaDelCarrito(carrito, q.dataset.quita);
    actualizaCarrito();
    if (!piezasDelCarrito(carrito)) { location.hash = '#/'; return; }
    $('resumenCarrito').innerHTML = resumen();
  };
  $('orderForm').addEventListener('submit', submit);
}

/* ---------- Rutas ---------- */
let rutaPrevia = '';
function ruta() {
  const h = location.hash.replace(/^#\/?/, '');
  const [a, b] = h.split('/');
  const cambia = h !== rutaPrevia; rutaPrevia = h;
  if (a === 'p' && b) renderProducto(decodeURIComponent(b));
  else if (a === 'k' && b) renderKit(decodeURIComponent(b));
  else if (a === 'pedido') renderCheckout();
  else renderTienda(a === 'c' ? decodeURIComponent(b || '') : '');
  if (cambia) { window.scrollTo(0, 0); cierraAviso(); }
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
  if (!$('orderDataConsent').checked) return setMessage('Necesitamos tu autorización de datos para gestionar el pedido.');
  const btn = $('submitOrder');
  let phone;
  try { phone = validatePhone(true); } catch (err) { return setMessage(err.message); }
  btn.disabled = true; btn.textContent = 'Guardando…';
  const consent = { dataAccepted: true, privacyNoticeVersion: PRIVACY_NOTICE_VERSION, acceptedAt: acceptedAt(), source: 'public-web' };
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
        personalizationName: l.personalizationName || null, number: l.numero || null,
        pieces: (l.piezas || []).map(pz => ({ productId: pz.productId, talla: pz.talla || null })) }
    : { kind: 'product', productId: l.productId, quantity: l.cantidad || 1, talla: l.talla || null,
        personalizationName: l.personalizationName || null, number: l.numero || null });
  try {
    const result = await rpc('v2_public_cart_order', { ...comun, items });
    carrito = {};
    actualizaCarrito();
    renderListo(result, comun.customer_name);
  } catch (err) {
    setMessage(err.message || 'No se pudo enviar el pedido.');
    btn.disabled = false; btn.textContent = 'Confirmar pedido';
  }
}

/* ---------- Pedido recibido ----------
 * Antes terminaba en "te contactamos por WhatsApp para el pago": la familia
 * se quedaba esperando sin saber a qué cuenta pagar. Ahora sale cómo pagar,
 * con el folio como referencia, y un botón que le manda el comprobante al
 * club por WhatsApp. */
function renderListo(result, nombre) {
  const folio = result?.folio || '', total = Number(result?.total || 0);
  const pago = datosDePago(pagoInfo, folio);
  const wa = ligaWhatsApp(pagoInfo?.whatsapp, mensajeComprobante({ folio, total, nombre }));
  const filas = pago.filas.map(([k, v]) => `<div class="pago-fila"><span>${esc(k)}</span>`
    + `<strong${k === 'CLABE' ? ' class="pago-clabe"' : ''}>${esc(v)}</strong>`
    + `${k === 'CLABE' ? `<button type="button" class="pago-copiar" data-copiar="${esc(v)}">Copiar</button>` : ''}</div>`).join('');
  $('content').innerHTML = `<div class="success"><div class="success-mark">
      <span class="tos-icon tos-icon-check" aria-hidden="true"></span></div>
      <h2>Pedido recibido</h2>
      ${folio ? `<div class="folio">${esc(folio)}</div>` : ''}
      <p><strong>Total:</strong> ${money.format(total)}</p></div>
    ${filas ? `<section class="pago-card" aria-label="Cómo pagar">
      <h3>Cómo pagar</h3>
      <p class="muted">Transferencia con tu folio como referencia:</p>
      <div class="pago-filas">${filas}</div>
      ${pago.otros ? `<p class="muted pago-otros">${esc(pago.otros)}</p>` : ''}
    </section>` : ''}
    ${wa ? `<a class="primary pago-wa" href="${esc(wa)}" target="_blank" rel="noopener">Enviar comprobante por WhatsApp</a>
      <p class="muted pago-nota">Al pagar, adjunta la foto o captura del comprobante en el chat.</p>`
      : '<p class="muted pago-nota">Te contactamos por WhatsApp para confirmar tu pedido.</p>'}`;
  $('content').querySelector('[data-copiar]')?.addEventListener('click', async e => {
    const b = e.currentTarget;
    try { await navigator.clipboard.writeText(b.dataset.copiar); b.textContent = 'Copiada'; }
    catch { b.textContent = 'Mantén presionado para copiar'; }
  });
  document.title = 'Pedido recibido · Tienda Tanner';
  window.scrollTo(0, 0);
}

/* ---------- Arranque ---------- */
$('stCarrito').addEventListener('click', () => {
  if (piezasDelCarrito(carrito)) location.hash = '#/pedido';
  else aviso('Tu pedido está vacío: agrega algo de la tienda.');
});
cablea();
try {
  // El catálogo manda; cómo pagar es un extra que no detiene la tienda.
  const [oferta, pago] = await Promise.allSettled([
    rpc('v2_public_offerings', { club_key: CLUB_KEY }),
    rpc('v2_public_payment_info', { club_key: CLUB_KEY })
  ]);
  if (oferta.status !== 'fulfilled') throw oferta.reason;
  pagoInfo = pago.status === 'fulfilled' ? pago.value : null;
  catalogo = normalizaOfertaPublica(oferta.value);
  secciones = seccionesDeTienda(catalogo);
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
