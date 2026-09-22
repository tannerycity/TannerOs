-- Revertir un pago y volver a aplicarlo dejaba el dinero en el limbo.
--
-- v2_reverse_payment_allocations no borra la fila: la marca status='reversed'.
-- La restriccion unica es (payment_id, charge_id) y NO mira el status, asi que
-- al reasignar, el "on conflict do update set amount = amount + excluded.amount"
-- caia sobre la fila reversada: le sumaba el monto nuevo y la dejaba reversada.
--
-- Resultado medido con el pago de $1,600 de Liam Santos: el motor reportaba
-- "1600.00 aplicados", las filas historicas pasaban de $500 a $1,000, y la suma
-- realmente aplicada quedaba en $0. El saldo de la familia se inflaba solo.
--
-- Ahora, si la fila estaba reversada, se reactiva con el monto nuevo en vez de
-- acumularlo; si estaba viva, se sigue sumando como antes.
create or replace function app.allocate_payment_oldest_first(p_payment_id uuid)
returns numeric
language plpgsql
security definer
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
    on conflict(payment_id,charge_id) do update set
      amount = case when app.payment_allocations.status='reversed'
                    then excluded.amount
                    else app.payment_allocations.amount + excluded.amount end,
      status = 'posted',
      reversed_at = null,
      reversal_reason = null,
      reversed_by = null;
    v_total:=v_total+v_piece;
  end loop;
  return v_total;
end $function$;;
