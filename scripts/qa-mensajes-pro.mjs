/* MENSAJERÍA PRO · reglas sin pantalla (v2/mensajes/pro.js, h20 19/10/2026).
 *
 * Particiones de equivalencia y valores límite de lo que decide el chat:
 *   · archivos: extensiones que acepta Storage (misma lista que la política),
 *     15 MB justos pasan y un byte más no, y la ruta cae en la carpeta "chat";
 *   · editar: lo propio, vivo y antes de 15 minutos (14:59 sí, 15:00 no);
 *   · @menciones: detectar lo que se escribe, sugerir sin acentos, insertar
 *     el nombre completo y sacar a quién se mencionó de verdad;
 *   · respuestas rápidas: "/atajo" sólo al inicio y sin espacios;
 *   · silenciar y programar: horas exactas, 5 minutos a 60 días.
 */
import fs from 'node:fs';
import {
  EXTENSIONES, MAX_ARCHIVO, extensionDe, problemaConArchivo, rutaDeArchivo, pesoLegible, puedeEditar,
  mencionEnCurso, candidatosDeMencion, insertaMencion, mencionados, resaltaMenciones,
  atajoEnCurso, filtraRapidas, atajoValido, silencioHasta, validaProgramado, huellaDelHilo
} from '../v2/mensajes/pro.js';

let fallos = 0, corridas = 0;
const revisa = (nombre, ok, detalle) => { corridas++; if (!ok) { fallos++; console.error(` - ${nombre}${detalle !== undefined ? `\n   ${JSON.stringify(detalle)}` : ''}`); } };

/* Archivos */
revisa('extensión por nombre, sin importar mayúsculas', extensionDe('Recibo.PDF') === 'pdf');
revisa('extensión por tipo cuando el nombre no trae', extensionDe('foto', 'image/jpeg') === 'jpg');
revisa('un .exe no se acepta', extensionDe('virus.exe', 'application/octet-stream') === null);
revisa('15 MB justos pasan', problemaConArchivo({ name:'v.mp4', type:'video/mp4', size:MAX_ARCHIVO }) === null);
revisa('15 MB y un byte no', /15 MB/.test(problemaConArchivo({ name:'v.mp4', type:'video/mp4', size:MAX_ARCHIVO + 1 }) || ''));
revisa('sin archivo se explica', !!problemaConArchivo(null));
revisa('la ruta cae en la carpeta del chat', rutaDeArchivo('o1', 'h1', 'abc', 'jpg') === 'organizations/o1/chat/h1/abc.jpg');
revisa('peso legible', pesoLegible(512) === '512 B' && pesoLegible(2048) === '2 KB' && pesoLegible(3 * 1048576) === '3 MB' && pesoLegible(1.5 * 1048576) === '1.5 MB');
// La lista de extensiones es la MISMA que acepta la política de Storage.
{
  const sql = fs.readdirSync('supabase/migrations').filter(f => /h20b_mensajeria_archivos/.test(f)).map(f => fs.readFileSync(`supabase/migrations/${f}`, 'utf8')).join('');
  const m = /\\\.\(([a-z0-9|]+)\)\$/.exec(sql);
  const enBase = m ? m[1].split('|').sort().join(',') : '';
  revisa('las extensiones de la pantalla y de Storage son las mismas', enBase === [...EXTENSIONES].sort().join(','), { enBase, pantalla: EXTENSIONES });
}

/* Editar: 15 minutos */
const AHORA = Date.parse('2026-10-19T18:00:00Z');
const msg = (min, extra = {}) => ({ id:'m', mine:true, at:new Date(AHORA - min * 60e3).toISOString(), ...extra });
revisa('lo mío de hace 14:59 se edita', puedeEditar(msg(14.99), AHORA));
revisa('lo mío de hace 15:00 ya no', !puedeEditar(msg(15), AHORA));
revisa('lo de otro no', !puedeEditar(msg(1, { mine:false }), AHORA));
revisa('lo borrado no', !puedeEditar(msg(1, { deleted:true }), AHORA));
revisa('lo que todavía se está enviando no', !puedeEditar(msg(0, { estado:'enviando' }), AHORA));

