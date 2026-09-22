alter table app.guardians add column if not exists legacy_key text unique;
alter table app.payments add column if not exists category text;
alter table app.payments add column if not exists legacy_status text;
alter table app.payments add column if not exists legacy_billing_period date;
alter table app.expenses add column if not exists legacy_status text;

with duplicate_codes as (
  select organization_id, code from public.players
  where nullif(trim(code),'') is not null
  group by organization_id,code having count(*)>1
)
insert into app.players (
  organization_id, legacy_id, code, first_name, last_name, birth_date, status,
  category, position, dominant_foot, jersey_number, school, blood_type, allergies,
  address, emergency_contact_name, emergency_contact_phone, notes,
  withdrawn_at, withdrawal_reason, created_at, updated_at, needs_review, review_reason
)
select
  p.organization_id,
  p.id,
  nullif(trim(p.code),''),
  coalesce(nullif(trim(p.name),''),'Sin nombre'),
  nullif(trim(p.apellidos),''),
  p.birth_date,
  case when p.status='Activo' then 'active' when p.status='Baja' then 'withdrawn' else 'inactive' end,
  nullif(trim(p.category),''),
  nullif(trim(p.position),''),
  nullif(trim(p.foot),''),
  nullif(trim(p.number),''),
  nullif(trim(p.school),''),
  nullif(trim(p.blood),''),
  nullif(trim(p.allergies),''),
  nullif(trim(p.address),''),
  nullif(trim(p.emergency_contact),''),
  nullif(trim(p.emergency_phone),''),
  nullif(trim(p.notes),''),
  p.fecha_baja,
  nullif(trim(p.motivo_baja),''),
  coalesce(p.created_at,now()),
  coalesce(p.updated_at,now()),
  (d.code is not null),
  case when d.code is not null then 'Código Tanner duplicado en v1' else null end
from public.players p
left join duplicate_codes d on d.organization_id=p.organization_id and d.code=p.code
on conflict (legacy_id) do nothing;

with guardian_source as (
  select
    p.organization_id,
    lower(trim(coalesce(p.tutor,''))) as norm_name,
    regexp_replace(coalesce(p.phone,''),'[^0-9]','','g') as norm_phone,
    max(nullif(trim(p.tutor),'')) as tutor,
    max(nullif(trim(p.phone),'')) as phone
  from public.players p
  where nullif(trim(coalesce(p.tutor,'')),'') is not null
     or nullif(regexp_replace(coalesce(p.phone,''),'[^0-9]','','g'),'') is not null
  group by p.organization_id, lower(trim(coalesce(p.tutor,''))), regexp_replace(coalesce(p.phone,''),'[^0-9]','','g')
)
insert into app.guardians (organization_id,legacy_key,first_name,last_name,phone,status)
select
  organization_id,
  md5(organization_id::text||'|'||norm_name||'|'||norm_phone),
  coalesce(nullif(tutor,''),'Tutor'),
  null,
  nullif(phone,''),
  'active'
from guardian_source
on conflict (legacy_key) do nothing;

insert into app.player_guardians (player_id,guardian_id,relationship,is_primary,can_pickup,receives_billing)
select
  vp.id,
  g.id,
  'guardian',
  true,
  true,
  true
from public.players p
join app.players vp on vp.legacy_id=p.id
join app.guardians g
  on g.legacy_key=md5(p.organization_id::text||'|'||lower(trim(coalesce(p.tutor,'')))||'|'||regexp_replace(coalesce(p.phone,''),'[^0-9]','','g'))
where nullif(trim(coalesce(p.tutor,'')),'') is not null
   or nullif(regexp_replace(coalesce(p.phone,''),'[^0-9]','','g'),'') is not null
on conflict (player_id,guardian_id) do nothing;

insert into app.billing_profiles (
  organization_id,player_id,monthly_fee,billing_start,billing_day,is_exempt,
  exemption_reason,status,needs_review,review_reason,legacy_scholarship_type,created_at,updated_at
)
select
  p.organization_id,
  vp.id,
  coalesce(p.monthly_fee,0),
  p.billing_start,
  1,
  (coalesce(p.scholarship,false)=true and coalesce(p.monthly_fee,0)=0),
  case when coalesce(p.scholarship,false)=true and coalesce(p.monthly_fee,0)=0 then coalesce(nullif(trim(p.scholarship_type),''),'Beca completa legacy') else null end,
  case when vp.status='active' then 'active' else 'closed' end,
  (vp.status='active' and coalesce(p.monthly_fee,0)=0 and coalesce(p.scholarship,false)=false),
  case when vp.status='active' and coalesce(p.monthly_fee,0)=0 and coalesce(p.scholarship,false)=false then 'Jugador activo sin cuota ni beca definida en v1' else null end,
  nullif(trim(p.scholarship_type),''),
  coalesce(p.created_at,now()),
  coalesce(p.updated_at,now())
from public.players p
join app.players vp on vp.legacy_id=p.id
on conflict (organization_id,player_id) do nothing;

insert into app.payments (
  organization_id,legacy_id,player_id,amount,payment_date,method,reference,concept,
  category,legacy_status,legacy_billing_period,status,source,notes,created_at,updated_at
)
select
  x.organization_id,
  x.id,
  vp.id,
  coalesce(x.amount,0),
  x.date,
  nullif(trim(x.method),''),
  nullif(trim(x.reference),''),
  nullif(trim(x.concept),''),
  nullif(trim(x.category),''),
  nullif(trim(x.status),''),
  case when x.period ~ '^\d{4}-\d{2}$' then (x.period||'-01')::date else null end,
  case when x.deleted then 'void' else 'posted' end,
  'legacy_import',
  nullif(trim(x.notes),''),
  coalesce(x.created_at,now()),
  coalesce(x.updated_at,now())
from public.payments x
left join app.players vp on vp.legacy_id=x.player_id
where x.type='income'
on conflict (legacy_id) do nothing;

insert into app.expenses (
  organization_id,legacy_id,amount,expense_date,category,concept,method,reference,
  supplier_name,legacy_status,status,source,notes,created_at,updated_at
)
select
  x.organization_id,
  x.id,
  coalesce(x.amount,0),
  x.date,
  nullif(trim(x.category),''),
  nullif(trim(x.concept),''),
  nullif(trim(x.method),''),
  nullif(trim(x.reference),''),
  nullif(trim(x.supplier_name),''),
  nullif(trim(x.status),''),
  case when x.deleted then 'void' else 'posted' end,
  'legacy_import',
  nullif(trim(x.notes),''),
  coalesce(x.created_at,now()),
  coalesce(x.updated_at,now())
from public.payments x
where x.type='expense'
on conflict (legacy_id) do nothing;;
