// Tanner LIVE · reglas de pantalla (sin DOM, sin red). Las comparten la
// pantalla del staff (/live/) y la de familias (/familias/live/), y las prueba
// scripts/qa-live.mjs.
//
// Ninguna de estas funciones DECIDE quién ve qué: eso lo decide la base
// (private.live_motivo) y el gateway lo vuelve a revisar en cada conexión.
// Aquí sólo se traduce lo que respondió el servidor a palabras del club.

export const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const DIAS_CORTOS = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// Versión de las reglas que acepta quien ve. Si cambia el texto, sube la
// versión aquí y en app.live_settings.terms_version (Ajustes del panel).
export const REGLAS_VERSION = 1;
export const REGLAS = [
  'Tanner LIVE es privado: sólo para tutores y staff autorizados por el club.',
  'No grabes, no captures pantalla y no compartas la transmisión ni tu acceso.',
  'Tu acceso es personal y funciona en un solo dispositivo a la vez.',
  'La transmisión es sin audio y sólo en los horarios de entrenamiento.',
  'El club puede pausar o retirar el acceso en cualquier momento para cuidar a los jugadores.'
];

// Motivo del servidor -> lo que ve la familia o el staff. Nunca un error crudo.
export const MOTIVOS = {
  ok: { titulo: 'Lista para ver', texto: 'Toca reproducir cuando quieras ver el entrenamiento.', tono: 'ok' },
  sin_terminos: { titulo: 'Acepta las reglas', texto: 'Antes de la primera transmisión, lee y acepta las reglas de Tanner LIVE.', tono: 'aviso' },
  fuera_de_horario: { titulo: 'Fuera de horario', texto: 'Esta cámara sólo transmite en el horario de entrenamiento.', tono: 'neutro' },
  sin_horario: { titulo: 'Sin horario', texto: 'El club todavía no define el horario de esta cámara.', tono: 'neutro' },
  desactivada: { titulo: 'Transmisión apagada', texto: 'El club apagó esta transmisión por ahora.', tono: 'neutro' },
  pausado: { titulo: 'Transmisiones en pausa', texto: 'El club pausó Tanner LIVE. Vuelve más tarde.', tono: 'aviso' },
  bloqueado: { titulo: 'Acceso no disponible', texto: 'Tu acceso a esta cámara no está activo. Si crees que es un error, escribe al club.', tono: 'aviso' },
  sin_gateway: { titulo: 'Cámara aún no conectada', texto: 'La cámara está registrada, pero todavía no está conectada al servidor de video del club.', tono: 'neutro' },
  demasiados_intentos: { titulo: 'Espera un momento', texto: 'Hubo muchos intentos seguidos. Prueba de nuevo en un minuto.', tono: 'aviso' },
  sin_permiso: { titulo: 'Sin acceso', texto: 'Esta cámara no está asignada a tu cuenta.', tono: 'aviso' },
  no_existe: { titulo: 'Cámara no disponible', texto: 'Esta cámara no existe o ya no está disponible.', tono: 'aviso' },
  modulo_apagado: { titulo: 'Tanner LIVE no está activo', texto: 'Tu club todavía no tiene Tanner LIVE.', tono: 'neutro' },
  sin_sesion: { titulo: 'Inicia sesión', texto: 'Vuelve a entrar a tu cuenta para ver la transmisión.', tono: 'aviso' },
  sensible: { titulo: 'Cámara restringida', texto: 'Esta cámara no se transmite.', tono: 'aviso' },
  // Botón Transmitir / enlace (24/11/2026)
  terminada: { titulo: 'La transmisión terminó', texto: 'Esta transmisión ya terminó. Si te mandan un enlace nuevo, ábrelo.', tono: 'neutro' },
  horario_academia: { titulo: 'Horario de la academia', texto: 'En este horario la cámara es sólo para las familias de la academia.', tono: 'aviso' },
  lleno: { titulo: 'Cupo lleno', texto: 'Ya hay demasiadas personas viendo. Intenta en unos minutos.', tono: 'aviso' }
};
export const motivo = m => MOTIVOS[m] || { titulo: 'No disponible', texto: 'Por ahora no se puede ver esta cámara.', tono: 'aviso' };

// Estado del reproductor -> etiqueta. "En vivo" SÓLO cuando hay cuadros de un
// gateway real reproduciéndose. La señal de prueba nunca se anuncia en vivo.
export const ESTADOS = {
  inactivo: { etiqueta: 'Listo', tono: 'neutro' },
  conectando: { etiqueta: 'Conectando…', tono: 'neutro' },
  en_vivo: { etiqueta: 'En vivo', tono: 'vivo' },
  pausado: { etiqueta: 'En pausa', tono: 'neutro' },
  sin_senal: { etiqueta: 'Sin señal', tono: 'aviso' },
  error: { etiqueta: 'Error', tono: 'aviso' },
  prueba: { etiqueta: 'Señal de prueba', tono: 'prueba' },
  offline: { etiqueta: 'Fuera de línea', tono: 'aviso' }
};
export function puedeDecirEnVivo({ proveedor, reproduciendo, cuadros }) {
  return proveedor !== 'prueba' && Boolean(reproduciendo) && Number(cuadros) > 0;
}

