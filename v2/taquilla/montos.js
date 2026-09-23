// Montos de cobro: cuánto cobrarle a cada Tanner.
//
// Aquí vive el criterio de lectura, no el pintado. Los montos NO se calculan
// aquí: vienen de v2_collection_amounts, que los saca de las mismas tablas
// que ya cobran. Este archivo sólo decide cómo se leen y cómo se filtran.

const sinAcentos = v => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// La base guarda dos nombres para la misma condición: el canónico del sistema
// ('scholarship_full' → "Beca total") y el que escribió quien capturó
// ("Total", "Completa", "curtibrother", "Parcial / viene un día").
// Pegarlos siempre da cosas como "Beca total · Total". Se pega sólo cuando el
// del club agrega información que el canónico no tiene: ahí vive Curtibrother,
// que es como el club realmente le dice.
export function etiquetaCondicion(beneficio) {
  const canonico = String(beneficio?.label || '').trim();
  const delClub = String(beneficio?.clubLabel || '').trim();
  if (!delClub) return canonico || 'Beneficio';
  if (!canonico) return delClub;
  if (sinAcentos(canonico).includes(sinAcentos(delClub))) return canonico;
  return `${canonico} · ${delClub}`;
}

export function condicionDeFila(fila) {
  const lista = fila?.benefits || [];
  if (!lista.length) return 'Tarifa ordinaria';
  const primera = etiquetaCondicion(lista[0]);
  return lista.length === 1 ? primera : `${primera} +${lista.length - 1}`;
}

export const VIGENCIA = {
  ordinaria: { nivel: 'neutro', icono: '·', texto: 'Sin beneficio' },
  sin_vencimiento: { nivel: 'ok', icono: '∞', texto: 'Sin fecha de término' },
  vigente: { nivel: 'ok', icono: '✓', texto: 'Vigente' },
  por_vencer: { nivel: 'atencion', icono: '!', texto: 'Próximo a vencer' },
  vencido: { nivel: 'bajo', icono: '×', texto: 'Vencido' }
};

export function estadoVigencia(fila) {
  const base = VIGENCIA[fila?.validityStatus] || VIGENCIA.ordinaria;
  if (!fila?.validUntil) return base;
  return { ...base, texto: `${base.texto} · hasta ${fila.validUntil}` };
}

// El desglose que pidió el club: ordinario − beneficio = final.
//
// Sólo sale completo cuando la categoría ya tiene tarifa capturada. Si no, se
// devuelve `completo:false` y la pantalla dice por qué, en vez de inventar un
// ordinario. El club nunca guardó ese número: el descuento venía metido a
// mano dentro de la cuota de cada Tanner.
export function desglose(fila) {
  const ordinaria = fila?.ordinaryFee == null ? null : Number(fila.ordinaryFee);
  const cobrada = Number(fila?.chargedFee || 0);
  if (ordinaria === null) {
    return {
      completo: false,
      ordinaria: null,
      beneficio: null,
      final: cobrada,
      motivo: 'La categoría todavía no tiene mensualidad ordinaria capturada.'
    };
  }
  const beneficio = Math.round((ordinaria - cobrada) * 100) / 100;
  return {
    completo: true,
    ordinaria,
    beneficio,
    final: cobrada,
    // Un beneficio negativo significa que el Tanner paga MÁS que la tarifa de
    // su categoría. No se esconde: casi siempre es un dato mal capturado.
    inconsistente: beneficio < 0
  };
}

// Lo que hay que cobrarle hoy no es la mensualidad: es lo que quedó abierto
// del periodo, recargos incluidos. Esa es la pregunta de quien está en la
// ventanilla con el papá enfrente.
export function aCobrarHoy(fila) {
  return Number(fila?.toCollect || 0);
}

export function tiposDeBeneficio(filas) {
  const vistos = new Map();
  for (const f of filas || []) {
    for (const b of f.benefits || []) {
      const clave = b?.type || 'otro';
      if (!vistos.has(clave)) vistos.set(clave, String(b?.label || clave));
    }
  }
  return [...vistos].map(([valor, etiqueta]) => ({ valor, etiqueta }))
    .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es'));
}

export function filtra(filas, f = {}) {
  const texto = sinAcentos(f.texto || '').trim();
  const terminos = texto ? texto.split(/\s+/) : [];
  return (filas || []).filter(fila => {
    if (f.categoria && String(fila.categoryId) !== String(f.categoria)) return false;
    if (f.tipo && !(fila.benefits || []).some(b => b?.type === f.tipo)) return false;
    if (f.soloConBeneficio && !(fila.benefits || []).length) return false;
    if (f.soloConSaldo && !(Number(fila.outstanding || 0) > 0)) return false;
    if (f.soloPorVencer && !['por_vencer', 'vencido'].includes(fila.validityStatus)) return false;
    if (!terminos.length) return true;
    // Se busca por Tanner, tutor, categoría y tipo de beneficio, que son los
    // cuatro caminos por los que alguien de Taquilla llega a una familia.
    const heno = sinAcentos([
      fila.name, fila.code, fila.family, fila.categoryName,
      condicionDeFila(fila),
      ...(fila.benefits || []).map(b => `${b?.label || ''} ${b?.clubLabel || ''}`)
    ].filter(Boolean).join(' '));
    return terminos.every(t => heno.includes(t));
  });
}

