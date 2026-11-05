-- Centro Tanner (05/11/2026), a petición de Mich:
--   · TC-043 Clima: ya hay circuito cerrado de cámaras dentro de Tannery
--     City Park para monitorear el clima en tiempo real; el aviso baja de
--     ~40 a ~30 minutos antes.
--   · TC-080 Canales oficiales: lista real y completa (antes genérica) —
--     TannerOS, Administración, categoría/Academia de Porteros, Consejo de
--     Familias Tanners.
--   · TC-116: se refuerza el "por qué" (amar el fútbol, sin trauma), no
--     solo la regla.
--   · TC-079 "Delegado de padres" se amplía y renombra a "Vocero Tanner":
--     elección por invitación formal + votación de las familias, rotación
--     cada 3-6 meses, funciones (contacto en visita, resguardo de balones,
--     filtro de quejas vs. canalizar temas personales).
--   · TC-145 (nueva): sana convivencia digital en los canales oficiales —
--     buscar polémica o mal ambiente en un grupo oficial se toma en cuenta
--     para amonestación, igual que la Conducta de padres (TC-077) presencial.

do $$
declare v_org uuid; v_id_043 uuid; v_id_079 uuid; v_id_080 uuid; v_id_116 uuid; v_id_145 uuid;
begin
  select id into v_org from public.organizations where slug='tannery-city-fc' limit 1;
  if v_org is null then select id into v_org from public.organizations limit 1; end if;
  if v_org is null then return; end if;

  select id into v_id_043 from app.policies where organization_id=v_org and policy_code='TC-043';
  select id into v_id_079 from app.policies where organization_id=v_org and policy_code='TC-079';
  select id into v_id_080 from app.policies where organization_id=v_org and policy_code='TC-080';
  select id into v_id_116 from app.policies where organization_id=v_org and policy_code='TC-116';

  -- TC-043: circuito cerrado dentro de TCP permite monitorear el clima en tiempo real; aviso 30 min antes.
  update app.policies set
    short_answer='Ante tormenta eléctrica se suspende actividad. Con lluvia, el club monitorea el clima en tiempo real con las cámaras de TCP y avisa aproximadamente 30 minutos antes por los canales oficiales.',
    official_content='Ante tormenta eléctrica se suspende actividad.

Tannery City cuenta con circuito cerrado de cámaras dentro de Tannery City Park, lo que permite monitorear el clima en tiempo real. Con lluvia, el club avisará aproximadamente 30 minutos antes de la sesión si continúa o se suspende, para que puedas tomarlo en cuenta en tu traslado — mantente al tanto de los canales oficiales del club.

Si comienza durante la sesión, el entrenador puede suspender. Cancelación por clima no genera automáticamente reposición. Si la cancelación es atribuible al club, Dirección evalúa reposición.',
    keywords=array(select distinct unnest(keywords || array['camaras clima','circuito cerrado','aviso 30 minutos']))
  where id=v_id_043;

  -- TC-080: lista completa y real de canales oficiales (antes era genérica).
  update app.policies set
    short_answer='TannerOS, el grupo de WhatsApp de Administración Tannery City, el grupo de WhatsApp de tu categoría (o de Academia de Porteros si aplica), el Consejo de Familias Tanners, y contacto directo con tu entrenador para temas deportivos.',
    official_content='Los canales oficiales de Tannery City son:
• Tanner OS — tu Portal de familia, con tu información y la de tu hijo.
• Grupo de WhatsApp de Administración Tannery City.
• Grupo de WhatsApp de tu categoría (Baby Tanner, T6, T8, T10, T12) o, si corresponde, de la Academia de Porteros.
• Grupo de WhatsApp del Consejo de Familias Tanners, donde participan los Voceros Tanners de cada categoría.
• Contacto directo con tu entrenador para asuntos deportivos.

Un aviso publicado en cualquiera de estos canales se considera comunicado oficial — ver también Avisos oficiales (TC-082).',
    keywords=array(select distinct unnest(keywords || array['grupos de whatsapp','academia de porteros','consejo de familias','voceros']))
  where id=v_id_080;

  -- TC-116: refuerza el por qué, no solo el qué (sin trauma, amar el futbol).
  update app.policies set
    official_content=official_content || E'\n\nBuscamos que los entrenadores apoyen y ayuden a los jugadores a amar el fútbol — no queremos niños traumados por jugar.'
  where id=v_id_116 and official_content not ilike '%amar el fútbol%';

  -- TC-079 pasa a ser Vocero Tanner: mismo rol, ampliado con elección, rotación y funciones.
  update app.policies set
    title='Vocero Tanner',
    slug='vocero-tanner',
    short_answer='Cada categoría tiene un Vocero Tanner, elegido por votación de las familias e invitación formal de Presidencia/Administración. Es el enlace entre el club y las familias; rota cada 3 a 6 meses o según su desempeño.',
    official_content='Cada categoría puede contar con un Vocero Tanner (antes "Delegado de Padres") como enlace entre el club y las familias.

