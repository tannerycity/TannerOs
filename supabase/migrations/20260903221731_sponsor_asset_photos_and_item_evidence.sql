
-- 1. Photo columns on sponsor_assets
alter table app.sponsor_assets
  add column if not exists photo_bucket text,
  add column if not exists photo_path text;

-- 2. Evidence table for agreement item fulfillment proof
create table if not exists app.sponsor_agreement_item_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  item_id uuid not null references app.sponsor_agreement_items(id) on delete cascade,
  photo_bucket text not null default 'tanneros-private',
  photo_path text not null,
  note text,
  uploaded_by_user_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists sponsor_agreement_item_evidence_item_idx on app.sponsor_agreement_item_evidence(item_id);
create index if not exists sponsor_agreement_item_evidence_org_idx on app.sponsor_agreement_item_evidence(organization_id);

alter table app.sponsor_agreement_item_evidence enable row level security;

drop policy if exists sponsor_agreement_item_evidence_read on app.sponsor_agreement_item_evidence;
drop policy if exists sponsor_agreement_item_evidence_insert on app.sponsor_agreement_item_evidence;
drop policy if exists sponsor_agreement_item_evidence_delete on app.sponsor_agreement_item_evidence;

create policy sponsor_agreement_item_evidence_read on app.sponsor_agreement_item_evidence
  for select using (private.has_module_access(organization_id,'sponsors',false));
create policy sponsor_agreement_item_evidence_insert on app.sponsor_agreement_item_evidence
  for insert with check (private.has_module_access(organization_id,'sponsors',true));
create policy sponsor_agreement_item_evidence_delete on app.sponsor_agreement_item_evidence
  for delete using (private.has_module_access(organization_id,'sponsors',true));

-- 3. private.command_set_sponsor_asset_photo
create or replace function private.command_set_sponsor_asset_photo(p_organization_id uuid, p_asset_id uuid, p_photo_path text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','app','private','storage'
as $function$
declare
  v_parts text[];
  v_old_bucket text;
  v_old_path text;
  v_asset jsonb;
begin
  if not private.has_module_access(p_organization_id,'sponsors',true) then
    raise exception 'Not authorized';
  end if;

  v_parts := string_to_array(coalesce(p_photo_path,''), '/');
  if coalesce(array_length(v_parts,1),0) <> 6
     or v_parts[1] <> 'organizations'
     or v_parts[2] <> p_organization_id::text
     or v_parts[3] <> 'sponsors'
     or v_parts[4] <> 'assets'
     or v_parts[5] <> p_asset_id::text
     or v_parts[6] !~* '^photo-[0-9]{10,16}\.(jpg|jpeg|png|webp)$'
  then
    raise exception 'Invalid photo path';
  end if;

  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'tanneros-private' and o.name = p_photo_path
  ) then
    raise exception 'Photo upload not found';
  end if;

  select sa.photo_bucket, sa.photo_path
    into v_old_bucket, v_old_path
  from app.sponsor_assets sa
  where sa.id = p_asset_id and sa.organization_id = p_organization_id and sa.archived_at is null
  for update;

  if not found then
    raise exception 'Asset not found';
  end if;

  update app.sponsor_assets sa
     set photo_bucket = 'tanneros-private',
         photo_path = p_photo_path,
         updated_at = now()
   where sa.id = p_asset_id and sa.organization_id = p_organization_id;

  select jsonb_build_object(
    'id',sa.id,'name',sa.name,'category',sa.category,'price',sa.price,'description',sa.description,
    'availability',sa.availability,'photoBucket',sa.photo_bucket,'photoPath',sa.photo_path,
    'createdAt',sa.created_at,'updatedAt',sa.updated_at
  ) into v_asset
  from app.sponsor_assets sa
  where sa.id = p_asset_id and sa.organization_id = p_organization_id;

  return v_asset;
end
$function$;

