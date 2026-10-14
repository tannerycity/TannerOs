-- Kit con piezas a elegir (14/10/2026): "quiero un kit dúo: que cuando un papá
-- escoja dos jerseys, sea cual sea, los haga un kit... que también incluya el
-- short". Un componente de kit puede ser un ESPACIO A ELEGIR:
--   {"pool": [productId, ...], "qty": 2, "name": "Jersey a elegir", "productId": <el primero>}
-- productId guarda el primero de la lista para que todo lo que ya lee kits
-- (catálogo, tienda, portal, ventas) siga funcionando igual; 'pool' dice
-- cuáles valen. Al crear el pedido, kit_concreto cambia cada espacio por los
-- productos que de verdad se eligieron, y de ahí en adelante el pedido se
-- arma, se reparte el precio y se valida exactamente como cualquier kit.

create or replace function private.kit_concreto(p_components jsonb, p_pieces jsonb)
returns jsonb language plpgsql immutable set search_path to '' as $$
declare c jsonb; v_out jsonb := '[]'::jsonb; v_qty int; v_pool text[]; v_n int; r record;
begin
  for c in select value from jsonb_array_elements(coalesce(p_components, '[]'::jsonb)) loop
    if jsonb_typeof(c->'pool') = 'array' then
      v_qty := greatest(1, least(20, coalesce((c->>'qty')::int, 1)));
      select array_agg(x) into v_pool from jsonb_array_elements_text(c->'pool') x;
      select count(*) into v_n from jsonb_array_elements(coalesce(p_pieces, '[]'::jsonb)) x where x->>'productId' = any(v_pool);
      if v_n <> v_qty then
        raise exception 'Elige % de %: %', v_qty, coalesce(nullif(c->>'name', ''), 'las piezas del kit'), v_n;
      end if;
      for r in select x->>'productId' pid, count(*) n from jsonb_array_elements(p_pieces) x
                where x->>'productId' = any(v_pool) group by 1 order by 1 loop
        v_out := v_out || jsonb_build_array(jsonb_build_object('productId', r.pid, 'qty', r.n));
      end loop;
    else
      v_out := v_out || jsonb_build_array(c);
    end if;
  end loop;
  -- Un mismo producto no puede quedar en dos componentes: el conteo por pieza
  -- dejaría de cuadrar.
  if (select count(*) from jsonb_array_elements(v_out) x) <> (select count(distinct x->>'productId') from jsonb_array_elements(v_out) x) then
    raise exception 'El kit repite una pieza';
  end if;
  return v_out;
end $$;
revoke all on function private.kit_concreto(jsonb, jsonb) from public, anon;

