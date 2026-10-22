-- h36 · La hoja de producción trae la foto de cada prenda (22/10/2026).
--
-- Presidencia, sobre el PDF del corte: "estaría más interesante que saliera
-- la playera y salieran los pedidos que hay de esa playera... lo tiene que
-- entender cualquier persona que vea este corte (pespuntadores, toda la línea
-- de producción)". El PDF nuevo abre cada prenda con su foto del catálogo:
-- cada pieza de la hoja trae la ruta de la miniatura y su bucket. La foto se
-- firma en el navegador como en el resto de la app (tanneros-private).

do $do$
declare d text;
begin
  d := pg_get_functiondef('private.query_production_batch_sheet(uuid,uuid)'::regprocedure);
  if position('photoPath' in d) = 0 then
    d := replace(d, '''productName'', nullif(p.name,'''')',
      '''productName'', nullif(p.name,''''), ''photoPath'', coalesce(p.photo_thumb_path, p.photo_path), ''photoBucket'', p.photo_bucket');
    if position('photoPath' in d) = 0 then raise exception 'h36: no se pudo agregar la foto a la hoja'; end if;
    execute d;
  end if;
end $do$;
