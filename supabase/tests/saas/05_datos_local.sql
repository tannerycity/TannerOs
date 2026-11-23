-- Datos sinteticos para la base local (mcfc_saas_local). Nada de esto es real.
\set ON_ERROR_STOP 1
do $$ begin
  if current_database() <> 'mcfc_saas_local' then raise exception 'Solo en mcfc_saas_local'; end if;
end $$;

insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-0000000000aa', 'plataforma@qa.local'),
  ('00000000-0000-0000-0000-00000000000a', 'presidencia-a@qa.local'),
  ('00000000-0000-0000-0000-00000000000b', 'presidencia-b@qa.local'),
  ('00000000-0000-0000-0000-0000000000c0', 'formador-a@qa.local'),
  ('00000000-0000-0000-0000-0000000000d0', 'baja-a@qa.local');
insert into public.profiles(user_id, active) select id, email <> 'baja-a@qa.local' from auth.users;
insert into public.platform_admins(user_id, note) values ('00000000-0000-0000-0000-0000000000aa', 'QA');

insert into public.organizations(id, slug, name) values
  ('10000000-0000-0000-0000-000000000001', 'interno', 'Club interno (como Tannery)'),
  ('10000000-0000-0000-0000-000000000002', 'cantera', 'Club con plan viejo Cantera'),
  ('10000000-0000-0000-0000-00000000000a', 'club-a', 'Academia A'),
  ('10000000-0000-0000-0000-00000000000b', 'club-b', 'Academia B');

insert into public.subscriptions(organization_id, plan_id, status, provider)
select '10000000-0000-0000-0000-000000000001', id, 'active', 'internal' from public.plans where code = 'internal_full';
insert into public.subscriptions(organization_id, plan_id, status)
select '10000000-0000-0000-0000-000000000002', id, 'active' from public.plans where code = 'cantera';
-- A y B nacen con el plan viejo Cantera, como cualquier club dado de alta hoy (provision_club).
insert into public.subscriptions(organization_id, plan_id, status)
select o, id, 'active' from public.plans, unnest(array['10000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-00000000000b']::uuid[]) o where code = 'cantera';

insert into public.organization_memberships(organization_id, user_id, role, is_owner) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000aa', 'Presidencia', true),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'Presidencia', true),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'Presidencia', true),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000c0', 'Formadores', false),
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000d0', 'Presidencia', false);

insert into public.role_module_permissions(organization_id, role, module_code, can_read, can_write)
select o.id, 'Presidencia', m.code, true, true from public.organizations o, public.modules m;
insert into public.role_module_permissions(organization_id, role, module_code, can_read, can_write)
select o.id, 'Formadores', m, true, true from public.organizations o, unnest(array['jugadores','asistencia','calendario']) m;

-- Academia A: 12 activos; uno de ellos inscrito en DOS categorias; mas un inactivo, un egresado y un archivado.
insert into app.players(id, organization_id, first_name, last_name, birth_date, status)
select ('20000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, '10000000-0000-0000-0000-00000000000a', 'Jugador' || g, 'A', date '2015-01-01' + g, 'active'
from generate_series(1, 12) g;
insert into app.players(organization_id, first_name, last_name, status) values
  ('10000000-0000-0000-0000-00000000000a', 'Inactivo', 'A', 'inactive'),
  ('10000000-0000-0000-0000-00000000000a', 'Egresado', 'A', 'withdrawn');
insert into app.players(organization_id, first_name, last_name, status, archived_at) values ('10000000-0000-0000-0000-00000000000a', 'Archivado', 'A', 'active', now());
insert into app.player_enrollments(organization_id, player_id, category) values
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', 'Sub-10'),
  ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', 'Porteros');
-- Academia B: 25 activos.
insert into app.players(organization_id, first_name, last_name, birth_date, status)
select '10000000-0000-0000-0000-00000000000b', 'Jugador' || g, 'B', date '2014-01-01' + g, 'active' from generate_series(1, 25) g;

-- La foto de compatibilidad: que abre cada club HOY, antes de la migracion.
create table public._qa_compat as
select o.id org, m.code module, private.module_enabled(o.id, m.code) enabled from public.organizations o, public.modules m;
