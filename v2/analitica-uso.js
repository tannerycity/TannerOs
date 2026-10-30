/* ANALÍTICA DE USO DE TANNEROS (29/10/2026).
 *
 * Presidencia: "comprender el uso de la plataforma: usuarios activos, módulos
 * más y menos usados, frecuencia, tendencias, errores y rendimiento". Integra
 * y corrige los borradores #357/#358 (docs/medicion/).
 *
 * Dos capas:
 *   1. GA4 de TannerOS (G-KJN3NJS2YJ), SÓLO con "Aceptar" de la persona de
 *      staff. Nunca para el rol Tanner ni para familias. Sin Meta aquí: en las
 *      áreas privadas hay datos de menores.
 *   2. Conteo propio y agregado (v2_usage_ping, h55): módulo abierto por día,
 *      sin datos de la pantalla. Lo ve sólo Presidencia, en números.
 *
 * Qué viaja a Google, y nada más:
 *   - El módulo, de un catálogo cerrado (MODULOS): jamás la URL real, su ?query
 *     ni su #hash (pueden traer ids de jugadores, folios o tokens).
 *   - La función usada, de otro catálogo cerrado (FUNCIONES).
 *   - Errores y tiempos de carga como números o tipos fijos, sin mensajes.
 * Nunca: nombres, correos, teléfonos, ids de usuario, club, jugador, rol, salud,
 * firmas, expedientes ni montos.
 */
export const ID_USO = 'G-KJN3NJS2YJ';
export const HOST_OFICIAL = 'app.tannerycity.com';
const CLAVE = 'tos_uso_analitica_v1';

// Los módulos del menú (navItems de v2/shell.js). Nada fuera de esta lista sale.
export const MODULOS = Object.freeze(['inicio', 'mensajes', 'club', 'direccion', 'taquilla', 'contabilidad', 'finanzas', 'jugadores',
  'asistencia', 'becas', 'partidos', 'calendario', 'centro_tanner', 'academias', 'formacion', 'prospectos', 'candidatos', 'staff',
  'cumpleanos', 'encuestas', 'scouting', 'visorias', 'cursosVerano', 'tienda', 'catalogo', 'utileria', 'estacionamiento',
  'patrocinadores', 'ideas', 'usuarios', 'invitaciones', 'admin', 'cambios', 'qa', 'convocatoria']);
// Lo que se cuenta como "función usada". Sólo nombres fijos, sin datos.
export const FUNCIONES = Object.freeze(['cobro_registrado', 'asistencia_guardada', 'evaluacion_guardada', 'pedido_enviado_proveedor',
  'pedido_entregado', 'llegada_visoria', 'identidad_verificada', 'aviso_publicado', 'mensaje_enviado', 'busqueda', 'exportar']);
// Staff que se mide. Fuera: Tanner (cuenta del jugador) y cualquier familia.
const ROLES_STAFF = new Set(['Presidencia', 'Operaciones', 'Formadores', 'Academia', 'Contabilidad', 'Taquilla', 'Marketing', 'Scouting']);

export const rolMedible = (role, isOwner = false) => isOwner || ROLES_STAFF.has(role);
export const moduloValido = m => MODULOS.includes(m) ? m : null;
export const funcionValida = f => FUNCIONES.includes(f) ? f : null;
export const hostMedible = h => h === HOST_OFICIAL;
/* Lo que GA4 ve como "página": una ruta sintética por módulo. */
export const paginaDe = modulo => `https://${HOST_OFICIAL}/m/${modulo}`;
/* Tiempo de carga en pasos de 100 ms (no hace falta más precisión). */
export const redondeaMs = ms => Math.max(0, Math.min(60000, Math.round(Number(ms || 0) / 100) * 100));

