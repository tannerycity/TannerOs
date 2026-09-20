create or replace function private.public_attach_prospect_photo(p_public_key text,p_prospect_id uuid,p_photo_path text)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog','app','private','storage'
as $$
declare v_org uuid; v_expected text;
begin
  v_org:=private.public_organization(p_public_key);
  if v_org is null then raise exception 'Registration unavailable'; end if;
  v_expected:=format('organizations/%s/prospects/%s/profile.',v_org,p_prospect_id);
  if position(v_expected in p_photo_path)<>1 or p_photo_path !~* '\.(jpg|jpeg|png|webp)$' then raise exception 'Invalid photo path'; end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='tanneros-prospect-photos' and o.name=p_photo_path) then raise exception 'Photo upload not found'; end if;
  update app.prospects set photo_path=p_photo_path,photo_uploaded_at=now(),updated_at=now()
  where id=p_prospect_id and organization_id=v_org and source='public_form' and photo_required=true and photo_path is null and created_at>=now()-interval '1 hour';
  if not found then raise exception 'Prospect not available for photo'; end if;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload)
  values(v_org,'ProspectPhotoAttached','prospect',p_prospect_id,jsonb_build_object('photoPath',p_photo_path));
  return true;
end $$;;
