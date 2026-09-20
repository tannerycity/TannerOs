
-- 1) Schema: nullable sex on players and prospects
alter table app.players add column if not exists sex text;
alter table app.players add constraint players_sex_check check (sex is null or sex in ('M','F'));
alter table app.prospects add column if not exists sex text;
alter table app.prospects add constraint prospects_sex_check check (sex is null or sex in ('M','F'));

-- 2) private.public_register_prospect_enhanced: + p_sex
drop function private.public_register_prospect_enhanced(text,text,text,date,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean);
CREATE FUNCTION private.public_register_prospect_enhanced(p_public_key text, p_first_name text, p_last_name text, p_birth_date date, p_phone text, p_email text, p_guardian_name text, p_category_interest text, p_source_campaign text, p_source_channel text, p_registration_type text, p_purpose text, p_dominant_foot text, p_school_name text, p_referral_name text, p_public_message text, p_privacy_notice_version text, p_data_consent boolean, p_image_consent boolean, p_sex text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'private'
AS $function$
declare
  v_org uuid; v_id uuid; v_now timestamptz:=now(); v_phone text; v_existing uuid; v_folio text; v_sex text;
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
  v_sex:=case when nullif(trim(coalesce(p_sex,'')),'') is null then null when upper(trim(p_sex)) in ('M','F') then upper(trim(p_sex)) else '__invalid__' end;
  if v_sex='__invalid__' then raise exception 'Invalid sex'; end if;

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
    select p.folio into v_folio from app.prospects p where p.id=v_existing;
    return jsonb_build_object('id',v_existing,'folio',v_folio);
  end if;

  v_folio:=private.next_prospect_folio(v_org);

  insert into app.prospects(
    organization_id,first_name,last_name,birth_date,phone,email,guardian_name,
    source,source_campaign,source_channel,interest_type,registration_type,category_interest,
    purpose,dominant_foot,school_name,referral_name,public_message,status,photo_required,
    privacy_notice_version,data_consent,data_consent_at,image_consent,image_consent_at,folio,sex,created_at,updated_at
  ) values(
    v_org,trim(p_first_name),trim(p_last_name),p_birth_date,v_phone,nullif(lower(trim(p_email)),''),trim(p_guardian_name),
    'public_form',nullif(trim(p_source_campaign),''),trim(p_source_channel),p_registration_type,p_registration_type,nullif(trim(p_category_interest),''),
    trim(p_purpose),p_dominant_foot,trim(p_school_name),nullif(trim(p_referral_name),''),nullif(trim(p_public_message),''),'new',true,
    trim(p_privacy_notice_version),true,v_now,coalesce(p_image_consent,false),case when coalesce(p_image_consent,false) then v_now else null end,v_folio,v_sex,v_now,v_now
  ) returning id into v_id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload)
  values(v_org,'ProspectRegistered','prospect',v_id,jsonb_build_object('source','public_form','campaign',p_source_campaign,'sourceChannel',p_source_channel,'registrationType',p_registration_type,'privacyNoticeVersion',p_privacy_notice_version,'dataConsent',true,'imageConsent',coalesce(p_image_consent,false),'photoRequired',true,'phone',v_phone,'folio',v_folio));
  return jsonb_build_object('id',v_id,'folio',v_folio);
end $function$;
revoke all on function private.public_register_prospect_enhanced(text,text,text,date,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean,text) from public, anon, authenticated;
grant execute on function private.public_register_prospect_enhanced(text,text,text,date,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean,text) to public, anon, authenticated;

