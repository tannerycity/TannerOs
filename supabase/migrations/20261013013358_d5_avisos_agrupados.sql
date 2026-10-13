-- d5: Un aviso, una tarjeta.
--
-- Pedido de Presidencia (13/10/2026): "¿por qué aparecen 3 veces estos
-- mensajes?". Los avisos del sistema que van a personas (una postulación de
-- staff, un pedido nuevo) se guardan uno por destinatario, y Presidencia ve
-- los de todos: la misma "Nueva postulación de staff" salía una vez por cada
-- quien la recibía. Ahora los avisos personales iguales (mismo título,
-- texto, origen y autor, en el mismo minuto) se juntan en una tarjeta que
-- dice para quiénes fue y cuántos la vieron. Nada cambia en lo guardado.
create or replace function private.query_avisos(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_role text; v_pres boolean; v_seen timestamptz; v_out jsonb;
begin
  if not private.is_active_member(p_organization_id) then raise exception 'Not authorized'; end if;
  v_role := private.chat_my_role(p_organization_id); v_pres := private.is_presidency(p_organization_id);
  select seen_at into v_seen from app.announcement_seen where organization_id = p_organization_id and user_id = v_uid;
  with vis as (
    select a.* from app.announcements a
    where a.organization_id = p_organization_id and a.archived_at is null and (a.expires_at is null or a.expires_at > now())
      and (v_pres or a.audience_type = 'club' or (a.audience_type = 'role' and a.audience_value = v_role)
           or (a.audience_type = 'user' and a.audience_value = v_uid::text))
  ), grp as (
    select (array_agg(a.id order by (a.audience_value = v_uid::text) desc, a.id))[1] as id,
      a.title, a.body, a.source, a.published_by, min(a.published_at) as published_at,
      min(a.audience_type) as audience_type, count(*) as n,
      array_agg(distinct a.audience_value) as valores
    from vis a
    group by a.title, a.body, a.source, a.published_by,
      case when a.audience_type = 'user' then date_trunc('minute', a.published_at) end,
      case when a.audience_type = 'user' then null else a.id end
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', g.id, 'title', g.title, 'body', g.body, 'source', g.source,
      'audienceType', case when g.n > 1 then 'users' else g.audience_type end,
      'audienceValue', case when g.n > 1 then null else g.valores[1] end,
      'recipients', case when g.audience_type = 'user' then (
          select coalesce(jsonb_agg(jsonb_build_object('userId', v, 'name', private.chat_name(v::uuid)) order by (v = v_uid::text) desc, v), '[]'::jsonb)
          from unnest(g.valores) v) end,
      'publishedAt', g.published_at, 'author', case when g.published_by is null then 'TannerOS' else private.chat_name(g.published_by) end,
      'unread', (v_seen is null or g.published_at > v_seen),
      'reach', case when v_pres or g.published_by = v_uid then (
        select jsonb_build_object('total', count(*), 'seen', count(*) filter (where s.seen_at >= g.published_at))
        from public.organization_memberships m
        left join app.announcement_seen s on s.organization_id = m.organization_id and s.user_id = m.user_id
        where m.organization_id = p_organization_id and m.active
          and (g.audience_type = 'club' or (g.audience_type = 'role' and m.role = any(g.valores))
               or (g.audience_type = 'user' and m.user_id::text = any(g.valores)))) end
    ) order by g.published_at desc), '[]'::jsonb)
  into v_out from grp g;
  return jsonb_build_object('canPublish', private.has_any_module_access(p_organization_id, array['calendar','admin'], true), 'avisos', v_out);
end $$;
