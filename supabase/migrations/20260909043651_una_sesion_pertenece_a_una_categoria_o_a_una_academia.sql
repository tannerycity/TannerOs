-- Este CHECK se puso para que ningún entrenamiento del club quedara sin categoría
-- (era la causa de las listas vacías en Asistencia). Pero una sesión de academia no
-- tiene categoría: pertenece a la academia. La regla real es que tenga UNA de las dos,
-- porque de ahí sale a quién se le pasa lista.
alter table app.sessions drop constraint if exists sessions_categoria_obligatoria_en_entrenamientos;
alter table app.sessions add constraint sessions_pertenece_a_categoria_o_academia
  check (
    session_type <> all (array['training','academy','evaluation'])
    or category_id is not null
    or academy_id is not null
  );;
