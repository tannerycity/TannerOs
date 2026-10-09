-- d3 · Carrito en el link público: kits y piezas en un solo folio
--
-- Pedido de Presidencia (09/10/2026): el link de la tienda sólo levantaba UNA
-- cosa por pedido. Kit + calcetas extra eran dos folios, dos confirmaciones y
-- dos depósitos. El portal de familias ya tenía carrito (portal_place_order);
-- esto es la misma lógica de renglones para quien no tiene cuenta:
--   · un kit exige TODAS sus piezas con talla, y su precio se reparte entre
--     ellas en proporción a lo que vale cada una suelta (la última se lleva el
--     resto, así la suma da exacto el precio del kit);
--   · una pieza suelta lleva talla, cantidad (1 a 20) y, si es jersey, nombre
--     y número;
--   · máximo 20 renglones.
-- Lo del link: club por llave pública, límite de pedidos por hora,
-- consentimiento de datos con versión y teléfono obligatorio. El folio es el
-- consecutivo del club y el aviso al staff lo da el trigger de a3.
create or replace function private.public_create_cart_order(
  p_public_key text, p_customer_name text, p_customer_phone text, p_customer_email text,
  p_items jsonb, p_notes text, p_consent jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid; v_phone text; v_order_id uuid; v_folio text; it jsonb;
  v_product app.products; v_qty integer; v_subtotal numeric := 0; v_talla text; v_count integer := 0;
  v_bundle app.product_bundles%rowtype;
  v_tier text; v_price numeric; v_comp jsonb; v_comp_legacy text; v_comp_qty int;
  v_sent_count int; v_piece jsonb; v_expected int;
  v_total_weight numeric; v_remaining_weight numeric; v_remaining_price numeric;
  v_unit_index int; v_unit_price numeric; v_is_jersey boolean;
  v_nombre text; v_numero text; v_kind text;
begin
  perform private.enforce_public_rate_limit('order', 15, interval '1 hour');
  v_org := private.public_organization(p_public_key);
  if v_org is null or not private.module_enabled(v_org, 'commerce') then raise exception 'Ordering unavailable'; end if;
  if coalesce(length(trim(p_customer_name)), 0) < 2 then raise exception 'Customer name required'; end if;
  if coalesce((p_consent->>'dataAccepted')::boolean, false) is distinct from true then raise exception 'Privacy consent required'; end if;
  if coalesce(length(trim(p_consent->>'privacyNoticeVersion')), 0) < 4 then raise exception 'Privacy notice version required'; end if;
  v_phone := private.normalize_public_phone(p_customer_phone);
  if v_phone is null then raise exception 'Phone required'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0
    then raise exception 'Order needs at least one item'; end if;
  if jsonb_array_length(p_items) > 20 then raise exception 'Too many items'; end if;

  v_folio := private.next_order_folio(v_org);
  insert into app.orders(organization_id, folio, customer_name, customer_phone, customer_email,
                         subtotal, discount, total, status, source, notes, consent, created_at, updated_at)
  values(v_org, v_folio, trim(p_customer_name), v_phone, nullif(lower(trim(coalesce(p_customer_email, ''))), ''),
         0, 0, 0, 'pending_payment', 'public_form', nullif(btrim(coalesce(p_notes, '')), ''),
         coalesce(p_consent, '{}'::jsonb), now(), now())
  returning id into v_order_id;

  for it in select value from jsonb_array_elements(p_items) loop
    v_count := v_count + 1;
    v_kind := coalesce(nullif(it->>'kind', ''), 'product');
    v_nombre := nullif(btrim(coalesce(it->>'personalizationName', '')), '');
    v_numero := nullif(regexp_replace(btrim(coalesce(it->>'number', '')), '^0+', ''), '');
    if v_numero is not null and v_numero !~ '^[0-9]{1,3}$' then raise exception 'El número va de 1 a 999 (línea %)', v_count; end if;

    if v_kind = 'bundle' then
      select * into v_bundle from app.product_bundles
        where id = nullif(it->>'bundleId', '')::uuid and organization_id = v_org
          and active and archived_at is null and (valid_until is null or valid_until >= current_date)
        for share;
      if not found then raise exception 'Kit no disponible (línea %)', v_count; end if;

      v_tier := case when lower(btrim(coalesce(it->>'tier', ''))) in ('niño', 'nino', 'kid') then 'Niño'
                     when lower(btrim(coalesce(it->>'tier', ''))) in ('adulto', 'adult') then 'Adulto'
                     else null end;
      if v_tier is null then raise exception 'Indica adulto o niño para el kit (línea %)', v_count; end if;
      v_price := case when v_tier = 'Niño' and coalesce(v_bundle.price_kid, 0) > 0 then v_bundle.price_kid else v_bundle.price_adult end;
      if coalesce(v_price, 0) <= 0 then raise exception 'El kit no tiene precio para ese tipo (línea %)', v_count; end if;
      if jsonb_typeof(coalesce(it->'pieces', '[]'::jsonb)) <> 'array' then raise exception 'Piezas de kit inválidas (línea %)', v_count; end if;

      v_expected := 0; v_total_weight := 0;
      for v_comp in select value from jsonb_array_elements(v_bundle.components) loop
        v_comp_legacy := v_comp->>'productId';
        v_comp_qty := greatest(1, least(20, coalesce((v_comp->>'qty')::int, 1)));
        select * into v_product from app.products
          where organization_id = v_org and (id::text = v_comp_legacy or legacy_id = v_comp_legacy)
            and active and archived_at is null;
        if not found then raise exception 'El kit incluye un producto no disponible (línea %)', v_count; end if;
        v_expected := v_expected + v_comp_qty;
        v_total_weight := v_total_weight + (coalesce(v_product.price, 0) * v_comp_qty);
        select count(*) into v_sent_count from jsonb_array_elements(it->'pieces') x
          where coalesce(x->>'productId', '') = v_product.id::text;
        if v_sent_count <> v_comp_qty then raise exception 'Faltan tallas de una pieza del kit (línea %)', v_count; end if;
      end loop;
      if v_expected = 0 or v_total_weight <= 0 then raise exception 'El kit no tiene composición válida (línea %)', v_count; end if;

      v_remaining_weight := v_total_weight; v_remaining_price := v_price; v_unit_index := 0;
      for v_comp in select value from jsonb_array_elements(v_bundle.components) loop
        v_comp_legacy := v_comp->>'productId';
        select * into v_product from app.products
          where organization_id = v_org and (id::text = v_comp_legacy or legacy_id = v_comp_legacy)
            and active and archived_at is null;
        v_is_jersey := v_product.name ~* 'jersey|uniforme|playera';
        for v_piece in select value from jsonb_array_elements(it->'pieces') x
          where coalesce(x->>'productId', '') = v_product.id::text loop
          v_unit_index := v_unit_index + 1;
          v_talla := nullif(btrim(coalesce(v_piece->>'talla', '')), '');
          if v_talla is null then raise exception 'Falta la talla de una pieza del kit (línea %)', v_count; end if;
          if v_unit_index = v_expected then v_unit_price := v_remaining_price;
          else v_unit_price := round(v_remaining_price * (coalesce(v_product.price, 0) / v_remaining_weight), 2); end if;

          insert into app.order_items(organization_id, order_id, product_id, description, quantity, unit_price, unit_cost, attributes)
          values(v_org, v_order_id, v_product.id, v_product.name, 1, v_unit_price, v_product.cost,
            jsonb_strip_nulls(jsonb_build_object(
              'talla', v_talla, 'size', v_talla,
              'nombrePers', case when v_is_jersey then v_nombre else null end,
              'numero', case when v_is_jersey then v_numero else null end,
              'bundleId', v_bundle.id, 'bundleName', v_bundle.name, 'bundleTier', v_tier)));

          v_remaining_price := v_remaining_price - v_unit_price;
          v_remaining_weight := v_remaining_weight - coalesce(v_product.price, 0);
        end loop;
      end loop;
      v_subtotal := v_subtotal + v_price;

    else
      select * into v_product from app.products
        where id = nullif(it->>'productId', '')::uuid
          and organization_id = v_org and active and archived_at is null;
      if v_product.id is null then raise exception 'Producto no disponible (línea %)', v_count; end if;
      v_qty := greatest(1, least(20, coalesce((it->>'quantity')::integer, 1)));
      v_talla := nullif(btrim(coalesce(it->>'talla', '')), '');
      v_is_jersey := v_product.name ~* 'jersey|uniforme|playera';

      insert into app.order_items(organization_id, order_id, product_id, description, quantity, unit_price, unit_cost, attributes)
      values(v_org, v_order_id, v_product.id, v_product.name, v_qty, v_product.price, v_product.cost,
        jsonb_strip_nulls(jsonb_build_object(
          'talla', v_talla, 'size', v_talla,
          'nombrePers', case when v_is_jersey then v_nombre else null end,
          'numero', case when v_is_jersey then v_numero else null end)));
      v_subtotal := v_subtotal + (v_product.price * v_qty);
    end if;
  end loop;

  update app.orders set subtotal = v_subtotal, total = v_subtotal, updated_at = now() where id = v_order_id;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload)
  values(v_org, 'OrderCreated', 'order', v_order_id,
         jsonb_build_object('folio', v_folio, 'total', v_subtotal, 'source', 'public_form', 'lines', v_count));
  return jsonb_build_object('id', v_order_id, 'folio', v_folio, 'total', v_subtotal, 'items', v_count);
end
$$;
revoke all on function private.public_create_cart_order(text, text, text, text, jsonb, text, jsonb) from public, anon;

create or replace function public.v2_public_cart_order(
  club_key text, customer_name text, customer_phone text, customer_email text,
  items jsonb, notes text, consent jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$ select private.public_create_cart_order(club_key, customer_name, customer_phone, customer_email, items, notes, consent) $$;
revoke all on function public.v2_public_cart_order(text, text, text, text, jsonb, text, jsonb) from public;
grant execute on function public.v2_public_cart_order(text, text, text, text, jsonb, text, jsonb) to anon, authenticated;
