// Encuestas: las cuentas de los resultados (v2/encuestas/encuestas.js), sin navegador.
import assert from 'node:assert/strict';
import { TEMAS, ESCALA, VISITAS, ENCUESTA_COMUNIDAD, nps, semaforo, resumen, mensajeDeEncuesta, csvDeComentarios, etiquetaTema } from '../v2/encuestas/encuestas.js';

let fallos = 0, corridas = 0;
function prueba(nombre, fn) { corridas++; try { fn(); } catch (e) { fallos++; console.error(` - ${nombre}: ${e.message}`); } }

// Lo mismo que la base guarda en private.survey_rating_keys().
prueba('los 9 temas son los que valida la base', () => {
  assert.deepEqual(TEMAS.map(t => t.k), ['ambiente', 'instalaciones', 'estacionamiento', 'banos', 'tienda', 'partido', 'papas', 'staff', 'seguridad']);
  assert.deepEqual(TEMAS.filter(t => t.opcional).map(t => t.k), ['estacionamiento', 'banos', 'tienda']);
  assert.equal(ESCALA.length, 5);
  assert.equal(etiquetaTema('banos'), 'Baños');
});

prueba('a qué vino y la encuesta de comunidad', () => {
  assert.deepEqual(VISITAS.map(v => v.k), ['entrenamientos', 'partidos', 'torneos', 'eventos']);
  assert.equal(ENCUESTA_COMUNIDAD, 'comunidad');
});

prueba('NPS: % promotores menos % detractores; sin respuestas es null', () => {
  assert.equal(nps({ n: 10, promotores: 6, detractores: 2 }), 40);
  assert.equal(nps({ n: 3, promotores: 0, detractores: 3 }), -100);
  assert.equal(nps({ n: 0, promotores: 0, detractores: 0 }), null);
  assert.equal(nps(null), null);
});

prueba('semáforo con palabra: 4.3 fuerte, 3.5 bien, abajo atender', () => {
  assert.equal(semaforo(4.3).k, 'bien'); assert.equal(semaforo(4.29).k, 'regular');
  assert.equal(semaforo(3.5).k, 'regular'); assert.equal(semaforo(3.49).t, 'Atender');
  assert.equal(semaforo(null), null);
});

const RES = {
  total: 6, porTipo: { tanner: 4, visitante: 2 },
  temas: [
    { tema: 'ambiente', tipo: 'tanner', promedio: 5, n: 4 }, { tema: 'ambiente', tipo: 'visitante', promedio: 4.5, n: 2 },
    { tema: 'banos', tipo: 'tanner', promedio: 4, n: 3 }, { tema: 'banos', tipo: 'visitante', promedio: 2, n: 2 },
    { tema: 'estacionamiento', tipo: 'tanner', promedio: 3, n: 4 },
    { tema: 'papas', tipo: 'visitante', promedio: 4, n: 1 },
    { tema: 'tienda', tipo: 'tanner', promedio: 4.5, n: 2 }
  ],
  nps: { n: 5, promotores: 3, detractores: 1 },
  npsPorTipo: { tanner: { n: 4, promotores: 3, detractores: 0 }, visitante: { n: 1, promotores: 0, detractores: 1 } },
  comentarios: []
};

prueba('promedio general por tema pesa por votos de cada tipo', () => {
  const r = resumen(RES);
  const amb = r.temas.find(t => t.k === 'ambiente');
  assert.equal(amb.n, 6); assert.equal(amb.promedio, 4.83);
  assert.equal(r.temas.find(t => t.k === 'banos').promedio, 3.2);
  assert.equal(r.temas.find(t => t.k === 'seguridad').promedio, null);
  assert.equal(r.temas.length, 9);
});

prueba('lo más fuerte, lo que hay que atender y dónde opinan distinto', () => {
  const r = resumen(RES);
  assert.deepEqual(r.fuertes.map(t => t.k), ['ambiente', 'tienda', 'papas']);
  assert.deepEqual(r.atender.map(t => t.k), ['estacionamiento', 'banos']);
  assert.deepEqual(r.brechas.map(t => [t.k, t.brecha]), [['banos', 2]]);
});

prueba('tipos presentes, NPS general y por tipo', () => {
  const r = resumen(RES);
  assert.deepEqual(r.tipos, ['tanner', 'visitante']);
  assert.equal(r.nps.score, 40);
  assert.equal(r.npsPorTipo.tanner.score, 75); assert.equal(r.npsPorTipo.visitante.score, -100);
  assert.equal(r.total, 6);
});

prueba('un 3.2 nunca sale como fuerte: va a atender', () => {
  const r = resumen({ ...RES, temas: RES.temas.filter(t => ['banos', 'estacionamiento', 'ambiente'].includes(t.tema)) });
  assert.deepEqual(r.fuertes.map(t => t.k), ['ambiente']);
  assert.deepEqual(r.atender.map(t => t.k), ['estacionamiento', 'banos']);
});

prueba('sin respuestas no truena', () => {
  const r = resumen({ total: 0, porTipo: {}, temas: [], nps: { n: 0, promotores: 0, detractores: 0 }, comentarios: [] });
  assert.equal(r.general, null); assert.deepEqual(r.fuertes, []); assert.deepEqual(r.atender, []); assert.equal(r.nps.score, null);
  assert.equal(resumen(null).total, 0);
});

prueba('mensaje de WhatsApp con el evento y la liga', () => {
  assert.equal(mensajeDeEncuesta('Tannery City FC', 'Visita del Club León', 'https://x/encuesta/?e=a'),
    'Gracias por acompañarnos (Visita del Club León). ¿Nos ayudas con 1 minuto? Cuéntanos cómo te la pasaste en Tannery City FC: https://x/encuesta/?e=a');
});

prueba('CSV: comillas escapadas y una fila por respuesta', () => {
  const csv = csvDeComentarios([{ fecha: '2026-10-15', tipo: 'tanner', categorias: ['Baby Tanner', 'T6'], club: null, nps: 9, gusto: 'La "cancha"', mejorar: 'Baños, más', contacto: null, telefono: null }]);
  const [cab, fila] = csv.split('\n');
  assert.equal(cab, 'fecha,tipo,categoria,club,nps,lo_que_gusto,que_mejorar,contacto,telefono');
  assert.equal(fila, '"2026-10-15","tanner","Baby Tanner / T6","","9","La ""cancha""","Baños, más","",""');
});

if (fallos) { console.error(`Encuestas QA FAILED · ${fallos} de ${corridas}`); process.exit(1); }
console.log(`Encuestas QA OK · ${corridas} casos: temas, NPS, semáforo, promedios por votos, conclusiones y CSV`);
