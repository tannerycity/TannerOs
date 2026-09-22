-- El VIP cuesta lo mismo que el Tanner Pass: lo que cambia entre los dos es a
-- quién se le da y dónde se estaciona, no el precio. Cuando el club no cobra
-- por uno, eso pasa por el botón de Cortesía, que exige motivo y queda en la
-- bitácora — no por un precio en cero, que no dejaría rastro de quién lo regaló.
--
-- El case se queda aunque hoy las dos ramas den lo mismo: es el único lugar donde
-- se pondría un precio distinto y así el cambio es de una línea.
create or replace function app.parking_pass_price(p_type text default 'tanner')
returns numeric
language sql
immutable
as $function$
  select case lower(coalesce(nullif(btrim(p_type),''),'tanner'))
    when 'vip' then 200::numeric
    else 200::numeric
  end
$function$;

comment on function app.parking_pass_price(text) is
  'Precio del gafete por tipo. VIP y Tanner Pass cuestan lo mismo por decisión del club (sep 2026); un pase sin costo se autoriza como cortesía, que sí deja motivo y bitácora.';;
