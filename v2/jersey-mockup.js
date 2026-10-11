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
  const ribete = HEX.test(acento) ? acento : '#C6AC5C';
  // El acento del club si se lee bien; si no, blanco o casi negro.
  const texto = contraste(ribete, cuerpo) >= 3 ? ribete : (contraste('#FFFFFF', cuerpo) >= contraste('#111111', cuerpo) ? '#FFFFFF' : '#111111');
  return { cuerpo, ribete, texto };
}

export function limpiaNombre(v) { return String(v ?? '').trim().replace(/\s+/g, ' ').toLocaleUpperCase('es-MX').slice(0, 20); }
export function limpiaNumero(v) { return String(v ?? '').replace(/\D/g, '').slice(0, 3); }

export function mockupJersey({ nombre = '', numero = '', colores } = {}) {
  const c = colores || coloresDePlayera();
  const n = limpiaNombre(nombre), num = limpiaNumero(numero);
  const vacioN = !n, vacioNum = !num;
  const textoN = n || 'TU NOMBRE', textoNum = num || '10';
  // Nombres largos se comprimen al ancho de la espalda en vez de salirse.
  const largo = textoN.length > 9 ? ` textLength="118" lengthAdjust="spacingAndGlyphs"` : '';
  const tamNum = textoNum.length >= 3 ? 62 : 78;
  return `<svg class="jersey-mockup" viewBox="0 0 200 220" role="img" aria-label="Vista previa: ${esc(vacioN ? 'sin nombre' : n)}, número ${esc(vacioNum ? 'sin número' : num)}">
  <path d="M62 12 Q100 30 138 12 L182 34 L198 84 L166 96 L158 72 L158 208 Q100 218 42 208 L42 72 L34 96 L2 84 L18 34 Z" fill="${c.cuerpo}" stroke="rgba(0,0,0,.18)" stroke-width="1.5"/>
  <path d="M62 12 Q100 30 138 12" fill="none" stroke="${c.ribete}" stroke-width="5" stroke-linecap="round"/>
  <path d="M198 84 L166 96 M2 84 L34 96" stroke="${c.ribete}" stroke-width="5" stroke-linecap="round"/>
  <text x="100" y="74" text-anchor="middle" font-family="'Barlow Condensed','Arial Narrow',Arial,sans-serif" font-weight="800" font-size="21" letter-spacing="1.5" fill="${c.texto}"${largo} opacity="${vacioN ? 0.38 : 1}" data-mockup="nombre">${esc(textoN)}</text>
  <text x="100" y="${tamNum === 78 ? 158 : 150}" text-anchor="middle" font-family="'Barlow Condensed','Arial Narrow',Arial,sans-serif" font-weight="800" font-size="${tamNum}" fill="${c.texto}" opacity="${vacioNum ? 0.38 : 1}" data-mockup="numero">${esc(textoNum)}</text>
</svg>`;
}
