alter table app.charge_adjustments add column if not exists direction text not null default 'decrease';
DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='charge_adjustments_direction_check') THEN
  ALTER TABLE app.charge_adjustments ADD CONSTRAINT charge_adjustments_direction_check CHECK (direction in ('increase','decrease'));
END IF;
END $$;
update app.charge_adjustments set direction='increase' where adjustment_type='debit';

create or replace function app.prorated_monthly_fee(p_base_fee numeric,p_joined_at date,p_billing_period date,p_method text default 'weekly_quarters') returns numeric
language plpgsql immutable as $$
declare d integer; weeks integer;
begin
 if coalesce(p_base_fee,0)<=0 then return 0; end if;
 if p_joined_at is null or date_trunc('month',p_joined_at)::date<>date_trunc('month',p_billing_period)::date then return p_base_fee; end if;
 if p_method='none' then return p_base_fee; end if;
 d:=extract(day from p_joined_at)::integer;
 weeks:=case when d<=7 then 4 when d<=14 then 3 when d<=21 then 2 else 1 end;
 return round(p_base_fee*weeks/4.0);
end;
$$;

create or replace view app.charge_balances as
select c.id,c.organization_id,c.player_id,c.billing_profile_id,c.charge_type,c.billing_period,c.concept,
 c.amount as base_amount,
 coalesce(adj.increases,0) adjustment_increases,
 coalesce(adj.decreases,0) adjustment_decreases,
 greatest(0,c.amount+coalesce(adj.increases,0)-coalesce(adj.decreases,0)) net_amount,
 coalesce(pa.allocated_amount,0) allocated_amount,
 greatest(0,(c.amount+coalesce(adj.increases,0)-coalesce(adj.decreases,0))-coalesce(pa.allocated_amount,0)) balance_due,
 case when c.status='void' then 'void'
      when greatest(0,c.amount+coalesce(adj.increases,0)-coalesce(adj.decreases,0))=0 then 'waived'
      when coalesce(pa.allocated_amount,0)>=greatest(0,c.amount+coalesce(adj.increases,0)-coalesce(adj.decreases,0)) then 'paid'
      when coalesce(pa.allocated_amount,0)>0 then 'partial'
      else 'pending' end computed_status,
 c.due_date,c.late_fee_eligible,c.created_at,c.updated_at
from app.charges c
left join lateral (
 select sum(case when status='posted' and direction='increase' then amount else 0 end) increases,
        sum(case when status='posted' and direction='decrease' then amount else 0 end) decreases
 from app.charge_adjustments where charge_id=c.id
) adj on true
left join lateral (
 select coalesce(sum(amount),0) allocated_amount from app.payment_allocations where charge_id=c.id
) pa on true;

create or replace view app.payment_balances as
select p.id,p.organization_id,p.player_id,p.amount,
 coalesce(a.allocated_amount,0) allocated_amount,
 coalesce(r.refunded_amount,0) refunded_amount,
 greatest(0,p.amount-coalesce(a.allocated_amount,0)-coalesce(r.refunded_amount,0)) available_credit,
 p.status,p.payment_date,p.method,p.reference,p.payer_type,p.payer_name
from app.payments p
left join lateral (select coalesce(sum(amount),0) allocated_amount from app.payment_allocations where payment_id=p.id) a on true
left join lateral (select coalesce(sum(amount),0) refunded_amount from app.refunds where payment_id=p.id and status='posted') r on true;
;
