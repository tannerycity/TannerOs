-- h5e: Ventas de la semana con detalle (13/10/2026): "si le dieras click a
-- la gráfica o a lo que se vendió, sepas quién compró y quién vendió:
-- jugador, papá y vendedor". Cada pedido de la semana viaja con su jugador,
-- quién lo pagó/pidió, quién lo atendió, qué llevó, su total y lo cobrado.
create or replace function private.store_weekly_sales(p_organization_id uuid, p_week_start date default null)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','app','private' as $$
declare
  v_ini date; v_fin date; v_res jsonb;
begin
  if not private.is_presidency(p_organization_id) then raise exception 'Solo Presidencia ve las ventas'; end if;
  v_ini := coalesce(p_week_start, private.hoy_mx());
  v_ini := v_ini - ((extract(isodow from v_ini)::int) - 1);
  v_fin := v_ini + 6;

  with semanas as (
    select 'actual' as cual, v_ini as ini, v_fin as fin
    union all select 'anterior', v_ini - 7, v_fin - 7
  ), pedidos as (
    select s.cual, o.* from semanas s
    join app.orders o on o.organization_id = p_organization_id
     and (o.created_at at time zone 'America/Mexico_City')::date between s.ini and s.fin
     and o.archived_at is null and coalesce(o.status,'') not in ('cancelled','canceled','cancelado','refunded')
  ), cobros as (
    select s.cual, op.amount from semanas s
    join app.payments p on p.organization_id = p_organization_id and p.status = 'posted' and p.payment_date::date between s.ini and s.fin
    join app.order_payments op on op.payment_id = p.id and op.organization_id = p_organization_id
  ), resumen as (
    select s.cual,
      coalesce((select sum(total) from pedidos x where x.cual = s.cual), 0) as vendido,
      (select count(*) from pedidos x where x.cual = s.cual) as pedidos,
      coalesce((select sum(i.quantity) from pedidos x join app.order_items i on i.order_id = x.id where x.cual = s.cual), 0) as piezas,
      coalesce((select sum(amount) from cobros c where c.cual = s.cual), 0) as cobrado
    from semanas s
  ), lineas as (
    select i.*, x.id as oid,
      coalesce(i.attributes->>'bundleName', pr.name, split_part(i.description, ' · ', 1)) as que,
      i.attributes->>'bundleId' as kit
    from pedidos x join app.order_items i on i.order_id = x.id
    left join app.products pr on pr.id = i.product_id
    where x.cual = 'actual'
  ), top as (
    select l.que, l.kit is not null as es_kit,
      case when l.kit is null then sum(l.quantity)
           else round(count(*)::numeric / greatest(1, coalesce((select sum(greatest(1, coalesce((c->>'qty')::int, 1)))
                  from app.product_bundles b, jsonb_array_elements(b.components) c where b.id::text = l.kit), 1)))::int end as unidades,
      sum(l.unit_price * l.quantity) as total
    from lineas l group by l.que, l.kit
  )
  select jsonb_build_object(
    'weekStart', v_ini, 'weekEnd', v_fin,
    'sold', r.vendido, 'orders', r.pedidos, 'pieces', r.piezas, 'collected', r.cobrado,
    'avgTicket', case when r.pedidos > 0 then round(r.vendido / r.pedidos, 2) else 0 end,
    'previous', (select jsonb_build_object('sold', vendido, 'orders', pedidos, 'collected', cobrado) from resumen where cual = 'anterior'),
    'byChannel', coalesce((select jsonb_agg(jsonb_build_object('source', source, 'orders', n, 'total', t) order by t desc)
        from (select coalesce(source,'otro') source, count(*) n, sum(total) t from pedidos where cual = 'actual' group by 1) c), '[]'::jsonb),
    'byDay', (select jsonb_agg(jsonb_build_object('date', d::date, 'total',
        coalesce((select sum(total) from pedidos x where x.cual = 'actual' and (x.created_at at time zone 'America/Mexico_City')::date = d::date), 0)) order by d)
        from generate_series(v_ini, v_fin, interval '1 day') d),
    'top', coalesce((select jsonb_agg(jsonb_build_object('name', que, 'kit', es_kit, 'units', unidades, 'total', total) order by total desc)
        from (select * from top order by total desc limit 5) t), '[]'::jsonb),
    'sales', coalesce((select jsonb_agg(jsonb_build_object(
        'id', x.id, 'folio', x.folio, 'source', coalesce(x.source, 'otro'),
        'date', (x.created_at at time zone 'America/Mexico_City')::date, 'createdAt', x.created_at,
        'player', nullif(btrim(concat_ws(' ', pl.first_name, pl.last_name)), ''),
        'buyer', coalesce(nullif(btrim(concat_ws(' ', gu.first_name, gu.last_name)), ''), nullif(btrim(x.customer_name), '')),
        'seller', coalesce(
          (select nullif(btrim(pf.display_name), '') from public.profiles pf
            where pf.user_id::text = coalesce(x.metadata->>'attendedBy', x.metadata->>'capturedByUserId', x.metadata->>'reviewedBy')),
          case when x.metadata->>'responsible' <> 'Pedido público' then nullif(btrim(x.metadata->>'responsible'), '') end),
        'total', x.total, 'paid', private.order_paid_amount(p_organization_id, x.id),
        'items', (select coalesce(jsonb_agg(distinct l.que), '[]'::jsonb) from lineas l where l.oid = x.id))
      order by x.created_at desc)
      from pedidos x
      left join app.players pl on pl.id = x.player_id and pl.organization_id = x.organization_id
      left join app.guardians gu on gu.id = x.guardian_id and gu.organization_id = x.organization_id
      where x.cual = 'actual'), '[]'::jsonb)
  ) into v_res
  from resumen r where r.cual = 'actual';
  return v_res;
end $$;
revoke all on function private.store_weekly_sales(uuid, date) from public, anon;

create or replace function public.v2_store_weekly_sales(organization_id uuid, week_start date default null)
returns jsonb language sql security definer set search_path to 'pg_catalog','private' as $$
  select private.store_weekly_sales(organization_id, week_start)
$$;
revoke all on function public.v2_store_weekly_sales(uuid, date) from public, anon;
grant execute on function public.v2_store_weekly_sales(uuid, date) to authenticated;