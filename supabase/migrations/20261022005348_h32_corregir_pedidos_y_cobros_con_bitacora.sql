-- h32 · Corregir pedidos y cobros con bitácora (22/10/2026).
--
-- Presidencia: "quiero que Zul pueda editar o borrar los pedidos y los
-- cobros, pero que haya un registro para yo revisar". Y: "cuando Zul está
-- viendo el que nos pagaron... puede cambiar la manga larga a corta y no dice
-- el por qué... que deba ponerse en editar y que diga por qué se cambió".
--
-- 1. Permiso por persona "Corregir pedidos y cobros" (módulo correcciones):
--    Presidencia siempre; a otra persona se le da en Usuarios > persona. Abre
--    corregir o reembolsar un cobro, borrar un ingreso, editar un movimiento y
--    eliminar un pedido, que antes eran sólo de Presidencia.
-- 2. Todo eso pide motivo y queda en app.change_log con antes y después.
-- 3. Un pedido con pagos ya no se cambia de un toque (manga, talla, nombre,
--    número): se edita con v2_edit_order_item, con motivo, y queda en la
--    bitácora.
-- 4. Presidencia revisa la bitácora (v2_change_log) y marca lo visto.

insert into public.modules(code, name, category, description, is_core, active, sort_order)
values ('correcciones', 'Corregir pedidos y cobros', 'management',
        'Corregir o reembolsar cobros, borrar ingresos, editar movimientos y eliminar pedidos. Todo pide motivo y queda en la bitácora de Presidencia.',
        false, true, 5)
on conflict (code) do nothing;
insert into public.plan_modules(plan_id, module_code, enabled)
select plan_id, 'correcciones', enabled from public.plan_modules where module_code = 'direccion'
on conflict do nothing;

create or replace function private.can_correct(p_organization_id uuid)
returns boolean language sql stable security definer set search_path to 'pg_catalog','public','private' as $$
  select private.is_presidency(p_organization_id) or private.has_module_access(p_organization_id, 'correcciones', true)
$$;
revoke all on function private.can_correct(uuid) from public, anon;
grant execute on function private.can_correct(uuid) to authenticated;

-- La bitácora.
create table app.change_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  created_at timestamptz not null default now(),
  actor_user_id uuid,
  actor_name text,
  kind text not null,
  label text,
  reason text,
  before jsonb,
  after jsonb,
  order_id uuid,
  payment_id uuid,
  player_id uuid,
  reviewed_at timestamptz,
  reviewed_by uuid
);
create index change_log_org_created on app.change_log(organization_id, created_at desc);
alter table app.change_log enable row level security;
revoke all on table app.change_log from public, anon, authenticated;
create trigger zz_club_read_only before insert or update or delete on app.change_log
  for each row execute function private.guard_club_read_only();

create or replace function private.log_change(p_organization_id uuid, p_kind text, p_label text, p_reason text,
  p_before jsonb, p_after jsonb, p_order_id uuid default null, p_payment_id uuid default null, p_player_id uuid default null)
returns void language sql security definer set search_path to 'pg_catalog','app','private' as $$
  insert into app.change_log(organization_id, actor_user_id, actor_name, kind, label, reason, before, after, order_id, payment_id, player_id)
  values (p_organization_id, (select auth.uid()), private.nombre_actor(), p_kind, p_label, nullif(btrim(p_reason), ''),
          p_before, p_after, p_order_id, p_payment_id, p_player_id)
$$;
revoke all on function private.log_change(uuid, text, text, text, jsonb, jsonb, uuid, uuid, uuid) from public, anon, authenticated;

create or replace function private.motivo_obligatorio(p_reason text)
returns void language plpgsql immutable set search_path to 'pg_catalog' as $$
begin
  if coalesce(length(btrim(p_reason)), 0) < 3 then raise exception 'Escribe el motivo del cambio (queda en la bitácora)'; end if;
end $$;
revoke all on function private.motivo_obligatorio(text) from public, anon, authenticated;

-- Quién puede: de "sólo Presidencia" a "puede corregir". El primer candado
-- de cada una es el de Presidencia (en una va partido en dos renglones).
do $do$
declare f text; d text;
begin
  foreach f in array array[
    'private.command_correct_order_payment(uuid,uuid,text)', 'private.command_correct_tanner_payment(uuid,uuid,text)',
    'private.command_void_income(uuid,uuid,text)', 'private.command_update_payment(uuid,uuid,numeric,text,text,text,text,date,text,uuid)',
    'private.command_delete_order(uuid,uuid)'] loop
    d := pg_get_functiondef(f::regprocedure);
    if position('can_correct' in d) = 0 then
      d := regexp_replace(d, 'if not private\.is_presidency\(p_organization_id\) then\s+raise exception ''[^'']*'';',
        'if not private.can_correct(p_organization_id) then raise exception ''No tienes permiso para corregir pedidos y cobros'';');
      if position('can_correct' in d) = 0 then raise exception 'h32: no se pudo parchar %', f; end if;
      execute d;
    end if;
  end loop;
