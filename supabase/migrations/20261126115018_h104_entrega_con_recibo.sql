-- h104 · Entrega con recibo, también por partes (26/11/2026) — aplicada el 26/11/2026.
--
-- Presidencia: "no tenemos una opción sencilla de marcar de entregado... no
-- todo el pedido que nos manda Tremor, sino individualmente... que están
-- aceptando que ya se le entregó... un recibo de uniformes entregados y un
-- botón para mandarlo por WhatsApp a la persona que lo compró, para que ese
-- sea el registro". Y: "si no se le llega a entregar algo, ¿qué? Se queda
-- abierto hasta que se le entrega todo completo".
--
-- Decidido: sin firma. El registro es quién recogió, que aceptó haberlo
-- revisado, quién del club entregó, la hora y el recibo que le llega por
-- WhatsApp a quien compró.
--
-- Qué cambia:
--   1. app.order_deliveries: una fila por ENTREGA (un pedido puede tener
--      varias). Guarda qué piezas y cuántas se llevaron, qué quedó pendiente,
--      quién recogió (titular, mamá, papá, familiar u otro), la aceptación,
--      quién entregó y cuándo se mandó el recibo por WhatsApp.
--   2. v2_deliver_order: entrega lo que se lleva hoy (todas las piezas o
--      algunas). Si con esto ya se llevó todo, el pedido pasa a "Entregado"
--      por command_update_order_status, con sus reglas de siempre. Si falta
--      algo, el pedido se queda en "Para entregar" con lo pendiente.
--      Por partes o completo, nunca se entrega sin pagar y Taquilla no
--      entrega (igual que el cambio de estado).
--   3. v2_order_deliveries: las piezas de un pedido (cuántas se llevaron y
--      cuántas faltan) y sus recibos, del más reciente al más viejo.
--   4. v2_pending_deliveries: los pedidos en "Para entregar" que ya se
--      llevaron una parte, para marcarlos en la lista.
--   5. v2_mark_delivery_sent: anota que un recibo se mandó por WhatsApp.
--
-- Si un pedido entregado se regresa un paso (h34) y se vuelve a entregar, las
-- entregas anteriores quedan anuladas (voided_at) y se empieza de cero.
-- No borra ni modifica datos existentes.

create table if not exists app.order_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references app.orders(id) on delete cascade,
  number integer not null check (number > 0),
  receipt_folio text not null,
  received_by text not null check (length(btrim(received_by)) between 2 and 120),
  relation text check (relation in ('titular', 'mama', 'papa', 'familiar', 'otro')),
  accepted boolean not null check (accepted),
  notes text check (notes is null or length(notes) <= 500),
  items jsonb not null default '[]'::jsonb,
  pending jsonb not null default '[]'::jsonb,
  complete boolean not null default false,
  total numeric(12,2) not null default 0,
  paid numeric(12,2) not null default 0,
  delivered_by uuid references auth.users(id) on delete set null,
  delivered_by_name text,
  delivered_at timestamptz not null default now(),
  sent_whatsapp_at timestamptz,
  voided_at timestamptz
);
create index if not exists order_deliveries_order_idx on app.order_deliveries (order_id) where voided_at is null;
create index if not exists order_deliveries_org_idx on app.order_deliveries (organization_id, delivered_at desc);
alter table app.order_deliveries enable row level security;
-- Sin políticas: sólo se lee y escribe por las funciones de abajo.

-- Las piezas del pedido con cuántas se llevaron (entregas vigentes) y cuántas faltan.
create or replace function private.order_items_delivery(p_organization_id uuid, p_order_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'itemId', i.id, 'description', i.description, 'quantity', i.quantity,
      'talla', nullif(coalesce(i.attributes->>'talla', i.attributes->>'size'), ''),
      'nombre', nullif(coalesce(i.attributes->>'nombrePers', i.attributes->>'personalizationName'), ''),
      'numero', nullif(coalesce(i.attributes->>'numero', i.attributes->>'number'), ''),
      'manga', nullif(i.attributes->>'manga', ''),
      'delivered', least(i.quantity, coalesce(e.n, 0)),
      'pending', greatest(0, i.quantity - coalesce(e.n, 0))) order by i.created_at, i.id), '[]'::jsonb)
  from app.order_items i
  left join lateral (
    select sum((x->>'quantity')::int) n
    from app.order_deliveries d, jsonb_array_elements(d.items) x
    where d.order_id = i.order_id and d.organization_id = i.organization_id and d.voided_at is null
      and x->>'itemId' = i.id::text) e on true
  where i.order_id = p_order_id and i.organization_id = p_organization_id
$$;

