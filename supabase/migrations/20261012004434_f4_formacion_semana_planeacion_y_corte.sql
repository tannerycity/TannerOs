-- Formación Tanner · Fase 0 · 5-7/7: Semana Tanner, planeación, sesiones
-- desde el horario, corte del domingo y avisos (Presidencia, 11/10/2026).
--
-- Cuatro cosas que no se pisan:
--   HORARIO (e4) -> cuándo debe haber sesión.
--   EXCEPCIÓN (e4) -> qué cambió en una fecha.
--   PLANEACIÓN (session_plans) -> qué pretende enseñar el Formador.
--   SESIÓN REALIZADA (sessions + asistencia + cierre) -> qué pasó.
--
-- Regla del Formador: antes del corte (domingo 22:00, configurable) deja
-- LISTAS sus sesiones de la semana siguiente. Lista = categoría/fecha +
-- duración (del horario) + Reto u objetivo + al menos una tarea, y que el
-- Formador la haya confirmado. A la hora del corte se guarda una foto
-- (planning_cutoffs): eso cuenta para el Bono TannerOS. Lo que cambie
-- después queda registrado pero no reescribe la foto. "Premiamos llegar
-- preparados; no castigamos adaptar."
-- Dirección Deportiva publica la Semana a más tardar el viernes 22:00
-- (configurable); si no, recibe aviso. Si no publica, el Formador escribe su
-- objetivo y no se le penaliza.

-- ===== Configuración por club (Presidencia la cambia) =====
create or replace function private.formation_settings(p_organization_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
      'inicio', null, 'inicioCuenta', null,
      'corte', jsonb_build_object('dia', 7, 'hora', '22:00'),
      'publicacion', jsonb_build_object('dia', 5, 'hora', '22:00'),
      'avisoHorasAntes', 4, 'umbralCumplido', 1)
    || coalesce(o.settings->'formacion', '{}'::jsonb)
    || jsonb_build_object('tz', coalesce(nullif(o.timezone, ''), 'America/Mexico_City'))
  from public.organizations o where o.id = p_organization_id
$$;

-- El momento exacto de un límite semanal (corte o publicación) para la
-- semana que empieza el lunes p_week_start: el día ISO indicado de la semana
-- ANTERIOR, a la hora indicada, en la zona del club.
create or replace function private.formation_deadline(p_organization_id uuid, p_week_start date, p_kind text)
returns timestamptz language sql stable security definer set search_path = '' as $$
  select ((p_week_start - 8 + (s->p_kind->>'dia')::int) + (s->p_kind->>'hora')::time) at time zone (s->>'tz')
  from (select private.formation_settings(p_organization_id) s) x
$$;

-- Etapa de cada categoría: con ella se sabe si usa Retos o mundos Baby.
alter table app.categories add column if not exists stage text;
update app.categories c set stage = case c.code
    when 'baby_tanner' then 'baby_3_4' when 'mini_baby_tanner' then 'baby_3_4'
    when 't6' then 't6' when 't8' then 't8' when 't10' then 't10' when 't12' then 't12' end
  from public.organizations o where o.id = c.organization_id and o.slug = 'tannery-city-fc' and c.stage is null;

-- ===== Semana Tanner (Dirección decide QUÉ y PARA QUÉ) =====
create table app.training_weeks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid not null references app.categories(id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  primary_challenge text not null,
  secondary_challenge text,
  behavior text,
  status text not null default 'draft' check (status in ('draft','published')),
  created_by uuid references auth.users(id) on delete set null,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (secondary_challenge is null or secondary_challenge <> primary_challenge),
  unique (organization_id, category_id, week_start)
);

-- ===== Sesiones que nacen del horario =====
alter table app.sessions add column if not exists origin text;           -- horario | sesion_extra | manual (null = histórico)
alter table app.sessions add column if not exists planned_date date;     -- fecha local de la sesión esperada
alter table app.sessions add column if not exists schedule_slot_id uuid references app.category_schedule_slots(id) on delete set null;
alter table app.sessions add column if not exists schedule_exception_id uuid references app.schedule_exceptions(id) on delete set null;
create unique index if not exists sessions_una_por_slot on app.sessions(organization_id, category_id, planned_date, schedule_slot_id)
  where origin = 'horario';
create unique index if not exists sessions_una_por_extra on app.sessions(organization_id, schedule_exception_id)
  where origin = 'sesion_extra';

