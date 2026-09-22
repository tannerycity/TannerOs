create or replace function private.public_offerings(p_public_key text)
returns jsonb language plpgsql security definer set search_path='pg_catalog','app','private' as $$
declare v_org uuid; v_products jsonb; v_bundles jsonb;
begin
  perform private.enforce_public_rate_limit('catalog',120,interval '1 hour');
  v_org:=private.public_organization(p_public_key);
  if v_org is null or not private.module_enabled(v_org,'commerce') then raise exception 'Catalog unavailable'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'kind','product','sku',p.sku,'slug',p.slug,'name',p.name,'description',p.description,'type',p.product_type,'category',p.category,
    'price',p.price,'stock',p.stock,'sizes',p.sizes,'attributes',p.attributes,'leadDays',p.lead_days,'available',true
  ) order by p.name),'[]'::jsonb) into v_products
  from app.products p where p.organization_id=v_org and p.active=true and p.archived_at is null;

  with b as (
    select x.*,
      coalesce((select sum(greatest(1,least(20,coalesce((c->>'qty')::int,1)))) from jsonb_array_elements(x.components) c),0) expected_units,
      coalesce((select sum(greatest(1,least(20,coalesce((c->>'qty')::int,1))))
        from jsonb_array_elements(x.components) c
        join app.products p on p.organization_id=x.organization_id and p.legacy_id=c->>'productId' and p.active=true and p.archived_at is null),0) available_units,
      coalesce((select jsonb_agg(jsonb_build_object(
        'legacyProductId',c->>'productId','productId',p.id,'name',coalesce(p.name,c->>'name','Prenda'),
        'qty',greatest(1,least(20,coalesce((c->>'qty')::int,1))),'sizes',coalesce(p.sizes,'[]'::jsonb),'active',coalesce(p.active,false) and p.archived_at is null
      ) order by coalesce(p.name,c->>'name','Prenda'))
      from jsonb_array_elements(x.components) c
      left join app.products p on p.organization_id=x.organization_id and p.legacy_id=c->>'productId'),'[]'::jsonb) resolved_components
    from app.product_bundles x
    where x.organization_id=v_org and x.active=true and x.archived_at is null and (x.valid_until is null or x.valid_until>=current_date)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',b.id,'legacyId',b.legacy_id,'kind','bundle','name',b.name,'description',b.description,'priceAdult',b.price_adult,'priceKid',b.price_kid,
    'components',b.resolved_components,'available',(b.expected_units>0 and b.expected_units=b.available_units),
    'blockedReason',case when b.expected_units=0 then 'Paquete sin componentes' when b.expected_units<>b.available_units then 'Incluye una prenda fuera del catálogo V2' else null end,
    'validUntil',b.valid_until
  ) order by b.name),'[]'::jsonb) into v_bundles from b;
  return jsonb_build_object('products',v_products,'bundles',v_bundles);
end $$;

create or replace function private.public_create_bundle_order_enhanced(
  p_public_key text,p_bundle_id uuid,p_tier text,p_customer_name text,p_customer_phone text,p_customer_email text,
  p_pieces jsonb,p_personalization_name text,p_number text,p_notes text,p_consent jsonb
) returns jsonb language plpgsql security definer set search_path='pg_catalog','app','private' as $$
declare
  v_org uuid; v_bundle app.product_bundles%rowtype; v_phone text; v_tier text; v_price numeric; v_order uuid; v_folio text;
  v_expected integer:=0; v_piece_count integer:=0; v_total_weight numeric:=0; v_remaining_weight numeric:=0; v_remaining_price numeric:=0;
  v_total_units integer:=0; v_unit_index integer:=0; v_qty integer; v_legacy text; v_product app.products%rowtype; v_piece jsonb; v_unit_price numeric;