-- 3) public.v2_public_register_enhanced: + sex
drop function public.v2_public_register_enhanced(text,text,text,date,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean);
CREATE FUNCTION public.v2_public_register_enhanced(club_key text, first_name text, last_name text, birth_date date, phone text, email text, guardian_name text, category_interest text, source_campaign text, source_channel text, registration_type text, purpose text, dominant_foot text, school_name text, referral_name text, public_message text, privacy_notice_version text, data_consent boolean, image_consent boolean, sex text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private'
AS $function$ select private.public_register_prospect_enhanced(p_public_key=>club_key,p_first_name=>first_name,p_last_name=>last_name,p_birth_date=>birth_date,p_phone=>phone,p_email=>email,p_guardian_name=>guardian_name,p_category_interest=>category_interest,p_source_campaign=>source_campaign,p_source_channel=>source_channel,p_registration_type=>registration_type,p_purpose=>purpose,p_dominant_foot=>dominant_foot,p_school_name=>school_name,p_referral_name=>referral_name,p_public_message=>public_message,p_privacy_notice_version=>privacy_notice_version,p_data_consent=>data_consent,p_image_consent=>image_consent,p_sex=>sex) $function$;
revoke all on function public.v2_public_register_enhanced(text,text,text,date,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean,text) from public, anon, authenticated;
grant execute on function public.v2_public_register_enhanced(text,text,text,date,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean,text) to anon, authenticated;

-- 4) private.command_update_player_profile: + p_sex
drop function private.command_update_player_profile(uuid,uuid,text,text,date,text,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean);
CREATE FUNCTION private.command_update_player_profile(p_organization_id uuid, p_player_id uuid, p_first_name text, p_last_name text, p_birth_date date, p_position text, p_dominant_foot text, p_jersey_number text, p_school text, p_blood_type text, p_allergies text, p_address text, p_emergency_contact_name text, p_emergency_contact_phone text, p_notes text, p_guardian_name text, p_guardian_phone text, p_guardian_email text, p_guardian_relationship text, p_can_pickup boolean, p_receives_billing boolean, p_sex text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'private'
AS $function$
declare v_current_guardian uuid; v_target_guardian uuid; v_phone text; v_emergency text; v_name text; v_email text; v_foot text; v_sex text;
begin
  if not private.has_module_access(p_organization_id,'players',true) then raise exception 'Not authorized'; end if;
  if not exists(select 1 from app.players where id=p_player_id and organization_id=p_organization_id and archived_at is null for update) then raise exception 'Player not found'; end if;
  if coalesce(length(trim(p_first_name)),0)<2 then raise exception 'Player first name required'; end if;
  if coalesce(length(trim(p_last_name)),0)<2 then raise exception 'Player last name required'; end if;
  if p_birth_date is null or p_birth_date>current_date then raise exception 'Valid birth date required'; end if;
  v_foot:=case lower(trim(coalesce(p_dominant_foot,''))) when '' then null when 'right' then 'right' when 'derecha' then 'right' when 'left' then 'left' when 'izquierda' then 'left' when 'both' then 'both' when 'ambas' then 'both' when 'por definir' then null else '__invalid__' end;
  if v_foot='__invalid__' then raise exception 'Invalid dominant foot'; end if;
  v_sex:=case when nullif(trim(coalesce(p_sex,'')),'') is null then null when upper(trim(p_sex)) in ('M','F') then upper(trim(p_sex)) else '__invalid__' end;
  if v_sex='__invalid__' then raise exception 'Invalid sex'; end if;
  if length(trim(coalesce(p_jersey_number,'')))>4 then raise exception 'Invalid jersey number'; end if;
  v_emergency:=case when nullif(trim(coalesce(p_emergency_contact_phone,'')),'') is null then null else private.normalize_public_phone(p_emergency_contact_phone) end;
  update app.players set first_name=trim(p_first_name),last_name=trim(p_last_name),birth_date=p_birth_date,position=nullif(trim(coalesce(p_position,'')),''),dominant_foot=v_foot,jersey_number=nullif(trim(coalesce(p_jersey_number,'')),''),school=nullif(trim(coalesce(p_school,'')),''),blood_type=nullif(trim(coalesce(p_blood_type,'')),''),allergies=nullif(trim(coalesce(p_allergies,'')),''),address=nullif(trim(coalesce(p_address,'')),''),emergency_contact_name=nullif(trim(coalesce(p_emergency_contact_name,'')),''),emergency_contact_phone=v_emergency,notes=nullif(trim(coalesce(p_notes,'')),''),sex=coalesce(v_sex,sex),updated_at=now() where id=p_player_id and organization_id=p_organization_id;
  v_name:=nullif(trim(coalesce(p_guardian_name,'')),'');
  if v_name is not null then
    if length(v_name)<2 then raise exception 'Guardian name required'; end if;
    v_phone:=private.normalize_public_phone(p_guardian_phone); if v_phone is null then raise exception 'Guardian phone required'; end if;
    v_email:=nullif(lower(trim(coalesce(p_guardian_email,''))),'');
    if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Invalid guardian email'; end if;
    select pg.guardian_id into v_current_guardian from app.player_guardians pg where pg.organization_id=p_organization_id and pg.player_id=p_player_id and pg.is_primary limit 1;
    select g.id into v_target_guardian from app.guardians g where g.organization_id=p_organization_id and g.status='active' and g.phone=v_phone order by (g.id=v_current_guardian) desc,g.created_at limit 1;
    if v_target_guardian is null and v_current_guardian is not null then
      v_target_guardian:=v_current_guardian;
      update app.guardians set first_name=v_name,last_name=null,phone=v_phone,email=v_email,relationship_default=nullif(trim(coalesce(p_guardian_relationship,'')),''),updated_at=now() where id=v_target_guardian and organization_id=p_organization_id;
    elsif v_target_guardian is null then
      insert into app.guardians(organization_id,first_name,last_name,phone,email,relationship_default,status,created_at,updated_at)
      values(p_organization_id,v_name,null,v_phone,v_email,nullif(trim(coalesce(p_guardian_relationship,'')),''),'active',now(),now()) returning id into v_target_guardian;
    else
      update app.guardians set first_name=v_name,email=coalesce(v_email,email),relationship_default=coalesce(nullif(trim(coalesce(p_guardian_relationship,'')),''),relationship_default),updated_at=now() where id=v_target_guardian and organization_id=p_organization_id;
    end if;
    update app.player_guardians set is_primary=false where organization_id=p_organization_id and player_id=p_player_id and is_primary and guardian_id<>v_target_guardian;
    insert into app.player_guardians(player_id,guardian_id,relationship,is_primary,can_pickup,receives_billing,organization_id,created_at)
    values(p_player_id,v_target_guardian,coalesce(nullif(trim(coalesce(p_guardian_relationship,'')),''),'Tutor'),true,coalesce(p_can_pickup,true),coalesce(p_receives_billing,true),p_organization_id,now())
    on conflict(player_id,guardian_id) do update set relationship=excluded.relationship,is_primary=true,can_pickup=excluded.can_pickup,receives_billing=excluded.receives_billing;
  end if;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values(p_organization_id,'PlayerProfileUpdated','player',p_player_id,jsonb_build_object('guardianUpdated',v_name is not null,'emergencyPhone',v_emergency is not null,'dominantFoot',v_foot,'sex',v_sex),(select auth.uid()));
  return private.query_player_profile(p_organization_id,p_player_id);
end $function$;
revoke all on function private.command_update_player_profile(uuid,uuid,text,text,date,text,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean,text) from public, anon, authenticated;
grant execute on function private.command_update_player_profile(uuid,uuid,text,text,date,text,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean,text) to public, anon, authenticated;

-- 5) public.v2_update_player_profile: + sex
drop function public.v2_update_player_profile(uuid,uuid,text,text,date,text,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean);
CREATE FUNCTION public.v2_update_player_profile(organization_id uuid, player_id uuid, first_name text, last_name text, birth_date date, player_position text, dominant_foot text, jersey_number text, school text, blood_type text, allergies text, address text, emergency_contact_name text, emergency_contact_phone text, notes text, guardian_name text, guardian_phone text, guardian_email text, guardian_relationship text, can_pickup boolean, receives_billing boolean, sex text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private'
AS $function$ select private.command_update_player_profile(p_organization_id=>organization_id,p_player_id=>player_id,p_first_name=>first_name,p_last_name=>last_name,p_birth_date=>birth_date,p_position=>player_position,p_dominant_foot=>dominant_foot,p_jersey_number=>jersey_number,p_school=>school,p_blood_type=>blood_type,p_allergies=>allergies,p_address=>address,p_emergency_contact_name=>emergency_contact_name,p_emergency_contact_phone=>emergency_contact_phone,p_notes=>notes,p_guardian_name=>guardian_name,p_guardian_phone=>guardian_phone,p_guardian_email=>guardian_email,p_guardian_relationship=>guardian_relationship,p_can_pickup=>can_pickup,p_receives_billing=>receives_billing,p_sex=>sex) $function$;
revoke all on function public.v2_update_player_profile(uuid,uuid,text,text,date,text,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean,text) from public, anon, authenticated;
grant execute on function public.v2_update_player_profile(uuid,uuid,text,text,date,text,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean,text) to authenticated;

-- 6) private.command_save_player_profile: + p_sex passthrough
drop function private.command_save_player_profile(uuid,uuid,text,text,date,text,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean,uuid,date,text);
CREATE FUNCTION private.command_save_player_profile(p_organization_id uuid, p_player_id uuid, p_first_name text, p_last_name text, p_birth_date date, p_position text, p_dominant_foot text, p_jersey_number text, p_school text, p_blood_type text, p_allergies text, p_address text, p_emergency_contact_name text, p_emergency_contact_phone text, p_notes text, p_guardian_name text, p_guardian_phone text, p_guardian_email text, p_guardian_relationship text, p_can_pickup boolean, p_receives_billing boolean, p_category_id uuid, p_category_effective_date date, p_category_notes text, p_sex text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private'
AS $function$
declare v_before jsonb; v_current uuid;
begin
  v_before:=private.query_player_profile(p_organization_id,p_player_id);
  perform private.command_update_player_profile(p_organization_id,p_player_id,p_first_name,p_last_name,p_birth_date,p_position,p_dominant_foot,p_jersey_number,p_school,p_blood_type,p_allergies,p_address,p_emergency_contact_name,p_emergency_contact_phone,p_notes,p_guardian_name,p_guardian_phone,p_guardian_email,p_guardian_relationship,p_can_pickup,p_receives_billing,p_sex);
  v_current:=nullif(v_before->'activeEnrollment'->>'categoryId','')::uuid;
  if p_category_id is not null and p_category_id is distinct from v_current then
    perform private.command_change_player_category(p_organization_id,p_player_id,p_category_id,coalesce(p_category_effective_date,current_date),p_category_notes);
  end if;
  return private.query_player_profile(p_organization_id,p_player_id);
end $function$;
revoke all on function private.command_save_player_profile(uuid,uuid,text,text,date,text,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean,uuid,date,text,text) from public, anon, authenticated;
grant execute on function private.command_save_player_profile(uuid,uuid,text,text,date,text,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean,uuid,date,text,text) to public, anon, authenticated;

-- 7) public.v2_save_player_profile: + sex
drop function public.v2_save_player_profile(uuid,uuid,text,text,date,text,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean,uuid,date,text);
CREATE FUNCTION public.v2_save_player_profile(organization_id uuid, player_id uuid, first_name text, last_name text, birth_date date, player_position text, dominant_foot text, jersey_number text, school text, blood_type text, allergies text, address text, emergency_contact_name text, emergency_contact_phone text, notes text, guardian_name text, guardian_phone text, guardian_email text, guardian_relationship text, can_pickup boolean, receives_billing boolean, category_id uuid, category_effective_date date, category_notes text, sex text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private'
AS $function$ select private.command_save_player_profile(p_organization_id=>organization_id,p_player_id=>player_id,p_first_name=>first_name,p_last_name=>last_name,p_birth_date=>birth_date,p_position=>player_position,p_dominant_foot=>dominant_foot,p_jersey_number=>jersey_number,p_school=>school,p_blood_type=>blood_type,p_allergies=>allergies,p_address=>address,p_emergency_contact_name=>emergency_contact_name,p_emergency_contact_phone=>emergency_contact_phone,p_notes=>notes,p_guardian_name=>guardian_name,p_guardian_phone=>guardian_phone,p_guardian_email=>guardian_email,p_guardian_relationship=>guardian_relationship,p_can_pickup=>can_pickup,p_receives_billing=>receives_billing,p_category_id=>category_id,p_category_effective_date=>category_effective_date,p_category_notes=>category_notes,p_sex=>sex) $function$;
revoke all on function public.v2_save_player_profile(uuid,uuid,text,text,date,text,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean,uuid,date,text,text) from public, anon, authenticated;
grant execute on function public.v2_save_player_profile(uuid,uuid,text,text,date,text,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean,uuid,date,text,text) to authenticated;

-- 8) private.query_players + public.v2_players: add sex
drop function public.v2_players(uuid,text);
drop function private.query_players(uuid,text);
CREATE FUNCTION private.query_players(p_organization_id uuid, p_status text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, code text, first_name text, last_name text, birth_date date, status text, category text, player_position text, jersey_number text, photo_path text, base_monthly_fee numeric, billing_status text, needs_review boolean, sex text, school text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'private'
AS $function$
begin
  if not private.has_module_access(p_organization_id,'players',false) then raise exception 'Not authorized'; end if;
  return query
  select p.id,p.code,p.first_name,p.last_name,p.birth_date,p.status,p.category,p.position,p.jersey_number,p.photo_path,
         bp.base_monthly_fee,bp.status,bp.needs_review,p.sex,p.school
  from app.players p
  left join app.billing_profiles bp on bp.player_id=p.id and bp.organization_id=p.organization_id
  where p.organization_id=p_organization_id and p.archived_at is null and (p_status is null or p.status=p_status)
  order by p.first_name,p.last_name,p.id;
end $function$;
revoke all on function private.query_players(uuid,text) from public, anon, authenticated;
grant execute on function private.query_players(uuid,text) to authenticated;
CREATE FUNCTION public.v2_players(organization_id uuid, status_filter text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, code text, first_name text, last_name text, birth_date date, status_value text, category text, player_position text, jersey_number text, photo_path text, base_monthly_fee numeric, billing_status text, needs_review boolean, sex text, school text)
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'private'
AS $function$ select id,code,first_name,last_name,birth_date,status,category,player_position,jersey_number,photo_path,base_monthly_fee,billing_status,needs_review,sex,school from private.query_players(organization_id,status_filter) $function$;
revoke all on function public.v2_players(uuid,text) from public, anon, authenticated;
grant execute on function public.v2_players(uuid,text) to authenticated;

-- 9) private.query_player_profile: add sex to jsonb (same signature, grants untouched)
CREATE OR REPLACE FUNCTION private.query_player_profile(p_organization_id uuid, p_player_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'private'
AS $function$
declare v_player jsonb; v_guardians jsonb; v_enrollment jsonb;
begin
  if not private.has_module_access(p_organization_id,'players',false) then raise exception 'Not authorized'; end if;
  select jsonb_build_object(
    'id',p.id,'code',p.code,'firstName',p.first_name,'lastName',p.last_name,'birthDate',p.birth_date,'status',p.status,
    'category',p.category,'position',p.position,'dominantFoot',p.dominant_foot,'jerseyNumber',p.jersey_number,'school',p.school,
    'sex',p.sex,
    'bloodType',p.blood_type,'allergies',p.allergies,'address',p.address,'emergencyContactName',p.emergency_contact_name,
    'emergencyContactPhone',p.emergency_contact_phone,'photoBucket',p.photo_bucket,'photoPath',p.photo_path,
    'legacyPhotoData',case when p.photo_path is null then nullif(lp.photo_data,'') else null end,'notes',p.notes,
    'privacyNoticeVersion',p.privacy_notice_version,'dataConsent',p.data_consent,'dataConsentAt',p.data_consent_at,
    'imageConsent',p.image_consent,'imageConsentAt',p.image_consent_at,'joinedAt',p.joined_at,'withdrawnAt',p.withdrawn_at,
    'withdrawalReason',p.withdrawal_reason,'needsReview',p.needs_review,'reviewReason',p.review_reason
  ) into v_player
  from app.players p
  left join public.players lp on lp.organization_id=p.organization_id and lp.id=p.legacy_id
  where p.id=p_player_id and p.organization_id=p_organization_id and p.archived_at is null;
  if v_player is null then raise exception 'Player not found'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',g.id,'firstName',g.first_name,'lastName',g.last_name,'phone',g.phone,'email',g.email,'relationshipDefault',g.relationship_default,
    'relationship',pg.relationship,'isPrimary',pg.is_primary,'canPickup',pg.can_pickup,'receivesBilling',pg.receives_billing,'status',g.status
  ) order by pg.is_primary desc,g.created_at),'[]'::jsonb) into v_guardians
  from app.player_guardians pg join app.guardians g on g.id=pg.guardian_id and g.organization_id=pg.organization_id
  where pg.organization_id=p_organization_id and pg.player_id=p_player_id;
  select jsonb_build_object('id',pe.id,'categoryId',pe.category_id,'categoryName',c.name,'startsOn',pe.starts_on,'status',pe.status)
  into v_enrollment from app.player_enrollments pe join app.categories c on c.id=pe.category_id and c.organization_id=pe.organization_id
  where pe.organization_id=p_organization_id and pe.player_id=p_player_id and pe.status='active' order by pe.starts_on desc,pe.created_at desc limit 1;
  return jsonb_build_object('player',v_player,'guardians',v_guardians,'activeEnrollment',v_enrollment);
