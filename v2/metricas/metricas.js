/* Métricas de marketing: las cuentas, sin red ni pantalla (02/11/2026, h58).
 *
 * Presidencia: "la quiero con métricas y todo... que la veas y puedas tomar
 * decisiones". Aquí se convierten las filas diarias de v2_bi_serie en lo que
 * la pantalla muestra: totales del periodo, comparación con el periodo
 * anterior (sólo si hay datos completos para comparar), seguidores como el
 * último valor, el embudo del club y las recomendaciones.
 *
 * Reglas de honestidad:
 *   - Sin datos no hay número: se dice "Sin medir" o "No disponible", nunca 0.
 *   - Sólo se compara contra el periodo anterior si tiene datos en al menos
 *     el 80% de sus días; si no, no hay flecha.
 *   - Las recomendaciones salen de reglas fijas y dicen de dónde salen.
 * Se prueba en node: scripts/qa-metricas.mjs.
 */

export const PERIODOS = Object.freeze([{ k: 7, t: '7 días' }, { k: 28, t: '28 días' }, { k: 90, t: '90 días' }]);
export const NEGOCIOS = Object.freeze([{ k: 'club', t: 'Club' }, { k: 'tcp', t: 'TCP' }]);

const DIA = 864e5;
const iso = d => d.toISOString().slice(0, 10);
const masDias = (s, n) => iso(new Date(Date.parse(`${s}T12:00:00Z`) + n * DIA));

/* El periodo termina ayer (hoy aún no está completo en las APIs). */
export function rango(dias, hoyIso) {
  const hasta = masDias(hoyIso, -1), desde = masDias(hasta, -(dias - 1));
  const antesHasta = masDias(desde, -1), antesDesde = masDias(antesHasta, -(dias - 1));
  return { dias, hoy: hoyIso, desde, hasta, antesDesde, antesHasta };
}
export function hoyMexico(ahora = Date.now()) { return iso(new Date(ahora - 6 * 3600e3)); }

const enRango = (d, a, b) => d >= a && d <= b;
const de = (filas, fuente, negocio, metrica) => filas.filter(f => f.fuente === fuente && f.negocio === negocio && f.metrica === metrica);

/* Suma de un periodo y cuántos días tienen dato. */
export function suma(filas, fuente, negocio, metrica, desde, hasta) {
  const xs = de(filas, fuente, negocio, metrica).filter(f => enRango(f.dia, desde, hasta));
  return { valor: xs.length ? xs.reduce((n, f) => n + Number(f.valor || 0), 0) : null, dias: new Set(xs.map(f => f.dia)).size };
}
/* El último valor hasta una fecha (seguidores). */
export function ultimo(filas, fuente, negocio, metrica, hasta) {
  const xs = de(filas, fuente, negocio, metrica).filter(f => f.dia <= hasta).sort((a, b) => a.dia < b.dia ? -1 : 1);
  return xs.length ? { valor: Number(xs.at(-1).valor), dia: xs.at(-1).dia } : null;
}
/* Serie diaria del periodo: null donde no hay dato (no es cero). */
export function serie(filas, fuente, negocio, metrica, desde, hasta) {
  const m = new Map(de(filas, fuente, negocio, metrica).map(f => [f.dia, Number(f.valor || 0)]));
  const out = []; for (let d = desde; d <= hasta; d = masDias(d, 1)) out.push({ dia: d, valor: m.has(d) ? m.get(d) : null });
  return out;
}
/* Cambio contra el periodo anterior; null si no hay con qué comparar. */
export function cambio(actual, anterior, diasAnterior, diasPeriodo) {
  if (actual == null || anterior == null || !(anterior > 0)) return null;
  if (diasAnterior != null && diasPeriodo && diasAnterior < Math.ceil(diasPeriodo * 0.8)) return null;
  return Math.round(((actual - anterior) / anterior) * 1000) / 10;
}

