create or replace view app.charge_balances as
select
  c.id,
  c.organization_id,
  c.player_id,
  c.billing_profile_id,
  c.charge_type,
  c.billing_period,
  c.concept,
  c.amount as base_amount,
  coalesce(adj.increases,0) as adjustment_increases,
  coalesce(adj.decreases,0) as adjustment_decreases,
  greatest(0,c.amount + coalesce(adj.increases,0) - coalesce(adj.decreases,0)) as net_amount,
  coalesce(pa.allocated_amount,0) as allocated_amount,
  greatest(0,(c.amount + coalesce(adj.increases,0) - coalesce(adj.decreases,0)) - coalesce(pa.allocated_amount,0)) as balance_due,
  case
    when c.status='void' then 'void'
    when greatest(0,c.amount + coalesce(adj.increases,0) - coalesce(adj.decreases,0))=0 then 'waived'
    when coalesce(pa.allocated_amount,0) >= greatest(0,c.amount + coalesce(adj.increases,0) - coalesce(adj.decreases,0)) then 'paid'
    when coalesce(pa.allocated_amount,0)>0 then 'partial'
    else 'pending'
  end as computed_status,
  c.due_date,
  c.late_fee_eligible,
  c.created_at,
  c.updated_at
from app.charges c
left join lateral (
  select
    sum(case when a.status='posted' and a.direction='increase' then a.amount else 0 end) as increases,
    sum(case when a.status='posted' and a.direction='decrease' then a.amount else 0 end) as decreases
  from app.charge_adjustments a where a.charge_id=c.id
) adj on true
left join lateral (
  select coalesce(sum(a.amount),0) as allocated_amount
  from app.payment_allocations a where a.charge_id=c.id and a.status='posted'
) pa on true;

create or replace view app.payment_balances as
select
  p.id,
  p.organization_id,
  p.player_id,
  p.amount,
  coalesce(a.allocated_amount,0) as allocated_amount,
  coalesce(r.refunded_amount,0) as refunded_amount,
  greatest(0,p.amount-coalesce(a.allocated_amount,0)-coalesce(r.refunded_amount,0)) as available_credit,
  p.status,
  p.payment_date,
  p.method,
  p.reference,
  p.payer_type,
  p.payer_name
from app.payments p
left join lateral (
  select coalesce(sum(x.amount),0) allocated_amount from app.payment_allocations x where x.payment_id=p.id and x.status='posted'
) a on true
left join lateral (
  select coalesce(sum(x.amount),0) refunded_amount from app.refunds x where x.payment_id=p.id and x.status='posted'
) r on true;;
