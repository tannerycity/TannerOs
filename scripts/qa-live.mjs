/* Tanner LIVE · reglas de pantalla (23/11/2026).
 *
 * Lo que decide quién ve qué vive en la base (h101, con sus propias pruebas
 * en supabase/propuestas/h101_tanner_live_pruebas.sql). Aquí se prueba lo que
 * la pantalla hace con esa respuesta, con técnicas ISTQB:
 *
 * CAJA NEGRA
 *   · Partición de equivalencia: IP privada / pública / inválida.
 *   · Valores frontera: 172.15 / 172.16 / 172.31 / 172.32; puerto 0/1/65535/65536;
 *     ventana de horario en el minuto de inicio, el último y el de cierre.
 *   · Tabla de decisión: "En vivo" = proveedor real × reproduciendo × cuadros.
 * CAJA BLANCA
 *   · Cada rama de proximaVentana (hoy antes, hoy durante, hoy ya pasó, otro día).
 *   · Cada motivo del servidor tiene un texto para la familia.
 */
import {
  esIpPrivada, validaGrabador, validaCamara, limpiaSecretos, pareceSecreto, dentroDeHorario, proximaVentana, textoVentana,
  relojDelClub, puedeDecirEnVivo, motivo, MOTIVOS, faltaParaEncender, plantillaRtspDahua, textoHorario, NO_ENCIENDE, esc,
  enlaceDe, codigoDeEnlace, mensajeWhatsApp, minutosHasta, DURACIONES
} from '../v2/live/live.js';
import fs from 'node:fs';

let fallos = 0, corridas = 0;
const revisa = (n, ok, d) => { corridas++; if (!ok) { fallos++; console.error(` - ${n}${d !== undefined ? `\n   ${JSON.stringify(d)}` : ''}`); } };

// --- IP del grabador: sólo red local --------------------------------------
for (const ip of ['192.168.1.108', '10.0.0.1', '172.16.0.1', '172.31.255.254', '192.168.0.0'])
  revisa(`IP privada: ${ip}`, esIpPrivada(ip));
for (const ip of ['8.8.8.8', '172.15.255.255', '172.32.0.1', '192.169.1.1', '201.150.10.4', '256.1.1.1', '192.168.1', 'abc', '', null])
  revisa(`IP no privada: ${ip}`, !esIpPrivada(ip));

// --- Grabador --------------------------------------------------------------
revisa('grabador sólo con nombre es válido (aún sin datos reales)', validaGrabador({ nombre: 'Grabador del parque' }).length === 0);
revisa('grabador sin nombre no', validaGrabador({}).length === 1);
revisa('IP pública rechazada', validaGrabador({ nombre: 'X', ip: '8.8.8.8' }).some(e => /red local/.test(e)));
for (const [p, ok] of [[0, false], [1, true], [554, true], [65535, true], [65536, false], ['abc', false]])
  revisa(`puerto ${p} ${ok ? 'válido' : 'inválido'}`, (validaGrabador({ nombre: 'X', puerto: p }).length === 0) === ok);
revisa('notas con usuario:clave RTSP se rechazan', validaGrabador({ nombre: 'X', notas: 'rtsp://admin:Clave123@192.168.1.108:554' }).some(e => /contraseñas/.test(e)));
revisa('notas con "contraseña" se rechazan', validaGrabador({ nombre: 'X', notas: 'la contraseña es 1234' }).length === 1);

// --- Cámara ----------------------------------------------------------------
revisa('cámara sólo con nombre es válida', validaCamara({ nombre: 'Cancha 1' }).length === 0);
revisa('ruta con mayúsculas no', validaCamara({ nombre: 'X', ruta: 'Cancha 1' }).length === 1);
revisa('ruta tc-cancha-1 sí', validaCamara({ nombre: 'X', ruta: 'tc-cancha-1' }).length === 0);
revisa('resolución 704x480 sí', validaCamara({ nombre: 'X', resolucion: '704x480' }).length === 0);
revisa('resolución 704*480 no', validaCamara({ nombre: 'X', resolucion: '704*480' }).length === 1);
revisa('horario que termina antes de empezar no', validaCamara({ nombre: 'X', horario: [{ dia: 2, de: '19:00', a: '17:00' }] }).length === 1);
revisa('horario igual inicio/fin no', validaCamara({ nombre: 'X', horario: [{ dia: 2, de: '17:00', a: '17:00' }] }).length === 1);
revisa('horario sin día no', validaCamara({ nombre: 'X', horario: [{ dia: 0, de: '17:00', a: '18:00' }] }).length === 1);
revisa('sensible con audiencia no', validaCamara({ nombre: 'Vestidor', sensible: true, categorias: ['T10'] }).length === 1);

