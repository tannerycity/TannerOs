-- Toda transición de estado pasa por aquí, así que la bitácora nunca se queda
-- sin registrar un movimiento.
create or replace function app.log_parking_event(
  p_pass_id uuid, p_event text, p_actor_kind text, p_note text default null, p_payload jsonb default '{}'::jsonb)
returns void language plpgsql security definer
set search_path to 'pg_catalog','app'
as $$
declare v_org uuid;
begin
  select organization_id into v_org from app.parking_passes where id = p_pass_id;
  insert into app.parking_pass_events(organization_id, pass_id, event, actor_user_id, actor_kind, note, payload)
  values(v_org, p_pass_id, p_event, auth.uid(), p_actor_kind, nullif(btrim(coalesce(p_note,'')),''), coalesce(p_payload,'{}'::jsonb));
end $$;

/* ---------- Portal de familias ---------- */
create or replace function private.portal_parking()
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare g app.guardians;
begin
  select * into g from private.portal_guardian();
  if g.id is null then raise exception 'Portal access required'; end if;
  return jsonb_build_object(
    'price', app.parking_pass_price(),
    'season', app.parking_season(),
    'passes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pp.id, 'folio', pp.folio, 'status', pp.status, 'season', pp.season,
        'plate', pp.vehicle_plate, 'vehicle', pp.vehicle_desc,
        'price', pp.price, 'expires_on', pp.expires_on,
        'requested_at', pp.requested_at, 'issued_at', pp.issued_at,
        'close_reason', pp.close_reason,
        'player', concat_ws(' ', pl.first_name, pl.last_name),
        -- El saldo del gafete sale del mismo ledger que todo lo demás.
        'balance', coalesce((select cb.balance_due from app.charge_balances cb where cb.id = pp.charge_id), 0))
        order by pp.season desc, pp.requested_at desc)
      from app.parking_passes pp
      join app.players pl on pl.id = pp.player_id
      where pp.guardian_id = g.id
         or pp.player_id in (select player_id from private.portal_player_ids())), '[]'::jsonb));
end $function$;

create or replace function private.portal_request_parking(
  p_player_id uuid, p_plate text, p_vehicle text)
returns jsonb language plpgsql security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare g app.guardians; v_id uuid; v_season integer := app.parking_season(); v_plate text;
begin
  select * into g from private.portal_guardian();
  if g.id is null then raise exception 'Portal access required'; end if;
  if not private.portal_owns_player(p_player_id) then raise exception 'Not authorized'; end if;
  v_plate := upper(nullif(btrim(coalesce(p_plate,'')),''));
  if v_plate is null or length(v_plate) < 5 then raise exception 'Escribe las placas del vehículo'; end if;
  if length(v_plate) > 15 then raise exception 'Placas demasiado largas'; end if;
  -- La misma placa no se puede pedir dos veces en la temporada.
  if exists(select 1 from app.parking_passes pp
            where pp.organization_id = g.organization_id and pp.season = v_season
              and upper(btrim(pp.vehicle_plate)) = v_plate
              and pp.status in ('requested','approved','issued'))
    then raise exception 'Ese vehículo ya tiene un gafete en trámite o vigente'; end if;
  -- Tope defensivo: el control real es que el club autoriza uno por uno.
  if (select count(*) from app.parking_passes pp
      where pp.guardian_id = g.id and pp.season = v_season
        and pp.status in ('requested','approved','issued')) >= 6
    then raise exception 'Ya tienes el máximo de gafetes por temporada. Habla con el club.'; end if;

  insert into app.parking_passes(organization_id, player_id, guardian_id, season, status,
                                 vehicle_plate, vehicle_desc, price)
  values(g.organization_id, p_player_id, g.id, v_season, 'requested',
         v_plate, nullif(btrim(coalesce(p_vehicle,'')),''), app.parking_pass_price())
  returning id into v_id;
  perform app.log_parking_event(v_id,'requested','familia',null,
    jsonb_build_object('plate', v_plate, 'vehicle', p_vehicle));
  return jsonb_build_object('id', v_id, 'status','requested','price', app.parking_pass_price());
end $function$;

