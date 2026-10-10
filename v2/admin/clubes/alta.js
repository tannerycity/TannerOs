/* Alta de un club: el criterio, sin DOM (scripts/qa-alta-club.mjs lo prueba).
 *
 * Presidencia (10/10/2026): "un portal para dar de alta un club y
 * configurarlo fácil". Cinco pasos: identidad, plan, categorías, cobro y
 * dueño. Aquí vive lo que decide cada paso.
 */
export const PASOS = ['Identidad', 'Plan', 'Categorías', 'Cobro', 'Dueño'];

export const CATEGORIAS_SUGERIDAS = ['Sub-6', 'Sub-8', 'Sub-10', 'Sub-12', 'Sub-14', 'Sub-16', 'Sub-18', 'Femenil', 'Porteros'];

export function slugDe(nombre) {
  return String(nombre || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
}
export const slugValido = s => /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(String(s || ''));
const correoValido = c => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(c || '').trim());
const hex = c => /^#[0-9a-f]{6}$/i.test(String(c || ''));

// Lo que falta en cada paso, en español. Vacío = se puede avanzar.
export function faltantes(paso, d) {
  const f = [];
  if (paso === 0) {
    if (String(d.name || '').trim().length < 2) f.push('Escribe el nombre del club.');
    if (!slugValido(d.slug)) f.push('El identificador lleva entre 3 y 50 caracteres: minúsculas, números y guiones.');
    if (!hex(d.colors?.primary) || !hex(d.colors?.secondary)) f.push('Elige los colores del club.');
  }
  if (paso === 1 && !d.planCode) f.push('Elige un plan.');
  if (paso === 2) {
    if (!(d.categories || []).length) f.push('Agrega al menos una categoría.');
    if ((d.categories || []).some(c => c.monthlyFee !== '' && c.monthlyFee != null && !(Number(c.monthlyFee) >= 0))) f.push('Revisa las mensualidades.');
    const nombres = (d.categories || []).map(c => String(c.name).trim().toLowerCase());
    if (new Set(nombres).size !== nombres.length) f.push('Hay categorías repetidas.');
  }
  if (paso === 3) {
    const dia = n => Number.isInteger(Number(n)) && Number(n) >= 1 && Number(n) <= 28;
    if (!dia(d.chargeDay) || !dia(d.dueDay)) f.push('Los días de cobro y vencimiento van del 1 al 28.');
    if (!(Number(d.lateFee) >= 0)) f.push('El recargo no puede ser negativo.');
  }
  if (paso === 4) {
    if (String(d.owner?.name || '').trim().length < 2) f.push('Escribe el nombre del dueño.');
    if (!correoValido(d.owner?.email)) f.push('Escribe un correo válido: con ese correo entra el dueño.');
  }
  return f;
}

export function datosParaAlta(d) {
  return {
    name: String(d.name || '').trim(), slug: d.slug, city: String(d.city || '').trim() || null, legalName: null,
    planCode: d.planCode, founder: Boolean(d.founder),
    colors: { primary: d.colors.primary, secondary: d.colors.secondary, accent: d.colors.accent || '#C6AC5C' },
    categories: (d.categories || []).map(c => ({ name: String(c.name).trim(), monthlyFee: c.monthlyFee === '' || c.monthlyFee == null ? null : Number(c.monthlyFee) })),
    chargeDay: Number(d.chargeDay), dueDay: Number(d.dueDay), lateFee: Number(d.lateFee || 0),
    owner: { name: String(d.owner.name).trim(), email: String(d.owner.email).trim().toLowerCase(), phone: String(d.owner.phone || '').replace(/\D/g, '') }
  };
}

const primerNombre = v => { const p = String(v || '').trim().split(/\s+/)[0] || ''; return p ? p[0].toLocaleUpperCase('es-MX') + p.slice(1) : ''; };

// El mensaje que se le manda al dueño para que entre por primera vez.
export function mensajeBienvenida({ club, dueno, correo, producto = 'TannerOS', url }) {
  const hola = primerNombre(dueno);
  return [
    `Hola${hola ? ` ${hola}` : ''}, ya está listo ${club} en ${producto}.`,
    '',
    `1. Entra a ${url}`,
    `2. Crea tu cuenta con este correo: ${correo}`,
    '3. Al entrar ya eres Presidencia de tu club.',
    '',
    'Lo primero: sube tu escudo en Marca y apariencia, invita a tus profes en Usuarios y carga a tus jugadores.',
    'Cualquier duda, aquí estamos.'
  ].join('\n');
}

// Ingreso mensual estimado de los clubes que pagan. Fundador = 50% el primer año.
