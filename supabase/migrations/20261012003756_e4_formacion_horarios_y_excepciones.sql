-- Formación Tanner · Fase 0 · 3/7: horarios con vigencia y excepciones.
--
-- CATEGORÍA = permanente. HORARIO = versión con fechas: cambiar el horario en
-- 2027 publica una versión nueva que empieza ese día y cierra la anterior.
-- Nada se sobrescribe: "¿qué horario tenía T6 el 3 de marzo?" se responde con
-- private.category_schedule_at().
-- EXCEPCIÓN = lo que cambió en UNA fecha (lluvia, cambio de cancha, partido,
-- evento, sesión extra). No crea versión nueva del horario.
-- Sesiones esperadas = slots de la versión vigente cada día, menos
-- cancelaciones, con los cambios aplicados, más las sesiones extra.
--
-- Estados guardados: draft, published, archived. "Programado" (empieza en el
-- futuro) y "vigente" (hoy) se calculan con las fechas, nunca se guardan.

create table app.category_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid not null references app.categories(id) on delete cascade,
  valid_from date not null,
  valid_until date,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_until is null or valid_until >= valid_from)
);
create index category_schedules_vigencia on app.category_schedules(organization_id, category_id, valid_from) where status = 'published';

create table app.category_schedule_slots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  schedule_id uuid not null references app.category_schedules(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),  -- ISO: 1 = lunes
  start_time time not null,
  end_time time not null,
  venue_id uuid references app.venues(id) on delete set null,
  created_at timestamptz not null default now(),
  check (end_time > start_time),
  unique (schedule_id, weekday, start_time)
);

create table app.schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid references app.categories(id) on delete cascade,     -- vacío = todo el club
  date date not null,
  kind text not null check (kind in ('cancelacion','cambio_hora','cambio_cancha','amistoso','partido','evento_especial','sesion_extra')),
  slot_id uuid references app.category_schedule_slots(id) on delete set null,  -- vacío = todas las sesiones de ese día
  replaces_session boolean not null default false,  -- partido/amistoso/evento que ocupa el lugar del entrenamiento
  new_start time,
  new_end time,
  new_venue_id uuid references app.venues(id) on delete set null,
  match_id uuid references app.matches(id) on delete set null,
  club_event_id uuid references app.club_events(id) on delete set null,
  reason text,
  authorized_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users(id) on delete set null,
  void_reason text,
  check (kind <> 'cambio_hora' or (new_start is not null and new_end is not null and new_end > new_start)),
  check (kind <> 'sesion_extra' or (category_id is not null and new_start is not null and new_end is not null and new_end > new_start)),
  check (kind <> 'cambio_cancha' or new_venue_id is not null),
  check (kind <> 'cancelacion' or not replaces_session)
);
create index schedule_exceptions_por_fecha on app.schedule_exceptions(organization_id, date) where voided_at is null;

alter table app.category_schedules enable row level security;
alter table app.category_schedule_slots enable row level security;
alter table app.schedule_exceptions enable row level security;
revoke all on app.category_schedules, app.category_schedule_slots, app.schedule_exceptions from public, anon, authenticated;

-- Una versión publicada no se edita: sólo se cierra (valid_until) o se archiva.
-- Y dos versiones publicadas de la misma categoría no se traslapan.
create or replace function private.guard_category_schedule()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.status = 'published' then
    if new.category_id <> old.category_id or new.valid_from <> old.valid_from or new.organization_id <> old.organization_id then
      raise exception 'Un horario publicado no se edita: publica una versión nueva';
    end if;
    if new.status = 'draft' then raise exception 'Un horario publicado no vuelve a borrador'; end if;
  end if;
  if tg_op = 'UPDATE' and old.status = 'archived' and new.status <> 'archived' then
    raise exception 'Un horario archivado no se reactiva';
  end if;
  if new.status = 'published' and exists (
    select 1 from app.category_schedules s
    where s.organization_id = new.organization_id and s.category_id = new.category_id
      and s.status = 'published' and s.id <> new.id
      and daterange(s.valid_from, s.valid_until, '[]') && daterange(new.valid_from, new.valid_until, '[]')) then
    raise exception 'Ese horario se traslapa con otro publicado de la misma categoría';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger category_schedules_guard before insert or update on app.category_schedules
