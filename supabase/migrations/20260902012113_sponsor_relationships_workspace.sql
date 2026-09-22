create table if not exists app.sponsor_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sponsor_id uuid not null references app.sponsors(id) on delete cascade,
  movement_type text not null,
  result text not null,
  next_action text,
  next_action_at timestamptz,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid,
  created_at timestamptz not null default now(),
  constraint sponsor_movements_type_check check (movement_type in ('call','whatsapp','email','meeting','note')),
  constraint sponsor_movements_result_check check (length(trim(result)) between 2 and 2000)
);

create index if not exists sponsor_movements_org_sponsor_occurred_idx
  on app.sponsor_movements (organization_id, sponsor_id, occurred_at desc);

create table if not exists app.sponsor_agreement_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agreement_id uuid not null references app.sponsor_agreements(id) on delete cascade,
  direction text not null,
  item_type text not null,
  description text not null,
  quantity numeric,
  unit text,
  estimated_value numeric,
  sponsor_asset_id uuid references app.sponsor_assets(id) on delete set null,
  fulfillment_status text not null default 'pending',
  fulfilled_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sponsor_agreement_items_direction_check check (direction in ('receive','give')),
  constraint sponsor_agreement_items_fulfillment_check check (fulfillment_status in ('pending','fulfilled')),
  constraint sponsor_agreement_items_quantity_check check (quantity is null or quantity >= 0),
  constraint sponsor_agreement_items_value_check check (estimated_value is null or estimated_value >= 0),
  constraint sponsor_agreement_items_description_check check (length(trim(description)) between 2 and 500)
);

create index if not exists sponsor_agreement_items_agreement_idx
  on app.sponsor_agreement_items (organization_id, agreement_id, direction, sort_order);
create index if not exists sponsor_agreement_items_asset_idx
  on app.sponsor_agreement_items (sponsor_asset_id)
  where sponsor_asset_id is not null;

alter table app.sponsor_agreements
  add column if not exists benefit text,
  add column if not exists discount_percent numeric,
  add column if not exists beneficiaries text[] not null default '{}'::text[],
  add column if not exists redemption_instructions text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='sponsor_agreements_discount_percent_check'
      and conrelid='app.sponsor_agreements'::regclass
  ) then
    alter table app.sponsor_agreements
      add constraint sponsor_agreements_discount_percent_check
      check (discount_percent is null or (discount_percent >= 0 and discount_percent <= 100));
  end if;
end $$;

alter table app.sponsor_movements enable row level security;
alter table app.sponsor_agreement_items enable row level security;

drop policy if exists sponsor_movements_read on app.sponsor_movements;
create policy sponsor_movements_read on app.sponsor_movements
  for select to authenticated
  using ((select private.has_module_access(organization_id,'sponsors',false)));

drop policy if exists sponsor_movements_insert on app.sponsor_movements;
create policy sponsor_movements_insert on app.sponsor_movements
  for insert to authenticated
  with check ((select private.has_module_access(organization_id,'sponsors',true)));

drop policy if exists sponsor_agreement_items_read on app.sponsor_agreement_items;
create policy sponsor_agreement_items_read on app.sponsor_agreement_items
  for select to authenticated
  using ((select private.has_module_access(organization_id,'sponsors',false)));

drop policy if exists sponsor_agreement_items_insert on app.sponsor_agreement_items;
create policy sponsor_agreement_items_insert on app.sponsor_agreement_items
  for insert to authenticated
  with check ((select private.has_module_access(organization_id,'sponsors',true)));

drop policy if exists sponsor_agreement_items_update on app.sponsor_agreement_items;
create policy sponsor_agreement_items_update on app.sponsor_agreement_items
  for update to authenticated
  using ((select private.has_module_access(organization_id,'sponsors',true)))
  with check ((select private.has_module_access(organization_id,'sponsors',true)));

drop policy if exists sponsor_agreement_items_delete on app.sponsor_agreement_items;
create policy sponsor_agreement_items_delete on app.sponsor_agreement_items
  for delete to authenticated
  using ((select private.has_module_access(organization_id,'sponsors',true)));

