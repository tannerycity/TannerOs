/* Costos públicos: la ÚNICA fuente de precios de /costos.
 *
 * Pedido de Presidencia (20/10/2026): "que cualquier papá vea cuánto cuesta y
 * cuánto pagaría por inscribir a sus hijos, sin entrar a la app". Y después:
 * "que sea como opción 1, opción 2… cuántos días y el costo; que cuando sea
 * SaaS la otra empresa también lo pueda poner".
 *
 * Por eso todo es una lista que el club edita en Club › Costos públicos:
 *   categorías (nombre, edades, inscripción) con sus opciones
 *   (días por semana + mensualidad), y paquetes (cuántos alumnos de cada
 *   categoría + mensualidad). El precio por clase NO se captura: se calcula
 *   (mensualidad ÷ 4 semanas ÷ días).
 * Lo de este archivo es lo que sale si el club no ha guardado nada.
 */
export const TARIFAS = {
  version: '2026-10-21',
  moneda: 'MXN',
  whatsapp: { numero: '524792651338', visible: '479 265 1338' },

  categorias: [
    // Costos oficiales del cartel del club (Presidencia, 21/10/2026). Tanners
    // primero, como en el cartel: así se leen los paquetes ("1 Tanner + 1 Baby").
    // T10 y T12 entrenan martes, miércoles y jueves (horarios del club, 12/10/2026).
    { clave: 'tanner', nombre: 'Tanners', edades: 'De 6 a 12 años', inscripcion: 800,
      opciones: [{ clave: 'tanner-3', dias: 3, mensualidad: 800 }] },
    { clave: 'baby', nombre: 'Baby Tanners', edades: 'De 3 a 6 años', inscripcion: 500,
      opciones: [{ clave: 'baby-1', dias: 1, mensualidad: 400 }, { clave: 'baby-2', dias: 2, mensualidad: 550 }] }
  ],
  // Qué incluye la inscripción: vacío hasta que Presidencia lo confirme (no se enseña).
  incluyeInscripcion: '',

  /* Paquetes familiares, del cartel oficial (21/10/2026): Tanners 2 = $1,500
     y 3 = $2,000; "Paquete mixto: tarifa de Tanners + $400 por cada Baby
     Tanner" (1+1 = $1,200, 2+1 = $1,900, 2 Baby = $800). Las combinaciones de
     hasta 3 hijos que la regla cubre y el cartel no lista salen de la misma
     regla (1 Tanner + 2 Baby = $1,600; 3 Baby = $1,200).
     Si `confirmado` fuera false, la calculadora los enseñaría "por confirmar"
     sin cobrarlos. Un paquete nunca cobra más que la suma sin paquete. */
  paquetes: {
    confirmado: true,
    lista: [
      { clave: 'p-t2', nombre: '2 Tanners', cantidades: { tanner: 2 }, mensualidad: 1500 },
      { clave: 'p-t3', nombre: '3 Tanners', cantidades: { tanner: 3 }, mensualidad: 2000 },
      { clave: 'p-t1b1', nombre: '1 Tanner + 1 Baby Tanner', cantidades: { tanner: 1, baby: 1 }, mensualidad: 1200 },
      { clave: 'p-t2b1', nombre: '2 Tanners + 1 Baby Tanner', cantidades: { tanner: 2, baby: 1 }, mensualidad: 1900 },
      { clave: 'p-t1b2', nombre: '1 Tanner + 2 Baby Tanners', cantidades: { tanner: 1, baby: 2 }, mensualidad: 1600 },
      { clave: 'p-b2', nombre: '2 Baby Tanners', cantidades: { baby: 2 }, mensualidad: 800 },
      { clave: 'p-b3', nombre: '3 Baby Tanners', cantidades: { baby: 3 }, mensualidad: 1200 }
    ]
  },

  /* Recargo por pago tardío: la política de cobro del club (billing_policies:
     vence el día 5, $100). TannerOS lo carga por cada mensualidad vencida, o
     sea por cada hijo, y nunca al primer mes (first_month_late_fee_enabled). */
  recargo: { monto: 100, diaLimite: 5, porAlumno: true, primerMes: false },

  /* Primer mes proporcional: la MISMA regla que cobra TannerOS
     (app.prorated_monthly_fee, método weekly_quarters, regla BILL-003
     aprobada): se cobran las semanas que quedan del mes en base 4, según el
     día de ingreso. Del 1 al 7, mes completo; 8 al 14, 3/4; 15 al 21, 1/2;
     del 22 en adelante, 1/4. Se redondea al peso. */
  prorrateo: {
    metodo: 'weekly_quarters',
    confirmado: true,
    tramos: [
      { hastaDia: 7, semanas: 4 },
      { hastaDia: 14, semanas: 3 },
      { hastaDia: 21, semanas: 2 },
      { hastaDia: 31, semanas: 1 }
    ],
    base: 4,
    // Sólo para nuevo ingreso: quien ya está inscrito paga su mensualidad
    // completa aunque asista a menos clases (Presidencia, 20/10/2026).
    soloNuevoIngreso: true
  },

  maxHijos: 3,
  notaProporcional: 'Importante: el pago proporcional es únicamente para alumnos de nuevo ingreso, en su primer mes. Si tu hijo ya está inscrito, pagas la mensualidad completa que acordaste al inscribirte, aunque asista a menos clases en el mes.',
  nota: 'Los importes son informativos y están sujetos a validación por la administración de Tannery City.'
};

