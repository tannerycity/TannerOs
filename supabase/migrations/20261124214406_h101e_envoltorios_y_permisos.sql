-- ===================================================== envoltorios v2_* ====

create or replace function public.v2_live_mis_camaras(organization_id uuid default null)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_mis_camaras($1) $$;
create or replace function public.v2_live_aceptar_terminos(organization_id uuid, version integer)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_aceptar_terminos($1, $2) $$;
create or replace function public.v2_live_ticket(camera_id uuid)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_ticket($1) $$;
create or replace function public.v2_live_panel(organization_id uuid)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_panel($1) $$;
create or replace function public.v2_live_guardar_grabador(organization_id uuid, datos jsonb)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_guardar_grabador($1, $2) $$;
create or replace function public.v2_live_guardar_camara(organization_id uuid, datos jsonb)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_guardar_camara($1, $2) $$;
create or replace function public.v2_live_revisar_consentimiento(organization_id uuid, camera_id uuid)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_revisar_consentimiento($1, $2) $$;
create or replace function public.v2_live_activar(organization_id uuid, camera_id uuid, activa boolean, motivo text default null)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_activar($1, $2, $3, $4) $$;
create or replace function public.v2_live_pausa(organization_id uuid, pausar boolean, motivo text default null)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_pausa($1, $2, $3) $$;
create or replace function public.v2_live_ajustes(organization_id uuid, datos jsonb)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_ajustes($1, $2) $$;
create or replace function public.v2_live_accesos(organization_id uuid, camera_id uuid)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_accesos($1, $2) $$;
create or replace function public.v2_live_bloquear(organization_id uuid, guardian_id uuid, camera_id uuid, motivo text)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_bloquear($1, $2, $3, $4) $$;
create or replace function public.v2_live_desbloquear(organization_id uuid, block_id uuid)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_desbloquear($1, $2) $$;
create or replace function public.v2_live_archivar(organization_id uuid, tipo text, id uuid)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_archivar($1, $2, $3) $$;
create or replace function public.v2_live_prueba_manual(organization_id uuid, recorder_id uuid, camera_id uuid, resultado text, nota text default null, datos jsonb default '{}'::jsonb)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_prueba_manual($1, $2, $3, $4, $5, $6) $$;
create or replace function public.v2_live_bitacora(organization_id uuid, limite integer default 100)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_bitacora($1, $2) $$;

create or replace function public.v2_live_transmitir(organization_id uuid, camera_id uuid, modo text, titulo text default null, minutos integer default 120)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_transmitir($1, $2, $3, $4, $5) $$;
create or replace function public.v2_live_detener(organization_id uuid, broadcast_id uuid)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_detener($1, $2) $$;
create or replace function public.v2_live_nuevo_enlace(organization_id uuid, broadcast_id uuid)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_nuevo_enlace($1, $2) $$;

-- Para quien abre el enlace: sin cuenta (anon). Sólo sirven con el enlace.
create or replace function public.v2_live_publico(enlace text)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_publico($1) $$;
create or replace function public.v2_live_publico_ticket(enlace text)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_publico_ticket($1) $$;

-- Sólo servidor.
create or replace function public.v2_live_gateway_autoriza(token text, path text, accion text, ip text default null, sesion text default null)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_gateway_autoriza($1, $2, $3, $4, $5) $$;
create or replace function public.v2_live_gateway_cortes(desde timestamptz default null)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_gateway_cortes($1) $$;
create or replace function public.v2_live_gateway_estado(path text, estado text, error text default null)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_gateway_estado($1, $2, $3) $$;
create or replace function public.v2_live_agente_diagnostico(recorder_id uuid, camera_id uuid, prueba text, resultado text, datos jsonb default '{}'::jsonb, latencia_ms integer default null)
returns jsonb language sql security definer set search_path to '' as $$ select private.live_agente_diagnostico($1, $2, $3, $4, $5, $6) $$;

