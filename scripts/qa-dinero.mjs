/* Dinero escrito a mano (13/11/2026). Presidencia: "no acepta centavos...
 * hazle pruebas de valores frontera... basado en ISTQB, caja negra y caja
 * blanca".
 *
 * CAJA NEGRA
 *   · Partición de equivalencia: una prueba por clase válida e inválida.
 *   · Valores frontera (3 valores: justo antes, en, y justo después) en el
 *     mínimo, el máximo, el saldo del pedido y los decimales.
 *   · Tabla de decisión: campo obligatorio u opcional × vacío o con monto.
 * CAJA BLANCA
 *   · Cada rama de leeMonto se ejecuta al menos una vez (cobertura de
 *     decisiones): se comprueba por el mensaje que sale de cada una.
 */
import { leeMonto, leeMontoOpcional, escribeMonto, parteDe, resta, MONTO_MAXIMO } from '../v2/dinero.js';

let fallos = 0, corridas = 0;
const revisa = (n, ok, d) => { corridas++; if (!ok) { fallos++; console.error(` - ${n}${d !== undefined ? `\n   ${JSON.stringify(d)}` : ''}`); } };
const vale = (t, esperado, op) => { const r = leeMonto(t, op); revisa(`vale: "${t}" = ${esperado}`, r.ok && r.valor === esperado, r); };
const falla = (t, mensaje, op) => { const r = leeMonto(t, op); revisa(`no vale: "${t}" (${mensaje})`, !r.ok && mensaje.test(r.error || ''), r); };

// ── Partición de equivalencia: clases válidas ───────────────────────────────
vale('500', 500);                 // entero
vale('649.5', 649.5);             // un decimal
vale('649.50', 649.5);            // dos decimales
vale('$1,299.50', 1299.5);        // como sale en pantalla
vale('1,299', 1299);              // miles sin centavos
vale('1,234,567.89', 1234567.89); // dos grupos de miles
vale('649,50', 649.5);            // coma decimal (teclado en español)
vale('649,5', 649.5);
vale(' 500 ', 500);               // espacios
vale('1 299', 1299);              // espacio como separador
vale('.5', 0.5);                  // sin cero adelante
vale('500.', 500);                // punto colgando
vale('0500', 500);                // ceros a la izquierda
vale('500 MXN', 500);

// ── Partición de equivalencia: clases inválidas ─────────────────────────────
falla('', /Escribe el monto/);
falla('   ', /Escribe el monto/);
falla('abc', /sólo números/);
falla('12a', /sólo números/);
falla('1.2.3', /sólo números/);
falla('1e3', /sólo números/);          // notación científica: Number la aceptaría
falla('Infinity', /sólo números/);
falla('-5', /negativo/);
falla('(5)', /negativo/);              // negativo contable
falla('1,23,456', /comas/);            // miles mal puestos
falla('12,3456', /comas/);
falla('0', /mayor a cero/);
falla('0.00', /mayor a cero/);

// ── Valores frontera: decimales (2 es el límite) ────────────────────────────
vale('649.4', 649.4); vale('649.49', 649.49);
falla('649.499', /dos decimales/);     // 3 decimales: no se redondea a escondidas
falla('0.001', /dos decimales/);

// ── Valores frontera: el mínimo (1 centavo) ─────────────────────────────────
falla('0', /mayor a cero/);            // justo antes
vale('0.01', 0.01);                    // en la frontera
vale('0.02', 0.02);                    // justo después
// con otro mínimo
falla('0.99', /mínimo es \$1\.00/, { min: 1 }); vale('1', 1, { min: 1 }); vale('1.01', 1.01, { min: 1 });

// ── Valores frontera: el máximo ─────────────────────────────────────────────
vale('9999999.98', 9999999.98);        // justo antes
vale('9999999.99', MONTO_MAXIMO);      // en la frontera
falla('10000000', /no puede pasar de/); // justo después
falla('10000000.00', /no puede pasar de/);

// ── Valores frontera: el saldo de un pedido (el caso de la captura) ─────────
const saldo = 649.5, tope = { max: saldo, quienTope: 'Al pedido sólo le faltan' };
vale('649.49', 649.49, tope);          // justo antes
vale('649.50', 649.5, tope);           // exactamente lo que falta
vale('649.5', 649.5, tope);
falla('649.51', /Al pedido sólo le faltan \$649\.50/, tope); // un centavo de más
falla('650', /Al pedido sólo le faltan/, tope);              // lo que hacía el redondeo viejo
// Punto flotante: 0.1 + 0.2 no es 0.3 en la máquina; aquí sí.
vale('0.30', 0.3, { max: 0.1 + 0.2 });
vale('1299', 1299, { max: 649.5 + 649.5 });

// ── Tabla de decisión: obligatorio / opcional × vacío / con monto ───────────
revisa('obligatorio y vacío: error', !leeMonto('').ok);
revisa('obligatorio con monto: vale', leeMonto('10').ok);
const v = leeMontoOpcional('');
revisa('opcional y vacío: vale y es null', v.ok && v.valor === null, v);
revisa('opcional con monto: vale', leeMontoOpcional('10.50').valor === 10.5);
revisa('opcional con basura: error', !leeMontoOpcional('x').ok);

// ── "Mitad" y "Todo": la parte de un saldo ──────────────────────────────────
revisa('la mitad de $1,299 son $649.50 (antes salía $650 y no dejaba cobrar)', parteDe(1299, .5) === 649.5);
revisa('todo es todo, con centavos', parteDe(649.5, 1) === 649.5);
revisa('la mitad de 1 centavo es 1 centavo, nunca cero', parteDe(0.01, .5) === 0.01);
revisa('la mitad de 3 centavos se redondea al centavo', parteDe(0.03, .5) === 0.02);
revisa('nunca más que el saldo', parteDe(100, 2) === 100);
revisa('sin saldo no hay parte', parteDe(0, .5) === 0 && parteDe(-5, .5) === 0);
revisa('lo que da "Mitad" siempre se puede cobrar', [1299, 649.5, 0.01, 0.03, 450, 1349.99].every(s => leeMonto(escribeMonto(parteDe(s, .5)), { max: s }).ok));

// ── Lo que queda después de pagar ───────────────────────────────────────────
revisa('1299 − 649.50 = 649.50', resta(1299, 649.5) === 649.5);
revisa('0.3 − 0.1 = 0.2 exacto', resta(0.3, 0.1) === 0.2);
revisa('pagar todo deja cero exacto', resta(649.5, 649.5) === 0);

// ── Cómo queda escrito en el campo ──────────────────────────────────────────
revisa('pesos cerrados sin ".00"', escribeMonto(500) === '500');
revisa('con centavos, siempre dos dígitos', escribeMonto(649.5) === '649.50' && escribeMonto(0.01) === '0.01');
revisa('cero o basura deja el campo vacío', escribeMonto(0) === '' && escribeMonto('x') === '' && escribeMonto(null) === '');
revisa('lo escrito se vuelve a leer igual', [1, 0.01, 649.5, 1299, 9999999.99].every(n => leeMonto(escribeMonto(n)).valor === n));

console.log(fallos ? `Dinero FAILED · ${fallos} de ${corridas}` : `Dinero OK · ${corridas} revisiones: clases de equivalencia, valores frontera (mínimo, máximo, saldo, decimales), tabla de decisión y cada rama`);
process.exit(fallos ? 1 : 0);
