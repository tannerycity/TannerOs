-- h46 (26/10/2026): Códigos de la tienda. Presidencia: "que otras cosas puedo
-- crear con códigos en la tienda... dale con los códigos". Del embajador:
-- "las dos" (que vea sus ventas y que gane algo).
--  * Tres tipos: descuento (% o $), regalo (una pieza de talla única) y
--    nombre y número gratis. Con vigencia, compra mínima, límite de usos
--    (total y por cliente) y un interruptor para pausarlo.
--  * Embajador opcional: nombre, teléfono y premio (% de lo que vende, en
--    dinero o crédito). Cada código trae una liga privada para que el
--    embajador vea sus ventas y su premio, sin datos de los clientes.
--  * Tope: arriba del 10% de la compra (o premio arriba de 10%) sólo lo
--    guarda Presidencia, igual que las cotizaciones (h44).
--  * La tienda pública manda el código como una línea {kind:'code'}; el
--    servidor lo vuelve a validar, pone el descuento en el pedido (discount,
--    total) y guarda el premio que genera (code_reward).
--  * El premio cuenta cuando el pedido ya se pagó; lo que se le paga al
--    embajador queda anotado (store_code_payouts).
create table if not exists app.store_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  code text not null check (code ~ '^[A-Z0-9]{3,20}$'),
  kind text not null check (kind in ('descuento', 'regalo', 'personalizacion')),
  discount_type text check (discount_type in ('pct', 'amount')),
  discount_value numeric(12,2) not null default 0 check (discount_value >= 0),
  gift_product_id uuid references app.products(id),
  min_purchase numeric(12,2) not null default 0 check (min_purchase >= 0),
  ambassador_name text,
  ambassador_phone text,
  reward_pct numeric(5,2) not null default 0 check (reward_pct >= 0 and reward_pct <= 30),
  reward_kind text not null default 'dinero' check (reward_kind in ('dinero', 'credito')),
  starts_on date,
  ends_on date,
  max_uses integer check (max_uses is null or max_uses > 0),
  max_uses_per_customer integer check (max_uses_per_customer is null or max_uses_per_customer > 0),
  active boolean not null default true,
  share_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint store_codes_descuento check (kind <> 'descuento' or (discount_type is not null and discount_value > 0)),
  constraint store_codes_pct check (discount_type is distinct from 'pct' or discount_value <= 90),
  constraint store_codes_regalo check (kind <> 'regalo' or gift_product_id is not null),
  constraint store_codes_fechas check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create unique index if not exists store_codes_org_code on app.store_codes(organization_id, code) where archived_at is null;

create table if not exists app.store_code_payouts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  code_id uuid not null references app.store_codes(id),
  amount numeric(12,2) not null check (amount > 0),
  method text not null check (method in ('efectivo', 'transferencia', 'credito')),
  note text,
  paid_on date not null default current_date,
  created_by uuid,
  created_at timestamptz not null default now(),
  voided_at timestamptz
);
create index if not exists store_code_payouts_code on app.store_code_payouts(code_id);

alter table app.orders add column if not exists store_code_id uuid references app.store_codes(id);
alter table app.orders add column if not exists code_reward numeric(12,2) not null default 0;
create index if not exists orders_store_code on app.orders(store_code_id) where store_code_id is not null;

alter table app.store_codes enable row level security;
alter table app.store_code_payouts enable row level security;
revoke all on app.store_codes from anon, authenticated;
revoke all on app.store_code_payouts from anon, authenticated;

/* ---------- Reglas ---------- */
create or replace function private.hoy_mx()
returns date language sql stable set search_path to '' as $$
  select (now() at time zone 'America/Mexico_City')::date
$$;
revoke all on function private.hoy_mx() from public, anon;

create or replace function private.pesos(p numeric)
returns text language sql immutable set search_path to '' as $$
  select '$' || case when p = round(p) then to_char(p, 'FM999,999,990') else to_char(p, 'FM999,999,990.00') end
$$;
revoke all on function private.pesos(numeric) from public, anon;

