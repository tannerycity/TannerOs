
CREATE OR REPLACE FUNCTION private.query_calendar(p_organization_id uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'app', 'private'
AS $function$
declare v_tz text; v_data jsonb;
begin
  if not private.has_module_access(p_organization_id,'calendar',false) then raise exception 'Not authorized'; end if;
  select timezone into v_tz from public.organizations where id=p_organization_id;
  v_tz:=coalesce(v_tz,'America/Mexico_City');
  with items as (
    select s.starts_at as sort_at,jsonb_build_object('source','session','sourceId',s.id,'title',coalesce(s.title,'Entrenamiento'),'startsAt',s.starts_at,'endsAt',s.ends_at,'allDay',false,'kind',s.session_type,'location',s.location,'status',s.status,'detail',coalesce(c.name,a.name)) item
    from app.sessions s left join app.categories c on c.id=s.category_id and c.organization_id=s.organization_id left join app.academies a on a.id=s.academy_id and a.organization_id=s.organization_id
    where s.organization_id=p_organization_id and s.starts_at>=p_from and s.starts_at<p_to
    union all
    select make_timestamptz(extract(year from m.match_date)::int,extract(month from m.match_date)::int,extract(day from m.match_date)::int,12,0,0,v_tz),jsonb_build_object('source','match','sourceId',m.id,'title',concat_ws(' · ',nullif(m.category,''),case when nullif(m.opponent,'') is not null then 'vs '||m.opponent end),'startsAt',make_timestamptz(extract(year from m.match_date)::int,extract(month from m.match_date)::int,extract(day from m.match_date)::int,12,0,0,v_tz),'endsAt',null,'allDay',true,'kind','match','location',m.location,'status',m.status,'detail',concat_ws(' · ',m.tournament,m.phase,m.result))
    from app.matches m where m.organization_id=p_organization_id and m.match_date is not null and m.archived_at is null and m.match_date >= (p_from at time zone v_tz)::date and m.match_date < (p_to at time zone v_tz)::date
    union all
    select make_timestamptz(extract(year from p.starts_on)::int,extract(month from p.starts_on)::int,extract(day from p.starts_on)::int,12,0,0,v_tz),jsonb_build_object('source','program','sourceId',p.id,'title',p.name,'startsAt',make_timestamptz(extract(year from p.starts_on)::int,extract(month from p.starts_on)::int,extract(day from p.starts_on)::int,12,0,0,v_tz),'endsAt',case when p.ends_on is null then null else make_timestamptz(extract(year from p.ends_on)::int,extract(month from p.ends_on)::int,extract(day from p.ends_on)::int,12,0,0,v_tz) end,'allDay',true,'kind',p.program_type,'location',p.location,'status',p.status,'detail',p.category_label)
    from app.programs p where p.organization_id=p_organization_id and p.starts_on is not null and p.archived_at is null and p.starts_on >= (p_from at time zone v_tz)::date and p.starts_on < (p_to at time zone v_tz)::date
    union all
    select e.starts_at,jsonb_build_object('source','event','sourceId',e.id,'title',e.title,'startsAt',e.starts_at,'endsAt',null,'allDay',false,'kind',coalesce(e.event_type,'event'),'location',e.location,'status',coalesce(e.status,'scheduled'),'detail',concat_ws(' · ',e.rival,e.jersey,e.notes))
    from app.club_events e where e.organization_id=p_organization_id and e.archived_at is null and e.starts_at is not null and e.starts_at>=p_from and e.starts_at<p_to
    union all
    select b.bday as sort_at,jsonb_build_object('source','birthday','sourceId',pl.id,'title',trim(concat_ws(' ',pl.first_name,pl.last_name)),'startsAt',b.bday,'endsAt',null,'allDay',true,'kind','birthday','location',null,'status','scheduled','detail','Cumple '||(y.yr - extract(year from pl.birth_date)::int)::text)
    from app.players pl
    cross join lateral (select generate_series(extract(year from (p_from at time zone v_tz))::int, extract(year from (p_to at time zone v_tz))::int) as yr) y
    cross join lateral (select extract(month from pl.birth_date)::int as bm, least(extract(day from pl.birth_date)::int, extract(day from (make_date(y.yr, extract(month from pl.birth_date)::int, 1) + interval '1 month - 1 day'))::int) as bd) mm
    cross join lateral (select make_timestamptz(y.yr, mm.bm, mm.bd, 12,0,0, v_tz) as bday) b
    where pl.organization_id=p_organization_id and pl.birth_date is not null and pl.archived_at is null and pl.status='active' and b.bday>=p_from and b.bday<p_to
  )
  select coalesce(jsonb_agg(item order by sort_at),'[]'::jsonb) into v_data from items;
  return v_data;
end $function$
;
