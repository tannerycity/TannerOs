-- h50 · Pago en línea de la tienda (Mercado Pago) — BORRADOR, NO APLICADA
--
-- Presidencia (28/10/2026): "ármate por mientras la pasarela de pago y ya
-- después le configuramos la cuenta". Antes: "que me paguen directamente y,
-- una vez pagado, el pedido quede como pagado".
--
-- Cómo funciona:
--   1. La familia termina su pedido y toca "Pagar ahora". La función
--      pago-en-linea (Edge Function, llave de servicio) llama a
--      private.pago_en_linea_inicia: valida pedido + folio, calcula lo que
--      falta y abre un intento (app.online_payments, estado 'creado').
--   2. La función crea la preferencia en Mercado Pago (external_reference =
--      id del intento) y manda a la familia a pagar: tarjeta, OXXO, saldo MP,
--      meses sin intereses.
--   3. Mercado Pago avisa al webhook. La función verifica la firma, consulta el
--      pago en la API de Mercado Pago (la fuente de verdad, nunca el cuerpo del
--      aviso) y llama a private.pago_en_linea_aviso.
--   4. Si está aprobado y cuadra el monto: se registra el pago del pedido (el
--      mismo app.payments + app.order_payments de siempre, ya conciliado) y el
--      pedido pasa a 'paid'. Repetir el aviso no duplica (llave mp:<id>).
--
-- Mientras la cuenta no esté configurada (settings.paymentInstructions.online
-- sin enabled = true) la tienda no enseña el botón y la función responde
-- "no configurado". Todo lo nuevo es sólo para la llave de servicio.

create table if not exists app.online_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  order_id uuid not null references app.orders(id),
  provider text not null default 'mercadopago' check (provider in ('mercadopago')),
  status text not null default 'creado' check (status in ('creado', 'pendiente', 'aprobado', 'rechazado', 'cancelado', 'reembolsado')),
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'MXN',
  preference_id text,
  provider_payment_id text,
  method_detail text,
  payment_id uuid references app.payments(id),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists online_payments_order on app.online_payments(order_id);
create unique index if not exists online_payments_provider_id on app.online_payments(provider, provider_payment_id) where provider_payment_id is not null;
alter table app.online_payments enable row level security;
revoke all on app.online_payments from anon, authenticated;

