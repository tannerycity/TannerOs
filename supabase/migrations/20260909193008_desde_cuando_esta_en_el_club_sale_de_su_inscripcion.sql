-- "En el club: Por registrar" salia en 59 de los 66 Tanners activos, y el dato
-- si existe: app.players.joined_at solo lo traen 7, pero los 59 tienen su
-- inscripcion en app.player_enrollments. La fecha de entrada al club es la
-- primera inscripcion, no una columna que casi nadie llenó.
--
-- portal_statement ya lo resolvia asi (enrolled_on); portal_home era el que
-- seguia leyendo la columna a secas.
create or replace function private.portal_home()
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog','app','private'
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
        -- Solo digitos: la liga de WhatsApp no acepta espacios ni guiones.
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
        -- La columna gana si alguien la llenó a mano; si no, la primera inscripción.
        'joined_at', coalesce(pl.joined_at,
          (select min(pe.starts_on) from app.player_enrollments pe where pe.player_id = pl.id)),
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

revoke all on function private.portal_home() from public, anon, authenticated;;
