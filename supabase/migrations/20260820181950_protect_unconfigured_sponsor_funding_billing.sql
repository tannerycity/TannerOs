update app.billing_profiles bp
set needs_review=true,
    review_reason='Patrocinio activo pendiente de configurar',
    updated_at=now()
where bp.organization_id='3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8'
  and exists (
    select 1
    from app.player_benefits b
    join app.players p on p.id=b.player_id and p.organization_id=b.organization_id
    where b.organization_id=bp.organization_id
      and b.player_id=bp.player_id
      and p.status='active'
      and p.archived_at is null
      and b.benefit_type='sponsor_funded'
      and b.active=true
      and b.funding_configured_at is null
  );

create or replace function app.generate_monthly_charges(p_organization_id uuid, p_period date)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog','app','public'
as $function$
declare
  v_period date:=date_trunc('month',p_period)::date;
  v_policy app.billing_policies%rowtype;
  v_count integer:=0;
  r record;
  v_benefit app.player_benefits%rowtype;
  v_total numeric;
  v_sponsor numeric;
  v_family numeric;
  v_start date;
begin
  select * into v_policy from app.billing_policies where organization_id=p_organization_id;
  if not found then raise exception 'Billing policy not configured'; end if;
  if v_period<date_trunc('month',v_policy.effective_from)::date then return 0; end if;

  for r in
    select bp.*,p.id as pid
    from app.billing_profiles bp
    join app.players p on p.id=bp.player_id and p.organization_id=bp.organization_id
    where bp.organization_id=p_organization_id
      and bp.status='active'
      and p.status='active'
      and p.archived_at is null
      and bp.needs_review=false
      and bp.base_monthly_fee>0
      and date_trunc('month',bp.billing_start)::date<=v_period
      and not exists (
        select 1
        from app.player_benefits pending
        where pending.organization_id=bp.organization_id
          and pending.player_id=bp.player_id
          and pending.benefit_type='sponsor_funded'
          and pending.active=true
          and pending.funding_configured_at is null
          and coalesce(pending.starts_on,v_period)<=(v_period+interval '1 month - 1 day')::date
          and (pending.ends_on is null or pending.ends_on>=v_period)
      )
  loop
    v_total:=app.prorated_monthly_fee(r.base_monthly_fee,r.billing_start,v_period,v_policy.proration_method);
    v_sponsor:=0;
    v_benefit:=null;

    select b.* into v_benefit
    from app.player_benefits b
    where b.organization_id=p_organization_id
      and b.player_id=r.pid
      and b.benefit_type='sponsor_funded'
      and b.active=true
      and b.funding_configured_at is not null
      and b.calculation_type in ('fixed_amount','percentage')
      and b.starts_on<=(v_period+interval '1 month - 1 day')::date
      and (b.ends_on is null or b.ends_on>=v_period)
    order by b.priority desc,b.starts_on desc,b.created_at desc
    limit 1;

    if found then
      if v_benefit.calculation_type='percentage' then
        v_sponsor:=round(v_total*least(100,greatest(0,coalesce(v_benefit.percentage,0)))/100.0,2);
      else
        v_start:=greatest(r.billing_start,coalesce(v_benefit.starts_on,r.billing_start));
        v_sponsor:=app.prorated_monthly_fee(coalesce(v_benefit.fixed_amount,0),v_start,v_period,v_policy.proration_method);
      end if;
      v_sponsor:=least(v_total,greatest(0,v_sponsor));
    end if;

    v_family:=greatest(0,v_total-v_sponsor);
    if v_family>0 then
      insert into app.charges(organization_id,player_id,billing_profile_id,charge_type,billing_period,concept,amount,due_date,status,source,late_fee_eligible,idempotency_key,posted_at,payer_type,payer_name,player_benefit_id)
      values(p_organization_id,r.pid,r.id,'monthly_fee',v_period,'Mensualidad '||to_char(v_period,'YYYY-MM'),v_family,app.month_due_date(v_period,v_policy.due_day),'posted','billing_engine',case when date_trunc('month',r.billing_start)::date=v_period then v_policy.first_month_late_fee_enabled else true end,'monthly-family:'||r.pid::text||':'||to_char(v_period,'YYYY-MM'),now(),'guardian',null,case when v_benefit.id is null then null else v_benefit.id end)
      on conflict do nothing;
      if found then v_count:=v_count+1; end if;
    end if;

    if v_sponsor>0 then
      insert into app.charges(organization_id,player_id,billing_profile_id,charge_type,billing_period,concept,amount,due_date,status,source,late_fee_eligible,idempotency_key,posted_at,payer_type,payer_name,player_benefit_id)
      values(p_organization_id,r.pid,r.id,'monthly_fee_sponsor',v_period,'Mensualidad patrocinada · '||coalesce(v_benefit.funding_source_name,'Sponsor')||' · '||to_char(v_period,'YYYY-MM'),v_sponsor,app.month_due_date(v_period,v_policy.due_day),'posted','billing_engine',false,'monthly-sponsor:'||r.pid::text||':'||v_benefit.id::text||':'||to_char(v_period,'YYYY-MM'),now(),'sponsor',v_benefit.funding_source_name,v_benefit.id)
      on conflict do nothing;
      if found then v_count:=v_count+1; end if;
    end if;
  end loop;
  return v_count;
