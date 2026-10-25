// Patrocinios en dos minutos (23/10/2026), sin pantalla (se prueba con node).
//
// Zul tiene que poder abrir y saber, por cada marca: qué nos da, qué le
// debemos, cuánto falta cobrar y qué toca hacer. Aquí se calcula la "salud"
// de cada marca y la lista de "Hoy toca" a partir de lo mismo que ya regresa
// v2_sponsor_admin.
//
// Una marca puede tener varios acuerdos (borradores repetidos incluidos): sus
// compromisos se suman, pero el valor NO, se toma el mayor, para no contar dos
// veces el mismo patrocinio capturado dos veces.

const CERRADAS = ['lost', 'finished'];
const NIVEL = { alta: 0, media: 1, baja: 2 };
const DIAS_RENOVAR = 60;

const diasEntre = (fecha, hoy) => {
  if (!fecha) return null;
  const a = new Date(String(fecha).slice(0, 10) + 'T12:00:00');
  const b = new Date(String(hoy).slice(0, 10) + 'T12:00:00');
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((a - b) / 86400000);
};
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fechaCorta = f => { const [, m, d] = String(f).slice(0, 10).split('-').map(Number); return `${d} ${MESES[m - 1]}`; };
const dinero = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-MX');

export function saludDeMarca(marca, { agreements = [], items = [], payments = [], hoy, etapa = marca?.stage } = {}) {
  const acuerdos = agreements.filter(a => a.sponsorId === marca.id && a.status !== 'cancelled');
  const ids = new Set(acuerdos.map(a => a.id));
  // Lo marcado como venta aparte (ej. el paquete de $8,000 de Muroplaf) no es del patrocinio.
  const suyos = items.filter(i => ids.has(i.agreementId) && i.auditStatus !== 'venta_aparte');
  const cuenta = dir => {
    const l = suyos.filter(i => i.direction === dir);
    return { hechos: l.filter(i => i.fulfilled).length, total: l.length, pendientes: l.filter(i => !i.fulfilled) };
  };
  const recibimos = cuenta('receive'), damos = cuenta('give');
  const dineroItems = suyos.filter(i => i.direction === 'receive' && i.type === 'money');
  const valor = Math.max(0, ...acuerdos.map(a => Number(a.monetaryValue || 0)),
    dineroItems.reduce((s, i) => s + Number(i.estimatedValue || 0), 0));
  const pagado = payments.filter(p => ids.has(p.agreementId)).reduce((s, p) => s + Number(p.amount || 0), 0);
  const entregado = dineroItems.filter(i => i.fulfilled).reduce((s, i) => s + Number(i.estimatedValue || 0), 0);
  const cobrado = Math.min(valor || Infinity, Math.max(pagado, entregado));
  const porCobrar = valor > 0 ? Math.max(0, valor - cobrado) : 0;
  const activos = acuerdos.filter(a => a.status === 'active');
  const borradores = acuerdos.filter(a => a.status === 'draft');
  const finActivo = activos.map(a => a.endsOn).filter(Boolean).sort()[0] || null;
  const diasFin = diasEntre(finActivo, hoy);
  const diasPaso = diasEntre(marca.nextActionAt, hoy);
  const conNosotros = etapa === 'active';

  const avisos = [];
  const aviso = (tipo, nivel, texto, accion) => avisos.push({ tipo, nivel, texto, accion, marcaId: marca.id, marca: marca.name });
  if (!CERRADAS.includes(etapa)) {
    if (marca.nextAction && diasPaso !== null && diasPaso < 0)
      aviso('atrasado', 'alta', `${marca.nextAction} · ${-diasPaso > 14 ? `atrasado desde el ${fechaCorta(marca.nextActionAt)}` : `atrasado ${-diasPaso} ${-diasPaso === 1 ? 'día' : 'días'}`}`, 'seguimiento');
    else if (marca.nextAction && diasPaso !== null && diasPaso <= 2)
      aviso('pronto', 'media', `${marca.nextAction} · ${diasPaso === 0 ? 'hoy' : diasPaso === 1 ? 'mañana' : 'en 2 días'}`, 'seguimiento');
    else if (!marca.nextAction && !conNosotros && etapa !== 'paused')
      aviso('sinPaso', 'media', 'No tiene siguiente paso: define qué sigue y cuándo', 'editar');
  }
  if (conNosotros) {
    if (porCobrar > 0) aviso('cobrar', 'alta', `Falta cobrar ${dinero(porCobrar)} de ${dinero(valor)}`, 'pagos');
    if (diasFin !== null && diasFin < 0) aviso('vencido', 'alta', 'El acuerdo ya venció: renueva o ciérralo', 'acuerdo');
    else if (diasFin !== null && diasFin <= DIAS_RENOVAR) aviso('renovar', 'media', `Renovar: el acuerdo vence en ${diasFin} ${diasFin === 1 ? 'día' : 'días'}`, 'acuerdo');
    if (damos.pendientes.length) aviso('debemos', 'media', `Le debemos ${damos.pendientes.length} de ${damos.total}: ${damos.pendientes.slice(0, 2).map(i => i.description).join(', ')}${damos.pendientes.length > 2 ? '…' : ''}`, 'compromisos');
    if (!activos.length && acuerdos.length) aviso('borrador', 'baja', 'Su acuerdo sigue en Borrador: márcalo Activo con sus fechas', 'acuerdo');
    else if (!acuerdos.length) aviso('sinAcuerdo', 'media', 'Es marca activa pero no tiene acuerdo capturado', 'acuerdo');
  }
  const porAuditar = suyos.filter(i => i.auditStatus === 'por_auditar').length;
  if (porAuditar) aviso('auditar', 'baja', `${porAuditar} ${porAuditar === 1 ? 'entregable' : 'entregables'} por auditar contra el contrato`, 'compromisos');
  if (borradores.length > 1) aviso('repetidos', 'baja', `Tiene ${borradores.length} acuerdos en Borrador: deja sólo uno`, 'acuerdo');

  return { id: marca.id, nombre: marca.name, etapa, conNosotros, recibimos: { hechos: recibimos.hechos, total: recibimos.total },
    damos: { hechos: damos.hechos, total: damos.total }, valor, cobrado: valor ? cobrado : 0, porCobrar, finActivo, diasFin,
    avisos: avisos.sort((a, b) => NIVEL[a.nivel] - NIVEL[b.nivel]) };
}

