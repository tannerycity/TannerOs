// El buscador universal.
//
// Los casos vienen de lo que se midió contra el buscador viejo con datos
// reales del club: buscar a una mamá devolvía al hijo sin decir por qué,
// "balones" no devolvía nada, y "477" devolvía a todo el mundo.
import assert from 'node:assert/strict';
import { busca, puntuaFila, normaliza, trozosResaltados, filasEnOrden, esBusquedaDeTelefono,
         cacheVigente, empaquetaCache, llaveDeCache, CACHE_TTL_MS, CACHE_VERSION }
  from '../v2/buscador.js';
import { desdeTanners, desdeUtileria, desdeModulos, armaIndice }
  from '../v2/buscador-fuentes.js';

let fallos = 0, corridas = 0;
function prueba(nombre, fn) {
  corridas++;
  try { fn(); } catch (e) { fallos++; console.error(` - ${nombre}: ${e.message}\n`); }
}

// Datos REALES del club, tal cual los devuelve v2_search_index.
const TANNERS = [
  { id: 'a1', name: 'Daniel maximiliano López Ramírez', jersey: null, pos: 'Portero',
    guardians: 'Daniel de Jesús López Ramírez', phones: '+524771289060' },
  { id: 'a2', name: 'Mauro Contreras Hernández', jersey: '8', pos: 'Por definir',
    guardians: 'Victor Contreras', phones: '+524775940373' },
  { id: 'a3', name: 'Luis Maximo Luna Moreno', jersey: '20+1', pos: 'Por definir',
    guardians: 'Lizbeth Moreno Velazquez', phones: '+524772859251' },
  { id: 'a4', name: 'Rodrigo Torres Anda', jersey: '9', pos: 'Mediocampista',
    guardians: 'Mayra Anda Cruz', phones: '+524773995932' },
];
const UTILERIA = [
  { id: 'u1', name: 'Balones del 3', category: 'Balones', location: 'Bodega', quantity: 12 },
  { id: 'u2', name: 'Conos', category: 'Conos', location: null, quantity: 10 },
  { id: 'u3', name: 'Casacas', category: 'Casacas', location: null, quantity: 10 },
];
const MODULOS = [{ label: 'Jugadores', code: 'jugadores', href: '/jugadores/' },
                 { label: 'Utilería', code: 'utileria', href: '/utileria/' }];

const INDICE = armaIndice([desdeTanners(TANNERS), desdeUtileria(UTILERIA), desdeModulos(MODULOS)]);

prueba('EL CASO: buscar a una mamá la encuentra a ELLA, no al hijo', () => {
  const r = busca(INDICE, 'Mayra');
  assert.ok(r.mejor, 'tiene que haber un mejor resultado');
  assert.equal(r.mejor.titulo, 'Mayra Anda Cruz',
    'el buscador viejo devolvía "Rodrigo Torres Anda" y nada decía por qué');
  assert.equal(r.mejor.tipo, 'tutor');
});

prueba('y el resultado dice de qué familia es', () => {
  assert.equal(busca(INDICE, 'Mayra').mejor.subtitulo, 'Familia de Rodrigo Torres Anda');
});

prueba('EL CASO: "balones" ahora sí encuentra los balones', () => {
  const r = busca(INDICE, 'balones');
  assert.ok(r.total > 0, 'el buscador viejo decía "Sin resultados"');
  assert.equal(r.mejor.titulo, 'Balones del 3');
  assert.equal(r.mejor.tipo, 'utileria');
});

prueba('"conos" también, y trae cuántos hay', () => {
  const r = busca(INDICE, 'conos');
  assert.equal(r.mejor.titulo, 'Conos');
  assert.ok(/10 en total/.test(r.mejor.subtitulo), 'sirve saber cuántos hay sin entrar');
});

prueba('EL CASO: "477" ya no devuelve a todo el club', () => {
  // Casi todo el club es de León: con tres dígitos, la lada hacía match con
  // TODOS y la lista salía llena de ruido.
  assert.equal(esBusquedaDeTelefono('477'), false);
  assert.equal(busca(INDICE, '477').total, 0);
});

prueba('pero un teléfono de verdad sí encuentra a su familia', () => {
  const r = busca(INDICE, '3995932');
  assert.ok(r.total > 0);
  assert.ok(['Rodrigo Torres Anda', 'Mayra Anda Cruz'].includes(r.mejor.titulo));
});

prueba('lo que empieza igual gana a lo que solo contiene', () => {
  // "Ro" debe traer a Rodrigo antes que a Mauro, que lo lleva en medio.
  assert.equal(busca(INDICE, 'Ro').mejor.titulo, 'Rodrigo Torres Anda');
});

prueba('se encuentra por apellido, no solo por el nombre', () => {
  assert.equal(busca(INDICE, 'Torres').mejor.titulo, 'Rodrigo Torres Anda');
});

prueba('los acentos no estorban en ningún sentido', () => {
  assert.ok(busca(INDICE, 'lopez').total > 0, 'sin acento encuentra "López"');
  assert.ok(busca(INDICE, 'utileria').total > 0, 'sin acento encuentra "Utilería"');
  assert.equal(normaliza('RAMÍREZ'), 'ramirez');
});

