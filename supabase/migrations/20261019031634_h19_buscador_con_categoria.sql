-- Buscador (auditoría 19/10/2026): buscar "T10" no encontraba a nadie porque
-- el índice no traía la categoría. Se agrega 'category'. Los teléfonos de
-- varios tutores ahora van separados por coma (antes por espacio, y el
-- buscador no podía saber dónde terminaba uno y empezaba el otro).
create or replace function public.v2_search_index(organization_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog', 'public', 'app', 'private'
as $function$
declare v jsonb;
begin
  if not private.is_active_member(v2_search_index.organization_id) then raise exception 'Not authorized'; end if;
  select coalesce(jsonb_agg(x order by x->>'name'),'[]'::jsonb) into v from (
    select jsonb_build_object(
      'id', p.id,
      'name', trim(concat_ws(' ', p.first_name, p.last_name)),
      'jersey', p.jersey_number,
      'pos', p.position,
      'category', nullif(btrim(p.category), ''),
      'guardians', (select string_agg(trim(concat_ws(' ', g.first_name, g.last_name)), ', ')
                    from app.player_guardians pg join app.guardians g on g.id=pg.guardian_id
                    where pg.player_id=p.id),
      'phones', (select string_agg(btrim(g.phone), ', ')
                 from app.player_guardians pg join app.guardians g on g.id=pg.guardian_id
                 where pg.player_id=p.id and nullif(trim(g.phone),'') is not null)
    ) as x
    from app.players p
    -- `v2_search_index.organization_id` es el PARAMETRO. Sin calificar, esto
    -- era ambiguo contra p.organization_id y tumbaba la funcion entera.
    where p.organization_id = v2_search_index.organization_id
      and p.archived_at is null and p.status='active'
  ) t;
  return v;
end $function$;
-- Ya estaba cerrada en la base (create or replace conserva los permisos:
-- sólo authenticated y service_role). Se deja explícito, como pide la barrera.
revoke all on function public.v2_search_index(uuid) from public, anon;
