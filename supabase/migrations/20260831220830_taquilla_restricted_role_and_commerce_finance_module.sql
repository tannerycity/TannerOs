
-- 1) Nuevo módulo: visibilidad de rentabilidad de Tienda (separado de la operación básica de Pedidos)
insert into public.modules (code, name, category, description, is_core, active, sort_order)
values ('commerce_finance', 'Rentabilidad de Tienda', 'commercial',
  'Costo, utilidad esperada y margen de los pedidos de Tienda — separado del acceso operativo básico a Pedidos.',
  false, true, 32)
on conflict (code) do nothing;

insert into public.plan_modules (plan_id, module_code, enabled)
values ('06819587-e058-4e38-b00e-540e28cb8cda', 'commerce_finance', true)
on conflict (plan_id, module_code) do update set enabled=true;

-- 2) Conserva la vista de rentabilidad para los roles que ya la tenían (todos menos Taquilla)
insert into public.role_module_permissions (organization_id, role, module_code, can_read, can_write)
values
  ('3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8','Marketing','commerce_finance', true, true),
  ('3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8','Operaciones','commerce_finance', true, true),
  ('3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8','Presidencia','commerce_finance', true, true)
on conflict (organization_id, role, module_code) do update set can_read=excluded.can_read, can_write=excluded.can_write;

-- 3) query_order_detail: costo total y utilidad esperada solo si tienes commerce_finance.
--    balance/paidAmount/items (con su unitCost de catálogo) se quedan visibles para cualquiera con acceso a Tienda.
create or replace function private.query_order_detail(p_organization_id uuid, p_order_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare
  v_order jsonb; v_items jsonb; v_payments jsonb; v_paid numeric; v_readiness jsonb;
  v_cost numeric; v_missing_cost bigint; v_can_finance boolean;
begin
  if not private.has_module_access(p_organization_id,'commerce',false) then raise exception 'Not authorized'; end if;
  v_can_finance := private.has_module_access(p_organization_id,'commerce_finance',false);

  select to_jsonb(o) into v_order from app.orders o where o.id=p_order_id and o.organization_id=p_organization_id;
  if v_order is null then raise exception 'Order not found'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'productId',i.product_id,'description',i.description,'quantity',i.quantity,'unitPrice',i.unit_price,'unitCost',i.unit_cost,'attributes',i.attributes) order by i.id),'[]'::jsonb),
         coalesce(sum(coalesce(i.unit_cost,0)*i.quantity),0),
         count(*) filter(where i.unit_cost is null)
    into v_items,v_cost,v_missing_cost
  from app.order_items i where i.order_id=p_order_id and i.organization_id=p_organization_id;

  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'amount',op.amount,'paymentDate',p.payment_date,'method',p.method,'reference',p.reference,'status',p.status,'payerType',p.payer_type,'payerName',p.payer_name,'createdAt',op.created_at) order by op.created_at,p.id),'[]'::jsonb)
    into v_payments
  from app.order_payments op join app.payments p on p.id=op.payment_id and p.organization_id=op.organization_id
  where op.organization_id=p_organization_id and op.order_id=p_order_id;

  v_paid:=private.order_paid_amount(p_organization_id,p_order_id);
  v_readiness:=private.order_readiness(p_organization_id,p_order_id);

  return jsonb_build_object(
    'order',v_order,'items',v_items,'payments',v_payments,
    'paidAmount',v_paid,'balance',greatest(0,coalesce((v_order->>'total')::numeric,0)-v_paid),
    'costTotal',case when v_can_finance and v_missing_cost=0 then v_cost else null end,
    'costComplete',v_missing_cost=0,
    'grossProfitExpected',case when v_can_finance and v_missing_cost=0 then coalesce((v_order->>'total')::numeric,0)-v_cost else null end,
    'canViewFinance',v_can_finance,
    'readiness',v_readiness
  );
end $function$;

-- 4) Rol Taquilla: fuera cobranza (nada de dinero agregado), sí Calendario (solo lectura), programas solo lectura.
delete from public.role_module_permissions
where organization_id='3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8' and role='Taquilla' and module_code='cobranza';

insert into public.role_module_permissions (organization_id, role, module_code, can_read, can_write)
values ('3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8','Taquilla','calendario', true, false)
on conflict (organization_id, role, module_code) do update set can_read=true, can_write=false;

update public.role_module_permissions
set can_write=false
where organization_id='3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8' and role='Taquilla' and module_code='cursosVerano';
;
