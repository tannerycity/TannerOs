/* Cotizador por mes (24/11/2026), sin navegador.
 * Presidencia mandó el diseño: paquete base, meses, IVA aparte, total mensual
 * y total del contrato; vencida en automático; PDF carta con uniforme y
 * propiedades. Aquí se prueban las cuentas del README, los avisos de meses,
 * las vencidas, el mensaje de WhatsApp, los datos de la hoja y que el PDF se
 * dibuje con los mismos totales que la pantalla. */
import { totalesDePlan, avisoDePlan, paquetesDe, esPaquete, vencida, accionesDe, filtraCotizaciones, mensajeWhatsApp } from '../v2/patrocinadores/cotizar.js';
import { datosDeHoja, hojaPdf, posicionDe, fotoDelKit, telefonoBonito, nombreDeHoja } from '../v2/patrocinadores/propuesta-mensual.js';
import { jsPDF } from '../vendor/jspdf.mjs';

let casos = 0, fallos = 0;
const ok = (n, c, d) => { casos++; if (!c) { fallos++; console.error(' - ' + n + (d !== undefined ? '\n   ' + JSON.stringify(d) : '')); } };

const LOCAL = { id: 'p1', name: 'Presencia local', price: 1000, paquete: { clave: 'local', min: 6, max: 12, orden: 1 } };
const OFICIAL = { id: 'p2', name: 'Patrocinador oficial', price: 3000, paquete: { clave: 'oficial', min: 6, max: 12, orden: 2 } };
const INTEGRAL = { id: 'p3', name: 'Aliado integral TC + TCP', price: 5000, paquete: { clave: 'integral', min: 12, max: 12, orden: 3 } };
const PECHO = { id: 'u1', name: 'Logo en pecho', category: 'uniforms', price: 20000 };
const MANGA = { id: 'u2', name: 'Logo en manga derecha', category: 'uniforms', price: 7500 };
const MEDIAS = { id: 'u3', name: 'Logo en medias', category: 'uniforms', price: null };
const CHAVICOS = { id: 'c1', name: 'Cancha Chavicos', category: 'park', price: null, piezas: 12, foto: '/brand/patrocinios/chavicos.jpg', description: 'Lonas alrededor de la cancha principal' };
const NAMING = { id: 'e1', name: 'Naming de torneo / final / cancha', category: 'sports', foto: '/brand/patrocinios/campeones.jpg', description: 'Tu marca en el nombre del evento' };
const REEL = { id: 'd1', name: 'Reel Instagram', category: 'digital', price: 1500 };

/* Paquetes */
ok('paquetes en su orden y sólo los que traen meses', paquetesDe([INTEGRAL, REEL, OFICIAL, LOCAL]).map(p => p.id).join() === 'p1,p2,p3');
ok('un activo sin meses no es paquete', !esPaquete(REEL) && !esPaquete({ paquete: {} }) && esPaquete(LOCAL));

/* Las cuentas del README: sub = base + extras; desc = sub x %; iva sobre lo descontado; contrato = mensual x meses */
const R = [{ assetId: 'p2', unitPrice: 3000, quantity: 1 }, { assetId: 'c1', unitPrice: 2000, quantity: 1 }, { assetId: 'd1', unitPrice: 0, quantity: 1 }];
const t = totalesDePlan(R, { tipo: 'pct', valor: 10, meses: 12, ivaPct: 16, paqueteId: 'p2' });
ok('base y extras', t.base === 3000 && t.extras === 2000 && t.subtotal === 5000, t);
ok('descuento sobre el subtotal', t.descuento === 500 && t.pct === 10, t);
ok('IVA sobre lo descontado, no sobre el subtotal', t.iva === 720, t);
ok('total mensual = sub - desc + iva', t.mensual === 5220, t);
ok('total contrato = mensual x meses', t.contrato === 62640, t);
ok('lo del club sin IVA (pasa al acuerdo)', t.totalSinIva === 54000, t);
const sinIva = totalesDePlan(R, { meses: 6, ivaPct: 0, paqueteId: 'p2' });
ok('sin IVA el mensual es el subtotal', sinIva.iva === 0 && sinIva.mensual === 5000 && sinIva.contrato === 30000, sinIva);
ok('un IVA que no es 16 no se aplica', totalesDePlan(R, { meses: 6, ivaPct: 10, paqueteId: 'p2' }).iva === 0);
const unico = totalesDePlan([{ unitPrice: 500, quantity: 2 }], {});
ok('sin meses es pago único', unico.meses === null && unico.mensual === null && unico.contrato === 1000 && unico.totalSinIva === 1000, unico);
ok('meses con decimales se redondean', totalesDePlan(R, { meses: 6.4, paqueteId: 'p2' }).meses === 6);

