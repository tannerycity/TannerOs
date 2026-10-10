-- Captación en todos los planes.
-- La prueba de punta a punta del portal (10/10/2026) encontró que un club
-- Cantera o Primera no podía dar de alta ni un jugador: los jugadores entran
-- por el registro público y Captación (prospecto -> jugador), y ese módulo sólo
-- venía en Selección. El registro respondía "Registration unavailable".
insert into public.plan_modules (plan_id, module_code, enabled, limits)
select p.id, 'prospectos', true, '{}'::jsonb
from public.plans p
where p.code in ('cantera', 'primera')
on conflict (plan_id, module_code) do update set enabled = true;