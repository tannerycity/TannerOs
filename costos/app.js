/* /costos: precios de la Academia y calculadora del primer pago (20/10/2026).
 * Pública, sin sesión y sin pedirle nada al servidor: los precios viven en
 * costos/tarifas.js y las cuentas en costos/calculo.js. Esta capa sólo pinta
 * y escucha. */
import { TARIFAS, aplicaPrecios } from '/costos/tarifas.js';
import { cotiza, dinero, textoCotizacion, ligaWhatsApp, fechaLarga, fechaCorta, mesDe, mesSiguiente, leeFecha } from '/costos/calculo.js';

const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
let T = TARIFAS, CAT = T.categorias;

const hoyISO = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const estado = { n: 0, hijos: [], fecha: hoyISO(), nueva: null };
const ajustaHijos = n => { estado.n = n; estado.hijos = Array.from({ length: n }, (_, i) => estado.hijos[i] || { categoria: null, modalidad: null }); };

/* ---------- Precios ---------- */
function tarjetaCategoria(c) {
  const filas = c.modalidades.map(m => `<tr><th scope="row">${esc(c.modalidades.length > 1 ? `Mensualidad, ${m.nombre}` : 'Mensualidad')}</th><td>${dinero(m.mensualidad)}</td></tr>`).join('');
  return `<article class="co-plan" data-plan="${c.clave}"><header><h3 class="cond">${esc(c.nombre)}</h3><small>${esc(c.edades)}</small></header>
    <table><tbody>${filas}<tr class="co-insc"><th scope="row">Inscripción</th><td>${dinero(c.inscripcion)}</td></tr></tbody></table>
    <p class="co-incluye">La inscripción incluye ${esc(T.incluyeInscripcion.toLowerCase())}.</p></article>`;
}
function tablaPaquetes() {
  const p = T.paquetes;
  return `<section class="co-sec" aria-labelledby="coPaquetesT"><p class="co-eyebrow">Hermanos</p><h2 id="coPaquetesT" class="co-h2 cond">Paquetes familiares</h2>
    ${p.confirmado ? '' : '<p class="co-aviso" id="coPaqAviso"><b>Por confirmar.</b> Son tarifas que el club ha manejado; la administración las valida al inscribir. Si tu combinación no aparece, solicita una cotización.</p>'}
    <table class="co-tabla"><thead><tr><th scope="col">Combinación</th><th scope="col">Mensualidad</th></tr></thead><tbody>
    ${p.lista.map(x => `<tr><th scope="row">${esc(x.nombre)}</th><td>${dinero(x.mensualidad)}${p.confirmado ? '' : ' <span class="co-pill">Por confirmar</span>'}</td></tr>`).join('')}
    </tbody></table></section>`;
}

