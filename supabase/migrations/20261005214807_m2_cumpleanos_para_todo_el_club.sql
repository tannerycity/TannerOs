-- Cumpleaños para todo el club, jugadores y staff
--
-- PEDIDO DE PRESIDENCIA (05/10/2026): que todos los usuarios sepan al entrar
-- si hay cumpleaños, y que también salgan los del staff.
--
-- MEDIDO: Inicio ya tenía "Cumpleaños próximos", pero hasta abajo y sólo para
-- quien puede ver Jugadores (salía de v2_players). Taquilla, Scouting, etc.
-- nunca lo veían. Del staff no se guardaba la fecha de nacimiento.
--
-- QUÉ HACE
--   1. public.profiles.birth_date: cumpleaños del staff (opcional).
--   2. v2_birthdays: cumpleaños de hoy y de los próximos N días (máx. 31) de
--      jugadores activos y del staff activo. Lo ve cualquier miembro activo.
--      Las cuentas de familia (rol Tanner) no: son cumpleaños de otros niños.
--      Sólo nombre, categoría o rol y el día: nada del expediente. La edad
--      sale para jugadores; del staff no (no se le anda contando la edad a
--      nadie en la pantalla de inicio).
--      Trae también myBirthDate para pedirle la fecha a quien no la tiene.
--   3. v2_set_my_birthday: cada quien captura (o borra) su propia fecha.
--   4. v2_set_member_birthday: quien administra Usuarios la captura por otro.
--   Las fechas del 29 de febrero se celebran el 28 en años no bisiestos.
--
-- REVERSIBLE: drop de las funciones y de la columna.

alter table public.profiles add column if not exists birth_date date;

create or replace function private.birthday_in_year(p_birth date, p_year int)
returns date language sql immutable set search_path to 'pg_catalog'
as $$
  select case
    when extract(month from p_birth)=2 and extract(day from p_birth)=29
         and not ((p_year % 4 = 0 and p_year % 100 <> 0) or p_year % 400 = 0)
      then make_date(p_year, 2, 28)
    else make_date(p_year, extract(month from p_birth)::int, extract(day from p_birth)::int)
  end
$$;

create or replace function private.next_birthday(p_birth date, p_today date)
returns date language sql immutable set search_path to 'pg_catalog'
as $$
  select case when p_birth is null then null else (
    select case when d >= p_today then d else private.birthday_in_year(p_birth, extract(year from p_today)::int + 1) end
    from (select private.birthday_in_year(p_birth, extract(year from p_today)::int) d) x
  ) end
$$;

create or replace function private.query_birthdays(p_organization_id uuid, p_days int)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','app','public','private'
as $$
declare v_today date := (now() at time zone 'America/Mexico_City')::date; v_days int := least(greatest(coalesce(p_days,7),0),31);
begin
  if not private.is_active_member(p_organization_id) then raise exception 'Not authorized'; end if;
  -- Las cuentas de familia no ven los cumpleaños de los demás niños.
  if exists(select 1 from public.organization_memberships m where m.organization_id=p_organization_id and m.user_id=auth.uid() and m.active and m.role='Tanner')
    then raise exception 'Not authorized'; end if;
  return jsonb_build_object(
    'today', v_today,
    'myBirthDate', (select pr.birth_date from public.profiles pr where pr.user_id = auth.uid()),
    'people', coalesce((
      select jsonb_agg(x.j order by x.d, x.n) from (
        select private.next_birthday(p.birth_date, v_today) d, p.first_name n,
               jsonb_build_object('kind','player','id',p.id,
                 'firstName',p.first_name,'name',trim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')),
                 'detail',coalesce(nullif(p.category,''),'Sin categoría'),
                 'day',private.next_birthday(p.birth_date, v_today),
                 'turns',extract(year from private.next_birthday(p.birth_date, v_today))::int - extract(year from p.birth_date)::int) j
          from app.players p
         where p.organization_id=p_organization_id and p.status='active' and p.archived_at is null
           and p.birth_date is not null
           and private.next_birthday(p.birth_date, v_today) <= v_today + v_days
        union all
        select private.next_birthday(pr.birth_date, v_today), private.chat_name(m.user_id),
               jsonb_build_object('kind','staff','id',m.user_id,
                 'firstName',split_part(private.chat_name(m.user_id),' ',1),'name',private.chat_name(m.user_id),
                 'detail',m.role,
                 'day',private.next_birthday(pr.birth_date, v_today),
                 'turns',null)
          from public.organization_memberships m
          join public.profiles pr on pr.user_id=m.user_id
         where m.organization_id=p_organization_id and m.active
           and m.role <> 'Tanner'
           and pr.birth_date is not null
           and private.next_birthday(pr.birth_date, v_today) <= v_today + v_days
      ) x), '[]'::jsonb)
  );
end $$;

create or replace function private.command_set_my_birthday(p_organization_id uuid, p_birth_date date)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public','private'
as $$
begin
  if not private.is_active_member(p_organization_id) then raise exception 'Not authorized'; end if;
  if p_birth_date is not null and (p_birth_date > current_date or p_birth_date < date '1920-01-01') then
    raise exception 'Fecha de nacimiento fuera de rango';
  end if;
  update public.profiles set birth_date=p_birth_date, updated_at=now() where user_id=auth.uid();
  return jsonb_build_object('ok',true,'birthDate',p_birth_date);
end $$;

create or replace function private.command_set_member_birthday(p_organization_id uuid, p_user_id uuid, p_birth_date date)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','app','public','private'
as $$
begin
  if not private.can_manage_users(p_organization_id) then raise exception 'Not authorized'; end if;
  if not exists(select 1 from public.organization_memberships m where m.organization_id=p_organization_id and m.user_id=p_user_id) then
    raise exception 'Esa persona no es del club';
  end if;
  if p_birth_date is not null and (p_birth_date > current_date or p_birth_date < date '1920-01-01') then
    raise exception 'Fecha de nacimiento fuera de rango';
  end if;
  update public.profiles set birth_date=p_birth_date, updated_at=now() where user_id=p_user_id;
  if not found then raise exception 'Esa persona no tiene perfil'; end if;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id,request_id)
  values(p_organization_id,'MemberBirthdaySet','membership',p_user_id,jsonb_build_object('userId',p_user_id,'set',p_birth_date is not null),auth.uid(),null);
  return jsonb_build_object('ok',true,'birthDate',p_birth_date);
end $$;

create or replace function public.v2_birthdays(organization_id uuid, days int default 7) returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $$ select private.query_birthdays(organization_id, days) $$;
create or replace function public.v2_set_my_birthday(organization_id uuid, birth_date date) returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $$ select private.command_set_my_birthday(organization_id, birth_date) $$;
create or replace function public.v2_set_member_birthday(organization_id uuid, user_id uuid, birth_date date) returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $$ select private.command_set_member_birthday(organization_id, user_id, birth_date) $$;
revoke all on function public.v2_birthdays(uuid,int), public.v2_set_my_birthday(uuid,date), public.v2_set_member_birthday(uuid,uuid,date) from public, anon;
grant execute on function public.v2_birthdays(uuid,int), public.v2_set_my_birthday(uuid,date), public.v2_set_member_birthday(uuid,uuid,date) to authenticated;
