/* Elegir número de camiseta en un toque.
 *
 * Pedido de Presidencia (08/10/2026): elegir el número "es un pedo": había que
 * entrar a Jugadores, ver cuáles estaban libres, regresar y teclearlo. Ahora
 * cualquier pantalla abre esta hoja: arriba los sugeridos (los libres más
 * bajos), abajo la cancha del 1 al 99 con los ocupados en gris y quién los
 * trae. Un toque y regresa el número.
 *
 * Uso:
 *   import { elegirDorsal } from '/v2/dorsal.js';
 *   const n = await elegirDorsal({ rpc, organizationId, category:'T10',
 *                                  nombre:'Mateo', actual:'14' });
 *   // n es '7' o null si se cerró.
 *
 * Los ocupados salen del servidor (v2_jersey_board): nunca de la lista que
 * tenga cargada la pantalla, que puede venir filtrada o vieja.
 */
const ID_ESTILOS = 'tos-dorsal-estilos';

function estilos() {
  if (document.getElementById(ID_ESTILOS)) return;
  const s = document.createElement('style');
  s.id = ID_ESTILOS;
  s.textContent = `
.dorsal-fondo{position:fixed;inset:0;z-index:9998;background:rgba(3,22,28,.55);display:flex;align-items:flex-end;justify-content:center;animation:dorsalFade .14s ease}
@keyframes dorsalFade{from{opacity:0}to{opacity:1}}
.dorsal-hoja{background:#fff;width:min(520px,100%);max-height:92vh;overflow:auto;border-radius:24px 24px 0 0;padding:10px 18px calc(18px + env(safe-area-inset-bottom));box-shadow:0 -18px 50px rgba(0,0,0,.25);box-sizing:border-box;animation:dorsalSube .2s cubic-bezier(.2,.9,.3,1)}
@media(min-width:700px){.dorsal-fondo{align-items:center}.dorsal-hoja{border-radius:24px}}
@keyframes dorsalSube{from{transform:translateY(30px);opacity:.6}to{transform:none;opacity:1}}
.dorsal-asa{width:42px;height:5px;border-radius:99px;background:#d9e1df;margin:0 auto 12px}
.dorsal-cab{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.dorsal-cab small{display:block;font-size:11px;font-weight:900;letter-spacing:.08em;color:#8a969b;text-transform:uppercase}
.dorsal-cab h3{margin:2px 0 0;font-size:21px;color:#0b1418;line-height:1.15}
.dorsal-cab p{margin:3px 0 0;color:#5b6b70;font-size:13px}
.dorsal-cerrar{border:0;background:#eef2f1;color:#0b1418;border-radius:99px;width:34px;height:34px;font-size:18px;cursor:pointer;flex:0 0 auto}
.dorsal-titulo{margin:16px 0 8px;font-size:11px;font-weight:900;letter-spacing:.08em;color:#8a969b;text-transform:uppercase}
.dorsal-sugeridos{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}
.dorsal-sug{border:0;border-radius:16px;background:#0b3d4a;color:#f2e6bd;font:800 24px 'Barlow Condensed',system-ui,sans-serif;height:58px;cursor:pointer}
.dorsal-sug:active,.dorsal-num:active{transform:scale(.96)}
.dorsal-grid{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:6px}
.dorsal-num{border:1px solid #d5e2df;background:#f7fbfa;color:#0b3d4a;border-radius:12px;height:42px;font:800 16px system-ui,sans-serif;cursor:pointer;padding:0}
.dorsal-num.ocupado{background:#eceeee;color:#a3acaf;border-color:#eceeee;cursor:not-allowed;text-decoration:line-through}
.dorsal-num.actual{background:#c6ac5c;color:#032f3b;border-color:#c6ac5c}
.dorsal-otro{display:flex;gap:8px;margin-top:14px}
.dorsal-otro input{flex:1;min-width:0;border:1px solid #cedbd8;border-radius:13px;padding:12px;font:inherit;font-size:16px}
.dorsal-otro button{border:0;border-radius:13px;background:#087d8e;color:#fff;font-weight:800;padding:0 16px;cursor:pointer}
.dorsal-motivo{margin:12px 0 0;padding:10px 12px;border-radius:12px;background:#fff4e5;color:#7a4a00;font-size:13.5px;font-weight:700;line-height:1.35}
.dorsal-aviso{min-height:18px;margin:10px 0 0;font-size:13px;color:#b13d34;font-weight:700}
.dorsal-quien{margin:0 0 8px;font-size:12.5px;color:#5b6b70;min-height:16px}
@media(max-width:380px){.dorsal-grid{grid-template-columns:repeat(6,minmax(0,1fr))}.dorsal-sug{font-size:21px;height:52px}}
`;
  document.head.appendChild(s);
}

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

