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
 */
export const MEDICION = {
  // Pixel de Meta (Administrador de eventos → Orígenes de datos), sólo números.
  metaPixelId: '',
  // Etiqueta de Google: GA4 ("G-XXXXXXX") o Google Ads ("AW-XXXXXXX").
  googleTagId: '',
};

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
    case 'compra': return { meta: ['Purchase', { content_ids: ids, content_type: 'product', value: valor, currency: moneda }], google: ['purchase', { transaction_id: d.folio || undefined, currency: moneda, value: valor, items }] };
    case 'guardar': return { meta: ['AddToWishlist', { content_ids: ids, value: valor, currency: moneda }], google: ['add_to_wishlist', { currency: moneda, value: valor, items }] };
    default: return null;
  }
}

/* ---- En el navegador ---- */
let cargado = false;
const lee = () => { try { return localStorage.getItem(LLAVE); } catch { return null; } };
const guarda = v => { try { localStorage.setItem(LLAVE, v); } catch { /* sin memoria: se vuelve a preguntar */ } };

function carga(cfg) {
  if (cargado || typeof document === 'undefined') return;
  cargado = true;
  if (/^\d{6,20}$/.test(cfg.metaPixelId || '')) {
    const f = window.fbq = function () { f.callMethod ? f.callMethod.apply(f, arguments) : f.queue.push(arguments); };
    if (!window._fbq) window._fbq = f;
    f.push = f; f.loaded = true; f.version = '2.0'; f.queue = [];
    const s = document.createElement('script'); s.async = true; s.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(s);
    window.fbq('init', cfg.metaPixelId);
    window.fbq('track', 'PageView');
  }
  if (/^(G|AW)-[A-Z0-9]{4,20}$/.test(cfg.googleTagId || '')) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    const s = document.createElement('script'); s.async = true; s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(cfg.googleTagId)}`;
    document.head.appendChild(s);
    window.gtag('js', new Date());
    window.gtag('config', cfg.googleTagId);
  }
}

export function mide(evento, datos) {
  if (!cargado) return;
  const t = traduce(evento, datos); if (!t) return;
  try { if (window.fbq) window.fbq('track', ...t.meta); } catch { /* el pixel no detiene la venta */ }
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
  if (typeof document === 'undefined' || !hayIds(cfg) || document.getElementById('tcConsent')) return;
  const st = document.createElement('style'); st.textContent = ESTILO; document.head.appendChild(st);
  const barra = document.createElement('section');
  barra.id = 'tcConsent'; barra.className = 'tc-consent'; barra.setAttribute('role', 'dialog'); barra.setAttribute('aria-label', 'Cookies');
  barra.innerHTML = `<p>Usamos cookies de Meta y Google para medir nuestras campañas y mostrarte anuncios del club. Tu carrito funciona igual si dices que no. <a href="/aviso-de-privacidad/#cookies">Más información</a></p>
    <div><button type="button" class="no" data-c="no">Solo lo necesario</button><button type="button" class="si" data-c="si">Aceptar</button></div>`;
  barra.addEventListener('click', e => {
    const b = e.target.closest('[data-c]'); if (!b) return;
    guarda(b.dataset.c); barra.remove();
    if (b.dataset.c === 'si') carga(cfg);
  });
  document.body.appendChild(barra);
}

/* Se llama al abrir la página. Con "sí" guardado, carga; sin respuesta,
   pregunta; con "no", no hace nada. */
export function iniciaMedicion(cfg = MEDICION) {
  if (!hayIds(cfg)) return;
  const d = lee();
  if (d === 'si') carga(cfg);
  else if (d !== 'no') preguntaConsentimiento(cfg);
}
/* "Cookies" en el pie: se puede cambiar la respuesta. */
export function cambiaConsentimiento(cfg = MEDICION) {
  try { localStorage.removeItem(LLAVE); } catch { /* */ }
  preguntaConsentimiento(cfg);
}
