-- CREATE OR REPLACE con parámetros nuevos al final crea un overload aparte
-- en vez de reemplazar la función — limpiamos las firmas viejas para no
-- dejar dos versiones vivas de la misma función.
drop function if exists private.command_upsert_equipment_item(uuid,uuid,text,text,text,integer,integer,numeric,text,text,text);
drop function if exists public.v2_upsert_equipment_item(uuid,uuid,text,text,text,integer,integer,numeric,text,text,text);
drop function if exists private.command_assign_equipment(uuid,uuid,uuid,text,integer,text);
drop function if exists public.v2_assign_equipment(uuid,uuid,uuid,text,integer,text);
;
