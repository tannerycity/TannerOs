-- h25 · Cobro con desglose (21/10/2026).
-- Presidencia: "nos pagan 1,500: 1,000 de inscripción y 500 de mensualidad;
-- nos cuesta un huevo registrarlo por separado". Un solo cobro con varios
-- conceptos (mensualidad, recargo, inscripción, uniforme, arbitraje...) y
-- hasta dos métodos (efectivo + transferencia). Todo o nada: o entran todas
-- las partes o ninguna. Por debajo cada parte sigue siendo el pago de siempre
-- (Conciliación y Contabilidad no cambian), ligadas por un folio.
--
-- La inscripción pasa a ser un cargo (charge_type 'registration'): así se
-- puede abonar y Cobranza ve "debe inscripción". No genera recargo:
-- assess_late_fees sólo mira monthly_fee y academy_fee.

create table app.collection_tickets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  numero bigint generated always as identity,
  player_id uuid not null,
  payment_date date not null,
  total numeric not null check (total > 0),
  items jsonb not null,
  methods jsonb not null,
  collected_by_name text,
  observations text check (observations is null or length(observations) <= 300),
  idempotency_key text not null,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key),
  foreign key (player_id, organization_id) references app.players(id, organization_id)
);
create index collection_tickets_por_tanner on app.collection_tickets(organization_id, player_id, created_at desc);
alter table app.collection_tickets enable row level security;
revoke all on app.collection_tickets from public, anon, authenticated;
create trigger zz_club_read_only before insert or update or delete on app.collection_tickets
  for each row execute function private.guard_club_read_only();

alter table app.payments add column ticket_id uuid references app.collection_tickets(id) on delete set null;
create index payments_por_ticket on app.payments(ticket_id) where ticket_id is not null;

-- Nombre corto de un cargo para el concepto del pago y para la pantalla.
create or replace function private.etiqueta_cargo(p_type text, p_period date, p_concept text)
returns text language sql immutable set search_path to 'pg_catalog'
as $$
  select case p_type
    when 'monthly_fee' then 'Mensualidad'
    when 'monthly_fee_sponsor' then 'Mensualidad'
    when 'late_fee' then 'Recargo'
    when 'academy_fee' then 'Academia'
    when 'registration' then 'Inscripción'
    else coalesce(nullif(btrim(p_concept), ''), 'Cargo')
  end
  || case when p_type in ('monthly_fee','monthly_fee_sponsor','late_fee','academy_fee') and p_period is not null
       then ' ' || (array['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'])[extract(month from p_period)::int]
       else '' end
$$;
revoke all on function private.etiqueta_cargo(text, date, text) from public, anon, authenticated;

