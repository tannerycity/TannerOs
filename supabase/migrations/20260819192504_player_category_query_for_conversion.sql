create or replace function private.query_player_categories(p_organization_id uuid)
returns table(id uuid,code text,name text,min_age smallint,max_age smallint,sort_order integer)
language plpgsql stable security definer
set search_path='pg_catalog','app','private'
as $$
begin
  if not private.has_module_access(p_organization_id,'players',false)
     and not private.has_module_access(p_organization_id,'prospects',false)
  then raise exception 'Not authorized'; end if;
  return query select c.id,c.code,c.name,c.min_age,c.max_age,c.sort_order
  from app.categories c where c.organization_id=p_organization_id and c.status='active'
  order by c.sort_order,c.name;
end $$;

create or replace function public.v2_player_categories(organization_id uuid)
returns table(id uuid,code text,name text,min_age smallint,max_age smallint,sort_order integer)
language sql security definer set search_path='pg_catalog','private'
as $$ select * from private.query_player_categories($1) $$;

grant execute on function public.v2_player_categories(uuid) to authenticated;;
