/* Motor de la calculadora de /costos: funciones puras, sin pantalla.
 *
 * Todo número sale de TARIFAS (costos/tarifas.js); aquí sólo hay reglas:
 *   · mensualidad de cada hijo según categoría y modalidad;
 *   · paquete familiar SÓLO si existe para esa combinación y está confirmado
 *     (si no, se enseña como referencia o "Solicitar cotización", sin cobrarlo);
 *   · primer mes proporcional con la regla de TannerOS (semanas en base 4);
 *   · inscripción por cada hijo nuevo.
 * Nunca se suma un descuento que no esté autorizado en la configuración.
 * Pruebas: scripts/qa-costos-calculadora.mjs.
 */

const peso = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0 });
export const dinero = n => peso.format(Math.round(Number(n) || 0));

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

// "2026-10-19" → {anio, mes(1-12), dia}, sin pasar por zonas horarias.
export function leeFecha(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return null;
  const anio = +m[1], mes = +m[2], dia = +m[3];
  const diasDelMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  if (mes < 1 || mes > 12 || dia < 1 || dia > diasDelMes) return null;
  return { anio, mes, dia, diasDelMes };
}
export const fechaLarga = f => `${f.dia} de ${MESES[f.mes - 1]} de ${f.anio}`;
export const fechaCorta = f => `${String(f.dia).padStart(2, '0')}/${String(f.mes).padStart(2, '0')}/${f.anio}`;
export const mesDe = f => `${MESES[f.mes - 1]} ${f.anio}`;
export const mesSiguiente = f => f.mes === 12 ? `enero ${f.anio + 1}` : `${MESES[f.mes]} ${f.anio}`;

// Semanas que se cobran del primer mes, según el día de ingreso.
export function semanasACobrar(dia, prorrateo) {
  const t = prorrateo.tramos.find(x => dia <= x.hastaDia);
  return t ? t.semanas : prorrateo.tramos.at(-1).semanas;
}
export function proporcional(mensualidad, dia, prorrateo) {
  return Math.round(mensualidad * semanasACobrar(dia, prorrateo) / prorrateo.base);
}

export function modalidadDe(hijo, tarifas) {
  const cat = tarifas.categorias[hijo?.categoria];
  if (!cat) return null;
  const mod = cat.modalidades.length === 1 ? cat.modalidades[0] : cat.modalidades.find(m => m.clave === hijo.modalidad);
  return mod ? { categoria: cat, modalidad: mod } : null;
}

/* El paquete familiar de esta combinación:
     no_aplica   un solo hijo (no hay paquete que aplicar);
     aplica      existe, está confirmado y la modalidad coincide: se cobra;
     referencia  existe pero falta confirmarlo (o no dice la modalidad Baby):
                 se enseña, no se cobra;
     sin_tarifa  no existe para esta combinación: "Solicitar cotización". */
export function paqueteDe(hijos, tarifas) {
  if (hijos.length < 2) return { estado: 'no_aplica', paquete: null };
  const tanner = hijos.filter(h => h.categoria === 'tanner').length;
  const baby = hijos.filter(h => h.categoria === 'baby').length;
  const paquete = tarifas.paquetes.lista.find(p => p.tanner === tanner && p.baby === baby) || null;
  if (!paquete) return { estado: 'sin_tarifa', paquete: null };
  const modalidadOk = !paquete.baby || (paquete.babyModalidad != null &&
    hijos.filter(h => h.categoria === 'baby').every(h => h.modalidad === paquete.babyModalidad));
  if (!tarifas.paquetes.confirmado || !modalidadOk) {
    return { estado: 'referencia', paquete, motivo: !tarifas.paquetes.confirmado ? 'por_confirmar' : 'modalidad' };
  }
  return { estado: 'aplica', paquete };
}

/* La cotización completa. Devuelve {error} si falta algo; nunca un número
   inventado. */