/* ---------- Club ---------- */
create or replace function private.query_parking_passes(p_organization_id uuid, p_status text default null)
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog','app','private'
as $function$
begin
  if not private.has_any_module_access(p_organization_id, array['players','billing','accounting'], false)
    then raise exception 'Not authorized'; end if;
  return jsonb_build_object(
    'price', app.parking_pass_price(),
    'season', app.parking_season(),
    'summary', (select jsonb_build_object(
        'requested', count(*) filter (where status='requested'),
        'approved',  count(*) filter (where status='approved'),
        'issued',    count(*) filter (where status='issued'),
        'por_cobrar', coalesce(sum(coalesce((select cb.balance_due from app.charge_balances cb where cb.id=pp.charge_id),0))
                      filter (where status in ('approved','issued')),0))
      from app.parking_passes pp
      where pp.organization_id=p_organization_id and pp.season=app.parking_season()),
    'passes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pp.id, 'folio', pp.folio, 'status', pp.status, 'season', pp.season,
        'plate', pp.vehicle_plate, 'vehicle', pp.vehicle_desc, 'price', pp.price,
        'expires_on', pp.expires_on, 'requested_at', pp.requested_at, 'issued_at', pp.issued_at,
        'close_reason', pp.close_reason, 'notes', pp.notes,
        'player_id', pp.player_id,
        'player', concat_ws(' ', pl.first_name, pl.last_name),
        'category', pl.category,
        'guardian', concat_ws(' ', nullif(btrim(g.first_name),''), nullif(btrim(g.last_name),'')),
        'guardian_phone', g.phone,
        'balance', coalesce((select cb.balance_due from app.charge_balances cb where cb.id=pp.charge_id),0))
        order by case pp.status when 'requested' then 0 when 'approved' then 1 else 2 end,
                 pp.requested_at desc)
      from app.parking_passes pp
      join app.players pl on pl.id=pp.player_id
      left join app.guardians g on g.id=pp.guardian_id
      where pp.organization_id=p_organization_id
        and (p_status is null or pp.status=p_status)), '[]'::jsonb));
end $function$;

create or replace function private.query_parking_pass_detail(p_organization_id uuid, p_pass_id uuid)
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog','app','private'
as $function$
begin
  if not private.has_any_module_access(p_organization_id, array['players','billing','accounting'], false)
    then raise exception 'Not authorized'; end if;
  return (select jsonb_build_object(
    'id', pp.id, 'folio', pp.folio, 'status', pp.status, 'season', pp.season,
    'plate', pp.vehicle_plate, 'vehicle', pp.vehicle_desc, 'price', pp.price,
    'expires_on', pp.expires_on, 'close_reason', pp.close_reason, 'notes', pp.notes,
    'player_id', pp.player_id,
    'player', concat_ws(' ', pl.first_name, pl.last_name),
    'guardian', concat_ws(' ', nullif(btrim(g.first_name),''), nullif(btrim(g.last_name),'')),
    'balance', coalesce((select cb.balance_due from app.charge_balances cb where cb.id=pp.charge_id),0),
    'events', coalesce((select jsonb_agg(jsonb_build_object(
        'event', e.event, 'actor_kind', e.actor_kind, 'note', e.note,
        'payload', e.payload, 'at', e.created_at,
        'actor', coalesce((select pr.display_name from public.profiles pr where pr.user_id=e.actor_user_id),''))
        order by e.created_at desc)
      from app.parking_pass_events e where e.pass_id=pp.id), '[]'::jsonb))
    from app.parking_passes pp
    join app.players pl on pl.id=pp.player_id
    left join app.guardians g on g.id=pp.guardian_id
    where pp.id=p_pass_id and pp.organization_id=p_organization_id);
end $function$;

-- Aprobar genera el cargo: es el único punto donde el gafete cuesta dinero.
create or replace function private.command_approve_parking(
  p_organization_id uuid, p_pass_id uuid, p_folio text default null)
returns jsonb language plpgsql security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare pp app.parking_passes; v_charge uuid; v_folio text;
begin
  if not private.has_any_module_access(p_organization_id, array['billing','accounting'], true)
    then raise exception 'Not authorized'; end if;
  select * into pp from app.parking_passes
    where id=p_pass_id and organization_id=p_organization_id for update;
  if pp.id is null then raise exception 'Gafete no encontrado'; end if;
  if pp.status <> 'requested' then raise exception 'Ese gafete ya fue procesado'; end if;
  v_folio := nullif(btrim(coalesce(p_folio,'')),'');

  insert into app.charges(organization_id, player_id, charge_type, billing_period, concept,
                          amount, due_date, status, source, idempotency_key, payer_type)
  values(p_organization_id, pp.player_id, 'parking_pass', date_trunc('month',current_date)::date,
         concat('Gafete de estacionamiento ', pp.season,
                case when pp.vehicle_plate is not null then ' · '||pp.vehicle_plate else '' end),
         pp.price, (date_trunc('month',current_date) + interval '1 month - 1 day')::date,
         'posted', 'parking', 'parking:'||pp.id::text, 'guardian')
  returning id into v_charge;

  update app.parking_passes
     set status='approved', approved_at=now(), charge_id=v_charge,
         folio=coalesce(v_folio, folio),
         expires_on=coalesce(expires_on, make_date(season,12,31)), updated_at=now()
   where id=pp.id;
  perform app.log_parking_event(pp.id,'approved','staff',null,
    jsonb_build_object('charge_id', v_charge, 'price', pp.price, 'folio', v_folio));
  return jsonb_build_object('ok', true, 'charge_id', v_charge);
