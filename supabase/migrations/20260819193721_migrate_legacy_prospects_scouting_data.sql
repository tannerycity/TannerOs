create or replace function private.normalize_legacy_phone_safe(p_phone text)
returns text
language plpgsql
immutable
set search_path to 'pg_catalog','private'
as $$
begin
  if nullif(trim(coalesce(p_phone,'')),'') is null then return null; end if;
  begin
    return private.normalize_public_phone(p_phone);
  exception when others then
    return null;
  end;
end
$$;

alter table app.prospects add column if not exists legacy_id text;
alter table app.prospects add column if not exists legacy_phone_raw text;
alter table app.prospects add column if not exists trial_date date;
alter table app.prospects add column if not exists payment_status text;
alter table app.prospects add column if not exists metadata jsonb not null default '{}'::jsonb;
create unique index if not exists app_prospects_org_legacy_uidx on app.prospects(organization_id,legacy_id) where legacy_id is not null;

insert into app.prospects(
  organization_id,legacy_id,first_name,last_name,birth_date,phone,legacy_phone_raw,email,guardian_name,
  source,source_campaign,interest_type,category_interest,status,next_action_at,notes,converted_player_id,
  registration_type,dominant_foot,school_name,source_channel,referral_name,trial_date,payment_status,
  privacy_notice_version,data_consent,data_consent_at,image_consent,image_consent_at,photo_required,
  created_at,updated_at,archived_at,metadata
)
select
  lp.organization_id,
  lp.id,
  coalesce(nullif(split_part(trim(coalesce(lp.name,'')),' ',1),''),'Sin nombre'),
  nullif(trim(substr(trim(coalesce(lp.name,'')),length(split_part(trim(coalesce(lp.name,'')),' ',1))+1)),''),
  lp.birth_date,
  private.normalize_legacy_phone_safe(coalesce(nullif(trim(lp.phone),''),nullif(trim(lp.whatsapp),''))),
  nullif(trim(coalesce(nullif(lp.phone,''),lp.whatsapp)),''),
  nullif(lower(trim(lp.email)),''),
  nullif(trim(lp.tutor),''),
  'legacy_import',
  nullif(trim(lp.source_campaign),''),
  nullif(trim(lp.interest_type),''),
  nullif(trim(lp.category),''),
  case
    when coalesce(lp.deleted,false) then 'archived'
    when lp.status='Convertido a jugador' then 'converted'
    when lp.status='Mandado a Scouting' then 'archived'
    when lp.status='No continúa' then 'not_continuing'
    else 'new'
  end,
  case when lp.next_action_date is null then null else lp.next_action_date::timestamp at time zone 'America/Mexico_City' end,
  nullif(trim(lp.notes),''),
  ap.id,
  null,
  case when lp.foot='Derecha' then 'right' when lp.foot='Izquierda' then 'left' when lp.foot='Ambidiestro' then 'both' else null end,
  nullif(trim(lp.school),''),
  nullif(trim(lp.contact_channel),''),
  nullif(trim(lp.recommended_by),''),
  lp.trial_date,
  nullif(trim(lp.payment_status),''),
  nullif(trim(lp.consent_version),''),
  lower(coalesce(lp.consent_interno,'')) in ('true','1','si','sí','yes'),
  case when lower(coalesce(lp.consent_interno,'')) in ('true','1','si','sí','yes') then lp.consent_fecha else null end,
  lower(coalesce(lp.consent_imagen,'')) in ('true','1','si','sí','yes'),
  case when lower(coalesce(lp.consent_imagen,'')) in ('true','1','si','sí','yes') then lp.consent_fecha else null end,
  false,
  coalesce(lp.created_at,lp.updated_at,now()),
  coalesce(lp.updated_at,lp.legacy_updated_at,lp.created_at,now()),
  case when coalesce(lp.deleted,false) or lp.status='Mandado a Scouting' then coalesce(lp.updated_at,lp.legacy_updated_at,now()) else null end,
  jsonb_strip_nulls(jsonb_build_object(
    'legacy_name',nullif(trim(lp.name),''),
    'legacy_age',lp.age,
    'legacy_source',nullif(trim(lp.source),''),
    'legacy_status',nullif(trim(lp.status),''),
    'legacy_assigned_to',nullif(trim(lp.assigned_to),''),
    'legacy_consent_tutor',nullif(trim(lp.consent_tutor),''),
    'legacy_consent_origin',nullif(trim(lp.consent_origen),''),
    'legacy_photo_present',nullif(trim(coalesce(lp.photo_data,'')),'') is not null,
    'legacy_deleted',coalesce(lp.deleted,false),
    'legacy_converted_scout_id',nullif(trim(lp.converted_scout_id),'')
  ))
