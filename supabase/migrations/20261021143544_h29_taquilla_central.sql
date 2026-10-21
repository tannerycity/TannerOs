-- h29 · Taquilla central: corte por persona, "Hoy esperamos" y categoría
-- contable correcta en el cobro con desglose (21/10/2026).
--   · Medido: un gafete cobrado en la hoja quedaba como "Mensualidad". Ahora
--     cada parte toma la categoría de su cargo (gafete, academia, otros).
--   · Mi corte de hoy: lo que cobró y pagó cada quien, por método. Sin fondo
--     de caja (el club no deja cambio), el efectivo a entregar es lo cobrado
--     en efectivo menos lo pagado en efectivo.
--   · Hoy esperamos: pagos de acuerdo que tocan hoy, en los próximos 2 días o
--     ya vencidos, para cobrarlos con un toque.

create or replace function private.categoria_cobro(p_charge_type text)
returns text language sql immutable set search_path to 'pg_catalog'
as $$
  select case p_charge_type
    when 'registration' then 'Inscripción'
    when 'academy_fee' then 'Academia · Academia de porteros'
    when 'academy_day' then 'Academia · Academia de porteros'
    when 'parking_pass' then 'Estacionamiento'
    when 'other' then 'Otros cargos'
    else 'Mensualidad'
  end
