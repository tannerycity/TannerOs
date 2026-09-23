// Permiso de imagen: ¿este niño puede salir en la publicidad del club?
//
// El caso decisivo es el tercero. El sistema guardaba esto en un booleano, así
// que "dijo que no" y "nunca se le preguntó" se veían idénticos. Medido en
// producción el 23 de septiembre: 3 dijeron que no y 55 nunca fueron
// preguntados. Las dos prohíben publicar, pero sólo la segunda es trabajo
// pendiente, y con un booleano el club no podía verla.
import assert from 'node:assert/strict';
import { IMAGEN, estadoDeImagen, puedePublicarse, candadoDeFoto, cuentaDeImagen,
         noPublicables, COLUMNAS_NO_PUBLICABLES, filaDeNoPublicable,
         nombreDeArchivoNoPublicables } from '../v2/permiso-de-imagen.js';

let fallos = 0, corridas = 0;
function prueba(nombre, fn) {
  corridas++;
  try { fn(); } catch (e) { fallos++; console.error(` - ${nombre}: ${e.message}\n`); }
}

// Filas con la forma que devuelve v2_players, con los tres casos reales.
const autoriza = { id: 'p1', first_name: 'Ana Sofia', last_name: 'Enríquez Uc', category: 'Baby Tanner',
  image_consent: true, data_consent: true, privacy_notice_version: 'v1',
  image_consent_status: 'autoriza', photo_path: 'a.jpg' };
const dijoNo = { id: 'p2', first_name: 'Iker Joan', last_name: 'Flores', category: 'T12',
  image_consent: false, data_consent: true, privacy_notice_version: 'v1',
  image_consent_status: 'no_autoriza', photo_path: 'b.jpg' };
const nadieLePregunto = { id: 'p3', first_name: 'Hugo', last_name: 'Beltrán', category: 'Baby Tanner',
  image_consent: false, data_consent: false, privacy_notice_version: null,
  image_consent_status: 'sin_preguntar', photo_path: 'c.jpg' };
const sinFotoNiFirma = { id: 'p4', first_name: 'Regina', last_name: 'Arenas', category: 'T10',
  image_consent: false, data_consent: false, privacy_notice_version: null,
  image_consent_status: 'sin_preguntar', photo_path: null };

// === Las tres respuestas ===

prueba('quien autoriza puede salir', () => {
  assert.equal(estadoDeImagen(autoriza).clave, 'autoriza');
  assert.equal(puedePublicarse(autoriza), true);
  assert.equal(candadoDeFoto(autoriza), null, 'sin candado no hay nada que tapar');
});

prueba('"dijo que no" y "nunca se le preguntó" NO son lo mismo', () => {
  // Éste es el bug que se vino a cerrar: con un booleano los dos salían
  // "Sin permiso de imagen" y el club no sabía a quién perseguir.
  assert.equal(estadoDeImagen(dijoNo).clave, 'no_autoriza');
  assert.equal(estadoDeImagen(nadieLePregunto).clave, 'sin_preguntar');
  assert.notEqual(estadoDeImagen(dijoNo).etiqueta, estadoDeImagen(nadieLePregunto).etiqueta);
});

prueba('pero las dos prohíben publicar igual', () => {
  // Que se vean distinto no puede aflojar la regla: lo legal es lo mismo.
  assert.equal(puedePublicarse(dijoNo), false);
  assert.equal(puedePublicarse(nadieLePregunto), false);
});

prueba('cada estado dice qué hacer, o que no hay nada que hacer', () => {
  assert.equal(IMAGEN.autoriza.queHacer, null);
  assert.match(IMAGEN.no_autoriza.queHacer, /no se le vuelve a preguntar/i);
  assert.match(IMAGEN.sin_preguntar.queHacer, /Nadie le ha preguntado/);
});

prueba('el color nunca va solo: ícono y texto en los tres', () => {
  for (const clave of ['autoriza', 'no_autoriza', 'sin_preguntar']) {
    assert.ok(IMAGEN[clave].icono, `${clave} sin ícono`);
    assert.ok(IMAGEN[clave].corto, `${clave} sin texto corto`);
    assert.ok(IMAGEN[clave].nivel, `${clave} sin nivel`);
  }
});

// === El servidor manda; el cálculo local es el respaldo ===

prueba('lo que dice el servidor gana sobre los campos crudos', () => {
  // Si alguna vez la regla cambia en la base, la pantalla no se queda con la
  // versión vieja: usa la que vino.
  const raro = { image_consent: false, data_consent: false, privacy_notice_version: null,
                 image_consent_status: 'autoriza' };
  assert.equal(estadoDeImagen(raro).clave, 'autoriza');
});

