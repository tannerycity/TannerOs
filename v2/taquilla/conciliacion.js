// Validación y conciliación de pagos.
//
// Aquí vive el criterio de lectura: cómo se llama cada estado, qué acciones
// caben y cómo se explica una diferencia. Las transiciones las decide el
// backend; esta pantalla nunca inventa un estado.

export const ESTADOS = {
  pending: { etiqueta: 'Pendiente de conciliación', corto: 'Pendiente', nivel: 'atencion', icono: '•' },
  approved: { etiqueta: 'Conciliado / Aprobado', corto: 'Aprobado', nivel: 'ok', icono: '✓' },
  clarification: { etiqueta: 'Aclaración requerida', corto: 'Aclaración', nivel: 'atencion', icono: '?' },
  rejected: { etiqueta: 'Rechazado', corto: 'Rechazado', nivel: 'bajo', icono: '×' }
};

export function estadoDe(fila) {
  const base = ESTADOS[fila?.status] || { etiqueta: 'Sin estado', corto: '—', nivel: 'neutro', icono: '·' };
  // Un pago anterior a la conciliación quedó en 'approved' con reconciledAt
  // nulo. Presentarlo como "lo revisó Presidencia" sería mentir: nadie lo
  // revisó, es de antes de que existiera el flujo.
  if (fila?.legacyApproved) {
    return { ...base, etiqueta: 'Del sistema anterior', corto: 'Anterior', nivel: 'neutro', icono: '·' };
  }
  return base;
}

// Un pago en efectivo no se concilia contra el banco. Llamarle "conciliación
// bancaria" a un billete confunde a quien hace el corte.
export const VALIDACIONES = {
  banco: { etiqueta: 'Conciliación bancaria', pista: 'Coteja contra el estado de cuenta' },
  corte_de_caja: { etiqueta: 'Validación por corte de caja', pista: 'Coteja contra la entrega de efectivo' },
  otro: { etiqueta: 'Validación según su configuración', pista: '' }
};

export function validacionDe(fila) {
  return VALIDACIONES[fila?.validationKind] || VALIDACIONES.otro;
}

// Qué puede hacer quien está mirando. Sólo Presidencia aprueba; quien
// registró el cobro responde su propia aclaración.
export function accionesPara(fila, ctx = {}) {
  const estado = fila?.status;
  const acciones = [];
  // Un pago del sistema anterior quedó en 'approved' sin que nadie lo
  // revisara. Antes aquí se devolvía la lista vacía y quedaba congelado: 242
  // pagos por $177,522 que el club no podía revisar aunque quisiera, que es
  // justo el doble check que pidió. Ahora se puede, y el botón lo dice con
  // otras palabras: no es aprobar de nuevo, es revisarlo por primera vez.
  if (fila?.legacyApproved) {
    if (ctx.canApprove) {
      acciones.push({ clave: 'approve', etiqueta: 'Revisar y aprobar', tono: 'ok' });
      acciones.push({ clave: 'clarify', etiqueta: 'Solicitar aclaración', tono: 'atencion' });
      acciones.push({ clave: 'reject', etiqueta: 'Rechazar', tono: 'bajo' });
    }
    return acciones;
  }
  if (ctx.canApprove) {
    if (estado === 'pending' || estado === 'clarification') {
      acciones.push({ clave: 'approve', etiqueta: 'Aprobar', tono: 'ok' });
      acciones.push({ clave: 'clarify', etiqueta: 'Solicitar aclaración', tono: 'atencion' });
      acciones.push({ clave: 'reject', etiqueta: 'Rechazar', tono: 'bajo' });
    } else if (estado === 'approved') {
      // Ya aprobado: se puede rechazar si aparece algo después, pero no
      // volver a aprobar. El backend también lo impide.
      acciones.push({ clave: 'reject', etiqueta: 'Rechazar', tono: 'bajo' });
    }
  }
  if (estado === 'clarification' && (ctx.esMio || ctx.canApprove)) {
    acciones.push({ clave: 'resubmit', etiqueta: 'Responder aclaración', tono: 'ok' });
  }
  return acciones;
}

export function requiereMotivo(accion) {
  return accion === 'reject' || accion === 'clarify' || accion === 'resubmit';
}

// La diferencia entre lo que se esperaba y lo que entró. Un faltante y un
// sobrante no son lo mismo y no se pintan igual.
export function diferenciaDe(fila) {
  if (fila?.expectedAmount == null) {
    return { hay: false, monto: 0, nivel: 'neutro', texto: 'Sin monto esperado capturado' };
  }
  const d = Math.round((Number(fila.amount || 0) - Number(fila.expectedAmount)) * 100) / 100;
  if (d === 0) return { hay: false, monto: 0, nivel: 'ok', texto: 'Recibido igual a lo esperado' };
  // El texto NO trae el número: quien pinta lo formatea como moneda. Si lo
  // trajera, la pantalla terminaba diciendo "Faltaron 50 $50.00".
  if (d < 0) return { hay: true, monto: d, nivel: 'bajo', texto: 'Faltaron' };
  return { hay: true, monto: d, nivel: 'atencion', texto: 'Se recibió de más' };
}