const KPIS = [
  { k: 'seguidores_ig', t: 'Seguidores en Instagram', fuente: 'instagram', metrica: 'seguidores', tipo: 'ultimo', grupo: 'redes' },
  { k: 'alcance_ig', t: 'Alcance en Instagram', ayuda: 'Cuentas que vieron algo tuyo', fuente: 'instagram', metrica: 'alcance', tipo: 'suma', grupo: 'redes' },
  { k: 'nuevos_ig', t: 'Seguidores nuevos en Instagram', fuente: 'instagram', metrica: 'nuevos_seguidores', tipo: 'suma', grupo: 'redes' },
  { k: 'seguidores_fb', t: 'Seguidores en Facebook', fuente: 'facebook', metrica: 'seguidores', tipo: 'ultimo', grupo: 'redes' },
  { k: 'vistas_fb', t: 'Visualizaciones en Facebook', ayuda: 'Veces que se vio tu contenido', fuente: 'facebook', metrica: 'visualizaciones', tipo: 'suma', grupo: 'redes' },
  { k: 'interacciones_fb', t: 'Interacciones en Facebook', ayuda: 'Reacciones, comentarios y compartidos', fuente: 'facebook', metrica: 'interacciones', tipo: 'suma', grupo: 'redes' },
  { k: 'clics_google', t: 'Clics desde Google', fuente: 'search_console', metrica: 'clics', tipo: 'suma', grupo: 'google' },
  { k: 'impresiones_google', t: 'Veces que saliste en Google', fuente: 'search_console', metrica: 'impresiones', tipo: 'suma', grupo: 'google' },
  { k: 'visitas_web', t: 'Visitas a tus sitios', ayuda: 'Sitio web y tienda en línea (sólo quien acepta cookies)', fuente: 'ga4', metrica: 'sesiones', tipo: 'suma', grupo: 'web' },
  { k: 'whatsapp_web', t: 'Clics a WhatsApp en el sitio', fuente: 'ga4', metrica: 'clics_whatsapp', tipo: 'suma', grupo: 'web' },
  { k: 'gasto_ads', t: 'Gasto en anuncios de Meta', fuente: 'meta_ads', metrica: 'gasto', tipo: 'suma', grupo: 'ads', dinero: true },
  { k: 'leads_ads', t: 'Prospectos por anuncios', fuente: 'meta_ads', metrica: 'leads', tipo: 'suma', grupo: 'ads' }
];
export const GRUPOS = Object.freeze([
  { k: 'redes', t: 'Redes sociales', sub: 'Quién te ve y quién te sigue' },
  { k: 'google', t: 'Google', sub: 'Cuando te buscan' },
  { k: 'web', t: 'Sitio web', sub: 'Quién entra y quién escribe' },
  { k: 'ads', t: 'Anuncios', sub: 'Lo pagado en Meta' }
]);

/* El estado de cada fuente según la última sincronización. */
export function estadoFuente(datos, fuente) {
  const s = (datos.sincronizaciones || []).find(x => x.fuente === fuente);
  if (!s) return { estado: 'sin_conectar', texto: 'Sin conectar' };
  if (s.estado === 'ok') return { estado: 'ok', texto: 'Al día', cuando: s.cuando, detalle: s.detalle || null };
  return { estado: s.estado, texto: s.estado === 'bloqueada' ? 'Bloqueada' : 'Con error', cuando: s.cuando, detalle: s.detalle || null };
}
const tieneCuenta = (datos, fuente, negocio) => (datos.cuentas || []).some(c => c.fuente === fuente && (c.negocio === negocio || c.negocio === 'compartido'));

