/* Mi semana (08/11/2026, h65). Presidencia: "estilo gamification... que cada
   perfil vea una barrita de lo que le falta"; reconocimiento dentro de la app.

   · pintaMiSemana: tarjeta del Inicio. Barra, lo que falta (3 a la vista) y la
     racha de semanas al 100%. Al 100%: "Semana completa".
   · pintaEquipo: Presidencia y Director deportivo ven a cada quien, de menos
     a más avance, con "Destacado" para quien cerró la semana pasada al 100%.
   · resumenCampana: lo mismo, corto, para el aviso fijo de Mensajes.
   Nada se marca a mano: todo sale de listas, planeaciones, partidos, ideas y
   patrocinadores (v2_my_week / v2_team_week). */

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pendientes = d => (d?.sections || []).flatMap(s => (s.items || []).map(i => ({ ...i, seccion: s.title })));

function barra(pct, chica = false) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const tono = p >= 100 ? 'lleno' : p >= 60 ? 'medio' : 'bajo';
  return `<span class="ms-barra${chica ? ' ms-barra--chica' : ''}" data-tono="${tono}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}"><i style="width:${p}%"></i></span>`;
}
function racha(n) {
  n = Number(n || 0);
  return n > 0 ? `<span class="ms-racha">${n} semana${n === 1 ? '' : 's'} seguidas al 100%</span>` : '';
}

export function htmlMiSemana(d, { verTodo = false } = {}) {
  if (!d || !(d.sections || []).length) return '';
  const pct = Number(d.percent ?? 0), todo = pendientes(d), vista = verTodo ? todo : todo.slice(0, 3);
  const completa = pct >= 100;
  return `<header class="ms-cab"><div><h2>Mi semana</h2><small>${completa ? 'Todo al día. Así se hace.' : `Te ${todo.length === 1 ? 'falta 1 cosa' : `faltan ${todo.length} cosas`}`}</small></div>
      <strong class="ms-pct">${pct}%</strong></header>
    ${barra(pct)}
    ${completa ? '<p class="ms-medalla">Semana completa</p>' : ''}${racha(d.streak)}
    <ul class="ms-secciones">${d.sections.map(s => `<li><a href="${esc(s.href || '#')}"><span>${esc(s.title)}</span><b>${Math.min(s.done, s.total)}/${s.total}</b></a>${barra(s.total ? 100 * Math.min(s.done, s.total) / s.total : 0, true)}</li>`).join('')}</ul>
    ${vista.length ? `<ul class="ms-faltan">${vista.map(i => `<li><a href="${esc(i.href || '#')}">${esc(i.text)}<span aria-hidden="true">›</span></a></li>`).join('')}</ul>` : ''}
    ${!verTodo && todo.length > 3 ? `<button type="button" class="ms-vertodo" data-ms-vertodo>Ver las ${todo.length}</button>` : ''}`;
}

export async function pintaMiSemana({ rpc, ctx, box = document.getElementById('miSemana') }) {
  if (!box || !ctx) return null;
  let d = null;
  try { d = await rpc('v2_my_week', { organization_id: ctx.organization_id }); } catch { d = null; }
  if (!d || !(d.sections || []).length) { box.classList.add('hidden'); return d; }
  const pinta = verTodo => {
    box.innerHTML = htmlMiSemana(d, { verTodo });
    box.querySelector('[data-ms-vertodo]')?.addEventListener('click', () => pinta(true));
  };
  pinta(false);
  box.classList.remove('hidden');
  return d;
}

const ROL = { Formadores: 'Profe', Operaciones: 'Operaciones', Marketing: 'Marketing', Presidencia: 'Presidencia', Scouting: 'Scouting' };
function quien(p) {
  const r = p.roles || {};
  const partes = [];
  if (r.director) partes.push('Director deportivo');
  if (r.profe) partes.push('Profe');
  if (r.marketing) partes.push('Marketing');
  if (r.cobranza) partes.push('Cobranza');
  return partes.join(' · ') || ROL[p.role] || p.role || '';
}

