-- PROPUESTA · NO APLICADA · NO PROBADA
--
-- Bloques E1, E2 y E3 de docs/auditoria/08: medir cuánto usa cada club, poner
-- límites por plan, y avisar antes de que se topen.
--
-- Por qué hace falta, con números de hoy (20 de septiembre de 2026):
--
--   Tannery City FC · 162 jugadores · 11 usuarios · 64 tutores · 105 archivos
--                    · 151 MB de Storage
--
-- 151 MB para UN club, con 1 GB en el plan gratuito: al sexto club se acaba, y
-- nadie se entera hasta que algo deja de subir. Después de la conversión del
-- Bloque B ese club baja a unos 18 MB, y entonces caben más de 50. Esa
-- diferencia es justo lo que hay que poder ver antes de venderle a alguien.
--
-- REVERSO al final del archivo.
--
-- Lo que SÍ se verificó de esto, sin aplicarlo (consultas de sólo lectura):
--   · app.domain_events tiene organization_id, event_type, aggregate_type,
--     aggregate_id, payload, actor y occurred_at.
--   · public.organizations tiene settings (jsonb).
--   · cron.schedule existe.
--   · storage.objects guarda el peso en metadata->>'size' — ya se usó para
--     medir los 151 MB de Tannery City.
--
-- Lo que NO se verificó: que corra. Nadie la ha ejecutado. Va a una rama de
-- Supabase antes que a producción.

begin;

-- ---------------------------------------------------------------- E1 · medir
create table if not exists app.organization_usage (
  organization_id  uuid        not null references public.organizations(id) on delete cascade,
  measured_on      date        not null default current_date,
  players_active   integer     not null default 0,
  users_active     integer     not null default 0,
  guardians        integer     not null default 0,
  files            integer     not null default 0,
  storage_bytes    bigint      not null default 0,
  measured_at      timestamptz not null default now(),
  primary key (organization_id, measured_on)
);

alter table app.organization_usage enable row level security;
-- Sin políticas: se lee por RPC con SECURITY DEFINER, como el resto del sistema.

comment on table app.organization_usage is
  'Una foto diaria de cuánto usa cada club. La llave (club, día) la hace idempotente: correr el cron dos veces el mismo día no duplica.';

create or replace function private.measure_organization_usage()
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog','app','public','private'
as $fn$
declare v_filas integer;
begin
  insert into app.organization_usage
    (organization_id, measured_on, players_active, users_active, guardians, files, storage_bytes)
  select o.id, current_date,
    (select count(*) from app.players p
      where p.organization_id = o.id and coalesce(p.status,'') <> 'archived'),
    (select count(*) from public.organization_memberships m
      where m.organization_id = o.id and m.active),
    (select count(*) from app.guardians g where g.organization_id = o.id),
    (select count(*) from storage.objects so
      where so.name like 'organizations/' || o.id::text || '/%'),
    (select coalesce(sum((so.metadata->>'size')::bigint), 0) from storage.objects so
      where so.name like 'organizations/' || o.id::text || '/%')
  from public.organizations o
  on conflict (organization_id, measured_on) do update set
    players_active = excluded.players_active,
    users_active   = excluded.users_active,
    guardians      = excluded.guardians,
    files          = excluded.files,
    storage_bytes  = excluded.storage_bytes,
    measured_at    = now();
  get diagnostics v_filas = row_count;
  return v_filas;
end
$fn$;

revoke all on function private.measure_organization_usage() from public, anon, authenticated;

-- ------------------------------------------------------------- E2 · límites
--
-- Los límites viven en organizations.settings.limits, junto a los otros
-- ajustes que ya usa el club (whatsappNumber, ledgerCutoverOn…). No hace falta
-- tabla nueva: un club tiene un plan, no muchos.
--
-- Un límite ausente significa SIN LÍMITE. Así, agregar esto no le cambia nada
-- a Tannery City hasta que alguien decida ponerle uno.