for each row execute function private.guard_category_schedule();

create or replace function private.guard_schedule_slot()
returns trigger language plpgsql set search_path = '' as $$
declare v_status text;
begin
  select status into v_status from app.category_schedules where id = coalesce(new.schedule_id, old.schedule_id);
  if v_status in ('published','archived') and not coalesce(current_setting('tanneros.publicando_horario', true), '') = 'si' then
    raise exception 'Los días de un horario publicado no se editan: publica una versión nueva';
  end if;
  return coalesce(new, old);
end $$;
create trigger category_schedule_slots_guard before insert or update or delete on app.category_schedule_slots
for each row execute function private.guard_schedule_slot();

-- El horario vigente de una categoría en una fecha (pasada, presente o futura).
create or replace function private.category_schedule_at(p_organization_id uuid, p_category_id uuid, p_date date)
returns uuid language sql stable security definer set search_path = '' as $$
  select s.id from app.category_schedules s
  where s.organization_id = p_organization_id and s.category_id = p_category_id and s.status = 'published'
    and s.valid_from <= p_date and (s.valid_until is null or s.valid_until >= p_date)
  order by s.valid_from desc limit 1
$$;

-- Las sesiones que deberían existir entre dos fechas: horario vigente de cada
-- día + excepciones. Es la base de la planeación y del corte.
create or replace function private.expected_sessions(p_organization_id uuid, p_from date, p_to date, p_category_id uuid default null)
returns table (category_id uuid, session_date date, starts_at timestamptz, ends_at timestamptz,
               slot_id uuid, exception_id uuid, origin text, venue_id uuid)
language sql stable security definer set search_path = '' as $$
  with org as (
    select coalesce(nullif(o.timezone, ''), 'America/Mexico_City') tz from public.organizations o where o.id = p_organization_id
  ), dias as (
    select d::date as dia from generate_series(p_from, p_to, interval '1 day') d
  ), base as (
    select s.category_id, dias.dia, sl.id slot_id, sl.start_time, sl.end_time, sl.venue_id
    from dias
    join app.category_schedules s
      on s.organization_id = p_organization_id and s.status = 'published'
     and s.valid_from <= dias.dia and (s.valid_until is null or s.valid_until >= dias.dia)
     and (p_category_id is null or s.category_id = p_category_id)
    join app.category_schedule_slots sl on sl.schedule_id = s.id and sl.weekday = extract(isodow from dias.dia)
  ), exc as (
    select e.* from app.schedule_exceptions e
    where e.organization_id = p_organization_id and e.voided_at is null and e.date between p_from and p_to
  ), ajustadas as (
    select b.category_id, b.dia, b.slot_id,
      coalesce(h.new_start, b.start_time) start_time, coalesce(h.new_end, b.end_time) end_time,
      coalesce(c.new_venue_id, b.venue_id) venue_id,
      coalesce(h.id, c.id) exception_id
    from base b
    left join lateral (select x.* from exc x where x.kind = 'cambio_hora' and x.date = b.dia
        and (x.category_id is null or x.category_id = b.category_id) and (x.slot_id is null or x.slot_id = b.slot_id)
        order by x.created_at desc limit 1) h on true
    left join lateral (select x.* from exc x where x.kind = 'cambio_cancha' and x.date = b.dia
        and (x.category_id is null or x.category_id = b.category_id) and (x.slot_id is null or x.slot_id = b.slot_id)
        order by x.created_at desc limit 1) c on true
    where not exists (select 1 from exc x where x.date = b.dia
        and (x.kind = 'cancelacion' or x.replaces_session)
        and (x.category_id is null or x.category_id = b.category_id) and (x.slot_id is null or x.slot_id = b.slot_id))
  )
  select a.category_id, a.dia, (a.dia + a.start_time) at time zone org.tz, (a.dia + a.end_time) at time zone org.tz,
         a.slot_id, a.exception_id, case when a.exception_id is null then 'horario' else 'horario_con_cambio' end, a.venue_id
  from ajustadas a, org
  union all
  select x.category_id, x.date, (x.date + x.new_start) at time zone org.tz, (x.date + x.new_end) at time zone org.tz,
         null, x.id, 'sesion_extra', x.new_venue_id
  from exc x, org
  where x.kind = 'sesion_extra' and (p_category_id is null or x.category_id = p_category_id)
  order by 3, 1
