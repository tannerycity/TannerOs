/* Club › Costos públicos, estilo Apple (20/10/2026).
 *
 * Presidencia: "simplifica el user experience… que cualquier persona que
 * tiene una academia ponga 'vamos a cobrar esto' bien fácil; estilo Apple;
 * que no haya falla en las edades: un carrusel para elegir".
 *
 * Así se usa:
 *   · Una lista como Ajustes del iPhone: cada categoría en un renglón
 *     ("Tanners · 6 a 12 años · 3 días · $800") y "Agregar categoría".
 *   · Tocar un renglón abre una hoja: nombre, edades en dos carruseles
 *     (de / a), inscripción y opciones (días en carrusel + precio al mes).
 *     El precio por clase sale solo. "Listo" la cierra.
 *   · Hermanos: paquetes con botones − / + por categoría; el nombre se arma
 *     solo ("2 Tanners"). Un interruptor dice si ya están confirmados.
 *   · Un solo "Guardar cambios" al final.
 * Nada de teclear edades ni nombres de paquetes: no hay forma de escribirlos mal.
 */
const EDAD_MIN = 3, EDAD_MAX = 18, DIAS = [1, 2, 3, 4, 5, 6, 7];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const peso = n => new Intl.NumberFormat('es-MX', { style:'currency', currency:'MXN', maximumFractionDigits:0 }).format(Number(n) || 0);
const soloDigitos = v => String(v ?? '').replace(/\D/g, '').slice(0, 6);
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// "De 6 a 12 años" y {edadMin, edadMax}, de ida y vuelta. Lo guardado como texto se lee de vuelta.
export function leeEdades(txt) {
  const n = String(txt || '').match(/\d+/g)?.map(Number) || [];
  const a = Math.min(Math.max(n[0] ?? 6, EDAD_MIN), EDAD_MAX), b = Math.min(Math.max(n[1] ?? n[0] ?? 12, a), EDAD_MAX);
  return { edadMin: a, edadMax: b };
}
export const textoEdades = (a, b) => (a === b ? `${a} años` : `De ${a} a ${b} años`);
export const porClaseDe = (dias, mensualidad) => (dias > 0 && String(mensualidad).trim() !== '' ? Math.round(Number(mensualidad) / (dias * 4)) : null);
// "Tanners" → "Tanner", "Porteros" → "Portero", "Mayores" → "Mayor" cuando es uno.
export function singular(nombre) {
  const t = String(nombre || '');
  if (/[rlndz]es$/i.test(t)) return t.slice(0, -2);
  return /s$/i.test(t) ? t.slice(0, -1) : t;
}
// El nombre del paquete sale de lo que lleva: "2 Tanners + 1 Baby Tanner".
export function nombrePaquete(cantidades, categorias) {
  return categorias.map((c, i) => [Number(cantidades[i] || 0), c.nombre || `Categoría ${i + 1}`]).filter(([n]) => n > 0)
    .map(([n, nombre]) => `${n} ${n === 1 ? singular(nombre) : nombre}`).join(' + ');
}
const resumenCat = c => [textoEdades(c.edadMin, c.edadMax),
  c.opciones.length === 1 ? `${plural(c.opciones[0].dias, 'día', 'días')} · ${peso(c.opciones[0].mensualidad)}` : `${c.opciones.length} opciones · desde ${peso(Math.min(...c.opciones.map(o => Number(o.mensualidad) || 0)))}`].join(' · ');

