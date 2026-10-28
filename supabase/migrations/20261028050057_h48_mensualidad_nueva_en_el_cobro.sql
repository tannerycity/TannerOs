-- h48 · Cobrar una mensualidad que todavía no está en su cuenta
--
-- Presidencia (28/10/2026): "entra alguien nuevo hoy... le tengo que cobrar
-- 200 pesos de este mes, 800 de inscripción y aparte ya paga noviembre. No
-- existe esa opción."
--
-- · v2_collect_ticket acepta {kind:'month', period, total, amount}: crea el
--   cargo de mensualidad de ese mes y lo paga en el mismo folio. Usa la misma
--   llave que el cargo automático ('monthly-family:<tanner>:<YYYY-MM>'): el
--   día 1 ese mes ya no se vuelve a cargar. Si el mes ya está en su cuenta, se
--   rechaza (se cobra desde lo que debe).
-- · v2_player_collection dice su mensualidad, desde cuándo cobra, cómo se
--   prorratea y qué meses ya tienen cargo, para proponer el monto.
-- Sólo se reemplazan dos funciones privadas; firmas y permisos iguales.

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
  v_per date; v_meses text[] := '{}'; v_due_day int; v_first_late boolean; v_start date;
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
    elsif v_kind = 'month' then
      -- h48: una mensualidad que todavía no está en su cuenta (el mes en que
      -- entra, con su proporcional, o un mes por adelantado). Nace con la
      -- MISMA llave que usa el cargo automático del día 1, así que ese mes ya
      -- no se vuelve a cargar.
      v_per := date_trunc('month', nullif(it->>'period', '')::date)::date;
      if v_per is null then raise exception 'Falta el mes de la mensualidad'; end if;
      if v_per < (date_trunc('month', v_date) - interval '12 months')::date or v_per > (date_trunc('month', v_date) + interval '12 months')::date then
        raise exception 'Ese mes está fuera de rango';
      end if;
      if (v_pl::text || to_char(v_per, 'YYYY-MM')) = any(v_meses) then raise exception 'Una mensualidad viene repetida'; end if;
      if exists (select 1 from app.charges c where c.organization_id = p_organization_id and c.player_id = v_pl
                  and c.charge_type = 'monthly_fee' and c.billing_period = v_per)
         or exists (select 1 from app.charges c where c.organization_id = p_organization_id
                  and c.idempotency_key = 'monthly-family:' || v_pl::text || ':' || to_char(v_per, 'YYYY-MM')) then
        raise exception 'La % ya está en su cuenta: elígela de lo que debe', private.etiqueta_cargo('monthly_fee', v_per, null);
      end if;
      if round(coalesce((it->>'total')::numeric, v_amount), 2) < v_amount then raise exception 'Lo que paga no puede ser más que la mensualidad'; end if;
      if round(coalesce((it->>'total')::numeric, v_amount), 2) > 100000 then raise exception 'Monto fuera de rango'; end if;
      v_meses := v_meses || (v_pl::text || to_char(v_per, 'YYYY-MM'));
      v_items := v_items || jsonb_build_object('i', v_i, 'player_id', v_pl, 'kind', 'month', 'amount', v_amount, 'period', v_per,
        'total', round(coalesce((it->>'total')::numeric, v_amount), 2), 'category', 'Mensualidad',
        'label', private.etiqueta_cargo('monthly_fee', v_per, null));
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
  select due_day, first_month_late_fee_enabled into v_due_day, v_first_late
    from app.billing_policies where organization_id = p_organization_id;
  for it in select * from jsonb_array_elements(v_items) loop
    if it->>'kind' in ('registration', 'month') then
      v_pl := (it->>'player_id')::uuid;
      select id, billing_start into v_profile, v_start from app.billing_profiles where player_id = v_pl and organization_id = p_organization_id limit 1;
      if it->>'kind' = 'registration' then
        insert into app.charges(organization_id, player_id, billing_profile_id, charge_type, billing_period, concept, amount, due_date,
          status, source, late_fee_eligible, idempotency_key, posted_at, payer_type)
        values (p_organization_id, v_pl, v_profile, 'registration', date_trunc('month', v_date)::date, 'Inscripción',
          (it->>'total')::numeric, v_date, 'posted', 'taquilla', false, 'ticket:' || v_ticket.id || ':' || (it->>'i'), now(), 'guardian')
        returning id into v_id;
      else
        v_per := (it->>'period')::date;
        insert into app.charges(organization_id, player_id, billing_profile_id, charge_type, billing_period, concept, amount, due_date,
          status, source, late_fee_eligible, idempotency_key, posted_at, payer_type)
        values (p_organization_id, v_pl, v_profile, 'monthly_fee', v_per, 'Mensualidad ' || to_char(v_per, 'YYYY-MM'),
          (it->>'total')::numeric,
          case when v_due_day is null then v_per + 4 else app.month_due_date(v_per, v_due_day) end,
          'posted', 'taquilla',
          case when v_start is not null and date_trunc('month', v_start)::date = v_per then coalesce(v_first_late, false) else true end,
          'monthly-family:' || v_pl::text || ':' || to_char(v_per, 'YYYY-MM'), now(), 'guardian')
        returning id into v_id;
      end if;
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

