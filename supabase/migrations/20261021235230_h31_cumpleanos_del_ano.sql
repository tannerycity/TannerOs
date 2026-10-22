-- h31 · Cumpleaños del año (21/10/2026).
--
-- Zul quiere ver todos los cumpleaños registrados, por año y por mes, para
-- planear. v2_birthdays sólo da los próximos días (máx. 31). Esto da todos:
-- jugadores activos y staff activo, con el día de este año y los años que
-- cumplen. Lo ven las mismas personas que ya ven los de la semana en Inicio
-- (miembros activos que no son cuenta de familia).

create or replace function private.query_birthdays_year(p_organization_id uuid, p_year integer)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'app', 'public', 'private'
as $$
declare
  v_today date := (now() at time zone 'America/Mexico_City')::date;
  v_year int := coalesce(p_year, extract(year from v_today)::int);
begin
  if not private.is_active_member(p_organization_id) then raise exception 'Not authorized'; end if;
  -- Las cuentas de familia no ven los cumpleaños de los demás niños.
  if exists(select 1 from public.organization_memberships m where m.organization_id = p_organization_id
            and m.user_id = auth.uid() and m.active and m.role = 'Tanner') then
    raise exception 'Not authorized';
  end if;
  if v_year < 2000 or v_year > 2100 then raise exception 'Año fuera de rango'; end if;
  return jsonb_build_object(
    'today', v_today,
    'year', v_year,
    'people', coalesce((
      select jsonb_agg(x.j order by x.d, x.n) from (
        select private.birthday_in_year(p.birth_date, v_year) d, p.first_name n,
          jsonb_build_object('kind', 'player', 'id', p.id, 'firstName', p.first_name,
            'name', trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')),
            'detail', coalesce(nullif(p.category, ''), 'Sin categoría'),
            'day', private.birthday_in_year(p.birth_date, v_year),
            'turns', v_year - extract(year from p.birth_date)::int) j
        from app.players p
        where p.organization_id = p_organization_id and p.status = 'active' and p.archived_at is null
          and p.birth_date is not null
        union all
        select private.birthday_in_year(pr.birth_date, v_year), private.chat_name(m.user_id),
          jsonb_build_object('kind', 'staff', 'id', m.user_id,
            'firstName', split_part(private.chat_name(m.user_id), ' ', 1),
            'name', private.chat_name(m.user_id), 'detail', m.role,
            'day', private.birthday_in_year(pr.birth_date, v_year), 'turns', null)
        from public.organization_memberships m
        join public.profiles pr on pr.user_id = m.user_id
        where m.organization_id = p_organization_id and m.active and m.role <> 'Tanner'
          and pr.birth_date is not null
      ) x), '[]'::jsonb),
    'missing', jsonb_build_object(
      'players', (select count(*) from app.players p where p.organization_id = p_organization_id
                  and p.status = 'active' and p.archived_at is null and p.birth_date is null),
      'staff', (select count(*) from public.organization_memberships m left join public.profiles pr on pr.user_id = m.user_id
                where m.organization_id = p_organization_id and m.active and m.role <> 'Tanner' and pr.birth_date is null))
  );
end
$$;
revoke all on function private.query_birthdays_year(uuid, integer) from public, anon, authenticated;

create or replace function public.v2_birthdays_year(organization_id uuid, year integer default null)
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog', 'private'
as $$ select private.query_birthdays_year(organization_id, year) $$;
revoke all on function public.v2_birthdays_year(uuid, integer) from public, anon;
grant execute on function public.v2_birthdays_year(uuid, integer) to authenticated;
