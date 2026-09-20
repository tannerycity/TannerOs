-- Quien toma lista es quien se entera de que un niño ya no viene, pero Formadores y
-- Academia no tienen permiso de alta y baja: avisan por fuera y el Tanner se queda
-- en la plantilla. Esto les da una salida sin darles el poder de ejecutar la baja.
create table if not exists app.player_withdrawal_requests(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  player_id uuid not null references app.players(id) on delete cascade,
  reason text not null,
  status text not null default 'pending' check (status in ('pending','applied','dismissed')),
  requested_by_user_id uuid,
  requested_at timestamptz not null default now(),
  resolution_note text,
  resolved_by_user_id uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Una sola solicitud abierta por Tanner: reportar dos veces no debe hacer cola.
create unique index if not exists ux_withdrawal_request_pendiente
  on app.player_withdrawal_requests(organization_id,player_id) where status='pending';
create index if not exists ix_withdrawal_request_org_estado
  on app.player_withdrawal_requests(organization_id,status,requested_at desc);

alter table app.player_withdrawal_requests enable row level security;
revoke all on app.player_withdrawal_requests from anon, authenticated;

-- Levantar la solicitud: basta con poder tomar lista.
create or replace function private.command_request_player_withdrawal(
  p_organization_id uuid, p_player_id uuid, p_reason text)
returns uuid
language plpgsql security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare v_id uuid; v_status text;
begin
  if not private.has_module_access(p_organization_id,'attendance',true) then raise exception 'Not authorized'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'Withdrawal reason required'; end if;
  select status into v_status from app.players where id=p_player_id and organization_id=p_organization_id;
  if not found then raise exception 'Player not found'; end if;
  if v_status<>'active' then raise exception 'Player is not active'; end if;

  insert into app.player_withdrawal_requests(organization_id,player_id,reason,requested_by_user_id)
  values(p_organization_id,p_player_id,trim(p_reason),(select auth.uid()))
  on conflict(organization_id,player_id) where status='pending'
  do update set reason=excluded.reason,requested_by_user_id=excluded.requested_by_user_id,
                requested_at=now(),updated_at=now()
  returning id into v_id;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,'PlayerWithdrawalRequested','player',p_player_id,
         jsonb_build_object('requestId',v_id,'reason',trim(p_reason)),(select auth.uid())::text);
  return v_id;
end $function$;

-- Ver la cola: solo quien puede resolverla.
create or replace function private.query_withdrawal_requests(p_organization_id uuid)
returns table(request_id uuid, player_id uuid, player_name text, player_code text, category_name text,
              reason text, requested_at timestamptz, requested_by text)
language plpgsql stable security definer
set search_path to 'pg_catalog','app','public','private'
as $function$
begin
  if not private.has_module_access(p_organization_id,'jugadores_estado',false) then raise exception 'Not authorized'; end if;
  return query
  select r.id,p.id,trim(concat_ws(' ',p.first_name,p.last_name)),p.code,c.name,
         r.reason,r.requested_at,coalesce(pr.display_name,'Alguien del staff')
  from app.player_withdrawal_requests r
  join app.players p on p.id=r.player_id and p.organization_id=r.organization_id
  left join app.player_enrollments pe on pe.player_id=p.id and pe.status='active'
  left join app.categories c on c.id=pe.category_id
  left join public.profiles pr on pr.user_id=r.requested_by_user_id
  where r.organization_id=p_organization_id and r.status='pending' and p.status='active'
  order by r.requested_at;
end $function$;

-- Descartar sin dar de baja (el niño sí viene, fue un malentendido).
create or replace function private.command_dismiss_withdrawal_request(
  p_organization_id uuid, p_request_id uuid, p_note text)
returns void
language plpgsql security definer
set search_path to 'pg_catalog','app','private'
as $function$
begin
  if not private.has_module_access(p_organization_id,'jugadores_estado',true) then raise exception 'Not authorized'; end if;
  update app.player_withdrawal_requests
     set status='dismissed',resolution_note=nullif(trim(coalesce(p_note,'')),''),
         resolved_by_user_id=(select auth.uid()),resolved_at=now(),updated_at=now()
   where id=p_request_id and organization_id=p_organization_id and status='pending';
  if not found then raise exception 'Request not found'; end if;
end $function$;

-- Envoltorios públicos (el patrón del proyecto: SECURITY DEFINER aquí, private revocado).
create or replace function public.v2_request_player_withdrawal(organization_id uuid, player_id uuid, reason text)
returns uuid language sql security definer set search_path to 'pg_catalog','private'
as $function$ select private.command_request_player_withdrawal(organization_id,player_id,reason) $function$;

create or replace function public.v2_withdrawal_requests(organization_id uuid)
returns table(request_id uuid, player_id uuid, player_name text, player_code text, category_name text,
              reason text, requested_at timestamptz, requested_by text)
language sql security definer set search_path to 'pg_catalog','private'
as $function$ select * from private.query_withdrawal_requests(organization_id) $function$;

create or replace function public.v2_dismiss_withdrawal_request(organization_id uuid, request_id uuid, note text)
returns void language sql security definer set search_path to 'pg_catalog','private'
as $function$ select private.command_dismiss_withdrawal_request(organization_id,request_id,note) $function$;

revoke all on function private.command_request_player_withdrawal(uuid,uuid,text) from public, anon, authenticated;
revoke all on function private.query_withdrawal_requests(uuid) from public, anon, authenticated;
revoke all on function private.command_dismiss_withdrawal_request(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.v2_request_player_withdrawal(uuid,uuid,text) from public, anon;
revoke all on function public.v2_withdrawal_requests(uuid) from public, anon;
revoke all on function public.v2_dismiss_withdrawal_request(uuid,uuid,text) from public, anon;
grant execute on function public.v2_request_player_withdrawal(uuid,uuid,text) to authenticated;
grant execute on function public.v2_withdrawal_requests(uuid) to authenticated;
grant execute on function public.v2_dismiss_withdrawal_request(uuid,uuid,text) to authenticated;;
