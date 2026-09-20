create unique index if not exists app_match_stats_org_match_player_uidx on app.match_player_stats(organization_id,match_id,player_id) where player_id is not null;
alter table app.match_player_stats drop constraint if exists match_player_stats_nonnegative_check;
alter table app.match_player_stats add constraint match_player_stats_nonnegative_check check (
  coalesce(minutes_played,0)>=0 and coalesce(goals,0)>=0 and coalesce(assists,0)>=0 and coalesce(yellow_cards,0)>=0 and coalesce(red_cards,0)>=0 and coalesce(saves,0)>=0
);

create or replace function private.current_actor_label(p_organization_id uuid)
returns text language sql stable security definer set search_path='pg_catalog','public' as $$
  select coalesce((select p.display_name from public.profiles p where p.user_id=(select auth.uid())),
                  (select m.role from public.organization_memberships m where m.organization_id=p_organization_id and m.user_id=(select auth.uid()) and m.active limit 1),
                  'Usuario')
$$;

create or replace function private.command_upsert_match(p_organization_id uuid,p_match_id uuid,p_match_date date,p_category text,p_opponent text,p_tournament text,p_phase text,p_location text,p_result text,p_goals_for integer,p_goals_against integer,p_status text,p_notes text)
returns uuid language plpgsql security definer set search_path='pg_catalog','app','private' as $$
declare v_id uuid;
begin
  if not private.has_module_access(p_organization_id,'calendar',true) then raise exception 'Not authorized'; end if;
  if p_match_date is null then raise exception 'Match date required'; end if;
  if coalesce(length(trim(p_opponent)),0)<2 then raise exception 'Opponent required'; end if;
  if coalesce(p_status,'scheduled') not in ('scheduled','completed','cancelled','archived') then raise exception 'Invalid match status'; end if;
  if coalesce(p_goals_for,0)<0 or coalesce(p_goals_against,0)<0 then raise exception 'Goals cannot be negative'; end if;
  if p_match_id is null then
    insert into app.matches(organization_id,match_date,category,opponent,tournament,phase,location,result,goals_for,goals_against,notes,status,metadata,created_at,updated_at)
    values(p_organization_id,p_match_date,nullif(trim(coalesce(p_category,'')),''),trim(p_opponent),nullif(trim(coalesce(p_tournament,'')),''),nullif(trim(coalesce(p_phase,'')),''),nullif(trim(coalesce(p_location,'')),''),nullif(trim(coalesce(p_result,'')),''),p_goals_for,p_goals_against,nullif(trim(coalesce(p_notes,'')),''),coalesce(p_status,'scheduled'),'{}'::jsonb,now(),now()) returning id into v_id;
  else
    update app.matches set match_date=p_match_date,category=nullif(trim(coalesce(p_category,'')),''),opponent=trim(p_opponent),tournament=nullif(trim(coalesce(p_tournament,'')),''),phase=nullif(trim(coalesce(p_phase,'')),''),location=nullif(trim(coalesce(p_location,'')),''),result=nullif(trim(coalesce(p_result,'')),''),goals_for=p_goals_for,goals_against=p_goals_against,notes=nullif(trim(coalesce(p_notes,'')),''),status=coalesce(p_status,'scheduled'),updated_at=now()
    where id=p_match_id and organization_id=p_organization_id and archived_at is null returning id into v_id;
    if v_id is null then raise exception 'Match not found'; end if;
  end if;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values(p_organization_id,case when p_match_id is null then 'MatchCreated' else 'MatchUpdated' end,'match',v_id,jsonb_build_object('date',p_match_date,'opponent',trim(p_opponent),'status',coalesce(p_status,'scheduled')),(select auth.uid()));
  return v_id;
end $$;