/* Los indicadores de un negocio en un periodo. */
export function indicadores(datos, negocio, r) {
  const filas = datos.filas || [];
  return KPIS.filter(x => tieneCuenta(datos, x.fuente, negocio)).map(x => {
    const fuente = estadoFuente(datos, x.fuente);
    if (x.tipo === 'ultimo') {
      const u = ultimo(filas, x.fuente, negocio, x.metrica, r.hoy), a = ultimo(filas, x.fuente, negocio, x.metrica, r.antesHasta);
      return { ...x, valor: u?.valor ?? null, dia: u?.dia ?? null, diferencia: u && a ? u.valor - a.valor : null, cambio: null, serie: [], fuenteEstado: fuente };
    }
    const s = suma(filas, x.fuente, negocio, x.metrica, r.desde, r.hasta), a = suma(filas, x.fuente, negocio, x.metrica, r.antesDesde, r.antesHasta);
    // Si la fuente está al día pero no mandó nada en el periodo, es cero real
    // sólo para anuncios (sin campañas = sin gasto); lo demás queda sin medir.
    const valor = s.valor ?? (fuente.estado === 'ok' && x.grupo === 'ads' ? 0 : null);
    return { ...x, valor, diasConDato: s.dias, anterior: a.valor, cambio: cambio(valor, a.valor, a.dias, r.dias),
      serie: serie(filas, x.fuente, negocio, x.metrica, r.desde, r.hasta), fuenteEstado: fuente };
  });
}

/* Posición promedio en Google: suma ponderada entre impresiones. */
export function posicionGoogle(datos, negocio, desde, hasta) {
  const p = suma(datos.filas || [], 'search_console', negocio, 'posicion_ponderada', desde, hasta).valor;
  const i = suma(datos.filas || [], 'search_console', negocio, 'impresiones', desde, hasta).valor;
  return p != null && i > 0 ? Math.round((p / i) * 10) / 10 : null;
}
/* Tasa de interacción en Facebook: interacciones entre visualizaciones. */
export function tasaFacebook(datos, negocio, desde, hasta) {
  const i = suma(datos.filas || [], 'facebook', negocio, 'interacciones', desde, hasta).valor;
  const v = suma(datos.filas || [], 'facebook', negocio, 'visualizaciones', desde, hasta).valor;
  return i != null && v > 0 ? Math.round((i / v) * 1000) / 10 : null;
}
const conteo = (lista, desde, hasta) => (lista || []).filter(x => enRango(x.dia, desde, hasta)).reduce((n, x) => n + Number(x.n || 0), 0);

/* El embudo: de quién te ve a quién se inscribe. */
export function embudo(datos, negocio, r, kpis) {
  const v = k => kpis.find(x => x.k === k)?.valor ?? null;
  const ve = [v('alcance_ig'), v('vistas_fb')].filter(x => x != null);
  const pasos = [
    { k: 'ven', t: 'Te ven en redes', valor: ve.length ? ve.reduce((a, b) => a + b, 0) : null, nota: 'Alcance de Instagram + visualizaciones de Facebook' },
    { k: 'buscan', t: 'Te encuentran en Google', valor: v('clics_google'), nota: 'Clics desde Google' },
    { k: 'entran', t: 'Entran a tus sitios', valor: v('visitas_web'), nota: 'Sitio web y tienda en línea' },
    { k: 'escriben', t: 'Te escriben', valor: v('whatsapp_web'), nota: 'Clics a WhatsApp en el sitio' }
  ];
  if (negocio === 'club') {
    pasos.push({ k: 'prospectos', t: 'Prospectos', valor: conteo(datos.prospectos, r.desde, r.hasta), nota: 'Fichajes registrados en TannerOS', real: true });
    pasos.push({ k: 'inscritos', t: 'Inscritos', valor: conteo(datos.inscripciones, r.desde, r.hasta), nota: 'Jugadores dados de alta en TannerOS', real: true });
  } else {
    pasos.push({ k: 'reservan', t: 'Quieren reservar', valor: null, nota: 'Falta conectar la base de TCP' });
  }
  return pasos;
}