prueba('sin el campo del servidor, se deduce con la misma escalera', () => {
  const crudo = p => estadoDeImagen({ ...p, image_consent_status: undefined }).clave;
  assert.equal(crudo(autoriza), 'autoriza');
  assert.equal(crudo(dijoNo), 'no_autoriza', 'firmó el aviso: se le preguntó');
  assert.equal(crudo(nadieLePregunto), 'sin_preguntar');
});

prueba('el consentimiento de datos también prueba que se preguntó', () => {
  // En el formulario público la casilla de datos es obligatoria y va pegada a
  // la de imagen: si dio una, vio la otra.
  assert.equal(estadoDeImagen({ image_consent: false, data_consent: true }).clave, 'no_autoriza');
});

prueba('acepta camelCase, que es como llega en algunos módulos', () => {
  assert.equal(estadoDeImagen({ imageConsent: false, dataConsent: false }).clave, 'sin_preguntar');
  assert.equal(estadoDeImagen({ imageConsent: true }).clave, 'autoriza');
});

prueba('una fila vacía cae en sin_preguntar, no en "puede salir"', () => {
  // El sesgo tiene que ser hacia NO publicar. Lo contrario se paga caro.
  assert.equal(estadoDeImagen({}).clave, 'sin_preguntar');
  assert.equal(puedePublicarse({}), false);
  assert.equal(puedePublicarse(null), false);
  assert.equal(puedePublicarse(undefined), false);
});

prueba('una versión de aviso en blanco no cuenta como que se preguntó', () => {
  assert.equal(estadoDeImagen({ image_consent: false, privacy_notice_version: '   ' }).clave, 'sin_preguntar');
});

// === El candado sobre la foto ===

prueba('el candado sale en los dos casos que no se publican', () => {
  assert.equal(candadoDeFoto(dijoNo).corto, 'No autoriza');
  assert.equal(candadoDeFoto(nadieLePregunto).corto, 'Falta firma');
  assert.equal(candadoDeFoto(dijoNo).icono, '⦸');
});

// === Conteos y lista ===

prueba('los conteos separan los tres y marcan los que ya tienen foto', () => {
  const c = cuentaDeImagen([autoriza, dijoNo, nadieLePregunto, sinFotoNiFirma]);
  assert.equal(c.total, 4);
  assert.equal(c.autoriza, 1);
  assert.equal(c.no_autoriza, 1);
  assert.equal(c.sin_preguntar, 2);
  assert.equal(c.noPublicables, 3);
  // El número que de verdad asusta: fotos cargadas de niños sin autorización.
  assert.equal(c.noPublicablesConFoto, 2);
});

prueba('la lista de no publicables deja fuera a quien sí autoriza', () => {
  const r = noPublicables([autoriza, dijoNo, nadieLePregunto]);
  assert.equal(r.length, 2);
  assert.ok(!r.some(p => p.id === 'p1'));
});

prueba('primero los que ya dijeron que no, luego los que faltan de firmar', () => {
  const r = noPublicables([nadieLePregunto, dijoNo]);
  assert.equal(estadoDeImagen(r[0]).clave, 'no_autoriza');
  assert.equal(estadoDeImagen(r[1]).clave, 'sin_preguntar');
});

// === La lista que se imprime para redes ===

prueba('la fila lleva nombre completo: sin nombres la lista no sirve', () => {
  const f = filaDeNoPublicable(dijoNo);
  assert.equal(f.name, 'Iker Joan Flores');
  assert.equal(f.categoria, 'T12');
  assert.equal(f.motivo, 'No autoriza su imagen');
  assert.equal(f.foto, 'Sí');
});

prueba('la fila distingue al que ni foto tiene', () => {
  assert.equal(filaDeNoPublicable(sinFotoNiFirma).foto, 'No');
  assert.equal(filaDeNoPublicable(sinFotoNiFirma).motivo, 'Falta pedir la firma');
});

prueba('la lista NO lleva nada que redes no deba ver', () => {
  // Sin beca, sin adeudo, sin teléfono del tutor, sin el motivo económico.
  const claves = COLUMNAS_NO_PUBLICABLES.map(c => c.clave).sort();
  assert.deepEqual(claves, ['categoria', 'foto', 'motivo', 'name']);
  const f = filaDeNoPublicable({ ...dijoNo, base_monthly_fee: 800, benefit_type: 'scholarship_full' });
  assert.deepEqual(Object.keys(f).sort(), claves);
});

prueba('el nombre del archivo no se deja meter una ruta', () => {
  assert.equal(nombreDeArchivoNoPublicables('../../etc/passwd'), 'no-publicables-hoy.pdf');
  assert.equal(nombreDeArchivoNoPublicables('2026-09-23'), 'no-publicables-2026-09-23.pdf');
});

console.log(fallos
  ? `Permiso de imagen QA FAILED · ${fallos} de ${corridas}`
  : `Permiso de imagen QA OK · ${corridas} casos, incluida la tercera respuesta que el booleano escondía`);
process.exit(fallos ? 1 : 0);
