/* Dinero que se escribe a mano (13/11/2026).
 *
 * Presidencia: "no acepta centavos... que pueda aceptar centavos, pero que sea
 * fácil también". Los montos de Taquilla eran campos numéricos de pesos
 * enteros: al pedido de $1,299 la "Mitad" le salía $649.50 y el navegador
 * contestaba "Ingresa un valor válido" sin decir qué estaba mal.
 *
 * Aquí vive una sola forma de leer un monto escrito por una persona. Todo es
 * puro (sin pantalla) para poder probarlo con valores frontera.
 *
 * Reglas:
 *   · Pesos con hasta dos decimales (centavos). Un tercer decimal es un error
 *     de dedo y se dice, no se redondea a escondidas.
 *   · Se acepta como la gente lo escribe: "$1,299.50", "1299.5", "649,50",
 *     " 500 ", "1 299".
 *   · Cero, negativos, letras y vacío no son un monto.
 *   · Tope de $9,999,999.99: más que eso es un dedazo.
 */
export const MONTO_MAXIMO = 9999999.99;
const pesos = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const aCentavos = n => Math.round(n * 100 + Number.EPSILON * Math.sign(n));

/* Lee lo escrito. Devuelve { ok, valor } o { ok:false, error }. */
export function leeMonto(texto, { min = 0.01, max = MONTO_MAXIMO, que = 'El monto', quienTope = '' } = {}) {
  let t = String(texto ?? '').trim();
  if (!t) return { ok: false, error: 'Escribe el monto.' };
  if (/^-/.test(t) || /^\(.*\)$/.test(t)) return { ok: false, error: `${que} no puede ser negativo.` };
  t = t.replace(/^\$/, '').replace(/\s+/g, '').replace(/mxn$/i, '');
  // "649,50" o "649,5": una sola coma, sin punto, con uno o dos dígitos después = decimales.
  if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(',', '.');
  // Lo demás: las comas son de miles y tienen que ir cada tres dígitos.
  else if (t.includes(',')) {
    if (!/^\d{1,3}(,\d{3})+(\.\d*)?$/.test(t)) return { ok: false, error: 'Revisa las comas: así no se lee el monto.' };
    t = t.replace(/,/g, '');
  }
  if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return { ok: false, error: 'Escribe sólo números, por ejemplo 649.50.' };
  const decimales = (t.split('.')[1] || '').length;
  if (decimales > 2) return { ok: false, error: 'Sólo centavos: máximo dos decimales (649.50).' };
  const c = aCentavos(Number(t));
  if (!Number.isFinite(c)) return { ok: false, error: 'Escribe sólo números, por ejemplo 649.50.' };
  const cMin = aCentavos(min), cMax = aCentavos(max);
  if (c === 0) return { ok: false, error: `${que} tiene que ser mayor a cero.` };
  if (c < cMin) return { ok: false, error: `${que} mínimo es ${pesos.format(cMin / 100)}.` };
  if (c > cMax) return { ok: false, error: quienTope ? `${quienTope} ${pesos.format(cMax / 100)}.` : `${que} no puede pasar de ${pesos.format(cMax / 100)}.` };
  return { ok: true, valor: c / 100 };
}

/* Para un campo opcional (lo que tocaba cobrar): vacío vale y es null. */
export function leeMontoOpcional(texto, op = {}) {
  if (!String(texto ?? '').trim()) return { ok: true, valor: null };
  return leeMonto(texto, { ...op, min: op.min ?? 0.01 });
}

/* Cómo se deja escrito en el campo: sin signo ni comas, con centavos sólo si los hay. */
export function escribeMonto(n) {
  const c = aCentavos(Number(n) || 0);
  if (c <= 0) return '';
  return c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2);
}

/* Una parte de un saldo ("Mitad"), al centavo. Nunca da cero si el saldo no
   es cero, y nunca más que el saldo. */
export function parteDe(saldo, fraccion) {
  const c = aCentavos(Number(saldo) || 0);
  if (c <= 0) return 0;
  const p = Math.min(c, Math.max(1, Math.round(c * (Number(fraccion) || 0))));
  return p / 100;
}

/* Lo que queda después de pagar, al centavo (sin los 0.30000000000000004). */
export function resta(a, b) { return (aCentavos(Number(a) || 0) - aCentavos(Number(b) || 0)) / 100; }
