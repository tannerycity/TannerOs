/* El expediente de la visoría en PDF (29/10/2026, h54).
 *
 * Paquete docs/visorias/00 §E y 03 (TC-17, TC-18): el PDF conserva el texto
 * exacto firmado, el aviso de privacidad, cada decisión por separado (sí y
 * no), la firma, la hora del servidor y las huellas; dice "firmado
 * electrónicamente" sin presumir NOM-151; y NUNCA lleva la salud del menor.
 *
 * La firma se dibuja de verdad en un canvas de Chromium (un PNG real, como el
 * del teléfono). El PDF se arma con la misma función que corre en el servidor
 * (supabase/functions/visoria-expediente/pdf.js) y se lee de regreso: se
 * descomprimen sus contenidos y se buscan los textos.
 */
import { chromium } from 'playwright-core';
import { createRequire } from 'node:module';
import zlib from 'node:zlib';
import { armaExpediente, limpia, fechaMexico } from '../supabase/functions/visoria-expediente/pdf.js';

const require = createRequire(import.meta.url);
const PDFLib = require('pdf-lib');

let fallas = 0, n = 0;
const revisa = (t, ok, extra = '') => { n++; if (ok) console.log(`OK  ${t}`); else { fallas++; console.log(`MAL ${t}${extra ? ` · ${String(extra).slice(0, 300)}` : ''}`); } };

const nav = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const pg = await nav.newPage();
const firma = await pg.evaluate(() => {
  const c = document.createElement('canvas'); c.width = 600; c.height = 220; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 600, 220); g.strokeStyle = '#07191e'; g.lineWidth = 3.2; g.beginPath();
  for (let i = 0; i < 80; i++) { const x = 60 + i * 6, y = 110 + Math.sin(i / 5) * 40; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
  g.stroke(); return c.toDataURL('image/png');
});
await nav.close();

const TEXTO = 'TANNERY CITY FC\nCONSENTIMIENTO INFORMADO Y AUTORIZACIÓN DE PARTICIPACIÓN EN VISORÍA DE FÚTBOL DE MENORES DE EDAD\n\n'
  + '1. Identificación y facultades del firmante\n\nYo, Mamá QA Prueba, en mi carácter de MADRE de Qaniño Prueba Uno, nacido(a) el 02/03/2015, declaro que cuento con las facultades necesarias.\n\n'
  + 'ESTA VISORÍA NO INCLUYE SEGURO MÉDICO, SEGURO DE ACCIDENTES PERSONALES NI COBERTURA DE HOSPITALIZACIÓN PROPORCIONADA POR TANNERY CITY FC.\n\n'
  + `${'Texto largo del consentimiento para forzar varias páginas y probar el salto de línea con palabras acentuadas: niño, cancha, órdenes, ¿sí?, ¡vamos! '.repeat(40)}\n\n`
  + '12. Declaración final del firmante\n\nReconozco expresamente que ninguna cláusula elimina responsabilidades legalmente exigibles del organizador.';
const ctx = {
  consentId: '11111111-2222-3333-4444-555555555555', organizationId: 'org', folio: 'TC-2026-00042',
  child: { name: 'Qaniño Prueba Uno', birthDate: '2015-03-02' },
  campaign: { title: 'Visoría Tannery City', slug: 'visoria-noviembre-2026', location: 'Tannery City Park · Españita 1305', dates: 'Viernes 13 y sábado 14 de noviembre', organizer: 'Organizador QA S.C.', schedule: 'Viernes 13, 16:00 a 19:00' },
  signer: { name: 'Mamá QA Prueba', relationship: 'madre', phone: '4771112233' },
  emergency: { nombre: 'Abuela QA', telefono: '4774445566' }, pickup: 'Mamá o abuela', insurance: 'sin_seguro_verificado',
  consent: { version: 'CONSENTIMIENTO visoria-noviembre-2026-v1', title: 'Consentimiento informado', text: TEXTO, hash: 'a'.repeat(64), templateHash: 'b'.repeat(64) },
  privacy: { version: 'AVISO visoria-noviembre-2026-v1', title: 'Aviso de privacidad integral para visorías de menores', text: 'Aviso de privacidad. Derechos ARCO por correo. Finalidad secundaria opcional.', hash: 'c'.repeat(64) },
  choices: {
    accept_participation: { value: true, required: true, text: 'He leído los términos y autorizo la participación del menor. Entiendo los riesgos propios del fútbol.', clientAt: '2026-10-29T20:00:01Z' },
    ack_no_insurance: { value: true, required: true, text: 'Entiendo que esta visoría no incluye seguro médico ni de accidentes proporcionado por el organizador.' },
    media_publication: { value: false, required: false, text: 'Autorizo la captación y publicación institucional de mi hijo(a) en fotografías o videos de esta visoría.' } },
  signaturePng: firma, signatureHash: 'd'.repeat(64), signedAt: '2026-10-29T20:00:05Z', timezone: 'America/Mexico_City',
  eventHash: 'e'.repeat(64), evidenceHash: 'f'.repeat(64), status: 'pending_artifact', healthGiven: true,
  // Aunque algo así llegara por error, el PDF no lo dibuja: sólo usa campos que conoce.
  salud: { alergias: { respuesta: 'si', detalle: 'Penicilina' } }
};

