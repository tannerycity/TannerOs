create or replace function private.storage_player_id(p_name text)
returns uuid
language plpgsql
immutable
set search_path='pg_catalog'
as $$
declare
  v_parts text[];
begin
  v_parts:=string_to_array(p_name,'/');
  if coalesce(array_length(v_parts,1),0)<5
    or v_parts[1]<>'organizations'
    or v_parts[3]<>'players' then
    return null;
  end if;
  begin
    return v_parts[4]::uuid;
  exception when others then
    return null;
  end;
end
$$;

create or replace function private.can_read_family_player_photo(
  p_organization_id uuid,
  p_player_id uuid
)
returns boolean
language sql
stable
security definer
set search_path='pg_catalog','public','app'
as $$
  select (select auth.uid()) is not null
    and exists(
      select 1
      from public.organization_memberships m
      where m.organization_id=p_organization_id
        and m.user_id=(select auth.uid())
        and m.active=true
        and m.role='Tanner'
    )
    and exists(
      select 1
      from app.user_player_access upa
      where upa.organization_id=p_organization_id
        and upa.user_id=(select auth.uid())
        and upa.player_id=p_player_id
        and upa.access_kind='family'
    )
$$;

revoke all on function private.can_read_family_player_photo(uuid,uuid) from public,anon;
grant execute on function private.can_read_family_player_photo(uuid,uuid) to authenticated,service_role;

drop policy if exists tanneros_family_player_photo_read on storage.objects;
create policy tanneros_family_player_photo_read
on storage.objects
for select
to authenticated
using (
  bucket_id='tanneros-private'
  and private.storage_org_id(name) is not null
  and private.storage_player_id(name) is not null
  and private.can_read_family_player_photo(
    private.storage_org_id(name),
    private.storage_player_id(name)
  )
);
;
