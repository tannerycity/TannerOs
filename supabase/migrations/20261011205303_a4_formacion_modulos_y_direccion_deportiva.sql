-- Formación Tanner · Fase 0 · 1/7: los módulos y quién los tiene (Presidencia, 11/10/2026).
--
-- "formacion": el Formador planea y cierra las sesiones de SUS categorías.
-- "formacion_direccion": Dirección Deportiva publica la Semana Tanner, aprueba
-- tareas, horarios y excepciones, y revisa cortes y trazabilidad.
--
-- No hay rol nuevo: Dirección Deportiva se da por persona con el permiso que ya
-- existe (membership_module_overrides). Brandon sigue en Operaciones.
-- Sólo el plan interno de Tannery los trae; los planes SaaS, cuando el producto
-- esté listo.
insert into public.modules(code,name,category,description,is_core,active,sort_order)
values
  ('formacion','Formación','sport','Planeación y cierre de las sesiones de entrenamiento con la metodología del club.',false,true,18),
  ('formacion_direccion','Dirección Deportiva','sport','Semana del club, banco de tareas, horarios, cortes de planeación y trazabilidad deportiva.',false,true,19)
on conflict(code) do update set name=excluded.name,category=excluded.category,description=excluded.description,active=true,sort_order=excluded.sort_order,updated_at=now();

insert into public.plan_modules(plan_id,module_code,enabled)
select pl.id, m.code, true
from public.plans pl
cross join (values('formacion'),('formacion_direccion')) as m(code)
where pl.code='internal_full'
on conflict(plan_id,module_code) do update set enabled=true;

-- Presidencia: los dos. Formadores: planear y cerrar lo suyo.
insert into public.role_module_permissions(organization_id,role,module_code,can_read,can_write)
select distinct rp.organization_id, r.role, r.module_code, true, true
from public.role_module_permissions rp
cross join (values('Presidencia','formacion'),('Presidencia','formacion_direccion'),('Formadores','formacion')) as r(role,module_code)
on conflict(organization_id,role,module_code) do update set can_read=true,can_write=true,updated_at=now();

-- Dirección Deportiva hoy: Brandon (Tannery City FC). Queda en la bitácora
-- como cualquier cambio de permisos hecho desde Usuarios.
with b as (
  select m.id, m.organization_id
  from public.organization_memberships m
  join public.organizations o on o.id=m.organization_id and o.slug='tannery-city-fc'
  join auth.users u on u.id=m.user_id and lower(split_part(u.email,'@',1))='brandon'
  where m.active=true and not m.is_owner
), ins as (
  insert into private.membership_module_overrides(organization_id,membership_id,module_code,can_read,can_write,updated_at,updated_by_user_id)
  select b.organization_id, b.id, x.code, true, true, now(), null
  from b cross join (values('formacion'),('formacion_direccion')) as x(code)
  on conflict(organization_id,membership_id,module_code) do update set can_read=true,can_write=true,updated_at=now()
  returning organization_id, membership_id, module_code
)
insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
select organization_id,'MembershipModuleAccessChanged','membership',membership_id,
       jsonb_build_object('moduleCode',module_code,'canRead',true,'canWrite',true,'inheritRole',false,'reason','Dirección Deportiva (Presidencia, 11/10/2026)'),
       null
from ins;
