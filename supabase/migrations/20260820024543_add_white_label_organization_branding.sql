-- White-label branding per organization. Reuses public.organizations.branding.

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'tanneros-branding','tanneros-branding',true,5242880,
  array['image/png','image/jpeg','image/webp']::text[]
)
on conflict (id) do update
set public=true,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

create or replace function private.branding_storage_org_id(p_name text)
returns uuid
language sql
immutable
set search_path to 'pg_catalog'
as $$
  select case
    when p_name ~ '^organizations/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/branding/'
      then split_part(p_name,'/',2)::uuid
    else null
  end
$$;

create or replace function private.branding_asset_path_valid(p_org uuid,p_path text)
returns boolean
language sql
immutable
set search_path to 'pg_catalog'
as $$
  select p_path is null
      or (
        p_path like ('organizations/'||p_org::text||'/branding/%')
        and p_path not like '%..%'
        and lower(p_path) ~ '\.(png|jpe?g|webp)$'
      )
$$;

create or replace function private.branding_color_valid(p_color text)
returns boolean
language sql
immutable
set search_path to 'pg_catalog'
as $$
  select p_color ~ '^#[0-9A-Fa-f]{6}$'
$$;

create or replace function private.normalized_branding(p_org uuid)
returns jsonb
language sql
stable security definer
set search_path to 'pg_catalog','public'
as $$
  select jsonb_build_object(
    'organizationId',o.id,
    'organizationName',o.name,
    'brand',coalesce(nullif(o.branding->>'brand',''),o.name),
    'product',coalesce(nullif(o.branding->>'product',''),'TannerOS'),
    'appName',coalesce(nullif(o.branding->>'appName',''),nullif(o.branding->>'product',''),'TannerOS'),
    'tagline',coalesce(o.branding->>'tagline',''),
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
$$;

create or replace function private.query_branding(p_organization_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog','private'
as $$
begin
  if not private.is_active_member(p_organization_id) then
    raise exception 'Not authorized';
  end if;
  return private.normalized_branding(p_organization_id);
end
$$;

create or replace function private.public_branding_by_org(p_organization_id uuid)
returns jsonb
language sql
stable security definer
set search_path to 'pg_catalog','private'
as $$
  select private.normalized_branding(p_organization_id)
$$;

create or replace function private.command_update_branding(p_organization_id uuid,p_branding jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','app','private'
as $$
declare
  v_current jsonb;
  v_next jsonb;
  v_brand text;
  v_product text;
  v_app_name text;
  v_tagline text;
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
    jsonb_build_object('brand',v_brand,'appName',v_app_name,'colors',v_next->'colors','assets',v_next->'assets'),
    (select auth.uid())
  );

  return private.normalized_branding(p_organization_id);
end
$$;

create or replace function public.v2_branding(organization_id uuid)
returns jsonb
language sql
stable security definer
set search_path to 'pg_catalog','private'
as $$ select private.query_branding(organization_id) $$;

create or replace function public.v2_update_branding(organization_id uuid,branding jsonb)
returns jsonb
language sql
security definer
set search_path to 'pg_catalog','private'
as $$ select private.command_update_branding(organization_id,branding) $$;

create or replace function public.v2_public_branding_by_org(organization_id uuid)
returns jsonb
language sql
stable security definer
set search_path to 'pg_catalog','private'
as $$ select private.public_branding_by_org(organization_id) $$;

revoke all on function public.v2_branding(uuid) from public,anon;
grant execute on function public.v2_branding(uuid) to authenticated;
revoke all on function public.v2_update_branding(uuid,jsonb) from public,anon;
grant execute on function public.v2_update_branding(uuid,jsonb) to authenticated;
revoke all on function public.v2_public_branding_by_org(uuid) from public;
grant execute on function public.v2_public_branding_by_org(uuid) to anon,authenticated;

-- Browser writes are constrained to the authenticated user's own organization and Admin write permission.
drop policy if exists tanneros_branding_insert on storage.objects;
create policy tanneros_branding_insert on storage.objects
for insert to authenticated
with check (
  bucket_id='tanneros-branding'
  and private.branding_storage_org_id(name) is not null
  and private.has_module_access(private.branding_storage_org_id(name),'admin',true)
);

drop policy if exists tanneros_branding_update on storage.objects;
create policy tanneros_branding_update on storage.objects
for update to authenticated
using (
  bucket_id='tanneros-branding'
  and private.branding_storage_org_id(name) is not null
  and private.has_module_access(private.branding_storage_org_id(name),'admin',true)
)
with check (
  bucket_id='tanneros-branding'
  and private.branding_storage_org_id(name) is not null
  and private.has_module_access(private.branding_storage_org_id(name),'admin',true)
);

drop policy if exists tanneros_branding_delete on storage.objects;
create policy tanneros_branding_delete on storage.objects
for delete to authenticated
using (
  bucket_id='tanneros-branding'
  and private.branding_storage_org_id(name) is not null
  and private.has_module_access(private.branding_storage_org_id(name),'admin',true)
);

-- Seed only non-binary Tannery defaults from the existing V1/V2 identity; existing custom values win.
update public.organizations
set branding = coalesce(branding,'{}'::jsonb)
  || jsonb_build_object(
    'appName',coalesce(nullif(branding->>'appName',''),'TannerOS'),
    'tagline',coalesce(nullif(branding->>'tagline',''),'To our city. To our family. To our Tanners.'),
    'colors',coalesce(branding->'colors',jsonb_build_object(
      'primary','#012A3A','secondary','#087D8E','accent','#C6AC5C','background','#F5F3EB'
    )),
    'assets',coalesce(branding->'assets','{}'::jsonb)
  ),
  updated_at=now()
where slug='tannery-city-fc';;
