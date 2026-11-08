-- h67 · Premio por puntualidad en el Portal de Familias (08/11/2026)
--
-- Fase 4 de la gamificación: el papá ve cómo va ("7 de 11 meses a tiempo, vas
-- por 50% en diciembre"). Misma regla que h64 (private.punctuality_status) y
-- la misma puerta que el resto del portal: sólo a sus propios hijos
-- (private.portal_owns_player).

create or replace function public.v2_portal_punctuality(player_id uuid)
returns jsonb language plpgsql stable security definer set search_path to ''
as $$
declare v_org uuid; v jsonb;
begin
  if not private.portal_owns_player(v2_portal_punctuality.player_id) then raise exception 'Not authorized'; end if;
  select p.organization_id into v_org from app.players p where p.id = v2_portal_punctuality.player_id;
  v := private.punctuality_status(v_org, v2_portal_punctuality.player_id,
         extract(year from (now() at time zone 'America/Mexico_City'))::integer);
  return jsonb_build_object('year', v->'year', 'months', v->'months', 'kit', v->'kit', 'december', v->'december');
end $$;

revoke all on function public.v2_portal_punctuality(uuid) from public, anon;
grant execute on function public.v2_portal_punctuality(uuid) to authenticated;