end $do$;

-- Un cobro en palabras, para la bitácora.
create or replace function private.cobro_resumen(p_organization_id uuid, p_payment_id uuid)
returns jsonb language sql stable security definer set search_path to 'pg_catalog','app','private' as $$
  select jsonb_build_object('amount', p.amount, 'method', p.method, 'date', p.payment_date, 'concept', p.concept,
    'category', p.category, 'payerName', p.payer_name, 'reference', p.reference, 'playerId', p.player_id,
    'player', (select trim(coalesce(pl.first_name, '') || ' ' || coalesce(pl.last_name, '')) from app.players pl where pl.id = p.player_id),
    'folio', (select o.folio from app.order_payments op join app.orders o on o.id = op.order_id where op.payment_id = p.id limit 1),
    'ticket', (select t.numero from app.collection_tickets t where t.id = p.ticket_id))
  from app.payments p where p.id = p_payment_id and p.organization_id = p_organization_id
$$;
revoke all on function private.cobro_resumen(uuid, uuid) from public, anon, authenticated;

create or replace function public.v2_correct_order_payment(organization_id uuid, payment_id uuid, reason text)
returns void language plpgsql security definer set search_path to 'pg_catalog','public','private' as $$
declare v_antes jsonb := private.cobro_resumen(organization_id, payment_id);
begin
  perform private.command_correct_order_payment(organization_id, payment_id, reason);
  perform private.log_change(organization_id, 'order_payment_corrected', coalesce('Pedido ' || (v_antes->>'folio'), 'Cobro de pedido'),
    reason, v_antes, null, (select op.order_id from app.order_payments op where op.payment_id = v2_correct_order_payment.payment_id limit 1),
    payment_id, (v_antes->>'playerId')::uuid);
end $$;

create or replace function public.v2_correct_tanner_payment(organization_id uuid, payment_id uuid, reason text)
returns void language plpgsql security definer set search_path to 'pg_catalog','public','private' as $$
declare v_antes jsonb := private.cobro_resumen(organization_id, payment_id);
begin
  perform private.command_correct_tanner_payment(organization_id, payment_id, reason);
  perform private.log_change(organization_id, 'tanner_payment_refunded', coalesce(nullif(v_antes->>'player', ''), 'Cobro de Tanner'),
    reason, v_antes, null, null, payment_id, (v_antes->>'playerId')::uuid);
end $$;

create or replace function public.v2_void_income(organization_id uuid, payment_id uuid, reason text)
returns void language plpgsql security definer set search_path to 'pg_catalog','public','private' as $$
declare v_antes jsonb := private.cobro_resumen(organization_id, payment_id);
begin
  perform private.command_void_income(organization_id, payment_id, reason);
  perform private.log_change(organization_id, 'income_voided', coalesce(nullif(v_antes->>'concept', ''), 'Ingreso'),
    reason, v_antes, null, null, payment_id, (v_antes->>'playerId')::uuid);
end $$;

-- Editar movimiento y eliminar pedido ahora piden motivo.
-- Sin borrar la versión vieja: la nueva lleva el motivo y la vieja ya no
-- deja editar sin él.
create or replace function public.v2_update_payment(organization_id uuid, payment_id uuid, amount numeric, method text, category text,
  concept text, payer_name text, payment_date date, reference text, player_id uuid, reason text)
returns void language plpgsql security definer set search_path to 'pg_catalog','public','private' as $$
declare v_antes jsonb := private.cobro_resumen(organization_id, payment_id);
begin
  perform private.motivo_obligatorio(reason);
  perform private.command_update_payment(organization_id, payment_id, amount, method, category, concept, payer_name, payment_date, reference, player_id);
  perform private.log_change(organization_id, 'payment_edited', coalesce(nullif(v_antes->>'concept', ''), nullif(v_antes->>'player', ''), 'Movimiento'),
    reason, v_antes, private.cobro_resumen(organization_id, payment_id), null, payment_id, coalesce(player_id, (v_antes->>'playerId')::uuid));
end $$;

