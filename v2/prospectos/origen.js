/* ¿Cómo nos conocieron? Agrupa los registros por medio (redes, recomendación,
   cancha…) y, dentro de las recomendaciones, por quién recomendó.
   Sin dependencias, para probarse sin navegador.

   La gente escribe el mismo nombre de muchas formas: "Michel", "michel
   enriquez", "Michel Enríquez". Se juntan sin acentos ni mayúsculas, y un
   nombre de una sola palabra se suma al nombre completo que empieza igual si
   sólo hay uno ("Michel" -> "Michel Enriquez"). */

const clave = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();
const bonito = s => String(s ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-MX').replace(/(^|\s)(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('es-MX'));
const fichado = p => p.status === 'converted';

export const ES_RECOMENDACION = p => clave(p.source_channel || p.source) === 'recomendacion' || Boolean(String(p.referral_name || '').trim());

export function porMedio(prospectos) {
  const m = new Map();
  for (const p of prospectos || []) {
    const crudo = String(p.source_channel || p.source || '').trim();
    const k = clave(crudo) || 'sin dato';
    const g = m.get(k) || { clave: k, nombre: crudo ? bonito(crudo) : 'Sin dato', valor: crudo, total: 0, fichados: 0 };
    g.total++; if (fichado(p)) g.fichados++;
    m.set(k, g);
  }
  return [...m.values()].sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, 'es-MX'));
}

export function porRecomendador(prospectos) {
  const grupos = new Map(); let sinNombre = { clave: '', nombre: 'Sin nombre', total: 0, fichados: 0, sinNombre: true };
  for (const p of (prospectos || []).filter(ES_RECOMENDACION)) {
    const k = clave(p.referral_name);
    if (!k) { sinNombre.total++; if (fichado(p)) sinNombre.fichados++; continue; }
    const g = grupos.get(k) || { clave: k, formas: new Map(), total: 0, fichados: 0 };
    const forma = bonito(p.referral_name);
    g.formas.set(forma, (g.formas.get(forma) || 0) + 1);
    g.total++; if (fichado(p)) g.fichados++;
    grupos.set(k, g);
  }
  // "Michel" se suma a "Michel Enriquez" si es el único completo que empieza así.
  for (const [k, g] of [...grupos]) {
    if (k.includes(' ')) continue;
    const largos = [...grupos.keys()].filter(o => o !== k && o.startsWith(k + ' '));
    if (largos.length !== 1) continue;
    const destino = grupos.get(largos[0]);
    destino.total += g.total; destino.fichados += g.fichados;
    for (const [f, n] of g.formas) destino.formas.set(f, (destino.formas.get(f) || 0) + n);
    destino.alias = [...(destino.alias || []), k];
    grupos.delete(k);
  }
  const lista = [...grupos.values()].map(g => ({
    clave: g.clave, total: g.total, fichados: g.fichados, alias: g.alias || [],
    // La forma más completa y más escrita.
    nombre: [...g.formas.entries()].sort((a, b) => b[0].split(' ').length - a[0].split(' ').length || b[1] - a[1])[0][0]
  })).sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, 'es-MX'));
  if (sinNombre.total) lista.push(sinNombre);
  return lista;
}

// Para filtrar la lista desde la gráfica: ¿este registro es de ese recomendador?
export function recomendoA(p, grupo) {
  if (!ES_RECOMENDACION(p)) return false;
  const k = clave(p.referral_name);
  if (grupo.sinNombre) return !k;
  return k === grupo.clave || (grupo.alias || []).includes(k);
}
