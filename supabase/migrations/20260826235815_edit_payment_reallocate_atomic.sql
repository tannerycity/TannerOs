
create or replace function private.command_update_payment(p_organization_id uuid, p_payment_id uuid, p_amount numeric, p_method text, p_category text, p_concept text, p_payer_name text, p_payment_date date, p_reference text, p_player_id uuid)
returns void language plpgsql security definer set search_path to 'pg_catalog','public','app','private'
as $$
declare v app.payments%rowtype; v_alloc boolean; v_actor uuid:=(select auth.uid());
begin
  if not private.is_presidency(p_organization_id) then raise exception 'Solo Presidencia puede editar movimientos'; end if;
  select * into v from app.payments where id=p_payment_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Ingreso no encontrado'; end if;
  if v.status<>'posted' then raise exception 'Solo se puede editar un movimiento publicado'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'El monto debe ser mayor a cero'; end if;
  if p_player_id is not null and not exists(select 1 from app.players where id=p_player_id and organization_id=p_organization_id) then
    raise exception 'Jugador no encontrado';
  end if;

  v_alloc := exists(select 1 from app.payment_allocations where payment_id=v.id);

  -- Cambiar el Tanner de una mensualidad aplicada sí es riesgoso (es otra cuenta): eso sí se bloquea.
  if v_alloc and (coalesce(p_player_id::text,'')<>coalesce(v.player_id::text,'')) then
    raise exception 'No se puede cambiar el Tanner de una mensualidad aplicada. Reembólsala y vuelve a cobrar.';
  end if;

  if v_alloc and p_amount<>v.amount then
    -- RE-AJUSTE ATÓMICO: deshacer aplicación -> cambiar monto -> volver a aplicar. Todo queda cuadrado.
    perform private.command_reverse_payment_allocations(p_organization_id, v.id, 'Ajuste de monto en taquilla');
    update app.payments set
      amount=p_amount, method=coalesce(nullif(trim(p_method),''),method), category=coalesce(nullif(trim(p_category),''),category),
      concept=coalesce(nullif(trim(p_concept),''),concept), payer_name=nullif(trim(p_payer_name),''),
      payment_date=coalesce(p_payment_date,payment_date), reference=nullif(trim(p_reference),''), player_id=p_player_id, updated_at=now()
    where id=v.id;
    perform app.allocate_payment_oldest_first(v.id);
  else
    update app.payments set
      amount=p_amount, method=coalesce(nullif(trim(p_method),''),method), category=coalesce(nullif(trim(p_category),''),category),
      concept=coalesce(nullif(trim(p_concept),''),concept), payer_name=nullif(trim(p_payer_name),''),
      payment_date=coalesce(p_payment_date,payment_date), reference=nullif(trim(p_reference),''), player_id=p_player_id, updated_at=now()
    where id=v.id;
  end if;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values(p_organization_id,'PaymentEdited','payment',v.id,
    jsonb_build_object('before',jsonb_build_object('amount',v.amount,'method',v.method,'category',v.category,'playerId',v.player_id),
                       'after',jsonb_build_object('amount',p_amount,'method',p_method,'category',p_category,'playerId',p_player_id),
                       'reallocated',(v_alloc and p_amount<>v.amount)),v_actor);
end $$;
;
