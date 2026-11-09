-- h66 · Cobranza sencilla (08/11/2026)
--
-- Presidencia (con el PDF de otra plataforma): "me gusta la simplicidad...
-- toma lo mejor... pantalla sencillita... esa información me gustaría que la
-- dejaras ahí". Lo que se toma: % cobrado del mes, Esperado / Cobrado / Por
-- vencer / Atrasado, y por familia "Recordar" y "Ya pagó".
--
-- v2_collection_board(org): una sola llamada con el resumen del mes y cada
-- Tanner activo con su estado (atrasado, por vencer, al día), cuánto debe, el
-- más antiguo, su último pago y el teléfono del tutor que paga (para
-- "Recordar" por WhatsApp). Los dados de baja no entran a la cobranza.

create or replace function public.v2_collection_board(organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path to ''
as $$
declare
  v_org uuid := v2_collection_board.organization_id;
  v_hoy date := (now() at time zone 'America/Mexico_City')::date;
  v_mes date := date_trunc('month', (now() at time zone 'America/Mexico_City'))::date;
  v_res jsonb; v_filas jsonb;
begin
  if not (private.is_presidency(v_org) or private.has_module_access(v_org, 'billing', false)
          or private.has_module_access(v_org, 'accounting', false)) then
    raise exception 'Not authorized';
  end if;

  -- Del mes: lo que se esperaba cobrar (cargos con periodo de este mes, sin
  -- recargos), lo cobrado de eso, y lo que todavía no vence.
  select jsonb_build_object(
      'month', v_mes,
      'expected', coalesce(sum(cb.net_amount), 0),
      'collected', coalesce(sum(cb.net_amount - cb.balance_due), 0),
      'upcoming', coalesce(sum(cb.balance_due) filter (where ch.due_date >= v_hoy), 0))
    into v_res
  from app.charges ch join app.charge_balances cb on cb.id = ch.id
  join app.players p on p.id = ch.player_id
  where ch.organization_id = v_org and ch.status = 'posted' and ch.charge_type <> 'late_fee'
    and ch.billing_period = v_mes and p.status = 'active' and p.archived_at is null;

  -- Atrasado: todo lo vencido de Tanners activos, de cualquier mes.
  v_res := v_res || jsonb_build_object('overdue', coalesce((
    select sum(cb.balance_due) from app.charges ch join app.charge_balances cb on cb.id = ch.id
    join app.players p on p.id = ch.player_id
    where ch.organization_id = v_org and ch.status = 'posted' and cb.balance_due > 0.004
      and ch.due_date < v_hoy and p.status = 'active' and p.archived_at is null), 0));

  select coalesce(jsonb_agg(f order by f->>'orden', f->>'name'), '[]') into v_filas from (
    select jsonb_build_object(
      'playerId', p.id,
      'name', trim(concat_ws(' ', p.first_name, p.last_name)),
      'category', p.category,
      'photoThumbPath', p.photo_thumb_path, 'photoBucket', p.photo_bucket,
      'overdue', coalesce(d.vencido, 0), 'upcoming', coalesce(d.por_vencer, 0),
      'oldestDue', d.mas_viejo, 'nextDue', d.proximo,
      'lastPayment', (select max(py.payment_date) from app.payments py where py.organization_id = v_org and py.player_id = p.id and py.status = 'posted' and py.voided_at is null),
      'state', case when coalesce(d.vencido, 0) > 0.004 then 'atrasado' when coalesce(d.por_vencer, 0) > 0.004 then 'por_vencer' else 'al_dia' end,
      'orden', case when coalesce(d.vencido, 0) > 0.004 then '1' when coalesce(d.por_vencer, 0) > 0.004 then '2' else '3' end,
      'guardian', g.nombre, 'phone', g.phone) as f
    from app.players p
    join app.billing_profiles bp on bp.player_id = p.id and bp.organization_id = v_org and bp.status = 'active'
    left join lateral (
      select sum(cb.balance_due) filter (where ch.due_date < v_hoy) as vencido,
             sum(cb.balance_due) filter (where ch.due_date >= v_hoy) as por_vencer,
             min(ch.due_date) filter (where ch.due_date < v_hoy) as mas_viejo,
             min(ch.due_date) filter (where ch.due_date >= v_hoy) as proximo
      from app.charges ch join app.charge_balances cb on cb.id = ch.id
      where ch.organization_id = v_org and ch.player_id = p.id and ch.status = 'posted' and cb.balance_due > 0.004) d on true
    left join lateral (
      select trim(concat_ws(' ', gu.first_name, gu.last_name)) as nombre, gu.phone
      from app.player_guardians pg join app.guardians gu on gu.id = pg.guardian_id
      where pg.player_id = p.id and nullif(btrim(coalesce(gu.phone, '')), '') is not null
      order by pg.receives_billing desc nulls last, pg.is_primary desc nulls last, pg.created_at
      limit 1) g on true
    where p.organization_id = v_org and p.status = 'active' and p.archived_at is null) x(f);

  return v_res || jsonb_build_object(
    'percent', case when (v_res->>'expected')::numeric > 0
                    then round(100 * (v_res->>'collected')::numeric / (v_res->>'expected')::numeric) else null end,
    'players', v_filas);
end $$;

revoke all on function public.v2_collection_board(uuid) from public, anon;
grant execute on function public.v2_collection_board(uuid) to authenticated;
