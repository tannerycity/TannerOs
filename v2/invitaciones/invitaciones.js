/* Invitaciones al portal de familias (18/10/2026). Lo que comparten la pantalla
 * del staff (/invitaciones/) y el portal (/familias/). Sin DOM, para probarlo
 * en Node (qa-invitaciones). */

export const DOMINIO_FAMILIAS = 'familias.tanneros.invalid';

// "+52 477 123 4567" -> "4771234567". Sin 10 dígitos, null.
export function telefono10(v) {
  const d = String(v ?? '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : null;
}

/* Lo que la familia escribe para entrar: su teléfono (como sea que lo
   escriba), su usuario o su correo. Un teléfono se vuelve el usuario de 10
   dígitos; un usuario se normaliza igual que cuando lo creó el staff. */
export function correoDeEntrada(valor) {
  const dato = String(valor ?? '').trim().toLowerCase();
  if (!dato) return '';
  if (dato.includes('@')) return dato;
  if (/^[\d\s()+.-]+$/.test(dato)) {
    const tel = telefono10(dato);
    if (tel) return `${tel}@${DOMINIO_FAMILIAS}`;
  }
  const usuario = dato.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_');
  return `${usuario}@${DOMINIO_FAMILIAS}`;
}

// "477•••4567": se ve que es el suyo sin enseñarlo completo en pantalla.
export const enmascara = tel => (tel && /^\d{10}$/.test(tel) ? `${tel.slice(0, 3)}•••${tel.slice(-4)}` : '');
// Con espacios se lee y se dicta mejor: "477 123 4567".
export const conEspacios = tel => (tel && /^\d{10}$/.test(tel) ? `${tel.slice(0, 3)} ${tel.slice(3, 6)} ${tel.slice(6)}` : String(tel || ''));

// Muchos tutores tienen el nombre completo en "nombre": se saluda con el primero.
export const primeraPalabra = n => String(n || '').trim().split(/\s+/)[0] || '';

export const ligaDeInvitacion = (origen, token) => `${String(origen || '').replace(/\/$/, '')}/familias/#i=${token}`;
// El token viaja en el # para que no quede en bitácoras de servidores.
export function tokenDeLiga(hash) {
  const m = String(hash || '').match(/(?:^#|&)i=([0-9a-f]{64})(?:&|$)/);
  return m ? m[1] : null;
}

// "Gianluca (T10) y Sofía (Baby Tanner)"
export function hijosEnTexto(hijos = []) {
  const n = (hijos || []).map(h => `${primeraPalabra(h.primerNombre || h.nombre)}${h.categoria ? ` (${h.categoria})` : ''}`).filter(Boolean);
  return n.length > 1 ? `${n.slice(0, -1).join(', ')} y ${n.at(-1)}` : (n[0] || '');
}

/* El mensaje de WhatsApp. Corto, con el nombre, lo que va a encontrar y la
   liga. Sin emojis: no todos los teléfonos los pintan igual. */
export function mensajeDeInvitacion({ club, tutor, hijos, liga, usuario, purpose }) {
  const hola = `Hola${primeraPalabra(tutor) ? ` ${primeraPalabra(tutor)}` : ''}`;
  if (purpose === 'reset') {
    return `${hola}, te saluda ${club}. Aquí está tu liga para elegir una contraseña nueva del portal de familias:\n\n${liga}\n\nTu usuario es: ${conEspacios(usuario)}`;
  }
  const quien = hijosEnTexto((hijos || []).map(h => ({ ...h, categoria: null })));
  return `${hola}, te saluda ${club}.\n\nYa puedes ver todo lo de ${quien || 'tu Tanner'} desde tu celular: pagos, asistencia, cómo va con sus profes, la tienda y los avisos del club.\n\nEntra aquí y crea tu contraseña (1 minuto):\n${liga}\n\nTu usuario será tu teléfono: ${conEspacios(usuario)}`;
}

export const ligaWhatsApp = (tel, texto) => `https://wa.me/${tel ? `52${tel}` : ''}?text=${encodeURIComponent(texto)}`;

// En qué va cada familia, para la lista y sus filtros.
export function estadoDeFamilia(t, ahora = Date.now()) {
  if (t.tieneCuenta) {
    const dias = t.ultimaEntrada ? (ahora - new Date(t.ultimaEntrada).getTime()) / 864e5 : null;
    return dias !== null && dias <= 30 ? { k: 'activa', t: 'Ya entra' } : { k: 'cuenta', t: 'Tiene cuenta' };
  }
  if (!t.telefono) return { k: 'sintel', t: 'Sin teléfono' };
  return t.invitada ? { k: 'invitada', t: 'Invitada' } : { k: 'pendiente', t: 'Sin invitar' };
}
