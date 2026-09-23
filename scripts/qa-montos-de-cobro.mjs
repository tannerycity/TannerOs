// Montos de cobro.
//
// El caso decisivo es el del desglose: la fórmula "ordinario − beneficio =
// final" NO se puede calcular mientras la categoría no tenga tarifa, porque
// el club nunca guardó el ordinario (el descuento venía metido a mano dentro
// de la cuota de cada Tanner). La pantalla tiene que decirlo, no inventarlo.
import assert from 'node:assert/strict';
import { etiquetaCondicion, condicionDeFila, estadoVigencia, desglose,
         aCobrarHoy, tiposDeBeneficio, filtra, totales, beneficiosSoloEtiqueta,
         COLUMNAS_REPORTE, filaDeReporte, resumenDeReporte, textoDeFiltros, nombreDeArchivo }
  from '../v2/taquilla/montos.js';

let fallos = 0, corridas = 0;
function prueba(nombre, fn) {
  corridas++;
  try { fn(); } catch (e) { fallos++; console.error(` - ${nombre}: ${e.message}\n`); }
}

// Filas con la forma real que devuelve v2_collection_amounts, con los datos
// que hay hoy en producción.
const filas = [
  { playerId: 'p1', name: 'Ana Sofia Enríquez Uc', code: 'TC-1', categoryId: 'c1', categoryName: 'Baby Tanner',
    family: 'Michel Enríquez', ordinaryFee: null, chargedFee: 0, exempt: true, benefitTotal: null,
    benefits: [{ type: 'scholarship_full', label: 'Beca total', clubLabel: 'Total', calculation: 'full_waiver', affectsAmount: true, endsOn: null }],
    validityStatus: 'sin_vencimiento', validUntil: null, toCollect: 200, outstanding: 200, collectionNote: null },
  { playerId: 'p2', name: 'Dario Montalvo Díaz', code: 'TC-2', categoryId: 'c2', categoryName: 'T10',
    family: 'Familia Montalvo', ordinaryFee: 500, chargedFee: 500, exempt: false, benefitTotal: 0,
    benefits: [{ type: 'sponsor_funded', label: 'Patrocinado', clubLabel: 'Parcial por Curtibrother Bruno', calculation: 'fixed_amount', affectsAmount: true, endsOn: '2026-10-31' }],
    validityStatus: 'por_vencer', validUntil: '2026-10-31', toCollect: 0, outstanding: 0, collectionNote: 'Cobrar con el papá, no con la abuela' },
  { playerId: 'p3', name: 'Iker Joan Flores Procopio', code: 'TC-3', categoryId: 'c3', categoryName: 'T12',
    family: 'Familia Flores', ordinaryFee: 800, chargedFee: 750, exempt: false, benefitTotal: 50,
    benefits: [{ type: 'sibling_discount', label: 'Hermanos Tanners', clubLabel: 'Hermanos Tanner', calculation: 'informational', affectsAmount: false, endsOn: null }],
    validityStatus: 'sin_vencimiento', validUntil: null, toCollect: 850, outstanding: 1650, collectionNote: null },
  { playerId: 'p4', name: 'Matías Campos Rizo', code: 'TC-4', categoryId: 'c2', categoryName: 'T10',
    family: 'Familia Campos', ordinaryFee: 500, chargedFee: 500, exempt: false, benefitTotal: 0,
    benefits: [], validityStatus: 'ordinaria', validUntil: null, toCollect: 500, outstanding: 0, collectionNote: null },
  { playerId: 'p5', name: 'Tanner Vencido', code: 'TC-5', categoryId: 'c3', categoryName: 'T12',
    family: 'Familia Vencida', ordinaryFee: 800, chargedFee: 900, exempt: false, benefitTotal: -100,
    benefits: [{ type: 'agreement', label: 'Convenio', clubLabel: null, calculation: 'fixed_amount', affectsAmount: true, endsOn: '2026-08-31' }],
    validityStatus: 'vencido', validUntil: '2026-08-31', toCollect: 900, outstanding: 900, collectionNote: null }
];

// === El desglose no inventa el ordinario ===

prueba('sin tarifa de categoría, el desglose dice por qué no puede', () => {
  const d = desglose(filas[0]);
  assert.equal(d.completo, false);
  assert.equal(d.ordinaria, null);
  assert.equal(d.beneficio, null);
  assert.equal(d.final, 0);
  assert.match(d.motivo, /mensualidad ordinaria/);
});

prueba('con tarifa, la resta cuadra', () => {
  const d = desglose(filas[2]); // 800 ordinaria, 750 cobrada
  assert.equal(d.completo, true);
  assert.equal(d.ordinaria, 800);
  assert.equal(d.beneficio, 50);
  assert.equal(d.final, 750);
  assert.equal(d.ordinaria - d.beneficio, d.final);
});

prueba('un Tanner que paga MÁS que su tarifa se marca, no se esconde', () => {
  // Casi siempre es un dato mal capturado, y esconderlo lo vuelve permanente.
  const d = desglose(filas[4]); // 800 ordinaria, 900 cobrada
  assert.equal(d.beneficio, -100);
  assert.equal(d.inconsistente, true);
});