export async function tableroDorsales({ rpc, organizationId, category }) {
  const t = await rpc('v2_jersey_board', { organization_id: organizationId, category: category || '' });
  return { taken: Array.isArray(t?.taken) ? t.taken : [], suggested: Array.isArray(t?.suggested) ? t.suggested : [] };
}

export function elegirDorsal({ rpc, organizationId, category, nombre = '', actual = '', motivo = '' }) {
  estilos();
  return new Promise(resolve => {
    const fondo = document.createElement('div');
    fondo.className = 'dorsal-fondo';
    fondo.innerHTML = `<div class="dorsal-hoja" role="dialog" aria-modal="true" aria-label="Elegir número">
      <div class="dorsal-asa"></div>
      <div class="dorsal-cab"><div><small>Número de camiseta</small><h3>${nombre ? `Número para ${esc(nombre)}` : 'Elige un número'}</h3><p>${category ? `Libres en ${esc(category)}` : 'Sin categoría: elige la categoría primero'}</p></div><button type="button" class="dorsal-cerrar" aria-label="Cerrar">&times;</button></div>
      ${motivo ? `<p class="dorsal-motivo">${esc(motivo)}</p>` : ''}
      <div class="dorsal-cuerpo"><p class="dorsal-quien">Buscando números libres…</p></div>
    </div>`;
    const cuerpo = fondo.querySelector('.dorsal-cuerpo');
    const listo = v => { document.removeEventListener('keydown', tecla); fondo.remove(); resolve(v); };
    const tecla = e => { if (e.key === 'Escape') listo(null); };
    document.addEventListener('keydown', tecla);
    fondo.addEventListener('click', e => { if (e.target === fondo) listo(null); });
    fondo.querySelector('.dorsal-cerrar').addEventListener('click', () => listo(null));
    document.body.appendChild(fondo);
    if (!category) return;

    tableroDorsales({ rpc, organizationId, category }).then(({ taken, suggested }) => {
      const dueno = new Map(taken.map(t => [String(t.number), t.name]));
      const act = String(actual || '').trim();
      const celdas = Array.from({ length: 99 }, (_, i) => {
        const n = String(i + 1), quien = dueno.get(n);
        const esActual = n === act;
        const ocupado = quien && !esActual;
        return `<button type="button" class="dorsal-num${ocupado ? ' ocupado' : ''}${esActual ? ' actual' : ''}" data-n="${n}"${ocupado ? ` aria-disabled="true" title="${esc(quien)}"` : ''}>${n}</button>`;
      }).join('');
      cuerpo.innerHTML = `
        ${suggested.length ? `<p class="dorsal-titulo">Sugeridos</p><div class="dorsal-sugeridos">${suggested.map(n => `<button type="button" class="dorsal-sug" data-n="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : ''}
        <p class="dorsal-titulo">Todos · ${taken.length} ocupados</p>
        <p class="dorsal-quien" aria-live="polite">Toca un número gris para ver quién lo trae.</p>
        <div class="dorsal-grid">${celdas}</div>
        <div class="dorsal-otro"><input type="text" inputmode="numeric" maxlength="3" placeholder="Otro (100 o más)"><button type="button">Usar</button></div>
        <p class="dorsal-aviso" aria-live="polite"></p>`;
      const quien = cuerpo.querySelector('.dorsal-quien'), aviso = cuerpo.querySelector('.dorsal-aviso');
      cuerpo.querySelectorAll('[data-n]').forEach(b => b.addEventListener('click', () => {
        const n = b.dataset.n;
        if (dueno.has(n) && n !== act) { quien.textContent = `El #${n} ya es de ${dueno.get(n)}.`; return; }
        listo(n);
      }));
      const otro = cuerpo.querySelector('.dorsal-otro input');
      const usar = () => {
        // "07" es el 7: sin ceros a la izquierda, igual que en el servidor.
        const crudo = otro.value.trim(), n = crudo.replace(/^0+/, '');
        if (!/^[0-9]{1,3}$/.test(crudo) || !n) { aviso.textContent = 'El número va del 1 al 999.'; return; }
        if (dueno.has(n) && n !== act) { aviso.textContent = `El #${n} ya es de ${dueno.get(n)}.`; return; }
        listo(n);
      };
      cuerpo.querySelector('.dorsal-otro button').addEventListener('click', usar);
      otro.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); usar(); } });
    }).catch(() => {
      cuerpo.innerHTML = '<p class="dorsal-aviso">No se pudieron revisar los números libres. Intenta de nuevo.</p>';
    });
  });
}
