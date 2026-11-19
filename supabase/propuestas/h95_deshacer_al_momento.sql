-- h95 · Deshacer al momento (PROPUESTA, sin correr) · 19/11/2026
--
-- Presidencia: "deshacer en lugar de ¿seguro?". Hoy Taquilla pregunta
-- "DOBLE CHECK · ¿Confirmas?" antes de cada cobro, ingreso o pago. La
-- propuesta: registrar de una vez y enseñar "Cobro registrado · Deshacer"
-- durante 2 minutos.
--
-- Por qué hace falta la base: anular hoy pide permiso de correcciones
-- (can_correct) o de contabilidad, y la ventanilla no lo tiene. Esta función
-- deja que QUIEN registró el movimiento lo deshaga, y sólo en los 2 minutos
-- siguientes. Pasado ese tiempo, todo sigue como hoy: se corrige con motivo
-- por quien tiene permiso.
--
-- Reglas:
--   · Sólo cobros de Tanner, ingresos generales y pagos (gastos). Los cobros
--     de pedido y de gafete no entran: tocan el pedido y el gafete.
--   · Sólo quien lo registró (created_by_user_id = auth.uid()).
--   · Sólo dentro de 2 minutos (created_at > now() - 2 min, reloj del servidor).
--   · Sólo si sigue "posted" y nadie lo ha rechazado ni pedido aclarar.
--   · No se borra nada: queda en "void" con motivo "Deshecho al momento por
--     quien lo registró", su evento y su renglón en la bitácora de cambios.
--   · En un cobro de Tanner, primero se libera lo que pagó (las aplicaciones
--     a sus cargos pasan a "reversed"), así su saldo vuelve a como estaba.

begin;

create or replace function private.command_undo_recent(p_organization_id uuid, p_kind text, p_id uuid)
returns void language plpgsql security definer set search_path = 'pg_catalog', 'public', 'app', 'private' as $$
declare
  v_actor uuid := (select auth.uid());
  v_motivo constant text := 'Deshecho al momento por quien lo registró';
  v_pago app.payments%rowtype;
  v_gasto app.expenses%rowtype;
begin
  if v_actor is null or not private.is_active_member(p_organization_id) then raise exception 'Not authorized'; end if;
  if p_kind = 'payment' then
    select * into v_pago from app.payments where id = p_id and organization_id = p_organization_id for update;
    if not found then raise exception 'Movimiento no encontrado'; end if;
    if v_pago.created_by_user_id is distinct from v_actor then raise exception 'Sólo quien lo registró puede deshacerlo'; end if;
    if v_pago.created_at < now() - interval '2 minutes' then raise exception 'Ya pasaron 2 minutos: corrígelo con motivo'; end if;
    if v_pago.status <> 'posted' then raise exception 'Ya no se puede deshacer'; end if;
    -- Los de Presidencia pueden nacer ya "approved"; lo que importa es que nadie lo haya rechazado o pedido aclarar.
    if coalesce(v_pago.reconciliation_status, 'pending') in ('rejected', 'clarification') then raise exception 'Ya se revisó: corrígelo con motivo'; end if;
    if exists (select 1 from app.order_payments op where op.payment_id = p_id) then raise exception 'Los cobros de pedido se corrigen desde el pedido'; end if;
    -- Libera lo que pagó el Tanner: su saldo vuelve a como estaba.
    update app.payment_allocations set status = 'reversed', reversed_at = now(), reversal_reason = v_motivo, reversed_by = v_actor
     where organization_id = p_organization_id and payment_id = p_id and status = 'posted';
    update app.payments set status = 'void', voided_at = now(), void_reason = v_motivo, voided_by_user_id = v_actor, updated_at = now()
     where id = p_id;
    insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
    values (p_organization_id, 'PaymentUndone', 'payment', p_id, jsonb_build_object('amount', v_pago.amount, 'playerId', v_pago.player_id), v_actor);
  elsif p_kind = 'expense' then
    select * into v_gasto from app.expenses where id = p_id and organization_id = p_organization_id for update;
    if not found then raise exception 'Movimiento no encontrado'; end if;
    if v_gasto.created_by_user_id is distinct from v_actor then raise exception 'Sólo quien lo registró puede deshacerlo'; end if;
    if v_gasto.created_at < now() - interval '2 minutes' then raise exception 'Ya pasaron 2 minutos: corrígelo con motivo'; end if;
    if v_gasto.status <> 'posted' then raise exception 'Ya no se puede deshacer'; end if;
    update app.expenses set status = 'void', voided_at = now(), void_reason = v_motivo, voided_by_user_id = v_actor, updated_at = now()
     where id = p_id;
    insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
    values (p_organization_id, 'ExpenseUndone', 'expense', p_id, jsonb_build_object('amount', v_gasto.amount), v_actor);
  else
    raise exception 'Tipo de movimiento no válido';
  end if;
end $$;
revoke all on function private.command_undo_recent(uuid, text, uuid) from public, anon, authenticated;

create or replace function public.v2_undo_recent(organization_id uuid, kind text, movement_id uuid)
returns void language sql security definer set search_path = 'pg_catalog', 'private' as $$
  select private.command_undo_recent(v2_undo_recent.organization_id, v2_undo_recent.kind, v2_undo_recent.movement_id)
$$;
revoke all on function public.v2_undo_recent(uuid, text, uuid) from public, anon;
grant execute on function public.v2_undo_recent(uuid, text, uuid) to authenticated;

commit;