// Lo más urgente arriba: primero lo de nivel alto, y dentro, las marcas con nosotros.
export function hoyToca(salud) {
  return salud.flatMap(s => s.avisos.map(a => ({ ...a, conNosotros: s.conNosotros })))
    .sort((a, b) => NIVEL[a.nivel] - NIVEL[b.nivel] || Number(b.conNosotros) - Number(a.conNosotros) || a.marca.localeCompare(b.marca, 'es'));
}

export function marcador(salud) {
  const con = salud.filter(s => s.conNosotros);
  return {
    marcas: con.length,
    valor: con.reduce((n, s) => n + s.valor, 0),
    cobrado: con.reduce((n, s) => n + s.cobrado, 0),
    porCobrar: con.reduce((n, s) => n + s.porCobrar, 0),
    debemos: con.reduce((n, s) => n + (s.damos.total - s.damos.hechos), 0),
    recibido: con.reduce((n, s) => n + s.recibimos.hechos, 0),
    porRecibir: con.reduce((n, s) => n + s.recibimos.total, 0),
  };
}

// Orden del tablero: las marcas con nosotros primero, las que más piden atención arriba.
export function ordenTablero(salud) {
  const peso = s => s.avisos.reduce((n, a) => n + (a.nivel === 'alta' ? 100 : a.nivel === 'media' ? 10 : 1), 0);
  return [...salud].filter(s => !CERRADAS.includes(s.etapa))
    .sort((a, b) => Number(b.conNosotros) - Number(a.conNosotros) || peso(b) - peso(a) || a.nombre.localeCompare(b.nombre, 'es'));
}

// Meta 2027 (Presidencia): efectivo cobrado en el mes contra la meta. La
// especie NUNCA suma aquí; va aparte, con su valor estimado.
export function efectivoDelMes(payments, hoy, meta = 30000) {
  const mes = String(hoy).slice(0, 7);
  const cobrado = (payments || []).filter(p => String(p.paidOn || '').slice(0, 7) === mes).reduce((n, p) => n + Number(p.amount || 0), 0);
  return { mes, cobrado, meta: Number(meta) || 0, falta: Math.max(0, (Number(meta) || 0) - cobrado), pct: meta ? Math.min(100, Math.round(cobrado / meta * 100)) : 0 };
}
export function especieRecibida(items, agreements) {
  const vivos = new Set((agreements || []).filter(a => a.status !== 'cancelled').map(a => a.id));
  const l = (items || []).filter(i => vivos.has(i.agreementId) && i.direction === 'receive' && i.type !== 'money' && i.auditStatus !== 'venta_aparte');
  const recibidos = l.filter(i => i.fulfilled);
  return { recibidos: recibidos.length, total: l.length, valor: recibidos.reduce((n, i) => n + Number(i.estimatedValue || 0), 0) };
}
