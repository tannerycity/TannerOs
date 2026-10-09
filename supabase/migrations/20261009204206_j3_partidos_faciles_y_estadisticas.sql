-- j3 · Partidos: registro fácil para el profe y estadísticas (09/10/2026).
--
-- Presidencia: "cuando juguemos partidos, que anoten quién jugó, quién
-- asistió, quién metió gol, quién dio asistencia, el marcador, contra quién
-- y qué liga". Lo captura el profe o Operaciones (quien escribe
-- Convocatoria). "Jugó" no pide minutos: medio tiempo o más / menos / no
-- jugó / no llegó.
--
-- Reusa app.matches, app.match_callups y app.match_player_stats (lo que ya
-- lee la ficha del Tanner). Sin columnas nuevas:
--   · matches.metadata: {venue: 'local'|'visita', goals: [{scorer, assist}]}
--   · match_player_stats.metadata: {tiempo: 'medio'|'poco'|'no_jugo'|'no_llego'}
-- Los goles y asistencias de cada Tanner salen de la lista de goles: una sola
-- fuente, no dos que se contradigan.

create or replace function private.puede_capturar_partidos(p_organization_id uuid)
returns boolean language sql stable security definer
set search_path to 'pg_catalog', 'private'
as $$ select private.has_module_access(p_organization_id, 'callups', true) $$;

create or replace function private.puede_ver_partidos(p_organization_id uuid)
returns boolean language sql stable security definer
set search_path to 'pg_catalog', 'private'
as $$ select private.has_module_access(p_organization_id, 'callups', false)
          or private.has_module_access(p_organization_id, 'calendar', false) $$;

-- === Tablero: categorías y partidos ===
create or replace function private.query_match_board(p_organization_id uuid)
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog', 'app', 'private'
as $$
declare v_mias uuid[];
begin
  if not private.puede_ver_partidos(p_organization_id) then raise exception 'Not authorized'; end if;
  select coalesce(array_agg(x), '{}') into v_mias from private.my_category_ids(p_organization_id) x;
  return jsonb_build_object(
    'canWrite', private.puede_capturar_partidos(p_organization_id),
    'categories', coalesce((select jsonb_agg(jsonb_build_object(
        'name', c.name, 'mine', c.id = any(v_mias),
        'players', (select count(*) from app.player_enrollments pe join app.players p on p.id = pe.player_id
                     and p.status = 'active' and p.archived_at is null
                     where pe.organization_id = p_organization_id and pe.category_id = c.id and pe.status = 'active'))
      order by c.sort_order nulls last, c.name)
      from app.categories c where c.organization_id = p_organization_id), '[]'::jsonb),
    'opponents', coalesce((select jsonb_agg(o order by o) from (
        select distinct m.opponent o from app.matches m
        where m.organization_id = p_organization_id and m.archived_at is null and m.opponent is not null) q), '[]'::jsonb),
    'matches', coalesce((select jsonb_agg(jsonb_build_object(
        'id', m.id, 'date', m.match_date, 'category', m.category, 'opponent', m.opponent,
        'tournament', m.tournament, 'venue', m.metadata->>'venue', 'status', m.status,
        'goalsFor', m.goals_for, 'goalsAgainst', m.goals_against,
        'called', (select count(*) from app.match_callups c where c.match_id = m.id and c.selected),
        'played', (select count(*) from app.match_player_stats s where s.match_id = m.id
                    and coalesce(s.metadata->>'tiempo', case when s.attended then 'medio' else 'no_llego' end) in ('medio','poco')))
      order by m.match_date desc, m.created_at desc)
      from app.matches m
      where m.organization_id = p_organization_id and m.archived_at is null
        and m.status in ('scheduled','completed')
        and m.match_date >= current_date - 365), '[]'::jsonb)
  );
end $$;

