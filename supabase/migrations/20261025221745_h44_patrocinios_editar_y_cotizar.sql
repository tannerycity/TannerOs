-- h44 (25/10/2026): Patrocinios fácil. Presidencia: "dime si los podemos
-- editar y cambiar y borrar. Y también que ya podamos cotizar".
--   1. Marcas: archivar y recuperar (quien lleva Patrocinios); quitar del todo
--      sólo Presidencia y sólo si no tiene acuerdos vivos ni pagos. Nada se
--      borra físicamente: se marca con fecha (removed_at / voided_at).
--   2. Corregir pagos, la nota de una evidencia, seguimientos y métricas;
--      anular seguimientos y métricas capturados por error; quitar la foto de
--      un activo.
--   3. Cotizaciones: folio, renglones con precio, descuento con tope de 10%.
--      Arriba del 10% la aprueba Presidencia antes de poder enviarse. Al
--      aceptarse se vuelve acuerdo con todo lo cotizado.

alter table app.sponsors add column if not exists removed_at timestamptz;
alter table app.sponsor_movements add column if not exists voided_at timestamptz;
alter table app.social_metrics add column if not exists voided_at timestamptz;

/* ---------- 1. Marcas: archivar, recuperar, quitar ---------- */
create or replace function private.command_set_sponsor_archived(p_organization_id uuid, p_sponsor_id uuid, p_archived boolean)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'app', 'private' as $function$
declare v_row app.sponsors;
begin
  if not private.has_module_access(p_organization_id, 'sponsors', true) then raise exception 'Not authorized'; end if;
  select * into v_row from app.sponsors where id = p_sponsor_id and organization_id = p_organization_id and removed_at is null for update;
  if not found then raise exception 'Sponsor not found'; end if;
  if p_archived then
    update app.sponsors set archived_at = coalesce(archived_at, now()),
      metadata = metadata || jsonb_build_object('statusBeforeArchive', case when status = 'archived' then metadata->>'statusBeforeArchive' else status end),
      status = 'archived', updated_at = now()
     where id = p_sponsor_id;
  else
    update app.sponsors set archived_at = null,
      status = coalesce(nullif(metadata->>'statusBeforeArchive', ''), case when stage = 'active' then 'active' else 'prospect' end),
      updated_at = now()
     where id = p_sponsor_id;
  end if;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id, actor)
  values (p_organization_id, case when p_archived then 'SponsorArchived' else 'SponsorRestored' end, 'sponsor', p_sponsor_id, '{}'::jsonb,
    (select auth.uid()), coalesce((select auth.uid())::text, 'system'));
  return jsonb_build_object('id', p_sponsor_id, 'archived', p_archived);
end $function$;

create or replace function private.command_remove_sponsor(p_organization_id uuid, p_sponsor_id uuid)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'app', 'private' as $function$
begin
  if not private.is_presidency(p_organization_id) then raise exception 'Only presidency can remove sponsors'; end if;
  if not exists (select 1 from app.sponsors where id = p_sponsor_id and organization_id = p_organization_id and removed_at is null) then
    raise exception 'Sponsor not found';
  end if;
  if exists (select 1 from app.sponsor_agreements a where a.sponsor_id = p_sponsor_id and a.organization_id = p_organization_id and a.status <> 'cancelled') then
    raise exception 'Sponsor has agreements';
  end if;
  if exists (select 1 from app.sponsor_agreement_payments p join app.sponsor_agreements a on a.id = p.agreement_id
              where a.sponsor_id = p_sponsor_id and p.organization_id = p_organization_id) then
    raise exception 'Sponsor has payments';
  end if;
  update app.sponsors set removed_at = now(), archived_at = coalesce(archived_at, now()), status = 'archived', updated_at = now()
   where id = p_sponsor_id and organization_id = p_organization_id;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id, actor)
  values (p_organization_id, 'SponsorRemoved', 'sponsor', p_sponsor_id, '{}'::jsonb, (select auth.uid()), coalesce((select auth.uid())::text, 'system'));
  return jsonb_build_object('id', p_sponsor_id, 'removed', true);
end $function$;

