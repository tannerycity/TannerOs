create or replace function private.command_upsert_prospect_followup(p_organization_id uuid,p_prospect_id uuid,p_status text,p_next_action_at timestamptz,p_notes text)
returns void language plpgsql security definer set search_path to 'pg_catalog','app','private'
as $$
begin
  if not private.has_module_access(p_organization_id,'prospects',true) then raise exception 'Not authorized'; end if;
  if p_status not in ('new','contacted','trial_scheduled','trial_completed','converted','not_continuing') then raise exception 'Invalid prospect status'; end if;
  update app.prospects
     set status=p_status,next_action_at=p_next_action_at,notes=nullif(trim(coalesce(p_notes,'')),''),assigned_user_id=(select auth.uid()),updated_at=now()
   where id=p_prospect_id and organization_id=p_organization_id and archived_at is null;
  if not found then raise exception 'Prospect not found'; end if;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,'ProspectFollowupUpdated','prospect',p_prospect_id,
         jsonb_build_object('status',p_status,'next_action_at',p_next_action_at),coalesce((select auth.uid())::text,'system'));
end $$;;
