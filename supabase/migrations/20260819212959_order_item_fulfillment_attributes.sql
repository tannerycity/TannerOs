create or replace function private.command_update_order_item_fulfillment(p_organization_id uuid,p_order_item_id uuid,p_size text,p_personalization_name text,p_number text,p_notes text)
returns jsonb language plpgsql security definer set search_path='pg_catalog','app','private' as $$
declare v_item app.order_items%rowtype; v_order app.orders%rowtype; v_attrs jsonb;
begin
  if not private.has_module_access(p_organization_id,'commerce',true) then raise exception 'Not authorized'; end if;
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
end $$;
create or replace function public.v2_update_order_item_fulfillment(organization_id uuid,order_item_id uuid,size text,personalization_name text,number text,notes text)
returns jsonb language sql security definer set search_path='pg_catalog','private' as $$ select private.command_update_order_item_fulfillment(organization_id,order_item_id,size,personalization_name,number,notes) $$;
revoke all on function public.v2_update_order_item_fulfillment(uuid,uuid,text,text,text,text) from public,anon;
grant execute on function public.v2_update_order_item_fulfillment(uuid,uuid,text,text,text,text) to authenticated;;
