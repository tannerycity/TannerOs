-- h5c: "Comprar otra vez" (13/10/2026). El último pedido del Tanner, pieza por
-- pieza, para que la familia lo repita en un toque. Sólo lo ve quien es su
-- tutor en el portal; los cancelados y devueltos no cuentan.
create or replace function private.portal_last_order(p_player_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','app','private' as $$
declare g app.guardians; v_o app.orders%rowtype;
begin
  select * into g from private.portal_guardian();
  if g.id is null then raise exception 'Portal access required'; end if;
  if not private.portal_owns_player(p_player_id) then raise exception 'Not authorized'; end if;
  select * into v_o from app.orders o
   where o.organization_id = g.organization_id and o.player_id = p_player_id
     and o.archived_at is null and coalesce(o.status,'') not in ('cancelled','canceled','cancelado','refunded')
     and exists(select 1 from app.order_items i where i.order_id = o.id and i.product_id is not null)
   order by o.created_at desc limit 1;
  if not found then return null; end if;
  return jsonb_build_object(
    'folio', v_o.folio, 'createdAt', v_o.created_at,
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
        'productId', i.product_id, 'quantity', i.quantity,
        'talla', nullif(coalesce(i.attributes->>'talla', i.attributes->>'size'),''),
        'nombre', nullif(coalesce(i.attributes->>'nombrePers', i.attributes->>'personalizationName'),''),
        'numero', nullif(coalesce(i.attributes->>'numero', i.attributes->>'number'),''),
        'manga', i.attributes->>'manga',
        'bundleId', i.attributes->>'bundleId', 'bundleTier', i.attributes->>'bundleTier')
      order by i.created_at, i.id), '[]'::jsonb)
      from app.order_items i where i.order_id = v_o.id and i.product_id is not null));
end $$;
revoke all on function private.portal_last_order(uuid) from public, anon;

create or replace function public.v2_portal_last_order(player_id uuid)
returns jsonb language sql security definer set search_path to 'pg_catalog','private' as $$
  select private.portal_last_order(player_id)
$$;
revoke all on function public.v2_portal_last_order(uuid) from public, anon;
grant execute on function public.v2_portal_last_order(uuid) to authenticated;
