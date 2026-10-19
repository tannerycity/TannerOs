-- Portal de familias (19/10/2026): "Ver cómo pagar" decía "Puedes pagar en
-- el club" aunque el club ya tenía su CLABE capturada. Los pagos siguen por
-- WhatsApp (decisión de Presidencia): el portal enseña a dónde transferir y
-- arma el mensaje con el comprobante. Sólo se agrega 'transfer' (banco, CLABE,
-- titular) a la organización; lo demás queda igual.
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
        'storeUrl', nullif(btrim(coalesce(o.settings->>'storeUrl','')),''),
        'playerNoun', private.normalized_branding(o.id)->'playerNoun',
        'transfer', nullif(jsonb_strip_nulls(jsonb_build_object(
          'bank', nullif(btrim(o.settings#>>'{paymentInstructions,transfer,bank}'),''),
          'clabe', nullif(regexp_replace(coalesce(o.settings#>>'{paymentInstructions,transfer,clabe}',''),'\D','','g'),''),
          'holder', nullif(btrim(o.settings#>>'{paymentInstructions,transfer,holder}'),''))), '{}'::jsonb)
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