/* ---------- 2. Corregir lo capturado ---------- */
create or replace function private.command_update_sponsor_payment(p_organization_id uuid, p_payment_id uuid, p_amount numeric, p_paid_on date, p_method text, p_reference text, p_note text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'app', 'private' as $function$
declare v_row app.sponsor_agreement_payments; v_method text;
begin
  if not private.has_module_access(p_organization_id, 'sponsors', true) then raise exception 'Not authorized'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
  v_method := nullif(trim(coalesce(p_method, '')), '');
  if v_method is not null and v_method not in ('transferencia', 'efectivo', 'cheque', 'deposito', 'otro') then raise exception 'Invalid payment method'; end if;
  update app.sponsor_agreement_payments set amount = p_amount, paid_on = coalesce(p_paid_on, paid_on), method = v_method,
    reference = nullif(trim(coalesce(p_reference, '')), ''), note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_payment_id and organization_id = p_organization_id returning * into v_row;
  if v_row.id is null then raise exception 'Payment not found'; end if;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id, actor)
  values (p_organization_id, 'SponsorPaymentUpdated', 'sponsor_agreement', v_row.agreement_id,
    jsonb_build_object('paymentId', v_row.id, 'amount', v_row.amount, 'paidOn', v_row.paid_on), (select auth.uid()), coalesce((select auth.uid())::text, 'system'));
  return jsonb_build_object('id', v_row.id, 'agreementId', v_row.agreement_id, 'amount', v_row.amount, 'paidOn', v_row.paid_on,
    'method', v_row.method, 'reference', v_row.reference, 'note', v_row.note, 'createdAt', v_row.created_at);
end $function$;

create or replace function private.command_update_sponsor_evidence_note(p_organization_id uuid, p_evidence_id uuid, p_note text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'app', 'private' as $function$
begin
  if not private.has_module_access(p_organization_id, 'sponsors', true) then raise exception 'Not authorized'; end if;
  update app.sponsor_agreement_item_evidence set note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_evidence_id and organization_id = p_organization_id;
  if not found then raise exception 'Evidence not found'; end if;
  return jsonb_build_object('id', p_evidence_id, 'note', nullif(trim(coalesce(p_note, '')), ''));
end $function$;

create or replace function private.command_update_sponsor_movement(p_organization_id uuid, p_movement_id uuid, p_movement_type text, p_result text, p_void boolean)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'app', 'private' as $function$
begin
  if not private.has_module_access(p_organization_id, 'sponsors', true) then raise exception 'Not authorized'; end if;
  if coalesce(p_void, false) then
    update app.sponsor_movements set voided_at = now() where id = p_movement_id and organization_id = p_organization_id and voided_at is null;
  else
    if p_movement_type not in ('call', 'whatsapp', 'email', 'meeting', 'note') then raise exception 'Invalid movement type'; end if;
    if coalesce(length(trim(p_result)), 0) < 2 then raise exception 'Movement result required'; end if;
    update app.sponsor_movements set movement_type = p_movement_type, result = trim(p_result)
     where id = p_movement_id and organization_id = p_organization_id and voided_at is null;
  end if;
  if not found then raise exception 'Movement not found'; end if;
  return jsonb_build_object('id', p_movement_id, 'voided', coalesce(p_void, false));
end $function$;

create or replace function private.command_update_social_metric(p_organization_id uuid, p_metric_id uuid, p_value numeric, p_unit text, p_window_label text,
  p_period_start date, p_period_end date, p_source text, p_validation text, p_notes text, p_void boolean)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'app', 'private' as $function$
begin
  if not private.has_module_access(p_organization_id, 'sponsors', true) then raise exception 'Not authorized'; end if;
  if coalesce(p_void, false) then
    update app.social_metrics set voided_at = now() where id = p_metric_id and organization_id = p_organization_id and voided_at is null;
  else
    if p_value is null or p_value < 0 then raise exception 'Metric value required'; end if;
    if p_period_end is null then raise exception 'Metric period required'; end if;
    if coalesce(length(trim(p_source)), 0) < 2 then raise exception 'Metric source required'; end if;
    if p_validation not in ('CONFIRMADO', 'APROXIMADO', 'ESTIMADO', 'PENDIENTE') then raise exception 'Invalid metric validation'; end if;
    update app.social_metrics set value = p_value, unit = nullif(trim(coalesce(p_unit, '')), ''), window_label = nullif(trim(coalesce(p_window_label, '')), ''),
      period_start = p_period_start, period_end = p_period_end, source = trim(p_source), validation = p_validation, notes = nullif(trim(coalesce(p_notes, '')), '')
     where id = p_metric_id and organization_id = p_organization_id and voided_at is null;
  end if;
  if not found then raise exception 'Metric not found'; end if;
  return jsonb_build_object('id', p_metric_id, 'voided', coalesce(p_void, false));
end $function$;

create or replace function private.command_clear_sponsor_asset_photo(p_organization_id uuid, p_asset_id uuid)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'app', 'private' as $function$
begin
  if not private.has_module_access(p_organization_id, 'sponsors', true) then raise exception 'Not authorized'; end if;
  update app.sponsor_assets set photo_bucket = null, photo_path = null, photo_thumb_path = null, updated_at = now()
   where id = p_asset_id and organization_id = p_organization_id and archived_at is null;
  if not found then raise exception 'Tanner asset not found'; end if;
  return jsonb_build_object('id', p_asset_id, 'photoPath', null);
end $function$;

/* ---------- 3. Cotizaciones ---------- */
create table if not exists app.sponsor_quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  folio text not null,
  sponsor_id uuid references app.sponsors(id),
  prospect_name text,
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'rejected')),
  subtotal numeric not null default 0 check (subtotal >= 0),
  discount_type text check (discount_type in ('pct', 'amount')),
  discount_value numeric check (discount_value is null or discount_value >= 0),
  discount_amount numeric not null default 0 check (discount_amount >= 0),
  discount_pct numeric not null default 0,
  total numeric not null default 0 check (total >= 0),
  approval_status text not null default 'none' check (approval_status in ('none', 'pending', 'approved', 'rejected')),
  approval_note text,
  approved_by uuid,
  approved_at timestamptz,
  notes text,
  valid_until date,
  agreement_id uuid references app.sponsor_agreements(id),
  sent_at timestamptz,
  decided_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, folio)
);
create table if not exists app.sponsor_quote_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  quote_id uuid not null references app.sponsor_quotes(id),
  asset_id uuid references app.sponsor_assets(id),
  description text not null check (length(trim(description)) between 2 and 500),
  unit_price numeric not null default 0 check (unit_price >= 0),
  quantity numeric not null default 1 check (quantity > 0),
  unit text,
  sort_order int not null default 0,
  voided_at timestamptz
);
create index if not exists sponsor_quotes_org_idx on app.sponsor_quotes (organization_id, status) where archived_at is null;
create index if not exists sponsor_quote_items_quote_idx on app.sponsor_quote_items (quote_id) where voided_at is null;
alter table app.sponsor_quotes enable row level security;
alter table app.sponsor_quote_items enable row level security;
revoke all on app.sponsor_quotes from anon, authenticated;
revoke all on app.sponsor_quote_items from anon, authenticated;

