/* =============================================================================
   TannerOS — Service Worker (v1)
   -----------------------------------------------------------------------------
   ESTRATEGIA: network-first para el documento (la app HTML).
   Prioridad #1 de Michel: NADIE se queda con versión vieja.
     · Al abrir, SIEMPRE intenta bajar lo más nuevo de GitHub Pages.
     · Si hay internet -> obtiene la última versión y guarda una copia.
     · Si NO hay internet -> usa la copia guardada (para no quedar en blanco).
     · Si no hay ni red ni copia -> muestra la página de reintento (branded).
   Esto da: siempre fresco cuando hay señal, y nunca pantalla blanca sin señal.
   ========================================================================== */
const CACHE = 'tanneros-shell-v1';   // subir este número invalida cachés viejas
const SHELL_KEY = 'app-shell';       // copia del último HTML bueno
const NET_TIMEOUT_MS = 4000;         // si la red tarda más, usa la copia

self.addEventListener('install', (e) => {
  // Activa el SW nuevo de inmediato (no espera a que cierren pestañas).
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // Borra cachés de versiones anteriores.
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => { ctrl.abort(); reject(new Error('timeout')); }, ms);
    fetch(request, { signal: ctrl.signal, cache: 'no-store' })
      .then((r) => { clearTimeout(t); resolve(r); })
      .catch((err) => { clearTimeout(t); reject(err); });
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                 // solo lecturas
  const isDoc = req.mode === 'navigate' || req.destination === 'document';
  if (!isDoc) return;                               // el resto va normal (API, fuentes)
  e.respondWith(networkFirstDoc(req));
});

async function networkFirstDoc(req) {
  const cache = await caches.open(CACHE);
  try {
    // 1) Intenta la RED primero (siempre lo más nuevo).
    const fresh = await fetchWithTimeout(req, NET_TIMEOUT_MS);
    if (fresh && (fresh.ok || fresh.type === 'opaque')) {
      cache.put(SHELL_KEY, fresh.clone());          // guarda copia de respaldo
      return fresh;
    }
    throw new Error('respuesta no OK');
  } catch (err) {
    // 2) Sin red o red lenta -> usa la copia guardada (no queda en blanco).
    const cached = await cache.match(SHELL_KEY);
    if (cached) return cached;
    // 3) Ni red ni copia -> página de reintento branded.
    return new Response(OFFLINE_HTML, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}

/* Página de reintento — colores y tipografía de Tannery City. Sin dependencias
   externas (fuentes del sistema) para que cargue incluso 100% offline. */
const OFFLINE_HTML = `<!doctype html><html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>TannerOS</title>
<style>
  :root{--teal:#056C7F;--gold:#B8A464;--ink:#0B1418;--bg:#F2F1EA;--muted:#5C6B72;--line:#E2E0D5}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;background:var(--bg);color:var(--ink);
    font-family:'Barlow',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    display:flex;align-items:center;justify-content:center;padding:24px;
    padding-top:calc(24px + env(safe-area-inset-top));padding-bottom:calc(24px + env(safe-area-inset-bottom))}
  .card{max-width:380px;width:100%;text-align:center}
  .badge{width:76px;height:76px;border-radius:20px;margin:0 auto 22px;
    background:linear-gradient(135deg,var(--ink),var(--teal) 150%);position:relative;
    display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(11,20,24,.18)}
  .badge::after{content:'';position:absolute;left:0;right:0;bottom:0;height:4px;background:var(--gold);border-radius:0 0 20px 20px}
  .badge span{font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:30px;color:#fff;letter-spacing:.04em}
  h1{font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:23px;text-transform:uppercase;
    letter-spacing:.02em;margin:0 0 8px}
  p{font-size:14.5px;color:var(--muted);line-height:1.5;margin:0 0 22px}
  button{width:100%;background:var(--teal);color:#fff;border:none;border-radius:12px;
    padding:15px;font-family:inherit;font-size:16px;font-weight:700;cursor:pointer;min-height:52px;
    -webkit-tap-highlight-color:transparent}
  button:active{background:var(--ink)}
  .hint{margin-top:14px;font-size:12px;color:var(--muted)}
</style></head><body>
  <div class="card">
    <div class="badge"><span>TC</span></div>
    <h1>No se pudo abrir TannerOS</h1>
    <p>Parece que no hay conexión en este momento. Tus datos están a salvo en el teléfono. Conéctate a internet y vuelve a intentar.</p>
    <button onclick="location.reload()">Reintentar</button>
    <div class="hint">Tannery City FC · Control del club</div>
  </div>
</body></html>`;
