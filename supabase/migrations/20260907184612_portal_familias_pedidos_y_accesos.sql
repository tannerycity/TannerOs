-- Pedido desde el portal. El precio NUNCA viene del cliente: se relee de
-- app.products dentro de la transacción, así que manipular el navegador no
-- cambia lo que se cobra.
create or replace function private.portal_place_order(
  p_player_id uuid, p_items jsonb, p_notes text default null)
returns jsonb language plpgsql security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare g app.guardians; v_order_id uuid; v_folio text; it jsonb;
  v_product app.products; v_qty integer; v_subtotal numeric := 0; v_size text; v_count integer := 0;
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
         g.first_name||' '||g.last_name, g.phone, g.email, 0, 0, 0, 'pending_payment', 'portal_familias',
         nullif(btrim(coalesce(p_notes,'')),''))
  returning id into v_order_id;

  for it in select * from jsonb_array_elements(p_items) loop
    select * into v_product from app.products
      where id = (it->>'product_id')::uuid and organization_id = g.organization_id
        and active and archived_at is null;
    if v_product.id is null then raise exception 'Producto no disponible'; end if;
    v_qty := greatest(1, least(20, coalesce((it->>'quantity')::integer, 1)));
    v_size := nullif(btrim(coalesce(it->>'size','')),'');
    insert into app.order_items(organization_id, order_id, product_id, description, quantity,
                                unit_price, unit_cost, attributes)
    values(g.organization_id, v_order_id, v_product.id,
           v_product.name || case when v_size is not null then ' · '||v_size else '' end,
           v_qty, v_product.price, v_product.cost,
           case when v_size is not null then jsonb_build_object('size', v_size) else '{}'::jsonb end);
    v_subtotal := v_subtotal + (v_product.price * v_qty);
    v_count := v_count + 1;
  end loop;

  update app.orders set subtotal = v_subtotal, total = v_subtotal, updated_at = now() where id = v_order_id;
  return jsonb_build_object('order_id', v_order_id, 'folio', v_folio, 'total', v_subtotal, 'items', v_count);
end $function$;

create or replace function public.v2_portal_place_order(player_id uuid, items jsonb, notes text default null)
returns jsonb language sql set search_path to 'pg_catalog','private'
as $$ select private.portal_place_order(player_id, items, notes) $$;

-- Lado staff: ver qué familias tienen acceso y a qué hijos. Se usa desde
-- Usuarios para decidir a quién invitar.
create or replace function private.query_guardian_access(p_organization_id uuid)
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog','app','private'
as $function$
begin
  if not private.has_module_access(p_organization_id,'users',false) then raise exception 'Not authorized'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'guardian_id', g.id, 'name', g.first_name||' '||g.last_name,
      'phone', g.phone, 'email', g.email, 'has_access', g.user_id is not null,
      'players', coalesce((select jsonb_agg(pl.first_name||' '||pl.last_name order by pl.first_name)
                   from app.player_guardians pg join app.players pl on pl.id = pg.player_id
                   where pg.guardian_id = g.id and pl.archived_at is null), '[]'::jsonb))
      order by (g.user_id is not null), g.first_name)
    from app.guardians g
    where g.organization_id = p_organization_id and coalesce(g.status,'active') <> 'inactive'
  ), '[]'::jsonb);
end $function$;

create or replace function public.v2_guardian_access(organization_id uuid)
returns jsonb language sql set search_path to 'pg_catalog','private'
as $$ select private.query_guardian_access(organization_id) $$;

do $$
declare f text;
begin
  foreach f in array array['private.portal_place_order(uuid,jsonb,text)',
    'public.v2_portal_place_order(uuid,jsonb,text)',
    'private.query_guardian_access(uuid)','public.v2_guardian_access(uuid)']
  loop execute format('revoke all on function %s from public, anon', f); end loop;
  foreach f in array array['public.v2_portal_place_order(uuid,jsonb,text)','public.v2_guardian_access(uuid)']
  loop execute format('grant execute on function %s to authenticated', f); end loop;
end $$;;
