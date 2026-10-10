-- El código del jugador con el vocabulario del club.
-- next_player_code devolvía 'Tanner001' para cualquier club. Ahora el prefijo
-- sale de cómo le dice el club a sus jugadores (branding.playerNoun): Tannery
-- sigue con Tanner010, un club nuevo empieza con Jugador001.
create or replace function private.next_player_code(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare v_next integer; v_prefix text;
begin
  v_prefix := regexp_replace(
                translate(coalesce(private.normalized_branding(p_organization_id)#>>'{playerNoun,singular}', 'Jugador'),
                          'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'),
                '[^A-Za-z0-9]', '', 'g');
  if length(v_prefix) < 2 then v_prefix := 'Jugador'; end if;
  select coalesce(max((regexp_match(code, '^' || v_prefix || '([0-9]+)$'))[1]::integer), 0) + 1
    into v_next
  from app.players
  where organization_id = p_organization_id and code ~ ('^' || v_prefix || '[0-9]+$');
  return v_prefix || lpad(v_next::text, 3, '0');
end $function$;