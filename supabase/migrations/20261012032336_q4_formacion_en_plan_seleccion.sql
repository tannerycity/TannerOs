-- Formación Tanner entra al plan Selección (el más completo). Así los clubes
-- que lo contratan, y la demo pública, la ven: es de lo que más se enseña.
insert into public.plan_modules(plan_id, module_code, enabled)
select p.id, m.code, true from public.plans p cross join (values ('formacion'), ('formacion_direccion')) m(code)
where p.code = 'seleccion'
on conflict do nothing;
