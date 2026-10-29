/**
 * TannerOS: medición opcional de uso de pantallas de STAFF con GA4.
 * NUNCA enviar user_id, organization_id, rol, URL con query/hash, nombres,
 * salud, fichajes, fotografías, formularios ni valores de controles.
 * Familias y cuentas Tanner quedan expresamente fuera de este primer alcance.
 */
export const ID_USO = 'G-KJN3NJS2YJ';
const CLAVE = 'tos_uso_analitica_v1';
const ROLES_STAFF = new Set(['Presidencia','Operaciones','Formadores','Academia','Contabilidad','Taquilla','Marketing','Scouting']);
export const RUTAS_PERMITIDAS = Object.freeze({
  '/': 'inicio',
  '/club/': 'club',
  '/direccion/': 'direccion',
  '/finanzas/': 'finanzas',
  '/taquilla/': 'taquilla',
  '/contabilidad/': 'contabilidad',
  '/jugadores/': 'jugadores',
  '/asistencia/': 'asistencia',
  '/prospectos/': 'fichajes',
  '/scouting/': 'scouting',
  '/partidos/': 'partidos',
  '/convocatoria/': 'convocatoria',
  '/calendario/': 'calendario',
  '/operacion/academias/': 'academias',
  '/operacion/programas/': 'programas',
  '/pedidos/': 'pedidos',
  '/catalogo/': 'catalogo',
  '/usuarios/': 'usuarios',
  '/patrocinadores/': 'patrocinadores',
  '/utileria/': 'utileria',
  '/mensajes/': 'mensajes',
  '/mi-academia/': 'mi_academia',
  '/porteros/': 'porteros',
  '/formacion/': 'formacion',
  '/staff/': 'staff',
  '/administracion/': 'administracion',
});
let iniciado = false;
export const rolMedible = role => ROLES_STAFF.has(role);
export function moduloMedible(location) {
  if (!location || location.hostname !== 'app.tannerycity.com' || location.search || location.hash) return null;
  return RUTAS_PERMITIDAS[location.pathname] || null;
}
function lee() { try { return localStorage.getItem(CLAVE); } catch { return null; } }
function guarda(v) { try { localStorage.setItem(CLAVE, v); } catch { /* sin persistencia: volver a elegir */ } }
function cargarModulo() {
  if (iniciado || lee() !== 'si') return;
  const modulo = moduloMedible(window.location);
  if (!modulo) return;
  // Evitar duplicar Google Analytics si se instaló por otra vía.
  if (window.gtag || document.querySelector('script[src*="googletagmanager.com/"]')) return;
  iniciado = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  const pagina = 'https://app.tannerycity.com' + window.location.pathname;
  window.gtag('config', ID_USO, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    cookie_domain: 'app.tannerycity.com',
    page_location: pagina,
    page_referrer: '',
    page_title: 'TannerOS · ' + modulo,
  });
  window.gtag('event', 'page_view', { page_location: pagina, page_referrer: '', page_title: 'TannerOS · ' + modulo });
  window.gtag('event', 'tanner_module_opened', { module_name: modulo });
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID_USO;
  document.head.appendChild(script);
}
const ESTILO = '.tos-cookies{position:fixed;bottom:12px;left:12px;right:12px;max-width:520px;margin:auto;background:#fff;color:#102032;border:1px solid #cbd5e1;border-radius:14px;box-shadow:0 8px 35px #0003;padding:16px;z-index:9999;font:14px/1.45 system-ui,sans-serif}.tos-cookies p{margin:0 0 12px}.tos-cookies .tos-cookie-buttons{display:flex;gap:8px}.tos-cookies button{min-height:44px;flex:1;border:1px solid #173754;border-radius:10px;font:inherit;font-weight:bold;cursor:pointer}.tos-cookies .tos-cookie-no{background:#fff;color:#173754}.tos-cookies .tos-cookie-yes{background:#173754;color:#fff}.tos-cookie-pref{display:block;margin-top:8px;background:transparent;border:0;color:inherit;text-decoration:underline;font:12px system-ui,sans-serif;cursor:pointer}';
function estilos() {
  if (document.getElementById('tos-uso-css')) return;
  const s = document.createElement('style');
  s.id = 'tos-uso-css';
  s.textContent = ESTILO; document.head.appendChild(s);
}
function preguntar() {
  if (document.getElementById('tos-uso-consentimiento')) return;
  const box = document.createElement('section');
  box.id = 'tos-uso-consentimiento';
  box.className = 'tos-cookies'; box.setAttribute('role','dialog'); box.setAttribute('aria-label','Consentimiento de analítica');
  box.innerHTML = '<p>¿Nos permites medir de forma opcional las pantallas del staff que se utilizan? Usamos Google Analytics, sin enviar nombres, correos, teléfonos, IDs de jugadores ni contenido de formularios. <a href="/aviso-de-privacidad/" target="_blank" rel="noopener">Aviso de privacidad</a>.</p><div class="tos-cookie-buttons"><button class="tos-cookie-no" type="button" data-uso="no">Solo lo necesario</button><button class="tos-cookie-yes" type="button" data-uso="si">Aceptar</button></div>';
  box.addEventListener('click', e => {
    const b=e.target.closest('button[data-uso]'); if(!b)return;
    const anterior=lee(), nueva=b.dataset.uso;
    guarda(nueva); box.remove();
    if(nueva==='si') cargarModulo();
    if(anterior==='si'&&nueva==='no'&&iniciado) window.location.reload();
  });
  document.body.appendChild(box);
}
export function iniciarUsoStaff(role,{mostrarConsentimiento=false}={}) {
  if(typeof document==='undefined'||!rolMedible(role)||!moduloMedible(window.location))return;
  estilos();
  const contenedor=document.querySelector('.tos-sidebar-bottom, .tc-pie');
  if(contenedor&&!document.getElementById('tos-preferencias-uso')) {
    const boton=document.createElement('button');
    boton.id='tos-preferencias-uso'; boton.type='button'; boton.className='tos-cookie-pref';
    boton.textContent='Preferencias de analítica';
    boton.addEventListener('click', preguntar);
    contenedor.appendChild(boton);
  }
  if(lee()==='si')cargarModulo();
  else if(mostrarConsentimiento&&lee()!=='no')preguntar();
}

// Evita que una etiqueta ya activada permanezca al cambiar de usuario.
export function descargarAnaliticaAlSalir() {
  if (typeof window !== 'undefined' && iniciado) window.location.reload();
}
