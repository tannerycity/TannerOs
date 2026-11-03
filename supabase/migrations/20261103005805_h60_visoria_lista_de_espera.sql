-- h60 · Visoría: lista de espera, baja y "te sumamos" (03/11/2026).
--
-- Presidencia: "si llega al límite... poner un link de regístrate... si alguien
-- se da de baja, nosotros te sumamos... para no dejar ir esos leads".
-- Decisión: el cupo sigue siendo el total de la visoría (30), sin límite por
-- categoría.
--
-- Qué cambia:
--   1. Cupo lleno ya no rechaza a la familia: se registra en la lista de
--      espera (prospecto con source_campaign = '<slug>-espera'), sin liga para
--      firmar. No cuenta en el cupo ni sale en el tablero de inscritos.
--   2. v2_public_visoria dice "waitlist" cuando hay cupo lleno y la
--      inscripción sigue abierta, para que la portada ofrezca registrarse.
--   3. El staff da de baja a un inscrito con motivo (v2_visoria_drop): no se
--      borra, pasa a '<slug>-baja' y libera su lugar. El lead se queda.
--   4. El staff suma a alguien de la lista de espera (o de las bajas) cuando
--      hay lugar (v2_visoria_waitlist_add): pasa a inscrito y regresa la liga
--      personal para firmar, igual que v2_visoria_sign_link.
--   5. v2_visoria_board trae la lista de espera y las bajas (sólo a quien ve
--      contactos).
-- Todo queda en la bitácora de la visoría. No borra datos.

