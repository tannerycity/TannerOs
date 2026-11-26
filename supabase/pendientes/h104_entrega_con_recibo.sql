-- h104 · Entrega con recibo: quién se lo llevó, que lo aceptó y su recibo (26/11/2026) — PENDIENTE DE APLICAR.
--
-- Presidencia: "no tenemos una opción sencilla de marcar de entregado... no
-- todo el pedido que nos manda Tremor, sino individualmente. Que sea bien
-- fácil, que ya se le entregó y que están aceptando que ya se le entregó... que
-- puedas descargar un recibo de uniformes entregados y que tenga un botón para
-- mandarlo por WhatsApp a la persona que lo compró, para que ese sea el
-- registro de que se le entregó".
--
-- Qué cambia:
--   1. app.order_deliveries: una fila por pedido entregado, con quién lo
--      recogió (y si es el titular, mamá, papá u otro), la aceptación, la firma
--      (trazo SVG), las piezas tal como se entregaron, total y pagado, quién
--      del club entregó y cuándo se mandó por WhatsApp.
--   2. v2_deliver_order: entrega UN pedido. Pasa por
--      command_update_order_status, así que las reglas de siempre siguen
--      (sólo desde "Para entregar", nunca sin pagar, Taquilla no cambia
--      estados). Sin nombre de quien recibe o sin aceptación no entrega.
--   3. v2_order_delivery: el recibo de un pedido entregado, para volver a
--      descargarlo o reenviarlo.
--   4. v2_mark_delivery_sent: anota que el recibo se mandó por WhatsApp.
--
-- No borra ni modifica datos existentes. Si un pedido se regresa un paso
-- (h34) y se vuelve a entregar, la fila se reemplaza con la entrega nueva.

create table if not exists app.order_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null unique references app.orders(id) on delete cascade,
  receipt_folio text not null,
  received_by text not null check (length(btrim(received_by)) between 2 and 120),
  relation text check (relation in ('titular', 'mama', 'papa', 'familiar', 'otro')),
  accepted boolean not null check (accepted),
  signature text check (signature is null or length(signature) <= 60000),
  notes text check (notes is null or length(notes) <= 500),
  items jsonb not null default '[]'::jsonb,
  total numeric(12,2) not null default 0,
  paid numeric(12,2) not null default 0,
  delivered_by uuid references auth.users(id) on delete set null,
  delivered_by_name text,
  delivered_at timestamptz not null default now(),
  sent_whatsapp_at timestamptz
);
create index if not exists order_deliveries_org_idx on app.order_deliveries (organization_id, delivered_at desc);
alter table app.order_deliveries enable row level security;
-- Sin políticas: sólo se lee y escribe por las funciones de abajo.

-- El recibo en JSON, igual al entregar que al volver a pedirlo.
create or replace function private.order_delivery_json(p_organization_id uuid, p_order_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'receiptFolio', d.receipt_folio, 'orderId', o.id, 'folio', o.folio,
    'customerName', o.customer_name, 'customerPhone', o.customer_phone,
    'playerName', nullif(btrim(concat_ws(' ', pl.first_name, pl.last_name)), ''),
    'playerCategory', pl.category,
    'receivedBy', d.received_by, 'relation', d.relation, 'accepted', d.accepted,
    'signature', d.signature, 'notes', d.notes, 'items', d.items,
    'total', d.total, 'paid', d.paid,
    'deliveredByName', d.delivered_by_name, 'deliveredAt', d.delivered_at,
    'sentWhatsappAt', d.sent_whatsapp_at,
    'clubName', (select nullif(btrim(g.name), '') from public.organizations g where g.id = o.organization_id))
  from app.order_deliveries d
  join app.orders o on o.id = d.order_id and o.organization_id = d.organization_id
  left join app.players pl on pl.id = o.player_id and pl.organization_id = o.organization_id
  where d.organization_id = p_organization_id and d.order_id = p_order_id and o.status = 'delivered'
$$;

