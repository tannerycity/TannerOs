/* Lo que el recolector guarda: de cada API oficial, sólo números agregados por
 * día, con el negocio al que pertenecen (30/10/2026, h56).
 *
 * Aquí no hay red ni llaves: se transforma la respuesta de la API en filas
 * {fuente, cuenta, negocio, metrica, dia, valor} del catálogo cerrado de h56.
 * Nada de URLs completas, textos de búsqueda, nombres ni ids de personas. Se
 * prueba en node con respuestas de ejemplo (scripts/qa-bi-recolector.mjs).
 */

export const CATALOGO = Object.freeze({
  ga4: ['sesiones', 'usuarios', 'leads_web', 'clics_whatsapp', 'interes_reserva', 'vista_registro'],
  search_console: ['clics', 'impresiones', 'posicion_ponderada'],
  meta_ads: ['gasto', 'impresiones', 'alcance', 'clics', 'leads', 'conversaciones'],
  facebook: ['seguidores', 'impresiones', 'interacciones'],
  instagram: ['seguidores', 'alcance', 'nuevos_seguidores'],
  gbp: ['llamadas', 'clics_web', 'indicaciones']
});

/* El negocio por dominio. Lo que no es nuestro no se guarda. */
export function negocioDeHost(host) {
  const h = String(host || '').toLowerCase().replace(/^www\./, '');
  if (h === 'tcp.tannerycity.com') return 'tcp';
  if (h === 'tannerycity.com' || h === 'app.tannerycity.com') return 'club';
  return null;
}
/* Campañas de Meta: el prefijo dice el negocio; sin prefijo, compartido. */
export function negocioDeCampana(nombre) {
  const n = String(nombre || '').trim().toUpperCase();
  if (n.startsWith('CLUB-') || n.startsWith('CLUB ')) return 'club';
  if (n.startsWith('TCP-') || n.startsWith('TCP ')) return 'tcp';
  return 'compartido';
}

const fechaGA = d => /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : null;
const num = v => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : null; };
/* Meta marca el valor diario con end_time = fin del día; el día es el anterior. */
export function diaDeMeta(endTime) {
  const t = Date.parse(endTime); if (!Number.isFinite(t)) return null;
  return new Date(t - 12 * 3600 * 1000).toISOString().slice(0, 10);
}

/* Suma filas con la misma llave (varias cuentas/hosts/campañas de un negocio). */
function junta(filas) {
  const m = new Map();
  for (const f of filas) {
    if (!f || f.valor === null || !f.dia || !CATALOGO[f.fuente]?.includes(f.metrica)) continue;
    const k = [f.fuente, f.cuenta, f.negocio, f.metrica, f.dia].join('|');
    const prev = m.get(k);
    m.set(k, prev ? { ...prev, valor: Math.round((prev.valor + f.valor) * 100) / 100 } : { ...f, valor: Math.round(f.valor * 100) / 100 });
  }
  return [...m.values()];
}

const EVENTOS_GA4 = { generate_lead: 'leads_web', click_whatsapp: 'clics_whatsapp', reservation_interest: 'interes_reserva', view_registration: 'vista_registro' };
export const EVENTOS_GA4_PEDIDOS = Object.keys(EVENTOS_GA4);

/* GA4 Data API runReport, dimensiones [date, hostName], métricas [sessions, activeUsers].
 * Usuarios: se guarda la cifra diaria; no se suman días para "usuarios del periodo". */
