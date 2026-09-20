create or replace function private.query_qa_integrity(p_organization_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog','information_schema','app','private'
as $function$
declare
  v_conflicts jsonb;
  v_rule_summary jsonb;
  v_direct_dml bigint;
  v_audit bigint;
  v_domain_events bigint;
  v_conflict_total bigint;
  v_legacy_financial_drift bigint;
begin
  if not private.has_module_access(p_organization_id,'qa',false) then raise exception 'Not authorized'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('domain',domain,'type',conflict_type,'count',n) order by domain,conflict_type),'[]'::jsonb),coalesce(sum(n),0)
    into v_conflicts,v_conflict_total
  from (
    select domain,conflict_type,count(*) n
    from app.legacy_migration_conflicts
    where organization_id=p_organization_id
    group by domain,conflict_type
  ) x;

  select jsonb_build_object(
    'total',count(*),
    'activeTested',count(*) filter(where status='active' and test_status='tested'),
    'pending',count(*) filter(where status='pending'),
    'superseded',count(*) filter(where status='superseded'),
    'activeUntested',count(*) filter(where status='active' and test_status<>'tested')
  ) into v_rule_summary
  from app.business_rule_catalog;

  select count(*) into v_direct_dml
  from information_schema.role_table_grants g
  where g.table_schema='app'
    and g.grantee='authenticated'
    and g.privilege_type in ('INSERT','UPDATE','DELETE');

  select count(*) into v_audit from app.audit_events where organization_id=p_organization_id;
  select count(*) into v_domain_events from app.domain_events where organization_id=p_organization_id;

  select count(*) into v_legacy_financial_drift
  from public.payments p
  where p.organization_id=p_organization_id
    and not coalesce(p.deleted,false)
    and not exists (
      select 1 from app.payments ap
      where ap.organization_id=p.organization_id and ap.legacy_id=p.id
    )
    and not exists (
      select 1 from app.expenses ae
      where ae.organization_id=p.organization_id and ae.legacy_id=p.id
    );

  return jsonb_build_object(
    'rules',v_rule_summary,
    'migrationConflicts',v_conflicts,
    'migrationConflictTotal',v_conflict_total,
    'legacyAuditEvents',v_audit,
    'domainEvents',v_domain_events,
    'authenticatedDirectDmlGrants',v_direct_dml,
    'canonicalDmlLocked',(v_direct_dml=0),
    'legacyFinancialDrift',v_legacy_financial_drift,
    'legacyFinancialDriftClear',(v_legacy_financial_drift=0)
  );
end $function$;;
