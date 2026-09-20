create or replace function app.enforce_refund_capacity()
returns trigger
language plpgsql
as $fn$
declare
  payment_total numeric;
  allocated_total numeric;
  other_refunds numeric;
  requested_refund numeric;
begin
  select amount into payment_total
  from app.payments
  where id=new.payment_id and organization_id=new.organization_id and status='posted'
  for update;
  if payment_total is null then
    raise exception 'Payment is not available for refund';
  end if;
  select coalesce(sum(amount),0) into allocated_total
  from app.payment_allocations
  where payment_id=new.payment_id and status='posted';
  select coalesce(sum(amount),0) into other_refunds
  from app.refunds
  where payment_id=new.payment_id and status='posted' and id<>new.id;
  requested_refund := 0;
  if new.status='posted' then
    requested_refund := new.amount;
  end if;
  if allocated_total + other_refunds + requested_refund > payment_total then
    raise exception 'Refund exceeds unallocated payment balance; reverse allocations first';
  end if;
  return new;
end;
$fn$;;
