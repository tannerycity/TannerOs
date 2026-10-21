// Cómo se ve el contacto de un tutor en cualquier pantalla.
//
// La migración del sistema anterior dejó 61 tutores con la relación
// "guardian" (19/08–08/09/2026) y Presidencia lo vio en el estado de cuenta:
// "guardian · +524779198191". Aquí se traduce lo que viene en inglés o
// escrito distinto, y el teléfono se lee como lo dice la gente.

const RELACION = {
  guardian: 'Tutor', 'legal guardian': 'Tutor', legal_guardian: 'Tutor', tutor: 'Tutor', tutora: 'Tutora',
  mother: 'Mamá', madre: 'Mamá', mama: 'Mamá', 'mamá': 'Mamá',
  father: 'Papá', padre: 'Papá', papa: 'Papá', 'papá': 'Papá',
  grandmother: 'Abuela', abuela: 'Abuela', grandfather: 'Abuelo', abuelo: 'Abuelo',
  aunt: 'Tía', tia: 'Tía', 'tía': 'Tía', uncle: 'Tío', tio: 'Tío', 'tío': 'Tío'
};

export function relacion(r) {
  const t = String(r || '').trim();
  if (!t) return '';
  return RELACION[t.toLocaleLowerCase('es-MX')] || t.charAt(0).toLocaleUpperCase('es-MX') + t.slice(1);
}

// "+524779198191" o "4779198191" → "477 919 8191".
export function telefonoBonito(p) {
  let n = String(p || '').replace(/\D/g, '');
  if (n.length === 12 && n.startsWith('52')) n = n.slice(2);
  if (n.length === 13 && n.startsWith('521')) n = n.slice(3);
  return n.length === 10 ? `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}` : String(p || '').trim();
}

// Para wa.me y tel:, con la lada de México si son 10 dígitos.
export function telefonoWa(p) {
  const n = String(p || '').replace(/\D/g, '');
  return n.length === 10 ? `52${n}` : n;
}
