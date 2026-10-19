// El buscador universal.
//
// Los casos vienen de lo que se midió contra el buscador viejo con datos
// reales del club: buscar a una mamá devolvía al hijo sin decir por qué,
// "balones" no devolvía nada, y "477" devolvía a todo el mundo.
import assert from 'node:assert/strict';
import { busca, puntuaFila, normaliza, trozosResaltados, filasEnOrden, esBusquedaDeTelefono,
         cacheVigente, empaquetaCache, llaveDeCache, borraCacheDelBuscador, CACHE_TTL_MS, CACHE_VERSION,
         distancia, telefonosDe, agregaReciente, llaveDeRecientes, esConsultaCorta }
  from '../v2/buscador.js';
import { desdeTanners, desdeUtileria, desdeModulos, desdeProspectos, desdeUsuarios, desdeAcciones, armaIndice }
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
  const r = busca(INDICE, 'or');   // pesca de todo (con 1 letra ya no se busca)
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
  const r = busca(INDICE, 'or');
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

/* ===== El prospecto que ya es Tanner =====

   Caso real: buscar "Gil" devolvía "Gilberto Muñoz Barrera · Prospecto ·
   converted" como mejor resultado, cuando Gilberto ya es Tanner activo de T10.
   La llave de deduplicación incluía el tipo, así que prospecto y Tanner nunca
   chocaban aunque fueran la misma persona. */

const GILBERTO_TANNER = [{ id: 'pl-gil', name: 'Gilberto Muñoz Barrera', jersey: '9', pos: 'Delantero', guardians: '', phones: '' }];
const PROSPECTOS = [
  { first_name: 'Gilberto', last_name: 'Muñoz Barrera', status: 'converted', category: 'T10' },
  // Convertido pero sin ningún Tanner con ese nombre: es un dato roto y tiene
  // que seguir viéndose.
  { first_name: 'Huérfano', last_name: 'Sin Tanner', status: 'converted', category: 'T8' },
  { first_name: 'Sofía', last_name: 'Nueva', status: 'new', category: 'Baby Tanner' },
];