/* Límites de lo que el club puede capturar (los mismos que revisa la base). */
export const LIMITES = { categorias: 8, opciones: 6, paquetes: 12, dias: 7, peso: 100000, texto: 60 };

const peso = v => (Number.isInteger(v) && v >= 0 && v <= LIMITES.peso ? v : null);
const texto = (v, max = LIMITES.texto) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const claveDe = (v, i, pre) => (typeof v === 'string' && /^[a-z0-9-]{1,40}$/.test(v) ? v : `${pre}-${i + 1}`);

export const nombreOpcion = o => `${o.dias} ${o.dias === 1 ? 'día' : 'días'} por semana`;
// Precio por clase: mensualidad entre las clases de un mes de 4 semanas.
export const porClase = o => Math.round(o.mensualidad / (o.dias * 4));

/* Lo que guardó el club (Club › Costos públicos) sobre lo de este archivo.
   Se valida pieza por pieza: lo que viene mal se descarta y, si no queda una
   lista usable, se usa la de aquí. Así un dato mal guardado nunca rompe
   /costos. */
export function aplicaPrecios(base, p) {
  const t = JSON.parse(JSON.stringify(base));
  if (!p || typeof p !== 'object') return t;
  if (Array.isArray(p.categorias)) {
    const cats = p.categorias.slice(0, LIMITES.categorias).map((c, i) => {
      if (!c || typeof c !== 'object') return null;
      const nombre = texto(c.nombre), inscripcion = peso(c.inscripcion);
      const opciones = (Array.isArray(c.opciones) ? c.opciones : []).slice(0, LIMITES.opciones).map((o, j) => {
        const dias = Number.isInteger(o?.dias) && o.dias >= 1 && o.dias <= LIMITES.dias ? o.dias : null, mensualidad = peso(o?.mensualidad);
        return dias && mensualidad != null ? { clave: claveDe(o.clave, j, `op${i + 1}`), dias, mensualidad } : null;
      }).filter(Boolean);
      if (!nombre || inscripcion == null || !opciones.length) return null;
      return { clave: claveDe(c.clave, i, 'cat'), nombre, edades: texto(c.edades) || '', inscripcion, opciones };
    }).filter(Boolean);
    if (cats.length) t.categorias = cats;
  }
  if (p.paquetes && typeof p.paquetes === 'object') {
    if (typeof p.paquetes.confirmado === 'boolean') t.paquetes.confirmado = p.paquetes.confirmado;
    if (Array.isArray(p.paquetes.lista)) {
      const claves = new Set(t.categorias.map(c => c.clave));
      t.paquetes.lista = p.paquetes.lista.slice(0, LIMITES.paquetes).map((x, i) => {
        const nombre = texto(x?.nombre), mensualidad = peso(x?.mensualidad);
        const cantidades = {};
        for (const [k, n] of Object.entries(x?.cantidades || {})) if (claves.has(k) && Number.isInteger(n) && n > 0 && n <= 5) cantidades[k] = n;
        return nombre && mensualidad != null && Object.keys(cantidades).length ? { clave: claveDe(x.clave, i, 'paq'), nombre, cantidades, mensualidad } : null;
      }).filter(Boolean);
    }
  }
  if (typeof p.incluyeInscripcion === 'string' && p.incluyeInscripcion.trim()) t.incluyeInscripcion = p.incluyeInscripcion.trim().slice(0, 120);
  return t;
}

