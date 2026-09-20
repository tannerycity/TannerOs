-- El catálogo de categorías y quién lleva cada una, para el drawer de Usuarios.
--
-- Va en su propia RPC en vez de crecer query_users_admin: esa función alimenta
-- todo el módulo de Usuarios y no vale la pena reescribirla entera para colgarle
-- dos llaves más.
create or replace function private.query_category_staff(p_organization_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'pg_catalog','app','public','private'
as $function$
declare v_cats jsonb; v_asg jsonb;
begin
  if not private.has_module_access(p_organization_id,'users',false) then
    raise exception 'Not authorized';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'code',c.code,'name',c.name,
    'players',(select count(*) from app.player_enrollments pe
               join app.players p on p.id=pe.player_id and p.organization_id=pe.organization_id
               where pe.organization_id=c.organization_id and pe.category_id=c.id
                 and pe.status='active' and p.status='active' and p.archived_at is null)
  ) order by c.sort_order nulls last, c.name),'[]'::jsonb) into v_cats
  from app.categories c
  where c.organization_id=p_organization_id and c.status='active';

  select coalesce(jsonb_object_agg(t.user_id, t.ids),'{}'::jsonb) into v_asg
  from (select s.user_id, jsonb_agg(s.category_id) as ids
        from app.category_staff_assignments s
        where s.organization_id=p_organization_id
        group by s.user_id) t;

  return jsonb_build_object('categories',v_cats,'byUser',v_asg);
end $function$;
revoke all on function private.query_category_staff(uuid) from public, anon, authenticated;

create or replace function public.v2_category_staff(organization_id uuid)
returns jsonb
language sql stable security definer
set search_path to 'pg_catalog','private'
as $$ select private.query_category_staff(organization_id) $$;
revoke all on function public.v2_category_staff(uuid) from public, anon;
grant execute on function public.v2_category_staff(uuid) to authenticated;
;