$$;
revoke all on function private.category_schedule_at(uuid, uuid, date), private.expected_sessions(uuid, date, date, uuid) from public, anon, authenticated;

-- Publicar un horario: la versión nueva empieza en p_valid_from y la vigente
-- se cierra el día anterior. Una versión programada a futuro que quede
-- reemplazada se archiva. Sólo Dirección Deportiva / Presidencia.
create or replace function private.command_publish_category_schedule(
  p_organization_id uuid, p_category_id uuid, p_valid_from date, p_slots jsonb, p_notes text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_slot jsonb; v_uid uuid := (select auth.uid());
begin
  if not private.has_module_access(p_organization_id, 'formacion_direccion', true) then raise exception 'Not authorized'; end if;
  if not exists (select 1 from app.categories c where c.id = p_category_id and c.organization_id = p_organization_id and c.status = 'active') then
    raise exception 'Category not found';
  end if;
  if p_valid_from is null then raise exception 'Falta la fecha de inicio'; end if;
  if jsonb_typeof(p_slots) <> 'array' or jsonb_array_length(p_slots) = 0 then raise exception 'El horario necesita al menos un día'; end if;

  -- Versiones que empezarían después: quedan reemplazadas.
  update app.category_schedules set status = 'archived'
   where organization_id = p_organization_id and category_id = p_category_id and status = 'published' and valid_from >= p_valid_from;
  -- La vigente se cierra el día anterior.
  update app.category_schedules set valid_until = p_valid_from - 1
   where organization_id = p_organization_id and category_id = p_category_id and status = 'published'
     and valid_from < p_valid_from and (valid_until is null or valid_until >= p_valid_from);

  perform set_config('tanneros.publicando_horario', 'si', true);
  insert into app.category_schedules(organization_id, category_id, valid_from, status, notes, created_by)
  values (p_organization_id, p_category_id, p_valid_from, 'draft', nullif(btrim(p_notes), ''), v_uid)
  returning id into v_id;
  for v_slot in select * from jsonb_array_elements(p_slots) loop
    insert into app.category_schedule_slots(organization_id, schedule_id, weekday, start_time, end_time, venue_id)
    values (p_organization_id, v_id, (v_slot->>'weekday')::smallint, (v_slot->>'start')::time, (v_slot->>'end')::time,
            nullif(v_slot->>'venueId', '')::uuid);
  end loop;
  update app.category_schedules set status = 'published', published_by = v_uid, published_at = now() where id = v_id;
  perform set_config('tanneros.publicando_horario', '', true);

  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, 'CategorySchedulePublished', 'category_schedule', v_id,
          jsonb_build_object('categoryId', p_category_id, 'validFrom', p_valid_from, 'slots', p_slots), v_uid);
  return v_id;
end $$;