/* Avisos del paquete (valores frontera) */
ok('5 meses en oficial: pide mínimo 6 y no deja guardar', avisoDePlan(OFICIAL, 5, 3000).bloquea && /mínimo 6/.test(avisoDePlan(OFICIAL, 5, 3000).texto));
ok('6 meses en oficial: pasa', !avisoDePlan(OFICIAL, 6, 3000).bloquea && avisoDePlan(OFICIAL, 6, 3000).texto === '');
ok('12 meses en oficial: pasa', !avisoDePlan(OFICIAL, 12, 3000).bloquea);
ok('13 meses en oficial: máximo 12', avisoDePlan(OFICIAL, 13, 3000).bloquea && /máximo 12/.test(avisoDePlan(OFICIAL, 13, 3000).texto));
ok('integral con 11: sólo de 12 meses', avisoDePlan(INTEGRAL, 11, 5000).bloquea && /sólo de 12/.test(avisoDePlan(INTEGRAL, 11, 5000).texto));
ok('integral con 12: pasa', !avisoDePlan(INTEGRAL, 12, 5000).bloquea);
ok('meses vacíos con paquete no dejan guardar', avisoDePlan(LOCAL, '', 1000).bloquea);
ok('base abajo del de lista sólo avisa', !avisoDePlan(OFICIAL, 12, 2500).bloquea && /abajo del de lista \(\$3,000\/mes\)/.test(avisoDePlan(OFICIAL, 12, 2500).texto));
ok('sin paquete no hay aviso', avisoDePlan(null, 3, 0).texto === '' && !avisoDePlan(null, 3, 0).bloquea);

/* Vencida en automático */
const Q = { id: 'q', folio: 'TC-2026-001', status: 'sent', approvalStatus: 'none', validUntil: '2026-11-23' };
ok('pasó la vigencia: vencida', vencida(Q, '2026-11-24'));
ok('el último día todavía vale', !vencida({ ...Q, validUntil: '2026-11-24' }, '2026-11-24'));
ok('aceptada o no aceptó nunca se vence', !vencida({ ...Q, status: 'accepted' }, '2026-12-31') && !vencida({ ...Q, status: 'rejected' }, '2026-12-31'));
ok('sin fecha de hoy no se marca', !vencida(Q, null));
const av = accionesDe(Q, { hoy: '2026-11-24' });
ok('vencida: renovar, no aceptó, archivar', av.etiqueta === 'Vencida' && av.acciones.join() === 'renovar,noAcepto,archivar', av);
ok('vencida que espera autorización sigue esperando', accionesDe({ ...Q, status: 'draft', approvalStatus: 'pending' }, { hoy: '2026-11-24' }).etiqueta === 'Por autorizar');
ok('sin permiso, vencida sin acciones', accionesDe(Q, { hoy: '2026-11-24', puedeEscribir: false }).acciones.length === 0 && accionesDe(Q, { hoy: '2026-11-24', puedeEscribir: false }).etiqueta === 'Vencida');
ok('sin hoy se comporta como antes', accionesDe(Q).etiqueta === 'Enviada');
const L = [Q, { ...Q, id: 'b', validUntil: '2026-12-09' }, { ...Q, id: 'c', status: 'draft', validUntil: '2026-11-01' }];
ok('filtro Vencidas', filtraCotizaciones(L, 'expired', '2026-11-24').map(c => c.id).join() === 'q,c');
ok('Enviadas ya no cuenta las vencidas', filtraCotizaciones(L, 'sent', '2026-11-24').map(c => c.id).join() === 'b');
ok('Borrador ya no cuenta las vencidas', filtraCotizaciones(L, 'draft', '2026-11-24').length === 0);

