create or replace function private.current_auth_email()
returns text
language sql
stable
security definer
set search_path=pg_catalog
as $$ select lower(coalesce((select auth.jwt())->>'email','')) $$;
revoke all on function private.current_auth_email() from public,anon;
grant execute on function private.current_auth_email() to authenticated,service_role;

drop policy if exists v2_org_invites_read on app.organization_invitations;
create policy v2_org_invites_read on app.organization_invitations for select to authenticated
using ((select private.can_manage_users(organization_id)) or lower(email)=(select private.current_auth_email()));

-- Billing policy: one SELECT policy, separate mutation policies to avoid duplicate permissive SELECT evaluation.
drop policy if exists v2_billing_policies_read on app.billing_policies;
drop policy if exists v2_billing_policies_write on app.billing_policies;
drop policy if exists v2_billing_policies_insert on app.billing_policies;
drop policy if exists v2_billing_policies_update on app.billing_policies;
drop policy if exists v2_billing_policies_delete on app.billing_policies;
create policy v2_billing_policies_read on app.billing_policies for select to authenticated
using ((select private.has_any_module_access(organization_id,array['billing','accounting'],false)));
create policy v2_billing_policies_insert on app.billing_policies for insert to authenticated
with check ((select private.has_module_access(organization_id,'admin',true)));
create policy v2_billing_policies_update on app.billing_policies for update to authenticated
using ((select private.has_module_access(organization_id,'admin',true)))
with check ((select private.has_module_access(organization_id,'admin',true)));
create policy v2_billing_policies_delete on app.billing_policies for delete to authenticated
using ((select private.has_module_access(organization_id,'admin',true)));

-- Membership reads: combine self + administrator in a single permissive policy.
drop policy if exists memberships_self_read on public.organization_memberships;
drop policy if exists memberships_admin_read on public.organization_memberships;
drop policy if exists memberships_read on public.organization_memberships;
create policy memberships_read on public.organization_memberships for select to authenticated
using (((select auth.uid())=user_id and active=true) or (select private.can_manage_users(organization_id)));;