create or replace function private.command_upsert_sponsor_admin(
  p_organization_id uuid,
  p_sponsor_id uuid,
  p_name text,
  p_sponsor_type text,
  p_contact_name text,
  p_phone text,
  p_email text,
  p_status text,
  p_tier text,
  p_relationship_type text,
  p_stage text,
  p_potential_value numeric,
  p_next_action text,
  p_next_action_at timestamptz,
  p_notes text
) returns uuid
language plpgsql
security definer
set search_path='pg_catalog','app','private'
as $$
declare
  v_id uuid;
  v_phone text;
  v_relationship text:=nullif(trim(coalesce(p_relationship_type,'')), '');
  v_stage text:=nullif(trim(coalesce(p_stage,'')), '');
begin
  if not private.has_module_access(p_organization_id,'sponsors',true) then
    raise exception 'Not authorized';
  end if;
  if coalesce(length(trim(p_name)),0)<2 then raise exception 'Sponsor name required'; end if;
  if p_status not in ('prospect','negotiation','active','inactive','lost','archived') then
    raise exception 'Invalid sponsor status';
  end if;
  if v_relationship not in ('sponsorship','commercial_alliance','exchange','benefit_agreement') then
    raise exception 'Invalid relationship type';
  end if;
  if v_stage not in ('radar','contacted','talking','agreement','closing','active','paused','lost','finished') then
    raise exception 'Invalid sponsor stage';
  end if;
  if p_potential_value is not null and p_potential_value<0 then
    raise exception 'Potential value cannot be negative';
  end if;
  if nullif(trim(coalesce(p_email,'')),'') is not null
     and trim(p_email) !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Invalid sponsor email';
  end if;
  v_phone:=case when nullif(trim(coalesce(p_phone,'')),'') is null then null else private.normalize_legacy_phone_safe(p_phone) end;
  if nullif(trim(coalesce(p_phone,'')),'') is not null and v_phone is null then
    raise exception 'Invalid sponsor phone';
  end if;

  if p_sponsor_id is null then
    insert into app.sponsors(
      organization_id,name,sponsor_type,contact_name,phone,email,status,tier,
      relationship_type,stage,potential_value,next_action,next_action_at,notes,
      created_at,updated_at,archived_at,metadata
    ) values (
      p_organization_id,trim(p_name),nullif(trim(p_sponsor_type),''),nullif(trim(p_contact_name),''),v_phone,
      nullif(lower(trim(p_email)),''),p_status,nullif(trim(p_tier),''),v_relationship,v_stage,
      p_potential_value,nullif(trim(p_next_action),''),p_next_action_at,nullif(trim(p_notes),''),
      now(),now(),case when p_status='archived' then now() else null end,'{}'::jsonb
    ) returning id into v_id;
  else
    update app.sponsors set
      name=trim(p_name),sponsor_type=nullif(trim(p_sponsor_type),''),contact_name=nullif(trim(p_contact_name),''),
      phone=v_phone,email=nullif(lower(trim(p_email)),''),status=p_status,tier=nullif(trim(p_tier),''),
      relationship_type=v_relationship,stage=v_stage,potential_value=p_potential_value,
      next_action=nullif(trim(p_next_action),''),next_action_at=p_next_action_at,
      notes=nullif(trim(p_notes),''),archived_at=case when p_status='archived' then coalesce(archived_at,now()) else null end,
      updated_at=now()
    where id=p_sponsor_id and organization_id=p_organization_id
    returning id into v_id;
    if v_id is null then raise exception 'Sponsor not found'; end if;
  end if;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id,actor)
  values(
    p_organization_id,case when p_sponsor_id is null then 'SponsorCreated' else 'SponsorUpdated' end,
    'sponsor',v_id,jsonb_build_object('status',p_status,'stage',v_stage,'relationshipType',v_relationship),
    (select auth.uid()),coalesce((select auth.uid())::text,'system')
  );
  return v_id;
end
$$;

create or replace function private.command_save_sponsor_agreement(
  p_organization_id uuid,
  p_agreement_id uuid,
  p_sponsor_id uuid,
  p_starts_on date,
  p_ends_on date,
  p_agreement_value numeric,
  p_status text,
  p_notes text,
  p_benefit text,
  p_discount_percent numeric,
  p_beneficiaries text[],
  p_redemption_instructions text,
  p_received_items jsonb,
  p_given_items jsonb
) returns uuid
language plpgsql
security definer
set search_path='pg_catalog','app','private'
as $$
declare
  v_id uuid;
  v_item jsonb;
  v_direction text;
  v_type text;
  v_description text;
  v_quantity numeric;
  v_unit text;
  v_value numeric;
  v_asset_id uuid;
  v_fulfilled boolean;
  v_sort integer:=0;
