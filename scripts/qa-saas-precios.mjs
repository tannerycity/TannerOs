/* QA del motor de precios de Mi Club FC (v2/saas/precios.js).
 *
 * Casos TC-001 a TC-012, TC-018 y TC-019 del plan de QA comercial
 * (docs/saas-comercial/03-plan-qa.md), mas fronteras y redondeo.
 *
 * CAJA NEGRA: particion de equivalencia y valores frontera en cada cambio de
 * plan (20/21, 50/51, 100/101, 250/251). CAJA BLANCA: cada rama de cotiza()
 * (ciclo, plan, cotizacion, capacidad, complemento, no disponible, cupon).
 *
 * El catalogo (saas-catalogo-v1.fixture.mjs) es el mismo que siembra
 * supabase/pendientes/saas_comercial_v1.sql.
 */
import {
  redondea, anualDesdeMensual, ivaDe, cuentaJugadoresActivos, posiblesDuplicados,
  planParaJugadores, evaluaCapacidad, cotiza, mrrDe, metricasSaaS, pesos
} from '../v2/saas/precios.js';

import { CATALOGO_V1 } from './saas-catalogo-v1.fixture.mjs';

let fallos = 0, corridas = 0;
const revisa = (n, ok, d) => { corridas++; if (!ok) { fallos++; console.error(` - ${n}${d !== undefined ? `\n   ${JSON.stringify(d)}` : ''}`); } };
const igual = (n, real, esperado) => revisa(`${n}: esperado ${JSON.stringify(esperado)}`, JSON.stringify(real) === JSON.stringify(esperado), real);
const planDe = n => planParaJugadores(CATALOGO_V1, n)?.codigo;

// ── Redondeo y aritmetica en centavos ─────────────────────────────────────
igual('redondea 0.5 hacia arriba', redondea(5, 10), 1);
igual('redondea 0.4 hacia abajo', redondea(4, 10), 0);
igual('redondea exacto', redondea(4784, 1), 4784);
revisa('redondea rechaza flotantes', (() => { try { redondea(1.5, 1); return false; } catch { return true; } })());
revisa('redondea rechaza negativos', (() => { try { redondea(-1, 1); return false; } catch { return true; } })());
igual('punto flotante: 299*0.16 no se usa', ivaDe(29900, 1600), 4784);

// ── TC-001..009: plan por jugadores activos (fronteras) ───────────────────
igual('TC-001 1 jugador -> Semilla', planDe(1), 'SEMILLA_20');
igual('frontera 0 jugadores -> Semilla', planDe(0), 'SEMILLA_20');
igual('TC-002 20 jugadores -> Semilla', planDe(20), 'SEMILLA_20');
igual('TC-003 21 jugadores -> Formativo', planDe(21), 'FORMATIVO');
igual('TC-004 50 -> Formativo', planDe(50), 'FORMATIVO');
igual('TC-005 51 -> Ascenso', planDe(51), 'ASCENSO');
igual('TC-006 100 -> Ascenso', planDe(100), 'ASCENSO');
igual('TC-007 101 -> Primera', planDe(101), 'PRIMERA');
igual('TC-008 250 -> Primera', planDe(250), 'PRIMERA');
igual('TC-009 251 -> Élite', planDe(251), 'ELITE');
igual('Élite sin tope (5000)', planDe(5000), 'ELITE');

// TC-003: con 21 en Semilla hay aviso (no bloqueo) y gracia de 15 dias.
{
  const c = evaluaCapacidad(CATALOGO_V1, 'SEMILLA_20', 21, { excedidoDesde: '2026-12-01', hoy: '2026-12-05' });
  igual('TC-003 aviso: estado excedido', c.estado, 'excedido');
  igual('TC-003 aviso: plan requerido', c.requerido, 'FORMATIVO');
  igual('TC-003 aviso: gracia hasta', c.graciaHasta, '2026-12-16');
  const fin = evaluaCapacidad(CATALOGO_V1, 'SEMILLA_20', 21, { excedidoDesde: '2026-12-01', hoy: '2026-12-16' });
  igual('gracia: el dia 15 todavia es gracia', fin.estado, 'excedido');
  const venc = evaluaCapacidad(CATALOGO_V1, 'SEMILLA_20', 21, { excedidoDesde: '2026-12-01', hoy: '2026-12-17' });
  igual('gracia: el dia 16 ya vencio', venc.estado, 'gracia_vencida');
  igual('gracia configurable (30 dias)', evaluaCapacidad(CATALOGO_V1, 'SEMILLA_20', 21, { excedidoDesde: '2026-12-01', hoy: '2026-12-20', diasGracia: 30 }).estado, 'excedido');
  igual('20 en Semilla: cerca del limite', evaluaCapacidad(CATALOGO_V1, 'SEMILLA_20', 18).estado, 'cerca');
  igual('10 en Semilla: ok', evaluaCapacidad(CATALOGO_V1, 'SEMILLA_20', 10).estado, 'ok');
  igual('TC-009 Primera con 251: cotizar', evaluaCapacidad(CATALOGO_V1, 'PRIMERA', 251).estado, 'cotizar');
}

