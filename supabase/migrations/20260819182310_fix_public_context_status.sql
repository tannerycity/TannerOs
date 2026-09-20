create or replace function private.public_registration_context(p_public_key text)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','public','private'
as $$
declare v_org uuid; v_name text;
begin
  v_org:=private.public_organization(p_public_key);
  if v_org is null then raise exception 'Club unavailable'; end if;
  select name into v_name from public.organizations where id=v_org and status='active';
  if v_name is null then raise exception 'Club unavailable'; end if;
  return jsonb_build_object('organizationId',v_org,'organizationName',v_name);
end $$;;