export function ga4Trafico(reporte, cuenta) {
  return junta((reporte?.rows || []).flatMap(r => {
    const dia = fechaGA(r.dimensionValues?.[0]?.value), negocio = negocioDeHost(r.dimensionValues?.[1]?.value);
    if (!dia || !negocio) return [];
    return [
      { fuente: 'ga4', cuenta, negocio, metrica: 'sesiones', dia, valor: num(r.metricValues?.[0]?.value) },
      { fuente: 'ga4', cuenta, negocio, metrica: 'usuarios', dia, valor: num(r.metricValues?.[1]?.value) }
    ];
  }));
}
/* GA4 runReport, dimensiones [date, hostName, eventName], métrica [eventCount]. */
export function ga4Eventos(reporte, cuenta) {
  return junta((reporte?.rows || []).map(r => {
    const dia = fechaGA(r.dimensionValues?.[0]?.value), negocio = negocioDeHost(r.dimensionValues?.[1]?.value);
    const metrica = EVENTOS_GA4[r.dimensionValues?.[2]?.value];
    return dia && negocio && metrica ? { fuente: 'ga4', cuenta, negocio, metrica, dia, valor: num(r.metricValues?.[0]?.value) } : null;
  }));
}

/* Search Console searchAnalytics.query, dimensiones [date, page]. Del page sólo
 * se usa el dominio; la posición se guarda ponderada por impresiones. */
export function searchConsole(resp, cuenta) {
  return junta((resp?.rows || []).flatMap(r => {
    const [dia, pagina] = r.keys || [];
    let host = null; try { host = new URL(pagina).hostname; } catch { return []; }
    const negocio = negocioDeHost(host); if (!negocio || !/^\d{4}-\d{2}-\d{2}$/.test(dia || '')) return [];
    const imp = num(r.impressions);
    return [
      { fuente: 'search_console', cuenta, negocio, metrica: 'clics', dia, valor: num(r.clicks) },
      { fuente: 'search_console', cuenta, negocio, metrica: 'impresiones', dia, valor: imp },
      { fuente: 'search_console', cuenta, negocio, metrica: 'posicion_ponderada', dia, valor: imp === null || num(r.position) === null ? null : r.position * imp }
    ];
  }));
}

const ACCION = (acciones, tipo) => num((acciones || []).find(a => a.action_type === tipo)?.value) ?? 0;
/* Marketing API /act_<id>/insights level=campaign, time_increment=1. */
export function metaAds(resp, cuenta) {
  return junta((resp?.data || []).flatMap(r => {
    const dia = /^\d{4}-\d{2}-\d{2}$/.test(r.date_start || '') ? r.date_start : null;
    const negocio = negocioDeCampana(r.campaign_name);
    if (!dia) return [];
    const base = { fuente: 'meta_ads', cuenta, negocio, dia };
    return [
      { ...base, metrica: 'gasto', valor: num(r.spend) },
      { ...base, metrica: 'impresiones', valor: num(r.impressions) },
      { ...base, metrica: 'alcance', valor: num(r.reach) },
      { ...base, metrica: 'clics', valor: num(r.clicks) },
      { ...base, metrica: 'leads', valor: ACCION(r.actions, 'lead') },
      { ...base, metrica: 'conversaciones', valor: ACCION(r.actions, 'onsite_conversion.messaging_conversation_started_7d') }
    ];
  }));
}

/* Insights de página o de Instagram: {data:[{name, values:[{value, end_time}]}]}.
 * mapa: nombre de la API -> métrica del catálogo. Los nombres cambian entre
 * versiones de la Graph API: viven en la configuración, no en el código. */
export function metaInsights(resp, fuente, cuenta, negocio, mapa) {
  return junta((resp?.data || []).flatMap(serie => {
    const metrica = mapa[serie.name]; if (!metrica) return [];
    return (serie.values || []).map(v => ({ fuente, cuenta, negocio, metrica, dia: diaDeMeta(v.end_time), valor: num(v.value) }));
  }));
}
/* Seguidores: la API sólo da el total de hoy; se guarda como foto del día. */
export function fotoSeguidores(total, fuente, cuenta, negocio, hoy) {
  return junta([{ fuente, cuenta, negocio, metrica: 'seguidores', dia: hoy, valor: num(total) }]);
}

/* Lo que nunca se manda a la base ni a los registros. */
export function sinSecretos(texto) {
  return String(texto || '')
    .replace(/(access_token|token|key|secret|authorization)=?["':\s]*[A-Za-z0-9._\-]{12,}/gi, '$1=[oculto]')
    .replace(/-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/g, '[llave oculta]')
    .slice(0, 300);
}
