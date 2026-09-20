create or replace function private.command_post_order_payment(p_organization_id uuid,p_order_id uuid,p_amount numeric,p_payment_date date,p_method text,p_reference text,p_payer_name text,p_idempotency_key text)
returns uuid
language plpgsql
security definer
set search_path='pg_catalog','public','app','private'
as $$
declare
 v_order app.orders%rowtype;
 v_payment uuid;
 v_paid numeric;
 v_actor uuid:=(select auth.uid());
begin
 if not private.has_module_access(p_organization_id,'commerce',true) then raise exception 'Not authorized'; end if;
 if p_amount is null or p_amount<=0 then raise exception 'Amount must be greater than zero'; end if;
 if p_idempotency_key is null or length(trim(p_idempotency_key))<8 then raise exception 'Idempotency key required'; end if;
 select * into v_order from app.orders where organization_id=p_organization_id and id=p_order_id for update;
 if not found then raise exception 'Order not found'; end if;
 if v_order.status not in ('pending_payment','partial_payment') then raise exception 'Order is not open for payment'; end if;
 select p.id into v_payment from app.payments p where p.organization_id=p_organization_id and p.idempotency_key=p_idempotency_key;
 if v_payment is not null then
   if not exists(select 1 from app.order_payments where organization_id=p_organization_id and order_id=p_order_id and payment_id=v_payment) then raise exception 'Idempotency key already belongs to another payment context'; end if;
   return v_payment;
 end if;
 v_paid:=private.order_paid_amount(p_organization_id,p_order_id);
 if v_paid+p_amount>coalesce(v_order.total,0)+0.005 then raise exception 'Payment exceeds order balance'; end if;
 insert into app.payments(organization_id,player_id,amount,payment_date,method,reference,concept,status,source,category,idempotency_key,payer_type,payer_name,payment_purpose,credit_status,created_at,updated_at)
 values(p_organization_id,v_order.player_id,p_amount,coalesce(p_payment_date,current_date),coalesce(nullif(trim(p_method),''),'other'),nullif(trim(p_reference),''),'Abono pedido '||v_order.folio,'posted','tanneros_v2','Pedido Tienda',p_idempotency_key,'other',nullif(trim(p_payer_name),''),'commerce','not_applicable',now(),now()) returning id into v_payment;
 insert into app.order_payments(organization_id,order_id,payment_id,amount) values(p_organization_id,p_order_id,v_payment,p_amount);
 v_paid:=v_paid+p_amount;
 update app.orders set status=case when v_paid+0.005>=total then 'paid' else 'partial_payment' end,updated_at=now() where id=p_order_id and organization_id=p_organization_id;
 insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id,request_id) values(p_organization_id,'OrderPaymentPosted','order',p_order_id,jsonb_build_object('payment_id',v_payment,'amount',p_amount,'paid_total',v_paid),v_actor,p_idempotency_key);
 return v_payment;
end
$$;;
