// Historial de búsqueda reciente por dispositivo (05/11/2026, Mich: "busqué a
// tal niño y no me acordé quién era... que se quede guardado localmente").
// Se guarda en localStorage de este aparato, nunca se manda al servidor.
// Uso: conectaBusquedaReciente($('search'), { storageKey: 'tanneros:recientes:jugadores' });
const MAX_DEFECTO = 8;
let estiloInyectado = false;

function inyectaEstilo() {
  if (estiloInyectado || document.getElementById('busquedaRecienteEstilo')) { estiloInyectado = true; return; }
  const s = document.createElement('style');
  s.id = 'busquedaRecienteEstilo';
  s.textContent = `
    .busqueda-reciente-box{position:fixed;z-index:9999;background:#fff;border:1px solid var(--line,#e3e2da);border-radius:12px;box-shadow:0 14px 34px rgba(7,25,30,.12);overflow:hidden;font:inherit}
    .busqueda-reciente-box.hidden{display:none}
    .busqueda-reciente-eyebrow{font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#728387);padding:9px 12px 4px}
    .busqueda-reciente-item{display:block;width:100%;text-align:left;border:0;background:none;padding:9px 12px;font:inherit;font-size:13.5px;color:inherit;cursor:pointer}
    .busqueda-reciente-item:hover,.busqueda-reciente-item:focus{background:#f6f6f2}
    .busqueda-reciente-borrar{display:block;width:100%;text-align:left;border:0;border-top:1px solid var(--line,#e3e2da);background:none;padding:8px 12px;font:inherit;font-size:12px;color:var(--muted,#728387);cursor:pointer}
    .busqueda-reciente-borrar:hover{color:inherit}`;
  document.head.appendChild(s);
  estiloInyectado = true;
}

export function conectaBusquedaReciente(input, { storageKey, max = MAX_DEFECTO } = {}) {
  if (!input || !storageKey) return;
  inyectaEstilo();

  const leer = () => { try { return JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { return []; } };
  const guardar = (lista) => { try { localStorage.setItem(storageKey, JSON.stringify(lista.slice(0, max))); } catch {} };
  const agrega = (q) => {
    const v = q.trim();
    if (v.length < 2) return;
    const lista = leer().filter((x) => x.toLocaleLowerCase('es-MX') !== v.toLocaleLowerCase('es-MX'));
    lista.unshift(v);
    guardar(lista);
  };

  const box = document.createElement('div');
  box.className = 'busqueda-reciente-box hidden';
  document.body.appendChild(box);

  function posiciona() {
    const r = input.getBoundingClientRect();
    box.style.left = `${r.left}px`;
    box.style.top = `${r.bottom + 4}px`;
    box.style.width = `${r.width}px`;
  }

  function pinta() {
    const lista = leer();
    if (!lista.length) { box.classList.add('hidden'); return; }
    box.innerHTML = `<div class="busqueda-reciente-eyebrow">Buscado antes</div>${lista.map((q) =>
      `<button type="button" class="busqueda-reciente-item">${q.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))}</button>`
    ).join('')}<button type="button" class="busqueda-reciente-borrar">Borrar historial</button>`;
    posiciona();
    box.classList.remove('hidden');
    box.querySelectorAll('.busqueda-reciente-item').forEach((b) => b.addEventListener('mousedown', (e) => {
      e.preventDefault();
      input.value = b.textContent;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      box.classList.add('hidden');
      input.focus();
    }));
    box.querySelector('.busqueda-reciente-borrar')?.addEventListener('mousedown', (e) => {
      e.preventDefault();
      guardar([]);
      box.classList.add('hidden');
    });
  }

  input.addEventListener('focus', () => { if (!input.value.trim()) pinta(); });
  input.addEventListener('input', () => { if (!input.value.trim()) pinta(); else box.classList.add('hidden'); });
  input.addEventListener('blur', () => { agrega(input.value); setTimeout(() => box.classList.add('hidden'), 150); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { agrega(input.value); box.classList.add('hidden'); } });
  window.addEventListener('resize', () => { if (!box.classList.contains('hidden')) posiciona(); });
  document.addEventListener('scroll', () => { if (!box.classList.contains('hidden')) posiciona(); }, true);
}
