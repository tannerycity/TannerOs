
alter table app.scouting_reports add column if not exists dominant_foot text;
alter table app.scouting_reports add column if not exists height_cm numeric;

drop function if exists public.v2_create_scouting_report(uuid,uuid,text,timestamptz,text,text,text,numeric,numeric,numeric,numeric,text,text,text);
drop function if exists private.command_create_scouting_report(uuid,uuid,text,timestamptz,text,text,text,numeric,numeric,numeric,numeric,text,text,text);

create function private.command_create_scouting_report(
  p_organization_id uuid, p_prospect_id uuid, p_observed_name text, p_observed_at timestamptz, p_observed_location text,
  p_player_position text, p_category text, p_technical_score numeric, p_physical_score numeric, p_tactical_score numeric,
  p_mental_score numeric, p_star_quality text, p_verdict text, p_notes text,
  p_birth_date date default null, p_contact_phone text default null, p_guardian_name text default null,
  p_dominant_foot text default null, p_height_cm numeric default null)
returns uuid language plpgsql security definer set search_path to 'pg_catalog','app','private'
as $function$
declare v_id uuid; v_name text;
begin
  if not private.has_module_access(p_organization_id,'scouting',true) then raise exception 'Not authorized'; end if;
  if p_prospect_id is not null then
    select trim(concat_ws(' ',first_name,last_name)) into v_name from app.prospects where id=p_prospect_id and organization_id=p_organization_id and archived_at is null;
    if v_name is null then raise exception 'Prospect not found'; end if;
  else
    v_name:=nullif(trim(coalesce(p_observed_name,'')),'');
  end if;
  if v_name is null then raise exception 'Observed name required'; end if;
  if p_technical_score is not null and (p_technical_score<0 or p_technical_score>10) then raise exception 'Technical score out of range'; end if;
  if p_physical_score is not null and (p_physical_score<0 or p_physical_score>10) then raise exception 'Physical score out of range'; end if;
  if p_tactical_score is not null and (p_tactical_score<0 or p_tactical_score>10) then raise exception 'Tactical score out of range'; end if;
  if p_mental_score is not null and (p_mental_score<0 or p_mental_score>10) then raise exception 'Mental score out of range'; end if;
  insert into app.scouting_reports(organization_id,prospect_id,observed_name,observed_at,observed_location,detected_by_user_id,position,category,technical_score,physical_score,tactical_score,mental_score,star_quality,verdict,notes,status,birth_date,contact_phone,guardian_name,dominant_foot,height_cm,created_at,updated_at)
  values(p_organization_id,p_prospect_id,v_name,coalesce(p_observed_at,now()),nullif(trim(coalesce(p_observed_location,'')),''),(select auth.uid()),nullif(trim(coalesce(p_player_position,'')),''),nullif(trim(coalesce(p_category,'')),''),p_technical_score,p_physical_score,p_tactical_score,p_mental_score,nullif(trim(coalesce(p_star_quality,'')),''),nullif(trim(coalesce(p_verdict,'')),''),nullif(trim(coalesce(p_notes,'')),''),'open',p_birth_date,nullif(trim(coalesce(p_contact_phone,'')),''),nullif(trim(coalesce(p_guardian_name,'')),''),nullif(trim(coalesce(p_dominant_foot,'')),''),p_height_cm,now(),now())
  returning id into v_id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,'ScoutingReportCreated','scouting_report',v_id,jsonb_build_object('prospect_id',p_prospect_id,'verdict',p_verdict),coalesce((select auth.uid())::text,'system'));
  return v_id;
end $function$;

create function public.v2_create_scouting_report(
  organization_id uuid, prospect_id uuid, observed_name text, observed_at timestamptz, observed_location text,
  player_position text, category text, technical_score numeric, physical_score numeric, tactical_score numeric,
  mental_score numeric, star_quality text, verdict text, notes text,
  birth_date date default null, contact_phone text default null, guardian_name text default null,
  dominant_foot text default null, height_cm numeric default null)
returns uuid language sql security definer set search_path to 'pg_catalog','public','private'
as $$ select private.command_create_scouting_report(organization_id,prospect_id,observed_name,observed_at,observed_location,player_position,category,technical_score,physical_score,tactical_score,mental_score,star_quality,verdict,notes,birth_date,contact_phone,guardian_name,dominant_foot,height_cm) $$;

revoke all on function public.v2_create_scouting_report(uuid,uuid,text,timestamptz,text,text,text,numeric,numeric,numeric,numeric,text,text,text,date,text,text,text,numeric) from public, anon;
grant execute on function public.v2_create_scouting_report(uuid,uuid,text,timestamptz,text,text,text,numeric,numeric,numeric,numeric,text,text,text,date,text,text,text,numeric) to authenticated;
;
