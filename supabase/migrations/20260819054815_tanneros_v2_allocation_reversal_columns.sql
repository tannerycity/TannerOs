alter table app.payment_allocations add column if not exists status text not null default 'posted';
alter table app.payment_allocations add column if not exists reversed_at timestamptz;
alter table app.payment_allocations add column if not exists reversal_reason text;
alter table app.payment_allocations add column if not exists reversed_by uuid references auth.users(id) on delete set null;
alter table app.payment_allocations drop constraint if exists payment_allocations_status_check;
alter table app.payment_allocations add constraint payment_allocations_status_check check (status in ('posted','reversed'));
comment on column app.payment_allocations.status is 'Allocations are never deleted for business corrections; they are reversed with reason/user/timestamp.';;
