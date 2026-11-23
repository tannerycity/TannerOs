-- SAAS COMERCIAL V1 · Mi Club FC — BORRADOR, NO APLICADA (23/11/2026)
--
-- Presidencia: "convertir lo que ya existe en un SaaS comercial, multiacademia,
-- modular, seguro, medible y escalable". Diagnostico y decisiones en
-- docs/saas-comercial/. Este archivo NO se aplica solo: ver
-- docs/saas-comercial/04-despliegue.md.
--
-- Que hace (solo agrega; no borra, no reescribe datos):
--   1. Catalogo versionado: planes por capacidad (Semilla 20 ... Elite),
--      complementos y paquetes, con precio en CENTAVOS y IVA/descuento en bp.
--      Una version aprobada ya no se edita: un cambio de precio es una version
--      nueva. Aprobar NO es publicar; publicar pide IVA validado y una frase de
--      confirmacion.
--   2. Estado tecnico de cada modulo, separado del estado comercial: un
--      complemento solo se vende si todos sus modulos estan "ready".
--   3. Suscripciones con la foto del precio contratado (catalogo, importes y
--      cotizacion completa). Cambiar de plan = suscripcion nueva; la vieja se
--      queda en el historial con sus importes originales.
--   4. Pagos y eventos del proveedor (Mercado Pago) idempotentes; nada se marca
--      pagado por una redireccion: solo con el pago consultado en la API.
--   5. Datos fiscales y CFDI en "pendiente de integracion". Ningun camino de
--      este archivo marca una factura como timbrada.
--   6. Becas de software, cupones y bitacora de auditoria solo-agregar.
--   7. module_enabled suma lo que da el catalogo nuevo SIN cambiar el resultado
--      para los clubes de hoy (prueba en supabase/tests/saas/).
--
-- Compatibilidad con TannerOS:
--   - Tannery City (plan internal_full) queda fuera: las funciones nuevas se
--     niegan a tocar un club con plan interno.
--   - Los planes nuevos (mc_*) nacen con forSale=false: el cobro viejo
--     (run_club_billing, j4-n4) los ignora y no les emite nada.
--   - Nada se programa en cron aqui. El ciclo diario se agenda a mano, despues.

-- =========================================================== 0. Utilidades
create or replace function private.saas_round(p_num bigint, p_den bigint)
returns bigint language sql immutable set search_path = '' as $$
  -- Mitad hacia arriba, enteros no negativos. La misma regla que redondea() en v2/saas/precios.js.
  select case when p_num < 0 or p_den <= 0 then null else (2 * p_num + p_den) / (2 * p_den) end
$$;
revoke all on function private.saas_round(bigint, bigint) from public, anon, authenticated;

-- ===================================================== 1. Catalogo versionado
create table if not exists public.saas_catalog_versions (
  id uuid primary key default gen_random_uuid(),
  version int not null unique check (version > 0),
  label text not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'published', 'retired')),
  currency text not null default 'MXN' check (currency = 'MXN'),
  vat_bp int not null check (vat_bp between 0 and 10000),
  vat_validated_at timestamptz,
  vat_validated_by uuid,
  vat_validation_note text,
  annual_discount_bp int not null check (annual_discount_bp between 0 and 5000),
  grace_days int not null default 15 check (grace_days between 0 and 90),
  effective_from timestamptz,
  approved_at timestamptz, approved_by uuid,
  published_at timestamptz, published_by uuid,
  retired_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid,
  constraint saas_catalog_approved_has_who check (status = 'draft' or approved_at is not null),
  constraint saas_catalog_published_has_vat check (status <> 'published' or (published_at is not null and vat_validated_at is not null))
);
create unique index if not exists saas_catalog_one_published on public.saas_catalog_versions ((true)) where status = 'published';

create table if not exists public.saas_plan_tiers (
  catalog_version_id uuid not null references public.saas_catalog_versions(id) on delete restrict,
  code text not null check (code ~ '^[A-Z][A-Z0-9_]{1,30}$'),
  name text not null,
  min_players int not null check (min_players >= 0),
  max_players int check (max_players is null or max_players >= min_players),
  monthly_cents int check (monthly_cents is null or monthly_cents >= 0),
  quote_only boolean not null default false,
  plan_id uuid not null references public.plans(id),
  highlights text[] not null default '{}',
  sort_order int not null default 100,
  primary key (catalog_version_id, code),
  constraint saas_tier_price_or_quote check (quote_only or monthly_cents is not null)
);

create table if not exists public.saas_addons (
  catalog_version_id uuid not null references public.saas_catalog_versions(id) on delete restrict,
  code text not null check (code ~ '^[A-Z][A-Z0-9_]{1,30}$'),
  name text not null,
  description text,
  monthly_cents int not null check (monthly_cents >= 0),
  components text[],                       -- paquete: codigos de complementos que incluye
  commercial_status text not null default 'draft' check (commercial_status in ('draft', 'for_sale', 'paused')),
  external_costs text,                     -- APIs de terceros: se cobran aparte, no en la suscripcion
  sort_order int not null default 100,
  primary key (catalog_version_id, code)
);

create table if not exists public.saas_addon_modules (
  catalog_version_id uuid not null,
  addon_code text not null,
  module_code text not null references public.modules(code),
  primary key (catalog_version_id, addon_code, module_code),
  foreign key (catalog_version_id, addon_code) references public.saas_addons(catalog_version_id, code) on delete restrict
);

-- Estado TECNICO del modulo (lo que existe y funciona), separado del comercial.
create table if not exists public.saas_module_readiness (
  module_code text primary key references public.modules(code),
  technical_status text not null check (technical_status in ('ready', 'review', 'partial', 'not_built', 'internal')),
  notes text,
  reviewed_at timestamptz not null default now(),
  reviewed_by uuid
);

-- Una version aprobada o publicada no se toca: cambiar precio = version nueva.
create or replace function private.saas_catalog_frozen_guard()
returns trigger language plpgsql set search_path = '' as $$
declare v_status text; v_id uuid := coalesce(new.catalog_version_id, old.catalog_version_id);
begin
  select status into v_status from public.saas_catalog_versions where id = v_id;
  if v_status is distinct from 'draft' then
    -- Lo unico que cambia en una version aprobada es si un complemento se vende o se pausa.
    if tg_table_name = 'saas_addons' and tg_op = 'UPDATE'
       and (to_jsonb(new) - 'commercial_status') = (to_jsonb(old) - 'commercial_status') then
      return new;
    end if;
    raise exception 'La version % del catalogo ya no es borrador: crea una version nueva para cambiar precios', v_id;
  end if;
  return coalesce(new, old);
end $$;
revoke all on function private.saas_catalog_frozen_guard() from public, anon, authenticated;
drop trigger if exists saas_plan_tiers_frozen on public.saas_plan_tiers;
create trigger saas_plan_tiers_frozen before insert or update or delete on public.saas_plan_tiers for each row execute function private.saas_catalog_frozen_guard();
drop trigger if exists saas_addons_frozen on public.saas_addons;
create trigger saas_addons_frozen before insert or update or delete on public.saas_addons for each row execute function private.saas_catalog_frozen_guard();
drop trigger if exists saas_addon_modules_frozen on public.saas_addon_modules;
create trigger saas_addon_modules_frozen before insert or update or delete on public.saas_addon_modules for each row execute function private.saas_catalog_frozen_guard();

create or replace function private.saas_catalog_version_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'Una version aprobada del catalogo no se borra'; end if;
    return old;
  end if;
  if old.status <> 'draft' and (new.version, new.vat_bp, new.annual_discount_bp, new.grace_days, new.currency)
       is distinct from (old.version, old.vat_bp, old.annual_discount_bp, old.grace_days, old.currency) then
    raise exception 'La version % ya no es borrador: sus importes no cambian', old.version;
  end if;
  if old.status = 'retired' and new.status <> 'retired' then raise exception 'Una version retirada no regresa'; end if;
  return new;
end $$;
revoke all on function private.saas_catalog_version_guard() from public, anon, authenticated;
drop trigger if exists saas_catalog_versions_guard on public.saas_catalog_versions;
create trigger saas_catalog_versions_guard before update or delete on public.saas_catalog_versions for each row execute function private.saas_catalog_version_guard();

-- ======================================================= 2. Suscripciones
create table if not exists public.saas_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  catalog_version_id uuid not null,
  tier_code text not null,
  billing_cycle text not null check (billing_cycle in ('monthly', 'annual')),
  status text not null check (status in ('free', 'pending', 'active', 'past_due', 'grace_period', 'cancelled', 'expired')),
  base_cents bigint not null check (base_cents >= 0),     -- sin IVA, por periodo
  vat_cents bigint not null check (vat_cents >= 0),
  total_cents bigint not null check (total_cents >= 0),
  quote jsonb not null,                                   -- la cotizacion completa al contratar
  starts_at timestamptz,                                  -- null = cuando se apruebe el primer pago
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  cancel_requested_at timestamptz,
  cancelled_at timestamptz,
  grace_until timestamptz,
  replaces_subscription_id uuid references public.saas_subscriptions(id),
  provider text not null default 'none' check (provider in ('none', 'manual', 'mercadopago')),
  environment text check (environment in ('sandbox', 'production')),
  provider_preapproval_id text,
  provider_status text,
  provider_updated_at timestamptz,
  checkout_url text,
  manual_reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (catalog_version_id, tier_code) references public.saas_plan_tiers(catalog_version_id, code),
  constraint saas_sub_total check (total_cents = base_cents + vat_cents),
  constraint saas_sub_free_is_free check (status <> 'free' or total_cents = 0),
  constraint saas_sub_manual_reason check (provider <> 'manual' or length(btrim(coalesce(manual_reason, ''))) >= 10),
  constraint saas_sub_mp_env check (provider <> 'mercadopago' or environment is not null)
);
-- Una sola suscripcion viva por academia (pendientes aparte: pueden convivir con la vigente).
create unique index if not exists saas_sub_one_live on public.saas_subscriptions(organization_id)
  where status in ('free', 'active', 'past_due', 'grace_period');
create unique index if not exists saas_sub_one_pending on public.saas_subscriptions(organization_id) where status = 'pending';
create unique index if not exists saas_sub_provider_id on public.saas_subscriptions(provider, environment, provider_preapproval_id)
  where provider_preapproval_id is not null;
create index if not exists saas_sub_org on public.saas_subscriptions(organization_id, created_at desc);

create table if not exists public.saas_subscription_items (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null,
  organization_id uuid not null,
  catalog_version_id uuid not null,
  addon_code text not null,
  unit_monthly_cents int not null check (unit_monthly_cents >= 0),
  net_cents bigint not null check (net_cents >= 0),       -- lo que se cobra por periodo (0 si lo cubre un paquete)
  covered_by text,
  created_at timestamptz not null default now(),
  unique (subscription_id, addon_code),
  foreign key (subscription_id, organization_id) references public.saas_subscriptions(id, organization_id) on delete restrict,
  foreign key (catalog_version_id, addon_code) references public.saas_addons(catalog_version_id, code)
);
create index if not exists saas_items_org on public.saas_subscription_items(organization_id);

-- Lo contratado no se reescribe: ni de academia, ni de precio, ni de plan.
create or replace function private.saas_subscription_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'Las suscripciones no se borran: se cancelan'; end if;
  if (new.organization_id, new.catalog_version_id, new.tier_code, new.billing_cycle, new.base_cents, new.vat_cents, new.total_cents, new.quote)
     is distinct from (old.organization_id, old.catalog_version_id, old.tier_code, old.billing_cycle, old.base_cents, old.vat_cents, old.total_cents, old.quote) then
    raise exception 'Lo contratado no cambia: un cambio de plan o precio es una suscripcion nueva';
  end if;
  if old.status in ('cancelled', 'expired') and new.status <> old.status then
    raise exception 'Una suscripcion % no se reactiva: se contrata otra', old.status;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function private.saas_subscription_guard() from public, anon, authenticated;
drop trigger if exists saas_subscriptions_guard on public.saas_subscriptions;
create trigger saas_subscriptions_guard before update or delete on public.saas_subscriptions for each row execute function private.saas_subscription_guard();

create or replace function private.saas_item_guard()
returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'Los renglones de una suscripcion no cambian ni se borran'; end $$;
revoke all on function private.saas_item_guard() from public, anon, authenticated;
drop trigger if exists saas_items_guard on public.saas_subscription_items;
create trigger saas_items_guard before update or delete on public.saas_subscription_items for each row execute function private.saas_item_guard();

