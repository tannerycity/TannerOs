/* Gestos de toda la app (25/11/2026): jalar para actualizar con la T del club
   y el selector deslizante en los grupos con data-segmento. Va en su propio
   archivo (no en shell.js) para que una copia vieja de shell.js guardada en el
   teléfono no rompa las pantallas. */
export function activaGestos(ctx) {
  const esTannery = !ctx?.organization_name || /tannery/i.test(String(ctx.organization_name));
  import('/v2/jalar.js').then((m) => m.jalarParaActualizar({ escudo: esTannery ? '/brand/crest-navy.png' : null })).catch(() => {});
  import('/v2/segmento.js').then((m) => m.segmentos()).catch(() => {});
}
