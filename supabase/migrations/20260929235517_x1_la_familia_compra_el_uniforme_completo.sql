-- La familia puede comprar el uniforme, no sólo las piezas
--
-- DOS HUECOS, los dos medidos contra producción.
--
-- 1. LOS KITS NO LLEGABAN AL PORTAL. private.portal_catalog leía sólo
--    app.products, y los kits viven en app.product_bundles. Kit Tanner -
--    Completo ($3,500 adulto / $2,350 niño), Kit Game y Kit Training ($1,500 /
--    $1,299) salían en el mostrador de Taquilla y no en la cuenta del papá.
--    El producto estrella
--    del club —el que más se vende al inscribirse— no se podía comprar desde
--    el portal: la familia veía ocho piezas sueltas y tenía que armar el
--    uniforme de cabeza, adivinando cuáles van juntas.
--
--    De paso dejaba sin sentido una regla escrita en v2/tienda.js: acomodaVitrina()
--    pone "el kit primero", y ahí nunca se disparaba porque no llegaba ninguno.
--
-- 2. EL NOMBRE ESTAMPADO NO LLEGABA AL PROVEEDOR. portal_place_order escribía
--    en attributes sólo {"size": ...}. Nunca 'nombrePers' ni 'numero', que es
--    justo lo que lee query_production_batch_sheet para armar la hoja. Una
--    familia pedía el jersey con el nombre de su hijo en la espalda, el club
--    lo cobraba, y el maquilador recibía una hoja sin nombre.
--
--    La talla sí se salvaba de milagro: la hoja lee 'talla' Y 'size', así que
--    la llave en inglés del portal colaba. Aquí se escriben las dos, para no
--    depender de esa casualidad.
--
-- CÓMO SE RESUELVE, Y POR QUÉ ASÍ
--
-- El mostrador ya sabe explotar un kit en sus piezas y repartirle el precio:
-- command_create_internal_order lo hace desde hace meses, con dinero real
-- encima. Lo que sigue es ESE mismo procedimiento —mismo contrato de línea,
-- mismo reparto por peso, mismos atributos— puesto en el portal.
--
-- No se refactorizó el del mostrador para compartir código. Es la decisión
-- incómoda: duplicar una regla de precio es como un club acaba cobrando dos
-- totales distintos por el mismo kit. Pero tocar una función que cobra hoy,
-- para que dos caminos compartan un helper nuevo, arriesga el camino que YA
-- funciona a cambio de elegancia. Se paga el duplicado y se pone una prueba
-- que compara los dos caminos con el mismo kit: si algún día divergen, truena.
-- Ver supabase/tests/10_los_dos_caminos_cobran_el_mismo_kit.sql.
--
-- REVERSIBLE: volver a ejecutar las dos funciones en su versión anterior las
-- regresa. Ningún dato se toca: esto es sólo lectura y escritura nueva.

-- ---------------------------------------------------------------------------
-- 1. El catálogo del portal devuelve también los kits.
--
-- Cambia la forma: antes era un arreglo pelón de productos, ahora es
-- {products, bundles}. La pantalla nueva acepta las dos formas, para que a
-- quien tenga la página abierta en ese momento no se le rompa la tienda.
--
-- De cada kit viaja su composición YA RESUELTA —nombre y talla de cada pieza—
-- porque la familia no puede elegir tallas de algo que no sabe qué trae.
-- ---------------------------------------------------------------------------
create or replace function private.portal_catalog()
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare g app.guardians; v_products jsonb; v_bundles jsonb;
begin
  select * into g from private.portal_guardian();
  if g.id is null then raise exception 'Portal access required'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'name', p.name, 'description', p.description,
    'price', p.price, 'type', p.product_type, 'category', p.category,
    'sizes', p.sizes, 'lead_days', p.lead_days,
    'photo_path', p.photo_path, 'photo_thumb_path', p.photo_thumb_path,
    'photo_bucket', p.photo_bucket)
    order by p.product_type, p.name), '[]'::jsonb)
  into v_products
  from app.products p
  where p.organization_id = g.organization_id and p.active and p.archived_at is null;

  -- Sólo kits vendibles: activos, con precio y vigentes. Un kit caducado en la
  -- vitrina es una promesa que el club no va a cumplir.
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id, 'name', b.name, 'description', b.description,
    'price_adult', b.price_adult, 'price_kid', b.price_kid,
    'pieces', piezas.lista)
    order by b.name), '[]'::jsonb)
  into v_bundles
  from app.product_bundles b
  cross join lateral (
    select coalesce(jsonb_agg(jsonb_build_object(
             'product_id', pr.id, 'name', pr.name, 'category', pr.category,
             'sizes', pr.sizes, 'qty', greatest(1, least(20, coalesce((c->>'qty')::int, 1))),
             'photo_thumb_path', pr.photo_thumb_path, 'photo_bucket', pr.photo_bucket)
             order by pr.name), '[]'::jsonb) as lista,
           bool_and(pr.id is not null) as completo
    from jsonb_array_elements(coalesce(b.components,'[]'::jsonb)) c
    left join app.products pr
      on pr.organization_id = b.organization_id
     and (pr.id::text = c->>'productId' or pr.legacy_id = c->>'productId')
     and pr.active and pr.archived_at is null
  ) piezas
  where b.organization_id = g.organization_id
    and b.active and b.archived_at is null
    and (b.valid_until is null or b.valid_until >= current_date)
    and coalesce(b.price_adult, 0) > 0
    -- Un kit al que le falta una pieza no se ofrece: la familia lo pediría y
    -- el pedido reventaría al guardarse.
    and coalesce(piezas.completo, false)
    and jsonb_array_length(piezas.lista) > 0;

  return jsonb_build_object('products', v_products, 'bundles', v_bundles);
