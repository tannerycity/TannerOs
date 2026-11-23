/* "Mi plan" de la academia: lo que se puede decidir sin servidor ni pantalla.
 * Lo usa v2/admin/suscripcion/app.js y lo prueba scripts/qa-saas-mi-plan.mjs.
 *
 * Reglas que pinta (las decide el servidor; aqui solo se explican):
 *   - Nunca bloquea por cupo: avisa, dice el plan que toca y hasta cuando hay gracia.
 *   - Un plan mas chico que los jugadores activos no se puede elegir; uno mas
 *     grande si. Elite se cotiza.
 *   - Semilla sin complementos no pide tarjeta.
 */
import { pesos, planParaJugadores, cabeEnPlan } from '../../saas/precios.js';

export const ESTADO_TEXTO = {
  free: 'Gratis', pending: 'Pendiente de pago', active: 'Activa', past_due: 'Pago atrasado',
  grace_period: 'En periodo de gracia', cancelled: 'Cancelada', expired: 'Vencida'
};

const fecha = iso => {
  if (!iso) return '';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a}` : '';
};

export function textoSuscripcion(sub) {
  if (!sub) return { tono: 'aviso', titulo: 'Todavía no eliges un plan', detalle: 'Empieza gratis con Semilla 20 si tienes hasta 20 jugadores activos.' };
  const ciclo = sub.ciclo === 'annual' ? 'anual' : 'mensual';
  const estado = ESTADO_TEXTO[sub.estado] || sub.estado;
  if (sub.estado === 'free') return { tono: 'ok', titulo: `${sub.planNombre || sub.plan} · Gratis`, detalle: 'Sin tarjeta y sin fecha de caducidad mientras cumplas el cupo.' };
  const total = `${pesos(sub.total)} ${ciclo === 'anual' ? 'al año' : 'al mes'} con IVA`;
  if (sub.cancelaAlFinal) return { tono: 'aviso', titulo: `${sub.planNombre || sub.plan} · No se renueva`, detalle: `Conservas todo hasta el ${fecha(sub.periodoFin)}. Después sigues con lo básico de Semilla y tus datos.` };
  if (sub.estado === 'past_due') return { tono: 'tarde', titulo: `${sub.planNombre || sub.plan} · ${estado}`, detalle: `Mercado Pago está reintentando el cobro de ${total}. Revisa tu medio de pago.` };
  if (sub.estado === 'grace_period') return { tono: 'tarde', titulo: `${sub.planNombre || sub.plan} · ${estado}`, detalle: `No pudimos cobrar. Conservas todo hasta el ${fecha(sub.graciaHasta)}.` };
  return { tono: 'ok', titulo: `${sub.planNombre || sub.plan} · ${estado}`, detalle: `${total}. Siguiente renovación: ${fecha(sub.periodoFin) || 'al confirmarse el pago'}.` };
}

// Cupo: nunca "bloqueado". Siempre que hacer y para cuando.
export function textoCupo(cupo, catalogo) {
  if (!cupo || cupo.estado === 'sin_plan') return null;
  const nombre = c => catalogo?.planes?.find(p => p.codigo === c)?.nombre || c;
  const dup = cupo.duplicados ? ` Revisa ${cupo.duplicados} posible${cupo.duplicados === 1 ? '' : 's'} duplicado${cupo.duplicados === 1 ? '' : 's'} (mismo nombre y fecha de nacimiento): solo cuentan una vez si los unes.` : '';
  if (cupo.estado === 'ok') return { tono: 'ok', texto: `${cupo.activos} de ${cupo.limite ?? 'sin límite'} jugadores activos.${dup}` };
  if (cupo.estado === 'cerca') return { tono: 'aviso', texto: `${cupo.activos} de ${cupo.limite} jugadores activos: ya casi llegas al límite de tu plan.${dup}` };
  if (cupo.estado === 'excedido') return { tono: 'aviso', texto: `Tienes ${cupo.activos} jugadores activos y tu plan incluye ${cupo.limite}. Te corresponde ${nombre(cupo.requerido)}. No se bloquea nada${cupo.graciaHasta ? `: tienes hasta el ${fecha(cupo.graciaHasta)} para cambiar` : ''}.${dup}` };
  if (cupo.estado === 'gracia_vencida') return { tono: 'tarde', texto: `Tu periodo de gracia terminó: tienes ${cupo.activos} jugadores activos y tu plan incluye ${cupo.limite}. Cambia a ${nombre(cupo.requerido)} para seguir creciendo. Tus datos siguen disponibles.${dup}` };
  return { tono: 'aviso', texto: `Con ${cupo.activos} jugadores activos te conviene una cotización a la medida.${dup}` };
}

// Planes que la academia puede elegir hoy, con el motivo cuando no.
export function opcionesDePlan(catalogo, activos) {
  const requerido = planParaJugadores(catalogo, activos);
  return (catalogo?.planes || []).map(p => {
    if (p.cotizar) return { ...p, elegible: false, motivo: 'Se cotiza con el equipo comercial', recomendado: requerido?.codigo === p.codigo };
    if (!cabeEnPlan(p, activos)) return { ...p, elegible: false, motivo: `Incluye hasta ${p.max} jugadores y tienes ${activos}` };
    return { ...p, elegible: true, motivo: null, recomendado: requerido?.codigo === p.codigo };
  });
}

// Catalogo SAT (los mas comunes para academias). El servidor solo valida el formato.
export const REGIMENES = [
  ['601', 'General de Ley Personas Morales'], ['603', 'Personas Morales con Fines no Lucrativos'],
  ['612', 'Personas Físicas con Actividades Empresariales y Profesionales'], ['626', 'Régimen Simplificado de Confianza'],
  ['621', 'Incorporación Fiscal'], ['605', 'Sueldos y Salarios'], ['616', 'Sin obligaciones fiscales']
];
export const USOS_CFDI = [['G03', 'Gastos en general'], ['S01', 'Sin efectos fiscales'], ['I08', 'Otra maquinaria y equipo']];

export function revisaFiscal(d) {
  const rfc = String(d?.rfc || '').toUpperCase().replace(/\s/g, '');
  if (!/^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/.test(rfc)) return { ok: false, error: 'El RFC no tiene un formato válido (12 o 13 caracteres).' };
  if (String(d?.razonSocial || '').trim().length < 2) return { ok: false, error: 'Escribe el nombre o razón social tal como aparece en tu constancia.' };
  if (!REGIMENES.some(([c]) => c === d?.regimen)) return { ok: false, error: 'Elige tu régimen fiscal.' };
  if (!/^[0-9]{5}$/.test(String(d?.cp || ''))) return { ok: false, error: 'El código postal fiscal lleva 5 dígitos.' };
  if (!USOS_CFDI.some(([c]) => c === d?.usoCfdi)) return { ok: false, error: 'Elige el uso del CFDI.' };
  if (d?.correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.correo)) return { ok: false, error: 'Revisa el correo para recibir facturas.' };
  return { ok: true, datos: { ...d, rfc, razonSocial: String(d.razonSocial).trim() } };
}

// Lo que se le dice antes de autorizar: sin sorpresas.
export function textoConfirmacion(q, { inicia = null } = {}) {
  if (!q?.ok) return null;
  if (!q.requierePago) return 'Activar Semilla 20 no pide tarjeta ni tiene costo.';
  const cada = q.ciclo === 'annual' ? 'cada año, por adelantado' : 'cada mes';
  return `Autorizarás en Mercado Pago un cobro de ${pesos(q.total)} (IVA incluido) ${cada}. ` +
    (inicia ? `Empieza el ${fecha(inicia)}, cuando termine lo que ya pagaste. ` : '') +
    'Puedes cancelar la renovación cuando quieras y conservas el acceso hasta el fin del periodo pagado.';
}
