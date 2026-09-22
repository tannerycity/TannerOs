begin;

drop trigger if exists on_auth_user_created on auth.users;

drop table if exists public.guardian_access cascade;
drop table if exists public.guardians cascade;
drop table if exists public.players cascade;
drop table if exists public.profiles cascade;

drop function if exists public.resolve_guardian_token(text) cascade;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.admin_exists() cascade;
drop function if exists public.is_admin() cascade;
drop function if exists public.is_staff() cascade;

drop type if exists public.app_role cascade;

commit;;
