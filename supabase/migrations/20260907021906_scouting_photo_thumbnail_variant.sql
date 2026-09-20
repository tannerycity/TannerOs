drop function if exists public.v2_set_scouting_photo(uuid, uuid, text);
drop function if exists public.v2_scouting_photos(uuid);

create function public.v2_set_scouting_photo(organization_id uuid, report_id uuid, photo_path text, photo_thumb_path text default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_parts text[];
  v_thumb_parts text[];
  v_old_path text;
  v_old_thumb_path text;
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
  if $4 is not null then
    v_thumb_parts := string_to_array($4, '/');
    if coalesce(array_length(v_thumb_parts, 1), 0) <> 5
       or v_thumb_parts[1] <> 'organizations'
       or v_thumb_parts[2] <> $1::text
       or v_thumb_parts[3] <> 'scouting'
       or v_thumb_parts[4] <> $2::text
       or v_thumb_parts[5] !~* '^profile-[0-9]{10,16}-thumb\.(jpg|jpeg|png|webp)$'
    then
      raise exception 'Invalid photo path';
    end if;
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id='tanneros-private' and o.name=$3
  ) then
    raise exception 'Photo upload not found';
  end if;
  if $4 is not null and not exists (
    select 1 from storage.objects o
    where o.bucket_id='tanneros-private' and o.name=$4
  ) then
    raise exception 'Photo upload not found';
  end if;
  select sr.metadata->>'photoPath', sr.metadata->>'photoThumbPath'
    into v_old_path, v_old_thumb_path
  from app.scouting_reports sr
  where sr.id=$2 and sr.organization_id=$1
  for update;
  if not found then
    raise exception 'Scouting report not found';
  end if;
  update app.scouting_reports sr
     set metadata=coalesce(sr.metadata,'{}'::jsonb) ||
       jsonb_build_object('photoBucket','tanneros-private','photoPath',$3,'photoThumbPath',$4),
         updated_at=now()
   where sr.id=$2 and sr.organization_id=$1
   returning sr.metadata into v_result;
  insert into app.domain_events(
    organization_id,event_type,aggregate_type,aggregate_id,payload,actor
  ) values (
    $1,'ScoutingPhotoUpdated','scouting_report',$2,
    jsonb_build_object('photoBucket','tanneros-private','photoPath',$3,'photoThumbPath',$4,'previousPhotoPath',v_old_path,'previousPhotoThumbPath',v_old_thumb_path),
    coalesce((select auth.uid())::text,'system')
  );
  return v_result;
end
$function$;

create function public.v2_scouting_photos(organization_id uuid)
returns table(report_id uuid, photo_path text, photo_thumb_path text)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not private.has_module_access($1, 'scouting', false) then
    raise exception 'Not authorized';
  end if;
  return query
  select sr.id, sr.metadata->>'photoPath', sr.metadata->>'photoThumbPath'
  from app.scouting_reports sr
  where sr.organization_id=$1
    and nullif(sr.metadata->>'photoPath','') is not null;
end
$function$;

revoke all on function public.v2_set_scouting_photo(uuid,uuid,text,text) from public, anon;
revoke all on function public.v2_scouting_photos(uuid) from public, anon;
grant execute on function public.v2_set_scouting_photo(uuid,uuid,text,text) to authenticated;
grant execute on function public.v2_scouting_photos(uuid) to authenticated;
;
