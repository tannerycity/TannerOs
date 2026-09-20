-- TannerOS v2: business-rule parity core
-- Legacy source is treated as executable specification, with approved v2 decisions taking precedence.

-- 1) Auditable canonical business-rule catalog --------------------------------
create table if not exists app.business_rule_catalog (
  rule_key text primary key,
  domain text not null,
  title text not null,
  description text not null,
  source text not null check (source in ('legacy','approved_v2','platform_safety')),
  precedence smallint not null default 50 check (precedence between 0 and 100),
  enforcement text not null default 'pending' check (enforcement in ('database','command','workflow','frontend','pending')),
  status text not null default 'active' check (status in ('active','superseded','deprecated','pending')),
  test_status text not null default 'pending' check (test_status in ('tested','pending','not_applicable')),
  source_ref text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.business_rule_catalog enable row level security;
revoke all on app.business_rule_catalog from anon, authenticated;

create or replace function private.query_business_rules(p_organization_id uuid)
returns table(rule_key text,domain text,title text,description text,source text,precedence smallint,enforcement text,status text,test_status text,source_ref text,metadata jsonb)
language plpgsql stable security definer
set search_path='pg_catalog','app','private'
as $$
begin
  if not private.has_module_access(p_organization_id,'admin',false) then raise exception 'Not authorized'; end if;
  return query
  select b.rule_key,b.domain,b.title,b.description,b.source,b.precedence,b.enforcement,b.status,b.test_status,b.source_ref,b.metadata
  from app.business_rule_catalog b
  order by b.domain,b.rule_key;
end $$;

create or replace function public.v2_business_rules(organization_id uuid)
returns table(rule_key text,domain text,title text,description text,source text,precedence smallint,enforcement text,status text,test_status text,source_ref text,metadata jsonb)
language sql security definer set search_path='pg_catalog','private'
as $$ select * from private.query_business_rules(organization_id) $$;
revoke all on function public.v2_business_rules(uuid) from public;
grant execute on function public.v2_business_rules(uuid) to authenticated;

-- 2) Canonical public-phone normalization --------------------------------------
create or replace function private.normalize_public_phone(p_phone text)
returns text
language plpgsql immutable
set search_path='pg_catalog'
as $$
declare v text;
begin
  v:=trim(coalesce(p_phone,''));
  if v='' then return null; end if;
  -- Allow human formatting, but never letters/extensions in the canonical field.
  v:=regexp_replace(v,'[[:space:]().-]','','g');
  if v ~ '^00[1-9][0-9]{7,14}$' then v:='+'||substr(v,3); end if;
  -- Compatibility path for legacy Mexican 10-digit fields.
  if v ~ '^[0-9]{10}$' then v:='+52'||v; end if;
  if v !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Invalid phone number'; end if;
  return v;
end $$;

-- Harden legacy-compatible public register without removing email-only compatibility.
create or replace function private.public_register_prospect(
  p_public_key text,p_first_name text,p_last_name text,p_birth_date date,p_phone text,p_email text,
  p_guardian_name text,p_category_interest text,p_source_campaign text,p_consent jsonb default '{}'::jsonb)
returns uuid
language plpgsql security definer
set search_path='pg_catalog','app','private'
as $$
declare v_org uuid; v_id uuid; v_phone text;
begin
  perform private.enforce_public_rate_limit('register',20,interval '1 hour');
  v_org:=private.public_organization(p_public_key);
  if v_org is null or not private.module_enabled(v_org,'prospects') then raise exception 'Registration unavailable'; end if;
  if coalesce(length(trim(p_first_name)),0)<2 then raise exception 'First name required'; end if;
  if p_phone is not null and trim(p_phone)<>'' then v_phone:=private.normalize_public_phone(p_phone); end if;
  if v_phone is null and coalesce(length(trim(p_email)),0)<5 then raise exception 'Phone or email required'; end if;
  insert into app.prospects(organization_id,first_name,last_name,birth_date,phone,email,guardian_name,source,source_campaign,interest_type,category_interest,status,notes,created_at,updated_at)
  values(v_org,trim(p_first_name),nullif(trim(p_last_name),''),p_birth_date,v_phone,nullif(lower(trim(p_email)),''),nullif(trim(p_guardian_name),''),'public_form',nullif(trim(p_source_campaign),''),'academy',nullif(trim(p_category_interest),''),'new',case when p_consent='{}'::jsonb then null else 'Consent captured in public form' end,now(),now())
  returning id into v_id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload)
  values(v_org,'ProspectRegistered','prospect',v_id,jsonb_build_object('source','public_form','campaign',p_source_campaign,'consent',p_consent));
  return v_id;
end $$;

-- Enhanced prospect: strict canonical phone, privacy, and retry-safe duplicate detection.
create or replace function private.public_register_prospect_enhanced(
  p_public_key text,p_first_name text,p_last_name text,p_birth_date date,p_phone text,p_email text,
  p_guardian_name text,p_category_interest text,p_source_campaign text,p_source_channel text,
  p_registration_type text,p_purpose text,p_dominant_foot text,p_school_name text,p_referral_name text,
  p_public_message text,p_privacy_notice_version text,p_data_consent boolean,p_image_consent boolean)
