/* Guía oficial de los 9 Retos y los 4 mundos Baby (12/11/2026): lo que sale al
 * tocar la "i". El contenido es de Dirección Deportiva; aquí se cuida que estén
 * exactamente los nueve y los cuatro, cada uno con su color, su ícono y sus
 * textos; que el color se lea (contraste); que Baby no reciba la guía de un
 * Reto por compartir código; que no salga un ejercicio que el Banco no tiene,
 * y que la guía propia de Dirección mande sobre la base. */
import { readFileSync } from 'node:fs';
import { GUIA_RETOS, GUIA_BABY, ICONOS_RETO, LEMA_RETOS, guiaDeReto, ejerciciosDelBanco } from '../v2/formacion/guia-retos.js';
import { MUNDOS, MUNDOS_BABY, colorDeMundo, tintaSobre, contraste, estiloMundo, fondoDeTexto } from '../v2/formacion/motor.js';

let fallos = 0, corridas = 0;
const revisa = (n, ok, d) => { corridas++; if (!ok) { fallos++; console.error(` - ${n}${d ? `\n   ${d}` : ''}`); } };
const NUEVE = ['balon', '1v1', 'jugar_juntos', 'cancha', 'ventaja', 'avanzar', 'gol', 'defender', 'reaccionar'];
const CUATRO = ['movimiento', 'balon', 'juego', 'convivencia'];
const corto = t => typeof t === 'string' && t.trim().length > 5 && t.length <= 90;

