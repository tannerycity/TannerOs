-- REGRESIÓN: al recrear el wrapper para exponer review_reason, la columna de estado
-- quedó como "status" cuando la pantalla de Jugadores lee "status_value". Resultado:
-- ningún Tanner cumplía status_value==='active' y los 73 salían como baja.
-- Se restaura status_value (y se conserva status para quien lo lea así), y se agrega
-- photo_bucket, que Calendario y Jugadores usan para firmar las fotos.
drop function if exists public.v2_players(uuid, text);
drop function if exists private.query_players(uuid, text);

create function private.query_players(p_organization_id uuid, p_status text default null)
returns table(id uuid, code text, first_name text, last_name text, birth_date date,
  status text, status_value text, category text, player_position text, jersey_number text,
  photo_path text, photo_thumb_path text, photo_bucket text,
  base_monthly_fee numeric, billing_status text, needs_review boolean, review_reason text,
  sex text, school text)
language plpgsql stable security definer
set search_path to 'pg_catalog','app','private'
as $function$
begin
  if not private.has_module_access(p_organization_id,'players',false) then raise exception 'Not authorized'; end if;
  return query
  select p.id,p.code,p.first_name,p.last_name,p.birth_date,
         p.status,p.status,p.category,p.position,p.jersey_number,
         p.photo_path,p.photo_thumb_path,p.photo_bucket,
         bp.base_monthly_fee,bp.status,bp.needs_review,bp.review_reason,p.sex,p.school
  from app.players p
  left join app.billing_profiles bp on bp.player_id=p.id and bp.organization_id=p.organization_id
  where p.organization_id=p_organization_id and p.archived_at is null and (p_status is null or p.status=p_status)
  order by p.first_name,p.last_name,p.id;
end $function$;

revoke all on function private.query_players(uuid,text) from public, anon, authenticated;

create function public.v2_players(organization_id uuid, status_filter text default null)
returns table(id uuid, code text, first_name text, last_name text, birth_date date,
  status text, status_value text, category text, player_position text, jersey_number text,
  photo_path text, photo_thumb_path text, photo_bucket text,
  base_monthly_fee numeric, billing_status text, needs_review boolean, review_reason text,
  sex text, school text)
language sql security definer set search_path to 'pg_catalog','private'
as $function$ select * from private.query_players(organization_id,status_filter) $function$;

revoke all on function public.v2_players(uuid,text) from public, anon;
grant execute on function public.v2_players(uuid,text) to authenticated;;
