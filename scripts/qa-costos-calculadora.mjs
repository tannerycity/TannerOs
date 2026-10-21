/* COSTOS PÚBLICOS · motor de la calculadora (costos/calculo.js, 20/10/2026).
 *
 * Particiones y valores límite de lo que decide cuánto paga una familia:
 *   · prorrateo: los cortes 7/8, 14/15, 21/22, el día 1, el 19 y el último
 *     día de meses de 28, 29, 30 y 31 días; y que la regla sea la MISMA que
 *     cobra TannerOS (app.prorated_monthly_fee);
 *   · uno, dos y tres hijos; Baby 1 y 2 días; Baby + Tanner;
 *   · paquetes: por confirmar (no se cobran), confirmados (sí), sin tarifa
 *     ("Solicitar cotización") y paquetes que salen más caros que sin paquete;
 *   · inscripción nueva contra alumno ya inscrito;
 *   · errores: nada de números si falta una respuesta;
 *   · moneda mexicana, texto para copiar y liga de WhatsApp;
 *   · que ningún precio esté escrito fuera de la configuración central.
 */
import fs from 'node:fs';
import { TARIFAS, aplicaPrecios, preciosDelFormulario, porClase, nombreOpcion } from '../costos/tarifas.js';
import { cotiza, dinero, semanasACobrar, proporcional, paqueteDe, leeFecha, textoCotizacion, ligaWhatsApp } from '../costos/calculo.js';

let fallos = 0, corridas = 0;
const revisa = (nombre, ok, detalle) => { corridas++; if (!ok) { fallos++; console.error(` - ${nombre}${detalle !== undefined ? `\n   ${JSON.stringify(detalle)}` : ''}`); } };
const T = TARIFAS;
// Los paquetes oficiales ya vienen confirmados; esta variante prueba el modo "por confirmar".
const sinConfirmar = { ...T, paquetes: { ...T.paquetes, confirmado: false } };
const TAN = { categoria: 'tanner' }, B1 = { categoria: 'baby', opcion: 'baby-1' }, B2 = { categoria: 'baby', opcion: 'baby-2' };
const q = (hijos, fecha, nueva = true, t = T) => cotiza({ hijos, fechaIngreso: fecha, nuevaInscripcion: nueva }, t);

/* Prorrateo: la regla de TannerOS */
{
  const sql = fs.readFileSync('supabase/migrations/20260819052455_tanneros_v2_financial_balances.sql', 'utf8');
  const m = /weeks:=case when d<=(\d+) then (\d) when d<=(\d+) then (\d) when d<=(\d+) then (\d) else (\d) end/.exec(sql.replace(/\s+/g, ' '));
  const base = /p_base_fee\*weeks\/(\d)/.exec(sql);
  const enBase = m ? [[+m[1], +m[2]], [+m[3], +m[4]], [+m[5], +m[6]], [31, +m[7]]] : null;
  const aqui = T.prorrateo.tramos.map(t => [t.hastaDia, t.semanas]);
  revisa('el prorrateo de /costos es el mismo que cobra TannerOS', JSON.stringify(enBase) === JSON.stringify(aqui) && base && +base[1] === T.prorrateo.base, { enBase, aqui });
}
const cortes = [[1, 4], [7, 4], [8, 3], [14, 3], [15, 2], [19, 2], [21, 2], [22, 1], [28, 1], [31, 1]];
for (const [d, s] of cortes) revisa(`día ${d}: ${s} de 4 semanas`, semanasACobrar(d, T.prorrateo) === s, semanasACobrar(d, T.prorrateo));
revisa('se redondea al peso (550 x 3/4 = 412.5 → 413)', proporcional(550, 10, T.prorrateo) === 413);

