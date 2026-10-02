-- Taquilla ve los pedidos que falta cobrar
--
-- LO QUE PIDIÓ EL CLUB: que en Taquilla cobrar un uniforme esté "conectado
-- con la tienda": buscar al Tanner, ver qué pidió y cobrar fácil. Los
-- uniformes se mandan a hacer y se aceptan anticipos.
--
-- POR QUÉ: Taquilla cobraba uniformes como "Otro ingreso · Uniforme". Medido
-- el 02/10/2026: 9 cobros así en TannerOS ($10,318), ninguno ligado a un
-- pedido. Sin pedido no queda la talla, ni el nombre a estampar, ni cuánto
-- falta del anticipo, ni si ya se entregó; la hoja de producción no se
-- entera. El cobro ligado ya existía (v2_post_order_payment_attributed), pero
-- vivía en Pedidos y Taquilla no lo usaba.
--
-- Esto agrega UNA lectura: los pedidos con saldo, con lo que cada uno lleva
-- (talla, nombre y número, kit) para que quien cobra sepa qué está cobrando.
-- Exige leer Tienda ('commerce'), igual que v2_orders. Nada se escribe.
--
-- REVERSIBLE: drop de las dos funciones.

create or replace function private.query_orders_to_collect(p_organization_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare v jsonb;
begin
  if not private.has_module_access(p_organization_id,'commerce',false) then raise exception 'Not authorized'; end if;
  select coalesce(jsonb_agg(x order by x->>'createdAt' desc),'[]'::jsonb) into v
  from (
    select jsonb_build_object(
      'id',o.id,'folio',o.folio,'status',o.status,'createdAt',o.created_at,
      'playerId',o.player_id,
      'playerName',nullif(trim(concat_ws(' ',pl.first_name,pl.last_name)),''),
      'category',pl.category,
      'customerName',o.customer_name,'customerPhone',o.customer_phone,
      'total',o.total,'paid',paid.monto,'balance',greatest(coalesce(o.total,0)-paid.monto,0),
      'items',(select coalesce(jsonb_agg(jsonb_build_object(
          'description',i.description,'quantity',i.quantity,
          'talla',nullif(i.attributes->>'talla',''),
          'nombre',nullif(coalesce(i.attributes->>'nombrePers',i.attributes->>'personalizationName'),''),
          'numero',nullif(coalesce(i.attributes->>'numero',i.attributes->>'number'),''),
          'kit',nullif(i.attributes->>'bundleName','')
        ) order by i.created_at),'[]'::jsonb)
        from app.order_items i where i.order_id=o.id)
    ) x
    from app.orders o
    left join app.players pl on pl.id=o.player_id and pl.organization_id=o.organization_id
    cross join lateral (select private.order_paid_amount(p_organization_id,o.id) monto) paid
    where o.organization_id=p_organization_id and o.archived_at is null
      and o.status in ('pending_payment','partial_payment','in_production','ready')
      and coalesce(o.total,0)-paid.monto>0.005
  ) s;
  return v;
end $function$;

revoke all on function private.query_orders_to_collect(uuid) from public, anon, authenticated;

create or replace function public.v2_orders_to_collect(organization_id uuid)
returns jsonb
language sql
stable security definer
set search_path to 'pg_catalog', 'private'
as $$ select private.query_orders_to_collect(organization_id); $$;

revoke all on function public.v2_orders_to_collect(uuid) from public, anon;
grant execute on function public.v2_orders_to_collect(uuid) to authenticated;