/* WhatsApp */
const cot = { folio: 'TC-2026-001', sponsorName: 'Ferretería Centro', packageName: 'Patrocinador oficial', months: 12, monthlyTotal: 5220, contractTotal: 62640, ivaPct: 16, items: [] };
const msg = mensajeWhatsApp(cot, 'Tannery City');
ok('WhatsApp por mes: mensual, meses y contrato con IVA', /\$5,220 al mes por 12 meses \(\$62,640 el contrato, IVA incluido\)/.test(msg) && /TC-2026-001/.test(msg), msg);
ok('WhatsApp de pago único como antes', /espacio por \$1,000/.test(mensajeWhatsApp({ folio: 'COT-2026-001', total: 1000, items: [{}] }, 'X')));

/* Hoja */
ok('posiciones del uniforme', posicionDe('Logo en pecho').lado === 'Frente' && posicionDe('Logo en manga izquierda').x === 69 && posicionDe('Logo en medias').lado === 'Medias' && posicionDe('Reel') === null);
ok('sólo fotos del kit', fotoDelKit('/brand/patrocinios/chavicos.jpg') && !fotoDelKit('https://malo.com/x.jpg') && !fotoDelKit('/brand/patrocinios/../x.jpg') && !fotoDelKit(null));
ok('teléfono bonito', telefonoBonito('524792651338') === '479 265 1338' && telefonoBonito('4792651338') === '479 265 1338' && telefonoBonito('') === '');
const COT = {
  folio: 'TC-2026-001', sponsorName: 'Ferretería Centro', contactName: 'Ana López', packageAssetId: 'p2', packageName: 'Patrocinador oficial',
  months: 12, ivaPct: 16, subtotal: 5000, discountAmount: 500, discountPct: 10, ivaAmount: 720, monthlyTotal: 5220, contractTotal: 62640, total: 54000,
  validUntil: '2026-12-09', notes: 'Incluye diseño del logo',
  items: [
    { assetId: 'p2', description: 'Patrocinador oficial', unitPrice: 3000, quantity: 1 },
    { assetId: 'c1', description: 'Cancha Chavicos', unitPrice: 2000, quantity: 1 },
    { assetId: 'u1', description: 'Logo en pecho', unitPrice: 0, quantity: 1 },
    { assetId: 'u2', description: 'Logo en manga derecha', unitPrice: 0, quantity: 1 },
    { assetId: 'u3', description: 'Logo en medias', unitPrice: 0, quantity: 1 },
    { assetId: 'e1', description: 'Naming de torneo / final / cancha', unitPrice: 0, quantity: 1 },
    { assetId: 'd1', description: 'Reel Instagram', unitPrice: 0, quantity: 2 },
  ],
};
const ACT = [OFICIAL, CHAVICOS, PECHO, MANGA, MEDIAS, NAMING, REEL];
const h = datosDeHoja({ cot: COT, activos: ACT, club: 'Tannery City', hoy: '2026-11-24', whatsapp: '524792651338', esTannery: true });
ok('encabezado: folio, fecha larga y año', h.folio === 'TC-2026-001' && h.fecha === '24 de noviembre de 2026' && h.anio === '2026');
ok('bloque marca: contacto, paquete, meses, vigencia', h.contacto === 'Ana López' && h.paquete === 'Patrocinador oficial' && h.meses === 12 && h.vigencia === '9 de diciembre de 2026');
ok('el paquete va como grupo Paquete', h.lineas[0].grupo === 'Paquete' && h.lineas[0].paquete && h.lineas[0].precio === '$3,000');
ok('las lonas cuentan sus piezas', h.lineas[1].cantidad === 12 && h.lineas[1].precio === '$2,000');
ok('precio 0 dice Incluido', h.lineas.filter(l => l.precio === 'Incluido').length === 5);
ok('uniforme numerado en orden', h.uniforme.map(u => u.n + ':' + u.lado).join() === '1:Frente,2:Frente,3:Medias' && h.manga);
ok('propiedades con foto, cuántos espacios y qué es', h.propiedades.length === 2 && h.propiedades[0].cantidad === '12 espacios' && /cancha principal/.test(h.propiedades[0].descripcion) && h.propiedades[1].cantidad === '');
ok('los totales son los de la pantalla', h.totales.base === '$3,000' && h.totales.extras === '$2,000' && h.totales.descuento === '-$500' && h.totales.iva === '$720' && h.totales.mensual === '$5,220' && h.totales.contrato === '$62,640', h.totales);
ok('legal con vigencia y producción a cargo del patrocinador', /hasta el 9 de diciembre de 2026/.test(h.legal) && /IVA va desglosado/.test(h.legal) && /Producción de materiales a cargo del patrocinador/.test(h.legal));
ok('pie sólo con el WhatsApp de la academia', h.pie === 'WhatsApp academia 479 265 1338' && !/477/.test(h.pie));
const sinWa = datosDeHoja({ cot: { ...COT, ivaPct: 0, ivaAmount: 0 }, activos: ACT, club: 'Halcones FC', hoy: '2026-11-24' });
ok('sin WhatsApp el pie es el club; sin IVA dice más IVA', sinWa.pie === 'Halcones FC' && /más IVA/.test(sinWa.legal) && sinWa.totales.iva === '');
const viejo = datosDeHoja({ cot: { folio: 'COT-2026-001', sponsorName: 'Prueba', subtotal: 13750, total: 13750, items: [{ description: 'Algo', unitPrice: 13750, quantity: 1 }] }, activos: [], club: 'X', hoy: '2026-11-24' });
ok('una de pago único también se dibuja', viejo.paquete === 'Pago único' && viejo.totales.contrato === '$13,750' && !viejo.totales.conBase);
ok('nombre del archivo', nombreDeHoja('TC-2026-001', 'Ferretería Centro') === 'Propuesta-TC-2026-001-Ferreteria-Centro.pdf');

