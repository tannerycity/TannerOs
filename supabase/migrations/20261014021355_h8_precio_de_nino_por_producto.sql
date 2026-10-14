-- Precio de niño por producto (14/10/2026): "en todos los productos se puede
-- aplicar el precio adulto y precio niño... habrá algunos que no, pero que
-- tengamos checkbox". price_kid null = un solo precio (la casilla apagada).
-- Con precio de niño, una talla de la escala de niños (2 a 16) cobra ése; una
-- oferta no se suma encima: se cobra lo que le convenga más a la familia
-- ("uno u otro").
alter table app.products add column if not exists price_kid numeric;
alter table app.products drop constraint if exists products_price_kid_positivo;
alter table app.products add constraint products_price_kid_positivo check (price_kid is null or price_kid > 0);

create or replace function private.es_talla_nino(p_talla text)
returns boolean language sql immutable set search_path to '' as $$
  select btrim(coalesce(p_talla, '')) in ('2','4','6','8','10','12','14','16')
$$;

create or replace function private.precio_producto(p_product uuid, p_talla text)
returns numeric language sql stable security definer set search_path to '' as $$
  select case when p.price_kid is not null and private.es_talla_nino(p_talla)
              then least(p.price_kid, private.precio_vigente_producto(p.id, p.price))
              else private.precio_vigente_producto(p.id, p.price) end
  from app.products p where p.id = p_product
$$;
revoke all on function private.precio_producto(uuid, text) from public, anon;

create or replace function private.set_product_price_kid(p_organization_id uuid, p_product_id uuid, p_price_kid numeric)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','app','private' as $$
declare v_row app.products%rowtype; v_antes numeric;
begin
  if not private.can_edit_catalog(p_organization_id) then raise exception 'No tienes permiso para editar el catálogo'; end if;
  if p_price_kid is not null and p_price_kid <= 0 then raise exception 'El precio de niño debe ser mayor a 0'; end if;
  select price_kid into v_antes from app.products where id = p_product_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Producto no encontrado'; end if;
  update app.products set price_kid = p_price_kid, updated_at = now()
   where id = p_product_id and organization_id = p_organization_id returning * into v_row;
  if v_antes is distinct from p_price_kid then
    insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
    values (p_organization_id, 'ProductKidPriceChanged', 'product', p_product_id, jsonb_build_object('before', v_antes, 'after', p_price_kid), (select auth.uid()));
  end if;
  return jsonb_build_object('id', v_row.id, 'priceKid', v_row.price_kid);
end $$;
revoke all on function private.set_product_price_kid(uuid,uuid,numeric) from public, anon;

create or replace function public.v2_set_product_price_kid(organization_id uuid, product_id uuid, price_kid numeric)
returns jsonb language sql security definer set search_path to 'pg_catalog','private' as $$
  select private.set_product_price_kid(organization_id, product_id, price_kid)
$$;
revoke all on function public.v2_set_product_price_kid(uuid,uuid,numeric) from public, anon;
grant execute on function public.v2_set_product_price_kid(uuid,uuid,numeric) to authenticated;

do $$
declare f text; d text;
begin
  -- Cobrar: la pieza suelta usa el precio de su talla.
  foreach f in array array['private.public_create_cart_order(text,text,text,text,jsonb,text,jsonb)',
                           'private.portal_place_order(uuid,jsonb,text)',
                           'private.command_create_internal_order(uuid,text,text,text,text,jsonb,uuid)'] loop
    d := pg_get_functiondef(f::regprocedure);
    if position('precio_producto(' in d) = 0 then
      d := replace(d, 'private.precio_vigente_producto(v_product.id, v_product.price)', 'private.precio_producto(v_product.id, v_talla)');
      if position('precio_producto(' in d) = 0 then raise exception 'No se pudo parchar %', f; end if;
      execute d;
    end if;
  end loop;

  -- Leer: el precio de niño viaja con el producto.
  d := pg_get_functiondef('private.query_catalog(uuid)'::regprocedure);
  if position('''priceKid''' in d) = 0 then
    d := replace(d, '''price'',p.price,''oferta'',private.oferta_producto(p.id),', '''price'',p.price,''priceKid'',p.price_kid,''oferta'',private.oferta_producto(p.id),');
    if position('''priceKid''' in d) = 0 then raise exception 'No se pudo parchar query_catalog'; end if;
    execute d;
  end if;
  d := pg_get_functiondef('private.public_offerings(text)'::regprocedure);
  if position('''priceKid''' in d) = 0 then
    d := replace(d, '''photos'',p.photos,''photoPath''', '''priceKid'',p.price_kid,''photos'',p.photos,''photoPath''');
    if position('''priceKid''' in d) = 0 then raise exception 'No se pudo parchar public_offerings'; end if;
    execute d;
  end if;
  d := pg_get_functiondef('private.portal_catalog()'::regprocedure);
  if position('''price_kid'', p.price_kid' in d) = 0 then
    d := replace(d, '''photos'', p.photos, ''photo_path''', '''price_kid'', p.price_kid, ''photos'', p.photos, ''photo_path''');
    if position('''price_kid'', p.price_kid' in d) = 0 then raise exception 'No se pudo parchar portal_catalog'; end if;
    execute d;
  end if;
end $$;
