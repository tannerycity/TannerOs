-- Dos ajustes que hasta hoy estaban hardcodeados o muertos:
--
-- whatsappNumber ya vivía en organizations.settings desde la migración del
-- legacy, pero no se podía editar ni nadie lo leía.
-- passwordPrefix es nuevo: las contraseñas temporales salían con "T!" fijo, que
-- no dice nada. Pensando en SaaS, cada club pone el suyo.
--
-- Van en settings (jsonb) y no en columnas nuevas: son ajustes de producto que
-- van a crecer, y cada uno como columna convierte la tabla en un cajón.

-- Lo que necesitan otras superficies del club (el edge function que crea
-- cuentas, las pantallas). No es información sensible —un teléfono que el club
-- publica y un prefijo de dos letras—, así que basta con ser del club.
create or replace function private.query_club_config(p_organization_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare o record;
begin
  if not private.is_active_member(p_organization_id) then raise exception 'Not authorized'; end if;
  select name, settings into o from public.organizations where id=p_organization_id;
  if not found then raise exception 'Organization not found'; end if;
  return jsonb_build_object(
    'name', o.name,
    'whatsapp', nullif(regexp_replace(coalesce(o.settings->>'whatsappNumber',''),'\D','','g'),''),
    -- Dos letras por defecto a partir del nombre del club: "Tannery City FC" -> "TC".
    'passwordPrefix', coalesce(
      nullif(upper(regexp_replace(coalesce(o.settings->>'passwordPrefix',''),'[^A-Za-z0-9]','','g')),''),
      nullif(upper(substring(regexp_replace(o.name,'[^A-Za-z ]','','g') from '^(\w)')||
                   coalesce(substring(regexp_replace(o.name,'[^A-Za-z ]','','g') from ' (\w)'),'')),''),
      'TC'));
end $function$;
revoke all on function private.query_club_config(uuid) from public, anon, authenticated;

create or replace function public.v2_club_config(organization_id uuid)
returns jsonb language sql stable security definer set search_path to 'pg_catalog','private'
as $$ select private.query_club_config(organization_id) $$;
revoke all on function public.v2_club_config(uuid) from public, anon;
grant execute on function public.v2_club_config(uuid) to authenticated;

-- Guardar los dos ajustes desde Administración.
create or replace function private.command_update_club_config(
  p_organization_id uuid, p_whatsapp text, p_password_prefix text)
returns jsonb
language plpgsql volatile security definer
set search_path to 'pg_catalog','public','app','private'
as $function$
declare v_actor uuid := (select auth.uid()); v_wa text; v_px text; v_before jsonb;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if not private.has_module_access(p_organization_id,'admin',true) then raise exception 'Not authorized'; end if;

  -- Sólo dígitos: un número con espacios y guiones no sirve para armar una liga
  -- de WhatsApp, y es el error más fácil de cometer al capturarlo.
  v_wa := nullif(regexp_replace(coalesce(p_whatsapp,''),'\D','','g'),'');
  if v_wa is not null and length(v_wa) not between 10 and 15 then
    raise exception 'El WhatsApp debe traer entre 10 y 15 dígitos, con lada de país';
  end if;

  v_px := nullif(upper(regexp_replace(coalesce(p_password_prefix,''),'[^A-Za-z0-9]','','g')),'');
  if v_px is not null and length(v_px) not between 2 and 6 then
    raise exception 'El prefijo debe tener entre 2 y 6 letras o números';
  end if;

  select settings into v_before from public.organizations where id=p_organization_id for update;
  if v_before is null then raise exception 'Organization not found'; end if;

  update public.organizations
     set settings = (coalesce(settings,'{}'::jsonb)
                     || jsonb_build_object('whatsappNumber', v_wa)
                     || jsonb_build_object('passwordPrefix', v_px)),
         updated_at = now()
   where id = p_organization_id;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values(p_organization_id,'ClubConfigUpdated','organization',p_organization_id,
         jsonb_build_object('whatsapp',v_wa,'passwordPrefix',v_px),v_actor);

  return private.query_club_config(p_organization_id);
end $function$;
revoke all on function private.command_update_club_config(uuid,text,text) from public, anon, authenticated;

create or replace function public.v2_update_club_config(
  organization_id uuid, whatsapp text, password_prefix text)
returns jsonb language sql volatile security definer set search_path to 'pg_catalog','private'
as $$ select private.command_update_club_config(organization_id,whatsapp,password_prefix) $$;
revoke all on function public.v2_update_club_config(uuid,text,text) from public, anon;
grant execute on function public.v2_update_club_config(uuid,text,text) to authenticated;
;