export function totales(filas) {
  const t = { tanners: 0, aCobrar: 0, adeudo: 0, conBeneficio: 0, porVencer: 0, vencidos: 0, sinTarifa: 0 };
  for (const f of filas || []) {
    t.tanners++;
    t.aCobrar += Number(f.toCollect || 0);
    t.adeudo += Number(f.outstanding || 0);
    if ((f.benefits || []).length) t.conBeneficio++;
    if (f.validityStatus === 'por_vencer') t.porVencer++;
    if (f.validityStatus === 'vencido') t.vencidos++;
    if (f.ordinaryFee == null) t.sinTarifa++;
  }
  t.aCobrar = Math.round(t.aCobrar * 100) / 100;
  t.adeudo = Math.round(t.adeudo * 100) / 100;
  return t;
}

// Un beneficio 'informational' es una etiqueta que NO cambia ningún monto: el
// descuento ya venía dentro de la cuota del Tanner. Medido en producción, 18
// de 30 beneficios activos son así. Si la pantalla no lo dice, alguien va a
// creer que el sistema está aplicando un descuento que nunca aplicó.
export function beneficiosSoloEtiqueta(fila) {
  return (fila?.benefits || []).filter(b => b && b.affectsAmount === false);
}

/* ===== Reporte de montos de cobro (PDF) =====
   El PDF sale de las MISMAS filas que se están viendo, ya filtradas. No
   vuelve a consultar: si el papel dice otra cosa que la pantalla, alguien va
   a cobrar de más. */

export const COLUMNAS_REPORTE = [
  { clave: 'name', titulo: 'Tanner', ancho: 132 },
  { clave: 'categoryName', titulo: 'Categoría', ancho: 74 },
  { clave: 'ordinaria', titulo: 'Ordinaria', ancho: 58, derecha: true },
  { clave: 'condicion', titulo: 'Beca o beneficio', ancho: 116 },
  { clave: 'final', titulo: 'Mensualidad', ancho: 62, derecha: true },
  { clave: 'vigencia', titulo: 'Vigencia', ancho: 74 },
  { clave: 'cobrar', titulo: 'A cobrar', ancho: 58, derecha: true },
  { clave: 'saldo', titulo: 'Saldo', ancho: 58, derecha: true }
];

// El PDF nunca lleva el motivo de la beca ni la nota interna de Presidencia.
// Lo que sale es lo que ya se ve en pantalla: condición, monto y vigencia.
export function filaDeReporte(fila, dinero = v => String(v)) {
  const d = desglose(fila);
  return {
    name: String(fila?.name || 'Tanner'),
    categoryName: String(fila?.categoryName || '—'),
    ordinaria: d.completo ? dinero(d.ordinaria) : '—',
    condicion: condicionDeFila(fila),
    final: dinero(d.final),
    vigencia: fila?.validUntil ? String(fila.validUntil) : (VIGENCIA[fila?.validityStatus]?.texto || '—'),
    cobrar: dinero(aCobrarHoy(fila)),
    saldo: dinero(Number(fila?.outstanding || 0))
  };
}

export function resumenDeReporte(filas, dinero = v => String(v)) {
  const t = totales(filas);
  return {
    tanners: t.tanners,
    aCobrar: dinero(t.aCobrar),
    adeudo: dinero(t.adeudo),
    conBeneficio: t.conBeneficio,
    sinTarifa: t.sinTarifa
  };
}

export function textoDeFiltros(f = {}, catalogo = {}) {
  const partes = [];
  if (f.periodo) partes.push(`Periodo ${f.periodo}`);
  if (f.categoria) partes.push(`Categoría: ${catalogo.categorias?.[f.categoria] || f.categoria}`);
  if (f.tipo) partes.push(`Beneficio: ${catalogo.tipos?.[f.tipo] || f.tipo}`);
  if (f.soloConBeneficio) partes.push('Sólo con beca o beneficio');
  if (f.soloConSaldo) partes.push('Sólo con saldo');
  if (f.soloPorVencer) partes.push('Sólo por vencer o vencidos');
  if (f.texto) partes.push(`Búsqueda: "${f.texto}"`);
  return partes.length ? partes.join(' · ') : 'Todos los Tanners activos';
}

export function nombreDeArchivo(periodo) {
  return `montos-de-cobro-${String(periodo || '').replace(/[^0-9-]/g, '') || 'periodo'}.pdf`;
}
