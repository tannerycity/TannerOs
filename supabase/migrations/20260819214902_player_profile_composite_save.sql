create or replace function private.command_save_player_profile(
  p_organization_id uuid,p_player_id uuid,p_first_name text,p_last_name text,p_birth_date date,p_position text,p_dominant_foot text,p_jersey_number text,
  p_school text,p_blood_type text,p_allergies text,p_address text,p_emergency_contact_name text,p_emergency_contact_phone text,p_notes text,
  p_guardian_name text,p_guardian_phone text,p_guardian_email text,p_guardian_relationship text,p_can_pickup boolean,p_receives_billing boolean,
  p_category_id uuid,p_category_effective_date date,p_category_notes text
) returns jsonb language plpgsql security definer set search_path='pg_catalog','private' as $$
declare v_before jsonb; v_current uuid;
begin
  v_before:=private.query_player_profile(p_organization_id,p_player_id);
  perform private.command_update_player_profile(p_organization_id,p_player_id,p_first_name,p_last_name,p_birth_date,p_position,p_dominant_foot,p_jersey_number,p_school,p_blood_type,p_allergies,p_address,p_emergency_contact_name,p_emergency_contact_phone,p_notes,p_guardian_name,p_guardian_phone,p_guardian_email,p_guardian_relationship,p_can_pickup,p_receives_billing);
  v_current:=nullif(v_before->'activeEnrollment'->>'categoryId','')::uuid;
  if p_category_id is not null and p_category_id is distinct from v_current then
    perform private.command_change_player_category(p_organization_id,p_player_id,p_category_id,coalesce(p_category_effective_date,current_date),p_category_notes);
  end if;
  return private.query_player_profile(p_organization_id,p_player_id);
end $$;
create or replace function public.v2_save_player_profile(organization_id uuid,player_id uuid,first_name text,last_name text,birth_date date,player_position text,dominant_foot text,jersey_number text,school text,blood_type text,allergies text,address text,emergency_contact_name text,emergency_contact_phone text,notes text,guardian_name text,guardian_phone text,guardian_email text,guardian_relationship text,can_pickup boolean,receives_billing boolean,category_id uuid,category_effective_date date,category_notes text)
returns jsonb language sql security definer set search_path='pg_catalog','private' as $$ select private.command_save_player_profile(organization_id,player_id,first_name,last_name,birth_date,player_position,dominant_foot,jersey_number,school,blood_type,allergies,address,emergency_contact_name,emergency_contact_phone,notes,guardian_name,guardian_phone,guardian_email,guardian_relationship,can_pickup,receives_billing,category_id,category_effective_date,category_notes) $$;
do $$ declare r record; begin for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='v2_save_player_profile' loop execute format('revoke all on function %s from public, anon',r.sig); execute format('grant execute on function %s to authenticated',r.sig); end loop; end $$;;
