-- Formación Tanner: corrige la generación de sesiones. El alias "e" de la
-- subconsulta chocaba con la variable de ciclo "e" y PL/pgSQL lo rechazaba
-- como ambiguo al cancelar las sesiones que una excepción quitó.
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
    and not exists (select 1 from private.expected_sessions(p_organization_id, s.planned_date, s.planned_date, s.category_id) es
                    where (s.origin = 'horario' and es.slot_id = s.schedule_slot_id)
                       or (s.origin = 'sesion_extra' and es.exception_id = s.schedule_exception_id));
  return v_n;
end $$;
