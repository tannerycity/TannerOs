// Alta de un club (v2/admin/clubes/alta.js), sin navegador.
import assert from 'node:assert/strict';
import { PASOS, CATEGORIAS_SUGERIDAS, slugDe, slugValido, faltantes, datosParaAlta, mensajeBienvenida, ingresoMensual }
  from '../v2/admin/clubes/alta.js';

let fallos = 0, corridas = 0;
function prueba(nombre, fn) { corridas++; try { fn(); } catch (e) { fallos++; console.error(` - ${nombre}: ${e.message}`); } }

const BUENO = { name: 'Club León Norte', slug: 'club-leon-norte', city: 'León', colors: { primary: '#123456', secondary: '#00aa55' },
  planCode: 'primera', founder: true, categories: [{ name: 'Sub-8', monthlyFee: '500' }, { name: 'Sub-10', monthlyFee: '' }],
  chargeDay: 1, dueDay: 5, lateFee: 100, owner: { name: 'juan pérez', email: ' Juan@Club.MX ', phone: '477 123 4567' } };

prueba('cinco pasos', () => assert.deepEqual(PASOS, ['Identidad', 'Plan', 'Categorías', 'Cobro', 'Dueño']));
prueba('categorías sugeridas por edad', () => assert.ok(CATEGORIAS_SUGERIDAS.includes('Sub-10') && CATEGORIAS_SUGERIDAS.length >= 6));

prueba('el identificador sale del nombre, sin acentos ni espacios', () => {
  assert.equal(slugDe('Club Atlético León Ñ!'), 'club-atletico-leon-n');
  assert.equal(slugValido('club-leon'), true);
  assert.equal(slugValido('ab'), false);
  assert.equal(slugValido('Club León'), false);
  assert.equal(slugValido('-club'), false);
});

prueba('un club bien llenado pasa los cinco pasos', () => {
  for (let i = 0; i < 5; i++) assert.deepEqual(faltantes(i, BUENO), [], `paso ${i}`);
});

prueba('cada paso dice qué le falta', () => {
  assert.match(faltantes(0, { ...BUENO, name: '' }).join(), /nombre del club/);
  assert.match(faltantes(0, { ...BUENO, colors: { primary: 'rojo', secondary: '#000000' } }).join(), /colores/);
  assert.match(faltantes(1, { ...BUENO, planCode: '' }).join(), /plan/);
  assert.match(faltantes(2, { ...BUENO, categories: [] }).join(), /al menos una categoría/);
  assert.match(faltantes(2, { ...BUENO, categories: [{ name: 'Sub-8' }, { name: 'sub-8' }] }).join(), /repetidas/);
  assert.match(faltantes(2, { ...BUENO, categories: [{ name: 'Sub-8', monthlyFee: '-5' }] }).join(), /mensualidades/);
  assert.match(faltantes(3, { ...BUENO, chargeDay: 31 }).join(), /1 al 28/);
  assert.match(faltantes(4, { ...BUENO, owner: { name: 'Juan', email: 'juan' } }).join(), /correo válido/);
});

prueba('lo que se manda al servidor va limpio', () => {
  const d = datosParaAlta(BUENO);
  assert.equal(d.owner.email, 'juan@club.mx');
  assert.equal(d.owner.phone, '4771234567');
  assert.deepEqual(d.categories, [{ name: 'Sub-8', monthlyFee: 500 }, { name: 'Sub-10', monthlyFee: null }]);
  assert.equal(d.founder, true);
  assert.equal(d.colors.accent, '#C6AC5C');
});

prueba('el mensaje de bienvenida dice dónde entrar y con qué correo', () => {
  const m = mensajeBienvenida({ club: 'Club León Norte', dueno: 'juan pérez', correo: 'juan@club.mx', producto: 'TannerOS', url: 'https://app.ejemplo.com' });
  assert.match(m, /^Hola Juan, ya está listo Club León Norte en TannerOS\./);
  assert.match(m, /Entra a https:\/\/app\.ejemplo\.com/);
  assert.match(m, /Crea tu cuenta con este correo: juan@club\.mx/);
  assert.match(m, /ya eres Presidencia/);
});

prueba('ingreso mensual: sólo planes de venta, fundador a mitad', () => {
  const planes = [{ code: 'cantera', priceMxn: 990 }, { code: 'primera', priceMxn: 1990 }];
  const clubes = [{ planCode: 'internal_full' }, { planCode: 'cantera' }, { planCode: 'primera', founder: true }];
  assert.equal(ingresoMensual(clubes, planes), 990 + 995);
});

if (fallos) { console.error(`Alta de club QA FAILED · ${fallos} de ${corridas}`); process.exit(1); }
console.log(`Alta de club QA OK · ${corridas} casos: identificador, cinco pasos, datos limpios, bienvenida e ingreso`);
