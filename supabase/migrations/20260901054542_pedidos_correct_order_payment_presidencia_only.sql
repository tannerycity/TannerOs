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
  if not private.is_presidency(p_organization_id) then
    raise exception 'Solo Presidencia puede corregir un cobro de pedido';
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
  if v_order_status not in ('partial_payment','paid') then
    raise exception 'Solo se puede corregir un cobro mientras el pedido sigue en pago parcial o pagado. Si ya pasó a producción, cancela o reembolsa el pedido en su lugar.';
  end if;

  perform private.command_refund_payment(p_organization_id, p_payment_id, v.amount, current_date,
    coalesce(nullif(v.method,''), 'efectivo'), 'Corrección de cobro en pedido', p_reason,
    'correct-order-payment:'||p_payment_id::text);

  update app.payments
    set status='refunded', voided_at=now(), void_reason=p_reason, voided_by_user_id=v_actor, updated_at=now()
    where id=p_payment_id and organization_id=p_organization_id;

  v_paid := private.order_paid_amount(p_organization_id, v_order_id);
  v_new_status := case
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

create or replace function public.v2_correct_order_payment(organization_id uuid, payment_id uuid, reason text)
returns void
language sql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$ select private.command_correct_order_payment(organization_id, payment_id, reason) $function$;;
