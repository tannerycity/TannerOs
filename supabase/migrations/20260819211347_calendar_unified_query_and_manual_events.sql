create or replace function private.query_calendar(p_organization_id uuid,p_from timestamptz,p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path='pg_catalog','public','app','private' as $$
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
  )
  select coalesce(jsonb_agg(item order by sort_at),'[]'::jsonb) into v_data from items;
  return v_data;
end $$;

create or replace function private.command_upsert_club_event(p_organization_id uuid,p_event_id uuid,p_title text,p_starts_at timestamptz,p_event_type text,p_location text,p_status text,p_rival text,p_jersey text,p_notes text)
returns uuid language plpgsql security definer set search_path='pg_catalog','app','private' as $$
declare v_id uuid;
begin
  if not private.has_module_access(p_organization_id,'calendar',true) then raise exception 'Not authorized'; end if;
  if coalesce(length(trim(p_title)),0)<2 then raise exception 'Event title required'; end if;
  if p_starts_at is null then raise exception 'Event date required'; end if;
  if coalesce(p_event_type,'event') not in ('event','meeting','activation','administrative','other') then raise exception 'Invalid event type'; end if;
  if coalesce(p_status,'scheduled') not in ('scheduled','completed','cancelled') then raise exception 'Invalid event status'; end if;
  if p_event_id is null then
    insert into app.club_events(organization_id,title,starts_at,event_type,location,status,rival,jersey,notes,metadata,created_at,updated_at)
    values(p_organization_id,trim(p_title),p_starts_at,coalesce(p_event_type,'event'),nullif(trim(coalesce(p_location,'')),''),coalesce(p_status,'scheduled'),nullif(trim(coalesce(p_rival,'')),''),nullif(trim(coalesce(p_jersey,'')),''),nullif(trim(coalesce(p_notes,'')),''),'{}'::jsonb,now(),now()) returning id into v_id;
  else
    update app.club_events set title=trim(p_title),starts_at=p_starts_at,event_type=coalesce(p_event_type,'event'),location=nullif(trim(coalesce(p_location,'')),''),status=coalesce(p_status,'scheduled'),rival=nullif(trim(coalesce(p_rival,'')),''),jersey=nullif(trim(coalesce(p_jersey,'')),''),notes=nullif(trim(coalesce(p_notes,'')),''),updated_at=now()
    where id=p_event_id and organization_id=p_organization_id and archived_at is null returning id into v_id;
    if v_id is null then raise exception 'Event not found'; end if;
  end if;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values(p_organization_id,case when p_event_id is null then 'ClubEventCreated' else 'ClubEventUpdated' end,'club_event',v_id,jsonb_build_object('status',coalesce(p_status,'scheduled'),'startsAt',p_starts_at),(select auth.uid()));
  return v_id;
end $$;

create or replace function public.v2_calendar(organization_id uuid,from_at timestamptz,to_at timestamptz) returns jsonb language sql stable security definer set search_path='pg_catalog','private' as $$ select private.query_calendar(organization_id,from_at,to_at) $$;
create or replace function public.v2_upsert_club_event(organization_id uuid,event_id uuid,title text,starts_at timestamptz,event_type text,location text,status text,rival text,jersey text,notes text) returns uuid language sql security definer set search_path='pg_catalog','private' as $$ select private.command_upsert_club_event(organization_id,event_id,title,starts_at,event_type,location,status,rival,jersey,notes) $$;
revoke all on function public.v2_calendar(uuid,timestamptz,timestamptz) from public,anon;
revoke all on function public.v2_upsert_club_event(uuid,uuid,text,timestamptz,text,text,text,text,text,text) from public,anon;
grant execute on function public.v2_calendar(uuid,timestamptz,timestamptz) to authenticated;
grant execute on function public.v2_upsert_club_event(uuid,uuid,text,timestamptz,text,text,text,text,text,text) to authenticated;;
