create table if not exists public.__debug_rls_test4(name text);
alter table public.__debug_rls_test4 enable row level security;
drop policy if exists __debug_policy4 on public.__debug_rls_test4;
create policy __debug_policy4 on public.__debug_rls_test4 for insert to anon with check (true);
grant insert on public.__debug_rls_test4 to anon;;