create or replace function private.command_upsert_match_stat(p_organization_id uuid,p_match_id uuid,p_player_id uuid,p_attended boolean,p_starter boolean,p_minutes integer,p_goals integer,p_assists integer,p_yellow integer,p_red integer,p_saves integer,p_clean_sheet boolean,p_notes text)
returns uuid language plpgsql security definer set search_path='pg_catalog','app','private' as $$
declare v_id uuid; v_name text; v_att boolean:=coalesce(p_attended,false); v_starter boolean:=coalesce(p_starter,false);
begin
  if not private.has_module_access(p_organization_id,'calendar',true) then raise exception 'Not authorized'; end if;
  if not exists(select 1 from app.matches where id=p_match_id and organization_id=p_organization_id and archived_at is null) then raise exception 'Match not found'; end if;
  select trim(concat_ws(' ',first_name,last_name)) into v_name from app.players where id=p_player_id and organization_id=p_organization_id and archived_at is null;
  if v_name is null then raise exception 'Player not found'; end if;
  if coalesce(p_minutes,0)<0 or coalesce(p_goals,0)<0 or coalesce(p_assists,0)<0 or coalesce(p_yellow,0)<0 or coalesce(p_red,0)<0 or coalesce(p_saves,0)<0 then raise exception 'Match stats cannot be negative'; end if;
  if not v_att and (coalesce(p_minutes,0)>0 or coalesce(p_goals,0)>0 or coalesce(p_assists,0)>0 or coalesce(p_yellow,0)>0 or coalesce(p_red,0)>0 or coalesce(p_saves,0)>0 or coalesce(p_clean_sheet,false) or v_starter) then raise exception 'Unattended player cannot have match performance'; end if;
  insert into app.match_player_stats(organization_id,match_id,player_id,player_name_snapshot,attended,starter,minutes_played,goals,assists,yellow_cards,red_cards,saves,clean_sheet,notes,metadata,created_at,updated_at)
  values(p_organization_id,p_match_id,p_player_id,v_name,v_att,case when v_att then v_starter else false end,case when v_att then coalesce(p_minutes,0) else 0 end,case when v_att then coalesce(p_goals,0) else 0 end,case when v_att then coalesce(p_assists,0) else 0 end,case when v_att then coalesce(p_yellow,0) else 0 end,case when v_att then coalesce(p_red,0) else 0 end,case when v_att then coalesce(p_saves,0) else 0 end,case when v_att then coalesce(p_clean_sheet,false) else false end,nullif(trim(coalesce(p_notes,'')),''),'{}'::jsonb,now(),now())
  on conflict(organization_id,match_id,player_id) where player_id is not null do update set player_name_snapshot=excluded.player_name_snapshot,attended=excluded.attended,starter=excluded.starter,minutes_played=excluded.minutes_played,goals=excluded.goals,assists=excluded.assists,yellow_cards=excluded.yellow_cards,red_cards=excluded.red_cards,saves=excluded.saves,clean_sheet=excluded.clean_sheet,notes=excluded.notes,updated_at=now()
  returning id into v_id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values(p_organization_id,'MatchPlayerStatsSaved','match_player_stat',v_id,jsonb_build_object('matchId',p_match_id,'playerId',p_player_id,'attended',v_att),(select auth.uid()));
  return v_id;
end $$;

