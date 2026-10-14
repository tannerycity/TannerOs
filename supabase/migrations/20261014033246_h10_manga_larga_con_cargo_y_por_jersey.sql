-- Manga larga con cargo y manga por jersey (14/10/2026): "en el kit dúo
-- necesito poder elegir que a lo mejor un jersey quiero de manga larga o no...
-- y que se paga 50 pesos más por ser de manga larga".
--  * El cargo es un ajuste del club: organizations.settings.tienda.recargoMangaLarga
--    (0 o ausente = sin cargo). Se cobra por cada jersey de manga larga, suelto
--    o dentro de un kit, en tienda, portal y mostrador; se ve en la pieza
--    (unit_price) y en el total.
--  * Dentro de un kit cada pieza puede traer su propia manga (piece.sleeve);
--    sin ella, la del kit, como hasta hoy.
create or replace function private.manga_valida(p text)
returns text language sql immutable set search_path to '' as $$
  select case lower(btrim(coalesce(p, ''))) when 'larga' then 'larga' when 'corta' then 'corta' end
$$;

create or replace function private.recargo_manga(p_organization_id uuid)
returns numeric language sql stable security definer set search_path to '' as $$
  select greatest(0, coalesce(nullif(o.settings->'tienda'->>'recargoMangaLarga', '')::numeric, 0))
  from public.organizations o where o.id = p_organization_id
$$;
revoke all on function private.recargo_manga(uuid) from public, anon;

-- Suma el cargo a cada pieza de manga larga del pedido y devuelve cuánto sumó.
create or replace function private.aplica_recargo_manga(p_order_id uuid)
returns numeric language plpgsql security definer set search_path to '' as $$
declare v_org uuid; v_r numeric; v_total numeric;
begin
  select organization_id into v_org from app.orders where id = p_order_id;
  v_r := coalesce(private.recargo_manga(v_org), 0);
  if v_r <= 0 then return 0; end if;
  select coalesce(sum(quantity * v_r), 0) into v_total from app.order_items
   where order_id = p_order_id and attributes->>'manga' = 'larga';
  update app.order_items set unit_price = unit_price + v_r,
         attributes = attributes || jsonb_build_object('recargoManga', v_r)
   where order_id = p_order_id and attributes->>'manga' = 'larga';
  return v_total;
end $$;
revoke all on function private.aplica_recargo_manga(uuid) from public, anon;

create or replace function private.set_recargo_manga(p_organization_id uuid, p_monto numeric)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public','private' as $$
declare v_antes numeric;
begin
  if not private.can_edit_catalog(p_organization_id) then raise exception 'No tienes permiso para editar el catálogo'; end if;
  if p_monto is null or p_monto < 0 or p_monto > 5000 then raise exception 'El cargo va de $0 a $5,000'; end if;
  v_antes := private.recargo_manga(p_organization_id);
  update public.organizations
     set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{tienda}', coalesce(settings->'tienda', '{}'::jsonb) || jsonb_build_object('recargoMangaLarga', p_monto))
   where id = p_organization_id;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, 'SleeveSurchargeChanged', 'organization', p_organization_id, jsonb_build_object('before', v_antes, 'after', p_monto), (select auth.uid()));
  return jsonb_build_object('recargoMangaLarga', p_monto);
end $$;
revoke all on function private.set_recargo_manga(uuid, numeric) from public, anon;

create or replace function public.v2_set_recargo_manga(organization_id uuid, monto numeric)
returns jsonb language sql security definer set search_path to 'pg_catalog','private' as $$
  select private.set_recargo_manga(organization_id, monto)
$$;
revoke all on function public.v2_set_recargo_manga(uuid, numeric) from public, anon;
grant execute on function public.v2_set_recargo_manga(uuid, numeric) to authenticated;

