-- h101f · Tanner LIVE: la bitácora siempre lleva a qué se refiere (24/11/2026)
--
-- En producción app.audit_events.aggregate_id es obligatorio. Pausar todo,
-- cambiar ajustes y aceptar las reglas no tienen un objeto propio (p_id null)
-- y habrían fallado al escribir la bitácora. En esos casos el evento se
-- registra contra el club. Mismo nombre y firma: conserva sus permisos.

create or replace function private.live_audita(p_org uuid, p_tipo text, p_agregado text, p_id uuid, p_payload jsonb)
returns void language sql security definer set search_path to '' as $$
  insert into app.audit_events(organization_id, actor_user_id, actor_label, event_type, aggregate_type, aggregate_id, payload)
  values (p_org, (select auth.uid()),
          (select p.display_name from public.profiles p where p.user_id = (select auth.uid())),
          'live.' || p_tipo, coalesce(p_agregado, 'live'), coalesce(p_id, p_org)::text, coalesce(p_payload, '{}'::jsonb))
$$;
revoke all on function private.live_audita(uuid, text, text, uuid, jsonb) from public, anon, authenticated;
