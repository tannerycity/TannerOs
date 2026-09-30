-- Reingresos: la fecha de ingreso al club se respeta y las idas y vueltas
-- quedan a la vista
--
-- LO QUE SE DECIDIÓ: un Tanner que se va y regresa NO cambia su fecha de
-- ingreso al club. Esa es la primera vez que llegó y es la que da su
-- antigüedad. Cada baja y cada reingreso se agregan a su historia, con fecha,
-- motivo y quién lo hizo.
--
-- LO QUE YA HABÍA, verificado antes de escribir esto:
--
--   · app.withdraw_player y app.reactivate_player NO tocan joined_at. La
--     fecha ya se respetaba; nadie tenía que hacer nada para conservarla.
--   · Las dos dejan un evento (PlayerWithdrawn / PlayerReactivated) con la
--     fecha, el motivo y quién — en la columna 'actor' como texto: el uuid del
--     usuario, o 'cutover_legacy_…' para las bajas que trajo la migración.
--     Medido hoy: 13 bajas y 2 reingresos.
--
-- LO QUE FALTABA: verlo. El expediente ahora trae membershipHistory, del más
-- viejo al más nuevo, y la ficha lo enseña junto a las fechas de ingreso.
-- Sólo el expediente: el portal de Familias sigue recibiendo nada más su
-- fecha de ingreso.
--
-- REVERSIBLE: la versión anterior de query_player_profile está en a2.

create or replace function private.query_player_profile(p_organization_id uuid, p_player_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare v_player jsonb; v_guardians jsonb; v_enrollment jsonb; v_history jsonb; v_stints jsonb;
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
    'imageConsent',p.image_consent,'imageConsentAt',p.image_consent_at,'joinedAt',p.joined_at,'registeredAt',p.registered_at,
    'admissionOrigin',case
      when p.legacy_id is not null or pr.source = 'legacy_import' then 'migracion'
      when pr.source = 'public_form' then 'link'
      else 'alta' end,
    'withdrawnAt',p.withdrawn_at,
    'withdrawalReason',p.withdrawal_reason,'needsReview',p.needs_review,'reviewReason',p.review_reason
  ) into v_player
  from app.players p
  left join public.players lp on lp.organization_id=p.organization_id and lp.id=p.legacy_id
  left join app.prospects pr on pr.id=p.source_prospect_id and pr.organization_id=p.organization_id
  where p.id=p_player_id and p.organization_id=p_organization_id and p.archived_at is null;
  if v_player is null then raise exception 'Player not found'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'field',case e.event_type when 'PlayerJoinedAtChanged' then 'joinedAt' else 'registeredAt' end,
    'from',e.payload->>'from','to',e.payload->>'to','at',e.occurred_at,
    'by',coalesce(nullif(btrim(pf.display_name),''),'Usuario sin nombre')
  ) order by e.occurred_at desc),'[]'::jsonb) into v_history
  from (select * from app.domain_events
        where organization_id=p_organization_id and aggregate_type='player' and aggregate_id=p_player_id
          and event_type in ('PlayerJoinedAtChanged','PlayerRegisteredAtChanged')
        order by occurred_at desc limit 30) e
  left join public.profiles pf on pf.user_id=e.actor_user_id;
  -- Bajas y reingresos, del más viejo al más nuevo. El que la hizo viene en
  -- 'actor' como texto: el uuid del usuario o una marca como la del corte de
  -- migración ('cutover_legacy_…').
  select coalesce(jsonb_agg(jsonb_build_object(
    'kind',case e.event_type when 'PlayerWithdrawn' then 'baja' else 'reingreso' end,
    'date',coalesce(e.payload->>'withdrawn_at',e.payload->>'reactivated_at'),
    'reason',nullif(btrim(e.payload->>'reason'),''),
    'at',e.occurred_at,
    'by',coalesce(nullif(btrim(pf.display_name),''),
                  case when e.actor like 'cutover%' then 'Migración' else 'Sistema' end)
  ) order by e.occurred_at),'[]'::jsonb) into v_stints
  from app.domain_events e
  left join public.profiles pf on pf.user_id=coalesce(e.actor_user_id,
    case when e.actor ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then e.actor::uuid end)
  where e.organization_id=p_organization_id and e.aggregate_type='player' and e.aggregate_id=p_player_id
    and e.event_type in ('PlayerWithdrawn','PlayerReactivated');

  v_player:=v_player||jsonb_build_object('admissionHistory',v_history,'membershipHistory',v_stints);

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
