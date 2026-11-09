-- h72 · La llave de las notificaciones sale del código (09/11/2026)
--
-- Presidencia: "por seguridad quitemos todo lo que nos pueda chingar...
-- buenas prácticas". La función send-push traía escrita en su código la
-- llave interna que la protege. Ahora:
--   · send-push no guarda ninguna llave: pregunta a la base si la que llegó
--     es la buena (v2_push_token_valido, sólo para service_role).
--   · La llave vive únicamente en Vault (push_internal_token) y se cambia
--     aquí mismo por una nueva generada en la base (nadie la ve).
-- private.notify_push ya la leía de Vault: no cambia.

create or replace function public.v2_push_token_valido(token text)
returns boolean language sql stable security definer set search_path to ''
as $$
  select coalesce(length(token) >= 32 and token = private.get_app_secret('push_internal_token'), false)
$$;
revoke all on function public.v2_push_token_valido(text) from public, anon, authenticated;
grant execute on function public.v2_push_token_valido(text) to service_role;

-- Llave nueva, generada aquí: la vieja (la que estaba en el código) deja de servir.
do $$
declare v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'push_internal_token';
  if v_id is null then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'push_internal_token', 'Llave interna entre notify_push y send-push');
  else
    perform vault.update_secret(v_id, encode(extensions.gen_random_bytes(32), 'hex'));
  end if;
end $$;
