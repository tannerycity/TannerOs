-- La frontera de la migración (2026-09-01) estaba escrita a mano dentro de
-- app.allocate_payment_oldest_first y repetida en el cliente. Se centraliza
-- para que cobranza, asignación de pagos y KPIs hablen de la misma fecha.
create or replace function app.billing_cutover()
returns date language sql immutable
set search_path to 'pg_catalog'
as $$ select date '2026-09-01' $$;

comment on function app.billing_cutover() is
  'Frontera de la migración de saldos. app.allocate_payment_oldest_first no aplica pagos a cargos anteriores, así que ese saldo es residuo a conciliar a mano y no cartera cobrable.';

-- Mismo comportamiento que antes; sólo deja de repetir la fecha.
create or replace function app.allocate_payment_oldest_first(p_payment_id uuid)
returns numeric language plpgsql security definer
set search_path to 'app','public'
as $function$
declare v_payment app.payments%rowtype; r record; v_available numeric; v_piece numeric; v_total numeric:=0;
begin
  select * into v_payment from app.payments where id=p_payment_id for update;
  if not found or v_payment.status<>'posted' then raise exception 'Payment not available'; end if;
  if v_payment.payment_purpose<>'billing' then raise exception 'Payment is not a billing payment'; end if;
  if v_payment.credit_status='legacy_hold' then raise exception 'Legacy held credit requires explicit reconciliation'; end if;
  for r in
    select cb.* from app.charge_balances cb
    where cb.organization_id=v_payment.organization_id
      and cb.player_id=v_payment.player_id
      and cb.computed_status in ('pending','partial')
      and cb.balance_due>0
      and cb.billing_period>=app.billing_cutover()
      and ((v_payment.payer_type='sponsor' and cb.payer_type='sponsor'
            and (cb.payer_name is null or v_payment.payer_name is null
                 or lower(trim(cb.payer_name))=lower(trim(v_payment.payer_name))))
        or (coalesce(v_payment.payer_type,'guardian')<>'sponsor'
            and coalesce(cb.payer_type,'guardian')<>'sponsor'))
    order by cb.billing_period nulls last, cb.due_date, cb.created_at, cb.id
  loop
    select available_credit into v_available from app.payment_balances where id=v_payment.id;
    exit when coalesce(v_available,0)<=0;
    v_piece:=least(v_available,r.balance_due);
    insert into app.payment_allocations(organization_id,payment_id,charge_id,amount)
    values(v_payment.organization_id,v_payment.id,r.id,v_piece)
    on conflict(payment_id,charge_id) do update set amount=app.payment_allocations.amount+excluded.amount;
    v_total:=v_total+v_piece;
  end loop;
  return v_total;
end $function$;

-- total_receivable se conserva tal cual para no romper consumidores; se
-- agregan las columnas que permiten distinguir lo que sí es cobrable.
drop function if exists app.collection_snapshot(uuid,date);
create function app.collection_snapshot(p_organization_id uuid, p_period date)
returns table(
  billing_period date, active_players bigint, collection_population bigint,
  covered bigint, pending_players bigint, needs_configuration bigint,
  collection_rate numeric, current_period_receivable numeric, total_receivable numeric,
  collectable_receivable numeric, collectable_players bigint,
  residual_receivable numeric, residual_players bigint, billing_cutover date)
language sql stable
set search_path to 'app','public'
as $function$
with pop as (
  select s.* from app.player_billing_status s
  where s.organization_id=p_organization_id and s.player_status='active'
), collection_pop as (
  select * from pop
  where not has_full_scholarship
    and not (sponsor_funded and coalesce(base_monthly_fee,0)<=0)
), monthly as (
  select cb.player_id,cb.computed_status,cb.balance_due
  from app.charge_balances cb
  where cb.organization_id=p_organization_id
    and cb.charge_type='monthly_fee'
    and cb.billing_period=date_trunc('month',p_period)::date
), abiertos as (
  select cb.player_id, cb.balance_due, cb.billing_period
  from app.charge_balances cb join collection_pop p on p.player_id=cb.player_id
  where cb.organization_id=p_organization_id
    and cb.charge_type='monthly_fee'
    and cb.billing_period<=date_trunc('month',p_period)::date
    and cb.balance_due>0
)
select
  date_trunc('month',p_period)::date,
  (select count(*) from pop),
  (select count(*) from collection_pop),
  (select count(*) from collection_pop p join monthly m on m.player_id=p.player_id where m.computed_status in ('paid','waived')),
  (select count(*) from collection_pop p join monthly m on m.player_id=p.player_id where m.computed_status in ('pending','partial')),
  (select count(*) from collection_pop p where p.needs_review or p.base_monthly_fee is null or p.base_monthly_fee<=0),
  case when (select count(*) from collection_pop)=0 then 100
       else round(100.0*(select count(*) from collection_pop p join monthly m on m.player_id=p.player_id where m.computed_status in ('paid','waived'))/(select count(*) from collection_pop)) end,
  (select coalesce(sum(m.balance_due),0) from monthly m join collection_pop p on p.player_id=m.player_id),
  (select coalesce(sum(a.balance_due),0) from abiertos a),
  (select coalesce(sum(a.balance_due),0) from abiertos a where a.billing_period>=app.billing_cutover()),
  (select count(distinct a.player_id) from abiertos a where a.billing_period>=app.billing_cutover()),
  (select coalesce(sum(a.balance_due),0) from abiertos a where a.billing_period<app.billing_cutover()),
  (select count(distinct a.player_id) from abiertos a where a.billing_period<app.billing_cutover()),
  app.billing_cutover();
$function$;

revoke all on function app.collection_snapshot(uuid,date) from public, anon;
revoke all on function app.billing_cutover() from public, anon;
grant execute on function app.billing_cutover() to authenticated;;