create or replace function public.v2_deliver_order(
  organization_id uuid, order_id uuid, received_by text, relation text default null,
  accepted boolean default false, signature text default null, notes text default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid := organization_id; v_order uuid := order_id;
  v_quien text := nullif(regexp_replace(btrim(coalesce(received_by, '')), '\s+', ' ', 'g'), '');
  v_rel text := nullif(btrim(coalesce(relation, '')), '');
  v_ok boolean := coalesce(accepted, false);
  v_firma text := nullif(btrim(coalesce(signature, '')), '');
  v_nota text := nullif(btrim(coalesce(notes, '')), '');
  v_uid uuid := (select auth.uid());
  v_folio text; v_total numeric;
begin
  if not private.has_module_access(v_org, 'commerce', true) then raise exception 'Not authorized'; end if;
  if v_quien is null or length(v_quien) < 2 then raise exception 'Escribe quién recoge el pedido.'; end if;
  if not v_ok then raise exception 'Falta que acepte que recibió su pedido completo.'; end if;
  if v_rel is not null and v_rel not in ('titular', 'mama', 'papa', 'familiar', 'otro') then raise exception 'Relación no válida.'; end if;
  if v_firma is not null and (length(v_firma) > 60000 or v_firma !~ '^[MLmlCcQqZz0-9 .,\-]*$') then raise exception 'La firma no es válida.'; end if;

  -- Las reglas de siempre: desde "Para entregar", pagado y sin Taquilla.
  perform private.command_update_order_status(v_org, v_order, 'delivered');
  update app.orders set delivered_at = coalesce(delivered_at, now()) where id = v_order and app.orders.organization_id = v_org;

  select o.folio, o.total into v_folio, v_total from app.orders o where o.id = v_order and o.organization_id = v_org;
  insert into app.order_deliveries as d (organization_id, order_id, receipt_folio, received_by, relation, accepted, signature, notes,
                                          items, total, paid, delivered_by, delivered_by_name, delivered_at, sent_whatsapp_at)
  values (v_org, v_order, concat('E-', coalesce(v_folio, left(v_order::text, 8))), v_quien, v_rel, true,
          v_firma, v_nota,
          coalesce((select jsonb_agg(jsonb_build_object(
              'description', i.description, 'quantity', i.quantity,
              'talla', nullif(coalesce(i.attributes->>'talla', i.attributes->>'size'), ''),
              'nombre', nullif(coalesce(i.attributes->>'nombrePers', i.attributes->>'personalizationName'), ''),
              'numero', nullif(coalesce(i.attributes->>'numero', i.attributes->>'number'), ''),
              'manga', nullif(i.attributes->>'manga', '')) order by i.created_at)
            from app.order_items i where i.order_id = v_order and i.organization_id = v_org), '[]'::jsonb),
          coalesce(v_total, 0), private.order_paid_amount(v_org, v_order), v_uid,
          (select nullif(btrim(p.display_name), '') from public.profiles p where p.user_id = v_uid), now(), null)
  on conflict on constraint order_deliveries_order_id_key do update set
    receipt_folio = excluded.receipt_folio, received_by = excluded.received_by, relation = excluded.relation,
    accepted = excluded.accepted, signature = excluded.signature, notes = excluded.notes, items = excluded.items,
    total = excluded.total, paid = excluded.paid, delivered_by = excluded.delivered_by,
    delivered_by_name = excluded.delivered_by_name, delivered_at = excluded.delivered_at, sent_whatsapp_at = null;

  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (v_org, 'OrderDeliveredWithReceipt', 'order', v_order, jsonb_build_object('receivedBy', v_quien, 'relation', v_rel, 'signed', v_firma is not null), v_uid);

  return private.order_delivery_json(v_org, v_order);
end
$$;

create or replace function public.v2_order_delivery(organization_id uuid, order_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.has_module_access(organization_id, 'commerce', false) then raise exception 'Not authorized'; end if;
  return private.order_delivery_json(organization_id, order_id);
end
$$;

create or replace function public.v2_mark_delivery_sent(organization_id uuid, order_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not private.has_module_access(organization_id, 'commerce', false) then raise exception 'Not authorized'; end if;
  update app.order_deliveries d set sent_whatsapp_at = now()
   where d.organization_id = v2_mark_delivery_sent.organization_id and d.order_id = v2_mark_delivery_sent.order_id;
end
$$;

revoke all on function private.order_delivery_json(uuid, uuid) from public;
revoke all on function public.v2_deliver_order(uuid, uuid, text, text, boolean, text, text) from public, anon;
revoke all on function public.v2_order_delivery(uuid, uuid) from public, anon;
revoke all on function public.v2_mark_delivery_sent(uuid, uuid) from public, anon;
grant execute on function public.v2_deliver_order(uuid, uuid, text, text, boolean, text, text) to authenticated;
grant execute on function public.v2_order_delivery(uuid, uuid) to authenticated;
grant execute on function public.v2_mark_delivery_sent(uuid, uuid) to authenticated;
