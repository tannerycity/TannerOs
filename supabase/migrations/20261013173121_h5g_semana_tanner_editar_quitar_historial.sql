-- h5g: Semana Tanner editable, con "Quitar" y con historial (13/10/2026).
-- "No permite eliminar si me equivoqué o editarla; que haya trazabilidad en
-- Presidencia de quién cambió eso."
--   · Quitar no borra: la semana queda como borrador con removed_at/by, deja
--     de verse y deja de llegarle al Formador. Volver a elegir Reto la revive.
--   · Cada cambio deja un evento por categoría con el antes y el después.
--   · training_week_history: quién, cuándo y qué, para Presidencia y Dirección.
alter table app.training_weeks add column if not exists removed_at timestamptz;
alter table app.training_weeks add column if not exists removed_by uuid references auth.users(id) on delete set null;

create or replace function private.command_save_training_weeks(p_organization_id uuid, p_weeks jsonb, p_publish boolean)
returns integer language plpgsql security definer set search_path to '' as $function$
declare w jsonb; v_cat record; v_uid uuid := (select auth.uid()); v_n int := 0; v_kind text;
  v_old app.training_weeks%rowtype; v_new app.training_weeks%rowtype; v_accion text;
begin
  if not private.has_module_access(p_organization_id, 'formacion_direccion', true) then raise exception 'Not authorized'; end if;
  for w in select * from jsonb_array_elements(p_weeks) loop
    select c.id, c.name, coalesce((fc.attrs->>'usesChallenges')::boolean, true) uses into v_cat
    from app.categories c left join app.formation_concepts fc on fc.organization_id = c.organization_id and fc.kind = 'etapa' and fc.code = c.stage
    where c.id = (w->>'categoryId')::uuid and c.organization_id = p_organization_id and c.status = 'active';
    if v_cat.id is null then raise exception 'Category not found'; end if;
    v_kind := case when v_cat.uses then 'reto' else 'mundo_baby' end;
    if not exists (select 1 from app.formation_concepts fc where fc.organization_id = p_organization_id and fc.kind = v_kind and fc.code = w->>'primary') then
      raise exception '% usa % y "%" no lo es', v_cat.name, case when v_cat.uses then 'los 9 Retos' else 'los mundos Baby' end, w->>'primary';
    end if;
    if nullif(w->>'secondary', '') is not null and not exists (select 1 from app.formation_concepts fc
        where fc.organization_id = p_organization_id and fc.kind = v_kind and fc.code = w->>'secondary') then
      raise exception 'Reto secundario inválido';
    end if;
    select * into v_old from app.training_weeks t
      where t.organization_id = p_organization_id and t.category_id = v_cat.id and t.week_start = (w->>'weekStart')::date;
    insert into app.training_weeks(organization_id, category_id, week_start, primary_challenge, secondary_challenge, behavior,
                                   status, created_by, published_by, published_at)
    values (p_organization_id, v_cat.id, (w->>'weekStart')::date, w->>'primary', nullif(w->>'secondary', ''),
            nullif(btrim(w->>'behavior'), ''), case when p_publish then 'published' else 'draft' end, v_uid,
            case when p_publish then v_uid end, case when p_publish then now() end)
    on conflict (organization_id, category_id, week_start) do update set
      primary_challenge = excluded.primary_challenge, secondary_challenge = excluded.secondary_challenge,
      behavior = excluded.behavior,
      status = case when p_publish then 'published' when app.training_weeks.removed_at is not null then 'draft' else app.training_weeks.status end,
      published_by = case when p_publish then v_uid else app.training_weeks.published_by end,
      published_at = case when p_publish then coalesce(app.training_weeks.published_at, now()) else app.training_weeks.published_at end,
      removed_at = null, removed_by = null,
      updated_at = now()
    returning * into v_new;
    v_accion := case when v_old.id is null or v_old.removed_at is not null then (case when p_publish then 'publicada' else 'creada' end)
                     when v_old.status = 'published' then 'editada'
                     when p_publish then 'publicada' else 'guardada' end;
    -- Sólo deja huella si algo cambió (publicar sin tocar una ya publicada no ensucia el historial).
    if v_old.id is null or v_old.removed_at is not null or v_old.status is distinct from v_new.status
       or v_old.primary_challenge is distinct from v_new.primary_challenge
       or v_old.secondary_challenge is distinct from v_new.secondary_challenge
       or v_old.behavior is distinct from v_new.behavior then
      insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
      values (p_organization_id, 'TrainingWeekChanged', 'training_week', v_new.id, jsonb_build_object(
        'action', v_accion, 'categoryId', v_cat.id, 'category', v_cat.name, 'weekStart', v_new.week_start,
        'before', case when v_old.id is null or v_old.removed_at is not null then null else jsonb_build_object(
          'primary', v_old.primary_challenge, 'secondary', v_old.secondary_challenge, 'behavior', v_old.behavior, 'status', v_old.status) end,
        'after', jsonb_build_object('primary', v_new.primary_challenge, 'secondary', v_new.secondary_challenge,
          'behavior', v_new.behavior, 'status', v_new.status)), v_uid);
    end if;
    v_n := v_n + 1;
  end loop;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, case when p_publish then 'TrainingWeeksPublished' else 'TrainingWeeksSaved' end, 'training_week', null, p_weeks, v_uid);
  return v_n;
