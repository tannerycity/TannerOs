-- h103 · Gráficas: picarle y ver el desglose (25/11/2026).
-- Presidencia: "que sea interactivo... si le picas desglosas y ya ves todo...
-- para que llegues a todo". Una sola función de solo lectura: dada una barra
-- de las gráficas (h102), regresa sus renglones.
--   beneficiario   clave = id del beneficiario, 'otro', o 'id|AAAA-MM' (nómina de un mes)
--   egresoCategoria clave = categoría del egreso
--   ingresoTipo     clave = tipo (Mensualidad, Uniformes y tienda...)
--   ingresoCategoria clave = categoría del jugador (T6, Baby Tanner... o 'Sin jugador')
--   adeudoCategoria  clave = categoría del jugador; un renglón por jugador
--   adeudoTipo       clave = tipo de cargo; un renglón por jugador
-- Máximo 300 renglones. Mismo permiso que las gráficas (Contabilidad).

create or replace function private.query_finance_detail(p_organization_id uuid, p_desde date, p_hasta date, p_dimension text, p_clave text)
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog', 'app', 'private' as $function$
declare
  v_desde date := coalesce(p_desde, '2000-01-01'); v_hasta date := coalesce(p_hasta, current_date);
  v_clave text := coalesce(p_clave, ''); v_payee uuid; v_mes text;
begin
  if not private.has_module_access(p_organization_id, 'accounting', false) then raise exception 'Not authorized'; end if;
  if p_dimension not in ('beneficiario', 'egresoCategoria', 'ingresoTipo', 'ingresoCategoria', 'adeudoCategoria', 'adeudoTipo') then
    raise exception 'Invalid dimension';
  end if;

  if p_dimension in ('beneficiario', 'egresoCategoria') then
    if p_dimension = 'beneficiario' then
      v_mes := nullif(split_part(v_clave, '|', 2), '');
      v_payee := case when split_part(v_clave, '|', 1) ~ '^[0-9a-f-]{36}$' then split_part(v_clave, '|', 1)::uuid end;
    end if;
    return coalesce((select jsonb_agg(jsonb_build_object('fecha', e.expense_date, 'concepto', e.concept, 'categoria', e.category,
        'quien', e.supplier_name, 'metodo', e.method, 'monto', e.amount) order by e.expense_date desc, e.created_at desc)
      from (select * from app.expenses e
             where e.organization_id = p_organization_id and e.voided_at is null and e.status = 'posted'
               and e.expense_date between v_desde and v_hasta
               and case p_dimension
                     when 'beneficiario' then (case when v_clave = 'otro' then e.payee_id is null else e.payee_id = v_payee end)
                                              and (v_mes is null or to_char(e.expense_date, 'YYYY-MM') = v_mes)
                     else coalesce(e.category, 'Sin categoría') = v_clave end
             order by e.expense_date desc limit 300) e), '[]'::jsonb);
  end if;

  if p_dimension in ('ingresoTipo', 'ingresoCategoria') then
    return coalesce((select jsonb_agg(jsonb_build_object('fecha', x.payment_date, 'jugador', x.jugador, 'categoria', x.player_category,
        'concepto', coalesce(nullif(x.concept, ''), x.category), 'metodo', x.method, 'monto', x.amount) order by x.payment_date desc)
      from (select py.*, pl.category player_category, nullif(trim(concat_ws(' ', pl.first_name, pl.last_name)), '') jugador,
              case when py.payment_purpose = 'commerce' or py.category in ('Uniforme', 'Pedido Tienda', 'Tienda') then 'Uniformes y tienda'
                   when py.payment_purpose = 'program' then 'Cursos y programas'
                   when py.payment_purpose = 'registration' or py.category ilike 'inscrip%' then 'Inscripción'
                   when py.category ilike 'mensualidad%' then 'Mensualidad'
                   when py.category ilike 'academia%' then 'Academias'
                   when py.category ilike 'patrocin%' then 'Patrocinio'
                   else 'Otros ingresos' end tipo
              from app.payments py left join app.players pl on pl.id = py.player_id
             where py.organization_id = p_organization_id and py.voided_at is null and py.status = 'posted' and py.amount > 0
               and py.payment_date between v_desde and v_hasta) x
     where case p_dimension when 'ingresoTipo' then x.tipo = v_clave else coalesce(x.player_category, 'Sin jugador') = v_clave end
     limit 300), '[]'::jsonb);
  end if;

  -- Adeudos: hoy, un renglón por jugador, el que más debe primero.
  return coalesce((select jsonb_agg(jsonb_build_object('jugador', jugador, 'categoria', categoria, 'cargos', cargos, 'saldo', saldo,
      'desde', desde, 'conceptos', conceptos) order by saldo desc)
    from (select coalesce(nullif(trim(concat_ws(' ', pl.first_name, pl.last_name)), ''), 'Sin jugador') jugador,
            coalesce(pl.category, 'Sin categoría') categoria, count(*) cargos, sum(cb.balance_due) saldo, min(cb.due_date) desde,
            (array_agg(cb.concept order by cb.due_date))[1:3] conceptos
            from app.charge_balances cb left join app.players pl on pl.id = cb.player_id
           where cb.organization_id = p_organization_id and cb.computed_status in ('pending', 'partial') and cb.balance_due > 0
             and case p_dimension
                   when 'adeudoCategoria' then coalesce(pl.category, 'Sin categoría') = v_clave
                   else (case cb.charge_type when 'monthly_fee' then 'Mensualidad' when 'late_fee' then 'Recargos' when 'registration' then 'Inscripción'
                         when 'academy_fee' then 'Academias' when 'parking_pass' then 'Estacionamiento' else 'Otro' end) = v_clave end
           group by 1, 2 order by sum(cb.balance_due) desc limit 300) t), '[]'::jsonb);
end $function$;

create or replace function public.v2_finance_detail(organization_id uuid, desde date, hasta date, dimension text, clave text) returns jsonb
language sql stable security definer set search_path to 'pg_catalog', 'private' as $function$
  select private.query_finance_detail(organization_id, desde, hasta, dimension, clave) $function$;
revoke all on function private.query_finance_detail(uuid, date, date, text, text) from public, anon, authenticated;
revoke all on function public.v2_finance_detail(uuid, date, date, text, text) from public, anon;
grant execute on function public.v2_finance_detail(uuid, date, date, text, text) to authenticated;
