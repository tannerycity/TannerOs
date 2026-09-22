create or replace function private.query_player_account(p_organization_id uuid, p_player_id uuid)
returns jsonb language plpgsql stable security definer set search_path='pg_catalog','app','private' as $$
declare v_player jsonb; v_charges jsonb; v_payments jsonb; v_benefits jsonb;
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
    'id',pb.id,'date',pb.payment_date,'amount',pb.amount,'allocated',pb.allocated_amount,
    'credit',pb.available_credit,'heldCredit',pb.held_credit,'creditStatus',pb.credit_status,
    'method',pb.method,'reference',pb.reference,'payerType',pb.payer_type,'payerName',pb.payer_name,'status',pb.status
  ) order by pb.payment_date desc,pb.id),'[]'::jsonb) into v_payments
  from app.payment_balances pb where pb.organization_id=p_organization_id and pb.player_id=p_player_id;

  return jsonb_build_object('player',v_player,'benefits',v_benefits,'charges',v_charges,'payments',v_payments);
end $$;

insert into app.business_rule_catalog(rule_key,domain,title,description,source,precedence,enforcement,status,test_status,source_ref,metadata)
values
('ORDER-006','commerce','Fulfillment details are editable only before production','Talla, nombre, número y observaciones de una pieza may be corrected through a Commerce command while the order is draft/pending/partial/paid; production and later states lock fulfillment edits.','approved_v2',100,'command','active','tested','private.command_update_order_item_fulfillment','{"qa":"pre-production update accepted; in_production update rejected; rollback clean"}'::jsonb),
('BUNDLE-001','commerce','Bundle public price is selected by Niño/Adulto tier','Legacy kit orders resolve priceKid for Niño and priceAdult for Adulto on the backend; browser-supplied prices are never trusted.','legacy',90,'command','active','tested','TannerOS v1 publicorder packages / private.public_create_bundle_order_enhanced','{"qa":"Kit Game kid total=1299"}'::jsonb),
('BUNDLE-002','commerce','V2 catalog availability governs bundle components','An active legacy bundle is orderable only when every referenced component resolves to an active, non-archived V2 product; legacy bundle activation cannot silently reactivate archived catalog products.','approved_v2',100,'command','active','tested','private.public_offerings / private.public_create_bundle_order_enhanced','{"qa":"Kit Game available; Training and Complete blocked by archived components"}'::jsonb)
on conflict(rule_key) do update set domain=excluded.domain,title=excluded.title,description=excluded.description,source=excluded.source,precedence=excluded.precedence,enforcement=excluded.enforcement,status=excluded.status,test_status=excluded.test_status,source_ref=excluded.source_ref,metadata=excluded.metadata,updated_at=now();;