/* Un alumno */
{
  const c = q([TAN], '2026-10-01');
  revisa('Tanner nuevo el día 1: mes completo + inscripción = $1,600 (cartel: inscripción $800)', c.proporcionalIndividual === 800 && c.inscripcion === 800 && c.primerPago === 1600 && c.mensualidadRegular === 800 && c.completo, c);
  const d = q([TAN], '2026-10-19');
  revisa('Tanner nuevo el día 19: 2 de 4 semanas ($400) + $800 = $1,200', d.semanas === 2 && d.proporcionalIndividual === 400 && d.primerPago === 1200, d);
  revisa('Baby nuevo: inscripción $500 (cartel)', q([B1], '2026-10-01').inscripcion === 500);
  const e = q([TAN], '2026-10-31');
  revisa('el último día de un mes de 31: 1 semana ($200)', e.semanas === 1 && e.proporcionalIndividual === 200, e);
  revisa('mes de 30 días, día 30: 1 semana', q([TAN], '2026-11-30').semanas === 1);
  revisa('febrero normal, día 28: 1 semana', q([TAN], '2027-02-28').semanas === 1);
  revisa('febrero bisiesto, día 29: existe y es 1 semana', q([TAN], '2028-02-29').semanas === 1);
  revisa('29 de febrero en año no bisiesto: fecha inválida', !!q([TAN], '2027-02-29').error);
  revisa('31 de noviembre: fecha inválida', !!q([TAN], '2026-11-31').error);
  // El proporcional es SÓLO para nuevo ingreso (Presidencia, 20/10/2026).
  const ya = q([TAN], '2026-10-19', false);
  revisa('ya inscrito: mensualidad completa aunque la fecha sea el 19, sin inscripción', ya.inscripcion === 0 && ya.primerPago === 800 && ya.semanas === 4 && ya.fecha === null, ya);
  revisa('ya inscrito: no pide fecha', !q([TAN], '', false).error && q([TAN], '', false).primerPago === 800);
  revisa('ya inscrito el día 31: también completa', q([B2], '2026-10-31', false).primerPago === 550);
  revisa('nuevo ingreso sin fecha: la pide', /fecha/.test(q([TAN], '', true).error || ''));
  revisa('Baby 1 día: $400 al mes', q([B1], '2026-10-01').mensualidadRegular === 400);
  revisa('Baby 2 días: $550 al mes', q([B2], '2026-10-01').mensualidadRegular === 550);
  revisa('cambiar de 1 a 2 días cambia el total', q([B1], '2026-10-19').primerPago !== q([B2], '2026-10-19').primerPago);
  revisa('un solo hijo no tiene paquete ni ajuste', q([TAN], '2026-10-01').paquete.estado === 'no_aplica' && q([TAN], '2026-10-01').ajusteFamiliar === 0);
  revisa('un solo hijo con regla confirmada no es estimación', q([TAN], '2026-10-01').estimacion === false);
}

/* Costos oficiales del cartel (21/10/2026): paquetes confirmados */
{
  const c = q([TAN, TAN], '2026-10-01');
  revisa('2 Tanners = $1,500 (cartel) y dos inscripciones de $800', c.paquete.estado === 'aplica' && c.mensualidadRegular === 1500 && c.inscripcion === 1600 && c.primerPago === 3100, c);
  revisa('3 Tanners = $2,000', q([TAN, TAN, TAN], '2026-10-01', false).mensualidadRegular === 2000);
  revisa('1 Tanner + 1 Baby = $1,200 (ejemplo del cartel)', q([TAN, B2], '2026-10-01', false).mensualidadRegular === 1200 && q([TAN, B1], '2026-10-01', false).mensualidadRegular === 1200);
  revisa('2 Tanners + 1 Baby = $1,900 (ejemplo del cartel)', q([TAN, TAN, B1], '2026-10-01', false).mensualidadRegular === 1900);
  revisa('2 Baby Tanners = $800 (ejemplo del cartel), aunque vayan 2 días', q([B2, B2], '2026-10-01', false).mensualidadRegular === 800 && q([B1, B1], '2026-10-01', false).mensualidadRegular === 800);
  revisa('la regla del mixto cubre lo que el cartel no lista: 1 Tanner + 2 Baby = $1,600 y 3 Baby = $1,200',
    q([TAN, B1, B2], '2026-10-01', false).mensualidadRegular === 1600 && q([B1, B2, B2], '2026-10-01', false).mensualidadRegular === 1200);
  revisa('inscripciones mezcladas: Tanner $800 + Baby $500', q([TAN, B1], '2026-10-01').inscripcion === 1300);
  const d19 = q([TAN, TAN], '2026-10-19');
  revisa('el paquete también se prorratea: 2 Tanners el día 19 = $750 + $1,600', d19.proporcionalIndividual + d19.ajusteFamiliar === 750 && d19.primerPago === 2350, d19);
  revisa('con costos oficiales ya no es estimación', c.estimacion === false && q([TAN, TAN, B1], '2026-10-01').estimacion === false);
  revisa('1 Tanner no es paquete: $800 sin ajuste', q([TAN], '2026-10-01', false).paquete.estado === 'no_aplica' && q([TAN], '2026-10-01', false).mensualidadRegular === 800);
}