// ── TC-010: Semilla compra complemento sin plan de pago ───────────────────
{
  const q = cotiza(CATALOGO_V1, { plan: 'SEMILLA_20', complementos: ['STORE'], activos: 12 });
  revisa('TC-010 Semilla + Tienda se puede', q.ok, q);
  igual('TC-010 base = solo el complemento', q.base, 14900);
  igual('TC-010 IVA del complemento', q.iva, 2384);
  igual('TC-010 total', q.total, 17284);
  const solo = cotiza(CATALOGO_V1, { plan: 'SEMILLA_20', activos: 20 });
  igual('Semilla sola: total 0', solo.total, 0);
  igual('Semilla sola: no pide pago (sin tarjeta)', solo.requierePago, false);
  const pasado = cotiza(CATALOGO_V1, { plan: 'SEMILLA_20', activos: 21 });
  igual('Semilla con 21: no se puede contratar', pasado.codigo, 'CAPACIDAD');
}

// ── TC-011: descuento anual exactamente 10 % ──────────────────────────────
igual('TC-011 Formativo anual', anualDesdeMensual(29900, 1000), 322920);
igual('TC-011 Ascenso anual', anualDesdeMensual(59900, 1000), 646920);
igual('TC-011 Primera anual', anualDesdeMensual(99900, 1000), 1078920);
igual('TC-011 Pack anual', anualDesdeMensual(34900, 1000), 376920);
{
  const q = cotiza(CATALOGO_V1, { plan: 'FORMATIVO', ciclo: 'annual', activos: 30 });
  igual('TC-011 subtotal = 12 meses', q.subtotal, 358800);
  igual('TC-011 descuento = 10 % del subtotal', q.descuentoAnual * 10, q.subtotal);
  igual('TC-011 base anual', q.base, 322920);
}

// ── TC-012: IVA calculado y mostrado ──────────────────────────────────────
{
  const q = cotiza(CATALOGO_V1, { plan: 'FORMATIVO', activos: 30 });
  igual('TC-012 IVA Formativo mensual', q.iva, 4784);
  igual('TC-012 total Formativo mensual', q.total, 34684);
  igual('TC-012 texto', pesos(q.total), '$346.84');
  const a = cotiza(CATALOGO_V1, { plan: 'PRIMERA', ciclo: 'annual', activos: 120, complementos: ['SCOUTING'] });
  // 1,078,920 + 214,920 = 1,293,840; IVA 207,014.4 -> 207,014
  igual('TC-012 IVA anual con complemento (redondeo)', a.iva, 207014);
  igual('TC-012 total anual', a.total, 1293840 + 207014);
  const iva8 = cotiza({ ...CATALOGO_V1, ivaBp: 800 }, { plan: 'FORMATIVO', activos: 30 });
  igual('IVA configurable (8 %)', iva8.iva, 2392);
}

// ── Paquetes: no se cobra dos veces ───────────────────────────────────────
{
  const q = cotiza(CATALOGO_V1, { plan: 'ASCENSO', activos: 60, complementos: ['PACK_CRECIMIENTO', 'SPONSORS'] });
  const sp = q.lineas.find(l => l.codigo === 'SPONSORS');
  igual('Patrocinios dentro del pack: $0', sp.neto, 0);
  igual('Patrocinios dice quien lo cubre', sp.cubiertoPor, 'PACK_CRECIMIENTO');
  igual('base = Ascenso + pack', q.base, 59900 + 34900);
  const dup = cotiza(CATALOGO_V1, { plan: 'ASCENSO', activos: 60, complementos: ['STORE', 'STORE'] });
  igual('complemento repetido cuenta una vez', dup.base, 59900 + 14900);
  const sug = cotiza(CATALOGO_V1, { plan: 'ASCENSO', activos: 60, complementos: ['SPONSORS', 'MARKETING', 'ANALYTICS'] });
  igual('sugiere el pack pero NO lo aplica solo', [sug.base, sug.sugerencias[0]?.paquete, sug.sugerencias[0]?.ahorroMensual], [59900 + 44700, 'PACK_CRECIMIENTO', 9800]);
}

