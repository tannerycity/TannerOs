-- Auditoría de Centro Tanner (04/11/2026): las políticas TC-001/TC-005 dicen
-- "para reingreso: liquidar adeudo + nueva inscripción, salvo acuerdo de
-- Presidencia" — pero reactivar a un Tanner dado de baja no revisaba nada.
-- 12 de 17 bajas tenían adeudo pendiente ($8,250 MXN) y cualquiera podía
-- reactivarse sin liquidar un peso.
--
-- Ahora: si debe algo, solo Presidencia puede reactivar, y tiene que explicar
-- por qué (queda en domain_events, mismo patrón que los demás overrides
-- financieros de la app). Sin adeudo, reactivar sigue igual de simple.

-- Info para el modal de "Dar de alta": adeudo pendiente y si quien mira puede autorizar la excepción.
create or replace function private.query_player_reactivation_info(p_organization_id uuid, p_player_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'pg_catalog', 'app', 'public', 'private'
as $$
declare v_balance numeric; v_out jsonb;
begin
  if not private.has_module_access(p_organization_id, 'jugadores_estado', true) then raise exception 'Not authorized'; end if;
  if not exists(select 1 from app.players where id = p_player_id and organization_id = p_organization_id) then raise exception 'Player not found'; end if;
  select coalesce(sum(cb.balance_due), 0) into v_balance from app.charge_balances cb where cb.player_id = p_player_id;
  select jsonb_build_object('balanceDue', v_balance, 'isPresidency', private.is_presidency(p_organization_id)) into v_out;
  return v_out;
end $$;

create or replace function public.v2_player_reactivation_info(organization_id uuid, player_id uuid)
returns jsonb language sql set search_path to 'pg_catalog', 'private' as
$$ select private.query_player_reactivation_info(organization_id, player_id) $$;
revoke all on function public.v2_player_reactivation_info(uuid, uuid) from public, anon;
grant execute on function public.v2_player_reactivation_info(uuid, uuid) to authenticated;

-- Reemplaza la versión de 3 argumentos por esta de 4 (con candado). Se borra
-- la vieja explícitamente: CREATE OR REPLACE con una firma distinta deja las
-- dos funciones vivas en vez de reemplazar, y la vieja no tenía el candado.
drop function if exists public.v2_reactivate_player(uuid, uuid, date);
drop function if exists private.command_reactivate_player(uuid, uuid, date);

create or replace function private.command_reactivate_player(p_organization_id uuid, p_player_id uuid, p_date date, p_override_reason text default null)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'app', 'private'
as $$
declare v_balance numeric; v_actor uuid := (select auth.uid());
begin
  if not private.has_module_access(p_organization_id, 'jugadores_estado', true) then raise exception 'Not authorized'; end if;
  if not exists(select 1 from app.players where id = p_player_id and organization_id = p_organization_id) then raise exception 'Player not found'; end if;

  select coalesce(sum(cb.balance_due), 0) into v_balance from app.charge_balances cb where cb.player_id = p_player_id;

  if v_balance > 0 then
    if not private.is_presidency(p_organization_id) then
      raise exception 'Debe $% de adeudo. Liquídalo primero o pide que Presidencia autorice la reactivación.', to_char(v_balance, 'FM999,999,990.00');
    end if;
    if coalesce(length(btrim(p_override_reason)), 0) < 10 then
      raise exception 'Debe $% de adeudo: explica brevemente por qué Presidencia autoriza reactivar sin liquidarlo.', to_char(v_balance, 'FM999,999,990.00');
    end if;
  end if;

  perform app.reactivate_player(p_player_id, p_date, v_actor::text);

  if v_balance > 0 then
    insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor, actor_user_id)
    values (p_organization_id, 'PlayerReactivatedWithDebt', 'player', p_player_id,
      jsonb_build_object('balanceDue', v_balance, 'reason', btrim(p_override_reason)), v_actor::text, v_actor);
  end if;
end;
$$;

create or replace function public.v2_reactivate_player(organization_id uuid, player_id uuid, reactivated_at date, override_reason text default null)
returns void language sql set search_path to 'pg_catalog', 'private' as
$$ select private.command_reactivate_player(organization_id, player_id, reactivated_at, override_reason) $$;
revoke all on function public.v2_reactivate_player(uuid, uuid, date, text) from public, anon;
grant execute on function public.v2_reactivate_player(uuid, uuid, date, text) to authenticated;