-- ¿El club cobra en línea? Lo dice settings.paymentInstructions.online.
create or replace function private.cobra_en_linea(p_org uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select coalesce((o.settings->'paymentInstructions'->'online'->>'enabled')::boolean, false)
    from public.organizations o where o.id = p_org
$$;
revoke all on function private.cobra_en_linea(uuid) from public, anon, authenticated;

-- 1. Abrir el intento. Pide el folio además del id: sólo quien hizo el pedido los tiene.
create or replace function private.pago_en_linea_inicia(p_order_id uuid, p_folio text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare o app.orders%rowtype; v_falta numeric; v_id uuid; v_club text;
begin
  select * into o from app.orders where id = p_order_id and folio = btrim(coalesce(p_folio, '')) for update;
  if not found then raise exception 'Pedido no encontrado'; end if;
  if not private.cobra_en_linea(o.organization_id) then raise exception 'Este club todavía no cobra en línea'; end if;
  if o.status not in ('pending_payment', 'partial_payment') then raise exception 'Este pedido ya está pagado'; end if;
  v_falta := round(coalesce(o.total, 0) - private.order_paid_amount(o.organization_id, o.id), 2);
  if v_falta <= 0.004 then raise exception 'Este pedido ya está pagado'; end if;
  insert into app.online_payments(organization_id, order_id, amount) values (o.organization_id, o.id, v_falta) returning id into v_id;
  select coalesce(nullif(btrim(settings->>'brand'), ''), name) into v_club from public.organizations where id = o.organization_id;
  return jsonb_build_object('id', v_id, 'organizationId', o.organization_id, 'folio', o.folio, 'amount', v_falta, 'club', v_club,
    'customerName', o.customer_name, 'customerEmail', o.customer_email, 'customerPhone', o.customer_phone);
end $$;
revoke all on function private.pago_en_linea_inicia(uuid, text) from public, anon, authenticated;
grant execute on function private.pago_en_linea_inicia(uuid, text) to service_role;

create or replace function private.pago_en_linea_preferencia(p_id uuid, p_preference text)
returns void language sql security definer set search_path to '' as $$
  update app.online_payments set preference_id = p_preference, updated_at = now() where id = p_id
$$;
revoke all on function private.pago_en_linea_preferencia(uuid, text) from public, anon, authenticated;
grant execute on function private.pago_en_linea_preferencia(uuid, text) to service_role;

-- 3-4. El aviso, ya consultado contra Mercado Pago. p_status es el de Mercado
-- Pago (approved, pending, in_process, rejected, cancelled, refunded,
-- charged_back); p_method su payment_type_id (credit_card, debit_card,
-- ticket, bank_transfer, account_money...).
create or replace function private.pago_en_linea_aviso(p_id uuid, p_provider_payment_id text, p_status text, p_amount numeric, p_method text, p_detail text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  r app.online_payments%rowtype; o app.orders%rowtype; v_estado text; v_pay uuid; v_pagado numeric; v_falta numeric; v_monto numeric;
  v_metodo text := case when p_method in ('credit_card', 'debit_card', 'prepaid_card') then 'card'
                        when p_method = 'bank_transfer' then 'transfer' else 'other' end;
begin
  if coalesce(btrim(p_provider_payment_id), '') = '' then raise exception 'Falta el id del pago'; end if;
  select * into r from app.online_payments where id = p_id for update;
  if not found then raise exception 'Intento de pago no encontrado'; end if;
  v_estado := case p_status when 'approved' then 'aprobado' when 'rejected' then 'rechazado' when 'cancelled' then 'cancelado'
                when 'refunded' then 'reembolsado' when 'charged_back' then 'reembolsado' else 'pendiente' end;
  -- Ya se registró este pago: el aviso repetido no hace nada.
  if r.payment_id is not null and r.provider_payment_id = p_provider_payment_id and v_estado = 'aprobado' then
    return jsonb_build_object('ok', true, 'repetido', true, 'estado', r.status);
  end if;
  if v_estado <> 'aprobado' then
    update app.online_payments set status = case when r.payment_id is not null and v_estado <> 'reembolsado' then status else v_estado end,
      provider_payment_id = coalesce(provider_payment_id, p_provider_payment_id), method_detail = coalesce(p_detail, method_detail), updated_at = now()
     where id = p_id;
    if v_estado = 'reembolsado' and r.payment_id is not null then
      -- Un contracargo o reembolso no se deshace solo: se avisa para revisarlo a mano.
      insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload)
      values (r.organization_id, 'OnlinePaymentRefunded', 'order', r.order_id, jsonb_build_object('onlinePaymentId', r.id, 'paymentId', r.payment_id, 'providerPaymentId', p_provider_payment_id));
    end if;
    return jsonb_build_object('ok', true, 'estado', v_estado);
  end if;
  if abs(coalesce(p_amount, 0) - r.amount) > 0.01 then raise exception 'El monto pagado (%) no cuadra con el del pedido (%)', p_amount, r.amount; end if;
  select * into o from app.orders where id = r.order_id for update;
  v_pagado := private.order_paid_amount(o.organization_id, o.id);
  v_falta := round(coalesce(o.total, 0) - v_pagado, 2);
  update app.online_payments set status = 'aprobado', provider_payment_id = p_provider_payment_id, method_detail = p_detail, updated_at = now() where id = p_id;
  if v_falta <= 0.004 then
    -- Ya estaba pagado (pagó también por transferencia): no se cobra doble; se avisa para devolver.
    update app.online_payments set note = 'El pedido ya estaba pagado: devolver este pago' where id = p_id;
    insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload)
    values (o.organization_id, 'OnlinePaymentDuplicate', 'order', o.id, jsonb_build_object('onlinePaymentId', r.id, 'providerPaymentId', p_provider_payment_id, 'amount', p_amount));
    return jsonb_build_object('ok', true, 'estado', 'aprobado', 'duplicado', true);
  end if;
  v_monto := least(r.amount, v_falta);
  insert into app.payments(organization_id, player_id, amount, payment_date, method, reference, concept, status, source, category, idempotency_key,
    payer_type, payer_name, payment_purpose, credit_status, reconciliation_status, reconciled_at, reconciliation_reference, created_at, updated_at)
  values (o.organization_id, o.player_id, v_monto, (now() at time zone 'America/Mexico_City')::date, v_metodo, 'Mercado Pago ' || p_provider_payment_id,
    'Pago en línea pedido ' || o.folio, 'posted', 'mercadopago', 'Pedido Tienda', 'mp:' || p_provider_payment_id,
    'other', nullif(btrim(coalesce(o.customer_name, '')), ''), 'commerce', 'not_applicable', 'approved', now(), p_provider_payment_id, now(), now())
  returning id into v_pay;
  insert into app.order_payments(organization_id, order_id, payment_id, amount) values (o.organization_id, o.id, v_pay, v_monto);
  update app.orders set status = case when v_pagado + v_monto + 0.005 >= total then 'paid' else 'partial_payment' end, updated_at = now()
   where id = o.id and status in ('pending_payment', 'partial_payment');
  update app.online_payments set payment_id = v_pay where id = p_id;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload)
  values (o.organization_id, 'OrderPaymentPosted', 'order', o.id, jsonb_build_object('payment_id', v_pay, 'amount', v_monto, 'paid_total', v_pagado + v_monto, 'source', 'mercadopago'));
  return jsonb_build_object('ok', true, 'estado', 'aprobado', 'paymentId', v_pay, 'folio', o.folio);