/* @menciones */
const GENTE = [{ userId:'yo', name:'Mich' }, { userId:'b', name:'Brandon Ruiz' }, { userId:'z', name:'Zul Díaz' }, { userId:'e', name:'Emmanuel Ángeles' }];
revisa('detecta "@bra" al final', JSON.stringify(mencionEnCurso('hola @bra', 9)) === JSON.stringify({ inicio:5, q:'bra' }));
revisa('"@" sola también abre la lista', mencionEnCurso('hola @', 6)?.q === '');
revisa('un correo no es mención', mencionEnCurso('mich@club', 9) === null);
revisa('después de un espacio ya no busca', mencionEnCurso('@bra ', 5) === null);
revisa('sugiere por cualquier palabra del nombre, sin acentos', candidatosDeMencion(GENTE, 'ange', 'yo').map(p => p.userId).join() === 'e');
revisa('no me sugiere a mí mismo', !candidatosDeMencion(GENTE, '', 'yo').some(p => p.userId === 'yo'));
{
  const r = insertaMencion('ok @zu y', 6, 'Zul Díaz');
  revisa('inserta el nombre completo y deja el cursor después', r.texto === 'ok @Zul Díaz  y' && r.cursor === 13, r);
}
revisa('saca a quién se mencionó de verdad (sin acentos ni mayúsculas)', mencionados('Gracias @zul diaz y @Brandon Ruiz', GENTE, 'yo').sort().join() === 'b,z');
revisa('un nombre a medias no cuenta como mención', mencionados('@Brandon', GENTE, 'yo').length === 0);
revisa('mencionarme a mí no cuenta', mencionados('@Mich', GENTE, 'yo').length === 0);
revisa('resalta sobre texto ya escapado, sin abrir HTML', resaltaMenciones('&lt;b&gt; @Zul Díaz', ['Zul Díaz']) === '&lt;b&gt; <b class="ms-mention">@Zul Díaz</b>');
revisa('el nombre más largo gana (Ana vs Ana Sofía)', resaltaMenciones('@Ana Sofía', ['Ana', 'Ana Sofía']) === '<b class="ms-mention">@Ana Sofía</b>');

/* Respuestas rápidas */
revisa('"/gra" al inicio es atajo', atajoEnCurso('/gra') === 'gra');
revisa('"/" sola enseña todas', atajoEnCurso('/') === '');
revisa('con espacio ya no es atajo', atajoEnCurso('/gra cias') === null);
revisa('en medio del texto no es atajo', atajoEnCurso('hola /gra') === null);
const RAP = [{ shortcut:'gracias', body:'Gracias' }, { shortcut:'horario', body:'Entrenamos a las 7' }];
revisa('filtra por atajo', filtraRapidas(RAP, 'gr').map(r => r.shortcut).join() === 'gracias');
revisa('y por el texto', filtraRapidas(RAP, 'entrenamos').map(r => r.shortcut).join() === 'horario');
revisa('atajo válido: minúsculas, números, - y _', atajoValido('llamame_2') && atajoValido('/gracias') && !atajoValido('con espacio') && !atajoValido('') && !atajoValido('a'.repeat(25)));

/* Silenciar */
revisa('8 horas exactas', silencioHasta('8h', AHORA) === new Date(AHORA + 8 * 3600e3).toISOString());
revisa('1 semana exacta', silencioHasta('1s', AHORA) === new Date(AHORA + 7 * 864e5).toISOString());
revisa('"siempre" es una fecha lejana', silencioHasta('siempre', AHORA).startsWith('9999'));
revisa('una opción que no existe no silencia', silencioHasta('nunca', AHORA) === null);

/* Programar */
revisa('sin fecha se pide', !!validaProgramado('', AHORA).error);
revisa('4 minutos adelante no', !!validaProgramado(new Date(AHORA + 4 * 60e3).toISOString(), AHORA).error);
revisa('5 minutos adelante sí', !!validaProgramado(new Date(AHORA + 5 * 60e3).toISOString(), AHORA).iso);
revisa('60 días justos sí', !!validaProgramado(new Date(AHORA + 60 * 864e5).toISOString(), AHORA).iso);
revisa('60 días y un minuto no', !!validaProgramado(new Date(AHORA + 60 * 864e5 + 60e3).toISOString(), AHORA).error);
revisa('basura no', !!validaProgramado('mañana', AHORA).error);

/* Huella del hilo: editar, borrar o fijar cambian la huella */
const H = { thread:{ pinned:null }, messages:[{ id:'1' }, { id:'2' }] };
const h0 = huellaDelHilo(H);
revisa('editar cambia la huella', huellaDelHilo({ ...H, messages:[{ id:'1', editedAt:'x' }, { id:'2' }] }) !== h0);
revisa('borrar cambia la huella', huellaDelHilo({ ...H, messages:[{ id:'1', deleted:true }, { id:'2' }] }) !== h0);
revisa('fijar cambia la huella', huellaDelHilo({ ...H, thread:{ pinned:{ id:'1' } } }) !== h0);
revisa('nada nuevo, misma huella', huellaDelHilo(JSON.parse(JSON.stringify(H))) === h0);

console.log(fallos ? `Mensajería pro FAILED · ${fallos} de ${corridas}` : `Mensajería pro OK · ${corridas} revisiones`);
process.exit(fallos ? 1 : 0);
