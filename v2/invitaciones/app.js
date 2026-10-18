/* FAMILIAS EN EL PORTAL (Presidencia, 18/10/2026).
 *
 * "Quiero que la gente ya empiece a meterse." Medido: 72 tutores, 2 con
 * cuenta, 0 entraron en 30 días. El staff creaba cada cuenta a mano y dictaba
 * una contraseña temporal; casi nadie tiene correo.
 *
 * Aquí cada familia sale con su estado (sin invitar, invitada, ya entra) y un
 * botón que crea su liga personal y abre WhatsApp con el mensaje escrito. El
 * "envío rápido" va una por una: un toque por familia, sin buscarla.
 * A quien ya tiene cuenta se le manda la liga para elegir contraseña nueva.
 */
import { bootstrapProtectedShell, rpc, $, setShellHealth } from '/v2/shell.js';
import { mensajeDeInvitacion, ligaDeInvitacion, ligaWhatsApp, estadoDeFamilia, hijosEnTexto, conEspacios, primeraPalabra } from '/v2/invitaciones/invitaciones.js';

const boot = await bootstrapProtectedShell({ active: 'invitaciones', title: 'Familias en el portal' });
if (!boot) throw new Error('No access');
const ctx = boot.ctx, org = ctx.organization_id, club = ctx.organization_name || 'el club';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fecha = v => v ? new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(new Date(v)).replace('.', '') : '';
function msg(t = '', tipo = 'error') { const e = $('invMensaje'); e.textContent = t; e.dataset.type = tipo; e.classList.toggle('hidden', !t); }

const FILTROS = [
  { k: 'pendiente', t: 'Sin invitar' }, { k: 'invitada', t: 'Invitadas' },
  { k: 'activa', t: 'Ya entran' }, { k: 'cuenta', t: 'Con cuenta' }, { k: 'sintel', t: 'Sin teléfono' }, { k: 'todas', t: 'Todas' }];
let datos = { tutores: [] }, filtro = 'pendiente', busqueda = '', cola = [], enCola = 0;

const estado = t => estadoDeFamilia(t);
const visibles = () => datos.tutores.filter(t => (filtro === 'todas' || estado(t).k === filtro)
  && (!busqueda || `${t.nombre} ${(t.hijos || []).map(h => `${h.nombre} ${h.categoria}`).join(' ')}`.toLocaleLowerCase('es-MX').includes(busqueda)));

function pintaAvance() {
  const total = datos.total || 0, cuenta = datos.conCuenta || 0, pct = total ? Math.round(100 * cuenta / total) : 0;
  $('invAvance').innerHTML = `<b>${cuenta}<small> de ${total}</small></b><span>familias con cuenta</span>
    <i class="inv-barra-pct"><i style="width:${pct}%"></i></i>
    <small>${datos.invitadas || 0} invitadas sin entrar todavía · ${datos.entraron30 || 0} entraron este mes</small>`;
  const n = c => datos.tutores.filter(t => c === 'todas' || estado(t).k === c).length;
  $('invFiltros').innerHTML = FILTROS.map(f => `<button type="button" role="tab" data-filtro="${f.k}" aria-selected="${filtro === f.k}" class="${filtro === f.k ? 'activo' : ''}">${f.t}<i>${n(f.k)}</i></button>`).join('');
  const faltan = datos.tutores.filter(t => estado(t).k === 'pendiente');
  $('invRapido').classList.toggle('hidden', !faltan.length);
  $('invRapido').innerHTML = `<b>Invitar a las que faltan</b><span>${faltan.length} ${faltan.length === 1 ? 'familia' : 'familias'} · una por una, un toque cada una</span>`;
}

function tarjeta(t) {
  const e = estado(t);
  const accion = e.k === 'sintel' ? '<button type="button" class="sec" data-copiar="' + esc(t.id) + '">Copiar liga</button>'
    : t.tieneCuenta ? `<button type="button" class="sec" data-enviar="${esc(t.id)}">Mandar liga de contraseña</button>`
    : `<button type="button" data-enviar="${esc(t.id)}">${t.invitada ? 'Reenviar invitación' : 'Invitar por WhatsApp'}</button>`;
  const detalle = t.tieneCuenta
    ? `Usuario: ${esc(conEspacios(t.usuario || ''))}${t.ultimaEntrada ? ` · entró el ${fecha(t.ultimaEntrada)}` : ' · todavía no entra'}`
    : t.invitada ? `Invitada el ${fecha(t.invitada)}` : (t.telefono ? `WhatsApp ${esc(conEspacios(t.telefono))}` : 'Sin teléfono: captúralo en Jugadores');
  return `<article class="inv-fam" data-id="${esc(t.id)}">
    <div class="inv-fam-cab"><strong>${esc(t.nombre || 'Tutor')}</strong><span class="inv-estado ${e.k}">${e.t}</span></div>
    <p class="inv-hijos">${esc(hijosEnTexto(t.hijos))}</p>
    <p class="inv-det">${detalle}</p>
    <div class="inv-acciones">${accion}</div>
  </article>`;
}

function pintaLista() {
  const lista = visibles();
  $('invLista').innerHTML = lista.length ? lista.map(tarjeta).join('')
    : `<p class="inv-vacio"><b>${filtro === 'pendiente' ? 'Todas las familias ya tienen su invitación' : 'Nada por aquí'}</b>${filtro === 'pendiente' ? 'Revisa "Invitadas" para recordarle a quien no ha entrado.' : ''}</p>`;
}

