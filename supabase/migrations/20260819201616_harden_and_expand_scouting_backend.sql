alter table app.scouting_reports drop constraint if exists scouting_reports_status_check;
alter table app.scouting_reports add constraint scouting_reports_status_check check(status in ('open','closed'));

revoke insert,update,delete on app.scouting_reports from authenticated;
grant select on app.scouting_reports to authenticated;

create or replace function private.command_update_scouting_report(
  p_organization_id uuid,p_report_id uuid,p_status text,p_interest_level text,p_next_action_at timestamptz,p_verdict text,p_notes text
) returns void
language plpgsql security definer set search_path='pg_catalog','app','private'
as $$
declare v app.scouting_reports%rowtype;
begin
  if not private.has_module_access(p_organization_id,'scouting',true) then raise exception 'Not authorized'; end if;
  if p_status not in ('open','closed') then raise exception 'Invalid scouting status'; end if;
  select * into v from app.scouting_reports where id=p_report_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Scouting report not found'; end if;
  update app.scouting_reports
  set status=p_status,
      interest_level=nullif(trim(coalesce(p_interest_level,'')),''),
      next_action_at=p_next_action_at,
      verdict=nullif(trim(coalesce(p_verdict,'')),''),
      notes=nullif(trim(coalesce(p_notes,'')),''),
      updated_at=now()
  where id=p_report_id and organization_id=p_organization_id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,'ScoutingReportUpdated','scouting_report',p_report_id,jsonb_build_object('status',p_status,'interestLevel',nullif(trim(coalesce(p_interest_level,'')),''),'nextActionAt',p_next_action_at),coalesce((select auth.uid())::text,'system'));
end
$$;

-- Return type is being expanded, so recreate both dependent functions explicitly.
drop function if exists public.v2_scouting_reports(uuid,uuid);
drop function if exists private.query_scouting_reports(uuid,uuid);

create function private.query_scouting_reports(p_organization_id uuid,p_prospect_id uuid default null)
returns table(
  id uuid,prospect_id uuid,player_id uuid,observed_name text,observed_at timestamptz,observed_location text,player_position text,category text,
  technical_score numeric,physical_score numeric,tactical_score numeric,mental_score numeric,star_quality text,verdict text,notes text,status text,created_at timestamptz,
  contact_phone text,guardian_name text,birth_date date,interest_level text,next_action_at timestamptz,source text
)
language plpgsql stable security definer set search_path='pg_catalog','app','private'
as $$
begin
  if not private.has_module_access(p_organization_id,'scouting',false) then raise exception 'Not authorized'; end if;
  return query
  select s.id,s.prospect_id,s.player_id,s.observed_name,s.observed_at,s.observed_location,s.position,s.category,
         s.technical_score,s.physical_score,s.tactical_score,s.mental_score,s.star_quality,s.verdict,s.notes,s.status,s.created_at,
         coalesce(s.contact_phone,p.phone),coalesce(s.guardian_name,p.guardian_name),coalesce(s.birth_date,p.birth_date),s.interest_level,s.next_action_at,s.source
  from app.scouting_reports s
  left join app.prospects p on p.id=s.prospect_id and p.organization_id=s.organization_id
  where s.organization_id=p_organization_id and (p_prospect_id is null or s.prospect_id=p_prospect_id)
  order by s.observed_at desc,s.id;
end
$$;

create function public.v2_scouting_reports(organization_id uuid,prospect_id uuid default null)
returns table(
  id uuid,prospect_id uuid,player_id uuid,observed_name text,observed_at timestamptz,observed_location text,player_position text,category text,
  technical_score numeric,physical_score numeric,tactical_score numeric,mental_score numeric,star_quality text,verdict text,notes text,status text,created_at timestamptz,
  contact_phone text,guardian_name text,birth_date date,interest_level text,next_action_at timestamptz,source text
)
language sql stable security definer set search_path='pg_catalog','private'
as $$ select * from private.query_scouting_reports(organization_id,prospect_id) $$;

create or replace function public.v2_update_scouting_report(organization_id uuid,report_id uuid,status text,interest_level text,next_action_at timestamptz,verdict text,notes text)
returns void language sql security definer set search_path='pg_catalog','private'
as $$ select private.command_update_scouting_report(organization_id,report_id,status,interest_level,next_action_at,verdict,notes) $$;

revoke all on function public.v2_scouting_reports(uuid,uuid) from public,anon;
revoke all on function public.v2_update_scouting_report(uuid,uuid,text,text,timestamptz,text,text) from public,anon;
grant execute on function public.v2_scouting_reports(uuid,uuid) to authenticated;
grant execute on function public.v2_update_scouting_report(uuid,uuid,text,text,timestamptz,text,text) to authenticated;

insert into app.business_rule_catalog(rule_key,domain,title,description,source,precedence,enforcement,status,test_status,source_ref,metadata)
values
('SCOUT-001','scouting','Scouting is independent from captation','A scouting report may exist without a prospect and a scouting-only user does not need Captación access.','approved_v2',100,'command','active','pending','private.command_create_scouting_report / SEC-002','{}'),
('SCOUT-002','scouting','Scouting scores are 0 to 10','Technical, physical, tactical and mental scores are optional but must stay between 0 and 10 when supplied.','legacy',80,'command','active','pending','private.command_create_scouting_report','{}'),
('SCOUT-003','scouting','Scouting writes use authorized commands','Authenticated browsers cannot write scouting_reports directly; create/update goes through scouting-authorized commands.','platform_safety',100,'database','active','pending','table grants + scouting commands','{}'),
('SCOUT-004','scouting','Scouting lifecycle is explicit','Scouting reports are open or closed; follow-up can retain interest level, next action, verdict and notes.','approved_v2',100,'command','active','pending','private.command_update_scouting_report','{}')
on conflict(rule_key) do update set title=excluded.title,description=excluded.description,source=excluded.source,precedence=excluded.precedence,enforcement=excluded.enforcement,status=excluded.status,test_status=excluded.test_status,source_ref=excluded.source_ref,metadata=app.business_rule_catalog.metadata||excluded.metadata,updated_at=now();;