/* Si un club deja sus paquetes "por confirmar" */
{
  const c = q([TAN, TAN], '2026-10-01', true, sinConfirmar);
  revisa('por confirmar: 2 Tanners se cobran sin paquete ($1,600) y se enseña $1,500 de referencia',
    c.mensualidadRegular === 1600 && c.ajusteFamiliar === 0 && c.paquete.estado === 'referencia' && c.paquete.paquete.mensualidad === 1500 && c.estimacion, c.paquete);
  revisa('por confirmar: no se suma ningún descuento', q([TAN, TAN, B1], '2026-10-01', true, sinConfirmar).ajusteFamiliar === 0);
  const sinLista = { ...T, paquetes: { confirmado: true, lista: T.paquetes.lista.filter(x => x.clave !== 'p-t2b1') } };
  revisa('una combinación sin paquete: "Solicitar cotización"', q([TAN, TAN, B1], '2026-10-01', true, sinLista).paquete.estado === 'sin_tarifa' && q([TAN, TAN, B1], '2026-10-01', true, sinLista).estimacion);
  // Un paquete nunca cobra más que sin paquete.
  const caro = { ...T, paquetes: { confirmado: true, lista: [{ clave: 'x', nombre: '2 Baby', cantidades: { baby: 2 }, mensualidad: 1000 }] } };
  revisa('un paquete más caro que sin paquete no se ofrece (2 Baby de 1 día: $800 < $1,000)', paqueteDe([B1, B1], caro, 800).estado === 'no_aplica' && q([B1, B1], '2026-10-01', false, caro).mensualidadRegular === 800);
}

/* Recargo por pago tardío (cartel: después del día 5, $100) */
{
  revisa('1 hijo: $800 + $100 = $900 si paga después del día 5', q([TAN], '2026-10-01', false).recargo === 100 && q([TAN], '2026-10-01', false).mensualidadConRecargo === 900);
  revisa('el recargo es por cada mensualidad: 2 Tanners $1,500 + $200 = $1,700', q([TAN, TAN], '2026-10-01', false).recargo === 200 && q([TAN, TAN], '2026-10-01', false).mensualidadConRecargo === 1700);
  revisa('sin recargo configurado, no se inventa', q([TAN], '2026-10-01', false, { ...T, recargo: null }).recargo === 0);
  revisa('el día límite y el monto salen de la configuración', T.recargo.diaLimite === 5 && T.recargo.monto === 100 && T.recargo.primerMes === false);
}

/* Sin todas las respuestas, no hay números */
revisa('sin hijos', !!cotiza({ hijos: [], fechaIngreso: '2026-10-01', nuevaInscripcion: true }, T).error);
revisa('sin categoría', /categoría/.test(q([{ categoria: null }], '2026-10-01').error || ''));
revisa('Baby sin días', /días por semana/.test(q([{ categoria: 'baby' }], '2026-10-01').error || ''));
revisa('sin fecha (nuevo ingreso)', /fecha/.test(q([TAN], '').error || ''));
revisa('sin decir si es nuevo ingreso', /nuevo ingreso/.test(cotiza({ hijos: [TAN], fechaIngreso: '2026-10-01' }, T).error || ''));
revisa('4 hijos: fuera de la calculadora', /hasta 3/.test(q([TAN, TAN, TAN, TAN], '2026-10-01').error || ''));
revisa('fecha basura', leeFecha('19/10/2026') === null && leeFecha('2026-13-01') === null);