prueba('sin beneficio la resta da cero y sigue siendo completa', () => {
  const d = desglose(filas[3]);
  assert.equal(d.completo, true);
  assert.equal(d.beneficio, 0);
  assert.equal(d.inconsistente, false);
});

// === Etiquetas legibles ===

prueba('no repite "Beca total · Total"', () => {
  assert.equal(etiquetaCondicion({ label: 'Beca total', clubLabel: 'Total' }), 'Beca total');
  assert.equal(etiquetaCondicion({ label: 'Beca parcial', clubLabel: 'Parcial' }), 'Beca parcial');
});

prueba('sí conserva lo que el club agrega, como Curtibrother', () => {
  assert.equal(etiquetaCondicion({ label: 'Patrocinado', clubLabel: 'Parcial por Curtibrother Bruno' }),
    'Patrocinado · Parcial por Curtibrother Bruno');
  assert.equal(etiquetaCondicion({ label: 'Beca parcial', clubLabel: 'Parcial / viene un día' }),
    'Beca parcial · Parcial / viene un día');
});

prueba('ignora acentos y mayúsculas al comparar las dos etiquetas', () => {
  assert.equal(etiquetaCondicion({ label: 'Hermanos Tanners', clubLabel: 'hermanos tanners' }), 'Hermanos Tanners');
});

prueba('sin beneficio, la condición es tarifa ordinaria', () => {
  assert.equal(condicionDeFila(filas[3]), 'Tarifa ordinaria');
  assert.equal(condicionDeFila({ benefits: [] }), 'Tarifa ordinaria');
  assert.equal(condicionDeFila(null), 'Tarifa ordinaria');
});

prueba('con varios beneficios se dice cuántos más hay', () => {
  const fila = { benefits: [{ label: 'Beca parcial' }, { label: 'Hermanos Tanners' }, { label: 'Convenio' }] };
  assert.equal(condicionDeFila(fila), 'Beca parcial +2');
});

// === Vigencia ===

prueba('cada estado de vigencia trae texto e icono, no sólo color', () => {
  for (const f of filas) {
    const e = estadoVigencia(f);
    assert.ok(e.texto && e.texto.length > 3, `sin texto: ${f.validityStatus}`);
    assert.ok(e.icono, `sin icono: ${f.validityStatus}`);
  }
});

prueba('cuando hay fecha, la vigencia la dice', () => {
  assert.match(estadoVigencia(filas[1]).texto, /hasta 2026-10-31/);
  assert.equal(estadoVigencia(filas[1]).nivel, 'atencion');
  assert.equal(estadoVigencia(filas[4]).nivel, 'bajo');
});

// === Lo que hay que cobrar hoy ===

prueba('a cobrar hoy es el saldo abierto del periodo, no la mensualidad', () => {
  // Iker: mensualidad 750 + recargo 100 = 850 abiertos este periodo.
  assert.equal(aCobrarHoy(filas[2]), 850);
  assert.notEqual(aCobrarHoy(filas[2]), filas[2].chargedFee);
});

prueba('un becado total puede tener algo que cobrar igual', () => {
  // Ana Sofía es exenta de mensualidad pero trae un gafete de 200.
  assert.equal(filas[0].chargedFee, 0);
  assert.equal(aCobrarHoy(filas[0]), 200);
});

// === Beneficios que son sólo etiqueta ===

prueba('distingue el beneficio que no cambia ningún monto', () => {
  // 18 de 30 beneficios activos en producción son 'informational'.
  assert.equal(beneficiosSoloEtiqueta(filas[2]).length, 1);
  assert.equal(beneficiosSoloEtiqueta(filas[1]).length, 0);
  assert.equal(beneficiosSoloEtiqueta(filas[3]).length, 0);
});

// === Buscador ===

prueba('encuentra por nombre del Tanner', () => {
  assert.equal(filtra(filas, { texto: 'matias' }).length, 1);
  assert.equal(filtra(filas, { texto: 'matías' })[0].playerId, 'p4');
});

prueba('encuentra por tutor', () => {
  assert.equal(filtra(filas, { texto: 'michel' })[0].playerId, 'p1');
});

prueba('encuentra por categoría', () => {
  assert.equal(filtra(filas, { texto: 't10' }).length, 2);
});

prueba('encuentra por tipo de beneficio, incluido el nombre del club', () => {
  assert.equal(filtra(filas, { texto: 'curtibrother' })[0].playerId, 'p2');
  assert.equal(filtra(filas, { texto: 'hermanos' })[0].playerId, 'p3');
});

prueba('todos los términos tienen que aparecer, no cualquiera', () => {
  assert.equal(filtra(filas, { texto: 'matias t10' }).length, 1);
  assert.equal(filtra(filas, { texto: 'matias t12' }).length, 0);
});

