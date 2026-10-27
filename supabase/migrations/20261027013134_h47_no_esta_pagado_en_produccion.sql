-- h47 (27/10/2026): "No está pagado" también en pedidos que ya van a
-- producción. Presidencia: "quiero poder poner que no han pagado pero a Zul
-- le sale esto" ("Solo se puede corregir un cobro mientras el pedido sigue en
-- pago parcial o pagado").
--  * El caso real: un pedido pasó a producción con un cobro en efectivo que
--    nunca llegó. Cancelarlo no sirve (el uniforme ya se mandó a hacer); lo
--    que hace falta es quitar el cobro y que quede el saldo por cobrar.
--  * Ahora se puede quitar un cobro en producción, listo o entregado: el
--    pedido NO regresa de etapa (ya se hizo), sólo queda con saldo. En pago
--    parcial o pagado sigue como antes (vuelve a "por cobrar" o "parcial").
--  * Cancelado, reembolsado o borrador: no; ahí no hay cobro que corregir.
create or replace function private.command_correct_order_payment(p_organization_id uuid, p_payment_id uuid, p_reason text)
 returns void
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare
  v app.payments%rowtype;
  v_order_id uuid;
  v_actor uuid := (select auth.uid());
  v_order_status text;
  v_total numeric;
  v_paid numeric;
  v_new_status text;
begin
  if not private.can_correct(p_organization_id) then raise exception 'No tienes permiso para corregir pedidos y cobros';
  end if;
  if coalesce(length(trim(p_reason)),0) < 3 then
    raise exception 'Escribe el motivo de la corrección (queda en la bitácora)';
  end if;

  select * into v from app.payments where id=p_payment_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Cobro no encontrado'; end if;
  if v.status <> 'posted' then raise exception 'Solo se puede corregir un cobro publicado'; end if;

  select op.order_id into v_order_id from app.order_payments op
    where op.organization_id=p_organization_id and op.payment_id=p_payment_id
    limit 1;
  if v_order_id is null then raise exception 'Este movimiento no corresponde a un pedido de Tienda'; end if;

  select o.status, o.total into v_order_status, v_total from app.orders o
    where o.id=v_order_id and o.organization_id=p_organization_id for update;
  if v_order_status not in ('partial_payment','paid','in_production','ready','delivered') then
    raise exception 'Este pedido está cancelado o reembolsado: ya no tiene cobros que corregir.';
  end if;

  perform private.command_refund_payment(p_organization_id, p_payment_id, v.amount, current_date,
    coalesce(nullif(v.method,''), 'efectivo'), 'Corrección de cobro en pedido', p_reason,
    'correct-order-payment:'||p_payment_id::text);

  update app.payments
    set status='refunded', voided_at=now(), void_reason=p_reason, voided_by_user_id=v_actor, updated_at=now()
    where id=p_payment_id and organization_id=p_organization_id;

  v_paid := private.order_paid_amount(p_organization_id, v_order_id);
  -- En producción, listo o entregado la etapa no regresa: sólo queda el saldo.
  v_new_status := case
    when v_order_status in ('in_production','ready','delivered') then v_order_status
    when v_paid <= 0.005 then 'pending_payment'
    when v_paid + 0.005 < v_total then 'partial_payment'
    else v_order_status
  end;

  update app.orders set status=v_new_status, updated_at=now()
    where id=v_order_id and organization_id=p_organization_id;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
    values(p_organization_id,'OrderPaymentCorrected','payment',p_payment_id,
      jsonb_build_object('orderId',v_order_id,'amount',v.amount,'reason',p_reason,
        'previousOrderStatus',v_order_status,'newOrderStatus',v_new_status), v_actor);
end
$function$;
revoke all on function private.command_correct_order_payment(uuid, uuid, text) from public, anon;
