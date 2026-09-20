create or replace function public.v2_create_invitation(organization_id uuid,email text,role_code text)
returns uuid language plpgsql security definer set search_path='pg_catalog','private' as $$
begin
  return private.command_create_invitation(organization_id,email,role_code);
end $$;
revoke all on function public.v2_create_invitation(uuid,text,text) from public,anon;
grant execute on function public.v2_create_invitation(uuid,text,text) to authenticated;;