-- === La hoja de un partido: datos, goles y la lista de la categoría ===
create or replace function private.query_match_sheet(p_organization_id uuid, p_match_id uuid)
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog', 'app', 'private'
as $$
declare v_m app.matches%rowtype; v_hay_conv boolean;
begin
  if not private.puede_ver_partidos(p_organization_id) then raise exception 'Not authorized'; end if;
  select * into v_m from app.matches where id = p_match_id and organization_id = p_organization_id and archived_at is null;
  if not found then raise exception 'Match not found'; end if;
  v_hay_conv := exists(select 1 from app.match_callups c where c.match_id = v_m.id)
             or exists(select 1 from app.match_player_stats s where s.match_id = v_m.id);
  return jsonb_build_object(
    'canWrite', private.puede_capturar_partidos(p_organization_id),
    'match', jsonb_build_object('id', v_m.id, 'date', v_m.match_date, 'category', v_m.category, 'opponent', v_m.opponent,
      'tournament', v_m.tournament, 'venue', v_m.metadata->>'venue', 'status', v_m.status,
      'goalsFor', coalesce(v_m.goals_for, 0), 'goalsAgainst', coalesce(v_m.goals_against, 0),
      'goals', coalesce(v_m.metadata->'goals', '[]'::jsonb), 'notes', v_m.notes, 'saved', v_hay_conv),
    'roster', coalesce((select jsonb_agg(x order by x->>'name') from (
      select jsonb_build_object(
        'playerId', p.id, 'name', trim(concat_ws(' ', p.first_name, p.last_name)), 'code', p.code,
        'number', p.jersey_number, 'thumb', p.photo_thumb_path, 'bucket', coalesce(p.photo_bucket, 'tanneros-private'),
        'called', coalesce(c.selected, s.id is not null),
        'tiempo', coalesce(s.metadata->>'tiempo', case when s.id is null then null when s.attended then 'medio' else 'no_llego' end),
        'yellow', coalesce(s.yellow_cards, 0), 'red', coalesce(s.red_cards, 0)) as x
      from app.players p
      left join app.match_callups c on c.match_id = v_m.id and c.player_id = p.id
      left join app.match_player_stats s on s.match_id = v_m.id and s.player_id = p.id
      where p.organization_id = p_organization_id and p.archived_at is null
        and (
          (p.status = 'active' and exists(select 1 from app.player_enrollments pe join app.categories ct on ct.id = pe.category_id
             where pe.organization_id = p_organization_id and pe.player_id = p.id and pe.status = 'active'
               and lower(ct.name) = lower(coalesce(v_m.category, ''))))
          or c.id is not null or s.id is not null)
    ) q), '[]'::jsonb)
  );
end $$;

-- === Guardar el partido completo de un golpe ===
-- p: {id?, date, category, opponent, tournament, venue, status, goalsAgainst,
--     goals:[{scorer, assist}], players:[{playerId, called, tiempo, yellow, red}]}
create or replace function private.command_save_match_sheet(p_organization_id uuid, p jsonb)
returns uuid language plpgsql security definer
set search_path to 'pg_catalog', 'app', 'private'
as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_date date := nullif(p->>'date', '')::date;
  v_status text := coalesce(nullif(p->>'status', ''), 'scheduled');
  v_venue text := nullif(p->>'venue', '');
  v_goals jsonb := coalesce(p->'goals', '[]'::jsonb);
  v_players jsonb := coalesce(p->'players', '[]'::jsonb);
  v_gf int; v_ga int := coalesce(nullif(p->>'goalsAgainst', '')::int, 0);
  v_meta jsonb;
  r record; v_name text; v_att boolean; v_jugo boolean; v_g int; v_a int;
