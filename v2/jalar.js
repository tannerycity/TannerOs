/* JALAR PARA ACTUALIZAR (25/11/2026).
 * Presidencia: "pull-to-refresh con un loader animado arriba... en toda la
 * app estaría chido que así se actualizara... sí pon la T del club".
 * En la app instalada del iPhone jalar hacia abajo no hacía nada (el gesto
 * del navegador no existe ahí). Esto lo pone en toda la app: estando hasta
 * arriba, jalas; la T del club crece y el aro dorado se llena; al soltar,
 * el aro gira mientras la pantalla vuelve a pedir sus datos.
 *   - Cada pantalla puede decir cómo se actualiza (window.tosAlActualizar);
 *     si no, se recarga la página.
 *   - No se activa con una hoja o ventana abierta, ni si el dedo empezó en
 *     algo que se desliza de lado.
 * progresoDe() no toca la pantalla: se prueba con node. */

export const UMBRAL = 64;   // px que baja la burbuja para que cuente (~140 px de dedo)
export const MAXIMO = 120;  // hasta dónde baja la burbuja

// Jalar se siente con resistencia: los primeros px cuentan más que los últimos.
export function progresoDe(dy) {
  if (!(dy > 0)) return { y: 0, p: 0, listo: false };
  const y = Math.min(MAXIMO, MAXIMO * (1 - Math.exp(-dy / (MAXIMO * 1.4))));
  const p = Math.min(1, y / UMBRAL);
  return { y, p, listo: y >= UMBRAL };
}

const ABIERTO = '.tosdlg, .benef-fondo, .drawer-backdrop, [aria-modal="true"]:not(.hidden), .workspace-modal:not(.hidden), dialog[open]';
export const hayAlgoAbierto = (doc = document) => [...doc.querySelectorAll(ABIERTO)].some((e) => e.offsetParent !== null || getComputedStyle(e).position === 'fixed');

function estilos() {
  if (document.getElementById('jalarEstilos')) return;
  const s = document.createElement('style');
  s.id = 'jalarEstilos';
  s.textContent = `
.tos-jalar{position:fixed;left:50%;top:0;z-index:9500;width:48px;height:48px;margin-left:-24px;border-radius:50%;background:#fff;box-shadow:0 6px 20px rgba(7,25,30,.18);display:grid;place-items:center;transform:translateY(-60px);opacity:0;pointer-events:none;will-change:transform}
.tos-jalar.suelto{transition:transform .38s cubic-bezier(.3,1.3,.5,1),opacity .25s ease}
.tos-jalar svg.aro{position:absolute;inset:0;width:48px;height:48px;transform:rotate(-90deg)}
.tos-jalar .aro circle{fill:none;stroke-width:3}
.tos-jalar .aro .fondo{stroke:#e4ebe9}
.tos-jalar .aro .lleno{stroke:#b8a464;stroke-linecap:round;stroke-dasharray:132;stroke-dashoffset:132}
.tos-jalar .t{width:24px;height:24px;object-fit:contain;transform-origin:50% 60%}
.tos-jalar .t.sin-escudo{width:16px;height:16px;border-radius:50%;background:#0b3d4a}
.tos-jalar.girando .aro{animation:tosJalarGira .8s linear infinite}
.tos-jalar.girando .aro .lleno{stroke-dashoffset:90;transition:stroke-dashoffset .2s ease}
.tos-jalar.girando .t{animation:tosJalarLatido 1s ease-in-out infinite}
@keyframes tosJalarGira{to{transform:rotate(270deg)}}
@keyframes tosJalarLatido{0%,100%{transform:scale(1)}50%{transform:scale(.86)}}
@media (prefers-reduced-motion:reduce){.tos-jalar.girando .aro,.tos-jalar.girando .t{animation:none}}`;
  document.head.appendChild(s);
}

export function jalarParaActualizar({ escudo = '/brand/crest-navy.png', siempre = false } = {}) {
  if (window.__tosJalar) return;
  // En el navegador normal ya existe el gesto; aquí sólo en la app instalada
  // (o donde se pida, como en las pruebas).
  const instalada = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (!instalada && !siempre && !window.__tosJalarSiempre) return;
  window.__tosJalar = true;
  estilos();
  document.documentElement.style.overscrollBehaviorY = 'contain';
  const b = document.createElement('div');
  b.className = 'tos-jalar'; b.setAttribute('role', 'status'); b.setAttribute('aria-live', 'polite');
  b.innerHTML = '<svg class="aro" viewBox="0 0 48 48" aria-hidden="true"><circle class="fondo" cx="24" cy="24" r="21"/><circle class="lleno" cx="24" cy="24" r="21"/></svg>' +
    (escudo ? '<img class="t" alt="" src="' + escudo + '">' : '<span class="t sin-escudo"></span>') + '<span class="sr-only" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)"></span>';
  document.body.appendChild(b);
  const lleno = b.querySelector('.lleno'), t = b.querySelector('.t'), voz = b.querySelector('.sr-only');
  let y0 = null, x0 = 0, activo = false, ultimo = { y: 0, p: 0, listo: false }, ocupado = false, avisado = false;

  const pinta = (r) => {
    b.style.opacity = r.y > 4 ? '1' : '0';
    b.style.transform = `translateY(${r.y - 52}px)`;
    lleno.style.strokeDashoffset = String(132 * (1 - r.p));
    t.style.transform = `scale(${0.6 + 0.4 * r.p}) rotate(${(1 - r.p) * -90}deg)`;
  };
  const regresa = () => { b.classList.add('suelto'); b.classList.remove('girando'); pinta({ y: 0, p: 0 }); setTimeout(() => b.classList.remove('suelto'), 400); };

  window.addEventListener('touchstart', (e) => {
    if (ocupado || e.touches.length !== 1 || window.scrollY > 0 || hayAlgoAbierto()) { y0 = null; return; }
    if (e.target.closest?.('[data-sin-jalar], input, textarea, select, .tos-seg, [data-desliza]')) { y0 = null; return; }
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; activo = false; avisado = false;
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (y0 == null || ocupado) return;
    const dy = e.touches[0].clientY - y0, dx = Math.abs(e.touches[0].clientX - x0);
    if (!activo) {
      if (dy < 8 || dx > dy || window.scrollY > 0) { if (dy < -4 || dx > 12) y0 = null; return; }
      activo = true; b.classList.remove('suelto');
    }
    if (e.cancelable) e.preventDefault();
    ultimo = progresoDe(dy - 8);
    if (ultimo.listo && !avisado) { avisado = true; navigator.vibrate?.(8); }
    pinta(ultimo);
  }, { passive: false });
  const suelta = async () => {
    if (y0 == null) return;
    y0 = null;
    if (!activo) return;
    activo = false;
    if (!ultimo.listo) return regresa();
    ocupado = true;
    b.classList.add('suelto', 'girando');
    pinta({ y: 64, p: 1 });
    voz.textContent = 'Actualizando';
    try {
      if (typeof window.tosAlActualizar === 'function') await Promise.race([window.tosAlActualizar(), new Promise((r) => setTimeout(r, 12000))]);
      else { location.reload(); return; }
    } catch { /* la pantalla ya avisa si algo falla */ }
    voz.textContent = 'Listo';
    ocupado = false;
    regresa();
  };
  window.addEventListener('touchend', suelta);
  window.addEventListener('touchcancel', suelta);
}