/* El formulario de Club › Costos públicos → lo que se guarda, o el primer
   error en palabras. `f` = { categorias:[{clave?, nombre, edades, inscripcion,
   opciones:[{dias, mensualidad}]}], paquetes:{confirmado, lista:[{nombre,
   cantidades:{<índice de categoría>: n}, mensualidad}]}, incluye }, con los
   números como los escribe la persona (texto). */
export function preciosDelFormulario(f) {
  const ent = v => { const s = String(v ?? '').trim(); if (s === '') return null; const n = Number(s); return Number.isInteger(n) ? n : NaN; };
  const cats = f.categorias || [];
  if (!cats.length) return { error: 'Agrega al menos una categoría.' };
  if (cats.length > LIMITES.categorias) return { error: `Hasta ${LIMITES.categorias} categorías.` };
  const slug = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'cat';
  const usadas = new Set();
  const categorias = [];
  for (const [i, c] of cats.entries()) {
    const nombre = String(c.nombre || '').trim(), quien = nombre || `la categoría ${i + 1}`;
    if (!nombre) return { error: `Ponle nombre a la categoría ${i + 1}.` };
    const ins = ent(c.inscripcion);
    if (ins == null || Number.isNaN(ins) || ins < 0 || ins > LIMITES.peso) return { error: `La inscripción de ${quien} va en pesos enteros.` };
    const ops = (c.opciones || []).filter(o => String(o.dias ?? '').trim() !== '' || String(o.mensualidad ?? '').trim() !== '');
    if (!ops.length) return { error: `${quien} necesita al menos una opción (días y precio).` };
    if (ops.length > LIMITES.opciones) return { error: `Hasta ${LIMITES.opciones} opciones por categoría.` };
    let clave = c.clave && /^[a-z0-9-]{1,40}$/.test(c.clave) ? c.clave : slug(nombre);
    while (usadas.has(clave)) clave += '-2';
    usadas.add(clave);
    const opciones = [];
    for (const o of ops) {
      const dias = ent(o.dias), m = ent(o.mensualidad);
      if (!(dias >= 1 && dias <= LIMITES.dias)) return { error: `En ${quien}, los días por semana van de 1 a ${LIMITES.dias}.` };
      if (m == null || Number.isNaN(m) || m < 0 || m > LIMITES.peso) return { error: `En ${quien}, la mensualidad va en pesos enteros.` };
      if (opciones.some(x => x.dias === dias)) return { error: `En ${quien} hay dos opciones de ${dias} ${dias === 1 ? 'día' : 'días'}.` };
      opciones.push({ clave: `${clave}-${dias}`, dias, mensualidad: m });
    }
    categorias.push({ clave, nombre: nombre.slice(0, LIMITES.texto), edades: String(c.edades || '').trim().slice(0, LIMITES.texto), inscripcion: ins, opciones });
  }
  const lista = [];
  for (const [i, x] of (f.paquetes?.lista || []).entries()) {
    const nombre = String(x.nombre || '').trim(), m = ent(x.mensualidad);
    const vacio = !nombre && m == null && !Object.values(x.cantidades || {}).some(v => String(v ?? '').trim());
    if (vacio) continue;
    if (!nombre) return { error: `Ponle nombre al paquete ${i + 1}.` };
    if (m == null || Number.isNaN(m) || m < 0 || m > LIMITES.peso) return { error: `La mensualidad del paquete ${nombre} va en pesos enteros.` };
    const cantidades = {};
    for (const [k, v] of Object.entries(x.cantidades || {})) {
      const n = ent(v);
      if (n == null || n === 0) continue;
      if (Number.isNaN(n) || n < 0 || n > 5) return { error: `En el paquete ${nombre}, cada categoría lleva de 0 a 5 alumnos.` };
      const cat = categorias[Number(k)];
      if (cat) cantidades[cat.clave] = n;
    }
    if (!Object.keys(cantidades).length) return { error: `Dile al paquete ${nombre} cuántos alumnos de cada categoría lleva.` };
    lista.push({ clave: `paq-${lista.length + 1}`, nombre: nombre.slice(0, LIMITES.texto), cantidades, mensualidad: m });
  }
  if (lista.length > LIMITES.paquetes) return { error: `Hasta ${LIMITES.paquetes} paquetes.` };
  return { precios: { categorias, paquetes: { confirmado: !!f.paquetes?.confirmado, lista }, incluyeInscripcion: String(f.incluye || '').trim() } };
}