returns uuid
language plpgsql security definer
set search_path='pg_catalog','app','private'
as $$
declare
  v_org uuid; v_id uuid; v_now timestamptz:=now(); v_phone text; v_existing uuid;
begin
  perform private.enforce_public_rate_limit('register',20,interval '1 hour');
  v_org:=private.public_organization(p_public_key);
  if v_org is null or not private.module_enabled(v_org,'prospects') then raise exception 'Registration unavailable'; end if;
  if coalesce(length(trim(p_first_name)),0)<2 then raise exception 'First name required'; end if;
  if coalesce(length(trim(p_last_name)),0)<2 then raise exception 'Last name required'; end if;
  if p_birth_date is null then raise exception 'Birth date required'; end if;
  if p_birth_date > current_date then raise exception 'Invalid birth date'; end if;
  if coalesce(length(trim(p_guardian_name)),0)<2 then raise exception 'Guardian required'; end if;
  v_phone:=private.normalize_public_phone(p_phone);
  if v_phone is null then raise exception 'Phone required'; end if;
  if coalesce(length(trim(p_school_name)),0)<2 then raise exception 'School required'; end if;
  if coalesce(length(trim(p_purpose)),0)<2 then raise exception 'Purpose required'; end if;
  if p_dominant_foot not in ('right','left','both') then raise exception 'Dominant foot required'; end if;
  if p_registration_type not in ('player','goalkeeper','program','event','general') then raise exception 'Invalid registration type'; end if;
  if coalesce(length(trim(p_source_channel)),0)<2 then raise exception 'Source required'; end if;
  if lower(trim(p_source_channel))='recomendación' and coalesce(length(trim(p_referral_name)),0)<2 then raise exception 'Referral name required'; end if;
  if p_data_consent is distinct from true then raise exception 'Privacy consent required'; end if;
  if coalesce(length(trim(p_privacy_notice_version)),0)<4 then raise exception 'Privacy notice version required'; end if;

  -- Exact retry/duplicate protection for the same child + campaign in a short window.
  select p.id into v_existing
  from app.prospects p
  where p.organization_id=v_org and p.archived_at is null
    and lower(trim(p.first_name))=lower(trim(p_first_name))
    and lower(trim(coalesce(p.last_name,'')))=lower(trim(p_last_name))
    and p.birth_date=p_birth_date and p.phone=v_phone
    and coalesce(p.source_campaign,'')=coalesce(trim(p_source_campaign),'')
    and p.created_at >= v_now-interval '24 hours'
  order by p.created_at desc limit 1;
  if v_existing is not null then
    insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload)
    values(v_org,'ProspectDuplicateSubmission','prospect',v_existing,jsonb_build_object('campaign',p_source_campaign,'phone',v_phone));
    return v_existing;
  end if;

  insert into app.prospects(
    organization_id,first_name,last_name,birth_date,phone,email,guardian_name,
    source,source_campaign,source_channel,interest_type,registration_type,category_interest,
    purpose,dominant_foot,school_name,referral_name,public_message,status,photo_required,
    privacy_notice_version,data_consent,data_consent_at,image_consent,image_consent_at,created_at,updated_at
  ) values(
    v_org,trim(p_first_name),trim(p_last_name),p_birth_date,v_phone,nullif(lower(trim(p_email)),''),trim(p_guardian_name),
    'public_form',nullif(trim(p_source_campaign),''),trim(p_source_channel),p_registration_type,p_registration_type,nullif(trim(p_category_interest),''),
    trim(p_purpose),p_dominant_foot,trim(p_school_name),nullif(trim(p_referral_name),''),nullif(trim(p_public_message),''),'new',true,
    trim(p_privacy_notice_version),true,v_now,coalesce(p_image_consent,false),case when coalesce(p_image_consent,false) then v_now else null end,v_now,v_now
  ) returning id into v_id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload)
  values(v_org,'ProspectRegistered','prospect',v_id,jsonb_build_object('source','public_form','campaign',p_source_campaign,'sourceChannel',p_source_channel,'registrationType',p_registration_type,'privacyNoticeVersion',p_privacy_notice_version,'dataConsent',true,'imageConsent',coalesce(p_image_consent,false),'photoRequired',true,'phone',v_phone));
  return v_id;
end $$;

-- Normalize phone for public orders at the service boundary.
create or replace function private.public_create_order(
  p_public_key text,p_customer_name text,p_customer_phone text,p_customer_email text,p_items jsonb,p_notes text default null)
returns jsonb
language plpgsql security definer
set search_path='pg_catalog','app','private'
as $$
declare
  v_org uuid; v_order uuid; v_folio text; v_subtotal numeric:=0; r record; v_qty integer; v_attrs jsonb; v_product_id uuid; v_phone text;
