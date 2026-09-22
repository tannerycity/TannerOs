insert into app.player_benefits (
  organization_id, player_id, benefit_type, calculation_type, fixed_amount, funding_source_name,
  starts_on, active, priority, notes, legacy_label
)
select
  p.organization_id,
  p.id,
  case
    when lower(coalesce(lp.scholarship_type,'')) in ('hermanos','hermanos tanner','hermanos tanners') then 'sibling_discount'
    when lower(coalesce(lp.scholarship_type,'')) like '%curtibrother%' then 'sponsor_funded'
    when coalesce(lp.scholarship,false) and coalesce(lp.monthly_fee,0)=0 then 'scholarship_full'
    when coalesce(lp.scholarship,false) then 'scholarship_partial'
    else 'custom'
  end,
  case
    when lower(coalesce(lp.scholarship_type,'')) in ('hermanos','hermanos tanner','hermanos tanners') then 'informational'
    when lower(coalesce(lp.scholarship_type,'')) like '%curtibrother%' then 'informational'
    when coalesce(lp.scholarship,false) and coalesce(lp.monthly_fee,0)=0 then 'full_waiver'
    else 'informational'
  end,
  case when lower(coalesce(lp.scholarship_type,'')) in ('hermanos','hermanos tanner','hermanos tanners') then 50 else null end,
  case when lower(coalesce(lp.scholarship_type,'')) like '%curtibrother%' then 'Curtibrother' else null end,
  coalesce(bp.billing_start,date '2026-07-01'),
  true,
  100,
  'Imported as legacy context. Historical payable amount remains base_monthly_fee to avoid double-discounting.',
  lp.scholarship_type
from app.players p
join app.billing_profiles bp on bp.player_id=p.id
join public.players lp on lp.id=p.legacy_id
where coalesce(lp.scholarship,false)=true
  and not exists (
    select 1 from app.player_benefits b where b.player_id=p.id and b.legacy_label is not distinct from lp.scholarship_type
  );

create or replace function app.month_due_date(p_period date, p_due_day integer)
returns date language sql immutable as $$
  select make_date(extract(year from p_period)::int, extract(month from p_period)::int,
    least(p_due_day, extract(day from (date_trunc('month',p_period)+interval '1 month - 1 day'))::int));
$$;

create or replace function app.generate_monthly_charges(p_organization_id uuid, p_period date)
returns integer
language plpgsql
security definer
set search_path=app,public
as $$
declare
  v_period date := date_trunc('month',p_period)::date;
  v_policy app.billing_policies%rowtype;
  v_count integer := 0;
begin
  select * into v_policy from app.billing_policies where organization_id=p_organization_id;
  if not found then raise exception 'Billing policy not configured'; end if;

  insert into app.charges (
    organization_id,player_id,billing_profile_id,charge_type,billing_period,concept,amount,due_date,status,source,
    late_fee_eligible,idempotency_key,posted_at
  )
  select
    bp.organization_id,p.id,bp.id,'monthly_fee',v_period,
    'Monthly fee '||to_char(v_period,'YYYY-MM'),
    app.prorated_monthly_fee(bp.base_monthly_fee,bp.billing_start,v_period,v_policy.proration_method),
    app.month_due_date(v_period,v_policy.due_day),
    'posted','billing_engine',
    case when date_trunc('month',bp.billing_start)::date=v_period then v_policy.first_month_late_fee_enabled else true end,
    'monthly:'||p.id::text||':'||to_char(v_period,'YYYY-MM'),
    now()
  from app.billing_profiles bp
  join app.players p on p.id=bp.player_id and p.organization_id=bp.organization_id
  where bp.organization_id=p_organization_id
    and bp.status='active'
    and p.status='active'
    and bp.needs_review=false
    and bp.base_monthly_fee>0
    and date_trunc('month',bp.billing_start)::date <= v_period
  on conflict (organization_id,idempotency_key) do nothing;

  get diagnostics v_count=row_count;
  return v_count;
end $$;

create or replace function app.allocate_legacy_billing_payments(p_organization_id uuid, p_period date)
returns integer
language plpgsql
security definer
set search_path=app,public
as $$
declare
  r record;
  v_charge uuid;
  v_due numeric;
  v_available numeric;
  v_amount numeric;
  v_count integer:=0;