/* Crear la liga y abrir WhatsApp. La ventana se abre en el mismo toque (antes
   de esperar a la base): si se abre después, el teléfono la bloquea. */
async function enviar(t, ventana) {
  try {
    const r = await rpc('v2_family_invite_link', { organization_id: org, guardian_id: t.id });
    const texto = mensajeDeInvitacion({ club, tutor: t.nombre, hijos: t.hijos, liga: ligaDeInvitacion(location.origin, r.token), usuario: r.usuario, purpose: r.purpose });
    const url = ligaWhatsApp(r.telefono || t.telefono, texto);
    if (ventana && !ventana.closed) ventana.location.href = url; else location.href = url;
    if (!t.tieneCuenta) { if (!t.invitada) datos.invitadas = (datos.invitadas || 0) + 1; t.invitada = new Date().toISOString(); }
    return true;
  } catch (e) {
    ventana?.close();
    msg(e.message || 'No se pudo crear la liga.');
    return false;
  }
}
async function copiar(t) {
  try {
    const r = await rpc('v2_family_invite_link', { organization_id: org, guardian_id: t.id });
    const texto = mensajeDeInvitacion({ club, tutor: t.nombre, hijos: t.hijos, liga: ligaDeInvitacion(location.origin, r.token), usuario: r.usuario, purpose: r.purpose });
    await navigator.clipboard.writeText(texto);
    msg(`Mensaje copiado para ${primeraPalabra(t.nombre)}. Pégalo donde le escribas.`, 'success');
  } catch (e) { msg(e.message || 'No se pudo copiar.'); }
}

/* Envío rápido: una familia a la vez, con el mensaje a la vista. */
function pintaEnvio() {
  const caja = $('invEnvio');
  if (enCola >= cola.length) {
    caja.innerHTML = `<div class="inv-envio-card"><p class="inv-eyebrow">Listo</p><h2 id="invEnvioTit">Ya les escribiste a ${cola.length} ${cola.length === 1 ? 'familia' : 'familias'}</h2>
      <p>Conforme entren, aquí cambian a "Ya entra". Si alguna no abre la liga en unos días, reenvíale desde "Invitadas".</p>
      <button type="button" data-cerrar>Terminar</button></div>`;
    return;
  }
  const t = cola[enCola];
  caja.innerHTML = `<div class="inv-envio-card">
    <div class="inv-envio-top"><span>${enCola + 1} de ${cola.length}</span><button type="button" class="inv-x" data-cerrar aria-label="Cerrar">&times;</button></div>
    <i class="inv-barra-pct"><i style="width:${Math.round(100 * enCola / cola.length)}%"></i></i>
    <h2 id="invEnvioTit">${esc(t.nombre)}</h2>
    <p class="inv-hijos">${esc(hijosEnTexto(t.hijos))}</p>
    <p class="inv-det">WhatsApp ${esc(conEspacios(t.telefono))}</p>
    <button type="button" class="inv-wa" data-envio>Enviar por WhatsApp</button>
    <button type="button" class="sec" data-saltar>Saltar a la siguiente</button>
  </div>`;
}
function abreEnvio() {
  cola = datos.tutores.filter(t => estado(t).k === 'pendiente'); enCola = 0;
  $('invEnvio').classList.remove('hidden'); document.body.classList.add('inv-modal');
  pintaEnvio();
}
function cierraEnvio() { $('invEnvio').classList.add('hidden'); document.body.classList.remove('inv-modal'); pintaAvance(); pintaLista(); }

$('invEnvio').addEventListener('click', async e => {
  if (e.target.closest('[data-cerrar]')) { cierraEnvio(); return; }
  if (e.target.closest('[data-saltar]')) { enCola++; pintaEnvio(); return; }
  const b = e.target.closest('[data-envio]');
  if (b) {
    const ventana = window.open('', '_blank');
    b.disabled = true; b.textContent = 'Abriendo WhatsApp…';
    if (await enviar(cola[enCola], ventana)) { enCola++; pintaEnvio(); }
    else { b.disabled = false; b.textContent = 'Enviar por WhatsApp'; }
  }
});
$('invRapido').addEventListener('click', abreEnvio);
$('invFiltros').addEventListener('click', e => { const b = e.target.closest('[data-filtro]'); if (b) { filtro = b.dataset.filtro; pintaAvance(); pintaLista(); } });
$('invBuscar').addEventListener('input', e => { busqueda = e.target.value.trim().toLocaleLowerCase('es-MX'); pintaLista(); });
$('invLista').addEventListener('click', async e => {
  const env = e.target.closest('[data-enviar]'), cop = e.target.closest('[data-copiar]');
  const t = datos.tutores.find(x => x.id === (env || cop)?.dataset[env ? 'enviar' : 'copiar']);
  if (!t) return;
  msg();
  if (cop) { await copiar(t); return; }
  const ventana = window.open('', '_blank');
  env.disabled = true;
  if (await enviar(t, ventana)) { pintaAvance(); pintaLista(); } else env.disabled = false;
});

try {
  datos = await rpc('v2_family_portal_overview', { organization_id: org }) || { tutores: [] };
  datos.tutores ||= [];
  if (!datos.tutores.some(t => estado(t).k === 'pendiente')) filtro = 'todas';
  setShellHealth({ state: 'ok', label: `${datos.conCuenta || 0} de ${datos.total || 0} con cuenta` });
  pintaAvance(); pintaLista();
} catch (e) {
  $('invDenied').classList.remove('hidden');
  setShellHealth({ state: 'attention', label: 'Sin permiso' });
}
