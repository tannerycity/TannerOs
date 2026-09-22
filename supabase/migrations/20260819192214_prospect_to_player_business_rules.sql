alter table app.players add column if not exists photo_bucket text not null default 'tanneros-private';
alter table app.players add column if not exists source_prospect_id uuid null references app.prospects(id) on delete set null;
alter table app.players add column if not exists privacy_notice_version text null;
alter table app.players add column if not exists data_consent boolean not null default false;
alter table app.players add column if not exists data_consent_at timestamptz null;
alter table app.players add column if not exists image_consent boolean not null default false;
alter table app.players add column if not exists image_consent_at timestamptz null;

create unique index if not exists ux_players_org_source_prospect
on app.players(organization_id,source_prospect_id)
where source_prospect_id is not null and archived_at is null;

create or replace function private.next_player_code(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path='pg_catalog','app','private'
as $$
declare v_next integer;
begin
  select coalesce(max((regexp_match(code,'^Tanner([0-9]+)$'))[1]::integer),0)+1
    into v_next
  from app.players
  where organization_id=p_organization_id and code ~ '^Tanner[0-9]+$';
  return 'Tanner'||lpad(v_next::text,3,'0');
end $$;

create or replace function private.command_convert_prospect_to_player(
  p_organization_id uuid,
  p_prospect_id uuid,
  p_category_id uuid default null,
  p_monthly_fee numeric default null,
  p_joined_at date default current_date,
  p_jersey_number text default null,
  p_position text default null
) returns uuid
language plpgsql
security definer
set search_path='pg_catalog','app','private'
as $$
declare
  pr app.prospects%rowtype;
  cat app.categories%rowtype;
  v_player uuid;
  v_guardian uuid;
  v_code text;
  v_fee numeric;
  v_existing uuid;
begin
  if not private.has_module_access(p_organization_id,'players',true)
     or not private.has_module_access(p_organization_id,'prospects',true)
  then raise exception 'Not authorized'; end if;

  select * into pr from app.prospects
   where id=p_prospect_id and organization_id=p_organization_id and archived_at is null
   for update;
  if not found then raise exception 'Prospect not found'; end if;
  if pr.converted_player_id is not null then return pr.converted_player_id; end if;
  if coalesce(length(trim(pr.first_name)),0)<2 or coalesce(length(trim(pr.last_name)),0)<2 then raise exception 'Prospect name incomplete'; end if;
  if pr.birth_date is null then raise exception 'Prospect birth date required'; end if;
  if coalesce(length(trim(pr.guardian_name)),0)<2 or coalesce(length(trim(pr.phone)),0)<8 then raise exception 'Guardian contact required'; end if;

  if p_category_id is not null then
    select * into cat from app.categories where id=p_category_id and organization_id=p_organization_id and status='active';
    if not found then raise exception 'Invalid category'; end if;
  end if;

  -- Legacy duplicate rule, hardened for v2: same child + birth date inside one club cannot be activated twice.
  select p.id into v_existing from app.players p
   where p.organization_id=p_organization_id and p.archived_at is null and p.status='active'
     and lower(trim(p.first_name))=lower(trim(pr.first_name))
     and lower(trim(coalesce(p.last_name,'')))=lower(trim(coalesce(pr.last_name,'')))
     and p.birth_date=pr.birth_date
   limit 1;
  if v_existing is not null then raise exception 'Possible duplicate player'; end if;

  v_code:=private.next_player_code(p_organization_id);
  v_fee:=greatest(0,coalesce(p_monthly_fee,0));

  insert into app.players(
    organization_id,code,first_name,last_name,birth_date,status,category,position,dominant_foot,jersey_number,school,
    photo_bucket,photo_path,joined_at,notes,source_prospect_id,
    privacy_notice_version,data_consent,data_consent_at,image_consent,image_consent_at,created_at,updated_at
  ) values(
    p_organization_id,v_code,trim(pr.first_name),nullif(trim(pr.last_name),''),pr.birth_date,'active',
    case when p_category_id is not null then cat.name else nullif(trim(pr.category_interest),'') end,
    nullif(trim(p_position),''),pr.dominant_foot,nullif(trim(p_jersey_number),''),pr.school_name,
    case when pr.photo_path is not null then 'tanneros-prospect-photos' else 'tanneros-private' end,
    pr.photo_path,p_joined_at,nullif(trim(pr.public_message),''),pr.id,
    pr.privacy_notice_version,pr.data_consent,pr.data_consent_at,pr.image_consent,pr.image_consent_at,now(),now()
  ) returning id into v_player;

  -- Reuse guardian by canonical phone when possible; otherwise create one.
  select g.id into v_guardian from app.guardians g
   where g.organization_id=p_organization_id and g.status='active' and g.phone=pr.phone
   order by g.created_at limit 1;
  if v_guardian is null then
    insert into app.guardians(organization_id,first_name,last_name,phone,email,relationship_default,status)
    values(p_organization_id,trim(pr.guardian_name),null,pr.phone,pr.email,'Tutor','active') returning id into v_guardian;
  end if;
  insert into app.player_guardians(player_id,guardian_id,relationship,is_primary,can_pickup,receives_billing,organization_id)
  values(v_player,v_guardian,'Tutor',true,true,true,p_organization_id)
  on conflict do nothing;

  if p_category_id is not null then
    insert into app.player_enrollments(organization_id,player_id,category_id,starts_on,status,notes)
    values(p_organization_id,v_player,p_category_id,p_joined_at,'active','Alta desde prospecto')
    on conflict do nothing;
  end if;

  insert into app.billing_profiles(organization_id,player_id,base_monthly_fee,billing_start,billing_day,is_exempt,status,needs_review,review_reason)
  values(p_organization_id,v_player,v_fee,p_joined_at,1,(v_fee=0),'active',(p_monthly_fee is null),case when p_monthly_fee is null then 'Cuota pendiente de configurar al convertir prospecto' else null end);

  update app.prospects set status='converted',converted_player_id=v_player,updated_at=now() where id=pr.id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,'ProspectConvertedToPlayer','player',v_player,
    jsonb_build_object('prospectId',pr.id,'code',v_code,'categoryId',p_category_id,'monthlyFee',v_fee,'photoPreserved',pr.photo_path is not null,'privacyPreserved',pr.data_consent),
    coalesce((select auth.uid())::text,'system'));
  return v_player;
end $$;

create or replace function public.v2_convert_prospect_to_player(
  organization_id uuid,
  prospect_id uuid,
  category_id uuid default null,
  monthly_fee numeric default null,
  joined_at date default current_date,
  jersey_number text default null,
  player_position text default null
) returns uuid
language sql
security definer
set search_path='pg_catalog','private'
as $$ select private.command_convert_prospect_to_player($1,$2,$3,$4,$5,$6,$7) $$;

grant execute on function public.v2_convert_prospect_to_player(uuid,uuid,uuid,numeric,date,text,text) to authenticated;;