end $function$;

-- ---------------------------------------------------------------------------
-- 2. El pedido del portal acepta kits, y guarda lo que se estampa.
--
-- Formato de línea, el MISMO del mostrador:
--
--   {"kind":"product","productId":...,"talla":...,"quantity":1,
--    "personalizationName":...,"number":...}
--
--   {"kind":"bundle","bundleId":...,"tier":"Adulto"|"Niño",
--    "personalizationName":...,"number":...,
--    "pieces":[{"productId":...,"talla":...}]}
--
-- Y sigue aceptando el formato viejo {"product_id":...,"size":...} para que
-- una página abierta desde antes no se quede sin poder comprar.
-- ---------------------------------------------------------------------------
create or replace function private.portal_place_order(p_player_id uuid, p_items jsonb, p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare
  g app.guardians; v_order_id uuid; v_folio text; it jsonb;
  v_product app.products; v_qty integer; v_subtotal numeric := 0; v_talla text; v_count integer := 0;
  v_bundle app.product_bundles%rowtype;
  v_tier text; v_price numeric; v_comp jsonb; v_comp_legacy text; v_comp_qty int;
  v_sent_count int; v_piece jsonb; v_expected int;
  v_total_weight numeric; v_remaining_weight numeric; v_remaining_price numeric;
  v_unit_index int; v_unit_price numeric; v_is_jersey boolean;
  v_nombre text; v_numero text; v_kind text;
begin
  select * into g from private.portal_guardian();
  if g.id is null then raise exception 'Portal access required'; end if;
  if not private.portal_owns_player(p_player_id) then raise exception 'Not authorized'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0
    then raise exception 'Order needs at least one item'; end if;
  if jsonb_array_length(p_items) > 20 then raise exception 'Too many items'; end if;

  v_folio := 'FAM-' || to_char(now(),'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,4));
  insert into app.orders(organization_id, folio, player_id, guardian_id, customer_name, customer_phone,
                         customer_email, subtotal, discount, total, status, source, notes)
  values(g.organization_id, v_folio, p_player_id, g.id,
         concat_ws(' ', nullif(btrim(g.first_name),''), nullif(btrim(g.last_name),'')),
         g.phone, g.email, 0, 0, 0, 'pending_payment', 'portal_familias',
         nullif(btrim(coalesce(p_notes,'')),''))
  returning id into v_order_id;

  for it in select value from jsonb_array_elements(p_items) loop
    v_count := v_count + 1;
    -- Sin 'kind' es el formato viejo, que sólo sabía de productos sueltos.
    v_kind := coalesce(nullif(it->>'kind',''), 'product');
    v_nombre := nullif(btrim(coalesce(it->>'personalizationName','')),'');
    v_numero := nullif(btrim(coalesce(it->>'number','')),'');

    if v_kind = 'bundle' then
      select * into v_bundle from app.product_bundles
        where id = nullif(it->>'bundleId','')::uuid and organization_id = g.organization_id
          and active and archived_at is null and (valid_until is null or valid_until >= current_date)
        for share;
      if not found then raise exception 'Kit no disponible (línea %)', v_count; end if;

      v_tier := case when lower(btrim(coalesce(it->>'tier',''))) in ('niño','nino','kid') then 'Niño'
                     when lower(btrim(coalesce(it->>'tier',''))) in ('adulto','adult') then 'Adulto'
                     else null end;
      if v_tier is null then raise exception 'Indica adulto o niño para el kit (línea %)', v_count; end if;
      v_price := case when v_tier='Niño' and coalesce(v_bundle.price_kid,0)>0 then v_bundle.price_kid else v_bundle.price_adult end;
      if coalesce(v_price,0) <= 0 then raise exception 'El kit no tiene precio para ese tipo (línea %)', v_count; end if;
      if jsonb_typeof(coalesce(it->'pieces','[]'::jsonb)) <> 'array' then raise exception 'Piezas de kit inválidas (línea %)', v_count; end if;

      -- Primera pasada: que estén TODAS las piezas y todas con talla. Un kit a
      -- medias es un pedido que el proveedor no puede cortar.
      v_expected := 0; v_total_weight := 0;
      for v_comp in select value from jsonb_array_elements(v_bundle.components) loop
        v_comp_legacy := v_comp->>'productId';
        v_comp_qty := greatest(1, least(20, coalesce((v_comp->>'qty')::int,1)));
        select * into v_product from app.products
          where organization_id=g.organization_id
            and (id::text=v_comp_legacy or legacy_id=v_comp_legacy)
            and active and archived_at is null;
        if not found then raise exception 'El kit incluye un producto no disponible (línea %)', v_count; end if;
        v_expected := v_expected + v_comp_qty;
        v_total_weight := v_total_weight + (coalesce(v_product.price,0) * v_comp_qty);
        select count(*) into v_sent_count from jsonb_array_elements(it->'pieces') x
          where coalesce(x->>'productId','')=v_product.id::text;
        if v_sent_count <> v_comp_qty then raise exception 'Faltan tallas de una pieza del kit (línea %)', v_count; end if;
      end loop;
      if v_expected = 0 or v_total_weight <= 0 then raise exception 'El kit no tiene composición válida (línea %)', v_count; end if;

      -- Segunda pasada: el precio del kit se reparte entre sus piezas en
      -- proporción a lo que vale cada una suelta, y la última se lleva el
      -- resto. Así la suma de los renglones da EXACTAMENTE el precio del kit
      -- y no un centavo más por redondeo. Es el mismo reparto del mostrador.
      v_remaining_weight := v_total_weight; v_remaining_price := v_price; v_unit_index := 0;
      for v_comp in select value from jsonb_array_elements(v_bundle.components) loop
        v_comp_legacy := v_comp->>'productId';
        select * into v_product from app.products
          where organization_id=g.organization_id
            and (id::text=v_comp_legacy or legacy_id=v_comp_legacy)
            and active and archived_at is null;
        v_is_jersey := v_product.name ~* 'jersey|uniforme|playera';
        for v_piece in select value from jsonb_array_elements(it->'pieces') x
          where coalesce(x->>'productId','')=v_product.id::text loop
          v_unit_index := v_unit_index + 1;
          v_talla := nullif(btrim(coalesce(v_piece->>'talla','')),'');
          if v_talla is null then raise exception 'Falta la talla de una pieza del kit (línea %)', v_count; end if;
          if v_unit_index = v_expected then v_unit_price := v_remaining_price;
          else v_unit_price := round(v_remaining_price * (coalesce(v_product.price,0) / v_remaining_weight), 2); end if;

          insert into app.order_items(organization_id,order_id,product_id,description,quantity,unit_price,unit_cost,attributes)
          values(g.organization_id,v_order_id,v_product.id,v_product.name,1,v_unit_price,v_product.cost,
            jsonb_strip_nulls(jsonb_build_object(
              'talla',v_talla,'size',v_talla,
              'nombrePers',case when v_is_jersey then v_nombre else null end,
              'numero',case when v_is_jersey then v_numero else null end,
              'bundleId',v_bundle.id,'bundleName',v_bundle.name,'bundleTier',v_tier)));

          v_remaining_price := v_remaining_price - v_unit_price;
          v_remaining_weight := v_remaining_weight - coalesce(v_product.price,0);
        end loop;
      end loop;
      v_subtotal := v_subtotal + v_price;

    else
      -- Pieza suelta. Se aceptan las dos formas: 'productId'/'talla' (nueva) y
      -- 'product_id'/'size' (la que manda una página abierta desde antes).
      select * into v_product from app.products
        where id = coalesce(nullif(it->>'productId',''), nullif(it->>'product_id',''))::uuid
          and organization_id = g.organization_id and active and archived_at is null;
      if v_product.id is null then raise exception 'Producto no disponible (línea %)', v_count; end if;
      v_qty := greatest(1, least(20, coalesce((it->>'quantity')::integer, 1)));
      v_talla := nullif(btrim(coalesce(it->>'talla', it->>'size', '')),'');
      v_is_jersey := v_product.name ~* 'jersey|uniforme|playera';

      insert into app.order_items(organization_id, order_id, product_id, description, quantity,
                                  unit_price, unit_cost, attributes)
      values(g.organization_id, v_order_id, v_product.id,
             v_product.name || case when v_talla is not null then ' · '||v_talla else '' end,
             v_qty, v_product.price, v_product.cost,
             -- Las dos llaves de talla, para no depender de que la hoja de
             -- producción siga leyendo la inglesa. Y el nombre estampado, que
             -- antes se perdía: la familia lo pedía, el club lo cobraba y el
             -- maquilador recibía una hoja sin nombre.
             jsonb_strip_nulls(jsonb_build_object(
               'talla', v_talla, 'size', v_talla,
               'nombrePers', case when v_is_jersey then v_nombre else null end,
               'numero', case when v_is_jersey then v_numero else null end)));
      v_subtotal := v_subtotal + (v_product.price * v_qty);
    end if;
  end loop;

  update app.orders set subtotal = v_subtotal, total = v_subtotal, updated_at = now() where id = v_order_id;
  return jsonb_build_object('order_id', v_order_id, 'folio', v_folio, 'total', v_subtotal, 'items', v_count);
end $function$;

-- ---------------------------------------------------------------------------
-- 3. Dos de los tres kits apuntaban a productos archivados.
--
-- Al medir para esta migración salió que sólo UN kit de tres era vendible:
--
--   Kit Game                4 piezas declaradas, 4 existen   OK
--   Kit Training            3 declaradas, 1 existe           roto
--   Kit Tanner - Completo   6 declaradas, 4 existen          roto
--
-- Los dos componentes fantasma son los mismos en ambos, y no son productos
-- borrados: son las versiones ARCHIVADAS de dos jerseys que el club renombró.
-- Cuando se crearon los registros nuevos, los kits se quedaron apuntando a los
-- viejos.
--
--   pro_mr5fpl25_7lbqdm  Jersey "Black" Edition        (archivado)
--                     -> Jersey "Black Edition"        78171e94-33b7-4c1d-b771-84b5bc44bd57
--   pro_mr5fn41o_v9p7ep  Jersey "Lechuguilla" Edition  (archivado)
--                     -> Jersey "Lechuguilla Edition"  501ed2d0-1010-4e37-b0eb-edb668cdba19
--
-- Es la misma prenda: el club vende la nueva. Sin esto, arreglar el código no
-- habría servido de nada — la tienda mostraría un solo kit y parecería que la
-- función salió mal, cuando lo que estaba mal era el dato.
--
-- REVERSIBLE: los ids viejos están escritos arriba; volver a ponerlos deshace
-- esto exactamente.
update app.product_bundles b
set components = (
      select jsonb_agg(
        case c->>'productId'
          when 'pro_mr5fpl25_7lbqdm' then jsonb_set(c, '{productId}', '"78171e94-33b7-4c1d-b771-84b5bc44bd57"')
          when 'pro_mr5fn41o_v9p7ep' then jsonb_set(c, '{productId}', '"501ed2d0-1010-4e37-b0eb-edb668cdba19"')
          else c end
        order by ord)
      from jsonb_array_elements(b.components) with ordinality t(c, ord)),
    updated_at = now()
where b.organization_id = '3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8'
  and b.archived_at is null
  and b.components::text ~ '(pro_mr5fpl25_7lbqdm|pro_mr5fn41o_v9p7ep)';

-- Y que no quede ninguno roto: si después de esto algún kit activo sigue
-- apuntando a un producto que no existe, la migración no pasa. Un kit
-- incompleto es un pedido que revienta al guardarse, con la familia enfrente.
do $$
declare v_rotos text;
begin
  select string_agg(distinct b.name, ', ') into v_rotos
  from app.product_bundles b
  cross join lateral jsonb_array_elements(coalesce(b.components,'[]'::jsonb)) c
  left join app.products pr on pr.organization_id = b.organization_id
    and (pr.id::text = c->>'productId' or pr.legacy_id = c->>'productId')
    and pr.active and pr.archived_at is null
  where b.active and b.archived_at is null and pr.id is null;

  if v_rotos is not null then
    raise exception 'Estos kits activos siguen apuntando a productos que no existen: %', v_rotos;
  end if;
end $$;

-- Las privadas siguen cerradas; las cáscaras públicas ya son SECURITY DEFINER
-- (migración w1). Se re-afirma porque CREATE sobre una función nueva regala
-- EXECUTE a PUBLIC, y aquí se reemplazaron dos.
revoke all on function private.portal_catalog() from public, anon, authenticated;
revoke all on function private.portal_place_order(uuid, jsonb, text) from public, anon, authenticated;