begin
  perform private.enforce_public_rate_limit('order',15,interval '1 hour');
  v_org:=private.public_organization(p_public_key);
  if v_org is null or not private.module_enabled(v_org,'commerce') then raise exception 'Ordering unavailable'; end if;
  if coalesce(length(trim(p_customer_name)),0)<2 then raise exception 'Customer name required'; end if;
  if p_customer_phone is not null and trim(p_customer_phone)<>'' then v_phone:=private.normalize_public_phone(p_customer_phone); end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>20 then raise exception 'Invalid items'; end if;
  v_folio:=private.next_order_folio(v_org);
  insert into app.orders(organization_id,folio,customer_name,customer_phone,customer_email,subtotal,discount,total,status,source,notes,created_at,updated_at)
  values(v_org,v_folio,trim(p_customer_name),v_phone,nullif(lower(trim(p_customer_email)),''),0,0,0,'pending_payment','public_form',p_notes,now(),now()) returning id into v_order;
  for r in select value as item from jsonb_array_elements(p_items) loop
    v_qty:=greatest(1,least(99,coalesce((r.item->>'quantity')::integer,1)));
    v_attrs:=coalesce(r.item->'attributes','{}'::jsonb);
    v_product_id:=coalesce(nullif(r.item->>'product_id','')::uuid,nullif(r.item->>'productId','')::uuid);
    if v_product_id is null then raise exception 'Invalid product'; end if;
    insert into app.order_items(organization_id,order_id,product_id,description,quantity,unit_price,unit_cost,attributes)
    select v_org,v_order,p.id,p.name,v_qty,p.price,p.cost,v_attrs from app.products p
    where p.id=v_product_id and p.organization_id=v_org and p.active=true and p.archived_at is null;
    if not found then raise exception 'Invalid product'; end if;
  end loop;
  select coalesce(sum(quantity*unit_price),0) into v_subtotal from app.order_items where order_id=v_order;
  update app.orders set subtotal=v_subtotal,total=v_subtotal,updated_at=now() where id=v_order;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload)
  values(v_org,'OrderCreated','order',v_order,jsonb_build_object('folio',v_folio,'total',v_subtotal,'source','public_form'));
  return jsonb_build_object('id',v_order,'folio',v_folio,'total',v_subtotal);
end $$;

create or replace function private.public_create_order_enhanced(
  p_public_key text,p_customer_name text,p_customer_phone text,p_customer_email text,p_items jsonb,p_notes text,p_consent jsonb)
returns jsonb
language plpgsql security definer
set search_path='pg_catalog','app','private'
as $$
declare v_result jsonb; v_id uuid; v_phone text;
begin
  if coalesce((p_consent->>'dataAccepted')::boolean,false) is distinct from true then raise exception 'Privacy consent required'; end if;
  if coalesce(length(trim(p_consent->>'privacyNoticeVersion')),0)<4 then raise exception 'Privacy notice version required'; end if;
  v_phone:=private.normalize_public_phone(p_customer_phone);
  if v_phone is null then raise exception 'Phone required'; end if;
  v_result:=private.public_create_order(p_public_key,p_customer_name,v_phone,p_customer_email,p_items,p_notes);
  v_id:=(v_result->>'id')::uuid;
  update app.orders set consent=coalesce(p_consent,'{}'::jsonb),updated_at=now() where id=v_id;
  return v_result;
end $$;

-- 3) Academy capacity as a real relation-level rule ----------------------------
alter table app.academies add column if not exists capacity integer not null default 0;
do $$ begin
  if not exists(select 1 from pg_constraint where conname='academies_capacity_check') then
    alter table app.academies add constraint academies_capacity_check check (capacity>=0);
  end if;
end $$;

-- Recreate academy read API with capacity/availability while preserving function name.
drop function if exists public.v2_academies(uuid);
drop function if exists private.query_academies(uuid);
create function private.query_academies(p_organization_id uuid)
returns table(id uuid,slug text,name text,academy_type text,description text,status text,monthly_fee numeric,hourly_rate numeric,schedule jsonb,location text,capacity integer,active_enrollments bigint,available_spots integer)
language plpgsql stable security definer
set search_path='pg_catalog','app','private'
as $$
begin
  if not private.has_module_access(p_organization_id,'academies',false) then raise exception 'Not authorized'; end if;
  return query
  select a.id,a.slug,a.name,a.academy_type,a.description,a.status,a.monthly_fee,a.hourly_rate,a.schedule,a.location,a.capacity,
         (select count(*) from app.academy_enrollments e where e.organization_id=a.organization_id and e.academy_id=a.id and e.status='active') as active_enrollments,
         case when a.capacity<=0 then null else greatest(0,a.capacity-(select count(*)::int from app.academy_enrollments e where e.organization_id=a.organization_id and e.academy_id=a.id and e.status='active')) end as available_spots
  from app.academies a where a.organization_id=p_organization_id and a.archived_at is null order by a.name,a.id;
