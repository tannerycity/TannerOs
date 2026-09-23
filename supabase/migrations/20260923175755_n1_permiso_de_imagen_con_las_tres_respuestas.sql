-- N1 · El permiso de imagen tiene TRES respuestas, no dos
--
-- LO QUE MIDIO LA BASE (23 sep 2026, 63 Tanners activos)
--   SI autoriza salir en publicidad ...................  5   (3 con foto)
--   Dijo que NO (firmo el aviso y nego la imagen) .....  3   (3 con foto)
--   NUNCA se le pregunto (sin aviso firmado) .......... 55  (43 con foto)
--
-- O sea: 43 ninos tienen foto cargada y su familia nunca firmo nada.
--
-- El sistema guardaba esto en un booleano, asi que las dos ultimas filas se
-- veian identicas: "Sin permiso de imagen". Para efectos legales dan lo mismo
-- —no publicas— pero para el trabajo del club son tareas opuestas: al que dijo
-- que no no se le vuelve a preguntar nunca; a los 55 hay que pedirles la firma,
-- y son 55 permisos que el club esta dejando en la mesa.
--
-- El booleano NO se toca: sigue siendo lo que manda para publicar o no. Lo que
-- se agrega es como leerlo, con el tercer caso a la vista.
--
-- EL BUG LATENTE QUE SE CIERRA DE PASO
-- Habia dos sistemas de consentimiento que no se hablaban:
--   app.consent_documents/consent_acceptances  (el portal de Familias)
--   app.players.image_consent                  (lo que lee TODA la app)
-- El documento 'uso_de_imagen' ya existia en el portal, pero firmarlo NO movia
-- players.image_consent. Hoy nadie lo ha firmado (0 aceptaciones de los cuatro
-- documentos), asi que no hay dano hecho; el dia que una familia lo firmara, el
-- club seguiria creyendo que no puede publicar. Aqui se conectan.

-- Una aceptacion solo podia decir "si". Una decision tiene que poder decir "no",
-- o al que dijo que no se le pregunta para siempre.
alter table app.consent_acceptances
  add column if not exists decision text not null default 'accepted';

do $$
begin
  if not exists (select 1 from pg_constraint where conname='consent_acceptances_decision_valida') then
    alter table app.consent_acceptances
      add constraint consent_acceptances_decision_valida
      check (decision in ('accepted','declined'));
  end if;
end $$;

comment on column app.consent_acceptances.decision is
  'accepted o declined. Un "no" tambien es una respuesta y hay que guardarla, o al que dijo que no se le vuelve a preguntar para siempre.';

-- La regla de las tres respuestas, en UN solo lugar. La pantalla la repite pero
-- no la inventa: si viviera solo en JavaScript, el PDF y la lista terminarian
-- contando distinto que el padron.
create or replace function private.estado_de_imagen(
  p_image_consent boolean,
  p_data_consent boolean,
  p_notice_version text
)
returns text
language sql
immutable
as $function$
  select case
    when coalesce(p_image_consent,false) then 'autoriza'
    -- "Se le pregunto" = hay rastro de la conversacion: firmo una version del
    -- aviso de privacidad, o quedo registrado el consentimiento de datos (que
    -- en el formulario publico es obligatorio y va junto a la casilla de
    -- imagen). Sin ninguno de los dos, nadie le pregunto nunca.
    when nullif(trim(coalesce(p_notice_version,'')),'') is not null then 'no_autoriza'
    when coalesce(p_data_consent,false) then 'no_autoriza'
    else 'sin_preguntar'
  end
$function$;

comment on function private.estado_de_imagen(boolean,boolean,text) is
  'autoriza | no_autoriza | sin_preguntar. Las dos ultimas prohiben publicar igual, pero solo la tercera es trabajo pendiente del club.';

-- Agregar una columna a un "returns table" no se puede con CREATE OR REPLACE:
-- hay que tirar y volver a crear. Va en la misma transaccion, asi que la app
-- nunca ve el hueco.
drop function if exists public.v2_players(uuid,text);
drop function if exists private.query_players(uuid,text);

