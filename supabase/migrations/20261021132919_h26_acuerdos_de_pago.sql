-- h26 · Acuerdos de pago y seguimiento de cobranza (21/10/2026).
-- Presidencia: "que ahí mismo en esa pantalla (estado de cuenta) podamos
-- llegar a los acuerdos de pago, que la cobranza ahí sea rápida".
--   · Sólo Presidencia pacta un acuerdo: una promesa (una fecha) o abonos.
--   · Mientras el acuerdo se cumple, no se genera recargo. Si se vence un
--     abono, el acuerdo queda incumplido y el motor nocturno cobra el
--     recargo como siempre.
--   · Seguimiento: cada llamada, mensaje o nota queda con quién y cuándo.
--
-- El avance de un acuerdo no se captura: es lo que bajó el saldo de los
-- cargos que existían al pactarlo (pagos, saldo a favor o condonaciones).

create table app.payment_agreements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  player_id uuid not null,
  total numeric not null check (total > 0),
  balance_at_start numeric not null check (balance_at_start >= 0),
  note text check (note is null or length(note) <= 300),
  created_by_user_id uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by_user_id uuid,
  cancel_reason text,
  acknowledged_at timestamptz,
  acknowledged_by_user_id uuid,
  idempotency_key text not null,
  unique (organization_id, idempotency_key),
  foreign key (player_id, organization_id) references app.players(id, organization_id)
);
create index payment_agreements_por_tanner on app.payment_agreements(organization_id, player_id, created_at desc);

create table app.payment_agreement_installments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agreement_id uuid not null references app.payment_agreements(id) on delete cascade,
  seq smallint not null check (seq between 1 and 12),
  due_date date not null,
  amount numeric not null check (amount > 0),
  unique (agreement_id, seq)
);

create table app.collection_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  player_id uuid not null,
  kind text not null check (kind in ('note','call','whatsapp','visit','agreement')),
  body text not null check (length(btrim(body)) between 1 and 500),
  created_by_user_id uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  foreign key (player_id, organization_id) references app.players(id, organization_id)
);
create index collection_notes_por_tanner on app.collection_notes(organization_id, player_id, created_at desc);

alter table app.payment_agreements enable row level security;
alter table app.payment_agreement_installments enable row level security;
alter table app.collection_notes enable row level security;
revoke all on app.payment_agreements, app.payment_agreement_installments, app.collection_notes from public, anon, authenticated;
create trigger zz_club_read_only before insert or update or delete on app.payment_agreements
  for each row execute function private.guard_club_read_only();
create trigger zz_club_read_only before insert or update or delete on app.payment_agreement_installments
  for each row execute function private.guard_club_read_only();
create trigger zz_club_read_only before insert or update or delete on app.collection_notes
  for each row execute function private.guard_club_read_only();

-- Estado de un acuerdo a una fecha: cuánto lleva, cada abono y el que sigue.
create or replace function private.agreement_status(p_agreement_id uuid, p_as_of date)
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog', 'app', 'private'
as $$
declare a app.payment_agreements%rowtype; v_now numeric; v_avance numeric; v_cum numeric := 0; i record;
  v_rows jsonb := '[]'; v_state text; v_next jsonb; v_late boolean := false; v_estado text;
