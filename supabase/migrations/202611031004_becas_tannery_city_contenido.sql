-- BECAS TANNERY CITY — contenido oficial en Centro Tanner.
--
-- Ya existía contenido viejo bajo categoría 'becas' (TC-010 Becas, TC-011
-- Curtibrother) escrito ANTES de este protocolo — con porcentajes rígidos y
-- sin las 7 modalidades. Se actualizan en su lugar (mismo slug/código, no se
-- duplican) para que el buscador nunca muestre dos versiones distintas de la
-- misma regla. TC-009 (Beneficio Familiar Hermanos Tanners) es harina de otro
-- costal — un descuento por hermanos, no una beca — y no se toca.
do $$
declare v_org uuid;
begin
  select id into v_org from public.organizations where slug='tannery-city-fc' limit 1;
  if v_org is null then select id into v_org from public.organizations limit 1; end if;
  if v_org is null then return; end if;

  -- ---------------------------------------------------------------------
  -- TC-010 Becas → se convierte en la página general "Becas Tannery City".
  -- ---------------------------------------------------------------------
  update app.policies set
    title='Becas Tannery City',
    short_answer='En Tannery City ayudamos a quien lo merece y lo necesita. Las becas reconocen talento, esfuerzo, excelencia, lealtad o necesidad; nunca sustituyen el compromiso. Los apoyos comienzan desde el 10% y Tannery City determina el porcentaje final de cada caso.',
    official_content='En Tannery City ayudamos a quien lo merece y lo necesita, siempre desde el compromiso, la disciplina y la comunidad.

Las becas reconocen talento, esfuerzo, excelencia, lealtad o necesidad; nunca sustituyen el compromiso. Todas las becas, apoyos y excepciones quedan sujetas a evaluación de Tannery City.

Existen 7 modalidades: Apoyo de Ingreso, Beca de Apoyo Familiar, Beca Académica, Beca Deportiva, Beca Tanner, Beca Lealtad Tanner y Curtibrother. Cada una tiene su propia página con requisitos, cómo se accede y qué puede cubrir.

Un jugador puede cumplir requisitos de varias modalidades, pero solo puede existir un beneficio económico activo por jugador: las becas no se suman.

IMPORTANTE: Las becas y apoyos Tannery City no son automáticos ni permanentes. Cada solicitud o nominación es evaluada individualmente. Tannery City determina la aprobación, porcentaje, duración, cobertura y condiciones de cada apoyo.',
    keywords=array['beca','becas','ayuda','descuento','apoyo economico','no puedo pagar','no tengo dinero','cuanto descuento','cuanto dan','como solicito','donde pido beca','dos becas','acumular becas'],
    effective_date=current_date, version=version+1, published_at=now(), updated_at=now()
  where organization_id=v_org and slug='becas';

  -- ---------------------------------------------------------------------
  -- TC-011 Curtibrother → protocolo completo.
  -- ---------------------------------------------------------------------
  update app.policies set
    short_answer='Programa de apadrinamiento externo: una persona, empresa u organización financia el apoyo de uno o más Tanners. Tannery City vende y da seguimiento; la familia conecta.',
    official_content='¿Para quién es? Para familias que conocen a una persona, empresa u organización que podría apadrinar a su Tanner — o a un fondo general del club.

¿Qué necesito? Solo presentar al posible padrino. Tannery City se encarga de contactar, presentar, negociar y cerrar.

¿Cómo accedo? Presenta a tu posible padrino desde Centro Tanner. No necesitas vender ni cerrar el patrocinio tú mismo.

Tanner por Tanner: obligatorio cuando la familia recibe el apoyo.

¿Qué puede cubrir? Mensualidad, inscripción, uniforme cuando corresponda, o los conceptos expresamente autorizados — puede financiar a un jugador específico, un fondo general o un programa especial.

¿Cuánto puede ser? Lo que el padrino y Tannery City acuerden. Cuando Curtibrother financia al jugador, puede reemplazar el apoyo que daba directamente el club, liberando ese recurso para otro Tanner. Si el padrino deja de pagar, el caso vuelve a evaluación — la beca anterior no se reactiva automáticamente.

¿Cuánto dura? Normalmente conforme a la duración del patrocinio, habitualmente un año. Tannery City puede definir otro periodo.

¿Tiene cuota de evaluación? No. Curtibrother no es una solicitud ordinaria de beca interna.

