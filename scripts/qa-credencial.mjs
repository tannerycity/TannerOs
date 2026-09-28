/* La credencial Tanner: qué dice, y qué NO dice cuando se va a redes.
 *
 * Del mismo registro salen dos documentos con trabajos opuestos: la credencial
 * que ve el club —entre más datos útiles, mejor— y la tarjeta que comparte la
 * familia —entre menos, mejor, porque hablamos de menores y de Instagram—.
 *
 * Lo que este archivo vigila sobre todo es la segunda: que el folio, la fecha
 * exacta, la escuela y cualquier teléfono NO se cuelen a una imagen pública, y
 * que esa imagen no se genere sin el permiso de la familia.
 */
import {
  edadDe, edadTexto, pieTexto, renglonesDeCredencial,
  puedeCompartirse, motivoSinCompartir, datosParaRedes, ligaDeBusqueda, HOST_TANNEROS
} from '../credencial.js';

let fallos = 0, corridas = 0;
function revisa(nombre, ok, detalle) {
  corridas++;
  if (!ok) { fallos++; console.error(` - ${nombre}${detalle ? `\n   ${detalle}` : ''}`); }
}

const HOY = new Date('2026-09-28T12:00:00');

/* ===== Edad =====
   Es el dato que la ficha no traía aunque la fecha de nacimiento está
   capturada en el 100% de los Tanners. */
revisa('la edad sale de la fecha de nacimiento', edadDe('2018-03-14', HOY) === 8);
// Un niño que aún no cumple este año tiene un año menos. En categorías
// infantiles ese año es el jugador entero.
revisa('quien todavía no cumple este año tiene un año menos',
  edadDe('2018-12-31', HOY) === 7, String(edadDe('2018-12-31', HOY)));
revisa('quien cumple justo hoy ya los tiene', edadDe('2018-09-28', HOY) === 8);
revisa('y quien cumple mañana todavía no', edadDe('2018-09-29', HOY) === 7);
revisa('un Baby Tanner de dos años se dice en años', edadTexto('2024-01-10', HOY) === '2 años');
revisa('y uno de uno, en singular', edadTexto('2025-01-10', HOY) === '1 año');
// Basura entrando no produce una credencial con una edad imposible impresa.
revisa('sin fecha no se inventa una edad', edadDe(null, HOY) === null && edadDe('', HOY) === null);
revisa('una fecha inválida tampoco', edadDe('no-es-fecha', HOY) === null);
revisa('una fecha en el futuro no imprime una edad negativa',
  edadDe('2030-01-01', HOY) === null, String(edadDe('2030-01-01', HOY)));

/* ===== Pie dominante ===== */
revisa('el pie migrado en inglés se lee en español',
  pieTexto('right') === 'Derecho' && pieTexto('left') === 'Izquierdo');
revisa('y el que ya está en español también', pieTexto('Ambos') === 'Ambos');
revisa('un valor desconocido no se imprime', pieTexto('xyz') === null && pieTexto(null) === null);

/* ===== Los renglones de la credencial =====
   Un renglón con una raya ocupa el mismo lugar que uno con información y no
   sirve de nada: la credencial se lee de pie, con la familia enfrente. */
{
  const filas = renglonesDeCredencial({
    birthDate: '2018-03-14', category: 'T8', dominantFoot: 'right',
    school: 'Colegio Léon', hoy: HOY
  });
  revisa('la credencial completa trae sus tres renglones', filas.length === 3,
    JSON.stringify(filas.map(f => f.etiqueta)));
  // Se vio al renderizarla: "Categoría" salia dos veces en la misma cara.
  revisa('la categoría no se repite: ya sale junto al nombre',
    !filas.some(f => f.etiqueta === 'Categoría'), JSON.stringify(filas.map(f => f.etiqueta)));
  revisa('la edad va primero, que es lo que más se busca',
    filas[0].etiqueta === 'Edad' && filas[0].valor === '8 años', JSON.stringify(filas[0]));
  /* Quien acaba de registrarse es un PROSPECTO, no un Tanner: nadie le ha
     asignado dorsal, y el formulario publico ni siquiera lo pregunta. Una
     credencial que lo enseñara estaria inventando. */
  revisa('un recién registrado NO trae dorsal: todavía no tiene',
    !filas.some(f => f.etiqueta === 'Dorsal'), JSON.stringify(filas.map(f => f.etiqueta)));
  revisa('ni posición, por lo mismo',
    !filas.some(f => f.etiqueta === 'Posición'), JSON.stringify(filas.map(f => f.etiqueta)));
  // Y mandarlos no los cuela: el registro no los tiene de donde sacar.
  revisa('aunque alguien los mande, no se imprimen',
    renglonesDeCredencial({ birthDate: '2018-03-14', jerseyNumber: '7', position: 'Portero', hoy: HOY })
      .length === 1);
}
{
  // El caso real del registro: un Baby Tanner recién inscrito casi no trae nada.
  const filas = renglonesDeCredencial({ birthDate: '2024-05-02', category: 'Baby Tanner', hoy: HOY });
  revisa('un recién registrado no imprime renglones vacíos',
    filas.length === 1, JSON.stringify(filas));
  revisa('y el que sí tiene sale completo',
    filas[0].etiqueta === 'Edad' && filas[0].valor === '2 años', JSON.stringify(filas));
}
revisa('sin ningún dato la credencial no truena', renglonesDeCredencial().length === 0);

