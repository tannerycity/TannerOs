create or replace function app.collection_snapshot(p_organization_id uuid,p_period date)
returns table(
  billing_period date,
  active_players bigint,
  collection_population bigint,
  covered bigint,
  pending_players bigint,
  needs_configuration bigint,
  collection_rate numeric,
  current_period_receivable numeric,
  total_receivable numeric
)
language sql stable
set search_path=app,public
as $$
with pop as (
  select s.*
  from app.player_billing_status s
  where s.organization_id=p_organization_id and s.player_status='active'
), family_pop as (
  select * from pop where not has_full_scholarship and not sponsor_funded
), monthly as (
  select cb.player_id,cb.computed_status,cb.balance_due
  from app.charge_balances cb
  where cb.organization_id=p_organization_id
    and cb.charge_type='monthly_fee'
    and cb.billing_period=date_trunc('month',p_period)::date
), totals as (
  select coalesce(sum(balance_due),0) total_due
  from app.charge_balances
  where organization_id=p_organization_id and charge_type='monthly_fee'
    and billing_period<=date_trunc('month',p_period)::date
)
select
  date_trunc('month',p_period)::date,
  (select count(*) from pop),
  (select count(*) from family_pop),
  (select count(*) from family_pop p join monthly m on m.player_id=p.player_id where m.computed_status in ('paid','waived')),
  (select count(*) from family_pop p join monthly m on m.player_id=p.player_id where m.computed_status in ('pending','partial')),
  (select count(*) from family_pop p where p.needs_review or p.base_monthly_fee is null or p.base_monthly_fee<=0),
  case when (select count(*) from family_pop)=0 then 100
       else round(100.0*(select count(*) from family_pop p join monthly m on m.player_id=p.player_id where m.computed_status in ('paid','waived'))/(select count(*) from family_pop)) end,
  (select coalesce(sum(m.balance_due),0) from monthly m join family_pop p on p.player_id=m.player_id),
  (select coalesce(sum(cb.balance_due),0) from app.charge_balances cb join family_pop p on p.player_id=cb.player_id
    where cb.organization_id=p_organization_id and cb.charge_type='monthly_fee' and cb.billing_period<=date_trunc('month',p_period)::date);
$$;

comment on function app.collection_snapshot(uuid,date) is 'Family collection KPI: excludes full scholarships and sponsor-funded players; sponsor revenue is reported separately.';;
