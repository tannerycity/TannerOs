/* Las puertas de la entrada (13/10/2026). Vive aparte y sin importar nada:
   si la librería de Supabase tarda o no carga, las puertas igual funcionan. */
const q = sel => document.querySelector(sel);

/* Las puertas (13/10/2026): la entrada es un menú de cuatro puertas; el login
   de staff sube al tocar "Staff". Se abre directo cuando la liga lo pide
   (#staff, invitación ?alta=1, recuperar contraseña) o cuando la app ya
   escribió algo en la tarjeta (un error al entrar, el formulario de nueva
   contraseña). El "atrás" del teléfono regresa a las puertas. */
export function abreStaffDeEntrada(loc = location) {
  const p = new URLSearchParams(loc.search);
  return loc.hash === '#staff' || p.get('alta') === '1' || p.has('staff') || /type=recovery|access_token|error_description/.test(loc.hash);
}
export function instalaPuertas() {
  const vista = q('#authView');
  if (!vista) return;
  const pon = (ver, empuja) => {
    vista.classList.toggle('ver-staff', ver);
    if (empuja && ver && location.hash !== '#staff') history.pushState(null, '', `${location.pathname}${location.search}#staff`);
    if (ver) setTimeout(() => q('#email')?.focus({ preventScroll: true }), 60);
  };
  if (abreStaffDeEntrada()) pon(true, false);
  q('#abreStaff')?.addEventListener('click', () => pon(true, true));
  vista.addEventListener('click', e => {
    if (!e.target.closest('#cierraStaff')) return;
    if (location.hash === '#staff') history.back(); else pon(false, false);
  });
  addEventListener('popstate', () => pon(location.hash === '#staff', false));
  // Si la app escribe en la tarjeta (mensaje, recuperar contraseña), se enseña.
  const tarjeta = q('.auth-card');
  if (tarjeta) new MutationObserver(() => {
    const habla = q('#recoveryForm') || (q('#authMessage') && !q('#authMessage').classList.contains('hidden'));
    if (habla && !vista.classList.contains('ver-staff')) pon(true, false);
  }).observe(tarjeta, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
}


if (typeof document !== 'undefined') instalaPuertas();
