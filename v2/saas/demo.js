/* DATOS DE DEMOSTRACION del sistema comercial de Mi Club FC (23/11/2026).
 *
 * Presidencia: "No quiero pagar nada aun, quiero que este para mostrarla como
 * demo y ya despues ir subiendo". Con esto las pantallas comerciales se pueden
 * ensenar SIN aplicar la migracion, sin Mercado Pago y sin cobrar nada:
 *   - /precios/?demo=1
 *   - "Mi plan" dentro del club demo (entrando por /demo como Presidencia)
 *   - Portal de la plataforma con ?demo=1 (seccion comercial)
 * Siempre con letrero de demostracion. Nada de esto se guarda ni se cobra.
 *
 * El catalogo es el oficial v1 (el mismo que siembra la migracion pendiente);
 * scripts/qa-saas-demo.mjs vigila que no se desfase. Academias ficticias.
 */
export const AVISO_DEMO = 'Demostración: precios sujetos a aprobación final. No se cobra nada ni se guardan cambios.';

const p = (codigo, nombre, min, max, mensual, funciones, cotizar = false) => ({ codigo, nombre, min, max, mensual, cotizar, funciones });
const c = (codigo, nombre, mensual, descripcion, vendible, extra = {}) => ({ codigo, nombre, mensual, descripcion, vendible, paquete: null, costosExternos: null, modulos: [], ...extra });

export const DEMO_CATALOGO = {
  version: 1, moneda: 'MXN', ivaBp: 1600, descuentoAnualBp: 1000, diasGracia: 15, demo: true,
  planes: [
    p('SEMILLA_20', 'Semilla 20', 0, 20, 0, ['Gratis mientras tengas hasta 20 jugadores activos', 'Sin tarjeta', 'Jugadores, asistencia, cobranza y portal de familias']),
    p('FORMATIVO', 'Formativo', 21, 50, 29900, ['Todo Semilla', 'Contabilidad y conciliación', 'Encuestas a familias']),
    p('ASCENSO', 'Ascenso', 51, 100, 59900, ['Todo Formativo', 'Academias y porteros']),
    p('PRIMERA', 'Primera', 101, 250, 99900, ['Todo Ascenso', 'Atención prioritaria']),
    p('ELITE', 'Élite', 251, null, null, ['Más de 250 jugadores o varias sedes', 'Configuración a la medida'], true)
  ],
  complementos: [
    c('STORE', 'Mi Club Tienda', 14900, 'Catálogo, kits y uniformes, pedidos, cobros y rentabilidad.', true, { modulos: ['catalogo', 'commerce_finance', 'tienda'] }),
    c('SPONSORS', 'Mi Club Patrocinios', 14900, 'Patrocinadores, acuerdos y activos comerciales.', true, { modulos: ['patrocinadores'] }),
    c('MARKETING', 'Mi Club Marketing', 14900, 'Ideas, campañas y seguimiento.', false),
    c('ANALYTICS', 'Mi Club Métricas', 14900, 'Redes, Google y web en un tablero.', false, { modulos: ['metricas'], costosExternos: 'Conectores de terceros se cobran aparte' }),
    c('SCOUTING', 'Mi Club Scouting', 19900, 'Scouting y seguimiento de talento.', true, { modulos: ['scouting'] }),
    c('PARKING', 'Mi Club Estacionamiento', 9900, 'Control de estacionamiento y gafetes.', false, { modulos: ['estacionamiento'] }),
    c('MESSAGING', 'Mi Club Comunicación avanzada', 9900, 'Mensajería masiva y automatizada.', false, { costosExternos: 'Mensajes de WhatsApp/SMS se cobran aparte' }),
    c('EVENTS', 'Mi Club Eventos', 9900, 'Programas, cursos y eventos con inscripción.', true, { modulos: ['cursosVerano'] }),
    c('PACK_CRECIMIENTO', 'Pack Crecimiento', 34900, 'Patrocinios + Marketing + Métricas.', false, { paquete: ['SPONSORS', 'MARKETING', 'ANALYTICS'] })
  ]
};

// "Mi plan" de la academia demo: Formativo mensual con Tienda, al dia.
export function demoMiPlan(activos = 40) {
  const hoy = new Date();
  const iso = d => d.toISOString();
  const fin = new Date(hoy.getTime() + 18 * 86400000), antes = new Date(hoy.getTime() - 12 * 86400000), dosAntes = new Date(hoy.getTime() - 42 * 86400000);
  const limite = activos > 50 ? 100 : 50;
  return {
    demo: true, interno: false,
    suscripcion: { id: 'demo', plan: activos > 50 ? 'ASCENSO' : 'FORMATIVO', ciclo: 'monthly', estado: 'active', base: 44800, iva: 7168, total: 51968,
      periodoFin: iso(fin), cancelaAlFinal: false, graciaHasta: null, version: 1, complementos: [{ codigo: 'STORE', neto: 14900, cubiertoPor: null }] },
    pendiente: null,
    cupo: { estado: activos >= Math.ceil(limite * 0.9) ? 'cerca' : 'ok', activos, limite, plan: 'FORMATIVO', requerido: 'FORMATIVO', duplicados: 0 },
    fiscal: { rfc: 'XAXX010101000', razonSocial: 'Academia de ejemplo', regimen: '603', cp: '37000', usoCfdi: 'G03', correo: '' },
    pagos: [
      { folio: 1042, estado: 'approved', monto: 51968, aprobado: iso(antes), cfdi: null },
      { folio: 987, estado: 'approved', monto: 51968, aprobado: iso(dosAntes), cfdi: 'pending_integration' }
    ]
  };
}

