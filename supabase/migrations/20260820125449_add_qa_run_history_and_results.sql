create table if not exists app.qa_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  suite text not null check (suite in ('smoke','critical','full')),
  status text not null check (status in ('passed','failed','warning')),
  started_at timestamptz not null default now(),
  finished_at timestamptz not null default now(),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  total_tests integer not null default 0 check (total_tests >= 0),
  passed_tests integer not null default 0 check (passed_tests >= 0),
  failed_tests integer not null default 0 check (failed_tests >= 0),
  warning_tests integer not null default 0 check (warning_tests >= 0),
  triggered_by uuid not null,
  environment text,
  user_agent text,
  app_version text,
  created_at timestamptz not null default now()
);

create table if not exists app.qa_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references app.qa_runs(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  test_key text not null,
  test_name text not null,
  category text not null,
  status text not null check (status in ('passed','failed','warning','skipped')),
  detail text,
  duration_ms integer not null default 0 check (duration_ms >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists qa_runs_org_started_idx on app.qa_runs(organization_id, started_at desc);
create index if not exists qa_results_run_idx on app.qa_results(run_id, created_at);
create index if not exists qa_results_org_status_idx on app.qa_results(organization_id, status, created_at desc);

alter table app.qa_runs enable row level security;
alter table app.qa_results enable row level security;

drop policy if exists qa_runs_service_role_all on app.qa_runs;
create policy qa_runs_service_role_all on app.qa_runs for all to service_role using (true) with check (true);
drop policy if exists qa_results_service_role_all on app.qa_results;
create policy qa_results_service_role_all on app.qa_results for all to service_role using (true) with check (true);

revoke all on app.qa_runs from public, anon, authenticated;
revoke all on app.qa_results from public, anon, authenticated;
grant all on app.qa_runs to service_role;
grant all on app.qa_results to service_role;

create or replace function private.command_record_qa_run(
  p_organization_id uuid,
  p_suite text,
  p_summary jsonb,
  p_results jsonb,
  p_environment text default null,
  p_user_agent text default null,
  p_app_version text default null
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, app, private
as $$
declare
  v_user uuid := auth.uid();
  v_run uuid;
  v_status text;
  v_started timestamptz;
  v_finished timestamptz;
  v_row jsonb;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not private.has_module_access(p_organization_id,'qa',true) then raise exception 'Not authorized'; end if;
  if p_suite not in ('smoke','critical','full') then raise exception 'Invalid QA suite'; end if;
  if jsonb_typeof(coalesce(p_results,'[]'::jsonb)) <> 'array' then raise exception 'QA results must be an array'; end if;

  v_status := coalesce(nullif(p_summary->>'status',''),'failed');
  if v_status not in ('passed','failed','warning') then raise exception 'Invalid QA status'; end if;
  v_started := coalesce((p_summary->>'startedAt')::timestamptz, now());
  v_finished := coalesce((p_summary->>'finishedAt')::timestamptz, now());

  insert into app.qa_runs(
    organization_id,suite,status,started_at,finished_at,duration_ms,total_tests,passed_tests,failed_tests,warning_tests,triggered_by,environment,user_agent,app_version
  ) values (
    p_organization_id,p_suite,v_status,v_started,v_finished,
    greatest(coalesce((p_summary->>'durationMs')::integer,0),0),
    greatest(coalesce((p_summary->>'total')::integer,0),0),
    greatest(coalesce((p_summary->>'passed')::integer,0),0),
    greatest(coalesce((p_summary->>'failed')::integer,0),0),
    greatest(coalesce((p_summary->>'warnings')::integer,0),0),
    v_user,left(p_environment,80),left(p_user_agent,500),left(p_app_version,80)
  ) returning id into v_run;

  for v_row in select value from jsonb_array_elements(coalesce(p_results,'[]'::jsonb)) loop
    insert into app.qa_results(run_id,organization_id,test_key,test_name,category,status,detail,duration_ms,metadata)
    values (
      v_run,p_organization_id,
      left(coalesce(v_row->>'key','unknown'),180),
      left(coalesce(v_row->>'name','Prueba sin nombre'),240),
      left(coalesce(v_row->>'category','general'),80),
      case when v_row->>'status' in ('passed','failed','warning','skipped') then v_row->>'status' else 'failed' end,
      left(v_row->>'detail',3000),
      greatest(coalesce((v_row->>'durationMs')::integer,0),0),
      coalesce(v_row->'metadata','{}'::jsonb)
    );
  end loop;
  return v_run;
end $$;

create or replace function private.query_qa_runs(p_organization_id uuid, p_limit integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, app, private
as $$
declare v_rows jsonb;
begin
  if not private.has_module_access(p_organization_id,'qa',false) then raise exception 'Not authorized'; end if;
  select coalesce(jsonb_agg(x.payload order by x.started_at desc),'[]'::jsonb)
    into v_rows
  from (
    select r.started_at,
      jsonb_build_object(
        'id',r.id,'suite',r.suite,'status',r.status,'startedAt',r.started_at,'finishedAt',r.finished_at,
        'durationMs',r.duration_ms,'total',r.total_tests,'passed',r.passed_tests,'failed',r.failed_tests,'warnings',r.warning_tests,
        'triggeredBy',r.triggered_by,'environment',r.environment,'appVersion',r.app_version,
        'failures',coalesce((
          select jsonb_agg(jsonb_build_object('key',q.test_key,'name',q.test_name,'category',q.category,'status',q.status,'detail',q.detail,'durationMs',q.duration_ms) order by q.created_at)
          from app.qa_results q where q.run_id=r.id and q.status in ('failed','warning')
        ),'[]'::jsonb)
      ) payload
    from app.qa_runs r
    where r.organization_id=p_organization_id
    order by r.started_at desc
    limit greatest(1,least(coalesce(p_limit,20),50))
  ) x;
  return v_rows;
end $$;

create or replace function public.v2_qa_record_run(
  organization_id uuid,
  suite text,
  summary jsonb,
  results jsonb,
  environment text default null,
  user_agent text default null,
  app_version text default null
) returns uuid
language sql
security definer
set search_path = pg_catalog, private
as $$ select private.command_record_qa_run(organization_id,suite,summary,results,environment,user_agent,app_version) $$;

create or replace function public.v2_qa_runs(organization_id uuid, limit_count integer default 20)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private
as $$ select private.query_qa_runs(organization_id,limit_count) $$;

revoke all on function public.v2_qa_record_run(uuid,text,jsonb,jsonb,text,text,text) from public, anon;
revoke all on function public.v2_qa_runs(uuid,integer) from public, anon;
grant execute on function public.v2_qa_record_run(uuid,text,jsonb,jsonb,text,text,text) to authenticated;
grant execute on function public.v2_qa_runs(uuid,integer) to authenticated;;
