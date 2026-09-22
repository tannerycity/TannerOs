// La baja de artículos en Utilería.
//
// El caso decisivo es el último: antes, el formulario mandaba status:'active'
// escrito a mano, así que corregirle el nombre a un artículo dado de baja lo
// revivía en silencio. Ése es el bug que estas pruebas cierran.
import assert from 'node:assert/strict';
import { esBaja, contarBajas, articulosVisibles, estadoAlAlternar, textoDelBoton,
         estadoAlGuardar, puedeDarseDeBaja, ESTADO_BAJA, ESTADO_ACTIVO }
  from '../v2/utileria-baja.js';

let fallos = 0, corridas = 0;
function prueba(nombre, fn) {
  corridas++;
  try { fn(); } catch (e) { fallos++; console.error(` - ${nombre}: ${e.message}\n`); }
}

// El inventario real del club, con sus duplicados.
const inventario = [
  { id: '1', name: 'Conos',          category: 'Conos',     status: 'active',  quantity: 10, assigned_quantity: 0 },
  { id: '2', name: 'Cono',           category: 'Conos',     status: 'active',  quantity: 1,  assigned_quantity: 0 },
  { id: '3', name: 'Porterías Mini', category: 'Porterías', status: 'active',  quantity: 1,  assigned_quantity: 0 },
  { id: '4', name: 'Porterías Mini', category: 'Porterías', status: 'retired', quantity: 1,  assigned_quantity: 0 },
  { id: '5', name: 'Casacas',        category: 'Casacas',   status: 'active',  quantity: 10, assigned_quantity: 4 },
];

prueba('por omisión, los dados de baja NO se ven', () => {
  const v = articulosVisibles(inventario);
  assert.equal(v.length, 4);
  assert.ok(!v.some((i) => i.id === '4'), 'el duplicado dado de baja debe desaparecer');
});

prueba('el duplicado de Porterías Mini deja de estorbar', () => {
  const nombres = articulosVisibles(inventario).map((i) => i.name);
  assert.equal(nombres.filter((n) => n === 'Porterías Mini').length, 1,
    'hoy salen dos idénticos y no se distinguen');
});

prueba('con el toggle prendido sí se ven todos', () => {
  assert.equal(articulosVisibles(inventario, { verBajas: true }).length, 5);
});

prueba('la búsqueda sigue funcionando y respeta el toggle', () => {
  assert.equal(articulosVisibles(inventario, { termino: 'porter' }).length, 1);
  assert.equal(articulosVisibles(inventario, { termino: 'porter', verBajas: true }).length, 2);
  assert.equal(articulosVisibles(inventario, { termino: 'CONO' }).length, 2, 'sin importar mayúsculas');
});

prueba('se cuentan las bajas para la etiqueta del toggle', () => {
  assert.equal(contarBajas(inventario), 1);
});

prueba('el botón alterna en los dos sentidos', () => {
  const activo = inventario[2], dado = inventario[3];
  assert.equal(estadoAlAlternar(activo), ESTADO_BAJA);
  assert.equal(estadoAlAlternar(dado), ESTADO_ACTIVO);
  assert.equal(textoDelBoton(activo), 'Dar de baja');
  assert.equal(textoDelBoton(dado), 'Reactivar artículo');
});

prueba('lo que un profe trae prestado no se da de baja', () => {
  const casacas = inventario[4];            // 4 asignadas
  const r = puedeDarseDeBaja(casacas);
  assert.equal(r.ok, false);
  assert.ok(/devolución/i.test(r.motivo), 'y se dice por qué');
});

prueba('sin nada prestado sí se puede', () => {
  assert.equal(puedeDarseDeBaja(inventario[0]).ok, true);
});

prueba('EL BUG: editar un artículo dado de baja NO lo revive', () => {
  const dado = inventario[3];
  assert.equal(estadoAlGuardar(dado), ESTADO_BAJA,
    "antes iba 'active' a mano y el artículo volvía al inventario sin que nadie lo pidiera");
});

prueba('un artículo nuevo nace activo', () => {
  assert.equal(estadoAlGuardar(null), ESTADO_ACTIVO);
});

prueba('editar no pisa un estado de mantenimiento', () => {
  assert.equal(estadoAlGuardar({ status: 'maintenance' }), 'maintenance');
});

prueba('esBaja no se confunde con nulos', () => {
  assert.equal(esBaja(null), false);
  assert.equal(esBaja({}), false);
});

if (fallos) { console.error(`Utilería baja QA FAILED · ${fallos} de ${corridas}`); process.exit(1); }
console.log(`Utilería baja QA OK · ${corridas} casos, incluido el artículo que revivía solo`);
