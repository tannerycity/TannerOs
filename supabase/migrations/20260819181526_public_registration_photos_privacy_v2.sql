alter table app.prospects
  add column if not exists registration_type text,
  add column if not exists purpose text,
  add column if not exists dominant_foot text,
  add column if not exists school_name text,
  add column if not exists source_channel text,
  add column if not exists referral_name text,
  add column if not exists public_message text,
  add column if not exists photo_path text,
  add column if not exists photo_uploaded_at timestamptz,
  add column if not exists photo_required boolean not null default false,
  add column if not exists privacy_notice_version text,
  add column if not exists data_consent boolean not null default false,
  add column if not exists data_consent_at timestamptz,
  add column if not exists image_consent boolean not null default false,
  add column if not exists image_consent_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='prospects_registration_type_check') then
    alter table app.prospects add constraint prospects_registration_type_check
      check (registration_type is null or registration_type in ('player','goalkeeper','program','event','general'));
  end if;
  if not exists (select 1 from pg_constraint where conname='prospects_dominant_foot_check') then
    alter table app.prospects add constraint prospects_dominant_foot_check
      check (dominant_foot is null or dominant_foot in ('right','left','both'));
  end if;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('tanneros-prospect-photos','tanneros-prospect-photos',false,5242880,array['image/jpeg','image/png','image/webp']::text[])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function private.public_register_prospect_enhanced(
  p_public_key text,
  p_first_name text,
  p_last_name text,
  p_birth_date date,
  p_phone text,
  p_email text,
  p_guardian_name text,
  p_category_interest text,
  p_source_campaign text,
  p_source_channel text,
  p_registration_type text,
  p_purpose text,
  p_dominant_foot text,
  p_school_name text,
  p_referral_name text,
  p_public_message text,
  p_privacy_notice_version text,
  p_data_consent boolean,
  p_image_consent boolean
) returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog','app','private'
as $$
declare v_org uuid; v_id uuid; v_now timestamptz:=now();
begin
  perform private.enforce_public_rate_limit('register',20,interval '1 hour');
  v_org:=private.public_organization(p_public_key);
  if v_org is null or not private.module_enabled(v_org,'prospects') then raise exception 'Registration unavailable'; end if;
  if coalesce(length(trim(p_first_name)),0)<2 then raise exception 'First name required'; end if;
  if coalesce(length(trim(p_last_name)),0)<2 then raise exception 'Last name required'; end if;
  if p_birth_date is null then raise exception 'Birth date required'; end if;
  if p_birth_date > current_date then raise exception 'Invalid birth date'; end if;
  if coalesce(length(trim(p_guardian_name)),0)<2 then raise exception 'Guardian required'; end if;
  if coalesce(length(trim(p_phone)),0)<7 then raise exception 'Phone required'; end if;
  if coalesce(length(trim(p_school_name)),0)<2 then raise exception 'School required'; end if;
  if coalesce(length(trim(p_purpose)),0)<2 then raise exception 'Purpose required'; end if;
  if p_dominant_foot not in ('right','left','both') then raise exception 'Dominant foot required'; end if;
  if p_registration_type not in ('player','goalkeeper','program','event','general') then raise exception 'Invalid registration type'; end if;
  if coalesce(length(trim(p_source_channel)),0)<2 then raise exception 'Source required'; end if;
  if lower(trim(p_source_channel))='recomendación' and coalesce(length(trim(p_referral_name)),0)<2 then raise exception 'Referral name required'; end if;
  if p_data_consent is distinct from true then raise exception 'Privacy consent required'; end if;
  if coalesce(length(trim(p_privacy_notice_version)),0)<4 then raise exception 'Privacy notice version required'; end if;

  insert into app.prospects(
    organization_id,first_name,last_name,birth_date,phone,email,guardian_name,
    source,source_campaign,source_channel,interest_type,registration_type,category_interest,
    purpose,dominant_foot,school_name,referral_name,public_message,status,photo_required,
    privacy_notice_version,data_consent,data_consent_at,image_consent,image_consent_at,
    created_at,updated_at
  ) values(
    v_org,trim(p_first_name),trim(p_last_name),p_birth_date,trim(p_phone),nullif(lower(trim(p_email)),''),trim(p_guardian_name),
    'public_form',nullif(trim(p_source_campaign),''),trim(p_source_channel),p_registration_type,p_registration_type,nullif(trim(p_category_interest),''),
    trim(p_purpose),p_dominant_foot,trim(p_school_name),nullif(trim(p_referral_name),''),nullif(trim(p_public_message),''),'new',true,
    trim(p_privacy_notice_version),true,v_now,coalesce(p_image_consent,false),case when coalesce(p_image_consent,false) then v_now else null end,
    v_now,v_now
  ) returning id into v_id;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload)
  values(v_org,'ProspectRegistered','prospect',v_id,jsonb_build_object(
    'source','public_form','campaign',p_source_campaign,'sourceChannel',p_source_channel,
    'registrationType',p_registration_type,'privacyNoticeVersion',p_privacy_notice_version,
    'dataConsent',true,'imageConsent',coalesce(p_image_consent,false),'photoRequired',true));
  return v_id;
