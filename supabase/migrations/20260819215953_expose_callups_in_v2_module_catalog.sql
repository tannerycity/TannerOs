create or replace function private.query_my_modules(p_organization_id uuid)
returns table(module_code text,can_read boolean,can_write boolean,enabled boolean)
language plpgsql stable security definer set search_path='pg_catalog','public','private' as $$
begin
  if not private.is_active_member(p_organization_id) then raise exception 'Not authorized'; end if;
  return query
  with canonical(code) as (values
    ('players'),('billing'),('accounting'),('academies'),('attendance'),('callups'),('programs'),('commerce'),('prospects'),('scouting'),('sponsors'),('equipment'),('calendar'),('users'),('admin'),('qa')
  )
  select c.code,private.has_module_access(p_organization_id,c.code,false),private.has_module_access(p_organization_id,c.code,true),private.module_enabled(p_organization_id,c.code)
  from canonical c;
end $$;;
