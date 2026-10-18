// Invitaciones al portal de familias: las reglas (v2/invitaciones/invitaciones.js), sin navegador.
import assert from 'node:assert/strict';
import { telefono10, correoDeEntrada, enmascara, conEspacios, primeraPalabra, ligaDeInvitacion, tokenDeLiga,
         hijosEnTexto, mensajeDeInvitacion, ligaWhatsApp, estadoDeFamilia, DOMINIO_FAMILIAS } from '../v2/invitaciones/invitaciones.js';

let fallos = 0, corridas = 0;
function prueba(nombre, fn) { corridas++; try { fn(); } catch (e) { fallos++; console.error(` - ${nombre}: ${e.message}`); } }
const TOKEN = 'a'.repeat(32) + '0123456789abcdef0123456789abcdef';

prueba('teléfono a 10 dígitos, como venga escrito', () => {
  assert.equal(telefono10('+52 477 123 4567'), '4771234567');
  assert.equal(telefono10('+523316613357'), '3316613357');
  assert.equal(telefono10('477-123-45-67'), '4771234567');
  assert.equal(telefono10('12345'), null);
  assert.equal(telefono10(null), null);
});

prueba('se entra con el teléfono, el usuario de antes o el correo', () => {
  assert.equal(correoDeEntrada('477 123 4567'), `4771234567@${DOMINIO_FAMILIAS}`);
  assert.equal(correoDeEntrada('+52 (477) 123-4567'), `4771234567@${DOMINIO_FAMILIAS}`);
  assert.equal(correoDeEntrada('  Mamá Pérez '), `mama_perez@${DOMINIO_FAMILIAS}`);
  assert.equal(correoDeEntrada('Ana@Correo.com'), 'ana@correo.com');
  assert.equal(correoDeEntrada(''), '');
});

prueba('enmascarar y dictar el teléfono', () => {
  assert.equal(enmascara('4771234567'), '477•••4567');
  assert.equal(conEspacios('4771234567'), '477 123 4567');
  assert.equal(conEspacios('mama_perez'), 'mama_perez');
});

prueba('se saluda con el primer nombre aunque venga el nombre completo', () => {
  assert.equal(primeraPalabra('Adriana Elizabeth Sánchez Alvarado'), 'Adriana');
  assert.equal(primeraPalabra(''), '');
});

prueba('la liga lleva el token en el # y se lee de vuelta', () => {
  const liga = ligaDeInvitacion('https://app.tannerycity.com/', TOKEN);
  assert.equal(liga, `https://app.tannerycity.com/familias/#i=${TOKEN}`);
  assert.equal(tokenDeLiga(`#i=${TOKEN}`), TOKEN);
  assert.equal(tokenDeLiga(`#tab=x&i=${TOKEN}`), TOKEN);
  assert.equal(tokenDeLiga('#i=corto'), null);
  assert.equal(tokenDeLiga(''), null);
});

prueba('hijos en texto', () => {
  assert.equal(hijosEnTexto([{ primerNombre: 'Gianluca', categoria: 'T10' }, { primerNombre: 'Sofía Isabel', categoria: 'Baby Tanner' }]), 'Gianluca (T10) y Sofía (Baby Tanner)');
  assert.equal(hijosEnTexto([{ nombre: 'Leo', categoria: null }]), 'Leo');
  assert.equal(hijosEnTexto([]), '');
});

prueba('mensaje de invitación: nombre, hijos, liga y usuario', () => {
  const m = mensajeDeInvitacion({ club: 'Tannery City FC', tutor: 'Adriana Elizabeth', hijos: [{ primerNombre: 'Jorge Alfonso', categoria: 'T10' }],
    liga: 'https://x/familias/#i=t', usuario: '4771234567', purpose: 'invite' });
  assert.match(m, /^Hola Adriana, te saluda Tannery City FC\./);
  assert.match(m, /todo lo de Jorge desde tu celular/);
  assert.match(m, /https:\/\/x\/familias\/#i=t/);
  assert.match(m, /Tu usuario será tu teléfono: 477 123 4567$/);
  assert.doesNotMatch(m, /\(T10\)/);
});

prueba('mensaje para recuperar contraseña', () => {
  const m = mensajeDeInvitacion({ club: 'Tannery City FC', tutor: 'Ana', liga: 'L', usuario: 'mama_perez', purpose: 'reset' });
  assert.match(m, /contraseña nueva/); assert.match(m, /Tu usuario es: mama_perez$/);
});

prueba('liga de WhatsApp con lada de México', () => {
  assert.equal(ligaWhatsApp('4771234567', 'Hola y adiós'), 'https://wa.me/524771234567?text=Hola%20y%20adi%C3%B3s');
});

prueba('estado de cada familia', () => {
  const ahora = Date.parse('2026-10-18T12:00:00Z');
  assert.equal(estadoDeFamilia({ tieneCuenta: true, ultimaEntrada: '2026-10-10T00:00:00Z' }, ahora).k, 'activa');
  assert.equal(estadoDeFamilia({ tieneCuenta: true, ultimaEntrada: '2026-08-01T00:00:00Z' }, ahora).k, 'cuenta');
  assert.equal(estadoDeFamilia({ tieneCuenta: true, ultimaEntrada: null }, ahora).k, 'cuenta');
  assert.equal(estadoDeFamilia({ tieneCuenta: false, telefono: null }, ahora).k, 'sintel');
  assert.equal(estadoDeFamilia({ tieneCuenta: false, telefono: '4771234567', invitada: '2026-10-17' }, ahora).k, 'invitada');
  assert.equal(estadoDeFamilia({ tieneCuenta: false, telefono: '4771234567' }, ahora).k, 'pendiente');
});

if (fallos) { console.error(`Invitaciones QA FAILED · ${fallos} de ${corridas}`); process.exit(1); }
console.log(`Invitaciones QA OK · ${corridas} casos: teléfono, entrada, liga, mensaje y estado de cada familia`);
