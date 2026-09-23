// Estadísticas de asistencia.
//
// El caso decisivo es el primer bloque: el porcentaje se calcula SOLO sobre
// las listas marcadas. Medido en producción, 211 de 518 pares (sesión ×
// Tanner inscrito) no tienen registro. Si esos contaran como falta, el club
// pasaría de 71.3% a 42.3% de la noche a la mañana y le colgaríamos ausencias
// a Tanners que sí fueron.
import assert from 'node:assert/strict';
import { metaDe, estadoDeAsistencia, porcentaje, confianza, tendencia,
         rangoDe, iso, etiquetaDeEstado, desgloseDeFaltas,
         textoDeContadorOpcional, META_ORDINARIA, META_BECADO }
  from '../v2/asistencia/estadisticas.js';

let fallos = 0, corridas = 0;
function prueba(nombre, fn) {
  corridas++;
  try { fn(); } catch (e) { fallos++; console.error(` - ${nombre}: ${e.message}\n`); }
}

// === El porcentaje no castiga lo que nadie marcó ===

prueba('el porcentaje se calcula sobre lo marcado, no sobre lo programado', () => {
  // Los números reales de julio–septiembre 2026 en producción.
  const asistencias = 219, marcadas = 307, programadas = 518;
  assert.equal(porcentaje(asistencias, marcadas), 71.3);
  // Lo que habría salido contando los sin marcar como falta:
  assert.equal(porcentaje(asistencias, programadas), 42.3);
});

prueba('sin ninguna lista marcada el porcentaje es nulo, no cero', () => {
  // Un cero diría "no fue nadie". Nulo dice "no sabemos", que es la verdad.
  assert.equal(porcentaje(0, 0), null);
  assert.equal(porcentaje(5, 0), null);
});

prueba('la confianza avisa cuando el porcentaje se sostiene de pocas listas', () => {
  // 307 de 518 = 59.3% de cobertura. Cae en 'bajo' a proposito: con cuatro de
  // cada diez listas sin cerrar, el 71.3% de arriba no se puede presentar solo.
  assert.equal(confianza(307, 518).nivel, 'bajo');
  assert.equal(confianza(307, 518).cobertura, 59.3);
  assert.equal(confianza(10, 10).nivel, 'ok');
  assert.equal(confianza(7, 10).nivel, 'atencion');
  assert.equal(confianza(2, 10).nivel, 'bajo');
  assert.equal(confianza(0, 0).nivel, 'sindato');
});

// === Metas y semáforo ===

prueba('la meta del becado es más alta que la del ordinario', () => {
  assert.equal(metaDe(false), META_ORDINARIA);
  assert.equal(metaDe(true), META_BECADO);
  assert.equal(META_ORDINARIA, 80);
  assert.equal(META_BECADO, 90);
});

prueba('el mismo 85% es verde para el ordinario y rojo-ámbar para el becado', () => {
  assert.equal(estadoDeAsistencia(85, metaDe(false)).nivel, 'ok');
  assert.equal(estadoDeAsistencia(85, metaDe(true)).nivel, 'atencion');
});

prueba('cada nivel trae texto e icono, nunca color solo', () => {
  for (const pct of [100, 85, 75, 40, null]) {
    const e = estadoDeAsistencia(pct, 80);
    assert.ok(e.etiqueta && e.etiqueta.length > 2, `sin etiqueta en ${pct}`);
    assert.ok(e.icono && e.icono.length >= 1, `sin icono en ${pct}`);
    assert.ok(e.texto && e.texto.length > 5, `sin texto en ${pct}`);
  }
});

prueba('sin dato no se pinta ni verde ni rojo', () => {
  assert.equal(estadoDeAsistencia(null, 80).nivel, 'sindato');
  assert.equal(estadoDeAsistencia(undefined, 80).nivel, 'sindato');
});

prueba('justo en la meta ya cuenta como en objetivo', () => {
  assert.equal(estadoDeAsistencia(80, 80).nivel, 'ok');
  assert.equal(estadoDeAsistencia(79.9, 80).nivel, 'atencion');
  assert.equal(estadoDeAsistencia(69.9, 80).nivel, 'bajo');
});