end $$;
create function public.v2_academies(organization_id uuid)
returns table(id uuid,slug text,name text,academy_type text,description text,status text,monthly_fee numeric,hourly_rate numeric,schedule jsonb,location text,capacity integer,active_enrollments bigint,available_spots integer)
language sql security definer set search_path='pg_catalog','private'
as $$ select * from private.query_academies(organization_id) $$;
revoke all on function public.v2_academies(uuid) from public;
grant execute on function public.v2_academies(uuid) to authenticated;

create or replace function private.command_upsert_academy_enhanced(
  p_organization_id uuid,p_academy_id uuid,p_slug text,p_name text,p_academy_type text,p_description text,p_status text,
  p_monthly_fee numeric,p_hourly_rate numeric,p_schedule jsonb,p_location text,p_capacity integer)
returns uuid
language plpgsql security definer
set search_path='pg_catalog','app','private'
as $$
declare v_id uuid;
begin
  if coalesce(p_capacity,0)<0 then raise exception 'Capacity cannot be negative'; end if;
  v_id:=private.command_upsert_academy(p_organization_id,p_academy_id,p_slug,p_name,p_academy_type,p_description,p_status,p_monthly_fee,p_hourly_rate,p_schedule,p_location);
  update app.academies set capacity=coalesce(p_capacity,0),updated_at=now() where id=v_id and organization_id=p_organization_id;
  return v_id;
end $$;
create or replace function public.v2_upsert_academy_enhanced(
  organization_id uuid,academy_id uuid,slug text,name text,academy_type text,description text,status text,
  monthly_fee numeric,hourly_rate numeric,schedule jsonb,location text,capacity integer)
returns uuid language sql security definer set search_path='pg_catalog','private'
as $$ select private.command_upsert_academy_enhanced(organization_id,academy_id,slug,name,academy_type,description,status,monthly_fee,hourly_rate,schedule,location,capacity) $$;
revoke all on function public.v2_upsert_academy_enhanced(uuid,uuid,text,text,text,text,text,numeric,numeric,jsonb,text,integer) from public;
grant execute on function public.v2_upsert_academy_enhanced(uuid,uuid,text,text,text,text,text,numeric,numeric,jsonb,text,integer) to authenticated;

create or replace function private.command_enroll_academy(p_organization_id uuid,p_academy_id uuid,p_player_id uuid,p_starts_on date,p_agreed_fee numeric,p_notes text)
returns uuid language plpgsql security definer set search_path='pg_catalog','app','private'
as $$
declare v_id uuid; v_capacity integer; v_current integer; v_default_fee numeric;
begin
  if not private.has_module_access(p_organization_id,'academies',true) then raise exception 'Not authorized'; end if;
  select capacity,monthly_fee into v_capacity,v_default_fee from app.academies
  where id=p_academy_id and organization_id=p_organization_id and status='active' and archived_at is null for update;
  if not found then raise exception 'Academy unavailable'; end if;
  if not exists(select 1 from app.players where id=p_player_id and organization_id=p_organization_id and status='active' and archived_at is null) then raise exception 'Player unavailable'; end if;
  if exists(select 1 from app.academy_enrollments where organization_id=p_organization_id and academy_id=p_academy_id and player_id=p_player_id and status='active') then raise exception 'Player already enrolled'; end if;
  select count(*) into v_current from app.academy_enrollments where organization_id=p_organization_id and academy_id=p_academy_id and status='active';
  if coalesce(v_capacity,0)>0 and v_current>=v_capacity then raise exception 'Academy is full'; end if;
  insert into app.academy_enrollments(organization_id,academy_id,player_id,starts_on,agreed_fee,status,notes,created_at,updated_at)
  values(p_organization_id,p_academy_id,p_player_id,coalesce(p_starts_on,current_date),coalesce(p_agreed_fee,v_default_fee),'active',nullif(trim(coalesce(p_notes,'')),''),now(),now())
  returning id into v_id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,'AcademyEnrollmentCreated','academy_enrollment',v_id,jsonb_build_object('academy_id',p_academy_id,'player_id',p_player_id,'effective_fee',coalesce(p_agreed_fee,v_default_fee)),coalesce((select auth.uid())::text,'system'));
  return v_id;
end $$;

-- 4) Programs: age bounds + privacy + canonical phone --------------------------
alter table app.programs add column if not exists age_min smallint;
alter table app.programs add column if not exists age_max smallint;
alter table app.programs add column if not exists fee_weekly numeric;
alter table app.programs add column if not exists weeks smallint;
do $$ begin
  if not exists(select 1 from pg_constraint where conname='programs_age_bounds_check') then
    alter table app.programs add constraint programs_age_bounds_check check ((age_min is null or age_min>=0) and (age_max is null or age_max>=0) and (age_min is null or age_max is null or age_max>=age_min));
  end if;
  if not exists(select 1 from pg_constraint where conname='programs_fee_weekly_check') then
    alter table app.programs add constraint programs_fee_weekly_check check (fee_weekly is null or fee_weekly>=0);
  end if;
  if not exists(select 1 from pg_constraint where conname='programs_weeks_check') then
    alter table app.programs add constraint programs_weeks_check check (weeks is null or weeks>0);
  end if;