// Estado que reporta el gateway para la cámara (stream_state).
export const ESTADO_CAMARA = {
  sin_configurar: 'Sin configurar', offline: 'Fuera de línea', conectando: 'Conectando',
  online: 'En línea', error: 'Con error'
};

const aMinutos = hhmm => { const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

// Día ISO (1 = lunes) y minutos del día, en la zona del club.
export function relojDelClub(fecha = new Date(), tz = 'America/Mexico_City') {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(fecha).reduce((a, p) => (a[p.type] = p.value, a), {});
  const dia = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[partes.weekday];
  return { dia, minutos: Number(partes.hour) * 60 + Number(partes.minute) };
}

export function dentroDeHorario(horario = [], fecha = new Date(), tz = 'America/Mexico_City') {
  const { dia, minutos } = relojDelClub(fecha, tz);
  return (horario || []).some(v => Number(v.dia) === dia && minutos >= aMinutos(v.de) && minutos < aMinutos(v.a));
}

// La siguiente ventana (o la actual), para decirle a la familia cuándo.
export function proximaVentana(horario = [], fecha = new Date(), tz = 'America/Mexico_City') {
  const lista = (horario || []).filter(v => aMinutos(v.de) != null && aMinutos(v.a) != null);
  if (!lista.length) return null;
  const { dia, minutos } = relojDelClub(fecha, tz);
  let mejor = null;
  for (const v of lista) {
    let dias = (Number(v.dia) - dia + 7) % 7;
    if (dias === 0 && minutos >= aMinutos(v.a)) dias = 7;
    const ahora = dias === 0 && minutos >= aMinutos(v.de);
    const orden = dias * 1440 + (ahora ? 0 : aMinutos(v.de));
    if (!mejor || orden < mejor.orden) mejor = { ...v, dias, ahora, orden };
  }
  return mejor;
}

export function textoVentana(v) {
  if (!v) return 'Sin horario definido';
  if (v.ahora) return `Ahora, hasta las ${v.a}`;
  const cuando = v.dias === 0 ? 'Hoy' : v.dias === 1 ? 'Mañana' : DIAS[v.dia];
  return `${cuando} de ${v.de} a ${v.a}`;
}

export function textoHorario(horario = []) {
  if (!horario?.length) return 'Sin horario';
  return horario.slice().sort((a, b) => a.dia - b.dia || aMinutos(a.de) - aMinutos(b.de))
    .map(v => `${DIAS_CORTOS[v.dia]} ${v.de}–${v.a}`).join(' · ');
}

// ---------- Formularios del panel (la base vuelve a validar todo) ----------

export function esIpPrivada(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip || '').trim());
  if (!m) return false;
  const o = m.slice(1).map(Number);
  if (o.some(n => n > 255)) return false;
  return o[0] === 10 || (o[0] === 172 && o[1] >= 16 && o[1] <= 31) || (o[0] === 192 && o[1] === 168);
}

const SECRETO = /(rtsp:\/\/[^\s]*@|password|passwd|contrase|token)/i;
export const pareceSecreto = txt => SECRETO.test(String(txt || ''));

// Por si alguien pega una URL con usuario y contraseña: se muestra sin ellos.
export function limpiaSecretos(txt) {
  return String(txt ?? '')
    .replace(/rtsp:\/\/[^\s@/]*@/gi, 'rtsp://')
    .replace(/(password|passwd|contrase\S*|token)\s*[=:]\s*[^\s&]+/gi, '[dato oculto]');
}

export function validaGrabador(d = {}) {
  const e = [];
  if (!String(d.nombre || '').trim()) e.push('Ponle un nombre al grabador (por ejemplo, "Grabador del parque").');
  if (d.ip && !esIpPrivada(d.ip)) e.push('La IP debe ser de la red local (192.168.x.x, 10.x.x.x o 172.16–31.x.x). Nunca una IP pública.');
  if (d.puerto !== undefined && d.puerto !== '' && !(Number.isInteger(Number(d.puerto)) && Number(d.puerto) >= 1 && Number(d.puerto) <= 65535)) e.push('El puerto RTSP va de 1 a 65535 (Dahua usa 554).');
  if (d.canales !== undefined && d.canales !== '' && !(Number(d.canales) >= 1 && Number(d.canales) <= 256)) e.push('Los canales van de 1 a 256.');
  for (const campo of ['nombre', 'modelo', 'notas', 'firmware']) if (pareceSecreto(d[campo])) e.push('No escribas usuarios, contraseñas ni URLs RTSP con credenciales: viven sólo en el servidor de video.');
  return [...new Set(e)];
}

