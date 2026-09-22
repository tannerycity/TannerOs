create or replace function private.query_player_account(p_organization_id uuid, p_player_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog','app','private'
as $$
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
    'allocated',cb.allocated_amount,'balance',cb.balance_due,'status',cb.computed_status,'dueDate',cb.due_date,
    'payerType',c.payer_type,'payerName',c.payer_name
  ) order by cb.billing_period,cb.created_at),'[]'::jsonb) into v_charges
  from app.charge_balances cb
  join app.charges c on c.id=cb.id and c.organization_id=cb.organization_id
  where cb.organization_id=p_organization_id and cb.player_id=p_player_id;

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