do $$
declare v_def text; v_old text;
begin
  -- 1. Apartar: con cupo lleno, a la lista de espera.
  v_def := pg_get_functiondef('private.visoria_aparta(text,text,jsonb,jsonb,jsonb,text)'::regprocedure);
  foreach v_old in array array[
    $a$v_par text := coalesce(tutor->>'relationship', '');$a$,
    $a$where p.organization_id = v_org and p.source_campaign = v_c.slug and p.archived_at is null and p.birth_date = v_birth$a$,
    $a$  if v_existe is not null then
    -- Ya estaba$a$,
    $a$  if v_c.capacity is not null and private.visoria_inscritos(v_org, v_c.slug) >= v_c.capacity then raise exception 'Campaign full'; end if;$a$,
    $a$tutor->>'phone', tutor->>'email', tutor->>'name', nino->>'category', v_c.slug, tutor->>'channel',$a$,
    $a$set trial_date = coalesce(trial_date, v_c.starts_on),$a$,
    $a$'apartadoAt', now())),$a$,
    $a$values (v_org, 'VisoriaRegistered', 'prospect', v_id,$a$,
    $a$'familia', 'lugar_apartado', 'ok'$a$,
    $a$  return v_r || jsonb_build_object('existing', false, 'token', private.visoria_nueva_liga(v_org, v_c.id, v_id));$a$] loop
    if position(v_old in v_def) = 0 then raise exception 'h60: no se pudo parchar visoria_aparta: %', left(v_old, 60); end if;
  end loop;
  v_def := replace(v_def, $a$v_par text := coalesce(tutor->>'relationship', '');$a$,
    $a$v_par text := coalesce(tutor->>'relationship', ''); v_espera boolean := false;$a$);
  v_def := replace(v_def, $a$where p.organization_id = v_org and p.source_campaign = v_c.slug and p.archived_at is null and p.birth_date = v_birth$a$,
    $a$where p.organization_id = v_org and p.source_campaign in (v_c.slug, v_c.slug || '-espera') and p.archived_at is null and p.birth_date = v_birth$a$);
  v_def := replace(v_def, $a$  if v_existe is not null then
    -- Ya estaba$a$, $a$  -- Ya estaba en la lista de espera: sin liga para firmar, sigue esperando.
  if v_existe is not null and exists (select 1 from app.prospects p where p.id = v_existe and p.source_campaign <> v_c.slug) then
    return jsonb_build_object('id', v_existe, 'folio', v_folio, 'existing', true, 'token', null, 'waitlist', true);
  end if;
  if v_existe is not null then
    -- Ya estaba$a$);
  v_def := replace(v_def, $a$  if v_c.capacity is not null and private.visoria_inscritos(v_org, v_c.slug) >= v_c.capacity then raise exception 'Campaign full'; end if;$a$,
    $a$  -- Cupo lleno: no se pierde la familia, va a la lista de espera (h60).
  v_espera := v_c.capacity is not null and private.visoria_inscritos(v_org, v_c.slug) >= v_c.capacity;$a$);
  v_def := replace(v_def, $a$tutor->>'phone', tutor->>'email', tutor->>'name', nino->>'category', v_c.slug, tutor->>'channel',$a$,
    $a$tutor->>'phone', tutor->>'email', tutor->>'name', nino->>'category', case when v_espera then v_c.slug || '-espera' else v_c.slug end, tutor->>'channel',$a$);
  v_def := replace(v_def, $a$set trial_date = coalesce(trial_date, v_c.starts_on),$a$,
    $a$set trial_date = case when v_espera then trial_date else coalesce(trial_date, v_c.starts_on) end,$a$);
  v_def := replace(v_def, $a$'apartadoAt', now())),$a$, $a$'apartadoAt', now(), 'espera', v_espera)),$a$);
  v_def := replace(v_def, $a$values (v_org, 'VisoriaRegistered', 'prospect', v_id,$a$,
    $a$values (v_org, case when v_espera then 'VisoriaWaitlisted' else 'VisoriaRegistered' end, 'prospect', v_id,$a$);
  v_def := replace(v_def, $a$'familia', 'lugar_apartado', 'ok'$a$, $a$'familia', case when v_espera then 'lista_de_espera' else 'lugar_apartado' end, 'ok'$a$);
  v_def := replace(v_def, $a$  return v_r || jsonb_build_object('existing', false, 'token', private.visoria_nueva_liga(v_org, v_c.id, v_id));$a$,
    $a$  if v_espera then return v_r || jsonb_build_object('existing', false, 'token', null, 'waitlist', true); end if;
  return v_r || jsonb_build_object('existing', false, 'token', private.visoria_nueva_liga(v_org, v_c.id, v_id));$a$);
  execute v_def;

  -- 2. La portada sabe que hay lista de espera.
  v_def := pg_get_functiondef('public.v2_public_visoria(text,text)'::regprocedure);
  v_old := $a$'closed', not v_c.is_open,$a$;
  if position(v_old in v_def) = 0 then raise exception 'h60: no se pudo parchar v2_public_visoria'; end if;
  v_def := replace(v_def, v_old, $a$'closed', not v_c.is_open,
    'waitlist', v_c.is_open and v_c.capacity is not null and v_n >= v_c.capacity,$a$);
  execute v_def;

  -- 5. El tablero trae la lista de espera y las bajas.
  v_def := pg_get_functiondef('public.v2_visoria_board(uuid,text)'::regprocedure);
  v_old := $a$'canAdmin', private.has_module_access(v_org, 'admin', true),$a$;
  if position(v_old in v_def) = 0 then raise exception 'h60: no se pudo parchar v2_visoria_board'; end if;
  v_def := replace(v_def, v_old, $a$'canAdmin', private.has_module_access(v_org, 'admin', true),
    'waitlist', case when v_todo then coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'folio', p.folio, 'firstName', p.first_name, 'lastName', p.last_name, 'birthDate', p.birth_date,
        'category', p.category_interest, 'guardian', p.guardian_name, 'phone', p.phone, 'createdAt', p.created_at,
        'status', case when p.source_campaign = v_c.slug || '-espera' then 'espera' else 'baja' end,
        'dropReason', p.metadata->'visoria'->>'bajaMotivo', 'droppedAt', p.metadata->'visoria'->>'bajaAt') order by p.created_at)
      from app.prospects p where p.organization_id = v_org and p.source_campaign in (v_c.slug || '-espera', v_c.slug || '-baja') and p.archived_at is null), '[]'::jsonb)
      else '[]'::jsonb end,$a$);
  execute v_def;
end $$;

