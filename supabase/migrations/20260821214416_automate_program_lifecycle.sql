create or replace function private.maintain_program_lifecycle()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,app,private
as $$
declare
  v_activated integer:=0;
  v_completed integer:=0;
begin
  with changed as (
    update app.programs p
       set status='active', updated_at=now()
      from public.organizations o
     where o.id=p.organization_id
       and p.archived_at is null
       and p.status='published'
       and p.starts_on is not null
       and p.starts_on <= (now() at time zone coalesce(nullif(o.timezone,''),'UTC'))::date
       and (p.ends_on is null or p.ends_on >= (now() at time zone coalesce(nullif(o.timezone,''),'UTC'))::date)
    returning p.id
  ) select count(*) into v_activated from changed;

  with changed as (
    update app.programs p
       set status='completed', public_registration_enabled=false, updated_at=now()
      from public.organizations o
     where o.id=p.organization_id
       and p.archived_at is null
       and p.status in ('published','active')
       and p.ends_on is not null
       and p.ends_on < (now() at time zone coalesce(nullif(o.timezone,''),'UTC'))::date
    returning p.id
  ) select count(*) into v_completed from changed;

  return jsonb_build_object('activated',v_activated,'completed',v_completed,'ranAt',now());
end;
$$;
revoke all on function private.maintain_program_lifecycle() from public,anon,authenticated;

do $$
begin
  if exists(select 1 from cron.job where jobname='tanneros-program-lifecycle') then
    perform cron.unschedule((select jobid from cron.job where jobname='tanneros-program-lifecycle' limit 1));
  end if;
  perform cron.schedule('tanneros-program-lifecycle','27 * * * *','select private.maintain_program_lifecycle();');
end $$;

select private.maintain_program_lifecycle();;
