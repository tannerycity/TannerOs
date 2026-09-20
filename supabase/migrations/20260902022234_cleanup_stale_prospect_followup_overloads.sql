-- CREATE OR REPLACE con un parametro nuevo no reemplaza la funcion vieja (distinta firma),
-- crea un OVERLOAD extra. Quedaron dos versiones de estas dos funciones (5 args vieja,
-- 6 args nueva) -- la vieja sigue viva y evade la validacion de motivo de perdida. Se limpia.
drop function private.command_upsert_prospect_followup(uuid, uuid, text, timestamp with time zone, text);
drop function public.v2_update_prospect_followup(uuid, uuid, text, timestamp with time zone, text);
;