end $$;

create or replace function public.v2_public_register_enhanced(
  club_key text,
  first_name text,
  last_name text,
  birth_date date,
  phone text,
  email text,
  guardian_name text,
  category_interest text,
  source_campaign text,
  source_channel text,
  registration_type text,
  purpose text,
  dominant_foot text,
  school_name text,
  referral_name text,
  public_message text,
  privacy_notice_version text,
  data_consent boolean,
  image_consent boolean
) returns uuid
language sql
security definer
set search_path to 'pg_catalog','private'
as $$ select private.public_register_prospect_enhanced($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) $$;

revoke all on function public.v2_public_register_enhanced(text,text,text,date,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean) from public;
grant execute on function public.v2_public_register_enhanced(text,text,text,date,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean) to anon,authenticated;

create or replace function private.public_prospect_photo_upload_allowed(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'pg_catalog','app'
as $$
declare v_org uuid; v_prospect uuid;
begin
  if p_name !~* '^organizations/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/prospects/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/profile\.(jpg|jpeg|png|webp)$' then return false; end if;
  v_org:=split_part(p_name,'/',2)::uuid;
  v_prospect:=split_part(p_name,'/',4)::uuid;
  return exists(
    select 1 from app.prospects p
    where p.id=v_prospect and p.organization_id=v_org and p.source='public_form'
      and p.photo_required=true and p.photo_path is null and p.created_at >= now()-interval '1 hour'
  );
exception when others then return false;
end $$;

grant execute on function private.public_prospect_photo_upload_allowed(text) to anon;

drop policy if exists tanneros_public_prospect_photo_insert on storage.objects;
create policy tanneros_public_prospect_photo_insert on storage.objects
for insert to anon
with check (
  bucket_id='tanneros-prospect-photos'
  and private.public_prospect_photo_upload_allowed(name)
  and lower(coalesce(metadata->>'mimetype','')) in ('image/jpeg','image/png','image/webp')
);

drop policy if exists tanneros_prospect_photos_read on storage.objects;
create policy tanneros_prospect_photos_read on storage.objects
for select to authenticated
using (
  bucket_id='tanneros-prospect-photos'
  and private.storage_org_id(name) is not null
  and private.storage_module_code(name)='prospects'
  and private.has_module_access(private.storage_org_id(name),'prospects',false)
);

drop policy if exists tanneros_prospect_photos_write on storage.objects;
create policy tanneros_prospect_photos_write on storage.objects
for all to authenticated
using (
  bucket_id='tanneros-prospect-photos'
  and private.storage_org_id(name) is not null
  and private.storage_module_code(name)='prospects'
  and private.has_module_access(private.storage_org_id(name),'prospects',true)
)
with check (
  bucket_id='tanneros-prospect-photos'
  and private.storage_org_id(name) is not null
  and private.storage_module_code(name)='prospects'
  and private.has_module_access(private.storage_org_id(name),'prospects',true)
);

create or replace function private.public_attach_prospect_photo(p_public_key text,p_prospect_id uuid,p_photo_path text)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog','app','private'
as $$
declare v_org uuid; v_expected text;
begin
  v_org:=private.public_organization(p_public_key);
  if v_org is null then raise exception 'Registration unavailable'; end if;
  v_expected:=format('organizations/%s/prospects/%s/profile.',v_org,p_prospect_id);
  if position(v_expected in p_photo_path)<>1 or p_photo_path !~* '\.(jpg|jpeg|png|webp)$' then raise exception 'Invalid photo path'; end if;
  update app.prospects set photo_path=p_photo_path,photo_uploaded_at=now(),updated_at=now()
  where id=p_prospect_id and organization_id=v_org and source='public_form' and photo_required=true and photo_path is null and created_at>=now()-interval '1 hour';
  if not found then raise exception 'Prospect not available for photo'; end if;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload)
  values(v_org,'ProspectPhotoAttached','prospect',p_prospect_id,jsonb_build_object('photoPath',p_photo_path));
  return true;
