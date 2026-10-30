/* Lo del consentimiento de la visoría que no toca la pantalla (29/10/2026, h54).
 * Sin DOM: se prueba con node (scripts/qa-visoria-consentimiento.mjs).
 *
 * Ojo: aquí no se decide quién puede firmar. Eso lo valida el servidor
 * (v2_public_visoria_sign). Esto sólo evita mandar algo incompleto y explica
 * en español lo que el servidor rechazó. */

// docs/visorias/00 §A: resumen de riesgos antes de firmar.
export const RIESGOS = [
  'Contacto físico, choques y golpes con otros jugadores o con el balón.',
  'Caídas, torceduras, esguinces, distensiones y, con menos frecuencia, fracturas.',
  'Fatiga, deshidratación y efectos del calor o del clima.',
  'Emergencias médicas que requieran atención inmediata.',
  'En casos excepcionales, una lesión grave.'
];

// docs/visorias/00 §B: breve y proporcional; no un historial clínico.
export const PREGUNTAS_SALUD = [
  { k: 'condicion', t: '¿Tiene alguna lesión o condición actual que importe para hacer deporte?', ej: 'Ej. esguince de tobillo hace 2 semanas' },
  { k: 'alergias', t: '¿Tiene alguna alergia importante en caso de emergencia?', ej: 'Ej. penicilina, picadura de abeja' },
  { k: 'restriccion', t: '¿Tiene alguna restricción médica para hacer ejercicio?', ej: 'Ej. no puede correr más de 10 minutos' },
  { k: 'atencion', t: '¿Necesita alguna atención o medicamento durante la actividad?', ej: 'Ej. inhalador para el asma' }
];

export const PARENTESCOS = [['madre', 'Mamá'], ['padre', 'Papá'], ['tutor_legal', 'Tutor legal'], ['otro', 'Otro']];

const DECLARA = {
  accept_participation: 'la autorización de participación',
  ack_no_insurance: 'que entiendes que no hay seguro del organizador',
  ack_insurance_terms: 'que conoces la cobertura del seguro',
  ack_health_and_emergency: 'la declaración de salud y emergencias',
  consent_sensitive_data: 'el consentimiento para tratar sus datos de salud',
  guardian_authority: 'que estás legalmente facultado(a)',
  transfer_to_evaluator: 'si autorizas o no compartir sus datos deportivos con el evaluador',
  media_publication: 'si autorizas o no fotos y video'
};