create or replace function public.v2_delete_order(organization_id uuid, order_id uuid, reason text)
returns void language plpgsql security definer set search_path to 'pg_catalog','public','private' as $$
declare v_o record;
begin
  perform private.motivo_obligatorio(reason);
  select o.folio, o.status, o.total, o.customer_name, o.player_id into v_o from app.orders o
   where o.id = v2_delete_order.order_id and o.organization_id = v2_delete_order.organization_id;
  perform private.command_delete_order(organization_id, order_id);
  perform private.log_change(organization_id, 'order_deleted', coalesce('Pedido ' || v_o.folio, 'Pedido'), reason,
    jsonb_build_object('folio', v_o.folio, 'status', v_o.status, 'total', v_o.total, 'customer', v_o.customer_name), null,
    order_id, null, v_o.player_id);
end $$;

create or replace function public.v2_update_payment(organization_id uuid, payment_id uuid, amount numeric, method text, category text,
  concept text, payer_name text, payment_date date, reference text, player_id uuid)
returns void language plpgsql security definer set search_path to 'pg_catalog','public','private' as $$
begin
  perform private.motivo_obligatorio(null);
end $$;

create or replace function public.v2_delete_order(organization_id uuid, order_id uuid)
returns void language plpgsql security definer set search_path to 'pg_catalog','public','private' as $$
begin
  perform private.motivo_obligatorio(null);
end $$;

-- Las piezas de un pedido con pagos ya no se cambian de un toque.
do $do$
declare d text;
begin
  d := pg_get_functiondef('private.set_order_item_sleeve(uuid,uuid,text)'::regprocedure);
  if position('usa Editar' in d) = 0 then
    d := replace(d, 'if v_status not in (''draft'', ''pending_payment'', ''partial_payment'', ''paid'') then raise exception ''Esta pieza ya no se puede editar''; end if;',
      'if v_status not in (''draft'', ''pending_payment'', ''partial_payment'', ''paid'') then raise exception ''Esta pieza ya no se puede editar''; end if;
  if private.order_paid_amount(p_organization_id, (select i.order_id from app.order_items i where i.id = p_item_id)) > 0 then
    raise exception ''Este pedido ya tiene pagos: usa Editar y escribe el motivo'';
  end if;');
    if position('usa Editar' in d) = 0 then raise exception 'h32: no se pudo parchar la manga'; end if;
    execute d;
  end if;
  d := pg_get_functiondef('private.command_update_order_item_fulfillment(uuid,uuid,text,text,text,text)'::regprocedure);
  if position('usa Editar' in d) = 0 then
    d := replace(d, 'then raise exception ''Order item can no longer be edited''; end if;',
      'then raise exception ''Order item can no longer be edited''; end if;
  if private.order_paid_amount(p_organization_id, v_order.id) > 0 then
    raise exception ''Este pedido ya tiene pagos: usa Editar y escribe el motivo'';
  end if;');
    if position('usa Editar' in d) = 0 then raise exception 'h32: no se pudo parchar las piezas'; end if;
    execute d;
  end if;
end $do$;

create or replace function private.command_edit_order_item(p_organization_id uuid, p_item_id uuid, p_size text, p_manga text,
  p_name text, p_number text, p_notes text, p_reason text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','app','private' as $$
declare v_item app.order_items%rowtype; v_order app.orders%rowtype; v_antes jsonb; v_despues jsonb; v_attrs jsonb; v_pagado numeric;
  v_manga text := case lower(btrim(coalesce(p_manga, ''))) when 'larga' then 'larga' when 'corta' then 'corta' else null end;
begin
  if not private.has_module_access(p_organization_id, 'commerce', true) then raise exception 'Not authorized'; end if;
  if private.is_taquilla(p_organization_id) then raise exception 'Taquilla no puede editar el detalle de las piezas'; end if;
  select * into v_item from app.order_items where id = p_item_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Order item not found'; end if;
  select * into v_order from app.orders where id = v_item.order_id and organization_id = p_organization_id for update;
  if v_order.status not in ('draft', 'pending_payment', 'partial_payment', 'paid') then raise exception 'Esta pieza ya no se puede editar'; end if;
  v_pagado := private.order_paid_amount(p_organization_id, v_order.id);
  if v_pagado > 0 then perform private.motivo_obligatorio(p_reason); end if;
  v_attrs := coalesce(v_item.attributes, '{}'::jsonb);
  v_antes := jsonb_build_object('talla', v_attrs->>'talla', 'manga', v_attrs->>'manga', 'nombre', v_attrs->>'nombrePers',
    'numero', v_attrs->>'numero', 'nota', v_attrs->>'obs');
  v_despues := jsonb_build_object('talla', nullif(btrim(coalesce(p_size, '')), ''), 'manga', v_manga,
    'nombre', nullif(btrim(coalesce(p_name, '')), ''), 'numero', nullif(btrim(coalesce(p_number, '')), ''),
    'nota', nullif(btrim(coalesce(p_notes, '')), ''));
  if v_antes = v_despues then return jsonb_build_object('itemId', p_item_id, 'changed', false); end if;
  v_attrs := v_attrs - 'manga' || jsonb_strip_nulls(jsonb_build_object('manga', v_manga))
    || jsonb_build_object('talla', v_despues->>'talla', 'nombrePers', v_despues->>'nombre', 'numero', v_despues->>'numero', 'obs', v_despues->>'nota');
  update app.order_items set attributes = v_attrs where id = v_item.id;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, 'OrderItemEdited', 'order_item', p_item_id,
          jsonb_build_object('before', v_antes, 'after', v_despues, 'reason', nullif(btrim(p_reason), '')), (select auth.uid()));
  if v_pagado > 0 then
    perform private.log_change(p_organization_id, 'order_item_edited', 'Pedido ' || v_order.folio || ' · ' || coalesce(v_item.description, 'pieza'),
      p_reason, v_antes, v_despues, v_order.id, null, v_order.player_id);
  end if;
  return jsonb_build_object('itemId', p_item_id, 'changed', true);
end $$;
revoke all on function private.command_edit_order_item(uuid, uuid, text, text, text, text, text, text) from public, anon, authenticated;

create or replace function public.v2_edit_order_item(organization_id uuid, order_item_id uuid, size text, manga text,
  personalization_name text, number text, notes text, reason text default null)
returns jsonb language sql security definer set search_path to 'pg_catalog','private' as $$
  select private.command_edit_order_item(organization_id, order_item_id, size, manga, personalization_name, number, notes, reason)
$$;

create or replace function public.v2_can_correct(organization_id uuid)
returns boolean language sql stable security definer set search_path to 'pg_catalog','private' as $$
  select private.can_correct(organization_id)
$$;

-- Lo que Presidencia revisa.
create or replace function public.v2_change_log(organization_id uuid, pending_only boolean default false)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','app','private' as $$
begin
  if not private.is_presidency(organization_id) then raise exception 'Sólo Presidencia revisa la bitácora'; end if;
  return jsonb_build_object(
    'pending', (select count(*) from app.change_log c where c.organization_id = v2_change_log.organization_id and c.reviewed_at is null),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'at', c.created_at, 'who', c.actor_name, 'kind', c.kind,
        'label', c.label, 'reason', c.reason, 'before', c.before, 'after', c.after, 'orderId', c.order_id, 'paymentId', c.payment_id,
        'playerId', c.player_id, 'reviewedAt', c.reviewed_at,
        'reviewedBy', (select private.chat_name(c.reviewed_by) where c.reviewed_by is not null)) order by c.created_at desc)
      from (select * from app.change_log c where c.organization_id = v2_change_log.organization_id
              and (not pending_only or c.reviewed_at is null) order by c.created_at desc limit 300) c), '[]'::jsonb));
