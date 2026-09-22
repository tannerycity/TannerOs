-- Las evaluaciones eran genéricas del club: no se podía saber en qué academia se
-- hizo una, ni usar criterios propios. Los criterios de porteros ya estaban cargados
-- en academies.evaluation_model desde la importación y nunca se usaron.
--
-- academy_id va como columna nueva y nullable: las evaluaciones del club (sin
-- academia) siguen funcionando exactamente igual.
alter table app.player_evaluations add column if not exists academy_id uuid references app.academies(id);
alter table app.player_evaluations add column if not exists evaluator_user_id uuid;
create index if not exists ix_evaluaciones_por_academia
  on app.player_evaluations(organization_id, academy_id, player_id, evaluated_on desc);


-- Los criterios de una academia. Si no tiene modelo propio, se usan los del club
-- para no dejar al profesor sin nada que evaluar.
create or replace function private.academy_evaluation_axes(p_organization_id uuid, p_academy_id uuid)
returns jsonb
language sql stable security definer
set search_path to 'pg_catalog','app','private'
as $function$
  select coalesce(
    (select a.evaluation_model->'axes' from app.academies a
      where a.id=p_academy_id and a.organization_id=p_organization_id
        and jsonb_typeof(a.evaluation_model->'axes')='array'
        and jsonb_array_length(a.evaluation_model->'axes')>0),
    '[["tecnica","Técnica"],["inteligencia","Inteligencia de juego"],["intensidad","Intensidad"],["mentalidad","Mentalidad"],["valores","Valores"]]'::jsonb)
$function$;
revoke all on function private.academy_evaluation_axes(uuid,uuid) from public, anon, authenticated;


-- Guardar una evaluación de academia. Queda ligada a academia + jugador + profesor
-- + fecha, que es lo que permite auditarla después.
create or replace function private.command_save_academy_evaluation(
  p_organization_id uuid, p_academy_id uuid, p_player_id uuid,
  p_evaluation_id uuid default null,
  p_evaluated_on date default null,
  p_scores jsonb default '{}'::jsonb,
  p_sports_objective text default null,
  p_formative_objective text default null,
  p_notes text default null
) returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare
  v_id uuid; v_fecha date := coalesce(p_evaluated_on, current_date);
  v_axes jsonb; v_clave text; v_valor numeric; v_limpio jsonb := '{}'::jsonb;
  v_actor text; v_permitidas text[];
begin
  if not private.has_module_access(p_organization_id,'academias',false) then raise exception 'Not authorized'; end if;
  if not private.can_see_academy(p_organization_id,p_academy_id) then raise exception 'Not authorized'; end if;

  -- Solo se evalúa a quien está inscrito en esa academia: si no, la evaluación
  -- quedaría colgada de una academia a la que el niño nunca fue.
  if not exists(select 1 from app.academy_enrollments e
                where e.organization_id=p_organization_id and e.academy_id=p_academy_id
                  and e.player_id=p_player_id and e.status='active') then
    raise exception 'Ese Tanner no está inscrito en esta academia';
  end if;
  if v_fecha > current_date then raise exception 'No se puede evaluar con una fecha futura'; end if;

  -- Solo se guardan los criterios de ESTA academia: así una evaluación de porteros
  -- no termina con notas de delanteros por un copy-paste del frontend.
  v_axes := private.academy_evaluation_axes(p_organization_id,p_academy_id);
  select array_agg(ax->>0) into v_permitidas from jsonb_array_elements(v_axes) ax;
  for v_clave in select jsonb_object_keys(coalesce(p_scores,'{}'::jsonb))
  loop
    if not (v_clave = any(v_permitidas)) then
      raise exception 'El criterio "%" no pertenece a esta academia', v_clave;
    end if;
    begin v_valor := (p_scores->>v_clave)::numeric;
    exception when others then raise exception 'La calificación de "%" tiene que ser un número', v_clave; end;
    if v_valor is not null and (v_valor < 0 or v_valor > 10) then
      raise exception 'Las calificaciones van de 0 a 10';
    end if;
    if v_valor is not null then v_limpio := v_limpio || jsonb_build_object(v_clave, v_valor); end if;
  end loop;

  v_actor := coalesce(private.current_actor_label(p_organization_id),'Staff');

  if p_evaluation_id is null then
    insert into app.player_evaluations(organization_id,player_id,academy_id,period,evaluated_on,
      evaluator_label,evaluator_user_id,scores,sports_objective,formative_objective,notes)
    values(p_organization_id,p_player_id,p_academy_id,to_char(v_fecha,'YYYY-MM'),v_fecha,
      v_actor,auth.uid(),v_limpio,nullif(trim(p_sports_objective),''),
      nullif(trim(p_formative_objective),''),nullif(trim(p_notes),''))
    returning id into v_id;
  else
    update app.player_evaluations set
      evaluated_on=v_fecha, period=to_char(v_fecha,'YYYY-MM'), scores=v_limpio,
      sports_objective=nullif(trim(p_sports_objective),''),
      formative_objective=nullif(trim(p_formative_objective),''),
      notes=nullif(trim(p_notes),''),
      evaluator_label=v_actor, evaluator_user_id=auth.uid(), updated_at=now()
    where id=p_evaluation_id and organization_id=p_organization_id
      and academy_id=p_academy_id and player_id=p_player_id
    returning id into v_id;
    if v_id is null then raise exception 'Esa evaluación no existe en esta academia'; end if;
  end if;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,
    case when p_evaluation_id is null then 'AcademyEvaluationCreated' else 'AcademyEvaluationUpdated' end,
    'player_evaluation',v_id,
    jsonb_build_object('academyId',p_academy_id,'playerId',p_player_id,'on',v_fecha,'scores',v_limpio),
    coalesce(auth.uid()::text,'system'));

  return jsonb_build_object('id',v_id,'evaluatedOn',v_fecha,'scores',v_limpio,'evaluator',v_actor);
end $function$;
revoke all on function private.command_save_academy_evaluation(uuid,uuid,uuid,uuid,date,jsonb,text,text,text) from public, anon, authenticated;

create or replace function public.v2_save_academy_evaluation(
  organization_id uuid, academy_id uuid, player_id uuid,
  evaluation_id uuid default null, evaluated_on date default null,
  scores jsonb default '{}'::jsonb, sports_objective text default null,
  formative_objective text default null, notes text default null
) returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $function$ select private.command_save_academy_evaluation(organization_id,academy_id,player_id,evaluation_id,evaluated_on,scores,sports_objective,formative_objective,notes) $function$;
revoke all on function public.v2_save_academy_evaluation(uuid,uuid,uuid,uuid,date,jsonb,text,text,text) from public, anon;
grant execute on function public.v2_save_academy_evaluation(uuid,uuid,uuid,uuid,date,jsonb,text,text,text) to authenticated;;
