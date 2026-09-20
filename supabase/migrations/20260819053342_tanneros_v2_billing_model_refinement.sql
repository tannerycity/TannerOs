alter table app.billing_profiles rename column monthly_fee to base_monthly_fee;

update app.billing_profiles bp
set billing_start = case
  when lp.billing_start is not null then lp.billing_start
  when lp.created_at::date >= date '2026-08-01' then date_trunc('month',lp.created_at)::date
  else date '2026-07-01'
end
from app.players p
join public.players lp on lp.id=p.legacy_id
where bp.player_id=p.id;

update app.billing_profiles
set billing_start = coalesce(billing_start, date '2026-07-01');
alter table app.billing_profiles alter column billing_start set not null;

alter table app.payments add column if not exists payment_purpose text;
alter table app.payments add column if not exists credit_status text not null default 'available';
alter table app.payments add column if not exists allocation_note text;

update app.payments
set payment_purpose = case
  when lower(coalesce(category,'')) in ('mensualidad','beca','ajuste') then 'billing'
  when lower(coalesce(category,'')) in ('tienda','uniforme') then 'commerce'
  when lower(coalesce(category,'')) in ('inscripción','inscripcion') then 'registration'
  when lower(coalesce(category,'')) like '%curso%' then 'program'
  when lower(coalesce(category,'')) like '%patrocin%' then 'sponsorship'
  else 'other'
end
where payment_purpose is null;

alter table app.payments alter column payment_purpose set default 'other';
alter table app.payments alter column payment_purpose set not null;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='payments_payment_purpose_check') THEN
    ALTER TABLE app.payments ADD CONSTRAINT payments_payment_purpose_check CHECK (payment_purpose in ('billing','commerce','registration','program','sponsorship','other'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='payments_credit_status_check') THEN
    ALTER TABLE app.payments ADD CONSTRAINT payments_credit_status_check CHECK (credit_status in ('available','legacy_hold','consumed','not_applicable'));
  END IF;
END $$;

update app.payments
set credit_status = case
  when source='legacy_import' and payment_purpose='billing' then 'legacy_hold'
  when payment_purpose<>'billing' then 'not_applicable'
  else 'available'
end;

alter table app.charges add column if not exists parent_charge_id uuid references app.charges(id) on delete restrict;
alter table app.charges add column if not exists posted_at timestamptz not null default now();
alter table app.charges add column if not exists voided_at timestamptz;
alter table app.charges add column if not exists void_reason text;

alter table app.charges drop constraint if exists charges_status_check;
update app.charges set status='posted' where status<>'void';
alter table app.charges add constraint charges_status_check check (status in ('posted','void'));
alter table app.charges alter column status set default 'posted';

comment on column app.billing_profiles.base_monthly_fee is 'Contracted monthly amount before structured recurring benefits/adjustments.';
comment on column app.payments.credit_status is 'Legacy imported excess is held from future allocation until reconciled; new v2 overpayments remain available credit.';
comment on column app.charges.status is 'Lifecycle state only. Collection state is derived from app.charge_balances.computed_status.';;
