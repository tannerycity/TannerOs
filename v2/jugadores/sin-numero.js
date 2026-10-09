/* Tanners sin número, resueltos de un jalón (Presidencia, 09/10/2026).
 *
 * Había 17 Tanners activos sin número y la única forma de verlos era abrir
 * ficha por ficha. Aquí sale un aviso arriba de la lista ("17 Tanners sin
 * número · Asignar") que abre una hoja con todos, por categoría y con su cara.
 * Cada uno trae los libres más bajos de SU categoría en chips: un toque y queda.
 *
 * Al asignar uno, ese número desaparece de los chips de los demás de la misma
 * categoría sin volver a preguntarle al servidor. Si alguien más lo tomó en ese
 * momento, el servidor lo rechaza (v2_assign_jersey), se avisa en la fila y se
 * vuelve a leer el tablero de esa categoría.
 */
import { elegirDorsal, tableroDorsales, libresDe, pintaChipsDorsal, estilos } from '/v2/dorsal.js';

const ORDEN = ['Mini Baby Tanner', 'Baby Tanner', 'T8', 'T10', 'T12'];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const nombre = p => [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || 'Sin nombre';
const iniciales = p => nombre(p).split(/\s+/).slice(0, 2).map(x => x[0] || '').join('').toUpperCase();
const sinNumero = p => (p.status_value ?? p.status) === 'active' && !String(p.jersey_number ?? '').trim();

let estilosListos = false;
function estilosPropios() {
  estilos();
  if (estilosListos) return; estilosListos = true;
  const s = document.createElement('style');
  s.textContent = `
.sinnum-banner{display:flex;width:100%;align-items:center;justify-content:space-between;gap:10px;margin:0 0 12px;padding:13px 16px;border:1px solid #eedca6;border-radius:16px;background:#fffaf0;color:#765719;font:inherit;font-weight:800;font-size:14px;cursor:pointer;text-align:left}
.sinnum-banner b{background:#765719;color:#fff;border-radius:999px;padding:6px 12px;font-size:13px;white-space:nowrap}
.sinnum-cat{margin:16px 0 6px;font-size:11px;font-weight:900;letter-spacing:.08em;color:#8a969b;text-transform:uppercase}
.sinnum-fila{display:grid;grid-template-columns:44px 1fr;gap:4px 12px;align-items:center;padding:10px 0;border-bottom:1px solid #eef1f0}
.sinnum-cara{grid-row:span 2;width:44px;height:44px;border-radius:50%;overflow:hidden;background:#e2ecec;color:#2e5660;display:grid;place-items:center;font-weight:800;font-size:15px}
.sinnum-cara img{width:100%;height:100%;object-fit:cover}
.sinnum-fila strong{font-size:15px;color:#0b1418}
.sinnum-fila .dorsal-chips{margin:0}
.sinnum-fila.listo strong::after{content:attr(data-num);margin-left:8px;color:#159c4c;font-weight:900}
.sinnum-aviso{grid-column:2;margin:0;font-size:12.5px;font-weight:700;color:#b13d34}
.sinnum-ok{grid-column:2;margin:0;font-size:13px;font-weight:700;color:#159c4c}
.sinnum-vacio{padding:18px 0;text-align:center;color:#5b6b70;font-weight:700}`;
  document.head.appendChild(s);
}

/* `jugadores()` devuelve la lista viva de la pantalla; `alTerminar()` la
   recarga cuando se cierra la hoja con algún cambio. */
export function montaSinNumero({ contenedor, rpc, organizationId, jugadores, puedeEscribir, alTerminar }) {
  estilosPropios();
  function refresca() {
    if (!contenedor) return;
    const n = puedeEscribir ? jugadores().filter(sinNumero).length : 0;
    contenedor.hidden = n === 0;
    contenedor.innerHTML = n ? `<button type="button" class="sinnum-banner" id="abrirSinNumero">`
      + `<span>${n} ${n === 1 ? 'Tanner sin número' : 'Tanners sin número'}</span><b>Asignar</b></button>` : '';
    contenedor.querySelector('#abrirSinNumero')?.addEventListener('click', abre);
  }

  async function abre() {
    const pendientes = jugadores().filter(sinNumero);
    let huboCambios = false;
    const fondo = document.createElement('div');
    fondo.className = 'dorsal-fondo';
    fondo.innerHTML = `<div class="dorsal-hoja" role="dialog" aria-modal="true" aria-label="Asignar números">
      <div class="dorsal-asa"></div>
      <div class="dorsal-cab"><div><small>Números de camiseta</small><h3>Tanners sin número</h3>
      <p>Toca un número y queda en su expediente.</p></div>
      <button type="button" class="dorsal-cerrar" aria-label="Cerrar">&times;</button></div>
      <div class="sinnum-cuerpo"><p class="dorsal-quien">Buscando números libres…</p></div></div>`;
    const cuerpo = fondo.querySelector('.sinnum-cuerpo');
    const cierra = () => { document.removeEventListener('keydown', tecla); fondo.remove(); if (huboCambios) alTerminar?.(); };
    const tecla = e => { if (e.key === 'Escape' && !document.querySelector('.dorsal-fondo ~ .dorsal-fondo')) cierra(); };
    document.addEventListener('keydown', tecla);
    fondo.addEventListener('click', e => { if (e.target === fondo) cierra(); });
    fondo.querySelector('.dorsal-cerrar').addEventListener('click', cierra);
    document.body.appendChild(fondo);

    const grupos = {};
    pendientes.forEach(p => { (grupos[p.category || ''] ||= []).push(p); });
    const cats = Object.keys(grupos).sort((a, b) => {
      const ia = a ? ORDEN.indexOf(a) : 999, ib = b ? ORDEN.indexOf(b) : 999;
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });
    const tableros = {};
    await Promise.all(cats.filter(Boolean).map(async c => {
      try { tableros[c] = (await tableroDorsales({ rpc, organizationId, category: c })).taken; } catch { tableros[c] = null; }
    }));

    cuerpo.innerHTML = cats.map(c => `<p class="sinnum-cat">${esc(c || 'Sin categoría')} · ${grupos[c].length}</p>`
      + grupos[c].sort((a, b) => nombre(a).localeCompare(nombre(b), 'es-MX')).map(p => `
        <div class="sinnum-fila" data-id="${esc(p.id)}">
          <div class="sinnum-cara">${p._photoUrl ? `<img alt="" src="${esc(p._photoUrl)}">` : esc(iniciales(p))}</div>
          <strong>${esc(nombre(p))}</strong>
          <div class="sinnum-chips"></div>
        </div>`).join('')).join('') || '<p class="sinnum-vacio">Todos tienen número.</p>';

    const fila = id => cuerpo.querySelector(`.sinnum-fila[data-id="${CSS.escape(id)}"]`);
    function pintaCategoria(c) {
      for (const p of grupos[c]) {
        const f = fila(p.id); if (!f || f.classList.contains('listo')) continue;
        const box = f.querySelector('.sinnum-chips');
        if (!c) { box.innerHTML = '<p class="sinnum-aviso">Asígnale categoría primero: los números van por categoría.</p>'; continue; }
        if (!tableros[c]) { box.innerHTML = '<p class="sinnum-aviso">No se pudieron leer los libres de esta categoría.</p>'; continue; }
        pintaChipsDorsal(box, { libres: libresDe(tableros[c], 4),
          onPick: n => asigna(p, c, n),
          onOtro: async () => { const n = await elegirDorsal({ rpc, organizationId, category: c, nombre: (p.first_name || '').split(/\s+/)[0] }); if (n) asigna(p, c, n); } });
      }
    }
    async function asigna(p, c, n) {
      const f = fila(p.id); const box = f.querySelector('.sinnum-chips');
      box.querySelectorAll('button').forEach(b => { b.disabled = true; });
      try {
        await rpc('v2_assign_jersey', { organization_id: organizationId, player_id: p.id, number: n });
        p.jersey_number = n; huboCambios = true;
        tableros[c] = [...tableros[c], { number: n, name: nombre(p) }];
        f.classList.add('listo'); f.dataset.num = `#${n}`;
        f.querySelector('strong').dataset.num = `#${n}`;
        box.innerHTML = `<p class="sinnum-ok">Listo: #${esc(n)}</p>`;
        pintaCategoria(c); refresca();
      } catch (e) {
        try { tableros[c] = (await tableroDorsales({ rpc, organizationId, category: c })).taken; } catch { /* se queda el anterior */ }
        pintaCategoria(c);
        box.insertAdjacentHTML('beforeend', `<p class="sinnum-aviso">${esc(e?.message || 'No se pudo asignar.')}</p>`);
      }
    }
    cats.forEach(pintaCategoria);
  }

  refresca();
  return { refresca, abre };
}
