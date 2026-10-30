/* Lo de la visoría que no toca la pantalla (29/10/2026): edades, conteos y
 * filtros. Sin DOM: se prueba con node. */
export const LIGA_PUBLICA = 'https://app.tannerycity.com/visoria';

export function edad(fecha, hoy = new Date()) {
  if (!fecha) return null;
  const n = new Date(`${String(fecha).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(n.getTime())) return null;
  let a = hoy.getFullYear() - n.getFullYear();
  if (hoy < new Date(hoy.getFullYear(), n.getMonth(), n.getDate())) a--;
  return a;
}
export const anioDe = fecha => (fecha ? Number(String(fecha).slice(0, 4)) || null : null);

const normaliza = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/* Todos, los que llegaron o los que faltan; y lo que se escribe en el buscador. */
export function filtra(items = [], { ver = 'todos', busca = '' } = {}) {
  const q = normaliza(busca).trim();
  return items.filter(x => (ver === 'llegaron' ? !!x.arrivedAt : ver === 'faltan' ? !x.arrivedAt : true)
    && (!q || normaliza([x.firstName, x.lastName, x.folio, x.school, x.category].join(' ')).includes(q)));
}

/* Cuántos por año de nacimiento, de mayor a menor: "2014 · 6". */
export function porAnio(items = []) {
  const m = new Map();
  items.forEach(x => { const a = anioDe(x.birthDate); if (a) m.set(a, (m.get(a) || 0) + 1); });
  return [...m.entries()].sort((a, b) => b[0] - a[0]).map(([anio, n]) => ({ anio, n }));
}

/* De dónde llegaron: Instagram, WhatsApp, Recomendación… */
export function porCanal(items = []) {
  const m = new Map();
  items.forEach(x => { const c = x.channel || 'Sin dato'; m.set(c, (m.get(c) || 0) + 1); });
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([canal, n]) => ({ canal, n }));
}

export const PIERNA = { right: 'Derecha', left: 'Izquierda', both: 'Las dos' };
export const DECISIONES = [
  { k: 'invite', t: 'Invitar a prueba', verdict: 'Invitar a prueba', interest: 'alto' },
  { k: 'follow', t: 'Volver a observar', verdict: 'Volver a observar', interest: 'medio' },
  { k: 'reject', t: 'No por ahora', verdict: 'No continuar', interest: 'bajo' }];

export function textoParaCompartir(c = {}) {
  return `${c.title || 'Visoría'}${c.datesLabel ? ` · ${c.datesLabel}` : ''}. Sin costo y con cupo limitado. Inscribe a tu hijo aquí: ${LIGA_PUBLICA}`;
}

/* ---------- Control de acceso (h54) ----------
 * La puerta: sólo pasa AUTORIZADO. El estado lo calcula el servidor; aquí
 * sólo se nombra y se cuenta. */
export const ACCESO = {
  AUTORIZADO: { t: 'Autorizado', tono: 'ok' },
  PENDIENTE: { t: 'Pendiente', tono: 'aviso' },
  REVISION_MEDICA: { t: 'Revisión médica', tono: 'aviso' },
  SIN_CONSENTIMIENTO: { t: 'Sin consentimiento', tono: 'falta' },
  NO_APTO: { t: 'No apto · alerta', tono: 'falta' },
  NO_AUTORIZADO: { t: 'No autorizado', tono: 'falta' }
};
export const ORDEN_ACCESO = ['NO_APTO', 'SIN_CONSENTIMIENTO', 'REVISION_MEDICA', 'PENDIENTE', 'NO_AUTORIZADO', 'AUTORIZADO'];
export const estadoDe = x => x?.access?.status || 'SIN_CONSENTIMIENTO';

export function resumenAcceso(items = []) {
  const r = Object.fromEntries(ORDEN_ACCESO.map(k => [k, 0]));
  items.forEach(x => { const k = estadoDe(x); r[k] = (r[k] || 0) + 1; });
  return r;
}
export function ordenaPorAcceso(items = []) {
  return [...items].sort((a, b) => ORDEN_ACCESO.indexOf(estadoDe(a)) - ORDEN_ACCESO.indexOf(estadoDe(b))
    || `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'es'));
}

