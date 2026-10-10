// Leer la lista de jugadores de un club (v2/jugadores/importar/leer.js),
// sin navegador: pegado de Excel, CSV, columnas, nombres y fechas.
import assert from 'node:assert/strict';
import { leeTabla, detectaColumnas, pareceEncabezado, partirNombre, fechaISO, filasParaImportar, PLANTILLA } from '../v2/jugadores/importar/leer.js';

let fallos = 0, corridas = 0;
function prueba(nombre, fn) { corridas++; try { fn(); } catch (e) { fallos++; console.error(` - ${nombre}: ${e.message}`); } }

prueba('pegado de Excel (tabuladores) y renglones vacíos', () => {
  assert.deepEqual(leeTabla('Nombre\tCategoría\r\nLeo\tSub-8\r\n\t\r\nMía\tSub-10\r\n'), [['Nombre', 'Categoría'], ['Leo', 'Sub-8'], ['Mía', 'Sub-10']]);
});
prueba('CSV con comas, punto y coma y comillas', () => {
  assert.deepEqual(leeTabla('a,b\n"Pérez, Juan","dijo ""hola"""'), [['a', 'b'], ['Pérez, Juan', 'dijo "hola"']]);
  assert.deepEqual(leeTabla('﻿a;b\n1;2'), [['a', 'b'], ['1', '2']]);
});
prueba('columnas por encabezado, con acentos y sinónimos', () => {
  const m = detectaColumnas(['Nombre(s)', 'Apellidos', 'Fecha de Nacimiento', 'CATEGORÍA', 'Mamá', 'Celular', 'Correo', 'Dorsal', 'Mensualidad']);
  assert.deepEqual(m, { firstName: 0, lastName: 1, birthDate: 2, category: 3, guardianName: 4, phone: 5, email: 6, jerseyNumber: 7, monthlyFee: 8 });
});
prueba('"Nombre" sin apellidos es el nombre completo', () => {
  assert.deepEqual(detectaColumnas(['Nombre', 'Cat']), { nombreCompleto: 0, category: 1 });
});
prueba('encabezado o datos', () => {
  assert.equal(pareceEncabezado(['Nombre', 'Categoría', 'Teléfono']), true);
  assert.equal(pareceEncabezado(['Leo Pérez', 'Sub-8', '4771234567']), false);
});
prueba('nombre completo a nombre y apellidos', () => {
  assert.deepEqual(partirNombre('Juan Carlos Pérez López'), { firstName: 'Juan Carlos', lastName: 'Pérez López' });
  assert.deepEqual(partirNombre('Leo Pérez'), { firstName: 'Leo', lastName: 'Pérez' });
  assert.deepEqual(partirNombre('Leo'), { firstName: 'Leo', lastName: '' });
});
prueba('fechas como las escribe un club en México', () => {
  assert.equal(fechaISO('04/03/2017'), '2017-03-04');
  assert.equal(fechaISO('4-3-17'), '2017-03-04');
  assert.equal(fechaISO('2017-03-04'), '2017-03-04');
  assert.equal(fechaISO('4 de marzo de 2017'), '2017-03-04');
  assert.equal(fechaISO('42798'), '2017-03-04');
  assert.equal(fechaISO('31/02/2017'), 'invalida');
  assert.equal(fechaISO('mañana'), 'invalida');
  assert.equal(fechaISO(''), '');
});
prueba('filas para el servidor: apellido materno, fecha y vacíos fuera', () => {
  const datos = [['Leo', 'Pérez', 'López', '04/03/2017'], ['', '', '', ''], ['Mía', 'Gómez', '', 'ayer']];
  const f = filasParaImportar(datos, { firstName: 0, lastName: 1, lastName2: 2, birthDate: 3 });
  assert.equal(f.length, 2);
  assert.equal(f[0].lastName, 'Pérez López'); assert.equal(f[0].birthDate, '2017-03-04');
  assert.equal(f[1].birthDate, 'ayer', 'una fecha que no se entiende se manda tal cual y el servidor avisa');
});
prueba('la plantilla se lee sola', () => {
  const t = leeTabla(PLANTILLA);
  const f = filasParaImportar(t.slice(1), detectaColumnas(t[0]));
  assert.equal(f[0].firstName, 'Leonardo'); assert.equal(f[0].birthDate, '2017-03-04'); assert.equal(f[0].monthlyFee, '500');
});

if (fallos) { console.error(`Importar (lectura) QA FAILED · ${fallos} de ${corridas}`); process.exit(1); }
console.log(`Importar (lectura) QA OK · ${corridas} casos: pegado, CSV, columnas, nombres, fechas y plantilla`);
