-- Formación Tanner · Fase 1: Modo Cancha y cierre (Presidencia, 11/10/2026).
--
-- Cierre: "¿Apareció lo que buscábamos?" Sí / A veces / Todavía no, con nota
-- opcional, en un toque. Es del grupo, no por niño. Deja la sesión como
-- realizada. Exposición = sesiones cerradas por Reto (nunca "% dominado").
--
-- Además: "lista" exige la tarea principal. Calentar, llegada y juego vienen
-- puestos en la pantalla; solos no cuentan como planeación.

alter table app.sessions add column if not exists closure text check (closure in ('si','a_veces','todavia_no'));
alter table app.sessions add column if not exists closure_note text;
alter table app.sessions add column if not exists closed_at timestamptz;
alter table app.sessions add column if not exists closed_by uuid references auth.users(id) on delete set null;

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
  -- Cuenta la tarea principal: calentar, llegada y juego vienen puestos y solos no hacen una sesión.
  select count(*) into v_items from app.session_plan_items where plan_id = v_plan.id
    and (block is null or block not in ('calentar', 'llegada', 'jugar'));

  if v_ready or v_plan.status = 'ready' then
    if v_s.category_id is null or v_s.starts_at is null or v_s.ends_at is null then raise exception 'La sesión no tiene categoría, fecha u hora'; end if;
    if v_challenge is null and v_objective is null then raise exception 'Falta el Reto u objetivo'; end if;
    if v_items = 0 then raise exception 'Falta la tarea principal'; end if;
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

-- Cerrar la sesión: quien puede planearla (su Formador o Dirección).
create or replace function private.command_close_session(p_organization_id uuid, p_session_id uuid, p_closure text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_s app.sessions%rowtype;
begin
  if not private.can_plan_session(p_organization_id, p_session_id) then raise exception 'Not authorized'; end if;
  if p_closure not in ('si','a_veces','todavia_no') then raise exception 'Respuesta inválida'; end if;
  select * into v_s from app.sessions where id = p_session_id and organization_id = p_organization_id for update;
  if v_s.id is null then raise exception 'Session not found'; end if;
  if v_s.status = 'cancelled' then raise exception 'La sesión está cancelada'; end if;
  update app.sessions set closure = p_closure, closure_note = nullif(btrim(p_note), ''), closed_at = now(), closed_by = v_uid,
         status = 'completed', updated_at = now()
   where id = p_session_id;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, 'SessionClosed', 'session', p_session_id,
          jsonb_build_object('closure', p_closure, 'note', nullif(btrim(p_note), ''), 'challenge',
            (select challenge from app.session_plans where session_id = p_session_id)), v_uid);
  return jsonb_build_object('sessionId', p_session_id, 'closure', p_closure);
end $$;

-- HOY: las sesiones de hoy del usuario, con su plan y la Semana.
create or replace function private.query_my_today(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid()); v_tz text := private.formation_settings(p_organization_id)->>'tz';
  v_hoy date := (now() at time zone (private.formation_settings(p_organization_id)->>'tz'))::date;
  v_lunes date; v_dir boolean;
begin
  if not (private.has_module_access(p_organization_id, 'formacion', false)
       or private.has_module_access(p_organization_id, 'formacion_direccion', false)) then raise exception 'Not authorized'; end if;
  v_dir := private.has_module_access(p_organization_id, 'formacion_direccion', false);
  v_lunes := v_hoy - (extract(isodow from v_hoy)::int - 1);
  return jsonb_build_object('today', v_hoy, 'sessions', coalesce((select jsonb_agg(jsonb_build_object(
      'sessionId', ss.id, 'categoryId', ss.category_id, 'category', c.name, 'stage', c.stage,
      'startsAt', ss.starts_at, 'endsAt', ss.ends_at, 'status', ss.status,
      'closure', ss.closure, 'closureNote', ss.closure_note,
      'plan', case when sp.id is null then null else jsonb_build_object('status', sp.status, 'challenge', sp.challenge, 'objective', sp.objective,
               'items', coalesce((select jsonb_agg(jsonb_build_object('block', i.block, 'taskId', i.task_id, 'text', i.custom_text,
                         'difficulty', i.difficulty, 'space', i.space) order by i.position) from app.session_plan_items i where i.plan_id = sp.id), '[]'::jsonb)) end,
      'week', (select jsonb_build_object('primary', w.primary_challenge, 'secondary', w.secondary_challenge, 'behavior', w.behavior)
               from app.training_weeks w where w.category_id = ss.category_id and w.week_start = v_lunes and w.status = 'published'))
      order by ss.starts_at)
    from app.sessions ss join app.categories c on c.id = ss.category_id
    left join app.session_plans sp on sp.session_id = ss.id
    where ss.organization_id = p_organization_id and ss.status <> 'cancelled' and ss.session_type = 'training'
      and (ss.starts_at at time zone v_tz)::date = v_hoy
      and (v_dir or ss.responsible_user_id = v_uid
           or exists (select 1 from app.category_staff_assignments a where a.category_id = ss.category_id and a.user_id = v_uid))), '[]'::jsonb));
end $$;

revoke all on function private.command_close_session(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function private.query_my_today(uuid) from public, anon, authenticated;

create or replace function public.v2_close_session(organization_id uuid, session_id uuid, closure text, note text default null)
returns jsonb language sql security definer set search_path = ''
as $$ select private.command_close_session(organization_id, session_id, closure, note) $$;
create or replace function public.v2_my_today(organization_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$ select private.query_my_today(organization_id) $$;
revoke all on function public.v2_close_session(uuid, uuid, text, text) from public, anon;
revoke all on function public.v2_my_today(uuid) from public, anon;
grant execute on function public.v2_close_session(uuid, uuid, text, text) to authenticated;
grant execute on function public.v2_my_today(uuid) to authenticated;
