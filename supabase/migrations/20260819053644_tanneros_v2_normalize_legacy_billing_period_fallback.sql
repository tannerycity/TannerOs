update app.payments
set legacy_billing_period=date_trunc('month',payment_date)::date,
    allocation_note=coalesce(allocation_note,'') || case when coalesce(allocation_note,'')='' then '' else ' | ' end || 'Legacy period inferred from payment_date because source period was empty.'
where source='legacy_import'
  and payment_purpose='billing'
  and legacy_billing_period is null
  and payment_date is not null;

comment on column app.payments.legacy_billing_period is 'Transitional historical month. Source period when available; otherwise inferred from payment_date to preserve TannerOS v1 payPeriod semantics.';;
