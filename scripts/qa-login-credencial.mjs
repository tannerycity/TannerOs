// Verifica la conversión de "Usuario o correo" al correo real y, sobre todo,
// el mensaje cuando el servidor rechaza la credencial.
//
// El caso que importa: michel_enriquez, Presidencia y Ricardo Crespo tienen
// correo de verdad. Escribir su usuario manda una cuenta inexistente al
// servidor, y el mensaje viejo ("contraseña incorrecta") mandaba a la persona
// a resetear una contraseña que estaba bien.
import assert from 'node:assert/strict';
import {credencialACorreo, esCorreo, mensajeDeCredencialRechazada, DOMINIO_INTERNO}
  from '../v2/login-credencial.js';

let fallos = 0, corridas = 0;
function prueba(nombre, fn) {
  corridas++;
  try { fn(); } catch (e) { fallos++; console.error(` - ${nombre}: ${e.message}\n`); }
}

prueba('un usuario de staff se completa con el dominio interno', () => {
  assert.equal(credencialACorreo('brandon'), `brandon${DOMINIO_INTERNO}`);
});

prueba('un correo completo se respeta tal cual', () => {
  assert.equal(credencialACorreo('michel_enriquez@icloud.com'), 'michel_enriquez@icloud.com');
  assert.equal(credencialACorreo('tannery.city.1850@gmail.com'), 'tannery.city.1850@gmail.com');
});

prueba('se normaliza acento, espacio y mayúscula', () => {
  assert.equal(credencialACorreo('  Martín Pérez '), `martin_perez${DOMINIO_INTERNO}`);
});

prueba('EL CASO: al usuario a secas NO se le dice "contraseña incorrecta"', () => {
  const m = mensajeDeCredencialRechazada('Presidencia');
  assert.ok(/correo/i.test(m), 'tiene que mencionar el correo');
  assert.ok(/completo/i.test(m), 'y decir que se escriba completo');
  assert.ok(!/^Usuario, correo o contraseña incorrectos\.$/.test(m),
    'el mensaje viejo mandaba a resetear una contraseña que estaba bien');
});

prueba('el mensaje repite lo que la persona escribió, para que vea el error', () => {
  assert.ok(mensajeDeCredencialRechazada('Presidencia').includes('Presidencia'));
});

prueba('con un correo completo sí es el mensaje genérico', () => {
  assert.equal(mensajeDeCredencialRechazada('michel_enriquez@icloud.com'),
    'Usuario, correo o contraseña incorrectos.');
});

prueba('NO revela si la cuenta existe: mismo texto para cualquier usuario', () => {
  // "brandon" sí existe como cuenta de staff; "xyz_no_existe" no. Si el texto
  // cambiara entre los dos, cualquiera podría sondear nombres desde la pantalla
  // de entrada y averiguar quién tiene cuenta en el club.
  const a = mensajeDeCredencialRechazada('brandon').replace('brandon', 'X');
  const b = mensajeDeCredencialRechazada('xyz_no_existe').replace('xyz_no_existe', 'X');
  assert.equal(a, b, 'el mensaje no puede delatar qué usuarios existen');
});

prueba('esCorreo distingue usuario de correo', () => {
  assert.equal(esCorreo('brandon'), false);
  assert.equal(esCorreo('a@b.com'), true);
});

if (fallos) { console.error(`Login credencial QA FAILED · ${fallos} de ${corridas}`); process.exit(1); }
console.log(`Login credencial QA OK · ${corridas} casos, incluido el usuario con correo real`);