create or replace function private.query_player_collection(p_organization_id uuid, p_player_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'pg_catalog', 'public', 'app', 'private'
as $$
declare v_acuerdo uuid; v_hoy date := private.hoy_club(p_organization_id);
begin
  if not private.has_any_module_access(p_organization_id, array['billing','taquilla','accounting'], false) then raise exception 'Not authorized'; end if;
  if not exists (select 1 from app.players where id = p_player_id and organization_id = p_organization_id) then raise exception 'Tanner no encontrado'; end if;
  -- El acuerdo que se enseña: el vigente, o el último cumplido de los
  -- últimos 30 días (para que se vea que se cumplió).
  select a.id into v_acuerdo from app.payment_agreements a
   where a.organization_id = p_organization_id and a.player_id = p_player_id and a.cancelled_at is null
     and (private.agreement_status(a.id, v_hoy)->>'state' in ('active','broken') or a.created_at > now() - interval '30 days')
   order by a.created_at desc limit 1;
  return jsonb_build_object(
    'canCollect', private.has_any_module_access(p_organization_id, array['billing','taquilla'], true),
    'canOrders', private.has_module_access(p_organization_id, 'commerce', true),
    'canAgree', private.is_presidency(p_organization_id),
    'canNote', private.is_presidency(p_organization_id) or private.has_any_module_access(p_organization_id, array['billing','taquilla'], true),
    'today', v_hoy,
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
    -- h48: para proponer la mensualidad que todavía no está en su cuenta.
    'monthly', jsonb_build_object(
      'fee', (select bp.base_monthly_fee from app.billing_profiles bp where bp.player_id = p_player_id and bp.organization_id = p_organization_id limit 1),
      'start', (select bp.billing_start from app.billing_profiles bp where bp.player_id = p_player_id and bp.organization_id = p_organization_id limit 1),
      'proration', (select bp.proration_method from app.billing_policies bp where bp.organization_id = p_organization_id),
      'charged', coalesce((select jsonb_agg(distinct to_char(c.billing_period, 'YYYY-MM')) from app.charges c
         where c.organization_id = p_organization_id and c.player_id = p_player_id and c.charge_type = 'monthly_fee'), '[]')),
    'tickets', coalesce((
      select jsonb_object_agg(p.id, jsonb_build_object('folio', t.numero, 'ticket', t.id,
        'parts', (select count(*) from app.payments x where x.ticket_id = t.id and x.status = 'posted')))
        from app.payments p join app.collection_tickets t on t.id = p.ticket_id
       where p.organization_id = p_organization_id and p.player_id = p_player_id), '{}'),
    'agreement', case when v_acuerdo is null then null else private.agreement_status(v_acuerdo, v_hoy) end,
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'body', n.body, 'by', n.created_by_name, 'at', n.created_at) order by n.created_at desc)
        from (select * from app.collection_notes n
               where n.organization_id = p_organization_id and n.player_id = p_player_id
               order by n.created_at desc limit 40) n), '[]')
  );
end $$;
revoke all on function private.query_player_collection(uuid, uuid) from public, anon, authenticated;
