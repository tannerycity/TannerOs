// Ninguna suite se queda sin correr
//
// Una barrera por archivo, a proposito: ver scripts/barreras/README.md.
//
//
// Dos suites (qa-login-credencial y qa-utileria-baja) se perdieron de CI al
// resolver un conflicto entre dos PRs que tocaban el workflow. Siguieron en el
// repo, dejaron de correr, y CI siguio en verde: exactamente el fallo que esas
// suites existian para impedir.
//
// Y esta barrera se perdio a su vez, al resolver OTRO conflicto sobre este
// mismo archivo dos horas despues. El mecanismo de fondo —que el workflow las
// descubra solo— sobrevivio, asi que las suites siguieron corriendo; lo que
// desaparecio fue el vigilante. Dos veces seguidas por la misma via dice que
// el riesgo real de este archivo es la resolucion de conflictos, no el olvido.
//
// Ahora el workflow las descubre solas y esto vigila la unica grieta que
// queda: que alguien silencie una metiendola a la lista de exclusiones. El
// archivo obliga a escribir el motivo, y este contador obliga a que la lista
// no crezca sin que alguien lo note.
// El workflow tiene que seguir descubriendolas solo. Si alguien vuelve a
// escribir la lista a mano, esto lo caza antes de que se pierda otra.
import fs from 'node:fs';