const sinAcentos = v => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filtra(filas, f = {}) {
  const texto = sinAcentos(f.texto || '').trim();
  const terminos = texto ? texto.split(/\s+/) : [];
  return (filas || []).filter(fila => {
    // 'legacy' no es un estado de la base: es approved SIN fecha de revision,
    // o sea los que nadie miro nunca. Se filtra aparte porque en la base son
    // indistinguibles de un aprobado de verdad salvo por esa fecha.
    if (f.estado === 'legacy') { if (!fila.legacyApproved) return false; }
    else if (f.estado === 'approved') { if (fila.status !== 'approved' || fila.legacyApproved) return false; }
    else if (f.estado && fila.status !== f.estado) return false;
    if (f.soloConDiferencia && !diferenciaDe(fila).hay) return false;
    if (!terminos.length) return true;
    const heno = sinAcentos([
      fila.playerName, fila.family, fila.concept, fila.reference,
      fila.registeredBy, fila.period, fila.method
    ].filter(Boolean).join(' '));
    return terminos.every(t => heno.includes(t));
  });
}

// El texto del historial. Cada renglón dice quién, cuándo y de qué a qué.
export function lineaDeHistorial(h) {
  const de = ESTADOS[h?.from]?.corto || h?.from || 'nuevo';
  const a = ESTADOS[h?.to]?.corto || h?.to || '—';
  const quien = h?.by || 'Sin nombre';
  const propio = h?.selfApproved ? ' · aprobó su propio cobro' : '';
  return `${de} → ${a} · ${quien}${propio}`;
}

// Cuántas acciones de verdad esperan a Presidencia. Se usa para el aviso de
// la pantalla, y no cuenta los rechazados: ésos ya están resueltos.
export function pendientesReales(resumen) {
  // Los del sistema anterior tambien son trabajo pendiente: 242 pagos que
  // nadie reviso no son "cero por hacer".
  return Number(resumen?.pending || 0)
       + Number(resumen?.clarification || 0)
       + Number(resumen?.legacyApproved || 0);
}

/* ---- Tarjeta visual (26/10/2026) ----
   Presidencia: "que qué día pagó, a qué hora... que sea bien visual. No es un
   sistema que estén viendo una máquina, lo ven humanos". Lo que se pinta en
   palabras de persona: el método en español, el periodo como mes, el día
   con su nombre y la hora a la que se registró el cobro. */
const METODOS = {
  transfer: { t: 'Transferencia', k: 'transfer' }, transferencia: { t: 'Transferencia', k: 'transfer' },
  cash: { t: 'Efectivo', k: 'cash' }, efectivo: { t: 'Efectivo', k: 'cash' },
  card: { t: 'Tarjeta', k: 'card' }, tarjeta: { t: 'Tarjeta', k: 'card' },
};
export function metodoDe(m) {
  return METODOS[sinAcentos(m).trim()] || { t: m && m !== '—' ? String(m) : 'Sin método', k: 'otro' };
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// '2026-10' -> 'octubre 2026'
export function mesDe(periodo) {
  const m = /^(\d{4})-(\d{2})/.exec(String(periodo || ''));
  return m ? `${MESES[Number(m[2]) - 1]} ${m[1]}` : (periodo || '');
}

const fechaLocal = (ymd) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || '')); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12) : null; };
const ymdDe = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// '2026-10-21' -> 'martes 21 oct'
export function fechaCorta(ymd) {
  const d = fechaLocal(ymd);
  return d ? `${DIAS[d.getDay()]} ${d.getDate()} ${MES_CORTO[d.getMonth()]}` : '';
}

/* El encabezado de cada grupo: Hoy, Ayer o el día con su nombre. hoy va en
   'YYYY-MM-DD' (hora de México) para poder probarlo. */
export function diaDe(ymd, hoy) {
  const d = fechaLocal(ymd), h = fechaLocal(hoy);
  if (!d) return 'Sin fecha';
  if (h) {
    const dias = Math.round((h - d) / 86400000);
    if (dias === 0) return 'Hoy';
    if (dias === 1) return 'Ayer';
  }
  const t = fechaCorta(ymd);
  return t.charAt(0).toUpperCase() + t.slice(1) + (h && d.getFullYear() !== h.getFullYear() ? ` ${d.getFullYear()}` : '');
}

// La fecha y la hora en que se registró, en hora de México: '21 oct · 5:15 p.m.'
export function registradoDe(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
    .formatToParts(d).map(x => [x.type, x.value]));
  const hora = `${p.hour}:${p.minute} ${String(p.dayPeriod || '').replace(/\s/g, '').toLowerCase().startsWith('p') ? 'p.m.' : 'a.m.'}`;
  return `${p.day} ${MES_CORTO[Number(p.month) - 1]} · ${hora}`;
}

// Agrupa por el día en que se pagó, lo más nuevo arriba.
export function agrupaPorDia(filas, hoy) {
  const grupos = new Map();
  [...(filas || [])].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .forEach(f => { const k = String(f.date || '').slice(0, 10) || 'sin'; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(f); });
  return [...grupos].map(([k, lista]) => ({ dia: k === 'sin' ? 'Sin fecha' : diaDe(k, hoy), fecha: k, filas: lista,
    total: lista.reduce((s, f) => s + Number(f.amount || 0), 0) }));
}

export function iniciales(nombre) {
  const p = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[1][0] : '')).toUpperCase() || '·';
}
