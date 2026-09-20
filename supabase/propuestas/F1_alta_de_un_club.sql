-- PROPUESTA · NO APLICADA · NO PROBADA
--
-- Dar de alta un club nuevo, de punta a punta.
--
-- EL HALLAZGO: hoy no se puede. No existe una sola función en la base que cree
-- una organización. Tannery City se creó a mano durante la migración inicial,
-- y desde entonces nadie ha dado de alta un segundo club. El esquema aguanta
-- varios —90 tablas con RLS, 87 con organization_id— pero el camino para
-- estrenar uno no está construido.
--
-- Esta migración construye el mínimo atómico: lo que, si sale a medias, deja un
-- club roto. Todo lo demás (marca, documentos, catálogo, primer usuario) se
-- hace después con las pantallas que ya existen, y el runbook lo explica:
-- docs/alta-de-un-club.md
--
-- REVERSO al final del archivo.
--
-- Lo que SÍ se verificó de esto, sin aplicarlo (consultas de sólo lectura):
--   · Las columnas y valores por omisión de organizations, subscriptions,
--     plans, app.billing_policies y app.categories.
--   · Que `private.module_enabled` decide por subscriptions → plans →
--     plan_modules, con override opcional por organización. Por eso la
--     suscripción es parte del mínimo: sin ella, el club nace sin módulos.
--   · Que NO existe ninguna función de creación de organizaciones, ni ninguna
--     noción de administrador de plataforma.
--
-- Lo que NO se verificó: que corra. Nadie la ha ejecutado.

begin;