// --- Secretos --------------------------------------------------------------
const sucio = 'fallo rtsp://admin:Clave123@192.168.1.108:554/cam password=1234 token: abc';
const limpio = limpiaSecretos(sucio);
revisa('se quita usuario:clave de la URL', !/admin|Clave123/.test(limpio), limpio);
revisa('se oculta password=…', !/1234/.test(limpio), limpio);
revisa('se oculta token: …', !/abc$/.test(limpio), limpio);
revisa('lo limpio ya no parece secreto (salvo la palabra oculta)', !/rtsp:\/\/[^\s]*@/.test(limpio));
revisa('texto normal no parece secreto', !pareceSecreto('Grabador junto a la cafetería'));
revisa('esc escapa HTML', esc('<img src=x onerror=1>') === '&lt;img src=x onerror=1&gt;');

// --- Plantilla RTSP: nunca credenciales reales -----------------------------
const plantilla = plantillaRtspDahua({ ip: '192.168.1.108', puerto: 554, canal: 2, perfil: 'sub' });
revisa('plantilla Dahua substream', plantilla === 'rtsp://USUARIO:CLAVE@192.168.1.108:554/cam/realmonitor?channel=2&subtype=1', plantilla);
revisa('plantilla principal subtype=0', /subtype=0$/.test(plantillaRtspDahua({ ip: '10.0.0.5', perfil: 'main' })));
revisa('plantilla con IP pública no la usa', /IP_DEL_GRABADOR/.test(plantillaRtspDahua({ ip: '8.8.8.8' })));

// --- Horario (zona del club) ----------------------------------------------
// 2026-11-24 es martes. 23:30 UTC = 17:30 en León (UTC-6, sin horario de verano).
const martes1730 = new Date('2026-11-24T23:30:00Z');
const r = relojDelClub(martes1730, 'America/Mexico_City');
revisa('reloj del club: martes 17:30', r.dia === 2 && r.minutos === 17 * 60 + 30, r);
const H = [{ dia: 2, de: '17:00', a: '19:00' }, { dia: 4, de: '17:00', a: '19:00' }];
revisa('dentro: martes 17:30', dentroDeHorario(H, martes1730));
revisa('frontera: martes 17:00 exacto entra', dentroDeHorario(H, new Date('2026-11-24T23:00:00Z')));
revisa('frontera: martes 18:59 entra', dentroDeHorario(H, new Date('2026-11-25T00:59:00Z')));
revisa('frontera: martes 19:00 ya no', !dentroDeHorario(H, new Date('2026-11-25T01:00:00Z')));
revisa('frontera: martes 16:59 todavía no', !dentroDeHorario(H, new Date('2026-11-24T22:59:00Z')));
revisa('miércoles no', !dentroDeHorario(H, new Date('2026-11-25T23:30:00Z')));
revisa('sin horario nunca', !dentroDeHorario([], martes1730));

const ahora = proximaVentana(H, martes1730);
revisa('próxima: ahora mismo', ahora.ahora && textoVentana(ahora) === 'Ahora, hasta las 19:00', ahora);
const antes = proximaVentana(H, new Date('2026-11-24T20:00:00Z')); // martes 14:00
revisa('próxima: hoy más tarde', !antes.ahora && antes.dias === 0 && textoVentana(antes) === 'Hoy de 17:00 a 19:00', antes);
const despues = proximaVentana(H, new Date('2026-11-25T02:00:00Z')); // martes 20:00
revisa('próxima: ya pasó hoy -> jueves', despues.dia === 4 && textoVentana(despues) === 'Jueves de 17:00 a 19:00', despues);
const miercoles = proximaVentana(H, new Date('2026-11-25T18:00:00Z')); // miércoles 12:00
revisa('próxima: mañana', textoVentana(miercoles) === 'Mañana de 17:00 a 19:00', miercoles);
const soloMartes = proximaVentana([{ dia: 2, de: '17:00', a: '19:00' }], new Date('2026-11-25T02:00:00Z'));
revisa('próxima: única ventana ya pasó -> en 7 días', soloMartes.dias === 7, soloMartes);
revisa('próxima: sin horario', proximaVentana([], martes1730) === null && textoVentana(null) === 'Sin horario definido');
revisa('texto del horario ordenado', textoHorario([{ dia: 4, de: '17:00', a: '19:00' }, { dia: 2, de: '17:00', a: '19:00' }]) === 'Mar 17:00–19:00 · Jue 17:00–19:00');

// --- "En vivo": tabla de decisión ------------------------------------------
for (const [proveedor, reproduciendo, cuadros, esperado] of [
  ['whep', true, 10, true], ['hls', true, 1, true],
  ['whep', false, 10, false], ['whep', true, 0, false],
  ['prueba', true, 999, false], ['prueba', false, 0, false], [null, true, 5, true]
]) revisa(`en vivo: ${proveedor}/${reproduciendo}/${cuadros} = ${esperado}`, puedeDecirEnVivo({ proveedor, reproduciendo, cuadros }) === esperado);