create function private.query_players(p_organization_id uuid, p_status text default null::text)
returns table(id uuid, code text, first_name text, last_name text, birth_date date, status text, status_value text, category text, player_position text, jersey_number text, photo_path text, photo_thumb_path text, photo_bucket text, base_monthly_fee numeric, billing_status text, needs_review boolean, review_reason text, sex text, school text, has_guardian_email boolean, benefit_active boolean, benefit_source text, docs_missing integer, data_consent boolean, image_consent boolean, benefit_type text, image_consent_status text)
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare v_docs_requeridos integer; v_dinero boolean; v_admin boolean;
begin
  if not private.has_module_access(p_organization_id,'players',false) then raise exception 'Not authorized'; end if;
  v_dinero := private.can_see_player_money(p_organization_id);
  v_admin  := private.is_player_admin(p_organization_id);
  select count(distinct document_type) into v_docs_requeridos
  from app.player_document_status where organization_id=p_organization_id;
  v_docs_requeridos := coalesce(v_docs_requeridos,0);

  return query
  select p.id,p.code,p.first_name,p.last_name,p.birth_date,
         p.status,p.status,p.category,p.position,p.jersey_number,
         p.photo_path,p.photo_thumb_path,p.photo_bucket,
         -- Los seis campos de dinero llegan vacíos a quien no lleva el dinero.
         case when v_dinero then bp.base_monthly_fee end,
         case when v_dinero then bp.status end,
         case when v_dinero then bp.needs_review else false end,
         case when v_dinero then bp.review_reason end,
         p.sex,p.school,
         exists(select 1 from app.player_guardians pg
                join app.guardians g on g.id=pg.guardian_id
                where pg.player_id=p.id and nullif(trim(g.email),'') is not null),
         case when v_dinero then exists(select 1 from app.player_benefits b
                where b.player_id=p.id and b.organization_id=p.organization_id and b.active
                  and (b.ends_on is null or b.ends_on>=current_date)) else false end,
         case when v_dinero then
           (select nullif(trim(b.funding_source_name),'') from app.player_benefits b
             where b.player_id=p.id and b.organization_id=p.organization_id and b.active
               and (b.ends_on is null or b.ends_on>=current_date)
             order by b.priority nulls last, b.starts_on desc limit 1) end,
         greatest(0, v_docs_requeridos - (
           select count(*)::int from app.player_document_status d
           where d.player_id=p.id and d.organization_id=p.organization_id and d.received)),
         coalesce(p.data_consent,false),
         coalesce(p.image_consent,false),
         case when v_dinero then
           (select b.benefit_type from app.player_benefits b
             where b.player_id=p.id and b.organization_id=p.organization_id and b.active
               and (b.ends_on is null or b.ends_on>=current_date)
             order by b.priority nulls last, b.starts_on desc limit 1) end,
         -- El permiso de imagen NO es dinero: lo ve todo el que ve la lista,
         -- incluido el profe. Es justo quien anda con el telefono en la cancha.
         private.estado_de_imagen(p.image_consent, p.data_consent, p.privacy_notice_version)
  from app.players p
  left join app.billing_profiles bp on bp.player_id=p.id and bp.organization_id=p.organization_id
  where p.organization_id=p_organization_id and p.archived_at is null
    and (p_status is null or p.status=p_status)
    and (v_admin or exists(
          select 1 from app.player_enrollments pe
          where pe.organization_id=p.organization_id and pe.player_id=p.id
            and pe.status='active'
            and pe.category_id in (select private.my_category_ids(p_organization_id))))
  order by p.first_name,p.last_name,p.id;
end $function$;

create function public.v2_players(organization_id uuid, status_filter text default null::text)
returns table(id uuid, code text, first_name text, last_name text, birth_date date, status text, status_value text, category text, player_position text, jersey_number text, photo_path text, photo_thumb_path text, photo_bucket text, base_monthly_fee numeric, billing_status text, needs_review boolean, review_reason text, sex text, school text, has_guardian_email boolean, benefit_active boolean, benefit_source text, docs_missing integer, data_consent boolean, image_consent boolean, benefit_type text, image_consent_status text)
language sql
security definer
set search_path to 'pg_catalog', 'private'
as $function$ select * from private.query_players(organization_id,status_filter) $function$;

