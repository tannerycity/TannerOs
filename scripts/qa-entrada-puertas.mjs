// Las puertas de la entrada (25/11/2026), sin navegador.
// Presidencia: "no tienen iconos ni el inscribe ni entrar al vestidor". Al
// quitar los verdes, esos dos iconos quedaron con el mismo azul noche de
// fondo y de dibujo: no se veían. Y "ponle otro iconito abajo que se llama
// Tanner Live... todavía no lo actives, solo que quede ahí".
// Esto revisa que cada icono se vea (contraste de 3 o más entre fondo y dibujo) y que Tanner
// LIVE esté, pero sin liga ni botón.
import { readFileSync } from 'node:fs';

let fallos = 0, casos = 0;
const revisa = (n, ok) => { casos++; if (!ok) { fallos++; console.error(' - ' + n); } };
const css = readFileSync('v2/entrada.css', 'utf8');
// Contraste WCAG entre dos colores en hex (null si alguno no es hex).
const hex = (c) => { const h = String(c).replace('#', ''); const v = h.length === 3 ? h.split('').map((x) => x + x).join('') : h; return /^[0-9a-f]{6}$/i.test(v) ? [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255) : null; };
const luz = (rgb) => { const [r, g, b] = rgb.map((x) => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const nombres = { '#fff': '#ffffff', '#000': '#000000' };
function contraste(a, b) {
  const x = hex(nombres[a] || a), y = hex(nombres[b] || b); if (!x || !y) return null;
  const [l1, l2] = [luz(x), luz(y)].sort((m, n) => n - m); return (l1 + 0.05) / (l2 + 0.05);
}

for (const m of css.matchAll(/([^{}]*\.tc-icono-[\w-]+[^{}]*)\{([^}]*)\}/g)) {
  const bg = (m[2].match(/background:\s*([^;]+)/) || [])[1]?.trim().toLowerCase();
  const fg = (m[2].match(/(?:^|;)\s*color:\s*([^;]+)/) || [])[1]?.trim().toLowerCase();
  if (bg && fg) revisa(`el icono ${m[1].trim()} se ve (fondo ${bg}, dibujo ${fg}, contraste ${contraste(bg, fg)?.toFixed(1)})`, (contraste(bg, fg) ?? 9) >= 3);
}
for (const k of ['registro', 'staff', 'live', 'portal', 'tienda', 'centro'])
  revisa(`el icono ${k} tiene fondo`, new RegExp(`\\.tc-icono-${k}\\{background:`).test(css));

for (const p of ['index.html', 'v2/index.html']) {
  const h = readFileSync(p, 'utf8');
  const live = (h.match(/<div class="tc-puerta tc-puerta-pronto" data-puerta="live"[\s\S]*?<\/div>/) || [])[0] || '';
  revisa(`${p}: Tanner LIVE está en las puertas`, /Tanner LIVE/.test(live) && /tc-icono-live/.test(live));
  revisa(`${p}: Tanner LIVE todavía no abre nada`, !/href=|<a |<button|onclick/.test(live) && /aria-disabled="true"/.test(live) && /Muy pronto/.test(live));
  revisa(`${p}: Inscribe a tu hijo con su icono`, /tc-icono-registro[^>]*><svg[\s\S]*?<\/svg>/.test(h));
}
revisa('las dos entradas son iguales', readFileSync('index.html', 'utf8') === readFileSync('v2/index.html', 'utf8'));

console.log(fallos ? `Puertas de la entrada FAILED · ${fallos} de ${casos}` : `Puertas de la entrada OK · ${casos} revisiones: iconos visibles y Tanner LIVE sin abrir`);
process.exit(fallos ? 1 : 0);
