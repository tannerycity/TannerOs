create or replace function private.query_prospects(p_organization_id uuid, p_status text default null)
returns table(
  id uuid, first_name text, last_name text, birth_date date, phone text, email text,
  guardian_name text, source text, source_campaign text, category_interest text,
  status text, next_action_at timestamptz, notes text, created_at timestamptz,
  scouting_count bigint
)
language plpgsql stable security definer
set search_path=pg_catalog,app,private
as $$
begin
  if not private.has_any_module_access(p_organization_id,array['prospects','scouting'],false) then raise exception 'Not authorized'; end if;
  return query
  select p.id,p.first_name,p.last_name,p.birth_date,p.phone,p.email,p.guardian_name,p.source,p.source_campaign,
         p.category_interest,p.status,p.next_action_at,p.notes,p.created_at,
         (select count(*) from app.scouting_reports s where s.organization_id=p.organization_id and s.prospect_id=p.id) as scouting_count
  from app.prospects p
  where p.organization_id=p_organization_id and p.archived_at is null and (p_status is null or p.status=p_status)
  order by p.created_at desc,p.id;
end $$;

create or replace function private.command_upsert_prospect_followup(
  p_organization_id uuid,p_prospect_id uuid,p_status text,p_next_action_at timestamptz,p_notes text
) returns void
language plpgsql security definer
set search_path=pg_catalog,app,private
as $$
begin
  if not private.has_module_access(p_organization_id,'prospects',true) then raise exception 'Not authorized'; end if;
  if p_status not in ('new','contacted','trial','qualified','converted','lost') then raise exception 'Invalid prospect status'; end if;
  update app.prospects
     set status=p_status,next_action_at=p_next_action_at,notes=nullif(trim(coalesce(p_notes,'')),''),assigned_user_id=(select auth.uid()),updated_at=now()
   where id=p_prospect_id and organization_id=p_organization_id and archived_at is null;
  if not found then raise exception 'Prospect not found'; end if;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,'ProspectFollowupUpdated','prospect',p_prospect_id,
         jsonb_build_object('status',p_status,'next_action_at',p_next_action_at),coalesce((select auth.uid())::text,'system'));
end $$;

create or replace function private.query_scouting_reports(p_organization_id uuid,p_prospect_id uuid default null)
returns table(
  id uuid, prospect_id uuid, player_id uuid, observed_name text, observed_at timestamptz,
  observed_location text, player_position text, category text, technical_score numeric,
  physical_score numeric,tactical_score numeric,mental_score numeric,star_quality text,
  verdict text,notes text,status text,created_at timestamptz
)
language plpgsql stable security definer
set search_path=pg_catalog,app,private
as $$
begin
  if not private.has_module_access(p_organization_id,'scouting',false) then raise exception 'Not authorized'; end if;
  return query
  select s.id,s.prospect_id,s.player_id,s.observed_name,s.observed_at,s.observed_location,s.position,s.category,
         s.technical_score,s.physical_score,s.tactical_score,s.mental_score,s.star_quality,s.verdict,s.notes,s.status,s.created_at
  from app.scouting_reports s
  where s.organization_id=p_organization_id and (p_prospect_id is null or s.prospect_id=p_prospect_id)
  order by s.observed_at desc,s.id;
end $$;

