-- Allow Edge Functions using service_role to access the private migration schema through PostgREST.
-- Client roles remain explicitly denied.

revoke all on schema migration from anon, authenticated;
revoke all on all tables in schema migration from anon, authenticated;
revoke all on all sequences in schema migration from anon, authenticated;
revoke all on all routines in schema migration from anon, authenticated;

grant usage on schema migration to service_role;
grant select, insert, update, delete on all tables in schema migration to service_role;
grant usage, select on all sequences in schema migration to service_role;
grant execute on all routines in schema migration to service_role;

alter default privileges for role postgres in schema migration grant select, insert, update, delete on tables to service_role;
alter default privileges for role postgres in schema migration grant usage, select on sequences to service_role;
alter default privileges for role postgres in schema migration grant execute on routines to service_role;

alter role authenticator set pgrst.db_schemas = 'public,graphql_public,migration';
notify pgrst, 'reload config';;
