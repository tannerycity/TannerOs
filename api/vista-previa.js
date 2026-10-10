// Vista previa de las ligas públicas por club (WhatsApp, Facebook, Telegram…).
//
// Las páginas públicas son HTML estático con las etiquetas OG de Tannery. Los
// robots de vista previa no corren JavaScript, así que una liga de otro club
// (/registro/?club=leon-norte) se veía con el escudo y el nombre de Tannery.
// vercel.json manda aquí SOLO a esos robots y SOLO si la liga trae ?club=; las
// personas siguen recibiendo la página normal.
const KEY = 'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG';
const SUPABASE_URL = 'https://pacnegivzgxpanphrnwp.supabase.co';
const SLUG = /^[a-z0-9][a-z0-9-]{1,63}$/;

const PAGINAS = {
  registro:        { ruta: '/registro/',      titulo: c => `Únete a ${c} · Registro`, texto: c => `Registra a tu hijo o hija en ${c} en menos de dos minutos.` },
  pedido:          { ruta: '/pedido/',        titulo: c => `Tienda ${c}`, texto: c => `Uniformes y artículos oficiales de ${c}. Pide desde tu celular.` },
  programas:       { ruta: '/programas/',     titulo: c => `Programas y eventos · ${c}`, texto: c => `Inscríbete a los programas y eventos de ${c}.` },
  academias:       { ruta: '/academias/',     titulo: c => `Academias ${c}`, texto: c => `Encuentra tu academia de ${c} e inscríbete.` },
  'centro-tanner': { ruta: '/centro-tanner/', titulo: c => `Reglamento y preguntas · ${c}`, texto: c => `Reglamento, pagos, becas y preguntas frecuentes de ${c}.` }
};

const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function logoDe(branding) {
  const a = branding?.assets || {};
  const ruta = a.logo || a.mark || a.appIcon512 || null;
  if (!ruta) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/tanneros-branding/${String(ruta).split('/').map(encodeURIComponent).join('/')}`;
}

// Arma el HTML. Pura, para poder probarla sin red.
function armaVistaPrevia({ pagina, club, nombre, imagen, origen }) {
  const p = PAGINAS[pagina] || PAGINAS.registro;
  const url = `${origen}${p.ruta}?club=${encodeURIComponent(club)}`;
  const titulo = p.titulo(nombre), texto = p.texto(nombre);
  const img = imagen ? `\n<meta property="og:image" content="${esc(imagen)}">\n<meta name="twitter:image" content="${esc(imagen)}">` : '';
  return `<!doctype html>
<html lang="es-MX"><head><meta charset="utf-8">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(texto)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(nombre)}">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(texto)}">
<meta property="og:url" content="${esc(url)}">
<meta name="twitter:card" content="${imagen ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${esc(titulo)}">
<meta name="twitter:description" content="${esc(texto)}">${img}
<link rel="canonical" href="${esc(url)}">
</head><body><p><a href="${esc(url)}">${esc(titulo)}</a></p>
<script>location.replace(${JSON.stringify(url).replace(/</g, '\\u003c')})</script></body></html>`;
}

async function rpc(nombre, cuerpo) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nombre}`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
  if (!r.ok) throw new Error(`${nombre} ${r.status}`);
  return r.json();
}

async function handler(req, res) {
  const club = String(req.query?.club || '').trim().toLowerCase();
  const pagina = PAGINAS[req.query?.pagina] ? req.query.pagina : 'registro';
  const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || 'app.tannerycity.com');
  const origen = `https://${host}`;
  if (!SLUG.test(club)) { res.status(404).send('Club no encontrado'); return; }
  try {
    const ctx = await rpc('v2_public_context', { club_key: club });
    const nombre = String(ctx?.brand || ctx?.organizationName || '').trim();
    if (!nombre) throw new Error('sin nombre');
    let imagen = null;
    try { imagen = logoDe(await rpc('v2_public_branding_by_org', { organization_id: ctx.organizationId })); } catch { imagen = null; }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600');
    res.status(200).send(armaVistaPrevia({ pagina, club, nombre, imagen, origen }));
  } catch {
    res.status(404).send('Club no encontrado');
  }
}

module.exports = handler;
module.exports.armaVistaPrevia = armaVistaPrevia;
module.exports.logoDe = logoDe;
module.exports.PAGINAS = PAGINAS;
