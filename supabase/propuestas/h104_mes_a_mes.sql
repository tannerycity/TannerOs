-- h104 · Métricas: mes a mes (26/11/2026).
-- Presidencia: "que sea interactivo, bien fácil... como si fuera una web de
-- $50,000". La gráfica principal de Métricas: lo que entró y lo que salió
-- cada mes. Una sola función de solo lectura, con los mismos filtros que
-- v2_finance_analytics (h102): pagos publicados y no anulados, egresos
-- publicados y no anulados. Mismo permiso (Contabilidad). Sólo totales por
-- mes: ningún nombre.

create or replace function private.query_finance_monthly(p_organization_id uuid, p_desde date, p_hasta date)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog', 'app', 'private' as $function$
declare
  v_desde date := coalesce(p_desde, '2000-01-01'); v_hasta date := coalesce(p_hasta, current_date);
begin
  if not private.has_module_access(p_organization_id, 'accounting', false) then raise exception 'Not authorized'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('mes', mes, 'ingresos', ingresos, 'egresos', egresos) order by mes) from (
    select coalesce(i.mes, e.mes) mes, coalesce(i.total, 0) ingresos, coalesce(e.total, 0) egresos
      from (select to_char(date_trunc('month', py.payment_date), 'YYYY-MM') mes, sum(py.amount) total
              from app.payments py
             where py.organization_id = p_organization_id and py.voided_at is null and py.status = 'posted' and py.amount > 0
               and py.payment_date between v_desde and v_hasta group by 1) i
      full join (select to_char(date_trunc('month', ex.expense_date), 'YYYY-MM') mes, sum(ex.amount) total
              from app.expenses ex
             where ex.organization_id = p_organization_id and ex.voided_at is null and ex.status = 'posted'
               and ex.expense_date between v_desde and v_hasta group by 1) e on e.mes = i.mes) t), '[]'::jsonb);
end $function$;

create or replace function public.v2_finance_monthly(organization_id uuid, desde date, hasta date) returns jsonb
language sql stable security definer set search_path to 'pg_catalog', 'private' as $function$
  select private.query_finance_monthly(organization_id, desde, hasta) $function$;
revoke all on function private.query_finance_monthly(uuid, date, date) from public, anon, authenticated;
revoke all on function public.v2_finance_monthly(uuid, date, date) from public, anon;
grant execute on function public.v2_finance_monthly(uuid, date, date) to authenticated;
