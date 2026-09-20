do $$
declare r record;
begin
  for r in
    select n.nspname,
           p.proname,
           pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.prokind='f'
      and p.proname like 'v2\_%' escape '\'
      and p.proname not like 'v2\_public\_%' escape '\'
  loop
    execute format('revoke execute on function %I.%I(%s) from PUBLIC', r.nspname,r.proname,r.args);
    execute format('revoke execute on function %I.%I(%s) from anon', r.nspname,r.proname,r.args);
    execute format('grant execute on function %I.%I(%s) to authenticated', r.nspname,r.proname,r.args);
  end loop;
end $$;;
