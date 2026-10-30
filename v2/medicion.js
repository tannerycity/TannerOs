/* MEDICIÓN DE CAMPAÑAS (27/10/2026): Pixel de Meta y etiqueta de Google, con
 * permiso.
 *
 * Presidencia: "sí quiero meterle los pixeles de Meta y Google... deja todo
 * listo y agrega la línea en el aviso de privacidad".
 *   - Nada se carga sin que la persona diga "Aceptar". Sin respuesta o con
 *     "Solo lo necesario", ni un script de Meta o Google entra a la página.
 *   - Mientras los ids estén vacíos (MEDICION abajo), no hay barra ni nada:
 *     la tienda se ve igual que hoy. Para encenderlo, Marketing pone los ids
 *     y se publica.
 *   - Los eventos (ver producto, agregar, iniciar pedido, compra) se mandan a
 *     los dos con los nombres que cada uno espera.
 * La parte sin DOM (qué evento se manda con qué datos) se prueba con node.
 *
 * 29/10/2026 (docs/medicion, integra y corrige el borrador #357):
 *   - IDs oficiales: Meta 1477125554314319 y GA4 de TannerOS G-KJN3NJS2YJ.
 *   - Sólo en app.tannerycity.com y en la tienda pública. No en previews ni
 *     localhost, ni en ligas con token (#/embajador/..), recibos (#/recibo/..)
 *     o parámetros que no sean de campaña.
 *   - GA4 nunca ve la URL real: page_location fijo de la tienda.
 *   - "compra" ya no es purchase: al levantar el pedido aún no está pagado.
 *     Va como store_order_placed. purchase sólo con pago confirmado, desde el
 *     servidor (pendiente, docs/medicion/ARQUITECTURA.md).
 *   - Retirar el permiso borra las cookies de Meta y Google y recarga.
 */
export const MEDICION = {
  // Pixel de Meta (Administrador de eventos → Orígenes de datos), sólo números.
  metaPixelId: '1477125554314319',
  // Etiqueta de Google: GA4 ("G-XXXXXXX") o Google Ads ("AW-XXXXXXX").
  googleTagId: 'G-KJN3NJS2YJ',
};