begin
  select * into a from app.payment_agreements where id = p_agreement_id;
  if not found then return null; end if;
  select coalesce(sum(cb.balance_due), 0) into v_now
    from app.charge_balances cb join app.charges c on c.id = cb.id
   where c.organization_id = a.organization_id and c.player_id = a.player_id
     and c.status = 'posted' and c.created_at <= a.created_at;
  v_avance := least(a.total, greatest(0, a.balance_at_start - v_now));
  for i in select * from app.payment_agreement_installments where agreement_id = a.id order by seq loop
    v_cum := v_cum + i.amount;
    v_estado := case when v_avance + 0.005 >= v_cum then 'paid'
                     when i.due_date < p_as_of then 'late' else 'pending' end;
    if v_estado = 'late' then v_late := true; end if;
    if v_next is null and v_estado <> 'paid' then
      v_next := jsonb_build_object('seq', i.seq, 'due', i.due_date, 'amount', least(i.amount, v_cum - v_avance));
    end if;
    v_rows := v_rows || jsonb_build_object('seq', i.seq, 'due', i.due_date, 'amount', i.amount, 'state', v_estado);
  end loop;
  v_state := case when a.cancelled_at is not null then 'cancelled'
                  when v_avance + 0.005 >= a.total or v_now <= 0.005 then 'fulfilled'
                  when v_late then 'broken' else 'active' end;
  return jsonb_build_object('id', a.id, 'state', v_state, 'total', a.total, 'paid', v_avance,
    'remaining', greatest(0, a.total - v_avance), 'installments', v_rows, 'next', v_next,
    'note', a.note, 'createdAt', a.created_at, 'createdBy', a.created_by_name,
    'cancelledAt', a.cancelled_at, 'cancelReason', a.cancel_reason, 'acknowledgedAt', a.acknowledged_at);
end $$;
revoke all on function private.agreement_status(uuid, date) from public, anon, authenticated;

create or replace function private.hoy_club(p_organization_id uuid)
returns date language sql stable security definer set search_path to 'pg_catalog', 'public'
as $$ select (now() at time zone coalesce((select nullif(timezone, '') from public.organizations where id = p_organization_id), 'America/Mexico_City'))::date $$;
revoke all on function private.hoy_club(uuid) from public, anon, authenticated;

-- El acuerdo vigente de un Tanner (activo o incumplido), si tiene.
create or replace function private.acuerdo_abierto(p_organization_id uuid, p_player_id uuid)
returns uuid language sql stable security definer set search_path to 'pg_catalog', 'app', 'private'
as $$
  select a.id from app.payment_agreements a
   where a.organization_id = p_organization_id and a.player_id = p_player_id and a.cancelled_at is null
     and private.agreement_status(a.id, private.hoy_club(p_organization_id))->>'state' in ('active','broken')
   order by a.created_at desc limit 1
$$;
revoke all on function private.acuerdo_abierto(uuid, uuid) from public, anon, authenticated;

create or replace function private.nombre_actor()
returns text language sql stable security definer set search_path to 'pg_catalog', 'public'
as $$ select nullif(btrim(display_name), '') from public.profiles where user_id = (select auth.uid()) $$;
revoke all on function private.nombre_actor() from public, anon, authenticated;

create or replace function private.command_create_payment_agreement(
  p_organization_id uuid, p_player_id uuid, p_installments jsonb, p_note text, p_replace boolean, p_idempotency_key text
) returns jsonb language plpgsql security definer
set search_path to 'pg_catalog', 'public', 'app', 'private'
as $$
declare v_actor uuid := (select auth.uid()); v_key text := btrim(coalesce(p_idempotency_key, '')); v_id uuid; v_abierto uuid;
  v_hoy date := private.hoy_club(p_organization_id); v_saldo numeric; v_total numeric := 0; v_prev date; x jsonb; v_n int := 0;
  v_due date; v_amount numeric; v_resumen text;
