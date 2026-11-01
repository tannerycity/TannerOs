-- h56b · Programación del recolector del tablero (30/10/2026).
--
-- 1. Un secreto aleatorio en el Vault de Supabase. Se genera aquí dentro: no
--    aparece en este archivo, en el repositorio ni en ningún chat.
-- 2. v2_bi_secreto_ok: la función bi-recolector pregunta si el encabezado que
--    recibió es ese secreto; v2_bi_cuentas le da las cuentas activas. Las dos
--    sólo con la llave de servicio.
-- 3. pg_cron: todos los días a las 06:15 de la Ciudad de México (12:15 UTC)
--    llama a bi-recolector. Si una fuente no tiene credencial, queda
--    "bloqueada" con su motivo; nada se rompe.

select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'bi_recolector_secreto',
                           'Encabezado x-bi-secreto del recolector del tablero (h56b)')
 where not exists (select 1 from vault.secrets where name = 'bi_recolector_secreto');

create or replace function public.v2_bi_secreto_ok(secreto text)
returns boolean language sql stable security definer set search_path to '' as $$
  select coalesce(length(secreto) >= 32 and secreto = (select d.decrypted_secret from vault.decrypted_secrets d where d.name = 'bi_recolector_secreto'), false)
$$;
revoke all on function public.v2_bi_secreto_ok(text) from public, anon, authenticated;
grant execute on function public.v2_bi_secreto_ok(text) to service_role;

-- Las cuentas activas, para el recolector (sólo con la llave de servicio).
create or replace function public.v2_bi_cuentas(organization_id uuid)
returns table (fuente text, cuenta text, negocio text) language sql stable security definer set search_path to '' as $$
  select c.fuente, c.cuenta, c.negocio from app.bi_cuentas c where c.organization_id = v2_bi_cuentas.organization_id and c.activa
$$;
revoke all on function public.v2_bi_cuentas(uuid) from public, anon, authenticated;
grant execute on function public.v2_bi_cuentas(uuid) to service_role;

select cron.schedule('bi-recolector-diario', '15 12 * * *', $$
  select net.http_post(
    url := 'https://pacnegivzgxpanphrnwp.supabase.co/functions/v1/bi-recolector',
    headers := jsonb_build_object('Content-Type', 'application/json',
                 'x-bi-secreto', (select d.decrypted_secret from vault.decrypted_secrets d where d.name = 'bi_recolector_secreto')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000)
$$);