-- La familia decide desde el portal. Esto es lo que convierte 55 pendientes en
-- 55 respuestas sin que nadie persiga papas uno por uno.
--
-- "No" tambien se guarda, y con la misma ceremonia que el "si": queda la
-- version del aviso, quien lo decidio y cuando. Sin eso, el club no puede
-- demostrar despues que preguntó.
create or replace function private.portal_decide_image_consent(
  p_player_id uuid,
  p_authorize boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare g app.guardians; d app.consent_documents; v_antes boolean; v_version text;
begin
  if not private.portal_owns_player(p_player_id) then raise exception 'Not authorized'; end if;
  if p_authorize is null then raise exception 'Hay que decir si o no, no dejarlo a medias'; end if;
  select * into g from private.portal_guardian();

  select coalesce(image_consent,false) into v_antes from app.players
   where id = p_player_id and organization_id = g.organization_id;

  select * into d from app.consent_documents
   where organization_id = g.organization_id and code = 'uso_de_imagen' and active;

  v_version := coalesce(nullif(trim((select privacy_notice_version from app.players where id=p_player_id)),''),
                        case when d.id is null then 'portal' else 'uso_de_imagen v'||d.version end);

  update app.players set
    image_consent = p_authorize,
    -- La fecha marca cuando se autorizo; al negar se limpia, igual que cuando
    -- lo registra el club desde el expediente.
    image_consent_at = case when p_authorize then coalesce(image_consent_at, now()) else null end,
    -- La version SI se conserva al negar: es lo que prueba que se pregunto, y
    -- es justo lo que separa "dijo que no" de "nunca se le pregunto".
    privacy_notice_version = v_version,
    updated_at = now()
  where id = p_player_id and organization_id = g.organization_id;

  if d.id is not null then
    insert into app.consent_acceptances(organization_id,document_id,document_version,player_id,
      guardian_id,accepted_by_user_id,decision)
    values (g.organization_id, d.id, d.version, p_player_id, g.id, auth.uid(),
            case when p_authorize then 'accepted' else 'declined' end)
    on conflict (document_id, document_version, player_id) do update
      set decision = excluded.decision,
          guardian_id = excluded.guardian_id,
          accepted_by_user_id = excluded.accepted_by_user_id,
          accepted_at = now();
  end if;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values (g.organization_id,'ImageConsentDecided','player',p_player_id,
          jsonb_build_object('antes',v_antes,'despues',p_authorize,
                             'aviso',v_version,'origen','portal_familias'), auth.uid());

  return jsonb_build_object('ok',true,'image_consent',p_authorize,'notice_version',v_version);
end $function$;

-- Se conectan los dos sistemas que no se hablaban. Firmar 'uso_de_imagen' por
-- el camino viejo tambien mueve el booleano que lee toda la app; cualquier otro
-- documento se comporta igual que antes.
create or replace function private.portal_accept_consent(p_player_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare g app.guardians; d app.consent_documents;
begin
  if not private.portal_owns_player(p_player_id) then raise exception 'Not authorized'; end if;
  select * into g from private.portal_guardian();

  select * into d from app.consent_documents
   where organization_id = g.organization_id and code = p_code and active;
  if d.id is null then raise exception 'Ese documento no existe o ya no está vigente'; end if;

  -- El permiso de imagen no es un "leí y acepto": es una decisión con dos
  -- respuestas válidas. Se manda por su propio camino para que el "no" también
  -- quede guardado.
  if d.code = 'uso_de_imagen' then
    return private.portal_decide_image_consent(p_player_id, true);
  end if;

  insert into app.consent_acceptances(organization_id,document_id,document_version,player_id,
    guardian_id,accepted_by_user_id)
  values (g.organization_id, d.id, d.version, p_player_id, g.id, auth.uid())
  on conflict (document_id, document_version, player_id) do nothing;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values (g.organization_id,'ConsentAccepted','player',p_player_id,
          jsonb_build_object('code',d.code,'version',d.version,'title',d.title), auth.uid());

  return jsonb_build_object('ok',true,'code',d.code,'version',d.version);
end $function$;

-- El portal necesita saber en cuál de las tres está para pintar la tarjeta.
create or replace function private.portal_paperwork(p_player_id uuid)
returns jsonb
language plpgsql
stable
security definer
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
        -- Firmo una version anterior: cuenta como pendiente, con aviso.
        'accepted_version', a.document_version,
        'outdated', (a.id is not null and a.document_version < d.version))
        order by d.required desc, d.title)
      from app.consent_documents d
      left join app.consent_acceptances a
        on a.document_id = d.id and a.player_id = p_player_id
       and a.document_version = d.version
      where d.organization_id = g.organization_id and d.active), '[]'::jsonb),
    -- La decisión sobre la imagen, aparte de la lista de documentos: la tarjeta
    -- del portal necesita las tres respuestas, no sólo si firmó o no.
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
        'has', true, 'type', b.benefit_type,
        'percentage', b.percentage, 'amount', coalesce(b.override_amount, b.fixed_amount),
        'since', b.starts_on, 'until', b.ends_on)
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
      order by r.requested_at desc limit 1)
  ) into v;
  return v;
