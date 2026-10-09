/* EL LINK QUE SE PEGA EN WHATSAPP.
 *
 * Quien abre esto no tiene cuenta, no tiene sesión y muchas veces ni conoce al
 * club: le llegó un link. Es la única de las cuatro tiendas que le habla a un
 * desconocido, y era la peor de las cuatro.
 *
 * COMO ESTABA
 *
 * Un formulario con un menú desplegable que decía "Selecciona". Nadie compra
 * de un desplegable: no hay foto, no se ve el precio hasta abrirlo, y los tres
 * kits —el producto que de verdad vende el club— quedaban escondidos dentro de
 * un <optgroup>.
 *
 * Peor: pedía el nombre, el teléfono y el correo ANTES de enseñar qué hay.
 * Ninguna tienda del mundo te pide los datos antes de enseñarte el producto.
 *
 * Y el texto hablaba del sistema, no del cliente: "Los kits bloqueados
 * incluyen prendas que ya no forman parte del catálogo actual". Un papá no
 * sabe qué es un catálogo actual. Además, desde la migración x1 ya no hay kits
 * bloqueados, así que la frase había quedado falsa.
 *
 * COMO QUEDA
 *
 * La misma vitrina del portal de familias —/v2/vitrina.js—: el kit primero y
 * en grande, las piezas después, el selector de talla plegado. Primero se
 * elige, y sólo entonces se piden los datos.
 *
 * UN PEDIDO A LA VEZ, Y ESO NO ES UN RECORTE
 *
 * v2_public_bundle_order recibe UN kit y v2_public_order_enhanced una lista de
 * productos: son dos llamadas distintas y cada una levanta su propio folio. Un
 * carrito mezclado tendría que partirse en dos pedidos con dos folios, y la
 * familia recibiría dos confirmaciones por una sola compra.
 *
 * Así que aquí no hay carrito: se elige una cosa, se confirma, y quien quiera
 * dos hace dos. Es lo que el club puede cumplir hoy sin tocar una función que
 * ya cobra dinero. Fingir un carrito que el backend no sabe entregar sería
 * peor que no tenerlo.
 *
 * SIN FOTOS, A PROPOSITO
 *
 * Las fotos de los productos viven en un bucket privado y firmarlas requiere
 * sesión. Quien entra por el link no la tiene. En vez de un recuadro gris,
 * cada pieza sale con su monograma, que es lo que ya hacía Taquilla.
 */
import { createClient } from '/v2/supabase-client.js';
import { AsYouType, getCountries, getCountryCallingCode, parsePhoneNumberFromString }
  from 'https://esm.sh/libphonenumber-js@1.11.20/max';
import { preparaLinea, preparaKit, ranurasDeKit, precioDeKit, tiersDeKit, acomodaVitrina }
  from '/v2/tienda.js';
import { esc, dinero as money, tarjetaProducto, tarjetaKit, normalizaOfertaPublica }
  from '/v2/vitrina.js';
import { datosDePago, mensajeComprobante, ligaWhatsApp } from '/v2/pedido-mensajes.js';

const supabase = createClient('https://pacnegivzgxpanphrnwp.supabase.co', 'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG');
const CLUB_KEY = '1850TC1850';
const PRIVACY_NOTICE_VERSION = '2026-08-19-v1';
const $ = id => document.getElementById(id);
const regions = new Intl.DisplayNames(['es-MX', 'es'], { type: 'region' });

let catalogo = { products: [], bundles: [] };
let phoneCountry = 'MX';
// Lo que el visitante lleva elegido en cada tarjeta, igual que en el portal.
const eligiendo = {};      // productId -> {talla, abierto, nombre, numero, motivo}
const eligiendoKit = {};   // kitId -> {tier, tallas:{}, abierto, nombre, numero, motivo}
let elegido = null;        // {kind:'product'|'bundle', linea, item}
// Cómo pagar (cuenta del club y su WhatsApp). Si no carga, el pedido se
// levanta igual: sólo falta la tarjeta de pago al final.
let pagoInfo = null;

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

/* ---------- La vitrina ---------- */
function renderTienda() {
  document.title = 'Tienda Tanner · Tannery City';
  $('pageTitle').textContent = 'Tienda Tanner';
  $('loading').classList.add('hidden');
  $('content').classList.remove('hidden');

  const kits = catalogo.bundles || [];
  const productos = acomodaVitrina(catalogo.products || []);
  if (!kits.length && !productos.length) {
    $('content').innerHTML = `<div class="empty-state"><h2>La tienda está vacía</h2>
      <p class="muted">Todavía no hay nada publicado. Escríbenos y te decimos qué sigue.</p></div>`;
    return;
  }

  /* Dos caminos (Presidencia, 09/10/2026): la familia con cuenta entra y ya
     trae sus datos y su Tanner; quien no tiene cuenta compra aquí mismo. */
  $('content').innerHTML = `<a class="ya-familia" href="/familias/?tab=tienda">
      <span><strong>¿Ya eres familia Tanner?</strong><small>Entra y tus datos y tu Tanner ya van cargados.</small></span>
      <b>Entrar</b></a>
    <div class="eyebrow">TIENDA TANNER · SIN CUENTA</div>
    <h2>El uniforme del club</h2>
    <p class="muted">Elige lo que quieres, con su talla. Al confirmar te contactamos por WhatsApp para el pago y la entrega.</p>
    ${kits.length ? `<div class="fam-kits">${kits.map(k => tarjetaKit(k, eligiendoKit[k.id] || {})).join('')}</div>` : ''}
    ${productos.length ? `<h3 class="vit-sub">Piezas sueltas</h3>
      <div class="fam-prods">${productos.map(p => tarjetaProducto(p, eligiendo[p.id] || {})).join('')}</div>` : ''}`;
  cableaVitrina();
}