export const PARENTESCO = { madre: 'Mamá', padre: 'Papá', tutor_legal: 'Tutor legal', otro: 'Otro', sin_dato: 'Sin dato' };
export const VERIFICACION = { whatsapp_club: 'Por el WhatsApp del club', presencial_identificacion: 'En persona, con identificación' };

/* Lo que Presidencia llena antes de abrir la firma (docs/visorias/01 y 02).
 * Ningún dato legal se inventa: si está vacío, la firma no abre. */
export const CAMPOS_LEGALES = [
  { k: 'organizador_legal', t: 'Organizador jurídico (razón social completa)', ayuda: 'No sólo el nombre comercial.' },
  { k: 'organizador_domicilio', t: 'Domicilio del organizador' },
  { k: 'responsable_conjunto', t: 'Responsable conjunto de los datos', ayuda: 'Si no hay, escribe "No hay responsable conjunto."' },
  { k: 'fecha_horario', t: 'Fecha y horario (inicio y fin)' },
  { k: 'coordinador', t: 'Coordinador responsable y contacto oficial' },
  { k: 'coordinador_emergencias', t: 'Coordinador de emergencias' },
  { k: 'protocolo_emergencia', t: 'Protocolo de emergencia', ayuda: 'Dirección exacta, acceso de ambulancia, 911, hospital de referencia, quién llama y quién acompaña.', largo: true },
  { k: 'privacidad_correo', t: 'Correo de privacidad' },
  { k: 'privacidad_contacto', t: 'Otro medio de contacto' },
  { k: 'arco_medio', t: 'Dónde se piden los derechos ARCO' },
  { k: 'arco_procedimiento', t: 'Procedimiento ARCO (plazos y requisitos)', largo: true },
  { k: 'medios_oficiales', t: 'Medios oficiales donde se publican fotos', ayuda: 'Ej. Instagram @..., Facebook ..., página web.' },
  { k: 'encargados_tecnologicos', t: 'Proveedores tecnológicos que procesan datos', largo: true },
  { k: 'analitica', t: 'Cookies y analítica de la página de visoría', largo: true },
  { k: 'conservacion', t: 'Tabla de conservación aprobada', largo: true },
  { k: 'url_aviso', t: 'Dónde se publican los cambios al aviso' },
  { k: 'grabacion_evaluacion', t: 'Grabación para evaluación (si hay)', ayuda: 'Vacío = no se graba para evaluar.', opcional: true },
  { k: 'evaluador_nombre', t: 'Club evaluador externo (si hay)', ayuda: 'Vacío = no participa ninguno.', opcional: true },
  { k: 'evaluador_contacto', t: 'Contacto del evaluador', opcional: true },
  { k: 'evaluador_datos', t: 'Datos deportivos que recibiría', opcional: true },
  { k: 'evaluador_finalidad', t: 'Para qué los usaría', opcional: true }
];
export const SEGURO = {
  sin_verificar: 'Sin verificar (la firma no abre)',
  sin_seguro_verificado: 'Verificado: el organizador NO da seguro',
  con_seguro_verificado: 'Verificado: SÍ hay seguro (describirlo)'
};
export const APROBACIONES = [
  { k: 'legal', t: 'Legal', ayuda: 'Abogado de Guanajuato revisó consentimiento, aviso, responsable, imagen y transferencias.' },
  { k: 'operativa', t: 'Operativa', ayuda: 'Seguro verificado, cancha inspeccionada, botiquín, personal capacitado, emergencias, entrega y recogida.' },
  { k: 'seguridad', t: 'Seguridad', ayuda: 'Roles revisados, archivos privados, bitácora, conservación y copias.' }
];

/* "campo:organizador_legal" -> "Falta: Organizador jurídico..." */
export function faltante(codigo = '') {
  const [tipo, k] = String(codigo).split(':');
  if (tipo === 'campo') {
    const c = CAMPOS_LEGALES.find(x => x.k === k);
    if (c) return `Falta: ${c.t}`;
    return { sede: 'Falta: la sede', seguro_detalle: 'Falta: describir el seguro', evaluador: 'Falta: datos y finalidad del evaluador' }[k] || `Falta: ${k}`;
  }
  if (tipo === 'seguro') return 'Falta: verificar el estado real del seguro';
  if (tipo === 'aprobacion') return `Falta la aprobación ${({ legal: 'legal', operativa: 'operativa', seguridad: 'de seguridad' })[k] || k}`;
  return codigo;
}
