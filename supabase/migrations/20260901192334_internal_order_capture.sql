-- Captura rápida de pedidos para staff (Presidencia/Comercio autenticados) — reemplaza el
-- Excel+WhatsApp de hoy. Es una función NUEVA y separada de private.public_create_bundle_order_enhanced
-- (el checkout público de clientes): decidí NO tocar esa función porque sirve tráfico real de
-- clientes ahora mismo y el riesgo de una regresión ahí es alto. Aquí se duplica la lógica de
-- reparto proporcional del precio del kit entre sus piezas (misma fórmula, ya probada), pero con
-- autorización interna (has_module_access commerce write) en vez de public_key + consentimiento.
create or replace function private.command_create_internal_order(
  p_organization_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_notes text,
  p_lines jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := (select auth.uid());
  v_phone text;
  v_order uuid;
  v_folio text;
  v_line jsonb;
  v_line_index int := 0;
  v_bundle app.product_bundles%rowtype;
  v_tier text;
  v_price numeric;
  v_comp jsonb;
  v_comp_legacy text;
  v_comp_qty int;
  v_sent_count int;
  v_product app.products%rowtype;
  v_piece jsonb;
  v_expected int;
  v_total_weight numeric;
  v_remaining_weight numeric;
  v_remaining_price numeric;
  v_unit_index int;
  v_unit_price numeric;
  v_talla text;
  v_is_jersey boolean;
  v_prod_id uuid;
  v_qty int;
begin
  if not private.has_module_access(p_organization_id,'commerce',true) then
    raise exception 'Not authorized';
  end if;
  if coalesce(length(trim(p_customer_name)),0) < 2 then
    raise exception 'El nombre del cliente es obligatorio';
  end if;
  v_phone := private.normalize_public_phone(p_customer_phone);
  if v_phone is null then raise exception 'El teléfono es obligatorio'; end if;
  if jsonb_typeof(coalesce(p_lines,'[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_lines,'[]'::jsonb)) = 0 then
    raise exception 'El pedido necesita al menos una pieza';
  end if;

  v_folio := private.next_order_folio(p_organization_id);
  insert into app.orders(organization_id,folio,customer_name,customer_phone,customer_email,subtotal,discount,total,status,source,notes,metadata,created_at,updated_at)
  values (p_organization_id,v_folio,trim(p_customer_name),v_phone,nullif(lower(trim(p_customer_email)),''),0,0,0,'pending_payment','internal_capture',nullif(trim(coalesce(p_notes,'')),''),jsonb_build_object('capturedByUserId',v_actor),now(),now())
  returning id into v_order;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_line_index := v_line_index + 1;

    if v_line->>'kind' = 'bundle' then
      select * into v_bundle from app.product_bundles
        where id = nullif(v_line->>'bundleId','')::uuid and organization_id = p_organization_id
          and active = true and archived_at is null and (valid_until is null or valid_until >= current_date)
        for share;
      if not found then raise exception 'Kit no disponible (línea %)', v_line_index; end if;

      v_tier := case when lower(trim(coalesce(v_line->>'tier',''))) in ('niño','nino','kid') then 'Niño'
                     when lower(trim(coalesce(v_line->>'tier',''))) in ('adulto','adult') then 'Adulto'
                     else null end;
      if v_tier is null then raise exception 'Indica adulto o niño para el kit (línea %)', v_line_index; end if;
      v_price := case when v_tier='Niño' and coalesce(v_bundle.price_kid,0)>0 then v_bundle.price_kid else v_bundle.price_adult end;
      if coalesce(v_price,0) <= 0 then raise exception 'El kit no tiene precio para ese tipo (línea %)', v_line_index; end if;
      if jsonb_typeof(coalesce(v_line->'pieces','[]'::jsonb)) <> 'array' then raise exception 'Piezas de kit inválidas (línea %)', v_line_index; end if;

      v_expected := 0; v_total_weight := 0;
      for v_comp in select value from jsonb_array_elements(v_bundle.components) loop
        v_comp_legacy := v_comp->>'productId';
        v_comp_qty := greatest(1, least(20, coalesce((v_comp->>'qty')::int,1)));
        select * into v_product from app.products where organization_id=p_organization_id and (id::text=v_comp_legacy or legacy_id=v_comp_legacy) and active=true and archived_at is null;
        if not found then raise exception 'El kit incluye un producto no disponible (línea %)', v_line_index; end if;
        v_expected := v_expected + v_comp_qty;
        v_total_weight := v_total_weight + (coalesce(v_product.price,0) * v_comp_qty);
        select count(*) into v_sent_count from jsonb_array_elements(v_line->'pieces') x where coalesce(x->>'productId','')=v_comp_legacy;
        if v_sent_count <> v_comp_qty then raise exception 'Faltan tallas de una pieza del kit (línea %)', v_line_index; end if;
      end loop;
      if v_expected = 0 or v_total_weight <= 0 then raise exception 'El kit no tiene composición válida (línea %)', v_line_index; end if;

      v_remaining_weight := v_total_weight; v_remaining_price := v_price; v_unit_index := 0;
      for v_comp in select value from jsonb_array_elements(v_bundle.components) loop
        v_comp_legacy := v_comp->>'productId';
        select * into v_product from app.products where organization_id=p_organization_id and (id::text=v_comp_legacy or legacy_id=v_comp_legacy) and active=true and archived_at is null;
        v_is_jersey := v_product.name ~* 'jersey|uniforme|playera';
        for v_piece in select value from jsonb_array_elements(v_line->'pieces') x where coalesce(x->>'productId','')=v_comp_legacy loop
          v_unit_index := v_unit_index + 1;
          v_talla := nullif(trim(coalesce(v_piece->>'talla','')),'');
          if v_talla is null then raise exception 'Falta la talla de una pieza del kit (línea %)', v_line_index; end if;
          if v_unit_index = v_expected then v_unit_price := v_remaining_price;
          else v_unit_price := round(v_remaining_price * (coalesce(v_product.price,0) / v_remaining_weight), 2); end if;
          insert into app.order_items(organization_id,order_id,product_id,description,quantity,unit_price,unit_cost,attributes)
          values(p_organization_id,v_order,v_product.id,v_product.name,1,v_unit_price,v_product.cost,
            jsonb_strip_nulls(jsonb_build_object(
              'talla',v_talla,
              'nombrePers',case when v_is_jersey then nullif(trim(coalesce(v_line->>'personalizationName','')),'') else null end,
              'numero',case when v_is_jersey then nullif(trim(coalesce(v_line->>'number','')),'') else null end,
              'obs',nullif(trim(coalesce(v_piece->>'notes','')),''),
              'bundleId',v_bundle.id,'bundleName',v_bundle.name,'bundleTier',v_tier
            )));
          v_remaining_price := v_remaining_price - v_unit_price;
          v_remaining_weight := v_remaining_weight - coalesce(v_product.price,0);
        end loop;
      end loop;

    elsif v_line->>'kind' = 'product' then
      v_prod_id := nullif(v_line->>'productId','')::uuid;
      select * into v_product from app.products where id=v_prod_id and organization_id=p_organization_id and active=true and archived_at is null;
      if not found then raise exception 'Producto no disponible (línea %)', v_line_index; end if;
      v_talla := nullif(trim(coalesce(v_line->>'talla','')),'');
      v_qty := greatest(1, least(20, coalesce((v_line->>'quantity')::int,1)));
      v_is_jersey := v_product.name ~* 'jersey|uniforme|playera';
      insert into app.order_items(organization_id,order_id,product_id,description,quantity,unit_price,unit_cost,attributes)
      values(p_organization_id,v_order,v_product.id,v_product.name,v_qty,v_product.price,v_product.cost,
        jsonb_strip_nulls(jsonb_build_object(
          'talla',v_talla,
          'nombrePers',case when v_is_jersey then nullif(trim(coalesce(v_line->>'personalizationName','')),'') else null end,
          'numero',case when v_is_jersey then nullif(trim(coalesce(v_line->>'number','')),'') else null end
        )));
    else
      raise exception 'Tipo de línea inválido (línea %)', v_line_index;
    end if;
  end loop;

  update app.orders set
    subtotal = (select coalesce(sum(quantity*unit_price),0) from app.order_items where order_id=v_order),
    total = (select coalesce(sum(quantity*unit_price),0) from app.order_items where order_id=v_order),
    updated_at = now()
  where id = v_order;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values(p_organization_id,'OrderCreated','order',v_order,jsonb_build_object('folio',v_folio,'source','internal_capture'),v_actor);

  return jsonb_build_object('id',v_order,'folio',v_folio,'total',(select total from app.orders where id=v_order));
end;
$$;

create or replace function public.v2_create_internal_order(organization_id uuid, customer_name text, customer_phone text, customer_email text, notes text, lines jsonb)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select private.command_create_internal_order(organization_id, customer_name, customer_phone, customer_email, notes, lines)
$$;

revoke all on function public.v2_create_internal_order(uuid,text,text,text,text,jsonb) from public;
grant execute on function public.v2_create_internal_order(uuid,text,text,text,text,jsonb) to authenticated, service_role;
;