end $$;

create or replace function public.v2_public_attach_prospect_photo(club_key text,prospect_id uuid,photo_path text)
returns boolean language sql security definer set search_path to 'pg_catalog','private'
as $$ select private.public_attach_prospect_photo($1,$2,$3) $$;
revoke all on function public.v2_public_attach_prospect_photo(text,uuid,text) from public;
grant execute on function public.v2_public_attach_prospect_photo(text,uuid,text) to anon,authenticated;

-- Expand internal prospect query so TannerOS can show registration details and private photo path.
drop function if exists public.v2_prospects(uuid,text);
drop function if exists private.query_prospects(uuid,text);

create function private.query_prospects(p_organization_id uuid,p_status text default null)
returns table(
  id uuid,first_name text,last_name text,birth_date date,phone text,email text,guardian_name text,
  source text,source_campaign text,source_channel text,registration_type text,category_interest text,purpose text,
  dominant_foot text,school_name text,referral_name text,public_message text,photo_path text,photo_uploaded_at timestamptz,
  privacy_notice_version text,data_consent boolean,data_consent_at timestamptz,image_consent boolean,image_consent_at timestamptz,
  status text,next_action_at timestamptz,notes text,created_at timestamptz,scouting_count bigint
)
language plpgsql stable security definer set search_path to 'pg_catalog','app','private'
as $$
begin
  if not private.has_any_module_access(p_organization_id,array['prospects','scouting'],false) then raise exception 'Not authorized'; end if;
  return query
  select p.id,p.first_name,p.last_name,p.birth_date,p.phone,p.email,p.guardian_name,
         p.source,p.source_campaign,p.source_channel,p.registration_type,p.category_interest,p.purpose,
         p.dominant_foot,p.school_name,p.referral_name,p.public_message,p.photo_path,p.photo_uploaded_at,
         p.privacy_notice_version,p.data_consent,p.data_consent_at,p.image_consent,p.image_consent_at,
         p.status,p.next_action_at,p.notes,p.created_at,
         (select count(*) from app.scouting_reports s where s.organization_id=p.organization_id and s.prospect_id=p.id) as scouting_count
  from app.prospects p
  where p.organization_id=p_organization_id and p.archived_at is null and (p_status is null or p.status=p_status)
  order by p.created_at desc,p.id;
end $$;

create function public.v2_prospects(organization_id uuid,status_filter text default null)
returns table(
  id uuid,first_name text,last_name text,birth_date date,phone text,email text,guardian_name text,
  source text,source_campaign text,source_channel text,registration_type text,category_interest text,purpose text,
  dominant_foot text,school_name text,referral_name text,public_message text,photo_path text,photo_uploaded_at timestamptz,
  privacy_notice_version text,data_consent boolean,data_consent_at timestamptz,image_consent boolean,image_consent_at timestamptz,
  status text,next_action_at timestamptz,notes text,created_at timestamptz,scouting_count bigint
)
language sql security definer set search_path to 'pg_catalog','private'
as $$ select * from private.query_prospects(organization_id,status_filter) $$;
revoke all on function public.v2_prospects(uuid,text) from public;
grant execute on function public.v2_prospects(uuid,text) to authenticated;;
