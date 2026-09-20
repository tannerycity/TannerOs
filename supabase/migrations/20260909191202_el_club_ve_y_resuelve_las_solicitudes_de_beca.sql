-- Una solicitud que nadie ve no sirve de nada. Esto la pone en la ficha del
-- Tanner, junto a sus becas, que es donde Presidencia ya trabaja el tema.
--
-- Va detras de can_see_player_money: la beca es dinero, y el cuerpo tecnico no
-- tiene por que leer por que una familia pide apoyo.
create or replace function private.query_benefit_requests(p_organization_id uuid, p_player_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare v jsonb;
begin
  if not private.has_module_access(p_organization_id,'players',false) then raise exception 'Not authorized'; end if;
  if not private.can_see_player_money(p_organization_id) then raise exception 'Not authorized'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'status', r.status, 'reason', r.reason,
    'requestedAt', r.requested_at,
    'guardian', concat_ws(' ', g.first_name, g.last_name),
    'resolvedAt', r.resolved_at, 'note', r.resolution_note,
    'resolvedBy', pr.display_name
  ) order by r.requested_at desc), '[]'::jsonb) into v
  from app.benefit_requests r
  left join app.guardians g on g.id = r.guardian_id
  left join public.profiles pr on pr.user_id = r.resolved_by_user_id
  where r.organization_id = p_organization_id and r.player_id = p_player_id;
  return v;
end $function$;

create or replace function private.command_resolve_benefit_request(
  p_organization_id uuid, p_request_id uuid, p_status text, p_note text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare v_actor uuid := (select auth.uid()); r app.benefit_requests;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if not private.has_module_access(p_organization_id,'players',true) then raise exception 'Not authorized'; end if;
  if not private.can_see_player_money(p_organization_id) then raise exception 'Not authorized'; end if;
  if p_status not in ('approved','rejected') then raise exception 'Estado inválido'; end if;

  select * into r from app.benefit_requests
   where id = p_request_id and organization_id = p_organization_id for update;
  if r.id is null then raise exception 'Solicitud no encontrada'; end if;
  if r.status <> 'pending' then raise exception 'Esa solicitud ya fue resuelta'; end if;

  update app.benefit_requests
     set status = p_status,
         resolved_at = now(),
         resolved_by_user_id = v_actor,
         resolution_note = nullif(btrim(coalesce(p_note,'')),'')
   where id = p_request_id;

  -- Aprobar la solicitud NO crea la beca: el monto, el tipo y quien la fondea
  -- se capturan aparte, en la misma ficha. Aqui solo queda que se dijo que si.
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values (p_organization_id,'BenefitRequestResolved','player',r.player_id,
          jsonb_build_object('requestId',p_request_id,'status',p_status,'note',p_note), v_actor);

  return jsonb_build_object('ok',true,'status',p_status);
end $function$;

create or replace function public.v2_benefit_requests(organization_id uuid, player_id uuid)
returns jsonb language sql security invoker set search_path to 'pg_catalog','private'
as $function$ select private.query_benefit_requests(organization_id, player_id); $function$;

create or replace function public.v2_resolve_benefit_request(
  organization_id uuid, request_id uuid, status text, note text default null)
returns jsonb language sql security invoker set search_path to 'pg_catalog','private'
as $function$ select private.command_resolve_benefit_request(organization_id, request_id, status, note); $function$;

revoke all on function private.query_benefit_requests(uuid,uuid) from public, anon, authenticated;
revoke all on function private.command_resolve_benefit_request(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.v2_benefit_requests(uuid,uuid) to authenticated;
grant execute on function public.v2_resolve_benefit_request(uuid,uuid,text,text) to authenticated;;
