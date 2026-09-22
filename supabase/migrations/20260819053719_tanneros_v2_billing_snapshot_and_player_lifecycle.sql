create or replace view app.player_billing_status as
select
  p.organization_id,
  p.id as player_id,
  p.code,
  p.first_name,
  p.last_name,
  p.status as player_status,
  bp.id as billing_profile_id,
  bp.base_monthly_fee,
  bp.billing_start,
  bp.status as billing_status,
  bp.needs_review,
  bp.review_reason,
  exists(
    select 1 from app.player_benefits b
    where b.player_id=p.id and b.organization_id=p.organization_id and b.active=true
      and b.benefit_type='scholarship_full'
      and current_date between b.starts_on and coalesce(b.ends_on,'infinity'::date)
  ) as has_full_scholarship,
  exists(
    select 1 from app.player_benefits b
    where b.player_id=p.id and b.organization_id=p.organization_id and b.active=true
      and b.benefit_type='sponsor_funded'
      and current_date between b.starts_on and coalesce(b.ends_on,'infinity'::date)
  ) as sponsor_funded
from app.players p
left join app.billing_profiles bp on bp.player_id=p.id and bp.organization_id=p.organization_id;

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
  (select count(*) from pop where not has_full_scholarship),
  (select count(*) from pop p join monthly m on m.player_id=p.player_id
    where not p.has_full_scholarship and m.computed_status in ('paid','waived')),
  (select count(*) from pop p join monthly m on m.player_id=p.player_id
    where not p.has_full_scholarship and m.computed_status in ('pending','partial')),
  (select count(*) from pop p where not p.has_full_scholarship and (p.needs_review or p.base_monthly_fee is null or p.base_monthly_fee<=0)),
  case when (select count(*) from pop where not has_full_scholarship)=0 then 100
       else round(100.0*(select count(*) from pop p join monthly m on m.player_id=p.player_id where not p.has_full_scholarship and m.computed_status in ('paid','waived'))/(select count(*) from pop where not has_full_scholarship)) end,
  (select coalesce(sum(m.balance_due),0) from monthly m),
  (select total_due from totals);
$$;

create or replace function app.withdraw_player(p_player_id uuid,p_withdrawn_at date,p_reason text,p_actor text default null)
returns void
language plpgsql
security definer
set search_path=app,public
as $$
declare v_org uuid;
begin
  select organization_id into v_org from app.players where id=p_player_id for update;
  if v_org is null then raise exception 'Player not found'; end if;
  update app.players set status='withdrawn',withdrawn_at=p_withdrawn_at,withdrawal_reason=p_reason,updated_at=now() where id=p_player_id;
  update app.billing_profiles set status='closed',updated_at=now() where player_id=p_player_id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(v_org,'PlayerWithdrawn','player',p_player_id,jsonb_build_object('withdrawn_at',p_withdrawn_at,'reason',p_reason),p_actor);
end $$;

create or replace function app.reactivate_player(p_player_id uuid,p_reactivated_at date,p_actor text default null)
returns void
language plpgsql
security definer
set search_path=app,public
as $$
declare v_org uuid;
begin
  select organization_id into v_org from app.players where id=p_player_id for update;
  if v_org is null then raise exception 'Player not found'; end if;
  update app.players set status='active',withdrawn_at=null,withdrawal_reason=null,updated_at=now() where id=p_player_id;
  update app.billing_profiles
     set status='active', billing_start=greatest(billing_start,p_reactivated_at), updated_at=now()
   where player_id=p_player_id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(v_org,'PlayerReactivated','player',p_player_id,jsonb_build_object('reactivated_at',p_reactivated_at),p_actor);
end $$;

revoke all on schema app from anon,authenticated;
revoke all on all tables in schema app from anon,authenticated;
revoke all on all functions in schema app from anon,authenticated;
grant usage on schema app to service_role;
grant all on all tables in schema app to service_role;
grant execute on all functions in schema app to service_role;

comment on function app.collection_snapshot(uuid,date) is 'Canonical collection KPI source for TannerOS v2.';
comment on function app.withdraw_player(uuid,date,text,text) is 'Closes future billing while preserving all historical charges/payments.';;