begin
  if not private.is_presidency(p_organization_id) then raise exception 'Sólo Presidencia puede pactar un acuerdo de pago'; end if;
  if length(v_key) < 8 then raise exception 'Idempotency key required'; end if;
  select id into v_id from app.payment_agreements where organization_id = p_organization_id and idempotency_key = v_key;
  if v_id is not null then return jsonb_build_object('ok', true, 'agreementId', v_id); end if;
  if not exists (select 1 from app.players where id = p_player_id and organization_id = p_organization_id) then raise exception 'Tanner no encontrado'; end if;
  if jsonb_typeof(p_installments) <> 'array' or jsonb_array_length(p_installments) not between 1 and 12 then
    raise exception 'El acuerdo lleva de 1 a 12 pagos';
  end if;
  for x in select * from jsonb_array_elements(p_installments) loop
    v_n := v_n + 1;
    v_due := (x->>'due_date')::date;
    v_amount := round((x->>'amount')::numeric, 2);
    if v_due is null then raise exception 'Falta la fecha del pago %', v_n; end if;
    if v_due < v_hoy then raise exception 'El pago % no puede ser en una fecha que ya pasó', v_n; end if;
    if v_prev is not null and v_due <= v_prev then raise exception 'Las fechas van en orden: el pago % va después del %', v_n, v_n - 1; end if;
    if v_amount is null or v_amount <= 0 then raise exception 'El pago % lleva un monto mayor a cero', v_n; end if;
    v_prev := v_due; v_total := v_total + v_amount;
  end loop;
  select coalesce(sum(cb.balance_due), 0) into v_saldo
    from app.charge_balances cb join app.charges c on c.id = cb.id
   where c.organization_id = p_organization_id and c.player_id = p_player_id and c.status = 'posted' and cb.balance_due > 0;
  if v_saldo <= 0 then raise exception 'Este Tanner no debe nada: no hace falta un acuerdo'; end if;
  if v_total > v_saldo + 0.005 then raise exception 'El acuerdo suma $% y sólo debe $%', v_total, v_saldo; end if;

  v_abierto := private.acuerdo_abierto(p_organization_id, p_player_id);
  if v_abierto is not null then
    if not coalesce(p_replace, false) then raise exception 'Ya tiene un acuerdo vigente: rehazlo o cancélalo primero'; end if;
    update app.payment_agreements set cancelled_at = now(), cancelled_by_user_id = v_actor, cancel_reason = 'Se rehízo el acuerdo'
     where id = v_abierto;
  end if;

  insert into app.payment_agreements(organization_id, player_id, total, balance_at_start, note, created_by_user_id, created_by_name, idempotency_key)
  values (p_organization_id, p_player_id, v_total, v_saldo, nullif(btrim(coalesce(p_note, '')), ''), v_actor, private.nombre_actor(), v_key)
  returning id into v_id;
  insert into app.payment_agreement_installments(organization_id, agreement_id, seq, due_date, amount)
  select p_organization_id, v_id, e.n::smallint, (e.x->>'due_date')::date, round((e.x->>'amount')::numeric, 2)
    from jsonb_array_elements(p_installments) with ordinality e(x, n);

  v_resumen := case when v_n = 1
    then format('Acuerdo: paga $%s el %s', to_char(v_total, 'FM999,999,990.00'), to_char((p_installments->0->>'due_date')::date, 'DD/MM/YYYY'))
    else format('Acuerdo: %s pagos por $%s, el primero el %s', v_n, to_char(v_total, 'FM999,999,990.00'), to_char((p_installments->0->>'due_date')::date, 'DD/MM/YYYY')) end
    || case when nullif(btrim(coalesce(p_note, '')), '') is not null then ' · ' || btrim(p_note) else '' end;
  insert into app.collection_notes(organization_id, player_id, kind, body, created_by_user_id, created_by_name)
  values (p_organization_id, p_player_id, 'agreement', left(v_resumen, 500), v_actor, private.nombre_actor());
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id, request_id)
  values (p_organization_id, 'PaymentAgreementCreated', 'player', p_player_id,
    jsonb_build_object('agreementId', v_id, 'total', v_total, 'installments', p_installments, 'replaced', v_abierto), v_actor, v_key);
  return jsonb_build_object('ok', true, 'agreementId', v_id);
end $$;
revoke all on function private.command_create_payment_agreement(uuid, uuid, jsonb, text, boolean, text) from public, anon, authenticated;