prueba('el prospecto que ya es Tanner deja de competir con el Tanner', () => {
  const idx = armaIndice([desdeTanners(GILBERTO_TANNER), desdeProspectos(PROSPECTOS)]);
  const gil = idx.filter(f => /Gilberto/.test(f.titulo));
  assert.equal(gil.length, 1, 'Gilberto tiene que salir una sola vez');
  assert.equal(gil[0].tipo, 'tanner', 'y el que queda es el Tanner, no la ficha vieja');
  assert.match(gil[0].href, /^\/jugadores\//, 'lleva a su expediente, no a Prospectos');
});

prueba('buscar "Gil" ya no ofrece el prospecto como mejor resultado', () => {
  const idx = armaIndice([desdeTanners(GILBERTO_TANNER), desdeProspectos(PROSPECTOS)]);
  const r = busca(idx, 'Gil');
  assert.equal(r.mejor.tipo, 'tanner', 'el mejor resultado es el Tanner');
  assert.equal(r.mejor.titulo, 'Gilberto Muñoz Barrera');
  // Y no queda escondido más abajo: sólo hay un Gilberto en todo el resultado.
  assert.equal(r.total, 1, JSON.stringify(r.secciones));
});

prueba('un convertido SIN Tanner sigue saliendo: es un dato roto, no ruido', () => {
  const idx = armaIndice([desdeTanners(GILBERTO_TANNER), desdeProspectos(PROSPECTOS)]);
  assert.ok(idx.some(f => f.tipo === 'prospecto' && /Huérfano/.test(f.titulo)));
});

prueba('un prospecto que NO es Tanner se queda como está', () => {
  const idx = armaIndice([desdeTanners(GILBERTO_TANNER), desdeProspectos(PROSPECTOS)]);
  assert.ok(idx.some(f => f.tipo === 'prospecto' && /Sofía/.test(f.titulo)));
});

prueba('el estado deja de leerse en inglés', () => {
  const filas = desdeProspectos(PROSPECTOS);
  assert.match(filas[0].subtitulo, /Ya inscrito/);
  assert.match(filas[2].subtitulo, /Nuevo/);
  assert.ok(!filas.some(f => /converted|new\b/.test(f.subtitulo)));
});

prueba('acentos y mayúsculas no rompen el emparejamiento', () => {
  const tanner = [{ id: 'x', name: 'JOSÉ  MARIANO  ALVIZO', jersey: '', pos: '', guardians: '', phones: '' }];
  const prosp = [{ first_name: 'Jose', last_name: 'Mariano Alvizo', status: 'converted' }];
  const idx = armaIndice([desdeTanners(tanner), desdeProspectos(prosp)]);
  assert.equal(idx.filter(f => /Alvizo/i.test(f.titulo)).length, 1);
});

prueba('un papá que además es del club SÍ sigue saliendo dos veces', () => {
  // Son dos papeles distintos de la misma persona, no un registro viejo. Esto
  // protege contra que el arreglo de arriba se generalice de más.
  const tanner = [{ id: 'y', name: 'Rodrigo Torres', jersey: '', pos: '', guardians: 'Mayra Anda', phones: '' }];
  const idx = armaIndice([desdeTanners(tanner), desdeUsuarios([{ display_name: 'Mayra Anda', role: 'Operaciones' }])]);
  assert.equal(idx.filter(f => /Mayra/.test(f.titulo)).length, 2);
});

/* ===== El aviso de fuente caída sobrevive al caché =====

   v2_search_index llevaba semanas tronando con "column reference
   organization_id is ambiguous" y NADIE lo notó: el catch de shell.js devolvía
   [] en silencio y el buscador se veía completo. Buscar un Tanner devolvía su
   ficha vieja de prospecto, porque el Tanner no competía con nadie.

   Si el aviso no viajara dentro del caché, sólo la primera búsqueda de la
   sesión avisaría y las siguientes volverían a callarse. */

prueba('el caché se lleva qué fuentes no respondieron', () => {
  const g = empaquetaCache(INDICE, 1000, ['v2_search_index'], 'u1');
  assert.deepEqual(g.caidas, ['v2_search_index']);
  assert.equal(cacheVigente(g, 1000, 'u1'), true);
});

prueba('sin fuentes caídas el caché queda limpio, no indefinido', () => {
  assert.deepEqual(empaquetaCache(INDICE, 1000).caidas, []);
});

prueba('el caché se reusa mientras esté fresco', () => {
  const guardado = empaquetaCache(INDICE, 1000, [], 'u1');
  assert.equal(cacheVigente(guardado, 1000, 'u1'), true);
  assert.equal(cacheVigente(guardado, 1000 + CACHE_TTL_MS - 1, 'u1'), true);
});

prueba('y se descarta cuando caduca', () => {
  const guardado = empaquetaCache(INDICE, 1000, [], 'u1');
  assert.equal(cacheVigente(guardado, 1000 + CACHE_TTL_MS + 1, 'u1'), false);
});

prueba('un caché de otra versión no se usa', () => {
  // Si cambia la forma de las filas, el caché viejo rompería el buscador
  // en silencio en vez de simplemente volver a pedirlo.
  const viejo = { ...empaquetaCache(INDICE, Date.now(), [], 'u1'), version: CACHE_VERSION - 1 };
  assert.equal(cacheVigente(viejo, Date.now(), 'u1'), false);
});

prueba('un caché corrupto o vacío no se usa', () => {
  assert.equal(cacheVigente(null), false);
  assert.equal(cacheVigente({}), false);
  assert.equal(cacheVigente('basura'), false);
  assert.equal(cacheVigente(empaquetaCache([])), false);
});

prueba('cada club tiene su propio caché', () => {
  assert.notEqual(llaveDeCache('org-a', 'u1'), llaveDeCache('org-b', 'u1'));
});

/* EL DEFECTO DE SEGURIDAD (auditoría 19/10/2026). En la iPad de la banca,
   Presidencia sale, un profe entra en la misma pestaña y su buscador le servía
   el índice de Presidencia: teléfonos de familias, prospectos y patrocinadores. */
prueba('cada persona del mismo club tiene su propio caché', () => {
  assert.notEqual(llaveDeCache('org-a', 'presidencia'), llaveDeCache('org-a', 'profe'));
});

prueba('el caché de otra persona no se usa aunque esté fresco', () => {
  const dePresidencia = empaquetaCache(INDICE, 1000, [], 'presidencia');
  assert.equal(cacheVigente(dePresidencia, 1000, 'presidencia'), true);
  assert.equal(cacheVigente(dePresidencia, 1000, 'profe'), false);
});

prueba('un caché sin dueño no se le da a nadie', () => {
  assert.equal(cacheVigente(empaquetaCache(INDICE, 1000), 1000, 'u1'), false);
  assert.equal(cacheVigente(empaquetaCache(INDICE, 1000, [], 'u1'), 1000), false);
});

prueba('al salir se borra todo lo del buscador y nada más', () => {
  const datos = new Map([[llaveDeCache('org-a', 'presidencia'), 'x'], ['tos:buscador:v1:org-a', 'viejo'], ['tos:return:/jugadores/', '/'], ['otra', '1']]);
  const s = { get length() { return datos.size; }, key: (i) => [...datos.keys()][i] ?? null, removeItem: (k) => datos.delete(k) };
  assert.equal(borraCacheDelBuscador(s), 2);
  assert.deepEqual([...datos.keys()].sort(), ['otra', 'tos:return:/jugadores/']);
});

prueba('el índice guardado pesa una fracción de lo que se pidió', () => {
  // Las RPC traen todas sus columnas; el índice solo guarda lo que el
  // buscador usa. Medido contra el club real, pedirlo cuesta 136 kB.
  const bytes = JSON.stringify(empaquetaCache(INDICE)).length;
  const porFila = bytes / INDICE.length;
  assert.ok(porFila < 200, `cada fila debe ser chica, son ${Math.round(porFila)} bytes`);
});

/* ===== BUSCADOR V2 (auditoría ISTQB, 19/10/2026) =====
   Cada caso de aquí falló en la auditoría con el buscador anterior. */
const T2 = [
  { id: 'b1', name: 'Rodrigo Torres Anda', jersey: '10', pos: 'DEL', category: 'T10', phones: '+524773979631, 4771234567', guardians: 'Mayra Anda Ruiz' },
  { id: 'b2', name: 'José María Muñoz Gil', jersey: '8', pos: 'MED', category: 'T12', phones: '4771748014', guardians: 'Ana Gil' },
  { id: 'b3', name: 'Gianluca Enríquez Olivares', jersey: '1', pos: 'POR', category: 'Baby Tanner', phones: '+524779998877', guardians: 'Michel Enríquez' },
  { id: 'b4', name: 'Ana Ramos', jersey: '5', pos: 'DEF', category: 'T6', phones: '+524770000001', guardians: 'Rosa Ramos' },
];
const ACC = desdeAcciones([
  { label: 'Nuevo gafete', sub: 'Agregar, cobrar y entregar', pantalla: 'Estacionamiento', href: '/estacionamiento/?accion=nuevo-gafete', claves: ['gafete', 'placas'] },
  { label: 'Cobrar', sub: 'Entra dinero al club', pantalla: 'Acción rápida', href: '/taquilla/?action=cobrar', claves: ['cobro', 'pago', 'mensualidad'] },
  { label: 'Registrar jugador', sub: 'Formulario de nuevo ingreso', pantalla: 'Jugadores', href: '/registro/jugadores/', claves: ['alta', 'inscribir'] },
]);
const MOD2 = desdeModulos([{ label: 'Taquilla', code: 'taquilla', href: '/taquilla/' }, { label: 'Estacionamiento', code: 'estacionamiento', href: '/estacionamiento/' }]);
const I2 = armaIndice([ACC, desdeTanners(T2), MOD2]);
const primero = (q) => filasEnOrden(busca(I2, q))[0];

prueba('[typo] una letra cambiada encuentra al Tanner', () => {
  assert.equal(primero('rodirgo')?.titulo, 'Rodrigo Torres Anda');
  assert.equal(primero('gianlcua')?.titulo, 'Gianluca Enríquez Olivares');
});
prueba('[typo] nombre y apellido con un error cada uno', () => {
  assert.equal(primero('enriquez olivarez')?.titulo, 'Gianluca Enríquez Olivares');
});
prueba('[typo] lo bien escrito siempre le gana a lo parecido', () => {
  // "ana" está bien escrita: Ana Ramos va primero, no un "Anda" ni una "Ama".
  assert.equal(primero('ana ramos')?.titulo, 'Ana Ramos');
});
prueba('[typo] con palabras cortas no se adivina (un error ya es otra palabra)', () => {
  assert.equal(busca(I2, 'ama').total, 0);
});
prueba('[typo] lo que va escribiendo, con un error, ya encuentra', () => {
  assert.equal(primero('rodri')?.titulo, 'Rodrigo Torres Anda');
  assert.equal(primero('rodir')?.titulo, 'Rodrigo Torres Anda');
});
prueba('[teléfono] con +52 encuentra al que lo tiene guardado sin lada', () => {
  assert.equal(primero('+52 477 174 8014')?.titulo, 'José María Muñoz Gil');
});
prueba('[teléfono] sin lada encuentra al que lo tiene con +52', () => {
  assert.equal(primero('4773979631')?.titulo, 'Rodrigo Torres Anda');
});
prueba('[teléfono] el segundo tutor también cuenta, y no se pegan entre sí', () => {
  assert.equal(primero('477 123 4567')?.titulo, 'Rodrigo Torres Anda');
  assert.deepEqual(telefonosDe('+524773979631, 4771234567'), ['4773979631', '4771234567']);
  assert.deepEqual(telefonosDe('+524773979631 +524771234567'), ['4773979631', '4771234567']);
  // "9631477" cruzaba de un teléfono al otro cuando se pegaban todos los dígitos.
  assert.equal(busca(armaIndice([desdeTanners([{ id: 'x', name: 'X', phones: '+524773979631, +524771234567' }])]), '9631477').total, 0);
});
prueba('[categoría] "T10" trae a los de T10 y no a los de T12', () => {
  const r = filasEnOrden(busca(I2, 'T10')).filter((f) => f.tipo === 'tanner').map((f) => f.titulo);
  assert.deepEqual(r, ['Rodrigo Torres Anda']);
  assert.equal(primero('baby tanner')?.titulo, 'Gianluca Enríquez Olivares');
});
prueba('[acciones] "nuevo gafete" es una acción y va primero', () => {
  const f = primero('nuevo gafete');
  assert.equal(f.tipo, 'accion'); assert.equal(f.href, '/estacionamiento/?accion=nuevo-gafete');
});
prueba('[acciones] "registrar jugador" y "cobrar" se encuentran', () => {
  assert.equal(primero('registrar jugador')?.titulo, 'Registrar jugador');
  assert.equal(primero('cobrar')?.titulo, 'Cobrar');
});
prueba('[sinónimos] "gafete" encuentra Estacionamiento y "mensualidad" encuentra cobrar', () => {
  assert.ok(filasEnOrden(busca(I2, 'gafete')).some((f) => f.titulo === 'Estacionamiento'));
  assert.ok(filasEnOrden(busca(I2, 'mensualidad')).some((f) => f.titulo === 'Cobrar' || f.titulo === 'Taquilla'));
});
prueba('[límite] con una letra no se busca; con un número sí (dorsal)', () => {
  assert.equal(esConsultaCorta('a'), true);
  assert.equal(busca(I2, 'a').corta, true);
  assert.equal(esConsultaCorta('ro'), false);
  assert.equal(esConsultaCorta('8'), false);
});
prueba('[robustez] caracteres raros, HTML y textos larguísimos no truenan', () => {
  for (const q of ['(*+?', '[', '\\', '<img src=x onerror=1>', 'a'.repeat(500), '%%%', '#']) assert.doesNotThrow(() => busca(I2, q), q);
});
prueba('[distancia] transposición cuenta como un solo error', () => {
  assert.equal(distancia('rodirgo', 'rodrigo'), 1);
  assert.equal(distancia('abc', 'xyz', 1), 2);   // corta en cuanto pasa del máximo
});
prueba('[recientes] lo último va primero, sin repetidos y máximo 5', () => {
  let l = [];
  for (const n of ['A', 'B', 'C', 'D', 'E', 'F']) l = agregaReciente(l, { tipo: 'tanner', titulo: n, href: '/' + n });
  assert.deepEqual(l.map((x) => x.titulo), ['F', 'E', 'D', 'C', 'B']);
  l = agregaReciente(l, { tipo: 'tanner', titulo: 'C', href: '/C' });
  assert.deepEqual(l.map((x) => x.titulo), ['C', 'F', 'E', 'D', 'B']);
});
prueba('[recientes] son de cada persona y se borran al salir con el resto del buscador', () => {
  assert.notEqual(llaveDeRecientes('org', 'a'), llaveDeRecientes('org', 'b'));
  assert.ok(llaveDeRecientes('org', 'a').startsWith('tos:buscador:'));
});
prueba('[rendimiento] 5,000 filas responden en menos de 60 ms', () => {
  const muchos = []; for (let i = 0; i < 2500; i++) muchos.push({ id: String(i), name: `Nombre${i} Apellido${i % 97}`, category: `T${i % 14}`, phones: '+52477' + (1000000 + i), guardians: `Tutor${i} Uno` });
  const grande = armaIndice([desdeTanners(muchos)]);
  const t0 = performance.now(); for (let k = 0; k < 20; k++) busca(grande, 'apelido12'); const ms = (performance.now() - t0) / 20;
  assert.ok(ms < 60, `tardó ${ms.toFixed(1)} ms`);
});

if (fallos) { console.error(`Buscador QA FAILED · ${fallos} de ${corridas}`); process.exit(1); }
console.log(`Buscador QA OK · ${corridas} casos, incluidos la mamá, los balones, el 477, los errores de dedo, el +52, T10 y las acciones`);
