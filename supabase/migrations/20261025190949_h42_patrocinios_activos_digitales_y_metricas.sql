-- h42 · Patrocinios: activos digitales, seguimiento de entregables y métricas (25/10/2026).
--
-- Presidencia compartió TC_TCP_Activos_Digitales_para_TannerOS_2027.xlsx y
-- autorizó ampliar lo que ya existe (sin módulo nuevo, sin borrar nada):
--   1. sponsor_assets gana entidad (TC / TCP / Ambos: Tannery City Park no es
--      otra organización), canal, unidad, familia, validación, la referencia del
--      Excel (external_ref), notas internas y el estado del precio. Un precio
--      que no está 'aprobado' nunca sale en algo que vea la marca.
--   2. sponsor_agreement_items gana responsable, cantidad entregada (7 de 20),
--      frecuencia, estado de auditoría ('por_auditar' o 'venta_aparte', que lo
--      saca de "Les damos" sin borrarlo), la referencia OBL del Excel y un link
--      de evidencia (la publicación).
--   3. social_accounts y social_metrics: cada métrica guarda su red, periodo,
--      unidad, fuente y validación. Son fotos (snapshots): nunca se sobrescriben
--      ni se suman entre redes.
--   4. query_sponsor_admin devuelve todo lo anterior y la meta de efectivo
--      mensual (organizations.settings.sponsorCashGoalMonthly, 30,000 si falta).

alter table app.sponsor_assets
  add column if not exists entity text,
  add column if not exists channel text,
  add column if not exists unit text,
  add column if not exists family text,
  add column if not exists validation text,
  add column if not exists external_ref text,
  add column if not exists internal_notes text,
  add column if not exists price_status text not null default 'por_cotizar';
alter table app.sponsor_assets add constraint sponsor_assets_entity_check check (entity is null or entity in ('TC','TCP','AMBOS'));
alter table app.sponsor_assets add constraint sponsor_assets_price_status_check check (price_status in ('por_cotizar','propuesta','aprobado'));
create unique index if not exists sponsor_assets_external_ref_uq on app.sponsor_assets(organization_id, external_ref) where external_ref is not null;

alter table app.sponsor_agreement_items
  add column if not exists owner_user_id uuid,
  add column if not exists delivered_quantity numeric,
  add column if not exists frequency text,
  add column if not exists audit_status text,
  add column if not exists external_ref text,
  add column if not exists evidence_url text;
alter table app.sponsor_agreement_items add constraint sponsor_items_audit_status_check check (audit_status is null or audit_status in ('por_auditar','venta_aparte'));
alter table app.sponsor_agreement_items add constraint sponsor_items_delivered_check check (delivered_quantity is null or delivered_quantity >= 0);
create unique index if not exists sponsor_items_external_ref_uq on app.sponsor_agreement_items(organization_id, external_ref) where external_ref is not null;

create table if not exists app.social_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  entity text not null check (entity in ('TC','TCP','AMBOS')),
  platform text not null,
  account_type text,
  url text,
  baseline_note text,
  pending_note text,
  external_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists social_accounts_external_ref_uq on app.social_accounts(organization_id, external_ref) where external_ref is not null;
alter table app.social_accounts enable row level security;

create table if not exists app.social_metrics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  entity text not null check (entity in ('TC','TCP','AMBOS')),
  channel text not null,
  metric_key text not null,
  value numeric not null,
  unit text not null,
  window_label text,
  period_start date,
  period_end date not null,
  source text not null,
  validation text not null check (validation in ('CONFIRMADO','APROXIMADO','ESTIMADO','PENDIENTE')),
  notes text,
  external_ref text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists social_metrics_external_ref_uq on app.social_metrics(organization_id, external_ref) where external_ref is not null;
create index if not exists social_metrics_lookup on app.social_metrics(organization_id, entity, channel, metric_key, period_end desc);
alter table app.social_metrics enable row level security;

