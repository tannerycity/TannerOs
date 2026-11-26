-- Fusión Código de Convivencia Tanner v1.0 + Código de las Familias Tanner
-- v1.1 en un solo documento (26/11/2026). Mich: "siento que el de jugadores
-- debe de ir aparte y el de convivencia y papás juntos" — el Código del
-- Jugador se queda separado (vive su propio ritual "Explicar 60 seg" por
-- categoría); Convivencia y Familias se funden porque ya eran el mismo tema
-- contado dos veces: codigo_familias v1.1 se escribió explícitamente como
-- "Documento complementario de Cultura y Convivencia Tanner v1.0" y cubre,
-- más a detalle, los mismos 7 puntos que v1.0 ya traía.
--
-- Nadie ha firmado ninguno de los dos todavía (0 aceptaciones), así que la
-- fusión no le quita una firma a nadie. No se inventa ni se borra ningún
-- compromiso: se reordena el mismo texto ya aprobado, quitando solo la
-- redundancia (la lista corta de 7 puntos de v1.0 queda cubierta por los 12
-- compromisos más detallados de v1.1) y las referencias cruzadas que ya no
-- aplican al estar todo en un solo documento.
--
-- codigo_familias NO se borra: queda con active=false, su historial de
-- versiones intacto, por si Presidencia necesita consultarlo después.

do $$
declare v_org uuid; v_conv app.consent_documents; v_fam app.consent_documents;
  v_body text;
begin
  select id into v_org from public.organizations where slug='tannery-city-fc' limit 1;
  if v_org is null then select id into v_org from public.organizations limit 1; end if;
  if v_org is null then return; end if;

  select * into v_conv from app.consent_documents where organization_id=v_org and code='codigo_convivencia';
  select * into v_fam from app.consent_documents where organization_id=v_org and code='codigo_familias';
  if v_conv.id is null or v_fam.id is null then return; end if;
  if v_conv.title = 'Código de Convivencia y Familias Tanner' then return; end if;

  v_body :=
'RESPETAMOS. COMPETIMOS. NOS CUIDAMOS.
La familia acompaña. El profesor enseña. El Tanner piensa, resuelve y respeta.

LA GRADA ANIMA, NO DIRIGE.
Nuestro hijo juega su fútbol. Nosotros acompañamos con respeto.

Aplica a madres, padres, tutores y acompañantes durante entrenamientos, partidos, torneos, viajes, eventos, instalaciones y comunicación digital vinculada con Tannery City. El tutor debe compartir estas reglas con los adultos que acompañen al jugador.

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

A mi hijo se le explicará, según su edad, el Código del Jugador Tanner: sin insultos, apodos con respeto, sin burlas, sin acoso ni exclusión, gestos respetuosos, sin violencia, respeto a todos, juego limpio, pedir ayuda y reparar sus errores. Puedes consultarlo completo en Centro Tanner.

Cada padre, madre o tutor responsable acepta digitalmente la versión vigente de este código.

Fuente normativa vinculada: Reglamento Tanner vigente, protocolos de protección de menores, reglas vigentes del parque y Aviso de privacidad.

Mensaje después del partido: "Me encantó venir a verte jugar".

Antes eran dos documentos separados (Cultura y Convivencia Tanner v1.0 y Código de las Familias Tanner v1.1); desde esta versión son uno solo, sin que cambie ningún compromiso.

FÚTBOL CURTIDO · LA GRADA ANIMA, NO DIRIGE.';

  update app.consent_documents set
    title = 'Código de Convivencia y Familias Tanner',
    version = v_conv.version + 1,
    published_at = now(),
    body = v_body
  where id = v_conv.id;

  insert into app.consent_document_versions(document_id, version, title, body, required, effective_date, published_at)
  select id, version, title, body, required, effective_date, published_at from app.consent_documents where id = v_conv.id
  on conflict (document_id, version) do nothing;

  update app.consent_documents set active = false where id = v_fam.id;

  insert into app.centro_tanner_changes(organization_id,version_label,title,description,effective_date,status,related_document_code,published_at)
  select v_org, 'v' || version || ' · 26 nov 2026', 'Código de Convivencia y Familias Tanner: documento unificado',
    'El Código de Convivencia Tanner y el Código de las Familias Tanner se fusionan en un solo documento. El contenido no cambia; antes eran dos documentos que decían casi lo mismo. El Código del Jugador Tanner se mantiene aparte.',
    current_date, 'published', 'codigo_convivencia', now()
  from app.consent_documents where id = v_conv.id;

  update app.faqs set
    question = '¿Qué es el Código de Convivencia y Familias Tanner?',
    answer = 'Es el documento "la grada anima, no dirige": los 12 compromisos de la familia en la tribuna, con el Formador y en WhatsApp/redes, junto con los principios generales de convivencia del club. Antes eran dos documentos separados; ahora es uno solo. Lo aceptas digitalmente desde el Portal de familias.'
  where organization_id = v_org and category = 'conducta'
    and question = '¿Qué es el Código de las Familias Tanner?';
end $$;