begin
  if not private.has_module_access(p_organization_id,'sponsors',true) then raise exception 'Not authorized'; end if;
  if not exists(
    select 1 from app.sponsors
    where id=p_sponsor_id and organization_id=p_organization_id and archived_at is null
  ) then raise exception 'Sponsor not found'; end if;
  if p_status not in ('draft','active','completed','cancelled') then raise exception 'Invalid agreement status'; end if;
  if p_starts_on is not null and p_ends_on is not null and p_ends_on<p_starts_on then
    raise exception 'Agreement end cannot precede start';
  end if;
  if p_agreement_value is not null and p_agreement_value<0 then raise exception 'Agreement value cannot be negative'; end if;
  if p_discount_percent is not null and (p_discount_percent<0 or p_discount_percent>100) then
    raise exception 'Discount must be between 0 and 100';
  end if;
  if jsonb_typeof(coalesce(p_received_items,'[]'::jsonb))<>'array'
     or jsonb_typeof(coalesce(p_given_items,'[]'::jsonb))<>'array' then
    raise exception 'Agreement items must be arrays';
  end if;
  if jsonb_array_length(coalesce(p_received_items,'[]'::jsonb))
     + jsonb_array_length(coalesce(p_given_items,'[]'::jsonb)) > 100 then
    raise exception 'Too many agreement items';
  end if;

  if p_agreement_id is null then
    insert into app.sponsor_agreements(
      organization_id,sponsor_id,starts_on,ends_on,monetary_value,status,notes,
      benefit,discount_percent,beneficiaries,redemption_instructions,
      benefits_received,deliverables,created_at,updated_at,metadata
    ) values (
      p_organization_id,p_sponsor_id,p_starts_on,p_ends_on,p_agreement_value,p_status,
      nullif(trim(p_notes),''),nullif(trim(p_benefit),''),p_discount_percent,coalesce(p_beneficiaries,'{}'::text[]),
      nullif(trim(p_redemption_instructions),''),'[]'::jsonb,'[]'::jsonb,now(),now(),'{}'::jsonb
    ) returning id into v_id;
  else
    update app.sponsor_agreements set
      sponsor_id=p_sponsor_id,starts_on=p_starts_on,ends_on=p_ends_on,monetary_value=p_agreement_value,
      status=p_status,notes=nullif(trim(p_notes),''),benefit=nullif(trim(p_benefit),''),
      discount_percent=p_discount_percent,beneficiaries=coalesce(p_beneficiaries,'{}'::text[]),
      redemption_instructions=nullif(trim(p_redemption_instructions),''),updated_at=now()
    where id=p_agreement_id and organization_id=p_organization_id
    returning id into v_id;
    if v_id is null then raise exception 'Agreement not found'; end if;
  end if;

  delete from app.sponsor_agreement_items
  where organization_id=p_organization_id and agreement_id=v_id;

  for v_item in
    select value || jsonb_build_object('_direction','receive') from jsonb_array_elements(coalesce(p_received_items,'[]'::jsonb))
    union all
    select value || jsonb_build_object('_direction','give') from jsonb_array_elements(coalesce(p_given_items,'[]'::jsonb))
  loop
    v_direction:=v_item->>'_direction';
    v_type:=nullif(trim(v_item->>'type'),'');
    v_description:=nullif(trim(v_item->>'description'),'');
    v_quantity:=nullif(trim(v_item->>'quantity'),'')::numeric;
    v_unit:=nullif(trim(v_item->>'unit'),'');
    v_value:=nullif(trim(v_item->>'estimatedValue'),'')::numeric;
    v_asset_id:=nullif(trim(v_item->>'assetId'),'')::uuid;
    v_fulfilled:=coalesce((v_item->>'fulfilled')::boolean,false);
    if v_description is null or length(v_description)<2 then raise exception 'Agreement item description required'; end if;
    if v_direction='receive' and v_type not in ('money','product','service','discount','benefit','other') then
      raise exception 'Invalid received item type';
    end if;
    if v_direction='give' and v_type not in ('advertising','banner','social','jersey','activation','tanner_asset','other') then
      raise exception 'Invalid given item type';
    end if;
    if v_quantity is not null and v_quantity<0 then raise exception 'Item quantity cannot be negative'; end if;
    if v_value is not null and v_value<0 then raise exception 'Item value cannot be negative'; end if;
    if v_asset_id is not null and not exists(
      select 1 from app.sponsor_assets
      where id=v_asset_id and organization_id=p_organization_id and archived_at is null
    ) then raise exception 'Tanner asset not found'; end if;
    if v_asset_id is not null and v_direction<>'give' then raise exception 'Tanner asset can only be given'; end if;
    v_sort:=v_sort+1;
    insert into app.sponsor_agreement_items(
      organization_id,agreement_id,direction,item_type,description,quantity,unit,estimated_value,
      sponsor_asset_id,fulfillment_status,fulfilled_at,sort_order,created_at,updated_at
    ) values (
      p_organization_id,v_id,v_direction,v_type,v_description,v_quantity,v_unit,v_value,v_asset_id,
      case when v_fulfilled then 'fulfilled' else 'pending' end,case when v_fulfilled then now() else null end,
      v_sort,now(),now()
    );
  end loop;

  update app.sponsor_agreements a set
    benefits_received=coalesce((
      select jsonb_agg(i.description order by i.sort_order)
      from app.sponsor_agreement_items i where i.agreement_id=v_id and i.direction='receive'
    ),'[]'::jsonb),
    deliverables=coalesce((
      select jsonb_agg(i.description order by i.sort_order)
      from app.sponsor_agreement_items i where i.agreement_id=v_id and i.direction='give'
    ),'[]'::jsonb),
    updated_at=now()
  where a.id=v_id;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id,actor)
  values(
    p_organization_id,case when p_agreement_id is null then 'SponsorAgreementCreated' else 'SponsorAgreementUpdated' end,
    'sponsor_agreement',v_id,jsonb_build_object(
      'sponsorId',p_sponsor_id,'status',p_status,
      'receivedItems',jsonb_array_length(coalesce(p_received_items,'[]'::jsonb)),
      'givenItems',jsonb_array_length(coalesce(p_given_items,'[]'::jsonb))
    ),(select auth.uid()),coalesce((select auth.uid())::text,'system')
  );
  return v_id;
