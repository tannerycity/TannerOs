/* Candidatos a staff: lo que no depende de la pantalla (para probarlo solo). */
export const ESTADOS = [
  { code: 'nueva', label: 'Nueva' }, { code: 'revision', label: 'En revisión' }, { code: 'entrevista', label: 'Entrevista' },
  { code: 'contratado', label: 'Contratado' }, { code: 'descartado', label: 'Descartado' }];
export const etiquetaDe = code => ESTADOS.find(e => e.code === code)?.label || code;
// "Activas" es lo que todavía pide algo: nuevas, en revisión y en entrevista.
export const FILTROS = [{ code: 'activas', label: 'Activas' }, ...ESTADOS];
export function filtra(lista, filtro) {
  if (filtro === 'activas') return lista.filter(c => ['nueva', 'revision', 'entrevista'].includes(c.status));
  return lista.filter(c => c.status === filtro);
}
export function cuenta(lista) {
  const n = Object.fromEntries(ESTADOS.map(e => [e.code, 0]));
  lista.forEach(c => { if (c.status in n) n[c.status]++; });
  return n;
}
// El primer mensaje por WhatsApp, firmado por el club.
export function mensajeInicial(c, club) {
  const nombre = String(c.fullName || '').trim().split(/\s+/)[0] || '';
  return `Hola ${nombre}, te escribimos de ${club}. Recibimos tu postulación (${c.folio}) para ${(c.positions || []).join(' / ')}. ¿Qué día y hora te queda para platicar?`;
}
