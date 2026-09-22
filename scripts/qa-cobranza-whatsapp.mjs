import assert from 'node:assert/strict';
import { preparaCobro, ladaDelClub, ligaDeCobro, mensajeDeCobro, faltaConfigurarElClub }
  from '../v2/cobranza-whatsapp.js';

const CLUB = '524792651338';   // el WhatsApp real de Tannery City, 12 dígitos
const pruebas = [];
const prueba = (nombre, fn) => pruebas.push([nombre, fn]);

prueba('un número con lada se usa tal cual', () => {
  const r = preparaCobro('+524771234567', CLUB);
  assert.equal(r.estado, 'ok');
  assert.equal(r.numero, '524771234567');
});

prueba('un número local de 10 dígitos toma la lada del club', () => {
  const r = preparaCobro('4776996600', CLUB);
  assert.equal(r.estado, 'ok');
  assert.equal(r.numero, '524776996600', 'la lada sale de restar los largos: 12 - 10 = 52');
});

prueba('sin teléfono se dice que falta, no se esconde el renglón', () => {
  for (const vacio of [null, undefined, '', '   ', 'sin dato']) {
    assert.equal(preparaCobro(vacio, CLUB).estado, 'sin_telefono');
  }
});

// EL CASO QUE MOTIVÓ TODO. Antes se mandaba a wa.me/4776996600, que no es un
// número incompleto: es el de otra persona, en otro país. Sin forma de deducir
// la lada, la respuesta correcta es negarse.
prueba('sin manera de deducir la lada, NO se arma un número inventado', () => {
  const r = preparaCobro('4776996600', '');          // el club no tiene WhatsApp
  assert.equal(r.estado, 'sin_lada');
  assert.equal(r.numero, null, 'jamás devolver un número a medias');
  assert.equal(ligaDeCobro({ numero: r.numero }), null, 'y sin número no hay liga');
});

prueba('una lada absurda se rechaza en vez de usarse', () => {
  // Club de 20 dígitos contra un local de 10: la resta daría una «lada» de 10.
  assert.equal(ladaDelClub('12345678901234567890', 10), null);
  assert.equal(preparaCobro('4776996600', '12345678901234567890').estado, 'sin_lada');
});

prueba('un local más largo que el del club no se completa', () => {
  assert.equal(ladaDelClub(CLUB, 14), null);
  assert.equal(preparaCobro('12345678901234', CLUB).estado, 'sin_lada');
});

prueba('el mensaje lleva el nombre del club, no uno escrito a mano', () => {
  const m = mensajeDeCobro({ club: 'Deportivo Ejemplo FC', tanner: 'Liam Santos', monto: '$1,600' });
  assert.match(m, /Deportivo Ejemplo FC/);
  assert.match(m, /Liam Santos/);
  assert.doesNotMatch(m, /Tannery City/, 'no puede venir un club escrito a mano');
});

prueba('la liga va a wa.me con el mensaje escapado', () => {
  const r = preparaCobro('+524771234567', CLUB);
  const liga = ligaDeCobro({ numero: r.numero, club: 'Tannery City FC', tanner: 'Ana Uc', monto: '$500' });
  assert.match(liga, /^https:\/\/wa\.me\/524771234567\?text=/);
  assert.ok(!/\s/.test(liga), 'el texto va codificado, sin espacios sueltos');
  assert.match(decodeURIComponent(liga.split('text=')[1]), /Ana Uc/);
});

prueba('el aviso del club distingue no tener WhatsApp de no poder deducir la lada', () => {
  const conProblema = [{ estado: 'sin_lada' }, { estado: 'ok' }];
  assert.equal(faltaConfigurarElClub('', conProblema), 'sin_whatsapp_del_club');
  assert.equal(faltaConfigurarElClub(CLUB, conProblema), 'lada_no_deducible');
  assert.equal(faltaConfigurarElClub('', [{ estado: 'ok' }]), null,
    'sin números incompletos no se molesta a nadie con un aviso');
  assert.equal(faltaConfigurarElClub('', [{ estado: 'sin_telefono' }]), null,
    'que a una familia le falte teléfono no es culpa de la configuración del club');
});

let fallos = 0;
for (const [nombre, fn] of pruebas) {
  try { fn(); } catch (e) { fallos += 1; console.error(` - ${nombre}: ${e.message}`); }
}
if (fallos) { console.error('Cobranza WhatsApp QA FAILED'); process.exit(1); }
console.log(`Cobranza WhatsApp QA OK · ${pruebas.length} casos, incluido el número sin lada`);