-- query_sponsor_admin: los campos nuevos y las métricas.
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('private.query_sponsor_admin(uuid)'::regprocedure);
  v_def := replace(v_def, $a$  v_payments jsonb;
begin$a$, $a$  v_payments jsonb;
  v_accounts jsonb;
  v_metrics jsonb;
begin$a$);
  v_def := replace(v_def, $a$    'createdAt',sa.created_at,'updatedAt',sa.updated_at
  ) order by sa.category,sa.name)$a$, $a$    'createdAt',sa.created_at,'updatedAt',sa.updated_at,
    'entity',sa.entity,'channel',sa.channel,'unit',sa.unit,'family',sa.family,'validation',sa.validation,
    'externalRef',sa.external_ref,'internalNotes',sa.internal_notes,'priceStatus',sa.price_status
  ) order by sa.category,sa.name)$a$);
  v_def := replace(v_def, $a$    'sortOrder',i.sort_order,'createdAt',i.created_at,'updatedAt',i.updated_at
  ) order by i.agreement_id$a$, $a$    'sortOrder',i.sort_order,'createdAt',i.created_at,'updatedAt',i.updated_at,
    'ownerUserId',i.owner_user_id,'ownerName',case when i.owner_user_id is null then null else private.chat_name(i.owner_user_id) end,
    'deliveredQuantity',i.delivered_quantity,'frequency',i.frequency,'auditStatus',i.audit_status,
    'externalRef',i.external_ref,'evidenceUrl',i.evidence_url
  ) order by i.agreement_id$a$);
  v_def := replace(v_def, $a$  return jsonb_build_object(
    'sponsors',v_sponsors,$a$, $a$  select coalesce(jsonb_agg(jsonb_build_object(
    'id',sa.id,'entity',sa.entity,'platform',sa.platform,'type',sa.account_type,'url',sa.url,
    'baseline',sa.baseline_note,'pending',sa.pending_note,'externalRef',sa.external_ref
  ) order by sa.entity,sa.platform),'[]'::jsonb)
  into v_accounts
  from app.social_accounts sa
  where sa.organization_id=p_organization_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',m.id,'entity',m.entity,'channel',m.channel,'metric',m.metric_key,'value',m.value,'unit',m.unit,
    'window',m.window_label,'periodStart',m.period_start,'periodEnd',m.period_end,'source',m.source,
    'validation',m.validation,'notes',m.notes,'externalRef',m.external_ref
  ) order by m.entity,m.channel,m.metric_key,m.period_end desc),'[]'::jsonb)
  into v_metrics
  from app.social_metrics m
  where m.organization_id=p_organization_id;

  return jsonb_build_object(
    'socialAccounts',v_accounts,'socialMetrics',v_metrics,
    'cashGoalMonthly',coalesce((select (o.settings->>'sponsorCashGoalMonthly')::numeric from public.organizations o where o.id=p_organization_id),30000),
    'sponsors',v_sponsors,$a$);
  if v_def not like '%socialMetrics%' or v_def not like '%priceStatus%' or v_def not like '%deliveredQuantity%' then
    raise exception 'h42: no se pudo parchar query_sponsor_admin';
  end if;
  execute v_def;
end $$;

-- Alta y edición de activos con los campos nuevos (sobrecarga: la vieja sigue).
create or replace function private.command_upsert_sponsor_asset_admin(p_organization_id uuid, p_asset_id uuid, p_name text, p_category text, p_price numeric, p_description text, p_availability text,
  p_entity text, p_channel text, p_unit text, p_family text, p_validation text, p_internal_notes text, p_price_status text)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare v_id uuid;
begin
  v_id := private.command_upsert_sponsor_asset_admin(p_organization_id, p_asset_id, p_name, p_category, p_price, p_description, p_availability);
  if p_entity is not null and p_entity not in ('TC','TCP','AMBOS') then raise exception 'Invalid asset entity'; end if;
  if coalesce(p_price_status,'por_cotizar') not in ('por_cotizar','propuesta','aprobado') then raise exception 'Invalid price status'; end if;
  update app.sponsor_assets set
    entity=p_entity, channel=nullif(trim(p_channel),''), unit=nullif(trim(p_unit),''), family=nullif(trim(p_family),''),
    validation=nullif(trim(p_validation),''), internal_notes=nullif(trim(p_internal_notes),''),
    price_status=coalesce(p_price_status,'por_cotizar'), updated_at=now()
  where id=v_id and organization_id=p_organization_id;
  return v_id;
end
$function$;
revoke all on function private.command_upsert_sponsor_asset_admin(uuid,uuid,text,text,numeric,text,text,text,text,text,text,text,text,text) from public, anon, authenticated;

create or replace function public.v2_upsert_sponsor_asset_admin(organization_id uuid, asset_id uuid, name text, category text, price numeric, description text, availability text,
  entity text, channel text, unit text, family text, validation text, internal_notes text, price_status text)
