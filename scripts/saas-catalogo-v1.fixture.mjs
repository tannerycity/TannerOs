/* Catalogo oficial v1 de Mi Club FC como DATO DE PRUEBA (centavos, sin IVA).
 * Es el mismo que siembra supabase/pendientes/saas_comercial_v1.sql. No vive
 * en v2/ a proposito: v2/ es lo que usa la app y los precios no se publican
 * hasta que Presidencia los apruebe en el portal. MESSAGING va como no
 * vendible (no existe el modulo); el resto vendible para probar el motor.
 */
export const CATALOGO_V1 = {
  version: 1, moneda: 'MXN', ivaBp: 1600, descuentoAnualBp: 1000, diasGracia: 15,
  planes: [
    { codigo: 'SEMILLA_20', nombre: 'Semilla 20', min: 0, max: 20, mensual: 0, cotizar: false },
    { codigo: 'FORMATIVO', nombre: 'Formativo', min: 21, max: 50, mensual: 29900, cotizar: false },
    { codigo: 'ASCENSO', nombre: 'Ascenso', min: 51, max: 100, mensual: 59900, cotizar: false },
    { codigo: 'PRIMERA', nombre: 'Primera', min: 101, max: 250, mensual: 99900, cotizar: false },
    { codigo: 'ELITE', nombre: 'Élite', min: 251, max: null, mensual: null, cotizar: true }
  ],
  complementos: [
    { codigo: 'STORE', nombre: 'Mi Club Tienda', mensual: 14900, paquete: null, vendible: true },
    { codigo: 'SPONSORS', nombre: 'Mi Club Patrocinios', mensual: 14900, paquete: null, vendible: true },
    { codigo: 'MARKETING', nombre: 'Mi Club Marketing', mensual: 14900, paquete: null, vendible: true },
    { codigo: 'ANALYTICS', nombre: 'Mi Club Métricas', mensual: 14900, paquete: null, vendible: true },
    { codigo: 'SCOUTING', nombre: 'Mi Club Scouting', mensual: 19900, paquete: null, vendible: true },
    { codigo: 'PARKING', nombre: 'Mi Club Estacionamiento', mensual: 9900, paquete: null, vendible: true },
    { codigo: 'MESSAGING', nombre: 'Mi Club Comunicación avanzada', mensual: 9900, paquete: null, vendible: false },
    { codigo: 'EVENTS', nombre: 'Mi Club Eventos', mensual: 9900, paquete: null, vendible: true },
    { codigo: 'PACK_CRECIMIENTO', nombre: 'Pack Crecimiento', mensual: 34900, paquete: ['SPONSORS', 'MARKETING', 'ANALYTICS'], vendible: true }
  ]
};
