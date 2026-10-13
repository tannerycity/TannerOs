-- h5h: domain_events guarda la hora en occurred_at, no en created_at (h5g
-- usaba created_at y la vista de Dirección truena). Se corrige en las dos.
do $$
declare d text; n0 text;
begin
  d := pg_get_functiondef('private.query_direction_week(uuid,date)'::regprocedure); n0 := d;
  d := replace(d, 'order by e.created_at desc limit 1', 'order by e.occurred_at desc limit 1');
  if d = n0 then raise exception 'No se pudo parchar query_direction_week'; end if;
  execute d;
  d := pg_get_functiondef('private.training_week_history(uuid,uuid,date)'::regprocedure); n0 := d;
  d := replace(replace(d, '''at'', e.created_at', '''at'', e.occurred_at'), 'order by e.created_at desc)', 'order by e.occurred_at desc)');
  if d = n0 or position('created_at' in d) > 0 then raise exception 'No se pudo parchar training_week_history'; end if;
  execute d;
end $$;