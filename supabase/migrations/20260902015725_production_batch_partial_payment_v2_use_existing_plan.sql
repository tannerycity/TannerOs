-- Corrección: el codebase ya tenía un mecanismo de "plan de pago" por pedido
-- (app.orders.metadata->paymentPlan->requiredPercent, usado por order_readiness y ya
-- editable en Pedidos vía v2_set_order_payment_plan). Mi primer intento agregó un segundo
-- chequeo de porcentaje directo en command_create_production_batch que ignoraba ese plan
-- por-pedido y podía contradecirlo (ej. un pedido con plan custom al 30% igual se hubiera
-- bloqueado por el 50% de organización). Se corrige para que todo pase por order_readiness,
-- que ya es la única fuente de verdad, y solo se le agrega el fallback a nivel organización.

-- 1. order_readiness: si el pedido no tiene plan de pago propio, usar el default de
--    organización (organizations.settings.productionMinPaidPercent) en vez de 100 fijo.
create or replace function private.order_readiness(p_organization_id uuid, p_order_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare
  v_order app.orders%rowtype;
  v_items bigint;
  v_missing_size bigint;
  v_missing_name bigint;
  v_missing_number bigint;
  v_paid numeric;
  v_pct numeric;
  v_missing text[]:=array[]::text[];
  v_required_pct numeric;
  v_required_amount numeric;
  v_org_default_pct numeric;
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

  v_required_pct:=nullif(v_order.metadata->'paymentPlan'->>'requiredPercent','')::numeric;
  if v_required_pct is null or v_required_pct<=0 or v_required_pct>100 then
    select coalesce((o.settings->>'productionMinPaidPercent')::numeric,100) into v_org_default_pct
    from public.organizations o where o.id=p_organization_id;
    v_required_pct:=v_org_default_pct;
    if v_required_pct is null or v_required_pct<=0 or v_required_pct>100 then v_required_pct:=100; end if;
  end if;
  v_required_amount:=round(coalesce(v_order.total,0)*v_required_pct/100.0,2);
  if v_paid+0.005<v_required_amount then v_missing:=array_append(v_missing,'pago incompleto'); end if;

  return jsonb_build_object(
    'ok',cardinality(v_missing)=0,
    'missing',to_jsonb(v_missing),
    'itemCount',v_items,
    'missingSizeCount',v_missing_size,
    'missingNameCount',v_missing_name,
    'missingNumberCount',v_missing_number,
    'paidAmount',v_paid,
    'total',v_order.total,
    'paidPercent',v_pct,
    'effectivePaymentRequirementPercent',v_required_pct,
    'requiredPaymentAmount',v_required_amount,
    'paymentPlanCustom',v_required_pct<100
  );
end
$function$;

-- 2. command_create_production_batch: quitar el chequeo de porcentaje duplicado que
--    agregamos antes; ahora basta con aceptar partial_payment en el status inicial y dejar
--    que order_readiness (ya llamado más abajo en la misma función) sea el único juez.
create or replace function private.command_create_production_batch(p_organization_id uuid, p_order_ids jsonb, p_supplier_name text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare
  v_batch uuid; v_order uuid; v_readiness jsonb; v_sale numeric:=0; v_cost numeric:=0; v_order_cost numeric; v_count int:=0;
begin
  if not private.has_module_access(p_organization_id,'commerce',true) then raise exception 'Not authorized'; end if;
  if jsonb_typeof(p_order_ids)<>'array' or jsonb_array_length(p_order_ids)=0 then raise exception 'At least one order is required'; end if;
  if jsonb_array_length(p_order_ids)<>(select count(distinct value) from jsonb_array_elements_text(p_order_ids)) then raise exception 'Duplicate order id'; end if;

  for v_order in select value::uuid from jsonb_array_elements_text(p_order_ids)
  loop
    if not exists(select 1 from app.orders o where o.id=v_order and o.organization_id=p_organization_id and o.status in ('paid','partial_payment')) then raise exception 'Order must be paid (or meet its payment plan) before production batch'; end if;
    if exists(select 1 from app.production_batch_orders bo where bo.organization_id=p_organization_id and bo.order_id=v_order) then raise exception 'Order already belongs to a production batch'; end if;
    v_readiness:=private.order_readiness(p_organization_id,v_order);
    if not coalesce((v_readiness->>'ok')::boolean,false) then raise exception 'Order is not production-ready: %',v_readiness->'missing'; end if;
    if exists(select 1 from app.order_items i where i.organization_id=p_organization_id and i.order_id=v_order and i.unit_cost is null) then raise exception 'Frozen cost is required before production batch'; end if;
    select coalesce(sum(i.unit_cost*i.quantity),0) into v_order_cost from app.order_items i where i.organization_id=p_organization_id and i.order_id=v_order;
    v_sale:=v_sale+(select total from app.orders where id=v_order);
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
  values(p_organization_id,'ProductionBatchCreated','production_batch',v_batch,jsonb_build_object('orders',v_count,'salesTotal',v_sale,'costTotal',v_cost),coalesce((select auth.uid())::text,'system'));
  return v_batch;
end
$function$;
;
