/* Leer la lista de jugadores que trae un club (Excel, CSV o pegada).
   Sin dependencias, para probarse sin navegador. La pantalla
   (importar/app.js) arma el mapa de columnas con detectaColumnas, deja que el
   usuario lo corrija y manda filasParaImportar a v2_import_players. */

export const CAMPOS = [
  { campo: 'nombreCompleto', etiqueta: 'Nombre completo', claves: ['nombre completo', 'nombre del jugador', 'jugador', 'alumno', 'nino', 'nombre y apellidos'] },
  { campo: 'firstName', etiqueta: 'Nombre(s)', claves: ['nombre', 'nombres', 'primer nombre'] },
  { campo: 'lastName', etiqueta: 'Apellidos', claves: ['apellidos', 'apellido', 'apellido paterno', 'apellidos del jugador'] },
  { campo: 'lastName2', etiqueta: 'Apellido materno', claves: ['apellido materno', 'materno', 'segundo apellido'] },
  { campo: 'birthDate', etiqueta: 'Fecha de nacimiento', claves: ['fecha de nacimiento', 'nacimiento', 'fecha nac', 'f nacimiento', 'fecha nacimiento', 'cumpleanos', 'nacio'] },
  { campo: 'category', etiqueta: 'Categoría', claves: ['categoria', 'cat', 'grupo', 'equipo'] },
  { campo: 'guardianName', etiqueta: 'Tutor', claves: ['tutor', 'nombre del tutor', 'mama', 'papa', 'padre', 'madre', 'responsable', 'contacto', 'padre o tutor'] },
  { campo: 'phone', etiqueta: 'Teléfono', claves: ['telefono', 'celular', 'whatsapp', 'tel', 'cel', 'telefono del tutor', 'movil'] },
  { campo: 'email', etiqueta: 'Correo', claves: ['correo', 'email', 'e mail', 'correo electronico', 'mail'] },
  { campo: 'jerseyNumber', etiqueta: 'Número', claves: ['numero', 'dorsal', 'num', 'no', 'numero de playera'] },
  { campo: 'position', etiqueta: 'Posición', claves: ['posicion', 'pos'] },
  { campo: 'monthlyFee', etiqueta: 'Cuota mensual', claves: ['cuota', 'mensualidad', 'cuota mensual', 'colegiatura', 'pago mensual'] },
  { campo: 'sex', etiqueta: 'Sexo', claves: ['sexo', 'genero'] },
  { campo: 'school', etiqueta: 'Escuela', claves: ['escuela', 'colegio'] }
];

export const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Texto pegado desde Excel (tabuladores) o un CSV (comas o punto y coma),
// con celdas entre comillas que pueden traer saltos de línea.
export function leeTabla(texto) {
  const t = String(texto ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const primera = t.split('\n').find(l => l.trim()) || '';
  const sep = primera.includes('\t') ? '\t' : (primera.split(';').length > primera.split(',').length ? ';' : ',');
  const filas = []; let fila = [], celda = '', comillas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (comillas) {
      if (c === '"' && t[i + 1] === '"') { celda += '"'; i++; }
      else if (c === '"') comillas = false;
      else celda += c;
    } else if (c === '"' && celda === '') comillas = true;
    else if (c === sep) { fila.push(celda); celda = ''; }
    else if (c === '\n') { fila.push(celda); filas.push(fila); fila = []; celda = ''; }
    else celda += c;
  }
  if (celda !== '' || fila.length) { fila.push(celda); filas.push(fila); }
  return filas.map(f => f.map(x => x.trim())).filter(f => f.some(x => x !== ''));
}