/* ---------- Calculadora ---------- */
const opcion = (name, value, texto, sub, checked) => `<label class="co-op"><input type="radio" name="${name}" value="${value}"${checked ? ' checked' : ''}><span><b>${texto}</b>${sub ? `<small>${sub}</small>` : ''}</span></label>`;
function pintaHijos() {
  const box = $('coHijos');
  if (!estado.n) { box.innerHTML = ''; return; }
  box.innerHTML = estado.hijos.map((h, i) => {
    const baby = CAT.baby, tanner = CAT.tanner;
    const mods = h.categoria === 'baby' ? `<fieldset class="co-sub"><legend>¿Cuántos días por semana?</legend><div class="co-ops dos">${baby.modalidades.map(m => opcion(`coMod${i}`, m.clave, m.nombre, `${dinero(m.mensualidad)} al mes`, h.modalidad === m.clave)).join('')}</div></fieldset>` : '';
    return `<fieldset class="co-hijo" data-hijo="${i}"><legend>${estado.n > 1 ? `Hijo ${i + 1}` : 'Tu hijo'}</legend><div class="co-ops dos">
      ${opcion(`coCat${i}`, 'baby', baby.nombre, baby.edades, h.categoria === 'baby')}
      ${opcion(`coCat${i}`, 'tanner', tanner.nombre, `${tanner.edades} · ${dinero(tanner.modalidades[0].mensualidad)} al mes`, h.categoria === 'tanner')}
    </div>${mods}</fieldset>`;
  }).join('');
}
function calculadora() {
  const nums = Array.from({ length: T.maxHijos }, (_, i) => i + 1);
  return `<section class="co-sec co-calc" id="calculadora" aria-labelledby="coCalcT"><p class="co-eyebrow">Calculadora</p><h2 id="coCalcT" class="co-h2 cond">¿Cuánto pagarías?</h2>
    <p class="co-sub-t">Elige tus opciones y el total se calcula solo. No necesitas registrarte.</p>
    <form id="coForm" novalidate>
      <fieldset class="co-paso"><legend><i>1</i>¿Cuántos hijos quieres inscribir?</legend><div class="co-ops tres">${nums.map(n => opcion('coN', n, n === 1 ? '1 hijo' : `${n} hijos`, '', estado.n === n)).join('')}</div></fieldset>
      <fieldset class="co-paso" id="coPaso2"><legend><i>2</i>Elige la categoría</legend><div id="coHijos"><p class="co-pista">Primero dinos cuántos hijos.</p></div></fieldset>
      <fieldset class="co-paso"><legend><i>3</i>¿Es de nuevo ingreso?</legend><div class="co-ops dos">
        ${opcion('coNueva', 'si', 'Sí, nuevo ingreso', `Primer mes proporcional + inscripción de ${dinero(CAT.tanner.inscripcion)} por alumno`, estado.nueva === true)}
        ${opcion('coNueva', 'no', 'No, ya está inscrito', 'Mensualidad completa', estado.nueva === false)}
      </div></fieldset>
      <div class="co-paso${estado.nueva === true ? '' : ' hidden'}" id="coPasoFecha"><label class="co-fecha" for="coFecha"><span class="co-leyenda"><i>4</i>Fecha de ingreso</span><input id="coFecha" type="date" value="${estado.fecha}" required></label><p class="co-pista" id="coFechaTxt"></p></div>
    </form>
    <div id="coResultado" class="co-resultado" aria-live="polite"></div>
  </section>`;
}
function pintaResultado() {
  const box = $('coResultado');
  const f = leeFecha(estado.fecha);
  $('coFechaTxt').textContent = f ? `Ingreso: ${fechaLarga(f)}` : '';
  // La fecha sólo importa en nuevo ingreso: quien ya está inscrito paga el mes completo.
  $('coPasoFecha').classList.toggle('hidden', estado.nueva !== true);
  const c = cotiza({ hijos: estado.hijos, fechaIngreso: estado.fecha, nuevaInscripcion: estado.nueva ?? undefined }, T);
  if (c.error) {
    // Sin todas las respuestas no hay números: nada de totales de ejemplo.
    box.innerHTML = `<div class="co-pendiente"><b>Tu cotización aparece aquí</b><span>${esc(c.error)}</span></div>`;
    return;
  }
  const filas = [];
  filas.push(c.fecha ? [`Mensualidad de ${mesDe(c.fecha)}`, c.completo ? 'Mes completo' : `Proporcional: ${c.semanas} de ${c.base} semanas`, dinero(c.proporcionalIndividual)]
    : ['Mensualidad', 'Completa, la que acordaste al inscribirte', dinero(c.proporcionalIndividual)]);
  if (c.nuevaInscripcion) filas.push([`Inscripción`, `${c.detalle.length === 1 ? '1 alumno' : `${c.detalle.length} alumnos`} · incluye ${T.incluyeInscripcion.toLowerCase()}`, dinero(c.inscripcion)]);
  if (c.paquete.estado === 'aplica') filas.push(['Ajuste familiar', c.paquete.paquete.nombre, dinero(c.ajusteFamiliar)]);
  const paq = c.paquete.estado === 'referencia'
    ? `<p class="co-nota-paq" data-paquete="referencia"><b>Paquete familiar ${esc(c.paquete.paquete.nombre)}: ${dinero(c.paquete.paquete.mensualidad)} al mes, por confirmar.</b> No está sumado: la administración te confirma si aplica.</p>`
    : c.paquete.estado === 'sin_tarifa'
      ? `<p class="co-nota-paq" data-paquete="sin_tarifa"><b>Paquete familiar: solicitar cotización.</b> Esta combinación no tiene paquete publicado; abajo está el precio sin paquete.</p>` : '';
  box.innerHTML = `<article class="co-cotiza"><header><p class="co-eyebrow">Tu cotización Tannery City</p><p class="co-fecha-r">${c.fecha ? `Nuevo ingreso · fecha de ingreso: <b>${fechaCorta(c.fecha)}</b>` : '<b>Alumno ya inscrito</b>'}</p></header>
    <ul class="co-hijos-r">${c.detalle.map(d => `<li><span>${estado.n > 1 ? `Hijo ${d.n}: ` : ''}${esc(d.categoria)}${d.modalidad ? `, ${esc(d.modalidad)}` : ''}</span><b>${dinero(d.mensualidad)}/mes</b></li>`).join('')}</ul>
    ${paq}
    <table class="co-desglose"><thead><tr><th scope="col">Concepto</th><th scope="col">Importe</th></tr></thead><tbody>
    ${filas.map(([a, b, v]) => `<tr><th scope="row">${esc(a)}<small>${esc(b)}</small></th><td>${v}</td></tr>`).join('')}
    </tbody><tfoot><tr><th scope="row">${c.fecha ? 'Total del primer pago' : 'Total a pagar cada mes'}</th><td id="coTotal">${dinero(c.primerPago)}</td></tr></tfoot></table>
    ${c.fecha ? `<p class="co-regular">Tu mensualidad regular a partir de ${esc(mesSiguiente(c.fecha))}: <b id="coRegular">${dinero(c.mensualidadRegular)} ${T.moneda}</b></p>` : ''}
    <p class="co-importante" data-importante>${esc(T.notaProporcional)}</p>
    <p class="co-nota">${c.estimacion ? '<b>Estimación.</b> ' : ''}${esc(T.nota)}</p>
    <div class="co-acciones"><button type="button" class="co-btn" id="coCopiar">Copiar mi cotización</button><a class="co-btn wa" id="coWhats" href="${esc(ligaWhatsApp(textoCotizacion(c, T), T, c.detalle.length))}" target="_blank" rel="noopener">Solicitar información por WhatsApp</a></div>
    <p class="co-copiado hidden" id="coCopiado" role="status">Cotización copiada.</p>
  </article>`;
  $('coCopiar').addEventListener('click', () => copia(textoCotizacion(c, T)));
}
async function copia(texto) {
  let ok = false;
  try { await navigator.clipboard.writeText(texto); ok = true; } catch (_) {
    // Navegadores sin portapapeles moderno: el camino viejo.
    const ta = Object.assign(document.createElement('textarea'), { value: texto });
    ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.append(ta); ta.select();
    try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
    ta.remove();
  }
  const aviso = $('coCopiado');
  aviso.textContent = ok ? 'Cotización copiada. Pégala donde quieras.' : 'No se pudo copiar. Mantén presionado el texto para copiarlo.';
  aviso.classList.remove('hidden');
  clearTimeout(copia.t); copia.t = setTimeout(() => aviso.classList.add('hidden'), 4000);
}