// --- Motivos del servidor: todos con texto para la familia ------------------
const MOTIVOS_SERVIDOR = ['ok', 'sin_terminos', 'fuera_de_horario', 'sin_horario', 'desactivada', 'pausado', 'bloqueado', 'sin_gateway',
  'demasiados_intentos', 'sin_permiso', 'no_existe', 'modulo_apagado', 'sin_sesion', 'sensible', 'terminada', 'horario_academia', 'lleno'];
for (const m of MOTIVOS_SERVIDOR) revisa(`motivo ${m} tiene texto`, Boolean(MOTIVOS[m]?.titulo && MOTIVOS[m]?.texto));
revisa('motivo desconocido no revienta', motivo('xyz').titulo === 'No disponible');
// Cada motivo que regresa la base (h101) está traducido aquí.
const MIG = new URL('../supabase/migrations/', import.meta.url);
const sql = fs.readdirSync(MIG).filter(f => /_h101[a-z]_.*\.sql$/.test(f)).sort().map(f => fs.readFileSync(new URL(f, MIG), 'utf8')).join('\n');
revisa('las migraciones de Tanner LIVE están en el repo', sql.includes('private.live_motivo'));
const enLaBase = [...sql.matchAll(/return '([a-z_]+)';/g)].map(m => m[1]);
for (const m of new Set(enLaBase)) revisa(`la base devuelve "${m}" y la pantalla lo traduce`, Boolean(MOTIVOS[m]), m);
const noEnciende = [...sql.matchAll(/'motivo', '([a-z_]+)'/g)].map(m => m[1]).filter(m => !MOTIVOS[m] && !['ok', 'accion', 'ticket_invalido', 'revocado', 'ruta', 'vencido', 'otro_dispositivo'].includes(m));
for (const m of new Set(noEnciende)) revisa(`la base rechaza encender por "${m}" y la pantalla lo explica`, Boolean(NO_ENCIENDE[m]), m);

// --- Requisitos para encender ------------------------------------------------
revisa('cámara nueva: faltan audiencia, horario y permisos', faltaParaEncender({}).length === 3);
revisa('cámara lista: no falta nada', faltaParaEncender({ categorias: ['T10'], horario: [{ dia: 2, de: '17:00', a: '19:00' }], consentimiento_al: '2026-11-23' }).length === 0);
revisa('cámara sensible: avisa', faltaParaEncender({ sensible: true }).some(f => /sensible/.test(f)));

// --- Botón Transmitir y enlace ---------------------------------------------
const C = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
revisa('el enlace lleva el código después de #', enlaceDe(C) === `https://app.tannerycity.com/ver/#${C}`);
revisa('el enlace respeta el dominio del club', enlaceDe(C, 'https://app.otroclub.mx').startsWith('https://app.otroclub.mx/ver/#'));
revisa('se lee el código del enlace', codigoDeEnlace(`#${C}`) === C && codigoDeEnlace(C.toUpperCase()) === C);
for (const malo of ['', '#', '#abc', `#${C}x`, `#${C.slice(1)}`, '#<script>', null])
  revisa(`un código inválido no se acepta: ${String(malo).slice(0, 12)}`, codigoDeEnlace(malo) === null);
revisa('mensaje de WhatsApp con nombre, hora y enlace', /^Final Copa en vivo \(hasta las .+\): https:\/\/app\.tannerycity\.com\/ver\/#/.test(mensajeWhatsApp({ titulo: 'Final Copa', enlace: enlaceDe(C), termina: '2026-11-25T05:00:00Z' })));
// Frontera de "Hasta las 11 pm" (hora de León): 19:00 -> 240; 22:50 -> 15 (mínimo); 23:00 -> mañana, tope 360.
revisa('19:00 -> 4 h hasta las 11', minutosHasta('23:00', new Date('2026-11-25T01:00:00Z')) === 240);
revisa('22:50 -> mínimo 15 min', minutosHasta('23:00', new Date('2026-11-25T04:50:00Z')) === 15);
revisa('22:59 -> mínimo 15 min', minutosHasta('23:00', new Date('2026-11-25T04:59:00Z')) === 15);
revisa('23:00 exacto -> tope de 6 h', minutosHasta('23:00', new Date('2026-11-25T05:00:00Z')) === 360);
revisa('las duraciones caben en lo que acepta la base (15–360)', DURACIONES.filter(([k]) => /^\d+$/.test(k)).every(([k]) => Number(k) >= 15 && Number(k) <= 360));

console.log(`qa-live · ${corridas - fallos}/${corridas} pruebas`);
if (fallos) { console.error(`${fallos} prueba(s) de Tanner LIVE fallaron`); process.exit(1); }
