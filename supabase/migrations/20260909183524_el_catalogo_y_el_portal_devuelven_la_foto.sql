-- Las fotos se agregan AL FINAL del objeto. Nunca se renombra ni se reordena
-- lo que ya lee una pantalla.
create or replace function private.portal_catalog()
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare g app.guardians;
begin
  select * into g from private.portal_guardian();
  if g.id is null then raise exception 'Portal access required'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'description', p.description,
      'price', p.price, 'type', p.product_type, 'category', p.category,
      'sizes', p.sizes, 'lead_days', p.lead_days,
      'photo_path', p.photo_path, 'photo_thumb_path', p.photo_thumb_path,
      'photo_bucket', p.photo_bucket)
      order by p.product_type, p.name)
    from app.products p
    where p.organization_id = g.organization_id and p.active and p.archived_at is null
  ), '[]'::jsonb);
end $function$;

revoke all on function private.portal_catalog() from public, anon, authenticated;;
