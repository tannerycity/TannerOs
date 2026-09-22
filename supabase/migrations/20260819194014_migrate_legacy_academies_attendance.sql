create table if not exists app.legacy_migration_conflicts(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  domain text not null,
  legacy_table text not null,
  legacy_id text,
  conflict_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'open' check(status in ('open','resolved','ignored')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution text
);
create unique index if not exists app_legacy_migration_conflict_uidx on app.legacy_migration_conflicts(organization_id,legacy_table,legacy_id,conflict_type) where legacy_id is not null;
alter table app.legacy_migration_conflicts enable row level security;
revoke all on app.legacy_migration_conflicts from anon,authenticated;
grant all on app.legacy_migration_conflicts to service_role;

alter table app.academies add column if not exists legacy_id text;
create unique index if not exists app_academies_org_legacy_uidx on app.academies(organization_id,legacy_id) where legacy_id is not null;

insert into app.academies(
  organization_id,legacy_id,slug,name,academy_type,status,monthly_fee,hourly_rate,schedule,location,evaluation_model,settings,capacity,created_at,updated_at,archived_at
)
select
  a.organization_id,a.id,
  'legacy-'||substr(md5(a.id),1,12),
  coalesce(nullif(trim(a.name),''),'Academia legacy'),
  case when lower(coalesce(a.tipo,'')) like '%portero%' then 'goalkeeper' else 'general' end,
  case when coalesce(a.deleted,false) then 'archived' when coalesce(a.activa,true) then 'active' else 'inactive' end,
  a.fee_mensual,a.rate_hora,
  jsonb_strip_nulls(jsonb_build_object('days',nullif(trim(a.dias),''),'time',nullif(trim(a.horario),''))),
  nullif(trim(a.lugar),''),
  case when a.ejes is null then '{}'::jsonb else jsonb_build_object('axes',a.ejes) end,
  jsonb_strip_nulls(jsonb_build_object(
    'legacy_professor_user_id',nullif(trim(a.profesor_user_id),''),
    'legacy_professor_name',nullif(trim(a.profesor_nombre),''),
    'legacy_professor_username',nullif(trim(a.profesor_username),''),
    'legacy_income_category',nullif(trim(a.cat_ingreso),''),
    'legacy_expense_category',nullif(trim(a.cat_egreso),''),
    'legacy_professor_model',nullif(trim(a.profe_modelo),''),
    'legacy_professor_amount',a.profe_monto,
    'legacy_professor_percentage',a.profe_porcentaje,
    'legacy_color',nullif(trim(a.color),''),
    'legacy_notes',nullif(trim(a.notes),''),
    'capacity_source','legacy schema had no cupo column; v2 safe default 0=unlimited'
  )),
  0,
  coalesce(a.created_at,a.updated_at,now()),coalesce(a.updated_at,a.legacy_updated_at,a.created_at,now()),
  case when coalesce(a.deleted,false) then coalesce(a.updated_at,a.legacy_updated_at,now()) else null end
from public.academias a
on conflict (organization_id,legacy_id) where legacy_id is not null do nothing;

alter table app.academy_enrollments add column if not exists legacy_id text;
alter table app.academy_enrollments add column if not exists metadata jsonb not null default '{}'::jsonb;
create unique index if not exists app_academy_enrollments_org_legacy_uidx on app.academy_enrollments(organization_id,legacy_id) where legacy_id is not null;

insert into app.academy_enrollments(
  organization_id,legacy_id,academy_id,player_id,starts_on,ends_on,agreed_fee,status,notes,created_at,updated_at,metadata
)
select
  ai.organization_id,ai.id,a.id,p.id,coalesce(ai.start_date,ai.created_at::date,current_date),
  case when coalesce(ai.deleted,false) or ai.status='Baja' then coalesce(ai.updated_at,ai.legacy_updated_at,now())::date else null end,
  ai.fee,
  case when coalesce(ai.deleted,false) or ai.status='Baja' then 'cancelled' else 'active' end,
  nullif(trim(ai.notes),''),coalesce(ai.created_at,ai.updated_at,now()),coalesce(ai.updated_at,ai.legacy_updated_at,ai.created_at,now()),
  jsonb_strip_nulls(jsonb_build_object('legacy_academy_name',nullif(trim(ai.academia_name),''),'legacy_player_name',nullif(trim(ai.player_name),''),'legacy_status',nullif(trim(ai.status),''),'legacy_deleted',coalesce(ai.deleted,false)))
from public.academia_inscripciones ai
join app.academies a on a.organization_id=ai.organization_id and a.legacy_id=ai.academia_id
join app.players p on p.organization_id=ai.organization_id and p.legacy_id=ai.player_id
on conflict (organization_id,legacy_id) where legacy_id is not null do nothing;

alter table app.sessions add column if not exists legacy_id text;
alter table app.sessions add column if not exists metadata jsonb not null default '{}'::jsonb;
create unique index if not exists app_sessions_org_legacy_uidx on app.sessions(organization_id,legacy_id) where legacy_id is not null;

insert into app.sessions(organization_id,legacy_id,session_type,starts_at,location,title,notes,status,created_at,updated_at,metadata)
select
  a.organization_id,a.session_id,'training',
  (min(a.date) + coalesce(min(a.time),time '00:00')) at time zone 'America/Mexico_City',
  nullif(max(a.field),''),
  concat_ws(' · ',nullif(max(a.type),''),nullif(max(a.category),'')),
  null,
  'completed',min(coalesce(a.created_at,a.updated_at,now())),max(coalesce(a.updated_at,a.legacy_updated_at,a.created_at,now())),
  jsonb_strip_nulls(jsonb_build_object('legacy_category',nullif(max(a.category),''),'legacy_coach',nullif(max(a.coach),''),'legacy_type',nullif(max(a.type),'')))
from public.attendance a
where nullif(trim(coalesce(a.session_id,'')),'') is not null and nullif(trim(coalesce(a.player_id,'')),'') is not null
group by a.organization_id,a.session_id
on conflict (organization_id,legacy_id) where legacy_id is not null do nothing;

alter table app.attendance_records add column if not exists legacy_id text;
alter table app.attendance_records add column if not exists metadata jsonb not null default '{}'::jsonb;
create unique index if not exists app_attendance_org_legacy_uidx on app.attendance_records(organization_id,legacy_id) where legacy_id is not null;

insert into app.attendance_records(
 organization_id,legacy_id,session_id,player_id,status,arrived_at,punctuality,uniform_status,attitude_note,injury_note,pickup_note,notes,recorded_at,updated_at,metadata
)
select
 a.organization_id,a.id,s.id,p.id,
 case when a.status='Presente' then 'present' when a.status='Ausente' then 'absent' when a.status='Retardo' then 'late' else 'excused' end,
 case when a.arrival is null or a.date is null then null else (a.date+a.arrival) at time zone 'America/Mexico_City' end,
 nullif(trim(a.punctuality),''),nullif(trim(a.uniform),''),nullif(trim(a.attitude),''),nullif(trim(a.injury),''),nullif(trim(a.pickup),''),nullif(trim(a.notes),''),
 coalesce(a.created_at,a.updated_at,now()),coalesce(a.updated_at,a.legacy_updated_at,a.created_at,now()),
 jsonb_strip_nulls(jsonb_build_object('legacy_player_name',nullif(trim(a.player_name),''),'legacy_category',nullif(trim(a.category),''),'legacy_coach',nullif(trim(a.coach),''),'legacy_type',nullif(trim(a.type),''),'legacy_notice',nullif(trim(a.notice),''),'legacy_created_by',nullif(trim(a.created_by),''),'legacy_updated_by',nullif(trim(a.updated_by),'')))
from public.attendance a
join app.sessions s on s.organization_id=a.organization_id and s.legacy_id=a.session_id
join app.players p on p.organization_id=a.organization_id and p.legacy_id=a.player_id
where nullif(trim(coalesce(a.session_id,'')),'') is not null and nullif(trim(coalesce(a.player_id,'')),'') is not null
on conflict (organization_id,legacy_id) where legacy_id is not null do nothing;

insert into app.legacy_migration_conflicts(organization_id,domain,legacy_table,legacy_id,conflict_type,payload)
select a.organization_id,'attendance','public.attendance',a.id,'missing_player_or_session',
  jsonb_strip_nulls(jsonb_build_object('date',a.date,'status',a.status,'created_by',a.created_by,'reason','Legacy row has no player_id and/or session_id; intentionally excluded from canonical attendance'))
from public.attendance a
where nullif(trim(coalesce(a.session_id,'')),'') is null or nullif(trim(coalesce(a.player_id,'')),'') is null
on conflict (organization_id,legacy_table,legacy_id,conflict_type) where legacy_id is not null do nothing;;
