-- 1. Ledger table for real sponsor agreement payments (abonos)
create table if not exists app.sponsor_agreement_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  agreement_id uuid not null references app.sponsor_agreements(id) on delete cascade,
  amount numeric not null check (amount > 0),
  paid_on date not null default current_date,
  method text check (method is null or method = any (array['transferencia','efectivo','cheque','deposito','otro'])),
  reference text check (reference is null or length(trim(both from reference)) <= 120),
  note text check (note is null or length(trim(both from note)) <= 500),
  recorded_by_user_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists sponsor_agreement_payments_agreement_idx on app.sponsor_agreement_payments(agreement_id);
create index if not exists sponsor_agreement_payments_org_idx on app.sponsor_agreement_payments(organization_id);

alter table app.sponsor_agreement_payments enable row level security;

drop policy if exists sponsor_agreement_payments_read on app.sponsor_agreement_payments;
drop policy if exists sponsor_agreement_payments_insert on app.sponsor_agreement_payments;
drop policy if exists sponsor_agreement_payments_delete on app.sponsor_agreement_payments;

create policy sponsor_agreement_payments_read on app.sponsor_agreement_payments
  for select using (private.has_module_access(organization_id,'sponsors',false));
create policy sponsor_agreement_payments_insert on app.sponsor_agreement_payments
  for insert with check (private.has_module_access(organization_id,'sponsors',true));
create policy sponsor_agreement_payments_delete on app.sponsor_agreement_payments
  for delete using (private.has_module_access(organization_id,'sponsors',true));

-- 2. private.command_add_sponsor_agreement_payment
create or replace function private.command_add_sponsor_agreement_payment(
  p_organization_id uuid, p_agreement_id uuid, p_amount numeric, p_paid_on date,
  p_method text, p_reference text, p_note text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_row app.sponsor_agreement_payments;
  v_method text;
begin
  if not private.has_module_access(p_organization_id,'sponsors',true) then raise exception 'Not authorized'; end if;

  if not exists (
    select 1 from app.sponsor_agreements
    where id = p_agreement_id and organization_id = p_organization_id
  ) then
    raise exception 'Agreement not found';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  v_method := nullif(trim(both from coalesce(p_method,'')),'');
  if v_method is not null and v_method not in ('transferencia','efectivo','cheque','deposito','otro') then
    raise exception 'Invalid payment method';
  end if;

  insert into app.sponsor_agreement_payments(
    organization_id, agreement_id, amount, paid_on, method, reference, note, recorded_by_user_id
  ) values (
    p_organization_id, p_agreement_id, p_amount, coalesce(p_paid_on, current_date), v_method,
    nullif(trim(both from coalesce(p_reference,'')),''), nullif(trim(both from coalesce(p_note,'')),''), v_actor
  ) returning * into v_row;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id,actor)
  values(
    p_organization_id,'SponsorPaymentRecorded','sponsor_agreement',p_agreement_id,
    jsonb_build_object('paymentId',v_row.id,'amount',v_row.amount,'paidOn',v_row.paid_on),
    v_actor, coalesce(v_actor::text,'system')
  );

  return jsonb_build_object(
    'id',v_row.id,'agreementId',v_row.agreement_id,'amount',v_row.amount,'paidOn',v_row.paid_on,
    'method',v_row.method,'reference',v_row.reference,'note',v_row.note,'createdAt',v_row.created_at
  );
end
$function$;

-- 3. private.command_delete_sponsor_agreement_payment
create or replace function private.command_delete_sponsor_agreement_payment(p_organization_id uuid, p_payment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare
  v_row app.sponsor_agreement_payments;
  v_actor uuid := (select auth.uid());
begin
  if not private.has_module_access(p_organization_id,'sponsors',true) then raise exception 'Not authorized'; end if;

  delete from app.sponsor_agreement_payments
  where id = p_payment_id and organization_id = p_organization_id
  returning * into v_row;

  if v_row.id is null then raise exception 'Payment not found'; end if;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id,actor)
  values(
    p_organization_id,'SponsorPaymentDeleted','sponsor_agreement',v_row.agreement_id,
    jsonb_build_object('paymentId',v_row.id,'amount',v_row.amount),
    v_actor, coalesce(v_actor::text,'system')
  );

  return jsonb_build_object('id',v_row.id,'agreementId',v_row.agreement_id);
end
$function$;

-- 4. Extend query_sponsor_admin to include the payments ledger
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
  v_payments jsonb;
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

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'agreementId',p.agreement_id,'amount',p.amount,'paidOn',p.paid_on,
    'method',p.method,'reference',p.reference,'note',p.note,'createdAt',p.created_at
  ) order by p.paid_on desc,p.created_at desc),'[]'::jsonb)
  into v_payments
  from app.sponsor_agreement_payments p
  where p.organization_id=p_organization_id;

  return jsonb_build_object(
    'sponsors',v_sponsors,'agreements',v_agreements,'assets',v_assets,
    'agreementItems',v_items,'movements',v_movements,'itemEvidence',v_evidence,
    'payments',v_payments
  );
end
$function$;

-- 5. Public wrappers
create or replace function public.v2_add_sponsor_agreement_payment(
  organization_id uuid, agreement_id uuid, amount numeric, paid_on date default current_date,
  method text default null, reference text default null, note text default null
)
returns jsonb
language sql
security definer
set search_path to 'pg_catalog','private'
as $function$
  select private.command_add_sponsor_agreement_payment(organization_id, agreement_id, amount, paid_on, method, reference, note)
$function$;

create or replace function public.v2_delete_sponsor_agreement_payment(organization_id uuid, payment_id uuid)
returns jsonb
language sql
security definer
set search_path to 'pg_catalog','private'
as $function$
  select private.command_delete_sponsor_agreement_payment(organization_id, payment_id)
$function$;

-- 6. Grants: authenticated only, matching sibling sponsor RPCs
revoke all on function private.command_add_sponsor_agreement_payment(uuid,uuid,numeric,date,text,text,text) from public, anon, authenticated;
revoke all on function private.command_delete_sponsor_agreement_payment(uuid,uuid) from public, anon, authenticated;

revoke all on function public.v2_add_sponsor_agreement_payment(uuid,uuid,numeric,date,text,text,text) from public, anon;
revoke all on function public.v2_delete_sponsor_agreement_payment(uuid,uuid) from public, anon;

grant execute on function public.v2_add_sponsor_agreement_payment(uuid,uuid,numeric,date,text,text,text) to authenticated;
grant execute on function public.v2_delete_sponsor_agreement_payment(uuid,uuid) to authenticated;
;