-- Lo que dice el código, como lo lee la familia: "10% de descuento".
create or replace function private.etiqueta_codigo(c app.store_codes)
returns text language sql stable security definer set search_path to '' as $$
  select case c.kind
    when 'descuento' then case when c.discount_type = 'pct' then trim(to_char(c.discount_value, 'FM990.##'), '.') || '% de descuento'
                               else private.pesos(c.discount_value) || ' de descuento' end
    when 'regalo' then coalesce((select p.name from app.products p where p.id = c.gift_product_id), 'Regalo') || ' de regalo'
    else 'Nombre y número gratis' end
    || case when c.min_purchase > 0 then ' en compras desde ' || private.pesos(c.min_purchase) else '' end
$$;
revoke all on function private.etiqueta_codigo(app.store_codes) from public, anon;

-- Valida un código para una compra; si no se puede, dice por qué en palabras
-- de la familia. p_phone puede ir vacío (se revisa otra vez al pedir).
create or replace function private.valida_codigo(p_org uuid, p_code text, p_phone text, p_subtotal numeric)
returns app.store_codes language plpgsql stable security definer set search_path to '' as $$
declare c app.store_codes; v_n int; v_hoy date := private.hoy_mx();
begin
  select * into c from app.store_codes
   where organization_id = p_org and archived_at is null
     and code = upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  if c.id is null then raise exception 'Ese código no existe. Revisa cómo se escribe.'; end if;
  if not c.active then raise exception 'Ese código está pausado.'; end if;
  if c.starts_on is not null and v_hoy < c.starts_on then raise exception 'Ese código empieza el %.', to_char(c.starts_on, 'DD/MM'); end if;
  if c.ends_on is not null and v_hoy > c.ends_on then raise exception 'Ese código ya venció.'; end if;
  if c.max_uses is not null then
    select count(*) into v_n from app.orders where store_code_id = c.id and status not in ('cancelled', 'refunded');
    if v_n >= c.max_uses then raise exception 'Ese código ya se terminó.'; end if;
  end if;
  if c.max_uses_per_customer is not null and p_phone is not null then
    select count(*) into v_n from app.orders where store_code_id = c.id and status not in ('cancelled', 'refunded') and customer_phone = p_phone;
    if v_n >= c.max_uses_per_customer then raise exception 'Ya usaste este código.'; end if;
  end if;
  if c.min_purchase > 0 and coalesce(p_subtotal, 0) < c.min_purchase then
    raise exception 'Este código aplica en compras desde %.', private.pesos(c.min_purchase);
  end if;
  if c.kind = 'regalo' and not exists (select 1 from app.products p where p.id = c.gift_product_id and p.active and p.archived_at is null) then
    raise exception 'El regalo de este código ya no está disponible.';
  end if;
  return c;
end $$;
revoke all on function private.valida_codigo(uuid, text, text, numeric) from public, anon;

-- Pone el código en un pedido recién hecho y devuelve el total nuevo.
create or replace function private.aplica_codigo(p_order_id uuid, p_code text)
returns numeric language plpgsql security definer set search_path to '' as $$
declare o app.orders; c app.store_codes; g app.products; v_desc numeric := 0; v_total numeric; v_talla text;
begin
  select * into o from app.orders where id = p_order_id for update;
  if not exists (select 1 from app.order_items where order_id = p_order_id) then raise exception 'Order needs at least one item'; end if;
  c := private.valida_codigo(o.organization_id, p_code, o.customer_phone, o.subtotal);
  if c.kind = 'descuento' then
    v_desc := case when c.discount_type = 'pct' then round(o.subtotal * c.discount_value / 100, 2) else least(c.discount_value, o.subtotal) end;
  elsif c.kind = 'personalizacion' then
    select coalesce(sum(quantity * coalesce((attributes->>'recargoPersonalizacion')::numeric, 0)), 0) into v_desc
      from app.order_items where order_id = p_order_id;
  elsif c.kind = 'regalo' then
    select * into g from app.products where id = c.gift_product_id;
    v_talla := case when jsonb_typeof(g.sizes) = 'array' and jsonb_array_length(g.sizes) = 1 then g.sizes->>0 end;
    insert into app.order_items(organization_id, order_id, product_id, description, quantity, unit_price, unit_cost, attributes)
    values (o.organization_id, p_order_id, g.id, g.name, 1, 0, g.cost,
            jsonb_strip_nulls(jsonb_build_object('talla', v_talla, 'size', v_talla, 'regalo', true, 'codigo', c.code)));
  end if;
  v_total := greatest(0, o.subtotal - v_desc);
  update app.orders
     set discount = v_desc, total = v_total, discount_reason = 'Código ' || c.code,
         store_code_id = c.id, code_reward = round(v_total * c.reward_pct / 100, 2),
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('codigo', c.code), updated_at = now()
   where id = p_order_id;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload)
  values (o.organization_id, 'StoreCodeUsed', 'order', p_order_id,
          jsonb_build_object('code', c.code, 'codeId', c.id, 'discount', v_desc, 'total', v_total));
  return v_total;
