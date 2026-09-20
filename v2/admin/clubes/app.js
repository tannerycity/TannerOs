import {bootstrapProtectedShell,rpc,$,setShellHealth} from '/v2/shell.js';
import {supabase} from '/v2/shell.js';

// Alta de un club nuevo.
//
// Hasta el 20 de septiembre de 2026 esto no existía: no había una sola función
// en la base que creara una organización. Tannery City se creó a mano en la
// migración inicial y nunca se dio de alta un segundo club.
//
// El alta crea lo mínimo atómico —organización, suscripción, política de cobro
// y categorías— porque eso es lo que, si sale a medias, deja un club roto. La
// marca, los documentos, el catálogo y el primer usuario se cargan después con
// las pantallas de siempre, y esta pantalla los enumera al terminar para que
// nadie crea que ya quedó.
//
// Mientras la migración de supabase/propuestas/F1_alta_de_un_club.sql no esté
// aplicada, las RPC no existen y la pantalla lo dice con todas sus letras en
// vez de reventar.
const boot = await bootstrapProtectedShell({active:'admin', title:'Clubes'});
if (!boot) throw new Error('No access');

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ver = (id, on) => $(id).classList.toggle('hidden', !on);
function msg(texto = '', tipo = 'error') {
  const el = $('clubesMessage');
  el.textContent = texto; el.dataset.type = tipo; el.classList.toggle('hidden', !texto);
}

// Una RPC que no existe todavía se distingue de una que falló: PostgREST
// devuelve 404 con PGRST202. No es lo mismo «no tienes permiso» que «nadie ha
// corrido la migración», y decirlo mal manda a alguien a buscar donde no es.
const faltaLaMigracion = e =>
  e?.code === 'PGRST202' || /could not find the function|does not exist/i.test(e?.message || '');

function sinMigracion(e) {
  ver('clubesSinMigracion', true);
  $('clubesErrorDetalle').innerHTML = `<code>${esc(e?.message || e)}</code>`;
  setShellHealth({state:'attention', label:'Falta la migración'});
}

const money = n => new Intl.NumberFormat('es-MX', {style:'currency', currency:'MXN', maximumFractionDigits:0}).format(Number(n) || 0);
const fecha = v => v ? new Intl.DateTimeFormat('es-MX', {day:'numeric', month:'short', year:'numeric'}).format(new Date(v)) : '—';

function pintaLista(clubes) {
  const caja = $('clubesTabla');
  caja.innerHTML = clubes.map(c => `
    <article class="club-row">
      <div><strong>${esc(c.name)}</strong><small>/${esc(c.slug)} · desde ${esc(fecha(c.creadoEl))}</small></div>
      <div class="club-datos">
        <span><b>${esc(c.jugadores)}</b> jugadores</span>
        <span><b>${esc(c.usuarios)}</b> usuarios</span>
        <span><b>${esc(c.categorias)}</b> categorías</span>
      </div>
      <span class="club-plan" data-estado="${esc(c.planEstado || 'sin')}">${esc(c.plan || 'sin plan')}</span>
    </article>`).join('') || '<p class="clubes-muted">Todavía no hay ningún club.</p>';
  setShellHealth({state:'ok', label:`${clubes.length} club${clubes.length === 1 ? '' : 'es'}`});
}

async function carga() {
  try {
    const admin = await rpc('v2_am_i_platform_admin');
    if (!admin) { ver('clubesDenied', true); setShellHealth({state:'attention', label:'Sin permiso'}); return; }
  } catch (e) {
    if (faltaLaMigracion(e)) { sinMigracion(e); return; }
    throw e;
  }
  ver('clubesLista', true);
  pintaLista(await rpc('v2_platform_organizations') || []);
  await pintaPlanes();
}

// Los planes se leen de la propia lista de clubes cuando se puede; si no, se
// deja que la base elija el único activo, que es lo que hace la función.
async function pintaPlanes() {
  const sel = $('cPlan');
  sel.innerHTML = '<option value="">El plan activo que haya</option>';
  try {
    const {data} = await supabase.from('plans').select('code,name,active').eq('active', true);
    for (const p of data || []) {
      const o = document.createElement('option');
      o.value = p.code; o.textContent = `${p.name} (${p.code})`;
      sel.appendChild(o);
    }
  } catch (_) { /* Sin lectura directa de planes, la base decide. */ }
}

const soloSlug = v => String(v || '').toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);

$('cName').addEventListener('input', () => {
  if (!$('cSlug').dataset.tocado) $('cSlug').value = soloSlug($('cName').value);
});
$('cSlug').addEventListener('input', () => { $('cSlug').dataset.tocado = '1'; });

$('clubesNuevo').addEventListener('click', () => { ver('clubesForm', true); $('cName').focus(); });
$('cCancel').addEventListener('click', () => { ver('clubesForm', false); msg(); });

let confirmado = false;

$('altaForm').addEventListener('submit', async e => {
  e.preventDefault();
  msg();
  const datos = {
    slug: soloSlug($('cSlug').value),
    name: $('cName').value.trim(),
    legal_name: $('cLegal').value.trim() || null,
    plan_code: $('cPlan').value || null,
    timezone: $('cTz').value.trim() || 'America/Mexico_City',
    currency: ($('cCurrency').value.trim() || 'MXN').toUpperCase(),
    charge_day: Number($('cCharge').value) || 1,
    due_day: Number($('cDue').value) || 5,
    late_fee: Number($('cLate').value) || 0,
    categories: $('cCats').value.split(',').map(s => s.trim()).filter(Boolean),
  };
  if (datos.name.length < 2) { msg('El club necesita un nombre.'); return; }
  if (!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(datos.slug)) {
    msg('El identificador lleva entre 3 y 50 caracteres: minúsculas, números y guiones.'); return;
  }

  // Dos pasos a propósito. El identificador sale en las direcciones públicas y
  // no se cambia después: vale la pena leerlo una vez más antes de crearlo.
  if (!confirmado) {
    confirmado = true;
    msg(`Se va a crear «${datos.name}» con el identificador /${datos.slug}, cobro el día `
      + `${datos.charge_day}, vencimiento el ${datos.due_day}, recargo de ${money(datos.late_fee)} y `
      + `${datos.categories.length} categoría${datos.categories.length === 1 ? '' : 's'}. `
      + 'El identificador no se cambia después. Vuelve a apretar para crearlo.', 'warning');
    $('cSubmit').textContent = 'Crear el club';
    return;
  }

  $('cSubmit').disabled = true; $('cSubmit').textContent = 'Creando…';
  try {
    const r = await rpc('v2_provision_organization', datos);
    ver('clubesForm', false);
    ver('clubesListo', true);
    $('listoTitulo').textContent = `${r.name} quedó creado`;
    $('listoDatos').innerHTML =
      `<code>id ${esc(r.organizationId)}</code><code>/${esc(r.slug)}</code>`
      + `<code>plan ${esc(r.plan)}</code><code>llave pública ${esc(r.publicKey)}</code>`;
    $('listoPendientes').innerHTML = (r.faltaPorHacer || []).map(p => `<li>${esc(p)}</li>`).join('');
    pintaLista(await rpc('v2_platform_organizations') || []);
    $('clubesListo').scrollIntoView({behavior:'smooth', block:'start'});
  } catch (err) {
    msg(faltaLaMigracion(err)
      ? 'La migración todavía no está aplicada: supabase/propuestas/F1_alta_de_un_club.sql'
      : (err.message || 'No se pudo crear el club.'));
  } finally {
    confirmado = false;
    $('cSubmit').disabled = false; $('cSubmit').textContent = 'Revisar antes de crear';
  }
});

await carga();
