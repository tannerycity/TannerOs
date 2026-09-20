
-- Taquilla puede cobrar pedidos (command_post_order_payment_attributed sigue igual), pero no debe
-- poder editar el detalle de las piezas (talla/nombre/número) ni cambiar el estado del pedido —
-- eso es trabajo de producción/operación, no de caja. Antes ambas acciones compartían el mismo
-- permiso genérico de 'tienda' que Taquilla también tiene para poder cobrar.
create or replace function private.is_taquilla(p_organization_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'pg_catalog', 'public'
as $function$ select exists(select 1 from public.organization_memberships m where m.organization_id=p_organization_id and m.user_id=(select auth.uid()) and m.active=true and m.role='Taquilla') $function$;

create or replace function private.command_update_order_item_fulfillment(p_organization_id uuid, p_order_item_id uuid, p_size text, p_personalization_name text, p_number text, p_notes text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare v_item app.order_items%rowtype; v_order app.orders%rowtype; v_attrs jsonb;
begin
  if not private.has_module_access(p_organization_id,'commerce',true) then raise exception 'Not authorized'; end if;
  if private.is_taquilla(p_organization_id) then raise exception 'Taquilla no puede editar el detalle de las piezas'; end if;
  select * into v_item from app.order_items where id=p_order_item_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Order item not found'; end if;
  select * into v_order from app.orders where id=v_item.order_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status not in ('draft','pending_payment','partial_payment','paid') then raise exception 'Order item can no longer be edited'; end if;
  v_attrs:=coalesce(v_item.attributes,'{}'::jsonb);
  v_attrs:=v_attrs || jsonb_build_object(
    'talla',nullif(trim(coalesce(p_size,'')),''),
    'nombrePers',nullif(trim(coalesce(p_personalization_name,'')),''),
    'numero',nullif(trim(coalesce(p_number,'')),''),
    'obs',nullif(trim(coalesce(p_notes,'')),'')
  );
  update app.order_items set attributes=v_attrs where id=v_item.id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values(p_organization_id,'OrderItemFulfillmentUpdated','order_item',v_item.id,jsonb_build_object('orderId',v_order.id,'size',nullif(trim(coalesce(p_size,'')),''),'personalizationName',nullif(trim(coalesce(p_personalization_name,'')),''),'number',nullif(trim(coalesce(p_number,'')),'')),(select auth.uid()));
  return jsonb_build_object('itemId',v_item.id,'orderId',v_order.id,'readiness',private.order_readiness(p_organization_id,v_order.id));
end $function$;

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
 if private.is_taquilla(p_organization_id) then raise exception 'Taquilla no puede cambiar el estado del pedido'; end if;
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
$function$;
;
