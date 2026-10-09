// Estadisticas de asistencia: lo que se puede probar sin navegador.
//
// Aqui vive el criterio, no el pintado. Las tres cubetas (asistio / falta /
// sin marcar) salen del RPC v2_attendance_stats; este archivo decide como se
// leen y de que color se ven.

export const META_ORDINARIA = 80;
export const META_BECADO = 90;

// Debajo de la meta es rojo. Los 10 puntos antes de la meta son el amarillo:
// todavia no incumple, pero si sigue asi el mes que entra si.
export const MARGEN_ATENCION = 10;

export function metaDe(becado) {
  return becado ? META_BECADO : META_ORDINARIA;
}

// El color nunca va solo: cada estado trae etiqueta e icono, porque un papa
// daltonico o una captura de pantalla en blanco y negro tienen que entenderse
// igual.
export function estadoDeAsistencia(pct, meta = META_ORDINARIA) {
  if (pct === null || pct === undefined || Number.isNaN(Number(pct))) {
    return { nivel: 'sindato', etiqueta: 'Sin datos', icono: '–', texto: 'Aún no hay listas marcadas' };
  }
  const valor = Number(pct);
  if (valor >= meta) {
    return { nivel: 'ok', etiqueta: 'En objetivo', icono: '✓', texto: `Cumple la meta de ${meta}%` };
  }
  if (valor >= meta - MARGEN_ATENCION) {
    return { nivel: 'atencion', etiqueta: 'Atención', icono: '!', texto: `Le faltan ${redondea(meta - valor)} puntos para la meta` };
  }
  return { nivel: 'bajo', etiqueta: 'Debajo del objetivo', icono: '×', texto: `${redondea(meta - valor)} puntos debajo de la meta de ${meta}%` };
}

function redondea(n) {
  return Math.round(Number(n) * 10) / 10;
}

// El porcentaje se calcula SOLO sobre lo marcado. Medido en produccion, el
// 40% de los pares (sesion x Tanner inscrito) no tiene registro: si esos
// contaran como falta, le colgariamos ausencias a quien quiza si fue.
export function porcentaje(asistencias, marcadas) {
  const m = Number(marcadas || 0);
  if (!m) return null;
  return redondea((Number(asistencias || 0) / m) * 100);
}

// Que tanto se puede creer ese porcentaje. Es la otra mitad del dato: un 100%
// sacado de 2 de 10 entrenamientos no es un 100%.
export function confianza(marcadas, programadas) {
  const p = Number(programadas || 0);
  if (!p) return { nivel: 'sindato', cobertura: null, texto: 'Sin entrenamientos en el periodo' };
  const cobertura = redondea((Number(marcadas || 0) / p) * 100);
  if (cobertura >= 90) return { nivel: 'ok', cobertura, texto: 'Listas casi completas' };
  if (cobertura >= 60) return { nivel: 'atencion', cobertura, texto: `Faltan listas por cerrar (${cobertura}% marcado)` };
  return { nivel: 'bajo', cobertura, texto: `Solo ${cobertura}% de las listas está marcado` };
}

export function tendencia(pctActual, pctAnterior) {
  if (pctActual === null || pctActual === undefined || pctAnterior === null || pctAnterior === undefined) {
    return { direccion: 'nueva', delta: null, icono: '•', texto: 'Sin periodo anterior para comparar' };
  }
  const delta = redondea(Number(pctActual) - Number(pctAnterior));
  // Menos de un punto de diferencia no es una tendencia, es ruido.
  if (Math.abs(delta) < 1) return { direccion: 'igual', delta, icono: '=', texto: 'Igual que el periodo anterior' };
  if (delta > 0) return { direccion: 'sube', delta, icono: '↑', texto: `${delta} puntos mejor que el periodo anterior` };
  return { direccion: 'baja', delta, icono: '↓', texto: `${Math.abs(delta)} puntos peor que el periodo anterior` };
}