-- ===== Planeación (el Formador decide CÓMO) =====
create table app.session_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  session_id uuid not null unique references app.sessions(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','ready')),
  challenge text,
  objective text,
  ready_at timestamptz,
  ready_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'ready' or ready_at is not null)
);
create table app.session_plan_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_id uuid not null references app.session_plans(id) on delete cascade,
  position smallint not null,
  block text,
  task_id uuid references app.training_tasks(id) on delete set null,
  custom_text text,
  difficulty text not null default 'base' check (difficulty in ('facil','base','dificil')),
  space text not null default 'completo' check (space in ('completo','reducido')),
  created_at timestamptz not null default now(),
  check (task_id is not null or nullif(btrim(custom_text), '') is not null),
  unique (plan_id, position)
);

-- ===== Corte semanal (la foto para el Bono TannerOS) =====
create table app.planning_cutoffs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  responsible_user_id uuid references auth.users(id) on delete set null,   -- null = sesiones sin Formador asignado
  deadline_at timestamptz not null,
  expected_count int not null,
  ready_count int not null,
  compliance numeric(5,2),
  status text not null check (status in ('cumplido','no_cumplido','revision','sin_responsable')),
  snapshot jsonb not null default '[]'::jsonb,
  computed_at timestamptz not null default now(),
  review_note text,
  resolved_status text check (resolved_status in ('cumplido','no_cumplido')),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz
);
create unique index planning_cutoffs_uno on app.planning_cutoffs(organization_id, week_start, coalesce(responsible_user_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Avisos ya mandados (para no repetirlos).
create table app.formation_notices (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null,
  week_start date not null,
  user_id uuid not null,
  sent_at timestamptz not null default now(),
  primary key (organization_id, kind, week_start, user_id)
);

alter table app.training_weeks enable row level security;
alter table app.session_plans enable row level security;
alter table app.session_plan_items enable row level security;
alter table app.planning_cutoffs enable row level security;
alter table app.formation_notices enable row level security;
revoke all on app.training_weeks, app.session_plans, app.session_plan_items, app.planning_cutoffs, app.formation_notices
  from public, anon, authenticated;

-- ===== Quién lleva qué =====
create or replace function private.category_coach(p_organization_id uuid, p_category_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select a.user_id from app.category_staff_assignments a
  join public.organization_memberships m on m.user_id = a.user_id and m.organization_id = a.organization_id and m.active
  where a.organization_id = p_organization_id and a.category_id = p_category_id
  order by a.assigned_at desc nulls last, a.created_at desc limit 1
$$;

create or replace function private.can_plan_session(p_organization_id uuid, p_session_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_module_access(p_organization_id, 'formacion_direccion', true)
      or (private.has_module_access(p_organization_id, 'formacion', true) and exists (
            select 1 from app.sessions s where s.id = p_session_id and s.organization_id = p_organization_id
              and (s.responsible_user_id = (select auth.uid())
                   or exists (select 1 from app.category_staff_assignments a
                              where a.organization_id = s.organization_id and a.category_id = s.category_id
                                and a.user_id = (select auth.uid())))))
$$;

-- ===== Sesiones desde el horario =====
-- Crea las que faltan, ajusta hora/cancha si hubo cambio, cancela las que una
-- excepción quitó (y las reactiva si la excepción se anula). Sólo toca
-- sesiones nacidas del horario y todavía programadas. Respeta la fecha de
-- arranque del club.
create or replace function private.sync_sessions_from_schedule(p_organization_id uuid, p_from date, p_to date)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_inicio date := nullif(private.formation_settings(p_organization_id)->>'inicio', '')::date;
  v_from date; v_n int := 0; e record; v_id uuid;
begin
  if v_inicio is null then return 0; end if;
  v_from := greatest(p_from, v_inicio);
  if p_to < v_from then return 0; end if;

  for e in select * from private.expected_sessions(p_organization_id, v_from, p_to) loop
    if e.origin = 'sesion_extra' then
      select id into v_id from app.sessions where organization_id = p_organization_id and origin = 'sesion_extra' and schedule_exception_id = e.exception_id;
    else
      select id into v_id from app.sessions where organization_id = p_organization_id and origin = 'horario'
        and category_id = e.category_id and planned_date = e.session_date and schedule_slot_id = e.slot_id;
    end if;
    if v_id is null then
      insert into app.sessions(organization_id, session_type, category_id, starts_at, ends_at, responsible_user_id, status,
                               origin, planned_date, schedule_slot_id, schedule_exception_id, venue_id, metadata)
      values (p_organization_id, 'training', e.category_id, e.starts_at, e.ends_at,
              private.category_coach(p_organization_id, e.category_id), 'scheduled',
              case when e.origin = 'sesion_extra' then 'sesion_extra' else 'horario' end,
              e.session_date, e.slot_id, e.exception_id, e.venue_id, '{}'::jsonb);
      v_n := v_n + 1;
    else
      update app.sessions s set
        starts_at = e.starts_at, ends_at = e.ends_at, venue_id = coalesce(e.venue_id, s.venue_id),
        schedule_exception_id = e.exception_id,
        status = case when s.status = 'cancelled' and s.metadata ? 'canceladaPorExcepcion' then 'scheduled' else s.status end,
        metadata = s.metadata - 'canceladaPorExcepcion',
        responsible_user_id = coalesce(s.responsible_user_id, private.category_coach(p_organization_id, e.category_id)),
        updated_at = now()
      where s.id = v_id and (s.status = 'scheduled' or (s.status = 'cancelled' and s.metadata ? 'canceladaPorExcepcion'))
        and (s.starts_at, s.ends_at, s.status, s.schedule_exception_id) is distinct from (e.starts_at, e.ends_at, 'scheduled', e.exception_id);
    end if;
  end loop;

  -- Las que ya no se esperan: canceladas por excepción (no se borran).
  update app.sessions s set status = 'cancelled', updated_at = now(),
         metadata = s.metadata || jsonb_build_object('canceladaPorExcepcion', true)
  where s.organization_id = p_organization_id and s.origin in ('horario','sesion_extra') and s.status = 'scheduled'
    and s.planned_date between v_from and p_to
    and not exists (select 1 from private.expected_sessions(p_organization_id, s.planned_date, s.planned_date, s.category_id) e
                    where (s.origin = 'horario' and e.slot_id = s.schedule_slot_id)
                       or (s.origin = 'sesion_extra' and e.exception_id = s.schedule_exception_id));
  return v_n;
end $$;

-- Una sesión cancelada después del corte que no estaba lista pasa el corte
-- de su semana a revisión: no castigamos lo que cambió la operación.
create or replace function private.cutoff_review_on_cancel()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' and new.planned_date is not null then
    update app.planning_cutoffs c set status = 'revision'
    where c.organization_id = new.organization_id and c.status = 'no_cumplido'
      and c.week_start = new.planned_date - (extract(isodow from new.planned_date)::int - 1)
      and exists (select 1 from jsonb_array_elements(c.snapshot) x
                  where (x->>'sessionId')::uuid = new.id and not (x->>'ready')::boolean);
  end if;
  return new;
end $$;
create trigger sessions_cutoff_review after update of status on app.sessions
for each row execute function private.cutoff_review_on_cancel();

-- Publicar horario o registrar/anular una excepción sincroniza las sesiones
-- de las próximas 6 semanas en el momento (sin esperar a la noche).
create or replace function private.sync_after_schedule_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_hoy date := (now() at time zone 'America/Mexico_City')::date;
begin
  perform private.sync_sessions_from_schedule(new.organization_id, v_hoy, v_hoy + 42);
  return null;
end $$;
create trigger schedule_exceptions_sync after insert or update on app.schedule_exceptions
for each row execute function private.sync_after_schedule_change();
create trigger category_schedules_sync after update of status on app.category_schedules
for each row when (new.status = 'published') execute function private.sync_after_schedule_change();

-- ===== Semana Tanner: publicar =====
create or replace function private.command_save_training_weeks(p_organization_id uuid, p_weeks jsonb, p_publish boolean)
returns int language plpgsql security definer set search_path = '' as $$
declare w jsonb; v_cat record; v_uid uuid := (select auth.uid()); v_n int := 0; v_kind text;
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
    insert into app.training_weeks(organization_id, category_id, week_start, primary_challenge, secondary_challenge, behavior,
                                   status, created_by, published_by, published_at)
    values (p_organization_id, v_cat.id, (w->>'weekStart')::date, w->>'primary', nullif(w->>'secondary', ''),
            nullif(btrim(w->>'behavior'), ''), case when p_publish then 'published' else 'draft' end, v_uid,
            case when p_publish then v_uid end, case when p_publish then now() end)
    on conflict (organization_id, category_id, week_start) do update set
      primary_challenge = excluded.primary_challenge, secondary_challenge = excluded.secondary_challenge,
      behavior = excluded.behavior,
      status = case when p_publish then 'published' else app.training_weeks.status end,
      published_by = case when p_publish then v_uid else app.training_weeks.published_by end,
      published_at = case when p_publish then coalesce(app.training_weeks.published_at, now()) else app.training_weeks.published_at end,
      updated_at = now();
    v_n := v_n + 1;
  end loop;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, case when p_publish then 'TrainingWeeksPublished' else 'TrainingWeeksSaved' end, 'training_week', null, p_weeks, v_uid);
  return v_n;
end $$;

-- ===== Planeación de una sesión =====
-- p = {challenge?, objective?, items:[{block?, taskId?, text?, difficulty?, space?}], ready: bool}
-- "ready" sólo se acepta si cumple el mínimo. Editar una sesión ya lista la
-- mantiene lista (adaptar está bien) y conserva su hora de "lista".
create or replace function private.command_save_session_plan(p_organization_id uuid, p_session_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid()); v_s app.sessions%rowtype; v_plan app.session_plans%rowtype;
  v_week app.training_weeks%rowtype; v_item jsonb; v_pos int := 0; v_ready boolean := coalesce((p->>'ready')::boolean, false);
  v_challenge text; v_objective text; v_items int;
begin
  if not private.can_plan_session(p_organization_id, p_session_id) then raise exception 'Not authorized'; end if;
  select * into v_s from app.sessions where id = p_session_id and organization_id = p_organization_id for update;
  if v_s.id is null then raise exception 'Session not found'; end if;
  if v_s.status = 'cancelled' then raise exception 'La sesión está cancelada'; end if;

  select * into v_week from app.training_weeks w where w.organization_id = p_organization_id and w.category_id = v_s.category_id
    and w.status = 'published' and w.week_start = coalesce(v_s.planned_date, v_s.starts_at::date) - (extract(isodow from coalesce(v_s.planned_date, v_s.starts_at::date))::int - 1);
  v_challenge := coalesce(nullif(p->>'challenge', ''), v_week.primary_challenge);
  v_objective := nullif(btrim(p->>'objective'), '');

  insert into app.session_plans(organization_id, session_id, challenge, objective, updated_by)
  values (p_organization_id, p_session_id, v_challenge, v_objective, v_uid)
  on conflict (session_id) do update set challenge = excluded.challenge, objective = excluded.objective,
    updated_by = v_uid, updated_at = now()
  returning * into v_plan;

  if p ? 'items' then
    delete from app.session_plan_items where plan_id = v_plan.id;
    for v_item in select * from jsonb_array_elements(p->'items') loop
      v_pos := v_pos + 1;
      insert into app.session_plan_items(organization_id, plan_id, position, block, task_id, custom_text, difficulty, space)
      values (p_organization_id, v_plan.id, v_pos, nullif(v_item->>'block', ''), nullif(v_item->>'taskId', '')::uuid,
              nullif(btrim(v_item->>'text'), ''), coalesce(nullif(v_item->>'difficulty', ''), 'base'),
              coalesce(nullif(v_item->>'space', ''), 'completo'));
    end loop;
  end if;
  select count(*) into v_items from app.session_plan_items where plan_id = v_plan.id;

  if v_ready or v_plan.status = 'ready' then
    if v_s.category_id is null or v_s.starts_at is null or v_s.ends_at is null then raise exception 'La sesión no tiene categoría, fecha u hora'; end if;
    if v_challenge is null and v_objective is null then raise exception 'Falta el Reto u objetivo'; end if;
    if v_items = 0 then raise exception 'Falta al menos una tarea'; end if;
    if v_plan.status <> 'ready' then
      update app.session_plans set status = 'ready', ready_at = now(), ready_by = v_uid where id = v_plan.id returning * into v_plan;
    end if;
  end if;

  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, 'SessionPlanSaved', 'session', p_session_id,
          jsonb_build_object('status', v_plan.status, 'items', v_items, 'afterCutoff',
            now() > private.formation_deadline(p_organization_id, coalesce(v_s.planned_date, v_s.starts_at::date)
                     - (extract(isodow from coalesce(v_s.planned_date, v_s.starts_at::date))::int - 1), 'corte')), v_uid);
  return jsonb_build_object('planId', v_plan.id, 'status', v_plan.status, 'items', v_items, 'readyAt', v_plan.ready_at);
end $$;

-- ===== Corte =====
-- Foto de la semana p_week_start tal como estaba en su corte: por responsable,
-- sesiones esperadas (no canceladas) y cuáles estaban listas a esa hora.
create or replace function private.take_planning_cutoff(p_organization_id uuid, p_week_start date)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_deadline timestamptz := private.formation_deadline(p_organization_id, p_week_start, 'corte');
  v_cuenta date := nullif(private.formation_settings(p_organization_id)->>'inicioCuenta', '')::date;
  v_umbral numeric := coalesce((private.formation_settings(p_organization_id)->>'umbralCumplido')::numeric, 1);
  v_n int := 0; r record;
begin
  if v_cuenta is null or p_week_start < v_cuenta then return 0; end if;
  perform private.sync_sessions_from_schedule(p_organization_id, p_week_start, p_week_start + 6);
  for r in
    select s.responsible_user_id uid,
           count(*) esperadas,
           count(*) filter (where sp.status = 'ready' and sp.ready_at <= v_deadline) listas,
           jsonb_agg(jsonb_build_object('sessionId', s.id, 'categoryId', s.category_id, 'date', s.planned_date,
                     'startsAt', s.starts_at, 'ready', coalesce(sp.status = 'ready' and sp.ready_at <= v_deadline, false),
                     'challenge', sp.challenge, 'items', (select count(*) from app.session_plan_items i where i.plan_id = sp.id))
                     order by s.starts_at) foto
    from app.sessions s
    left join app.session_plans sp on sp.session_id = s.id
    where s.organization_id = p_organization_id and s.origin in ('horario','sesion_extra') and s.status <> 'cancelled'
      and s.planned_date between p_week_start and p_week_start + 6
      and s.created_at <= v_deadline   -- lo que se agregó después del corte no cuenta en contra
    group by s.responsible_user_id
  loop
    insert into app.planning_cutoffs(organization_id, week_start, responsible_user_id, deadline_at, expected_count, ready_count,
                                     compliance, status, snapshot)
    values (p_organization_id, p_week_start, r.uid, v_deadline, r.esperadas, r.listas,
            round(100.0 * r.listas / nullif(r.esperadas, 0), 2),
            case when r.uid is null then 'sin_responsable'
                 when r.listas >= ceil(r.esperadas * v_umbral) then 'cumplido' else 'no_cumplido' end,
            r.foto)
    on conflict do nothing;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Dirección resuelve una semana en revisión (con motivo).
create or replace function private.command_resolve_planning_cutoff(p_organization_id uuid, p_cutoff_id uuid, p_status text, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if not private.has_module_access(p_organization_id, 'formacion_direccion', true) then raise exception 'Not authorized'; end if;
  if p_status not in ('cumplido','no_cumplido') then raise exception 'Estado inválido'; end if;
  if nullif(btrim(p_note), '') is null then raise exception 'Escribe el motivo'; end if;
  update app.planning_cutoffs set resolved_status = p_status, resolved_by = v_uid, resolved_at = now(), review_note = btrim(p_note)
   where id = p_cutoff_id and organization_id = p_organization_id and status in ('revision','no_cumplido');
  if not found then raise exception 'Cutoff not found'; end if;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, 'PlanningCutoffResolved', 'planning_cutoff', p_cutoff_id, jsonb_build_object('status', p_status, 'note', p_note), v_uid);
end $$;

-- ===== Avisos =====
create or replace function private.formation_notify(p_organization_id uuid, p_kind text, p_week date, p_user uuid, p_title text, p_body text, p_url text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into app.formation_notices(organization_id, kind, week_start, user_id) values (p_organization_id, p_kind, p_week, p_user)
  on conflict do nothing;
  if not found then return; end if;
  insert into app.announcements(organization_id, title, body, source, audience_type, audience_value, expires_at)
  values (p_organization_id, p_title, p_body, 'formacion', 'user', p_user::text, now() + interval '7 days');
  perform private.notify_push(p_organization_id, p_title, p_body, 'user', p_user::text, p_url);
end $$;

-- Quién es Dirección Deportiva: quien tiene el módulo por persona; si nadie,
-- Presidencia.
create or replace function private.formation_directors(p_organization_id uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  with por_persona as (
    select m.user_id from private.membership_module_overrides o
    join public.organization_memberships m on m.id = o.membership_id and m.active
    where o.organization_id = p_organization_id and o.module_code = 'formacion_direccion' and o.can_write)
  select user_id from por_persona
  union
  select m.user_id from public.organization_memberships m
  where m.organization_id = p_organization_id and m.active and m.role = 'Presidencia' and not exists (select 1 from por_persona)
$$;

-- Corre cada 15 minutos: avisos antes y al vencer, sesiones al día y cortes.
create or replace function private.run_formation_cycle()
returns void language plpgsql security definer set search_path = '' as $$
declare
  o record; s jsonb; v_now timestamptz := now(); v_next date; v_pub timestamptz; v_cut timestamptz;
  v_horas int; v_faltan text; v_hoy date; u uuid; r record;
begin
  for o in select org.id from public.organizations org where coalesce(org.settings->'formacion'->>'inicio', '') <> '' loop
    begin
      s := private.formation_settings(o.id);
      v_hoy := (v_now at time zone (s->>'tz'))::date;
      v_horas := coalesce((s->>'avisoHorasAntes')::int, 4);
      -- La semana que se está planeando: el próximo lunes.
      v_next := v_hoy + (8 - extract(isodow from v_hoy)::int);
      perform private.sync_sessions_from_schedule(o.id, v_hoy, v_hoy + 14);

      if v_next >= (s->>'inicio')::date then
        -- Dirección: Semana sin publicar.
        v_pub := private.formation_deadline(o.id, v_next, 'publicacion');
        select string_agg(c.name, ', ' order by c.sort_order) into v_faltan
        from app.categories c
        where c.organization_id = o.id and c.status = 'active'
          and private.category_schedule_at(o.id, c.id, v_next) is not null
          and not exists (select 1 from app.training_weeks w where w.category_id = c.id and w.week_start = v_next and w.status = 'published');
        if v_faltan is not null then
          for u in select * from private.formation_directors(o.id) loop
            if v_now >= v_pub - make_interval(hours => v_horas) and v_now < v_pub then
              perform private.formation_notify(o.id, 'publicar_pronto', v_next, u, 'Semana Tanner por publicar',
                'Falta publicar: ' || v_faltan || '. Límite: viernes ' || to_char(v_pub at time zone (s->>'tz'), 'HH24:MI') || '.', '/formacion/');
            elsif v_now >= v_pub then
              perform private.formation_notify(o.id, 'publicar_vencido', v_next, u, 'No has publicado la Semana Tanner',
                'Siguen sin publicar: ' || v_faltan || '. Los Formadores planean con su propio objetivo.', '/formacion/');
            end if;
          end loop;
        end if;

        -- Formadores: sesiones pendientes antes del corte.
        v_cut := private.formation_deadline(o.id, v_next, 'corte');
        if v_now >= v_cut - make_interval(hours => v_horas) and v_now < v_cut then
          for r in select ss.responsible_user_id uid, count(*) pendientes
                   from app.sessions ss left join app.session_plans sp on sp.session_id = ss.id
                   where ss.organization_id = o.id and ss.origin in ('horario','sesion_extra') and ss.status = 'scheduled'
                     and ss.planned_date between v_next and v_next + 6 and ss.responsible_user_id is not null
                     and coalesce(sp.status, 'draft') <> 'ready'
                   group by 1 loop
            perform private.formation_notify(o.id, 'planear_pronto', v_next, r.uid, 'Próxima semana sin terminar',
              r.pendientes || case when r.pendientes = 1 then ' sesión pendiente' else ' sesiones pendientes' end
              || '. El corte es hoy a las ' || to_char(v_cut at time zone (s->>'tz'), 'HH24:MI') || '.', '/formacion/');
          end loop;
        end if;
      end if;

      -- Cortes vencidos que aún no tienen foto (incluye el de esta semana si ya pasó).
      for r in select w::date wk from generate_series(v_next - 14, v_next, interval '7 days') w loop
        if v_now >= private.formation_deadline(o.id, r.wk, 'corte')
           and not exists (select 1 from app.planning_cutoffs c where c.organization_id = o.id and c.week_start = r.wk) then
          perform private.take_planning_cutoff(o.id, r.wk);
        end if;
      end loop;
    exception when others then
      raise warning 'run_formation_cycle %: %', o.id, sqlerrm;
    end;
  end loop;
end $$;

-- ===== Lecturas para las pantallas =====
-- Formador: "PRÓXIMA SEMANA · 3 sesiones · 2 listas · 1 pendiente".
create or replace function private.query_my_planning(p_organization_id uuid, p_week_start date default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid()); s jsonb := private.formation_settings(p_organization_id);
  v_hoy date := (now() at time zone (private.formation_settings(p_organization_id)->>'tz'))::date;
  v_week date; v_dir boolean;
begin
  if not (private.has_module_access(p_organization_id, 'formacion', false)
       or private.has_module_access(p_organization_id, 'formacion_direccion', false)) then raise exception 'Not authorized'; end if;
  v_dir := private.has_module_access(p_organization_id, 'formacion_direccion', false);
  v_week := coalesce(p_week_start, v_hoy + (8 - extract(isodow from v_hoy)::int));
  return jsonb_build_object(
    'weekStart', v_week, 'deadline', private.formation_deadline(p_organization_id, v_week, 'corte'),
    'settings', s,
    'sessions', coalesce((select jsonb_agg(jsonb_build_object(
        'sessionId', ss.id, 'categoryId', ss.category_id, 'category', c.name, 'stage', c.stage,
        'startsAt', ss.starts_at, 'endsAt', ss.ends_at, 'status', ss.status, 'origin', ss.origin,
        'responsibleId', ss.responsible_user_id,
        'plan', case when sp.id is null then null else jsonb_build_object('status', sp.status, 'challenge', sp.challenge,
                 'objective', sp.objective, 'readyAt', sp.ready_at,
                 'items', coalesce((select jsonb_agg(jsonb_build_object('block', i.block, 'taskId', i.task_id, 'text', i.custom_text,
                           'difficulty', i.difficulty, 'space', i.space) order by i.position) from app.session_plan_items i where i.plan_id = sp.id), '[]'::jsonb)) end,
        'week', (select jsonb_build_object('primary', w.primary_challenge, 'secondary', w.secondary_challenge, 'behavior', w.behavior)
                 from app.training_weeks w where w.category_id = ss.category_id and w.week_start = v_week and w.status = 'published'))
        order by ss.starts_at)
      from app.sessions ss join app.categories c on c.id = ss.category_id
      left join app.session_plans sp on sp.session_id = ss.id
      where ss.organization_id = p_organization_id and ss.origin in ('horario','sesion_extra') and ss.status <> 'cancelled'
        and ss.planned_date between v_week and v_week + 6
        and (v_dir or ss.responsible_user_id = v_uid
             or exists (select 1 from app.category_staff_assignments a where a.category_id = ss.category_id and a.user_id = v_uid))), '[]'::jsonb));
end $$;

-- Dirección: semana por categoría (publicada o no) y planeación (lista / pendiente n).
create or replace function private.query_direction_week(p_organization_id uuid, p_week_start date default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_hoy date := (now() at time zone (private.formation_settings(p_organization_id)->>'tz'))::date;
  v_week date;
begin
  if not private.has_module_access(p_organization_id, 'formacion_direccion', false) then raise exception 'Not authorized'; end if;
  v_week := coalesce(p_week_start, v_hoy + (8 - extract(isodow from v_hoy)::int));
  return jsonb_build_object(
    'weekStart', v_week,
    'publishBy', private.formation_deadline(p_organization_id, v_week, 'publicacion'),
    'deadline', private.formation_deadline(p_organization_id, v_week, 'corte'),
    'categories', coalesce((select jsonb_agg(jsonb_build_object(
        'categoryId', c.id, 'category', c.name, 'stage', c.stage,
        'usesChallenges', coalesce((fc.attrs->>'usesChallenges')::boolean, true),
        'coachId', private.category_coach(p_organization_id, c.id),
        'week', (select jsonb_build_object('primary', w.primary_challenge, 'secondary', w.secondary_challenge,
                   'behavior', w.behavior, 'status', w.status, 'publishedAt', w.published_at)
                 from app.training_weeks w where w.category_id = c.id and w.week_start = v_week),
        'sessions', (select count(*) from app.sessions ss where ss.category_id = c.id and ss.origin in ('horario','sesion_extra')
                     and ss.status <> 'cancelled' and ss.planned_date between v_week and v_week + 6),
        'ready', (select count(*) from app.sessions ss join app.session_plans sp on sp.session_id = ss.id
                  where ss.category_id = c.id and ss.origin in ('horario','sesion_extra') and ss.status <> 'cancelled'
                    and ss.planned_date between v_week and v_week + 6 and sp.status = 'ready'))
        order by c.sort_order)
      from app.categories c
      left join app.formation_concepts fc on fc.organization_id = c.organization_id and fc.kind = 'etapa' and fc.code = c.stage
      where c.organization_id = p_organization_id and c.status = 'active'
        and private.category_schedule_at(p_organization_id, c.id, v_week) is not null), '[]'::jsonb));
end $$;

-- Cumplimiento del mes por Formador (componente de planeación del Bono TannerOS).
-- Una semana pertenece al mes de su lunes. La revisión cuenta según lo que
-- resolvió Dirección; sin resolver, no cuenta ni a favor ni en contra.
create or replace function private.query_planning_compliance(p_organization_id uuid, p_month date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_module_access(p_organization_id, 'formacion_direccion', false) then raise exception 'Not authorized'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('userId', x.uid, 'weeks', x.semanas, 'met', x.cumplidas,
      'pendingReview', x.revision, 'pct', round(100.0 * x.cumplidas / nullif(x.semanas - x.revision, 0), 1)))
    from (select c.responsible_user_id uid, count(*) semanas,
                 count(*) filter (where coalesce(c.resolved_status, c.status) = 'cumplido') cumplidas,
                 count(*) filter (where c.status = 'revision' and c.resolved_status is null) revision
          from app.planning_cutoffs c
          where c.organization_id = p_organization_id and c.responsible_user_id is not null
            and date_trunc('month', c.week_start) = date_trunc('month', p_month)
          group by 1) x), '[]'::jsonb);
end $$;

-- Presidencia cambia la configuración (corte, publicación, aviso, arranque).
create or replace function private.command_update_formation_settings(p_organization_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_new jsonb;
begin
  if not (private.has_module_access(p_organization_id, 'formacion_direccion', true)
          and private.has_module_access(p_organization_id, 'direccion', true)) then raise exception 'Not authorized'; end if;
  v_new := coalesce((select settings->'formacion' from public.organizations where id = p_organization_id), '{}'::jsonb)
           || (p - 'tz');
  if (v_new->'corte'->>'dia')::int not between 1 and 7 or (v_new->'publicacion'->>'dia')::int not between 1 and 7 then
    raise exception 'Día inválido';
  end if;
  perform (v_new->'corte'->>'hora')::time, (v_new->'publicacion'->>'hora')::time;
  update public.organizations set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{formacion}', v_new), updated_at = now()
   where id = p_organization_id;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, 'FormationSettingsChanged', 'organization', p_organization_id, v_new, v_uid);
  return private.formation_settings(p_organization_id);
end $$;

revoke all on function private.formation_settings(uuid), private.formation_deadline(uuid, date, text),
  private.category_coach(uuid, uuid), private.can_plan_session(uuid, uuid),
  private.sync_sessions_from_schedule(uuid, date, date), private.cutoff_review_on_cancel(), private.sync_after_schedule_change(),
  private.command_save_training_weeks(uuid, jsonb, boolean), private.command_save_session_plan(uuid, uuid, jsonb),
  private.take_planning_cutoff(uuid, date), private.command_resolve_planning_cutoff(uuid, uuid, text, text),
  private.formation_notify(uuid, text, date, uuid, text, text, text), private.formation_directors(uuid),
  private.run_formation_cycle(), private.query_my_planning(uuid, date), private.query_direction_week(uuid, date),
  private.query_planning_compliance(uuid, date), private.command_update_formation_settings(uuid, jsonb)
  from public, anon, authenticated;

create or replace function public.v2_save_training_weeks(organization_id uuid, weeks jsonb, publish boolean default false)
returns int language sql security definer set search_path = ''
as $$ select private.command_save_training_weeks(organization_id, weeks, publish) $$;
create or replace function public.v2_save_session_plan(organization_id uuid, session_id uuid, plan jsonb)
returns jsonb language sql security definer set search_path = ''
as $$ select private.command_save_session_plan(organization_id, session_id, plan) $$;
create or replace function public.v2_resolve_planning_cutoff(organization_id uuid, cutoff_id uuid, status text, note text)
returns void language sql security definer set search_path = ''
as $$ select private.command_resolve_planning_cutoff(organization_id, cutoff_id, status, note) $$;
create or replace function public.v2_my_planning(organization_id uuid, week_start date default null)
returns jsonb language sql stable security definer set search_path = ''
as $$ select private.query_my_planning(organization_id, week_start) $$;
create or replace function public.v2_direction_week(organization_id uuid, week_start date default null)
returns jsonb language sql stable security definer set search_path = ''
as $$ select private.query_direction_week(organization_id, week_start) $$;
create or replace function public.v2_planning_compliance(organization_id uuid, month date)
returns jsonb language sql stable security definer set search_path = ''
as $$ select private.query_planning_compliance(organization_id, month) $$;
create or replace function public.v2_update_formation_settings(organization_id uuid, settings jsonb)
returns jsonb language sql security definer set search_path = ''
as $$ select private.command_update_formation_settings(organization_id, settings) $$;
revoke all on function public.v2_save_training_weeks(uuid, jsonb, boolean), public.v2_save_session_plan(uuid, uuid, jsonb),
  public.v2_resolve_planning_cutoff(uuid, uuid, text, text), public.v2_my_planning(uuid, date), public.v2_direction_week(uuid, date),
  public.v2_planning_compliance(uuid, date), public.v2_update_formation_settings(uuid, jsonb) from public, anon;
grant execute on function public.v2_save_training_weeks(uuid, jsonb, boolean), public.v2_save_session_plan(uuid, uuid, jsonb),
  public.v2_resolve_planning_cutoff(uuid, uuid, text, text), public.v2_my_planning(uuid, date), public.v2_direction_week(uuid, date),
  public.v2_planning_compliance(uuid, date), public.v2_update_formation_settings(uuid, jsonb) to authenticated;

-- Tannery City FC: ensayo la semana del 30/11/2026, cuenta desde el 7/12/2026.
-- Corte domingo 22:00; Dirección publica a más tardar el viernes 22:00.
update public.organizations
set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{formacion}',
  '{"inicio":"2026-11-30","inicioCuenta":"2026-12-07","corte":{"dia":7,"hora":"22:00"},"publicacion":{"dia":5,"hora":"22:00"},"avisoHorasAntes":4,"umbralCumplido":1}'::jsonb)
where slug = 'tannery-city-fc';

select cron.schedule('tanneros-formacion-ciclo', '*/15 * * * *', 'select private.run_formation_cycle();');
