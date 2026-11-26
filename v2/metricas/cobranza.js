/* MÉTRICAS · COBRANZA (26/11/2026).
 * Presidencia: "toda la información la podemos meter en una sola pantalla".
 * Lo que antes sólo salía arriba de Finanzas: cómo va la cobranza del mes y
 * lo que urge (lo de meses anteriores primero). Los números salen tal cual
 * de v2_collection_snapshot, el mismo que usa Finanzas: nada se recalcula
 * aquí. Para cobrar, el botón lleva a la lista de quién debe (Finanzas),
 * donde están Cobrar y WhatsApp.
 * avisosDeCobranza() no toca la pantalla: se prueba con node. */
import { rpc, $ } from '/v2/shell.js';

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n = (v) => Number(v || 0);
const tanners = (k) => k + (k === 1 ? ' Tanner' : ' Tanners');
export const OBJETIVO = 85; // el mismo objetivo que ya usa Finanzas

// Lo que urge, en orden: lo más viejo primero.
export function avisosDeCobranza(c) {
  if (!c) return [];
  const a = [];
  if (n(c.residual_receivable) > 0) a.push({ tono: 'alerta', titulo: tanners(n(c.residual_players)) + ' deben meses anteriores', detalle: money.format(n(c.residual_receivable)) + ' · es lo más viejo, cóbralo primero', ir: '/finanzas/#cobranza', accion: 'Cobrar' });
  if (n(c.total_receivable) > 0) a.push({ tono: 'alerta', titulo: money.format(n(c.total_receivable)) + ' por cobrar', detalle: tanners(n(c.pending_players)) + ' activos con saldo', ir: '/finanzas/#cobranza', accion: 'Ver quién' });
  const tasa = n(c.collection_rate);
  if (tasa > 0 && tasa < OBJETIVO) a.push({ tono: 'aviso', titulo: 'Cobranza del mes en ' + tasa + '%', detalle: 'Abajo del objetivo (' + OBJETIVO + '%)' });
  if (n(c.needs_configuration) > 0) a.push({ tono: 'aviso', titulo: n(c.needs_configuration) + (n(c.needs_configuration) === 1 ? ' cuota por configurar' : ' cuotas por configurar'), detalle: 'Hay que definirlas antes de poder cobrar', ir: '/finanzas/', accion: 'Revisar' });
  if (!a.length) a.push({ tono: 'bien', titulo: 'Cobranza al corriente', detalle: 'No hay nada vencido en este momento.' });
  return a;
}

function pinta(c) {
  const tasa = Math.max(0, Math.min(100, n(c.collection_rate)));
  $('cobKpis').innerHTML =
    '<article class="cob-kpi cob-anillo-kpi"><div class="gr-anillo cob-anillo" style="--p:' + tasa + '"><span><b>' + tasa + '%</b><small>al corriente</small></span></div>' +
      '<div><span>Cobranza del mes</span><small>' + n(c.covered) + ' de ' + n(c.collection_population) + ' Tanners al corriente · objetivo ' + OBJETIVO + '%</small></div></article>' +
    '<article class="cob-kpi"><span>Pendiente del mes</span><strong>' + money.format(n(c.current_period_receivable)) + '</strong><small>De este mes</small></article>' +
    '<article class="cob-kpi"><span>Por cobrar</span><strong>' + money.format(n(c.total_receivable)) + '</strong><small>' + tanners(n(c.pending_players)) + ' activos</small></article>' +
    '<article class="cob-kpi"><span>Meses anteriores</span><strong>' + money.format(n(c.residual_receivable)) + '</strong><small>' + tanners(n(c.residual_players)) + '</small></article>';
  $('metDecidirLista').innerHTML = avisosDeCobranza(c).map((x) =>
    '<li class="met-decide" data-tono="' + x.tono + '"><div><b>' + esc(x.titulo) + '</b><small>' + esc(x.detalle) + '</small></div>' +
    (x.ir ? '<a class="met-decide-ir" href="' + esc(x.ir) + '">' + esc(x.accion) + '</a>' : '') + '</li>').join('');
}

let org = null;
async function carga() {
  const periodo = new Date().toISOString().slice(0, 7) + '-01';
  const c = await rpc('v2_collection_snapshot', { organization_id: org, billing_period: periodo });
  if (!c) return false;
  pinta(c);
  return true;
}
/* Lo monta Métricas. false si la cuenta no ve la cobranza. */
export async function montaCobranza({ org: o }) {
  org = o;
  try { return await carga(); } catch { return false; }
}
export const recargaCobranza = () => carga().catch(() => false);
