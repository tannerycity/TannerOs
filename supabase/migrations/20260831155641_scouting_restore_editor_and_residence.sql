
alter table app.scouting_reports
  add column if not exists residence text;

drop function if exists public.v2_edit_scouting_report(
  uuid, uuid, text, timestamptz, text, text, text,
  numeric, numeric, numeric, numeric, text, text, text,
  text, text, timestamptz, date, text, text, text, numeric
);

create function public.v2_edit_scouting_report(
  organization_id uuid,
  report_id uuid,
  observed_name text,
  observed_at timestamptz,
  observed_location text,
  player_position text,
  category text,
  technical_score numeric,
  physical_score numeric,
  tactical_score numeric,
  mental_score numeric,
  star_quality text,
  verdict text,
  notes text,
  status text,
  interest_level text,
  next_action_at timestamptz,
  birth_date date,
  contact_phone text,
  guardian_name text,
  dominant_foot text,
  height_cm numeric,
  residence text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_before app.scouting_reports%rowtype;
  v_interest text;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated';
  end if;

  if not private.has_module_access($1, 'scouting', true) then
    raise exception 'Not authorized';
  end if;

  if nullif(btrim(coalesce($3, '')), '') is null then
    raise exception 'Observed name required';
  end if;

  if $4 is null then
    raise exception 'Observed date required';
  end if;

  if $15 not in ('open', 'closed') then
    raise exception 'Invalid scouting status';
  end if;

  v_interest := lower(nullif(btrim(coalesce($16, '')), ''));
  if v_interest is not null and v_interest not in ('alto', 'medio', 'bajo') then
    raise exception 'Invalid interest level';
  end if;

  if $8 is not null and ($8 < 0 or $8 > 10) then raise exception 'Technical score out of range'; end if;
  if $9 is not null and ($9 < 0 or $9 > 10) then raise exception 'Physical score out of range'; end if;
  if $10 is not null and ($10 < 0 or $10 > 10) then raise exception 'Tactical score out of range'; end if;
  if $11 is not null and ($11 < 0 or $11 > 10) then raise exception 'Mental score out of range'; end if;
  if $18 is not null and $18 > current_date then raise exception 'Birth date cannot be in the future'; end if;
  if $22 is not null and ($22 < 0 or $22 > 230) then raise exception 'Height out of range'; end if;

  select sr.*
    into v_before
  from app.scouting_reports sr
  where sr.organization_id = $1
    and sr.id = $2
  for update;

  if not found then
    raise exception 'Scouting report not found';
  end if;

  update app.scouting_reports sr
     set observed_name = nullif(btrim(coalesce($3, '')), ''),
         observed_at = $4,
         observed_location = nullif(btrim(coalesce($5, '')), ''),
         position = nullif(btrim(coalesce($6, '')), ''),
         category = nullif(btrim(coalesce($7, '')), ''),
         technical_score = $8,
         physical_score = $9,
         tactical_score = $10,
         mental_score = $11,
         star_quality = nullif(btrim(coalesce($12, '')), ''),
         verdict = nullif(btrim(coalesce($13, '')), ''),
         notes = nullif(btrim(coalesce($14, '')), ''),
         status = $15,
         interest_level = v_interest,
         next_action_at = $17,
         birth_date = $18,
         contact_phone = nullif(btrim(coalesce($19, '')), ''),
         guardian_name = nullif(btrim(coalesce($20, '')), ''),
         dominant_foot = nullif(btrim(coalesce($21, '')), ''),
         height_cm = $22,
         residence = nullif(btrim(coalesce($23, '')), ''),
         updated_at = now()
   where sr.organization_id = $1
     and sr.id = $2;

  insert into app.domain_events(
    organization_id, event_type, aggregate_type, aggregate_id, payload, actor
  )
  values (
    $1,
    'ScoutingReportFullyEdited',
    'scouting_report',
    $2,
    jsonb_build_object(
      'previousStatus', v_before.status,
      'status', $15,
      'previousInterestLevel', v_before.interest_level,
      'interestLevel', v_interest,
      'scope', 'operational_fields'
    ),
    (select auth.uid())::text
  );
end
$function$;

revoke all on function public.v2_edit_scouting_report(
  uuid, uuid, text, timestamptz, text, text, text,
  numeric, numeric, numeric, numeric, text, text, text,
  text, text, timestamptz, date, text, text, text, numeric, text
) from public, anon;
grant execute on function public.v2_edit_scouting_report(
  uuid, uuid, text, timestamptz, text, text, text,
  numeric, numeric, numeric, numeric, text, text, text,
  text, text, timestamptz, date, text, text, text, numeric, text
) to authenticated;

create or replace function public.v2_scouting_report_detail(
  organization_id uuid,
  report_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
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
    'residence', v_report.residence,
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
grant execute on function public.v2_scouting_report_detail(uuid, uuid) to authenticated;
;