/* ---------- Página ---------- */
function pinta() {
  $('contenido').innerHTML = `<header class="co-hero"><a class="co-volver" href="/">‹ Inicio</a>
      <img class="co-escudo" src="/brand/crest-gold.png" alt="" width="84" height="84">
      <p class="co-club">TANNERY CITY F.C.</p><h1 class="co-titulo cond">Costos <em>de la Academia</em></h1>
      <p class="co-bajada">Consulta las mensualidades y calcula cuánto pagarás por tu inscripción.</p>
      <a class="co-cta cond" href="#calculadora">Calcular mi pago</a></header>
    <main class="co-main">
      <section class="co-sec" aria-labelledby="coPreciosT"><p class="co-eyebrow">Mensualidades</p><h2 id="coPreciosT" class="co-h2 cond">Precios</h2>
        <div class="co-planes">${Object.values(CAT).map(tarjetaCategoria).join('')}</div>
        <p class="co-importante claro" id="coImportante">${esc(T.notaProporcional)}</p></section>
      ${tablaPaquetes()}
      ${calculadora()}
      <p class="co-pie">¿Dudas? Escríbenos por WhatsApp al <a href="https://wa.me/${T.whatsapp.numero}" target="_blank" rel="noopener">${T.whatsapp.visible}</a>. <a href="/registro/">Inscribe a tu hijo</a></p>
    </main>`;
  pintaHijos(); pintaResultado();
  const form = $('coForm');
  form.addEventListener('change', e => {
    const t = e.target, name = t.name || '';
    if (name === 'coN') { ajustaHijos(Number(t.value)); pintaHijos(); }
    else if (name.startsWith('coCat')) {
      const h = estado.hijos[Number(name.slice(5))];
      h.categoria = t.value; h.modalidad = t.value === 'baby' ? h.modalidad : null;
      pintaHijos();
      // Al elegir Baby, el foco va a los días: el siguiente paso obvio.
      if (t.value === 'baby') form.querySelector(`[name="coMod${name.slice(5)}"]`)?.focus();
      else form.querySelector(`[name="${name}"][value="${t.value}"]`)?.focus();
    }
    else if (name.startsWith('coMod')) estado.hijos[Number(name.slice(5))].modalidad = t.value;
    else if (name === 'coNueva') estado.nueva = t.value === 'si';
    pintaResultado();
  });
  // La fecha recalcula al momento: nunca queda un importe de la fecha anterior.
  $('coFecha').addEventListener('input', e => { estado.fecha = e.target.value; pintaResultado(); });
  $('cargando').classList.add('hidden'); $('contenido').classList.remove('hidden');
}
/* Los precios que Presidencia edita en Club › Costos públicos (h22). Una
   sola llamada, pública y sin sesión; si tarda o falla, se quedan los de
   costos/tarifas.js y la página sale igual. */
const SUPABASE = 'https://pacnegivzgxpanphrnwp.supabase.co';
const LLAVE_PUBLICA = 'sb_publishable_XG-mi_NVeit5BSco9t9AaQ_pk8CU0QG';
async function preciosGuardados() {
  const corta = new AbortController(), t = setTimeout(() => corta.abort(), 3500);
  try {
    const r = await fetch(`${SUPABASE}/rest/v1/rpc/v2_public_costos`, { method: 'POST', signal: corta.signal,
      headers: { 'content-type': 'application/json', apikey: LLAVE_PUBLICA }, body: JSON.stringify({ club_key: 'tannery-city-fc' }) });
    return r.ok ? await r.json() : null;
  } catch (_) { return null; } finally { clearTimeout(t); }
}
T = aplicaPrecios(TARIFAS, await preciosGuardados()); CAT = T.categorias;
pinta();