export default function comprobar() {
  const errors = [];
  const suitesEnDisco = fs.readdirSync('scripts').filter(f => /^qa-.*\.mjs$/.test(f)).sort();
  const listaExclusiones = fs.readFileSync('scripts/qa-suites-excluidas.txt', 'utf8');
  const excluidas = listaExclusiones.split('\n').map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));

  for (const nombre of excluidas) {
    if (!suitesEnDisco.includes(nombre)) errors.push(`Suites: se excluye "${nombre}", que ya no existe`);
  }
  const flujo = fs.readFileSync('.github/workflows/tanneros-qa.yml', 'utf8');
  if (!flujo.includes("find scripts -maxdepth 1 -name 'qa-*.mjs'"))
    errors.push('Suites: el workflow dejo de descubrirlas solo; una suite nueva podria no correr nunca');
  if (!flujo.includes('qa-suites-excluidas.txt'))
    errors.push('Suites: el workflow ya no lee la lista de exclusiones');

  // Sube a 9 por los cinco humos de navegador (asistencia, familias, montos,
  // conciliacion y evaluacion): necesitan Chromium y el job static-qa no lo
  // instala. Cada vez que este numero sube tiene que ser por una suite que SI
  // se corre a mano antes de subir, no por una que dejo de pasar.
  // Sube a 10 por qa-humo-mostrador.mjs: levantar un pedido con la familia
  // enfrente es dinero, y lo que protege —que elegir al Tanner baste y que
  // el jersey se estampe con su nombre— sólo se ve en un navegador.
  // Sube a 11 por qa-humo-catalogo.mjs. Presidencia subio las cuatro fotos de
  // los jerseys, la base las guardo con miniatura y la pantalla siguio
  // enseñando cuatro monitos identicos: la lista nunca leyo la miniatura. Que
  // una foto se vea, que sea la suya y no la del de al lado, y que se firme la
  // miniatura y no el original, no se puede comprobar sin pintar la pagina.
  // Sube a 12 por qa-humo-credencial.mjs. Lo que vigila es que el folio, la
  // escuela y la fecha de nacimiento de un menor NO viajen en la tarjeta que
  // la familia sube a una historia, y que esa tarjeta no se genere siquiera
  // sin permiso de imagen. Esa decision vive en el canvas: no hay forma de
  // comprobarla sin pintar la pagina.
  // Sube a 13 por qa-humo-link-publico.mjs. Es la unica tienda que le habla a
  // alguien SIN cuenta: si ahi algo no se puede tocar, la persona cierra la
  // pestaña y el club nunca se entera. Necesita navegador porque lo que vigila
  // —que el nombre estampado y el id legacy de cada pieza lleguen en la
  // llamada— solo existe despues de tocar la pantalla.
  // Sube a 14 por qa-humo-ficha-foto.mjs. Vigila que el boton de la foto del
  // Tanner diga la verdad: decia "Agregar foto" en los 52 Tanners que SI tienen
  // foto, porque la etiqueta se escribia dentro del span del icono. Necesita
  // navegador porque lo que se prueba es lo que una persona LEE en el boton.
  // Sube a 15 por qa-humo-posicion.mjs. Cambiarle la posicion a un Tanner le
  // BORRABA la posicion: el rail vivia dentro de un <label> y el reenvio del
  // click caia en el chip vacio. Necesita navegador porque el segundo click lo
  // genera el navegador, no el codigo — leyendo el JS no se ve.
  // Sube a 16 por qa-humo-fechas-ingreso.mjs. Vigila que solo Presidencia
  // pueda mover las dos fechas de ingreso, que la ficha diga quien las movio y
  // que un reingreso no toque la fecha. Lo que prueba es lo que la pantalla
  // HABILITA y ENSEÑA, asi que necesita pintarla.
  // Sube a 17 por qa-humo-taquilla-tienda.mjs. Vigila que el anticipo de un
  // uniforme se cobre LIGADO a su pedido, con quién de Tannery lo recibió y
  // sin pasarse del saldo. Antes se cobraba como "Otro ingreso · Uniforme" y
  // el pedido nunca se enteraba; eso sólo se ve tocando la pantalla.
  // Sube a 18 por qa-humo-estacionamiento.mjs. Vigila que dar un gafete sean
  // 3 toques, que alta, cobro y entrega viajen en un solo movimiento con
  // método, quién cobró y llave, y que "sin costo" exija motivo. Contar
  // toques sólo se puede tocando la pantalla.
  // Sube a 19 por qa-humo-mensajes.mjs. Vigila los chats internos: que lo
  // nuevo se vea, que reintentar no duplique (misma llave), las palomitas, el
  // "visto por" y que un mensaje con HTML no se ejecute. Todo eso es pintura.
  // Sube a 20 por qa-humo-inicio-cumple-fab.mjs. Vigila la franja de
  // cumpleaños bajo el saludo y el botón flotante: qué acciones ve cada rol,
  // que abra y cierre, y que el menú quepa en el teléfono. Es pintura.
  // Sube a 21 por qa-humo-historial-pagos.mjs. Vigila la sección Pagos de la
  // ficha (y que al profe no le salga), y el buscador de estado de cuenta en
  // Finanzas. Es pintura sobre el RPC de estado de cuenta.
  // Sube a 22 por qa-humo-ajustes-presidencia.mjs. Vigila que Presidencia
  // ajuste, agregue cargos, corrija pagos y aplique saldo a favor desde el
  // estado de cuenta, con motivo y la misma llave al reintentar. Es pintura.
  // Sube a 23 por qa-humo-ficha-tanner.mjs. Vigila el rediseño de la ficha:
  // carta al tocar la foto, beca visible, adeudo por meses, pestañas por rol,
  // familia, documentos e historia. Es pintura.
  // Sube a 24 por qa-humo-terminar-patrocinio.mjs. Vigila el botón "Terminar
  // patrocinio": aviso a la familia, motivo y que llame a la función correcta.
  // Es pintura sobre v2_end_sponsor_funding.
  // Sube a 25 por qa-humo-fichajes-olvidados.mjs. Vigila la tarjeta y la
  // etiqueta de prospectos olvidados en Fichajes y el botón flotante de
  // Operaciones. Es pintura sobre v2_stale_prospects.
  // Sube a 26 por qa-humo-asistencia-fotos.mjs. Vigila que al tomar lista se
  // vean las caras con miniatura y que nunca se firme la foto original
  // (egress). Es pintura sobre v2_attendance_roster_thumbs.
  // Sube a 27 por qa-humo-numeros.mjs. Vigila la hoja de números libres en
  // Levantar pedido y Fichar, y que el número se guarde en el expediente sólo
  // cuando el Tanner no tenía. Es pintura sobre v2_jersey_board.
  // Sube a 28 por qa-humo-pedidos-por-revisar.mjs. Vigila que el link de la
  // tienda diga cómo pagar y que Pedidos avise y confirme por WhatsApp. Es
  // pintura sobre v2_orders_to_review y v2_public_payment_info.
  // Sube a 29 por qa-humo-utileria.mjs. Vigila la Utilería rediseñada (qué
  // tenemos, quién lo tiene, reportes; entregar en tres toques) y que ajustar
  // la cantidad no borre la foto. Es pintura sobre v2_equipment_*.
  // Sube a 30 por qa-humo-asistencia-lista.mjs. Vigila pasar lista en tres
  // toques: todos presentes de entrada, tocar a los que faltaron, opciones
  // con toque largo y mis categorías primero. Es pintura sobre v2_attendance_*.
  // Sube a 31 por qa-humo-becas.mjs. Vigila el portal de becados: que sólo
  // lo abran Presidencia y Dirección, el orden de lo que hay que atender y
  // el mensaje a la familia. Es pintura sobre v2_scholarship_portal.
  // Sube a 32 por qa-humo-partidos.mjs. Vigila capturar un partido en pocos
  // toques: convocados, quién jugó, goles con asistencia y estadísticas. Es
  // pintura sobre v2_match_board, v2_match_sheet y v2_save_match_sheet.
  // Sube a 33 por qa-humo-portal.mjs. Vigila el portal de la plataforma:
  // que sólo lo abra el admin, el tablero de clubes y el alta en cinco pasos
  // con mensaje de bienvenida. Es pintura sobre v2_platform_board y
  // v2_provision_club.
  const MAX_EXCLUIDAS = 33;
  if (excluidas.length > MAX_EXCLUIDAS)
    errors.push(`Suites: hay ${excluidas.length} excluidas y el tope son ${MAX_EXCLUIDAS}. `
      + 'Excluir una suite es ocultarla: arregla lo que falla o sube el tope a proposito.');

  // Desde el 08/10/2026 las suites de navegador SI corren en CI, en el job
  // navegador-qa, que corre toda suite que importe playwright-core. Excluirlas
  // de static-qa ya no las oculta. Lo que esta barrera vigila ahora es que
  // ninguna excluida se quede sin correr en ningun lado: o abre navegador (y
  // la corre navegador-qa), o es una de las dos excepciones anotadas.
  if (!flujo.includes('navegador-qa:') || !flujo.includes(`grep -l "from 'playwright-core'" scripts/qa-*.mjs`))
    errors.push('Suites: el job navegador-qa dejo de descubrir solo las suites de navegador');
  const SIN_NAVEGADOR = {
    'qa-centro-tanner.mjs': 'corre en live-smoke, contra produccion',
    'qa-product-ui.mjs': 'deuda preexistente anotada en qa-suites-excluidas.txt',
  };
  for (const nombre of excluidas) {
    if (SIN_NAVEGADOR[nombre]) continue;
    const codigo = fs.existsSync(`scripts/${nombre}`) ? fs.readFileSync(`scripts/${nombre}`, 'utf8') : '';
    if (!codigo.includes("from 'playwright-core'"))
      errors.push(`Suites: "${nombre}" esta excluida de static-qa pero no abre navegador, asi que no la corre navegador-qa: no corre en ningun lado`);
    if (codigo.includes('/opt/pw-browsers') && !codigo.includes('process.env.CHROME_PATH'))
      errors.push(`Suites: "${nombre}" tiene escrito el Chromium de una maquina; usa process.env.CHROME_PATH para que corra en CI`);
    if (/['"]\/home\/user\//.test(codigo))
      errors.push(`Suites: "${nombre}" tiene escrita la carpeta de una maquina; calcula la raiz desde import.meta.url`);
  }
  return errors;
}