// === Tendencia ===

prueba('menos de un punto de diferencia no es tendencia, es ruido', () => {
  assert.equal(tendencia(80.4, 80).direccion, 'igual');
  assert.equal(tendencia(81.5, 80).direccion, 'sube');
  assert.equal(tendencia(78, 80).direccion, 'baja');
});

prueba('sin periodo anterior no se inventa una tendencia', () => {
  assert.equal(tendencia(80, null).direccion, 'nueva');
  assert.equal(tendencia(null, 80).direccion, 'nueva');
  assert.equal(tendencia(80, null).delta, null);
});

// === Rangos de fecha ===

prueba('la semana arranca en lunes, no en domingo', () => {
  // 2026-09-23 es miércoles.
  const r = rangoDe('semana', new Date(2026, 8, 23));
  assert.equal(r.desde, '2026-09-21'); // lunes
  assert.equal(r.hasta, '2026-09-27'); // domingo
});

prueba('un domingo pertenece a la semana que ya terminó', () => {
  // 2026-09-27 es domingo: su lunes es el 21, no el 28.
  const r = rangoDe('semana', new Date(2026, 8, 27));
  assert.equal(r.desde, '2026-09-21');
  assert.equal(r.hasta, '2026-09-27');
});

prueba('el mes va del día 1 al último real, no a 30 fijo', () => {
  assert.deepEqual(
    { d: rangoDe('mes', new Date(2026, 1, 10)).desde, h: rangoDe('mes', new Date(2026, 1, 10)).hasta },
    { d: '2026-02-01', h: '2026-02-28' });
  assert.equal(rangoDe('mes', new Date(2026, 0, 10)).hasta, '2026-01-31');
});

prueba('el mes pasado cruza bien el cambio de año', () => {
  const r = rangoDe('mesPasado', new Date(2026, 0, 15));
  assert.equal(r.desde, '2025-12-01');
  assert.equal(r.hasta, '2025-12-31');
});

prueba('iso no se recorre por zona horaria', () => {
  assert.equal(iso(new Date(2026, 8, 1)), '2026-09-01');
  assert.equal(iso(new Date(2026, 11, 31)), '2026-12-31');
});

// === Faltas justificadas ===

prueba('una justificada cuenta como falta y además se identifica', () => {
  const d = desgloseDeFaltas({ absences: 5, excused: 2 });
  assert.equal(d.faltas, 5);
  assert.equal(d.justificadas, 2);
  assert.equal(d.sinJustificar, 3);
});

prueba('el desglose nunca da negativos aunque lleguen datos raros', () => {
  assert.equal(desgloseDeFaltas({ absences: 1, excused: 4 }).sinJustificar, 0);
  assert.equal(desgloseDeFaltas({}).faltas, 0);
  assert.equal(desgloseDeFaltas(null).faltas, 0);
});

prueba('justificado y ausente no se pintan igual', () => {
  assert.notEqual(etiquetaDeEstado('excused').nivel, etiquetaDeEstado('absent').nivel);
  assert.equal(etiquetaDeEstado('late').texto, 'Llegó tarde');
  assert.equal(etiquetaDeEstado(null).texto, 'Sin marcar');
  assert.equal(etiquetaDeEstado('inventado').texto, 'Sin marcar');
});

// === El cero que no es cero ===

prueba('un cero explica que nadie lo registra, en vez de mentir', () => {
  // Retardos y justificadas llevan 0 usos en producción desde el día uno.
  assert.match(textoDeContadorOpcional(0, 307, 'retardos'), /aún no se registran/);
  assert.equal(textoDeContadorOpcional(3, 307, 'retardos'), '3');
  // Sin listas marcadas no se dice nada de nada.
  assert.equal(textoDeContadorOpcional(0, 0, 'retardos'), '—');
});

if (fallos) { console.error(`Asistencia stats QA FAILED · ${fallos} de ${corridas}`); process.exit(1); }
console.log(`Asistencia stats QA OK · ${corridas} casos, incluido el 40% de listas sin marcar`);
