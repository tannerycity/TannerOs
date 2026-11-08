/* La entrada con la sesión abierta (04/11/2026).

   Presidencia: "siempre que estamos en el club, cuando ingresamos y queremos
   tocar en el inicio, nos abre luego la aplicación porque ya tenemos nuestra
   cuenta... hay ocasiones donde no queremos que eso pase... les sugiero que
   entren en modo incógnito, pero no quiero que eso siga pasando".

   Regla: la portada pública (las puertas) se ve SIEMPRE que alguien llega de
   fuera: escribió app.tannerycity.com, abrió una liga de WhatsApp o de otro
   sitio. Con la sesión abierta, la puerta "Staff" dice "Entrar al vestidor" y
   entra con un toque, sin contraseña.

   Entra directo al vestidor (como antes) sólo si:
     - viene de dentro de la app (el "Inicio" del menú, el logo, "‹ regresar"),
     - la liga lo pide: ?vestidor o #staff (lo que el staff guarda en favoritos).
   App instalada (08/11/2026): Presidencia, "cuando inicia sesión te abre la
   sesión, no puedes coger Centro Tanner ni Inscripción". Ya no es excepción:
   al abrirla también se ven las puertas; "Entrar al vestidor" es un toque.
   Sin dependencias: se prueba sola (scripts/qa-entrada-sesion.mjs). */

export function entraDirecto({ loc = globalThis.location, referrer = globalThis.document?.referrer || '' } = {}) {
  const p = new URLSearchParams(loc?.search || '');
  if (p.has('vestidor') || loc?.hash === '#staff' || p.has('staff')) return true;
  try { if (referrer && new URL(referrer).origin === loc.origin) return true; } catch { /* referrer raro: como si viniera de fuera */ }
  return false;
}

export function esAppInstalada(win = globalThis) {
  try { return !!(win.matchMedia?.('(display-mode: standalone)').matches || win.navigator?.standalone); } catch { return false; }
}

/* Con la sesión abierta y en las puertas: "Staff" pasa a "Entrar al vestidor"
   (un toque, sin contraseña) y abajo sale "¿No eres tú? Cerrar sesión".
   entrar() y salir() los pone la app. */
export function puertasConSesion({ doc = globalThis.document, nombre = '', entrar, salir } = {}) {
  const boton = doc?.getElementById('abreStaff');
  if (!boton || boton.dataset.conSesion === '1') return;
  boton.dataset.conSesion = '1';
  const b = boton.querySelector('.tc-puerta-txt b'), s = boton.querySelector('.tc-puerta-txt small');
  if (b) b.textContent = 'Entrar al vestidor';
  if (s) s.textContent = nombre ? `Sesión abierta: ${nombre}. Un toque y entras` : 'Tu sesión sigue abierta. Un toque y entras';
  boton.setAttribute('aria-label', 'Entrar al vestidor con tu sesión abierta');
  // En captura: antes de que las puertas abran el formulario de contraseña. Una sola vez.
  acciones.entrar = entrar; acciones.salir = salir;
  if (!doc.__tcSesion) {
    doc.__tcSesion = true;
    doc.addEventListener('click', e => {
      const t = e.target.closest?.('#abreStaff');
      if (!t || t.dataset.conSesion !== '1') return;
      e.preventDefault(); e.stopPropagation();
      t.disabled = true;
      Promise.resolve(acciones.entrar?.()).finally(() => { t.disabled = false; });
    }, true);
  }
  const nota = doc.createElement('p');
  nota.className = 'tc-sesion-nota';
  nota.innerHTML = '¿No eres tú? <button type="button" class="tc-sesion-salir">Cerrar sesión</button>';
  boton.insertAdjacentElement('afterend', nota);
  nota.querySelector('button').addEventListener('click', () => acciones.salir?.());
}
const acciones = { entrar: null, salir: null };

/* Al cerrar sesión, la puerta vuelve a ser "Staff" (login). */
export function puertasSinSesion(doc = globalThis.document) {
  const boton = doc?.getElementById('abreStaff');
  if (!boton || boton.dataset.conSesion !== '1') return;
  boton.dataset.conSesion = '0';
  const b = boton.querySelector('.tc-puerta-txt b'), s = boton.querySelector('.tc-puerta-txt small');
  if (b) b.textContent = 'Staff';
  if (s) s.textContent = 'Acceso del equipo del club';
  boton.removeAttribute('aria-label');
  doc.querySelector('.tc-sesion-nota')?.remove();
}