-- El tope: arriba de esto, Presidencia autoriza.
create or replace function private.sponsor_quote_discount_cap(p_organization_id uuid)
returns numeric language sql stable security definer set search_path to 'pg_catalog', 'public' as $function$
  select coalesce((select (o.settings->>'sponsorQuoteDiscountCapPct')::numeric from public.organizations o where o.id = p_organization_id), 10)
$function$;

create or replace function private.sponsor_quote_json(p_quote_id uuid)
returns jsonb language sql stable security definer set search_path to 'pg_catalog', 'app', 'private' as $function$
  select jsonb_build_object('id', q.id, 'folio', q.folio, 'sponsorId', q.sponsor_id,
    'sponsorName', coalesce((select s.name from app.sponsors s where s.id = q.sponsor_id), q.prospect_name), 'prospectName', q.prospect_name,
    'status', q.status, 'subtotal', q.subtotal, 'discountType', q.discount_type, 'discountValue', q.discount_value,
    'discountAmount', q.discount_amount, 'discountPct', q.discount_pct, 'total', q.total,
    'approvalStatus', q.approval_status, 'approvalNote', q.approval_note,
    'approvedByName', case when q.approved_by is null then null else private.chat_name(q.approved_by) end, 'approvedAt', q.approved_at,
    'notes', q.notes, 'validUntil', q.valid_until, 'agreementId', q.agreement_id, 'sentAt', q.sent_at, 'decidedAt', q.decided_at,
    'createdByName', case when q.created_by is null then null else private.chat_name(q.created_by) end, 'createdAt', q.created_at, 'updatedAt', q.updated_at,
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'assetId', i.asset_id, 'description', i.description, 'unitPrice', i.unit_price,
        'quantity', i.quantity, 'unit', i.unit, 'lineTotal', i.unit_price * i.quantity) order by i.sort_order)
      from app.sponsor_quote_items i where i.quote_id = q.id and i.voided_at is null), '[]'::jsonb))
  from app.sponsor_quotes q where q.id = p_quote_id
