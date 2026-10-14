-- Varias fotos por producto (14/10/2026): "nos gustaría que los productos
-- pudieran tener una o más fotos". app.products.photos guarda la lista en
-- orden ([{path, thumbPath}], bucket tanneros-private); la primera es la
-- PORTADA y se sigue copiando a photo_path/photo_thumb_path, así todo lo que
-- ya leía una sola foto sigue igual.
alter table app.products add column if not exists photos jsonb not null default '[]'::jsonb;
alter table app.products drop constraint if exists products_photos_es_lista;
alter table app.products add constraint products_photos_es_lista check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 8);

update app.products
   set photos = jsonb_build_array(jsonb_build_object('path', photo_path, 'thumbPath', coalesce(photo_thumb_path, photo_path)))
 where photo_path is not null and photos = '[]'::jsonb;

-- La tienda pública firma las fotos con esta regla: también las de la galería.
create or replace function private.es_foto_de_catalogo(p_name text)
returns boolean language sql stable security definer set search_path to '' as $$
  select exists (
    select 1 from app.products p
     where p.active and p.archived_at is null
       and coalesce(p.photo_bucket, 'tanneros-private') = 'tanneros-private'
       and (p.photo_path = p_name or p.photo_thumb_path = p_name
            or p.photos @> jsonb_build_array(jsonb_build_object('path', p_name))
            or p.photos @> jsonb_build_array(jsonb_build_object('thumbPath', p_name)))
       and private.module_enabled(p.organization_id, 'commerce'));
$$;

create or replace function private.command_set_product_photos(p_organization_id uuid, p_product_id uuid, p_photos jsonb)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public','app','private' as $$
declare
  v_actor uuid := (select auth.uid());
  v_before jsonb; v_lista jsonb := '[]'::jsonb; e jsonb;
  v_carpeta text := 'organizations/' || p_organization_id || '/commerce/products/' || p_product_id || '/';
begin
  if v_actor is null then raise exception 'Inicia sesión'; end if;
  if not private.has_module_access(p_organization_id, 'commerce', true) then raise exception 'No tienes permiso para cambiar las fotos'; end if;
  if jsonb_typeof(coalesce(p_photos, '[]'::jsonb)) <> 'array' then raise exception 'Fotos inválidas'; end if;
  if jsonb_array_length(coalesce(p_photos, '[]'::jsonb)) > 8 then raise exception 'Máximo 8 fotos por producto'; end if;
  for e in select x from jsonb_array_elements(coalesce(p_photos, '[]'::jsonb)) x loop
    if jsonb_typeof(e->'path') <> 'string' or left(e->>'path', length(v_carpeta)) <> v_carpeta or position('/' in substr(e->>'path', length(v_carpeta) + 1)) > 0
       or (e ? 'thumbPath' and e->>'thumbPath' is not null and (left(e->>'thumbPath', length(v_carpeta)) <> v_carpeta or position('/' in substr(e->>'thumbPath', length(v_carpeta) + 1)) > 0)) then
      raise exception 'Esa foto no es de este producto';
    end if;
    v_lista := v_lista || jsonb_build_array(jsonb_build_object('path', e->>'path', 'thumbPath', coalesce(e->>'thumbPath', e->>'path')));
  end loop;

  select photos into v_before from app.products where id = p_product_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Producto no encontrado'; end if;

  update app.products
     set photos = v_lista,
         photo_path = v_lista->0->>'path',
         photo_thumb_path = v_lista->0->>'thumbPath',
         photo_bucket = case when jsonb_array_length(v_lista) > 0 then 'tanneros-private' end,
         updated_at = now()
   where id = p_product_id and organization_id = p_organization_id;

  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, 'ProductPhotosUpdated', 'product', p_product_id, jsonb_build_object('before', v_before, 'after', v_lista), v_actor);
  return jsonb_build_object('ok', true, 'photos', v_lista);
end $$;
revoke all on function private.command_set_product_photos(uuid,uuid,jsonb) from public, anon;
grant execute on function private.command_set_product_photos(uuid,uuid,jsonb) to authenticated;

create or replace function public.v2_set_product_photos(organization_id uuid, product_id uuid, photos jsonb)
returns jsonb language sql security definer set search_path to 'pg_catalog','private' as $$
  select private.command_set_product_photos(organization_id, product_id, photos)
$$;
revoke all on function public.v2_set_product_photos(uuid,uuid,jsonb) from public, anon;
grant execute on function public.v2_set_product_photos(uuid,uuid,jsonb) to authenticated;

-- La función de una sola foto sigue viva: cambia la portada y deja las demás.
do $$
declare d text;
begin
  d := pg_get_functiondef('private.command_set_product_photo(uuid,uuid,text,text,text)'::regprocedure);
  if position('photos' in d) = 0 then
    d := replace(d, '         updated_at       = now()
   where id = p_product_id',
      '         photos           = case when nullif(btrim(coalesce(p_photo_path,'''')),'''') is null then ''[]''::jsonb
                                  else jsonb_build_array(jsonb_build_object(''path'', btrim(p_photo_path), ''thumbPath'', coalesce(nullif(btrim(coalesce(p_photo_thumb_path,'''')),''''), btrim(p_photo_path))))
                                       || coalesce((select jsonb_agg(x.e order by x.i) from jsonb_array_elements(photos) with ordinality x(e, i) where x.i > 1), ''[]''::jsonb) end,
         updated_at       = now()
   where id = p_product_id');
    if position('photos' in d) = 0 then raise exception 'No se pudo parchar command_set_product_photo'; end if;
    execute d;
  end if;
end $$;

-- Las tres lecturas del catálogo entregan la lista.
do $$
declare f text; d text;
begin
  d := pg_get_functiondef('private.query_catalog(uuid)'::regprocedure);
  if position('''photos''' in d) = 0 then
    d := replace(d, '''photoPath'',p.photo_path,''photoThumbPath'',p.photo_thumb_path,''photoBucket'',p.photo_bucket', '''photos'',p.photos,''photoPath'',p.photo_path,''photoThumbPath'',p.photo_thumb_path,''photoBucket'',p.photo_bucket');
    if position('''photos''' in d) = 0 then raise exception 'No se pudo parchar query_catalog'; end if;
    execute d;
  end if;
  d := pg_get_functiondef('private.public_offerings(text)'::regprocedure);
  if position('''photos''' in d) = 0 then
    d := replace(d, '''photoPath'',p.photo_path,''photoThumbPath'',p.photo_thumb_path,''photoBucket'',coalesce(', '''photos'',p.photos,''photoPath'',p.photo_path,''photoThumbPath'',p.photo_thumb_path,''photoBucket'',coalesce(');
    if position('''photos''' in d) = 0 then raise exception 'No se pudo parchar public_offerings'; end if;
    execute d;
  end if;
  d := pg_get_functiondef('private.portal_catalog()'::regprocedure);
  if position('''photos''' in d) = 0 then
    d := replace(d, '''photo_path'', p.photo_path, ''photo_thumb_path'', p.photo_thumb_path,', '''photos'', p.photos, ''photo_path'', p.photo_path, ''photo_thumb_path'', p.photo_thumb_path,');
    if position('''photos''' in d) = 0 then raise exception 'No se pudo parchar portal_catalog'; end if;
    execute d;
  end if;
end $$;
