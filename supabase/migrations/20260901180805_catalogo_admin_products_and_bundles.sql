-- Admin de catalogo (productos + kits) para Presidencia. No existia ningun CRUD para
-- app.products/app.product_bundles: hoy solo se pueden dar de alta por SQL directo.
--
-- Fix importante: los kits existentes referencian sus piezas por components->>'productId'
-- usando el legacy_id (texto de la migracion desde el sistema anterior), no el id real
-- (uuid) de app.products. Los productos NUEVOS que se creen desde este admin no van a
-- tener legacy_id. Por eso las funciones que resuelven piezas de un kit (publicas y la
-- nueva de catalogo) ahora aceptan CUALQUIERA de los dos: id real O legacy_id. Los kits
-- viejos siguen funcionando igual; los kits nuevos usan directamente el id real.

create or replace function private.slugify(p_text text)
returns text
language sql
immutable
as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        lower(translate(trim(coalesce(p_text,'')),'áéíóúüñÁÉÍÓÚÜÑ','aeiouunAEIOUUN')),
      '[^a-z0-9]+','-','g'),
    '(^-+|-+$)','','g'),
  '')
$$;

-- ===== Lectura del catalogo completo (productos + kits, con margen calculado) =====
create or replace function private.query_catalog(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path='pg_catalog','app','private'
as $$
declare v_products jsonb; v_bundles jsonb;
begin
  if not private.has_module_access(p_organization_id,'commerce',false) then raise exception 'Not authorized'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'name',p.name,'sku',p.sku,'slug',p.slug,'category',p.category,'description',p.description,
    'price',p.price,'cost',p.cost,'sizes',p.sizes,'active',p.active,'archived',p.archived_at is not null,
    'leadDays',p.lead_days,'legacyId',p.legacy_id,
    'marginPercent',case when p.price>0 and p.cost is not null then round(((p.price-p.cost)/p.price)*100,2) else null end
  ) order by p.name),'[]'::jsonb) into v_products
  from app.products p where p.organization_id=p_organization_id and p.product_type='product';

  with comp as (
    select b.id as bundle_id,
      coalesce(sum(coalesce(pr.cost,0)*greatest(1,least(20,coalesce((c->>'qty')::int,1)))),0) as cost_total,
      bool_and(pr.cost is not null) as cost_complete,
      bool_and(pr.id is not null) as components_resolved,
      coalesce(jsonb_agg(jsonb_build_object(
        'productId',coalesce(pr.id::text,c->>'productId'),'name',coalesce(pr.name,'(producto no encontrado)'),
        'qty',greatest(1,least(20,coalesce((c->>'qty')::int,1))),'unitCost',pr.cost,'unitPrice',pr.price,'active',coalesce(pr.active,false)
      ) order by coalesce(pr.name,'')) filter (where c is not null),'[]'::jsonb) as pieces
    from app.product_bundles b
    left join lateral jsonb_array_elements(b.components) c on true
    left join app.products pr on pr.organization_id=b.organization_id and (pr.id::text=c->>'productId' or pr.legacy_id=c->>'productId')
    where b.organization_id=p_organization_id
    group by b.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',b.id,'name',b.name,'description',b.description,'priceAdult',b.price_adult,'priceKid',b.price_kid,
    'active',b.active,'archived',b.archived_at is not null,'validUntil',b.valid_until,'notes',b.notes,
    'components',coalesce(comp.pieces,'[]'::jsonb),'costTotal',coalesce(comp.cost_total,0),'costComplete',coalesce(comp.cost_complete,false),
    'componentsResolved',coalesce(comp.components_resolved,false),
    'marginAdultPercent',case when coalesce(b.price_adult,0)>0 and coalesce(comp.cost_complete,false) then round(((b.price_adult-comp.cost_total)/b.price_adult)*100,2) else null end,
    'marginKidPercent',case when coalesce(b.price_kid,0)>0 and coalesce(comp.cost_complete,false) then round(((b.price_kid-comp.cost_total)/b.price_kid)*100,2) else null end
  ) order by b.name),'[]'::jsonb) into v_bundles
  from app.product_bundles b left join comp on comp.bundle_id=b.id
  where b.organization_id=p_organization_id;

  return jsonb_build_object('products',v_products,'bundles',v_bundles);