end $$;
revoke all on function private.aplica_codigo(uuid, text) from public, anon;

-- Lo que lleva un código: usos, ventas pagadas, premio ganado y pagado.
create or replace function private.stats_codigo(p_code_id uuid)
returns jsonb language sql stable security definer set search_path to '' as $$
  with o as (
    select status, total, discount, code_reward,
           status in ('paid', 'in_production', 'ready', 'delivered') as pagado
      from app.orders where store_code_id = p_code_id and status not in ('cancelled', 'refunded')
  ), pg as (
    select coalesce(sum(amount), 0) as pagado from app.store_code_payouts where code_id = p_code_id and voided_at is null
  )
  select jsonb_build_object(
    'uses', (select count(*) from o),
    'paidOrders', (select count(*) from o where pagado),
    'sold', (select coalesce(sum(total), 0) from o where pagado),
    'pendingSales', (select coalesce(sum(total), 0) from o where not pagado),
    'discountGiven', (select coalesce(sum(discount), 0) from o where pagado),
    'rewardEarned', (select coalesce(sum(code_reward), 0) from o where pagado),
    'rewardPaid', (select pagado from pg),
    'rewardOwed', greatest(0, (select coalesce(sum(code_reward), 0) from o where pagado) - (select pagado from pg)))
$$;
revoke all on function private.stats_codigo(uuid) from public, anon;

