create or replace function private.query_player_profile(p_organization_id uuid, p_player_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare v_player jsonb; v_guardians jsonb; v_enrollment jsonb;
begin
  if not private.has_module_access(p_organization_id,'players',false) then raise exception 'Not authorized'; end if;
  select jsonb_build_object(
    'id',p.id,'code',p.code,'firstName',p.first_name,'lastName',p.last_name,'birthDate',p.birth_date,'status',p.status,
    'category',p.category,'position',p.position,'dominantFoot',p.dominant_foot,'jerseyNumber',p.jersey_number,'school',p.school,
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
$function$;;