create or replace function private.command_collect_ticket(
  p_organization_id uuid, p_player_id uuid, p_payment_date date, p_items jsonb, p_methods jsonb,
  p_collected_by_name text, p_observations text, p_idempotency_key text
) returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog', 'public', 'app', 'private'
as $$
declare
  v_actor uuid := (select auth.uid());
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_date date := coalesce(p_payment_date, (now() at time zone 'America/Mexico_City')::date);
  v_ticket app.collection_tickets%rowtype;
  v_items jsonb := '[]'; v_methods jsonb := '[]'; v_pieces jsonb := '[]';
  it jsonb; m jsonb; g record; pc record;
  v_kind text; v_amount numeric; v_total numeric := 0; v_mtotal numeric := 0;
  v_charge record; v_order record; v_seen uuid[] := '{}'; v_id uuid; v_pay uuid; v_profile uuid;
  v_i int := 0; v_mi int; v_mrest numeric[]; v_mname text[]; v_mref text[]; v_rest numeric; v_take numeric;
  v_payments uuid[] := '{}'; v_n int := 0; v_label text; v_bal numeric;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if not private.has_any_module_access(p_organization_id, array['billing','taquilla'], true) then raise exception 'Not authorized'; end if;
  if length(v_key) < 8 then raise exception 'Idempotency key required'; end if;

  select * into v_ticket from app.collection_tickets where organization_id = p_organization_id and idempotency_key = v_key;
  if found then
    return jsonb_build_object('ok', true, 'ticketId', v_ticket.id, 'folio', v_ticket.numero, 'repetido', true,
      'payments', (select coalesce(jsonb_agg(id), '[]') from app.payments where ticket_id = v_ticket.id));
  end if;

  if not exists (select 1 from app.players where id = p_player_id and organization_id = p_organization_id) then
    raise exception 'Tanner no encontrado';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 12 then
    raise exception 'El cobro lleva de 1 a 12 conceptos';
  end if;
  if jsonb_typeof(p_methods) <> 'array' or jsonb_array_length(p_methods) not between 1 and 2 then
    raise exception 'El cobro se paga con uno o dos métodos';
  end if;

  -- Métodos
  for m in select * from jsonb_array_elements(p_methods) loop
    v_amount := round((m->>'amount')::numeric, 2);
    if v_amount is null or v_amount <= 0 then raise exception 'Cada método lleva un monto mayor a cero'; end if;
    if coalesce(m->>'method', '') not in ('cash','transfer','card','other') then raise exception 'Método inválido'; end if;
    if (m->>'method') = any(coalesce(v_mname, '{}')) then raise exception 'No repitas el mismo método'; end if;
    v_mname := coalesce(v_mname, '{}') || (m->>'method');
    v_mrest := coalesce(v_mrest, '{}') || v_amount;
    v_mref := coalesce(v_mref, '{}') || nullif(btrim(coalesce(m->>'reference', '')), '');
    v_mtotal := v_mtotal + v_amount;
  end loop;

  -- Conceptos: se validan todos antes de escribir nada.
  for it in select * from jsonb_array_elements(p_items) loop
    v_i := v_i + 1;
    v_kind := coalesce(it->>'kind', '');
    v_amount := round((it->>'amount')::numeric, 2);
    if v_amount is null or v_amount <= 0 then raise exception 'Cada concepto lleva un monto mayor a cero'; end if;
    if v_amount > 100000 then raise exception 'Monto fuera de rango'; end if;
    if v_kind = 'charge' then
      select cb.id, cb.charge_type, cb.billing_period, cb.concept, cb.balance_due, cb.payer_type, c.status
        into v_charge
        from app.charges c join app.charge_balances cb on cb.id = c.id
       where c.id = (it->>'charge_id')::uuid and c.organization_id = p_organization_id and c.player_id = p_player_id
       for update of c;
      if not found or v_charge.status <> 'posted' then raise exception 'Uno de los cargos ya no existe'; end if;
      if coalesce(v_charge.payer_type, 'guardian') = 'sponsor' then raise exception 'Ese cargo lo paga un patrocinador: cóbralo aparte'; end if;
      if v_charge.id = any(v_seen) then raise exception 'Un cargo viene repetido'; end if;
      if v_amount > v_charge.balance_due + 0.005 then
        raise exception '% sólo debe $%', private.etiqueta_cargo(v_charge.charge_type, v_charge.billing_period, v_charge.concept), v_charge.balance_due;
      end if;
      v_seen := v_seen || v_charge.id;
      v_items := v_items || jsonb_build_object('i', v_i, 'kind', 'charge', 'amount', v_amount, 'charge_id', v_charge.id,
        'category', case when v_charge.charge_type = 'registration' then 'Inscripción' else 'Mensualidad' end,
        'label', private.etiqueta_cargo(v_charge.charge_type, v_charge.billing_period, v_charge.concept));
    elsif v_kind = 'registration' then
      if round(coalesce((it->>'total')::numeric, v_amount), 2) < v_amount then raise exception 'El abono no puede ser mayor que la inscripción'; end if;
      if round(coalesce((it->>'total')::numeric, v_amount), 2) > 100000 then raise exception 'Monto fuera de rango'; end if;
      v_items := v_items || jsonb_build_object('i', v_i, 'kind', 'registration', 'amount', v_amount,
        'total', round(coalesce((it->>'total')::numeric, v_amount), 2), 'category', 'Inscripción', 'label', 'Inscripción');
    elsif v_kind = 'order' then
      select o.id, o.folio, o.total, o.status into v_order from app.orders o
       where o.id = (it->>'order_id')::uuid and o.organization_id = p_organization_id and o.player_id = p_player_id;
      if not found then raise exception 'Ese pedido no es de este Tanner'; end if;
      if v_order.id = any(v_seen) then raise exception 'Un pedido viene repetido'; end if;
      v_seen := v_seen || v_order.id;
      v_items := v_items || jsonb_build_object('i', v_i, 'kind', 'order', 'amount', v_amount, 'order_id', v_order.id,
        'label', 'Pedido ' || v_order.folio);
    elsif v_kind = 'income' then
      if length(btrim(coalesce(it->>'category', ''))) not between 2 and 60 then raise exception 'Cada ingreso lleva categoría'; end if;
      v_items := v_items || jsonb_build_object('i', v_i, 'kind', 'income', 'amount', v_amount,
        'category', btrim(it->>'category'),
        'label', left(coalesce(nullif(btrim(coalesce(it->>'concept', '')), ''), btrim(it->>'category')), 80));
    elsif v_kind = 'abono' then
      v_items := v_items || jsonb_build_object('i', v_i, 'kind', 'abono', 'amount', v_amount, 'category', 'Mensualidad', 'label', 'Abono a su cuenta');
    else
      raise exception 'Concepto desconocido';
    end if;
    v_total := v_total + v_amount;
  end loop;
  if abs(v_total - v_mtotal) > 0.005 then
    raise exception 'Los métodos suman $% y los conceptos $%: deben cuadrar', v_mtotal, v_total;
  end if;

  insert into app.collection_tickets(organization_id, player_id, payment_date, total, items, methods, collected_by_name,
    observations, idempotency_key, created_by_user_id)
  values (p_organization_id, p_player_id, v_date, v_total, v_items, p_methods, nullif(btrim(coalesce(p_collected_by_name, '')), ''),
    nullif(btrim(coalesce(p_observations, '')), ''), v_key, v_actor)
  returning * into v_ticket;

  -- La inscripción nueva nace como cargo. Si la familia tenía saldo a favor,
  -- el trigger se lo aplica solo; lo que el abono ya no alcance a cubrir queda
  -- como abono a su cuenta (saldo a favor), nunca se pierde.
  for it in select * from jsonb_array_elements(v_items) loop
    if it->>'kind' = 'registration' then
      select id into v_profile from app.billing_profiles where player_id = p_player_id and organization_id = p_organization_id limit 1;
      insert into app.charges(organization_id, player_id, billing_profile_id, charge_type, billing_period, concept, amount, due_date,
        status, source, late_fee_eligible, idempotency_key, posted_at, payer_type)
      values (p_organization_id, p_player_id, v_profile, 'registration', date_trunc('month', v_date)::date, 'Inscripción',
        (it->>'total')::numeric, v_date, 'posted', 'taquilla', false, 'ticket:' || v_ticket.id || ':' || (it->>'i'), now(), 'guardian')
      returning id into v_id;
      select balance_due into v_bal from app.charge_balances where id = v_id;
      v_items := (select jsonb_agg(case when (e->>'i') = (it->>'i')
                    then e || jsonb_build_object('kind', 'charge', 'charge_id', v_id, 'amount', least((it->>'amount')::numeric, v_bal))
                    else e end order by (e->>'i')::int) from jsonb_array_elements(v_items) e);
      if (it->>'amount')::numeric > v_bal + 0.005 then
        v_items := v_items || jsonb_build_object('i', 100 + (it->>'i')::int, 'kind', 'abono',
          'amount', (it->>'amount')::numeric - v_bal, 'category', 'Mensualidad', 'label', 'Abono a su cuenta');
      end if;
    end if;
  end loop;
  -- Un renglón de inscripción que el saldo a favor cubrió completo ya no cobra nada.
  v_items := (select jsonb_agg(e order by (e->>'i')::int) from jsonb_array_elements(v_items) e where (e->>'amount')::numeric > 0.004);

  -- Reparte cada concepto entre los métodos, en orden: primero se llena el
  -- primer método y lo que sobra va al segundo.
  v_mi := 1;
  for it in select * from jsonb_array_elements(v_items) loop
    v_rest := (it->>'amount')::numeric;
    while v_rest > 0.004 loop
      if v_mi > array_length(v_mrest, 1) then raise exception 'Los métodos no alcanzan para el cobro'; end if;
      v_take := least(v_rest, v_mrest[v_mi]);
      if v_take > 0.004 then
        v_pieces := v_pieces || (it || jsonb_build_object('amount', v_take, 'method', v_mname[v_mi], 'reference', v_mref[v_mi]));
      end if;
      v_rest := v_rest - v_take;
      v_mrest[v_mi] := v_mrest[v_mi] - v_take;
      if v_mrest[v_mi] <= 0.004 then v_mi := v_mi + 1; end if;
    end loop;
  end loop;

  -- 1) Cuenta del Tanner: un pago por método y categoría, aplicado justo a los
  --    cargos que se eligieron. Lo que es abono libre se aplica al final, del
  --    más antiguo al más nuevo, para no ganarle el saldo a un cargo elegido.
  for g in
    select e->>'method' as method, e->>'category' as category, max(e->>'reference') as reference,
           sum((e->>'amount')::numeric) as amount,
           string_agg(distinct e->>'label', ' · ') as concept,
           bool_or(e->>'kind' = 'abono') as con_abono
      from jsonb_array_elements(v_pieces) e
     where e->>'kind' in ('charge','abono')
     group by 1, 2
     order by 1, 2
  loop
    v_n := v_n + 1;
    insert into app.payments(organization_id, player_id, amount, payment_date, method, reference, concept, status, source, category,
      idempotency_key, payer_type, payment_purpose, credit_status, collected_by_name, created_by_user_id, observations, ticket_id,
      created_at, updated_at)
    values (p_organization_id, p_player_id, g.amount, v_date, g.method, g.reference, left(g.concept, 200), 'posted', 'tanneros_v2',
      g.category, v_key || ':' || v_n, 'guardian', 'billing', 'available', v_ticket.collected_by_name, v_actor,
      v_ticket.observations, v_ticket.id, now(), now())
    returning id into v_pay;
    v_payments := v_payments || v_pay;
    for pc in
      select (e->>'charge_id')::uuid as charge_id, sum((e->>'amount')::numeric) as amount
        from jsonb_array_elements(v_pieces) e
       where e->>'kind' = 'charge' and e->>'method' = g.method and e->>'category' = g.category
       group by 1
    loop
      insert into app.payment_allocations(organization_id, payment_id, charge_id, amount)
      values (p_organization_id, v_pay, pc.charge_id, pc.amount);
    end loop;
  end loop;
  for v_pay in
    select p.id from app.payments p where p.ticket_id = v_ticket.id and p.payment_purpose = 'billing'
      and exists (select 1 from app.payment_balances b where b.id = p.id and b.available_credit > 0.004)
  loop
    perform app.allocate_payment_oldest_first(v_pay);
  end loop;
  -- Ningún cargo puede quedar con más abonado que su monto.
  if exists (
    select 1 from app.charge_balances cb
     where cb.player_id = p_player_id and cb.organization_id = p_organization_id
       and cb.allocated_amount > cb.net_amount + 0.005
  ) then raise exception 'El cobro excede lo que se debe de un cargo'; end if;

  -- 2) Pedidos de la tienda: el abono de siempre, ligado al pedido.
  for pc in
    select (e->>'order_id')::uuid as order_id, e->>'method' as method, max(e->>'reference') as reference, sum((e->>'amount')::numeric) as amount
      from jsonb_array_elements(v_pieces) e where e->>'kind' = 'order' group by 1, 2 order by 1, 2
  loop
    v_n := v_n + 1;
    v_pay := private.command_post_order_payment_at_cashier(p_organization_id, pc.order_id, pc.amount, v_date, pc.method,
      pc.reference, 'guardian', null, v_ticket.collected_by_name, v_key || ':' || v_n);
    v_payments := v_payments || v_pay;
  end loop;

  -- 3) Otros ingresos (arbitraje, torneo...): ingreso general ligado al Tanner.
  for pc in
    select e->>'category' as category, e->>'label' as label, e->>'method' as method, max(e->>'reference') as reference,
           sum((e->>'amount')::numeric) as amount
      from jsonb_array_elements(v_pieces) e where e->>'kind' = 'income' group by 1, 2, 3 order by 1, 2, 3
  loop
    v_n := v_n + 1;
    v_pay := private.command_post_general_income(p_organization_id, pc.amount, v_date, pc.method, pc.category, pc.label,
      null, pc.reference, v_key || ':' || v_n, p_player_id);
    v_payments := v_payments || v_pay;
  end loop;

  update app.payments
     set ticket_id = v_ticket.id,
         collected_by_name = coalesce(collected_by_name, v_ticket.collected_by_name),
         created_by_user_id = coalesce(created_by_user_id, v_actor),
         observations = coalesce(observations, v_ticket.observations),
         updated_at = now()
   where id = any(v_payments) and organization_id = p_organization_id;

  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id, request_id)
  values (p_organization_id, 'CollectionTicketPosted', 'player', p_player_id,
    jsonb_build_object('ticketId', v_ticket.id, 'folio', v_ticket.numero, 'total', v_total, 'items', v_items,
      'methods', p_methods, 'payments', to_jsonb(v_payments), 'collectedBy', v_ticket.collected_by_name),
    v_actor, v_key);

  return jsonb_build_object('ok', true, 'ticketId', v_ticket.id, 'folio', v_ticket.numero, 'total', v_total,
    'payments', to_jsonb(v_payments));
