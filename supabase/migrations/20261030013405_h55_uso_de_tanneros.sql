-- h55 · Uso de TannerOS medido en casa, agregado (29/10/2026).
--
-- Presidencia: "comprender el uso de la plataforma: usuarios activos por día,
-- semana y mes, módulos más y menos usados, frecuencia". GA4 sólo mide a quien
-- acepta cookies; esto cuenta a todo el staff sin salir del club y sin datos
-- de nadie más que "abrió tal módulo tal día" (docs/medicion/ARQUITECTURA.md).
--
-- 1. app.usage_daily: aperturas por club, día y módulo (un número).
-- 2. app.usage_actors: quién distinto abrió cada módulo cada día, con un
--    identificador seudónimo (hash con una sal guardada aparte). Sirve para
--    contar usuarios activos (día, semana, mes) sin guardar el id real.
-- 3. v2_usage_ping: lo llama cada pantalla del staff una vez por sesión y
--    módulo. Sólo módulos del catálogo; nunca el rol Tanner.
-- 4. v2_usage_summary: los números para Presidencia (admin). Sin personas.
--
-- Conservación: 13 meses. La purga es una propuesta aparte
-- (supabase/propuestas/uso_purga.sql); aquí no se borra nada.

create table if not exists app.usage_daily (
  organization_id uuid not null references public.organizations(id),
  day date not null,
  module text not null,
  opens integer not null default 0,
  primary key (organization_id, day, module)
);
create table if not exists app.usage_actors (
  organization_id uuid not null references public.organizations(id),
  day date not null,
  module text not null,
  actor text not null,
  primary key (organization_id, day, module, actor)
);
create table if not exists private.usage_salt (
  id boolean primary key default true check (id),
  salt text not null
);
insert into private.usage_salt(salt) values (encode(extensions.gen_random_bytes(32), 'hex')) on conflict (id) do nothing;

alter table app.usage_daily enable row level security;
alter table app.usage_actors enable row level security;
alter table private.usage_salt enable row level security;
revoke all on table app.usage_daily, app.usage_actors, private.usage_salt from public, anon, authenticated;

create or replace function private.usage_modulos()
returns text[] language sql immutable set search_path to '' as $$
  select array['inicio','mensajes','club','direccion','taquilla','contabilidad','finanzas','jugadores','asistencia','becas','partidos',
    'calendario','centro_tanner','academias','formacion','prospectos','candidatos','staff','cumpleanos','encuestas','scouting','visorias',
    'cursosVerano','tienda','catalogo','utileria','estacionamiento','patrocinadores','ideas','usuarios','invitaciones','admin','cambios','qa','convocatoria']
$$;
revoke all on function private.usage_modulos() from public, anon, authenticated;

create or replace function public.v2_usage_ping(organization_id uuid, module text)
returns void language plpgsql security definer set search_path to '' as $$
declare v_org uuid := v2_usage_ping.organization_id; v_uid uuid := (select auth.uid()); v_role text; v_day date := (now() at time zone 'America/Mexico_City')::date;
begin
  if v_uid is null or not (module = any(private.usage_modulos())) then return; end if;
  select m.role into v_role from public.organization_memberships m where m.organization_id = v_org and m.user_id = v_uid and m.active limit 1;
  if v_role is null or v_role = 'Tanner' then return; end if;
  insert into app.usage_daily(organization_id, day, module, opens) values (v_org, v_day, module, 1)
  on conflict on constraint usage_daily_pkey do update set opens = app.usage_daily.opens + 1;
  insert into app.usage_actors(organization_id, day, module, actor)
  values (v_org, v_day, module, encode(pg_catalog.sha256(convert_to(v_uid::text || ':' || v_org::text || ':' || (select s.salt from private.usage_salt s), 'UTF8')), 'hex'))
  on conflict do nothing;
end $$;
revoke all on function public.v2_usage_ping(uuid, text) from public, anon;
grant execute on function public.v2_usage_ping(uuid, text) to authenticated;

-- Números para Presidencia: usuarios activos y uso por módulo, con el periodo
-- anterior para comparar. Nunca quién.
create or replace function public.v2_usage_summary(organization_id uuid, days integer default 30)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_org uuid := v2_usage_summary.organization_id; v_d int := greatest(1, least(coalesce(days, 30), 365));
        v_hoy date := (now() at time zone 'America/Mexico_City')::date; v_desde date := v_hoy - (v_d - 1); v_antes date := v_desde - v_d;
begin
  if not private.has_module_access(v_org, 'admin', false) then raise exception 'Not authorized'; end if;
  return jsonb_build_object(
    'from', v_desde, 'to', v_hoy, 'days', v_d,
    'dau', coalesce((select jsonb_agg(jsonb_build_object('day', x.day, 'users', x.n) order by x.day) from (
       select a.day, count(distinct a.actor) n from app.usage_actors a where a.organization_id = v_org and a.day between v_desde and v_hoy group by a.day) x), '[]'::jsonb),
    'wau', (select count(distinct a.actor) from app.usage_actors a where a.organization_id = v_org and a.day > v_hoy - 7),
    'mau', (select count(distinct a.actor) from app.usage_actors a where a.organization_id = v_org and a.day > v_hoy - 30),
    'users', (select count(distinct a.actor) from app.usage_actors a where a.organization_id = v_org and a.day between v_desde and v_hoy),
    'usersBefore', (select count(distinct a.actor) from app.usage_actors a where a.organization_id = v_org and a.day >= v_antes and a.day < v_desde),
    'modules', coalesce((select jsonb_agg(jsonb_build_object('module', m.module, 'opens', m.opens, 'users', m.users, 'opensBefore', m.antes) order by m.opens desc) from (
       select d.module, sum(d.opens) filter (where d.day between v_desde and v_hoy) opens,
              coalesce(sum(d.opens) filter (where d.day >= v_antes and d.day < v_desde), 0) antes,
              (select count(distinct a.actor) from app.usage_actors a where a.organization_id = v_org and a.module = d.module and a.day between v_desde and v_hoy) users
         from app.usage_daily d where d.organization_id = v_org and d.day >= v_antes group by d.module
       having sum(d.opens) filter (where d.day between v_desde and v_hoy) > 0) m), '[]'::jsonb));
end $$;
revoke all on function public.v2_usage_summary(uuid, integer) from public, anon;
grant execute on function public.v2_usage_summary(uuid, integer) to authenticated;