/* ---------- La tienda pública manda el código ---------- */
do $$
declare d text;
begin
  d := pg_get_functiondef('private.public_create_cart_order(text,text,text,text,jsonb,text,jsonb)'::regprocedure);
  if position('aplica_codigo' in d) = 0 then
    d := replace(d, 'v_nombre text; v_numero text; v_kind text; v_manga text;', 'v_nombre text; v_numero text; v_kind text; v_manga text; v_codigo text;');
    d := replace(d, E'    v_kind := coalesce(nullif(it->>''kind'', ''''), ''product'');\n',
      E'    v_kind := coalesce(nullif(it->>''kind'', ''''), ''product'');\n    if v_kind = ''code'' then v_codigo := nullif(btrim(coalesce(it->>''code'', '''')), ''''); v_count := v_count - 1; continue; end if;\n');
    d := replace(d, '  v_subtotal := v_subtotal + private.aplica_recargo_manga(v_order_id);',
      '  if v_count = 0 then raise exception ''Order needs at least one item''; end if;
  v_subtotal := v_subtotal + private.aplica_recargo_manga(v_order_id);');
    d := replace(d, '  update app.orders set subtotal = v_subtotal, total = v_subtotal, updated_at = now() where id = v_order_id;',
      '  update app.orders set subtotal = v_subtotal, total = v_subtotal, updated_at = now() where id = v_order_id;
  if v_codigo is not null then v_subtotal := private.aplica_codigo(v_order_id, v_codigo); end if;');
    d := replace(d, '''total'', v_subtotal, ''items'', v_count);', '''total'', v_subtotal, ''items'', v_count, ''discount'', (select discount from app.orders where id = v_order_id), ''code'', v_codigo);');
    if position('v_codigo text;' in d) = 0 or position('v_kind = ''code''' in d) = 0 or position('if v_count = 0' in d) = 0 or position('private.aplica_codigo' in d) = 0 or position('''code'', v_codigo' in d) = 0 then
      raise exception 'No se pudo parchar public_create_cart_order';
    end if;
    execute d;
  end if;
end $$;

-- La familia escribe el código antes de pedir: se valida y se dice qué hace.
create or replace function public.v2_public_check_code(club_key text, code text, subtotal numeric default 0, customer_phone text default null)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_org uuid; c app.store_codes; v_phone text;
begin
  perform private.enforce_public_rate_limit('store_code', 40, interval '1 hour');
  v_org := private.public_organization(club_key);
  if v_org is null or not private.module_enabled(v_org, 'commerce') then raise exception 'Club not found'; end if;
  v_phone := case when nullif(btrim(coalesce(customer_phone, '')), '') is null then null else private.normalize_public_phone(customer_phone) end;
  begin
    c := private.valida_codigo(v_org, code, v_phone, coalesce(subtotal, 0));
  exception when raise_exception then
    return jsonb_build_object('ok', false, 'motivo', sqlerrm);
  end;
  return jsonb_build_object('ok', true, 'code', c.code, 'kind', c.kind, 'label', private.etiqueta_codigo(c),
    'discountType', c.discount_type, 'discountValue', c.discount_value, 'minPurchase', c.min_purchase,
    'giftProductId', c.gift_product_id, 'giftName', (select p.name from app.products p where p.id = c.gift_product_id),
    'endsOn', c.ends_on);
end $$;
revoke all on function public.v2_public_check_code(text, text, numeric, text) from public;
grant execute on function public.v2_public_check_code(text, text, numeric, text) to anon, authenticated;

-- La liga del embajador: sus ventas y su premio, sin nombres de clientes.
create or replace function public.v2_public_code_stats(token text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare c app.store_codes;
begin
  perform private.enforce_public_rate_limit('store_code_stats', 60, interval '1 hour');
  select * into c from app.store_codes where share_token = btrim(coalesce(token, '')) and archived_at is null;
  if c.id is null then raise exception 'Esta liga ya no existe.'; end if;
  return jsonb_build_object('code', c.code, 'ambassador', c.ambassador_name, 'label', private.etiqueta_codigo(c),
    'club', (select o.name from public.organizations o where o.id = c.organization_id),
    'active', c.active and (c.ends_on is null or c.ends_on >= private.hoy_mx()), 'endsOn', c.ends_on,
    'rewardPct', c.reward_pct, 'rewardKind', c.reward_kind, 'stats', private.stats_codigo(c.id),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('date', (x.created_at at time zone 'America/Mexico_City')::date, 'total', x.total,
        'paid', x.status in ('paid', 'in_production', 'ready', 'delivered'), 'reward', x.code_reward) order by x.created_at desc)
      from (select * from app.orders where store_code_id = c.id and status not in ('cancelled', 'refunded') order by created_at desc limit 20) x), '[]'::jsonb));
end $$;
revoke all on function public.v2_public_code_stats(text) from public;
grant execute on function public.v2_public_code_stats(text) to anon, authenticated;

/* ---------- Administrar (Catálogo → Códigos) ---------- */
create or replace function private.puede_pagar_premios(p_org uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select private.is_presidency(p_org) or private.has_module_access(p_org, 'commerce_finance', true)
$$;
revoke all on function private.puede_pagar_premios(uuid) from public, anon;

create or replace function private.query_store_codes(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_hoy date := private.hoy_mx();
begin
  if not private.can_edit_catalog(p_org) then raise exception 'No tienes permiso para editar el catálogo'; end if;
  return jsonb_build_object('isPresidency', private.is_presidency(p_org), 'canPay', private.puede_pagar_premios(p_org), 'cap', 10,
    'codes', coalesce((select jsonb_agg(x.j order by x.creado desc) from (
      select c.created_at creado, jsonb_build_object('id', c.id, 'code', c.code, 'kind', c.kind, 'discountType', c.discount_type,
        'discountValue', c.discount_value, 'giftProductId', c.gift_product_id,
        'giftName', (select p.name from app.products p where p.id = c.gift_product_id), 'minPurchase', c.min_purchase,
        'ambassadorName', c.ambassador_name, 'ambassadorPhone', c.ambassador_phone, 'rewardPct', c.reward_pct, 'rewardKind', c.reward_kind,
        'startsOn', c.starts_on, 'endsOn', c.ends_on, 'maxUses', c.max_uses, 'maxUsesPerCustomer', c.max_uses_per_customer,
        'active', c.active, 'shareToken', c.share_token, 'note', c.note, 'label', private.etiqueta_codigo(c),
        'estado', case when not c.active then 'pausado'
                       when c.ends_on is not null and c.ends_on < v_hoy then 'vencido'
                       when c.starts_on is not null and c.starts_on > v_hoy then 'programado'
                       when c.max_uses is not null and (select count(*) from app.orders o where o.store_code_id = c.id and o.status not in ('cancelled', 'refunded')) >= c.max_uses then 'agotado'
                       else 'activo' end,
        'stats', private.stats_codigo(c.id),
        'payouts', coalesce((select jsonb_agg(jsonb_build_object('id', y.id, 'amount', y.amount, 'method', y.method, 'note', y.note, 'paidOn', y.paid_on) order by y.paid_on desc, y.created_at desc)
          from app.store_code_payouts y where y.code_id = c.id and y.voided_at is null), '[]'::jsonb)) j
      from app.store_codes c where c.organization_id = p_org and c.archived_at is null) x), '[]'::jsonb));
end $$;
revoke all on function private.query_store_codes(uuid) from public, anon;

create or replace function private.command_save_store_code(p_org uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_code text := upper(regexp_replace(coalesce(p->>'code', ''), '\s', '', 'g'));
  v_kind text := p->>'kind';
  v_type text := case when v_kind = 'descuento' then p->>'discountType' end;
  v_value numeric := case when v_kind = 'descuento' then coalesce(nullif(p->>'discountValue', '')::numeric, 0) else 0 end;
  v_gift uuid := case when v_kind = 'regalo' then nullif(p->>'giftProductId', '')::uuid end;
  v_min numeric := coalesce(nullif(p->>'minPurchase', '')::numeric, 0);
  v_reward numeric := coalesce(nullif(p->>'rewardPct', '')::numeric, 0);
  v_pres boolean := private.is_presidency(p_org);
  v_equiv numeric; g app.products; v_antes app.store_codes;
begin
  if not private.can_edit_catalog(p_org) then raise exception 'No tienes permiso para editar el catálogo'; end if;
  if v_code !~ '^[A-Z0-9]{3,20}$' then raise exception 'El código lleva de 3 a 20 letras o números, sin espacios ni acentos.'; end if;
  if v_kind is null or v_kind not in ('descuento', 'regalo', 'personalizacion') then raise exception 'Elige qué hace el código.'; end if;
  if v_min < 0 or v_reward < 0 or v_reward > 30 then raise exception 'Revisa la compra mínima y el premio (de 0 a 30%%).'; end if;
  if v_kind = 'descuento' then
    if v_type not in ('pct', 'amount') or v_value <= 0 then raise exception 'Escribe cuánto descuenta.'; end if;
    if v_type = 'pct' and v_value > 90 then raise exception 'El descuento va de 1 a 90%%.'; end if;
    v_equiv := case when v_type = 'pct' then v_value when v_min > 0 then v_value / v_min * 100 else 100 end;
  elsif v_kind = 'regalo' then
    select * into g from app.products where id = v_gift and organization_id = p_org and archived_at is null;
    if g.id is null then raise exception 'Elige el regalo.'; end if;
    if jsonb_typeof(g.sizes) = 'array' and jsonb_array_length(g.sizes) > 1 then raise exception 'El regalo tiene que ser de talla única (una gorra, unas calcetas universales).'; end if;
    v_equiv := case when v_min > 0 then coalesce(g.price, 0) / v_min * 100 else 100 end;
  else
    v_equiv := 0;
  end if;
  if v_equiv > 10 and not v_pres then
    raise exception 'Arriba del 10%% de la compra lo autoriza Presidencia. Sube la compra mínima o baja el descuento.';
  end if;
  if v_reward > 10 and not v_pres then raise exception 'Un premio arriba del 10%% lo autoriza Presidencia.'; end if;
  if nullif(p->>'endsOn', '') is not null and nullif(p->>'startsOn', '') is not null and (p->>'endsOn')::date < (p->>'startsOn')::date then
    raise exception 'La fecha de fin va después de la de inicio.';
  end if;
  if exists (select 1 from app.store_codes where organization_id = p_org and archived_at is null and code = v_code and id is distinct from v_id) then
    raise exception 'Ya hay un código %.', v_code;
  end if;

  if v_id is null then
    insert into app.store_codes(organization_id, code, kind, discount_type, discount_value, gift_product_id, min_purchase,
      ambassador_name, ambassador_phone, reward_pct, reward_kind, starts_on, ends_on, max_uses, max_uses_per_customer, note, created_by)
    values (p_org, v_code, v_kind, v_type, v_value, v_gift, v_min,
      nullif(btrim(coalesce(p->>'ambassadorName', '')), ''), nullif(regexp_replace(coalesce(p->>'ambassadorPhone', ''), '\D', '', 'g'), ''),
      v_reward, case when p->>'rewardKind' = 'credito' then 'credito' else 'dinero' end,
      nullif(p->>'startsOn', '')::date, nullif(p->>'endsOn', '')::date,
      nullif(p->>'maxUses', '')::int, nullif(p->>'maxUsesPerCustomer', '')::int, nullif(btrim(coalesce(p->>'note', '')), ''), (select auth.uid()))
    returning id into v_id;
  else
    select * into v_antes from app.store_codes where id = v_id and organization_id = p_org and archived_at is null for update;
    if v_antes.id is null then raise exception 'Ese código ya no existe.'; end if;
    update app.store_codes set code = v_code, kind = v_kind, discount_type = v_type, discount_value = v_value, gift_product_id = v_gift,
      min_purchase = v_min, ambassador_name = nullif(btrim(coalesce(p->>'ambassadorName', '')), ''),
      ambassador_phone = nullif(regexp_replace(coalesce(p->>'ambassadorPhone', ''), '\D', '', 'g'), ''),
      reward_pct = v_reward, reward_kind = case when p->>'rewardKind' = 'credito' then 'credito' else 'dinero' end,
      starts_on = nullif(p->>'startsOn', '')::date, ends_on = nullif(p->>'endsOn', '')::date,
      max_uses = nullif(p->>'maxUses', '')::int, max_uses_per_customer = nullif(p->>'maxUsesPerCustomer', '')::int,
      note = nullif(btrim(coalesce(p->>'note', '')), ''), updated_at = now()
     where id = v_id;
  end if;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_org, 'StoreCodeSaved', 'store_code', v_id, jsonb_build_object('code', v_code, 'kind', v_kind, 'new', v_antes.id is null), (select auth.uid()));
  return jsonb_build_object('id', v_id, 'code', v_code);
end $$;
revoke all on function private.command_save_store_code(uuid, jsonb) from public, anon;

create or replace function private.command_set_store_code(p_org uuid, p_id uuid, p_action text)
returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  if not private.can_edit_catalog(p_org) then raise exception 'No tienes permiso para editar el catálogo'; end if;
  if p_action not in ('pausar', 'activar', 'archivar') then raise exception 'Acción no válida'; end if;
  update app.store_codes
     set active = p_action = 'activar', archived_at = case when p_action = 'archivar' then now() else archived_at end, updated_at = now()
   where id = p_id and organization_id = p_org and archived_at is null;
  if not found then raise exception 'Ese código ya no existe.'; end if;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_org, 'StoreCodeChanged', 'store_code', p_id, jsonb_build_object('action', p_action), (select auth.uid()));
  return jsonb_build_object('id', p_id, 'action', p_action);
end $$;
revoke all on function private.command_set_store_code(uuid, uuid, text) from public, anon;

create or replace function private.command_code_payout(p_org uuid, p_code_id uuid, p_amount numeric, p_method text, p_note text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_debe numeric; v_id uuid;
begin
  if not private.puede_pagar_premios(p_org) then raise exception 'Sólo Presidencia o Finanzas pagan premios.'; end if;
  if not exists (select 1 from app.store_codes where id = p_code_id and organization_id = p_org) then raise exception 'Ese código ya no existe.'; end if;
  if p_method not in ('efectivo', 'transferencia', 'credito') then raise exception 'Elige cómo se pagó.'; end if;
  v_debe := (private.stats_codigo(p_code_id)->>'rewardOwed')::numeric;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Escribe cuánto se pagó.'; end if;
  if p_amount > v_debe then raise exception 'Se le deben %: no se le puede pagar más.', private.pesos(v_debe); end if;
  insert into app.store_code_payouts(organization_id, code_id, amount, method, note, paid_on, created_by)
  values (p_org, p_code_id, p_amount, p_method, nullif(btrim(coalesce(p_note, '')), ''), private.hoy_mx(), (select auth.uid()))
  returning id into v_id;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_org, 'StoreCodeRewardPaid', 'store_code', p_code_id, jsonb_build_object('payoutId', v_id, 'amount', p_amount, 'method', p_method), (select auth.uid()));
  return jsonb_build_object('id', v_id);
end $$;
revoke all on function private.command_code_payout(uuid, uuid, numeric, text, text) from public, anon;

create or replace function private.command_void_code_payout(p_org uuid, p_payout_id uuid)
returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  if not private.puede_pagar_premios(p_org) then raise exception 'Sólo Presidencia o Finanzas pagan premios.'; end if;
  update app.store_code_payouts set voided_at = now() where id = p_payout_id and organization_id = p_org and voided_at is null;
  if not found then raise exception 'Ese pago ya no existe.'; end if;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_org, 'StoreCodeRewardVoided', 'store_code_payout', p_payout_id, '{}'::jsonb, (select auth.uid()));
  return jsonb_build_object('id', p_payout_id);
end $$;
revoke all on function private.command_void_code_payout(uuid, uuid) from public, anon;

create or replace function public.v2_store_codes(organization_id uuid)
returns jsonb language sql security definer set search_path to 'pg_catalog','private' as $$
  select private.query_store_codes(organization_id)
$$;
revoke all on function public.v2_store_codes(uuid) from public, anon;
grant execute on function public.v2_store_codes(uuid) to authenticated;

create or replace function public.v2_save_store_code(organization_id uuid, store_code jsonb)
returns jsonb language sql security definer set search_path to 'pg_catalog','private' as $$
  select private.command_save_store_code(organization_id, store_code)
$$;
revoke all on function public.v2_save_store_code(uuid, jsonb) from public, anon;
grant execute on function public.v2_save_store_code(uuid, jsonb) to authenticated;

create or replace function public.v2_set_store_code(organization_id uuid, code_id uuid, action text)
returns jsonb language sql security definer set search_path to 'pg_catalog','private' as $$
  select private.command_set_store_code(organization_id, code_id, action)
$$;
revoke all on function public.v2_set_store_code(uuid, uuid, text) from public, anon;
grant execute on function public.v2_set_store_code(uuid, uuid, text) to authenticated;

create or replace function public.v2_store_code_payout(organization_id uuid, code_id uuid, amount numeric, method text, note text default null)
returns jsonb language sql security definer set search_path to 'pg_catalog','private' as $$
  select private.command_code_payout(organization_id, code_id, amount, method, note)
$$;
revoke all on function public.v2_store_code_payout(uuid, uuid, numeric, text, text) from public, anon;
grant execute on function public.v2_store_code_payout(uuid, uuid, numeric, text, text) to authenticated;

create or replace function public.v2_void_store_code_payout(organization_id uuid, payout_id uuid)
returns jsonb language sql security definer set search_path to 'pg_catalog','private' as $$
  select private.command_void_code_payout(organization_id, payout_id)
$$;
revoke all on function public.v2_void_store_code_payout(uuid, uuid) from public, anon;
grant execute on function public.v2_void_store_code_payout(uuid, uuid) to authenticated;