/* Lo único que se manda a GA4: cada evento con sus parámetros permitidos. */
export const PARAMETROS = Object.freeze({
  page_view: ['page_location', 'page_title', 'page_referrer'],
  tanner_module_opened: ['module_name'],
  tanner_navigation: ['from_module', 'to_module'],
  tanner_feature_used: ['module_name', 'feature'],
  tanner_screen_load: ['module_name', 'load_ms'],
  tanner_error: ['module_name', 'error_type']
});
export function limpiaEvento(nombre, params = {}) {
  const permitidos = PARAMETROS[nombre]; if (!permitidos) return null;
  const out = {};
  for (const k of permitidos) if (params[k] !== undefined && params[k] !== null && params[k] !== '') out[k] = params[k];
  for (const k of ['module_name', 'from_module', 'to_module']) if (k in out && !moduloValido(out[k])) return null;
  if ('feature' in out && !funcionValida(out.feature)) return null;
  if ('error_type' in out && !['js', 'promesa', 'red'].includes(out.error_type)) return null;
  if ('load_ms' in out) out.load_ms = redondeaMs(out.load_ms);
  if ('page_location' in out && !out.page_location.startsWith(`https://${HOST_OFICIAL}/m/`)) return null;
  return out;
}

/* ---- En el navegador ---- */
let cargado = false, modulo = null, rpcPing = null, pidioPermiso = false;
const lee = () => { try { return localStorage.getItem(CLAVE); } catch { return null; } };
const guarda = v => { try { localStorage.setItem(CLAVE, v); } catch { /* se vuelve a preguntar */ } };
const host = () => (typeof window !== 'undefined' && window.__tosMedicionHost) || (typeof location !== 'undefined' ? location.hostname : '');

function manda(nombre, params) {
  if (!cargado || typeof window.gtag !== 'function') return;
  const p = limpiaEvento(nombre, params); if (!p) return;
  try { window.gtag('event', nombre, p); } catch { /* la medición no detiene a nadie */ }
}

/* Al retirar el permiso: fuera las cookies de Google de este dominio. */
export function borraCookiesGoogle() {
  if (typeof document === 'undefined') return;
  for (const c of document.cookie.split(';')) {
    const k = c.split('=')[0].trim();
    if (/^_ga($|_)|^_gid$|^_gat/.test(k)) for (const d of ['', `; domain=${HOST_OFICIAL}`, '; domain=.tannerycity.com'])
      document.cookie = `${k}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${d}`;
  }
}

function carga() {
  if (cargado || lee() !== 'si' || !modulo) return;
  // Si otra etiqueta de Google ya está en la página, no se duplica.
  if (window.gtag || document.querySelector('script[src*="googletagmanager.com/"]')) return;
  cargado = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', ID_USO, {
    send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false,
    cookie_domain: HOST_OFICIAL, page_location: paginaDe(modulo), page_referrer: '', page_title: `TannerOS · ${modulo}`
  });
  const s = document.createElement('script'); s.async = true; s.src = `https://www.googletagmanager.com/gtag/js?id=${ID_USO}`;
  document.head.appendChild(s);
  manda('page_view', { page_location: paginaDe(modulo), page_title: `TannerOS · ${modulo}`, page_referrer: '' });
  manda('tanner_module_opened', { module_name: modulo });
  let antes = null; try { antes = sessionStorage.getItem('tos_uso_modulo'); sessionStorage.setItem('tos_uso_modulo', modulo); } catch { /* */ }
  if (antes && antes !== modulo) manda('tanner_navigation', { from_module: antes, to_module: modulo });
  try {
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav && nav.domContentLoadedEventEnd > 0) manda('tanner_screen_load', { module_name: modulo, load_ms: nav.domContentLoadedEventEnd });
  } catch { /* */ }
  // Errores: el tipo, no el mensaje (el mensaje puede traer datos).
  addEventListener('error', () => manda('tanner_error', { module_name: modulo, error_type: 'js' }));
  addEventListener('unhandledrejection', () => manda('tanner_error', { module_name: modulo, error_type: 'promesa' }));
}

