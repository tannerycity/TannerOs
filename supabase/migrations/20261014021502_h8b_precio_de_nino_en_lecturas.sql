-- h8 no parchó los productos de query_catalog ni de public_offerings: buscaba
-- 'priceKid' en toda la función y ya existía en los kits. Aquí se busca el de
-- productos (p.price_kid).
do $$
declare d text;
begin
  d := pg_get_functiondef('private.query_catalog(uuid)'::regprocedure);
  if position('p.price_kid' in d) = 0 then
    d := replace(d, '''price'',p.price,''oferta'',private.oferta_producto(p.id),', '''price'',p.price,''priceKid'',p.price_kid,''oferta'',private.oferta_producto(p.id),');
    if position('p.price_kid' in d) = 0 then raise exception 'No se pudo parchar query_catalog'; end if;
    execute d;
  end if;
  d := pg_get_functiondef('private.public_offerings(text)'::regprocedure);
  if position('p.price_kid' in d) = 0 then
    d := replace(d, '''photos'',p.photos,''photoPath''', '''priceKid'',p.price_kid,''photos'',p.photos,''photoPath''');
    if position('p.price_kid' in d) = 0 then raise exception 'No se pudo parchar public_offerings'; end if;
    execute d;
  end if;
end $$;
