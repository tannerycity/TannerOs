/* QA de "Mi plan" (v2/admin/suscripcion/logica.js).
 * Que lo que ve la academia diga la verdad: nunca "bloqueado", siempre que
 * hacer y para cuando; que no se pueda elegir un plan chico; que el aviso
 * antes de pagar diga monto con IVA, periodicidad y como cancelar.
 */
import { textoSuscripcion, textoCupo, opcionesDePlan, revisaFiscal, textoConfirmacion } from '../v2/admin/suscripcion/logica.js';
import { cotiza } from '../v2/saas/precios.js';
import { CATALOGO_V1 } from './saas-catalogo-v1.fixture.mjs';

let fallos = 0, corridas = 0;
const revisa = (n, ok, d) => { corridas++; if (!ok) { fallos++; console.error(` - ${n}${d !== undefined ? `\n   ${JSON.stringify(d)}` : ''}`); } };

// ── Estado de la suscripcion ──────────────────────────────────────────────
revisa('sin plan invita a Semilla', /Semilla 20/.test(textoSuscripcion(null).detalle));
revisa('gratis: sin tarjeta', /Sin tarjeta/.test(textoSuscripcion({ estado: 'free', plan: 'SEMILLA_20', planNombre: 'Semilla 20' }).detalle));
const act = textoSuscripcion({ estado: 'active', plan: 'FORMATIVO', planNombre: 'Formativo', ciclo: 'monthly', total: 34684, periodoFin: '2026-12-23T10:00:00Z' });
revisa('activa: total con IVA y renovacion', /\$346\.84 al mes con IVA/.test(act.detalle) && /23\/12\/2026/.test(act.detalle), act);
revisa('anual dice "al año"', /al año/.test(textoSuscripcion({ estado: 'active', plan: 'F', ciclo: 'annual', total: 374587 }).detalle));
const canc = textoSuscripcion({ estado: 'active', plan: 'F', cancelaAlFinal: true, periodoFin: '2027-01-05' });
revisa('cancelada al final: acceso hasta y luego lo basico', /05\/01\/2027/.test(canc.detalle) && /Semilla/.test(canc.detalle), canc);
revisa('atrasada: reintento de Mercado Pago', /reintentando/.test(textoSuscripcion({ estado: 'past_due', plan: 'F', total: 1 }).detalle));

// ── Cupo: nunca "bloqueado" ────────────────────────────────────────────────
const exc = textoCupo({ estado: 'excedido', activos: 21, limite: 20, requerido: 'FORMATIVO', graciaHasta: '2026-12-16T00:00:00Z' }, CATALOGO_V1);
revisa('excedido: plan que toca, gracia y "no se bloquea"', /Formativo/.test(exc.texto) && /16\/12\/2026/.test(exc.texto) && /No se bloquea/.test(exc.texto), exc);
const ven = textoCupo({ estado: 'gracia_vencida', activos: 60, limite: 50, requerido: 'ASCENSO' }, CATALOGO_V1);
revisa('gracia vencida: los datos siguen disponibles', /datos siguen disponibles/.test(ven.texto) && ven.tono === 'tarde', ven);
revisa('ningun texto de cupo dice "bloqueado"', ['ok', 'cerca', 'excedido', 'gracia_vencida', 'cotizar'].every(e =>
  !/bloquead/i.test(textoCupo({ estado: e, activos: 21, limite: 20, requerido: 'FORMATIVO' }, CATALOGO_V1).texto)));
revisa('duplicados a la vista', /2 posibles duplicados/.test(textoCupo({ estado: 'ok', activos: 10, limite: 20, duplicados: 2 }).texto));
revisa('sin plan: sin aviso de cupo', textoCupo({ estado: 'sin_plan' }) === null);

// ── Planes elegibles ──────────────────────────────────────────────────────
const op = n => Object.fromEntries(opcionesDePlan(CATALOGO_V1, n).map(p => [p.codigo, p]));
revisa('12 jugadores: Semilla recomendada y elegible', op(12).SEMILLA_20.elegible && op(12).SEMILLA_20.recomendado);
revisa('12 jugadores: puede elegir un plan mayor', op(12).PRIMERA.elegible);
revisa('21 jugadores: Semilla no elegible y dice por que', !op(21).SEMILLA_20.elegible && /hasta 20/.test(op(21).SEMILLA_20.motivo));
revisa('21 jugadores: Formativo recomendado', op(21).FORMATIVO.recomendado);
revisa('251: Elite recomendado pero se cotiza', op(251).ELITE.recomendado && !op(251).ELITE.elegible && !op(251).PRIMERA.elegible);

// ── Datos fiscales ────────────────────────────────────────────────────────
const bien = { rfc: 'aaa 010101 aaa', razonSocial: ' Academia A SC ', regimen: '603', cp: '37000', usoCfdi: 'G03' };
revisa('RFC persona moral (12) normalizado', revisaFiscal(bien).datos?.rfc === 'AAA010101AAA');
revisa('RFC persona fisica (13)', revisaFiscal({ ...bien, rfc: 'GODE561231GR8' }).ok);
for (const [n, cambio, patron] of [['RFC corto', { rfc: 'AAA0101' }, /RFC/], ['sin razon social', { razonSocial: ' ' }, /razón social/], ['regimen fuera de lista', { regimen: '999' }, /régimen/],
  ['CP de 4', { cp: '3700' }, /postal/], ['uso CFDI invalido', { usoCfdi: 'X' }, /uso/], ['correo malo', { correo: 'a@' }, /correo/]])
  revisa(`fiscal invalido: ${n}`, patron.test(revisaFiscal({ ...bien, ...cambio }).error || ''));

// ── Aviso antes de pagar ──────────────────────────────────────────────────
revisa('Semilla: sin tarjeta ni costo', /no pide tarjeta/.test(textoConfirmacion(cotiza(CATALOGO_V1, { plan: 'SEMILLA_20', activos: 5 }))));
const conf = textoConfirmacion(cotiza(CATALOGO_V1, { plan: 'FORMATIVO', ciclo: 'annual', activos: 30 }), { inicia: '2027-01-01' });
revisa('pago: monto con IVA, anual por adelantado, inicio y cancelacion', /\$3,745\.87/.test(conf) && /por adelantado/.test(conf) && /01\/01\/2027/.test(conf) && /cancelar/.test(conf), conf);
revisa('cotizacion con error: sin aviso', textoConfirmacion({ ok: false }) === null);

console.log(fallos ? `\nqa-saas-mi-plan: ${fallos} de ${corridas} comprobaciones fallaron` : `qa-saas-mi-plan OK · ${corridas} comprobaciones`);
if (fallos) process.exit(1);