/* Un solo manejador para toda la vitrina: las tarjetas se repintan enteras en
   cada toque, así que colgar un listener por botón sería colgarlos otra vez en
   cada repintado. */
function cableaVitrina() {
  const raiz = $('content');
  raiz.onclick = e => {
    const abre = e.target.closest('[data-abre]');
    if (abre) { abreTallas(abre.dataset.abre); return; }
    const talla = e.target.closest('[data-talla]');
    if (talla) { eligeTalla(talla.closest('[data-tallas]').dataset.tallas, talla.dataset.talla); return; }
    const quien = e.target.closest('[data-quien]');
    if (quien) { eligeTier(quien.closest('[data-tier]').dataset.tier, quien.dataset.quien); return; }
    const add = e.target.closest('[data-add]');
    if (add) { agregaProducto(add.dataset.add); return; }
    const addkit = e.target.closest('[data-addkit]');
    if (addkit) { agregaKit(addkit.dataset.addkit); return; }
  };
  // El nombre estampado no se pierde al repintar: se guarda mientras se teclea.
  raiz.oninput = e => {
    const t = e.target;
    if (t.dataset.pnombre) (eligiendo[t.dataset.pnombre] ||= {}).nombre = t.value;
    else if (t.dataset.pnumero) (eligiendo[t.dataset.pnumero] ||= {}).numero = t.value;
    else if (t.dataset.knombre) (eligiendoKit[t.dataset.knombre] ||= {}).nombre = t.value;
    else if (t.dataset.knumero) (eligiendoKit[t.dataset.knumero] ||= {}).numero = t.value;
  };
}

function abreTallas(id) {
  const [kitId, ranuraId] = id.split('::');
  if (ranuraId) {
    const e = (eligiendoKit[kitId] ||= {});
    e.abierto = e.abierto === ranuraId ? null : ranuraId;
  } else {
    const e = (eligiendo[id] ||= {});
    e.abierto = !e.abierto;
  }
  renderTienda();
}
function eligeTalla(id, talla) {
  const [kitId, ranuraId] = id.split('::');
  if (ranuraId) {
    const e = (eligiendoKit[kitId] ||= {});
    (e.tallas ||= {})[ranuraId] = talla;
    e.abierto = null; e.motivo = null;
  } else {
    const e = (eligiendo[id] ||= {});
    e.talla = talla; e.abierto = false; e.motivo = null;
  }
  renderTienda();
}
function eligeTier(kitId, tier) {
  const e = (eligiendoKit[kitId] ||= {});
  e.tier = tier; e.motivo = null;
  renderTienda();
}

function agregaProducto(id) {
  const p = (catalogo.products || []).find(x => x.id === id);
  if (!p) return;
  const e = (eligiendo[id] ||= {});
  const r = preparaLinea(p, { talla: e.talla, cantidad: 1, nombre: e.nombre, numero: e.numero });
  if (!r.ok) { e.motivo = r.motivo; renderTienda(); return; }
  elegido = { kind: 'product', item: p, linea: r.linea };
  renderCheckout();
}
function agregaKit(id) {
  const k = (catalogo.bundles || []).find(x => x.id === id);
  if (!k) return;
  const e = (eligiendoKit[id] ||= {});
  const tiers = tiersDeKit(k);
  const tier = tiers.includes(e.tier) ? e.tier : (tiers.length === 1 ? tiers[0] : null);
  if (!tier) { e.motivo = 'Elige si es para niño o para adulto.'; renderTienda(); return; }
  const r = preparaKit(k, { tier, tallas: e.tallas || {}, nombre: e.nombre, numero: e.numero });
  if (!r.ok) {
    e.motivo = r.motivo;
    if (r.falta) e.abierto = r.falta;
    renderTienda(); return;
  }
  elegido = { kind: 'bundle', item: k, linea: r.linea, tier };
  renderCheckout();
}

/* ---------- Confirmar ----------
 * Aquí sí se piden los datos, y sólo aquí: ya hay algo que comprar. */
