create unique index if not exists uq_app_matches_id_org on app.matches(id,organization_id);
insert into public.modules(code,name,category,description,is_core,active,sort_order)
values('callups','Convocatoria','sport','Selección de Tanners convocados por partido',false,true,12)
on conflict(code) do update set name=excluded.name,category=excluded.category,description=excluded.description,active=true,sort_order=excluded.sort_order,updated_at=now();
insert into public.plan_modules(plan_id,module_code,enabled)
select p.id,'callups',true from public.plans p where p.code='internal_full'
on conflict(plan_id,module_code) do update set enabled=true;
insert into public.role_module_permissions(organization_id,role,module_code,can_read,can_write)
select o.id,r.role,'callups',true,true from public.organizations o cross join (values('Presidencia'),('Operaciones'),('Formadores')) r(role) where o.slug='tannery-city-fc'
on conflict(organization_id,role,module_code) do update set can_read=true,can_write=true,updated_at=now();

create table if not exists app.match_callups(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  match_id uuid not null,
  player_id uuid not null,
  selected boolean not null default true,
  notes text,
  updated_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,match_id,player_id),
  foreign key(match_id,organization_id) references app.matches(id,organization_id) on delete cascade,
  foreign key(player_id,organization_id) references app.players(id,organization_id) on delete restrict
);
alter table app.match_callups enable row level security;
drop policy if exists match_callups_select on app.match_callups;
create policy match_callups_select on app.match_callups for select to authenticated using(private.has_module_access(organization_id,'callups',false));
revoke insert,update,delete on app.match_callups from authenticated;
grant select on app.match_callups to authenticated;

create or replace function private.query_callup_roster(p_organization_id uuid,p_match_id uuid)
returns jsonb language plpgsql stable security definer set search_path='pg_catalog','app','private' as $$
declare v_match app.matches%rowtype; v_data jsonb;
begin
  if not private.has_module_access(p_organization_id,'callups',false) then raise exception 'Not authorized'; end if;
  select * into v_match from app.matches where id=p_match_id and organization_id=p_organization_id and archived_at is null;
  if not found then raise exception 'Match not found'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'playerId',p.id,'code',p.code,'name',trim(concat_ws(' ',p.first_name,p.last_name)),'category',p.category,'position',p.position,'jerseyNumber',p.jersey_number,
    'selected',coalesce(c.selected,false),'notes',c.notes,'updatedAt',c.updated_at
  ) order by p.jersey_number nulls last,p.first_name,p.last_name),'[]'::jsonb) into v_data
  from app.players p left join app.match_callups c on c.organization_id=p.organization_id and c.match_id=v_match.id and c.player_id=p.id
  where p.organization_id=p_organization_id and p.archived_at is null and p.status='active' and (v_match.category is null or trim(v_match.category)='' or lower(trim(coalesce(p.category,'')))=lower(trim(v_match.category)));
  return jsonb_build_object('match',jsonb_build_object('id',v_match.id,'date',v_match.match_date,'category',v_match.category,'opponent',v_match.opponent,'tournament',v_match.tournament,'phase',v_match.phase,'location',v_match.location,'status',v_match.status),'roster',v_data);
end $$;

create or replace function private.command_set_callup(p_organization_id uuid,p_match_id uuid,p_player_id uuid,p_selected boolean,p_notes text)
returns void language plpgsql security definer set search_path='pg_catalog','app','private' as $$
declare v_match app.matches%rowtype; v_player app.players%rowtype;
begin
  if not private.has_module_access(p_organization_id,'callups',true) then raise exception 'Not authorized'; end if;
  select * into v_match from app.matches where id=p_match_id and organization_id=p_organization_id and archived_at is null for update;
  if not found then raise exception 'Match not found'; end if;
  if v_match.status<>'scheduled' then raise exception 'Only scheduled matches can change callups'; end if;
  select * into v_player from app.players where id=p_player_id and organization_id=p_organization_id and archived_at is null and status='active';
  if not found then raise exception 'Player is not active'; end if;
  if v_match.category is not null and trim(v_match.category)<>'' and lower(trim(coalesce(v_player.category,'')))<>lower(trim(v_match.category)) then raise exception 'Player is outside match category'; end if;
  insert into app.match_callups(organization_id,match_id,player_id,selected,notes,updated_by_user_id,created_at,updated_at)
  values(p_organization_id,p_match_id,p_player_id,coalesce(p_selected,false),nullif(trim(coalesce(p_notes,'')),''),(select auth.uid()),now(),now())
  on conflict(organization_id,match_id,player_id) do update set selected=excluded.selected,notes=excluded.notes,updated_by_user_id=excluded.updated_by_user_id,updated_at=now();
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values(p_organization_id,'MatchCallupUpdated','match',p_match_id,jsonb_build_object('playerId',p_player_id,'selected',coalesce(p_selected,false),'notes',nullif(trim(coalesce(p_notes,'')),'')),(select auth.uid()));
end $$;

create or replace function public.v2_callup_roster(organization_id uuid,match_id uuid) returns jsonb language sql stable security definer set search_path='pg_catalog','private' as $$ select private.query_callup_roster(organization_id,match_id) $$;
create or replace function public.v2_set_callup(organization_id uuid,match_id uuid,player_id uuid,selected boolean,notes text) returns void language sql security definer set search_path='pg_catalog','private' as $$ select private.command_set_callup(organization_id,match_id,player_id,selected,notes) $$;
do $$ declare r record; begin for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('v2_callup_roster','v2_set_callup') loop execute format('revoke all on function %s from public, anon',r.sig); execute format('grant execute on function %s to authenticated',r.sig); end loop; end $$;;
