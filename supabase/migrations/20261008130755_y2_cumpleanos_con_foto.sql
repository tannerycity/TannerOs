-- Cumpleaños con foto
--
-- PEDIDO DE PRESIDENCIA (08/10/2026): en Inicio salían dos bloques de
-- cumpleaños (arriba la franja para todo el club, abajo el carrusel con fotos
-- sólo de jugadores). Se unifican arriba, con foto, para que todo el club se
-- entere.
--
-- QUÉ HACE: v2_birthdays devuelve también la MINIATURA del jugador
-- (photoThumbPath + photoBucket), nunca la foto original (egress). El resto
-- de la respuesta no cambia.
--
-- REVERSIBLE: volver a la versión de m2_cumpleanos_para_todo_el_club.

create or replace function private.query_birthdays(p_organization_id uuid, p_days integer)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','app','public','private'
as $function$
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
                 'turns',extract(year from private.next_birthday(p.birth_date, v_today))::int - extract(year from p.birth_date)::int,
                 'photoThumbPath',p.photo_thumb_path,'photoBucket',coalesce(p.photo_bucket,'tanneros-private')) j
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
end $function$;
