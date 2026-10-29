/* Lo puro del consentimiento de visoría (29/10/2026, h54): sin navegador.
 *
 *   - Nada se da por contestado: salud y decisiones Sí/No sin respuesta no pasan.
 *   - Una casilla obligatoria en "no" no pasa.
 *   - Un lienzo en blanco o un punto no es firma.
 *   - El texto que se lee antes de firmar lleva a quien firma y al menor, y si
 *     falta un dato se ve el hueco, no un invento.
 *   - Nunca se le dice a la familia "listo" sin expediente o sin verificar.
 *   - Los errores del servidor llegan en español.
 *   - El staff ve el estado de acceso en orden: primero quien no puede entrar.
 */
import { faltaEnSalud, faltaEnDecisiones, trazoValido, rellenaFirmante, estadoParaFamilia, mensajeDeError, PREGUNTAS_SALUD } from '../visoria/consentimiento.js';
import { resumenAcceso, ordenaPorAcceso, faltante } from '../v2/visorias/visorias.js';

let fallas = 0, n = 0;
const revisa = (t, ok) => { n++; if (!ok) { fallas++; console.error(`MAL ${t}`); } };

const todo = r => Object.fromEntries(PREGUNTAS_SALUD.map(q => [q.k, { respuesta: r }]));
revisa('salud sin contestar no pasa', faltaEnSalud({}) !== '');
revisa('salud "Sí" sin cuál no pasa', faltaEnSalud({ ...todo('ninguna'), alergias: { respuesta: 'si' } }) !== '');
revisa('salud completa pasa (ninguna y privado)', faltaEnSalud({ ...todo('ninguna'), atencion: { respuesta: 'privado' } }) === '');

const D = [{ key: 'accept_participation', required: true }, { key: 'ack_no_insurance', required: true }, { key: 'media_publication', choice: true }];
const si = { value: true }, no = { value: false };
revisa('decisiones vacías no pasan', faltaEnDecisiones(D, {}) !== '');
revisa('obligatoria en no, no pasa', faltaEnDecisiones(D, { accept_participation: no, ack_no_insurance: si, media_publication: no }) !== '');
revisa('fotos sin contestar no pasa (no hay valor por defecto)', faltaEnDecisiones(D, { accept_participation: si, ack_no_insurance: si }) !== '');
revisa('fotos en No sí pasa: no bloquea participar', faltaEnDecisiones(D, { accept_participation: si, ack_no_insurance: si, media_publication: no }) === '');

revisa('lienzo en blanco no es firma', !trazoValido({ puntos: 0, minX: 1e9, maxX: 0, minY: 1e9, maxY: 0 }));
revisa('un punto no es firma', !trazoValido({ puntos: 3, minX: 10, maxX: 12, minY: 10, maxY: 11 }));
revisa('un trazo de verdad sí', trazoValido({ puntos: 40, minX: 10, maxX: 200, minY: 20, maxY: 80 }));

const texto = 'Yo, {{firmante}}, en mi carácter de {{parentesco}} de {{menor}}, nacido(a) el {{nacimiento}}. Contacto: {{telefono_firmante}}. Organiza {{organizador_legal}}.';
const r = rellenaFirmante(texto, { firmante: { name: 'Ana Ávila', relationship: 'madre', phone: '477 123 4567' } }, { firstName: 'Leo', lastName: 'Ávila', birthDate: '2015-03-02' });
revisa('se lee con quien firma, parentesco, menor y fecha', r.includes('Yo, Ana Ávila, en mi carácter de MADRE de Leo Ávila, nacido(a) el 02/03/2015') && r.includes('4771234567'));
revisa('lo que no es del firmante no se toca en el navegador', r.includes('{{organizador_legal}}'));
revisa('si falta un dato se ve el hueco', rellenaFirmante('{{firmante}}', {}, {}) === '(nombre de quien firma)');
revisa('otro parentesco dice representante', rellenaFirmante('{{parentesco}}', { firmante: { relationship: 'otro', relationshipDetail: 'abuela con tutela' } }, {}) === 'REPRESENTANTE (abuela con tutela)');

revisa('sin firma: falta firmar', /Falta firmar/.test(estadoParaFamilia({ consent: null, signingOpen: true }).titulo));
revisa('sin expediente no dice listo', /quedó guardada/.test(estadoParaFamilia({ consent: { status: 'pending_artifact' } }).titulo));
revisa('sin verificar no dice listo', /falta verificar/.test(estadoParaFamilia({ consent: { status: 'pending_verification' } }).titulo));
revisa('revisión médica lo dice', /revisión médica/.test(estadoParaFamilia({ consent: { status: 'pending_verification' }, access: { status: 'REVISION_MEDICA' } }).titulo));
revisa('versión vieja pide firmar de nuevo', /de nuevo/.test(estadoParaFamilia({ consent: { status: 'signed', outdated: true } }).titulo));
revisa('firmado y verificado', estadoParaFamilia({ consent: { status: 'signed' } }).tono === 'ok');

revisa('errores en español', /Falta marcar la autorización de participación/.test(mensajeDeError({ message: 'Declaration required: accept_participation' }))
  && /documento cambió/.test(mensajeDeError({ message: 'Document version changed' })) && /no abre la firma/.test(mensajeDeError('Signing closed')));

const items = [{ firstName: 'B', lastName: 'x', access: { status: 'AUTORIZADO' } }, { firstName: 'A', lastName: 'x', access: { status: 'NO_APTO' } }, { firstName: 'C', lastName: 'x' }];
revisa('sin estado cuenta como sin consentimiento', resumenAcceso(items).SIN_CONSENTIMIENTO === 1 && resumenAcceso(items).AUTORIZADO === 1);
revisa('la puerta: primero quien no puede entrar', ordenaPorAcceso(items).map(x => x.firstName).join('') === 'ACB');
revisa('faltantes en palabras', /Organizador jurídico/.test(faltante('campo:organizador_legal')) && /seguro/.test(faltante('seguro')) && /de seguridad/.test(faltante('aprobacion:seguridad')));

console.log(fallas ? `Visoría consentimiento: ${fallas} de ${n} fallaron` : `Visoría consentimiento OK · ${n} revisiones`);
process.exit(fallas ? 1 : 0);
