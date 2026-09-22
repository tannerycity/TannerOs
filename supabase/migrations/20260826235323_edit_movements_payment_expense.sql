
-- Editar EGRESO (libre, solo Presidencia)
create or replace function private.command_update_expense(p_organization_id uuid, p_expense_id uuid, p_amount numeric, p_method text, p_category text, p_concept text, p_supplier_name text, p_expense_date date, p_reference text)
returns void language plpgsql security definer set search_path to 'pg_catalog','app','private'
as $$
declare v app.expenses%rowtype; v_actor uuid:=(select auth.uid());
begin
  if not private.is_presidency(p_organization_id) then raise exception 'Solo Presidencia puede editar movimientos'; end if;
  select * into v from app.expenses where id=p_expense_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Egreso no encontrado'; end if;
  if v.status<>'posted' then raise exception 'Solo se puede editar un movimiento publicado'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'El monto debe ser mayor a cero'; end if;
  update app.expenses set
    amount=p_amount, method=coalesce(nullif(trim(p_method),''),method), category=coalesce(nullif(trim(p_category),''),category),
    concept=coalesce(nullif(trim(p_concept),''),concept), supplier_name=nullif(trim(p_supplier_name),''),
    expense_date=coalesce(p_expense_date,expense_date), reference=nullif(trim(p_reference),''), updated_at=now()
  where id=v.id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values(p_organization_id,'ExpenseEdited','expense',v.id,jsonb_build_object('before',jsonb_build_object('amount',v.amount,'method',v.method,'category',v.category),'after',jsonb_build_object('amount',p_amount,'method',p_method,'category',p_category)),v_actor);
end $$;

-- Editar INGRESO (libre si no está aplicado a mensualidad; si sí, no cambia monto/jugador)
create or replace function private.command_update_payment(p_organization_id uuid, p_payment_id uuid, p_amount numeric, p_method text, p_category text, p_concept text, p_payer_name text, p_payment_date date, p_reference text, p_player_id uuid)
returns void language plpgsql security definer set search_path to 'pg_catalog','app','private'
as $$
declare v app.payments%rowtype; v_alloc boolean; v_actor uuid:=(select auth.uid());
begin
  if not private.is_presidency(p_organization_id) then raise exception 'Solo Presidencia puede editar movimientos'; end if;
  select * into v from app.payments where id=p_payment_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Ingreso no encontrado'; end if;
  if v.status<>'posted' then raise exception 'Solo se puede editar un movimiento publicado'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'El monto debe ser mayor a cero'; end if;
  v_alloc := exists(select 1 from app.payment_allocations where payment_id=v.id);
  if v_alloc and (p_amount<>v.amount) then
    raise exception 'Esta mensualidad ya está aplicada a la cuenta del Tanner. Para cambiar el monto, reembólsala y vuelve a cobrar.';
  end if;
  if v_alloc and (coalesce(p_player_id::text,'')<>coalesce(v.player_id::text,'')) then
    raise exception 'No se puede cambiar el Tanner de una mensualidad aplicada. Reembólsala y vuelve a cobrar.';
  end if;
  if p_player_id is not null and not exists(select 1 from app.players where id=p_player_id and organization_id=p_organization_id) then
    raise exception 'Jugador no encontrado';
  end if;
  update app.payments set
    amount=p_amount, method=coalesce(nullif(trim(p_method),''),method), category=coalesce(nullif(trim(p_category),''),category),
    concept=coalesce(nullif(trim(p_concept),''),concept), payer_name=nullif(trim(p_payer_name),''),
    payment_date=coalesce(p_payment_date,payment_date), reference=nullif(trim(p_reference),''), player_id=p_player_id, updated_at=now()
  where id=v.id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values(p_organization_id,'PaymentEdited','payment',v.id,jsonb_build_object('before',jsonb_build_object('amount',v.amount,'method',v.method,'category',v.category,'playerId',v.player_id),'after',jsonb_build_object('amount',p_amount,'method',p_method,'category',p_category,'playerId',p_player_id)),v_actor);
end $$;

create or replace function public.v2_update_expense(organization_id uuid, expense_id uuid, amount numeric, method text, category text, concept text, supplier_name text, expense_date date, reference text)
returns void language sql security definer set search_path to 'pg_catalog','public','private'
as $$ select private.command_update_expense(organization_id,expense_id,amount,method,category,concept,supplier_name,expense_date,reference) $$;

create or replace function public.v2_update_payment(organization_id uuid, payment_id uuid, amount numeric, method text, category text, concept text, payer_name text, payment_date date, reference text, player_id uuid)
returns void language sql security definer set search_path to 'pg_catalog','public','private'
as $$ select private.command_update_payment(organization_id,payment_id,amount,method,category,concept,payer_name,payment_date,reference,player_id) $$;

revoke all on function public.v2_update_expense(uuid,uuid,numeric,text,text,text,text,date,text) from public, anon;
revoke all on function public.v2_update_payment(uuid,uuid,numeric,text,text,text,text,date,text,uuid) from public, anon;
grant execute on function public.v2_update_expense(uuid,uuid,numeric,text,text,text,text,date,text) to authenticated;
grant execute on function public.v2_update_payment(uuid,uuid,numeric,text,text,text,text,date,text,uuid) to authenticated;
;
