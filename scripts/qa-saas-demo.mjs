/* QA de los datos de demostracion comercial (v2/saas/demo.js).
 * La demo se ensena a clientes: tiene que decir lo mismo que el catalogo
 * oficial y que el motor de precios, y nunca prometer lo que no se vende.
 */
import { DEMO_CATALOGO, demoMiPlan, demoPortal, AVISO_DEMO } from '../v2/saas/demo.js';
import { CATALOGO_V1 } from './saas-catalogo-v1.fixture.mjs';
import { cotiza, mrrDe } from '../v2/saas/precios.js';

let fallos = 0, corridas = 0;
const revisa = (n, ok, d) => { corridas++; if (!ok) { fallos++; console.error(` - ${n}${d !== undefined ? `\n   ${JSON.stringify(d)}` : ''}`); } };

// Mismo catalogo que el oficial (precios, rangos, IVA, descuento, gracia).
const forma = c => JSON.stringify({ iva: c.ivaBp, d: c.descuentoAnualBp, g: c.diasGracia,
  p: c.planes.map(x => [x.codigo, x.min, x.max, x.mensual, x.cotizar]), c: c.complementos.map(x => [x.codigo, x.mensual, x.paquete || null]) });
revisa('catalogo demo = catalogo oficial v1', forma(DEMO_CATALOGO) === forma(CATALOGO_V1), [forma(DEMO_CATALOGO), forma(CATALOGO_V1)]);
const vendibles = DEMO_CATALOGO.complementos.filter(x => x.vendible).map(x => x.codigo).sort().join();
revisa('la demo solo ofrece lo que hoy se puede vender', vendibles === 'EVENTS,SCOUTING,SPONSORS,STORE', vendibles);
revisa('cada plan trae lo que incluye', DEMO_CATALOGO.planes.every(x => x.funciones?.length >= 2));
revisa('aviso de demostracion claro', /Demostración/.test(AVISO_DEMO) && /No se cobra/.test(AVISO_DEMO));

// "Mi plan" demo cuadra con el motor: Formativo + Tienda.
const m = demoMiPlan(40), q = cotiza(DEMO_CATALOGO, { plan: 'FORMATIVO', complementos: ['STORE'], activos: 40 });
revisa('Mi plan demo: base, IVA y total = motor', m.suscripcion.base === q.base && m.suscripcion.iva === q.iva && m.suscripcion.total === q.total, [m.suscripcion, q.total]);
revisa('Mi plan demo: los pagos son por el total contratado', m.pagos.every(x => x.monto === q.total));
revisa('Mi plan demo: 40 jugadores caben en Formativo', m.cupo.activos <= m.cupo.limite && m.cupo.estado === 'ok');
revisa('Mi plan demo: un comprobante sin factura y otro con factura solicitada', m.pagos.some(x => !x.cfdi) && m.pagos.some(x => x.cfdi === 'pending_integration'));

// Portal demo: MRR = suma de lo que dicen las academias (sin IVA).
const { board, cat } = demoPortal();
const precio = Object.fromEntries(DEMO_CATALOGO.planes.map(x => [x.codigo, x.mensual || 0]));
const comp = Object.fromEntries(DEMO_CATALOGO.complementos.map(x => [x.codigo, x.mensual]));
const esperado = board.academias.filter(a => a.estado !== 'cancelled').reduce((s, a) =>
  s + mrrDe({ status: a.estado === 'free' ? 'active' : a.estado, baseCentavos: precio[a.plan] + a.complementos.reduce((t, k) => t + comp[k], 0) }), 0);
revisa('portal demo: MRR = suma de academias', board.mrr === esperado, [board.mrr, esperado]);
revisa('portal demo: ARR = MRR x 12', board.arr === board.mrr * 12);
revisa('portal demo: cada academia cabe en su plan', board.academias.every(a => { const p = DEMO_CATALOGO.planes.find(x => x.codigo === a.plan); return p.max == null || a.jugadores <= p.max; }));
revisa('portal demo: Semilla = suma de sus academias', board.semilla.jugadores === board.academias.filter(a => a.plan === 'SEMILLA_20').reduce((s, a) => s + a.jugadores, 0));
revisa('portal demo: academias ficticias, ningun club real', !board.academias.some(a => /Tannery|Halcones FC \(demo\)/.test(a.nombre)));
revisa('portal demo: catalogo aprobado, no publicado', cat.versiones[0].status === 'approved' && board.catalogoPublicado === null);

console.log(fallos ? `\nqa-saas-demo: ${fallos} de ${corridas} comprobaciones fallaron` : `qa-saas-demo OK · ${corridas} comprobaciones`);
if (fallos) process.exit(1);
