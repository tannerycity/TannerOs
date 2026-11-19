/* Categoría sugerida por la edad (19/11/2026, carga cognitiva fase 3).
 * Edades de Presidencia: Baby Tanner 3-4, T6 5-6, T10 7-10, T12 11-12.
 *
 * CAJA NEGRA
 *   · Valores frontera de la edad: el día antes, el día y el día después del
 *     cumpleaños (2 de diciembre de 2026 como "hoy").
 *   · Valores frontera de cada rango: 2/3, 4/5, 6/7, 10/11, 12/13.
 *   · Partición: fecha vacía, mal escrita o futura; rangos sin edades.
 * CAJA BLANCA
 *   · Cada rama de edadEnAnios y categoriaParaEdad se ejecuta.
 */
import { edadEnAnios, categoriaParaEdad } from '../v2/categoria-edad.js';

let fallos = 0, corridas = 0;
const revisa = (n, ok, d) => { corridas++; if (!ok) { fallos++; console.error(` - ${n}${d !== undefined ? `\n   ${JSON.stringify(d)}` : ''}`); } };
const HOY = new Date(2026, 11, 2, 12); // 2 dic 2026
const RANGOS = [{ name: 'Baby Tanner', minAge: 3, maxAge: 4 }, { name: 'T6', minAge: 5, maxAge: 6 }, { name: 'T10', minAge: 7, maxAge: 10 }, { name: 'T12', minAge: 11, maxAge: 12 }];

// ── Edad: frontera del cumpleaños ───────────────────────────────────────────
revisa('cumple 7 mañana: todavía tiene 6', edadEnAnios('2019-12-03', HOY) === 6, edadEnAnios('2019-12-03', HOY));
revisa('cumple 7 hoy: ya tiene 7', edadEnAnios('2019-12-02', HOY) === 7);
revisa('cumplió 7 ayer: tiene 7', edadEnAnios('2019-12-01', HOY) === 7);
revisa('mes después: todavía no cumple', edadEnAnios('2019-12-31', HOY) === 6 && edadEnAnios('2020-01-01', HOY) === 6);
revisa('29 de febrero', edadEnAnios('2020-02-29', HOY) === 6);

// ── Edad: clases inválidas ──────────────────────────────────────────────────
revisa('sin fecha: nada', edadEnAnios('', HOY) === null && edadEnAnios(null, HOY) === null);
revisa('fecha mal escrita: nada', edadEnAnios('02/12/2019', HOY) === null && edadEnAnios('2019-13-01', HOY) === null);
revisa('fecha futura: nada', edadEnAnios('2027-01-01', HOY) === null);
revisa('nació hoy: 0 años', edadEnAnios('2026-12-02', HOY) === 0);

// ── Rangos: fronteras ───────────────────────────────────────────────────────
const cat = e => categoriaParaEdad(e, RANGOS);
revisa('2 años: ninguna (Baby empieza en 3)', cat(2) === null);
revisa('3 y 4: Baby Tanner', cat(3) === 'Baby Tanner' && cat(4) === 'Baby Tanner');
revisa('5 y 6: T6', cat(5) === 'T6' && cat(6) === 'T6');
revisa('7 y 10: T10', cat(7) === 'T10' && cat(10) === 'T10');
revisa('11 y 12: T12', cat(11) === 'T12' && cat(12) === 'T12');
revisa('13 años: ninguna (T12 termina en 12)', cat(13) === null);

// ── Rangos: datos incompletos ───────────────────────────────────────────────
revisa('sin rangos: nada', categoriaParaEdad(8, []) === null && categoriaParaEdad(8, null) === null && categoriaParaEdad(8) === null);
revisa('un rango sin su edad máxima no cuenta', categoriaParaEdad(8, [{ name: 'X', minAge: 7, maxAge: null }]) === null);
revisa('edades escritas como texto también sirven', categoriaParaEdad(8, [{ name: 'T10', minAge: '7', maxAge: '10' }]) === 'T10');
revisa('sin edad: nada', categoriaParaEdad(null, RANGOS) === null && categoriaParaEdad(undefined, RANGOS) === null);
revisa('si dos rangos se enciman, gana el primero del club', categoriaParaEdad(6, [{ name: 'A', minAge: 5, maxAge: 7 }, { name: 'B', minAge: 6, maxAge: 8 }]) === 'A');

// ── De punta a punta ────────────────────────────────────────────────────────
revisa('niño nacido el 3 dic 2019, el 2 dic 2026: T6 (cumple 7 mañana)', cat(edadEnAnios('2019-12-03', HOY)) === 'T6');
revisa('al día siguiente ya es T10', categoriaParaEdad(edadEnAnios('2019-12-03', new Date(2026, 11, 3, 12)), RANGOS) === 'T10');

console.log(fallos ? `Categoría por edad FAILED · ${fallos} de ${corridas}` : `Categoría por edad OK · ${corridas} revisiones: frontera del cumpleaños, extremos de cada rango, fechas inválidas y rangos incompletos`);
process.exit(fallos ? 1 : 0);
