-- Archivar los avisos de la muestra
--
-- Presidencia pidió (05/10/2026) quitar los 31 avisos viejos: 29 copias
-- diarias de "Seguimiento de patrocinio: Don Trapo" más "Hola" y "Prueba".
-- Se ARCHIVAN en vez de borrarse: desaparecen de Mensajes, de la campana y
-- del contador (todas las consultas filtran archived_at is null), pero se
-- pueden recuperar. El recordatorio real de Don Trapo (cobro de $7,500) sigue
-- en Patrocinadores; desde k2 el barrido avisa una vez por vencimiento.
--
-- REVERSIBLE: update app.announcements set archived_at = null where ... .
update app.announcements
   set archived_at = now()
 where organization_id = '3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8'
   and archived_at is null
   and published_at < '2026-10-05 05:00:00+00'
   and (source = 'sponsor_reminder' or title in ('Hola','Prueba'));