prueba('los filtros se combinan', () => {
  assert.equal(filtra(filas, { categoria: 'c2' }).length, 2);
  assert.equal(filtra(filas, { categoria: 'c2', soloConBeneficio: true }).length, 1);
  assert.equal(filtra(filas, { soloConSaldo: true }).length, 3);
  assert.equal(filtra(filas, { soloPorVencer: true }).length, 2);
  assert.equal(filtra(filas, { tipo: 'sibling_discount' }).length, 1);
});

prueba('sin filtros salen todos', () => {
  assert.equal(filtra(filas, {}).length, filas.length);
  assert.equal(filtra(filas).length, filas.length);
});

prueba('la lista de tipos para el filtro no repite', () => {
  const t = tiposDeBeneficio(filas);
  assert.equal(t.length, 4);
  assert.deepEqual(t.map(x => x.valor).sort(),
    ['agreement', 'scholarship_full', 'sibling_discount', 'sponsor_funded']);
});

// === Totales ===

prueba('los totales suman lo que se ve, no todo el padrón', () => {
  const t = totales(filtra(filas, { categoria: 'c2' }));
  assert.equal(t.tanners, 2);
  assert.equal(t.aCobrar, 500);
  assert.equal(t.conBeneficio, 1);
});

prueba('los totales cuentan las categorías sin tarifa', () => {
  const t = totales(filas);
  assert.equal(t.tanners, 5);
  assert.equal(t.aCobrar, 2450);
  assert.equal(t.adeudo, 2750);
  assert.equal(t.sinTarifa, 1);
  assert.equal(t.porVencer, 1);
  assert.equal(t.vencidos, 1);
});

prueba('una lista vacía da ceros, no NaN', () => {
  const t = totales([]);
  assert.equal(t.tanners, 0);
  assert.equal(t.aCobrar, 0);
  assert.ok(!Number.isNaN(t.adeudo));
});

// === El reporte en PDF ===

const dinero = v => `$${Number(v || 0).toLocaleString('es-MX')}`;

prueba('el reporte lleva las columnas que pidió el club', () => {
  const claves = COLUMNAS_REPORTE.map(c => c.clave);
  for (const necesaria of ['name', 'categoryName', 'ordinaria', 'condicion', 'final', 'vigencia', 'saldo']) {
    assert.ok(claves.includes(necesaria), `falta la columna ${necesaria}`);
  }
});

prueba('el PDF nunca lleva el motivo de la beca ni la nota interna', () => {
  // La nota de cobranza sí la ve Taquilla en pantalla, pero el papel se
  // reparte y se olvida encima de un escritorio.
  const r = filaDeReporte(filas[1], dinero);
  const texto = JSON.stringify(r).toLowerCase();
  assert.ok(!texto.includes('abuela'), 'se filtró la nota de cobranza');
  assert.ok(!('collectionNote' in r));
  assert.ok(!('notes' in r));
  assert.ok(!('fundingSource' in r));
});

prueba('sin tarifa de categoría el reporte pone una raya, no un cero', () => {
  assert.equal(filaDeReporte(filas[0], dinero).ordinaria, '—');
  assert.equal(filaDeReporte(filas[2], dinero).ordinaria, '$800');
});

prueba('el reporte dice la vigencia cuando la hay', () => {
  assert.equal(filaDeReporte(filas[1], dinero).vigencia, '2026-10-31');
  assert.equal(filaDeReporte(filas[3], dinero).vigencia, 'Sin beneficio');
});

prueba('los totales del reporte son los de lo filtrado', () => {
  const r = resumenDeReporte(filtra(filas, { categoria: 'c2' }), dinero);
  assert.equal(r.tanners, 2);
  assert.equal(r.aCobrar, '$500');
});

prueba('el encabezado dice con qué filtros se generó', () => {
  const t = textoDeFiltros({ periodo: '2026-09', categoria: 'c2', soloConSaldo: true, texto: 'campos' },
    { categorias: { c2: 'T10' } });
  assert.match(t, /Periodo 2026-09/);
  assert.match(t, /T10/);
  assert.match(t, /Sólo con saldo/);
  assert.match(t, /campos/);
});

prueba('sin filtros el encabezado lo dice, no queda en blanco', () => {
  assert.equal(textoDeFiltros({}), 'Todos los Tanners activos');
});

prueba('el nombre del archivo no acepta basura', () => {
  assert.equal(nombreDeArchivo('2026-09-01'), 'montos-de-cobro-2026-09-01.pdf');
  // Una ruta no trae digitos ni guiones, asi que se queda vacia y cae al
  // nombre por defecto: nunca se cuela una ruta al nombre del archivo.
  assert.equal(nombreDeArchivo('../../etc/passwd'), 'montos-de-cobro-periodo.pdf');
  assert.equal(nombreDeArchivo('2026-09/../secreto'), 'montos-de-cobro-2026-09.pdf');
  assert.equal(nombreDeArchivo(null), 'montos-de-cobro-periodo.pdf');
});

if (fallos) { console.error(`Montos de cobro QA FAILED · ${fallos} de ${corridas}`); process.exit(1); }
console.log(`Montos de cobro QA OK · ${corridas} casos, incluido el ordinario que el club nunca guardó`);
