-- Cobro de la suscripción a los clubes. 3/4: el portal registra pagos y
-- configura; el club ve su cobro y si está en solo lectura.

-- Portal: registrar el pago (opcional: perdonar el recargo).
create or replace function private.record_club_payment(p_invoice uuid, p_method text, p_reference text, p_waive_late_fee boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_i public.club_invoices%rowtype; v_hold boolean;
begin
  if not private.is_platform_admin() then raise exception 'Not authorized'; end if;
  update public.club_invoices set status = 'paid', paid_at = now(), paid_by = (select auth.uid()),
         method = coalesce(nullif(btrim(p_method), ''), 'Transferencia'), reference = nullif(btrim(p_reference), ''),
         late_fee_mxn = case when p_waive_late_fee then 0 else late_fee_mxn end, updated_at = now()
   where id = p_invoice and status = 'pending' returning * into v_i;
  if v_i.id is null then raise exception 'Ese cobro ya no está pendiente'; end if;
  v_hold := private.refresh_club_hold(v_i.organization_id, (now() at time zone 'America/Mexico_City')::date);
  perform private.club_invoice_notify(v_i.id, 'pagado', 'Pago recibido',
    format('Recibimos tu pago de %s. Gracias.', to_char(private.club_invoice_total(v_i), 'FM$999,999,990'))
    || case when v_hold then '' else ' Tu club tiene todo habilitado.' end);
  return jsonb_build_object('invoiceId', v_i.id, 'total', private.club_invoice_total(v_i), 'readOnly', v_hold);
end $$;
revoke all on function private.record_club_payment(uuid, text, text, boolean) from public, anon, authenticated;

create or replace function private.update_platform_billing(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb; v_clabe text := nullif(regexp_replace(coalesce(p->>'clabe', ''), '\D', '', 'g'), '');
begin
  if not private.is_platform_admin() then raise exception 'Not authorized'; end if;
  if v_clabe is not null and length(v_clabe) <> 18 then raise exception 'La CLABE lleva 18 dígitos'; end if;
  v := jsonb_build_object(
    'dueDay', least(greatest(coalesce(nullif(p->>'dueDay','')::int, 5), 1), 28),
    'lateFeeMxn', greatest(coalesce(nullif(p->>'lateFeeMxn','')::numeric, 100), 0),
    'readOnlyDay', least(greatest(coalesce(nullif(p->>'readOnlyDay','')::int, 15), 2), 28),
    'bank', nullif(btrim(p->>'bank'), ''), 'clabe', v_clabe, 'holder', nullif(btrim(p->>'holder'), ''));
  if (v->>'readOnlyDay')::int <= (v->>'dueDay')::int then raise exception 'El día de solo lectura va después del vencimiento'; end if;
  insert into public.platform_settings(key, value, updated_at, updated_by) values ('billing', v, now(), (select auth.uid()))
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;
  return v;
end $$;
revoke all on function private.update_platform_billing(jsonb) from public, anon, authenticated;

-- Para la barra del club: ¿se puede guardar? Cualquier miembro activo lo ve.
create or replace function private.my_access_mode(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_hold text;
begin
  if not private.is_active_member(p_organization_id) then raise exception 'Not authorized'; end if;
  v_hold := private.club_write_hold(p_organization_id);
  if v_hold is null or private.is_platform_admin() then return jsonb_build_object('mode', 'normal'); end if;
  return jsonb_build_object('mode', 'solo_lectura', 'reason', v_hold);
end $$;
revoke all on function private.my_access_mode(uuid) from public, anon, authenticated;

-- "Tu plan" en Administración: el cobro del mes y a dónde pagar.
create or replace function private.my_club_invoice(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_i public.club_invoices%rowtype; v_cfg jsonb := (select value from public.platform_settings where key = 'billing');
begin
  if not private.has_module_access(p_organization_id, 'admin', false) then raise exception 'Not authorized'; end if;
  select * into v_i from public.club_invoices where organization_id = p_organization_id and status <> 'void'
   order by (status = 'pending') desc, period desc limit 1;
  if v_i.id is null then return null; end if;
  return jsonb_build_object('id', v_i.id, 'period', v_i.period, 'status', v_i.status, 'baseMxn', v_i.base_mxn,
    'extrasMxn', v_i.extras_mxn, 'lateFeeMxn', v_i.late_fee_mxn, 'total', private.club_invoice_total(v_i),
    'dueDate', v_i.due_date, 'readOnlyDate', v_i.read_only_date, 'paidAt', v_i.paid_at,
    'readOnly', private.club_write_hold(p_organization_id) = 'pago',
    'payTo', jsonb_build_object('bank', v_cfg->>'bank', 'clabe', v_cfg->>'clabe', 'holder', v_cfg->>'holder'));
end $$;
revoke all on function private.my_club_invoice(uuid) from public, anon, authenticated;

-- Portal: los cobros (pendientes y del mes) y la configuración.
create or replace function private.platform_invoices()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'Not authorized'; end if;
  return jsonb_build_object(
    'settings', coalesce((select value from public.platform_settings where key = 'billing'), '{}'::jsonb),
    'invoices', coalesce((select jsonb_agg(jsonb_build_object('id', ci.id, 'organizationId', ci.organization_id, 'club', o.name,
        'period', ci.period, 'status', ci.status, 'total', private.club_invoice_total(ci), 'lateFeeMxn', ci.late_fee_mxn,
        'dueDate', ci.due_date, 'readOnlyDate', ci.read_only_date, 'paidAt', ci.paid_at, 'method', ci.method,
        'readOnly', o.settings ? 'billingHold') order by (ci.status = 'pending') desc, ci.period desc, o.name)
      from public.club_invoices ci join public.organizations o on o.id = ci.organization_id
      where ci.status = 'pending' or ci.period >= (date_trunc('month', now() at time zone 'America/Mexico_City') - interval '2 months')::date), '[]'::jsonb));
end $$;
revoke all on function private.platform_invoices() from public, anon, authenticated;

create or replace function public.v2_record_club_payment(invoice_id uuid, method text default null, reference text default null, waive_late_fee boolean default false)
returns jsonb language sql security definer set search_path = '' as $$ select private.record_club_payment(invoice_id, method, reference, waive_late_fee) $$;
create or replace function public.v2_update_platform_billing(settings jsonb)
returns jsonb language sql security definer set search_path = '' as $$ select private.update_platform_billing(settings) $$;
create or replace function public.v2_my_access_mode(organization_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$ select private.my_access_mode(organization_id) $$;
create or replace function public.v2_my_club_invoice(organization_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$ select private.my_club_invoice(organization_id) $$;
create or replace function public.v2_platform_invoices()
returns jsonb language sql stable security definer set search_path = '' as $$ select private.platform_invoices() $$;
revoke all on function public.v2_record_club_payment(uuid, text, text, boolean), public.v2_update_platform_billing(jsonb),
  public.v2_my_access_mode(uuid), public.v2_my_club_invoice(uuid), public.v2_platform_invoices() from public, anon;
grant execute on function public.v2_record_club_payment(uuid, text, text, boolean), public.v2_update_platform_billing(jsonb),
  public.v2_my_access_mode(uuid), public.v2_my_club_invoice(uuid), public.v2_platform_invoices() to authenticated;
