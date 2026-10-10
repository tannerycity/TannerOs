-- k3 · Eliminar un partido capturado por error (10/10/2026).
--
-- Presidencia: "no puedo eliminar cuando nos equivocamos". Se archiva, no se
-- borra: el partido desaparece de la lista y de las estadísticas (todas
-- filtran archived_at is null), pero queda el rastro en domain_events y se
-- puede recuperar si fue un error. Lo puede hacer quien captura partidos.
create or replace function private.command_archive_match(p_organization_id uuid, p_match_id uuid)
returns void language plpgsql security definer
set search_path to 'pg_catalog', 'app', 'private'
as $$
declare v_m app.matches%rowtype;
begin
  if not private.puede_capturar_partidos(p_organization_id) then raise exception 'Not authorized'; end if;
  select * into v_m from app.matches where id = p_match_id and organization_id = p_organization_id and archived_at is null for update;
  if not found then raise exception 'Match not found'; end if;
  update app.matches set archived_at = now(), updated_at = now() where id = p_match_id;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, 'MatchArchived', 'match', p_match_id,
          jsonb_build_object('date', v_m.match_date, 'category', v_m.category, 'opponent', v_m.opponent,
                             'status', v_m.status, 'goalsFor', v_m.goals_for, 'goalsAgainst', v_m.goals_against),
          (select auth.uid()));
end $$;

create or replace function public.v2_archive_match(organization_id uuid, match_id uuid)
returns void language sql security definer set search_path = ''
as $$ select private.command_archive_match(organization_id, match_id) $$;

revoke all on function public.v2_archive_match(uuid, uuid) from public, anon;
grant execute on function public.v2_archive_match(uuid, uuid) to authenticated;
revoke all on function private.command_archive_match(uuid, uuid) from public, anon;