-- Cobro de la suscripción a los clubes. 4/5: el candado de solo lectura.
--
-- Solo lectura es un candado en la base (trigger en las tablas del club), no
-- en cada pantalla: así ninguna función que escriba se queda fuera.

-- El candado. Sólo frena al staff del club (miembro activo) que no es
-- administrador de la plataforma; cron, familias y la tienda pública pasan.
create or replace function private.guard_club_read_only()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_uid uuid := (select auth.uid()); v_hold text;
begin
  if v_uid is null then return coalesce(new, old); end if;
  v_org := case when tg_op = 'DELETE' then old.organization_id else new.organization_id end;
  v_hold := private.club_write_hold(v_org);
  if v_hold is null then return coalesce(new, old); end if;
  if exists (select 1 from public.platform_admins where user_id = v_uid) then return coalesce(new, old); end if;
  if not exists (select 1 from public.organization_memberships m where m.organization_id = v_org and m.user_id = v_uid and m.active) then
    return coalesce(new, old);
  end if;
  if v_hold = 'demo' then raise exception 'Es una demo: puedes ver todo, pero los cambios no se guardan.'; end if;
  raise exception 'Tu club está en solo lectura por un pago pendiente de la mensualidad. Al registrarse el pago vuelve todo a la normalidad.';
end $$;
revoke all on function private.guard_club_read_only() from public, anon, authenticated;

-- Todas las tablas del club, menos lo personal (avisos vistos, notificaciones
-- del celular) y bitácoras que se escriben al consultar. Sin "drop trigger if
-- exists": sus 95 avisos (NOTICE) atoran la conexión del aplicador.
do $$
declare r record;
begin
  set local lock_timeout = '8s';
  for r in select c.table_name from information_schema.columns c
           join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
           where c.table_schema = 'app' and c.column_name = 'organization_id'
             and c.table_name not in ('push_subscriptions','announcement_seen','centro_tanner_search_log','audit_events','qa_runs','qa_results')
             and not exists (select 1 from pg_trigger g where g.tgname = 'zz_club_read_only' and g.tgrelid = format('app.%I', c.table_name)::regclass)
  loop
    execute format('create trigger zz_club_read_only before insert or update or delete on app.%I for each row execute function private.guard_club_read_only()', r.table_name);
  end loop;
end $$;
