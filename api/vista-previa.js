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
  tienda:          { ruta: '/tienda/',        titulo: c => `Tienda ${c}`, texto: c => `Uniformes y artículos oficiales de ${c}. Pide desde tu celular.` },
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

// Liga fácil de la tienda (28/10/2026): /tienda/<pieza|kit|categoría>.
// Con la foto, el nombre y el precio de la pieza; así se ve la gorra en
// WhatsApp y Facebook, no la portada genérica. Misma regla que
// pedido/ligas.js (slug de la base, o el nombre para kits y categorías).
const CATEGORIAS = { kits: 'kits', jerseys: 'jersey', shorts: 'shorts', pants: 'pants', chamarras: 'outerwear', calcetas: 'socks',
  gorras: 'gorras', 'ropa-casual': 'casual', accesorios: 'accesorios', mascaras: 'mascaras' };
const slugify = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const slugDeProducto = p => (/^[a-z0-9][a-z0-9-]{0,79}$/.test(String(p?.slug || '')) ? p.slug : slugify(p?.name));
const pesos = n => `$${Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`;

function buscaPieza(oferta, slug) {
  const s = slugify(slug);
  const p = (oferta?.products || []).find(x => x.available !== false && slugDeProducto(x) === s);
  if (p) return { nombre: p.name, precio: Number(p.price ?? p.priceAdult ?? 0), desde: Number(p.priceKid) > 0 && Number(p.priceKid) < Number(p.price ?? p.priceAdult ?? 0) ? Number(p.priceKid) : null,
    texto: p.description, bucket: p.photoBucket, foto: p.photoPath || p.photoThumbPath };
  const k = (oferta?.bundles || []).find(x => x.available !== false && slugify(x.name) === s);
  if (k) { const c = (k.components || []).find(x => x.photoThumbPath);
    return { nombre: k.name, precio: Number(k.priceAdult || 0), desde: Number(k.priceKid) > 0 ? Number(k.priceKid) : null,
      texto: k.description || `Incluye ${(k.components || []).map(x => `${x.qty > 1 ? `${x.qty} ` : ''}${x.poolName || x.name}`).join(', ')}.`,
      bucket: c?.photoBucket, foto: c?.photoThumbPath }; }
  return null;
}

// La foto vive en almacenamiento privado: se firma por 30 días (los robots
// guardan la vista previa la primera vez que la ven).
async function firmaFoto(bucket, ruta) {
  if (!bucket || !ruta) return null;
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${String(ruta).split('/').map(encodeURIComponent).join('/')}`,
    { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 2592000 }) });
  if (!r.ok) return null;
  const d = await r.json();
  return d?.signedURL ? `${SUPABASE_URL}/storage/v1${d.signedURL}` : null;
}

function armaVistaProducto({ club, nombreClub, pieza, categoria, slug, imagen, origen, tannery }) {
  const url = `${origen}/tienda/${encodeURIComponent(slug)}${tannery ? '' : `?club=${encodeURIComponent(club)}`}`;
  const titulo = pieza ? `${pieza.nombre} · ${pieza.desde ? `desde ${pesos(pieza.desde)}` : pesos(pieza.precio)}` : `${categoria} · Tienda ${nombreClub}`;
  const texto = pieza ? String(pieza.texto || `Producto oficial de ${nombreClub}. Pídelo desde tu celular.`).replace(/\s+/g, ' ').slice(0, 180)
    : `${categoria} oficiales de ${nombreClub}. Pide desde tu celular.`;
  const img = imagen ? `\n<meta property="og:image" content="${esc(imagen)}">\n<meta name="twitter:image" content="${esc(imagen)}">` : '';
  return `<!doctype html>
<html lang="es-MX"><head><meta charset="utf-8">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(texto)}">
<meta property="og:type" content="${pieza ? 'product' : 'website'}">
<meta property="og:site_name" content="Tienda ${esc(nombreClub)}">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(texto)}">
<meta property="og:url" content="${esc(url)}">${pieza ? `\n<meta property="product:price:amount" content="${esc(pieza.desde || pieza.precio)}">\n<meta property="product:price:currency" content="MXN">` : ''}
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
  const pagina = PAGINAS[req.query?.pagina] ? req.query.pagina : req.query?.pagina === 'producto' ? 'tienda' : 'registro';
  const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || 'app.tannerycity.com');
  const origen = `https://${host}`;
  if (!SLUG.test(club)) { res.status(404).send('Club no encontrado'); return; }
  if (req.query?.pagina === 'producto') {
    const slug = slugify(req.query?.slug);
    try {
      const [ctx, oferta] = await Promise.all([rpc('v2_public_context', { club_key: club }), rpc('v2_public_offerings', { club_key: club })]);
      const nombreClub = String(ctx?.brand || ctx?.organizationName || '').trim() || 'Tannery City';
      const pieza = buscaPieza(oferta, slug);
      const cat = CATEGORIAS[slug];
      if (!pieza && !cat) throw new Error('no existe');
      const categoria = cat ? slug.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase()) : '';
      let imagen = null;
      try { imagen = pieza ? await firmaFoto(pieza.bucket, pieza.foto) : null; } catch { imagen = null; }
      if (!imagen) { try { imagen = logoDe(await rpc('v2_public_branding_by_org', { organization_id: ctx.organizationId })); } catch { imagen = null; } }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600');
      res.status(200).send(armaVistaProducto({ club, nombreClub, pieza, categoria, slug, imagen, origen, tannery: club === 'tannery-city-fc' }));
      return;
    } catch {
      // Una liga vieja o mal escrita: la portada de la tienda, no un error.
    }
  }
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
module.exports.armaVistaProducto = armaVistaProducto;
module.exports.buscaPieza = buscaPieza;