export const HOST_TIENDA = 'app.tannerycity.com';
// Parámetros que pueden venir en la liga sin datos personales: el club, el
// código de descuento y los de campaña. Cualquier otro apaga la medición.
const PARAMS_OK = /^(club|c|codigo|utm_(source|medium|campaign|content|term)|fbclid|gclid)$/;
export function paginaMedible({ hostname = '', pathname = '', search = '', hash = '' } = {}) {
  if (hostname !== HOST_TIENDA) return false;
  if (!(pathname === '/tienda' || pathname === '/tienda/' || pathname === '/pedido/' || /^\/tienda\/[a-z0-9-]+\/?$/.test(pathname))) return false;
  if (/^#\/(embajador|recibo|mis-pedidos)/.test(hash)) return false;
  for (const k of new URLSearchParams(search).keys()) if (!PARAMS_OK.test(k)) return false;
  return true;
}
export const aqui = () => {
  if (typeof location === 'undefined') return false;
  const hostname = (typeof window !== 'undefined' && window.__tosMedicionHost) || location.hostname;
  return paginaMedible({ hostname, pathname: location.pathname, search: location.search, hash: location.hash });
};
const PAGINA = `https://${HOST_TIENDA}/tienda/`;

const LLAVE = 'tannerConsentimiento';
export const hayIds = (cfg = MEDICION) => /^\d{6,20}$/.test(cfg.metaPixelId || '') || /^(G|AW)-[A-Z0-9]{4,20}$/.test(cfg.googleTagId || '');

/* Cómo se llama cada evento en cada lado. */
export function traduce(evento, d = {}) {
  const moneda = 'MXN', valor = Math.round(Number(d.valor || 0) * 100) / 100;
  const items = (d.items || []).map(i => ({ item_id: String(i.id), item_name: i.nombre, price: Number(i.precio || 0), quantity: Number(i.cantidad || 1) }));
  const ids = items.map(i => i.item_id);
  switch (evento) {
    case 'ver': return { meta: ['ViewContent', { content_ids: ids, content_type: 'product', value: valor, currency: moneda }], google: ['view_item', { currency: moneda, value: valor, items }] };
    case 'agregar': return { meta: ['AddToCart', { content_ids: ids, content_type: 'product', value: valor, currency: moneda }], google: ['add_to_cart', { currency: moneda, value: valor, items }] };
    case 'pagar': return { meta: ['InitiateCheckout', { content_ids: ids, num_items: items.reduce((s, i) => s + i.quantity, 0), value: valor, currency: moneda }], google: ['begin_checkout', { currency: moneda, value: valor, items }] };
    // Pedido levantado (por pagar): no es una compra confirmada.
    case 'compra': return { meta: ['OrderPlaced', { content_ids: ids, content_type: 'product', value: valor, currency: moneda }, true], google: ['store_order_placed', { currency: moneda, value: valor, items }] };
    case 'guardar': return { meta: ['AddToWishlist', { content_ids: ids, value: valor, currency: moneda }], google: ['add_to_wishlist', { currency: moneda, value: valor, items }] };
    default: return null;
  }
}

/* ---- En el navegador ---- */
let cargado = false;
const lee = () => { try { return localStorage.getItem(LLAVE); } catch { return null; } };
const guarda = v => { try { localStorage.setItem(LLAVE, v); } catch { /* sin memoria: se vuelve a preguntar */ } };

function carga(cfg) {
  if (cargado || typeof document === 'undefined' || !aqui()) return;
  // Si otra etiqueta de Meta o Google ya está en la página, no se duplica.
  if (window.fbq || window.gtag || document.querySelector('script[src*="googletagmanager.com/"],script[src*="fbevents.js"]')) return;
  cargado = true;
  if (/^\d{6,20}$/.test(cfg.metaPixelId || '')) {
    const f = window.fbq = function () { f.callMethod ? f.callMethod.apply(f, arguments) : f.queue.push(arguments); };
    if (!window._fbq) window._fbq = f;
    f.push = f; f.loaded = true; f.version = '2.0'; f.queue = [];
    const s = document.createElement('script'); s.async = true; s.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(s);
    window.fbq('set', 'autoConfig', false, cfg.metaPixelId);
    window.fbq('init', cfg.metaPixelId);
    window.fbq('track', 'PageView');
  }
  if (/^(G|AW)-[A-Z0-9]{4,20}$/.test(cfg.googleTagId || '')) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    const s = document.createElement('script'); s.async = true; s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(cfg.googleTagId)}`;
    document.head.appendChild(s);
    window.gtag('js', new Date());
    window.gtag('config', cfg.googleTagId, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false,
      cookie_domain: HOST_TIENDA, page_location: PAGINA, page_referrer: '', page_title: 'Tienda' });
    window.gtag('event', 'page_view', { page_location: PAGINA, page_referrer: '', page_title: 'Tienda' });
  }
}

export function mide(evento, datos) {
  if (!cargado) return;
  const t = traduce(evento, datos); if (!t) return;
  try { if (window.fbq) window.fbq(t.meta[2] ? 'trackCustom' : 'track', t.meta[0], t.meta[1]); } catch { /* el pixel no detiene la venta */ }
  try { if (window.gtag) window.gtag('event', ...t.google); } catch { /* idem */ }
}

/* La barra: abajo, chica, sin tapar la tienda. Dos botones del mismo tamaño
   ("Aceptar" y "Solo lo necesario"): decir que no es igual de fácil. */
const ESTILO = `.tc-consent{position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:80;max-width:560px;margin:0 auto;padding:14px 16px;border-radius:18px;background:#fff;color:#0b1418;border:1px solid #e6eae9;box-shadow:0 18px 50px rgba(7,25,30,.22);font:14px/1.45 Inter,system-ui,sans-serif}
.tc-consent p{margin:0 0 10px}.tc-consent a{color:#0b3d4a;font-weight:700}
.tc-consent div{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.tc-consent button{min-height:44px;border-radius:12px;font:inherit;font-weight:700;cursor:pointer;border:1.5px solid #0b3d4a}
.tc-consent .si{background:#0b3d4a;color:#fff}.tc-consent .no{background:#fff;color:#0b3d4a}`;
export function preguntaConsentimiento(cfg = MEDICION) {
  if (typeof document === 'undefined' || !aqui() || !hayIds(cfg) || document.getElementById('tcConsent')) return;
  const st = document.createElement('style'); st.textContent = ESTILO; document.head.appendChild(st);
  const barra = document.createElement('section');
  barra.id = 'tcConsent'; barra.className = 'tc-consent'; barra.setAttribute('role', 'dialog'); barra.setAttribute('aria-label', 'Cookies');
  barra.innerHTML = `<p>Usamos cookies de Meta y Google para medir nuestras campañas y mostrarte anuncios del club. Tu carrito funciona igual si dices que no. <a href="/aviso-de-privacidad/#cookies">Más información</a></p>
    <div><button type="button" class="no" data-c="no">Solo lo necesario</button><button type="button" class="si" data-c="si">Aceptar</button></div>`;
  barra.addEventListener('click', e => {
    const b = e.target.closest('[data-c]'); if (!b) return;
    const antes = lee(), nueva = b.dataset.c;
    guarda(nueva); barra.remove();
    if (nueva === 'si') carga(cfg);
    if (nueva === 'no') { borraCookies(); if (antes === 'si' && cargado) location.reload(); }
  });
  document.body.appendChild(barra);
}

/* Se llama al abrir la página. Con "sí" guardado, carga; sin respuesta,
   pregunta; con "no", no hace nada. */
export function iniciaMedicion(cfg = MEDICION) {
  if (!hayIds(cfg) || !aqui()) return;
  const d = lee();
  if (d === 'si') carga(cfg);
  else if (d !== 'no') preguntaConsentimiento(cfg);
}
/* "Cookies" en el pie: se puede cambiar la respuesta. */
export function cambiaConsentimiento(cfg = MEDICION) {
  // La respuesta anterior se queda hasta elegir otra: así se sabe si se retiró.
  preguntaConsentimiento(cfg);
}
/* Al retirar el permiso: fuera las cookies de Meta y Google de este dominio. */
export function borraCookies() {
  if (typeof document === 'undefined') return;
  for (const c of document.cookie.split(';')) {
    const k = c.split('=')[0].trim();
    if (/^_ga($|_)|^_gid$|^_gat|^_fbp$|^_fbc$/.test(k)) for (const d of ['', `; domain=${HOST_TIENDA}`, '; domain=.tannerycity.com'])
      document.cookie = `${k}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${d}`;
  }
}
