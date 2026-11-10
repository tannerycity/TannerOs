-- h82 (09/11/2026, Mich): "No pudimos abrir las solicitudes públicas."
-- Los dos envoltorios públicos de las solicitudes sin sesión (20261109000000)
-- quedaron como security invoker y llaman a funciones private.* que el rol
-- authenticated no puede ejecutar: "permission denied for function
-- scholarship_public_requests_list". Mismo patrón que el resto de v2_*: el
-- envoltorio corre como definer y la función privada revisa el permiso
-- (private.puede_ver_becas). Revisado en prod: no hay otro v2_* con este hueco.
create or replace function public.v2_scholarship_public_requests(organization_id uuid, status_filter text default null)
returns jsonb language sql stable security definer set search_path = '' as $$ select private.scholarship_public_requests_list(organization_id, status_filter) $$;
revoke all on function public.v2_scholarship_public_requests(uuid,text) from public, anon;
grant execute on function public.v2_scholarship_public_requests(uuid,text) to authenticated;

create or replace function public.v2_scholarship_public_request_update(organization_id uuid, id uuid, status text default null, notes text default null, link_player_id uuid default null)
returns jsonb language sql security definer set search_path = '' as $$ select private.scholarship_public_request_update(organization_id, id, status, notes, link_player_id) $$;
revoke all on function public.v2_scholarship_public_request_update(uuid,uuid,text,text,uuid) from public, anon;
grant execute on function public.v2_scholarship_public_request_update(uuid,uuid,text,text,uuid) to authenticated;
