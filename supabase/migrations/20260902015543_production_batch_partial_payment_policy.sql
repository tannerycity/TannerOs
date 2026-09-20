-- 1. Official policy: 50% anticipo habilita mandar a producción (resto se cobra al entregar,
--    ya bloqueado por command_update_order_status). Guardado como setting editable por org,
--    no hardcodeado, para poder ajustarlo sin tocar código.
update public.organizations
set settings = coalesce(settings,'{}'::jsonb) || jsonb_build_object('productionMinPaidPercent', 50)
where id = '3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8';

-- 2. query_orders: exponer paid_amount para que el front pueda mostrar cuánto lleva pagado
--    cada pedido (necesario para elegir candidatos a corte con anticipo).
drop function private.query_orders(uuid, text);

create function private.query_orders(p_organization_id uuid, p_status text default null::text)
 returns table(id uuid, folio text, customer_name text, customer_phone text, customer_email text, subtotal numeric, discount numeric, total numeric, status text, source text, notes text, created_at timestamp with time zone, delivered_at timestamp with time zone, paid_amount numeric, item_count bigint)
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog', 'app', 'private'
as $function$
begin
  if not private.has_module_access(p_organization_id,'commerce',false) then raise exception 'Not authorized'; end if;
  return query
  select o.id,o.folio,o.customer_name,o.customer_phone,o.customer_email,o.subtotal,o.discount,o.total,o.status,o.source,o.notes,o.created_at,o.delivered_at,
         private.order_paid_amount(p_organization_id,o.id),
         (select count(*) from app.order_items i where i.order_id=o.id)
  from app.orders o
  where o.organization_id=p_organization_id and o.archived_at is null and (p_status is null or o.status=p_status)
  order by o.created_at desc,o.id;
end $function$;

revoke execute on function private.query_orders(uuid, text) from public;
grant execute on function private.query_orders(uuid, text) to postgres, authenticated, service_role;

-- 3. command_create_production_batch: permitir partial_payment con al menos
--    productionMinPaidPercent% pagado (default 100% si el setting no existe, para no
--    cambiar el comportamiento de organizaciones que no lo hayan configurado).
create or replace function private.command_create_production_batch(p_organization_id uuid, p_order_ids jsonb, p_supplier_name text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare
  v_batch uuid; v_order uuid; v_readiness jsonb; v_sale numeric:=0; v_cost numeric:=0; v_order_cost numeric; v_count int:=0;
  v_min_pct numeric; v_paid numeric; v_order_status text; v_order_total numeric; v_order_folio text;
begin
  if not private.has_module_access(p_organization_id,'commerce',true) then raise exception 'Not authorized'; end if;
  if jsonb_typeof(p_order_ids)<>'array' or jsonb_array_length(p_order_ids)=0 then raise exception 'At least one order is required'; end if;
  if jsonb_array_length(p_order_ids)<>(select count(distinct value) from jsonb_array_elements_text(p_order_ids)) then raise exception 'Duplicate order id'; end if;

  select coalesce((o.settings->>'productionMinPaidPercent')::numeric,100) into v_min_pct
  from public.organizations o where o.id=p_organization_id;

  for v_order in select value::uuid from jsonb_array_elements_text(p_order_ids)
  loop
    select o.status,o.total,o.folio into v_order_status,v_order_total,v_order_folio
      from app.orders o where o.id=v_order and o.organization_id=p_organization_id;
    if v_order_status is null then raise exception 'Order not found'; end if;
    if v_order_status not in ('paid','partial_payment') then
      raise exception 'El pedido % debe estar pagado o con anticipo antes de mandarlo a producción.', coalesce(v_order_folio,v_order::text);
    end if;
    v_paid:=private.order_paid_amount(p_organization_id,v_order);
    if v_order_total>0 and (v_paid/v_order_total*100) < v_min_pct-0.01 then
      raise exception 'El pedido % necesita al menos % pagado para entrar a producción (lleva %).',
        coalesce(v_order_folio,v_order::text), (v_min_pct::text||'%'), (round(v_paid/nullif(v_order_total,0)*100,1)::text||'%');
    end if;
    if exists(select 1 from app.production_batch_orders bo where bo.organization_id=p_organization_id and bo.order_id=v_order) then raise exception 'Order already belongs to a production batch'; end if;
    v_readiness:=private.order_readiness(p_organization_id,v_order);
    if not coalesce((v_readiness->>'ok')::boolean,false) then raise exception 'Order is not production-ready: %',v_readiness->'missing'; end if;
    if exists(select 1 from app.order_items i where i.organization_id=p_organization_id and i.order_id=v_order and i.unit_cost is null) then raise exception 'Frozen cost is required before production batch'; end if;
    select coalesce(sum(i.unit_cost*i.quantity),0) into v_order_cost from app.order_items i where i.organization_id=p_organization_id and i.order_id=v_order;
    v_sale:=v_sale+v_order_total;
    v_cost:=v_cost+v_order_cost;
    v_count:=v_count+1;
  end loop;

  insert into app.production_batches(organization_id,folio,batch_type,status,supplier_name,submitted_on,sales_total,cost_total,notes,created_by_user_id)
  values(p_organization_id,private.next_production_batch_folio(p_organization_id,'COR'),'orders','submitted',nullif(trim(p_supplier_name),''),current_date,v_sale,v_cost,nullif(trim(p_notes),''),(select auth.uid()))
  returning id into v_batch;

  for v_order in select value::uuid from jsonb_array_elements_text(p_order_ids)
  loop
    select coalesce(sum(i.unit_cost*i.quantity),0) into v_order_cost from app.order_items i where i.organization_id=p_organization_id and i.order_id=v_order;
    insert into app.production_batch_orders(organization_id,batch_id,order_id,sale_snapshot,cost_snapshot)
    select p_organization_id,v_batch,o.id,o.total,v_order_cost from app.orders o where o.id=v_order and o.organization_id=p_organization_id;
    perform private.command_update_order_status(p_organization_id,v_order,'in_production');
  end loop;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,'ProductionBatchCreated','production_batch',v_batch,jsonb_build_object('orders',v_count,'salesTotal',v_sale,'costTotal',v_cost,'minPaidPercent',v_min_pct),coalesce((select auth.uid())::text,'system'));
  return v_batch;
end
$function$;
;
