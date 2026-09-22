create or replace function private.run_billing_automation()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,app,private
as $fn$
declare
  r record;
  v_local_date date;
  v_local_hour integer;
  v_period date;
  v_charges integer;
  v_late integer;
  v_results jsonb:='[]'::jsonb;
begin
  for r in
    select o.id,o.slug,o.timezone
    from public.organizations o
    join app.billing_policies bp on bp.organization_id=o.id
    where o.status='active'
  loop
    v_local_date := (now() at time zone coalesce(nullif(r.timezone,''),'UTC'))::date;
    v_local_hour := extract(hour from (now() at time zone coalesce(nullif(r.timezone,''),'UTC')))::integer;
    if v_local_hour <> 3 then
      continue;
    end if;
    v_period := date_trunc('month',v_local_date)::date;
    v_charges := 0;
    if extract(day from v_local_date)=1 then
      v_charges := app.generate_monthly_charges(r.id,v_period);
    end if;
    v_late := app.assess_late_fees(r.id,v_local_date);
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'organization',r.slug,
      'local_date',v_local_date,
      'charges_created',v_charges,
      'late_fees_created',v_late
    ));
  end loop;
  return v_results;
end;
$fn$;
revoke all on function private.run_billing_automation() from public,anon,authenticated;
grant execute on function private.run_billing_automation() to service_role;
comment on function private.run_billing_automation() is 'Hourly-safe multi-tenant runner; executes once during each organization local 03:00 hour. Monthly charges are idempotent and late fees are idempotent.';;