create or replace function private.organization_usage_status(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','app','public','private'
as $fn$
declare
  v_uso     app.organization_usage;
  v_limites jsonb;
  v_salida  jsonb := '[]'::jsonb;
  v_metrica text;
  v_valor   bigint;
  v_tope    bigint;
begin
  select * into v_uso from app.organization_usage
   where organization_id = p_organization_id
   order by measured_on desc limit 1;
  if not found then return jsonb_build_object('medido', false, 'metricas', '[]'::jsonb); end if;

  select coalesce(o.settings->'limits', '{}'::jsonb) into v_limites
    from public.organizations o where o.id = p_organization_id;

  foreach v_metrica in array array['players_active','users_active','guardians','storage_bytes'] loop
    v_valor := case v_metrica
                 when 'players_active' then v_uso.players_active
                 when 'users_active'   then v_uso.users_active
                 when 'guardians'      then v_uso.guardians
                 else v_uso.storage_bytes end;
    v_tope := nullif(v_limites->>v_metrica, '')::bigint;
    v_salida := v_salida || jsonb_build_object(
      'metrica', v_metrica,
      'valor',   v_valor,
      'tope',    v_tope,
      'porcentaje', case when v_tope is null or v_tope = 0 then null
                         else round((v_valor::numeric / v_tope) * 100, 1) end,
      -- Sin tope no hay nivel: un club sin límite nunca se pinta de rojo.
      'nivel', case
                 when v_tope is null or v_tope = 0 then 'sin_limite'
                 when v_valor >= v_tope            then 'excedido'
                 when v_valor >= v_tope * 0.90     then 'aviso_90'
                 when v_valor >= v_tope * 0.75     then 'aviso_75'
                 when v_valor >= v_tope * 0.50     then 'aviso_50'
                 else 'ok' end);
  end loop;

  return jsonb_build_object('medido', true, 'dia', v_uso.measured_on, 'metricas', v_salida);
end
$fn$;

revoke all on function private.organization_usage_status(uuid) from public, anon, authenticated;

create or replace function public.v2_organization_usage(organization_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path to 'pg_catalog','private'
as $fn$
  select private.organization_usage_status(organization_id)
$fn$;

grant execute on function public.v2_organization_usage(uuid) to authenticated;

-- --------------------------------------------------------------- E3 · avisar
--
-- El aviso se escribe como evento de dominio, que es el canal que el sistema ya
-- tiene. NO se avisa dos veces el mismo nivel el mismo día: nadie quiere
-- cuatro notificaciones de lo mismo.

create or replace function private.raise_usage_alerts()
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog','app','public','private'
as $fn$
declare
  v_org     record;
  v_estado  jsonb;
  v_m       jsonb;
  v_avisos  integer := 0;
begin
  for v_org in select id from public.organizations loop
    v_estado := private.organization_usage_status(v_org.id);
    if not coalesce((v_estado->>'medido')::boolean, false) then continue; end if;

    for v_m in select * from jsonb_array_elements(v_estado->'metricas') loop
      if (v_m->>'nivel') in ('aviso_50','aviso_75','aviso_90','excedido') then
        if not exists (
          select 1 from app.domain_events de
           where de.organization_id = v_org.id
             and de.event_type = 'OrganizationUsageThresholdReached'
             and de.payload->>'metrica' = (v_m->>'metrica')
             and de.payload->>'nivel'   = (v_m->>'nivel')
             and de.occurred_at::date   = current_date
        ) then
          insert into app.domain_events
            (organization_id, event_type, aggregate_type, aggregate_id, payload, actor)
          values (v_org.id, 'OrganizationUsageThresholdReached', 'organization', v_org.id,
                  v_m || jsonb_build_object('dia', v_estado->>'dia'), 'system');
          v_avisos := v_avisos + 1;
        end if;
      end if;
    end loop;
  end loop;
  return v_avisos;
end
$fn$;

revoke all on function private.raise_usage_alerts() from public, anon, authenticated;

-- Una vez al día, a las 06:10 UTC. Medir primero, avisar después.
select cron.schedule('tanneros-usage-metering', '10 6 * * *',
  $$select private.measure_organization_usage(); select private.raise_usage_alerts();$$);

commit;


-- ============================================================================
-- REVERSO · deshace todo lo de arriba sin tocar ningún dato del club.
-- ============================================================================
--
-- begin;
--   select cron.unschedule('tanneros-usage-metering');
--   drop function if exists public.v2_organization_usage(uuid);
--   drop function if exists private.raise_usage_alerts();
--   drop function if exists private.organization_usage_status(uuid);
--   drop function if exists private.measure_organization_usage();
--   delete from app.domain_events where event_type = 'OrganizationUsageThresholdReached';
--   drop table if exists app.organization_usage;
-- commit;
--
-- La tabla sólo guarda mediciones: borrarla no pierde nada del club. Los
-- límites en organizations.settings.limits no los toca esta migración, así que
-- tampoco hay nada que revertir ahí.