-- 4. private.command_add_sponsor_item_evidence
create or replace function private.command_add_sponsor_item_evidence(p_organization_id uuid, p_item_id uuid, p_photo_path text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','app','private','storage'
as $function$
declare
  v_parts text[];
  v_agreement_id uuid;
  v_actor uuid := (select auth.uid());
  v_row app.sponsor_agreement_item_evidence;
begin
  if not private.has_module_access(p_organization_id,'sponsors',true) then
    raise exception 'Not authorized';
  end if;

  select i.agreement_id into v_agreement_id
  from app.sponsor_agreement_items i
  where i.id = p_item_id and i.organization_id = p_organization_id;

  if v_agreement_id is null then
    raise exception 'Agreement item not found';
  end if;

  v_parts := string_to_array(coalesce(p_photo_path,''), '/');
  if coalesce(array_length(v_parts,1),0) <> 8
     or v_parts[1] <> 'organizations'
     or v_parts[2] <> p_organization_id::text
     or v_parts[3] <> 'sponsors'
     or v_parts[4] <> 'agreements'
     or v_parts[5] <> v_agreement_id::text
     or v_parts[6] <> 'items'
     or v_parts[7] <> p_item_id::text
     or v_parts[8] !~* '^evidence-[0-9]{10,16}\.(jpg|jpeg|png|webp)$'
  then
    raise exception 'Invalid evidence path';
  end if;

  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'tanneros-private' and o.name = p_photo_path
  ) then
    raise exception 'Evidence upload not found';
  end if;

  insert into app.sponsor_agreement_item_evidence(
    organization_id, item_id, photo_bucket, photo_path, note, uploaded_by_user_id
  ) values (
    p_organization_id, p_item_id, 'tanneros-private', p_photo_path, nullif(trim(coalesce(p_note,'')),''), v_actor
  ) returning * into v_row;

  return jsonb_build_object(
    'id',v_row.id,'itemId',v_row.item_id,'photoBucket',v_row.photo_bucket,'photoPath',v_row.photo_path,
    'note',v_row.note,'createdAt',v_row.created_at
  );
end
$function$;

-- 5. private.command_delete_sponsor_item_evidence
create or replace function private.command_delete_sponsor_item_evidence(p_organization_id uuid, p_evidence_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','app','private','storage'
as $function$
declare
  v_row app.sponsor_agreement_item_evidence;
begin
  if not private.has_module_access(p_organization_id,'sponsors',true) then
    raise exception 'Not authorized';
  end if;

  delete from app.sponsor_agreement_item_evidence
  where id = p_evidence_id and organization_id = p_organization_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Evidence not found';
  end if;

  return jsonb_build_object('id',v_row.id,'photoBucket',v_row.photo_bucket,'photoPath',v_row.photo_path);
end
$function$;

-- 6. Extend query_sponsor_admin to include photo fields + evidence list
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

-- 7. Public wrappers
create or replace function public.v2_set_sponsor_asset_photo(organization_id uuid, asset_id uuid, photo_path text)
returns jsonb
language sql
security definer
set search_path to 'pg_catalog','private'
as $function$
  select private.command_set_sponsor_asset_photo(organization_id, asset_id, photo_path)
$function$;

create or replace function public.v2_add_sponsor_item_evidence(organization_id uuid, item_id uuid, photo_path text, note text default null)
returns jsonb
language sql
security definer
set search_path to 'pg_catalog','private'
as $function$
  select private.command_add_sponsor_item_evidence(organization_id, item_id, photo_path, note)
$function$;

create or replace function public.v2_delete_sponsor_item_evidence(organization_id uuid, evidence_id uuid)
returns jsonb
language sql
security definer
set search_path to 'pg_catalog','private'
as $function$
  select private.command_delete_sponsor_item_evidence(organization_id, evidence_id)
$function$;

-- 8. Grants: authenticated only, matching sibling sponsor RPCs
revoke all on function private.command_set_sponsor_asset_photo(uuid,uuid,text) from public, anon, authenticated;
revoke all on function private.command_add_sponsor_item_evidence(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function private.command_delete_sponsor_item_evidence(uuid,uuid) from public, anon, authenticated;

revoke all on function public.v2_set_sponsor_asset_photo(uuid,uuid,text) from public, anon;
revoke all on function public.v2_add_sponsor_item_evidence(uuid,uuid,text,text) from public, anon;
revoke all on function public.v2_delete_sponsor_item_evidence(uuid,uuid) from public, anon;

grant execute on function public.v2_set_sponsor_asset_photo(uuid,uuid,text) to authenticated;
grant execute on function public.v2_add_sponsor_item_evidence(uuid,uuid,text,text) to authenticated;
grant execute on function public.v2_delete_sponsor_item_evidence(uuid,uuid) to authenticated;
;
