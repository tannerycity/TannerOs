drop policy if exists __debug_policy4b on public.__debug_rls_test4;
create policy __debug_policy4b on public.__debug_rls_test4 for insert to authenticated with check (true);
grant insert on public.__debug_rls_test4 to authenticated;;