begin
  if not private.puede_capturar_partidos(p_organization_id) then raise exception 'Not authorized'; end if;
  if v_date is null then raise exception 'Match date required'; end if;
  if coalesce(length(trim(p->>'opponent')), 0) < 2 then raise exception 'Opponent required'; end if;
  if nullif(trim(coalesce(p->>'category', '')), '') is null then raise exception 'Category required'; end if;
  if v_status not in ('scheduled', 'completed') then raise exception 'Invalid match status'; end if;
  if v_venue is not null and v_venue not in ('local', 'visita') then raise exception 'Invalid venue'; end if;
  if v_ga < 0 or v_ga > 99 then raise exception 'Invalid score'; end if;
  if jsonb_typeof(v_goals) <> 'array' or jsonb_typeof(v_players) <> 'array' then raise exception 'Invalid sheet'; end if;
  v_gf := jsonb_array_length(v_goals);
  if v_gf > 99 then raise exception 'Invalid score'; end if;

  -- Cada gol: quien lo metió y quien asistió tienen que haber jugado ese
  -- partido, y no pueden ser la misma persona.
  for r in select g from jsonb_array_elements(v_goals) g loop
    if nullif(r.g->>'scorer', '') is not null and nullif(r.g->>'scorer', '') = nullif(r.g->>'assist', '') then
      raise exception 'Scorer cannot assist himself';
    end if;
    if nullif(r.g->>'assist', '') is not null and nullif(r.g->>'scorer', '') is null then
      raise exception 'Assist needs a scorer';
    end if;
    if exists(select 1 from (values (nullif(r.g->>'scorer', '')), (nullif(r.g->>'assist', ''))) v(pid)
              where v.pid is not null and not exists(
                select 1 from jsonb_array_elements(v_players) pl
                where pl->>'playerId' = v.pid and coalesce((pl->>'called')::boolean, false)
                  and pl->>'tiempo' in ('medio', 'poco'))) then
      raise exception 'Goal by a player who did not play';
    end if;
  end loop;

  v_meta := jsonb_build_object('venue', v_venue, 'goals', v_goals);
  if v_id is null then
    insert into app.matches(organization_id, match_date, category, opponent, tournament, result, goals_for, goals_against, status, metadata, created_at, updated_at)
    values (p_organization_id, v_date, trim(p->>'category'), trim(p->>'opponent'), nullif(trim(coalesce(p->>'tournament', '')), ''),
            case when v_status = 'completed' then v_gf || '-' || v_ga end, v_gf, v_ga, v_status, v_meta, now(), now())
    returning id into v_id;
  else
    update app.matches set match_date = v_date, category = trim(p->>'category'), opponent = trim(p->>'opponent'),
      tournament = nullif(trim(coalesce(p->>'tournament', '')), ''),
      result = case when v_status = 'completed' then v_gf || '-' || v_ga end,
      goals_for = v_gf, goals_against = v_ga, status = v_status,
      metadata = coalesce(metadata, '{}'::jsonb) || v_meta, updated_at = now()
    where id = v_id and organization_id = p_organization_id and archived_at is null;
    if not found then raise exception 'Match not found'; end if;
  end if;

  for r in select pl from jsonb_array_elements(v_players) pl loop
    if not exists(select 1 from app.players x where x.id = (r.pl->>'playerId')::uuid and x.organization_id = p_organization_id and x.archived_at is null) then
      raise exception 'Player not found';
    end if;
    if coalesce(r.pl->>'tiempo', 'medio') not in ('medio', 'poco', 'no_jugo', 'no_llego') then raise exception 'Invalid playing time'; end if;

    insert into app.match_callups(organization_id, match_id, player_id, selected, updated_by_user_id, created_at, updated_at)
    values (p_organization_id, v_id, (r.pl->>'playerId')::uuid, coalesce((r.pl->>'called')::boolean, false), (select auth.uid()), now(), now())
    on conflict (organization_id, match_id, player_id) do update set selected = excluded.selected, updated_by_user_id = excluded.updated_by_user_id, updated_at = now();

    if coalesce((r.pl->>'called')::boolean, false) then
      v_att := coalesce(r.pl->>'tiempo', 'medio') <> 'no_llego';
      v_jugo := coalesce(r.pl->>'tiempo', 'medio') in ('medio', 'poco');
      select count(*) filter (where g->>'scorer' = r.pl->>'playerId'), count(*) filter (where g->>'assist' = r.pl->>'playerId')
        into v_g, v_a from jsonb_array_elements(v_goals) g;
      select trim(concat_ws(' ', first_name, last_name)) into v_name from app.players where id = (r.pl->>'playerId')::uuid;
      insert into app.match_player_stats(organization_id, match_id, player_id, player_name_snapshot, attended, starter, minutes_played,
        goals, assists, yellow_cards, red_cards, saves, clean_sheet, metadata, created_at, updated_at)
      values (p_organization_id, v_id, (r.pl->>'playerId')::uuid, v_name, v_att, false, 0,
        case when v_jugo then v_g else 0 end, case when v_jugo then v_a else 0 end,
        case when v_att then greatest(0, least(coalesce(nullif(r.pl->>'yellow', '')::int, 0), 2)) else 0 end,
        case when v_att then greatest(0, least(coalesce(nullif(r.pl->>'red', '')::int, 0), 1)) else 0 end,
        0, false, jsonb_build_object('tiempo', coalesce(r.pl->>'tiempo', 'medio')), now(), now())
      on conflict (organization_id, match_id, player_id) where player_id is not null do update set
        player_name_snapshot = excluded.player_name_snapshot, attended = excluded.attended, goals = excluded.goals,
        assists = excluded.assists, yellow_cards = excluded.yellow_cards, red_cards = excluded.red_cards,
        metadata = coalesce(app.match_player_stats.metadata, '{}'::jsonb) || excluded.metadata, updated_at = now();
    else
      -- Quien ya no va convocado no tiene estadística de este partido.
      delete from app.match_player_stats where match_id = v_id and player_id = (r.pl->>'playerId')::uuid;
    end if;
  end loop;

  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, 'MatchSheetSaved', 'match', v_id,
          jsonb_build_object('status', v_status, 'goalsFor', v_gf, 'goalsAgainst', v_ga, 'players', jsonb_array_length(v_players)),
          (select auth.uid()));
  return v_id;
