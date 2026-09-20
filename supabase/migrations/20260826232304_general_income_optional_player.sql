
drop function if exists public.v2_post_general_income(uuid,numeric,date,text,text,text,text,text,text);
drop function if exists private.command_post_general_income(uuid,numeric,date,text,text,text,text,text,text);

create function private.command_post_general_income(p_organization_id uuid, p_amount numeric, p_payment_date date, p_method text, p_category text, p_concept text, p_payer_name text, p_reference text, p_idempotency_key text, p_player_id uuid default null)
returns uuid language plpgsql security definer set search_path to 'pg_catalog','public','app','private'
as $$
declare v_id uuid; v_actor uuid := (select auth.uid());
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if not private.has_any_module_access(p_organization_id,array['taquilla','accounting'],true) then raise exception 'Not authorized'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'Amount must be greater than zero'; end if;
  if coalesce(length(trim(p_category)),0)<2 then raise exception 'Category required'; end if;
  if coalesce(length(trim(p_concept)),0)<2 then raise exception 'Concept required'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key))<8 then raise exception 'Idempotency key required'; end if;
  if p_player_id is not null and not exists(select 1 from app.players where id=p_player_id and organization_id=p_organization_id) then
    raise exception 'Jugador no encontrado';
  end if;

  select id into v_id from app.payments where organization_id=p_organization_id and idempotency_key=trim(p_idempotency_key);
  if v_id is not null then return v_id; end if;

  insert into app.payments(
    organization_id,player_id,amount,payment_date,method,reference,concept,status,source,category,
    idempotency_key,payer_type,payer_name,payment_purpose,credit_status,created_at,updated_at
  ) values (
    p_organization_id,p_player_id,p_amount,coalesce(p_payment_date,current_date),coalesce(nullif(trim(p_method),''),'other'),
    nullif(trim(p_reference),''),trim(p_concept),'posted','tanneros_v2',trim(p_category),trim(p_idempotency_key),
    'other',nullif(trim(p_payer_name),''),'other','not_applicable',now(),now()
  ) returning id into v_id;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id,request_id)
  values(p_organization_id,'GeneralIncomePosted','payment',v_id,
    jsonb_build_object('amount',p_amount,'payment_date',coalesce(p_payment_date,current_date),'category',trim(p_category),'concept',trim(p_concept),'payerName',nullif(trim(p_payer_name),''),'playerId',p_player_id),
    v_actor,trim(p_idempotency_key));
  return v_id;
end;$$;

create function public.v2_post_general_income(organization_id uuid, amount numeric, payment_date date, method text, category text, concept text, payer_name text default null, reference text default null, idempotency_key text default null, player_id uuid default null)
returns uuid language sql security definer set search_path to 'pg_catalog','public','private'
as $$ select private.command_post_general_income(organization_id,amount,payment_date,method,category,concept,payer_name,reference,idempotency_key,player_id) $$;

revoke all on function public.v2_post_general_income(uuid,numeric,date,text,text,text,text,text,text,uuid) from public, anon;
grant execute on function public.v2_post_general_income(uuid,numeric,date,text,text,text,text,text,text,uuid) to authenticated;
;