Elección: Presidencia y Administración invitan formalmente a quien proponen; la propuesta se somete a votación de las familias de la categoría antes de confirmarse.

Rotación: cada 3 a 6 meses, o antes si el desempeño o comportamiento del Vocero lo amerita.

Funciones:
• Comunicación, organización e inquietudes generales de su categoría.
• En partidos de visitante: es el contacto directo con el club rival para gestionar lo necesario (sonido, celebraciones, logística).
• Puede tener bajo resguardo hasta 2 balones del equipo.
• Filtro entre familias y club: si detecta una inquietud compartida por varias familias, la platica con el club para generar una reunión y mejorar; si es un tema personal entre familias, canaliza para que se hable directamente entre las partes — se busca evitar chismes y mal ambiente.

No tiene acceso automático a actas, expedientes, datos médicos, sanciones individuales ni información privada de otras familias.',
    keywords=array(select distinct unnest(keywords || array['vocero tanner','vocero','votacion','consejo de familias','delegado de padres']))
  where id=v_id_079;

  -- TC-145 (nueva): sana convivencia digital en los canales oficiales.
  insert into app.policies(organization_id,policy_code,slug,title,category,scope,short_answer,official_content,keywords,status,version,effective_date,published_at)
  values (v_org,'TC-145','sana-convivencia-en-canales-oficiales','Sana convivencia en canales oficiales','conducta','tannery_city',
    'En los grupos oficiales de WhatsApp buscamos sana convivencia. Si ves algo que no debería estar ahí, repórtalo directo al club; escribir con intención de generar polémica o mal ambiente puede derivar en llamada de atención o amonestación.',
    'En los canales oficiales de Tannery City (ver Canales oficiales, TC-080) buscamos sana convivencia entre todas las familias.

Si notas algo que te incomoda o que no debería estar en el grupo, repórtalo directamente al club — no se busca que las familias lo resuelvan solas dentro del chat.

Escribir con la intención evidente de generar polémica, crear mal ambiente o confrontar a otras familias dentro de un canal oficial se toma en cuenta para una llamada de atención o amonestación, igual que la Conducta de padres (TC-077) presencial.

Esto no limita expresar una inconformidad legítima o una opinión de buena fe — lo que se cuida es la forma y la intención, no el desacuerdo en sí.',
    array['sana convivencia','comportamiento en grupos','whatsapp','polemica','reportar un grupo'],
    'published',1,current_date,now())
  on conflict (organization_id, slug) do nothing
  returning id into v_id_145;

  if v_id_145 is null then
    select id into v_id_145 from app.policies where organization_id=v_org and slug='sana-convivencia-en-canales-oficiales';
  end if;

  insert into app.faqs(organization_id,policy_id,question,answer,category,keywords,sort_order,status) values
  (v_org,v_id_043,'¿El club ya puede ver el clima en tiempo real?','Sí, Tannery City cuenta con circuito cerrado de cámaras dentro de Tannery City Park para monitorear el clima en tiempo real y avisar con anticipación.','entrenamientos',array['camaras clima','tiempo real'],1,'published'),
  (v_org,v_id_080,'¿Cuáles son los grupos oficiales de WhatsApp?','El de Administración Tannery City y el de tu categoría (o Academia de Porteros si aplica). El Consejo de Familias Tanners, con los Voceros, también es oficial.','familias',array['grupos oficiales','cuales son los canales'],1,'published'),
  (v_org,v_id_079,'¿Cómo se elige al Vocero Tanner?','Presidencia y Administración invitan formalmente a quien proponen, y la propuesta se somete a votación de las familias de la categoría.','familias',array['como se elige el vocero','votacion vocero'],1,'published'),
  (v_org,v_id_145,'¿Qué pasa si alguien busca pleito en el grupo de WhatsApp?','Puede derivar en llamada de atención o amonestación. Buscamos sana convivencia; si algo te incomoda, repórtalo directo al club.','conducta',array['pleito en el grupo','jiribilla','polemica en whatsapp'],1,'published')
  on conflict do nothing;
end $$;
