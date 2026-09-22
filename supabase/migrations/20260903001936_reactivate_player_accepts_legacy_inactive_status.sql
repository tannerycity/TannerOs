-- app.players.status allows 'active' | 'inactive' | 'withdrawn' (players_status_check).
-- 'inactive' is legacy bulk-import data (90 players) predating the tracked withdraw/reason
-- flow; 'withdrawn' (2 players) is the newer, richer status set by app.withdraw_player.
-- Both mean "not an active Tanner" everywhere else in the app (stats, list filters already
-- bucket status_value<>'active' together as "Bajas"). reactivate_player only accepted
-- 'withdrawn', leaving legacy 'inactive' players with no way back to active. Widen the guard.
CREATE OR REPLACE FUNCTION app.reactivate_player(p_player_id uuid, p_reactivated_at date, p_actor text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'app', 'public'
AS $function$
declare
  v_org uuid;
  v_status text;
begin
  if p_reactivated_at is null then raise exception 'Reactivation date required'; end if;

  select organization_id,status into v_org,v_status
  from app.players where id=p_player_id for update;

  if v_org is null then raise exception 'Player not found'; end if;
  if v_status not in ('withdrawn','inactive') then raise exception 'Only withdrawn or inactive players can be reactivated'; end if;

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
         jsonb_build_object('reactivated_at',p_reactivated_at,'previous_status',v_status),p_actor);
end
$function$;;