/* ===== EL CANDADO QUE ESTE ARCHIVO EXISTE PARA QUE NO SE ABRA =====

   La tarjeta para redes sólo existe si la familia autorizó el uso de la imagen
   del menor. Medido en producción el día que se escribió esto: de 64 Tanners
   activos, 5 autorizaron, 0 negaron y 59 nunca fueron preguntados —los
   migrados del sistema anterior—. */
revisa('con permiso, se puede compartir', puedeCompartirse({ imageConsent: true }));
revisa('sin permiso, NO', !puedeCompartirse({ imageConsent: false }));
// La lectura insegura sería tratar "no me consta" como permiso.
revisa('y "nunca se le preguntó" tampoco es permiso',
  !puedeCompartirse({ imageConsent: null }) && !puedeCompartirse({}));
revisa('un texto que parece sí no es un sí',
  !puedeCompartirse({ imageConsent: 'true' }) && !puedeCompartirse({ imageConsent: 1 }));
// Las dos razones llevan al mismo lado, pero se le dicen distinto a quien mira
// la pantalla: a uno hay que respetarlo, al otro hay que preguntarle.
revisa('a quien negó se le respeta, y se dice así',
  /no autorizó/.test(motivoSinCompartir({ imageConsent: false, imageConsentAt: '2026-09-01' })));
revisa('a quien nunca se le preguntó, se le pregunta',
  /Falta que la familia autorice/.test(motivoSinCompartir({ imageConsent: false })));
revisa('con permiso no hay motivo que mostrar', motivoSinCompartir({ imageConsent: true }) === null);

/* ===== Lo que NO viaja a redes =====
   Una historia de Instagram la ve cualquiera. Esto es de un menor. */
{
  const d = {
    firstName: 'Mauricio', lastName: 'Torres Avila', category: 'Baby Tanner',
    birthDate: '2024-05-02', folio: 'TC-2026-00020', school: 'Jardín Santa Fe',
    phone: '+524770000000', guardian: 'Ana Ávila', photoUrl: 'blob:x', hoy: HOY
  };
  const redes = datosParaRedes(d);
  const texto = JSON.stringify(redes);

  revisa('a redes va el nombre', redes.nombre === 'Mauricio Torres Avila');
  revisa('y la categoría, que es lo que se presume', redes.categoria === 'Baby Tanner');
  revisa('y la edad, que es parte del orgullo y no ubica a nadie', redes.edad === '2 años');

  revisa('el FOLIO no viaja a redes: es un número interno', !/TC-2026-00020/.test(texto), texto);
  revisa('la FECHA DE NACIMIENTO no viaja: ubica a un menor', !/2024-05-02/.test(texto), texto);
  revisa('la ESCUELA no viaja: dice dónde encontrarlo todos los días',
    !/Jardín Santa Fe/i.test(texto), texto);
  revisa('el TELÉFONO no viaja, en ningún caso', !/477|\+52/.test(texto), texto);
  revisa('el nombre del tutor tampoco', !/Ana Ávila/i.test(texto), texto);
  // Y sólo lo que se declaró: si mañana alguien agrega un campo al registro,
  // no se cuela solo a la imagen pública.
  revisa('a redes va exactamente lo declarado y nada más',
    Object.keys(redes).sort().join(',') === 'categoria,edad,fotoUrl,nombre',
    Object.keys(redes).join(','));
}

/* ===== El QR ===== */
revisa('el QR abre el buscador con el folio',
  ligaDeBusqueda('TC-2026-00020') === `${HOST_TANNEROS}/v2/?buscar=TC-2026-00020`,
  ligaDeBusqueda('TC-2026-00020'));
revisa('un folio con caracteres raros se escapa y no rompe la liga',
  ligaDeBusqueda('A B&C') === `${HOST_TANNEROS}/v2/?buscar=A%20B%26C`, ligaDeBusqueda('A B&C'));
revisa('sin folio no se imprime un QR que no lleva a ningún lado',
  ligaDeBusqueda('') === null && ligaDeBusqueda(null) === null);
revisa('la liga apunta al dominio del club, no a otro',
  ligaDeBusqueda('X').startsWith('https://app.tannerycity.com/'));

console.log(fallos
  ? `Credencial QA FAILED · ${fallos} de ${corridas}`
  : `Credencial QA OK · ${corridas} casos, incluido el folio que no debe llegar a Instagram`);
process.exit(fallos ? 1 : 0);
