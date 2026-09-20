insert into app.legacy_migration_conflicts(organization_id,domain,legacy_table,legacy_id,conflict_type,payload)
select o.organization_id,'commerce','public.orders',o.id,'missing_order_items',jsonb_build_object('legacyFolio',o.folio,'reason','Legacy order has no item array; totals and header preserved, line detail unavailable')
from public.orders o
where not coalesce(jsonb_typeof(o.items)='array' and jsonb_array_length(o.items)>0,false)
on conflict (organization_id,legacy_table,legacy_id,conflict_type) where legacy_id is not null do nothing;

insert into app.order_payments(organization_id,order_id,payment_id,amount,created_at)
select p.organization_id,o.id,ap.id,least(ap.amount,p.amount),coalesce(p.created_at,ap.created_at,now())
from public.payments p
join app.orders o on o.organization_id=p.organization_id and o.legacy_id=p.order_id
join app.payments ap on ap.organization_id=p.organization_id and ap.legacy_id=p.id
where nullif(trim(coalesce(p.order_id,'')),'') is not null and p.amount>0
on conflict(order_id,payment_id) do nothing;

alter table app.orders add column if not exists discount_reason text;
alter table app.orders add column if not exists discount_authorized_by_user_id uuid references auth.users(id) on delete set null;

create or replace function private.order_paid_amount(p_organization_id uuid,p_order_id uuid)
returns numeric
language sql
stable
security definer
set search_path='pg_catalog','app'
as $$
 select coalesce(sum(op.amount),0)::numeric
 from app.order_payments op
 join app.payments p on p.id=op.payment_id and p.organization_id=op.organization_id
 where op.organization_id=p_organization_id and op.order_id=p_order_id and p.status='posted'
$$;

create or replace function private.order_readiness(p_organization_id uuid,p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path='pg_catalog','app','private'
as $$
declare
 v_order app.orders%rowtype;
 v_items bigint;
 v_missing_size bigint;
 v_missing_name bigint;
 v_missing_number bigint;
 v_paid numeric;
 v_pct numeric;
 v_missing text[]:=array[]::text[];
begin
 select * into v_order from app.orders where organization_id=p_organization_id and id=p_order_id;
 if not found then raise exception 'Order not found'; end if;
 select count(*) into v_items from app.order_items where organization_id=p_organization_id and order_id=p_order_id;
 if v_items=0 then v_missing:=array_append(v_missing,'sin piezas'); end if;
 select count(*) into v_missing_size from app.order_items i where i.organization_id=p_organization_id and i.order_id=p_order_id and nullif(trim(coalesce(i.attributes->>'talla',i.attributes->>'size','')),'') is null;
 if v_missing_size>0 then v_missing:=array_append(v_missing,'falta talla'); end if;
 select count(*) into v_missing_name from app.order_items i where i.organization_id=p_organization_id and i.order_id=p_order_id and coalesce(i.description,'') ~* '(jersey|uniforme|playera)' and nullif(trim(coalesce(i.attributes->>'nombrePers',i.attributes->>'personalizationName',i.attributes->>'personalizedName','')),'') is null;
 if v_missing_name>0 then v_missing:=array_append(v_missing,'falta nombre'); end if;
 select count(*) into v_missing_number from app.order_items i where i.organization_id=p_organization_id and i.order_id=p_order_id and coalesce(i.description,'') ~* '(jersey|uniforme|playera)' and nullif(trim(coalesce(i.attributes->>'numero',i.attributes->>'number',i.attributes->>'jerseyNumber','')),'') is null;
 if v_missing_number>0 then v_missing:=array_append(v_missing,'falta número'); end if;
 v_paid:=private.order_paid_amount(p_organization_id,p_order_id);
 v_pct:=case when coalesce(v_order.total,0)<=0 then 100 else round(least(100,(v_paid/v_order.total)*100),2) end;
 if v_paid+0.005<coalesce(v_order.total,0) then v_missing:=array_append(v_missing,'pago incompleto'); end if;
 return jsonb_build_object('ok',cardinality(v_missing)=0,'missing',to_jsonb(v_missing),'itemCount',v_items,'missingSizeCount',v_missing_size,'missingNameCount',v_missing_name,'missingNumberCount',v_missing_number,'paidAmount',v_paid,'total',v_order.total,'paidPercent',v_pct,'effectivePaymentRequirementPercent',100,'legacyPaymentRequirementPercent',50,'legacyPaymentThresholdSupersededBy','ORDER-002');
end
$$;

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
 values(p_organization_id,v_order.player_id,p_amount,coalesce(p_payment_date,current_date),coalesce(nullif(trim(p_method),''),'other'),nullif(trim(p_reference),''),'Abono pedido '||v_order.folio,'posted','tanneros_v2','Pedido Tienda',p_idempotency_key,'customer',nullif(trim(p_payer_name),''),'other','not_applicable',now(),now()) returning id into v_payment;
 insert into app.order_payments(organization_id,order_id,payment_id,amount) values(p_organization_id,p_order_id,v_payment,p_amount);
 v_paid:=v_paid+p_amount;
 update app.orders set status=case when v_paid+0.005>=total then 'paid' else 'partial_payment' end,updated_at=now() where id=p_order_id and organization_id=p_organization_id;
 insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id,request_id) values(p_organization_id,'OrderPaymentPosted','order',p_order_id,jsonb_build_object('payment_id',v_payment,'amount',p_amount,'paid_total',v_paid),v_actor,p_idempotency_key);
 return v_payment;
end
$$;

create or replace function private.command_set_order_discount(p_organization_id uuid,p_order_id uuid,p_discount numeric,p_reason text)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','app','private'
as $$
declare
 v_order app.orders%rowtype;
 v_cost numeric;
 v_missing_cost bigint;
 v_net numeric;
 v_margin numeric;
 v_min numeric;
 v_role text;
 v_actor uuid:=(select auth.uid());