function resumen() {
  if (elegido.kind === 'bundle') {
    const k = elegido.item, ranuras = ranurasDeKit(k);
    const tallas = (eligiendoKit[k.id] || {}).tallas || {};
    const piezas = ranuras.map(r => `<div class="fam-pieza"><span>${esc(r.nombre)}</span>`
      + `<em>Talla ${esc(r.unica || tallas[r.id] || '—')}</em></div>`).join('');
    return `<div class="fam-kit"><div class="fam-kit-head">
      <span class="fam-kit-tag">${esc(elegido.tier.toUpperCase())}</span>
      <strong>${esc(k.name)}</strong>
      <span class="fam-price">${money.format(precioDeKit(k, elegido.tier))}</span></div>
      <div class="fam-piezas">${piezas}</div>${detallePersonalizacion()}</div>`;
  }
  const l = elegido.linea;
  return `<div class="fam-kit"><div class="fam-kit-head"><strong>${esc(l.nombreProducto)}</strong>
    <span class="fam-price">${money.format(Number(l.total || 0))}</span></div>
    <div class="fam-piezas"><div class="fam-pieza"><span>Talla</span><em>${esc(l.talla || 'Universal')}</em></div></div>
    ${detallePersonalizacion()}</div>`;
}
function detallePersonalizacion() {
  const l = elegido.linea;
  const nombre = l.personalizationName, numero = l.numero;
  if (!nombre && !numero) return '';
  return `<div class="fam-pieza"><span>En la espalda</span>`
    + `<em>${esc([nombre, numero ? `#${numero}` : null].filter(Boolean).join(' · '))}</em></div>`;
}

function renderCheckout() {
  $('content').innerHTML = `<button type="button" id="volver" class="vit-volver">‹ Seguir viendo</button>
    <h2>Confirma tu pedido</h2>
    ${resumen()}
    <form id="orderForm" class="form-grid order-form">
      <label class="span-2">Nombre de quien recibe *<input id="customerName" minlength="2" maxlength="120" required></label>
      ${phoneMarkup()}
      <label class="span-2">Correo<input id="customerEmail" type="email" autocomplete="email" maxlength="254"></label>
      <label class="span-2">Comentarios<textarea id="orderNotes" rows="2" maxlength="500" placeholder="Algo que debamos considerar"></textarea></label>
      <div class="privacy-box span-2"><details><summary>Ver aviso de privacidad</summary>
        <p>Tannery City FC usa tus datos para administrar el pedido, pago y entrega. Puedes ejercer tus derechos escribiendo a <strong>tannery.city.1850@gmail.com</strong>.</p></details>
        <label class="check consent-line"><input id="orderDataConsent" type="checkbox" required>
        <span>Autorizo el tratamiento de mis datos para gestionar este pedido. <b>*</b></span></label>
        <div class="privacy-version">Aviso de privacidad ${PRIVACY_NOTICE_VERSION}</div></div>
      <div id="formMessage" class="message hidden span-2"></div>
      <button id="submitOrder" class="primary span-2" type="submit">Confirmar pedido</button>
    </form>`;
  wirePhone();
  $('volver').onclick = () => { elegido = null; renderTienda(); };
  $('orderForm').addEventListener('submit', submit);
}

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
  try {
    let result;
    if (elegido.kind === 'bundle') {
      /* v2_public_bundle_order espera las piezas con el id LEGACY y un número
         de ranura. preparaKit trabaja con el id del producto, que es lo que el
         resto de la tienda usa; aquí se traduce de vuelta, en la orilla. */
      const porProducto = {};
      const pieces = elegido.linea.piezas.map(pz => {
        const ranura = ranurasDeKit(elegido.item).find(r => r.productId === pz.productId);
        const slot = (porProducto[pz.productId] = (porProducto[pz.productId] || 0) + 1);
        return {
          legacyProductId: ranura?.producto?.legacy_product_id || pz.productId,
          slot,
          size: pz.talla
        };
      });
      result = await rpc('v2_public_bundle_order', {
        ...comun, bundle_id: elegido.item.id,
        tier: elegido.tier === 'Niño' ? 'kid' : 'adult',
        pieces,
        personalization_name: elegido.linea.personalizationName || null,
        number: elegido.linea.numero || null
      });
    } else {
      result = await rpc('v2_public_order_enhanced', {
        ...comun,
        items: [{
          product_id: elegido.item.id,
          quantity: elegido.linea.cantidad || 1,
          attributes: {
            talla: elegido.linea.talla || null,
            nombrePers: elegido.linea.personalizationName || null,
            numero: elegido.linea.numero || null
          }
        }]
      });
    }
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
  $('content').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

rpc('v2_public_payment_info', { club_key: CLUB_KEY }).then(v => { pagoInfo = v; }).catch(() => {});

try {
  catalogo = normalizaOfertaPublica(await rpc('v2_public_offerings', { club_key: CLUB_KEY }));
  renderTienda();
} catch (err) {
  $('loading').classList.add('hidden');
  $('content').classList.remove('hidden');
  $('content').innerHTML = `<div class="empty-state"><h2>No pudimos cargar la tienda</h2>
    <p class="muted">${esc(err.message || 'Intenta nuevamente.')}</p></div>`;
}
