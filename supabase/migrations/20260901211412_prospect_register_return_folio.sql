-- public_register_prospect_enhanced now generates a folio, stores it, and returns {id, folio}
-- instead of a bare uuid, so the public form can show a welcome card with a real folio.
drop function if exists private.public_register_prospect_enhanced(text,text,text,date,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean);
drop function if exists public.v2_public_register_enhanced(text,text,text,date,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean);

create function private.public_register_prospect_enhanced(p_public_key text, p_first_name text, p_last_name text, p_birth_date date, p_phone text, p_email text, p_guardian_name text, p_category_interest text, p_source_campaign text, p_source_channel text, p_registration_type text, p_purpose text, p_dominant_foot text, p_school_name text, p_referral_name text, p_public_message text, p_privacy_notice_version text, p_data_consent boolean, p_image_consent boolean)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare
  v_org uuid; v_id uuid; v_now timestamptz:=now(); v_phone text; v_existing uuid; v_folio text;
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
    select p.folio into v_folio from app.prospects p where p.id=v_existing;
    return jsonb_build_object('id',v_existing,'folio',v_folio);
  end if;

  v_folio:=private.next_prospect_folio(v_org);

  insert into app.prospects(
    organization_id,first_name,last_name,birth_date,phone,email,guardian_name,
    source,source_campaign,source_channel,interest_type,registration_type,category_interest,
    purpose,dominant_foot,school_name,referral_name,public_message,status,photo_required,
    privacy_notice_version,data_consent,data_consent_at,image_consent,image_consent_at,folio,created_at,updated_at
  ) values(
    v_org,trim(p_first_name),trim(p_last_name),p_birth_date,v_phone,nullif(lower(trim(p_email)),''),trim(p_guardian_name),
    'public_form',nullif(trim(p_source_campaign),''),trim(p_source_channel),p_registration_type,p_registration_type,nullif(trim(p_category_interest),''),
    trim(p_purpose),p_dominant_foot,trim(p_school_name),nullif(trim(p_referral_name),''),nullif(trim(p_public_message),''),'new',true,
    trim(p_privacy_notice_version),true,v_now,coalesce(p_image_consent,false),case when coalesce(p_image_consent,false) then v_now else null end,v_folio,v_now,v_now
  ) returning id into v_id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload)
  values(v_org,'ProspectRegistered','prospect',v_id,jsonb_build_object('source','public_form','campaign',p_source_campaign,'sourceChannel',p_source_channel,'registrationType',p_registration_type,'privacyNoticeVersion',p_privacy_notice_version,'dataConsent',true,'imageConsent',coalesce(p_image_consent,false),'photoRequired',true,'phone',v_phone,'folio',v_folio));
  return jsonb_build_object('id',v_id,'folio',v_folio);
end $function$;

create function public.v2_public_register_enhanced(club_key text, first_name text, last_name text, birth_date date, phone text, email text, guardian_name text, category_interest text, source_campaign text, source_channel text, registration_type text, purpose text, dominant_foot text, school_name text, referral_name text, public_message text, privacy_notice_version text, data_consent boolean, image_consent boolean)
 returns jsonb
 language sql
 security definer
 set search_path to 'pg_catalog', 'private'
as $function$ select private.public_register_prospect_enhanced($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) $function$;

revoke all on function public.v2_public_register_enhanced from public;
grant execute on function public.v2_public_register_enhanced to postgres, anon, authenticated, service_role;
;
