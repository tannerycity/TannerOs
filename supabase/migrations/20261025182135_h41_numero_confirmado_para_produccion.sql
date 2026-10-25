-- h41 · Ningún número sale al proveedor sin confirmar (25/10/2026).
--
-- PED-2026-00011 se mandó a Tremor con el número sin confirmar por el club, y
-- estaba mal. order_readiness decide si un pedido está "Listo para
-- producción": lo usan el botón Enviar a producción y el corte del viernes
-- (command_create_production_batch). Ahora también exige que el número esté
-- confirmado, y que lo confirmado sea lo mismo que trae el pedido hoy (si se
-- cambió el número después de confirmarlo, hay que volver a confirmarlo).
--
-- Y deja de exigir nombre en el jersey: lo acordado el 22/10 es que en la
-- espalda va exactamente lo que pidieron, y sin nombre va sólo el número.

do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('private.order_readiness(uuid,uuid)'::regprocedure);
  v_def := replace(v_def,
    $a$  if v_missing_name>0 then v_missing:=array_append(v_missing,'falta nombre'); end if;
$a$, '');
  v_def := replace(v_def,
    $a$  if v_missing_number>0 then v_missing:=array_append(v_missing,'falta número'); end if;
$a$,
    $a$  if v_missing_number>0 then v_missing:=array_append(v_missing,'falta número'); end if;
  if exists(select 1 from app.order_items i where i.organization_id=p_organization_id and i.order_id=p_order_id
              and nullif(trim(coalesce(i.attributes->>'numero',i.attributes->>'number','')),'') is not null)
     and (v_order.metadata->'numeroConfirmado' is null
          or exists(select 1 from app.order_items i where i.organization_id=p_organization_id and i.order_id=p_order_id
                      and nullif(trim(coalesce(i.attributes->>'numero',i.attributes->>'number','')),'') is not null
                      and not (coalesce(v_order.metadata->'numeroConfirmado'->'numeros','[]'::jsonb)
                               ? trim(coalesce(i.attributes->>'numero',i.attributes->>'number',''))))) then
    v_missing:=array_append(v_missing,'número sin confirmar');
  end if;
$a$);
  if v_def not like '%número sin confirmar%' or v_def like '%''falta nombre''%' then
    raise exception 'h41: no se pudo parchar order_readiness';
  end if;
  execute v_def;
end $$;
