create or replace function private.command_update_player_profile(
  p_organization_id uuid,p_player_id uuid,p_first_name text,p_last_name text,p_birth_date date,p_position text,p_dominant_foot text,p_jersey_number text,
  p_school text,p_blood_type text,p_allergies text,p_address text,p_emergency_contact_name text,p_emergency_contact_phone text,p_notes text,
  p_guardian_name text,p_guardian_phone text,p_guardian_email text,p_guardian_relationship text,p_can_pickup boolean,p_receives_billing boolean
) returns jsonb language plpgsql security definer set search_path='pg_catalog','app','private' as $$
declare v_current_guardian uuid; v_target_guardian uuid; v_phone text; v_emergency text; v_name text; v_email text; v_foot text;
begin
  if not private.has_module_access(p_organization_id,'players',true) then raise exception 'Not authorized'; end if;
  if not exists(select 1 from app.players where id=p_player_id and organization_id=p_organization_id and archived_at is null for update) then raise exception 'Player not found'; end if;
  if coalesce(length(trim(p_first_name)),0)<2 then raise exception 'Player first name required'; end if;
  if coalesce(length(trim(p_last_name)),0)<2 then raise exception 'Player last name required'; end if;
  if p_birth_date is null or p_birth_date>current_date then raise exception 'Valid birth date required'; end if;
  v_foot:=case lower(trim(coalesce(p_dominant_foot,''))) when '' then null when 'right' then 'right' when 'derecha' then 'right' when 'left' then 'left' when 'izquierda' then 'left' when 'both' then 'both' when 'ambas' then 'both' when 'por definir' then null else '__invalid__' end;
  if v_foot='__invalid__' then raise exception 'Invalid dominant foot'; end if;
  if length(trim(coalesce(p_jersey_number,'')))>4 then raise exception 'Invalid jersey number'; end if;
  v_emergency:=case when nullif(trim(coalesce(p_emergency_contact_phone,'')),'') is null then null else private.normalize_public_phone(p_emergency_contact_phone) end;
  update app.players set first_name=trim(p_first_name),last_name=trim(p_last_name),birth_date=p_birth_date,position=nullif(trim(coalesce(p_position,'')),''),dominant_foot=v_foot,jersey_number=nullif(trim(coalesce(p_jersey_number,'')),''),school=nullif(trim(coalesce(p_school,'')),''),blood_type=nullif(trim(coalesce(p_blood_type,'')),''),allergies=nullif(trim(coalesce(p_allergies,'')),''),address=nullif(trim(coalesce(p_address,'')),''),emergency_contact_name=nullif(trim(coalesce(p_emergency_contact_name,'')),''),emergency_contact_phone=v_emergency,notes=nullif(trim(coalesce(p_notes,'')),''),updated_at=now() where id=p_player_id and organization_id=p_organization_id;
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
  values(p_organization_id,'PlayerProfileUpdated','player',p_player_id,jsonb_build_object('guardianUpdated',v_name is not null,'emergencyPhone',v_emergency is not null,'dominantFoot',v_foot),(select auth.uid()));
  return private.query_player_profile(p_organization_id,p_player_id);
end $$;;