end
$$;

-- ===== Productos =====
create or replace function private.command_upsert_product(
  p_organization_id uuid, p_id uuid, p_name text, p_sku text, p_category text,
  p_price numeric, p_cost numeric, p_sizes jsonb, p_active boolean,
  p_description text default null, p_lead_days integer default null
) returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','app','private'
as $$
declare
  v_row app.products%rowtype;
  v_actor uuid:=(select auth.uid());
  v_base text; v_slug text; v_n int:=0; v_sku text;
begin
  if not private.is_presidency(p_organization_id) then raise exception 'Solo Presidencia puede editar el catálogo'; end if;
  if coalesce(length(trim(p_name)),0)<2 then raise exception 'El nombre del producto es obligatorio'; end if;
  if p_price is null or p_price<0 then raise exception 'El precio debe ser mayor o igual a 0'; end if;
  if p_cost is not null and p_cost<0 then raise exception 'El costo no puede ser negativo'; end if;
  if jsonb_typeof(coalesce(p_sizes,'[]'::jsonb))<>'array' then raise exception 'Tallas inválidas'; end if;
  v_sku:=nullif(trim(coalesce(p_sku,'')),'');
  if v_sku is not null and exists(select 1 from app.products where organization_id=p_organization_id and sku=v_sku and id is distinct from p_id) then
    raise exception 'Ya existe un producto con ese SKU';
  end if;

  if p_id is not null then
    select * into v_row from app.products where id=p_id and organization_id=p_organization_id for update;
    if not found then raise exception 'Producto no encontrado'; end if;
    update app.products set
      name=trim(p_name), sku=v_sku, category=nullif(trim(coalesce(p_category,'')),''),
      price=p_price, cost=p_cost, sizes=coalesce(p_sizes,'[]'::jsonb), active=coalesce(p_active,true),
      description=nullif(trim(coalesce(p_description,'')),''), lead_days=p_lead_days, updated_at=now()
    where id=p_id and organization_id=p_organization_id
    returning * into v_row;
    insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
      values(p_organization_id,'ProductUpdated','product',v_row.id,jsonb_build_object('name',v_row.name,'price',v_row.price,'cost',v_row.cost),v_actor);
  else
    v_base:=coalesce(private.slugify(p_name),'producto'); v_slug:=v_base;
    while exists(select 1 from app.products where organization_id=p_organization_id and slug=v_slug) loop
      v_n:=v_n+1; v_slug:=v_base||'-'||v_n;
    end loop;
    insert into app.products(organization_id,name,slug,sku,category,price,cost,sizes,active,description,lead_days,product_type)
    values(p_organization_id,trim(p_name),v_slug,v_sku,nullif(trim(coalesce(p_category,'')),''),p_price,p_cost,coalesce(p_sizes,'[]'::jsonb),coalesce(p_active,true),nullif(trim(coalesce(p_description,'')),''),p_lead_days,'product')
    returning * into v_row;
    insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
      values(p_organization_id,'ProductCreated','product',v_row.id,jsonb_build_object('name',v_row.name,'price',v_row.price,'cost',v_row.cost),v_actor);
  end if;
  return to_jsonb(v_row);
end
$$;

create or replace function private.command_set_product_archived(p_organization_id uuid,p_id uuid,p_archived boolean)
returns void
language plpgsql
security definer
set search_path='pg_catalog','app','private'
as $$
begin
  if not private.is_presidency(p_organization_id) then raise exception 'Solo Presidencia puede editar el catálogo'; end if;
  update app.products set archived_at=case when p_archived then now() else null end, active=case when p_archived then false else active end, updated_at=now()
  where id=p_id and organization_id=p_organization_id;
  if not found then raise exception 'Producto no encontrado'; end if;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
    values(p_organization_id,case when p_archived then 'ProductArchived' else 'ProductRestored' end,'product',p_id,'{}'::jsonb,(select auth.uid()));
end
$$;

