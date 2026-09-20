
create or replace function public.v2_search_index(organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','public','app','private'
as $$
declare v jsonb;
begin
  if not private.is_active_member(organization_id) then raise exception 'Not authorized'; end if;
  select coalesce(jsonb_agg(x order by x->>'name'),'[]'::jsonb) into v from (
    select jsonb_build_object(
      'id', p.id,
      'name', trim(concat_ws(' ', p.first_name, p.last_name)),
      'jersey', p.jersey_number,
      'pos', p.position,
      'guardians', (select string_agg(trim(concat_ws(' ', g.first_name, g.last_name)), ', ')
                    from app.player_guardians pg join app.guardians g on g.id=pg.guardian_id
                    where pg.player_id=p.id),
      'phones', (select string_agg(g.phone, ' ')
                 from app.player_guardians pg join app.guardians g on g.id=pg.guardian_id
                 where pg.player_id=p.id and nullif(trim(g.phone),'') is not null)
    ) as x
    from app.players p
    where p.organization_id=organization_id and p.archived_at is null and p.status='active'
  ) t;
  return v;
end $$;

revoke all on function public.v2_search_index(uuid) from public, anon;
grant execute on function public.v2_search_index(uuid) to authenticated;
;
