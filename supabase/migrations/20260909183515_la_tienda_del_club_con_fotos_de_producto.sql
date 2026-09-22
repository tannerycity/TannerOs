-- La tienda del portal listaba nombre y precio en texto plano: app.products
-- nunca tuvo columna de foto. Se usa el mismo trio que ya usan jugadores,
-- utileria y scouting, para que el bucket y el firmado sean uno solo.
alter table app.products
  add column if not exists photo_path text,
  add column if not exists photo_bucket text,
  add column if not exists photo_thumb_path text;

create or replace function private.command_set_product_photo(
  p_organization_id uuid,
  p_product_id uuid,
  p_photo_path text,
  p_photo_thumb_path text,
  p_photo_bucket text
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','app','private'
as $function$
declare v_actor uuid := (select auth.uid()); v_before jsonb;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if not private.has_module_access(p_organization_id,'commerce',true) then raise exception 'Not authorized'; end if;

  select jsonb_build_object('photoPath',photo_path,'photoThumbPath',photo_thumb_path,'photoBucket',photo_bucket)
    into v_before
    from app.products
   where id = p_product_id and organization_id = p_organization_id
     for update;
  if v_before is null then raise exception 'Product not found'; end if;

  update app.products
     set photo_path       = nullif(btrim(coalesce(p_photo_path,'')),''),
         photo_thumb_path = nullif(btrim(coalesce(p_photo_thumb_path,'')),''),
         photo_bucket     = nullif(btrim(coalesce(p_photo_bucket,'')),''),
         updated_at       = now()
   where id = p_product_id and organization_id = p_organization_id;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values(p_organization_id,'ProductPhotoUpdated','product',p_product_id,
         jsonb_build_object('before',v_before,'after',jsonb_build_object(
           'photoPath',nullif(btrim(coalesce(p_photo_path,'')),''),
           'photoThumbPath',nullif(btrim(coalesce(p_photo_thumb_path,'')),''),
           'photoBucket',nullif(btrim(coalesce(p_photo_bucket,'')),''))),
         v_actor);

  return jsonb_build_object('ok',true);
end $function$;

create or replace function public.v2_set_product_photo(
  organization_id uuid,
  product_id uuid,
  photo_path text default null,
  photo_thumb_path text default null,
  photo_bucket text default null
) returns jsonb
language sql
security invoker
set search_path to 'pg_catalog','private'
as $function$
  select private.command_set_product_photo(organization_id,product_id,photo_path,photo_thumb_path,photo_bucket);
$function$;

-- Recrear una funcion de private la vuelve a otorgar a PUBLIC. Siempre se revoca.
revoke all on function private.command_set_product_photo(uuid,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.v2_set_product_photo(uuid,uuid,text,text,text) to authenticated;;
