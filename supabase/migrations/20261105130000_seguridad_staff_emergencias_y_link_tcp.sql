-- Auditoría de seguridad (05/11/2026, a petición de Mich): revisar Centro
-- Tanner como lo haría un experto en seguridad para clubes de fútbol.
-- Lo fuerte (protección de menores, TC-112 a TC-129) ya estaba. Dos huecos
-- reales eran responsabilidad de Tannery City sin importar la sede:
--   · TC-111 solo decía "Autoridad: Presidencia", sin ningún filtro antes de
--     dejar a alguien a solas con menores.
--   · No había protocolo de emergencias/evacuación.
-- Cámaras y acceso general al predio SÍ existen, pero viven en el reglamento
-- de Tannery City Park (TCP es dueño de esa infraestructura, no el club) —
-- por eso se agrega la liga al reglamento completo de TCP en vez de
-- inventar contenido de Tannery City sobre algo que no administra.

do $$
declare v_org uuid; v_id_111 uuid; v_id_132 uuid; v_id_144 uuid;
begin
  select id into v_org from public.organizations where slug='tannery-city-fc' limit 1;
  if v_org is null then select id into v_org from public.organizations limit 1; end if;
  if v_org is null then return; end if;

  select id into v_id_111 from app.policies where organization_id=v_org and policy_code='TC-111';
  select id into v_id_132 from app.policies where organization_id=v_org and policy_code='TC-132';

  -- TC-111: vetting minimo de staff antes de tener contacto con menores.
  update app.policies set
    short_answer='Autoridad: Presidencia. Antes de incorporar a quien tendrá contacto con menores se piden identificación, referencias verificables y declaración firmada de no representar un riesgo.',
    official_content='Autoridad: Presidencia, con validación de Dirección Deportiva en lo técnico.

Antes de contratar o incorporar a cualquier persona que tendrá contacto con menores (entrenadores, auxiliares, staff de academia), el club solicita:
• Identificación oficial.
• Referencias de experiencia previa verificables.
• Declaración firmada de no contar con antecedentes que representen un riesgo para menores.

El club puede dar de baja a cualquier staff ante incumplimiento de las políticas de conducta y protección de menores (TC-112 a TC-129), sin necesidad de proceso disciplinario previo si el riesgo es inmediato.',
    keywords=array(select distinct unnest(keywords || array['verificacion de staff','antecedentes','referencias','contratacion segura']))
  where id=v_id_111;

  -- TC-132: liga al reglamento completo de TCP (seguridad del parque, cámaras, acceso, vive ahí).
  update app.policies set
    official_content='El Reglamento de TCP es independiente del Reglamento Tannery City. Aplica a instalaciones, torneos TCP, renta de cancha, usuarios externos, espectadores y seguridad del parque (incluida videovigilancia y control de acceso al predio). Familias Tanner en TCP también cumplen sus reglas vigentes.

Puedes consultar el Reglamento completo de Tannery City Park aquí: https://tcp.tannerycity.com/app/#/reglamento/tcp',
    keywords=array(select distinct unnest(keywords || array['reglamento tcp','camaras','videovigilancia','acceso al parque']))
  where id=v_id_132;

  -- TC-144: emergencias y evacuacion, responsabilidad del club sin importar la sede.
  insert into app.policies(organization_id,policy_code,slug,title,category,scope,short_answer,official_content,keywords,status,version,effective_date,published_at)
  values (v_org,'TC-144','emergencias-y-evacuacion','Emergencias y evacuación','seguridad','tannery_city',
    'Ante incendio, sismo u otra emergencia, el entrenador guía a su grupo al punto de reunión, hace conteo y avisa a Dirección/Presidencia y a los tutores.',
    'Ante incendio, sismo u otra emergencia que requiera evacuar las instalaciones:
• El entrenador en turno es responsable de guiar a su grupo a la salida o punto de reunión más cercano.
• No se regresa por pertenencias.
• Se toma lista o conteo visual del grupo en el punto de reunión antes de avisar que está completo.
• Se contacta a Dirección/Presidencia y, si aplica, a servicios de emergencia.
• Se notifica a los tutores en cuanto el grupo esté a salvo.

Las salidas, extintores y puntos de reunión son responsabilidad de la sede (Tannery City Park u otra); el club sigue su señalización y protocolo vigente.',
    array['emergencia','evacuacion','incendio','sismo','simulacro','punto de reunion'],
    'published',1,current_date,now())
  on conflict (organization_id, slug) do nothing
  returning id into v_id_144;

  if v_id_144 is null then
    select id into v_id_144 from app.policies where organization_id=v_org and slug='emergencias-y-evacuacion';
  end if;

  insert into app.faqs(organization_id,policy_id,question,answer,category,keywords,sort_order,status) values
  (v_org,v_id_111,'¿Verifican a quién contratan como entrenador?','Sí. Antes de que alguien tenga contacto con menores pedimos identificación, referencias verificables y una declaración firmada de no representar un riesgo para menores.','conducta',array['verifican entrenadores','antecedentes staff'],1,'published'),
  (v_org,v_id_144,'¿Qué pasa si hay una emergencia durante el entrenamiento?','El entrenador guía al grupo al punto de reunión, hace conteo y avisa a Dirección/Presidencia; en cuanto el grupo está a salvo, se notifica a los tutores.','seguridad',array['emergencia','evacuacion','incendio'],1,'published')
  on conflict do nothing;
end $$;