export function validaCamara(d = {}) {
  const e = [];
  if (!String(d.nombre || '').trim()) e.push('Ponle nombre a la cámara (por ejemplo, "Cancha 1").');
  if (d.canal !== undefined && d.canal !== '' && !(Number(d.canal) >= 1 && Number(d.canal) <= 256)) e.push('El canal va de 1 a 256.');
  if (d.ruta && !/^[a-z0-9][a-z0-9_-]{2,62}$/.test(String(d.ruta))) e.push('La ruta del gateway usa minúsculas, números y guiones (ej. tc-cancha-1).');
  if (d.resolucion && !/^\d{3,4}x\d{3,4}$/.test(String(d.resolucion))) e.push('La resolución se escribe como 704x480 o 1280x720.');
  for (const v of d.horario || []) {
    if (!(v.dia >= 1 && v.dia <= 7)) e.push('Cada horario necesita un día.');
    else if (aMinutos(v.de) == null || aMinutos(v.a) == null || aMinutos(v.a) <= aMinutos(v.de)) e.push(`El horario del ${DIAS[v.dia]} debe terminar después de empezar.`);
  }
  if (d.sensible && ((d.categorias || []).length || (d.roles || []).length)) e.push('Una cámara sensible no se transmite: quítale la audiencia o desmárcala.');
  return [...new Set(e)];
}

// Lo que falta para poder encender una cámara (el servidor lo vuelve a exigir).
export function faltaParaEncender(c = {}) {
  const f = [];
  if (c.sensible) f.push('Es una cámara sensible: no se transmite.');
  if (!(c.categorias || []).length && !(c.roles || []).length) f.push('Elegir quién la puede ver (categorías o roles).');
  if (!(c.horario || []).length) f.push('Definir el horario de transmisión.');
  if (!c.consentimiento_al) f.push('Revisar los permisos de imagen de los jugadores.');
  return f;
}

// Motivos con los que el servidor rechaza encender, en palabras del club.
export const NO_ENCIENDE = {
  sensible: 'Es una cámara sensible: no se transmite.',
  sin_audiencia: 'Primero elige quién la puede ver.',
  sin_horario: 'Primero define su horario.',
  revisar_consentimiento: 'Primero revisa los permisos de imagen (vale 30 días).',
  consentimiento_incompleto: 'Hay jugadores sin permiso de imagen: sólo Presidencia puede encenderla.',
  falta_justificacion: 'Hay jugadores sin permiso de imagen: escribe por qué se autoriza (mínimo 10 letras).',
  horario_academia: 'Es horario de la academia en esa cámara: por enlace no se puede. Usa "Sólo familias".',
  pausado: 'Las transmisiones están en pausa. Reanúdalas primero.'
};

// ---------- Botón "Transmitir" ----------
// El enlace lleva el código después de #: el navegador no lo manda al
// servidor ni lo deja en el historial de quien comparte una página.
export const enlaceDe = (codigo, origen = 'https://app.tannerycity.com') => `${origen}/ver/#${codigo}`;
export function codigoDeEnlace(hash = '') {
  const c = String(hash || '').replace(/^#/, '').trim().toLowerCase();
  return /^[0-9a-f]{32}$/.test(c) ? c : null;
}
export function mensajeWhatsApp({ titulo, camara, enlace, termina }) {
  const hora = termina ? new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Mexico_City' }).format(new Date(termina)) : '';
  return `${titulo || camara || 'Transmisión'} en vivo${hora ? ` (hasta las ${hora})` : ''}: ${enlace}`;
}
// Duraciones del botón. "Hasta las 11 pm" se calcula con la hora del club.
export function minutosHasta(horaHHMM, fecha = new Date(), tz = 'America/Mexico_City') {
  const { minutos } = relojDelClub(fecha, tz);
  const [h, m] = String(horaHHMM).split(':').map(Number);
  let faltan = h * 60 + m - minutos;
  if (faltan <= 0) faltan += 1440;
  return Math.max(15, Math.min(360, faltan));
}
export const DURACIONES = [['60', '1 hora'], ['120', '2 horas'], ['180', '3 horas'], ['hasta-23', 'Hasta las 11 pm']];

// Plantilla que documenta Dahua, SIN credenciales. Sólo orientativa para quien
// configura el gateway; el navegador nunca la usa para conectarse.
export function plantillaRtspDahua({ ip, puerto = 554, canal = 1, perfil = 'sub' } = {}) {
  const host = esIpPrivada(ip) ? ip : 'IP_DEL_GRABADOR';
  return `rtsp://USUARIO:CLAVE@${host}:${Number(puerto) || 554}/cam/realmonitor?channel=${Number(canal) || 1}&subtype=${perfil === 'main' ? 0 : 1}`;
}

export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
