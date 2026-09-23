-- O1 · El profe califica, y la categoria tiene un responsable con nombre
--
-- LO QUE MIDIO LA BASE (23 sep 2026)
--   Mini Baby Tanner  16 Tanners ·  2 evaluados
--   Baby Tanner       19 Tanners ·  2 evaluados
--   T8                 6 Tanners ·  0 evaluados
--   T10               12 Tanners ·  1 evaluado
--   T12               10 Tanners ·  2 evaluados
--   -------------------------------------------
--   63 Tanners activos ·  8 evaluados alguna vez
--
-- Y quien firmo las 15 evaluaciones que existen: Michel (7), sin nombre (6),
-- Presidencia (2). O sea, TODAS las hizo la misma persona. Ningun profe ha
-- evaluado nunca, y no podria: evaluar exigia escritura en el modulo Jugadores
-- y Formadores lo tiene en solo lectura.
--
-- EL PERMISO NO ERA EL CUELLO DE BOTELLA, PERO SI ERA UN MURO
-- Con 55 de 63 Tanners sin evaluar, nadie se estaba peleando por evaluar. Aun
-- asi el muro hay que quitarlo, porque mientras exista la unica salida es que
-- Presidencia lo haga todo. Lo que mueve el numero no es el permiso: es que
-- cada categoria tenga un responsable con nombre y un contador que se vea.
--
-- EL MISMO TRATO QUE LA ASISTENCIA, A PROPOSITO
-- Asistencia ya decidio permitir que un profe cubra otra categoria y dejar
-- rastro (attendance_records.recorded_by_user_id, y la columna `covered` que la
-- pantalla muestra como "cubrio Fulano"). Evaluar sigue la misma regla. Dos
-- filosofias de permiso en la misma app hacen que la gente deje de confiar en
-- las dos: "¿aqui si puedo o no puedo?".
--
-- LA DIFERENCIA ENTRE ASISTENCIA Y EVALUACION, QUE SI SE RESPETA
-- Una asistencia es un hecho: vino o no vino, y lo ve cualquiera que este en la
-- cancha. Una evaluacion es un juicio que necesita haber visto al nino muchas
-- veces. Por eso el permiso es el mismo pero la autoria es mas fuerte: queda
-- quien evaluo Y si esa persona era o no el responsable de la categoria, y eso
-- se congela en el momento de guardar.

-- Congelado al guardar, no calculado despues. Si se calculara contra la
-- asignacion de hoy, mover a un profe de categoria reescribiria el pasado: las
-- evaluaciones que hizo como responsable pasarian a decir que cubrio.
alter table app.player_evaluations
  add column if not exists by_assigned_coach boolean;

comment on column app.player_evaluations.by_assigned_coach is
  'Si quien evaluo era el responsable de la categoria del Tanner EN ESE MOMENTO. Nulo en las evaluaciones anteriores a O1, que no lo registraron.';

