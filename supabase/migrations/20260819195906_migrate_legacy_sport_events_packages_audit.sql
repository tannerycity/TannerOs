create table if not exists app.matches(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  legacy_id text,
  match_date date,
  category text,
  opponent text,
  tournament text,
  phase text,
  location text,
  result text,
  goals_for integer,
  goals_against integer,
  notes text,
  status text not null default 'scheduled' check(status in ('scheduled','completed','cancelled','archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create unique index if not exists app_matches_org_legacy_uidx on app.matches(organization_id,legacy_id) where legacy_id is not null;
create index if not exists idx_app_matches_org_date on app.matches(organization_id,match_date desc);
alter table app.matches enable row level security;
revoke all on app.matches from anon,authenticated;
grant all on app.matches to service_role;

insert into app.matches(organization_id,legacy_id,match_date,category,opponent,tournament,phase,location,result,goals_for,goals_against,notes,status,metadata,created_at,updated_at,archived_at)
select m.organization_id,m.id,m.date,nullif(trim(m.category),''),nullif(trim(m.opponent),''),nullif(trim(m.tournament),''),nullif(trim(m.phase),''),nullif(trim(m.location),''),nullif(trim(m.result),''),
 case when trim(coalesce(m.goals_for,'')) ~ '^[0-9]+$' then trim(m.goals_for)::integer else null end,
 case when trim(coalesce(m.goals_against,'')) ~ '^[0-9]+$' then trim(m.goals_against)::integer else null end,
 nullif(trim(m.notes),''),case when coalesce(m.deleted,false) then 'archived' when m.result is not null or m.date<current_date then 'completed' else 'scheduled' end,
 jsonb_strip_nulls(jsonb_build_object('legacyGoalsForRaw',nullif(trim(m.goals_for),''),'legacyGoalsAgainstRaw',nullif(trim(m.goals_against),''),'legacyCreatedBy',nullif(trim(m.created_by),''),'legacyUpdatedBy',nullif(trim(m.updated_by),''),'legacyDeleted',coalesce(m.deleted,false))),
 coalesce(m.created_at,m.updated_at,now()),coalesce(m.updated_at,m.legacy_updated_at,m.created_at,now()),case when coalesce(m.deleted,false) then coalesce(m.updated_at,m.legacy_updated_at,now()) end
from public.matches m
on conflict (organization_id,legacy_id) where legacy_id is not null do nothing;

create table if not exists app.match_player_stats(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  legacy_id text,
  match_id uuid not null references app.matches(id) on delete cascade,
  player_id uuid references app.players(id) on delete set null,
  player_name_snapshot text,
  attended boolean,
  starter boolean,
  minutes_played integer,
  goals integer,
  assists integer,
  yellow_cards integer,
  red_cards integer,
  saves integer,
  clean_sheet boolean,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists app_match_stats_org_legacy_uidx on app.match_player_stats(organization_id,legacy_id) where legacy_id is not null;
create index if not exists idx_app_match_stats_match on app.match_player_stats(organization_id,match_id);
create index if not exists idx_app_match_stats_player on app.match_player_stats(organization_id,player_id);
alter table app.match_player_stats enable row level security;
revoke all on app.match_player_stats from anon,authenticated;
grant all on app.match_player_stats to service_role;

insert into app.match_player_stats(organization_id,legacy_id,match_id,player_id,player_name_snapshot,attended,starter,minutes_played,goals,assists,yellow_cards,red_cards,saves,clean_sheet,notes,metadata,created_at,updated_at)
select s.organization_id,s.id,m.id,p.id,nullif(trim(s.player_name),''),s.attended,s.starter,s.minutes_played,s.goals,s.assists,s.yellow_cards,s.red_cards,s.saves,s.clean_sheet,nullif(trim(s.notes),''),
 jsonb_strip_nulls(jsonb_build_object('legacyPlayerId',nullif(trim(s.player_id),''),'legacyCreatedBy',nullif(trim(s.created_by),''),'legacyUpdatedBy',nullif(trim(s.updated_by),''),'legacyDeleted',coalesce(s.deleted,false))),
 coalesce(s.created_at,s.updated_at,now()),coalesce(s.updated_at,s.legacy_updated_at,s.created_at,now())
from public.match_stats s
join app.matches m on m.organization_id=s.organization_id and m.legacy_id=s.match_id
left join app.players p on p.organization_id=s.organization_id and p.legacy_id=s.player_id
on conflict (organization_id,legacy_id) where legacy_id is not null do nothing;

create table if not exists app.player_evaluations(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  legacy_id text,
  player_id uuid references app.players(id) on delete set null,
  period text,
  evaluated_on date,
  evaluator_label text,
  scores jsonb not null default '{}'::jsonb,
  sports_objective text,
  formative_objective text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create unique index if not exists app_evaluations_org_legacy_uidx on app.player_evaluations(organization_id,legacy_id) where legacy_id is not null;
create index if not exists idx_app_evaluations_player on app.player_evaluations(organization_id,player_id,evaluated_on desc);
alter table app.player_evaluations enable row level security;
revoke all on app.player_evaluations from anon,authenticated;
grant all on app.player_evaluations to service_role;

insert into app.player_evaluations(organization_id,legacy_id,player_id,period,evaluated_on,evaluator_label,scores,sports_objective,formative_objective,notes,metadata,created_at,updated_at,archived_at)
select e.organization_id,e.id,p.id,nullif(trim(e.period),''),e.date,nullif(trim(e.evaluator),''),jsonb_strip_nulls(jsonb_build_object(
 'tecnica',e.tecnica,'inteligencia',e.inteligencia,'intensidad',e.intensidad,'mentalidad',e.mentalidad,'valores',e.valores,
 'goalkeeper',jsonb_strip_nulls(jsonb_build_object('manos',e.gk_manos,'colocacion',e.gk_colocacion,'aereo',e.gk_aereo,'pies',e.gk_pies,'mando',e.gk_mando))
)),nullif(trim(e.obj_deportivo),''),nullif(trim(e.obj_formativo),''),nullif(trim(e.notes),''),
 jsonb_strip_nulls(jsonb_build_object('legacyPlayerId',nullif(trim(e.player_id),''),'playerLinkMissing',case when nullif(trim(coalesce(e.player_id,'')),'') is null then true end,'legacyCreatedBy',nullif(trim(e.created_by),''),'legacyUpdatedBy',nullif(trim(e.updated_by),''),'legacyDeleted',coalesce(e.deleted,false))),
 coalesce(e.created_at,e.updated_at,now()),coalesce(e.updated_at,e.legacy_updated_at,e.created_at,now()),case when coalesce(e.deleted,false) then coalesce(e.updated_at,e.legacy_updated_at,now()) end
from public.evaluations e
left join app.players p on p.organization_id=e.organization_id and p.legacy_id=e.player_id
on conflict (organization_id,legacy_id) where legacy_id is not null do nothing;

insert into app.legacy_migration_conflicts(organization_id,domain,legacy_table,legacy_id,conflict_type,payload)
select e.organization_id,'players','public.evaluations',e.id,'missing_player_reference',jsonb_build_object('period',e.period,'evaluatedOn',e.date,'reason','Legacy evaluation has no player_id; preserved without inventing a player link')
from public.evaluations e
where nullif(trim(coalesce(e.player_id,'')),'') is null
on conflict (organization_id,legacy_table,legacy_id,conflict_type) where legacy_id is not null do nothing;

create table if not exists app.player_notes(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  legacy_id text,
  player_id uuid not null references app.players(id) on delete cascade,
  note_date date,
  context text,
  note_text text not null,
  author_label text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create unique index if not exists app_player_notes_org_legacy_uidx on app.player_notes(organization_id,legacy_id) where legacy_id is not null;
alter table app.player_notes enable row level security;
revoke all on app.player_notes from anon,authenticated;
grant all on app.player_notes to service_role;
insert into app.player_notes(organization_id,legacy_id,player_id,note_date,context,note_text,author_label,metadata,created_at,updated_at,archived_at)
select n.organization_id,n.id,p.id,n.date,nullif(trim(n.context),''),coalesce(nullif(trim(n.text),''),'Nota legacy sin texto'),nullif(trim(n.author),''),
 jsonb_strip_nulls(jsonb_build_object('legacyPlayerId',nullif(trim(n.player_id),''),'legacyCreatedBy',nullif(trim(n.created_by),''),'legacyDeleted',coalesce(n.deleted,false))),
 coalesce(n.created_at,n.updated_at,now()),coalesce(n.updated_at,n.legacy_updated_at,n.created_at,now()),case when coalesce(n.deleted,false) then coalesce(n.updated_at,n.legacy_updated_at,now()) end
from public.player_notes n join app.players p on p.organization_id=n.organization_id and p.legacy_id=n.player_id
on conflict (organization_id,legacy_id) where legacy_id is not null do nothing;

create table if not exists app.club_events(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  legacy_id text,
  title text not null,
  starts_at timestamptz,
  event_type text,
  location text,
  sponsor_id uuid references app.sponsors(id) on delete set null,
  jersey text,
  rival text,
  roster jsonb not null default '[]'::jsonb,
  status text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create unique index if not exists app_club_events_org_legacy_uidx on app.club_events(organization_id,legacy_id) where legacy_id is not null;
create index if not exists idx_app_club_events_date on app.club_events(organization_id,starts_at desc);
alter table app.club_events enable row level security;
revoke all on app.club_events from anon,authenticated;
grant all on app.club_events to service_role;
insert into app.club_events(organization_id,legacy_id,title,starts_at,event_type,location,sponsor_id,jersey,rival,roster,status,notes,metadata,created_at,updated_at,archived_at)
select e.organization_id,e.id,coalesce(nullif(trim(e.title),''),'Evento legacy'),case when e.date is null then null else (e.date+coalesce(e.time,time '00:00')) at time zone 'America/Mexico_City' end,nullif(trim(e.type),''),nullif(trim(e.place),''),s.id,nullif(trim(e.jersey),''),nullif(trim(e.rival),''),coalesce(e.roster,'[]'::jsonb),nullif(trim(e.status),''),nullif(trim(e.notes),''),
 jsonb_strip_nulls(jsonb_build_object('legacySponsorId',nullif(trim(e.sponsor_id),''),'legacyCreatedBy',nullif(trim(e.created_by),''),'legacyDeleted',coalesce(e.deleted,false))),
 coalesce(e.created_at,e.updated_at,now()),coalesce(e.updated_at,e.legacy_updated_at,e.created_at,now()),case when coalesce(e.deleted,false) then coalesce(e.updated_at,e.legacy_updated_at,now()) end
from public.events e left join app.sponsors s on s.organization_id=e.organization_id and s.legacy_id=e.sponsor_id
on conflict (organization_id,legacy_id) where legacy_id is not null do nothing;

create table if not exists app.product_bundles(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  legacy_id text,
  name text not null,
  description text,
  price_adult numeric(12,2),
  price_kid numeric(12,2),
  components jsonb not null default '[]'::jsonb,
  active boolean not null default false,
  valid_until date,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create unique index if not exists app_product_bundles_org_legacy_uidx on app.product_bundles(organization_id,legacy_id) where legacy_id is not null;
alter table app.product_bundles enable row level security;
revoke all on app.product_bundles from anon,authenticated;
grant all on app.product_bundles to service_role;
insert into app.product_bundles(organization_id,legacy_id,name,description,price_adult,price_kid,components,active,valid_until,notes,metadata,created_at,updated_at,archived_at)
select p.organization_id,p.id,coalesce(nullif(trim(p.name),''),'Paquete legacy'),nullif(trim(p.description),''),p.price_adult,p.price_kid,coalesce(p.components,'[]'::jsonb),coalesce(p.active,false) and not coalesce(p.deleted,false),p.vigencia,nullif(trim(p.notes),''),
 jsonb_strip_nulls(jsonb_build_object('legacyPhotoPresent',nullif(trim(coalesce(p.photo_data,'')),'') is not null,'legacyCreatedBy',nullif(trim(p.created_by),''),'legacyDeleted',coalesce(p.deleted,false),'componentReferencesResolvedToV2',true)),
 coalesce(p.created_at,p.updated_at,now()),coalesce(p.updated_at,p.legacy_updated_at,p.created_at,now()),case when coalesce(p.deleted,false) then coalesce(p.updated_at,p.legacy_updated_at,now()) end
from public.packages p
on conflict (organization_id,legacy_id) where legacy_id is not null do nothing;

create table if not exists app.sponsor_assets(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  legacy_id text,
  name text not null,
  category text,
  price numeric(12,2),
  description text,
  availability text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create unique index if not exists app_sponsor_assets_org_legacy_uidx on app.sponsor_assets(organization_id,legacy_id) where legacy_id is not null;
alter table app.sponsor_assets enable row level security;
revoke all on app.sponsor_assets from anon,authenticated;
grant all on app.sponsor_assets to service_role;
insert into app.sponsor_assets(organization_id,legacy_id,name,category,price,description,availability,metadata,created_at,updated_at,archived_at)
select a.organization_id,a.id,coalesce(nullif(trim(a.name),''),'Activo sponsor legacy'),nullif(trim(a.category),''),a.price,nullif(trim(a.description),''),nullif(trim(a.availability),''),
 jsonb_strip_nulls(jsonb_build_object('legacyCreatedBy',nullif(trim(a.created_by),''),'legacyDeleted',coalesce(a.deleted,false))),coalesce(a.created_at,a.updated_at,now()),coalesce(a.updated_at,a.legacy_updated_at,a.created_at,now()),case when coalesce(a.deleted,false) then coalesce(a.updated_at,a.legacy_updated_at,now()) end
from public.assets a
on conflict (organization_id,legacy_id) where legacy_id is not null do nothing;

alter table app.audit_events add column if not exists legacy_id text;
create unique index if not exists app_audit_events_org_legacy_uidx on app.audit_events(organization_id,legacy_id) where legacy_id is not null;
insert into app.audit_events(organization_id,legacy_id,actor_label,event_type,aggregate_type,aggregate_id,payload,occurred_at)
select a.organization_id,a.id,nullif(trim(a.actor_user),''),coalesce(nullif(trim(a.action),''),'LegacyAudit'),coalesce(nullif(trim(a.entity),''),'legacy'),a.id,
 coalesce(a.details,'{}'::jsonb)||jsonb_strip_nulls(jsonb_build_object('_legacy',jsonb_build_object('id',a.id,'createdBy',a.created_by,'updatedBy',a.updated_by,'deleted',a.deleted))),
 coalesce(a.event_at,a.created_at,a.updated_at,now())
from public.audit_log a
on conflict (organization_id,legacy_id) where legacy_id is not null do nothing;;