$$;
revoke all on function private.categoria_cobro(text) from public, anon, authenticated;

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
  v_payments uuid[] := '{}'; v_n int := 0; v_label text; v_bal numeric; v_pl uuid; v_familia uuid[];
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
  -- Hermanos (h28): un cobro puede llevar conceptos de varios Tanners que
  -- comparten tutor. Cada parte queda en la cuenta de su Tanner.
  select array_agg(distinct pg2.player_id) into v_familia
    from app.player_guardians pg1
    join app.player_guardians pg2 on pg2.guardian_id = pg1.guardian_id
    join app.players pl on pl.id = pg2.player_id and pl.organization_id = p_organization_id
   where pg1.player_id = p_player_id;
  v_familia := array(select distinct x from unnest(coalesce(v_familia, '{}') || p_player_id) x);
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
    v_pl := coalesce(nullif(it->>'player_id', '')::uuid, p_player_id);
    if not (v_pl = any(v_familia)) then raise exception 'Ese Tanner no es de la misma familia'; end if;
    v_amount := round((it->>'amount')::numeric, 2);
    if v_amount is null or v_amount <= 0 then raise exception 'Cada concepto lleva un monto mayor a cero'; end if;
    if v_amount > 100000 then raise exception 'Monto fuera de rango'; end if;
    if v_kind = 'charge' then
      select cb.id, cb.charge_type, cb.billing_period, cb.concept, cb.balance_due, cb.payer_type, c.status
        into v_charge
        from app.charges c join app.charge_balances cb on cb.id = c.id
       where c.id = (it->>'charge_id')::uuid and c.organization_id = p_organization_id and c.player_id = v_pl
       for update of c;
      if not found or v_charge.status <> 'posted' then raise exception 'Uno de los cargos ya no existe'; end if;
      if coalesce(v_charge.payer_type, 'guardian') = 'sponsor' then raise exception 'Ese cargo lo paga un patrocinador: cóbralo aparte'; end if;
      if v_charge.id = any(v_seen) then raise exception 'Un cargo viene repetido'; end if;
      if v_amount > v_charge.balance_due + 0.005 then
        raise exception '% sólo debe $%', private.etiqueta_cargo(v_charge.charge_type, v_charge.billing_period, v_charge.concept), v_charge.balance_due;
      end if;
      v_seen := v_seen || v_charge.id;
      v_items := v_items || jsonb_build_object('i', v_i, 'player_id', v_pl, 'kind', 'charge', 'amount', v_amount, 'charge_id', v_charge.id,
        'category', private.categoria_cobro(v_charge.charge_type),
        'label', private.etiqueta_cargo(v_charge.charge_type, v_charge.billing_period, v_charge.concept));
    elsif v_kind = 'registration' then
      if round(coalesce((it->>'total')::numeric, v_amount), 2) < v_amount then raise exception 'El abono no puede ser mayor que la inscripción'; end if;
      if round(coalesce((it->>'total')::numeric, v_amount), 2) > 100000 then raise exception 'Monto fuera de rango'; end if;
      v_items := v_items || jsonb_build_object('i', v_i, 'player_id', v_pl, 'kind', 'registration', 'amount', v_amount,
        'total', round(coalesce((it->>'total')::numeric, v_amount), 2), 'category', 'Inscripción', 'label', 'Inscripción');
    elsif v_kind = 'order' then
      select o.id, o.folio, o.total, o.status into v_order from app.orders o
       where o.id = (it->>'order_id')::uuid and o.organization_id = p_organization_id and o.player_id = v_pl;
      if not found then raise exception 'Ese pedido no es de este Tanner'; end if;
      if v_order.id = any(v_seen) then raise exception 'Un pedido viene repetido'; end if;
      v_seen := v_seen || v_order.id;
      v_items := v_items || jsonb_build_object('i', v_i, 'player_id', v_pl, 'kind', 'order', 'amount', v_amount, 'order_id', v_order.id,
        'label', 'Pedido ' || v_order.folio);
    elsif v_kind = 'income' then
      if length(btrim(coalesce(it->>'category', ''))) not between 2 and 60 then raise exception 'Cada ingreso lleva categoría'; end if;
      v_items := v_items || jsonb_build_object('i', v_i, 'player_id', v_pl, 'kind', 'income', 'amount', v_amount,
        'category', btrim(it->>'category'),
        'label', left(coalesce(nullif(btrim(coalesce(it->>'concept', '')), ''), btrim(it->>'category')), 80));
    elsif v_kind = 'abono' then
      v_items := v_items || jsonb_build_object('i', v_i, 'player_id', v_pl, 'kind', 'abono', 'amount', v_amount, 'category', 'Mensualidad', 'label', 'Abono a su cuenta');
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
      v_pl := (it->>'player_id')::uuid;
      select id into v_profile from app.billing_profiles where player_id = v_pl and organization_id = p_organization_id limit 1;
      insert into app.charges(organization_id, player_id, billing_profile_id, charge_type, billing_period, concept, amount, due_date,
        status, source, late_fee_eligible, idempotency_key, posted_at, payer_type)
      values (p_organization_id, v_pl, v_profile, 'registration', date_trunc('month', v_date)::date, 'Inscripción',
        (it->>'total')::numeric, v_date, 'posted', 'taquilla', false, 'ticket:' || v_ticket.id || ':' || (it->>'i'), now(), 'guardian')
      returning id into v_id;
      select balance_due into v_bal from app.charge_balances where id = v_id;
      v_items := (select jsonb_agg(case when (e->>'i') = (it->>'i')
                    then e || jsonb_build_object('kind', 'charge', 'charge_id', v_id, 'amount', least((it->>'amount')::numeric, v_bal))
                    else e end order by (e->>'i')::int) from jsonb_array_elements(v_items) e);
      if (it->>'amount')::numeric > v_bal + 0.005 then
        v_items := v_items || jsonb_build_object('i', 100 + (it->>'i')::int, 'player_id', v_pl, 'kind', 'abono',
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
    select (e->>'player_id')::uuid as player, e->>'method' as method, e->>'category' as category, max(e->>'reference') as reference,
           sum((e->>'amount')::numeric) as amount,
           string_agg(distinct e->>'label', ' · ') as concept
      from jsonb_array_elements(v_pieces) e
     where e->>'kind' in ('charge','abono')
     group by 1, 2, 3
     order by 1, 2, 3
  loop
    v_n := v_n + 1;
    insert into app.payments(organization_id, player_id, amount, payment_date, method, reference, concept, status, source, category,
      idempotency_key, payer_type, payment_purpose, credit_status, collected_by_name, created_by_user_id, observations, ticket_id,
      created_at, updated_at)
    values (p_organization_id, g.player, g.amount, v_date, g.method, g.reference, left(g.concept, 200), 'posted', 'tanneros_v2',
      g.category, v_key || ':' || v_n, 'guardian', 'billing', 'available', v_ticket.collected_by_name, v_actor,
      v_ticket.observations, v_ticket.id, now(), now())
    returning id into v_pay;
    v_payments := v_payments || v_pay;
    for pc in
      select (e->>'charge_id')::uuid as charge_id, sum((e->>'amount')::numeric) as amount
        from jsonb_array_elements(v_pieces) e
       where e->>'kind' = 'charge' and e->>'method' = g.method and e->>'category' = g.category
         and (e->>'player_id')::uuid = g.player
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
     where cb.player_id = any(v_familia) and cb.organization_id = p_organization_id
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
    select (e->>'player_id')::uuid as player, e->>'category' as category, e->>'label' as label, e->>'method' as method,
           max(e->>'reference') as reference, sum((e->>'amount')::numeric) as amount
      from jsonb_array_elements(v_pieces) e where e->>'kind' = 'income' group by 1, 2, 3, 4 order by 1, 2, 3, 4
  loop
    v_n := v_n + 1;
    v_pay := private.command_post_general_income(p_organization_id, pc.amount, v_date, pc.method, pc.category, pc.label,
      null, pc.reference, v_key || ':' || v_n, pc.player);
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

-- Mi corte de hoy. Con cuenta personal es lo del usuario; en una cuenta
-- compartida se separa por el nombre que eligió quien cobró.
create or replace function private.query_my_cash_day(p_organization_id uuid, p_date date)
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog', 'public', 'app', 'private'
as $$
declare v_actor uuid := (select auth.uid()); v_dia date := coalesce(p_date, private.hoy_club(p_organization_id));
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if not private.has_any_module_access(p_organization_id, array['taquilla','billing'], false) then raise exception 'Not authorized'; end if;
  return jsonb_build_object('date', v_dia, 'rows', coalesce((
    select jsonb_agg(jsonb_build_object('who', x.quien, 'method', x.method, 'kind', x.kind, 'count', x.n, 'total', x.total) order by x.quien, x.kind, x.method)
      from (
        select coalesce(nullif(btrim(p.collected_by_name), ''), private.nombre_actor(), 'Yo') as quien, p.method, 'in' as kind,
               count(*) as n, sum(p.amount) as total
          from app.payments p
         where p.organization_id = p_organization_id and p.created_by_user_id = v_actor
           and p.status = 'posted' and p.payment_date = v_dia
         group by 1, 2
        union all
        select coalesce(nullif(btrim(e.paid_by_name), ''), private.nombre_actor(), 'Yo'), e.method, 'out', count(*), sum(e.amount)
          from app.expenses e
         where e.organization_id = p_organization_id and e.created_by_user_id = v_actor
           and e.status = 'posted' and e.expense_date = v_dia
         group by 1, 2
      ) x), '[]'));
end $$;
revoke all on function private.query_my_cash_day(uuid, date) from public, anon, authenticated;

create or replace function public.v2_my_cash_day(organization_id uuid, business_date date default null)
returns jsonb language sql stable security definer set search_path to 'pg_catalog', 'private'
as $$ select private.query_my_cash_day(organization_id, business_date) $$;
revoke all on function public.v2_my_cash_day(uuid, date) from public, anon;
grant execute on function public.v2_my_cash_day(uuid, date) to authenticated;

-- Hoy esperamos: los pagos de acuerdo que tocan hoy, pronto o ya vencidos.
create or replace function private.query_expected_today(p_organization_id uuid)
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog', 'app', 'private'
as $$
declare v_hoy date := private.hoy_club(p_organization_id);
begin
  if not private.has_any_module_access(p_organization_id, array['taquilla','billing'], false) then raise exception 'Not authorized'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('playerId', x.player_id, 'name', x.nombre, 'state', x.s->>'state',
      'due', x.s->'next'->>'due', 'amount', (x.s->'next'->>'amount')::numeric)
      order by (x.s->'next'->>'due'), x.nombre)
      from (
        select distinct on (a.player_id) a.player_id, btrim(concat_ws(' ', pl.first_name, pl.last_name)) as nombre,
               private.agreement_status(a.id, v_hoy) as s
          from app.payment_agreements a join app.players pl on pl.id = a.player_id
         where a.organization_id = p_organization_id and a.cancelled_at is null and pl.archived_at is null
         order by a.player_id, a.created_at desc
      ) x
     where x.s->>'state' in ('active','broken') and (x.s->'next'->>'due')::date <= v_hoy + 2), '[]');
end $$;
revoke all on function private.query_expected_today(uuid) from public, anon, authenticated;

create or replace function public.v2_expected_today(organization_id uuid)
returns jsonb language sql stable security definer set search_path to 'pg_catalog', 'private'
as $$ select private.query_expected_today(organization_id) $$;
revoke all on function public.v2_expected_today(uuid) from public, anon;
grant execute on function public.v2_expected_today(uuid) to authenticated;