begin
  for r in
    select p.*
    from app.payments p
    where p.organization_id=p_organization_id
      and p.source='legacy_import'
      and p.status='posted'
      and p.payment_purpose='billing'
      and p.legacy_billing_period=date_trunc('month',p_period)::date
      and lower(coalesce(p.category,'')) in ('mensualidad','beca')
      and p.amount>0
    order by p.payment_date,p.created_at,p.id
  loop
    select c.id,cb.balance_due into v_charge,v_due
    from app.charges c join app.charge_balances cb on cb.id=c.id
    where c.organization_id=p_organization_id and c.player_id=r.player_id
      and c.charge_type='monthly_fee' and c.billing_period=date_trunc('month',p_period)::date
      and c.status='posted'
    limit 1;

    if v_charge is null or coalesce(v_due,0)<=0 then continue; end if;

    select available_credit into v_available from app.payment_balances where id=r.id;
    v_amount:=least(coalesce(v_available,0),v_due);
    if v_amount>0 then
      insert into app.payment_allocations(organization_id,payment_id,charge_id,amount)
      values(p_organization_id,r.id,v_charge,v_amount)
      on conflict(payment_id,charge_id) do update set amount=excluded.amount;
      v_count:=v_count+1;
    end if;
    v_charge:=null; v_due:=null;
  end loop;
  return v_count;
end $$;

create or replace function app.apply_legacy_exemptions(p_organization_id uuid, p_period date)
returns integer
language plpgsql
security definer
set search_path=app,public
as $$
declare v_count integer:=0;
begin
  insert into app.charge_adjustments(
    organization_id,charge_id,adjustment_type,amount,reason,status,idempotency_key,direction
  )
  select
    c.organization_id,c.id,'waiver',cb.balance_due,
    coalesce(lp.notes,lp.status,'Legacy exemption'),'posted',
    'legacy-exempt:'||c.id::text,'decrease'
  from app.charges c
  join app.charge_balances cb on cb.id=c.id
  join app.players p on p.id=c.player_id
  join public.payments lp on lp.player_id=p.legacy_id
    and lp.deleted=false and lp.type='income'
    and lower(coalesce(lp.category,''))='ajuste'
    and lower(coalesce(lp.status,'')) in ('exento','no cobrable','congelado','pagado fuera del sistema')
    and date_trunc('month',coalesce(to_date(lp.period||'-01','YYYY-MM-DD'),lp.date))::date=c.billing_period
  where c.organization_id=p_organization_id and c.billing_period=date_trunc('month',p_period)::date
    and c.status='posted' and cb.balance_due>0
  on conflict(organization_id,idempotency_key) do nothing;
  get diagnostics v_count=row_count;
  return v_count;
end $$;

create or replace function app.allocate_payment_oldest_first(p_payment_id uuid)
returns numeric
language plpgsql
security definer
set search_path=app,public
as $$
declare
  v_payment app.payments%rowtype;
  r record;
  v_available numeric;
  v_piece numeric;
  v_total numeric:=0;
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
    order by cb.billing_period nulls last,cb.due_date,cb.created_at,cb.id
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
end $$;

create or replace function app.assess_late_fees(p_organization_id uuid, p_as_of date)
returns integer
language plpgsql
security definer
set search_path=app,public
as $$
declare
  v_policy app.billing_policies%rowtype;
  v_count integer:=0;
begin
  select * into v_policy from app.billing_policies where organization_id=p_organization_id;
  insert into app.charges(
    organization_id,player_id,billing_profile_id,parent_charge_id,charge_type,billing_period,concept,amount,due_date,status,source,
    late_fee_eligible,idempotency_key,posted_at
  )
  select c.organization_id,c.player_id,c.billing_profile_id,c.id,'late_fee',c.billing_period,
    'Late fee '||to_char(c.billing_period,'YYYY-MM'),v_policy.late_fee_amount,p_as_of,'posted','billing_engine',false,
    'late-fee:'||c.id::text,now()
  from app.charges c join app.charge_balances cb on cb.id=c.id
  where c.organization_id=p_organization_id and c.charge_type='monthly_fee' and c.status='posted'
    and c.late_fee_eligible=true and cb.balance_due>0
    and p_as_of>c.due_date
  on conflict(organization_id,idempotency_key) do nothing;
  get diagnostics v_count=row_count;
  return v_count;
end $$;

comment on function app.generate_monthly_charges(uuid,date) is 'Idempotent monthly charge generation for the canonical billing domain.';
comment on function app.allocate_payment_oldest_first(uuid) is 'Allocates new v2 billing payments to oldest debt; excess remains available credit.';;
