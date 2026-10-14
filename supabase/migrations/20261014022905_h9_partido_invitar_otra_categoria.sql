-- Invitar niños de otra categoría a un partido (14/10/2026): "Brandon quiere
-- hacer un partido pero no lo deja agregar niños... de repente subimos niños
-- de una categoría a otra, que sea bien fácil agregarlos". La hoja del partido
-- ya guarda a cualquier Tanner del club; faltaba poder elegirlos.
--  * v2_match_invitables: los Tanners activos con su categoría, para quien
--    captura partidos (no hace falta tener el módulo de Jugadores).
--  * query_match_sheet: cada niño de la hoja dice su categoría y si viene
--    invitado de otra.
create or replace function private.query_match_invitables(p_organization_id uuid)
returns jsonb language sql stable security definer set search_path to 'pg_catalog','app','private' as $$
  select case when not private.puede_capturar_partidos(p_organization_id) then null else
    coalesce((select jsonb_agg(x order by x->>'category', x->>'name') from (
      select jsonb_build_object('playerId', p.id, 'name', trim(concat_ws(' ', p.first_name, p.last_name)),
        'number', p.jersey_number, 'thumb', p.photo_thumb_path, 'bucket', coalesce(p.photo_bucket, 'tanneros-private'),
        'category', (select ct.name from app.player_enrollments pe join app.categories ct on ct.id = pe.category_id
                      where pe.player_id = p.id and pe.organization_id = p_organization_id and pe.status = 'active'
                      order by pe.created_at desc limit 1)) x
      from app.players p
      where p.organization_id = p_organization_id and p.archived_at is null and p.status = 'active') q), '[]'::jsonb) end
$$;
revoke all on function private.query_match_invitables(uuid) from public, anon;

create or replace function public.v2_match_invitables(organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','private' as $$
declare v jsonb;
begin
  v := private.query_match_invitables(organization_id);
  if v is null then raise exception 'Not authorized'; end if;
  return v;
end $$;
revoke all on function public.v2_match_invitables(uuid) from public, anon;
grant execute on function public.v2_match_invitables(uuid) to authenticated;

do $$
declare d text;
begin
  d := pg_get_functiondef('private.query_match_sheet(uuid,uuid)'::regprocedure);
  if position('''invitado''' in d) = 0 then
    d := replace(d, '''yellow'', coalesce(s.yellow_cards, 0), ''red'', coalesce(s.red_cards, 0)) as x',
      '''yellow'', coalesce(s.yellow_cards, 0), ''red'', coalesce(s.red_cards, 0),
        ''categoryName'', cat.name,
        ''invitado'', lower(coalesce(cat.name, '''')) <> lower(coalesce(v_m.category, ''''))) as x');
    d := replace(d, '      left join app.match_player_stats s on s.match_id = v_m.id and s.player_id = p.id
      where p.organization_id = p_organization_id',
      '      left join app.match_player_stats s on s.match_id = v_m.id and s.player_id = p.id
      left join lateral (select ct.name from app.player_enrollments pe join app.categories ct on ct.id = pe.category_id
                          where pe.player_id = p.id and pe.organization_id = p_organization_id and pe.status = ''active''
                          order by (lower(ct.name) = lower(coalesce(v_m.category, ''''))) desc, pe.created_at desc limit 1) cat on true
      where p.organization_id = p_organization_id');
    if position('''invitado''' in d) = 0 or position('cat on true' in d) = 0 then raise exception 'No se pudo parchar query_match_sheet'; end if;
    execute d;
  end if;
end $$;
