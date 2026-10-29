-- h51 · Pagar al proveedor, por persona (29/10/2026).
--
-- Presidencia: "todo tiene que vivir en la misma pestaña" (la Tienda) y
-- "Pagar a Tremor" lo ven Presidencia y Contabilidad, "y le vamos a dar ese
-- permiso especial a Zul". Antes sólo quien tenía Contabilidad con escritura
-- podía registrar el pago al proveedor de un envío, y vivía en la pantalla
-- de Producción, que se va.
--
-- 1. Permiso por persona "Pagar al proveedor" (módulo pago_proveedor), como
--    "Corregir pedidos y cobros" (h32): no abre la Contabilidad completa, sólo
--    registrar el pago de un envío y ver su dinero.
-- 2. command_post_batch_supplier_payment acepta Contabilidad con escritura O
--    ese permiso. Lo demás de la función queda igual.
-- 3. v2_can_pay_supplier(org): la Tienda pregunta si enseña "Pagar a Tremor".
-- 4. Se le da a Zul.

insert into public.modules(code, name, category, description, is_core, active, sort_order)
values ('pago_proveedor', 'Pagar al proveedor', 'management',
        'Registrar el pago al proveedor de cada envío de la Tienda y ver su costo. Presidencia y Contabilidad ya lo tienen.',
        false, true, 6)
on conflict (code) do nothing;
insert into public.plan_modules(plan_id, module_code, enabled)
select plan_id, 'pago_proveedor', enabled from public.plan_modules where module_code = 'direccion'
on conflict do nothing;

create or replace function private.can_pay_supplier(p_organization_id uuid)
returns boolean language sql stable security definer set search_path to 'pg_catalog','public','private' as $$
  select private.has_module_access(p_organization_id, 'accounting', true)
      or private.has_module_access(p_organization_id, 'pago_proveedor', true)
$$;
revoke all on function private.can_pay_supplier(uuid) from public, anon;
grant execute on function private.can_pay_supplier(uuid) to authenticated;

create or replace function public.v2_can_pay_supplier(organization_id uuid)
returns boolean language sql stable security definer set search_path to 'pg_catalog','private' as $$
  select private.can_pay_supplier(organization_id)
$$;
revoke all on function public.v2_can_pay_supplier(uuid) from public, anon;
grant execute on function public.v2_can_pay_supplier(uuid) to authenticated;

CREATE OR REPLACE FUNCTION private.command_post_batch_supplier_payment(p_organization_id uuid, p_batch_id uuid, p_amount numeric, p_expense_date date, p_method text, p_reference text, p_notes text, p_idempotency_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'private'
AS $function$ declare v_batch app.production_batches%rowtype; v_id uuid; v_paid numeric; v_actor uuid:=(select auth.uid()); begin if not private.can_pay_supplier(p_organization_id) then raise exception 'Not authorized'; end if; if p_amount is null or p_amount<=0 then raise exception 'Amount must be greater than zero'; end if; if p_idempotency_key is null or length(trim(p_idempotency_key))<8 then raise exception 'Idempotency key required'; end if; select * into v_batch from app.production_batches where id=p_batch_id and organization_id=p_organization_id for update; if not found then raise exception 'Production batch not found'; end if; if v_batch.status='cancelled' then raise exception 'Cancelled batch cannot receive supplier payments'; end if; select id into v_id from app.expenses where organization_id=p_organization_id and idempotency_key=trim(p_idempotency_key); if v_id is not null then return v_id; end if; select coalesce(sum(amount),0) into v_paid from app.expenses where organization_id=p_organization_id and production_batch_id=p_batch_id and status='posted'; if v_paid+p_amount>coalesce(v_batch.cost_total,0)+0.005 then raise exception 'Supplier payment exceeds batch payable'; end if; insert into app.expenses(organization_id,amount,expense_date,category,concept,method,reference,supplier_name,status,source,notes,idempotency_key,metadata,production_batch_id,created_by_user_id,created_at,updated_at) values(p_organization_id,p_amount,coalesce(p_expense_date,current_date),'Proveedor producción','Pago proveedor '||v_batch.folio,coalesce(nullif(trim(p_method),''),'other'),nullif(trim(p_reference),''),v_batch.supplier_name,'posted','tanneros_v2',nullif(trim(coalesce(p_notes,'')),''),trim(p_idempotency_key),jsonb_build_object('productionBatchId',p_batch_id,'batchFolio',v_batch.folio,'batchType',v_batch.batch_type),p_batch_id,v_actor,now(),now()) returning id into v_id; insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id,request_id) values(p_organization_id,'ProductionBatchSupplierPaymentPosted','production_batch',p_batch_id,jsonb_build_object('expenseId',v_id,'amount',p_amount,'supplierPaidTotal',v_paid+p_amount,'supplierPayable',greatest(0,v_batch.cost_total-v_paid-p_amount)),v_actor,trim(p_idempotency_key)); return v_id; end $function$;

-- Zul (Operaciones): pagar al proveedor, por persona.
insert into private.membership_module_overrides(organization_id, membership_id, module_code, can_read, can_write)
select m.organization_id, m.id, 'pago_proveedor', true, true
  from public.organization_memberships m
 where m.id = '65511245-858a-479b-a2fd-94f935ff5b83'
on conflict (organization_id, membership_id, module_code) do update set can_read = true, can_write = true, updated_at = now();
