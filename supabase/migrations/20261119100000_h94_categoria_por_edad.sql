-- h94 · Categoría sugerida por la edad (19/11/2026)
--
-- Presidencia (carga cognitiva, fase 3): el registro sugiere la categoría con
-- la fecha de nacimiento. Edades que dio Presidencia y que ya quedaron en
-- app.categories (min_age / max_age): Baby Tanner 3-4, T6 5-6, T10 7-10,
-- T12 11-12.
--
-- Cambio: el contexto público del registro manda, además de los nombres de
-- las categorías (que no cambian), "categoryAges": nombre, edad mínima y
-- máxima de cada categoría activa que tenga sus dos edades. Sólo lectura; no
-- trae ningún dato de personas. Lo que ya leía el formulario sigue igual.

begin;

create or replace function private.public_registration_context(p_public_key text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog', 'public', 'private', 'app'
as $function$
declare v_org uuid; v_name text; v_whatsapp text; v_slug text; v_brand text; v_ind jsonb;
begin
  v_org := private.public_organization(p_public_key);
  if v_org is null then raise exception 'Club unavailable'; end if;
  select name, settings->>'whatsappNumber', slug, coalesce(nullif(branding->>'brand', ''), name),
         case when jsonb_typeof(settings->'registroIndicaciones') = 'array' then settings->'registroIndicaciones' else '[]'::jsonb end
    into v_name, v_whatsapp, v_slug, v_brand, v_ind
    from public.organizations where id = v_org and status = 'active';
  if v_name is null then raise exception 'Club unavailable'; end if;
  return jsonb_build_object('organizationId', v_org, 'organizationName', v_name,
                            'whatsappNumber', v_whatsapp, 'slug', v_slug, 'brand', v_brand,
                            'playerNoun', private.normalized_branding(v_org)->'playerNoun',
                            'registrationNotes', v_ind,
                            'categories', coalesce((select jsonb_agg(c.name order by c.sort_order nulls last, c.name)
                                                     from app.categories c
                                                     where c.organization_id = v_org and c.status = 'active'), '[]'::jsonb),
                            'categoryAges', coalesce((select jsonb_agg(jsonb_build_object('name', c.name, 'minAge', c.min_age, 'maxAge', c.max_age)
                                                       order by c.sort_order nulls last, c.name)
                                                     from app.categories c
                                                     where c.organization_id = v_org and c.status = 'active'
                                                       and c.min_age is not null and c.max_age is not null), '[]'::jsonb));
end $function$;

commit;
