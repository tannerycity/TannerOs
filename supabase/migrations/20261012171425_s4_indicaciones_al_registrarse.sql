-- Indicaciones al registrarse (Presidencia, 12/10/2026): "cuando se registren,
-- que ahí les diga cómo venir: playera negra, short negro, medias blancas, sin
-- uniformes de otros equipos, y multitacos, no tachones. Para que ya no haya
-- que mandar doble información."
--
-- Cada club escribe las suyas (Administración del club); la pantalla de
-- registro terminado las muestra. Se guardan en organizations.settings.

create or replace function private.public_registration_context(p_public_key text)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog', 'public', 'private', 'app'
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
                                                     where c.organization_id = v_org and c.status = 'active'), '[]'::jsonb));
end $function$;

-- Administración del club: leer y guardar sus indicaciones (hasta 6, 240 letras c/u).
create or replace function private.registration_notes(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_module_access(p_organization_id, 'admin', false) then raise exception 'Not authorized'; end if;
  return coalesce((select case when jsonb_typeof(settings->'registroIndicaciones') = 'array' then settings->'registroIndicaciones' end
                   from public.organizations where id = p_organization_id), '[]'::jsonb);
end $$;

create or replace function private.update_registration_notes(p_organization_id uuid, p_notes jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  if not private.has_module_access(p_organization_id, 'admin', true) then raise exception 'Not authorized'; end if;
  if jsonb_typeof(coalesce(p_notes, '[]'::jsonb)) <> 'array' then raise exception 'Formato inválido'; end if;
  select coalesce(jsonb_agg(t), '[]'::jsonb) into v
    from (select left(btrim(x), 240) t from jsonb_array_elements_text(coalesce(p_notes, '[]'::jsonb)) x where btrim(x) <> '' limit 6) s;
  update public.organizations set settings = settings || jsonb_build_object('registroIndicaciones', v), updated_at = now() where id = p_organization_id;
  return v;
end $$;
revoke all on function private.registration_notes(uuid), private.update_registration_notes(uuid, jsonb) from public, anon, authenticated;

create or replace function public.v2_registration_notes(organization_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$ select private.registration_notes(organization_id) $$;
create or replace function public.v2_update_registration_notes(organization_id uuid, notes jsonb)
returns jsonb language sql security definer set search_path = '' as $$ select private.update_registration_notes(organization_id, notes) $$;
revoke all on function public.v2_registration_notes(uuid), public.v2_update_registration_notes(uuid, jsonb) from public, anon;
grant execute on function public.v2_registration_notes(uuid), public.v2_update_registration_notes(uuid, jsonb) to authenticated;

-- Las de Tannery City, como las dictó Presidencia.
update public.organizations
   set settings = settings || jsonb_build_object('registroIndicaciones', jsonb_build_array(
         'Uniforme de entrenamiento: playera negra, short negro y medias blancas. De preferencia, no traigas uniformes de otros equipos.',
         'Calzado: tenis multitacos. No se permiten tachones.'))
 where slug = 'tannery-city-fc' and not (settings ? 'registroIndicaciones');