/* Moneda, texto y WhatsApp */
revisa('moneda mexicana sin centavos', dinero(1800) === '$1,800' && dinero(0) === '$0' && dinero(-50) === '-$50' && dinero(12345) === '$12,345', [dinero(1800), dinero(-50)]);
{
  const c = q([TAN, B2], '2026-10-19');
  const txt = textoCotizacion(c, T);
  revisa('el texto para copiar trae fecha, hijos, conceptos y totales', /19\/10\/2026/.test(txt) && /Hijo 1: Tanners, 3 días por semana/.test(txt) && /Hijo 2: Baby Tanners, 2 días por semana/.test(txt)
    && /Inscripción \(2 alumnos\): \$1,300/.test(txt) && /Ajuste familiar \(1 Tanner \+ 1 Baby Tanner\): -\$75/.test(txt) && /Total del primer pago: \$1,900 MXN/.test(txt)
    && /noviembre 2026: \$1,200 MXN/.test(txt) && /Si pagas después del día 5: \+\$200 de recargo, \$1,400 MXN/.test(txt) && !/Estimación/.test(txt), txt);
  revisa('con paquete por confirmar, el texto lo dice y es estimación', /por confirmar/.test(textoCotizacion(q([TAN, B2], '2026-10-19', true, sinConfirmar), T)) && /Estimación/.test(textoCotizacion(q([TAN, B2], '2026-10-19', true, sinConfirmar), T)));
  const wa = ligaWhatsApp(txt, T, 2);
  revisa('WhatsApp al número del club con la cotización incluida', wa.startsWith('https://wa.me/524792651338?text=') && decodeURIComponent(wa.split('text=')[1]).includes('Total del primer pago') && /mis hijos/.test(decodeURIComponent(wa)), wa.slice(0, 80));
  const txtYa = textoCotizacion(q([TAN], '', false), T);
  revisa('el texto de un alumno inscrito dice mensualidad completa y la nota de nuevo ingreso', /Alumno ya inscrito/.test(txtYa) && /Total a pagar cada mes: \$800 MXN/.test(txtYa) && /únicamente para alumnos de nuevo ingreso/.test(txtYa), txtYa);
  revisa('la cotización de nuevo ingreso también lleva la nota', /únicamente para alumnos de nuevo ingreso/.test(txt));
  revisa('un hijo: "mi hijo"', /a mi hijo en/.test(decodeURIComponent(ligaWhatsApp('x', T, 1))));
}

/* Configuración central: ningún precio escrito a mano fuera de tarifas.js */
for (const f of ['costos/app.js', 'costos/calculo.js']) {
  const src = fs.readFileSync(f, 'utf8');
  const sueltos = [...src.matchAll(/(?<![\w.])(400|550|800|1000|1200|1500|2000)(?![\w.])/g)].map(m => m[1]);
  revisa(`${f} no escribe precios a mano`, sueltos.length === 0, sueltos);
}
revisa('cada categoría y paquete sale de la configuración', T.categorias.map(c => c.clave).join() === 'tanner,baby' && T.paquetes.lista.length === 7 && T.paquetes.confirmado === true && T.incluyeInscripcion === '');
revisa('precio por clase: mensualidad ÷ 4 semanas ÷ días', porClase({ dias: 1, mensualidad: 400 }) === 100 && porClase({ dias: 2, mensualidad: 550 }) === 69 && porClase({ dias: 3, mensualidad: 800 }) === 67);
revisa('el nombre de la opción', nombreOpcion({ dias: 1 }) === '1 día por semana' && nombreOpcion({ dias: 3 }) === '3 días por semana');

