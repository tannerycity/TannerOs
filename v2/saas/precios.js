/* MOTOR DE PRECIOS DE MI CLUB FC (sistema comercial SaaS v1, 23/11/2026).
 *
 * Funciones puras: no hablan con el servidor ni guardan nada. Las usan la
 * pagina de precios, el resumen antes de pagar y el portal de la plataforma
 * para PINTAR. Quien decide lo que se cobra es el servidor
 * (private.saas_quote en supabase/pendientes/saas_comercial_v1.sql), que
 * aplica exactamente las mismas reglas; scripts/qa-saas-precios.mjs fija los
 * mismos casos para los dos.
 *
 * Reglas de dinero:
 *   - Todo va en CENTAVOS enteros. Nunca se multiplica un precio en pesos por
 *     un decimal: 299 * 0.16 en punto flotante no es 47.84.
 *   - Porcentajes en puntos base (bp): 1600 = 16 %, 1000 = 10 %.
 *   - Un solo redondeo por concepto, "mitad hacia arriba", y se dice cual:
 *       anual de una linea = redondea(mensual * 12 * (10000 - desc) / 10000)
 *       IVA                = redondea(base * iva / 10000), una vez, sobre la base total
 *   - Los precios son antes de IVA. El IVA se suma y se muestra aparte.
 *
 * El catalogo llega como dato (version del servidor). Forma:
 *   { version, moneda:'MXN', ivaBp, descuentoAnualBp, diasGracia,
 *     planes:[{codigo, nombre, min, max|null, mensual|null (centavos), cotizar}],
 *     complementos:[{codigo, nombre, mensual (centavos), paquete:[codigos]|null, vendible}] }
 */

export const ESTADOS_SUSCRIPCION = ['free', 'pending', 'active', 'past_due', 'grace_period', 'cancelled', 'expired'];

// Division entera con redondeo "mitad hacia arriba" para cantidades >= 0.
export function redondea(numerador, denominador) {
  if (!Number.isSafeInteger(numerador) || !Number.isSafeInteger(denominador) || denominador <= 0 || numerador < 0) {
    throw new Error('redondea: sólo enteros no negativos');
  }
  return Math.floor((2 * numerador + denominador) / (2 * denominador));
}

export function anualDesdeMensual(mensualCentavos, descuentoBp) {
  return redondea(mensualCentavos * 12 * (10000 - descuentoBp), 10000);
}

export function ivaDe(baseCentavos, ivaBp) {
  return redondea(baseCentavos * ivaBp, 10000);
}

export function pesos(centavos, { decimales = true } = {}) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: 'MXN',
    minimumFractionDigits: decimales ? 2 : 0, maximumFractionDigits: decimales ? 2 : 0
  }).format(Number(centavos || 0) / 100);
}

// --- Jugadores activos ---------------------------------------------------
// El cupo se cuenta por PERSONA, no por equipo: un jugador en dos categorias
// es una sola fila de jugador. Inactivos, egresados y archivados no cuentan.
export function esActivo(j) {
  return j && j.status === 'active' && !j.archived_at && !j.archivedAt;
}

export function cuentaJugadoresActivos(jugadores) {
  const ids = new Set();
  for (const j of jugadores || []) if (esActivo(j)) ids.add(String(j.id));
  return ids.size;
}