end $function$;

create or replace function public.v2_portal_decide_image_consent(player_id uuid, authorize boolean)
returns jsonb
language sql security definer set search_path to 'pg_catalog','private'
as $function$ select private.portal_decide_image_consent(player_id, authorize) $function$;

-- Crear una funcion en private vuelve a conceder EXECUTE a PUBLIC. Cada vez.
revoke all on function private.estado_de_imagen(boolean,boolean,text) from public, anon, authenticated;
revoke all on function private.query_players(uuid,text) from public, anon, authenticated;
revoke all on function private.portal_decide_image_consent(uuid,boolean) from public, anon, authenticated;
revoke all on function private.portal_accept_consent(uuid,text) from public, anon, authenticated;
revoke all on function private.portal_paperwork(uuid) from public, anon, authenticated;

revoke all on function public.v2_players(uuid,text) from public, anon;
revoke all on function public.v2_portal_decide_image_consent(uuid,boolean) from public, anon;
grant execute on function public.v2_players(uuid,text) to authenticated;
grant execute on function public.v2_portal_decide_image_consent(uuid,boolean) to authenticated;

do $$
declare v int; f text; r record; n_auto int; n_no int; n_sin int;
begin
  foreach f in array array['v2_players','v2_portal_decide_image_consent','v2_portal_accept_consent','v2_portal_paperwork'] loop
    select count(*) into v from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname=f;
    if v <> 1 then raise exception '% quedo % veces', f, v; end if;
  end loop;

  select count(*) into v from information_schema.role_routine_grants
   where routine_schema='private'
     and routine_name in ('estado_de_imagen','query_players','portal_decide_image_consent',
                          'portal_accept_consent','portal_paperwork')
     and grantee in ('PUBLIC','anon','authenticated');
  if v <> 0 then raise exception 'las funciones de N1 quedaron con % permisos sueltos', v; end if;

  -- El reparto tiene que salir igual que lo medido antes de tocar nada: si la
  -- regla de las tres respuestas moviera a alguien de lugar, estaria mal.
  select count(*) filter (where e='autoriza'), count(*) filter (where e='no_autoriza'),
         count(*) filter (where e='sin_preguntar')
    into n_auto, n_no, n_sin
  from (select private.estado_de_imagen(p.image_consent,p.data_consent,p.privacy_notice_version) e
        from app.players p where p.status='active' and p.archived_at is null) t;
  raise notice 'N1 · autoriza=% no_autoriza=% sin_preguntar=%', n_auto, n_no, n_sin;
  if n_auto + n_no + n_sin = 0 then raise exception 'N1 no clasifico a nadie'; end if;
end $$;