-- Cada envoltorio, cerrado a public y anon por escrito (barrera
-- funcion-interna-cerrada-a-anon). Los que sí abren se reabren arriba.
revoke all on function public.v2_live_accesos(uuid,uuid) from public, anon;
revoke all on function public.v2_live_aceptar_terminos(uuid,integer) from public, anon;
revoke all on function public.v2_live_activar(uuid,uuid,boolean,text) from public, anon;
revoke all on function public.v2_live_agente_diagnostico(uuid,uuid,text,text,jsonb,integer) from public, anon;
revoke all on function public.v2_live_ajustes(uuid,jsonb) from public, anon;
revoke all on function public.v2_live_archivar(uuid,text,uuid) from public, anon;
revoke all on function public.v2_live_bitacora(uuid,integer) from public, anon;
revoke all on function public.v2_live_bloquear(uuid,uuid,uuid,text) from public, anon;
revoke all on function public.v2_live_desbloquear(uuid,uuid) from public, anon;
revoke all on function public.v2_live_detener(uuid,uuid) from public, anon;
revoke all on function public.v2_live_gateway_autoriza(text,text,text,text,text) from public, anon;
revoke all on function public.v2_live_gateway_cortes(timestamptz) from public, anon;
revoke all on function public.v2_live_gateway_estado(text,text,text) from public, anon;
revoke all on function public.v2_live_guardar_camara(uuid,jsonb) from public, anon;
revoke all on function public.v2_live_guardar_grabador(uuid,jsonb) from public, anon;
revoke all on function public.v2_live_mis_camaras(uuid) from public, anon;
revoke all on function public.v2_live_nuevo_enlace(uuid,uuid) from public, anon;
revoke all on function public.v2_live_panel(uuid) from public, anon;
revoke all on function public.v2_live_pausa(uuid,boolean,text) from public, anon;
revoke all on function public.v2_live_prueba_manual(uuid,uuid,uuid,text,text,jsonb) from public, anon;
revoke all on function public.v2_live_publico(text) from public, anon;
revoke all on function public.v2_live_publico_ticket(text) from public, anon;
revoke all on function public.v2_live_revisar_consentimiento(uuid,uuid) from public, anon;
revoke all on function public.v2_live_ticket(uuid) from public, anon;
revoke all on function public.v2_live_transmitir(uuid,uuid,text,text,integer) from public, anon;

-- ============================================================== permisos ====

do $$
declare f text;
begin
  -- Todo lo privado, cerrado.
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'private' and p.proname like 'live\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  -- Pantallas: authenticated.
  foreach f in array array[
    'public.v2_live_mis_camaras(uuid)', 'public.v2_live_aceptar_terminos(uuid,integer)', 'public.v2_live_ticket(uuid)',
    'public.v2_live_panel(uuid)', 'public.v2_live_guardar_grabador(uuid,jsonb)', 'public.v2_live_guardar_camara(uuid,jsonb)',
    'public.v2_live_revisar_consentimiento(uuid,uuid)', 'public.v2_live_activar(uuid,uuid,boolean,text)', 'public.v2_live_pausa(uuid,boolean,text)',
    'public.v2_live_ajustes(uuid,jsonb)', 'public.v2_live_accesos(uuid,uuid)', 'public.v2_live_bloquear(uuid,uuid,uuid,text)',
    'public.v2_live_desbloquear(uuid,uuid)', 'public.v2_live_archivar(uuid,text,uuid)',
    'public.v2_live_prueba_manual(uuid,uuid,uuid,text,text,jsonb)', 'public.v2_live_bitacora(uuid,integer)',
    'public.v2_live_transmitir(uuid,uuid,text,text,integer)', 'public.v2_live_detener(uuid,uuid)', 'public.v2_live_nuevo_enlace(uuid,uuid)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  -- El enlace: anon y authenticated (quien lo abre puede tener o no cuenta).
  foreach f in array array['public.v2_live_publico(text)', 'public.v2_live_publico_ticket(text)']
  loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
  -- Gateway y agente: sólo service_role.
  foreach f in array array[
    'public.v2_live_gateway_autoriza(text,text,text,text,text)', 'public.v2_live_gateway_cortes(timestamptz)',
    'public.v2_live_gateway_estado(text,text,text)', 'public.v2_live_agente_diagnostico(uuid,uuid,text,text,jsonb,integer)']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
