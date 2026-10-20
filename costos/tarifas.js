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
    base: 4
  },

  maxHijos: 3,
  nota: 'Los importes son informativos y están sujetos a validación por la administración de Tannery City.'
};