-- ¿Soy el responsable de la categoria de este Tanner?
-- No es un candado: es la etiqueta que separa "me tocaba" de "estaba cubriendo".
create or replace function private.es_responsable_de(
  p_organization_id uuid,
  p_player_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
  select exists (
    select 1
    from app.player_enrollments pe
    join app.category_staff_assignments cs
      on cs.organization_id = pe.organization_id
     and cs.category_id = pe.category_id
    where pe.organization_id = p_organization_id
      and pe.player_id = p_player_id
      and pe.status = 'active'
      and cs.user_id = (select auth.uid())
  )
$function$;

-- Cuanto lleva cada categoria sin evaluar, y quien es el responsable.
--
-- La ventana se mide en MESES CONTRA LA FECHA DE LA EVALUACION, no contra un
-- trimestre fijo del calendario. Con trimestres, un profe que entra en febrero
-- llega tarde al primer corte sin haber hecho nada mal, y el sistema lo acusa
-- de algo que no es suyo. Con una ventana movil la pregunta es la que de verdad
-- importa en un club formativo: "¿cuanto hace que nadie ve a este nino?".
create or replace function private.query_evaluation_coverage(
  p_organization_id uuid,
  p_months integer default 4
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare v_out jsonb; v_corte date; v_meses integer;
begin
  if not private.has_module_access(p_organization_id,'players',false)
     and not private.has_module_access(p_organization_id,'attendance',false) then
    raise exception 'Not authorized';
  end if;

  v_meses := greatest(1, least(24, coalesce(p_months,4)));
  v_corte := (current_date - (v_meses || ' months')::interval)::date;

  select coalesce(jsonb_agg(x order by x->>'sortKey'),'[]'::jsonb) into v_out
  from (
    select jsonb_build_object(
      'categoryId', c.id,
      'categoryName', c.name,
      'sortKey', lpad(coalesce(c.sort_order,9999)::text,5,'0'),
      -- Puede haber mas de un profe por categoria, o ninguno. Los dos casos se
      -- dicen: una categoria sin responsable es el hallazgo, no un hueco que
      -- se tape con una raya.
      'responsables', coalesce((
        select jsonb_agg(pr.display_name order by pr.display_name)
        from app.category_staff_assignments cs
        join public.profiles pr on pr.user_id = cs.user_id and pr.active
        where cs.organization_id = c.organization_id and cs.category_id = c.id
      ), '[]'::jsonb),
      'players', t.total,
      'upToDate', t.al_dia,
      'overdue', t.total - t.al_dia,
      'neverEvaluated', t.nunca,
      'lastEvaluation', t.ultima,
      -- A quien le toca, por nombre. Una lista de nombres se trabaja; un
      -- numero solo se mira.
      'pending', t.pendientes
    ) x
    from app.categories c
    cross join lateral (
      select
        count(*)::int as total,
        count(*) filter (where u.ultima >= v_corte)::int as al_dia,
        count(*) filter (where u.ultima is null)::int as nunca,
        max(u.ultima) as ultima,
        coalesce(jsonb_agg(jsonb_build_object(
          'playerId', u.id,
          'name', u.nombre,
          'lastEvaluatedOn', u.ultima,
          'daysSince', case when u.ultima is null then null else (current_date - u.ultima) end
        ) order by u.ultima nulls first, u.nombre)
        filter (where u.ultima is null or u.ultima < v_corte), '[]'::jsonb) as pendientes
      from (
        select pl.id, trim(concat_ws(' ', pl.first_name, pl.last_name)) as nombre,
               (select max(e.evaluated_on) from app.player_evaluations e
                 where e.player_id = pl.id and e.archived_at is null) as ultima
        from app.players pl
        join app.player_enrollments pe
          on pe.player_id = pl.id and pe.organization_id = pl.organization_id and pe.status='active'
        where pe.category_id = c.id
          and pl.status = 'active' and pl.archived_at is null
      ) u
    ) t
    where c.organization_id = p_organization_id and c.status = 'active'
  ) z;

  return jsonb_build_object('months', v_meses, 'cutoff', v_corte, 'categories', v_out);
end
$function$;

-- Evaluar deja de colgar del modulo Jugadores.
--
-- Colgaba de 'players' CON ESCRITURA, que es el modulo entero: tutores,
-- documentos, fotos, dar de baja. Darle eso a un profe para que pueda calificar
-- es abrirle la casa para que entre a la cocina. Ahora cuelga de asistencia,
-- que es el permiso de quien de verdad entrena, y Presidencia/Operaciones
-- siguen entrando por Jugadores como siempre.
create or replace function private.command_upsert_player_evaluation(
  p_organization_id uuid, p_evaluation_id uuid, p_player_id uuid, p_period text,
  p_evaluated_on date, p_scores jsonb, p_sports_objective text,
  p_formative_objective text, p_notes text
)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare v_id uuid; k text; gk jsonb; v_responsable boolean; v_periodo text;
begin
  if not private.has_module_access(p_organization_id,'players',true)
     and not private.has_module_access(p_organization_id,'attendance',true) then
    raise exception 'Not authorized';
  end if;
  if not exists(select 1 from app.players where id=p_player_id and organization_id=p_organization_id and archived_at is null) then raise exception 'Player not found'; end if;
  if p_evaluated_on is null then raise exception 'Evaluation date required'; end if;
  if jsonb_typeof(coalesce(p_scores,'{}'::jsonb))<>'object' then raise exception 'Evaluation scores must be an object'; end if;
  foreach k in array array['tecnica','inteligencia','intensidad','mentalidad','valores'] loop
    if not private.valid_eval_score(p_scores->k) then raise exception 'Evaluation score out of range'; end if;
  end loop;
  gk:=coalesce(p_scores->'goalkeeper','{}'::jsonb);
  if jsonb_typeof(gk)<>'object' then raise exception 'Goalkeeper scores must be an object'; end if;
  foreach k in array array['manos','colocacion','aereo','pies','mando'] loop
    if not private.valid_eval_score(gk->k) then raise exception 'Goalkeeper score out of range'; end if;
  end loop;

  -- Se congela aqui, no se calcula despues: si el profe cambia de categoria
  -- manana, esta evaluacion no puede cambiar de historia.
  v_responsable := private.es_responsable_de(p_organization_id, p_player_id);

  -- El periodo deja de ser texto libre. Antes la pantalla mandaba "septiembre
  -- de 2026" y el otro modulo tenia una caja de texto: dos formas de escribir
  -- lo mismo y ninguna comparable. Ahora sale de la fecha, que es lo unico que
  -- el profe escoge.
  v_periodo := coalesce(nullif(trim(coalesce(p_period,'')),''), to_char(p_evaluated_on,'YYYY-MM'));

  if p_evaluation_id is null then
    insert into app.player_evaluations(organization_id,player_id,period,evaluated_on,evaluator_label,evaluator_user_id,by_assigned_coach,scores,sports_objective,formative_objective,notes,metadata,created_at,updated_at)
    values(p_organization_id,p_player_id,v_periodo,p_evaluated_on,private.current_actor_label(p_organization_id),(select auth.uid()),v_responsable,coalesce(p_scores,'{}'::jsonb),nullif(trim(coalesce(p_sports_objective,'')),''),nullif(trim(coalesce(p_formative_objective,'')),''),nullif(trim(coalesce(p_notes,'')),''),'{}'::jsonb,now(),now()) returning id into v_id;
  else
    update app.player_evaluations set player_id=p_player_id,period=v_periodo,evaluated_on=p_evaluated_on,evaluator_label=private.current_actor_label(p_organization_id),evaluator_user_id=(select auth.uid()),by_assigned_coach=v_responsable,scores=coalesce(p_scores,'{}'::jsonb),sports_objective=nullif(trim(coalesce(p_sports_objective,'')),''),formative_objective=nullif(trim(coalesce(p_formative_objective,'')),''),notes=nullif(trim(coalesce(p_notes,'')),''),updated_at=now()
    where id=p_evaluation_id and organization_id=p_organization_id and archived_at is null returning id into v_id;
    if v_id is null then raise exception 'Evaluation not found'; end if;
  end if;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values(p_organization_id,case when p_evaluation_id is null then 'PlayerEvaluationCreated' else 'PlayerEvaluationUpdated' end,'player_evaluation',v_id,jsonb_build_object('playerId',p_player_id,'evaluatedOn',p_evaluated_on,'byAssignedCoach',v_responsable),(select auth.uid()));
  return v_id;
end $function$;

create or replace function public.v2_evaluation_coverage(organization_id uuid, months integer default 4)
returns jsonb
language sql stable security definer set search_path to 'pg_catalog','private'
as $function$ select private.query_evaluation_coverage(organization_id, months) $function$;

-- Crear una funcion en private vuelve a conceder EXECUTE a PUBLIC. Cada vez.
revoke all on function private.es_responsable_de(uuid,uuid) from public, anon, authenticated;
revoke all on function private.query_evaluation_coverage(uuid,integer) from public, anon, authenticated;
revoke all on function private.command_upsert_player_evaluation(uuid,uuid,uuid,text,date,jsonb,text,text,text) from public, anon, authenticated;
revoke all on function public.v2_evaluation_coverage(uuid,integer) from public, anon;
grant execute on function public.v2_evaluation_coverage(uuid,integer) to authenticated;

do $$
declare v int; f text;
begin
  foreach f in array array['v2_evaluation_coverage','v2_upsert_player_evaluation'] loop
    select count(*) into v from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname=f;
    if v <> 1 then raise exception '% quedo % veces', f, v; end if;
  end loop;
  foreach f in array array['es_responsable_de','query_evaluation_coverage','command_upsert_player_evaluation'] loop
    select count(*) into v from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='private' and p.proname=f;
    if v <> 1 then raise exception '% quedo % veces', f, v; end if;
  end loop;
  select count(*) into v from information_schema.role_routine_grants
   where routine_schema='private'
     and routine_name in ('es_responsable_de','query_evaluation_coverage','command_upsert_player_evaluation')
     and grantee in ('PUBLIC','anon','authenticated');
  if v <> 0 then raise exception 'las funciones de O1 quedaron con % permisos sueltos', v; end if;
end $$;