const normaliza = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// Mismo nombre completo y misma fecha de nacimiento dentro de la academia:
// probable duplicado (por error o para no pasar del cupo). No se borra ni se
// bloquea nada: se pone a la vista para que alguien lo revise.
export function posiblesDuplicados(jugadores) {
  const grupos = new Map();
  for (const j of jugadores || []) {
    if (!esActivo(j)) continue;
    const nac = j.birth_date || j.birthDate || '';
    if (!nac) continue;
    const k = `${normaliza(j.first_name ?? j.firstName)}|${normaliza(j.last_name ?? j.lastName)}|${nac}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(String(j.id));
  }
  return [...grupos.values()].filter(g => g.length > 1);
}

// --- Plan por capacidad --------------------------------------------------
export function planesOrdenados(catalogo) {
  return [...(catalogo?.planes || [])].sort((a, b) => a.min - b.min);
}

export function planParaJugadores(catalogo, activos) {
  const n = Math.max(0, Number(activos) || 0);
  return planesOrdenados(catalogo).find(p => n >= p.min && (p.max == null || n <= p.max))
    // 0 jugadores: el plan mas chico.
    || (n === 0 ? planesOrdenados(catalogo)[0] : null);
}

export function cabeEnPlan(plan, activos) {
  return Boolean(plan) && (plan.max == null || Number(activos) <= plan.max);
}

// Estado del cupo de una academia. Nunca bloquea: avisa y cuenta la gracia.
//   ok | cerca (>= 90 %) | excedido (dentro de la gracia) | gracia_vencida | cotizar
export function evaluaCapacidad(catalogo, codigoPlan, activos, { excedidoDesde = null, hoy = null, diasGracia = null } = {}) {
  const plan = (catalogo?.planes || []).find(p => p.codigo === codigoPlan);
  const requerido = planParaJugadores(catalogo, activos);
  const dias = diasGracia ?? catalogo?.diasGracia ?? 15;
  if (!plan) return { estado: 'sin_plan', requerido: requerido?.codigo || null };
  if (cabeEnPlan(plan, activos)) {
    const cerca = plan.max != null && activos >= Math.ceil(plan.max * 0.9);
    return { estado: cerca ? 'cerca' : 'ok', limite: plan.max, activos, requerido: plan.codigo, libres: plan.max == null ? null : plan.max - activos };
  }
  const base = { limite: plan.max, activos, requerido: requerido?.codigo || null, exceso: activos - plan.max };
  if (requerido?.cotizar) return { ...base, estado: 'cotizar' };
  const desde = excedidoDesde ? new Date(`${String(excedidoDesde).slice(0, 10)}T00:00:00Z`) : null;
  const ahora = hoy ? new Date(`${String(hoy).slice(0, 10)}T00:00:00Z`) : new Date();
  const graciaHasta = desde ? new Date(desde.getTime() + dias * 86400000) : null;
  const vencida = graciaHasta ? ahora > graciaHasta : false;
  return { ...base, estado: vencida ? 'gracia_vencida' : 'excedido', diasGracia: dias,
    graciaHasta: graciaHasta ? graciaHasta.toISOString().slice(0, 10) : null };
}

// --- Cotizacion ----------------------------------------------------------
// Devuelve {ok:false, codigo, error} o el desglose. El navegador NUNCA manda
// montos: manda codigos, y el servidor vuelve a cotizar con su catalogo.
// Orden de descuentos (el mismo en el servidor): anual por linea -> cupon ->
// beca de software (otorgada por la plataforma con motivo y periodo).
export function cotiza(catalogo, { plan: codigoPlan, ciclo = 'monthly', complementos = [], activos = 0, cupon = null, becaBp = 0 } = {}) {
  const falla = (codigo, error) => ({ ok: false, codigo, error });
  if (!['monthly', 'annual'].includes(ciclo)) return falla('CICLO', 'El ciclo es mensual o anual.');
  const plan = (catalogo?.planes || []).find(p => p.codigo === codigoPlan);
  if (!plan) return falla('PLAN', 'Ese plan no existe en el catálogo.');
  if (plan.cotizar || plan.mensual == null) return falla('COTIZACION', `${plan.nombre} se cotiza con el equipo comercial.`);
  if (!cabeEnPlan(plan, activos)) {
    const req = planParaJugadores(catalogo, activos);
    return falla('CAPACIDAD', `Con ${activos} jugadores activos te corresponde ${req ? req.nombre : 'un plan mayor'}.`);
  }
  const ivaBp = catalogo.ivaBp, descBp = catalogo.descuentoAnualBp;
  const meses = ciclo === 'annual' ? 12 : 1;
  const porCodigo = new Map((catalogo.complementos || []).map(c => [c.codigo, c]));
  const pedidos = [...new Set((complementos || []).map(String))];
  for (const c of pedidos) {
    const x = porCodigo.get(c);
    if (!x) return falla('COMPLEMENTO', `No existe el complemento ${c}.`);
    if (!x.vendible) return falla('NO_DISPONIBLE', `${x.nombre} todavía no está disponible.`);
  }
  // Lo que ya cubre un paquete elegido no se cobra suelto.
  const cubiertoPor = new Map();
  for (const c of pedidos) for (const comp of porCodigo.get(c).paquete || []) cubiertoPor.set(comp, c);

  const linea = (tipo, codigo, nombre, mensual, cubierto = null) => {
    const bruto = cubierto ? 0 : mensual * meses;
    const neto = cubierto ? 0 : (ciclo === 'annual' ? anualDesdeMensual(mensual, descBp) : mensual);
    return { tipo, codigo, nombre, mensual, bruto, descuento: bruto - neto, neto, cubiertoPor: cubierto };
  };
  const lineas = [linea('plan', plan.codigo, plan.nombre, plan.mensual)];
  for (const c of pedidos) { const x = porCodigo.get(c); lineas.push(linea(x.paquete ? 'paquete' : 'complemento', x.codigo, x.nombre, x.mensual, cubiertoPor.get(c) || null)); }

  const subtotal = lineas.reduce((s, l) => s + l.bruto, 0);
  const descuentoAnual = lineas.reduce((s, l) => s + l.descuento, 0);
  let base = subtotal - descuentoAnual;
  let descuentoCupon = 0;
  if (cupon) {
    const bp = Number(cupon.porcentajeBp) || 0;
    if (!Number.isInteger(bp) || bp <= 0 || bp > 10000) return falla('CUPON', 'Cupón inválido.');
    const aplicable = lineas.filter(l => cupon.aplicaA === 'plan' ? l.tipo === 'plan' : cupon.aplicaA === 'complementos' ? l.tipo !== 'plan' : true)
      .reduce((s, l) => s + l.neto, 0);
    descuentoCupon = redondea(aplicable * bp, 10000);
    base -= descuentoCupon;
  }
  const beca = Number(becaBp) || 0;
  if (!Number.isInteger(beca) || beca < 0 || beca > 10000) return falla('BECA', 'Beca inválida.');
  const descuentoBeca = redondea(base * beca, 10000);
  base -= descuentoBeca;
  const iva = ivaDe(base, ivaBp);
  const sugerencias = [];
  for (const p of catalogo.complementos || []) {
    if (!p.paquete || !p.vendible || pedidos.includes(p.codigo)) continue;
    const sueltos = p.paquete.filter(c => pedidos.includes(c));
    const sumaSueltos = sueltos.reduce((s, c) => s + (porCodigo.get(c)?.mensual || 0), 0);
    if (sueltos.length >= 2 && sumaSueltos > p.mensual) sugerencias.push({ paquete: p.codigo, ahorroMensual: sumaSueltos - p.mensual });
  }
  return {
    ok: true, version: catalogo.version, plan: plan.codigo, ciclo, meses, moneda: catalogo.moneda || 'MXN',
    lineas, subtotal, descuentoAnual, descuentoCupon, descuentoBeca, base, ivaBp, iva, total: base + iva,
    requierePago: base + iva > 0, sugerencias
  };
}

// Ingreso recurrente mensual de una suscripcion, SIN IVA: lo anual se reparte
// entre 12. Cancelada, vencida, pendiente o gratis no suma.
export function mrrDe(sub) {
  if (!sub || !['active', 'past_due', 'grace_period'].includes(sub.status)) return 0;
  const base = Number(sub.baseCentavos ?? sub.base_cents ?? 0);
  return sub.ciclo === 'annual' || sub.billing_cycle === 'annual' ? redondea(base, 12) : base;
}

export function metricasSaaS(subs) {
  const mrr = (subs || []).reduce((s, x) => s + mrrDe(x), 0);
  return { mrr, arr: mrr * 12 };
}