Siguiente paso: PRESENTAR POSIBLE PADRINO.',
    keywords=array['curtibrother','padrino','patrocinador','empresa','patron','apadrinar','sponsor'],
    effective_date=current_date, version=version+1, published_at=now(), updated_at=now()
  where organization_id=v_org and slug='curtibrother';

  -- ---------------------------------------------------------------------
  -- Modalidades nuevas.
  -- ---------------------------------------------------------------------
  insert into app.policies(organization_id,policy_code,slug,title,category,scope,short_answer,official_content,keywords,status,version,effective_date,published_at)
  values (v_org,'TC-135','apoyo-de-ingreso','Apoyo de Ingreso','becas','tannery_city',
    'Para familias nuevas que hoy no pueden pagar completo. Apoyo temporal desde el día 1, sin cuota de evaluación.',
    '¿Para quién es? "Soy una familia nueva y hoy no puedo pagar completo." Permite que un nuevo Tanner pueda ingresar cuando existe una necesidad económica desde el inicio. Es un apoyo temporal, no una beca ordinaria.

¿Qué necesito? Jugador, tutor, fecha de nacimiento, una explicación breve de la situación, un mensaje o carta motivo, y recomendación interna cuando exista. Tannery City podrá solicitar información adicional. Puede solicitarse desde el día 1, y también puede canalizarlo el caso personal de Tannery City.

¿Cómo accedo? Lo solicita mamá, papá o tutor directamente.

Tanner por Tanner: aplica obligatoriamente.

¿Qué puede cubrir? Normalmente mensualidad, y la inscripción cuando se autorice.

¿Cuánto puede ser? Apoyos desde 10%. El porcentaje lo determina Tannery City según el análisis del caso.

¿Cuánto dura? Normalmente entre 1 y 3 meses, pero la duración definitiva siempre la determina Tannery City. Después puede terminar, modificarse, ampliarse o convertirse en Beca de Apoyo Familiar.

¿Tiene cuota de evaluación? No. El objetivo de este apoyo es atender precisamente a una familia con dificultad económica desde el ingreso.

Siguiente paso: SOLICITAR APOYO.',
    array['apoyo de ingreso','acabo de entrar','familia nueva','no puedo pagar','ingreso','inscripcion','recien ingresado'],
    'published',1,current_date,now())
  on conflict (organization_id, slug) do nothing;

  insert into app.policies(organization_id,policy_code,slug,title,category,scope,short_answer,official_content,keywords,status,version,effective_date,published_at)
  values (v_org,'TC-136','beca-de-apoyo-familiar','Beca de Apoyo Familiar','becas','tannery_city',
    'Para familias ya en el club cuya situación económica cambió. Evita la deserción de jugadores comprometidos. Cuota de evaluación $200 MXN.',
    '¿Para quién es? "Mi hijo ya está en Tannery City, pero nuestra situación económica cambió." Evita la deserción de jugadores comprometidos debido a una necesidad económica real: pérdida de empleo, enfermedad, separación familiar, reducción significativa de ingresos, gastos extraordinarios u otra situación familiar extraordinaria.

¿Qué necesito? Mínimo 3 meses en Tannery City (se pueden revisar casos extraordinarios). Carta o mensaje motivo, entrevista, estudio socioeconómico ligero, datos del jugador, fecha de nacimiento y evidencia cuando Tannery City la solicite. Debe existir compromiso real del jugador y su familia.

¿Cómo accedo? La familia solicita directamente.

Tanner por Tanner: obligatorio.

¿Qué puede cubrir? Normalmente mensualidad, y la inscripción cuando se autorice.

¿Cuánto puede ser? Apoyos desde 10%. El porcentaje lo determina Tannery City según el análisis del caso.

¿Cuánto dura? La duración la determina Tannery City en el dictamen del apoyo; como referencia, las becas ordinarias pueden revisarse en ciclos de hasta 6 meses.

¿Tiene cuota de evaluación? Sí, $200 MXN. Presidencia puede autorizar una excepción cuando la misma vulnerabilidad económica haga injustificado cobrarla.

Siguiente paso: INICIAR SOLICITUD.',
    array['apoyo familiar','perdi mi trabajo','enfermedad','situacion economica','problemas economicos','ya estoy en el club'],
    'published',1,current_date,now())
  on conflict (organization_id, slug) do nothing;

  insert into app.policies(organization_id,policy_code,slug,title,category,scope,short_answer,official_content,keywords,status,version,effective_date,published_at)
  values (v_org,'TC-137','beca-academica','Beca Académica','becas','tannery_city',
    'Para Tanners con buen promedio y buena conducta escolar. Promueve estudio + deporte + disciplina integral. Cuota de evaluación $200 MXN.',
    '¿Para quién es? "Tengo buen promedio y buena conducta escolar." Promueve estudio, deporte y disciplina integral.

¿Qué necesito? Mínimo 3 meses en el club, promedio mínimo de 9.0, buena conducta escolar, boleta o constancia con actualización trimestral, buena asistencia en Tannery City y comportamiento adecuado.

¿Cómo accedo? La familia puede solicitarla directamente.

Tanner por Tanner: voluntario.

¿Qué puede cubrir? Normalmente mensualidad, y la inscripción cuando se autorice.

¿Cuánto puede ser? Apoyos desde 10%. El porcentaje lo determina Tannery City según el análisis del caso.

¿Cuánto dura? La duración la determina Tannery City en el dictamen del apoyo; como referencia, las becas ordinarias pueden revisarse en ciclos de hasta 6 meses.

¿Tiene cuota de evaluación? Sí, $200 MXN.

Siguiente paso: SUBIR BOLETA.',
    array['beca academica','promedio','promedio 9','boleta','escuela','buenas calificaciones','calificaciones'],
    'published',1,current_date,now())
  on conflict (organization_id, slug) do nothing;

  insert into app.policies(organization_id,policy_code,slug,title,category,scope,short_answer,official_content,keywords,status,version,effective_date,published_at)
  values (v_org,'TC-138','beca-deportiva','Beca Deportiva','becas','tannery_city',
    'Para Tanners que destacan por su rendimiento o potencial futbolístico. Es por nominación interna: la familia no la solicita directamente.',
    '¿Para quién es? "Destaco por mi rendimiento o potencial futbolístico." Atrae y retiene talento, premia rendimiento y desarrolla jugadores de alto potencial.

¿Qué necesito? Mínimo 3 meses en el club (los casos deportivos extraordinarios pueden revisarse antes). Se evalúa rendimiento, potencial, técnica, inteligencia de juego, desempeño en partido, asistencia, actitud, disciplina, mentalidad, capacidad de aprendizaje, comunicación y trabajo en equipo.

¿Cómo accedo? La familia NO solicita directamente esta beca. Es por nominación del entrenador, Dirección Deportiva o Presidencia.

Tanner por Tanner: voluntario.

¿Qué puede cubrir? Normalmente mensualidad, y la inscripción cuando se autorice.

¿Cuánto puede ser? Apoyos desde 10%. El porcentaje lo determina Tannery City según el análisis del caso.

¿Cuánto dura? La duración la determina Tannery City en el dictamen del apoyo.

¿Tiene cuota de evaluación? No. Es una nominación interna, no una solicitud familiar.

Siguiente paso: CONOCER CÓMO FUNCIONA — espera a que tu entrenador o Dirección Deportiva te nomine.',
    array['beca deportiva','talento','jugador bueno','entrenador me nomino','rendimiento','potencial'],
    'published',1,current_date,now())
  on conflict (organization_id, slug) do nothing;

  insert into app.policies(organization_id,policy_code,slug,title,category,scope,short_answer,official_content,keywords,status,version,effective_date,published_at)
  values (v_org,'TC-139','beca-tanner','Beca Tanner','becas','tannery_city',
    'Reconoce al jugador integral que representa los valores Tanner dentro y fuera de la cancha. Especial, escasa y prestigiosa — por nominación interna.',
    '¿Para quién es? "Represento los valores Tanner dentro y fuera de la cancha." Reconoce al jugador integral que representa la cultura de Tannery City. Es una beca especial, escasa y prestigiosa.

¿Qué necesito? Mínimo 3 meses en el club y acreditar 3 meses consecutivos con promedio escolar mínimo de 9.0. Se valoran respeto, disciplina, liderazgo, humildad, compañerismo, compromiso, pertenencia, asistencia, comportamiento y amor por Tannery City.

¿Cómo accedo? La familia NO puede solicitarla directamente. Es por nominación del entrenador, Dirección Deportiva o Presidencia.

Tanner por Tanner: voluntario.

¿Qué puede cubrir? Normalmente mensualidad, y la inscripción cuando se autorice.

¿Cuánto puede ser? Apoyos desde 10%. El porcentaje lo determina Tannery City según el análisis del caso.

¿Cuánto dura? La duración la determina Tannery City en el dictamen del apoyo.

¿Tiene cuota de evaluación? No. Es nominación interna.

Siguiente paso: CONOCER BECA TANNER — espera a que tu entrenador, Dirección Deportiva o Presidencia te nomine.',
    array['beca tanner','valores','disciplina','liderazgo','representa al club','nominacion'],
    'published',1,current_date,now())
  on conflict (organization_id, slug) do nothing;

  insert into app.policies(organization_id,policy_code,slug,title,category,scope,short_answer,official_content,keywords,status,version,effective_date,published_at)
  values (v_org,'TC-140','beca-lealtad-tanner','Beca Lealtad Tanner','becas','tannery_city',
    'Reconoce permanencia, lealtad y compromiso familiar: 18 meses continuos en el club. Cuota de evaluación $200 MXN.',
    '¿Para quién es? "Llevamos mucho tiempo en Tannery City y hemos sido constantes." Reconoce permanencia, lealtad, puntualidad, asistencia y compromiso familiar.

¿Qué necesito? 18 meses continuos, pagos al corriente, buena conducta, asistencia y participación familiar, y buen historial. La continuidad puede romperse por baja, salida y reingreso, adeudos, pausa prolongada, inactividad o ausencia prolongada no autorizada. La excepción de antigüedad no se otorga automáticamente.

¿Cómo accedo? La familia puede solicitarla directamente a partir de los 18 meses continuos.

Tanner por Tanner: voluntario.

¿Qué puede cubrir? Normalmente mensualidad, y la inscripción cuando se autorice.

¿Cuánto puede ser? Apoyos desde 10%. El porcentaje lo determina Tannery City según el análisis del caso.

¿Cuánto dura? La duración la determina Tannery City en el dictamen del apoyo; como referencia, las becas ordinarias pueden revisarse en ciclos de hasta 6 meses.

¿Tiene cuota de evaluación? Sí, $200 MXN.

Siguiente paso: VALIDAR ANTIGÜEDAD.',
    array['lealtad tanner','antiguedad','18 meses','llevo mucho tiempo','permanencia'],
    'published',1,current_date,now())
  on conflict (organization_id, slug) do nothing;

  insert into app.policies(organization_id,policy_code,slug,title,category,scope,short_answer,official_content,keywords,status,version,effective_date,published_at)
  values (v_org,'TC-141','tanner-por-tanner','Tanner por Tanner','becas','tannery_city',
    'Programa de comunidad y reciprocidad: tu manera de ayudarnos a que la misma oportunidad llegue a alguien más.',
    'Tannery City se compromete contigo. Tanner por Tanner es tu manera de ayudarnos a que esa misma oportunidad llegue a alguien más.

¿Para quién es? Aplica obligatoriamente a Apoyo de Ingreso, Beca de Apoyo Familiar y Curtibrother. Es voluntario para Beca Deportiva, Beca Académica, Beca Tanner y Beca Lealtad Tanner.

¿Qué necesito? Cada trimestre: 2 niños referidos más 1 contacto comercial. Un niño referido válido necesita una referencia real — idealmente visita, clase muestra, semana muestra o contacto real con el club; la familia no necesita conseguir que se inscriba. Un contacto comercial válido se registra con nombre, teléfono, empresa cuando corresponda, relación y autorización o introducción — puede ser un patrón, empresario, negocio, familiar, conocido, patrocinador, aliado o posible Curtibrother.

¿Cómo accedo? Se evalúa la acción, no la venta. La familia no necesita vender, cerrar, cobrar, convencer ni garantizar patrocinio o inscripción. Tannery City contacta, presenta, da seguimiento, vende, negocia y cierra.

¿Qué pasa si no cumplo? El incumplimiento no cancela automáticamente el apoyo. Sigue una secuencia: recordatorio, seguimiento, advertencia y revisión del caso. Puede provocar mantenimiento, reducción, suspensión o terminación. El buen desempeño puede tomarse positivamente para una futura revisión o mejora de porcentaje — nunca es automático.

Siguiente paso: REGISTRAR REFERIDO O CONTACTO desde tu Portal de familia.',
    array['tanner por tanner','referidos','traer ninos','contacto comercial','tengo que vender','conseguir patrocinador','reciprocidad'],
    'published',1,current_date,now())
  on conflict (organization_id, slug) do nothing;

  insert into app.policies(organization_id,policy_code,slug,title,category,scope,short_answer,official_content,keywords,status,version,effective_date,published_at)
  values (v_org,'TC-142','cuota-de-evaluacion-de-beca','Cuota de evaluación de beca','becas','tannery_city',
    'Las becas solicitadas directamente por una familia tienen una cuota administrativa de evaluación de $200 MXN. No garantiza aprobación ni un porcentaje específico, y no es reembolsable.',
    'Las becas solicitadas directamente por una familia tendrán una cuota administrativa de evaluación de $200 MXN.

¿Para qué es? Evita solicitudes sin fundamento y cubre el proceso administrativo de recepción, validación, revisión, evaluación, comité y dictamen. El pago de $200 corresponde únicamente al proceso de evaluación. No garantiza aprobación ni un porcentaje específico.

¿Es reembolsable? No. Una vez iniciado el proceso, la cuota no es reembolsable independientemente del resultado.

¿A qué aplica? Beca Académica, Beca Lealtad Tanner y Beca de Apoyo Familiar (salvo excepción autorizada).

¿A qué NO aplica? Apoyo de Ingreso, Beca Deportiva, Beca Tanner y Curtibrother — ninguna de estas cobra cuota.

¿Puede exentarse? Sí, Presidencia puede exentar la cuota en un caso de necesidad económica extraordinaria.

Siguiente paso: PAGAR $200 E INICIAR EVALUACIÓN.',
    array['cuota de beca','200 pesos','cuanto cuesta pedir beca','me regresan los 200','pagar beca','evaluacion'],
    'published',1,current_date,now())
  on conflict (organization_id, slug) do nothing;
end $$;