const ERRORES = [
  [/Campaign full/, 'Ya se llenaron los lugares. Escríbenos por WhatsApp y te avisamos si se libera uno.'],
  [/Campaign closed/, 'Las inscripciones ya cerraron.'],
  [/Signing closed/, 'El club todavía no abre la firma del consentimiento. Te avisamos por WhatsApp.'],
  [/Document version changed/, 'El documento cambió mientras lo leías. Revisa la versión nueva antes de firmar.'],
  [/Signature required/, 'Falta tu firma en el recuadro.'],
  [/Signer name required/, 'Escribe el nombre y apellido de quien firma.'],
  [/Relationship detail required/, 'Dinos qué parentesco o representación tienes.'],
  [/Relationship required/, 'Dinos si eres su mamá, papá, tutor legal u otro.'],
  [/Emergency contact must be different/, 'El contacto de emergencia debe ser otra persona, con otro teléfono.'],
  [/Emergency contact required/, 'Falta el otro contacto de emergencia.'],
  [/Health (answer|detail) required/, 'Contesta las preguntas de salud.'],
  [/Phone required/, 'Revisa el WhatsApp: 10 dígitos.'],
  [/Invalid email/, 'Revisa el correo.'],
  [/School required/, 'Escribe la escuela.'],
  [/Guardian required/, 'Escribe tu nombre.'],
  [/Birth date required|Invalid birth date/, 'Revisa la fecha de nacimiento.'],
  [/Link not valid/, 'Esta liga ya no es válida. Pídele una nueva al club por WhatsApp.'],
  [/Too many requests/, 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.']
];

export function mensajeDeError(e) {
  const m = String(e?.message || e || '');
  const d = m.match(/Declaration required: ([a-z_]+)/);
  if (d) return `Falta marcar ${DECLARA[d[1]] || 'una autorización'}.`;
  const hit = ERRORES.find(([r]) => r.test(m));
  return hit ? hit[1] : 'No se pudo guardar. Revisa tu conexión e inténtalo otra vez.';
}

const PARENTESCO_TEXTO = { madre: 'MADRE', padre: 'PADRE', tutor_legal: 'TUTOR LEGAL' };
/* Para leer antes de firmar: los datos de quien firma en su lugar (el servidor
 * hace lo mismo al firmar; si falta algo, se ve el hueco y no un invento). */
export function rellenaFirmante(texto, datos = {}, p = {}) {
  const f = datos.firmante || {}, em = datos.emergencia || {};
  const [a, m, d] = String(p.birthDate || '').split('-');
  const vals = {
    firmante: f.name || '(nombre de quien firma)',
    parentesco: f.relationship === 'otro' ? `REPRESENTANTE (${f.relationshipDetail || '...'})` : (PARENTESCO_TEXTO[f.relationship] || '(parentesco)'),
    menor: [p.firstName, p.lastName].filter(Boolean).join(' ') || '(menor)',
    nacimiento: a ? `${d}/${m}/${a}` : '(fecha)',
    telefono_firmante: String(f.phone || '').replace(/\D/g, '') || '(tu WhatsApp)',
    contacto_emergencia: em.nombre ? `${em.nombre} · ${String(em.telefono || '').replace(/\D/g, '')}` : '(contacto de emergencia)'
  };
  return String(texto || '').replace(/\{\{(firmante|parentesco|menor|nacimiento|telefono_firmante|contacto_emergencia)\}\}/g, (_, k) => vals[k]);
}

export function faltaEnSalud(salud = {}) {
  for (const q of PREGUNTAS_SALUD) {
    const r = salud[q.k]?.respuesta;
    if (!['ninguna', 'si', 'privado'].includes(r)) return 'Contesta las cuatro preguntas de salud.';
    if (r === 'si' && String(salud[q.k]?.detalle || '').trim().length < 2) return 'Escribe brevemente cuál, en lo que contestaste "Sí".';
  }
  return '';
}

/* Obligatorias: palomeadas. Las de Sí/No: contestadas (nada viene marcado). */
export function faltaEnDecisiones(declaraciones = [], decisiones = {}) {
  for (const d of declaraciones) {
    const v = decisiones[d.key]?.value;
    if (d.choice && typeof v !== 'boolean') return `Falta contestar ${DECLARA[d.key] || 'una autorización'}.`;
    if (d.required && v !== true) return `Falta marcar ${DECLARA[d.key] || 'una autorización'}.`;
  }
  return '';
}

/* Un trazo de verdad: suficientes puntos y que ocupe algo del recuadro. */
export const trazoValido = t => !!t && t.puntos >= 15 && (t.maxX - t.minX) >= 40 && (t.maxY - t.minY) >= 12;

/* Lo que la familia ve de su estado. Nunca dice "listo" sin expediente. */
export function estadoParaFamilia(c = {}) {
  const k = c.consent, a = c.access || {};
  if (!k) return c.signingOpen
    ? { tono: 'pendiente', titulo: 'Falta firmar el consentimiento', texto: 'Sin consentimiento firmado no puede entrar a la cancha.' }
    : { tono: 'pendiente', titulo: 'Falta firmar el consentimiento', texto: 'El club está terminando los documentos. Te mandamos la liga por WhatsApp cuando se abra la firma. Sin consentimiento firmado no puede entrar a la cancha.' };
  if (k.outdated) return { tono: 'pendiente', titulo: 'Hay que firmar de nuevo', texto: 'Cambió algo importante de la visoría (sede, seguro, organizador o documentos). Firma la versión vigente.' };
  if (k.status === 'pending_artifact') return { tono: 'pendiente', titulo: 'Tu firma quedó guardada', texto: 'Falta generar tu expediente. Toca "Generar mi expediente".' };
  if (k.status === 'requires_review') return { tono: 'pendiente', titulo: 'Firmado · en revisión', texto: 'El club revisará tus facultades para autorizar y te contacta por WhatsApp.' };
  if (a.status === 'REVISION_MEDICA') return { tono: 'pendiente', titulo: 'Firmado · revisión médica', texto: 'El coordinador te contacta en privado antes de la visoría.' };
  if (k.status === 'pending_verification') return { tono: 'pendiente', titulo: 'Firmado · falta verificar que eres tú', texto: 'Manda el pase al WhatsApp del club desde tu número registrado, o muestra tu identificación en la entrada.' };
  if (k.status === 'signed') return { tono: 'ok', titulo: 'Consentimiento firmado y verificado', texto: 'Todo listo para la visoría.' };
  return { tono: 'pendiente', titulo: 'Consentimiento no válido', texto: 'Escríbenos por WhatsApp para resolverlo.' };
}
