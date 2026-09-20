alter table app.billing_policies add column if not exists effective_from date not null default date '2026-09-01';

update app.billing_policies
set effective_from=date '2026-09-01'
where organization_id=(select id from public.organizations where slug='tannery-city-fc');

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
    and c.billing_period>=date_trunc('month',v_policy.effective_from)::date
    and p_as_of>c.due_date
  on conflict do nothing;
  get diagnostics v_count=row_count;
  return v_count;
end $$;

comment on column app.billing_policies.effective_from is 'First billing period governed natively by TannerOS v2 policy; earlier history is preserved as recorded.';;