-- Un recibo en JSON, igual al entregar que al volver a pedirlo.
create or replace function private.order_delivery_json(p_delivery_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', d.id, 'number', d.number, 'receiptFolio', d.receipt_folio, 'orderId', o.id, 'folio', o.folio,
    'customerName', o.customer_name, 'customerPhone', o.customer_phone,
    'playerName', nullif(btrim(concat_ws(' ', pl.first_name, pl.last_name)), ''),
    'playerCategory', pl.category,
    'receivedBy', d.received_by, 'relation', d.relation, 'accepted', d.accepted, 'notes', d.notes,
    'items', d.items, 'pending', d.pending, 'complete', d.complete,
    'total', d.total, 'paid', d.paid,
    'deliveredByName', d.delivered_by_name, 'deliveredAt', d.delivered_at,
    'sentWhatsappAt', d.sent_whatsapp_at,
    'clubName', (select nullif(btrim(g.name), '') from public.organizations g where g.id = o.organization_id))
  from app.order_deliveries d
  join app.orders o on o.id = d.order_id and o.organization_id = d.organization_id
  left join app.players pl on pl.id = o.player_id and pl.organization_id = o.organization_id
  where d.id = p_delivery_id
$$;

create or replace function public.v2_deliver_order(
  organization_id uuid, order_id uuid, received_by text, relation text default null,
  accepted boolean default false, items jsonb default null, notes text default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid := organization_id; v_order uuid := order_id;
  v_quien text := nullif(regexp_replace(btrim(coalesce(received_by, '')), '\s+', ' ', 'g'), '');
  v_rel text := nullif(btrim(coalesce(relation, '')), '');
  v_ok boolean := coalesce(accepted, false);
  v_nota text := nullif(btrim(coalesce(notes, '')), '');
  v_pide jsonb := items;
  v_uid uuid := (select auth.uid());
  v_status text; v_folio text; v_total numeric; v_paid numeric;
  v_piezas jsonb; v_lleva jsonb; v_queda jsonb; v_num int; v_id uuid; v_completo boolean;
begin
  if not private.has_module_access(v_org, 'commerce', true) then raise exception 'Not authorized'; end if;
  if private.is_taquilla(v_org) then raise exception 'Taquilla no puede entregar pedidos'; end if;
  if v_quien is null or length(v_quien) < 2 then raise exception 'Escribe quién recoge el pedido.'; end if;
  if not v_ok then raise exception 'Falta confirmar que revisó y recibe en buen estado.'; end if;
  if v_rel is not null and v_rel not in ('titular', 'mama', 'papa', 'familiar', 'otro') then raise exception 'Relación no válida.'; end if;

  select o.status, o.folio, o.total into v_status, v_folio, v_total
    from app.orders o where o.id = v_order and o.organization_id = v_org for update;
  if v_status is null then raise exception 'Order not found'; end if;
  if v_status <> 'ready' then raise exception 'El pedido no está en Para entregar.'; end if;
  v_paid := private.order_paid_amount(v_org, v_order);
  if v_paid + 0.005 < coalesce(v_total, 0) then raise exception 'Order cannot be delivered before full payment'; end if;

  v_piezas := private.order_items_delivery(v_org, v_order);
  -- Regresado un paso después de entregarse todo (h34): se empieza de cero.
  if jsonb_array_length(v_piezas) > 0 and not exists (select 1 from jsonb_array_elements(v_piezas) p where (p->>'pending')::int > 0) then
    update app.order_deliveries d set voided_at = now() where d.order_id = v_order and d.organization_id = v_org and d.voided_at is null;
    v_piezas := private.order_items_delivery(v_org, v_order);
  end if;

  -- Lo que se lleva hoy: lo que pidió la pantalla, o todo lo pendiente.
  if v_pide is null then
    v_pide := (select coalesce(jsonb_agg(jsonb_build_object('item_id', p->>'itemId', 'quantity', (p->>'pending')::int)), '[]'::jsonb)
                 from jsonb_array_elements(v_piezas) p where (p->>'pending')::int > 0);
  end if;
  if jsonb_typeof(v_pide) <> 'array' then raise exception 'Piezas no válidas.'; end if;
  if exists (select 1 from jsonb_array_elements(v_pide) x
              where coalesce((x->>'quantity')::int, 0) < 0
                 or not exists (select 1 from jsonb_array_elements(v_piezas) p where p->>'itemId' = x->>'item_id')
                 or (x->>'quantity')::int > (select (p->>'pending')::int from jsonb_array_elements(v_piezas) p where p->>'itemId' = x->>'item_id')) then
    raise exception 'Una pieza no es de este pedido o ya se entregó.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('itemId', p->>'itemId', 'description', p->>'description', 'quantity', (x->>'quantity')::int,
           'talla', p->'talla', 'nombre', p->'nombre', 'numero', p->'numero', 'manga', p->'manga') order by o.n), '[]'::jsonb)
    into v_lleva
    from jsonb_array_elements(v_piezas) with ordinality o(p, n)
    join jsonb_array_elements(v_pide) x on x->>'item_id' = p->>'itemId'
   where (x->>'quantity')::int > 0;
  if jsonb_array_length(v_lleva) = 0 then raise exception 'Elige al menos una pieza para entregar.'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('itemId', p->>'itemId', 'description', p->>'description',
           'quantity', (p->>'pending')::int - coalesce((select (x->>'quantity')::int from jsonb_array_elements(v_pide) x where x->>'item_id' = p->>'itemId'), 0),
           'talla', p->'talla', 'nombre', p->'nombre', 'numero', p->'numero', 'manga', p->'manga') order by o.n), '[]'::jsonb)
    into v_queda
    from jsonb_array_elements(v_piezas) with ordinality o(p, n)
   where (p->>'pending')::int - coalesce((select (x->>'quantity')::int from jsonb_array_elements(v_pide) x where x->>'item_id' = p->>'itemId'), 0) > 0;
  v_completo := jsonb_array_length(v_queda) = 0;

  select coalesce(max(d.number), 0) + 1 into v_num from app.order_deliveries d where d.order_id = v_order and d.organization_id = v_org;
  insert into app.order_deliveries (organization_id, order_id, number, receipt_folio, received_by, relation, accepted, notes,
                                    items, pending, complete, total, paid, delivered_by, delivered_by_name)
  values (v_org, v_order, v_num, concat('E-', coalesce(v_folio, left(v_order::text, 8)), case when v_num > 1 or not v_completo then concat('-', v_num) end),
          v_quien, v_rel, true, v_nota, v_lleva, v_queda, v_completo, coalesce(v_total, 0), v_paid, v_uid,
          (select nullif(btrim(p.display_name), '') from public.profiles p where p.user_id = v_uid))
  returning id into v_id;

  if v_completo then
    perform private.command_update_order_status(v_org, v_order, 'delivered');
    update app.orders set delivered_at = now() where id = v_order and app.orders.organization_id = v_org;
  end if;

  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (v_org, case when v_completo then 'OrderDeliveredWithReceipt' else 'OrderPartiallyDelivered' end, 'order', v_order,
          jsonb_build_object('deliveryId', v_id, 'number', v_num, 'receivedBy', v_quien, 'relation', v_rel,
                             'pieces', (select sum((x->>'quantity')::int) from jsonb_array_elements(v_lleva) x)), v_uid);

  return private.order_delivery_json(v_id);
