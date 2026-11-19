-- h92 · De qué es cada pago (13/11/2026)
--
-- Presidencia, sobre la lista "Hoy" de Taquilla: "que se especifique de qué es
-- cada pago, por favor". Las tarjetas decían "Abono pedido PED-2026-00024" o
-- "Cobro general" y había que abrir otra pantalla para saber qué se pagó.
--
-- Función nueva y sólo de lectura: para una lista de pagos devuelve, por cada
-- uno, sus renglones en palabras:
--   · los cargos que liquidó  (Mensualidad noviembre 2026, Recargo, Inscripción…)
--   · las prendas del pedido  (Kit Dúo: Short (T. 16), Jersey "Black Edition"…)
--
-- No cambia la lista ni ningún dato. Ve lo mismo que la lista de Taquilla:
-- Presidencia y Contabilidad todos los pagos; los demás, sólo los que
-- registraron ellos. Máximo 300 pagos por llamada.
begin;

create or replace function private.query_payment_details(p_organization_id uuid, p_payment_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_yo uuid := (select auth.uid());
  v_todos boolean;
  v_ids uuid[] := coalesce(p_payment_ids[1:300], '{}');
begin
  if not (private.has_module_access(p_organization_id,'taquilla',false)
       or private.has_module_access(p_organization_id,'accounting',false)
       or private.has_module_access(p_organization_id,'cobranza',false)) then
    raise exception 'Not authorized';
  end if;
  v_todos := private.is_presidency(p_organization_id)
          or private.has_module_access(p_organization_id,'accounting',false);

  return coalesce((
    select jsonb_object_agg(p.id::text, d.renglones)
    from app.payments p
    cross join lateral (
      select coalesce(jsonb_agg(x.texto order by x.orden, x.texto), '[]'::jsonb) as renglones
      from (
        -- Los cargos que este pago liquidó.
        select distinct 1 as orden, nullif(btrim(ch.concept), '') as texto
        from app.payment_allocations pa
        join app.charges ch on ch.id = pa.charge_id
        where pa.payment_id = p.id and pa.organization_id = p_organization_id and pa.status = 'posted'
        union all
        -- Las prendas del pedido que este pago abonó.
        select 2, btrim(oi.description
                 || case when nullif(btrim(coalesce(oi.attributes->>'talla', oi.attributes->>'size', '')), '') is not null
                         then ' (T. ' || btrim(coalesce(oi.attributes->>'talla', oi.attributes->>'size')) || ')' else '' end
                 || case when oi.quantity > 1 then ' x' || oi.quantity else '' end)
        from app.order_payments op
        join app.order_items oi on oi.order_id = op.order_id
        where op.payment_id = p.id and op.organization_id = p_organization_id
      ) x
      where x.texto is not null
    ) d
    where p.organization_id = p_organization_id
      and p.id = any(v_ids)
      and (v_todos or p.created_by_user_id = v_yo)
  ), '{}'::jsonb);
end $$;
revoke all on function private.query_payment_details(uuid, uuid[]) from public, anon, authenticated;

create or replace function public.v2_payment_details(organization_id uuid, payment_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  return private.query_payment_details(v2_payment_details.organization_id, v2_payment_details.payment_ids);
end $$;
revoke all on function public.v2_payment_details(uuid, uuid[]) from public, anon;
grant execute on function public.v2_payment_details(uuid, uuid[]) to authenticated;

commit;