returns uuid
language sql
security definer
set search_path to 'pg_catalog', 'private'
as $$ select private.command_upsert_sponsor_asset_admin(organization_id, asset_id, name, category, price, description, availability, entity, channel, unit, family, validation, internal_notes, price_status) $$;
revoke all on function public.v2_upsert_sponsor_asset_admin(uuid,uuid,text,text,numeric,text,text,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.v2_upsert_sponsor_asset_admin(uuid,uuid,text,text,numeric,text,text,text,text,text,text,text,text,text) to authenticated;

-- Seguimiento de un entregable: responsable, cuánto va, frecuencia, auditoría y link.
create or replace function private.command_set_sponsor_item_tracking(p_organization_id uuid, p_item_id uuid, p_owner_user_id uuid, p_delivered_quantity numeric, p_frequency text, p_audit_status text, p_evidence_url text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare v_row app.sponsor_agreement_items%rowtype;
begin
  if not private.has_module_access(p_organization_id,'sponsors',true) then raise exception 'Not authorized'; end if;
  if p_owner_user_id is not null and not exists(select 1 from public.organization_memberships m
      where m.organization_id=p_organization_id and m.user_id=p_owner_user_id and m.active) then
    raise exception 'El responsable no es del club';
  end if;
  if p_delivered_quantity is not null and p_delivered_quantity<0 then raise exception 'La cantidad no puede ser negativa'; end if;
  if p_audit_status is not null and p_audit_status not in ('por_auditar','venta_aparte') then raise exception 'Estado de auditoría inválido'; end if;
  if nullif(trim(p_evidence_url),'') is not null and trim(p_evidence_url) !~* '^https?://' then raise exception 'El link de evidencia debe empezar con https://'; end if;
  update app.sponsor_agreement_items set
    owner_user_id=p_owner_user_id, delivered_quantity=p_delivered_quantity, frequency=nullif(trim(p_frequency),''),
    audit_status=p_audit_status, evidence_url=nullif(trim(p_evidence_url),''), updated_at=now()
  where id=p_item_id and organization_id=p_organization_id
  returning * into v_row;
  if v_row.id is null then raise exception 'Agreement item not found'; end if;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id,actor)
  values(p_organization_id,'SponsorItemTrackingUpdated','sponsor_agreement_item',p_item_id,
    jsonb_build_object('ownerUserId',p_owner_user_id,'deliveredQuantity',p_delivered_quantity,'auditStatus',p_audit_status),
    (select auth.uid()),coalesce((select auth.uid())::text,'system'));
  return jsonb_build_object('id',v_row.id,'deliveredQuantity',v_row.delivered_quantity,'auditStatus',v_row.audit_status);
end
$function$;
revoke all on function private.command_set_sponsor_item_tracking(uuid,uuid,uuid,numeric,text,text,text) from public, anon, authenticated;

create or replace function public.v2_set_sponsor_item_tracking(organization_id uuid, item_id uuid, owner_user_id uuid, delivered_quantity numeric, frequency text, audit_status text, evidence_url text)
returns jsonb
language sql
security definer
set search_path to 'pg_catalog', 'private'
as $$ select private.command_set_sponsor_item_tracking(organization_id, item_id, owner_user_id, delivered_quantity, frequency, audit_status, evidence_url) $$;
revoke all on function public.v2_set_sponsor_item_tracking(uuid,uuid,uuid,numeric,text,text,text) from public, anon;
grant execute on function public.v2_set_sponsor_item_tracking(uuid,uuid,uuid,numeric,text,text,text) to authenticated;

-- Nueva foto de una métrica: siempre se agrega, nunca se sobrescribe.
create or replace function private.command_add_social_metric(p_organization_id uuid, p_entity text, p_channel text, p_metric text, p_value numeric, p_unit text, p_window text, p_period_start date, p_period_end date, p_source text, p_validation text, p_notes text)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare v_id uuid;
begin
  if not private.has_module_access(p_organization_id,'sponsors',true) then raise exception 'Not authorized'; end if;
  if p_entity not in ('TC','TCP','AMBOS') then raise exception 'Entidad inválida'; end if;
  if coalesce(trim(p_channel),'')='' or coalesce(trim(p_metric),'')='' or coalesce(trim(p_unit),'')='' or coalesce(trim(p_source),'')='' then
    raise exception 'Faltan red, métrica, unidad o fuente';
  end if;
  if p_value is null then raise exception 'Falta el valor'; end if;
  if p_period_end is null then raise exception 'Falta la fecha de corte'; end if;
  if p_period_start is not null and p_period_start>p_period_end then raise exception 'El periodo está al revés'; end if;
  if p_validation not in ('CONFIRMADO','APROXIMADO','ESTIMADO','PENDIENTE') then raise exception 'Validación inválida'; end if;
  insert into app.social_metrics(organization_id,entity,channel,metric_key,value,unit,window_label,period_start,period_end,source,validation,notes,created_by)
  values(p_organization_id,p_entity,trim(p_channel),trim(p_metric),p_value,trim(p_unit),nullif(trim(p_window),''),p_period_start,p_period_end,trim(p_source),p_validation,nullif(trim(p_notes),''),(select auth.uid()))
  returning id into v_id;
  return v_id;
end
$function$;
revoke all on function private.command_add_social_metric(uuid,text,text,text,numeric,text,text,date,date,text,text,text) from public, anon, authenticated;

create or replace function public.v2_add_social_metric(organization_id uuid, entity text, channel text, metric text, value numeric, unit text, window_label text, period_start date, period_end date, source text, validation text, notes text)
returns uuid
language sql
security definer
set search_path to 'pg_catalog', 'private'
as $$ select private.command_add_social_metric(organization_id, entity, channel, metric, value, unit, window_label, period_start, period_end, source, validation, notes) $$;
revoke all on function public.v2_add_social_metric(uuid,text,text,text,numeric,text,text,date,date,text,text,text) from public, anon;
grant execute on function public.v2_add_social_metric(uuid,text,text,text,numeric,text,text,date,date,text,text,text) to authenticated;
