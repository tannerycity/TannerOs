-- El portal de Familias enseña SÓLO la fecha de ingreso al club capturada
--
-- LO QUE PIDIÓ EL CLUB: "para el portal de familias, ellos sólo deben de ver
-- su fecha de ingreso, no quién la modificó".
--
-- Quién la modificó ya no les llegaba: el rastro vive en el expediente
-- (v2_player_profile), que exige el módulo de Jugadores, y una familia no lo
-- tiene — verificado con un tutor real: "Not authorized". El portal sólo
-- recibe la fecha.
--
-- Lo que sí cambia: hasta hoy, si no había fecha capturada, el portal
-- enseñaba la primera inscripción o el primer cargo. En los migrados eso es
-- el día de la migración (19/08/2026), que NO es su fecha de ingreso. Ahora
-- enseña la capturada y, mientras no haya, "Por registrar".
--
-- REVERSIBLE: la versión anterior está en 20260930131012_a2.

create or replace function private.portal_home()
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare
  g app.guardians;
  v jsonb;
begin
  select * into g from private.portal_guardian();
  if g.id is null then raise exception 'Portal access required'; end if;

  select jsonb_build_object(
    'guardian', jsonb_build_object(
      'name', concat_ws(' ', nullif(btrim(g.first_name),''), nullif(btrim(g.last_name),'')),
      'phone', g.phone,
      'email', g.email
    ),
    'organization', (
      select jsonb_build_object(
        'name', o.name,
        'whatsapp', nullif(regexp_replace(coalesce(o.settings->>'whatsappNumber',''),'\D','','g'),''),
        'storeUrl', nullif(btrim(coalesce(o.settings->>'storeUrl','')),'')
      )
      from public.organizations o
      where o.id = g.organization_id
    ),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pl.id,
        'first_name', pl.first_name,
        'last_name', pl.last_name,
        'birth_date', pl.birth_date,
        'category', pl.category,
        'position', pl.position,
        'dominant_foot', pl.dominant_foot,
        'jersey_number', pl.jersey_number,
        -- Sólo la que capturó Presidencia. Sin respaldo: en los migrados la
        -- "evidencia" era el día de la migración, no el día en que entraron.
        'joined_at', pl.joined_at,
        'status', pl.status,
        'photo_path', pl.photo_path,
        'photo_thumb_path', pl.photo_thumb_path,
        'photo_bucket', pl.photo_bucket,
        'balance', coalesce((
          select sum(cb.balance_due)
          from app.charge_balances cb
          where cb.player_id = pl.id
            and cb.balance_due > 0
        ), 0)
      ) order by pl.first_name)
      from app.players pl
      where pl.id in (select player_id from private.portal_player_ids())
    ), '[]'::jsonb)
  ) into v;

  return v;
end
$function$;
