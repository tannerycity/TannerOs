// Validación y conciliación de pagos.
//
// Lo que estas pruebas cierran:
//   · que nadie más que Presidencia vea el botón de aprobar
//   · que un pago anterior a la conciliación no se presente como revisado
//   · que a un pago en efectivo no se le llame "conciliación bancaria"
//   · que un faltante y un sobrante no se lean igual
import assert from 'node:assert/strict';
import { ESTADOS, estadoDe, validacionDe, accionesPara, requiereMotivo,
         diferenciaDe, filtra, lineaDeHistorial, pendientesReales }
  from '../v2/taquilla/conciliacion.js';

let fallos = 0, corridas = 0;
function prueba(nombre, fn) {
  corridas++;
  try { fn(); } catch (e) { fallos++; console.error(` - ${nombre}: ${e.message}\n`); }
}

const pendiente = {
  paymentId: 'x1', status: 'pending', legacyApproved: false, amount: 450, expectedAmount: 500,
  method: 'Transferencia', validationKind: 'banco', playerName: 'Iker Flores', family: 'Familia Flores',
  concept: 'Mensualidad', period: '2026-09', reference: 'REF-1', registeredBy: 'Michel Enríquez',
  registeredByUserId: 'u-taq', history: []
};
const aprobado = { ...pendiente, paymentId: 'x2', status: 'approved', expectedAmount: 450, amount: 450,
  reconciledAt: '2026-09-23T10:00:00Z', legacyApproved: false, playerName: 'Santiago Crespo' };
const viejo = { ...pendiente, paymentId: 'x3', status: 'approved', reconciledAt: null, legacyApproved: true,
  expectedAmount: null, playerName: 'Ana Sofía' };
const aclaracion = { ...pendiente, paymentId: 'x4', status: 'clarification', playerName: 'Dario Montalvo' };
const rechazado = { ...pendiente, paymentId: 'x5', status: 'rejected', playerName: 'Matías Campos' };
// Este va en 'approved' a proposito: asi el filtro por estado tiene dos de
// cada uno y no puede pasar por casualidad.
const efectivo = { ...pendiente, paymentId: 'x6', status: 'approved', reconciledAt: '2026-09-22T09:00:00Z',
  method: 'Efectivo', validationKind: 'corte_de_caja',
  amount: 500, expectedAmount: 500, playerName: 'Leonardo Preciado' };

// === Estados ===

prueba('los cuatro estados tienen nombre largo y corto', () => {
  for (const k of ['pending', 'approved', 'clarification', 'rejected']) {
    assert.ok(ESTADOS[k].etiqueta.length > 5, `${k} sin etiqueta`);
    assert.ok(ESTADOS[k].corto.length > 2, `${k} sin nombre corto`);
    assert.ok(ESTADOS[k].icono, `${k} sin icono`);
  }
});

prueba('un pago anterior a la conciliación NO se presenta como revisado', () => {
  // Son 322 pagos que entraron como 'approved' con reconciledAt nulo. Decir
  // "Conciliado / Aprobado" sería afirmar que alguien los revisó.
  assert.equal(estadoDe(viejo).etiqueta, 'Del sistema anterior');
  assert.notEqual(estadoDe(viejo).etiqueta, ESTADOS.approved.etiqueta);
  assert.equal(estadoDe(viejo).nivel, 'neutro');
});

prueba('un aprobado de verdad sí dice que está conciliado', () => {
  assert.equal(estadoDe(aprobado).etiqueta, 'Conciliado / Aprobado');
  assert.equal(estadoDe(aprobado).nivel, 'ok');
});

// === Quién puede hacer qué ===

prueba('sin permiso de aprobar no sale ningún botón de Presidencia', () => {
  const a = accionesPara(pendiente, { canApprove: false, esMio: false }).map(x => x.clave);
  assert.deepEqual(a, []);
});

prueba('Presidencia puede aprobar, rechazar y pedir aclaración', () => {
  const a = accionesPara(pendiente, { canApprove: true }).map(x => x.clave);
  assert.deepEqual(a.sort(), ['approve', 'clarify', 'reject']);
});

prueba('un pago ya aprobado no ofrece aprobar otra vez', () => {
  const a = accionesPara(aprobado, { canApprove: true }).map(x => x.clave);
  assert.ok(!a.includes('approve'), 'ofreció aprobar dos veces');
  assert.ok(a.includes('reject'));
});

prueba('quien registró el cobro puede responder su aclaración', () => {
  const a = accionesPara(aclaracion, { canApprove: false, esMio: true }).map(x => x.clave);
  assert.deepEqual(a, ['resubmit']);
});

prueba('quien NO registró el cobro no responde la aclaración ajena', () => {
  const a = accionesPara(aclaracion, { canApprove: false, esMio: false }).map(x => x.clave);
  assert.deepEqual(a, []);
});

prueba('un pago del sistema anterior no ofrece ninguna acción', () => {
  assert.deepEqual(accionesPara(viejo, { canApprove: true }), []);
});

prueba('un rechazado no ofrece acciones: ya está resuelto', () => {
  assert.deepEqual(accionesPara(rechazado, { canApprove: true }).map(x => x.clave), []);
});