create or replace function private.command_create_scouting_report(
  p_organization_id uuid,p_prospect_id uuid,p_observed_name text,p_observed_at timestamptz,
  p_observed_location text,p_player_position text,p_category text,p_technical_score numeric,
  p_physical_score numeric,p_tactical_score numeric,p_mental_score numeric,p_star_quality text,
  p_verdict text,p_notes text
) returns uuid
language plpgsql security definer
set search_path=pg_catalog,app,private
as $$
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
  insert into app.scouting_reports(organization_id,prospect_id,observed_name,observed_at,observed_location,detected_by_user_id,position,category,technical_score,physical_score,tactical_score,mental_score,star_quality,verdict,notes,status,created_at,updated_at)
  values(p_organization_id,p_prospect_id,v_name,coalesce(p_observed_at,now()),nullif(trim(coalesce(p_observed_location,'')),''),(select auth.uid()),nullif(trim(coalesce(p_player_position,'')),''),nullif(trim(coalesce(p_category,'')),''),p_technical_score,p_physical_score,p_tactical_score,p_mental_score,nullif(trim(coalesce(p_star_quality,'')),''),nullif(trim(coalesce(p_verdict,'')),''),nullif(trim(coalesce(p_notes,'')),''),'open',now(),now())
  returning id into v_id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,'ScoutingReportCreated','scouting_report',v_id,jsonb_build_object('prospect_id',p_prospect_id,'verdict',p_verdict),coalesce((select auth.uid())::text,'system'));
  return v_id;
end $$;

revoke all on function private.query_prospects(uuid,text) from public;
revoke all on function private.command_upsert_prospect_followup(uuid,uuid,text,timestamptz,text) from public;
revoke all on function private.query_scouting_reports(uuid,uuid) from public;
revoke all on function private.command_create_scouting_report(uuid,uuid,text,timestamptz,text,text,text,numeric,numeric,numeric,numeric,text,text,text) from public;
grant execute on function private.query_prospects(uuid,text) to authenticated,service_role;
grant execute on function private.command_upsert_prospect_followup(uuid,uuid,text,timestamptz,text) to authenticated,service_role;
grant execute on function private.query_scouting_reports(uuid,uuid) to authenticated,service_role;
grant execute on function private.command_create_scouting_report(uuid,uuid,text,timestamptz,text,text,text,numeric,numeric,numeric,numeric,text,text,text) to authenticated,service_role;

create or replace function public.v2_prospects(organization_id uuid,status_filter text default null)
returns table(id uuid,first_name text,last_name text,birth_date date,phone text,email text,guardian_name text,source text,source_campaign text,category_interest text,status text,next_action_at timestamptz,notes text,created_at timestamptz,scouting_count bigint)
language sql security definer set search_path=pg_catalog,private
as $$ select * from private.query_prospects(organization_id,status_filter) $$;

create or replace function public.v2_update_prospect_followup(organization_id uuid,prospect_id uuid,status text,next_action_at timestamptz,notes text)
returns void language sql security definer set search_path=pg_catalog,private
as $$ select private.command_upsert_prospect_followup(organization_id,prospect_id,status,next_action_at,notes) $$;

create or replace function public.v2_scouting_reports(organization_id uuid,prospect_id uuid default null)
returns table(id uuid,prospect_id uuid,player_id uuid,observed_name text,observed_at timestamptz,observed_location text,player_position text,category text,technical_score numeric,physical_score numeric,tactical_score numeric,mental_score numeric,star_quality text,verdict text,notes text,status text,created_at timestamptz)
language sql security definer set search_path=pg_catalog,private
as $$ select * from private.query_scouting_reports(organization_id,prospect_id) $$;

create or replace function public.v2_create_scouting_report(organization_id uuid,prospect_id uuid,observed_name text,observed_at timestamptz,observed_location text,player_position text,category text,technical_score numeric,physical_score numeric,tactical_score numeric,mental_score numeric,star_quality text,verdict text,notes text)
returns uuid language sql security definer set search_path=pg_catalog,private
as $$ select private.command_create_scouting_report(organization_id,prospect_id,observed_name,observed_at,observed_location,player_position,category,technical_score,physical_score,tactical_score,mental_score,star_quality,verdict,notes) $$;

grant execute on function public.v2_prospects(uuid,text) to authenticated;
grant execute on function public.v2_update_prospect_followup(uuid,uuid,text,timestamptz,text) to authenticated;
grant execute on function public.v2_scouting_reports(uuid,uuid) to authenticated;
grant execute on function public.v2_create_scouting_report(uuid,uuid,text,timestamptz,text,text,text,numeric,numeric,numeric,numeric,text,text,text) to authenticated;;