create or replace function private.valid_eval_score(p_value jsonb)
returns boolean language sql immutable set search_path='' as $$
  select p_value is null or p_value='null'::jsonb or (jsonb_typeof(p_value)='number' and (p_value#>>'{}')::numeric between 0 and 10)
$$;

create or replace function private.command_upsert_player_evaluation(p_organization_id uuid,p_evaluation_id uuid,p_player_id uuid,p_period text,p_evaluated_on date,p_scores jsonb,p_sports_objective text,p_formative_objective text,p_notes text)
returns uuid language plpgsql security definer set search_path='pg_catalog','app','private' as $$
declare v_id uuid; k text; gk jsonb;
begin
  if not private.has_module_access(p_organization_id,'players',true) then raise exception 'Not authorized'; end if;
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
  if p_evaluation_id is null then
    insert into app.player_evaluations(organization_id,player_id,period,evaluated_on,evaluator_label,scores,sports_objective,formative_objective,notes,metadata,created_at,updated_at)
    values(p_organization_id,p_player_id,nullif(trim(coalesce(p_period,'')),''),p_evaluated_on,private.current_actor_label(p_organization_id),coalesce(p_scores,'{}'::jsonb),nullif(trim(coalesce(p_sports_objective,'')),''),nullif(trim(coalesce(p_formative_objective,'')),''),nullif(trim(coalesce(p_notes,'')),''),'{}'::jsonb,now(),now()) returning id into v_id;
  else
    update app.player_evaluations set player_id=p_player_id,period=nullif(trim(coalesce(p_period,'')),''),evaluated_on=p_evaluated_on,evaluator_label=private.current_actor_label(p_organization_id),scores=coalesce(p_scores,'{}'::jsonb),sports_objective=nullif(trim(coalesce(p_sports_objective,'')),''),formative_objective=nullif(trim(coalesce(p_formative_objective,'')),''),notes=nullif(trim(coalesce(p_notes,'')),''),updated_at=now()
    where id=p_evaluation_id and organization_id=p_organization_id and archived_at is null returning id into v_id;
    if v_id is null then raise exception 'Evaluation not found'; end if;
  end if;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values(p_organization_id,case when p_evaluation_id is null then 'PlayerEvaluationCreated' else 'PlayerEvaluationUpdated' end,'player_evaluation',v_id,jsonb_build_object('playerId',p_player_id,'evaluatedOn',p_evaluated_on),(select auth.uid()));
  return v_id;
end $$;

create or replace function private.command_upsert_player_note(p_organization_id uuid,p_note_id uuid,p_player_id uuid,p_note_date date,p_context text,p_note_text text)
returns uuid language plpgsql security definer set search_path='pg_catalog','app','private' as $$
declare v_id uuid;
begin
  if not private.has_module_access(p_organization_id,'players',true) then raise exception 'Not authorized'; end if;
  if not exists(select 1 from app.players where id=p_player_id and organization_id=p_organization_id and archived_at is null) then raise exception 'Player not found'; end if;
  if coalesce(length(trim(p_note_text)),0)<2 then raise exception 'Note text required'; end if;
  if p_note_id is null then
    insert into app.player_notes(organization_id,player_id,note_date,context,note_text,author_label,metadata,created_at,updated_at)
    values(p_organization_id,p_player_id,coalesce(p_note_date,current_date),nullif(trim(coalesce(p_context,'')),''),trim(p_note_text),private.current_actor_label(p_organization_id),'{}'::jsonb,now(),now()) returning id into v_id;
  else
    update app.player_notes set player_id=p_player_id,note_date=coalesce(p_note_date,current_date),context=nullif(trim(coalesce(p_context,'')),''),note_text=trim(p_note_text),author_label=private.current_actor_label(p_organization_id),updated_at=now()
    where id=p_note_id and organization_id=p_organization_id and archived_at is null returning id into v_id;
    if v_id is null then raise exception 'Note not found'; end if;
  end if;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values(p_organization_id,case when p_note_id is null then 'PlayerNoteCreated' else 'PlayerNoteUpdated' end,'player_note',v_id,jsonb_build_object('playerId',p_player_id,'noteDate',coalesce(p_note_date,current_date)),(select auth.uid()));
  return v_id;
end $$;

create or replace function private.query_matches(p_organization_id uuid,p_from date default null,p_to date default null)
returns jsonb language plpgsql stable security definer set search_path='pg_catalog','app','private' as $$
declare v_data jsonb;
begin
  if not private.has_module_access(p_organization_id,'calendar',false) then raise exception 'Not authorized'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'date',m.match_date,'category',m.category,'opponent',m.opponent,'tournament',m.tournament,'phase',m.phase,'location',m.location,'result',m.result,'goalsFor',m.goals_for,'goalsAgainst',m.goals_against,'status',m.status,'notes',m.notes,'statsCount',(select count(*) from app.match_player_stats s where s.organization_id=m.organization_id and s.match_id=m.id)) order by m.match_date desc nulls last,m.created_at desc),'[]'::jsonb) into v_data
  from app.matches m where m.organization_id=p_organization_id and m.archived_at is null and (p_from is null or m.match_date>=p_from) and (p_to is null or m.match_date<=p_to);
  return v_data;
end $$;

create or replace function private.query_player_sports(p_organization_id uuid,p_player_id uuid)
returns jsonb language plpgsql stable security definer set search_path='pg_catalog','app','private' as $$
declare v_summary jsonb; v_recent jsonb; v_eval jsonb; v_notes jsonb;
begin
  if not private.has_module_access(p_organization_id,'players',false) then raise exception 'Not authorized'; end if;
  if not exists(select 1 from app.players where id=p_player_id and organization_id=p_organization_id and archived_at is null) then raise exception 'Player not found'; end if;
  select jsonb_build_object('convened',count(*),'played',count(*) filter(where coalesce(attended,false)),'starts',count(*) filter(where coalesce(attended,false) and coalesce(starter,false)),'minutes',coalesce(sum(minutes_played) filter(where coalesce(attended,false)),0),'goals',coalesce(sum(goals),0),'assists',coalesce(sum(assists),0),'yellow',coalesce(sum(yellow_cards),0),'red',coalesce(sum(red_cards),0),'saves',coalesce(sum(saves),0),'cleanSheets',count(*) filter(where coalesce(clean_sheet,false))) into v_summary from app.match_player_stats where organization_id=p_organization_id and player_id=p_player_id;
  select coalesce(jsonb_agg(x order by (x->>'date') desc),'[]'::jsonb) into v_recent from (select jsonb_build_object('matchId',m.id,'date',m.match_date,'opponent',m.opponent,'phase',m.phase,'result',m.result,'attended',s.attended,'starter',s.starter,'minutes',s.minutes_played,'goals',s.goals,'assists',s.assists,'yellow',s.yellow_cards,'red',s.red_cards,'saves',s.saves,'cleanSheet',s.clean_sheet,'notes',s.notes) x from app.match_player_stats s join app.matches m on m.id=s.match_id and m.organization_id=s.organization_id where s.organization_id=p_organization_id and s.player_id=p_player_id order by m.match_date desc nulls last limit 20) q;
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'period',e.period,'date',e.evaluated_on,'evaluator',e.evaluator_label,'scores',e.scores,'sportsObjective',e.sports_objective,'formativeObjective',e.formative_objective,'notes',e.notes) order by e.evaluated_on desc nulls last,e.created_at desc),'[]'::jsonb) into v_eval from app.player_evaluations e where e.organization_id=p_organization_id and e.player_id=p_player_id and e.archived_at is null;
  select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'date',n.note_date,'context',n.context,'text',n.note_text,'author',n.author_label) order by n.note_date desc nulls last,n.created_at desc),'[]'::jsonb) into v_notes from app.player_notes n where n.organization_id=p_organization_id and n.player_id=p_player_id and n.archived_at is null;
  return jsonb_build_object('summary',coalesce(v_summary,'{}'::jsonb),'recentMatches',v_recent,'evaluations',v_eval,'notes',v_notes);
