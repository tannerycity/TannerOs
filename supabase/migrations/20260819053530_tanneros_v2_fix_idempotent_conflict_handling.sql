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
  on conflict do nothing;

  get diagnostics v_count=row_count;
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
  on conflict do nothing;
  get diagnostics v_count=row_count;
  return v_count;
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
  on conflict do nothing;
  get diagnostics v_count=row_count;
  return v_count;
end $$;;
