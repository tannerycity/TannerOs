-- e3 · La tienda pública enseña las fotos del catálogo
--
-- Pedido de Presidencia (09/10/2026): el link de la tienda tiene que verse
-- como una tienda en línea de verdad, con fotos. Las fotos de producto viven
-- en el bucket privado (tanneros-private) y sólo las podía firmar el staff:
-- quien abría el link veía iniciales ("JB", "JL") en vez del jersey.
--
-- 1. private.es_foto_de_catalogo(name): verdadero sólo si ese archivo es la
--    foto (o su miniatura) de un producto ACTIVO de un club con Tienda
--    encendida. Nada más del bucket privado: fotos de Tanners, documentos y
--    comprobantes siguen cerrados.
-- 2. Política de lectura para anon y authenticated con esa condición: el
--    link (sin sesión) y el portal de familias pueden firmar la foto.
-- 3. El catálogo público (public_offerings) manda la ruta de la foto de cada
--    pieza y de cada componente de los kits, para que el kit se vea con sus
--    prendas. El resto de la respuesta no cambia.
create or replace function private.es_foto_de_catalogo(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from app.products p
     where p.active and p.archived_at is null
       and coalesce(p.photo_bucket, 'tanneros-private') = 'tanneros-private'
       and (p.photo_path = p_name or p.photo_thumb_path = p_name)
       and private.module_enabled(p.organization_id, 'commerce'));
$$;
revoke all on function private.es_foto_de_catalogo(text) from public;
grant execute on function private.es_foto_de_catalogo(text) to anon, authenticated;

create policy tanneros_catalog_photo_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'tanneros-private' and private.es_foto_de_catalogo(name));

create or replace function private.public_offerings(p_public_key text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'app', 'private'
as $$
declare v_org uuid; v_products jsonb; v_bundles jsonb;
begin
  perform private.enforce_public_rate_limit('catalog',120,interval '1 hour');
  v_org:=private.public_organization(p_public_key);
  if v_org is null or not private.module_enabled(v_org,'commerce') then raise exception 'Catalog unavailable'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'kind','product','sku',p.sku,'slug',p.slug,'name',p.name,'description',p.description,'type',p.product_type,'category',p.category,
    'price',p.price,'stock',p.stock,'sizes',p.sizes,'attributes',p.attributes,'leadDays',p.lead_days,'available',true,
    'photoPath',p.photo_path,'photoThumbPath',p.photo_thumb_path,'photoBucket',coalesce(p.photo_bucket,'tanneros-private')
  ) order by p.name),'[]'::jsonb) into v_products
  from app.products p where p.organization_id=v_org and p.active=true and p.archived_at is null;

  with b as (
    select x.*,
      coalesce((select sum(greatest(1,least(20,coalesce((c->>'qty')::int,1)))) from jsonb_array_elements(x.components) c),0) expected_units,
      coalesce((select sum(greatest(1,least(20,coalesce((c->>'qty')::int,1))))
        from jsonb_array_elements(x.components) c
        join app.products p on p.organization_id=x.organization_id and (p.id::text=c->>'productId' or p.legacy_id=c->>'productId') and p.active=true and p.archived_at is null),0) available_units,
      coalesce((select jsonb_agg(jsonb_build_object(
        'legacyProductId',c->>'productId','productId',p.id,'name',coalesce(p.name,c->>'name','Prenda'),
        'qty',greatest(1,least(20,coalesce((c->>'qty')::int,1))),'sizes',coalesce(p.sizes,'[]'::jsonb),'active',coalesce(p.active,false) and p.archived_at is null,
        'category',p.category,'photoThumbPath',p.photo_thumb_path,'photoBucket',coalesce(p.photo_bucket,'tanneros-private')
      ) order by coalesce(p.name,c->>'name','Prenda'))
      from jsonb_array_elements(x.components) c
      left join app.products p on p.organization_id=x.organization_id and (p.id::text=c->>'productId' or p.legacy_id=c->>'productId')),'[]'::jsonb) resolved_components
    from app.product_bundles x
    where x.organization_id=v_org and x.active=true and x.archived_at is null and (x.valid_until is null or x.valid_until>=current_date)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',b.id,'legacyId',b.legacy_id,'kind','bundle','name',b.name,'description',b.description,'priceAdult',b.price_adult,'priceKid',b.price_kid,
    'components',b.resolved_components,'available',(b.expected_units>0 and b.expected_units=b.available_units),
    'blockedReason',case when b.expected_units=0 then 'Paquete sin componentes' when b.expected_units<>b.available_units then 'Incluye una prenda fuera del catálogo V2' else null end,
    'validUntil',b.valid_until
  ) order by b.name),'[]'::jsonb) into v_bundles from b;
  return jsonb_build_object('products',v_products,'bundles',v_bundles);
end
$$;