prueba('dos términos exigen que ambos coincidan', () => {
  assert.ok(busca(INDICE, 'rodrigo torres').total > 0);
  assert.equal(busca(INDICE, 'rodrigo contreras').total, 0,
    'nadie se llama así: no debe inventar resultados');
});

prueba('al papá también se llega buscando al hijo', () => {
  const nombres = filasEnOrden(busca(INDICE, 'Rodrigo Torres')).map((f) => f.titulo);
  assert.ok(nombres.includes('Mayra Anda Cruz'), 'su familia sale junto con él');
});

prueba('los resultados vienen agrupados por tipo', () => {
  const r = busca(INDICE, 'a');   // pesca de todo
  assert.ok(r.secciones.length > 1, 'tiene que haber más de una sección');
  const ordenes = r.secciones.map((s) => s.tipo);
  assert.ok(ordenes.indexOf('tanner') < ordenes.indexOf('modulo'),
    'las personas van antes que las pantallas');
});

prueba('el mejor resultado no se repite en las secciones', () => {
  const r = busca(INDICE, 'Mayra');
  const repetido = r.secciones.some((s) => s.filas.some((f) => f.titulo === r.mejor.titulo && f.href === r.mejor.href));
  assert.equal(repetido, false);
});

prueba('las flechas del teclado recorren lo que se ve, en orden', () => {
  const r = busca(INDICE, 'a');
  const orden = filasEnOrden(r);
  assert.equal(orden[0].titulo, r.mejor.titulo, 'el primero es el mejor resultado');
  const enPantalla = 1 + r.secciones.reduce((n, s) => n + s.filas.length, 0);
  assert.equal(orden.length, enPantalla, 'ni una fila de más ni de menos');
});

prueba('se sigue pudiendo ir a una pantalla escribiendo su nombre', () => {
  assert.equal(busca(INDICE, 'Utilería').mejor.tipo, 'modulo');
});

prueba('el resaltado marca lo que la persona escribió, respetando acentos', () => {
  const trozos = trozosResaltados('Rodrigo Torres Anda', 'torres');
  assert.deepEqual(trozos.map((t) => t.texto).join(''), 'Rodrigo Torres Anda',
    'no se pierde ni un carácter');
  assert.equal(trozos.find((t) => t.resaltado)?.texto, 'Torres');
  const conAcento = trozosResaltados('López Ramírez', 'lopez');
  assert.equal(conAcento.find((t) => t.resaltado)?.texto, 'López', 'resalta el original con acento');
});

prueba('una consulta vacía no muestra nada', () => {
  assert.equal(busca(INDICE, '').total, 0);
  assert.equal(busca(INDICE, '   ').mejor, null);
});

prueba('un índice vacío no truena', () => {
  assert.equal(busca([], 'lo que sea').total, 0);
  assert.equal(busca(null, 'x').total, 0);
});

prueba('una fila sin datos no se cuela', () => {
  assert.equal(puntuaFila({ titulo: '' }, 'x'), 0);
  assert.equal(armaIndice([[null, { titulo: '' }]]).length, 0);
});

prueba('no se repiten filas idénticas de dos fuentes', () => {
  const doble = armaIndice([desdeTanners(TANNERS), desdeTanners(TANNERS)]);
  assert.equal(doble.length, desdeTanners(TANNERS).length);
});

prueba('el caché se reusa mientras esté fresco', () => {
  const guardado = empaquetaCache(INDICE, 1000);
  assert.equal(cacheVigente(guardado, 1000), true);
  assert.equal(cacheVigente(guardado, 1000 + CACHE_TTL_MS - 1), true);
});

prueba('y se descarta cuando caduca', () => {
  const guardado = empaquetaCache(INDICE, 1000);
  assert.equal(cacheVigente(guardado, 1000 + CACHE_TTL_MS + 1), false);
});

prueba('un caché de otra versión no se usa', () => {
  // Si cambia la forma de las filas, el caché viejo rompería el buscador
  // en silencio en vez de simplemente volver a pedirlo.
  const viejo = { ...empaquetaCache(INDICE), version: CACHE_VERSION - 1 };
  assert.equal(cacheVigente(viejo), false);
});

prueba('un caché corrupto o vacío no se usa', () => {
  assert.equal(cacheVigente(null), false);
  assert.equal(cacheVigente({}), false);
  assert.equal(cacheVigente('basura'), false);
  assert.equal(cacheVigente(empaquetaCache([])), false);
});

prueba('cada club tiene su propio caché', () => {
  assert.notEqual(llaveDeCache('org-a'), llaveDeCache('org-b'));
});

prueba('el índice guardado pesa una fracción de lo que se pidió', () => {
  // Las RPC traen todas sus columnas; el índice solo guarda lo que el
  // buscador usa. Medido contra el club real, pedirlo cuesta 136 kB.
  const bytes = JSON.stringify(empaquetaCache(INDICE)).length;
  const porFila = bytes / INDICE.length;
  assert.ok(porFila < 200, `cada fila debe ser chica, son ${Math.round(porFila)} bytes`);
});

if (fallos) { console.error(`Buscador QA FAILED · ${fallos} de ${corridas}`); process.exit(1); }
console.log(`Buscador QA OK · ${corridas} casos, incluidos la mamá, los balones y el 477`);