-- Registrar o anular una excepción: Dirección Deportiva, o quien opera el
-- calendario y la asistencia (Operaciones, Presidencia). Marketing no.
create or replace function private.can_manage_schedule_exceptions(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_module_access(p_organization_id, 'formacion_direccion', true)
      or (private.has_module_access(p_organization_id, 'calendario', true)
          and private.has_module_access(p_organization_id, 'asistencia', true))
$$;

create or replace function private.command_add_schedule_exception(p_organization_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_uid uuid := (select auth.uid()); v_cat uuid := nullif(p->>'categoryId', '')::uuid;
begin
  if not private.can_manage_schedule_exceptions(p_organization_id) then raise exception 'Not authorized'; end if;
  if v_cat is not null and not exists (select 1 from app.categories c where c.id = v_cat and c.organization_id = p_organization_id) then
    raise exception 'Category not found';
  end if;
  if nullif(btrim(p->>'reason'), '') is null then raise exception 'Escribe el motivo'; end if;
  insert into app.schedule_exceptions(organization_id, category_id, date, kind, slot_id, replaces_session,
      new_start, new_end, new_venue_id, match_id, club_event_id, reason, authorized_by, created_by)
  values (p_organization_id, v_cat, (p->>'date')::date, p->>'kind', nullif(p->>'slotId', '')::uuid,
      coalesce((p->>'replacesSession')::boolean, false), nullif(p->>'newStart', '')::time, nullif(p->>'newEnd', '')::time,
      nullif(p->>'newVenueId', '')::uuid, nullif(p->>'matchId', '')::uuid, nullif(p->>'clubEventId', '')::uuid,
      btrim(p->>'reason'), v_uid, v_uid)
  returning id into v_id;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, 'ScheduleExceptionAdded', 'schedule_exception', v_id, p, v_uid);
  return v_id;
end $$;

create or replace function private.command_void_schedule_exception(p_organization_id uuid, p_exception_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if not private.can_manage_schedule_exceptions(p_organization_id) then raise exception 'Not authorized'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'Escribe el motivo'; end if;
  update app.schedule_exceptions set voided_at = now(), voided_by = v_uid, void_reason = btrim(p_reason)
   where id = p_exception_id and organization_id = p_organization_id and voided_at is null;
  if not found then raise exception 'Exception not found'; end if;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, 'ScheduleExceptionVoided', 'schedule_exception', p_exception_id, jsonb_build_object('reason', p_reason), v_uid);
end $$;

-- Lectura: horarios vigentes (y su historia) + sesiones esperadas de un rango.
create or replace function private.query_category_schedules(p_organization_id uuid, p_at date default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_at date := coalesce(p_at, (now() at time zone 'America/Mexico_City')::date);
begin
  if not (private.has_module_access(p_organization_id, 'formacion', false)
       or private.has_module_access(p_organization_id, 'formacion_direccion', false)
       or private.can_manage_schedule_exceptions(p_organization_id)) then
    raise exception 'Not authorized';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'categoryId', c.id, 'category', c.name,
      'scheduleId', s.id, 'validFrom', s.valid_from, 'validUntil', s.valid_until,
      'state', case when s.id is null then 'sin_horario' when s.valid_from > v_at then 'programado' else 'vigente' end,
      'slots', coalesce((select jsonb_agg(jsonb_build_object('id', sl.id, 'weekday', sl.weekday,
                 'start', to_char(sl.start_time, 'HH24:MI'), 'end', to_char(sl.end_time, 'HH24:MI'), 'venueId', sl.venue_id)
                 order by sl.weekday, sl.start_time) from app.category_schedule_slots sl where sl.schedule_id = s.id), '[]'::jsonb),
      'versions', (select count(*) from app.category_schedules h where h.category_id = c.id and h.status in ('published','archived')))
      order by c.sort_order)
    from app.categories c
    left join app.category_schedules s on s.id = private.category_schedule_at(p_organization_id, c.id, v_at)
    where c.organization_id = p_organization_id and c.status = 'active'), '[]'::jsonb);
end $$;

create or replace function private.query_expected_sessions(p_organization_id uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not (private.has_module_access(p_organization_id, 'formacion', false)
       or private.has_module_access(p_organization_id, 'formacion_direccion', false)
       or private.can_manage_schedule_exceptions(p_organization_id)) then
    raise exception 'Not authorized';
  end if;
  if p_to < p_from or p_to - p_from > 62 then raise exception 'Rango inválido (máximo 62 días)'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('categoryId', e.category_id, 'date', e.session_date,
      'startsAt', e.starts_at, 'endsAt', e.ends_at, 'slotId', e.slot_id, 'exceptionId', e.exception_id,
      'origin', e.origin, 'venueId', e.venue_id) order by e.starts_at)
    from private.expected_sessions(p_organization_id, p_from, p_to) e), '[]'::jsonb);
