-- El registro público ofrece las categorías del club.
-- El formulario traía escritas las de Tannery (Mini Baby Tanner, Baby Tanner,
-- T8, T10, T12): la familia de otro club habría elegido una categoría que no
-- existe en su club. Ahora salen de app.categories (activas, en su orden).
create or replace function private.public_registration_context(p_public_key text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog', 'public', 'private', 'app'
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
                            'playerNoun', private.normalized_branding(v_org)->'playerNoun',
                            'categories', coalesce((select jsonb_agg(c.name order by c.sort_order nulls last, c.name)
                                                     from app.categories c
                                                     where c.organization_id = v_org and c.status = 'active'), '[]'::jsonb));
end $function$;