create or replace function private.command_cancel_payment_agreement(p_organization_id uuid, p_agreement_id uuid, p_reason text)
returns jsonb language plpgsql security definer
set search_path to 'pg_catalog', 'public', 'app', 'private'
as $$
declare a app.payment_agreements%rowtype; v_actor uuid := (select auth.uid());
begin
  if not private.is_presidency(p_organization_id) then raise exception 'Sólo Presidencia puede cancelar un acuerdo'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'Escribe el motivo (al menos 5 letras)'; end if;
  select * into a from app.payment_agreements where id = p_agreement_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Acuerdo no encontrado'; end if;
  if a.cancelled_at is not null then return jsonb_build_object('ok', true); end if;
  update app.payment_agreements set cancelled_at = now(), cancelled_by_user_id = v_actor, cancel_reason = btrim(p_reason) where id = a.id;
  insert into app.collection_notes(organization_id, player_id, kind, body, created_by_user_id, created_by_name)
  values (p_organization_id, a.player_id, 'agreement', left('Acuerdo cancelado: ' || btrim(p_reason), 500), v_actor, private.nombre_actor());
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, 'PaymentAgreementCancelled', 'player', a.player_id, jsonb_build_object('agreementId', a.id, 'reason', btrim(p_reason)), v_actor);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function private.command_cancel_payment_agreement(uuid, uuid, text) from public, anon, authenticated;

create or replace function private.command_add_collection_note(p_organization_id uuid, p_player_id uuid, p_kind text, p_body text)
returns jsonb language plpgsql security definer
set search_path to 'pg_catalog', 'public', 'app', 'private'
as $$
declare v_id uuid;
begin
  if not (private.is_presidency(p_organization_id) or private.has_any_module_access(p_organization_id, array['billing','taquilla'], true)) then
    raise exception 'Not authorized';
  end if;
  if coalesce(p_kind, '') not in ('note','call','whatsapp','visit') then raise exception 'Tipo de nota inválido'; end if;
  if length(btrim(coalesce(p_body, ''))) not between 1 and 500 then raise exception 'La nota lleva de 1 a 500 letras'; end if;
  if not exists (select 1 from app.players where id = p_player_id and organization_id = p_organization_id) then raise exception 'Tanner no encontrado'; end if;
  insert into app.collection_notes(organization_id, player_id, kind, body, created_by_user_id, created_by_name)
  values (p_organization_id, p_player_id, p_kind, btrim(p_body), (select auth.uid()), private.nombre_actor())
  returning id into v_id;
  return jsonb_build_object('ok', true, 'noteId', v_id);
end $$;
revoke all on function private.command_add_collection_note(uuid, uuid, text, text) from public, anon, authenticated;

create or replace function public.v2_create_payment_agreement(organization_id uuid, player_id uuid, installments jsonb,
  note text default null, replace_open boolean default false, idempotency_key text default null)
returns jsonb language sql security definer set search_path to 'pg_catalog', 'private'
as $$ select private.command_create_payment_agreement(organization_id, player_id, installments, note, replace_open, idempotency_key) $$;
create or replace function public.v2_cancel_payment_agreement(organization_id uuid, agreement_id uuid, reason text)
returns jsonb language sql security definer set search_path to 'pg_catalog', 'private'
as $$ select private.command_cancel_payment_agreement(organization_id, agreement_id, reason) $$;
create or replace function public.v2_add_collection_note(organization_id uuid, player_id uuid, kind text, body text)
returns jsonb language sql security definer set search_path to 'pg_catalog', 'private'
as $$ select private.command_add_collection_note(organization_id, player_id, kind, body) $$;
revoke all on function public.v2_create_payment_agreement(uuid, uuid, jsonb, text, boolean, text), public.v2_cancel_payment_agreement(uuid, uuid, text), public.v2_add_collection_note(uuid, uuid, text, text) from public, anon;
grant execute on function public.v2_create_payment_agreement(uuid, uuid, jsonb, text, boolean, text) to authenticated;
grant execute on function public.v2_cancel_payment_agreement(uuid, uuid, text) to authenticated;
grant execute on function public.v2_add_collection_note(uuid, uuid, text, text) to authenticated;

