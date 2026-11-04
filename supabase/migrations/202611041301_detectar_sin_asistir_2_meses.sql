-- Auditoría de Centro Tanner (04/11/2026): TC-001 dice "con 2 meses
-- consecutivos sin asistir y sin acuerdo autorizado, podrá considerarse dado
-- de baja" — pero nada lo detectaba solo. Solo se enteraba Administración si
-- un profe lo reportaba a mano al tomar lista (v2_request_player_withdrawal).
--
-- Ahora /v2/jugadores/ también calcula, cada vez que se abre la plantilla,
-- quién lleva 60+ días sin una asistencia 'present'/'late' en su categoría
-- actual (o 60+ días inscrito sin ninguna) y nadie lo ha reportado todavía.
-- Un clic lo manda a la misma cola de siempre para que Administración decida
-- — nunca se da de baja solo.

create or replace function private.query_stale_active_players(p_organization_id uuid, p_days integer default 60)
returns jsonb
language plpgsql stable security definer
set search_path to 'pg_catalog', 'app', 'public', 'private'
as $$
declare v_out jsonb;
begin
  if not private.has_module_access(p_organization_id, 'jugadores_estado', true) then raise exception 'Not authorized'; end if;

  with enrol as (
    select distinct on (pe.player_id) pe.player_id, pe.starts_on, pe.category_id
    from app.player_enrollments pe
    join app.players p on p.id = pe.player_id and p.organization_id = p_organization_id
      and p.status = 'active' and p.archived_at is null
    where pe.organization_id = p_organization_id and pe.status = 'active'
    order by pe.player_id, pe.starts_on desc nulls last
  ),
  ultima as (
    select e.player_id, max(s.starts_at) as ultima_asistencia
    from enrol e
    join app.sessions s on s.organization_id = p_organization_id and s.category_id = e.category_id and s.academy_id is null
    join app.attendance_records ar on ar.session_id = s.id and ar.player_id = e.player_id and ar.status in ('present', 'late')
    group by e.player_id
  ),
  reportados as (
    select player_id from app.player_withdrawal_requests where organization_id = p_organization_id and status = 'pending'
  ),
  candidatos as (
    select e.player_id, e.starts_on, u.ultima_asistencia, c.name as categoria,
           pl.first_name, pl.last_name, pl.code
    from enrol e
    left join ultima u on u.player_id = e.player_id
    join app.categories c on c.id = e.category_id
    join app.players pl on pl.id = e.player_id
    where e.starts_on <= (now()::date - p_days)
      and (u.ultima_asistencia is null or u.ultima_asistencia::date <= now()::date - p_days)
      and e.player_id not in (select player_id from reportados)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'playerId', c.player_id, 'name', trim(concat_ws(' ', c.first_name, c.last_name)), 'code', c.code,
    'categoryName', c.categoria, 'lastSeen', c.ultima_asistencia,
    'daysSince', case when c.ultima_asistencia is not null then (now()::date - c.ultima_asistencia::date) else (now()::date - c.starts_on) end
  ) order by c.ultima_asistencia nulls first), '[]'::jsonb)
  into v_out from candidatos c;
  return v_out;
end $$;

create or replace function public.v2_stale_active_players(organization_id uuid, days integer default 60)
returns jsonb language sql set search_path to 'pg_catalog', 'private' as
$$ select private.query_stale_active_players(organization_id, days) $$;
revoke all on function public.v2_stale_active_players(uuid, integer) from public, anon;
grant execute on function public.v2_stale_active_players(uuid, integer) to authenticated;

-- "Reportar como posible baja" desde /v2/jugadores/ reutiliza este comando,
-- que hasta ahora solo lo llamaba la lista de asistencia (permiso 'attendance').
-- Se amplía para aceptar también 'jugadores_estado' (mismo permiso que ya
-- gobierna esta pantalla), sin quitarle nada a quien ya lo usaba.
create or replace function private.command_request_player_withdrawal(p_organization_id uuid, p_player_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'app', 'private'
as $$
declare v_id uuid; v_status text;
begin
  if not (private.has_module_access(p_organization_id, 'attendance', true) or private.has_module_access(p_organization_id, 'jugadores_estado', true)) then
    raise exception 'Not authorized';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'Withdrawal reason required'; end if;
  select status into v_status from app.players where id = p_player_id and organization_id = p_organization_id;
  if not found then raise exception 'Player not found'; end if;
  if v_status <> 'active' then raise exception 'Player is not active'; end if;

  insert into app.player_withdrawal_requests(organization_id, player_id, reason, requested_by_user_id)
  values (p_organization_id, p_player_id, trim(p_reason), (select auth.uid()))
  on conflict(organization_id, player_id) where status = 'pending'
  do update set reason = excluded.reason, requested_by_user_id = excluded.requested_by_user_id,
                requested_at = now(), updated_at = now()
  returning id into v_id;

  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor)
  values (p_organization_id, 'PlayerWithdrawalRequested', 'player', p_player_id,
         jsonb_build_object('requestId', v_id, 'reason', trim(p_reason)), (select auth.uid())::text);
  return v_id;
end $$;