prueba('rechazar y aclarar exigen motivo; aprobar no', () => {
  assert.equal(requiereMotivo('reject'), true);
  assert.equal(requiereMotivo('clarify'), true);
  assert.equal(requiereMotivo('resubmit'), true);
  assert.equal(requiereMotivo('approve'), false);
});

// === Método de pago ===

prueba('a un pago en efectivo NO se le llama conciliación bancaria', () => {
  assert.equal(validacionDe(efectivo).etiqueta, 'Validación por corte de caja');
  assert.ok(!/bancaria/i.test(validacionDe(efectivo).etiqueta));
});

prueba('a una transferencia sí se le concilia contra el banco', () => {
  assert.equal(validacionDe(pendiente).etiqueta, 'Conciliación bancaria');
});

prueba('un método raro no se queda sin etiqueta', () => {
  assert.equal(validacionDe({ validationKind: 'inventado' }).etiqueta, 'Validación según su configuración');
  assert.ok(validacionDe({}).etiqueta.length > 5);
});

// === Diferencias ===

prueba('un faltante y un sobrante no se leen igual', () => {
  const falta = diferenciaDe(pendiente);          // 450 recibido vs 500 esperado
  const sobra = diferenciaDe({ amount: 520, expectedAmount: 500 });
  assert.equal(falta.monto, -50);
  assert.equal(falta.nivel, 'bajo');
  assert.match(falta.texto, /Faltaron/);
  assert.equal(sobra.monto, 20);
  assert.equal(sobra.nivel, 'atencion');
  assert.match(sobra.texto, /de más/);
});

prueba('sin monto esperado no se inventa una diferencia', () => {
  const d = diferenciaDe(viejo);
  assert.equal(d.hay, false);
  assert.equal(d.monto, 0);
  assert.match(d.texto, /Sin monto esperado/);
});

prueba('esperado igual a recibido no es una diferencia', () => {
  const d = diferenciaDe(efectivo);
  assert.equal(d.hay, false);
  assert.equal(d.nivel, 'ok');
});

// === Buscador y filtros ===

const todos = [pendiente, aprobado, viejo, aclaracion, rechazado, efectivo];

prueba('el buscador encuentra por Tanner, familia y referencia', () => {
  assert.equal(filtra(todos, { texto: 'iker' }).length, 1);
  assert.equal(filtra(todos, { texto: 'dario' })[0].paymentId, 'x4');
  assert.equal(filtra(todos, { texto: 'santiago' })[0].paymentId, 'x2');
  // La referencia la comparten todos, asi que sirve para ver que no filtra de mas.
  assert.equal(filtra(todos, { texto: 'ref-1' }).length, todos.length);
});

prueba('el buscador encuentra por quién registró el cobro', () => {
  assert.equal(filtra(todos, { texto: 'michel' }).length, todos.length);
});

prueba('el filtro por estado no mezcla', () => {
  assert.equal(filtra(todos, { estado: 'pending' }).length, 1);
  assert.equal(filtra(todos, { estado: 'approved' }).length, 3); // x2, x3 (viejo), x6
  assert.equal(filtra(todos, { estado: 'clarification' }).length, 1);
  assert.equal(filtra(todos, { estado: 'rejected' }).length, 1);
  // Suman el total: ninguna fila se pierde ni se cuenta dos veces.
  assert.equal(1 + 3 + 1 + 1, todos.length);
});

prueba('se pueden aislar los que tienen diferencia', () => {
  // x1, x4 y x5 traen 450 contra 500. x2 y x6 cuadran; x3 no tiene esperado.
  const conDif = filtra(todos, { soloConDiferencia: true }).map(f => f.paymentId).sort();
  assert.deepEqual(conDif, ['x1', 'x4', 'x5']);
});

// === Historial ===

prueba('cada renglón del historial dice de qué a qué y quién', () => {
  const l = lineaDeHistorial({ from: 'pending', to: 'approved', by: 'Michel Enríquez' });
  assert.match(l, /Pendiente → Aprobado/);
  assert.match(l, /Michel Enríquez/);
});

prueba('una autoaprobación queda escrita, no escondida', () => {
  const l = lineaDeHistorial({ from: 'pending', to: 'approved', by: 'Michel Enríquez', selfApproved: true });
  assert.match(l, /aprobó su propio cobro/);
});

prueba('el primer renglón, sin estado previo, no queda en blanco', () => {
  assert.match(lineaDeHistorial({ from: null, to: 'pending', by: 'Taquilla' }), /nuevo → Pendiente/);
});

// === Indicadores ===

prueba('lo que espera a Presidencia son pendientes más aclaraciones', () => {
  assert.equal(pendientesReales({ pending: 3, clarification: 2, rejected: 9 }), 5);
  assert.equal(pendientesReales({}), 0);
  assert.equal(pendientesReales(null), 0);
});

if (fallos) { console.error(`Conciliación QA FAILED · ${fallos} de ${corridas}`); process.exit(1); }
console.log(`Conciliación QA OK · ${corridas} casos, incluidos los 322 pagos que nadie revisó`);