// Qué columna es qué, por el encabezado. Primero coincidencias exactas,
// después parciales; una columna no se usa dos veces.
export function detectaColumnas(encabezados) {
  const hs = (encabezados || []).map(norm);
  const mapa = {}; const usadas = new Set();
  for (const exacta of [true, false]) {
    for (const { campo, claves } of CAMPOS) {
      if (mapa[campo] != null) continue;
      const i = hs.findIndex((h, j) => !usadas.has(j) && h && claves.some(k => exacta ? h === k : (h.startsWith(k + ' ') || h.endsWith(' ' + k) || h.includes(' ' + k + ' '))));
      if (i >= 0) { mapa[campo] = i; usadas.add(i); }
    }
  }
  // "Nombre" solo, sin columna de apellidos, casi siempre es el nombre completo.
  if (mapa.firstName != null && mapa.lastName == null && mapa.nombreCompleto == null) { mapa.nombreCompleto = mapa.firstName; delete mapa.firstName; }
  return mapa;
}

export function pareceEncabezado(fila) {
  const m = detectaColumnas(fila);
  return Object.keys(m).length >= 2;
}

// "Juan Carlos Pérez López" -> Juan Carlos / Pérez López. Con dos palabras,
// nombre y apellido; con más, los dos últimos son los apellidos.
export function partirNombre(completo) {
  const p = String(completo || '').trim().split(/\s+/).filter(Boolean);
  if (p.length <= 1) return { firstName: p[0] || '', lastName: '' };
  if (p.length === 2) return { firstName: p[0], lastName: p[1] };
  return { firstName: p.slice(0, -2).join(' '), lastName: p.slice(-2).join(' ') };
}

const MESES = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 };
const iso = (a, m, d) => {
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d
    ? `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : '';
};
// Fechas como las escribe un club en México: 04/03/2017, 4-3-17, 2017-03-04,
// "4 mar 2017" o el número de serie que deja Excel (42798).
export function fechaISO(valor) {
  const v = String(valor ?? '').trim();
  if (!v) return '';
  if (/^\d{5}(\.\d+)?$/.test(v)) {
    const f = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(v)) * 86400000);
    return iso(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate());
  }
  let m = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]) || 'invalida';
  m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) { let a = +m[3]; if (a < 100) a += a > (new Date().getFullYear() % 100) ? 1900 : 2000; return iso(a, +m[2], +m[1]) || 'invalida'; }
  m = norm(v).match(/^(\d{1,2}) (?:de )?([a-z]{3})[a-z]* (?:de )?(\d{4})$/);
  if (m && MESES[m[2]]) return iso(+m[3], MESES[m[2]], +m[1]) || 'invalida';
  return 'invalida';
}

// Las filas en el formato de v2_import_players.
export function filasParaImportar(datos, mapa) {
  const tomar = (fila, campo) => mapa[campo] == null ? '' : String(fila[mapa[campo]] ?? '').trim();
  return (datos || []).map(fila => {
    let firstName = tomar(fila, 'firstName'), lastName = [tomar(fila, 'lastName'), tomar(fila, 'lastName2')].filter(Boolean).join(' ');
    if (!firstName && tomar(fila, 'nombreCompleto')) ({ firstName, lastName } = partirNombre(tomar(fila, 'nombreCompleto')));
    const nac = fechaISO(tomar(fila, 'birthDate'));
    return {
      firstName, lastName,
      birthDate: nac === 'invalida' ? tomar(fila, 'birthDate') : nac,
      category: tomar(fila, 'category'), guardianName: tomar(fila, 'guardianName'), phone: tomar(fila, 'phone'),
      email: tomar(fila, 'email'), jerseyNumber: tomar(fila, 'jerseyNumber'), position: tomar(fila, 'position'),
      monthlyFee: tomar(fila, 'monthlyFee'), sex: tomar(fila, 'sex'), school: tomar(fila, 'school')
    };
  }).filter(f => Object.values(f).some(Boolean));
}

export const PLANTILLA = 'Nombre(s),Apellidos,Fecha de nacimiento,Categoría,Tutor,Teléfono,Correo,Número,Cuota mensual\r\n'
  + 'Leonardo,Pérez López,04/03/2017,Sub-8,Ana López,4771234567,ana@correo.com,10,500\r\n';
