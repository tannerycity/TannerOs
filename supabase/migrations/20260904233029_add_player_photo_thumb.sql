-- Jugadores performance fix: separate small thumbnail from full-size profile photo
-- so the roster grid doesn't have to download the full 1600px image per card.

alter table app.players add column if not exists photo_thumb_path text;

-- Re-create query_players / v2_players to also expose photo_thumb_path
drop function if exists private.query_players(uuid, text);
drop function if exists public.v2_players(uuid, text);

create function private.query_players(p_organization_id uuid, p_status text default null)
 returns table(id uuid, code text, first_name text, last_name text, birth_date date, status text, category text, player_position text, jersey_number text, photo_path text, photo_thumb_path text, base_monthly_fee numeric, billing_status text, needs_review boolean, sex text, school text)
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog', 'app', 'private'
as $function$
begin
  if not private.has_module_access(p_organization_id,'players',false) then raise exception 'Not authorized'; end if;
  return query
  select p.id,p.code,p.first_name,p.last_name,p.birth_date,p.status,p.category,p.position,p.jersey_number,p.photo_path,p.photo_thumb_path,
         bp.base_monthly_fee,bp.status,bp.needs_review,p.sex,p.school
  from app.players p
  left join app.billing_profiles bp on bp.player_id=p.id and bp.organization_id=p.organization_id
  where p.organization_id=p_organization_id and p.archived_at is null and (p_status is null or p.status=p_status)
  order by p.first_name,p.last_name,p.id;
end $function$;

create function public.v2_players(organization_id uuid, status_filter text default null)
 returns table(id uuid, code text, first_name text, last_name text, birth_date date, status_value text, category text, player_position text, jersey_number text, photo_path text, photo_thumb_path text, base_monthly_fee numeric, billing_status text, needs_review boolean, sex text, school text)
 language sql
 set search_path to 'pg_catalog', 'private'
as $function$ select id,code,first_name,last_name,birth_date,status,category,player_position,jersey_number,photo_path,photo_thumb_path,base_monthly_fee,billing_status,needs_review,sex,school from private.query_players(organization_id,status_filter) $function$;

grant execute on function private.query_players(uuid, text) to authenticated, postgres;
grant execute on function public.v2_players(uuid, text) to authenticated, postgres, service_role;

-- query_player_profile: same jsonb return type, safe to CREATE OR REPLACE in place
create or replace function private.query_player_profile(p_organization_id uuid, p_player_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare v_player jsonb; v_guardians jsonb; v_enrollment jsonb;
begin
  if not private.has_module_access(p_organization_id,'players',false) then raise exception 'Not authorized'; end if;
  select jsonb_build_object(
    'id',p.id,'code',p.code,'firstName',p.first_name,'lastName',p.last_name,'birthDate',p.birth_date,'status',p.status,
    'category',p.category,'position',p.position,'dominantFoot',p.dominant_foot,'jerseyNumber',p.jersey_number,'school',p.school,
    'sex',p.sex,
    'bloodType',p.blood_type,'allergies',p.allergies,'address',p.address,'emergencyContactName',p.emergency_contact_name,
    'emergencyContactPhone',p.emergency_contact_phone,'photoBucket',p.photo_bucket,'photoPath',p.photo_path,'photoThumbPath',p.photo_thumb_path,
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

-- v2_set_player_photo: accept an optional thumbnail path alongside the full photo
drop function if exists public.v2_set_player_photo(uuid, uuid, text);

create function public.v2_set_player_photo(organization_id uuid, player_id uuid, photo_path text, photo_thumb_path text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'app', 'private', 'storage'
as $function$
declare
  v_parts text[];
  v_thumb_parts text[];
  v_old_bucket text;
  v_old_path text;
  v_old_thumb text;
begin
  if not private.has_module_access($1, 'players', true) then
    raise exception 'Not authorized';
  end if;

  v_parts := string_to_array(coalesce($3, ''), '/');
  if coalesce(array_length(v_parts, 1), 0) <> 5
     or v_parts[1] <> 'organizations'
     or v_parts[2] <> $1::text
     or v_parts[3] <> 'players'
     or v_parts[4] <> $2::text
     or v_parts[5] !~* '^profile-[0-9]{10,16}\.(jpg|jpeg|png|webp)$'
  then
    raise exception 'Invalid photo path';
  end if;

  if not exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'tanneros-private'
      and o.name = $3
  ) then
    raise exception 'Photo upload not found';
  end if;

  if $4 is not null then
    v_thumb_parts := string_to_array($4, '/');
    if coalesce(array_length(v_thumb_parts, 1), 0) <> 5
       or v_thumb_parts[1] <> 'organizations'
       or v_thumb_parts[2] <> $1::text
       or v_thumb_parts[3] <> 'players'
       or v_thumb_parts[4] <> $2::text
       or v_thumb_parts[5] !~* '^profile-[0-9]{10,16}-thumb\.(jpg|jpeg|png|webp)$'
    then
      raise exception 'Invalid photo thumbnail path';
    end if;

    if not exists (
      select 1
      from storage.objects o
      where o.bucket_id = 'tanneros-private'
        and o.name = $4
    ) then
      raise exception 'Photo thumbnail upload not found';
    end if;
  end if;

  select p.photo_bucket, p.photo_path, p.photo_thumb_path
    into v_old_bucket, v_old_path, v_old_thumb
  from app.players p
  where p.id = $2
    and p.organization_id = $1
    and p.archived_at is null
  for update;

  if not found then
    raise exception 'Player not found';
  end if;

  update app.players p
     set photo_bucket = 'tanneros-private',
         photo_path = $3,
         photo_thumb_path = $4,
         updated_at = now()
   where p.id = $2
     and p.organization_id = $1;

  insert into app.domain_events(
    organization_id, event_type, aggregate_type, aggregate_id, payload, actor
  )
  values (
    $1,
    'PlayerPhotoUpdated',
    'player',
    $2,
    jsonb_build_object(
      'photoBucket', 'tanneros-private',
      'photoPath', $3,
      'photoThumbPath', $4,
      'previousPhotoBucket', v_old_bucket,
      'previousPhotoPath', v_old_path,
      'previousPhotoThumbPath', v_old_thumb
    ),
    coalesce((select auth.uid())::text, 'system')
  );

  return private.query_player_profile($1, $2);
end
$function$;

grant execute on function public.v2_set_player_photo(uuid, uuid, text, text) to authenticated, postgres, service_role;

notify pgrst, 'reload schema';
;