const fmt = n => new Intl.NumberFormat('es-MX').format(Math.round(n));
/* Recomendaciones: reglas fijas, las más importantes primero (máximo 4). */
export function recomendaciones(datos, negocio, r, kpis) {
  const v = k => kpis.find(x => x.k === k);
  const out = [];
  const nombre = negocio === 'tcp' ? 'TCP' : 'el club';
  const tasa = tasaFacebook(datos, negocio, r.desde, r.hasta), vistas = v('vistas_fb')?.valor;
  if (tasa != null && vistas >= 100 && tasa < 1)
    out.push({ tono: 'alerta', peso: 90, titulo: `Facebook de ${nombre} casi no conversa`,
      texto: `${fmt(v('interacciones_fb').valor)} interacciones en ${fmt(vistas)} visualizaciones (${tasa}%). Prueba publicaciones con pregunta, reels de partidos o fotos de los niños con permiso.`, fuente: 'Facebook' });
  const ig = v('alcance_ig');
  if (ig?.cambio != null && ig.cambio <= -20)
    out.push({ tono: 'alerta', peso: 80, titulo: `El alcance en Instagram bajó ${Math.abs(ig.cambio)}%`, texto: `Contra los ${r.dias} días anteriores. Revisa si se publicó menos o cambió el tipo de contenido.`, fuente: 'Instagram' });
  else if (ig?.cambio != null && ig.cambio >= 20)
    out.push({ tono: 'bien', peso: 60, titulo: `El alcance en Instagram subió ${ig.cambio}%`, texto: `Contra los ${r.dias} días anteriores. Repite lo que publicaste en este periodo.`, fuente: 'Instagram' });
  const pos = posicionGoogle(datos, negocio, r.desde, r.hasta), clics = v('clics_google')?.valor;
  if (pos != null && pos <= 3 && clics > 0)
    out.push({ tono: 'bien', peso: 50, titulo: `En Google sales arriba (posición ${pos})`, texto: `${fmt(clics)} clics cuando te buscan. Cuida tu ficha de Google y pide reseñas a las familias.`, fuente: 'Search Console' });
  else if (pos != null && pos > 10)
    out.push({ tono: 'oportunidad', peso: 55, titulo: `En Google sales lejos (posición ${pos})`, texto: 'Casi nadie pasa de la primera página. Revisa títulos y textos de tu sitio.', fuente: 'Search Console' });
  if (tieneCuenta(datos, 'search_console', negocio) && estadoFuente(datos, 'search_console').estado === 'ok' && !v('impresiones_google')?.valor)
    out.push({ tono: 'oportunidad', peso: 45, titulo: `Google aún no muestra ${negocio === 'tcp' ? 'tcp.tannerycity.com' : 'tu sitio'}`, texto: 'Sin apariciones en búsquedas este periodo. Envía el sitemap en Search Console.', fuente: 'Search Console' });
  const web = v('visitas_web');
  if (web && web.valor == null)
    out.push({ tono: 'oportunidad', peso: 70, titulo: 'Tu sitio todavía no mide visitas', texto: negocio === 'tcp' ? 'tcp.tannerycity.com aún no tiene la medición publicada.' : 'www.tannerycity.com mide cuando se publique Google Tag Manager, tras el visto bueno del aviso de cookies.', fuente: 'Google Analytics' });
  const gasto = v('gasto_ads');
  if (gasto && gasto.valor === 0)
    out.push({ tono: 'info', peso: 30, titulo: 'Sin anuncios en este periodo', texto: 'Todo lo que ves aquí es orgánico. Si pautas, nombra la campaña CLUB- o TCP- para separarla.', fuente: 'Meta Ads' });
  if (negocio === 'club') {
    const p = conteo(datos.prospectos, r.desde, r.hasta), pa = conteo(datos.prospectos, r.antesDesde, r.antesHasta);
    if (p === 0) out.push({ tono: 'alerta', peso: 85, titulo: 'Ningún prospecto nuevo', texto: `En los últimos ${r.dias} días no se registró ningún fichaje. Activa la semana gratis en redes y WhatsApp.`, fuente: 'TannerOS' });
    else if (pa > 0 && p >= pa * 1.2) out.push({ tono: 'bien', peso: 65, titulo: `${p} prospectos nuevos`, texto: `Más que los ${pa} del periodo anterior. Dales seguimiento en Fichajes esta semana.`, fuente: 'TannerOS' });
    else out.push({ tono: 'info', peso: 40, titulo: `${p} ${p === 1 ? 'prospecto nuevo' : 'prospectos nuevos'}`, texto: 'Dales seguimiento en Fichajes: la semana gratis convierte cuando se agenda rápido.', fuente: 'TannerOS' });
  }
  return out.sort((a, b) => b.peso - a.peso).slice(0, 4);
}
