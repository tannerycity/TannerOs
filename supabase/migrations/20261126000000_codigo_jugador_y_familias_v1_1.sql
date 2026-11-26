-- Código del Jugador Tanner v1.1 y Código de las Familias Tanner v1.1
-- (26/11/2026). Mich adjuntó ambos documentos completos (zip con .md/.docx/.pdf)
-- y una "MISIÓN" de integración. Antes de escribir una sola línea se comparó
-- artículo por artículo contra Cultura y Convivencia Tanner v1.0 (OFICIAL,
-- app.consent_documents code='codigo_convivencia'): son desarrollos más
-- detallados de los mismos compromisos, sin contradicciones — no hubo que
-- resolver ningún conflicto normativo.
--
-- Arquitectura reutilizada (NO se crea nada nuevo): el Portal de familias ya
-- lista TODOS los app.consent_documents activos de la organización sin lista
-- fija de códigos (private.portal_paperwork, 09/09/2026) — en cuanto estos
-- dos documentos quedan "active", aparecen solos como pendientes de firmar,
-- con versión, fecha, tutor y jugador ya resueltos por ese mecanismo.
--
-- Cultura y Convivencia Tanner v1.0 NO se sustituye ni se reescribe: se le
-- agrega un párrafo de referencia a los dos códigos nuevos (ver más abajo) y
-- se sube su version de registro a 2 — su contenido v1.0 sigue intacto.
--
-- Pendiente de decidir por Presidencia (no bloquea esta integración, igual
-- que advierte la MISIÓN en su punto 8): fecha oficial de entrada en vigor
-- distinta a la de publicación, si se desea una. Por default, vigente desde
-- hoy, igual que el resto de documentos de Centro Tanner en esta sesión.