-- 3. Dar de baja: libera el lugar y se queda el lead.
create or replace function public.v2_visoria_drop(organization_id uuid, prospect_id uuid, reason text)
returns jsonb language plpgsql security definer set search_path to ''
as $$
declare v_org uuid := v2_visoria_drop.organization_id; p app.prospects%rowtype; c app.visoria_campaigns%rowtype;
begin
  if not private.has_module_access(v_org, 'prospects', true) then raise exception 'Not authorized'; end if;
  if length(btrim(coalesce(reason, ''))) < 3 then raise exception 'Escribe el motivo de la baja'; end if;
  select * into p from app.prospects pp where pp.id = v2_visoria_drop.prospect_id and pp.organization_id = v_org and pp.archived_at is null for update;
  select * into c from app.visoria_campaigns cc where cc.organization_id = v_org and cc.slug = p.source_campaign;
  if p.id is null or c.id is null then raise exception 'No está inscrito en la visoría'; end if;
  update app.prospects set source_campaign = c.slug || '-baja',
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('visoria', coalesce(metadata->'visoria', '{}'::jsonb)
           || jsonb_build_object('bajaAt', now(), 'bajaMotivo', left(btrim(reason), 300), 'bajaBy', (select auth.uid()))),
         updated_at = now()
   where id = p.id;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (v_org, 'VisoriaDropped', 'prospect', p.id, jsonb_build_object('campaign', c.slug), (select auth.uid()));
  perform private.visoria_audita(v_org, c.id, p.id, null, 'staff', 'baja', 'ok', left(btrim(reason), 300), '{}'::jsonb);
  return jsonb_build_object('spotsLeft', case when c.capacity is null then null else greatest(0, c.capacity - private.visoria_inscritos(v_org, c.slug)) end);
end
$$;

-- 4. Te sumamos: de la lista de espera (o de las bajas) a inscrito, si hay lugar.
create or replace function public.v2_visoria_waitlist_add(organization_id uuid, prospect_id uuid)
returns jsonb language plpgsql security definer set search_path to ''
as $$
declare v_org uuid := v2_visoria_waitlist_add.organization_id; p app.prospects%rowtype; c app.visoria_campaigns%rowtype;
begin
  if not private.has_module_access(v_org, 'prospects', true) then raise exception 'Not authorized'; end if;
  select * into p from app.prospects pp where pp.id = v2_visoria_waitlist_add.prospect_id and pp.organization_id = v_org and pp.archived_at is null for update;
  select * into c from app.visoria_campaigns cc where cc.organization_id = v_org
     and p.source_campaign in (cc.slug || '-espera', cc.slug || '-baja') for update;
  if p.id is null or c.id is null then raise exception 'No está en la lista de espera'; end if;
  if c.capacity is not null and private.visoria_inscritos(v_org, c.slug) >= c.capacity then
    raise exception 'Cupo lleno: primero da de baja a alguien o sube el cupo';
  end if;
  update app.prospects set source_campaign = c.slug, trial_date = c.starts_on,
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('visoria', coalesce(metadata->'visoria', '{}'::jsonb)
           || jsonb_build_object('espera', false, 'sumadoAt', now(), 'sumadoBy', (select auth.uid()))),
         updated_at = now()
   where id = p.id;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (v_org, 'VisoriaPromoted', 'prospect', p.id, jsonb_build_object('campaign', c.slug, 'from', p.source_campaign), (select auth.uid()));
  perform private.visoria_audita(v_org, c.id, p.id, null, 'staff', 'sumado_de_espera', 'ok', null, '{}'::jsonb);
  return jsonb_build_object('token', private.visoria_nueva_liga(v_org, c.id, p.id), 'phone', p.phone, 'guardian', p.guardian_name, 'firstName', p.first_name);
end
$$;

revoke all on function public.v2_visoria_drop(uuid, uuid, text) from public, anon;
revoke all on function public.v2_visoria_waitlist_add(uuid, uuid) from public, anon;
grant execute on function public.v2_visoria_drop(uuid, uuid, text) to authenticated;
grant execute on function public.v2_visoria_waitlist_add(uuid, uuid) to authenticated;