end $$;

create or replace function public.v2_matches(organization_id uuid,from_date date default null,to_date date default null) returns jsonb language sql stable security definer set search_path='pg_catalog','private' as $$ select private.query_matches(organization_id,from_date,to_date) $$;
create or replace function public.v2_player_sports(organization_id uuid,player_id uuid) returns jsonb language sql stable security definer set search_path='pg_catalog','private' as $$ select private.query_player_sports(organization_id,player_id) $$;
create or replace function public.v2_upsert_match(organization_id uuid,match_id uuid,match_date date,category text,opponent text,tournament text,phase text,location text,result text,goals_for integer,goals_against integer,status text,notes text) returns uuid language sql security definer set search_path='pg_catalog','private' as $$ select private.command_upsert_match(organization_id,match_id,match_date,category,opponent,tournament,phase,location,result,goals_for,goals_against,status,notes) $$;
create or replace function public.v2_upsert_match_stat(organization_id uuid,match_id uuid,player_id uuid,attended boolean,starter boolean,minutes integer,goals integer,assists integer,yellow integer,red integer,saves integer,clean_sheet boolean,notes text) returns uuid language sql security definer set search_path='pg_catalog','private' as $$ select private.command_upsert_match_stat(organization_id,match_id,player_id,attended,starter,minutes,goals,assists,yellow,red,saves,clean_sheet,notes) $$;
create or replace function public.v2_upsert_player_evaluation(organization_id uuid,evaluation_id uuid,player_id uuid,period text,evaluated_on date,scores jsonb,sports_objective text,formative_objective text,notes text) returns uuid language sql security definer set search_path='pg_catalog','private' as $$ select private.command_upsert_player_evaluation(organization_id,evaluation_id,player_id,period,evaluated_on,scores,sports_objective,formative_objective,notes) $$;
create or replace function public.v2_upsert_player_note(organization_id uuid,note_id uuid,player_id uuid,note_date date,context text,note_text text) returns uuid language sql security definer set search_path='pg_catalog','private' as $$ select private.command_upsert_player_note(organization_id,note_id,player_id,note_date,context,note_text) $$;

revoke all on function public.v2_matches(uuid,date,date) from public,anon;
revoke all on function public.v2_player_sports(uuid,uuid) from public,anon;
revoke all on function public.v2_upsert_match(uuid,uuid,date,text,text,text,text,text,text,integer,integer,text,text) from public,anon;
revoke all on function public.v2_upsert_match_stat(uuid,uuid,uuid,boolean,boolean,integer,integer,integer,integer,integer,integer,boolean,text) from public,anon;
revoke all on function public.v2_upsert_player_evaluation(uuid,uuid,uuid,text,date,jsonb,text,text,text) from public,anon;
revoke all on function public.v2_upsert_player_note(uuid,uuid,uuid,date,text,text) from public,anon;
grant execute on function public.v2_matches(uuid,date,date) to authenticated;
grant execute on function public.v2_player_sports(uuid,uuid) to authenticated;
grant execute on function public.v2_upsert_match(uuid,uuid,date,text,text,text,text,text,text,integer,integer,text,text) to authenticated;
grant execute on function public.v2_upsert_match_stat(uuid,uuid,uuid,boolean,boolean,integer,integer,integer,integer,integer,integer,boolean,text) to authenticated;
grant execute on function public.v2_upsert_player_evaluation(uuid,uuid,uuid,text,date,jsonb,text,text,text) to authenticated;
grant execute on function public.v2_upsert_player_note(uuid,uuid,uuid,date,text,text) to authenticated;;
