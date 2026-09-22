-- Estacionamiento deja de ser una tarjeta escondida en Finanzas y pasa a ser un módulo
-- con su propio permiso, para que aparezca en la barra lateral de Presidencia.
insert into public.modules(code,name,category,description,is_core,active,sort_order)
values('estacionamiento','Estacionamiento','operations','Padrón de gafetes de estacionamiento: solicitudes, asignación y vigencia.',false,true,72)
on conflict(code) do update set name=excluded.name,category=excluded.category,description=excluded.description,active=true,sort_order=excluded.sort_order,updated_at=now();

-- Habilitado en el plan interno del club.
insert into public.plan_modules(plan_id,module_code,enabled)
select pl.id,'estacionamiento',true from public.plans pl where pl.active=true
on conflict(plan_id,module_code) do update set enabled=true;

-- Solo quien ya podía autorizar gafetes. Coincide con el gate real de los RPC
-- (players/billing/accounting), así que nadie ve un módulo que luego le va a dar error.
insert into public.role_module_permissions(organization_id,role,module_code,can_read,can_write)
select distinct rp.organization_id, r.role, 'estacionamiento', true, true
from public.role_module_permissions rp
cross join (values('Presidencia'),('Operaciones')) as r(role)
on conflict(organization_id,role,module_code) do update set can_read=true,can_write=true,updated_at=now();

-- El módulo nuevo se suma al gate existente: quien ya entraba sigue entrando,
-- y ahora el permiso 'estacionamiento' también abre la puerta.
do $$
declare r record; v_def text;
begin
  for r in
    select p.oid, p.proname
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private'
      and p.proname like '%parking%'
      and pg_get_functiondef(p.oid) like '%array[''players'', ''billing'', ''accounting'']%'
  loop
    v_def := replace(pg_get_functiondef(r.oid),
                     'array[''players'', ''billing'', ''accounting'']',
                     'array[''estacionamiento'', ''players'', ''billing'', ''accounting'']');
    execute v_def;
    raise notice 'gate actualizado: %', r.proname;
  end loop;
end $$;;
