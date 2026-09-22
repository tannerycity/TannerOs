-- La gente escribe la placa como quiere: "abc-123-x", "ABC 123 X", "abc123x".
-- Comparar sólo con upper+trim las dejaba pasar como vehículos distintos, así
-- que el mismo coche podía sacar varios gafetes. Se compara por la placa
-- reducida a letras y números; la original se conserva tal como la escribieron.
create or replace function app.normalize_plate(p_plate text)
returns text language sql immutable
set search_path to 'pg_catalog'
as $$ select nullif(upper(regexp_replace(coalesce(p_plate,''), '[^A-Za-z0-9]', '', 'g')), '') $$;

drop index if exists app.parking_passes_plate_season;
create unique index parking_passes_plate_season
  on app.parking_passes(organization_id, season, app.normalize_plate(vehicle_plate))
  where vehicle_plate is not null and status in ('requested','approved','issued');

create or replace function private.portal_request_parking(
  p_player_id uuid, p_plate text, p_vehicle text)
returns jsonb language plpgsql security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare g app.guardians; v_id uuid; v_season integer := app.parking_season();
  v_norm text; v_plate text;
begin
  select * into g from private.portal_guardian();
  if g.id is null then raise exception 'Portal access required'; end if;
  if not private.portal_owns_player(p_player_id) then raise exception 'Not authorized'; end if;
  v_plate := nullif(btrim(coalesce(p_plate,'')),'');
  v_norm := app.normalize_plate(v_plate);
  if v_norm is null or length(v_norm) < 5 then raise exception 'Escribe las placas completas del vehículo'; end if;
  if length(v_norm) > 12 then raise exception 'Esas placas no parecen válidas'; end if;
  if exists(select 1 from app.parking_passes pp
            where pp.organization_id = g.organization_id and pp.season = v_season
              and app.normalize_plate(pp.vehicle_plate) = v_norm
              and pp.status in ('requested','approved','issued'))
    then raise exception 'Ese vehículo ya tiene un gafete en trámite o vigente'; end if;
  if (select count(*) from app.parking_passes pp
      where pp.guardian_id = g.id and pp.season = v_season
        and pp.status in ('requested','approved','issued')) >= 6
    then raise exception 'Ya tienes el máximo de gafetes por temporada. Habla con el club.'; end if;

  insert into app.parking_passes(organization_id, player_id, guardian_id, season, status,
                                 vehicle_plate, vehicle_desc, price)
  values(g.organization_id, p_player_id, g.id, v_season, 'requested',
         upper(v_plate), nullif(btrim(coalesce(p_vehicle,'')),''), app.parking_pass_price())
  returning id into v_id;
  perform app.log_parking_event(v_id,'requested','familia',null,
    jsonb_build_object('plate', upper(v_plate), 'vehicle', p_vehicle));
  return jsonb_build_object('id', v_id, 'status','requested','price', app.parking_pass_price());
end $function$;

revoke all on function app.normalize_plate(text) from public, anon;
revoke all on function private.portal_request_parking(uuid,text,text) from public, anon;;
