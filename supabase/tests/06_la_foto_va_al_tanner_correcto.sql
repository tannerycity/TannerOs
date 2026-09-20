-- Prueba 6 de docs/auditoria/06 · INVARIANTE · SÓLO LECTURA
--
-- El daño que evita: subir una foto con dos fichas abiertas y que termine en el
-- Tanner equivocado. Para una familia es de lo peor que puede pasar.
--
-- El invariante: dos Tanners no pueden apuntar al mismo archivo. Las rutas
-- llevan el id del jugador y un `Date.now()`, así que compartir ruta sólo puede
-- venir de que una ficha escribió sobre la otra.
--
-- También revisa que la miniatura pertenezca a su original: una miniatura que
-- apunta a la carpeta de otro Tanner es el mismo error, más difícil de ver.

do $$
declare
  v_fotos_repetidas int; v_minis_repetidas int; v_minis_cruzadas int;
  v_revisados int; v_detalle text;
begin
  select count(*) into v_revisados from app.players where photo_path is not null;
  if v_revisados = 0 then
    raise exception 'PRUEBA FALLÓ: ningún Tanner tiene foto; el invariante no probó nada';
  end if;

  select count(*) into v_fotos_repetidas from (
    select photo_path from app.players where photo_path is not null
    group by photo_path having count(*) > 1) t;

  select count(*) into v_minis_repetidas from (
    select photo_thumb_path from app.players where photo_thumb_path is not null
    group by photo_thumb_path having count(*) > 1) t;

  -- La miniatura vive en la misma carpeta que su original.
  select count(*) into v_minis_cruzadas
  from app.players
  where photo_thumb_path is not null and photo_path is not null
    and left(photo_thumb_path, length(photo_thumb_path) - position('/' in reverse(photo_thumb_path)))
     <> left(photo_path, length(photo_path) - position('/' in reverse(photo_path)));

  if v_fotos_repetidas > 0 or v_minis_repetidas > 0 or v_minis_cruzadas > 0 then
    select string_agg(format('%s → %s', coalesce(first_name||' '||last_name,'?'), photo_path), ' · ')
      into v_detalle
    from app.players
    where photo_path in (select photo_path from app.players
                         where photo_path is not null group by photo_path having count(*) > 1);
    raise exception 'PRUEBA FALLÓ: % foto(s) compartida(s), % miniatura(s) compartida(s), % miniatura(s) en la carpeta de otro. %',
      v_fotos_repetidas, v_minis_repetidas, v_minis_cruzadas, coalesce(v_detalle,'');
  end if;

  raise notice 'PRUEBA OK · 06 · % Tanners con foto, cada archivo de un solo dueño', v_revisados;
end $$;
