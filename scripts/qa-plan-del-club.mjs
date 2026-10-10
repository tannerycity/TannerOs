// El plan de un club (v2/admin/plan.js), sin navegador: uso, extras, ingreso
// y lo que lee el dueño en "Tu plan".
import assert from 'node:assert/strict';
import { usoDelPlan, ingresoMensual, textoDelPlan } from '../v2/admin/plan.js';

let fallos = 0, corridas = 0;
function prueba(nombre, fn) { corridas++; try { fn(); } catch (e) { fallos++; console.error(` - ${nombre}: ${e.message}`); } }
const CANTERA = { code: 'cantera', priceMxn: 990, maxPlayers: 50, extraPlayerMxn: 15 };
const SELECCION = { code: 'seleccion', priceMxn: 3490, maxPlayers: null, extraPlayerMxn: 0 };

prueba('dentro del plan no hay extras', () => assert.deepEqual(usoDelPlan(30, CANTERA), { activos: 30, max: 50, extra: 0, extraMxn: 0, cerca: false }));
prueba('al 90% avisa que está cerca', () => assert.equal(usoDelPlan(45, CANTERA).cerca, true));
prueba('pasado el límite cobra cada extra', () => {
  const u = usoDelPlan(53, CANTERA); assert.equal(u.extra, 3); assert.equal(u.extraMxn, 45); assert.equal(u.cerca, false);
});
prueba('sin límite nunca hay extras', () => assert.equal(usoDelPlan(400, SELECCION).extra, 0));
prueba('ingreso: plan (fundador a mitad) más extras a precio completo', () => {
  const clubes = [{ planCode: 'cantera', founder: true, players: 53 }, { planCode: 'seleccion', founder: false, players: 400 }, { planCode: 'internal_full', players: 120 }];
  assert.equal(ingresoMensual(clubes, [CANTERA, SELECCION]), 495 + 45 + 3490);
});
prueba('Tu plan: lugares que quedan', () => {
  const t = textoDelPlan({ plan: 'Cantera', priceMxn: 990, maxPlayers: 50, extraPlayerMxn: 15, activePlayers: 20, docsPending: 0 });
  assert.match(t.texto, /20 de 50 jugadores\. Te quedan 30 lugares/); assert.equal(t.tono, 'ok'); assert.equal(t.barra, 40); assert.equal(t.docs, '');
});
prueba('Tu plan: con extras dice cuánto cuestan', () => {
  const t = textoDelPlan({ priceMxn: 990, maxPlayers: 50, extraPlayerMxn: 15, activePlayers: 53, founder: true, docsPending: 1 });
  assert.match(t.texto, /Los 3 de más se cobran a \$15 cada uno \(\$45 al mes\)/);
  assert.match(t.precio, /\$495\/mes · club fundador/);
  assert.equal(t.tono, 'extra'); assert.equal(t.barra, 100);
  assert.match(t.docs, /domicilio y tu correo de contacto/);
});

if (fallos) { console.error(`Plan del club QA FAILED · ${fallos} de ${corridas}`); process.exit(1); }
console.log(`Plan del club QA OK · ${corridas} casos: uso, aviso de límite, extras, ingreso y "Tu plan"`);