from public.prospects lp
left join app.players ap on ap.legacy_id=lp.converted_player_id and ap.organization_id=lp.organization_id
on conflict (organization_id,legacy_id) where legacy_id is not null do nothing;

alter table app.scouting_reports add column if not exists legacy_id text;
alter table app.scouting_reports add column if not exists contact_phone text;
alter table app.scouting_reports add column if not exists guardian_name text;
alter table app.scouting_reports add column if not exists birth_date date;
alter table app.scouting_reports add column if not exists interest_level text;
alter table app.scouting_reports add column if not exists next_action_at timestamptz;
alter table app.scouting_reports add column if not exists source text;
alter table app.scouting_reports add column if not exists metadata jsonb not null default '{}'::jsonb;
create unique index if not exists app_scouting_org_legacy_uidx on app.scouting_reports(organization_id,legacy_id) where legacy_id is not null;

insert into app.scouting_reports(
  organization_id,legacy_id,player_id,prospect_id,observed_name,observed_at,observed_location,position,category,
  technical_score,physical_score,tactical_score,mental_score,star_quality,verdict,notes,status,
  contact_phone,guardian_name,birth_date,interest_level,next_action_at,source,created_at,updated_at,metadata
)
select
  ls.organization_id,ls.id,ap.id,pr.id,nullif(trim(ls.child_name),''),coalesce(ls.created_at,ls.updated_at,now()),
  nullif(trim(ls.location_seen),''),nullif(trim(ls.position),''),nullif(trim(ls.category),''),
  case when trim(coalesce(ls.pilar_tec,'')) ~ '^-?[0-9]+([.][0-9]+)?$' then trim(ls.pilar_tec)::numeric else null end,
  case when trim(coalesce(ls.pilar_fis,'')) ~ '^-?[0-9]+([.][0-9]+)?$' then trim(ls.pilar_fis)::numeric else null end,
  case when trim(coalesce(ls.pilar_tac,'')) ~ '^-?[0-9]+([.][0-9]+)?$' then trim(ls.pilar_tac)::numeric else null end,
  case when trim(coalesce(ls.pilar_men,'')) ~ '^-?[0-9]+([.][0-9]+)?$' then trim(ls.pilar_men)::numeric else null end,
  nullif(trim(ls.cualidad_estrella),''),nullif(trim(ls.veredicto),''),nullif(trim(ls.notes),''),
  case when coalesce(ls.deleted,false) then 'closed' else 'open' end,
  private.normalize_legacy_phone_safe(ls.phone),nullif(trim(ls.tutor_name),''),ls.birth_date,nullif(trim(ls.interest_level),''),
  case when ls.next_action_date is null then null else ls.next_action_date::timestamp at time zone 'America/Mexico_City' end,
  nullif(trim(ls.source),''),coalesce(ls.created_at,ls.updated_at,now()),coalesce(ls.updated_at,ls.legacy_updated_at,ls.created_at,now()),
  jsonb_strip_nulls(jsonb_build_object(
    'legacy_phone_raw',nullif(trim(ls.phone),''),
    'legacy_age',ls.age,
    'legacy_detected_by',nullif(trim(ls.detected_by),''),
    'legacy_interest_level',nullif(trim(ls.interest_level),''),
    'legacy_status',nullif(trim(ls.status),''),
    'legacy_evaluation',nullif(trim(ls.evaluation),''),
    'legacy_reason',nullif(trim(ls.por_que),''),
    'legacy_photo_present',nullif(trim(coalesce(ls.photo_data,'')),'') is not null,
    'legacy_deleted',coalesce(ls.deleted,false)
  ))
from public.scouting ls
left join app.players ap on ap.organization_id=ls.organization_id and ap.legacy_id=ls.player_id
left join app.prospects pr on pr.organization_id=ls.organization_id and pr.legacy_id=ls.source_prospect_id
on conflict (organization_id,legacy_id) where legacy_id is not null do nothing;

update app.business_rule_catalog
set status='active', enforcement='command', updated_at=now(), metadata=metadata||jsonb_build_object('verified_on','2026-08-19','backend_function','private.command_add_goalkeeper_session')
where rule_key in ('GK-001','GK-002');;