-- Guardar el kit: acepta espacios a elegir. Al menos 2 opciones, todas del
-- catálogo, y ninguna puede ser también una pieza fija del mismo kit.
create or replace function private.command_upsert_bundle(p_organization_id uuid, p_id uuid, p_name text, p_description text, p_price_adult numeric, p_price_kid numeric, p_components jsonb, p_active boolean, p_valid_until date DEFAULT NULL::date, p_notes text DEFAULT NULL::text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','app','private' as $function$
declare
  v_row app.product_bundles%rowtype;
  v_actor uuid:=(select auth.uid());
  v_comp jsonb; v_pid uuid; v_qty int; v_clean jsonb:='[]'::jsonb;
  v_pool jsonb; v_fijos uuid[]:='{}'; v_elegibles uuid[]:='{}'; x text;
begin
  if not private.can_edit_catalog(p_organization_id) then raise exception 'No tienes permiso para editar el catálogo'; end if;
  if coalesce(length(trim(p_name)),0)<2 then raise exception 'El nombre del kit es obligatorio'; end if;
  if coalesce(p_price_adult,0)<=0 and coalesce(p_price_kid,0)<=0 then raise exception 'Captura al menos un precio (adulto o niño)'; end if;
  if jsonb_typeof(coalesce(p_components,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_components,'[]'::jsonb))=0 then raise exception 'El kit necesita al menos una pieza'; end if;

  for v_comp in select value from jsonb_array_elements(p_components) loop
    v_qty:=greatest(1,least(20,coalesce((v_comp->>'qty')::int,1)));
    if jsonb_typeof(v_comp->'pool')='array' then
      v_pool:='[]'::jsonb;
      for x in select distinct value from jsonb_array_elements_text(v_comp->'pool') loop
        v_pid:=nullif(x,'')::uuid;
        if v_pid is null or not exists(select 1 from app.products where id=v_pid and organization_id=p_organization_id) then raise exception 'Una de las opciones no pertenece a tu catálogo'; end if;
        v_pool:=v_pool||to_jsonb(v_pid::text); v_elegibles:=v_elegibles||v_pid;
      end loop;
      if jsonb_array_length(v_pool)<2 then raise exception 'Una pieza a elegir necesita al menos 2 opciones'; end if;
      v_clean:=v_clean||jsonb_build_array(jsonb_build_object('productId',v_pool->>0,'qty',v_qty,'pool',v_pool,
        'name',coalesce(nullif(btrim(coalesce(v_comp->>'name','')),''),'Pieza a elegir')));
    else
      v_pid:=nullif(v_comp->>'productId','')::uuid;
      if v_pid is null then raise exception 'Pieza de kit inválida'; end if;
      if not exists(select 1 from app.products where id=v_pid and organization_id=p_organization_id) then raise exception 'Una de las piezas no pertenece a tu catálogo'; end if;
      v_fijos:=v_fijos||v_pid;
      v_clean:=v_clean||jsonb_build_array(jsonb_build_object('productId',v_pid::text,'qty',v_qty));
    end if;
  end loop;
  if v_fijos && v_elegibles then raise exception 'Una pieza no puede ser fija y a elegir en el mismo kit'; end if;

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
$function$;

do $$
declare d text;
begin
  -- Crear pedidos: el espacio a elegir se vuelve lo que se eligió.
  d := pg_get_functiondef('private.public_create_cart_order(text,text,text,text,jsonb,text,jsonb)'::regprocedure);
  if position('kit_concreto' in d) = 0 then
    d := replace(d, 'if not found then raise exception ''Kit no disponible (línea %)'', v_count; end if;',
      'if not found then raise exception ''Kit no disponible (línea %)'', v_count; end if;
      v_bundle.components := private.kit_concreto(v_bundle.components, it->''pieces'');');
    if position('kit_concreto' in d) = 0 then raise exception 'No se pudo parchar public_create_cart_order'; end if;
    execute d;
  end if;
  d := pg_get_functiondef('private.portal_place_order(uuid,jsonb,text)'::regprocedure);
  if position('kit_concreto' in d) = 0 then
    d := replace(d, 'if not found then raise exception ''Kit no disponible (línea %)'', v_count; end if;',
      'if not found then raise exception ''Kit no disponible (línea %)'', v_count; end if;
      v_bundle.components := private.kit_concreto(v_bundle.components, it->''pieces'');');
    if position('kit_concreto' in d) = 0 then raise exception 'No se pudo parchar portal_place_order'; end if;
    execute d;
  end if;
  d := pg_get_functiondef('private.command_create_internal_order(uuid,text,text,text,text,jsonb,uuid)'::regprocedure);
  if position('kit_concreto' in d) = 0 then
    d := replace(d, 'if not found then raise exception ''Kit no disponible (línea %)'', v_line_index; end if;',
      'if not found then raise exception ''Kit no disponible (línea %)'', v_line_index; end if;
      v_bundle.components := private.kit_concreto(v_bundle.components, v_line->''pieces'');');
    if position('kit_concreto' in d) = 0 then raise exception 'No se pudo parchar command_create_internal_order'; end if;
    execute d;
  end if;
  -- La función vieja de un solo kit (ya sin pantalla) no sabe de espacios: los rechaza.
  d := pg_get_functiondef('private.public_create_bundle_order_enhanced(text,uuid,text,text,text,text,jsonb,text,text,text,jsonb)'::regprocedure);
  if position('''pool''' in d) = 0 then
    d := replace(d, 'if not found then raise exception ''Bundle unavailable''; end if;',
      'if not found or exists(select 1 from jsonb_array_elements(v_bundle.components) c where c ? ''pool'') then raise exception ''Bundle unavailable''; end if;');
    if position('''pool''' in d) = 0 then raise exception 'No se pudo parchar public_create_bundle_order_enhanced'; end if;
    execute d;
  end if;

  -- Leer kits: cada pieza dice si es a elegir y entre cuáles.
  d := pg_get_functiondef('private.query_catalog(uuid)'::regprocedure);
  if position('''pool''' in d) = 0 then
    d := replace(d, '''qty'',greatest(1,least(20,coalesce((c->>''qty'')::int,1))),
        ''unitCost''', '''qty'',greatest(1,least(20,coalesce((c->>''qty'')::int,1))),''pool'',c->''pool'',''poolName'',c->>''name'',
        ''unitCost''');
    if position('''pool''' in d) = 0 then raise exception 'No se pudo parchar query_catalog'; end if;
    execute d;
  end if;
  d := pg_get_functiondef('private.public_offerings(text)'::regprocedure);
  if position('''pool''' in d) = 0 then
    d := replace(d, '''qty'',greatest(1,least(20,coalesce((c->>''qty'')::int,1))),''sizes''', '''qty'',greatest(1,least(20,coalesce((c->>''qty'')::int,1))),''pool'',c->''pool'',''poolName'',c->>''name'',''sizes''');
    if position('''pool''' in d) = 0 then raise exception 'No se pudo parchar public_offerings'; end if;
    execute d;
  end if;
  d := pg_get_functiondef('private.portal_catalog()'::regprocedure);
  if position('''pool''' in d) = 0 then
    d := replace(d, '''qty'', greatest(1, least(20, coalesce((c->>''qty'')::int, 1))),', '''qty'', greatest(1, least(20, coalesce((c->>''qty'')::int, 1))), ''pool'', c->''pool'', ''pool_name'', c->>''name'',');
    if position('''pool''' in d) = 0 then raise exception 'No se pudo parchar portal_catalog'; end if;
    execute d;
  end if;
end $$;
