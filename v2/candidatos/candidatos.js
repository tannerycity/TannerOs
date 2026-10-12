/* Candidatos a staff: lo que no depende de la pantalla (para probarlo solo).
 *
 * Presidencia, 12/10/2026: "que sea mucho más fácil para alguien que no sabe
 * de tecnología ver en qué estatus está y cómo escribirles y darles
 * seguimiento". Cada candidato tiene UN siguiente paso, dicho en una frase y
 * con su botón; el botón abre WhatsApp con el mensaje escrito y lo avanza. */

// 'revision' es el código de "Contactado" (así nació en t4).
export const ESTADOS = [
  { code: 'nueva', label: 'Nueva' }, { code: 'revision', label: 'Contactado' }, { code: 'entrevista', label: 'Entrevista' },
  { code: 'prueba', label: 'Prueba en cancha' }, { code: 'contratado', label: 'Contratado' }, { code: 'descartado', label: 'Descartado' }];
export const CAMINO = ['nueva', 'revision', 'entrevista', 'prueba', 'contratado'];
export const ACTIVOS = ['nueva', 'revision', 'entrevista', 'prueba'];
export const etiquetaDe = code => ESTADOS.find(e => e.code === code)?.label || code;
export const FILTROS = [{ code: 'activas', label: 'Por atender' }, { code: 'todos', label: 'Banco de profes' }, ...ESTADOS];

export function filtra(lista, filtro, busqueda = '') {
  const q = sinAcentos(busqueda).trim();
  const base = filtro === 'activas' ? lista.filter(c => ACTIVOS.includes(c.status)) : filtro === 'todos' ? lista.slice() : lista.filter(c => c.status === filtro);
  const vis = q ? base.filter(c => sinAcentos([c.fullName, c.folio, c.city, c.studies, ...(c.positions || [])].join(' ')).includes(q)) : base;
  // Por atender: primero lo que lleva más tiempo esperando, en el orden del camino.
  if (filtro === 'activas') vis.sort((a, b) => CAMINO.indexOf(a.status) - CAMINO.indexOf(b.status) || new Date(a.updatedAt || a.createdAt) - new Date(b.updatedAt || b.createdAt));
  return vis;
}
export function cuenta(lista) {
  const n = Object.fromEntries(ESTADOS.map(e => [e.code, 0]));
  lista.forEach(c => { if (c.status in n) n[c.status]++; });
  return n;
}
export const sinAcentos = v => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Días sin moverse; a partir de 3 se avisa en la tarjeta.
export function diasSinMoverse(c, ahora = Date.now()) {
  if (!ACTIVOS.includes(c.status)) return 0;
  return Math.floor((ahora - new Date(c.updatedAt || c.createdAt).getTime()) / 86400000);
}

const nombre = c => String(c.fullName || '').trim().split(/\s+/)[0] || '';
const puestos = c => (c.positions || []).join(' / ');
export function fechaHora(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }).format(d);
}

// Los mensajes, firmados por el club. Cortos y cálidos: se mandan tal cual.
export const MENSAJES = {
  contacto: (c, club) => `Hola ${nombre(c)}, te escribimos de ${club}. Recibimos tu postulación (${c.folio}) para ${puestos(c)}. Nos gustaría conocerte: ¿qué día y hora te queda bien para una entrevista esta semana?`,
  entrevista: (c, club, cuando) => `Hola ${nombre(c)}, quedó tu entrevista con ${club} el ${cuando}. Te esperamos. Si algo cambia, avísanos por aquí.`,
  prueba: (c, club) => `Hola ${nombre(c)}, gracias por la entrevista. Nos gustaría verte en la cancha con uno de nuestros grupos. ¿Qué día de esta semana puedes venir a una prueba?`,
  contratado: (c, club) => `${nombre(c)}, ¡bienvenido al staff de ${club}! En breve te mandamos tu acceso a TannerOS y los detalles para empezar.`,
  gracias: (c, club) => `Hola ${nombre(c)}, gracias por tu interés en ${club} y por tu tiempo. Por ahora seguimos con otros perfiles, pero guardamos tus datos para próximas vacantes. ¡Mucho éxito!`
};

// El siguiente paso de cada estado: qué hacer y con qué botón.
//   accion.estado: a dónde pasa; accion.mensaje: qué WhatsApp abre;
//   accion.pideFecha: pide día y hora (entrevista); accion.liga: va a otra pantalla.
export function siguientePaso(c) {
  switch (c.status) {
    case 'nueva': return { texto: 'Escríbele para presentarte y pedirle un horario.', acciones: [
      { clave: 'contactar', label: 'Escribirle por WhatsApp', estado: 'revision', mensaje: 'contacto', principal: true }] };
    case 'revision': return { texto: 'Cuando te conteste, pon el día y hora de la entrevista.', acciones: [
      { clave: 'agendar', label: 'Agendar entrevista', estado: 'entrevista', mensaje: 'entrevista', pideFecha: true, principal: true },
      { clave: 'reescribir', label: 'Volver a escribirle', mensaje: 'contacto' }] };
    case 'entrevista': return { texto: '¿Cómo le fue en la entrevista?', acciones: [
      { clave: 'aprueba', label: 'Bien: invitar a prueba en cancha', estado: 'prueba', mensaje: 'prueba', principal: true },
      { clave: 'descarta', label: 'No sigue', estado: 'descartado', mensaje: 'gracias' }] };
    case 'prueba': return { texto: '¿Cómo le fue en la cancha?', acciones: [
      { clave: 'contrata', label: 'Contratar', estado: 'contratado', mensaje: 'contratado', principal: true },
      { clave: 'descarta', label: 'No sigue', estado: 'descartado', mensaje: 'gracias' }] };
    case 'contratado': return { texto: 'Ya es del staff. Dale su acceso a TannerOS.', acciones: [
      { clave: 'acceso', label: 'Dar acceso a TannerOS', liga: '/usuarios/', principal: true }] };
    case 'descartado': return { texto: 'No siguió en el proceso. Queda en tu banco de profes.', acciones: [
      { clave: 'reactiva', label: 'Reactivar', estado: 'revision' }] };
    default: return { texto: '', acciones: [] };
  }
}

// Nota con la fecha de la entrevista al principio, sin perder lo que había.
export function notaConEntrevista(nota, cuando) {
  const limpia = String(nota || '').split('\n').filter(l => !/^Entrevista:/.test(l)).join('\n').trim();
  return [`Entrevista: ${cuando}`, limpia].filter(Boolean).join('\n');
}