end $$;

-- === Estadísticas ===
create or replace function private.query_match_stats(p_organization_id uuid, p_from date, p_to date, p_category text default null)
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog', 'app', 'private'
as $$
begin
  if not private.puede_ver_partidos(p_organization_id) then raise exception 'Not authorized'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Invalid date range'; end if;
  return (
    with pm as (
      select m.* from app.matches m
      where m.organization_id = p_organization_id and m.archived_at is null and m.status = 'completed'
        and m.match_date between p_from and p_to
        and (p_category is null or lower(m.category) = lower(p_category))
    ),
    st as (
      select s.player_id, s.match_id,
             coalesce(s.metadata->>'tiempo', case when s.attended then 'medio' else 'no_llego' end) as tiempo,
             s.goals, s.assists, s.yellow_cards, s.red_cards
      from app.match_player_stats s join pm on pm.id = s.match_id where s.player_id is not null
    ),
    por as (
      select st.player_id, count(*) as convocado,
             count(*) filter (where tiempo in ('medio','poco')) as jugo,
             count(*) filter (where tiempo = 'medio') as medio,
             count(*) filter (where tiempo = 'no_llego') as no_llego,
             sum(goals) as goles, sum(assists) as asist, sum(yellow_cards) as am, sum(red_cards) as ro
      from st group by 1
    ),
    plantel as (
      select p.id, p.first_name, p.last_name, p.code, p.photo_thumb_path, p.photo_bucket, ct.name as categoria
      from app.players p
      join app.player_enrollments pe on pe.player_id = p.id and pe.organization_id = p_organization_id and pe.status = 'active'
      join app.categories ct on ct.id = pe.category_id
      where p.organization_id = p_organization_id and p.status = 'active' and p.archived_at is null
        and (p_category is null or lower(ct.name) = lower(p_category))
        and exists (select 1 from pm where lower(pm.category) = lower(ct.name))
    ),
    fila as (
      select pl.id, trim(concat_ws(' ', pl.first_name, pl.last_name)) as nombre, pl.code, pl.categoria,
             pl.photo_thumb_path, coalesce(pl.photo_bucket, 'tanneros-private') as bucket,
             (select count(*) from pm where lower(pm.category) = lower(pl.categoria)) as partidos_cat,
             coalesce(po.convocado, 0) convocado, coalesce(po.jugo, 0) jugo, coalesce(po.medio, 0) medio,
             coalesce(po.no_llego, 0) no_llego, coalesce(po.goles, 0) goles, coalesce(po.asist, 0) asist,
             coalesce(po.am, 0) am, coalesce(po.ro, 0) ro
      from plantel pl left join por po on po.player_id = pl.id
    )
    select jsonb_build_object(
      'from', p_from, 'to', p_to, 'category', p_category,
      'record', (select jsonb_build_object(
          'played', count(*),
          'won', count(*) filter (where goals_for > goals_against),
          'drawn', count(*) filter (where goals_for = goals_against),
          'lost', count(*) filter (where goals_for < goals_against),
          'goalsFor', coalesce(sum(goals_for), 0), 'goalsAgainst', coalesce(sum(goals_against), 0)) from pm),
      'byCategory', coalesce((select jsonb_agg(jsonb_build_object('category', category, 'played', n, 'won', w, 'drawn', d, 'lost', l, 'goalsFor', gf, 'goalsAgainst', ga) order by category)
          from (select category, count(*) n, count(*) filter (where goals_for > goals_against) w,
                       count(*) filter (where goals_for = goals_against) d, count(*) filter (where goals_for < goals_against) l,
                       sum(goals_for) gf, sum(goals_against) ga from pm group by category) q), '[]'::jsonb),
      'matches', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'date', match_date, 'category', category, 'opponent', opponent,
          'tournament', tournament, 'goalsFor', goals_for, 'goalsAgainst', goals_against) order by match_date desc) from pm), '[]'::jsonb),
      'players', coalesce((select jsonb_agg(jsonb_build_object('playerId', id, 'name', nombre, 'code', code, 'categoryName', categoria,
          'thumb', photo_thumb_path, 'bucket', bucket, 'categoryMatches', partidos_cat, 'called', convocado, 'played', jugo,
          'half', medio, 'noShow', no_llego, 'goals', goles, 'assists', asist, 'yellow', am, 'red', ro)) from fila), '[]'::jsonb)
    )
  );
