-- El corte de migración impedía que un pago se aplicara a cargos de julio/agosto.
-- Consecuencia real: el cobrador cobraba, el sistema aceptaba el dinero y el
-- Tanner seguía apareciendo como deudor porque su cargo abierto era anterior al
-- corte. El corte sigue existiendo para REPORTAR (separar arrastre del mes en
-- curso), pero deja de gobernar a qué cargo se aplica un pago.
create or replace function app.allocate_payment_oldest_first(p_payment_id uuid)
returns numeric language plpgsql security definer
set search_path to 'app','public'
as $function$
declare v_payment app.payments%rowtype; r record; v_available numeric; v_piece numeric; v_total numeric:=0;
begin
  select * into v_payment from app.payments where id=p_payment_id for update;
  if not found or v_payment.status<>'posted' then raise exception 'Payment not available'; end if;
  if v_payment.payment_purpose<>'billing' then raise exception 'Payment is not a billing payment'; end if;
  if v_payment.credit_status='legacy_hold' then raise exception 'Legacy held credit requires explicit reconciliation'; end if;
  for r in
    select cb.* from app.charge_balances cb
    where cb.organization_id=v_payment.organization_id
      and cb.player_id=v_payment.player_id
      and cb.computed_status in ('pending','partial')
      and cb.balance_due>0
      and ((v_payment.payer_type='sponsor' and cb.payer_type='sponsor'
            and (cb.payer_name is null or v_payment.payer_name is null
                 or lower(trim(cb.payer_name))=lower(trim(v_payment.payer_name))))
        or (coalesce(v_payment.payer_type,'guardian')<>'sponsor'
            and coalesce(cb.payer_type,'guardian')<>'sponsor'))
    order by cb.billing_period nulls last, cb.due_date, cb.created_at, cb.id
  loop
    select available_credit into v_available from app.payment_balances where id=v_payment.id;
    exit when coalesce(v_available,0)<=0;
    v_piece:=least(v_available,r.balance_due);
    insert into app.payment_allocations(organization_id,payment_id,charge_id,amount)
    values(v_payment.organization_id,v_payment.id,r.id,v_piece)
    on conflict(payment_id,charge_id) do update set amount=app.payment_allocations.amount+excluded.amount;
    v_total:=v_total+v_piece;
  end loop;
  return v_total;
end $function$;

-- Un pago que no se puede asignar (p. ej. crédito retenido) no debe tumbar la
-- pasada completa: se salta y se sigue con los demás.
create or replace function app.apply_available_credit(p_organization_id uuid)
returns integer language plpgsql security definer
set search_path to 'pg_catalog','app'
as $function$
declare v_payment_id uuid; v_applied integer := 0;
begin
  for v_payment_id in
    select pb.id
    from app.payment_balances pb
    where pb.organization_id = p_organization_id
      and pb.available_credit > 0
      and exists (
        select 1 from app.charge_balances cb
        where cb.player_id = pb.player_id
          and cb.organization_id = pb.organization_id
          and cb.computed_status in ('pending','partial')
          and cb.balance_due > 0)
    order by pb.payment_date, pb.id
  loop
    begin
      perform app.allocate_payment_oldest_first(v_payment_id);
      v_applied := v_applied + 1;
    exception when others then
      continue;
    end;
  end loop;
  return v_applied;
end $function$;

-- Conciliación explícita del crédito migrado: libera el legacy_hold dejando
-- constancia en allocation_note y lo aplica al cargo más viejo. Es una acción
-- deliberada, no algo que ocurra solo.
create or replace function app.reconcile_legacy_credit(p_organization_id uuid, p_player_id uuid default null)
returns table(payments_released integer, amount_applied numeric)
language plpgsql security definer
set search_path to 'pg_catalog','app'
as $function$
declare r record; v_released integer := 0; v_applied numeric := 0; v_piece numeric;
begin
  for r in
    select pb.id, pb.available_credit
    from app.payment_balances pb
    join app.payments pm on pm.id = pb.id
    where pb.organization_id = p_organization_id
      and (p_player_id is null or pb.player_id = p_player_id)
      and pb.available_credit > 0
      and pm.credit_status = 'legacy_hold'
      and exists (
        select 1 from app.charge_balances cb
        where cb.player_id = pb.player_id
          and cb.organization_id = pb.organization_id
          and cb.computed_status in ('pending','partial')
          and cb.balance_due > 0)
    order by pb.payment_date, pb.id
  loop
    update app.payments
       set credit_status='available',
           allocation_note=concat_ws(' · ', nullif(allocation_note,''),
             'Crédito migrado liberado por conciliación '||to_char(now(),'YYYY-MM-DD'))
     where id=r.id;
    begin
      v_piece := app.allocate_payment_oldest_first(r.id);
      v_released := v_released + 1;
      v_applied := v_applied + coalesce(v_piece,0);
    exception when others then
      continue;
    end;
  end loop;
  return query select v_released, v_applied;
end $function$;

comment on function app.billing_cutover() is
  'Frontera de la migración de saldos. Se usa para REPORTAR (separar el arrastre de meses anteriores del mes en curso). No gobierna la asignación de pagos: un pago se aplica al cargo abierto más viejo del Tanner sin importar el mes.';

revoke all on function app.reconcile_legacy_credit(uuid,uuid) from public, anon;;
