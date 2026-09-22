-- Antes de tener módulo propio, los RPC de gafetes se abrían con players/billing/accounting,
-- así que Contabilidad y Taquilla ya podían operarlos. Al volverlo módulo, la pantalla exige
-- el permiso 'estacionamiento': si no se otorga a esos roles, se les cierra algo que ya usaban.
insert into public.role_module_permissions(organization_id,role,module_code,can_read,can_write)
select distinct rp.organization_id, r.role, 'estacionamiento', true, true
from public.role_module_permissions rp
cross join (values('Contabilidad'),('Taquilla')) as r(role)
on conflict(organization_id,role,module_code) do update set can_read=true,can_write=true,updated_at=now();;