/* Precios editados en Club › Costos públicos (h22-h23): listas */
{
  const g = { categorias: [
      { clave: 'baby', nombre: 'Baby Tanners', edades: '3 a 6', inscripcion: 1100, opciones: [{ clave: 'baby-1', dias: 1, mensualidad: 450 }] },
      { clave: 'porteros', nombre: 'Porteros', edades: '', inscripcion: 500, opciones: [{ clave: 'porteros-1', dias: 1, mensualidad: 300 }, { clave: 'porteros-2', dias: 2, mensualidad: 500 }] }],
    paquetes: { confirmado: true, lista: [{ clave: 'paq-1', nombre: '2 Porteros', cantidades: { porteros: 2 }, mensualidad: 500 }] }, incluyeInscripcion: 'Seguro y playera' };
  const t = aplicaPrecios(T, g);
  revisa('lo guardado reemplaza categorías, opciones, paquetes y lo que incluye',
    t.categorias.map(c => c.clave).join() === 'baby,porteros' && t.categorias[1].opciones.length === 2 && t.categorias[0].inscripcion === 1100
    && t.paquetes.lista.length === 1 && t.paquetes.confirmado === true && t.incluyeInscripcion === 'Seguro y playera');
  revisa('no toca la configuración original', T.categorias[0].opciones[0].mensualidad === 800 && T.categorias[1].inscripcion === 500 && T.paquetes.lista.length === 7);
  revisa('la calculadora usa una categoría nueva (Porteros 2 días)', cotiza({ hijos: [{ categoria: 'porteros', opcion: 'porteros-2' }], nuevaInscripcion: false }, t).primerPago === 500);
  revisa('y su paquete confirmado (2 Porteros de 1 día: $600 → $500)', cotiza({ hijos: [{ categoria: 'porteros', opcion: 'porteros-1' }, { categoria: 'porteros', opcion: 'porteros-1' }], nuevaInscripcion: false }, t).mensualidadRegular === 500);
  const raro = aplicaPrecios(T, { categorias: [
      { clave: 'x', nombre: 'Sin opciones válidas', inscripcion: 100, opciones: [{ dias: 9, mensualidad: 10 }, { dias: 2, mensualidad: -1 }] },
      { clave: 'y', nombre: '', inscripcion: 100, opciones: [{ dias: 1, mensualidad: 10 }] },
      { clave: 'z', nombre: 'Buena', inscripcion: 1.5, opciones: [{ dias: 1, mensualidad: 10 }] }],
    paquetes: { confirmado: 'si', lista: [{ nombre: 'Fantasma', cantidades: { nadie: 2 }, mensualidad: 10 }] } });
  revisa('si nada de lo guardado sirve, quedan las categorías del archivo', JSON.stringify(raro.categorias) === JSON.stringify(T.categorias) && raro.paquetes.confirmado === T.paquetes.confirmado);
  revisa('un paquete de una categoría que no existe se descarta', raro.paquetes.lista.length === 0);
  revisa('sin nada guardado (null) queda todo igual', JSON.stringify(aplicaPrecios(T, null)) === JSON.stringify(T));

  // El formulario del editor (números como texto, cantidades por posición de categoría).
  const F = { categorias: [
      { clave: 'baby', nombre: ' Baby Tanners ', edades: '3 a 6', inscripcion: '1000', opciones: [{ dias: '1', mensualidad: '400' }, { dias: '', mensualidad: '' }, { dias: '2', mensualidad: '550' }] },
      { nombre: 'Porteros Élite', edades: '', inscripcion: '500', opciones: [{ dias: '1', mensualidad: '300' }] }],
    paquetes: { confirmado: true, lista: [{ nombre: '2 Baby', cantidades: { 0: '2', 1: '' }, mensualidad: '1000' }, { nombre: '', cantidades: {}, mensualidad: '' }] }, incluye: ' Seguro ' };
  const r = preciosDelFormulario(F);
  revisa('el editor arma categorías con clave, opciones (sin renglones vacíos) y paquetes por clave',
    !r.error && r.precios.categorias[0].clave === 'baby' && r.precios.categorias[0].nombre === 'Baby Tanners' && r.precios.categorias[0].opciones.length === 2
    && r.precios.categorias[1].clave === 'porteros-elite' && r.precios.categorias[1].opciones[0].clave === 'porteros-elite-1'
    && JSON.stringify(r.precios.paquetes.lista[0].cantidades) === '{"baby":2}' && r.precios.paquetes.lista.length === 1 && r.precios.incluyeInscripcion === 'Seguro', r);
  revisa('lo que arma el editor, la página lo usa tal cual', aplicaPrecios(T, r.precios).categorias[1].nombre === 'Porteros Élite');
  const mal = (cambio, re) => { const f = JSON.parse(JSON.stringify(F)); cambio(f); const e = preciosDelFormulario(f).error || ''; return re.test(e) ? true : e; };
  revisa('sin nombre de categoría', mal(f => { f.categorias[1].nombre = ''; }, /nombre a la categoría 2/));
  revisa('inscripción con decimales', mal(f => { f.categorias[0].inscripcion = '10.5'; }, /inscripción de Baby Tanners/));
  revisa('8 días por semana', mal(f => { f.categorias[0].opciones[0].dias = '8'; }, /de 1 a 7/));
  revisa('dos opciones con los mismos días', mal(f => { f.categorias[0].opciones[2].dias = '1'; }, /dos opciones de 1 día/));
  revisa('opción con días pero sin precio', mal(f => { f.categorias[0].opciones[0].mensualidad = ''; }, /mensualidad va en pesos/));
  revisa('categoría sin opciones', mal(f => { f.categorias[1].opciones = [{ dias: '', mensualidad: '' }]; }, /al menos una opción/));
  revisa('paquete sin alumnos', mal(f => { f.paquetes.lista[0].cantidades = { 0: '0' }; }, /cuántos alumnos/));
  revisa('paquete con 6 de una categoría', mal(f => { f.paquetes.lista[0].cantidades = { 0: '6' }; }, /de 0 a 5/));
  revisa('sin categorías', /al menos una categoría/.test(preciosDelFormulario({ categorias: [] }).error || ''));
  revisa('dos categorías con el mismo nombre no chocan', (() => { const f = JSON.parse(JSON.stringify(F)); f.categorias[1].nombre = 'Baby Tanners'; delete f.categorias[0].clave; const x = preciosDelFormulario(f).precios; return x && x.categorias[0].clave !== x.categorias[1].clave; })());
}

