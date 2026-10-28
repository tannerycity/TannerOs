-- h49 · Banners de la tienda (28/10/2026)
--
-- Presidencia: "en la tienda unos banners publicitarios que estén
-- scrolleando, como las páginas de adidas, Puma, Nike, para que vean todo lo
-- nuevo, si hay promociones... vamos a hacer una máquina de hacer dinero".
--
-- · app.store_banners: cada banner con su foto de celular (obligatoria) y de
--   compu (opcional), título, frase, botón y a dónde lleva (una pieza, un kit,
--   una categoría o la tienda). Con fechas: se prende y se apaga solo.
--   kind='franja' es la franja de anuncio de arriba (sólo texto).
-- · Las fotos viven junto a las del catálogo (tanneros-private,
--   .../commerce/banners/<id>/...): las sube quien sube las de productos y la
--   tienda pública las lee igual que las de las piezas (es_foto_de_catalogo).
-- · Lo edita quien edita el catálogo (can_edit_catalog). Se archiva, no se borra.

create table if not exists app.store_banners (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  kind text not null default 'banner' check (kind in ('banner', 'franja')),
  title text not null check (length(btrim(title)) between 1 and 80),
  subtitle text check (subtitle is null or length(subtitle) <= 140),
  cta_label text check (cta_label is null or length(cta_label) <= 24),
  target_kind text not null default 'tienda' check (target_kind in ('tienda', 'producto', 'kit', 'categoria')),
  target_value text check (target_value is null or length(target_value) <= 80),
  image_path text,
  image_desktop_path text,
  starts_on date,
  ends_on date,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint store_banners_foto check (kind <> 'banner' or image_path is not null),
  constraint store_banners_fechas check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create index if not exists store_banners_org on app.store_banners(organization_id, sort_order) where archived_at is null;
alter table app.store_banners enable row level security;
revoke all on app.store_banners from anon, authenticated;

-- La tienda pública lee las fotos de los banners vivos como lee las de las piezas.
create or replace function private.es_foto_de_catalogo(p_name text)
returns boolean language sql stable security definer set search_path to '' as $$
  select exists (
    select 1 from app.products p
     where p.active and p.archived_at is null
       and coalesce(p.photo_bucket, 'tanneros-private') = 'tanneros-private'
       and (p.photo_path = p_name or p.photo_thumb_path = p_name
            or p.photos @> jsonb_build_array(jsonb_build_object('path', p_name))
            or p.photos @> jsonb_build_array(jsonb_build_object('thumbPath', p_name)))
       and private.module_enabled(p.organization_id, 'commerce'))
  or exists (
    select 1 from app.store_banners b
     where b.active and b.archived_at is null and b.kind = 'banner'
       and (b.image_path = p_name or b.image_desktop_path = p_name)
       and private.module_enabled(b.organization_id, 'commerce'));
$$;

create or replace function private.banner_json(b app.store_banners, p_hoy date)
returns jsonb language sql stable set search_path to '' as $$
  select jsonb_build_object('id', b.id, 'kind', b.kind, 'title', b.title, 'subtitle', b.subtitle, 'ctaLabel', b.cta_label,
    'targetKind', b.target_kind, 'targetValue', b.target_value, 'imagePath', b.image_path, 'imageDesktopPath', b.image_desktop_path,
    'startsOn', b.starts_on, 'endsOn', b.ends_on, 'sortOrder', b.sort_order, 'active', b.active,
    'estado', case when not b.active then 'pausado'
                   when b.ends_on is not null and b.ends_on < p_hoy then 'vencido'
                   when b.starts_on is not null and b.starts_on > p_hoy then 'programado'
                   else 'activo' end)
$$;
revoke all on function private.banner_json(app.store_banners, date) from public, anon;

create or replace function private.query_store_banners(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_hoy date := private.hoy_mx();
begin
  if not private.can_edit_catalog(p_org) then raise exception 'No tienes permiso para editar el catálogo'; end if;
  return jsonb_build_object('banners', coalesce((select jsonb_agg(private.banner_json(b, v_hoy) order by b.kind, b.sort_order, b.created_at)
    from app.store_banners b where b.organization_id = p_org and b.archived_at is null), '[]'::jsonb));
end $$;
revoke all on function private.query_store_banners(uuid) from public, anon;

create or replace function private.command_save_store_banner(p_org uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_kind text := coalesce(nullif(p->>'kind', ''), 'banner');
  v_title text := btrim(coalesce(p->>'title', ''));
  v_target text := coalesce(nullif(p->>'targetKind', ''), 'tienda');
  v_value text := nullif(btrim(coalesce(p->>'targetValue', '')), '');
  v_img text := nullif(p->>'imagePath', '');
  v_img2 text := nullif(p->>'imageDesktopPath', '');
  v_desde date := nullif(p->>'startsOn', '')::date;
  v_hasta date := nullif(p->>'endsOn', '')::date;
  v_ruta text := '^organizations/' || p_org::text || '/commerce/banners/[0-9a-f-]{36}/(movil|compu)-[0-9]{10,16}\.(webp|jpg|jpeg|png)$';
  v_orden int;
begin
  if not private.can_edit_catalog(p_org) then raise exception 'No tienes permiso para editar el catálogo'; end if;
  if v_kind not in ('banner', 'franja') then raise exception 'Tipo de banner no válido.'; end if;
  if length(v_title) not between 1 and 80 then raise exception 'Escribe el título (hasta 80 letras).'; end if;
  if length(coalesce(p->>'subtitle', '')) > 140 then raise exception 'La frase va de hasta 140 letras.'; end if;
  if length(coalesce(p->>'ctaLabel', '')) > 24 then raise exception 'El botón va de hasta 24 letras.'; end if;
  if v_target not in ('tienda', 'producto', 'kit', 'categoria') then raise exception 'Elige a dónde lleva.'; end if;
  if v_target in ('producto', 'kit', 'categoria') and v_value is null then raise exception 'Elige qué pieza, kit o categoría abre.'; end if;
  if v_target = 'producto' and not exists (select 1 from app.products x where x.id::text = v_value and x.organization_id = p_org and x.archived_at is null) then
    raise exception 'Esa pieza ya no existe.'; end if;
  if v_target = 'kit' and not exists (select 1 from app.product_bundles x where x.id::text = v_value and x.organization_id = p_org) then
    raise exception 'Ese kit ya no existe.'; end if;
  if v_kind = 'banner' and v_img is null then raise exception 'Sube la foto para celular.'; end if;
  if v_img is not null and v_img !~ v_ruta then raise exception 'La foto no se subió bien. Vuelve a elegirla.'; end if;
  if v_img2 is not null and v_img2 !~ v_ruta then raise exception 'La foto de compu no se subió bien. Vuelve a elegirla.'; end if;
  if v_desde is not null and v_hasta is not null and v_hasta < v_desde then raise exception 'La fecha de fin va después del inicio.'; end if;
  if v_kind = 'franja' then v_img := null; v_img2 := null; end if;
  if v_id is null then
    select coalesce(max(sort_order), 0) + 1 into v_orden from app.store_banners where organization_id = p_org and archived_at is null and kind = v_kind;
    insert into app.store_banners(organization_id, kind, title, subtitle, cta_label, target_kind, target_value, image_path, image_desktop_path,
      starts_on, ends_on, sort_order, active, created_by)
    values (p_org, v_kind, v_title, nullif(btrim(coalesce(p->>'subtitle', '')), ''), nullif(btrim(coalesce(p->>'ctaLabel', '')), ''),
      v_target, case when v_target = 'tienda' then null else v_value end, v_img, v_img2, v_desde, v_hasta, v_orden,
      coalesce((p->>'active')::boolean, true), (select auth.uid()))
    returning id into v_id;
  else
    update app.store_banners
       set kind = v_kind, title = v_title, subtitle = nullif(btrim(coalesce(p->>'subtitle', '')), ''),
           cta_label = nullif(btrim(coalesce(p->>'ctaLabel', '')), ''), target_kind = v_target,
           target_value = case when v_target = 'tienda' then null else v_value end,
           image_path = v_img, image_desktop_path = v_img2, starts_on = v_desde, ends_on = v_hasta,
           active = coalesce((p->>'active')::boolean, active), updated_at = now()
     where id = v_id and organization_id = p_org and archived_at is null;
    if not found then raise exception 'Ese banner ya no existe.'; end if;
  end if;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_org, 'StoreBannerSaved', 'store_banner', v_id, jsonb_build_object('kind', v_kind, 'title', v_title), (select auth.uid()));
  return jsonb_build_object('id', v_id);
end $$;
revoke all on function private.command_save_store_banner(uuid, jsonb) from public, anon;

-- pausar / activar / archivar (no se borra: queda la historia de la campaña).
create or replace function private.command_set_store_banner(p_org uuid, p_id uuid, p_action text)
returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  if not private.can_edit_catalog(p_org) then raise exception 'No tienes permiso para editar el catálogo'; end if;
  if p_action not in ('pausar', 'activar', 'archivar') then raise exception 'Acción no válida'; end if;
  update app.store_banners
     set active = case when p_action = 'archivar' then false else p_action = 'activar' end,
         archived_at = case when p_action = 'archivar' then now() else archived_at end, updated_at = now()
   where id = p_id and organization_id = p_org and archived_at is null;
  if not found then raise exception 'Ese banner ya no existe.'; end if;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_org, 'StoreBannerChanged', 'store_banner', p_id, jsonb_build_object('action', p_action), (select auth.uid()));
  return jsonb_build_object('id', p_id, 'action', p_action);
end $$;
revoke all on function private.command_set_store_banner(uuid, uuid, text) from public, anon;

-- El orden en que pasan: la lista de ids, del primero al último.
create or replace function private.command_order_store_banners(p_org uuid, p_ids uuid[])
returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  if not private.can_edit_catalog(p_org) then raise exception 'No tienes permiso para editar el catálogo'; end if;
  update app.store_banners b set sort_order = x.n, updated_at = now()
    from unnest(p_ids) with ordinality as x(id, n)
   where b.id = x.id and b.organization_id = p_org and b.archived_at is null;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function private.command_order_store_banners(uuid, uuid[]) from public, anon;

-- Lo que ve la tienda: los vivos de hoy, en su orden; la primera franja viva.
create or replace function private.query_public_store_banners(p_club_key text)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_org uuid := private.public_organization(p_club_key); v_hoy date := private.hoy_mx();
begin
  if v_org is null then raise exception 'Club not found'; end if;
  if not private.module_enabled(v_org, 'commerce') then return jsonb_build_object('banners', '[]'::jsonb, 'franja', null); end if;
  return jsonb_build_object(
    'banners', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'title', b.title, 'subtitle', b.subtitle, 'ctaLabel', b.cta_label,
        'targetKind', b.target_kind, 'targetValue', b.target_value, 'imagePath', b.image_path, 'imageDesktopPath', b.image_desktop_path,
        'bucket', 'tanneros-private') order by b.sort_order, b.created_at)
      from app.store_banners b
     where b.organization_id = v_org and b.kind = 'banner' and b.active and b.archived_at is null
       and (b.starts_on is null or b.starts_on <= v_hoy) and (b.ends_on is null or b.ends_on >= v_hoy)), '[]'::jsonb),
    'franja', (select jsonb_build_object('id', b.id, 'title', b.title, 'ctaLabel', b.cta_label, 'targetKind', b.target_kind, 'targetValue', b.target_value)
      from app.store_banners b
     where b.organization_id = v_org and b.kind = 'franja' and b.active and b.archived_at is null
       and (b.starts_on is null or b.starts_on <= v_hoy) and (b.ends_on is null or b.ends_on >= v_hoy)
     order by b.sort_order, b.created_at limit 1));
