-- h5b: el servidor también respeta la casilla "Lleva nombre y número".
-- Antes decidía sólo por el nombre (jersey|uniforme|playera) y borraba el
-- nombre y número de lo demás. Ahora: la casilla manda; sin tocar, el nombre.
-- La manga sigue al nombre: un jersey sin estampado igual es corta o larga.
-- En "listo para producción", un jersey con la casilla apagada ya no pide
-- nombre ni número.
do $$
declare f text; d text; n0 text;
begin
  foreach f in array array[
    'private.portal_place_order(uuid,jsonb,text)',
    'private.public_create_cart_order(text,text,text,text,jsonb,text,jsonb)',
    'private.command_create_internal_order(uuid,text,text,text,text,jsonb,uuid)'] loop
    d := pg_get_functiondef(f::regprocedure); n0 := d;
    d := replace(d, $r$v_is_jersey := v_product.name ~* 'jersey|uniforme|playera';$r$,
                    $r$v_is_jersey := coalesce(v_product.personalizable, v_product.name ~* 'jersey|uniforme|playera');$r$);
    d := regexp_replace(d, $r$'manga',(\s*)case when v_is_jersey then$r$,
                    $r$'manga',\1case when v_product.name ~* 'jersey|uniforme|playera' then$r$, 'g');
    if d = n0 then raise exception 'No se pudo parchar %', f; end if;
    execute d;
  end loop;

  d := pg_get_functiondef('private.order_readiness(uuid,uuid)'::regprocedure); n0 := d;
  d := replace(d, $r$coalesce(i.description,'') ~* '(jersey|uniforme|playera)' and$r$,
                  $r$coalesce(i.description,'') ~* '(jersey|uniforme|playera)' and coalesce((select pr.personalizable from app.products pr where pr.id=i.product_id), true) and$r$);
  if d = n0 then raise exception 'No se pudo parchar order_readiness'; end if;
  execute d;
end $$;