do $$
declare d text;
begin
  -- Tienda pública: manga por pieza en el kit y cargo al final.
  d := pg_get_functiondef('private.public_create_cart_order(text,text,text,text,jsonb,text,jsonb)'::regprocedure);
  if position('aplica_recargo_manga' in d) = 0 then
    d := replace(d, 'then v_manga else null end,
              ''bundleId''', 'then coalesce(private.manga_valida(v_piece->>''sleeve''), v_manga) else null end,
              ''bundleId''');
    d := replace(d, '  update app.orders set subtotal = v_subtotal, total = v_subtotal, updated_at = now() where id = v_order_id;',
      '  v_subtotal := v_subtotal + private.aplica_recargo_manga(v_order_id);
  update app.orders set subtotal = v_subtotal, total = v_subtotal, updated_at = now() where id = v_order_id;');
    if position('aplica_recargo_manga' in d) = 0 or position('manga_valida(v_piece' in d) = 0 then raise exception 'No se pudo parchar public_create_cart_order'; end if;
    execute d;
  end if;
  -- Portal de familias.
  d := pg_get_functiondef('private.portal_place_order(uuid,jsonb,text)'::regprocedure);
  if position('aplica_recargo_manga' in d) = 0 then
    d := replace(d, 'then v_manga else null end,
              ''bundleId''', 'then coalesce(private.manga_valida(v_piece->>''sleeve''), v_manga) else null end,
              ''bundleId''');
    d := replace(d, '  update app.orders set subtotal = v_subtotal, total = v_subtotal, updated_at = now() where id = v_order_id;',
      '  v_subtotal := v_subtotal + private.aplica_recargo_manga(v_order_id);
  update app.orders set subtotal = v_subtotal, total = v_subtotal, updated_at = now() where id = v_order_id;');
    if position('aplica_recargo_manga' in d) = 0 or position('manga_valida(v_piece' in d) = 0 then raise exception 'No se pudo parchar portal_place_order'; end if;
    execute d;
  end if;
  -- Mostrador.
  d := pg_get_functiondef('private.command_create_internal_order(uuid,text,text,text,text,jsonb,uuid)'::regprocedure);
  if position('aplica_recargo_manga' in d) = 0 then
    d := replace(d, '(case lower(btrim(coalesce(v_line->>''sleeve'',''''))) when ''larga'' then ''larga'' when ''corta'' then ''corta'' end) else null end,
              ''obs''', 'coalesce(private.manga_valida(v_piece->>''sleeve''), private.manga_valida(v_line->>''sleeve'')) else null end,
              ''obs''');
    d := replace(d, '  update app.orders set
    subtotal = (select coalesce(sum(quantity*unit_price),0) from app.order_items where order_id=v_order),',
      '  perform private.aplica_recargo_manga(v_order);
  update app.orders set
    subtotal = (select coalesce(sum(quantity*unit_price),0) from app.order_items where order_id=v_order),');
    if position('aplica_recargo_manga' in d) = 0 or position('manga_valida(v_piece' in d) = 0 then raise exception 'No se pudo parchar command_create_internal_order'; end if;
    execute d;
  end if;

  -- Leer: el cargo viaja con el catálogo.
  d := pg_get_functiondef('private.public_offerings(text)'::regprocedure);
  if position('recargoMangaLarga' in d) = 0 then
    d := replace(d, 'return jsonb_build_object(''products'',v_products,''bundles'',v_bundles);', 'return jsonb_build_object(''products'',v_products,''bundles'',v_bundles,''recargoMangaLarga'',private.recargo_manga(v_org));');
    if position('recargoMangaLarga' in d) = 0 then raise exception 'No se pudo parchar public_offerings'; end if;
    execute d;
  end if;
  d := pg_get_functiondef('private.portal_catalog()'::regprocedure);
  if position('recargoMangaLarga' in d) = 0 then
    d := replace(d, 'return jsonb_build_object(''products'', v_products, ''bundles'', v_bundles);', 'return jsonb_build_object(''products'', v_products, ''bundles'', v_bundles, ''recargoMangaLarga'', private.recargo_manga(g.organization_id));');
    if position('recargoMangaLarga' in d) = 0 then raise exception 'No se pudo parchar portal_catalog'; end if;
    execute d;
  end if;
  d := pg_get_functiondef('private.query_catalog(uuid)'::regprocedure);
  if position('recargoMangaLarga' in d) = 0 then
    d := replace(d, 'return jsonb_build_object(''products'',v_products,''bundles'',v_bundles);', 'return jsonb_build_object(''products'',v_products,''bundles'',v_bundles,''recargoMangaLarga'',private.recargo_manga(p_organization_id));');
    if position('recargoMangaLarga' in d) = 0 then raise exception 'No se pudo parchar query_catalog'; end if;
    execute d;
  end if;
end $$;