end $$;
revoke all on function private.pago_en_linea_aviso(uuid, text, text, numeric, text, text) from public, anon, authenticated;
grant execute on function private.pago_en_linea_aviso(uuid, text, text, numeric, text, text) to service_role;

-- La función (llave de servicio) entra por PostgREST, que sólo ve el esquema
-- public: tres puertas que sólo abre service_role.
create or replace function public.v2_online_payment_start(order_id uuid, folio text)
returns jsonb language sql security definer set search_path to 'pg_catalog','private' as $$
  select private.pago_en_linea_inicia(order_id, folio)
$$;
revoke all on function public.v2_online_payment_start(uuid, text) from public, anon, authenticated;
grant execute on function public.v2_online_payment_start(uuid, text) to service_role;

create or replace function public.v2_online_payment_preference(attempt_id uuid, preference_id text)
returns void language sql security definer set search_path to 'pg_catalog','private' as $$
  select private.pago_en_linea_preferencia(attempt_id, preference_id)
$$;
revoke all on function public.v2_online_payment_preference(uuid, text) from public, anon, authenticated;
grant execute on function public.v2_online_payment_preference(uuid, text) to service_role;

create or replace function public.v2_online_payment_notice(attempt_id uuid, provider_payment_id text, status text, amount numeric, method text, detail text)
returns jsonb language sql security definer set search_path to 'pg_catalog','private' as $$
  select private.pago_en_linea_aviso(attempt_id, provider_payment_id, status, amount, method, detail)
$$;
revoke all on function public.v2_online_payment_notice(uuid, text, text, numeric, text, text) from public, anon, authenticated;
grant execute on function public.v2_online_payment_notice(uuid, text, text, numeric, text, text) to service_role;

-- La tienda pública sabe si enseñar "Pagar ahora" (y con quién).
create or replace function public.v2_public_payment_info(club_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_org uuid; v_s jsonb;
begin
  v_org := private.public_organization(club_key);
  if v_org is null then raise exception 'Club not found'; end if;
  select settings into v_s from public.organizations where id = v_org;
  return jsonb_build_object(
    'transfer', v_s->'paymentInstructions'->'transfer',
    'methods', coalesce(v_s->'paymentInstructions'->'methods', '[]'::jsonb),
    'delivery', nullif(trim(coalesce(v_s->'paymentInstructions'->>'delivery', '')), ''),
    'whatsapp', nullif(regexp_replace(coalesce(v_s->>'whatsappNumber', ''), '\D', '', 'g'), ''),
    'online', case when private.cobra_en_linea(v_org) then 'mercadopago' end);
end
$$;
