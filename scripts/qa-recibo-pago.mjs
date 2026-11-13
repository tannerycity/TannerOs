/* Recibo de pago en PDF (13/11/2026). Presidencia: "ver recibo, descargar
 * recibo, enviar recibo por WhatsApp... un PDF estilo Tannery City".
 * Aquí lo que no necesita navegador: qué datos lleva (y cuáles no), el nombre
 * del archivo, y que el PDF sale completo, de una hoja, con la marca del club
 * que esté abierto y sin nombres fijos. */
import { readFileSync } from 'node:fs';
import { datosDeRecibo, nombreDelRecibo, reciboPdf, marcaDelClub } from '../v2/cobro/recibo-pdf.js';
const { jsPDF } = await import('../vendor/jspdf.mjs');

let fallos = 0, corridas = 0;
const revisa = (n, ok, d) => { corridas++; if (!ok) { fallos++; console.error(` - ${n}${d ? `\n   ${d}` : ''}`); } };

const base = { club: 'Club de Prueba FC', folio: 'C-0127', fecha: '13 nov 2026', tanners: ['Diego Ramírez', 'Sofía Ramírez'],
  lineas: [{ label: 'Mensualidad de noviembre · Diego', amount: 800 }, { label: 'Inscripción · Sofía', amount: 1000 }, { label: 'Vacío', amount: 0 }],
  metodos: [{ method: 'cash', amount: 800 }, { method: 'transfer', amount: 1000 }], total: 1800, cobro: 'Zul', referencia: 'SPEI 4471',
  telefono: '4771234567', nota: 'pagó la abuela' };
const d = datosDeRecibo(base);
revisa('lleva club, folio, fecha, Tanners, conceptos, total, cómo pagó y quién recibió', d.club === 'Club de Prueba FC' && d.folio === 'C-0127' && d.tanners.length === 2 && d.total === 1800 && d.cobro === 'Zul' && d.referencia === 'SPEI 4471');
revisa('un concepto en ceros no sale', d.conceptos.length === 2);
revisa('los métodos salen en español', d.metodos.map(m => m.nombre).join() === 'Efectivo,Transferencia');
revisa('no lleva teléfono ni notas internas', !/4771234567|abuela/.test(JSON.stringify(d)));
revisa('sin total, suma los conceptos', datosDeRecibo({ ...base, total: undefined }).total === 1800);
revisa('sin club no inventa uno', datosDeRecibo({ ...base, club: '' }).club === 'El club');
revisa('el archivo se llama por folio y Tanner, sin acentos ni espacios', nombreDelRecibo(d) === 'Recibo-C-0127-Diego-Ramirez.pdf', nombreDelRecibo(d));

const doc = await reciboPdf(d, { jsPDF, marca: { primario: '#012A3A', secundario: '#087D8E', acento: '#C6AC5C' } });
const bytes = Buffer.from(doc.output('arraybuffer')), texto = bytes.toString('latin1');
revisa('sale un PDF de verdad, de una hoja y media carta', bytes.subarray(0, 5).toString() === '%PDF-' && doc.getNumberOfPages() === 1 && Math.round(doc.internal.pageSize.getWidth()) === 396);
revisa('trae el folio, el club y el total', /C-0127/.test(texto) && /CLUB DE PRUEBA FC/.test(texto) && /\$1,800\.00/.test(texto));
const muchos = await reciboPdf(datosDeRecibo({ ...base, lineas: Array.from({ length: 30 }, (_, i) => ({ label: `Concepto ${i + 1}`, amount: 10 })), total: 300 }), { jsPDF });
revisa('con muchos conceptos pasa a otra hoja en vez de encimarse', muchos.getNumberOfPages() >= 2);
const sinMarca = await reciboPdf(d, { jsPDF, marca: { primario: 'no-es-color', escudo: 'data:image/png;base64,roto' } });
revisa('una marca rota no tumba el recibo', sinMarca.getNumberOfPages() === 1);

const m = await marcaDelClub({ brand: 'Otro Club', colors: { primary: '#111111', secondary: '#222222', accent: '#333333' }, assets: {} });
revisa('la marca sale del club abierto: nombre y colores', m.nombre === 'Otro Club' && m.primario === '#111111' && m.acento === '#333333' && m.escudo === null);
const fuente = readFileSync(new URL('../v2/cobro/recibo-pdf.js', import.meta.url), 'utf8');
revisa('nada se carga de fuera', !/https?:\/\//.test(fuente));

console.log(fallos ? `Recibo de pago FAILED · ${fallos} de ${corridas}` : `Recibo de pago OK · ${corridas} revisiones: datos, nombre del archivo, PDF de una hoja y marca del club`);
process.exit(fallos ? 1 : 0);
