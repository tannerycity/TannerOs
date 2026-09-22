-- Retira del perfil activo las evaluaciones de prueba anteriores a TC 1.0.
-- Se archivan primero para que una operación destructiva conserve trazabilidad.
begin;

do $$
begin
  if to_regclass('app.player_evaluations') is null then
    raise exception 'No existe app.player_evaluations; no se eliminó ningún dato';
  end if;
end $$;

create table if not exists app.player_evaluations_legacy_archive_20260913
as table app.player_evaluations with no data;

comment on table app.player_evaluations_legacy_archive_20260913 is
  'Respaldo de evaluaciones de prueba retiradas al activar TC_1.0 el 2026-09-13';

insert into app.player_evaluations_legacy_archive_20260913
select * from app.player_evaluations
where coalesce(notes, '') not like '[TC_1.0] %';

delete from app.player_evaluations
where coalesce(notes, '') not like '[TC_1.0] %';

do $$
begin
  if exists (
    select 1 from app.player_evaluations
    where coalesce(notes, '') not like '[TC_1.0] %'
  ) then
    raise exception 'Quedaron evaluaciones anteriores a TC_1.0; se revierte la limpieza';
  end if;
end $$;

commit;
