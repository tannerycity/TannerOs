create or replace function private.query_order_readiness(p_organization_id uuid,p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path='pg_catalog','app','private'
as $$
begin
  if not private.has_module_access(p_organization_id,'commerce',false) then raise exception 'Not authorized'; end if;
  return private.order_readiness(p_organization_id,p_order_id);
end
$$;

create or replace function private.query_order_detail(p_organization_id uuid,p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path='pg_catalog','app','private'
as $$
declare
  v_order jsonb;
  v_items jsonb;
  v_payments jsonb;
  v_paid numeric;
  v_readiness jsonb;
begin
  if not private.has_module_access(p_organization_id,'commerce',false) then raise exception 'Not authorized'; end if;
  select to_jsonb(o) into v_order from app.orders o where o.id=p_order_id and o.organization_id=p_organization_id;
  if v_order is null then raise exception 'Order not found'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',i.id,'productId',i.product_id,'description',i.description,'quantity',i.quantity,
    'unitPrice',i.unit_price,'unitCost',i.unit_cost,'attributes',i.attributes
  ) order by i.id),'[]'::jsonb)
  into v_items from app.order_items i where i.order_id=p_order_id and i.organization_id=p_organization_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'amount',op.amount,'paymentDate',p.payment_date,'method',p.method,
    'reference',p.reference,'status',p.status,'createdAt',op.created_at
  ) order by op.created_at,p.id),'[]'::jsonb)
  into v_payments
  from app.order_payments op
  join app.payments p on p.id=op.payment_id and p.organization_id=op.organization_id
  where op.organization_id=p_organization_id and op.order_id=p_order_id;
  v_paid:=private.order_paid_amount(p_organization_id,p_order_id);
  v_readiness:=private.order_readiness(p_organization_id,p_order_id);
  return jsonb_build_object(
    'order',v_order,'items',v_items,'payments',v_payments,
    'paidAmount',v_paid,'balance',greatest(0,coalesce((v_order->>'total')::numeric,0)-v_paid),
    'readiness',v_readiness
  );
end
$$;

create or replace function public.v2_order_readiness(organization_id uuid,order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path='pg_catalog','private'
as $$ select private.query_order_readiness(organization_id,order_id) $$;

create or replace function public.v2_post_order_payment(
  organization_id uuid,order_id uuid,amount numeric,payment_date date,method text,reference text,payer_name text,idempotency_key text
)
returns uuid
language sql
security definer
set search_path='pg_catalog','private'
as $$ select private.command_post_order_payment(organization_id,order_id,amount,payment_date,method,reference,payer_name,idempotency_key) $$;

create or replace function public.v2_set_order_discount(organization_id uuid,order_id uuid,discount numeric,reason text)
returns jsonb
language sql
security definer
set search_path='pg_catalog','private'
as $$ select private.command_set_order_discount(organization_id,order_id,discount,reason) $$;

revoke all on function public.v2_order_readiness(uuid,uuid) from public,anon;
revoke all on function public.v2_post_order_payment(uuid,uuid,numeric,date,text,text,text,text) from public,anon;
revoke all on function public.v2_set_order_discount(uuid,uuid,numeric,text) from public,anon;
grant execute on function public.v2_order_readiness(uuid,uuid) to authenticated;
grant execute on function public.v2_post_order_payment(uuid,uuid,numeric,date,text,text,text,text) to authenticated;
grant execute on function public.v2_set_order_discount(uuid,uuid,numeric,text) to authenticated;;
