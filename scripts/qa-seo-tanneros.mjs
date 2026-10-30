/* SEO técnico de app.tannerycity.com (29/10/2026, docs/medicion).
 *   - sitemap.xml es XML válido, sólo del dominio oficial y sólo páginas
 *     públicas que existen en el repo.
 *   - Ninguna página del sitemap cae en las rutas privadas (noindex).
 *   - Cada módulo del menú del staff manda X-Robots-Tag: noindex.
 *   - robots.txt anuncia el sitemap y no deja rastrear /v2/ ni /api/.
 *   - Las públicas no quedan tapadas por el noindex (tienda, visoría,
 *     registro, aviso de privacidad). */
import fs from 'node:fs';

let fallas = 0, n = 0;
const revisa = (t, ok, d = '') => { n++; if (!ok) { fallas++; console.error(`MAL ${t}${d ? ` · ${d}` : ''}`); } };
const raiz = new URL('..', import.meta.url);
const lee = f => fs.readFileSync(new URL(f, raiz), 'utf8');

const sitemap = lee('sitemap.xml');
revisa('sitemap: XML con urlset de sitemaps.org', /^<\?xml version="1.0" encoding="UTF-8"\?>/.test(sitemap) && /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">[\s\S]*<\/urlset>\s*$/.test(sitemap));
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
revisa('sitemap: cada <url> tiene su <loc> y cierra', locs.length > 3 && (sitemap.match(/<url>/g) || []).length === locs.length && (sitemap.match(/<\/url>/g) || []).length === locs.length);
revisa('sitemap: sólo https://app.tannerycity.com', locs.every(l => /^https:\/\/app\.tannerycity\.com\/[a-z0-9\-/]*$/.test(l)), locs.join(' '));

const vercel = JSON.parse(lee('vercel.json'));
const noindex = vercel.headers.find(h => h.headers.some(x => x.key === 'X-Robots-Tag' && /noindex/.test(x.value)));
revisa('hay regla X-Robots-Tag: noindex para lo privado', !!noindex);
const privado = new RegExp(`^${noindex?.source || '$^'}$`);
revisa('sitemap: ninguna página privada', locs.every(l => !privado.test(new URL(l).pathname)), locs.filter(l => privado.test(new URL(l).pathname)).join(' '));
const existe = ruta => {
  const p = ruta.replace(/^\//, '');
  if (!p) return fs.existsSync(new URL('index.html', raiz));
  return fs.existsSync(new URL(`${p}index.html`, raiz)) || vercel.rewrites.some(r => r.source === `/${p}` || r.source === `/${p.replace(/\/$/, '')}`);
};
revisa('sitemap: cada página existe en el repo', locs.every(l => existe(new URL(l).pathname)), locs.filter(l => !existe(new URL(l).pathname)).join(' '));

const shell = lee('v2/shell.js');
const hrefs = [...shell.slice(shell.indexOf('export const navItems=['), shell.indexOf('];', shell.indexOf('export const navItems=['))).matchAll(/href:'([^']+)'/g)].map(m => m[1]).filter(h => h !== '/');
revisa('cada módulo del staff lleva noindex', hrefs.length > 20 && hrefs.every(h => privado.test(h) || privado.test(h.replace(/\/$/, ''))), hrefs.filter(h => !privado.test(h)).join(' '));
revisa('portal de familias y /v2/ llevan noindex', privado.test('/familias/') && privado.test('/v2/club/') && privado.test('/tanner/') && privado.test('/visorias/'));
revisa('lo público NO lleva noindex', ['/tienda/', '/visoria/', '/registro/', '/aviso-de-privacidad/', '/centro-tanner/', '/demo/', '/'].every(p => !privado.test(p)));

const robots = lee('robots.txt');
revisa('robots.txt anuncia el sitemap y cierra /v2/ y /api/', /Sitemap: https:\/\/app\.tannerycity\.com\/sitemap\.xml/.test(robots) && /Disallow: \/v2\//.test(robots) && /Disallow: \/api\//.test(robots));

console.log(fallas ? `SEO TannerOS: ${fallas} de ${n} fallaron` : `SEO TannerOS OK · ${n} revisiones: sitemap válido y público, noindex en lo privado`);
process.exit(fallas ? 1 : 0);