end
$$;

create or replace function private.command_register_sponsor_movement(
  p_organization_id uuid,
  p_sponsor_id uuid,
  p_movement_type text,
  p_result text,
  p_next_action text,
  p_next_action_at timestamptz
) returns uuid
language plpgsql
security definer
set search_path='pg_catalog','app','private'
as $$
declare v_id uuid;
begin
  if not private.has_module_access(p_organization_id,'sponsors',true) then raise exception 'Not authorized'; end if;
  if p_movement_type not in ('call','whatsapp','email','meeting','note') then raise exception 'Invalid movement type'; end if;
  if coalesce(length(trim(p_result)),0)<2 then raise exception 'Movement result required'; end if;
  if not exists(select 1 from app.sponsors where id=p_sponsor_id and organization_id=p_organization_id and archived_at is null) then
    raise exception 'Sponsor not found';
  end if;
  insert into app.sponsor_movements(
    organization_id,sponsor_id,movement_type,result,next_action,next_action_at,occurred_at,actor_user_id,created_at
  ) values (
    p_organization_id,p_sponsor_id,p_movement_type,trim(p_result),nullif(trim(p_next_action),''),
    p_next_action_at,now(),(select auth.uid()),now()
  ) returning id into v_id;
  update app.sponsors set next_action=nullif(trim(p_next_action),''),next_action_at=p_next_action_at,updated_at=now()
  where id=p_sponsor_id and organization_id=p_organization_id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id,actor)
  values(
    p_organization_id,'SponsorMovementRegistered','sponsor',p_sponsor_id,
    jsonb_build_object('movementId',v_id,'movementType',p_movement_type,'nextActionAt',p_next_action_at),
    (select auth.uid()),coalesce((select auth.uid())::text,'system')
  );
  return v_id;
end
$$;

