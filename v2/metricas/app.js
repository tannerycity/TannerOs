/* MÉTRICAS: TODO EN UNA HOJA (26/11/2026).
 * Presidencia: "tenemos contabilidad, otra que se llama finanzas... siento que
 * está muy dispersa toda la información... vamos a concentrar todo en una
 * hoja". Métricas es para VER; Contabilidad y Taquilla para HACER.
 *   - Dinero (antes Gráficas del dinero): entró, salió, quedó, a quién se le
 *     paga, nómina semana por semana, proveedores y uniformes.
 *   - Cobranza: cómo va el mes, lo que urge y quién debe por categoría.
 *   - Crecimiento (la Métricas de marketing de antes): embudo y fuentes.
 * Cada quien ve sólo lo suyo, con los permisos que ya existen: Presidencia
 * todo, Contabilidad dinero y cobranza, Marketing sólo crecimiento. La base
 * vuelve a revisar cada número (si dice Not authorized, la sección se va).
 * Arriba, un selector deslizante para ver todo o una sola sección. */
import { bootstrapProtectedShell, moduleAccess, $ } from '/v2/shell.js';
import { segmentos } from '/v2/segmento.js';

const boot = await bootstrapProtectedShell({ active: 'metricas', title: 'Métricas' });
if (!boot) throw new Error('No access');
const { ctx, navigation } = boot;
const org = ctx.organization_id;

export const SECCIONES = Object.freeze([
  { k: 'dinero', t: 'Dinero', el: 'secDinero' },
  { k: 'cobranza', t: 'Cobranza', el: 'secCobranza' },
  { k: 'crecimiento', t: 'Crecimiento', el: 'secCrecimiento' },
]);
const leer = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

const veDinero = moduleAccess(navigation, 'contabilidad') || moduleAccess(navigation, 'finanzas');
const veCrecimiento = moduleAccess(navigation, 'metricas');
const montar = [];
const recargas = [];
if (veDinero) {
  montar.push(import('/v2/metricas/dinero.js').then(async (m) => ({ k: 'dinero', ok: await m.montaDinero({ ctx, canWrite: moduleAccess(navigation, 'contabilidad', true) }), recarga: m.recargaDinero })));
  // Para cobrar (lo que era Finanzas) también hace que Cobranza salga.
  montar.push(import('/v2/metricas/cobrar.js').then(async (m) => ({ k: 'cobranza', ok: await m.montaCobrar({ ctx, navigation }), recarga: () => {} })));
  montar.push(import('/v2/metricas/cobranza.js').then(async (m) => ({ k: 'cobranza', ok: await m.montaCobranza({ org }), recarga: m.recargaCobranza })));
}
if (veCrecimiento) montar.push(import('/v2/metricas/crecimiento.js').then(async (m) => ({ k: 'crecimiento', ok: await m.montaCrecimiento({ org, nombre: ctx.organization_name }), recarga: m.recargaCrecimiento })));

const resultados = (await Promise.allSettled(montar)).map((r) => r.status === 'fulfilled' ? r.value : null).filter(Boolean);
const disponibles = SECCIONES.filter((s) => resultados.some((r) => r.k === s.k && r.ok));
resultados.filter((r) => r.ok).forEach((r) => recargas.push(r.recarga));
$('metCargando')?.remove();

if (!disponibles.length) {
  $('metDenied').classList.remove('hidden');
} else {
  const hayCobranza = disponibles.some((s) => s.k === 'cobranza');
  const desdeLiga = location.hash.replace('#', '');
  let vista = ['todo', ...disponibles.map((s) => s.k)].includes(desdeLiga) ? desdeLiga : leer('tos-metricas-vista', 'todo');
  if (vista !== 'todo' && !disponibles.some((s) => s.k === vista)) vista = 'todo';
  const tabs = $('metSecciones');
  const pinta = () => {
    for (const s of SECCIONES) $(s.el).hidden = !disponibles.some((d) => d.k === s.k) || (vista !== 'todo' && vista !== s.k);
    $('metDecidir').hidden = !hayCobranza || !$('metDecidirLista').children.length || !(vista === 'todo' || vista === 'cobranza');
    tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.vista === vista)));
  };
  // Con una sola sección (Marketing) no hace falta el selector.
  if (disponibles.length > 1) {
    tabs.innerHTML = [{ k: 'todo', t: 'Todo' }, ...disponibles].map((s) => '<button type="button" data-vista="' + s.k + '">' + s.t + '</button>').join('');
    tabs.hidden = false;
    tabs.addEventListener('click', (e) => {
      const b = e.target.closest('[data-vista]'); if (!b || b.dataset.vista === vista) return;
      vista = b.dataset.vista; guardar('tos-metricas-vista', vista);
      history.replaceState(null, '', vista === 'todo' ? location.pathname : '#' + vista);
      pinta(); window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
  // Ligas dentro de la hoja (#cobrar desde Para decidir): enseñan su sección y bajan suave.
  const irA = (id) => {
    const el = document.getElementById(id); if (!el) return false;
    if (el.closest('[hidden]') && hayCobranza) { vista = 'todo'; pinta(); }
    el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    return true;
  };
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]'); if (!a) return;
    const id = a.getAttribute('href').slice(1);
    if (['todo', 'dinero', 'cobranza', 'crecimiento'].includes(id) || !document.getElementById(id)) return;
    e.preventDefault(); irA(id);
  });
  if (desdeLiga === 'cobrar') setTimeout(() => irA('cobrar'), 600);
  // Una cifra de Dinero que lleva a una gráfica de Cobranza (o al revés).
  window.tosMetricasMuestra = () => { vista = 'todo'; pinta(); };
  pinta();
  segmentos();
}
window.tosAlActualizar = () => Promise.all(recargas.map((f) => f()));
