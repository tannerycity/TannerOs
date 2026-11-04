-- BECAS TANNERY CITY — FAQ (buscador de Centro Tanner) y extensión de
-- v2_portal_paperwork para que el Portal de Familias traiga, en la misma
-- llamada que ya hace, el modality del beneficio activo y la solicitud
-- abierta más reciente (si la hay).
do $$
declare v_org uuid; v_becas uuid; v_ingreso uuid; v_apoyo uuid; v_academica uuid; v_deportiva uuid; v_tanner uuid; v_lealtad uuid; v_curti uuid; v_cuota uuid; v_tpt uuid;
begin
  select id into v_org from public.organizations where slug='tannery-city-fc' limit 1;
  if v_org is null then select id into v_org from public.organizations limit 1; end if;
  if v_org is null then return; end if;

  select id into v_becas from app.policies where organization_id=v_org and slug='becas';
  select id into v_ingreso from app.policies where organization_id=v_org and slug='apoyo-de-ingreso';
  select id into v_apoyo from app.policies where organization_id=v_org and slug='beca-de-apoyo-familiar';
  select id into v_academica from app.policies where organization_id=v_org and slug='beca-academica';
  select id into v_deportiva from app.policies where organization_id=v_org and slug='beca-deportiva';
  select id into v_tanner from app.policies where organization_id=v_org and slug='beca-tanner';
  select id into v_lealtad from app.policies where organization_id=v_org and slug='beca-lealtad-tanner';
  select id into v_curti from app.policies where organization_id=v_org and slug='curtibrother';
  select id into v_cuota from app.policies where organization_id=v_org and slug='cuota-de-evaluacion-de-beca';
  select id into v_tpt from app.policies where organization_id=v_org and slug='tanner-por-tanner';

  if exists (select 1 from app.faqs where organization_id=v_org and category='becas' and question='¿Qué becas existen?') then return; end if;

  insert into app.faqs(organization_id,policy_id,question,answer,category,keywords,sort_order,status) values
  (v_org,v_becas,'¿Qué becas existen?','Existen 7 modalidades: Apoyo de Ingreso, Beca de Apoyo Familiar, Beca Académica, Beca Deportiva, Beca Tanner, Beca Lealtad Tanner y Curtibrother.','becas',array['becas','tipos de beca'],1,'published'),
  (v_org,v_becas,'¿Quién puede pedir una beca?','La familia puede solicitar directamente Apoyo de Ingreso, Beca de Apoyo Familiar, Beca Académica, Beca Lealtad Tanner y Curtibrother (presentando al padrino). Beca Deportiva y Beca Tanner son por nominación interna.','becas',array['quien puede pedir beca','solicitar beca'],2,'published'),
  (v_org,v_becas,'¿Qué becas no puedo pedir directamente?','Beca Deportiva y Beca Tanner. Las otorga el club por nominación del entrenador, Dirección Deportiva o Presidencia — no se solicitan.','becas',array['becas que no puedo pedir','nominacion'],3,'published'),
  (v_org,v_becas,'¿Cuánto puede ser una beca?','Los apoyos comienzan desde 10%. Tannery City determina el porcentaje final según el análisis de cada caso.','becas',array['cuanto descuento','beca 10%','cuanto dan','porcentaje de beca'],4,'published'),
  (v_org,v_becas,'¿Puedo pedir un porcentaje?','No. Tú puedes solicitar la beca; el porcentaje siempre lo determina Tannery City después de evaluar tu caso.','becas',array['pedir porcentaje','elegir porcentaje'],5,'published'),
  (v_org,v_becas,'¿Cuánto dura una beca?','Tannery City determina la duración de cada beca en el dictamen. Como referencia, el Apoyo de Ingreso suele ser de 1 a 3 meses y las becas ordinarias se revisan en ciclos de hasta 6 meses.','becas',array['cuanto dura la beca','vigencia de la beca'],6,'published'),
  (v_org,v_cuota,'¿Cuesta solicitar una beca?','Sí, cuando se trata de una solicitud familiar ordinaria sujeta a cuota: Beca Académica, Beca Lealtad Tanner y Beca de Apoyo Familiar.','becas',array['cuesta pedir beca','cuota de beca'],7,'published'),
  (v_org,v_cuota,'¿Cuánto cuesta?','$200 MXN.','becas',array['200 pesos','cuanto cuesta pedir beca'],8,'published'),
  (v_org,v_cuota,'¿Pagar garantiza la beca?','No. El pago cubre únicamente el proceso de evaluación; no garantiza aprobación ni un porcentaje específico.','becas',array['pagar garantiza beca','pago garantiza aprobacion'],9,'published'),
  (v_org,v_cuota,'¿Me regresan los $200 si no me aprueban?','No. Una vez iniciado el proceso de evaluación, la cuota no es reembolsable.','becas',array['me regresan los 200','reembolso cuota beca'],10,'published'),
  (v_org,v_cuota,'¿Qué apoyos no pagan cuota?','Apoyo de Ingreso, Beca Deportiva, Beca Tanner y Curtibrother.','becas',array['apoyos sin cuota','becas sin cuota'],11,'published'),
  (v_org,v_cuota,'¿Puede exentarse la cuota?','Sí, Presidencia puede aprobar una excepción en casos de necesidad económica extraordinaria.','becas',array['exentar cuota','excepcion cuota beca'],12,'published'),
  (v_org,v_ingreso,'¿Acabo de entrar y necesito ayuda?','Revisa el Apoyo de Ingreso: se puede solicitar desde el día 1 y no tiene cuota de evaluación.','becas',array['acabo de entrar','familia nueva ayuda'],13,'published'),
  (v_org,v_apoyo,'¿Necesito esperar tres meses?','Para las becas ordinarias (Apoyo Familiar, Académica, Deportiva), generalmente sí se piden 3 meses mínimo en el club. El Apoyo de Ingreso se puede pedir desde el día 1.','becas',array['esperar tres meses','antiguedad minima'],14,'published'),
  (v_org,v_becas,'¿Puedo tener dos becas?','No se acumulan económicamente. Puedes cumplir requisitos de varias modalidades, pero Tannery City determina un único porcentaje económico vigente.','becas',array['dos becas','acumular becas','sumar becas'],15,'published'),
  (v_org,v_academica,'¿Qué promedio necesito?','9.0 para la Beca Académica, con boleta o constancia que se actualiza trimestralmente.','becas',array['promedio para beca','promedio 9'],16,'published'),
  (v_org,v_deportiva,'¿Cómo consigo Beca Deportiva?','Mediante nominación interna del entrenador, Dirección Deportiva o Presidencia. La familia no la solicita directamente.','becas',array['como consigo beca deportiva','nominacion deportiva'],17,'published'),
  (v_org,v_tanner,'¿Cómo consigo Beca Tanner?','Mediante nominación interna del entrenador, Dirección Deportiva o Presidencia.','becas',array['como consigo beca tanner','nominacion tanner'],18,'published'),
  (v_org,v_lealtad,'¿Cuándo puedo pedir Lealtad Tanner?','A partir de 18 meses continuos en el club, con pagos al corriente y buen historial.','becas',array['cuando pedir lealtad tanner','18 meses'],19,'published'),
  (v_org,v_tpt,'¿Qué es Tanner por Tanner?','Un programa de reciprocidad comunitaria: tu manera de ayudarnos a que la misma oportunidad llegue a alguien más.','becas',array['que es tanner por tanner'],20,'published'),
  (v_org,v_tpt,'¿Tengo que vender?','No. Se evalúa la acción, no la venta. Tannery City contacta, negocia y cierra.','becas',array['tengo que vender','vender patrocinio'],21,'published'),
  (v_org,v_tpt,'¿Tengo que conseguir patrocinadores?','No tienes que cerrarlo tú; solo presentar el contacto. El club se encarga del resto.','becas',array['conseguir patrocinadores','tengo que conseguir patrocinador'],22,'published'),
  (v_org,v_tpt,'¿Qué tengo que hacer en Tanner por Tanner?','2 niños referidos más 1 contacto comercial por trimestre, cuando tu beca lo requiere.','becas',array['que hago en tanner por tanner','compromiso tanner por tanner'],23,'published'),
  (v_org,v_tpt,'¿Qué pasa si nadie compra?','La familia sí cumplió si hizo una presentación válida. No depende de que se cierre la venta.','becas',array['nadie compra','no se vendio'],24,'published'),
  (v_org,v_tpt,'¿Qué pasa si el niño referido no se inscribe?','No depende de la familia: basta con que la referencia haya sido real (visita, clase muestra o contacto con el club).','becas',array['niño referido no se inscribe','referido no entro'],25,'published'),
  (v_org,v_curti,'¿Qué es Curtibrother?','Un programa de apadrinamiento externo: una persona, empresa u organización financia el apoyo de uno o más Tanners.','becas',array['que es curtibrother'],26,'published'),
  (v_org,v_curti,'¿Puedo presentar a mi patrón?','Sí. Puedes presentar a cualquier posible padrino: patrón, empresario, negocio, familiar o conocido.','becas',array['presentar a mi patron','presentar padrino'],27,'published'),
  (v_org,v_curti,'¿Quién contacta al patrocinador?','Tannery City. Tú solo presentas o recomiendas; el club contacta, presenta, negocia y cierra.','becas',array['quien contacta al patrocinador','quien vende curtibrother'],28,'published'),
  (v_org,v_becas,'¿La beca incluye uniforme?','No necesariamente. Normalmente una beca cubre mensualidad e inscripción cuando se autoriza; el uniforme requiere autorización expresa.','becas',array['beca incluye uniforme'],29,'published'),
  (v_org,v_becas,'¿Incluye torneos?','No normalmente. Arbitrajes, torneos, copas, viajes y hospedaje no están incluidos salvo autorización expresa de Curtibrother o Presidencia.','becas',array['beca incluye torneos'],30,'published'),
  (v_org,v_becas,'¿Incluye arbitrajes?','No normalmente, salvo autorización expresa.','becas',array['beca incluye arbitrajes'],31,'published'),
  (v_org,v_becas,'¿Qué asistencia se espera?','90% es el objetivo. No hay cancelación automática por debajo de esa meta — se genera una alerta y se revisa el caso.','becas',array['asistencia esperada','90 por ciento asistencia','faltas'],32,'published'),
  (v_org,v_becas,'¿Qué pasa si tengo una falta justificada?','Se analiza distinto a una falta sin justificar: enfermedad, lesión, emergencia familiar o situación escolar con aviso previo se consideran aparte.','becas',array['falta justificada'],33,'published'),
  (v_org,v_becas,'¿Puedo perder la beca?','Sí. Puede suspenderse o terminarse por información falsa, ausentismo, indisciplina, faltas graves, adeudos o incumplimiento de Tanner por Tanner, entre otras causas.','becas',array['perder la beca','me quitan la beca'],34,'published'),
  (v_org,v_becas,'¿Me pueden bajar el porcentaje?','Sí, en una revisión Tannery City puede mantener, mejorar, disminuir, suspender o terminar el apoyo.','becas',array['bajar el porcentaje','disminuir beca'],35,'published'),
  (v_org,v_becas,'¿Me pueden subir el porcentaje?','Sí, igual que puede bajar, en una revisión Tannery City puede mejorar el porcentaje.','becas',array['subir el porcentaje','mejorar beca'],36,'published'),
  (v_org,v_becas,'¿Quién decide?','Presidencia, con base en la evaluación y la recomendación del Comité de Becas.','becas',array['quien decide la beca','quien aprueba la beca'],37,'published'),
  (v_org,v_becas,'¿Cuánto tardan?','Hasta 7 días como objetivo administrativo de respuesta.','becas',array['cuanto tardan en responder','tiempo de respuesta beca'],38,'published'),
  (v_org,v_becas,'¿Renovar una beca es automático?','No. Una beca puede renovarse, mantenerse, mejorar, disminuir, suspenderse o terminarse — nunca se renueva sola.','becas',array['renovar beca','perder beca automatico'],39,'published');
