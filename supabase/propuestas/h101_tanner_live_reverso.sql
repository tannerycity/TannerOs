-- Reverso de h101 · Tanner LIVE. Deja la base como estaba antes de h101.
-- Borra las tablas live_* y sus datos (cámaras, horarios, tickets, bitácora
-- técnica). La bitácora general (app.audit_events, eventos 'live.%') se queda:
-- nada se borra de auditoría.
begin;

do $$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where (n.nspname = 'public' and p.proname like 'v2\_live\_%')
               or (n.nspname = 'private' and p.proname like 'live\_%')
  loop
    execute format('drop function %s', f);
  end loop;
end $$;

drop table if exists app.live_diagnostics, app.live_tickets, app.live_broadcasts, app.live_viewer_terms, app.live_access_blocks,
  app.live_camera_windows, app.live_camera_audience, app.live_cameras, app.live_recorders, app.live_settings;

delete from public.role_module_permissions where module_code = 'live';
delete from private.membership_module_overrides where module_code = 'live';
delete from public.organization_module_overrides where module_code = 'live';
delete from public.plan_modules where module_code = 'live';
delete from public.modules where code = 'live';

create or replace function private.usage_modulos()
returns text[] language sql immutable set search_path to '' as $$
  select array['inicio','mensajes','club','direccion','taquilla','contabilidad','finanzas','jugadores','asistencia','becas','partidos',
    'calendario','centro_tanner','academias','formacion','prospectos','candidatos','staff','cumpleanos','encuestas','scouting','visorias',
    'cursosVerano','tienda','catalogo','utileria','estacionamiento','patrocinadores','metricas','ideas','usuarios','invitaciones','admin','cambios','qa','convocatoria']
$$;
revoke all on function private.usage_modulos() from public, anon, authenticated;

commit;
