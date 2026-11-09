-- h80 · Parches por categoría (09/11/2026)
--
-- Presidencia: "Campeones, para toda la categoría y desmarcamos quién no". La
-- ceremonia de Iniciación también es de grupo. Para registrar a varios a la
-- vez, quien otorga parches (Dirección Deportiva o Presidencia, h78) necesita
-- la lista de cada categoría: aquí está, sólo lectura.
--
--   categorías activas + sus Tanners activos (inscripción vigente), con su
--   miniatura y los parches vigentes que ya tienen (para no repetir).
--
-- El registro sigue siendo uno por Tanner con v2_award_patch (h78), que ya
-- es idempotente: un doble toque o una segunda vuelta no duplican.

create or replace function private.query_patch_roster(p_organization_id uuid, p_category_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_award_patches(p_organization_id) then raise exception 'Not authorized'; end if;
  return jsonb_build_object(
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'stage', c.stage) order by c.sort_order, c.name)
      from app.categories c where c.organization_id = p_organization_id and coalesce(c.status, 'active') = 'active'), '[]'::jsonb),
    'players', case when p_category_id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', btrim(concat_ws(' ', p.first_name, p.last_name)),
          'photoBucket', p.photo_bucket, 'photoThumbPath', coalesce(p.photo_thumb_path, p.photo_path),
          'patches', coalesce((select jsonb_agg(jsonb_build_object('code', t.code, 'variant', a.variant, 'reason', a.reason))
                                 from app.patch_awards a join app.patch_types t on t.id = a.patch_type_id
                                where a.player_id = p.id and a.revoked_at is null), '[]'::jsonb))
        order by p.first_name, p.last_name)
      from app.players p
      where p.organization_id = p_organization_id and coalesce(p.status, 'active') = 'active'
        and exists (select 1 from app.player_enrollments e where e.player_id = p.id and e.organization_id = p_organization_id
                      and e.category_id = p_category_id and e.status = 'active'
                      and e.starts_on <= private.hoy_mx() and (e.ends_on is null or e.ends_on >= private.hoy_mx()))), '[]'::jsonb) end);
end $$;
revoke all on function private.query_patch_roster(uuid, uuid) from public, anon, authenticated;

create or replace function public.v2_patch_roster(organization_id uuid, category_id uuid default null)
returns jsonb language sql stable security definer set search_path = '' as $$ select private.query_patch_roster(organization_id, category_id) $$;
revoke all on function public.v2_patch_roster(uuid, uuid) from public, anon;
grant execute on function public.v2_patch_roster(uuid, uuid) to authenticated;
