insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'tanneros-private',
  'tanneros-private',
  false,
  15728640,
  array['image/jpeg','image/png','image/webp','application/pdf']::text[]
)
on conflict (id) do update set
  public=excluded.public,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create or replace function private.storage_org_id(p_name text)
returns uuid
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  parts text[];
begin
  parts := string_to_array(p_name,'/');
  if coalesce(array_length(parts,1),0) < 3 or parts[1] <> 'organizations' then
    return null;
  end if;
  begin
    return parts[2]::uuid;
  exception when others then
    return null;
  end;
end
$$;

create or replace function private.storage_module_code(p_name text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case (string_to_array(p_name,'/'))[3]
    when 'players' then 'players'
    when 'guardians' then 'players'
    when 'billing' then 'billing'
    when 'accounting' then 'accounting'
    when 'academies' then 'academies'
    when 'attendance' then 'attendance'
    when 'programs' then 'programs'
    when 'commerce' then 'commerce'
    when 'prospects' then 'prospects'
    when 'scouting' then 'scouting'
    when 'sponsors' then 'sponsors'
    when 'equipment' then 'equipment'
    when 'admin' then 'admin'
    else null end
$$;

revoke all on function private.storage_org_id(text) from public;
revoke all on function private.storage_module_code(text) from public;
grant execute on function private.storage_org_id(text), private.storage_module_code(text) to authenticated, service_role;

drop policy if exists tanneros_private_read on storage.objects;
drop policy if exists tanneros_private_insert on storage.objects;
drop policy if exists tanneros_private_update on storage.objects;
drop policy if exists tanneros_private_delete on storage.objects;

create policy tanneros_private_read
on storage.objects for select to authenticated
using (
  bucket_id='tanneros-private'
  and private.storage_org_id(name) is not null
  and private.storage_module_code(name) is not null
  and (select private.has_module_access(private.storage_org_id(name),private.storage_module_code(name),false))
);

create policy tanneros_private_insert
on storage.objects for insert to authenticated
with check (
  bucket_id='tanneros-private'
  and private.storage_org_id(name) is not null
  and private.storage_module_code(name) is not null
  and (select private.has_module_access(private.storage_org_id(name),private.storage_module_code(name),true))
);

create policy tanneros_private_update
on storage.objects for update to authenticated
using (
  bucket_id='tanneros-private'
  and private.storage_org_id(name) is not null
  and private.storage_module_code(name) is not null
  and (select private.has_module_access(private.storage_org_id(name),private.storage_module_code(name),true))
)
with check (
  bucket_id='tanneros-private'
  and private.storage_org_id(name) is not null
  and private.storage_module_code(name) is not null
  and (select private.has_module_access(private.storage_org_id(name),private.storage_module_code(name),true))
);

create policy tanneros_private_delete
on storage.objects for delete to authenticated
using (
  bucket_id='tanneros-private'
  and private.storage_org_id(name) is not null
  and private.storage_module_code(name) is not null
  and (select private.has_module_access(private.storage_org_id(name),private.storage_module_code(name),true))
);

comment on function private.storage_org_id(text) is 'Parses canonical organizations/<org_uuid>/... Storage paths.';;