end $function$;

-- Quitar el Reto de una categoría (me equivoqué): no se borra, se aparta.
create or replace function private.command_remove_training_week(p_organization_id uuid, p_category_id uuid, p_week_start date)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare v_uid uuid := (select auth.uid()); v_old app.training_weeks%rowtype; v_cat text;
begin
  if not private.has_module_access(p_organization_id, 'formacion_direccion', true) then raise exception 'Not authorized'; end if;
  select * into v_old from app.training_weeks t
    where t.organization_id = p_organization_id and t.category_id = p_category_id and t.week_start = p_week_start and t.removed_at is null
    for update;
  if v_old.id is null then raise exception 'Esa categoría no tiene Reto esa semana'; end if;
  select name into v_cat from app.categories where id = p_category_id;
  update app.training_weeks set status = 'draft', removed_at = now(), removed_by = v_uid, updated_at = now() where id = v_old.id;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, 'TrainingWeekChanged', 'training_week', v_old.id, jsonb_build_object(
    'action', 'quitada', 'categoryId', p_category_id, 'category', v_cat, 'weekStart', p_week_start,
    'before', jsonb_build_object('primary', v_old.primary_challenge, 'secondary', v_old.secondary_challenge,
      'behavior', v_old.behavior, 'status', v_old.status), 'after', null), v_uid);
  return jsonb_build_object('id', v_old.id, 'removed', true);
end $function$;
revoke all on function private.command_remove_training_week(uuid, uuid, date) from public, anon, authenticated;

create or replace function public.v2_remove_training_week(organization_id uuid, category_id uuid, week_start date)
returns jsonb language sql security definer set search_path to 'pg_catalog', 'private' as $$
  select private.command_remove_training_week(organization_id, category_id, week_start)
$$;
revoke all on function public.v2_remove_training_week(uuid, uuid, date) from public, anon;
grant execute on function public.v2_remove_training_week(uuid, uuid, date) to authenticated;

-- Historial de una categoría en una semana: quién, cuándo y qué cambió.
create or replace function private.training_week_history(p_organization_id uuid, p_category_id uuid, p_week_start date)
returns jsonb language plpgsql stable security definer set search_path to '' as $function$
begin
  if not (private.is_presidency(p_organization_id) or private.has_module_access(p_organization_id, 'formacion_direccion', false)) then
    raise exception 'Not authorized';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'at', e.created_at, 'action', e.payload->>'action',
      'by', coalesce((select nullif(btrim(pf.display_name), '') from public.profiles pf where pf.user_id = e.actor_user_id), 'Alguien del staff'),
      'before', e.payload->'before', 'after', e.payload->'after') order by e.created_at desc)
    from app.domain_events e
    where e.organization_id = p_organization_id and e.event_type = 'TrainingWeekChanged'
      and e.payload->>'categoryId' = p_category_id::text and (e.payload->>'weekStart')::date = p_week_start), '[]'::jsonb);
end $function$;
revoke all on function private.training_week_history(uuid, uuid, date) from public, anon, authenticated;

create or replace function public.v2_training_week_history(organization_id uuid, category_id uuid, week_start date)
returns jsonb language sql stable security definer set search_path to 'pg_catalog', 'private' as $$
  select private.training_week_history(organization_id, category_id, week_start)
$$;
revoke all on function public.v2_training_week_history(uuid, uuid, date) from public, anon;
grant execute on function public.v2_training_week_history(uuid, uuid, date) to authenticated;

-- La vista de Dirección: una semana quitada no se ve; y cada categoría dice
-- quién la tocó al último.
do $$
declare d text; n0 text;
begin
  d := pg_get_functiondef('private.query_direction_week(uuid,date)'::regprocedure); n0 := d;
  d := replace(d,
    $r$'behavior', w.behavior, 'status', w.status, 'publishedAt', w.published_at)
                 from app.training_weeks w where w.category_id = c.id and w.week_start = v_week),$r$,
    $r$'behavior', w.behavior, 'status', w.status, 'publishedAt', w.published_at, 'updatedAt', w.updated_at,
                   'lastBy', (select nullif(btrim(pf.display_name), '') from app.domain_events e join public.profiles pf on pf.user_id = e.actor_user_id
                              where e.organization_id = p_organization_id and e.event_type = 'TrainingWeekChanged' and e.aggregate_id = w.id
                              order by e.created_at desc limit 1))
                 from app.training_weeks w where w.category_id = c.id and w.week_start = v_week and w.removed_at is null),$r$);
  if d = n0 then raise exception 'No se pudo parchar query_direction_week'; end if;
  execute d;
end $$;
