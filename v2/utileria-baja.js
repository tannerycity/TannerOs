// Dar de baja un artículo de utilería, y por qué no se borra de verdad.
//
// Un artículo con historial —asignaciones a profes, reportes de daño, entregas—
// no se puede borrar sin romper ese historial: los movimientos quedarían
// apuntando a un artículo que ya no existe. Por eso "borrar" aquí es marcarlo
// como dado de baja: desaparece del inventario del día a día, conserva todo lo
// que pasó con él, y se puede revertir.
//
// El estado 'retired' ya existía en la base y el backend ya lo aceptaba; lo que
// faltaba era que la pantalla lo usara.

export const ESTADO_BAJA = 'retired';
export const ESTADO_ACTIVO = 'active';

export function esBaja(item) {
  return String(item?.status || '') === ESTADO_BAJA;
}

export function contarBajas(items) {
  return (items || []).filter(esBaja).length;
}

// Lo que se ve en la tabla. Por omisión los dados de baja no aparecen: ése es
// el punto de darlos de baja.
export function articulosVisibles(items, { verBajas = false, termino = '' } = {}) {
  const t = String(termino || '').trim().toLowerCase();
  return (items || []).filter((i) => {
    if (!verBajas && esBaja(i)) return false;
    if (!t) return true;
    return String(i.name || '').toLowerCase().includes(t)
        || String(i.category || '').toLowerCase().includes(t);
  });
}

export function estadoAlAlternar(item) {
  return esBaja(item) ? ESTADO_ACTIVO : ESTADO_BAJA;
}

export function textoDelBoton(item) {
  return esBaja(item) ? 'Reactivar artículo' : 'Dar de baja';
}

// El estado que viaja al guardar el formulario de edición.
//
// Antes aquí iba 'active' escrito a mano, así que corregirle el nombre a un
// artículo dado de baja lo revivía en silencio y volvía a aparecer en el
// inventario sin que nadie lo pidiera.
export function estadoAlGuardar(itemEnEdicion) {
  if (!itemEnEdicion) return ESTADO_ACTIVO;
  return String(itemEnEdicion.status || ESTADO_ACTIVO);
}

// Un artículo que alguien trae prestado no se da de baja: primero se recupera.
// Si no, el inventario diría que no existe algo que un profe tiene en la mano.
export function puedeDarseDeBaja(item) {
  if (esBaja(item)) return { ok: true };
  const asignado = Number(item?.assigned_quantity || 0);
  if (asignado > 0) {
    return { ok: false, motivo: `Hay ${asignado} en manos de alguien. Registra la devolución antes de darlo de baja.` };
  }
  return { ok: true };
}