/* Editor estilo Apple (v2/admin/club/costos.js): lo que se arma solo */
{
  const { leeEdades, textoEdades, nombrePaquete, singular, porClaseDe } = await import('../v2/admin/club/costos.js');
  revisa('edades guardadas como texto se leen al carrusel', JSON.stringify(leeEdades('De 6 a 12 años')) === '{"edadMin":6,"edadMax":12}' && JSON.stringify(leeEdades('5 años')) === '{"edadMin":5,"edadMax":5}');
  revisa('edades fuera de rango o raras quedan dentro del carrusel (3 a 18)', JSON.stringify(leeEdades('De 1 a 40')) === '{"edadMin":3,"edadMax":18}' && JSON.stringify(leeEdades('')) === '{"edadMin":6,"edadMax":12}');
  revisa('el texto de edades', textoEdades(6, 12) === 'De 6 a 12 años' && textoEdades(5, 5) === '5 años');
  const C = [{ nombre: 'Baby Tanners' }, { nombre: 'Tanners' }, { nombre: 'Mayores' }];
  revisa('el nombre del paquete sale solo, en singular si es uno', nombrePaquete({ 0: 1, 1: 2 }, C) === '1 Baby Tanner + 2 Tanners' && nombrePaquete({ 2: 1 }, C) === '1 Mayor' && nombrePaquete({}, C) === '');
  revisa('singular', singular('Porteros') === 'Portero' && singular('Sub-15') === 'Sub-15' && singular('Tanners') === 'Tanner');
  revisa('precio por clase del editor', porClaseDe(2, '550') === 69 && porClaseDe(3, '') === null);
}

console.log(fallos ? `Costos calculadora FAILED · ${fallos} de ${corridas}` : `Costos calculadora OK · ${corridas} revisiones`);
process.exit(fallos ? 1 : 0);
