
-- 1. New columns on app.sponsors
alter table app.sponsors
  add column if not exists stage_changed_at timestamptz,
  add column if not exists owner_name text,
  add column if not exists lost_reason text;

update app.sponsors set stage_changed_at = coalesce(updated_at, created_at) where stage_changed_at is null;

-- 2. Link player_benefits funding rows to a sponsor
alter table app.player_benefits
  add column if not exists sponsor_id uuid references app.sponsors(id);

create index if not exists player_benefits_sponsor_idx on app.player_benefits(sponsor_id) where sponsor_id is not null;

-- 3. Extend command_upsert_sponsor_admin: owner_name, lost_reason, auto stage_changed_at
drop function if exists private.command_upsert_sponsor_admin(uuid,uuid,text,text,text,text,text,text,text,text,text,numeric,text,timestamptz,text);

create function private.command_upsert_sponsor_admin(
  p_organization_id uuid, p_sponsor_id uuid, p_name text, p_sponsor_type text, p_contact_name text,
  p_phone text, p_email text, p_status text, p_tier text, p_relationship_type text, p_stage text,
  p_potential_value numeric, p_next_action text, p_next_action_at timestamptz, p_notes text,
  p_owner_name text default null, p_lost_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare
  v_id uuid; v_phone text; v_stage text; v_old_stage text;
begin
  if not private.has_module_access(p_organization_id,'sponsors',true) then raise exception 'Not authorized'; end if;
  if coalesce(length(trim(p_name)),0)<2 then raise exception 'Sponsor name required'; end if;
  if p_status not in ('prospect','negotiation','active','inactive','lost','archived') then raise exception 'Invalid sponsor status'; end if;
  if p_potential_value is not null and p_potential_value<0 then raise exception 'Potential value cannot be negative'; end if;
  if p_phone is not null and trim(p_phone)<>'' then v_phone:=private.normalize_public_phone(p_phone); end if;
  v_stage := nullif(trim(p_stage),'');

  if p_sponsor_id is null then
    insert into app.sponsors(
      organization_id,name,sponsor_type,tier,contact_name,phone,email,status,relationship_type,stage,
      potential_value,next_action,next_action_at,notes,owner_name,lost_reason,stage_changed_at,created_at,updated_at
    ) values (
      p_organization_id,trim(p_name),nullif(trim(p_sponsor_type),''),nullif(trim(p_tier),''),nullif(trim(p_contact_name),''),
      v_phone,nullif(lower(trim(p_email)),''),p_status,nullif(trim(p_relationship_type),''),v_stage,
      p_potential_value,nullif(trim(p_next_action),''),p_next_action_at,nullif(trim(p_notes),''),
      nullif(trim(p_owner_name),''),case when v_stage='lost' then nullif(trim(p_lost_reason),'') else null end,
      now(),now(),now()
    ) returning id into v_id;
  else
    select stage into v_old_stage from app.sponsors where id=p_sponsor_id and organization_id=p_organization_id;
    update app.sponsors set
      name=trim(p_name),sponsor_type=nullif(trim(p_sponsor_type),''),tier=nullif(trim(p_tier),''),
      contact_name=nullif(trim(p_contact_name),''),phone=v_phone,email=nullif(lower(trim(p_email)),''),
      status=p_status,relationship_type=nullif(trim(p_relationship_type),''),stage=v_stage,
      potential_value=p_potential_value,next_action=nullif(trim(p_next_action),''),next_action_at=p_next_action_at,
      notes=nullif(trim(p_notes),''),owner_name=nullif(trim(p_owner_name),''),
      lost_reason=case when v_stage='lost' then nullif(trim(p_lost_reason),'') else null end,
      stage_changed_at=case when v_old_stage is distinct from v_stage then now() else stage_changed_at end,
      updated_at=now(),
      archived_at=case when p_status='archived' then coalesce(archived_at,now()) else null end
    where id=p_sponsor_id and organization_id=p_organization_id returning id into v_id;
    if v_id is null then raise exception 'Sponsor not found'; end if;
  end if;
  return v_id;
end
$function$;

revoke all on function private.command_upsert_sponsor_admin(uuid,uuid,text,text,text,text,text,text,text,text,text,numeric,text,timestamptz,text,text,text) from public, anon, authenticated;

drop function if exists public.v2_upsert_sponsor_admin(uuid,uuid,text,text,text,text,text,text,text,text,text,numeric,text,timestamptz,text);

create function public.v2_upsert_sponsor_admin(
  organization_id uuid, sponsor_id uuid, name text, sponsor_type text, contact_name text,
  phone text, email text, status text, tier text, relationship_type text, stage text,
  potential_value numeric, next_action text, next_action_at timestamptz, notes text,
  owner_name text default null, lost_reason text default null
)
returns uuid
language sql
security definer
set search_path to 'pg_catalog','private'
as $function$
  select private.command_upsert_sponsor_admin(
    organization_id,sponsor_id,name,sponsor_type,contact_name,phone,email,status,tier,relationship_type,stage,
    potential_value,next_action,next_action_at,notes,owner_name,lost_reason
  )
$function$;

revoke all on function public.v2_upsert_sponsor_admin(uuid,uuid,text,text,text,text,text,text,text,text,text,numeric,text,timestamptz,text,text,text) from public, anon;
grant execute on function public.v2_upsert_sponsor_admin(uuid,uuid,text,text,text,text,text,text,text,text,text,numeric,text,timestamptz,text,text,text) to authenticated;

-- 4. Extend command_configure_sponsor_funding: link to a sponsor_id, and tighten grants (was over-granted to anon/public)
drop function if exists private.command_configure_sponsor_funding(uuid,uuid,uuid,text,numeric,text,numeric,date,date,text);

create function private.command_configure_sponsor_funding(
  p_organization_id uuid, p_player_id uuid, p_benefit_id uuid, p_funding_source_name text,
  p_monthly_total numeric, p_funding_mode text, p_sponsor_value numeric, p_starts_on date,
  p_ends_on date, p_notes text, p_sponsor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'app', 'private'
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
  if p_sponsor_id is not null and not exists(select 1 from app.sponsors s where s.id=p_sponsor_id and s.organization_id=p_organization_id and s.archived_at is null) then
    raise exception 'Sponsor not found';
  end if;

  update app.billing_profiles
  set base_monthly_fee=p_monthly_total,
      needs_review=case when review_reason='Patrocinio activo pendiente de configurar' then false else needs_review end,
      review_reason=case when review_reason='Patrocinio activo pendiente de configurar' then null else review_reason end,
      updated_at=now()
  where organization_id=p_organization_id and player_id=p_player_id;
  if not found then raise exception 'Billing profile not found'; end if;

  if p_benefit_id is null then
    insert into app.player_benefits(organization_id,player_id,benefit_type,calculation_type,fixed_amount,percentage,override_amount,funding_source_name,sponsor_id,starts_on,ends_on,active,priority,notes,legacy_label,funding_configured_at,funding_configured_by_user_id,created_at,updated_at)
    values(p_organization_id,p_player_id,'sponsor_funded',v_mode,case when v_mode='fixed_amount' then p_sponsor_value else null end,case when v_mode='percentage' then p_sponsor_value else null end,null,trim(p_funding_source_name),p_sponsor_id,coalesce(p_starts_on,current_date),p_ends_on,true,100,nullif(trim(coalesce(p_notes,'')),''),'Configurable sponsor funding',now(),v_actor,now(),now())
    returning id into v_benefit;
  else
    update app.player_benefits
    set calculation_type=v_mode,
        fixed_amount=case when v_mode='fixed_amount' then p_sponsor_value else null end,
        percentage=case when v_mode='percentage' then p_sponsor_value else null end,
        override_amount=null,
        funding_source_name=trim(p_funding_source_name),
        sponsor_id=p_sponsor_id,
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
  values(p_organization_id,'SponsorFundingConfigured','player_benefit',v_benefit,jsonb_build_object('playerId',p_player_id,'sponsorId',p_sponsor_id,'monthlyTotal',p_monthly_total,'fundingSource',trim(p_funding_source_name),'mode',v_mode,'sponsorValue',p_sponsor_value,'startsOn',coalesce(p_starts_on,current_date),'endsOn',p_ends_on),v_actor);

  return jsonb_build_object('benefitId',v_benefit,'playerId',p_player_id,'sponsorId',p_sponsor_id,'monthlyTotal',p_monthly_total,'fundingSource',trim(p_funding_source_name),'mode',v_mode,'sponsorValue',p_sponsor_value);
end
$function$;

revoke all on function private.command_configure_sponsor_funding(uuid,uuid,uuid,text,numeric,text,numeric,date,date,text,uuid) from public, anon, authenticated;

drop function if exists public.v2_configure_sponsor_funding(uuid,uuid,uuid,text,numeric,text,numeric,date,date,text);

create function public.v2_configure_sponsor_funding(
  organization_id uuid, player_id uuid, benefit_id uuid, funding_source_name text,
  monthly_total numeric, funding_mode text, sponsor_value numeric, starts_on date,
  ends_on date, notes text, sponsor_id uuid default null
)
returns jsonb
language sql
security definer
set search_path to 'pg_catalog','private'
as $function$
  select private.command_configure_sponsor_funding(
    organization_id,player_id,benefit_id,funding_source_name,monthly_total,funding_mode,sponsor_value,starts_on,ends_on,notes,sponsor_id
  )
$function$;

revoke all on function public.v2_configure_sponsor_funding(uuid,uuid,uuid,text,numeric,text,numeric,date,date,text,uuid) from public, anon;
grant execute on function public.v2_configure_sponsor_funding(uuid,uuid,uuid,text,numeric,text,numeric,date,date,text,uuid) to authenticated;

-- 5. New query: players funded by a given sponsor
create or replace function private.query_sponsor_funded_players(p_organization_id uuid, p_sponsor_id uuid)
returns table(benefit_id uuid, player_id uuid, player_name text, monthly_total numeric, funding_mode text, sponsor_value numeric, starts_on date, ends_on date, active boolean)
language plpgsql
stable security definer
set search_path to 'pg_catalog','app','private'
as $function$
begin
  if not private.has_module_access(p_organization_id,'sponsors',false) then raise exception 'Not authorized'; end if;
  return query
    select b.id,p.id,trim(concat_ws(' ',p.first_name,p.last_name)),bp.base_monthly_fee,b.calculation_type,
      case when b.calculation_type='percentage' then b.percentage else b.fixed_amount end,
      b.starts_on,b.ends_on,b.active
    from app.player_benefits b
    join app.players p on p.id=b.player_id and p.organization_id=b.organization_id
    join app.billing_profiles bp on bp.player_id=p.id and bp.organization_id=p.organization_id
    where b.organization_id=p_organization_id and b.benefit_type='sponsor_funded' and b.sponsor_id=p_sponsor_id
    order by p.first_name,p.last_name;
end
$function$;

revoke all on function private.query_sponsor_funded_players(uuid,uuid) from public, anon, authenticated;

create or replace function public.v2_sponsor_funded_players(organization_id uuid, sponsor_id uuid)
returns table(benefit_id uuid, player_id uuid, player_name text, monthly_total numeric, funding_mode text, sponsor_value numeric, starts_on date, ends_on date, active boolean)
language sql
stable security definer
set search_path to 'pg_catalog','private'
as $function$
  select * from private.query_sponsor_funded_players(organization_id, sponsor_id)
$function$;

revoke all on function public.v2_sponsor_funded_players(uuid,uuid) from public, anon;
grant execute on function public.v2_sponsor_funded_players(uuid,uuid) to authenticated;

-- 6. Extend query_sponsor_admin: expose stageChangedAt, ownerName, lostReason
create or replace function private.query_sponsor_admin(p_organization_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare
  v_sponsors jsonb;
  v_agreements jsonb;
  v_assets jsonb;
  v_items jsonb;
  v_movements jsonb;
  v_evidence jsonb;
begin
  if not private.has_module_access(p_organization_id,'sponsors',false) then raise exception 'Not authorized'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,'name',s.name,'sponsorType',s.sponsor_type,'contactName',s.contact_name,'phone',s.phone,'email',s.email,
    'status',s.status,'tier',s.tier,'relationshipType',s.relationship_type,'stage',s.stage,'potentialValue',s.potential_value,
    'nextAction',s.next_action,'nextActionAt',s.next_action_at,'notes',s.notes,'createdAt',s.created_at,'updatedAt',s.updated_at,
    'stageChangedAt',s.stage_changed_at,'ownerName',s.owner_name,'lostReason',s.lost_reason,
    'activeAgreementCount',(select count(*) from app.sponsor_agreements a where a.organization_id=s.organization_id and a.sponsor_id=s.id and a.status='active'),
    'agreementCount',(select count(*) from app.sponsor_agreements a where a.organization_id=s.organization_id and a.sponsor_id=s.id)
  ) order by coalesce(s.next_action_at,'9999-12-31'::timestamptz),s.name),'[]'::jsonb)
  into v_sponsors
  from app.sponsors s
  where s.organization_id=p_organization_id and s.archived_at is null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'sponsorId',a.sponsor_id,'startsOn',a.starts_on,'endsOn',a.ends_on,
    'monetaryValue',a.monetary_value,'benefitsReceived',a.benefits_received,'deliverables',a.deliverables,
    'status',a.status,'notes',a.notes,'benefit',a.benefit,'discountPercent',a.discount_percent,
    'beneficiaries',a.beneficiaries,'redemptionInstructions',a.redemption_instructions,
    'createdAt',a.created_at,'updatedAt',a.updated_at
  ) order by (a.status='active') desc,a.ends_on nulls last,a.created_at desc),'[]'::jsonb)
  into v_agreements
  from app.sponsor_agreements a
  where a.organization_id=p_organization_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',sa.id,'name',sa.name,'category',sa.category,'price',sa.price,'description',sa.description,
    'availability',sa.availability,'photoBucket',sa.photo_bucket,'photoPath',sa.photo_path,
    'createdAt',sa.created_at,'updatedAt',sa.updated_at
  ) order by sa.category,sa.name),'[]'::jsonb)
  into v_assets
  from app.sponsor_assets sa
  where sa.organization_id=p_organization_id and sa.archived_at is null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',i.id,'agreementId',i.agreement_id,'direction',i.direction,'type',i.item_type,
    'description',i.description,'quantity',i.quantity,'unit',i.unit,'estimatedValue',i.estimated_value,
    'assetId',i.sponsor_asset_id,'fulfilled',i.fulfillment_status='fulfilled','fulfilledAt',i.fulfilled_at,
    'sortOrder',i.sort_order,'createdAt',i.created_at,'updatedAt',i.updated_at
  ) order by i.agreement_id,i.direction,i.sort_order),'[]'::jsonb)
  into v_items
  from app.sponsor_agreement_items i
  where i.organization_id=p_organization_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',m.id,'sponsorId',m.sponsor_id,'type',m.movement_type,'result',m.result,
    'nextAction',m.next_action,'nextActionAt',m.next_action_at,'occurredAt',m.occurred_at
  ) order by m.occurred_at desc),'[]'::jsonb)
  into v_movements
  from app.sponsor_movements m
  where m.organization_id=p_organization_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'itemId',e.item_id,'photoBucket',e.photo_bucket,'photoPath',e.photo_path,
    'note',e.note,'createdAt',e.created_at
  ) order by e.created_at desc),'[]'::jsonb)
  into v_evidence
  from app.sponsor_agreement_item_evidence e
  where e.organization_id=p_organization_id;

  return jsonb_build_object(
    'sponsors',v_sponsors,'agreements',v_agreements,'assets',v_assets,
    'agreementItems',v_items,'movements',v_movements,'itemEvidence',v_evidence
  );
end
$function$;
;