$function$;

create or replace function private.command_save_sponsor_quote(p_organization_id uuid, p_quote_id uuid, p_sponsor_id uuid, p_prospect_name text,
  p_discount_type text, p_discount_value numeric, p_notes text, p_valid_until date, p_items jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'app', 'private', 'public' as $function$
declare
  v_id uuid := p_quote_id; v_actor uuid := (select auth.uid()); v_old app.sponsor_quotes;
  v_subtotal numeric := 0; v_desc numeric := 0; v_pct numeric := 0; v_cap numeric; v_approval text := 'none';
  v_item jsonb; v_n int := 0; v_folio text; v_year text := to_char(now() at time zone 'America/Mexico_City', 'YYYY');
begin
  if not private.has_module_access(p_organization_id, 'sponsors', true) then raise exception 'Not authorized'; end if;
  if p_sponsor_id is null and coalesce(length(trim(p_prospect_name)), 0) < 2 then raise exception 'Quote needs a brand'; end if;
  if p_sponsor_id is not null and not exists (select 1 from app.sponsors where id = p_sponsor_id and organization_id = p_organization_id and removed_at is null) then
    raise exception 'Sponsor not found';
  end if;
  if jsonb_typeof(coalesce(p_items, 'null'::jsonb)) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Quote needs items'; end if;
  if p_discount_type is not null and p_discount_type not in ('pct', 'amount') then raise exception 'Invalid discount type'; end if;
  if coalesce(p_discount_value, 0) < 0 then raise exception 'Invalid discount'; end if;

  if v_id is not null then
    select * into v_old from app.sponsor_quotes where id = v_id and organization_id = p_organization_id and archived_at is null for update;
    if not found then raise exception 'Quote not found'; end if;
    if v_old.status = 'accepted' then raise exception 'Quote already accepted'; end if;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if coalesce(length(trim(v_item->>'description')), 0) < 2 then raise exception 'Quote item needs a description'; end if;
    if coalesce((v_item->>'unitPrice')::numeric, 0) < 0 or coalesce((v_item->>'quantity')::numeric, 1) <= 0 then raise exception 'Invalid quote item'; end if;
    if nullif(v_item->>'assetId', '') is not null and not exists (select 1 from app.sponsor_assets a where a.id = (v_item->>'assetId')::uuid and a.organization_id = p_organization_id) then
      raise exception 'Tanner asset not found';
    end if;
    v_subtotal := v_subtotal + coalesce((v_item->>'unitPrice')::numeric, 0) * coalesce((v_item->>'quantity')::numeric, 1);
  end loop;

  v_desc := case p_discount_type when 'pct' then round(v_subtotal * least(coalesce(p_discount_value, 0), 100) / 100, 2)
                                 when 'amount' then least(coalesce(p_discount_value, 0), v_subtotal) else 0 end;
  v_pct := case when v_subtotal > 0 then round(v_desc / v_subtotal * 100, 2) else 0 end;
  v_cap := private.sponsor_quote_discount_cap(p_organization_id);
  if v_pct > v_cap then
    v_approval := case when private.is_presidency(p_organization_id) then 'approved'
                       when v_old.id is not null and v_old.approval_status = 'approved' and v_old.discount_pct >= v_pct then 'approved'
                       else 'pending' end;
  end if;

  if v_id is null then
    select coalesce(max(nullif(split_part(folio, '-', 3), '')::int), 0) + 1 into v_n
      from app.sponsor_quotes where organization_id = p_organization_id and folio like 'COT-' || v_year || '-%';
    v_folio := 'COT-' || v_year || '-' || lpad(v_n::text, 3, '0');
    insert into app.sponsor_quotes (organization_id, folio, sponsor_id, prospect_name, subtotal, discount_type, discount_value, discount_amount, discount_pct, total,
      approval_status, approved_by, approved_at, notes, valid_until, created_by)
    values (p_organization_id, v_folio, p_sponsor_id, nullif(trim(coalesce(p_prospect_name, '')), ''), v_subtotal, p_discount_type, p_discount_value, v_desc, v_pct,
      v_subtotal - v_desc, v_approval, case when v_approval = 'approved' then v_actor end, case when v_approval = 'approved' then now() end,
      nullif(trim(coalesce(p_notes, '')), ''), coalesce(p_valid_until, current_date + 30), v_actor)
    returning id into v_id;
  else
    update app.sponsor_quotes set sponsor_id = p_sponsor_id, prospect_name = nullif(trim(coalesce(p_prospect_name, '')), ''), subtotal = v_subtotal,
      discount_type = p_discount_type, discount_value = p_discount_value, discount_amount = v_desc, discount_pct = v_pct, total = v_subtotal - v_desc,
      approval_status = v_approval,
      approved_by = case when v_approval = 'approved' then coalesce(case when v_old.approval_status = 'approved' then v_old.approved_by end, v_actor) end,
      approved_at = case when v_approval = 'approved' then coalesce(case when v_old.approval_status = 'approved' then v_old.approved_at end, now()) end,
      approval_note = case when v_approval = 'none' then null else approval_note end,
      -- Si cambió algo, una enviada regresa a borrador hasta que se vuelva a enviar.
      status = 'draft', sent_at = null,
      notes = nullif(trim(coalesce(p_notes, '')), ''), valid_until = coalesce(p_valid_until, valid_until), updated_at = now()
     where id = v_id;
    update app.sponsor_quote_items set voided_at = now() where quote_id = v_id and voided_at is null;
  end if;

  v_n := 0;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_n := v_n + 1;
    insert into app.sponsor_quote_items (organization_id, quote_id, asset_id, description, unit_price, quantity, unit, sort_order)
    values (p_organization_id, v_id, nullif(v_item->>'assetId', '')::uuid, trim(v_item->>'description'), coalesce((v_item->>'unitPrice')::numeric, 0),
      coalesce((v_item->>'quantity')::numeric, 1), nullif(trim(coalesce(v_item->>'unit', '')), ''), v_n);
  end loop;

  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id, actor)
  values (p_organization_id, case when p_quote_id is null then 'SponsorQuoteCreated' else 'SponsorQuoteUpdated' end, 'sponsor_quote', v_id,
    jsonb_build_object('total', v_subtotal - v_desc, 'discountPct', v_pct, 'approval', v_approval), v_actor, coalesce(v_actor::text, 'system'));
  return private.sponsor_quote_json(v_id);
