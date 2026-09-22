-- El permiso de academias es a nivel MÓDULO: quien lo tiene ve TODAS las academias
-- del club. Para un profesor eso está mal — debe ver solo donde está asignado.
-- Estas tres funciones son la base del candado; se aplican después a cada consulta.

-- Las academias donde el usuario está asignado como staff.
create or replace function private.my_academy_ids(p_organization_id uuid)
returns setof uuid
language sql stable security definer
set search_path to 'pg_catalog','app','private'
as $function$
  select s.academy_id from app.academy_staff_assignments s
  where s.organization_id=p_organization_id and s.user_id=(select auth.uid())
$function$;
revoke all on function private.my_academy_ids(uuid) from public, anon, authenticated;

-- Quien administra academias: ve todas, configura, cobra. El profesor no entra aquí
-- aunque tenga el módulo: se distingue por poder ESCRIBIR en academias.
create or replace function private.is_academy_admin(p_organization_id uuid)
returns boolean
language sql stable security definer
set search_path to 'pg_catalog','private'
as $function$
  select private.is_presidency(p_organization_id)
      or private.has_module_access(p_organization_id,'academias',true)
$function$;
revoke all on function private.is_academy_admin(uuid) from public, anon, authenticated;

-- ¿Puede ver ESTA academia? Admin ve todas; el resto solo las suyas.
create or replace function private.can_see_academy(p_organization_id uuid, p_academy_id uuid)
returns boolean
language sql stable security definer
set search_path to 'pg_catalog','private'
as $function$
  select private.has_module_access(p_organization_id,'academias',false)
     and (private.is_academy_admin(p_organization_id)
          or p_academy_id in (select private.my_academy_ids(p_organization_id)))
$function$;
revoke all on function private.can_see_academy(uuid,uuid) from public, anon, authenticated;;
