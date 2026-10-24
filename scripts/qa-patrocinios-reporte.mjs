// Reporte para el patrocinador (24/10/2026): qué entra, en qué orden y qué NO.
import { datosDelReporte, reportePdf, nombreDelReporte } from '../v2/patrocinadores/reporte.js';

let fallos = 0, casos = 0;
const ok = (n, c, d) => { casos++; if (!c) { fallos++; console.error(` - ${n}${d !== undefined ? `\n   ${JSON.stringify(d)}` : ''}`); } };
const it = (id, ag, d, t, desc, f, extra = {}) => ({ id, agreementId: ag, direction: d, type: t, description: desc, fulfilled: f, ...extra });
const sponsor = { id: 's', name: 'Don Trapo', contactName: 'Luis Escobedo', ownerName: 'Zul' };
const agreements = [
  { id: 'a1', sponsorId: 's', status: 'active', startsOn: '2026-06-22', endsOn: '2026-12-31' },
  { id: 'a2', sponsorId: 's', status: 'draft' },
  { id: 'ax', sponsorId: 's', status: 'cancelled' },
  { id: 'otro', sponsorId: 'z', status: 'active' },
];
const items = [
  it('g1', 'a2', 'give', 'banner', 'Lona premium 3x2', true, { fulfilledAt: '2026-09-05T10:00:00Z' }),
  it('g2', 'a2', 'give', 'advertising', 'Naming del torneo', true, { quantity: 1, unit: 'torneo' }),
  it('g3', 'a2', 'give', 'other', 'Gafete de estacionamiento', false),
  it('r1', 'a2', 'receive', 'money', '$15,000', true),
  it('r2', 'a1', 'receive', 'product', 'Balones oficiales', true, { quantity: 15, unit: 'piezas' }),
  it('r3', 'a1', 'receive', 'product', 'Parchadas', false),
  it('xx', 'ax', 'give', 'other', 'Cancelado', true),
  it('oo', 'otro', 'give', 'other', 'De otra marca', true),
];
const evidence = [{ itemId: 'g2', photoPath: 'p2' }, { itemId: 'g2', photoPath: 'p2b' }, { itemId: 'g9', photoPath: 'ajena' }];
const d = datosDelReporte({ sponsor, agreements, items, evidence, becados: [{ player_name: 'Mateo Ruiz', funding_mode: 'percentage', sponsor_value: 50 }], hoy: '2026-10-24' });

ok('cuenta sólo lo de esta marca y sin lo cancelado', d.total === 3 && d.cumplidos === 2, [d.cumplidos, d.total]);
ok('lo que tiene foto sale primero', d.hechos[0].id === 'g2' && d.hechos[0].fotos.length === 2, d.hechos.map(h => h.id));
ok('fotos: sólo las de sus compromisos entregados', d.fotos === 2, d.fotos);
ok('lo que falta va como "lo que viene"', d.vienen.length === 1 && d.vienen[0].texto === 'Gafete de estacionamiento', d.vienen);
ok('lo recibido no enseña el dinero ni lo no recibido', d.recibido.length === 1 && d.recibido[0].texto === 'Balones oficiales' && d.recibido[0].detalle === '15 piezas', d.recibido);
ok('periodo y vigencia del acuerdo activo', d.periodo === 'Del 22 de junio de 2026 al 24 de octubre de 2026' && d.vigencia === 'Acuerdo vigente hasta el 31 de diciembre de 2026', [d.periodo, d.vigencia]);
ok('fecha de entrega legible', d.hechos.find(h => h.id === 'g1').cuando === '5 de septiembre de 2026');
ok('becado con su aporte', d.becados[0]?.aporte === '50% de su mensualidad', d.becados);
ok('nombre del archivo sin acentos ni espacios', nombreDelReporte('Café Ñandú & Co', '2026-10-24') === 'Reporte-Cafe-Nandu-Co-2026-10-24.pdf', nombreDelReporte('Café Ñandú & Co', '2026-10-24'));

// El PDF, con un jsPDF de mentira que guarda lo que se escribe.
const textos = []; let imagenes = 0, paginas = 1;
class Falso {
  constructor() { this.internal = { pageSize: { getWidth: () => 612, getHeight: () => 792 }, getNumberOfPages: () => paginas }; }
  text(t) { textos.push([].concat(t).join(' ')); } addPage() { paginas++; } addImage() { imagenes++; }
  getTextWidth(t) { return String(t).length * 6; } splitTextToSize(t) { return [String(t)]; }
  setFont() {} setFontSize() {} setTextColor() {} setFillColor() {} setDrawColor() {} setLineWidth() {}
  rect() {} roundedRect() {} circle() {} line() {} setPage() {}
}
await reportePdf({ datos: d, club: 'Tannery City FC', fotos: { p2: { data: 'data:image/jpeg;base64,x', w: 800, h: 600 } }, jsPDF: Falso });
const todo = textos.join(' | ');
ok('portada con marca y cumplimiento', /Don Trapo/.test(todo) && /2 de 3/.test(todo) && /67% de lo acordado/.test(todo), todo.slice(0, 300));
ok('saluda al contacto', /Luis Escobedo, gracias/.test(todo));
ok('secciones: entregado, próximamente e impacto', /Entregado/.test(todo) && /Próximamente para tu marca/.test(todo) && /Lo que tu apoyo hizo posible/.test(todo));
ok('nunca dice "Pendiente" ni enseña dinero por cobrar', !/Pendiente|por cobrar|\$15,000/i.test(todo), todo);
ok('pone la foto de la evidencia', imagenes === 1, imagenes);
ok('cierra con gracias y el contacto del club', /Gracias, Don Trapo\./.test(todo) && /Tu contacto en Tannery City FC: Zul/.test(todo));

if (fallos) { console.error(`Reporte de patrocinio QA: ${fallos} de ${casos} fallaron`); process.exit(1); }
console.log(`Reporte de patrocinio QA OK · ${casos} casos: entregado con fotos, lo que viene, impacto y nada de pendientes`);