do $$
declare v_org uuid; v_doc_jug app.consent_documents; v_doc_fam app.consent_documents; v_doc_conv app.consent_documents;
begin
  select id into v_org from public.organizations where slug='tannery-city-fc' limit 1;
  if v_org is null then select id into v_org from public.organizations limit 1; end if;
  if v_org is null then return; end if;

  -- ===== Código del Jugador Tanner v1.1 =====
  insert into app.consent_documents(organization_id, code, title, body, version, required, active, effective_date, published_at)
  values (v_org, 'codigo_jugador', 'Código del Jugador Tanner',
'RESPETAMOS. COMPETIMOS. NOS CUIDAMOS.
Ser Tanner es jugar con energía, aprender y tratar bien a los demás.

Documento complementario de Cultura y Convivencia Tanner v1.0. Aplica a todos los jugadores de Tannery City durante entrenamientos, partidos, torneos, viajes, eventos, dentro de las instalaciones y en espacios digitales relacionados con el club. Las reglas se explican según la edad; Baby Tanners requiere ejemplos y apoyo del adulto.

Mis 12 compromisos Tanner:
1. Hablo con respeto. No digo groserías ni insulto, aunque esté enojado. Nunca digo palabras para humillar a otro niño, rival, árbitro, Formador o familia.
2. No hago bullying. No me burlo, excluyo a propósito, amenazo, discrimino ni pongo apodos que lastiman.
3. Mis manos y gestos respetan. No golpeo, empujo por enojo, hago señas ofensivas ni provoco peleas.
4. Animo a mi equipo. Si alguien falla, lo apoyo. No le grito que es malo ni lo culpo por perder.
5. Escucho al Formador. Pongo atención cuando explica, sigo las reglas de seguridad y puedo preguntar con respeto.
6. Respeto al Formador. No lo insulto, amenazo ni lo desafío con agresiones. Puedo decir si algo me incomoda o pedir ayuda a otro adulto seguro.
7. Visto como Tanner. Asisto con el uniforme oficial completo que corresponda a la actividad; no uso camisetas o uniformes de otros clubes como sustituto, salvo excepción autorizada.
8. Cuido mis cosas y la cancha. Respeto balones, porterías, vestidores, instalaciones y material de los demás.
9. Juego limpio. Respeto reglas, árbitros, rivales y compañeros. Compito con fuerza, nunca para lastimar.
10. Me esfuerzo y aprendo. Llego preparado, participo y entiendo que equivocarme es parte de mejorar.
11. Pido ayuda. Si alguien me molesta, lastima o hace sentir inseguro, se lo cuento al Formador, Dirección Deportiva, Presidencia o un adulto de confianza.
12. Si me equivoco, lo reparo. Escucho, asumo mi conducta y participo en una solución segura; no se me obliga a reconciliarme ni a pedir perdón frente a todos.

Importante: gritar «¡solo!», pedir un pase, celebrar un gol y animar con respeto SÍ está permitido. Gritar para insultar, amenazar o humillar NO.

Regla del uniforme:
• El uniforme oficial completo aplicable a entrenamiento o partido es obligatorio conforme a las instrucciones de la categoría y el Reglamento Tanner vigente.
• No se sustituye por uniformes de otros equipos, salvo una excepción expresamente autorizada.
• Si el club no ha entregado una prenda, o existe una circunstancia económica, médica, logística o de seguridad justificada, la familia informa por el canal oficial para acordar una solución temporal.
• No se humilla ni exhibe públicamente al niño por un asunto de uniforme.
• La ropa y el calzado deben ser seguros para la actividad.

¿Qué pasa si incumplo? La prioridad es enseñar, proteger y corregir; no etiquetar al niño.
• Conducta aislada y leve: el Formador detiene el comportamiento, explica la regla y escucha al jugador; registra si corresponde.
• Conducta repetida o con daño: se informa en privado a la familia y Dirección Deportiva; se acuerda una medida educativa y seguimiento.
• Amenazas creíbles, violencia, acoso grave, abuso sospechado o riesgo: se protege inmediatamente a los involucrados, se comunica a Dirección Deportiva/Presidencia y se activan las instancias competentes cuando corresponda.
• Medidas significativas y expulsión definitiva: las resuelve Presidencia, con revisión del contexto, escucha apropiada a la edad y constancia documental.
No hay suspensión automática por una grosería ni duración de suspensión predeterminada. No se publican nombres ni sanciones en grupos.

Cómo reporto algo que me preocupa: puedo hablar con mi Formador, con Dirección Deportiva, Presidencia o usar el WhatsApp oficial del club con ayuda de mi familia. Si el Formador está involucrado, no tengo que reportarle primero. Ante riesgo inmediato se busca protección y ayuda competente de inmediato.

Versión para el niño (60 segundos): «Soy Tanner. Me gusta jugar, aprender y ser equipo. No insulto, no me burlo y no lastimo. Escucho a mis profes, cuido la cancha y vengo con mi uniforme. Si alguien se equivoca, lo animo. Si algo me preocupa, pido ayuda. Y si yo me equivoco, aprendo y lo arreglo. ¡Juego con energía y respeto!»

El padre, madre o tutor acepta digitalmente la versión vigente de este código. El niño recibe una explicación adaptada a su edad; no se exige a niños pequeños una firma contractual.

Fuente normativa vinculada: Cultura y Convivencia Tanner v1.0 (oficial), Reglamento Tanner vigente, protocolos de protección de menores y Aviso de privacidad.

FÚTBOL CURTIDO · EL RESPETO TAMBIÉN SE ENTRENA.',
  1, true, true, current_date, now())
  on conflict (organization_id, code) do nothing
  returning * into v_doc_jug;
  if v_doc_jug.id is null then select * into v_doc_jug from app.consent_documents where organization_id=v_org and code='codigo_jugador'; end if;

  insert into app.consent_document_versions(document_id, version, title, body, required, effective_date, published_at)
  values (v_doc_jug.id, 1, v_doc_jug.title, v_doc_jug.body, v_doc_jug.required, v_doc_jug.effective_date, v_doc_jug.published_at)
  on conflict (document_id, version) do nothing;

  -- ===== Código de las Familias Tanner v1.1 =====
  insert into app.consent_documents(organization_id, code, title, body, version, required, active, effective_date, published_at)
  values (v_org, 'codigo_familias', 'Código de las Familias Tanner',
'LA GRADA ANIMA, NO DIRIGE.
Nuestro hijo juega su fútbol. Nosotros acompañamos con respeto.

Documento complementario de Cultura y Convivencia Tanner v1.0. Aplica a madres, padres, tutores y acompañantes durante entrenamientos, partidos, torneos, viajes, eventos, instalaciones y comunicación digital vinculada con Tannery City. El tutor debe compartir estas reglas con los adultos que acompañen al jugador.

Nuestros 12 compromisos como familia:
1. Animamos sin dirigir. Aplaudimos, celebramos y alentamos. No damos órdenes tácticas desde la tribuna ni competimos con las indicaciones del Formador.
2. Respetamos a todos. No insultamos, amenazamos, discriminamos, provocamos ni agredimos a árbitros, entrenadores, jugadores, rivales, vecinos o familias.
3. El fútbol es del niño. No lo presionamos para cumplir nuestros sueños ni lo humillamos por errores, resultados, minutos o convocatorias.
4. Respetamos las decisiones deportivas. Podemos solicitar explicaciones y formular quejas de manera respetuosa, sin hostigar al cuerpo técnico.
5. Cuidamos la convivencia. No iniciamos peleas, confrontaciones, rumores ni campañas para desacreditar a personas del club.
6. Cuidamos lo que publicamos. No difundimos ataques, amenazas, datos privados, imágenes de otros menores sin autorización ni expedientes disciplinarios.
7. Usamos bien WhatsApp. Los grupos oficiales son para logística, avisos y comunidad; no son espacios para confrontar, hostigar ni exhibir niños o familias.
8. También respondemos por conductas digitales relevantes. En grupos externos, el club interviene únicamente cuando hay amenazas, acoso, difusión indebida de datos de menores u otros hechos que afecten de forma real al club o a sus integrantes; no por opiniones críticas respetuosas.
9. Seguimos los canales de atención. En asuntos ordinarios: Formador → Dirección Deportiva o Administración, según el tema → Presidencia. Cuando el Formador esté implicado, o exista riesgo, se permite reporte directo.
10. Respetamos instalaciones y vecindario. Evitamos gritos ofensivos, ruido excesivo y objetos o instrumentos prohibidos por reglas vigentes del parque. Animar con respeto está permitido.
11. Colaboramos con los compromisos del club. Cumplimos reglas de uniforme, seguridad, entregas, logística y pagos establecidos en el reglamento vigente; las medidas al adulto no se trasladan automáticamente al niño.
12. Cuidamos a todos los menores. Si observamos maltrato, acoso o riesgo, lo reportamos sin difundirlo ni investigar personalmente a los niños involucrados.

Cómo expresar una inconformidad:
• Tema deportivo o de entrenamiento: conversar primero, en un momento adecuado y fuera de la actividad, con el Formador. Si no se resuelve, acudir a Dirección Deportiva.
• Tema administrativo, pagos o instalaciones: dirigirse a Administración por el WhatsApp oficial.
• Asunto que no se resuelve o sea grave: elevar a Presidencia.
• Seguridad infantil, abuso, agresión, amenazas o personal involucrado: saltarse el escalón habitual y reportar directamente a Dirección Deportiva, Presidencia, WhatsApp oficial o autoridades competentes según el caso.
Las quejas hechas de buena fe, las preguntas respetuosas y el reporte de riesgos no son infracciones, incluso si incomodan al club. No se toleran represalias.

WhatsApp, redes sociales y grupos: en grupos oficiales mantener temas pertinentes, trato respetuoso y privacidad de menores; Administración podrá moderar sin eliminar el derecho a quejarse por canales formales. En grupos externos, el club no controla opiniones privadas y solo interviene ante amenazas, hostigamiento, discriminación, suplantación o divulgación no autorizada de datos de menores. Discrepar no es causar «problemas» por sí mismo. En fotos y videos, respetar consentimientos y avisos de privacidad; no publicar material que exponga a otros menores o incidentes disciplinarios.

Conductas y consecuencias: las medidas se aplican de forma proporcional, con evidencia, escucha de las partes, revisión del contexto y comunicación privada.
• Incidente leve: recordatorio o advertencia privada y seguimiento cuando corresponda.
• Reincidencia, hostigamiento o alteración significativa de la convivencia: advertencia formal, acuerdo de conducta y posibles restricciones proporcionadas de acceso a instalaciones, grupos oficiales o asistencia a partidos.
• Amenazas, agresión, violencia o riesgo para menores: medidas inmediatas de protección; Presidencia decide restricciones importantes o expulsión definitiva del adulto, y se contacta a autoridades cuando corresponda.
La restricción debe identificar a qué adulto aplica, qué espacios comprende, motivo, duración o condición de revisión y vía para presentar su versión. La sanción al adulto no sanciona automáticamente al niño. No se aplican expulsiones automáticas por desacuerdo o crítica respetuosa, ni se hacen públicas sanciones o expedientes.

La comunicación disciplinaria se realiza de manera privada mediante el WhatsApp oficial del club, con registro interno limitado al personal autorizado. El Consejo de Familias no funciona como tribunal disciplinario ni accede a expedientes individuales.

Cada padre, madre o tutor responsable acepta digitalmente la versión vigente de este código.

Fuente normativa vinculada: Cultura y Convivencia Tanner v1.0 (oficial), Reglamento Tanner vigente, protocolos de protección de menores, reglas vigentes del parque y Aviso de privacidad.

FÚTBOL CURTIDO · LA GRADA ANIMA, NO DIRIGE.',
  1, true, true, current_date, now())
  on conflict (organization_id, code) do nothing
  returning * into v_doc_fam;
  if v_doc_fam.id is null then select * into v_doc_fam from app.consent_documents where organization_id=v_org and code='codigo_familias'; end if;

  insert into app.consent_document_versions(document_id, version, title, body, required, effective_date, published_at)
  values (v_doc_fam.id, 1, v_doc_fam.title, v_doc_fam.body, v_doc_fam.required, v_doc_fam.effective_date, v_doc_fam.published_at)
  on conflict (document_id, version) do nothing;

  -- ===== Cultura y Convivencia Tanner v1.0: referencia, no reemplazo =====
  select * into v_doc_conv from app.consent_documents where organization_id=v_org and code='codigo_convivencia';
  if v_doc_conv.id is not null and v_doc_conv.body not like '%Código del Jugador Tanner v1.1%' then
    update app.consent_documents set
      version = v_doc_conv.version + 1,
      published_at = now(),
      body = v_doc_conv.body || '