-- ===== Kits =====
create or replace function private.command_upsert_bundle(
  p_organization_id uuid, p_id uuid, p_name text, p_description text,
  p_price_adult numeric, p_price_kid numeric, p_components jsonb,
  p_active boolean, p_valid_until date default null, p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','app','private'
as $$
declare
  v_row app.product_bundles%rowtype;
  v_actor uuid:=(select auth.uid());
  v_comp jsonb; v_pid uuid; v_qty int; v_clean jsonb:='[]'::jsonb;
begin
  if not private.is_presidency(p_organization_id) then raise exception 'Solo Presidencia puede editar el catálogo'; end if;
  if coalesce(length(trim(p_name)),0)<2 then raise exception 'El nombre del kit es obligatorio'; end if;
  if coalesce(p_price_adult,0)<=0 and coalesce(p_price_kid,0)<=0 then raise exception 'Captura al menos un precio (adulto o niño)'; end if;
  if jsonb_typeof(coalesce(p_components,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_components,'[]'::jsonb))=0 then raise exception 'El kit necesita al menos una pieza'; end if;

  for v_comp in select value from jsonb_array_elements(p_components) loop
    v_pid:=nullif(v_comp->>'productId','')::uuid;
    v_qty:=greatest(1,least(20,coalesce((v_comp->>'qty')::int,1)));
    if v_pid is null then raise exception 'Pieza de kit inválida'; end if;
    if not exists(select 1 from app.products where id=v_pid and organization_id=p_organization_id) then raise exception 'Una de las piezas no pertenece a tu catálogo'; end if;
    v_clean:=v_clean||jsonb_build_array(jsonb_build_object('productId',v_pid::text,'qty',v_qty));
  end loop;

  if p_id is not null then
    select * into v_row from app.product_bundles where id=p_id and organization_id=p_organization_id for update;
    if not found then raise exception 'Kit no encontrado'; end if;
    update app.product_bundles set
      name=trim(p_name), description=nullif(trim(coalesce(p_description,'')),''),
      price_adult=nullif(p_price_adult,0), price_kid=nullif(p_price_kid,0),
      components=v_clean, active=coalesce(p_active,true), valid_until=p_valid_until,
      notes=nullif(trim(coalesce(p_notes,'')),''), updated_at=now()
    where id=p_id and organization_id=p_organization_id
    returning * into v_row;
    insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
      values(p_organization_id,'BundleUpdated','product_bundle',v_row.id,jsonb_build_object('name',v_row.name,'priceAdult',v_row.price_adult,'priceKid',v_row.price_kid,'components',v_clean),v_actor);
  else
    insert into app.product_bundles(organization_id,name,description,price_adult,price_kid,components,active,valid_until,notes)
    values(p_organization_id,trim(p_name),nullif(trim(coalesce(p_description,'')),''),nullif(p_price_adult,0),nullif(p_price_kid,0),v_clean,coalesce(p_active,true),p_valid_until,nullif(trim(coalesce(p_notes,'')),''))
    returning * into v_row;
    insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
      values(p_organization_id,'BundleCreated','product_bundle',v_row.id,jsonb_build_object('name',v_row.name,'priceAdult',v_row.price_adult,'priceKid',v_row.price_kid,'components',v_clean),v_actor);
  end if;
  return to_jsonb(v_row);
end
$$;

create or replace function private.command_set_bundle_archived(p_organization_id uuid,p_id uuid,p_archived boolean)
returns void
language plpgsql
security definer
set search_path='pg_catalog','app','private'
as $$
begin
  if not private.is_presidency(p_organization_id) then raise exception 'Solo Presidencia puede editar el catálogo'; end if;
  update app.product_bundles set archived_at=case when p_archived then now() else null end, active=case when p_archived then false else active end, updated_at=now()
  where id=p_id and organization_id=p_organization_id;
  if not found then raise exception 'Kit no encontrado'; end if;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
    values(p_organization_id,case when p_archived then 'BundleArchived' else 'BundleRestored' end,'product_bundle',p_id,'{}'::jsonb,(select auth.uid()));
end
$$;

-- ===== Fix de compatibilidad: kits nuevos referencian el id real de app.products,
-- kits migrados siguen usando legacy_id. Ambas funciones publicas ahora aceptan los dos. =====
create or replace function private.public_offerings(p_public_key text)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','app','private'
as $$
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
        join app.products p on p.organization_id=x.organization_id and (p.id::text=c->>'productId' or p.legacy_id=c->>'productId') and p.active=true and p.archived_at is null),0) available_units,
      coalesce((select jsonb_agg(jsonb_build_object(
        'legacyProductId',c->>'productId','productId',p.id,'name',coalesce(p.name,c->>'name','Prenda'),
        'qty',greatest(1,least(20,coalesce((c->>'qty')::int,1))),'sizes',coalesce(p.sizes,'[]'::jsonb),'active',coalesce(p.active,false) and p.archived_at is null
      ) order by coalesce(p.name,c->>'name','Prenda'))
      from jsonb_array_elements(x.components) c
      left join app.products p on p.organization_id=x.organization_id and (p.id::text=c->>'productId' or p.legacy_id=c->>'productId')),'[]'::jsonb) resolved_components
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
end
$$;

