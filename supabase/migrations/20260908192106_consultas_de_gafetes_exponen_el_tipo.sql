-- El padrón y el detalle necesitan el tipo para mostrarlo, filtrarlo e imprimirlo.
do $$
declare d text; n text; v int:=0;
begin
  for d in select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace nsp on nsp.oid=p.pronamespace
           where nsp.nspname='private' and p.proname in ('query_parking_passes','query_parking_pass_detail')
  loop
    n := d;
    if position('''pass_type''' in n)>0 then continue; end if;
    -- el tipo viaja junto al portador en ambas consultas
    if position('''holder_kind'', pp.holder_kind,' in n)>0 then
      n := replace(n,'''holder_kind'', pp.holder_kind,','''holder_kind'', pp.holder_kind, ''pass_type'', pp.pass_type,');
    end if;
    -- precios por tipo, sin quitar 'price' que la pantalla ya lee
    if position('''price'', app.parking_pass_price(),' in n)>0 then
      n := replace(n,'''price'', app.parking_pass_price(),',
        '''price'', app.parking_pass_price(),'||chr(10)||
        '    ''prices'', jsonb_build_object(''tanner'', app.parking_pass_price(''tanner''), ''vip'', app.parking_pass_price(''vip'')),');
    end if;
    if n = d then continue; end if;
    execute n;
    v := v + 1;
  end loop;
  if v = 0 then raise exception 'No se actualizó ninguna consulta de gafetes'; end if;
  raise notice 'consultas actualizadas: %', v;
end $$;;