const ESTILO = '.tos-cookies{position:fixed;bottom:calc(12px + env(safe-area-inset-bottom));left:12px;right:12px;max-width:520px;margin:auto;background:#fff;color:#07191e;border:1px solid #e3e9e7;border-radius:16px;box-shadow:0 18px 50px rgba(7,25,30,.22);padding:14px 16px;z-index:9999;font:14px/1.45 Inter,system-ui,sans-serif}.tos-cookies p{margin:0 0 10px}.tos-cookies a{color:#0b3d4a;font-weight:700}.tos-cookie-botones{display:grid;grid-template-columns:1fr 1fr;gap:8px}.tos-cookies button{min-height:44px;border:1.5px solid #07191e;border-radius:12px;font:inherit;font-weight:700;cursor:pointer}.tos-cookie-no{background:#fff;color:#07191e}.tos-cookie-si{background:#07191e;color:#fff}.tos-cookie-pref{display:block;margin-top:8px;background:transparent;border:0;color:inherit;opacity:.75;text-decoration:underline;font:12px Inter,system-ui,sans-serif;cursor:pointer}';
function estilos() {
  if (document.getElementById('tosUsoCss')) return;
  const s = document.createElement('style'); s.id = 'tosUsoCss'; s.textContent = ESTILO; document.head.appendChild(s);
}
/* Dos botones del mismo tamaño: decir que no es igual de fácil. */
export function preguntaUso() {
  if (typeof document === 'undefined' || document.getElementById('tosUsoConsentimiento')) return;
  estilos();
  const box = document.createElement('section');
  box.id = 'tosUsoConsentimiento'; box.className = 'tos-cookies'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Analítica de uso');
  box.innerHTML = '<p>¿Nos dejas medir qué pantallas de TannerOS se usan, con Google Analytics? Sólo el nombre del módulo: nunca nombres, teléfonos, jugadores ni lo que escribes. Es opcional. <a href="/aviso-de-privacidad/#cookies" target="_blank" rel="noopener">Aviso de privacidad</a></p><div class="tos-cookie-botones"><button class="tos-cookie-no" type="button" data-uso="no">Solo lo necesario</button><button class="tos-cookie-si" type="button" data-uso="si">Aceptar</button></div>';
  box.addEventListener('click', e => {
    const b = e.target.closest('button[data-uso]'); if (!b) return;
    const antes = lee(), nueva = b.dataset.uso;
    guarda(nueva); box.remove();
    if (nueva === 'si') carga();
    if (nueva === 'no') { borraCookiesGoogle(); if (antes === 'si' && cargado) location.reload(); }
  });
  document.body.appendChild(box);
}

/* Se llama en cada pantalla del staff con el rol y el módulo del menú. */
export function iniciarUsoStaff({ role, isOwner = false, modulo: m, organizationId = null, rpc = null, preguntar = true } = {}) {
  if (typeof document === 'undefined') return;
  const mod = moduloValido(m);
  if (!mod || !rolMedible(role, isOwner)) return;
  // Conteo propio, agregado y una vez por módulo por sesión: no depende de Google.
  if (rpc && organizationId && rpcPing !== mod) {
    rpcPing = mod;
    let ya = false; try { ya = sessionStorage.getItem(`tos_ping_${mod}`) === '1'; sessionStorage.setItem(`tos_ping_${mod}`, '1'); } catch { /* */ }
    if (!ya) Promise.resolve().then(() => rpc('v2_usage_ping', { organization_id: organizationId, module: mod })).catch(() => {});
  }
  if (!hostMedible(host())) return;
  modulo = mod;
  const pie = document.querySelector('.tos-sidebar-bottom');
  if (pie && !document.getElementById('tosUsoPreferencias')) {
    estilos();
    const b = document.createElement('button'); b.id = 'tosUsoPreferencias'; b.type = 'button'; b.className = 'tos-cookie-pref';
    b.textContent = 'Preferencias de analítica'; b.addEventListener('click', preguntaUso); pie.appendChild(b);
  }
  const d = lee();
  if (d === 'si') carga();
  else if (d !== 'no' && preguntar && !pidioPermiso) { pidioPermiso = true; preguntaUso(); }
}

/* "Se usó esta función": sólo nombres del catálogo, sin datos. */
export function usaFuncion(feature) { if (modulo) manda('tanner_feature_used', { module_name: modulo, feature }); }

/* Al cerrar sesión ninguna etiqueta sobrevive al siguiente usuario. */
export function apagaAlSalir() { if (cargado && typeof location !== 'undefined') location.reload(); }