end
$function$;

create or replace function private.command_configure_sponsor_funding(p_organization_id uuid, p_player_id uuid, p_benefit_id uuid, p_funding_source_name text, p_monthly_total numeric, p_funding_mode text, p_sponsor_value numeric, p_starts_on date, p_ends_on date, p_notes text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','app','private'
as $function$
declare
  v_benefit uuid;
  v_actor uuid:=(select auth.uid());
  v_mode text:=lower(trim(coalesce(p_funding_mode,'')));
begin
  if not private.has_financial_config_access(p_organization_id) then raise exception 'Financial configuration requires Presidencia or Contabilidad'; end if;
  if p_monthly_total is null or p_monthly_total<0 then raise exception 'Monthly total must be zero or greater'; end if;
  if v_mode not in ('fixed_amount','percentage') then raise exception 'Funding mode must be fixed_amount or percentage'; end if;
  if p_sponsor_value is null or p_sponsor_value<0 then raise exception 'Sponsor value must be zero or greater'; end if;
  if v_mode='fixed_amount' and p_sponsor_value>p_monthly_total then raise exception 'Sponsor amount cannot exceed monthly total'; end if;
  if v_mode='percentage' and p_sponsor_value>100 then raise exception 'Sponsor percentage cannot exceed 100'; end if;
  if nullif(trim(coalesce(p_funding_source_name,'')),'') is null then raise exception 'Funding source required'; end if;
  if p_ends_on is not null and p_ends_on<coalesce(p_starts_on,current_date) then raise exception 'Benefit end cannot precede start'; end if;
  if not exists(select 1 from app.players p where p.id=p_player_id and p.organization_id=p_organization_id and p.archived_at is null) then raise exception 'Player not found'; end if;

  update app.billing_profiles
  set base_monthly_fee=p_monthly_total,
      needs_review=case when review_reason='Patrocinio activo pendiente de configurar' then false else needs_review end,
      review_reason=case when review_reason='Patrocinio activo pendiente de configurar' then null else review_reason end,
      updated_at=now()
  where organization_id=p_organization_id and player_id=p_player_id;
  if not found then raise exception 'Billing profile not found'; end if;

  if p_benefit_id is null then
    insert into app.player_benefits(organization_id,player_id,benefit_type,calculation_type,fixed_amount,percentage,override_amount,funding_source_name,starts_on,ends_on,active,priority,notes,legacy_label,funding_configured_at,funding_configured_by_user_id,created_at,updated_at)
    values(p_organization_id,p_player_id,'sponsor_funded',v_mode,case when v_mode='fixed_amount' then p_sponsor_value else null end,case when v_mode='percentage' then p_sponsor_value else null end,null,trim(p_funding_source_name),coalesce(p_starts_on,current_date),p_ends_on,true,100,nullif(trim(coalesce(p_notes,'')),''),'Configurable sponsor funding',now(),v_actor,now(),now())
    returning id into v_benefit;
  else
    update app.player_benefits
    set calculation_type=v_mode,
        fixed_amount=case when v_mode='fixed_amount' then p_sponsor_value else null end,
        percentage=case when v_mode='percentage' then p_sponsor_value else null end,
        override_amount=null,
        funding_source_name=trim(p_funding_source_name),
        starts_on=coalesce(p_starts_on,current_date),
        ends_on=p_ends_on,
        active=true,
        notes=nullif(trim(coalesce(p_notes,'')),''),
        funding_configured_at=now(),
        funding_configured_by_user_id=v_actor,
        updated_at=now()
    where id=p_benefit_id and organization_id=p_organization_id and player_id=p_player_id and benefit_type='sponsor_funded'
    returning id into v_benefit;
    if v_benefit is null then raise exception 'Sponsor benefit not found'; end if;
  end if;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values(p_organization_id,'SponsorFundingConfigured','player_benefit',v_benefit,jsonb_build_object('playerId',p_player_id,'monthlyTotal',p_monthly_total,'fundingSource',trim(p_funding_source_name),'mode',v_mode,'sponsorValue',p_sponsor_value,'startsOn',coalesce(p_starts_on,current_date),'endsOn',p_ends_on),v_actor);

  return jsonb_build_object('benefitId',v_benefit,'playerId',p_player_id,'monthlyTotal',p_monthly_total,'fundingSource',trim(p_funding_source_name),'mode',v_mode,'sponsorValue',p_sponsor_value);
end
$function$;

update app.business_rule_catalog
set description='Sponsor-funded player fees such as Curtibrother are configurable per player as a fixed amount or percentage of the contracted monthly total. Canonical charges split sponsor vs family responsibility. If an active sponsor-funded benefit has not been configured yet, monthly billing is blocked for that player instead of assuming the family owes the full amount.',
    enforcement='command',
    status='active',
    test_status='tested',
    updated_at=now()
where rule_key='BENEFIT-SPONSOR-001';;
