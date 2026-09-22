
-- El costo por pieza (unit_cost) se colaba sin filtro en items[], aunque costTotal/grossProfitExpected
-- ya estaban protegidos. Alguien con acceso a Pedidos pero sin commerce_finance podía calcular el margen
-- pieza por pieza comparando unitPrice vs unitCost. Se oculta igual que el resto de las cifras de rentabilidad.
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

  select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'productId',i.product_id,'description',i.description,'quantity',i.quantity,'unitPrice',i.unit_price,'unitCost',case when v_can_finance then i.unit_cost else null end,'attributes',i.attributes) order by i.id),'[]'::jsonb),
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
;
