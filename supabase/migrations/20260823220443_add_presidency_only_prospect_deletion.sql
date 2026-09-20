create or replace function public.v2_delete_prospect(organization_id uuid, prospect_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_prospect app.prospects%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (
    select 1
    from public.organization_memberships m
    where m.organization_id=$1
      and m.user_id=(select auth.uid())
      and m.active=true
      and m.is_owner=true
  ) then
    raise exception 'Only Presidency can delete prospects';
  end if;
  select * into v_prospect
  from app.prospects p
  where p.organization_id=$1 and p.id=$2
  for update;
  if not found then
    raise exception 'Prospect not found';
  end if;
  insert into app.domain_events(
    organization_id,event_type,aggregate_type,aggregate_id,payload,actor
  ) values (
    $1,'ProspectDeleted','prospect',$2,
    jsonb_build_object(
      'firstName',v_prospect.first_name,
      'lastName',v_prospect.last_name,
      'birthDate',v_prospect.birth_date,
      'status',v_prospect.status,
      'convertedPlayerId',v_prospect.converted_player_id,
      'photoBucket','tanneros-prospect-photos',
      'photoPath',v_prospect.photo_path
    ),
    (select auth.uid())::text
  );
  delete from app.prospects p where p.organization_id=$1 and p.id=$2;
  return jsonb_build_object(
    'deleted',true,
    'prospectId',$2,
    'convertedPlayerId',v_prospect.converted_player_id,
    'photoBucket','tanneros-prospect-photos',
    'photoPath',v_prospect.photo_path
  );
end
$function$;
revoke all on function public.v2_delete_prospect(uuid,uuid) from public, anon;
grant execute on function public.v2_delete_prospect(uuid,uuid) to authenticated, service_role;;
