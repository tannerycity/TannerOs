/* Costos públicos de Tannery City: la ÚNICA fuente de precios de /costos.
 *
 * Pedido de Presidencia (20/10/2026): "que cualquier papá vea cuánto cuesta y
 * cuánto pagaría por inscribir a sus hijos, sin entrar a la app". La página,
 * la calculadora y las pruebas leen de aquí; ningún componente escribe un
 * precio a mano. Para cambiar una tarifa se cambia este archivo y nada más.
 *
 * Cada dato dice de dónde salió y si ya está confirmado:
 *   confirmado: true   lo dio Presidencia como vigente;
 *   confirmado: false  es una tarifa histórica conocida que la administración
 *                      tiene que validar antes de presentarla como vigente.
 */
export const TARIFAS = {
  version: '2026-10-20',
  moneda: 'MXN',
  whatsapp: { numero: '524792651338', visible: '479 265 1338' },

  categorias: {
    baby: {
      clave: 'baby', nombre: 'Baby Tanners', edades: 'De 3 a 6 años',
      modalidades: [
        { clave: '1d', nombre: '1 día por semana', mensualidad: 400 },
        { clave: '2d', nombre: '2 días por semana', mensualidad: 550 }
      ],
      inscripcion: 1000, confirmado: true
    },
    tanner: {
      clave: 'tanner', nombre: 'Tanners', edades: 'De 6 a 12 años',
      modalidades: [{ clave: 'completo', nombre: 'Mensualidad', mensualidad: 800 }],
      inscripcion: 1000, confirmado: true
    }
  },
  incluyeInscripcion: 'Seguro anual y gafete',

  /* Paquetes familiares: tarifas históricas. Mientras `confirmado` sea false,
     la calculadora NO los cobra: los enseña como referencia "por confirmar".
     Una combinación que no está aquí no tiene paquete: "Solicitar cotización".
     Los de Baby no dicen modalidad; por eso sólo se reconocen cuando todos los
     Baby van en la modalidad que dice `babyModalidad` (null = sin definir). */
  paquetes: {
    confirmado: false,
    lista: [
      { clave: 't1', nombre: '1 Tanner', tanner: 1, baby: 0, mensualidad: 800 },
      { clave: 't2', nombre: '2 Tanners', tanner: 2, baby: 0, mensualidad: 1500 },
      { clave: 't3', nombre: '3 Tanners', tanner: 3, baby: 0, mensualidad: 2000 },
      { clave: 'b2', nombre: '2 Baby Tanners', tanner: 0, baby: 2, mensualidad: 1000, babyModalidad: null },
      { clave: 't1b1', nombre: '1 Tanner + 1 Baby Tanner', tanner: 1, baby: 1, mensualidad: 1200, babyModalidad: null }
    ]
  },

  /* Primer mes proporcional: la MISMA regla que cobra TannerOS
     (app.prorated_monthly_fee, método weekly_quarters, regla BILL-003
     aprobada): se cobran las semanas que quedan del mes en base 4, según el
     día de ingreso. Del 1 al 7, mes completo; 8 al 14, 3/4; 15 al 21, 1/2;
     del 22 en adelante, 1/4. Se redondea al peso. */
  prorrateo: {
    metodo: 'weekly_quarters',
    confirmado: true,
    tramos: [
      { hastaDia: 7, semanas: 4 },
      { hastaDia: 14, semanas: 3 },
      { hastaDia: 21, semanas: 2 },
      { hastaDia: 31, semanas: 1 }
    ],
    base: 4,
    // Sólo para nuevo ingreso: quien ya está inscrito paga su mensualidad
    // completa aunque asista a menos clases (Presidencia, 20/10/2026).
    soloNuevoIngreso: true
  },

  maxHijos: 3,
  notaProporcional: 'Importante: el pago proporcional es únicamente para alumnos de nuevo ingreso, en su primer mes. Si tu hijo ya está inscrito, pagas la mensualidad completa que acordaste al inscribirte, aunque asista a menos clases en el mes.',
  nota: 'Los importes son informativos y están sujetos a validación por la administración de Tannery City.'
};

/* Precios editados en Club › Costos públicos (h22): pisan a los de arriba.
   Sólo se toma lo que viene bien (pesos enteros de 0 a 100,000); lo demás se
   queda como está aquí. Así un dato mal guardado nunca rompe /costos. */
const peso = v => (Number.isInteger(v) && v >= 0 && v <= 100000 ? v : null);
export function aplicaPrecios(base, p) {
  const t = JSON.parse(JSON.stringify(base));
  if (!p || typeof p !== 'object') return t;
  const pon = (obj, key, v) => { const n = peso(v); if (n != null) obj[key] = n; };
  const baby = t.categorias.baby, tanner = t.categorias.tanner;
  pon(baby.modalidades.find(m => m.clave === '1d'), 'mensualidad', p.baby?.mensualidad1d);
  pon(baby.modalidades.find(m => m.clave === '2d'), 'mensualidad', p.baby?.mensualidad2d);
  pon(baby, 'inscripcion', p.baby?.inscripcion);
  pon(tanner.modalidades[0], 'mensualidad', p.tanner?.mensualidad);
  pon(tanner, 'inscripcion', p.tanner?.inscripcion);
  if (p.paquetes && typeof p.paquetes === 'object') {
    if (typeof p.paquetes.confirmado === 'boolean') t.paquetes.confirmado = p.paquetes.confirmado;
    t.paquetes.lista.forEach(x => pon(x, 'mensualidad', p.paquetes[x.clave]));
  }
  if (typeof p.incluyeInscripcion === 'string' && p.incluyeInscripcion.trim()) t.incluyeInscripcion = p.incluyeInscripcion.trim().slice(0, 120);
  return t;
}

// El formulario de Club › Costos públicos → lo que se guarda. Vacío = se usa
// el valor de este archivo. campos: [[id, grupo, clave], ...].
export function preciosDelFormulario(valores, campos) {
  const out = { baby: {}, tanner: {}, paquetes: { confirmado: !!valores.confirmado }, incluyeInscripcion: String(valores.incluye || '').trim() };
  for (const [id, grupo, clave] of campos) {
    const v = String(valores[id] ?? '').trim();
    if (v === '') continue;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 100000) return { error: 'Los precios van en pesos enteros, de 0 a 100,000.' };
    out[grupo][clave] = n;
  }
  return { precios: out };
}
