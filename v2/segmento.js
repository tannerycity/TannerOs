/* SELECTOR DESLIZANTE (25/11/2026).
 * Presidencia: "segmented control... con el fondo que se desliza... en
 * filtros podríamos poner eso". Un solo control para toda la app: se le pone
 * data-segmento a un grupo de botones (los que ya usan aria-pressed,
 * aria-selected o la clase .active) y aparece la pastilla blanca que se
 * desliza al botón elegido. Si la pantalla vuelve a pintar los botones, la
 * pastilla se vuelve a acomodar sola.
 * posicionDe() no toca la pantalla: se prueba con node. */

export const elegido = (b) => ['aria-pressed', 'aria-selected', 'aria-checked'].some((a) => b.getAttribute(a) === 'true') || b.classList.contains('active') || b.classList.contains('activo') || b.classList.contains('activa');

// Dónde va la pastilla: relativa al grupo, en px.
export function posicionDe(grupo, boton) {
  if (!grupo || !boton) return null;
  return { x: boton.left - grupo.left, w: boton.width, y: boton.top - grupo.top, h: boton.height };
}

function estilos() {
  if (document.getElementById('segEstilos')) return;
  const s = document.createElement('style');
  s.id = 'segEstilos';
  s.textContent = `
.tos-seg{position:relative;display:inline-flex!important;flex-wrap:nowrap!important;gap:2px!important;padding:3px!important;border-radius:13px!important;background:#eef2f1!important;border:0!important;max-width:100%;overflow-x:auto;scrollbar-width:none;isolation:isolate}
.tos-seg[hidden],.tos-seg.hidden{display:none!important}
.tos-seg::-webkit-scrollbar{display:none}
.tos-seg>button,.tos-seg>a{position:relative;z-index:1;flex:1 0 auto;min-height:36px;padding:0 14px!important;border:0!important;border-radius:10px!important;background:transparent!important;color:#5f7076!important;box-shadow:none!important;font-weight:700;white-space:nowrap;transition:color .25s ease;cursor:pointer}
.tos-seg>button:is([aria-pressed="true"],[aria-selected="true"],[aria-checked="true"],.active,.activo,.activa),.tos-seg>a.active{color:#10252b!important}
.tos-seg>button b,.tos-seg>button small{color:inherit!important}
.tos-seg-pastilla{position:absolute;z-index:0;left:0;top:0;border-radius:10px;background:#fff;box-shadow:0 1px 2px rgba(7,25,30,.12),0 3px 10px rgba(7,25,30,.08);transition:transform .32s cubic-bezier(.3,.9,.3,1),width .32s cubic-bezier(.3,.9,.3,1),height .32s ease;pointer-events:none}
.tos-seg.sin-anim .tos-seg-pastilla{transition:none}
@media (prefers-reduced-motion:reduce){.tos-seg-pastilla{transition:none}}`;
  document.head.appendChild(s);
}

export function segmento(grupo) {
  if (!grupo || grupo.dataset.segListo === '1') return;
  grupo.dataset.segListo = '1';
  estilos();
  grupo.classList.add('tos-seg', 'sin-anim');
  let pastilla = null;
  const acomoda = () => {
    if (!pastilla || !grupo.contains(pastilla)) { pastilla = document.createElement('span'); pastilla.className = 'tos-seg-pastilla'; pastilla.setAttribute('aria-hidden', 'true'); grupo.prepend(pastilla); }
    const b = [...grupo.querySelectorAll(':scope > button, :scope > a')].find(elegido);
    if (!b) { pastilla.style.opacity = '0'; return; }
    const p = posicionDe(grupo.getBoundingClientRect(), b.getBoundingClientRect());
    pastilla.style.opacity = '1';
    pastilla.style.width = p.w + 'px'; pastilla.style.height = p.h + 'px';
    pastilla.style.transform = `translate(${p.x + grupo.scrollLeft}px, ${p.y}px)`;
  };
  // Cambios de elegido (atributos) o pantallas que repintan los botones.
  new MutationObserver((ms) => {
    if (ms.every((m) => m.type === 'childList' && [...m.addedNodes, ...m.removedNodes].every((n) => n === pastilla))) return;
    requestAnimationFrame(acomoda);
  }).observe(grupo, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-pressed', 'aria-selected', 'aria-checked', 'class'] });
  if ('ResizeObserver' in window) new ResizeObserver(() => acomoda()).observe(grupo);
  acomoda();
  requestAnimationFrame(() => requestAnimationFrame(() => grupo.classList.remove('sin-anim')));
}

// Todos los [data-segmento] de la página, también los que aparezcan después.
export function segmentos(raiz = document) {
  raiz.querySelectorAll('[data-segmento]').forEach(segmento);
  if (!window.__segObs) {
    window.__segObs = new MutationObserver(() => document.querySelectorAll('[data-segmento]:not([data-seg-listo])').forEach(segmento));
    window.__segObs.observe(document.body, { childList: true, subtree: true });
  }
}
