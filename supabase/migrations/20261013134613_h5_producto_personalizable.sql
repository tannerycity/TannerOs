-- Casilla "Lleva nombre y número" por producto (13/10/2026): "no todos los
-- jerseys o productos van a llevar eso". null = lo decide el nombre/categoría
-- como hasta hoy; true/false lo fija Presidencia desde el catálogo.
alter table app.products add column if not exists personalizable boolean;

do $$
declare f text; d text;
begin
  foreach f in array array['private.portal_catalog()','private.query_catalog(uuid)','private.public_offerings(text)'] loop
    d := pg_get_functiondef(f::regprocedure);
    if position('''personalizable''' in d) = 0 then
      d := replace(d, '''oferta'',private.oferta_producto(p.id),', '''oferta'',private.oferta_producto(p.id),''personalizable'',p.personalizable,');
      d := replace(d, '''oferta'',private.oferta_producto(p.id), ', '''oferta'',private.oferta_producto(p.id),''personalizable'',p.personalizable, ');
      if position('''personalizable''' in d) = 0 then raise exception 'No se pudo parchar %', f; end if;
      execute d;
    end if;
  end loop;
end $$;

create or replace function private.set_product_personalizable(p_organization_id uuid, p_product_id uuid, p_value boolean)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','app','private' as $$
declare v_row app.products%rowtype;
begin
  if not private.is_presidency(p_organization_id) then raise exception 'Solo Presidencia puede editar el catálogo'; end if;
  update app.products set personalizable = p_value, updated_at = now()
   where id = p_product_id and organization_id = p_organization_id returning * into v_row;
  if not found then raise exception 'Producto no encontrado'; end if;
  return jsonb_build_object('id', v_row.id, 'personalizable', v_row.personalizable);
end $$;
revoke all on function private.set_product_personalizable(uuid,uuid,boolean) from public, anon;

create or replace function public.v2_set_product_personalizable(organization_id uuid, product_id uuid, value boolean)
returns jsonb language sql security definer set search_path to 'pg_catalog','private' as $$
  select private.set_product_personalizable(organization_id, product_id, value)
$$;
revoke all on function public.v2_set_product_personalizable(uuid,uuid,boolean) from public, anon;
grant execute on function public.v2_set_product_personalizable(uuid,uuid,boolean) to authenticated;
