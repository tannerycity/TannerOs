-- Cobro de la suscripción a los clubes. 2/4: las reglas (emitir,
-- recargo, solo lectura y avisos).

create or replace function private.club_invoice_total(i public.club_invoices)
returns numeric language sql immutable set search_path = '' as $$ select i.base_mxn + i.extras_mxn + i.late_fee_mxn $$;

-- ¿Puede el staff de este club guardar? null = sí; si no, por qué.
create or replace function private.club_write_hold(p_organization_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when coalesce((o.settings->>'demo')::boolean, false) and not coalesce((o.settings->>'demoEditable')::boolean, false) then 'demo'
    when o.settings ? 'billingHold' then 'pago'
  end
  from public.organizations o where o.id = p_organization_id
$$;
revoke all on function private.club_invoice_total(public.club_invoices), private.club_write_hold(uuid) from public, anon, authenticated;

-- Avisos a Presidencia del club (una vez por cobro y tipo).
create or replace function private.club_invoice_notify(p_invoice uuid, p_kind text, p_title text, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_i public.club_invoices%rowtype; r record;
begin
  update public.club_invoices set notices = notices || jsonb_build_object(p_kind, now())
   where id = p_invoice and not (notices ? p_kind) returning * into v_i;
  if v_i.id is null then return; end if;
  for r in select m.user_id from public.organization_memberships m
           where m.organization_id = v_i.organization_id and m.active and (m.role = 'Presidencia' or m.is_owner) loop
    insert into app.announcements(organization_id, title, body, source, audience_type, audience_value, expires_at)
    values (v_i.organization_id, p_title, p_body, 'plataforma', 'user', r.user_id::text, now() + interval '10 days');
    perform private.notify_push(v_i.organization_id, p_title, p_body, 'user', r.user_id::text, '/admin/');
  end loop;
end $$;
revoke all on function private.club_invoice_notify(uuid, text, text, text) from public, anon, authenticated;

-- Pone o quita el candado según lo que deba el club hoy.
create or replace function private.refresh_club_hold(p_organization_id uuid, p_today date)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_inv uuid;
begin
  select id into v_inv from public.club_invoices
   where organization_id = p_organization_id and status = 'pending' and read_only_date <= p_today
   order by period limit 1;
  if v_inv is null then
    update public.organizations set settings = settings - 'billingHold' where id = p_organization_id and settings ? 'billingHold';
    return false;
  end if;
  update public.organizations set settings = settings || jsonb_build_object('billingHold', jsonb_build_object('invoiceId', v_inv, 'since', now()))
   where id = p_organization_id and not (settings ? 'billingHold');
  return true;
end $$;
revoke all on function private.refresh_club_hold(uuid, date) from public, anon, authenticated;

-- El ciclo diario. Idempotente: se puede correr las veces que sea.
create or replace function private.run_club_billing(p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_cfg jsonb := coalesce((select value from public.platform_settings where key = 'billing'), '{}'::jsonb);
  v_due int := least(greatest(coalesce(nullif(v_cfg->>'dueDay','')::int, 5), 1), 28);
  v_late numeric := coalesce(nullif(v_cfg->>'lateFeeMxn','')::numeric, 100);
  v_ro int := least(greatest(coalesce(nullif(v_cfg->>'readOnlyDay','')::int, 15), 1), 28);
  v_hoy date := (p_now at time zone 'America/Mexico_City')::date;
  v_periodo date := date_trunc('month', (p_now at time zone 'America/Mexico_City'))::date;
  r record; i record; v_inv uuid; v_n int := 0; v_rec int := 0; v_bloq int := 0;
  v_max int; v_extra int;
begin
  if v_ro <= v_due then v_ro := v_due + 1; end if;

  -- 1. Emitir el cobro del mes a cada club que paga y ya existía al empezar el mes.
  for r in
    select o.id org, pl.code, pl.metadata pm, coalesce((o.settings->>'founder')::boolean, false) founder,
           (select count(*) from app.players x where x.organization_id = o.id and x.status = 'active' and x.archived_at is null) activos
    from public.organizations o
    join lateral (select s.plan_id from public.subscriptions s where s.organization_id = o.id and s.status = 'active' order by s.created_at desc limit 1) s on true
    join public.plans pl on pl.id = s.plan_id
    where o.status = 'active' and coalesce((pl.metadata->>'forSale')::boolean, false)
      and not coalesce((o.settings->>'demo')::boolean, false)
      and (o.created_at at time zone 'America/Mexico_City')::date < v_periodo
      and not exists (select 1 from public.club_invoices ci where ci.organization_id = o.id and ci.period = v_periodo)
  loop
    v_max := nullif(r.pm->>'maxPlayers', '')::int;
    v_extra := case when v_max is null then 0 else greatest(r.activos - v_max, 0) end;
    insert into public.club_invoices(organization_id, period, plan_code, base_mxn, extra_players, extras_mxn, due_date, read_only_date)
    values (r.org, v_periodo, r.code, coalesce(nullif(r.pm->>'priceMxn','')::numeric, 0) * case when r.founder then 0.5 else 1 end,
            v_extra, v_extra * coalesce(nullif(r.pm->>'extraPlayerMxn','')::numeric, 0),
            v_periodo + (v_due - 1), v_periodo + (v_ro - 1))
    on conflict (organization_id, period) do nothing
    returning id into v_inv;
    if v_inv is not null then v_n := v_n + 1; end if;
  end loop;

  -- 2. Lo pendiente: avisos, recargo y candado.
  for i in select ci.*, private.club_invoice_total(ci) total from public.club_invoices ci where ci.status = 'pending' order by ci.period loop
    perform private.club_invoice_notify(i.id, 'emitido', 'Mensualidad de TannerOS',
      format('Tu mensualidad de %s es de %s. Págala a más tardar el %s; después lleva %s de recargo.',
        (array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'])[extract(month from i.period)::int],
        to_char(i.total, 'FM$999,999,990'), to_char(i.due_date, 'DD/MM'), to_char(v_late, 'FM$999,990')));
    if v_hoy = i.due_date then
      perform private.club_invoice_notify(i.id, 'vence', 'Hoy vence tu mensualidad',
        format('Hoy es el último día para pagar %s sin recargo.', to_char(i.total, 'FM$999,999,990')));
    end if;
    if v_hoy > i.due_date and i.late_fee_mxn = 0 and v_late > 0 then
      update public.club_invoices set late_fee_mxn = v_late, updated_at = now() where id = i.id;
      v_rec := v_rec + 1;
      perform private.club_invoice_notify(i.id, 'recargo', 'Se sumó el recargo',
        format('Tu mensualidad ya lleva %s de recargo: total %s. Si no se paga, el %s el club queda en solo lectura.',
          to_char(v_late, 'FM$999,990'), to_char(i.total + v_late, 'FM$999,999,990'), to_char(i.read_only_date, 'DD/MM')));
    end if;
    if v_hoy >= i.read_only_date then
      if private.refresh_club_hold(i.organization_id, v_hoy) then
        v_bloq := v_bloq + 1;
        perform private.club_invoice_notify(i.id, 'bloqueo', 'Tu club quedó en solo lectura',
          'Tu equipo puede ver todo, pero no guardar cambios, hasta registrar el pago de la mensualidad. Las familias y la tienda siguen igual.');
      end if;
    end if;
  end loop;
  return jsonb_build_object('emitidos', v_n, 'recargos', v_rec, 'bloqueados', v_bloq);
end $$;
revoke all on function private.run_club_billing(timestamptz) from public, anon, authenticated;
