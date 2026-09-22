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
  v_legacy_player_status_drift bigint;
  v_legacy_operational_unmapped bigint;
  v_legacy_cutover_drift bigint;
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
  where g.table_schema='app' and g.grantee='authenticated' and g.privilege_type in ('INSERT','UPDATE','DELETE');

  select count(*) into v_audit from app.audit_events where organization_id=p_organization_id;
  select count(*) into v_domain_events from app.domain_events where organization_id=p_organization_id;

  select count(*) into v_legacy_financial_drift
  from public.payments p
  where p.organization_id=p_organization_id and not coalesce(p.deleted,false)
    and not exists (select 1 from app.payments ap where ap.organization_id=p.organization_id and ap.legacy_id=p.id)
    and not exists (select 1 from app.expenses ae where ae.organization_id=p.organization_id and ae.legacy_id=p.id);

  select count(*) into v_legacy_player_status_drift
  from public.players lp
  join app.players p on p.organization_id=lp.organization_id and p.legacy_id=lp.id
  where lp.organization_id=p_organization_id and not coalesce(lp.deleted,false)
    and coalesce(p.archived_at is not null,false)=false
    and p.status <> case lp.status when 'Activo' then 'active' when 'Baja' then 'withdrawn' when 'Inactivo' then 'inactive' else '__unknown_legacy_status__' end;

  select coalesce(sum(n),0) into v_legacy_operational_unmapped
  from (
    select count(*) n from public.players l where l.organization_id=p_organization_id and not coalesce(l.deleted,false) and not exists(select 1 from app.players a where a.organization_id=l.organization_id and a.legacy_id=l.id)
    union all select count(*) from public.prospects l where l.organization_id=p_organization_id and not coalesce(l.deleted,false) and not exists(select 1 from app.prospects a where a.organization_id=l.organization_id and a.legacy_id=l.id)
    union all select count(*) from public.scouting l where l.organization_id=p_organization_id and not coalesce(l.deleted,false) and not exists(select 1 from app.scouting_reports a where a.organization_id=l.organization_id and a.legacy_id=l.id)
    union all select count(*) from public.academias l where l.organization_id=p_organization_id and not coalesce(l.deleted,false) and not exists(select 1 from app.academies a where a.organization_id=l.organization_id and a.legacy_id=l.id)
    union all select count(*) from public.academia_inscripciones l where l.organization_id=p_organization_id and not coalesce(l.deleted,false) and not exists(select 1 from app.academy_enrollments a where a.organization_id=l.organization_id and a.legacy_id=l.id)
    union all select count(*) from public.attendance l where l.organization_id=p_organization_id and not coalesce(l.deleted,false) and not exists(select 1 from app.attendance_records a where a.organization_id=l.organization_id and a.legacy_id=l.id) and not exists(select 1 from app.legacy_migration_conflicts c where c.organization_id=l.organization_id and c.domain='attendance' and c.legacy_id=l.id)
    union all select count(*) from public.equipment l where l.organization_id=p_organization_id and not coalesce(l.deleted,false) and not exists(select 1 from app.equipment_items a where a.organization_id=l.organization_id and a.legacy_id=l.id)
    union all select count(*) from public.evaluations l where l.organization_id=p_organization_id and not coalesce(l.deleted,false) and not exists(select 1 from app.player_evaluations a where a.organization_id=l.organization_id and a.legacy_id=l.id)
    union all select count(*) from public.events l where l.organization_id=p_organization_id and not coalesce(l.deleted,false) and not exists(select 1 from app.club_events a where a.organization_id=l.organization_id and a.legacy_id=l.id)
    union all select count(*) from public.matches l where l.organization_id=p_organization_id and not coalesce(l.deleted,false) and not exists(select 1 from app.matches a where a.organization_id=l.organization_id and a.legacy_id=l.id)
    union all select count(*) from public.match_stats l where l.organization_id=p_organization_id and not coalesce(l.deleted,false) and not exists(select 1 from app.match_player_stats a where a.organization_id=l.organization_id and a.legacy_id=l.id)
    union all select count(*) from public.orders l where l.organization_id=p_organization_id and not coalesce(l.deleted,false) and not exists(select 1 from app.orders a where a.organization_id=l.organization_id and a.legacy_id=l.id)
    union all select count(*) from public.packages l where l.organization_id=p_organization_id and not coalesce(l.deleted,false) and not exists(select 1 from app.product_bundles a where a.organization_id=l.organization_id and a.legacy_id=l.id)
    union all select count(*) from public.player_notes l where l.organization_id=p_organization_id and not coalesce(l.deleted,false) and not exists(select 1 from app.player_notes a where a.organization_id=l.organization_id and a.legacy_id=l.id)
    union all select count(*) from public.products l where l.organization_id=p_organization_id and not coalesce(l.deleted,false) and not exists(select 1 from app.products a where a.organization_id=l.organization_id and a.legacy_id=l.id)
    union all select count(*) from public.sponsors l where l.organization_id=p_organization_id and not coalesce(l.deleted,false) and not exists(select 1 from app.sponsors a where a.organization_id=l.organization_id and a.legacy_id=l.id)
    union all select count(*) from public.assets l where l.organization_id=p_organization_id and not coalesce(l.deleted,false) and not exists(select 1 from app.sponsor_assets a where a.organization_id=l.organization_id and a.legacy_id=l.id)
    union all select count(*) from public.summer_courses l where l.organization_id=p_organization_id and not coalesce(l.deleted,false) and not exists(select 1 from app.programs a where a.organization_id=l.organization_id and a.legacy_id=l.id)
    union all select count(*) from public.summer_enrollments l where l.organization_id=p_organization_id and not coalesce(l.deleted,false) and not exists(select 1 from app.program_enrollments a where a.organization_id=l.organization_id and a.legacy_id=l.id)
  ) drift;

  v_legacy_cutover_drift:=coalesce(v_legacy_financial_drift,0)+coalesce(v_legacy_player_status_drift,0)+coalesce(v_legacy_operational_unmapped,0);

  return jsonb_build_object(
    'rules',v_rule_summary,
    'migrationConflicts',v_conflicts,
    'migrationConflictTotal',v_conflict_total,
    'legacyAuditEvents',v_audit,
    'domainEvents',v_domain_events,
    'authenticatedDirectDmlGrants',v_direct_dml,
    'canonicalDmlLocked',(v_direct_dml=0),
    'legacyFinancialDrift',v_legacy_financial_drift,
    'legacyFinancialDriftClear',(v_legacy_financial_drift=0),
    'legacyPlayerStatusDrift',v_legacy_player_status_drift,
    'legacyOperationalUnmapped',v_legacy_operational_unmapped,
    'legacyCutoverDrift',v_legacy_cutover_drift,
    'legacyCutoverDriftClear',(v_legacy_cutover_drift=0)
  );
end $function$;;