// Portal de la plataforma: el negocio con academias ficticias.
const ACADEMIAS = [
  ['Academia Águilas del Norte', 'SEMILLA_20', 'free', 14, []], ['Club Deportivo Los Pinos', 'SEMILLA_20', 'free', 19, ['STORE']],
  ['Escuela de Fútbol Río Grande', 'FORMATIVO', 'active', 38, ['STORE']], ['Academia Estrellas FC', 'FORMATIVO', 'active', 47, []],
  ['Club Atlético Valle Verde', 'ASCENSO', 'active', 82, ['STORE', 'SCOUTING']], ['Academia Leones Jr.', 'SEMILLA_20', 'free', 9, []],
  ['Deportivo San Miguel', 'PRIMERA', 'active', 164, ['STORE', 'SPONSORS', 'EVENTS']], ['Academia Halcones del Sur', 'FORMATIVO', 'past_due', 29, []],
  ['Escuela Futbolera Centro', 'SEMILLA_20', 'free', 17, []], ['Club Cantera Azul', 'ASCENSO', 'active', 66, ['SPONSORS']]
];
export function demoPortal() {
  const precio = Object.fromEntries(DEMO_CATALOGO.planes.map(x => [x.codigo, x.mensual || 0]));
  const comp = Object.fromEntries(DEMO_CATALOGO.complementos.map(x => [x.codigo, x.mensual]));
  const vivas = ACADEMIAS.filter(a => ['active', 'past_due'].includes(a[2]));
  const mrrPlanes = vivas.reduce((s, a) => s + precio[a[1]], 0);
  const mrrComp = vivas.reduce((s, a) => s + a[4].reduce((t, k) => t + comp[k], 0), 0) + ACADEMIAS.filter(a => a[2] === 'free').reduce((s, a) => s + a[4].reduce((t, k) => t + comp[k], 0), 0);
  const semilla = ACADEMIAS.filter(a => a[1] === 'SEMILLA_20');
  const renueva = new Date(Date.now() + 15 * 86400000).toISOString();
  return {
    board: {
      academiasGratis: semilla.filter(a => a[4].length === 0).length, academiasPago: ACADEMIAS.length - semilla.filter(a => a[4].length === 0).length,
      mrr: mrrPlanes + mrrComp, arr: (mrrPlanes + mrrComp) * 12, mrrComplementos: mrrComp, conversionGratisAPago: 3,
      pagosFallidos30d: 1, cancelaciones30d: 0, atrasadas: 1, eventosConError: 0, montosNoCoinciden: 0, catalogoPublicado: null,
      academias: ACADEMIAS.map((a, i) => ({ id: `demo-${i}`, nombre: a[0], plan: a[1], estado: a[2], ciclo: a[2] === 'free' ? null : 'monthly',
        renueva: a[2] === 'free' ? null : renueva, cancelaAlFinal: false, jugadores: a[3], complementos: a[4], interno: false, demo: true })),
      semilla: { beneficiadas: semilla.length, jugadores: semilla.reduce((s, a) => s + a[3], 0), crecieron: 1, migraronAPago: 3, becasVigentes: 2 }
    },
    cat: {
      versiones: [{ ...DEMO_CATALOGO, id: 'demo', status: 'approved', ivaValidado: false, label: 'Catálogo oficial v1',
        notas: 'Importes aprobados como configuración inicial. IVA sujeto a validación fiscal.',
        planes: DEMO_CATALOGO.planes, complementos: DEMO_CATALOGO.complementos.map(x => ({ ...x, estadoComercial: x.vendible ? 'for_sale' : 'draft' })) }],
      modulos: [['Jugadores', 'ready'], ['Asistencia', 'ready'], ['Cobranza', 'ready'], ['Taquilla', 'ready'], ['Contabilidad', 'ready'], ['Tienda', 'ready'],
        ['Patrocinadores', 'ready'], ['Scouting', 'ready'], ['Programas y eventos', 'ready'], ['Métricas', 'review'], ['Estacionamiento', 'review'], ['Formación', 'internal']]
        .map(([nombre, tecnico]) => ({ codigo: nombre, nombre, tecnico, notas: null }))
    }
  };
}