export function htmlEquipo(t) {
  const gente = t?.people || [];
  if (!gente.length) return '';
  const destacados = gente.filter(p => Number(p.lastWeekPercent) >= 100);
  return `<div class="tos-panel-head"><div><h2>El equipo esta semana</h2><div class="tos-user-note">De menos a más avance. Toca a alguien para ver qué le falta.</div></div></div>
    ${destacados.length ? `<p class="ms-destacados"><b>Destacados de la semana pasada:</b> ${destacados.map(p => esc(p.name)).join(', ')}</p>` : ''}
    <div class="ms-equipo">${gente.map(p => {
      const pct = Number(p.percent ?? 0), items = pendientes(p);
      return `<details class="ms-persona"><summary><span class="ms-quien"><strong>${esc(p.name)}</strong><small>${esc(quien(p))}${Number(p.lastWeekPercent) >= 100 ? ' · <em>Destacado</em>' : ''}</small></span>
          <span class="ms-avance">${barra(pct, true)}<b>${pct}%</b></span></summary>
        ${racha(p.streak)}
        <ul class="ms-secciones">${(p.sections || []).map(s => `<li><span class="ms-fila"><span>${esc(s.title)}</span><b>${Math.min(s.done, s.total)}/${s.total}</b></span></li>`).join('')}</ul>
        ${items.length ? `<ul class="ms-faltan ms-faltan--quieto">${items.slice(0, 6).map(i => `<li>${esc(i.text)}</li>`).join('')}</ul>` : '<p class="ms-nada">Sin pendientes.</p>'}
      </details>`;
    }).join('')}</div>`;
}

export async function pintaEquipo({ rpc, ctx, box = document.getElementById('equipoSemana') }) {
  if (!box || !ctx) return null;
  let t = null;
  try { t = await rpc('v2_team_week', { organization_id: ctx.organization_id }); } catch { t = null; }
  const html = htmlEquipo(t);
  box.innerHTML = html;
  box.classList.toggle('hidden', !html);
  return t;
}

// Aviso fijo en Mensajes > Avisos: lo que te falta esta semana, en corto.
export function resumenCampana(d) {
  const todo = pendientes(d);
  if (!d || !(d.sections || []).length) return '';
  const pct = Number(d.percent ?? 0);
  return `<a class="ms-aviso-semana" href="/?vestidor#miSemana"><span><strong>Mi semana · ${pct}%</strong><small>${todo.length ? esc(todo[0].text) + (todo.length > 1 ? ` y ${todo.length - 1} más` : '') : 'Todo al día'}</small></span>${barra(pct, true)}</a>`;
}

/* "Activa tus avisos" (09/11/2026). Sólo 3 celulares tenían las notificaciones
   prendidas: los recordatorios de Mi semana no le llegaban a casi nadie. El
   shell ya sabe si este equipo puede recibirlas y aún no las activó (la fila
   oculta #tosBellSubscribeRow); aquí se ofrece en Inicio, con un toque. En el
   iPhone sin instalar no hay push: se dice cómo instalarla. */
export function estadoAvisos({ doc = document, win = window } = {}) {
  const fila = doc.getElementById('tosBellSubscribeRow');
  if (fila && !fila.classList.contains('hidden')) return 'ofrecer';
  const ua = String(win.navigator?.userAgent || '');
  const ios = /iPhone|iPad|iPod/.test(ua);
  const instalada = !!(win.navigator?.standalone || win.matchMedia?.('(display-mode: standalone)').matches);
  if (ios && !instalada && !('PushManager' in win)) return 'instalar';
  return 'nada';
}
export function pintaActivarAvisos({ box = document.getElementById('activaAvisos'), doc = document, win = window } = {}) {
  if (!box) return;
  const pinta = () => {
    const e = estadoAvisos({ doc, win });
    if (e === 'ofrecer') {
      box.innerHTML = `<span class="ms-avisos-txt"><strong>Activa tus avisos</strong><small>Te llegan al celular los recordatorios de tu semana y los mensajes del club.</small></span><button type="button" class="ms-avisos-btn" data-activa-avisos>Activar</button>`;
      box.querySelector('[data-activa-avisos]').addEventListener('click', () => {
        doc.getElementById('tosEnablePush')?.click();
        setTimeout(pinta, 4000);
      });
    } else if (e === 'instalar') {
      box.innerHTML = `<span class="ms-avisos-txt"><strong>Recibe tus avisos en el iPhone</strong><small>Toca Compartir y luego "Agregar a pantalla de inicio". Abre TannerOS desde ahí y activa los avisos.</small></span>`;
    } else box.innerHTML = '';
    box.classList.toggle('hidden', e === 'nada');
  };
  // El shell revisa el service worker sin bloquear: se pregunta un poco después.
  setTimeout(pinta, 1500);
}
