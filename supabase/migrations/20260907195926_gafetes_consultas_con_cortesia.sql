-- El join a players pasa a LEFT: un gafete de profe o visor no tiene Tanner y
-- con INNER JOIN habría desaparecido del padrón.
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
        'cortesias', count(*) filter (where is_courtesy and status in ('approved','issued')),
        -- Ingreso que el club decidió no cobrar. Se mide, no se esconde.
        'cortesia_valor', coalesce(count(*) filter (where is_courtesy and status in ('approved','issued')),0)
                          * app.parking_pass_price(),
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
        'holder_kind', pp.holder_kind, 'is_courtesy', pp.is_courtesy, 'courtesy_reason', pp.courtesy_reason,
        'player_id', pp.player_id,
        'holder', coalesce(concat_ws(' ', pl.first_name, pl.last_name), pp.holder_name),
        'category', pl.category,
        'guardian', concat_ws(' ', nullif(btrim(g.first_name),''), nullif(btrim(g.last_name),'')),
        'guardian_phone', coalesce(g.phone, pp.holder_phone),
        'balance', coalesce((select cb.balance_due from app.charge_balances cb where cb.id=pp.charge_id),0))
        order by case pp.status when 'requested' then 0 when 'approved' then 1 else 2 end,
                 pp.requested_at desc)
      from app.parking_passes pp
      left join app.players pl on pl.id=pp.player_id
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
    'holder_kind', pp.holder_kind, 'is_courtesy', pp.is_courtesy, 'courtesy_reason', pp.courtesy_reason,
    'player_id', pp.player_id,
    'holder', coalesce(concat_ws(' ', pl.first_name, pl.last_name), pp.holder_name),
    'holder_phone', coalesce(g.phone, pp.holder_phone),
    'guardian', concat_ws(' ', nullif(btrim(g.first_name),''), nullif(btrim(g.last_name),'')),
    'granted_by', coalesce((select pr.display_name from public.profiles pr where pr.user_id=pp.granted_by_user_id),''),
    'balance', coalesce((select cb.balance_due from app.charge_balances cb where cb.id=pp.charge_id),0),
    'events', coalesce((select jsonb_agg(jsonb_build_object(
        'event', e.event, 'actor_kind', e.actor_kind, 'note', e.note,
        'payload', e.payload, 'at', e.created_at,
        'actor', coalesce((select pr.display_name from public.profiles pr where pr.user_id=e.actor_user_id),''))
        order by e.created_at desc)
      from app.parking_pass_events e where e.pass_id=pp.id), '[]'::jsonb))
    from app.parking_passes pp
    left join app.players pl on pl.id=pp.player_id
    left join app.guardians g on g.id=pp.guardian_id
    where pp.id=p_pass_id and pp.organization_id=p_organization_id);
end $function$;

-- El portal sólo muestra gafetes de familia; un profe no entra por ahí.
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
        'price', pp.price, 'expires_on', pp.expires_on, 'is_courtesy', pp.is_courtesy,
        'requested_at', pp.requested_at, 'issued_at', pp.issued_at,
        'close_reason', pp.close_reason,
        'player', concat_ws(' ', pl.first_name, pl.last_name),
        'balance', coalesce((select cb.balance_due from app.charge_balances cb where cb.id = pp.charge_id), 0))
        order by pp.season desc, pp.requested_at desc)
      from app.parking_passes pp
      join app.players pl on pl.id = pp.player_id
      where pp.holder_kind='familia'
        and (pp.guardian_id = g.id
             or pp.player_id in (select player_id from private.portal_player_ids()))), '[]'::jsonb));
end $function$;

revoke all on function private.query_parking_passes(uuid,text) from public, anon;
revoke all on function private.query_parking_pass_detail(uuid,uuid) from public, anon;
revoke all on function private.portal_parking() from public, anon;;
