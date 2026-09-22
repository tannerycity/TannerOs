-- private.query_my_modules() tenía una lista canónica fija que nunca incluyó
-- 'commerce_finance' ni el nuevo 'catalogo'. Efecto real: el gate de rentabilidad
-- en Pedidos (business-cockpit / financeSection) nunca ha funcionado para NADIE,
-- ni Presidencia — mods.find(m=>m.module_code==='commerce_finance') siempre
-- regresaba undefined. Se agrega ambos códigos a la lista canónica.
CREATE OR REPLACE FUNCTION private.query_my_modules(p_organization_id uuid)
 RETURNS TABLE(module_code text, can_read boolean, can_write boolean, enabled boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
begin
  if not private.is_active_member(p_organization_id) then raise exception 'Not authorized'; end if;
  return query
  with canonical(code) as (values
    ('players'),('billing'),('accounting'),('academies'),('attendance'),('callups'),('programs'),('commerce'),('prospects'),('scouting'),('sponsors'),('equipment'),('calendar'),('users'),('admin'),('qa'),
    ('commerce_finance'),('catalogo')
  )
  select c.code,private.has_module_access(p_organization_id,c.code,false),private.has_module_access(p_organization_id,c.code,true),private.module_enabled(p_organization_id,c.code)
  from canonical c;
end $function$;
;