end $$;
revoke all on function private.command_collect_ticket(uuid, uuid, date, jsonb, jsonb, text, text, text) from public, anon, authenticated;

create or replace function public.v2_collect_ticket(
  organization_id uuid, player_id uuid, payment_date date, items jsonb, methods jsonb,
  collected_by_name text default null, observations text default null, idempotency_key text default null
) returns jsonb language sql security definer set search_path to 'pg_catalog', 'private'
as $$ select private.command_collect_ticket(organization_id, player_id, payment_date, items, methods, collected_by_name, observations, idempotency_key) $$;
revoke all on function public.v2_collect_ticket(uuid, uuid, date, jsonb, jsonb, text, text, text) from public, anon;
grant execute on function public.v2_collect_ticket(uuid, uuid, date, jsonb, jsonb, text, text, text) to authenticated;

-- Lo que se necesita para cobrar desde el estado de cuenta: los cargos
-- abiertos con su id, los pedidos con saldo, el precio de inscripción y el
-- folio de cada pago que se cobró junto con otros.
create or replace function private.query_player_collection(p_organization_id uuid, p_player_id uuid)
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog', 'public', 'app', 'private'
as $$
begin
  if not private.has_any_module_access(p_organization_id, array['billing','taquilla','accounting'], false) then raise exception 'Not authorized'; end if;
  if not exists (select 1 from app.players where id = p_player_id and organization_id = p_organization_id) then raise exception 'Tanner no encontrado'; end if;
  return jsonb_build_object(
    'canCollect', private.has_any_module_access(p_organization_id, array['billing','taquilla'], true),
    'canOrders', private.has_module_access(p_organization_id, 'commerce', true),
    'charges', coalesce((
      select jsonb_agg(jsonb_build_object('id', cb.id, 'type', cb.charge_type, 'period', cb.billing_period,
        'due', cb.due_date, 'concept', cb.concept, 'balance', cb.balance_due,
        'label', private.etiqueta_cargo(cb.charge_type, cb.billing_period, cb.concept),
        'sponsor', coalesce(cb.payer_type, 'guardian') = 'sponsor')
        order by cb.billing_period nulls last, cb.due_date, cb.created_at)
        from app.charge_balances cb join app.charges c on c.id = cb.id
       where cb.organization_id = p_organization_id and cb.player_id = p_player_id
         and c.status = 'posted' and cb.computed_status in ('pending','partial') and cb.balance_due > 0), '[]'),
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'folio', o.folio, 'total', o.total,
        'balance', o.total - private.order_paid_amount(p_organization_id, o.id)) order by o.created_at)
        from app.orders o
       where o.organization_id = p_organization_id and o.player_id = p_player_id and o.archived_at is null
         and o.status in ('pending_payment','partial_payment','in_production','ready')
         and o.total - private.order_paid_amount(p_organization_id, o.id) > 0.004), '[]'),
    'prices', (select settings->'publicPrices' from public.organizations where id = p_organization_id),
    'tickets', coalesce((
      select jsonb_object_agg(p.id, jsonb_build_object('folio', t.numero, 'ticket', t.id,
        'parts', (select count(*) from app.payments x where x.ticket_id = t.id and x.status = 'posted')))
        from app.payments p join app.collection_tickets t on t.id = p.ticket_id
       where p.organization_id = p_organization_id and p.player_id = p_player_id), '{}')
  );
end $$;
revoke all on function private.query_player_collection(uuid, uuid) from public, anon, authenticated;

create or replace function public.v2_player_collection(organization_id uuid, player_id uuid)
returns jsonb language sql stable security definer set search_path to 'pg_catalog', 'private'
as $$ select private.query_player_collection(organization_id, player_id) $$;
revoke all on function public.v2_player_collection(uuid, uuid) from public, anon;
grant execute on function public.v2_player_collection(uuid, uuid) to authenticated;
