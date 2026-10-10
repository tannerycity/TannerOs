-- l3 · Portal de plataforma: dar de alta clubes (10/10/2026).
--
-- Presidencia: "cuando lo vaya a vender como SaaS, necesito entrar a un
-- portal para dar de alta un club y configurarlo fácil". Decisiones:
--   · Alta asistida: sólo el administrador de plataforma crea clubes.
--   · Tres planes de venta (Cantera, Primera, Selección); Tannery City se
--     queda en su plan interno.
--   · El nombre del producto todavía no está decidido: vive en
--     platform_settings y se cambia desde el portal, sin tocar código.
--
-- Retoma supabase/propuestas/F1_alta_de_un_club.sql (nunca aplicada) y le
-- tapa dos huecos: el club nacía sin permisos por rol (el dueño entraba y no
-- veía ni un módulo) y nadie invitaba al dueño.

-- ------------------------------------------------ Administrador de plataforma
-- Está por encima de cualquier club. Sin políticas y con RLS: nadie la lee ni
-- la escribe desde el navegador; se consulta sólo desde SECURITY DEFINER.
create table if not exists public.platform_admins (
  user_id    uuid        primary key references auth.users(id) on delete cascade,
  note       text,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from public, anon, authenticated;

-- El dueño de Tannery City, que es quien va a vender el producto.
insert into public.platform_admins (user_id, note)
select m.user_id, 'Dueño de Tannery City y del producto'
from public.organization_memberships m
join public.organizations o on o.id = m.organization_id and o.slug = 'tannery-city-fc'
where m.is_owner and m.active and m.role = 'Presidencia'
on conflict (user_id) do nothing;

create or replace function private.is_platform_admin()
returns boolean language sql stable security definer
set search_path to 'pg_catalog', 'public'
as $$ select exists (select 1 from public.platform_admins where user_id = (select auth.uid())) $$;
revoke all on function private.is_platform_admin() from public, anon, authenticated;

-- ------------------------------------------------------- Ajustes del producto
create table if not exists public.platform_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from public, anon, authenticated;
insert into public.platform_settings(key, value) values ('product', jsonb_build_object('name', 'TannerOS', 'tagline', 'El sistema operativo de tu club'))
on conflict (key) do nothing;

-- ------------------------------------------------------------- Planes de venta
-- metadata: precio mensual sugerido (MXN), límite de jugadores, orden y si se
-- vende. El precio es referencia para el portal; el cobro al club se lleva
-- aparte mientras no haya pasarela.
insert into public.plans (code, name, description, active, metadata) values
  ('cantera',   'Cantera',   'Hasta 50 jugadores: jugadores, asistencia, cobranza, Taquilla, familias y mensajes.', true,
     jsonb_build_object('priceMxn', 990,  'maxPlayers', 50,   'order', 1, 'forSale', true, 'extraPlayerMxn', 15)),
  ('primera',   'Primera',   'Hasta 150 jugadores: todo Cantera más tienda, partidos, becas, utilería y patrocinadores.', true,
     jsonb_build_object('priceMxn', 1990, 'maxPlayers', 150,  'order', 2, 'forSale', true, 'extraPlayerMxn', 15)),
  ('seleccion', 'Selección', 'Más de 150 jugadores o varias sedes: todo, más fichajes, scouting, academias y programas.', true,
     jsonb_build_object('priceMxn', 3490, 'maxPlayers', null, 'order', 3, 'forSale', true, 'extraPlayerMxn', 0))
on conflict (code) do nothing;

update public.plans set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('forSale', false, 'order', 99)
where code = 'internal_full';

-- Módulos por plan. qa y sync son internos: no se venden.
with base(m) as (values ('inicio'),('club'),('direccion'),('jugadores'),('jugadores_estado'),('jugadores_familia'),
       ('asistencia'),('calendario'),('cobranza'),('taquilla'),('finanzas'),('usuarios'),('admin'),('centro_tanner')),
     primera(m) as (select m from base union all values ('tienda'),('catalogo'),('commerce_finance'),('callups'),('convocatoria'),
       ('patrocinadores'),('utileria'),('contabilidad')),
     seleccion(m) as (select m from primera union all values ('prospectos'),('scouting'),('academias'),('cursosVerano'),('estacionamiento'))
insert into public.plan_modules (plan_id, module_code, enabled)
select p.id, x.m, true from public.plans p
join lateral (
  select m from base where p.code = 'cantera'
  union all select m from primera where p.code = 'primera'
  union all select m from seleccion where p.code = 'seleccion') x on true
where p.code in ('cantera', 'primera', 'seleccion')
on conflict do nothing;

-- ------------------------------------------------------------------ El alta
-- Una sola transacción: o nace el club completo (organización, plan,
-- permisos por rol, política de cobro, categorías con su cuota, marca y la
-- invitación al dueño) o no nace nada.
--
-- p: {name, slug, legalName, city, planCode, colors:{primary,secondary,accent},
--     categories:[{name, monthlyFee}], chargeDay, dueDay, lateFee,
--     owner:{name, email, phone}, founder:boolean}
create or replace function private.provision_club(p jsonb)
returns jsonb language plpgsql security definer
set search_path to 'pg_catalog', 'public', 'app', 'private', 'extensions'
as $$
declare
  v_org uuid; v_plan uuid; v_plan_code text := coalesce(nullif(p->>'planCode', ''), 'cantera');
  v_slug text := lower(trim(coalesce(p->>'slug', '')));
  v_name text := trim(coalesce(p->>'name', ''));
  v_email text := lower(trim(coalesce(p->'owner'->>'email', '')));
  v_charge int := coalesce(nullif(p->>'chargeDay', '')::int, 1);
  v_due int := coalesce(nullif(p->>'dueDay', '')::int, 5);
  v_late numeric := coalesce(nullif(p->>'lateFee', '')::numeric, 0);
  v_plantilla uuid; v_inv uuid; v_n int := 0; r record; v_colors jsonb;
  v_hex text := '^#[0-9A-Fa-f]{6}$';
begin
  if not private.is_platform_admin() then raise exception 'Not authorized'; end if;
  if length(v_name) < 2 then raise exception 'El club necesita un nombre'; end if;
  if v_slug !~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$' then
    raise exception 'El identificador lleva entre 3 y 50 caracteres: minúsculas, números y guiones';
  end if;
  if exists (select 1 from public.organizations where lower(slug) = v_slug) then
    raise exception 'Ya hay un club con el identificador %', v_slug;
  end if;
  if v_charge not between 1 and 28 or v_due not between 1 and 28 then raise exception 'El día de cobro y el de vencimiento van entre 1 y 28'; end if;
  if v_late < 0 then raise exception 'El recargo no puede ser negativo'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Escribe el correo del dueño del club'; end if;
  select id into v_plan from public.plans where code = v_plan_code and active;
  if v_plan is null then raise exception 'No existe el plan %', v_plan_code; end if;

  v_colors := jsonb_build_object(
    'primary',    case when p->'colors'->>'primary'   ~ v_hex then p->'colors'->>'primary'   else '#012A3A' end,
    'secondary',  case when p->'colors'->>'secondary' ~ v_hex then p->'colors'->>'secondary' else '#087D8E' end,
    'accent',     case when p->'colors'->>'accent'    ~ v_hex then p->'colors'->>'accent'    else '#C6AC5C' end,
    'background', '#F5F3EB');

  insert into public.organizations (slug, name, legal_name, status, public_key, timezone, locale, currency, branding, settings)
  values (v_slug, v_name, nullif(trim(coalesce(p->>'legalName', '')), ''), 'active', encode(gen_random_bytes(16), 'hex'),
          'America/Mexico_City', 'es-MX', 'MXN',
          jsonb_build_object('brand', v_name, 'colors', v_colors, 'assets', '{}'::jsonb),
          jsonb_build_object('city', nullif(trim(coalesce(p->>'city', '')), ''), 'founder', coalesce((p->>'founder')::boolean, false),
                             'whatsappNumber', nullif(regexp_replace(coalesce(p->'owner'->>'phone', ''), '\D', '', 'g'), ''),
                             'provisionedAt', now(), 'provisionedBy', (select auth.uid())))
  returning id into v_org;

  insert into public.subscriptions (organization_id, plan_id, status, starts_at, metadata)
  values (v_org, v_plan, 'active', now(), jsonb_build_object('founder', coalesce((p->>'founder')::boolean, false)));

  insert into app.billing_policies (organization_id, charge_day, due_day, late_fee_amount, currency)
  values (v_org, v_charge, v_due, v_late, 'MXN');

  -- Permisos por rol: la matriz del primer club (Tannery City), que es la
  -- probada. Sin esto el dueño entra y no ve ni un módulo.
  select id into v_plantilla from public.organizations where id <> v_org order by created_at limit 1;
  insert into public.role_module_permissions (organization_id, role, module_code, can_read, can_write)
  select v_org, rmp.role, rmp.module_code, rmp.can_read, rmp.can_write
  from public.role_module_permissions rmp where rmp.organization_id = v_plantilla;

  for r in select c from jsonb_array_elements(coalesce(p->'categories', '[]'::jsonb)) c loop
    if length(trim(coalesce(r.c->>'name', ''))) > 0 then
      v_n := v_n + 1;
      insert into app.categories (organization_id, code, name, sort_order, status, monthly_fee, monthly_fee_set_at)
      values (v_org, regexp_replace(lower(trim(r.c->>'name')), '[^a-z0-9]+', '_', 'g'), trim(r.c->>'name'), v_n * 10, 'active',
              nullif(r.c->>'monthlyFee', '')::numeric, case when nullif(r.c->>'monthlyFee', '') is not null then now() end)
      on conflict (organization_id, name) do nothing;
    end if;
  end loop;

  -- El dueño entra con este correo: al crear su cuenta, la invitación lo
  -- vuelve Presidencia y dueño del club.
  insert into app.organization_invitations (organization_id, email, role_code, invited_by, token_hash, status, expires_at)
  values (v_org, v_email, 'owner', (select auth.uid()), encode(digest(gen_random_uuid()::text, 'sha256'), 'hex'), 'pending', now() + interval '30 days')
  returning id into v_inv;

  insert into app.domain_events (organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (v_org, 'OrganizationProvisioned', 'organization', v_org,
          jsonb_build_object('slug', v_slug, 'plan', v_plan_code, 'categories', v_n, 'ownerEmail', v_email,
                             'founder', coalesce((p->>'founder')::boolean, false)),
          (select auth.uid()));

  return jsonb_build_object('organizationId', v_org, 'slug', v_slug, 'name', v_name, 'plan', v_plan_code,
    'categories', v_n, 'ownerEmail', v_email, 'ownerName', nullif(trim(coalesce(p->'owner'->>'name', '')), ''),
    'ownerPhone', nullif(regexp_replace(coalesce(p->'owner'->>'phone', ''), '\D', '', 'g'), ''));
end $$;
revoke all on function private.provision_club(jsonb) from public, anon, authenticated;

-- ------------------------------------------------------------- El tablero
create or replace function private.platform_board()
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog', 'public', 'app', 'private'
as $$
begin
  if not private.is_platform_admin() then raise exception 'Not authorized'; end if;
  return jsonb_build_object(
    'product', (select value from public.platform_settings where key = 'product'),
    'plans', coalesce((select jsonb_agg(jsonb_build_object('code', pl.code, 'name', pl.name, 'description', pl.description,
        'priceMxn', pl.metadata->'priceMxn', 'maxPlayers', pl.metadata->'maxPlayers', 'extraPlayerMxn', pl.metadata->'extraPlayerMxn',
        'modules', (select count(*) from public.plan_modules pm where pm.plan_id = pl.id and pm.enabled))
      order by (pl.metadata->>'order')::int nulls last)
      from public.plans pl where pl.active and coalesce((pl.metadata->>'forSale')::boolean, false)), '[]'::jsonb),
    'clubs', coalesce((select jsonb_agg(jsonb_build_object(
        'id', o.id, 'slug', o.slug, 'name', o.name, 'status', o.status, 'createdAt', o.created_at,
        'city', o.settings->>'city', 'founder', coalesce((o.settings->>'founder')::boolean, false),
        'colors', o.branding->'colors', 'hasLogo', (o.branding->'assets'->>'logo') is not null,
        'plan', (select pl.name from public.subscriptions s join public.plans pl on pl.id = s.plan_id where s.organization_id = o.id order by s.created_at desc limit 1),
        'planCode', (select pl.code from public.subscriptions s join public.plans pl on pl.id = s.plan_id where s.organization_id = o.id order by s.created_at desc limit 1),
        'players', (select count(*) from app.players x where x.organization_id = o.id and x.status = 'active' and x.archived_at is null),
        'users', (select count(*) from public.organization_memberships m where m.organization_id = o.id and m.active),
        'categories', (select count(*) from app.categories c where c.organization_id = o.id),
        'ownerPending', (select i.email from app.organization_invitations i where i.organization_id = o.id and i.role_code = 'owner' and i.status = 'pending' order by i.created_at desc limit 1),
        'lastActivity', (select max(e.occurred_at) from app.domain_events e where e.organization_id = o.id))
      order by o.created_at) from public.organizations o), '[]'::jsonb));
end $$;
revoke all on function private.platform_board() from public, anon, authenticated;

create or replace function private.set_product_name(p_name text, p_tagline text)
returns void language plpgsql security definer
set search_path to 'pg_catalog', 'public', 'private'
as $$
begin
  if not private.is_platform_admin() then raise exception 'Not authorized'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'El producto necesita un nombre'; end if;
  insert into public.platform_settings(key, value, updated_at, updated_by)
  values ('product', jsonb_build_object('name', trim(p_name), 'tagline', nullif(trim(coalesce(p_tagline, '')), '')), now(), (select auth.uid()))
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;
end $$;
revoke all on function private.set_product_name(text, text) from public, anon, authenticated;

-- ------------------------------------------------------------- Envolturas
create or replace function public.v2_am_i_platform_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select private.is_platform_admin() $$;
create or replace function public.v2_platform_board()
returns jsonb language sql security definer set search_path = ''
as $$ select private.platform_board() $$;
create or replace function public.v2_provision_club(club jsonb)
returns jsonb language sql security definer set search_path = ''
as $$ select private.provision_club(club) $$;
create or replace function public.v2_set_product_name(name text, tagline text default null)
returns void language sql security definer set search_path = ''
as $$ select private.set_product_name(name, tagline) $$;

revoke all on function public.v2_am_i_platform_admin() from public, anon;
revoke all on function public.v2_platform_board() from public, anon;
revoke all on function public.v2_provision_club(jsonb) from public, anon;
revoke all on function public.v2_set_product_name(text, text) from public, anon;
grant execute on function public.v2_am_i_platform_admin() to authenticated;
grant execute on function public.v2_platform_board() to authenticated;
grant execute on function public.v2_provision_club(jsonb) to authenticated;
grant execute on function public.v2_set_product_name(text, text) to authenticated;