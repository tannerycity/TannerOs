-- El entrenador de categoría no opera academias.
--
-- is_academy_admin() = presidencia OR escritura en 'academias'. Formadores
-- tenía can_write=true, así que cualquier entrenador de categoría entraba como
-- administrador de academias: veía todas, con cuota, precio por día, staff,
-- inscritos y cobros — justo lo que el candado por academia asignada cerró
-- para el rol Academia.
--
-- Hoy nadie tiene el rol Formadores, así que no hubo fuga; se cierra antes de
-- que la haya. Queda con lectura, igual que Contabilidad: puede saber que la
-- academia existe, no administrarla. Si algún día un entrenador da clase en
-- una academia, el camino correcto es el rol Academia con su asignación, no un
-- permiso global sobre todas.
update public.role_module_permissions
   set can_write=false, updated_at=now()
 where module_code='academias' and role='Formadores' and can_write;
;