create or replace function private.public_create_bundle_order_enhanced(
  p_public_key text, p_bundle_id uuid, p_tier text, p_customer_name text, p_customer_phone text,
  p_customer_email text, p_pieces jsonb, p_personalization_name text, p_number text, p_notes text, p_consent jsonb
) returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','app','private'
as $$
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
    select * into v_product from app.products where organization_id=v_org and (legacy_id=v_legacy or id::text=v_legacy) and active=true and archived_at is null;
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
    select * into v_product from app.products where organization_id=v_org and (legacy_id=v_legacy or id::text=v_legacy) and active=true and archived_at is null;
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
end
$$;

-- ===== Wrappers publicos =====
grant execute on function private.query_catalog(uuid) to anon, authenticated, postgres, service_role;
grant execute on function private.command_upsert_product(uuid,uuid,text,text,text,numeric,numeric,jsonb,boolean,text,integer) to anon, authenticated, postgres, service_role;
grant execute on function private.command_set_product_archived(uuid,uuid,boolean) to anon, authenticated, postgres, service_role;
grant execute on function private.command_upsert_bundle(uuid,uuid,text,text,numeric,numeric,jsonb,boolean,date,text) to anon, authenticated, postgres, service_role;
grant execute on function private.command_set_bundle_archived(uuid,uuid,boolean) to anon, authenticated, postgres, service_role;

create or replace function public.v2_catalog(organization_id uuid)
returns jsonb language sql security definer set search_path='pg_catalog','private' as $$
  select private.query_catalog(organization_id)
$$;
grant execute on function public.v2_catalog(uuid) to authenticated, postgres, service_role;

create or replace function public.v2_upsert_product(organization_id uuid, id uuid, name text, sku text, category text, price numeric, cost numeric, sizes jsonb, active boolean, description text default null, lead_days integer default null)
returns jsonb language sql security definer set search_path='pg_catalog','private' as $$
  select private.command_upsert_product(organization_id,id,name,sku,category,price,cost,sizes,active,description,lead_days)
$$;
grant execute on function public.v2_upsert_product(uuid,uuid,text,text,text,numeric,numeric,jsonb,boolean,text,integer) to authenticated, postgres, service_role;

create or replace function public.v2_set_product_archived(organization_id uuid, id uuid, archived boolean)
returns void language sql security definer set search_path='pg_catalog','private' as $$
  select private.command_set_product_archived(organization_id,id,archived)
$$;
grant execute on function public.v2_set_product_archived(uuid,uuid,boolean) to authenticated, postgres, service_role;

create or replace function public.v2_upsert_bundle(organization_id uuid, id uuid, name text, description text, price_adult numeric, price_kid numeric, components jsonb, active boolean, valid_until date default null, notes text default null)
returns jsonb language sql security definer set search_path='pg_catalog','private' as $$
  select private.command_upsert_bundle(organization_id,id,name,description,price_adult,price_kid,components,active,valid_until,notes)
$$;
grant execute on function public.v2_upsert_bundle(uuid,uuid,text,text,numeric,numeric,jsonb,boolean,date,text) to authenticated, postgres, service_role;

create or replace function public.v2_set_bundle_archived(organization_id uuid, id uuid, archived boolean)
returns void language sql security definer set search_path='pg_catalog','private' as $$
  select private.command_set_bundle_archived(organization_id,id,archived)
$$;
grant execute on function public.v2_set_bundle_archived(uuid,uuid,boolean) to authenticated, postgres, service_role;;