end $$;

create or replace function public.v2_mark_changes_reviewed(organization_id uuid, ids uuid[])
returns integer language plpgsql security definer set search_path to 'pg_catalog','app','private' as $$
declare n integer;
begin
  if not private.is_presidency(organization_id) then raise exception 'Sólo Presidencia revisa la bitácora'; end if;
  update app.change_log c set reviewed_at = now(), reviewed_by = (select auth.uid())
   where c.organization_id = v2_mark_changes_reviewed.organization_id and c.id = any(ids) and c.reviewed_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

do $do$
declare f text;
begin
  foreach f in array array[
    'public.v2_correct_order_payment(uuid,uuid,text)', 'public.v2_correct_tanner_payment(uuid,uuid,text)', 'public.v2_void_income(uuid,uuid,text)',
    'public.v2_update_payment(uuid,uuid,numeric,text,text,text,text,date,text,uuid,text)', 'public.v2_delete_order(uuid,uuid,text)',
    'public.v2_edit_order_item(uuid,uuid,text,text,text,text,text,text)', 'public.v2_can_correct(uuid)',
    'public.v2_change_log(uuid,boolean)', 'public.v2_mark_changes_reviewed(uuid,uuid[])'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $do$;

-- Zul (Operaciones): corregir pedidos y cobros, por persona.
insert into private.membership_module_overrides(organization_id, membership_id, module_code, can_read, can_write)
select m.organization_id, m.id, 'correcciones', true, true
  from public.organization_memberships m
 where m.id = '65511245-858a-479b-a2fd-94f935ff5b83'
on conflict (organization_id, membership_id, module_code) do update set can_read = true, can_write = true, updated_at = now();