end $$;
revoke all on function private.query_public_store_banners(text) from public, anon;

create or replace function public.v2_store_banners(organization_id uuid)
returns jsonb language sql security definer set search_path to 'pg_catalog','private' as $$
  select private.query_store_banners(organization_id)
$$;
revoke all on function public.v2_store_banners(uuid) from public, anon;
grant execute on function public.v2_store_banners(uuid) to authenticated;

create or replace function public.v2_save_store_banner(organization_id uuid, banner jsonb)
returns jsonb language sql security definer set search_path to 'pg_catalog','private' as $$
  select private.command_save_store_banner(organization_id, banner)
$$;
revoke all on function public.v2_save_store_banner(uuid, jsonb) from public, anon;
grant execute on function public.v2_save_store_banner(uuid, jsonb) to authenticated;

create or replace function public.v2_set_store_banner(organization_id uuid, banner_id uuid, action text)
returns jsonb language sql security definer set search_path to 'pg_catalog','private' as $$
  select private.command_set_store_banner(organization_id, banner_id, action)
$$;
revoke all on function public.v2_set_store_banner(uuid, uuid, text) from public, anon;
grant execute on function public.v2_set_store_banner(uuid, uuid, text) to authenticated;

create or replace function public.v2_order_store_banners(organization_id uuid, banner_ids uuid[])
returns jsonb language sql security definer set search_path to 'pg_catalog','private' as $$
  select private.command_order_store_banners(organization_id, banner_ids)
$$;
revoke all on function public.v2_order_store_banners(uuid, uuid[]) from public, anon;
grant execute on function public.v2_order_store_banners(uuid, uuid[]) to authenticated;

create or replace function public.v2_public_store_banners(club_key text)
returns jsonb language sql stable security definer set search_path to 'pg_catalog','private' as $$
  select private.query_public_store_banners(club_key)
$$;
revoke all on function public.v2_public_store_banners(text) from public;
grant execute on function public.v2_public_store_banners(text) to anon, authenticated;