// El PDF se dibuja (sin imágenes en node) y trae los mismos totales.
const doc = await hojaPdf(h, { jsPDF, cargar: async () => null });
const paginas = doc.internal.getNumberOfPages();
ok('portada + uniforme + propiedades = 3 hojas', paginas === 3, paginas);
const texto = doc.output();
ok('el PDF trae los totales de la pantalla', ['$5,220', '$62,640', '-$500', '$720', 'TC-2026-001'].every(s => texto.includes(s)));
ok('el PDF trae el pie en cada hoja', (texto.match(/WhatsApp academia 479 265 1338/g) || []).length === 3);
const docViejo = await hojaPdf(viejo, { jsPDF, cargar: async () => null });
ok('sin uniforme ni propiedades es una sola hoja', docViejo.internal.getNumberOfPages() === 1);
const muchas = datosDeHoja({ cot: { ...COT, items: Array.from({ length: 40 }, (_, i) => ({ description: 'Espacio ' + (i + 1), unitPrice: 100, quantity: 1 })) }, activos: [], club: 'X', hoy: '2026-11-24' });
const docLargo = await hojaPdf(muchas, { jsPDF, cargar: async () => null });
ok('40 renglones pasan a otra hoja sin cortarse', docLargo.internal.getNumberOfPages() >= 2 && docLargo.output().includes('Espacio 40'));

if (fallos) { console.error(`Cotizador por mes QA: ${fallos} de ${casos} fallaron`); process.exit(1); }
console.log(`Cotizador por mes QA OK · ${casos} casos: cuentas del README, meses del paquete, vencidas, WhatsApp, hoja y PDF`);
