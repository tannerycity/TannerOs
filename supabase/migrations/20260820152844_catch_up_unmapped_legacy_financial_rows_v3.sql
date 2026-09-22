insert into app.expenses (
  organization_id, legacy_id, amount, expense_date, category, concept, method, reference,
  supplier_name, status, source, notes, created_at, updated_at, legacy_status, metadata
)
select
  p.organization_id, p.id, p.amount, coalesce(p.date, p.created_at::date), p.category, p.concept,
  p.method, p.reference, p.supplier_name, 'posted', 'legacy_v1', p.notes,
  coalesce(p.created_at, now()), coalesce(p.updated_at, p.created_at, now()), p.status,
  jsonb_build_object('legacySource','payments','migratedAt',current_date::text,'catchUp',true)
from public.payments p
where not coalesce(p.deleted,false)
  and lower(trim(coalesce(p.type,''))) in ('gasto','egreso','salida','expense')
  and p.amount > 0
  and not exists (select 1 from app.expenses e where e.organization_id=p.organization_id and e.legacy_id=p.id)
  and not exists (select 1 from app.payments x where x.organization_id=p.organization_id and x.legacy_id=p.id);

insert into app.payments (
  organization_id, legacy_id, amount, payment_date, method, reference, concept, status, source,
  notes, created_at, updated_at, category, legacy_status, legacy_billing_period,
  payer_type, payer_name, payment_purpose, credit_status, allocation_note
)
select
  p.organization_id, p.id, p.amount, coalesce(p.date, p.created_at::date), p.method, p.reference,
  p.concept, 'posted', 'legacy_v1', p.notes,
  coalesce(p.created_at, now()), coalesce(p.updated_at, p.created_at, now()), p.category,
  p.status,
  case when trim(coalesce(p.period,'')) ~ '^\d{4}-\d{2}$' then (trim(p.period)||'-01')::date else null end,
  'other', 'Sin atribuir', 'other', 'legacy_hold',
  'Pago histórico sin entidad suficiente para aplicar de forma segura'
from public.payments p
where not coalesce(p.deleted,false)
  and lower(trim(coalesce(p.type,''))) in ('ingreso','entrada','income')
  and p.amount > 0
  and not exists (select 1 from app.payments x where x.organization_id=p.organization_id and x.legacy_id=p.id)
  and not exists (select 1 from app.expenses e where e.organization_id=p.organization_id and e.legacy_id=p.id);;
