// Propuesta en un clic y meta en efectivo (25/10/2026): qué sale y qué no.
import { datosDePropuesta, precioPublico, ultimasMetricas, nombreDePropuesta } from '../v2/patrocinadores/propuesta.js';
import { efectivoDelMes, especieRecibida, saludDeMarca } from '../v2/patrocinadores/tablero.js';

let fallos = 0, casos = 0;
const ok = (n, c, d) => { casos++; if (!c) { fallos++; console.error(` - ${n}${d !== undefined ? `\n   ${JSON.stringify(d)}` : ''}`); } };

ok('precio aprobado se enseña', precioPublico({ price: 2500, priceStatus: 'aprobado', unit: 'reel' }) === '$2,500 por reel');
ok('precio en propuesta no se enseña', precioPublico({ price: 3000, priceStatus: 'propuesta', unit: 'por mes' }) === 'A cotizar');
ok('sin precio: A cotizar', precioPublico({ price: null, priceStatus: 'aprobado' }) === 'A cotizar');

const metricas = [
  { entity: 'TC', channel: 'Instagram', metric: 'seguidores_total', value: 981, unit: 'cuentas', periodEnd: '2026-10-21', source: 'A', validation: 'CONFIRMADO' },
  { entity: 'TC', channel: 'Instagram', metric: 'seguidores_total', value: 1010, unit: 'cuentas', periodEnd: '2026-11-21', source: 'B', validation: 'CONFIRMADO' },
  { entity: 'TC', channel: 'Facebook', metric: 'seguidores_total', value: 456, unit: 'cuentas', periodEnd: '2026-10-21', source: 'C', validation: 'CONFIRMADO' },
  { entity: 'TCP', channel: 'Facebook', metric: 'visualizaciones', value: 49800, unit: 'aprox. conteo', window: '28 días', periodStart: '2026-09-26', periodEnd: '2026-10-23', source: 'Meta', validation: 'APROXIMADO' },
  { entity: 'TCP', channel: 'Instagram', metric: 'alcance', value: 1, unit: 'cuentas', periodEnd: '2026-10-23', source: 'X', validation: 'PENDIENTE' },
];
const ult = ultimasMetricas(metricas);
ok('última foto por red y métrica, sin sumar redes', ult.filter(m => m.metric === 'seguidores_total').map(m => `${m.channel}:${m.value}`).sort().join() === 'Facebook:456,Instagram:1010', ult);

const activos = [
  { id: 'a', name: 'Reel Instagram', entity: 'TC', channel: 'Instagram', unit: 'reel', price: 2500, priceStatus: 'aprobado', description: 'Video', internalNotes: 'SECRETO', validation: 'CONFIGURABLE' },
  { id: 'b', name: 'Frente Españita 1', entity: 'TCP', channel: 'Presencial', unit: 'espacio', price: 5000, priceStatus: 'propuesta', description: 'Espacio' },
];
const d = datosDePropuesta({ marca: 'Ferretería', activos, metricas, hoy: '2026-10-25' });
ok('los activos llevan su precio público', d.activos.map(a => a.precio).join('|') === '$2,500 por reel|A cotizar', d.activos);
ok('nada interno en la propuesta', !JSON.stringify(d).includes('SECRETO') && !JSON.stringify(d).includes('CONFIGURABLE') && !JSON.stringify(d).includes('5000'));
ok('audiencia sólo confirmada o aproximada, con etiqueta aprox.', d.audiencia.some(m => m.valor === 'aprox. 49,800' && /28 días · 26 sep – 23 oct/.test(m.periodo)) && !d.audiencia.some(m => m.fuente === 'X'), d.audiencia);
ok('nombre del archivo', nombreDePropuesta('Café Ñandú', '2026-10-25') === 'Propuesta-Cafe-Nandu-2026-10-25.pdf');

const pagos = [{ amount: 7500, paidOn: '2026-10-02' }, { amount: 7500, paidOn: '2026-09-10' }];
const e = efectivoDelMes(pagos, '2026-10-25', 30000);
ok('efectivo del mes contra la meta', e.cobrado === 7500 && e.falta === 22500 && e.pct === 25, e);
const especie = especieRecibida([
  { agreementId: 'x', direction: 'receive', type: 'product', fulfilled: true, estimatedValue: 1000 },
  { agreementId: 'x', direction: 'receive', type: 'money', fulfilled: true, estimatedValue: 15000 },
  { agreementId: 'x', direction: 'receive', type: 'service', fulfilled: false },
  { agreementId: 'y', direction: 'receive', type: 'product', fulfilled: true, estimatedValue: 9 },
], [{ id: 'x', status: 'active' }, { id: 'y', status: 'cancelled' }]);
ok('la especie no incluye dinero ni acuerdos cancelados', especie.recibidos === 1 && especie.total === 2 && especie.valor === 1000, especie);
const s = saludDeMarca({ id: 'm', name: 'Muroplaf', stage: 'active' }, { agreements: [{ id: 'x', sponsorId: 'm', status: 'active' }],
  items: [{ agreementId: 'x', direction: 'give', description: 'Reels', fulfilled: false }, { agreementId: 'x', direction: 'give', description: 'Paquete $8,000', fulfilled: false, auditStatus: 'venta_aparte' },
    { agreementId: 'x', direction: 'give', description: 'Mención', fulfilled: true, auditStatus: 'por_auditar' }], hoy: '2026-10-25' });
ok('la venta aparte no cuenta en "les damos"', s.damos.total === 2, s.damos);
ok('lo por auditar se avisa', s.avisos.some(a => a.tipo === 'auditar'), s.avisos);

if (fallos) { console.error(`Propuesta y meta QA: ${fallos} de ${casos} fallaron`); process.exit(1); }
console.log(`Propuesta y meta QA OK · ${casos} casos: precios aprobados, nada interno, métricas sin sumar y efectivo vs especie`);