end $function$;

create or replace function private.command_issue_parking(
  p_organization_id uuid, p_pass_id uuid, p_folio text)
returns jsonb language plpgsql security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare pp app.parking_passes; v_folio text;
begin
  if not private.has_any_module_access(p_organization_id, array['players','billing','accounting'], true)
    then raise exception 'Not authorized'; end if;
  v_folio := nullif(btrim(coalesce(p_folio,'')),'');
  if v_folio is null then raise exception 'Escribe el folio del gafete que entregas'; end if;
  select * into pp from app.parking_passes
    where id=p_pass_id and organization_id=p_organization_id for update;
  if pp.id is null then raise exception 'Gafete no encontrado'; end if;
  if pp.status <> 'approved' then raise exception 'Primero hay que autorizar el gafete'; end if;
  update app.parking_passes set status='issued', issued_at=now(), folio=v_folio, updated_at=now()
   where id=pp.id;
  perform app.log_parking_event(pp.id,'issued','staff',null, jsonb_build_object('folio', v_folio));
  return jsonb_build_object('ok', true);
end $function$;

-- Cierra un gafete: rechazado, revocado, perdido o vencido. El cargo NO se
-- cancela solo: condonar es una decisión aparte, con su propio flujo auditado.
create or replace function private.command_close_parking(
  p_organization_id uuid, p_pass_id uuid, p_status text, p_reason text)
returns jsonb language plpgsql security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare pp app.parking_passes;
begin
  if not private.has_any_module_access(p_organization_id, array['players','billing','accounting'], true)
    then raise exception 'Not authorized'; end if;
  if p_status not in ('rejected','revoked','lost','expired') then raise exception 'Estado inválido'; end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Escribe el motivo'; end if;
  select * into pp from app.parking_passes
    where id=p_pass_id and organization_id=p_organization_id for update;
  if pp.id is null then raise exception 'Gafete no encontrado'; end if;
  if pp.status in ('rejected','revoked','lost','expired') then raise exception 'Ese gafete ya está cerrado'; end if;
  update app.parking_passes set status=p_status, closed_at=now(), close_reason=btrim(p_reason), updated_at=now()
   where id=pp.id;
  perform app.log_parking_event(pp.id, p_status, 'staff', btrim(p_reason),
    jsonb_build_object('previous_status', pp.status, 'charge_id', pp.charge_id));
  return jsonb_build_object('ok', true, 'charge_pendiente', pp.charge_id is not null);
end $function$;

/* ---------- Wrappers públicos ---------- */
create or replace function public.v2_portal_parking()
returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $$ select private.portal_parking() $$;
create or replace function public.v2_portal_request_parking(player_id uuid, plate text, vehicle text default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','private'
as $$ begin return private.portal_request_parking(player_id, plate, vehicle); end $$;
create or replace function public.v2_parking_passes(organization_id uuid, status_filter text default null)
returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $$ select private.query_parking_passes(organization_id, status_filter) $$;
create or replace function public.v2_parking_pass_detail(organization_id uuid, pass_id uuid)
returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $$ select private.query_parking_pass_detail(organization_id, pass_id) $$;
create or replace function public.v2_approve_parking(organization_id uuid, pass_id uuid, folio text default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','private'
as $$ begin return private.command_approve_parking(organization_id, pass_id, folio); end $$;
create or replace function public.v2_issue_parking(organization_id uuid, pass_id uuid, folio text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','private'
as $$ begin return private.command_issue_parking(organization_id, pass_id, folio); end $$;
create or replace function public.v2_close_parking(organization_id uuid, pass_id uuid, new_status text, reason text)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','private'
as $$ begin return private.command_close_parking(organization_id, pass_id, new_status, reason); end $$;

do $$
declare f text;
begin
  foreach f in array array['public.v2_portal_parking()','public.v2_portal_request_parking(uuid,text,text)',
    'public.v2_parking_passes(uuid,text)','public.v2_parking_pass_detail(uuid,uuid)',
    'public.v2_approve_parking(uuid,uuid,text)','public.v2_issue_parking(uuid,uuid,text)',
    'public.v2_close_parking(uuid,uuid,text,text)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['app.log_parking_event(uuid,text,text,text,jsonb)','app.parking_pass_price()',
    'app.parking_season(date)','private.portal_parking()','private.portal_request_parking(uuid,text,text)',
    'private.query_parking_passes(uuid,text)','private.query_parking_pass_detail(uuid,uuid)',
    'private.command_approve_parking(uuid,uuid,text)','private.command_issue_parking(uuid,uuid,text)',
    'private.command_close_parking(uuid,uuid,text,text)']
  loop execute format('revoke all on function %s from public, anon', f); end loop;
end $$;;
