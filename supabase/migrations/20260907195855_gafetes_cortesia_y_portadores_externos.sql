-- Un gafete no siempre es de un papá: profes, visores, patrocinadores y
-- proveedores también estacionan. Y a algunos se les da sin costo. Ambas cosas
-- son independientes: un papá puede tener cortesía, y un profe puede pagar.
alter table app.parking_passes alter column player_id drop not null;
alter table app.parking_passes
  add column if not exists holder_kind text not null default 'familia',
  add column if not exists holder_name text,
  add column if not exists holder_phone text,
  add column if not exists is_courtesy boolean not null default false,
  add column if not exists courtesy_reason text,
  add column if not exists granted_by_user_id uuid;

alter table app.parking_passes drop constraint if exists parking_passes_holder_kind_check;
alter table app.parking_passes add constraint parking_passes_holder_kind_check
  check (holder_kind in ('familia','coach','scout','staff','sponsor','vendor','other'));

-- Un gafete de familia se ancla a un Tanner; uno externo necesita un nombre.
-- Sin esto se podrían guardar gafetes que no son de nadie.
alter table app.parking_passes drop constraint if exists parking_passes_holder_check;
alter table app.parking_passes add constraint parking_passes_holder_check
  check ((holder_kind = 'familia' and player_id is not null)
      or (holder_kind <> 'familia' and nullif(btrim(coalesce(holder_name,'')),'') is not null));

-- Regalar un lugar es una decisión, no un descuido: siempre lleva motivo.
alter table app.parking_passes drop constraint if exists parking_passes_courtesy_reason_check;
alter table app.parking_passes add constraint parking_passes_courtesy_reason_check
  check (not is_courtesy or nullif(btrim(coalesce(courtesy_reason,'')),'') is not null);

comment on column app.parking_passes.holder_kind is 'familia (ligado a un Tanner) | coach | scout | staff | sponsor | vendor | other';
comment on column app.parking_passes.is_courtesy is 'Gafete sin costo. No genera cargo al autorizarse, pero exige motivo y queda en la bitácora con quién lo otorgó.';

-- Autorizar: si es cortesía no se genera cargo, pero el motivo y el
-- responsable quedan registrados igual que si se hubiera cobrado.
create or replace function private.command_approve_parking(
  p_organization_id uuid, p_pass_id uuid, p_folio text default null,
  p_courtesy boolean default null, p_courtesy_reason text default null)
returns jsonb language plpgsql security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare pp app.parking_passes; v_charge uuid; v_folio text;
  v_courtesy boolean; v_reason text; v_concepto text;
begin
  if not private.has_any_module_access(p_organization_id, array['billing','accounting'], true)
    then raise exception 'Not authorized'; end if;
  select * into pp from app.parking_passes
    where id=p_pass_id and organization_id=p_organization_id for update;
  if pp.id is null then raise exception 'Gafete no encontrado'; end if;
  if pp.status <> 'requested' then raise exception 'Ese gafete ya fue procesado'; end if;
  v_folio := nullif(btrim(coalesce(p_folio,'')),'');
  v_courtesy := coalesce(p_courtesy, pp.is_courtesy);
  v_reason := coalesce(nullif(btrim(coalesce(p_courtesy_reason,'')),''), pp.courtesy_reason);
  if v_courtesy and v_reason is null then raise exception 'Escribe el motivo de la cortesía'; end if;

  if not v_courtesy then
    v_concepto := concat('Gafete de estacionamiento ', pp.season,
                         case when pp.vehicle_plate is not null then ' · '||pp.vehicle_plate else '' end);
    if pp.player_id is null then raise exception 'Un gafete sin Tanner no se puede cobrar a una cuenta: márcalo como cortesía o cóbralo en Taquilla'; end if;
    insert into app.charges(organization_id, player_id, charge_type, billing_period, concept,
                            amount, due_date, status, source, idempotency_key, payer_type)
    values(p_organization_id, pp.player_id, 'parking_pass', date_trunc('month',current_date)::date,
           v_concepto, pp.price, (date_trunc('month',current_date) + interval '1 month - 1 day')::date,
           'posted', 'parking', 'parking:'||pp.id::text, 'guardian')
    returning id into v_charge;
  end if;

  update app.parking_passes
     set status='approved', approved_at=now(), charge_id=v_charge,
         is_courtesy=v_courtesy, courtesy_reason=v_reason,
         granted_by_user_id=case when v_courtesy then auth.uid() else granted_by_user_id end,
         price=case when v_courtesy then 0 else price end,
         folio=coalesce(v_folio, folio),
         expires_on=coalesce(expires_on, make_date(season,12,31)), updated_at=now()
   where id=pp.id;
  perform app.log_parking_event(pp.id, case when v_courtesy then 'courtesy' else 'approved' end,
    'staff', v_reason,
    jsonb_build_object('charge_id', v_charge, 'price', case when v_courtesy then 0 else pp.price end,
                       'folio', v_folio, 'courtesy', v_courtesy));
  return jsonb_build_object('ok', true, 'charge_id', v_charge, 'courtesy', v_courtesy);