end $$;

-- === Envolturas públicas ===
create or replace function public.v2_match_board(organization_id uuid)
returns jsonb language sql security definer set search_path = ''
as $$ select private.query_match_board(organization_id) $$;
create or replace function public.v2_match_sheet(organization_id uuid, match_id uuid)
returns jsonb language sql security definer set search_path = ''
as $$ select private.query_match_sheet(organization_id, match_id) $$;
create or replace function public.v2_save_match_sheet(organization_id uuid, sheet jsonb)
returns uuid language sql security definer set search_path = ''
as $$ select private.command_save_match_sheet(organization_id, sheet) $$;
create or replace function public.v2_match_stats(organization_id uuid, from_date date, to_date date, category text default null)
returns jsonb language sql security definer set search_path = ''
as $$ select private.query_match_stats(organization_id, from_date, to_date, category) $$;

revoke all on function public.v2_match_board(uuid) from public, anon;
revoke all on function public.v2_match_sheet(uuid, uuid) from public, anon;
revoke all on function public.v2_save_match_sheet(uuid, jsonb) from public, anon;
revoke all on function public.v2_match_stats(uuid, date, date, text) from public, anon;
grant execute on function public.v2_match_board(uuid) to authenticated;
grant execute on function public.v2_match_sheet(uuid, uuid) to authenticated;
grant execute on function public.v2_save_match_sheet(uuid, jsonb) to authenticated;
grant execute on function public.v2_match_stats(uuid, date, date, text) to authenticated;
revoke all on function private.puede_capturar_partidos(uuid) from public, anon;
revoke all on function private.puede_ver_partidos(uuid) from public, anon;
revoke all on function private.query_match_board(uuid) from public, anon;
revoke all on function private.query_match_sheet(uuid, uuid) from public, anon;
revoke all on function private.command_save_match_sheet(uuid, jsonb) from public, anon;
revoke all on function private.query_match_stats(uuid, date, date, text) from public, anon;