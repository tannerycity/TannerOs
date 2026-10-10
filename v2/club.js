/* El nombre del club que está usando la app.
   TannerOS lo usan varios clubes: nada de "Tannery City" escrito a mano en
   mensajes, PDFs o etiquetas. El nombre sale del contexto (organización) o,
   si todavía no carga, de la marca aplicada. */

export function nombreDelClub(ctx) {
  const n = String(ctx?.organization_name || globalThis.__tosBranding?.brand || '').trim();
  return n || 'el club';
}

// Para el marcador: "Tannery City FC" -> "Tannery". Quita siglas (FC, CF,
// AC, Club) y deja la primera palabra que quede.
export function nombreCorto(ctx) {
  const limpio = nombreDelClub(ctx)
    .replace(/\b(?:F\.?\s?C\.?|C\.?\s?F\.?|A\.?\s?C\.?|club|deportivo)(?=\s|$)/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  return (limpio.split(' ')[0] || nombreDelClub(ctx)).slice(0, 14);
}
