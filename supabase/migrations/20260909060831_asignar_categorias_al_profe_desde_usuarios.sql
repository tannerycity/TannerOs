-- Presidencia asigna las categorías del profe desde Usuarios, que es donde ya
-- se administra el acceso de una persona.
create or replace function private.command_set_category_staff(
  p_organization_id uuid, p_user_id uuid, p_category_ids uuid[])
returns jsonb
language plpgsql volatile security definer
set search_path to 'pg_catalog','app','public','private'
as $function$
declare v_ids uuid[]; v_n int;
begin
  -- Repartir el club es decisión de quien lo administra, no de quien entrena.
  if not private.has_module_access(p_organization_id,'users',true) then
    raise exception 'Not authorized';
  end if;
  if not exists(select 1 from public.organization_memberships m
                where m.organization_id=p_organization_id and m.user_id=p_user_id) then
    raise exception 'Esa persona no pertenece al club';
  end if;

  -- Solo categorías vivas de ESTA organización: si llega un id de fuera, se
  -- descarta en lugar de guardarse y quedar como un permiso fantasma.
  select coalesce(array_agg(c.id),'{}') into v_ids
  from app.categories c
  where c.organization_id=p_organization_id and c.status='active'
    and c.id = any(coalesce(p_category_ids,'{}'::uuid[]));

  delete from app.category_staff_assignments s
   where s.organization_id=p_organization_id and s.user_id=p_user_id
     and not (s.category_id = any(v_ids));

  insert into app.category_staff_assignments(organization_id,category_id,user_id,assigned_by)
  select p_organization_id, x, p_user_id, (select auth.uid())
  from unnest(v_ids) x
  on conflict (category_id,user_id) do nothing;

  select count(*) into v_n from app.category_staff_assignments s
   where s.organization_id=p_organization_id and s.user_id=p_user_id;
  return jsonb_build_object('ok',true,'categories',v_n);
end $function$;
revoke all on function private.command_set_category_staff(uuid,uuid,uuid[]) from public, anon, authenticated;

create or replace function public.v2_set_category_staff(
  organization_id uuid, user_id uuid, category_ids uuid[])
returns jsonb
language sql volatile security definer
set search_path to 'pg_catalog','private'
as $$ select private.command_set_category_staff(organization_id,user_id,category_ids) $$;
revoke all on function public.v2_set_category_staff(uuid,uuid,uuid[]) from public, anon;
grant execute on function public.v2_set_category_staff(uuid,uuid,uuid[]) to authenticated;
;
