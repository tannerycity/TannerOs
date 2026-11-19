/* Estados del dinero, iguales en todo TannerOS (19/11/2026, carga cognitiva
 * fase 2). Presidencia: "¿cómo mejoramos la carga cognitiva en todos los
 * módulos?". Taquilla decía "Al día / Por vencer / Atrasado"; la ficha del
 * Tanner, "Al corriente", "Debe" y "vencido". Tres palabras para lo mismo
 * obligan a traducir. Ahora todas las pantallas usan estas tres, con el mismo
 * color:
 *   · Al día      nada pendiente                        verde
 *   · Por vencer  debe, pero todavía no llega la fecha   ámbar
 *   · Atrasado    debe y ya pasó la fecha               rojo
 * Un mes pagado se dice "pagado". */
export const ESTADO_DINERO = {
  al_dia: { texto: 'Al día', tono: 'ok' },
  por_vencer: { texto: 'Por vencer', tono: 'aviso' },
  atrasado: { texto: 'Atrasado', tono: 'mal' }
};
const CENTAVO = 0.004;
/* Fecha de hoy en la Ciudad de México (AAAA-MM-DD): a las 7 p.m. del último
 * día del mes, en UTC ya sería mañana y un cargo saldría atrasado antes de
 * tiempo. */
export function hoyMx(ahora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora);
}
/* Clave de un saldo. `vence` es la fecha más vieja sin pagar (AAAA-MM-DD).
 * Vence hoy = por vencer: el día del pago todavía se puede pagar a tiempo.
 * Sin fecha y con saldo: por vencer (no se acusa de atraso sin saberlo). */
export function estadoDeSaldo(saldo, vence, hoy = hoyMx()) {
  if (!(Number(saldo) > CENTAVO)) return 'al_dia';
  const v = String(vence || '').slice(0, 10);
  return v && v < hoy ? 'atrasado' : 'por_vencer';
}
/* Un mes: pagado, por vencer o atrasado. */
export function estadoDeMes(saldo, vence, hoy = hoyMx()) {
  return Number(saldo) > CENTAVO ? estadoDeSaldo(saldo, vence, hoy) : 'pagado';
}
export const TEXTO_MES = { pagado: 'pagado', por_vencer: 'por vencer', atrasado: 'atrasado' };
