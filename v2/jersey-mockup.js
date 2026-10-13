/* Vista previa de la playera con nombre y número (tienda).
   Un dibujo de la espalda en los colores del club que se actualiza mientras
   la familia escribe: así ve si "MAXIMILIANO" cabe y cómo queda el 10 antes
   de pagar algo que, estampado, ya no tiene cambio.
   Sin dependencias: devuelve el SVG como texto. */

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const HEX = /^#[0-9a-f]{6}$/i;

function luminancia(hex) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contraste = (a, b) => { const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// El color de la playera: el del club, o el que dice el nombre del producto
// ("Black Edition", "Blanca"); el estampado, el que más se lea encima.
export function coloresDePlayera({ nombreProducto = '', primario = '#012A3A', acento = '#C6AC5C' } = {}) {
  const n = String(nombreProducto).toLowerCase();
  let cuerpo = HEX.test(primario) ? primario : '#012A3A';
  if (/black|negr/.test(n)) cuerpo = '#141414';
  else if (/white|blanc/.test(n)) cuerpo = '#F4F4F2';
  else if (/pink|rosa/.test(n)) cuerpo = '#E7A3B8';
  else if (/lechuguilla|green|verde/.test(n)) cuerpo = '#4E6B3A';
  const ribete = HEX.test(acento) ? acento : '#C6AC5C';
  // El acento del club si se lee bien; si no, blanco o casi negro.
  const texto = contraste(ribete, cuerpo) >= 3 ? ribete : (contraste('#FFFFFF', cuerpo) >= contraste('#111111', cuerpo) ? '#FFFFFF' : '#111111');
  return { cuerpo, ribete, texto };
}

export function limpiaNombre(v) { return String(v ?? '').trim().replace(/\s+/g, ' ').toLocaleUpperCase('es-MX').slice(0, 20); }
export function limpiaNumero(v) { return String(v ?? '').replace(/\D/g, '').slice(0, 3); }

/* La espalda (13/10/2026, "la tipografía y la imagen de la playera están
   feas"): silueta con cuello, mangas raglán y pliegues de luz y sombra, y los
   números en tipografía de dorsal (condensada, gruesa, con contorno).
   Si el producto trae la foto real de su espalda (`fondo`), se usa esa foto
   y el nombre y el número van encima: así se ve exactamente la playera. */
let mockupN = 0;
export function mockupJersey({ nombre = '', numero = '', colores, fondo = '' } = {}) {
  const c = colores || coloresDePlayera();
  const id = `jm${++mockupN}`;
  const n = limpiaNombre(nombre), num = limpiaNumero(numero);
  const vacioN = !n, vacioNum = !num;
  const textoN = n || 'TU NOMBRE', textoNum = num || '10';
  const largo = textoN.length > 9 ? ` textLength="104" lengthAdjust="spacingAndGlyphs"` : '';
  const tamNum = textoNum.length >= 3 ? 70 : 92;
  const borde = luminancia(c.texto) > 0.5 ? 'rgba(0,0,0,.35)' : 'rgba(255,255,255,.35)';
  const fuente = `'Anton','Bebas Neue','Oswald','Barlow Condensed','Arial Narrow',Impact,sans-serif`;
  const letras = `<text x="100" y="78" text-anchor="middle" font-family="${fuente}" font-size="19" letter-spacing="2.5" fill="${c.texto}"${largo} opacity="${vacioN ? 0.4 : 1}" data-mockup="nombre">${esc(textoN)}</text>
  <text x="100" y="${tamNum === 92 ? 170 : 160}" text-anchor="middle" font-family="${fuente}" font-size="${tamNum}" fill="${c.texto}" stroke="${borde}" stroke-width="1.6" paint-order="stroke" opacity="${vacioNum ? 0.4 : 1}" data-mockup="numero">${esc(textoNum)}</text>`;
  if (fondo) {
    return `<svg class="jersey-mockup foto" viewBox="0 0 200 220" role="img" aria-label="Vista previa: ${esc(vacioN ? 'sin nombre' : n)}, número ${esc(vacioNum ? 'sin número' : num)}">
  <image href="${esc(fondo)}" x="0" y="0" width="200" height="220" preserveAspectRatio="xMidYMid slice"/>${letras}</svg>`;
  }
  return `<svg class="jersey-mockup" viewBox="0 0 200 220" role="img" aria-label="Vista previa: ${esc(vacioN ? 'sin nombre' : n)}, número ${esc(vacioNum ? 'sin número' : num)}">
  <defs>
    <linearGradient id="${id}l" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".22"/><stop offset=".18" stop-color="#000" stop-opacity="0"/><stop offset=".82" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient>
    <linearGradient id="${id}v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".10"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".14"/></linearGradient>
  </defs>
  <g>
    <path d="M70 10 C82 18 118 18 130 10 L168 24 C180 30 188 44 194 62 L199 82 L170 94 L160 70 L161 204 C130 214 70 214 39 204 L40 70 L30 94 L1 82 L6 62 C12 44 20 30 32 24 Z" fill="${c.cuerpo}"/>
    <path d="M70 10 C82 18 118 18 130 10 L168 24 C180 30 188 44 194 62 L199 82 L170 94 L160 70 L161 204 C130 214 70 214 39 204 L40 70 L30 94 L1 82 L6 62 C12 44 20 30 32 24 Z" fill="url(#${id}l)"/>
    <path d="M70 10 C82 18 118 18 130 10 L168 24 C180 30 188 44 194 62 L199 82 L170 94 L160 70 L161 204 C130 214 70 214 39 204 L40 70 L30 94 L1 82 L6 62 C12 44 20 30 32 24 Z" fill="url(#${id}v)" stroke="rgba(0,0,0,.22)" stroke-width="1.2"/>
    <path d="M70 10 C82 18 118 18 130 10" fill="none" stroke="${c.ribete}" stroke-width="5" stroke-linecap="round"/>
    <path d="M32 24 C46 34 52 52 40 70 M168 24 C154 34 148 52 160 70" fill="none" stroke="rgba(0,0,0,.14)" stroke-width="1.4"/>
    <path d="M199 82 L170 94 M1 82 L30 94" stroke="${c.ribete}" stroke-width="4.5" stroke-linecap="round"/>
    <path d="M58 120 C64 150 62 180 56 206 M144 120 C138 150 140 180 146 206" fill="none" stroke="rgba(0,0,0,.07)" stroke-width="5" stroke-linecap="round"/>
  </g>
  ${letras}
</svg>`;
}
