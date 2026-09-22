create or replace function private.query_qa_integrity(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path='pg_catalog','information_schema','app','private' as $$
declare v_conflicts jsonb; v_rule_summary jsonb; v_direct_dml bigint; v_audit bigint; v_domain_events bigint; v_conflict_total bigint;
begin
  if not private.has_module_access(p_organization_id,'qa',false) then raise exception 'Not authorized'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('domain',domain,'type',conflict_type,'count',n) order by domain,conflict_type),'[]'::jsonb),coalesce(sum(n),0)
    into v_conflicts,v_conflict_total
  from (select domain,conflict_type,count(*) n from app.legacy_migration_conflicts where organization_id=p_organization_id group by domain,conflict_type) x;
  select jsonb_build_object(
    'total',count(*),
    'activeTested',count(*) filter(where status='active' and test_status='tested'),
    'pending',count(*) filter(where status='pending'),
    'superseded',count(*) filter(where status='superseded'),
    'activeUntested',count(*) filter(where status='active' and test_status<>'tested')
  ) into v_rule_summary from app.business_rule_catalog;
  select count(*) into v_direct_dml
  from information_schema.role_table_grants g
  where g.table_schema='app' and g.grantee='authenticated' and g.privilege_type in ('INSERT','UPDATE','DELETE');
  select count(*) into v_audit from app.audit_events where organization_id=p_organization_id;
  select count(*) into v_domain_events from app.domain_events where organization_id=p_organization_id;
  return jsonb_build_object(
    'rules',v_rule_summary,
    'migrationConflicts',v_conflicts,
    'migrationConflictTotal',v_conflict_total,
    'legacyAuditEvents',v_audit,
    'domainEvents',v_domain_events,
    'authenticatedDirectDmlGrants',v_direct_dml,
    'canonicalDmlLocked',(v_direct_dml=0)
  );
end $$;

create or replace function public.v2_qa_integrity(organization_id uuid)
returns jsonb language sql stable security definer set search_path='pg_catalog','private' as $$ select private.query_qa_integrity(organization_id) $$;
revoke all on function public.v2_qa_integrity(uuid) from public,anon;
grant execute on function public.v2_qa_integrity(uuid) to authenticated;

create or replace function private.query_player_account(p_organization_id uuid, p_player_id uuid)
returns jsonb language plpgsql stable security definer set search_path='pg_catalog','app','private' as $$
declare v_player jsonb; v_charges jsonb; v_payments jsonb; v_benefits jsonb; v_adjustments jsonb;
begin
  if not private.has_module_access(p_organization_id,'billing',false) then raise exception 'Not authorized'; end if;
  select jsonb_build_object(
    'id',p.id,'code',p.code,'firstName',p.first_name,'lastName',p.last_name,'status',p.status,
    'baseMonthlyFee',bp.base_monthly_fee,'billingStart',bp.billing_start,'billingStatus',bp.status,'needsReview',bp.needs_review,
    'isExempt',bp.is_exempt,'exemptionReason',bp.exemption_reason
  ) into v_player
  from app.players p left join app.billing_profiles bp on bp.player_id=p.id and bp.organization_id=p.organization_id
  where p.id=p_player_id and p.organization_id=p_organization_id;
  if v_player is null then raise exception 'Player not found'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',b.id,'type',b.benefit_type,'calculationType',b.calculation_type,'fixedAmount',b.fixed_amount,'percentage',b.percentage,
    'overrideAmount',b.override_amount,'fundingSourceName',b.funding_source_name,'startsOn',b.starts_on,'endsOn',b.ends_on,
    'active',b.active,'legacyLabel',b.legacy_label,'notes',b.notes
  ) order by b.active desc,b.starts_on desc nulls last,b.created_at desc),'[]'::jsonb) into v_benefits
  from app.player_benefits b where b.organization_id=p_organization_id and b.player_id=p_player_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',cb.id,'type',cb.charge_type,'period',cb.billing_period,'concept',cb.concept,'amount',cb.net_amount,
    'allocated',cb.allocated_amount,'balance',cb.balance_due,'status',cb.computed_status,'dueDate',cb.due_date
  ) order by cb.billing_period,cb.created_at),'[]'::jsonb) into v_charges
  from app.charge_balances cb where cb.organization_id=p_organization_id and cb.player_id=p_player_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'chargeId',a.charge_id,'type',a.adjustment_type,'direction',a.direction,'amount',a.amount,'reason',a.reason,
    'status',a.status,'createdAt',a.created_at
  ) order by a.created_at desc),'[]'::jsonb) into v_adjustments
  from app.charge_adjustments a join app.charges c on c.id=a.charge_id and c.organization_id=a.organization_id
  where a.organization_id=p_organization_id and c.player_id=p_player_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',pb.id,'date',pb.payment_date,'amount',pb.amount,'allocated',pb.allocated_amount,
    'credit',pb.available_credit,'heldCredit',pb.held_credit,'creditStatus',pb.credit_status,
    'method',pb.method,'reference',pb.reference,'payerType',pb.payer_type,'payerName',pb.payer_name,'status',pb.status
  ) order by pb.payment_date desc,pb.id),'[]'::jsonb) into v_payments
  from app.payment_balances pb where pb.organization_id=p_organization_id and pb.player_id=p_player_id;

  return jsonb_build_object('player',v_player,'benefits',v_benefits,'adjustments',v_adjustments,'charges',v_charges,'payments',v_payments);
end $$;;
