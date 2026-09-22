-- query_equipment_coaches buscaba role='coach' (inglés), pero los roles reales
-- del club son en español: Formadores y Academia. Por eso nunca aparecía
-- ningún profe registrado al entregar material desde Utilería.
create or replace function private.query_equipment_coaches(p_organization_id uuid)
returns table(user_id uuid, display_name text)
language plpgsql
stable security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
begin
  if not private.has_module_access(p_organization_id,'equipment',true) then raise exception 'Not authorized'; end if;
  return query
  select m.user_id, coalesce(pr.display_name,'Sin nombre')
  from public.organization_memberships m
  left join public.profiles pr on pr.user_id=m.user_id
  where m.organization_id=p_organization_id and m.role in ('Formadores','Academia') and m.active=true
  order by coalesce(pr.display_name,'');
end $function$;
;
