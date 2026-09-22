create or replace function app.enforce_payment_capacity() returns trigger
language plpgsql as $$
declare payment_total numeric; used_total numeric; refunded_total numeric;
begin
 select amount into payment_total from app.payments where id=new.payment_id and organization_id=new.organization_id and status='posted' for update;
 if payment_total is null then raise exception 'Payment is not available for allocation'; end if;
 select coalesce(sum(amount),0) into used_total from app.payment_allocations where payment_id=new.payment_id and id<>new.id;
 select coalesce(sum(amount),0) into refunded_total from app.refunds where payment_id=new.payment_id and status='posted';
 if used_total+refunded_total+new.amount>payment_total then raise exception 'Allocation exceeds available payment balance'; end if;
 return new;
end;
$$;

drop trigger if exists trg_payment_allocation_capacity on app.payment_allocations;
create trigger trg_payment_allocation_capacity before insert or update on app.payment_allocations for each row execute function app.enforce_payment_capacity();

create or replace function app.enforce_refund_capacity() returns trigger
language plpgsql as $$
declare payment_total numeric; allocated_total numeric; other_refunds numeric; requested_refund numeric;
begin
 select amount into payment_total from app.payments where id=new.payment_id and organization_id=new.organization_id and status='posted' for update;
 if payment_total is null then raise exception 'Payment is not available for refund'; end if;
 select coalesce(sum(amount),0) into allocated_total from app.payment_allocations where payment_id=new.payment_id;
 select coalesce(sum(amount),0) into other_refunds from app.refunds where payment_id=new.payment_id and status='posted' and id<>new.id;
 requested_refund:=0;
 if new.status='posted' then requested_refund:=new.amount; end if;
 if allocated_total+other_refunds+requested_refund>payment_total then raise exception 'Refund exceeds unallocated payment balance; reverse allocations first'; end if;
 return new;
end;
$$;

drop trigger if exists trg_refund_capacity on app.refunds;
create trigger trg_refund_capacity before insert or update on app.refunds for each row execute function app.enforce_refund_capacity();;
