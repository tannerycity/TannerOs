-- Ligas públicas por club.
-- Las páginas públicas (registro, programas, academias, tienda, Centro Tanner,
-- aviso de privacidad) mandaban siempre la llave de Tannery. Ahora cada club
-- comparte su liga con ?club=<slug>, y la llave vieja sigue funcionando para
-- los QR y ligas que ya están impresos.
create or replace function private.public_organization(p_public_key text)
returns uuid
language sql
stable security definer
set search_path to 'pg_catalog', 'public'
as $function$
  select id from public.organizations
  where status = 'active'
    and (public_key = p_public_key or slug = lower(trim(p_public_key)))
  -- Si una llave coincidiera con el slug de otro club, gana la llave.
  order by (public_key = p_public_key) desc
  limit 1
$function$;

-- El contexto público también dice el slug y el nombre de marca, para que la
-- página se pinte con el club correcto.
create or replace function private.public_registration_context(p_public_key text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare v_org uuid; v_name text; v_whatsapp text; v_slug text; v_brand text;
begin
  v_org := private.public_organization(p_public_key);
  if v_org is null then raise exception 'Club unavailable'; end if;
  select name, settings->>'whatsappNumber', slug, coalesce(nullif(branding->>'brand', ''), name)
    into v_name, v_whatsapp, v_slug, v_brand
    from public.organizations where id = v_org and status = 'active';
  if v_name is null then raise exception 'Club unavailable'; end if;
  return jsonb_build_object('organizationId', v_org, 'organizationName', v_name,
                            'whatsappNumber', v_whatsapp, 'slug', v_slug, 'brand', v_brand);
end $function$;