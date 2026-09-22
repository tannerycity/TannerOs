create unique index if not exists ux_player_guardians_one_primary on app.player_guardians(organization_id,player_id) where is_primary;

create or replace function private.query_player_profile(p_organization_id uuid,p_player_id uuid)
returns jsonb language plpgsql stable security definer set search_path='pg_catalog','app','private' as $$
declare v_player jsonb; v_guardians jsonb; v_enrollment jsonb;
begin
  if not private.has_module_access(p_organization_id,'players',false) then raise exception 'Not authorized'; end if;
  select jsonb_build_object(
    'id',p.id,'code',p.code,'firstName',p.first_name,'lastName',p.last_name,'birthDate',p.birth_date,'status',p.status,
    'category',p.category,'position',p.position,'dominantFoot',p.dominant_foot,'jerseyNumber',p.jersey_number,'school',p.school,
    'bloodType',p.blood_type,'allergies',p.allergies,'address',p.address,'emergencyContactName',p.emergency_contact_name,
    'emergencyContactPhone',p.emergency_contact_phone,'photoBucket',p.photo_bucket,'photoPath',p.photo_path,'notes',p.notes,
    'privacyNoticeVersion',p.privacy_notice_version,'dataConsent',p.data_consent,'dataConsentAt',p.data_consent_at,
    'imageConsent',p.image_consent,'imageConsentAt',p.image_consent_at,'joinedAt',p.joined_at,'withdrawnAt',p.withdrawn_at,
    'withdrawalReason',p.withdrawal_reason,'needsReview',p.needs_review,'reviewReason',p.review_reason
  ) into v_player from app.players p where p.id=p_player_id and p.organization_id=p_organization_id and p.archived_at is null;
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
end $$;

create or replace function private.command_update_player_profile(
  p_organization_id uuid,p_player_id uuid,p_first_name text,p_last_name text,p_birth_date date,p_position text,p_dominant_foot text,p_jersey_number text,
  p_school text,p_blood_type text,p_allergies text,p_address text,p_emergency_contact_name text,p_emergency_contact_phone text,p_notes text,
  p_guardian_name text,p_guardian_phone text,p_guardian_email text,p_guardian_relationship text,p_can_pickup boolean,p_receives_billing boolean
) returns jsonb language plpgsql security definer set search_path='pg_catalog','app','private' as $$
declare v_current_guardian uuid; v_target_guardian uuid; v_phone text; v_emergency text; v_name text; v_email text;
begin
  if not private.has_module_access(p_organization_id,'players',true) then raise exception 'Not authorized'; end if;
  if not exists(select 1 from app.players where id=p_player_id and organization_id=p_organization_id and archived_at is null for update) then raise exception 'Player not found'; end if;
  if coalesce(length(trim(p_first_name)),0)<2 then raise exception 'Player first name required'; end if;
  if coalesce(length(trim(p_last_name)),0)<2 then raise exception 'Player last name required'; end if;
  if p_birth_date is null or p_birth_date>current_date then raise exception 'Valid birth date required'; end if;
  if nullif(trim(coalesce(p_dominant_foot,'')),'') is not null and p_dominant_foot not in ('right','left','both') then raise exception 'Invalid dominant foot'; end if;
  if length(trim(coalesce(p_jersey_number,'')))>4 then raise exception 'Invalid jersey number'; end if;
  v_emergency:=case when nullif(trim(coalesce(p_emergency_contact_phone,'')),'') is null then null else private.normalize_public_phone(p_emergency_contact_phone) end;
  update app.players set first_name=trim(p_first_name),last_name=trim(p_last_name),birth_date=p_birth_date,position=nullif(trim(coalesce(p_position,'')),''),dominant_foot=nullif(trim(coalesce(p_dominant_foot,'')),''),jersey_number=nullif(trim(coalesce(p_jersey_number,'')),''),school=nullif(trim(coalesce(p_school,'')),''),blood_type=nullif(trim(coalesce(p_blood_type,'')),''),allergies=nullif(trim(coalesce(p_allergies,'')),''),address=nullif(trim(coalesce(p_address,'')),''),emergency_contact_name=nullif(trim(coalesce(p_emergency_contact_name,'')),''),emergency_contact_phone=v_emergency,notes=nullif(trim(coalesce(p_notes,'')),''),updated_at=now() where id=p_player_id and organization_id=p_organization_id;
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
  values(p_organization_id,'PlayerProfileUpdated','player',p_player_id,jsonb_build_object('guardianUpdated',v_name is not null,'emergencyPhone',v_emergency is not null),(select auth.uid()));
  return private.query_player_profile(p_organization_id,p_player_id);
end $$;

create or replace function public.v2_player_profile(organization_id uuid,player_id uuid) returns jsonb language sql stable security definer set search_path='pg_catalog','private' as $$ select private.query_player_profile(organization_id,player_id) $$;
create or replace function public.v2_update_player_profile(organization_id uuid,player_id uuid,first_name text,last_name text,birth_date date,player_position text,dominant_foot text,jersey_number text,school text,blood_type text,allergies text,address text,emergency_contact_name text,emergency_contact_phone text,notes text,guardian_name text,guardian_phone text,guardian_email text,guardian_relationship text,can_pickup boolean,receives_billing boolean) returns jsonb language sql security definer set search_path='pg_catalog','private' as $$ select private.command_update_player_profile(organization_id,player_id,first_name,last_name,birth_date,player_position,dominant_foot,jersey_number,school,blood_type,allergies,address,emergency_contact_name,emergency_contact_phone,notes,guardian_name,guardian_phone,guardian_email,guardian_relationship,can_pickup,receives_billing) $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('v2_player_profile','v2_update_player_profile') loop
    execute format('revoke all on function %s from public, anon',r.sig);
    execute format('grant execute on function %s to authenticated',r.sig);
  end loop;
end $$;;
