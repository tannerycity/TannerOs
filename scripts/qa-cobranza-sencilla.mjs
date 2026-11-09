// Cobranza sencilla (h66, 08/11/2026): las cuentas y los textos de
// v2/taquilla/cobranza.js, sin navegador.
import assert from 'node:assert/strict';
import { resumenCobranza, filtraCobranza, textoEstado } from '../v2/taquilla/cobranza.js';

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const fecha = d => new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(new Date(`${d}T12:00:00`)).replace('.', '');

const r = resumenCobranza({ month: '2026-11-01', expected: 38100, collected: 19450, upcoming: 0, overdue: 39688 });
ok(r.pct === 51 && r.mes === 'noviembre', 'el % sale de cobrado entre esperado');
ok(resumenCobranza({ expected: 0, collected: 0 }).pct === 0, 'sin esperado no divide entre cero');
ok(resumenCobranza(null) === null, 'sin datos, sin resumen');

const P = [
  { playerId: 'a', name: 'Beto', state: 'al_dia' },
  { playerId: 'b', name: 'Ana', state: 'atrasado', oldestDue: '2026-10-05', guardian: 'Rosa' },
  { playerId: 'c', name: 'Carla', state: 'atrasado', oldestDue: '2026-09-05' },
  { playerId: 'd', name: 'Dani', state: 'por_vencer' }];
ok(filtraCobranza(P).map(p => p.playerId).join() === 'c,b,d,a', 'atrasados primero, el más viejo arriba; luego por vencer y al día');
ok(filtraCobranza(P, { filtro: 'atrasado' }).length === 2, 'filtro Atrasados');
ok(filtraCobranza(P, { filtro: 'al_dia' })[0].playerId === 'a', 'filtro Al día');
ok(filtraCobranza(P, { filtro: 'agreement', acuerdos: new Map([['d', {}]]) })[0].playerId === 'd', 'filtro Con acuerdo');
ok(filtraCobranza(P, { busca: 'rosa' })[0].playerId === 'b', 'busca también por el tutor');

ok(textoEstado({ state: 'atrasado', overdue: 900, oldestDue: '2026-10-05', guardian: 'Rosa Ruiz' }, fecha, money) === 'Debe $900.00 desde el 5 oct · Rosa Ruiz', 'atrasado: cuánto y desde cuándo');
ok(/vence el 5 dic/.test(textoEstado({ state: 'por_vencer', upcoming: 500, nextDue: '2026-12-05' }, fecha, money)), 'por vencer: cuándo vence');
ok(textoEstado({ state: 'al_dia', lastPayment: '2026-11-03' }, fecha, money) === 'Al día · último pago 3 nov', 'al día: su último pago');
console.log(`Cobranza sencilla OK · ${n} revisiones: % del mes, orden y filtros, textos por familia`);