Este código se complementa con el Código del Jugador Tanner v1.1 y el Código de las Familias Tanner v1.1, que desarrollan estos mismos compromisos con más detalle. Puedes consultarlos en Centro Tanner.'
    where id = v_doc_conv.id;

    insert into app.consent_document_versions(document_id, version, title, body, required, effective_date, published_at)
    select id, version, title, body, required, effective_date, published_at from app.consent_documents where id = v_doc_conv.id
    on conflict (document_id, version) do nothing;

    insert into app.centro_tanner_changes(organization_id,version_label,title,description,effective_date,status,related_document_code,published_at)
    select v_org, 'v' || version || ' · 26 nov 2026', 'Referencia a los nuevos códigos',
      'Cultura y Convivencia Tanner v1.0 ahora referencia al Código del Jugador Tanner v1.1 y al Código de las Familias Tanner v1.1 — su contenido original no cambió.',
      current_date, 'published', 'codigo_convivencia', now()
    from app.consent_documents where id = v_doc_conv.id;
  end if;

  -- ===== Changelog de Centro Tanner =====
  insert into app.centro_tanner_changes(organization_id,version_label,title,description,effective_date,status,related_document_code,published_at)
  values
  (v_org, 'v1 · 26 nov 2026', 'Nuevo: Código del Jugador Tanner',
    'Documento complementario de Cultura y Convivencia Tanner v1.0: los 12 compromisos del jugador, la regla del uniforme y qué pasa si se incumple. Se acepta digitalmente desde el Portal de familias.',
    current_date, 'published', 'codigo_jugador', now()),
  (v_org, 'v1 · 26 nov 2026', 'Nuevo: Código de las Familias Tanner',
    'Documento complementario de Cultura y Convivencia Tanner v1.0: los 12 compromisos de la familia, "la grada anima, no dirige", canales de queja y uso de WhatsApp/redes. Se acepta digitalmente desde el Portal de familias.',
    current_date, 'published', 'codigo_familias', now());

  -- ===== FAQs públicas en Centro Tanner (categoría conducta) =====
  insert into app.faqs(organization_id,policy_id,question,answer,category,keywords,sort_order,status) values
  (v_org, null, '¿Qué es el Código del Jugador Tanner?', 'Es el documento que explica los 12 compromisos de todo jugador Tanner: hablar con respeto, no hacer bullying, escuchar al Formador, jugar limpio y pedir ayuda si algo lo preocupa. Lo aceptas digitalmente desde el Portal de familias.', 'conducta', array['codigo del jugador','12 compromisos jugador','reglas del jugador'], 50, 'published'),
  (v_org, null, '¿Qué es el Código de las Familias Tanner?', 'Es el documento "la grada anima, no dirige": los 12 compromisos de la familia en la tribuna, con el Formador y en WhatsApp/redes. Lo aceptas digitalmente desde el Portal de familias.', 'conducta', array['codigo de las familias','la grada anima no dirige','reglas de la familia'], 51, 'published'),
  (v_org, null, '¿Qué pasa si mi hijo usa groserías o se porta mal?', 'Primero se enseña y se corrige: el Formador detiene la conducta, explica la regla y escucha. Si se repite o hay daño, se avisa en privado a la familia. Nunca hay suspensión automática por una sola grosería ni se publican nombres o sanciones en grupos.', 'conducta', array['mi hijo dijo groserias','se porto mal','sancion automatica'], 52, 'published'),
  (v_org, null, '¿Cómo reporto algo que me preocupa?', 'Puedes hablar con el Formador, Dirección Deportiva, Presidencia o usar el WhatsApp oficial del club. Si el Formador está involucrado, no tienes que reportarle a él primero. Las quejas de buena fe nunca son una infracción.', 'conducta', array['como reporto','me preocupa','denunciar'], 53, 'published')
  on conflict do nothing;
end $$;
