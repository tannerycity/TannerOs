-- Aprobar y entregar ya no dependen de que alguien teclee el folio.
-- Se sigue aceptando p_folio para no romper a quien lo mande, pero si no viene
-- —que es lo normal ahora— lo genera el sistema con app.next_parking_folio.
create or replace function private.command_approve_parking(
  p_organization_id uuid, p_pass_id uuid, p_folio text default null::text,
  p_courtesy boolean default null::boolean, p_courtesy_reason text default null::text,
  p_pass_type text default null::text)
returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare pp app.parking_passes; v_charge uuid; v_folio text;
  v_courtesy boolean; v_reason text; v_concepto text; v_type text; v_price numeric;
begin
  if not private.has_any_module_access(p_organization_id, array['estacionamiento', 'billing','accounting'], true)
    then raise exception 'Not authorized'; end if;
  select * into pp from app.parking_passes
    where id=p_pass_id and organization_id=p_organization_id for update;
  if pp.id is null then raise exception 'Gafete no encontrado'; end if;
  if pp.status <> 'requested' then raise exception 'Ese gafete ya fue procesado'; end if;
  v_courtesy := coalesce(p_courtesy, pp.is_courtesy);
  v_reason := coalesce(nullif(btrim(coalesce(p_courtesy_reason,'')),''), pp.courtesy_reason);
  if v_courtesy and v_reason is null then raise exception 'Escribe el motivo de la cortesía'; end if;
  v_type := case when lower(coalesce(btrim(p_pass_type),'')) in ('vip','tanner') then lower(btrim(p_pass_type)) else pp.pass_type end;
  v_price := case when v_courtesy then 0 else app.parking_pass_price(v_type) end;

  -- El folio se decide DESPUÉS del tipo: un VIP lleva serie VIP, no TC.
  v_folio := coalesce(
    nullif(btrim(coalesce(p_folio,'')),''),
    pp.folio,
    app.next_parking_folio(p_organization_id, pp.season, v_type));

  if not v_courtesy then
    v_concepto := concat('Gafete de estacionamiento ', pp.season,
                         case when pp.vehicle_plate is not null then ' · '||pp.vehicle_plate else '' end);
    if pp.player_id is null then raise exception 'Un gafete sin Tanner no se puede cobrar a una cuenta: márcalo como cortesía o cóbralo en Taquilla'; end if;
    insert into app.charges(organization_id, player_id, charge_type, billing_period, concept,
                            amount, due_date, status, source, idempotency_key, payer_type)
    values(p_organization_id, pp.player_id, 'parking_pass', date_trunc('month',current_date)::date,
           v_concepto, v_price, (date_trunc('month',current_date) + interval '1 month - 1 day')::date,
           'posted', 'parking', 'parking:'||pp.id::text, 'guardian')
    returning id into v_charge;
  end if;

  update app.parking_passes
     set status='approved', approved_at=now(), charge_id=v_charge,
         is_courtesy=v_courtesy, courtesy_reason=v_reason,
         granted_by_user_id=case when v_courtesy then auth.uid() else granted_by_user_id end,
         price=v_price, pass_type=v_type, folio=v_folio,
         expires_on=coalesce(expires_on, make_date(season,12,31)), updated_at=now()
   where id=pp.id;
  perform app.log_parking_event(pp.id, case when v_courtesy then 'courtesy' else 'approved' end,
    'staff', v_reason,
    jsonb_build_object('charge_id', v_charge, 'price', v_price, 'pass_type', v_type,
                       'folio', v_folio, 'courtesy', v_courtesy));
  return jsonb_build_object('ok', true, 'charge_id', v_charge, 'courtesy', v_courtesy, 'folio', v_folio);
end $function$;
revoke all on function private.command_approve_parking(uuid,uuid,text,boolean,text,text) from public, anon, authenticated;
;