end $$;

create or replace function private.public_programs(p_public_key text,p_slug text default null)
returns jsonb language plpgsql security definer set search_path='pg_catalog','app','private'
as $$
declare v_org uuid; v_data jsonb;
begin
  perform private.enforce_public_rate_limit('programs',120,interval '1 hour');
  v_org:=private.public_organization(p_public_key);
  if v_org is null or not private.module_enabled(v_org,'programs') then raise exception 'Programs unavailable'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'slug',slug,'name',name,'type',program_type,'category',category_label,'description',description,
    'startsOn',starts_on,'endsOn',ends_on,'schedule',schedule,'location',location,'capacity',capacity,'fee',fee,
    'feeWeekly',fee_weekly,'weeks',weeks,'ageMin',age_min,'ageMax',age_max,'status',status
  ) order by coalesce(starts_on,current_date),name),'[]'::jsonb) into v_data
  from app.programs where organization_id=v_org and public_registration_enabled=true and status in ('published','active') and archived_at is null and (p_slug is null or slug=p_slug);
  return v_data;
end $$;

create or replace function private.public_enroll_program(p_public_key text,p_program_slug text,p_first_name text,p_last_name text,p_phone text,p_email text,p_birth_date date,p_consent jsonb)
returns jsonb language plpgsql security definer set search_path='pg_catalog','app','private'
as $$
declare v_org uuid; v_program app.programs%rowtype; v_id uuid; v_current integer; v_status text:='registered'; v_age integer; v_phone text;
begin
  perform private.enforce_public_rate_limit('program_enrollment',20,interval '1 hour');
  v_org:=private.public_organization(p_public_key);
  if v_org is null or not private.module_enabled(v_org,'programs') then raise exception 'Enrollment unavailable'; end if;
  select * into v_program from app.programs where organization_id=v_org and slug=p_program_slug and public_registration_enabled=true and status in ('published','active') and archived_at is null for update;
  if not found then raise exception 'Program unavailable'; end if;
  if coalesce(length(trim(p_first_name)),0)<2 then raise exception 'First name required'; end if;
  if p_birth_date is null or p_birth_date>current_date then raise exception 'Valid birth date required'; end if;
  if coalesce((p_consent->>'dataAccepted')::boolean,false) is distinct from true then raise exception 'Privacy consent required'; end if;
  if coalesce(length(trim(p_consent->>'privacyNoticeVersion')),0)<4 then raise exception 'Privacy notice version required'; end if;
  v_phone:=private.normalize_public_phone(p_phone); if v_phone is null then raise exception 'Phone required'; end if;
  v_age:=date_part('year',age(current_date,p_birth_date))::integer;
  if v_program.age_min is not null and v_age<v_program.age_min then raise exception 'Participant is below minimum age'; end if;
  if v_program.age_max is not null and v_age>v_program.age_max then raise exception 'Participant is above maximum age'; end if;
  select count(*) into v_current from app.program_enrollments where program_id=v_program.id and status in ('registered','confirmed');
  if v_program.capacity is not null and v_current>=v_program.capacity then v_status:='waitlisted'; end if;
  insert into app.program_enrollments(organization_id,program_id,participant_first_name,participant_last_name,phone,email,birth_date,status,payment_status,consent,created_at,updated_at)
  values(v_org,v_program.id,trim(p_first_name),nullif(trim(p_last_name),''),v_phone,nullif(lower(trim(p_email)),''),p_birth_date,v_status,'pending',coalesce(p_consent,'{}'::jsonb),now(),now()) returning id into v_id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload)
  values(v_org,'ProgramEnrollmentCreated','program_enrollment',v_id,jsonb_build_object('program_id',v_program.id,'status',v_status,'source','public_form','age',v_age));
  return jsonb_build_object('id',v_id,'status',v_status,'program',v_program.name);
end $$;

-- 5) Equipment: hard allocation rules -----------------------------------------
create or replace function private.query_equipment_items(p_organization_id uuid)
returns table(id uuid,sku text,name text,category text,quantity integer,min_stock integer,unit_cost numeric,location text,status text,assigned_quantity bigint,available_quantity bigint,needs_reorder boolean)
language plpgsql stable security definer set search_path='pg_catalog','app','private'
as $$
begin
  if not private.has_module_access(p_organization_id,'equipment',false) then raise exception 'Not authorized'; end if;
  return query
  select i.id,i.sku,i.name,i.category,i.quantity,i.min_stock,i.unit_cost,i.location,i.status,
         coalesce((select sum(a.quantity) from app.equipment_assignments a where a.organization_id=i.organization_id and a.equipment_item_id=i.id and a.returned_at is null),0)::bigint as assigned_quantity,
         greatest(0,i.quantity-coalesce((select sum(a.quantity) from app.equipment_assignments a where a.organization_id=i.organization_id and a.equipment_item_id=i.id and a.returned_at is null),0))::bigint as available_quantity,
         (i.min_stock>0 and greatest(0,i.quantity-coalesce((select sum(a.quantity) from app.equipment_assignments a where a.organization_id=i.organization_id and a.equipment_item_id=i.id and a.returned_at is null),0))<i.min_stock) as needs_reorder
  from app.equipment_items i where i.organization_id=p_organization_id and i.archived_at is null order by i.category nulls last,i.name;
