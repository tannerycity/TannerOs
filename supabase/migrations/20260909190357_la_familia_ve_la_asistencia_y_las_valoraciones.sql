-- La familia no tenia forma de ver como va su hijo: 429 asistencias y 13
-- valoraciones vivian solo del lado del staff. Esto las abre para el tutor,
-- de solo lectura y unicamente de SUS hijos.
--
-- No se manda quien capturo la asistencia ni el user_id del profe: a la familia
-- le sirve el nombre del evaluador, no la identidad interna del sistema.
create or replace function private.portal_progress(p_player_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare v jsonb;
begin
  if not private.portal_owns_player(p_player_id) then raise exception 'Not authorized'; end if;

  select jsonb_build_object(
    'attendance', jsonb_build_object(
      'present', coalesce(count(*) filter (where ar.status='present'),0),
      'absent',  coalesce(count(*) filter (where ar.status='absent'),0),
      'total',   coalesce(count(*),0),
      'percent', case when count(*)>0
                   then round(100.0*count(*) filter (where ar.status='present')/count(*))
                   else null end),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', s.starts_at, 'status', r.status,
        'title', coalesce(nullif(s.title,''), initcap(replace(s.session_type,'_',' '))))
        order by s.starts_at desc)
      from (select ar2.session_id, ar2.status from app.attendance_records ar2
            where ar2.player_id = p_player_id
            order by ar2.recorded_at desc limit 10) r
      join app.sessions s on s.id = r.session_id), '[]'::jsonb),
    'evaluations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', e.evaluated_on, 'by', e.evaluator_label, 'scores', e.scores,
        'sports_objective', e.sports_objective,
        'formative_objective', e.formative_objective,
        'notes', e.notes)
        order by e.evaluated_on desc)
      from app.player_evaluations e
      where e.player_id = p_player_id and e.archived_at is null), '[]'::jsonb)
  ) into v
  from app.attendance_records ar where ar.player_id = p_player_id;

  return v;
end $function$;

create or replace function public.v2_portal_progress(player_id uuid)
returns jsonb
language sql
security invoker
set search_path to 'pg_catalog','private'
as $function$
  select private.portal_progress(player_id);
$function$;

revoke all on function private.portal_progress(uuid) from public, anon, authenticated;
grant execute on function public.v2_portal_progress(uuid) to authenticated;;
