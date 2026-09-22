-- El saldo a favor retenido era invisible: dinero de familias parado sin que nadie
-- lo viera ni supiera qué hacer con él. Esto lo pone sobre la mesa con su acción.
create or replace function private.query_unresolved_credit(p_organization_id uuid)
returns table(
  payment_id uuid, payment_date date, amount numeric, held_credit numeric,
  method text, concept text, payer_name text,
  player_id uuid, player_name text, player_code text, player_status text,
  player_open_debt numeric, situation text)
language plpgsql stable security definer
set search_path to 'pg_catalog','app','private'
as $function$
begin
  if not private.has_any_module_access(p_organization_id,array['accounting','billing'],false) then
    raise exception 'Not authorized';
  end if;
  return query
  select pb.id, pb.payment_date, pb.amount, pb.held_credit,
         pay.method, pay.concept, pay.payer_name,
         p.id, nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''), p.code, p.status,
         coalesce(d.deuda,0),
         case
           when p.id is null then 'sin_tanner'
           when p.status<>'active' then 'tanner_de_baja'
           when coalesce(d.deuda,0) > 0 then 'aplicable'
           else 'a_favor'
         end
  from app.payment_balances pb
  join app.payments pay on pay.id = pb.id
  left join app.players p on p.id = pay.player_id and p.organization_id = pb.organization_id
  left join lateral (
    select sum(cb.balance_due) as deuda
    from app.charge_balances cb
    where cb.player_id = p.id and cb.organization_id = pb.organization_id and cb.balance_due > 0
  ) d on true
  where pb.organization_id = p_organization_id and pb.held_credit > 0
  order by (p.id is null) desc, pb.amount desc, pb.payment_date;
end $function$;

-- Ponerle dueño a un pago huérfano. Solo si no tiene nada aplicado todavía:
-- mover un pago ya aplicado es cambiar dos cuentas a la vez y eso se reembolsa,
-- no se reasigna (misma regla que ya usa la edición de movimientos en Taquilla).
create or replace function private.command_assign_payment_player(
  p_organization_id uuid, p_payment_id uuid, p_player_id uuid)
returns numeric
language plpgsql security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare v app.payments%rowtype; r record; v_actor uuid:=(select auth.uid());
begin
  if not private.is_presidency(p_organization_id) then
    raise exception 'Solo Presidencia puede asignar el dueño de un pago';
  end if;
  select * into v from app.payments where id=p_payment_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Pago no encontrado'; end if;
  if v.status<>'posted' then raise exception 'Ese pago no está publicado'; end if;
  if exists(select 1 from app.payment_allocations where payment_id=v.id) then
    raise exception 'Ese pago ya está aplicado a cargos. Reembólsalo y vuelve a cobrarlo.';
  end if;
  if not exists(select 1 from app.players where id=p_player_id and organization_id=p_organization_id) then
    raise exception 'Tanner no encontrado';
  end if;

  update app.payments set player_id=p_player_id, updated_at=now(),
    allocation_note=concat_ws(' · ',nullif(allocation_note,''),
      'Dueño asignado por Presidencia el '||to_char(now(),'DD/MM/YYYY'))
  where id=v.id;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values(p_organization_id,'PaymentOwnerAssigned','payment',v.id,
    jsonb_build_object('fromPlayer',v.player_id,'toPlayer',p_player_id,'amount',v.amount),v_actor);

  -- Ya con dueño, su propio dinero cubre su propia deuda por la vía normal.
  select * into r from app.reconcile_legacy_credit(p_organization_id, p_player_id);
  return coalesce(r.amount_applied,0);
end $function$;

-- Soltar el crédito retenido de un Tanner contra sus cargos abiertos.
create or replace function private.command_apply_player_credit(
  p_organization_id uuid, p_player_id uuid)
returns numeric
language plpgsql security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare r record;
begin
  if not private.has_any_module_access(p_organization_id,array['accounting','billing'],true) then
    raise exception 'Not authorized';
  end if;
  if p_player_id is null then raise exception 'Elige un Tanner'; end if;
  select * into r from app.reconcile_legacy_credit(p_organization_id, p_player_id);
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values(p_organization_id,'PlayerCreditApplied','player',p_player_id,
    jsonb_build_object('paymentsReleased',r.payments_released,'amountApplied',r.amount_applied),(select auth.uid()));
  return coalesce(r.amount_applied,0);
end $function$;

create or replace function public.v2_unresolved_credit(organization_id uuid)
returns table(payment_id uuid, payment_date date, amount numeric, held_credit numeric,
  method text, concept text, payer_name text, player_id uuid, player_name text,
  player_code text, player_status text, player_open_debt numeric, situation text)
language sql security definer set search_path to 'pg_catalog','private'
as $function$ select * from private.query_unresolved_credit(organization_id) $function$;

create or replace function public.v2_assign_payment_player(organization_id uuid, payment_id uuid, player_id uuid)
returns numeric language sql security definer set search_path to 'pg_catalog','private'
as $function$ select private.command_assign_payment_player(organization_id,payment_id,player_id) $function$;

create or replace function public.v2_apply_player_credit(organization_id uuid, player_id uuid)
returns numeric language sql security definer set search_path to 'pg_catalog','private'
as $function$ select private.command_apply_player_credit(organization_id,player_id) $function$;

revoke all on function private.query_unresolved_credit(uuid) from public, anon, authenticated;
revoke all on function private.command_assign_payment_player(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function private.command_apply_player_credit(uuid,uuid) from public, anon, authenticated;
revoke all on function public.v2_unresolved_credit(uuid) from public, anon;
revoke all on function public.v2_assign_payment_player(uuid,uuid,uuid) from public, anon;
revoke all on function public.v2_apply_player_credit(uuid,uuid) from public, anon;
grant execute on function public.v2_unresolved_credit(uuid) to authenticated;
grant execute on function public.v2_assign_payment_player(uuid,uuid,uuid) to authenticated;
grant execute on function public.v2_apply_player_credit(uuid,uuid) to authenticated;;
