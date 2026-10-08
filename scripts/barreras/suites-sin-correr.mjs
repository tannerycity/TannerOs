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
  const MAX_EXCLUIDAS = 27;
  if (excluidas.length > MAX_EXCLUIDAS)
    errors.push(`Suites: hay ${excluidas.length} excluidas y el tope son ${MAX_EXCLUIDAS}. `
      + 'Excluir una suite es ocultarla: arregla lo que falla o sube el tope a proposito.');
  return errors;
}