end $$;

-- v2_portal_paperwork: agrega modality del beneficio activo y la solicitud
-- abierta más reciente del Tanner, sin tronar la forma que ya consume el
-- portal (solo se agregan llaves nuevas).
create or replace function private.portal_paperwork(p_player_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare g app.guardians; v jsonb; pl app.players;
begin
  if not private.portal_owns_player(p_player_id) then raise exception 'Not authorized'; end if;
  select * into g from private.portal_guardian();
  select * into pl from app.players where id = p_player_id;

  select jsonb_build_object(
    'consents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', d.code, 'title', d.title, 'body', d.body,
        'version', d.version, 'required', d.required,
        'accepted_at', a.accepted_at,
        'decision', a.decision,
        'accepted_version', a.document_version,
        'outdated', (a.id is not null and a.document_version < d.version))
        order by d.required desc, d.title)
      from app.consent_documents d
      left join app.consent_acceptances a
        on a.document_id = d.id and a.player_id = p_player_id
       and a.document_version = d.version
      where d.organization_id = g.organization_id and d.active), '[]'::jsonb),
    'image_consent', jsonb_build_object(
      'status', private.estado_de_imagen(pl.image_consent, pl.data_consent, pl.privacy_notice_version),
      'authorized', coalesce(pl.image_consent,false),
      'decided_at', pl.image_consent_at,
      'notice_version', pl.privacy_notice_version),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object('type', s.document_type, 'received', s.received)
        order by s.document_type)
      from app.player_document_status s where s.player_id = p_player_id), '[]'::jsonb),
    'benefit', (
      select jsonb_build_object(
        'has', true, 'type', b.benefit_type, 'modality', b.scholarship_modality,
        'percentage', b.percentage, 'amount', coalesce(b.override_amount, b.fixed_amount),
        'since', b.starts_on, 'until', b.ends_on, 'nextReview', b.next_review_at)
      from app.player_benefits b
      where b.player_id = p_player_id and b.active
        and (b.ends_on is null or b.ends_on >= current_date)
      order by b.priority nulls last limit 1),
    'benefit_request', (
      select jsonb_build_object(
        'status', r.status, 'reason', r.reason,
        'requested_at', r.requested_at, 'resolved_at', r.resolved_at,
        'note', r.resolution_note)
      from app.benefit_requests r
      where r.player_id = p_player_id
      order by r.requested_at desc limit 1),
    'scholarshipApplication', (
      select jsonb_build_object(
        'id', a.id, 'modality', a.modality, 'status', a.status,
        'feeRequired', a.fee_required, 'feeAmount', a.fee_amount, 'feeStatus', a.fee_status,
        'infoRequestedNote', a.info_requested_note, 'decisionNote', a.decision_note, 'createdAt', a.created_at)
      from app.scholarship_applications a
      where a.player_id = p_player_id and a.status not in ('aprobada','no_aprobada','retirada')
      order by a.created_at desc limit 1)
  ) into v;
  return v;
end $function$;