end
$$;

create or replace function public.v2_order_deliveries(organization_id uuid, order_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.has_module_access(organization_id, 'commerce', false) then raise exception 'Not authorized'; end if;
  return jsonb_build_object(
    'items', private.order_items_delivery(organization_id, order_id),
    'deliveries', coalesce((select jsonb_agg(private.order_delivery_json(d.id) order by d.number desc)
                              from app.order_deliveries d
                             where d.organization_id = v2_order_deliveries.organization_id and d.order_id = v2_order_deliveries.order_id
                               and d.voided_at is null), '[]'::jsonb));
end
$$;

create or replace function public.v2_pending_deliveries(organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.has_module_access(organization_id, 'commerce', false) then raise exception 'Not authorized'; end if;
  return coalesce((
    select jsonb_object_agg(o.id, jsonb_build_object(
             'delivered', (select coalesce(sum((p->>'delivered')::int), 0) from jsonb_array_elements(private.order_items_delivery(o.organization_id, o.id)) p),
             'total', (select coalesce(sum((p->>'quantity')::int), 0) from jsonb_array_elements(private.order_items_delivery(o.organization_id, o.id)) p)))
      from app.orders o
     where o.organization_id = v2_pending_deliveries.organization_id and o.status = 'ready'
       and exists (select 1 from app.order_deliveries d where d.order_id = o.id and d.voided_at is null)), '{}'::jsonb);
end
$$;

create or replace function public.v2_mark_delivery_sent(organization_id uuid, delivery_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not private.has_module_access(organization_id, 'commerce', false) then raise exception 'Not authorized'; end if;
  update app.order_deliveries d set sent_whatsapp_at = now()
   where d.organization_id = v2_mark_delivery_sent.organization_id and d.id = v2_mark_delivery_sent.delivery_id;
end
$$;

revoke all on function private.order_items_delivery(uuid, uuid) from public;
revoke all on function private.order_delivery_json(uuid) from public;
revoke all on function public.v2_deliver_order(uuid, uuid, text, text, boolean, jsonb, text) from public, anon;
revoke all on function public.v2_order_deliveries(uuid, uuid) from public, anon;
revoke all on function public.v2_pending_deliveries(uuid) from public, anon;
revoke all on function public.v2_mark_delivery_sent(uuid, uuid) from public, anon;
grant execute on function public.v2_deliver_order(uuid, uuid, text, text, boolean, jsonb, text) to authenticated;
grant execute on function public.v2_order_deliveries(uuid, uuid) to authenticated;
grant execute on function public.v2_pending_deliveries(uuid) to authenticated;
grant execute on function public.v2_mark_delivery_sent(uuid, uuid) to authenticated;