-- ------------------------------------------------- Quién puede crear un club
--
-- Crear una organización está por encima de cualquier club: no es algo que el
-- dueño de un club deba poder hacerle al de otro. Hoy `is_owner` es por
-- organización y no hay nada por encima, así que hace falta esta tabla.
--
-- Sin políticas y con RLS: nadie la lee ni la escribe desde el navegador. Se
-- llena a mano, a propósito, y se consulta sólo desde SECURITY DEFINER.
create table if not exists public.platform_admins (
  user_id    uuid        primary key references auth.users(id) on delete cascade,
  note       text,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;

comment on table public.platform_admins is
  'Quién puede dar de alta clubes. Está por encima de cualquier organización, así que no se administra desde ninguna pantalla de club.';

-- El dueño actual de Tannery City. Es el único que hay.
insert into public.platform_admins (user_id, note)
select m.user_id, 'Dueño de Tannery City al momento de crear la tabla'
from public.organization_memberships m
where m.is_owner and m.active
on conflict (user_id) do nothing;

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog','public'
as $fn$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$fn$;

revoke all on function private.is_platform_admin() from public, anon, authenticated;

-- ------------------------------------------------------- El alta, en un paso
--
-- Todo lo de aquí abajo es una sola transacción: el cuerpo de una función lo
-- es. O nace el club completo, o no nace nada. Un club a medias —con
-- organización pero sin suscripción— se ve igual que uno sano hasta que
-- alguien intenta entrar y no tiene ni un módulo.
create or replace function private.provision_organization(
  p_slug        text,
  p_name        text,
  p_legal_name  text     default null,
  p_plan_code   text     default null,
  p_timezone    text     default 'America/Mexico_City',
  p_locale      text     default 'es-MX',
  p_currency    text     default 'MXN',
  p_categories  text[]   default null,
  p_charge_day  smallint default 1,
  p_due_day     smallint default 5,
  p_late_fee    numeric  default 100
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','app','private'
as $fn$
declare
  v_org        uuid;
  v_plan       uuid;
  v_plan_code  text;
  v_public_key text;
  v_slug       text := lower(trim(p_slug));
  v_n          integer := 0;
  v_nombre     text;
begin
  if not private.is_platform_admin() then
    raise exception 'Not authorized';
  end if;

  if v_slug !~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$' then
    raise exception 'El identificador del club sólo lleva minúsculas, números y guiones (entre 3 y 50)';
  end if;
  if length(trim(coalesce(p_name,''))) < 2 then
    raise exception 'El club necesita un nombre';
  end if;
  if exists (select 1 from public.organizations where lower(slug) = v_slug) then
    raise exception 'Ya hay un club con el identificador %', v_slug;
  end if;
  if p_charge_day not between 1 and 28 or p_due_day not between 1 and 28 then
    raise exception 'El día de cargo y el de vencimiento van entre 1 y 28';
  end if;

  -- Sin plan el club nace sin módulos, así que aquí no se admite el silencio:
  -- o lo eligen, o se toma el único activo, o se para.
  if p_plan_code is not null then
    select id, code into v_plan, v_plan_code
      from public.plans where code = p_plan_code and active;
    if v_plan is null then raise exception 'No hay un plan activo con el código %', p_plan_code; end if;
  else
    select id, code into v_plan, v_plan_code from public.plans where active order by created_at limit 1;
    if v_plan is null then raise exception 'No hay ningún plan activo; crea uno antes de dar de alta un club'; end if;
    if (select count(*) from public.plans where active) > 1 then
      raise exception 'Hay más de un plan activo: di cuál con p_plan_code';
    end if;
  end if;

  -- La llave pública viaja en las ligas que la gente abre sin cuenta, así que
  -- se genera aleatoria y no se deriva del nombre.
  v_public_key := encode(gen_random_bytes(16), 'hex');

  insert into public.organizations (slug, name, legal_name, public_key, timezone, locale, currency, settings)
  values (v_slug, trim(p_name), nullif(trim(coalesce(p_legal_name,'')),''), v_public_key,
          p_timezone, p_locale, p_currency,
          jsonb_build_object('source', 'provision_organization',
                             'provisionedAt', now(),
                             'provisionedBy', auth.uid()))
  returning id into v_org;

  insert into public.subscriptions (organization_id, plan_id, status, starts_at)
  values (v_org, v_plan, 'trialing', now());

  insert into app.billing_policies (organization_id, charge_day, due_day, late_fee_amount, currency)
  values (v_org, p_charge_day, p_due_day, p_late_fee, p_currency);

  -- Las categorías son del club, no del sistema: si no dicen cuáles, no se
  -- inventan. Poner las de Tannery City en otro club sería un regalo envenenado.
  if p_categories is not null then
    foreach v_nombre in array p_categories loop
      if length(trim(coalesce(v_nombre,''))) > 0 then
        v_n := v_n + 1;
        insert into app.categories (organization_id, code, name, sort_order)
        values (v_org,
                regexp_replace(lower(trim(v_nombre)), '[^a-z0-9]+', '_', 'g'),
                trim(v_nombre),
                v_n * 10);
      end if;
    end loop;
  end if;

  insert into app.domain_events
    (organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id, actor)
  values (v_org, 'OrganizationProvisioned', 'organization', v_org,
          jsonb_build_object('slug', v_slug, 'plan', v_plan_code, 'categorias', v_n),
          auth.uid(), 'platform_admin');

  return jsonb_build_object(
    'organizationId', v_org,
    'slug',           v_slug,
    'name',           trim(p_name),
    'publicKey',      v_public_key,
    'plan',           v_plan_code,
    'categorias',     v_n,
    -- Lo que falta se dice aquí mismo, para que nadie crea que ya quedó.
    'faltaPorHacer',  jsonb_build_array(
      'Invitar al primer usuario como Presidencia desde /usuarios/',
      'Cargar marca y colores desde /admin/branding/',
      'Escribir el reglamento, el uso de imagen y el aviso de privacidad desde /admin/centro-tanner/',
      'Cargar el catálogo desde /catalogo/',
      'Revisar /admin/onboarding/ hasta que no queden bloqueos'));
end
$fn$;

revoke all on function private.provision_organization(text,text,text,text,text,text,text,text[],smallint,smallint,numeric)
  from public, anon, authenticated;

create or replace function public.v2_provision_organization(
  slug text, name text, legal_name text default null, plan_code text default null,
  timezone text default 'America/Mexico_City', locale text default 'es-MX',
  currency text default 'MXN', categories text[] default null,
  charge_day smallint default 1, due_day smallint default 5, late_fee numeric default 100
)
returns jsonb
language sql
security invoker
set search_path to 'pg_catalog','private'
as $fn$
  select private.provision_organization(slug, name, legal_name, plan_code, timezone, locale,
                                        currency, categories, charge_day, due_day, late_fee)
$fn$;

grant execute on function public.v2_provision_organization(text,text,text,text,text,text,text,text[],smallint,smallint,numeric)
  to authenticated;

-- Para que la pantalla sepa si enseñar el botón. Decir «no eres administrador
-- de plataforma» no es filtrar nada: quien no lo es, ya lo sabe.
create or replace function public.v2_am_i_platform_admin()
returns boolean
language sql
stable
security invoker
set search_path to 'pg_catalog','private'
as $fn$
  select private.is_platform_admin()
$fn$;

grant execute on function public.v2_am_i_platform_admin() to authenticated;

-- La lista de clubes, para el administrador de plataforma.
create or replace function private.platform_organizations()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public','app','private'
as $fn$
declare v_salida jsonb;
begin
  if not private.is_platform_admin() then raise exception 'Not authorized'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', o.id, 'slug', o.slug, 'name', o.name, 'status', o.status,
      'creadoEl', o.created_at,
      'plan', (select pl.code from public.subscriptions s join public.plans pl on pl.id = s.plan_id
                where s.organization_id = o.id order by s.created_at desc limit 1),
      'planEstado', (select s.status from public.subscriptions s
                      where s.organization_id = o.id order by s.created_at desc limit 1),
      'jugadores', (select count(*) from app.players p
                     where p.organization_id = o.id and coalesce(p.status,'') <> 'archived'),
      'usuarios', (select count(*) from public.organization_memberships m
                    where m.organization_id = o.id and m.active),
      'categorias', (select count(*) from app.categories c where c.organization_id = o.id)
    ) order by o.created_at), '[]'::jsonb)
  into v_salida from public.organizations o;
  return v_salida;
end
$fn$;

revoke all on function private.platform_organizations() from public, anon, authenticated;

create or replace function public.v2_platform_organizations()
returns jsonb
language sql
stable
security invoker
set search_path to 'pg_catalog','private'
as $fn$
  select private.platform_organizations()
$fn$;

grant execute on function public.v2_platform_organizations() to authenticated;

commit;


-- ============================================================================
-- REVERSO · no toca ningún club ya creado.
-- ============================================================================
--
-- begin;
--   drop function if exists public.v2_platform_organizations();
--   drop function if exists private.platform_organizations();
--   drop function if exists public.v2_am_i_platform_admin();
--   drop function if exists public.v2_provision_organization(text,text,text,text,text,text,text,text[],smallint,smallint,numeric);
--   drop function if exists private.provision_organization(text,text,text,text,text,text,text,text[],smallint,smallint,numeric);
--   drop function if exists private.is_platform_admin();
--   drop table if exists public.platform_admins;
-- commit;
--
-- Quitar esto deja el sistema como hoy: los clubes que existan siguen
-- funcionando, simplemente vuelve a no haber forma de crear uno nuevo.
