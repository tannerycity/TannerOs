-- h35 · Mi pedido en el portal de familias (22/10/2026).
--
-- Presidencia: "que todo el mundo disfrute hacer sus pedidos y sean
-- orgullosos Tanners". El papá ya no tiene que preguntar por WhatsApp cómo va
-- el jersey: en su portal ve en qué paso va cada pedido de su hijo, con las
-- mismas etapas que usa la Tienda (private.order_stage, h34). Sólo los
-- pedidos de sus hijos (portal_owns_player), vigentes o entregados hace
-- menos de 30 días.

create or replace function private.portal_orders(p_player_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','app','private' as $$
declare g app.guardians;
begin
  select * into g from private.portal_guardian();
  if g.id is null then raise exception 'Portal access required'; end if;
  if not private.portal_owns_player(p_player_id) then raise exception 'Not authorized'; end if;
  return coalesce((
    select jsonb_agg(x.j order by x.creado desc) from (
      select o.created_at creado, jsonb_build_object(
        'id', o.id, 'folio', o.folio, 'createdAt', o.created_at, 'total', o.total,
        'paid', private.order_paid_amount(o.organization_id, o.id),
        'stage', private.order_stage(o.organization_id, o.id)->>'stage',
        'deliveredAt', o.delivered_at,
        'sentOn', (select b.submitted_on from app.production_batch_orders bo join app.production_batches b on b.id = bo.batch_id
                    where bo.order_id = o.id order by b.created_at desc limit 1),
        'items', (select coalesce(jsonb_agg(jsonb_build_object(
            'description', i.description, 'quantity', i.quantity,
            'talla', nullif(coalesce(i.attributes->>'talla', i.attributes->>'size'), ''),
            'nombre', nullif(coalesce(i.attributes->>'nombrePers', i.attributes->>'personalizationName'), ''),
            'numero', nullif(coalesce(i.attributes->>'numero', i.attributes->>'number'), ''),
            'manga', i.attributes->>'manga') order by i.created_at), '[]'::jsonb)
          from app.order_items i where i.order_id = o.id)) j
      from app.orders o
      where o.organization_id = g.organization_id and o.player_id = p_player_id and o.archived_at is null
        and o.status not in ('cancelled', 'refunded', 'draft')
        and (o.status <> 'delivered' or o.delivered_at > now() - interval '30 days')
      order by o.created_at desc limit 5) x), '[]'::jsonb);
end $$;
revoke all on function private.portal_orders(uuid) from public, anon, authenticated;

create or replace function public.v2_portal_orders(player_id uuid)
returns jsonb language sql stable security definer set search_path to 'pg_catalog','private' as $$
  select private.portal_orders(player_id)
$$;
revoke all on function public.v2_portal_orders(uuid) from public, anon;
grant execute on function public.v2_portal_orders(uuid) to authenticated;
