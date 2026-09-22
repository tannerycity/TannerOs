-- 1. Add delivered_at column
alter table app.orders add column if not exists delivered_at timestamptz;

-- 2. command_update_order_status: stamp delivered_at when transitioning to delivered
create or replace function private.command_update_order_status(p_organization_id uuid, p_order_id uuid, p_new_status text)
 returns void
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'app', 'private'
as $function$
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
  v_allowed:=case v_old
    when 'draft' then array['pending_payment','cancelled']
    when 'pending_payment' then array['partial_payment','paid','cancelled']
    when 'partial_payment' then array['paid','in_production','ready','cancelled','refunded']
    when 'paid' then array['in_production','ready','refunded']
    when 'in_production' then array['ready','refunded']
    when 'ready' then array['delivered','refunded']
    when 'delivered' then array['refunded']
    when 'cancelled' then array['cancelled']
    when 'refunded' then array['refunded']
    else array[]::text[]
  end;
  if not (p_new_status=any(v_allowed)) then raise exception 'Invalid order transition: % -> %',v_old,p_new_status; end if;
  v_paid:=private.order_paid_amount(p_organization_id,p_order_id);
  if p_new_status='partial_payment' and not(v_paid>0 and v_paid+0.005<coalesce(v_total,0)) then raise exception 'Order payment amount does not match partial_payment state'; end if;
  if p_new_status='paid' and v_paid+0.005<coalesce(v_total,0) then raise exception 'Order cannot be marked paid before full payment is recorded'; end if;
  if p_new_status in ('in_production','ready') then
    v_ready:=private.order_readiness(p_organization_id,p_order_id);
    if not coalesce((v_ready->>'ok')::boolean,false) then raise exception 'Order is not production-ready: %',v_ready->'missing'; end if;
  end if;
  if p_new_status='delivered' and v_paid+0.005<coalesce(v_total,0) then
    raise exception 'No se puede marcar como entregado: falta cobrar el saldo pendiente del pedido';
  end if;
  update app.orders set status=p_new_status,updated_at=now(),
    delivered_at=case when p_new_status='delivered' then coalesce(delivered_at,now()) else delivered_at end
    where id=p_order_id and organization_id=p_organization_id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id) values(p_organization_id,'OrderStatusChanged','order',p_order_id,jsonb_build_object('from',v_old,'to',p_new_status),(select auth.uid()));
end
$function$;

-- 3. query_orders: needs DROP first since we're changing the TABLE(...) signature
drop function private.query_orders(uuid, text);

create function private.query_orders(p_organization_id uuid, p_status text default null::text)
 returns table(id uuid, folio text, customer_name text, customer_phone text, customer_email text, subtotal numeric, discount numeric, total numeric, status text, source text, notes text, created_at timestamp with time zone, delivered_at timestamp with time zone, item_count bigint)
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog', 'app', 'private'
as $function$
begin
  if not private.has_module_access(p_organization_id,'commerce',false) then raise exception 'Not authorized'; end if;
  return query
  select o.id,o.folio,o.customer_name,o.customer_phone,o.customer_email,o.subtotal,o.discount,o.total,o.status,o.source,o.notes,o.created_at,o.delivered_at,
         (select count(*) from app.order_items i where i.order_id=o.id)
  from app.orders o
  where o.organization_id=p_organization_id and o.archived_at is null and (p_status is null or o.status=p_status)
  order by o.created_at desc,o.id;
end $function$;

grant execute on function private.query_orders(uuid, text) to postgres, authenticated, service_role;

-- 4. command_open_warranty: enforce 5-day window from delivered_at
create or replace function private.command_open_warranty(p_organization_id uuid, p_order_id uuid, p_reason text, p_items jsonb, p_notes text default null::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare v_warranty uuid; r jsonb; v_item app.order_items%rowtype; v_qty int; v_count int:=0; v_delivered_at timestamptz;
begin
  if not private.has_module_access(p_organization_id,'commerce',true) then raise exception 'Not authorized'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'Warranty reason required'; end if;

  select o.delivered_at into v_delivered_at
  from app.orders o where o.id=p_order_id and o.organization_id=p_organization_id and o.status='delivered';
  if not found then raise exception 'Warranty requires a delivered order'; end if;
  if v_delivered_at is null then raise exception 'No se puede validar la fecha de entrega de este pedido'; end if;
  if now() > v_delivered_at + interval '5 days' then
    raise exception 'La garantía ya no está disponible: pasaron más de 5 días desde la entrega (%).', to_char(v_delivered_at,'DD/MM/YYYY');
  end if;

  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'At least one warranty item is required'; end if;

  insert into app.warranties(organization_id,folio,order_id,status,reason,notes,created_by_user_id)
  values(p_organization_id,private.next_warranty_folio(p_organization_id),p_order_id,'opened',trim(p_reason),nullif(trim(p_notes),''),(select auth.uid())) returning id into v_warranty;

  for r in select value from jsonb_array_elements(p_items)
  loop
    if nullif(r->>'order_item_id','') is null then raise exception 'order_item_id required'; end if;
    select * into v_item from app.order_items where id=(r->>'order_item_id')::uuid and organization_id=p_organization_id and order_id=p_order_id;
    if not found then raise exception 'Warranty item is not part of order'; end if;
    v_qty:=coalesce((r->>'quantity')::int,1);
    if v_qty<=0 or v_qty>v_item.quantity then raise exception 'Invalid warranty quantity'; end if;
    insert into app.warranty_items(organization_id,warranty_id,order_item_id,description_snapshot,quantity,unit_cost_snapshot,attributes_snapshot,item_reason)
    values(p_organization_id,v_warranty,v_item.id,v_item.description,v_qty,v_item.unit_cost,coalesce(v_item.attributes,'{}'::jsonb),nullif(trim(r->>'reason'),''));
    v_count:=v_count+1;
  end loop;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,'WarrantyOpened','warranty',v_warranty,jsonb_build_object('orderId',p_order_id,'items',v_count,'reason',trim(p_reason)),coalesce((select auth.uid())::text,'system'));
  return v_warranty;
end
$function$;
;