-- El recargo se pausa mientras el Tanner cumple su acuerdo. Cuerpo idéntico
-- al anterior más la condición de "no tiene acuerdo activo".
create or replace function app.assess_late_fees(p_organization_id uuid, p_as_of date)
 returns integer
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'app', 'public'
as $function$
declare v_policy app.billing_policies%rowtype; v_count integer:=0;
begin
  select * into v_policy from app.billing_policies where organization_id=p_organization_id;

  with credito as (
    select pb.player_id, sum(pb.available_credit) as disponible
    from app.payment_balances pb
    where pb.organization_id = p_organization_id
    group by 1
  ), vencido as (
    select c.player_id, sum(cb.balance_due) as debe
    from app.charges c
    join app.charge_balances cb on cb.id = c.id
    where c.organization_id = p_organization_id
      and c.status = 'posted' and c.voided_at is null
      and cb.balance_due > 0 and p_as_of > c.due_date
    group by 1
  ),
  -- Quien ya pago: su dinero sin aplicar cubre todo lo que trae vencido. La
  -- regla del club es "si no pagaron al dia 5"; lo que importa es si el club
  -- tiene su dinero, no si un capturista alcanzo a aplicarlo.
  al_corriente as (
    select v.player_id, v.debe, coalesce(cr.disponible,0) as disponible
    from vencido v
    left join credito cr on cr.player_id = v.player_id
    where coalesce(cr.disponible,0) >= v.debe
  ),
  -- Quien cumple su acuerdo de pago (h26): mientras cumpla no hay recargo.
  con_acuerdo as (
    select a.player_id from app.payment_agreements a
    where a.organization_id = p_organization_id and a.cancelled_at is null
      and private.agreement_status(a.id, p_as_of)->>'state' = 'active'
  ),
  nuevos as (
    insert into app.charges(organization_id,player_id,billing_profile_id,parent_charge_id,charge_type,
      billing_period,concept,amount,due_date,status,source,late_fee_eligible,idempotency_key,posted_at,
      payer_type,payer_name,academy_enrollment_id,player_benefit_id)
    select c.organization_id,c.player_id,c.billing_profile_id,c.id,'late_fee',c.billing_period,
      'Recargo · '||c.concept,v_policy.late_fee_amount,p_as_of,'posted','billing_engine',false,
      'late-fee:'||c.id::text,now(),c.payer_type,c.payer_name,c.academy_enrollment_id,c.player_benefit_id
    from app.charges c
    join app.charge_balances cb on cb.id=c.id
    where c.organization_id=p_organization_id
      and c.charge_type in ('monthly_fee','academy_fee')
      and c.status='posted' and c.late_fee_eligible=true
      and cb.balance_due>0
      and c.billing_period>=date_trunc('month',v_policy.effective_from)::date
      and p_as_of>c.due_date
      and c.player_id not in (select player_id from al_corriente)
      and c.player_id not in (select player_id from con_acuerdo)
    on conflict do nothing
    returning 1
  ),
  -- Trazabilidad: queda la huella de a quien NO se le cobro mora y por que. Una
  -- sola por jugador y fecha de corte: el motor puede correrse varias veces.
  huella as (
    insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload)
    select p_organization_id,'LateFeeSkippedPlayerHasCredit','player',a.player_id,
           jsonb_build_object('asOf',p_as_of,'vencido',a.debe,'creditoDisponible',a.disponible)
    from al_corriente a
    where not exists (
      select 1 from app.domain_events e
      where e.organization_id = p_organization_id
        and e.event_type = 'LateFeeSkippedPlayerHasCredit'
        and e.aggregate_id = a.player_id
        and e.payload->>'asOf' = p_as_of::text)
    returning 1
  ),
  huella_acuerdo as (
    insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload)
    select p_organization_id,'LateFeeSkippedPlayerHasAgreement','player',a.player_id,jsonb_build_object('asOf',p_as_of)
    from con_acuerdo a
    where a.player_id in (select player_id from vencido)
      and not exists (
      select 1 from app.domain_events e
      where e.organization_id = p_organization_id
        and e.event_type = 'LateFeeSkippedPlayerHasAgreement'
        and e.aggregate_id = a.player_id
        and e.payload->>'asOf' = p_as_of::text)
    returning 1
  )
  select count(*) into v_count from nuevos;

  return v_count;
end $function$;

-- Lo que se necesita para cobrar desde el estado de cuenta (h25) más el
-- acuerdo vigente y el seguimiento.
create or replace function private.query_player_collection(p_organization_id uuid, p_player_id uuid)
returns jsonb language plpgsql stable security definer
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