end
$function$;

-- 10) private.command_convert_prospect_to_player: carry sex from prospect (same signature, grants untouched)
CREATE OR REPLACE FUNCTION private.command_convert_prospect_to_player(p_organization_id uuid, p_prospect_id uuid, p_category_id uuid DEFAULT NULL::uuid, p_monthly_fee numeric DEFAULT NULL::numeric, p_joined_at date DEFAULT CURRENT_DATE, p_jersey_number text DEFAULT NULL::text, p_position text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'private'
AS $function$
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
    organization_id,code,first_name,last_name,birth_date,status,category,position,dominant_foot,jersey_number,school,sex,
    photo_bucket,photo_path,joined_at,notes,source_prospect_id,
    privacy_notice_version,data_consent,data_consent_at,image_consent,image_consent_at,created_at,updated_at
  ) values(
    p_organization_id,v_code,trim(pr.first_name),nullif(trim(pr.last_name),''),pr.birth_date,'active',
    case when p_category_id is not null then cat.name else nullif(trim(pr.category_interest),'') end,
    nullif(trim(p_position),''),pr.dominant_foot,nullif(trim(p_jersey_number),''),pr.school_name,pr.sex,
    case when pr.photo_path is not null then 'tanneros-prospect-photos' else 'tanneros-private' end,
    pr.photo_path,p_joined_at,nullif(trim(pr.public_message),''),pr.id,
    pr.privacy_notice_version,pr.data_consent,pr.data_consent_at,pr.image_consent,pr.image_consent_at,now(),now()
  ) returning id into v_player;

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

  update app.scouting_reports
     set player_id=v_player, status='closed', updated_at=now()
   where organization_id=p_organization_id and prospect_id=pr.id and player_id is null;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,'ProspectConvertedToPlayer','player',v_player,
    jsonb_build_object('prospectId',pr.id,'code',v_code,'categoryId',p_category_id,'monthlyFee',v_fee,'photoPreserved',pr.photo_path is not null,'privacyPreserved',pr.data_consent),
    coalesce((select auth.uid())::text,'system'));
  return v_player;
end $function$;
;