create or replace function private.command_set_sponsor_item_fulfillment(
  p_organization_id uuid,
  p_item_id uuid,
  p_fulfilled boolean
) returns void
language plpgsql
security definer
set search_path='pg_catalog','app','private'
as $$
declare v_agreement_id uuid;
begin
  if not private.has_module_access(p_organization_id,'sponsors',true) then raise exception 'Not authorized'; end if;
  update app.sponsor_agreement_items set
    fulfillment_status=case when p_fulfilled then 'fulfilled' else 'pending' end,
    fulfilled_at=case when p_fulfilled then now() else null end,
    updated_at=now()
  where id=p_item_id and organization_id=p_organization_id
  returning agreement_id into v_agreement_id;
  if v_agreement_id is null then raise exception 'Agreement item not found'; end if;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id,actor)
  values(
    p_organization_id,'SponsorCommitmentUpdated','sponsor_agreement',v_agreement_id,
    jsonb_build_object('itemId',p_item_id,'fulfilled',p_fulfilled),
    (select auth.uid()),coalesce((select auth.uid())::text,'system')
  );
end
$$;

create or replace function private.command_upsert_sponsor_asset_admin(
  p_organization_id uuid,
  p_asset_id uuid,
  p_name text,
  p_category text,
  p_price numeric,
  p_description text,
  p_availability text
) returns uuid
language plpgsql
security definer
set search_path='pg_catalog','app','private'
as $$
declare v_id uuid;
begin
  if not private.has_module_access(p_organization_id,'sponsors',true) then raise exception 'Not authorized'; end if;
  if coalesce(length(trim(p_name)),0)<2 then raise exception 'Asset name required'; end if;
  if p_category not in ('digital','park','uniforms','sports','content','other') then raise exception 'Invalid asset category'; end if;
  if p_availability not in ('available','partial','occupied') then raise exception 'Invalid asset availability'; end if;
  if p_price is not null and p_price<0 then raise exception 'Asset price cannot be negative'; end if;
  if p_asset_id is null then
    insert into app.sponsor_assets(
      organization_id,name,category,price,description,availability,metadata,created_at,updated_at,archived_at
    ) values (
      p_organization_id,trim(p_name),p_category,p_price,nullif(trim(p_description),''),p_availability,
      '{}'::jsonb,now(),now(),null
    ) returning id into v_id;
  else
    update app.sponsor_assets set
      name=trim(p_name),category=p_category,price=p_price,description=nullif(trim(p_description),''),
      availability=p_availability,updated_at=now()
    where id=p_asset_id and organization_id=p_organization_id and archived_at is null
    returning id into v_id;
    if v_id is null then raise exception 'Tanner asset not found'; end if;
  end if;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id,actor)
  values(
    p_organization_id,case when p_asset_id is null then 'SponsorAssetCreated' else 'SponsorAssetUpdated' end,
    'sponsor_asset',v_id,jsonb_build_object('category',p_category,'availability',p_availability),
    (select auth.uid()),coalesce((select auth.uid())::text,'system')
  );
  return v_id;
end
$$;

create or replace function private.command_archive_sponsor_asset_admin(
  p_organization_id uuid,
  p_asset_id uuid
) returns void
language plpgsql
security definer
set search_path='pg_catalog','app','private'
as $$
begin
  if not private.has_module_access(p_organization_id,'sponsors',true) then raise exception 'Not authorized'; end if;
  update app.sponsor_assets set archived_at=now(),updated_at=now()
  where id=p_asset_id and organization_id=p_organization_id and archived_at is null;
  if not found then raise exception 'Tanner asset not found'; end if;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id,actor)
  values(
    p_organization_id,'SponsorAssetArchived','sponsor_asset',p_asset_id,'{}'::jsonb,
    (select auth.uid()),coalesce((select auth.uid())::text,'system')
  );
end
$$;