end $$;

revoke all on function private.command_publish_category_schedule(uuid, uuid, date, jsonb, text),
  private.can_manage_schedule_exceptions(uuid), private.command_add_schedule_exception(uuid, jsonb),
  private.command_void_schedule_exception(uuid, uuid, text), private.query_category_schedules(uuid, date),
  private.query_expected_sessions(uuid, date, date) from public, anon, authenticated;

create or replace function public.v2_publish_category_schedule(organization_id uuid, category_id uuid, valid_from date, slots jsonb, notes text default null)
returns uuid language sql security definer set search_path = ''
as $$ select private.command_publish_category_schedule(organization_id, category_id, valid_from, slots, notes) $$;
create or replace function public.v2_add_schedule_exception(organization_id uuid, exception jsonb)
returns uuid language sql security definer set search_path = ''
as $$ select private.command_add_schedule_exception(organization_id, exception) $$;
create or replace function public.v2_void_schedule_exception(organization_id uuid, exception_id uuid, reason text)
returns void language sql security definer set search_path = ''
as $$ select private.command_void_schedule_exception(organization_id, exception_id, reason) $$;
create or replace function public.v2_category_schedules(organization_id uuid, at date default null)
returns jsonb language sql stable security definer set search_path = ''
as $$ select private.query_category_schedules(organization_id, at) $$;
create or replace function public.v2_expected_sessions(organization_id uuid, from_date date, to_date date)
returns jsonb language sql stable security definer set search_path = ''
as $$ select private.query_expected_sessions(organization_id, from_date, to_date) $$;
revoke all on function public.v2_publish_category_schedule(uuid, uuid, date, jsonb, text), public.v2_add_schedule_exception(uuid, jsonb),
  public.v2_void_schedule_exception(uuid, uuid, text), public.v2_category_schedules(uuid, date),
  public.v2_expected_sessions(uuid, date, date) from public, anon;
grant execute on function public.v2_publish_category_schedule(uuid, uuid, date, jsonb, text), public.v2_add_schedule_exception(uuid, jsonb),
  public.v2_void_schedule_exception(uuid, uuid, text), public.v2_category_schedules(uuid, date),
  public.v2_expected_sessions(uuid, date, date) to authenticated;

-- Horario vigente de Tannery City FC (Presidencia, 11/10/2026), desde el
-- 12/10/2026, día de las categorías 2026-27:
--   Baby Tanner y T6: lunes y miércoles 17:00–18:00.
--   T10 y T12: martes y jueves 17:00–18:30; miércoles 17:30–19:00.
do $$
declare v_org uuid; v_owner uuid; r record;
begin
  select id into v_org from public.organizations where slug = 'tannery-city-fc';
  if v_org is null then return; end if;
  select user_id into v_owner from public.organization_memberships where organization_id = v_org and is_owner and active and role = 'Presidencia';
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  for r in select c.id, c.code from app.categories c where c.organization_id = v_org and c.status = 'active' and c.code in ('baby_tanner','t6','t10','t12') loop
    perform private.command_publish_category_schedule(v_org, r.id, date '2026-10-12',
      case when r.code in ('baby_tanner','t6')
        then '[{"weekday":1,"start":"17:00","end":"18:00"},{"weekday":3,"start":"17:00","end":"18:00"}]'::jsonb
        else '[{"weekday":2,"start":"17:00","end":"18:30"},{"weekday":3,"start":"17:30","end":"19:00"},{"weekday":4,"start":"17:00","end":"18:30"}]'::jsonb end,
      'Horario vigente (Presidencia, 11/10/2026)');
  end loop;
  perform set_config('request.jwt.claims', '', true);
end $$;