// Rangos de fecha. Se trabaja en horario local y se devuelve YYYY-MM-DD, que
// es lo que espera el RPC.
export function iso(fecha) {
  const d = new Date(fecha);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

export const PERIODOS = [
  { clave: 'semana', etiqueta: 'Semana' },
  { clave: 'mes', etiqueta: 'Mes' },
  { clave: 'mesPasado', etiqueta: 'Mes pasado' },
  { clave: 'trimestre', etiqueta: '3 meses' }
];

// La semana arranca en lunes: es como se planea el entrenamiento, no como lo
// numera JavaScript (que arranca en domingo).
export function rangoDe(clave, hoy = new Date()) {
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  if (clave === 'semana') {
    const dow = (base.getDay() + 6) % 7;
    const lunes = new Date(base); lunes.setDate(base.getDate() - dow);
    const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
    return { desde: iso(lunes), hasta: iso(domingo), etiqueta: 'Esta semana' };
  }
  if (clave === 'mesPasado') {
    const ini = new Date(base.getFullYear(), base.getMonth() - 1, 1);
    const fin = new Date(base.getFullYear(), base.getMonth(), 0);
    return { desde: iso(ini), hasta: iso(fin), etiqueta: nombreMes(ini) };
  }
  if (clave === 'trimestre') {
    const ini = new Date(base.getFullYear(), base.getMonth() - 2, 1);
    const fin = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    return { desde: iso(ini), hasta: iso(fin), etiqueta: 'Últimos 3 meses' };
  }
  const ini = new Date(base.getFullYear(), base.getMonth(), 1);
  const fin = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  return { desde: iso(ini), hasta: iso(fin), etiqueta: nombreMes(ini) };
}

function nombreMes(d) {
  const nombre = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(d);
  return nombre.charAt(0).toUpperCase() + nombre.slice(1);
}

export const ETIQUETA_ESTADO = {
  present: { texto: 'Presente', icono: '✓', nivel: 'ok' },
  late: { texto: 'Llegó tarde', icono: '＋', nivel: 'atencion' },
  excused: { texto: 'Falta justificada', icono: '–', nivel: 'atencion' },
  absent: { texto: 'Falta', icono: '×', nivel: 'bajo' }
};

export function etiquetaDeEstado(estado) {
  return ETIQUETA_ESTADO[estado] || { texto: 'Sin marcar', icono: '·', nivel: 'sindato' };
}

// Una justificada sigue siendo ausencia. Se cuenta como falta Y se identifica
// aparte, que es exactamente lo que pide la regla del club.
export function desgloseDeFaltas(resumen) {
  const faltas = Number(resumen?.absences || 0);
  const justificadas = Number(resumen?.excused || 0);
  return {
    faltas,
    justificadas,
    sinJustificar: Math.max(0, faltas - justificadas)
  };
}

// Cuando un contador vale cero hay que distinguir "no pasó" de "nadie lo
// registra". Los retardos y las justificadas existen en la base desde el
// principio y nadie los ha usado nunca: poner un 0 pelón haría parecer que la
// función no sirve.
export function textoDeContadorOpcional(valor, marcadas, nombrePlural) {
  const n = Number(valor || 0);
  if (n > 0) return String(n);
  if (!Number(marcadas || 0)) return '—';
  return `0 · aún no se registran ${nombrePlural}`;
}

// === Tablero de Presidencia (09/10/2026) ===

// Las barras de "asistencia por semana". Se calcula aquí, sin DOM, para
// poder probar la geometría: una semana con entrenamientos pero sin una sola
// lista NO es una semana con 0% (sería mentira); se pinta aparte.
export function barrasDeSemanas(semanas, { ancho = 320, alto = 132, meta = META_ORDINARIA } = {}) {
  const lista = Array.isArray(semanas) ? semanas : [];
  const n = Math.max(lista.length, 1);
  const paso = ancho / n;
  const w = Math.max(6, Math.min(26, paso * 0.56));
  const y = pct => alto - (Math.max(0, Math.min(100, Number(pct))) / 100) * alto;
  const barras = lista.map((s, i) => {
    const x = i * paso + (paso - w) / 2;
    const tienePct = s?.pct !== null && s?.pct !== undefined;
    const estado = tienePct ? 'dato' : (Number(s?.sessions || 0) > 0 ? 'sinlista' : 'vacia');
    const top = tienePct ? y(s.pct) : alto;
    return {
      x: redondea(x), w: redondea(w), y: redondea(top), h: redondea(alto - top),
      cx: redondea(x + w / 2), pct: tienePct ? Number(s.pct) : null, estado,
      bajoMeta: tienePct && Number(s.pct) < meta,
      semana: s?.week || null, sesiones: Number(s?.sessions || 0), pasadas: Number(s?.taken || 0)
    };
  });
  return { barras, yMeta: redondea(y(meta)), alto, ancho };
}

export function etiquetaDeSemana(iso) {
  if (!iso) return '';
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(d).replace('.', '');
}

// "Hace cuánto vino" para la racha de faltas. Sin fecha = no ha venido en
// toda la ventana que se revisa (60 días).
export function textoUltimaVez(iso, hoy = new Date()) {
  if (!iso) return 'No ha venido en los últimos 60 días';
  const d = new Date(iso);
  const dias = Math.max(0, Math.round((new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000));
  if (dias === 0) return 'Vino hoy';
  if (dias === 1) return 'Vino ayer';
  return `Vino por última vez hace ${dias} días`;
}

// Qué tan bien se están pasando las listas: el porcentaje sólo vale si las
// listas se pasan.
export function coberturaDeListas(pasadas, sesiones) {
  const s = Number(sesiones || 0), p = Number(pasadas || 0);
  if (!s) return { nivel: 'sindato', pct: null, texto: 'Sin entrenamientos' };
  const pct = Math.round((p / s) * 100);
  if (p === s) return { nivel: 'ok', pct, texto: `${p} de ${s} listas pasadas` };
  if (pct >= 75) return { nivel: 'atencion', pct, texto: `${p} de ${s} listas pasadas` };
  return { nivel: 'bajo', pct, texto: `${p} de ${s} listas pasadas` };
}