-- ============================================================ 3. Pagos
create table if not exists public.saas_payments (
  id uuid primary key default gen_random_uuid(),
  receipt_folio bigint generated always as identity unique,   -- comprobante interno (NO es CFDI)
  organization_id uuid not null,
  subscription_id uuid not null,
  provider text not null check (provider in ('manual', 'mercadopago')),
  environment text not null check (environment in ('sandbox', 'production', 'manual')),
  provider_payment_id text not null,
  status text not null check (status in ('pending', 'in_process', 'approved', 'rejected', 'cancelled', 'refunded', 'charged_back')),
  status_detail text,
  amount_cents bigint not null check (amount_cents >= 0),
  currency text not null default 'MXN' check (currency = 'MXN'),
  amount_matches boolean not null,                            -- el monto cobrado = lo contratado
  period_start timestamptz,
  period_end timestamptz,
  approved_at timestamptz,
  provider_updated_at timestamptz,
  manual_reason text,
  recorded_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, environment, provider_payment_id),
  unique (id, organization_id),
  foreign key (subscription_id, organization_id) references public.saas_subscriptions(id, organization_id) on delete restrict
);
create index if not exists saas_payments_org on public.saas_payments(organization_id, created_at desc);

create or replace function private.saas_payment_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'Los pagos no se borran'; end if;
  if (new.organization_id, new.subscription_id, new.provider, new.environment, new.provider_payment_id, new.amount_cents, new.receipt_folio)
     is distinct from (old.organization_id, old.subscription_id, old.provider, old.environment, old.provider_payment_id, old.amount_cents, old.receipt_folio) then
    raise exception 'Un pago no cambia de academia, de suscripcion ni de monto';
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function private.saas_payment_guard() from public, anon, authenticated;
drop trigger if exists saas_payments_guard on public.saas_payments;
create trigger saas_payments_guard before update or delete on public.saas_payments for each row execute function private.saas_payment_guard();

-- Cada aviso del proveedor, una sola vez (llave = el aviso, no el orden de llegada).
create table if not exists public.saas_payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider = 'mercadopago'),
  environment text not null check (environment in ('sandbox', 'production')),
  event_key text not null,
  topic text not null,
  action text,
  resource_id text not null,
  request_id text,
  signature_valid boolean not null,
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'error')),
  attempts int not null default 1,
  last_error text,
  result jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, environment, event_key)
);

-- ============================================================ 4. Fiscal
create table if not exists public.saas_fiscal_profiles (
  organization_id uuid primary key references public.organizations(id) on delete restrict,
  rfc text not null check (rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),
  legal_name text not null check (length(btrim(legal_name)) >= 2),
  tax_regime text not null check (tax_regime ~ '^[0-9]{3}$'),
  zip_code text not null check (zip_code ~ '^[0-9]{5}$'),
  cfdi_use text not null check (cfdi_use ~ '^[A-Z]{1,2}[0-9]{2}$'),
  email text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  updated_by uuid,
  updated_at timestamptz not null default now()
);

-- CFDI emitidos POR Mi Club FC a sus academias. No confundir con el comprobante
-- interno (saas_payments.receipt_folio) ni con el recibo de Mercado Pago.
create table if not exists public.saas_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  payment_id uuid not null,
  status text not null default 'pending_integration'
    check (status in ('pending_integration', 'requested', 'stamped', 'cancel_requested', 'cancelled', 'error')),
  receiver jsonb not null,                -- foto de los datos fiscales al pedirla
  issuer jsonb,                           -- se llena cuando se defina el emisor con el contador
  subtotal_cents bigint not null check (subtotal_cents >= 0),
  vat_cents bigint not null check (vat_cents >= 0),
  total_cents bigint not null check (total_cents = subtotal_cents + vat_cents),
  series text, folio text,
  fiscal_uuid text check (fiscal_uuid is null or fiscal_uuid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  pac_provider text,
  xml_path text, pdf_path text,
  stamped_at timestamptz,
  cancellation_reason text check (cancellation_reason is null or cancellation_reason in ('01', '02', '03', '04')),
  substitutes_invoice_id uuid references public.saas_invoices(id),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payment_id) ,
  foreign key (payment_id, organization_id) references public.saas_payments(id, organization_id) on delete restrict,
  -- Timbrada solo con respuesta real del PAC: folio fiscal, proveedor, XML y fecha.
  constraint saas_invoice_stamped_is_real check (
    status not in ('stamped', 'cancel_requested', 'cancelled')
    or (fiscal_uuid is not null and pac_provider is not null and xml_path is not null and stamped_at is not null))
);

-- ================================================= 5. Becas, cupones, bitacora
create table if not exists public.saas_social_grants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  kind text not null check (kind in ('software_grant', 'discount', 'grace_extension')),
  percent_off_bp int check (percent_off_bp is null or percent_off_bp between 1 and 10000),
  extra_grace_days int check (extra_grace_days is null or extra_grace_days between 1 and 365),
  reason text not null check (length(btrim(reason)) >= 10),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  granted_by uuid not null,
  revoked_at timestamptz, revoked_by uuid, revoke_reason text,
  created_at timestamptz not null default now(),
  constraint saas_grant_period check (ends_at > starts_at),
  constraint saas_grant_shape check (
    (kind in ('software_grant', 'discount') and percent_off_bp is not null and extra_grace_days is null)
    or (kind = 'grace_extension' and extra_grace_days is not null and percent_off_bp is null))
);
create index if not exists saas_grants_org on public.saas_social_grants(organization_id);

create table if not exists public.saas_coupons (
  code text primary key check (code ~ '^[A-Z0-9][A-Z0-9_-]{2,30}$'),
  description text not null,
  percent_off_bp int not null check (percent_off_bp between 1 and 10000),
  applies_to text not null default 'all' check (applies_to in ('all', 'plan', 'addons')),
  valid_from timestamptz not null default now(),
  valid_until timestamptz not null,
  max_redemptions int check (max_redemptions is null or max_redemptions > 0),
  active boolean not null default false,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  check (valid_until > valid_from)
);
create table if not exists public.saas_coupon_redemptions (
  code text not null references public.saas_coupons(code),
  organization_id uuid not null references public.organizations(id),
  subscription_id uuid not null references public.saas_subscriptions(id),
  created_at timestamptz not null default now(),
  primary key (code, organization_id)
);

create table if not exists public.saas_billing_audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid,
  actor_user_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists saas_audit_org on public.saas_billing_audit_log(organization_id, created_at desc);
create or replace function private.saas_audit_append_only()
returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'La bitacora de facturacion solo agrega renglones'; end $$;
revoke all on function private.saas_audit_append_only() from public, anon, authenticated;
drop trigger if exists saas_audit_append_only on public.saas_billing_audit_log;
create trigger saas_audit_append_only before update or delete on public.saas_billing_audit_log for each row execute function private.saas_audit_append_only();

create or replace function private.saas_audit(p_org uuid, p_action text, p_entity text, p_entity_id text, p_before jsonb, p_after jsonb, p_reason text)
returns void language sql security definer set search_path = '' as $$
  insert into public.saas_billing_audit_log(organization_id, actor_user_id, action, entity, entity_id, before, after, reason)
  values (p_org, (select auth.uid()), p_action, p_entity, p_entity_id, p_before, p_after, p_reason)
$$;
revoke all on function private.saas_audit(uuid, text, text, text, jsonb, jsonb, text) from public, anon, authenticated;