end $$;

create or replace function private.command_upsert_equipment_item(p_organization_id uuid,p_item_id uuid,p_sku text,p_name text,p_category text,p_quantity integer,p_min_stock integer,p_unit_cost numeric,p_location text,p_status text,p_notes text)
returns uuid language plpgsql security definer set search_path='pg_catalog','app','private'
as $$
declare v_id uuid;
begin
  if not private.has_module_access(p_organization_id,'equipment',true) then raise exception 'Not authorized'; end if;
  if coalesce(length(trim(p_name)),0)<2 then raise exception 'Item name required'; end if;
  if coalesce(p_quantity,0)<0 or coalesce(p_min_stock,0)<0 then raise exception 'Inventory quantities cannot be negative'; end if;
  if p_unit_cost is not null and p_unit_cost<0 then raise exception 'Unit cost cannot be negative'; end if;
  if p_status not in ('active','maintenance','retired') then raise exception 'Invalid equipment status'; end if;
  if p_item_id is null then
    insert into app.equipment_items(organization_id,sku,name,category,quantity,min_stock,unit_cost,location,status,notes,created_at,updated_at)
    values(p_organization_id,nullif(trim(p_sku),''),trim(p_name),nullif(trim(p_category),''),coalesce(p_quantity,0),coalesce(p_min_stock,0),p_unit_cost,nullif(trim(p_location),''),p_status,nullif(trim(p_notes),''),now(),now()) returning id into v_id;
  else
    update app.equipment_items set sku=nullif(trim(p_sku),''),name=trim(p_name),category=nullif(trim(p_category),''),quantity=coalesce(p_quantity,0),min_stock=coalesce(p_min_stock,0),unit_cost=p_unit_cost,location=nullif(trim(p_location),''),status=p_status,notes=nullif(trim(p_notes),''),updated_at=now()
    where id=p_item_id and organization_id=p_organization_id and archived_at is null returning id into v_id;
    if v_id is null then raise exception 'Equipment item not found'; end if;
    if (select coalesce(sum(quantity),0) from app.equipment_assignments where organization_id=p_organization_id and equipment_item_id=v_id and returned_at is null)>coalesce(p_quantity,0) then raise exception 'Quantity cannot be lower than currently assigned quantity'; end if;
  end if;
  return v_id;
end $$;

create or replace function private.command_assign_equipment(p_organization_id uuid,p_item_id uuid,p_assigned_to_user_id uuid,p_assigned_to_label text,p_quantity integer,p_notes text)
returns uuid language plpgsql security definer set search_path='pg_catalog','app','private'
as $$
declare v_id uuid; v_total integer; v_assigned integer;
begin
  if not private.has_module_access(p_organization_id,'equipment',true) then raise exception 'Not authorized'; end if;
  if coalesce(p_quantity,0)<=0 then raise exception 'Assignment quantity must be greater than zero'; end if;
  if p_assigned_to_user_id is null and nullif(trim(coalesce(p_assigned_to_label,'')),'') is null then raise exception 'Assignment recipient required'; end if;
  select quantity into v_total from app.equipment_items where id=p_item_id and organization_id=p_organization_id and status='active' and archived_at is null for update;
  if not found then raise exception 'Equipment item unavailable'; end if;
  select coalesce(sum(quantity),0) into v_assigned from app.equipment_assignments where organization_id=p_organization_id and equipment_item_id=p_item_id and returned_at is null;
  if v_assigned+p_quantity>v_total then raise exception 'Not enough equipment available'; end if;
  insert into app.equipment_assignments(organization_id,equipment_item_id,assigned_to_user_id,assigned_to_label,quantity,assigned_at,notes)
  values(p_organization_id,p_item_id,p_assigned_to_user_id,nullif(trim(p_assigned_to_label),''),p_quantity,now(),nullif(trim(p_notes),'')) returning id into v_id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,'EquipmentAssigned','equipment_assignment',v_id,jsonb_build_object('item_id',p_item_id,'quantity',p_quantity,'recipient',p_assigned_to_label),coalesce((select auth.uid())::text,'system'));
  return v_id;
end $$;