begin
 if not private.has_module_access(p_organization_id,'commerce',true) then raise exception 'Not authorized'; end if;
 select * into v_order from app.orders where organization_id=p_organization_id and id=p_order_id for update;
 if not found then raise exception 'Order not found'; end if;
 if v_order.status not in ('draft','pending_payment','partial_payment') then raise exception 'Order can no longer be repriced'; end if;
 if coalesce(p_discount,0)<0 or coalesce(p_discount,0)>coalesce(v_order.subtotal,0) then raise exception 'Invalid discount'; end if;
 select coalesce(sum(coalesce(unit_cost,0)*quantity),0),count(*) filter(where unit_cost is null) into v_cost,v_missing_cost from app.order_items where organization_id=p_organization_id and order_id=p_order_id;
 v_net:=greatest(0,coalesce(v_order.subtotal,0)-coalesce(p_discount,0));
 v_margin:=case when v_net>0 and v_missing_cost=0 then round(((v_net-v_cost)/v_net)*100,2) else null end;
 select case when (settings->'commerce'->>'margin_min_percent') ~ '^[0-9]+([.][0-9]+)?$' then (settings->'commerce'->>'margin_min_percent')::numeric else null end into v_min from public.organizations where id=p_organization_id;
 if coalesce(p_discount,0)>0 and v_min is not null then
   if v_margin is null then raise exception 'Cannot validate margin because one or more frozen costs are missing'; end if;
   if v_margin<v_min then
     select m.role into v_role from public.organization_memberships m where m.organization_id=p_organization_id and m.user_id=v_actor and m.active=true limit 1;
     if coalesce(v_role,'') not in ('Presidencia','Admin') then raise exception 'Discount requires Presidencia authorization'; end if;
   end if;
 end if;
 update app.orders set discount=coalesce(p_discount,0),discount_reason=nullif(trim(p_reason),''),total=v_net,discount_authorized_by_user_id=case when v_min is not null and v_margin is not null and v_margin<v_min then v_actor else null end,updated_at=now() where organization_id=p_organization_id and id=p_order_id;
 insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id) values(p_organization_id,'OrderDiscountUpdated','order',p_order_id,jsonb_build_object('discount',coalesce(p_discount,0),'reason',nullif(trim(p_reason),''),'margin_percent',v_margin,'minimum_margin_percent',v_min),v_actor);
 return jsonb_build_object('discount',coalesce(p_discount,0),'total',v_net,'marginPercent',v_margin,'minimumMarginPercent',v_min,'authorizedBy',case when v_min is not null and v_margin is not null and v_margin<v_min then v_actor else null end);
end
$$;

create or replace function private.command_update_order_status(p_organization_id uuid,p_order_id uuid,p_new_status text)
returns void
language plpgsql
security definer
set search_path='pg_catalog','app','private'
as $$
declare
 v_old text;
 v_allowed text[];
 v_paid numeric;
 v_total numeric;
 v_ready jsonb;
begin
 if not private.has_module_access(p_organization_id,'commerce',true) then raise exception 'Not authorized'; end if;
 select status,total into v_old,v_total from app.orders where id=p_order_id and organization_id=p_organization_id for update;
 if v_old is null then raise exception 'Order not found'; end if;
 v_allowed:=case v_old when 'draft' then array['pending_payment','cancelled'] when 'pending_payment' then array['partial_payment','paid','cancelled'] when 'partial_payment' then array['paid','cancelled','refunded'] when 'paid' then array['in_production','ready','refunded'] when 'in_production' then array['ready','refunded'] when 'ready' then array['delivered','refunded'] when 'delivered' then array['refunded'] when 'cancelled' then array['cancelled'] when 'refunded' then array['refunded'] else array[]::text[] end;
 if not (p_new_status=any(v_allowed)) then raise exception 'Invalid order transition: % -> %',v_old,p_new_status; end if;
 v_paid:=private.order_paid_amount(p_organization_id,p_order_id);
 if p_new_status='partial_payment' and not(v_paid>0 and v_paid+0.005<coalesce(v_total,0)) then raise exception 'Order payment amount does not match partial_payment state'; end if;
 if p_new_status='paid' and v_paid+0.005<coalesce(v_total,0) then raise exception 'Order cannot be marked paid before full payment is recorded'; end if;
 if p_new_status in ('in_production','ready') then
   v_ready:=private.order_readiness(p_organization_id,p_order_id);
   if not coalesce((v_ready->>'ok')::boolean,false) then raise exception 'Order is not production-ready: %',v_ready->'missing'; end if;
 end if;
 update app.orders set status=p_new_status,updated_at=now() where id=p_order_id and organization_id=p_organization_id;
 insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id) values(p_organization_id,'OrderStatusChanged','order',p_order_id,jsonb_build_object('from',v_old,'to',p_new_status),(select auth.uid()));
end
$$;

update app.business_rule_catalog set status='active',enforcement='command',test_status='pending',updated_at=now(),metadata=metadata||jsonb_build_object('implemented_on','2026-08-19','backend_functions',jsonb_build_array('private.order_readiness','private.command_update_order_status','private.command_post_order_payment'),'legacy_payment_threshold_percent',50,'payment_threshold_superseded_by','ORDER-002','effective_payment_threshold_percent',100) where rule_key='ORDER-004';
update app.business_rule_catalog set status='active',enforcement='command',test_status='pending',updated_at=now(),metadata=metadata||jsonb_build_object('implemented_on','2026-08-19','backend_function','private.command_set_order_discount','minimum_margin_default','disabled_when_unset') where rule_key='ORDER-005';;
