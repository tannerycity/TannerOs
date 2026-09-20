create table if not exists app.player_document_status(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  player_id uuid not null,
  document_type text not null check(document_type in ('birth_certificate','curp','studies')),
  received boolean not null default false,
  received_at timestamptz,
  received_by_user_id uuid,
  notes text,
  legacy_value boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,player_id,document_type),
  foreign key(player_id,organization_id) references app.players(id,organization_id) on delete cascade
);
alter table app.player_document_status enable row level security;
create policy player_document_status_select on app.player_document_status for select to authenticated using(private.has_module_access(organization_id,'players',false));
revoke insert,update,delete on app.player_document_status from authenticated;
grant select on app.player_document_status to authenticated;

insert into app.player_document_status(organization_id,player_id,document_type,received,received_at,legacy_value)
select p.organization_id,p.id,d.document_type,d.received,case when d.received then coalesce(lp.legacy_updated_at,lp.updated_at,now()) else null end,d.received
from app.players p join public.players lp on lp.id=p.legacy_id and lp.organization_id=p.organization_id
cross join lateral (values
 ('birth_certificate'::text,coalesce(lp.doc_acta,false)),('curp'::text,coalesce(lp.doc_curp,false)),('studies'::text,coalesce(lp.doc_studies,false))
) d(document_type,received)
where p.archived_at is null
on conflict(organization_id,player_id,document_type) do nothing;

create or replace function private.query_player_documents(p_organization_id uuid,p_player_id uuid)
returns jsonb language plpgsql stable security definer set search_path='pg_catalog','app','private' as $$
declare v_data jsonb;
begin
  if not private.has_module_access(p_organization_id,'players',false) then raise exception 'Not authorized'; end if;
  if not exists(select 1 from app.players where id=p_player_id and organization_id=p_organization_id and archived_at is null) then raise exception 'Player not found'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'type',d.document_type,'received',d.received,'receivedAt',d.received_at,'notes',d.notes) order by case d.document_type when 'birth_certificate' then 1 when 'curp' then 2 else 3 end),'[]'::jsonb) into v_data
  from app.player_document_status d where d.organization_id=p_organization_id and d.player_id=p_player_id;
  return v_data;
end $$;

create or replace function private.command_set_player_document(p_organization_id uuid,p_player_id uuid,p_document_type text,p_received boolean,p_notes text)
returns jsonb language plpgsql security definer set search_path='pg_catalog','app','private' as $$
declare v_id uuid;
begin
  if not private.has_module_access(p_organization_id,'players',true) then raise exception 'Not authorized'; end if;
  if p_document_type not in ('birth_certificate','curp','studies') then raise exception 'Invalid document type'; end if;
  if not exists(select 1 from app.players where id=p_player_id and organization_id=p_organization_id and archived_at is null) then raise exception 'Player not found'; end if;
  insert into app.player_document_status(organization_id,player_id,document_type,received,received_at,received_by_user_id,notes,legacy_value,created_at,updated_at)
  values(p_organization_id,p_player_id,p_document_type,coalesce(p_received,false),case when coalesce(p_received,false) then now() else null end,case when coalesce(p_received,false) then (select auth.uid()) else null end,nullif(trim(coalesce(p_notes,'')),''),null,now(),now())
  on conflict(organization_id,player_id,document_type) do update set received=excluded.received,received_at=case when excluded.received then coalesce(app.player_document_status.received_at,now()) else null end,received_by_user_id=case when excluded.received then (select auth.uid()) else null end,notes=excluded.notes,updated_at=now()
  returning id into v_id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values(p_organization_id,'PlayerDocumentStatusUpdated','player_document',v_id,jsonb_build_object('playerId',p_player_id,'documentType',p_document_type,'received',coalesce(p_received,false)),(select auth.uid()));
  return private.query_player_documents(p_organization_id,p_player_id);
end $$;
create or replace function public.v2_player_documents(organization_id uuid,player_id uuid) returns jsonb language sql stable security definer set search_path='pg_catalog','private' as $$ select private.query_player_documents(organization_id,player_id) $$;
create or replace function public.v2_set_player_document(organization_id uuid,player_id uuid,document_type text,received boolean,notes text) returns jsonb language sql security definer set search_path='pg_catalog','private' as $$ select private.command_set_player_document(organization_id,player_id,document_type,received,notes) $$;
do $$ declare r record; begin for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('v2_player_documents','v2_set_player_document') loop execute format('revoke all on function %s from public, anon',r.sig); execute format('grant execute on function %s to authenticated',r.sig); end loop; end $$;;
