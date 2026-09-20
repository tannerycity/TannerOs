
-- El club decidió arrancar limpio en septiembre 2026: los pagos nuevos ya no se desvían
-- automáticamente a saldos de julio/agosto sin reconciliar. Julio y agosto quedan como
-- historial fijo (no se tocan, no se pierden), pero dejan de competir por dinero nuevo.
CREATE OR REPLACE FUNCTION app.allocate_payment_oldest_first(p_payment_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'app', 'public'
AS $function$ declare v_payment app.payments%rowtype; r record; v_available numeric; v_piece numeric; v_total numeric:=0; begin select * into v_payment from app.payments where id=p_payment_id for update; if not found or v_payment.status<>'posted' then raise exception 'Payment not available'; end if; if v_payment.payment_purpose<>'billing' then raise exception 'Payment is not a billing payment'; end if; if v_payment.credit_status='legacy_hold' then raise exception 'Legacy held credit requires explicit reconciliation'; end if; for r in select cb.* from app.charge_balances cb where cb.organization_id=v_payment.organization_id and cb.player_id=v_payment.player_id and cb.computed_status in ('pending','partial') and cb.balance_due>0 and cb.billing_period>=date '2026-09-01' and ((v_payment.payer_type='sponsor' and cb.payer_type='sponsor' and (cb.payer_name is null or v_payment.payer_name is null or lower(trim(cb.payer_name))=lower(trim(v_payment.payer_name)))) or (coalesce(v_payment.payer_type,'guardian')<>'sponsor' and coalesce(cb.payer_type,'guardian')<>'sponsor')) order by cb.billing_period nulls last,cb.due_date,cb.created_at,cb.id loop select available_credit into v_available from app.payment_balances where id=v_payment.id; exit when coalesce(v_available,0)<=0; v_piece:=least(v_available,r.balance_due); insert into app.payment_allocations(organization_id,payment_id,charge_id,amount) values(v_payment.organization_id,v_payment.id,r.id,v_piece) on conflict(payment_id,charge_id) do update set amount=app.payment_allocations.amount+excluded.amount; v_total:=v_total+v_piece; end loop; return v_total; end $function$;
;
