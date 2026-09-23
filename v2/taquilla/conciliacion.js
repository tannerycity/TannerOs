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
  if (fila?.legacyApproved) return acciones;
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
    if (f.estado && fila.status !== f.estado) return false;
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
  return Number(resumen?.pending || 0) + Number(resumen?.clarification || 0);
}