export function cotiza({ hijos = [], fechaIngreso, nuevaInscripcion } = {}, tarifas) {
  if (!hijos.length) return { error: 'Elige cuántos hijos vas a inscribir.' };
  if (hijos.length > tarifas.maxHijos) return { error: `La calculadora cubre hasta ${tarifas.maxHijos} hijos. Para más, solicita una cotización.` };
  const detalle = [];
  for (const [i, h] of hijos.entries()) {
    const m = modalidadDe(h, tarifas);
    if (!m) return { error: h?.categoria === 'baby' ? `Elige cuántos días por semana va el hijo ${i + 1}.` : `Elige la categoría del hijo ${i + 1}.` };
    detalle.push({ n: i + 1, categoria: m.categoria.nombre, modalidad: m.categoria.modalidades.length > 1 ? m.modalidad.nombre : null,
      mensualidad: m.modalidad.mensualidad, inscripcion: m.categoria.inscripcion });
  }
  if (typeof nuevaInscripcion !== 'boolean') return { error: 'Dinos si es de nuevo ingreso o si ya está inscrito.' };
  // El proporcional es SÓLO para nuevo ingreso (Presidencia, 20/10/2026): quien
  // ya está inscrito paga su mensualidad completa, venga a las clases que venga.
  const pr = tarifas.prorrateo;
  const f = nuevaInscripcion ? leeFecha(fechaIngreso) : null;
  if (nuevaInscripcion && !f) return { error: 'Elige la fecha de ingreso.' };
  const semanas = f ? semanasACobrar(f.dia, pr) : pr.base;
  const sumaIndividual = detalle.reduce((s, d) => s + d.mensualidad, 0);
  const paq = paqueteDe(hijos, tarifas);
  const mensualidadRegular = paq.estado === 'aplica' ? paq.paquete.mensualidad : sumaIndividual;

  const parte = m => Math.round(m * semanas / pr.base);
  const proporcionalIndividual = parte(sumaIndividual);
  const ajusteFamiliar = paq.estado === 'aplica' ? parte(paq.paquete.mensualidad) - proporcionalIndividual : 0;
  const inscripcion = nuevaInscripcion ? detalle.reduce((s, d) => s + d.inscripcion, 0) : 0;
  const primerPago = proporcionalIndividual + ajusteFamiliar + inscripcion;

  return {
    fecha: f, semanas, base: pr.base, completo: semanas === pr.base,
    detalle, sumaIndividual, paquete: paq,
    proporcionalIndividual, ajusteFamiliar, inscripcion, nuevaInscripcion,
    primerPago, mensualidadRegular,
    // Es estimación si alguna regla que la sostiene no está confirmada.
    estimacion: !pr.confirmado || paq.estado === 'referencia' || paq.estado === 'sin_tarifa'
  };
}

// La cotización en texto: para copiar o mandar por WhatsApp, tal cual se ve.
export function textoCotizacion(c, tarifas) {
  const l = [];
  l.push('Mi cotización Tannery City');
  l.push(c.nuevaInscripcion ? `Nuevo ingreso. Fecha de ingreso: ${fechaCorta(c.fecha)}` : 'Alumno ya inscrito');
  c.detalle.forEach(d => l.push(`Hijo ${d.n}: ${d.categoria}${d.modalidad ? `, ${d.modalidad}` : ''} (${dinero(d.mensualidad)} al mes)`));
  l.push('');
  l.push(c.fecha ? `Mensualidad de ${mesDe(c.fecha)}${c.completo ? '' : ` (${c.semanas} de ${c.base} semanas)`}: ${dinero(c.proporcionalIndividual)}`
    : `Mensualidad completa: ${dinero(c.proporcionalIndividual)}`);
  if (c.nuevaInscripcion) l.push(`Inscripción (${c.detalle.length === 1 ? '1 alumno' : `${c.detalle.length} alumnos`}): ${dinero(c.inscripcion)}`);
  if (c.paquete.estado === 'aplica') l.push(`Ajuste familiar (${c.paquete.paquete.nombre}): ${dinero(c.ajusteFamiliar)}`);
  if (c.paquete.estado === 'referencia') l.push(`Paquete familiar ${c.paquete.paquete.nombre}: ${dinero(c.paquete.paquete.mensualidad)} al mes, por confirmar`);
  if (c.paquete.estado === 'sin_tarifa') l.push('Paquete familiar: solicitar cotización');
  if (c.fecha) {
    l.push(`Total del primer pago: ${dinero(c.primerPago)} ${tarifas.moneda}`);
    l.push(`Mensualidad regular desde ${mesSiguiente(c.fecha)}: ${dinero(c.mensualidadRegular)} ${tarifas.moneda}`);
  } else {
    l.push(`Total a pagar cada mes: ${dinero(c.primerPago)} ${tarifas.moneda}`);
  }
  l.push('');
  l.push(tarifas.notaProporcional);
  l.push(c.estimacion ? `Estimación. ${tarifas.nota}` : tarifas.nota);
  return l.join('\n');
}

export function ligaWhatsApp(texto, tarifas, hijos = 1) {
  const msg = `Hola, quiero información para inscribir a ${hijos > 1 ? 'mis hijos' : 'mi hijo'} en Tannery City.\n\n${texto}`;
  return `https://wa.me/${tarifas.whatsapp.numero}?text=${encodeURIComponent(msg)}`;
}