// ── Ramas de error ────────────────────────────────────────────────────────
igual('ciclo invalido', cotiza(CATALOGO_V1, { plan: 'FORMATIVO', ciclo: 'semanal', activos: 30 }).codigo, 'CICLO');
igual('plan inexistente', cotiza(CATALOGO_V1, { plan: 'ORO', activos: 30 }).codigo, 'PLAN');
igual('Élite se cotiza', cotiza(CATALOGO_V1, { plan: 'ELITE', activos: 300 }).codigo, 'COTIZACION');
igual('plan chico para la academia', cotiza(CATALOGO_V1, { plan: 'FORMATIVO', activos: 51 }).codigo, 'CAPACIDAD');
revisa('plan mayor al necesario se permite', cotiza(CATALOGO_V1, { plan: 'PRIMERA', activos: 30 }).ok);
igual('complemento inexistente', cotiza(CATALOGO_V1, { plan: 'FORMATIVO', activos: 30, complementos: ['X'] }).codigo, 'COMPLEMENTO');
igual('complemento no vendible (incompleto)', cotiza(CATALOGO_V1, { plan: 'FORMATIVO', activos: 30, complementos: ['MESSAGING'] }).codigo, 'NO_DISPONIBLE');
igual('cupon invalido', cotiza(CATALOGO_V1, { plan: 'FORMATIVO', activos: 30, cupon: { porcentajeBp: 20000 } }).codigo, 'CUPON');
{
  const q = cotiza(CATALOGO_V1, { plan: 'FORMATIVO', activos: 30, complementos: ['STORE'], cupon: { porcentajeBp: 5000, aplicaA: 'plan' } });
  igual('cupon 50 % solo al plan', [q.descuentoCupon, q.base], [14950, 14950 + 14900]);
}

{
  const q = cotiza(CATALOGO_V1, { plan: 'ASCENSO', activos: 60, becaBp: 10000 });
  igual('beca de software 100 %: total 0', [q.descuentoBeca, q.total, q.requierePago], [59900, 0, false]);
  const m = cotiza(CATALOGO_V1, { plan: 'FORMATIVO', activos: 30, cupon: { porcentajeBp: 1000 }, becaBp: 5000 });
  // 29,900 -> cupon 10 % = 2,990 -> 26,910 -> beca 50 % = 13,455 -> 13,455
  igual('orden cupon -> beca', [m.descuentoCupon, m.descuentoBeca, m.base], [2990, 13455, 13455]);
  igual('beca invalida', cotiza(CATALOGO_V1, { plan: 'FORMATIVO', activos: 30, becaBp: -1 }).codigo, 'BECA');
}

// ── TC-018: la cotizacion guardada no cambia si cambia el catalogo ─────────
{
  const antes = cotiza(CATALOGO_V1, { plan: 'FORMATIVO', activos: 30 });
  const congelada = JSON.parse(JSON.stringify(antes));
  const v2 = { ...CATALOGO_V1, version: 2, planes: CATALOGO_V1.planes.map(p => p.codigo === 'FORMATIVO' ? { ...p, mensual: 34900 } : p) };
  const despues = cotiza(v2, { plan: 'FORMATIVO', activos: 30 });
  igual('TC-018 el catalogo nuevo cobra distinto', despues.base, 34900);
  igual('TC-018 la cotizacion vieja conserva su importe y version', [antes.base, antes.version], [congelada.base, 1]);
  revisa('TC-018 el catalogo original no se muta', CATALOGO_V1.planes[1].mensual === 29900);
}

// ── TC-019: un jugador en dos categorias cuenta una vez ───────────────────
{
  const jugadores = [
    { id: 'a', status: 'active', first_name: 'Ana', last_name: 'Lopez', birth_date: '2015-01-01' },
    { id: 'a', status: 'active' }, // la misma persona vista desde otra categoria
    { id: 'b', status: 'active', first_name: 'Beto', last_name: 'Ruiz', birth_date: '2014-02-02' },
    { id: 'c', status: 'inactive' },
    { id: 'd', status: 'withdrawn' },
    { id: 'e', status: 'active', archived_at: '2026-01-01' },
    { id: 'f', status: 'active', first_name: 'ANA ', last_name: 'López', birth_date: '2015-01-01' }
  ];
  igual('TC-019 activos unicos', cuentaJugadoresActivos(jugadores), 3);
  igual('duplicado intencional detectado', posiblesDuplicados(jugadores), [['a', 'f']]);
}

// ── MRR/ARR sin IVA ───────────────────────────────────────────────────────
igual('MRR mensual', mrrDe({ status: 'active', ciclo: 'monthly', baseCentavos: 29900 }), 29900);
igual('MRR anual / 12', mrrDe({ status: 'active', ciclo: 'annual', baseCentavos: 322920 }), 26910);
igual('MRR cancelada = 0', mrrDe({ status: 'cancelled', baseCentavos: 29900 }), 0);
igual('MRR pendiente = 0 (TC-013: rechazado no cuenta)', mrrDe({ status: 'pending', baseCentavos: 29900 }), 0);
igual('ARR', metricasSaaS([{ status: 'active', baseCentavos: 29900 }, { status: 'free', baseCentavos: 0 }]).arr, 358800);

console.log(fallos ? `\nqa-saas-precios: ${fallos} de ${corridas} comprobaciones fallaron` : `qa-saas-precios OK · ${corridas} comprobaciones`);
if (fallos) process.exit(1);
