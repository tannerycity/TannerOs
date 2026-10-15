/* Encuestas: lo que comparten la página pública (/encuesta/) y la pantalla de
 * resultados (/encuestas/). Sin DOM, para probarlo en Node (qa-encuestas). */

// Lo que se califica (1 a 5). "opcional": se puede marcar "No lo usé".
export const TEMAS = [
  { k: 'ambiente', t: 'Ambiente general' },
  { k: 'instalaciones', t: 'Instalaciones y cancha' },
  { k: 'estacionamiento', t: 'Estacionamiento', opcional: true },
  { k: 'banos', t: 'Baños', opcional: true },
  { k: 'tienda', t: 'Tienda Tanner', opcional: true },
  { k: 'partido', t: 'Organización del partido' },
  { k: 'papas', t: 'Actitud de los papás en la tribuna' },
  { k: 'staff', t: 'Atención del staff' },
  { k: 'seguridad', t: 'Seguridad para los niños' }
];
export const ESCALA = ['Muy mal', 'Mal', 'Regular', 'Bien', 'Excelente'];
export const TIPOS = [
  { k: 'tanner', t: 'Tanner' },
  { k: 'visitante', t: 'Visitantes' },
  { k: 'otro', t: 'Otros' }
];
export const etiquetaTema = k => TEMAS.find(x => x.k === k)?.t || k;

// NPS = % promotores (9-10) − % detractores (0-6). null si nadie lo contestó.
export function nps(x) {
  const n = Number(x?.n) || 0;
  if (!n) return null;
  return Math.round(100 * ((Number(x.promotores) || 0) - (Number(x.detractores) || 0)) / n);
}

// Semáforo de un promedio 1-5. Siempre con palabra, nunca sólo color.
export function semaforo(p) {
  if (p == null) return null;
  if (p >= 4.3) return { k: 'bien', t: 'Fuerte' };
  if (p >= 3.5) return { k: 'regular', t: 'Bien' };
  return { k: 'mal', t: 'Atender' };
}

// Lo que pinta la pantalla: un renglón por tema (promedio general y por tipo),
// el NPS, y las conclusiones (lo más fuerte, lo que hay que atender, y dónde
// Tanner y visitantes opinan distinto: 1 punto o más de diferencia).
export function resumen(res) {
  const temas = TEMAS.map(({ k, t }) => {
    const filas = (res?.temas || []).filter(x => x.tema === k);
    const n = filas.reduce((s, x) => s + (Number(x.n) || 0), 0);
    const suma = filas.reduce((s, x) => s + (Number(x.promedio) || 0) * (Number(x.n) || 0), 0);
    const porTipo = Object.fromEntries(filas.map(x => [x.tipo, { promedio: Number(x.promedio), n: Number(x.n) }]));
    return { k, t, n, promedio: n ? Math.round(100 * suma / n) / 100 : null, porTipo };
  });
  const conDatos = temas.filter(x => x.n > 0);
  const orden = [...conDatos].sort((a, b) => b.promedio - a.promedio || b.n - a.n);
  const fuertes = orden.filter(x => x.promedio >= 4).slice(0, 3);
  const atender = [...orden].reverse().filter(x => !fuertes.includes(x) && x.promedio < 4.3).slice(0, 3);
  const brechas = conDatos
    .filter(x => x.porTipo.tanner && x.porTipo.visitante)
    .map(x => ({ ...x, brecha: Math.round(100 * (x.porTipo.tanner.promedio - x.porTipo.visitante.promedio)) / 100 }))
    .filter(x => Math.abs(x.brecha) >= 1)
    .sort((a, b) => Math.abs(b.brecha) - Math.abs(a.brecha));
  const general = conDatos.length ? Math.round(100 * conDatos.reduce((s, x) => s + x.promedio * x.n, 0) / conDatos.reduce((s, x) => s + x.n, 0)) / 100 : null;
  const tipos = TIPOS.filter(({ k }) => (res?.porTipo || {})[k] > 0).map(x => x.k);
  const npsPorTipo = Object.fromEntries(Object.entries(res?.npsPorTipo || {}).map(([k, v]) => [k, { ...v, score: nps(v) }]));
  return { total: Number(res?.total) || 0, temas, tipos, general, fuertes, atender, brechas,
    nps: { ...(res?.nps || { n: 0, promotores: 0, detractores: 0 }), score: nps(res?.nps) }, npsPorTipo };
}

// "Partido vs Club León" ya tiene su liga; esto sólo arma el texto del WhatsApp.
export const mensajeDeEncuesta = (club, titulo, liga) =>
  `Gracias por acompañarnos${titulo ? ` (${titulo})` : ''}. ¿Nos ayudas con 1 minuto? Cuéntanos cómo te la pasaste en ${club}: ${liga}`;

// Comentarios para el CSV: una fila por respuesta con texto.
export function csvDeComentarios(lista) {
  const c = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const filas = (lista || []).map(x => [x.fecha, x.tipo, x.club, x.nps, x.gusto, x.mejorar, x.contacto, x.telefono].map(c).join(','));
  return ['fecha,tipo,club,nps,lo_que_gusto,que_mejorar,contacto,telefono', ...filas].join('\n');
}
