-- Elimina definitivamente las evaluaciones de prueba anteriores a TC 1.0.
-- Producto confirmó que no son historial válido y no deben conservarse.
begin;

do $$
begin
  if to_regclass('app.player_evaluations') is null then
    raise exception 'No existe app.player_evaluations; no se eliminó ningún dato';
  end if;
end $$;

delete from app.player_evaluations
where coalesce(notes, '') not like '[TC_1.0] %';

do $$
begin
  if exists (
    select 1 from app.player_evaluations
    where coalesce(notes, '') not like '[TC_1.0] %'
  ) then
    raise exception 'Quedaron evaluaciones legacy; se revierte la limpieza';
  end if;
end $$;

commit;