revisa('exactamente 9 Retos, en su orden', JSON.stringify(Object.keys(GUIA_RETOS)) === JSON.stringify(NUEVE), Object.keys(GUIA_RETOS).join());
revisa('exactamente 4 mundos Baby, en su orden', JSON.stringify(Object.keys(GUIA_BABY)) === JSON.stringify(CUATRO), Object.keys(GUIA_BABY).join());
for (const c of NUEVE) {
  const g = GUIA_RETOS[c];
  revisa(`${c}: subtítulo, qué le digo, error, cómo lo ayudo y cómo sé que aprendió, en corto`, [g.subtitulo, g.digo, g.error, g.ayudo, g.aprendio].every(corto), JSON.stringify(g));
  revisa(`${c}: tres ejercicios, sin repetir`, g.ejercicios.length === 3 && new Set(g.ejercicios).size === 3);
  revisa(`${c}: color e ícono propios`, /^#[0-9A-F]{6}$/i.test(MUNDOS[c]) && ICONOS_RETO[c]?.includes('<'));
}
for (const c of CUATRO) {
  const g = GUIA_BABY[c];
  revisa(`Baby ${c}: qué buscamos, tres pasos, tres juegos, qué le digo y cómo sé que aprendió`, [g.subtitulo, g.buscamos, g.digo, g.aprendio].every(corto) && g.pasos.length === 3 && g.juegos.length === 3, JSON.stringify(g));
  revisa(`Baby ${c}: color e ícono propios`, /^#[0-9A-F]{6}$/i.test(MUNDOS_BABY[c]) && ICONOS_RETO[c]?.includes('<'));
}
revisa('los 9 colores de Reto son distintos entre sí, y los 4 de Baby también', new Set(Object.values(MUNDOS)).size === 9 && new Set(Object.values(MUNDOS_BABY)).size === 4);
revisa('paleta oficial: 1V1 naranja, Gol amarillo, Defender azul', MUNDOS['1v1'] === '#FF8A00' && MUNDOS.gol === '#F5C518' && MUNDOS.defender === '#374EA2');
revisa('Baby Balón no usa el color del Reto Balón', colorDeMundo('balon', 'baby') === '#FF8A00' && colorDeMundo('balon') === '#00A8E8');
const todos = [...Object.values(MUNDOS), ...Object.values(MUNDOS_BABY)];
revisa('texto sobre color: 5:1 o más en los 13 (el mínimo es 4.5:1; la negrita no cuenta)', todos.every(c => contraste(fondoDeTexto(c), tintaSobre(fondoDeTexto(c))) >= 5), todos.map(c => `${c}:${contraste(fondoDeTexto(c), tintaSobre(fondoDeTexto(c))).toFixed(2)}`).join(' '));
revisa('ícono sobre el color puro: 3:1 o más en los 13', todos.every(c => contraste(c, tintaSobre(c)) >= 3));
revisa('Reaccionar y Ventaja: se oscurece el fondo del texto, no cambia el color del Reto', fondoDeTexto(MUNDOS.reaccionar) === '#B6472D' && fondoDeTexto(MUNDOS.ventaja) === '#C13D6C' && MUNDOS.reaccionar === '#D95435' && MUNDOS.ventaja === '#E64980');
revisa('los que ya se leían bien no se tocan', ['balon', '1v1', 'jugar_juntos', 'cancha', 'gol', 'defender'].every(c => fondoDeTexto(MUNDOS[c]) === MUNDOS[c]));
revisa('nombres y textos sobre fondo blanco o tenue: tinta del club, 9:1 o más', todos.every(c => contraste('#053746', c) > 0) && contraste('#053746', '#FFFFFF') >= 9);
revisa('sobre el amarillo de Gol va texto oscuro', tintaSobre(MUNDOS.gol) === '#1A1A1A' && tintaSobre(MUNDOS.defender) === '#FFFFFF');
revisa('el estilo lleva color, tinta del ícono, fondo de texto y tinta', estiloMundo('gol') === '--mundo:#F5C518;--mundo-icono:#1A1A1A;--mundo-fondo:#F5C518;--mundo-tinta:#1A1A1A' && estiloMundo('reaccionar') === '--mundo:#D95435;--mundo-icono:#1A1A1A;--mundo-fondo:#B6472D;--mundo-tinta:#FFFFFF');
revisa('los íconos van en línea: nada se carga de fuera', !/https?:|<script|href=/i.test(Object.values(ICONOS_RETO).join('')) && Object.keys(ICONOS_RETO).length === 12);

// El Banco Tanner real (la semilla oficial): 36 tareas, 4 por Reto.
const tareas = JSON.parse(readFileSync(new URL('../supabase/semillas/formacion/banco-tanner-v1.0.json', import.meta.url), 'utf8')).tareas.map(t => ({ id: t.codigo, bank: 'tanner', primary: t.reto, name: t.nombre }));
const juegosBaby = JSON.parse(readFileSync(new URL('../supabase/semillas/formacion/banco-baby-v1.0.json', import.meta.url), 'utf8')).tareas.map(t => ({ id: t.codigo, bank: 'baby', primary: t.mundo, name: t.nombre }));
for (const c of CUATRO) revisa(`Baby ${c}: sus tres juegos son fichas del Banco Baby, de ese mundo y con su nombre exacto`, ejerciciosDelBanco(GUIA_BABY[c].juegos, juegosBaby, c, 'baby').map(t => t.name).join('|') === GUIA_BABY[c].juegos.join('|'), GUIA_BABY[c].juegos.join(' | '));
revisa('Baby: 12 juegos, ninguno repetido, y el Banco Baby tiene sus 24', new Set(CUATRO.flatMap(c => GUIA_BABY[c].juegos)).size === 12 && juegosBaby.length === 24);
revisa('Baby: un juego Baby no sale como ejercicio de un Reto, ni al revés', ejerciciosDelBanco(['Dos Caminos'], juegosBaby, 'juego').length === 0 && ejerciciosDelBanco(['Dos Caminos'], juegosBaby, 'juego', 'baby').length === 1);
revisa('Baby: la selección definitiva, en su orden', JSON.stringify(CUATRO.map(c => GUIA_BABY[c].juegos)) === JSON.stringify([['Semáforo Tanner', 'Islas Tanner', 'Frena y Sal'], ['Pelota Viajera', 'El Balón me Sigue', 'Casas de Color'], ['Encuentra la Portería', 'Puertas Mágicas', 'Partidito Vivo'], ['Saludo Tanner', 'Te Ayudo', 'Celebramos Juntos']]));
revisa('Gol: Todas las Formas de Gol, Ve a Buscar el Gol y El Gol Sigue Vivo; "3v2 al Gol" sigue en el Banco', GUIA_RETOS.gol.ejercicios.join('|') === 'Todas las Formas de Gol|Ve a Buscar el Gol|El Gol Sigue Vivo' && tareas.some(t => t.name === '3v2 al Gol' && t.primary === 'gol'));
const conceptos = JSON.parse(readFileSync(new URL('../supabase/semillas/formacion/catalogo-v1.1.json', import.meta.url), 'utf8')).conceptos;
const PREGUNTAS = { balon: '¿Puedo hacer con el balón lo que quiero?', '1v1': '¿Puedo ganar mi duelo?', jugar_juntos: '¿Puedo resolver con mis compañeros?', cancha: '¿Sé dónde estoy, dónde debo estar y qué pasa alrededor?', ventaja: '¿Podemos poner la jugada a nuestro favor?', avanzar: '¿Podemos superar la siguiente oposición?', gol: '¿Podemos convertir la jugada en gol?', defender: '¿Podemos proteger y recuperar?', reaccionar: '¿Qué hacemos cuando cambia quién tiene el balón?' };
revisa('las 9 preguntas de Fútbol Curtido siguen en el catálogo, sin cambios', NUEVE.every(c => conceptos.find(x => x.kind === 'reto' && x.code === c)?.question === PREGUNTAS[c]));
revisa('el encabezado no muestra el subtítulo: la pantalla no lo usa', !/subtitulo/.test(readFileSync(new URL('../v2/formacion/app.js', import.meta.url), 'utf8')));
const frases = [...NUEVE.flatMap(c => [GUIA_RETOS[c].digo, GUIA_RETOS[c].error, GUIA_RETOS[c].ayudo, GUIA_RETOS[c].aprendio]), ...CUATRO.flatMap(c => [GUIA_BABY[c].buscamos, GUIA_BABY[c].digo, GUIA_BABY[c].aprendio])];
revisa('ningún texto de la guía está repetido', new Set(frases).size === frases.length);
revisa('36 tareas en el Banco Tanner y los 27 ejercicios de la guía no se repiten', tareas.length === 36 && new Set(NUEVE.flatMap(c => GUIA_RETOS[c].ejercicios)).size === 27);
for (const c of NUEVE) revisa(`${c}: sus tres ejercicios existen en el Banco Tanner, en ese Reto`, ejerciciosDelBanco(GUIA_RETOS[c].ejercicios, tareas, c).length === 3, GUIA_RETOS[c].ejercicios.join(' | '));
revisa('ejercicios: se muestran los que están en el Banco, en el orden de la guía', ejerciciosDelBanco(GUIA_RETOS['1v1'].ejercicios, tareas, '1v1').map(t => t.name).join('|') === 'Engaña y Sal|Cruza la Línea|Dos Salidas');
revisa('ejercicios: el que no existe en el Banco no sale', ejerciciosDelBanco(['Engaña y Sal', 'Inventado'], tareas, '1v1').length === 1);
revisa('ejercicios: no toma uno de otro Reto ni del Banco Baby', ejerciciosDelBanco(['Balón Vivo'], tareas, '1v1').length === 0 && ejerciciosDelBanco(['X'], [{ bank: 'baby', primary: '1v1', name: 'X' }], '1v1').length === 0);

const g1 = guiaDeReto({ kind: 'reto', code: '1v1' });
revisa('1V1 trae su detalle "Cómo encarar" (Mira, Acércate, Engaña, Arranca)', g1.detalle?.titulo === 'Cómo encarar' && g1.detalle.puntos.map(p => p[0]).join() === 'Mira,Acércate,Engaña,Arranca');
const gg = guiaDeReto({ kind: 'reto', code: 'gol' });
revisa('Gol trae sus 10 formas de rematar; cabeza habla de protocolos, sin volúmenes', gg.detalle?.puntos.length === 10 && /protocolos de seguridad/.test(gg.detalle.puntos[8][1]) && !/\d/.test(gg.detalle.puntos[8][1]));
revisa('los demás Retos no llevan detalle', NUEVE.filter(c => guiaDeReto({ kind: 'reto', code: c }).detalle).join() === '1v1,gol');
const bb = guiaDeReto({ kind: 'mundo_baby', code: 'balon', attrs: {} });
revisa('Baby Balón recibe la guía del mundo, no la del Reto', bb.tipo === 'baby' && bb.pasos.join() === 'Llevo mi pelota,La paro,La pateo' && !('error' in bb));
revisa('lo que no es Reto ni mundo, o no existe, no inventa nada', guiaDeReto({ kind: 'recurso', code: 'balon' }) === null && guiaDeReto({ kind: 'reto', code: 'otro' }) === null && guiaDeReto(null) === null);
const propia = guiaDeReto({ kind: 'reto', code: 'gol', attrs: { guia: { digo: '¡A la red!' } } });
revisa('lo que escribe Dirección manda, y lo demás se queda', propia.digo === '¡A la red!' && propia.error === GUIA_RETOS.gol.error);
revisa('el lema del club', LEMA_RETOS === 'Primero lo entiende el niño. Después lo nombra el adulto.');

console.log(fallos ? `Guía de Retos FAILED · ${fallos} de ${corridas}` : `Guía de Retos OK · ${corridas} revisiones: 9 Retos y 4 mundos Baby con color, ícono y textos; contraste; ejercicios del Banco`);
process.exit(fallos ? 1 : 0);
