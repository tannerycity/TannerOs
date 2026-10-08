// Diagnóstico para las suites de navegador en CI (no es una suite).
//
// Se precarga con NODE_OPTIONS="--import ./scripts/diagnostico-navegador.mjs"
// sólo cuando una suite falla en el job navegador-qa: la repite imprimiendo lo
// que pasó dentro de Chromium (errores de consola, excepciones de la página y
// peticiones que fallaron). Sin esto, una pantalla que no arranca en CI sólo
// dice "Timeout esperando el botón", que no explica nada.
import { chromium } from 'playwright-core';

const lanzar = chromium.launch.bind(chromium);
chromium.launch = async (...args) => {
  const navegador = await lanzar(...args);
  const vigila = p => {
    if (p.__vigilada) return p; p.__vigilada = true;
    p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.error(`[consola ${m.type()}] ${m.text()}`); });
    p.on('pageerror', e => console.error(`[pageerror] ${e.message}`));
    p.on('requestfailed', r => { if (/127\.0\.0\.1|localhost/.test(r.url())) console.error(`[falló] ${r.url()} · ${r.failure()?.errorText}`); });
    // Cuando una espera se vence, retrato de la pantalla antes de tronar:
    // URL, vistas ocultas/visibles, el objetivo y el texto que sí se ve.
    for (const metodo of ['waitForSelector', 'click', 'fill']) {
      const orig = p[metodo].bind(p);
      p[metodo] = async (sel, ...resto) => {
        try { return await orig(sel, ...resto); }
        catch (e) {
          const foto = await p.evaluate(s => {
            const vis = el => !!el && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) && getComputedStyle(el).visibility !== 'hidden';
            const obj = document.querySelector(s);
            const cadena = []; for (let el = obj; el && el !== document.documentElement; el = el.parentElement) {
              const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || el.hidden || el.classList.contains('hidden')) cadena.push(`${el.tagName.toLowerCase()}#${el.id}.${[...el.classList].join('.')} display=${cs.display}`);
            }
            return { url: location.href, listo: document.readyState, objetivo: obj ? (vis(obj) ? 'visible' : 'existe pero oculto') : 'NO existe',
              ocultoPor: cadena.slice(0, 4), vistas: [...document.querySelectorAll('main [id$="View"], [id$="View"]')].map(v => `${v.id}:${vis(v) ? 'visible' : 'oculta'}`).slice(0, 8),
              texto: document.body.innerText.replace(/\s+/g, ' ').slice(0, 300) };
          }, String(sel)).catch(x => ({ fallo: String(x) }));
          console.error(`[retrato] ${metodo}(${sel}) · ${JSON.stringify(foto)}`);
          throw e;
        }
      };
    }
    return p;
  };
  const nuevaPagina = navegador.newPage.bind(navegador);
  navegador.newPage = async (...a) => vigila(await nuevaPagina(...a));
  const nuevoContexto = navegador.newContext.bind(navegador);
  navegador.newContext = async (...a) => {
    const ctx = await nuevoContexto(...a);
    const np = ctx.newPage.bind(ctx);
    ctx.newPage = async (...b) => vigila(await np(...b));
    return ctx;
  };
  return navegador;
};
