drop policy if exists organizations_member_read on public.organizations;
create policy organizations_member_read
on public.organizations
for select
to authenticated
using (private.is_active_member(id));

comment on policy organizations_member_read on public.organizations is 'Authenticated users may read only organizations where they hold an active membership.';;
