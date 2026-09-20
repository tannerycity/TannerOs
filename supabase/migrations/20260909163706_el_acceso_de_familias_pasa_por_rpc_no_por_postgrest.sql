-- El portal de familias nunca pudo abrirse para nadie.
--
-- El edge function leía y escribía la tabla con admin.from("guardians"), y el
-- cliente de Supabase apunta al esquema public por omisión. app.guardians vive
-- en app: PostgREST no la encuentra, devuelve un PostgrestError —que no es un
-- Error de JS— y el catch general lo convertía en "Unexpected error".
--
-- Cuadra con el dato: 0 de 63 tutores tienen acceso. No es que nadie lo hubiera
-- intentado; es que el camino jamás funcionó, ni por correo ni por usuario.
--
-- Se resuelve por RPC con SECURITY DEFINER, como el resto del sistema, en vez de
-- tocar tablas por PostgREST. El edge function las llama con el token de quien
-- opera, así que el permiso de 'users' se sigue verificando igual que antes.

create or replace function private.query_guardian_for_access(
  p_organization_id uuid, p_guardian_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare g record;
begin
  if not private.has_module_access(p_organization_id,'users',false) then
    raise exception 'Not authorized';
  end if;
  select id, first_name, last_name, email, user_id, organization_id into g
  from app.guardians where id=p_guardian_id;
  if not found then return jsonb_build_object('found',false); end if;
  if g.organization_id<>p_organization_id then raise exception 'Not authorized'; end if;
  return jsonb_build_object(
    'found',true,
    'name',nullif(trim(concat_ws(' ',g.first_name,g.last_name)),''),
    'email',g.email,
    'userId',g.user_id);
end $function$;
revoke all on function private.query_guardian_for_access(uuid,uuid) from public, anon, authenticated;

create or replace function public.v2_guardian_for_access(organization_id uuid, guardian_id uuid)
returns jsonb language sql stable security definer set search_path to 'pg_catalog','private'
as $$ select private.query_guardian_for_access(organization_id,guardian_id) $$;
revoke all on function public.v2_guardian_for_access(uuid,uuid) from public, anon;
grant execute on function public.v2_guardian_for_access(uuid,uuid) to authenticated;

-- Liga la cuenta recién creada con el tutor. El "user_id is null" del WHERE es
-- el candado contra la carrera: si dos personas dan de alta al mismo tutor al
-- mismo tiempo, la segunda no pisa a la primera, se entera.
create or replace function private.command_link_guardian_access(
  p_organization_id uuid, p_guardian_id uuid, p_user_id uuid, p_email text default null)
returns jsonb
language plpgsql volatile security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare v_n int;
begin
  if not private.has_module_access(p_organization_id,'users',true) then
    raise exception 'Not authorized';
  end if;
  update app.guardians
     set user_id=p_user_id,
         email=coalesce(nullif(trim(p_email),''), email),
         updated_at=now()
   where id=p_guardian_id and organization_id=p_organization_id and user_id is null;
  get diagnostics v_n = row_count;
  if v_n=0 then raise exception 'Este tutor ya tiene acceso'; end if;
  return jsonb_build_object('ok',true);
end $function$;
revoke all on function private.command_link_guardian_access(uuid,uuid,uuid,text) from public, anon, authenticated;

create or replace function public.v2_link_guardian_access(
  organization_id uuid, guardian_id uuid, user_id uuid, email text default null)
returns jsonb language sql volatile security definer set search_path to 'pg_catalog','private'
as $$ select private.command_link_guardian_access(organization_id,guardian_id,user_id,email) $$;
revoke all on function public.v2_link_guardian_access(uuid,uuid,uuid,text) from public, anon;
grant execute on function public.v2_link_guardian_access(uuid,uuid,uuid,text) to authenticated;

create or replace function private.command_unlink_guardian_access(
  p_organization_id uuid, p_guardian_id uuid)
returns jsonb
language plpgsql volatile security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare v_user uuid;
begin
  if not private.has_module_access(p_organization_id,'users',true) then
    raise exception 'Not authorized';
  end if;
  select user_id into v_user from app.guardians
   where id=p_guardian_id and organization_id=p_organization_id;
  if v_user is null then return jsonb_build_object('userId',null); end if;
  update app.guardians set user_id=null, updated_at=now()
   where id=p_guardian_id and organization_id=p_organization_id;
  return jsonb_build_object('userId',v_user);
end $function$;
revoke all on function private.command_unlink_guardian_access(uuid,uuid) from public, anon, authenticated;

create or replace function public.v2_unlink_guardian_access(organization_id uuid, guardian_id uuid)
returns jsonb language sql volatile security definer set search_path to 'pg_catalog','private'
as $$ select private.command_unlink_guardian_access(organization_id,guardian_id) $$;
revoke all on function public.v2_unlink_guardian_access(uuid,uuid) from public, anon;
grant execute on function public.v2_unlink_guardian_access(uuid,uuid) to authenticated;
;
