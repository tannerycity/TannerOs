-- La vitrina del portal manda a comprar a la tienda real. La liga se captura
-- en Administracion, no se codifica: cada club del SaaS tiene la suya.
create or replace function private.query_club_config(p_organization_id uuid)
returns jsonb
language plpgsql
stable security definer
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
      'TC'),
    'storeUrl', nullif(btrim(coalesce(o.settings->>'storeUrl','')),''));
end $function$;

create or replace function private.command_update_club_config(
  p_organization_id uuid,
  p_whatsapp text,
  p_password_prefix text,
  p_store_url text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','app','private'
as $function$
declare v_actor uuid := (select auth.uid()); v_wa text; v_px text; v_url text; v_before jsonb;
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

  -- Sólo https: la liga se abre desde el teléfono de una familia.
  v_url := nullif(btrim(coalesce(p_store_url,'')),'');
  if v_url is not null and v_url !~* '^https://[a-z0-9.-]+\.[a-z]{2,}(/|$)' then
    raise exception 'La liga de la tienda debe empezar con https:// y traer un dominio válido';
  end if;

  select settings into v_before from public.organizations where id=p_organization_id for update;
  if v_before is null then raise exception 'Organization not found'; end if;

  update public.organizations
     set settings = (coalesce(settings,'{}'::jsonb)
                     || jsonb_build_object('whatsappNumber', v_wa)
                     || jsonb_build_object('passwordPrefix', v_px)
                     || jsonb_build_object('storeUrl', v_url)),
         updated_at = now()
   where id = p_organization_id;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values(p_organization_id,'ClubConfigUpdated','organization',p_organization_id,
         jsonb_build_object('whatsapp',v_wa,'passwordPrefix',v_px,'storeUrl',v_url),v_actor);

  return private.query_club_config(p_organization_id);
end $function$;

-- La firma de v2_update_club_config cambia, asi que se tira y se vuelve a crear.
drop function if exists public.v2_update_club_config(uuid,text,text);
create function public.v2_update_club_config(
  organization_id uuid,
  whatsapp text default null,
  password_prefix text default null,
  store_url text default null
) returns jsonb
language sql
security invoker
set search_path to 'pg_catalog','private'
as $function$
  select private.command_update_club_config(organization_id,whatsapp,password_prefix,store_url);
$function$;

-- El portal tambien necesita la liga: el tutor no tiene membership.
create or replace function private.portal_home()
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare
  g app.guardians;
  v jsonb;
begin
  select * into g from private.portal_guardian();
  if g.id is null then raise exception 'Portal access required'; end if;

  select jsonb_build_object(
    'guardian', jsonb_build_object(
      'name', concat_ws(' ', nullif(btrim(g.first_name),''), nullif(btrim(g.last_name),'')),
      'phone', g.phone,
      'email', g.email
    ),
    'organization', (
      select jsonb_build_object(
        'name', o.name,
        -- Solo digitos: la liga de WhatsApp no acepta espacios ni guiones.
        'whatsapp', nullif(regexp_replace(coalesce(o.settings->>'whatsappNumber',''),'\D','','g'),''),
        'storeUrl', nullif(btrim(coalesce(o.settings->>'storeUrl','')),'')
      )
      from public.organizations o
      where o.id = g.organization_id
    ),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pl.id,
        'first_name', pl.first_name,
        'last_name', pl.last_name,
        'birth_date', pl.birth_date,
        'category', pl.category,
        'position', pl.position,
        'dominant_foot', pl.dominant_foot,
        'jersey_number', pl.jersey_number,
        'joined_at', pl.joined_at,
        'status', pl.status,
        'photo_path', pl.photo_path,
        'photo_thumb_path', pl.photo_thumb_path,
        'photo_bucket', pl.photo_bucket,
        'balance', coalesce((
          select sum(cb.balance_due)
          from app.charge_balances cb
          where cb.player_id = pl.id
            and cb.balance_due > 0
        ), 0)
      ) order by pl.first_name)
      from app.players pl
      where pl.id in (select player_id from private.portal_player_ids())
    ), '[]'::jsonb)
  ) into v;

  return v;
end
$function$;

revoke all on function private.query_club_config(uuid) from public, anon, authenticated;
revoke all on function private.command_update_club_config(uuid,text,text,text) from public, anon, authenticated;
revoke all on function private.portal_home() from public, anon, authenticated;
grant execute on function public.v2_update_club_config(uuid,text,text,text) to authenticated;;
