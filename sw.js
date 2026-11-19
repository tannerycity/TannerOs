/* =============================================================================
   TannerOS — Service Worker
   -----------------------------------------------------------------------------
   Administra únicamente el documento principal de TannerOS (/ y /index.html).
   Nunca conserva ni sirve shells legacy. Las rutas públicas quedan fuera.
   ========================================================================== */
const CACHE = 'tanneros-shell-final-20260821';
const SHELL_KEY = 'app-shell';
const NET_TIMEOUT_MS = 8000;
/* Los archivos de la página (19/11/2026). Presidencia mandó captura del inicio
   "en crudo": letras con serif, el logo con signo de interrogación e íconos
   enormes. Con señal mala, el service worker servía el HTML guardado, pero
   sus estilos, fuentes e imágenes no estaban guardados y también dependían de
   la red. Ahora:
     · Al guardar el inicio se guardan también los archivos que pide.
     · Los archivos con huella (?v=...) nunca cambian (la construcción les da
       una huella nueva cuando cambian), así que se sirven primero del
       guardado y, si no están, de la red.
   Sólo misma origen, sólo GET, sólo con ?v=. Nada de datos ni de Supabase. */
const ASSETS = 'tanneros-archivos-v1';
const MAX_ASSETS = 220;

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    // El caché de fotos (v2/photo-cache.js) no es del shell y no se poda aquí:
    // si se borrara en cada activación, las familias volverían a descargar la
    // foto de su hijo en cada visita, que es justo lo que evita.
    await Promise.all(keys
      .filter((k) => k !== CACHE && k !== ASSETS && !k.startsWith('tanneros-fotos-'))
      .map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { /* payload no era JSON */ }
  const title = data.title || 'TannerOS';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientList) {
      if (client.url.startsWith(self.location.origin) && 'focus' in client) {
        await client.focus();
        if ('navigate' in client) await client.navigate(targetUrl);
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(targetUrl);
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

async function isCurrentTannerOSShell(response) {
  try {
    const html = await response.clone().text();
    return html.includes('id="authView"') && html.includes('id="appView"') && html.includes('tos-layout');
  } catch (_) {
    return false;
  }
}

function isFingerprintedAsset(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  return url.searchParams.has('v') && /\.(css|js|png|svg|jpg|jpeg|webp|woff2)$/i.test(url.pathname);
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  if (hit) return hit;
  const fresh = await fetch(request);
  if (fresh && fresh.ok && fresh.type === 'basic') {
    try { await cache.put(request, fresh.clone()); await trimAssets(cache); } catch (_) { /* sin espacio: se sirve igual */ }
  }
  return fresh;
}

async function trimAssets(cache) {
  const keys = await cache.keys();
  const sobran = keys.length - MAX_ASSETS;
  for (let i = 0; i < sobran; i++) await cache.delete(keys[i]);
}

// Lo que pide el HTML del inicio: estilos, scripts, fuentes e imágenes con huella.
function assetsOf(html) {
  const urls = new Set();
  const re = /(?:href|src)="(\/[^"?#]+\.(?:css|js|png|svg|jpg|jpeg|webp|woff2)\?v=[^"]+)"/g;
  let m;
  while ((m = re.exec(html))) urls.add(m[1]);
  return [...urls];
}

async function precacheShellAssets(html) {
  try {
    const cache = await caches.open(ASSETS);
    for (const u of assetsOf(html)) {
      if (await cache.match(u)) continue;
      try { const r = await fetch(u); if (r.ok) await cache.put(u, r); } catch (_) { /* se intenta la próxima vez */ }
    }
    await trimAssets(cache);
  } catch (_) { /* nunca tumba la navegación */ }
}

self.addEventListener('fetch', (event) => {
  if (isFingerprintedAsset(event.request)) {
    event.respondWith(cacheFirstAsset(event.request));
    return;
  }
  if (!isInternalAppNavigation(event.request)) return;
  event.respondWith(networkFirstInternalApp(event.request, event));
});

async function networkFirstInternalApp(request, event) {
  const cache = await caches.open(CACHE);

  try {
    const fresh = await fetchWithTimeout(request, NET_TIMEOUT_MS);
    if (fresh && fresh.ok) {
      // Solo cacheamos el shell actual de TannerOS. Un HTML legacy jamás puede
      // convertirse otra vez en fallback del dominio principal.
      if (await isCurrentTannerOSShell(fresh)) {
        await cache.put(SHELL_KEY, fresh.clone());
        // Y sus archivos, para que el guardado no salga "en crudo" sin señal.
        const html = await fresh.clone().text();
        const tarea = precacheShellAssets(html);
        if (event && event.waitUntil) event.waitUntil(tarea);
      }
      return fresh;
    }
    throw new Error('respuesta no OK');
  } catch (error) {
    const cached = await cache.match(SHELL_KEY);
    if (cached && await isCurrentTannerOSShell(cached)) return cached;

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
    <p>No hay conexión suficiente para cargar TannerOS. Conéctate a internet y vuelve a intentar.</p>
    <button onclick="location.reload()">Reintentar</button>
  </div>
</body></html>`;
