-- Pedidos: ligar un pedido de la tienda pública a su niño (Presidencia, 11/10/2026).
--
-- "Que hagan el pedido sin cuenta y ya después nosotros se lo apuntamos a su
-- hijo." La tienda pública (/tienda) no pide cuenta, así que sus pedidos
-- llegan sin player_id. Aquí Tienda sugiere quién es (mismo teléfono que un
-- tutor, el nombre del jersey, el apellido) y lo liga con un toque. Ligar
-- también apunta al tutor cuyo teléfono coincide. Todo queda en la bitácora.

create or replace function private.digitos10(p text)
returns text language sql immutable set search_path = '' as $$
  select nullif(right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10), '')
$$;

create or replace function private.query_order_player(p_organization_id uuid, p_order_id uuid, p_query text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_o app.orders%rowtype; v_tel text; v_q text := nullif(btrim(p_query), ''); v_nombres text[];
begin
  if not private.has_module_access(p_organization_id, 'commerce', false) then raise exception 'Not authorized'; end if;
  select * into v_o from app.orders where id = p_order_id and organization_id = p_organization_id;
  if v_o.id is null then raise exception 'Order not found'; end if;
  v_tel := private.digitos10(v_o.customer_phone);
  select coalesce(array_agg(distinct lower(btrim(i.attributes->>'nombrePers'))) filter (where nullif(btrim(i.attributes->>'nombrePers'), '') is not null), '{}')
    into v_nombres from app.order_items i where i.order_id = v_o.id;

  return jsonb_build_object(
    'linked', (select jsonb_build_object('id', p.id, 'name', btrim(concat_ws(' ', p.first_name, p.last_name)), 'category', p.category)
               from app.players p where p.id = v_o.player_id),
    'canWrite', private.has_module_access(p_organization_id, 'commerce', true),
    'suggestions', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'category', s.category, 'reason', s.reason)
                                order by s.score desc, s.name)
      from (
        select p.id, btrim(concat_ws(' ', p.first_name, p.last_name)) as name, p.category,
          (case when tel.ok then 3 else 0 end) + (case when jer.ok then 2 else 0 end) + (case when ape.ok then 1 else 0 end) as score,
          concat_ws(' · ', case when tel.ok then 'mismo teléfono que su tutor' end,
                           case when jer.ok then 'nombre del jersey' end,
                           case when ape.ok then 'mismo apellido' end) as reason
        from app.players p
        cross join lateral (select v_tel is not null and exists (select 1 from app.player_guardians pg join app.guardians g on g.id = pg.guardian_id
                              where pg.player_id = p.id and private.digitos10(g.phone) = v_tel)) tel(ok)
        cross join lateral (select lower(p.first_name) = any(v_nombres)
                               or lower(split_part(p.first_name, ' ', 1)) = any(v_nombres)) jer(ok)
        cross join lateral (select length(split_part(btrim(coalesce(p.last_name, '')), ' ', 1)) >= 3   -- "De" o "La" no cuentan como apellido
                               and lower(coalesce(v_o.customer_name, '')) like '%' || lower(split_part(btrim(p.last_name), ' ', 1)) || '%') ape(ok)
        where p.organization_id = p_organization_id and p.archived_at is null and p.status in ('active', 'inactive')
          and p.id is distinct from v_o.player_id
          and (case when v_q is not null
                    then lower(concat_ws(' ', p.first_name, p.last_name, p.code)) like '%' || lower(v_q) || '%'
                    else tel.ok or jer.ok or ape.ok end)
        order by 4 desc, 2
        limit 6) s), '[]'::jsonb));
end $$;

create or replace function private.command_link_order_player(p_organization_id uuid, p_order_id uuid, p_player_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_o app.orders%rowtype; v_guardian uuid;
begin
  if not private.has_module_access(p_organization_id, 'commerce', true) then raise exception 'Not authorized'; end if;
  select * into v_o from app.orders where id = p_order_id and organization_id = p_organization_id for update;
  if v_o.id is null then raise exception 'Order not found'; end if;
  if p_player_id is not null and not exists (select 1 from app.players where id = p_player_id and organization_id = p_organization_id and archived_at is null) then
    raise exception 'Player not found';
  end if;
  if p_player_id is not null then
    select g.id into v_guardian from app.player_guardians pg join app.guardians g on g.id = pg.guardian_id
    where pg.player_id = p_player_id and private.digitos10(g.phone) = private.digitos10(v_o.customer_phone)
    order by pg.is_primary desc nulls last limit 1;
  end if;
  update app.orders set player_id = p_player_id, guardian_id = coalesce(v_guardian, case when p_player_id is null then null else guardian_id end),
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('playerLinkedAt', now(), 'playerLinkedBy', v_uid),
         updated_at = now()
   where id = p_order_id;
  insert into app.domain_events(organization_id, event_type, aggregate_type, aggregate_id, payload, actor_user_id)
  values (p_organization_id, case when p_player_id is null then 'OrderPlayerUnlinked' else 'OrderPlayerLinked' end, 'order', p_order_id,
          jsonb_build_object('playerId', p_player_id, 'previousPlayerId', v_o.player_id, 'guardianId', v_guardian), v_uid);
end $$;

revoke all on function private.digitos10(text) from public, anon, authenticated;
revoke all on function private.query_order_player(uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.command_link_order_player(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.v2_order_player(organization_id uuid, order_id uuid, query text default null)
returns jsonb language sql stable security definer set search_path = ''
as $$ select private.query_order_player(organization_id, order_id, query) $$;
create or replace function public.v2_link_order_player(organization_id uuid, order_id uuid, player_id uuid)
returns void language sql security definer set search_path = ''
as $$ select private.command_link_order_player(organization_id, order_id, player_id) $$;
revoke all on function public.v2_order_player(uuid, uuid, text) from public, anon;
revoke all on function public.v2_link_order_player(uuid, uuid, uuid) from public, anon;
grant execute on function public.v2_order_player(uuid, uuid, text) to authenticated;
grant execute on function public.v2_link_order_player(uuid, uuid, uuid) to authenticated;
