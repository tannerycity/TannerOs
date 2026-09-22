-- Añade 'estacionamiento' al arreglo de módulos que autoriza cada RPC de gafetes.
-- Es aditivo: quien ya entraba por players/billing/accounting sigue entrando.
do $$
declare r record; v_def text; v_new text; v_n int:=0;
begin
  for r in
    select p.oid, p.proname, pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.proname like '%parking%'
  loop
    v_def := r.def;
    if v_def !~ 'has_any_module_access\s*\(\s*p_organization_id\s*,\s*array\[' then continue; end if;
    if v_def ~ 'array\[\s*''estacionamiento''' then continue; end if;
    v_new := regexp_replace(
      v_def,
      '(has_any_module_access\s*\(\s*p_organization_id\s*,\s*array\[)',
      '\1''estacionamiento'', ',
      'g');
    if v_new = v_def then continue; end if;
    execute v_new;
    v_n := v_n + 1;
  end loop;
  raise notice 'RPC de gafetes actualizados: %', v_n;
  if v_n = 0 then raise exception 'No se actualizó ningún RPC de gafetes; revisar el patrón'; end if;
end $$;;