export function montaCostos({ rpc, org, canWrite, $ }) {
  let estado = null, sucio = false, hoja = null;
  const msg = (t = '', tipo = 'error') => { const el = $('costosMessage'); el.textContent = t; el.dataset.type = tipo; el.classList.toggle('hidden', !t); };
  const marca = () => { sucio = true; $('saveCostos').disabled = !canWrite; $('saveCostos').textContent = 'Guardar cambios'; msg(); };

  /* ---------- La lista ---------- */
  function pinta() {
    const e = estado;
    $('costosCats').innerHTML = e.categorias.map((c, i) => `<button type="button" class="ap-fila" data-abre-cat="${i}">
        <span class="ap-fila-txt"><b>${esc(c.nombre)}</b><small>${esc(resumenCat(c))}</small></span><span class="ap-chev" aria-hidden="true">›</span></button>`).join('')
      + (canWrite ? '<button type="button" class="ap-fila ap-agrega" id="costosAddCat"><span class="ap-mas" aria-hidden="true">+</span><span>Agregar categoría</span></button>' : '');
    $('costosPaqs').innerHTML = (e.paquetes.lista.map((x, k) => `<button type="button" class="ap-fila" data-abre-paq="${k}">
        <span class="ap-fila-txt"><b>${esc(nombrePaquete(x.cantidades, e.categorias) || 'Paquete sin alumnos')}</b><small>${peso(x.mensualidad)} al mes</small></span><span class="ap-chev" aria-hidden="true">›</span></button>`).join('')
      || '<p class="ap-vacio">Sin paquetes para hermanos.</p>')
      + (canWrite ? '<button type="button" class="ap-fila ap-agrega" id="costosAddPaq"><span class="ap-mas" aria-hidden="true">+</span><span>Agregar paquete</span></button>' : '');
    $('cPaqOk').checked = !!e.paquetes.confirmado;
    $('cIncluye').value = e.incluye;
    if (!canWrite) { $('cPaqOk').disabled = true; $('cIncluye').disabled = true; $('saveCostos').disabled = true; $('saveCostos').textContent = 'Solo lectura'; }
    else { $('saveCostos').disabled = !sucio; if (!sucio) $('saveCostos').textContent = 'Sin cambios'; }
  }

  /* ---------- Carrusel de números (edades y días) ---------- */
  const carrusel = (campo, valores, actual, etiqueta, sufijo = '') => `<div class="ap-carrusel" role="radiogroup" aria-label="${esc(etiqueta)}" data-carrusel="${campo}">
      ${valores.map(v => `<button type="button" role="radio" aria-checked="${v === actual}" class="ap-num${v === actual ? ' on' : ''}" data-v="${v}"${canWrite ? '' : ' disabled'}>${v}${sufijo}</button>`).join('')}</div>`;
  // Centra lo elegido sólo de lado: scrollIntoView movería también la hoja hacia abajo.
  const centra = raiz => raiz.querySelectorAll('.ap-carrusel .on').forEach(b => { const car = b.parentElement; car.scrollLeft = b.offsetLeft - car.offsetLeft - (car.clientWidth - b.offsetWidth) / 2; });

  /* ---------- La hoja de una categoría ---------- */
  function hojaCategoria(i) {
    const nueva = i == null;
    const c = nueva ? { clave:'', nombre:'', edadMin:6, edadMax:12, inscripcion: estado.categorias[0]?.inscripcion ?? '', opciones:[{ dias:2, mensualidad:'' }] }
      : JSON.parse(JSON.stringify(estado.categorias[i]));
    const pintaHoja = () => {
      hoja.cuerpo.innerHTML = `<label class="ap-campo"><span>Nombre</span><input id="hNombre" maxlength="40" value="${esc(c.nombre)}" placeholder="Ej. Tanners" autocomplete="off"${canWrite ? '' : ' disabled'}></label>
        <div class="ap-bloque"><span class="ap-etq">Edades</span>
          <div class="ap-edad"><small>De</small>${carrusel('edadMin', range(EDAD_MIN, EDAD_MAX), c.edadMin, 'Desde qué edad')}</div>
          <div class="ap-edad"><small>a</small>${carrusel('edadMax', range(EDAD_MIN, EDAD_MAX), c.edadMax, 'Hasta qué edad')}</div>
          <p class="ap-nota" id="hEdadTxt">${esc(textoEdades(c.edadMin, c.edadMax))}</p></div>
        <label class="ap-campo ap-dinero"><span>Inscripción</span><i>$</i><input id="hInsc" inputmode="numeric" value="${esc(c.inscripcion)}" placeholder="1000"${canWrite ? '' : ' disabled'}></label>
        <div class="ap-bloque"><span class="ap-etq">Opciones</span>
          ${c.opciones.map((o, j) => `<div class="ap-opcion" data-op="${j}"><div class="ap-op-cab"><b>Opción ${j + 1}</b>${canWrite && c.opciones.length > 1 ? `<button type="button" class="ap-link rojo" data-quita-op="${j}">Quitar</button>` : ''}</div>
            <small>Días por semana</small>${carrusel(`dias-${j}`, DIAS, o.dias, `Días por semana, opción ${j + 1}`)}
            <label class="ap-campo ap-dinero"><span>Precio al mes</span><i>$</i><input data-precio="${j}" inputmode="numeric" value="${esc(o.mensualidad)}" placeholder="800"${canWrite ? '' : ' disabled'}></label>
            <p class="ap-nota" data-clase="${j}">${porClaseDe(o.dias, o.mensualidad) != null ? `${peso(porClaseDe(o.dias, o.mensualidad))} por clase` : 'Escribe el precio y te digo cuánto sale por clase'}</p></div>`).join('')}
          ${canWrite && c.opciones.length < 6 ? '<button type="button" class="ap-link" id="hAddOp">+ Otra opción</button>' : ''}</div>
        ${canWrite && !nueva && estado.categorias.length > 1 ? '<button type="button" class="ap-borrar" id="hBorrar">Eliminar categoría</button>' : ''}`;
      centra(hoja.cuerpo);
    };
    abreHoja(nueva ? 'Nueva categoría' : c.nombre || 'Categoría', pintaHoja, () => {
      c.nombre = c.nombre.trim();
      if (!c.nombre) return 'Ponle nombre a la categoría.';
      if (String(c.inscripcion).trim() === '') return 'Escribe cuánto cuesta la inscripción (puede ser 0).';
      if (c.opciones.some(o => String(o.mensualidad).trim() === '')) return 'Ponle precio a cada opción.';
      if (new Set(c.opciones.map(o => o.dias)).size !== c.opciones.length) return 'Dos opciones tienen los mismos días.';
      if (nueva) estado.categorias.push(c); else estado.categorias[i] = c;
      marca(); pinta(); return null;
    });
    hoja.cuerpo.oninput = e => {
      const t = e.target;
      if (t.id === 'hNombre') c.nombre = t.value;
      else if (t.id === 'hInsc') { t.value = soloDigitos(t.value); c.inscripcion = t.value; }
      else if (t.dataset.precio != null) { t.value = soloDigitos(t.value); const o = c.opciones[+t.dataset.precio]; o.mensualidad = t.value;
        const pc = porClaseDe(o.dias, o.mensualidad); hoja.cuerpo.querySelector(`[data-clase="${t.dataset.precio}"]`).textContent = pc != null ? `${peso(pc)} por clase` : 'Escribe el precio y te digo cuánto sale por clase'; }
    };
    hoja.cuerpo.onclick = e => {
      if (!canWrite) return;
      const n = e.target.closest('.ap-num'), car = n?.closest('[data-carrusel]');
      if (n && car) {
        const v = +n.dataset.v, campo = car.dataset.carrusel;
        if (campo === 'edadMin') { c.edadMin = v; if (c.edadMax < v) c.edadMax = v; }
        else if (campo === 'edadMax') { c.edadMax = v; if (c.edadMin > v) c.edadMin = v; }
        else c.opciones[+campo.split('-')[1]].dias = v;
        pintaHoja(); return;
      }
      if (e.target.id === 'hAddOp') { const usados = new Set(c.opciones.map(o => o.dias)); c.opciones.push({ dias: DIAS.find(d => !usados.has(d)) || 1, mensualidad:'' }); pintaHoja(); return; }
      if (e.target.dataset.quitaOp != null) { c.opciones.splice(+e.target.dataset.quitaOp, 1); pintaHoja(); return; }
      if (e.target.id === 'hBorrar') {
        estado.categorias.splice(i, 1);
        // Un paquete que llevaba alumnos de esta categoría ya no tiene sentido: se va.
        // Los demás cuentan por posición de categoría: se recorren las que siguen.
        estado.paquetes.lista = estado.paquetes.lista.filter(x => !(+(x.cantidades[i] || 0) > 0))
          .map(x => { const nn = {}; for (const [k, v] of Object.entries(x.cantidades)) { if (+k < i) nn[k] = v; else if (+k > i) nn[+k - 1] = v; } return { ...x, cantidades: nn }; });
        cierraHoja(); marca(); pinta();
      }
    };
  }

  /* ---------- La hoja de un paquete ---------- */
  function hojaPaquete(k) {
    const nuevo = k == null;
    const x = nuevo ? { cantidades: {}, mensualidad:'' } : JSON.parse(JSON.stringify(estado.paquetes.lista[k]));
    const pintaHoja = () => {
      hoja.cuerpo.innerHTML = `<div class="ap-bloque"><span class="ap-etq">¿Cuántos de cada categoría?</span>
          ${estado.categorias.map((c, i) => `<div class="ap-stepper"><span>${esc(c.nombre)}</span>
            <span class="ap-step-ctl"><button type="button" class="ap-step" data-menos="${i}" aria-label="Uno menos de ${esc(c.nombre)}"${canWrite && +(x.cantidades[i] || 0) > 0 ? '' : ' disabled'}>−</button>
            <b aria-live="polite">${+(x.cantidades[i] || 0)}</b>
            <button type="button" class="ap-step" data-mas="${i}" aria-label="Uno más de ${esc(c.nombre)}"${canWrite && +(x.cantidades[i] || 0) < 5 ? '' : ' disabled'}>+</button></span></div>`).join('')}
          <p class="ap-nota">${esc(nombrePaquete(x.cantidades, estado.categorias) || 'Elige cuántos alumnos lleva')}</p></div>
        <label class="ap-campo ap-dinero"><span>Precio al mes del paquete</span><i>$</i><input id="hPaqPrecio" inputmode="numeric" value="${esc(x.mensualidad)}" placeholder="1500"${canWrite ? '' : ' disabled'}></label>
        ${canWrite && !nuevo ? '<button type="button" class="ap-borrar" id="hBorrarPaq">Eliminar paquete</button>' : ''}`;
    };
    abreHoja(nuevo ? 'Nuevo paquete' : 'Paquete', pintaHoja, () => {
      if (!Object.values(x.cantidades).some(v => +v > 0)) return 'Elige cuántos alumnos lleva el paquete.';
      if (String(x.mensualidad).trim() === '') return 'Ponle precio al paquete.';
      if (nuevo) estado.paquetes.lista.push(x); else estado.paquetes.lista[k] = x;
      marca(); pinta(); return null;
    });
    hoja.cuerpo.oninput = e => { if (e.target.id === 'hPaqPrecio') { e.target.value = soloDigitos(e.target.value); x.mensualidad = e.target.value; } };
    hoja.cuerpo.onclick = e => {
      if (!canWrite) return;
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.mas != null) { x.cantidades[b.dataset.mas] = Math.min(5, +(x.cantidades[b.dataset.mas] || 0) + 1); pintaHoja(); }
      else if (b.dataset.menos != null) { x.cantidades[b.dataset.menos] = Math.max(0, +(x.cantidades[b.dataset.menos] || 0) - 1); pintaHoja(); }
      else if (b.id === 'hBorrarPaq') { estado.paquetes.lista.splice(k, 1); cierraHoja(); marca(); pinta(); }
    };
  }

  /* ---------- La hoja (de abajo hacia arriba, como en iPhone) ---------- */
  function abreHoja(titulo, pintaHoja, listo) {
    const raiz = $('costosHoja');
    raiz.innerHTML = `<div class="ap-fondo" data-cierra></div><section class="ap-hoja" role="dialog" aria-modal="true" aria-labelledby="apHojaT">
        <header class="ap-hoja-cab"><button type="button" class="ap-link" data-cierra>Cancelar</button><h3 id="apHojaT">${esc(titulo)}</h3>
          ${canWrite ? '<button type="button" class="ap-link fuerte" id="apListo">Listo</button>' : '<span></span>'}</header>
        <div class="ap-hoja-cuerpo" id="apHojaCuerpo"></div><p class="ap-error hidden" id="apHojaError" role="alert"></p></section>`;
    raiz.classList.remove('hidden');
    hoja = { cuerpo: $('apHojaCuerpo') };
    pintaHoja();
    raiz.querySelectorAll('[data-cierra]').forEach(b => b.addEventListener('click', cierraHoja));
    $('apListo')?.addEventListener('click', () => {
      const err = listo();
      if (err) { $('apHojaError').textContent = err; $('apHojaError').classList.remove('hidden'); return; }
      cierraHoja();
    });
    setTimeout(() => (hoja?.cuerpo.querySelector('input:not([disabled])') || $('apListo'))?.focus({ preventScroll: true }), 50);
  }
  function cierraHoja() { $('costosHoja').classList.add('hidden'); $('costosHoja').innerHTML = ''; hoja = null; }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && hoja) cierraHoja(); });

  /* ---------- Cargar y guardar ---------- */
  async function carga() {
    const [{ TARIFAS, aplicaPrecios }, guardados] = await Promise.all([import('/costos/tarifas.js'), rpc('v2_public_prices', { organization_id: org })]);
    const t = aplicaPrecios(TARIFAS, guardados);
    estado = {
      categorias: t.categorias.map(c => ({ clave: c.clave, nombre: c.nombre, ...leeEdades(c.edades), inscripcion: String(c.inscripcion),
        opciones: c.opciones.map(o => ({ dias: o.dias, mensualidad: String(o.mensualidad) })) })),
      paquetes: { confirmado: !!t.paquetes.confirmado, lista: t.paquetes.lista.map(x => ({ mensualidad: String(x.mensualidad),
        cantidades: Object.fromEntries(Object.entries(x.cantidades).map(([k, n]) => [t.categorias.findIndex(c => c.clave === k), n]).filter(([i]) => i >= 0)) })) },
      incluye: t.incluyeInscripcion
    };
    sucio = false; pinta();
  }
  $('costosForm').addEventListener('click', e => {
    const fila = e.target.closest('[data-abre-cat],[data-abre-paq],#costosAddCat,#costosAddPaq'); if (!fila) return;
    if (fila.id === 'costosAddCat') { if (estado.categorias.length >= 8) { msg('Hasta 8 categorías.'); return; } hojaCategoria(null); }
    else if (fila.id === 'costosAddPaq') { if (estado.paquetes.lista.length >= 12) { msg('Hasta 12 paquetes.'); return; } hojaPaquete(null); }
    else if (fila.dataset.abreCat != null) hojaCategoria(+fila.dataset.abreCat);
    else hojaPaquete(+fila.dataset.abrePaq);
  });
  $('cPaqOk').addEventListener('change', e => { estado.paquetes.confirmado = e.target.checked; marca(); });
  $('cIncluye').addEventListener('input', e => { estado.incluye = e.target.value; marca(); });
  $('costosForm').addEventListener('submit', async e => {
    e.preventDefault(); if (!canWrite || !sucio) return; msg();
    const { preciosDelFormulario } = await import('/costos/tarifas.js');
    const r = preciosDelFormulario({
      categorias: estado.categorias.map(c => ({ clave: c.clave, nombre: c.nombre, edades: textoEdades(c.edadMin, c.edadMax), inscripcion: c.inscripcion, opciones: c.opciones })),
      paquetes: { confirmado: estado.paquetes.confirmado, lista: estado.paquetes.lista.map(x => ({ ...x, nombre: nombrePaquete(x.cantidades, estado.categorias) })) },
      incluye: estado.incluye });
    if (r.error) { msg(r.error); return; }
    const btn = $('saveCostos'); btn.disabled = true; btn.textContent = 'Guardando…';
    try { await rpc('v2_update_public_prices', { organization_id: org, prices: r.precios }); await carga(); msg('Listo. Ya salen en /costos.', 'success'); }
    catch (err) { msg(err.message || 'No se pudo guardar.'); btn.disabled = false; btn.textContent = 'Guardar cambios'; }
  });
  addEventListener('beforeunload', e => { if (sucio) { e.preventDefault(); e.returnValue = ''; } });
  return carga;
}
function range(a, b) { return Array.from({ length: b - a + 1 }, (_, i) => a + i); }
