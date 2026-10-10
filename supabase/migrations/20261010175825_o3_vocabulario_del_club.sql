-- Cómo le dice cada club a sus jugadores.
-- Tannery les dice "Tanner"; un club nuevo no. La app y los mensajes a
-- familias decían "Tanner" para todos. Ahora vive en la marca del club
-- (branding.playerNoun = {singular, plural}); sin él, "Jugador"/"Jugadores".

create or replace function private.player_noun_valid(p jsonb)
returns boolean
language sql
immutable
set search_path to 'pg_catalog'
as $function$
  select p is not null and jsonb_typeof(p) = 'object'
     and coalesce(p->>'singular', '') ~ '^[[:alpha:]][[:alpha:] ]{1,23}$'
     and coalesce(p->>'plural', '') ~ '^[[:alpha:]][[:alpha:] ]{1,23}$'
$function$;

create or replace function private.normalized_branding(p_org uuid)
returns jsonb
language sql
stable security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
  select jsonb_build_object(
    'organizationId',o.id,
    'organizationName',o.name,
    'brand',coalesce(nullif(o.branding->>'brand',''),o.name),
    'product',coalesce(nullif(o.branding->>'product',''),'TannerOS'),
    'appName',coalesce(nullif(o.branding->>'appName',''),nullif(o.branding->>'product',''),'TannerOS'),
    'tagline',coalesce(o.branding->>'tagline',''),
    'playerNoun',case when private.player_noun_valid(o.branding->'playerNoun')
                      then jsonb_build_object('singular',trim(o.branding#>>'{playerNoun,singular}'),'plural',trim(o.branding#>>'{playerNoun,plural}'))
                      else jsonb_build_object('singular','Jugador','plural','Jugadores') end,
    'colors',jsonb_build_object(
      'primary',coalesce(o.branding#>>'{colors,primary}','#012A3A'),
      'secondary',coalesce(o.branding#>>'{colors,secondary}','#087D8E'),
      'accent',coalesce(o.branding#>>'{colors,accent}','#C6AC5C'),
      'background',coalesce(o.branding#>>'{colors,background}','#F5F3EB')
    ),
    'assets',jsonb_build_object(
      'logo',o.branding#>>'{assets,logo}',
      'logoDark',o.branding#>>'{assets,logoDark}',
      'mark',o.branding#>>'{assets,mark}',
      'appIcon180',o.branding#>>'{assets,appIcon180}',
      'appIcon192',o.branding#>>'{assets,appIcon192}',
      'appIcon512',o.branding#>>'{assets,appIcon512}',
      'splash',o.branding#>>'{assets,splash}'
    ),
    'updatedAt',o.updated_at
  )
  from public.organizations o
  where o.id=p_org and o.status='active'
$function$;

-- Guardar la marca reconstruía el JSON sin playerNoun: lo habría borrado.
create or replace function private.command_update_branding(p_organization_id uuid, p_branding jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'app', 'private'
as $function$
declare
  v_current jsonb;
  v_next jsonb;
  v_brand text;
  v_product text;
  v_app_name text;
  v_tagline text;
  v_noun jsonb;
  v_primary text;
  v_secondary text;
  v_accent text;
  v_background text;
  v_logo text;
  v_logo_dark text;
  v_mark text;
  v_icon180 text;
  v_icon192 text;
  v_icon512 text;
  v_splash text;
begin
  if not private.has_module_access(p_organization_id,'admin',true) then
    raise exception 'Not authorized';
  end if;
  if p_branding is null or jsonb_typeof(p_branding) <> 'object' then
    raise exception 'Invalid branding payload';
  end if;

  v_current:=private.normalized_branding(p_organization_id);
  if v_current is null then raise exception 'Organization unavailable'; end if;

  v_brand:=coalesce(nullif(trim(p_branding->>'brand'),''),v_current->>'brand');
  v_product:=coalesce(nullif(trim(p_branding->>'product'),''),v_current->>'product');
  v_app_name:=coalesce(nullif(trim(p_branding->>'appName'),''),v_current->>'appName');
  v_tagline:=coalesce(p_branding->>'tagline',v_current->>'tagline','');
  if length(v_brand)>100 or length(v_product)>80 or length(v_app_name)>80 or length(v_tagline)>180 then
    raise exception 'Brand text is too long';
  end if;
  v_noun:=coalesce(p_branding->'playerNoun',v_current->'playerNoun');
  if not private.player_noun_valid(v_noun) then raise exception 'Invalid player noun'; end if;
  v_noun:=jsonb_build_object('singular',trim(v_noun->>'singular'),'plural',trim(v_noun->>'plural'));

  v_primary:=upper(coalesce(p_branding#>>'{colors,primary}',v_current#>>'{colors,primary}'));
  v_secondary:=upper(coalesce(p_branding#>>'{colors,secondary}',v_current#>>'{colors,secondary}'));
  v_accent:=upper(coalesce(p_branding#>>'{colors,accent}',v_current#>>'{colors,accent}'));
  v_background:=upper(coalesce(p_branding#>>'{colors,background}',v_current#>>'{colors,background}'));
  if not private.branding_color_valid(v_primary)
     or not private.branding_color_valid(v_secondary)
     or not private.branding_color_valid(v_accent)
     or not private.branding_color_valid(v_background) then
    raise exception 'Invalid brand color';
  end if;

  v_logo:=nullif(p_branding#>>'{assets,logo}','');
  v_logo_dark:=nullif(p_branding#>>'{assets,logoDark}','');
  v_mark:=nullif(p_branding#>>'{assets,mark}','');
  v_icon180:=nullif(p_branding#>>'{assets,appIcon180}','');
  v_icon192:=nullif(p_branding#>>'{assets,appIcon192}','');
  v_icon512:=nullif(p_branding#>>'{assets,appIcon512}','');
  v_splash:=nullif(p_branding#>>'{assets,splash}','');

  if p_branding#>'{assets}' is null then
    v_logo:=nullif(v_current#>>'{assets,logo}','');
    v_logo_dark:=nullif(v_current#>>'{assets,logoDark}','');
    v_mark:=nullif(v_current#>>'{assets,mark}','');
    v_icon180:=nullif(v_current#>>'{assets,appIcon180}','');
    v_icon192:=nullif(v_current#>>'{assets,appIcon192}','');
    v_icon512:=nullif(v_current#>>'{assets,appIcon512}','');
    v_splash:=nullif(v_current#>>'{assets,splash}','');
  end if;

  if not private.branding_asset_path_valid(p_organization_id,v_logo)
     or not private.branding_asset_path_valid(p_organization_id,v_logo_dark)
     or not private.branding_asset_path_valid(p_organization_id,v_mark)
     or not private.branding_asset_path_valid(p_organization_id,v_icon180)
     or not private.branding_asset_path_valid(p_organization_id,v_icon192)
     or not private.branding_asset_path_valid(p_organization_id,v_icon512)
     or not private.branding_asset_path_valid(p_organization_id,v_splash) then
    raise exception 'Invalid branding asset path';
  end if;

  v_next:=jsonb_build_object(
    'brand',v_brand,
    'product',v_product,
    'appName',v_app_name,
    'tagline',v_tagline,
    'playerNoun',v_noun,
    'colors',jsonb_build_object(
      'primary',v_primary,'secondary',v_secondary,'accent',v_accent,'background',v_background
    ),
    'assets',jsonb_build_object(
      'logo',v_logo,'logoDark',v_logo_dark,'mark',v_mark,
      'appIcon180',v_icon180,'appIcon192',v_icon192,'appIcon512',v_icon512,'splash',v_splash
    )
  );

  update public.organizations
  set branding=v_next,updated_at=now()
  where id=p_organization_id and status='active';
  if not found then raise exception 'Organization unavailable'; end if;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values(
    p_organization_id,'OrganizationBrandingUpdated','organization',p_organization_id,
    jsonb_build_object('brand',v_brand,'appName',v_app_name,'playerNoun',v_noun,'colors',v_next->'colors','assets',v_next->'assets'),
    (select auth.uid())
  );

  return private.normalized_branding(p_organization_id);
end
$function$;

-- Las páginas públicas también hablan con el vocabulario del club.
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
                            'whatsappNumber', v_whatsapp, 'slug', v_slug, 'brand', v_brand,
                            'playerNoun', private.normalized_branding(v_org)->'playerNoun');
end $function$;

-- Tannery sigue diciendo "Tanner".
update public.organizations
set branding = branding || jsonb_build_object('playerNoun', jsonb_build_object('singular','Tanner','plural','Tanners'))
where slug = 'tannery-city-fc' and not (branding ? 'playerNoun');