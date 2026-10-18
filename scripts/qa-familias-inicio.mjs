// Inicio del portal de familias: las reglas (v2/familias/inicio.js), sin navegador.
import assert from 'node:assert/strict';
import { pendientesDe, proximoEvento, cuandoEs, saludo, avisosSinLeer } from '../v2/familias/inicio.js';

let fallos = 0, corridas = 0;
function prueba(nombre, fn) { corridas++; try { fn(); } catch (e) { fallos++; console.error(` - ${nombre}: ${e.message}`); } }

const P1 = { id: 'p1', first_name: 'Jorge Alfonso' }, P2 = { id: 'p2', first_name: 'Sofía', balance: 300 };

prueba('pendientes en orden: pagar, firmar, fotos, documentos', () => {
  const r = pendientesDe([P1], { p1: { summary: { balance: 1250 }, documents: [{ type: 'curp', received: false }, { type: 'acta', received: true }] } },
    { p1: { image_consent: { status: 'sin_preguntar' }, consents: [{ code: 'reglamento', title: 'Reglamento', required: true, accepted_at: null }] } });
  assert.deepEqual(r.map(x => x.tipo), ['pago', 'firma', 'fotos', 'docs']);
  assert.equal(r[0].monto, 1250); assert.equal(r[0].ancla, 'famSaldo');
  assert.equal(r[0].titulo, 'Saldo pendiente de Jorge');
  assert.equal(r[1].titulo, 'Firmar: Reglamento');
  assert.equal(r[3].titulo, 'Falta 1 documento de Jorge');
});

prueba('con dos hijos se juntan y van por prioridad', () => {
  const r = pendientesDe([P1, P2], { p1: {}, p2: {} }, { p1: { image_consent: { status: 'sin_preguntar' } }, p2: {} });
  assert.deepEqual(r.map(x => [x.tipo, x.player]), [['pago', 'p2'], ['fotos', 'p1']]);
});

prueba('lo firmado, lo opcional y el permiso ya contestado no son pendientes', () => {
  const r = pendientesDe([P1], { p1: { summary: { balance: 0 } } }, { p1: { image_consent: { status: 'autoriza' }, consents: [
    { code: 'reglamento', title: 'R', required: true, accepted_at: '2026-10-01' },
    { code: 'opcional', title: 'O', required: false, accepted_at: null },
    { code: 'uso_de_imagen', title: 'Imagen', required: true, accepted_at: null }] } });
  assert.deepEqual(r, []);
});

prueba('un papel que el club actualizó vuelve a pedirse', () => {
  const r = pendientesDe([P1], {}, { p1: { consents: [{ code: 'reglamento', title: 'Reglamento', required: true, accepted_at: '2026-01-01', outdated: true }] } });
  assert.deepEqual(r.map(x => x.tipo), ['firma']);
});

prueba('lo próximo: el primer entrenamiento que no ha pasado, sin cumpleaños', () => {
  const ahora = Date.parse('2026-10-18T12:00:00Z');
  const e = proximoEvento([
    { kind: 'session', title: 'Ayer', starts_at: '2026-10-17T17:00:00Z' },
    { kind: 'birthday', title: 'Cumple', starts_at: '2026-10-18T13:00:00Z' },
    { kind: 'session', title: 'Pasado mañana', starts_at: '2026-10-20T17:00:00Z' },
    { kind: 'session', title: 'Mañana', starts_at: '2026-10-19T17:00:00Z' }], ahora);
  assert.equal(e.title, 'Mañana');
  assert.equal(proximoEvento([], ahora), null);
});

prueba('cuándo es: hoy, mañana o el día', () => {
  const ahora = new Date(2026, 9, 18, 9, 0);
  assert.match(cuandoEs(new Date(2026, 9, 18, 17, 0), ahora), /^Hoy · /);
  assert.match(cuandoEs(new Date(2026, 9, 19, 17, 0), ahora), /^Mañana · /);
  assert.match(cuandoEs(new Date(2026, 9, 25, 17, 0), ahora), /^domingo 25 de oct · /);
});

prueba('saludo según la hora y avisos sin leer', () => {
  assert.equal(saludo(new Date(2026, 9, 18, 8)), 'Buenos días');
  assert.equal(saludo(new Date(2026, 9, 18, 15)), 'Buenas tardes');
  assert.equal(saludo(new Date(2026, 9, 18, 21)), 'Buenas noches');
  assert.equal(avisosSinLeer([{ unread: true }, { unread: false }, { unread: true }]), 2);
  assert.equal(avisosSinLeer(null), 0);
});

if (fallos) { console.error(`Inicio familias QA FAILED · ${fallos} de ${corridas}`); process.exit(1); }
console.log(`Inicio familias QA OK · ${corridas} casos: pendientes, lo próximo, cuándo es, saludo y avisos sin leer`);
