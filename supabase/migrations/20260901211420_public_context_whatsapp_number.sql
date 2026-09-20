-- Exposes an org-configurable WhatsApp contact number (stored in organizations.settings,
-- no schema change) to the public registration form, instead of hardcoding it per page.
create or replace function private.public_registration_context(p_public_key text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare v_org uuid; v_name text; v_whatsapp text;
begin
  v_org:=private.public_organization(p_public_key);
  if v_org is null then raise exception 'Club unavailable'; end if;
  select name, settings->>'whatsappNumber' into v_name, v_whatsapp from public.organizations where id=v_org and status='active';
  if v_name is null then raise exception 'Club unavailable'; end if;
  return jsonb_build_object('organizationId',v_org,'organizationName',v_name,'whatsappNumber',v_whatsapp);
end $function$;

-- Seed Tannery City's WhatsApp contact number (org-level setting, not hardcoded in frontend).
update public.organizations
set settings = settings || jsonb_build_object('whatsappNumber','524792651338')
where id = '3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8';
;