begin
  perform private.enforce_public_rate_limit('order',15,interval '1 hour');
  v_org:=private.public_organization(p_public_key);
  if v_org is null or not private.module_enabled(v_org,'commerce') then raise exception 'Ordering unavailable'; end if;
  if coalesce(length(trim(p_customer_name)),0)<2 then raise exception 'Customer name required'; end if;
  if coalesce((p_consent->>'dataAccepted')::boolean,false) is distinct from true then raise exception 'Privacy consent required'; end if;
  if coalesce(length(trim(p_consent->>'privacyNoticeVersion')),0)<4 then raise exception 'Privacy notice version required'; end if;
  v_phone:=private.normalize_public_phone(p_customer_phone); if v_phone is null then raise exception 'Phone required'; end if;
  if jsonb_typeof(p_pieces)<>'array' then raise exception 'Bundle pieces must be an array'; end if;
  select * into v_bundle from app.product_bundles where id=p_bundle_id and organization_id=v_org and active=true and archived_at is null and (valid_until is null or valid_until>=current_date) for share;
  if not found then raise exception 'Bundle unavailable'; end if;
  v_tier:=case when lower(trim(coalesce(p_tier,''))) in ('kid','niño','nino') then 'Niño' when lower(trim(coalesce(p_tier,''))) in ('adult','adulto') then 'Adulto' else null end;
  if v_tier is null then raise exception 'Bundle tier required'; end if;
  v_price:=case when v_tier='Niño' and coalesce(v_bundle.price_kid,0)>0 then v_bundle.price_kid else v_bundle.price_adult end;
  if coalesce(v_price,0)<=0 then raise exception 'Bundle price unavailable'; end if;

  for v_piece in select value from jsonb_array_elements(v_bundle.components) loop
    v_legacy:=v_piece->>'productId'; v_qty:=greatest(1,least(20,coalesce((v_piece->>'qty')::int,1)));
    select * into v_product from app.products where organization_id=v_org and legacy_id=v_legacy and active=true and archived_at is null;
    if not found then raise exception 'Bundle includes unavailable product'; end if;
    v_expected:=v_expected+v_qty; v_total_weight:=v_total_weight+(coalesce(v_product.price,0)*v_qty);
    select count(*) into v_piece_count from jsonb_array_elements(p_pieces) x
      where coalesce(x->>'legacyProductId',x->>'legacy_product_id',x->>'productId')=v_legacy;
    if v_piece_count<>v_qty then raise exception 'Bundle piece count mismatch'; end if;
  end loop;
  if v_expected=0 or v_expected>30 or jsonb_array_length(p_pieces)<>v_expected then raise exception 'Invalid bundle pieces'; end if;
  if v_total_weight<=0 then raise exception 'Bundle component prices unavailable'; end if;

  v_folio:=private.next_order_folio(v_org);
  insert into app.orders(organization_id,folio,customer_name,customer_phone,customer_email,subtotal,discount,total,status,source,notes,consent,metadata,created_at,updated_at)
  values(v_org,v_folio,trim(p_customer_name),v_phone,nullif(lower(trim(p_customer_email)),''),v_price,0,v_price,'pending_payment','public_form_bundle',nullif(trim(coalesce(p_notes,'')),''),coalesce(p_consent,'{}'::jsonb),jsonb_build_object('bundleId',v_bundle.id,'bundleLegacyId',v_bundle.legacy_id,'bundleName',v_bundle.name,'tier',v_tier),now(),now()) returning id into v_order;

  v_remaining_weight:=v_total_weight; v_remaining_price:=v_price;
  for v_piece in select value from jsonb_array_elements(v_bundle.components) loop
    v_legacy:=v_piece->>'productId'; v_qty:=greatest(1,least(20,coalesce((v_piece->>'qty')::int,1)));
    select * into v_product from app.products where organization_id=v_org and legacy_id=v_legacy and active=true and archived_at is null;
    for v_piece in select value from jsonb_array_elements(p_pieces) x where coalesce(x->>'legacyProductId',x->>'legacy_product_id',x->>'productId')=v_legacy order by coalesce((x->>'slot')::int,0) loop
      v_unit_index:=v_unit_index+1;
      if nullif(trim(coalesce(v_piece->>'size',v_piece->>'talla','')),'') is null then raise exception 'Bundle piece size required'; end if;
      if v_unit_index=v_expected then v_unit_price:=v_remaining_price;
      else v_unit_price:=round(v_remaining_price*(coalesce(v_product.price,0)/v_remaining_weight),2); end if;
      insert into app.order_items(organization_id,order_id,product_id,description,quantity,unit_price,unit_cost,attributes)
      values(v_org,v_order,v_product.id,v_product.name,1,v_unit_price,v_product.cost,jsonb_build_object(
        'talla',trim(coalesce(v_piece->>'size',v_piece->>'talla')),'nombrePers',nullif(trim(coalesce(p_personalization_name,'')),''),'numero',nullif(trim(coalesce(p_number,'')),''),
        'obs',nullif(trim(coalesce(v_piece->>'notes','')),''),'bundleId',v_bundle.id,'bundleLegacyId',v_bundle.legacy_id,'bundleName',v_bundle.name,'bundleTier',v_tier,'bundleSlot',coalesce((v_piece->>'slot')::int,1)
      ));
      v_remaining_price:=v_remaining_price-v_unit_price; v_remaining_weight:=v_remaining_weight-coalesce(v_product.price,0);
    end loop;
  end loop;
  update app.orders set subtotal=(select coalesce(sum(quantity*unit_price),0) from app.order_items where order_id=v_order),total=(select coalesce(sum(quantity*unit_price),0) from app.order_items where order_id=v_order),updated_at=now() where id=v_order;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload)
  values(v_org,'BundleOrderCreated','order',v_order,jsonb_build_object('folio',v_folio,'bundleId',v_bundle.id,'bundleName',v_bundle.name,'tier',v_tier,'total',v_price,'pieceCount',v_expected,'source','public_form_bundle'));
  return jsonb_build_object('id',v_order,'folio',v_folio,'total',v_price,'bundle',v_bundle.name,'tier',v_tier,'pieceCount',v_expected);
end $$;

create or replace function public.v2_public_offerings(club_key text) returns jsonb language sql security definer set search_path='pg_catalog','private' as $$ select private.public_offerings(club_key) $$;
create or replace function public.v2_public_bundle_order(club_key text,bundle_id uuid,tier text,customer_name text,customer_phone text,customer_email text,pieces jsonb,personalization_name text,number text,notes text,consent jsonb)
returns jsonb language sql security definer set search_path='pg_catalog','private' as $$ select private.public_create_bundle_order_enhanced(club_key,bundle_id,tier,customer_name,customer_phone,customer_email,pieces,personalization_name,number,notes,consent) $$;
revoke all on function public.v2_public_offerings(text) from public;
revoke all on function public.v2_public_bundle_order(text,uuid,text,text,text,text,jsonb,text,text,text,jsonb) from public;
grant execute on function public.v2_public_offerings(text) to anon,authenticated;
grant execute on function public.v2_public_bundle_order(text,uuid,text,text,text,text,jsonb,text,text,text,jsonb) to anon,authenticated;;
