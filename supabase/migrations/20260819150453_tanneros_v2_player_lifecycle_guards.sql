create or replace function app.withdraw_player(
  p_player_id uuid,
  p_withdrawn_at date,
  p_reason text,
  p_actor text default null
) returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_org uuid;
  v_status text;
begin
  if p_withdrawn_at is null then raise exception 'Withdrawal date required'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'Withdrawal reason required'; end if;

  select organization_id,status into v_org,v_status
  from app.players where id=p_player_id for update;

  if v_org is null then raise exception 'Player not found'; end if;
  if v_status <> 'active' then raise exception 'Only active players can be withdrawn'; end if;

  update app.players
     set status='withdrawn',
         withdrawn_at=p_withdrawn_at,
         withdrawal_reason=trim(p_reason),
         updated_at=now()
   where id=p_player_id;

  update app.billing_profiles
     set status='closed',updated_at=now()
   where player_id=p_player_id;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(v_org,'PlayerWithdrawn','player',p_player_id,
         jsonb_build_object('withdrawn_at',p_withdrawn_at,'reason',trim(p_reason)),p_actor);
end
$$;

create or replace function app.reactivate_player(
  p_player_id uuid,
  p_reactivated_at date,
  p_actor text default null
) returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_org uuid;
  v_status text;
begin
  if p_reactivated_at is null then raise exception 'Reactivation date required'; end if;

  select organization_id,status into v_org,v_status
  from app.players where id=p_player_id for update;

  if v_org is null then raise exception 'Player not found'; end if;
  if v_status <> 'withdrawn' then raise exception 'Only withdrawn players can be reactivated'; end if;

  update app.players
     set status='active',
         withdrawn_at=null,
         withdrawal_reason=null,
         updated_at=now()
   where id=p_player_id;

  update app.billing_profiles
     set status='active',
         billing_start=greatest(billing_start,p_reactivated_at),
         updated_at=now()
   where player_id=p_player_id;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(v_org,'PlayerReactivated','player',p_player_id,
         jsonb_build_object('reactivated_at',p_reactivated_at),p_actor);
end
$$;;
