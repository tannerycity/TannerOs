CREATE OR REPLACE FUNCTION public.v2_scouting_photos(organization_id uuid)
RETURNS TABLE(report_id uuid, photo_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
begin
  if not private.has_module_access($1, 'scouting', false) then
    raise exception 'Not authorized';
  end if;
  return query
  select sr.id, sr.metadata->>'photoPath'
  from app.scouting_reports sr
  where sr.organization_id=$1
    and nullif(sr.metadata->>'photoPath','') is not null;
end
$function$;

CREATE OR REPLACE FUNCTION public.v2_set_scouting_photo(organization_id uuid, report_id uuid, photo_path text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_parts text[];
  v_old_path text;
  v_result jsonb;
begin
  if not private.has_module_access($1, 'scouting', true) then
    raise exception 'Not authorized';
  end if;
  v_parts := string_to_array(coalesce($3, ''), '/');
  if coalesce(array_length(v_parts, 1), 0) <> 5
     or v_parts[1] <> 'organizations'
     or v_parts[2] <> $1::text
     or v_parts[3] <> 'scouting'
     or v_parts[4] <> $2::text
     or v_parts[5] !~* '^profile-[0-9]{10,16}\.(jpg|jpeg|png|webp)$'
  then
    raise exception 'Invalid photo path';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id='tanneros-private' and o.name=$3
  ) then
    raise exception 'Photo upload not found';
  end if;
  select sr.metadata->>'photoPath'
    into v_old_path
  from app.scouting_reports sr
  where sr.id=$2 and sr.organization_id=$1
  for update;
  if not found then
    raise exception 'Scouting report not found';
  end if;
  update app.scouting_reports sr
     set metadata=coalesce(sr.metadata,'{}'::jsonb) ||
       jsonb_build_object('photoBucket','tanneros-private','photoPath',$3),
         updated_at=now()
   where sr.id=$2 and sr.organization_id=$1
   returning sr.metadata into v_result;
  insert into app.domain_events(
    organization_id,event_type,aggregate_type,aggregate_id,payload,actor
  ) values (
    $1,'ScoutingPhotoUpdated','scouting_report',$2,
    jsonb_build_object('photoBucket','tanneros-private','photoPath',$3,'previousPhotoPath',v_old_path),
    coalesce((select auth.uid())::text,'system')
  );
  return v_result;
end
$function$;

REVOKE ALL ON FUNCTION public.v2_scouting_photos(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.v2_set_scouting_photo(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.v2_scouting_photos(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.v2_set_scouting_photo(uuid,uuid,text) TO authenticated, service_role;;
