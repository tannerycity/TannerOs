-- Admin de la Tienda en 3 toques (Presidencia, 13/10/2026): "quiero saber
-- quién pidió, qué pidió, si es manga larga, corroborar el número, y que no
-- sean tantos clicks". Y en la lista, el nombre del jugador arriba y abajo el
-- papá que lo pidió.
--
--   1. Manga corta / larga en la tienda y en el portal de familias: la línea
--      trae "sleeve" y la prenda la guarda en attributes.manga (sólo jerseys).
--      Las dos funciones se parchan en su lugar (replace sobre su definición
--      vigente); si el texto esperado no está, la migración falla en vez de
--      dejar una a medias.
--   2. v2_orders_board: la lista ya trae al jugador, las prendas (talla,
--      manga, nombre y número) y si el número ya se confirmó. Sin abrir nada.
--   3. v2_confirm_order_number: confirmar (o quitar) el número del pedido.

do $$
declare d text; n text; f text;
begin
  foreach f in array array['private.public_create_cart_order(text,text,text,text,jsonb,text,jsonb)', 'private.portal_place_order(uuid,jsonb,text)'] loop
    d := pg_get_functiondef(f::regprocedure);
    n := replace(d, 'v_nombre text; v_numero text; v_kind text;', 'v_nombre text; v_numero text; v_kind text; v_manga text;');
    n := regexp_replace(n, '(v_nombre := nullif\(btrim\(coalesce\(it->>''personalizationName'',\s*''''\)\),\s*''''\);)',
      E'\\1\n    v_manga := case lower(btrim(coalesce(it->>''sleeve'', ''''))) when ''larga'' then ''larga'' when ''corta'' then ''corta'' else null end;');
    n := regexp_replace(n, '(''numero'',\s*case when v_is_jersey then v_numero else null end)', E'\\1, ''manga'', case when v_is_jersey then v_manga else null end', 'g');
    if n = d or position('v_manga :=' in n) = 0 or (length(n) - length(replace(n, '''manga''', ''))) / 7 < 2 then
      raise exception 'No se pudo agregar la manga a %', f;
    end if;
    execute n;
  end loop;
end $$;

create or replace function private.orders_board(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_module_access(p_organization_id, 'commerce', false) then raise exception 'Not authorized'; end if;
  return coalesce((select jsonb_object_agg(o.id, jsonb_build_object(
      'playerName', nullif(btrim(concat_ws(' ', pl.first_name, pl.last_name)), ''),
      'playerCategory', pl.category, 'playerJersey', pl.jersey_number,
      'numberConfirmed', o.metadata->'numeroConfirmado',
      'items', coalesce((select jsonb_agg(jsonb_build_object(
          'description', i.description, 'quantity', i.quantity,
          'talla', nullif(coalesce(i.attributes->>'talla', i.attributes->>'size'), ''),
          'manga', nullif(i.attributes->>'manga', ''),
          'nombre', nullif(coalesce(i.attributes->>'nombrePers', i.attributes->>'personalizationName'), ''),
          'numero', nullif(coalesce(i.attributes->>'numero', i.attributes->>'number'), ''),
          'kit', nullif(i.attributes->>'bundleName', '')) order by i.created_at)
        from app.order_items i where i.order_id = o.id), '[]'::jsonb)))
    from app.orders o left join app.players pl on pl.id = o.player_id and pl.organization_id = o.organization_id
    where o.organization_id = p_organization_id and o.archived_at is null), '{}'::jsonb);
end $$;

create or replace function private.confirm_order_number(p_organization_id uuid, p_order_id uuid, p_confirmed boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_numeros jsonb; v_meta jsonb;
begin
  if not private.has_module_access(p_organization_id, 'commerce', true) then raise exception 'Not authorized'; end if;
  select coalesce(jsonb_agg(distinct coalesce(i.attributes->>'numero', i.attributes->>'number')), '[]'::jsonb) into v_numeros
    from app.order_items i where i.order_id = p_order_id and nullif(coalesce(i.attributes->>'numero', i.attributes->>'number'), '') is not null;
  if p_confirmed and jsonb_array_length(v_numeros) = 0 then raise exception 'Este pedido no pidió número'; end if;
  update app.orders set metadata = case when p_confirmed
           then coalesce(metadata, '{}'::jsonb) || jsonb_build_object('numeroConfirmado', jsonb_build_object('numeros', v_numeros, 'at', now(), 'by', (select auth.uid())))
           else coalesce(metadata, '{}'::jsonb) - 'numeroConfirmado' end, updated_at = now()
   where id = p_order_id and organization_id = p_organization_id returning metadata into v_meta;
  if v_meta is null then raise exception 'Order not found'; end if;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, case when p_confirmed then 'OrderNumberConfirmed' else 'OrderNumberUnconfirmed' end, 'order', p_order_id,
          jsonb_build_object('numeros', v_numeros), (select auth.uid()));
  return jsonb_build_object('numberConfirmed', v_meta->'numeroConfirmado');
end $$;
revoke all on function private.orders_board(uuid), private.confirm_order_number(uuid, uuid, boolean) from public, anon, authenticated;

create or replace function public.v2_orders_board(organization_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$ select private.orders_board(organization_id) $$;
create or replace function public.v2_confirm_order_number(organization_id uuid, order_id uuid, confirmed boolean default true)
returns jsonb language sql security definer set search_path = '' as $$ select private.confirm_order_number(organization_id, order_id, confirmed) $$;
revoke all on function public.v2_orders_board(uuid), public.v2_confirm_order_number(uuid, uuid, boolean) from public, anon;
grant execute on function public.v2_orders_board(uuid), public.v2_confirm_order_number(uuid, uuid, boolean) to authenticated;