const bytes = await armaExpediente(PDFLib, ctx);
revisa('el PDF se genera y empieza como PDF', bytes.length > 3000 && Buffer.from(bytes.slice(0, 5)).toString() === '%PDF-');
const doc = await PDFLib.PDFDocument.load(bytes);
revisa('se puede abrir de nuevo y tiene varias páginas (datos, texto íntegro, aviso)', doc.getPageCount() >= 3, doc.getPageCount());

// Leer el texto: cada stream se descomprime y se juntan los <hex> Tj.
const crudo = Buffer.from(bytes).toString('latin1');
let texto = '';
for (const m of crudo.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
  let s = Buffer.from(m[1], 'latin1');
  try { s = zlib.inflateSync(s); } catch { /* no estaba comprimido */ }
  for (const t of s.toString('latin1').matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) texto += `${Buffer.from(t[1], 'hex').toString('latin1')} `;
}
const plano = () => texto.replace(/\s+/g, ' ');
const tiene = s => plano().includes(limpia(s).replace(/\s+/g, ' '));
revisa('trae folio, menor, firmante y parentesco', tiene('TC-2026-00042') && tiene('Qaniño Prueba Uno') && tiene('Mamá QA Prueba') && tiene('Madre'));
revisa('trae el texto íntegro firmado (inicio y cláusula final)', tiene('Yo, Mamá QA Prueba, en mi carácter de MADRE') && tiene('ninguna cláusula elimina responsabilidades legalmente'));
revisa('trae el aviso de privacidad íntegro', tiene('Derechos ARCO por correo.'));
revisa('cada decisión con su sí y su no', tiene('[SÍ] He leído los términos y autorizo la participación del menor.') && tiene('[NO] Autorizo la captación y publicación'));
revisa('la hora del servidor en hora del centro de México y en UTC', tiene(fechaMexico(ctx.signedAt)) && tiene('UTC 2026-10-29T20:00:05.000Z'));
revisa('las huellas SHA-256 del texto, del aviso, de la firma y de la evidencia', tiene('a'.repeat(64)) && tiene('c'.repeat(64)) && tiene('d'.repeat(64)) && texto.includes('f'.repeat(64)));
revisa('dice "firmado electrónicamente" y aclara que no es NOM-151', tiene('Firmado electrónicamente mediante formulario en línea') && tiene('No constituye firma electrónica avanzada ni constancia de conservación conforme a la NOM-151-SCFI-2016.'));
revisa('el aviso del seguro sale tal cual', tiene('ESTA VISORÍA NO INCLUYE SEGURO MÉDICO'));
revisa('la salud NO va en el PDF (sólo "entregado, restringido")', !texto.includes('Penicilina') && tiene('Su contenido es dato sensible'));
revisa('la firma va como imagen', /\/Subtype\s*\/Image/.test(crudo));
revisa('limpia lo que Helvetica no sabe dibujar en lugar de tronar', limpia('“hola” — ok…\u{1F600}') === '"hola" - ok...??' || limpia('“hola” — ok…\u{1F600}').startsWith('"hola" - ok...'));

console.log(fallas ? `\nVisoría expediente: ${fallas} de ${n} fallaron` : `\nVisoría expediente OK · ${n} revisiones: texto íntegro, decisiones, hora, huellas, firma, sin salud`);
process.exit(fallas ? 1 : 0);
