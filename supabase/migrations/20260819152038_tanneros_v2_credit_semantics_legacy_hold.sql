create or replace view app.payment_balances as
select
  p.id,
  p.organization_id,
  p.player_id,
  p.amount,
  coalesce(a.allocated_amount,0::numeric) as allocated_amount,
  coalesce(r.refunded_amount,0::numeric) as refunded_amount,
  case
    when p.credit_status='available' then greatest(0::numeric,p.amount-coalesce(a.allocated_amount,0::numeric)-coalesce(r.refunded_amount,0::numeric))
    else 0::numeric
  end as available_credit,
  p.status,
  p.payment_date,
  p.method,
  p.reference,
  p.payer_type,
  p.payer_name,
  p.credit_status,
  case
    when p.credit_status='legacy_hold' then greatest(0::numeric,p.amount-coalesce(a.allocated_amount,0::numeric)-coalesce(r.refunded_amount,0::numeric))
    else 0::numeric
  end as held_credit
from app.payments p
left join lateral (
  select coalesce(sum(x.amount),0::numeric) as allocated_amount
  from app.payment_allocations x
  where x.payment_id=p.id and x.status='posted'
) a on true
left join lateral (
  select coalesce(sum(x.amount),0::numeric) as refunded_amount
  from app.refunds x
  where x.payment_id=p.id and x.status='posted'
) r on true;

create or replace function private.query_player_account(p_organization_id uuid, p_player_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path = pg_catalog, app, private
as $$
declare v_player jsonb; v_charges jsonb; v_payments jsonb;
begin
  if not private.has_module_access(p_organization_id,'billing',false) then raise exception 'Not authorized'; end if;
  select jsonb_build_object(
    'id',p.id,'code',p.code,'firstName',p.first_name,'lastName',p.last_name,'status',p.status,
    'baseMonthlyFee',bp.base_monthly_fee,'billingStart',bp.billing_start,'billingStatus',bp.status,'needsReview',bp.needs_review
  ) into v_player
  from app.players p
  left join app.billing_profiles bp on bp.player_id=p.id and bp.organization_id=p.organization_id
  where p.id=p_player_id and p.organization_id=p_organization_id;
  if v_player is null then raise exception 'Player not found'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',cb.id,'type',cb.charge_type,'period',cb.billing_period,'concept',cb.concept,'amount',cb.net_amount,
    'allocated',cb.allocated_amount,'balance',cb.balance_due,'status',cb.computed_status,'dueDate',cb.due_date
  ) order by cb.billing_period,cb.created_at),'[]'::jsonb) into v_charges
  from app.charge_balances cb
  where cb.organization_id=p_organization_id and cb.player_id=p_player_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',pb.id,'date',pb.payment_date,'amount',pb.amount,'allocated',pb.allocated_amount,
    'credit',pb.available_credit,'heldCredit',pb.held_credit,'creditStatus',pb.credit_status,
    'method',pb.method,'reference',pb.reference,'payerType',pb.payer_type,'payerName',pb.payer_name,'status',pb.status
  ) order by pb.payment_date desc,pb.id),'[]'::jsonb) into v_payments
  from app.payment_balances pb
  where pb.organization_id=p_organization_id and pb.player_id=p_player_id;

  return jsonb_build_object('player',v_player,'charges',v_charges,'payments',v_payments);
end;
$$;

comment on view app.payment_balances is 'Derived payment balances. Only credit_status=available is spendable credit; legacy_hold remains separately visible for reconciliation.';;
