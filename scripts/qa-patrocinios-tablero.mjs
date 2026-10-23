// Patrocinios en dos minutos (23/10/2026): la salud de cada marca y "Hoy toca".
import { saludDeMarca, hoyToca, marcador, ordenTablero } from '../v2/patrocinadores/tablero.js';

let fallos = 0, casos = 0;
const ok = (n, c, d) => { casos++; if (!c) { fallos++; console.error(` - ${n}${d !== undefined ? `\n   ${JSON.stringify(d)}` : ''}`); } };
const HOY = '2026-10-23';
const it = (id, ag, direction, type, description, fulfilled, estimatedValue = null) => ({ id, agreementId: ag, direction, type, description, fulfilled, estimatedValue });

// Don Trapo real: un acuerdo activo de $15,000 y dos borradores, el dinero capturado como compromiso.
const trapo = { id: 's1', name: 'Don Trapo', stage: 'active', nextAction: 'Cobro de la segunda parte', nextActionAt: '2026-08-11T18:00:00Z' };
const ag = [
  { id: 'a1', sponsorId: 's1', status: 'active', monetaryValue: 15000, endsOn: '2026-12-01' },
  { id: 'a2', sponsorId: 's1', status: 'draft', monetaryValue: 15000 },
  { id: 'a3', sponsorId: 's1', status: 'draft', monetaryValue: null },
  { id: 'a4', sponsorId: 's1', status: 'cancelled', monetaryValue: 99000 },
];
const items = [it('m', 'a2', 'receive', 'money', '$15,000', false, 15000), it('g1', 'a2', 'give', 'banner', 'Lona', true), it('g2', 'a2', 'give', 'activation', 'Final', false), it('x', 'a4', 'give', 'other', 'Cancelado', false)];
let s = saludDeMarca(trapo, { agreements: ag, items, payments: [{ agreementId: 'a1', amount: 7500 }], hoy: HOY });
ok('el valor no se suma dos veces ni cuenta lo cancelado', s.valor === 15000, s.valor);
ok('cobrado sale de los pagos', s.cobrado === 7500 && s.porCobrar === 7500, [s.cobrado, s.porCobrar]);
ok('compromisos de todos sus acuerdos vivos', s.damos.total === 2 && s.damos.hechos === 1 && s.recibimos.total === 1, [s.damos, s.recibimos]);
const tipos = s.avisos.map(a => a.tipo);
ok('avisa atrasado, cobrar, renovar, debemos y repetidos', ['atrasado', 'cobrar', 'renovar', 'debemos', 'repetidos'].every(t => tipos.includes(t)), tipos);
ok('lo urgente primero', s.avisos[0].nivel === 'alta' && s.avisos.at(-1).nivel === 'baja', s.avisos.map(a => a.nivel));
ok('atrasado de hace mucho dice desde cuándo', /atrasado desde el 11 ago/.test(s.avisos.find(a => a.tipo === 'atrasado').texto), s.avisos[0].texto);

// Si el compromiso de dinero ya se palomeó, cuenta como cobrado aunque no haya pagos.
s = saludDeMarca(trapo, { agreements: ag, items: items.map(i => i.id === 'm' ? { ...i, fulfilled: true } : i), payments: [], hoy: HOY });
ok('el dinero entregado cuenta como cobrado', s.porCobrar === 0 && !s.avisos.some(a => a.tipo === 'cobrar'), s);

// Activa con el acuerdo en borrador; sin dinero = intercambio.
s = saludDeMarca({ id: 's2', name: 'Tremor', stage: 'active' }, { agreements: [{ id: 'b', sponsorId: 's2', status: 'draft' }], items: [it('r', 'b', 'receive', 'product', '40 jerseys', true)], hoy: HOY });
ok('avisa del borrador', s.avisos.some(a => a.tipo === 'borrador') && s.valor === 0 && s.porCobrar === 0, s.avisos);
ok('activa sin acuerdo lo dice', saludDeMarca({ id: 's9', name: 'X', stage: 'active' }, { hoy: HOY }).avisos.some(a => a.tipo === 'sinAcuerdo'));

// En plática sin siguiente paso; pausada y perdida no molestan.
ok('en plática sin paso pide definirlo', saludDeMarca({ id: 's3', name: 'Café', stage: 'talking' }, { hoy: HOY }).avisos[0]?.tipo === 'sinPaso');
ok('pausada sin paso no molesta', saludDeMarca({ id: 's4', name: 'Dis', stage: 'paused' }, { hoy: HOY }).avisos.length === 0);
ok('a una marca no activa no se le cobra', saludDeMarca({ id: 's5', name: 'Dis', stage: 'paused' }, { agreements: [{ id: 'd', sponsorId: 's5', status: 'draft', monetaryValue: 40000 }], hoy: HOY }).avisos.every(a => a.tipo !== 'cobrar'));
ok('paso de mañana avisa pronto', saludDeMarca({ id: 's6', name: 'Y', stage: 'talking', nextAction: 'Llamar', nextActionAt: '2026-10-24' }, { hoy: HOY }).avisos[0]?.texto === 'Llamar · mañana');
ok('acuerdo vencido avisa', saludDeMarca({ id: 's7', name: 'Z', stage: 'active' }, { agreements: [{ id: 'v', sponsorId: 's7', status: 'active', endsOn: '2026-10-01' }], hoy: HOY }).avisos.some(a => a.tipo === 'vencido'));

// Marcador y orden.
const todas = [
  saludDeMarca(trapo, { agreements: ag, items, payments: [{ agreementId: 'a1', amount: 7500 }], hoy: HOY }),
  saludDeMarca({ id: 's2', name: 'Tremor', stage: 'active' }, { agreements: [{ id: 'b', sponsorId: 's2', status: 'draft' }], items: [it('g', 'b', 'give', 'jersey', 'Jersey', false)], hoy: HOY }),
  saludDeMarca({ id: 's3', name: 'Café', stage: 'talking' }, { hoy: HOY }),
  saludDeMarca({ id: 's8', name: 'Perdida', stage: 'lost' }, { hoy: HOY }),
];
const m = marcador(todas);
ok('marcador: sólo marcas con nosotros', m.marcas === 2 && m.valor === 15000 && m.porCobrar === 7500 && m.debemos === 2, m);
const orden = ordenTablero(todas).map(x => x.nombre);
ok('tablero: activas primero, sin las perdidas', JSON.stringify(orden) === '["Don Trapo","Tremor","Café"]', orden);
const lista = hoyToca(todas);
ok('Hoy toca: lo alto arriba y trae la marca', lista[0].nivel === 'alta' && lista[0].marca === 'Don Trapo' && lista.every(a => a.marcaId), lista.slice(0, 2));

if (fallos) { console.error(`Patrocinios tablero QA: ${fallos} de ${casos} fallaron`); process.exit(1); }
console.log(`Patrocinios tablero QA OK · ${casos} casos: valor sin duplicar, por cobrar, compromisos y Hoy toca`);
