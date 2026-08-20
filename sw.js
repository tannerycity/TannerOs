/* =============================================================================
   TannerOS — Service Worker
   -----------------------------------------------------------------------------
   Administra el documento interno principal de TannerOS (/ y /index.html).
   Las rutas públicas quedan fuera del app-shell para evitar que un fallback
   offline entregue la app interna en /registro, /pedido o /programas.
   ========================================================================== */
const CACHE = 'tanneros-shell-prod-20260820';
const SHELL_KEY = 'app-shell';
const NET_TIMEOUT_MS = 4000;

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      ctrl.abort();
      reject(new Error('timeout'));
    }, ms);

    fetch(request, { signal: ctrl.signal, cache: 'no-store' })
      .then((response) => {
        clearTimeout(timer);
        resolve(response);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function isInternalAppNavigation(request) {
  if (request.method !== 'GET') return false;
  const isDocument = request.mode === 'navigate' || request.destination === 'document';
  if (!isDocument) return false;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;

  return url.pathname === '/' || url.pathname === '/index.html';
}

self.addEventListener('fetch', (event) => {
  if (!isInternalAppNavigation(event.request)) return;
  event.respondWith(networkFirstInternalApp(event.request));
});

async function networkFirstInternalApp(request) {
  const cache = await caches.open(CACHE);

  try {
    const fresh = await fetchWithTimeout(request, NET_TIMEOUT_MS);
    if (fresh && (fresh.ok || fresh.type === 'opaque')) {
      await cache.put(SHELL_KEY, fresh.clone());
      return fresh;
    }
    throw new Error('respuesta no OK');
  } catch (error) {
    const cached = await cache.match(SHELL_KEY);
    if (cached) return cached;

    return new Response(OFFLINE_HTML, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}

const OFFLINE_HTML = `<!doctype html><html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>TannerOS</title>
<style>
  :root{--teal:#056C7F;--gold:#B8A464;--ink:#0B1418;--bg:#F2F1EA;--muted:#5C6B72}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{max-width:380px;width:100%;text-align:center}
  .badge{width:76px;height:76px;border-radius:20px;margin:0 auto 22px;background:linear-gradient(135deg,var(--ink),var(--teal) 150%);display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(11,20,24,.18)}
  .badge span{font-weight:800;font-size:30px;color:#fff;letter-spacing:.04em}
  h1{font-weight:800;font-size:23px;text-transform:uppercase;letter-spacing:.02em;margin:0 0 8px}
  p{font-size:14.5px;color:var(--muted);line-height:1.5;margin:0 0 22px}
  button{width:100%;background:var(--teal);color:#fff;border:none;border-radius:12px;padding:15px;font:inherit;font-size:16px;font-weight:700;cursor:pointer;min-height:52px}
</style></head><body>
  <div class="card">
    <div class="badge"><span>TC</span></div>
    <h1>No se pudo abrir TannerOS</h1>
    <p>Parece que no hay conexión en este momento. Tus datos están a salvo. Conéctate a internet y vuelve a intentar.</p>
    <button onclick="location.reload()">Reintentar</button>
  </div>
</body></html>`;