-- El contador de firmas (solo Presidencia) apuntaba "familias" a codigo_familias,
-- que ahora está inactivo. Se repunta a codigo_convivencia, el documento fusionado.
-- Reproduce la función completa: create or replace reemplaza todo el cuerpo.
create or replace function private.query_convivencia(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_seg boolean; v_code app.staff_code_versions%rowtype; v_doc app.consent_documents%rowtype;
begin
  if not private.convivencia_staff(p_organization_id) then raise exception 'Not authorized'; end if;
  v_seg := private.convivencia_seguimiento(p_organization_id);
  select * into v_code from app.staff_code_versions where organization_id = p_organization_id and code = 'codigo_formador' order by version desc limit 1;
  select * into v_doc from app.consent_documents where organization_id = p_organization_id and code = 'codigo_convivencia' and active;
  return jsonb_build_object(
    'canFollow', v_seg, 'isPresidency', private.is_presidency(p_organization_id),
    'myCode', case when v_code.id is null then null else jsonb_build_object('code', v_code.code, 'version', v_code.version, 'title', v_code.title, 'body', v_code.body,
      'acceptedAt', (select a.accepted_at from app.staff_code_acceptances a where a.organization_id = p_organization_id and a.user_id = v_uid and a.code = v_code.code and a.version = v_code.version)) end,
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'stage', c.stage,
        'lastExplained', (select max(e.explained_on) from app.code_explanations e where e.category_id = c.id),
        'families', case when v_seg and v_doc.id is not null then jsonb_build_object(
            'total', (select count(distinct p.id) from app.players p join app.player_enrollments en on en.player_id = p.id and en.category_id = c.id and en.status = 'active'
                       where p.organization_id = p_organization_id and coalesce(p.status, 'active') = 'active'),
            'accepted', (select count(distinct p.id) from app.players p join app.player_enrollments en on en.player_id = p.id and en.category_id = c.id and en.status = 'active'
                          join app.consent_acceptances ca on ca.player_id = p.id and ca.document_id = v_doc.id and ca.document_version = v_doc.version
                          where p.organization_id = p_organization_id and coalesce(p.status, 'active') = 'active')) else null end)
        order by c.sort_order, c.name)
      from app.categories c where c.organization_id = p_organization_id and coalesce(c.status, 'active') = 'active'), '[]'::jsonb),
    'staff', case when v_seg and v_code.id is not null then coalesce((select jsonb_agg(jsonb_build_object('userId', m.user_id, 'name', coalesce(pr.display_name, 'Staff'), 'role', m.role,
        'acceptedAt', (select a.accepted_at from app.staff_code_acceptances a where a.organization_id = p_organization_id and a.user_id = m.user_id and a.code = v_code.code and a.version = v_code.version)) order by pr.display_name)
      from public.organization_memberships m left join public.profiles pr on pr.user_id = m.user_id
      where m.organization_id = p_organization_id and m.active
        and (m.role in ('Formadores', 'Presidencia') or m.user_id in (select private.formation_directors(p_organization_id)))), '[]'::jsonb) else null end,
    'incidents', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'occurredOn', i.occurred_on, 'level', i.level, 'status', i.status, 'escalatedTo', i.escalated_to,
        'category', (select c.name from app.categories c where c.id = i.category_id), 'involvesStaff', i.involves_staff,
        'players', (select coalesce(jsonb_agg(btrim(concat_ws(' ', pl.first_name, pl.last_name))), '[]'::jsonb) from app.players pl where pl.id = any(i.player_ids)),
        'whatHappened', i.what_happened, 'protectiveAction', i.protective_action, 'resolution', i.resolution,
        'reportedBy', (select pr.display_name from public.profiles pr where pr.user_id = i.reported_by), 'mine', i.reported_by = v_uid, 'createdAt', i.created_at,
        'entries', coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'note', e.note, 'at', e.created_at,
            'by', (select pr.display_name from public.profiles pr where pr.user_id = e.author_user_id)) order by e.created_at)
          from app.conduct_incident_entries e where e.incident_id = i.id), '[]'::jsonb))
        order by (i.status = 'resuelto'), case i.level when 'urgente' then 0 when 'grave' then 1 when 'reincidencia' then 2 else 3 end, i.created_at desc)
      from app.conduct_incidents i where i.organization_id = p_organization_id and (v_seg or i.reported_by = v_uid)), '[]'::jsonb),
    'codesAcceptance', case when private.is_presidency(p_organization_id) then jsonb_build_object(
        'total', (select count(distinct p.id) from app.players p where p.organization_id = p_organization_id and coalesce(p.status, 'active') = 'active'),
        'jugador', (select count(distinct ca.player_id) from app.consent_acceptances ca
                     join app.consent_documents d on d.id = ca.document_id and d.organization_id = p_organization_id and d.code = 'codigo_jugador' and d.active and ca.document_version = d.version),
        'familias', (select count(distinct ca.player_id) from app.consent_acceptances ca
                      join app.consent_documents d on d.id = ca.document_id and d.organization_id = p_organization_id and d.code = 'codigo_convivencia' and d.active and ca.document_version = d.version))
      else null end);
end $$;