end $function$;

create or replace function private.command_decide_sponsor_quote_discount(p_organization_id uuid, p_quote_id uuid, p_approve boolean, p_note text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'app', 'private' as $function$
begin
  if not private.is_presidency(p_organization_id) then raise exception 'Only presidency can approve discounts'; end if;
  update app.sponsor_quotes set approval_status = case when p_approve then 'approved' else 'rejected' end,
    approved_by = (select auth.uid()), approved_at = now(), approval_note = nullif(trim(coalesce(p_note, '')), ''), updated_at = now()
   where id = p_quote_id and organization_id = p_organization_id and archived_at is null and approval_status in ('pending', 'rejected', 'approved') and status <> 'accepted';
  if not found then raise exception 'Quote not found'; end if;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id, actor)
  values (p_organization_id, case when p_approve then 'SponsorQuoteDiscountApproved' else 'SponsorQuoteDiscountRejected' end, 'sponsor_quote', p_quote_id,
    '{}'::jsonb, (select auth.uid()), coalesce((select auth.uid())::text, 'system'));
  return private.sponsor_quote_json(p_quote_id);
end $function$;

-- Estados: enviar (si el descuento está en regla), aceptar (nace el acuerdo
-- con todo lo cotizado y, si no existía, la marca), rechazar o regresar a borrador.
create or replace function private.command_set_sponsor_quote_status(p_organization_id uuid, p_quote_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'app', 'private' as $function$
declare
  q app.sponsor_quotes; v_sponsor uuid; v_agreement uuid; v_actor uuid := (select auth.uid()); r record; v_n int := 0;
begin
  if not private.has_module_access(p_organization_id, 'sponsors', true) then raise exception 'Not authorized'; end if;
  if p_status not in ('draft', 'sent', 'accepted', 'rejected') then raise exception 'Invalid quote status'; end if;
  select * into q from app.sponsor_quotes where id = p_quote_id and organization_id = p_organization_id and archived_at is null for update;
  if not found then raise exception 'Quote not found'; end if;
  if q.status = 'accepted' then raise exception 'Quote already accepted'; end if;
  if p_status in ('sent', 'accepted') and q.approval_status in ('pending', 'rejected') then raise exception 'Discount needs presidency approval'; end if;

  if p_status = 'accepted' then
    v_sponsor := q.sponsor_id;
    if v_sponsor is null then
      select id into v_sponsor from app.sponsors where organization_id = p_organization_id and removed_at is null and lower(name) = lower(q.prospect_name) limit 1;
      if v_sponsor is null then
        insert into app.sponsors (organization_id, name, sponsor_type, relationship_type, stage, status, stage_changed_at)
        values (p_organization_id, q.prospect_name, 'Patrocinio', 'sponsorship', 'active', 'active', now()) returning id into v_sponsor;
      end if;
    end if;
    update app.sponsors set stage = 'active', status = 'active', archived_at = null, stage_changed_at = case when stage is distinct from 'active' then now() else stage_changed_at end, updated_at = now()
     where id = v_sponsor;
    insert into app.sponsor_agreements (organization_id, sponsor_id, status, monetary_value, notes)
    values (p_organization_id, v_sponsor, 'draft', q.total, 'Nace de la cotización ' || q.folio || '. Pon fechas y márcalo Activo al firmar.')
    returning id into v_agreement;
    insert into app.sponsor_agreement_items (organization_id, agreement_id, direction, item_type, description, quantity, estimated_value, fulfillment_status, sort_order)
    values (p_organization_id, v_agreement, 'receive', 'money', 'Pago de la cotización ' || q.folio, 1, q.total, 'pending', 1);
    for r in select i.*, a.category from app.sponsor_quote_items i left join app.sponsor_assets a on a.id = i.asset_id
              where i.quote_id = q.id and i.voided_at is null order by i.sort_order loop
      v_n := v_n + 1;
      insert into app.sponsor_agreement_items (organization_id, agreement_id, direction, item_type, description, quantity, unit, estimated_value, sponsor_asset_id, fulfillment_status, sort_order)
      values (p_organization_id, v_agreement, 'give',
        case r.category when 'uniforms' then 'jersey' when 'park' then 'banner' when 'sports' then 'activation' when 'digital' then 'social' when 'content' then 'social' else 'other' end,
        r.description, r.quantity, r.unit, r.unit_price * r.quantity, r.asset_id, 'pending', v_n);
      if r.category = 'uniforms' and r.asset_id is not null then
        update app.sponsor_assets set availability = 'occupied', updated_at = now() where id = r.asset_id;
      end if;
    end loop;
    update app.sponsor_quotes set status = 'accepted', sponsor_id = v_sponsor, agreement_id = v_agreement, decided_at = now(), updated_at = now() where id = q.id;
  else
    update app.sponsor_quotes set status = p_status,
      sent_at = case when p_status = 'sent' then now() when p_status = 'draft' then null else sent_at end,
      decided_at = case when p_status = 'rejected' then now() else null end, updated_at = now()
     where id = q.id;
  end if;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id, actor)
  values (p_organization_id, 'SponsorQuoteStatusChanged', 'sponsor_quote', q.id, jsonb_build_object('status', p_status, 'agreementId', v_agreement),
    v_actor, coalesce(v_actor::text, 'system'));
  return private.sponsor_quote_json(q.id);