create or replace function private.command_return_equipment(p_organization_id uuid,p_assignment_id uuid,p_notes text)
returns void language plpgsql security definer set search_path='pg_catalog','app','private'
as $$
begin
  if not private.has_module_access(p_organization_id,'equipment',true) then raise exception 'Not authorized'; end if;
  update app.equipment_assignments set returned_at=now(),notes=case when nullif(trim(coalesce(p_notes,'')),'') is null then notes else concat_ws(E'\n',notes,trim(p_notes)) end
  where id=p_assignment_id and organization_id=p_organization_id and returned_at is null;
  if not found then raise exception 'Active assignment not found'; end if;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,'EquipmentReturned','equipment_assignment',p_assignment_id,jsonb_build_object('notes',nullif(trim(coalesce(p_notes,'')),'')),coalesce((select auth.uid())::text,'system'));
end $$;

create or replace function public.v2_equipment_items(organization_id uuid)
returns table(id uuid,sku text,name text,category text,quantity integer,min_stock integer,unit_cost numeric,location text,status text,assigned_quantity bigint,available_quantity bigint,needs_reorder boolean)
language sql security definer set search_path='pg_catalog','private'
as $$ select * from private.query_equipment_items(organization_id) $$;
create or replace function public.v2_upsert_equipment_item(organization_id uuid,item_id uuid,sku text,name text,category text,quantity integer,min_stock integer,unit_cost numeric,location text,status text,notes text)
returns uuid language sql security definer set search_path='pg_catalog','private'
as $$ select private.command_upsert_equipment_item(organization_id,item_id,sku,name,category,quantity,min_stock,unit_cost,location,status,notes) $$;
create or replace function public.v2_assign_equipment(organization_id uuid,item_id uuid,assigned_to_user_id uuid,assigned_to_label text,quantity integer,notes text)
returns uuid language sql security definer set search_path='pg_catalog','private'
as $$ select private.command_assign_equipment(organization_id,item_id,assigned_to_user_id,assigned_to_label,quantity,notes) $$;
create or replace function public.v2_return_equipment(organization_id uuid,assignment_id uuid,notes text)
returns void language sql security definer set search_path='pg_catalog','private'
as $$ select private.command_return_equipment(organization_id,assignment_id,notes) $$;
revoke all on function public.v2_equipment_items(uuid) from public;
revoke all on function public.v2_upsert_equipment_item(uuid,uuid,text,text,text,integer,integer,numeric,text,text,text) from public;
revoke all on function public.v2_assign_equipment(uuid,uuid,uuid,text,integer,text) from public;
revoke all on function public.v2_return_equipment(uuid,uuid,text) from public;
grant execute on function public.v2_equipment_items(uuid) to authenticated;
grant execute on function public.v2_upsert_equipment_item(uuid,uuid,text,text,text,integer,integer,numeric,text,text,text) to authenticated;
grant execute on function public.v2_assign_equipment(uuid,uuid,uuid,text,integer,text) to authenticated;
grant execute on function public.v2_return_equipment(uuid,uuid,text) to authenticated;

