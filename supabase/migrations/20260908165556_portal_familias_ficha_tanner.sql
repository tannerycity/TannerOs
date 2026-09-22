create or replace function private.portal_home()
returns jsonb
language plpgsql
stable
security definer
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
      select jsonb_build_object('name', o.name)
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
$function$;;
