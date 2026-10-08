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
    p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.error(`[consola ${m.type()}] ${m.text()}`); });
    p.on('pageerror', e => console.error(`[pageerror] ${e.message}`));
    p.on('requestfailed', r => { if (/127\.0\.0\.1|localhost/.test(r.url())) console.error(`[falló] ${r.url()} · ${r.failure()?.errorText}`); });
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
