-- Prueba 17 · FORMA + INVARIANTE · SÓLO LECTURA
--
-- h59: Por pedir. El pedido confirmado con la familia (en el grupo o en
-- persona) se pide pagado o no; sin confirmar no se pide.
--   - Existen las funciones nuevas y sólo las cáscaras v2_* se pueden llamar
--     desde la app (nunca anon).
--   - Los cuatro parches están puestos: order_readiness no pide pago a lo
--     confirmado, order_stage manda lo no confirmado a Revisar, el envío
--     exige la confirmación y pending_payment puede pasar a producción.
--   - Invariante: todo pedido que hoy está en Por pedir está confirmado y con
--     la huella vigente.
-- No inserta, no actualiza y no borra.

do $$
declare v_fallas text[] := '{}'; v_n int; v_mal int; v_src text;
begin
  -- 1. Las funciones existen.
  foreach v_src in array array['private.order_huella(uuid,uuid)', 'private.order_confirmada(uuid,uuid)',
      'private.confirm_order(uuid,uuid,text)', 'private.query_orders_sheet(uuid,jsonb)',
      'public.v2_confirm_order(uuid,uuid,text)', 'public.v2_orders_sheet(uuid,jsonb)'] loop
    if to_regprocedure(v_src) is null then v_fallas := v_fallas || ('falta ' || v_src); end if;
  end loop;
  if cardinality(v_fallas) > 0 then raise exception 'PRUEBA FALLÓ: %', array_to_string(v_fallas, '; '); end if;

  -- 2. Permisos.
  if has_function_privilege('anon', 'public.v2_confirm_order(uuid,uuid,text)', 'execute') then v_fallas := v_fallas || 'anon confirma'::text; end if;
  if has_function_privilege('anon', 'public.v2_orders_sheet(uuid,jsonb)', 'execute') then v_fallas := v_fallas || 'anon ve la hoja'::text; end if;
  if not has_function_privilege('authenticated', 'public.v2_confirm_order(uuid,uuid,text)', 'execute') then v_fallas := v_fallas || 'la app no puede confirmar'::text; end if;
  if not has_function_privilege('authenticated', 'public.v2_orders_sheet(uuid,jsonb)', 'execute') then v_fallas := v_fallas || 'la app no puede ver la hoja'::text; end if;
  if has_function_privilege('authenticated', 'private.confirm_order(uuid,uuid,text)', 'execute') then v_fallas := v_fallas || 'private.confirm_order abierta'::text; end if;

  -- 3. Los parches.
  select prosrc into v_src from pg_proc where oid = 'private.order_readiness(uuid,uuid)'::regprocedure;
  if position('order_confirmada' in v_src) = 0 then v_fallas := v_fallas || 'order_readiness sin parche'::text; end if;
  select prosrc into v_src from pg_proc where oid = 'private.order_stage(uuid,uuid)'::regprocedure;
  if position('Confirmar con la familia' in v_src) = 0 or position('''confirmado''' in v_src) = 0 then v_fallas := v_fallas || 'order_stage sin parche'::text; end if;
  select prosrc into v_src from pg_proc where oid = 'private.command_create_production_batch(uuid,jsonb,text,text)'::regprocedure;
  if position('no está confirmado' in v_src) = 0 or position('Order must be paid' in v_src) > 0 then v_fallas := v_fallas || 'el envío no exige confirmación'::text; end if;
  select prosrc into v_src from pg_proc where oid = 'private.command_update_order_status(uuid,uuid,text)'::regprocedure;
  if position($q$when 'pending_payment' then array['partial_payment','paid','in_production','cancelled']$q$ in v_src) = 0 then v_fallas := v_fallas || 'pending_payment no pasa a producción'::text; end if;
  if position('falta cobrar el saldo' in v_src) = 0 then v_fallas := v_fallas || 'se perdió: no se entrega sin pagar'::text; end if;

  -- 4. Invariante: lo que está en Por pedir está confirmado.
  select count(*), count(*) filter (where not private.order_confirmada(o.organization_id, o.id)) into v_n, v_mal
    from app.orders o
   where o.archived_at is null and o.status in ('draft', 'pending_payment', 'partial_payment', 'paid')
     and private.order_stage(o.organization_id, o.id)->>'stage' = 'para_proveedor';
  if v_mal > 0 then v_fallas := v_fallas || format('%s de %s en Por pedir sin confirmar', v_mal, v_n); end if;

  if cardinality(v_fallas) > 0 then raise exception 'PRUEBA FALLÓ: %', array_to_string(v_fallas, '; '); end if;
  raise notice 'PRUEBA OK: h59 completo; % pedidos en Por pedir, todos confirmados', v_n;
end $$;
