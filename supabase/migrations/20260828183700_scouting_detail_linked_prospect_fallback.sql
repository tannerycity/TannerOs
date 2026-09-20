
create or replace function public.v2_scouting_report_detail(
  organization_id uuid,
  report_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_report app.scouting_reports%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated';
  end if;

  if not private.has_module_access($1, 'scouting', false) then
    raise exception 'Not authorized';
  end if;

  select sr.*
    into v_report
  from app.scouting_reports sr
  where sr.organization_id = $1
    and sr.id = $2;

  if not found then
    raise exception 'Scouting report not found';
  end if;

  return jsonb_build_object(
    'id', v_report.id,
    'prospect_id', v_report.prospect_id,
    'player_id', v_report.player_id,
    'observed_name', v_report.observed_name,
    'observed_at', v_report.observed_at,
    'observed_location', v_report.observed_location,
    'player_position', v_report.position,
    'category', v_report.category,
    'technical_score', v_report.technical_score,
    'physical_score', v_report.physical_score,
    'tactical_score', v_report.tactical_score,
    'mental_score', v_report.mental_score,
    'star_quality', v_report.star_quality,
    'verdict', v_report.verdict,
    'notes', v_report.notes,
    'status', v_report.status,
    'contact_phone', coalesce(v_report.contact_phone, (
      select p.phone from app.prospects p
      where p.id = v_report.prospect_id
        and p.organization_id = v_report.organization_id
    )),
    'guardian_name', coalesce(v_report.guardian_name, (
      select p.guardian_name from app.prospects p
      where p.id = v_report.prospect_id
        and p.organization_id = v_report.organization_id
    )),
    'birth_date', coalesce(v_report.birth_date, (
      select p.birth_date from app.prospects p
      where p.id = v_report.prospect_id
        and p.organization_id = v_report.organization_id
    )),
    'interest_level', v_report.interest_level,
    'next_action_at', v_report.next_action_at,
    'source', v_report.source,
    'dominant_foot', v_report.dominant_foot,
    'height_cm', v_report.height_cm,
    'created_at', v_report.created_at,
    'updated_at', v_report.updated_at
  );
end
$function$;

revoke all on function public.v2_scouting_report_detail(uuid, uuid) from public, anon;
grant execute on function public.v2_scouting_report_detail(uuid, uuid) to authenticated, service_role;
;