-- Todo lo nuevo: RLS encendido, sin politicas y sin permisos. Solo se llega
-- por funciones SECURITY DEFINER que revisan quien pregunta.
do $$
declare t text;
begin
  foreach t in array array['saas_catalog_versions','saas_plan_tiers','saas_addons','saas_addon_modules','saas_module_readiness',
    'saas_subscriptions','saas_subscription_items','saas_payments','saas_payment_events','saas_fiscal_profiles','saas_invoices',
    'saas_social_grants','saas_coupons','saas_coupon_redemptions','saas_billing_audit_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;

-- ================================================== 6. Semillas del catalogo
-- Planes tecnicos (que modulos abre cada nivel). forSale=false: el cobro viejo no los toca.
insert into public.plans (code, name, description, active, metadata) values
  ('mc_semilla_20', 'Semilla 20', 'Mi Club FC · hasta 20 jugadores activos · gratis', true, '{"forSale":false,"catalog":"mi_club_v1","order":10}'),
  ('mc_formativo',  'Formativo',  'Mi Club FC · 21 a 50 jugadores activos', true, '{"forSale":false,"catalog":"mi_club_v1","order":11}'),
  ('mc_ascenso',    'Ascenso',    'Mi Club FC · 51 a 100 jugadores activos', true, '{"forSale":false,"catalog":"mi_club_v1","order":12}'),
  ('mc_primera',    'Primera',    'Mi Club FC · 101 a 250 jugadores activos', true, '{"forSale":false,"catalog":"mi_club_v1","order":13}'),
  ('mc_elite',      'Élite',      'Mi Club FC · 251+ jugadores activos · cotización', true, '{"forSale":false,"catalog":"mi_club_v1","order":14}')
on conflict (code) do nothing;

-- Nucleo (Semilla 20): lo esencial que ya existe y funciona. Formativo suma
-- administracion avanzada; Ascenso, academias/sedes. Primera y Elite = Ascenso
-- (la diferencia v1 es capacidad y atencion). Solo modulos que existen.
with nucleo(m) as (values ('inicio'),('club'),('direccion'),('jugadores'),('jugadores_estado'),('jugadores_familia'),('asistencia'),
       ('calendario'),('callups'),('convocatoria'),('cobranza'),('taquilla'),('finanzas'),('utileria'),('usuarios'),('admin'),
       ('prospectos'),('correcciones'),('visoria_salud')),
     formativo(m) as (select m from nucleo union all values ('contabilidad'),('pago_proveedor'),('encuestas')),
     ascenso(m) as (select m from formativo union all values ('academias')),
     mapa(plan_code, m) as (
       select 'mc_semilla_20', m from nucleo union all select 'mc_formativo', m from formativo
       union all select p, m from ascenso, unnest(array['mc_ascenso','mc_primera','mc_elite']) p)
insert into public.plan_modules (plan_id, module_code, enabled)
select pl.id, x.m, true from mapa x join public.plans pl on pl.code = x.plan_code join public.modules md on md.code = x.m
on conflict do nothing;

-- Estado tecnico, revisado contra el repositorio el 23/11/2026 (docs/saas-comercial/01-matriz-funcional.md).
insert into public.saas_module_readiness (module_code, technical_status, notes)
select v.code, v.st, v.notes from (values
  ('inicio','ready',null),('club','ready',null),('direccion','ready','Incluye Becas'),('jugadores','ready',null),
  ('jugadores_estado','ready',null),('jugadores_familia','ready',null),('asistencia','ready',null),('calendario','ready',null),
  ('callups','ready','Partidos y convocatorias'),('convocatoria','ready',null),('cobranza','ready',null),('taquilla','ready',null),
  ('finanzas','ready',null),('contabilidad','ready','Conciliacion y reportes'),('utileria','ready',null),('usuarios','ready',null),
  ('admin','ready',null),('prospectos','ready','Fichajes. Hoy tambien abre Visorias: separar antes de vender Scouting con visorias'),
  ('correcciones','ready',null),('pago_proveedor','ready',null),('encuestas','ready',null),('visoria_salud','ready',null),
  ('tienda','ready',null),('catalogo','ready',null),('commerce_finance','ready',null),('patrocinadores','ready',null),
  ('scouting','ready',null),('cursosVerano','ready','Programas y eventos'),('academias','ready','Academias y porteros'),
  ('estacionamiento','review','Reglas propias de Tannery (gafete, costos): validar con un segundo club'),
  ('metricas','review','Conectores Meta/Google por club y costo de Windsor sin validar'),
  ('formacion','internal','Metodologia Tannery'),('formacion_direccion','internal','Metodologia Tannery'),
  ('centro_tanner','internal','Reglamento propio de Tannery'),('qa','internal',null),('sync','internal',null)
) v(code, st, notes) join public.modules md on md.code = v.code
on conflict (module_code) do nothing;

-- Version 1: importes aprobados por Presidencia como configuracion inicial
-- (22/11/2026). Nace BORRADOR: se aprueba y se publica desde el portal, con IVA validado.
insert into public.saas_catalog_versions (version, label, status, vat_bp, annual_discount_bp, grace_days, notes)
values (1, 'Catálogo oficial v1', 'draft', 1600, 1000, 15,
        'Importes aprobados por Presidencia el 22/11/2026 como configuracion inicial. IVA 16% sujeto a validacion fiscal. No publicar ni cobrar sin aprobacion final.')
on conflict (version) do nothing;

insert into public.saas_plan_tiers (catalog_version_id, code, name, min_players, max_players, monthly_cents, quote_only, plan_id, highlights, sort_order)
select cv.id, t.code, t.name, t.mn, t.mx, t.cents, t.q, pl.id, t.hl, t.so
from public.saas_catalog_versions cv
cross join (values
  ('SEMILLA_20','Semilla 20',0,20,0,false,'mc_semilla_20',array['Gratis mientras tengas hasta 20 jugadores activos','Sin tarjeta','Jugadores, asistencia, cobranza y portal de familias'],10),
  ('FORMATIVO','Formativo',21,50,29900,false,'mc_formativo',array['Todo Semilla','Contabilidad y conciliación','Encuestas a familias'],20),
  ('ASCENSO','Ascenso',51,100,59900,false,'mc_ascenso',array['Todo Formativo','Academias y porteros'],30),
  ('PRIMERA','Primera',101,250,99900,false,'mc_primera',array['Todo Ascenso','Atención prioritaria'],40),
  ('ELITE','Élite',251,null,null,true,'mc_elite',array['Más de 250 jugadores o varias sedes','Configuración a la medida'],50)
) t(code, name, mn, mx, cents, q, plan_code, hl, so)
join public.plans pl on pl.code = t.plan_code
where cv.version = 1
on conflict do nothing;

insert into public.saas_addons (catalog_version_id, code, name, description, monthly_cents, components, external_costs, sort_order)
select cv.id, a.code, a.name, a.descr, a.cents, a.comp, a.ext, a.so
from public.saas_catalog_versions cv
cross join (values
  ('STORE','Mi Club Tienda','Catálogo, kits y uniformes, pedidos, cobros y rentabilidad.',14900,null::text[],null,10),
  ('SPONSORS','Mi Club Patrocinios','Patrocinadores, acuerdos y activos comerciales.',14900,null,null,20),
  ('MARKETING','Mi Club Marketing','Ideas, campañas y seguimiento.',14900,null,null,30),
  ('ANALYTICS','Mi Club Métricas','Redes, Google y web en un tablero.',14900,null,'Conectores de terceros (Windsor u otros) se cobran aparte',40),
  ('SCOUTING','Mi Club Scouting','Scouting y seguimiento de talento.',19900,null,null,50),
  ('PARKING','Mi Club Estacionamiento','Control de estacionamiento y gafetes.',9900,null,null,60),
  ('MESSAGING','Mi Club Comunicación avanzada','Mensajería masiva y automatizada.',9900,null,'Mensajes de WhatsApp/SMS se cobran aparte',70),
  ('EVENTS','Mi Club Eventos','Programas, cursos y eventos con inscripción.',9900,null,null,80),
  ('PACK_CRECIMIENTO','Pack Crecimiento','Patrocinios + Marketing + Métricas.',34900,array['SPONSORS','MARKETING','ANALYTICS'],null,90)
) a(code, name, descr, cents, comp, ext, so)
where cv.version = 1
on conflict do nothing;

-- MARKETING y MESSAGING no tienen modulo propio que se pueda encender o apagar
-- (Ideas es de todos; mensajeria avanzada no existe): sin modulos, no se venden.
insert into public.saas_addon_modules (catalog_version_id, addon_code, module_code)
select cv.id, x.addon, x.m from public.saas_catalog_versions cv
cross join (values ('STORE','tienda'),('STORE','catalogo'),('STORE','commerce_finance'),('SPONSORS','patrocinadores'),
  ('ANALYTICS','metricas'),('SCOUTING','scouting'),('PARKING','estacionamiento'),('EVENTS','cursosVerano')) x(addon, m)
join public.modules md on md.code = x.m
where cv.version = 1
on conflict do nothing;

-- ============================================ 7. Reglas (funciones privadas)
create or replace function private.saas_is_internal_org(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.subscriptions s join public.plans p on p.id = s.plan_id
                 where s.organization_id = p_org and s.status in ('active', 'trialing') and not coalesce((p.metadata->>'commercial')::boolean, true))
$$;
revoke all on function private.saas_is_internal_org(uuid) from public, anon, authenticated;

-- Jugadores activos UNICOS: una fila de app.players es una persona; las
-- categorias son inscripciones aparte, asi que estar en dos no duplica.
create or replace function private.saas_active_players(p_org uuid)
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from app.players p where p.organization_id = p_org and p.status = 'active' and p.archived_at is null
$$;
revoke all on function private.saas_active_players(uuid) from public, anon, authenticated;

create or replace function private.saas_possible_duplicates(p_org uuid)
returns int language sql stable security definer set search_path = '' as $$
  select coalesce(sum(n - 1), 0)::int from (
    select count(*) n from app.players p
    where p.organization_id = p_org and p.status = 'active' and p.archived_at is null and p.birth_date is not null
    group by lower(btrim(p.first_name)), lower(btrim(p.last_name)), p.birth_date having count(*) > 1) d
$$;
revoke all on function private.saas_possible_duplicates(uuid) from public, anon, authenticated;

-- Un complemento se vende si esta "for_sale", tiene modulos y todos estan "ready".
-- Un paquete, si cada componente se vende.
create or replace function private.saas_addon_sellable(p_version uuid, p_code text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare a public.saas_addons%rowtype; c text;
begin
  select * into a from public.saas_addons where catalog_version_id = p_version and code = p_code;
  if a.code is null or a.commercial_status <> 'for_sale' then return false; end if;
  if a.components is not null then
    foreach c in array a.components loop
      if not private.saas_addon_sellable(p_version, c) then return false; end if;
    end loop;
    return true;
  end if;
  return exists (select 1 from public.saas_addon_modules m where m.catalog_version_id = p_version and m.addon_code = p_code)
     and not exists (select 1 from public.saas_addon_modules m
                     left join public.saas_module_readiness r on r.module_code = m.module_code
                     where m.catalog_version_id = p_version and m.addon_code = p_code
                       and coalesce(r.technical_status, 'not_built') <> 'ready');
end $$;
revoke all on function private.saas_addon_sellable(uuid, text) from public, anon, authenticated;

-- El catalogo en la forma que entiende v2/saas/precios.js.
create or replace function private.saas_catalog_json(p_version uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'version', cv.version, 'id', cv.id, 'status', cv.status, 'moneda', cv.currency, 'ivaBp', cv.vat_bp,
    'ivaValidado', cv.vat_validated_at is not null, 'descuentoAnualBp', cv.annual_discount_bp, 'diasGracia', cv.grace_days,
    'vigenteDesde', cv.effective_from,
    'planes', coalesce((select jsonb_agg(jsonb_build_object('codigo', t.code, 'nombre', t.name, 'min', t.min_players,
        'max', t.max_players, 'mensual', t.monthly_cents, 'cotizar', t.quote_only, 'funciones', to_jsonb(t.highlights))
        order by t.sort_order, t.min_players) from public.saas_plan_tiers t where t.catalog_version_id = cv.id), '[]'::jsonb),
    'complementos', coalesce((select jsonb_agg(jsonb_build_object('codigo', a.code, 'nombre', a.name, 'descripcion', a.description,
        'mensual', a.monthly_cents, 'paquete', to_jsonb(a.components), 'vendible', private.saas_addon_sellable(cv.id, a.code),
        'estadoComercial', a.commercial_status, 'costosExternos', a.external_costs,
        'modulos', coalesce((select jsonb_agg(m.module_code order by m.module_code) from public.saas_addon_modules m
                             where m.catalog_version_id = cv.id and m.addon_code = a.code), '[]'::jsonb))
        order by a.sort_order) from public.saas_addons a where a.catalog_version_id = cv.id), '[]'::jsonb))
  from public.saas_catalog_versions cv where cv.id = p_version
$$;
revoke all on function private.saas_catalog_json(uuid) from public, anon, authenticated;

create or replace function private.saas_published_version()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.saas_catalog_versions where status = 'published' and (effective_from is null or effective_from <= now())
$$;
revoke all on function private.saas_published_version() from public, anon, authenticated;

create or replace function private.saas_line(p_tipo text, p_codigo text, p_nombre text, p_mensual bigint, p_ciclo text, p_desc_bp int, p_cubierto text)
returns jsonb language sql immutable set search_path = '' as $$
  with v as (select
      case when p_cubierto is not null then 0 else p_mensual * case when p_ciclo = 'annual' then 12 else 1 end end bruto,
      case when p_cubierto is not null then 0
           when p_ciclo = 'annual' then private.saas_round(p_mensual * 12 * (10000 - p_desc_bp), 10000)
           else p_mensual end neto)
  select jsonb_build_object('tipo', p_tipo, 'codigo', p_codigo, 'nombre', p_nombre, 'mensual', p_mensual,
    'bruto', v.bruto, 'descuento', v.bruto - v.neto, 'neto', v.neto, 'cubiertoPor', p_cubierto) from v
$$;
revoke all on function private.saas_line(text, text, text, bigint, text, int, text) from public, anon, authenticated;

-- La cotizacion. Pura: recibe el catalogo como dato. Mismas reglas, mismo
-- orden y mismo redondeo que cotiza() en v2/saas/precios.js.
create or replace function private.saas_quote_core(p_catalog jsonb, p_tier text, p_cycle text, p_addons text[], p_players int,
                                                   p_coupon jsonb default null, p_grant_bp int default 0)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_plan jsonb; v_req jsonb; v_c jsonb; v_addons text[]; a text; comp text;
  v_cov jsonb := '{}'::jsonb; v_lineas jsonb := '[]'::jsonb; l jsonb;
  v_desc int := (p_catalog->>'descuentoAnualBp')::int; v_iva_bp int := (p_catalog->>'ivaBp')::int;
  v_sub bigint := 0; v_da bigint := 0; v_base bigint; v_dc bigint := 0; v_db bigint := 0; v_iva bigint; v_aplica bigint := 0; v_bp int;
begin
  if p_cycle is null or p_cycle not in ('monthly', 'annual') then
    return jsonb_build_object('ok', false, 'codigo', 'CICLO', 'error', 'El ciclo es mensual o anual.');
  end if;
  select e into v_plan from jsonb_array_elements(p_catalog->'planes') e where e->>'codigo' = p_tier;
  if v_plan is null then return jsonb_build_object('ok', false, 'codigo', 'PLAN', 'error', 'Ese plan no existe en el catálogo.'); end if;
  if (v_plan->>'cotizar')::boolean or jsonb_typeof(v_plan->'mensual') is distinct from 'number' then
    return jsonb_build_object('ok', false, 'codigo', 'COTIZACION', 'error', format('%s se cotiza con el equipo comercial.', v_plan->>'nombre'));
  end if;
  if jsonb_typeof(v_plan->'max') = 'number' and coalesce(p_players, 0) > (v_plan->>'max')::int then
    select e into v_req from jsonb_array_elements(p_catalog->'planes') e
     where coalesce(p_players, 0) >= (e->>'min')::int and (jsonb_typeof(e->'max') <> 'number' or coalesce(p_players, 0) <= (e->>'max')::int) limit 1;
    return jsonb_build_object('ok', false, 'codigo', 'CAPACIDAD',
      'error', format('Con %s jugadores activos te corresponde %s.', coalesce(p_players, 0), coalesce(v_req->>'nombre', 'un plan mayor')));
  end if;

  select coalesce(array_agg(x order by o), '{}') into v_addons
    from (select x, min(o) o from unnest(coalesce(p_addons, '{}')) with ordinality u(x, o) group by x) s;
  foreach a in array v_addons loop
    select e into v_c from jsonb_array_elements(p_catalog->'complementos') e where e->>'codigo' = a;
    if v_c is null then return jsonb_build_object('ok', false, 'codigo', 'COMPLEMENTO', 'error', format('No existe el complemento %s.', a)); end if;
    if not coalesce((v_c->>'vendible')::boolean, false) then
      return jsonb_build_object('ok', false, 'codigo', 'NO_DISPONIBLE', 'error', format('%s todavía no está disponible.', v_c->>'nombre'));
    end if;
    if jsonb_typeof(v_c->'paquete') = 'array' then
      for comp in select jsonb_array_elements_text(v_c->'paquete') loop v_cov := v_cov || jsonb_build_object(comp, a); end loop;
    end if;
  end loop;

  v_lineas := jsonb_build_array(private.saas_line('plan', v_plan->>'codigo', v_plan->>'nombre', (v_plan->>'mensual')::bigint, p_cycle, v_desc, null));
  foreach a in array v_addons loop
    select e into v_c from jsonb_array_elements(p_catalog->'complementos') e where e->>'codigo' = a;
    v_lineas := v_lineas || private.saas_line(case when jsonb_typeof(v_c->'paquete') = 'array' then 'paquete' else 'complemento' end,
      a, v_c->>'nombre', (v_c->>'mensual')::bigint, p_cycle, v_desc, v_cov->>a);
  end loop;

  for l in select * from jsonb_array_elements(v_lineas) loop
    v_sub := v_sub + (l->>'bruto')::bigint; v_da := v_da + (l->>'descuento')::bigint;
  end loop;
  v_base := v_sub - v_da;

  if p_coupon is not null then
    v_bp := (p_coupon->>'porcentajeBp')::int;
    if v_bp is null or v_bp <= 0 or v_bp > 10000 then return jsonb_build_object('ok', false, 'codigo', 'CUPON', 'error', 'Cupón inválido.'); end if;
    for l in select * from jsonb_array_elements(v_lineas) loop
      if coalesce(p_coupon->>'aplicaA', 'todo') not in ('plan', 'complementos')
         or (p_coupon->>'aplicaA' = 'plan' and l->>'tipo' = 'plan')
         or (p_coupon->>'aplicaA' = 'complementos' and l->>'tipo' <> 'plan') then
        v_aplica := v_aplica + (l->>'neto')::bigint;
      end if;
    end loop;
    v_dc := private.saas_round(v_aplica * v_bp, 10000);
    v_base := v_base - v_dc;
  end if;
  if coalesce(p_grant_bp, 0) < 0 or coalesce(p_grant_bp, 0) > 10000 then
    return jsonb_build_object('ok', false, 'codigo', 'BECA', 'error', 'Beca inválida.');
  end if;
  v_db := private.saas_round(v_base * coalesce(p_grant_bp, 0), 10000);
  v_base := v_base - v_db;
  v_iva := private.saas_round(v_base * v_iva_bp, 10000);

  return jsonb_build_object('ok', true, 'version', (p_catalog->>'version')::int, 'plan', v_plan->>'codigo', 'ciclo', p_cycle,
    'meses', case when p_cycle = 'annual' then 12 else 1 end, 'moneda', coalesce(p_catalog->>'moneda', 'MXN'),
    'lineas', v_lineas, 'subtotal', v_sub, 'descuentoAnual', v_da, 'descuentoCupon', v_dc, 'descuentoBeca', v_db,
    'base', v_base, 'ivaBp', v_iva_bp, 'iva', v_iva, 'total', v_base + v_iva, 'requierePago', v_base + v_iva > 0);
end $$;
revoke all on function private.saas_quote_core(jsonb, text, text, text[], int, jsonb, int) from public, anon, authenticated;

-- Beca o descuento social vigente (el mayor, si hubiera dos).
create or replace function private.saas_grant_bp(p_org uuid)
returns int language sql stable security definer set search_path = '' as $$
  select coalesce(max(g.percent_off_bp), 0)::int from public.saas_social_grants g
  where g.organization_id = p_org and g.kind in ('software_grant', 'discount') and g.revoked_at is null
    and g.starts_at <= now() and g.ends_at > now()
$$;
revoke all on function private.saas_grant_bp(uuid) from public, anon, authenticated;

create or replace function private.saas_coupon_json(p_code text, p_org uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('codigo', c.code, 'porcentajeBp', c.percent_off_bp,
           'aplicaA', case c.applies_to when 'plan' then 'plan' when 'addons' then 'complementos' else 'todo' end)
  from public.saas_coupons c
  where c.code = upper(btrim(p_code)) and c.active and c.valid_from <= now() and c.valid_until > now()
    and (c.max_redemptions is null or (select count(*) from public.saas_coupon_redemptions r where r.code = c.code) < c.max_redemptions)
    and not exists (select 1 from public.saas_coupon_redemptions r where r.code = c.code and r.organization_id = p_org)
$$;
revoke all on function private.saas_coupon_json(text, uuid) from public, anon, authenticated;

-- Cotizacion de una academia real: catalogo publicado (o el indicado, solo
-- para la plataforma), sus jugadores activos, su cupon y su beca.
create or replace function private.saas_quote_for(p_org uuid, p_version uuid, p_tier text, p_cycle text, p_addons text[], p_coupon text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_cupon jsonb; r jsonb;
begin
  if p_version is null then return jsonb_build_object('ok', false, 'codigo', 'SIN_CATALOGO', 'error', 'El catálogo todavía no está publicado.'); end if;
  if nullif(btrim(coalesce(p_coupon, '')), '') is not null then
    v_cupon := private.saas_coupon_json(p_coupon, p_org);
    if v_cupon is null then return jsonb_build_object('ok', false, 'codigo', 'CUPON', 'error', 'Ese cupón no existe, venció o ya lo usaste.'); end if;
  end if;
  r := private.saas_quote_core(private.saas_catalog_json(p_version), p_tier, p_cycle, p_addons,
                               private.saas_active_players(p_org), v_cupon, private.saas_grant_bp(p_org));
  return r || jsonb_build_object('jugadoresActivos', private.saas_active_players(p_org), 'catalogoId', p_version);
end $$;
revoke all on function private.saas_quote_for(uuid, uuid, text, text, text[], text) from public, anon, authenticated;

-- Cupo de la academia. Nunca bloquea: avisa, cuenta la gracia y dice a que plan subir.
create or replace function private.saas_capacity(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.saas_subscriptions%rowtype; t public.saas_plan_tiers%rowtype; v_n int := private.saas_active_players(p_org);
        v_req text; v_grace int; v_extra int;
begin
  select * into s from public.saas_subscriptions where organization_id = p_org and status in ('free', 'active', 'past_due', 'grace_period');
  if s.id is null then return jsonb_build_object('estado', 'sin_plan', 'activos', v_n); end if;
  select * into t from public.saas_plan_tiers where catalog_version_id = s.catalog_version_id and code = s.tier_code;
  select code into v_req from public.saas_plan_tiers where catalog_version_id = s.catalog_version_id
    and v_n >= min_players and (max_players is null or v_n <= max_players) order by min_players limit 1;
  select grace_days into v_grace from public.saas_catalog_versions where id = s.catalog_version_id;
  select coalesce(sum(extra_grace_days), 0) into v_extra from public.saas_social_grants
   where organization_id = p_org and kind = 'grace_extension' and revoked_at is null and starts_at <= now() and ends_at > now();
  if t.max_players is null or v_n <= t.max_players then
    return jsonb_build_object('estado', case when t.max_players is not null and v_n >= ceil(t.max_players * 0.9) then 'cerca' else 'ok' end,
      'activos', v_n, 'limite', t.max_players, 'plan', t.code, 'requerido', t.code, 'duplicados', private.saas_possible_duplicates(p_org));
  end if;
  return jsonb_build_object('estado', case when s.grace_until is not null and s.grace_until < now() then 'gracia_vencida' else 'excedido' end,
    'activos', v_n, 'limite', t.max_players, 'plan', t.code, 'requerido', v_req, 'exceso', v_n - t.max_players,
    'diasGracia', v_grace + v_extra, 'graciaHasta', s.grace_until, 'duplicados', private.saas_possible_duplicates(p_org));
end $$;
revoke all on function private.saas_capacity(uuid) from public, anon, authenticated;

-- =============================================== 8. Lo que abre cada academia
-- Unica fuente: override del club > plan viejo (como hoy) > catalogo nuevo
-- (plan del nivel + complementos de la suscripcion viva). Para un club sin
-- suscripcion del catalogo nuevo el resultado es EXACTAMENTE el de antes.
create or replace function private.module_enabled(p_organization_id uuid, p_module text)
returns boolean language plpgsql stable security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_module text := private.legacy_module_code(p_module);
  v_override boolean;
begin
  select omo.enabled into v_override
  from public.organization_module_overrides omo
  where omo.organization_id=p_organization_id and omo.module_code=v_module;

  if found then return v_override; end if;

  return exists (
    select 1
    from public.subscriptions s
    join public.plans pl on pl.id=s.plan_id and pl.active=true
    join public.plan_modules pm on pm.plan_id=s.plan_id and pm.module_code=v_module and pm.enabled=true
    where s.organization_id=p_organization_id
      and s.status in ('active','trialing')
      and s.starts_at <= now()
      and (s.current_period_end is null or s.current_period_end >= now())
  ) or exists (
    -- Nivel del catalogo nuevo. pending, cancelled y expired no abren nada (TC-013).
    select 1
    from public.saas_subscriptions ss
    join public.saas_plan_tiers t on t.catalog_version_id=ss.catalog_version_id and t.code=ss.tier_code
    join public.plan_modules pm on pm.plan_id=t.plan_id and pm.module_code=v_module and pm.enabled=true
    where ss.organization_id=p_organization_id and ss.status in ('free','active','past_due','grace_period')
  ) or exists (
    -- Complementos contratados en la suscripcion viva.
    select 1
    from public.saas_subscriptions ss
    join public.saas_subscription_items it on it.subscription_id=ss.id and it.organization_id=ss.organization_id
    join public.saas_addons ad on ad.catalog_version_id=it.catalog_version_id and ad.code=it.addon_code
    join public.saas_addon_modules am on am.catalog_version_id=it.catalog_version_id
      and (am.addon_code=it.addon_code or am.addon_code=any(coalesce(ad.components,'{}')))
    where ss.organization_id=p_organization_id and ss.status in ('free','active','past_due','grace_period')
      and am.module_code=v_module
  ) or exists (
    -- Piso: una academia que ya vive en el catalogo nuevo NUNCA pierde el
    -- nucleo gratuito (sus datos, sus jugadores, Administracion para volver a
    -- contratar), aunque su plan de pago venza o se cancele. Solo pierde lo pagado.
    select 1
    from public.saas_subscriptions ss
    join public.plans pl on pl.code='mc_semilla_20'
    join public.plan_modules pm on pm.plan_id=pl.id and pm.module_code=v_module and pm.enabled=true
    where ss.organization_id=p_organization_id and ss.status <> 'pending'
  );
end
$function$;
revoke all on function private.module_enabled(uuid,text) from public;
grant execute on function private.module_enabled(uuid,text) to authenticated, service_role;

-- ================================================ 9. Contratar y activar
-- Crea la suscripcion PENDIENTE con la cotizacion del servidor. El navegador
-- solo manda codigos. Semilla sin complementos queda 'free' al instante y sin
-- tarjeta. Si ya hay una de pago vigente, la nueva arranca al terminar el
-- periodo pagado (sin prorrateo en v1).
create or replace function private.saas_start_checkout(p_org uuid, p_tier text, p_cycle text, p_addons text[], p_coupon text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_ver uuid := private.saas_published_version(); q jsonb; v_live public.saas_subscriptions%rowtype; v_id uuid; l jsonb;
        v_status text; v_old jsonb;
begin
  if not private.has_module_access(p_org, 'admin', true) then raise exception 'Not authorized'; end if;
  if private.saas_is_internal_org(p_org) then raise exception 'Este club usa el plan interno de TannerOS: no se contrata en el catálogo'; end if;
  q := private.saas_quote_for(p_org, v_ver, p_tier, p_cycle, p_addons, p_coupon);
  if not (q->>'ok')::boolean then return q; end if;

  select * into v_live from public.saas_subscriptions where organization_id = p_org and status in ('free', 'active', 'past_due', 'grace_period');
  -- Una pendiente anterior que nunca se pago se cancela: solo vale la ultima cotizacion.
  update public.saas_subscriptions set status = 'cancelled', cancelled_at = now()
   where organization_id = p_org and status = 'pending' returning to_jsonb(saas_subscriptions.*) into v_old;
  if v_old is not null then perform private.saas_audit(p_org, 'checkout_superseded', 'subscription', v_old->>'id', v_old, null, 'Nueva cotización'); end if;

  v_status := case when not (q->>'requierePago')::boolean and v_live.id is null then 'free' else 'pending' end;
  if v_status = 'free' and (q->>'total')::bigint <> 0 then raise exception 'Inconsistencia: gratis con total'; end if;

  insert into public.saas_subscriptions (organization_id, catalog_version_id, tier_code, billing_cycle, status, base_cents, vat_cents,
      total_cents, quote, starts_at, current_period_start, replaces_subscription_id, provider, created_by)
  values (p_org, v_ver, p_tier, p_cycle, v_status, (q->>'base')::bigint, (q->>'iva')::bigint, (q->>'total')::bigint, q,
      case when v_status = 'free' then now() when v_live.id is not null and v_live.status <> 'free' then v_live.current_period_end end,
      case when v_status = 'free' then now() end, v_live.id, 'none', (select auth.uid()))
  returning id into v_id;

  for l in select * from jsonb_array_elements(q->'lineas') where value->>'tipo' <> 'plan' loop
    insert into public.saas_subscription_items (subscription_id, organization_id, catalog_version_id, addon_code, unit_monthly_cents, net_cents, covered_by)
    values (v_id, p_org, v_ver, l->>'codigo', (l->>'mensual')::int, (l->>'neto')::bigint, l->>'cubiertoPor');
  end loop;

  if v_status = 'free' then
    -- Semilla sin costo: reemplaza a la gratis anterior (si la hubiera) en el acto.
    perform private.saas_close_replaced(v_id);
  end if;
  if (q ? 'descuentoCupon') and (q->>'descuentoCupon')::bigint > 0 then
    insert into public.saas_coupon_redemptions (code, organization_id, subscription_id) values (upper(btrim(p_coupon)), p_org, v_id);
  end if;
  perform private.saas_audit(p_org, 'checkout_started', 'subscription', v_id::text, null, q, null);
  return jsonb_build_object('ok', true, 'subscriptionId', v_id, 'status', v_status, 'total', (q->>'total')::bigint,
    'requierePago', v_status = 'pending', 'inicia', case when v_live.id is not null and v_live.status <> 'free' then v_live.current_period_end end,
    'cotizacion', q);
end $$;
revoke all on function private.saas_start_checkout(uuid, text, text, text[], text) from public, anon, authenticated;

-- Cierra la suscripcion a la que reemplaza esta (cuando la nueva ya vale).
create or replace function private.saas_close_replaced(p_new uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare n public.saas_subscriptions%rowtype; o jsonb;
begin
  select * into n from public.saas_subscriptions where id = p_new;
  update public.saas_subscriptions set status = 'cancelled', cancelled_at = now()
   where organization_id = n.organization_id and id <> n.id and status in ('free', 'active', 'past_due', 'grace_period')
  returning to_jsonb(saas_subscriptions.*) into o;
  if o is not null then perform private.saas_audit(n.organization_id, 'subscription_replaced', 'subscription', o->>'id', o, to_jsonb(n), null); end if;
end $$;
revoke all on function private.saas_close_replaced(uuid) from public, anon, authenticated;

-- La Edge Function guarda aqui el id del preapproval de Mercado Pago (solo servicio).
create or replace function private.saas_attach_preapproval(p_sub uuid, p_env text, p_preapproval_id text, p_checkout_url text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.saas_subscriptions set provider = 'mercadopago', environment = p_env, provider_preapproval_id = p_preapproval_id,
         checkout_url = p_checkout_url
   where id = p_sub and status = 'pending' and provider in ('none', 'mercadopago')
     and (provider_preapproval_id is null or provider_preapproval_id = p_preapproval_id);
  if not found then raise exception 'La suscripción % no está pendiente o ya tiene otro preapproval', p_sub; end if;
end $$;
revoke all on function private.saas_attach_preapproval(uuid, text, text, text) from public, anon, authenticated;

-- Aviso recibido (idempotente). Devuelve si hay que procesarlo.
create or replace function private.saas_register_event(p_env text, p_event_key text, p_topic text, p_action text,
                                                       p_resource_id text, p_request_id text, p_signature_valid boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.saas_payment_events%rowtype;
begin
  insert into public.saas_payment_events (provider, environment, event_key, topic, action, resource_id, request_id, signature_valid,
                                          status, processed_at)
  values ('mercadopago', p_env, p_event_key, p_topic, p_action, p_resource_id, p_request_id, p_signature_valid,
          case when p_signature_valid then 'received' else 'ignored' end, case when p_signature_valid then null else now() end)
  on conflict (provider, environment, event_key) do update set attempts = public.saas_payment_events.attempts + 1
  returning * into e;
  return jsonb_build_object('id', e.id, 'process', e.signature_valid and e.status in ('received', 'error'), 'status', e.status, 'attempts', e.attempts);
end $$;
revoke all on function private.saas_register_event(text, text, text, text, text, text, boolean) from public, anon, authenticated;

create or replace function private.saas_finish_event(p_event uuid, p_status text, p_result jsonb, p_error text)
returns void language sql security definer set search_path = '' as $$
  update public.saas_payment_events set status = p_status, result = p_result, last_error = p_error,
         processed_at = case when p_status in ('processed', 'ignored') then now() else processed_at end
  where id = p_event
$$;
revoke all on function private.saas_finish_event(uuid, text, jsonb, text) from public, anon, authenticated;

-- Estado del preapproval CONSULTADO en la API (nunca el cuerpo del aviso).
-- Avisos viejos que llegan tarde no pisan un estado mas nuevo.
create or replace function private.saas_apply_preapproval(p_env text, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.saas_subscriptions%rowtype; v_mod timestamptz := nullif(p->>'last_modified', '')::timestamptz;
        v_amount bigint := round((p->'auto_recurring'->>'transaction_amount')::numeric * 100);
begin
  select * into s from public.saas_subscriptions
   where provider = 'mercadopago' and environment = p_env and provider_preapproval_id = p->>'id' for update;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'preapproval desconocido'); end if;
  if p->>'external_reference' is distinct from s.id::text then return jsonb_build_object('ok', false, 'error', 'external_reference no coincide'); end if;
  if v_amount is distinct from s.total_cents or coalesce(p->'auto_recurring'->>'currency_id', 'MXN') <> 'MXN' then
    return jsonb_build_object('ok', false, 'error', 'monto o moneda del preapproval no coinciden');
  end if;
  if v_mod is not null and s.provider_updated_at is not null and v_mod <= s.provider_updated_at then
    return jsonb_build_object('ok', true, 'stale', true);
  end if;
  update public.saas_subscriptions set provider_status = p->>'status', provider_updated_at = coalesce(v_mod, now()),
    -- Autorizar la tarjeta NO activa: activa el primer pago aprobado.
    status = case
      when p->>'status' = 'cancelled' and s.status = 'pending' then 'cancelled'
      when p->>'status' = 'paused' and s.status = 'active' then 'past_due'
      else s.status end,
    cancelled_at = case when p->>'status' = 'cancelled' and s.status = 'pending' then now() else s.cancelled_at end,
    cancel_at_period_end = s.cancel_at_period_end or (p->>'status' = 'cancelled' and s.status <> 'pending')
  where id = s.id;
  perform private.saas_audit(s.organization_id, 'provider_preapproval', 'subscription', s.id::text,
    jsonb_build_object('status', s.status, 'provider_status', s.provider_status), jsonb_build_object('provider_status', p->>'status'), null);
  return jsonb_build_object('ok', true, 'subscriptionId', s.id, 'providerStatus', p->>'status');
end $$;
revoke all on function private.saas_apply_preapproval(text, jsonb) from public, anon, authenticated;

-- Pago CONSULTADO en la API. Idempotente por id de pago; activa solo si esta
-- aprobado Y el monto coincide con lo contratado. Repetir no extiende el periodo.
create or replace function private.saas_apply_payment(p_env text, p_preapproval_id text, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.saas_subscriptions%rowtype; v_pay public.saas_payments%rowtype; v_prev text;
        v_amount bigint := round((p->>'transaction_amount')::numeric * 100);
        v_status text := p->>'status'; v_match boolean; v_start timestamptz; v_end timestamptz;
        v_mod timestamptz := coalesce(nullif(p->>'date_last_updated', '')::timestamptz, now());
begin
  if v_status not in ('pending', 'in_process', 'approved', 'rejected', 'cancelled', 'refunded', 'charged_back') then
    v_status := case when v_status = 'authorized' then 'in_process' else 'pending' end;
  end if;
  select * into s from public.saas_subscriptions
   where provider = 'mercadopago' and environment = p_env and provider_preapproval_id = p_preapproval_id for update;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'preapproval desconocido'); end if;
  v_match := v_amount = s.total_cents and coalesce(p->>'currency_id', 'MXN') = 'MXN';

  select status into v_prev from public.saas_payments where provider = 'mercadopago' and environment = p_env and provider_payment_id = p->>'id';
  insert into public.saas_payments (organization_id, subscription_id, provider, environment, provider_payment_id, status, status_detail,
      amount_cents, amount_matches, approved_at, provider_updated_at)
  values (s.organization_id, s.id, 'mercadopago', p_env, p->>'id', v_status, p->>'status_detail', v_amount, v_match,
      case when v_status = 'approved' then coalesce(nullif(p->>'date_approved', '')::timestamptz, now()) end, v_mod)
  on conflict (provider, environment, provider_payment_id) do update
     set status = case when excluded.provider_updated_at >= coalesce(public.saas_payments.provider_updated_at, '-infinity') then excluded.status else public.saas_payments.status end,
         status_detail = excluded.status_detail,
         approved_at = coalesce(public.saas_payments.approved_at, excluded.approved_at),
         provider_updated_at = greatest(public.saas_payments.provider_updated_at, excluded.provider_updated_at)
  returning * into v_pay;

  if v_pay.status = 'approved' and v_prev is distinct from 'approved' then
    if not v_match then
      perform private.saas_audit(s.organization_id, 'payment_amount_mismatch', 'payment', v_pay.id::text, null, to_jsonb(v_pay), 'No se activa: el monto no coincide');
      return jsonb_build_object('ok', false, 'error', 'monto no coincide', 'paymentId', v_pay.id);
    end if;
    v_start := greatest(coalesce(s.current_period_end, v_pay.approved_at), v_pay.approved_at);
    v_end := v_start + case when s.billing_cycle = 'annual' then interval '12 months' else interval '1 month' end;
    update public.saas_payments set period_start = v_start, period_end = v_end where id = v_pay.id;
    -- Primero se cierra la que reemplaza (solo puede haber una viva) y luego se activa esta.
    if s.status = 'pending' then perform private.saas_close_replaced(s.id); end if;
    update public.saas_subscriptions set status = 'active', starts_at = coalesce(starts_at, v_start),
           current_period_start = v_start, current_period_end = v_end, grace_until = null
     where id = s.id and status in ('pending', 'active', 'past_due', 'grace_period');
    perform private.saas_legacy_handoff(s.organization_id);
    perform private.saas_audit(s.organization_id, 'payment_approved', 'payment', v_pay.id::text, null, to_jsonb(v_pay), null);
  elsif v_pay.status in ('rejected', 'cancelled') and s.status = 'active' and s.current_period_end is not null and s.current_period_end < now() then
    update public.saas_subscriptions set status = 'past_due' where id = s.id;
  elsif v_pay.status in ('refunded', 'charged_back') and v_prev is distinct from v_pay.status then
    perform private.saas_audit(s.organization_id, 'payment_' || v_pay.status, 'payment', v_pay.id::text, null, to_jsonb(v_pay), 'Revisar a mano: no se cancela solo');
  end if;
  return jsonb_build_object('ok', true, 'paymentId', v_pay.id, 'status', v_pay.status, 'amountMatches', v_match);
end $$;
revoke all on function private.saas_apply_payment(text, text, jsonb) from public, anon, authenticated;

-- Cuando una academia ya vive en el catalogo nuevo, su suscripcion vieja se
-- cancela para que el cobro viejo (j4-n4) no le emita mensualidad. Nunca toca
-- un plan interno.
create or replace function private.saas_legacy_handoff(p_org uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if private.saas_is_internal_org(p_org) then return; end if;
  update public.subscriptions s set status = 'cancelled', cancelled_at = now(),
         metadata = s.metadata || jsonb_build_object('movedTo', 'saas_catalog', 'movedAt', now())
   where s.organization_id = p_org and s.status in ('active', 'trialing')
     and exists (select 1 from public.plans p where p.id = s.plan_id and coalesce((p.metadata->>'commercial')::boolean, true));
end $$;
revoke all on function private.saas_legacy_handoff(uuid) from public, anon, authenticated;

-- Cancelar la renovacion (TC-017): se conserva el acceso hasta el fin del periodo pagado.
create or replace function private.saas_cancel_renewal(p_org uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.saas_subscriptions%rowtype;
begin
  if not (private.has_module_access(p_org, 'admin', true) or private.is_platform_admin()) then raise exception 'Not authorized'; end if;
  select * into s from public.saas_subscriptions where organization_id = p_org and status in ('active', 'past_due', 'grace_period') for update;
  if s.id is null then raise exception 'No hay una suscripción de pago que cancelar'; end if;
  update public.saas_subscriptions set cancel_at_period_end = true, cancel_requested_at = now() where id = s.id;
  perform private.saas_audit(p_org, 'renewal_cancelled', 'subscription', s.id::text, null, null, nullif(btrim(coalesce(p_reason, '')), ''));
  return jsonb_build_object('subscriptionId', s.id, 'accesoHasta', s.current_period_end,
    'preapprovalId', s.provider_preapproval_id, 'environment', s.environment);
end $$;
revoke all on function private.saas_cancel_renewal(uuid, text) from public, anon, authenticated;

-- Ciclo diario (idempotente). NO se agenda aqui: ver 04-despliegue.md.
create or replace function private.saas_daily(p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r record; v_exp int := 0; v_due int := 0; v_gr int := 0; v_cap int := 0; v_grace int;
begin
  -- Renovacion cancelada y periodo terminado: vence.
  update public.saas_subscriptions set status = 'expired', cancelled_at = coalesce(cancelled_at, p_now)
   where cancel_at_period_end and status in ('active', 'past_due', 'grace_period') and current_period_end < p_now;
  get diagnostics v_exp = row_count;
  -- Periodo terminado sin pago nuevo: atrasada (Mercado Pago reintenta ~10 dias).
  update public.saas_subscriptions set status = 'past_due'
   where status = 'active' and not cancel_at_period_end and current_period_end < p_now;
  get diagnostics v_due = row_count;
  -- Atrasada mas de los reintentos: periodo de gracia con fecha; despues vence.
  for r in select s.id, cv.grace_days from public.saas_subscriptions s join public.saas_catalog_versions cv on cv.id = s.catalog_version_id
           where s.status = 'past_due' and s.current_period_end < p_now - interval '10 days' loop
    update public.saas_subscriptions set status = 'grace_period', grace_until = current_period_end + make_interval(days => 10 + r.grace_days) where id = r.id;
    v_gr := v_gr + 1;
  end loop;
  update public.saas_subscriptions set status = 'expired' where status = 'grace_period' and grace_until < p_now;
  -- Cupo excedido: se marca desde cuando y hasta cuando hay gracia. No bloquea.
  for r in select s.id, s.organization_id, t.max_players, cv.grace_days, s.grace_until
           from public.saas_subscriptions s join public.saas_plan_tiers t on t.catalog_version_id = s.catalog_version_id and t.code = s.tier_code
           join public.saas_catalog_versions cv on cv.id = s.catalog_version_id
           where s.status in ('free', 'active') and t.max_players is not null loop
    if private.saas_active_players(r.organization_id) > r.max_players then
      if r.grace_until is null then
        select r.grace_days + coalesce(sum(g.extra_grace_days), 0) into v_grace from public.saas_social_grants g
         where g.organization_id = r.organization_id and g.kind = 'grace_extension' and g.revoked_at is null and g.starts_at <= p_now and g.ends_at > p_now;
        update public.saas_subscriptions set grace_until = p_now + make_interval(days => v_grace) where id = r.id;
        perform private.saas_audit(r.organization_id, 'capacity_exceeded', 'subscription', r.id::text, null, null, null);
        v_cap := v_cap + 1;
      end if;
    elsif r.grace_until is not null then
      update public.saas_subscriptions set grace_until = null where id = r.id;
    end if;
  end loop;
  return jsonb_build_object('vencidas', v_exp, 'atrasadas', v_due, 'enGracia', v_gr, 'excedidas', v_cap);
end $$;
revoke all on function private.saas_daily(timestamptz) from public, anon, authenticated;

-- =================================================== 10. Funciones del club
create or replace function private.saas_my_subscription(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.saas_subscriptions%rowtype;
begin
  if not private.has_module_access(p_org, 'admin', false) then raise exception 'Not authorized'; end if;
  select * into s from public.saas_subscriptions where organization_id = p_org and status in ('free', 'active', 'past_due', 'grace_period');
  return jsonb_build_object(
    'interno', private.saas_is_internal_org(p_org),
    'suscripcion', case when s.id is null then null else jsonb_build_object('id', s.id, 'plan', s.tier_code, 'ciclo', s.billing_cycle,
       'estado', s.status, 'base', s.base_cents, 'iva', s.vat_cents, 'total', s.total_cents, 'periodoFin', s.current_period_end,
       'cancelaAlFinal', s.cancel_at_period_end, 'graciaHasta', s.grace_until, 'version',
       (select version from public.saas_catalog_versions where id = s.catalog_version_id),
       'complementos', coalesce((select jsonb_agg(jsonb_build_object('codigo', i.addon_code, 'neto', i.net_cents, 'cubiertoPor', i.covered_by))
                                 from public.saas_subscription_items i where i.subscription_id = s.id), '[]'::jsonb)) end,
    'pendiente', (select jsonb_build_object('id', p.id, 'plan', p.tier_code, 'total', p.total_cents, 'pagar', p.checkout_url, 'inicia', p.starts_at)
                  from public.saas_subscriptions p where p.organization_id = p_org and p.status = 'pending'),
    'cupo', private.saas_capacity(p_org),
    'fiscal', (select jsonb_build_object('rfc', f.rfc, 'razonSocial', f.legal_name, 'regimen', f.tax_regime, 'cp', f.zip_code, 'usoCfdi', f.cfdi_use, 'correo', f.email)
               from public.saas_fiscal_profiles f where f.organization_id = p_org),
    'pagos', coalesce((select jsonb_agg(jsonb_build_object('folio', x.receipt_folio, 'estado', x.status, 'monto', x.amount_cents,
        'aprobado', x.approved_at, 'periodo', jsonb_build_array(x.period_start, x.period_end),
        'cfdi', (select i.status from public.saas_invoices i where i.payment_id = x.id)) order by x.created_at desc)
      from public.saas_payments x where x.organization_id = p_org), '[]'::jsonb));
end $$;
revoke all on function private.saas_my_subscription(uuid) from public, anon, authenticated;

create or replace function private.saas_set_fiscal_profile(p_org uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_before jsonb; v_rfc text := upper(regexp_replace(coalesce(p->>'rfc', ''), '\s', '', 'g'));
begin
  if not private.has_module_access(p_org, 'admin', true) then raise exception 'Not authorized'; end if;
  if v_rfc !~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$' then raise exception 'El RFC no tiene un formato válido'; end if;
  if coalesce(p->>'cp', '') !~ '^[0-9]{5}$' then raise exception 'El código postal fiscal lleva 5 dígitos'; end if;
  if coalesce(p->>'regimen', '') !~ '^[0-9]{3}$' then raise exception 'Elige el régimen fiscal'; end if;
  if coalesce(p->>'usoCfdi', '') !~ '^[A-Z]{1,2}[0-9]{2}$' then raise exception 'Elige el uso del CFDI'; end if;
  select to_jsonb(f) into v_before from public.saas_fiscal_profiles f where organization_id = p_org;
  insert into public.saas_fiscal_profiles (organization_id, rfc, legal_name, tax_regime, zip_code, cfdi_use, email, updated_by, updated_at)
  values (p_org, v_rfc, btrim(p->>'razonSocial'), p->>'regimen', p->>'cp', p->>'usoCfdi', nullif(lower(btrim(coalesce(p->>'correo', ''))), ''), (select auth.uid()), now())
  on conflict (organization_id) do update set rfc = excluded.rfc, legal_name = excluded.legal_name, tax_regime = excluded.tax_regime,
    zip_code = excluded.zip_code, cfdi_use = excluded.cfdi_use, email = excluded.email, updated_by = excluded.updated_by, updated_at = now();
  perform private.saas_audit(p_org, 'fiscal_profile_saved', 'fiscal_profile', p_org::text, v_before, p, null);
  return jsonb_build_object('ok', true, 'rfc', v_rfc);
end $$;
revoke all on function private.saas_set_fiscal_profile(uuid, jsonb) from public, anon, authenticated;

-- Pedir la factura de un pago: queda "pendiente de integracion" con la foto de
-- los datos fiscales. El timbrado real llega cuando se elija PAC.
create or replace function private.saas_request_invoice(p_org uuid, p_folio bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare x public.saas_payments%rowtype; f public.saas_fiscal_profiles%rowtype; v_id uuid; v_vat bigint;
begin
  if not private.has_module_access(p_org, 'admin', true) then raise exception 'Not authorized'; end if;
  select * into x from public.saas_payments where organization_id = p_org and receipt_folio = p_folio and status = 'approved';
  if x.id is null then raise exception 'Ese pago no existe o no está aprobado'; end if;
  select * into f from public.saas_fiscal_profiles where organization_id = p_org;
  if f.organization_id is null then raise exception 'Primero captura tus datos fiscales'; end if;
  select s.vat_cents into v_vat from public.saas_subscriptions s where s.id = x.subscription_id;
  insert into public.saas_invoices (organization_id, payment_id, receiver, subtotal_cents, vat_cents, total_cents)
  values (p_org, x.id, to_jsonb(f) - 'updated_by', x.amount_cents - v_vat, v_vat, x.amount_cents)
  on conflict (payment_id) do nothing returning id into v_id;
  if v_id is null then raise exception 'Ya pediste la factura de ese pago'; end if;
  perform private.saas_audit(p_org, 'invoice_requested', 'invoice', v_id::text, null, null, null);
  return jsonb_build_object('ok', true, 'invoiceId', v_id, 'estado', 'pending_integration');
end $$;
revoke all on function private.saas_request_invoice(uuid, bigint) from public, anon, authenticated;


-- ===================================================== 10b. Exportar mis datos
-- Semilla 20: "mantener opciones para exportar informacion". La academia se
-- lleva lo suyo en un archivo: solo sus filas, solo Presidencia o el dueno
-- (hay datos sensibles de menores) y cada exportacion queda en la bitacora.
create or replace function private.saas_export_my_data(p_org uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_tablas constant text[] := array['categories','players','player_enrollments','guardians','player_guardians','billing_profiles',
    'player_benefits','charges','payments','expenses','attendance_records','academies','academy_enrollments','matches',
    'products','orders','order_items','staff_members'];
  t text; v_filas jsonb; v_out jsonb := '{}'::jsonb; v_conteo jsonb := '{}'::jsonb;
begin
  if not (private.has_module_access(p_org, 'admin', true) and exists (
      select 1 from public.organization_memberships m where m.organization_id = p_org and m.user_id = (select auth.uid())
        and m.active and (m.is_owner or m.role = 'Presidencia'))) then
    raise exception 'Not authorized';
  end if;
  foreach t in array v_tablas loop
    if to_regclass(format('app.%I', t)) is null then continue; end if;
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from app.%I x where x.organization_id = $1', t) into v_filas using p_org;
    v_out := v_out || jsonb_build_object(t, v_filas);
    v_conteo := v_conteo || jsonb_build_object(t, jsonb_array_length(v_filas));
  end loop;
  perform private.saas_audit(p_org, 'data_export', 'organization', p_org::text, null, v_conteo, null);
  return jsonb_build_object('formato', 'mi-club-fc-export-v1', 'generado', now(),
    'academia', (select jsonb_build_object('id', o.id, 'nombre', o.name, 'slug', o.slug) from public.organizations o where o.id = p_org),
    'conteo', v_conteo, 'tablas', v_out);
end $$;
revoke all on function private.saas_export_my_data(uuid) from public, anon, authenticated;

-- ============================================== 11. Portal de la plataforma
create or replace function private.saas_admin_catalog()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'Not authorized'; end if;
  return jsonb_build_object(
    'versiones', coalesce((select jsonb_agg(private.saas_catalog_json(cv.id) || jsonb_build_object('label', cv.label, 'notas', cv.notes,
        'aprobada', cv.approved_at, 'publicada', cv.published_at) order by cv.version desc) from public.saas_catalog_versions cv), '[]'::jsonb),
    'modulos', coalesce((select jsonb_agg(jsonb_build_object('codigo', m.code, 'nombre', m.name, 'tecnico', r.technical_status, 'notas', r.notes)
        order by m.sort_order) from public.modules m left join public.saas_module_readiness r on r.module_code = m.code where m.active), '[]'::jsonb));
end $$;
revoke all on function private.saas_admin_catalog() from public, anon, authenticated;

create or replace function private.saas_admin_new_draft(p_from_version int, p_label text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare src public.saas_catalog_versions%rowtype; v_id uuid; v_n int;
begin
  if not private.is_platform_admin() then raise exception 'Not authorized'; end if;
  select * into src from public.saas_catalog_versions where version = p_from_version;
  if src.id is null then raise exception 'No existe la versión %', p_from_version; end if;
  select coalesce(max(version), 0) + 1 into v_n from public.saas_catalog_versions;
  insert into public.saas_catalog_versions (version, label, vat_bp, annual_discount_bp, grace_days, notes, created_by)
  values (v_n, coalesce(nullif(btrim(p_label), ''), format('Borrador v%s', v_n)), src.vat_bp, src.annual_discount_bp, src.grace_days,
          format('Copia de la versión %s', src.version), (select auth.uid()))
  returning id into v_id;
  insert into public.saas_plan_tiers select v_id, code, name, min_players, max_players, monthly_cents, quote_only, plan_id, highlights, sort_order
    from public.saas_plan_tiers where catalog_version_id = src.id;
  insert into public.saas_addons select v_id, code, name, description, monthly_cents, components, 'draft', external_costs, sort_order
    from public.saas_addons where catalog_version_id = src.id;
  insert into public.saas_addon_modules select v_id, addon_code, module_code from public.saas_addon_modules where catalog_version_id = src.id;
  perform private.saas_audit(null, 'catalog_draft_created', 'catalog', v_n::text, null, jsonb_build_object('from', src.version), null);
  return jsonb_build_object('version', v_n);
end $$;
revoke all on function private.saas_admin_new_draft(int, text) from public, anon, authenticated;

-- Cambia precios/rangos/IVA de un BORRADOR. p: {ivaBp, descuentoAnualBp, diasGracia,
-- planes:[{codigo, min, max, mensual}], complementos:[{codigo, mensual}]}
create or replace function private.saas_admin_update_draft(p_version int, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare cv public.saas_catalog_versions%rowtype; x jsonb; v_before jsonb;
begin
  if not private.is_platform_admin() then raise exception 'Not authorized'; end if;
  select * into cv from public.saas_catalog_versions where version = p_version for update;
  if cv.status is distinct from 'draft' then raise exception 'Solo se edita un borrador'; end if;
  v_before := private.saas_catalog_json(cv.id);
  update public.saas_catalog_versions set
    vat_bp = coalesce((p->>'ivaBp')::int, vat_bp), annual_discount_bp = coalesce((p->>'descuentoAnualBp')::int, annual_discount_bp),
    grace_days = coalesce((p->>'diasGracia')::int, grace_days), vat_validated_at = null, vat_validated_by = null
   where id = cv.id;
  for x in select * from jsonb_array_elements(coalesce(p->'planes', '[]'::jsonb)) loop
    update public.saas_plan_tiers set min_players = coalesce((x->>'min')::int, min_players),
      max_players = case when x ? 'max' then (x->>'max')::int else max_players end,
      monthly_cents = case when x ? 'mensual' then (x->>'mensual')::int else monthly_cents end
     where catalog_version_id = cv.id and code = x->>'codigo';
    if not found then raise exception 'No existe el plan %', x->>'codigo'; end if;
  end loop;
  for x in select * from jsonb_array_elements(coalesce(p->'complementos', '[]'::jsonb)) loop
    update public.saas_addons set monthly_cents = (x->>'mensual')::int where catalog_version_id = cv.id and code = x->>'codigo';
    if not found then raise exception 'No existe el complemento %', x->>'codigo'; end if;
  end loop;
  perform private.saas_audit(null, 'catalog_draft_updated', 'catalog', p_version::text, v_before, private.saas_catalog_json(cv.id), null);
  return private.saas_catalog_json(cv.id);
end $$;
revoke all on function private.saas_admin_update_draft(int, jsonb) from public, anon, authenticated;

-- Rangos de jugadores: desde 0, sin huecos, sin traslapes y el ultimo sin tope.
create or replace function private.saas_catalog_ranges_ok(p_version uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare r record; v_next int := 0; v_open boolean := false;
begin
  for r in select * from public.saas_plan_tiers where catalog_version_id = p_version order by min_players loop
    if v_open then return format('%s viene después de un plan sin tope', r.code); end if;
    if r.min_players <> v_next then return format('%s empieza en %s y debería empezar en %s', r.code, r.min_players, v_next); end if;
    if r.max_players is null then v_open := true; else v_next := r.max_players + 1; end if;
  end loop;
  if not v_open then return 'El último plan debe ser sin tope (cotización)'; end if;
  return null;
end $$;
revoke all on function private.saas_catalog_ranges_ok(uuid) from public, anon, authenticated;

create or replace function private.saas_admin_approve(p_version int, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare cv public.saas_catalog_versions%rowtype; v_err text;
begin
  if not private.is_platform_admin() then raise exception 'Not authorized'; end if;
  select * into cv from public.saas_catalog_versions where version = p_version for update;
  if cv.status is distinct from 'draft' then raise exception 'Solo se aprueba un borrador'; end if;
  v_err := private.saas_catalog_ranges_ok(cv.id);
  if v_err is not null then raise exception 'Rangos inválidos: %', v_err; end if;
  update public.saas_catalog_versions set status = 'approved', approved_at = now(), approved_by = (select auth.uid()),
         notes = concat_ws(E'\n', notes, nullif(btrim(coalesce(p_note, '')), '')) where id = cv.id;
  perform private.saas_audit(null, 'catalog_approved', 'catalog', p_version::text, null, private.saas_catalog_json(cv.id), p_note);
  return jsonb_build_object('version', p_version, 'status', 'approved');
end $$;
revoke all on function private.saas_admin_approve(int, text) from public, anon, authenticated;

-- El IVA se valida con el contador ANTES de publicar.
create or replace function private.saas_admin_validate_vat(p_version int, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'Not authorized'; end if;
  if length(btrim(coalesce(p_note, ''))) < 10 then raise exception 'Escribe quién validó el IVA y cómo'; end if;
  update public.saas_catalog_versions set vat_validated_at = now(), vat_validated_by = (select auth.uid()), vat_validation_note = btrim(p_note)
   where version = p_version and status in ('draft', 'approved');
  if not found then raise exception 'No se puede validar el IVA de esa versión'; end if;
  perform private.saas_audit(null, 'catalog_vat_validated', 'catalog', p_version::text, null, null, p_note);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function private.saas_admin_validate_vat(int, text) from public, anon, authenticated;

-- Publicar = los precios se ven en /precios y se pueden contratar. Pide la frase exacta.
create or replace function private.saas_admin_publish(p_version int, p_confirm text, p_effective_from timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare cv public.saas_catalog_versions%rowtype;
begin
  if not private.is_platform_admin() then raise exception 'Not authorized'; end if;
  if p_confirm is distinct from format('PUBLICAR PRECIOS V%s', p_version) then
    raise exception 'Para publicar escribe exactamente: PUBLICAR PRECIOS V%', p_version;
  end if;
  select * into cv from public.saas_catalog_versions where version = p_version for update;
  if cv.status is distinct from 'approved' then raise exception 'Solo se publica una versión aprobada'; end if;
  if cv.vat_validated_at is null then raise exception 'Falta validar el IVA con el contador'; end if;
  update public.saas_catalog_versions set status = 'retired', retired_at = now() where status = 'published';
  update public.saas_catalog_versions set status = 'published', published_at = now(), published_by = (select auth.uid()),
         effective_from = coalesce(p_effective_from, now()) where id = cv.id;
  perform private.saas_audit(null, 'catalog_published', 'catalog', p_version::text, null, private.saas_catalog_json(cv.id), null);
  return jsonb_build_object('version', p_version, 'status', 'published');
end $$;
revoke all on function private.saas_admin_publish(int, text, timestamptz) from public, anon, authenticated;

create or replace function private.saas_admin_set_readiness(p_module text, p_status text, p_notes text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_before jsonb;
begin
  if not private.is_platform_admin() then raise exception 'Not authorized'; end if;
  select to_jsonb(r) into v_before from public.saas_module_readiness r where module_code = p_module;
  insert into public.saas_module_readiness (module_code, technical_status, notes, reviewed_at, reviewed_by)
  values (p_module, p_status, nullif(btrim(coalesce(p_notes, '')), ''), now(), (select auth.uid()))
  on conflict (module_code) do update set technical_status = excluded.technical_status, notes = excluded.notes,
    reviewed_at = now(), reviewed_by = excluded.reviewed_by;
  perform private.saas_audit(null, 'module_readiness', 'module', p_module, v_before, jsonb_build_object('status', p_status, 'notes', p_notes), p_notes);
end $$;
revoke all on function private.saas_admin_set_readiness(text, text, text) from public, anon, authenticated;

create or replace function private.saas_admin_set_addon_status(p_version int, p_code text, p_status text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_ok boolean;
begin
  if not private.is_platform_admin() then raise exception 'Not authorized'; end if;
  select id into v_id from public.saas_catalog_versions where version = p_version;
  update public.saas_addons set commercial_status = p_status where catalog_version_id = v_id and code = p_code;
  if not found then raise exception 'No existe el complemento %', p_code; end if;
  v_ok := private.saas_addon_sellable(v_id, p_code);
  if p_status = 'for_sale' and not v_ok then
    raise exception 'No se puede vender %: algún módulo no está listo (estado técnico distinto de ready)', p_code;
  end if;
  perform private.saas_audit(null, 'addon_status', 'addon', p_version || ':' || p_code, null, jsonb_build_object('status', p_status), null);
  return jsonb_build_object('codigo', p_code, 'estado', p_status, 'vendible', v_ok);
end $$;
revoke all on function private.saas_admin_set_addon_status(int, text, text) from public, anon, authenticated;

-- Suscripcion manual autorizada (piloto, convenio, pago por transferencia).
-- Con motivo; se puede usar una version aprobada aunque no este publicada.
create or replace function private.saas_admin_assign(p_org uuid, p_version int, p_tier text, p_cycle text, p_addons text[],
                                                     p_period_end timestamptz, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare cv public.saas_catalog_versions%rowtype; q jsonb; v_id uuid; l jsonb; v_free boolean;
begin
  if not private.is_platform_admin() then raise exception 'Not authorized'; end if;
  if private.saas_is_internal_org(p_org) then raise exception 'Este club usa el plan interno de TannerOS'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Escribe el motivo (mínimo 10 caracteres)'; end if;
  select * into cv from public.saas_catalog_versions where version = p_version and status in ('approved', 'published');
  if cv.id is null then raise exception 'La versión % no está aprobada', p_version; end if;
  q := private.saas_quote_for(p_org, cv.id, p_tier, p_cycle, p_addons, null);
  if not (q->>'ok')::boolean then return q; end if;
  v_free := not (q->>'requierePago')::boolean;
  update public.saas_subscriptions set status = 'cancelled', cancelled_at = now() where organization_id = p_org and status = 'pending';
  update public.saas_subscriptions set status = 'cancelled', cancelled_at = now()
   where organization_id = p_org and status in ('free', 'active', 'past_due', 'grace_period');
  insert into public.saas_subscriptions (organization_id, catalog_version_id, tier_code, billing_cycle, status, base_cents, vat_cents, total_cents,
      quote, starts_at, current_period_start, current_period_end, provider, environment, manual_reason, created_by)
  values (p_org, cv.id, p_tier, p_cycle, case when v_free then 'free' else 'active' end, (q->>'base')::bigint, (q->>'iva')::bigint,
      (q->>'total')::bigint, q, now(), now(), case when v_free then null else p_period_end end, 'manual', null, btrim(p_reason), (select auth.uid()))
  returning id into v_id;
  for l in select * from jsonb_array_elements(q->'lineas') where value->>'tipo' <> 'plan' loop
    insert into public.saas_subscription_items (subscription_id, organization_id, catalog_version_id, addon_code, unit_monthly_cents, net_cents, covered_by)
    values (v_id, p_org, cv.id, l->>'codigo', (l->>'mensual')::int, (l->>'neto')::bigint, l->>'cubiertoPor');
  end loop;
  perform private.saas_legacy_handoff(p_org);
  perform private.saas_audit(p_org, 'manual_subscription', 'subscription', v_id::text, null, q, p_reason);
  return jsonb_build_object('ok', true, 'subscriptionId', v_id);
end $$;
revoke all on function private.saas_admin_assign(uuid, int, text, text, text[], timestamptz, text) from public, anon, authenticated;

-- Pago manual (transferencia) de una suscripcion manual: deja comprobante interno.
create or replace function private.saas_admin_record_manual_payment(p_sub uuid, p_reference text, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.saas_subscriptions%rowtype; v_id uuid; v_start timestamptz; v_end timestamptz;
begin
  if not private.is_platform_admin() then raise exception 'Not authorized'; end if;
  if length(btrim(coalesce(p_reference, ''))) < 4 then raise exception 'Escribe la referencia del pago'; end if;
  select * into s from public.saas_subscriptions where id = p_sub and provider = 'manual' and status in ('active', 'past_due', 'grace_period') for update;
  if s.id is null then raise exception 'Solo se registra pago manual a una suscripción manual vigente'; end if;
  v_start := greatest(coalesce(s.current_period_end, now()), now());
  v_end := v_start + case when s.billing_cycle = 'annual' then interval '12 months' else interval '1 month' end;
  insert into public.saas_payments (organization_id, subscription_id, provider, environment, provider_payment_id, status, amount_cents,
      amount_matches, period_start, period_end, approved_at, manual_reason, recorded_by)
  values (s.organization_id, s.id, 'manual', 'manual', btrim(p_reference), 'approved', s.total_cents, true, v_start, v_end, now(),
      nullif(btrim(coalesce(p_reason, '')), ''), (select auth.uid()))
  returning id into v_id;
  update public.saas_subscriptions set status = 'active', current_period_end = v_end, grace_until = null where id = s.id;
  perform private.saas_audit(s.organization_id, 'manual_payment', 'payment', v_id::text, null, null, p_reason);
  return jsonb_build_object('ok', true, 'paymentId', v_id, 'hasta', v_end);
end $$;
revoke all on function private.saas_admin_record_manual_payment(uuid, text, text) from public, anon, authenticated;

create or replace function private.saas_admin_grant(p_org uuid, p_kind text, p_percent_bp int, p_extra_days int, p_ends_at timestamptz, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not private.is_platform_admin() then raise exception 'Not authorized'; end if;
  insert into public.saas_social_grants (organization_id, kind, percent_off_bp, extra_grace_days, reason, ends_at, granted_by)
  values (p_org, p_kind, p_percent_bp, p_extra_days, btrim(coalesce(p_reason, '')), p_ends_at, (select auth.uid()))
  returning id into v_id;
  perform private.saas_audit(p_org, 'social_grant', 'grant', v_id::text, null,
    jsonb_build_object('kind', p_kind, 'percentBp', p_percent_bp, 'days', p_extra_days, 'endsAt', p_ends_at), p_reason);
  return jsonb_build_object('ok', true, 'grantId', v_id);
end $$;
revoke all on function private.saas_admin_grant(uuid, text, int, int, timestamptz, text) from public, anon, authenticated;

-- Metricas del negocio. Solo cuentas y montos: ningun dato personal de jugadores.
-- MRR/ARR = suscripciones vigentes de pago, SIN IVA; lo anual entre 12.
create or replace function private.saas_admin_board()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_live constant text[] := array['active', 'past_due', 'grace_period'];
begin
  if not private.is_platform_admin() then raise exception 'Not authorized'; end if;
  return (with live as (
      select s.*, case when s.billing_cycle = 'annual' then private.saas_round(s.base_cents, 12) else s.base_cents end mrr
      from public.saas_subscriptions s where s.status = any(v_live) or s.status = 'free'),
    items as (select i.*, case when s.billing_cycle = 'annual' then private.saas_round(i.net_cents, 12) else i.net_cents end mrr
      from public.saas_subscription_items i join live s on s.id = i.subscription_id where s.status = any(v_live))
    select jsonb_build_object(
      'academiasGratis', (select count(*) from live where status = 'free'),
      'academiasPago', (select count(*) from live where status = any(v_live)),
      'jugadoresSemilla', (select coalesce(sum(private.saas_active_players(organization_id)), 0) from live where tier_code = 'SEMILLA_20' and status = 'free'),
      'mrr', (select coalesce(sum(mrr), 0) from live where status = any(v_live)),
      'arr', (select coalesce(sum(mrr), 0) * 12 from live where status = any(v_live)),
      'mrrComplementos', (select coalesce(sum(mrr), 0) from items),
      'porPlan', coalesce((select jsonb_object_agg(tier_code, jsonb_build_object('academias', n, 'mrr', m))
                  from (select tier_code, count(*) n, sum(mrr) m from live group by tier_code) x), '{}'::jsonb),
      'porComplemento', coalesce((select jsonb_object_agg(addon_code, jsonb_build_object('academias', n, 'mrr', m))
                  from (select addon_code, count(*) n, sum(mrr) m from items group by addon_code) x), '{}'::jsonb),
      'conversionGratisAPago', (select count(distinct p.organization_id) from public.saas_subscriptions p
                  where p.status = any(v_live) and exists (select 1 from public.saas_subscriptions f where f.organization_id = p.organization_id and f.tier_code = 'SEMILLA_20' and f.created_at < p.created_at)),
      'cancelaciones30d', (select count(*) from public.saas_subscriptions where status in ('cancelled', 'expired') and cancelled_at > now() - interval '30 days' and provider <> 'none'),
      'renovacionCancelada', (select count(*) from live where cancel_at_period_end),
      'pagosFallidos30d', (select count(*) from public.saas_payments where status in ('rejected', 'cancelled') and created_at > now() - interval '30 days'),
      'atrasadas', (select count(*) from live where status in ('past_due', 'grace_period')),
      'excedidas', (select count(*) from live where grace_until is not null and status in ('free', 'active')),
      'eventosConError', (select count(*) from public.saas_payment_events where status = 'error'),
      'montosNoCoinciden', (select count(*) from public.saas_payments where not amount_matches),
      'catalogoPublicado', (select version from public.saas_catalog_versions where status = 'published'),
      'academias', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'nombre', o.name, 'alta', o.created_at,
          'plan', l.tier_code, 'estado', coalesce(l.status, 'sin_plan'), 'ciclo', l.billing_cycle, 'renueva', l.current_period_end,
          'cancelaAlFinal', l.cancel_at_period_end, 'jugadores', private.saas_active_players(o.id),
          'complementos', (select coalesce(jsonb_agg(i.addon_code), '[]'::jsonb) from public.saas_subscription_items i where i.subscription_id = l.id),
          'interno', private.saas_is_internal_org(o.id), 'demo', coalesce((o.settings->>'demo')::boolean, false)) order by o.created_at)
        from public.organizations o left join live l on l.organization_id = o.id), '[]'::jsonb),
      'semilla', jsonb_build_object(
          'beneficiadas', (select count(*) from live where tier_code = 'SEMILLA_20' and status = 'free'),
          'jugadores', (select coalesce(sum(private.saas_active_players(organization_id)), 0) from live where tier_code = 'SEMILLA_20' and status = 'free'),
          'crecieron', (select count(distinct organization_id) from public.saas_subscriptions where tier_code = 'SEMILLA_20' and grace_until is not null),
          'migraronAPago', (select count(distinct p.organization_id) from public.saas_subscriptions p
                  where p.status = any(v_live) and p.tier_code <> 'SEMILLA_20'
                    and exists (select 1 from public.saas_subscriptions f where f.organization_id = p.organization_id and f.tier_code = 'SEMILLA_20')),
          'becasVigentes', (select count(*) from public.saas_social_grants where revoked_at is null and ends_at > now()))
    ));
end $$;
revoke all on function private.saas_admin_board() from public, anon, authenticated;

-- ============================================================ 12. Envolturas
-- Patron de la casa: la envoltura corre como definer y la privada revisa el permiso.
create or replace function public.v2_saas_public_catalog()
returns jsonb language sql stable security definer set search_path = '' as $$
  -- Lo unico que ve alguien sin sesion: el catalogo PUBLICADO (o nada).
  select case when private.saas_published_version() is null then null
    else private.saas_catalog_json(private.saas_published_version()) - 'id' - 'status' end
$$;
create or replace function public.v2_saas_quote(organization_id uuid, tier text, cycle text, addons text[] default '{}', coupon text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_module_access(organization_id, 'admin', false) then raise exception 'Not authorized'; end if;
  return private.saas_quote_for(organization_id, private.saas_published_version(), tier, cycle, addons, coupon);
end $$;
create or replace function public.v2_saas_start_checkout(organization_id uuid, tier text, cycle text, addons text[] default '{}', coupon text default null)
returns jsonb language sql security definer set search_path = '' as $$ select private.saas_start_checkout(organization_id, tier, cycle, addons, coupon) $$;
create or replace function public.v2_saas_my_subscription(organization_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$ select private.saas_my_subscription(organization_id) $$;
create or replace function public.v2_saas_set_fiscal_profile(organization_id uuid, profile jsonb)
returns jsonb language sql security definer set search_path = '' as $$ select private.saas_set_fiscal_profile(organization_id, profile) $$;
create or replace function public.v2_saas_request_invoice(organization_id uuid, receipt_folio bigint)
returns jsonb language sql security definer set search_path = '' as $$ select private.saas_request_invoice(organization_id, receipt_folio) $$;
create or replace function public.v2_saas_cancel_renewal(organization_id uuid, reason text default null)
returns jsonb language sql security definer set search_path = '' as $$ select private.saas_cancel_renewal(organization_id, reason) $$;
create or replace function public.v2_saas_export_my_data(organization_id uuid)
returns jsonb language sql security definer set search_path = '' as $$ select private.saas_export_my_data(organization_id) $$;
revoke all on function public.v2_saas_export_my_data(uuid) from public, anon;
grant execute on function public.v2_saas_export_my_data(uuid) to authenticated;
create or replace function public.v2_saas_admin_catalog()
returns jsonb language sql stable security definer set search_path = '' as $$ select private.saas_admin_catalog() $$;
create or replace function public.v2_saas_admin_board()
returns jsonb language sql stable security definer set search_path = '' as $$ select private.saas_admin_board() $$;
create or replace function public.v2_saas_admin_new_draft(from_version int, label text default null)
returns jsonb language sql security definer set search_path = '' as $$ select private.saas_admin_new_draft(from_version, label) $$;
create or replace function public.v2_saas_admin_update_draft(version int, changes jsonb)
returns jsonb language sql security definer set search_path = '' as $$ select private.saas_admin_update_draft(version, changes) $$;
create or replace function public.v2_saas_admin_approve(version int, note text default null)
returns jsonb language sql security definer set search_path = '' as $$ select private.saas_admin_approve(version, note) $$;
create or replace function public.v2_saas_admin_validate_vat(version int, note text)
returns jsonb language sql security definer set search_path = '' as $$ select private.saas_admin_validate_vat(version, note) $$;
create or replace function public.v2_saas_admin_publish(version int, confirm text, effective_from timestamptz default null)
returns jsonb language sql security definer set search_path = '' as $$ select private.saas_admin_publish(version, confirm, effective_from) $$;
create or replace function public.v2_saas_admin_set_readiness(module_code text, status text, notes text default null)
returns void language sql security definer set search_path = '' as $$ select private.saas_admin_set_readiness(module_code, status, notes) $$;
create or replace function public.v2_saas_admin_set_addon_status(version int, code text, status text)
returns jsonb language sql security definer set search_path = '' as $$ select private.saas_admin_set_addon_status(version, code, status) $$;
create or replace function public.v2_saas_admin_assign(organization_id uuid, version int, tier text, cycle text, addons text[], period_end timestamptz, reason text)
returns jsonb language sql security definer set search_path = '' as $$ select private.saas_admin_assign(organization_id, version, tier, cycle, addons, period_end, reason) $$;
create or replace function public.v2_saas_admin_record_manual_payment(subscription_id uuid, reference text, reason text default null)
returns jsonb language sql security definer set search_path = '' as $$ select private.saas_admin_record_manual_payment(subscription_id, reference, reason) $$;
create or replace function public.v2_saas_admin_grant(organization_id uuid, kind text, percent_off_bp int, extra_grace_days int, ends_at timestamptz, reason text)
returns jsonb language sql security definer set search_path = '' as $$ select private.saas_admin_grant(organization_id, kind, percent_off_bp, extra_grace_days, ends_at, reason) $$;

revoke all on function public.v2_saas_public_catalog(), public.v2_saas_quote(uuid, text, text, text[], text),
  public.v2_saas_start_checkout(uuid, text, text, text[], text), public.v2_saas_my_subscription(uuid),
  public.v2_saas_set_fiscal_profile(uuid, jsonb), public.v2_saas_request_invoice(uuid, bigint), public.v2_saas_cancel_renewal(uuid, text),
  public.v2_saas_admin_catalog(), public.v2_saas_admin_board(), public.v2_saas_admin_new_draft(int, text),
  public.v2_saas_admin_update_draft(int, jsonb), public.v2_saas_admin_approve(int, text), public.v2_saas_admin_validate_vat(int, text),
  public.v2_saas_admin_publish(int, text, timestamptz), public.v2_saas_admin_set_readiness(text, text, text),
  public.v2_saas_admin_set_addon_status(int, text, text), public.v2_saas_admin_assign(uuid, int, text, text, text[], timestamptz, text),
  public.v2_saas_admin_record_manual_payment(uuid, text, text), public.v2_saas_admin_grant(uuid, text, int, int, timestamptz, text)
  from public, anon;
grant execute on function public.v2_saas_public_catalog() to anon, authenticated;
grant execute on function public.v2_saas_quote(uuid, text, text, text[], text),
  public.v2_saas_start_checkout(uuid, text, text, text[], text), public.v2_saas_my_subscription(uuid),
  public.v2_saas_set_fiscal_profile(uuid, jsonb), public.v2_saas_request_invoice(uuid, bigint), public.v2_saas_cancel_renewal(uuid, text),
  public.v2_saas_admin_catalog(), public.v2_saas_admin_board(), public.v2_saas_admin_new_draft(int, text),
  public.v2_saas_admin_update_draft(int, jsonb), public.v2_saas_admin_approve(int, text), public.v2_saas_admin_validate_vat(int, text),
  public.v2_saas_admin_publish(int, text, timestamptz), public.v2_saas_admin_set_readiness(text, text, text),
  public.v2_saas_admin_set_addon_status(int, text, text), public.v2_saas_admin_assign(uuid, int, text, text, text[], timestamptz, text),
  public.v2_saas_admin_record_manual_payment(uuid, text, text), public.v2_saas_admin_grant(uuid, text, int, int, timestamptz, text)
  to authenticated;

-- Las del webhook y del ciclo diario son SOLO del rol de servicio (Edge Function / cron).
grant usage on schema private to service_role;
grant execute on function private.saas_attach_preapproval(uuid, text, text, text), private.saas_register_event(text, text, text, text, text, text, boolean),
  private.saas_finish_event(uuid, text, jsonb, text), private.saas_apply_preapproval(text, jsonb), private.saas_apply_payment(text, text, jsonb),
  private.saas_daily(timestamptz), private.saas_cancel_renewal(uuid, text) to service_role;

-- Puertas publicas que SOLO abre service_role (PostgREST solo expone public).
create or replace function public.v2_saas_svc_attach_preapproval(subscription_id uuid, environment text, preapproval_id text, checkout_url text)
returns void language sql security definer set search_path = '' as $$ select private.saas_attach_preapproval(subscription_id, environment, preapproval_id, checkout_url) $$;
create or replace function public.v2_saas_svc_register_event(environment text, event_key text, topic text, action text, resource_id text, request_id text, signature_valid boolean)
returns jsonb language sql security definer set search_path = '' as $$ select private.saas_register_event(environment, event_key, topic, action, resource_id, request_id, signature_valid) $$;
create or replace function public.v2_saas_svc_finish_event(event_id uuid, status text, result jsonb, error text)
returns void language sql security definer set search_path = '' as $$ select private.saas_finish_event(event_id, status, result, error) $$;
create or replace function public.v2_saas_svc_apply_preapproval(environment text, preapproval jsonb)
returns jsonb language sql security definer set search_path = '' as $$ select private.saas_apply_preapproval(environment, preapproval) $$;
create or replace function public.v2_saas_svc_apply_payment(environment text, preapproval_id text, payment jsonb)
returns jsonb language sql security definer set search_path = '' as $$ select private.saas_apply_payment(environment, preapproval_id, payment) $$;
revoke all on function public.v2_saas_svc_attach_preapproval(uuid, text, text, text), public.v2_saas_svc_register_event(text, text, text, text, text, text, boolean),
  public.v2_saas_svc_finish_event(uuid, text, jsonb, text), public.v2_saas_svc_apply_preapproval(text, jsonb),
  public.v2_saas_svc_apply_payment(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.v2_saas_svc_attach_preapproval(uuid, text, text, text), public.v2_saas_svc_register_event(text, text, text, text, text, text, boolean),
  public.v2_saas_svc_finish_event(uuid, text, jsonb, text), public.v2_saas_svc_apply_preapproval(text, jsonb),
  public.v2_saas_svc_apply_payment(text, text, jsonb) to service_role;
