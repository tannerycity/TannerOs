-- Segunda vuelta. Usar player_enrollments.starts_on a secas tambien miente: 62
-- de las 71 inscripciones dicen "2026-08-19", que es el dia en que se migro el
-- padron, no cuando el nino entro al club. 57 quedaban "inscritos" DESPUES de su
-- primer cargo, que es imposible.
--
-- Se toma la evidencia mas antigua de que ya estaba en el club: la columna si
-- alguien la lleno a mano, su primera inscripcion, o su primer cargo. Es un piso
-- real, no una fecha inventada. Las fechas de ingreso verdaderas nunca se
-- migraron; para tenerlas exactas hay que capturarlas en la ficha.
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
        'joined_at', least(
          pl.joined_at,
          (select min(pe.starts_on) from app.player_enrollments pe where pe.player_id = pl.id),
          (select min(c.due_date) from app.charges c
            where c.player_id = pl.id and c.status = 'posted' and c.voided_at is null)),
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