end $function$;

-- El club también da de alta gafetes directo, sin que nadie lo solicite:
-- el profe no entra al portal de familias.
create or replace function private.command_create_parking(
  p_organization_id uuid, p_holder_kind text, p_player_id uuid, p_holder_name text,
  p_holder_phone text, p_plate text, p_vehicle text,
  p_courtesy boolean, p_courtesy_reason text)
returns jsonb language plpgsql security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare v_id uuid; v_season integer := app.parking_season(); v_norm text; v_plate text;
  v_kind text := coalesce(nullif(btrim(coalesce(p_holder_kind,'')),''),'familia');
  v_name text := nullif(btrim(coalesce(p_holder_name,'')),'');
  v_reason text := nullif(btrim(coalesce(p_courtesy_reason,'')),'');
begin
  if not private.has_any_module_access(p_organization_id, array['billing','accounting'], true)
    then raise exception 'Not authorized'; end if;
  if v_kind = 'familia' and p_player_id is null then raise exception 'Elige el Tanner'; end if;
  if v_kind <> 'familia' and v_name is null then raise exception 'Escribe el nombre de quien lo va a portar'; end if;
  if coalesce(p_courtesy,false) and v_reason is null then raise exception 'Escribe el motivo de la cortesía'; end if;
  if v_kind = 'familia' and not exists(select 1 from app.players pl
      where pl.id=p_player_id and pl.organization_id=p_organization_id)
    then raise exception 'Tanner no encontrado'; end if;

  v_plate := nullif(btrim(coalesce(p_plate,'')),'');
  v_norm := app.normalize_plate(v_plate);
  if v_norm is null or length(v_norm) < 5 then raise exception 'Escribe las placas completas del vehículo'; end if;
  if length(v_norm) > 12 then raise exception 'Esas placas no parecen válidas'; end if;
  if exists(select 1 from app.parking_passes pp
            where pp.organization_id=p_organization_id and pp.season=v_season
              and app.normalize_plate(pp.vehicle_plate)=v_norm
              and pp.status in ('requested','approved','issued'))
    then raise exception 'Ese vehículo ya tiene un gafete en trámite o vigente'; end if;

  insert into app.parking_passes(organization_id, player_id, guardian_id, season, status,
    holder_kind, holder_name, holder_phone, vehicle_plate, vehicle_desc,
    price, is_courtesy, courtesy_reason, granted_by_user_id,
    -- Nace ya solicitado; el club lo autoriza en el mismo flujo que los demás,
    -- así ningún gafete se salta la bitácora.
    requested_at)
  values(p_organization_id, case when v_kind='familia' then p_player_id end,
    case when v_kind='familia' then (select pg.guardian_id from app.player_guardians pg
      where pg.player_id=p_player_id order by pg.is_primary desc nulls last limit 1) end,
    v_season, 'requested', v_kind, v_name, nullif(btrim(coalesce(p_holder_phone,'')),''),
    upper(v_plate), nullif(btrim(coalesce(p_vehicle,'')),''),
    case when coalesce(p_courtesy,false) then 0 else app.parking_pass_price() end,
    coalesce(p_courtesy,false), v_reason,
    case when coalesce(p_courtesy,false) then auth.uid() end, now())
  returning id into v_id;
  perform app.log_parking_event(v_id,'requested','staff',v_reason,
    jsonb_build_object('plate', upper(v_plate), 'holder_kind', v_kind,
                       'holder_name', v_name, 'courtesy', coalesce(p_courtesy,false)));
  return jsonb_build_object('id', v_id, 'status','requested','courtesy', coalesce(p_courtesy,false));
end $function$;

create or replace function public.v2_approve_parking(
  organization_id uuid, pass_id uuid, folio text default null,
  courtesy boolean default null, courtesy_reason text default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','private'
as $$ begin return private.command_approve_parking(organization_id, pass_id, folio, courtesy, courtesy_reason); end $$;

create or replace function public.v2_create_parking(
  organization_id uuid, holder_kind text, plate text,
  player_id uuid default null, holder_name text default null, holder_phone text default null,
  vehicle text default null, courtesy boolean default false, courtesy_reason text default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','private'
as $$ begin return private.command_create_parking(organization_id, holder_kind, player_id,
  holder_name, holder_phone, plate, vehicle, courtesy, courtesy_reason); end $$;

do $$
declare f text;
begin
  -- La firma vieja de 3 argumentos ya no se usa y dejarla viva permitiría
  -- autorizar saltándose la lógica de cortesía.
  execute 'drop function if exists public.v2_approve_parking(uuid,uuid,text)';
  execute 'drop function if exists private.command_approve_parking(uuid,uuid,text)';
  foreach f in array array['public.v2_approve_parking(uuid,uuid,text,boolean,text)',
    'public.v2_create_parking(uuid,text,text,uuid,text,text,text,boolean,text)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['private.command_approve_parking(uuid,uuid,text,boolean,text)',
    'private.command_create_parking(uuid,text,uuid,text,text,text,text,boolean,text)']
  loop execute format('revoke all on function %s from public, anon', f); end loop;
end $$;;
