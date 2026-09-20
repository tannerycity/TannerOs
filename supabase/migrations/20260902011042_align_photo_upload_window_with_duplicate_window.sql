create or replace function private.public_prospect_photo_upload_allowed(p_name text)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog', 'app'
as $function$
declare v_org uuid; v_prospect uuid;
begin
  if p_name !~* '^organizations/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/prospects/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/profile\.(jpg|jpeg|png|webp)$' then return false; end if;
  v_org:=split_part(p_name,'/',2)::uuid;
  v_prospect:=split_part(p_name,'/',4)::uuid;
  return exists(
    select 1 from app.prospects p
    where p.id=v_prospect and p.organization_id=v_org and p.source='public_form'
      and p.photo_required=true and p.photo_path is null and p.created_at >= now()-interval '24 hours'
  );
exception when others then return false;
end $function$;

create or replace function private.public_program_photo_upload_allowed(p_name text)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog', 'app'
as $function$
declare v_org uuid;v_program uuid;v_enrollment uuid;
begin
  if p_name !~* '^organizations/[0-9a-f-]{36}/programs/[0-9a-f-]{36}/[0-9a-f-]{36}/profile\.(jpg|jpeg|png|webp)$' then return false; end if;
  v_org:=split_part(p_name,'/',2)::uuid;v_program:=split_part(p_name,'/',4)::uuid;v_enrollment:=split_part(p_name,'/',5)::uuid;
  return exists(
    select 1 from app.program_enrollments e
    where e.organization_id=v_org and e.program_id=v_program and e.id=v_enrollment
      and e.created_at>=now()-interval '24 hours' and nullif(e.metadata->>'photoPath','') is null
  );
exception when others then return false;
end $function$;;