end $function$;

create or replace function private.command_archive_sponsor_quote(p_organization_id uuid, p_quote_id uuid)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'app', 'private' as $function$
begin
  if not private.has_module_access(p_organization_id, 'sponsors', true) then raise exception 'Not authorized'; end if;
  update app.sponsor_quotes set archived_at = now(), updated_at = now()
   where id = p_quote_id and organization_id = p_organization_id and archived_at is null and status <> 'accepted';
  if not found then raise exception 'Quote not found'; end if;
  return jsonb_build_object('id', p_quote_id, 'archived', true);
end $function$;

create or replace function private.query_sponsor_quotes(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog', 'app', 'private' as $function$
begin
  if not private.has_module_access(p_organization_id, 'sponsors', false) then raise exception 'Not authorized'; end if;
  return jsonb_build_object('discountCapPct', private.sponsor_quote_discount_cap(p_organization_id), 'isPresidency', private.is_presidency(p_organization_id),
    'quotes', coalesce((select jsonb_agg(private.sponsor_quote_json(q.id) order by q.created_at desc)
      from app.sponsor_quotes q where q.organization_id = p_organization_id and q.archived_at is null), '[]'::jsonb));
end $function$;

/* ---------- Envolturas públicas ---------- */
create or replace function public.v2_set_sponsor_archived(organization_id uuid, sponsor_id uuid, archived boolean)
returns jsonb language sql security definer set search_path to 'pg_catalog', 'private' as $f$ select private.command_set_sponsor_archived(organization_id, sponsor_id, archived) $f$;
create or replace function public.v2_remove_sponsor(organization_id uuid, sponsor_id uuid)
returns jsonb language sql security definer set search_path to 'pg_catalog', 'private' as $f$ select private.command_remove_sponsor(organization_id, sponsor_id) $f$;
create or replace function public.v2_update_sponsor_payment(organization_id uuid, payment_id uuid, amount numeric, paid_on date, method text, reference text, note text)
returns jsonb language sql security definer set search_path to 'pg_catalog', 'private' as $f$ select private.command_update_sponsor_payment(organization_id, payment_id, amount, paid_on, method, reference, note) $f$;
create or replace function public.v2_update_sponsor_evidence_note(organization_id uuid, evidence_id uuid, note text)
returns jsonb language sql security definer set search_path to 'pg_catalog', 'private' as $f$ select private.command_update_sponsor_evidence_note(organization_id, evidence_id, note) $f$;
create or replace function public.v2_update_sponsor_movement(organization_id uuid, movement_id uuid, movement_type text, result text, voided boolean default false)
returns jsonb language sql security definer set search_path to 'pg_catalog', 'private' as $f$ select private.command_update_sponsor_movement(organization_id, movement_id, movement_type, result, voided) $f$;
create or replace function public.v2_update_social_metric(organization_id uuid, metric_id uuid, value numeric, unit text, window_label text, period_start date, period_end date,
  source text, validation text, notes text, voided boolean default false)
returns jsonb language sql security definer set search_path to 'pg_catalog', 'private' as $f$
  select private.command_update_social_metric(organization_id, metric_id, value, unit, window_label, period_start, period_end, source, validation, notes, voided) $f$;
create or replace function public.v2_clear_sponsor_asset_photo(organization_id uuid, asset_id uuid)
returns jsonb language sql security definer set search_path to 'pg_catalog', 'private' as $f$ select private.command_clear_sponsor_asset_photo(organization_id, asset_id) $f$;
create or replace function public.v2_save_sponsor_quote(organization_id uuid, quote_id uuid, sponsor_id uuid, prospect_name text, discount_type text, discount_value numeric,
  notes text, valid_until date, items jsonb)
returns jsonb language sql security definer set search_path to 'pg_catalog', 'private' as $f$
  select private.command_save_sponsor_quote(organization_id, quote_id, sponsor_id, prospect_name, discount_type, discount_value, notes, valid_until, items) $f$;
create or replace function public.v2_decide_sponsor_quote_discount(organization_id uuid, quote_id uuid, approve boolean, note text default null)
returns jsonb language sql security definer set search_path to 'pg_catalog', 'private' as $f$ select private.command_decide_sponsor_quote_discount(organization_id, quote_id, approve, note) $f$;
create or replace function public.v2_set_sponsor_quote_status(organization_id uuid, quote_id uuid, status text)
returns jsonb language sql security definer set search_path to 'pg_catalog', 'private' as $f$ select private.command_set_sponsor_quote_status(organization_id, quote_id, status) $f$;
create or replace function public.v2_archive_sponsor_quote(organization_id uuid, quote_id uuid)
returns jsonb language sql security definer set search_path to 'pg_catalog', 'private' as $f$ select private.command_archive_sponsor_quote(organization_id, quote_id) $f$;
create or replace function public.v2_sponsor_quotes(organization_id uuid)
returns jsonb language sql stable security definer set search_path to 'pg_catalog', 'private' as $f$ select private.query_sponsor_quotes(organization_id) $f$;

do $grants$
declare f text;
begin
  foreach f in array array[
    'private.command_set_sponsor_archived(uuid,uuid,boolean)', 'private.command_remove_sponsor(uuid,uuid)',
    'private.command_update_sponsor_payment(uuid,uuid,numeric,date,text,text,text)', 'private.command_update_sponsor_evidence_note(uuid,uuid,text)',
    'private.command_update_sponsor_movement(uuid,uuid,text,text,boolean)', 'private.command_update_social_metric(uuid,uuid,numeric,text,text,date,date,text,text,text,boolean)',
    'private.command_clear_sponsor_asset_photo(uuid,uuid)', 'private.sponsor_quote_discount_cap(uuid)', 'private.sponsor_quote_json(uuid)',
    'private.command_save_sponsor_quote(uuid,uuid,uuid,text,text,numeric,text,date,jsonb)', 'private.command_decide_sponsor_quote_discount(uuid,uuid,boolean,text)',
    'private.command_set_sponsor_quote_status(uuid,uuid,text)', 'private.command_archive_sponsor_quote(uuid,uuid)', 'private.query_sponsor_quotes(uuid)'
  ] loop
    execute 'revoke all on function ' || f || ' from public, anon, authenticated';
  end loop;
  foreach f in array array[
    'public.v2_set_sponsor_archived(uuid,uuid,boolean)', 'public.v2_remove_sponsor(uuid,uuid)',
    'public.v2_update_sponsor_payment(uuid,uuid,numeric,date,text,text,text)', 'public.v2_update_sponsor_evidence_note(uuid,uuid,text)',
    'public.v2_update_sponsor_movement(uuid,uuid,text,text,boolean)', 'public.v2_update_social_metric(uuid,uuid,numeric,text,text,date,date,text,text,text,boolean)',
    'public.v2_clear_sponsor_asset_photo(uuid,uuid)', 'public.v2_save_sponsor_quote(uuid,uuid,uuid,text,text,numeric,text,date,jsonb)',
    'public.v2_decide_sponsor_quote_discount(uuid,uuid,boolean,text)', 'public.v2_set_sponsor_quote_status(uuid,uuid,text)',
    'public.v2_archive_sponsor_quote(uuid,uuid)', 'public.v2_sponsor_quotes(uuid)'
  ] loop
    execute 'revoke all on function ' || f || ' from public, anon';
    execute 'grant execute on function ' || f || ' to authenticated';
  end loop;
end
$grants$;

/* ---------- El tablero: sin anulados, con las archivadas y quién es Presidencia ---------- */
do $patch$
declare
  v_def text := pg_get_functiondef('private.query_sponsor_admin(uuid)'::regprocedure);
  v_new text := v_def;
  v_prev text;
begin
  if position('''archivedSponsors''' in v_def) > 0 then return; end if;
  v_prev := v_new;
  v_new := replace(v_new, E'from app.sponsor_movements m\n  where m.organization_id=p_organization_id;', E'from app.sponsor_movements m\n  where m.organization_id=p_organization_id and m.voided_at is null;');
  if v_new = v_prev then raise exception 'query_sponsor_admin: movimientos'; end if;
  v_prev := v_new;
  v_new := replace(v_new, E'from app.social_metrics m\n  where m.organization_id=p_organization_id;', E'from app.social_metrics m\n  where m.organization_id=p_organization_id and m.voided_at is null;');
  if v_new = v_prev then raise exception 'query_sponsor_admin: métricas'; end if;
  v_prev := v_new;
  v_new := replace(v_new, E'''payments'',v_payments\n  );', E'''payments'',v_payments,\n    ''isPresidency'',private.is_presidency(p_organization_id),\n    ''archivedSponsors'',coalesce((select jsonb_agg(jsonb_build_object(''id'',s.id,''name'',s.name,''archivedAt'',s.archived_at) order by s.archived_at desc)\n      from app.sponsors s where s.organization_id=p_organization_id and s.archived_at is not null and s.removed_at is null),''[]''::jsonb)\n  );');
  if v_new = v_prev then raise exception 'query_sponsor_admin: archivadas'; end if;
  execute v_new;
end
$patch$;
