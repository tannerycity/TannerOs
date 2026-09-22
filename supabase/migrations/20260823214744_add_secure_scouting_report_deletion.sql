create or replace function public.v2_delete_scouting_report(organization_id uuid, report_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_report app.scouting_reports%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated';
  end if;
  if not private.has_module_access($1, 'scouting', true) then
    raise exception 'Not authorized';
  end if;
  select * into v_report
  from app.scouting_reports sr
  where sr.organization_id=$1 and sr.id=$2
  for update;
  if not found then
    raise exception 'Scouting report not found';
  end if;
  insert into app.domain_events(
    organization_id,event_type,aggregate_type,aggregate_id,payload,actor
  ) values (
    $1,'ScoutingReportDeleted','scouting_report',$2,
    jsonb_build_object(
      'observedName',v_report.observed_name,
      'observedAt',v_report.observed_at,
      'playerId',v_report.player_id,
      'prospectId',v_report.prospect_id,
      'photoBucket',v_report.metadata->>'photoBucket',
      'photoPath',v_report.metadata->>'photoPath'
    ),
    (select auth.uid())::text
  );
  delete from app.scouting_reports sr
  where sr.organization_id=$1 and sr.id=$2;
  return jsonb_build_object(
    'deleted',true,
    'reportId',$2,
    'photoBucket',v_report.metadata->>'photoBucket',
    'photoPath',v_report.metadata->>'photoPath'
  );
end
$function$;
revoke all on function public.v2_delete_scouting_report(uuid,uuid) from public, anon;
grant execute on function public.v2_delete_scouting_report(uuid,uuid) to authenticated, service_role;;