-- 6) Seed canonical rule catalog ------------------------------------------------
insert into app.business_rule_catalog(rule_key,domain,title,description,source,precedence,enforcement,status,test_status,source_ref,metadata) values
('BILL-001','billing','Monthly charge lifecycle','Monthly charge is generated on day 1 and due by end of day 5.','approved_v2',100,'command','active','tested','approved-v2-billing',jsonb_build_object('due_day',5)),
('BILL-002','billing','Late fee','A $100 late fee is assessed after day 5 for future v2 billing only; no retroactive July/August fee.','approved_v2',100,'command','active','tested','approved-v2-billing',jsonb_build_object('amount',100,'retroactive',false)),
('BILL-003','billing','First-month proration','Only the first billing month may be prorated based on signup date; later months use the full fee.','approved_v2',100,'command','active','tested','legacy QA + approved v2','{}'),
('BILL-004','billing','Partial payments','Partial payments are allowed and allocations preserve remaining balance.','approved_v2',100,'database','active','tested','approved-v2-billing','{}'),
('BILL-005','billing','Oldest debt first','New payments allocate to oldest debt first unless an explicit historical period is supplied.','approved_v2',100,'command','active','tested','approved-v2-billing','{}'),
('BILL-006','billing','Overpayment credit','Overpayment from new v2 payments becomes available credit; historical excess remains legacy_hold.','approved_v2',100,'database','active','tested','approved-v2-billing','{}'),
('BILL-007','billing','Benefits and scholarships','Full scholarship creates no expected income; Hermanos Tanner is a $50 discount; Curtibrother is sponsor-paid, not scholarship.','approved_v2',100,'command','active','tested','approved-v2-billing','{}'),
('PLAYER-001','players','Withdrawal preserves history','Withdrawal closes future billing while preserving player and financial history.','approved_v2',100,'command','active','tested','approved-v2-lifecycle','{}'),
('PLAYER-002','players','Reactivation restarts billing','Reactivation preserves history and restarts billing from the return date without regenerating missed months.','approved_v2',100,'command','active','tested','approved-v2-lifecycle','{}'),
('ATT-001','attendance','One record per session/player','Saving the same roster again corrects the record instead of duplicating it.','legacy',80,'database','active','tested','TannerOS v1 attendance','{}'),
('ATT-002','attendance','Roster integrity','Attendance can only be recorded for an active player enrolled in the session category.','platform_safety',90,'command','active','tested','v2 attendance','{}'),
('ACA-001','academies','Capacity','Capacity 0 means unlimited; only active enrollments consume capacity and a withdrawal frees the place.','legacy',80,'command','active','pending','TannerOS v1 acadCupo/acadOcupacion','{}'),
('ACA-002','academies','No duplicate active enrollment','A Tanner cannot have two active enrollments in the same academy.','legacy',80,'database','active','pending','TannerOS v1 acadInscribir','{}'),
('ACA-003','academies','Individual fee overrides academy fee','If an enrollment has an agreed fee it takes precedence; otherwise the academy monthly fee applies.','legacy',80,'command','active','pending','TannerOS v1 acadFeeDe','{}'),
('PROS-001','prospects','Minor registration required fields','New public minor registration requires name, birth date, guardian, phone, school, purpose, dominant foot and source.','legacy',80,'command','active','tested','TannerOS v1 prospect + enhanced v2','{}'),
('PROS-002','prospects','Privacy traceability','Data consent is mandatory; image/publicity consent is separate and optional; notice version and timestamps are stored.','approved_v2',100,'database','active','tested','enhanced public forms','{}'),
('PROS-003','prospects','Photo private','Player/goalkeeper public registration requires a private internal recognition photo.','approved_v2',100,'workflow','active','tested','enhanced public forms','{}'),
('PROS-004','prospects','Retry duplicate protection','Exact repeated child + phone + birth date + campaign submissions in 24 hours reuse the existing prospect instead of duplicating it.','platform_safety',90,'command','active','pending','v2 public registration','{}'),
('PHONE-001','shared','Canonical phone','New public flows store phone in canonical E.164; legacy 10-digit Mexico input remains accepted and normalized to +52.','platform_safety',90,'command','active','pending','v2 public boundary','{}'),
('PROG-001','programs','Public enrollment isolation','Public visitors can only read published programs and create enrollments, never internal player/financial data.','legacy',80,'command','active','tested','Apps Script publiccourses/publicenroll','{}'),
('PROG-002','programs','Capacity waitlist','When program capacity is reached, additional valid registrations are waitlisted.','approved_v2',90,'command','active','tested','v2 programs','{}'),
('PROG-003','programs','Age bounds','When configured, public enrollment must satisfy program minimum/maximum age.','legacy',80,'command','active','pending','summerCourses ageMin/ageMax','{}'),
('ORDER-001','commerce','Backend price authority','Public orders use the active product price from the database; browser-supplied prices are ignored.','platform_safety',100,'command','active','tested','v2 public order','{}'),
('ORDER-002','commerce','Order state machine','Orders may only move through approved status transitions; arbitrary jumps are rejected.','approved_v2',90,'command','active','tested','v2 order status','{}'),
('ORDER-003','commerce','Unique yearly folio','Every order receives a unique PED-year-sequence folio.','legacy',80,'database','active','tested','TannerOS v1 public order','{}'),
('ORDER-004','commerce','Production readiness','Supplier-ready orders require pieces, sizes, required personalization and configured minimum payment.','legacy',80,'pending','pending','pending','TannerOS v1 orderReady','{}'),
('ORDER-005','commerce','Margin authorization','A discount that takes margin below the configured minimum requires Presidencia authorization.','legacy',80,'pending','pending','pending','TannerOS v1 saveWizOrder','{}'),
('EQUIP-001','equipment','No over-assignment','Active equipment assignments cannot exceed physical inventory quantity.','platform_safety',90,'command','active','pending','v2 equipment','{}'),
('EQUIP-002','equipment','Reorder threshold','Reorder is flagged only when a positive minimum stock is configured and available stock falls below it.','legacy',80,'command','active','pending','TannerOS v1 faltaReponer','{}'),
('SEC-001','security','Authorization server-side','Module write/read permissions are enforced by Auth membership, role permission and subscription entitlement, not only UI visibility.','approved_v2',100,'command','active','tested','v2 RLS/access helpers','{}'),
('GK-001','goalkeeper','Package consumption','Goalkeeper package usage excludes cancelled sessions; remaining classes cannot be negative.','legacy',80,'pending','pending','pending','TannerOS v1 gkPackageInfo','{}'),
('GK-002','goalkeeper','Package session price','A session consumed from a prepaid goalkeeper package has zero additional session charge.','legacy',80,'pending','pending','pending','TannerOS v1 gkSessionAmount','{}'),
('SPONSOR-001','sponsors','Agreement dates','Sponsor agreement end date cannot precede start date.','platform_safety',90,'database','active','tested','v2 constraint','{}')
on conflict(rule_key) do update set domain=excluded.domain,title=excluded.title,description=excluded.description,source=excluded.source,precedence=excluded.precedence,enforcement=excluded.enforcement,status=excluded.status,test_status=excluded.test_status,source_ref=excluded.source_ref,metadata=excluded.metadata,updated_at=now();;
