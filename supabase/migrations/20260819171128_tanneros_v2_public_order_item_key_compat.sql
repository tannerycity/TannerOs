create or replace function private.public_create_order(p_public_key text, p_customer_name text, p_customer_phone text, p_customer_email text, p_items jsonb, p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, app, private
as $$
declare
  v_org uuid;
  v_order uuid;
  v_folio text;
  v_subtotal numeric:=0;
  r record;
  v_qty integer;
  v_attrs jsonb;
  v_product_id uuid;
begin
  perform private.enforce_public_rate_limit('order',15,interval '1 hour');
  v_org:=private.public_organization(p_public_key);
  if v_org is null or not private.module_enabled(v_org,'commerce') then raise exception 'Ordering unavailable'; end if;
  if coalesce(length(trim(p_customer_name)),0)<2 then raise exception 'Customer name required'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>20 then raise exception 'Invalid items'; end if;

  v_folio:=private.next_order_folio(v_org);
  insert into app.orders(organization_id,folio,customer_name,customer_phone,customer_email,subtotal,discount,total,status,source,notes,created_at,updated_at)
  values(v_org,v_folio,trim(p_customer_name),nullif(trim(p_customer_phone),''),nullif(lower(trim(p_customer_email)),''),0,0,0,'pending_payment','public_form',p_notes,now(),now())
  returning id into v_order;

  for r in select value as item from jsonb_array_elements(p_items)
  loop
    v_qty:=greatest(1,least(99,coalesce((r.item->>'quantity')::integer,1)));
    v_attrs:=coalesce(r.item->'attributes','{}'::jsonb);
    v_product_id:=coalesce(nullif(r.item->>'product_id','')::uuid,nullif(r.item->>'productId','')::uuid);
    if v_product_id is null then raise exception 'Invalid product'; end if;

    insert into app.order_items(organization_id,order_id,product_id,description,quantity,unit_price,unit_cost,attributes)
    select v_org,v_order,p.id,p.name,v_qty,p.price,p.cost,v_attrs
    from app.products p
    where p.id=v_product_id and p.organization_id=v_org and p.active=true and p.archived_at is null;
    if not found then raise exception 'Invalid product'; end if;
  end loop;

  select coalesce(sum(quantity*unit_price),0) into v_subtotal from app.order_items where order_id=v_order;
  update app.orders set subtotal=v_subtotal,total=v_subtotal,updated_at=now() where id=v_order;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload)
  values(v_org,'OrderCreated','order',v_order,jsonb_build_object('folio',v_folio,'total',v_subtotal,'source','public_form'));
  return jsonb_build_object('id',v_order,'folio',v_folio,'total',v_subtotal);
end
$$;;