create or replace function private.query_sponsor_admin(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path='pg_catalog','app','private'
as $$
declare
  v_sponsors jsonb;
  v_agreements jsonb;
  v_assets jsonb;
  v_items jsonb;
  v_movements jsonb;
begin
  if not private.has_module_access(p_organization_id,'sponsors',false) then raise exception 'Not authorized'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,'name',s.name,'sponsorType',s.sponsor_type,'contactName',s.contact_name,'phone',s.phone,'email',s.email,
    'status',s.status,'tier',s.tier,'relationshipType',s.relationship_type,'stage',s.stage,'potentialValue',s.potential_value,
    'nextAction',s.next_action,'nextActionAt',s.next_action_at,'notes',s.notes,'createdAt',s.created_at,'updatedAt',s.updated_at,
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
    'availability',sa.availability,'createdAt',sa.created_at,'updatedAt',sa.updated_at
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

  return jsonb_build_object(
    'sponsors',v_sponsors,'agreements',v_agreements,'assets',v_assets,
    'agreementItems',v_items,'movements',v_movements
  );
end
$$;

create or replace function public.v2_save_sponsor_agreement(
  organization_id uuid,
  agreement_id uuid,
  sponsor_id uuid,
  starts_on date,
  ends_on date,
  agreement_value numeric,
  status text,
  notes text,
  benefit text,
  discount_percent numeric,
  beneficiaries text[],
  redemption_instructions text,
  received_items jsonb,
  given_items jsonb
) returns uuid
language sql
security definer
set search_path='pg_catalog','private'
as $$
  select private.command_save_sponsor_agreement(
    organization_id,agreement_id,sponsor_id,starts_on,ends_on,agreement_value,status,notes,
    benefit,discount_percent,beneficiaries,redemption_instructions,received_items,given_items
  )
$$;

create or replace function public.v2_register_sponsor_movement(
  organization_id uuid,
  sponsor_id uuid,
  movement_type text,
  result text,
  next_action text,
  next_action_at timestamptz
) returns uuid
language sql
security definer
set search_path='pg_catalog','private'
as $$
  select private.command_register_sponsor_movement(
    organization_id,sponsor_id,movement_type,result,next_action,next_action_at
  )
$$;

create or replace function public.v2_set_sponsor_item_fulfillment(
  organization_id uuid,
  item_id uuid,
  fulfilled boolean
) returns void
language sql
security definer
set search_path='pg_catalog','private'
as $$
  select private.command_set_sponsor_item_fulfillment(organization_id,item_id,fulfilled)
$$;

create or replace function public.v2_upsert_sponsor_asset_admin(
  organization_id uuid,
  asset_id uuid,
  name text,
  category text,
  price numeric,
  description text,
  availability text
) returns uuid
language sql
security definer
set search_path='pg_catalog','private'
as $$
  select private.command_upsert_sponsor_asset_admin(
    organization_id,asset_id,name,category,price,description,availability
  )
$$;

create or replace function public.v2_archive_sponsor_asset_admin(
  organization_id uuid,
  asset_id uuid
) returns void
language sql
security definer
set search_path='pg_catalog','private'
as $$
  select private.command_archive_sponsor_asset_admin(organization_id,asset_id)
$$;

revoke all on table app.sponsor_movements from anon;
revoke all on table app.sponsor_agreement_items from anon;
revoke all on function public.v2_save_sponsor_agreement(uuid,uuid,uuid,date,date,numeric,text,text,text,numeric,text[],text,jsonb,jsonb) from public,anon;
revoke all on function public.v2_register_sponsor_movement(uuid,uuid,text,text,text,timestamptz) from public,anon;
revoke all on function public.v2_set_sponsor_item_fulfillment(uuid,uuid,boolean) from public,anon;
revoke all on function public.v2_upsert_sponsor_asset_admin(uuid,uuid,text,text,numeric,text,text) from public,anon;
revoke all on function public.v2_archive_sponsor_asset_admin(uuid,uuid) from public,anon;

grant execute on function public.v2_save_sponsor_agreement(uuid,uuid,uuid,date,date,numeric,text,text,text,numeric,text[],text,jsonb,jsonb) to authenticated,service_role;
grant execute on function public.v2_register_sponsor_movement(uuid,uuid,text,text,text,timestamptz) to authenticated,service_role;
grant execute on function public.v2_set_sponsor_item_fulfillment(uuid,uuid,boolean) to authenticated,service_role;
grant execute on function public.v2_upsert_sponsor_asset_admin(uuid,uuid,text,text,numeric,text,text) to authenticated,service_role;
grant execute on function public.v2_archive_sponsor_asset_admin(uuid,uuid) to authenticated,service_role;

revoke all on function private.command_save_sponsor_agreement(uuid,uuid,uuid,date,date,numeric,text,text,text,numeric,text[],text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function private.command_register_sponsor_movement(uuid,uuid,text,text,text,timestamptz) from public,anon,authenticated;
revoke all on function private.command_set_sponsor_item_fulfillment(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function private.command_upsert_sponsor_asset_admin(uuid,uuid,text,text,numeric,text,text) from public,anon,authenticated;
revoke all on function private.command_archive_sponsor_asset_admin(uuid,uuid) from public,anon,authenticated;

;
