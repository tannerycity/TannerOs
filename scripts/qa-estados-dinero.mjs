/* Estados del dinero (19/11/2026, carga cognitiva fase 2). Las tres palabras
 * que usan Taquilla, la ficha del Tanner y su panel de pagos: Al día, Por
 * vencer y Atrasado (v2/estados.js).
 *
 * CAJA NEGRA
 *   · Partición de equivalencia: sin saldo, saldo sin vencer, saldo vencido,
 *     saldo sin fecha.
 *   · Valores frontera de la fecha (3 valores: ayer, hoy, mañana) y del saldo
 *     (0, medio centavo, un centavo).
 *   · Hora de México: a las 7 p.m. del último día del mes en León, en UTC ya
 *     es el día siguiente; no debe salir atrasado antes de tiempo.
 * CAJA BLANCA
 *   · Cada rama de estadoDeSaldo y estadoDeMes se ejecuta al menos una vez.
 */
import { ESTADO_DINERO, estadoDeSaldo, estadoDeMes, TEXTO_MES, hoyMx } from '../v2/estados.js';

let fallos = 0, corridas = 0;
const revisa = (n, ok, d) => { corridas++; if (!ok) { fallos++; console.error(` - ${n}${d !== undefined ? `\n   ${JSON.stringify(d)}` : ''}`); } };
const HOY = '2026-11-19';

// ── Partición de equivalencia ───────────────────────────────────────────────
revisa('sin saldo: al día', estadoDeSaldo(0, '2026-10-01', HOY) === 'al_dia');
revisa('saldo que vence después: por vencer', estadoDeSaldo(800, '2026-12-05', HOY) === 'por_vencer');
revisa('saldo vencido: atrasado', estadoDeSaldo(800, '2026-10-05', HOY) === 'atrasado');
revisa('saldo sin fecha: por vencer (no se acusa sin saber)', estadoDeSaldo(800, null, HOY) === 'por_vencer' && estadoDeSaldo(800, '', HOY) === 'por_vencer');
revisa('saldo negativo (a favor): al día', estadoDeSaldo(-200, '2026-10-05', HOY) === 'al_dia');
revisa('saldo vacío o basura: al día', estadoDeSaldo(null, '2026-10-05', HOY) === 'al_dia' && estadoDeSaldo('x', '2026-10-05', HOY) === 'al_dia');

// ── Valores frontera: la fecha ──────────────────────────────────────────────
revisa('venció ayer: atrasado', estadoDeSaldo(800, '2026-11-18', HOY) === 'atrasado');
revisa('vence hoy: por vencer (todavía se paga a tiempo)', estadoDeSaldo(800, '2026-11-19', HOY) === 'por_vencer');
revisa('vence mañana: por vencer', estadoDeSaldo(800, '2026-11-20', HOY) === 'por_vencer');
revisa('fecha con hora: sólo cuenta el día', estadoDeSaldo(800, '2026-11-19T23:59:00Z', HOY) === 'por_vencer' && estadoDeSaldo(800, '2026-11-18T23:59:00Z', HOY) === 'atrasado');

// ── Valores frontera: el saldo ──────────────────────────────────────────────
revisa('saldo 0: al día', estadoDeSaldo(0, '2026-10-05', HOY) === 'al_dia');
revisa('medio centavo (redondeo): al día', estadoDeSaldo(0.004, '2026-10-05', HOY) === 'al_dia');
revisa('un centavo: atrasado', estadoDeSaldo(0.01, '2026-10-05', HOY) === 'atrasado');

// ── Mes por mes ─────────────────────────────────────────────────────────────
revisa('mes sin saldo: pagado', estadoDeMes(0, '2026-09-05', HOY) === 'pagado');
revisa('mes vencido con saldo: atrasado', estadoDeMes(800, '2026-10-05', HOY) === 'atrasado');
revisa('mes por venir con saldo: por vencer', estadoDeMes(800, '2026-12-05', HOY) === 'por_vencer');
revisa('cada mes tiene su palabra', ['pagado', 'por_vencer', 'atrasado'].every(k => TEXTO_MES[k]) && TEXTO_MES.atrasado === 'atrasado');

// ── Las palabras son las de Taquilla ────────────────────────────────────────
revisa('Al día / Por vencer / Atrasado', ESTADO_DINERO.al_dia.texto === 'Al día' && ESTADO_DINERO.por_vencer.texto === 'Por vencer' && ESTADO_DINERO.atrasado.texto === 'Atrasado');
revisa('cada estado tiene su tono', ['ok', 'aviso', 'mal'].join() === ['al_dia', 'por_vencer', 'atrasado'].map(k => ESTADO_DINERO[k].tono).join());

// ── Hora de México ──────────────────────────────────────────────────────────
// 30/11/2026 a las 7 p.m. en León = 01/12/2026 01:00 en UTC.
revisa('a las 7 p.m. del 30 de nov en León todavía es 30 de nov', hoyMx(new Date('2026-12-01T01:00:00Z')) === '2026-11-30', hoyMx(new Date('2026-12-01T01:00:00Z')));
revisa('y lo que vence el 30 todavía no está atrasado', estadoDeSaldo(800, '2026-11-30', hoyMx(new Date('2026-12-01T01:00:00Z'))) === 'por_vencer');
revisa('a las 6 a.m. del 1 de dic en León ya es 1 de dic', hoyMx(new Date('2026-12-01T12:00:00Z')) === '2026-12-01');
revisa('sin hoy explícito usa la fecha de México', estadoDeSaldo(800, '2000-01-01') === 'atrasado' && estadoDeSaldo(800, '2999-01-01') === 'por_vencer');

console.log(fallos ? `Estados del dinero FAILED · ${fallos} de ${corridas}` : `Estados del dinero OK · ${corridas} revisiones: clases de equivalencia, fronteras de fecha y saldo, mes por mes y hora de México`);
process.exit(fallos ? 1 : 0);
