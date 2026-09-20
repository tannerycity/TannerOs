do $migration$
declare v text;
begin
  select pg_get_functiondef(p.oid) into v
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname='query_global_search' and p.prokind='f' limit 1;
  v:=replace(v,'/v2/jugadores/','/jugadores/');
  v:=replace(v,'/v2/prospectos/','/prospectos/');
  v:=replace(v,'/v2/pedidos/','/pedidos/');
  v:=replace(v,'/v2/patrocinadores/','/patrocinadores/');
  v:=replace(v,'/v2/programas/','/operacion/programas/');
  v:=replace(v,'/v2/calendario/','/calendario/');
  v:=replace(v,'/v2/deportivo/','/deportivo/');
  v:=replace(v,'/v2/academias/','/academias/');
  execute v;

  select pg_get_functiondef(p.oid) into v
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname='query_onboarding_readiness' and p.prokind='f' limit 1;
  v:=replace(v,'/v2/admin/club/','/admin/club/');
  v:=replace(v,'/v2/modulos/','/modulos/');
  v:=replace(v,'/v2/admin/branding/','/admin/branding/');
  v:=replace(v,'/v2/usuarios/','/usuarios/');
  v:=replace(v,'/v2/jugadores/','/jugadores/');
  v:=replace(v,'/v2/finanzas/','/finanzas/');
  v:=replace(v,'/v2/admin/onboarding/','/admin/onboarding/');
  execute v;
end
$migration$;;
