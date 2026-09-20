create or replace function app.enforce_payment_capacity()
returns trigger
language plpgsql
as $fn$
declare
  payment_total numeric;
  used_total numeric;
  refunded_total numeric;
begin
  if new.status='reversed' then
    return new;
  end if;
  select amount into payment_total
  from app.payments
  where id=new.payment_id and organization_id=new.organization_id and status='posted'
  for update;
  if payment_total is null then
    raise exception 'Payment is not available for allocation';
  end if;
  select coalesce(sum(amount),0) into used_total
  from app.payment_allocations
  where payment_id=new.payment_id and status='posted' and id<>new.id;
  select coalesce(sum(amount),0) into refunded_total
  from app.refunds
  where payment_id=new.payment_id and status='posted';
  if used_total + refunded_total + new.amount > payment_total then
    raise exception 'Allocation exceeds available payment balance';
  end if;
  return new;
end;
$fn$;;
